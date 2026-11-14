// The way in. You start at a child's height in front of an arcade machine,
// looking up at it. The camera rises to where a player stands, over the
// controls, and then moves into the screen, where the worlds are turning.
// Line drawing only. Any key or tap skips it.

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

// planets: [{ canvas, rect() }] the hub's own spinning globes; they are drawn on the machine's screen.
export function playIntro({ canvas, look, title, planets, onFade, onDone }) {
  const g = canvas.getContext('2d');
  const FOV = (50 * Math.PI) / 180, RISE = [0.5, 3.1], DIVE = [3.1, 4.6], FADE = [4.25, 4.95];
  let W = 0, H = 0, dpr = 1, F = 1, t0 = null, skipAt = null, raf = 0, done = false;
  let geo = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(window.innerWidth * dpr); H = canvas.height = Math.round(window.innerHeight * dpr);
    F = H / 2 / Math.tan(FOV / 2);
    geo = build(Math.max(0.62, Math.min(1.6, W / H)));
  }

  // The cabinet, in metres. x across, y up, z toward the viewer. The screen has the shape of this window.
  function build(aspect) {
    const hs = 0.56, ws = hs * aspect, hw = ws / 2 + 0.07;
    // side profile from the front foot, up the front, round the top and down the back: [z, y]
    const prof = [[0.30, 0], [0.30, 0.74], [0.44, 0.88], [0.13, 1.0], [0.02, 1.55], [0.24, 1.62], [0.24, 1.84], [-0.42, 1.84], [-0.42, 0]];
    const L = prof.map(([z, y]) => [-hw, y, z]), Rr = prof.map(([z, y]) => [hw, y, z]);
    const lines = [];
    // outline only: the front and top of each side, and the edges across the front. The back is left open.
    for (const side of [L, Rr]) for (let i = 0; i < 7; i++) lines.push([side[i], side[i + 1]]);
    for (let i = 0; i < 7; i++) lines.push([L[i], Rr[i]]);
    // the screen: a rectangle on the leaning face between profile points 3 and 4
    const b = [0, 1.0, 0.13], tpt = [0, 1.55, 0.02];
    const up = V.norm(V.sub(tpt, b)), len = Math.hypot(0.55, 0.11), right = [1, 0, 0];
    const centre = V.add(b, V.mul(up, len / 2)), normal = V.norm(V.cross(right, up));
    const corner = (u, v) => V.add(V.add(centre, V.mul(right, u * ws)), V.mul(up, v * hs));
    const scr = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
    for (let i = 0; i < 4; i++) lines.push([scr[i], scr[(i + 1) % 4]]);
    // the sign on top
    const m = 0.03, sign = [[-hw + m, 1.84 - m, 0.24], [hw - m, 1.84 - m, 0.24], [hw - m, 1.62 + m, 0.24], [-hw + m, 1.62 + m, 0.24]];
    // the controls: a stick and three buttons on the sloping panel between profile points 2 and 3
    const p2 = [0, 0.88, 0.44], p3 = [0, 1.0, 0.13], along = V.norm(V.sub(p3, p2)), pn = V.norm(V.cross(right, along));
    const on = (u, v) => V.add(V.add(V.mix(p2, p3, v), V.mul(right, u * hw)), V.mul(pn, 0.004));
    const ring = (c, r, n = 20) => { const pts = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(V.add(V.add(c, V.mul(right, Math.cos(a) * r)), V.mul(along, Math.sin(a) * r))); } return pts; };
    const stickBase = on(-0.5, 0.5), stickTop = V.add(stickBase, V.mul(pn, 0.1));
    const controls = { rings: [ring(stickBase, 0.035), ...[0.1, 0.38, 0.66].map((u) => ring(on(u, 0.5), 0.032))], stick: [stickBase, stickTop], pn };
    // the floor: lines running back from the viewer, and where it meets the wall
    const floor = [];
    for (let i = -4; i <= 4; i++) floor.push([[i * 0.6, 0, 2.6], [i * 0.6, 0, -1.2]]);
    floor.push([[-2.6, 0, -1.2], [2.6, 0, -1.2]]);
    return { lines, scr, sign, controls, floor, centre, normal, up, right, hs, ws };
  }

  function camera(t) {
    const { centre, normal, hs } = geo;
    const k0 = { c: [0.16, 0.6, 1.6], a: [0, 1.3, 0.1] };             // a child looking up
    const k1 = { c: [0, 1.36, 1.3], a: [0, 1.04, 0.16] };             // a player, over the controls
    const k2 = { c: V.add(centre, V.mul(normal, (hs * F) / H)), a: centre };   // the screen fills the window
    const a = ease((t - RISE[0]) / (RISE[1] - RISE[0])), b = ease((t - DIVE[0]) / (DIVE[1] - DIVE[0]));
    let c = V.mix(k0.c, k1.c, a), at = V.mix(k0.a, k1.a, a);
    c = V.mix(c, k2.c, b); at = V.mix(at, k2.a, b);
    const f = V.norm(V.sub(at, c)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
    return { c, f, r, u };
  }
  const view = (cam, p) => { const q = V.sub(p, cam.c); return [V.dot(q, cam.r), V.dot(q, cam.u), V.dot(q, cam.f)]; };
  const scr2 = (v) => [W / 2 + (v[0] / v[2]) * F, H / 2 - (v[1] / v[2]) * F];

  function strokeLines(cam, list, alpha, width, rgb, glow) {
    const NEAR = 0.05;
    const path = () => {
      g.beginPath();
      for (const [p, q] of list) {
        let a = view(cam, p), b = view(cam, q);
        if (a[2] < NEAR && b[2] < NEAR) continue;
        if (a[2] < NEAR) a = V.mix(b, a, (b[2] - NEAR) / (b[2] - a[2]));
        if (b[2] < NEAR) b = V.mix(a, b, (a[2] - NEAR) / (a[2] - b[2]));
        const s = scr2(a), e = scr2(b);
        g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]);
      }
    };
    g.lineCap = 'round';
    g.strokeStyle = `rgba(${glow},${alpha * 0.2})`; g.lineWidth = width * 4.5 * dpr; path(); g.stroke();
    g.strokeStyle = `rgba(${rgb},${alpha})`; g.lineWidth = width * dpr; path(); g.stroke();
  }
  const poly = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);

  function frame(now) {
    if (done) return;
    raf = requestAnimationFrame(frame);
    if (t0 === null) t0 = now;
    let t = (now - t0) / 1000;
    if (skipAt !== null) t = Math.max(t, FADE[0] + (now - skipAt) / 1000);
    const cam = camera(t), { lines, scr, sign, controls, floor, centre, up, right, hs } = geo;
    const fadeIn = Math.min(1, t / 0.6), out = Math.max(0, Math.min(1, (t - FADE[0]) / (FADE[1] - FADE[0])));
    canvas.style.opacity = String(1 - out);
    onFade(out);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';

    strokeLines(cam, floor, 0.16 * fadeIn, 1, look.line, look.lineGlow);
    strokeLines(cam, lines, 0.9 * fadeIn, 1.3, look.line, look.lineGlow);
    for (const r of controls.rings) strokeLines(cam, poly(r), 0.9 * fadeIn, 1.2, look.data, look.dataGlow);
    strokeLines(cam, [controls.stick], 0.9 * fadeIn, 2, look.line, look.lineGlow);
    const ball = view(cam, controls.stick[1]);
    if (ball[2] > 0.05) { const s = scr2(ball); g.fillStyle = `rgba(${look.data},${fadeIn})`; g.beginPath(); g.arc(s[0], s[1], (0.022 / ball[2]) * F, 0, Math.PI * 2); g.fill(); }

    // the name on the sign, drawn in the plane of the sign
    const sv = sign.map((p) => view(cam, p));
    if (sv.every((v) => v[2] > 0.05)) {
      const [tl, tr, , bl] = sv.map(scr2);
      g.save();
      g.setTransform((tr[0] - tl[0]) / 1000, (tr[1] - tl[1]) / 1000, (bl[0] - tl[0]) / 220, (bl[1] - tl[1]) / 220, tl[0], tl[1]);
      g.fillStyle = `rgba(${look.line},${fadeIn})`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '900 150px "Big Shoulders Display", "Arial Narrow", sans-serif';
      g.fillText(title.toUpperCase(), 500, 118, 940);
      g.restore();
    }
    strokeLines(cam, poly([...sign, sign[0]]), 0.6 * fadeIn, 1, look.line, look.lineGlow);

    // the worlds, turning on the screen: each sits where it will be once the screen fills the window
    const px = hs / window.innerHeight;                                // metres per CSS pixel on the screen
    for (const p of planets) {
      const r = p.rect(); if (!r.width) continue;
      const u = (r.left + r.width / 2 - window.innerWidth / 2) * px, v = (window.innerHeight / 2 - (r.top + r.height / 2)) * px;
      const c = V.add(V.add(centre, V.mul(right, u)), V.mul(up, v));
      const cv = view(cam, c), ev = view(cam, V.add(c, V.mul(right, (r.width / 2) * px))), tv = view(cam, V.add(c, V.mul(up, (r.height / 2) * px)));
      if (cv[2] < 0.05 || ev[2] < 0.05 || tv[2] < 0.05) continue;
      const s = scr2(cv), e = scr2(ev), tp = scr2(tv), rx = Math.abs(e[0] - s[0]), ry = Math.abs(tp[1] - s[1]);
      g.globalAlpha = fadeIn;
      g.drawImage(p.canvas, s[0] - rx, s[1] - ry, rx * 2, ry * 2);
      g.globalAlpha = 1;
    }
    if (t >= FADE[1]) finish();
  }

  function finish() {
    if (done) return;
    done = true; cancelAnimationFrame(raf);
    canvas.hidden = true; onFade(1);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', skip, true); window.removeEventListener('pointerdown', skip, true);
    onDone();
  }
  function skip() { if (skipAt === null) skipAt = performance.now(); }

  resize();
  canvas.hidden = false;
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', skip, true); window.addEventListener('pointerdown', skip, true);
  raf = requestAnimationFrame(frame);
  return { skip, finish };
}
