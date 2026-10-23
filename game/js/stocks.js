// v0.9.0 股市：大盤（多空循環＋波動群聚）、航空類股、各上市航空集團的模擬股價、玩家的投資組合，
// 以及其他航空公司（AI 與連線朋友）買賣玩家的股票。所有股價都是遊戲模擬，與真實市場無關。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const C = () => G.CARRIERS;
  const r4 = (v) => +v.toPrecision(5);

  G.MKT = {
    buyFee: 0.0015, sellFee: 0.0015, sellTax: 0.003, maxStake: 0.15, impact: 0.6, histDays: 300,
    regimes: { bull: { mu: 0.0006, sig: 0.008, stay: 0.996, zh: '多頭' }, calm: { mu: 0.0003, sig: 0.007, stay: 0.993, zh: '盤整' }, bear: { mu: -0.0008, sig: 0.013, stay: 0.985, zh: '空頭' } },
    alpha: 0.08, beta: 0.9, kappa: 0.01, ownKappa: 0.012,
  };
  // 上市的航空集團（遊戲中以集團計價；子公司併入母公司）。只收錄確定在證交所掛牌的集團。
  const GROUPS = [
    ['AA', '美國航空集團', ''], ['UA', '聯合航空控股', ''], ['DL', '達美航空', ''], ['WN', '西南航空', ''], ['AS', '阿拉斯加航空集團', 'HA'], ['B6', '捷藍航空', ''],
    ['F9', '邊疆航空集團', ''], ['G4', '忠實航空', ''], ['AC', '加拿大航空', ''], ['Y4', 'Volaris', ''], ['LA', '南美航空集團', 'JJ 4M LP XL'], ['CM', '巴拿馬航空控股', ''],
    ['LH', '漢莎航空集團', 'LX OS SN EW 4Y EN'], ['AF', '法航荷航集團', 'KL TO HV'], ['BA', '國際航空集團（IAG）', 'IB VY EI'], ['FR', '瑞安航空控股', 'RK'], ['U2', '易捷航空', ''],
    ['W6', '威茲航空', 'W4 W9'], ['DY', '挪威航空', 'D8'], ['AY', '芬蘭航空', ''], ['TK', '土耳其航空', 'VF'], ['PC', '飛馬航空', ''], ['A3', '愛琴海航空', 'OA'], ['LS', 'Jet2', ''],
    ['SQ', '新加坡航空', 'TR'], ['CX', '國泰航空', 'UO'], ['CI', '中華航空', 'AE'], ['BR', '長榮航空', 'B7'], ['JX', '星宇航空', ''], ['IT', '台灣虎航', ''],
    ['JL', '日本航空', 'NU ZG'], ['NH', 'ANA 控股', 'MM'], ['KE', '大韓航空', 'LJ'], ['OZ', '韓亞航空', 'BX RS'], ['7C', '濟州航空', ''], ['TW', '德威航空', ''],
    ['CA', '中國國際航空', 'ZH'], ['MU', '中國東方航空', 'FM'], ['CZ', '中國南方航空', 'MF'], ['HU', '海南航空控股', ''], ['9C', '春秋航空', ''], ['HO', '吉祥航空', ''],
    ['QF', '澳洲航空集團', 'JQ'], ['NZ', '紐西蘭航空', ''], ['6E', 'IndiGo（InterGlobe）', ''], ['SG', '香料航空', ''], ['AK', 'Capital A（亞洲航空）', 'FD D7 QZ Z2'],
    ['5J', '宿霧太平洋航空', 'DG'], ['GA', '印尼鷹航', 'QG'], ['VJ', '越捷航空', ''], ['VN', '越南航空', ''], ['KQ', '肯亞航空', ''], ['G9', '阿拉伯航空', ''], ['J9', '半島航空', ''],
  ];
  G.LISTED = {}; G.STOCK_OF = {};
  GROUPS.forEach(([k, zh, subs]) => {
    if (!C()[k]) return;
    const codes = [k, ...subs.split(' ').filter((c) => c && C()[c])];
    G.LISTED[k] = { key: k, zh, codes, cc: C()[k].cc, lcc: C()[k].lcc };
    codes.forEach((c) => (G.STOCK_OF[c] = k));
  });
  // 固定亂數：同一家公司每次開新遊戲的起始條件相同
  function seeded(str) {
    let h = 2166136261;
    for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // 肥尾：偶爾出現大波動
  const shock = () => (Math.random() < 0.02 ? gauss() * 2.5 : gauss());

  // ---------- 初始化 ----------
  function newStock(k) {
    const L = G.LISTED[k], rnd = seeded('stk' + k);
    const fleet = L.codes.reduce((s, c) => s + (G.carrierFleetEst ? G.carrierFleetEst(c) : 50), 0);
    const cap = Math.max(3e8, fleet * (L.lcc ? 30e6 : 20e6) * (0.6 + 0.9 * rnd()));
    const p = Math.round((5 + 70 * rnd()) * 100) / 100;
    return { p, fair: p, shares: Math.round(cap / p), beta: +(0.8 + 0.6 * rnd()).toFixed(2), vol: +(0.011 + 0.012 * rnd() * (fleet > 300 ? 0.6 : 1)).toFixed(4), h: null,
      divY: +(L.lcc ? 0.012 * rnd() : 0.01 + 0.03 * rnd()).toFixed(4), divM: 3 + Math.floor(rnd() * 8), earnD: 5 + Math.floor(rnd() * 20), hist: [], lastDiv: null };
  }
  const blankMkt = () => ({ v: 1, idx: 1000, h: null, regime: 'calm', sector: 0, days: [], idxHist: [], stocks: {}, port: {}, news: [], trades: [], earnSeen: null, ownHist: [] });
  G.initMarket = (S) => {
    const M = blankMkt();
    Object.keys(G.LISTED).forEach((k) => (M.stocks[k] = newStock(k)));
    S.mkt = M;
    // 預先模擬一年的歷史，讓走勢圖一開始就有資料
    const prev = G.S; G.S = S;
    const start = S.time - 365 * DAY;
    for (let i = 0; i < 365; i++) { const t = start + i * DAY, wd = new Date(t).getUTCDay(); if (wd === 0 || wd === 6) continue; stepMarket(M, t, true); }
    G.S = prev;
  };
  const i0 = G.initV9;
  G.initV9 = (S) => {
    if (i0) i0(S);
    if (!S.mkt) G.initMarket(S);
    const F = S.fin;
    if (F) { F.bonds = F.bonds || []; F.bondSeq = F.bondSeq || 1; F.invest = F.invest || 0; F.stock.holders = F.stock.holders || []; }
  };
  const Mk = () => { const S = G.S; if (!S.mkt) G.initMarket(S); return S.mkt; };
  G.mkt = Mk;

  // ---------- 一個交易日 ----------
  function stepMarket(M, t, quiet) {
    const X = G.MKT, R = X.regimes;
    // 多空循環（馬可夫鏈）
    const rg = R[M.regime];
    if (Math.random() > rg.stay) {
      const opts = Object.keys(R).filter((k) => k !== M.regime);
      const nx = M.regime === 'bear' ? 'calm' : opts[Math.floor(Math.random() * opts.length)];
      if (!quiet) mnews(`大盤由${R[M.regime].zh}轉為${R[nx].zh}`, null, nx === 'bear' ? -1 : 1);
      M.regime = nx;
    }
    const g = R[M.regime];
    // GARCH(1,1)：大波動之後常常接著大波動
    if (M.h == null) M.h = g.sig * g.sig;
    const w = g.sig * g.sig * (1 - X.alpha - X.beta);
    const eps = Math.sqrt(M.h) * shock();
    M.h = w + X.alpha * eps * eps + X.beta * M.h;
    const rm = g.mu + eps;
    M.idx *= Math.exp(rm);
    M.lastRm = rm;
    // 航空類股因子：油價、旅遊需求等消息
    let sec = 0.3 * M.sector + gauss() * 0.005;
    if (Math.random() < 0.004) {
      const ev = [[-0.045, '國際油價走高，航空類股普遍下跌'], [0.03, '油價回落，航空類股反彈'], [0.025, '旅遊需求強勁，航空類股走揚'], [-0.05, '景氣疑慮升溫，航空類股遭拋售'], [0.02, '商務旅運恢復，航空類股上漲']][Math.floor(Math.random() * 5)];
      sec += ev[0] * (0.7 + 0.6 * Math.random());
      if (!quiet) mnews(ev[1], null, ev[0]);
    }
    M.sector = sec;
    M.lastSec = sec;
    const day = Math.floor(t / DAY), dt = new Date(t), mon = dt.getUTCMonth() + 1, date = dt.getUTCDate();
    Object.entries(M.stocks).forEach(([k, s]) => {
      if (s.delisted) return; // v1.1.0 被你收購後下市
      if (s.h == null) s.h = s.vol * s.vol;
      const e = Math.sqrt(s.h) * shock();
      s.h = s.vol * s.vol * 0.05 + 0.1 * e * e + 0.85 * s.h;
      s.fair *= Math.exp(0.00012 + rm * 0.6 + sec * 0.5); // 合理價值也跟著景氣變動，但幅度較小
      let r = s.beta * rm + sec + e + X.kappa * Math.log(s.fair / s.p);
      // 每季財報（2、5、8、11 月）
      if ([2, 5, 8, 11].includes(mon) && date >= s.earnD && s.earnSeen !== `${dt.getUTCFullYear()}-${mon}`) {
        s.earnSeen = `${dt.getUTCFullYear()}-${mon}`;
        const u = gauss() * 0.05;
        s.fair *= Math.exp(u); r += 0.6 * u;
        if (!quiet && Math.abs(u) > 0.06) mnews(`${G.LISTED[k].zh}季報${u > 0 ? '優於' : '不如'}預期，股價${u > 0 ? '大漲' : '重挫'} ${Math.abs(u * 60).toFixed(1)}%`, k, u);
      }
      s.p = Math.max(0.2, s.p * Math.exp(r));
      s.chg = Math.exp(r) - 1;
      s.hist.push(r4(s.p));
      if (s.hist.length > X.histDays) s.hist.shift();
    });
    M.days.push(day); M.idxHist.push(r4(M.idx));
    if (M.days.length > X.histDays) { M.days.shift(); M.idxHist.shift(); }
  }
  function mnews(text, key, dir) {
    const M = Mk();
    M.news.unshift({ t: G.S.time, text, key, dir });
    M.news = M.news.slice(0, 40);
  }
  G.marketNews = mnews;

  // ---------- 投資組合 ----------
  const own = (key) => Mk().port[key];
  G.stakeIn = (code) => { const k = G.STOCK_OF[code]; if (!k) return 0; const h = own(k), s = Mk().stocks[k]; return h && s ? h.n / s.shares : 0; };
  // 可交易的標的：AI 上市集團，或連線中已上市的朋友（key = '@' + 代碼）
  G.quote = (key) => {
    if (key[0] === '@') {
      const p = G.netPlayer && G.netPlayer(key.slice(1));
      return p && p.stock ? { key, name: p.name, p: p.stock.price, shares: p.stock.shares, human: true, chg: p.stock.chg || 0 } : null;
    }
    const s = Mk().stocks[key];
    return s && !s.delisted ? { key, name: G.LISTED[key].zh, p: s.p, shares: s.shares, chg: s.chg || 0 } : null;
  };
  G.buyStock = (key, n) => {
    const S = G.S, X = G.MKT, q = G.quote(key), F = S.fin;
    n = Math.floor(n);
    if (!q) return { ok: false, msg: '這檔股票目前無法交易' };
    if (!(n > 0)) return { ok: false, msg: '請輸入股數' };
    if (key === '@' + S.company.code) return { ok: false, msg: '不能用公司資金買自己的股票（庫藏股之後再做）' };
    const h = own(key) || { n: 0, cost: 0 };
    if ((h.n + n) / q.shares > X.maxStake + 1e-9) return { ok: false, msg: `持股不能超過 ${X.maxStake * 100}%（多數國家限制外資與同業持有航空公司股權）` };
    const frac = n / q.shares, avg = q.p * (1 + X.impact * frac / 2), gross = n * avg, fee = gross * X.buyFee;
    if (S.cash < gross + fee) return { ok: false, msg: `現金不足，需要 ${G.money(gross + fee)}` };
    G._spend(gross + fee, 'invest');
    F.invest = (F.invest || 0) + gross + fee;
    Mk().port[key] = { n: h.n + n, cost: h.cost + gross + fee, since: h.since || S.time, lastDivT: h.lastDivT || S.time };
    if (key[0] === '@') G.netSendCode(key.slice(1), { t: 'stk-trade', n, price: avg, code: S.company.code, name: S.company.name });
    else Mk().stocks[key].p *= 1 + X.impact * frac;
    trade('買進', q.name, n, avg);
    return { ok: true, avg, total: gross + fee };
  };
  G.sellStock = (key, n) => {
    const S = G.S, X = G.MKT, q = G.quote(key), F = S.fin, h = own(key);
    n = Math.floor(n);
    if (!h || !q) return { ok: false, msg: '沒有持股或目前無法交易' };
    if (!(n > 0) || n > h.n) return { ok: false, msg: `最多可賣 ${G.num(h.n)} 股` };
    const frac = n / q.shares, avg = q.p * (1 - X.impact * frac / 2), proceeds = n * avg * (1 - X.sellFee - X.sellTax);
    const costPart = h.cost * (n / h.n);
    G.cashIn(proceeds, 'investSale');
    S.day.gain += proceeds - costPart;
    F.invest = Math.max(0, (F.invest || 0) - costPart);
    if (n === h.n) delete Mk().port[key]; else { h.n -= n; h.cost -= costPart; }
    if (key[0] === '@') G.netSendCode(key.slice(1), { t: 'stk-trade', n: -n, price: avg, code: S.company.code, name: S.company.name });
    else Mk().stocks[key].p *= 1 - X.impact * frac;
    trade('賣出', q.name, n, avg, proceeds - costPart);
    return { ok: true, proceeds, gain: proceeds - costPart };
  };
  function trade(kind, name, n, price, gain) {
    const M = Mk();
    M.trades.unshift({ t: G.S.time, kind, name, n, price, gain: gain == null ? null : gain });
    M.trades = M.trades.slice(0, 30);
    G.log(`${kind} ${name} ${G.num(n)} 股，均價 $${price.toFixed(2)}${gain != null ? `，實現損益 ${G.money(gain)}` : ''}`);
  }
  G.portfolio = () => Object.entries(Mk().port).map(([key, h]) => {
    const q = G.quote(key), p = q ? q.p : h.cost / h.n;
    return { key, name: q ? q.name : key, n: h.n, cost: h.cost, avg: h.cost / h.n, p, value: h.n * p, pl: h.n * p - h.cost, stake: q ? h.n / q.shares : 0, chg: q ? q.chg : 0, stale: !q };
  });

  // ---------- 玩家自己的股價 ----------
  function ownStep(M) {
    const S = G.S, F = S.fin, st = F.stock;
    if (!st.listed) return;
    st.holders = st.holders || [];
    const fair = G.fairValue() / st.shares, cap = st.price * st.shares;
    const a = G.assets().total, lev = a > 0 ? G.debt() / a : 1;
    const size = clamp(Math.pow(1e9 / Math.max(1e7, cap), 0.15), 0.8, 1.6);
    const vol = 0.013 * (1 + lev) * size;
    if (st.h == null) st.h = vol * vol;
    const e = Math.sqrt(st.h) * shock();
    st.h = vol * vol * 0.05 + 0.1 * e * e + 0.85 * st.h;
    let r = 1.2 * (M.lastRm || 0) + (M.lastSec || 0) + e + G.MKT.ownKappa * Math.log(Math.max(0.01, fair) / st.price);
    // 月報：新的月結報表出來時，依合理價值的變化跳空
    const n = F.statements.length, last = F.statements[n - 1];
    const tag = last ? `${last.y}-${last.m}` : null;
    if (tag && st.earnSeen !== tag) {
      if (st.earnSeen && st.fairSeen) {
        const gap = clamp(0.5 * Math.log(Math.max(0.01, fair) / st.fairSeen), -0.12, 0.12);
        r += gap;
        if (Math.abs(gap) > 0.02) mnews(`${S.company.name}公布 ${last.m} 月營運結果（稅後淨利 ${G.money(last.ni)}），股價${gap > 0 ? '跳空上漲' : '跳空下跌'} ${Math.abs(gap * 100).toFixed(1)}%`, '@self', gap);
      }
      st.earnSeen = tag; st.fairSeen = Math.max(0.01, fair);
    }
    const p0 = st.price;
    st.price = Math.max(0.05, st.price * Math.exp(r));
    st.chg = st.price / p0 - 1;
    st.hist.push({ t: S.time, p: st.price });
    if (st.hist.length > 730) st.hist.shift();
  }
  // 其他航空公司買賣你的股票
  function holdersMonthly() {
    const S = G.S, F = S.fin, st = F.stock;
    if (!st.listed) return;
    const H = (st.holders = st.holders || []);
    const floatShares = st.shares * (1 - S.founder.equity / 100);
    const aiHeld = () => H.filter((h) => h.kind === 'ai').reduce((s, h) => s + h.n, 0);
    const fair = G.fairValue() / st.shares;
    const P = G.allyPartners ? G.allyPartners() : { ai: new Set() };
    // 賣出：財務投資獲利了結；盟友關係結束的策略持股
    H.slice().forEach((h) => {
      if (h.kind !== 'ai' || h.why === 'raid' || h.why === 'knight') return; // v1.2.0 收購方與白騎士由 takeover.js 處理
      const gain = st.price / h.avg - 1;
      const sell = h.why === 'financial' ? (gain > 0.3 && Math.random() < 0.3) || (gain < -0.35 && Math.random() < 0.2) : !P.ai.has(h.code) && Math.random() < 0.5;
      if (!sell) return;
      H.splice(H.indexOf(h), 1);
      st.price *= 1 - G.MKT.impact * (h.n / st.shares);
      mnews(`${h.name}出售所持有的 ${S.company.name} ${(h.n / st.shares * 100).toFixed(1)}% 股權`, '@self', -1);
      G.log(`${h.name}出售所持有的你公司 ${(h.n / st.shares * 100).toFixed(1)}% 股權，股價承壓`, 'warn');
      G._emit('event', { kind: 'holder', text: `${h.name}出售了你公司的股票` });
    });
    if (aiHeld() > floatShares * 0.3) return;
    let buyer = null, why = null;
    // 盟友：策略性交叉持股（真實世界如達美與大韓航空、法航荷航與北歐航空）
    const partners = [...P.ai].filter((c) => !H.some((h) => h.code === c));
    if (partners.length && Math.random() < 0.12) { buyer = partners[Math.floor(Math.random() * partners.length)]; why = 'strategic'; }
    // 財務投資：股價明顯低於合理價值、而且有獲利
    else if (st.price < fair * 0.85 && F.statements.slice(-3).reduce((s, x) => s + x.ni, 0) > 0 && Math.random() < 0.08) {
      const big = Object.keys(G.LISTED).filter((k) => k !== S.company.code && !Mk().stocks[k].delisted && !H.some((h) => h.code === k)).sort((a, b) => Mk().stocks[b].shares * Mk().stocks[b].p - Mk().stocks[a].shares * Mk().stocks[a].p).slice(0, 25);
      buyer = big[Math.floor(Math.random() * big.length)]; why = 'financial';
    }
    if (!buyer) return;
    const pct = why === 'strategic' ? 0.01 + Math.random() * 0.03 : 0.01 + Math.random() * 0.02;
    const n = Math.round(Math.min(floatShares * 0.3 - aiHeld(), st.shares * pct));
    if (n <= 0) return;
    const name = G.LISTED[buyer] ? G.LISTED[buyer].zh : G.carrierName(C()[buyer]);
    H.push({ code: buyer, kind: 'ai', name, n, avg: st.price, since: S.time, why });
    st.price *= 1 + G.MKT.impact * (n / st.shares) * 1.5;
    const txt = `${name}取得你公司 ${(n / st.shares * 100).toFixed(1)}% 股權（${why === 'strategic' ? '盟友策略持股，股東會會支持經營團隊' : '財務投資'}）`;
    mnews(`${name}買進 ${S.company.name} ${(n / st.shares * 100).toFixed(1)}% 股權`, '@self', 1);
    G.log(txt);
    G._emit('event', { kind: 'holder', text: txt });
  }
  G.friendlyStake = () => {
    const S = G.S, st = S.fin.stock, H = st.holders || [];
    return H.filter((h) => (h.kind === 'ai' && h.why === 'knight') || (h.kind === 'ai' && h.why === 'strategic' && G.isPartner && G.isPartner(h.code)) || (h.kind === 'player' && G.isPartner && G.isPartner(h.code))).reduce((s, h) => s + h.n, 0);
  };

  // ---------- 每日 ----------
  G.stockDaily = () => {
    const S = G.S, M = Mk(), t = S.time - DAY / 2, d = new Date(t), wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) { stepMarket(M, t, false); ownStep(M); }
    const mon = d.getUTCMonth() + 1, date = d.getUTCDate();
    // 持有的 AI 股票配息
    if (date === 15) Object.entries(M.port).forEach(([k, h]) => {
      const s = M.stocks[k];
      if (!s || s.delisted || s.divM !== mon) return;
      const dps = s.p * s.divY;
      s.p -= dps; s.lastDiv = { t: S.time, dps };
      const v = dps * h.n;
      G.cashIn(v, 'divIn'); S.day.gain += v; h.divs = (h.divs || 0) + v;
      G.log(`收到${G.LISTED[k].zh}現金股利 ${G.money(v)}（每股 $${dps.toFixed(2)}）`);
    });
    if (date === 15) Object.entries(M.stocks).forEach(([k, s]) => { if (!s.delisted && s.divM === mon && !M.port[k]) { const dps = s.p * s.divY; s.p -= dps; s.lastDiv = { t: S.time, dps }; } });
    // 朋友公司的股利（從他每天傳來的公開資訊得知）
    Object.entries(M.port).forEach(([k, h]) => {
      if (k[0] !== '@') return;
      const p = G.netPlayer && G.netPlayer(k.slice(1));
      if (!p || !p.stock || !p.stock.dpsT || p.stock.dpsT <= (h.lastDivT || 0)) return;
      const v = p.stock.dps * h.n;
      h.lastDivT = p.stock.dpsT;
      if (v > 0) { G.cashIn(v, 'divIn'); S.day.gain += v; h.divs = (h.divs || 0) + v; G.log(`收到 ${p.name} 現金股利 ${G.money(v)}`); }
    });
    if (date === 1) holdersMonthly();
  };
  // 重大事件的股價反應（原本的失事、罷工之外再加新聞）
  G.on((w, d) => {
    if (w !== 'event' || !G.S || !G.S.fin || !G.S.fin.stock.listed || !d) return;
    if (d.kind === 'crash') mnews(`${G.S.company.name}發生飛安事故，股價重挫`, '@self', -1);
    if (d.kind === 'strike') mnews(`${G.S.company.name}員工罷工，股價下跌`, '@self', -1);
  });

  // ---------- 連線：朋友買賣你的股票 ----------
  (G.netHandlers = G.netHandlers || []).push((from, m) => {
    const S = G.S;
    if (!S || !m || m.t !== 'stk-trade' || !S.fin.stock.listed) return;
    const st = S.fin.stock, H = (st.holders = st.holders || []);
    let h = H.find((x) => x.kind === 'player' && x.code === m.code);
    if (!h) { h = { code: m.code, kind: 'player', name: m.name, n: 0, avg: m.price, since: S.time }; H.push(h); }
    if (m.n > 0) h.avg = (h.avg * h.n + m.price * m.n) / (h.n + m.n);
    h.n = Math.max(0, h.n + m.n);
    if (!h.n) H.splice(H.indexOf(h), 1);
    st.price *= 1 + G.MKT.impact * (m.n / st.shares);
    const txt = `${m.name} ${m.n > 0 ? '買進' : '賣出'}你公司 ${G.num(Math.abs(m.n))} 股（${(Math.abs(m.n) / st.shares * 100).toFixed(2)}%）`;
    G.log(txt); G._emit('event', { kind: 'holder', text: txt });
  });
  G.netExtras = G.netExtras || [];
  G.netExtras.push(() => {
    const st = G.S.fin && G.S.fin.stock;
    return { stock: st && st.listed ? { price: +st.price.toFixed(4), shares: Math.round(st.shares), chg: st.chg || 0, dps: st.lastDps || 0, dpsT: st.lastDpsT || 0 } : null };
  });
})();
