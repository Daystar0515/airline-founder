// v1.2.0 航線調度工具：一組飛機的航線貢獻估算、換機建議（收益提升或虧損減少超過 20%）、
// 批次自動指派閒置飛機、開航規劃、航線總表的批次動作、飛機使用率。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const isPax = (ac) => !G.TYPES[ac.type].freighter;
  const flying = (ac) => !(ac.st === 'maint' || ac.st === 'aog' || ac.st === 'refit' || ac.st === 'refurb' || ac.grounded);
  const perFreq = (t, dk) => 1440 / (2 * (G.blockMinutes(t, dk) + G.turnMinutes(t)));
  const sig = (ac) => ac.type + '|' + G.CLASSES.map((c) => (ac.cabin[c] ? ac.cabin[c].seats + ':' + ac.cabin[c].tier : 0)).join(',');
  const pairRoute = (a, b) => G.S.routes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const capDaily = (ac) => (ac.mode === 'lease' ? ac.lease / 30 : G.leaseMonthly(G.TYPES[ac.type]) / 30); // 自有飛機用同機型月租當資金成本

  G.ADVICE = Object.assign(G.ADVICE || {}, { minRatio: 0.2, minGain: 1000, seatDiff: 0.08, budgetMs: 40, typesEach: 3, sigsEach: 3 });

  // ---------- 一組飛機在某航線的每日直接貢獻（票價自動最佳化）----------
  // 與 estimateAircraftOnRoute 同一套需求與成本公式；多架飛機時依各自班次加權分攤需求
  G.routeSetProfit = (a, b, acs) => {
    acs = acs.filter((ac) => isPax(ac) && ac.cabin);
    const A = G.AP[a], B = G.AP[b];
    if (!acs.length) return { rev: 0, cost: 0, profit: 0, freq: 0, lf: 0 };
    const d = G.dist(A, B), dk = G.legKm(A, B);
    const per = acs.map((ac) => perFreq(G.TYPES[ac.type], dk)), freq = sum(per);
    const ex = pairRoute(a, b);
    const r = { id: ex ? ex.id : -1, a, b, fare: ex ? { ...ex.fare } : { F: 1, J: 1, W: 1, Y: 1 }, fareCap: ex && ex.fareCap, brand: ex && ex.brand, stats: ex && ex.stats, hist: ex && ex.hist };
    const res = G._bestFares(r, acs.map((ac, i) => ({ ac, w: per[i] / freq })), freq);
    let rev = 0, pax = 0, seats = 0, cost = 0;
    G.CLASSES.forEach((c) => { if (res[c]) rev += res[c].rev || 0; });
    acs.forEach((ac, i) => {
      const t = G.TYPES[ac.type];
      let p = 0, s = 0;
      G.CLASSES.forEach((c) => { const k = ac.cabin[c]; if (!k || !k.seats) return; s += k.seats; p += ((res[c] && res[c].lf) || 0) * k.seats; });
      pax += p * per[i]; seats += s * per[i];
      cost += G.estFlightCost(t, d, p, G.blockMinutes(t, dk) / 60) * per[i] * 2;
    });
    rev *= freq * 2;
    return { rev, cost, profit: rev - cost, freq, lf: seats ? pax / seats : 0, fares: res };
  };
  const routeSet = (r) => G.routeAircraft(r).filter((ac) => isPax(ac) && flying(ac));
  const canOn = (ac, r) => !G.canFly(G.TYPES[ac.type], G.AP[r.a], G.AP[r.b]) && !(G.slotWhy && G.slotWhy(ac, r));
  // 換機：換下的飛機會讓出時刻帶，所以新飛機每天的來回數不多於舊飛機時，不必另外買時刻帶
  const canSwapOn = (ac, cur, r) => {
    const t = G.TYPES[ac.type];
    if (G.canFly(t, G.AP[r.a], G.AP[r.b])) return false;
    if (!G.slotWhy || !G.slotWhy(ac, r)) return true;
    const dk = G.legKm(G.AP[r.a], G.AP[r.b]);
    return perFreq(t, dk) <= perFreq(G.TYPES[cur.type], dk) + 0.01;
  };
  const seatsOf = (ac) => G.cabinSeats(ac.cabin);
  const differs = (x, y) => Math.abs(seatsOf(x) - seatsOf(y)) >= G.ADVICE.seatDiff * Math.max(seatsOf(x), seatsOf(y)) || x.type !== y.type;
  const thr = (b) => Math.max(G.ADVICE.minGain, G.ADVICE.minRatio * Math.abs(b));
  // 同一種「機型＋艙等」只估一次；挑座位數最接近目前飛機、較大與較小各 n 種
  function nearest(reps, cur, n) {
    const s0 = seatsOf(cur);
    const big = reps.filter((x) => seatsOf(x) >= s0).sort((x, y) => seatsOf(x) - seatsOf(y)).slice(0, n);
    const small = reps.filter((x) => seatsOf(x) < s0).sort((x, y) => seatsOf(y) - seatsOf(x)).slice(0, n);
    return big.concat(small);
  }
  function groupSig(list) {
    const m = new Map();
    list.forEach((ac) => { const k = sig(ac); if (!m.has(k)) m.set(k, []); m.get(k).push(ac); });
    return m;
  }

  // ---------- 換機建議 ----------
  // 換上另一架飛機（閒置、與其他航線對調，或租一架新的）能讓收益提升超過 20%，或讓虧損減少超過 20%，就提示「建議更換飛機」
  G.sizeAdvice = (r) => {
    const S = G.S;
    if (r.adviceOff) return null;
    const all = routeSet(r).filter((ac) => !ac.charter);
    if (!all.length) return null;
    const m = G.route30(r);
    if (m.flights < 6) return null;
    const base = G.routeSetProfit(r.a, r.b, all);
    const without = (cur) => all.filter((x) => x !== cur);
    const curs = [...groupSig(all).values()].map((g) => g[0]).slice(0, 2);
    const opts = [];
    const idle = groupSig(G.idleAircraft().filter((ac) => isPax(ac) && !G.canFly(G.TYPES[ac.type], G.AP[r.a], G.AP[r.b])));
    const others = groupSig(S.routes.filter((x) => x.id !== r.id && !x.gov).flatMap((x) => routeSet(x).filter((ac) => !ac.charter)));
    curs.forEach((cur) => {
      // 1. 機隊裡的閒置飛機
      nearest([...idle.values()].map((g) => g.find((ac) => ac.loc === r.a || ac.loc === r.b) || g[0]).filter((x) => differs(x, cur) && canSwapOn(x, cur, r)), cur, G.ADVICE.sigsEach).forEach((ac) => {
        const p = G.routeSetProfit(r.a, r.b, without(cur).concat(ac));
        const gain = p.profit - base.profit;
        if (gain > thr(base.profit)) opts.push({ kind: 'idle', cur: cur.id, ac: ac.id, gain, before: base.profit, after: p.profit });
      });
      // 2. 和其他航線的飛機對調（兩條航線合計）
      nearest([...others.values()].map((g) => g[0]).filter((x) => differs(x, cur) && canSwapOn(x, cur, r)), cur, G.ADVICE.sigsEach).forEach((rep) => {
        const p = G.routeSetProfit(r.a, r.b, without(cur).concat(rep));
        const gainR = p.profit - base.profit;
        if (gainR <= thr(base.profit)) return;
        const pool = others.get(sig(rep)).filter((ac) => { const r2 = S.routes.find((x) => x.id === ac.route); return r2 && canSwapOn(cur, ac, r2); }).slice(0, 3);
        pool.forEach((ac2) => {
          const r2 = S.routes.find((x) => x.id === ac2.route), set2 = routeSet(r2);
          const b2 = G.routeSetProfit(r2.a, r2.b, set2), p2 = G.routeSetProfit(r2.a, r2.b, set2.filter((x) => x !== ac2).concat(cur));
          const gain = gainR + (p2.profit - b2.profit);
          if (gain > thr(base.profit)) opts.push({ kind: 'swap', cur: cur.id, ac: ac2.id, r2: r2.id, gain, gainR, gain2: p2.profit - b2.profit, before: base.profit, after: p.profit });
        });
      });
      // 3. 租一架新的換上，換下的飛機出售或退租（比較扣掉租金或資金成本後的淨額）
      const AP = G.AP[r.a], BP = G.AP[r.b];
      const types = window.AIRCRAFT.filter((t) => !t.used && !t.freighter && !G.canFly(t, AP, BP)).map((t) => ({ id: -1, type: t.id, cabin: G.defaultCabin(t), mode: 'lease', lease: G.leaseMonthly(t) })).filter((x) => differs(x, cur) && canSwapOn(x, cur, r));
      const net0 = base.profit - capDaily(cur);
      nearest(types, cur, G.ADVICE.typesEach).forEach((x) => {
        const p = G.routeSetProfit(r.a, r.b, without(cur).concat(x));
        const gain = p.profit - x.lease / 30 - net0;
        if (gain > thr(net0)) opts.push({ kind: 'type', cur: cur.id, type: x.type, gain, before: net0, after: p.profit - x.lease / 30 });
      });
    });
    if (!opts.length) return null;
    opts.sort((x, y) => y.gain - x.gain);
    // 每種做法留最好的一個
    const seen = new Set(), list = opts.filter((o) => (seen.has(o.kind) ? false : seen.add(o.kind)));
    return { lf: m.lf, base: base.profit, opts: list, t: S.time, dir: seatsOfId(list[0]) > seatsOf(all.find((x) => x.id === list[0].cur)) ? 'up' : 'down' };
  };
  function seatsOfId(o) {
    if (o.kind === 'type') return G.cabinSeats(G.defaultCabin(G.TYPES[o.type]));
    const ac = G.S.fleet.find((x) => x.id === o.ac);
    return ac ? seatsOf(ac) : 0;
  }
  G.adviceText = (r, o) => {
    const S = G.S, cur = S.fleet.find((x) => x.id === o.cur);
    if (!cur) return '';
    const ct = G.TYPES[cur.type].model, pctTxt = o.before ? `（${o.before >= 0 ? '+' : '虧損 −'}${Math.round((Math.abs(o.gain) / Math.max(1, Math.abs(o.before))) * 100)}%）` : '';
    const more = o.after >= 0 && o.before >= 0 ? '多賺' : '改善';
    if (o.kind === 'idle') { const ac = S.fleet.find((x) => x.id === o.ac); return `把 ${cur.reg}（${ct}）換成閒置的 ${ac.reg}（${G.TYPES[ac.type].model}，${seatsOf(ac)} 座），每日${more} ${G.money(o.gain)}${pctTxt}`; }
    if (o.kind === 'swap') { const ac = S.fleet.find((x) => x.id === o.ac), r2 = S.routes.find((x) => x.id === o.r2); return `和 ${r2.a}–${r2.b} 對調飛機：${ac.reg}（${G.TYPES[ac.type].model}，${seatsOf(ac)} 座）來飛這條，${cur.reg}（${ct}）改飛 ${r2.a}–${r2.b}，兩條航線合計每日${more} ${G.money(o.gain)}${pctTxt}`; }
    const t = G.TYPES[o.type];
    return `租一架 ${t.model}（${G.cabinSeats(G.defaultCabin(t))} 座，月租 ${G.money(G.leaseMonthly(t))}）換下 ${cur.reg}（${ct}）${cur.mode === 'lease' ? '並退租' : '並出售'}，扣掉租金後每日${more} ${G.money(o.gain)}${pctTxt}`;
  };
  // 背景評估：每天在固定的時間預算內輪流評估幾條航線，約一到兩週輪完一次
  G.adviceDaily = () => {
    const S = G.S;
    if (!S.routes.length) return;
    const t0 = now();
    let i = S.advCur || 0, n = 0;
    while (n < S.routes.length && (n < 2 || now() - t0 < G.ADVICE.budgetMs)) {
      const r = S.routes[i % S.routes.length];
      i++; n++;
      if (r.advice && S.time - (r.advice.t || 0) < 6 * DAY) continue;
      G.refreshAdvice(r, true);
    }
    S.advCur = i % Math.max(1, S.routes.length);
  };
  G.refreshAdvice = (r, notify) => {
    const prev = r.advice;
    let a = null;
    try { a = G.sizeAdvice(r); } catch (e) { a = null; }
    r.advice = a;
    if (a && notify && !(prev && prev.opts && prev.opts[0] && prev.opts[0].kind === a.opts[0].kind && prev.opts[0].ac === a.opts[0].ac && prev.opts[0].type === a.opts[0].type)) {
      const text = `${r.a}–${r.b} 建議更換飛機：${G.adviceText(r, a.opts[0])}`;
      G.log(text);
      G._emit('event', { kind: 'size-advice', text, route: r.id });
    }
    return a;
  };
  // 接受建議：直接換好，不用到機隊重排
  G.applyAdvice = (routeId, k, opts) => {
    const S = G.S, r = S.routes.find((x) => x.id === routeId);
    if (!r || !r.advice || !r.advice.opts[k]) return { ok: false, msg: '建議已過期，請重新整理' };
    const o = r.advice.opts[k], cur = S.fleet.find((x) => x.id === o.cur);
    if (!cur || cur.route !== r.id) { r.advice = null; return { ok: false, msg: '執飛飛機已經變更，建議已失效' }; }
    let res;
    const swapIn = (nid) => { // 先讓出舊飛機（含時刻帶），換不上就換回去
      G.assign(cur.id, null);
      const y = G.assign(nid, r.id);
      if (!y.ok) G.assign(cur.id, r.id);
      return y;
    };
    if (o.kind === 'idle') {
      const nac = S.fleet.find((x) => x.id === o.ac);
      if (!nac || nac.route || nac.charter) { r.advice = null; return { ok: false, msg: '那架閒置飛機已經被指派，建議已失效' }; }
      res = swapIn(o.ac);
      if (res.ok) G.log(`${r.a}–${r.b} 改由 ${nac.reg}（${G.TYPES[nac.type].model}）執飛，${cur.reg} 轉為閒置`);
    }
    else if (o.kind === 'swap') {
      const ac2 = S.fleet.find((x) => x.id === o.ac), r2 = S.routes.find((x) => x.id === o.r2);
      if (!ac2 || !r2 || ac2.route !== r2.id) { r.advice = null; return { ok: false, msg: '對方航線的飛機已經變更，建議已失效' }; }
      G.assign(cur.id, null); G.assign(ac2.id, null);
      const x1 = G.assign(ac2.id, r.id), x2 = G.assign(cur.id, r2.id);
      if (!x1.ok || !x2.ok) { G.assign(ac2.id, null); G.assign(cur.id, null); G.assign(cur.id, r.id); G.assign(ac2.id, r2.id); return { ok: false, msg: (x1.ok ? x2 : x1).msg }; }
      G.log(`${r.a}–${r.b} 與 ${r2.a}–${r2.b} 對調飛機：${ac2.reg} ⇄ ${cur.reg}`);
      r2.advice = null;
      res = { ok: true };
    } else {
      const t = G.TYPES[o.type];
      const x = G.acquire(o.type, 'lease');
      if (!x.ok) return x;
      const y = swapIn(x.ac.id);
      if (!y.ok) { G.sellAircraft(x.ac.id); return y; }
      const keep = opts && opts.keep;
      if (!keep) {
        const z = G.sellAircraft(cur.id);
        if (!z.ok) { cur.sellOnLand = true; G.log(`${cur.reg} 落地後${cur.mode === 'lease' ? '退租' : '出售'}`); }
      }
      G.log(`${r.a}–${r.b} 改由新租的 ${x.ac.reg}（${t.model}）執飛`);
      res = { ok: true };
    }
    if (res.ok) { r.advice = null; G.routeVer++; if (r.autoFare && G.optimizeFares) G.optimizeFares(r); G._emit('fleet'); G._emit('routes'); }
    return res;
  };
  // 拒絕：這條航線不再提示（可以在航線詳細資料重新開啟）
  G.muteAdvice = (routeId, off) => {
    const r = G.S.routes.find((x) => x.id === routeId);
    if (!r) return { ok: false };
    r.adviceOff = off !== false;
    if (r.adviceOff) r.advice = null;
    return { ok: true };
  };

  // ---------- 批次自動指派閒置飛機 ----------
  // 每次挑「多指派一架飛機後，航線貢獻增加最多」的組合；剩下的飛機再從樞紐找還沒開的航線
  G.autoAssignPlan = (ids, o) => {
    const S = G.S;
    o = o || {};
    const pool = (ids ? S.fleet.filter((ac) => ids.includes(ac.id)) : G.idleAircraft()).filter((ac) => isPax(ac) && !ac.route && !ac.charter && !ac.grounded);
    const groups = groupSig(pool), left = new Map([...groups.entries()].map(([k, g]) => [k, g.slice()]));
    const sets = new Map(), base = new Map();
    const setOf = (r) => { if (!sets.has(r.id)) sets.set(r.id, routeSet(r).slice()); return sets.get(r.id); };
    const baseOf = (r) => { if (!base.has(r.id)) base.set(r.id, G.routeSetProfit(r.a, r.b, setOf(r)).profit); return base.get(r.id); };
    const minGain = o.minGain != null ? o.minGain : 500;
    const heap = [];
    const ver = new Map();
    const evalPair = (k, r) => {
      const rep = left.get(k)[0];
      if (!rep || !canOn(rep, r)) return null;
      const p = G.routeSetProfit(r.a, r.b, setOf(r).concat(rep)).profit;
      return p - baseOf(r);
    };
    [...left.keys()].forEach((k) => S.routes.forEach((r) => {
      if (r.gov && G.routeAircraft(r).length && false) return;
      const g = evalPair(k, r);
      if (g != null && g > minGain) heap.push({ k, r, g, v: 0 });
    }));
    const plan = [];
    while (heap.length) {
      heap.sort((x, y) => y.g - x.g);
      const top = heap.shift();
      if (!left.get(top.k).length) continue;
      if ((ver.get(top.r.id) || 0) !== top.v) { // 這條航線已經多了飛機：重算
        const g = evalPair(top.k, top.r);
        if (g != null && g > minGain) heap.push({ ...top, g, v: ver.get(top.r.id) || 0 });
        continue;
      }
      // 找一架飛機：優先已經在航線端點的
      const g = left.get(top.k), idx = Math.max(0, g.findIndex((ac) => ac.loc === top.r.a || ac.loc === top.r.b));
      const ac = g.splice(idx, 1)[0];
      plan.push({ ac: ac.id, route: top.r.id, gain: top.g });
      setOf(top.r).push(ac);
      base.set(top.r.id, baseOf(top.r) + top.g);
      ver.set(top.r.id, (ver.get(top.r.id) || 0) + 1);
      if (g.length) { const g2 = evalPair(top.k, top.r); if (g2 != null && g2 > minGain) heap.push({ k: top.k, r: top.r, g: g2, v: ver.get(top.r.id) }); }
    }
    // 剩下的飛機：從所在（或主要）樞紐找新航線
    const fresh = [];
    if (o.newRoutes !== false) {
      const taken = new Set();
      [...left.entries()].forEach(([k, g]) => {
        if (!g.length) return;
        const hub = S.hubs[g[0].loc] ? g[0].loc : G.primaryHub();
        const cands = G.planRoutes(hub, g[0], { limit: g.length + (o.extra || 6), scan: Math.max(70, g.length * 3) }).filter((c) => c.profit > minGain && !taken.has(hub + c.iata));
        while (g.length && cands.length) {
          const c = cands.shift(), ac = g.shift();
          taken.add(hub + c.iata);
          fresh.push({ ac: ac.id, a: hub, b: c.iata, gain: c.profit, fee: c.fee });
        }
      });
    }
    return { plan, fresh, left: [...left.values()].flat().map((ac) => ac.id), gain: sum(plan.map((x) => x.gain)) + sum(fresh.map((x) => x.gain)) };
  };
  G.applyAssignPlan = (P, pick) => {
    const S = G.S;
    let n = 0, opened = 0;
    const fails = [];
    P.plan.forEach((x, i) => { if (pick && !pick.has('p' + i)) return; const r = G.assign(x.ac, x.route); if (r.ok) n++; else fails.push(r.msg); });
    P.fresh.forEach((x, i) => {
      if (pick && !pick.has('f' + i)) return;
      let r = pairRoute(x.a, x.b);
      if (!r) { const o = G.openRoute(x.a, x.b); if (!o.ok) { fails.push(o.msg); return; } r = o.route; opened++; }
      const y = G.assign(x.ac, r.id);
      if (y.ok) n++; else fails.push(y.msg);
    });
    if (n || opened) G.log(`自動指派：${n} 架飛機${opened ? `，新開 ${opened} 條航線` : ''}`);
    G._emit('fleet'); G._emit('routes');
    return { ok: true, n, opened, fails };
  };

  // ---------- 開航規劃 ----------
  // 從樞紐出發、還沒開的目的地，依「這架飛機（或機型）每日航線貢獻」排序
  G.planRoutes = (hub, ref, o) => {
    const S = G.S;
    o = o || {};
    const A = G.AP[hub];
    if (!A || !ref) return [];
    const t = G.TYPES[ref.type];
    const served = new Set(S.routes.filter((r) => r.a === hub || r.b === hub).map((r) => (r.a === hub ? r.b : r.a)));
    const minD = o.minD || 0, maxD = o.maxD || Infinity;
    let cands = G.AIRPORTS.filter((x) => x.iata !== hub && !served.has(x.iata) && (!o.cc || x.cc === o.cc) && (!o.cont || G.continentOf(x) === o.cont));
    cands = cands.map((x) => ({ x, d: G.dist(A, x) })).filter((c) => c.d >= Math.max(150, minD) && c.d <= maxD && c.d <= t.range * 1.02);
    // 先用大圓距離與市場大小篩選，再對前段班計算實際航路（繞飛封閉空域的路徑計算較慢）
    cands = cands.filter((c) => !G.routeRoleWhy(A, c.x));
    cands.forEach((c) => (c.m = G.routeMarket(A, c.x)));
    cands.sort((p, q) => q.m - p.m);
    const scan = o.scan || 70, pool = [];
    for (const c of cands) { if (pool.length >= scan) break; if (!G.canFly(t, A, c.x)) pool.push(c); }
    const out = pool.map((c) => {
      const p = G.routeSetProfit(hub, c.x.iata, [ref]);
      // 新飛機：扣掉月租，以及人事、管理、保險、餐飲服務等間接成本（依公司近一個月每架飛機的平均估算）
      const cap = ref.id > 0 ? 0 : (ref.lease || G.leaseMonthly(t)) / 30 + G.indirectDaily(t);
      const rv = G.rivalsOn(hub, c.x.iata);
      const slot = G.isSlotAp && G.isSlotAp(c.x.iata) && !S.hubs[c.x.iata];
      return { iata: c.x.iata, ap: c.x, d: c.d, market: c.m, profit: p.profit - cap, lf: p.lf, rivals: rv.length, war: rv.some((x) => x.war), slot, curfew: !!G.curfew(c.x), fee: G.routeOpenFee(c.x) + G.routeOpenFee(A) / 2 };
    }).sort((p, q) => q.profit - p.profit);
    return out.slice(0, o.limit || 30);
  };
  // 每架飛機每天的間接成本（人事、管理、保險、餐飲與機上服務）：用公司最近一個月的平均；資料不足時用預設值
  G.indirectDaily = (t) => {
    const S = G.S, m = S.months && S.months[S.months.length - 1], n = S.fleet.length;
    const wide = t && t.wide ? 1.6 : 1;
    if (!m || n < 2) return 22000 * wide;
    const c = m.cost || {}, v = ['payroll', 'overhead', 'insurance', 'service', 'catering', 'hiring'].reduce((a, k) => a + (c[k] || 0), 0);
    return Math.max(8000, (v / n / 30) * wide);
  };
  G.continentOf = (ap) => { const c = window.CONTINENTS && window.CONTINENTS[ap.cc || ap]; return c ? c[0] : ''; };
  G.subregionOf = (ap) => { const c = window.CONTINENTS && window.CONTINENTS[ap.cc || ap]; return c ? c[1] : ''; };
  // 一次開多條航線，可同時指派閒置飛機
  G.openRoutesBulk = (hub, list, assign) => {
    const S = G.S;
    let opened = 0, n = 0;
    const fails = [];
    list.forEach((b) => {
      const o = G.openRoute(hub, b);
      if (!o.ok) { fails.push(`${b}：${o.msg}`); return; }
      opened++;
      if (assign) {
        const best = G.recommendIdle(hub, b).find((e) => isPax(e.ac) && !(G.slotWhy && G.slotWhy(e.ac, o.route)) && e.daily.profit > 0);
        if (best && G.assign(best.ac.id, o.route.id).ok) n++;
      }
    });
    return { ok: opened > 0, opened, n, fails, msg: fails[0] };
  };

  // ---------- 航線總表 ----------
  G.routeHealth = (r) => {
    const m = G.route30(r), acs = G.routeAircraft(r), rv = G.rivalsOn(r.a, r.b);
    const util = acs.length ? sum(acs.map((ac) => ac.uh || 0)) / acs.length : 0;
    const spill = m.flights >= 6 && (m.lf >= 0.9 || (m.lf >= 0.8 && (r.fare.Y || 1) >= 1.15));
    return { r, lf: m.lf, profit: m.profit, flights: m.flights, n: acs.length, freq: G.routeFreq(r), rivals: rv.length, war: rv.some((x) => x.war), loss: m.flights >= 6 && m.profit < 0, spill, empty: !acs.length, advice: !!(r.advice && r.advice.opts && r.advice.opts.length), util, d: G.dist(G.AP[r.a], G.AP[r.b]) };
  };
  G.bulkRoutes = (ids, action) => {
    const S = G.S;
    let n = 0;
    ids.forEach((id) => {
      const r = S.routes.find((x) => x.id === id);
      if (!r) return;
      if (action === 'close') { G.closeRoute(id); n++; }
      else if (action === 'autofare') { r.autoFare = true; if (G.optimizeFares) G.optimizeFares(r); n++; }
      else if (action === 'unassign') { G.routeAircraft(r).slice().forEach((ac) => G.assign(ac.id, null)); n++; }
      else if (action === 'advice') { if (r.advice && r.advice.opts.length && G.applyAdvice(id, 0).ok) n++; }
      else if (action === 'unmute') { r.adviceOff = false; n++; }
    });
    G._emit('routes'); G._emit('fleet');
    return { ok: true, n };
  };

  const fx0 = G.fixV10;
  G.fixV10 = (S) => { if (fx0) fx0(S); (S.routes || []).forEach((r) => { if (r.advice && !r.advice.opts) r.advice = null; }); };

  // ---------- 飛機使用率（每日飛行小時，指數平均）與落地後處分 ----------
  const d0 = G.ops10Daily;
  G.ops10Daily = () => {
    if (d0) d0();
    const S = G.S;
    S.fleet.slice().forEach((ac) => {
      const dh = ac._hp == null ? null : ac.hours - ac._hp;
      if (dh != null) ac.uh = ac.uh == null ? dh : ac.uh * 0.85 + dh * 0.15;
      ac._hp = ac.hours;
      if (ac.sellOnLand && ac.st !== 'air' && !ac.route) { ac.sellOnLand = false; G.sellAircraft(ac.id); }
    });
  };
})();
