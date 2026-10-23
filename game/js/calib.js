// v1.2.0 需求校正（資料：data/calib.js）
// 1. 腹地人口：改用依真實旅客量加權的 Huff 模型重新分配城市人口（原本只看機場規模）。
// 2. 每座機場的需求係數：讓模型算出的年旅客量接近真實（2024–2025 年）。
// 3. 航線之間的分配：有航空公司經營的航線依「經營家數的平方」放大（家數越多通常市場越大）；
//    長程航線用大飛機、經營家數少，依航程的平均座位數補回來；
//    沒人飛的航線只剩潛在需求：兩國之間有其他航線時約三成，兩國之間完全沒有航線時只剩 3%。
(function () {
  const G = window.G, C = window.CALIB;
  if (!C) return;
  G.CALIB = { latent: 0.3, latentNone: 0.03, gamma: C.gamma || 2, size: C.size || 2, kDefault: 0.3, boost: 1, capture: 1.75 };
  G.AIRPORTS.forEach((ap) => {
    ap.pop0 = ap.popK; // 舊版的腹地人口：只用來算「機場規模」（航班占比的基準），維持遊戲平衡
    if (C.pop[ap.iata] != null) ap.popK = C.pop[ap.iata];
    ap.dk = C.k[ap.iata] != null ? C.k[ap.iata] : G.CALIB.kDefault;
  });
  const nPair = new Map(), ccPair = new Set();
  Object.values(window.CARRIER_ROUTES || {}).forEach((s) => s && s.split(' ').forEach((k) => {
    nPair.set(k, (nPair.get(k) || 0) + 1);
    const a = G.AP[k.slice(0, 3)], b = G.AP[k.slice(3)];
    if (a && b) ccPair.add(a.cc < b.cc ? a.cc + b.cc : b.cc + a.cc);
  }));
  G.pairCarriers = (a, b) => nPair.get(a.iata < b.iata ? a.iata + b.iata : b.iata + a.iata) || 0;
  G.pairFactor = (a, b) => {
    const n = G.pairCarriers(a, b);
    if (n) { const d = G.dist(a, b); return Math.pow(n, G.CALIB.gamma) * Math.pow((d < 1000 ? 170 : d < 3000 ? 195 : d < 6000 ? 260 : 300) / 170, G.CALIB.size); }
    if (a.cc === b.cc) return G.CALIB.latent;
    return ccPair.has(a.cc < b.cc ? a.cc + b.cc : b.cc + a.cc) ? G.CALIB.latent : G.CALIB.latentNone;
  };
  const md0 = G.marketDaily;
  G.marketDaily = (a, b) => md0(a, b) * (a.dk || G.CALIB.kDefault) * (b.dk || G.CALIB.kDefault) * G.pairFactor(a, b) * G.CALIB.boost;
  // 市場改成真實大小後，玩家在每條航線的攬客率整體上調（平衡用，見規格書）
  const ss0 = G.segShare;
  G.segShare = (...a) => Math.min(0.9, ss0(...a) * G.CALIB.capture);
  G.baselineDepartures = (ap) => Math.round(3 + 40 * Math.pow((ap.pop0 || ap.popK) / 1000, 0.75));
})();
