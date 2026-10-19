"""產生需求模型的真實數據加成（觀光熱度、商務城市等級、各國商務旅客傾向）。

用法：python tools/build_demand.py <專案資料夾>
輸出 game/data/demand.js：
  window.AFFINITY  兩國之間的觀光熱度倍率（只加成、不減少）與依據的旅客人次
  window.GAWC      國際商務城市等級（GaWC 2024）對應到機場代碼
  window.BIZ_PROP  各國旅客的商務傾向（依日本 JNTO 目的別訪日外客統計）

觀光熱度的算法：把 2024 年兩國之間實際的觀光人次，除以遊戲本身的重力模型對這兩國的預測值
（各國所有大、中型機場「√經濟規模」總和相乘 × 距離係數），再以所有國家組合的中位數為 1 標準化，
取 0.6 次方降低極端值，最後限制在 1.0–3.0 倍。
"""
import json, math, sys, statistics
ROOT = sys.argv[1]
src = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
dec = json.JSONDecoder()
rows, _ = dec.raw_decode(src, src.index('AIRPORT_ROWS=') + len('AIRPORT_ROWS='))
countries, _ = dec.raw_decode(src, src.index('COUNTRIES=') + len('COUNTRIES='))

def wealth(cc):
    g = countries[cc][2] if cc in countries else 6000
    return min(1.9, max(0.12, (g / 15000) ** 0.6))
S = {}
pos = {}
for r in rows:
    iata, icao, name, city, cc, lat, lon, size, rwy, tz, popK, mil = r
    pos[iata] = (lat, lon)
    if size <= 1:
        S[cc] = S.get(cc, 0) + math.sqrt(popK / 1000 * wealth(cc))
def dist(a, b):
    (la1, lo1), (la2, lo2) = pos[a], pos[b]
    R = math.pi / 180
    d = math.sin((la2 - la1) * R / 2) ** 2 + math.cos(la1 * R) * math.cos(la2 * R) * math.sin((lo2 - lo1) * R / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))
def distF(d):
    if d < 150: return 0.04
    if d < 500: return (d / 500) ** 2
    if d <= 3000: return 1
    return (3000 / d) ** 0.55
REP = {'TW': 'TPE', 'JP': 'HND', 'KR': 'ICN', 'CN': 'PVG', 'HK': 'HKG', 'US': 'ORD', 'TH': 'BKK', 'SG': 'SIN', 'VN': 'SGN', 'MY': 'KUL', 'PH': 'MNL', 'ID': 'CGK',
       'IN': 'DEL', 'AU': 'SYD', 'CA': 'YYZ', 'MX': 'MEX', 'GB': 'LHR', 'FR': 'CDG', 'DE': 'FRA', 'IT': 'FCO', 'ES': 'MAD', 'NL': 'AMS', 'BE': 'BRU', 'IE': 'DUB',
       'CH': 'ZRH', 'RU': 'SVO', 'KH': 'KTI', 'PT': 'LIS'}

