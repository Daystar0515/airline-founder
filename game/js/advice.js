// v0.8.0 機型建議：航線需求變大（載客率高、票價已拉高）時建議換大飛機；需求不足或虧損時建議換小飛機。
// 機隊裡有合適的閒置飛機就直接提醒「換上這架」；沒有的話，在航線上標示可以買或租哪種機型。
(function () {
  const G = window.G;
  const DAY = 86400000;
  G.ADVICE = { upLF: 0.82, downLF: 0.6, minGain: 3000, minRatio: 0.15, upSeats: 1.15, downSeats: 0.85 };
  // 最近約 30 天的載客率、航班數與直接損益
  G.route30 = (r) => {
    const st = r.stats || {}, last = r.hist && r.hist[r.hist.length - 1];
    let pax = st.pax || 0, seats = st.seats || 0, rev = st.rev || 0, cost = st.cost || 0, flights = st.flights || 0;
    if (flights < 20 && last) { const w = Math.min(1, (20 - flights) / Math.max(1, last.flights || 1)); pax += last.pax * w; seats += last.seats * w; rev += last.rev * w; cost += last.cost * w; flights += last.flights * w; }
    return { lf: seats ? pax / seats : 0, flights, rev, cost, profit: rev - cost };
  };
  const ownFreq = (ac, r) => { const t = G.TYPES[ac.type]; return 1440 / (2 * (G.blockMinutes(t, G.legKm(G.AP[r.a], G.AP[r.b])) + G.turnMinutes(t))); };
  const capDaily = (ac) => (ac.mode === 'lease' ? ac.lease / 30 : G.leaseMonthly(G.TYPES[ac.type]) / 30); // 自有飛機用同機型月租當資金成本
  G.sizeAdvice = (r) => {
    const acs = G.routeAircraft(r).filter((ac) => !ac.grounded && !ac.charter);
    if (!acs.length) return null;
    const m = G.route30(r);
    if (m.flights < 6) return null;
    const A = G.ADVICE;
    let dir = null;
    // 自動定價會用漲價消化多出來的需求，所以「載客率高」或「經濟艙票價已拉到參考價 115% 以上」都算需求旺盛
    if (m.lf >= A.upLF || (m.lf >= 0.75 && (r.fare.Y || 1) >= 1.15)) dir = 'up';
    else if (m.lf <= A.downLF || m.profit < 0) dir = 'down';
    if (!dir) return null;
    // 要換掉的飛機：換大時挑最小的，換小時挑最大的
    acs.sort((x, y) => G.cabinSeats(x.cabin) - G.cabinSeats(y.cabin));
    const cur = dir === 'up' ? acs[0] : acs[acs.length - 1], seats0 = G.cabinSeats(cur.cabin);
    const extra = Math.max(0, G.routeFreq(r) - ownFreq(cur, r));
    const base = G.estimateAircraftOnRoute(cur, r.a, r.b, extra);
    const fit = (s) => (dir === 'up' ? s >= seats0 * A.upSeats : s <= seats0 * A.downSeats);
    const AP = G.AP[r.a], BP = G.AP[r.b];
    // 1. 機隊裡的閒置飛機
    const idle = G.idleAircraft().filter((ac) => fit(G.cabinSeats(ac.cabin)) && !G.canFly(G.TYPES[ac.type], AP, BP))
      .map((ac) => { const e = G.estimateAircraftOnRoute(ac, r.a, r.b, extra); return { ac, gain: e.daily.profit - base.daily.profit, profit: e.daily.profit }; })
      .filter((x) => x.gain > Math.max(A.minGain, A.minRatio * Math.abs(base.daily.profit))).sort((x, y) => y.gain - x.gain);
    // 2. 可以買或租的機型（預設艙等；扣掉租金或資金成本）
    const curNet = base.daily.profit - capDaily(cur);
    const types = window.AIRCRAFT.filter((t) => !t.used && !t.only && fit(G.cabinSeats(G.defaultCabin(t))) && !G.canFly(t, AP, BP))
      .map((t) => { const e = G.estimateAircraftOnRoute({ type: t.id, cabin: G.defaultCabin(t) }, r.a, r.b, extra); return { t, gain: e.daily.profit - G.leaseMonthly(t) / 30 - curNet }; })
      .filter((x) => x.gain > Math.max(A.minGain, A.minRatio * Math.abs(curNet))).sort((x, y) => y.gain - x.gain);
    if (!idle.length && !types.length) return null;
    return { dir, lf: m.lf, cur, curProfit: base.daily.profit, idle: idle.slice(0, 3), type: types[0] || null, t: G.S.time };
  };
  // 每週一重新評估所有航線；有合適的閒置飛機時提醒
  G.adviceWeekly = (part) => {
    const S = G.S;
    S.routes.forEach((r) => {
      if (part != null && r.id % 7 !== part) return; // v1.0 效能：分散到一週七天，每天評估七分之一的航線
      const prev = r.advice;
      let a = null;
      try { a = G.sizeAdvice(r); } catch (e) { a = null; }
      r.advice = a ? { dir: a.dir, lf: a.lf, cur: a.cur.id, curProfit: a.curProfit, idle: a.idle.map((x) => ({ id: x.ac.id, gain: x.gain })), type: a.type ? { id: a.type.t.id, gain: a.type.gain } : null, t: a.t } : null;
      if (a && a.idle.length && !(prev && prev.idle && prev.idle[0] && prev.idle[0].id === a.idle[0].ac.id)) {
        const x = a.idle[0], t = G.TYPES[x.ac.type];
        const text = `${r.a}–${r.b} ${a.dir === 'up' ? '需求旺盛' : '需求不足'}：可以把 ${a.cur.reg} 換成閒置的 ${x.ac.reg}（${t.model}），預估每日${a.dir === 'up' ? '多賺' : '少虧'} ${G.money(x.gain)}`;
        G.log(text);
        G._emit('event', { kind: 'size-advice', text, route: r.id });
      }
    });
  };
  G.adviceDaily = () => { const S = G.S; G.adviceWeekly(new Date(S.time - DAY / 2).getUTCDay()); };
  // 換機：閒置飛機接手，原本的飛機解除指派
  G.swapAircraft = (routeId, oldId, newId) => {
    const S = G.S, r = S.routes.find((x) => x.id === routeId), nac = S.fleet.find((a) => a.id === newId), oac = S.fleet.find((a) => a.id === oldId);
    if (!r || !nac || !oac) return { ok: false, msg: '找不到航線或飛機' };
    const x = G.assign(newId, routeId);
    if (!x.ok) return x;
    G.assign(oldId, null);
    if (r.autoFare && G.optimizeFares) G.optimizeFares(r);
    r.advice = null;
    G.log(`${r.a}–${r.b} 改由 ${nac.reg}（${G.TYPES[nac.type].model}）執飛，${oac.reg} 轉為閒置`);
    return { ok: true };
  };
})();
