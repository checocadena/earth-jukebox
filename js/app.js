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
  time: $('time'), date: $('date'),
  live: $('live'), status: $('status'), download: $('download'),
  cc: $('cc'), cc1: $('cc1'), cc2: $('cc2'), cctext: $('cctext'), cctoggle: $('cctoggle'), mute: $('mute'), volume: $('volume'), meter: $('meter'),
};
// Remembered per browser: captions on or off, volume, mute. Storage can be blocked, so every use is guarded.
const store = {
  get(k, d) { try { const v = localStorage.getItem('ej.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ej.' + k, JSON.stringify(v)); } catch {} },
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
// Below the globe: the date slider (96 px), and above it the captions and sound controls.
const FILL = 0.39;
let ccOn = store.get('captions', true);
const BOTTOM = () => 96 + (ccOn ? (innerWidth <= 600 ? 112 : 92) : 50);
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
let ctx = null, out = null, fxSends = {}, pre = null, master = null, meters = null, wavUrl = null, lastSaid = 0, lastFrame = 0;
let muted = store.get('muted', false), volume = Math.max(0, Math.min(100, Number(store.get('volume', 80)) || 0));

function say(text) { ui.live.textContent = ''; setTimeout(() => { ui.live.textContent = text; }, 40); lastSaid = performance.now(); caption(text); }

// ---------- captions ----------
// The first line says what is making the sound and what it stands for; the second what it is doing now.
let lastCaption = 0, whooshing = 0;
function caption(text) { ui.cc2.textContent = text; lastCaption = performance.now(); }
function captionHead() {
  const state = [];
  if (muted) state.push('muted');
  let head;
  if (ds) {
    if (!playing) state.push('paused');
    head = `${ds.title}${state.length ? ` (${state.join(', ')})` : ''}: ${ds.caption}`;
  } else head = `Menu${state.length ? ` (${state.join(', ')})` : ''}: ${datasets.length} worlds. Nothing plays until you pick one.`;
  if (ui.cc1.textContent !== head) ui.cc1.textContent = head;
}
function setCaptions(on) {
  ccOn = on; store.set('captions', on);
  ui.cc.classList.toggle('off', !on);
  ui.cctoggle.setAttribute('aria-pressed', String(on));
  layout();
}

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
  const top = TOP(), bottom = BOTTOM();
  return { x: W / 2, y: top + (H - top - bottom) / 2, r: Math.max(20, Math.min(W * FILL, (H - top - bottom) / 2 / (ticks ? 1.26 : 1.04))) };
}
const planetOf = (d) => planets.find((p) => p.d === d);

