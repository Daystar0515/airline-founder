// v1.0.0-rc3 公司與個人分開：創辦人的個人帳戶（現金、自家持股、房產與收藏、借給公司的錢）、董事長薪酬、股利、
// 個人消費與形象、公益，以及公司的庫藏股買回與再出售。
// 公司的錢只能透過薪酬、股利（未上市為盈餘分配）進到個人；個人可以增資、借錢給公司、在股市增持或減持自家股票。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (m, k) => G.log(m, k);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // ---------- 規則 ----------
  G.PERSONAL_START = { classic: 2e6, heir: 150e6, tycoon: 8e9, engineer: 0.5e6, manager: 1e6, captain: 3e6, official: 2e6, travel: 5e6 };
  G.PTAX = { salary: 0.3, dividend: 0.2, gain: 0.1 }; // 簡化的固定稅率
  G.PERSONAL = { depositRate: 0.02, overdraftRate: 0.1, livingBase: 5000, livingPct: 0.004, maxSalary: 50e6, sellMax: 0.02, sellCooldown: 30, buyMaxEquity: 90, fee: 0.002 };
  // 個人資產目錄：價格、每年增值（負數為貶值）、每年持有成本、價值波動、是否為奢侈品
  G.ITEMS = [
    { id: 'apt', kind: 'home', name: '市區公寓', price: 2e6, app: 0.03, upkeep: 0.01, vol: 0.03, lux: false, desc: '每年增值約 3%' },
    { id: 'villa', kind: 'home', name: '山景豪宅', price: 25e6, app: 0.035, upkeep: 0.012, vol: 0.04, lux: true, desc: '每年增值約 3.5%' },
    { id: 'resort', kind: 'home', name: '海外度假別墅', price: 60e6, app: 0.03, upkeep: 0.015, vol: 0.05, lux: true, desc: '每年增值約 3%' },
    { id: 'sedan', kind: 'car', name: '豪華轎車', price: 0.3e6, app: -0.15, upkeep: 0.03, vol: 0.01, lux: false, desc: '每年貶值約 15%' },
    { id: 'super', kind: 'car', name: '限量超跑', price: 3e6, app: -0.1, upkeep: 0.03, vol: 0.06, lux: true, desc: '每年貶值約 10%' },
    { id: 'yacht', kind: 'yacht', name: '遊艇', price: 20e6, app: -0.06, upkeep: 0.1, vol: 0.02, lux: true, desc: '每年維護費約 10%' },
    { id: 'mega', kind: 'yacht', name: '超級遊艇', price: 150e6, app: -0.05, upkeep: 0.1, vol: 0.02, lux: true, desc: '每年維護費約 10%' },
    { id: 'ljet', kind: 'jet', name: '輕型公務機', price: 25e6, app: -0.07, upkeep: 0.08, vol: 0.02, lux: true, jet: true, desc: '政府標案評分與聯盟契合度 +5' },
    { id: 'bjet', kind: 'jet', name: '長程公務機', price: 90e6, app: -0.06, upkeep: 0.08, vol: 0.02, lux: true, jet: true, desc: '政府標案評分與聯盟契合度 +5' },
    { id: 'art', kind: 'art', name: '當代畫作', price: 1e6, app: 0.04, upkeep: 0.005, vol: 0.25, lux: false, desc: '價值隨市場漲跌，波動大' },
    { id: 'master', kind: 'art', name: '大師名作', price: 100e6, app: 0.05, upkeep: 0.005, vol: 0.18, lux: true, desc: '價值隨市場漲跌' },
    { id: 'watch', kind: 'watch', name: '名錶收藏', price: 0.1e6, app: 0.03, upkeep: 0.005, vol: 0.08, lux: false, desc: '每年增值約 3%' },
  ];
  G.ITEM_KIND = { home: '住宅', car: '名車', yacht: '遊艇', jet: '私人飛機', art: '藝術收藏', watch: '名錶' };
  const ITEM = Object.fromEntries(G.ITEMS.map((x) => [x.id, x]));

  // ---------- 狀態 ----------
  const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
  G.initMe = (S) => {
    if (S.me) return S.me;
    const type = (S.founder && S.founder.type) || 'classic';
    const cash = G.PERSONAL_START[type] != null ? G.PERSONAL_START[type] : 2e6;
    S.me = { v: 1, cash, salary: type === 'tycoon' ? 1 : type === 'manager' ? 1.5e6 : 600e3, items: [], seq: 1, lend: 0, lendRate: 0.04, image: 50, given: 0, foundation: 0,
      tot: { salary: 0, divs: 0, interest: 0, gains: 0, tax: 0, spend: 0 }, mon: blankMon(), hist: [], month: monthKey(S.time), sellAt: 0, distYear: null, start: cash };
    return S.me;
  };
  const blankMon = () => ({ salary: 0, divs: 0, interest: 0, gains: 0, tax: 0, living: 0, upkeep: 0, buy: 0, give: 0 });
  const ME = () => G.initMe(G.S);

  // ---------- 估值 ----------
  G.outShares = () => G.S.fin.stock.shares; // 流通在外股數（庫藏股不算）
  G.myShares = () => (G.S.founder.equity / 100) * G.S.fin.stock.shares;
  G.myStakeValue = () => {
    const S = G.S, st = S.fin.stock;
    return st.listed ? G.myShares() * st.price : (S.founder.equity / 100) * Math.max(0, G.equityBook());
  };
  G.itemsValue = () => ME().items.reduce((s, x) => s + x.value, 0);
  G.ownerLoan = () => (G.S && G.S.me ? G.S.me.lend : 0);
  G.netWorth = () => { const m = ME(); return m.cash + G.myStakeValue() + G.itemsValue() + m.lend; };
  // 股東借款算進公司負債
  const debt0 = G.debt;
  G.debt = () => debt0() + G.ownerLoan();
  // 改變流通股數時，創辦人的持股比例跟著變（股數不變）
  function reshare(oldShares, newShares, myDelta) {
    const S = G.S, mine = (S.founder.equity / 100) * oldShares + (myDelta || 0);
    S.founder.equity = Math.round(clamp((mine / newShares) * 100, 0, 100) * 100) / 100;
  }
  G.reshare = reshare;

  // ---------- 形象與危機 ----------
  // 公司正處在困境：上月虧損、罷工、一年內失事、欠薪（士氣很低）
  G.companyCrisis = () => {
    const S = G.S, st = S.fin.statements[S.fin.statements.length - 1];
    const why = [];
    if (st && st.ni < 0) why.push('公司上月虧損');
    if (S.hr && G.UNION_GROUPS.some((g) => S.hr.unions[g].strike)) why.push('員工正在罷工');
    if (S.safety.lastCrash && S.time - S.safety.lastCrash < YEAR) why.push('一年內發生失事');
    if (S.cash < 0) why.push('公司現金是負的');
    return why;
  };
  function image(d) { const m = ME(); m.image = clamp(m.image + d, 0, 100); }
  function scandal(text, rep, morale) {
    const S = G.S;
    G.repDelta(rep * G.fmod('attention'));
    if (morale && S.hr) G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].morale = clamp(S.hr.groups[g].morale + morale, 0, 100)));
    if (S.social) {
      const reach = Math.round(5000 * G.fmod('attention') * rnd(0.8, 1.6));
      S.social.posts.unshift({ id: S.social.seq++, cat: 'news', name: pick(['每日新聞台', '財經快報', '產業觀察報']), handle: pick(['dailynews', 'finflash', 'industrywatch']), text, t: S.time, related: true, sentiment: -1.5, virality: 0.8,
        likes: reach, shares: Math.round(reach * 0.2), comments: Math.round(reach * 0.15), opts: null, answered: null, breaking: true });
    }
    log(text, 'warn');
  }
  G.fairSalary = () => { const S = G.S, rev = S.fin.statements.slice(-12).reduce((s, x) => s + x.rev, 0); return Math.max(500e3, rev * 0.002); };
  G.salaryCap = () => (G.S.founder.type === 'manager' ? Math.max(1e6, G.fairSalary() * 1.5) : G.PERSONAL.maxSalary);

  // ---------- 個人操作 ----------
  G.setSalary = (v) => {
    const S = G.S, m = ME(), cap = G.salaryCap();
    v = Math.round(clamp(+v || 0, 0, cap));
    m.salary = v;
    log(`董事長年薪調整為 ${G.money(v)}${S.founder.type === 'manager' && v >= cap ? '（董事會核定上限）' : ''}`);
    return { ok: true, v, capped: v >= cap && cap < G.PERSONAL.maxSalary };
  };
  G.buyItem = (id) => {
    const S = G.S, m = ME(), it = ITEM[id];
    if (!it) return { ok: false };
    const cost = it.price * (1 + G.PERSONAL.fee * 5);
    if (m.cash < cost) return { ok: false, msg: `個人現金不足，需要 ${G.money(cost)}` };
    m.cash -= cost; m.mon.buy += cost; m.tot.spend += cost;
    m.items.push({ uid: m.seq++, id, name: it.name, cost, value: it.price, since: S.time });
    let note = '';
    if (it.lux) {
      const crisis = G.companyCrisis();
      if (crisis.length) {
        image(-rnd(8, 14));
        scandal(`【爆料】${crisis[0]}，${S.company.name}創辦人卻砸 ${G.money(it.price)} 買下${it.name}，員工與網友痛批「不知民間疾苦」。`, -2.5, -4);
        note = `${crisis[0]}時買奢侈品，社群爆料、社會評價與員工士氣下降`;
      } else if (!['tycoon', 'heir'].includes(S.founder.type)) { image(-1); note = '網友議論老闆的生活品味，個人形象小幅下降'; }
    }
    log(`創辦人購入${it.name}（${G.money(cost)}）${note ? '：' + note : ''}`, note && note.includes('爆料') ? 'warn' : 'info');
    return { ok: true, note };
  };
  G.sellItem = (uid) => {
    const m = ME(), x = m.items.find((i) => i.uid === uid);
    if (!x) return { ok: false };
    const proceeds = x.value * 0.95, gain = Math.max(0, proceeds - x.cost), tax = gain * G.PTAX.gain;
    m.cash += proceeds - tax; m.tot.gains += proceeds - x.cost; m.tot.tax += tax; m.mon.gains += proceeds - x.cost; m.mon.tax += tax;
    m.items = m.items.filter((i) => i !== x);
    log(`創辦人出售${x.name}，得款 ${G.money(proceeds - tax)}${tax ? `（含資本利得稅 ${G.money(tax)}）` : ''}`);
    return { ok: true, proceeds: proceeds - tax };
  };
  G.donate = (amount) => {
    const S = G.S, m = ME();
    amount = Math.round(+amount || 0);
    if (amount < 1e5) return { ok: false, msg: '最少捐 10 萬美元' };
    if (m.cash < amount) return { ok: false, msg: '個人現金不足' };
    m.cash -= amount; m.given += amount; m.mon.give += amount; m.tot.spend += amount;
    const pts = clamp(4 * Math.log10(amount / 1e5) + 2, 2, 20);
    image(pts);
    G.repDelta(Math.min(4, pts / 4));
    if (S.social) {
      const reach = Math.round(2500 * G.fmod('attention') * rnd(0.8, 1.5));
      S.social.posts.unshift({ id: S.social.seq++, cat: 'news', name: '每日新聞台', handle: 'dailynews', text: `${S.company.name}創辦人個人捐出 ${G.money(amount)} 投入${pick(['偏鄉教育', '弱勢家庭', '災後重建', '醫療研究', '環境保育'])}，獲得各界肯定。`, t: S.time, related: true, sentiment: 1.2, virality: 0.5,
        likes: reach, shares: Math.round(reach * 0.15), comments: Math.round(reach * 0.05), opts: null, answered: null, breaking: true });
    }
    log(`創辦人個人捐款 ${G.money(amount)}，個人形象提升`);
    return { ok: true };
  };
  G.setFoundation = (monthly) => { const m = ME(); m.foundation = Math.max(0, Math.round(+monthly || 0)); log(m.foundation ? `成立個人公益基金會，每月捐出 ${G.money(m.foundation)}` : '停止基金會的每月捐款'); return { ok: true }; };

  // ---------- 個人與公司之間 ----------
  // 未上市：每年一次盈餘分配（依持股比例分給股東）
  G.distLimit = () => {
    const S = G.S, ni12 = S.fin.statements.slice(-12).reduce((s, x) => s + x.ni, 0);
    return Math.max(0, Math.min(ni12 * 0.5, S.cash * 0.3, S.fin.retained));
  };
  G.ownerDistribution = (amount) => {
    const S = G.S, m = ME(), F = S.fin, y = new Date(S.time).getUTCFullYear();
    if (F.stock.listed) return { ok: false, msg: '上市公司改由年度股利發放' };
    if (m.distYear === y) return { ok: false, msg: '今年已經分配過盈餘' };
    amount = Math.round(+amount || 0);
    const lim = G.distLimit();
    if (amount <= 0 || amount > lim + 1) return { ok: false, msg: `可分配上限 ${G.money(lim)}（近 12 個月淨利的一半、現金的 30%、保留盈餘取最小）` };
    G._spend(amount, 'dividend'); F.retained -= amount;
    const mine = amount * (S.founder.equity / 100), tax = mine * G.PTAX.dividend;
    m.cash += mine - tax; m.tot.divs += mine; m.tot.tax += tax; m.mon.divs += mine; m.mon.tax += tax; m.distYear = y;
    log(`公司分配盈餘 ${G.money(amount)}，你依持股 ${S.founder.equity}% 分得 ${G.money(mine - tax)}（已扣股利所得稅）`);
    return { ok: true, mine: mine - tax };
  };
  // 上市公司發股利：創辦人那一份進個人帳戶
  G.onCompanyDividend = (total) => {
    const S = G.S, m = ME(), mine = total * (S.founder.equity / 100), tax = mine * G.PTAX.dividend;
    if (mine <= 0) return;
    m.cash += mine - tax; m.tot.divs += mine; m.tot.tax += tax; m.mon.divs += mine; m.mon.tax += tax;
    log(`你領到現金股利 ${G.money(mine - tax)}（已扣股利所得稅）`);
  };
  // 個人增資：未上市以每股淨值、上市以市價九五折發行新股給你
  G.injectPrice = () => { const S = G.S, st = S.fin.stock; return st.listed ? st.price * 0.95 : Math.max(0.1, G.equityBook() / st.shares); };
  G.injectCapital = (amount) => {
    const S = G.S, m = ME(), F = S.fin, st = F.stock;
    amount = Math.round(+amount || 0);
    if (amount <= 0) return { ok: false, msg: '請輸入金額' };
    if (m.cash < amount) return { ok: false, msg: '個人現金不足' };
    const pps = G.injectPrice(), n = amount / pps, old = st.shares;
    m.cash -= amount;
    st.shares += n;
    if (st.listed) F.ipoCapital += amount; else F.capital += amount;
    G.cashIn(amount, 'equity');
    reshare(old, st.shares, n);
    if (st.listed) st.price *= 0.99;
    log(`創辦人以每股 $${pps.toFixed(2)} 增資 ${G.money(amount)}，持股變為 ${S.founder.equity}%`);
    return { ok: true };
  };
  G.lendToCompany = (amount, rate) => {
    const m = ME();
    amount = Math.round(+amount || 0);
    if (amount <= 0) return { ok: false, msg: '請輸入金額' };
    if (m.cash < amount) return { ok: false, msg: '個人現金不足' };
    if (rate != null) m.lendRate = clamp(+rate, 0, 0.08);
    m.cash -= amount; m.lend += amount;
    G.cashIn(amount, 'loan');
    log(`創辦人借給公司 ${G.money(amount)}（年利率 ${(m.lendRate * 100).toFixed(1)}%），股東借款共 ${G.money(m.lend)}`);
    return { ok: true };
  };
  G.recallLoan = (amount) => {
    const S = G.S, m = ME();
    amount = Math.round(Math.min(+amount || 0, m.lend));
    if (amount <= 0) return { ok: false, msg: '沒有可收回的借款' };
    if (S.cash < amount) return { ok: false, msg: `公司現金只有 ${G.money(S.cash)}，還不出來` };
    G._spend(amount, 'principal');
    m.lend -= amount; m.cash += amount;
    log(`公司償還股東借款 ${G.money(amount)}`);
    return { ok: true };
  };
  // 上市後：在市場賣出或買進自家股票
  G.sellOwnShares = (frac) => {
    const S = G.S, m = ME(), st = S.fin.stock, X = G.MKT;
    if (!st.listed) return { ok: false, msg: '公司上市後才能在市場賣股' };
    if (S.time < m.sellAt) return { ok: false, msg: `剛減持過，${Math.ceil((m.sellAt - S.time) / DAY)} 天後才能再賣（避免被視為倒貨）` };
    frac = clamp(+frac || 0, 0, G.PERSONAL.sellMax);
    const n = Math.min(st.shares * frac, G.myShares());
    if (n <= 0) return { ok: false, msg: '沒有可以賣的持股' };
    const avg = st.price * (1 - (X.impact * (n / st.shares)) / 2), proceeds = n * avg * (1 - X.sellFee), tax = proceeds * G.PTAX.gain;
    const before = S.founder.equity;
    reshare(st.shares, st.shares, -n);
    st.price = Math.max(0.05, st.price * (1 - X.impact * (n / st.shares) * 1.5));
    m.cash += proceeds - tax; m.tot.gains += proceeds; m.tot.tax += tax; m.mon.gains += proceeds; m.mon.tax += tax; m.sellAt = S.time + G.PERSONAL.sellCooldown * DAY;
    if (G.marketNews) G.marketNews(`${S.company.name}創辦人申報轉讓 ${(frac * 100).toFixed(1)}% 持股，股價承壓`, '@self', -1);
    log(`你在市場賣出 ${G.num(Math.round(n))} 股（${(frac * 100).toFixed(1)}%），得款 ${G.money(proceeds - tax)}；持股 ${before}% → ${S.founder.equity}%`, 'warn');
    const warn = [50, 33.4].find((t) => before >= t && S.founder.equity < t);
    return { ok: true, warn: warn ? (warn === 50 ? '持股已低於 50%，股東會支持度不足時可能被撤換' : '持股已低於三分之一，失去否決重大議案的能力') : null };
  };
  G.ownFloat = () => {
    const S = G.S, st = S.fin.stock, held = (st.holders || []).reduce((s, h) => s + h.n, 0);
    return Math.max(0, st.shares * (1 - S.founder.equity / 100) - held);
  };
  G.buyOwnShares = (amount) => {
    const S = G.S, m = ME(), st = S.fin.stock, X = G.MKT;
    if (!st.listed) return { ok: false, msg: '公司上市後才能在市場買股；未上市請用增資' };
    amount = Math.round(+amount || 0);
    if (amount <= 0) return { ok: false, msg: '請輸入金額' };
    if (m.cash < amount) return { ok: false, msg: '個人現金不足' };
    const maxN = Math.min(G.ownFloat() * 0.5, st.shares * (G.PERSONAL.buyMaxEquity / 100) - G.myShares());
    let n = amount / (st.price * (1 + (X.impact * (amount / st.price / st.shares)) / 2) * (1 + X.buyFee));
    if (maxN <= 0) return { ok: false, msg: '市場上已經沒有足夠的流通股可以買' };
    n = Math.min(n, maxN);
    const cost = n * st.price * (1 + (X.impact * (n / st.shares)) / 2) * (1 + X.buyFee);
    m.cash -= cost;
    reshare(st.shares, st.shares, n);
    st.price *= 1 + X.impact * (n / st.shares) * 1.5;
    if (G.marketNews) G.marketNews(`${S.company.name}創辦人加碼買進自家股票，展現信心`, '@self', 1);
    log(`你在市場買進 ${G.num(Math.round(n))} 股，花費 ${G.money(cost)}，持股 ${S.founder.equity}%`);
    return { ok: true, n, cost };
  };

  // ---------- 庫藏股 ----------
  G.BUYBACK = { yearCap: 0.1, cashMonths: 3, minScore: 45 };
  const monthlyCost = () => { const st = G.S.fin.statements.slice(-3); return st.length ? st.reduce((s, x) => s + x.opex, 0) / st.length : 0; };
  G.buybackRoom = () => {
    const S = G.S, F = S.fin, st = F.stock, y = new Date(S.time).getUTCFullYear();
    const yr = F.bbY && F.bbY.y === y ? F.bbY : { y, n: 0, base: st.shares };
    const sharesLeft = Math.max(0, yr.base * G.BUYBACK.yearCap - yr.n);
    const money = Math.max(0, Math.min(F.retained + F.ipoCapital - (F.treasuryCost || 0), S.cash - monthlyCost() * G.BUYBACK.cashMonths));
    return { sharesLeft, money: Math.min(money, sharesLeft * st.price), yr };
  };
  G.buybackChecks = () => {
    const S = G.S, F = S.fin, c = G.credit(), room = G.buybackRoom();
    return [
      ['公司股票已上市', F.stock.listed],
      ['信用評等 BB 以上', c.score >= G.BUYBACK.minScore, c.grade],
      ['沒有逾期的貸款', !F.loans.some((l) => l.missed > 0)],
      ['今年買回額度還沒用完（每年 10%）', room.sharesLeft > 0, `剩 ${G.num(Math.round(room.sharesLeft))} 股`],
      ['買回後現金仍夠 3 個月營運', room.money > 0, G.money(room.money)],
    ];
  };
  G.startBuyback = (amount, days) => {
    const S = G.S, F = S.fin, st = F.stock;
    if (F.buyback) return { ok: false, msg: '已經有一個買回計畫在執行' };
    const chk = G.buybackChecks().find((x) => !x[1]);
    if (chk) return { ok: false, msg: `不符合條件：${chk[0]}` };
    const room = G.buybackRoom();
    amount = Math.round(Math.min(+amount || 0, room.money));
    if (amount < 1e5) return { ok: false, msg: '買回金額太小' };
    days = [30, 60, 90].includes(+days) ? +days : 60;
    F.buyback = { budget: amount, spent: 0, n: 0, days, start: S.time, end: S.time + days * DAY };
    const jump = rnd(0.02, 0.04);
    st.price *= 1 + jump;
    if (G.marketNews) G.marketNews(`${S.company.name}宣布 ${days} 天內買回最多 ${G.money(amount)} 庫藏股，股價上漲 ${(jump * 100).toFixed(1)}%`, '@self', 1);
    log(`董事會通過庫藏股買回計畫：${days} 天內最多買回 ${G.money(amount)}`);
    return { ok: true };
  };
  G.stopBuyback = (why) => {
    const S = G.S, F = S.fin, b = F.buyback;
    if (!b) return { ok: false };
    F.buyback = null;
    log(`庫藏股買回${why || '結束'}：共買回 ${G.num(Math.round(b.n))} 股，花費 ${G.money(b.spent)}，平均每股 $${b.n ? (b.spent / b.n).toFixed(2) : '—'}`);
    if (b.n > 0 && S.stats) S.stats.buybacks = (S.stats.buybacks || 0) + 1;
    return { ok: true };
  };
  function buybackDaily() {
    const S = G.S, F = S.fin, b = F.buyback, st = F.stock;
    if (!b) return;
    if (!st.listed) return G.stopBuyback('取消');
    const room = G.buybackRoom(), yr = room.yr;
    const daysLeft = Math.max(1, Math.ceil((b.end - S.time) / DAY));
    let amt = Math.min((b.budget - b.spent) / daysLeft, room.money, room.sharesLeft * st.price);
    if (amt <= 0 || S.cash <= 0) { if (S.time >= b.end) G.stopBuyback(); return; }
    const px = st.price * 1.002, n = amt / px, old = st.shares;
    G._spend(amt, 'buyback');
    st.shares -= n; st.treasury = (st.treasury || 0) + n; F.treasuryCost = (F.treasuryCost || 0) + amt;
    reshare(old, st.shares, 0);
    st.price *= 1.0015;
    b.spent += amt; b.n += n;
    yr.n += n; F.bbY = yr; F.bbYear = (F.bbYear || 0) + amt;
    if (b.spent >= b.budget - 1 || S.time >= b.end) G.stopBuyback('完成');
  }
  // 庫藏股再出售：賣回市場，或發給員工當獎勵
  G.reissueTreasury = (n, mode) => {
    const S = G.S, F = S.fin, st = F.stock;
    const have = st.treasury || 0;
    n = Math.min(Math.round(+n || 0), Math.floor(have));
    if (n <= 0) return { ok: false, msg: '沒有庫藏股' };
    const avg = F.treasuryCost / have, basis = avg * n, old = st.shares;
    st.treasury = have - n; F.treasuryCost -= basis; st.shares += n;
    if (mode === 'staff') {
      F.retained -= basis; // 員工獎酬：以買回成本認列，權益總額不變
      const payroll = (F.statements.slice(-1)[0] || { opCats: {} }).opCats.payroll || 1;
      const boost = clamp(((n * st.price) / payroll) * 8, 1, 12);
      if (S.hr) G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].morale = clamp(S.hr.groups[g].morale + boost, 0, 100)));
      reshare(old, st.shares, 0);
      log(`發給員工 ${G.num(n)} 股庫藏股作為獎勵（市值約 ${G.money(n * st.price)}），全體士氣 +${boost.toFixed(0)}`);
      return { ok: true, boost };
    }
    const proceeds = n * st.price * 0.98;
    G.cashIn(proceeds, 'equity');
    F.ipoCapital += proceeds - basis; // 與買回成本的差額列為資本公積
    st.price = Math.max(0.05, st.price * (1 - G.MKT.impact * (n / st.shares)));
    reshare(old, st.shares, 0);
    log(`在市場賣出 ${G.num(n)} 股庫藏股，得款 ${G.money(proceeds)}`);
    return { ok: true, proceeds };
  };

  // ---------- 每日／每月 ----------
  G.personalDaily = () => {
    const S = G.S, m = ME();
    buybackDaily();
    // 個人形象影響社會評價（形象 50 為中性）
    S.rep = clamp(S.rep + (m.image - 50) * 0.001, 0, 100);
    const k = monthKey(S.time);
    if (k === m.month) return;
    m.month = k;
    monthly(S, m);
  };
  function monthly(S, m) {
    const P = G.PERSONAL;
    // 薪酬：公司付、個人扣稅後入帳
    if (m.salary > 0) {
      const pay = m.salary / 12, tax = pay * G.PTAX.salary;
      G._spend(pay, 'payroll');
      m.cash += pay - tax; m.mon.salary += pay; m.mon.tax += tax; m.tot.salary += pay; m.tot.tax += tax;
      // 公司有困難時領高薪：形象與士氣下降
      const crisis = G.companyCrisis();
      if (crisis.length && m.salary > G.fairSalary() * 2) {
        image(-2);
        if (S.hr) G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].morale = clamp(S.hr.groups[g].morale - 1, 0, 100)));
        if (Math.random() < 0.35) scandal(`${crisis[0]}，${S.company.name}創辦人年薪卻高達 ${G.money(m.salary)}，引發外界批評。`, -1.5, -2);
      }
    }
    // 股東借款利息（公司付）
    if (m.lend > 0) {
      const it = (m.lend * m.lendRate) / 12;
      if (it > 0) { if (S.cash > it) { G._spend(it, 'bondfee'); m.cash += it; m.mon.interest += it; m.tot.interest += it; } else m.lend += it; }
    }
    // 存款利息或透支利息
    const r = m.cash >= 0 ? (m.cash * P.depositRate) / 12 : (m.cash * P.overdraftRate) / 12;
    m.cash += r; m.mon.interest += r; m.tot.interest += r;
    // 個人資產：價值變動與持有成本
    let upkeep = 0;
    m.items.forEach((x) => {
      const it = ITEM[x.id];
      x.value = Math.max(it.price * 0.05, x.value * Math.exp(it.app / 12 + (it.vol / Math.sqrt(12)) * gauss() - (it.vol * it.vol) / 24));
      upkeep += (x.value * it.upkeep) / 12;
    });
    // 生活費：隨身價調整
    const living = P.livingBase + (Math.max(0, G.netWorth()) * P.livingPct) / 12;
    m.cash -= upkeep + living; m.mon.upkeep += upkeep; m.mon.living += living; m.tot.spend += upkeep + living;
    // 基金會每月捐款
    if (m.foundation > 0) {
      const g = Math.min(m.foundation, Math.max(0, m.cash));
      if (g > 0) { m.cash -= g; m.given += g; m.mon.give += g; m.tot.spend += g; image(Math.min(1, 0.2 + g / 2e6)); }
      if (g < m.foundation) { m.foundation = 0; log('個人現金不足，基金會的每月捐款暫停', 'warn'); }
    }
    // 形象慢慢回到 50
    m.image += (50 - m.image) * 0.03;
    if (m.cash < 0) log(`個人現金為負（${G.money(m.cash)}），每年以 ${P.overdraftRate * 100}% 計息；可以出售個人資產或調整薪酬`, 'warn');
    m.hist.push({ t: S.time, w: Math.round(G.netWorth()), c: Math.round(m.cash) });
    if (m.hist.length > 240) m.hist.shift();
    m.last = m.mon; m.mon = blankMon();
    if (S.stats) S.stats.peakWorth = Math.max(S.stats.peakWorth || 0, G.netWorth());
  }

  // ---------- 私人飛機的小加成 ----------
  const hasJet = () => !!(G.S && G.S.me && G.S.me.items.some((x) => ITEM[x.id] && ITEM[x.id].jet));
  const fmod0 = G.fmod;
  G.fmod = (key, group) => { const v = fmod0(key, group); return key === 'gov' && hasJet() ? v + 0.05 : v; };
  const fit0 = G.allyFit;
  if (fit0) G.allyFit = (id) => { const r = fit0(id); if (hasJet()) { r.score = Math.min(100, r.score + 5); r.notes.push('私人飛機方便你親自拜訪各成員'); r.likely = r.score >= 50; } return r; };

  // ---------- 多人連線：身價 ----------
  G.netExtras = G.netExtras || [];
  G.netExtras.push(() => (G.S && G.S.me ? { worth: Math.round(G.netWorth()) } : {}));

  // ---------- 成就 ----------
  if (G.ACHIEVEMENTS) {
    G.ACHIEVEMENTS.push(
      ['billion', '億萬富翁', '個人身價達到 10 億美元', (S) => !!S.me && G.netWorth() >= 1e9, (S) => [S.me ? Math.max(0, G.netWorth()) / 1e7 : 0, 100]],
      ['tenbillion', '百億身價', '個人身價達到 100 億美元', (S) => !!S.me && G.netWorth() >= 1e10, (S) => [S.me ? Math.max(0, G.netWorth()) / 1e8 : 0, 100]],
      ['philanthropist', '慈善家', '個人累計捐款 1,000 萬美元', (S) => !!S.me && S.me.given >= 1e7, (S) => [S.me ? S.me.given / 1e5 : 0, 100]],
      ['collector', '收藏家', '同時擁有 5 件個人資產', (S) => !!S.me && S.me.items.length >= 5, (S) => [S.me ? S.me.items.length : 0, 5]],
      ['buyback', '回饋股東', '完成第一次庫藏股買回', (S) => (S.stats && S.stats.buybacks) > 0],
    );
  }
})();
