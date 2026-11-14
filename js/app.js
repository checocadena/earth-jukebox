import config from '../config.js';
import datasets from '../datasets.js';
import { Audifier } from './dsp.js';
import { makeScope } from './scope.js';
import { CELLS, projectCells, cellGains, frameCurves, placeName, gainReference } from './geo.js';
import { toWav } from './wav.js';

const $ = (id) => document.getElementById(id);
const ui = {
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
  if (settings.looks[params.get('look')]) settings.look = params.get('look');
  set(num('octaves', 0, 8), (v) => { settings.ring.octavesUp = v; });
  set(num('click', 200, 20000), (v) => { settings.click.lowpassHz = v; });
  set(num('reverb', 0, 1), (v) => { settings.effects.reverb = v; });
  set(num('delay', 0, 1), (v) => { settings.effects.delay = v; });
  set(num('speed', settings.speed.min, settings.speed.max), (v) => { settings.speed.start = v; });
}
const fx = settings.effects;

const look = settings.looks[settings.look];
document.documentElement.style.setProperty('--ink', look.ink);
document.documentElement.style.setProperty('--accent', look.accent);
document.documentElement.style.setProperty('--glow', `rgb(${look.dataGlow})`);
const scope = makeScope($('scope'), settings.scope, look);
let ds, data = null;                       // dataset entry, { frameStart, frameDay, cells, frames, endDay }
let view = { lon: config.view.lon, lat: config.view.lat };
const proj = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) };
const gL = new Float32Array(CELLS), gR = new Float32Array(CELLS);
let curveL, curveR, curveRef = 1, meanYear = null;
let speed = settings.speed.start, day = 0, playing = false;
let ctx = null, node = null;
let lastDrawDay = 0, curvesTimer = 0, wavUrl = null, lastSaid = 0;
const blips = new Int32Array(config.scope.maxBlipsPerFrame);
const seen = new Float32Array(CELLS);        // how many flashes each cell has shown so far

// ---------- loading ----------
async function load(entry) {
  ds = entry;
  $('title').textContent = ds.title;
  $('about-h').textContent = ds.title;
  $('about-text').textContent = ds.about;
  $('credit').textContent = ds.credit;
  const a = $('source'); a.href = ds.sourceUrl; a.textContent = ds.sourceTitle;
  $('intro').textContent = `${ds.about} One flash is one click. Space plays and pauses. Left and right arrows turn the globe. ` +
    'Up and down arrows make time run faster or slower. Comma and full stop move one month. D says what is playing. W makes a WAV file.';
  const [bin, coast] = await Promise.all([
    fetch(ds.events).then((r) => r.arrayBuffer()),
    fetch('data/coast.json').then((r) => r.json()),
  ]);
  const hl = new DataView(bin).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
  let o = 4 + hl;
  const frameStart = new Uint32Array(bin.slice(o, o + 4 * (head.frames + 1))); o += 4 * (head.frames + 1);
  const frameDay = new Float32Array(bin.slice(o, o + 4 * (head.frames + 1))); o += 4 * (head.frames + 1);
  const cells = new Uint16Array(bin.slice(o, o + 2 * head.events));
  for (let f = 1; f <= head.frames; f++) if (frameDay[f] < frameDay[f - 1] + 1e-3) frameDay[f] = frameDay[f - 1] + 1e-3;
  data = { frameStart, frameDay, cells, frames: head.frames, endDay: frameDay[head.frames], start: Date.parse(ds.startDate + 'T00:00:00Z') };
  curveL = new Float32Array(data.frames); curveR = new Float32Array(data.frames);
  scope.setCoast(coast);
  setView(config.view.lon, config.view.lat, true);
  data.ref = gainReference(cells, gL);        // levels are set against the starting view
  setView(view.lon, view.lat, true);
  setSpeed(speed, true);
  updateReadouts();
  if (node) node.port.postMessage({ data: copyData() });
}

