// 遊戲規則與數值公式。所有可調整的平衡參數集中在這裡。
(function () {
  const G = (window.G = window.G || {});

  // ---------- 機場 ----------
  G.AIRPORTS = window.AIRPORT_ROWS.map((r, i) => ({
    i, iata: r[0], icao: r[1], name: r[2], city: r[3], cc: r[4], lat: r[5], lon: r[6],
    size: r[7], rwy: r[8], tz: r[9], popK: r[10], mil: r[11],
  }));
  // v0.6.2 機場等級改依「能起降多大的飛機」分類（以最長跑道判斷）：
  //   大型：≥ 3,000 公尺，可起降 A380、747、777、A350
  //   中型：2,500–3,000 公尺，最多起降 A330、787、767
  //   小型：< 2,500 公尺，只能起降螺旋槳、支線客機與 A320／737 系列
  // 原本依 OurAirports 旅運規模的分類保留在 type0（只用於資料建置時的腹地人口分配）。
  G.SIZE_RULE = { large: 2990, medium: 2490 }; // 留 10 公尺容差：英呎換算的 3,000 公尺跑道常是 2,999
  G.AIRPORTS.forEach((a) => {
    a.type0 = a.size;
    if (a.rwy > 0) a.size = a.rwy >= G.SIZE_RULE.large ? 0 : a.rwy >= G.SIZE_RULE.medium ? 1 : 2;
  });
  G.AP = {};
  G.AIRPORTS.forEach((a) => (G.AP[a.iata] = a));
  G.SIZE_ZH = ['大型機場', '中型機場', '小型機場'];
  G.SIZE_DESC = ['可起降 A380、747、777、A350 等大型客機', '最多起降 A330、787、767 等中型廣體客機', '只能起降螺旋槳、支線客機與 A320／737 系列'];

  G.countryZh = (cc) => (window.COUNTRIES[cc] ? window.COUNTRIES[cc][0] : cc);
  G.cityKey = (a) => a.cc + ':' + a.city.replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase();

  // ---------- 機型 ----------
  G.TYPES = {};
  window.AIRCRAFT.forEach((t) => (G.TYPES[t.id] = t));

  // ---------- 艙等 ----------
  G.CLASSES = ['F', 'J', 'W', 'Y'];
  G.CLASS_DEFAULT_NAME = { Y: '經濟艙', W: '豪華經濟艙', J: '商務艙', F: '頭等艙' };
  G.TIERS = ['節約', '經濟', '標準', '輕奢', '豪華'];
  // 每個座位占用的座位單位（標準經濟艙座椅 = 1.0）
  G.SEAT_UNITS = {
    Y: [0.92, 0.96, 1.0, 1.07, 1.15],
    W: [1.3, 1.4, 1.5, 1.62, 1.75],
    Jn: [1.9, 2.1, 2.4, 2.8, 3.2], // 窄體機商務艙（大座椅／平躺有限）
    Jw: [2.6, 3.0, 3.5, 4.0, 4.6], // 寬體機商務艙（平躺座椅）
    F: [4.5, 5.5, 6.5, 7.5, 9.0],
  };
  G.TIER_SCORE = [0.62, 0.8, 1.0, 1.15, 1.3];
  // 每位乘客的機上服務成本（美元，再乘以航段時間係數）
  // v0.3 起餐點另計（見 rules3.js），這裡只剩備品、毛毯、盥洗包等非餐飲服務
  G.SERVICE_COST = { Y: [1, 2, 3.5, 5, 7], W: [4.5, 6.5, 9, 12, 16], J: [14, 20, 27, 37, 50], F: [35, 50, 70, 95, 130] };
  G.classesFor = (type) => (type.wide ? ['F', 'J', 'W', 'Y'] : ['J', 'W', 'Y']);
  G.seatUnits = (type, cls, tier) => (cls === 'J' ? (type.wide ? G.SEAT_UNITS.Jw : G.SEAT_UNITS.Jn)[tier] : G.SEAT_UNITS[cls][tier]);
  G.cabinUsage = (type, cabin) => {
    let units = 0, seats = 0;
    G.classesFor(type).forEach((c) => {
      const k = cabin[c];
      if (k && k.seats > 0) { units += k.seats * G.seatUnits(type, c, k.tier); seats += k.seats; }
    });
    return { units, seats };
  };
  G.defaultCabin = (type) => {
    const cab = {};
    G.classesFor(type).forEach((c) => (cab[c] = { seats: 0, tier: 2 }));
    if (type.wide) {
      cab.J.seats = Math.round(type.units * 0.11 / G.seatUnits(type, 'J', 2));
      cab.W.seats = Math.round(type.units * 0.08 / 1.5);
    } else if (type.units >= 120) {
      cab.J.seats = type.units >= 170 ? 12 : 8;
    }
    const used = G.cabinUsage(type, cab).units;
    cab.Y.seats = Math.min(type.maxSeats - G.cabinUsage(type, cab).seats, Math.floor((type.units - used) / 1.0));
    return cab;
  };
  G.cabinSeats = (cabin) => Object.values(cabin).reduce((s, k) => s + (k ? k.seats : 0), 0);

  // ---------- 地理 ----------
  G.dist = (a, b) => {
    const r = Math.PI / 180;
    const d = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(d));
  };

  // ---------- 時區與宵禁 ----------
  const fmtCache = {}, offCache = new Map();
  G.localMinutes = (ap, t) => {
    if (ap.tz) {
      try {
        // 每個時區每個小時只問一次 Intl 該時區與 UTC 的差距（formatToParts 很慢，模擬時會被呼叫上萬次）
        const hr = Math.floor(t / 3600000), key = ap.tz + '|' + hr;
        let off = offCache.get(key);
        if (off === undefined) {
          let f = fmtCache[ap.tz];
          if (!f) f = fmtCache[ap.tz] = new Intl.DateTimeFormat('en-GB', { timeZone: ap.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
          const p = f.formatToParts(new Date(hr * 3600000));
          const local = +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value;
          off = (((local - ((hr * 60) % 1440)) % 1440) + 1440) % 1440;
          if (offCache.size > 20000) offCache.clear();
          offCache.set(key, off);
        }
        return (((Math.floor(t / 60000) + off) % 1440) + 1440) % 1440;
      } catch (e) { /* 以經度估算 */ }
    }
    const off = Math.round(ap.lon / 15) * 60;
    return (((Math.floor(t / 60000) + off) % 1440) + 1440) % 1440;
  };
  G.localTimeStr = (ap, t) => { const m = G.localMinutes(ap, t); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hm = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
  G.curfew = (ap) => window.CURFEWS[ap.iata] || null;
  G.inCurfew = (ap, t) => {
    const c = G.curfew(ap);
    if (!c) return false;
    const m = G.localMinutes(ap, t), a = hm(c.from), b = hm(c.to);
    return a < b ? m >= a && m < b : m >= a || m < b;
  };

  // ---------- 需求模型（以真實人口與人均 GDP 推估）----------
  G.wealth = (cc) => {
    const g = window.COUNTRIES[cc] ? window.COUNTRIES[cc][2] : 6000;
    return Math.min(1.9, Math.max(0.12, Math.pow(g / 15000, 0.6)));
  };
  G.econ = (ap) => (ap.popK / 1000) * G.wealth(ap.cc);
  G.distFactor = (d) => {
    if (d < 150) return 0.04;
    if (d < 500) return Math.pow(d / 500, 2); // 短程與地面交通（高鐵、公路）競爭
    if (d <= 3000) return 1;
    return Math.pow(3000 / d, 0.55);
  };
  // 單向每日總市場（所有航空公司合計的旅客數）
  G.marketDaily = (a, b) => {
    const d = G.dist(a, b);
    const intl = a.cc !== b.cc ? 0.75 : 1;
    return 550 * Math.sqrt(G.econ(a) * G.econ(b)) * G.distFactor(d) * intl;
  };
  G.classShare = (d) => {
    const J = 0.06 + 0.06 * Math.min(1, d / 6000);
    const F = d > 5000 ? 0.012 : 0.004;
    const W = 0.06;
    return { F, J, W, Y: 1 - F - J - W };
  };
  G.refFare = (d, cls) => {
    const y = 41 + 0.153 * Math.pow(d, 0.9); // v0.4 下修約一成，讓利潤率接近真實航空公司
    const m = { Y: 1, W: 1.55, J: d < 1500 ? 2.6 : 3.8, F: 6.5 }[cls];
    return y * m;
  };

  // ---------- 營運數值 ----------
  G.FUEL_PRICE = 0.82; // 美元／公斤
  G.blockMinutes = (type, d) => Math.round((d / type.speed) * 60 + 30);
  G.turnMinutes = (type) => (type.body === 'turboprop' ? 30 : type.wide ? 90 : type.body === 'regional' ? 35 : 45);
  G.leaseMonthly = (type) => type.price * 1e6 * (type.used ? 0.011 : 0.0075);
  G.overheadDaily = 1500; // 每架飛機每日管理費
  G.START_CASH = 150e6;

  // 樞紐費用
  G.HUB_FEE = [25e6, 8e6, 2e6]; // 依機場規模，主要樞紐設立費
  G.HUB_SECONDARY_RATIO = 0.4;
  G.HUB_UPKEEP_MONTH = [400e3, 120e3, 40e3];
  G.hubFee = (ap, type) => G.HUB_FEE[ap.size] * (type === 'primary' ? 1 : G.HUB_SECONDARY_RATIO);
  G.hubUpkeepMonthly = (ap, type) => G.HUB_UPKEEP_MONTH[ap.size] * (type === 'primary' ? 1 : 0.5);
  G.FORTRESS_SHARE = 0.7;
  G.baselineDepartures = (ap) => Math.round(3 + 40 * Math.pow(ap.popK / 1000, 0.75));
  G.UPGRADES = {
    lounge: { name: '貴賓室', max: 3, cost: 3e6, upkeep: 60e3, desc: '提升商務艙與頭等艙旅客滿意度與攬客力，每級 +5%' },
    ground: { name: '地勤服務', max: 2, cost: 2e6, upkeep: 40e3, desc: '加快在此樞紐的過站時間，每級 -8%' },
    hangar: { name: '維修棚廠', max: 2, cost: 15e6, upkeep: 150e3, desc: '第 1 級可自行執行 C 檢、第 2 級可執行 D 檢；沒有棚廠時 C／D 檢委外，費用 ×1.5、工期 ×1.25' },
  };
  G.routeOpenFee = (ap) => [400e3, 150e3, 50e3][ap.size];

  // ---------- 第二階段：維修與飛安 ----------
  // 檢查間隔以飛行小時計（遊戲化的近似值）；較高等級的檢查同時完成所有較低等級
  G.CHECKS = {
    A: { name: 'A 檢', interval: 600, hours: 10, cost: 60e3, hangar: 0, desc: '例行線上檢查，過夜完成' },
    B: { name: 'B 檢', interval: 3000, hours: 48, cost: 250e3, hangar: 0, desc: '較深入的系統檢查，約 2 天' },
    C: { name: 'C 檢', interval: 7500, hours: 12 * 24, cost: 1.2e6, hangar: 1, desc: '結構與系統大檢，約 12 天' },
    D: { name: 'D 檢', interval: 36000, hours: 40 * 24, cost: 4.5e6, hangar: 2, desc: '全機拆解重檢，約 40 天' },
  };
  G.CHECK_LEVELS = ['A', 'B', 'C', 'D'];
  G.checkSize = (t) => Math.pow(t.units / 170, 0.8);
  G.checkPlan = (t, lv, hangarLv) => {
    const c = G.CHECKS[lv], out = hangarLv < c.hangar;
    return { cost: c.cost * G.checkSize(t) * (out ? 1.5 : 1), hours: c.hours * (out ? 1.25 : 1), outsourced: out };
  };
  G.defaultMaintPolicy = () => ({ A: { auto: true, at: 600 }, B: { auto: true, at: 3000 }, C: { auto: true, at: 7500 }, D: { auto: true, at: 36000 } });
  // 逾期比例：0 = 未逾期，0.2 = 超過間隔 20%
  G.overdue = (ac) => {
    const o = {};
    G.CHECK_LEVELS.forEach((lv) => (o[lv] = Math.max(0, ac.mx[lv] / G.CHECKS[lv].interval - 1)));
    return o;
  };
  // 客艙功能失常造成的品質折損（0–0.35）
  G.cabinPenalty = (o) => Math.min(0.35, 0.3 * o.A + 0.2 * o.B + 0.1 * o.C);
  // 每一航段的事件機率
  G.riskPerFlight = (o) => ({
    delay: Math.min(0.5, 0.004 + 0.05 * (o.A + o.B) + 0.08 * (o.C + o.D)),
    emergency: Math.min(0.2, 0.002 * o.B + 0.012 * o.C + 0.03 * o.D),
    crash: Math.min(0.05, 0.0004 * o.B + 0.002 * o.C + 0.005 * o.D),
  });
  G.COMP = { delayPerPax: 30, divertPerPax: 400, deathEach: 1.5e6, injuryEach: 120e3, negligenceFine: 15e6 };
  G.REP_START = 60;
  G.repFactor = (rep) => 0.6 + 0.8 * rep / 100;

  G.money = (v, digits) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—'; // 不讓 NaN 直接顯示在畫面上
    const s = v < 0 ? '-' : '';
    v = Math.abs(v);
    if (v >= 1e9) return s + '$' + (v / 1e9).toFixed(digits ?? 2) + 'B';
    if (v >= 1e6) return s + '$' + (v / 1e6).toFixed(digits ?? 1) + 'M';
    if (v >= 1e3) return s + '$' + (v / 1e3).toFixed(digits ?? 0) + 'K';
    return s + '$' + v.toFixed(0);
  };
  G.num = (v) => Math.round(v).toLocaleString('zh-TW');
})();
