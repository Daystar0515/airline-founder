// v0.6 營運工具：自訂航班編號、自訂飛機編號、依艙等自動最佳定價、推薦機隊內的閒置飛機。
(function () {
  const G = window.G;

  // ---------- 航班編號 ----------
  // 每條航線有去程與回程兩個數字，顯示時加上公司代碼，例如 PL101／PL102
  const usedNos = (exceptId) => {
    const s = new Set();
    G.S.routes.forEach((r) => { if (r.id !== exceptId && r.fno) { s.add(r.fno.out); s.add(r.fno.back); } });
    return s;
  };
  G.nextFlightNo = () => {
    const used = usedNos();
    for (let n = 101; n < 9998; n += 2) if (!used.has(n) && !used.has(n + 1)) return { out: n, back: n + 1 };
    return { out: 9001, back: 9002 };
  };
  G.checkFlightNo = (out, back, exceptId) => {
    if (!Number.isInteger(out) || !Number.isInteger(back) || out < 1 || back < 1 || out > 9999 || back > 9999) return '航班編號要是 1–9999 的整數';
    if (out === back) return '去程與回程的航班編號不能相同';
    const used = usedNos(exceptId);
    if (used.has(out)) return `${G.S.company.code}${out} 已經被其他航線使用`;
    if (used.has(back)) return `${G.S.company.code}${back} 已經被其他航線使用`;
    return null;
  };
  G.fno = (n) => `${G.S.company.code}${n}`;
  G.routeFno = (r) => (r.fno ? `${G.fno(r.fno.out)}／${r.fno.back}` : '');
  G.legFno = (ac) => {
    const L = ac.leg, r = L && G.S.routes.find((x) => x.id === ac.route);
    if (!L || !r || !r.fno || L.ferry) return '';
    return G.fno(L.from === r.a ? r.fno.out : r.fno.back);
  };
  G.setFlightNo = (rid, out, back) => {
    const r = G.S.routes.find((x) => x.id === rid);
    const why = G.checkFlightNo(out, back, rid);
    if (why) return { ok: false, msg: why };
    r.fno = { out, back };
    return { ok: true };
  };

  // ---------- 飛機編號 ----------
  G.normReg = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  G.checkReg = (reg, exceptId) => {
    if (!/^[A-Z0-9][A-Z0-9-]{1,9}$/.test(reg)) return '飛機編號限 2–10 個英文字母、數字或連字號，例如 B-58201';
    if (G.S.fleet.some((a) => a.id !== exceptId && a.reg === reg)) return `${reg} 已經有飛機使用`;
    return null;
  };
  G.renameAircraft = (acId, reg) => {
    const ac = G.S.fleet.find((a) => a.id === acId);
    reg = G.normReg(reg);
    const why = G.checkReg(reg, acId);
    if (why) return { ok: false, msg: why };
    G.log(`${ac.reg} 改編號為 ${reg}`);
    ac.reg = reg;
    return { ok: true };
  };
  // 各國常見的民航機國籍標誌，給玩家當參考
  G.REG_PREFIX = { TW: 'B-', CN: 'B-', HK: 'B-', MO: 'B-M', JP: 'JA', KR: 'HL', US: 'N', CA: 'C-', SG: '9V-', MY: '9M-', TH: 'HS-', VN: 'VN-', PH: 'RP-C', ID: 'PK-', IN: 'VT-', AU: 'VH-', NZ: 'ZK-', GB: 'G-', DE: 'D-', FR: 'F-', NL: 'PH-', AE: 'A6-', QA: 'A7-', TR: 'TC-', BR: 'PR-', MX: 'XA-' };
  G.regHint = () => {
    const ap = G.AP[G.primaryHub()], p = (ap && G.REG_PREFIX[ap.cc]) || '';
    const ex = { 'B-': 'B-58201', JA: 'JA01PL', N: 'N601PL', HL: 'HL8301', 'B-M': 'B-MAP' }[p] || (p ? p + 'PLA' : 'PL-001');
    return `例如 ${ex}`;
  };

  // ---------- 依艙等自動最佳定價 ----------
  // 需求模型：攬客率 ∝ 票價倍率^-1.8，載客上限是座位數；每班需求另有 ±15% 隨機波動。
  // 對每個艙等試 0.60–1.60 的票價倍率，取「期望營收」最高者；座位等級越高，攬客力越強，最佳票價也越高。
  const TOD = (() => { let s = 0; for (let h = 6; h < 24; h++) s += G.timeOfDay(h * 60); return s / 18; })(); // 白天各時段平均
  const U5 = [0.87, 0.93, 1, 1.07, 1.13];
  function classRevenue(r, c, p, units, freq, market, cs, refFare) {
    const old = r.fare[c];
    r.fare[c] = p;
    let rev = 0, pax = 0, seats = 0;
    units.forEach(({ ac, w }) => {
      const k = ac.cabin[c];
      if (!k || k.seats <= 0) return;
      const exp = G.expectPax(r, c, k.tier, freq, 0).pax * TOD;
      let e = 0;
      U5.forEach((u) => (e += Math.min(k.seats, exp * u)));
      e /= U5.length;
      rev += w * e * refFare * p; pax += w * e; seats += w * k.seats;
    });
    r.fare[c] = old;
    return { rev, pax, seats };
  }
  // units：[{ac, w}]，w 是這架飛機占航線班次的比例；freq：每日單向班次
  function bestFares(r, units, freq) {
    const A = G.AP[r.a], B = G.AP[r.b], d = G.dist(A, B);
    const market = G.marketDaily(A, B), cs = G.classShare(d);
    const out = {};
    G.CLASSES.forEach((c) => {
      if (!units.some(({ ac }) => ac.cabin[c] && ac.cabin[c].seats > 0)) { out[c] = { p: r.fare[c] || 1, rev: 0, lf: null }; return; }
      const cap = r.fareCap && r.fareCap[c] != null ? r.fareCap[c] : 1.6;
      let best = null;
      for (let p = 0.6; p <= cap + 1e-9; p += 0.02) {
        const v = classRevenue(r, c, +p.toFixed(2), units, freq, market, cs, G.refFare(d, c));
        if (!best || v.rev > best.rev * 1.002) best = { p: +p.toFixed(2), rev: v.rev, lf: v.seats ? v.pax / v.seats : null };
      }
      out[c] = best;
    });
    return out;
  }
  G.optimizeFares = (r, apply) => {
    const acs = G.routeAircraft(r).filter((ac) => !ac.grounded);
    if (!acs.length) return null;
    const d = G.legKm(G.AP[r.a], G.AP[r.b]);
    const per = acs.map((ac) => { const t = G.TYPES[ac.type]; return 1440 / (2 * (G.blockMinutes(t, d) + G.turnMinutes(t))); });
    const freq = per.reduce((s, x) => s + x, 0);
    const units = acs.map((ac, i) => ({ ac, w: per[i] / freq }));
    const res = bestFares(r, units, freq);
    if (apply !== false) G.CLASSES.forEach((c) => { if (res[c] && res[c].rev > 0) r.fare[c] = res[c].p; });
    return res;
  };
  // 每天自動調整開啟「自動定價」的航線
  // v1.0 效能：每條航線每 3 天重新最佳化一次（錯開日期）；指派飛機、改艙等時仍會立刻重算
  G.autoFaresDaily = () => { const S = G.S, day = Math.floor(S.time / 86400000); S.routes.forEach((r) => { if (r.autoFare && ((r.id + day) % 3 === 0 || !r.fareOpt)) { G.optimizeFares(r); r.fareOpt = S.time; } }); };

  // ---------- 推薦機隊內的閒置飛機 ----------
  // 不含任何副作用的單班成本估算（與 sim.js 的 flightCosts 同一套公式）
  G.estFlightCost = (t, d, pax, h) => {
    const seats = pax;
    const fuel = t.fuel * h * G.FUEL_PRICE;
    const crew = h * (2 * 40 + Math.max(1, Math.ceil(seats / 45)) * 12);
    const maint = t.price * 1e6 * (t.used ? 1.4 : 1) * 3.5e-6 * h * G.fmod('mx');
    const airport = 7 * t.units + pax * 12 + 0.45 * d + (t.wide ? 4000 : t.body === 'turboprop' ? 700 : 1500);
    return fuel + crew + maint + airport;
  };
  // 估算一架飛機單獨飛這條航線的每日營收、成本與載客率
  G.estimateAircraftOnRoute = (ac, a, b, extraFreq) => {
    const t = G.TYPES[ac.type], A = G.AP[a], B = G.AP[b], d = G.dist(A, B), dk = G.legKm(A, B), h = G.blockMinutes(t, dk) / 60;
    const freq = 1440 / (2 * (G.blockMinutes(t, dk) + G.turnMinutes(t)));
    const exist = G.S.routes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const r = { id: exist ? exist.id : -1, a, b, fare: exist ? { ...exist.fare } : { F: 1, J: 1, W: 1, Y: 1 }, fareCap: exist && exist.fareCap };
    const tot = freq + (extraFreq || 0);
    const res = bestFares(r, [{ ac, w: freq / tot }], tot);
    let rev = 0, pax = 0, seats = 0;
    G.classesFor(t).forEach((c) => {
      const k = ac.cabin[c];
      if (!k || !k.seats || !res[c]) return;
      rev += res[c].rev; seats += k.seats; pax += (res[c].lf || 0) * k.seats;
    });
    const perFlightRev = rev / (freq / tot); // bestFares 依權重回傳，換算回這架飛機每班
    const cost = G.estFlightCost(t, d, pax, h);
    const flights = freq * 2;
    return { ac, type: t, fares: res, daily: { rev: perFlightRev * flights, cost: cost * flights, profit: (perFlightRev - cost) * flights }, lf: seats ? pax / seats : 0, flights };
  };
  G.idleAircraft = () => G.S.fleet.filter((ac) => !ac.route && !ac.charter && !ac.grounded && (ac.st === 'idle' || ac.st === 'turn'));
  G.recommendIdle = (a, b) => {
    const A = G.AP[a], B = G.AP[b];
    const ok = G.idleAircraft().filter((ac) => !G.canFly(G.TYPES[ac.type], A, B));
    const exist = G.S.routes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const extra = exist ? G.routeFreq(exist) : 0;
    return ok.map((ac) => G.estimateAircraftOnRoute(ac, a, b, extra)).sort((p, q) => q.daily.profit - p.daily.profit);
  };
  // 機隊沒有合適閒置飛機時，推薦可以買或租的機型（以預設艙等估算）
  G.recommendType = (a, b) => {
    const A = G.AP[a], B = G.AP[b];
    return window.AIRCRAFT.filter((t) => !G.canFly(t, A, B)).map((t) => {
      const ac = { type: t.id, cabin: G.defaultCabin(t) };
      const e = G.estimateAircraftOnRoute(ac, a, b, 0);
      const leaseDaily = G.leaseMonthly(t) / 30;
      return { ...e, leaseDaily, net: e.daily.profit - leaseDaily };
    }).sort((p, q) => q.net - p.net);
  };

  // ---------- 存檔升級（v5）----------
  G.migrateV6ops = (S) => {
    const used = new Set();
    let n = 101;
    S.routes.forEach((r) => {
      if (r.fno) return;
      while (used.has(n) || used.has(n + 1)) n += 2;
      r.fno = { out: n, back: n + 1 }; used.add(n); used.add(n + 1); n += 2;
      if (r.autoFare == null) r.autoFare = false; // 舊航線保留玩家原本的票價
    });
  };
})();