const copyData = () => ({ frameStart: data.frameStart.slice(), frameDay: data.frameDay.slice(), cells: data.cells.slice(), ref: data.ref });

// ---------- view: which side of the Earth faces the listener ----------
function setView(lon, lat, now) {
  view.lon = ((lon + 540) % 360) - 180;
  view.lat = Math.max(-70, Math.min(70, lat));
  projectCells(view.lon, view.lat, proj);
  cellGains(proj, config.view.falloff, gL, gR);
  scope.setView(view.lon, view.lat);
  clearTimeout(curvesTimer);
  if (now) updateCurves(); else curvesTimer = setTimeout(updateCurves, 90);
  if (node) node.port.postMessage({ view: { gL: gL.slice(), gR: gR.slice(), curveL: curveL.slice(), curveR: curveR.slice() } });
}

function updateCurves() {
  if (!data) return;
  frameCurves(data.frameStart, data.cells, gL, gR, curveL, curveR);
  // reference for the rim trace: the mean rate (per day) of this view
  let sum = 0;
  for (let f = 0; f < data.frames; f++) sum += curveL[f] + curveR[f];
  curveRef = sum / data.endDay || 1;
  // the average year for this view, in 180 steps: the shape heard as a tone
  const M = 180, acc = new Float32Array(M), n = new Float32Array(M);
  for (let f = 0; f < data.frames; f++) {
    const d = data.frameDay[f], span = data.frameDay[f + 1] - d;
    const i = Math.floor(yearFrac(d + span / 2) * M) % M;
    acc[i] += (curveL[f] + curveR[f]); n[i] += span;
  }
  meanYear = new Float32Array(M + 1); meanYear.frac = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) { const j = i % M; meanYear[i] = n[j] ? acc[j] / n[j] / curveRef / 2 : 0; meanYear.frac[i] = i / M; }
  if (node) node.port.postMessage({ view: { gL: gL.slice(), gR: gR.slice(), curveL: curveL.slice(), curveR: curveR.slice() } });
}

