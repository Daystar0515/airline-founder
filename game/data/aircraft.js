// 機型資料：依各製造商公開規格整理的近似值，價格為公開目錄價或市場估計（百萬美元）。
// units：全經濟艙標準座椅可容納的「座位單位」；maxSeats：逃生出口認證上限。
// rwy：滿載起飛所需跑道（公尺，近似）；fuel：巡航每小時油耗（公斤，近似）。
// used:true 表示已停產，只能從二手市場取得。
// only：只能在這些國家（ISO 代碼）境內飛行。可起降的機場等級見 rules3.js 的 G.acClass（v0.6.2）。
window.AIRCRAFT = [
  // ---- ATR ----
  { id: 'AT45', mfr: 'ATR', model: 'ATR 42-600', body: 'turboprop', wide: false, maxSeats: 50, units: 48, range: 1326, speed: 556, rwy: 1165, price: 20, fuel: 450 },
  { id: 'AT76', mfr: 'ATR', model: 'ATR 72-600', body: 'turboprop', wide: false, maxSeats: 78, units: 72, range: 1528, speed: 510, rwy: 1333, price: 26, fuel: 650 },
  // ---- 龐巴迪（含原龐巴迪設計）----
  { id: 'DH8D', mfr: 'Bombardier', model: 'Dash 8-400（原 Q400，現由德哈維蘭加拿大生產）', body: 'turboprop', wide: false, maxSeats: 90, units: 78, range: 2040, speed: 667, rwy: 1425, price: 32, fuel: 950 },
  { id: 'CRJ7', mfr: 'Bombardier', model: 'CRJ700', body: 'regional', wide: false, maxSeats: 78, units: 70, range: 2656, speed: 829, rwy: 1564, price: 18, fuel: 1450, used: true },
  { id: 'CRJ9', mfr: 'Bombardier', model: 'CRJ900', body: 'regional', wide: false, maxSeats: 90, units: 86, range: 2956, speed: 829, rwy: 1778, price: 22, fuel: 1600, used: true },
  { id: 'CRJX', mfr: 'Bombardier', model: 'CRJ1000', body: 'regional', wide: false, maxSeats: 104, units: 98, range: 3004, speed: 829, rwy: 1996, price: 24, fuel: 1750, used: true },
  // ---- 巴西航空工業 ----
  { id: 'E175', mfr: 'Embraer', model: 'E175', body: 'regional', wide: false, maxSeats: 88, units: 80, range: 3700, speed: 829, rwy: 2244, price: 50, fuel: 1650 },
  { id: 'E290', mfr: 'Embraer', model: 'E190-E2', body: 'regional', wide: false, maxSeats: 114, units: 104, range: 5278, speed: 870, rwy: 1450, price: 60, fuel: 1800 },
  { id: 'E295', mfr: 'Embraer', model: 'E195-E2', body: 'regional', wide: false, maxSeats: 146, units: 132, range: 4815, speed: 870, rwy: 1970, price: 68, fuel: 2050 },
  // ---- 中國商飛 ----
  { id: 'AJ27', mfr: 'COMAC', model: 'C909（ARJ21-700）', body: 'regional', wide: false, maxSeats: 95, units: 90, range: 3700, speed: 828, rwy: 1700, price: 38, fuel: 1800, only: ['CN'], onlyNote: '只取得中國民航局（CAAC）型號認證，只能飛中國大陸境內航線' },
  { id: 'C919', mfr: 'COMAC', model: 'C919', body: 'narrow', wide: false, maxSeats: 192, units: 168, range: 4075, speed: 834, rwy: 2000, price: 99, fuel: 2400, only: ['CN'], onlyNote: '只取得中國民航局（CAAC）型號認證，只能飛中國大陸境內航線' },
  // ---- 空中巴士 ----
  { id: 'BCS1', mfr: 'Airbus', model: 'A220-100', body: 'narrow', wide: false, maxSeats: 135, units: 120, range: 6390, speed: 829, rwy: 1463, price: 81, fuel: 1650 },
  { id: 'BCS3', mfr: 'Airbus', model: 'A220-300', body: 'narrow', wide: false, maxSeats: 160, units: 145, range: 6297, speed: 829, rwy: 1890, price: 91, fuel: 1900 },
  { id: 'A19N', mfr: 'Airbus', model: 'A319neo', body: 'narrow', wide: false, maxSeats: 160, units: 144, range: 6850, speed: 828, rwy: 2000, price: 101, fuel: 2100 },
  { id: 'A20N', mfr: 'Airbus', model: 'A320neo', body: 'narrow', wide: false, maxSeats: 194, units: 171, range: 6300, speed: 828, rwy: 2100, price: 111, fuel: 2300 },
  { id: 'A21N', mfr: 'Airbus', model: 'A321neo', body: 'narrow', wide: false, maxSeats: 244, units: 210, range: 7400, speed: 828, rwy: 2400, price: 129, fuel: 2700 },
  { id: 'A21X', mfr: 'Airbus', model: 'A321XLR', body: 'narrow', wide: false, maxSeats: 220, units: 200, range: 8700, speed: 828, rwy: 2500, price: 142, fuel: 2750 },
  { id: 'A333', mfr: 'Airbus', model: 'A330-300', body: 'wide', wide: true, maxSeats: 440, units: 380, range: 11750, speed: 871, rwy: 2770, price: 85, fuel: 6000, used: true },
  { id: 'A339', mfr: 'Airbus', model: 'A330-900', body: 'wide', wide: true, maxSeats: 460, units: 390, range: 13330, speed: 871, rwy: 2770, price: 296, fuel: 5500 },
  { id: 'A359', mfr: 'Airbus', model: 'A350-900', body: 'wide', wide: true, maxSeats: 440, units: 387, range: 15000, speed: 903, rwy: 2600, price: 317, fuel: 6600 },
  { id: 'A35K', mfr: 'Airbus', model: 'A350-1000', body: 'wide', wide: true, maxSeats: 480, units: 422, range: 16100, speed: 903, rwy: 2750, price: 366, fuel: 7400 },
  { id: 'A388', mfr: 'Airbus', model: 'A380-800', body: 'wide', wide: true, maxSeats: 853, units: 700, range: 15000, speed: 903, rwy: 2900, price: 90, fuel: 11500, used: true, minSize: 0, sizeNote: '需要能停靠 F 類機型的大型機場' },
  // ---- 波音 ----
  { id: 'B738', mfr: 'Boeing', model: '737-800', body: 'narrow', wide: false, maxSeats: 189, units: 170, range: 5436, speed: 842, rwy: 2300, price: 40, fuel: 2550, used: true },
  { id: 'B38M', mfr: 'Boeing', model: '737-8', body: 'narrow', wide: false, maxSeats: 210, units: 178, range: 6570, speed: 839, rwy: 2500, price: 121, fuel: 2350 },
  { id: 'B39M', mfr: 'Boeing', model: '737-9', body: 'narrow', wide: false, maxSeats: 220, units: 193, range: 6110, speed: 839, rwy: 2700, price: 128, fuel: 2500 },
  { id: 'B3XM', mfr: 'Boeing', model: '737-10', body: 'narrow', wide: false, maxSeats: 230, units: 204, range: 5740, speed: 839, rwy: 2800, price: 135, fuel: 2600 },
  { id: 'B748', mfr: 'Boeing', model: '747-8', body: 'wide', wide: true, maxSeats: 605, units: 560, range: 14320, speed: 917, rwy: 2990, price: 70, fuel: 10500, used: true },
  { id: 'B763', mfr: 'Boeing', model: '767-300ER', body: 'wide', wide: true, maxSeats: 351, units: 300, range: 11070, speed: 851, rwy: 2650, price: 25, fuel: 5400, used: true },
  { id: 'B77W', mfr: 'Boeing', model: '777-300ER', body: 'wide', wide: true, maxSeats: 550, units: 470, range: 13650, speed: 892, rwy: 2950, price: 120, fuel: 7500, used: true },
  { id: 'B788', mfr: 'Boeing', model: '787-8', body: 'wide', wide: true, maxSeats: 381, units: 320, range: 13530, speed: 903, rwy: 2600, price: 248, fuel: 4900 },
  { id: 'B789', mfr: 'Boeing', model: '787-9', body: 'wide', wide: true, maxSeats: 420, units: 360, range: 14010, speed: 903, rwy: 2800, price: 292, fuel: 5400 },
  { id: 'B78X', mfr: 'Boeing', model: '787-10', body: 'wide', wide: true, maxSeats: 440, units: 385, range: 11910, speed: 903, rwy: 2900, price: 338, fuel: 5800 },
];
window.MFR_ZH = { Airbus: '空中巴士', Boeing: '波音', Embraer: '巴西航空工業', ATR: 'ATR', Bombardier: '龐巴迪', COMAC: '中國商飛' };
