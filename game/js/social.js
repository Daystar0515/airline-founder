// v0.4.2 社群媒體：每週刷新的貼文（新聞、自媒體、企業、民眾）、公司回應、公司自行發文，以及對營運的影響。
// 所有作者都是虛構的帳號與媒體，不代表任何真實個人或企業。
(function () {
  const G = window.G;
  const DAY = 86400000, WEEK = 7 * DAY;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  G.SOCIAL_CATS = { news: { name: '新聞', color: '#2f6fde' }, kol: { name: '自媒體', color: '#a24bd6' }, biz: { name: '企業', color: '#0f8a6a' }, public: { name: '民眾', color: '#d9822b' } };
  const AUTHORS = {
    news: [['環球航空新聞網', 'aviationdaily'], ['財經快報', 'finflash'], ['旅遊週刊', 'travelweekly'], ['每日新聞台', 'dailynews'], ['產業觀察報', 'industrywatch']],
    kol: [['飛機迷阿傑', 'planespotter_j'], ['旅行吃貨小米', 'foodie.mi'], ['哩程達人 Max', 'milesmax'], ['航空觀察室', 'av_observer'], ['背包客小安', 'backpacker_an']],
    biz: [['海島旅行社', 'islandtours'], ['環宇空廚', 'globalcatering'], ['星辰飯店集團', 'starhotels'], ['北辰航空', 'polaris_air'], ['南星航空', 'southstar_air'], ['雲端訂票網', 'cloudtrip']],
    public: [['王小明', 'xm_wang'], ['陳佳慧', 'jiahui.c'], ['林大偉', 'dw_lin'], ['旅人 Amy', 'amy_on_the_go'], ['張志豪', 'chihao_z'], ['匿名旅客', 'anon_traveler'], ['李曉雯', 'hsiaowen'], ['黃柏翰', 'pohan.h']],
  };

  // ---------- 狀態 ----------
  const blank = (S) => ({ week: 0, nextAt: S.time + WEEK, posts: [], effects: [], postedThisWeek: 0, seq: 1, snap: snapshot(S) });
  function snapshot(S) {
    return { t: S.time, delays: S.safety.delays, emergencies: S.safety.emergencies, crashes: S.safety.crashes, routes: S.routes.map((r) => r.id), fleet: S.fleet.length, rep: S.rep, cash: S.cash };
  }
  G.initSocial = (S) => { if (!S.social) { S.social = blank(S); generateWeek(S, true); } };

  // ---------- 影響：需求倍率與票價收益倍率 ----------
  G.socialDemand = (r) => {
    const S = G.S;
    if (!S || !S.social) return 1;
    const m = S.social.effects.reduce((m, e) => (S.time < e.until && e.demand && (!e.route || (r && e.route === r.id)) ? m * e.demand : m), 1);
    return clamp(m, 0.75, 1.25); // 多個效果疊加也有上下限
  };
  G.socialYield = () => {
    const S = G.S;
    if (!S || !S.social) return 1;
    return clamp(S.social.effects.reduce((m, e) => (S.time < e.until && e.yield ? m * e.yield : m), 1), 0.85, 1);
  };
  function addEffect(S, e) { S.social.effects.push({ ...e, until: S.time + (e.days || 7) * DAY }); }
  function applyOutcome(S, o, source) {
    if (o.cost) G._spend(o.cost, 'marketing');
    // 正面效果邊際遞減：評價越高越難再往上推；同一週累積的正面加分也有上限
    if (o.rep > 0) {
      const so = S.social, room = Math.max(0, 4 - (so.repGain || 0));
      const v = Math.min(room, o.rep * Math.max(0.15, (100 - S.rep) / 50));
      so.repGain = (so.repGain || 0) + v;
      if (v > 0) G.repDelta(v);
    } else if (o.rep) G.repDelta(o.rep);
    if (o.demand || o.yield) addEffect(S, { demand: o.demand, yield: o.yield, route: o.route, days: o.days, source });
    if (o.morale) G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].morale = clamp(S.hr.groups[g].morale + o.morale, 0, 100)));
    if (o.stock && G.stockShock) G.stockShock(o.stock);
  }

  // ---------- 本週公司狀況 ----------
  function context(S) {
    const sn = S.social.snap;
    const days = S.days.slice(-7);
    const sat = days.filter((d) => d.sat != null);
    const avgSat = sat.length ? sat.reduce((s, d) => s + d.sat, 0) / sat.length : null;
    const newRoutes = S.routes.filter((r) => !sn.routes.includes(r.id));
    const fares = S.routes.map((r) => r.fare.Y);
    const hub = G.AP[G.primaryHub()];
    const meals = S.catering ? S.catering.meals : {};
    return {
      co: S.company.name, hub: hub ? hub.city.replace(/\s*\(.*\)/, '') : '', hubIata: hub ? hub.iata : '',
      delays: S.safety.delays - sn.delays, emergencies: S.safety.emergencies - sn.emergencies, crashes: S.safety.crashes - sn.crashes,
      newRoutes, newFleet: S.fleet.length - sn.fleet, avgSat, repUp: S.rep - sn.rep,
      cheap: fares.length && Math.min(...fares) <= 0.85, pricey: fares.length && Math.max(...fares) >= 1.25,
      strike: S.hr ? G.UNION_GROUPS.find((g) => S.hr.unions[g].strike) : null,
      demand: S.hr ? G.UNION_GROUPS.find((g) => S.hr.unions[g].demand) : null,
      lowMorale: S.hr ? G.STAFF_GROUPS.find((g) => S.hr.groups[g].morale < 40) : null,
      listed: S.fin && S.fin.stock.listed, price: S.fin && S.fin.stock.price,
      budgetMeal: meals.Y === 'none' || meals.Y === 'bob', chefMeal: meals.J === 'chef' || meals.F === 'chef',
      fleetSize: S.fleet.length, routeCount: S.routes.length,
      someRoute: S.routes.length ? pick(S.routes) : null,
    };
  }

  // 回應選項的共用組合
  const R = {
    apologize: (cost) => ({ key: 'apologize', label: '公開道歉並提出補償', hint: `花費約 ${G.money(cost)}，大多能平息爭議`, success: 0.85, ok: { cost, rep: 2.5 }, fail: { cost, rep: 0.5 } }),
    explain: () => ({ key: 'explain', label: '發布官方說明', hint: '不花錢，但可能被認為在卸責', success: 0.6, ok: { rep: 1.2 }, fail: { rep: -1.5 } }),
    rebut: () => ({ key: 'rebut', label: '強硬反駁', hint: '高風險：可能贏得支持，也可能引發更大的反彈', success: 0.35, ok: { rep: 2 }, fail: { rep: -5, stock: -0.03 } }),
    thank: () => ({ key: 'thank', label: '感謝並轉發', hint: '小幅提升好感與訂位', success: 0.95, ok: { rep: 0.6, demand: 1.03, days: 7 }, fail: { rep: 0 } }),
    reward: (cost) => ({ key: 'reward', label: '推出回饋優惠', hint: `花費約 ${G.money(cost)}，一週內訂位增加`, success: 0.9, ok: { cost, rep: 0.8, demand: 1.06, days: 7 }, fail: { cost, rep: 0 } }),
    invite: (cost) => ({ key: 'invite', label: '邀請重新體驗', hint: `招待費約 ${G.money(cost)}，對方可能改寫評價`, success: 0.65, ok: { cost, rep: 1.5, demand: 1.02, days: 7 }, fail: { cost, rep: -1 } }),
    trend: (good) => ({ key: 'trend', label: '跟上話題發文', hint: '蹭熱度：反應好時增加曝光，反應差時被說消費話題', success: good, ok: { rep: 0.5, demand: 1.04, days: 7 }, fail: { rep: -2 } }),
    waiver: (cost) => ({ key: 'waiver', label: '宣布免費改票', hint: `預估成本 ${G.money(cost)}，展現誠意`, success: 0.9, ok: { cost, rep: 2, demand: 0.98, days: 7 }, fail: { cost, rep: 0.5 } }),
    promoJump: () => ({ key: 'promo', label: '順勢推出限時促銷', hint: '一週內訂位大增，但票價收益下降', success: 0.85, ok: { demand: 1.12, yield: 0.94, days: 7, rep: 0.3 }, fail: { demand: 1.04, yield: 0.94, days: 7 } }),
  };
  const sizeCost = (base) => base * Math.max(1, G.S.fleet.length / 3);

  // ---------- 貼文模板 ----------
  // related：與公司有關；sentiment：對公司的好感（−2 到 +2）；virality：擴散力（0–1）
  const T = [
    // 與公司有關：負面
    { cat: 'news', when: (c) => c.crashes > 0, make: (c) => ({ text: `【快訊】${c.co}客機失事，民航主管機關已成立專案小組調查，家屬要求公司說明維修紀錄。`, sentiment: -2, virality: 1, opts: [R.apologize(sizeCost(2e6)), R.explain()] }) },
    { cat: 'news', when: (c) => c.emergencies > 0, make: (c) => ({ text: `${c.co}本週發生 ${c.emergencies} 起機械故障緊急轉降事件，旅客驚魂未定，專家呼籲檢視維修制度。`, sentiment: -1.5, virality: 0.8, opts: [R.apologize(sizeCost(300e3)), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.delays >= 2, make: (c) => ({ text: `又延誤了！搭${c.co}在登機門等了三個小時，地勤只說「機械問題」，到底什麼時候才能飛？ #${c.co}延誤`, sentiment: -1, virality: 0.5, opts: [R.apologize(sizeCost(80e3)), R.explain(), R.rebut()] }) },
    { cat: 'news', when: (c) => c.strike, make: (c) => ({ text: `${c.co}${G.STAFF[c.strike].name}工會${G.S.hr.unions[c.strike].strike.active ? '罷工進入第 ' + Math.max(1, Math.ceil((G.S.time - G.S.hr.unions[c.strike].strike.start) / DAY)) + ' 天' : '宣布即將罷工'}，大批旅客行程受影響，勞資雙方各說各話。`, sentiment: -1.5, virality: 0.9, opts: [R.waiver(sizeCost(400e3)), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.lowMorale, make: (c) => ({ text: `朋友在${c.co}當${G.STAFF[c.lowMorale].name}，說公司薪水低、班表又排很滿，最近一堆人想離職…`, sentiment: -1, virality: 0.4, opts: [R.explain(), R.rebut()] }) },
    { cat: 'kol', when: (c) => c.budgetMeal && c.routeCount, make: (c) => ({ text: `搭了${c.co}，經濟艙連一杯水都要另外付錢？這價位的服務只能說普普。完整開箱影片在主頁 ✈️`, sentiment: -0.8, virality: 0.6, opts: [R.invite(30e3), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.pricey, make: (c) => ({ text: `${c.co}的票價也太貴了吧，同一天別家便宜快兩成，不懂誰會買。`, sentiment: -0.7, virality: 0.35, opts: [R.promoJump(), R.explain()] }) },
    { cat: 'news', when: (c) => c.avgSat != null && c.avgSat < 0.6, make: (c) => ({ text: `消費者團體公布最新航空服務調查，${c.co}旅客滿意度僅 ${Math.round(c.avgSat * 100)} 分，敬陪末座。`, sentiment: -1.2, virality: 0.6, opts: [R.apologize(sizeCost(150e3)), R.explain(), R.rebut()] }) },
    // 與公司有關：正面
    { cat: 'news', when: (c) => c.newRoutes.length > 0, make: (c) => ({ text: `${c.co}宣布開航 ${c.newRoutes.map((r) => `${r.a}–${r.b}`).slice(0, 3).join('、')}，業者看好帶動${G.AP[c.newRoutes[0].b].city.replace(/\s*\(.*\)/, '')}觀光商機。`, sentiment: 1, virality: 0.5, opts: [R.thank(), R.reward(sizeCost(60e3))] }) },
    { cat: 'biz', when: (c) => c.newRoutes.length > 0, make: (c) => ({ text: `恭喜 @${G.S.company.code.toLowerCase()}_air 新航線開航！本社即日起推出 ${G.AP[c.newRoutes[0].b].city.replace(/\s*\(.*\)/, '')} 機加酒套裝行程，名額有限 🧳`, author: AUTHORS.biz[pick([0, 2, 5])], sentiment: 1, virality: 0.3, opts: [R.thank()] }) },
    { cat: 'public', when: (c) => c.avgSat != null && c.avgSat >= 0.8, make: (c) => ({ text: `第一次搭${c.co}，座位舒服、空服員很親切，準時抵達，下次還會再選！`, sentiment: 1, virality: 0.3, opts: [R.thank(), R.reward(sizeCost(40e3))] }) },
    { cat: 'kol', when: (c) => c.chefMeal, make: (c) => ({ text: `${c.co}商務艙的主廚套餐真的有誠意，牛排火候比很多餐廳還好，這趟值了 🥩`, sentiment: 1.2, virality: 0.6, opts: [R.thank(), R.reward(sizeCost(50e3))] }) },
    { cat: 'kol', when: (c) => c.newFleet > 0, make: (c) => ({ text: `在${c.hubIata}拍到${c.co}的新飛機！塗裝很好看，這家最近擴張得很快 📸`, sentiment: 0.8, virality: 0.4, opts: [R.thank()] }) },
    { cat: 'news', when: (c) => c.listed && c.repUp > 3, make: (c) => ({ text: `${c.co}股價本週走強，法人看好評價回升帶動客源，目前每股 $${c.price.toFixed(2)}。`, sentiment: 1, virality: 0.4, opts: [R.thank()] }) },
    { cat: 'public', when: (c) => c.cheap, make: (c) => ({ text: `${c.co}現在的票價好划算！已經跟朋友約好連假出國 🎉`, sentiment: 0.8, virality: 0.3, opts: [R.thank(), R.promoJump()] }) },
    { cat: 'public', when: (c) => c.someRoute, make: (c) => ({ text: `下個月要飛 ${c.someRoute.a}–${c.someRoute.b}，有人搭過${c.co}嗎？想知道行李額度跟座位寬度。`, sentiment: 0, virality: 0.15, opts: [R.thank()] }) },
    // 與公司無關：產業與社會話題
    { cat: 'news', unrelated: true, when: () => true, make: () => ({ text: pick(['國際油價本週上漲 4%，分析師預估航空燃油附加費可能跟著調整。', '國際航空運輸協會預測，今年全球旅客運量可望創新高。', '多家航空公司宣布擴大永續航空燃油採購，減碳成為產業競爭新焦點。', '機場公司公布第三航廈工程進度，預計三年後完工啟用。']), sentiment: 0, virality: 0.4 }) },
    { cat: 'news', unrelated: true, when: () => Math.random() < 0.35, make: (c) => ({ text: `颱風逼近，氣象單位發布海上警報，${c.hub}多條航線可能受影響，旅客出發前請留意航班動態。`, sentiment: 0, virality: 0.8, opts: [R.waiver(sizeCost(250e3)), R.trend(0.3)] }) },
    { cat: 'news', unrelated: true, when: () => Math.random() < 0.4, make: () => ({ text: '連假將至，旅行社表示出國團報名人數較去年同期成長三成，熱門航線機位一位難求。', sentiment: 0, virality: 0.6, opts: [R.promoJump(), R.trend(0.75)] }) },
    { cat: 'kol', unrelated: true, when: () => true, make: () => ({ text: pick(['整理了 10 個轉機也能玩的城市，第 3 個很多人都不知道！', '開箱新款登機箱：超輕、可擴充，這次出國就靠它了', '航空公司的座位怎麼選？窗邊、走道、緊急出口一次比較', '跑道上的編號是什麼意思？飛機迷帶你看懂機場']), sentiment: 0, virality: 0.5, opts: Math.random() < 0.5 ? [R.trend(0.6)] : null }) },
    { cat: 'biz', unrelated: true, when: () => true, make: () => { const [author, text] = pick([[0, '北辰航空宣布引進 6 架新一代窄體客機，強化區域航網。'], [1, '南星航空會員制度改版，哩程累積門檻降低，老會員權益不變。'], [2, '環宇空廚取得國際食品安全認證，將擴大供應航空公司客戶。'], [3, '星辰飯店集團與多家航空公司合作推出聯名會員方案。'], [4, '雲端訂票網公布年度熱門目的地排行，日本與東南亞包辦前五名。'], [5, '海島旅行社秋冬團體行程開賣，早鳥優惠只到月底。']]); return { text, author: AUTHORS.biz[[3, 4, 1, 2, 5, 0][author]], sentiment: 0, virality: 0.3 }; } },
    { cat: 'public', unrelated: true, when: () => true, make: () => ({ text: pick(['今天機場好多人，安檢排了快一個小時 😩', '有人知道機上可以帶行動電源嗎？規定好像又改了', '在機場吃到超好吃的牛肉麵，候機時間突然變很短', '第一次自己出國，好緊張但好期待！', '靠窗位置看到的日落真的太美了']), sentiment: 0, virality: 0.2, opts: Math.random() < 0.3 ? [R.trend(0.55)] : null }) },
  ];

  function makePost(S, tpl, c) {
    const p = tpl.make(c);
    const [name, handle] = p.author || pick(AUTHORS[tpl.cat]);
    const size = 1 + S.fleet.length / 6 + S.routes.length / 10;
    const att = G.fmod('attention');
    const base = { news: 2500, kol: 6000, biz: 900, public: 400 }[tpl.cat];
    const reach = Math.round(base * (0.4 + p.virality) * (tpl.unrelated ? 1.5 : size * att) * rnd(0.6, 1.4));
    return {
      id: S.social.seq++, cat: tpl.cat, name, handle, text: p.text, t: S.time - Math.floor(rnd(0, 6.5) * DAY),
      related: !tpl.unrelated, sentiment: p.sentiment, virality: p.virality,
      likes: reach, shares: Math.round(reach * rnd(0.05, 0.2)), comments: Math.round(reach * rnd(0.03, 0.12)),
      opts: p.opts || null, answered: null,
    };
  }
  function generateWeek(S, first) {
    const c = context(S);
    const related = T.filter((t) => !t.unrelated && t.when(c));
    const unrelated = T.filter((t) => t.unrelated && t.when(c));
    const chosen = [...related.slice(0, 6)];
    // 每週補足 10–12 則，與公司無關的話題約佔一半
    let tries = 0;
    while (chosen.length < (first ? 8 : 11) && tries++ < 40) chosen.push(pick(unrelated));
    const seen = new Set(S.social.posts.slice(0, 30).map((p) => p.text));
    const posts = [];
    chosen.forEach((t) => { const p = makePost(S, t, c); if (!seen.has(p.text)) { seen.add(p.text); posts.push(p); } });
    posts.sort((a, b) => b.t - a.t);
    S.social.posts = [...posts, ...S.social.posts.filter((p) => p.own)].slice(0, 40);
  }

  // ---------- 玩家操作 ----------
  G.respondPost = (id, key) => {
    const S = G.S, p = S.social.posts.find((x) => x.id === id);
    if (!p || p.answered || !p.opts) return { ok: false };
    const o = p.opts.find((x) => x.key === key);
    const bonus = (G.founder().ancillary > 1 ? 0.1 : 0) + (S.rep - 50) / 500; // 旅遊業老手較懂公關
    const ok = Math.random() < clamp(o.success + bonus, 0.05, 0.98);
    const out = ok ? o.ok : o.fail;
    applyOutcome(S, out, 'reply');
    p.answered = { key, label: o.label, ok };
    const verdict = ok ? (p.sentiment < 0 ? '輿論逐漸平息' : '網友反應熱烈') : p.sentiment < 0 ? '回應被批評，爭議擴大' : '反應冷淡，甚至招來負評';
    G.log(`社群回應「${o.label}」：${verdict}`, ok ? 'info' : 'warn');
    return { ok: true, success: ok, verdict };
  };
  G.SOCIAL_POST_TYPES = {
    promo: { name: '限時促銷', desc: '一週內訂位 +12%，票價收益 −8%', effect: { demand: 1.12, yield: 0.92, days: 7, rep: 0.2 } },
    route: { name: '新航線宣傳', desc: '指定航線兩週內訂位 +15%，費用約 5 萬美元', needRoute: true, effect: { demand: 1.15, days: 14, cost: 50e3 } },
    csr: { name: '企業公益', desc: '捐助在地公益，社會評價 +2，費用依公司規模', effect: { rep: 2, demand: 1.02, days: 14 }, cost: 300e3 },
    staff: { name: '感謝員工', desc: '所有員工士氣 +3，社會評價小幅上升', effect: { morale: 3, rep: 0.5 } },
    safety: { name: '飛安宣導', desc: '飛安紀錄良好時加分；一年內有失事會被批評', effect: { rep: 1 } },
    free: { name: '一般動態', desc: '分享公司近況，影響很小', effect: { rep: 0.2 } },
  };
  G.SOCIAL_WEEKLY_LIMIT = 3;
  G.publishPost = ({ type, text, routeId }) => {
    const S = G.S, D = G.SOCIAL_POST_TYPES[type];
    if (!D) return { ok: false };
    if (S.social.postedThisWeek >= G.SOCIAL_WEEKLY_LIMIT) return { ok: false, msg: `本週已發布 ${G.SOCIAL_WEEKLY_LIMIT} 則，下週再發` };
    if (D.needRoute && !routeId) return { ok: false, msg: '請選擇要宣傳的航線' };
    const e = { ...D.effect };
    if (D.cost) e.cost = sizeCost(D.cost);
    if (e.cost && S.cash < e.cost) return { ok: false, msg: `資金不足，需要 ${G.money(e.cost)}` };
    let note = '';
    if (type === 'safety' && S.safety.lastCrash && S.time - S.safety.lastCrash < 365 * DAY) { e.rep = -3; note = '網友批評公司在失事後還高調宣傳飛安'; }
    if (type === 'free' && S.rep < 40 && Math.random() < 0.5) { e.rep = -0.5; note = '留言區湧入負評'; }
    if (routeId) e.route = routeId;
    const mul = 0.6 + S.rep / 100; // 評價越高，宣傳效果越好
    if (e.rep > 0) e.rep *= mul;
    applyOutcome(S, e, 'post');
    S.social.postedThisWeek++;
    const r = routeId && S.routes.find((x) => x.id === routeId);
    const body = (text || '').trim() || defaultText(type, r);
    const reach = Math.round(800 * (1 + S.fleet.length / 5) * G.fmod('attention') * mul * rnd(0.6, 1.5));
    S.social.posts.unshift({ id: S.social.seq++, cat: 'biz', own: true, name: S.company.name, handle: S.company.code.toLowerCase() + '_air', text: body, t: S.time, related: true, type, likes: reach, shares: Math.round(reach * 0.12), comments: Math.round(reach * 0.06), note });
    G.log(`在社群發布「${D.name}」${note ? '：' + note : ''}`, note ? 'warn' : 'info');
    return { ok: true, note };
  };
  function defaultText(type, r) {
    const co = G.S.company.name;
    return {
      promo: `${co}限時促銷開跑！本週訂位全航線享優惠，手刀搶購 ✈️`,
      route: r ? `${co}全新航線 ${r.a}–${r.b} 熱賣中，帶你輕鬆飛往${G.AP[r.b].city.replace(/\s*\(.*\)/, '')}！` : `${co}新航線熱賣中！`,
      csr: `${co}今年持續投入在地公益，與社區一起成長 💚`,
      staff: `謝謝每一位${co}夥伴，因為有你們，每一趟飛行都更安心。`,
      safety: `${co}堅持每一架飛機按時檢查，安全是我們最重要的承諾。`,
      free: `${co}感謝大家的支持，我們會繼續努力！`,
    }[type];
  }

  // ---------- 每日：到期影響、每週刷新 ----------
  G.socialDaily = () => {
    const S = G.S;
    if (!S.social) G.initSocial(S);
    const so = S.social;
    so.effects = so.effects.filter((e) => S.time < e.until);
    if (S.time < so.nextAt) return;
    // 上週沒有回應的負面話題：擴散力越高，傷害越大
    so.posts.filter((p) => p.related && !p.own && p.opts && !p.answered && p.sentiment < 0).forEach((p) => G.repDelta(-p.virality * 1.5));
    const ignored = so.posts.filter((p) => p.related && !p.own && p.opts && !p.answered && p.sentiment < 0).length;
    if (ignored) G.log(`上週有 ${ignored} 則負面話題沒有回應，社會評價下滑`, 'warn');
    generateWeek(S, false);
    so.snap = snapshot(S);
    so.week++; so.nextAt = S.time + WEEK; so.postedThisWeek = 0; so.repGain = 0;
    const mine = so.posts.filter((p) => p.related && !p.own && !p.answered && p.t > S.time - WEEK).length;
    G._emit('event', { kind: 'social', count: so.posts.length, mine });
  };
})();
