// v0.7.0 真實航空公司競爭對手。
// 航網用 2026 年真實航線（data/carriers.js）；班次與座位數資料裡沒有，依航線市場大小、樞紐與母國估算。
// 對手以「彙總」方式模擬（每條航線的班次、票價、座椅等級），不逐架飛行；不會破產、不會有醜聞或飛安事故。
// 玩家在每條航線拿到的旅客，會被同航線的對手稀釋：對手班次越多、票價越低、品質越好，玩家越難搶。
// 對手會反擊：玩家在它的航線上削價搶客，它會跟著降價；在它的樞紐航線搶到不少旅客，它會加班。
(function () {
  const G = window.G;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DAY = 86400000;
  G.RIVAL = {
    serve: 0.85, lf: 0.8, // 真實航空公司合計載走的需求比例、平均載客率
    weightHub: 2.5, weightHome: 1.5,
    rep: { fsc: 72, lcc: 62 }, price: { fsc: 1, lcc: 0.78 },
    floor: { fsc: 0.82, lcc: 0.62 }, cut: 0.03, recover: 0.02, maxFreqUp: 1.5,
    k: 0.4, // 對手吸引力的整體係數（平衡用）
    // v1.2.0 需求校正後：熱門航線可以有更多班次；機隊校正倍率最多 1.25（座位約是旅客的 1.25 倍，接近真實載客率八成）
    caps: [24, 6, 10, 3, 3, 1.5], // 每家每天最多幾班：樞紐短程、其他短程、樞紐中程、其他中程、樞紐長程、其他長程
    scaleMin: 0.25, scaleMax: 1.25, // 依真實機隊數校正班次的倍率上下限
    util: 13, fMin: 0.3, // 每架飛機每天的平均飛行時數（含備用機、維修）；每家每條航線最少班次
    warShare: 0.1, warGap: 0.92, warProb: 0.28, // 玩家搶到 10% 以上、比對手便宜 8% 以上時，每週有三成五的機會降價迎戰
    fClass: ['EK', 'QR', 'EY', 'SQ', 'CX', 'JL', 'NH', 'LH', 'AF', 'BA', 'AA', 'UA', 'KE', 'OZ', 'TG', 'MH', 'GA', 'SV', 'LX', 'AI', 'CA', 'MU', 'CZ', 'QF', 'TK', 'WY'],
  };
  // ---------- 載入資料 ----------
  const C = (G.CARRIERS = {});
  const PAIRS = new Map(), AT = new Map(), AT_PAIRS = new Map();
  (window.CARRIERS || []).forEach(([code, name, zh, cc, lcc, hubs, nDest]) => {
    C[code] = { code, name, zh, cc, lcc: !!lcc, hubs: hubs ? hubs.split(' ') : [], nDest, routes: [] };
  });
  Object.entries(window.CARRIER_ROUTES || {}).forEach(([code, s]) => {
    const c = C[code];
    if (!c || !s) return;
    s.split(' ').forEach((k) => {
      c.routes.push(k);
      if (!PAIRS.has(k)) PAIRS.set(k, []);
      PAIRS.get(k).push(code);
      [k.slice(0, 3), k.slice(3)].forEach((ap) => { if (!AT.has(ap)) { AT.set(ap, new Map()); AT_PAIRS.set(ap, new Set()); } const m = AT.get(ap); m.set(code, (m.get(code) || 0) + 1); AT_PAIRS.get(ap).add(k); });
    });
  });
  G.carrierName = (c) => (c.zh || c.name);
  G.pairKey = (a, b) => (a < b ? a + b : b + a);
  G.carriersOn = (a, b) => (PAIRS.get(G.pairKey(a, b)) || []).filter((code) => !G.S || code !== G.S.company.code);
  G.carriersAt = (iata) => [...(AT.get(iata) || new Map()).entries()].filter(([code]) => !G.S || code !== G.S.company.code).sort((x, y) => y[1] - x[1]);
  // v1.1.0 機場的其他航空每日離場：以機場規模（依腹地人口估算，與舊版相同的基準）為準，
  // 再依「對手目前的班次 ÷ 對手原本的班次」即時增減：對手加班、減班、被你整合（班次歸零）都會立刻反映。
  // 已被你整合的航空公司不計；子公司的班次另外算（算進你的集團）；沒有航空公司資料的機場維持人口估算。
  const odCache = new Map(), refCache = new Map();
  let odKey = '', refCode = '';
  const defF = (x) => Math.round(clamp(x.f0 * G.fleetScale(x.code), G.RIVAL.fMin, x.cap * 1.5) * 10) / 10;
  // 對手原本的班次（遊戲資料的預設值，不含加減班、不含收購）
  const refDepartures = (iata) => {
    const me = G.S.company.code;
    if (me !== refCode) { refCode = me; refCache.clear(); }
    let v = refCache.get(iata);
    if (v == null) {
      v = 0;
      (AT_PAIRS.get(iata) || new Set()).forEach((k) => baseOn(k.slice(0, 3), k.slice(3)).forEach((x) => { if (x.code !== me) v += defF(x); }));
      refCache.set(iata, v);
    }
    return v;
  };
  G.otherDepartures = (iata) => {
    const S = G.S, ap = G.AP[iata];
    const key = Math.floor(S.time / DAY) + ':' + ((S.rivals && S.rivals.ver) || 0) + ':' + ((G.net && G.net.ver) || 0) + ':' + (G.mnaSig ? G.mnaSig() : '') + ':' + S.company.code;
    if (key !== odKey) { odKey = key; odCache.clear(); }
    let v = odCache.get(iata);
    if (v) return v;
    const base = G.baselineDepartures(ap), ref = refDepartures(iata);
    if (!ref) v = { total: base, subs: 0, by: [], est: true, k: 1 };
    else {
      const by = new Map();
      let cur = 0, subs = 0;
      AT_PAIRS.get(iata).forEach((k) => G.rivalsOn(k.slice(0, 3), k.slice(3)).forEach((r) => {
        if (G.isSub && G.isSub(r.code)) subs += r.f; else cur += r.f;
        by.set(r.code, (by.get(r.code) || 0) + r.f);
      }));
      const k = base / ref; // 資料班次換算成機場規模的倍率
      v = { total: cur * k, subs: subs * k, by: [...by.entries()].map(([c, f]) => [c, f * k]).sort((x, y) => y[1] - x[1]), est: false, k, ratio: (cur + subs) / ref };
    }
    odCache.set(iata, v);
    return v;
  };
  G.carrierColor = (code) => { let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h}, 62%, 46%)`; };

  // ---------- 估算對手在某航線的班次 ----------
  const est = new Map();
  const avgSeats = (d, lcc) => (d < 1000 ? (lcc ? 186 : 160) : d < 3000 ? (lcc ? 200 : 190) : d < 6000 ? 260 : 300);
  // 未校正的估計（只看市場、樞紐與母國）
  function baseOn(a, b) {
    const k = G.pairKey(a, b);
    let base = est.get(k);
    if (!base) {
      const A = G.AP[a], B = G.AP[b], codes = (PAIRS.get(k) || []).slice();
      const d = G.dist(A, B), m = G.routeSegments(A, B).total;
      const ws = codes.map((code) => { const c = C[code]; let w = 1; if (c.hubs.includes(a) || c.hubs.includes(b)) w *= G.RIVAL.weightHub; if (c.cc === A.cc || c.cc === B.cc) w *= G.RIVAL.weightHome; return w; });
      const sw = ws.reduce((s, x) => s + x, 0) || 1, seats = (m * G.RIVAL.serve) / G.RIVAL.lf;
      base = codes.map((code, i) => {
        // 上限：樞紐航空公司短程最多每天 8 班、中程 4 班、長程 2 班；其他航空公司 2／1.5／1 班（避免小機場因重力模型高估）
        const c = C[code], hub = c.hubs.includes(a) || c.hubs.includes(b);
        const K = G.RIVAL.caps, cap = d < 1500 ? (hub ? K[0] : K[1]) : d < 4500 ? (hub ? K[2] : K[3]) : hub ? K[4] : K[5];
        const f = clamp((seats * ws[i]) / sw / avgSeats(d, c.lcc), G.RIVAL.fMin, cap);
        return { code, c, f0: f, cap, hub, d };
      });
      est.set(k, base);
    }
    return base;
  }
  // v0.8.0 用真實機隊數校正：估計機隊 ÷ 真實機隊 = 每條航線班次的縮放倍率
  const rawFleet = (code) => {
    const c = C[code];
    if (c._raw != null) return c._raw;
    let hrs = 0;
    c.routes.forEach((k) => { const a = k.slice(0, 3), b = k.slice(3), r = baseOn(a, b).find((x) => x.code === code); if (r) hrs += r.f0 * 2 * (r.d / 820 + 0.5); });
    return (c._raw = Math.max(1, hrs / G.RIVAL.util));
  };
  G.fleetScale = (code) => {
    const c = C[code], real = window.REAL_FLEETS && window.REAL_FLEETS[code];
    if (!c || !real) return 1;
    if (c._scale == null) c._scale = clamp(real / rawFleet(code), G.RIVAL.scaleMin, G.RIVAL.scaleMax);
    return c._scale;
  };
  G.rivalsOn = (a, b) => {
    const k = G.pairKey(a, b), base = baseOn(a, b);
    const st = (G.S && G.S.rivals && G.S.rivals.pairs[k]) || {};
    const out = base.filter((x) => !G.S || x.code !== G.S.company.code).map((x) => {
      const o = st[x.code] || {};
      const p0 = x.c.lcc ? G.RIVAL.price.lcc : G.RIVAL.price.fsc;
      const f = Math.round(clamp(x.f0 * G.fleetScale(x.code), G.RIVAL.fMin, x.cap * 1.5) * 10) / 10;
      return { ...x, f: f * (o.fm || 1), p: o.p != null ? o.p : p0, p0, war: o.p != null && o.p < p0 - 0.005 };
    });
    return G.humanRivalsOn ? out.concat(G.humanRivalsOn(a, b)) : out; // v0.8.0 多人連線：其他玩家也是對手
  };
  // 對手有沒有這個艙等、座椅等級
  const offers = (r, cls) => {
    if (r.c.human) return r.tiers && r.tiers[cls] != null ? r.tiers[cls] : null; // 其他玩家：用他實際的座椅等級
    if (r.c.lcc) return cls === 'Y' ? 1 : null;
    if (cls === 'Y') return 2; if (cls === 'J') return 3;
    if (cls === 'W') return r.d > 3000 ? 2 : null;
    return r.d > 7000 && G.RIVAL.fClass.includes(r.code) ? 4 : null;
  };
  // 單一對手對某旅客群、某艙等的吸引力（與 segments.js 玩家的算法相同）
  G.rivalAttr = (r, seg, cls, pref) => {
    const tier = offers(r, cls);
    if (tier == null) return 0;
    const f = Math.max(r.f, 0.1), ff = (2 * f) / (f + 2), q = G.TIER_SCORE[tier];
    const p = r.p * (cls === 'Y' ? 1 : 1);
    let e, a;
    if (seg === 'B') { e = p <= 1 ? 0.7 : 1.7; a = Math.pow(ff, 1.3) * Math.pow(q, 1.5); }
    else { e = (p <= 1 ? 2.2 : 3.6) / (1 + 1.5 * (pref || 0)); a = Math.pow(ff, 0.7) * Math.pow(q, 0.6); }
    const rep = r.c.human ? r.rep : r.c.lcc ? G.RIVAL.rep.lcc : G.RIVAL.rep.fsc;
    let bonus = 1.05 * G.repFactor(rep) * (r.hub ? 1.15 : 1);
    if (seg === 'B') bonus *= 0.8 + 0.4 * (rep / 100);
    return a * Math.pow(1 / p, e) * bonus;
  };
  const sumCache = new Map();
  G.rivalSum = (a, b, seg, cls, pref) => {
    const v = ((G.S && G.S.rivals && G.S.rivals.ver) || 0) + '.' + ((G.net && G.net.ver) || 0) + '.' + ((G.S && G.S.ally && G.S.ally.ver) || 0), key = G.pairKey(a, b) + seg + cls + v;
    let s = sumCache.get(key);
    if (s == null) { s = G.RIVAL.k * G.rivalsOn(a, b).reduce((t, r) => t + G.rivalAttr(r, seg, cls, pref) * (G.allyRivalMul ? G.allyRivalMul(r.code) : 1), 0); sumCache.set(key, s); if (sumCache.size > 20000) sumCache.clear(); }
    return s;
  };
  // 玩家攬客率的稀釋係數：O 是原本模型裡「其他航空與轉機」的強度，aP 是玩家吸引力
  G.rivalDilution = (r, seg, cls, aP, base) => {
    const sg = G.routeSegments(G.AP[r.a], G.AP[r.b]);
    const sum = G.rivalSum(r.a, r.b, seg, cls, sg.aff.pref);
    if (!sum) return 1;
    const O = 1 / base - 1;
    return (O + aP) / (O + aP + sum);
  };

  // ---------- 對手的反擊（每週） ----------
  G.initRivals = (S) => { S.rivals = S.rivals || { pairs: {}, ver: 1, news: [] }; };
  G.rivalsWeekly = () => {
    const S = G.S, R = G.RIVAL;
    if (!S.rivals) G.initRivals(S);
    const mine = new Set();
    S.routes.forEach((r) => {
      const k = G.pairKey(r.a, r.b); mine.add(k);
      const rivals = G.rivalsOn(r.a, r.b);
      if (!rivals.length) return;
      // 玩家在這條航線的表現：上週載客占市場比例、經濟艙票價
      const now = new Date(S.time), ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const days = (S.time - Math.max(ms, r.since || ms)) / DAY, last = r.hist && r.hist[r.hist.length - 1];
      const paxDay = days >= 7 ? (r.stats.pax || 0) / days : last ? (last.pax || 0) / 30 : 0;
      const sg = G.routeSegments(G.AP[r.a], G.AP[r.b]);
      const share = paxDay / 2 / Math.max(1, sg.total);
      const pY = r.fare.Y || 1;
      const st = (S.rivals.pairs[k] = S.rivals.pairs[k] || {});
      rivals.forEach((x) => {
        if (x.c.human) return; // 其他玩家自己決定票價與班次
        const o = (st[x.code] = st[x.code] || {}), fl = x.c.lcc ? R.floor.lcc : R.floor.fsc;
        const p = o.p != null ? o.p : x.p0;
        // 玩家明顯比較便宜、而且搶到一定旅客 → 樞紐航空與低成本航空降價迎戰
        const ally = G.isPartner && G.isPartner(x.code); // v0.9.0 盟友不打價格戰、不加班搶客
        const cool = o.cool && S.time < o.cool; // v1.0 價格戰打太久會停火一段時間
        if (!ally && !cool && (x.hub || x.c.lcc) && share > R.warShare && pY < p * R.warGap && pY < x.p0 * 0.95 && p > fl + 0.001 && Math.random() < R.warProb * (G.dmod ? G.dmod('war') : 1)) {
          o.p = Math.max(fl, +(p * (1 - R.cut)).toFixed(3));
          if (!o.warned || S.time - o.warned > 30 * DAY) { o.warned = S.time; news(`${G.carrierName(x.c)}在 ${r.a}–${r.b} 調降票價迎戰`, x.code, k); }
        } else if (p < x.p0) o.p = Math.min(x.p0, +(p * (1 + R.recover * (cool ? 2 : 1))).toFixed(3));
        // v1.0 價格戰疲乏：連續 12 週以上，每週有 25% 機會停火約 9 個月
        if (o.p != null && o.p < x.p0 - 0.005) {
          o.warWeeks = (o.warWeeks || 0) + 1;
          if (o.warWeeks >= 12 && !cool && Math.random() < 0.25) { o.cool = S.time + 270 * DAY; o.warWeeks = 0; news(`${G.carrierName(x.c)}在 ${r.a}–${r.b} 停止降價，票價逐步回升`, x.code, k); }
        } else o.warWeeks = 0;
        // 樞紐航空公司：玩家搶到超過 12% → 加班
        if (!ally && x.hub && share > 0.12 && (o.fm || 1) < R.maxFreqUp) {
          o.fm = Math.min(R.maxFreqUp, +((o.fm || 1) * 1.1).toFixed(2));
          if (!o.added || S.time - o.added > 60 * DAY) { o.added = S.time; news(`${G.carrierName(x.c)}在 ${r.a}–${r.b} 增加班次`, x.code, k); }
        }
      });
    });
    // 玩家退出的航線：對手慢慢恢復原價與原班次
    Object.entries(S.rivals.pairs).forEach(([k, st]) => {
      if (mine.has(k)) return;
      Object.entries(st).forEach(([code, o]) => {
        if (o.p != null) o.p = Math.min(1, o.p * (1 + R.recover * 2));
        if (o.fm) o.fm = Math.max(1, o.fm * 0.95);
        const c = C[code], p0 = c && c.lcc ? R.price.lcc : R.price.fsc;
        if ((o.p == null || o.p >= p0 - 0.001) && (!o.fm || o.fm <= 1.001)) delete st[code];
      });
      if (!Object.keys(st).length) delete S.rivals.pairs[k];
    });
    S.rivals.ver = (S.rivals.ver || 0) + 1;
  };
  function news(text, code, k) {
    const S = G.S;
    S.rivals.news.unshift({ t: S.time, text, code, k });
    S.rivals.news = S.rivals.news.slice(0, 40);
    G.log(text);
    G._emit('event', { kind: 'rival', text });
  }
  // 每週一次（由每日結算呼叫）
  G.rivalsDaily = () => { const S = G.S; if (new Date(S.time - DAY / 2).getUTCDay() === 1) G.rivalsWeekly(); };

  // ---------- 給政府標案用：隨機挑幾家本國航空公司當投標者 ----------
  G.rivalNames = (cc, n) => {
    const list = Object.values(C).filter((c) => c.cc === cc).sort((a, b) => b.routes.length - a.routes.length).slice(0, 8);
    const out = [];
    while (out.length < n && list.length) out.push(G.carrierName(list.splice(Math.floor(Math.random() * list.length), 1)[0]));
    return out;
  };
  // 給介面：某家航空公司與玩家重疊的航線
  G.carrierOverlap = (code) => G.S.routes.filter((r) => G.carriersOn(r.a, r.b).includes(code));
  // 估計機隊：每條航線的班次 × 來回飛行時間 ÷ 每架每天 13 小時
  // 機隊：有真實資料就用真實數字，否則用班次換算的估計值
  G.carrierFleetEst = (code) => {
    const real = window.REAL_FLEETS && window.REAL_FLEETS[code];
    if (real) return real;
    const c = C[code];
    return c ? Math.max(1, Math.round(rawFleet(code))) : 0;
  };
  G.carrierFleetReal = (code) => !!(window.REAL_FLEETS && window.REAL_FLEETS[code]);
})();
