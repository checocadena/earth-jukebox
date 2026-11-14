// Sound engine. Turns frame features into notes inside a scale.
// The same code drives live playback (AudioContext) and the WAV render
// (OfflineAudioContext), so the download sounds like the page.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function scaleNotes(config) {
  const steps = config.scales[config.scale] || config.scales.major;
  const root = NOTE_NAMES.indexOf(config.root);
  const base = 12 * (config.lowestOctave + 1) + (root < 0 ? 0 : root);
  const notes = [];
  for (let o = 0; o < config.octaveSpan; o++) for (const s of steps) notes.push(base + 12 * o + s);
  notes.push(base + 12 * config.octaveSpan);
  return { base, notes };
}

function norm(value, range) {
  if (!range) return clamp01(value);
  return clamp01((value - range[0]) / (range[1] - range[0] || 1));
}

// Value of a feature for one region of the grid.
function feature(source, region, row, col, grid) {
  if (source === 'row') return grid.rows > 1 ? 1 - row / (grid.rows - 1) : 0.5;
  if (source === 'column') return grid.columns > 1 ? col / (grid.columns - 1) : 0.5;
  return region?.[source] ?? 0;
}

export function stepSeconds(config) {
  return 60 / config.bpm / config.stepsPerBeat;
}

export function makeEngine(ctx, config, destination = ctx.destination) {
  const { notes, base } = scaleNotes(config);
  const grid = config.grid;
  const out = ctx.createGain();
  out.gain.value = config.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  out.connect(comp).connect(destination);

  // Drone: root and fifth through a low-pass filter.
  let drone = null;
  function startDrone(when) {
    if (!config.drone.enabled) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = config.drone.cutoffMin; filter.Q.value = 0.7;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const oscs = [0, 7, 12].map((iv, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(base - 12 + iv);
      o.detune.value = (i - 1) * 6;
      const g = ctx.createGain(); g.gain.value = i === 2 ? 0.4 : 0.6;
      o.connect(g).connect(filter);
      o.start(when);
      return o;
    });
    filter.connect(gain).connect(out);
    drone = { filter, gain, oscs };
  }
  function stopDrone(when) {
    if (!drone) return;
    drone.gain.gain.cancelScheduledValues(when);
    drone.gain.gain.setTargetAtTime(0, when, 0.15);
    for (const o of drone.oscs) o.stop(when + 1);
    drone = null;
  }

  function playNote(when, midi, vel, bright, pan, len) {
    const n = config.note;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + n.attack);
    g.gain.setTargetAtTime(0, when + n.attack, n.decay / 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = config.timbre.cutoffMin + bright * (config.timbre.cutoffMax - config.timbre.cutoffMin);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    const soft = ctx.createOscillator(); soft.type = n.waveSoft;
    const hard = ctx.createOscillator(); hard.type = n.waveBright;
    soft.frequency.value = hard.frequency.value = mtof(midi);
    hard.detune.value = 4;
    const gs = ctx.createGain(); gs.gain.value = 1 - bright * 0.7;
    const gh = ctx.createGain(); gh.gain.value = bright * 0.35;
    soft.connect(gs).connect(f); hard.connect(gh).connect(f);
    f.connect(g);
    if (p) g.connect(p).connect(out); else g.connect(out);
    const end = when + Math.max(len, n.attack) + n.decay * 1.5;
    soft.start(when); hard.start(when); soft.stop(end); hard.stop(end);
  }

  function bell(when) {
    const mb = config.monthBell;
    const freq = mtof(base + 12 * mb.octaveAboveRoot);
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(mb.gain * amp, when + 0.005);
      g.gain.setTargetAtTime(0, when + 0.005, 0.5 / mult);
      o.connect(g).connect(out);
      o.start(when); o.stop(when + 3);
    }
  }

  // One step: read one column of the grid and play its notes.
  function step(when, frame, index) {
    if (!frame) return;
    const col = index % grid.columns;
    const dur = stepSeconds(config);

    if (drone) {
      const d = config.drone;
      const level = norm(frame.total[d.source] ?? 0, d.range);
      const tc = dur * (1 + d.smoothing * 4);
      drone.gain.gain.setTargetAtTime(d.gainMax * level, when, tc);
      drone.filter.frequency.setTargetAtTime(d.cutoffMin + level * (d.cutoffMax - d.cutoffMin), when, tc);
    }

    const cands = [];
    let densSum = 0;
    for (let row = 0; row < grid.rows; row++) {
      const region = frame.regions[row * grid.columns + col];
      if (!region) continue;
      densSum += feature(config.density.source, region, row, col, grid);
      const trig = feature(config.trigger.source, region, row, col, grid);
      if (trig < config.trigger.threshold) continue;
      cands.push({ row, region, trig });
    }
    const dens = norm(densSum / grid.rows, config.density.range);
    const maxN = Math.max(1, Math.round(1 + dens * (config.density.maxNotes - 1)));
    cands.sort((a, b) => b.trig - a.trig);

    const used = new Set();
    const pan = grid.columns > 1 ? (col / (grid.columns - 1) * 2 - 1) * config.pan.width : 0;
    for (const c of cands.slice(0, maxN)) {
      const p = norm(feature(config.pitch.source, c.region, c.row, col, grid), config.pitch.range);
      const midi = notes[Math.round(p * (notes.length - 1))];
      if (used.has(midi)) continue;
      used.add(midi);
      const v = config.velocity;
      const vel = (v.min + norm(feature(v.source, c.region, c.row, col, grid), v.range) * (v.max - v.min)) * 0.3;
      const bright = norm(feature(config.timbre.source, c.region, c.row, col, grid), config.timbre.range);
      playNote(when, midi, vel, bright, pan, dur * config.note.lengthInSteps);
    }
  }

  return { out, startDrone, stopDrone, step, bell };
}

// Render a whole visualization to an AudioBuffer, offline.
// frameAt(videoTime) returns features; dateAt(videoTime) returns a Date.
export async function renderOffline(config, duration, frameAt, dateAt, speed = 1) {
  const sr = config.render.sampleRate;
  const len = duration / speed;
  const tail = 3;
  const ctx = new OfflineAudioContext(2, Math.ceil((len + tail) * sr), sr);
  const eng = makeEngine(ctx, config);
  eng.startDrone(0);
  const dur = stepSeconds(config);
  let lastMonth = null;
  for (let i = 0, t = 0; t < len; i++, t = i * dur) {
    const vt = t * speed;
    eng.step(t, frameAt(vt), i);
    if (config.monthBell.enabled && dateAt) {
      const d = dateAt(vt);
      const m = d.getUTCMonth();
      if (lastMonth !== null && m !== lastMonth) eng.bell(t);
      lastMonth = m;
    }
  }
  eng.stopDrone(len);
  return ctx.startRendering();
}
