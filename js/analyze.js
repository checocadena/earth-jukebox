// Reads a video frame region by region and returns colour features.
// Works on any CanvasImageSource (video, image). Pixels of black space around
// the globe are ignored so they do not count as "dark".

const W = 96, H = 54; // analysis resolution: small on purpose, fast on phones

export function makeAnalyzer(grid, exclude = []) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const cols = grid.columns, rows = grid.rows;

  const skip = new Uint8Array(W * H);
  for (const r of exclude) {
    for (let y = Math.floor(r.y * H); y < Math.ceil((r.y + r.h) * H); y++)
      for (let x = Math.floor(r.x * W); x < Math.ceil((r.x + r.w) * W); x++) skip[y * W + x] = 1;
  }

  return function analyze(source) {
    ctx.drawImage(source, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const n = cols * rows;
    const acc = Array.from({ length: n }, () => ({ count: 0, ice: 0, snow: 0, ocean: 0, bright: 0, sat: 0, hx: 0, hy: 0 }));
    let tot = { count: 0, ice: 0, snow: 0, ocean: 0, bright: 0 };

    for (let y = 0; y < H; y++) {
      const row = Math.min(rows - 1, Math.floor((y / H) * rows));
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (skip[i]) continue;
        const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 0.08) continue; // space
        const sat = mx > 0 ? (mx - mn) / mx : 0;
        const white = mx > 0.6 && sat < 0.3;
        const ice = white && b - r > 0.03;
        const snow = white && !ice;
        const ocean = !white && b > r + 0.08 && mx < 0.6;
        let h = 0;
        if (mx !== mn) {
          const d = mx - mn;
          h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
          h = (h < 0 ? h + 6 : h) / 6;
        }
        const col = Math.min(cols - 1, Math.floor((x / W) * cols));
        const a = acc[row * cols + col];
        a.count++; a.ice += ice; a.snow += snow; a.ocean += ocean; a.bright += mx; a.sat += sat;
        a.hx += Math.cos(h * 2 * Math.PI) * sat; a.hy += Math.sin(h * 2 * Math.PI) * sat;
        tot.count++; tot.ice += ice; tot.snow += snow; tot.ocean += ocean; tot.bright += mx;
      }
    }

    const regions = acc.map((a, k) => {
      const c = a.count || 1;
      let hue = Math.atan2(a.hy, a.hx) / (2 * Math.PI); if (hue < 0) hue += 1;
      return {
        ice: a.ice / c, snow: a.snow / c, ocean: a.ocean / c,
        brightness: a.bright / c, saturation: a.sat / c, hue,
        visible: a.count / ((W / cols) * (H / rows)),
      };
    });
    const c = tot.count || 1;
    return {
      regions,
      total: { ice: tot.ice / c, snow: tot.snow / c, ocean: tot.ocean / c, brightness: tot.bright / c, visible: tot.count / (W * H) },
    };
  };
}

// Compact storage for precomputed feature tracks.
const KEYS = ['ice', 'snow', 'ocean', 'brightness', 'saturation', 'hue', 'visible'];

export function packFrame(f) {
  const r2 = (v) => Math.round(v * 100);
  return [KEYS.map((k) => r2(f.total[k] ?? 0)), f.regions.map((r) => KEYS.map((k) => r2(r[k])))];
}

export function unpackFrame([tot, regs]) {
  const o = (arr) => Object.fromEntries(KEYS.map((k, i) => [k, arr[i] / 100]));
  return { total: o(tot), regions: regs.map(o) };
}

// A track is frames at a fixed rate. at(t) returns the nearest frame.
export function makeTrack(json) {
  const frames = json.frames.map(unpackFrame);
  return {
    rate: json.rate, duration: json.duration, grid: json.grid, frames,
    at(t) { return frames[Math.max(0, Math.min(frames.length - 1, Math.round(t * json.rate)))]; },
  };
}

// Scan a whole video by seeking. Used when no precomputed track exists, and by
// tools/build-features.mjs to write one.
export async function scanVideo(video, analyze, rate, onProgress) {
  const duration = video.duration;
  const frames = [];
  // Wait for the seek and for the new frame to be painted; some browsers
  // fire 'seeked' before the frame is ready to draw.
  const seek = (t) => new Promise((res) => {
    let n = video.requestVideoFrameCallback ? 2 : 1, timer;
    const one = () => { if (--n === 0) { clearTimeout(timer); res(); } };
    video.addEventListener('seeked', one, { once: true });
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(one);
      timer = setTimeout(() => { n = 1; one(); }, 1500);
    }
    video.currentTime = t;
  });
  const count = Math.floor(duration * rate) + 1;
  for (let i = 0; i < count; i++) {
    await seek(Math.min(duration - 0.01, i / rate));
    frames.push(packFrame(analyze(video)));
    onProgress?.((i + 1) / count);
  }
  return { rate, duration, frames };
}
