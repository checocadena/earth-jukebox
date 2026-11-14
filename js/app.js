import config from '../config.js';
import visualizations from '../visualizations.js';
import { makeAnalyzer, makeTrack, scanVideo } from './analyze.js';
import { makeEngine, renderOffline, stepSeconds } from './engine.js';
import { makeDater, fmtDate, viewAt, describe } from './describe.js';
import { toWav } from './wav.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), overlay = $('overlay');
const ui = {
  play: $('play'), back: $('back'), fwd: $('fwd'), describe: $('describe'), seek: $('seek'),
  volume: $('volume'), speed: $('speed'), soundonly: $('soundonly'), autodesc: $('autodesc'),
  render: $('render'), download: $('download'), renderStatus: $('render-status'),
  live: $('live'), alert: $('alert'), date: $('date-readout'), ice: $('ice-readout'),
};

let vis, dateAt, analyze, track = null;
let liveFrame = null;          // features of the frame on screen now
let liveTime = -1;             // video time when liveFrame was read
let ctx = null, engine = null, volumeNode = null;
let timer = null, nextTime = 0, stepIndex = 0, lastMonth = null;
let autoDescribe = true, lastDescribedDay = null, lastPct = null, lastView = null;
let wavUrl = null;

// ---------- announcements ----------
function say(text, urgent = false) {
  const el = urgent ? ui.alert : ui.live;
  el.textContent = '';
  // Small delay so screen readers notice repeated text.
  setTimeout(() => { el.textContent = text; }, 50);
}

// ---------- setup ----------
function fillPicker() {
  const sel = $('vis-select');
  for (const v of visualizations) sel.append(new Option(v.title, v.id));
  sel.addEventListener('change', () => load(sel.value));
}

async function load(id) {
  pause();
  vis = visualizations.find((v) => v.id === id) || visualizations[0];
  dateAt = makeDater(vis);
  analyze = makeAnalyzer(config.grid, vis.exclude);
  $('vis-title').textContent = vis.title;
  $('vis-summary').textContent = vis.summary;
  $('credit').textContent = vis.credit;
  const a = $('source-link'); a.href = vis.sourceUrl; a.textContent = vis.sourceUrl;
  video.poster = vis.poster;
  video.src = vis.video;
  ui.download.hidden = true;
  lastDescribedDay = null; lastPct = null; lastView = null; liveFrame = null;
  track = null;
  try {
    const res = await fetch(vis.features);
    if (res.ok) {
      const json = await res.json();
      // A precomputed track only fits if it used the same grid as config.js.
      if (json.grid?.columns === config.grid.columns && json.grid?.rows === config.grid.rows) track = makeTrack(json);
    }
  } catch { /* no track: we scan the video when needed */ }
  updateReadouts();
}

function describeMapping() {
  const c = config;
  $('mapping-note').textContent =
    'Placeholder sound settings. The composer has not chosen the scale, root or pitch mapping yet; these are working defaults.';
  $('mapping-detail').textContent =
    `Now: ${c.root} ${c.scale} scale over ${c.octaveSpan} octaves, ${c.bpm} beats per minute. ` +
    `Pitch follows ${c.pitch.source === 'row' ? 'height in the picture (higher on screen is a higher note)' : c.pitch.source}. ` +
    `A note plays where ${c.trigger.source} passes ${Math.round(c.trigger.threshold * 100)} percent. ` +
    `Brightness opens up the tone.`;
}

// ---------- audio ----------
function ensureAudio() {
  if (ctx) return;
  if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch {} }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  volumeNode = ctx.createGain();
  volumeNode.gain.value = ui.volume.value / 100;
  volumeNode.connect(ctx.destination);
  engine = makeEngine(ctx, config, volumeNode);
}

function currentFrame() {
  // Use the live reading if it is fresh; otherwise the precomputed track
  // (for example when the browser stops painting a hidden video).
  if (liveFrame && Math.abs(video.currentTime - liveTime) < 0.5) return liveFrame;
  return track ? track.at(video.currentTime) : null;
}

function tick() {
  const dur = stepSeconds(config);
  while (nextTime < ctx.currentTime + 0.15) {
    engine.step(nextTime, currentFrame(), stepIndex);
    if (config.monthBell.enabled) {
      const m = dateAt(video.currentTime).getUTCMonth();
      if (lastMonth !== null && m !== lastMonth) engine.bell(nextTime);
      lastMonth = m;
    }
    nextTime += dur;
    stepIndex++;
  }
}

