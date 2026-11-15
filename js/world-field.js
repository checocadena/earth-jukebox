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
  // How this world sounds: held voices (pad), plucked notes, or both. All from config.js.
  const snd = settings.worlds?.[ds.id] || { rootHz: 110, pad: { level: 0.2, harmonics: 8, octave: 0 }, pluck: null };
  const padLevel = snd.pad?.level || 0, padShift = Math.pow(2, snd.pad?.octave || 0);
  const gain = padLevel / loud / Math.sqrt(lines.length / 3);

  let pos = 0, freq = snd.rootHz, playing = false, node = null, lastPost = 0, fieldAt = -1, lastCol = null;
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
      ln.level = Math.sqrt(ss / COLS) / (padLevel || 1);
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
  const hzText = (long) => (long ? `Equator note at ${Math.round(freq)} hertz` : `${Math.round(freq)} Hz`);

  // The music box. The Earth is the drum and bright places are its pins: when a bright
  // place on a line crosses the middle of the globe, it plucks that line's note.
  // from, to: the longitude at the middle before and now. emit(freq, gainL, gainR, decay).
  function pins(from, to, viewLat, emit) {
    const pk = snd.pluck; if (!pk) return;
    let d = ((to - from + 540) % 360) - 180;              // degrees turned, the short way
    const dir = d < 0 ? -1 : 1; d = Math.min(12, Math.abs(Math.round(d)));
    for (let k = 1; k <= d; k++) {
      const col = (((Math.round(from) + dir * k + 180) % COLS) + COLS) % COLS;
      for (const ln of lines) {
        if (Math.cos(((ln.lat - viewLat) * Math.PI) / 180) < 0.25) continue;      // that line is not in view
        const v = ln.wave[col], a = ln.wave[(col + COLS - 1) % COLS], b = ln.wave[(col + 1) % COLS];
        const bright = Math.sqrt(v / top);
        if (bright < pk.threshold || v < a || v <= b) continue;                   // only the brightest spot of each place
        const amp = pk.level * Math.min(1, bright) * 0.5, pan = (((col * 37 + ln.row * 11) % 100) / 100 - 0.5) * 0.9;   // each place keeps its own spot between the ears
        const ang = ((pan + 1) * Math.PI) / 4;
        emit(freq * ln.ratio, amp * Math.cos(ang), amp * Math.sin(ang), pk.decaySeconds);
      }
    }
  }
  const latText = (lat) => (Math.abs(lat) < 1 ? 'the equator' : `${Math.round(Math.abs(lat))} degrees ${lat > 0 ? 'north' : 'south'}`);

  const world = {
    kind: 'field', hasChord: false,

    viewChanged() {
      update(true);
      const col = Math.round(app.view.lon);
      if (playing && node && lastCol !== null && col !== lastCol) {
        const hits = [];
        pins(lastCol, col, app.view.lat, (f, l, r, dec) => hits.push([f, l, r, dec]));
        if (hits.length) node.port.postMessage({ pluck: hits });
      }
      lastCol = col;
    },

    start(ctx) {
      if (node) return node;
      node = new AudioWorkletNode(ctx, 'scanner', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { cfg: settings } });
      node.port.postMessage({ freq: freq * padShift, harmonics: snd.pad?.harmonics || cfg.harmonics, tables: tables(app.proj, Math.min(S - 1, pos)) });
      return node;
    },
    setPlaying(on) { playing = on; node?.port.postMessage({ playing: on }); },
    setChord() {},

    speedText: hzText,
    speedAnnounce: () => hzText(true),
    get speedSlider() { return Math.log(freq / cfg.minHz) / Math.log(cfg.maxHz / cfg.minHz); },
    set speedSlider(v) { world.setSpeed(cfg.minHz * Math.pow(cfg.maxHz / cfg.minHz, v)); },
    setSpeed(f) { freq = Math.max(cfg.minHz, Math.min(cfg.maxHz, f)); node?.port.postMessage({ freq: freq * padShift }); },
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
      a.freq = freq * padShift; a.harmonics = snd.pad?.harmonics || cfg.harmonics; a.playing = true;
      const turn = settings.spin.secondsPerTurn;
      const secs = Math.min(settings.render.maxSeconds, Math.max(turn, (S - 1) / rate + 2)), total = Math.ceil(secs * sr);
      const L = new Float32Array(total), R = new Float32Array(total), step = Math.round(sr / 10);
      const proj = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) };
      let was = null;
      for (let i = 0; i < total; i += step) {
        const t = i / sr, lon = app.view.lon + (t * 360) / turn;
        app.projFor(lon, proj);
        a.setTables(tables(proj, Math.min(S - 1, t * rate), true));
        if (was !== null) pins(was, Math.round(lon), app.view.lat, (f, l, r, dec) => a.pluck(f, l, r, dec));
        was = Math.round(lon);
        const n = Math.min(step, total - i);
        a.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
        if (i % (sr * 2) < step) await progress((i + n) / total);
      }
      update(true);
      return { L, R, sr, secs, tag: `${Math.round(freq)}-hz` };
    },

    // the world's small picture, for the menu: the same map and lines as the big globe
    preview(scope, proj) {
      scope.touch();
      scope.frame({ blips: null, count: 0, proj, field, skylines: lines.map((ln) => ({ lat: ln.lat, values: ln.sky, lift: ds.lift || 5, level: ln.level })) });
    },
  };
  update(true);
  return world;
}
