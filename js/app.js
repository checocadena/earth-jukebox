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
const TOP = 104, BOTTOM = 150, FILL = 0.39;     // room kept for the header and the controls, in CSS pixels
const app = {
  settings,
  scope: makeScope(ui.scopeCanvas, settings.scope, look, { top: TOP, bottom: BOTTOM, fill: FILL }),
  view: { lon: settings.view.lon, lat: settings.view.lat },
  proj: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) },
  // positions of every cell for a view at the current tilt, turned to `lon` (whole degrees)
  projFor(lon, out) { return shiftCells(base, lon, out); },
  ended() { setPlaying(false); say('End.'); },
};
// Cell positions for the current tilt with longitude 0 facing; turning the globe only shifts them sideways.
const base = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS), lat: null };
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
let spinHold = 0, spinOn = !REDUCE, shownLon = null;
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
      d, canvas, world: null, lon: d.view.lon - 30 + i * 20, lat: d.view.lat,
      scope: makeScope(canvas, settings.scope, look, { size: PIC, top: 0, bottom: 0, ticks: false, fill: 0.47, lazyMarks: true }),
      base: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS), lat: null },
      proj: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) },
    };
    p.scope.resize(); p.scope.setCoast(coast);
    // the world as something to choose: a round button that follows it, and its name underneath
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'world';
    const s = document.createElement('span'); s.textContent = d.title;
    b.append(s);
    b.addEventListener('click', () => { location.hash = d.id; });
    ui.hub.append(b);
    p.button = b;
    planets.push(p);
    p.loading = (d.kind === 'events' ? createEventsWorld : createFieldWorld)(d, app);
    p.loading.then((w) => { p.world = w; }).catch((e) => { ui.status.textContent = `Could not load ${d.title}: ${e.message}`; });
    // and as a tab, for flying from one world to another
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'tab'; t.textContent = d.title;
    t.addEventListener('click', () => { location.hash = d.id; });
    ui.tabs.append(t);
  });
  scene = makeScene({ canvas: ui.sceneCanvas, look, title: project.title, planets, landing, still: REDUCE });
}

// Where world i's big globe sits on screen (the same sum the scope does), in CSS pixels.
function landing(i) {
  const ticks = planets[i].d.kind === 'events', W = innerWidth, H = innerHeight;
  return { x: W / 2, y: TOP + (H - TOP - BOTTOM) / 2, r: Math.max(20, Math.min(W * FILL, (H - TOP - BOTTOM) / 2 / (ticks ? 1.26 : 1.04))) };
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
  const from = ds, keepPlaying = playing && !!d;          // moving between worlds: the sound carries on in the next one
  await setPlaying(false);
  ds = d; world = null;
  showNasa(false);
  ui.download.hidden = true; ui.status.textContent = '';
  [...ui.tabs.children].forEach((t, i) => t.setAttribute('aria-current', String(datasets[i] === d)));
  document.title = d ? `${d.title} · ${project.title}` : project.title;
  ui.ring.hidden = !(d && d.kind === 'events'); ui.nasa.hidden = !(d && d.video); ui.wav.hidden = !d; ui.tabs.hidden = !d;
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
    'D says what is playing. W makes a WAV file. S stops or starts the turning. Escape goes back to the menu.';
  const arrive = () => {
    ui.globe.focus({ preventScroll: true });
    if (keepPlaying) setPlaying(true); else say(`${d.title}. ${d.about} Press space to play.`);
  };
  if (first) scene.set({ mode: 'world', i });
  else scene.go({ mode: 'world', i }, from ? 1.7 : 1.3, arrive, from ? { mode: 'menu' } : undefined);   // world to world: out, across, in
  const w = await p.loading;
  if (ds !== d) return;                                   // left again while loading
  world = w;
  app.scope.setTicks(d.kind === 'events');               // month ticks only where the rim is a calendar
  app.scope.resize(); app.scope.clear();
  shownLon = null; setView(p.lon, p.lat, true);
  ui.ring.setAttribute('aria-pressed', String(settings.ring.mix > 0));
  readouts(true);
  if (first) arrive();
}

