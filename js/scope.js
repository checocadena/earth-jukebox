// The picture: a radar scope. The Earth is drawn as coastlines only, in a
// phosphor line. Each flash is a blip that fades, and leaves a faint mark, so
// the map of where lightning lives builds up while you listen. The line around
// the rim is the calendar: January at the top, clockwise, and its height is how
// much lightning the visible side had. The bright dot on it is now. At top
// speed that line is the waveform you hear.

import { project } from './geo.js';

export function makeScope(canvas, cfg, look, opts = {}) {
  const { top = 96, bottom = 150, fill = 0.39 } = opts;
  let ticks = opts.ticks !== false;
  const lazy = !!opts.lazyMarks;       // small turning globes: the marks need not follow every frame   // CSS px kept clear above and below
  const g = canvas.getContext('2d');
  const base = document.createElement('canvas'), bg = base.getContext('2d');   // coast, rim, ticks
  const phos = document.createElement('canvas'), pg = phos.getContext('2d');   // blips with afterglow
  const heat = document.createElement('canvas'), hg = heat.getContext('2d');   // where flashes have been
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = look.line, G = look.lineGlow, DP = look.data, DG = look.dataGlow;
  let w = 0, h = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let coast = [], lon0 = 0, lat0 = 0, baseDirty = true, focused = false, heatDirty = true, heatAge = 0, glowLon = 0, glowLat = 0;

  function resize() {
    if (opts.size) { dpr = 1; w = h = opts.size; }         // a picture of fixed size, not on the page
    else {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, r.width < 900 ? 1.5 : 2);
      w = Math.round(r.width * dpr); h = Math.round(r.height * dpr);
    }
    for (const c of [canvas, base, phos, heat]) { c.width = w; c.height = h; }
    heatDirty = true;
    // leave room for the title above and the two control rows below
    const t = top * dpr, b = bottom * dpr;
    R = Math.max(20, Math.min(w * fill, (h - t - b) / 2 / (ticks ? 1.26 : 1.04)));
    cx = w / 2; cy = t + (h - t - b) / 2;
    baseDirty = true;
  }

  function beam(ctx, alpha, widthCore, draw, data) {   // glow pass then core, like a CRT beam
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${data ? DG : G},${alpha * 0.22})`; ctx.lineWidth = widthCore * 4.5 * dpr; ctx.beginPath(); draw(ctx); ctx.stroke();
    ctx.strokeStyle = `rgba(${data ? DP : P},${alpha})`; ctx.lineWidth = widthCore * dpr; ctx.beginPath(); draw(ctx); ctx.stroke();
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
    if (ticks) beam(bg, 0.5, 1, (c) => {
      for (let m = 0; m < 12; m++) {
        const a = -Math.PI / 2 + (m / 12) * Math.PI * 2, r0 = R * 1.035, r1 = R * (m % 3 === 0 ? 1.075 : 1.055);
        c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
    });
  }

  // blips: Int32 cell ids; proj: {x,y,z} per cell
  function frame({ blips, count, proj, seen, field, skylines, showMarker, trace, traceAge }) {
    if (baseDirty) drawBase();
    if (seen && (heatDirty || ++heatAge > 5)) drawHeat(seen, proj);
    if (field && (heatDirty || ++heatAge > 2)) drawField(field, proj);

    // afterglow
    pg.globalCompositeOperation = 'destination-out';
    pg.fillStyle = `rgba(0,0,0,${cfg.persistence})`;
    pg.fillRect(0, 0, w, h);
    pg.globalCompositeOperation = 'lighter';
    if (count) {
      const jit = R * 0.0175, s1 = 4.5 * dpr, s2 = 1.6 * dpr;   // jitter fills the 1-degree cell
      pg.fillStyle = `rgba(${DG},0.28)`;
      for (let i = 0; i < count; i++) {
        const c = blips[i]; if (proj.z[c] <= 0) continue;
        const x = cx + proj.x[c] * R + (hash(i * 2 + c) - 0.5) * jit, y = cy - proj.y[c] * R + (hash(i * 2 + 1 + c) - 0.5) * jit;
        pg.fillRect(x - s1 / 2, y - s1 / 2, s1, s1);
      }
      pg.fillStyle = `rgba(${DP},0.95)`;
      for (let i = 0; i < count; i++) {
        const c = blips[i]; if (proj.z[c] <= 0) continue;
        const x = cx + proj.x[c] * R + (hash(i * 2 + c) - 0.5) * jit, y = cy - proj.y[c] * R + (hash(i * 2 + 1 + c) - 0.5) * jit;
        pg.fillRect(x - s2 / 2, y - s2 / 2, s2, s2);
      }
    }

    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(heat, 0, 0);
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'lighter';

    // lightning through the year, drawn round the rim
    if (trace) {
      const M = trace.count || trace.length;
      const BUCKETS = 5;
      for (let b = 0; b < BUCKETS; b++) {
        const alpha = traceAge ? 0.9 * (1 - b / BUCKETS) ** 1.5 : 0.8;
        beam(g, alpha, 1.2, (c) => {
          const i0 = Math.floor((b / BUCKETS) * (M - 1)), i1 = Math.floor(((b + 1) / BUCKETS) * (M - 1));
          let p = pt(trace, i0); c.moveTo(p[0], p[1]);
          for (let i = i0 + 1; i <= i1; i++) { p = pt(trace, i); c.lineTo(p[0], p[1]); }
        }, true);
      }
    }

    // the lines being read, each raised where its data is bright
    if (skylines) {
      for (const { lat, values, lift, level } of skylines) {
        const path = (raised) => (c) => {
          let pen = false;
          for (let i = 0; i <= 360; i++) {
            const lon = -180 + i, v = raised ? values[i % 360] : 0;
            const p = project(lon + 0.5, lat + v * lift, lon0, lat0);
            if (p[2] <= 0.02) { pen = false; continue; }
            const x = cx + p[0] * R, y = cy - p[1] * R;
            if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; }
          }
        };
        beam(g, 0.22, 1, path(false));
        beam(g, 0.35 + 0.65 * Math.min(1, level), 1.2, path(true), true);   // brighter when it is sounding
      }
    }

    // now: a bright dot riding the rim line
    if (trace && showMarker) {
      const p = pt(trace, 0);
      g.fillStyle = `rgba(${DG},0.35)`; g.beginPath(); g.arc(p[0], p[1], 7 * dpr, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(${DP},1)`; g.beginPath(); g.arc(p[0], p[1], 2.6 * dpr, 0, Math.PI * 2); g.fill();
    }

    g.drawImage(phos, 0, 0);
  }

  // A map of values, one dot per cell. field: Float32 0..1 per cell.
  function drawField(field, proj) {
    heatDirty = false; heatAge = 0;
    hg.clearRect(0, 0, w, h);
    const size = Math.max(1.2 * dpr, R * 0.013);
    for (let i = 0; i < field.length; i++) {
      const v = field[i]; if (v < 0.04 || proj.z[i] <= 0.02) continue;
      hg.fillStyle = `rgba(${DP},${Math.min(1, v * 1.1).toFixed(2)})`;
      hg.fillRect(cx + proj.x[i] * R - size / 2, cy - proj.y[i] * R - size / 2, size, size);
    }
  }

  // Faint marks where flashes have been. seen: Float32 count per cell.
  function drawHeat(seen, proj) {
    heatDirty = false; heatAge = 0;
    hg.clearRect(0, 0, w, h);
    const k = 1 / Math.log(1 + 25), size = Math.max(1.2 * dpr, R * 0.011);   // 25 flashes in a cell = full mark
    for (let i = 0; i < seen.length; i++) {
      const c = seen[i]; if (c < 0.05 || proj.z[i] <= 0.02) continue;
      const v = Math.min(1, Math.log(1 + c) * k), alpha = 0.5 * v * v;     // only the busy places show
      if (alpha < 0.012) continue;
      hg.fillStyle = `rgba(${DG},${alpha.toFixed(3)})`;
      hg.fillRect(cx + proj.x[i] * R - size / 2, cy - proj.y[i] * R - size / 2, size, size);
    }
  }

  function pt(trace, i) {
    const a = -Math.PI / 2 + trace.frac[i] * Math.PI * 2, r = R * (1.09 + 0.15 * Math.min(1.5, trace[i]));
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }

  function hash(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

  return {
    resize, frame,
    setCoast(lines) { coast = lines; baseDirty = true; },
    setFocus(on) { focused = on; baseDirty = true; },
    touch() { heatDirty = true; },
    setTicks(on) { if (ticks !== on) { ticks = on; baseDirty = true; } },
    clear() { pg.clearRect(0, 0, w, h); hg.clearRect(0, 0, w, h); heatDirty = true; },
    // A slow turn keeps the afterglow; a jump clears it (it would be in the wrong place).
    setView(lon, lat) {
      const jump = Math.abs(((lon - glowLon + 540) % 360) - 180) > 4 || Math.abs(lat - glowLat) > 4;
      lon0 = lon; lat0 = lat; baseDirty = true; if (!lazy) heatDirty = true;
      if (jump) { pg.clearRect(0, 0, w, h); glowLon = lon; glowLat = lat; }
      else { glowLon += (((lon - glowLon + 540) % 360) - 180) * 0.2; glowLat += (lat - glowLat) * 0.2; }
    },
    get radius() { return R / dpr; },
    get lon() { return lon0; },
    inside(clientX, clientY) { const r = canvas.getBoundingClientRect(); return Math.hypot((clientX - r.left) * dpr - cx, (clientY - r.top) * dpr - cy) < R * 1.05; },
  };
}