// Draw each world's small picture, turned to where it is now.
function drawPictures(skip) {
  for (const p of planets) {
    if (planets[skip] === p) continue;                    // that one is being drawn by the big globe
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
  if (world && playing) fade(world, 0);                   // the world we leave fades out behind us
  if (from && !first) { const q = planetOf(from), t = landing(planets.indexOf(q)); q.scope.setSize(Math.min(1500, Math.ceil((t.r * 2 * Math.min(devicePixelRatio || 1, 2)) / 0.94))); }   // and is drawn sharp at full size while it goes
  playing = false; ui.play.textContent = 'Play';
  ds = d; world = null;
  captionHead();
  if (d && from) caption(`Fading from ${from.title} to ${d.title}.`); else if (d) caption(`Flying to ${d.title}.`);
  showNasa(false);
  ui.status.textContent = '';
  [...ui.tabs.children].forEach((t, i) => t.setAttribute('aria-current', String(datasets[i] === d)));
  document.title = d ? `${d.title} · ${project.title}` : project.title;
  ui.wav.hidden = !d; ui.tabs.hidden = !d; ui.play.hidden = !d;
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
    "D says what is playing. W exports the audio as a WAV file. S stops or starts the turning. Escape goes back to the menu. NASA's own animation is shown beside the globe.";
  const arrive = () => { ui.globe.focus({ preventScroll: true }); say(`${d.title}. ${d.about}`); if (!playing) setPlaying(true, true); };
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
  setPlaying(true, true);                                  // sound starts by itself and fades in as we fly; if the browser will not allow it yet, Play is there
  if (first) arrive();
}

// The machine, seen from a child's height, waiting for a tap.
function attract() {
  ui.start.textContent = matchMedia('(pointer: coarse)').matches ? 'Tap to start' : 'Click to start';
  ui.start.hidden = false; ui.start.focus({ preventScroll: true });
  const begin = () => {
    if (ui.start.hidden) return;
    ui.start.hidden = true;
    unlockAudio(); whoosh(3.4);
    removeEventListener('keydown', key, true); removeEventListener('pointerdown', begin, true);
    scene.go({ mode: 'menu' }, 3.4,() => { say(`${project.title}. ${datasets.length} worlds: ${datasets.map((x) => x.title).join(', ')}.`); planets[0].button.focus({ preventScroll: true }); });
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
// Returns the inputs of the reverb and the echo, so a sound can be sent into them on its own.
function buildFx(ac, input, fx, dest = ac.destination) {
  input.connect(dest);
  const sends = {};
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
    input.connect(conv).connect(wet).connect(dest);
    sends.reverb = conv;
  }
  if (fx.delay > 0) {
    const dl = ac.createDelay(2), dr = ac.createDelay(2), fb = ac.createGain(), tone = ac.createBiquadFilter();
    const merge = ac.createChannelMerger(2), wet = ac.createGain(), mono = ac.createGain();
    dl.delayTime.value = fx.delaySeconds; dr.delayTime.value = fx.delaySeconds;
    fb.gain.value = fx.delayFeedback; tone.type = 'lowpass'; tone.frequency.value = 2600; wet.gain.value = fx.delay; mono.gain.value = 0.6;
    input.connect(mono).connect(dl); dl.connect(dr); dr.connect(tone).connect(fb).connect(dl);    // left, then right, then round again
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(wet).connect(dest);
    sends.delay = mono;
  }
  return sends;
}

// Browsers only let sound start from a tap or a key. Every tap that leads somewhere calls this,
// so that by the time a world arrives the sound can start by itself.
function unlockAudio() {
  try {
    if (!ctx) {
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      // worlds -> out -> room -> pre -> master (volume, mute) -> speakers. The meter listens at `pre`,
      // so it still moves with the sound when the sound is muted.
      pre = ctx.createGain(); master = ctx.createGain(); master.gain.value = gainFor();
      pre.connect(master).connect(ctx.destination);
      const split = ctx.createChannelSplitter(2);
      pre.connect(split);
      meters = [0, 1].map((c) => { const a = ctx.createAnalyser(); a.fftSize = 1024; split.connect(a, c); return a; });
      out = ctx.createGain(); fxSends = buildFx(ctx, out, settings.effects, pre);
      ctx.ready = ctx.audioWorklet.addModule('js/dsp.js');
    }
    ctx.resume();
  } catch {}
}

// The flight into the arcade screen: noise through a band-pass filter that rises and swells with
// the camera, then dies away as the worlds appear. Settings in config.js under `whoosh`.
function whoosh(seconds) {
  const w = settings.whoosh, level = REDUCE ? w.reducedMotionLevel : w.level;
  if (!ctx || !(level > 0)) return;
  try {
    const sr = ctx.sampleRate, t0 = ctx.currentTime + 0.03, peak = t0 + seconds * w.peakAt, end = t0 + seconds + w.tailSeconds;
    const len = Math.ceil((end - t0 + 0.1) * sr), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {                         // a different noise in each ear, so it is wide
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = w.q;
    bp.frequency.setValueAtTime(w.fromHz, t0);
    bp.frequency.exponentialRampToValueAtTime(w.toHz, peak);
    bp.frequency.exponentialRampToValueAtTime(Math.max(w.fromHz, w.toHz * 0.45), end);   // it darkens as it settles
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level * 0.15, t0 + seconds * w.peakAt * 0.45);     // a slow start, then the swell
    g.gain.linearRampToValueAtTime(level, peak);
    g.gain.exponentialRampToValueAtTime(0.0005, end);
    src.connect(bp).connect(g);
    const tap = (to, amount) => { if (to && amount > 0) { const s = ctx.createGain(); s.gain.value = amount; g.connect(s).connect(to); } };
    tap(pre, w.dry);
    tap(fxSends.reverb, w.reverb);      // the same reverb and echo as the music, only more of them
    tap(fxSends.delay, w.echo);
    whooshing = performance.now() + (end - t0) * 1000;
    caption('Sound: a rising whoosh as you fly into the arcade screen.');
    src.start(t0); src.stop(end + 0.05);
  } catch {}
}

async function ensureAudio() {
  unlockAudio();
  await ctx.ready;
  const node = world.start(ctx);
  if (!node.level) { node.level = ctx.createGain(); node.level.gain.value = 0; node.connect(node.level).connect(out); }   // each world has its own fader
  voices.set(world, node);
}

// Worlds fade into each other. Going to another world, the one you leave fades out while the new one fades in.
const voices = new Map();          // world -> its sound node
const FADE = 1.6;
function fade(w, to, seconds = FADE) {
  const node = voices.get(w); if (!node || !ctx) return;
  const g = node.level.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + seconds);
  clearTimeout(node.stopper);
  if (to === 0) node.stopper = setTimeout(() => { if (w !== world || !playing) w.setPlaying(false); }, seconds * 1000 + 60);
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
  if (on) { world.setPlaying(true); fade(world, 1, quiet ? FADE : 0.15); }
  else if (world) fade(world, 0, 0.25);                   // a short fade, so a pause does not click
  ui.play.textContent = on ? 'Pause' : 'Play';
  captionHead();
  if (world && on !== was && !quiet) say(on ? world.describe() : 'Paused. ' + world.describe());
}

// ---------- readouts and drawing ----------
function readouts(force) {
  if (!world) return;
  ui.date.textContent = world.timeText();
  if (force || document.activeElement !== ui.time) ui.time.value = Math.round(world.timeSlider * 1000);
  ui.time.setAttribute('aria-valuetext', world.timeAria());
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
  // The world we are in, or flying to, is drawn by the big globe itself the whole way, so there is
  // no handover to notice: the scene tells us where that world is and the globe is put there.
  const live = world && active ? planets.indexOf(active) : -1;
  const content = scene.mode === 'world' && !moving ? 0 : 1;      // 0: only the stars are needed from the scene
  if (content) drawPictures(live);
  const before = scene.progress;
  const s = scene.frame(dt, content, live);
  if (content) placeButtons(s);
  if (live >= 0) app.scope.place(s.moving ? s.spots[live] || { x: -9999, y: -9999, r: 2 } : null);
  if (!s.moving) for (const p of planets) p.scope.setSize(PIC);  // pictures go back to their small size once we have arrived
  const k = s.moving ? s.moving.k : before ? 1 : 0;
  // The controls fade out as a flight leaves a world and come back in at the end of a flight into one.
  // NASA's frame stays up between two worlds and fades from one picture to the next.
  const mv = s.moving, fromWorld = !!mv && mv.from.mode === 'world', toWorld = !!mv && mv.to.mode === 'world';
  const uiAlpha = mv ? Math.max(fromWorld ? 1 - smooth(k / 0.2) : 0, toWorld && world ? smooth((k - 0.72) / 0.28) : 0) : world ? 1 : 0;
  const frameAlpha = fromWorld && toWorld ? 1 : uiAlpha;
  ui.scopeCanvas.style.opacity = world ? '1' : '0';
  ui.player.style.opacity = String(uiAlpha); ui.tabs.style.opacity = String(ds ? Math.max(uiAlpha, 0.35) : 0);
  frame.style.opacity = String(frameAlpha);
  const mode = moving ? 'moving' : scene.mode;
  const playerHidden = mode !== 'world' && uiAlpha <= 0, frameHidden = (frameAlpha <= 0 && mode !== 'world') || !vid.dataset.src || (!nasaOn && frameAlpha <= 0);
  if (ui.player.hidden !== playerHidden) ui.player.hidden = playerHidden;
  if (frame.hidden !== frameHidden) frame.hidden = frameHidden;
  if (mode !== shownMode) {                               // only the place we are in can be touched
    shownMode = mode;
    ui.player.inert = mode !== 'world'; frame.inert = mode !== 'world'; ui.hub.hidden = mode !== 'menu';
    // arriving in a world: if focus was left on the menu (now hidden) or nowhere, put it on the globe
    const f = document.activeElement;
    if (mode === 'world' && !ui.about.open && (!f || f === document.body || ui.hub.contains(f))) ui.globe.focus({ preventScroll: true });
    if (mode === 'menu' && !ui.about.open) (planets[Math.max(0, scene.active)] || planets[0]).button.focus({ preventScroll: true });
    ui.header.hidden = scene.mode === 'attract' && !moving;
    ui.cc.hidden = ui.header.hidden;
    document.body.dataset.place = mode;
  }

  drawMeter(now);
  if (!world) return;
  if (playing && now - lastCaption > 3000) caption(world.describe());
  world.frame(dt);
  syncNasa(now);
  if (!(mv && k < 0.5)) readouts(false);                  // the old readouts fade out as they were
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
  ui.wav.disabled = true;
  try {
    const r = await world.renderWav(async (p) => { ui.status.textContent = `Exporting audio: ${Math.round(p * 100)}%`; await new Promise((res) => setTimeout(res)); });
    // run the dry render through the same reverb and echo as the live sound
    ui.status.textContent = 'Exporting audio: adding the room';
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
    Object.assign(ui.download, { href: wavUrl, download: name });
    ui.download.click();                                   // the browser asks where to save it
    ui.status.textContent = `Saved ${name} (${Math.round(r.secs)} seconds).`;
    say(`Audio exported: ${name}, ${Math.round(r.secs)} seconds.`);
    setTimeout(() => { if (ui.status.textContent.startsWith('Saved')) ui.status.textContent = ''; }, 6000);
  } catch (e) { ui.status.textContent = 'Could not export the audio: ' + e.message; }
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
    p('Pick a world. It all works from the keyboard, and a screen reader will tell you what\'s playing.');
    keys.hidden = true;
    $('credit').textContent = datasets.map((x) => `${x.title}: ${x.sourceTitle}, ${x.sourceUrl}.`).join(' ') + ' Coastlines: Natural Earth.';
  } else {
    p(d.about); d.sound.forEach(p);
    keys.hidden = false;
    const rows = [['Space', 'Play or pause'], ['← →', 'Turn the globe'], ['Shift ↑ ↓', 'Tilt the globe'], ['↑ ↓', d.speedKeys], [', .', d.timeKeys]];
    rows.push(['[ ]', 'Previous or next world'], ['S', 'Stop or start the turning'], ['D', 'Say what is playing'], ['M', 'Mute or unmute'], ['C', 'Show or hide the captions'],
      ['W', 'Export the audio as a WAV file'], ['I', 'This panel'], ['Esc', 'Close a panel, or back to the menu']);
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
// It has two videos that take turns: going to another world, the new picture fades in over the old one.
const frame = $('frame'), back = $('nasaback'), fbtn = $('framebtn'), vids = [...frame.querySelectorAll('video')];
let vid = vids[0], nasaOn = false, lastSeek = 0, pending = null;
const setShape = (v) => { if (v === vid && v.videoWidth) frame.style.setProperty('--ar', String(v.videoWidth / v.videoHeight)); };
vids.forEach((v) => v.addEventListener('loadedmetadata', () => { if (v !== pending?.v) setShape(v); }));
function showNasa(on) {
  nasaOn = !!on && !!ds?.video;
  if (frame.classList.contains('big')) bigNasa(false, true);
  if (!nasaOn) return;
  const a = $('framesrc'); a.href = ds.sourceUrl; a.textContent = ds.video.label;
  if (vid.dataset.src === ds.video.src) return;
  const showing = !frame.hidden && !!vid.dataset.src;
  const prev = vid;
  vid = showing ? vids.find((v) => v !== prev) : prev;
  vid.dataset.src = ds.video.src; vid.src = ds.video.src; lastSeek = 0;
  if (pending) pending.v.classList.remove('next');
  if (!showing) { vids.forEach((v) => v.classList.toggle('on', v === vid)); pending = null; return; }
  vid.classList.remove('on'); vid.classList.add('next');
  pending = { v: vid, prev, since: performance.now() };   // shown once it has the right moment on it
}
// The waiting picture fades in once it is at the right moment (or after a while, whatever it has).
function revealNasa(now, t) {
  const p = pending; if (!p || p.v !== vid) return;
  const ready = vid.readyState >= 2 && !vid.seeking && Math.abs(vid.currentTime - t) < 0.12;
  if (!ready && now - p.since < 1500) return;
  pending = null;
  frame.classList.add('swapping'); setShape(vid);
  vid.classList.add('on');
  setTimeout(() => {
    if (p.prev !== vid) p.prev.classList.remove('on');
    vid.classList.remove('next'); frame.classList.remove('swapping');
  }, 650);
}
// Click NASA's frame to see it large; click again or press Escape to put it back. The picture grows
// out of the small frame and shrinks back into it.
const BIG_MS = 420;
let bigTimer = 0;
function bigNasa(on, instant) {
  if (on === frame.classList.contains('big')) return;
  const first = fbtn.getBoundingClientRect();
  clearTimeout(bigTimer); fbtn.getAnimations().forEach((x) => x.cancel());
  frame.classList.toggle('big', on); frame.classList.add('lift');
  fbtn.setAttribute('aria-expanded', String(on));
  fbtn.setAttribute('aria-label', on ? "NASA's original animation, enlarged. Make small again." : "NASA's original animation, at the same moment. Enlarge.");
  if (on) { back.hidden = false; void back.offsetWidth; }
  back.classList.toggle('on', on);
  const done = () => { frame.classList.remove('lift'); if (!frame.classList.contains('big')) back.hidden = true; };
  if (instant) { back.classList.remove('on'); done(); return; }
  say(on ? `NASA's animation, enlarged: ${ds.sourceTitle}. Press Escape to close.` : "NASA's animation, small again.");
  const last = fbtn.getBoundingClientRect();
  if (REDUCE) fbtn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  else {
    const from = `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height})`;
    fbtn.animate([{ transform: from }, { transform: 'none' }], { duration: BIG_MS, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' });
    frame.querySelector('figcaption').animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: BIG_MS + 150 });   // the label comes once the picture has landed
  }
  bigTimer = setTimeout(done, REDUCE ? 400 : Math.max(BIG_MS, 400));
}
fbtn.addEventListener('click', () => bigNasa(!frame.classList.contains('big')));
back.addEventListener('click', () => bigNasa(false));
function syncNasa(now) {
  if (!nasaOn || !world || vid.readyState < 1) return;
  const t = Math.min(world.videoTime(), (vid.duration || 1e9) - 0.05);
  revealNasa(now, t);
  if (now - lastSeek < 180 || vid.seeking) return;
  if (Math.abs(vid.currentTime - t) > 0.06) { vid.currentTime = t; lastSeek = now; }
}

// ---------- volume, mute, meter ----------
function gainFor() { return muted ? 0 : Math.pow(volume / 100, 2); }
function applyGain() {
  if (master) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(gainFor(), t, 0.04); }
  ui.mute.setAttribute('aria-pressed', String(muted));
  ui.mute.textContent = muted ? 'Unmute' : 'Mute';
  ui.volume.value = String(volume);
  ui.volume.setAttribute('aria-valuetext', muted ? `${volume} percent, muted` : `${volume} percent`);
  captionHead();
}
function setMuted(on) { muted = on; store.set('muted', on); applyGain(); say(on ? 'Sound muted. The captions and the meter carry on.' : 'Sound on.'); }
ui.mute.addEventListener('click', () => setMuted(!muted));
ui.volume.addEventListener('input', () => { volume = Number(ui.volume.value); store.set('volume', volume); if (muted && volume > 0) { muted = false; store.set('muted', false); } applyGain(); });
ui.cctoggle.addEventListener('click', () => setCaptions(!ccOn));

// Two bars, left ear over right ear, with a peak mark that falls back slowly.
const mctx = ui.meter.getContext('2d'), mbuf = new Float32Array(1024), mlev = [0, 0], mpeak = [0, 0];
let mlast = 0;
function drawMeter(now) {
  const dt = Math.min(0.1, (now - mlast) / 1000 || 0); mlast = now;
  if (ui.cc.hidden) return;
  for (let c = 0; c < 2; c++) {
    let rms = 0;
    if (meters && ctx.state === 'running') { meters[c].getFloatTimeDomainData(mbuf); for (let i = 0; i < mbuf.length; i++) rms += mbuf[i] * mbuf[i]; rms = Math.sqrt(rms / mbuf.length); }
    const db = rms > 1e-5 ? 20 * Math.log10(rms) : -100, v = Math.max(0, Math.min(1, (db + 54) / 48));   // -54 dB to -6 dB
    mlev[c] = v > mlev[c] ? v : mlev[c] + (v - mlev[c]) * Math.min(1, dt * 8);
    mpeak[c] = Math.max(v, mpeak[c] - dt * 0.4);
  }
  const W = ui.meter.width, H = ui.meter.height, bh = (H - 4) / 2;
  mctx.clearRect(0, 0, W, H);
  for (let c = 0; c < 2; c++) {
    const y = c * (bh + 4);
    mctx.fillStyle = 'rgba(238,241,245,0.18)'; mctx.fillRect(0, y, W, bh);
    mctx.fillStyle = look.accent; mctx.fillRect(0, y, Math.round(W * mlev[c]), bh);
    mctx.fillRect(Math.min(W - 2, Math.round(W * mpeak[c])), y, 2, bh);
  }
}

// The globe gets what is left after the header, the captions and the date slider.
function layout() {
  ui.globe.style.bottom = `${BOTTOM()}px`;
  app.scope.resize(); app.scope.touch();
}

ui.home.addEventListener('click', goHome);
ui.play.addEventListener('click', () => { ui.status.textContent = ''; setPlaying(!playing); });
ui.wav.addEventListener('click', makeWav);
ui.info.addEventListener('click', showInfo);
ui.close.addEventListener('click', () => ui.about.close());
ui.about.addEventListener('click', (e) => { if (e.target === ui.about) ui.about.close(); });
ui.time.addEventListener('input', () => { if (world) { world.timeSlider = ui.time.value / 1000; readouts(false); } });
ui.time.addEventListener('change', () => world && say(world.describe()));

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
  if (k === 'Escape' && frame.classList.contains('big')) { e.preventDefault(); bigNasa(false); return; }
  if ((k === 'm' || k === 'M')) { e.preventDefault(); setMuted(!muted); return; }
  if ((k === 'c' || k === 'C')) { e.preventDefault(); setCaptions(!ccOn); say(ccOn ? 'Captions on.' : 'Captions off.'); return; }
  if (k === 'Escape' && !ds && scene.mode === 'menu' && !scene.moving) { e.preventDefault(); scene.go({ mode: 'attract' }, 1.6, attract); return; }   // back to the start
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

const sizeFrame = () => { const b = frameBox(); frame.style.setProperty('--fw', `${b.w}px`); };
window.addEventListener('resize', () => { layout(); scene?.resize(); sizeFrame(); });
sizeFrame();
applyGain(); setCaptions(ccOn); captionHead();
window.addEventListener('hashchange', () => route(false));
app.scope.resize();
build().then(() => route(true)).then(() => requestAnimationFrame(tick)).catch((e) => { ui.status.textContent = 'Could not load: ' + e.message; });
