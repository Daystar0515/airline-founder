// v1.2.0 需求校正：讓每座機場的模型旅客量接近真實年旅客量（src-data/traffic_raw.txt），
// 航線之間的分配依「重力模型市場 × 經營的航空公司家數^γ」，以疊代比例調整（IPF）求出每座機場的需求係數。
// 輸出 game/data/calib.js：新的腹地人口（src-data/catchment.json）與需求係數。
// 用法：node tools/build_calib.js .
const fs = require('fs'), vm = require('vm');
const ROOT = process.argv[2] || '.';
const G0 = ROOT + '/game/';
const ctx = { console, Math, JSON, Date, Intl, atob: (s) => Buffer.from(s, 'base64').toString('binary'), performance: { now: () => Date.now() }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {} };
ctx.window = ctx; vm.createContext(ctx);
['js/version.js', 'data/airports.js', 'data/continents.js', 'data/aircraft.js', 'data/curfews.js', 'js/rules.js', 'js/rules3.js', 'data/roles.js', 'js/roles.js', 'data/airspace.js', 'data/carriers.js', 'data/fleets.js', 'js/paths.js', 'js/sim.js', 'data/demand.js', 'js/segments.js'].forEach((f) => vm.runInContext(fs.readFileSync(G0 + f, 'utf8'), ctx, { filename: f }));
const G = ctx.G;
const GAMMA = +(process.argv[3] || 2);
const pop = JSON.parse(fs.readFileSync(ROOT + '/src-data/catchment.json', 'utf8'));
G.AIRPORTS.forEach((a) => { if (pop[a.iata] != null) a.popK = pop[a.iata]; });
const traffic = {};
fs.readFileSync(ROOT + '/src-data/traffic_raw.txt', 'utf8').split('\n').forEach((l) => { l = l.trim(); if (!l || l[0] === '#') return; const [k, v] = l.split('|'); const n = parseInt(v, 10); if (n > 0 && G.AP[k]) traffic[k] = Math.max(traffic[k] || 0, n); });
// 真實航網：每個機場配對有幾家航空公司經營
// 長程航線用大飛機、班次少、經營家數也少：依航程的平均座位數補回來
const sizeAdj = (d) => Math.pow((d < 1000 ? 170 : d < 3000 ? 195 : d < 6000 ? 260 : 300) / 170, +(process.argv[4] || 2));
const nPair = new Map();
Object.values(ctx.CARRIER_ROUTES).forEach((s) => s && s.split(' ').forEach((k) => nPair.set(k, (nPair.get(k) || 0) + 1)));
const pairs = [];
nPair.forEach((n, k) => { const a = G.AP[k.slice(0, 3)], b = G.AP[k.slice(3)]; if (!a || !b) return; pairs.push({ a, b, w: G.routeSegments(a, b).total * Math.pow(n, GAMMA) * sizeAdj(G.dist(a, b)) }); });
const adj = new Map();
pairs.forEach((p) => { [p.a.iata, p.b.iata].forEach((x) => { if (!adj.has(x)) adj.set(x, []); }); adj.get(p.a.iata).push(p); adj.get(p.b.iata).push(p); });
const k = {};
G.AIRPORTS.forEach((a) => (k[a.iata] = 1));
const T = {}; Object.entries(traffic).forEach(([x, v]) => (T[x] = v / 2 / 365));
const cont = (a) => (ctx.CONTINENTS[a.cc] || ['?'])[0];
const med = (arr) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
for (let it = 0; it < 60; it++) {
  // 有資料的機場：調整係數
  Object.keys(T).forEach((x) => {
    const L = adj.get(x); if (!L) return;
    let S = 0; L.forEach((p) => { const y = p.a.iata === x ? p.b.iata : p.a.iata; S += k[x] * k[y] * p.w; });
    if (S > 0) k[x] = Math.min(20, Math.max(0.02, k[x] * Math.sqrt(T[x] / S)));
  });
  // 沒有資料的機場：同國家（同規模優先）的中位數，否則同洲
  const byCC = {}, byCont = {};
  Object.keys(T).forEach((x) => { const a = G.AP[x]; (byCC[a.cc + a.size] = byCC[a.cc + a.size] || []).push(k[x]); (byCC[a.cc] = byCC[a.cc] || []).push(k[x]); (byCont[cont(a) + a.size] = byCont[cont(a) + a.size] || []).push(k[x]); (byCont[cont(a)] = byCont[cont(a)] || []).push(k[x]); });
  G.AIRPORTS.forEach((a) => {
    if (T[a.iata]) return;
    const c = (byCC[a.cc + a.size] && byCC[a.cc + a.size].length >= 3 && byCC[a.cc + a.size]) || (byCC[a.cc] && byCC[a.cc].length >= 3 && byCC[a.cc]) || byCont[cont(a) + a.size] || byCont[cont(a)] || [1];
    k[a.iata] = med(c) * 0.85; // 沒進榜的機場通常比較小：打個折
  });
}
// 驗證：模型與真實旅客量
const model = (x) => { const L = adj.get(x) || []; let S = 0; L.forEach((p) => { const y = p.a.iata === x ? p.b.iata : p.a.iata; S += k[x] * k[y] * p.w; }); return S * 2 * 365 / 1e6; };
['TPE', 'HKG', 'HND', 'NRT', 'ICN', 'GMP', 'CJU', 'SIN', 'KUL', 'LHR', 'JFK', 'ATL', 'DXB', 'KHH', 'RMQ', 'MZG', 'LHE', 'DEL', 'CGK', 'SYD'].forEach((x) => console.log(x, 'real', T[x] ? (T[x] * 2 * 365 / 1e6).toFixed(1) : '-', 'model', model(x).toFixed(1), 'k', k[x].toFixed(3), 'pop', G.AP[x].popK));
const route = (a, b) => { const key = a < b ? a + b : b + a, n = nPair.get(key) || 0, A = G.AP[a], B = G.AP[b]; const m = G.routeSegments(A, B).total * k[a] * k[b] * (n ? Math.pow(n, GAMMA) * sizeAdj(G.dist(A, B)) : 0.3); return (m * 2 * 365 / 1e6).toFixed(2) + 'M/yr n=' + n; };
[['TPE', 'LAX'], ['TPE', 'SFO'], ['HKG', 'LHR'], ['SIN', 'LHR'], ['NRT', 'JFK'], ['GMP', 'CJU'], ['SIN', 'KUL'], ['HND', 'CTS'], ['TPE', 'HKG'], ['LHR', 'JFK'], ['TPE', 'NRT'], ['TPE', 'HND'], ['TPE', 'LHE'], ['SYD', 'MEL'], ['BOM', 'DEL'], ['JED', 'RUH'], ['TPE', 'KHH'], ['TPE', 'ICN'], ['TPE', 'BKK'], ['TPE', 'KIX'], ['HKG', 'SIN'], ['CGK', 'SIN'], ['MEX', 'CUN']].forEach(([a, b]) => console.log(a + '-' + b, route(a, b)));
const out = { gamma: GAMMA, size: +(process.argv[4] || 2), pop: {}, k: {} };
G.AIRPORTS.forEach((a) => { if (pop[a.iata] != null) out.pop[a.iata] = pop[a.iata]; out.k[a.iata] = +k[a.iata].toFixed(3); });
fs.writeFileSync(G0 + 'data/calib.js', '// v1.2.0 需求校正（tools/build_calib.js 產生）。pop：腹地人口（千人，Huff 模型、依真實旅客量加權）；k：機場需求係數（讓模型旅客量接近真實年旅客量）。\n// 真實旅客量：維基百科各國／各區「busiest airports」列表，2024–2025 年。\nwindow.CALIB=' + JSON.stringify(out) + ';\n');
console.log('written', Object.keys(out.k).length, 'airports; data airports', Object.keys(T).length);
