// v0.6.1 旅客分群：每條航線的需求拆成「觀光客」與「商務客」。
// 觀光客重 CP 值：對票價敏感、座椅等級與班次影響較小；越嚮往的目的地（真實出國資料）越不在意票價。
// 商務客重品質與效率：幾乎不在意票價，但很看座椅等級、貴賓室、班次密度、準點與社會評價。
// 真實數據（data/demand.js）：觀光熱度加成、嚮往度、GaWC 2024 國際商務城市等級、各國商務旅客傾向。
(function () {
  const G = window.G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  G.segAffinity = (A, B) => {
    const k = [A.cc, B.cc].sort().join('|'), e = window.AFFINITY && window.AFFINITY[k];
    return A.cc === B.cc || !e ? { m: 1, pref: 0 } : { m: e.m, pref: e.pref || 0, note: e.note, prefNote: e.prefNote, v: e.v };
  };
  G.gawc = (ap) => (window.GAWC && window.GAWC[ap.iata]) || null;
  G.bizProp = (cc) => (window.BIZ_PROP && window.BIZ_PROP[cc]) || 1;
  // 商務旅客占總需求的比例：兩端的國際商務城市等級越高越多；依兩國旅客的商務傾向調整；國內線商務比例較高
  G.businessShare = (A, B) => {
    const tA = G.gawc(A) ? G.gawc(A)[0] : 0, tB = G.gawc(B) ? G.gawc(B)[0] : 0;
    const prop = (G.bizProp(A.cc) + G.bizProp(B.cc)) / 2;
    const w = clamp((G.wealth(A.cc) + G.wealth(B.cc)) / 2, 0.5, 1.6);
    return clamp((0.07 + 0.03 * (tA + tB)) * prop * (A.cc === B.cc ? 1.25 : 1) * (0.75 + 0.25 * w), 0.04, 0.45);
  };
  // 各艙等的旅客組成（依距離）：商務客多坐商務艙與頭等艙，觀光客多坐經濟艙
  const SPLIT = {
    B: (d) => { const F = d > 5000 ? 0.06 : 0.02, J = 0.36 + 0.24 * Math.min(1, d / 6000), W = 0.12; return { F, J, W, Y: 1 - F - J - W }; },
    L: (d) => { const F = d > 5000 ? 0.004 : 0.001, J = 0.018 + 0.022 * Math.min(1, d / 6000), W = 0.055; return { F, J, W, Y: 1 - F - J - W }; },
  };
  const cache = new Map();
  G.routeSegments = (A, B) => {
    const key = A.iata < B.iata ? A.iata + B.iata : B.iata + A.iata;
    let s = cache.get(key);
    if (s) return s;
    const d = G.dist(A, B), base = G.marketDaily(A, B), bs = G.businessShare(A, B), aff = G.segAffinity(A, B);
    const Bz = base * bs, L = base * (1 - bs) * aff.m;
    const sl = SPLIT.L(d), sb = SPLIT.B(d), cls = {};
    G.CLASSES.forEach((c) => (cls[c] = { L: L * sl[c], B: Bz * sb[c] }));
    s = { base, total: L + Bz, L, B: Bz, bs: Bz / (L + Bz), aff, cls, d };
    cache.set(key, s);
    return s;
  };
  G.routeMarket = (A, B) => G.routeSegments(A, B).total;

  // 航線近期準點率（本月與上兩個月）
  function otp(r) {
    if (!r.stats) return 1;
    let fl = 0, dl = 0;
    [...(r.hist || []).slice(-2), r.stats].forEach((s) => { fl += s.flights || 0; dl += s.delays || 0; });
    return fl >= 6 ? 1 - dl / fl : 1;
  }
  // 單一旅客群在某艙等的攬客率
  G.segShare = (r, seg, cls, tier, freq, pen) => {
    const A = G.AP[r.a], B = G.AP[r.b], S = G.S, sg = G.routeSegments(A, B);
    const base = 0.15 + 0.25 * Math.exp(-sg.total / 300); // 冷門航線競爭少
    const f = Math.max(freq, 0.1), ff = (2 * f) / (f + 2);
    const p = r.fare[cls];
    let e, freqF, qual;
    const q = G.TIER_SCORE[tier] * (1 - (pen || 0));
    const h = S.hubs[r.a], lounge = (cls === 'J' || cls === 'F') && h ? h.upgrades.lounge || 0 : 0;
    if (seg === 'B') {
      e = p <= 1 ? 0.7 : 1.7;
      freqF = Math.pow(ff, 1.3);
      qual = Math.pow(q, 1.5) * (1 + 0.08 * lounge) * clamp(1 - 1.5 * (1 - otp(r)), 0.6, 1);
    } else {
      e = (p <= 1 ? 2.2 : 3.6) / (1 + 1.5 * sg.aff.pref); // 越嚮往的目的地，觀光客越不在意票價
      freqF = Math.pow(ff, 0.7);
      qual = Math.pow(q, 0.6) * (1 + 0.03 * lounge);
    }
    const priceF = Math.pow(1 / p, e);
    let bonus = 1.05 * G.repFactor(S.rep) * G.fmod('capture');
    if (seg === 'B') bonus *= 0.8 + 0.4 * (S.rep / 100); // 商務客更看重航空公司的評價
    if (G.hubStats(r.a).fortress) bonus *= 1.15;
    if (G.focusCities()[G.cityKey(B)]) bonus *= 1.1;
    if (G.socialDemand) bonus *= G.socialDemand(r);
    if (G.loyaltyBoost) bonus *= G.loyaltyBoost(seg); // v0.6.4 會員優先搭自家航班
    if (G.allyBoost) bonus *= G.allyBoost(r, seg, cls); // v0.9.0 航空聯盟：轉機銜接、常客互惠、貴賓室
    const share = Math.min(0.85, base * freqF * priceF * qual * bonus);
    // v0.7.0 同航線的真實航空公司會稀釋玩家的攬客率
    return G.rivalDilution ? share * G.rivalDilution(r, seg, cls, freqF * priceF * qual * bonus, base) : share;
  };
  // 每班期望旅客數（尚未乘時段係數）與其中觀光客的比例
  G.expectPax = (r, cls, tier, freq, pen) => {
    const sg = G.routeSegments(G.AP[r.a], G.AP[r.b]), m = sg.cls[cls];
    const l = m.L * G.segShare(r, 'L', cls, tier, freq, pen), b = m.B * G.segShare(r, 'B', cls, tier, freq, pen);
    const n = Math.max(freq, 0.5);
    return { pax: (l + b) / n, leisure: l + b > 0 ? l / (l + b) : 1 };
  };
  // 舊介面相容：整體攬客率
  G.captureShare = (r, cls, tier, freq, pen) => {
    const sg = G.routeSegments(G.AP[r.a], G.AP[r.b]), m = sg.cls[cls];
    const tot = m.L + m.B;
    return tot ? (m.L * G.segShare(r, 'L', cls, tier, freq, pen) + m.B * G.segShare(r, 'B', cls, tier, freq, pen)) / tot : 0;
  };
  // 給介面顯示的說明
  G.segmentInfo = (A, B) => {
    const sg = G.routeSegments(A, B), ga = G.gawc(A), gb = G.gawc(B);
    return { ...sg, gawcA: ga, gawcB: gb };
  };
})();
