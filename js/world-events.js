// A world made of events: each one has a time and a place (lightning flashes).
// Sound: one event is one click, played back faster than it happened.

import { Audifier } from './dsp.js';
import { CELLS, cellGains, frameCurves, gainReference, projectCells, placeName } from './geo.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function createEventsWorld(ds, app) {
  const { settings } = app;
  const bin = await fetch(ds.events).then((r) => r.arrayBuffer());
  const hl = new DataView(bin).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 4, hl)));
  let o = 4 + hl;
  const frameStart = new Uint32Array(bin.slice(o, o + 4 * (head.frames + 1))); o += 4 * (head.frames + 1);
  const frameDay = new Float32Array(bin.slice(o, o + 4 * (head.frames + 1))); o += 4 * (head.frames + 1);
  const cells = new Uint16Array(bin.slice(o, o + 2 * head.events));
  for (let f = 1; f <= head.frames; f++) if (frameDay[f] < frameDay[f - 1] + 1e-3) frameDay[f] = frameDay[f - 1] + 1e-3;
  const frames = head.frames, endDay = frameDay[frames], start = Date.parse(ds.startDate + 'T00:00:00Z');

  const gL = new Float32Array(CELLS), gR = new Float32Array(CELLS);
  const curveL = new Float32Array(frames), curveR = new Float32Array(frames);
  let curveRef = 1, meanYear = null, curvesTimer = 0;
  let speed = settings.speed.start, day = 0, playing = false, node = null, lastDrawDay = 0;
  const blips = new Int32Array(settings.scope.maxBlipsPerFrame);
  const seen = new Float32Array(CELLS);        // marks left by recent flashes
  const trace = Object.assign(new Float32Array(120), { frac: new Float32Array(120) });

  // Levels are set against the starting view, so quiet sides of the Earth stay quiet.
  const refProj = { x: new Float32Array(CELLS), y: new Float32Array(CELLS), z: new Float32Array(CELLS) };
  projectCells(settings.view.lon, settings.view.lat, refProj);
  cellGains(refProj, settings.view.falloff, gL, gR);
  const ref = gainReference(cells, gL);

  const dateOf = (d) => new Date(start + d * 86400000);
  function yearFrac(d) {
    const t = dateOf(d), y0 = Date.UTC(t.getUTCFullYear(), 0, 1), y1 = Date.UTC(t.getUTCFullYear() + 1, 0, 1);
    return (t.getTime() - y0) / (y1 - y0);
  }
  function frameOf(d) {
    let lo = 0, hi = frames - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frameDay[m] <= d) lo = m; else hi = m - 1; }
    return lo;
  }
  // lightning in view around day d, relative to this view's average (1 = average)
  function rateAt(d, halfWindowDays = 4) {
    const f0 = frameOf(Math.max(0, d - halfWindowDays)), f1 = frameOf(Math.min(endDay - 1e-3, d + halfWindowDays));
    let s = 0;
    for (let f = f0; f <= f1; f++) s += curveL[f] + curveR[f];
    return s / (frameDay[f1 + 1] - frameDay[f0]) / curveRef;
  }
  const fastAll = () => speed > 730;   // more than two years a second: no single date makes sense
  const viewMsg = () => ({ gL: gL.slice(), gR: gR.slice(), curveL: curveL.slice(), curveR: curveR.slice() });

  function updateCurves() {
    frameCurves(frameStart, cells, gL, gR, curveL, curveR);
    let sum = 0;
    for (let f = 0; f < frames; f++) sum += curveL[f] + curveR[f];
    curveRef = sum / endDay || 1;
    // the average year for this view: the shape heard as a tone
    const M = 180, acc = new Float32Array(M), n = new Float32Array(M);
    for (let f = 0; f < frames; f++) {
      const d = frameDay[f], span = frameDay[f + 1] - d, i = Math.floor(yearFrac(d + span / 2) * M) % M;
      acc[i] += curveL[f] + curveR[f]; n[i] += span;
    }
    meanYear = Object.assign(new Float32Array(M + 1), { frac: new Float32Array(M + 1) });
    for (let i = 0; i <= M; i++) { const j = i % M; meanYear[i] = n[j] ? acc[j] / n[j] / curveRef / 2 : 0; meanYear.frac[i] = i / M; }
    node?.port.postMessage({ view: viewMsg() });
  }

  function speedText(long) {
    const yr = speed / 365.25;
    const n = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
    if (yr >= 1) return long ? `${n(yr)} years per second` : `${n(yr)} yr/s`;
    return long ? `${n(speed)} days per second` : `${n(speed)} d/s`;
  }

  const world = {
    kind: 'events', hasChord: true,

    viewChanged(now) {
      cellGains(app.proj, settings.view.falloff, gL, gR);
      clearTimeout(curvesTimer);
      if (now) updateCurves(); else curvesTimer = setTimeout(updateCurves, 90);
      node?.port.postMessage({ view: viewMsg() });
    },

    start(ctx) {
      if (node) return node;
      node = new AudioWorkletNode(ctx, 'audifier', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { cfg: settings } });
      node.port.onmessage = (e) => { day = e.data.day; if (e.data.ended) app.ended(); };
      node.port.postMessage({ data: { frameStart: frameStart.slice(), frameDay: frameDay.slice(), cells: cells.slice(), ref }, view: viewMsg(), speed, seek: day });
      return node;
    },
    setPlaying(on) { playing = on; node?.port.postMessage({ playing: on }); },
    setChord(on) { settings.ring.mix = on ? settings.ring.onMix : 0; node?.port.postMessage({ ring: settings.ring }); },

    // speed: days of data per second, on a log slider
    speedText,
    speedAnnounce: () => (fastAll() ? world.describe() : speedText(true)),
    get speedSlider() { const { min, max } = settings.speed; return Math.log(speed / min) / Math.log(max / min); },
    set speedSlider(v) { const { min, max } = settings.speed; world.setSpeed(min * Math.pow(max / min, v)); },
    setSpeed(s) { speed = Math.max(settings.speed.min, Math.min(settings.speed.max, s)); node?.port.postMessage({ speed }); },
    nudgeSpeed(steps) { world.setSpeed(speed * Math.pow(2, steps / 3)); },

    // time: days since the start
    get timeSlider() { return day / endDay; },
    set timeSlider(v) { world.seek(v * endDay); },
    seek(d) { day = Math.max(0, Math.min(endDay - 0.01, d)); lastDrawDay = day; node?.port.postMessage({ seek: day }); },
    stepTime(dir) { world.seek(day + dir * 30.44); },
    timeText() { const t = dateOf(day); return fastAll() ? 'All years' : `${MONTHS[t.getUTCMonth()].slice(0, 3)} ${t.getUTCFullYear()}`; },
    timeAria() { const t = dateOf(day); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; },

    frame() {
      let count = 0;
      if (playing) {
        // flashes between the last picture and this one
        let d0 = lastDrawDay; const d1 = day;
        if (d1 < d0 || d1 - d0 > 400) d0 = Math.max(0, d1 - Math.min(400, speed / 30));   // looped or jumped
        const idx = (d) => { const f = frameOf(d); return frameStart[f] + Math.floor((frameStart[f + 1] - frameStart[f]) * Math.min(1, (d - frameDay[f]) / (frameDay[f + 1] - frameDay[f]))); };
        const i0 = idx(d0), n = Math.max(0, idx(d1) - i0), cap = blips.length;
        if (n <= cap) { for (let i = 0; i < n; i++) blips[i] = cells[i0 + i]; count = n; }
        else { for (let i = 0; i < cap; i++) blips[i] = cells[i0 + Math.floor(Math.random() * n)]; count = cap; }
        for (let i = 0; i < count; i++) seen[blips[i]]++;
        lastDrawDay = d1;
      }
      const fade = Math.pow(0.5, 1 / (60 * settings.scope.markHalfLifeSeconds));   // marks fade, playing or paused
      for (let i = 0; i < CELLS; i++) seen[i] *= fade;
      // rim line: the past year up to now, or the average year when time runs very fast
      let line = meanYear, aged = false;
      if (!fastAll() && meanYear) {
        let m = 0;
        for (; m < trace.length; m++) {
          const d = day - (m / (trace.length - 1)) * 330;
          if (d <= 3) break;
          trace[m] = rateAt(d, 3) / 2; trace.frac[m] = yearFrac(d);
        }
        trace.count = m; line = m >= 2 ? trace : null; aged = true;
      }
      app.scope.frame({ blips, count, proj: app.proj, seen, showMarker: !fastAll(), trace: line, traceAge: aged });
    },

    describe() {
      const where = `Facing ${placeName(app.view.lon, app.view.lat)}.`;
      if (fastAll()) {
        const hz = speed / 365.25;
        return `All years, ${speedText(true)}. ${where} One year lasts ${(1000 / hz).toFixed(hz > 100 ? 1 : 0)} milliseconds, so the seasons sound as a tone near ${Math.round(hz)} hertz.`;
      }
      const t = dateOf(day), r = rateAt(day);
      const level = r < 0.3 ? 'Very little lightning' : r < 0.7 ? 'Less lightning than usual' : r < 1.4 ? 'About the usual amount of lightning'
        : r < 2.2 ? 'More lightning than usual' : `Heavy lightning, about ${Math.round(r)} times the usual amount`;
      return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}. ${where} ${level} on this side of the Earth. ${speedText(true)}.`;
    },

    async renderWav(progress) {
      const sr = settings.render.sampleRate, a = new Audifier(sr, settings);
      a.setData({ frameStart, frameDay, cells, ref }); a.setView({ gL, gR, curveL, curveR });
      a.speed = speed; a.playing = true;
      const pass = endDay / speed;                        // seconds for one pass through the data
      const secs = pass < 5 ? settings.render.toneSeconds : Math.min(pass, settings.render.maxSeconds);
      a.seek(pass <= settings.render.maxSeconds ? 0 : day);
      const total = Math.ceil(secs * sr), L = new Float32Array(total), R = new Float32Array(total);
      for (let i = 0; i < total; i += sr) {
        const n = Math.min(sr, total - i);
        a.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
        await progress((i + n) / total);
      }
      return { L, R, sr, secs, tag: speedText().replace(/[ /.]+/g, '-') };
    },

    // a still picture for the hub: where the events are, over the whole record
    preview(scope, proj) {
      const total = new Float32Array(CELLS);
      for (let i = 0; i < cells.length; i += 3) total[cells[i]] += 0.4;
      scope.frame({ blips, count: 0, proj, seen: total });
    },
  };
  return world;
}
