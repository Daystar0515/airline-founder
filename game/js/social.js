// v0.4.2 社群媒體：新聞、自媒體、企業、民眾的貼文；公司回應、公司自行發文，以及對營運的影響。
// v1.0.0-rc2：改成每個遊戲月刷新一次（原本每週）；提到艙等時用玩家自訂的艙等名稱；貼文種類大幅增加；突發事件會出現即時新聞。
// 所有作者都是虛構的帳號與媒體，不代表任何真實個人或企業。
(function () {
  const G = window.G;
  const DAY = 86400000, MONTH = 30 * DAY;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nextMonth = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
  const cityOf = (iata) => (G.AP[iata] ? G.AP[iata].city.replace(/\s*\(.*\)/, '') : iata);
  // 玩家自訂的艙等名稱（例如把商務艙改叫「皇璽艙」）
  G.cname = (c) => (G.S && G.S.company.cabinNames && G.S.company.cabinNames[c]) || G.CLASS_DEFAULT_NAME[c];

  G.SOCIAL_CATS = { news: { name: '新聞', color: '#2f6fde' }, kol: { name: '自媒體', color: '#a24bd6' }, biz: { name: '企業', color: '#0f8a6a' }, public: { name: '民眾', color: '#d9822b' } };
  const AUTHORS = {
    news: [['環球航空新聞網', 'aviationdaily'], ['財經快報', 'finflash'], ['旅遊週刊', 'travelweekly'], ['每日新聞台', 'dailynews'], ['產業觀察報', 'industrywatch'], ['晨間國際', 'morningworld'], ['城市生活誌', 'citylife']],
    kol: [['飛機迷阿傑', 'planespotter_j'], ['旅行吃貨小米', 'foodie.mi'], ['哩程達人 Max', 'milesmax'], ['航空觀察室', 'av_observer'], ['背包客小安', 'backpacker_an'], ['商務艙研究所', 'bizclass.lab'], ['親子出遊 Ivy', 'ivy.familytrip'], ['機長日常', 'captain.daily']],
    biz: [['海島旅行社', 'islandtours'], ['環宇空廚', 'globalcatering'], ['星辰飯店集團', 'starhotels'], ['北辰航空', 'polaris_air'], ['南星航空', 'southstar_air'], ['雲端訂票網', 'cloudtrip'], ['銀翼信用卡', 'silverwing_card'], ['旅安保險', 'safetrip_ins']],
    public: [['王小明', 'xm_wang'], ['陳佳慧', 'jiahui.c'], ['林大偉', 'dw_lin'], ['旅人 Amy', 'amy_on_the_go'], ['張志豪', 'chihao_z'], ['匿名旅客', 'anon_traveler'], ['李曉雯', 'hsiaowen'], ['黃柏翰', 'pohan.h'], ['吳宜蓁', 'yichen.wu'], ['蔡承恩', 'chengen_t'], ['周芷若', 'zhiruo.z'], ['劉家豪', 'liu.jh']],
  };

  // ---------- 狀態 ----------
  const blank = (S) => ({ v2: true, month: 0, week: 0, nextAt: nextMonth(S.time), posts: [], effects: [], postedThisMonth: 0, seq: 1, snap: snapshot(S) });
  function snapshot(S) {
    return { t: S.time, delays: S.safety.delays, emergencies: S.safety.emergencies, crashes: S.safety.crashes, routes: S.routes.map((r) => r.id), fleet: S.fleet.length, types: [...new Set(S.fleet.map((a) => a.type))], hubs: Object.keys(S.hubs), rep: S.rep, cash: S.cash, price: S.fin && S.fin.stock ? S.fin.stock.price : null, gov: S.stats ? S.stats.govDone || 0 : 0, pax: S.stats ? S.stats.pax || 0 : 0, ally: S.ally ? S.ally.status : null, loyalty: !!S.loyalty };
  }
  G.initSocial = (S) => { if (!S.social) { S.social = blank(S); generate(S, true); } };
  // 舊存檔（每週刷新）改成每月刷新
  function upgrade(so, S) {
    if (so.v2) return;
    so.v2 = true; so.month = so.month || 0; so.nextAt = nextMonth(S.time); so.postedThisMonth = so.postedThisWeek || 0;
    so.snap = { ...snapshot(S), ...so.snap, types: [...new Set(S.fleet.map((a) => a.type))], hubs: Object.keys(S.hubs) };
  }

  // ---------- 影響：攬客倍率與票價收益倍率 ----------
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
  function addEffect(S, e) { S.social.effects.push({ ...e, until: S.time + (e.days || 14) * DAY }); }
  function applyOutcome(S, o, source) {
    if (o.cost) G._spend(o.cost, 'marketing');
    // 正面效果邊際遞減：評價越高越難再往上推；同一個月累積的正面加分也有上限
    if (o.rep > 0) {
      const so = S.social, room = Math.max(0, 6 - (so.repGain || 0));
      const v = Math.min(room, o.rep * Math.max(0.15, (100 - S.rep) / 50));
      so.repGain = (so.repGain || 0) + v;
      if (v > 0) G.repDelta(v);
    } else if (o.rep) G.repDelta(o.rep);
    if (o.demand || o.yield) addEffect(S, { demand: o.demand, yield: o.yield, route: o.route, days: o.days, source });
    if (o.morale) G.STAFF_GROUPS.forEach((g) => (S.hr.groups[g].morale = clamp(S.hr.groups[g].morale + o.morale, 0, 100)));
    if (o.stock && G.stockShock) G.stockShock(o.stock);
  }
  G.socialEffect = (o) => { const S = G.S; if (!S.social) G.initSocial(S); applyOutcome(S, o, 'event'); };

  // ---------- 這個月公司的狀況 ----------
  function classInfo(S) {
    const info = {};
    G.CLASSES.forEach((c) => {
      const acs = S.fleet.filter((a) => a.cabin && a.cabin[c] && a.cabin[c].seats > 0);
      if (!acs.length) return;
      info[c] = { n: acs.length, tier: acs.reduce((s, a) => s + a.cabin[c].tier, 0) / acs.length, wide: acs.some((a) => G.TYPES[a.type].wide) };
    });
    return info;
  }
  function context(S) {
    const sn = S.social.snap;
    const days = S.days.slice(-30);
    const sat = days.filter((d) => d.sat != null);
    const avgSat = sat.length ? sat.reduce((s, d) => s + d.sat, 0) / sat.length : null;
    const newRoutes = S.routes.filter((r) => !sn.routes.includes(r.id));
    const fares = S.routes.map((r) => r.fare.Y);
    const hub = G.AP[G.primaryHub()];
    const meals = S.catering ? S.catering.meals : {};
    const cls = classInfo(S);
    const types = [...new Set(S.fleet.map((a) => a.type))];
    const st = S.fin && S.fin.statements[S.fin.statements.length - 1];
    const wars = S.routes.filter((r) => G.rivalsOn && G.rivalsOn(r.a, r.b).some((x) => x.war));
    const old = S.fleet.filter((a) => a.cond != null && a.cond < 0.8).length;
    const ev = G.activeEvents ? G.activeEvents().filter((e) => G.eventHitsMe(e)) : [];
    const chef = ['F', 'J'].find((c) => cls[c] && meals[c] === 'chef');
    const hasW = !!cls.W, hasF = !!cls.F;
    return {
      co: S.company.name, code: S.company.code, hub: hub ? hub.city.replace(/\s*\(.*\)/, '') : '', hubIata: hub ? hub.iata : '',
      delays: S.safety.delays - sn.delays, emergencies: S.safety.emergencies - sn.emergencies, crashes: S.safety.crashes - sn.crashes,
      cancels: days.reduce((s, d) => s + (d.cancels || 0), 0), wx: days.reduce((s, d) => s + (d.wxCancels || 0), 0),
      newRoutes, newFleet: S.fleet.length - sn.fleet, newTypes: types.filter((t) => !(sn.types || []).includes(t)), avgSat, repUp: S.rep - sn.rep,
      newHubs: Object.keys(S.hubs).filter((h) => !(sn.hubs || []).includes(h)),
      cheap: fares.length && Math.min(...fares) <= 0.85, pricey: fares.length && Math.max(...fares) >= 1.25,
      strike: S.hr ? G.UNION_GROUPS.find((g) => S.hr.unions[g].strike) : null,
      demand: S.hr ? G.UNION_GROUPS.find((g) => S.hr.unions[g].demand) : null,
      lowMorale: S.hr ? G.STAFF_GROUPS.find((g) => S.hr.groups[g].morale < 40) : null,
      highMorale: S.hr ? G.STAFF_GROUPS.every((g) => S.hr.groups[g].morale >= 80) : false,
      listed: S.fin && S.fin.stock.listed, price: S.fin && S.fin.stock.price, priceWas: sn.price,
      budgetMeal: cls.Y && (meals.Y === 'none' || meals.Y === 'bob'), chef, hasW, hasF, cls,
      tightY: cls.Y && cls.Y.tier < 1, plushY: cls.Y && cls.Y.tier >= 3, flatJ: cls.J && cls.J.wide && cls.J.tier >= 3, poorJ: cls.J && cls.J.tier < 1.5,
      fleetSize: S.fleet.length, routeCount: S.routes.length,
      someRoute: S.routes.length ? pick(S.routes) : null, longRoute: S.routes.filter((r) => G.dist(G.AP[r.a], G.AP[r.b]) > 7000)[0] || null,
      ni: st ? st.ni : 0, rev: st ? st.rev : 0,
      govNew: (S.stats ? S.stats.govDone || 0 : 0) - (sn.gov || 0),
      paxMilestone: S.stats ? [1e6, 5e6, 1e7, 5e7, 1e8, 2e8, 5e8, 1e9].filter((m) => (S.stats.pax || 0) >= m && (sn.pax || 0) < m).pop() || 0 : 0,
      allyJoined: S.ally && S.ally.status === 'member' && sn.ally !== 'member' ? G.allyName() : null,
      loyaltyNew: S.loyalty && !sn.loyalty ? S.loyalty.name : null, loyaltyName: S.loyalty ? S.loyalty.name : null,
      wars, old, ev,
    };
  }
  const cn = (c) => G.cname(c);
  const pct = (x) => Math.round(x * 100);

  // 回應選項的共用組合
  const R = {
    apologize: (cost) => ({ key: 'apologize', label: '公開道歉並提出補償', hint: `花費約 ${G.money(cost)}，大多能平息爭議`, success: 0.85, ok: { cost, rep: 2.5 }, fail: { cost, rep: 0.5 } }),
    explain: () => ({ key: 'explain', label: '發布官方說明', hint: '不花錢，但可能被認為在卸責', success: 0.6, ok: { rep: 1.2 }, fail: { rep: -1.5 } }),
    rebut: () => ({ key: 'rebut', label: '強硬反駁', hint: '高風險：可能贏得支持，也可能引發更大的反彈', success: 0.35, ok: { rep: 2 }, fail: { rep: -5, stock: -0.03 } }),
    thank: () => ({ key: 'thank', label: '感謝並轉發', hint: '小幅提升好感與訂位', success: 0.95, ok: { rep: 0.6, demand: 1.03, days: 14 }, fail: { rep: 0 } }),
    reward: (cost) => ({ key: 'reward', label: '推出回饋優惠', hint: `花費約 ${G.money(cost)}，兩週內訂位增加`, success: 0.9, ok: { cost, rep: 0.8, demand: 1.06, days: 14 }, fail: { cost, rep: 0 } }),
    invite: (cost) => ({ key: 'invite', label: '邀請重新體驗', hint: `招待費約 ${G.money(cost)}，對方可能改寫評價`, success: 0.65, ok: { cost, rep: 1.5, demand: 1.02, days: 14 }, fail: { cost, rep: -1 } }),
    trend: (good) => ({ key: 'trend', label: '跟上話題發文', hint: '蹭熱度：反應好時增加曝光，反應差時被說消費話題', success: good, ok: { rep: 0.5, demand: 1.04, days: 14 }, fail: { rep: -2 } }),
    waiver: (cost) => ({ key: 'waiver', label: '宣布免費改票', hint: `預估成本 ${G.money(cost)}，展現誠意`, success: 0.9, ok: { cost, rep: 2, demand: 0.98, days: 14 }, fail: { cost, rep: 0.5 } }),
    promoJump: () => ({ key: 'promo', label: '順勢推出限時促銷', hint: '兩週內訂位大增，但票價收益下降', success: 0.85, ok: { demand: 1.12, yield: 0.94, days: 14, rep: 0.3 }, fail: { demand: 1.04, yield: 0.94, days: 14 } }),
    upgrade: (cost) => ({ key: 'upgrade', label: '改善產品並公開承諾', hint: `花費約 ${G.money(cost)}，展現改進的決心`, success: 0.8, ok: { cost, rep: 1.8 }, fail: { cost, rep: 0.2 } }),
    collab: () => ({ key: 'collab', label: '邀請合作推出聯名活動', hint: '兩週內訂位小增，對方帶來新客群', success: 0.75, ok: { rep: 0.8, demand: 1.05, days: 14 }, fail: { rep: 0 } }),
    staffThanks: () => ({ key: 'staff', label: '轉發並感謝第一線員工', hint: '員工士氣 +3，評價小幅上升', success: 0.95, ok: { rep: 0.6, morale: 3 }, fail: { rep: 0 } }),
  };
  const sizeCost = (base) => base * Math.max(1, G.S.fleet.length / 3);
  const handle = () => G.S.company.code.toLowerCase() + '_air';

  // ---------- 貼文模板 ----------
  // related：與公司有關；sentiment：對公司的好感（−2 到 +2）；virality：擴散力（0–1）
  const T = [
    // ===== 與公司有關：負面 =====
    { cat: 'news', when: (c) => c.crashes > 0, make: (c) => ({ text: `【快訊】${c.co}客機失事，民航主管機關已成立專案小組調查，家屬要求公司說明維修紀錄。`, sentiment: -2, virality: 1, opts: [R.apologize(sizeCost(2e6)), R.explain()] }) },
    { cat: 'news', when: (c) => c.emergencies > 0, make: (c) => ({ text: `${c.co}本月發生 ${c.emergencies} 起機械故障緊急轉降事件，旅客驚魂未定，專家呼籲檢視維修制度。`, sentiment: -1.5, virality: 0.8, opts: [R.apologize(sizeCost(300e3)), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.delays >= 4, make: (c) => ({ text: `又延誤了！搭${c.co}在登機門等了三個小時，地勤只說「機械問題」，到底什麼時候才能飛？ #${c.co}延誤`, sentiment: -1, virality: 0.5, opts: [R.apologize(sizeCost(80e3)), R.explain(), R.rebut()] }) },
    { cat: 'news', when: (c) => c.cancels - c.wx >= 20, make: (c) => ({ text: `${c.co}本月取消 ${c.cancels - c.wx} 個航班，旅客抱怨臨時接到通知、改票大排長龍。`, sentiment: -1.2, virality: 0.6, opts: [R.waiver(sizeCost(200e3)), R.explain()] }) },
    { cat: 'public', when: (c) => c.wx >= 5, make: (c) => ({ text: `天氣不好航班取消可以理解，但${c.co}客服電話打了一小時都打不進去，改票系統也一直當機…`, sentiment: -0.6, virality: 0.35, opts: [R.waiver(sizeCost(100e3)), R.explain()] }) },
    { cat: 'news', when: (c) => c.strike, make: (c) => ({ text: `${c.co}${G.STAFF[c.strike].name}工會${G.S.hr.unions[c.strike].strike.active ? '罷工進入第 ' + Math.max(1, Math.ceil((G.S.time - G.S.hr.unions[c.strike].strike.start) / DAY)) + ' 天' : '宣布即將罷工'}，大批旅客行程受影響，勞資雙方各說各話。`, sentiment: -1.5, virality: 0.9, opts: [R.waiver(sizeCost(400e3)), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.lowMorale, make: (c) => ({ text: `朋友在${c.co}當${G.STAFF[c.lowMorale].name}，說公司薪水低、班表又排很滿，最近一堆人想離職…`, sentiment: -1, virality: 0.4, opts: [R.explain(), R.rebut()] }) },
    { cat: 'kol', when: (c) => c.budgetMeal && c.routeCount, make: (c) => ({ text: `搭了${c.co}，${cn('Y')}連一杯水都要另外付錢？這價位的服務只能說普普。完整開箱影片在主頁 ✈️`, sentiment: -0.8, virality: 0.6, opts: [R.invite(30e3), R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.tightY, make: (c) => ({ text: `${c.co}的${cn('Y')}座位也太窄了吧，膝蓋直接頂到前座，三個小時坐到腰痠背痛 😣`, sentiment: -0.8, virality: 0.45, opts: [R.upgrade(sizeCost(150e3)), R.explain(), R.rebut()] }) },
    { cat: 'kol', when: (c) => c.poorJ, make: (c) => ({ text: `花大錢買了${c.co}的${cn('J')}，結果座椅跟豪華一點的經濟座差不多，不推。`, sentiment: -0.9, virality: 0.55, opts: [R.invite(40e3), R.upgrade(sizeCost(250e3)), R.explain()] }) },
    { cat: 'public', when: (c) => c.pricey, make: (c) => ({ text: `${c.co}的票價也太貴了吧，同一天別家便宜快兩成，不懂誰會買。`, sentiment: -0.7, virality: 0.35, opts: [R.promoJump(), R.explain()] }) },
    { cat: 'news', when: (c) => c.avgSat != null && c.avgSat < 0.6, make: (c) => ({ text: `消費者團體公布最新航空服務調查，${c.co}旅客滿意度僅 ${pct(c.avgSat)} 分，敬陪末座。`, sentiment: -1.2, virality: 0.6, opts: [R.apologize(sizeCost(150e3)), R.explain(), R.rebut()] }) },
    { cat: 'kol', when: (c) => c.old >= 3, make: (c) => ({ text: `最近搭${c.co}遇到的飛機都有點舊，椅背螢幕不亮、置物櫃關不緊，讓人有點擔心維修狀況。`, sentiment: -0.9, virality: 0.5, opts: [R.upgrade(sizeCost(200e3)), R.explain(), R.rebut()] }) },
    { cat: 'news', when: (c) => c.ni < 0 && c.rev > 0 && c.listed, make: (c) => ({ text: `${c.co}上月虧損 ${G.money(-c.ni)}，分析師關注公司擴張速度與成本控管。`, sentiment: -0.8, virality: 0.45, opts: [R.explain(), R.rebut()] }) },
    { cat: 'news', when: (c) => c.listed && c.priceWas && c.price < c.priceWas * 0.85, make: (c) => ({ text: `${c.co}股價一個月重挫 ${pct(1 - c.price / c.priceWas)}%，投資人要求經營層說明。`, sentiment: -1, virality: 0.5, opts: [R.explain(), R.rebut()] }) },
    { cat: 'public', when: (c) => c.wars.length > 0, make: (c) => { const r = c.wars[0]; return { text: `${r.a}–${r.b} 最近好幾家在殺價，${c.co}跟對手比來比去，票價一天一個樣，到底什麼時候買最划算？`, sentiment: 0, virality: 0.3, opts: [R.promoJump(), R.trend(0.6)] }; } },
    // ===== 與公司有關：正面 =====
    { cat: 'news', when: (c) => c.newRoutes.length > 0, make: (c) => ({ text: `${c.co}宣布開航 ${c.newRoutes.map((r) => `${r.a}–${r.b}`).slice(0, 3).join('、')}${c.newRoutes.length > 3 ? ` 等 ${c.newRoutes.length} 條航線` : ''}，業者看好帶動${cityOf(c.newRoutes[0].b)}觀光商機。`, sentiment: 1, virality: 0.5, opts: [R.thank(), R.reward(sizeCost(60e3))] }) },
    { cat: 'biz', when: (c) => c.newRoutes.length > 0, make: (c) => ({ text: `恭喜 @${handle()} 新航線開航！本社即日起推出 ${cityOf(c.newRoutes[0].b)} 機加酒套裝行程，名額有限 🧳`, author: AUTHORS.biz[pick([0, 2, 5])], sentiment: 1, virality: 0.3, opts: [R.thank(), R.collab()] }) },
    { cat: 'public', when: (c) => c.avgSat != null && c.avgSat >= 0.8, make: (c) => ({ text: `第一次搭${c.co}，座位舒服、空服員很親切，準時抵達，下次還會再選！`, sentiment: 1, virality: 0.3, opts: [R.thank(), R.reward(sizeCost(40e3))] }) },
    { cat: 'kol', when: (c) => c.chef, make: (c) => ({ text: `${c.co}${cn(c.chef)}的主廚套餐真的有誠意，牛排火候比很多餐廳還好，這趟值了 🥩`, sentiment: 1.2, virality: 0.6, opts: [R.thank(), R.reward(sizeCost(50e3))] }) },
    { cat: 'kol', when: (c) => c.flatJ, make: (c) => ({ text: `開箱${c.co}${cn('J')}：可以完全躺平的座椅、獨立走道、夠大的置物空間，長程紅眼班睡得很好 😴`, sentiment: 1.1, virality: 0.6, opts: [R.thank(), R.collab()] }) },
    { cat: 'kol', when: (c) => c.hasF, make: (c) => ({ text: `人生第一次搭${c.co}${cn('F')}！一進機艙就有專屬服務員迎接，餐點可以隨時點，這體驗真的忘不了 ✨`, sentiment: 1.3, virality: 0.7, opts: [R.thank(), R.collab()] }) },
    { cat: 'public', when: (c) => c.hasW, make: (c) => ({ text: `這次加價升等到${c.co}${cn('W')}，座位寬很多、還有獨立置物空間，長程真的值得。`, sentiment: 0.8, virality: 0.3, opts: [R.thank()] }) },
    { cat: 'public', when: (c) => c.plushY, make: (c) => ({ text: `${c.co}的${cn('Y')}椅距比別家寬，螢幕也大，同樣價錢我會優先選他們。`, sentiment: 0.9, virality: 0.35, opts: [R.thank(), R.reward(sizeCost(40e3))] }) },
    { cat: 'kol', when: (c) => c.newFleet > 0, make: (c) => ({ text: `在${c.hubIata}拍到${c.co}的新飛機！塗裝很好看，這家最近擴張得很快 📸`, sentiment: 0.8, virality: 0.4, opts: [R.thank()] }) },
    { cat: 'kol', when: (c) => c.newTypes.length > 0, make: (c) => ({ text: `${c.co}的第一架 ${G.TYPES[c.newTypes[0]].model} 首航！飛機迷們已經在跑道旁卡好位了 🛫`, sentiment: 1, virality: 0.55, opts: [R.thank(), R.collab()] }) },
    { cat: 'news', when: (c) => c.newHubs.length > 0, make: (c) => ({ text: `${c.co}宣布以${cityOf(c.newHubs[0])}為新的樞紐，預計帶動當地就業與轉機客源。`, sentiment: 1, virality: 0.5, opts: [R.thank()] }) },
    { cat: 'news', when: (c) => c.listed && c.repUp > 3, make: (c) => ({ text: `${c.co}股價本月走強，法人看好評價回升帶動客源，目前每股 $${c.price.toFixed(2)}。`, sentiment: 1, virality: 0.4, opts: [R.thank()] }) },
    { cat: 'news', when: (c) => c.ni > 0 && c.rev > 0 && c.ni / c.rev > 0.12, make: (c) => ({ text: `${c.co}上月稅後淨利 ${G.money(c.ni)}，獲利率 ${pct(c.ni / c.rev)}%，表現優於多數同業。`, sentiment: 1, virality: 0.45, opts: [R.thank(), R.staffThanks()] }) },
    { cat: 'news', when: (c) => c.paxMilestone, make: (c) => ({ text: `${c.co}累計載客突破 ${c.paxMilestone >= 1e8 ? c.paxMilestone / 1e8 + ' 億' : c.paxMilestone / 1e4 + ' 萬'}人次，公司表示感謝旅客一路支持。`, sentiment: 1, virality: 0.5, opts: [R.thank(), R.reward(sizeCost(60e3))] }) },
    { cat: 'news', when: (c) => c.allyJoined, make: (c) => ({ text: `${c.co}正式加入${c.allyJoined}，旅客可以累積與兌換盟友的里程，轉機也更方便。`, sentiment: 1.1, virality: 0.6, opts: [R.thank()] }) },
    { cat: 'kol', when: (c) => c.loyaltyNew, make: (c) => ({ text: `${c.co}推出會員方案「${c.loyaltyNew}」，整理了各等級福利，哪一級最划算？看完再決定要不要入會 💳`, sentiment: 0.7, virality: 0.5, opts: [R.thank(), R.collab()] }) },
    { cat: 'public', when: (c) => c.loyaltyName && Math.random() < 0.5, make: (c) => ({ text: `${c.loyaltyName}的會員升等好難喔，飛了一整年還差一點點才到下一級 😭`, sentiment: -0.2, virality: 0.2, opts: [R.reward(sizeCost(30e3)), R.explain()] }) },
    { cat: 'news', when: (c) => c.govNew > 0, make: (c) => ({ text: `${c.co}順利完成政府委託任務，主管機關肯定其執行能力。`, sentiment: 0.9, virality: 0.35, opts: [R.thank()] }) },
    { cat: 'public', when: (c) => c.highMorale, make: (c) => ({ text: `${c.co}的空服員每個都笑得很真誠，看得出來是真的喜歡這份工作，旅途心情也跟著變好。`, sentiment: 0.9, virality: 0.3, opts: [R.staffThanks(), R.thank()] }) },
    { cat: 'public', when: (c) => c.cheap, make: (c) => ({ text: `${c.co}現在的票價好划算！已經跟朋友約好連假出國 🎉`, sentiment: 0.8, virality: 0.3, opts: [R.thank(), R.promoJump()] }) },
    { cat: 'public', when: (c) => c.someRoute, make: (c) => ({ text: `下個月要飛 ${c.someRoute.a}–${c.someRoute.b}，有人搭過${c.co}嗎？想知道行李額度跟${cn('Y')}的座位寬度。`, sentiment: 0, virality: 0.15, opts: [R.thank()] }) },
    { cat: 'kol', when: (c) => c.longRoute, make: (c) => ({ text: `實測${c.co} ${c.longRoute.a}–${c.longRoute.b} 超長程航班：怎麼睡、吃什麼、怎麼調時差，一篇整理給大家。`, sentiment: 0.5, virality: 0.45, opts: [R.thank(), R.collab()] }) },
    // ===== 突發事件延燒的討論 =====
    { cat: 'public', when: (c) => c.ev.some((e) => e.type === 'oil-up'), make: (c) => ({ text: `燃油附加費又漲了！${c.co}一張來回多了快一千塊，還要不要出國啊…`, sentiment: -0.4, virality: 0.4, opts: [R.promoJump(), R.explain()] }) },
    { cat: 'kol', when: (c) => c.ev.some((e) => e.type === 'oil-down'), make: (c) => ({ text: '油價跌了，燃油附加費也降了，現在是買長程機票的好時機！整理幾條我最推的航線 👇', sentiment: 0.3, virality: 0.5, opts: [R.trend(0.7), R.promoJump()] }) },
    { cat: 'public', when: (c) => c.ev.some((e) => e.type === 'outbreak'), make: (c) => ({ text: `疫情又升溫，${c.co}的退票規定到底怎麼算？客服說要看票種，好複雜。`, sentiment: -0.6, virality: 0.5, opts: [R.waiver(sizeCost(200e3)), R.explain()] }) },
    { cat: 'public', when: (c) => c.ev.some((e) => e.type === 'unrest' || e.type === 'diplomacy'), make: (c) => { const e = c.ev.find((x) => x.type === 'unrest' || x.type === 'diplomacy'); return { text: `${e.title}，原本訂好的行程要不要取消？${c.co}有沒有提供退票？`, sentiment: -0.4, virality: 0.4, opts: [R.waiver(sizeCost(150e3)), R.explain()] }; } },
    { cat: 'kol', when: (c) => c.ev.some((e) => e.type === 'boom' || e.type === 'expo'), make: (c) => { const e = c.ev.find((x) => x.type === 'boom' || x.type === 'expo'); return { text: `${e.title}！整理交通、住宿與機票攻略，${c.co}也有直飛可以參考 ✈️`, sentiment: 0.6, virality: 0.55, opts: [R.collab(), R.thank()] }; } },
    { cat: 'public', when: (c) => c.ev.some((e) => e.type === 'storm' || e.type === 'volcano' || e.type === 'atc'), make: (c) => ({ text: `被困在機場了…${c.co}說天候因素不負責住宿，只能睡長椅 😮‍💨`, sentiment: -0.7, virality: 0.45, opts: [R.apologize(sizeCost(60e3)), R.explain()] }) },
    { cat: 'news', when: (c) => c.ev.some((e) => e.type === 'recession'), make: (c) => ({ text: `景氣轉弱，企業砍差旅預算，各航空公司${cn('J')}與頭等座位的訂位都明顯下滑。`, sentiment: 0, virality: 0.4, opts: null }) },
    // ===== 與公司無關：產業與社會話題 =====
    { cat: 'news', unrelated: true, when: () => true, make: () => ({ text: pick(['國際航空運輸協會預測，今年全球旅客運量可望創新高。', '多家航空公司宣布擴大永續航空燃油採購，減碳成為產業競爭新焦點。', '機場公司公布第三航廈工程進度，預計三年後完工啟用。', '民航主管機關宣布檢討機上行動電源規定，旅客出發前請留意最新公告。', '研究指出，自助報到與行李託運可為旅客平均節省 15 分鐘。', '飛機製造商表示交機延誤可能持續到明年，航空公司機隊擴張計畫受影響。', '機場捷運延伸線通車，往返市區與機場的時間縮短十分鐘。', '國際機場評比出爐，亞洲機場包辦前五名。']), sentiment: 0, virality: 0.4 }) },
    { cat: 'news', unrelated: true, when: () => Math.random() < 0.45, make: () => ({ text: pick(['連假將至，旅行社表示出國團報名人數較去年同期成長三成，熱門航線機位一位難求。', '暑假出國旺季開跑，熱門海島航線週末班機幾乎全滿。', '年終旅遊展登場，各家航空公司祭出早鳥優惠搶客。']), sentiment: 0, virality: 0.6, opts: [R.promoJump(), R.trend(0.75)] }) },
    { cat: 'kol', unrelated: true, when: () => true, make: () => ({ text: pick(['整理了 10 個轉機也能玩的城市，第 3 個很多人都不知道！', '開箱新款登機箱：超輕、可擴充，這次出國就靠它了', '航空公司的座位怎麼選？窗邊、走道、緊急出口一次比較', '跑道上的編號是什麼意思？飛機迷帶你看懂機場', '帶小孩搭長程飛機的 8 個生存技巧，第 5 個救了我', '哩程怎麼換最划算？三種兌換方式實測比較', '為什麼飛機起降時要把遮光板打開？機長來解答', '機上餐盲測：五家航空的經濟艙雞肉飯大比拼', '紅眼班怎麼睡得好？耳塞、眼罩、頸枕實測', '空服員不會告訴你的 7 件事']), sentiment: 0, virality: 0.5, opts: Math.random() < 0.5 ? [R.trend(0.6)] : null }) },
    { cat: 'biz', unrelated: true, when: () => true, make: () => { const [i, text] = pick([[3, '北辰航空宣布引進 6 架新一代窄體客機，強化區域航網。'], [4, '南星航空會員制度改版，哩程累積門檻降低，老會員權益不變。'], [1, '環宇空廚取得國際食品安全認證，將擴大供應航空公司客戶。'], [2, '星辰飯店集團與多家航空公司合作推出聯名會員方案。'], [5, '雲端訂票網公布年度熱門目的地排行，日本與東南亞包辦前五名。'], [0, '海島旅行社秋冬團體行程開賣，早鳥優惠只到月底。'], [6, '銀翼信用卡推出新卡，海外消費與機票回饋最高 5%。'], [7, '旅安保險提醒：班機延誤險理賠需保留登機證與延誤證明。'], [3, '北辰航空與南星航空宣布在三條國際線上代碼共享。']]); return { text, author: AUTHORS.biz[i], sentiment: 0, virality: 0.3 }; } },
    { cat: 'biz', unrelated: true, when: () => Math.random() < 0.35, make: () => ({ text: '銀翼信用卡誠徵航空公司夥伴推出聯名卡，刷卡累積哩程、機場貴賓室一次到位。', author: AUTHORS.biz[6], sentiment: 0, virality: 0.25, opts: [R.collab()] }) },
    { cat: 'public', unrelated: true, when: () => true, make: () => ({ text: pick(['今天機場好多人，安檢排了快一個小時 😩', '有人知道機上可以帶行動電源嗎？規定好像又改了', '在機場吃到超好吃的牛肉麵，候機時間突然變很短', '第一次自己出國，好緊張但好期待！', '靠窗位置看到的日落真的太美了', '轉機只有 50 分鐘，一路狂奔總算趕上 🏃', '行李箱被摔出一個大凹痕，心好痛', '隔壁小朋友整趟都很乖，還分我餅乾 🥹', '降落時全機鼓掌，好久沒遇到了', '終於集滿哩程換到一張免費機票！', '機上 Wi-Fi 慢到連訊息都傳不出去…', '在免稅店買到超便宜的香水，開心']), sentiment: 0, virality: 0.2, opts: Math.random() < 0.25 ? [R.trend(0.55)] : null }) },
    { cat: 'news', unrelated: true, when: (c) => c.hub && Math.random() < 0.3, make: (c) => ({ text: `${c.hub}機場擴建工程開工，未來尖峰時段起降容量可望增加兩成。`, sentiment: 0, virality: 0.35, opts: [R.trend(0.65)] }) },
  ];

  function makePost(S, tpl, c) {
    const p = tpl.make(c);
    const [name, h] = p.author || pick(AUTHORS[tpl.cat]);
    const size = 1 + S.fleet.length / 6 + S.routes.length / 10;
    const att = G.fmod('attention');
    const base = { news: 2500, kol: 6000, biz: 900, public: 400 }[tpl.cat];
    const reach = Math.round(base * (0.4 + p.virality) * (tpl.unrelated ? 1.5 : size * att) * rnd(0.6, 1.4));
    return {
      id: S.social.seq++, cat: tpl.cat, name, handle: h, text: p.text, t: S.time - Math.floor(rnd(0, 29) * DAY),
      related: !tpl.unrelated, sentiment: p.sentiment, virality: p.virality,
      likes: reach, shares: Math.round(reach * rnd(0.05, 0.2)), comments: Math.round(reach * rnd(0.03, 0.12)),
      opts: p.opts || null, answered: null,
    };
  }
  function generate(S, first) {
    const c = context(S);
    const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
    // 嚴重的事情（失事、轉降、罷工）優先；其他與公司有關的話題隨機挑
    const related = T.filter((t) => !t.unrelated && t.when(c));
    const chosen = [...related.slice(0, 3), ...shuffle(related.slice(3)).slice(0, first ? 3 : 6)];
    const unrelated = T.filter((t) => t.unrelated && t.when(c));
    const want = first ? 10 : 16;
    let tries = 0;
    while (chosen.length < want && tries++ < 60) chosen.push(pick(unrelated));
    const seen = new Set(S.social.posts.slice(0, 40).map((p) => p.text));
    const posts = [];
    chosen.forEach((t) => { const p = makePost(S, t, c); if (!seen.has(p.text)) { seen.add(p.text); posts.push(p); } });
    posts.sort((a, b) => b.t - a.t);
    // 留下自己發的文與這個月的即時新聞
    const keep = S.social.posts.filter((p) => p.own || (p.breaking && S.time - p.t < MONTH));
    S.social.posts = [...posts, ...keep].sort((a, b) => b.t - a.t).slice(0, 50);
  }
  // 突發事件的即時新聞（不等月初刷新）
  G.socialBreaking = (e, mine) => {
    const S = G.S;
    if (!S.social) return;
    const [name, h] = pick(AUTHORS.news.slice(0, 5));
    const reach = Math.round(3000 * (mine ? 1.6 : 1) * rnd(0.7, 1.4));
    S.social.posts.unshift({ id: S.social.seq++, cat: 'news', name, handle: h, text: `【${e.start > S.time ? '預告' : '快訊'}】${e.text}`, t: S.time, related: false, breaking: true, ev: e.id, sentiment: 0, virality: 0.6,
      likes: reach, shares: Math.round(reach * 0.15), comments: Math.round(reach * 0.08), opts: null, answered: null });
    S.social.posts = S.social.posts.slice(0, 50);
  };

  // ---------- 玩家操作 ----------
  G.respondPost = (id, key) => {
    const S = G.S, p = S.social.posts.find((x) => x.id === id);
    if (!p || p.answered || !p.opts) return { ok: false };
    const o = p.opts.find((x) => x.key === key);
    if (o.ok.cost && S.cash < o.ok.cost) return { ok: false, msg: `現金不足，需要 ${G.money(o.ok.cost)}` };
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
    promo: { name: '限時促銷', desc: '兩週內訂位 +12%，票價收益 −8%', effect: { demand: 1.12, yield: 0.92, days: 14, rep: 0.2 } },
    route: { name: '新航線宣傳', desc: '指定航線一個月內訂位 +15%，費用約 5 萬美元', needRoute: true, effect: { demand: 1.15, days: 30, cost: 50e3 } },
    csr: { name: '企業公益', desc: '捐助在地公益，社會評價 +2，費用依公司規模', effect: { rep: 2, demand: 1.02, days: 30 }, cost: 300e3 },
    staff: { name: '感謝員工', desc: '所有員工士氣 +3，社會評價小幅上升', effect: { morale: 3, rep: 0.5 } },
    safety: { name: '飛安宣導', desc: '飛安紀錄良好時加分；一年內有失事會被批評', effect: { rep: 1 } },
    cabin: { name: '艙等介紹', desc: '介紹自家艙等，一個月內訂位 +4%（評價越高效果越好）', needCabin: true, effect: { demand: 1.04, days: 30, rep: 0.4 } },
    free: { name: '一般動態', desc: '分享公司近況，影響很小', effect: { rep: 0.2 } },
  };
  G.SOCIAL_LIMIT = 5; // 每個月最多自行發文幾則
  G.SOCIAL_WEEKLY_LIMIT = G.SOCIAL_LIMIT; // 舊名稱（相容）
  G.socialPostsLeft = () => { const so = G.S.social; return Math.max(0, G.SOCIAL_LIMIT - (so.postedThisMonth || 0)); };
  G.publishPost = ({ type, text, routeId, cls }) => {
    const S = G.S, D = G.SOCIAL_POST_TYPES[type];
    if (!D) return { ok: false };
    upgrade(S.social, S);
    if (G.socialPostsLeft() <= 0) return { ok: false, msg: `這個月已發布 ${G.SOCIAL_LIMIT} 則，下個月再發` };
    if (D.needRoute && !routeId) return { ok: false, msg: '請選擇要宣傳的航線' };
    const e = { ...D.effect };
    if (D.cost) e.cost = sizeCost(D.cost);
    if (e.cost && S.cash < e.cost) return { ok: false, msg: `資金不足，需要 ${G.money(e.cost)}` };
    let note = '';
    if (type === 'safety' && S.safety.lastCrash && S.time - S.safety.lastCrash < 365 * DAY) { e.rep = -3; note = '網友批評公司在失事後還高調宣傳飛安'; }
    if (type === 'free' && S.rep < 40 && Math.random() < 0.5) { e.rep = -0.5; note = '留言區湧入負評'; }
    if (type === 'cabin' && S.rep < 40) { e.demand = 1.01; note = '網友留言：「先把服務做好再說吧」'; }
    if (routeId) e.route = routeId;
    const mul = 0.6 + S.rep / 100; // 評價越高，宣傳效果越好
    if (e.rep > 0) e.rep *= mul;
    applyOutcome(S, e, 'post');
    S.social.postedThisMonth = (S.social.postedThisMonth || 0) + 1;
    const r = routeId && S.routes.find((x) => x.id === routeId);
    const body = (text || '').trim() || defaultText(type, r, cls);
    const reach = Math.round(800 * (1 + S.fleet.length / 5) * G.fmod('attention') * mul * rnd(0.6, 1.5));
    S.social.posts.unshift({ id: S.social.seq++, cat: 'biz', own: true, name: S.company.name, handle: handle(), text: body, t: S.time, related: true, type, likes: reach, shares: Math.round(reach * 0.12), comments: Math.round(reach * 0.06), note });
    G.log(`在社群發布「${D.name}」${note ? '：' + note : ''}`, note ? 'warn' : 'info');
    return { ok: true, note };
  };
  // 機隊實際有的艙等（給「艙等介紹」選）
  G.ownedClasses = () => G.CLASSES.filter((c) => G.S.fleet.some((a) => a.cabin && a.cabin[c] && a.cabin[c].seats > 0));
  function defaultText(type, r, cls) {
    const co = G.S.company.name, c = cls || G.ownedClasses()[0] || 'Y';
    const cabinLine = { F: `${co}${cn('F')}：私人套房、隨點隨上的餐點，給您最頂級的旅程 ✨`, J: `${co}${cn('J')}：平躺座椅、優先登機與貴賓室，一覺醒來就到了。`, W: `${co}${cn('W')}：更寬的座位、更多伸腳空間，只要多一點點預算。`, Y: `${co}${cn('Y')}：舒適座椅與貼心服務，划算的價格也能飛得開心。` }[c];
    return {
      promo: `${co}限時促銷開跑！兩週內訂位全航線享優惠，手刀搶購 ✈️`,
      route: r ? `${co}全新航線 ${r.a}–${r.b} 熱賣中，帶你輕鬆飛往${cityOf(r.b)}！` : `${co}新航線熱賣中！`,
      csr: `${co}今年持續投入在地公益，與社區一起成長 💚`,
      staff: `謝謝每一位${co}夥伴，因為有你們，每一趟飛行都更安心。`,
      safety: `${co}堅持每一架飛機按時檢查，安全是我們最重要的承諾。`,
      cabin: cabinLine,
      free: `${co}感謝大家的支持，我們會繼續努力！`,
    }[type];
  }

  // ---------- 每日：到期影響、每月刷新 ----------
  G.socialDaily = () => {
    const S = G.S;
    if (!S.social) G.initSocial(S);
    const so = S.social;
    upgrade(so, S);
    so.effects = so.effects.filter((e) => S.time < e.until);
    if (S.time < so.nextAt) return;
    // 上個月沒有回應的負面話題：擴散力越高，傷害越大
    const ignoredPosts = so.posts.filter((p) => p.related && !p.own && p.opts && !p.answered && p.sentiment < 0);
    ignoredPosts.forEach((p) => G.repDelta(-p.virality * 1.5));
    if (ignoredPosts.length) G.log(`上個月有 ${ignoredPosts.length} 則負面話題沒有回應，社會評價下滑`, 'warn');
    generate(S, false);
    so.snap = snapshot(S);
    so.month = (so.month || 0) + 1; so.nextAt = nextMonth(S.time); so.postedThisMonth = 0; so.repGain = 0;
    const mine = so.posts.filter((p) => p.related && !p.own && !p.answered && p.t > S.time - MONTH).length;
    G._emit('event', { kind: 'social', count: so.posts.length, mine });
  };
})();
