// v1.2.0 介面：航線分頁的「航線清單／航線總表／開航規劃／自動指派」、換機建議（接受直接換、拒絕不再提示）、
// 機隊的使用率與閒置提醒、開航規劃在地圖上標出候選目的地。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const pct = (v) => Math.round(v * 100) + '%';
  const num = (v) => G.num(v);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const opt = (v, n, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(n)}</option>`;
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };

  U.rview = U.rview || 'list';
  const VIEWS = [['list', '航線清單'], ['table', '航線總表'], ['plan', '開航規劃'], ['auto', '自動指派']];
  const viewBar = () => {
    const S = G.S, adv = S.routes.filter((r) => r.advice && r.advice.opts && r.advice.opts.length).length, idle = G.idleAircraft().filter((ac) => !G.TYPES[ac.type].freighter).length;
    return `<div class="seg rview" role="group" aria-label="航線檢視">${VIEWS.map(([k, n]) => `<button data-act="rview" data-k="${k}" aria-pressed="${U.rview === k}">${n}${k === 'table' && adv ? ` <b class="cnt">${adv}</b>` : ''}${k === 'auto' && idle ? ` <b class="cnt">${idle}</b>` : ''}</button>`).join('')}</div>`;
  };
  const rb0 = U.routesBody;
  U.routesBody = (routes, rowOf) => {
    const v = U.rview;
    const body = v === 'table' ? tableView() : v === 'plan' ? planView() : v === 'auto' ? autoView() : rb0 ? rb0(routes, rowOf) : routes.map(rowOf).join('');
    return viewBar() + body;
  };
  // 還沒有航線時也能用開航規劃
  U.routesEmpty = () => viewBar() + (U.rview === 'plan' ? planView() : U.rview === 'auto' ? autoView() : `<div class="empty"><b>還沒有航線</b><p>點選地圖上的機場，再從機場資訊開設航線；或用「開航規劃」一次挑好幾個目的地。每條航線必須從你的樞紐出發。</p><button class="btn primary" data-act="rview" data-k="plan">開航規劃</button></div>`);

  // ====================================================================
  // 換機建議
  // ====================================================================
  U.routeAdviceChip = (r) => (r.advice && r.advice.opts && r.advice.opts.length ? '<span class="chip warn" title="換一架飛機能讓這條航線的收益提升或虧損減少超過 20%">建議更換飛機</span>' : '');
  U.routeAdviceBox = (r) => {
    if (r.adviceOff) return `<p class="note">已關閉這條航線的換機建議。<button class="linkish" data-act="adv-unmute" data-id="${r.id}">重新開啟</button></p>`;
    const a = r.advice;
    if (!a || !a.opts || !a.opts.length) return '';
    const o = a.opts[0];
    const keep = U.advKeep && U.advKeep[r.id];
    const kindZh = { idle: '換上閒置飛機', swap: '與其他航線對調', type: '租一架新飛機' };
    return `<div class="callout warn advice">
      <b>建議更換飛機</b>
      <p>${esc(G.adviceText(r, o))}。</p>
      ${o.kind === 'type' ? `<label class="chk sm"><input type="checkbox" data-act="adv-keep" data-id="${r.id}" ${keep ? 'checked' : ''}> 換下的飛機留在機隊（不${G.S.fleet.find((x) => x.id === o.cur) && G.S.fleet.find((x) => x.id === o.cur).mode === 'lease' ? '退租' : '出售'}）</label>` : ''}
      <div class="row-btns"><button class="btn sm primary" data-act="adv-accept" data-id="${r.id}" data-k="0">接受，直接更換</button><button class="btn sm" data-act="adv-mute" data-id="${r.id}">不要再提示</button></div>
      ${a.opts.length > 1 ? `<p class="note">其他做法：</p>${a.opts.slice(1).map((x, i) => `<div class="adv-alt"><span>${esc(kindZh[x.kind])}：${esc(G.adviceText(r, x))}</span><button class="btn sm" data-act="adv-accept" data-id="${r.id}" data-k="${i + 1}">改用這個</button></div>`).join('')}` : ''}
      <p class="note">換機前後都以自動最佳票價、目前的艙等配置與競爭狀況估算；提升或少虧超過 20% 才會提示。按「不要再提示」後，這條航線不再出現換機建議。</p>
    </div>`;
  };

  // ====================================================================
  // 航線總表
  // ====================================================================
  const RH = (U.rh = U.rh || { f: 'all', k: 'profit', dir: -1, sel: new Set() });
  const FILTERS = [['all', '全部'], ['advice', '建議換機'], ['loss', '虧損'], ['spill', '客滿（可加班或換大）'], ['empty', '沒有飛機'], ['low', '使用率偏低'], ['muted', '已關閉換機建議']];
  const COLS = [['route', '航線'], ['types', '執飛機型'], ['freq', '每日班次'], ['lf', '載客率'], ['profit', '近 30 天貢獻'], ['rivals', '對手'], ['util', '日均飛行']];
  const passF = (h) => ({ all: true, advice: h.advice, loss: h.loss, spill: h.spill, empty: h.empty, low: h.n > 0 && h.util > 0 && h.util < 9, muted: !!h.r.adviceOff })[RH.f];
  function tableView() {
    const S = G.S;
    const all = S.routes.map(G.routeHealth);
    const cnt = {}; FILTERS.forEach(([k]) => { const f0 = RH.f; RH.f = k; cnt[k] = all.filter(passF).length; RH.f = f0; });
    let list = all.filter(passF);
    const key = { route: (h) => h.r.a + h.r.b, types: (h) => U.routeTypesText(h.r), freq: (h) => h.freq, lf: (h) => h.lf, profit: (h) => h.profit, rivals: (h) => h.rivals, util: (h) => h.util }[RH.k] || ((h) => h.profit);
    list.sort((x, y) => { const a = key(x), b = key(y); return (a < b ? -1 : a > b ? 1 : 0) * RH.dir; });
    [...RH.sel].forEach((id) => { if (!S.routes.some((r) => r.id === id)) RH.sel.delete(id); });
    const lim = U.pageLimit('rh', RH.f + RH.k + RH.dir), rest = list.length - lim;
    const shown = list.slice(0, lim), n = RH.sel.size;
    const tot = sum(list.map((h) => h.profit));
    return `<div class="seg filter" role="group" aria-label="篩選">${FILTERS.map(([k, nm]) => `<button data-act="rh-f" data-k="${k}" aria-pressed="${RH.f === k}">${nm} ${cnt[k]}</button>`).join('')}</div>
      <p class="note fcount">${list.length} 條航線，近 30 天合計貢獻 <b class="${tot < 0 ? 'neg' : 'pos'}">${M(tot)}</b>。勾選後可以批次處理。</p>
      <div class="rh-bulk ${n ? 'on' : ''}"><span>已選 ${n} 條</span>
        <button class="btn sm" data-act="rh-all">${n && shown.every((h) => RH.sel.has(h.r.id)) ? '取消全選' : '全選這頁'}</button>
        <button class="btn sm primary" data-act="rh-bulk" data-k="advice" ${n ? '' : 'disabled'}>套用換機建議</button>
        <button class="btn sm" data-act="rh-bulk" data-k="autofare" ${n ? '' : 'disabled'}>開啟自動定價</button>
        <button class="btn sm" data-act="rh-bulk" data-k="unassign" ${n ? '' : 'disabled'}>解除指派飛機</button>
        ${RH.f === 'muted' ? `<button class="btn sm" data-act="rh-bulk" data-k="unmute" ${n ? '' : 'disabled'}>重新開啟換機建議</button>` : ''}
        <button class="btn sm danger" data-act="rh-bulk" data-k="close" ${n ? '' : 'disabled'}>停飛</button></div>
      <div class="rh-sortbar"><span>排序</span>${COLS.map(([k, nm]) => `<button class="chip linkish ${RH.k === k ? 'on' : ''}" data-act="rh-sort" data-k="${k}">${nm}${RH.k === k ? (RH.dir < 0 ? ' ▼' : ' ▲') : ''}</button>`).join('')}</div>
      ${list.length ? `<div class="rh-list">${shown.map((h) => { const r = h.r; return `<div class="rh-row ${RH.sel.has(r.id) ? 'sel' : ''}">
          <input type="checkbox" data-act="rh-sel" data-id="${r.id}" ${RH.sel.has(r.id) ? 'checked' : ''} aria-label="選取 ${r.a}–${r.b}">
          <div class="rh-main"><button class="linkish" data-act="rh-open" data-id="${r.id}"><b>${r.a}–${r.b}</b></button> <small>${esc(G.AP[r.b].city)} · ${num(h.d)} 公里</small>
            <div class="rh-meta">${esc(U.routeTypesText(r)) || '沒有飛機'} · 每日 ${h.freq ? h.freq.toFixed(1) : 0} 班 · 載客率 ${h.flights ? pct(h.lf) : '—'} · 對手 ${h.rivals}${h.n && h.util ? ` · 日均飛行 ${h.util.toFixed(1)} 小時` : ''}</div>
            <div class="rh-flags">${h.advice ? `<button class="chip warn linkish" data-act="rh-open" data-id="${r.id}">建議換機</button>` : ''}${h.loss ? '<span class="chip warn">虧損</span>' : ''}${h.spill ? '<span class="chip fit-l">客滿</span>' : ''}${h.empty ? '<span class="chip">沒有飛機</span>' : ''}${h.war ? '<span class="chip warn">價格戰</span>' : ''}${r.autoFare ? '' : '<span class="chip">手動票價</span>'}</div></div>
          <div class="rh-num ${h.profit < 0 ? 'neg' : 'pos'}">${h.flights ? M(h.profit) : '—'}<small>近 30 天</small></div></div>`; }).join('')}</div>${U.moreBtn('rh', rest, '條')}` : '<p class="empty">沒有符合的航線。</p>'}
      <p class="note">近 30 天貢獻＝票價收入－飛行直接成本，不含飛機租金與人事、樞紐、管理費。「客滿」是載客率 90% 以上，或 80% 以上且經濟艙票價已拉到參考價 115%；「使用率偏低」是每架飛機日均飛行不到 9 小時。換機建議每天輪流評估幾條航線，約一到兩週評估完一輪。</p>`;
  }

  // ====================================================================
  // 開航規劃
  // ====================================================================
  const PL = (U.pl = U.pl || { hub: null, ref: '', band: 'all', cont: '', sel: new Set(), assign: true, cache: null, key: '' });
  const BANDS = [['all', '全部距離', 0, Infinity], ['short', '短程（1,500 公里內）', 0, 1500], ['mid', '中程（1,500–4,500）', 1500, 4500], ['long', '長程（4,500 以上）', 4500, Infinity]];
  const sigOf = (ac) => ac.type + '|' + G.cabinSeats(ac.cabin);
  function refOptions() {
    const idle = {};
    G.idleAircraft().filter((ac) => !G.TYPES[ac.type].freighter).forEach((ac) => { const k = sigOf(ac); (idle[k] = idle[k] || { ac, n: 0 }).n++; });
    const own = [...new Set(G.S.fleet.map((ac) => ac.type))];
    const types = window.AIRCRAFT.filter((t) => !t.used && !t.freighter && !(t.only && !t.only.includes(G.homeCC())));
    types.sort((a, b) => (own.includes(b.id) - own.includes(a.id)) || a.maxSeats - b.maxSeats);
    return { idle: Object.entries(idle), types };
  }
  function refAircraft(o) {
    if (PL.ref.startsWith('idle:')) { const x = o.idle.find(([k]) => 'idle:' + k === PL.ref); if (x) return x[1].ac; }
    const id = PL.ref.startsWith('type:') ? PL.ref.slice(5) : (o.idle[0] ? null : 'A20N');
    if (!id && o.idle[0]) { PL.ref = 'idle:' + o.idle[0][0]; return o.idle[0][1].ac; }
    const t = G.TYPES[id] || G.TYPES.A20N;
    PL.ref = 'type:' + t.id;
    return { id: -1, type: t.id, cabin: G.defaultCabin(t), mode: 'lease', lease: G.leaseMonthly(t) };
  }
  function planList() {
    const S = G.S, hubs = Object.keys(S.hubs);
    if (!PL.hub || !S.hubs[PL.hub]) PL.hub = G.primaryHub() || hubs[0];
    const o = refOptions(), ref = refAircraft(o), band = BANDS.find((b) => b[0] === PL.band) || BANDS[0];
    const key = [PL.hub, PL.ref, PL.band, PL.cont, S.routes.length, S.company.code].join('|');
    if (PL.cache && PL.key === key) return { o, ref, list: PL.cache };
    PL.key = key;
    PL.cache = G.planRoutes(PL.hub, ref, { minD: band[2], maxD: band[3], limit: 30, scan: 80, cont: PL.cont }).filter((c) => !PL.cont || G.continentOf(c.ap) === PL.cont);
    PL.sel = new Set([...PL.sel].filter((i) => PL.cache.some((c) => c.iata === i)));
    if (G.map) G.map.invalidate();
    return { o, ref, list: PL.cache };
  }
  function planView() {
    const S = G.S, hubs = Object.keys(S.hubs);
    if (!hubs.length) return '<div class="empty"><b>還沒有樞紐</b><p>先在地圖上選一座機場設為主要樞紐。</p></div>';
    const { o, ref, list } = planList();
    const t = G.TYPES[ref.type], isType = ref.id < 0;
    const conts = ['亞洲', '歐洲', '北美洲', '南美洲', '大洋洲', '非洲'];
    const sel = list.filter((c) => PL.sel.has(c.iata)), fee = sum(sel.map((c) => c.fee));
    return `<div class="filterbar plan-bar">
        <label class="fsel"><span>出發樞紐</span><select data-act="pl-hub">${hubs.map((h) => opt(h, `${h} ${G.AP[h].city}`, PL.hub)).join('')}</select></label>
        <label class="fsel"><span>用哪架飛機估算</span><select data-act="pl-ref">
          ${o.idle.length ? `<optgroup label="機隊裡的閒置飛機">${o.idle.map(([k, x]) => opt('idle:' + k, `${G.TYPES[x.ac.type].model}（${G.cabinSeats(x.ac.cabin)} 座）閒置 ${x.n} 架`, PL.ref)).join('')}</optgroup>` : ''}
          <optgroup label="租一架新的（扣租金）">${o.types.map((x) => opt('type:' + x.id, `${x.model}（${G.cabinSeats(G.defaultCabin(x))} 座，航程 ${num(x.range)} 公里）`, PL.ref)).join('')}</optgroup></select></label>
        <label class="fsel"><span>距離</span><select data-act="pl-band">${BANDS.map(([k, n]) => opt(k, n, PL.band)).join('')}</select></label>
        <label class="fsel"><span>洲</span><select data-act="pl-cont">${opt('', '全部', PL.cont)}${conts.map((c) => opt(c, c, PL.cont)).join('')}</select></label>
      </div>
      <p class="note">從 ${PL.hub} 出發、還沒開的目的地中，市場最大的 80 個，依「${esc(t.model)}單獨飛這條航線的每日航線貢獻${isType ? '，扣掉月租與人事、管理等間接成本' : ''}」排序；地圖上的編號是排名。點目的地看完整的市場資料。</p>
      ${list.length ? `<div class="rh-list">${list.map((c, i) => `<div class="rh-row ${PL.sel.has(c.iata) ? 'sel' : ''}"><input type="checkbox" data-act="pl-sel" data-iata="${c.iata}" ${PL.sel.has(c.iata) ? 'checked' : ''} aria-label="選取 ${c.iata}">
          <div class="rh-main"><span class="rank">${i + 1}</span> <button class="linkish" data-act="pl-detail" data-iata="${c.iata}"><b>${c.iata}</b> ${esc(c.ap.city)}</button> <small>${esc(G.countryZh(c.ap.cc))}</small>
            <div class="rh-meta">${num(c.d)} 公里 · 每日市場 ${num(c.market)} 人 · 對手 ${c.rivals} 家 · 預估載客率 ${pct(c.lf)}</div>
            <div class="rh-flags">${c.war ? '<span class="chip warn">價格戰</span>' : ''}${c.slot ? '<span class="chip warn" title="需要購買時刻帶">時刻帶</span>' : ''}${c.curfew ? '<span class="chip curfew">宵禁</span>' : ''}</div></div>
          <div class="rh-num ${c.profit < 0 ? 'neg' : 'pos'}">${M(c.profit)}<small>每日</small></div></div>`).join('')}</div>` : '<p class="empty">找不到符合條件、這架飛機飛得到的目的地。換一個距離範圍或機型試試。</p>'}
      <div class="rh-bulk ${sel.length ? 'on' : ''}"><span>已選 ${sel.length} 個目的地，開航費合計 ${M(fee)}</span>
        <label class="chk sm"><input type="checkbox" data-act="pl-assign" ${PL.assign ? 'checked' : ''}> 同時指派最適合的閒置飛機</label>
        <button class="btn sm primary" data-act="pl-go" ${sel.length ? '' : 'disabled'}>開設 ${sel.length} 條航線</button>
        <button class="btn sm" data-act="pl-recalc">重新計算</button></div>`;
  }
  // 地圖：標出候選目的地與排名
  const ov0 = G.map && G.map.overlay;
  if (G.map) G.map.overlay = (c, P) => {
    if (ov0) ov0(c, P);
    const S = G.S;
    if (!S || U.tab !== 'routes' || U.rview !== 'plan' || !PL.cache || !PL.hub || !G.AP[PL.hub]) return;
    const H = G.AP[PL.hub];
    c.save();
    c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    PL.cache.forEach((x, i) => {
      for (const o of P.offsets()) {
        const [px, py] = P.toScreen(x.ap.lon, x.ap.lat, o);
        if (px < -20 || px > P.W + 20 || py < -20 || py > P.H + 20) continue;
        const on = PL.sel.has(x.iata), rr = on ? 11 : 9;
        if (on) { const [hx, hy] = P.toScreen(H.lon, H.lat, o); c.beginPath(); c.moveTo(hx, hy); c.lineTo(px, py); c.setLineDash([4, 4]); c.lineWidth = 1.4; c.strokeStyle = 'rgba(200,110,20,0.8)'; c.stroke(); c.setLineDash([]); }
        c.beginPath(); c.arc(px, py, rr, 0, 7);
        c.fillStyle = on ? '#d9730d' : x.profit > 0 ? 'rgba(25,135,84,0.92)' : 'rgba(150,150,150,0.85)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
        c.fillStyle = '#fff'; c.fillText(String(i + 1), px, py + 0.5);
      }
    });
    c.restore();
  };

  // ====================================================================
  // 自動指派
  // ====================================================================
  const AU = (U.au = U.au || { plan: null, pick: new Set(), fresh: true });
  function autoView() {
    const S = G.S, idle = G.idleAircraft().filter((ac) => !G.TYPES[ac.type].freighter);
    const P = AU.plan;
    const head = `<p class="note">把閒置的客機一次指派好：每次挑「多一架飛機後航線貢獻增加最多」的航線；現有航線都不划算時，再從飛機所在的樞紐找還沒開的目的地。套用前可以取消勾選。</p>
      <div class="row-btns"><button class="btn primary" data-act="au-calc" ${idle.length ? '' : 'disabled'}>計算 ${idle.length} 架閒置飛機的指派</button>
      <label class="chk sm"><input type="checkbox" data-act="au-fresh" ${AU.fresh ? 'checked' : ''}> 必要時開新航線</label></div>`;
    if (!idle.length && !P) return head + '<p class="empty">目前沒有閒置的客機。</p>';
    if (!P) return head + `<p class="note">閒置：${esc(Object.entries(idle.reduce((m, ac) => { const k = G.TYPES[ac.type].model; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, n]) => `${k} × ${n}`).join('、'))}</p>`;
    const acOf = (id) => S.fleet.find((x) => x.id === id), rOf = (id) => S.routes.find((x) => x.id === id);
    const plan = P.plan.filter((x) => acOf(x.ac) && rOf(x.route)), fresh = P.fresh.filter((x) => acOf(x.ac));
    const picked = [...plan.map((x, i) => (AU.pick.has('p' + i) ? x.gain : 0)), ...fresh.map((x, i) => (AU.pick.has('f' + i) ? x.gain : 0))];
    const fee = sum(fresh.map((x, i) => (AU.pick.has('f' + i) ? x.fee : 0)));
    return head + `${plan.length ? `<h4>指派到現有航線（${plan.length} 架）</h4><div class="table-wrap"><table class="rh-table"><thead><tr><th><span class="sr">選取</span></th><th>飛機</th><th>航線</th><th>每日貢獻增加</th></tr></thead><tbody>
        ${plan.map((x, i) => { const ac = acOf(x.ac), r = rOf(x.route); return `<tr><td><input type="checkbox" data-act="au-pick" data-k="p${i}" ${AU.pick.has('p' + i) ? 'checked' : ''}></td><td><b>${esc(ac.reg)}</b> ${esc(G.TYPES[ac.type].model)}</td><td>${r.a}–${r.b} <small class="fno">${esc(G.AP[r.b].city)}</small></td><td class="pos">${M(x.gain)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      ${fresh.length ? `<h4>開新航線（${fresh.length} 條）</h4><div class="table-wrap"><table class="rh-table"><thead><tr><th><span class="sr">選取</span></th><th>飛機</th><th>新航線</th><th>開航費</th><th>預估每日貢獻</th></tr></thead><tbody>
        ${fresh.map((x, i) => { const ac = acOf(x.ac); return `<tr><td><input type="checkbox" data-act="au-pick" data-k="f${i}" ${AU.pick.has('f' + i) ? 'checked' : ''}></td><td><b>${esc(ac.reg)}</b> ${esc(G.TYPES[ac.type].model)}</td><td>${x.a}–${x.b} <small class="fno">${esc(G.AP[x.b].city)}</small></td><td>${M(x.fee)}</td><td class="pos">${M(x.gain)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      ${P.left.length ? `<p class="note">另有 ${P.left.length} 架找不到划算的航線，維持閒置；可以出售、退租，或到「開航規劃」換個區域找。</p>` : ''}
      <div class="rh-bulk on"><span>選取的指派預估每日貢獻增加 <b class="pos">${M(sum(picked))}</b>${fee ? `，開航費 ${M(fee)}` : ''}</span>
        <button class="btn sm primary" data-act="au-apply" ${picked.some((x) => x) ? '' : 'disabled'}>套用</button><button class="btn sm" data-act="au-clear">放棄</button></div>`;
  }

  // ====================================================================
  // 機隊：使用率與閒置提醒
  // ====================================================================
  const th0 = U.acThumb;
  U.acThumb = (ac) => {
    const base = th0 ? th0(ac) : '';
    if (ac.uh == null || !ac.route) return base;
    const chip = `<span class="chip ${ac.uh < 9 ? 'warn' : ''}" title="近期平均每天的飛行時數">日均飛行 ${ac.uh.toFixed(1)} 小時</span>`;
    return base ? base.replace('</p>', chip + '</p>') : `<p class="ac-tags">${chip}</p>`;
  };
  const fb0 = U.fleetBody;
  U.fleetBody = (fleet, rowOf) => {
    const idle = G.idleAircraft().filter((ac) => !G.TYPES[ac.type].freighter);
    const box = idle.length ? `<div class="callout idle-box"><b>${idle.length} 架客機閒置中</b><p>閒置的飛機照樣要付租金或資金成本。</p><div class="row-btns"><button class="btn sm primary" data-act="go-auto">自動指派</button><button class="btn sm" data-act="go-plan">開航規劃</button></div></div>` : '';
    return box + (fb0 ? fb0(fleet, rowOf) : fleet.map(rowOf).join(''));
  };
  // 總覽：換機建議與閒置飛機
  const oe0 = U.overviewExtra;
  U.overviewExtra = () => {
    const S = G.S, adv = S.routes.filter((r) => r.advice && r.advice.opts && r.advice.opts.length).length, idle = G.idleAircraft().filter((ac) => !G.TYPES[ac.type].freighter).length;
    const tip = adv || idle ? `<div class="callout v12-tip"><p>${adv ? `<b>${adv} 條航線建議更換飛機</b> <button class="linkish" data-act="go-advice">查看</button>` : ''}${adv && idle ? '　' : ''}${idle ? `<b>${idle} 架客機閒置</b> <button class="linkish" data-act="go-auto">自動指派</button>` : ''}</p></div>` : '';
    return (oe0 ? oe0() : '') + tip;
  };

  // ====================================================================
  // 動作
  // ====================================================================
  const ch0 = U.change3;
  U.change3 = (el, a) => {
    switch (a) {
      case 'rh-sel': { const id = +el.dataset.id; if (el.checked) RH.sel.add(id); else RH.sel.delete(id); U.render(); return true; }
      case 'pl-sel': { const i = el.dataset.iata; if (el.checked) PL.sel.add(i); else PL.sel.delete(i); U.render(); G.map.invalidate(); return true; }
      case 'pl-hub': PL.hub = el.value; PL.sel.clear(); U.render(); return true;
      case 'pl-ref': PL.ref = el.value; U.render(); return true;
      case 'pl-band': PL.band = el.value; U.render(); return true;
      case 'pl-cont': PL.cont = el.value; U.render(); return true;
      case 'pl-assign': PL.assign = el.checked; return true;
      case 'au-pick': { const k = el.dataset.k; if (el.checked) AU.pick.add(k); else AU.pick.delete(k); U.render(); return true; }
      case 'au-fresh': AU.fresh = el.checked; AU.plan = null; U.render(); return true;
      case 'adv-keep': U.advKeep = U.advKeep || {}; U.advKeep[+el.dataset.id] = el.checked; return true;
    }
    return ch0 ? ch0(el, a) : false;
  };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'rview': U.rview = d.k; U.render(); if (G.map) G.map.invalidate(); return;
      case 'go-auto': U.rview = 'auto'; U.go('routes'); return;
      case 'go-plan': U.rview = 'plan'; U.go('routes'); return;
      case 'go-advice': U.rview = 'table'; RH.f = 'advice'; U.go('routes'); return;
      case 'rh-f': RH.f = d.k; U.render(); return;
      case 'rh-sort': if (RH.k === d.k) RH.dir *= -1; else { RH.k = d.k; RH.dir = d.k === 'route' || d.k === 'types' ? 1 : -1; } U.render(); return;
      case 'rh-open': U.rview = 'list'; U.expanded[+d.id] = true; if (U.routeF) { const r0 = G.S.routes.find((x) => x.id === +d.id); U.routeF.q = r0 ? r0.b : ''; U.routeF.cc = ''; } U.render(); setTimeout(() => { const b = document.querySelector(`[data-act="route-toggle"][data-id="${d.id}"]`); if (b) b.scrollIntoView({ block: 'start' }); }, 30); return;
      case 'rh-all': {
        const vis = [...document.querySelectorAll('input[data-act="rh-sel"]')].map((x) => +x.dataset.id);
        const allOn = vis.length && vis.every((id) => RH.sel.has(id));
        vis.forEach((id) => (allOn ? RH.sel.delete(id) : RH.sel.add(id)));
        U.render(); return;
      }
      case 'rh-bulk': {
        const ids = [...RH.sel];
        if (!ids.length) return;
        if (d.k === 'close' && !el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = `再按一次：停飛 ${ids.length} 條`; return; }
        const r = G.bulkRoutes(ids, d.k);
        const zh = { advice: '套用換機建議', autofare: '開啟自動定價', unassign: '解除指派', close: '停飛', unmute: '重新開啟換機建議' }[d.k];
        U.toast(`${zh}：${r.n} 條航線`);
        if (d.k === 'close') RH.sel.clear();
        U.render(); G.map.invalidate(); return;
      }
      case 'adv-accept': {
        const r = res(G.applyAdvice(+d.id, +d.k, { keep: U.advKeep && U.advKeep[+d.id] }), '已更換飛機');
        if (r.ok) { U.render(); G.map.invalidate(); }
        return;
      }
      case 'adv-mute': G.muteAdvice(+d.id, true); U.toast('這條航線不再提示換機建議'); U.render(); return;
      case 'adv-unmute': G.muteAdvice(+d.id, false); { const r = G.S.routes.find((x) => x.id === +d.id); if (r) G.refreshAdvice(r, false); } U.render(); return;
      case 'pl-detail': U.routeDialog(PL.hub, d.iata); return;
      case 'pl-recalc': PL.cache = null; U.render(); return;
      case 'pl-go': {
        const list = [...PL.sel];
        const r = G.openRoutesBulk(PL.hub, list, PL.assign);
        if (r.opened) U.toast(`開設 ${r.opened} 條航線${PL.assign ? `，指派 ${r.n} 架閒置飛機` : ''}${r.fails.length ? `；${r.fails.length} 條沒開成：${r.fails[0]}` : ''}`, !!r.fails.length);
        else U.toast(r.msg || '沒有開成任何航線', true);
        PL.sel.clear(); PL.cache = null; U.render(); G.map.invalidate(); return;
      }
      case 'au-calc': {
        U.toast('計算中…');
        setTimeout(() => {
          AU.plan = G.autoAssignPlan(null, { newRoutes: AU.fresh });
          AU.pick = new Set([...AU.plan.plan.map((x, i) => 'p' + i), ...AU.plan.fresh.map((x, i) => 'f' + i)]);
          if (!AU.plan.plan.length && !AU.plan.fresh.length) U.toast('找不到划算的指派', true);
          U.render();
        }, 30);
        return;
      }
      case 'au-apply': {
        if (!AU.plan) return;
        const r = G.applyAssignPlan(AU.plan, AU.pick);
        U.toast(`已指派 ${r.n} 架飛機${r.opened ? `，新開 ${r.opened} 條航線` : ''}${r.fails.length ? `；${r.fails.length} 項失敗：${r.fails[0]}` : ''}`, !!r.fails.length);
        AU.plan = null; U.render(); G.map.invalidate(); return;
      }
      case 'au-clear': AU.plan = null; U.render(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