// ---------- live frame analysis ----------
function watchFrames() {
  const onFrame = () => {
    if (video.paused) return;
    try { liveFrame = analyze(video); liveTime = video.currentTime; } catch { liveFrame = null; }
    drawOverlay();
    updateReadouts();
    autoAnnounce();
    schedule();
  };
  const schedule = () => video.requestVideoFrameCallback
    ? video.requestVideoFrameCallback(onFrame)
    : requestAnimationFrame(onFrame);
  schedule();
}

function drawOverlay() {
  const r = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (overlay.width !== Math.round(r.width * dpr)) { overlay.width = Math.round(r.width * dpr); overlay.height = Math.round(r.height * dpr); }
  const g = overlay.getContext('2d');
  g.clearRect(0, 0, overlay.width, overlay.height);
  if (video.paused || !ctx) return;
  const cols = config.grid.columns;
  const col = ((stepIndex - 1) % cols + cols) % cols;
  const w = overlay.width / cols;
  g.fillStyle = 'rgba(143, 214, 255, 0.12)';
  g.fillRect(col * w, 0, w, overlay.height);
  g.strokeStyle = 'rgba(255, 211, 77, 0.8)';
  g.lineWidth = 2 * dpr;
  g.strokeRect(col * w + dpr, dpr, w - 2 * dpr, overlay.height - 2 * dpr);
}

// ---------- descriptions ----------
function updateReadouts() {
  if (!vis) return;
  const t = video.currentTime || 0;
  const d = fmtDate(dateAt(t));
  ui.date.textContent = d;
  const f = currentFrame();
  ui.ice.textContent = f ? `Sea ice in view: ${Math.round(f.total.ice * 100)}%` : 'Sea ice in view: –';
  if (video.duration) {
    ui.seek.value = Math.round((t / video.duration) * 1000);
    ui.seek.setAttribute('aria-valuetext', `${d}, ${Math.round(t)} of ${Math.round(video.duration)} seconds`);
  }
}

function describeNow(urgent) {
  const t = video.currentTime || 0;
  const r = describe(vis, currentFrame(), t, dateAt, config.grid, lastPct);
  const view = viewAt(vis, t);
  lastPct = r.pct ?? lastPct;
  lastView = view;
  lastDescribedDay = dateAt(t).getTime() / 86400000;
  say(`${r.text} ${view.text}`, urgent);
}

function autoAnnounce() {
  if (!autoDescribe) return;
  const t = video.currentTime;
  const day = dateAt(t).getTime() / 86400000;
  const view = viewAt(vis, t);
  if (lastDescribedDay === null || view !== lastView || day - lastDescribedDay >= config.describeEveryDays) describeNow(false);
}

// ---------- transport ----------
async function play() {
  ensureAudio();
  await ctx.resume();
  if (video.ended || video.currentTime >= video.duration - 0.05) video.currentTime = 0;
  try { await video.play(); } catch (e) { say('The video could not start. ' + e.message, true); return; }
  engine.startDrone(ctx.currentTime);
  nextTime = ctx.currentTime + 0.05;
  lastMonth = null;
  clearInterval(timer);
  timer = setInterval(tick, 25);
  tick();
  watchFrames();
  ui.play.textContent = 'Pause';
  if (autoDescribe) describeNow(false);
}

function pause() {
  if (!video.paused) video.pause();
  clearInterval(timer); timer = null;
  if (engine && ctx) engine.stopDrone(ctx.currentTime);
  ui.play.textContent = 'Play';
  drawOverlay();
}

function toggle() { video.paused ? play() : (pause(), say('Paused. ' + fmtDate(dateAt(video.currentTime)))); }

function seekBy(s) { seekTo((video.currentTime || 0) + s); }
function seekTo(t) {
  if (!video.duration) return;
  video.currentTime = Math.max(0, Math.min(video.duration - 0.05, t));
  if (video.paused) liveFrame = null;
}

video.addEventListener('seeked', () => {
  if (video.paused) { try { liveFrame = analyze(video); liveTime = video.currentTime; } catch {} }
  updateReadouts();
  lastMonth = null;
  describeNow(false);
});
video.addEventListener('ended', () => { pause(); say('End of the animation. ' + viewAt(vis, video.duration).text); });
video.addEventListener('loadedmetadata', updateReadouts);