// The machine, seen from a child's height, waiting for a tap.
function attract() {
  ui.start.hidden = false; ui.start.focus({ preventScroll: true });
  const begin = () => {
    if (ui.start.hidden) return;
    ui.start.hidden = true;
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
const touched = () => { spinHold = performance.now() + settings.spin.holdAfterTouchSeconds * 1000; };
const turn = (dLon, dLat) => {
  touched();
  setView(app.view.lon + dLon, app.view.lat + dLat);
  say(world.kind === 'field' && dLat ? world.describe() : `Facing ${placeName(app.view.lon, app.view.lat)}.`);
};

// ---------- audio ----------
async function ensureAudio() {
  if (!ctx) {
    if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule('js/dsp.js');
    out = ctx.createGain(); out.connect(ctx.destination);
    const fx = settings.effects;
    if (fx.reverb > 0) {                    // optional, off by default
      const len = Math.floor(ctx.sampleRate * fx.reverbSeconds), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = fx.reverb * 0.5;
      out.connect(conv).connect(wet).connect(ctx.destination);
    }
    if (fx.delay > 0) {
      const d = ctx.createDelay(2); d.delayTime.value = fx.delaySeconds;
      const fb = ctx.createGain(); fb.gain.value = fx.delayFeedback;
      const wet = ctx.createGain(); wet.gain.value = fx.delay;
      out.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(ctx.destination);
    }
  }
  const node = world.start(ctx);
  if (!node.wired) { node.connect(out); node.wired = true; }
}

async function setPlaying(on) {
  if (on && !world) return;
  if (on) {
    try { await ensureAudio(); await ctx.resume(); } catch (e) { ui.status.textContent = 'Sound could not start: ' + e.message; return; }
  }
  const was = playing;
  playing = on;
  world?.setPlaying(on);
  ui.play.textContent = on ? 'Pause' : 'Play';
  if (world && on !== was) say(on ? world.describe() : 'Paused. ' + world.describe());
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
  if (spinOn) for (const p of planets) if (p !== active || (!drag && now > spinHold)) p.lon = ((p.lon + (dt * 360) / settings.spin.secondsPerTurn + 540) % 360) - 180;
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
  const mode = moving ? 'moving' : scene.mode;
  if (mode !== shownMode) {                               // only the place we are in can be touched
    shownMode = mode;
    ui.player.hidden = mode !== 'world'; ui.hub.hidden = mode !== 'menu';
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
  const rs = s.spots.filter(Boolean).map((q) => q.r), lo = Math.min(...rs), hi = Math.max(...rs);
  planets.forEach((p, i) => {
    const q = s.spots[i], b = p.button;
    if (!q) { b.style.display = 'none'; return; }
    b.style.display = '';
    b.style.width = b.style.height = `${q.r * 2}px`;
    b.style.transform = `translate(${q.x - q.r}px, ${q.y - q.r}px)`;
    b.style.zIndex = String(Math.round(q.r));            // the nearest world is on top
    b.firstChild.style.opacity = String(hi > lo ? 0.4 + 0.6 * ((q.r - lo) / (hi - lo)) : 1);
  });
}

// ---------- WAV ----------
async function makeWav() {
  if (!world || ui.wav.disabled) return;
  ui.wav.disabled = true; ui.download.hidden = true;
  try {
    const r = await world.renderWav(async (p) => { ui.status.textContent = `Making WAV: ${Math.round(p * 100)}%`; await new Promise((res) => setTimeout(res)); });
    const blob = toWav({ numberOfChannels: 2, sampleRate: r.sr, length: r.L.length, getChannelData: (c) => (c ? r.R : r.L) });
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
    if (d.kind === 'events') rows.push(['C', 'Chord on or off']);
    rows.push(['[ ]', 'Previous or next world'], ['N', "Show NASA's own animation"], ['S', 'Stop or start the turning'], ['D', 'Say what is playing'], ['W', 'Make a WAV file'], ['Esc', 'Back to the menu']);
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; keys.append(dt, dd); }
    $('credit').textContent = `${d.credit} Source: ${d.sourceTitle}, ${d.sourceUrl}. ${d.note}`;
  }
  ui.about.showModal();
}

// ---------- controls ----------
function setChord(on) {
  world?.setChord(on);
  ui.ring.setAttribute('aria-pressed', String(on));
  say(on ? 'Chord on.' : 'Chord off.');
}
// The title: from a world it goes back to the menu; in the menu it steps back from the machine and in again.
const goHome = () => {
  if (location.hash) { location.hash = ''; return; }
  if (scene.mode === 'menu' && !scene.moving) scene.go({ mode: 'attract' }, 1.6, () => scene.go({ mode: 'menu' }, 3.0));
};
const hop = (n) => { const i = datasets.indexOf(ds); if (i >= 0) location.hash = datasets[(i + n + datasets.length) % datasets.length].id; };

// NASA's own picture, beside ours, kept at the same moment as the sound.
const frame = $('frame'), vid = $('nasavid');
let nasaOn = false, lastSeek = 0;
function showNasa(on) {
  nasaOn = !!on && !!ds?.video;
  ui.nasa.setAttribute('aria-pressed', String(nasaOn));
  frame.hidden = !nasaOn;
  if (!nasaOn) return;
  if (vid.dataset.src !== ds.video.src) { vid.dataset.src = ds.video.src; vid.src = ds.video.src; }
  const a = $('framesrc'); a.href = ds.sourceUrl; a.textContent = ds.video.label;
  say(`Showing NASA's animation: ${ds.sourceTitle}.`);
}
function syncNasa(now) {
  if (!nasaOn || !world || now - lastSeek < 180 || vid.readyState < 1 || vid.seeking) return;
  const t = Math.min(world.videoTime(), (vid.duration || 1e9) - 0.05);
  if (Math.abs(vid.currentTime - t) > 0.06) { vid.currentTime = t; lastSeek = now; }
}

ui.home.addEventListener('click', goHome);
ui.play.addEventListener('click', () => setPlaying(!playing));
ui.wav.addEventListener('click', makeWav);
ui.ring.addEventListener('click', () => setChord(ui.ring.getAttribute('aria-pressed') !== 'true'));
ui.info.addEventListener('click', showInfo);
ui.nasa.addEventListener('click', () => showNasa(!nasaOn));
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
ui.globe.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; ui.globe.setPointerCapture(e.pointerId); });
ui.globe.addEventListener('pointermove', (e) => {
  if (!drag || !world) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 57.3 / app.scope.radius;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved > 6) { touched(); setView(app.view.lon - dx * k, app.view.lat + dy * k); }
});
ui.globe.addEventListener('pointerup', (e) => {
  if (drag && drag.moved <= 6 && app.scope.inside(e.clientX, e.clientY)) setPlaying(!playing);
  else if (drag && world) say(world.kind === 'field' ? world.describe() : `Facing ${placeName(app.view.lon, app.view.lat)}.`);
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
  const chord = () => world.hasChord && setChord(ui.ring.getAttribute('aria-pressed') !== 'true');
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
    w: makeWav, W: makeWav, c: chord, C: chord, s: spin, S: spin,
    '[': () => hop(-1), ']': () => hop(1), n: () => showNasa(!nasaOn), N: () => showNasa(!nasaOn),
  }[k];
  if (!act) return;
  e.preventDefault();
  act();
});

window.addEventListener('resize', () => { app.scope.resize(); app.scope.touch(); scene.resize(); });
window.addEventListener('hashchange', () => route(false));
app.scope.resize();
build().then(() => route(true)).then(() => requestAnimationFrame(tick)).catch((e) => { ui.status.textContent = 'Could not load: ' + e.message; });
