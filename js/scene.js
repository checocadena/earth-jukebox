// The place everything happens in: one small 3D scene and one camera.
//
// An arcade machine stands in space. Behind its screen three worlds go round
// a ring. The camera can be in three places, and only ever moves between
// them, so there are no cuts:
//   attract  a child's height, looking up at the machine
//   menu     in front of the screen, the machine still around it
//   world    through the glass and up to one world, until it fills the view
// There are two skies. Far stars are all around the machine. The screen is dark
// glass with its own stars behind it, which shift as the camera moves, so what
// is inside the screen stays inside the screen.
// Going from one world to the next, the camera swings along the ring.
// The machine is solid: faces are filled black and drawn back to front, so
// nothing shows through it. Lines only, white on black.

const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const NEAR = 0.03;

// planets: [{ canvas, d: { title } }] square pictures of each world, kept up to date by the caller.
// landing(i): where world i's globe must end up on screen, { x, y, r } in CSS pixels.
export function makeScene({ canvas, look, title, planets, landing, still = false }) {
  const g = canvas.getContext('2d');
  const FOV = (50 * Math.PI) / 180;
  let W = 0, H = 0, dpr = 1, F = 1, geo = null;
  let mode = 'attract', active = 0, move = null, clock = 0, hot = -1;   // move: { from, to, glide, t, dur, done }
  let lift = [0, 0, 0];             // keeps the worlds in the middle of the screen when seen from below
  const N = planets.length;
  let seed = 3912; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  // far stars: directions all around. inner stars: places behind the glass, as [across, up, depth] in metres.
  const far = Array.from({ length: 300 }, () => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return { d: [r * Math.cos(a), z, r * Math.sin(a)], b: rnd() }; });
  const inner = Array.from({ length: 320 }, () => ({ p: [(rnd() * 2 - 1) * 3.2, (rnd() * 2 - 1) * 3.2, 0.9 + rnd() * 5.5], b: rnd() }));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : 2);
    W = canvas.width = Math.round(window.innerWidth * dpr); H = canvas.height = Math.round(window.innerHeight * dpr);
    F = H / 2 / Math.tan(FOV / 2);
    geo = build(Math.max(0.62, Math.min(1.6, W / H)));
  }

  // The machine, in metres. x across, y up, z toward the viewer.
  function build(aspect) {
    const hs = 0.56, ws = hs * aspect, hw = ws / 2 + 0.07;
    // side profile, from the front foot up the front, over the top and down the back: [z, y]
    const prof = [[0.30, 0], [0.30, 0.74], [0.44, 0.88], [0.13, 1.0], [0.02, 1.55], [0.24, 1.62], [0.24, 1.84], [-0.42, 1.84], [-0.42, 0]];
    const L = prof.map(([z, y]) => [-hw, y, z]), R = prof.map(([z, y]) => [hw, y, z]);
    const face = (pts, n, extra = {}) => ({ pts, n: V.norm(n), c: pts.reduce((a, p) => V.add(a, p), [0, 0, 0]).map((v) => v / pts.length), ...extra });
    // Going up the front of the profile, the outside is to the right of the way we are going.
    const out = (i) => [0, -(prof[i + 1][0] - prof[i][0]), prof[i + 1][1] - prof[i][1]];
    // the screen: the leaning face between profile points 3 and 4. It is glass, so it is not filled.
    const b = [0, 1.0, 0.13], t = [0, 1.55, 0.02], right = [1, 0, 0];
    const up = V.norm(V.sub(t, b)), centre = V.mix(b, t, 0.5), normal = V.norm(V.cross(right, up));
    const corner = (u, v) => V.add(V.add(centre, V.mul(right, u * ws)), V.mul(up, v * hs));
    const scr = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
    const faces = [
      face(L, [-1, 0, 0]), face(R, [1, 0, 0]),
      // front, slope, control panel, underside of the housing over the screen, front of the housing (the sign), top
      ...[0, 1, 2, 4, 5, 6].map((i) => face([L[i], R[i], R[i + 1], L[i + 1]], out(i), { part: i })),
      face([L[3], scr[0], scr[3], L[4]], normal, { part: 3 }), face([scr[1], R[3], R[4], scr[2]], normal, { part: 3 }),   // the frame beside the glass
    ];
    // the sign, the stick and the buttons
    const m = 0.03, sign = [[-hw + m, 1.84 - m, 0.241], [hw - m, 1.84 - m, 0.241], [hw - m, 1.62 + m, 0.241], [-hw + m, 1.62 + m, 0.241]];
    const p2 = [0, 0.88, 0.44], p3 = [0, 1.0, 0.13], along = V.norm(V.sub(p3, p2)), pn = V.norm(V.cross(right, along));
    const on = (u, v) => V.add(V.add(V.mix(p2, p3, v), V.mul(right, u * hw)), V.mul(pn, 0.003));
    const ring = (c, r, a1, a2, n = 22) => { const pts = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(V.add(V.add(c, V.mul(a1, Math.cos(a) * r)), V.mul(a2, Math.sin(a) * r))); } return pts; };
    const stickBase = on(-0.5, 0.5);
    const controls = { rings: [ring(stickBase, 0.035, right, along), ...[0.1, 0.38, 0.66].map((u) => ring(on(u, 0.5), 0.032, right, along))], stick: [stickBase, V.add(stickBase, V.mul(pn, 0.1))], face: faces.find((f) => f.part === 2) };
    const floor = [];
    for (let i = -4; i <= 4; i++) floor.push([[i * 0.6, 0, 2.6], [i * 0.6, 0, -0.42]]);
    floor.push([[-2.6, 0, -0.42], [2.6, 0, -0.42]]);
    // the space behind the glass: the worlds go round a ring that leans back, far side higher
    const tilt = (38 * Math.PI) / 180, back = V.mul(normal, -1);
    const e2 = V.norm(V.add(V.mul(back, Math.cos(tilt)), V.mul(up, Math.sin(tilt))));
    const rho = Math.min(ws, hs) * 0.35, pr = rho * 0.62;
    const orbitC = V.add(centre, V.mul(back, rho * 1.5));
    return { faces, scr, sign, controls, floor, centre, normal, up, right, hs, ws, hw, e2, rho, pr, orbitC, ringOf: (c) => ring(c, rho, right, e2, 48) };
  }

  const angle = (i) => (still ? 0.6 : clock * 0.16) + (i / N) * Math.PI * 2 - Math.PI / 2;
  const onRing = (a) => V.add(V.add(geo.orbitC, lift), V.add(V.mul(geo.right, Math.cos(a) * geo.rho), V.mul(geo.e2, Math.sin(a) * geo.rho)));
  const planetAt = (i) => onRing(angle(i));

  // ---- where the camera is in each place: { c: position, a: the point it looks at } ----
  // Looking straight into the machine at a point p, close enough that a world there lands at `t` on screen.
  function facing(p, t, pull = 1) {
    const f = V.mul(geo.normal, -1), r = geo.right, u = V.cross(r, f), d = ((geo.pr * F) / (t.r * dpr)) * pull;
    const a = V.add(p, V.add(V.mul(r, (-(t.x * dpr - W / 2) * d) / F), V.mul(u, ((t.y * dpr - H / 2) * d) / F)));
    return { c: V.sub(a, V.mul(f, d)), a };
  }
  const poses = {
    attract: () => ({ c: [0.16, 0.6 + (still ? 0 : Math.sin(clock / 0.9) * 0.012), 1.6], a: [0, 1.3, 0.1] }),
    // in front of the glass, far enough back to see the sign above, the controls below and both sides
    menu: () => {
      const d = Math.max((geo.hs * F) / (H * 0.52), (geo.hw * 2.3 * F) / W);
      const a = V.add(geo.centre, V.mul(geo.up, geo.hs * 0.22));
      return { c: V.add(a, V.mul(geo.normal, d)), a };
    },
    world: (i) => facing(planetAt(i), landing(i)),
  };
  const poseOf = (where) => (where.mode === 'world' ? poses.world(where.i) : poses[where.mode]());

  function pose() {
    if (!move) return poseOf({ mode, i: active });
    const k = ease(move.t / move.dur);
    if (move.glide) {
      // From one world to the next: swing along the ring, easing back a little on the way so both are seen.
      const a0 = angle(move.from.i), a1 = angle(move.to.i);
      let da = (a1 - a0) % (Math.PI * 2); if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      const t0 = landing(move.from.i), t1 = landing(move.to.i);
      const t = { x: t0.x + (t1.x - t0.x) * k, y: t0.y + (t1.y - t0.y) * k, r: t0.r + (t1.r - t0.r) * k };
      return facing(onRing(a0 + da * k), t, 1 + 0.9 * Math.sin(Math.PI * k));
    }
    const A = poseOf(move.from), B = poseOf(move.to);
    return { c: V.mix(A.c, B.c, k), a: V.mix(A.a, B.a, k) };
  }
  function cameraFrom(p) {
    const f = V.norm(V.sub(p.a, p.c)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
    return { c: p.c, f, r, u };
  }
  const view = (cam, p) => { const q = V.sub(p, cam.c); return [V.dot(q, cam.r), V.dot(q, cam.u), V.dot(q, cam.f)]; };
  const px = (v) => [W / 2 + (v[0] / v[2]) * F, H / 2 - (v[1] / v[2]) * F];

  // cut a polygon (in camera space) at the near plane
  function clip(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) out.push(V.mix(a, b, (NEAR - a[2]) / (b[2] - a[2])));
    }
    return out;
  }
  function trace(cam, pts, closed) {
    let v = pts.map((p) => view(cam, p));
    if (!closed) {                                       // an open line: cut each piece
      g.beginPath();
      for (let i = 0; i < v.length - 1; i++) {
        let a = v[i], b = v[i + 1];
        if (a[2] < NEAR && b[2] < NEAR) continue;
        if (a[2] < NEAR) a = V.mix(b, a, (b[2] - NEAR) / (b[2] - a[2]));
        if (b[2] < NEAR) b = V.mix(a, b, (a[2] - NEAR) / (a[2] - b[2]));
        const s = px(a), e = px(b); g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]);
      }
      return true;
    }
    v = clip(v);
    if (v.length < 3) return false;
    g.beginPath();
    v.forEach((q, i) => { const s = px(q); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
    g.closePath();
    return true;
  }
  function stroke(alpha, width, data) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = `rgba(${data ? look.dataGlow : look.lineGlow},${alpha * 0.2})`; g.lineWidth = width * 4.5 * dpr; g.stroke();
    g.strokeStyle = `rgba(${data ? look.data : look.line},${alpha})`; g.lineWidth = width * dpr; g.stroke();
  }

  // A world's name, set on a curve under it, so it belongs to that world and nothing else.
  function nameOn(s, text, alpha, lit) {
    const size = Math.max(9 * dpr, s.r * 0.3), rad = s.r + size * 0.95;
    g.font = `800 ${size}px "Big Shoulders Display", "Arial Narrow", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = `rgba(${lit ? look.data : look.line},${alpha})`;
    const chars = [...text.toUpperCase()], widths = chars.map((c) => g.measureText(c).width + size * 0.06);
    const total = widths.reduce((a, b) => a + b, 0);
    let a = Math.PI / 2 + total / 2 / rad;               // start left of the bottom and run to the right
    for (let i = 0; i < chars.length; i++) {
      a -= widths[i] / 2 / rad;
      g.save(); g.translate(s.x + Math.cos(a) * rad, s.y + Math.sin(a) * rad); g.rotate(a - Math.PI / 2); g.fillText(chars[i], 0, 0); g.restore();
      a -= widths[i] / 2 / rad;
    }
  }

  // Draw one frame. Returns where each world is on screen (CSS pixels) and how far along a move is.
  // content: 1 = draw everything, 0 = only the stars (a world is showing in front of this picture).
  function frame(dt, content = 1) {
    clock += dt;
    if (move) {
      move.t += dt;
      if (move.t >= move.dur) { mode = move.to.mode; active = move.to.i ?? active; const done = move.done; move = null; done?.(); }
    }
    // How much we are still down at the child's height. From there the worlds would sit low
    // in the screen, so they are raised to the middle of it, and let down as the camera comes up.
    const k = move ? ease(move.t / move.dur) : 0;
    const low = move ? (move.from.mode === 'attract' ? 1 - k : move.to.mode === 'attract' ? k : 0) : mode === 'attract' ? 1 : 0;
    lift = [0, 0, 0];
    if (low > 0) {
      const c = poses.attract().c, n = geo.normal;
      const t = V.dot(V.sub(geo.orbitC, c), n) / V.dot(V.sub(geo.centre, c), n);
      lift = V.mul(V.sub(V.add(c, V.mul(V.sub(geo.centre, c), t)), geo.orbitC), low);
    }
    const cam = cameraFrom(pose()), { faces, scr, sign, controls, floor, pr } = geo;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);                             // the stars are behind this canvas
    const gap = V.dot(V.sub(cam.c, geo.centre), geo.normal);            // how far in front of the glass the camera is
    const outside = gap > 0;
    const far1 = smooth((gap - 0.12) / 0.5);                            // 0 when pressed up to the glass: the machine's own lines fade there

    const dot = (v, b) => {
      if (v[2] <= NEAR) return;
      const q = px(v), r = (b > 0.96 ? 1.4 : b > 0.8 ? 1 : 0.7) * dpr;
      g.fillStyle = `rgba(${look.line},${(0.2 + 0.6 * b * b).toFixed(2)})`; g.fillRect(q[0] - r / 2, q[1] - r / 2, r, r);
    };
    const back = V.mul(geo.normal, -1);
    const innerAt = (q) => V.add(geo.centre, V.add(V.add(V.mul(geo.right, q[0]), V.mul(geo.up, q[1])), V.mul(back, q[2])));
    if (outside) {
      for (const st of far) dot([V.dot(st.d, cam.r), V.dot(st.d, cam.u), V.dot(st.d, cam.f)], st.b);   // so far away that only the camera's turning moves them
      g.globalAlpha = content;
      for (const l of floor) { trace(cam, l, false); stroke(0.13, 1); }
      g.globalAlpha = 1;
    }

    // the space behind the glass, seen through the screen when we are in front of it
    g.save();
    if (outside) {
      if (trace(cam, scr, true)) { g.fillStyle = '#03060a'; g.fill(); g.clip(); } else { g.beginPath(); g.rect(0, 0, 0, 0); g.clip(); }   // dark glass: the far stars stop at the frame
    }
    for (const st of inner) dot(view(cam, innerAt(st.p)), st.b);
    if (content <= 0.005) { g.restore(); return { spots: planets.map(() => null), moving: move ? { ...move, k: move.t / move.dur } : null, mode, active }; }
    g.globalAlpha = content;
    const into = move && move.to.mode === 'world', outOf = move && move.from.mode === 'world', p = move ? move.t / move.dur : 0;
    trace(cam, geo.ringOf(V.add(geo.orbitC, lift)), false); stroke(outside ? 0.28 : 0.16, 1);
    g.globalAlpha = 1;
    const spots = planets.map((_, i) => {
      const cv = view(cam, planetAt(i));
      if (cv[2] < NEAR * 2) return { i, z: -1 };
      const s = px(cv);
      return { i, z: cv[2], x: s[0], y: s[1], r: (pr / cv[2]) * F };
    });
    // On the way into a world the others fade, so they do not sweep across the view; on the way out they return.
    const shown = (i) => {
      if (!move) return mode === 'world' ? (i === active ? 1 : 0) : 1;
      if (move.glide) return i === move.from.i || i === move.to.i ? 1 : Math.sin(Math.PI * p);
      if (into && i === move.to.i) return 1;
      if (outOf && i === move.from.i) return 1;
      return into ? 1 - smooth(p / 0.35) : outOf ? smooth((p - 0.35) / 0.5) : 1;
    };
    // names show in the menu and from the child's height, and go as we fly in
    const names = !move ? (mode === 'world' ? 0 : 1) : into ? (outOf ? 0 : 1 - smooth(p / 0.3)) : outOf ? smooth((p - 0.6) / 0.4) : 1;
    for (const s of spots.filter((q) => q.z > 0).sort((a, b) => b.z - a.z)) {
      const al = shown(s.i) * content; if (al <= 0.01) continue;
      g.globalAlpha = al;
      g.fillStyle = '#000'; g.beginPath(); g.arc(s.x, s.y, s.r * 1.01, 0, Math.PI * 2); g.fill();   // a world hides what is behind it
      const h = s.r / 0.94;                               // the picture's globe is 0.47 of its width, so 0.94 of its half-width
      g.drawImage(planets[s.i].canvas, s.x - h, s.y - h, h * 2, h * 2);
      g.globalAlpha = 1;
      if (names > 0.01) nameOn(s, planets[s.i].d.title, names * al, s.i === hot);
    }
    if (outside) {                                       // the lines of a picture tube, lying on the glass
      g.globalAlpha = content * far1;
      for (let j = 1; j < 40; j++) { const t = j / 40; trace(cam, [V.mix(scr[0], scr[3], t), V.mix(scr[1], scr[2], t)], false); g.strokeStyle = `rgba(${look.line},0.045)`; g.lineWidth = dpr; g.stroke(); }
    }
    g.restore();

    if (outside && far1 > 0.01) {
      g.globalAlpha = content * far1;
      // the machine: faces that point toward the camera, farthest first, filled black then outlined
      const seen = faces.filter((f) => V.dot(f.n, V.sub(cam.c, f.c)) > 0)
        .map((f) => ({ f, d: Math.max(...f.pts.map((q) => view(cam, q)[2])) })).sort((a, b) => b.d - a.d);
      for (const { f } of seen) { if (!trace(cam, f.pts, true)) continue; g.fillStyle = '#000'; g.fill(); stroke(0.9, 1.3); }
      if (trace(cam, scr, true)) stroke(0.9, 1.3);
      if (V.dot(controls.face.n, V.sub(cam.c, controls.face.c)) > 0) {
        for (const r of controls.rings) { trace(cam, r, false); stroke(0.9, 1.2, true); }
        trace(cam, controls.stick, false); stroke(0.9, 2);
        const ball = view(cam, controls.stick[1]);
        if (ball[2] > NEAR) { const s = px(ball); g.fillStyle = `rgb(${look.data})`; g.beginPath(); g.arc(s[0], s[1], (0.022 / ball[2]) * F, 0, Math.PI * 2); g.fill(); }
      }
      // the name on the sign, drawn in the plane of the sign
      const sv = sign.map((q) => view(cam, q));
      if (sv.every((v) => v[2] > NEAR) && V.dot([0, 0, 1], V.sub(cam.c, sign[0])) > 0) {
        const [tl, tr, , bl] = sv.map(px);
        g.save();
        g.setTransform((tr[0] - tl[0]) / 1000, (tr[1] - tl[1]) / 1000, (bl[0] - tl[0]) / 220, (bl[1] - tl[1]) / 220, tl[0], tl[1]);
        g.fillStyle = `rgb(${look.line})`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '900 150px "Big Shoulders Display", "Arial Narrow", sans-serif';
        g.fillText(title.toUpperCase(), 500, 118, 940);
        g.restore();
        if (trace(cam, sign, true)) stroke(0.5, 1);
      }
      g.globalAlpha = 1;
    }
    return {
      spots: spots.map((s) => (s.z > 0 ? { x: s.x / dpr, y: s.y / dpr, r: s.r / dpr } : null)),
      moving: move ? { ...move, k: move.t / move.dur } : null, mode, active,
    };
  }

  // Move the camera somewhere. `to` is { mode } or { mode: 'world', i }. Between two worlds it swings along the ring.
  function go(to, seconds, done) {
    if (move) { mode = move.to.mode; active = move.to.i ?? active; move = null; }   // already moving: carry on from where that was going
    const from = { mode, i: active };
    if (still || seconds <= 0) { mode = to.mode; active = to.i ?? active; done?.(); return; }
    move = { from, to, glide: from.mode === 'world' && to.mode === 'world', t: 0, dur: seconds, done };
  }

  resize();
  return {
    resize, frame, go,
    get mode() { return mode; }, get active() { return active; }, get moving() { return !!move; },
    get progress() { return move ? { to: move.to, from: move.from, k: move.t / move.dur } : null; },
    set(to) { mode = to.mode; active = to.i ?? active; move = null; },
    set hot(i) { hot = i; },
  };
}
