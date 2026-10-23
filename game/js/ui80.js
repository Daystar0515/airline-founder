// v0.8.0 介面：地圖顯示切換、前十大賺錢航線、航線換大／換小機型建議。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const pct = (v) => Math.round(v * 100) + '%';
  const DAY = 86400000;

  // ---------- 地圖顯示 ----------
  const syncLayers = () => {
    const s = G.map.show, k = s.routes && s.planes ? 'both' : s.routes ? 'routes' : 'planes';
    document.querySelectorAll('#layers button[data-act="layers"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
  };
  U.setLayers = (k) => {
    G.map.show = { routes: k !== 'planes', planes: k !== 'routes' };
    try { localStorage.setItem('af-map-layers', k); } catch (e) { /* 存不了就算了 */ }
    syncLayers(); G.map.invalidate();
  };
  setTimeout(syncLayers, 0);

  // ---------- 前十大賺錢航線 ----------
  let period = 'last';
  const PERIODS = [['mtd', '本月至今'], ['last', '上個月'], ['q', '近 3 個月']];
  function routeNumbers(r) {
    const h = r.hist || [], st = r.stats || {};
    const sum = (arr) => arr.reduce((o, x) => { ['pax', 'seats', 'rev', 'cost', 'flights'].forEach((k) => (o[k] += x[k] || 0)); return o; }, { pax: 0, seats: 0, rev: 0, cost: 0, flights: 0 });
    const v = period === 'mtd' ? sum([st]) : period === 'last' ? sum(h.slice(-1)) : sum(h.slice(-3));
    const months = period === 'mtd' ? new Date(G.S.time).getUTCDate() / 30 : period === 'last' ? (h.length ? 1 : 0) : Math.min(3, h.length);
    // 分攤目前指派飛機的租金（自有飛機用同機型月租當資金成本）
    const lease = G.routeAircraft(r).reduce((s, ac) => s + (ac.mode === 'lease' ? ac.lease : G.leaseMonthly(G.TYPES[ac.type])), 0) * months;
    return { ...v, lease, profit: v.rev - v.cost, net: v.rev - v.cost - lease, lf: v.seats ? v.pax / v.seats : 0 };
  }
  U.topRoutes = () => {
    const S = G.S;
    const rows = S.routes.map((r) => ({ r, n: routeNumbers(r) })).filter((x) => x.n.flights > 0).sort((a, b) => b.n.profit - a.n.profit);
    const top = rows.slice(0, 10), max = Math.max(1, ...top.map((x) => Math.abs(x.n.profit)));
    const losing = rows.filter((x) => x.n.profit < 0);
    return `<div class="seg" role="group" aria-label="期間">${PERIODS.map(([k, n]) => `<button data-act="top-period" data-k="${k}" aria-pressed="${period === k}">${n}</button>`).join('')}</div>
      <h3>前十大賺錢航線</h3>
      ${top.length ? `<div class="table-wrap"><table class="top-routes"><thead><tr><th>#</th><th>航線</th><th>載客率</th><th>營收</th><th>航線貢獻</th><th>扣租金後</th></tr></thead><tbody>
        ${top.map(({ r, n }, i) => `<tr><td>${i + 1}</td><td><button class="linkish" data-act="top-open" data-id="${r.id}"><b>${r.a}–${r.b}</b></button><small class="fno">${G.num(n.flights)} 班</small></td>
          <td>${pct(n.lf)}</td><td>${M(n.rev)}</td><td class="${n.profit < 0 ? 'neg' : 'pos'}">${M(n.profit)}<span class="pbar ${n.profit < 0 ? 'neg' : ''}"><i style="width:${(Math.abs(n.profit) / max) * 100}%"></i></span></td>
          <td class="${n.net < 0 ? 'neg' : ''}">${M(n.net)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">這段期間還沒有航班資料。</p>'}
      <p class="note">航線貢獻＝票價收入－飛行直接成本（燃油、機組津貼、機場、航路、維修、餐飲以外的機上服務）；「扣飛機租金後」再扣掉目前執飛飛機的月租（自有飛機以同機型月租當資金成本）。人事、樞紐與管理費用不分攤到航線。</p>
      ${losing.length ? `<p class="note neg-note">共有 ${losing.length} 條航線虧損：${losing.slice(-5).reverse().map(({ r, n }) => `${r.a}–${r.b}（${M(n.profit)}）`).join('、')}</p>` : ''}`;
  };

  // ---------- 換大／換小機型 ----------
  U.routeAdviceChip = (r) => {
    const a = r.advice;
    if (!a) return '';
    return a.dir === 'up' ? `<span class="chip fit-l" title="載客率高，換大飛機可以多賺">可換大機型</span>` : `<span class="chip warn" title="載客率低或虧損，換小飛機可以少虧">建議換小機型</span>`;
  };
  U.routeAdviceBox = (r) => {
    const a = r.advice, S = G.S;
    if (!a) return '';
    const cur = S.fleet.find((x) => x.id === a.cur);
    if (!cur) return '';
    const curT = G.TYPES[cur.type];
    const idle = a.idle.map((x) => ({ ...x, ac: S.fleet.find((y) => y.id === x.id) })).filter((x) => x.ac && !x.ac.route && !x.ac.charter);
    const t = a.type && G.TYPES[a.type.id];
    const up = a.dir === 'up';
    return `<div class="callout ${up ? '' : 'warn'} advice">
      <b>${up ? '需求旺盛，可以換大飛機' : '需求不足，建議換小飛機'}</b>
      <p>近 30 天載客率 ${pct(a.lf)}。目前由 ${esc(cur.reg)}（${esc(curT.model)}，${G.cabinSeats(cur.cabin)} 座）執飛，預估每日航線貢獻 ${M(a.curProfit)}。</p>
      ${idle.length ? idle.map((x) => `<div class="row-btns"><button class="btn sm primary" data-act="swap-ac" data-r="${r.id}" data-from="${cur.id}" data-to="${x.ac.id}">換上閒置的 ${esc(x.ac.reg)}（${esc(G.TYPES[x.ac.type].model)}，${G.cabinSeats(x.ac.cabin)} 座）</button><small>預估每日 ${up ? '多賺' : '少虧'} ${M(x.gain)}</small></div>`).join('') : ''}
      ${t ? `<p class="note">${idle.length ? '也可以' : '機隊裡沒有合適的閒置飛機。可以'}${up ? '購買或租賃' : '改租'} <b>${esc(t.model)}</b>：扣掉租金後預估每日 ${up ? '多賺' : '少虧'} ${M(a.type.gain)}。</p><div class="row-btns"><button class="btn sm" data-act="order" data-t="${t.id}" data-mode="lease">租賃 ${esc(t.model)}</button><button class="btn sm" data-act="order" data-t="${t.id}" data-mode="buy">購買 ${esc(t.model)}</button></div>` : ''}
      <p class="note">每條航線每週重新評估一次；以目前的票價、艙等配置與競爭狀況估算。</p>
    </div>`;
  };

  // ---------- 動作 ----------
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'layers': U.setLayers(d.k); return;
      case 'top-period': period = d.k; U.render(); return;
      case 'top-open': U.expanded[+d.id] = true; U.go('routes'); return;
      case 'swap-ac': if (res(G.swapAircraft(+d.r, +d.from, +d.to), '已換機').ok) { U.render(); G.map.invalidate(); } return;
    }
    if (act0) act0(a, d, el);
  };
})();
