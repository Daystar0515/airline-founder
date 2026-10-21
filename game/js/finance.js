// v0.4 財務：三大報表、折舊、營所稅、保險、銀行貸款與信用評等、股票上市。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const log = (m, k) => G.log(m, k);

  // ---------- 參數 ----------
  G.TAX_RATE = 0.2;              // 營利事業所得稅
  G.LIAB_DEDUCTIBLE = 0.1;       // 責任險自負額比例
  G.HULL_RATE = 0.006;           // 機身險年費率（市價）
  G.LIAB_PER_SEAT = 550;         // 責任險每座位年費
  G.BASE_RATE = 0.04;            // 基準利率
  G.GRADES = [['AAA', 85, 0.010], ['AA', 75, 0.015], ['A', 65, 0.020], ['BBB', 55, 0.030], ['BB', 45, 0.045], ['B', 35, 0.065], ['CCC', 0, 0.090]];
  G.LOAN = { unsecuredPremium: 0.03, securedPremium: 0.005, ltv: 0.65, maxYears: { unsecured: 5, secured: 10 }, lateFee: 0.02, missLimit: 3 };
  G.IPO = { minMonths: 24, minEquity: 80e6, minRep: 50, reviewDays: 90, fee: 0.05, applyFee: 1e6, basePE: 14 };
  // 旅客需求的時段係數（出發地當地時間）：紅眼航班乘客少
  G.timeOfDay = (min) => { const h = min / 60; return h < 5 ? 0.3 : h < 6 ? 0.6 : h < 9 ? 1.15 : h < 17 ? 1 : h < 21 ? 1.1 : h < 23 ? 0.8 : 0.5; };

  // 自建空廚改為 3 級
  G.UPGRADES.kitchen = { name: '自建空廚', max: 3, cost: 8e6, upkeep: 120e3, desc: '從此樞紐出發的航班餐點成本 ×0.80／0.72／0.65、品質 +0.04／+0.08／+0.12（第 1／2／3 級）' };
  G.KITCHEN = { cost: [1, 0.8, 0.72, 0.65], q: [0, 0.04, 0.08, 0.12] };

  // ---------- 初始化 ----------
  const blankFin = (capital) => ({ capital, ipoCapital: 0, retained: 0, facCost: 0, facBook: 0, deposits: 0, lossCF: 0, loans: [], loanSeq: 1, missedTotal: 0, negDays: 0,
    stock: { listed: false, shares: 100e6, pending: null, price: null, hist: [], payout: 0.3, warn: 0, lastIssue: null, yearStartPrice: null }, statements: [], monthCashStart: null, bankrupt: false });
  G.initV4 = (S) => { S.fin = blankFin(S.cash); S.fin.monthCashStart = S.cash; };
  G.migrateV4 = (S) => {
    const prev = G.S; G.S = S;
    S.fin = blankFin(0);
    S.fleet.forEach((ac) => {
      const t = G.TYPES[ac.type];
      if (ac.mode === 'buy') { ac.cost = t.price * 1e6; ac.book = G.aircraftValue(ac); }
      else { ac.deposit = G.leaseMonthly(t) * 2; S.fin.deposits += ac.deposit; }
    });
    Object.entries(S.hubs).forEach(([k, h]) => {
      let v = G.hubFee(G.AP[k], h.type);
      Object.entries(h.upgrades).forEach(([u, lv]) => (v += lv * G.UPGRADES[u].cost));
      S.fin.facCost += v; S.fin.facBook += v;
    });
    S.days.forEach((d) => { d.inflow = d.inflow || {}; d.gain = d.gain || 0; });
    S.day.inflow = S.day.inflow || {}; S.day.gain = S.day.gain || 0;
    // 期初權益：以資產減負債倒推，視為股東投入資本
    S.fin.capital = G.assets().total;
    S.fin.monthCashStart = S.cash;
    G.S = prev;
  };

  // ---------- 現金流入（非營收）----------
  function cashIn(v, cat) { const S = G.S; S.cash += v; S.day.inflow[cat] = (S.day.inflow[cat] || 0) + v; }
  G.cashIn = cashIn;
  // 處分飛機：出售、保險理賠、退租、失事沒收保證金、銀行收回
  G.dispose = (ac, proceeds, kind) => {
    const S = G.S, F = S.fin;
    if (ac.mode === 'buy') {
      if (proceeds > 0) cashIn(proceeds, kind === 'hullIns' ? 'hullIns' : 'sale');
      S.day.gain += proceeds - (ac.book || 0); // 處分損益 = 收入 − 帳面價值
    } else if (ac.deposit) {
      F.deposits -= ac.deposit;
      if (kind === 'crash') S.day.gain -= ac.deposit; // 保證金沒收
      else cashIn(ac.deposit, 'depRefund');
    }
    S.fleet = S.fleet.filter((x) => x !== ac);
    if (kind === 'sale') log(`${ac.reg} ${ac.mode === 'buy' ? `出售，回收 ${G.money(proceeds)}（帳面 ${G.money(ac.book || 0)}）` : `退租，退回保證金 ${G.money(ac.deposit || 0)}`}`);
    G._emit('fleet');
  };

  // ---------- 資產負債 ----------
  G.assets = () => {
    const S = G.S, F = S.fin;
    const aircraft = S.fleet.reduce((s, ac) => s + (ac.mode === 'buy' ? ac.book || 0 : 0), 0);
    const invest = F.invest || 0; // v0.9.0 持有其他航空公司的股票（以成本入帳）
    const prepay = F.prepay || 0, slots = F.slotBook || 0, subs = F.subsBook || 0, goodwill = F.goodwill || 0; // v1.0.0 預付購機款、時刻帶、子公司投資、商譽（整合子公司）
    const total = S.cash + aircraft + F.facBook + F.deposits + invest + prepay + slots + subs + goodwill;
    return { cash: S.cash, aircraft, facilities: F.facBook, deposits: F.deposits, invest, prepay, slots, subs, goodwill, total };
  };
  G.bondDebt = () => (G.S.fin.bonds || []).reduce((s, b) => s + b.amount, 0);
  G.debt = () => G.S.fin.loans.reduce((s, l) => s + l.balance, 0) + G.bondDebt();
  G.equityBook = () => { const F = G.S.fin; return F.capital + F.ipoCapital + F.retained - (F.treasuryCost || 0); }; // v1.0.0-rc3 庫藏股為權益減項
  G.marketValueFleet = (owned) => G.S.fleet.filter((a) => !owned || a.mode === 'buy').reduce((s, a) => s + G.aircraftValue(a), 0);

  // ---------- 信用評等 ----------
  const lastStatements = (n) => G.S.fin.statements.slice(-n);
  G.credit = () => {
    const S = G.S, F = S.fin;
    const st = lastStatements(3);
    const rev = st.reduce((s, x) => s + x.rev, 0), ebit = st.reduce((s, x) => s + x.ebit, 0);
    const margin = rev > 0 ? ebit / rev : st.length ? -0.2 : 0;
    const assets = G.assets().total, lev = assets > 0 ? G.debt() / assets : 1;
    const recentCrash = S.safety.lastCrash && S.time - S.safety.lastCrash < 3 * YEAR ? 1 : 0;
    const months = (S.time - S.start) / (30 * DAY);
    let score = 50 + (S.rep - 50) * 0.6 + clamp(margin * 100, -30, 30) * 0.8 - lev * 40 - recentCrash * 15 - F.missedTotal * 10 + Math.min(10, months / 3) + (S.cash < 0 ? -15 : 0);
    score = clamp(score, 0, 100);
    const g = G.GRADES.find((x) => score >= x[1]);
    const monthlyRev = st.length ? rev / st.length : 0;
    return { score, grade: g[0], spread: g[2], margin, lev, monthlyRev };
  };
  G.isPledged = (acId) => G.S.fin.loans.some((l) => l.collateral && l.collateral.includes(acId));
  G.loanOffers = () => {
    const S = G.S, c = G.credit();
    const unsecuredOut = S.fin.loans.filter((l) => l.type === 'unsecured').reduce((s, l) => s + l.balance, 0);
    const uLimit = c.grade === 'CCC' ? 0 : Math.max(c.score >= 35 ? 3e6 : 0, c.monthlyRev * 2 * (c.score / 70)) - unsecuredOut;
    const free = S.fleet.filter((a) => a.mode === 'buy' && !G.isPledged(a.id));
    return {
      credit: c,
      unsecured: { rate: G.BASE_RATE + c.spread + G.LOAN.unsecuredPremium, limit: Math.max(0, uLimit), maxYears: G.LOAN.maxYears.unsecured },
      secured: { rate: G.BASE_RATE + c.spread * 0.5 + G.LOAN.securedPremium, maxYears: G.LOAN.maxYears.secured, collateral: free.map((a) => ({ id: a.id, reg: a.reg, model: G.TYPES[a.type].model, value: G.aircraftValue(a), lend: G.aircraftValue(a) * G.LOAN.ltv })) },
    };
  };
  const annuity = (P, r, n) => (r === 0 ? P / n : (P * (r / 12)) / (1 - Math.pow(1 + r / 12, -n)));
  G.takeLoan = ({ type, amount, years, collateral }) => {
    const S = G.S, o = G.loanOffers();
    amount = Math.round(amount);
    if (!(amount > 0)) return { ok: false, msg: '請輸入貸款金額' };
    let rate, limit;
    if (type === 'unsecured') { rate = o.unsecured.rate; limit = o.unsecured.limit; if (years > o.unsecured.maxYears) return { ok: false, msg: `信用貸款最長 ${o.unsecured.maxYears} 年` }; }
    else {
      const picks = o.secured.collateral.filter((c) => (collateral || []).includes(c.id));
      if (!picks.length) return { ok: false, msg: '請選擇至少一架自有飛機作為抵押品' };
      rate = o.secured.rate; limit = picks.reduce((s, c) => s + c.lend, 0);
      if (years > o.secured.maxYears) return { ok: false, msg: `抵押貸款最長 ${o.secured.maxYears} 年` };
    }
    if (amount > limit + 1) return { ok: false, msg: `超過可貸額度 ${G.money(limit)}` };
    const n = years * 12;
    const loan = { id: S.fin.loanSeq++, type, principal: amount, balance: amount, rate, months: n, left: n, payment: annuity(amount, rate, n), collateral: type === 'secured' ? collateral.slice() : null, missed: 0, start: S.time };
    S.fin.loans.push(loan);
    cashIn(amount, 'loan');
    log(`向銀行借入${type === 'secured' ? '抵押' : '信用'}貸款 ${G.money(amount)}，年利率 ${(rate * 100).toFixed(2)}%，${years} 年攤還，每月 ${G.money(loan.payment)}`);
    return { ok: true, loan };
  };
  G.repayLoan = (id) => {
    const S = G.S, l = S.fin.loans.find((x) => x.id === id);
    if (!l) return { ok: false };
    if (S.cash < l.balance) return { ok: false, msg: `現金不足，需要 ${G.money(l.balance)}` };
    G._spend(l.balance, 'principal');
    S.fin.loans = S.fin.loans.filter((x) => x !== l);
    log(`提前清償貸款 ${G.money(l.balance)}${l.collateral ? '，解除抵押' : ''}`);
    return { ok: true };
  };

  // ---------- v0.9.0 公司債 ----------
  G.BOND = { terms: [3, 5, 7, 10], minScore: 45, minMonths: 12, fee: 0.01, callPremium: 0.02, capRatio: 0.35, min: 10e6, max: 2e9 };
  G.bondRate = (years) => {
    const c = G.credit(), M = G.S.mkt, X = G.BOND;
    const regime = M ? (M.regime === 'bear' ? 0.004 : M.regime === 'bull' ? -0.002 : 0) : 0;
    return G.BASE_RATE + c.spread * 0.9 + 0.004 + 0.0015 * (years - 3) + (G.S.fin.stock.listed ? 0 : 0.005) + regime;
  };
  G.bondOffer = () => {
    const S = G.S, c = G.credit(), X = G.BOND, months = (S.time - S.start) / (30 * DAY);
    const cap = Math.max(0, Math.min(X.max, G.assets().total * X.capRatio - G.bondDebt()));
    const why = c.score < X.minScore ? `信用評等需要 BB 以上（目前 ${c.grade}）` : months < X.minMonths ? `營運滿 ${X.minMonths} 個月才能發行（目前 ${Math.floor(months)} 個月）` : cap < X.min ? '已達發行上限（公司債總額不得超過總資產的 35%）' : null;
    return { ok: !why, why, cap, credit: c, rates: X.terms.map((y) => [y, G.bondRate(y)]) };
  };
  G.issueBond = (amount, years) => {
    const S = G.S, F = S.fin, o = G.bondOffer(), X = G.BOND;
    amount = Math.round(amount);
    if (!o.ok) return { ok: false, msg: o.why };
    if (!X.terms.includes(years)) return { ok: false, msg: '請選擇年期' };
    if (!(amount >= X.min)) return { ok: false, msg: `最低發行 ${G.money(X.min)}` };
    if (amount > o.cap + 1) return { ok: false, msg: `超過可發行額度 ${G.money(o.cap)}` };
    F.bonds = F.bonds || []; F.bondSeq = F.bondSeq || 1;
    const rate = G.bondRate(years), b = { id: F.bondSeq++, amount, principal: amount, rate, years, left: years * 12, issued: S.time, missed: 0 };
    F.bonds.push(b);
    cashIn(amount, 'bond');
    G._spend(amount * X.fee, 'bondfee');
    log(`發行 ${years} 年期公司債 ${G.money(amount)}，票面利率 ${(rate * 100).toFixed(2)}%，每月付息 ${G.money(amount * rate / 12)}、到期一次還本；承銷費 ${G.money(amount * X.fee)}`);
    return { ok: true, bond: b };
  };
  G.callBond = (id) => {
    const S = G.S, F = S.fin, b = (F.bonds || []).find((x) => x.id === id);
    if (!b) return { ok: false };
    const prem = b.amount * G.BOND.callPremium;
    if (S.cash < b.amount + prem) return { ok: false, msg: `現金不足，需要 ${G.money(b.amount + prem)}` };
    G._spend(b.amount, 'principal'); G._spend(prem, 'bondfee');
    F.bonds = F.bonds.filter((x) => x !== b);
    log(`提前贖回公司債 ${G.money(b.amount)}，支付贖回溢價 ${G.money(prem)}`);
    return { ok: true };
  };

  // ---------- 股票上市 ----------
  G.ipoCheck = () => {
    const S = G.S, F = S.fin, st = lastStatements(12);
    const months = (S.time - S.start) / (30 * DAY);
    const ni = st.reduce((s, x) => s + x.ni, 0);
    const c = G.credit();
    const items = [
      ['營運滿 24 個月', months >= G.IPO.minMonths, `${Math.floor(months)} 個月`],
      ['近 12 個月稅後淨利為正', st.length >= 12 && ni > 0, G.money(ni)],
      [`股東權益 ≥ ${G.money(G.IPO.minEquity)}`, G.equityBook() >= G.IPO.minEquity, G.money(G.equityBook())],
      [`社會評價 ≥ ${G.IPO.minRep}`, S.rep >= G.IPO.minRep, S.rep.toFixed(0)],
      ['近 24 個月無失事', !S.safety.lastCrash || S.time - S.safety.lastCrash > 2 * YEAR, S.safety.lastCrash ? '有' : '無'],
      ['信用評等 BB 以上', c.score >= 45, c.grade],
    ];
    return { ok: items.every((x) => x[1]), items, ni };
  };
  // 本益比：社會評價與營收成長加成
  G.peRatio = () => {
    const st = G.S.fin.statements, a = st.slice(-12), b = st.slice(-24, -12);
    const ra = a.reduce((s, x) => s + x.rev, 0), rb = b.reduce((s, x) => s + x.rev, 0);
    const growth = rb > 0 ? clamp(ra / rb, 0.8, 1.4) : 1;
    return G.IPO.basePE * (0.7 + 0.6 * G.S.rep / 100) * growth;
  };
  G.fairValue = () => {
    const F = G.S.fin, ni = lastStatements(12).reduce((s, x) => s + x.ni, 0);
    // 合理市值 = 獲利 × 本益比 + 淨現金；不低於帳面淨值
    const netCash = G.S.cash - G.debt();
    return Math.max(G.equityBook(), ni * G.peRatio() + netCash);
  };
  G.ipoApply = (floatPct) => {
    const S = G.S, F = S.fin, k = G.ipoCheck();
    if (!k.ok) return { ok: false, msg: '尚未符合上市條件' };
    if (F.stock.pending || F.stock.listed) return { ok: false, msg: '已在審查中或已上市' };
    if (S.cash < G.IPO.applyFee) return { ok: false, msg: '現金不足支付申請費' };
    floatPct = clamp(floatPct, 0.1, 0.4);
    G._spend(G.IPO.applyFee, 'routefee');
    F.stock.pending = { at: S.time + G.IPO.reviewDays * DAY, floatPct };
    log(`向證券交易所申請上市，預計釋出 ${Math.round(floatPct * 100)}% 新股，審查約 ${G.IPO.reviewDays} 天`);
    return { ok: true };
  };
  function listCompany() {
    const S = G.S, F = S.fin, st = F.stock, f = st.pending.floatPct;
    const pre = G.fairValue(), price = pre / st.shares;
    const newShares = (st.shares * f) / (1 - f);
    const gross = newShares * price, net = gross * (1 - G.IPO.fee);
    st.shares += newShares; st.listed = true; st.pending = null; st.price = price; st.ipoPrice = price; st.listedAt = S.time; st.yearStartPrice = price;
    st.hist = [{ t: S.time, p: price }];
    F.ipoCapital += net; cashIn(net, 'equity');
    S.founder.equity = Math.round(S.founder.equity * (1 - f) * 10) / 10;
    log(`股票正式上市！承銷價每股 $${price.toFixed(2)}，募得 ${G.money(net)}，市值 ${G.money(price * st.shares)}；你的持股稀釋為 ${S.founder.equity}%`);
    G._emit('event', { kind: 'ipo', price, net, cap: price * st.shares });
  }
  G.issueShares = (pct) => {
    const S = G.S, st = S.fin.stock;
    if (!st.listed) return { ok: false, msg: '尚未上市' };
    if (st.lastIssue && S.time - st.lastIssue < YEAR) return { ok: false, msg: '距上次增資未滿一年' };
    pct = clamp(pct, 0.02, 0.2);
    const n = st.shares * pct, net = n * st.price * 0.95 * (1 - G.IPO.fee);
    st.shares += n; st.lastIssue = S.time; st.price *= 0.97;
    S.fin.ipoCapital += net; cashIn(net, 'equity');
    S.founder.equity = Math.round((S.founder.equity / (1 + pct)) * 10) / 10;
    log(`現金增資發行 ${Math.round(pct * 100)}% 新股，募得 ${G.money(net)}；你的持股 ${S.founder.equity}%`);
    return { ok: true, net };
  };
  G.setPayout = (r) => { G.S.fin.stock.payout = clamp(r, 0, 0.8); };
  G.stockShock = (pct) => { const st = G.S && G.S.fin && G.S.fin.stock; if (st && st.listed) st.price *= 1 + pct; };
  // 重大事件讓股價下跌
  G.on((w, d) => {
    if (w !== 'event' || !G.S || !G.S.fin) return;
    if (d.kind === 'crash') G.stockShock(-0.2);
    if (d.kind === 'emergency') G.stockShock(-0.02);
    if (d.kind === 'strike') G.stockShock(-0.05);
  });

  // ---------- 每日 ----------
  G.dailyV4 = () => {
    const S = G.S, F = S.fin;
    // 保險費：機身險依市價、責任險依座位數；近 3 年有失事則保費加倍
    const crashMul = S.safety.lastCrash && S.time - S.safety.lastCrash < 3 * YEAR ? 2 : 1;
    const hull = S.fleet.reduce((s, a) => s + G.aircraftValue(a), 0) * G.HULL_RATE;
    const liab = S.fleet.reduce((s, a) => s + G.cabinSeats(a.cabin), 0) * G.LIAB_PER_SEAT * crashMul;
    if (hull + liab > 0) G._spend(((hull + liab) / 365) * (G.evCost ? G.evCost('insurance') : 1), 'insurance');
    // 上市審查
    if (F.stock.pending && S.time >= F.stock.pending.at) {
      if (G.ipoCheck().ok) listCompany();
      else { F.stock.pending = null; log('上市審查期間條件不再符合，申請被退回', 'warn'); G._emit('event', { kind: 'ipo-fail' }); }
    }
    // 股價：每天向合理價值回歸 2%，加上隨機波動
    if (F.stock.listed && !G.stockDaily) { // v0.9.0 起由 stocks.js 計算（大盤、類股、財報跳空）
      const st = F.stock, fair = G.fairValue() / st.shares;
      st.price = Math.max(0.05, st.price + (fair - st.price) * 0.02 + st.price * (Math.random() - 0.5) * 0.03);
      st.hist.push({ t: S.time, p: st.price });
      if (st.hist.length > 730) st.hist.shift();
    }
    // 破產：現金連續 60 天為負且沒有可用額度
    if (S.cash < 0) {
      F.negDays++;
      if (F.negDays === 1) G._emit('event', { kind: 'cash-out' });
      if (F.negDays >= 60 && G.loanOffers().unsecured.limit < -S.cash && !F.bankrupt) { F.bankrupt = true; log('現金連續 60 天為負且無法再借款，公司宣告破產', 'warn'); G._emit('event', { kind: 'bankrupt' }); }
    } else F.negDays = 0;
  };

  // ---------- 月結：折舊、貸款、稅、報表 ----------
  G.finCloseMonth = (rec) => {
    const S = G.S, F = S.fin;
    // 折舊：新機 25 年、二手機 12 年，殘值 10%；設施 20 年
    let dep = 0;
    S.fleet.forEach((ac) => {
      if (ac.mode !== 'buy' || !ac.cost) return;
      const t = G.TYPES[ac.type], life = (t.used || ac.usedBuy ? 12 : 25) * 12;
      const d = Math.min(ac.book - ac.cost * 0.1, (ac.cost * 0.9) / life);
      if (d > 0) { ac.book -= d; dep += d; }
    });
    const fd = Math.min(F.facBook, F.facCost / 240);
    F.facBook -= fd; dep += fd;
    // 貸款：每月攤還；現金不足即逾期
    let interest = 0, interestPaid = 0, principal = 0;
    F.loans.slice().forEach((l) => {
      const due = l.balance * (l.rate / 12);
      const pay = Math.min(l.payment, l.balance + due);
      if (S.cash >= pay) {
        S.cash -= pay; interest += due; interestPaid += due; principal += pay - due;
        l.balance = Math.max(0, l.balance - (pay - due)); l.left--; l.missed = 0;
        if (l.balance < 1 || l.left <= 0) { F.loans = F.loans.filter((x) => x !== l); log(`貸款 ${G.money(l.principal)} 已全數清償`); }
      } else {
        l.missed++; F.missedTotal++;
        const fee = l.balance * G.LOAN.lateFee;
        interest += due + fee; // 未付利息與滯納金計入費用、加到本金
        l.balance += due + fee;
        log(`貸款逾期未繳（第 ${l.missed} 期），加計滯納金，信用評等下降`, 'warn');
        G._emit('event', { kind: 'loan-missed', missed: l.missed });
        if (l.missed >= G.LOAN.missLimit) {
          if (l.type === 'secured') {
            // 銀行收回抵押飛機，以市價九成抵債
            let recovered = 0;
            l.collateral.forEach((id) => {
              const ac = S.fleet.find((x) => x.id === id);
              if (!ac) return;
              const v = G.aircraftValue(ac) * 0.9; recovered += v;
              S.day.gain += v - (ac.book || 0);
              S.fleet = S.fleet.filter((x) => x !== ac);
              log(`銀行收回抵押品 ${ac.reg}`, 'warn');
            });
            const surplus = recovered - l.balance;
            F.loans = F.loans.filter((x) => x !== l);
            if (surplus > 0) { S.cash += surplus; rec.inflow.sale = (rec.inflow.sale || 0) + surplus; }
            else { l.balance = -surplus; l.type = 'unsecured'; l.collateral = null; l.missed = 0; F.loans.push(l); }
            G._emit('event', { kind: 'repossess' });
          } else if (!F.bankrupt) {
            F.bankrupt = true;
            log('信用貸款連續 3 期違約，銀行聲請破產', 'warn');
            G._emit('event', { kind: 'bankrupt' });
          }
        }
      }
    });
    // v0.9.0 公司債：每月付息、到期還本；付不出來就違約
    (F.bonds || []).slice().forEach((b) => {
      const cp = b.amount * (b.rate / 12);
      if (S.cash >= cp) { S.cash -= cp; interest += cp; interestPaid += cp; b.left--; }
      else {
        b.missed = (b.missed || 0) + 1; F.missedTotal++; interest += cp; b.amount += cp;
        log(`公司債票息未付（第 ${b.missed} 期），信用評等下降`, 'warn');
        G._emit('event', { kind: 'loan-missed', missed: b.missed });
        if (b.missed >= G.LOAN.missLimit && !F.bankrupt) { F.bankrupt = true; log('公司債連續 3 期違約，債權人聲請破產', 'warn'); G._emit('event', { kind: 'bankrupt' }); }
        return;
      }
      if (b.left <= 0) {
        if (S.cash >= b.amount) { S.cash -= b.amount; principal += b.amount; F.bonds = F.bonds.filter((x) => x !== b); log(`公司債 ${G.money(b.amount)} 到期，已還本`); }
        else {
          b.missed = (b.missed || 0) + 1; F.missedTotal++; b.left = 1;
          log(`公司債 ${G.money(b.amount)} 到期但現金不足，無法還本（第 ${b.missed} 個月）`, 'warn');
          G._emit('event', { kind: 'loan-missed', missed: b.missed });
          if (b.missed >= G.LOAN.missLimit && !F.bankrupt) { F.bankrupt = true; log('公司債到期無法償還，債權人聲請破產', 'warn'); G._emit('event', { kind: 'bankrupt' }); }
        }
      }
    });
    { const bf = rec.cost.bondfee || 0; interest += bf; interestPaid += bf; } // 發行費、提前贖回溢價列為財務費用
    // 損益
    const opCats = Object.keys(rec.cost).filter((k) => !G.ONE_OFF.includes(k));
    const opex = opCats.reduce((s, k) => s + rec.cost[k], 0);
    const ebitda = rec.rev - opex;
    const ebit = ebitda - dep;
    const gain = rec.gain; // 當月處分損益
    const pretax = ebit + gain - interest;
    let tax = 0;
    if (pretax < 0) F.lossCF += -pretax;
    else { const use = Math.min(F.lossCF, pretax); F.lossCF -= use; tax = (pretax - use) * G.TAX_RATE; }
    if (tax > 0) S.cash -= tax;
    const ni = pretax - tax;
    F.retained += ni;
    // 年度：股利、股東會
    let dividend = 0;
    if (rec.m === 12 && F.stock.listed) {
      const yearNi = F.statements.slice(-11).reduce((s, x) => s + x.ni, 0) + ni;
      dividend = Math.max(0, Math.min(S.cash * 0.5, yearNi * F.stock.payout));
      if (dividend > 0) { S.cash -= dividend; F.retained -= dividend; F.stock.lastDps = dividend / F.stock.shares; F.stock.lastDpsT = S.time; F.stock.price = Math.max(0.05, F.stock.price - F.stock.lastDps); log(`發放年度現金股利 ${G.money(dividend)}（每股 $${(dividend / F.stock.shares).toFixed(2)}）`); if (G.onCompanyDividend) G.onCompanyDividend(dividend); }
      shareholderMeeting(dividend);
    }
    // 現金流量表
    const c = rec.cost, inf = rec.inflow;
    const sumCats = (cats) => cats.reduce((s, k) => s + (c[k] || 0), 0);
    const cfOp = rec.rev - opex - interestPaid - tax;
    const cfInv = -sumCats(['capex', 'facility', 'deposit', 'setup', 'invest']) + (inf.sale || 0) + (inf.hullIns || 0) + (inf.depRefund || 0) + (inf.investSale || 0) + (inf.divIn || 0);
    const divAll = dividend + (c.dividend || 0); // v1.0.0-rc3 未上市公司的盈餘分配
    const cfFin = (inf.loan || 0) + (inf.bond || 0) + (inf.equity || 0) - sumCats(['principal', 'buyback', 'dividend']) - principal - dividend;
    const a = G.assets(), debt = G.debt();
    const fs = {
      y: rec.y, m: rec.m, rev: rec.rev, gov: rec.gov || 0, member: rec.member || 0, anc: rec.anc, opex, opCats: Object.fromEntries(opCats.map((k) => [k, c[k]])), ebitda, dep, ebit, gain, interest, pretax, tax, ni, dividend: divAll,
      cf: { op: cfOp, inv: cfInv, fin: cfFin, net: cfOp + cfInv + cfFin, start: F.monthCashStart, end: S.cash },
      bs: { cash: S.cash, aircraft: a.aircraft, facilities: a.facilities, deposits: a.deposits, invest: a.invest, prepay: a.prepay, slots: a.slots, subs: a.subs, goodwill: a.goodwill, assets: a.total, loans: debt - G.bondDebt() - (G.ownerLoan ? G.ownerLoan() : 0), bonds: G.bondDebt(), owner: G.ownerLoan ? G.ownerLoan() : 0, capital: F.capital, ipo: F.ipoCapital, retained: F.retained, treasury: F.treasuryCost || 0, equity: G.equityBook() },
    };
    F.statements.push(fs);
    if (F.statements.length > 60) F.statements.shift();
    F.monthCashStart = S.cash;
    rec.fs = fs;
  };
  function shareholderMeeting(dividend) {
    const S = G.S, st = S.fin.stock;
    const tsr = st.yearStartPrice ? (st.price - st.yearStartPrice) / st.yearStartPrice : 0;
    const yieldPct = (dividend + (S.fin.bbYear || 0)) / (st.price * st.shares); // v1.0.0-rc3 庫藏股買回也算回饋股東
    S.fin.bbYear = 0;
    let approval = clamp(50 + tsr * 80 + yieldPct * 300 + (S.rep - 50) * 0.3, 0, 100);
    // v0.9.0 盟友等友好股東的持股一律支持經營團隊
    const floatShares = st.shares * (1 - S.founder.equity / 100), friendly = G.friendlyStake ? G.friendlyStake() : 0;
    if (friendly > 0 && floatShares > 0) { const w = clamp(friendly / floatShares, 0, 1); approval = approval * (1 - w) + 100 * w; }
    st.yearStartPrice = st.price;
    st.lastApproval = approval;
    if (S.founder.equity >= 50) { log(`年度股東會：支持度 ${approval.toFixed(0)}%（你持股過半，經營權穩固）`); return; }
    if (approval >= 40) { st.warn = 0; log(`年度股東會：經營團隊獲得 ${approval.toFixed(0)}% 支持`); return; }
    st.warn++;
    if (st.warn >= 2) { log(`年度股東會連續兩年支持度不足（${approval.toFixed(0)}%），你被股東會撤換`, 'warn'); G._emit('event', { kind: 'dismissed', reason: 'shareholders' }); }
    else { log(`年度股東會支持度只有 ${approval.toFixed(0)}%，股東要求改善，明年若仍不足將撤換經營者`, 'warn'); G._emit('event', { kind: 'agm-warn', approval }); }
  }
})();

