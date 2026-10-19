"""把公開資料轉成遊戲用的精簡資料檔。
來源：OurAirports（機場、跑道）、OpenFlights（時區）、Natural Earth（國界、城市人口、各國 GDP 與中文名）。"""
import csv, json, math, sys, re
ROOT = sys.argv[1]
OUT = sys.argv[2]

def hav(a1, o1, a2, o2):
    r = math.radians
    d = math.sin(r(a2-a1)/2)**2 + math.cos(r(a1))*math.cos(r(a2))*math.sin(r(o2-o1)/2)**2
    return 6371*2*math.asin(math.sqrt(d))

# ---- 國家：中文名、人均 GDP ----
ctry = {}
for f in json.load(open(f'{ROOT}/ne/geojson/ne_50m_admin_0_countries.geojson', encoding='utf-8'))['features']:
    p = f['properties']
    iso = p['ISO_A2_EH'] if p['ISO_A2_EH'] != '-99' else p['ISO_A2']
    if iso in ('-99', None): continue
    gdppc = (p['GDP_MD']*1e6/p['POP_EST']) if p['POP_EST'] else 5000
    if iso not in ctry or p['POP_EST'] > ctry[iso]['pop']:
        ctry[iso] = {'zh': p['NAME_ZHT'] or p['NAME'], 'en': p['NAME'], 'gdppc': round(gdppc), 'pop': p['POP_EST']}

# ---- 時區 ----
tz = {}
for row in csv.reader(open(f'{ROOT}/of/data/airports.dat', encoding='utf-8')):
    if row[4] and row[4] != '\\N' and row[11] not in ('\\N', ''): tz[row[4]] = row[11]

# ---- 跑道 ----
rwy = {}
for r in csv.DictReader(open(f'{ROOT}/src-data/runways.csv', encoding='utf-8')):
    if r['closed'] == '1' or not r['length_ft']: continue
    m = int(float(r['length_ft'])*0.3048)
    rwy[r['airport_ident']] = max(rwy.get(r['airport_ident'], 0), m)

MIL = re.compile(r'Air Base|Air Force|Base A[eé]rea|Military|Naval Air|Air Station|\bAB\b|Airbase|Base Aérienne', re.I)
SIZE = {'large_airport': 0, 'medium_airport': 1, 'small_airport': 2}
aps = []
for r in csv.DictReader(open(f'{ROOT}/src-data/airports.csv', encoding='utf-8')):
    if r['scheduled_service'] != 'yes' or r['type'] not in SIZE or not r['iata_code']: continue
    aps.append({'iata': r['iata_code'], 'icao': r['icao_code'] or r['ident'], 'name': r['name'],
        'city': r['municipality'] or r['name'], 'cc': r['iso_country'],
        'lat': float(r['latitude_deg']), 'lon': float(r['longitude_deg']), 'size': SIZE[r['type']],
        'rwy': rwy.get(r['ident'], 0), 'tz': tz.get(r['iata_code'], ''),
        'mil': 1 if MIL.search(r['name']) else 0, 'pop': 0.0})

# ---- 腹地人口：把每個城市的人口分配給 150 公里內的機場 ----
W = {0: 6, 1: 2, 2: 0.6}
grid = {}
for i, a in enumerate(aps): grid.setdefault((int(a['lat']//2), int(a['lon']//2)), []).append(i)
cities = json.load(open(f'{ROOT}/ne/geojson/ne_10m_populated_places_simple.geojson', encoding='utf-8'))['features']
for c in cities:
    p = c['properties']; la, lo, pop = p['latitude'], p['longitude'], p['pop_max'] or 0
    if pop <= 0: continue
    gx, gy = int(la//2), int(lo//2)
    near = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for i in grid.get((gx+dx, gy+dy), []):
                d = hav(la, lo, aps[i]['lat'], aps[i]['lon'])
                if d <= 120: near.append((i, W[aps[i]["size"]]*math.exp(-d/40)))
    tot = sum(w for _, w in near)
    for i, w in near: aps[i]['pop'] += pop*w/tot
FLOOR = {0: 400000, 1: 80000, 2: 15000}
rows = []
for a in aps:
    a['pop'] = max(a['pop'], FLOOR[a['size']])
    rows.append([a['iata'], a['icao'], a['name'], a['city'], a['cc'], round(a['lat'], 4), round(a['lon'], 4),
                 a['size'], a['rwy'], a['tz'], round(a['pop']/1000), a['mil']])
rows.sort(key=lambda r: (r[7], -r[10]))
countries = {k: [v['zh'], v['en'], v['gdppc']] for k, v in ctry.items()}

# ---- 世界地圖（陸地多邊形，降低精度）----
def simp(ring, tol=0.12):
    out = [ring[0]]
    for pt in ring[1:]:
        if abs(pt[0]-out[-1][0]) + abs(pt[1]-out[-1][1]) >= tol: out.append(pt)
    return [[round(x, 2), round(y, 2)] for x, y in out] if len(out) >= 4 else None
polys = []
for f in json.load(open(f'{ROOT}/ne/geojson/ne_50m_admin_0_countries.geojson', encoding='utf-8'))['features']:
    g = f['geometry']
    parts = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in parts:
        s = simp(poly[0])
        if s: polys.append(s)

with open(f'{OUT}/airports.js', 'w', encoding='utf-8') as fh:
    fh.write('// 來源：OurAirports（公有領域）、OpenFlights、Natural Earth。欄位：IATA, ICAO, 名稱, 城市, 國碼, 緯度, 經度, 規模(0大1中2小), 最長跑道(m), 時區, 腹地人口(千人), 軍民合用\n')
    fh.write('window.AIRPORT_ROWS=' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
    fh.write('window.COUNTRIES=' + json.dumps(countries, ensure_ascii=False, separators=(',', ':')) + ';\n')
with open(f'{OUT}/world.js', 'w', encoding='utf-8') as fh:
    fh.write('// Natural Earth 1:50m 國界（公有領域），已簡化\nwindow.WORLD_POLYS=' + json.dumps(polys, separators=(',', ':')) + ';\n')
print('airports', len(rows), 'with tz', sum(1 for r in rows if r[9]), 'mil', sum(r[11] for r in rows), 'polys', len(polys))
for r in rows:
    if r[0] in ('TPE', 'TSA', 'KHH', 'RMQ', 'HKG', 'LAX', 'LHR', 'NRT', 'KNH', 'MZG'): print(r)
