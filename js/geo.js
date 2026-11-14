// The globe as seen from one side (orthographic), and what each map cell
// contributes to each ear from there.

const RAD = Math.PI / 180;
export const COLS = 360, ROWS = 180, CELLS = COLS * ROWS;

// Screen position of a point: x right, y up, z toward the viewer (z < 0 is the far side).
export function project(lon, lat, lon0, lat0) {
  const l = (lon - lon0) * RAD, p = lat * RAD, p0 = lat0 * RAD;
  const cp = Math.cos(p);
  return [
    cp * Math.sin(l),
    Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l),
    Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l),
  ];
}

// Position of every 1-degree cell for a view. cell = row * 360 + col,
// row 0 is 90N to 89N, col 0 is 180W to 179W.
export function projectCells(lon0, lat0, out) {
  const { x, y, z } = out;
  for (let row = 0; row < ROWS; row++) {
    const lat = 89.5 - row;
    for (let col = 0; col < COLS; col++) {
      const p = project(col - 179.5, lat, lon0, lat0), i = row * COLS + col;
      x[i] = p[0]; y[i] = p[1]; z[i] = p[2];
    }
  }
  return out;
}

// The same, for a view that differs from `base` only by a turn of `cols` whole
// degrees about the Earth's axis: every row is the base row shifted sideways.
export function shiftCells(base, cols, out) {
  const k = ((Math.round(cols) % COLS) + COLS) % COLS;
  for (const a of ['x', 'y', 'z']) {
    const src = base[a], dst = out[a];
    for (let row = 0; row < ROWS; row++) {
      const o = row * COLS;
      dst.set(src.subarray(o, o + COLS - k), o + k);
      dst.set(src.subarray(o + COLS - k, o + COLS), o);
    }
  }
  return out;
}

// Gain per cell per ear: the far side is silent, the edge fades by `falloff`,
// and left to right on the globe is left to right in the ears (equal power).
export function cellGains(proj, falloff, gL, gR) {
  for (let i = 0; i < CELLS; i++) {
    const z = proj.z[i];
    if (z <= 0) { gL[i] = 0; gR[i] = 0; continue; }
    const w = falloff ? Math.pow(z, falloff) : 1;
    const a = (proj.x[i] + 1) * Math.PI / 4;
    gL[i] = w * Math.cos(a); gR[i] = w * Math.sin(a);
  }
}

// Summed gain per frame, for each ear: the rate curve the engine reads at high speed.
export function frameCurves(frameStart, cells, gL, gR, curveL, curveR) {
  const F = frameStart.length - 1;
  for (let f = 0; f < F; f++) {
    let l = 0, r = 0;
    for (let i = frameStart[f], e = frameStart[f + 1]; i < e; i++) { const c = cells[i]; l += gL[c]; r += gR[c]; }
    curveL[f] = l; curveR[f] = r;
  }
}

const PLACES = [
  ['Africa', 20, 5], ['Europe', 15, 50], ['the Middle East', 45, 28], ['India', 78, 22], ['East Asia', 110, 32],
  ['Southeast Asia and Indonesia', 115, 0], ['Australia', 135, -25], ['the western Pacific', 160, 5],
  ['the central Pacific', -150, 0], ['North America', -100, 40], ['Central America and the Caribbean', -85, 15],
  ['South America', -60, -15], ['the Atlantic', -30, 15], ['the Indian Ocean', 75, -15], ['the South Atlantic', -15, -25],
];

export function placeName(lon, lat) {
  let best = PLACES[0], bd = -2;
  for (const p of PLACES) {
    const d = project(p[1], p[2], lon, lat)[2];
    if (d > bd) { bd = d; best = p; }
  }
  return best[0];
}

// Mean and RMS gain of one event (left ear) for a view: the level reference.
export function gainReference(cells, gL) {
  let s = 0, s2 = 0;
  for (let i = 0; i < cells.length; i++) { const g = gL[cells[i]]; s += g; s2 += g * g; }
  return { gMean: s / cells.length, gRms: Math.sqrt(s2 / cells.length) };
}
