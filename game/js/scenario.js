// v1.2.0 劇本模式：虛構的航空公司、固定的開局與難度、限期達成的目標。
// 每個劇本的成績只算一次：第一次結束（成功、失敗或時間到）就記錄下來，之後再玩是「練習」，不改成績。
// 劇本可以照常存檔；遊戲中不能更改難度。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const KEY = 'af-scen-v1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 成績紀錄（存在瀏覽器，和存檔分開）----------
  G.scenRecords = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const saveRecord = (id, rec) => { try { const all = G.scenRecords(); if (!all[id]) { all[id] = rec; localStorage.setItem(KEY, JSON.stringify(all)); } } catch (e) { /* 存不了就算了 */ } };

  // ---------- 小工具 ----------
  const ni12 = (S) => (S.fin.statements || []).slice(-12).reduce((s, x) => s + x.ni, 0);
  const niSince = (S, t) => (S.fin.statements || []).filter((x) => Date.UTC(x.y, x.m - 1, 15) >= t).reduce((s, x) => s + x.ni, 0);
  const contCount = (S) => {
    const by = {};
    const seen = new Set();
    S.routes.forEach((r) => [r.a, r.b].forEach((x) => { if (seen.has(x)) return; seen.add(x); const c = G.continentOf(G.AP[x]); if (c && c !== '南極洲') by[c] = (by[c] || 0) + 1; }));
    return by;
  };
  const lease = (type, n) => { const out = []; for (let i = 0; i < n; i++) { const r = G.acquire(type, 'lease'); if (r.ok) out.push(r.ac); } return out; };
  const buy = (type, n) => { const out = []; for (let i = 0; i < n; i++) { const r = G.acquire(type, 'buy'); if (r.ok) out.push(r.ac); } return out; };
  // 讓開局的飛機自動找航線（用 v1.2.0 的自動指派）
  const autoNet = () => { for (let k = 0; k < 3 && G.idleAircraft().length; k++) { const P = G.autoAssignPlan(null, { newRoutes: true, minGain: 0, extra: 20 }); if (!P.plan.length && !P.fresh.length) break; G.applyAssignPlan(P); } };
  const event = (S, o) => {
    const w = G.initWorld(S);
    const e = { id: w.seq++, type: o.type, name: o.name, icon: o.icon || 'virus', title: o.title, text: o.text, sc: o.sc || { k: 'global' }, fx: o.fx, sev: o.sev || 'bad', flat: false, where: null, announced: S.time, start: S.time + (o.lead || 0) * DAY, end: S.time + ((o.lead || 0) + o.days) * DAY, scen: true };
    w.events.push(e);
    return e;
  };

  // ---------- 劇本 ----------
  // goals[0] 是主要目標，沒達成就是失敗；另外兩個是加分目標（各一顆星）。
  // latch：曾經達成就算；否則看結算當下的狀態。
  G.SCENARIOS = [
    {
      id: 'south', name: '南方起飛', diff: 'normal', years: 6,
      company: { name: '打狗航空', code: 'ZQ', color: '#e8a23a' }, hub: 'KHH', cash: 100e6,
      blurb: '高雄的旅客想出國，大多得先北上桃園。你在小港機場成立打狗航空，手上只有股東出資買下的 4 架 A320neo。政府的觀光補助只有四年，趁這段時間站穩腳步：高雄的市場不大，盲目擴張會把錢賠光。',
      start: ['主要樞紐：高雄小港（KHH）', '機隊：4 架自有 A320neo', '起始資金 1 億美元', '前四年：政府推動南部觀光，往返高雄的需求大幅增加', '難度：標準'],
      setup: (S) => {
        const cost = G.TYPES.A20N.price * 1e6 * 4; // 股東出資買下 4 架 A320neo
        S.fin.capital += cost; G.cashIn(cost, 'equity'); buy('A20N', 4); autoNet();
        event(S, { type: 'boom', name: '旅遊熱潮', icon: 'sun', days: 1460, sc: { k: 'aps', list: ['KHH'] }, fx: { L: 1.8, B: 1.4 }, sev: 'good', title: '南台灣觀光推廣', text: '政府推動南部國際觀光，四年內補助高雄進出的國際航線與旅遊行銷，往返高雄的需求明顯增加。' });
      },
      goals: [
        { text: '6 年內累積稅後淨利達到 2.5 億美元', latch: true, check: (S) => ({ cur: niSince(S, S.scen.start), target: 250e6, money: true }) },
        { text: '機隊達到 10 架', latch: true, check: (S) => ({ cur: S.fleet.length, target: 10 }) },
        { text: '高雄的航班占比達到 30%', latch: true, check: (S) => ({ cur: Math.round(G.hubStats('KHH').share * 100), target: 30, unit: '%' }) },
      ],
    },
    {
      id: 'recover', name: '疫後重生', diff: 'hard', years: 3,
      company: { name: '北辰航空', code: 'WX', color: '#3fa7d6' }, hub: 'TPE', cash: 170e6,
      blurb: '疫情讓全球航空需求只剩四到五成。北辰航空有 24 架飛機、6 億美元的銀行貸款，現金只夠撐幾個月。需求會在一年半內慢慢回來——前提是你撐得到那天。',
      start: ['主要樞紐：台北桃園（TPE）', '機隊：12 架自有 A321neo、4 架自有 787-9、8 架租賃 A320neo', '銀行信用貸款 6 億美元', '起始資金 1.7 億美元', '全球需求：前八個月約五成，一年半內逐步恢復', '難度：困難'],
      setup: (S) => {
        // 機隊由股東出資與 6 億美元銀行貸款取得
        const cost = ['A21N', 'B789'].reduce((s, t, i) => s + G.TYPES[t].price * 1e6 * [12, 4][i], 0);
        S.fin.capital += cost - 600e6; G.cashIn(cost - 600e6, 'equity');
        S.fin.loans.push({ id: S.fin.loanSeq++, type: 'unsecured', principal: 600e6, balance: 600e6, rate: 0.065, months: 84, left: 84, payment: 600e6 * (0.065 / 12) / (1 - Math.pow(1 + 0.065 / 12, -84)), collateral: null, missed: 0, start: S.time });
        G.cashIn(600e6, 'loan');
        buy('A21N', 12); buy('B789', 4); lease('A20N', 8);
        autoNet();
        const steps = [[0, 240, 0.45, 0.55], [240, 180, 0.62, 0.72], [420, 180, 0.8, 0.86]];
        steps.forEach(([lead, days, L, B], i) => event(S, { type: 'outbreak', name: '傳染病疫情', lead, days, fx: { L, B }, title: i === 0 ? '全球疫情：航空需求崩跌' : i === 1 ? '疫情趨緩：邊境逐步開放' : '需求回溫：只差最後一哩', text: i === 0 ? '各國收緊邊境，觀光客幾乎消失，商務客也大減。' : i === 1 ? '疫苗普及、邊境逐步開放，旅客慢慢回來。' : '旅遊需求接近恢復，但商務差旅還沒完全回來。' }));
      },
      goals: [
        { text: '3 年內不破產，結算時最近 12 個月稅後淨利為正', check: (S) => ({ cur: ni12(S), target: 1, money: true }) },
        { text: '結算時還清所有銀行貸款', check: (S) => ({ cur: -S.fin.loans.reduce((s, l) => s + l.balance, 0), target: 0, money: true, zero: true }) },
        { text: '結算時社會評價 70 以上', check: (S) => ({ cur: Math.round(S.rep), target: 70 }) },
      ],
    },
    {
      id: 'mna', name: '併購王', diff: 'normal', years: 5,
      company: { name: '鼎峰航空', code: 'QX', color: '#b07cd8' }, hub: 'ICN', cash: 3e9,
      blurb: '鼎峰集團給你 30 億美元與一間有 30 架飛機的航空公司，只有一個要求：五年內，透過併購把它變成區域霸主。',
      start: ['主要樞紐：首爾仁川（ICN）', '機隊：30 架租賃飛機（A321neo、A330-900、787-9）', '起始資金 30 億美元', '難度：標準'],
      setup: (S) => { lease('A21N', 18); lease('A339', 6); lease('B789', 6); autoNet(); },
      goals: [
        { text: '5 年內完成 3 次收購', latch: true, check: (S) => ({ cur: acqCount(S), target: 3 }) },
        { text: '整合其中 2 家（飛機併入你的機隊）', latch: true, check: (S) => ({ cur: ((S.mna && S.mna.merged) || []).length, target: 2 }) },
        { text: '機隊達到 150 架', latch: true, check: (S) => ({ cur: S.fleet.length, target: 150 }) },
      ],
    },
    {
      id: 'fuel', name: '油價風暴', diff: 'hard', years: 2,
      company: { name: '南洋航空', code: 'YZ', color: '#5cb85c' }, hub: 'SIN', cash: 300e6,
      blurb: '你剛接手一家有 30 架飛機的新加坡航空公司，國際油價就翻倍了，而且一年後才會慢慢回落。撐過這兩年。',
      start: ['主要樞紐：新加坡樟宜（SIN）', '機隊：30 架租賃飛機', '起始資金 3 億美元', '航空燃油：第一年約 2.2 倍、第二年約 1.6 倍；全球經濟衰退兩年', '難度：困難'],
      setup: (S) => {
        lease('A20N', 14); lease('A21N', 8); lease('A339', 4); lease('B789', 4); autoNet();
        event(S, { type: 'oil-up', name: '油價飆升', icon: 'oil', days: 400, fx: { fuel: 2.2, fare: 1.08 }, title: '國際油價翻倍', text: '產油國大幅減產，航空燃油價格漲到平常的兩倍以上。' });
        event(S, { type: 'oil-up', name: '油價飆升', icon: 'oil', lead: 365, days: 365, fx: { fuel: 1.6, fare: 1.04 }, title: '油價高檔回落', text: '油價從高點回落，但仍比平常貴六成。' });
        event(S, { type: 'recession', name: '經濟衰退', icon: 'chart', days: 730, fx: { L: 0.88, B: 0.78 }, title: '油價衝擊引發全球經濟衰退', text: '能源價格飆漲拖累全球景氣，企業縮減差旅、旅客也更精打細算。' });
      },
      goals: [
        { text: '撐過 2 年不破產、不被撤換', check: (S) => ({ cur: S.over ? 0 : 1, target: 1, bool: true }) },
        { text: '2 年合計稅後淨利為正', check: (S) => ({ cur: niSince(S, S.scen.start), target: 1, money: true }) },
        { text: '結算時現金不少於開局的 3 億美元', check: (S) => ({ cur: S.cash, target: 300e6, money: true }) },
      ],
    },
    {
      id: 'global', name: '環球航網', diff: 'normal', years: 8,
      company: { name: '天際航空', code: 'ZW', color: '#d9534f' }, hub: 'DXB', cash: 800e6,
      blurb: '杜拜位在世界的正中間，八小時航程內住著全球三分之二的人口。從 10 架飛機開始，把航網鋪到六大洲。',
      start: ['主要樞紐：杜拜（DXB）', '機隊：6 架租賃 787-9、4 架租賃 A321neo', '起始資金 8 億美元', '難度：標準'],
      setup: (S) => { lease('B789', 6); lease('A21N', 4); autoNet(); },
      goals: [
        { text: '8 年內飛到六大洲，每洲至少 2 個航點', latch: true, check: (S) => { const c = contCount(S); const ok = ['亞洲', '歐洲', '非洲', '北美洲', '南美洲', '大洋洲'].filter((k) => (c[k] || 0) >= 2).length; return { cur: ok, target: 6, unit: ' 洲' }; } },
        { text: '加入三大航空聯盟之一', latch: true, check: (S) => ({ cur: S.ally && S.ally.kind === 'real' && S.ally.status === 'member' ? 1 : 0, target: 1, bool: true }) },
        { text: '4,500 公里以上的長程航線達到 20 條', latch: true, check: (S) => ({ cur: S.routes.filter((r) => G.dist(G.AP[r.a], G.AP[r.b]) >= 4500).length, target: 20 }) },
      ],
    },
    {
      id: 'defend', name: '經營權保衛戰', diff: 'hard', years: 3,
      company: { name: '福爾摩沙航空', code: 'FO', color: '#4fd1c5' }, hub: 'TPE', cash: 150e6,
      blurb: '福爾摩沙航空剛上市，你只剩 26% 股權。市場傳出國內一家大型航空集團正在悄悄買進你的股票……三年內守住經營權。',
      start: ['主要樞紐：台北桃園（TPE）', '機隊：20 架租賃飛機', '已上市，你個人持股 26%', '國內大型航空集團正在買進你的股票', '難度：困難'],
      setup: (S) => {
        lease('A20N', 10); lease('A21N', 6); lease('A339', 4); autoNet();
        const st = S.fin.stock, pre = Math.max(G.fairValue(), 600e6), price = pre / st.shares;
        const f = 0.74, newShares = (st.shares * f) / (1 - f);
        st.shares += newShares; st.listed = true; st.pending = null; st.price = price; st.ipoPrice = price; st.listedAt = S.time - 200 * DAY; st.yearStartPrice = price; st.hist = [{ t: S.time, p: price }];
        S.founder.equity = 26;
        S.scen.price0 = price;
      },
      daily: (S) => {
        if (S.scen.raid || !S.fin.stock.listed || S.time - S.scen.start < 20 * DAY) return;
        S.scen.raid = true;
        const pool = Object.keys(G.LISTED).filter((k) => G.LISTED[k].cc === G.homeCC() && G.quote(k)).sort((a, b) => G.quote(b).p * G.quote(b).shares - G.quote(a).p * G.quote(a).shares);
        for (const k of pool) if (G.htoStartRaid(k)) break;
      },
      goals: [
        { text: '3 年內保住經營權（不被惡意併購、不被撤換、不破產）', check: (S) => ({ cur: S.over ? 0 : 1, target: 1, bool: true }) },
        { text: '結算時個人持股 40% 以上', check: (S) => ({ cur: S.founder.equity, target: 40, unit: '%' }) },
        { text: '結算時友好股東（盟友、白騎士）持股 15% 以上', check: (S) => ({ cur: Math.round((G.friendlyStake ? G.friendlyStake() : 0) / S.fin.stock.shares * 1000) / 10, target: 15, unit: '%' }) },
      ],
    },
  ];
  const BY = {}; G.SCENARIOS.forEach((s) => (BY[s.id] = s));
  G.scenById = (id) => BY[id];
  function acqCount(S) {
    const sc = S.scen || {}, set = new Set(sc.acq || []);
    ((S.mna && S.mna.subs) || []).forEach((x) => set.add(x.key));
    ((S.mna && S.mna.merged) || []).forEach((x) => set.add(x.key));
    sc.acq = [...set];
    return set.size;
  }

  // ---------- 開始 ----------
  G.startScenario = (id, slot) => {
    const sc = BY[id];
    if (!sc) return { ok: false, msg: '找不到這個劇本' };
    const C = sc.company;
    let logo = null;
    try { logo = G.genLogo ? G.genLogo({ name: C.name, code: C.code, color: C.color, seed: 0 }).url : null; } catch (e) { logo = null; }
    if (G.useSlotForNew) G.useSlotForNew(slot || null);
    G.newGame({ name: C.name, code: C.code, color: C.color, logo, logoAuto: logo ? { seed: 0 } : null, hub: sc.hub, founder: 'classic', diff: sc.diff });
    const S = G.S;
    S.cash = sc.cash;
    S.fin.capital = sc.cash + (S.fin.facBook || 0); // 起始資金都是股東出資
    S.fin.monthCashStart = sc.cash + (S.fin.facBook || 0);
    const rec = G.scenRecords()[id];
    S.scen = { id, start: S.time, end: S.time + sc.years * YEAR, done: false, practice: !!rec, got: [false, false, false], at: [null, null, null] };
    sc.setup(S);
    G.log(`劇本「${sc.name}」開始：${sc.goals[0].text}`);
    G._emit('all');
    return { ok: true };
  };

  // ---------- 每日檢查 ----------
  G.scenProgress = (S) => {
    S = S || G.S;
    const sc = S && S.scen && BY[S.scen.id];
    if (!sc) return null;
    return sc.goals.map((g, i) => {
      let c = null;
      try { c = g.check(S); } catch (e) { c = { cur: 0, target: 1 }; }
      const ok = c.cur >= c.target;
      return { ...g, ...c, ok: g.latch ? S.scen.got[i] || ok : ok, latched: !!S.scen.got[i], i };
    });
  };
  const d0 = G.ops10Daily;
  G.ops10Daily = () => {
    if (d0) d0();
    const S = G.S, X = S.scen;
    if (!X || X.done) return;
    const sc = BY[X.id];
    if (!sc) return;
    if (sc.daily) sc.daily(S);
    const P = G.scenProgress(S);
    P.forEach((p, i) => { if (sc.goals[i].latch && p.ok && !X.got[i]) { X.got[i] = true; X.at[i] = S.time; G.log(`劇本目標達成：${p.text}`); G._emit('event', { kind: 'scen-goal', text: `目標達成：${p.text}` }); } });
    // 加分目標都是「曾經達成」型而且全部完成，或時間到，就結算
    const allLatched = sc.goals.every((g, i) => g.latch && X.got[i]);
    if (allLatched || S.time >= X.end) G.scenFinish('time');
  };
  // 失敗：破產、被撤換、被併購
  G.on((w, d) => {
    if (w !== 'event' || !d || !G.S || !G.S.scen || G.S.scen.done) return;
    if (d.kind === 'bankrupt' || d.kind === 'dismissed') { G.S.over = G.S.over || d.reason || d.kind; G.scenFinish('fail'); }
  });
  G.scenFinish = (why) => {
    const S = G.S, X = S.scen, sc = BY[X.id];
    if (X.done) return;
    const P = G.scenProgress(S);
    const fail = why === 'fail' || !P[0].ok;
    const stars = fail ? 0 : 1 + (P[1].ok ? 1 : 0) + (P[2].ok ? 1 : 0);
    X.done = true; X.result = { stars, fail, t: S.time, why, goals: P.map((p) => p.ok) };
    if (!X.practice) saveRecord(X.id, { stars, t: Date.now(), gameT: S.time, company: S.company.name, goals: P.map((p) => p.ok) });
    G.log(`劇本「${sc.name}」結算：${fail ? '失敗' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}${X.practice ? '（練習，不改變成績）' : ''}`);
    G._emit('event', { kind: 'scen-end', stars, fail, practice: X.practice });
    return X.result;
  };
})();