# 2024 年雙邊旅客人次（百萬，已知方向相加）。來源：JNTO 訪日外客數 2024、台灣觀光署 2024 年報、
# 韓國觀光公社 2024、泰國 2024（Bangkok Post）、越南 2024（TTR Weekly）、新加坡 STB 2024、
# 香港旅遊發展局 2024、西班牙 INE Frontur 2024。陸路為主的組合（港陸、美墨、美加、西葡）不列入。
V = {
    ('JP', 'KR'): (12.04, '韓國→日本 882 萬＋日本→韓國 322 萬'),
    ('JP', 'CN'): (6.98, '中國→日本 698 萬'),
    ('JP', 'TW'): (7.36, '台灣→日本 604 萬＋日本→台灣 132 萬'),
    ('JP', 'HK'): (2.68, '香港→日本 268 萬'),
    ('JP', 'TH'): (1.15, '泰國→日本 115 萬'),
    ('JP', 'SG'): (0.69, '新加坡→日本 69 萬'),
    ('JP', 'MY'): (0.51, '馬來西亞→日本 51 萬'),
    ('JP', 'ID'): (0.52, '印尼→日本 52 萬'),
    ('JP', 'PH'): (0.82, '菲律賓→日本 82 萬'),
    ('JP', 'VN'): (1.33, '越南→日本 62 萬＋日本→越南 71 萬'),
    ('JP', 'IN'): (0.23, '印度→日本 23 萬'),
    ('JP', 'AU'): (0.92, '澳洲→日本 92 萬'),
    ('JP', 'US'): (2.72, '美國→日本 272 萬'),
    ('JP', 'CA'): (0.58, '加拿大→日本 58 萬'),
    ('JP', 'GB'): (0.44, '英國→日本 44 萬'),
    ('JP', 'FR'): (0.39, '法國→日本 39 萬'),
    ('JP', 'DE'): (0.33, '德國→日本 33 萬'),
    ('JP', 'IT'): (0.23, '義大利→日本 23 萬'),
    ('JP', 'ES'): (0.18, '西班牙→日本 18 萬'),
    ('KR', 'CN'): (4.60, '中國→韓國 460 萬'),
    ('KR', 'TW'): (2.47, '台灣→韓國 147 萬＋韓國→台灣 100 萬'),
    ('KR', 'US'): (1.32, '美國→韓國 132 萬'),
    ('KR', 'HK'): (0.57, '香港→韓國 57 萬'),
    ('KR', 'PH'): (0.52, '菲律賓→韓國 52 萬'),
    ('KR', 'VN'): (5.01, '韓國→越南 450 萬＋越南→韓國 51 萬'),
    ('KR', 'SG'): (0.38, '新加坡→韓國 38 萬'),
    ('KR', 'TH'): (2.18, '韓國→泰國 186 萬＋泰國→韓國 32 萬'),
    ('KR', 'MY'): (0.30, '馬來西亞→韓國 30 萬'),
    ('KR', 'AU'): (0.24, '澳洲→韓國 24 萬'),
    ('TW', 'CN'): (2.77, '台灣→中國大陸 277 萬'),
    ('TW', 'VN'): (1.26, '台灣→越南 126 萬'),
    ('TW', 'HK'): (2.40, '台灣→香港 120 萬＋港澳→台灣 131 萬'),
    ('TH', 'CN'): (6.70, '中國→泰國 670 萬'),
    ('TH', 'MY'): (4.93, '馬來西亞→泰國 493 萬'),
    ('TH', 'IN'): (2.12, '印度→泰國 212 萬'),
    ('TH', 'RU'): (1.72, '俄羅斯→泰國 172 萬'),
    ('VN', 'CN'): (3.70, '中國→越南 370 萬'),
    ('VN', 'US'): (0.78, '美國→越南 78 萬'),
    ('VN', 'AU'): (0.49, '澳洲→越南 49 萬'),
    ('VN', 'KH'): (0.48, '柬埔寨→越南 48 萬'),
    ('SG', 'CN'): (3.08, '中國→新加坡 308 萬'),
    ('SG', 'ID'): (2.49, '印尼→新加坡 249 萬'),
    ('SG', 'IN'): (1.20, '印度→新加坡 120 萬'),
    ('HK', 'PH'): (1.20, '菲律賓→香港 120 萬'),
    ('ES', 'GB'): (18.40, '英國→西班牙 1,840 萬'),
    ('ES', 'FR'): (12.98, '法國→西班牙 1,298 萬'),
    ('ES', 'DE'): (11.94, '德國→西班牙 1,194 萬'),
    ('ES', 'IT'): (5.44, '義大利→西班牙 544 萬'),
    ('ES', 'NL'): (4.78, '荷蘭→西班牙 478 萬'),
    ('ES', 'US'): (4.26, '美國→西班牙 426 萬'),
    ('ES', 'BE'): (3.06, '比利時→西班牙 306 萬'),
    ('ES', 'IE'): (2.77, '愛爾蘭→西班牙 277 萬'),
    ('ES', 'CH'): (2.12, '瑞士→西班牙 212 萬'),
}
# 陸路或渡輪為主的組合不列入（越柬、泰馬、新印尼、西法）
LAND = {('VN', 'KH'), ('TH', 'MY'), ('SG', 'ID'), ('ES', 'FR')}
# 1) 觀光熱度（旅客量加成）：實際人次 ÷ 遊戲重力模型的預測值，取對數後對距離做迴歸，
#    扣掉「模型距離衰減太弱」的系統性偏差，剩下的殘差才算這對國家特別熱門。只加成、不扣減。
pts = []
for (a, b), (v, note) in V.items():
    if (a, b) in LAND: continue
    d = dist(REP[a], REP[b])
    pts.append((a, b, d, v, note, math.log(v / (S[a] * S[b] * distF(d)))))
