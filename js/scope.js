// The picture: a radar scope. The Earth is drawn as coastlines only, in a
// phosphor line. Each flash is a blip that fades. The hand going round is the
// calendar: one turn is one year, January at the top. The line it draws
// around the rim is how much lightning the visible side had through that year,
// which is the waveform you hear when time runs fast enough.

import { project } from './geo.js';

export function makeScope(canvas, cfg) {
  const g = canvas.getContext('2d');
  const base = document.createElement('canvas'), bg = base.getContext('2d');   // coast, rim, ticks
  const phos = document.createElement('canvas'), pg = phos.getContext('2d');   // blips with afterglow
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = cfg.phosphor, G = cfg.glow;
  let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let coast = [], lon0 = 0, lat0 = 0, baseDirty = true, focused = false;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, r.width < 900 ? 1.5 : 2);
    w = Math.round(r.width * dpr); h = Math.round(r.height * dpr);
    for (const c of [canvas, base, phos]) { c.width = w; c.height = h; }
    // leave room for the title above and the two control rows below
    const top = 96 * dpr, bottom = 150 * dpr;
    R = Math.max(40, Math.min(w * 0.39, (h - top - bottom) / 2 / 1.26));
    cx = w / 2; cy = top + (h - top - bottom) / 2;
    baseDirty = true;
  }

  function beam(ctx, alpha, widthCore, draw) {   // glow pass then core, like a CRT beam
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${G},${alpha * 0.22})`; ctx.lineWidth = widthCore * 4.5 * dpr; ctx.beginPath(); draw(ctx); ctx.stroke();
    ctx.strokeStyle = `rgba(${P},${alpha})`; ctx.lineWidth = widthCore * dpr; ctx.beginPath(); draw(ctx); ctx.stroke();
  }

  function drawBase() {
    baseDirty = false;
    bg.clearRect(0, 0, w, h);
    bg.globalCompositeOperation = 'lighter';
    // coastlines, near side only
    beam(bg, cfg.coastAlpha, 1.1, (c) => {
      for (const line of coast) {
        let prev = null;
        for (let i = 0; i < line.length; i += 2) {
          const p = project(line[i], line[i + 1], lon0, lat0);
          if (prev) {
            if (prev[2] > 0 && p[2] > 0) { c.moveTo(cx + prev[0] * R, cy - prev[1] * R); c.lineTo(cx + p[0] * R, cy - p[1] * R); }
            else if (prev[2] > 0 || p[2] > 0) {     // crosses the edge: cut it there
              const t = prev[2] / (prev[2] - p[2]);
              let ex = prev[0] + (p[0] - prev[0]) * t, ey = prev[1] + (p[1] - prev[1]) * t;
              const n = Math.hypot(ex, ey) || 1; ex /= n; ey /= n;
              const a = prev[2] > 0 ? prev : p;
              c.moveTo(cx + a[0] * R, cy - a[1] * R); c.lineTo(cx + ex * R, cy - ey * R);
            }
          }
          prev = p;
        }
      }
    });
    // rim of the Earth; heavier when the globe has keyboard focus
    beam(bg, focused ? 1 : 0.9, focused ? 3.2 : 1.3, (c) => c.arc(cx, cy, R, 0, Math.PI * 2));
    // month ticks; the four longer ones are January, April, July, October
    beam(bg, 0.5, 1, (c) => {
      for (let m = 0; m < 12; m++) {
        const a = -Math.PI / 2 + (m / 12) * Math.PI * 2, r0 = R * 1.035, r1 = R * (m % 3 === 0 ? 1.075 : 1.055);
        c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
    });
  }

  // blips: Int32 cell ids; proj: {x,y,z} per cell
  function frame({ blips, count, proj, yearFrac, showHand, trace, traceAge, running }) {
    if (baseDirty) drawBase();

    // afterglow
    pg.globalCompositeOperation = 'destination-out';
    pg.fillStyle = `rgba(0,0,0,${running ? cfg.persistence : 0.03})`;
    pg.fillRect(0, 0, w, h);
    pg.globalCompositeOperation = 'lighter';
    if (count) {
      const jit = R * 0.0175, s1 = 4.5 * dpr, s2 = 1.6 * dpr;   // jitter fills the 1-degree cell
      pg.fillStyle = `rgba(${G},0.28)`;
      for (let i = 0; i < count; i++) {
        const c = blips[i]; if (proj.z[c] <= 0) continue;
        const x = cx + proj.x[c] * R + (hash(i * 2 + c) - 0.5) * jit, y = cy - proj.y[c] * R + (hash(i * 2 + 1 + c) - 0.5) * jit;
        pg.fillRect(x - s1 / 2, y - s1 / 2, s1, s1);
      }
      pg.fillStyle = `rgba(${P},0.95)`;
      for (let i = 0; i < count; i++) {
        const c = blips[i]; if (proj.z[c] <= 0) continue;
        const x = cx + proj.x[c] * R + (hash(i * 2 + c) - 0.5) * jit, y = cy - proj.y[c] * R + (hash(i * 2 + 1 + c) - 0.5) * jit;
        pg.fillRect(x - s2 / 2, y - s2 / 2, s2, s2);
      }
    }

    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'lighter';

    // the year hand, with the wedge of light a radar sweep leaves behind it
    const theta = -Math.PI / 2 + yearFrac * Math.PI * 2;
    if (showHand && !reduce) {
      if (g.createConicGradient) {
        const wedge = 0.11;
        const cg = g.createConicGradient(theta - wedge * Math.PI * 2, cx, cy);
        cg.addColorStop(0, `rgba(${G},0)`); cg.addColorStop(wedge, `rgba(${G},0.2)`);
        cg.addColorStop(wedge + 0.0005, `rgba(${G},0)`); cg.addColorStop(1, `rgba(${G},0)`);
        g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      }
      beam(g, 0.85, 1.2, (c) => { c.moveTo(cx, cy); c.lineTo(cx + Math.cos(theta) * R * 1.03, cy + Math.sin(theta) * R * 1.03); });
    }

    // lightning through the year, drawn round the rim
    if (trace) {
      const M = trace.count || trace.length;
      const pt = (i) => {
        const a = -Math.PI / 2 + (trace.frac[i]) * Math.PI * 2, r = R * (1.09 + 0.15 * Math.min(1.5, trace[i]));
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      };
      const BUCKETS = 5;
      for (let b = 0; b < BUCKETS; b++) {
        const alpha = traceAge ? 0.9 * (1 - b / BUCKETS) ** 1.5 : 0.8;
        beam(g, alpha, 1.2, (c) => {
          const i0 = Math.floor((b / BUCKETS) * (M - 1)), i1 = Math.floor(((b + 1) / BUCKETS) * (M - 1));
          let p = pt(i0); c.moveTo(p[0], p[1]);
          for (let i = i0 + 1; i <= i1; i++) { p = pt(i); c.lineTo(p[0], p[1]); }
        });
      }
    }

    g.drawImage(phos, 0, 0);
  }

  function hash(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

  return {
    resize, frame,
    setCoast(lines) { coast = lines; baseDirty = true; },
    setFocus(on) { focused = on; baseDirty = true; },
    setView(lon, lat) { lon0 = lon; lat0 = lat; baseDirty = true; pg.clearRect(0, 0, w, h); },
    get radius() { return R / dpr; },
    inside(clientX, clientY) { const r = canvas.getBoundingClientRect(); return Math.hypot((clientX - r.left) * dpr - cx, (clientY - r.top) * dpr - cy) < R * 1.05; },
  };
}
