import config from '../config.js';
import datasets, { project } from '../datasets.js';
import { makeScope } from './scope.js';
import { CELLS, projectCells, shiftCells, placeName } from './geo.js';
import { createEventsWorld } from './world-events.js';
import { createFieldWorld } from './world-field.js';
import { toWav } from './wav.js';
import { makeScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hub: $('hub'), player: $('player'), home: $('home'), tabs: $('tabs'), nasa: $('nasa'), header: document.querySelector('header'), start: $('start'),
  sceneCanvas: $('scene'), scopeCanvas: $('scope'),
  play: $('play'), ring: $('ring'), wav: $('wav'), info: $('info'), about: $('about'), close: $('close'), globe: $('globe'),
  time: $('time'), speed: $('speed'), date: $('date'), speedv: $('speedv'),
  live: $('live'), status: $('status'), download: $('download'),
};

// Settings can be tried from the address bar without editing config.js.
const params = new URLSearchParams(location.search);
const num = (k, lo, hi) => (params.has(k) && isFinite(Number(params.get(k))) ? Math.max(lo, Math.min(hi, Number(params.get(k)))) : null);
const settings = JSON.parse(JSON.stringify(config));
{
  const set = (v, f) => { if (v !== null) f(v); };
  set(num('chord', 0, 1), (v) => { settings.ring.mix = v; if (v) settings.ring.onMix = v; });
  set(num('decay', 0.005, 5), (v) => { settings.ring.decaySeconds = v; });
  set(num('octaves', 0, 8), (v) => { settings.ring.octavesUp = v; });
  set(num('click', 200, 20000), (v) => { settings.click.lowpassHz = v; });
  set(num('reverb', 0, 1), (v) => { settings.effects.reverb = v; });
  set(num('delay', 0, 1), (v) => { settings.effects.delay = v; });
  set(num('speed', settings.speed.min, settings.speed.max), (v) => { settings.speed.start = v; });
  if (settings.looks[params.get('look')]) settings.look = params.get('look');
}
const look = settings.looks[settings.look];
document.documentElement.style.setProperty('--ink', look.ink);
document.documentElement.style.setProperty('--accent', look.accent);
document.documentElement.style.setProperty('--glow', `rgb(${look.dataGlow})`);

// What every world shares: the scope, the side of the Earth facing the listener, the voice.
// Room kept for the header and the controls, in CSS pixels. On narrow screens NASA's frame sits
// above the globe, so the globe starts lower.
const BOTTOM = 150, FILL = 0.39;
const frameBox = () => { const w = Math.min(innerWidth * 0.62, 300); return { w, h: w / 2 }; };
const TOP = () => (innerWidth <= 900 ? 112 + frameBox().h + 8 : 104);
const app = {
  settings,
  scope: makeScope(ui.scopeCanvas, settings.scope, look, { top: TOP, bottom: BOTTOM, fill: FILL, disc: true }),
  view: { lon: settings.view.lon, lat: settings.view.lat },
  proj: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) },
  // positions of every cell for a view at the current tilt, turned to `lon` (whole degrees)
  projFor(lon, out) { return shiftCells(base, lon, out); },
  ended() { setPlaying(false); say('End.'); },
};
// Cell positions for the current tilt with longitude 0 facing; turning the globe only shifts them sideways.
const base = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS), lat: null };
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
let spinOn = !REDUCE, shownLon = null;
let ds = null, world = null, playing = false, coast = null, scene = null;
let ctx = null, out = null, wavUrl = null, lastSaid = 0, lastFrame = 0;

function say(text) { ui.live.textContent = ''; setTimeout(() => { ui.live.textContent = text; }, 40); lastSaid = performance.now(); }

// ---------- the worlds ----------
// Each world keeps its own turning globe for its whole life: a small picture of it is what
// the menu shows, and the same longitude is what the big globe opens on. Nothing reloads.
const planets = [];                // { d, canvas, scope, base, proj, lon, lat, world, button }
const PIC = 512;                   // size of a world's small picture, in pixels