n = len(pts); mx = sum(math.log(p[2]) for p in pts) / n; my = sum(p[5] for p in pts) / n
slope = sum((math.log(p[2]) - mx) * (p[5] - my) for p in pts) / sum((math.log(p[2]) - mx) ** 2 for p in pts)
icpt = my - slope * mx
print('distance slope', round(slope, 2))
aff = {}
for a, b, d, v, note, y in pts:
    resid = y - (icpt + slope * math.log(d))
    m = max(1.0, min(3.0, math.exp(resid) ** 0.6))
    aff['|'.join(sorted([a, b]))] = {'m': round(m, 2), 'v': v, 'note': note}
# 2) 嚮往度（降低觀光客的價格敏感度）：某國出國旅客中，有多少比例選擇這個目的地。
#    只有台灣、韓國、日本有完整的出國總數與目的地資料（台灣觀光署、韓國觀光公社、JNTO，2024）。
OUT = {'TW': (16.85, '台灣 2024 出國 1,685 萬人次'), 'KR': (28.69, '韓國 2024 出國 2,869 萬人次'), 'JP': (13.01, '日本 2024 出國 1,301 萬人次')}
DIR = {('TW', 'JP'): 6.006, ('TW', 'CN'): 2.770, ('TW', 'KR'): 1.429, ('TW', 'VN'): 1.263, ('TW', 'HK'): 1.204,
       ('KR', 'JP'): 8.818, ('KR', 'VN'): 4.5, ('KR', 'TH'): 1.86, ('KR', 'TW'): 1.00,
       ('JP', 'KR'): 3.224, ('JP', 'TW'): 1.320, ('JP', 'VN'): 0.711}
for (a, b), v in DIR.items():
    key = '|'.join(sorted([a, b]))
    share = v / OUT[a][0]
    e = aff.setdefault(key, {'m': 1.0, 'v': v, 'note': ''})
    if share > e.get('pref', 0):
        e['pref'] = round(share, 3)
        ZH = {'JP': '日本', 'KR': '韓國', 'TW': '台灣', 'CN': '中國大陸', 'VN': '越南', 'HK': '香港', 'TH': '泰國'}
        e['prefNote'] = f"{ZH[a]}出國旅客有 {share * 100:.0f}% 去{ZH[b]}"
for k, e in sorted(aff.items(), key=lambda kv: -kv[1]['m']):
    print(f"{k:6} x{e['m']:.2f} pref {e.get('pref', 0):.3f}  {e['note']}")