// v0.4.1 存檔修復：v0.3–v0.4 興建自建空廚時等級變成 NaN，連帶讓現金、營收、報表出現 NaN
(function () {
  const G = window.G;
  // 存檔是 JSON，NaN 存進去會變成 null，所以 null 也視為壞掉的數字
  const bad = (v) => v === null || (typeof v === 'number' && !Number.isFinite(v));
  const KEEP_NULL = ['sat', 'fs', 'probation', 'pending', 'price', 'lastIssue', 'lastCrash', 'yearStartPrice', 'collateral', 'lastApproval'];
  // 把物件裡壞掉的數字改成 0，回傳修了幾個
  function scrub(o, depth) {
    let n = 0;
    if (!o || typeof o !== 'object' || depth > 6) return 0;
    for (const k of Object.keys(o)) {
      if (KEEP_NULL.includes(k)) { if (o[k] && typeof o[k] === 'object') n += scrub(o[k], depth + 1); continue; }
      if (bad(o[k])) { o[k] = 0; n++; } else if (o[k] && typeof o[k] === 'object') n += scrub(o[k], depth + 1);
    }
    return n;
  }
  G.repairSave = (S) => {
    let fixed = 0;
    Object.values(S.hubs).forEach((h) => {
      h.upgrades = h.upgrades || {};
      ['lounge', 'ground', 'hangar', 'kitchen'].forEach((k) => {
        if (h.upgrades[k] === undefined) h.upgrades[k] = 0;
        else if (bad(h.upgrades[k])) { h.upgrades[k] = 1; fixed++; } // NaN 存檔後變成 null：表示至少蓋過一級
      });
    });
    if (!bad(S.cash) && !fixed && !(S.fin && bad(S.fin.retained))) return 0;
    // 現金：回到最後一筆正常的每日紀錄
    if (bad(S.cash)) {
      const ok = [...S.days].reverse().find((d) => typeof d.cash === 'number' && Number.isFinite(d.cash));
      S.cash = ok ? ok.cash : 0;
      // 之後的每日紀錄與當天進行中的帳都作廢，讓報表與現金一致
      if (ok) S.days = S.days.slice(0, S.days.indexOf(ok) + 1);
      S.day = G.emptyDay();
      fixed++;
    }
    [S.day, ...S.days, ...S.months, ...(S.routes || []).map((r) => r.stats)].forEach((x) => (fixed += scrub(x, 0)));
    S.days.forEach((d) => { d.costOp = Object.entries(d.cost || {}).filter(([k]) => !G.ONE_OFF.includes(k)).reduce((s, [, v]) => s + v, 0); });
    if (S.fin) {
      fixed += scrub(S.fin.statements, 0);
      ['facCost', 'facBook', 'deposits', 'lossCF', 'capital', 'ipoCapital'].forEach((k) => { if (bad(S.fin[k])) { S.fin[k] = 0; fixed++; } });
      // 保留盈餘以「資產 − 負債 − 股本」重新推算，讓資產負債表重新平衡
      const prev = G.S; G.S = S;
      const a = G.assets().total, debt = G.debt();
      // 本月尚未結算的損益會在月底才進保留盈餘，推算時要先扣掉
      const now = new Date(S.time), y = now.getUTCFullYear(), m = now.getUTCMonth();
      const open = S.days.filter((d) => { const x = new Date(d.t); return x.getUTCFullYear() === y && x.getUTCMonth() === m; })
        .reduce((s, d) => s + (d.rev || 0) - (d.costOp || 0) + (d.gain || 0), 0) + (S.day.rev || 0) + (S.day.gain || 0)
        - Object.entries(S.day.cost || {}).filter(([k]) => !G.ONE_OFF.includes(k)).reduce((s, [, v]) => s + v, 0);
      S.fin.retained = a - debt - S.fin.capital - S.fin.ipoCapital + (S.fin.treasuryCost || 0) - open;
      fixed++;
      if (bad(S.fin.monthCashStart)) S.fin.monthCashStart = S.cash;
      G.S = prev;
    }
    if (fixed && S.log) S.log.unshift({ t: S.time, msg: `已自動修復存檔中 ${fixed} 個錯誤數值（舊版興建自建空廚造成的計算錯誤），現金回復為 ${G.money(S.cash)}`, kind: 'warn' });
    return fixed;
  };
})();
