// Audification: data events played back faster than they happened.
//
// One event (one lightning flash) is one click. Nothing is mapped to notes.
// The only thing that changes the sound is how fast time runs:
//   slow    you hear single flashes
//   faster  flashes merge into a hiss that swells with the seasons
//   fastest a year passes in a few milliseconds and the seasonal rise and
//           fall of lightning becomes the waveform itself, a pitch
//
// The same class runs live inside an AudioWorklet and offline for the WAV file.

// Safety only: bursts far above the average rate would clip, so the top is rounded off.
const soft = (x) => { const a = x < 0 ? -x : x; return a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3)); };

export class Audifier {
  constructor(sampleRate, cfg) {
    this.sr = sampleRate;
    this.cfg = cfg;
    this.day = 0;            // playhead, days of data since the start
    this.speed = 23;         // days of data per second of sound
    this.playing = false;
    this.ready = false;
    this.frame = 0;          // frame holding the playhead
    this.k = 0;              // next event inside that frame
    this.hpL = { x: 0, y: 0 }; this.hpR = { x: 0, y: 0 };
    this.lpL = 0; this.lpR = 0;
    this.seed = 0x9e3779b9;
    this.ref = { gMean: 0.25, gRms: 0.4 };   // mean and RMS gain of an event at the reference view
  }

  // frameStart: Uint32[F+1], cells: Uint16[E], frameDay: Float32[F+1]
  setData({ frameStart, cells, frameDay, ref }) {
    if (ref) this.ref = ref;
    this.frameStart = frameStart; this.cells = cells; this.frameDay = frameDay;
    this.frames = frameStart.length - 1;
    this.endDay = frameDay[this.frames];
    this.meanPerDay = cells.length / this.endDay;
    this.ready = !!this.gL;
    this.seek(this.day);
  }

  // gL, gR: Float32 gain per map cell. curveL, curveR: Float32[F] summed gain per frame.
  setView({ gL, gR, curveL, curveR }) {
    this.gL = gL; this.gR = gR; this.curveL = curveL; this.curveR = curveR;
    const F = curveL.length;
    this.cumL = new Float64Array(F + 1); this.cumR = new Float64Array(F + 1);
    for (let f = 0; f < F; f++) { this.cumL[f + 1] = this.cumL[f] + curveL[f]; this.cumR[f + 1] = this.cumR[f] + curveR[f]; }
    this.ready = !!this.cells;
  }

  // Running totals at the playhead, for curve mode.
  syncTotals() {
    const f = this.frame, d = this.frameDay;
    const u = Math.min(1, Math.max(0, (this.day - d[f]) / (d[f + 1] - d[f])));
    this.cl = this.cumL[f] + this.curveL[f] * u; this.cr = this.cumR[f] + this.curveR[f] * u;
  }

