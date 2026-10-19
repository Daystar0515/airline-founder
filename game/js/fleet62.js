// v0.6.2 機隊：機況、客艙改裝（花錢花時間）、艙位設定、批次購買與連號編號、每季刷新的二手飛機市場。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (m, k) => G.log(m, k);

  // ---------- 機況 ----------
  // 機況越差：機械延誤、緊急轉降、失事機率越高（機況 60% 約 ×1.8），客艙品質也打折
  G.condRisk = (ac, p) => {
    const c = ac.cond != null ? ac.cond : 1, m = 1 + 2 * (1 - c);
    return { delay: p.delay * m, emergency: p.emergency * m, crash: p.crash * m };
  };
  G.condPenalty = (ac) => (ac.cond != null ? Math.max(0, (0.95 - ac.cond) * 0.25) : 0);

  // ---------- 客艙改裝 ----------
  G.REFIT = { fixed: 80e3, seat: { Y: 2500, W: 6000, J: 45000, F: 120000 }, tierMul: [0.7, 0.85, 1, 1.3, 1.7], removePerSeat: 1500 };
  // 估算改裝費用與工期：換等級的艙等要整艙換新座椅；只加座位就只裝新增的部分
  G.refitPlan = (ac, cabin) => {
    const t = G.TYPES[ac.type], R = G.REFIT;
    let cost = R.fixed, installed = 0, premium = false, changed = false;
    G.classesFor(t).forEach((c) => {
      const o = ac.cabin[c] || { seats: 0, tier: 2 }, n = cabin[c] || { seats: 0, tier: 2 };
      if (o.seats === n.seats && (o.tier === n.tier || n.seats === 0)) return;
      changed = true;
      let add, rem;
      if (n.tier !== o.tier) { add = n.seats; rem = o.seats; } else { add = Math.max(0, n.seats - o.seats); rem = Math.max(0, o.seats - n.seats); }
      cost += add * R.seat[c] * R.tierMul[n.tier] + rem * R.removePerSeat;
      installed += add;
      if (add && (c === 'J' || c === 'F')) premium = true;
    });
    if (!changed) return null;
    return { cost: Math.round(cost / 1000) * 1000, days: Math.min(30, 3 + Math.ceil(installed / 40) + (premium ? 3 : 0)), installed };
  };
  // 包一層原本的 setCabin：新機交機前免費；之後排入改裝
  const setCabin0 = G.setCabin;
  G.setCabin = (acId, cabin) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId);
    if (ac.newCabin) return setCabin0(acId, cabin);
    if (ac.st === 'refit') return { ok: false, msg: '客艙改裝進行中，完工後才能再修改' };
    const old = ac.cabin, chk = setCabin0(acId, cabin); // 借用原本的容量檢查
    ac.cabin = old;
    if (!chk.ok) return chk;
    const plan = G.refitPlan(ac, cabin);
    if (!plan) return { ok: true, msg: '配置沒有變更' };
    if (S.cash < plan.cost) return { ok: false, msg: `改裝需要 ${G.money(plan.cost)}，現金不足` };
    ac.refitQueue = { cabin: JSON.parse(JSON.stringify(cabin)), cost: plan.cost, days: plan.days };
    log(`${ac.reg} 排入客艙改裝（${G.money(plan.cost)}、約 ${plan.days} 天），下次停在樞紐時開工`);
    G._emit('fleet');
    return { ok: true, queued: true, plan };
  };
  G.cancelRefit = (acId) => { const ac = G.S.fleet.find((a) => a.id === acId); if (ac && ac.st === 'refit') return { ok: false, msg: '改裝已經開工，無法取消' };
    if (ac && ac.refitQueue) { ac.refitQueue = null; log(`${ac.reg} 取消客艙改裝`); } return { ok: true }; };
  G.startRefit = (ac) => {
    const S = G.S, q = ac.refitQueue;
    // 自有飛機的改裝列為資本支出（加到飛機帳面價值），租賃飛機列為當期費用
    if (ac.mode === 'buy') { G._spend(q.cost, 'capex'); ac.cost = (ac.cost || 0) + q.cost; ac.book = (ac.book || 0) + q.cost; }
    else G._spend(q.cost, 'refit');
    ac.st = 'refit'; ac.refitUntil = S.time + q.days * DAY; ac.leg = null;
    log(`${ac.reg} 在 ${ac.loc} 開始客艙改裝，預計 ${q.days} 天`);
  };
  G.finishRefit = (ac) => {
    ac.cabin = ac.refitQueue.cabin; ac.refitQueue = null;
    ac.st = 'turn'; ac.readyAt = G.S.time;
    log(`${ac.reg} 完成客艙改裝（${G.cabinSeats(ac.cabin)} 座）`);
    const r = G.S.routes.find((x) => x.id === ac.route);
    if (r && r.autoFare && G.optimizeFares) G.optimizeFares(r);
  };

  // ---------- 艙位設定 ----------
  G.savePreset = (name, typeId, cabin) => {
    const S = G.S;
    S.cabinPresets = S.cabinPresets || [];
    name = (name || '').trim() || `${G.TYPES[typeId].model} 設定 ${S.cabinPresets.filter((p) => p.type === typeId).length + 1}`;
    const p = { id: (S.presetSeq = (S.presetSeq || 0) + 1), name: name.slice(0, 24), type: typeId, cabin: JSON.parse(JSON.stringify(cabin)) };
    S.cabinPresets.push(p);
    return { ok: true, preset: p };
  };
  G.deletePreset = (id) => { G.S.cabinPresets = (G.S.cabinPresets || []).filter((p) => p.id !== id); return { ok: true }; };
  G.presetsFor = (typeId) => (G.S.cabinPresets || []).filter((p) => p.type === typeId);
  G.cabinSummary = (t, cabin) => G.classesFor(t).filter((c) => cabin[c] && cabin[c].seats > 0).map((c) => `${c}${cabin[c].seats}・${G.TIERS[cabin[c].tier]}`).join(' ');

  // ---------- 批次購買與連號編號 ----------
  // 自訂編號：第二架起把最後一段數字加 1（B-58201 → B-58202）；沒有數字就加上 -2、-3…
  G.regSequence = (first, n) => {
    const S = G.S, out = [];
    if (!first) { for (let i = 0; out.length < n; i++) { const r = G.defaultReg(i); if (!out.includes(r)) out.push(r); } return { ok: true, regs: out }; }
    first = G.normReg(first);
    const m = /^(.*?)(\d+)$/.exec(first);
    for (let i = 0; i < n; i++) {
      const reg = i === 0 ? first : m ? m[1] + String(+m[2] + i).padStart(m[2].length, '0') : `${first}-${i + 1}`;
      const why = G.checkReg(reg);
      if (why) return { ok: false, msg: i ? `第 ${i + 1} 架的編號 ${reg}：${why}` : why };
      out.push(reg);
    }
    return { ok: true, regs: out };
  };
  G.acquireMany = (typeId, mode, n, firstReg, presetId) => {
    const S = G.S, t = G.TYPES[typeId];
    n = clamp(Math.round(n || 1), 1, 20);
    const seq = G.regSequence(firstReg, n);
    if (!seq.ok) return seq;
    const unit = mode === 'buy' ? t.price * 1e6 : G.leaseMonthly(t) * 2;
    if (S.cash < unit * n) return { ok: false, msg: `資金不足：${n} 架需要 ${G.money(unit * n)}` };
    const pr = presetId ? (S.cabinPresets || []).find((p) => p.id === presetId && p.type === typeId) : null;
    const acs = [];
    for (let i = 0; i < n; i++) {
      const r = G.acquire(typeId, mode, pr ? JSON.parse(JSON.stringify(pr.cabin)) : null, seq.regs[i]);
      if (!r.ok) return { ok: acs.length > 0, msg: r.msg, acs };
      acs.push(r.ac);
    }
    return { ok: true, acs };
  };

  // ---------- 二手飛機市場 ----------
  const quarterStart = (t) => { const d = new Date(t), q = Math.floor(d.getUTCMonth() / 3); return Date.UTC(d.getUTCFullYear(), q * 3, 1); };
  G.quarterLabel = (t) => { const d = new Date(t); return `${d.getUTCFullYear()} 年第 ${Math.floor(d.getUTCMonth() / 3) + 1} 季`; };
  const SELLERS = ['歐洲租賃公司退租', '亞洲租賃公司退租', '北美航空公司機隊汰換', '中東航空公司機隊汰換', '破產航空公司清算', '貨運改裝前釋出', '區域航空公司縮編'];
  // 依版型與座椅等級產生一套艙位配置
  G.makeCabin = (t, layout, tiers) => {
    const cab = G.defaultCabin(t);
    G.classesFor(t).forEach((c) => { cab[c].seats = 0; cab[c].tier = tiers[c] != null ? tiers[c] : 2; });
    if (layout >= 2) cab.J.seats = Math.round((t.units * (t.wide ? 0.13 : 0.08)) / G.seatUnits(t, 'J', cab.J.tier));
    if (layout >= 3) {
      cab.W.seats = Math.round((t.units * 0.08) / G.seatUnits(t, 'W', cab.W.tier));
      if (t.wide) cab.F.seats = Math.round((t.units * 0.05) / G.seatUnits(t, 'F', cab.F.tier));
    }
    const u = G.cabinUsage(t, cab);
    cab.Y.seats = Math.max(0, Math.min(t.maxSeats - u.seats, Math.floor((t.units - u.units) / G.seatUnits(t, 'Y', cab.Y.tier))));
    return cab;
  };
  function makeListing(S) {
    const pool = window.AIRCRAFT.filter((t) => !t.only);
    const t = pick([...pool, ...pool.filter((x) => x.used), ...pool.filter((x) => x.used)]); // 停產機型較常出現在二手市場
    const flyH = t.body === 'turboprop' ? 2300 : t.wide ? 4300 : 3300, perCycle = t.body === 'turboprop' ? 1.1 : t.wide ? 6.5 : 1.8;
    const age = Math.round(t.used ? rnd(6, 22) : rnd(2, 13));
    const hours = Math.round(age * flyH * rnd(0.8, 1.15));
    const cond = clamp(0.98 - age * 0.012 - rnd(0, 0.22), 0.5, 0.97);
    const mx = {};
    G.CHECK_LEVELS.forEach((lv) => (mx[lv] = Math.round(G.CHECKS[lv].interval * rnd(0.05, cond < 0.7 ? 1.05 : 0.85))));
    const layout = t.body === 'turboprop' || t.body === 'regional' ? pick([1, 1, 2]) : t.wide ? pick([2, 3, 3]) : pick([1, 2, 2, 3]);
    const base = Math.round(rnd(0.6, 3.2)), tiers = { F: clamp(base + 1, 0, 4), J: clamp(base + Math.round(rnd(0, 1)), 0, 4), W: clamp(base, 0, 4), Y: clamp(base - Math.round(rnd(0, 1)), 0, 4) };
    const cabin = G.makeCabin(t, layout, tiers);
    // 價格：新機價值 × 機齡 × 機況 × 艙位等級
    const valueNew = (t.used ? t.price / 0.5 : t.price) * 1e6;
    const u = G.cabinUsage(t, cabin), avgTier = G.classesFor(t).reduce((s, c) => s + (cabin[c].seats ? cabin[c].tier * cabin[c].seats * G.seatUnits(t, c, cabin[c].tier) : 0), 0) / Math.max(1, u.units);
    const price = Math.round((valueNew * Math.max(0.12, 0.95 - 0.05 * age) * (0.6 + 0.5 * cond) * (1 + 0.04 * (avgTier - 2)) * rnd(0.95, 1.05)) / 1e4) * 1e4;
    const lease = Math.round((price * (0.012 + (1 - cond) * 0.004)) / 100) * 100;
    return { id: (S.usedSeq = (S.usedSeq || 0) + 1), type: t.id, age, hours, cycles: Math.round(hours / perCycle), cond, mx, cabin, price, lease, seller: pick(SELLERS) };
  }
  G.refreshUsedMarket = (S) => {
    S = S || G.S;
    const n = Math.round(rnd(10, 15));
    S.usedMkt = { since: quarterStart(S.time), nextAt: Date.UTC(new Date(quarterStart(S.time)).getUTCFullYear(), new Date(quarterStart(S.time)).getUTCMonth() + 3, 1), items: Array.from({ length: n }, () => makeListing(S)).sort((a, b) => a.price - b.price) };
  };
  G.usedDaily = () => {
    const S = G.S;
    if (G.net && G.net.role === 'client') return; // v0.8.0 多人連線：二手市場由房主統一刷新
    if (!S.usedMkt || S.time >= S.usedMkt.nextAt) {
      G.refreshUsedMarket(S);
      log(`二手飛機市場更新：${G.quarterLabel(S.time)}共有 ${S.usedMkt.items.length} 架待售`);
      G._emit('event', { kind: 'used-refresh', n: S.usedMkt.items.length });
    }
  };
  G.buyUsed = (itemId, mode, reg) => {
    const S = G.S, it = S.usedMkt && S.usedMkt.items.find((x) => x.id === itemId);
    if (!it) return { ok: false, msg: '這架飛機已經售出' };
    const r = G.acquire(it.type, mode, JSON.parse(JSON.stringify(it.cabin)), reg || null, { used: true, price: it.price, lease: it.lease, hours: it.hours, cycles: it.cycles, mx: it.mx, cond: it.cond });
    if (r.ok) S.usedMkt.items = S.usedMkt.items.filter((x) => x !== it);
    return r;
  };

  // ---------- 舊存檔升級 ----------
  G.migrateV62 = (S) => {
    S.cabinPresets = S.cabinPresets || [];
    S.fleet.forEach((ac) => {
      const t = G.TYPES[ac.type];
      if (ac.cond == null) ac.cond = t.used ? 0.8 : 1;
      if (ac.usedBuy == null) ac.usedBuy = !!t.used;
    });
    const re = new RegExp(`^${S.company.code}-(\\d+)$`);
    S.regSeq = 1; S.fleet.forEach((a) => { const m = re.exec(a.reg); if (m) S.regSeq = Math.max(S.regSeq, +m[1] + 1); });
    if (!S.usedMkt) { const keep = G.S; G.S = S; G.refreshUsedMarket(S); G.S = keep; }
  };
})();
