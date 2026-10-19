// v0.3 規則：創始人背景、員工與工會、餐飲供餐。所有平衡數值集中在這裡。
(function () {
  const G = window.G;

  // ---------- 創始人背景 ----------
  // cash：起始資金倍率；rep：起始社會評價；attention：社會評價變動放大倍率（社會關注度）
  // risk / crash：故障與失事機率倍率；mx：維修費用倍率；payroll / overhead：人事與管理費倍率
  // hubFee：樞紐設立費倍率；capture：攬客力倍率；ancillary：機上付費餐點收入倍率
  // morale / hire / union：各員工群體士氣加成、招募速度倍率、與工會協商成功率加成
  // equity：創始人起始持股（%）；board：是否受董事會協議約束
  G.FOUNDERS = {
    classic: { name: '白手起家', tag: '標準', desc: '沒有特別的優勢或包袱，所有數值都是標準值，適合第一次玩。',
      pros: ['各項數值平均'], cons: ['沒有任何加成'],
      cash: 1, rep: 60, attention: 1, equity: 100 },
    heir: { name: '富二代', tag: '資金雄厚', desc: '家族資金充裕，一舉一動都在媒體鏡頭下：做得好名聲飛升，出事也會被放大檢視。',
      pros: ['起始資金 ×2', '起始社會評價 65'], cons: ['社會關注度高：評價的漲跌 ×1.5'],
      cash: 2, rep: 65, attention: 1.5, equity: 100 },
    engineer: { name: '工程技師', tag: '技術專業', desc: '出身航空維修工程，資金不多，但懂得把飛機照顧好。',
      pros: ['故障、轉降與失事機率 ×0.7', '定期檢查與維修費 ×0.85', '地勤與維修技師士氣 +10'], cons: ['起始資金 ×0.6'],
      cash: 0.6, rep: 60, attention: 1, risk: 0.7, mx: 0.85, morale: { ground: 10 }, equity: 100 },
    manager: { name: '職業經理人', tag: '受託經營', desc: '受投資人委託經營，管理效率高，但公司不是你的：一開始沒有任何股權，每 5 年要和董事會重新簽約。',
      pros: ['起始資金 ×1.2（投資人出資）', '管理費 ×0.7、人事薪資 ×0.92', '與工會協商成功率 +15%'], cons: ['起始持股 0%', '每 5 年須達成董事會目標才能續約，可談股權條款'],
      cash: 1.2, rep: 60, attention: 1, payroll: 0.92, overhead: 0.7, union: 0.15, equity: 0, board: true },
    captain: { name: '前航空公司機長', tag: '飛行專業', desc: '飛了二十年的機長，在機師圈有好人脈，也更懂飛安。',
      pros: ['機師士氣 +12、招募速度 ×1.5', '失事機率 ×0.8', '與機師工會協商成功率 +20%'], cons: ['起始資金 ×0.8'],
      cash: 0.8, rep: 60, attention: 1, crash: 0.8, morale: { pilot: 12 }, hire: { pilot: 1.5 }, union: { pilot: 0.2 }, equity: 100 },
    official: { name: '前政府官員', tag: '政商人脈', desc: '熟悉主管機關與機場公司，設立樞紐事半功倍；但大眾對政商關係有疑慮。政府標案評分 +15%。',
      pros: ['樞紐設立費 ×0.75', '政府標案評分 +15%'], cons: ['起始社會評價 50', '社會關注度略高：評價漲跌 ×1.2'],
      cash: 1, rep: 50, attention: 1.2, hubFee: 0.75, gov: 0.15, equity: 100 },
    travel: { name: '旅遊業老手', tag: '行銷專長', desc: '經營旅行社起家，最懂旅客要什麼，也知道怎麼把位子賣出去。',
      pros: ['所有航線攬客力 ×1.06', '機上付費餐點收入 ×1.3', '空服員士氣 +5'], cons: ['起始資金 ×0.8'],
      cash: 0.8, rep: 60, attention: 1, capture: 1.06, ancillary: 1.3, morale: { cabin: 5 }, equity: 100 },
  };
  // v0.7.0 首富：起始資金 40.5 億美元，開局就買得起 10 架全新 A350-1000（每架 3.66 億）
  G.FOUNDERS.tycoon = { name: '首富', tag: '富可敵國', desc: '國內首富跨足航空業，錢不是問題，開局就能直接買下一整支寬體機隊；但全國都在看你，員工也期待首富開出更好的待遇。',
    pros: ['起始資金 ×27（約 40.5 億美元，足以買 10 架全新 A350-1000）', '起始社會評價 70'], cons: ['社會關注度極高：評價的漲跌 ×2', '人事薪資 ×1.1（員工期待首富給更多）'],
    cash: 27, rep: 70, attention: 2, payroll: 1.1, equity: 100 };
  G.FOUNDER_ORDER = ['classic', 'heir', 'tycoon', 'engineer', 'manager', 'captain', 'official', 'travel'];
  G.founder = () => G.FOUNDERS[(G.S && G.S.founder && G.S.founder.type) || 'classic'];
  G.fmod = (key, group) => {
    const f = G.founder(), v = f[key];
    if (v == null) return key === 'union' || key === 'gov' ? 0 : key === 'morale' ? 0 : 1;
    if (typeof v === 'object') return v[group] ?? (key === 'union' || key === 'morale' ? 0 : 1);
    return v;
  };

  // ---------- 董事會（職業經理人）----------
  G.BOARD = {
    termYears: 5,
    firstTarget: 150e6, // 第一任期 5 年累計營業利益目標
    repMin: 55, // 任期結束時社會評價下限
    clauses: {
      standard: { name: '標準續約', desc: '沒有股權條款。下一任期的獲利目標 ×1.2。', targetMul: 1.2 },
      equity: { name: '股權獎酬條款', desc: '下一任期達成目標時，一次獲得 5% 公司股權。獲利目標 ×1.45。', targetMul: 1.45 },
      options: { name: '認股權條款', desc: '任期內每個營業利益為正的年度，取得 2% 股權（每任期最多 10%）。獲利目標 ×1.3。', targetMul: 1.3 },
    },
  };

  // ---------- 員工 ----------
  G.STAFF = {
    pilot: { name: '機師', wage: 15000, hireCost: 25000, hireSpeed: 0.5 },
    cabin: { name: '空服員', wage: 4500, hireCost: 5000, hireSpeed: 1 },
    ground: { name: '地勤與維修技師', wage: 4000, hireCost: 3000, hireSpeed: 1 },
    office: { name: '行政人員', wage: 5000, hireCost: 2000, hireSpeed: 1 },
  };
  G.STAFF_GROUPS = ['pilot', 'cabin', 'ground', 'office'];
  G.UNION_GROUPS = ['pilot', 'cabin', 'ground'];
  G.SCHEDULES = { relaxed: { name: '寬鬆', k: 0.9 }, standard: { name: '標準', k: 1 }, tight: { name: '緊湊', k: 1.15 } };
  // 依主要樞紐所在國家的人均 GDP 調整薪資水準
  G.wageFactor = (cc) => {
    const g = window.COUNTRIES[cc] ? window.COUNTRIES[cc][2] : 10000;
    return Math.min(1.6, Math.max(0.25, Math.pow(g / 40000, 0.7)));
  };
  // 每架飛機需要的人力（標準排班）
  G.staffPerAircraft = (t, seats) => ({
    pilot: t.wide ? 16 : t.body === 'turboprop' ? 8 : 10,
    cabin: Math.max(1, Math.ceil(seats / 45)) * 5,
    ground: t.wide ? 18 : 12,
  });
  G.STAFF_PER_HUB = [60, 30, 15];
  G.UNION_FORM_AT = 30; // 人數達到時成立工會
  G.STRIKE_NOTICE_DAYS = 7;

  // ---------- 餐飲供餐 ----------
  G.MEALS = {
    none: { name: '不供餐', score: 0, cost: 0 },
    bob: { name: '付費餐點', score: 0.3, cost: 1 },
    snack: { name: '輕食', score: 0.55, cost: 3 },
    meal: { name: '熱食正餐', score: 0.8, cost: 8 },
    chef: { name: '主廚套餐', score: 1, cost: 16 },
  };
  G.MEAL_ORDER = ['none', 'bob', 'snack', 'meal', 'chef'];
  G.MEAL_CLASS_MUL = { Y: 1, W: 1.5, J: 3.5, F: 7 };
  G.SUPPLIERS = { budget: { name: '平價空廚', cost: 0.8, q: -0.08 }, standard: { name: '標準空廚', cost: 1, q: 0 }, premium: { name: '精緻空廚', cost: 1.35, q: 0.08 } };
  G.mealsPerFlight = (h) => (h < 1.5 ? 0.5 : h < 6 ? 1 : 2);
  // 旅客期待的餐飲水準（依艙等與航程）
  G.mealExpect = (cls, h) => {
    if (cls === 'F') return 1;
    if (cls === 'J') return h < 1.5 ? 0.5 : 0.85;
    const y = h < 1.5 ? 0.25 : h < 4 ? 0.5 : 0.8;
    return cls === 'W' ? y + 0.1 : y;
  };
  G.BOB = { buyRate: 0.3, margin: 9 }; // 經濟艙付費餐點：購買率、每份毛利
  G.defaultCatering = () => ({ meals: { Y: 'snack', W: 'meal', J: 'meal', F: 'chef' }, supplier: 'standard', special: true });
  G.UPGRADES.kitchen = { name: '自建空廚', max: 1, cost: 8e6, upkeep: 120e3, desc: '從此樞紐出發的航班餐點成本 ×0.75、品質 +0.05' };
})();

