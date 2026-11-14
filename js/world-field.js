// A world made of maps: one value per place, per year (night lights).
// Sound: a read head circles the planet along the line of latitude at the
// centre of the globe. The brightness it passes over is one period of the
// wave. How often it goes round is the pitch. As the years pass the map
// changes, and so does the wave.

import { Scanner } from './dsp.js';
import { CELLS, COLS, ROWS, placeName } from './geo.js';

export async function createFieldWorld(ds, app) {
  const { settings } = app, cfg = settings.scan;
  const bin = await fetch(ds.maps).then((r) => r.arrayBuffer());
  const hl = new DataView(bin).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
  const years = head.years, Y = years.length;
  const packed = new Uint8Array(bin, 4 + hl);              // sqrt-encoded, Y maps of CELLS
  const light = (y, i) => { const u = packed[y * CELLS + i] / 255; return u * u; };

  let pos = 0;                                             // position in years, 0 = first map
  let freq = cfg.startHz, playing = false, node = null, lastPost = 0;
  const field = new Float32Array(CELLS);                   // what is drawn: brightness now
  const wave = new Float32Array(COLS);                     // brightness along the line, now
  const first = new Float32Array(COLS);                    // the same line in the first year
  const tL = new Float32Array(COLS), tR = new Float32Array(COLS);
  let waveSum = 0, firstSum = 0;

  const band = (lat) => {
    const c = Math.round(89.5 - lat), rows = [];
    for (let r = c - cfg.bandDegrees; r <= c + cfg.bandDegrees; r++) if (r >= 0 && r < ROWS) rows.push(r);
    return rows;
  };
  function line(y0, y1, t, rows, out) {
    let sum = 0;
    for (let col = 0; col < COLS; col++) {
      let v = 0;
      for (const r of rows) { const i = r * COLS + col; v += light(y0, i) * (1 - t) + light(y1, i) * t; }
      out[col] = v / rows.length; sum += out[col];
    }
    return sum;
  }
  // Loudness reference: the busiest line of latitude in the last year plays at cfg.level (RMS).
  let peak = 1e-6, loud = 1e-6;
  {
    const tmp = new Float32Array(COLS);
    for (let lat = -55; lat <= 67; lat += 1) {
      const s = line(Y - 1, Y - 1, 0, band(lat), tmp), mean = s / COLS;
      let ss = 0;
      for (let c = 0; c < COLS; c++) { peak = Math.max(peak, tmp[c]); ss += (tmp[c] - mean) ** 2; }
      loud = Math.max(loud, Math.sqrt(ss / COLS));
    }
  }

  function update(force) {
    const y0 = Math.min(Y - 1, Math.floor(pos)), y1 = Math.min(Y - 1, y0 + 1), t = pos - y0;
    for (let i = 0; i < CELLS; i++) {
      const a = packed[y0 * CELLS + i], b = packed[y1 * CELLS + i];
      field[i] = (a + (b - a) * t) / 255;                  // sqrt scale reads better on screen
    }
    app.scope.touch();
    const rows = band(app.view.lat);
    waveSum = line(y0, y1, t, rows, wave);
    firstSum = line(0, 0, 0, rows, first);
    // one table per ear: the head is heard where it is, left to right, and quieter round the back
    const mean = waveSum / COLS, k = cfg.level / loud;
    for (let col = 0; col < COLS; col++) {
      const d = ((col - 179.5 - app.view.lon) * Math.PI) / 180, front = Math.cos(d);
      const w = cfg.backLevel + (1 - cfg.backLevel) * Math.min(1, Math.max(0, (front + 0.2) / 0.4));
      const a = ((Math.sin(d) + 1) * Math.PI) / 4, v = (wave[col] - mean) * k * w;
      tL[col] = v * Math.cos(a); tR[col] = v * Math.sin(a);
    }
    const now = performance.now();
    if (node && (force || now - lastPost > 33)) { lastPost = now; node.port.postMessage({ tables: { L: tL.slice(), R: tR.slice() } }); }
  }

  const year = () => years[Math.min(Y - 1, Math.round(pos))];
  const hzText = (long) => (long ? `${Math.round(freq)} trips around the Earth per second` : `${Math.round(freq)} Hz`);
  const sky = new Float32Array(COLS);

  const world = {
    kind: 'field', hasChord: false,

    viewChanged() { update(true); },

    start(ctx) {
      if (node) return node;
      node = new AudioWorkletNode(ctx, 'scanner', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { cfg: settings } });
      node.port.postMessage({ freq, tables: { L: tL.slice(), R: tR.slice() } });
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

    get timeSlider() { return pos / (Y - 1); },
    set timeSlider(v) { pos = Math.max(0, Math.min(Y - 1, v * (Y - 1))); update(true); },
    stepTime(dir) { pos = Math.max(0, Math.min(Y - 1, Math.round(pos) + dir)); update(true); },
    timeText: () => String(year()),
    timeAria: () => String(year()),

    frame(dt) {
      if (playing) {
        pos += dt * cfg.yearsPerSecond;
        if (pos >= Y - 1 + 1.5) pos = 0;                   // hold on the last year for a moment, then start again
        const held = pos; pos = Math.min(Y - 1, pos); update(false); pos = held;
      }
      // the line, raised where it is bright (square root, so small towns show)
      const top = Math.sqrt(peak) || 1;
      for (let c = 0; c < COLS; c++) sky[c] = Math.min(1.4, Math.sqrt(wave[c]) / top);
      app.scope.frame({ blips: null, count: 0, proj: app.proj, field, skyline: { lat: app.view.lat, values: sky, lift: 16 } });
    },

    describe() {
      const lat = Math.round(Math.abs(app.view.lat)), ns = app.view.lat >= 0 ? 'north' : 'south';
      const change = firstSum > 1e-6 ? Math.round((waveSum / firstSum - 1) * 100) : 0;
      const versus = Math.round(pos) === 0 ? '' : change >= 1 ? ` This line is ${change} percent brighter than in ${years[0]}.`
        : change <= -1 ? ` This line is ${-change} percent dimmer than in ${years[0]}.` : ` This line is as bright as in ${years[0]}.`;
      const dark = waveSum / COLS < peak * 0.01 ? ' Almost no lights on this line.' : '';
      return `${year()}. Reading the lights along ${lat} degrees ${ns}, facing ${placeName(app.view.lon, app.view.lat)}.${versus}${dark} ${hzText(true)}.`;
    },

    async renderWav(progress) {
      const sr = settings.render.sampleRate, a = new Scanner(sr, settings);
      a.freq = freq; a.playing = true;
      const secs = (Y - 1) / cfg.yearsPerSecond + 2, total = Math.ceil(secs * sr);
      const L = new Float32Array(total), R = new Float32Array(total), keep = pos, step = Math.round(sr / 30);
      for (let i = 0; i < total; i += step) {
        pos = Math.min(Y - 1, (i / sr) * cfg.yearsPerSecond); update(false);
        a.setTables(tL.slice(), tR.slice());
        const n = Math.min(step, total - i);
        a.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
        if (i % (sr * 2) < step) await progress((i + n) / total);
      }
      pos = keep; update(true);
      return { L, R, sr, secs, tag: `${Math.round(freq)}-hz` };
    },

    preview(scope, proj) {
      const f = new Float32Array(CELLS);
      for (let i = 0; i < CELLS; i++) f[i] = packed[(Y - 1) * CELLS + i] / 255;
      scope.frame({ blips: null, count: 0, proj, field: f });
    },
  };
  update(true);
  return world;
}
