// v0.6.4 會員方案：玩家自訂等級數、等級名稱、年費與每一級的福利。
// 年費是固定收入；會員會優先搭自家航班（攬客率加成＝固定客流），但每次搭機都會用掉福利、產生成本。
// 商務客一年搭 10 趟、重視貴賓室、優先、保證座位；觀光客一年搭 2 趟、重視折扣、行李、選位與生日禮。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.LOY = {
    setup: 500e3, adminMonthly: 30e3, adminPerMember: 0.12, // 開辦費、每月系統與客服、每位會員每月
    trips: { B: 10, L: 2 }, // 每位會員每年搭自家航班的趟數
    scale: { B: 260, L: 45 }, // 對「福利價值－年費」的敏感度（美元）
    ref: { B: 700, L: 90 }, // 「福利夠好」的參考價值
    maxTiers: 5, maxFee: 5000,
    reach: 0.55, // 最多有多少比例的旅客會考慮加入（再乘社會評價）
    boost: 0.45, boostCap: 1.4, // 會員帶來的攬客率加成上限
    speed: 0.02, // 會員人數每天往目標值移動的比例
  };
  // 福利：levels 是每一級的說明；B／L 是商務客／觀光客每趟覺得值多少（annual：每年）；cost 是航空公司每趟成本
  // fit：主要吸引誰（B 商務、L 觀光、BL 兩者）
  G.BENEFITS = [
    { id: 'miles', name: '里程回饋', fit: 'BL', levels: ['無', '基本累積', '加倍累積', '三倍累積'], B: [0, 8, 16, 24], L: [0, 6, 12, 18], cost: [0, 4, 8, 12] },
    { id: 'lounge', name: '貴賓室', fit: 'B', levels: ['無', '出發地貴賓室', '全航網貴賓室', '貴賓室＋攜伴'], B: [0, 35, 50, 65], L: [0, 8, 12, 18], cost: [0, 18, 28, 40], note: '有自建貴賓室的樞紐成本 ×0.6' },
    { id: 'priority', name: '優先報到與登機', fit: 'B', levels: ['無', '優先登機', '優先報到＋登機', '專屬櫃檯＋快速通關'], B: [0, 8, 14, 22], L: [0, 2, 4, 6], cost: [0, 0.5, 1.5, 4] },
    { id: 'guarantee', name: '保證座位', fit: 'B', levels: ['無', '候補優先', '滿艙保證（72 小時前）', '滿艙保證（24 小時前）'], B: [0, 6, 15, 25], L: [0, 1, 2, 3], cost: [0, 1, 3, 5] },
    { id: 'upgrade', name: '升等券', fit: 'B', levels: ['無', '每年 1 張', '每年 2 張', '每年 4 張'], annual: true, B: [0, 250, 500, 1000], L: [0, 120, 240, 480], cost: [0, 90, 180, 360] },
    { id: 'wifi', name: '機上 Wi-Fi 與餐飲', fit: 'BL', levels: ['無', '免費訊息', '免費 Wi-Fi', 'Wi-Fi＋餐飲升級'], B: [0, 3, 8, 12], L: [0, 2, 5, 8], cost: [0, 0.5, 2, 5] },
    { id: 'discount', name: '會員票價折扣', fit: 'L', levels: ['無', '95 折', '9 折', '85 折'], pct: [0, 0.05, 0.1, 0.15], B: [0, 0.3, 0.3, 0.3], L: [0, 1, 1, 1] },
    { id: 'bag', name: '免費加購行李', fit: 'L', levels: ['無', '+5 公斤', '+10 公斤', '+1 件 23 公斤'], B: [0, 2, 3, 4], L: [0, 8, 14, 22], cost: [0, 4, 7, 11] },
    { id: 'seat', name: '免費選位', fit: 'L', levels: ['無', '一般座位', '前排與緊急出口', '全部座位'], B: [0, 4, 7, 10], L: [0, 5, 9, 13], cost: [0, 2, 4, 6] },
    { id: 'partner', name: '生日禮與合作商家', fit: 'L', levels: ['無', '生日禮', '合作商家折扣', '飯店租車聯名禮遇'], annual: true, B: [0, 10, 30, 60], L: [0, 20, 50, 80], cost: [0, 8, 20, 40] },
  ];
  G.FIT_ZH = { B: '商務客偏好', L: '觀光客偏好', BL: '兩者都喜歡' };

  const L = () => G.S.loyalty;
  // 旅客平均票價（最近 30 天的移動平均），折扣福利用它換算
  const avgFare = () => (L() && L().fare) || 220;
  const ownLounge = () => Object.values(G.S.hubs).some((h) => (h.upgrades.lounge || 0) > 0);

  // 一位會員一年覺得這個等級值多少、航空公司一年要花多少
  G.tierEcon = (tier, seg) => {
    const trips = G.LOY.trips[seg], f = avgFare();
    let value = 0, tripCost = 0, annualCost = 0;
    G.BENEFITS.forEach((b) => {
      const lv = (tier.ben && tier.ben[b.id]) || 0;
      if (!lv) return;
      if (b.id === 'discount') { value += b[seg][lv] * b.pct[lv] * f * trips; tripCost += b.pct[lv] * f; return; }
      const c = b.cost[lv] * (b.id === 'lounge' && ownLounge() ? 0.6 : 1);
      if (b.annual) { value += b[seg][lv]; annualCost += c; } else { value += b[seg][lv] * trips; tripCost += c; }
    });
    const cost = tripCost * trips + annualCost;
    return { value, cost, tripCost, annualCost, surplus: value - (tier.fee || 0) };
  };
  // 各等級的加入率（logit：每個等級的「福利價值－年費」，加上「不加入」）
  G.joinRates = (tiers, seg, rep) => {
    const sc = G.LOY.scale[seg];
    const u = tiers.map((t) => Math.exp(clamp(G.tierEcon(t, seg).surplus / sc, -20, 20)));
    const den = 1 + u.reduce((s, x) => s + x, 0);
    const reach = G.LOY.reach * (0.6 + 0.4 * (rep != null ? rep : G.S.rep) / 100);
    return u.map((x) => (reach * x) / den);
  };

  // ---------- 設定 ----------
  G.defaultLoyalty = () => ({
    name: `${G.S.company.name}會員`,
    tiers: [
      { name: '藍卡', fee: 0, ben: { miles: 1 } },
      { name: '銀卡', fee: 120, ben: { miles: 2, priority: 1, bag: 1, seat: 1, discount: 1, partner: 1 } },
      { name: '金卡', fee: 600, ben: { miles: 2, lounge: 2, priority: 2, guarantee: 2, upgrade: 1, wifi: 2, bag: 2, seat: 2 } },
    ],
  });
  G.checkLoyalty = (cfg) => {
    if (!cfg.name || !cfg.name.trim()) return '請輸入會員方案名稱';
    if (!cfg.tiers.length || cfg.tiers.length > G.LOY.maxTiers) return `等級數要在 1–${G.LOY.maxTiers} 之間`;
    const names = new Set();
    for (const t of cfg.tiers) {
      if (!t.name || !t.name.trim()) return '每個等級都要有名稱';
      if (names.has(t.name.trim())) return `等級名稱「${t.name}」重複`;
      names.add(t.name.trim());
      if (!(t.fee >= 0 && t.fee <= G.LOY.maxFee)) return `年費要在 $0–$${G.LOY.maxFee} 之間`;
    }
    return null;
  };
  G.setLoyalty = (cfg) => {
    const S = G.S, why = G.checkLoyalty(cfg);
    if (why) return { ok: false, msg: why };
    const old = S.loyalty;
    if (!old && S.cash < G.LOY.setup) return { ok: false, msg: `開辦會員方案需要 ${G.money(G.LOY.setup)}（系統建置與行銷）` };
    if (!old) G._spend(G.LOY.setup, 'loyalty');
    // 依名稱保留原本的會員人數；刪掉的等級，會員退回不加入
    const prev = {};
    (old ? old.tiers : []).forEach((t) => (prev[t.name] = t));
    const tiers = cfg.tiers.map((t, i) => ({ id: i + 1, name: t.name.trim().slice(0, 12), fee: Math.round(t.fee), ben: { ...t.ben }, mB: prev[t.name.trim()] ? prev[t.name.trim()].mB : 0, mL: prev[t.name.trim()] ? prev[t.name.trim()].mL : 0 }));
    S.loyalty = { name: cfg.name.trim().slice(0, 20), since: old ? old.since : S.time, tiers, emaB: old ? old.emaB : 0, emaL: old ? old.emaL : 0, fare: old ? old.fare : 0, boost: old ? old.boost : { B: 1, L: 1 }, mtd: old ? old.mtd : { fee: 0, cost: 0 }, last: old ? old.last : null };
    G.log(old ? `會員方案「${S.loyalty.name}」調整為 ${tiers.length} 個等級` : `推出會員方案「${S.loyalty.name}」，開辦費 ${G.money(G.LOY.setup)}`);
    return { ok: true };
  };
  G.stopLoyalty = () => {
    const S = G.S;
    if (!S.loyalty) return { ok: false, msg: '目前沒有會員方案' };
    const n = G.memberCount();
    G.log(`停辦會員方案「${S.loyalty.name}」，${G.num(n)} 位會員權益終止`, 'warn');
    if (n > 1000) G.repDelta(-Math.min(6, n / 20000 + 1), '停辦會員方案');
    S.loyalty = null;
    return { ok: true };
  };
  G.memberCount = (seg) => (L() ? L().tiers.reduce((s, t) => s + (seg ? t['m' + seg] : t.mB + t.mL), 0) : 0);
  // 會員帶來的攬客率加成（segments.js 的 segShare 使用）
  G.loyaltyBoost = (seg) => (L() && L().boost ? L().boost[seg] || 1 : 1);

  // ---------- 每日結算 ----------
  G.loyaltyDaily = () => {
    const S = G.S, P = L(), d = S.day;
    if (!P) return;
    const paxB = d.paxB || 0, paxL = Math.max(0, (d.pax || 0) - paxB);
    // 旅客量與平均票價的 30 天移動平均
    const a = P.emaB || P.emaL ? 1 / 30 : 1;
    P.emaB = P.emaB * (1 - a) + paxB * a; P.emaL = P.emaL * (1 - a) + paxL * a;
    if (d.pax) P.fare = P.fare ? P.fare * (1 - 1 / 30) + (d.tix / d.pax) * (1 / 30) : d.tix / d.pax;
    const pool = { B: (P.emaB * 365) / G.LOY.trips.B, L: (P.emaL * 365) / G.LOY.trips.L }; // 常搭自家航班的不重複旅客
    const today = { B: paxB, L: paxL };
    let fee = 0, cost = 0, boost = { B: 0, L: 0 };
    ['B', 'L'].forEach((s) => {
      const rates = G.joinRates(P.tiers, s);
      P.tiers.forEach((t, i) => {
        const key = 'm' + s, target = pool[s] * rates[i];
        t[key] += (target - t[key]) * G.LOY.speed;
        const pen = pool[s] > 0 ? Math.min(1, t[key] / pool[s]) : 0;
        const ec = G.tierEcon(t, s);
        fee += (t[key] * t.fee) / 365;
        cost += today[s] * pen * ec.tripCost + (t[key] * ec.annualCost) / 365; // 今天搭機的會員用掉的福利＋年度福利攤提
        boost[s] += pen * Math.min(1.5, ec.value / G.LOY.ref[s]);
      });
    });
    const n = G.memberCount();
    cost += (G.LOY.adminMonthly + G.LOY.adminPerMember * n) / 30;
    P.boost = { B: Math.min(G.LOY.boostCap, 1 + G.LOY.boost * boost.B), L: Math.min(G.LOY.boostCap, 1 + G.LOY.boost * boost.L) };
    if (fee > 0) { S.cash += fee; d.rev += fee; d.member = (d.member || 0) + fee; }
    if (cost > 0) G._spend(cost, 'loyalty');
    P.mtd.fee += fee; P.mtd.cost += cost;
    // 月底：記下本月結果
    const now = new Date((S.lastDay - 1) * DAY), next = new Date(S.lastDay * DAY);
    if (now.getUTCMonth() !== next.getUTCMonth()) { P.last = { fee: P.mtd.fee, cost: P.mtd.cost, members: n, y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 }; P.mtd = { fee: 0, cost: 0 }; }
  };
  // 給介面：目前各等級的狀況
  G.loyaltyStats = () => {
    const P = L();
    if (!P) return null;
    const pool = { B: (P.emaB * 365) / G.LOY.trips.B, L: (P.emaL * 365) / G.LOY.trips.L };
    return {
      pool, boost: P.boost, fare: avgFare(), total: G.memberCount(), mtd: P.mtd, last: P.last,
      tiers: P.tiers.map((t) => ({ t, mB: t.mB, mL: t.mL, eB: G.tierEcon(t, 'B'), eL: G.tierEcon(t, 'L') })),
    };
  };
})();