# GaWC 2024 世界城市等級 → 機場（同一城市的主要機場都算）
GAWC = {
    4: {'London': 'LHR LGW LCY STN LTN', 'New York': 'JFK LGA EWR'},
    3: {'Hong Kong': 'HKG', 'Beijing': 'PEK PKX', 'Singapore': 'SIN', 'Shanghai': 'PVG SHA', 'Paris': 'CDG ORY', 'Dubai': 'DXB DWC', 'Tokyo': 'HND NRT', 'Sydney': 'SYD'},
    2: {'Seoul': 'ICN GMP', 'Milan': 'MXP LIN', 'Toronto': 'YYZ YTZ', 'Frankfurt': 'FRA', 'Chicago': 'ORD MDW', 'Jakarta': 'CGK HLP', 'Sao Paulo': 'GRU CGH', 'Mexico City': 'MEX NLU',
        'Mumbai': 'BOM', 'Madrid': 'MAD', 'Warsaw': 'WAW', 'Guangzhou': 'CAN', 'Istanbul': 'IST SAW', 'Amsterdam': 'AMS', 'Bangkok': 'BKK DMK', 'Los Angeles': 'LAX', 'Kuala Lumpur': 'KUL SZB'},
    1.5: {'Luxembourg': 'LUX', 'Taipei': 'TPE TSA', 'Shenzhen': 'SZX', 'Brussels': 'BRU', 'Zurich': 'ZRH', 'Buenos Aires': 'EZE AEP', 'Melbourne': 'MEL', 'San Francisco': 'SFO',
          'Riyadh': 'RUH', 'Santiago': 'SCL', 'Dusseldorf': 'DUS', 'Stockholm': 'ARN BMA', 'Washington DC': 'IAD DCA', 'Vienna': 'VIE', 'Lisbon': 'LIS', 'Munich': 'MUC', 'Dublin': 'DUB',
          'Houston': 'IAH HOU', 'Berlin': 'BER', 'Johannesburg': 'JNB', 'Boston': 'BOS', 'New Delhi': 'DEL'},
    1: {'Bogota': 'BOG', 'Ho Chi Minh City': 'SGN', 'Rome': 'FCO CIA', 'Bangalore': 'BLR', 'Budapest': 'BUD', 'Athens': 'ATH', 'Hamburg': 'HAM', 'Doha': 'DOH', 'Chengdu': 'CTU TFU',
        'Miami': 'MIA', 'Tianjin': 'TSN', 'Dallas': 'DFW DAL', 'Atlanta': 'ATL', 'Auckland': 'AKL', 'Barcelona': 'BCN', 'Hangzhou': 'HGH', 'Bucharest': 'OTP', 'Lima': 'LIM',
        'Montreal': 'YUL', 'Prague': 'PRG'},
}
TIER_NAME = {4: 'Alpha++', 3: 'Alpha+', 2: 'Alpha', 1.5: 'Alpha−', 1: 'Beta+'}
gawc = {}
for t, cities in GAWC.items():
    for city, codes in cities.items():
        for c in codes.split():
            if c in pos: gawc[c] = [t, TIER_NAME[t], city]
# 各國旅客的商務傾向：JNTO 2024 年 11 月目的別訪日外客數中「商用客」占（觀光客＋商用客）的比例，
# 除以全體平均 4.2% 得到倍率，限制在 0.4–2.5
JNTO_BIZ = {'KR': (16794, 719677), 'CN': (30051, 479460), 'TW': (9326, 473451), 'HK': (2262, 223221), 'US': (12235, 231708), 'TH': (2645, 113394),
            'SG': (2445, 93005), 'GB': (3295, 31742), 'DE': (3499, 20646), 'IN': (5766, 14329), 'AU': (2430, 75665)}
avg = 127781 / (127781 + 2922383)
biz = {cc: round(max(0.4, min(2.5, (b / (b + t)) / avg)), 2) for cc, (b, t) in JNTO_BIZ.items()}
print('biz', biz)
with open(f'{ROOT}/game/data/demand.js', 'w', encoding='utf-8') as f:
    f.write('// 需求模型的真實數據加成，由 tools/build_demand.py 產生。來源見該檔與規格書。\n')
    f.write('window.AFFINITY=' + json.dumps(aff, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.GAWC=' + json.dumps(gawc, ensure_ascii=False, separators=(',', ':')) + ';\n')
    f.write('window.BIZ_PROP=' + json.dumps(biz, separators=(',', ':')) + ';\n')
print(len(aff), 'pairs', len(gawc), 'gawc airports')
