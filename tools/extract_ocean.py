"""Read sea surface temperature out of the frames of NASA SVS 3912
(Global Sea Surface Currents and Temperature, flat map version).

The animation draws ocean currents as moving lines on a plain world map
(180W to 180E, 90N to 90S, checked against Natural Earth land). The colour of
each line is the sea surface temperature, on the colour bar NASA publishes with
it: blue is 0 C, green 10 to 20 C, yellow about 25 C, red 32 C. Land is grey.

This takes 96 moments spread evenly through the animation. For each one it
turns the colour of every bright, coloured pixel back into a temperature using
that colour bar, and averages the result into 1-degree cells. Three frames a
few frames apart are pooled so the moving lines cover more of each cell. Small
gaps in the open ocean are filled from the cells next to them. Cells that are
mostly grey are land. Dark polar water with no lines stays empty.

The temperatures are read from the picture's colours, not from the ECCO2 model
output. They are good for where is warm and where is cold, and how that moves
through the year. They are not measurements.

Dates: NASA gives the time range as 2007-03-25 12:00 UTC to 2008-03-03 12:00
UTC. That is 344 days over 2061 frames, which is one frame every four hours,
so the dates here assume the animation runs at a steady speed.

  python3 tools/extract_ocean.py path/to/flat_global_ecco2_2028x1024_comp_p30.mp4 data/ocean.bin

Output (little endian): header JSON length (uint32), header JSON padded to 4
bytes, then one uint8 map of 360 x 180 cells per step. cell = row * 360 + col,
row 0 = 90N..89N, col 0 = 180W..179W. 0 = land or no data. 1 to 255 = cold to
warm, where 1 is 0 C and 255 is 32 C.
"""
import datetime, json, struct, subprocess, sys
import numpy as np

src, out = sys.argv[1], sys.argv[2]
W, H = 2048, 1024
FRAMES, STEPS, POOL = 2061, 96, (0, 3, 6)          # frames in the video, moments to take, frames pooled per moment
START = datetime.datetime(2007, 3, 25, 12)
DAYS = 344.0

# Hue (degrees) against temperature (C), measured along NASA's colour bar (sst_ecco2_cbar.png).
RAMP_HUE = [-5.7, 9.5, 30.1, 46.3, 58.6, 67.1, 81.0, 98.5, 117.4, 129.6, 136.8, 146.9, 161.0, 179.5, 199.5, 215.4, 228.3]
RAMP_TEMP = [32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 0]

steps = [round(k * (FRAMES - 1 - max(POOL)) / (STEPS - 1)) for k in range(STEPS)]
wanted = sorted({f + p for f in steps for p in POOL})
select = '+'.join(f'eq(n\\,{f})' for f in wanted)
proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'select={select}', '-vsync', '0',
                         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)

row = ((np.arange(H) + 0.5) / H * 180).astype(int)
col = ((np.arange(W) + 0.5) / W * 360).astype(int)
idx = (row[:, None].repeat(W, 1), col[None, :].repeat(H, 0))
per_cell = np.zeros((180, 360)); np.add.at(per_cell, idx, 1)

def read_frame():
    buf = proc.stdout.read(W * H * 3)
    a = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    hue = np.where(hue > 300, hue - 360, hue)                 # reds just below 360 sit below 0
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    temp = np.interp(np.clip(hue, RAMP_HUE[0], RAMP_HUE[-1]), RAMP_HUE, RAMP_TEMP)
    weight = np.where((sat > 0.35) & (mx > 0.12), sat * mx, 0)  # coloured lines only
    grey = (sat < 0.2) & (mx > 0.13)                          # land
    weight[900:, :380] = 0; grey[900:, :380] = True           # the colour bar is drawn over Antarctica
    return temp, weight, grey

frames = {}
maps, land_votes = [], np.zeros((180, 360))
for n, f in enumerate(wanted):
    frames[f] = read_frame()
    done = [s for s in steps if s + max(POOL) == f]
    for s in done:
        tsum = np.zeros((180, 360)); wsum = np.zeros((180, 360)); cover = np.zeros((180, 360)); grey = np.zeros((180, 360))
        for p in POOL:
            temp, weight, g = frames[s + p]
            np.add.at(tsum, idx, temp * weight); np.add.at(wsum, idx, weight)
            np.add.at(cover, idx, weight > 0); np.add.at(grey, idx, g)
        land = grey / (per_cell * len(POOL)) > 0.5
        land_votes += land
        valid = (cover / (per_cell * len(POOL)) > 0.06) & ~land
        t = np.where(valid, tsum / np.maximum(wsum, 1e-9), np.nan)
        for _ in range(2):                                    # fill small gaps in open water from neighbours
            pad = np.pad(t, 1, mode='wrap'); pad[0, :] = np.nan; pad[-1, :] = np.nan
            stack = np.stack([pad[1 + dy:181 + dy, 1 + dx:361 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
            count = np.sum(~np.isnan(stack), 0)
            mean = np.nansum(stack, 0) / np.maximum(count, 1)
            t = np.where(np.isnan(t) & ~land & (count >= 3), mean, t)
        maps.append(t)
        date = START + datetime.timedelta(days=DAYS * s / (FRAMES - 1))
        print(len(maps), 'frame', s, date.strftime('%d %b %Y'), 'cells with data', int((~np.isnan(t)).sum()),
              'mean C', round(float(np.nanmean(t)), 2), file=sys.stderr)
    for old in [k for k in frames if k < f - max(POOL)]:
        del frames[old]

maps = np.array(maps)
packed = np.where(np.isnan(maps), 0, np.clip(np.round(1 + maps / 32 * 254), 1, 255)).astype(np.uint8)
labels = [(START + datetime.timedelta(days=DAYS * s / (FRAMES - 1))).strftime('%-d %b %Y') for s in steps]
header = json.dumps({'labels': labels, 'cols': 360, 'rows': 180, 'encoding': 'linear', 'nodata': 0,
                     'what': 'sea surface temperature index, 1 cold to 255 warm', 'coldC': 0, 'warmC': 32,
                     'frames': steps}).encode()
header += b' ' * (-len(header) % 4)
with open(out, 'wb') as fh:
    fh.write(struct.pack('<I', len(header))); fh.write(header); fh.write(packed.tobytes())
print(len(maps), 'steps written', file=sys.stderr)
