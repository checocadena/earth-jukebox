// Plain-language descriptions of what is on screen, for screen readers.

export function makeDater(vis) {
  const start = Date.parse(vis.startDate + 'T00:00:00Z');
  const keys = vis.dateKeys;
  return function dateAt(t) {
    let days = keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, d0] = keys[i], [t1, d1] = keys[i + 1];
      if (t <= t0) { days = d0; break; }
      if (t < t1) { days = d0 + ((t - t0) / (t1 - t0)) * (d1 - d0); break; }
    }
    return new Date(start + Math.round(days) * 86400000);
  };
}

export const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function viewAt(vis, t) {
  let v = vis.views[0];
  for (const x of vis.views) if (t >= x.from) v = x;
  return v;
}

// Where on screen most of the ice sits, in words.
function whereIce(frame, grid) {
  let sx = 0, sy = 0, s = 0;
  frame.regions.forEach((r, i) => {
    const w = r.ice * r.visible;
    sx += (i % grid.columns + 0.5) / grid.columns * w;
    sy += (Math.floor(i / grid.columns) + 0.5) / grid.rows * w;
    s += w;
  });
  if (s < 0.01) return null;
  const x = sx / s, y = sy / s;
  const h = x < 0.4 ? 'left' : x > 0.6 ? 'right' : 'centre';
  const v = y < 0.4 ? 'upper' : y > 0.6 ? 'lower' : 'middle';
  if (h === 'centre' && v === 'middle') return 'the centre of the picture';
  if (h === 'centre') return `the ${v} part of the picture`;
  if (v === 'middle') return `the ${h} side of the picture`;
  return `the ${v} ${h} of the picture`;
}

export function describe(vis, frame, t, dateAt, grid, prev) {
  const date = fmtDate(dateAt(t));
  if (!frame) return { text: `${date}.`, pct: null };
  const pct = Math.round(frame.total.ice * 100);
  let change = '';
  if (prev != null) {
    const d = pct - prev;
    change = d <= -2 ? `, down from ${prev} percent` : d >= 2 ? `, up from ${prev} percent` : ', about the same as before';
  }
  const where = whereIce(frame, grid);
  const parts = [
    `${date}.`,
    `Sea ice covers ${pct} percent of the visible Earth${change}.`,
    where ? `Most of it is in ${where}.` : '',
  ];
  return { text: parts.filter(Boolean).join(' '), pct };
}
