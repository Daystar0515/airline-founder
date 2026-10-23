// v1.2.0 AI 航空公司對玩家的併購：
// 1. 友善收購提案：任何時候都可能收到，可以接受（賣掉公司，遊戲結束）或拒絕。
// 2. 惡意併購：只有股票上市、你個人持股不到一半時才會發生。同國的上市航空集團先在市場上悄悄買進，
//    持股超過 5% 必須申報，之後可能發動公開收購；收購方加上應賣的股份超過一半，你就失去經營權（遊戲結束）。
//    外國航空集團受外資持股上限限制，無法取得控制權，所以不會發動惡意併購。
// 防禦：個人增持、公司買回庫藏股、請盟友當白騎士、毒丸條款、股東溝通。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  G.HTO = {
    raidBase: 0.012, offerBase: 0.004, // 每家候選、每月的基本機率
    diff: { easy: 0, normal: 1, hard: 1.6, brutal: 2.4 }, // 難度倍率（輕鬆難度不會被惡意併購）
    fire: 2.2, // 收購方可動用的資金＝自己市值 × 2.2（含舉債）
    stealth: 0.049, disclose: 0.05, creepMin: 0.015, creepMax: 0.035, tenderAt: 0.1,
    tenderDays: 45, premium: [1.25, 1.45], control: 0.5,
    cool: 730, coolOffer: 365, minListedDays: 180,
    pill: { fee: 3e6, price: 0.92, days: 365, cool: 1095, block: 0.85 },
    ir: { cost: 2e6, cut: 0.08, max: 2 },
    knight: { fee: 0.01, min: 0.08, max: 0.15 },
  };
  const blank = () => ({ raid: null, offer: null, cool: 0, coolOffer: 0, pillUntil: 0, pillCool: 0, log: [] });
  const st0 = () => { const S = G.S; if (!S.hto) S.hto = blank(); return S.hto; };
  G.htoState = st0;
  const diffMul = () => G.HTO.diff[(G.S && G.S.diff) || 'normal'] ?? 1;
  const stock = () => G.S.fin.stock;
  const cap = () => { const st = stock(); return st.listed ? st.price * st.shares : G.fairValue(); };
  const home = () => G.homeCC();
  const note = (text, kind, modal) => {
    const H = st0();
    H.log.unshift({ t: G.S.time, text });
    H.log = H.log.slice(0, 30);
    G.log(text, kind);
    G._emit('event', { kind: 'hto', text, warn: kind === 'warn', modal: !!modal });
  };
  const listedQuote = (k) => G.quote && G.quote(k);
  // 可能出手的航空集團：上市、沒被你收購、不是你的盟友
  function candidates(domesticOnly) {
    const S = G.S;
    return Object.keys(G.LISTED).filter((k) => {
      const L = G.LISTED[k], q = listedQuote(k);
      if (!q || k === S.company.code) return false;
      if (G.isAcquired && L.codes.some((c) => G.isAcquired(c))) return false;
      if (G.isPartner && L.codes.some((c) => G.isPartner(c))) return false;
      return !domesticOnly || L.cc === home();
    }).map((k) => { const q = listedQuote(k); return { key: k, name: G.LISTED[k].zh, cc: G.LISTED[k].cc, cap: q.p * q.shares }; });
  }
  const holders = () => (stock().holders = stock().holders || []);
  const raiderHolder = () => { const R = st0().raid; return R && holders().find((h) => h.why === 'raid' && h.code === R.key); };
  const friendlyN = () => (G.friendlyStake ? G.friendlyStake() : 0);
  // 股權結構：你、友好股東、收購方、其他（可能應賣）
  G.htoCap = () => {
    const S = G.S, st = stock();
    const me = (S.founder.equity / 100) * st.shares, fr = friendlyN(), rh = raiderHolder(), raid = rh ? rh.n : 0;
    const other = Math.max(0, st.shares - me - fr - raid);
    return { shares: st.shares, me, friendly: fr, raid, other, pMe: me / st.shares, pFr: fr / st.shares, pRaid: raid / st.shares, pOther: other / st.shares };
  };
  // 被惡意併購的風險（0–1），給介面顯示
  G.htoRisk = () => {
    const S = G.S, st = stock();
    if (!st.listed || S.founder.equity >= 50 || !diffMul()) return 0;
    const fair = G.fairValue() / st.shares;
    let v = clamp((fair / st.price - 1) * 2, 0, 1);
    v += S.founder.equity < 30 ? 0.6 : S.founder.equity < 40 ? 0.3 : 0.1;
    const ni = (S.fin.statements || []).slice(-6).reduce((s, x) => s + x.ni, 0);
    if (ni < 0) v += 0.4;
    if (S.rep < 50) v += 0.2;
    const cap0 = cap(), need = G.HTO.control * cap0 * G.HTO.premium[0];
    const able = candidates(true).filter((c) => c.cap * G.HTO.fire >= need);
    return able.length ? clamp(v / 2.2, 0, 1) : 0;
  };

  // ---------- 每月 ----------
  function monthly() {
    const S = G.S, H = st0(), st = stock();
    if (H.raid) return raidMonthly();
    if (H.offer) return;
    const mul = diffMul();
    // 惡意併購
    if (mul && st.listed && S.founder.equity < 50 && S.time > H.cool && S.time - (st.listedAt || S.start) > G.HTO.minListedDays * DAY) {
      const risk = G.htoRisk();
      if (risk > 0) {
        const need = G.HTO.control * cap() * G.HTO.premium[0];
        const pool = candidates(true).filter((c) => c.cap * G.HTO.fire >= need);
        for (const c of pool) {
          if (Math.random() < Math.min(0.05, G.HTO.raidBase * mul * risk * 2.2)) { startRaid(c); return; }
        }
      }
    }
    // 友善收購提案（國內外都可能；外國收購方要通過外資審查）
    if (S.time > H.coolOffer && (S.fin.statements || []).length >= 12) {
      const v = cap(), ni = S.fin.statements.slice(-12).reduce((s, x) => s + x.ni, 0);
      if (ni > 0) {
        const pool = candidates(false).filter((c) => c.cap * G.HTO.fire >= v * 1.4);
        const p = G.HTO.offerBase * Math.max(0.5, mul) * (S.rep >= 60 ? 1.3 : 1);
        if (pool.length && Math.random() < p) {
          const c = pool[Math.floor(Math.random() * pool.length)];
          const base = st.listed ? Math.max(st.price * st.shares, G.fairValue()) : G.fairValue();
          const prem = rnd(1.3, 1.55);
          H.offer = { key: c.key, name: c.name, cc: c.cc, value: base * prem, prem, at: S.time, until: S.time + 30 * DAY, foreign: c.cc !== home() };
          note(`${c.name}向你提出收購提案：以 ${G.money(base * prem)}（溢價 ${Math.round((prem - 1) * 100)}%）買下整間公司。30 天內決定是否接受`, 'warn', true);
        }
      }
    }
  }
  // 劇本與測試用：指定收購方開始買進
  G.htoStartRaid = (key) => { const c = candidates(true).concat(candidates(false)).find((x) => x.key === key); if (!c || st0().raid) return false; startRaid(c); return true; };
  function startRaid(c) {
    const S = G.S;
    st0().raid = { key: c.key, name: c.name, since: S.time, stage: 'creep', disclosed: false, discAt: 0, tender: null, ir: 0, knight: false };
    creep(true);
  }
  function creep(first) {
    const S = G.S, R = st0().raid, st = stock(), X = G.HTO;
    let h = raiderHolder();
    if (!h) { h = { code: R.key, kind: 'ai', name: R.name, n: 0, avg: st.price, since: S.time, why: 'raid' }; holders().push(h); }
    const cp = G.htoCap();
    const want = st.shares * (first ? rnd(0.025, X.stealth) : rnd(X.creepMin, X.creepMax));
    const n = Math.max(0, Math.min(want, cp.other * 0.35));
    if (n <= 0) return;
    h.avg = (h.avg * h.n + st.price * n) / (h.n + n);
    h.n += n;
    st.price *= 1 + G.MKT.impact * (n / st.shares) * 1.5;
    const pct = h.n / st.shares;
    if (!R.disclosed && pct >= X.disclose) {
      R.disclosed = true; R.discAt = S.time;
      if (G.marketNews) G.marketNews(`${R.name}申報持有${S.company.name} ${(pct * 100).toFixed(1)}% 股權`, '@self', 1);
      note(`${R.name}申報持有你公司 ${(pct * 100).toFixed(1)}% 股權，表示「看好長期價值」。市場研判可能是惡意併購的前奏`, 'warn', true);
    } else if (R.disclosed) note(`${R.name}持續買進，持股增加到 ${(pct * 100).toFixed(1)}%`, 'warn');
  }
  function raidMonthly() {
    const S = G.S, R = st0().raid, X = G.HTO;
    if (R.stage !== 'creep') return;
    const h = raiderHolder(), pct = h ? h.n / stock().shares : 0;
    if (S.founder.equity >= 50) return giveUp('你的持股已經過半，取得控制權已不可能');
    if (pct >= X.tenderAt && R.disclosed && (S.time - R.discAt > 25 * DAY) && Math.random() < 0.5) return launchTender();
    if (pct < 0.3) creep(false);
    else launchTender();
  }
  function launchTender() {
    const S = G.S, R = st0().raid, st = stock(), X = G.HTO;
    const fair = G.fairValue() / st.shares;
    const px = Math.max(st.price, fair) * rnd(X.premium[0], X.premium[1]);
    const cp = G.htoCap();
    const need = Math.max(0, X.control * st.shares - cp.raid);
    if (S.time < st0().pillUntil && Math.random() < X.pill.block) return giveUp('毒丸條款讓收購成本暴增');
    R.stage = 'tender';
    R.tender = { price: px, until: S.time + X.tenderDays * DAY, need, at: S.time, base: st.price };
    st.price = Math.max(st.price, px * 0.95);
    if (G.marketNews) G.marketNews(`${R.name}宣布公開收購${S.company.name}股票，每股 $${px.toFixed(2)}`, '@self', 1);
    note(`${R.name}宣布公開收購：每股 $${px.toFixed(2)}，目標取得過半股權，${X.tenderDays} 天後截止。收購成功你就會失去經營權`, 'warn', true);
  }
  function giveUp(why) {
    const S = G.S, H = st0(), R = H.raid;
    note(`${R.name}放棄收購你公司${why ? `（${why}）` : ''}，你保住了經營權`, null, true);
    const h = raiderHolder();
    if (h) h.why = 'financial'; // 留下的持股之後會慢慢賣掉
    H.raid = null; H.cool = S.time + G.HTO.cool * DAY;
    if (S.stats) S.stats.htoWon = (S.stats.htoWon || 0) + 1;
  }
  // 公開收購截止：其他股東應賣的比例
  G.htoTakeUp = () => {
    const S = G.S, R = st0().raid, st = stock();
    if (!R || !R.tender) return 0;
    // 股東拿收購價和「宣布前的股價」與公司合理價值比較
    const fair = G.fairValue() / st.shares, prem = R.tender.price / Math.max(R.tender.base || st.price, 0.85 * fair);
    const appr = st.lastApproval != null ? st.lastApproval : 50;
    // 溢價越高越多人應賣（逐漸飽和）；股東溝通、股東對經營團隊的支持度會降低應賣意願
    const q = 0.9 * (1 - Math.exp(-3.2 * Math.max(0, prem - 0.92)));
    return clamp(q * (1 - 1.5 * G.HTO.ir.cut * (R.ir || 0)) * (1 + (50 - appr) / 150), 0.03, 0.92);
  };
  G.htoForecast = () => {
    const R = st0().raid;
    if (!R || !R.tender) return null;
    const cp = G.htoCap(), q = G.htoTakeUp();
    const after = cp.raid + q * cp.other;
    return { q, after, pAfter: after / cp.shares, win: after > G.HTO.control * cp.shares };
  };
  function tenderEnd() {
    const S = G.S, H = st0(), R = H.raid, st = stock();
    if (S.time < H.pillUntil && Math.random() < G.HTO.pill.block) return giveUp('毒丸條款啟動，收購方的持股被稀釋');
    if (S.founder.equity >= 50) return giveUp('你的持股已經過半');
    const f = G.htoForecast(), noise = rnd(-0.03, 0.03);
    const pAfter = f.pAfter + noise;
    if (pAfter > G.HTO.control) {
      // 收購成功：你的持股也以收購價賣給對方
      const m = G.initMe ? G.initMe(S) : null, mine = G.myShares ? G.myShares() : 0;
      const proceeds = mine * R.tender.price;
      if (m) { m.cash += proceeds * (1 - (G.PTAX ? G.PTAX.gain : 0)); }
      H.result = { kind: 'hostile', name: R.name, price: R.tender.price, pct: pAfter, proceeds, t: S.time };
      note(`${R.name}公開收購成功，取得 ${(pAfter * 100).toFixed(1)}% 股權。新的經營團隊接手，你被解除職務`, 'warn');
      if (G.addTimeline) G.addTimeline('takeover', `被${R.name}惡意併購`);
      G._emit('event', { kind: 'dismissed', reason: 'takeover' });
      return;
    }
    const h = raiderHolder();
    if (h) { h.n += Math.max(0, f.q * G.htoCap().other) * 0.6; }
    st.price *= 0.9;
    giveUp(`公開收購只取得 ${(pAfter * 100).toFixed(1)}% 股權，未過半`);
  }

  // ---------- 每日 ----------
  const sd0 = G.stockDaily;
  G.stockDaily = () => {
    if (sd0) sd0();
    const S = G.S, H = st0();
    if (!S.fin) return;
    const d = new Date(S.time - DAY / 2);
    if (d.getUTCDate() === 2) monthly();
    if (H.raid && H.raid.stage === 'tender' && S.time >= H.raid.tender.until) tenderEnd();
    if (H.offer && S.time >= H.offer.until) { note(`${H.offer.name}的收購提案已過期`); H.offer = null; H.coolOffer = S.time + G.HTO.coolOffer * DAY; }
    // 收購方或盟友持股：上市才有意義
    if (H.raid && !stock().listed) H.raid = null;
  };

  // ---------- 玩家的回應 ----------
  G.htoAcceptOffer = () => {
    const S = G.S, H = st0(), O = H.offer;
    if (!O) return { ok: false, msg: '沒有待決定的收購提案' };
    if (O.foreign && Math.random() > 0.45) {
      H.offer = null; H.coolOffer = S.time + G.HTO.coolOffer * DAY;
      note(`主管機關以外資持股上限為由，否決${O.name}的收購案。公司維持獨立經營`, 'warn', true);
      return { ok: true, blocked: true };
    }
    const m = G.initMe ? G.initMe(S) : null, mine = (S.founder.equity / 100) * O.value;
    if (m) m.cash += mine * (1 - (G.PTAX ? G.PTAX.gain : 0));
    H.result = { kind: 'friendly', name: O.name, value: O.value, proceeds: mine, t: S.time };
    H.offer = null;
    note(`你接受${O.name}的收購提案，以 ${G.money(O.value)} 出售公司；你依持股 ${S.founder.equity}% 分得 ${G.money(mine)}`, null);
    if (G.addTimeline) G.addTimeline('takeover', `公司由${O.name}收購`);
    G._emit('event', { kind: 'dismissed', reason: 'sold' });
    return { ok: true };
  };
  G.htoDeclineOffer = () => {
    const S = G.S, H = st0(), O = H.offer;
    if (!O) return { ok: false };
    H.offer = null; H.coolOffer = S.time + G.HTO.coolOffer * DAY;
    note(`你拒絕了${O.name}的收購提案`);
    // 被拒絕的國內上市集團，有機會轉為惡意併購
    const st = stock();
    if (st.listed && S.founder.equity < 50 && O.cc === home() && diffMul() && Math.random() < 0.25 * diffMul() && !H.raid) {
      const c = candidates(true).find((x) => x.key === O.key);
      if (c) { startRaid(c); note(`${O.name}被拒絕後，開始在市場上買進你公司的股票`, 'warn'); }
    }
    return { ok: true };
  };
  // 毒丸：收購方持股超過門檻時，其他股東可用折價認購新股，收購成本暴增；股價下跌、股東不滿
  G.htoPill = () => {
    const S = G.S, H = st0(), X = G.HTO.pill, st = stock();
    if (!st.listed) return { ok: false, msg: '上市公司才需要毒丸條款' };
    if (S.time < H.pillUntil) return { ok: false, msg: '毒丸條款已經生效中' };
    if (S.time < H.pillCool) return { ok: false, msg: `剛用過毒丸條款，${Math.ceil((H.pillCool - S.time) / DAY)} 天後才能再用` };
    if (S.cash < X.fee) return { ok: false, msg: `需要律師與財務顧問費 ${G.money(X.fee)}` };
    G._spend(X.fee, 'overhead');
    H.pillUntil = S.time + X.days * DAY; H.pillCool = S.time + X.cool * DAY;
    st.price *= X.price; st.pillPenalty = 15;
    if (G.repDelta) G.repDelta(-2, '通過毒丸條款，被批評保護經營者');
    note(`董事會通過股東權益計畫（毒丸條款），一年內有效。股價下跌 ${Math.round((1 - X.price) * 100)}%，下次股東會的支持度會受影響`, 'warn');
    return { ok: true };
  };
  // 股東溝通：投資人說明會、提出經營計畫，降低股東應賣的意願
  G.htoIR = () => {
    const S = G.S, R = st0().raid, X = G.HTO.ir;
    if (!R) return { ok: false, msg: '目前沒有人要收購你的公司' };
    if ((R.ir || 0) >= X.max) return { ok: false, msg: '已經做過兩次股東溝通了' };
    if (S.cash < X.cost) return { ok: false, msg: `需要 ${G.money(X.cost)}` };
    G._spend(X.cost, 'marketing');
    R.ir = (R.ir || 0) + 1;
    note(`舉辦投資人說明會，向股東說明未來的經營計畫（股東應賣的意願降低約 ${Math.round(X.cut * 150)}%）`);
    return { ok: true };
  };
  // 白騎士：請盟友買進股票、支持經營團隊
  G.htoKnight = () => {
    const S = G.S, R = st0().raid, X = G.HTO.knight, st = stock();
    if (!R) return { ok: false, msg: '目前沒有人要收購你的公司' };
    if (R.knight) return { ok: false, msg: '這次已經找過白騎士了' };
    const P = G.allyPartners ? G.allyPartners() : null;
    const pool = P ? [...P.ai].map((c) => ({ c, k: G.STOCK_OF && G.STOCK_OF[c] })).filter((x) => x.k && listedQuote(x.k)) : [];
    if (!pool.length) return { ok: false, msg: '需要有上市的盟友（加入航空聯盟）才能請白騎士' };
    const fee = X.fee * st.price * st.shares;
    if (S.cash < fee) return { ok: false, msg: `需要財務顧問費 ${G.money(fee)}` };
    G._spend(fee, 'overhead');
    R.knight = true;
    const p = clamp(0.35 + (S.rep - 60) / 80 + (P.strength || 0) * 0.3, 0.1, 0.9);
    if (Math.random() > p) { note('盟友評估後婉拒擔任白騎士', 'warn'); return { ok: true, fail: true }; }
    const x = pool[Math.floor(Math.random() * pool.length)];
    const cp = G.htoCap(), n = Math.min(cp.other * 0.6, st.shares * rnd(X.min, X.max));
    holders().push({ code: x.k, kind: 'ai', name: G.LISTED[x.k].zh, n, avg: st.price, since: S.time, why: 'knight' });
    st.price *= 1 + G.MKT.impact * (n / st.shares);
    note(`盟友${G.LISTED[x.k].zh}擔任白騎士，買進你公司 ${(n / st.shares * 100).toFixed(1)}% 股權並支持經營團隊`);
    return { ok: true };
  };

  // 股東會：毒丸的不滿
  const fx0 = G.fixV10;
  G.fixV10 = (S) => { if (fx0) fx0(S); if (!S.hto) S.hto = blank(); };
  G.netExtras = G.netExtras || [];
})();
