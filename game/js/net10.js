// v1.0.0 多人連線：房間聊天、玩家之間買賣飛機、聯營航線（共同經營）、限時比賽。
// 所有訊息都經由房主轉送（net.js 的 G.netSend）；買賣飛機用兩段式確認，避免一架飛機被賣兩次。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const DAY = 86400000, YEAR = 365 * DAY;
  const others = () => { const N = G.net; return N ? Object.entries(N.players).filter(([id, p]) => id !== N.myId && p && p.code) : []; };
  const me = () => G.S.company;
  const bumpNet = () => { if (G.net) G.net.ver = (G.net.ver || 0) + 1; };

  // ====================================================================
  // 聊天
  // ====================================================================
  const chatLog = () => { const N = G.net; if (!N) return []; return (N.chat = N.chat || []); };
  G.netChat = (text) => {
    const N = G.net;
    text = String(text || '').trim().slice(0, 200);
    if (!N || !text) return { ok: false };
    const c = me(), msg = { t: 'chat', code: c.code, name: c.name, color: c.color, text, at: Date.now() };
    others().forEach(([id]) => G.netSend(id, msg));
    chatLog().push({ ...msg, mine: true });
    if (chatLog().length > 60) chatLog().shift();
    return { ok: true };
  };

  // ====================================================================
  // 買賣飛機
  // ====================================================================
  // 賣方：只有自有、停在地面、沒有排隊整修／改裝的飛機可以賣
  G.acTradeWhy = (ac) => {
    if (!ac) return '找不到這架飛機';
    if (ac.mode !== 'buy') return '租賃的飛機不能轉賣';
    if (ac.st === 'air' || ac.st === 'sched' || ac.leg) return '飛機正在執勤，先把它從航線撤下並等它落地';
    if (['maint', 'aog', 'refit', 'refurb'].includes(ac.st)) return '飛機正在檢查或修理';
    if (ac.charter) return '飛機正在執行包機任務';
    if (ac.tradeOffer) return '已經向其他玩家報價了';
    return null;
  };
  const acData = (ac) => ({ type: ac.type, reg: ac.reg, cabin: ac.cabin, hours: ac.hours, cycles: ac.cycles, cond: ac.cond, mx: ac.mx, book: ac.book || 0 });
  G.offerAircraft = (acId, code, price) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId), why = G.acTradeWhy(ac);
    if (why) return { ok: false, msg: why };
    price = Math.round(+price || 0);
    if (!(price > 0)) return { ok: false, msg: '請輸入售價' };
    const pid = G.netPidOf(code);
    if (!pid) return { ok: false, msg: '對方不在房間裡' };
    const id = `${me().code}-${ac.id}-${Date.now() % 1e6}`;
    ac.tradeOffer = { id, to: code, price, at: S.time };
    G.netSend(pid, { t: 'ac-offer', id, from: me().code, name: me().name, price, ac: acData(ac), value: G.aircraftValue(ac) });
    G.log(`向 ${G.netPlayer(code).name} 報價出售 ${ac.reg}（${G.TYPES[ac.type].model}），${M(price)}`);
    return { ok: true };
  };
  G.cancelAcOffer = (acId) => {
    const ac = G.S.fleet.find((a) => a.id === acId);
    if (!ac || !ac.tradeOffer) return { ok: false };
    G.netSendCode(ac.tradeOffer.to, { t: 'ac-withdraw', id: ac.tradeOffer.id });
    ac.tradeOffer = null;
    return { ok: true };
  };
  // 買方：收到的報價（只存在這次連線）
  const inbox = () => { const N = G.net; if (!N) return []; return (N.acInbox = N.acInbox || []); };
  G.acceptAcOffer = (id) => {
    const S = G.S, o = inbox().find((x) => x.id === id);
    if (!o) return { ok: false, msg: '報價已失效' };
    const t = G.TYPES[o.ac.type];
    if (S.cash < o.price) return { ok: false, msg: `現金不足，需要 ${M(o.price)}` };
    if (o.ac.type && G.fleetCapOk && !G.fleetCapOk()) return { ok: false, msg: '機隊已達上限' };
    // 先付款（列為預付款），賣方交機後轉為飛機；賣方無法交機就退款
    G._spend(o.price, 'capex');
    S.fin.prepay = (S.fin.prepay || 0) + o.price;
    o.paid = true;
    G.netSendCode(o.from, { t: 'ac-accept', id, code: me().code });
    G.log(`同意以 ${M(o.price)} 向 ${o.name} 購買 ${t.model}（${o.ac.reg}），等待交機`);
    return { ok: true };
  };
  G.declineAcOffer = (id) => {
    const o = inbox().find((x) => x.id === id);
    if (!o) return { ok: false };
    inbox().splice(inbox().indexOf(o), 1);
    G.netSendCode(o.from, { t: 'ac-decline', id });
    return { ok: true };
  };
  function onTrade(m) {
    const S = G.S;
    if (m.t === 'ac-offer') {
      inbox().push({ ...m, at: S.time });
      U.toast(`${m.name} 想把 ${G.TYPES[m.ac.type].model}（${m.ac.reg}）以 ${M(m.price)} 賣給你，到「總覽」的連線卡片回覆`);
      G._emit('event', { kind: 'net', text: `${m.name} 向你報價出售飛機` });
      return;
    }
    if (m.t === 'ac-withdraw' || m.t === 'ac-decline') {
      if (m.t === 'ac-withdraw') { const o = inbox().find((x) => x.id === m.id); if (o && !o.paid) inbox().splice(inbox().indexOf(o), 1); }
      else { const ac = S.fleet.find((a) => a.tradeOffer && a.tradeOffer.id === m.id); if (ac) { U.toast(`${G.netPlayer(ac.tradeOffer.to) ? G.netPlayer(ac.tradeOffer.to).name : '對方'}婉拒了 ${ac.reg} 的報價`); ac.tradeOffer = null; } }
      return;
    }
    if (m.t === 'ac-accept') {
      const ac = S.fleet.find((a) => a.tradeOffer && a.tradeOffer.id === m.id);
      const why = ac ? (ac.leg || ac.st === 'air' ? '飛機正在執勤' : null) : '飛機已經不在機隊';
      if (why) { G.netSendCode(m.code, { t: 'ac-fail', id: m.id, why }); if (ac) ac.tradeOffer = null; return; }
      const price = ac.tradeOffer.price, data = acData(ac);
      if (ac.route) G.assign(ac.id, null);
      G.dispose(ac, price, 'sale');
      G.netSendCode(m.code, { t: 'ac-deliver', id: m.id, ac: data, price });
      G.log(`${ac.reg} 已交機給 ${G.netPlayer(m.code) ? G.netPlayer(m.code).name : m.code}，收到 ${M(price)}`);
      U.toast(`${ac.reg} 售出，收到 ${M(price)}`);
      G._emit('fleet');
      return;
    }
    if (m.t === 'ac-fail' || m.t === 'ac-deliver') {
      const o = inbox().find((x) => x.id === m.id);
      if (!o || !o.paid) return;
      inbox().splice(inbox().indexOf(o), 1);
      S.fin.prepay = Math.max(0, (S.fin.prepay || 0) - o.price);
      if (m.t === 'ac-fail') { G.cashIn(o.price, 'sale'); U.toast(`交易取消：${m.why}，已退款 ${M(o.price)}`, true); return; }
      const d = m.ac;
      let reg = d.reg; if (G.checkReg && G.checkReg(G.normReg(reg))) reg = null; // 編號跟自己的重複就改用預設
      const r = G.acquire(d.type, 'buy', d.cabin, reg, { price: 0, hours: d.hours, cycles: d.cycles, cond: d.cond, mx: d.mx, used: true });
      if (!r.ok) { G.cashIn(o.price, 'sale'); U.toast('無法接收飛機，已退款', true); return; }
      r.ac.cost = r.ac.book = o.price;
      G.log(`從 ${o.name} 接收 ${G.TYPES[d.type].model}（${r.ac.reg}），${M(o.price)}`);
      U.toast(`${r.ac.reg} 已加入機隊`);
      G._emit('fleet');
    }
  }

  // ====================================================================
  // 聯營航線（共同經營）
  // ====================================================================
  // 兩家公司在同一條航線上協調班表、共用銷售：不再互相稀釋，另外各多 5% 攬客力
  G.JV = { boost: 0.05, fee: 0.5e6 };
  const jvList = () => (G.S.jv = G.S.jv || []);
  const pk = (a, b) => G.pairKey(a, b);
  G.jvWith = (a, b) => jvList().filter((j) => j.k === pk(a, b));
  G.jvInvite = (code, a, b) => {
    const S = G.S;
    if (!G.netPidOf(code)) return { ok: false, msg: '對方不在房間裡' };
    if (jvList().some((j) => j.k === pk(a, b) && j.code === code)) return { ok: false, msg: '已經和對方聯營這條航線' };
    if (!S.routes.some((r) => pk(r.a, r.b) === pk(a, b))) return { ok: false, msg: '你沒有飛這條航線' };
    G.netSendCode(code, { t: 'jv-inv', from: me().code, name: me().name, a, b });
    G.log(`邀請 ${G.netPlayer(code).name} 聯營 ${a}–${b}`);
    return { ok: true };
  };
  const jvInbox = () => { const N = G.net; if (!N) return []; return (N.jvInbox = N.jvInbox || []); };
  G.jvAnswer = (i, yes) => {
    const S = G.S, inv = jvInbox()[i];
    if (!inv) return { ok: false };
    jvInbox().splice(i, 1);
    if (!yes) { G.netSendCode(inv.from, { t: 'jv-no', a: inv.a, b: inv.b, name: me().name }); return { ok: true }; }
    if (S.cash < G.JV.fee) return { ok: false, msg: `需要 ${M(G.JV.fee)} 的系統整合費` };
    G._spend(G.JV.fee, 'marketing');
    jvList().push({ code: inv.from, name: inv.name, k: pk(inv.a, inv.b), a: inv.a, b: inv.b, since: S.time });
    G.netSendCode(inv.from, { t: 'jv-yes', a: inv.a, b: inv.b, code: me().code, name: me().name });
    bumpNet();
    G.log(`與 ${inv.name} 開始聯營 ${inv.a}–${inv.b}`);
    return { ok: true };
  };
  G.jvEnd = (code, k) => {
    const j = jvList().find((x) => x.code === code && x.k === k);
    if (!j) return { ok: false };
    G.S.jv = jvList().filter((x) => x !== j);
    G.netSendCode(code, { t: 'jv-end', k, name: me().name });
    bumpNet();
    G.log(`結束與 ${j.name} 的 ${j.a}–${j.b} 聯營`);
    return { ok: true };
  };
  function onJv(m) {
    const S = G.S;
    if (m.t === 'jv-inv') { jvInbox().push(m); U.toast(`${m.name} 邀請你聯營 ${m.a}–${m.b}，到「總覽」的連線卡片回覆`); return; }
    if (m.t === 'jv-yes') {
      if (S.cash >= G.JV.fee) G._spend(G.JV.fee, 'marketing');
      jvList().push({ code: m.code, name: m.name, k: pk(m.a, m.b), a: m.a, b: m.b, since: S.time }); bumpNet();
      U.toast(`${m.name} 同意聯營 ${m.a}–${m.b}`); G.log(`與 ${m.name} 開始聯營 ${m.a}–${m.b}（系統整合費 ${M(G.JV.fee)}）`); return;
    }
    if (m.t === 'jv-no') { U.toast(`${m.name} 婉拒聯營 ${m.a}–${m.b}`); return; }
    if (m.t === 'jv-end') { const before = jvList().length; S.jv = jvList().filter((x) => !(x.k === m.k && x.name === m.name) && !(x.k === m.k && G.netPidOf(x.code) && G.netPlayer(x.code).name === m.name)); if (S.jv.length !== before) { bumpNet(); U.toast(`${m.name} 結束了聯營`); } }
  }
  // 效果：聯營夥伴在那條航線上不算對手；你的攬客力多 5%
  const hr0 = G.humanRivalsOn;
  G.humanRivalsOn = (a, b) => {
    const out = hr0(a, b), S = G.S;
    if (!S || !S.jv || !S.jv.length) return out;
    const k = pk(a, b), set = new Set(S.jv.filter((j) => j.k === k).map((j) => j.code));
    return set.size ? out.filter((x) => !set.has(x.code)) : out;
  };
  const ab0 = G.allyBoost;
  G.allyBoost = (r, seg, cls) => {
    let b = ab0 ? ab0(r, seg, cls) : 1;
    const S = G.S;
    if (S && S.jv && S.jv.length && G.net) {
      const k = pk(r.a, r.b);
      if (S.jv.some((j) => j.k === k && (G.netPlayer(j.code) || {}).routes && G.netPlayer(j.code).routes.some((x) => pk(x[0], x[1]) === k))) b *= 1 + G.JV.boost;
    }
    return b;
  };

  // ====================================================================
  // 限時比賽
  // ====================================================================
  G.RACE_METRICS = { value: '公司價值', worth: '創辦人身價', ni: '比賽期間累計淨利', pax: '比賽期間累計旅客' };
  const raceScore = () => {
    const S = G.S, R = S.race;
    if (!R) return null;
    const ni = S.fin.statements.filter((s) => Date.UTC(s.y, s.m - 1, 1) >= R.start - 31 * DAY && Date.UTC(s.y, s.m - 1, 1) < R.end).reduce((t, s) => t + s.ni, 0);
    return { id: R.id, value: Math.round(G.companyValue ? G.companyValue() : G.fairValue()), worth: Math.round(G.netWorth ? G.netWorth() : 0), ni: Math.round(ni), pax: Math.round(((S.stats && S.stats.pax) || 0) - (R.pax0 || 0)) };
  };
  G.netExtras = G.netExtras || [];
  G.netExtras.push(() => (G.S && G.S.race ? { race: raceScore() } : {}));
  G.raceStart = (years, metric) => {
    const N = G.net, S = G.S;
    if (!N || N.role !== 'host') return { ok: false, msg: '只有房主可以發起比賽' };
    if (S.race && !S.race.done) return { ok: false, msg: '比賽進行中' };
    if (!G.RACE_METRICS[metric]) metric = 'value';
    const R = { id: 'r' + Date.now().toString(36), start: S.time, end: S.time + years * YEAR, years, metric };
    others().forEach(([id]) => G.netSend(id, { t: 'race', R }));
    applyRace(R);
    return { ok: true };
  };
  function applyRace(R) {
    const S = G.S;
    S.race = { ...R, pax0: (S.stats && S.stats.pax) || 0, done: false };
    G.log(`限時比賽開始：${R.years} 年內比「${G.RACE_METRICS[R.metric]}」，${new Date(R.end).toISOString().slice(0, 10)} 結束`);
    U.toast(`限時比賽開始！${R.years} 年內比${G.RACE_METRICS[R.metric]}`);
    bumpNet();
  }
  G.raceStandings = () => {
    const S = G.S, R = S.race, N = G.net;
    if (!R) return [];
    const rows = [];
    const mine = raceScore();
    rows.push({ code: S.company.code, name: S.company.name, color: S.company.color, v: mine[R.metric], me: true });
    if (N) others().forEach(([, p]) => { if (p.race && p.race.id === R.id) rows.push({ code: p.code, name: p.name, color: p.color, v: p.race[R.metric] }); });
    return rows.sort((a, b) => b.v - a.v);
  };
  function raceDaily() {
    const S = G.S, R = S.race;
    if (!R || R.done || S.time < R.end) return;
    R.done = true;
    const st = G.raceStandings();
    R.result = st.map((x) => ({ code: x.code, name: x.name, v: x.v, me: !!x.me }));
    R.rank = st.findIndex((x) => x.me) + 1;
    if (R.rank === 1 && st.length >= 2) { S.stats = S.stats || {}; S.stats.raceWins = (S.stats.raceWins || 0) + 1; }
    G.log(`限時比賽結束：你在 ${st.length} 家公司中排第 ${R.rank} 名`);
    if (G.net && G.net.role === 'host') G.setSpeed(0);
    setTimeout(() => U.raceResult && U.raceResult(), 50);
  }
  G.on((w) => { if (w === 'day' && G.S && G.S.race) raceDaily(); });

  // ====================================================================
  // 收訊
  // ====================================================================
  (G.netHandlers = G.netHandlers || []).push((from, m) => {
    if (!m || !G.S) return;
    if (m.t === 'chat') {
      chatLog().push(m); if (chatLog().length > 60) chatLog().shift();
      U.toast(`💬 ${m.name}：${m.text}`);
      const el = $('#chat-log'); if (el) { el.innerHTML = chatHtml(); el.scrollTop = el.scrollHeight; }
      return;
    }
    if (m.t && m.t.startsWith('ac-')) return onTrade(m);
    if (m.t && m.t.startsWith('jv-')) return onJv(m);
    if (m.t === 'race' && m.R) applyRace(m.R);
  });

  // ====================================================================
  // 介面
  // ====================================================================
  const chatHtml = () => chatLog().slice(-30).map((c) => `<p class="${c.mine ? 'mine' : ''}"><span class="cbadge" style="--c:${esc(c.color || '#888')}">${esc(c.code)}</span><span>${esc(c.text)}</span><time>${new Date(c.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</time></p>`).join('') || '<p class="muted">還沒有訊息。</p>';
  let raceYears = 3, raceMetric = 'value';
  const ov0 = U.overviewExtra;
  U.overviewExtra = () => {
    const base = ov0 ? ov0() : '';
    const N = G.net, S = G.S;
    if (!N) return base;
    const R = S.race, pl = others();
    const offers = inbox(), invs = jvInbox();
    const myOffers = S.fleet.filter((a) => a.tradeOffer);
    const raceBox = R && !R.done
      ? `<div class="race"><b>限時比賽 · ${esc(G.RACE_METRICS[R.metric])}</b><small>剩 ${Math.max(0, Math.ceil((R.end - S.time) / DAY))} 天（${new Date(R.end).toISOString().slice(0, 10)} 結束）</small>
          <ol class="board sm">${G.raceStandings().map((x, i) => `<li class="${x.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="cbadge" style="--c:${esc(x.color)}">${esc(x.code)}</span><span class="nm"><b>${esc(x.name)}</b></span><b class="v">${R.metric === 'pax' ? G.num(x.v) + ' 人' : M(x.v)}</b></li>`).join('')}</ol></div>`
      : N.role === 'host' ? `<div class="race"><b>發起限時比賽</b>
          <div class="seg" role="group" aria-label="比賽年數">${[1, 3, 5, 10].map((y) => `<button data-act="race-y" data-k="${y}" aria-pressed="${raceYears === y}">${y} 年</button>`).join('')}</div>
          <div class="seg" role="group" aria-label="比賽項目">${Object.entries(G.RACE_METRICS).map(([k, n]) => `<button data-act="race-m" data-k="${k}" aria-pressed="${raceMetric === k}">${n}</button>`).join('')}</div>
          <div class="row-btns"><button class="btn sm primary" data-act="race-go">開始比賽</button>${R && R.done ? '<button class="btn sm" data-act="race-show">上一場結果</button>' : ''}</div></div>`
        : R && R.done ? `<div class="row-btns"><button class="btn sm" data-act="race-show">上一場比賽結果</button></div>` : '<p class="note">房主可以發起限時比賽（1–10 年，比公司價值、身價、淨利或旅客）。</p>';
    return base + `<section class="netcard v10net">
      <h3>房間聊天</h3>
      <div id="chat-log" class="chat-log">${chatHtml()}</div>
      <div class="net-row"><input id="chat-in" maxlength="200" placeholder="輸入訊息，按 Enter 送出" autocomplete="off" aria-label="聊天訊息"><button class="btn sm" data-act="chat-send">送出</button></div>
      ${raceBox}
      ${offers.length || invs.length ? `<h3>待回覆</h3>
        ${offers.map((o) => { const t = G.TYPES[o.ac.type]; return `<div class="offer"><span><b>${esc(o.name)}</b> 出售 ${esc(t.model)}（${esc(o.ac.reg)}）<small>機齡 ${G.num(o.ac.hours)} 小時 · 機況 ${Math.round((o.ac.cond || 1) * 100)}% · 參考市價 ${M(o.value)}</small></span><b>${M(o.price)}</b>${o.paid ? '<span class="chip">等待交機</span>' : `<button class="btn sm primary" data-act="acx-yes" data-id="${esc(o.id)}">買下</button><button class="btn sm" data-act="acx-no" data-id="${esc(o.id)}">婉拒</button>`}</div>`; }).join('')}
        ${invs.map((j, i) => `<div class="offer"><span><b>${esc(j.name)}</b> 邀請聯營 ${j.a}–${j.b}<small>不再互相搶客、各多 ${Math.round(G.JV.boost * 100)}% 攬客力；系統整合費 ${M(G.JV.fee)}</small></span><button class="btn sm primary" data-act="jv-yes" data-i="${i}">同意</button><button class="btn sm" data-act="jv-no" data-i="${i}">婉拒</button></div>`).join('')}` : ''}
      ${myOffers.length ? `<h3>你的出售報價</h3>${myOffers.map((a) => `<div class="offer"><span>${esc(a.reg)} → ${esc((G.netPlayer(a.tradeOffer.to) || {}).name || a.tradeOffer.to)}</span><b>${M(a.tradeOffer.price)}</b><button class="btn sm" data-act="acx-cancel" data-id="${a.id}">撤回</button></div>`).join('')}` : ''}
      ${(S.jv || []).length ? `<h3>聯營航線</h3>${S.jv.map((j) => `<div class="offer"><span>${j.a}–${j.b} · 與 ${esc(j.name)}${G.netPidOf(j.code) ? '' : ' <small class="muted">（對方不在房間，暫停）</small>'}</span><button class="btn sm" data-act="jv-end" data-code="${esc(j.code)}" data-k="${j.k}">結束</button></div>`).join('')}` : ''}
      <p class="note">在「機隊」的飛機卡片可以把飛機賣給其他玩家；在航線詳細資料可以邀請同航線的玩家聯營。</p>
    </section>`;
  };
  // 機隊卡片：賣給玩家
  let sellAc = null;
  const acb0 = U.acButtons;
  U.acButtons = (ac) => (acb0 ? acb0(ac) : '') + (G.net && others().length && ac.mode === 'buy' ? (ac.tradeOffer ? `<button class="btn sm" data-act="acx-cancel" data-id="${ac.id}">撤回報價</button>` : `<button class="btn sm" data-act="acx-sell" data-id="${ac.id}">賣給玩家</button>`) : '');
  U.acSellDialog = (id) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === id);
    if (!ac) return;
    sellAc = id;
    const why = G.acTradeWhy(ac), v = G.aircraftValue(ac);
    U.modal(`<h2>把 ${esc(ac.reg)} 賣給其他玩家</h2>
      <p class="sub">${esc(G.TYPES[ac.type].model)} · 帳面 ${M(ac.book || 0)} · 參考市價 ${M(v)}</p>
      ${why ? `<p class="note neg">${esc(why)}</p>` : `<div class="form-grid"><label>買家<select id="acx-to">${others().map(([, p]) => `<option value="${esc(p.code)}">${esc(p.name)}（${esc(p.code)}）</option>`).join('')}</select></label>
        <label>售價（美元）<input id="acx-price" type="text" inputmode="numeric" value="${Math.round(v)}"></label></div>
        <p class="note">對方同意並付款後，飛機會立刻交給對方（連同機況、檢查時數與艙位）。售價與帳面的差額列為處分損益。</p>
        <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="modal-close">取消</button><button class="btn primary" data-act="acx-go">送出報價</button></div>`}`);
  };
  // 航線：邀請聯營
  const re0 = U.routeExtra;
  U.routeExtra = (r) => {
    const base = re0 ? re0(r) : '';
    if (!G.net) return base;
    const k = pk(r.a, r.b);
    const on = others().filter(([, p]) => (p.routes || []).some((x) => pk(x[0], x[1]) === k));
    if (!on.length) return base;
    const jv = G.jvWith(r.a, r.b);
    return base + `<h4>聯營（其他玩家也飛這條航線）</h4><div class="row-btns">${on.map(([, p]) => jv.some((j) => j.code === p.code) ? `<span class="chip pos">與 ${esc(p.name)} 聯營中</span>` : `<button class="btn sm" data-act="jv-inv" data-code="${esc(p.code)}" data-a="${r.a}" data-b="${r.b}">邀請 ${esc(p.name)} 聯營</button>`).join('')}</div>`;
  };
  U.raceResult = () => {
    const R = G.S.race;
    if (!R || !R.result) return;
    U.modal(`<h2>限時比賽結果</h2><p class="sub">${R.years} 年 · ${esc(G.RACE_METRICS[R.metric])}</p>
      <ol class="board">${R.result.map((x, i) => `<li class="${x.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm"><b>${esc(x.name)}</b><small>${esc(x.code)}</small></span><b class="v">${R.metric === 'pax' ? G.num(x.v) + ' 人' : M(x.v)}</b></li>`).join('')}</ol>
      <p class="note">${R.rank === 1 ? (R.result.length >= 2 ? '恭喜奪冠！' : '房間裡只有你一家公司。') : `你排第 ${R.rank} 名，下次再接再厲。`}遊戲會繼續進行，房主可以再發起新的比賽。</p>
      <div class="row-btns"><span class="spacer"></span><button class="btn primary" data-act="modal-close">了解</button></div>`);
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'chat-in') { e.preventDefault(); send(); } });
  function send() { const el = $('#chat-in'); if (!el || !el.value.trim()) return; G.netChat(el.value); el.value = ''; const lg = $('#chat-log'); if (lg) { lg.innerHTML = chatHtml(); lg.scrollTop = lg.scrollHeight; } }

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    const r = (x, ok) => { if (x && x.ok === false) U.toast(x.msg || '無法執行', true); else if (ok) U.toast(ok); return x; };
    switch (a) {
      case 'chat-send': send(); return;
      case 'acx-sell': U.acSellDialog(+d.id); return;
      case 'acx-go': { const x = r(G.offerAircraft(sellAc, ($('#acx-to') || {}).value, String(($('#acx-price') || {}).value || '').replace(/[^\d.]/g, ''))); if (x.ok) { U.closeModal(); U.toast('已送出報價，等待對方回覆'); U.render(); } return; }
      case 'acx-cancel': r(G.cancelAcOffer(+d.id), '已撤回報價'); U.render(); return;
      case 'acx-yes': r(G.acceptAcOffer(d.id), '已付款，等待對方交機'); U.render(); return;
      case 'acx-no': G.declineAcOffer(d.id); U.render(); return;
      case 'jv-inv': r(G.jvInvite(d.code, d.a, d.b), '已送出聯營邀請'); return;
      case 'jv-yes': r(G.jvAnswer(+d.i, true), '聯營開始'); U.render(); return;
      case 'jv-no': G.jvAnswer(+d.i, false); U.render(); return;
      case 'jv-end': if (el.dataset.confirm) { G.jvEnd(d.code, d.k); U.render(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次結束'; } return;
      case 'race-y': raceYears = +d.k; U.render(); return;
      case 'race-m': raceMetric = d.k; U.render(); return;
      case 'race-go': r(G.raceStart(raceYears, raceMetric)); U.render(); return;
      case 'race-show': U.raceResult(); return;
    }
    if (act0) act0(a, d, el);
  };
  // 離開房間時，已付款但還沒交機的購買退款
  const leave0 = G.netLeave;
  G.netLeave = (silent) => {
    const S = G.S;
    if (S && G.net) inbox().filter((o) => o.paid).forEach((o) => { S.fin.prepay = Math.max(0, (S.fin.prepay || 0) - o.price); G.cashIn(o.price, 'sale'); G.log(`離開房間，向 ${o.name} 購買飛機的款項 ${M(o.price)} 已退回`); });
    if (S) S.fleet.forEach((a) => { a.tradeOffer = null; });
    return leave0(silent);
  };
  // 成就
  if (G.ACHIEVEMENTS) G.ACHIEVEMENTS.push(['racewin', '冠軍', '在多人連線的限時比賽中拿下第一名', (S) => ((S.stats && S.stats.raceWins) || 0) > 0]);
})();
