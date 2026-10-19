// v0.6.4 飛機整修：把機況拉回去，但不會回到 100%（機體老化，累計時數越多上限越低）。
// 機況越差，整修越吃重，需要越高等級的維修棚廠；自己的棚廠等級不夠就要委外，費用 ×1.5、工期 ×1.25。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  G.REFURB = {
    classes: [
      { min: 0.8, hangar: 0, name: '輕度整修', desc: '客艙翻新、線路與管路更換，線上維修即可' },
      { min: 0.65, hangar: 1, name: '中度整修', desc: '結構防蝕、起落架與系統大修，需要 1 級維修棚廠（C 檢能力）' },
      { min: 0, hangar: 2, name: '重度整修', desc: '主結構修補、全機拆解，需要 2 級維修棚廠（D 檢能力）' },
    ],
    outCost: 1.5, outDays: 1.25, k: 0.22, minGap: 0.02,
  };
  // 整修後能達到的機況上限：95% 起，每 6,000 飛行小時降 1%，最低 85%
  G.refurbCap = (ac) => clamp(0.95 - (ac.hours || 0) / 600000, 0.85, 0.95);
  G.refurbClass = (cond) => G.REFURB.classes.find((c) => cond >= c.min);
  // 在哪裡整修：hangarLv 是整修地點的棚廠等級（委外時傳 -1）
  G.refurbPlan = (ac, hangarLv) => {
    const t = G.TYPES[ac.type], cond = ac.cond != null ? ac.cond : 1, cap = G.refurbCap(ac), gap = cap - cond;
    if (gap < G.REFURB.minGap) return null;
    const cls = G.refurbClass(cond), out = hangarLv < cls.hangar;
    const valueNew = (t.used ? t.price / 0.5 : t.price) * 1e6;
    const cost = Math.round((valueNew * gap * G.REFURB.k * (out ? G.REFURB.outCost : 1)) / 1000) * 1000;
    const days = Math.ceil((5 + 70 * gap) * (out ? G.REFURB.outDays : 1));
    return { cond, cap, gap, cls, out, cost, days };
  };
  // 可以自己整修的樞紐（棚廠等級足夠），依距離排序
  G.refurbSites = (ac) => {
    const cls = G.refurbClass(ac.cond != null ? ac.cond : 1);
    const from = G.AP[ac.loc];
    return Object.keys(G.S.hubs).filter((k) => G.hangarLevel(k) >= cls.hangar).sort((a, b) => G.dist(from, G.AP[a]) - G.dist(from, G.AP[b]));
  };
  // 排入整修：at = 自己的樞紐（自修），或 null（委外，在下一個停靠的樞紐交給維修廠）
  G.queueRefurb = (acId, at) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId);
    if (!ac) return { ok: false, msg: '找不到這架飛機' };
    if (ac.st === 'refurb') return { ok: false, msg: '這架飛機正在整修' };
    const lv = at ? G.hangarLevel(at) : -1;
    const plan = G.refurbPlan(ac, lv);
    if (!plan) return { ok: false, msg: `機況 ${Math.round((ac.cond || 1) * 100)}% 已接近整修上限 ${Math.round(G.refurbCap(ac) * 100)}%，不需要整修` };
    if (at && plan.out) return { ok: false, msg: `${at} 的維修棚廠等級不足，${plan.cls.name}需要 ${plan.cls.hangar} 級` };
    if (S.cash < plan.cost) return { ok: false, msg: `整修需要 ${G.money(plan.cost)}，現金不足` };
    ac.refurbQueue = { at: at || null, cost: plan.cost, days: plan.days, out: plan.out };
    G.log(`${ac.reg} 排入${plan.cls.name}（${at ? `在 ${at} 自修` : '委外'}，${G.money(plan.cost)}、約 ${plan.days} 天，機況 ${Math.round(plan.cond * 100)}% → ${Math.round(plan.cap * 100)}%）`);
    return { ok: true, plan };
  };
  G.cancelRefurb = (acId) => {
    const ac = G.S.fleet.find((a) => a.id === acId);
    if (!ac || !ac.refurbQueue) return { ok: false, msg: '沒有排定的整修' };
    if (ac.st === 'refurb') return { ok: false, msg: '整修已經開工，無法取消' };
    ac.refurbQueue = null; G.log(`${ac.reg} 取消整修`);
    return { ok: true };
  };
  // 每次飛機可以出發時呼叫：還沒到整修地點就空機調過去；到了就開工
  G.refurbStep = (ac, startLeg) => {
    const S = G.S, q = ac.refurbQueue;
    const here = q.at ? ac.loc === q.at : !!S.hubs[ac.loc];
    if (here) { startRefurb(ac); return true; }
    const dest = q.at || G.nearestHub(ac.loc);
    const t = G.TYPES[ac.type];
    if (!dest || G.dist(G.AP[ac.loc], G.AP[dest]) > t.range) return false; // 飛不到就照常營運，等回到樞紐
    if (ac.route) { const r = S.routes.find((x) => x.id === ac.route); if (r && (r.a === dest || r.b === dest)) return false; } // 航線本來就會經過，等下一趟
    G.log(`${ac.reg} 空機調往 ${dest} 進行整修`);
    startLeg(ac, G.AP[ac.loc], G.AP[dest], S.time, true);
    return true;
  };
  function startRefurb(ac) {
    const S = G.S, q = ac.refurbQueue;
    // 實際開工時再確認一次：在自己的樞紐、棚廠等級足夠才算自修
    const plan = G.refurbPlan(ac, q.at ? G.hangarLevel(ac.loc) : -1) || { cost: q.cost, days: q.days, out: q.out, cap: ac.cond };
    if (ac.mode === 'buy') { G._spend(plan.cost, 'capex'); ac.cost = (ac.cost || 0) + plan.cost; ac.book = (ac.book || 0) + plan.cost; }
    else G._spend(plan.cost, 'refurb');
    ac.st = 'refurb'; ac.refurbUntil = S.time + plan.days * DAY; ac.leg = null;
    q.cap = plan.cap; q.out = plan.out;
    G.log(`${ac.reg} 在 ${ac.loc} 開始${plan.out ? '委外' : '自行'}整修，預計 ${plan.days} 天`);
  }
  G.finishRefurb = (ac) => {
    const q = ac.refurbQueue || {};
    const before = ac.cond;
    ac.cond = Math.max(ac.cond || 0, q.cap || G.refurbCap(ac));
    ac.refurbQueue = null; ac.st = 'turn'; ac.readyAt = G.S.time;
    G.log(`${ac.reg} 整修完成，機況 ${Math.round(before * 100)}% → ${Math.round(ac.cond * 100)}%`);
  };
})();