// ---------- WAV ----------
async function makeWav() {
  ui.render.disabled = true;
  ui.download.hidden = true;
  const speed = Number(ui.speed.value);
  try {
    if (!track) {
      pause();
      ui.renderStatus.textContent = 'Reading the animation frame by frame…';
      const json = await scanVideo(video, analyze, 5, (p) => {
        ui.renderStatus.textContent = `Reading the animation: ${Math.round(p * 100)}%`;
      });
      json.grid = config.grid;
      track = makeTrack(json);
    }
    ui.renderStatus.textContent = 'Rendering sound…';
    const buf = await renderOffline(config, track.duration, (t) => track.at(t), dateAt, speed);
    const blob = toWav(buf);
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(blob);
    const name = `earth-jukebox-${vis.id}${speed !== 1 ? '-speed-' + speed : ''}.wav`;
    ui.download.href = wavUrl;
    ui.download.download = name;
    ui.download.textContent = `Download ${name} (${(blob.size / 1048576).toFixed(1)} MB, ${Math.round(buf.duration)} seconds)`;
    ui.download.hidden = false;
    ui.renderStatus.textContent = 'WAV file ready.';
    ui.download.focus();
  } catch (e) {
    ui.renderStatus.textContent = 'Could not make the WAV file: ' + e.message;
  } finally {
    ui.render.disabled = false;
  }
}

// ---------- controls ----------
function setSoundOnly(on) {
  document.body.classList.toggle('soundonly', on);
  ui.soundonly.setAttribute('aria-pressed', String(on));
  $('soundonly-note').hidden = !on;
  say(on ? 'Sound only mode on. The picture is hidden.' : 'Picture shown again.');
}
function setAuto(on) {
  autoDescribe = on;
  ui.autodesc.setAttribute('aria-pressed', String(on));
  say(on ? 'Spoken updates on.' : 'Spoken updates off. Press D to hear a description.', true);
}
function setVolume(v) {
  v = Math.max(0, Math.min(100, v));
  ui.volume.value = v;
  if (volumeNode) volumeNode.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.02);
}
function setSpeed(dir) {
  const opts = [...ui.speed.options].map((o) => o.value);
  const i = Math.max(0, Math.min(opts.length - 1, opts.indexOf(ui.speed.value) + dir));
  ui.speed.value = opts[i];
  applySpeed();
  say(`Speed: ${ui.speed.options[i].text}`);
}
function applySpeed() { video.playbackRate = Number(ui.speed.value); }

ui.play.addEventListener('click', toggle);
ui.back.addEventListener('click', () => seekBy(-5));
ui.fwd.addEventListener('click', () => seekBy(5));
ui.describe.addEventListener('click', () => describeNow(true));
ui.seek.addEventListener('input', () => seekTo((ui.seek.value / 1000) * video.duration));
ui.volume.addEventListener('input', () => setVolume(Number(ui.volume.value)));
ui.speed.addEventListener('change', applySpeed);
ui.soundonly.addEventListener('click', () => setSoundOnly(ui.soundonly.getAttribute('aria-pressed') !== 'true'));
ui.autodesc.addEventListener('click', () => setAuto(!autoDescribe));
ui.render.addEventListener('click', makeWav);

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  const onButton = tag === 'BUTTON' || tag === 'A';
  const k = e.key;
  if (inField && k !== 'Escape') return; // let sliders and menus use their own keys
  const act = {
    ' ': onButton ? null : toggle, k: toggle, K: toggle,
    ArrowLeft: () => seekBy(-5), ArrowRight: () => seekBy(5),
    Home: () => seekTo(0), End: () => seekTo(video.duration),
    ArrowUp: () => { setVolume(Number(ui.volume.value) + 10); say(`Volume ${ui.volume.value}`); },
    ArrowDown: () => { setVolume(Number(ui.volume.value) - 10); say(`Volume ${ui.volume.value}`); },
    '[': () => setSpeed(-1), ']': () => setSpeed(1),
    d: () => describeNow(true), D: () => describeNow(true),
    a: () => setAuto(!autoDescribe), A: () => setAuto(!autoDescribe),
    s: () => setSoundOnly(ui.soundonly.getAttribute('aria-pressed') !== 'true'),
    S: () => setSoundOnly(ui.soundonly.getAttribute('aria-pressed') !== 'true'),
    w: makeWav, W: makeWav,
    Escape: () => { e.target.blur?.(); $('controls').focus(); },
  }[k];
  if (!act) return;
  e.preventDefault();
  act();
});

// For tools/build-features.mjs: scan the video and return the packed track.
window.__buildFeatures = async () => {
  await new Promise((r) => (video.readyState >= 1 ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  const json = await scanVideo(video, analyze, 5);
  json.grid = config.grid;
  return json;
};

fillPicker();
describeMapping();
const fromHash = location.hash.slice(1);
load(visualizations.some((v) => v.id === fromHash) ? fromHash : visualizations[0].id);