  seek(day) {
    if (!this.frameDay) { this.day = day; return; }
    const end = this.loopEnd();
    day = ((day % end) + end) % end;
    this.day = day;
    let lo = 0, hi = this.frames - 1;           // find the frame holding this day
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.frameDay[m] <= day) lo = m; else hi = m - 1; }
    this.frame = lo;
    this.k = this.firstEventAfter(lo, day);
  }

  // At tone speeds, loop over whole years so the loop itself adds no buzz.
  loopEnd() {
    const c = this.cfg.loop;
    if (this.speed >= c.wholeYearsAboveSpeed) {
      const years = Math.floor(this.endDay / 365.25);
      if (years >= 1) return years * 365.25;
    }
    return this.endDay;
  }

  // Events in a frame are spread across the time that frame covers. Event i of
  // n sits somewhere in the i-th of n equal slices (its place inside the slice
  // comes from a fixed hash), so clicks never fall into an even rhythm.
  eventDay(f, i) {
    const n = this.frameStart[f + 1] - this.frameStart[f];
    const d0 = this.frameDay[f], span = this.frameDay[f + 1] - d0;
    let h = Math.imul(this.frameStart[f] + i, 2654435761) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return d0 + span * (i + h / 4294967296) / n;
  }

  firstEventAfter(f, day) {
    const n = this.frameStart[f + 1] - this.frameStart[f];
    const span = this.frameDay[f + 1] - this.frameDay[f];
    let i = Math.max(0, Math.floor(((day - this.frameDay[f]) / span) * n) - 1);
    while (i < n && this.eventDay(f, i) < day) i++;
    return i;
  }

  rand() { // xorshift, for the hiss in curve mode
    let s = this.seed; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; this.seed = s;
    return (s >>> 0) / 4294967296;
  }

  // Fill left and right with `n` samples.
  process(left, right, n = left.length) {
    if (!this.ready || !this.playing) { left.fill(0, 0, n); right.fill(0, 0, n); return; }
    const c = this.cfg, sr = this.sr;
    const dd = this.speed / sr;                         // days per sample
    const lam = this.meanPerDay * dd;                   // events per sample, whole planet
    const lp = 1 - Math.exp(-2 * Math.PI * Math.min(c.click.lowpassHz, sr * 0.45) / sr);
    // Level per click. Sparse: each click peaks at `level.click`. Denser: the
    // level per click drops so the hiss settles at `level.hiss` (RMS). Denser
    // still: the hiss fades and the seasonal waveform settles near `level.tone`.
    const ref = this.ref, noiseGain = Math.sqrt(lp / (2 - lp));
    const a0 = c.level.click / lp;
    const lam1 = Math.pow(c.level.hiss / (a0 * ref.gRms * noiseGain), 2);
    const lam0 = Math.pow(c.level.tone / (0.4 * ref.gMean * a0), 2) / lam1;
    const a = a0 / Math.sqrt(1 + lam / lam1) / Math.sqrt(1 + lam / lam0);
    const grain = c.level.hissInTone ? Math.sqrt(ref.gRms * ref.gRms / ref.gMean) : 0;
    const curveMode = lam > c.curveAboveEventsPerSample;
    const hp = Math.exp(-2 * Math.PI * c.highpassHz / sr);
    const { frameStart, frameDay, cells, gL, gR, curveL, curveR, cumL, cumR, frames } = this;
    let end = this.loopEnd();
    if (this.day >= end) this.seek(0);
    if (curveMode) this.syncTotals();

    for (let s = 0; s < n; s++) {
      let l = 0, r = 0;
      const next = this.day + dd;
      if (curveMode) {
        // Sum of clicks falling in this sample, from the running total of the
        // per-frame curve (exact even when one sample spans many frames).
        let f = this.frame;
        while (f < frames - 1 && frameDay[f + 1] <= next) f++;
        this.frame = f;
        const u = Math.min(1, Math.max(0, (next - frameDay[f]) / (frameDay[f + 1] - frameDay[f])));
        const cl = cumL[f] + curveL[f] * u, cr = cumR[f] + curveR[f] * u;
        l = Math.max(0, cl - this.cl); r = Math.max(0, cr - this.cr);
        this.cl = cl; this.cr = cr;
        if (grain) {                                           // the grain that single clicks would add
          const g = (this.rand() + this.rand() + this.rand() - 1.5) * 2;
          const g2 = (this.rand() + this.rand() + this.rand() - 1.5) * 2;
          l += g * grain * Math.sqrt(l); r += g2 * grain * Math.sqrt(r);
        }
      } else {
        let f = this.frame, k = this.k;
        for (;;) {
          const nf = frameStart[f + 1] - frameStart[f];
          if (k >= nf) {
            if (f >= frames - 1 || frameDay[f + 1] >= next) break;
            f++; k = 0; continue;
          }
          if (this.eventDay(f, k) >= next) break;
          const cell = cells[frameStart[f] + k];
          l += gL[cell]; r += gR[cell];
          k++;
        }
        this.frame = f; this.k = k;
      }
      l *= a; r *= a;
      // click colour (one-pole low-pass), then remove the slow offset (high-pass)
      this.lpL += lp * (l - this.lpL); this.lpR += lp * (r - this.lpR);
      l = this.lpL; r = this.lpR;
      const yl = l - this.hpL.x + hp * this.hpL.y; this.hpL.x = l; this.hpL.y = yl;
      const yr = r - this.hpR.x + hp * this.hpR.y; this.hpR.x = r; this.hpR.y = yr;
      left[s] = soft(yl * c.master); right[s] = soft(yr * c.master);

      this.day = next;
      if (this.day >= end) {
        if (c.loop.enabled) { this.seek(this.day - end); end = this.loopEnd(); if (curveMode) this.syncTotals(); }
        else { this.playing = false; this.ended = true; left.fill(0, s + 1, n); right.fill(0, s + 1, n); break; }
      }
    }
  }
}

// ---- AudioWorklet side ----
if (typeof AudioWorkletProcessor !== 'undefined') {
  class AudifierProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.a = new Audifier(sampleRate, options.processorOptions.cfg);
      this.count = 0;
      this.port.onmessage = (e) => {
        const m = e.data, a = this.a;
        if (m.data) a.setData(m.data);
        if (m.view) a.setView(m.view);
        if (m.speed !== undefined) { a.speed = m.speed; a.seek(a.day); }
        if (m.seek !== undefined) a.seek(m.seek);
        if (m.playing !== undefined) { a.playing = m.playing; a.ended = false; }
      };
    }
    process(_, outputs) {
      const out = outputs[0];
      this.a.process(out[0], out[1] || out[0]);
      if ((this.count += out[0].length) >= 1024) {
        this.count = 0;
        this.port.postMessage({ day: this.a.day, ended: !!this.a.ended });
        this.a.ended = false;
      }
      return true;
    }
  }
  registerProcessor('audifier', AudifierProcessor);
}
