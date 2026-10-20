// 模擬核心：遊戲狀態、樞紐、機隊、航線、維修與飛安、時間推進與財務。與畫面無關，之後可直接搬到 Steam 版。
(function () {
  const G = window.G;
  const DAY = 86400000, MIN = 60000, HOUR = 3600000;
  const SAVE_KEY = 'airline-founder-save-v1';

  G.S = null; // 目前遊戲狀態
  // 不計入營業成本的支出：資本支出、保證金、還本、股利，以及營業外的利息與稅
  G.ONE_OFF = ['capex', 'setup', 'facility', 'deposit', 'principal', 'dividend', 'interest', 'tax', 'invest', 'bondfee'];
  const listeners = [];
  G.on = (fn) => listeners.push(fn);
  const emit = (what, data) => listeners.forEach((fn) => fn(what, data));

  // 每個樞紐升級項目都要有初始值，否則 undefined++ 會變成 NaN
  const newUpgrades = () => ({ lounge: 0, ground: 0, hangar: 0, kitchen: 0 });
  const emptyDay = () => ({ rev: 0, gov: 0, member: 0, paxB: 0, tix: 0, other: 0, cost: {}, inflow: {}, gain: 0, pax: 0, flights: 0, satSum: 0, satPax: 0 });
  G.emptyDay = emptyDay;

  // ---------- 建立新遊戲 ----------
  G.newGame = (opts) => {
    const start = Date.UTC(2027, 0, 1, 0, 0);
    const F = G.FOUNDERS[opts.founder || 'classic'];
    G.S = {
      v: 9, time: start, start, seq: 1, regSeq: 1, cabinPresets: [], rivals: { pairs: {}, ver: 1, news: [] },
      company: { name: opts.name, code: opts.code, color: opts.color, logo: opts.logo || null, logoAuto: opts.logoAuto || null, cabinNames: { ...G.CLASS_DEFAULT_NAME } },
      founder: { type: opts.founder || 'classic', equity: F.equity },
      cash: G.START_CASH * F.cash,
      rep: F.rep,
      safety: { delays: 0, emergencies: 0, crashes: 0, deaths: 0, lastCrash: null },
      maintPolicy: G.defaultMaintPolicy(),
      hubs: {}, fleet: [], routes: [],
      day: emptyDay(),
      days: [], months: [], log: [],
      lastDay: Math.floor(start / DAY),
    };
    const ap = G.AP[opts.hub];
    G.S.hubs[ap.iata] = { type: 'primary', since: start, upgrades: newUpgrades() };
    if (G.initV4) G.initV4(G.S);
    if (G.initV9) G.initV9(G.S); // v0.9.0：航空聯盟、股市、公司債
    if (G.initWorld) G.initWorld(G.S); // v1.0.0-rc2：突發事件
    spend(G.hubFee(ap, 'primary'), 'facility');
    log(`${opts.name} 成立，主要樞紐設於 ${ap.city}（${ap.iata}）；創始人背景：${F.name}`);
    G.initV3(G.S);
    if (G.initSocial) G.initSocial(G.S);
    if (G.initGov) G.initGov(G.S);
    if (G.refreshUsedMarket) G.refreshUsedMarket(G.S);
    emit('all');
  };

  // 舊存檔升級到目前版本
  function migrate(S) {
    if (!S.v || S.v < 2) {
      S.rep = S.rep ?? G.REP_START;
      S.safety = S.safety || { delays: 0, emergencies: 0, crashes: 0, deaths: 0, lastCrash: null };
      S.maintPolicy = S.maintPolicy || G.defaultMaintPolicy();
      S.company.logo = S.company.logo || null;
      Object.values(S.hubs).forEach((h) => (h.upgrades = { ...newUpgrades(), ...h.upgrades }));
      S.fleet.forEach((ac) => {
        if (!ac.mx) ac.mx = { A: ac.hours % 600, B: ac.hours % 3000, C: ac.hours % 7500, D: ac.hours % 36000 };
      });
      S.day = { ...emptyDay(), ...S.day };
      S.v = 2;
    }
    if (S.v < 3) { G.migrateV3(S); S.v = 3; }
    if (S.v < 4) { G.migrateV4(S); S.v = 4; }
    if (S.v < 5) { G.migrateV6ops(S); G.initGov(S); S.v = 5; } // v0.6：航班編號、政府合約
    if (S.v < 6) { if (G.migrateV62) G.migrateV62(S); S.v = 6; } // v0.6.2：機況、二手市場、艙位設定
    if (S.v < 7) { if (G.initRivals) G.initRivals(S); S.v = 7; } // v0.7.0：真實航空公司競爭
    if (S.v < 8) { if (G.initV9) G.initV9(S); S.v = 8; } // v0.9.0：航空聯盟、股市、公司債
    if (S.v < 9) { if (G.initWorld) G.initWorld(S); S.v = 9; } // v1.0.0-rc2：突發事件
    if (G.repairSave) G.repairSave(S);
    return S;
  }

  const id = () => G.S.seq++;
  function log(msg, kind) {
    G.S.log.unshift({ t: G.S.time, msg, kind: kind || 'info' });
    if (G.S.log.length > 200) G.S.log.length = 200;
  }
  G.log = log;
  function spend(v, cat) {
    G.S.cash -= v;
    G.S.day.cost[cat] = (G.S.day.cost[cat] || 0) + v;
    if (cat === 'facility' && G.S.fin) { G.S.fin.facCost += v; G.S.fin.facBook += v; } // 樞紐與設施資本化
  }
  function earn(v) { G.S.cash += v; G.S.day.rev += v; }
  function otherIncome(v) { G.S.cash += v; G.S.day.other += v; }
  function repDelta(d, why) {
    const S = G.S;
    d *= G.fmod('attention'); // 社會關注度放大評價的漲跌
    S.rep = Math.max(0, Math.min(100, S.rep + d));
    if (why) log(`社會評價 ${d > 0 ? '+' : ''}${d.toFixed(0)}：${why}`, d < 0 ? 'warn' : 'info');
  }

  // 給 v0.3 模組（hr.js）使用的內部函式
  G._spend = spend; G._emit = emit; G.repDelta = repDelta; G._otherIncome = otherIncome;

  // ---------- 企業標誌 ----------
  G.setLogo = (dataUrl, auto) => { G.S.company.logo = dataUrl; G.S.company.logoAuto = auto || null; emit('logo'); };
  // 自動標誌：沒有上傳的公司（含舊存檔）依名稱、代碼、企業色產生；seed 換一個就換樣式
  G.autoLogo = (seed) => {
    const c = G.S.company, g = G.genLogo({ name: c.name, code: c.code, color: c.color, seed });
    G.setLogo(g.url, { seed }); return g;
  };
  G.ensureLogo = () => { if (G.S && !G.S.company.logo && G.genLogo) G.autoLogo(0); };

  // ---------- 樞紐 ----------
  let phHubs = null, phVal = null, phKey = '';
  G.primaryHub = () => {
    const H = G.S.hubs, key = Object.keys(H).length + ':' + G.hubVer;
    if (H !== phHubs || key !== phKey) { phHubs = H; phKey = key; phVal = Object.keys(H).find((k) => H[k].type === 'primary'); }
    return phVal;
  };
  G.hubVer = 0;
  G.setHub = (iata, type) => {
    const ap = G.AP[iata], S = G.S, cur = S.hubs[iata];
    if (cur && cur.type === type) return { ok: false, msg: '已經是這個樞紐等級' };
    let fee = G.hubFee(ap, type);
    if (cur && type === 'primary') fee -= G.hubFee(ap, 'secondary'); // 升級只付差額
    if (cur && type === 'secondary') fee = 0;
    if (S.cash < fee) return { ok: false, msg: `資金不足，需要 ${G.money(fee)}` };
    if (type === 'primary') {
      const old = G.primaryHub();
      if (old && old !== iata) { S.hubs[old].type = 'secondary'; log(`${G.AP[old].iata} 改為次要樞紐`); }
    } else if (cur && cur.type === 'primary') {
      return { ok: false, msg: '請先把其他機場設為主要樞紐' };
    }
    spend(fee, 'facility');
    S.hubs[iata] = cur ? { ...cur, type } : { type, since: S.time, upgrades: newUpgrades() };
    G.hubVer++;
    log(`${ap.city}（${iata}）設為${type === 'primary' ? '主要' : '次要'}樞紐，花費 ${G.money(fee)}`);
    emit('hubs');
    return { ok: true };
  };
  G.removeHub = (iata) => {
    const h = G.S.hubs[iata];
    if (!h) return { ok: false };
    if (h.type === 'primary') return { ok: false, msg: '主要樞紐不能直接撤銷，請先指定新的主要樞紐' };
    if (G.S.routes.some((r) => r.a === iata)) return { ok: false, msg: '還有從這裡出發的航線，請先停飛' };
    if (G.S.fleet.some((ac) => ac.st === 'maint' && ac.loc === iata)) return { ok: false, msg: '還有飛機在這裡進行檢查' };
    delete G.S.hubs[iata];
    G.hubVer++;
    log(`撤銷 ${iata} 樞紐`);
    emit('hubs');
    return { ok: true };
  };
  G.upgradeHub = (iata, key) => {
    const h = G.S.hubs[iata], u = G.UPGRADES[key];
    h.upgrades[key] = h.upgrades[key] || 0;
    if (h.upgrades[key] >= u.max) return { ok: false, msg: '已達最高等級' };
    if (G.S.cash < u.cost) return { ok: false, msg: '資金不足' };
    spend(u.cost, 'facility');
    h.upgrades[key]++;
    log(`${iata} ${u.name}升級到第 ${h.upgrades[key]} 級`);
    emit('hubs');
    return { ok: true };
  };
  // v1.0 效能：同一個時間點、航線沒變時沿用結果
  const hsCache = new Map();
  let hsKey = '';
  G.hubStats = (iata) => {
    const key = G.S.time + ':' + G.routeVer + ':' + G.S.routes.length + ':' + G.hubVer;
    if (key !== hsKey) { hsKey = key; hsCache.clear(); }
    let v = hsCache.get(iata);
    if (!v) { v = hubStats0(iata); hsCache.set(iata, v); }
    return v;
  };
  const hubStats0 = (iata) => {
    const ap = G.AP[iata];
    let deps = 0;
    G.S.routes.forEach((r) => { if (r.a === iata || r.b === iata) deps += G.routeFreq(r); });
    const base = G.baselineDepartures(ap);
    const share = deps / (deps + base);
    const h = G.S.hubs[iata];
    return { deps, base, share, fortress: !!h && h.type === 'primary' && share > G.FORTRESS_SHARE };
  };
  let fcRoutes = null, fcLen = -1, fcVal = null;
  G.focusCities = () => {
    const R = G.S.routes;
    if (R === fcRoutes && R.length === fcLen) return fcVal;
    fcRoutes = R; fcLen = R.length; fcVal = focus0();
    return fcVal;
  };
  const focus0 = () => {
    const m = {};
    G.S.routes.forEach((r) => {
      const k = G.cityKey(G.AP[r.b]);
      (m[k] = m[k] || new Set()).add(r.a);
    });
    const out = {};
    Object.entries(m).forEach(([k, s]) => { if (s.size >= 2) out[k] = [...s]; });
    return out;
  };

  // ---------- 機隊 ----------
  // opts（v0.6.2 二手市場）：{ price, lease, hours, cycles, mx, cond, used: true }
  G.acquire = (typeId, mode, cabin, reg, opts) => {
    const t = G.TYPES[typeId], S = G.S;
    opts = opts || {};
    if (reg) { reg = G.normReg(reg); const why = G.checkReg(reg); if (why) return { ok: false, msg: why }; }
    const leaseM = opts.lease != null ? opts.lease : G.leaseMonthly(t);
    const up = mode === 'buy' ? (opts.price != null ? opts.price : t.price * 1e6) : leaseM * 2; // 租賃需兩個月保證金
    if (S.cash < up) return { ok: false, msg: `資金不足，需要 ${G.money(up)}` };
    spend(up, mode === 'buy' ? 'capex' : 'deposit');
    const hub = G.primaryHub();
    const ac = {
      id: id(), type: typeId, reg: reg || defaultReg(),
      cabin: cabin || G.defaultCabin(t), mode, lease: mode === 'lease' ? leaseM : 0,
      route: null, loc: hub, st: 'idle',
      hours: opts.hours != null ? opts.hours : t.used ? 26000 : 0, cycles: opts.cycles != null ? opts.cycles : t.used ? 14000 : 0,
      // 二手機交機時各級檢查已累積的時數
      mx: opts.mx ? { ...opts.mx } : t.used ? { A: 200, B: 1200, C: 3500, D: 26000 % 36000 } : { A: 0, B: 0, C: 0, D: 0 },
      cond: opts.cond != null ? opts.cond : t.used ? 0.8 : 1, // 機況 0–1：影響故障率、客艙品質、維修費
      usedBuy: !!(opts.used || t.used),
      newCabin: !opts.used, // 新機交機前可免費設定艙位；第一次起飛後改裝要花錢花時間
      mxQueue: null, since: S.time, leg: null, readyAt: S.time,
    };
    // 帳面：自有機記錄成本與帳面價值；租賃機記錄保證金
    if (mode === 'buy') { ac.cost = up; ac.book = up; } else { ac.deposit = up; if (S.fin) S.fin.deposits += up; }
    S.fleet.push(ac);
    { const m = new RegExp(`^${S.company.code}-(\\d+)$`).exec(ac.reg); if (m) S.regSeq = Math.max(S.regSeq || 1, +m[1] + 1); }
    log(`${mode === 'buy' ? '購入' : '租賃'}${opts.used ? '二手' : ''} ${t.model}（${ac.reg}），停放於 ${hub}`);
    G.onAcquire(ac);
    emit('fleet');
    return { ok: true, ac };
  };
  // 預設編號：公司代碼加流水號，跳過已被玩家自訂使用的編號
  // v0.6.2 預設編號：航空公司代碼-001 起依序遞增（賣掉的號碼不再重複使用）
  function defaultReg(offset) {
    const S = G.S, code = S.company.code, re = new RegExp(`^${code}-(\\d+)$`);
    let n = S.regSeq || 1;
    S.fleet.forEach((a) => { const m = re.exec(a.reg); if (m) n = Math.max(n, +m[1] + 1); });
    n += offset || 0;
    let reg;
    do { reg = `${code}-${String(n++).padStart(3, '0')}`; } while (S.fleet.some((a) => a.reg === reg));
    return reg;
  }
  G.defaultReg = defaultReg;
  G.sellAircraft = (acId) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId);
    if (!ac || ac.st === 'air') return { ok: false, msg: '飛行中的飛機不能處分' };
    if (G.isPledged && G.isPledged(ac.id)) return { ok: false, msg: '這架飛機抵押給銀行，請先清償貸款' };
    let v = 0;
    if (ac.mode === 'buy') v = G.aircraftValue(ac);
    G.dispose(ac, v, 'sale');
    log(`${ac.reg} ${ac.mode === 'buy' ? `出售，回收 ${G.money(v)}` : '退租'}`);
    emit('fleet');
    return { ok: true, value: v };
  };
  G.aircraftValue = (ac) => {
    const t = G.TYPES[ac.type], years = (G.S.time - ac.since) / (365 * DAY);
    if (ac.usedBuy && ac.cost) return ac.cost * Math.max(0.2, 0.9 - years * 0.06); // 二手機以買價折舊估價
    return t.price * 1e6 * Math.max(0.25, 0.85 - years * 0.04) * (t.used ? 0.8 : 1);
  };
  G.setCabin = (acId, cabin) => {
    const ac = G.S.fleet.find((a) => a.id === acId), t = G.TYPES[ac.type];
    const u = G.cabinUsage(t, cabin);
    if (u.units > t.units + 0.01) return { ok: false, msg: '座位空間超過機艙容量' };
    if (u.seats > t.maxSeats) return { ok: false, msg: `座位數超過逃生認證上限 ${t.maxSeats}` };
    ac.cabin = cabin;
    emit('fleet');
    return { ok: true };
  };
  G.canFly = (t, a, b) => {
    let d = G.dist(a, b);
    if (d <= t.range && a.iata && b.iata) d = G.legKm(a, b); // v0.7.0 繞飛會增加實際航程
    if (d > t.range) return `航程不足（${G.num(d)} 公里 > ${G.num(t.range)} 公里）`;
    for (const ap of [a, b]) if (ap.rwy && ap.rwy < t.rwy) return `${ap.iata} 跑道 ${G.num(ap.rwy)} 公尺，不足 ${G.num(t.rwy)} 公尺`;
    return G.restrictionWhy(t, a, b);
  };
  const onGround = (ac) => ['idle', 'turn', 'sched', 'stuck'].includes(ac.st);
  G.assign = (acId, routeId) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId);
    G.routeVer++;
    if (routeId == null) { ac.route = null; emit('fleet'); return { ok: true }; }
    const r = S.routes.find((x) => x.id === routeId), t = G.TYPES[ac.type];
    const why = G.canFly(t, G.AP[r.a], G.AP[r.b]);
    if (why) return { ok: false, msg: why };
    ac.route = r.id;
    if (r.autoFare && G.optimizeFares) G.optimizeFares(r);
    if (onGround(ac) && ac.loc !== r.a && ac.loc !== r.b) {
      // 調機：空機飛往航線起點
      const from = G.AP[ac.loc], to = G.AP[r.a];
      if (G.dist(from, to) > t.range) { ac.route = null; return { ok: false, msg: `需要調機但 ${ac.loc} → ${r.a} 超過航程` }; }
      ac.leg = null;
      startLeg(ac, from, to, S.time, true);
      if (ac.st === 'air') depart(ac);
    } else if (ac.st === 'idle') { ac.st = 'turn'; ac.readyAt = S.time; }
    emit('fleet');
    return { ok: true };
  };

  // ---------- 維修 ----------
  G.hangarLevel = (iata) => (G.S.hubs[iata] ? G.S.hubs[iata].upgrades.hangar : 0);
  // 玩家手動要求檢查：在樞紐地面上就立刻開始，否則下一次回到樞紐時執行
  G.requestCheck = (acId, lv) => {
    const ac = G.S.fleet.find((a) => a.id === acId);
    if (!ac) return { ok: false };
    if (ac.st === 'maint') return { ok: false, msg: '這架飛機正在進行檢查' };
    const L = G.CHECK_LEVELS;
    if (!ac.mxQueue || L.indexOf(lv) > L.indexOf(ac.mxQueue)) ac.mxQueue = lv;
    if (onGround(ac) && G.S.hubs[ac.loc]) { ac.leg = null; startCheck(ac); }
    else log(`${ac.reg} 已排定${G.CHECKS[ac.mxQueue].name}，回到樞紐後執行`);
    emit('fleet');
    return { ok: true };
  };
  G.setPolicy = (lv, patch) => { Object.assign(G.S.maintPolicy[lv], patch); emit('fleet'); };
  function autoQueue(ac) {
    const P = G.S.maintPolicy;
    if (P.enabled === false || ac.autoMx === false) return; // 自動維修總開關、單機設定
    for (const lv of ['D', 'C', 'B', 'A']) {
      if (P[lv].auto && ac.mx[lv] >= P[lv].at) {
        const L = G.CHECK_LEVELS;
        if (!ac.mxQueue || L.indexOf(lv) > L.indexOf(ac.mxQueue)) ac.mxQueue = lv;
        return;
      }
    }
  }
  function startCheck(ac) {
    const S = G.S, t = G.TYPES[ac.type], lv = ac.mxQueue;
    const plan = G.checkPlan(t, lv, G.hangarLevel(ac.loc));
    spend(plan.cost, 'mxcheck');
    ac.st = 'maint'; ac.leg = null; ac.mxLv = lv; ac.mxQueue = null;
    plan.hours *= G.groundFactor(); // 地勤與維修人力不足或罷工時工期拉長
    ac.mxUntil = S.time + plan.hours * HOUR;
    log(`${ac.reg} 在 ${ac.loc} 開始${G.CHECKS[lv].name}${plan.outsourced ? '（委外）' : ''}，費用 ${G.money(plan.cost)}，預計 ${plan.hours >= 48 ? Math.round(plan.hours / 24) + ' 天' : Math.round(plan.hours) + ' 小時'}`);
  }
  function finishCheck(ac) {
    const lv = ac.mxLv, L = G.CHECK_LEVELS;
    L.slice(0, L.indexOf(lv) + 1).forEach((x) => (ac.mx[x] = 0));
    ac.st = 'turn'; ac.readyAt = G.S.time; ac.mxLv = null;
    // 大型檢查順便翻新：C 檢機況 +4%、D 檢恢復到至少 93%
    if (ac.cond != null) { if (lv === 'D') ac.cond = Math.max(ac.cond, 0.93); else if (lv === 'C') ac.cond = Math.min(0.95, ac.cond + 0.04); }
    if (ac.grounded && !Object.values(G.overdue(ac)).some((v) => v > 0)) { ac.grounded = false; log(`${ac.reg} 通過稽查，解除停飛`); }
    log(`${ac.reg} 完成${G.CHECKS[lv].name}`);
  }
  G.nearestHub = (iata) => {
    const ap = G.AP[iata];
    return Object.keys(G.S.hubs).sort((a, b) => G.dist(ap, G.AP[a]) - G.dist(ap, G.AP[b]))[0];
  };

  // ---------- 航線 ----------
  G.openRoute = (a, b, opts) => {
    const S = G.S;
    opts = opts || {};
    const fno = opts.fno || (G.nextFlightNo ? G.nextFlightNo() : null);
    if (fno && G.checkFlightNo) { const why = G.checkFlightNo(fno.out, fno.back); if (why) return { ok: false, msg: why }; }
    if (!S.hubs[a]) return { ok: false, msg: '航線必須從你的樞紐出發' };
    if (a === b) return { ok: false, msg: '起訖點相同' };
    { const why = G.routeRoleWhy && G.routeRoleWhy(G.AP[a], G.AP[b]); if (why) return { ok: false, msg: why }; } // v0.6.3 機場類型
    if (S.routes.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return { ok: false, msg: '這條航線已經開航' };
    const fee = opts.free ? 0 : G.routeOpenFee(G.AP[b]) + G.routeOpenFee(G.AP[a]) / 2; // 政府補貼航線免開航費
    if (S.cash < fee) return { ok: false, msg: `資金不足，需要 ${G.money(fee)}` };
    if (fee) spend(fee, 'routefee');
    const r = { id: id(), a, b, fno, autoFare: opts.autoFare !== false, fare: { F: 1, J: 1, W: 1, Y: 1 }, since: S.time, stats: newStats(), hist: [] };
    S.routes.push(r);
    log(`開設航線 ${a} ⇄ ${b}${fno ? `（${S.company.code}${fno.out}／${fno.back}）` : ''}，開航費 ${G.money(fee)}`);
    emit('routes');
    return { ok: true, route: r };
  };
  const newStats = () => ({ pax: 0, seats: 0, rev: 0, cost: 0, flights: 0, satSum: 0, delays: 0 });
  G.closeRoute = (rid) => {
    const S = G.S;
    S.fleet.forEach((ac) => { if (ac.route === rid) ac.route = null; });
    G.routeVer++;
    const r = S.routes.find((x) => x.id === rid);
    S.routes = S.routes.filter((x) => x.id !== rid);
    log(`停飛航線 ${r.a} ⇄ ${r.b}`);
    emit('routes');
  };
  // v1.0 效能：每條航線的飛機用索引，飛機增減或指派改變時才重建（原本每次都掃整個機隊）
  G.routeVer = 0;
  let raFleet = null, raLen = -1, raVer = -1, raMap = new Map();
  const NONE = [];
  G.routeAircraft = (r) => {
    const F = G.S.fleet;
    if (F !== raFleet || F.length !== raLen || G.routeVer !== raVer) {
      raFleet = F; raLen = F.length; raVer = G.routeVer; raMap = new Map();
      for (const ac of F) if (ac.route != null) { let a = raMap.get(ac.route); if (!a) raMap.set(ac.route, (a = [])); a.push(ac); }
    }
    return raMap.get(r.id) || NONE;
  };
  // 每日單向班次（估計值，不計檢查中與停飛的飛機）
  G.routeFreq = (r) => {
    const d = G.legKm(G.AP[r.a], G.AP[r.b]);
    return G.routeAircraft(r).reduce((s, ac) => {
      if (ac.st === 'maint' || ac.st === 'aog' || ac.st === 'refit' || ac.st === 'refurb' || ac.grounded) return s;
      const t = G.TYPES[ac.type];
      return s + 1440 / (2 * (G.blockMinutes(t, d) + G.turnMinutes(t)));
    }, 0);
  };
  // 玩家在某艙等可取得的市場占比；pen = 客艙功能失常折損
  G.captureShare = (r, cls, tier, freq, pen) => {
    const A = G.AP[r.a], B = G.AP[r.b];
    const market = G.marketDaily(A, B);
    const base = 0.15 + 0.25 * Math.exp(-market / 300); // 冷門航線競爭少
    const f = Math.max(freq, 0.1);
    const freqF = (2 * f) / (f + 2);
    // 價格彈性：調降票價時 1.8；高於參考票價後旅客更敏感（2.8），避免一路漲價仍能滿載
    const pf = r.fare[cls], priceF = pf <= 1 ? Math.pow(1 / pf, 1.8) : Math.pow(1 / pf, 2.8);
    let qual = G.TIER_SCORE[tier] * (1 - (pen || 0));
    if (cls === 'J' || cls === 'F') {
      const h = G.S.hubs[r.a];
      if (h) qual *= 1 + 0.05 * h.upgrades.lounge;
    }
    let bonus = 1.05 * G.repFactor(G.S.rep) * G.fmod('capture');
    if (G.hubStats(r.a).fortress) bonus *= 1.15;
    if (G.focusCities()[G.cityKey(B)]) bonus *= 1.1;
    if (G.socialDemand) bonus *= G.socialDemand(r); // 社群話題與宣傳的短期影響
    return Math.min(0.85, base * freqF * priceF * qual * bonus);
  };
  G.routeForecast = (a, b, typeId) => {
    const A = G.AP[a], B = G.AP[b], d = G.dist(A, B), sg = G.routeSegments(A, B);
    const out = { dist: d, market: sg.total, seg: sg, classes: {} };
    G.CLASSES.forEach((c) => (out.classes[c] = { market: sg.cls[c].L + sg.cls[c].B, leisure: sg.cls[c].L, business: sg.cls[c].B, fare: G.refFare(d, c) }));
    if (typeId) {
      const t = G.TYPES[typeId];
      out.block = G.blockMinutes(t, G.legKm(A, B));
      out.freqPerAc = 1440 / (2 * (out.block + G.turnMinutes(t)));
    }
    return out;
  };

  // ---------- 飛行 ----------
  G.legEnds = (L) => [L.p0 || G.AP[L.from], G.AP[L.to]];
  function legOk(from, to, dep, block) {
    return !G.inCurfew(from, dep) && !G.inCurfew(to, dep + block * MIN);
  }
  function nextDeparture(from, to, earliest, block) {
    let t = Math.ceil(earliest / (5 * MIN)) * 5 * MIN;
    for (let i = 0; i < 24 * 4 + 1; i++) {
      if (legOk(from, to, t, block)) return t;
      t += 15 * MIN;
    }
    return null; // 一整天都找不到可行時段（兩端宵禁互相衝突）
  }
  function startLeg(ac, from, to, earliest, ferry) {
    const t = G.TYPES[ac.type], d = G.legKm(from, to), block = G.blockMinutes(t, d); // v0.7.0 依實際飛行路徑
    let dep = nextDeparture(from, to, earliest, block);
    if (dep == null) {
      ac.st = 'stuck';
      log(`${ac.reg} 在 ${from.iata} → ${to.iata} 找不到避開宵禁的起降時段`, 'warn');
      return;
    }
    // v1.0.0-rc2 機場關閉（颱風、火山灰）：所有航班停飛，等機場重新開放
    const shut = G.evClosed && (G.evClosed(from.iata) || G.evClosed(to.iata));
    if (shut) {
      ac.st = 'turn'; ac.leg = null; ac.readyAt = Math.max(G.S.time, earliest, Math.min(shut.end, G.S.time + 6 * HOUR));
      if (!ferry) {
        G.S.day.cancels = (G.S.day.cancels || 0) + 1; G.S.day.wxCancels = (G.S.day.wxCancels || 0) + 1;
        const rr = G.S.routes.find((x) => x.id === ac.route);
        if (rr) rr.stats.cancels = (rr.stats.cancels || 0) + 1;
      }
      return;
    }
    // 人力不足、罷工或航管罷工：取消營收航班，兩小時後再試
    if (!ferry && Math.random() < 1 - (1 - G.cancelProb()) * (1 - (G.evCancel ? G.evCancel(from, to) : 0))) {
      ac.st = 'turn'; ac.leg = null; ac.readyAt = Math.max(G.S.time, earliest) + 2 * HOUR;
      G.S.day.cancels = (G.S.day.cancels || 0) + 1;
      const rr = G.S.routes.find((x) => x.id === ac.route);
      if (rr) rr.stats.cancels = (rr.stats.cancels || 0) + 1;
      return;
    }
    // 技術性延誤：依維修狀況決定
    let delayed = 0;
    if (!ferry) {
      const p = G.condRisk(ac, G.riskPerFlight(G.overdue(ac)));
      if (Math.random() < p.delay) {
        const want = dep + (60 + Math.floor(Math.random() * 5) * 60) * MIN;
        const d2 = nextDeparture(from, to, want, block);
        if (d2 != null) { delayed = Math.round((d2 - dep) / MIN); dep = d2; }
      }
    }
    ac.leg = { from: from.iata, to: to.iata, dep, arr: dep + block * MIN, block, dist: d, ferry: !!ferry, booked: null, delayed };
    ac.st = dep > G.S.time ? 'sched' : 'air';
    ac.waitCurfew = ac.st === 'sched' && !delayed && dep - earliest > 20 * MIN && !!G.curfew(from);
  }
  // 起飛：決定載客、擲事件
  function depart(ac) {
    const S = G.S, L = ac.leg, t = G.TYPES[ac.type];
    const o = G.overdue(ac), pen = Math.min(0.35, G.cabinPenalty(o) + G.condPenalty(ac)), p = G.condRisk(ac, G.riskPerFlight(o));
    if (ac.newCabin) ac.newCabin = false; // 第一次起飛後，改艙位就要花錢花時間
    const roll = Math.random();
    if (roll < p.crash) L.event = { kind: 'crash', at: L.dep + (0.1 + Math.random() * 0.8) * (L.arr - L.dep) };
    else if (roll < p.crash + p.emergency) L.event = { kind: 'emergency', at: L.dep + (0.1 + Math.random() * 0.7) * (L.arr - L.dep) };
    const r = S.routes.find((x) => x.id === ac.route);
    if (L.ferry || !r) { L.booked = null; return; }
    const freq = G.routeFreq(r);
    const b = { pax: {}, rev: 0, sat: 0, meal: 0, anc: 0 };
    const h = L.block / 60, svcK = G.cabinServiceFactor(), evFare = G.evFare ? G.evFare() : 1;
    let paxAll = 0;
    G.classesFor(t).forEach((c) => {
      const k = ac.cabin[c];
      if (!k || k.seats <= 0) { b.pax[c] = 0; return; }
      // v0.6.1：觀光客與商務客分開計算攬客率
      const ex = G.expectPax(r, c, k.tier, freq, pen);
      const expect = ex.pax * G.timeOfDay(G.localMinutes(G.AP[L.from], L.dep));
      const pax = Math.min(k.seats, Math.max(0, Math.round(expect * (0.85 + Math.random() * 0.3))));
      b.pax[c] = pax; paxAll += pax; b.paxB = (b.paxB || 0) + pax * (1 - ex.leisure);
      b.rev += pax * G.refFare(L.dist, c) * r.fare[c] * (G.socialYield ? G.socialYield() : 1) * evFare;
      // 單一艙等的滿意度（0–1）
      const cat = G.catering(c, h, L.from, pax);
      b.meal += cat.cost; b.anc += cat.anc;
      // 物有所值：票價高於參考價，滿意度略降；便宜則略升
      // 觀光客在意物有所值，商務客在意延誤與服務
      const vfm = 1 + (Math.max(0.85, Math.min(1.06, 1 + 0.18 * (1 - r.fare[c]))) - 1) * ex.leisure;
      const late = L.delayed >= 60 ? 0.75 - 0.15 * (1 - ex.leisure) : 1;
      let s = (G.TIER_SCORE[k.tier] / 1.3) * (1 - pen) * late * cat.mult * Math.pow(svcK, 1 + (1 - ex.leisure)) * vfm;
      if ((c === 'J' || c === 'F') && S.hubs[r.a]) s *= 1 + 0.03 * S.hubs[r.a].upgrades.lounge;
      b.sat += Math.min(1, s) * pax;
    });
    b.paxAll = paxAll;
    L.booked = b;
    if (L.delayed >= 120 && paxAll) {
      spend(paxAll * G.COMP.delayPerPax, 'incident');
      S.safety.delays++;
      log(`${ac.reg} ${L.from} → ${L.to} 因機械問題延誤 ${Math.round(L.delayed / 60)} 小時，補償旅客 ${G.money(paxAll * G.COMP.delayPerPax)}`, 'warn');
    }
  }
  function flightCosts(ac, h, dist, from, to, pax, svc) {
    const t = G.TYPES[ac.type], seats = G.cabinSeats(ac.cabin);
    const fuel = t.fuel * h * (G.fuelPrice ? G.fuelPrice() : G.FUEL_PRICE); // v1.0.0-rc2 油價事件與避險
    // v0.3 起機組薪資改為每月人事費用，這裡只剩飛行津貼與外站住宿
    const crew = h * (2 * 40 + Math.max(1, Math.ceil(seats / 45)) * 12);
    const maint = t.price * 1e6 * (t.used ? 1.4 : 1) * (1 + 1.2 * (1 - (ac.cond != null ? ac.cond : 1))) * 3.5e-6 * h * G.fmod('mx') * (G.evCost ? G.evCost('maint') : 1); // 航線維修與零件（定期檢查另計）
    // 起降費、旅客服務費、航路費、地勤代理費（v0.4 依真實費率上調）
    const airport = (7 * t.units + pax * (from.cc === to.cc ? 9 : 14) + 0.45 * dist + (t.wide ? 4000 : t.body === 'turboprop' ? 700 : 1500)) * (G.evCost ? G.evCost('airport', from, to) : 1);
    spend(fuel, 'fuel'); spend(crew, 'crew'); spend(maint, 'maint'); spend(airport, 'airport'); if (svc) spend(svc, 'service');
    ac.hours += h; ac.cycles += 1;
    G.CHECK_LEVELS.forEach((lv) => (ac.mx[lv] += h));
    return fuel + crew + maint + airport + svc;
  }
  function land(ac) {
    const S = G.S, L = ac.leg, t = G.TYPES[ac.type];
    const h = (L.arr - L.dep) / HOUR;
    const from = L.p0 || G.AP[L.from], to = G.AP[L.to];
    let pax = 0, svc = 0;
    if (L.booked) {
      G.classesFor(t).forEach((c) => {
        const p = L.booked.pax[c] || 0;
        pax += p;
        if (p) svc += p * G.SERVICE_COST[c][ac.cabin[c].tier] * (0.5 + 0.3 * h);
      });
    }
    const cost = flightCosts(ac, h, L.dist, from, to, pax, svc);
    const r = S.routes.find((x) => x.id === ac.route);
    if (L.emergency) {
      // 緊急轉降：退票、補償、臨時停飛修理
      const repair = 250e3 * G.checkSize(t);
      spend(pax * G.COMP.divertPerPax, 'incident'); spend(repair, 'incident');
      S.day.satSum += 0.15 * pax; S.day.satPax += pax;
      ac.st = 'aog'; ac.aogUntil = S.time + 3 * DAY; ac.loc = L.to; ac.leg = null;
      log(`${ac.reg} 緊急降落於 ${to.iata}（${to.city}），旅客 ${pax} 人平安，臨時修理 3 天，損失 ${G.money(pax * G.COMP.divertPerPax + repair)}`, 'warn');
      return;
    }
    if (L.booked) {
      if (L.booked.meal) spend(L.booked.meal, 'catering');
      earn(L.booked.rev + L.booked.anc);
      S.day.anc = (S.day.anc || 0) + L.booked.anc;
      S.day.pax += pax; S.day.flights += 1; S.day.paxB = (S.day.paxB || 0) + (L.booked.paxB || 0); S.day.tix = (S.day.tix || 0) + L.booked.rev;
      S.day.satSum += L.booked.sat; S.day.satPax += pax;
      if (r) {
        const st = r.stats;
        st.pax += pax; st.seats += G.cabinSeats(ac.cabin); st.rev += L.booked.rev; st.cost += cost; st.flights += 1;
        st.satSum += L.booked.sat || 0; if (L.delayed >= 60) st.delays = (st.delays || 0) + 1;
      }
      ac.lastLeg = { pax, seats: G.cabinSeats(ac.cabin), rev: L.booked.rev, cost, from: L.from, to: L.to };
    }
    ac.loc = L.to; ac.leg = null; ac.st = 'turn';
    const hub = S.hubs[ac.loc];
    const k = (hub ? 1 - 0.08 * hub.upgrades.ground : 1) * G.groundFactor();
    ac.readyAt = S.time + G.turnMinutes(t) * k * MIN;
    autoQueue(ac);
  }
  // 飛行中的事件
  function airEvent(ac) {
    const S = G.S, L = ac.leg, t = G.TYPES[ac.type], ev = L.event;
    L.event = null;
    const [A, B] = G.legEnds(L);
    const f = Math.max(0, Math.min(1, (S.time - L.dep) / (L.arr - L.dep)));
    const pos = G.map && G.map.pointAt ? G.map.pointAt(A, B, f) : { lat: A.lat + (B.lat - A.lat) * f, lon: A.lon + (B.lon - A.lon) * f };
    if (ev.kind === 'emergency') {
      // 前 30% 航程折返，其餘轉降最近可用機場（緊急狀況不受宵禁限制）
      let div = f < 0.3 && L.p0 == null ? G.AP[L.from] : null;
      if (!div) {
        let best = null, bd = Infinity;
        for (const ap of G.AIRPORTS) {
          if (ap.rwy && ap.rwy < t.rwy * 0.8) continue;
          const d = G.dist(pos, ap);
          if (d < bd) { bd = d; best = ap; }
        }
        div = best;
      }
      const d = G.dist(pos, div);
      L.p0 = { iata: `P${ac.id}-${S.time}`, lat: pos.lat, lon: pos.lon };
      L.to = div.iata; L.dep = S.time; L.arr = S.time + (d / t.speed * 60 + 10) * MIN; L.dist = d;
      L.emergency = true;
      S.safety.emergencies++;
      repDelta(-4, `${ac.reg} 發生機械故障，緊急轉降 ${div.iata}`);
      emit('event', { kind: 'emergency', reg: ac.reg, to: div });
      return;
    }
    // 墜機
    const pax = L.booked ? L.booked.paxAll : 0;
    const crew = 2 + Math.max(1, Math.ceil(G.cabinSeats(ac.cabin) / 45));
    const onboard = pax + crew;
    const survivable = Math.random() < 0.4;
    const deaths = Math.round(onboard * (survivable ? Math.random() * 0.2 : 0.6 + Math.random() * 0.4));
    const injuries = Math.round((onboard - deaths) * 0.6);
    const comp = deaths * G.COMP.deathEach + injuries * G.COMP.injuryEach;
    const o = G.overdue(ac), negligent = Object.values(o).some((v) => v > 0);
    // 責任保險理賠旅客賠償，公司自付自負額；罰款不在保險範圍
    spend(comp * G.LIAB_DEDUCTIBLE, 'incident');
    if (negligent) spend(G.COMP.negligenceFine, 'incident');
    if (ac.mode === 'buy') G.dispose(ac, G.aircraftValue(ac), 'hullIns'); // 機身保險依市價理賠
    else { spend(ac.lease * 6, 'incident'); G.dispose(ac, 0, 'crash'); } // 租約違約金，保證金沒收
    S.safety.crashes++; S.safety.deaths += deaths; S.safety.lastCrash = S.time;
    repDelta(-35, `${ac.reg} 失事`);
    const msg = `${ac.reg}（${t.model}）執行 ${L.from} → ${L.to} 途中失事。機上 ${onboard} 人，${deaths} 人罹難、${injuries} 人受傷。賠償 ${G.money(comp)}${negligent ? `，因維修逾期遭罰 ${G.money(G.COMP.negligenceFine)}` : ''}。`;
    log(msg, 'warn');
    // 民航主管機關稽查：所有維修逾期的飛機停飛，直到完成檢查
    let grounded = 0;
    S.fleet.forEach((x) => {
      const ox = G.overdue(x);
      const worst = ['D', 'C', 'B', 'A'].find((lv) => ox[lv] > 0);
      if (worst) { x.grounded = true; if (!x.mxQueue || G.CHECK_LEVELS.indexOf(worst) > G.CHECK_LEVELS.indexOf(x.mxQueue)) x.mxQueue = worst; grounded++; }
    });
    if (grounded) log(`民航主管機關稽查：${grounded} 架維修逾期的飛機停飛，完成檢查前只能空機調往樞紐`, 'warn');
    emit('event', { kind: 'crash', msg, deaths, injuries, onboard, comp, negligent, grounded, reg: ac.reg, model: t.model, pos });
  }
  function stepAircraft(ac) {
    const S = G.S;
    if (ac.st === 'maint') { if (S.time >= ac.mxUntil) finishCheck(ac); else return; }
    if (ac.st === 'refit') { if (S.time >= ac.refitUntil) G.finishRefit(ac); else return; }
    if (ac.st === 'refurb') { if (S.time >= ac.refurbUntil) G.finishRefurb(ac); else return; }
    if (ac.st === 'aog') { if (S.time >= ac.aogUntil) { ac.st = 'turn'; ac.readyAt = S.time; log(`${ac.reg} 修復完成`); } else return; }
    if (ac.st === 'sched' && S.time >= ac.leg.dep) { ac.st = 'air'; ac.waitCurfew = false; depart(ac); }
    if (ac.st === 'air' && ac.leg.event && S.time >= ac.leg.event.at) { airEvent(ac); if (!S.fleet.includes(ac)) return; }
    if (ac.st === 'air' && S.time >= ac.leg.arr) land(ac);
    if ((ac.st === 'turn' || ac.st === 'idle') && S.time >= (ac.readyAt || 0)) {
      // 待檢查的飛機在樞紐就地開始檢查；C／D 檢可設定先調機到有足夠棚廠的樞紐
      // v0.6.2 客艙改裝：在樞紐開工
      if (ac.refitQueue && S.hubs[ac.loc] && !ac.mxQueue) { G.startRefit(ac); return; }
      // v0.6.4 整修：調機到整修地點後開工
      if (ac.refurbQueue && !ac.mxQueue && G.refurbStep && G.refurbStep(ac, startLeg)) { if (ac.st === 'air') depart(ac); return; }
      if (ac.mxQueue && S.hubs[ac.loc]) {
        const need = G.CHECKS[ac.mxQueue].hangar;
        if (need && S.maintPolicy.useHangar !== false && G.hangarLevel(ac.loc) < need) {
          const t = G.TYPES[ac.type];
          const alt = Object.keys(S.hubs).filter((k) => G.hangarLevel(k) >= need && G.dist(G.AP[ac.loc], G.AP[k]) <= t.range)
            .sort((p, q) => G.dist(G.AP[ac.loc], G.AP[p]) - G.dist(G.AP[ac.loc], G.AP[q]))[0];
          if (alt) {
            log(`${ac.reg} 調機到 ${alt} 的維修棚廠進行${G.CHECKS[ac.mxQueue].name}`);
            startLeg(ac, G.AP[ac.loc], G.AP[alt], S.time, true);
            if (ac.st === 'air') depart(ac);
            return;
          }
        }
        startCheck(ac); return;
      }
      // 停飛中的飛機只能空機調往最近的樞紐
      if (ac.grounded || ((ac.mxQueue || ac.refitQueue) && !ac.route)) {
        if (!S.hubs[ac.loc]) startLeg(ac, G.AP[ac.loc], G.AP[G.nearestHub(ac.loc)], S.time, true);
        else ac.st = 'idle';
        if (ac.st === 'air') depart(ac);
        return;
      }
      // 政府包機任務優先於一般航線
      if (ac.charter && G.charterStep && G.charterStep(ac, startLeg)) { if (ac.st === 'air') depart(ac); return; }
      const r = S.routes.find((x) => x.id === ac.route);
      if (!r) { ac.st = 'idle'; return; }
      if (ac.loc !== r.a && ac.loc !== r.b) startLeg(ac, G.AP[ac.loc], G.AP[r.a], S.time, true);
      else startLeg(ac, G.AP[ac.loc], G.AP[ac.loc === r.a ? r.b : r.a], ac.readyAt, false);
      if (ac.st === 'air') depart(ac);
    }
    if (ac.st === 'stuck' && Math.random() < 0.01) { ac.st = 'turn'; ac.readyAt = S.time; }
  }

  // ---------- 每日與每月結算 ----------
  function endOfDay() {
    const S = G.S;
    S.fleet.forEach((ac) => { if (ac.mode === 'lease') spend(ac.lease / 30, 'lease'); spend(G.overheadDaily * G.fmod('overhead'), 'overhead'); });
    G.dailyV3(); // 人事薪資、招募離職、士氣、工會、董事會
    G.dailyV4(); // 保險費、股價
    if (G.worldDaily) G.worldDaily(); // v1.0.0-rc2 突發事件：油價、政局、疫情、天災……
    if (G.socialDaily) G.socialDaily(); // 社群媒體：每月刷新
    if (G.govDaily) G.govDaily(); // 政府合約：新標案、開標、包機期限
    if (G.usedDaily) G.usedDaily(); // 二手飛機市場：每季刷新
    if (G.loyaltyDaily) G.loyaltyDaily(); // v0.6.4 會員方案：年費、福利成本、會員人數
    if (G.rivalsDaily) G.rivalsDaily(); // v0.7.0 真實航空公司每週反擊
    if (G.adviceDaily) G.adviceDaily(); // v0.8.0 每週檢查航線機型大小
    if (G.allianceDaily) G.allianceDaily(); // v0.9.0 航空聯盟：會費、申請審查、AI 的邀請回覆與入盟申請
    if (G.stockDaily) G.stockDaily(); // v0.9.0 股市：大盤、各航空公司股價、持股、股利
    if (G.autoFaresDaily) G.autoFaresDaily(); // 自動定價的航線每天重新計算
    Object.entries(S.hubs).forEach(([k, h]) => {
      let up = G.hubUpkeepMonthly(G.AP[k], h.type);
      Object.entries(h.upgrades).forEach(([u, lv]) => (up += (lv || 0) * (G.UPGRADES[u] ? G.UPGRADES[u].upkeep : 0)));
      spend(up / 30, 'hub');
    });
    const d = S.day;
    // 社會評價：每日朝乘客滿意度決定的目標值移動
    const sat = d.satPax ? d.satSum / d.satPax : null;
    if (sat != null) S.rep = Math.max(0, Math.min(100, S.rep + (15 + 70 * sat - S.rep) * 0.015 * G.fmod('attention')));
    const costTotal = Object.entries(d.cost).filter(([k]) => !G.ONE_OFF.includes(k)).reduce((s, [, v]) => s + v, 0);
    const dayStart = (S.lastDay - 1) * DAY; // 剛結束的那一天（UTC）
    S.days.push({ t: dayStart + DAY / 2, rev: d.rev, gov: d.gov || 0, member: d.member || 0, paxB: d.paxB || 0, other: d.other, inflow: { ...d.inflow }, gain: d.gain || 0, anc: d.anc || 0, cancels: d.cancels || 0, cost: { ...d.cost }, costOp: costTotal, pax: d.pax, flights: d.flights, cash: S.cash, sat, rep: S.rep });
    G.boardDaily(d.rev - costTotal); // 董事會追蹤營業利益
    if (S.days.length > 400) S.days.shift();
    const dt = new Date(dayStart), nt = new Date(S.lastDay * DAY);
    const closed = dt.getUTCMonth() !== nt.getUTCMonth();
    if (closed) closeMonth(dt);
    S.day = emptyDay();
    if (closed && G.govMonthly) G.govMonthly(dt); // 合約撥款記在新月份
    if (S.cash < 0) log(`現金為負數（${G.money(S.cash)}），請盡快改善營運`, 'warn');
  }
  function closeMonth(dt) {
    const S = G.S, y = dt.getUTCFullYear(), m = dt.getUTCMonth();
    const days = S.days.filter((d) => { const x = new Date(d.t); return x.getUTCFullYear() === y && x.getUTCMonth() === m; });
    const sum = { rev: 0, gov: 0, member: 0, other: 0, anc: 0, cancels: 0, cost: {}, inflow: {}, gain: 0, pax: 0, flights: 0 };
    days.forEach((d) => {
      sum.rev += d.rev; sum.gov += d.gov || 0; sum.member += d.member || 0; sum.other += d.other || 0; sum.anc += d.anc || 0; sum.cancels += d.cancels || 0; sum.pax += d.pax; sum.flights += d.flights; sum.gain += d.gain || 0;
      Object.entries(d.cost).forEach(([k, v]) => (sum.cost[k] = (sum.cost[k] || 0) + v));
      Object.entries(d.inflow || {}).forEach(([k, v]) => (sum.inflow[k] = (sum.inflow[k] || 0) + v));
    });
    const rec = { y, m: m + 1, ...sum, cash: S.cash, rep: S.rep };
    S.months.push(rec);
    G.finCloseMonth(rec); // 折舊、貸款還款、營所稅、三大報表
    rec.cash = S.cash;
    S.routes.forEach((r) => { r.hist.push({ ...r.stats }); if (r.hist.length > 24) r.hist.shift(); r.stats = newStats(); });
    log(`${y} 年 ${m + 1} 月結算完成`);
  }

  // ---------- 時間推進 ----------
  G.advance = (minutes) => {
    const S = G.S;
    if (!S) return;
    const steps = Math.max(1, Math.ceil(minutes / 5));
    const dtm = (minutes * MIN) / steps;
    for (let i = 0; i < steps; i++) {
      S.time += dtm;
      for (const ac of S.fleet.slice()) stepAircraft(ac);
      const dayNo = Math.floor(S.time / DAY);
      if (dayNo !== S.lastDay) { S.lastDay = dayNo; endOfDay(); emit('day'); }
    }
  };

  // ---------- 存檔 ----------
  G.save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.S)); return true; } catch (e) { return false; } };
  G.load = () => {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return false;
      G.S = migrate(JSON.parse(s));
      emit('all');
      return true;
    } catch (e) { return false; }
  };
  G.hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  G.wipe = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };
  G.exportSave = () => JSON.stringify(G.S);
  G.importSave = (txt) => { G.S = migrate(JSON.parse(txt)); emit('all'); };
  G.migrateSave = migrate; // v1.0 存檔系統（saves.js）用
})();
