// v0.9.0 介面：機隊篩選排序（機型、航班編號）、航線依國家搜尋分組、開航時標示已開發的航線。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const opt = (v, n, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(n)}</option>`;

  // 搜尋框重繪後把游標放回原位
  function refocus(id, pos) {
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (e) { /* type=search 某些瀏覽器不支援 */ }
  }
  const pairOf = (a, b) => G.S.routes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  // 「A321neo×2、737-800」：這條航線目前由哪些機型執飛
  U.routeTypesText = (r) => {
    const n = {};
    G.routeAircraft(r).forEach((ac) => { const m = G.TYPES[ac.type].model; n[m] = (n[m] || 0) + 1; });
    const parts = Object.entries(n).sort((x, y) => y[1] - x[1]).map(([m, k]) => (k > 1 ? `${m}×${k}` : m));
    return parts.join('、');
  };

  // ---------- 機隊 ----------
  const FF = (U.fleetF = U.fleetF || { type: '', st: '', q: '', sort: 'reg' });
  const ST_GROUP = { flying: ['air', 'sched', 'turn'], idle: ['idle', 'stuck'], maint: ['maint', 'aog', 'refit', 'refurb'] };
  const SORTS = [['reg', '飛機編號'], ['type', '機型'], ['fno', '航班編號'], ['cond', '機況（差的在前）'], ['seats', '座位（多的在前）'], ['hours', '飛行時數（多的在前）']];
  const routeOf = (ac) => (ac.route ? G.S.routes.find((r) => r.id === ac.route) : null);
  const fnoOf = (ac) => { const r = routeOf(ac); return r && r.fno ? r.fno.out : Infinity; };
  function fleetMatch(ac) {
    const S = G.S;
    if (FF.type && ac.type !== FF.type) return false;
    if (FF.st === 'unassigned') { if (ac.route) return false; } else if (FF.st && !ST_GROUP[FF.st].includes(ac.st)) return false;
    if (!FF.q) return true;
    const q = FF.q.toUpperCase().replace(/\s+/g, ''), r = routeOf(ac), t = G.TYPES[ac.type];
    const hay = [ac.reg, t.model, t.id, ac.loc || ''];
    if (r) {
      hay.push(`${r.a}${r.b}`, `${r.b}${r.a}`, r.a + '-' + r.b);
      if (r.fno) hay.push(`${S.company.code}${r.fno.out}`, `${S.company.code}${r.fno.back}`, String(r.fno.out), String(r.fno.back));
    }
    if (ac.leg) hay.push(G.legFno(ac));
    return hay.some((h) => String(h).toUpperCase().replace(/\s+/g, '').includes(q));
  }
  function fleetSort(list) {
    const k = FF.sort, T = (ac) => G.TYPES[ac.type];
    const cmp = {
      reg: (a, b) => a.reg.localeCompare(b.reg),
      type: (a, b) => T(a).model.localeCompare(T(b).model) || a.reg.localeCompare(b.reg),
      fno: (a, b) => fnoOf(a) - fnoOf(b) || a.reg.localeCompare(b.reg),
      cond: (a, b) => (a.cond == null ? 1 : a.cond) - (b.cond == null ? 1 : b.cond),
      seats: (a, b) => G.cabinSeats(b.cabin) - G.cabinSeats(a.cabin) || a.reg.localeCompare(b.reg),
      hours: (a, b) => b.hours - a.hours,
    }[k] || (() => 0);
    return list.slice().sort(cmp);
  }
  U.fleetBody = (fleet, rowOf) => {
    const types = {};
    fleet.forEach((ac) => { types[ac.type] = (types[ac.type] || 0) + 1; });
    if (FF.type && !types[FF.type]) FF.type = '';
    const list = fleetSort(fleet.filter(fleetMatch));
    const any = FF.type || FF.st || FF.q;
    const bar = `<div class="filterbar" role="search">
      <label class="search"><span>搜尋</span><input id="fl-q" type="search" placeholder="飛機編號、航班編號或航點，例如 ${esc(G.S.company.code)}101、NRT" value="${esc(FF.q)}" autocomplete="off"></label>
      <label class="fsel"><span>機型</span><select id="fl-type" data-act="fl-type" aria-label="機型篩選">${opt('', `全部機型（${fleet.length}）`, FF.type)}${Object.entries(types).sort((a, b) => G.TYPES[a[0]].model.localeCompare(G.TYPES[b[0]].model)).map(([t, n]) => opt(t, `${G.TYPES[t].model}（${n}）`, FF.type)).join('')}</select></label>
      <label class="fsel"><span>狀態</span><select id="fl-st" data-act="fl-st" aria-label="狀態篩選">${[['', '全部狀態'], ['flying', '飛行與排班中'], ['idle', '待命'], ['maint', '檢查、修理、改裝'], ['unassigned', '未指派航線']].map(([v, n]) => opt(v, n, FF.st)).join('')}</select></label>
      <label class="fsel"><span>排序</span><select id="fl-sort" data-act="fl-sort" aria-label="排序">${SORTS.map(([v, n]) => opt(v, n, FF.sort)).join('')}</select></label>
    </div>
    <p class="note fcount">${any ? `符合 ${list.length}／${fleet.length} 架${list.length ? '' : '，請放寬條件'} <button class="linkish" data-act="fl-clear">清除篩選</button>` : `共 ${fleet.length} 架`}</p>`;
    return bar + list.map(rowOf).join('');
  };

  // ---------- 航線 ----------
  const RF = (U.routeF = U.routeF || { q: '', cc: '', sort: 'cc', group: true });
  const destOf = (r) => G.AP[r.b];
  function routeMatch(r) {
    const B = destOf(r), A = G.AP[r.a], S = G.S;
    if (RF.cc && B.cc !== RF.cc) return false;
    if (!RF.q) return true;
    const q = RF.q.toLowerCase().replace(/\s+/g, '');
    const en = window.COUNTRIES[B.cc] ? window.COUNTRIES[B.cc][1] : '';
    const hay = [r.a, r.b, A.city, B.city, B.name, G.countryZh(B.cc), en, B.cc];
    if (r.fno) hay.push(`${S.company.code}${r.fno.out}`, `${S.company.code}${r.fno.back}`);
    hay.push(U.routeTypesText(r));
    return hay.some((h) => String(h).toLowerCase().replace(/\s+/g, '').includes(q));
  }
  const profit = (r) => (r.stats.flights ? r.stats.rev - r.stats.cost : -Infinity);
  const RSORTS = [['cc', '國家'], ['profit', '本月損益'], ['dist', '距離'], ['freq', '每日班次'], ['new', '開航時間（新的在前）']];
  U.routesBody = (routes, rowOf) => {
    const cnt = {};
    routes.forEach((r) => { const c = destOf(r).cc; cnt[c] = (cnt[c] || 0) + 1; });
    if (RF.cc && !cnt[RF.cc]) RF.cc = '';
    const ccs = Object.entries(cnt).sort((a, b) => b[1] - a[1] || G.countryZh(a[0]).localeCompare(G.countryZh(b[0]), 'zh-Hant'));
    let list = routes.filter(routeMatch);
    const d = (r) => G.dist(G.AP[r.a], G.AP[r.b]);
    const by = {
      cc: (a, b) => (cnt[destOf(b).cc] - cnt[destOf(a).cc]) || G.countryZh(destOf(a).cc).localeCompare(G.countryZh(destOf(b).cc), 'zh-Hant') || d(a) - d(b),
      profit: (a, b) => profit(b) - profit(a),
      dist: (a, b) => d(a) - d(b),
      freq: (a, b) => G.routeFreq(b) - G.routeFreq(a),
      new: (a, b) => (b.since || 0) - (a.since || 0),
    }[RF.sort];
    list = list.slice().sort(by);
    const any = RF.q || RF.cc;
    const bar = `<div class="filterbar" role="search">
      <label class="search"><span>搜尋</span><input id="rt-q" type="search" placeholder="國家、城市、IATA、航班編號或機型，例如 日本、Osaka、A321" value="${esc(RF.q)}" autocomplete="off"></label>
      <label class="fsel"><span>國家</span><select id="rt-cc" data-act="rt-cc" aria-label="依國家篩選">${opt('', `全部國家（${routes.length} 條）`, RF.cc)}${ccs.map(([c, n]) => opt(c, `${G.countryZh(c)}（${n}）`, RF.cc)).join('')}</select></label>
      <label class="fsel"><span>排序</span><select id="rt-sort" data-act="rt-sort" aria-label="排序">${RSORTS.map(([v, n]) => opt(v, n, RF.sort)).join('')}</select></label>
      <label class="chk sm"><input type="checkbox" id="rt-group" data-act="rt-group" ${RF.group ? 'checked' : ''}> 依國家分組</label>
    </div>
    <div class="cc-chips">${ccs.slice(0, 12).map(([c, n]) => `<button class="chip linkish ${RF.cc === c ? 'on' : ''}" data-act="rt-ccchip" data-cc="${c}">${esc(G.countryZh(c))} ${n}</button>`).join('')}</div>
    <p class="note fcount">${any ? `符合 ${list.length}／${routes.length} 條 <button class="linkish" data-act="rt-clear">清除篩選</button>` : `共 ${routes.length} 條航線、${ccs.length} 個國家或地區`}</p>`;
    if (!list.length) return bar + '<p class="empty">沒有符合的航線。</p>';
    if (!RF.group) return bar + list.map(rowOf).join('');
    // 分組：保持排序後各國第一次出現的順序
    const groups = [];
    const idx = {};
    list.forEach((r) => { const c = destOf(r).cc; if (idx[c] == null) { idx[c] = groups.length; groups.push({ c, rs: [] }); } groups[idx[c]].rs.push(r); });
    return bar + groups.map((g) => {
      const p = g.rs.reduce((s, r) => s + (r.stats.flights ? r.stats.rev - r.stats.cost : 0), 0);
      return `<h4 class="cc-head"><span>${esc(G.countryZh(g.c))}</span><small>${g.rs.length} 條 · 本月 <b class="${p < 0 ? 'neg' : 'pos'}">${G.money(p)}</b></small></h4>${g.rs.map(rowOf).join('')}`;
    }).join('');
  };

  // ---------- 開航：已開發標示 ----------
  U.devChip = (a, b) => {
    const r = pairOf(a, b);
    if (r) {
      const t = U.routeTypesText(r);
      return ` <span class="chip dev" title="這條航線已經開航">已開發 · ${t ? esc(t) : '尚未指派飛機'}</span>`;
    }
    const other = G.S.routes.filter((x) => x.b === b || x.a === b).map((x) => (x.b === b ? x.a : x.b)).filter((h) => h !== a);
    return other.length ? ` <span class="chip" title="你已經從其他樞紐飛這個目的地">${esc(other.join('、'))} 已飛</span>` : '';
  };
  U.devBox = (a, b) => {
    const r = pairOf(a, b);
    if (!r) return '';
    const acs = G.routeAircraft(r), t = U.routeTypesText(r);
    return `<div class="callout dev"><b>已開發：${r.a} ⇄ ${r.b}${r.fno ? `（${G.routeFno(r)}）` : ''}</b>
      <p>${acs.length ? `目前由 ${esc(t)} 執飛（${acs.map((ac) => esc(ac.reg)).join('、')}），每日約 ${G.routeFreq(r).toFixed(1)} 班。` : '這條航線已經開航，但還沒有指派飛機。'}要增加班次，到「機隊」把更多飛機指派到這條航線即可。</p></div>`;
  };

  // ---------- 事件 ----------
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'fl-q' || id === 'rt-q') {
      const pos = e.target.selectionStart || e.target.value.length;
      if (id === 'fl-q') FF.q = e.target.value.trim(); else RF.q = e.target.value.trim();
      U.render();
      refocus(id, pos);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target, a = el.dataset && el.dataset.act;
    if (a === 'fl-type') FF.type = el.value;
    else if (a === 'fl-st') FF.st = el.value;
    else if (a === 'fl-sort') FF.sort = el.value;
    else if (a === 'rt-cc') RF.cc = el.value;
    else if (a === 'rt-sort') RF.sort = el.value;
    else if (a === 'rt-group') RF.group = el.checked;
    else return;
    U.render();
  });
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'fl-clear': FF.type = ''; FF.st = ''; FF.q = ''; U.render(); return;
      case 'rt-clear': RF.cc = ''; RF.q = ''; U.render(); return;
      case 'rt-ccchip': RF.cc = RF.cc === d.cc ? '' : d.cc; U.render(); return;
      case 'dev-open': { const r = pairOf(d.a, d.b); if (r) { U.closeModal(); U.expanded[r.id] = true; RF.cc = ''; RF.q = ''; U.go('routes'); } return; }
      case 'fl-type': case 'fl-st': case 'fl-sort': case 'rt-cc': case 'rt-sort': case 'rt-group': return; // 由 change 事件處理
    }
    if (act0) act0(a, d, el);
  };
})();
