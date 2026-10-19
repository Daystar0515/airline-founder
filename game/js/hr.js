// v0.3 模擬：創始人、董事會協議、員工名冊與薪資、士氣與招募離職、工會訴求與罷工、餐飲供餐。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sround = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0); // 隨機進位，讓小數人數也會發生
  const log = (m, k) => G.log(m, k);

  // ---------- 初始化與舊存檔升級 ----------
  function baseHR() {
    const groups = {}, unions = {};
    G.STAFF_GROUPS.forEach((g) => (groups[g] = { count: 0, wage: 1, morale: 65 }));
    G.UNION_GROUPS.forEach((g) => (unions[g] = { formed: false, relation: 55, next: null, demand: null, strike: null }));
    return { sched: 'standard', groups, unions };
  }
  G.initV3 = (S) => {
    S.hr = baseHR();
    S.catering = G.defaultCatering();
    const F = G.FOUNDERS[S.founder.type];
    S.board = F.board ? newTerm(S.time, 1, G.BOARD.firstTarget, 'standard') : null;
    // 創業團隊：樞紐地勤與行政人員到職
    const req = G.staffRequired();
    G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].count = req[g]));
  };
  G.migrateV3 = (S) => {
    S.founder = S.founder || { type: 'classic', equity: 100 };
    S.hr = baseHR(); S.catering = G.defaultCatering(); S.board = null;
    Object.values(S.hubs).forEach((h) => (h.upgrades.kitchen = h.upgrades.kitchen || 0));
    const prev = G.S; G.S = S;
    const req = G.staffRequired();
    G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].count = req[g]));
    G.UNION_GROUPS.forEach((g) => { if (req[g] >= G.UNION_FORM_AT) formUnion(g, true); });
    G.S = prev;
  };
  function newTerm(start, n, target, clause) {
    return { term: n, start, end: start + G.BOARD.termYears * 365 * DAY, target, clause, termProfit: 0, yearProfit: 0, yearStart: start, optionsGranted: 0, probation: null };
  }

  // ---------- 人力需求 ----------
  // v1.0 效能：同一個時間點、機隊與樞紐沒變時沿用結果（每個航班都會查人力是否足夠）
  let srKey = '', srVal = null;
  G.staffRequired = () => {
    const S = G.S, key = S.time + ':' + S.fleet.length + ':' + Object.keys(S.hubs).length + ':' + S.hr.sched + ':' + (G.hubVer || 0) + ':' + (G.routeVer || 0);
    if (key === srKey && srVal) return { ...srVal };
    srKey = key; srVal = staffRequired0();
    return { ...srVal };
  };
  const staffRequired0 = () => {
    const S = G.S, k = G.SCHEDULES[S.hr.sched].k;
    const r = { pilot: 0, cabin: 0, ground: 0, office: 0 };
    S.fleet.forEach((ac) => {
      const n = G.staffPerAircraft(G.TYPES[ac.type], G.cabinSeats(ac.cabin));
      r.pilot += n.pilot; r.cabin += n.cabin; r.ground += n.ground;
    });
    r.pilot = Math.ceil(r.pilot / k); r.cabin = Math.ceil(r.cabin / k);
    Object.entries(S.hubs).forEach(([iata, h]) => (r.ground += Math.round(G.STAFF_PER_HUB[G.AP[iata].size] * (h.type === 'primary' ? 1 : 0.6))));
    r.office = 10 + Math.ceil(0.05 * (r.pilot + r.cabin + r.ground));
    return r;
  };
  G.staffRatio = (g) => {
    const req = G.staffRequired()[g];
    return req ? G.S.hr.groups[g].count / req : 1;
  };
  G.onStrike = (g) => { const u = G.S.hr.unions[g]; return !!(u && u.strike && u.strike.active); };
  G.wageMonthly = (g) => G.STAFF[g].wage * G.wageFactor(G.AP[G.primaryHub()].cc) * G.S.hr.groups[g].wage * G.fmod('payroll');
  G.payrollMonthly = () => G.STAFF_GROUPS.reduce((s, g) => s + G.S.hr.groups[g].count * G.wageMonthly(g), 0);

  // 新飛機交機時，先招募八成新增人力（含招募與訓練費）
  G.onAcquire = (ac) => {
    const S = G.S, req = G.staffRequired();
    ['pilot', 'cabin', 'ground', 'office'].forEach((g) => {
      const gap = req[g] - S.hr.groups[g].count;
      if (gap <= 0) return;
      const n = Math.ceil(gap * 0.8);
      S.hr.groups[g].count += n;
      G._spend(n * G.STAFF[g].hireCost, 'hiring');
    });
  };

  // ---------- 營運影響 ----------
  // 取消航班的機率：機師或空服員不足、罷工
  G.cancelProb = () => {
    if (!G.S.hr) return 0;
    let p = 0;
    const sp = G.staffRatio('pilot'), sc = G.staffRatio('cabin');
    if (sp < 1) p += (1 - sp) * 1.5;
    if (sc < 0.7) p += (0.7 - sc) * 2;
    if (G.onStrike('pilot') || G.onStrike('cabin')) p = Math.max(p, 0.85);
    if (G.onStrike('ground')) p = Math.max(p, 0.4);
    return Math.min(0.95, p);
  };
  // 過站與檢查工期倍率：地勤不足或罷工時變慢
  G.groundFactor = () => {
    if (!G.S.hr) return 1;
    const sg = G.staffRatio('ground');
    return (sg < 1 ? 1 / Math.max(0.5, sg) : 1) * (G.onStrike('ground') ? 2 : 1);
  };
  // 空服人力與士氣對服務滿意度的影響
  G.cabinServiceFactor = () => {
    if (!G.S.hr) return 1;
    const sc = G.staffRatio('cabin'), m = G.S.hr.groups.cabin.morale;
    return (0.8 + 0.2 * Math.min(1, sc)) * (m < 40 ? 0.92 : 1);
  };

  // ---------- 餐飲 ----------
  // 回傳某艙等旅客的餐點成本、付費餐點收入與滿意度倍率
  G.catering = (cls, h, fromIata, pax) => {
    const C = G.S.catering, lvl = C.meals[cls] || 'none', M = G.MEALS[lvl], sup = G.SUPPLIERS[C.supplier];
    const hub = G.S.hubs[fromIata], klv = hub ? Math.min(3, hub.upgrades.kitchen || 0) : 0, kitchen = klv > 0;
    const n = G.mealsPerFlight(h);
    let cost = M.cost * G.MEAL_CLASS_MUL[cls] * sup.cost * (G.KITCHEN ? G.KITCHEN.cost[klv] : kitchen ? 0.75 : 1) * n * (C.special ? 1.02 : 1) * pax;
    let anc = 0;
    if (lvl === 'bob') anc = pax * G.BOB.buyRate * G.BOB.margin * n * G.fmod('ancillary');
    if (lvl === 'none') cost = 0;
    const L = M.score + (lvl === 'none' ? 0 : sup.q + (G.KITCHEN ? G.KITCHEN.q[klv] : kitchen ? 0.05 : 0) + (C.special ? 0.03 : 0));
    const mult = clamp(1 + 0.3 * (L - G.mealExpect(cls, h)), 0.75, 1.15);
    return { cost, anc, mult };
  };
  G.setCatering = (patch) => { Object.assign(G.S.catering, patch); };
  G.setMeal = (cls, lvl) => { G.S.catering.meals[cls] = lvl; };

  // ---------- 玩家操作：薪資與排班 ----------
  G.setWage = (g, w) => {
    const grp = G.S.hr.groups[g], old = grp.wage;
    w = clamp(Math.round(w * 100) / 100, 0.7, 1.6);
    grp.wage = w;
    if (w < old) grp.morale = clamp(grp.morale - (old - w) * 80, 0, 100); // 減薪立刻打擊士氣
    else grp.morale = clamp(grp.morale + (w - old) * 30, 0, 100);
    log(`${G.STAFF[g].name}薪資調整為市場行情的 ${Math.round(w * 100)}%`);
  };
  G.setSchedule = (key) => {
    G.S.hr.sched = key;
    log(`排班政策改為「${G.SCHEDULES[key].name}」`);
  };

  // ---------- 工會 ----------
  function formUnion(g, quiet) {
    const u = G.S.hr.unions[g];
    u.formed = true;
    u.next = G.S.time + rnd(60, 120) * DAY;
    if (!quiet) { log(`${G.STAFF[g].name}成立工會`, 'warn'); G._emit('event', { kind: 'union', group: g }); }
  }
  function makeDemand(g) {
    const S = G.S, grp = S.hr.groups[g], req = G.staffRequired()[g];
    const wl = G.SCHEDULES[S.hr.sched].k * Math.max(1, req / Math.max(1, grp.count));
    let d;
    if (grp.wage < 1.08 || grp.morale < 55) d = { kind: 'raise', pct: Math.round(rnd(5, 12)) };
    else if (g !== 'ground' && (S.hr.sched === 'tight' || wl > 1.05)) d = { kind: 'hours' };
    else d = { kind: 'bonus', amount: Math.round(grp.count * G.wageMonthly(g) * 0.5) };
    d.deadline = S.time + 14 * DAY;
    d.text = demandText(g, d);
    return d;
  }
  function demandText(g, d) {
    if (d.kind === 'raise') return `${G.STAFF[g].name}薪資調高 ${d.pct}%`;
    if (d.kind === 'hours') return `排班放寬一級（${G.SCHEDULES[G.S.hr.sched].name} → ${G.SCHEDULES[G.S.hr.sched === 'tight' ? 'standard' : 'relaxed'].name}），減少工時`;
    return `發放一次性獎金 ${G.money(d.amount)}`;
  }
  G.demandText = demandText;
  function applyDemand(g, d, k) {
    const S = G.S, grp = S.hr.groups[g];
    if (d.kind === 'raise') grp.wage = clamp(grp.wage * (1 + (d.pct * k) / 100), 0.7, 1.8);
    else if (d.kind === 'hours') { if (k >= 1 || Math.random() < 0.5) S.hr.sched = S.hr.sched === 'tight' ? 'standard' : 'relaxed'; }
    else G._spend(d.amount * k, 'payroll');
  }
  function strikeCheck(g) {
    const S = G.S, u = S.hr.unions[g], grp = S.hr.groups[g];
    const p = clamp((45 - grp.morale) / 30 + (35 - u.relation) / 60, 0, 0.9);
    if (Math.random() >= p) return false;
    const start = S.time + G.STRIKE_NOTICE_DAYS * DAY;
    u.strike = { start, end: start + Math.round(rnd(3, 10)) * DAY, active: false, demand: u.demand || makeDemand(g) };
    G.repDelta(-3, `${G.STAFF[g].name}工會宣布 ${G.STRIKE_NOTICE_DAYS} 天後罷工`);
    G._emit('event', { kind: 'strike-notice', group: g });
    return true;
  }
  // 玩家回應工會訴求：accept 接受、negotiate 協商、reject 拒絕
  G.respondDemand = (g, choice) => {
    const S = G.S, u = S.hr.unions[g], grp = S.hr.groups[g], d = u.demand;
    if (!d) return { ok: false };
    let msg;
    if (choice === 'accept') {
      applyDemand(g, d, 1); u.relation = clamp(u.relation + 10, 0, 100); grp.morale = clamp(grp.morale + 8, 0, 100);
      msg = `接受${G.STAFF[g].name}工會訴求：${d.text}`;
    } else if (choice === 'negotiate') {
      const fu = typeof G.founder().union === 'object' ? G.fmod('union', g) : G.fmod('union');
      const p = 0.4 + u.relation / 200 + fu;
      if (Math.random() < p) {
        applyDemand(g, d, 0.5); u.relation = clamp(u.relation + 3, 0, 100); grp.morale = clamp(grp.morale + 3, 0, 100);
        msg = `與${G.STAFF[g].name}工會協商成功，以一半條件達成協議`;
      } else {
        u.relation = clamp(u.relation - 8, 0, 100); grp.morale = clamp(grp.morale - 5, 0, 100);
        msg = `與${G.STAFF[g].name}工會協商破裂`;
        if (strikeCheck(g)) msg += '，工會決議罷工';
      }
    } else {
      u.relation = clamp(u.relation - 15, 0, 100); grp.morale = clamp(grp.morale - 8, 0, 100);
      msg = `拒絕${G.STAFF[g].name}工會訴求`;
      if (strikeCheck(g)) msg += '，工會決議罷工';
    }
    u.demand = null;
    u.next = S.time + rnd(120, 240) * DAY;
    log(msg, choice === 'accept' ? 'info' : 'warn');
    return { ok: true, msg };
  };
  // 和解：接受罷工訴求（加薪幅度 ×1.2），立即結束或取消罷工
  G.settleStrike = (g) => {
    const S = G.S, u = S.hr.unions[g];
    if (!u.strike) return { ok: false };
    const d = u.strike.demand;
    applyDemand(g, d.kind === 'raise' ? { ...d, pct: d.pct * 1.2 } : d, 1);
    const was = u.strike.active;
    u.strike = null; u.relation = clamp(u.relation + 5, 0, 100); S.hr.groups[g].morale = clamp(S.hr.groups[g].morale + 6, 0, 100);
    if (was) G.repDelta(1, `${G.STAFF[g].name}罷工落幕`);
    log(`與${G.STAFF[g].name}工會和解：${d.text}`);
    return { ok: true };
  };

  // ---------- 每日結算 ----------
  G.dailyV3 = () => {
    const S = G.S, req = G.staffRequired(), k = G.SCHEDULES[S.hr.sched].k;
    G.STAFF_GROUPS.forEach((g) => {
      const grp = S.hr.groups[g], st = G.STAFF[g], u = S.hr.unions[g];
      // 薪資
      G._spend((grp.count * G.wageMonthly(g)) / 30, 'payroll');
      // 士氣：薪資、工作量、社會評價、創始人背景、勞資關係
      const flight = g === 'pilot' || g === 'cabin';
      const wl = (flight ? k : 1) * Math.max(1, req[g] / Math.max(1, grp.count));
      let target = 58 + 70 * (grp.wage - 1) - 120 * (wl - 1) + (S.rep - 50) * 0.2 + G.fmod('morale', g) + (u ? (u.relation - 50) * 0.1 : 0);
      if (flight && S.hr.sched === 'relaxed') target += 5;
      grp.morale = clamp(grp.morale + (clamp(target, 0, 100) - grp.morale) * 0.03, 0, 100);
      // 招募
      const gap = req[g] - grp.count;
      if (gap > 0) {
        const attract = clamp(0.5 + 1.5 * (grp.wage - 1) + (grp.morale - 50) / 100 + (S.rep - 50) / 200, 0.05, 1.5);
        const cap = Math.max(1, req[g] * 0.02) * st.hireSpeed * G.fmod('hire', g) * attract;
        const n = Math.min(gap, sround(cap));
        if (n > 0) { grp.count += n; G._spend(n * st.hireCost, 'hiring'); }
      }
      // 離職
      const quit = sround(grp.count * (0.0003 + Math.max(0, 50 - grp.morale) * 0.00008));
      if (quit > 0) grp.count = Math.max(0, grp.count - quit);
    });
    // 工會
    G.UNION_GROUPS.forEach((g) => {
      const u = S.hr.unions[g], grp = S.hr.groups[g];
      if (!u.formed) { if (grp.count >= G.UNION_FORM_AT) formUnion(g); return; }
      if (u.strike) {
        const s = u.strike;
        if (!s.active && S.time >= s.start) {
          s.active = true;
          log(`${G.STAFF[g].name}罷工開始，預計 ${Math.round((s.end - s.start) / DAY)} 天`, 'warn');
          G._emit('event', { kind: 'strike', group: g });
        }
        if (s.active) {
          G.repDelta(-1.5);
          if (S.time >= s.end) {
            applyDemand(g, s.demand, 0.5);
            u.strike = null; u.relation = clamp(u.relation - 10, 0, 100); grp.morale = clamp(grp.morale + 5, 0, 100);
            log(`${G.STAFF[g].name}罷工結束，勞資雙方以一半條件達成協議`, 'warn');
            G._emit('event', { kind: 'strike-end', group: g });
          }
        }
        return;
      }
      if (u.demand && S.time >= u.demand.deadline) { log(`${G.STAFF[g].name}工會訴求逾期未回應，視為拒絕`, 'warn'); G.respondDemand(g, 'reject'); return; }
      if (!u.demand && u.next && S.time >= u.next) {
        u.demand = makeDemand(g);
        // 士氣越低，下一次提出訴求的間隔越短
        log(`${G.STAFF[g].name}工會提出訴求：${u.demand.text}（14 天內回應）`, 'warn');
        G._emit('event', { kind: 'demand', group: g, text: u.demand.text });
      }
    });
  };

  // ---------- 董事會（職業經理人）----------
  G.boardDaily = (opProfit) => {
    const S = G.S, B = S.board;
    if (!B || B.pending || B.dismissed) return;
    B.termProfit += opProfit; B.yearProfit += opProfit;
    if (B.probation) {
      if (S.time >= B.probation.end) {
        const ok = B.yearProfit >= B.target / G.BOARD.termYears && S.rep >= G.BOARD.repMin;
        if (ok) { B.pending = { met: true, probationPassed: true }; G._emit('event', { kind: 'board', ...B.pending }); }
        else { B.dismissed = true; log('董事會決議解除你的經營職務', 'warn'); G._emit('event', { kind: 'dismissed' }); }
      }
      return;
    }
    // 年度檢視：認股權條款
    if (S.time - B.yearStart >= 365 * DAY) {
      if (B.clause === 'options' && B.yearProfit > 0 && B.optionsGranted < 10) {
        B.optionsGranted += 2; S.founder.equity = Math.min(100, S.founder.equity + 2);
        log(`認股權條款：本年度營業利益 ${G.money(B.yearProfit)}，取得 2% 股權（目前持股 ${S.founder.equity}%）`);
      }
      B.yearProfit = 0; B.yearStart += 365 * DAY;
    }
    if (S.time >= B.end) {
      const met = B.termProfit >= B.target && S.rep >= G.BOARD.repMin;
      if (met && B.clause === 'equity') { S.founder.equity = Math.min(100, S.founder.equity + 5); log(`股權獎酬條款：達成任期目標，取得 5% 股權（目前持股 ${S.founder.equity}%）`); }
      if (met) { B.pending = { met: true }; }
      else {
        B.probation = { end: S.time + 365 * DAY };
        B.yearProfit = 0;
        log(`第 ${B.term} 任期未達董事會目標（營業利益 ${G.money(B.termProfit)}／目標 ${G.money(B.target)}），留任察看一年`, 'warn');
        B.pending = { met: false };
      }
      G._emit('event', { kind: 'board', ...B.pending });
    }
  };
  // 玩家選擇續約條款
  G.boardRenew = (clause) => {
    const S = G.S, B = S.board;
    if (!B || !B.pending) return;
    if (!B.pending.met) { B.pending = null; return; } // 察看期，維持原條件
    const c = G.BOARD.clauses[clause];
    const allowed = B.pending.probationPassed ? 'standard' : clause;
    S.board = newTerm(S.time, B.term + 1, B.target * G.BOARD.clauses[allowed].targetMul, allowed);
    log(`與董事會簽訂第 ${B.term + 1} 任期協議：${G.BOARD.clauses[allowed].name}，5 年營業利益目標 ${G.money(S.board.target)}`);
    return c;
  };
})();