async function build() {
  coast = await fetch('data/coast.json').then((r) => r.json());
  app.scope.setCoast(coast);
  datasets.forEach((d, i) => {
    const canvas = document.createElement('canvas');
    const p = {
      d, canvas, world: null, lon: d.view.lon - 30 + i * 20, lat: d.view.lat, vel: 0, vlat: 0,
      scope: makeScope(canvas, settings.scope, look, { size: PIC, top: 0, bottom: 0, ticks: false, fill: 0.47, lazyMarks: true }),
      base: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS), lat: null },
      proj: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) },
    };
    p.scope.resize(); p.scope.setCoast(coast);
    // the world as something to choose: a round button that follows it, and its name underneath
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'world';
    b.setAttribute('aria-label', d.title);                 // the name itself is drawn in the scene, curved under the world
    b.addEventListener('click', () => { unlockAudio(); location.hash = d.id; });
    const lit = (on) => () => { scene.hot = on ? i : -1; };
    b.addEventListener('pointerenter', lit(true)); b.addEventListener('pointerleave', lit(false));
    b.addEventListener('focus', lit(true)); b.addEventListener('blur', lit(false));
    ui.hub.append(b);
    p.button = b;
    planets.push(p);
    p.loading = (d.kind === 'events' ? createEventsWorld : createFieldWorld)(d, app);
    p.loading.then((w) => { p.world = w; }).catch((e) => { ui.status.textContent = `Could not load ${d.title}: ${e.message}`; });
    // and as a tab, for flying from one world to another
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'tab'; t.textContent = d.title;
    t.addEventListener('click', () => { unlockAudio(); location.hash = d.id; });
    ui.tabs.append(t);
  });
  scene = makeScene({ canvas: ui.sceneCanvas, look, title: project.title, planets, landing, still: REDUCE });
}

// Where world i's big globe sits on screen (the same sum the scope does), in CSS pixels.
function landing(i) {
  const ticks = planets[i].d.kind === 'events', W = innerWidth, H = innerHeight;
  const top = TOP();
  return { x: W / 2, y: top + (H - top - BOTTOM) / 2, r: Math.max(20, Math.min(W * FILL, (H - top - BOTTOM) / 2 / (ticks ? 1.26 : 1.04))) };
}
const planetOf = (d) => planets.find((p) => p.d === d);

// Draw each world's small picture, turned to where it is now.
function drawPictures() {
  for (const p of planets) {
    if (p.base.lat !== p.lat) { projectCells(0, p.lat, p.base); p.base.lat = p.lat; }
    p.scope.setView(p.lon, p.lat);
    shiftCells(p.base, p.lon, p.proj);
    if (p.world) p.world.preview(p.scope, p.proj); else p.scope.frame({ blips: null, count: 0, proj: p.proj });
  }
}

