"""Recover lightning events from the frames of NASA SVS 5011 (flat, equirectangular version).

Every frame of the NASA animation shows the flashes seen by the ISS Lightning
Imaging Sensor in a 10-day roving window, as yellow dots on a grey map. A dot
that is lit in this frame and was not lit in the previous one is a new event.
Each event is stored as the frame it appeared in and its 1-degree map cell.

  python3 tools/extract_lightning.py path/to/iss_lightning_sos_yearly_07312023_2048p60.mp4 data/lightning.bin

Output (little endian): header JSON length (uint32), header JSON padded to a
multiple of 4 bytes, then frameStart (uint32 x frames+1), frameDay (float32 x
frames+1, days since 1 March 2017 at the start of each frame), then cells
(uint16 x events).
cell = row * 360 + col, row 0 = 90N..89N, col 0 = 180W..179W.
"""
import json, struct, subprocess, sys
import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, H = 2048, 1024
proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}:flags=area',
                         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
rng = np.random.default_rng(5011)
prev = None
starts, cells = [0], []
n = 0
age = np.zeros((H, W), np.uint16)                        # how long each dot has been lit, in frames
runs = []                                                # per frame: lifetimes of the dots that just went out
while True:
    buf = proc.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    a = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lit = (r > 110) & (g > 90) & (r - b > 60)          # yellow, not grey
    new = lit & ~prev if prev is not None else np.zeros_like(lit)
    gone = ~lit & prev if prev is not None else np.zeros_like(lit)
    runs.append(np.bincount(np.minimum(age[gone], 1023), minlength=1024))
    age[lit] += 1; age[~lit] = 0
    prev = lit
    ys, xs = np.nonzero(new)
    c = (ys * 180 // H) * 360 + (xs * 360 // W)
    rng.shuffle(c)                                        # no north-to-south order inside a frame
    cells.append(c.astype(np.uint16))
    starts.append(starts[-1] + len(c))
    n += 1
    if n % 500 == 0:
        print(n, starts[-1], file=sys.stderr)
cells = np.concatenate(cells)

# ---- Which date is each frame? ----
# The animation does not run at a constant speed: it eases in and out. Every dot
# stays lit for one roving window of data (W days), so the usual lifetime of a dot
# in frames, L, gives the local speed: W / L days per frame.
#  1. L every 10 frames, from the mode of the lifetimes of dots going out there.
#     Crowded seasons stretch L, so take the lower envelope and fit a smooth curve.
#  2. Before the first measurable frame the speed follows the number of new dots.
#  3. W comes from the seasons: the northern summer peak must return every 365.25 days.
#  4. The start is 1 March 2017, when the sensor began. Nothing pins the end: by
#     this measure the animation runs to about October 2023, later than the July
#     2023 on NASA's page and close to when the sensor was switched off.
# The result agrees with itself to a few days from year to year. The absolute
# dates may be off by a few weeks.
runs = np.asarray(runs, float)
cnt = np.diff(starts).astype(float)
fs = np.arange(650, n, 10)
L = np.array([30 + np.argmax(np.convolve(runs[max(0, i - 40):i + 40, 30:600].sum(0), np.ones(7) / 7, 'same')) for i in fs], float)
mid = fs - L / 2
env = np.array([np.percentile(L[max(0, i - 20):i + 21], 25) for i in range(len(L))])
v = np.polyval(np.polyfit((mid - 3000) / 3000, 1 / env, 8), (np.arange(n) - 3000) / 3000)   # windows per frame
v = np.clip(v, 1 / 400, None)
f0 = int(mid[0]) + 50
smooth = np.convolve(cnt, np.ones(61) / 61, 'same')
v[:f0] = smooth[:f0] * v[f0:f0 + 100].mean() / smooth[f0:f0 + 100].mean()
Dw = np.concatenate([[0], np.cumsum(v)])

fr = np.repeat(np.arange(n), cnt.astype(int))
north = np.bincount(fr[cells // 360 < 65], minlength=n).astype(float)      # north of 25N
def summer_peaks(W):
    d = Dw[:-1] * W; out = []
    for y in range(1, 6):                                                    # April to October, 2018 to 2022
        m = (d >= 31 + 365.25 * y) & (d < 245 + 365.25 * y)
        out.append((north[m] * d[m]).sum() / north[m].sum())
    return np.array(out)
Wdays = 29.3
for _ in range(5):
    Wdays *= 365.25 / np.diff(summer_peaks(Wdays)).mean()
day = Dw * Wdays
print('window', round(Wdays, 2), 'days; northern summer peak, day of year:',
      [int((d + 59) % 365.25) for d in summer_peaks(Wdays)], '; last day', round(float(day[-1])), file=sys.stderr)
header = json.dumps({'frames': n, 'events': int(len(cells)), 'cols': 360, 'rows': 180,
                     'startDate': '2017-03-01', 'windowDays': round(float(Wdays), 2)}).encode()
with open(out, 'wb') as f:
    header += b' ' * (-len(header) % 4)
    f.write(struct.pack('<I', len(header))); f.write(header)
    f.write(np.asarray(starts, '<u4').tobytes()); f.write(day.astype('<f4').tobytes()); f.write(cells.astype('<u2').tobytes())
print(n, 'frames', len(cells), 'events', file=sys.stderr)
