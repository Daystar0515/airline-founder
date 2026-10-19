// v0.7.0 介面：競爭分頁（真實航空公司）、機場的航空公司、開航視窗的競爭與飛行路徑、航線列表的競爭標示。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => Math.round(v * 100) + '%';
  const num = (v) => G.num(Math.round(v));
  const badge = (c) => `<span class="cbadge" style="--c:${c.color || G.carrierColor(c.code)}">${esc(c.code)}</span>`;
  const typeChip = (c) => (c.human ? '<span class="chip warn">玩家</span>' : `<span class="chip ${c.lcc ? 'fit-l' : 'fit-b'}">${c.lcc ? '低成本' : '傳統'}</span>`);
  const DISCLAIMER = '航空公司名稱與航線來自 2026 年公開航線資料，僅供遊戲模擬。本作為非官方粉絲作品，與各航空公司無關、未經授權；遊戲中的班次、票價與經營表現皆為估算或虛構，真實航空公司在遊戲裡不會破產，也不會出現醜聞或飛安事故。';

  // ---------- 開航視窗：飛行路徑、競爭對手 ----------
  U.pathNote = (A, B) => {
    const p = G.flightPath(A, B);
    if (p.wps.length <= 2) return '';
    return `<small class="src">實際飛行約 ${G.num(p.km)} 公里（${esc(p.via.join('、'))}，比直線多 ${pct(p.km / p.direct - 1)}）</small>`;
  };
  U.rivalFacts = (A, B) => {
    const rv = G.rivalsOn(A.iata, B.iata).sort((x, y) => y.f - x.f);
    if (!rv.length) return `<h4>競爭航空公司</h4><p class="note">目前沒有航空公司直飛這條航線，可以獨占市場（旅客仍可能轉機或改搭其他交通工具）。</p>`;
    const r = { a: A.iata, b: B.iata };
    const sg = G.routeSegments(A, B), base = 0.15 + 0.25 * Math.exp(-sg.total / 300);
    const dL = G.rivalDilution(r, 'L', 'Y', 1, base), dB = G.rivalDilution(r, 'B', 'J', 1, base);
    return `<h4>競爭航空公司（${rv.length} 家）</h4>
      <div class="table-wrap"><table class="rv-table"><thead><tr><th>航空公司</th><th>類型</th><th>每日班次（估）</th><th>經濟艙票價</th></tr></thead><tbody>
      ${rv.map((x) => `<tr><td>${badge(x.c)} ${esc(G.carrierName(x.c))}${x.hub ? '<small class="muted"> 樞紐</small>' : ''}</td><td>${typeChip(x.c)}</td><td>${x.f.toFixed(1)}</td><td>${x.war ? `<b class="neg">${pct(x.p)}</b> 降價中` : pct(x.p)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">競爭讓你在這條航線的攬客力剩約：觀光客 ${pct(dL)}、商務客 ${pct(dB)}（以標準產品估算；班次越多、座椅越好、評價越高，被稀釋得越少）。票價以參考票價為 100%。</p>`;
  };
  U.routeRivalChip = (r) => {
    const rv = G.rivalsOn(r.a, r.b);
    if (!rv.length) return '<span class="chip fit-l" title="沒有其他航空公司直飛">獨飛</span>';
    const war = rv.filter((x) => x.war).length;
    return `<span class="chip" title="${esc(rv.map((x) => G.carrierName(x.c)).join('、'))}">${rv.length} 家競爭</span>${war ? `<span class="chip warn" title="對手正在降價迎戰">價格戰</span>` : ''}`;
  };
  // ---------- 機場頁：在此營運的航空公司 ----------
  U.airportExtra = (ap) => {
    const list = G.carriersAt(ap.iata);
    if (!list.length) return '';
    const hubOf = list.filter(([code]) => G.CARRIERS[code].hubs.includes(ap.iata));
    return `<h3>在此營運的航空公司（${list.length} 家）</h3>
      ${hubOf.length ? `<p class="note">以這裡為樞紐：${hubOf.map(([code]) => esc(G.carrierName(G.CARRIERS[code]))).join('、')}</p>` : ''}
      <div class="chips">${list.slice(0, 24).map(([code, n]) => `<button class="chip linkish" data-act="rv-open" data-code="${code}">${esc(G.carrierName(G.CARRIERS[code]))} · ${n}</button>`).join('')}${list.length > 24 ? `<span class="chip">另 ${list.length - 24} 家</span>` : ''}</div>`;
  };

  // ---------- 競爭分頁 ----------
  let q = '', sel = null;
  function matches(c) {
    if (!q) return false;
    const s = q.toLowerCase();
    return c.code.toLowerCase() === s || c.name.toLowerCase().includes(s) || (c.zh && c.zh.includes(q)) || G.countryZh(c.cc).includes(q);
  }
  function listRows() {
    const S = G.S, home = G.homeCC();
    const all = Object.values(G.CARRIERS).filter((c) => c.code !== S.company.code);
    let rows;
    if (q) rows = all.filter(matches);
    else {
      const overlap = new Set(); S.routes.forEach((r) => G.carriersOn(r.a, r.b).forEach((x) => overlap.add(x)));
      rows = all.filter((c) => c.cc === home || overlap.has(c.code));
    }
    rows.sort((a, b) => b.routes.length - a.routes.length);
    if (!rows.length) return `<p class="empty">${q ? '找不到符合的航空公司。' : '目前沒有同國或同航線的航空公司。'}</p>`;
    return rows.slice(0, 60).map((c) => {
      const ov = G.carrierOverlap(c.code).length, open = sel === c.code;
      return `<article class="rv ${open ? 'open' : ''}">
        <button class="rv-head" data-act="rv-open" data-code="${c.code}" aria-expanded="${open}">${badge(c)}<span class="rv-name"><b>${esc(G.carrierName(c))}</b><small>${esc(c.name)} · ${esc(G.countryZh(c.cc))}</small></span>${typeChip(c)}${U.allyChip ? U.allyChip(c.code) : ''}<span class="rv-num">${c.nDest} 航點${ov ? `<em>${ov} 條與你重疊</em>` : ''}</span></button>
        ${open ? detail(c) : ''}
      </article>`;
    }).join('') + (rows.length > 60 ? `<p class="note">只顯示前 60 家，請用搜尋縮小範圍。</p>` : '');
  }
  function detail(c) {
    const ov = G.carrierOverlap(c.code), on = G.map.rival === c.code;
    const top = c.routes.map((k) => ({ k, a: k.slice(0, 3), b: k.slice(3) })).map((x) => ({ ...x, r: G.rivalsOn(x.a, x.b).find((y) => y.code === c.code) })).filter((x) => x.r).sort((x, y) => y.r.f - x.r.f).slice(0, 10);
    return `<div class="rv-body">
      <dl class="facts"><dt>樞紐</dt><dd>${c.hubs.map((h) => `${h} ${esc(G.AP[h] ? G.AP[h].city : '')}`).join('、') || '—'}</dd>
        <dt>航線／航點</dt><dd>${c.routes.length} 條航線、${c.nDest} 個航點</dd>
        <dt>機隊</dt><dd>${G.carrierFleetReal(c.code) ? `${num(G.carrierFleetEst(c.code))} 架<small class="src">真實客機數（維基百科），各航線班次已依此校正</small>` : `約 ${num(G.carrierFleetEst(c.code))} 架<small class="src">依各航線估計班次換算，不是真實機隊數</small>`}</dd>
        <dt>定位</dt><dd>${c.lcc ? '低成本：票價約參考票價的 78%，只有經濟艙' : '傳統：全額票價、多艙等，長程有豪華經濟艙'}</dd>
        <dt>航空聯盟</dt><dd>${G.ALLY_OF && G.ALLY_OF[c.code] ? esc(G.ALLIANCES[G.ALLY_OF[c.code]].zh) + (G.isPartner(c.code) ? '（你的盟友）' : '') : G.isPartner && G.isPartner(c.code) ? '你的盟友' : '未加入'}</dd>
        ${G.STOCK_OF && G.STOCK_OF[c.code] ? (() => { const k = G.STOCK_OF[c.code], q = G.quote(k); return `<dt>股票</dt><dd>${esc(G.LISTED[k].zh)} $${q.p.toFixed(2)}${G.stakeIn(c.code) ? `，你持有 ${(G.stakeIn(c.code) * 100).toFixed(2)}%` : ''}</dd>`; })() : ''}</dl>
      <div class="row-btns"><button class="btn sm ${on ? 'primary' : ''}" data-act="rv-map" data-code="${c.code}">${on ? '隱藏地圖航網' : '在地圖顯示航網'}</button>
        ${G.allyState && G.allyState().kind === 'own' && !G.isPartner(c.code) ? `<button class="btn sm" data-act="ally-inv-ai" data-code="${c.code}">邀請加入${esc(G.allyState().name)}</button>` : ''}
        ${G.STOCK_OF && G.STOCK_OF[c.code] ? `<button class="btn sm" data-act="stk-goto" data-k="${G.STOCK_OF[c.code]}">買賣股票</button>` : ''}</div>
      ${ov.length ? `<h4>與你重疊的航線</h4>${ov.map((r) => { const x = G.rivalsOn(r.a, r.b).find((y) => y.code === c.code); return `<p class="rv-line"><b>${r.a}–${r.b}</b> 每日約 ${x.f.toFixed(1)} 班 · 票價 ${x.war ? `<b class="neg">${pct(x.p)}</b>（降價中）` : pct(x.p)} · 你的經濟艙 ${pct(r.fare.Y || 1)}</p>`; }).join('')}` : ''}
      <h4>班次最多的航線（估計）</h4>
      ${top.map((x) => `<p class="rv-line">${x.a}–${x.b} · 每日約 ${x.r.f.toFixed(1)} 班</p>`).join('')}
    </div>`;
  }
  U.rivalsTab = () => {
    const S = G.S, news = (S.rivals && S.rivals.news) || [];
    const mine = S.routes.map((r) => ({ r, rv: G.rivalsOn(r.a, r.b) }));
    return `<p class="note disclaimer">${DISCLAIMER}</p>
      ${mine.length ? `<h3>你的航線上的競爭</h3>
      <div class="table-wrap"><table class="rv-table"><thead><tr><th>航線</th><th>對手</th><th>價格戰</th></tr></thead><tbody>
        ${mine.map(({ r, rv }) => `<tr><td><b>${r.a}–${r.b}</b></td><td>${rv.length ? rv.map((x) => badge(x.c)).join('') : '<span class="chip fit-l">獨飛</span>'}</td><td>${rv.filter((x) => x.war).map((x) => esc(G.carrierName(x.c))).join('、') || '—'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${news.length ? `<h3>對手動態</h3>${news.slice(0, 6).map((n) => `<p class="rv-line"><small class="muted">${new Date(n.t).toISOString().slice(0, 10)}</small> ${esc(n.text)}</p>`).join('')}` : ''}
      <h3>航空公司</h3>
      <label class="search"><span>搜尋</span><input id="rv-q" type="search" placeholder="代碼、中英文名稱或國家，例如 CX、Peach、日本" value="${esc(q)}" autocomplete="off"></label>
      <p class="note">${q ? '' : `預設列出${esc(G.countryZh(G.homeCC()))}的航空公司，以及和你有重疊航線的對手。`}全世界共 ${Object.keys(G.CARRIERS).length} 家。</p>
      <div id="rv-list">${listRows()}</div>`;
  };
  const refreshList = () => { const el = $('#rv-list'); if (el) el.innerHTML = listRows(); };
  document.addEventListener('input', (e) => { if (e.target.id === 'rv-q') { q = e.target.value.trim(); refreshList(); } });

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'rv-open': sel = sel === d.code ? null : d.code; if (U.tab !== 'rivals') { q = d.code; sel = d.code; U.go('rivals'); } else refreshList(); return;
      case 'rv-map': G.map.rival = G.map.rival === d.code ? null : d.code; G.map.invalidate(); refreshList(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