// ---------- getting about ----------
// The address says where we are: nothing after # is the menu, #lightning is a world.
// Going anywhere is a camera move, never a cut.
async function route(first) {
  const d = datasets.find((x) => x.id === location.hash.slice(1)) || null;
  if (d === ds && !first) return;
  const from = ds;
  await setPlaying(false);
  ds = d; world = null;
  showNasa(false);
  ui.download.hidden = true; ui.status.textContent = '';
  [...ui.tabs.children].forEach((t, i) => t.setAttribute('aria-current', String(datasets[i] === d)));
  document.title = d ? `${d.title} · ${project.title}` : project.title;
  ui.wav.hidden = !d; ui.tabs.hidden = !d;
  document.body.classList.toggle('in-world', !!d);
  document.body.classList.toggle('in-menu', !d);

  if (!d) {                                               // out to the menu
    const arrive = () => { say(`${project.title}. ${datasets.length} worlds: ${datasets.map((x) => x.title).join(', ')}.`); (from ? planetOf(from) : planets[0]).button.focus({ preventScroll: true }); };
    if (first) { scene.set({ mode: 'attract' }); attract(); } else scene.go({ mode: 'menu' }, 1.1, arrive);
    return;
  }
  const p = planetOf(d), i = planets.indexOf(p);
  $('intro').textContent = `${d.about} Space plays and pauses. Left and right arrows turn the globe, shift with up and down tilts it. ` +
    `Up and down arrows: ${d.speedKeys.toLowerCase()}. Comma and full stop: ${d.timeKeys.toLowerCase()}. Square brackets fly to the next or previous world. ` +
    "D says what is playing. W makes a WAV file. S stops or starts the turning. Escape goes back to the menu. NASA's own animation is shown beside the globe.";
  const arrive = () => {
    ui.globe.focus({ preventScroll: true });
    say(`${d.title}. ${d.about}`);
    setPlaying(true, true);                                // starts by itself; if the browser will not allow it yet, Play is there
  };
  if (first) scene.set({ mode: 'world', i });
  else scene.go({ mode: 'world', i }, from ? 1.5 : 1.3, arrive);
  const w = await p.loading;
  if (ds !== d) return;                                   // left again while loading
  world = w;
  app.scope.setTicks(d.kind === 'events');               // month ticks only where the rim is a calendar
  app.scope.resize(); app.scope.clear();
  shownLon = null; setView(p.lon, p.lat, true);
  showNasa(true);                                          // NASA's own frame is always beside ours
  readouts(true);
  if (first) arrive();
}

// The machine, seen from a child's height, waiting for a tap.
function attract() {
  ui.start.hidden = false; ui.start.focus({ preventScroll: true });
  const begin = () => {
    if (ui.start.hidden) return;
    ui.start.hidden = true;
    unlockAudio();
    removeEventListener('keydown', key, true); removeEventListener('pointerdown', begin, true);
    scene.go({ mode: 'menu' }, 3.4, () => { say(`${project.title}. ${datasets.length} worlds: ${datasets.map((x) => x.title).join(', ')}.`); planets[0].button.focus({ preventScroll: true }); });
  };
  const key = (e) => { if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) { e.preventDefault(); begin(); } };
  addEventListener('keydown', key, true); addEventListener('pointerdown', begin, true);
}

// ---------- view ----------
function setView(lon, lat, now) {
  app.view.lon = ((lon + 540) % 360) - 180;
  app.view.lat = Math.max(-70, Math.min(70, lat));
  const p = ds && planetOf(ds);
  if (p) { p.lon = app.view.lon; p.lat = app.view.lat; }  // the world's own picture turns with it
  app.scope.setView(app.view.lon, app.view.lat);          // the coastline turns smoothly
  const whole = Math.round(app.view.lon);
  if (base.lat !== app.view.lat) { projectCells(0, app.view.lat, base); base.lat = app.view.lat; shownLon = null; }
  if (whole === shownLon && !now) return;                  // the sound and the dots move in whole degrees
  shownLon = whole;
  shiftCells(base, whole, app.proj);
  world?.viewChanged(now);
}
const turn = (dLon, dLat) => {
  setView(app.view.lon + dLon, app.view.lat + dLat);
  say(world.kind === 'field' && dLat ? world.describe() : `Facing ${placeName(app.view.lon, app.view.lat)}.`);
};

