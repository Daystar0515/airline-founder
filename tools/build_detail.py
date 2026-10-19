"""產生放大後使用的高精度向量海岸線與國界（Natural Earth 10m，公有領域），並切成 10°×10° 的格子。

用法：python tools/build_detail.py <ne_10m_land.geojson> <ne_10m_minor_islands.geojson> <ne_10m_admin_0_boundary_lines_land.geojson> <輸出路徑，例如 game/tiles/detail.js（實際寫成 detail-0.js、detail-1.js）>

v0.5.0 起分格、分兩種精度：遊戲只解碼、繪製畫面範圍內的格子，放大時不再一次處理全世界 38 萬個點。
輸出 window.DETAIL = { q, cell, lods: [{ tol, minK, cells: { "x_y": { f: [填色環...], b: [國界...] } } }] }
海岸線不另外存：遊戲描邊時直接用填色環，略過落在格子邊界上的裁切邊。
檔案放在圖磚資料夾（tiles/detail.js），第一次放大時才載入，不拖慢開場。
每條線是以 1/q 度為單位、逐點差分的整數陣列 [x0,y0,dx1,dy1,...]（x=經度，y=緯度）。
"""
import json, sys, math

Q = 2000
CELL = 10
LODS = [(0.012, 0, 0.03), (0.0025, 500, 0.0)]  # (簡化容許誤差（度）, 從多大的縮放開始使用, 略過外框對角線小於幾度的小島)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else math.hypot(px - ax, py - ay)
            if d > best: best, bi = d, i
        if best > eps:
            keep[bi] = True; stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def clip_poly(pts, x0, y0, x1, y1):
    """Sutherland–Hodgman：把多邊形裁到矩形內（填色用，邊界上的重疊邊不影響填色）。"""
    def clip(pts, inside, inter):
        out = []
        if not pts: return out
        prev = pts[-1]
        for cur in pts:
            if inside(cur):
                if not inside(prev): out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
            prev = cur
        return out
    def ix(p, q, x): t = (x - p[0]) / (q[0] - p[0]); return (x, p[1] + t * (q[1] - p[1]))
    def iy(p, q, y): t = (y - p[1]) / (q[1] - p[1]); return (p[0] + t * (q[0] - p[0]), y)
    pts = clip(pts, lambda p: p[0] >= x0, lambda p, q: ix(p, q, x0))
    pts = clip(pts, lambda p: p[0] <= x1, lambda p, q: ix(p, q, x1))
    pts = clip(pts, lambda p: p[1] >= y0, lambda p, q: iy(p, q, y0))
    pts = clip(pts, lambda p: p[1] <= y1, lambda p, q: iy(p, q, y1))
    return pts

def enc(pts):
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(pts):
        qx, qy = round(x * Q), round(y * Q)
        if i and qx == px and qy == py: continue
        out += [qx, qy] if i == 0 else [qx - px, qy - py]
        px, py = qx, qy
    return out

def cell_of(x, y):
    return (min(35, max(0, int((x + 180) // CELL))), min(17, max(0, int((y + 90) // CELL))))

def split_line(pts):
    """把折線依格子切段；跨格的線段兩邊都放，畫起來不會斷。"""
    runs = {}
    cur_key, cur = None, []
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        ka, kb = cell_of(*a), cell_of(*b)
        keys = {ka, kb}
        for k in keys:
            runs.setdefault(k, [])
        for k in keys:
            lst = runs[k]
            if lst and lst[-1][-1] == a: lst[-1].append(b)
            else: lst.append([a, b])
    return runs

def rings(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Polygon': return c
    if t == 'MultiPolygon': return [r for poly in c for r in poly]
    if t == 'LineString': return [c]
    if t == 'MultiLineString': return c
    return []

land = []
for path in sys.argv[1:3]:
    for f in json.load(open(path, encoding='utf-8'))['features']:
        land += [[tuple(p[:2]) for p in r] for r in rings(f['geometry'])]
bnd = []
for f in json.load(open(sys.argv[3], encoding='utf-8'))['features']:
    bnd += [[tuple(p[:2]) for p in r] for r in rings(f['geometry'])]

out = {'q': Q, 'cell': CELL, 'lods': []}
for tol, mink, tiny in LODS:
    cells, npts = {}, 0
    def put(k, kind, arr):
        global npts
        e = cells.setdefault(f'{k[0]}_{k[1]}', {'f': [], 'b': []})
        e[kind].append(enc(arr))
    for r in land:
        s = rdp(r, tol)
        if len(s) < 4: continue
        xs, ys = [p[0] for p in s], [p[1] for p in s]
        if math.hypot(max(xs) - min(xs), max(ys) - min(ys)) < tiny: continue
        c0, c1 = cell_of(min(xs), min(ys)), cell_of(max(xs), max(ys))
        for cx in range(c0[0], c1[0] + 1):
            for cy in range(c0[1], c1[1] + 1):
                x0, y0 = -180 + cx * CELL, -90 + cy * CELL
                cp = s if (c0 == c1) else clip_poly(s[:-1], x0, y0, x0 + CELL, y0 + CELL)
                if len(cp) >= 3: put((cx, cy), 'f', cp); npts += len(cp)
    for r in bnd:
        s = rdp(r, tol)
        if len(s) < 2: continue
        for k, runs in split_line(s).items():
            for run in runs: put(k, 'b', run); npts += len(run)
    out['lods'].append({'tol': tol, 'minK': mink, 'cells': cells})
    print('tol', tol, len(cells), 'cells', npts, 'points')
# 每種精度一個檔案（detail-0.js、detail-1.js），用到才載入
import os
base = os.path.splitext(sys.argv[4])[0]
for i, lod in enumerate(out['lods']):
    with open(f'{base}-{i}.js', 'w', encoding='utf-8') as fo:
        fo.write('// Natural Earth 10m 陸地、小島與陸上國界（公有領域），10°×10° 分格；精度 %g 度\n' % lod['tol'])
        fo.write('(window.DETAIL_LODS = window.DETAIL_LODS || {})[%d] = ' % i + json.dumps({'q': Q, 'cell': CELL, **lod}, separators=(',', ':')) + ';\n')
    print(f'{base}-{i}.js', os.path.getsize(f'{base}-{i}.js'))
