"""v0.7.0 真實航空公司：航網資料。
來源：Jonty/airline-route-data（github.com/Jonty/airline-route-data，每週更新，整理自 flightsfrom.com 的公開航線頁面；
該資料沒有授權條款，設計者已知悉並決定使用）。放在 src-data/airline_routes.json。
產生 game/data/carriers.js：
  CARRIERS：[代碼, 英文名, 中文名, 母國, 類型(0 傳統、1 低成本), 樞紐(空格分隔), 航點數]
  CARRIER_ROUTES：{代碼: 'TPEHKG TPENRT …'}（不分方向、只保留遊戲裡有的機場）
用法：python tools/build_carriers.py ."""
import json, sys, collections
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
d = json.load(open(f'{ROOT}/src-data/airline_routes.json', encoding='utf-8'))
s = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
rows = json.JSONDecoder().raw_decode(s[s.index('AIRPORT_ROWS=') + 13:])[0]
AP = {r[0]: r for r in rows}

LCC = set('''IT MM GK IJ ZG BC 7C LJ TW BX ZE RS 4V RF YP 9C AQ 8L PN KN UO TR 3K JQ FD AK D7 Z2 QZ XJ VJ VZ SL DD 5J DG
QG JT IU 6E SG IX QP G9 3O E5 3L FZ XY F3 J9 OV PC VF XQ FR RK AL OE RR U2 EC DS W6 W4 W9 5W VY V7 HV TO DY D8 EW LS
NK F9 G4 WN SY MX XP F8 Y4 VB G3 JA JZ H2 FO DM P5 FA BL VU'''.split())
ZH = {
 'CI': '中華航空', 'BR': '長榮航空', 'JX': '星宇航空', 'IT': '台灣虎航', 'AE': '華信航空', 'B7': '立榮航空',
 'CX': '國泰航空', 'UO': '香港快運', 'HX': '香港航空', 'HB': '大灣區航空', 'NX': '澳門航空',
 'CA': '中國國際航空', 'MU': '中國東方航空', 'CZ': '中國南方航空', 'HU': '海南航空', '3U': '四川航空', 'MF': '廈門航空',
 'FM': '上海航空', 'ZH': '深圳航空', 'SC': '山東航空', '9C': '春秋航空', 'HO': '吉祥航空', 'GS': '天津航空', '8L': '祥鵬航空',
 'JD': '首都航空', 'KN': '中國聯合航空', 'G5': '華夏航空', 'EU': '成都航空', 'KY': '昆明航空', 'PN': '西部航空', 'GJ': '長龍航空',
 'TV': '西藏航空', 'QW': '青島航空', 'DR': '瑞麗航空', 'AQ': '九元航空', 'DZ': '東海航空', 'NS': '河北航空', 'GX': '北部灣航空',
 'RY': '江西航空', 'JR': '幸福航空', 'A6': '紅土航空', '9H': '長安航空', 'UQ': '烏魯木齊航空', 'GY': '多彩貴州航空', 'OQ': '重慶航空',
 'BK': '奧凱航空', 'FU': '福州航空', 'LT': '龍江航空', 'TV': '西藏航空', 'Y8': '金鵬航空',
 'JL': '日本航空', 'NH': '全日空', 'MM': '樂桃航空', 'GK': '捷星日本', 'BC': '天馬航空', '7G': '星悅航空', 'HD': 'AIRDO',
 '6J': '索拉希德航空', 'NU': '日本越洋航空', 'JH': '富士夢幻航空', 'IJ': '春秋航空日本', 'ZG': 'ZIPAIR', 'JC': 'JAC 日本空中通勤', 'FW': 'IBEX 航空',
 'KE': '大韓航空', 'OZ': '韓亞航空', '7C': '濟州航空', 'LJ': '真航空', 'TW': '德威航空', 'BX': '釜山航空', 'ZE': '易斯達航空',
 'RS': '首爾航空', 'YP': '普雷米亞航空', 'RF': 'Aero K', '4V': 'Fly Gangwon',
 'SQ': '新加坡航空', 'TR': '酷航', '3K': '捷星亞洲', 'TG': '泰國航空', 'WE': '泰國微笑航空', 'FD': '泰國亞洲航空', 'SL': '泰國獅子航空',
 'DD': '皇雀航空', 'PG': '曼谷航空', 'VZ': '泰越捷航空', 'XJ': '泰國全亞洲航空', 'VN': '越南航空', 'VJ': '越捷航空', 'QH': '越竹航空',
 'VU': '越旅航空', 'BL': '太平洋航空', 'PR': '菲律賓航空', '5J': '宿霧太平洋航空', 'Z2': '菲律賓亞洲航空', 'DG': 'Cebgo',
 'MH': '馬來西亞航空', 'AK': '亞洲航空', 'D7': '全亞洲航空', 'OD': '馬印航空', 'FY': '飛螢航空', 'GA': '印尼鷹航', 'QG': '連城航空',
 'JT': '獅子航空', 'ID': '巴澤航空', 'QZ': '印尼亞洲航空', 'IU': 'Super Air Jet', 'BI': '汶萊皇家航空', 'QV': '寮國航空',
 '8M': '緬甸國際航空', 'UB': '緬甸國家航空', 'K6': '吳哥航空',
 'AI': '印度航空', '6E': '靛藍航空', 'SG': '香料航空', 'IX': '印度航空快運', 'QP': '阿卡薩航空', 'UL': '斯里蘭卡航空',
 'PK': '巴基斯坦國際航空', 'BG': '孟加拉航空', 'KB': '不丹皇家航空', 'RA': '尼泊爾航空', '8Q': '馬爾地夫航空',
 'EK': '阿聯酋航空', 'EY': '阿提哈德航空', 'QR': '卡達航空', 'SV': '沙烏地阿拉伯航空', 'TK': '土耳其航空', 'PC': '飛馬航空',
 'FZ': '杜拜航空', 'G9': '阿拉伯航空', 'WY': '阿曼航空', 'GF': '海灣航空', 'KU': '科威特航空', 'RJ': '皇家約旦航空',
 'LY': '以色列航空', 'MS': '埃及航空', 'XY': '納斯航空', 'J9': '半島航空', 'ME': '中東航空', 'IR': '伊朗航空', 'VF': 'AJet',
 'BA': '英國航空', 'VS': '維珍航空', 'AF': '法國航空', 'KL': '荷蘭皇家航空', 'LH': '漢莎航空', 'LX': '瑞士國際航空',
 'OS': '奧地利航空', 'SN': '布魯塞爾航空', 'AZ': 'ITA 航空', 'IB': '伊比利亞航空', 'UX': '歐羅巴航空', 'VY': '伏林航空',
 'TP': '葡萄牙航空', 'SK': '北歐航空', 'AY': '芬蘭航空', 'DY': '挪威航空', 'LO': '波蘭航空', 'EI': '愛爾蘭航空',
 'FR': '瑞安航空', 'U2': '易捷航空', 'W6': '威茲航空', 'EW': '歐洲之翼', 'DE': '神鷹航空', 'HV': '泛航航空', 'TO': '泛航法國',
 'A3': '愛琴海航空', 'OU': '克羅埃西亞航空', 'RO': '羅馬尼亞航空', 'BT': '波羅的海航空', 'SU': '俄羅斯航空', 'S7': 'S7 航空',
 'LS': 'Jet2', 'VS': '維珍航空', 'OK': '捷克航空', 'JU': '塞爾維亞航空', 'FI': '冰島航空',
 'AA': '美國航空', 'DL': '達美航空', 'UA': '聯合航空', 'WN': '西南航空', 'B6': '捷藍航空', 'AS': '阿拉斯加航空', 'HA': '夏威夷航空',
 'NK': '精神航空', 'F9': '邊疆航空', 'G4': '忠實航空', 'SY': '太陽鄉航空', 'AC': '加拿大航空', 'WS': '西捷航空', 'PD': '波特航空',
 'TS': '越洋航空', 'F8': 'Flair 航空', 'AM': '墨西哥航空', 'Y4': 'Volaris', 'VB': 'Viva Aerobus', 'CM': '巴拿馬航空',
 'AV': '哥倫比亞航空', 'LA': 'LATAM 航空', 'G3': '高爾航空', 'AD': '藍色航空', 'AR': '阿根廷航空', 'H2': 'SKY 航空', 'JA': 'JetSMART',
 'QF': '澳洲航空', 'JQ': '捷星航空', 'VA': '維珍澳洲航空', 'NZ': '紐西蘭航空', 'FJ': '斐濟航空', 'PX': '紐幾內亞航空',
 'ET': '衣索比亞航空', 'KQ': '肯亞航空', 'SA': '南非航空', 'AT': '摩洛哥皇家航空', 'WB': '盧安達航空',
}
# 母國：優先用 OpenFlights airlines.dat（名稱相符且營運中）的國家，否則用航點最多的國家
cs = open(f'{ROOT}/game/data/airports.js', encoding='utf-8').read()
countries = json.JSONDecoder().raw_decode(cs[cs.index('COUNTRIES=') + 10:])[0]
EN2CC = {v[1].lower(): k for k, v in countries.items()}
EN2CC.update({'united states': 'US', 'south korea': 'KR', 'north korea': 'KP', 'russia': 'RU', 'hong kong': 'HK', 'macau': 'MO', 'czech republic': 'CZ',
  'vietnam': 'VN', 'laos': 'LA', 'burma': 'MM', 'myanmar': 'MM', 'iran': 'IR', 'syria': 'SY', 'ivory coast': 'CI', "cote d'ivoire": 'CI', 'congo (kinshasa)': 'CD',
  'congo (brazzaville)': 'CG', 'tanzania': 'TZ', 'bolivia': 'BO', 'venezuela': 'VE', 'moldova': 'MD', 'macedonia': 'MK', 'brunei': 'BN', 'cape verde': 'CV',
  'united kingdom': 'GB', 'taiwan': 'TW', 'china': 'CN', 'netherlands': 'NL', 'bahamas': 'BS', 'east timor': 'TL', 'micronesia': 'FM', 'swaziland': 'SZ'})