// ---------- audio ----------
// The space around the sound: a long reverb and an echo that bounces from side to side.
// Built the same way for the live sound and for the WAV file.
function buildFx(ac, input, fx) {
  input.connect(ac.destination);
  if (fx.reverb > 0) {
    const len = Math.floor(ac.sampleRate * fx.reverbSeconds), ir = ac.createBuffer(2, len, ac.sampleRate);
    let seed = 20261114; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648) - 1;   // the same room every time
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, k = 0.5 * Math.pow(1 - t, 1.5) + 0.03;      // the tail gets darker as it dies
        lp += k * (rnd() - lp);
        d[i] = lp * Math.pow(1 - t, 2.2) * (i < 400 ? i / 400 : 1);
      }
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = fx.reverb * 1.6;
    input.connect(conv).connect(wet).connect(ac.destination);
  }
  if (fx.delay > 0) {
    const dl = ac.createDelay(2), dr = ac.createDelay(2), fb = ac.createGain(), tone = ac.createBiquadFilter();
    const merge = ac.createChannelMerger(2), wet = ac.createGain(), mono = ac.createGain();
    dl.delayTime.value = fx.delaySeconds; dr.delayTime.value = fx.delaySeconds;
    fb.gain.value = fx.delayFeedback; tone.type = 'lowpass'; tone.frequency.value = 2600; wet.gain.value = fx.delay; mono.gain.value = 0.6;
    input.connect(mono).connect(dl); dl.connect(dr); dr.connect(tone).connect(fb).connect(dl);    // left, then right, then round again
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(wet).connect(ac.destination);
  }
}

// Browsers only let sound start from a tap or a key. Every tap that leads somewhere calls this,
// so that by the time a world arrives the sound can start by itself.
function unlockAudio() {
  try {
    if (!ctx) {
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      out = ctx.createGain(); buildFx(ctx, out, settings.effects);
      ctx.ready = ctx.audioWorklet.addModule('js/dsp.js');
    }
    ctx.resume();
  } catch {}
}

async function ensureAudio() {
  unlockAudio();
  await ctx.ready;
  const node = world.start(ctx);
  if (!node.wired) { node.connect(out); node.wired = true; }
}

// quiet: this was not asked for by a tap (sound starting by itself), so say nothing if it cannot start
async function setPlaying(on, quiet) {
  if (on && !world) return;
  if (on) {
    try {
      await ensureAudio(); await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 400))]);
      if (ctx.state !== 'running') { if (!quiet) ui.status.textContent = 'Tap Play to start the sound.'; return; }
    } catch (e) { if (!quiet) ui.status.textContent = 'Sound could not start: ' + e.message; return; }
  }
  const was = playing;
  playing = on;
  world?.setPlaying(on);
  ui.play.textContent = on ? 'Pause' : 'Play';
  if (world && on !== was && !quiet) say(on ? world.describe() : 'Paused. ' + world.describe());
}

// ---------- readouts and drawing ----------
function readouts(force) {
  if (!world) return;
  ui.date.textContent = world.timeText();
  ui.speedv.textContent = world.speedText(false);
  if (force || document.activeElement !== ui.time) ui.time.value = Math.round(world.timeSlider * 1000);
  if (force || document.activeElement !== ui.speed) ui.speed.value = Math.round(world.speedSlider * 1000);
  ui.time.setAttribute('aria-valuetext', world.timeAria());
  ui.speed.setAttribute('aria-valuetext', world.speedText(true));
}

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
let shownMode = '';

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0); lastFrame = now;
  const active = ds && planetOf(ds), moving = scene.moving;

  // every world turns, all the time, unless a hand is on it
  // Every world turns, all the time. A drag gives it the speed of the hand; let go and it
  // carries on with that speed, settling back to its own.
  const own = spinOn ? 360 / settings.spin.secondsPerTurn : 0, settle = 1 - Math.exp(-dt / settings.spin.settleSeconds);
  for (const p of planets) {
    if (p === active && drag) continue;
    p.vel += (own - p.vel) * settle; p.vlat += (0 - p.vlat) * Math.min(1, settle * 3);
    p.lon = ((p.lon + p.vel * dt + 540) % 360) - 180;
    p.lat = Math.max(-70, Math.min(70, p.lat + p.vlat * dt));
  }
  if (active && world) setView(active.lon, active.lat);

  // How much of the picture is the 3D scene, and how much the big globe. They show the same
  // world in the same place, so one fades into the other at the end of a flight in.
  let sceneAlpha = scene.mode === 'world' && !moving ? 0 : 1;
  if (sceneAlpha) {
    drawPictures();
    const s = scene.frame(dt);
    if (s.moving && s.moving.to.mode === 'world') sceneAlpha = 1 - smooth((s.moving.k - 0.78) / 0.22);
    placeButtons(s);
  }
  const worldAlpha = world ? 1 - sceneAlpha : 0;
  ui.sceneCanvas.style.opacity = String(sceneAlpha);
  ui.scopeCanvas.style.opacity = String(worldAlpha);
  ui.player.style.opacity = String(worldAlpha); ui.tabs.style.opacity = String(ds ? Math.max(worldAlpha, 0.35) : 0);
  frame.style.opacity = String(worldAlpha);
  const mode = moving ? 'moving' : scene.mode;
  if (mode !== shownMode) {                               // only the place we are in can be touched
    shownMode = mode;
    ui.player.hidden = mode !== 'world'; ui.hub.hidden = mode !== 'menu';
    if (mode === 'menu' && !ui.about.open) (planets[Math.max(0, scene.active)] || planets[0]).button.focus({ preventScroll: true });
    ui.header.hidden = scene.mode === 'attract' && !moving;
    document.body.dataset.place = mode;
  }

  if (!world) return;
  world.frame(dt);
  syncNasa(now);
  readouts(false);
  if (playing && now - lastSaid > settings.describeEverySeconds * 1000) say(world.describe());
}

