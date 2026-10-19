"""v0.7.0 封閉空域：把需要繞飛的國家領空做成 1°×1° 的格點地圖（game/data/airspace.js）。
資料：Natural Earth 50m 國界（公有領域）。哪些國家要繞飛見 game/js/paths.js 的 AIRSPACE 說明。
用法：python tools/build_airspace.py ."""
import json, sys, base64
import numpy as np
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
SETS = {
    'all': ['UA', 'KP', 'SY', 'LY', 'YE'],   # 幾乎所有民航機都避開
    'ru': ['RU', 'BY'],                      # 對制裁國家的航空公司關閉（或自主避飛）
}
feats = json.load(open(f'{ROOT}/ne/geojson/ne_50m_admin_0_countries.geojson', encoding='utf-8'))['features']
def iso(p):
    v = p.get('ISO_A2_EH') if p.get('ISO_A2_EH') not in (None, '-99') else p.get('ISO_A2')
    return v
SUB = 4  # 每 1° 格取 4×4 個取樣點
lon = (np.arange(360 * SUB) + 0.5) / SUB - 180
lat = 90 - (np.arange(180 * SUB) + 0.5) / SUB
LON, LAT = np.meshgrid(lon, lat)
def rings(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates'][0]]
    return [poly[0] for poly in geom['coordinates']]
def pip(ring, X, Y):
    r = np.array(ring); x0, y0 = r[:-1, 0], r[:-1, 1]; x1, y1 = r[1:, 0], r[1:, 1]
    inside = np.zeros(X.shape, bool)
    for a, b, c, d in zip(x0, y0, x1, y1):
        if b == d: continue
        cond = ((b > Y) != (d > Y))
        if not cond.any(): continue
        xi = a + (Y - b) * (c - a) / (d - b)
        inside ^= cond & (X < xi)
    return inside
out = {}
for name, ccs in SETS.items():
    m = np.zeros(LON.shape, bool)
    for f in feats:
        if iso(f['properties']) not in ccs: continue
        for ring in rings(f['geometry']):
            r = np.array(ring)
            x0, x1, y0, y1 = r[:, 0].min(), r[:, 0].max(), r[:, 1].min(), r[:, 1].max()
            jx = np.where((lon >= x0) & (lon <= x1))[0]; iy = np.where((lat >= y0) & (lat <= y1))[0]
            if not len(jx) or not len(iy): continue
            sl = (slice(iy[0], iy[-1] + 1), slice(jx[0], jx[-1] + 1))
            m[sl] |= pip(ring, LON[sl], LAT[sl])
    cell = m.reshape(180, SUB, 360, SUB).any(axis=(1, 3))  # 1° 格：只要有取樣點在領空內就算
    bits = np.packbits(cell.astype(np.uint8).ravel())
    out[name] = base64.b64encode(bits.tobytes()).decode()
    print(name, ccs, 'cells', int(cell.sum()))
js = ('// v0.7.0 封閉空域格點（tools/build_airspace.py 產生）。資料：Natural Earth 50m 國界。\n'
      '// 360×180 的 1° 格，第 0 列是北緯 89–90°、第 0 欄是西經 180–179°；base64 編碼的位元圖。\n'
      f'window.AIRSPACE_MASKS={json.dumps(out)};\n')
open(f'{ROOT}/game/data/airspace.js', 'w', encoding='utf-8').write(js)
print('bytes', len(js))
