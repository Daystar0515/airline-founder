// v1.0.0-rc2 突發事件：油價、政局動盪、外交風波、疫情、天災、航管罷工、景氣循環、大型活動、規費與供應鏈……
// 事件是「世界」的一部分：單人時由自己產生；多人連線時只有房主產生，再同步給所有人。
// 每個事件有影響範圍（全球、地區、國家、兩國之間、城市、機場）與效果：
//   L／B：觀光客／商務客需求倍率（作用在航線市場大小）
//   fuel：油價倍率；fare：票價（燃油附加費）倍率
//   closed：機場關閉；cancel：航班取消機率
//   cost：{ airport, maint, insurance } 成本倍率
// 效果在事件最後 30% 的期間逐步恢復；大型活動可以提前預告。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const wpick = (list) => { const tot = list.reduce((s, x) => s + x[1], 0); let r = Math.random() * tot; for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[list.length - 1][0]; };
  const cz = (cc) => G.countryZh(cc);
  const city = (ap) => ap.city.replace(/\s*\(.*\)/, '');
  const cityT = (ap) => { const c = city(ap); return /^[\x00-\x7f]/.test(c) ? ` ${c} ` : c; }; // 英文城市名前後留空白

  // ---------- 地區 ----------
  G.REGIONS = { EA: '東亞', SEA: '東南亞', SA: '南亞與中亞', ME: '中東', EU: '歐洲', AF: '非洲', NA: '北美', LA: '中南美洲', OC: '大洋洲' };
  const RG_CC = {
    EA: 'CN HK MO TW JP KR KP MN', SEA: 'VN TH MY SG ID PH KH LA MM BN TL', SA: 'IN PK BD LK NP BT MV AF KZ UZ TM KG TJ',
    ME: 'AE SA QA KW BH OM YE IQ IR IL JO LB SY PS', NA: 'US CA GL BM PM',
    OC: 'AU NZ FJ PG NC PF GU MP WS TO VU SB PW FM MH KI NR TV CK NU AS NF', EU: 'RU TR UA BY GE AM AZ IS CY',
  };
  const CC_RG = {};
  Object.entries(RG_CC).forEach(([rg, s]) => s.split(' ').forEach((cc) => (CC_RG[cc] = rg)));
  G.regionOf = (ap) => {
    if (CC_RG[ap.cc]) return CC_RG[ap.cc];
    if (ap.lon < -30) return 'LA';
    if (ap.lon > 110 && ap.lat < -10) return 'OC';
    if (ap.lat < 37 && ap.lon > -20 && ap.lon < 52) return 'AF';
    if (ap.lon < 60) return 'EU';
    if (ap.lon < 90) return 'SA';
    return ap.lat >= 20 ? 'EA' : 'SEA';
  };

  // ---------- 狀態 ----------
  const blank = (S) => ({ seq: 1, events: [], past: [], nextMajor: S.time + rnd(120, 180) * DAY, nextStorm: S.time + rnd(45, 75) * DAY, hedge: null, mit: {} });
  G.initWorld = (S) => { if (!S.world) S.world = blank(S); return S.world; };
  const W = () => G.initWorld(G.S);
  const client = () => !!(G.net && G.net.role === 'client');

  // 事件目前的強度：0 = 沒作用，1 = 全力；最後 30% 期間逐步恢復
  function strength(e, t) {
    if (t < e.start || t >= e.end) return 0;
    if (e.flat) return 1;
    const len = e.end - e.start, k = (t - e.start) / len;
    return k < 0.7 ? 1 : Math.max(0, (1 - k) / 0.3);
  }
  const lerp = (m, s) => 1 + (m - 1) * s;
  G.activeEvents = () => { const S = G.S; return S && S.world ? S.world.events.filter((e) => S.time >= e.start && S.time < e.end) : []; };
  G.upcomingEvents = () => { const S = G.S; return S && S.world ? S.world.events.filter((e) => S.time < e.start) : []; };

  // 範圍是否涵蓋這條航線（A、B 兩端）
  function covers(sc, A, B) {
    switch (sc.k) {
      case 'global': return true;
      case 'region': return G.regionOf(A) === sc.rg || G.regionOf(B) === sc.rg;
      case 'cc': return A.cc === sc.cc || B.cc === sc.cc;
      case 'pair': return (A.cc === sc.a && B.cc === sc.b) || (A.cc === sc.b && B.cc === sc.a);
      case 'out': return (A.cc === sc.cc) !== (B.cc === sc.cc); // 一端在本國、一端在國外
      case 'city': return (A._ck || (A._ck = G.cityKey(A))) === sc.key || (B._ck || (B._ck = G.cityKey(B))) === sc.key;
      case 'aps': return sc.list.includes(A.iata) || sc.list.includes(B.iata);
      default: return false;
    }
  }
  const coversAp = (sc, ap) => covers(sc, ap, ap);

  // ---------- 給模擬用的倍率 ----------
  // 每條航線的需求倍率（觀光 L／商務 B）；玩家的防疫或宣傳措施會減輕或放大
  let dmSig = '', dmCache = new Map();
  G.evDemand = (A, B, seg) => {
    const S = G.S;
    if (!S || !S.world || !S.world.events.length) return 1;
    // 每天、每條航線只算一次（事件清單或玩家的應對改變時重算）
    const sig = Math.floor(S.time / DAY) + '|' + S.world.seq + '|' + S.world.events.length + '|' + (S.world.mitVer || 0);
    if (sig !== dmSig) { dmSig = sig; dmCache = new Map(); }
    const key = A.iata + B.iata + seg, hit = dmCache.get(key);
    if (hit !== undefined) return hit;
    const v = demandNow(S, A, B, seg);
    dmCache.set(key, v);
    return v;
  };
  function demandNow(S, A, B, seg) {
    let m = 1;
    for (const e of S.world.events) {
      const v = e.fx[seg];
      if (v == null || v === 1) continue;
      const s = strength(e, S.time);
      if (!s || !covers(e.sc, A, B)) continue;
      let k = lerp(v, s);
      const mt = S.world.mit[e.id];
      if (mt && mt.damp && k < 1) k = 1 - (1 - k) * (1 - mt.damp); // 減輕衝擊
      if (mt && mt.boost && k > 1) k = 1 + (k - 1) * (1 + mt.boost); // 搶到更多商機
      m *= k;
    }
    return clamp(m, 0.2, 2.2);
  }
  // 油價：避險合約在有效期間把油價鎖在約定價格
  G.fuelMul = () => {
    const S = G.S;
    if (!S || !S.world) return 1;
    let m = 1;
    S.world.events.forEach((e) => { if (e.fx.fuel) { const s = strength(e, S.time); if (s) m *= lerp(e.fx.fuel, s); } });
    const h = S.world.hedge;
    if (h && S.time < h.until) m = h.lock;
    return m;
  };
  G.marketFuelMul = () => {
    const S = G.S;
    if (!S || !S.world) return 1;
    return S.world.events.reduce((m, e) => (e.fx.fuel && strength(e, S.time) ? m * lerp(e.fx.fuel, strength(e, S.time)) : m), 1);
  };
  G.fuelPrice = () => G.FUEL_PRICE * G.fuelMul();
  // 燃油附加費：大家都會跟著漲票價，所以收入也會小幅增加
  G.evFare = () => {
    const S = G.S;
    if (!S || !S.world) return 1;
    return S.world.events.reduce((m, e) => (e.fx.fare && strength(e, S.time) ? m * lerp(e.fx.fare, strength(e, S.time)) : m), 1);
  };
  G.evCost = (cat, A, B) => {
    const S = G.S;
    if (!S || !S.world) return 1;
    let m = 1;
    S.world.events.forEach((e) => {
      const v = e.fx.cost && e.fx.cost[cat];
      if (!v) return;
      const s = strength(e, S.time);
      if (!s) return;
      if (A && !covers(e.sc, A, B || A)) return;
      m *= lerp(v, s);
    });
    return m;
  };
  // 機場關閉（颱風、火山灰）
  G.evClosed = (iata) => {
    const S = G.S;
    if (!S || !S.world) return null;
    return S.world.events.find((e) => e.fx.closed && S.time >= e.start && S.time < e.end && e.sc.k === 'aps' && e.sc.list.includes(iata)) || null;
  };
  // 航班取消機率（航管罷工）
  G.evCancel = (A, B) => {
    const S = G.S;
    if (!S || !S.world) return 0;
    let p = 0;
    S.world.events.forEach((e) => { if (e.fx.cancel && S.time >= e.start && S.time < e.end && covers(e.sc, A, B)) p = 1 - (1 - p) * (1 - e.fx.cancel); });
    return p;
  };

  // ---------- 玩家的航網 ----------
  function network(S) {
    const aps = {}, ccs = {}, rgs = {};
    S.routes.forEach((r) => {
      const n = Math.max(0.5, G.routeFreq(r));
      [r.a, r.b].forEach((x) => { const ap = G.AP[x]; aps[x] = (aps[x] || 0) + n; ccs[ap.cc] = (ccs[ap.cc] || 0) + n; const rg = G.regionOf(ap); rgs[rg] = (rgs[rg] || 0) + n; });
    });
    Object.keys(S.hubs).forEach((h) => { aps[h] = (aps[h] || 0) + 5; const ap = G.AP[h]; ccs[ap.cc] = (ccs[ap.cc] || 0) + 5; const rg = G.regionOf(ap); rgs[rg] = (rgs[rg] || 0) + 5; });
    return { aps, ccs, rgs, home: G.homeCC() };
  }
  const topKeys = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  // 從玩家的航網挑國家（七成），或從主要國家隨機挑
  const BIG_CC = 'US CN JP KR TH VN SG MY ID PH IN AE GB FR DE IT ES TR AU CA MX BR HK TW'.split(' ');
  function pickCC(N, notHome) {
    const mine = Object.keys(N.ccs).filter((c) => !(notHome && c === N.home));
    if (mine.length && Math.random() < 0.75) return wpick(mine.map((c) => [c, Math.sqrt(N.ccs[c])]));
    const pool = BIG_CC.filter((c) => !(notHome && c === N.home));
    return pick(pool);
  }
  // 活火山附近的機場（火山爆發只會發生在這些地方）
  const VOLC = 'KOJ KMJ CTS HKD DPS JOG SOC MNL LGP KEF CTA NAP UIO MEX PBC GUA ANC ITO KOA SJO ROT TUO PMC ZAL GOM'.split(' ');
  // 會舉辦國際大型活動的城市
  const BIG_CITY = 'HND KIX ICN PEK PVG CAN HKG TPE SIN BKK KUL CGK MNL DEL BOM DXB DOH IST LHR CDG FRA AMS MAD BCN FCO MUC VIE JFK LAX ORD SFO YYZ YVR MEX GRU EZE SYD MEL AKL JNB CAI SGN HAN FUK CTS'.split(' ');
  const ATC = 'FR IT ES DE BE GR PT NL GB'.split(' ');

  // ---------- 事件種類 ----------
  // w：基本權重；make(S, N) 回傳事件內容（或 null 表示這次不適用）
  const TYPES = {
    'oil-up': { name: '油價飆升', icon: 'oil', w: 9, make: () => { const f = rnd(1.2, 1.45); return { sc: { k: 'global' }, days: rnd(75, 150), fx: { fuel: f, fare: 1 + (f - 1) * 0.2 }, sector: -0.05, sev: 'bad',
      title: '國際油價飆升', text: pick(['產油國宣布減產，國際原油價格一週內大漲', '中東產油區情勢緊張，國際油價急漲', '煉油廠接連停工，航空燃油供應吃緊']) + `，航空燃油價格上漲約 ${Math.round((f - 1) * 100)}%。各航空公司陸續調高燃油附加費。` }; } },
    'oil-down': { name: '油價下跌', icon: 'oil', w: 6, make: () => { const f = rnd(0.72, 0.86); return { sc: { k: 'global' }, days: rnd(90, 150), fx: { fuel: f, fare: 1 - (1 - f) * 0.1 }, sector: 0.03, sev: 'good',
      title: '國際油價走跌', text: `全球需求放緩、產油國增產，航空燃油價格下跌約 ${Math.round((1 - f) * 100)}%，燃油附加費跟著調降。` }; } },
    unrest: { name: '政局動盪', icon: 'flag', w: 8, make: (S, N) => { const cc = pickCC(N, true); return { sc: { k: 'cc', cc }, days: rnd(30, 90), fx: { L: rnd(0.5, 0.7), B: rnd(0.7, 0.85) }, sev: 'bad',
      title: `${cz(cc)}政局動盪`, text: `${cz(cc)}${pick(['爆發大規模示威，多國發布旅遊警示', '執政聯盟瓦解、政局不穩，各地出現抗議活動', '選後爭議延燒，首都出現大規模集會'])}。往返${cz(cc)}的觀光客大減，商務出差也延後。` }; } },
    diplomacy: { name: '外交風波', icon: 'flag', w: 5, make: (S, N) => {
      const others = Object.keys(N.ccs).filter((c) => c !== N.home);
      if (!others.length) return null;
      const cc = wpick(others.map((c) => [c, Math.sqrt(N.ccs[c])]));
      const cs = ['TW', 'CN', 'HK', 'MO'], strait = cs.includes(N.home) && cs.includes(cc) && (N.home === 'TW') !== (cc === 'TW');
      const title = strait ? '兩岸關係緊張' : `${cz(N.home)}與${cz(cc)}外交關係緊張`;
      const text = strait ? `兩岸關係升溫緊張，雙方${pick(['暫停部分觀光團往來', '互相發布旅遊提醒', '收緊人員往來審查'])}，往返兩地的旅遊與商務需求明顯降溫。`
        : `${cz(N.home)}與${cz(cc)}${pick(['因貿易爭端互相加徵關稅', '因外交人員事件互召大使', '互相發布旅遊警示'])}，兩地之間的旅遊與商務往來明顯降溫。`;
      return { sc: { k: 'pair', a: N.home, b: cc }, days: rnd(90, 240), fx: { L: rnd(0.5, 0.7), B: rnd(0.75, 0.9) }, sev: 'bad', title, text }; } },
    outbreak: { name: '傳染病疫情', icon: 'virus', w: 3, make: (S, N) => {
      const rg = Object.keys(N.rgs).length && Math.random() < 0.8 ? wpick(Object.entries(N.rgs).map(([k, v]) => [k, Math.sqrt(v)])) : pick(Object.keys(G.REGIONS));
      return { sc: { k: 'region', rg }, days: rnd(60, 150), fx: { L: rnd(0.5, 0.7), B: rnd(0.65, 0.85), C: rnd(1.1, 1.25) }, sector: -0.04, sev: 'bad',
        title: `${G.REGIONS[rg]}爆發傳染病疫情`, text: `${G.REGIONS[rg]}出現新型呼吸道傳染病群聚，多國提高防疫等級。旅客取消行程，進出${G.REGIONS[rg]}的航班訂位大幅下滑。` }; } },
    recession: { name: '經濟衰退', icon: 'chart', w: 4, make: (S, N) => {
      const glob = Math.random() < 0.3;
      const rg = glob ? null : (Object.keys(N.rgs).length ? wpick(Object.entries(N.rgs).map(([k, v]) => [k, Math.sqrt(v)])) : pick(Object.keys(G.REGIONS)));
      return { sc: glob ? { k: 'global' } : { k: 'region', rg }, days: rnd(150, 300), fx: { L: rnd(0.88, 0.96), B: rnd(0.75, 0.88) }, sector: -0.06, bear: true, sev: 'bad',
        title: glob ? '全球經濟衰退' : `${G.REGIONS[rg]}經濟衰退`, text: `${glob ? '全球' : G.REGIONS[rg]}景氣急凍，企業縮減差旅預算，商務客明顯減少，觀光客也更精打細算。` }; } },
    boom: { name: '旅遊熱潮', icon: 'sun', w: 7, make: (S, N) => { const cc = pickCC(N, true); return { sc: { k: 'cc', cc }, days: rnd(60, 150), fx: { L: rnd(1.2, 1.4) }, sev: 'good',
      title: `${cz(cc)}掀起旅遊熱潮`, text: `${cz(cc)}${pick(['貨幣大幅貶值，出國旅客把它列為首選', '熱門影集在當地取景，帶動朝聖人潮', '宣布放寬觀光簽證', '推出大規模觀光補助'])}，前往${cz(cc)}的觀光客明顯增加。` }; } },
    expo: { name: '國際大型活動', icon: 'star', w: 5, make: (S, N) => {
      const big = BIG_CITY.map((x) => G.AP[x]).filter(Boolean);
      const pool = big.filter((a) => N.aps[a.iata]);
      const ap = pool.length && Math.random() < 0.8 ? pick(pool) : pick(big);
      const what = pick(['世界博覽會', '國際運動賽事', '世界巡迴演唱會', '國際影展與藝術節', '大型國際會議']);
      return { sc: { k: 'city', key: G.cityKey(ap) }, lead: rnd(20, 45), days: rnd(10, 30), flat: true, fx: { L: rnd(1.4, 1.8), B: rnd(1.1, 1.3) }, sev: 'good', where: ap.iata,
        title: `${cityT(ap)}舉辦${what}`, text: `${cityT(ap)}將舉辦${what}，預計吸引大批旅客湧入，活動期間往返${cityT(ap)}（${ap.iata}）的機位一位難求。` }; } },
    currency: { name: '匯率變動', icon: 'chart', w: 4, make: (S, N) => { const up = Math.random() < 0.55; return { sc: { k: 'out', cc: N.home }, days: rnd(90, 180), fx: { L: up ? rnd(1.1, 1.2) : rnd(0.86, 0.93) }, sev: up ? 'good' : 'bad',
      title: up ? `${cz(N.home)}貨幣升值` : `${cz(N.home)}貨幣貶值`, text: up ? `${cz(N.home)}貨幣走強，出國旅遊變便宜，國際線觀光需求升溫。` : `${cz(N.home)}貨幣走弱，出國旅遊變貴，國際線觀光需求轉弱。` }; } },
    election: { name: '大選', icon: 'flag', w: 3, make: (S, N) => ({ sc: { k: 'cc', cc: N.home }, days: rnd(30, 50), fx: { B: rnd(0.88, 0.95) }, sev: 'bad',
      title: `${cz(N.home)}舉行大選`, text: `${cz(N.home)}大選前後，企業觀望、延後投資與出差，商務旅客小幅減少。` }) },
    ecom: { name: '電商貨運熱潮', icon: 'star', w: 3, make: (S, N) => { const glob = Math.random() < 0.4; const rg = glob ? null : pick(['EA', 'SEA', 'NA', 'EU']); const m = rnd(1.2, 1.45); return { sc: glob ? { k: 'global' } : { k: 'region', rg }, days: rnd(90, 180), fx: { C: m }, sev: 'good',
      title: glob ? '跨境電商帶動全球航空貨運' : `${G.REGIONS[rg]}跨境電商貨量暴增`, text: `${glob ? '全球' : G.REGIONS[rg]}跨境電商與半導體出貨大增，航空貨運需求上升約 ${Math.round((m - 1) * 100)}%，貨機艙位搶手。` }; } },
    fees: { name: '機場規費調漲', icon: 'coin', w: 4, make: (S, N) => { const cc = Math.random() < 0.5 ? N.home : pickCC(N, false); const m = rnd(1.12, 1.3); return { sc: { k: 'cc', cc }, days: 365, flat: true, fx: { cost: { airport: m } }, sev: 'bad',
      title: `${cz(cc)}調漲機場與航路規費`, text: `${cz(cc)}民航主管機關宣布，起降費、旅客服務費與航路費調漲約 ${Math.round((m - 1) * 100)}%，為期一年。` }; } },
    parts: { name: '零件短缺', icon: 'gear', w: 3, make: () => { const m = rnd(1.2, 1.35); return { sc: { k: 'global' }, days: rnd(120, 240), fx: { cost: { maint: m } }, sev: 'bad',
      title: '飛機零件供應短缺', text: `引擎與航材供應鏈吃緊，航材價格上漲約 ${Math.round((m - 1) * 100)}%，航線維修成本跟著提高。` }; } },
    insurance: { name: '保險費率上調', icon: 'shield', w: 3, make: () => { const m = rnd(1.2, 1.45); return { sc: { k: 'global' }, days: rnd(180, 365), fx: { cost: { insurance: m } }, sev: 'bad',
      title: '航空保險費率上調', text: `國際再保險市場緊縮，機身險與責任險費率上調約 ${Math.round((m - 1) * 100)}%。` }; } },
    atc: { name: '航管罷工', icon: 'tower', w: 4, make: (S, N) => {
      const mine = ATC.filter((c) => N.ccs[c]);
      const cc = mine.length && Math.random() < 0.7 ? pick(mine) : Math.random() < 0.5 ? pick(ATC) : pickCC(N, false);
      return { sc: { k: 'cc', cc }, days: rnd(2, 5), flat: true, fx: { cancel: rnd(0.35, 0.6) }, sev: 'bad',
        title: `${cz(cc)}航管人員罷工`, text: `${cz(cc)}航管人員發動罷工，進出${cz(cc)}的航班大量取消或延誤，預計持續數天。` }; } },
    volcano: { name: '火山爆發', icon: 'volcano', w: 2, make: (S, N) => {
      const vs = VOLC.map((x) => G.AP[x]).filter(Boolean);
      const near = vs.filter((v) => Object.keys(N.aps).some((x) => G.dist(G.AP[x], v) < 400));
      const base = near.length && Math.random() < 0.7 ? pick(near) : pick(vs);
      if (!base) return null;
      const list = G.AIRPORTS.filter((a) => G.dist(a, base) < 160).sort((a, b) => G.dist(a, base) - G.dist(b, base)).map((a) => a.iata).slice(0, 12);
      return { sc: { k: 'aps', list }, days: rnd(3, 6), flat: true, fx: { closed: true }, sev: 'bad', where: base.iata, radius: 160, wx: '火山灰',
        title: `${cityT(base)}附近火山爆發`, text: `${cityT(base)}附近火山噴發，火山灰籠罩空域，周邊 ${list.length} 座機場暫停起降，航空公司紛紛取消航班。` }; } },
  };
  // 颱風、暴風雪、濃霧等天氣事件：只發生在玩家航網的機場，關閉 1–3 天
  function makeStorm(S, N) {
    const keys = Object.keys(N.aps);
    if (!keys.length) return null;
    const ap = G.AP[wpick(keys.map((k) => [k, Math.sqrt(N.aps[k])]))];
    const mon = new Date(S.time).getUTCMonth() + 1;
    const lat = Math.abs(ap.lat), north = ap.lat >= 0;
    const summer = north ? mon >= 6 && mon <= 10 : mon >= 12 || mon <= 4;
    const winter = north ? mon === 12 || mon <= 2 : mon >= 6 && mon <= 8;
    let kind;
    if (summer && lat >= 10 && lat <= 35 && (ap.lon > 95 || ap.lon < -60)) kind = ap.lon > 95 ? '颱風' : '颶風';
    else if (winter && lat >= 38) kind = '暴風雪';
    else if (lat < 30 && ap.lon > 30 && ap.lon < 60) kind = '沙塵暴';
    else kind = pick(['強烈雷雨', '濃霧', '強風']);
    const radius = kind === '颱風' || kind === '颶風' ? 300 : kind === '暴風雪' ? 150 : 40;
    const list = G.AIRPORTS.filter((a) => G.dist(a, ap) < radius && (a.size <= 1 || a.iata === ap.iata)).map((a) => a.iata).slice(0, 25);
    const days = kind === '颱風' || kind === '颶風' ? rnd(1, 2.5) : kind === '暴風雪' ? rnd(1, 2) : rnd(0.4, 1);
    return { type: 'storm', name: '天候', icon: 'storm', sc: { k: 'aps', list }, days, flat: true, fx: { closed: true }, sev: 'bad', where: ap.iata, radius, wx: kind,
      title: `${kind}襲擊${cityT(ap)}`, text: `${kind}影響${cityT(ap)}一帶，${list.length > 1 ? `${ap.iata} 等 ${list.length} 座機場` : `${ap.iata}`}暫停起降約 ${Math.max(1, Math.round(days * 24))} 小時，航空公司紛紛取消航班。` };
  }

  // ---------- 玩家可以採取的應對 ----------
  const sizeCost = (base) => base * Math.max(1, G.S.fleet.length / 3);
  const fuelPerDay = () => { const d = G.S.days.slice(-30); return d.length ? d.reduce((s, x) => s + ((x.cost && x.cost.fuel) || 0), 0) / d.length : 0; };
  G.eventOptions = (e) => {
    const S = G.S, mine = G.eventHitsMe(e);
    const o = [];
    if (e.type === 'oil-up' && !(S.world.hedge && S.time < S.world.hedge.until)) {
      const cost = fuelPerDay() * 90 * (e.fx.fuel - 1) * 0.55;
      if (cost > 0) o.push({ key: 'hedge', label: '買進燃油避險合約', hint: `花費約 ${G.money(cost)}，未來 90 天油價鎖在比漲價前高 5% 的水準`, cost, hedge: { lock: 1.05, days: 90 } });
    }
    if (e.type === 'oil-down' && !(S.world.hedge && S.time < S.world.hedge.until)) {
      const cost = fuelPerDay() * 180 * 0.03;
      if (cost > 0) o.push({ key: 'hedge', label: '趁低價簽下避險合約', hint: `花費約 ${G.money(cost)}，未來 180 天油價鎖在目前的低價（之後就算油價回升也不怕）`, cost, hedge: { lock: e.fx.fuel, days: 180 } });
    }
    if (!mine) return o;
    if (e.type === 'outbreak') o.push({ key: 'sanitize', label: '加強機艙消毒並提供彈性退票', hint: `花費約 ${G.money(sizeCost(400e3))}，旅客比較敢搭你的航班：需求衰退減輕 35%，社會評價小幅上升`, cost: sizeCost(400e3), mit: { damp: 0.35 }, rep: 1.5 });
    if (e.type === 'storm' || e.type === 'volcano' || e.type === 'atc') o.push({ key: 'waiver', label: '宣布受影響旅客免費改票退票', hint: `花費約 ${G.money(sizeCost(e.type === 'storm' ? 120e3 : 250e3))}，社會評價上升`, cost: sizeCost(e.type === 'storm' ? 120e3 : 250e3), rep: 1.5 });
    if (e.type === 'unrest' || e.type === 'diplomacy') o.push({ key: 'refund', label: '開放受影響航線免費退票', hint: `花費約 ${G.money(sizeCost(150e3))}，旅客信任度提升：需求衰退減輕 15%`, cost: sizeCost(150e3), mit: { damp: 0.15 }, rep: 1 });
    if (e.type === 'boom' || e.type === 'expo') o.push({ key: 'promo', label: '推出相關旅遊套裝與廣告', hint: `花費約 ${G.money(sizeCost(e.type === 'expo' ? 120e3 : 200e3))}，你搶到的商機多 40%`, cost: sizeCost(e.type === 'expo' ? 120e3 : 200e3), mit: { boost: 0.4 } });
    if (e.type === 'recession') o.push({ key: 'promo', label: `推出${G.cname('Y')}優惠票`, hint: '兩個月內訂位 +8%，但票價收益 −5%', social: { demand: 1.08, yield: 0.95, days: 60 } });
    return o;
  };
  G.eventRespond = (id, key) => {
    const S = G.S, w = W(), e = w.events.find((x) => x.id === id);
    if (!e) return { ok: false, msg: '事件已經結束' };
    w.answered = w.answered || {};
    if (w.answered[id]) return { ok: false, msg: '已經回應過了' };
    if (key === 'none') { w.answered[id] = 'none'; return { ok: true }; }
    const o = G.eventOptions(e).find((x) => x.key === key);
    if (!o) return { ok: false, msg: '這個選項已經不能用了' };
    if (o.cost && S.cash < o.cost) return { ok: false, msg: `現金不足，需要 ${G.money(o.cost)}` };
    if (o.cost) G._spend(o.cost, o.hedge ? 'fuel' : 'marketing');
    if (o.hedge) w.hedge = { lock: o.hedge.lock, until: S.time + o.hedge.days * DAY, since: S.time };
    if (o.mit) { w.mit[id] = { ...(w.mit[id] || {}), ...o.mit }; w.mitVer = (w.mitVer || 0) + 1; }
    if (o.rep) G.repDelta(o.rep);
    if (o.social && G.socialEffect) G.socialEffect(o.social);
    w.answered[id] = key;
    if (o.hedge) S.stats && (S.stats.hedges = (S.stats.hedges || 0) + 1);
    G.log(`回應「${e.title}」：${o.label}${o.cost ? `（${G.money(o.cost)}）` : ''}`);
    return { ok: true, label: o.label };
  };
  // 這個事件有沒有打到玩家的航網
  G.eventHitsMe = (e) => {
    const S = G.S;
    if (e.sc.k === 'global') return true;
    if (e.sc.k === 'aps') return e.sc.list.some((x) => S.hubs[x] || S.routes.some((r) => r.a === x || r.b === x));
    return S.routes.some((r) => covers(e.sc, G.AP[r.a], G.AP[r.b]));
  };
  // 效果的文字說明（給介面用）
  G.eventEffects = (e) => {
    const f = e.fx, out = [];
    const p = (m) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;
    if (f.fuel) out.push([`油價 ${p(f.fuel)}`, f.fuel > 1 ? 'bad' : 'good']);
    if (f.fare) out.push([`票價附加費 ${p(f.fare)}`, f.fare > 1 ? 'good' : 'bad']);
    if (f.L) out.push([`觀光需求 ${p(f.L)}`, f.L > 1 ? 'good' : 'bad']);
    if (f.B) out.push([`商務需求 ${p(f.B)}`, f.B > 1 ? 'good' : 'bad']);
    if (f.C) out.push([`貨運需求 ${p(f.C)}`, f.C > 1 ? 'good' : 'bad']);
    if (f.closed) out.push([`${e.sc.list.length} 座機場關閉`, 'bad']);
    if (f.cancel) out.push([`約 ${Math.round(f.cancel * 100)}% 航班取消`, 'bad']);
    if (f.cost && f.cost.airport) out.push([`機場規費 ${p(f.cost.airport)}`, 'bad']);
    if (f.cost && f.cost.maint) out.push([`航線維修成本 ${p(f.cost.maint)}`, 'bad']);
    if (f.cost && f.cost.insurance) out.push([`保險費 ${p(f.cost.insurance)}`, 'bad']);
    return out;
  };
  G.eventScopeText = (e) => {
    const sc = e.sc;
    return { global: '全球', region: G.REGIONS[sc.rg], cc: cz(sc.cc), pair: `${cz(sc.a)} ⇄ ${cz(sc.b)}`, out: `${cz(sc.cc)}的國際線`, city: e.where ? city(G.AP[e.where]) : '', aps: sc.list ? sc.list.slice(0, 6).join('、') + (sc.list.length > 6 ? ` 等 ${sc.list.length} 座` : '') : '' }[sc.k] || '';
  };

  // ---------- 產生事件 ----------
  function startEvent(S, type, body) {
    const w = W();
    const lead = (body.lead || 0) * DAY;
    // v1.0.0 難度：事件的衝擊放大或縮小
    const sev = G.dmod ? G.dmod('sev') : 1;
    if (sev !== 1) { ['L', 'B', 'C', 'fuel'].forEach((k) => { if (body.fx[k]) body.fx[k] = Math.max(0.1, 1 + (body.fx[k] - 1) * sev); }); if (body.fx.cost) Object.keys(body.fx.cost).forEach((k) => (body.fx.cost[k] = 1 + (body.fx.cost[k] - 1) * sev)); }
    const tidy = (x) => x.trim().replace(/ +([，。、（）])/g, '$1').replace(/([，。、（）]) +/g, '$1');
    const e = { id: w.seq++, type, name: body.name || TYPES[type].name, icon: body.icon || TYPES[type].icon, title: tidy(body.title), text: tidy(body.text), sc: body.sc, fx: body.fx, sev: body.sev, flat: !!body.flat, where: body.where || null,
      announced: S.time, start: S.time + lead, end: S.time + lead + body.days * DAY };
    w.events.push(e);
    // 股市：航空類股受到消息影響
    if (body.sector && S.mkt) { S.mkt.sector += body.sector; if (body.bear) S.mkt.regime = 'bear'; if (G.marketNews) G.marketNews(`${e.title}，航空類股${body.sector < 0 ? '應聲下跌' : '走揚'}`, null, body.sector); }
    announce(S, e);
    return e;
  }
  function announce(S, e) {
    const mine = G.eventHitsMe(e);
    G.log(`【${e.name}】${e.title}${e.start > S.time ? `（${Math.round((e.start - S.time) / DAY)} 天後開始）` : ''}`, e.sev === 'bad' && mine ? 'warn' : 'info');
    if (mine && e.type !== 'storm' && G.addTimeline) G.addTimeline('world', e.title);
    if (G.socialBreaking) G.socialBreaking(e, mine);
    G._emit('event', { kind: 'world', ev: e, mine });
  }
  G.worldDaily = () => {
    const S = G.S, w = W();
    // 結束的事件移到歷史
    const done = w.events.filter((e) => S.time >= e.end);
    if (done.length) {
      w.events = w.events.filter((e) => S.time < e.end);
      done.forEach((e) => { w.past.unshift({ id: e.id, type: e.type, name: e.name, title: e.title, start: e.start, end: e.end, sev: e.sev }); delete w.mit[e.id]; if (w.answered) delete w.answered[e.id]; if (e.type !== 'storm' && G.eventHitsMe(e)) G.log(`${e.title}的影響已經結束`); });
      w.past = w.past.slice(0, 30);
      G._emit('event', { kind: 'world-end', n: done.length });
    }
    if (w.hedge && S.time >= w.hedge.until) { G.log('燃油避險合約到期'); w.hedge = null; }
    // 成就「逆風高飛」：疫情或衰退打到你的航網時，月結仍然獲利
    if (new Date(S.time).getUTCDate() === 2 && S.stats && S.fin && S.fin.statements.length) {
      const crisis = w.events.some((e) => (e.type === 'outbreak' || e.type === 'recession') && S.time - e.start > 20 * DAY && G.eventHitsMe(e));
      if (crisis && S.fin.statements[S.fin.statements.length - 1].ni > 0) S.stats.crisisProfit = (S.stats.crisisProfit || 0) + 1;
    }
    if (client()) return; // 多人連線：事件由房主產生
    if (!S.routes.length && !S.fleet.length) { w.nextMajor = Math.max(w.nextMajor, S.time + 30 * DAY); return; }
    const N = network(S);
    if (S.time >= w.nextStorm) {
      w.nextStorm = S.time + (rnd(18, 45) * DAY) / (G.dmod ? G.dmod('events') : 1);
      const busy = w.events.filter((e) => e.type === 'storm').length;
      if (busy < 2) { const b = makeStorm(S, N); if (b) startEvent(S, 'storm', b); }
    }
    if (S.time >= w.nextMajor) {
      w.nextMajor = S.time + (rnd(50, 100) * DAY) / (G.dmod ? G.dmod('events') : 1);
      const live = w.events.filter((e) => e.type !== 'storm');
      if (live.length >= 3) return;
      const busy = new Set(live.map((e) => e.type));
      // 油價漲跌互斥；疫情與衰退不同時發生太多
      if (busy.has('oil-up')) busy.add('oil-down');
      if (busy.has('oil-down')) busy.add('oil-up');
      const cand = Object.entries(TYPES).filter(([k]) => !busy.has(k) && !(k === 'outbreak' && w.past.some((p) => p.type === 'outbreak' && S.time - p.end < 2 * 365 * DAY)));
      for (let tries = 0; tries < 4; tries++) {
        const k = wpick(cand.map(([key, T]) => [key, T.w]));
        const body = TYPES[k].make(S, N);
        if (body) { startEvent(S, k, body); break; }
      }
    }
  };
  // 測試與除錯用：立刻產生指定事件
  G.forceEvent = (type) => {
    const S = G.S, N = network(S);
    const body = type === 'storm' ? makeStorm(S, N) : TYPES[type] && TYPES[type].make(S, N);
    return body ? startEvent(S, type, body) : null;
  };
  G.EVENT_TYPES = TYPES;

  // ---------- 多人連線：房主把事件同步給大家 ----------
  G.worldPublic = () => { const S = G.S; return S && S.world ? { seq: S.world.seq, events: S.world.events } : null; };
  G.worldApply = (pub) => {
    const S = G.S;
    if (!S || !pub) return;
    const w = W(), had = new Set(w.events.map((e) => e.id));
    w.events = pub.events.map((e) => ({ ...e }));
    w.seq = Math.max(w.seq, pub.seq);
    w.events.filter((e) => !had.has(e.id) && S.time - e.announced < 5 * DAY).forEach((e) => announce(S, e));
  };
})();