// Keep each world's button over it as it goes round.
function placeButtons(s) {
  if (s.mode !== 'menu' || s.moving) return;
  planets.forEach((p, i) => {
    const q = s.spots[i], b = p.button;
    if (!q) { b.style.display = 'none'; return; }
    b.style.display = '';
    b.style.width = b.style.height = `${q.r * 2}px`;
    b.style.transform = `translate(${q.x - q.r}px, ${q.y - q.r}px)`;
    b.style.zIndex = String(Math.round(q.r));            // the nearest world is on top
  });
}

// ---------- WAV ----------
async function makeWav() {
  if (!world || ui.wav.disabled) return;
  ui.wav.disabled = true; ui.download.hidden = true;
  try {
    const r = await world.renderWav(async (p) => { ui.status.textContent = `Making WAV: ${Math.round(p * 100)}%`; await new Promise((res) => setTimeout(res)); });
    // run the dry render through the same reverb and echo as the live sound
    ui.status.textContent = 'Making WAV: adding the room';
    const tail = settings.effects.reverb > 0 || settings.effects.delay > 0 ? 6 : 0;
    const off = new OfflineAudioContext(2, r.L.length + tail * r.sr, r.sr), dry = off.createBuffer(2, r.L.length, r.sr);
    dry.copyToChannel(r.L, 0); dry.copyToChannel(r.R, 1);
    const src = off.createBufferSource(), bus = off.createGain(); src.buffer = dry; src.connect(bus); buildFx(off, bus, settings.effects); src.start();
    const wet = await off.startRendering();
    r.secs += tail;
    const blob = toWav(wet);
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(blob);
    const name = `earth-jukebox-${ds.id}-${r.tag}.wav`;
    Object.assign(ui.download, { href: wavUrl, download: name, hidden: false });
    ui.download.textContent = `Download WAV, ${Math.round(r.secs)} s`;
    ui.download.setAttribute('aria-label', `Download ${name}, ${Math.round(r.secs)} seconds, ${(blob.size / 1048576).toFixed(1)} megabytes`);
    ui.status.textContent = '';
    ui.download.focus();
  } catch (e) { ui.status.textContent = 'Could not make the WAV file: ' + e.message; }
  ui.wav.disabled = false;
}

