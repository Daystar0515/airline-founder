"""把等距圓柱投影（equirectangular）的全球影像，轉成遊戲使用的米勒投影圖磚。

用法：python tools/build_tiles.py <來源影像> <輸出資料夾，例如 game/tiles> [圖磚邊長，預設 1024]

來源影像寬高比必須是 2:1。v0.4.2 起內建 Natural Earth I（21600×10800，公有領域，
含地形陰影、地表覆蓋與海底地形），共切 5 層，最清楚的一層世界寬 16384 像素，
是 v0.3.1 Blue Marble 4096 版的 4 倍。程式逐層處理，記憶體需求約 2 GB。
"""
import sys, math, os, json
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC, OUT = sys.argv[1], sys.argv[2]
TILE = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
BASE = 1024  # 第 0 層的世界寬度（像素）
LAT_MAX = 85.0
R = math.pi / 180

def miller_y(lat):
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * lat * R)) / R

def inv_miller(y):
    return (math.atan(math.exp(y * R / 1.25)) - math.pi / 4) / 0.4 / R

Y_MAX = miller_y(LAT_MAX)
srcimg = Image.open(SRC).convert('RGB')
sw, sh = srcimg.size
levels = max(0, int(math.log2(sw / BASE)))
meta = {'tile': TILE, 'base': BASE, 'yMax': Y_MAX, 'levels': levels + 1, 'source': os.path.basename(SRC), 'size': [sw, sh]}
for L in range(levels + 1):
    W = BASE * 2 ** L
    H = int(round(W * (2 * Y_MAX) / 360))
    # 先把高度縮到最接近的需要量（垂直方向取樣仍以緯度反投影）
    hh = min(sh, max(H * 2, 512))
    a = np.asarray(srcimg.resize((W, hh), Image.LANCZOS), dtype=np.uint8)
    ys = Y_MAX - (np.arange(H) + 0.5) * (2 * Y_MAX / H)
    lats = np.array([inv_miller(y) for y in ys])
    rows = (90 - lats) / 180 * hh - 0.5
    r0 = np.clip(np.floor(rows).astype(int), 0, hh - 1)
    r1 = np.clip(r0 + 1, 0, hh - 1)
    tt = (rows - np.floor(rows)).astype(np.float32)
    out = np.empty((H, W, 3), dtype=np.uint8)
    for s in range(0, H, 512):  # 分段計算，避免一次占用太多記憶體
        e = min(H, s + 512)
        t = tt[s:e, None, None]
        out[s:e] = np.clip(a[r0[s:e]].astype(np.float32) * (1 - t) + a[r1[s:e]].astype(np.float32) * t + 0.5, 0, 255).astype(np.uint8)
    del a
    full = Image.fromarray(out)
    nx, ny = math.ceil(W / TILE), math.ceil(H / TILE)
    os.makedirs(f'{OUT}/{L}', exist_ok=True)
    for ty in range(ny):
        for tx in range(nx):
            tile = full.crop((tx * TILE, ty * TILE, min(W, (tx + 1) * TILE), min(H, (ty + 1) * TILE)))
            tile.save(f'{OUT}/{L}/{tx}_{ty}.jpg', quality=82, optimize=True, progressive=True)
    meta[f'l{L}'] = {'w': W, 'h': H, 'nx': nx, 'ny': ny}
    print('level', L, W, 'x', H, nx * ny, 'tiles', flush=True)
    del out, full
with open(f'{OUT}/meta.js', 'w') as f:
    f.write('window.TILE_META=' + json.dumps(meta) + ';\n')
print(json.dumps(meta))
