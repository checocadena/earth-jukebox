import config from '../config.js';
import datasets, { project } from '../datasets.js';
import { makeScope } from './scope.js';
import { CELLS, projectCells, placeName } from './geo.js';
import { createEventsWorld } from './world-events.js';
import { createFieldWorld } from './world-field.js';
import { toWav } from './wav.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hub: $('hub'), player: $('player'), home: $('home'), title: $('title'),
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
const app = {
  settings,
  scope: makeScope($('scope'), settings.scope, look),
  view: { lon: settings.view.lon, lat: settings.view.lat },
  proj: { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) },
  ended() { setPlaying(false); say('End.'); },
};
const worlds = new Map();          // id -> promise of a loaded world
let ds = null, world = null, playing = false, coast = null;
let ctx = null, out = null, wavUrl = null, lastSaid = 0, lastFrame = 0;

function say(text) { ui.live.textContent = ''; setTimeout(() => { ui.live.textContent = text; }, 40); lastSaid = performance.now(); }

// ---------- hub ----------
async function buildHub() {
  coast = await fetch('data/coast.json').then((r) => r.json());
  app.scope.setCoast(coast);
  for (const d of datasets) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'world';
    const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
    const s = document.createElement('span'); s.textContent = d.title;
    b.append(c, s);
    b.addEventListener('click', () => { location.hash = d.id; });
    ui.hub.append(b);
    // a still of the world, drawn once its data has arrived
    load(d).then((w) => {
      const mini = makeScope(c, settings.scope, look, { top: 0, bottom: 0, ticks: false, fill: 0.47 });
      const proj = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) };
      const draw = () => {
        if (!c.getBoundingClientRect().width) return;      // hub hidden
        mini.resize(); mini.setCoast(coast); mini.setView(d.view.lon, d.view.lat);
        projectCells(d.view.lon, d.view.lat, proj); w.preview(mini, proj);
      };
      draw(); window.addEventListener('resize', draw); window.addEventListener('hashchange', () => setTimeout(draw));
    }).catch((e) => { ui.status.textContent = `Could not load ${d.title}: ${e.message}`; });
  }
}

function load(d) {
  if (!worlds.has(d.id)) worlds.set(d.id, (d.kind === 'events' ? createEventsWorld : createFieldWorld)(d, app));
  return worlds.get(d.id);
}

async function route() {
  const d = datasets.find((x) => x.id === location.hash.slice(1));
  await setPlaying(false);
  world = null; ds = d || null;
  document.body.classList.toggle('in-hub', !d);
  document.body.classList.toggle('in-world', !!d);
  ui.hub.hidden = !!d; ui.player.hidden = !d; ui.wav.hidden = !d; ui.download.hidden = true; ui.status.textContent = '';
  ui.title.textContent = d ? d.title : '';
  ui.ring.hidden = !(d && d.kind === 'events');
  ui.home.disabled = !d;
  document.title = d ? `${d.title} · ${project.title}` : project.title;
  if (!d) { say(`${project.title}. ${datasets.length} worlds: ${datasets.map((x) => x.title).join(', ')}.`); return; }
  $('intro').textContent = `${d.about} Space plays and pauses. Left and right arrows turn the globe, shift with up and down tilts it. ` +
    `Up and down arrows: ${d.speedKeys.toLowerCase()}. Comma and full stop: ${d.timeKeys.toLowerCase()}. D says what is playing. W makes a WAV file. Escape goes back to all worlds.`;
  const w = await load(d);
  if (ds !== d) return;                                   // left again while loading
  world = w;
  app.scope.setTicks(d.kind === 'events');               // month ticks only where the rim is a calendar
  app.scope.resize(); app.scope.clear();
  setView(d.view.lon, d.view.lat, true);
  ui.ring.setAttribute('aria-pressed', String(settings.ring.mix > 0));
  readouts(true);
  ui.globe.focus({ preventScroll: true });
  say(`${d.title}. ${d.about} Press space to play.`);
}

// ---------- view ----------
function setView(lon, lat, now) {
  app.view.lon = ((lon + 540) % 360) - 180;
  app.view.lat = Math.max(-70, Math.min(70, lat));
  projectCells(app.view.lon, app.view.lat, app.proj);
  app.scope.setView(app.view.lon, app.view.lat);
  world?.viewChanged(now);
}
const turn = (dLon, dLat) => {
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

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0); lastFrame = now;
  if (!world) return;
  world.frame(dt);
  readouts(false);
  if (playing && now - lastSaid > settings.describeEverySeconds * 1000) say(world.describe());
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
    rows.push(['D', 'Say what is playing'], ['W', 'Make a WAV file'], ['Esc', 'Back to all worlds']);
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
const goHome = () => { if (location.hash) location.hash = ''; };

ui.home.addEventListener('click', goHome);
ui.play.addEventListener('click', () => setPlaying(!playing));
ui.wav.addEventListener('click', makeWav);
ui.ring.addEventListener('click', () => setChord(ui.ring.getAttribute('aria-pressed') !== 'true'));
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
ui.globe.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; ui.globe.setPointerCapture(e.pointerId); });
ui.globe.addEventListener('pointermove', (e) => {
  if (!drag || !world) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 57.3 / app.scope.radius;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved > 6) setView(app.view.lon - dx * k, app.view.lat + dy * k);
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
  if (!world) return;
  if (k === 'Escape') { e.preventDefault(); goHome(); return; }
  if (tag === 'INPUT') return;                               // sliders keep their own arrow keys
  const step = settings.view.stepDegrees;
  const chord = () => world.hasChord && setChord(ui.ring.getAttribute('aria-pressed') !== 'true');
  const speed = (n) => { world.nudgeSpeed(n); readouts(true); say(world.speedAnnounce()); };
  const time = (n) => { world.stepTime(n); readouts(true); say(world.describe()); };
  const act = {
    ' ': tag === 'BUTTON' || tag === 'A' ? null : () => setPlaying(!playing),
    ArrowLeft: () => turn(-step, 0), ArrowRight: () => turn(step, 0),
    ArrowUp: () => (e.shiftKey ? turn(0, step) : speed(1)),
    ArrowDown: () => (e.shiftKey ? turn(0, -step) : speed(-1)),
    ',': () => time(-1), '.': () => time(1),
    Home: () => { world.timeSlider = 0; readouts(true); say(world.describe()); },
    d: () => say(world.describe()), D: () => say(world.describe()),
    w: makeWav, W: makeWav, c: chord, C: chord,
  }[k];
  if (!act) return;
  e.preventDefault();
  act();
});

window.addEventListener('resize', () => { app.scope.resize(); app.scope.touch(); });
window.addEventListener('hashchange', route);
app.scope.resize();
buildHub().then(route).then(() => requestAnimationFrame(tick)).catch((e) => { ui.status.textContent = 'Could not load: ' + e.message; });