// ---------- info ----------
function showInfo() {
  const d = ds, body = $('about-body'), keys = $('keys');
  $('about-h').textContent = d ? d.title : project.title;
  body.textContent = ''; keys.textContent = '';
  const p = (t) => { const e = document.createElement('p'); e.textContent = t; body.append(e); };
  if (!d) {
    p(project.about);
    p('Choose a world to hear it. Everything works from the keyboard, and each world says what it is playing for screen readers.');
    keys.hidden = true;
    $('credit').textContent = datasets.map((x) => `${x.title}: ${x.sourceTitle}, ${x.sourceUrl}.`).join(' ') + ' Coastlines: Natural Earth.';
  } else {
    p(d.about); d.sound.forEach(p);
    keys.hidden = false;
    const rows = [['Space', 'Play or pause'], ['← →', 'Turn the globe'], ['Shift ↑ ↓', 'Tilt the globe'], ['↑ ↓', d.speedKeys], [', .', d.timeKeys]];
    rows.push(['[ ]', 'Previous or next world'], ['S', 'Stop or start the turning'], ['D', 'Say what is playing'], ['W', 'Make a WAV file'], ['Esc', 'Back to the menu']);
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; keys.append(dt, dd); }
    $('credit').textContent = `${d.credit} Source: ${d.sourceTitle}, ${d.sourceUrl}. ${d.note}`;
  }
  ui.about.showModal();
}

// ---------- controls ----------
// The title: from a world it goes back to the menu; in the menu it steps back from the machine and in again.
const goHome = () => {
  if (location.hash) { location.hash = ''; return; }
  if (scene.mode === 'menu' && !scene.moving) scene.go({ mode: 'attract' }, 1.6, () => scene.go({ mode: 'menu' }, 3.0));
};
const hop = (n) => { const i = datasets.indexOf(ds); if (i >= 0) { unlockAudio(); location.hash = datasets[(i + n + datasets.length) % datasets.length].id; } };

// NASA's own picture, beside ours, kept at the same moment as the sound.
const frame = $('frame'), vid = $('nasavid');
let nasaOn = false, lastSeek = 0;
function showNasa(on) {
  nasaOn = !!on && !!ds?.video;
  frame.hidden = !nasaOn;
  if (!nasaOn) return;
  if (vid.dataset.src !== ds.video.src) { vid.dataset.src = ds.video.src; vid.src = ds.video.src; }
  const a = $('framesrc'); a.href = ds.sourceUrl; a.textContent = ds.video.label;
}
function syncNasa(now) {
  if (!nasaOn || !world || now - lastSeek < 180 || vid.readyState < 1 || vid.seeking) return;
  const t = Math.min(world.videoTime(), (vid.duration || 1e9) - 0.05);
  if (Math.abs(vid.currentTime - t) > 0.06) { vid.currentTime = t; lastSeek = now; }
}

ui.home.addEventListener('click', goHome);
ui.play.addEventListener('click', () => { ui.status.textContent = ''; setPlaying(!playing); });
ui.wav.addEventListener('click', makeWav);
ui.info.addEventListener('click', showInfo);
ui.close.addEventListener('click', () => ui.about.close());
ui.about.addEventListener('click', (e) => { if (e.target === ui.about) ui.about.close(); });
ui.time.addEventListener('input', () => { if (world) { world.timeSlider = ui.time.value / 1000; readouts(false); } });
ui.time.addEventListener('change', () => world && say(world.describe()));
ui.speed.addEventListener('input', () => { if (world) { world.speedSlider = ui.speed.value / 1000; readouts(false); } });
ui.speed.addEventListener('change', () => world && say(world.speedAnnounce()));

ui.globe.addEventListener('focus', () => app.scope.setFocus(ui.globe.matches(':focus-visible')));
ui.globe.addEventListener('blur', () => app.scope.setFocus(false));

