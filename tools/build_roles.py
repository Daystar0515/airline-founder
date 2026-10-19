"""v0.6.3 機場類型：國際機場／國內線機場／限定國際機場。
資料：v0.7.0 起優先用 src-data/airline_routes.json（2026 年航線）；沒有時用 OpenFlights routes.dat（2014 年 6 月）。
規則：
  1. 有國際航線（起訖國家不同；台灣、香港、澳門、中國大陸各自算一個地區）的機場是國際機場。
  2. 其中「同國 50 公里內有國際航點至少 3 倍多的國際機場」，而且自己的國際航點不超過 15 個、5 個國家地區的，
     是限定國際機場（例如松山之於桃園、金浦之於仁川、虹橋之於浦東）；國際線只能飛它真實有過的國際航點。
  3. 有航線但沒有國際航線的是國內線機場；名稱含 International（設有海關）的除外，當國際機場。大阪伊丹手動指定為國內線。
  4. 資料裡沒有航線的機場：OurAirports 列為大型機場或名稱含 International 的當國際機場，其餘當國內線機場。
  5. OVERRIDE 可手動指定個別機場。
用法：python tools/build_roles.py .  → 產生 game/data/roles.js"""
import csv, json, math, sys, collections
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
s = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
a0 = s.index('AIRPORT_ROWS=') + 13
rows = json.JSONDecoder().raw_decode(s[a0:])[0]
AP = {r[0]: r for r in rows}
cc = {r[0]: r[4] for r in rows}

def hav(a, b):
    r = math.radians; A, B = AP[a], AP[b]
    d = math.sin(r(B[5]-A[5])/2)**2 + math.cos(r(A[5]))*math.cos(r(B[5]))*math.sin(r(B[6]-A[6])/2)**2
    return 6371*2*math.asin(math.sqrt(d))

intl = collections.defaultdict(set); anyr = collections.defaultdict(set)
import os
SRC = '2026 年 Jonty/airline-route-data' if os.path.exists(f'{ROOT}/src-data/airline_routes.json') else 'OpenFlights 2014'
def add(a, b):
    if a not in cc or b not in cc or a == b: return
    for p, q in ((a, b), (b, a)):
        anyr[p].add(q)
        if cc[p] != cc[q]: intl[p].add(q)
if SRC.startswith('2026'):
    for a, v in json.load(open(f'{ROOT}/src-data/airline_routes.json', encoding='utf-8')).items():
        for r in v.get('routes', []): add(a, r['iata'])
else:
    for x in csv.reader(open(f'{ROOT}/of/data/routes.dat', encoding='utf-8')):
        if x[7] in ('0', ''): add(x[2], x[4])  # 只算直飛

# 手動指定：0 國際、1 國內線、2 限定國際（可附上允許的國際航點）
OVERRIDE = {
    'ITM': (1, None),   # 大阪伊丹：只飛國內線
    'KNH': (1, None), 'MZG': (1, None), 'TTT': (1, None), 'LZN': (1, None), 'MFK': (1, None),  # 台灣離島與東部（定期國際線以桃園、松山、台中、高雄、台南為主）
}
role, allow = {}, {}
for i, r in enumerate(rows):
    k = r[0]
    if k in OVERRIDE:
        role[k] = OVERRIDE[k][0]
        if OVERRIDE[k][1]: allow[k] = OVERRIDE[k][1]
        continue
    if not anyr.get(k):
        role[k] = 0 if (r[7] == 0 or 'International' in r[2]) else 1
        continue
    if not intl.get(k): role[k] = 0 if 'International' in r[2] else 1; continue  # 2014 年只有國內線、但名稱含 International（設有海關，之後多半開了國際線）
    n = len(intl[k]); ncc = len({cc[q] for q in intl[k]})
    big = [q for q in AP if q != k and cc[q] == cc[k] and len(intl.get(q, ())) >= 3 * n and hav(k, q) <= 50]
    if big and n <= 15 and ncc <= 5:
        role[k] = 2; allow[k] = sorted(intl[k])
    else:
        role[k] = 0
cnt = collections.Counter(role.values())
out = {k: v for k, v in role.items() if v}
open(f'{ROOT}/game/data/roles.js', 'w', encoding='utf-8').write(
    f'// v0.6.3 機場類型（tools/build_roles.py 產生）。資料：{SRC}。\n'
    '// AP_ROLE：1 國內線機場、2 限定國際機場（沒列出的是國際機場）；AP_ALLOW：限定國際機場可飛的國際航點。\n'
    f'window.AP_ROLE={json.dumps(out, separators=(",", ":"))};\nwindow.AP_ALLOW={json.dumps(allow, separators=(",", ":"))};\n')
print('國際', cnt[0], '國內線', cnt[1], '限定國際', cnt[2])
print('限定國際：', ' '.join(f'{k}({len(v)})' for k, v in sorted(allow.items())))