// ---------- time helpers ----------
const dateOf = (d) => new Date(data.start + d * 86400000);
function yearFrac(d) {
  const t = dateOf(d), y0 = Date.UTC(t.getUTCFullYear(), 0, 1), y1 = Date.UTC(t.getUTCFullYear() + 1, 0, 1);
  return (t.getTime() - y0) / (y1 - y0);
}
function frameOf(d) {
  let lo = 0, hi = data.frames - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (data.frameDay[m] <= d) lo = m; else hi = m - 1; }
  return lo;
}
// lightning in view around day d, relative to this view's average (1 = average)
function rateAt(d, halfWindowDays = 4) {
  const f0 = frameOf(Math.max(0, d - halfWindowDays)), f1 = frameOf(Math.min(data.endDay - 1e-3, d + halfWindowDays));
  let s = 0;
  for (let f = f0; f <= f1; f++) s += curveL[f] + curveR[f];
  return s / (data.frameDay[f1 + 1] - data.frameDay[f0]) / curveRef;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function speedText(s, long) {
  const yr = s / 365.25;
  const n = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
  if (yr >= 1) return long ? `${n(yr)} years per second` : `${n(yr)} yr/s`;
  return long ? `${n(s)} days per second` : `${n(s)} d/s`;
}
const fastAll = () => speed > 730;   // more than two years a second: no single date makes sense

function updateReadouts() {
  if (!data) return;
  const t = dateOf(day);
  ui.date.textContent = fastAll() ? 'All years' : `${MONTHS[t.getUTCMonth()].slice(0, 3)} ${t.getUTCFullYear()}`;
  ui.speedv.textContent = speedText(speed);
  if (document.activeElement !== ui.time) ui.time.value = Math.round((day / data.endDay) * 1000);
  ui.time.setAttribute('aria-valuetext', `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`);
  ui.speed.setAttribute('aria-valuetext', speedText(speed, true));
}

// ---------- spoken description ----------
function say(text) { ui.live.textContent = ''; setTimeout(() => { ui.live.textContent = text; }, 40); }

function describe() {
  if (!data) return '';
  const where = `Facing ${placeName(view.lon, view.lat)}.`;
  if (fastAll()) {
    const hz = speed / 365.25;
    return `All years, ${speedText(speed, true)}. ${where} One year lasts ${(1000 / hz).toFixed(hz > 100 ? 1 : 0)} milliseconds, so the seasons sound as a tone near ${Math.round(hz)} hertz.`;
  }
  const t = dateOf(day), r = rateAt(day);
  const level = r < 0.3 ? 'very little lightning' : r < 0.7 ? 'less lightning than usual' : r < 1.4 ? 'about the usual amount of lightning'
    : r < 2.2 ? 'more lightning than usual' : `heavy lightning, about ${Math.round(r)} times the usual amount`;
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}. ${where} ${level[0].toUpperCase() + level.slice(1)} on this side of the Earth. ${speedText(speed, true)}.`;
}

// ---------- audio ----------
async function ensureAudio() {
  if (ctx) return;
  if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('js/dsp.js');
  node = new AudioWorkletNode(ctx, 'audifier', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { cfg: settings } });
  node.port.onmessage = (e) => {
    day = e.data.day;
    if (e.data.ended) { setPlaying(false); say('End.'); }
  };
  node.connect(ctx.destination);
  if (fx.reverb > 0) {                      // optional, off by default
    const len = Math.floor(ctx.sampleRate * fx.reverbSeconds), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = fx.reverb * 0.5;
    node.connect(conv).connect(wet).connect(ctx.destination);
  }
  if (fx.delay > 0) {
    const d = ctx.createDelay(2); d.delayTime.value = fx.delaySeconds;
    const fb = ctx.createGain(); fb.gain.value = fx.delayFeedback;
    const wet = ctx.createGain(); wet.gain.value = fx.delay;
    node.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(ctx.destination);
  }
  node.port.postMessage({ data: copyData(), view: { gL: gL.slice(), gR: gR.slice(), curveL: curveL.slice(), curveR: curveR.slice() }, speed, seek: day });
}

async function setPlaying(on) {
  if (on) {
    try { await ensureAudio(); await ctx.resume(); } catch (e) { ui.status.textContent = 'Sound could not start: ' + e.message; return; }
  }
  playing = on;
  node?.port.postMessage({ playing: on });
  ui.play.textContent = on ? 'Pause' : 'Play';
  lastSaid = performance.now();
  say(on ? describe() : 'Paused. ' + describe());
}

function setSpeed(s, quiet) {
  speed = Math.max(config.speed.min, Math.min(config.speed.max, s));
  node?.port.postMessage({ speed });
  const { min, max } = config.speed;
  if (document.activeElement !== ui.speed || quiet) ui.speed.value = Math.round((Math.log(speed / min) / Math.log(max / min)) * 1000);
  updateReadouts();
  if (!quiet) { lastSaid = performance.now(); say(fastAll() ? describe() : speedText(speed, true)); }
}

function seek(d) {
  day = Math.max(0, Math.min(data.endDay - 0.01, d));
  lastDrawDay = day;
  node?.port.postMessage({ seek: day });
  updateReadouts();
}

// ---------- drawing ----------
function tick() {
  requestAnimationFrame(tick);
  if (!data) return;
  let count = 0;
  if (playing) {
    // flashes between the last picture and this one
    let d0 = lastDrawDay, d1 = day;
    if (d1 < d0 || d1 - d0 > 400) d0 = Math.max(0, d1 - Math.min(400, speed / 30));   // looped or jumped
    const f0 = frameOf(d0), f1 = frameOf(d1);
    const i0 = data.frameStart[f0] + Math.floor((data.frameStart[f0 + 1] - data.frameStart[f0]) * Math.min(1, (d0 - data.frameDay[f0]) / (data.frameDay[f0 + 1] - data.frameDay[f0])));
    const i1 = data.frameStart[f1] + Math.floor((data.frameStart[f1 + 1] - data.frameStart[f1]) * Math.min(1, (d1 - data.frameDay[f1]) / (data.frameDay[f1 + 1] - data.frameDay[f1])));
    const n = Math.max(0, i1 - i0), cap = blips.length;
    if (n <= cap) { for (let i = 0; i < n; i++) blips[i] = data.cells[i0 + i]; count = n; }
    else { for (let i = 0; i < cap; i++) blips[i] = data.cells[i0 + Math.floor(Math.random() * n)]; count = cap; }
    for (let i = 0; i < count; i++) seen[blips[i]]++;
    lastDrawDay = d1;

    const now = performance.now();
    if (now - lastSaid > config.describeEverySeconds * 1000) { lastSaid = now; say(describe()); }
  }
  // the faint marks fade, playing or paused
  const fade = Math.pow(0.5, 1 / (60 * settings.scope.markHalfLifeSeconds));
  for (let i = 0; i < CELLS; i++) seen[i] *= fade;
  // rim trace: the past year up to now, or the average year when time runs very fast
  let trace = meanYear, traceAge = false;
  if (!fastAll() && meanYear) {
    const M = 120; trace = tick.trace || (tick.trace = Object.assign(new Float32Array(M), { frac: new Float32Array(M) }));
    let m = 0;
    for (; m < M; m++) {
      const d = day - (m / (M - 1)) * 330;
      if (d <= 3) break;                                   // nothing before the data starts
      trace[m] = rateAt(d, 3) / 2; trace.frac[m] = yearFrac(d);
    }
    trace.count = m;
    traceAge = true;
  }
  scope.frame({ blips, count, proj, seen, showMarker: !fastAll(), trace: trace && (trace.count ?? 2) >= 2 ? trace : null, traceAge, running: playing });
  updateReadouts();
}

// ---------- WAV ----------
async function makeWav() {
  if (!data || ui.wav.disabled) return;
  ui.wav.disabled = true; ui.download.hidden = true;
  try {
    const sr = config.render.sampleRate;
    const a = new Audifier(sr, settings);
    a.setData(data); a.setView({ gL, gR, curveL, curveR });
    a.speed = speed; a.playing = true;
    const pass = data.endDay / speed;                       // seconds for one pass through the data
    const fromStart = pass <= config.render.maxSeconds;
    const secs = pass < 5 ? config.render.toneSeconds : Math.min(pass, config.render.maxSeconds);
    a.seek(fromStart ? 0 : day);
    const total = Math.ceil(secs * sr), L = new Float32Array(total), R = new Float32Array(total);
    const chunk = sr;
    for (let i = 0; i < total; i += chunk) {
      const n = Math.min(chunk, total - i);
      a.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
      ui.status.textContent = `Making WAV: ${Math.round(((i + n) / total) * 100)}%`;
      await new Promise((r) => setTimeout(r));
    }
    const blob = toWav({ numberOfChannels: 2, sampleRate: sr, length: total, getChannelData: (c) => (c ? R : L) });
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(blob);
    const name = `earth-jukebox-${ds.id}-${speedText(speed).replace(/[ /.]+/g, '-')}.wav`;
    Object.assign(ui.download, { href: wavUrl, download: name, hidden: false });
    ui.download.textContent = `Download WAV, ${Math.round(secs)} s`;
    ui.download.setAttribute('aria-label', `Download ${name}, ${Math.round(secs)} seconds, ${(blob.size / 1048576).toFixed(1)} megabytes`);
    ui.status.textContent = '';
    ui.download.focus();
  } catch (e) { ui.status.textContent = 'Could not make the WAV file: ' + e.message; }
  ui.wav.disabled = false;
}

// ---------- controls ----------
const turn = (dLon, dLat) => { setView(view.lon + dLon, view.lat + dLat); lastSaid = performance.now(); say(`Facing ${placeName(view.lon, view.lat)}.`); };
ui.play.addEventListener('click', () => setPlaying(!playing));
ui.wav.addEventListener('click', makeWav);
// Chord on or off. The amount when on comes from config (or ?chord= in the address).
const ringOnMix = settings.ring.mix || settings.ring.onMix;
function setRing(on) {
  settings.ring.mix = on ? ringOnMix : 0;
  ui.ring.setAttribute('aria-pressed', String(on));
  node?.port.postMessage({ ring: settings.ring });
  say(on ? 'Chord on.' : 'Chord off.');
}
ui.ring.setAttribute('aria-pressed', String(settings.ring.mix > 0));
ui.ring.addEventListener('click', () => setRing(settings.ring.mix === 0));
ui.info.addEventListener('click', () => ui.about.showModal());
ui.close.addEventListener('click', () => ui.about.close());
ui.about.addEventListener('click', (e) => { if (e.target === ui.about) ui.about.close(); });
ui.time.addEventListener('input', () => seek((ui.time.value / 1000) * data.endDay));
ui.time.addEventListener('change', () => say(describe()));
ui.speed.addEventListener('input', () => { const { min, max } = config.speed; setSpeed(min * Math.pow(max / min, ui.speed.value / 1000), true); });
ui.speed.addEventListener('change', () => say(fastAll() ? describe() : speedText(speed, true)));

ui.globe.addEventListener('focus', () => scope.setFocus(ui.globe.matches(':focus-visible')));
ui.globe.addEventListener('blur', () => scope.setFocus(false));

// drag the globe; a tap plays or pauses
let drag = null;
ui.globe.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; ui.globe.setPointerCapture(e.pointerId); });
ui.globe.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 57.3 / scope.radius;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.moved > 6) setView(view.lon - dx * k, view.lat + dy * k);
});
ui.globe.addEventListener('pointerup', (e) => {
  if (drag && drag.moved <= 6 && scope.inside(e.clientX, e.clientY)) setPlaying(!playing);
  else if (drag) say(`Facing ${placeName(view.lon, view.lat)}.`);
  drag = null;
});
ui.globe.addEventListener('pointercancel', () => { drag = null; });
ui.globe.addEventListener('wheel', (e) => { e.preventDefault(); setSpeed(speed * Math.pow(2, -e.deltaY / 400), true); }, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || ui.about.open || !data) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT') return;                               // sliders keep their own arrow keys
  const step = config.view.stepDegrees, k = e.key;
  const act = {
    ' ': tag === 'BUTTON' || tag === 'A' ? null : () => setPlaying(!playing),
    ArrowLeft: () => turn(-step, 0), ArrowRight: () => turn(step, 0),
    ArrowUp: () => (e.shiftKey ? turn(0, step) : setSpeed(speed * Math.pow(2, 1 / 3))),
    ArrowDown: () => (e.shiftKey ? turn(0, -step) : setSpeed(speed / Math.pow(2, 1 / 3))),
    ',': () => { seek(day - 30.44); say(describe()); }, '.': () => { seek(day + 30.44); say(describe()); },
    Home: () => { seek(0); say(describe()); },
    d: () => say(describe()), D: () => say(describe()),
    w: makeWav, W: makeWav,
    c: () => setRing(settings.ring.mix === 0), C: () => setRing(settings.ring.mix === 0),
    i: () => ui.about.showModal(), '?': () => ui.about.showModal(),
  }[k];
  if (!act) return;
  e.preventDefault();
  act();
});

window.addEventListener('resize', scope.resize);
scope.resize();
load(datasets[0]).then(() => requestAnimationFrame(tick)).catch((e) => { ui.status.textContent = 'Could not load the data: ' + e.message; });