// drag the globe; a tap plays or pauses
let drag = null;
ui.globe.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), vx: 0, vy: 0 }; ui.globe.setPointerCapture(e.pointerId); });
ui.globe.addEventListener('pointermove', (e) => {
  if (!drag || !world) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 57.3 / app.scope.radius;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  const now = performance.now(), dt = Math.max(0.004, (now - drag.t) / 1000); drag.t = now;
  drag.vx += ((-dx * k) / dt - drag.vx) * 0.5; drag.vy += ((dy * k) / dt - drag.vy) * 0.5;   // how fast the hand is turning it
  if (drag.moved > 6) setView(app.view.lon - dx * k, app.view.lat + dy * k);
});
ui.globe.addEventListener('pointerup', (e) => {
  if (drag && drag.moved <= 6 && app.scope.inside(e.clientX, e.clientY)) setPlaying(!playing);
  else if (drag && world) {
    const p = planetOf(ds);
    if (performance.now() - drag.t < 120) { p.vel = Math.max(-400, Math.min(400, drag.vx)); p.vlat = Math.max(-200, Math.min(200, drag.vy)); }   // let go while moving: it keeps going
    say(world.kind === 'field' ? world.describe() : `Facing ${placeName(app.view.lon, app.view.lat)}.`);
  }
  drag = null;
});
ui.globe.addEventListener('pointercancel', () => { drag = null; });
ui.globe.addEventListener('wheel', (e) => { e.preventDefault(); world?.nudgeSpeed(-e.deltaY / 130); }, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || ui.about.open) return;
  const tag = e.target.tagName, k = e.key;
  if (k === 'i' || k === '?') { e.preventDefault(); showInfo(); return; }
  if (!world || scene.moving) return;
  if (k === 'Escape') { e.preventDefault(); goHome(); return; }
  if (tag === 'INPUT') return;                               // sliders keep their own arrow keys
  const step = settings.view.stepDegrees;
  const speed = (n) => { world.nudgeSpeed(n); readouts(true); say(world.speedAnnounce()); };
  const time = (n) => { world.stepTime(n); readouts(true); say(world.describe()); };
  const spin = () => { spinOn = !spinOn; say(spinOn ? 'The Earth is turning.' : 'The Earth has stopped turning.'); };
  const act = {
    ' ': tag === 'BUTTON' || tag === 'A' ? null : () => setPlaying(!playing),
    ArrowLeft: () => turn(-step, 0), ArrowRight: () => turn(step, 0),
    ArrowUp: () => (e.shiftKey ? turn(0, step) : speed(1)),
    ArrowDown: () => (e.shiftKey ? turn(0, -step) : speed(-1)),
    ',': () => time(-1), '.': () => time(1),
    Home: () => { world.timeSlider = 0; readouts(true); say(world.describe()); },
    d: () => say(world.describe()), D: () => say(world.describe()),
    w: makeWav, W: makeWav, s: spin, S: spin,
    '[': () => hop(-1), ']': () => hop(1),
  }[k];
  if (!act) return;
  e.preventDefault();
  act();
});

// Stars, drawn once behind everything.
function drawStars() {
  const c = $('stars'), dpr = Math.min(devicePixelRatio || 1, 2), W = (c.width = Math.round(innerWidth * dpr)), H = (c.height = Math.round(innerHeight * dpr));
  const g = c.getContext('2d'); let seed = 5011; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  g.clearRect(0, 0, W, H);
  const n = Math.round((W * H) / (dpr * dpr) / 2600);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, b = rnd(), r = (b > 0.96 ? 1.3 : b > 0.8 ? 0.9 : 0.6) * dpr;
    g.fillStyle = `rgba(${look.line},${(0.18 + 0.6 * b * b).toFixed(2)})`;
    g.fillRect(x - r / 2, y - r / 2, r, r);
  }
}
const sizeFrame = () => { const b = frameBox(); frame.style.setProperty('--fw', `${b.w}px`); };
window.addEventListener('resize', () => { app.scope.resize(); app.scope.touch(); scene.resize(); drawStars(); sizeFrame(); });
drawStars(); sizeFrame();
window.addEventListener('hashchange', () => route(false));
app.scope.resize();
build().then(() => route(true)).then(() => requestAnimationFrame(tick)).catch((e) => { ui.status.textContent = 'Could not load: ' + e.message; });
