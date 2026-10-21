// v1.0.0 經營玩法再深一層：難度、淡旺季與節日、樞紐轉機旅客、貨運（機腹與全貨機）、子品牌低成本航空、
// 管制機場的時刻帶、新機訂購排隊交機。
(function () {
  const G = window.G;
  const DAY = 86400000, MIN = 60000, YEAR = 365 * DAY;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const log = (m, k) => G.log(m, k);
  const emit = (w, d) => G._emit(w, d);

  // ====================================================================
  // 難度
  // ====================================================================
  G.DIFF = {
    easy: { name: '輕鬆', desc: '資金寬裕、需求較多、突發事件少而輕、對手不愛打價格戰', cash: 1.5, demand: 1.08, events: 0.6, sev: 0.7, war: 0.7, rate: -0.01, risk: 0.8, score: 0.8 },
    normal: { name: '標準', desc: '原本的遊戲平衡', cash: 1, demand: 1, events: 1, sev: 1, war: 1, rate: 0, risk: 1, score: 1 },
    hard: { name: '困難', desc: '起始資金 ×0.8、需求 −5%、事件更多更重、對手更常降價、貸款利率 +1%', cash: 0.8, demand: 0.95, events: 1.25, sev: 1.15, war: 1.3, rate: 0.01, risk: 1.15, score: 1.25 },
    brutal: { name: '硬派', desc: '起始資金 ×0.6、需求 −10%、事件頻繁且嚴重、對手兇狠、貸款利率 +2%、故障率 +30%', cash: 0.6, demand: 0.9, events: 1.5, sev: 1.3, war: 1.6, rate: 0.02, risk: 1.3, score: 1.6 },
  };
  G.DIFF_ORDER = ['easy', 'normal', 'hard', 'brutal'];
  G.dmod = (k) => { const d = G.DIFF[(G.S && G.S.diff) || 'normal'] || G.DIFF.normal; return d[k]; };
  // 貸款利率、故障率
  const lo0 = G.loanOffers;
  G.loanOffers = () => { const o = lo0(), d = G.dmod('rate'); o.unsecured.rate += d; o.secured.rate += d; return o; };
  const br0 = G.bondRate;
  G.bondRate = (y) => br0(y) + G.dmod('rate');
  const risk0 = G.riskPerFlight;
  G.riskPerFlight = (o) => { const p = risk0(o), k = G.dmod('risk'); return { delay: p.delay * k, emergency: p.emergency * k, crash: p.crash * k }; };

  // 全貨機沒有客艙
  const cf0 = G.classesFor, dc0 = G.defaultCabin;
  G.classesFor = (t) => (t.freighter ? [] : cf0(t));
  G.defaultCabin = (t) => (t.freighter ? {} : dc0(t));
  const mc0 = G.makeCabin;
  if (mc0) G.makeCabin = (t, layout, tiers) => (t.freighter ? {} : mc0(t, layout, tiers));

  // ====================================================================
  // 淡旺季與節日
  // ====================================================================
  // 北半球的月份係數（1–12 月）；南半球觀光旺季差半年；熱帶地區起伏較小
  const SEA_L = [0.86, 0.9, 0.95, 1.0, 1.0, 1.08, 1.2, 1.22, 0.98, 1.0, 0.88, 1.08];
  const SEA_B = [0.95, 1.0, 1.05, 1.03, 1.03, 1.0, 0.92, 0.85, 1.05, 1.07, 1.03, 0.85];
  const SEA_C = [0.9, 0.88, 1.0, 0.98, 0.98, 0.98, 1.0, 1.0, 1.04, 1.1, 1.14, 1.12];
  const LNY = new Set(['CN', 'TW', 'HK', 'MO', 'SG', 'MY', 'VN', 'KR']);
  G.SEASON_NAMES = { 1: '寒假與農曆年前', 2: '農曆年', 7: '暑假旺季', 8: '暑假旺季', 12: '聖誕與跨年', 11: '秋季淡季' };
  function monthVal(arr, t, shift) {
    const d = new Date(t), m = (d.getUTCMonth() + (shift || 0) + 12) % 12, f = (d.getUTCDate() - 1) / 30;
    // 月中最接近當月數值，前後半月往相鄰月份平滑
    const prev = arr[(m + 11) % 12], cur = arr[m], next = arr[(m + 1) % 12];
    return f < 0.5 ? cur + (prev - cur) * (0.5 - f) * 0.5 : cur + (next - cur) * (f - 0.5) * 0.5;
  }
  let seaDay = -1, seaCache = new Map();
  G.seasonMul = (A, B, seg, t) => {
    const S = G.S; t = t || (S ? S.time : Date.now());
    const day = Math.floor(t / DAY);
    if (day !== seaDay) { seaDay = day; seaCache = new Map(); }
    const key = A.iata + B.iata + seg;
    let v = seaCache.get(key);
    if (v != null) return v;
    const one = (ap) => {
      if (seg === 'B') return monthVal(SEA_B, t, ap.lat < -10 ? 0 : 0);
      if (seg === 'C') return monthVal(SEA_C, t);
      let x = monthVal(SEA_L, t, ap.lat < -10 ? 6 : 0);
      if (Math.abs(ap.lat) < 15) x = 1 + (x - 1) * 0.5;
      return x;
    };
    v = (one(A) + one(B)) / 2;
    if (seg === 'L') {
      const m = new Date(t).getUTCMonth() + 1;
      if (LNY.has(A.cc) || LNY.has(B.cc)) v *= m === 2 ? 1.12 : m === 1 ? 1.04 : 1;
      if ((A.cc === 'JP' || B.cc === 'JP') && m === 5) v *= 1.06; // 日本黃金週
    }
    seaCache.set(key, v);
    return v;
  };

  // ====================================================================
  // 樞紐轉機旅客
  // ====================================================================
  // 在你的樞紐轉機：A ⇄ 樞紐 ⇄ B，兩段都由你飛、而且你沒有直飛 A–B。
  // 轉機的攬客率看繞道比例、兩段班次較少的那一段、兩段經濟艙票價、是否有對手直飛、樞紐地勤與要塞地位、社會評價。
  G.XFER = { k: 0.007, maxDetour: 1.4, minDist: 500, bizMul: 0.5, fareDisc: 0.35, maxShare: 0.2, near: 110, handling: 12 };
  // 同一個都會區的其他機場（例如 KIX 與 UKB、ITM）：算直飛對手時一起看
  const nearCache = new Map();
  G.nearAirports = (iata) => {
    let v = nearCache.get(iata);
    if (!v) { const A = G.AP[iata]; v = G.AIRPORTS.filter((x) => x.iata !== iata && x.size <= 1 && Math.abs(x.lat - A.lat) < 1.2 && G.dist(x, A) < G.XFER.near).map((x) => x.iata); v.unshift(iata); nearCache.set(iata, v); }
    return v;
  };
  const nsCache = new Map();
  G.nonstopRivals = (a, b) => {
    const k = G.pairKey(a, b);
    let v = nsCache.get(k);
    if (v == null) { const set = new Set(); G.nearAirports(a).forEach((x) => G.nearAirports(b).forEach((y) => G.carriersOn(x, y).forEach((c) => set.add(c)))); v = set.size; nsCache.set(k, v); }
    return v;
  };
  G.nonstopReset = () => nsCache.clear();
  let XF = { key: '', at: 0, byRoute: new Map(), byHub: {} };
  const routeActive = (r) => G.routeFreq(r) > 0.05;
  function computeXfer() {
    const S = G.S, X = G.XFER, byRoute = new Map(), byHub = {};
    const direct = new Set(S.routes.map((r) => G.pairKey(r.a, r.b)));
    const rep = G.repFactor(S.rep);
    Object.keys(S.hubs).forEach((H) => {
      const HA = G.AP[H], hs = G.hubStats(H), up = S.hubs[H].upgrades || {};
      const hubQ = (1 + 0.06 * (up.ground || 0)) * (hs.fortress ? 1.1 : 1);
      const spokes = S.routes.filter((r) => (r.a === H || r.b === H) && !G.noXfer(r) && routeActive(r)).map((r) => {
        const X2 = G.AP[r.a === H ? r.b : r.a];
        return { r, ap: X2, f: G.routeFreq(r), fare: r.fare.Y || 1, d: G.dist(HA, X2) };
      });
      const top = [];
      for (let i = 0; i < spokes.length; i++) {
        for (let j = i + 1; j < spokes.length; j++) {
          const s1 = spokes[i], s2 = spokes[j], A = s1.ap, B = s2.ap;
          if (A.iata === B.iata || direct.has(G.pairKey(A.iata, B.iata))) continue;
          const dAB = G.dist(A, B);
          if (dAB < X.minDist) continue;
          const q = (s1.d + s2.d) / dAB;
          if (q > X.maxDetour) continue;
          const detF = Math.pow(clamp((X.maxDetour - q) / (X.maxDetour - 1), 0, 1), 0.7);
          const nR = G.nonstopRivals(A.iata, B.iata);
          const ff = Math.min(s1.f, s2.f), freqF = ff / (ff + 1.5);
          const priceF = Math.pow(1 / ((s1.fare + s2.fare) / 2), 1.6);
          // 有直飛的市場，轉機很難搶：1 家直飛只剩 1/4，越多家越少
          const shL = Math.min(X.maxShare, X.k * detF * (nR ? 0.25 / nR : 1) * freqF * priceF * hubQ * rep);
          if (shL < 0.002) continue;
          const shB = shL * X.bizMul;
          const sg = G.routeSegments(A, B);
          const add = (r) => {
            let o = byRoute.get(r.id);
            if (!o) { o = { tot: 0 }; G.CLASSES.forEach((c) => (o[c] = { L: 0, B: 0 })); byRoute.set(r.id, o); }
            G.CLASSES.forEach((c) => { o[c].L += sg.cls[c].L * shL; o[c].B += sg.cls[c].B * shB; });
            o.tot += sg.L * shL + sg.B * shB;
          };
          add(s1.r); add(s2.r);
          top.push({ a: A.iata, b: B.iata, pax: sg.L * shL + sg.B * shB });
        }
      }
      top.sort((x, y) => y.pax - x.pax);
      byHub[H] = { pairs: top.length, pax: top.reduce((s, x) => s + x.pax, 0), top: top.slice(0, 12) };
    });
    return { byRoute, byHub };
  }
  let xKeyDay = -1, xKey = '';
  function xferData() {
    const S = G.S, day = Math.floor(S.time / DAY);
    if (day === xKeyDay && XF.at === day) return XF;
    const key = G.routeVer + '|' + G.hubVer + '|' + S.routes.length;
    if (day === xKeyDay && key === xKey && day - XF.at < 7) return XF;
    xKeyDay = day; xKey = key;
    // 航網有變時隔天重算；否則每 7 天依票價、班次與評價更新一次
    if (XF.key !== key ? day !== XF.at : day - XF.at >= 7) {
      const r = computeXfer();
      XF = { key, at: day, byRoute: r.byRoute, byHub: r.byHub };
    }
    return XF;
  }
  G.xferFor = (r) => (G.S && r && r.id > 0 && !G.noXfer(r) ? xferData().byRoute.get(r.id) || null : null);
  G.xferHub = (H) => xferData().byHub[H] || { pairs: 0, pax: 0, top: [] };
  G.xferReset = () => { XF = { key: '', at: 0, byRoute: new Map(), byHub: {} }; };

  // ====================================================================
  // 貨運
  // ====================================================================
  G.CARGO_HUBS = new Set('HKG PVG ICN TPE NRT KIX ANC MEM SDF CVG DXB DOH FRA LEJ CGN CDG AMS LUX LHR EMA LGG LAX ORD MIA JFK ATL DFW SIN CAN SZX PEK IST BKK BOM DEL'.split(' '));
  const cmCache = new Map();
  // 單向每日貨運市場（公噸）：依旅客市場、距離與貨運樞紐估算
  G.cargoMarket = (A, B) => {
    const key = G.pairKey(A.iata, B.iata);
    let v = cmCache.get(key);
    if (v == null) {
      const d = G.dist(A, B), tot = G.routeSegments(A, B).total;
      const k = d < 800 ? 0.006 : d < 1500 ? 0.012 : d < 5000 ? 0.03 : 0.06;
      const hubs = (G.CARGO_HUBS.has(A.iata) ? 1 : 0) + (G.CARGO_HUBS.has(B.iata) ? 1 : 0);
      v = tot * k * (hubs === 2 ? 2 : hubs === 1 ? 1.4 : 1);
      cmCache.set(key, v);
    }
    return v;
  };
  G.cargoYield = (d) => 0.6 + 0.3 * Math.pow(d / 1000, 0.8); // 美元／公斤
  G.bellyTons = (t) => (t.freighter ? 0 : t.wide ? t.units * 0.045 : t.body === 'turboprop' ? t.units * 0.006 : t.body === 'regional' ? t.units * 0.008 : t.units * 0.015);
  G.cargoCap = (t, lf) => (t.freighter ? t.cargo : G.bellyTons(t) * (1 - 0.3 * (lf == null ? 0.8 : lf)));
  const freqOf = (ac, r) => { const t = G.TYPES[ac.type], d = G.legKm(G.AP[r.a], G.AP[r.b]); return 1440 / (2 * (G.blockMinutes(t, d) + G.turnMinutes(t))); };
  const capCache = new Map();
  let capKey = '';
  G.routeCargoCap = (r) => {
    const k = Math.floor(G.S.time / DAY) + '|' + G.routeVer;
    if (k !== capKey) { capKey = k; capCache.clear(); }
    let v = capCache.get(r.id);
    if (v == null) {
      v = G.routeAircraft(r).reduce((s, ac) => (['maint', 'aog', 'refit', 'refurb'].includes(ac.st) || ac.grounded ? s : s + freqOf(ac, r) * G.cargoCap(G.TYPES[ac.type])), 0);
      capCache.set(r.id, v);
    }
    return v;
  };
  const rcCache = new Map();
  let rcDay = -1;
  G.rivalCargoCap = (a, b) => {
    const day = Math.floor(G.S.time / DAY);
    if (day !== rcDay) { rcDay = day; rcCache.clear(); }
    const k = G.pairKey(a, b);
    let v = rcCache.get(k);
    if (v == null) { const d = G.dist(G.AP[a], G.AP[b]); v = G.rivalsOn(a, b).reduce((s, x) => s + x.f * (d > 3000 ? 14 : d > 1200 ? 4 : 1.5), 0); rcCache.set(k, v); }
    return v;
  };
  G.cargoDemand = (r) => {
    const A = G.AP[r.a], B = G.AP[r.b];
    return G.cargoMarket(A, B) * G.seasonMul(A, B, 'C') * (G.evDemand ? G.evDemand(A, B, 'C') : 1) * G.dmod('demand');
  };
  // 一個航班的貨運：依你在這條航線的總運力占比分配市場
  G.cargoBook = (ac, r, lf) => {
    const t = G.TYPES[ac.type], cap = G.cargoCap(t, lf);
    if (!r || cap <= 0) return null;
    const my = Math.max(0.01, G.routeCargoCap(r)), riv = G.rivalCargoCap(r.a, r.b), cm = G.cargoDemand(r);
    const tonsDay = Math.min(0.92 * my, (cm * my) / (my + riv));
    const tons = Math.max(0, Math.min(cap, ((tonsDay * G.cargoCap(t)) / my) * rnd(0.85, 1.15)));
    const d = G.dist(G.AP[r.a], G.AP[r.b]);
    return { tons, rev: tons * 1000 * G.cargoYield(d) * (G.evFare ? G.evFare() : 1), cap };
  };
  G.CARGO_HANDLING = 60; // 每公噸地勤裝卸費
  G.CARGO_OPS = 0.3; // 貨運銷售、倉儲與管理（營收的比例）
  G.CARGO_FUEL = 35; // 每公噸貨物每飛行小時多燒的燃油（公斤）

  // ====================================================================
  // 子品牌低成本航空
  // ====================================================================
  // v1.0.0 子航空公司：自創低成本或區域航空，或併購後保留原品牌（國泰港龍模式）。
  // 每家子航空公司有自己的名稱、代碼與顏色，航線可以在主品牌與各子航空公司之間切換。
  G.BRAND_KINDS = {
    lcc: { name: '低成本航空', desc: '用另一個品牌經營價格敏感的觀光航線（像樂桃、酷航、台灣虎航）：票價約主品牌的七成五、成本更低，不會拖累主品牌形象；不接轉機旅客。', setup: 15e6, fare: 0.75, biz: 0.6, crew: 0.8, service: 0.4, overhead: 0.8, airport: 0.9, repW: 0.5, xfer: false, bob: true, maxDist: null, found: true },
    regional: { name: '區域航空', desc: '用較低的人事與營運成本經營 2,500 公里以內的短程航線，並把旅客接駁到你的樞紐（像華信、J-AIR、Envoy）；票價與主品牌相近。', setup: 10e6, fare: 0.97, biz: 0.95, crew: 0.85, service: 0.85, overhead: 0.85, airport: 0.95, repW: 0.8, xfer: true, bob: false, maxDist: 2500, found: true },
    acq: { name: '併購保留品牌', desc: '收購後整合進集團、保留原本的品牌（像國泰港龍）：在它的母國保有在地旅客的忠誠度。', setup: 0, fare: 1, biz: 1, crew: 1, service: 1, overhead: 1, airport: 1, repW: 1, xfer: true, bob: false, home: 0.06, maxDist: null, found: false },
  };
  G.LCC = G.BRAND_KINDS.lcc; // 舊程式相容
  G.LCC.rebrand = 200e3;
  G.BRAND = { rebrand: 200e3, fixed: 0.25e6, maxFounded: 3 }; // fixed：每家子航空公司每月的固定管理成本（航空業者執照、品牌、管理團隊）
  // 集團規模上限：機隊越大，能經營的子航空公司越多（自創、保留品牌與獨立子公司合計）
  G.GROUP_TIERS = [[10, 1], [60, 2], [120, 3], [200, 4], [300, 5], [450, 6]];
  G.groupCap = () => { const n = G.S.fleet.length; let c = 0; G.GROUP_TIERS.forEach(([f, k]) => { if (n >= f) c = k; }); return c; };
  G.groupNext = () => G.GROUP_TIERS.find(([f]) => G.S.fleet.length < f) || null;
  G.brands = () => (G.S && G.S.brands) || [];
  G.brandById = (id) => G.brands().find((b) => b.id === id) || null;
  G.brandOf = (r) => (r && r.brand ? G.brandById(r.brand) : null);
  G.brandKind = (b) => (b ? G.BRAND_KINDS[b.kind] : null);
  G.brandK = (r, k) => { const b = G.brandOf(r); return b ? G.BRAND_KINDS[b.kind][k] : 1; };
  G.isLcc = (r) => { const b = G.brandOf(r); return !!b && b.kind === 'lcc'; };
  G.noXfer = (r) => { const b = G.brandOf(r); return !!b && !G.BRAND_KINDS[b.kind].xfer; };
  G.groupUsed = () => G.brands().length + (G.S.mna ? G.S.mna.subs.length + G.S.mna.deals.length : 0);
  G.brandCodeTaken = (code) => code === G.S.company.code || G.brands().some((b) => b.code === code);
  G.foundBrand = ({ name, code, color, kind }) => {
    const S = G.S, K = G.BRAND_KINDS[kind];
    if (!K || !K.found) return { ok: false, msg: '請選擇子航空公司的類型' };
    S.brands = S.brands || [];
    if (S.brands.filter((b) => !b.from).length >= G.BRAND.maxFounded) return { ok: false, msg: `最多自創 ${G.BRAND.maxFounded} 家子航空公司` };
    if (G.groupUsed() >= G.groupCap()) { const nx = G.groupNext(); return { ok: false, msg: `集團規模已達上限（${G.groupCap()} 家）${nx ? `，機隊達到 ${nx[0]} 架可以再多一家` : ''}` }; }
    name = String(name || '').trim().slice(0, 20); code = String(code || '').trim().toUpperCase();
    if (!name) return { ok: false, msg: '請輸入名稱' };
    if (!/^[A-Z0-9]{2}$/.test(code) || G.brandCodeTaken(code)) return { ok: false, msg: '代碼需為兩個英文字母或數字，且不能和母公司或其他子航空公司相同' };
    if (S.cash < K.setup) return { ok: false, msg: `資金不足，需要 ${G.money(K.setup)}` };
    G._spend(K.setup, 'facility');
    S.brandSeq = (S.brandSeq || 0) + 1;
    const b = { id: 'b' + S.brandSeq, kind, name, code, color: color || (kind === 'lcc' ? '#f28c28' : '#2f9e6c'), since: S.time };
    S.brands.push(b);
    log(`成立子航空公司「${name}」（${code}，${K.name}），開辦費 ${G.money(K.setup)}`);
    G.xferReset();
    emit('routes');
    return { ok: true, brand: b };
  };
  G.foundLcc = (o) => G.foundBrand({ ...o, kind: 'lcc' });
  G.brandWhy = (r, b) => {
    const K = G.BRAND_KINDS[b.kind];
    if (K.maxDist && G.dist(G.AP[r.a], G.AP[r.b]) > K.maxDist) return `${K.name}只經營 ${G.num(K.maxDist)} 公里以內的航線`;
    return null;
  };
  G.setRouteBrand = (rid, brandId) => {
    const S = G.S, r = S.routes.find((x) => x.id === rid);
    if (!r) return { ok: false };
    const want = brandId || null, b = want ? G.brandById(want) : null;
    if (want && !b) return { ok: false, msg: '找不到這家子航空公司' };
    if ((r.brand || null) === want) return { ok: true };
    if (b) { const why = G.brandWhy(r, b); if (why) return { ok: false, msg: why }; }
    if (S.cash < G.BRAND.rebrand) return { ok: false, msg: `資金不足，需要 ${G.money(G.BRAND.rebrand)}` };
    G._spend(G.BRAND.rebrand, 'marketing');
    r.brand = want;
    if (r.autoFare && G.optimizeFares) G.optimizeFares(r);
    G.routeVer++; G.xferReset();
    log(`${r.a}–${r.b} 改由${b ? `「${b.name}」` : '主品牌'}經營（換裝與行銷費 ${G.money(G.BRAND.rebrand)}）`);
    emit('routes');
    return { ok: true };
  };
  // 結束子航空公司：航線全部回到主品牌，飛機重新塗裝
  G.closeBrand = (id) => {
    const S = G.S, b = G.brandById(id);
    if (!b) return { ok: false };
    const rs = S.routes.filter((r) => r.brand === id), ids = new Set(rs.map((r) => r.id));
    const n = S.fleet.filter((a) => ids.has(a.route)).length, cost = n * (G.REPAINT_COST || 120e3);
    if (S.cash < cost) return { ok: false, msg: `資金不足：${n} 架飛機重新塗裝需要 ${G.money(cost)}` };
    if (cost) G._spend(cost, 'marketing');
    rs.forEach((r) => { r.brand = null; if (r.autoFare && G.optimizeFares) G.optimizeFares(r); });
    S.brands = S.brands.filter((x) => x !== b);
    G.routeVer++; G.xferReset();
    log(`「${b.name}」併入主品牌：${rs.length} 條航線改由主品牌經營，${n} 架飛機重新塗裝（${G.money(cost)}）`);
    emit('routes');
    return { ok: true, routes: rs.length, cost };
  };
  // 子航空公司航線：票價依類型打折（攬客以實際票價計算）、商務客比例、併購品牌在母國的忠誠度
  const seg0 = G.segShare;
  G.segShare = (r, seg, cls, tier, freq, pen) => {
    const b = G.brandOf(r);
    if (!b) return seg0(r, seg, cls, tier, freq, pen);
    const K = G.BRAND_KINDS[b.kind], f = K.fare;
    const r2 = f === 1 ? r : Object.assign({}, r, { fare: { F: r.fare.F * f, J: r.fare.J * f, W: r.fare.W * f, Y: r.fare.Y * f } });
    let v = seg0(r2, seg, cls, tier, freq, pen) * (seg === 'B' ? K.biz : 1);
    if (b.from && b.home && (G.AP[r.a].cc === b.home || G.AP[r.b].cc === b.home)) v *= 1 + G.BRAND_KINDS.acq.home; // 併購保留品牌：在母國的忠誠度
    return v;
  };
  G.cateringLcc = (cls, h, pax) => {
    const n = G.mealsPerFlight(h), bob = G.MEALS.bob;
    return { cost: 0, anc: pax * G.BOB.buyRate * G.BOB.margin * n * 1.3 * G.fmod('ancillary'), mult: clamp(1 + 0.3 * (bob.score - G.mealExpect(cls, h) * 0.6), 0.85, 1.1) };
  };
  const rf0 = G.routeFno;
  G.routeFno = (r) => { const s = rf0(r), b = G.brandOf(r); return b && s ? s.replace(G.S.company.code, b.code) : s; };
  // 每天：子航空公司的固定管理成本
  function brandsDaily(S) {
    const n = (S.brands || []).length;
    if (n) G._spend((n * G.BRAND.fixed) / 30, 'overhead');
  }
  // 舊存檔：v1.0.0 開發中的單一子品牌（S.lcc）轉成子航空公司清單
  G.fixV10 = (S) => {
    S.brands = S.brands || [];
    if (S.lcc) { S.brands.unshift({ id: 'lcc', kind: 'lcc', name: S.lcc.name, code: S.lcc.code, color: S.lcc.color, since: S.lcc.since }); delete S.lcc; }
  };

  // ====================================================================
  // 時刻帶（管制機場）
  // ====================================================================
  // 價格：每一個「每日來回」時刻帶的市場價格（美元）
  G.SLOT_AP = { LHR: 30e6, HND: 20e6, LGW: 8e6, JFK: 10e6, LGA: 6e6, DCA: 5e6, EWR: 5e6, ORD: 3e6, AMS: 6e6, CDG: 7e6, ORY: 4e6, FRA: 6e6, MUC: 4e6, FCO: 3e6, MAD: 3e6, BCN: 3e6, ZRH: 4e6, DUS: 3e6, VIE: 2e6, HKG: 10e6, PEK: 5e6, PVG: 5e6, CAN: 3e6, NRT: 4e6, KIX: 2e6, ICN: 4e6, TPE: 3e6, TSA: 2e6, SIN: 4e6, BKK: 3e6, SYD: 5e6, DXB: 5e6, BOM: 4e6, DEL: 3e6, MNL: 3e6, CGK: 3e6, IST: 3e6, GRU: 3e6, MEX: 4e6 };
  G.SLOT = { hubGrant: 12, secondGrant: 6, sell: 0.8, buffer: 2, entrant: 4 }; // entrant：新進業者第一次飛這座機場時，免費分配的時刻帶（歐盟規則：每季釋出的時刻帶一半保留給新進業者）
  G.isSlotAp = (iata) => G.SLOT_AP[iata] != null;
  G.slots = (iata) => ((G.S.slots || {})[iata] || { held: 0, peak: 0, cost: 0 });
  // 這個機場目前需要的時刻帶：每架執飛飛機每天的來回班次加總（含全貨機）
  G.slotNeed = (iata, exceptAc) => {
    let n = 0;
    G.S.routes.forEach((r) => {
      if (r.a !== iata && r.b !== iata) return;
      G.routeAircraft(r).forEach((ac) => { if (ac !== exceptAc && !ac.grounded) n += freqOf(ac, r); });
    });
    return n;
  };
  const ensureSlot = (iata) => { const S = G.S; S.slots = S.slots || {}; return (S.slots[iata] = S.slots[iata] || { held: 0, peak: 0, cost: 0 }); };
  G.grantSlots = (iata, n, why) => { if (!G.isSlotAp(iata) || n <= 0) return; const s = ensureSlot(iata); s.held += n; if (why) log(`${why}：取得 ${iata} 時刻帶 ${n} 個`); };
  G.slotPrice = (iata) => G.SLOT_AP[iata] * (((G.S.slotMkt || {})[iata] || { m: 1 }).m || 1);
  G.slotAvail = (iata) => ((G.S.slotMkt || {})[iata] || { n: 0 }).n;
  G.buySlot = (iata) => {
    const S = G.S;
    if (!G.isSlotAp(iata)) return { ok: false, msg: '這座機場不需要時刻帶' };
    if (G.slotAvail(iata) <= 0) return { ok: false, msg: `${iata} 這一季沒有釋出的時刻帶，下季再來看看` };
    const p = G.slotPrice(iata);
    if (S.cash < p) return { ok: false, msg: `資金不足，需要 ${G.money(p)}` };
    G._spend(p, 'capex');
    const s = ensureSlot(iata); s.held++; s.cost += p;
    S.fin.slotBook = (S.fin.slotBook || 0) + p;
    S.slotMkt[iata].n--;
    log(`買進 ${iata} 時刻帶 1 個（${G.money(p)}），目前持有 ${s.held} 個`);
    return { ok: true };
  };
  G.sellSlot = (iata) => {
    const S = G.S, s = G.slots(iata);
    if (s.held <= 0) return { ok: false, msg: '沒有時刻帶可以賣' };
    if (s.held - 1 < Math.ceil(G.slotNeed(iata) - 1e-6)) return { ok: false, msg: '賣掉後時刻帶不夠目前的班次使用' };
    const p = G.slotPrice(iata) * G.SLOT.sell, basis = s.held ? s.cost / s.held : 0;
    s.held--; s.cost -= basis;
    S.fin.slotBook = Math.max(0, (S.fin.slotBook || 0) - basis);
    G.cashIn(p, 'sale'); S.day.gain = (S.day.gain || 0) + (p - basis);
    log(`賣出 ${iata} 時刻帶 1 個，得款 ${G.money(p)}`);
    return { ok: true };
  };
  // 新進業者：第一次需要這座機場的時刻帶時，機場免費分配幾個
  function entrantGrant(iata) {
    const s = ensureSlot(iata);
    if (s.entrant) return;
    s.entrant = true;
    if (s.held < G.SLOT.entrant) { const n = G.SLOT.entrant - s.held; s.held += n; log(`${iata} 時刻帶協調機構以新進業者身分分配給你 ${n} 個時刻帶（免費）`); }
  }
  // 指派飛機前先檢查兩端的時刻帶
  G.slotWhy = (ac, r) => {
    if (!G.S.slots) return null;
    const t = G.TYPES[ac.type], d = G.legKm(G.AP[r.a], G.AP[r.b]), f = 1440 / (2 * (G.blockMinutes(t, d) + G.turnMinutes(t)));
    for (const iata of [r.a, r.b]) {
      if (!G.isSlotAp(iata) || G.S.hubs[iata]) continue; // 你的樞紐有長期分配的時刻帶
      entrantGrant(iata);
      const need = G.slotNeed(iata, ac) + f, held = G.slots(iata).held;
      if (Math.ceil(need - 0.05) > held) return `${iata} 是時刻帶管制機場：這架飛機每天約 ${f.toFixed(1)} 個來回，總共需要 ${Math.ceil(need - 0.05)} 個時刻帶，你只有 ${held} 個。可以到「機場」頁購買，或改派其他航線。`;
    }
    return null;
  };
  const assign0 = G.assign;
  G.assign = (acId, routeId) => {
    if (routeId != null) {
      const S = G.S, ac = S.fleet.find((a) => a.id === acId), r = S.routes.find((x) => x.id === routeId);
      if (ac && r && ac.route !== routeId) { const why = G.slotWhy(ac, r); if (why) return { ok: false, msg: why }; }
    }
    return assign0(acId, routeId);
  };
  function refreshSlotMarket(S) {
    S.slotMkt = {};
    Object.keys(G.SLOT_AP).forEach((k) => (S.slotMkt[k] = { n: Math.random() < 0.35 ? 0 : 1 + Math.floor(Math.random() * 3), m: +rnd(0.8, 1.3).toFixed(2) }));
    S.slotMktAt = S.time;
  }
  G.initSlots = (S, grandfather) => {
    if (S.slots) return;
    S.slots = {};
    const prev = G.S; G.S = S;
    Object.keys(G.SLOT_AP).forEach((iata) => {
      if (S.hubs[iata]) return; // 樞紐不受限
      const need = grandfather ? Math.ceil(G.slotNeed(iata) - 0.05) : 0;
      if (need > 0) S.slots[iata] = { held: need + G.SLOT.buffer, peak: need, cost: 0, entrant: true };
    });
    refreshSlotMarket(S);
    G.S = prev;
  };
  function slotsDaily(S) {
    if (!S.slots) G.initSlots(S, true);
    Object.keys(S.slots).forEach((k) => { const s = S.slots[k]; if (!S.hubs[k]) s.peak = Math.max(s.peak || 0, G.slotNeed(k)); });
    const d = new Date(S.time), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (day === 1 && (m === 1 || m === 4 || m === 7 || m === 10)) refreshSlotMarket(S);
    // 航季結束（3 月底、10 月底）：用不到的時刻帶收回一半（用進廢退）
    if (day === 1 && (m === 4 || m === 11)) {
      Object.entries(S.slots).forEach(([k, s]) => {
        if (S.hubs[k]) { s.peak = 0; return; }
        const excess = s.held - Math.ceil(s.peak - 0.05) - G.SLOT.buffer;
        if (excess > 1) {
          const lose = Math.floor(excess / 2), basis = s.held ? (s.cost / s.held) * lose : 0;
          s.held -= lose; s.cost -= basis; S.fin.slotBook = Math.max(0, (S.fin.slotBook || 0) - basis); S.day.gain = (S.day.gain || 0) - basis;
          log(`航季結束：${k} 有 ${lose} 個時刻帶長期沒用，被機場收回（用進廢退）`, 'warn');
        }
        s.peak = G.slotNeed(k);
      });
    }
  }

  // ====================================================================
  // 新機訂購：排隊交機
  // ====================================================================
  G.ORDER = { deposit: 0.2, lead: { turboprop: 5, regional: 8, narrow: 12, wide: 16, freighter: 14 }, disc: 0.06, discPer: 0.01, discMax: 0.15, leaseDisc: 0.08, delayP: 0.15 };
  G.leadMonths = (typeId) => {
    const t = G.TYPES[typeId], S = G.S, y = new Date(S.time).getUTCFullYear();
    const base = G.ORDER.lead[t.freighter ? 'freighter' : t.body === 'turboprop' ? 'turboprop' : t.body === 'regional' ? 'regional' : t.wide ? 'wide' : 'narrow'];
    let h = 0; for (const ch of typeId + y) h = (h * 31 + ch.charCodeAt(0)) % 1000; // 每年每個機型的訂單積壓不同
    return Math.round(base * (0.75 + (h / 1000) * 0.65));
  };
  G.orderDiscount = (n) => Math.min(G.ORDER.discMax, G.ORDER.disc + G.ORDER.discPer * (Math.max(1, n) - 1));
  G.placeOrder = (typeId, mode, n, cabin) => {
    const S = G.S, t = G.TYPES[typeId], X = G.ORDER;
    n = clamp(Math.round(n || 1), 1, 50);
    if (t.used) return { ok: false, msg: '停產機型只能從二手市場取得' };
    const months = G.leadMonths(typeId), disc = G.orderDiscount(n);
    const unit = t.price * 1e6 * (1 - disc), dep = mode === 'buy' ? unit * X.deposit : 0;
    if (S.cash < dep * n) return { ok: false, msg: `資金不足，訂金需要 ${G.money(dep * n)}` };
    S.orders = S.orders || [];
    if (dep) { G._spend(dep * n, 'capex'); S.fin.prepay = (S.fin.prepay || 0) + dep * n; }
    const due = S.time + months * 30 * DAY;
    for (let i = 0; i < n; i++) {
      const delay = Math.random() < X.delayP ? Math.round(rnd(1, 4)) : 0;
      S.orders.push({ id: (S.orderSeq = (S.orderSeq || 0) + 1), type: typeId, mode, unit, dep, lease: mode === 'lease' ? G.leaseMonthly(t) * (1 - X.leaseDisc) : 0, cabin: cabin ? JSON.parse(JSON.stringify(cabin)) : null, placed: S.time, due: due + i * 7 * DAY, delay, told: false });
    }
    log(`向 ${t.mfr} 訂購 ${n} 架 ${t.model}（${mode === 'buy' ? '購買' : '租賃'}），折扣 ${Math.round(disc * 100)}%，預計 ${months} 個月後開始交機${dep ? `；已付訂金 ${G.money(dep * n)}` : ''}`);
    emit('fleet');
    return { ok: true, months, disc };
  };
  G.cancelOrder = (id) => {
    const S = G.S, o = (S.orders || []).find((x) => x.id === id);
    if (!o) return { ok: false };
    S.orders = S.orders.filter((x) => x !== o);
    if (o.dep) { S.fin.prepay -= o.dep; const back = o.dep * 0.5; G.cashIn(back, 'sale'); S.day.gain = (S.day.gain || 0) - (o.dep - back); }
    log(`取消 ${G.TYPES[o.type].model} 訂單${o.dep ? `，訂金退回一半 ${G.money(o.dep * 0.5)}` : ''}`);
    emit('fleet');
    return { ok: true };
  };
  function ordersDaily(S) {
    if (!S.orders || !S.orders.length) return;
    S.orders.slice().forEach((o) => {
      const t = G.TYPES[o.type];
      if (o.delay && !o.told && S.time >= o.due - 60 * DAY) { o.told = true; o.due += o.delay * 30 * DAY; log(`${t.mfr} 通知：${t.model} 交機延後 ${o.delay} 個月`, 'warn'); }
      if (S.time < o.due) return;
      if (o.mode === 'buy') {
        const rest = o.unit - o.dep;
        if (S.cash < rest) { if (!o.waitWarn || S.time - o.waitWarn > 15 * DAY) { o.waitWarn = S.time; log(`${t.model} 已可交機，但現金不足以支付尾款 ${G.money(rest)}，飛機暫存在工廠`, 'warn'); } return; }
        const r = G.acquire(o.type, 'buy', o.cabin, null, { price: rest });
        if (!r.ok) return;
        r.ac.cost = r.ac.book = o.unit; S.fin.prepay -= o.dep;
      } else {
        const r = G.acquire(o.type, 'lease', o.cabin, null, { lease: o.lease });
        if (!r.ok) { if (!o.waitWarn || S.time - o.waitWarn > 15 * DAY) { o.waitWarn = S.time; log(`${t.model} 已可交機，但現金不足以支付租賃保證金`, 'warn'); } return; }
      }
      S.orders = S.orders.filter((x) => x !== o);
      log(`${t.model} 交機（訂單 #${o.id}）`);
      emit('event', { kind: 'delivery', model: t.model });
    });
  }

  // ====================================================================
  // 每日
  // ====================================================================
  G.ops10Daily = () => {
    const S = G.S;
    slotsDaily(S);
    ordersDaily(S);
    brandsDaily(S);
  };
  G.initV10 = (S, migrating) => {
    S.diff = S.diff || 'normal';
    G.fixV10(S);
    S.orders = S.orders || [];
    if (S.fin) { S.fin.prepay = S.fin.prepay || 0; S.fin.slotBook = S.fin.slotBook || 0; }
    G.initSlots(S, !!migrating);
  };
})();
