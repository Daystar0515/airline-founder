"""從 OurAirports runways.csv 產生遊戲用跑道線段（放大到機場等級時繪製）。
用法：python tools/build_runways.py <專案資料夾>
輸出 game/data/runways.js：window.RUNWAYS = { ICAO或ident: [[lat1,lon1,lat2,lon2,寬度m,ident], ...] }
只收錄遊戲中的機場、未關閉且兩端座標齊全的跑道；缺兩端座標的跑道不畫。
"""
import csv, json, math, sys, re
ROOT = sys.argv[1]
src = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
i = src.index('AIRPORT_ROWS=') + len('AIRPORT_ROWS=')
rows, _ = json.JSONDecoder().raw_decode(src, i)
idents = {}
for r in rows:
    idents[r[1] or r[0]] = r[0]
ap_pos = {r[0]: (r[5], r[6]) for r in rows}
# 機場 ident 對應（OurAirports airport_ident 多半是 ICAO）
out = {}
n = 0
for r in csv.DictReader(open(f'{ROOT}/src-data/runways.csv', encoding='utf-8')):
    ident = r['airport_ident']
    if ident not in idents or r['closed'] == '1':
        continue
    iata = idents[ident]
    try:
        la1, lo1, la2, lo2 = (float(r[k]) for k in ('le_latitude_deg', 'le_longitude_deg', 'he_latitude_deg', 'he_longitude_deg'))
    except ValueError:
        continue  # 沒有兩端座標的跑道（多半是直升機坪或小型跑道）不畫
    if abs(la1 - la2) + abs(lo1 - lo2) > 0.2:
        continue
    w = float(r['width_ft'] or 150) * 0.3048
    out.setdefault(iata, []).append([round(la1, 5), round(lo1, 5), round(la2, 5), round(lo2, 5), round(w), f"{r['le_ident']}/{r['he_ident']}"])
    n += 1
with open(f'{ROOT}/game/data/runways.js', 'w', encoding='utf-8') as f:
    f.write('window.RUNWAYS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(n, 'runways at', len(out), 'airports')
