// v0.6 政府合約：偏遠航線補貼、政府包機、撤僑任務、公務運輸標案；投標評分與履約。
// 招標機關一律以「某國＋機關類別」的通稱表示，不指涉真實機關的實際標案。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (m, k) => G.log(m, k);

  G.GOV = {
    firstAfter: 12 * DAY, // 開業後多久出現第一個標案
    every: [16, 32], // 每隔幾天出現新標案
    maxOpen: 4,
    bidDays: 14, // 投標期
    pickDays: 3, // 得標後幾天內要派出飛機（包機）
    evacPerDay: 0.0016, // 每天出現撤僑任務的機率（約每 1.7 年一次）
    strikes: 3, // 公務合約連續幾個月不合格就解約
  };
  G.GOV_KINDS = {
    pso: { name: '偏遠航線補貼', agency: '交通主管機關', icon: '島' },
    charter: { name: '政府包機', agency: '外交部門', icon: '包' },
    evac: { name: '撤僑任務', agency: '外交部門', icon: '撤' },
    travel: { name: '公務運輸標案', agency: '公務採購機關', icon: '公' },
  };

  G.initGov = (S) => { if (!S.gov) S.gov = { seq: 1, tenders: [], contracts: [], done: [], nextAt: S.time + G.GOV.firstAfter }; };

  // ---------- 評分 ----------
  // 品質分數 0–100：社會評價 30%、飛安 25%、準點 20%、信用 15%、員工士氣 10%
  G.govQuality = () => {
    const S = G.S;
    const yrs = Math.max(0.5, (S.time - S.start) / YEAR);
    const crashAge = S.safety.lastCrash ? (S.time - S.safety.lastCrash) / YEAR : 99;
    const safety = clamp(100 - (S.safety.emergencies / yrs) * 15 - (crashAge < 3 ? 60 * (1 - crashAge / 3) : 0), 0, 100);
    let fl = 0, dl = 0;
    S.routes.forEach((r) => { [...r.hist.slice(-3), r.stats].forEach((s) => { fl += s.flights || 0; dl += s.delays || 0; }); });
    const otp = fl ? 1 - dl / fl : null;
    const ontime = otp == null ? 60 : clamp(((otp - 0.7) / 0.25) * 100, 0, 100);
    const credit = G.credit ? G.credit().score : 50;
    const staff = S.hr ? G.STAFF_GROUPS.reduce((s, g) => s + S.hr.groups[g].morale, 0) / G.STAFF_GROUPS.length : 60;
    const parts = { rep: S.rep, safety, ontime, credit, staff };
    const quality = 0.3 * parts.rep + 0.25 * safety + 0.2 * ontime + 0.15 * credit + 0.1 * staff;
    return { parts, quality, otp, bonus: G.fmod('gov') };
  };
  // 價格分數 0–100：報價越低越高分（公務標案看折扣）
  G.govPriceScore = (t, bid) => (t.kind === 'travel' ? clamp((bid / 0.3) * 100, 0, 100) : clamp(((t.budget - bid) / (t.budget * 0.5)) * 100, 0, 100));
  G.govScore = (t, bid) => {
    const q = G.govQuality();
    const price = G.govPriceScore(t, bid);
    return { price, quality: q.quality, total: (0.5 * price + 0.5 * q.quality) * (1 + q.bonus), q };
  };
  // 資格：近 12 個月失事者不得投標包機與偏遠航線；撤僑需要社會評價 50 以上
  G.govEligible = (t) => {
    const S = G.S;
    const crash = S.safety.lastCrash && S.time - S.safety.lastCrash < YEAR;
    if ((t.kind === 'pso' || t.kind === 'charter' || t.kind === 'evac') && crash) return '近 12 個月內發生失事，不符合投標資格';
    if (t.kind === 'evac' && S.rep < 50) return '社會評價低於 50，外交部門不會委託撤僑任務';
    if (t.kind === 'travel' && G.routesFrom(t.a).length < t.minRoutes) return `需要至少 ${t.minRoutes} 條從 ${t.a} 出發的航線`;
    return null;
  };
  G.routesFrom = (iata) => G.S.routes.filter((r) => r.a === iata || r.b === iata);

  // ---------- 成本估算（給預算與玩家參考）----------
  const cheapestType = (seats, dist, A, B) => window.AIRCRAFT.filter((t) => t.maxSeats >= seats && !G.canFly(t, A, B)).sort((p, q) => p.price - q.price)[0];
  G.charterCost = (t, A, B) => {
    const d = G.dist(A, B), h = G.blockMinutes(t, G.legKm(A, B)) / 60;
    return 2 * G.estFlightCost(t, d, 0, h);
  };

  // ---------- 產生標案 ----------
  function hubCountries() {
    const S = G.S, out = [];
    Object.entries(S.hubs).forEach(([k, h]) => { const cc = G.AP[k].cc; out.push(cc); if (h.type === 'primary') out.push(cc, cc); });
    return out;
  }
  const hubsIn = (cc) => Object.keys(G.S.hubs).filter((k) => G.AP[k].cc === cc);
  function makePSO(cc) {
    const S = G.S, hubs = hubsIn(cc);
    if (!hubs.length) return null;
    const a = pick(hubs), A = G.AP[a];
    // 排除已經有補貼合約或正在招標的航點；至少要有一種機型能飛
    const taken = new Set([...S.gov.contracts, ...S.gov.tenders].filter((c) => c.kind === 'pso').map((c) => c.b));
    const cand = G.AIRPORTS.filter((x) => x.cc === cc && x.iata !== a && !taken.has(x.iata) && (x.size === 2 || (x.size === 1 && x.popK < 400)))
      .map((x) => ({ x, d: G.dist(A, x) })).filter((o) => o.d >= 120 && o.d <= 1400 && window.AIRCRAFT.some((t) => !G.canFly(t, A, o.x)));
    if (!cand.length) return null;
    const { x: B, d } = pick(cand);
    const weekly = pick([3, 5, 7, 7, 14]);
    const flightsMonth = weekly * 2 * 4.33;
    const budget = Math.round((flightsMonth * (2500 + 7 * d) * rnd(0.8, 1.25)) / 1000) * 1000;
    return { kind: 'pso', cc, a, b: B.iata, dist: d, weekly, fareCapY: pick([0.8, 0.9, 1.0]), months: 24, budget, title: `${A.city} ⇄ ${B.city} 偏遠航線補貼`,
      desc: `每週至少 ${weekly} 個往返班次，經濟艙票價不得高於參考票價的 ${'{CAP}'}，為期 24 個月；每月依實際執飛比例撥付補貼。` };
  }
  function makeCharter(cc) {
    const hubs = hubsIn(cc);
    if (!hubs.length) return null;
    const a = pick(hubs), A = G.AP[a];
    const seats = pick([80, 120, 160, 220, 280]);
    const cand = G.AIRPORTS.filter((x) => x.size === 0 && x.popK >= 1500 && x.cc !== cc && !G.routeRoleWhy(A, x)).map((x) => ({ x, d: G.dist(A, x) })).filter((o) => o.d >= 600 && o.d <= 11000);
    if (!cand.length) return null;
    const { x: B, d } = pick(cand);
    const t = cheapestType(seats, d, A, B);
    if (!t) return null;
    const cost = G.charterCost(t, A, B);
    const budget = Math.round((cost * rnd(2.4, 3.2) + seats * 60) / 1000) * 1000;
    const hold = Math.round(rnd(1, 4));
    return { kind: 'charter', cc, a, b: B.iata, dist: d, seats, hold, days: 12 + hold, budget, refType: t.id,
      title: `${G.countryZh(cc)}代表團 ${A.city} ⇄ ${B.city} 包機`, desc: `至少 ${seats} 座的飛機，往返 ${A.iata}–${B.iata}，在當地停留 ${hold} 天；得標後 ${G.GOV.pickDays} 天內派出飛機，${12 + hold} 天內完成。` };
  }
  function makeEvac(cc) {
    const hubs = hubsIn(cc);
    if (!hubs.length) return null;
    const a = pick(hubs), A = G.AP[a];
    const cand = G.AIRPORTS.filter((x) => x.size <= 1 && x.cc !== cc && !G.routeRoleWhy(A, x)).map((x) => ({ x, d: G.dist(A, x) })).filter((o) => o.d >= 800 && o.d <= 9000);
    if (!cand.length) return null;
    const { x: B, d } = pick(cand);
    const seats = pick([150, 200, 250]);
    const t = cheapestType(seats, d, A, B);
    if (!t) return null;
    const fee = Math.round((G.charterCost(t, A, B) * rnd(3.2, 4) + seats * 80) / 1000) * 1000;
    return { kind: 'evac', cc, a, b: B.iata, dist: d, seats, hold: 0, days: 6, budget: fee, refType: t.id,
      title: `${G.countryZh(B.cc)}緊急撤僑：${B.city} → ${A.city}`, desc: `當地局勢惡化，${G.countryZh(cc)}外交部門徵求至少 ${seats} 座的飛機，48 小時內決定、6 天內接回僑民。沒有競標，酬勞固定。` };
  }
  function makeTravel(cc) {
    const hubs = hubsIn(cc).filter((k) => G.routesFrom(k).length >= 1);
    if (!hubs.length) return null;
    const a = pick(hubs), A = G.AP[a];
    const minRoutes = Math.max(2, Math.min(5, G.routesFrom(a).length + pick([0, 1, 2])));
    const budget = Math.round((A.size === 0 ? rnd(140e3, 260e3) : A.size === 1 ? rnd(70e3, 140e3) : rnd(30e3, 70e3)) / 1000) * 1000;
    return { kind: 'travel', cc, a, minRoutes, otp: pick([0.8, 0.85, 0.9]), months: 12, budget,
      title: `${G.countryZh(cc)}公務人員差旅 ${A.city} 框架合約`, desc: `政府機關公務出差優先搭乘你從 ${A.iata} 出發的航班，每月採購金額 ${G.money(budget)}（扣除你提供的折扣）；需維持至少 ${minRoutes} 條 ${A.iata} 航線，準點率不低於 {OTP}，為期 12 個月。` };
  }
  function addTender(t) {
    const S = G.S;
    t.id = S.gov.seq++; t.created = S.time; t.status = 'open';
    t.deadline = S.time + (t.kind === 'evac' ? 2 : G.GOV.bidDays) * DAY;
    t.agency = `${G.countryZh(t.cc)}${G.GOV_KINDS[t.kind].agency}`;
    t.desc = t.desc.replace('{CAP}', t.fareCapY ? Math.round(t.fareCapY * 100) + '%' : '').replace('{OTP}', t.otp ? Math.round(t.otp * 100) + '%' : '');
    if (t.kind !== 'evac') {
      const n = 1 + Math.floor(Math.random() * 4); // 其他投標者（v1.x 競爭對手上線前以抽象分數代表）
      t.rivals = Array.from({ length: n }, () => Math.round(rnd(35, 72)));
      t.rivalNames = G.rivalNames ? G.rivalNames(t.cc, n) : []; // v0.7.0 用真實的本國航空公司當投標者
    }
    S.gov.tenders.push(t);
    G._emit('event', { kind: 'gov-tender', tender: t });
    log(`${t.agency}公告「${t.title}」${t.kind === 'evac' ? '，請在 48 小時內回覆' : `，${G.GOV.bidDays} 天後截止投標`}`, t.kind === 'evac' ? 'warn' : 'info');
  }
  G.govGenerate = (kind) => {
    const ccs = hubCountries(); if (!ccs.length) return null;
    const cc = pick(ccs);
    const k = kind || pick(['pso', 'pso', 'charter', 'charter', 'travel']);
    const t = { pso: makePSO, charter: makeCharter, evac: makeEvac, travel: makeTravel }[k](cc);
    if (t) addTender(t);
    return t;
  };

  // ---------- 玩家操作 ----------
  G.govBid = (id, bid) => {
    const S = G.S, t = S.gov.tenders.find((x) => x.id === id);
    if (!t || t.status !== 'open') return { ok: false, msg: '這個標案已經截止' };
    const why = G.govEligible(t); if (why) return { ok: false, msg: why };
    if (t.kind === 'travel') { if (!(bid >= 0 && bid <= 0.3)) return { ok: false, msg: '折扣請介於 0%–30%' }; }
    else if (!(bid > 0 && bid <= t.budget)) return { ok: false, msg: `報價需介於 0 與預算上限 ${G.money(t.budget)} 之間` };
    t.bid = bid; t.bidAt = S.time;
    log(`對「${t.title}」投標：${t.kind === 'travel' ? '折扣 ' + Math.round(bid * 100) + '%' : G.money(bid)}`);
    return { ok: true };
  };
  G.govWithdraw = (id) => { const t = G.S.gov.tenders.find((x) => x.id === id); if (t && t.status === 'open') t.bid = null; return { ok: true }; };
  // 撤僑：接受或婉拒
  G.govAcceptEvac = (id, acId) => {
    const S = G.S, t = S.gov.tenders.find((x) => x.id === id);
    if (!t || t.status !== 'open') return { ok: false, msg: '這個任務已經失效' };
    const why = G.govEligible(t); if (why) return { ok: false, msg: why };
    const c = award(t, t.budget);
    return G.govDispatch(c.id, acId);
  };
  G.govDecline = (id) => {
    const t = G.S.gov.tenders.find((x) => x.id === id);
    if (t) { t.status = 'declined'; G.S.gov.tenders = G.S.gov.tenders.filter((x) => x !== t); log(`婉拒「${t.title}」`); }
    return { ok: true };
  };
  // 可以執行包機的飛機：座位與航程足夠、沒有停飛或維修中
  G.charterCandidates = (c) => G.S.fleet.filter((ac) => {
    const t = G.TYPES[ac.type];
    return !ac.charter && !ac.grounded && ac.st !== 'maint' && ac.st !== 'aog' && ac.st !== 'refit' && ac.st !== 'refurb' && !ac.refurbQueue && G.cabinSeats(ac.cabin) >= c.seats && !G.canFly(t, G.AP[c.a], G.AP[c.b]);
  });
  G.govDispatch = (cid, acId) => {
    const S = G.S, c = S.gov.contracts.find((x) => x.id === cid);
    if (!c || c.state !== 'pick') return { ok: false, msg: '這份合約不需要派機' };
    const ac = S.fleet.find((a) => a.id === acId);
    if (!ac || !G.charterCandidates(c).includes(ac)) return { ok: false, msg: '這架飛機不符合任務需求（座位、航程、狀態）' };
    // 去程載客、回程空機（撤僑則相反）
    ac.charter = { cid: c.id, path: [c.a, c.b, c.a], i: 0, hold: c.hold || 0 };
    c.state = 'flying'; c.acId = ac.id; c.reg = ac.reg;
    log(`${ac.reg} 執行「${c.title}」${ac.route ? '，原航線暫停由其他飛機執飛' : ''}`);
    G._emit('fleet');
    return { ok: true, contract: c };
  };

  function award(t, price) {
    const S = G.S;
    S.gov.tenders = S.gov.tenders.filter((x) => x !== t);
    t.status = 'won';
    const c = { ...t, id: S.gov.seq++, tid: t.id, price, start: S.time, paid: 0, strikes: 0, log: [] };
    if (t.kind === 'pso') {
      c.state = 'active'; c.end = S.time + t.months * 30 * DAY;
      // 得標後由政府免收開航費；航線已經存在就直接適用
      let r = S.routes.find((x) => (x.a === t.a && x.b === t.b) || (x.a === t.b && x.b === t.a));
      if (!r) {
        const res = G.openRoute(t.a, t.b, { free: true });
        if (res.ok) { r = res.route; log(`政府補助開航 ${t.a} ⇄ ${t.b}，免收開航費`); }
      }
      if (r) { c.routeId = r.id; r.fareCap = { ...(r.fareCap || {}), Y: t.fareCapY }; if (r.fare.Y > t.fareCapY) r.fare.Y = t.fareCapY; r.gov = c.id; }
    } else if (t.kind === 'travel') { c.state = 'active'; c.end = S.time + t.months * 30 * DAY; }
    else { c.state = 'pick'; c.pickBy = S.time + G.GOV.pickDays * DAY; c.dueBy = S.time + t.days * DAY; }
    S.gov.contracts.push(c);
    return c;
  }
  function finish(c, ok, note) {
    const S = G.S;
    c.state = ok ? 'done' : 'failed'; c.closed = S.time; c.note = note;
    S.gov.contracts = S.gov.contracts.filter((x) => x !== c);
    S.gov.done.unshift(c); if (S.gov.done.length > 30) S.gov.done.pop();
    if (c.routeId) { const r = S.routes.find((x) => x.id === c.routeId); if (r) { delete r.gov; if (r.fareCap) delete r.fareCap.Y; } }
    G._emit('event', { kind: ok ? 'gov-done' : 'gov-failed', contract: c });
  }
  G.govIncome = (v, why) => {
    const S = G.S;
    S.cash += v; S.day.rev += v; S.day.gov = (S.day.gov || 0) + v;
    if (why) log(`${why}：收入 ${G.money(v)}`);
  };

  // ---------- 包機執行（由 sim.js 的 stepAircraft 呼叫）----------
  G.charterStep = (ac, startLeg) => {
    const S = G.S, ch = ac.charter;
    const c = S.gov.contracts.find((x) => x.id === ch.cid);
    if (!c) { ac.charter = null; return false; }
    if (ac.loc === ch.path[ch.i]) {
      ch.i++;
      if (ch.i === 2 && ch.hold && !ch.held) { ch.held = true; ac.st = 'turn'; ac.readyAt = S.time + ch.hold * DAY; return true; }
    }
    if (ch.i >= ch.path.length) {
      ac.charter = null;
      G.govIncome(c.price, `完成「${c.title}」`);
      c.paid += c.price;
      G.repDelta(c.kind === 'evac' ? 3 : 0.8, c.kind === 'evac' ? `${ac.reg} 順利完成撤僑任務` : null);
      finish(c, true, `${ac.reg} 準時完成`);
      ac.st = 'idle';
      return false;
    }
    startLeg(ac, G.AP[ac.loc], G.AP[ch.path[ch.i]], S.time, true);
    if (ac.leg) ac.leg.charter = true;
    return true;
  };

  // ---------- 每日：新標案、開標、期限 ----------
  G.govDaily = () => {
    const S = G.S;
    if (!S.gov) G.initGov(S);
    const gv = S.gov;
    if (S.time >= gv.nextAt) {
      if (gv.tenders.filter((t) => t.kind !== 'evac').length < G.GOV.maxOpen && Object.keys(S.hubs).length) G.govGenerate();
      gv.nextAt = S.time + rnd(G.GOV.every[0], G.GOV.every[1]) * DAY;
    }
    if (S.time - S.start > 60 * DAY && Math.random() < G.GOV.evacPerDay && !gv.tenders.some((t) => t.kind === 'evac')) G.govGenerate('evac');
    // 截止的標案開標
    gv.tenders.slice().forEach((t) => {
      if (S.time < t.deadline) return;
      if (t.kind === 'evac') { gv.tenders = gv.tenders.filter((x) => x !== t); log(`「${t.title}」已改由${(G.rivalNames && G.rivalNames(t.cc, 1)[0]) || '其他航空公司'}執行`); return; }
      if (t.bid == null) { gv.tenders = gv.tenders.filter((x) => x !== t); return; }
      const why = G.govEligible(t);
      const sc = G.govScore(t, t.bid), best = Math.max(...t.rivals), bestName = (t.rivalNames || [])[t.rivals.indexOf(best)];
      t.result = { score: sc.total, best };
      if (!why && sc.total > best) {
        const c = award(t, t.bid);
        log(`得標「${t.title}」！評分 ${sc.total.toFixed(1)}，最高對手 ${best}`);
        G._emit('event', { kind: 'gov-won', contract: c });
      } else {
        gv.tenders = gv.tenders.filter((x) => x !== t);
        t.status = 'lost';
        gv.done.unshift({ ...t, state: 'lost', closed: S.time, note: why || `評分 ${sc.total.toFixed(1)}，低於得標者${bestName ? ` ${bestName}` : ''} ${best}` });
        if (gv.done.length > 30) gv.done.pop();
        log(`未得標「${t.title}」（${why || `評分 ${sc.total.toFixed(1)}／得標者 ${best}`}）`, 'warn');
        G._emit('event', { kind: 'gov-lost', tender: t });
      }
    });
    // 包機：逾期未派機或逾期未完成
    gv.contracts.slice().forEach((c) => {
      if (c.state === 'pick' && S.time > c.pickBy) {
        const fine = c.price * 0.1;
        G._spend(fine, 'incident'); G.repDelta(-2, `未依約派出「${c.title}」的飛機`);
        finish(c, false, `未在期限內派機，罰款 ${G.money(fine)}`);
      }
      if (c.state === 'flying') {
        const ac = S.fleet.find((a) => a.id === c.acId);
        if (!ac) { G.repDelta(-4, `「${c.title}」任務失敗`); finish(c, false, '執行任務的飛機失事或已處分'); return; }
        if (S.time > c.dueBy + 3 * DAY) {
          ac.charter = null; ac.st = ac.st === 'air' ? ac.st : 'idle';
          const fine = c.price * 0.2;
          G._spend(fine, 'incident'); G.repDelta(-3, `「${c.title}」嚴重逾期`);
          finish(c, false, `逾期未完成，罰款 ${G.money(fine)}`);
        }
      }
      if ((c.kind === 'pso' || c.kind === 'travel') && c.state === 'active' && S.time >= c.end) finish(c, true, '合約期滿');
    });
  };

  // ---------- 每月：偏遠航線與公務標案的履約與撥款 ----------
  G.govMonthly = (dt) => {
    const S = G.S;
    if (!S.gov) return;
    const days = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    S.gov.contracts.slice().forEach((c) => {
      if (c.state !== 'active') return;
      let ratio = 1, note = '';
      if (c.kind === 'pso') {
        const r = S.routes.find((x) => x.id === c.routeId);
        const st = r && r.hist.length ? r.hist[r.hist.length - 1] : null;
        const need = c.weekly * 2 * (days / 7);
        const done = st ? st.flights : 0;
        ratio = clamp(done / need, 0, 1);
        note = `執飛 ${done}/${Math.round(need)} 班`;
        if (r && r.fare.Y > c.fareCapY + 1e-9) { ratio *= 0.5; note += '，經濟艙票價超過上限'; }
      } else {
        const rs = G.routesFrom(c.a);
        let fl = 0, dl = 0;
        rs.forEach((r) => { const st = r.hist[r.hist.length - 1]; if (st) { fl += st.flights; dl += st.delays || 0; } });
        const otp = fl ? 1 - dl / fl : 0;
        const okRoutes = rs.length >= c.minRoutes, okOtp = otp >= c.otp;
        ratio = okRoutes && okOtp ? 1 : 0.5;
        note = `${c.a} 航線 ${rs.length}/${c.minRoutes} 條、準點率 ${Math.round(otp * 100)}%`;
      }
      const base = c.kind === 'travel' ? c.budget * (1 - c.price) : c.price;
      const pay = ratio >= 0.6 ? base * ratio : 0;
      c.log.unshift({ t: S.time, ratio, pay, note }); if (c.log.length > 24) c.log.pop();
      if (pay > 0) { G.govIncome(pay, `「${c.title}」本月撥款（${note}）`); c.paid += pay; }
      if (ratio < 0.8) {
        c.strikes++;
        log(`「${c.title}」本月未達合約要求（${note}），累計 ${c.strikes}/${G.GOV.strikes} 次`, 'warn');
        if (c.strikes >= G.GOV.strikes) {
          const fine = base * 2;
          G._spend(fine, 'incident'); G.repDelta(-4, `「${c.title}」履約不佳遭解約`);
          finish(c, false, `連續未達要求遭解約，違約金 ${G.money(fine)}`);
        }
      } else c.strikes = 0;
    });
  };
})();