import csv
OFC = {}
for x in csv.reader(open(f'{ROOT}/of/data/airlines.dat', encoding='utf-8')):
    if len(x) < 8 or not x[3] or x[3] in ('\\N', '-', '') or x[7] != 'Y': continue
    OFC.setdefault(x[3], []).append((x[1], x[6]))
def of_home(code, nm):
    w = nm.lower().split()[0] if nm else ''
    for n, c in OFC.get(code, []):
        if w and w in n.lower() and c.lower() in EN2CC: return EN2CC[c.lower()]
    return None
pairs = collections.defaultdict(set)   # code -> set of 'AAABBB'
name = {}
for a, v in d.items():
    for r in v.get('routes', []):
        b = r['iata']
        if a not in AP or b not in AP or a == b: continue
        key = a + b if a < b else b + a
        for c in r['carriers']:
            if not c.get('iata'): continue
            pairs[c['iata']].add(key); name[c['iata']] = c['name']
out = []
for code, ps in pairs.items():
    deg = collections.Counter()
    for k in ps: deg[k[:3]] += 1; deg[k[3:]] += 1
    ccs = collections.Counter()
    for ap, n in deg.items(): ccs[AP[ap][4]] += n
    home = of_home(code, name[code]) or ccs.most_common(1)[0][0]
    # 樞紐：連接航點數最多、而且至少占航線 15%（或前 1 名）
    top = deg.most_common(4)
    hubs = [ap for i, (ap, n) in enumerate(top) if i == 0 or n >= max(4, 0.15 * len(ps))][:3]
    out.append([code, name[code], ZH.get(code, ''), home, 1 if code in LCC else 0, ' '.join(hubs), len(deg)])
out.sort(key=lambda x: -len(pairs[x[0]]))
routes = {c[0]: ' '.join(sorted(pairs[c[0]])) for c in out}
js = ('// v0.7.0 真實航空公司（tools/build_carriers.py 產生）。資料：Jonty/airline-route-data（2026 年，整理自 flightsfrom.com）。\n'
      '// 欄位：代碼, 英文名, 中文名, 母國, 類型(0 傳統、1 低成本), 樞紐, 航點數\n'
      f'window.CARRIERS={json.dumps(out, ensure_ascii=False, separators=(",", ":"))};\n'
      f'window.CARRIER_ROUTES={json.dumps(routes, separators=(",", ":"))};\n')
open(f'{ROOT}/game/data/carriers.js', 'w', encoding='utf-8').write(js)
tot = sum(len(v) for v in pairs.values())
print('carriers', len(out), 'carrier-routes', tot, 'unique pairs', len({k for v in pairs.values() for k in v}), 'bytes', len(js.encode()))
for c in out[:12]: print(c, len(pairs[c[0]]))
for code in ['CI', 'BR', 'JX', 'IT', 'AE', 'B7', 'CX', 'MM']:
    x = next(c for c in out if c[0] == code); print(x, len(pairs[code]))
