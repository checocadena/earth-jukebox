// A world made of maps: one value per place, per step in time (night lights
// by year, ocean temperature by month).
// Sound: each chosen line of latitude is a voice. A read head runs along it,
// and what it passes on the side of the Earth facing you is that voice's
// waveform. Shorter circles sound higher (pitch = equator pitch / cos latitude).
// As the Earth turns and the years pass, the voices swell, fade and change.

import { Scanner } from './dsp.js';
import { CELLS, COLS, ROWS, placeName } from './geo.js';

export async function createFieldWorld(ds, app) {
  const { settings } = app, cfg = settings.scan;
  const bin = await fetch(ds.maps).then((r) => r.arrayBuffer());
  const hl = new DataView(bin).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
  const labels = head.labels || head.years.map(String), S = labels.length;
  const packed = new Uint8Array(bin, 4 + hl);              // S maps of CELLS, one byte per cell
  const sqrt = head.encoding === 'sqrt', gaps = head.nodata === 0;   // gaps: 0 means "no data here" (land, for the ocean)
  const rate = ds.stepsPerSecond || cfg.stepsPerSecond;
  const vframes = ds.video && (ds.video.frames || head.frames);   // NASA's frame for each step

  // value 0..1 at step position t (between maps y0 and y1); -1 where there is no data
  const value = (y0, y1, t, i) => {
    const a = packed[y0 * CELLS + i], b = packed[y1 * CELLS + i];
    if (gaps && (a === 0 || b === 0)) return -1;
    const u = (a + (b - a) * t) / 255;
    return sqrt ? u * u : u;
  };

  // Smooth data would paint the whole map solid. Only the upper part of the range is
  // drawn, growing quickly, so warm water glows and cool water stays black.
  const shade = (u) => { const k = Math.max(0, (u - 0.45) / 0.55); return 0.75 * k * k; };

  const lines = cfg.linesDegrees.map((lat) => {
    const c = Math.round(89.5 - lat), rows = [];
    for (let r = Math.round(c - cfg.bandDegrees); r <= Math.round(c + cfg.bandDegrees); r++) if (r >= 0 && r < ROWS) rows.push(r);
    return {
      lat, row: Math.max(0, Math.min(ROWS - 1, c)), rows, ratio: 1 / Math.cos((lat * Math.PI) / 180),
      wave: new Float32Array(COLS), sky: new Float32Array(COLS), L: new Float32Array(COLS), R: new Float32Array(COLS), level: 0, facing: 0, facingFirst: 0,
    };
  });

  // values along one line at one moment; places with no data take the line's average
  function readLine(ln, y0, y1, t, out) {
    let sum = 0, n = 0;
    for (let col = 0; col < COLS; col++) {
      let v = 0, k = 0;
      for (const r of ln.rows) { const x = value(y0, y1, t, r * COLS + col); if (x >= 0) { v += x; k++; } }
      out[col] = k ? v / k : -1;
      if (k) { sum += out[col]; n++; }
    }
    const mean = n ? sum / n : 0;
    for (let col = 0; col < COLS; col++) if (out[col] < 0) out[col] = mean;
    return mean;
  }

  // Loudness and drawing references, from the last step.
  let loud = 1e-6, top = 1e-6;
  for (const ln of lines) {
    const mean = readLine(ln, S - 1, S - 1, 0, ln.wave);
    let ss = 0;
    for (let c = 0; c < COLS; c++) { ss += (ln.wave[c] - mean) ** 2; top = Math.max(top, ln.wave[c]); }
    loud = Math.max(loud, Math.sqrt(ss / COLS));
  }
  const gain = cfg.level / loud / Math.sqrt(lines.length / 3);

  let pos = 0, freq = cfg.startHz, playing = false, node = null, lastPost = 0, fieldAt = -1;
  const field = new Float32Array(CELLS);                   // what is drawn
  const tmp = new Float32Array(COLS);

  // Build every voice's table for a view (proj) and a moment (p).
  function tables(proj, p, target) {
    const y0 = Math.min(S - 1, Math.floor(p)), y1 = Math.min(S - 1, y0 + 1), t = p - y0;
    for (const ln of lines) {
      const mean = readLine(ln, y0, y1, t, ln.wave);
      const first = target ? null : (readLine(ln, 0, 0, 0, tmp), tmp);
      // Smooth data such as temperature: what counts is how each point differs from the
      // rest of its line, so the line's average is taken away before anything else.
      const off = ds.anomaly ? mean : 0;
      // heard where it is: near side loud, far side faint, left to right across the ears
      let mL = 0, mR = 0, facing = 0, facingFirst = 0;
      for (let col = 0; col < COLS; col++) {
        const i = ln.row * COLS + col, z = proj.z[i];
        const near = z > 0 ? Math.pow(z, settings.view.falloff || 1) : 0;
        const w = cfg.backLevel + (1 - cfg.backLevel) * near, a = ((proj.x[i] + 1) * Math.PI) / 4;
        ln.L[col] = (ln.wave[col] - off) * w * Math.cos(a); ln.R[col] = (ln.wave[col] - off) * w * Math.sin(a);
        mL += ln.L[col]; mR += ln.R[col];
        facing += ln.wave[col] * near; if (first) facingFirst += first[col] * near;
      }
      mL /= COLS; mR /= COLS;
      let ss = 0;
      for (let col = 0; col < COLS; col++) {
        ln.L[col] = (ln.L[col] - mL) * gain; ln.R[col] = (ln.R[col] - mR) * gain;
        ss += ln.L[col] ** 2 + ln.R[col] ** 2;
      }
      ln.level = Math.sqrt(ss / COLS) / cfg.level;
      ln.facing = facing; if (first) ln.facingFirst = facingFirst;
    }
    return lines.map((ln) => ({ ratio: ln.ratio, L: ln.L.slice(), R: ln.R.slice() }));
  }

  function update(force) {
    const p = Math.min(S - 1, pos);
    if (force || Math.abs(p - fieldAt) > 0.02) {
      fieldAt = p;
      const y0 = Math.min(S - 1, Math.floor(p)), y1 = Math.min(S - 1, y0 + 1), t = p - y0;
      for (let i = 0; i < CELLS; i++) {
        const a = packed[y0 * CELLS + i], b = packed[y1 * CELLS + i];
        const u = gaps && (a === 0 || b === 0) ? 0 : (a + (b - a) * t) / 255;
        field[i] = sqrt ? u : shade(u);
      }
    }
    app.scope.touch();
    const list = tables(app.proj, p);
    for (const ln of lines) {
      if (sqrt) { for (let c = 0; c < COLS; c++) ln.sky[c] = Math.min(1.4, Math.sqrt(ln.wave[c] / top)); continue; }
      // smooth data (temperature): draw how far each point is from the line's own average, enlarged
      let mean = 0; for (let c = 0; c < COLS; c++) mean += ln.wave[c]; mean /= COLS;
      for (let c = 0; c < COLS; c++) ln.sky[c] = Math.max(-1, Math.min(1.4, ((ln.wave[c] - mean) / top) * 5));
    }
    const now = performance.now();
    if (node && (force || now - lastPost > cfg.crossfadeSeconds * 1000)) { lastPost = now; node.port.postMessage({ tables: list }); }
  }

  const label = () => labels[Math.min(S - 1, Math.round(pos))];
  const hzText = (long) => (long ? `Equator line at ${Math.round(freq)} hertz` : `${Math.round(freq)} Hz`);
  const latText = (lat) => (Math.abs(lat) < 1 ? 'the equator' : `${Math.round(Math.abs(lat))} degrees ${lat > 0 ? 'north' : 'south'}`);

  const world = {
    kind: 'field', hasChord: false,

    viewChanged() { update(true); },

    start(ctx) {
      if (node) return node;
      node = new AudioWorkletNode(ctx, 'scanner', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { cfg: settings } });
      node.port.postMessage({ freq, tables: tables(app.proj, Math.min(S - 1, pos)) });
      return node;
    },
    setPlaying(on) { playing = on; node?.port.postMessage({ playing: on }); },
    setChord() {},

    speedText: hzText,
    speedAnnounce: () => hzText(true),
    get speedSlider() { return Math.log(freq / cfg.minHz) / Math.log(cfg.maxHz / cfg.minHz); },
    set speedSlider(v) { world.setSpeed(cfg.minHz * Math.pow(cfg.maxHz / cfg.minHz, v)); },
    setSpeed(f) { freq = Math.max(cfg.minHz, Math.min(cfg.maxHz, f)); node?.port.postMessage({ freq }); },
    nudgeSpeed(steps) { world.setSpeed(freq * Math.pow(2, steps / 12)); },   // one step is a semitone

    get timeSlider() { return Math.min(S - 1, pos) / (S - 1); },
    set timeSlider(v) { pos = Math.max(0, Math.min(S - 1, v * (S - 1))); update(true); },
    stepTime(dir) { pos = Math.max(0, Math.min(S - 1, Math.round(Math.min(S - 1, pos)) + dir)); update(true); },
    timeText: label,
    timeAria: label,
    // where NASA's own animation is at this moment, in seconds
    videoTime() {
      if (!vframes) return 0;
      const p = Math.min(S - 1, pos), y0 = Math.floor(p), y1 = Math.min(S - 1, y0 + 1);
      return (vframes[y0] + (vframes[y1] - vframes[y0]) * (p - y0)) / ds.video.fps;
    },

    frame(dt) {
      if (playing) {
        pos += dt * rate;
        if (pos >= S - 1 + rate * 4) pos = 0;              // hold on the last step for a few seconds, then start again
        update(false);
      }
      app.scope.frame({
        blips: null, count: 0, proj: app.proj, field,
        skylines: lines.map((ln) => ({ lat: ln.lat, values: ln.sky, lift: ds.lift || 5, level: ln.level })),
      });
    },

    describe() {
      const best = lines.reduce((a, b) => (b.level > a.level ? b : a));
      let now = 0, first = 0;
      for (const ln of lines) { now += ln.facing; first += ln.facingFirst; }
      const change = first > 1e-6 ? Math.round((now / first - 1) * 100) : 0;
      const versus = !ds.compare || Math.round(pos) === 0 ? '' : change >= 1 ? ` ${ds.compare} on this side: ${change} percent more than in ${labels[0]}.`
        : change <= -1 ? ` ${ds.compare} on this side: ${-change} percent less than in ${labels[0]}.` : ` ${ds.compare} on this side: the same as in ${labels[0]}.`;
      const quiet = best.level < 0.05 ? ` ${ds.quiet || 'Very little here.'}` : ` The loudest line is ${latText(best.lat)}.`;
      return `${label()}. Facing ${placeName(app.view.lon, app.view.lat)}.${quiet}${versus} ${hzText(true)}.`;
    },

    async renderWav(progress) {
      const sr = settings.render.sampleRate, a = new Scanner(sr, settings);
      a.freq = freq; a.playing = true;
      const turn = settings.spin.secondsPerTurn;
      const secs = Math.min(settings.render.maxSeconds, Math.max(turn, (S - 1) / rate + 2)), total = Math.ceil(secs * sr);
      const L = new Float32Array(total), R = new Float32Array(total), step = Math.round(sr / 10);
      const proj = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) };
      for (let i = 0; i < total; i += step) {
        const t = i / sr;
        app.projFor(app.view.lon + (t * 360) / turn, proj);
        a.setTables(tables(proj, Math.min(S - 1, t * rate), true));
        const n = Math.min(step, total - i);
        a.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
        if (i % (sr * 2) < step) await progress((i + n) / total);
      }
      update(true);
      return { L, R, sr, secs, tag: `${Math.round(freq)}-hz` };
    },

    preview(scope, proj) {
      const f = new Float32Array(CELLS);
      for (let i = 0; i < CELLS; i++) { const u = packed[(S - 1) * CELLS + i] / 255; f[i] = sqrt ? u : shade(u); }
      scope.frame({ blips: null, count: 0, proj, field: f });
    },
  };
  update(true);
  return world;
}
