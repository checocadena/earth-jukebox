"""Read the yearly night lights maps out of NASA SVS 5313 (EIC version).

The animation is two copies of a flat world map side by side. It steps through
annual averages for 2012 to 2023, about 17.5 frames per year. This takes one
frame from the middle of each year, keeps only the lights (small bright points standing
out from the land around them, in places where some of them are warm yellow), and sums them into 1-degree cells.

  python3 tools/extract_nightlights.py path/to/nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4 data/nightlights.bin

Output (little endian): header JSON length (uint32), header JSON padded to 4
bytes, then one uint8 map of 360 x 180 cells per year. cell = row * 360 + col,
row 0 = 90N..89N, col 0 = 180W..179W. Value = 255 * sqrt(light / max light).
"""
import json, struct, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
YEARS = list(range(2012, 2024))
FRAMES = [3, 18, 36, 53, 71, 88, 106, 123, 141, 158, 176, 215]   # middle of each year
W, H = 3840, 2160            # one copy of the map
LEFT_EDGE_LON = -168.5       # the map does not start at 180W (measured against Natural Earth)

maps, warms = [], []
for year, f in zip(YEARS, FRAMES):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'select=eq(n\\,{f}),crop={W}:{H}:0:0',
                          '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    rgb = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.int16)
    im = Image.fromarray(rgb.max(-1).astype(np.uint8))
    # the land and sea behind the lights: a grey opening (darkest, then brightest, in a 21 px window)
    back = im.filter(ImageFilter.MinFilter(21)).filter(ImageFilter.MaxFilter(21))
    light = np.clip(np.asarray(im, float) - np.asarray(back, float) - 6, 0, None)
    warm = light * ((rgb[..., 0] - rgb[..., 2]) >= 25)   # lights are drawn warm yellow; snow and rock are grey
    lon = (LEFT_EDGE_LON + (np.arange(W) + 0.5) / W * 360 + 180) % 360        # 0..360 from 180W
    col = lon.astype(int) % 360
    row = ((np.arange(H) + 0.5) / H * 180).astype(int)
    grid = np.zeros((180, 360)); wgrid = np.zeros((180, 360))
    idx = (row[:, None].repeat(W, 1), col[None, :].repeat(H, 0))
    np.add.at(grid, idx, light); np.add.at(wgrid, idx, warm)
    maps.append(grid); warms.append(wgrid)
    print(year, 'frame', f, 'total light', int(grid.sum()), file=sys.stderr)

maps = np.array(maps)
# A cell with no warm light in any year holds only terrain that happened to stand out: clear it.
maps[:, np.array(warms).max(0) == 0] = 0
# Snow and ice edges also stand out from their surroundings. Nobody lives there: clear them.
maps[:, :90 - 68, :] = 0      # north of 68N
maps[:, 90 + 56:, :] = 0      # south of 56S
peak = np.percentile(maps[maps > 0], 99.9)
packed = np.round(255 * np.sqrt(np.clip(maps / peak, 0, 1))).astype(np.uint8)
header = json.dumps({'years': YEARS, 'cols': 360, 'rows': 180, 'encoding': 'sqrt'}).encode()
header += b' ' * (-len(header) % 4)
with open(out, 'wb') as fh:
    fh.write(struct.pack('<I', len(header))); fh.write(header); fh.write(packed.tobytes())