// 創始人背景對既有公式的修正（包住 v0.1／v0.2 的函式）
(function () {
  const G = window.G;
  const hubFee0 = G.hubFee;
  G.hubFee = (ap, type) => hubFee0(ap, type) * G.fmod('hubFee');
  const risk0 = G.riskPerFlight;
  G.riskPerFlight = (o) => {
    const p = risk0(o), r = G.fmod('risk'), c = G.fmod('crash');
    return { delay: p.delay * r, emergency: p.emergency * r, crash: p.crash * r * c };
  };
  const plan0 = G.checkPlan;
  G.checkPlan = (t, lv, h) => { const p = plan0(t, lv, h); p.cost *= G.fmod('mx'); return p; };
})();

// v0.3.1 機型限制：適航認證地區、機場等級
(function () {
  const G = window.G;
  G.restrictionWhy = (t, a, b) => {
    if (t.only && !(t.only.includes(a.cc) && t.only.includes(b.cc))) {
      // 說明是哪一類航線不能飛：兩岸、港澳或國際線
      const ccs = [a.cc, b.cc];
      const kind = ccs.includes('CN') && ccs.includes('TW') ? '兩岸航線' : ccs.includes('CN') && (ccs.includes('HK') || ccs.includes('MO')) ? '港澳航線' : '國際線';
      return `${t.model} 只取得中國民航局（CAAC）型號認證，只能飛中國大陸國內線；${a.iata}–${b.iata} 屬於${kind}，不能使用`;
    }
    const need = G.acClass(t);
    for (const ap of [a, b]) {
      if (ap.size > need) return `${ap.iata} 是${G.SIZE_ZH[ap.size]}，${t.model} 屬於${G.AC_CLASS_ZH[need]}，需要${G.SIZE_ZH[need]}${need === 1 ? '以上' : ''}`;
    }
    return null;
  };
  // v0.6.2 機型等級：大型客機只能用大型機場；A330／787／767 需要中型以上；其餘小型機場就能起降
  const LARGE = ['A388', 'B748', 'B77W', 'A359', 'A35K'], MEDIUM = ['A333', 'A339', 'B763', 'B788', 'B789', 'B78X'];
  G.acClass = (t) => (LARGE.includes(t.id) ? 0 : MEDIUM.includes(t.id) ? 1 : 2);
  G.AC_CLASS_ZH = ['大型客機', '中型廣體客機', '窄體與區域客機'];
  // v0.6.2 跑道需求配合機場等級：中型機場一定能起降 A330 等級、小型機場較長的跑道能起降 A320／737 系列
  G.RWY_CAP = [2990, 2490, 2400];
  window.AIRCRAFT.forEach((t) => { t.rwy0 = t.rwy0 || t.rwy; t.rwy = Math.min(t.rwy0, G.RWY_CAP[G.acClass(t)]); });
  G.restrictionTags = (t) => {
    const out = [];
    if (t.only) out.push('僅限中國大陸航線');
    const c = G.acClass(t);
    if (c === 0) out.push('限大型機場');
    else if (c === 1) out.push('需中型以上機場');
    return out;
  };
})();
