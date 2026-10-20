// v0.8.0 房主制多人連線（最多 4 人）。
// 架構：每位玩家在自己的瀏覽器模擬自己的航空公司；房主負責「時鐘」與共用的世界資料：
//   1. 時間：所有人不能比最慢的玩家快超過一天（房主算出 limit 發給大家）；速度由房主決定，客人按速度鍵會變成請求。
//   2. 競爭：每位玩家每天把公開資訊（航線、班次、經濟艙票價、座椅等級、社會評價）傳給房主，房主轉發給大家；
//      同航線的其他玩家會像真實航空公司一樣稀釋你的攬客力（rivals.js 的 humanRivalsOn）。
//   3. 二手市場：由房主每季刷新、全房間共用，買走的飛機其他人就買不到。
// 連線：PeerJS（免費公用配對伺服器＋WebRTC 直連，朋友在不同地方也能玩）；或「本機測試」（同一台電腦的分頁，用 BroadcastChannel）。
(function () {
  const G = window.G;
  const DAY = 86400000;
  const MAX_PLAYERS = 4;
  const PEER_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'airfounder-';
  const rid = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const dayOf = (t) => Math.floor(t / DAY);

  // ---------- 連線方式 ----------
  function loadPeer() {
    return new Promise((res, rej) => {
      if (window.Peer) return res();
      const s = document.createElement('script');
      s.src = PEER_SRC; s.async = true;
      s.onload = () => (window.Peer ? res() : rej(new Error('連線元件載入失敗')));
      s.onerror = () => rej(new Error('無法載入連線元件，請確認有網路'));
      document.head.appendChild(s);
    });
  }
  const wrapPeerConn = (conn) => ({
    id: conn.peer,
    send: (o) => { try { conn.send(o); } catch (e) { /* 已斷線 */ } },
    onData: (cb) => conn.on('data', cb),
    onClose: (cb) => { conn.on('close', cb); conn.on('error', cb); },
    close: () => { try { conn.close(); } catch (e) { /* 忽略 */ } },
  });
  const PeerTransport = {
    name: '網路（PeerJS）',
    async host(code, onConn) {
      await loadPeer();
      return new Promise((res, rej) => {
        const peer = new window.Peer(PREFIX + code);
        peer.on('open', () => res({ close: () => peer.destroy() }));
        peer.on('error', (e) => rej(new Error(e.type === 'unavailable-id' ? '房間代碼重複，請再試一次' : `連線失敗（${e.type || e.message}）`)));
        peer.on('connection', (conn) => conn.on('open', () => onConn(wrapPeerConn(conn))));
      });
    },
    async join(code) {
      await loadPeer();
      return new Promise((res, rej) => {
        const peer = new window.Peer();
        const timer = setTimeout(() => rej(new Error('連不上房主。請確認房間代碼；如果代碼正確，可能是網路擋住了直連（手機網路、學校或公司網路常見），建議兩邊都改用家裡的 Wi-Fi，或先按「測試我的網路」')), 20000);
        peer.on('error', (e) => { clearTimeout(timer); rej(new Error(e.type === 'peer-unavailable' ? '找不到這個房間（代碼錯誤或房主已離開）' : `連線失敗（${e.type || e.message}）`)); });
        peer.on('open', () => {
          const conn = peer.connect(PREFIX + code, { reliable: true });
          conn.on('open', () => { clearTimeout(timer); const w = wrapPeerConn(conn); w.closeAll = () => peer.destroy(); res(w); });
        });
      });
    },
  };
  // 同一台電腦的分頁（測試或同一台電腦輪流玩）
  const LocalTransport = {
    name: '本機測試（同一台電腦的分頁）',
    async host(code, onConn) {
      const bc = new BroadcastChannel('airfounder-net-' + code);
      const conns = new Map();
      bc.onmessage = (e) => {
        const m = e.data;
        if (!m || m.to !== 'host') return;
        if (m.kind === 'open') {
          const handlers = { data: [], close: [] };
          const conn = { id: m.from, send: (o) => bc.postMessage({ to: m.from, from: 'host', kind: 'data', data: o }), onData: (cb) => handlers.data.push(cb), onClose: (cb) => handlers.close.push(cb), close: () => bc.postMessage({ to: m.from, from: 'host', kind: 'close' }), handlers };
          conns.set(m.from, conn);
          bc.postMessage({ to: m.from, from: 'host', kind: 'accept' });
          onConn(conn);
        } else if (m.kind === 'data' && conns.has(m.from)) conns.get(m.from).handlers.data.forEach((cb) => cb(m.data));
        else if (m.kind === 'close' && conns.has(m.from)) { conns.get(m.from).handlers.close.forEach((cb) => cb()); conns.delete(m.from); }
      };
      return { close: () => { conns.forEach((c) => c.close()); bc.close(); } };
    },
    async join(code) {
      const bc = new BroadcastChannel('airfounder-net-' + code), me = 'p' + rid(8);
      const handlers = { data: [], close: [] };
      return new Promise((res, rej) => {
        const timer = setTimeout(() => { bc.close(); rej(new Error('找不到這個房間（請先在另一個分頁建立房間）')); }, 3000);
        bc.onmessage = (e) => {
          const m = e.data;
          if (!m || m.to !== me) return;
          if (m.kind === 'accept') { clearTimeout(timer); res({ id: 'host', send: (o) => bc.postMessage({ to: 'host', from: me, kind: 'data', data: o }), onData: (cb) => handlers.data.push(cb), onClose: (cb) => handlers.close.push(cb), close: () => { bc.postMessage({ to: 'host', from: me, kind: 'close' }); bc.close(); } }); }
          else if (m.kind === 'data') handlers.data.forEach((cb) => cb(m.data));
          else if (m.kind === 'close') handlers.close.forEach((cb) => cb());
        };
        bc.postMessage({ to: 'host', from: me, kind: 'open' });
      });
    },
  };
  G.NET_TRANSPORTS = { peer: PeerTransport, local: LocalTransport };

  // ---------- 公開資訊 ----------
  const tierOf = (r, c) => {
    const acs = G.routeAircraft(r).filter((ac) => ac.cabin[c] && ac.cabin[c].seats > 0);
    return acs.length ? Math.round(acs.reduce((s, ac) => s + ac.cabin[c].tier, 0) / acs.length) : null;
  };
  G.netSummary = () => {
    const S = G.S, st = S.fin && S.fin.statements[S.fin.statements.length - 1];
    return {
      name: S.company.name, code: S.company.code, color: S.company.color, cc: G.homeCC(), hub: G.primaryHub(),
      rep: Math.round(S.rep), fleet: S.fleet.length,
      revLast: st ? Math.round(st.rev) : 0, niLast: st ? Math.round(st.ni) : 0,
      routes: S.routes.filter((r) => G.routeAircraft(r).length).map((r) => [r.a, r.b, +G.routeFreq(r).toFixed(2), +(r.fare.Y || 1).toFixed(2), tierOf(r, 'Y'), tierOf(r, 'J'), tierOf(r, 'W'), tierOf(r, 'F')]),
      ...(G.netExtras || []).reduce((o, f) => Object.assign(o, f()), {}), // v0.9.0 聯盟、股價
    };
  };
  // ---------- v0.9.0 玩家之間的私訊（經房主轉送）：聯盟邀請、買賣股票 ----------
  const deliver = (from, msg) => (G.netHandlers || []).forEach((f) => { try { f(from, msg); } catch (e) { console.error(e); } });
  G.netSend = (pid, msg) => {
    const N = G.net;
    if (!N || !pid) return false;
    if (N.role === 'host') {
      if (pid === 'host') { deliver('host', msg); return true; }
      const c = N.conns.get(pid);
      if (!c) return false;
      c.send({ t: 'relay', from: 'host', msg });
      return true;
    }
    if (pid === N.myId) return false;
    N.conn.send({ t: 'relay', to: pid, msg });
    return true;
  };
  G.netPidOf = (code) => { const N = G.net; if (!N) return null; const e = Object.entries(N.players).find(([, p]) => p && p.code === code); return e ? e[0] : null; };
  G.netSendCode = (code, msg) => G.netSend(G.netPidOf(code), msg);
  G.netPlayer = (code) => { const N = G.net, id = G.netPidOf(code); return id ? N.players[id] : null; };
  // 同航線的其他玩家（給 rivals.js）
  G.humanRivalsOn = (a, b) => {
    const N = G.net;
    if (!N || !N.players) return [];
    const out = [];
    Object.entries(N.players).forEach(([id, p]) => {
      if (id === N.myId || !p || !p.routes) return;
      const rt = p.routes.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
      if (!rt || !(rt[2] > 0)) return;
      const c = { code: p.code, name: p.name, zh: p.name, cc: p.cc, lcc: false, hubs: [p.hub], human: true, color: p.color };
      out.push({ code: p.code, c, f: rt[2], p: rt[3], p0: rt[3], war: false, hub: p.hub === a || p.hub === b, d: G.dist(G.AP[a], G.AP[b]), tiers: { Y: rt[4], J: rt[5], W: rt[6], F: rt[7] }, rep: p.rep });
    });
    return out;
  };

  // ---------- 房主 ----------
  function makeNet(role, code, transport) {
    const N = {
      role, code, transport, players: {}, ver: 1, limit: null, waiting: false, conns: new Map(), sumStr: {},
      myId: role === 'host' ? 'host' : null,
      count: () => Object.keys(N.players).length,
      otherRoutes: () => { const out = []; Object.entries(N.players).forEach(([id, p]) => { if (id !== N.myId && p && p.routes) p.routes.forEach((r) => out.push({ a: r[0], b: r[1], color: p.color })); }); return out; },
    };
    return N;
  }
  function hostLimit(N) {
    // v1.0：切到背景（暫離）的玩家不算，房間不會再等他；他回來時會自動快轉追上
    const days = Object.entries(N.players).filter(([id, p]) => id === 'host' || !p.away).map(([, p]) => p.day);
    const min = days.length ? Math.min(...days) : dayOf(G.S.time);
    N.limit = (min + 2) * DAY;
  }
  // v1.0 只傳有變動的公司資料：每家公司有版本號，各連線記得上次送過的版本
  function setSummary(N, id, sum, day) {
    const str = JSON.stringify(sum), old = N.players[id];
    if (old && N.sumStr[id] === str) { old.day = day; return; }
    N.sumStr[id] = str;
    N.players[id] = { ...sum, id, day, away: old ? !!old.away : false, rev: (old ? old.rev || 0 : 0) + 1 };
    N.ver++;
  }
  function hostBroadcast(N) {
    setSummary(N, 'host', G.netSummary(), dayOf(G.S.time));
    hostLimit(N);
    const ids = Object.keys(N.players), days = {}, away = {};
    ids.forEach((id) => { days[id] = N.players[id].day; away[id] = !!N.players[id].away; });
    N.conns.forEach((c) => {
      c.sent = c.sent || {};
      const upd = {};
      ids.forEach((id) => { const p = N.players[id]; if (c.sent[id] !== p.rev) { upd[id] = p; c.sent[id] = p.rev; } });
      c.send({ t: 'state', limit: N.limit, speed: G.speed, ids, days, away, upd });
    });
    G.ui.updateTop();
  }
  const hostUsed = (N) => N.conns.forEach((c) => c.send({ t: 'used', mkt: G.S.usedMkt }));
  const hostWorld = (N) => { const pub = G.worldPublic ? G.worldPublic() : null; if (pub) N.conns.forEach((c) => c.send({ t: 'world', pub })); }; // v1.0.0-rc2 突發事件
  G.netHost = async (kind) => {
    if (G.net) return { ok: false, msg: '已經在房間裡了' };
    const S = G.S, transport = G.NET_TRANSPORTS[kind || 'peer'];
    S.net = S.net && S.net.role === 'host' ? S.net : { role: 'host', worldId: rid(10) };
    let code = S.net.code || rid(6), handle;
    try { handle = await transport.host(code, (conn) => hostOnConn(conn)); }
    catch (e) { if (/重複/.test(e.message)) { code = rid(6); handle = await transport.host(code, (conn) => hostOnConn(conn)); } else return { ok: false, msg: e.message }; }
    S.net.code = code;
    const N = (G.net = makeNet('host', code, kind));
    N.handle = handle;
    N.onLocalSpeed = () => false;
    N.onNextDay = () => false;
    N.afterSpeed = () => hostBroadcast(N);
    hostBroadcast(N);
    G.log(`建立多人連線房間 ${code}`);
    return { ok: true, code };
  };
  function hostOnConn(conn) {
    const N = G.net;
    if (!N || N.role !== 'host') return conn.close();
    conn.onData((m) => hostOnData(conn, m));
    conn.onClose(() => {
      if (!N.conns.has(conn.id)) return;
      const p = N.players[conn.id];
      N.conns.delete(conn.id); delete N.players[conn.id]; delete N.sumStr[conn.id];
      if (p) { G.log(`${p.name} 離開了房間`); G._emit('event', { kind: 'net', text: `${p.name} 離開了房間` }); }
      hostBroadcast(N);
    });
  }
  function hostOnData(conn, m) {
    const N = G.net, S = G.S;
    if (!N || !m) return;
    if (m.t === 'hello') {
      // v1.0 斷線重連：同一家公司、同一個世界，換掉舊的連線
      if (m.rejoin && m.worldId && S.net && m.worldId === S.net.worldId) {
        const old = Object.entries(N.players).find(([id, p]) => id !== 'host' && p.code === m.summary.code);
        if (old) { const oc = N.conns.get(old[0]); N.conns.delete(old[0]); delete N.players[old[0]]; delete N.sumStr[old[0]]; if (oc) try { oc.close(); } catch (e) { /* 已斷線 */ } }
      }
      const why = Object.keys(N.players).length >= MAX_PLAYERS ? `房間已滿（最多 ${MAX_PLAYERS} 人）`
        : Object.values(N.players).some((p) => p.code === m.summary.code) ? `航空公司代碼 ${m.summary.code} 已有人使用，請換一個代碼的公司加入`
        : m.time > S.time + DAY ? `你的存檔日期比房間晚 ${Math.ceil((m.time - S.time) / DAY)} 天，請用新的公司或較早的存檔加入`
        : m.worldId && S.net && m.worldId !== S.net.worldId ? '這個存檔屬於另一個房間的世界' : null;
      if (why) { conn.send({ t: 'reject', reason: why }); setTimeout(() => conn.close(), 300); return; }
      N.conns.set(conn.id, conn);
      setSummary(N, conn.id, m.summary, dayOf(m.time));
      conn.send({ t: 'welcome', id: conn.id, code: N.code, worldId: S.net.worldId, time: S.time, speed: G.speed, used: S.usedMkt, world: G.worldPublic ? G.worldPublic() : null });
      G.log(`${m.summary.name}（${m.summary.code}）${m.rejoin ? '重新連線' : '加入了房間'}`);
      G._emit('event', { kind: 'net', text: `${m.summary.name} ${m.rejoin ? '重新連線' : '加入了房間'}` });
      hostBroadcast(N);
      return;
    }
    if (!N.conns.has(conn.id)) return;
    if (m.t === 'day') { if (m.summary) setSummary(N, conn.id, m.summary, m.day); else if (N.players[conn.id]) N.players[conn.id].day = m.day; hostBroadcast(N); }
    else if (m.t === 'away') { const p = N.players[conn.id]; if (p) { p.away = !!m.on; G._emit('event', { kind: 'net', text: `${p.name} ${m.on ? '暫離（房間不再等他）' : '回來了'}` }); hostBroadcast(N); } }
    else if (m.t === 'full') { conn.sent = {}; hostBroadcast(N); }
    else if (m.t === 'relay') { if (m.to === 'host') deliver(conn.id, m.msg); else { const c = N.conns.get(m.to); if (c) c.send({ t: 'relay', from: conn.id, msg: m.msg }); } }
    else if (m.t === 'speed') G.setSpeed(m.s, { user: true, remote: true });
    else if (m.t === 'step') G.nextDay({ remote: true });
    else if (m.t === 'buyUsed') {
      const it = S.usedMkt && S.usedMkt.items.find((x) => x.id === m.itemId);
      if (!it) conn.send({ t: 'usedReply', req: m.req, ok: false, msg: '這架飛機已經被買走了' });
      else { S.usedMkt.items = S.usedMkt.items.filter((x) => x !== it); conn.send({ t: 'usedReply', req: m.req, ok: true }); hostUsed(N); }
    }
  }

  // ---------- 客人 ----------
  G.netJoin = async (code, kind, opt) => {
    if (G.net) return { ok: false, msg: '已經在房間裡了' };
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return { ok: false, msg: '請輸入房主給你的房間代碼（6 個英文字母或數字）' };
    const S = G.S, transport = G.NET_TRANSPORTS[kind || 'peer'];
    let conn;
    try { conn = await transport.join(code); } catch (e) { return { ok: false, msg: e.message }; }
    const N = (G.net = makeNet('client', code, kind));
    N.conn = conn;
    N.limit = S.time; // 收到房主的時間前先不要前進
    const pending = new Map();
    N.requestUsed = (itemId) => new Promise((res) => { const req = rid(6); pending.set(req, res); conn.send({ t: 'buyUsed', itemId, req }); setTimeout(() => { if (pending.has(req)) { pending.delete(req); res({ ok: false, msg: '房主沒有回應' }); } }, 8000); });
    N.onLocalSpeed = (s) => { conn.send({ t: 'speed', s }); return true; };
    N.onNextDay = () => { conn.send({ t: 'step' }); return true; };
    N.afterSpeed = () => {};
    return new Promise((res) => {
      const timer = setTimeout(() => { G.netLeave(); res({ ok: false, msg: '房主沒有回應' }); }, 15000);
      conn.onData(async (m) => {
        if (!m) return;
        if (m.t === 'reject') { clearTimeout(timer); G.netLeave(true); res({ ok: false, msg: m.reason }); return; }
        if (m.t === 'welcome') {
          clearTimeout(timer);
          N.myId = m.id;
          S.net = { role: 'client', worldId: m.worldId, code: m.code };
          if (m.used) S.usedMkt = m.used;
          if (m.world && G.worldApply) G.worldApply(m.world);
          // 存檔比房間早：先快轉到房間的日期
          if (S.time < m.time - 60000) await catchUp(m.time);
          N.limit = Math.max(S.time, m.time);
          res({ ok: true, code: m.code });
          return;
        }
        if (m.t === 'state') {
          // v1.0 合併只傳變動部分的公司資料
          const next = {};
          let missing = false, changed = Object.keys(m.upd || {}).length > 0 || (m.ids || []).length !== Object.keys(N.players).length;
          (m.ids || []).forEach((id) => { const base = (m.upd && m.upd[id]) || N.players[id]; if (!base) { missing = true; return; } next[id] = { ...base, day: m.days[id], away: m.away[id] }; });
          N.players = next; N.limit = m.limit;
          if (changed) N.ver++;
          if (missing) conn.send({ t: 'full' });
          // 暫離回來、落後太多：快轉追上
          if (!N.catching && dayOf(S.time) < dayOf(m.limit) - 3) { N.catching = true; catchUp(m.limit - DAY).then(() => { N.catching = false; }); }
          if (m.speed !== G.speed && !(G.stepping && G.stepping())) G.setSpeed(m.speed, { user: true, remote: true });
          G.ui.updateTop();
          if (G.map) G.map.invalidate();
        } else if (m.t === 'used') S.usedMkt = m.mkt;
        else if (m.t === 'world' && G.worldApply) G.worldApply(m.pub);
        else if (m.t === 'relay') deliver(m.from, m.msg);
        else if (m.t === 'usedReply' && pending.has(m.req)) { pending.get(m.req)(m); pending.delete(m.req); }
      });
      conn.onClose(() => {
        if (G.net !== N || N.leaving) return;
        G.net = null;
        G.ui.render(); G.ui.updateTop(); if (G.map) G.map.invalidate();
        reconnect(code, kind, 1);
      });
      conn.send({ t: 'hello', summary: G.netSummary(), time: S.time, rejoin: !!(opt && opt.rejoin), worldId: S.net && S.net.role === 'client' && S.net.code === code ? S.net.worldId : null });
    });
  };
  // 快轉：每一幀跑 10 天，避免畫面卡死
  function catchUp(target) {
    return new Promise((res) => {
      const step = () => {
        const S = G.S, left = Math.round((target - S.time) / 60000);
        if (left <= 0) { G.ui.render(); return res(); }
        G.advance(Math.min(left, 1440 * 10));
        G.ui.toast(`追上房間的日期中…還有 ${Math.ceil((target - G.S.time) / DAY)} 天`);
        requestAnimationFrame(step);
      };
      step();
    });
  }
  // v1.0 斷線後自動重連：最多 4 次（2、4、6、8 秒後）
  function reconnect(code, kind, n) {
    if (G.net || !G.S) return;
    if (n > 4) { G.ui.toast('重新連線失敗，遊戲改為單人繼續。房主還在的話，可以再輸入代碼加入。', true); return; }
    G.ui.toast(`與房主的連線中斷，${n * 2} 秒後第 ${n} 次重新連線…`, true);
    setTimeout(() => {
      if (G.net || !G.S) return;
      G.netJoin(code, kind, { rejoin: true }).then((r) => { if (r.ok) { G.ui.toast('已重新連上房間'); G.ui.render(); } else reconnect(code, kind, n + 1); });
    }, n * 2000);
  }
  G.netLeave = (silent) => {
    const N = G.net;
    if (!N) return;
    N.leaving = true;
    G.net = null;
    try {
      if (N.role === 'host') { N.conns.forEach((c) => c.close()); if (N.handle) N.handle.close(); }
      else if (N.conn) { N.conn.close(); if (N.conn.closeAll) N.conn.closeAll(); }
    } catch (e) { /* 忽略 */ }
    if (!silent) G.log('離開多人連線房間');
    G.ui.updateTop(); if (G.map) G.map.invalidate();
  };
  // 每天：客人把公開資訊交給房主；房主重新計算時間上限並廣播
  G.on((what, data) => {
    const N = G.net;
    if (!N) return;
    if (what === 'day') {
      if (N.role === 'client') {
        // v1.0 公司資料有變才送
        const sum = G.netSummary(), str = JSON.stringify(sum);
        if (str !== N.lastSent) { N.lastSent = str; N.conn.send({ t: 'day', day: dayOf(G.S.time), summary: sum }); } else N.conn.send({ t: 'day', day: dayOf(G.S.time) });
      } else hostBroadcast(N);
    }
    if (what === 'event' && data && data.kind === 'used-refresh' && N.role === 'host') hostUsed(N);
    if (what === 'event' && data && data.kind === 'world' && N.role === 'host') hostWorld(N);
  });
  // 房主買二手飛機時通知大家
  const buyUsed0 = G.buyUsed;
  G.buyUsed = (...a) => { const r = buyUsed0(...a); if (r.ok && G.net && G.net.role === 'host') hostUsed(G.net); return r; };
  window.addEventListener('beforeunload', () => { if (G.net) G.netLeave(true); });
  // v1.0 暫離：客人切到背景時通知房主，房間不再等他
  document.addEventListener('visibilitychange', () => {
    const N = G.net;
    if (!N || N.role !== 'client' || !N.conn) return;
    N.conn.send({ t: 'away', on: document.hidden });
  });
  // v1.0 網路測試：向公用 STUN 伺服器查自己的公開位址，判斷能不能直連
  G.netTest = () => new Promise((res) => {
    if (!window.RTCPeerConnection) return res({ kind: 'blocked', msg: '這個瀏覽器不支援直連（WebRTC）。' });
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }); } catch (e) { return res({ kind: 'blocked', msg: '無法建立直連元件。' }); }
    const cands = [];
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      try { pc.close(); } catch (e) { /* 忽略 */ }
      const srflx = cands.filter((c) => / typ srflx/.test(c)).map((c) => { const p = c.split(' '); return { ip: p[4], port: p[5] }; });
      if (!srflx.length) return res({ kind: 'blocked', msg: '拿不到公開網路位址：你的網路可能擋住了直連（學校、公司或部分手機網路常見）。建議改用家裡的 Wi-Fi。' });
      const ports = new Set(srflx.map((x) => x.ip + ':' + x.port));
      if (ports.size > 1) return res({ kind: 'strict', msg: '你的網路是嚴格型（手機網路常見）：對方也是嚴格型時可能連不上。建議至少一方使用家裡的 Wi-Fi。' });
      res({ kind: 'open', msg: '網路看起來可以直連。' });
    };
    pc.onicecandidate = (e) => { if (e.candidate) cands.push(e.candidate.candidate); else finish(); };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') finish(); };
    pc.createDataChannel('t');
    pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => finish());
    setTimeout(finish, 5000);
  });
})();
