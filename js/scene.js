// The place everything happens in: one small 3D scene and one camera.
//
// An arcade machine stands on a floor. Behind its screen three worlds orbit
// each other. The camera can be in three places, and only ever moves between
// them, so there are no cuts:
//   attract  a child's height, looking up at the machine
//   menu     in front of the screen, the machine still around it
//   world    through the glass and up to one world, until it fills the view
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
const NEAR = 0.03;

// planets: [{ canvas }] square pictures of each world, kept up to date by the caller.
// landing(i): where world i's globe must end up on screen, { x, y, r } in CSS pixels.
export function makeScene({ canvas, look, title, planets, landing, still = false }) {
  const g = canvas.getContext('2d');
  const FOV = (50 * Math.PI) / 180;
  let W = 0, H = 0, dpr = 1, F = 1, geo = null;
  let mode = 'attract', active = 0, move = null, clock = 0;   // move: { from, to, via, t, dur, done }
  const N = planets.length;

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
    const inside = [0, 0.9, -0.1];
    const face = (pts, extra = {}) => {
      const c = pts.reduce((a, p) => V.add(a, p), [0, 0, 0]).map((v) => v / pts.length);
      let n = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])));
      if (V.dot(n, V.sub(c, inside)) < 0) n = V.mul(n, -1);
      return { pts, c, n, ...extra };
    };
    // the screen: the leaning face between profile points 3 and 4. It is glass, so it is not filled.
    const b = [0, 1.0, 0.13], t = [0, 1.55, 0.02], right = [1, 0, 0];
    const up = V.norm(V.sub(t, b)), centre = V.mix(b, t, 0.5), normal = V.norm(V.cross(right, up));
    const corner = (u, v) => V.add(V.add(centre, V.mul(right, u * ws)), V.mul(up, v * hs));
    const scr = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
    const faces = [
      face(L, { n0: [-1, 0, 0] }), face(R, { n0: [1, 0, 0] }),
      ...[0, 1, 2, 4, 5, 6].map((i) => face([L[i], R[i], R[i + 1], L[i + 1]], { part: i })),
      face([L[3], scr[0], scr[3], L[4]], { part: 3 }), face([scr[1], R[3], R[4], scr[2]], { part: 3 }),   // the frame beside the glass
    ];
    faces[0].n = [-1, 0, 0]; faces[1].n = [1, 0, 0];
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
    const orbitC = V.add(V.add(centre, V.mul(back, rho + 0.1)), V.mul(up, -hs * 0.03));
    return { faces, scr, sign, controls, floor, centre, normal, up, right, hs, ws, hw, e2, rho, pr, orbitC, ring: ring(orbitC, rho, right, e2, 48) };
  }

  const angle = (i) => (still ? 0.6 : clock * 0.16) + (i / N) * Math.PI * 2 - Math.PI / 2;
  const planetAt = (i) => { const a = angle(i); return V.add(geo.orbitC, V.add(V.mul(geo.right, Math.cos(a) * geo.rho), V.mul(geo.e2, Math.sin(a) * geo.rho))); };

  // ---- where the camera is in each place: { c: position, a: the point it looks at } ----
  const poses = {
    attract: () => ({ c: [0.16, 0.6 + (still ? 0 : Math.sin(clock / 0.9) * 0.012), 1.6], a: [0, 1.3, 0.1] }),
    // in front of the glass, far enough back to see the sign above and the controls below
    menu: () => {
      const d = Math.max((geo.hs * F) / (H * 0.56), (geo.hw * 2.1 * F) / W);   // and far enough to see both sides of it
      const a = V.add(geo.centre, V.mul(geo.up, geo.hs * 0.19));
      return { c: V.add(a, V.mul(geo.normal, d)), a };
    },
    // looking straight into the machine at one world, close enough that it lands where the big globe is drawn
    world: (i) => {
      const t = landing(i), p = planetAt(i), f = V.mul(geo.normal, -1), r = geo.right, u = V.cross(r, f);
      const d = (geo.pr * F) / (t.r * dpr);
      const a = V.add(p, V.add(V.mul(r, (-(t.x * dpr - W / 2) * d) / F), V.mul(u, ((t.y * dpr - H / 2) * d) / F)));
      return { c: V.sub(a, V.mul(f, d)), a };
    },
  };
  const poseOf = (where) => (where.mode === 'world' ? poses.world(where.i) : poses[where.mode]());

  function camera() {
    let p;
    if (move) {
      const k = ease(move.t / move.dur), A = poseOf(move.from), B = poseOf(move.to);
      if (move.via) {                                    // out, across and in: bend the path through a third place
        const M = poseOf(move.via), q = (x, y, z) => V.add(V.add(V.mul(x, (1 - k) * (1 - k)), V.mul(y, 2 * k * (1 - k))), V.mul(z, k * k));
        p = { c: q(A.c, M.c, B.c), a: q(A.a, M.a, B.a) };
      } else p = { c: V.mix(A.c, B.c, k), a: V.mix(A.a, B.a, k) };
    } else p = poseOf({ mode, i: active });
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
    if (closed) v = clip(v);
    else {                                               // an open line: cut each piece
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

  // Draw one frame. Returns where each world is on screen (CSS pixels) and how far along a move is.
  function frame(dt) {
    clock += dt;
    if (move) {
      move.t += dt;
      if (move.t >= move.dur) { mode = move.to.mode; active = move.to.i ?? active; const done = move.done; move = null; done?.(); }
    }
    const cam = camera(), { faces, scr, sign, controls, floor, ring, pr } = geo;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const outside = V.dot(V.sub(cam.c, geo.centre), geo.normal) > 0;      // in front of the glass?

    if (outside) { for (const l of floor) { trace(cam, l, false); stroke(0.16, 1); } }

    // the space behind the glass, seen through the screen when we are in front of it
    g.save();
    if (outside) { if (trace(cam, scr, true)) g.clip(); else { g.beginPath(); g.rect(0, 0, 0, 0); g.clip(); } }
    trace(cam, ring, false); stroke(outside ? 0.28 : 0.16, 1);
    const spots = planets.map((p, i) => {
      const c = planetAt(i), cv = view(cam, c);
      if (cv[2] < NEAR * 2) return { i, z: -1 };
      const s = px(cv), r = (pr / cv[2]) * F;
      return { i, z: cv[2], x: s[0], y: s[1], r };
    });
    // On the way into a world the others fade, so they do not sweep across the view; on the way out they return.
    const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const shown = (i) => {
      if (!move) return mode === 'world' ? (i === active ? 1 : 0) : 1;
      const k = move.t / move.dur, into = move.to.mode === 'world', outOf = move.from.mode === 'world';
      if (into && i === move.to.i) return 1;
      if (outOf && i === move.from.i) return into ? 1 - smooth((k - 0.35) / 0.4) : 1;
      return into ? (outOf ? 0 : 1 - smooth(k / 0.35)) : outOf ? smooth((k - 0.35) / 0.5) : 1;
    };
    for (const s of spots.filter((q) => q.z > 0).sort((a, b) => b.z - a.z)) {
      const al = shown(s.i); if (al <= 0.01) continue;
      g.globalAlpha = al;
      g.fillStyle = '#000'; g.beginPath(); g.arc(s.x, s.y, s.r * 1.01, 0, Math.PI * 2); g.fill();   // a world hides what is behind it
      const k = s.r / 0.94;                               // the picture's globe is 0.47 of its width, so 0.94 of its half-width
      g.drawImage(planets[s.i].canvas, s.x - k, s.y - k, k * 2, k * 2);
      g.globalAlpha = 1;
    }
    g.restore();

    if (outside) {
      // the machine: faces that point toward the camera, farthest first, filled black then outlined
      const seen = faces.filter((f) => V.dot(f.n, V.sub(cam.c, f.c)) > 0)
        .map((f) => ({ f, d: Math.max(...f.pts.map((p) => view(cam, p)[2])) })).sort((a, b) => b.d - a.d);
      for (const { f } of seen) { if (!trace(cam, f.pts, true)) continue; g.fillStyle = '#000'; g.fill(); stroke(0.9, 1.3); }
      if (trace(cam, scr, true)) stroke(0.9, 1.3);
      if (V.dot(controls.face.n, V.sub(cam.c, controls.face.c)) > 0) {
        for (const r of controls.rings) { trace(cam, r, false); stroke(0.9, 1.2, true); }
        trace(cam, controls.stick, false); stroke(0.9, 2);
        const ball = view(cam, controls.stick[1]);
        if (ball[2] > NEAR) { const s = px(ball); g.fillStyle = `rgb(${look.data})`; g.beginPath(); g.arc(s[0], s[1], (0.022 / ball[2]) * F, 0, Math.PI * 2); g.fill(); }
      }
      // the name on the sign, drawn in the plane of the sign
      const sv = sign.map((p) => view(cam, p));
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
    }
    return {
      spots: spots.map((s) => (s.z > 0 ? { x: s.x / dpr, y: s.y / dpr, r: s.r / dpr } : null)),
      moving: move ? { ...move, k: move.t / move.dur } : null, mode, active,
    };
  }

  // Move the camera somewhere. `to` is { mode } or { mode: 'world', i }.
  function go(to, seconds, done, via) {
    const from = move ? null : { mode, i: active };
    if (!from) {                                         // already moving: finish that move where it stands and start from there
      mode = move.to.mode; active = move.to.i ?? active; move = null;
      return go(to, seconds, done, via);
    }
    if (still || seconds <= 0) { mode = to.mode; active = to.i ?? active; done?.(); return; }
    move = { from, to, via, t: 0, dur: seconds, done };
  }

  resize();
  return { resize, frame, go, get mode() { return mode; }, get active() { return active; }, get moving() { return !!move; }, set(to) { mode = to.mode; active = to.i ?? active; move = null; } };
}
