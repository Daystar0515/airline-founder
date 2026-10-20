// v1.0 介面：成就、公司大事記、經營統計、遊戲結束的經營回顧。
(function () {
  const G = window.G, U = G.ui;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const gdate = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '/');
  const YEAR = 365 * 86400000;
  const KIND_DOT = { found: 'acc', ach: 'gold', crash: 'neg', bankrupt: 'neg', dismissed: 'neg', repossess: 'neg', strike: 'warn', ipo: 'pos', ally: 'acc', hub: 'acc', bond: 'acc', gov: 'pos', world: 'warn' };

  // 月度稅後淨利長條圖
  function niChart(S, n) {
    const st = (S.fin ? S.fin.statements : []).slice(-(n || 36));
    if (st.length < 2) return '<p class="note">第二個月結算後會出現月度損益圖。</p>';
    const w = 340, h = 110, mid = h / 2, max = Math.max(1, ...st.map((x) => Math.abs(x.ni))), bw = w / st.length;
    const bars = st.map((x, i) => { const bh = (Math.abs(x.ni) / max) * (mid - 6); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(x.ni >= 0 ? mid - bh : mid).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${Math.max(0.5, bh).toFixed(1)}" class="${x.ni >= 0 ? 'p' : 'n'}"><title>${x.y}/${x.m}：${M(x.ni)}</title></rect>`; }).join('');
    return `<figure class="nichart"><figcaption>月度稅後淨利（近 ${st.length} 個月）</figcaption><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="月度稅後淨利">${bars}<line x1="0" x2="${w}" y1="${mid}" y2="${mid}" class="zero"/></svg>
      <div class="axis"><span>${st[0].y}/${st[0].m}</span><span>最好 ${M(Math.max(...st.map((x) => x.ni)))} · 最差 ${M(Math.min(...st.map((x) => x.ni)))}</span><span>${st[st.length - 1].y}/${st[st.length - 1].m}</span></div></figure>`;
  }
  function statsFacts(S) {
    const st = S.stats || {}, yrs = (S.time - S.start) / YEAR;
    const ni = (S.fin ? S.fin.statements : []).reduce((s, x) => s + x.ni, 0);
    return `<dl class="facts">
      <dt>經營期間</dt><dd>${yrs.toFixed(1)} 年（${gdate(S.start)} – ${gdate(S.time)}）</dd>
      <dt>累計載客</dt><dd>${G.num(Math.round(st.pax || 0))} 人次 · ${G.num(st.flights || 0)} 個航班</dd>
      <dt>機隊</dt><dd>目前 ${S.fleet.length} 架，最多 ${st.peakFleet || S.fleet.length} 架</dd>
      <dt>航線</dt><dd>目前 ${S.routes.length} 條，最多 ${st.peakRoutes || S.routes.length} 條</dd>
      <dt>樞紐</dt><dd>${Object.keys(S.hubs).join('、')}</dd>
      <dt>累計稅後淨利</dt><dd class="${ni < 0 ? 'neg' : 'pos'}">${M(ni)}</dd>
      ${st.bestMonthNi ? `<dt>最賺錢的月份</dt><dd>${st.bestMonthNi.y}/${st.bestMonthNi.m}：${M(st.bestMonthNi.v)}</dd>` : ''}
      <dt>最高現金</dt><dd>${M(st.peakCash || S.cash)}</dd>
      <dt>社會評價</dt><dd>目前 ${S.rep.toFixed(0)}，最高 ${(st.peakRep || S.rep).toFixed(0)}</dd>
      <dt>飛安</dt><dd>${S.safety.crashes ? `${S.safety.crashes} 起失事` : '零失事'} · 緊急轉降 ${S.safety.emergencies}</dd>
      ${S.fin && S.fin.stock.listed ? `<dt>市值</dt><dd>${M(S.fin.stock.price * S.fin.stock.shares)}</dd>` : ''}
      ${S.ally && S.ally.kind ? `<dt>航空聯盟</dt><dd>${esc(G.allyName())}</dd>` : ''}
      <dt>成就</dt><dd>${Object.keys(S.ach || {}).length}／${G.ACHIEVEMENTS.length}</dd></dl>`;
  }
  function timeline(S, n) {
    const T = (S.timeline || []).slice().reverse().slice(0, n || 200);
    if (!T.length) return '<p class="note">還沒有大事。</p>';
    return `<ol class="timeline">${T.map((x) => `<li class="${KIND_DOT[x.kind] || ''}"><time>${gdate(x.t)}</time><span>${esc(x.text)}</span></li>`).join('')}</ol>`;
  }
  function achGrid(S) {
    const got = S.ach || {};
    const done = G.ACHIEVEMENTS.filter((a) => got[a[0]]), todo = G.ACHIEVEMENTS.filter((a) => !got[a[0]]);
    const card = ([id, name, desc], ok) => {
      const p = ok ? null : G.achProgress(id);
      return `<article class="ach ${ok ? 'ok' : ''}"><span class="medal" aria-hidden="true">${ok ? '★' : '☆'}</span><div><b>${esc(name)}</b><small>${esc(desc)}</small>
        ${ok ? `<small class="when">${gdate(got[id])} 達成</small>` : p ? `<span class="pbar"><i style="width:${Math.min(100, (p[0] / p[1]) * 100).toFixed(0)}%"></i></span><small class="when">${G.num(Math.floor(p[0]))}／${G.num(p[1])}</small>` : ''}</div></article>`;
    };
    return `<p class="sub">已達成 ${done.length}／${G.ACHIEVEMENTS.length}</p><div class="ach-grid">${done.map((a) => card(a, true)).join('')}${todo.map((a) => card(a, false)).join('')}</div>`;
  }
  let tab = 'ach';
  U.achDialog = (t) => {
    if (t) tab = t;
    const S = G.S;
    if (!S) return;
    G.ensureAch();
    const tabs = [['ach', '成就'], ['time', '大事記'], ['stats', '經營統計']];
    U.modal(`<h2>成就與大事記</h2><div class="seg" role="tablist">${tabs.map(([k, n]) => `<button data-act="ach-tab" data-k="${k}" aria-pressed="${k === tab}">${n}</button>`).join('')}</div>
      <div class="ach-body">${tab === 'ach' ? achGrid(S) : tab === 'time' ? timeline(S) : statsFacts(S) + niChart(S)}</div>`, 'wide');
  };

  // 成就通知
  G.on((w, d) => { if (w === 'event' && d && d.kind === 'achievement') U.toast(`成就解鎖：${d.name}`); });

  // 遊戲結束：經營回顧
  U.gameOver = (reason) => {
    const S = G.S;
    S.over = reason; G.ensureAch();
    G.save({ force: true });
    const title = reason === 'bankrupt' ? '公司破產' : '你被撤換了';
    const why = reason === 'bankrupt' ? '現金長期為負、無法再借款，或貸款與公司債連續違約，法院宣告破產。' : reason === 'shareholders' ? '持股未過半，年度股東會連續兩年支持度不足，股東會撤換經營者。' : '董事會決議解除你的經營職務。';
    U.modal(`<p class="eyebrow danger-ink">遊戲結束</p><h2>${title}</h2><p>${why}</p>
      <h3>${esc(S.company.name)} 經營回顧</h3>
      ${statsFacts(S)}
      ${niChart(S, 60)}
      <h4>大事記</h4>${timeline(S, 12)}
      <div class="row-btns"><button class="btn primary" data-act="gameover-title">回到標題畫面</button><button class="btn" data-act="m-export">匯出這份存檔</button><button class="btn" data-act="ach-tab" data-k="ach">看成就</button></div>
      <p class="note">這份存檔會保留在存檔管理（標示「已結束」），可以隨時回來看回顧。</p>`, 'wide');
  };

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'm-ach': U.achDialog(); return;
      case 'ach-tab': U.achDialog(d.k); return;
      case 'gameover-title': case 'gameover-restart': G.setSpeed(0); if (G.net) G.netLeave(); U.closeModal(); G.S = null; G.showIntro(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
