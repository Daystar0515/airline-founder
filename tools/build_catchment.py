"""v1.2.0 機場腹地人口（服務人口）重新估算：
每個城市（Natural Earth 人口點）的人口，分給 150 公里內提供定期航班的機場；
分配權重＝機場吸引力 × 距離衰減（Huff 模型）。吸引力用真實年旅客量的 0.8 次方
（src-data/traffic_raw.txt），沒有資料的機場依規模給預設值。結果寫到 src-data/catchment.json（千人）。
用法：python tools/build_catchment.py ."""
import json, math, re, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
src = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
rows = json.loads(re.search(r'window\.AIRPORT_ROWS=(\[.*?\]);', src, re.S).group(1))
traffic = {}
for line in open(f'{ROOT}/src-data/traffic_raw.txt', encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#') or '|' not in line: continue
    k, v = line.split('|')[:2]
    try: v = int(v)
    except ValueError: continue
    traffic[k] = max(traffic.get(k, 0), v)
DEF = {0: 4e6, 1: 0.8e6, 2: 0.08e6}
def hav(a, b, c, d):
    R = math.pi / 180
    s = math.sin((c - a) * R / 2) ** 2 + math.cos(a * R) * math.cos(c * R) * math.sin((d - b) * R / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1, s)))
aps = [{'iata': r[0], 'lat': r[5], 'lon': r[6], 'size': r[7], 'pop0': r[10], 'pop': 0.0} for r in rows]
for a in aps: a['att'] = (traffic.get(a['iata']) or DEF[a['size']]) ** 0.8
grid = {}
for i, a in enumerate(aps): grid.setdefault((int(a['lat'] // 2), int(a['lon'] // 2)), []).append(i)
cities = json.load(open(f'{ROOT}/ne/geojson/ne_10m_populated_places_simple.geojson', encoding='utf-8'))['features']
for c in cities:
    p = c['properties']; la, lo, pop = p['latitude'], p['longitude'], p['pop_max'] or 0
    if pop <= 0: continue
    gx, gy = int(la // 2), int(lo // 2)
    near = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for i in grid.get((gx + dx, gy + dy), []):
                d = hav(la, lo, aps[i]['lat'], aps[i]['lon'])
                if d <= 150: near.append((i, aps[i]['att'] * math.exp(-d / 45)))
    tot = sum(w for _, w in near)
    for i, w in near: aps[i]['pop'] += pop * w / tot
FLOOR = {0: 300000, 1: 60000, 2: 10000}
out = {a['iata']: round(max(a['pop'], FLOOR[a['size']]) / 1000) for a in aps}
json.dump(out, open(f'{ROOT}/src-data/catchment.json', 'w'), separators=(',', ':'))
for k in ['TPE', 'TSA', 'KHH', 'RMQ', 'HND', 'NRT', 'KIX', 'ITM', 'UKB', 'HKG', 'SZX', 'ICN', 'GMP', 'LHR', 'LGW', 'STN', 'JFK', 'EWR', 'LGA', 'LHE', 'SIN', 'JHB', 'MZG', 'CJU', 'PVG', 'SHA']:
    a = next((x for x in aps if x['iata'] == k), None)
    if a: print(k, 'old', a['pop0'], 'new', out[k])
print('traffic airports', len(traffic), 'matched', sum(1 for a in aps if a['iata'] in traffic))
