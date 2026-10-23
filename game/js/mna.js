// v1.0.0 併購：買下 AI 航空公司（上市集團用公開收購、未上市公司用協議收購），經過主管機關審查後成為子公司。
// 會計：權益法。收購價記為「子公司投資」，子公司每月的淨利依持股認列為投資收益（帳面價值增加），
// 發放給母公司的現金股利則減少帳面價值。子公司仍以原品牌營運（真實世界的多品牌集團，如漢莎、法荷航）。
// 營運效果：子公司視同最緊密的合作夥伴 —— 同航線不再搶你的旅客、不會對你發動價格戰，
// 飛往子公司樞紐的航線會多一些轉機客（如同聯盟，但更強）。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const C = () => G.CARRIERS;

  G.MNA = {
    premium: 1.3,          // 公開收購溢價（市值 × 1.3）
    perAc: { fsc: 12e6, lcc: 9e6 }, // 未上市公司：每架飛機的企業價值（含航權、品牌、人員）
    advisory: 0.02,        // 財務顧問與法律費用（收購價的 2%，送件時支付，不退）
    breakFee: 0.03,        // 核准後資金不足、交易破局的違約金
    review: 90,            // 審查天數
    approve: { domestic: 0.8, foreign: 0.4 },
    roe: 0.08,             // 子公司年報酬（以收購價計）的平均值
    payout: 0.5,           // 獲利的一半以現金股利匯回
    feed: 0.08,            // 飛往子公司樞紐的航線攬客力加成
    max: 5,                // 最多同時擁有的子公司數
    minFleet: 5,           // 母公司至少要有幾架飛機才能發動併購
  };
  const blank = () => ({ subs: [], deals: [], seq: 1, news: [] });
  const st = () => { const S = G.S; if (!S.mna) S.mna = blank(); return S.mna; };
  G.mnaState = st;
  // 子公司或正在審查的交易涵蓋的代碼
  const subCodes = () => { const s = new Set(); st().subs.forEach((x) => x.codes.forEach((c) => s.add(c))); return s; };
  G.isSub = (code) => subCodes().has(code);
  const bump = () => { const S = G.S; if (S.ally) S.ally.ver = (S.ally.ver || 0) + 1; };

  // 固定亂數（同一家公司每局估值相同）
  function seeded(str) {
    let h = 2166136261;
    for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // ---------- 標的 ----------
  // 上市集團：整個集團一起買（含子品牌）；未上市：單一公司。上市集團旗下的子品牌不能單獨買。
  G.mnaTarget = (code) => {
    const c = C()[code];
    if (!c) return null;
    const S = G.S;
    if (G.STOCK_OF && G.STOCK_OF[code]) {
      const k = G.STOCK_OF[code], L = G.LISTED[k], s = G.mkt().stocks[k];
      if (!s) return null;
      const h = G.mkt().port[k];
      const held = h ? h.n : 0, cap = s.p * s.shares;
      const price = (s.shares - held) * s.p * G.MNA.premium;
      const fleet = L.codes.reduce((t, x) => t + G.carrierFleetEst(x), 0);
      return { key: k, listed: true, name: L.zh, codes: L.codes.slice(), cc: L.cc, lcc: L.lcc, cap, price, held, heldCost: h ? h.cost : 0, fleet, hubs: [...new Set(L.codes.flatMap((x) => C()[x].hubs))] };
    }
    const fleet = G.carrierFleetEst(code);
    const v = fleet * (c.lcc ? G.MNA.perAc.lcc : G.MNA.perAc.fsc) * (0.75 + 0.5 * seeded('mna' + code));
    return { key: code, listed: false, name: G.carrierName(c), codes: [code], cc: c.cc, lcc: c.lcc, cap: v, price: v, held: 0, heldCost: 0, fleet, hubs: c.hubs.slice() };
  };
  // 核准機率：同國併購較容易；跨國受外資持股限制；重疊航線多或規模太大會被反壟斷審查卡住
  G.mnaApproval = (T) => {
    const S = G.S, home = G.homeCC ? G.homeCC() : G.AP[S.company.hub].cc;
    let p = T.cc === home ? G.MNA.approve.domestic : G.MNA.approve.foreign;
    const ov = S.routes.filter((r) => T.codes.some((c) => G.carriersOn(r.a, r.b).includes(c))).length;
    const share = S.routes.length ? ov / S.routes.length : 0;
    if (share > 0.3) p -= 0.2 * Math.min(1, (share - 0.3) / 0.4 + 0.5);
    if (T.fleet > 300) p -= 0.15; else if (T.fleet > 150) p -= 0.08;
    if (G.isPartner && T.codes.some((c) => G.isPartner(c))) p += 0.05; // 盟友之間的整合較容易被接受
    if (S.gov && G.govMood) p += (G.govMood() - 50) / 500;
    return { p: clamp(p, 0.1, 0.9), overlap: ov };
  };
  G.mnaWhyNot = (code) => {
    const S = G.S, c = C()[code];
    if (!c) return '找不到這家公司';
    if (code === S.company.code) return '這是你自己的代碼';
    if (G.groupCap && G.groupCap() === 0) return `機隊至少要 ${G.GROUP_TIERS[0][0]} 架才能擁有子公司`;
    if (st().merged && st().merged.some((m) => m.codes.includes(code))) return '已經併入你的公司';
    if (G.isSub(code)) return '已經是你的子公司';
    if (st().deals.some((d) => d.codes.includes(code))) return '收購案審查中';
    if (G.groupUsed && G.groupUsed() >= G.groupCap()) { const nx = G.groupNext(); return `集團旗下已有 ${G.groupUsed()} 家航空公司（含審查中、自創子航空公司），目前上限 ${G.groupCap()} 家${nx ? `；機隊達到 ${nx[0]} 架可以再多一家` : ''}`; }
    if (G.net && G.net.players && Object.values(G.net.players).some((p) => p && p.code === code)) return '這個代碼是連線玩家的公司';
    const T = G.mnaTarget(code);
    if (!T) return '這家公司目前無法收購';
    if (T.codes.includes(S.company.code)) return '你的代碼屬於這個集團';
    if (st().subs.some((x) => x.codes.some((y) => T.codes.includes(y)))) return '集團內已有你的子公司';
    return null;
  };

  // ---------- 送件 ----------
  G.mnaOffer = (code) => {
    const S = G.S, why = G.mnaWhyNot(code);
    if (why) return { ok: false, msg: why };
    const T = G.mnaTarget(code), fee = T.price * G.MNA.advisory;
    if (S.cash < T.price + fee) return { ok: false, msg: `現金不足：收購價 ${G.money(T.price)}＋顧問費 ${G.money(fee)}（可以先借款或發債）` };
    G._spend(fee, 'overhead');
    const ap = G.mnaApproval(T);
    const d = { id: st().seq++, key: T.key, name: T.name, codes: T.codes, listed: T.listed, price: T.price, fee, p: ap.p, due: S.time + G.MNA.review * DAY, at: S.time };
    st().deals.push(d);
    news(`宣布收購${T.name}，出價 ${G.money(T.price)}${T.listed ? '（公開收購，溢價 30%）' : ''}，送交主管機關審查（約 ${G.MNA.review} 天，核准機會約 ${Math.round(ap.p * 100)}%）`);
    if (T.listed) G.mkt().stocks[T.key].p *= 1.2; // 收購消息讓標的股價上漲
    return { ok: true, deal: d };
  };
  G.mnaWithdraw = (id) => {
    const D = st().deals.find((x) => x.id === id);
    if (!D) return { ok: false, msg: '找不到這筆交易' };
    st().deals = st().deals.filter((x) => x !== D);
    news(`撤回對${D.name}的收購案（顧問費不退）`, 'warn');
    return { ok: true };
  };
  function close(D) {
    const S = G.S, F = S.fin;
    st().deals = st().deals.filter((x) => x !== D);
    if (Math.random() > D.p) { news(`主管機關否決收購${D.name}（反壟斷或外資持股限制），交易取消`, 'warn'); return; }
    // 以送件時鎖定的收購價交割（公開收購價格在公告時就確定）
    const T = G.mnaTarget(D.codes[0]);
    const price = D.price;
    if (S.cash < price) {
      const pen = Math.min(S.cash * 0.5, D.price * G.MNA.breakFee);
      G._spend(pen, 'overhead');
      news(`收購${D.name}已獲核准，但現金不足以交割（需要 ${G.money(price)}），交易破局並支付違約金 ${G.money(pen)}`, 'warn');
      return;
    }
    G._spend(price, 'invest');
    let book = price;
    // 原本持有的股票併入子公司投資（以成本轉列）
    if (T && T.listed && T.held) { const h = G.mkt().port[T.key]; F.invest = Math.max(0, (F.invest || 0) - h.cost); book += h.cost; delete G.mkt().port[T.key]; }
    F.subsBook = (F.subsBook || 0) + book;
    st().subs.push({ key: D.key, name: D.name, codes: D.codes, listed: D.listed, cost: book, book, since: S.time, ni: 0, divs: 0, last: 0, hubs: [...new Set(D.codes.flatMap((x) => C()[x].hubs))] });
    if (T && T.listed) Object.assign(G.mkt().stocks[T.key], { sub: true, delisted: true }); // v1.1.0 全數收購後下市
    bump();
    news(`完成收購${D.name}（${G.money(price)}），成為你的子公司`);
    G._emit('event', { kind: 'mna', text: `${D.name}成為你的子公司` });
  }

  // ---------- 出售子公司 ----------
  G.mnaSaleValue = (sub) => {
    return sub.book * (0.95 + 0.15 * seeded('sale' + sub.key + Math.floor(G.S.time / (30 * DAY))));
  };
  G.mnaSell = (key) => {
    const S = G.S, F = S.fin, sub = st().subs.find((x) => x.key === key);
    if (!sub) return { ok: false, msg: '找不到這家子公司' };
    if (S.time - sub.since < 180 * DAY) return { ok: false, msg: '收購未滿半年，不能出售' };
    if (sub.integ) return { ok: false, msg: '整合中，不能出售' };
    const v = G.mnaSaleValue(sub);
    G.cashIn(v, 'investSale');
    S.day.gain += v - sub.book;
    F.subsBook = Math.max(0, (F.subsBook || 0) - sub.book);
    st().subs = st().subs.filter((x) => x !== sub);
    // 上市集團賣回市場：重新掛牌，股價依售價推算
    if (sub.listed && G.mkt().stocks[sub.key]) { const sk = G.mkt().stocks[sub.key]; Object.assign(sk, { sub: false, delisted: false, h: null }); sk.p = Math.max(0.5, v / 1.1 / sk.shares); sk.fair = sk.p; }
    bump();
    news(`出售子公司${sub.name}，售價 ${G.money(v)}，處分損益 ${G.money(v - sub.book)}`);
    return { ok: true, v, gain: v - sub.book };
  };

  // ---------- 每月：權益法認列 ----------
  function monthly() {
    const S = G.S, F = S.fin, M = G.mkt ? G.mkt() : null;
    const regime = M ? ({ bull: 0.02, calm: 0, bear: -0.04 })[M.regime] || 0 : 0;
    const diff = G.dmod ? G.dmod('demand') - 1 : 0;
    st().subs.forEach((sub) => {
      const r = (G.MNA.roe + regime + diff * 0.5 + gauss() * 0.06) / 12;
      const ni = sub.cost * r;
      sub.book += ni; F.subsBook += ni; S.day.gain += ni; sub.ni += ni; sub.last = ni;
      if (ni > 0) {
        const dv = ni * G.MNA.payout;
        sub.book -= dv; F.subsBook -= dv; G.cashIn(dv, 'divIn'); sub.divs += dv;
      }
      // 帳面價值不會低於收購價的 30%（極端虧損時視為已提列減損，不再往下認列）
      const floor = sub.cost * 0.3;
      if (sub.book < floor) { const fix = floor - sub.book; sub.book += fix; F.subsBook += fix; S.day.gain += fix; }
    });
  }
  G.mnaDaily = () => {
    const S = G.S;
    if (!S.mna) return;
    st().deals.slice().forEach((D) => { if (S.time >= D.due) close(D); });
    st().subs.slice().forEach((x) => { if (x.integ && S.time >= x.integ.until) integrate(x); });
    const d = new Date(S.time - DAY / 2);
    if (d.getUTCDate() === 1 && st().subs.length) monthly();
  };
  const od = G.ops10Daily;
  G.ops10Daily = () => { if (od) od(); G.mnaDaily(); };

  function news(text, kind) {
    const m = st();
    m.news.unshift({ t: G.S.time, text });
    m.news = m.news.slice(0, 20);
    G.log(text, kind);
  }

  // ---------- 營運效果 ----------
  // 子公司視同合作夥伴：同航線的稀釋降低、不會發動價格戰
  const ip = G.isPartner;
  G.isPartner = (code) => (G.S && G.S.mna && G.isSub(code)) || (ip ? ip(code) : false);
  const arm = G.allyRivalMul;
  G.allyRivalMul = (code) => (G.S && G.S.mna && G.isSub(code) ? 0.3 : arm ? arm(code) : 1);
  // 飛往子公司樞紐：子公司把轉機旅客接給你
  const ab = G.allyBoost;
  G.allyBoost = (r, seg, cls) => {
    let b = ab ? ab(r, seg, cls) : 1;
    const S = G.S;
    if (S && S.mna && S.mna.subs.length) {
      const hubs = new Set(S.mna.subs.flatMap((x) => x.hubs));
      if (hubs.has(r.b) || hubs.has(r.a)) b *= 1 + G.MNA.feed;
    }
    return b;
  };
  // 子公司的股票不能再買
  const bs0 = G.buyStock;
  G.buyStock = (key, n) => {
    if (G.S && G.S.mna && st().subs.some((x) => x.key === key)) return { ok: false, msg: '這家公司已經是你的子公司' };
    if (G.S && G.S.mna && (st().merged || []).some((x) => x.key === key)) return { ok: false, msg: '這家公司已經併入你的公司' };
    if (G.S && G.S.mna && st().deals.some((x) => x.key === key)) return { ok: false, msg: '你正在收購這家公司，審查期間不能買進它的股票' };
    return bs0(key, n);
  };
  // 子公司的價值（給公司估值與排行榜）
  G.subsValue = () => (G.S && G.S.mna ? st().subs.reduce((s, x) => s + G.mnaSaleValue(x), 0) : 0);

  // ====================================================================
  // 整合：把獨立子公司併進自己的航網（國泰與港龍的三個階段：收購 → 保留品牌整合 → 併入主品牌）
  // ====================================================================
  // 保留品牌：子公司的飛機、航線、樞紐與時刻帶轉到你手上，以原品牌（子航空公司）飛；在它的母國保有在地旅客的忠誠度。
  // 併入主品牌：同樣轉入，但全部換成你的品牌（要重新塗裝），之後少一家子航空公司的固定管理成本。
  // 會計：子公司投資轉成飛機（自有約佔收購價的六成以內，其餘為租賃）、租機保證金與商譽。
  G.INTEG = { days: 120, costPct: 0.02, perAc: 0.3e6, repaint: 120e3, maxFleet: 150, ownedCap: 0.6, morale: 5, leaseK: 0.8 };
  const TYPE_BY = [[700, ['A20N', 'B38M', 'AT76', 'DH8D']], [2600, ['A20N', 'B38M', 'A21N']], [5500, ['A21N', 'B38M', 'A20N']], [7000, ['A21N', 'A339', 'B789']], [11500, ['B789', 'A339', 'A359']], [99999, ['A359', 'A35K', 'B789']]];
  function pickType(A, B, d, lcc) {
    let opts = TYPE_BY.find(([m]) => d <= m)[1].slice();
    if (!lcc && d <= 450) opts = ['AT76', 'DH8D', 'A20N']; // 很短的航線用螺旋槳機（區域子公司常見）
    for (const id of opts) { const t = G.TYPES[id]; if (t && !G.canFly(t, A, B)) return id; }
    return null;
  }
  // v1.1.0 整合只轉入飛機，航線不保留：依對方真實航網（各航線班次 × 飛行時間）估算機型組合
  G.mnaIntegPlan = (sub) => {
    const X = G.INTEG, w = new Map();
    sub.codes.forEach((code) => {
      const c = G.CARRIERS[code];
      if (!c) return;
      c.routes.forEach((k) => {
        const a = k.slice(0, 3), b = k.slice(3), A = G.AP[a], B = G.AP[b];
        if (!A || !B) return;
        const x = G.rivalsOn(a, b).find((y) => y.code === code);
        if (!x) return;
        const d = G.dist(A, B), type = pickType(A, B, d, c.lcc);
        if (!type) return;
        const t = G.TYPES[type], hrs = x.f * 2 * (G.blockMinutes(t, G.legKm(A, B)) + G.turnMinutes(t)) / 60;
        w.set(type, (w.get(type) || 0) + hrs);
      });
    });
    const est = Math.round(sub.codes.reduce((t, c) => t + G.carrierFleetEst(c), 0));
    const n = Math.min(est, X.maxFleet), tot = [...w.values()].reduce((t, v) => t + v, 0);
    let types = tot ? [...w.entries()].map(([type, v]) => ({ type, n: Math.floor((v / tot) * n), r: ((v / tot) * n) % 1 })) : [];
    // 四捨五入後補齊到 n 架
    let left = n - types.reduce((t, x) => t + x.n, 0);
    types.sort((p, q) => q.r - p.r).forEach((x) => { if (left > 0) { x.n++; left--; } });
    types = types.filter((x) => x.n > 0).sort((p, q) => q.n - p.n).map(({ type, n: k }) => ({ type, n: k }));
    return { types, aircraft: types.reduce((t, x) => t + x.n, 0), est, capped: est > X.maxFleet };
  };
  G.mnaIntegCost = (sub, mode, plan) => {
    plan = plan || G.mnaIntegPlan(sub);
    return sub.cost * G.INTEG.costPct + plan.aircraft * G.INTEG.perAc + (mode === 'main' ? plan.aircraft * G.INTEG.repaint : 0);
  };
  G.mnaIntegrate = (key, mode) => {
    const S = G.S, X = G.INTEG, sub = st().subs.find((x) => x.key === key);
    if (!sub) return { ok: false, msg: '找不到這家子公司' };
    if (sub.integ) return { ok: false, msg: '已經在整合中' };
    if (mode !== 'brand' && mode !== 'main') return { ok: false, msg: '請選擇整合方式' };
    const plan = G.mnaIntegPlan(sub);
    if (!plan.aircraft) return { ok: false, msg: '估算不出這家公司的機隊，只能維持獨立子公司' };
    const cost = G.mnaIntegCost(sub, mode, plan);
    if (S.cash < cost) return { ok: false, msg: `資金不足：整合費用需要 ${G.money(cost)}` };
    G._spend(cost, 'overhead');
    sub.integ = { mode, start: S.time, until: S.time + X.days * DAY, cost };
    if (S.hr && S.hr.groups) Object.values(S.hr.groups).forEach((g) => (g.morale = clamp(g.morale - X.morale, 0, 100))); // 兩邊員工都擔心工作與年資
    news(`開始整合${sub.name}（${mode === 'brand' ? '保留原品牌' : '併入主品牌'}），整合費 ${G.money(cost)}，約 ${X.days} 天完成；預計轉入 ${plan.aircraft} 架飛機${plan.capped ? `（對方約 ${plan.est} 架，一次最多轉入 ${X.maxFleet} 架，其餘退租）` : ''}，對方的航線不保留`);
    return { ok: true, plan, cost };
  };
  function integrate(sub) {
    const S = G.S, F = S.fin, X = G.INTEG, plan = G.mnaIntegPlan(sub), mode = sub.integ.mode;
    let brand = null;
    if (mode === 'brand' && G.BRAND_KINDS) {
      S.brands = S.brands || []; S.brandSeq = (S.brandSeq || 0) + 1;
      const code = [sub.key, ...sub.codes].find((c) => !G.brandCodeTaken(c)) || sub.key;
      const lccCo = !!(G.CARRIERS[sub.codes[0]] || {}).lcc; // 低成本航空保留品牌時，照樣用低成本的票價與成本
      brand = { id: 'b' + S.brandSeq, kind: lccCo ? 'lcc' : 'acq', name: sub.name, code, color: G.carrierColor(sub.key), home: (G.CARRIERS[sub.codes[0]] || {}).cc, since: S.time, from: sub.key };
      S.brands.push(brand);
    }
    F.subsBook = Math.max(0, (F.subsBook || 0) - sub.book);
    let owned = 0, deps = 0, n = 0;
    const cap = sub.book * X.ownedCap;
    for (const p of plan.types) {
      const t = G.TYPES[p.type];
      for (let i = 0; i < p.n; i++) {
        const age = 2 + Math.random() * 12, hours = Math.round(age * 3000), cycles = Math.round(hours / (t.wide ? 6 : 1.8));
        const mx = {}; G.CHECK_LEVELS.forEach((lv) => (mx[lv] = Math.round(G.CHECKS[lv].interval * Math.random() * 0.7)));
        const cond = +(0.8 + Math.random() * 0.15).toFixed(2), value = t.price * 1e6 * Math.max(0.25, 0.85 - 0.04 * age);
        const o = { hours, cycles, cond, mx, used: true };
        let res;
        if (owned + value <= cap) {
          res = G.acquire(p.type, 'buy', null, null, { ...o, price: 0 });
          if (res.ok) { res.ac.cost = value / 0.9; res.ac.book = value; owned += value; }
        } else {
          const lease = G.leaseMonthly(t) * X.leaseK, dep = lease * 2;
          G.cashIn(dep, 'investSale'); // 對方原本付的租機保證金，跟著轉過來
          res = G.acquire(p.type, 'lease', null, null, { ...o, lease });
          if (res.ok) deps += dep; else S.cash -= dep;
        }
        if (!res || !res.ok) continue;
        res.ac.newCabin = false; n++;
      }
    }
    const gw = sub.book - owned - deps;
    if (gw >= 0) F.goodwill = (F.goodwill || 0) + gw; else S.day.gain += -gw;
    const m = st();
    m.merged = m.merged || [];
    m.merged.push({ key: sub.key, name: sub.name, codes: sub.codes, at: S.time, mode, aircraft: n, routes: 0, brand: brand ? brand.id : null });
    m.subs = m.subs.filter((x) => x !== sub);
    if (sub.listed && G.mkt().stocks[sub.key]) Object.assign(G.mkt().stocks[sub.key], { sub: false, merged: true, delisted: true });
    S.stats = S.stats || {}; S.stats.integrations = (S.stats.integrations || 0) + 1;
    bump(); if (S.rivals) S.rivals.ver = (S.rivals.ver || 0) + 1;
    if (G.nonstopReset) G.nonstopReset();
    G.routeVer++; if (G.xferReset) G.xferReset();
    news(`完成整合${sub.name}：${n} 架飛機加入你的機隊，停在主要樞紐等你指派航線；對方原本的航線全部停飛${brand ? `。「${brand.name}」（${brand.code}）成為你的子航空公司，可以把航線交給它經營` : '，飛機換上你的塗裝'}${gw > 0 ? `；商譽 ${G.money(gw)}` : ''}`);
    G._emit('event', { kind: 'mna', text: `${sub.name}整合完成，${n} 架飛機加入機隊` });
    G._emit('fleet'); G._emit('routes');
  }
  // 已經併入的公司不再是對手
  const mergedSet = () => { const s = new Set(); ((G.S && G.S.mna && G.S.mna.merged) || []).forEach((m) => m.codes.forEach((c) => s.add(c))); return s; };
  G.isMerged = (code) => mergedSet().has(code);
  const ro = G.rivalsOn;
  G.rivalsOn = (a, b) => { const out = ro(a, b); if (!G.S || !G.S.mna || !(G.S.mna.merged || []).length) return out; const m = mergedSet(); return out.filter((x) => !m.has(x.code)); };
  // v1.1.0 已收購（子公司）或已整合的航空公司代碼
  G.mnaSig = () => { const m = G.S && G.S.mna; if (!m) return ''; return m.subs.map((x) => x.key).join(',') + '|' + (m.merged || []).map((x) => x.key).join(','); };
  G.acquiredCodes = () => { const s = mergedSet(); if (G.S && G.S.mna) subCodes().forEach((c) => s.add(c)); return s; };
  G.isAcquired = (code) => G.acquiredCodes().has(code);
  // 機場頁「在此營運的航空公司」不再列出已收購的公司；子公司另外列出
  const cat = G.carriersAt;
  G.carriersAt = (iata) => { const out = cat(iata); if (!G.S || !G.S.mna || !(G.S.mna.subs.length || (G.S.mna.merged || []).length)) return out; const m = G.acquiredCodes(); return out.filter(([code]) => !m.has(code)); };
  G.subsAt = (iata) => { if (!G.S || !G.S.mna || !G.S.mna.subs.length) return []; const m = subCodes(); return cat(iata).filter(([code]) => m.has(code)); };
  const co = G.carriersOn;
  G.carriersOn = (a, b) => { const out = co(a, b); if (!G.S || !G.S.mna || !(G.S.mna.merged || []).length) return out; const m = mergedSet(); return out.filter((x) => !m.has(x)); };

  // v1.1.0 舊存檔：已收購或已整合的上市集團改為下市
  const fx0 = G.fixV10;
  G.fixV10 = (S) => {
    if (fx0) fx0(S);
    const M = S.mkt, m = S.mna;
    if (!M || !m) return;
    [...(m.subs || []), ...(m.merged || [])].forEach((x) => { const sk = M.stocks && M.stocks[x.key]; if (sk) sk.delisted = true; });
  };
  // 存檔修復
  G.initMna = (S) => { S.mna = S.mna || blank(); if (S.fin) S.fin.subsBook = S.fin.subsBook || 0; };
  const iv = G.initV10;
  G.initV10 = (S, m) => { if (iv) iv(S, m); G.initMna(S); };

  // 連線：讓別人看到你的子公司
  G.netExtras = G.netExtras || [];
  G.netExtras.push(() => ({ subs: G.S && G.S.mna ? st().subs.map((x) => x.key) : [] }));
})();
