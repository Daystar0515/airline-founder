// v0.9.0 介面：自家股價走勢（含大盤、均線）、股東名冊、股市投資（買賣其他航空公司股票）、公司債。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const DAY = 86400000;
  const sgn = (v, d = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const px = (v) => '$' + (v >= 100 ? v.toFixed(1) : v.toFixed(2));
  const RANGES = [['1m', '1 個月', 22], ['6m', '6 個月', 126], ['1y', '1 年', 252], ['all', '全部', 9999]];
  let range = '6m';

  // ---------- 走勢圖 ----------
  // prices：收盤價陣列；days：對應的日序號（UTC 日）；idx：同期大盤（會換算成同一起點）
  U.stockChart = (prices, days, idx, label, unit) => {
    const fmt = unit === '' ? (v) => v.toFixed(0) : px;
    const n = RANGES.find((r) => r[0] === range)[2];
    const P = prices.slice(-n), D = days.slice(-n), I = idx ? idx.slice(-n) : null;
    if (P.length < 2) return '<p class="note">資料還不夠畫走勢圖。</p>';
    const w = 340, h = 130, pad = 4;
    const ma = P.map((_, i) => (i < 19 ? null : P.slice(i - 19, i + 1).reduce((s, v) => s + v, 0) / 20));
    const Ib = I && I.length === P.length ? I.map((v) => (v / I[0]) * P[0]) : null;
    const all = P.concat(Ib || []).concat(ma.filter((v) => v != null));
    const mn = Math.min(...all), mx = Math.max(...all), span = mx - mn || 1;
    const X = (i) => (i / (P.length - 1)) * w, Y = (v) => h - pad - ((v - mn) / span) * (h - pad * 2);
    const path = (arr) => arr.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    const up = P[P.length - 1] >= P[0];
    const date = (d) => new Date(d * DAY).toISOString().slice(0, 10);
    const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${w}" y1="${(h * f).toFixed(1)}" y2="${(h * f).toFixed(1)}" class="grid"/>`).join('');
    return `<figure class="schart ${up ? 'up' : 'down'}">
      <div class="seg sm" role="group" aria-label="期間">${RANGES.map(([k, t]) => `<button data-act="stk-range" data-k="${k}" aria-pressed="${k === range}">${t}</button>`).join('')}</div>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label || '股價走勢')}">${grid}
        <polygon points="0,${h} ${path(P)} ${w},${h}" class="area"/>
        ${Ib ? `<polyline points="${path(Ib)}" class="idx"/>` : ''}
        <polyline points="${path(ma)}" class="ma"/>
        <polyline points="${path(P)}" class="line"/>
      </svg>
      <div class="axis"><span>${date(D[0])}</span><span>低 ${fmt(Math.min(...P))} · 高 ${fmt(Math.max(...P))}</span><span>${date(D[D.length - 1])}</span></div>
      <figcaption><i class="k-line"></i>${unit === '' ? '指數' : '股價'} <i class="k-ma"></i>20 日均線 ${Ib ? '<i class="k-idx"></i>大盤（換算成同一起點）' : ''} · 期間 <b class="${up ? 'pos' : 'neg'}">${sgn(P[P.length - 1] / P[0] - 1)}</b></figcaption>
    </figure>`;
  };
  const vol = (P) => {
    const r = []; for (let i = 1; i < P.length; i++) r.push(Math.log(P[i] / P[i - 1]));
    if (r.length < 5) return 0;
    const m = r.reduce((s, v) => s + v, 0) / r.length;
    return Math.sqrt(r.reduce((s, v) => s + (v - m) * (v - m), 0) / (r.length - 1)) * Math.sqrt(252);
  };
  // 把大盤對齊到玩家股價的日期
  function idxFor(days) {
    const Mk = G.mkt(), map = new Map(Mk.days.map((d, i) => [d, Mk.idxHist[i]]));
    let last = Mk.idxHist[0];
    return days.map((d) => { if (map.has(d)) last = map.get(d); return last; });
  }

  // ---------- 自家股票 ----------
  U.ownStockExtra = () => {
    const S = G.S, st = S.fin.stock, Mk = G.mkt();
    const P = st.hist.map((x) => x.p), D = st.hist.map((x) => Math.floor(x.t / DAY));
    const yr = P.slice(-252);
    const news = Mk.news.filter((n) => n.key === '@self').slice(0, 5);
    return `${U.stockChart(P, D, idxFor(D), '你的股價')}
      <dl class="facts"><dt>今日漲跌</dt><dd class="${cls(st.chg || 0)}">${sgn(st.chg || 0, 2)}</dd>
        <dt>52 週高／低</dt><dd>${px(Math.max(...yr))}／${px(Math.min(...yr))}</dd>
        <dt>年化波動度</dt><dd>${(vol(P.slice(-120)) * 100).toFixed(0)}%<small class="src">負債越高、市值越小，波動越大</small></dd>
        <dt>大盤</dt><dd>${Mk.idx.toFixed(0)} 點 · ${G.MKT.regimes[Mk.regime].zh}</dd>
        ${st.lastDps ? `<dt>上次股利</dt><dd>每股 $${st.lastDps.toFixed(2)}（${new Date(st.lastDpsT).toISOString().slice(0, 10)}）</dd>` : ''}</dl>
      ${news.length ? `<h4>個股新聞</h4>${news.map((n) => `<p class="rv-line"><small class="muted">${new Date(n.t).toISOString().slice(0, 10)}</small> <span class="${n.dir > 0 ? 'pos' : 'neg'}">${n.dir > 0 ? '▲' : '▼'}</span> ${esc(n.text)}</p>`).join('')}` : ''}`;
  };
  U.holdersBox = () => {
    const S = G.S, st = S.fin.stock, H = (st.holders || []).slice().sort((a, b) => b.n - a.n);
    const founder = S.founder.equity / 100, held = H.reduce((s, h) => s + h.n, 0) / st.shares;
    const friendly = G.friendlyStake ? G.friendlyStake() : 0, floatS = st.shares * (1 - founder);
    const row = (name, kind, f, extra) => `<tr><td>${name}</td><td>${kind}</td><td>${(f * 100).toFixed(2)}%</td><td>${extra || ''}</td></tr>`;
    return `<h4>股東名冊</h4>
      <div class="table-wrap"><table class="rv-table"><thead><tr><th>股東</th><th>類型</th><th>持股</th><th>說明</th></tr></thead><tbody>
        ${row('你（創辦人）', '經營者', founder, founder >= 0.5 ? '過半，經營權穩固' : '')}
        ${H.map((h) => row(`<span class="cbadge" style="--c:${G.carrierColor(h.code)}">${esc(h.code)}</span> ${esc(h.name)}`, h.kind === 'player' ? '玩家' : h.why === 'strategic' ? '策略持股' : '財務投資', h.n / st.shares, `均價 ${px(h.avg)} · ${G.isPartner && G.isPartner(h.code) ? '盟友，股東會支持你' : h.why === 'financial' ? '看報酬率投票' : ''}`)).join('')}
        ${row('一般投資人', '散戶與基金', Math.max(0, 1 - founder - held), '')}
      </tbody></table></div>
      <p class="note">${friendly > 0 ? `友好股東持有 ${(friendly / st.shares * 100).toFixed(1)}%（占流通股 ${(friendly / floatS * 100).toFixed(0)}%），年度股東會一律投票支持你。` : '盟友航空公司可能買進你的股票作為策略持股，在股東會支持你；股價明顯低估時，也會有航空集團進行財務投資。'}${G.net ? '連線的朋友也可以在「股市投資」買你的股票。' : ''}</p>`;
  };

  // ---------- 股市投資 ----------
  let q = '', sort = 'cap', sel = null, amt = '';
  const rows = () => {
    const Mk = G.mkt();
    let list = Object.entries(Mk.stocks).filter(([, s]) => !s.delisted).map(([k, s]) => {
      const L = G.LISTED[k], y = s.hist.length > 252 ? s.hist[s.hist.length - 252] : s.hist[0];
      return { k, L, s, cap: s.p * s.shares, chg: s.chg || 0, y1: y ? s.p / y - 1 : 0 };
    });
    if (q) { const x = q.toLowerCase(); list = list.filter((r) => r.k.toLowerCase() === x || r.L.zh.includes(q) || r.L.codes.some((c) => (G.CARRIERS[c].name || '').toLowerCase().includes(x) || c.toLowerCase() === x) || G.countryZh(r.L.cc).includes(q)); }
    const by = { cap: (a, b) => b.cap - a.cap, chg: (a, b) => b.chg - a.chg, y1: (a, b) => b.y1 - a.y1, div: (a, b) => b.s.divY - a.s.divY }[sort];
    return list.sort(by);
  };
  function detail(key) {
    const S = G.S, Mk = G.mkt(), qt = G.quote(key);
    if (!qt) return '';
    const h = Mk.port[key], s = Mk.stocks[key], L = G.LISTED[key];
    const maxN = Math.floor(qt.shares * G.MKT.maxStake - (h ? h.n : 0));
    const n = Math.floor((+amt || 0) / qt.p);
    return `<div class="stk-body">
      ${s ? U.stockChart(s.hist, Mk.days, Mk.idxHist, L.zh) : ''}
      <dl class="facts">
        <dt>市值</dt><dd>${M(qt.p * qt.shares)}（${(qt.shares / 1e6).toFixed(0)} 百萬股）</dd>
        ${s ? `<dt>旗下航空公司</dt><dd>${L.codes.map((c) => esc(G.carrierName(G.CARRIERS[c]))).join('、')}${U.allyChip ? ' ' + U.allyChip(key) : ''}</dd>
        <dt>貝他／年化波動</dt><dd>${s.beta.toFixed(2)}／${(vol(s.hist.slice(-120)) * 100).toFixed(0)}%</dd>
        <dt>殖利率</dt><dd>${(s.divY * 100).toFixed(1)}%（每年 ${s.divM} 月 15 日除息）</dd>
        <dt>季報</dt><dd>2、5、8、11 月 ${s.earnD} 日前後公布</dd>` : '<dt>類型</dt><dd>連線玩家的公司（股價每天同步）</dd>'}
        ${h ? `<dt>你的持股</dt><dd>${G.num(h.n)} 股（${(h.n / qt.shares * 100).toFixed(2)}%）· 均價 ${px(h.cost / h.n)} · 未實現 <b class="${cls(h.n * qt.p - h.cost)}">${M(h.n * qt.p - h.cost)}</b>${h.divs ? ` · 已領股利 ${M(h.divs)}` : ''}</dd>` : ''}
      </dl>
      <div class="trade">
        <label>買進金額（美元）<input id="stk-amt" type="number" min="0" step="1000000" value="${esc(amt)}" placeholder="例如 50000000"></label>
        <div class="row-btns">${[10e6, 50e6, 200e6].map((v) => `<button class="btn sm" data-act="stk-amt" data-v="${v}">${M(v)}</button>`).join('')}<button class="btn sm" data-act="stk-amt" data-v="${Math.round(qt.p * qt.shares * 0.01)}">1% 股權</button></div>
        <p class="meta" id="stk-preview">${n > 0 ? `約 ${G.num(n)} 股（${(n / qt.shares * 100).toFixed(2)}%），含手續費 ${(G.MKT.buyFee * 100).toFixed(2)}%；大量買進會推升股價` : `現金 ${M(S.cash)}；單一公司最多持有 ${G.MKT.maxStake * 100}%（還可買 ${G.num(Math.max(0, maxN))} 股）`}</p>
        <div class="row-btns"><button class="btn primary" data-act="stk-buy" data-k="${esc(key)}" ${maxN > 0 ? '' : 'disabled'}>買進</button>
          ${h ? `<button class="btn" data-act="stk-sell" data-k="${esc(key)}" data-p="0.5">賣出一半</button><button class="btn danger" data-act="stk-sell" data-k="${esc(key)}" data-p="1">全部賣出</button>` : ''}</div>
        <p class="note">賣出時扣手續費 ${(G.MKT.sellFee * 100).toFixed(2)}% 與交易稅 ${(G.MKT.sellTax * 100).toFixed(1)}%。股票以成本記在資產負債表；賣出的損益與收到的股利列入「處分資產與投資損益」。</p>
      </div></div>`;
  }
  U.marketTab = () => {
    const S = G.S, Mk = G.mkt();
    const ih = Mk.idxHist, d1 = ih.length > 1 ? ih[ih.length - 1] / ih[ih.length - 2] - 1 : 0, y1 = ih.length > 252 ? ih[ih.length - 1] / ih[ih.length - 252] - 1 : ih[ih.length - 1] / ih[0] - 1;
    const port = G.portfolio(), pv = port.reduce((s, x) => s + x.value, 0), pc = port.reduce((s, x) => s + x.cost, 0);
    const N = G.net, friends = N ? Object.entries(N.players).filter(([id, p]) => id !== N.myId && p && p.stock) : [];
    const list = rows();
    return `<p class="note disclaimer">股價、股利與財報全部是遊戲模擬，和真實股市無關，也不是投資建議。航空公司以集團計價（例如瑞士航空併入漢莎航空集團）。</p>
      <section class="kpis">
        <div><span>大盤指數</span><b>${Mk.idx.toFixed(0)}</b><em class="${cls(d1)}">${sgn(d1, 2)} · 近一年 ${sgn(y1)}</em></div>
        <div><span>市場狀態</span><b>${G.MKT.regimes[Mk.regime].zh}</b><em>航空類股今日 ${sgn(Mk.lastSec || 0, 2)}</em></div>
        <div><span>投資組合市值</span><b>${M(pv)}</b><em class="${cls(pv - pc)}">未實現 ${M(pv - pc)}</em></div>
      </section>
      ${U.stockChart(ih, Mk.days, null, '大盤指數', '')}
      ${port.length ? `<h3>你的投資組合</h3><div class="table-wrap"><table class="rv-table"><thead><tr><th>公司</th><th>持股</th><th>均價／現價</th><th>市值</th><th>損益</th></tr></thead><tbody>
        ${port.map((x) => `<tr><td><button class="linkish" data-act="stk-open" data-k="${esc(x.key)}"><b>${esc(x.name)}</b></button></td><td>${G.num(x.n)}<small class="muted"> ${(x.stake * 100).toFixed(2)}%</small></td><td>${px(x.avg)}／${px(x.p)}</td><td>${M(x.value)}</td><td class="${cls(x.pl)}">${M(x.pl)}<small> ${sgn(x.pl / x.cost)}</small></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${friends.length ? `<h3>連線玩家的股票</h3>${friends.map(([, p]) => { const k = '@' + p.code, open = sel === k; return `<article class="stk ${open ? 'open' : ''}"><button class="stk-head" data-act="stk-open" data-k="${esc(k)}"><span class="cbadge" style="--c:${esc(p.color)}">${esc(p.code)}</span><b>${esc(p.name)}</b><span>${px(p.stock.price)}</span><span class="${cls(p.stock.chg)}">${sgn(p.stock.chg || 0, 2)}</span></button>${open ? detail(k) : ''}</article>`; }).join('')}` : ''}
      <h3>航空類股（${Object.keys(Mk.stocks).length} 家上市集團）</h3>
      <div class="filterbar"><label class="search"><span>搜尋</span><input id="stk-q" type="search" placeholder="代碼、名稱或國家，例如 CI、漢莎、日本" value="${esc(q)}" autocomplete="off"></label>
        <label class="fsel"><span>排序</span><select id="stk-sort" data-act="stk-sort">${[['cap', '市值'], ['chg', '今日漲跌'], ['y1', '近一年報酬'], ['div', '殖利率']].map(([v, n]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div id="stk-list">${list.map((r) => { const open = sel === r.k, h = Mk.port[r.k]; return `<article class="stk ${open ? 'open' : ''}"><button class="stk-head" data-act="stk-open" data-k="${r.k}" aria-expanded="${open}"><span class="cbadge" style="--c:${G.carrierColor(r.k)}">${r.k}</span><b>${esc(r.L.zh)}${h ? ' <small class="chip dev">持有</small>' : ''}</b><span>${px(r.s.p)}</span><span class="${cls(r.chg)}">${sgn(r.chg, 2)}</span><small class="muted">${M(r.cap)}</small></button>${open ? detail(r.k) : ''}</article>`; }).join('') || '<p class="empty">找不到符合的公司。</p>'}</div>
      ${Mk.news.length ? `<h3>市場新聞</h3>${Mk.news.slice(0, 10).map((n) => `<p class="rv-line"><small class="muted">${new Date(n.t).toISOString().slice(0, 10)}</small> <span class="${n.dir > 0 ? 'pos' : 'neg'}">${n.dir > 0 ? '▲' : '▼'}</span> ${esc(n.text)}</p>`).join('')}` : ''}
      ${Mk.trades.length ? `<h3>交易紀錄</h3>${Mk.trades.slice(0, 8).map((t) => `<p class="rv-line"><small class="muted">${new Date(t.t).toISOString().slice(0, 10)}</small> ${t.kind} ${esc(t.name)} ${G.num(t.n)} 股 @ ${px(t.price)}${t.gain != null ? ` · 實現 <span class="${cls(t.gain)}">${M(t.gain)}</span>` : ''}</p>`).join('')}` : ''}`;
  };

  // ---------- 公司債 ----------
  const BD = { amount: '', years: 5 };
  U.bondSection = () => {
    const S = G.S, o = G.bondOffer(), F = S.fin, bonds = F.bonds || [];
    const rate = G.bondRate(BD.years), a = Math.min(+BD.amount || 0, o.cap);
    return `<h3>公司債</h3>
      <p class="note">向投資人發行債券：每月只付利息、到期一次還本，利率比信用貸款低、也不用抵押品。需要信用評等 BB 以上、營運滿 12 個月；發行總額不得超過總資產的 35%。${S.fin.stock.listed ? '' : '未上市公司利率多 0.5%。'}市場空頭時利率較高。</p>
      ${o.ok ? `<div class="loan-types">${o.rates.map(([y, r]) => `<button class="ltype" data-act="bond-years" data-y="${y}" aria-pressed="${y === BD.years}"><b>${y} 年期</b><span>票面利率 ${(r * 100).toFixed(2)}%</span><em>每 $1 億每月付息 ${M(1e8 * r / 12)}</em></button>`).join('')}</div>
        <div class="loan-form"><label>發行金額（美元）<input id="bond-amt" type="number" min="${G.BOND.min}" step="10000000" value="${esc(BD.amount)}" placeholder="最多 ${M(o.cap)}"></label></div>
        <p class="meta" id="bond-preview">${a ? `每月付息 ${M(a * rate / 12)}，${BD.years} 年總利息 ${M(a * rate * BD.years)}，${new Date(S.time + BD.years * 365 * DAY).toISOString().slice(0, 7)} 到期還本 ${M(a)}；承銷費 ${M(a * G.BOND.fee)}` : `可發行額度 ${M(o.cap)}，最低 ${M(G.BOND.min)}`}</p>
        <div class="row-btns"><button class="btn primary" data-act="bond-issue">發行公司債</button></div>` : `<div class="callout warn"><b>目前無法發行</b><p>${esc(o.why)}</p></div>`}
      ${bonds.length ? `<h4>流通中的公司債</h4>${bonds.map((b) => { const due = b.issued + b.years * 365 * DAY; return `<article class="loan"><header><b>${b.years} 年期公司債</b><span>${(b.rate * 100).toFixed(2)}%</span>${b.missed ? `<span class="chip curfew">違約 ${b.missed} 期</span>` : ''}</header>
        <p class="meta">面額 ${M(b.amount)} · 每月付息 ${M(b.amount * b.rate / 12)} · 剩 ${b.left} 個月（${new Date(due).toISOString().slice(0, 7)} 到期還本）${b.left <= 6 ? ' · <b class="neg">即將到期，請準備還本資金</b>' : ''}</p>
        <div class="row-btns"><button class="btn sm" data-act="bond-call" data-id="${b.id}" ${S.cash >= b.amount * (1 + G.BOND.callPremium) ? '' : 'disabled'}>提前贖回 ${M(b.amount * (1 + G.BOND.callPremium))}（含 ${G.BOND.callPremium * 100}% 溢價）</button></div></article>`; }).join('')}` : ''}`;
  };

  // ---------- 事件 ----------
  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'stk-q') { q = e.target.value.trim(); const pos = e.target.selectionStart; U.render(); const el = $('#stk-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* 忽略 */ } } }
    if (id === 'stk-amt') { amt = e.target.value; const qt = sel && G.quote(sel), el = $('#stk-preview'); if (qt && el) { const n = Math.floor((+amt || 0) / qt.p); el.textContent = n > 0 ? `約 ${G.num(n)} 股（${(n / qt.shares * 100).toFixed(2)}%），含手續費 ${(G.MKT.buyFee * 100).toFixed(2)}%` : ''; } }
    if (id === 'bond-amt') { BD.amount = e.target.value; const el = $('#bond-preview'), r = G.bondRate(BD.years), a = +BD.amount || 0; if (el) el.textContent = a ? `每月付息 ${M(a * r / 12)}，${BD.years} 年總利息 ${M(a * r * BD.years)}；承銷費 ${M(a * G.BOND.fee)}` : ''; }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'stk-sort') { sort = e.target.value; U.render(); } });
  const res = (r, ok) => { if (!r || r.ok === false) U.toast((r && r.msg) || '無法執行', true); else if (ok) U.toast(typeof ok === 'function' ? ok(r) : ok); U.render(); U.updateTop(); return r; };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'stk-range': range = d.k; U.render(); return;
      case 'stk-open': sel = sel === d.k ? null : d.k; amt = ''; U.render(); return;
      case 'stk-goto': sel = d.k; amt = ''; q = ''; U.finTab = 'market'; U.go('finance'); return;
      case 'stk-amt': amt = String(d.v); U.render(); return;
      case 'stk-sort': return;
      case 'stk-buy': { const qt = G.quote(d.k); if (!qt) return; res(G.buyStock(d.k, Math.floor((+amt || 0) / qt.p)), (r) => `買進成交，均價 $${r.avg.toFixed(2)}，共 ${M(r.total)}`); amt = ''; return; }
      case 'stk-sell': { const h = G.mkt().port[d.k]; if (!h) return; res(G.sellStock(d.k, Math.max(1, Math.floor(h.n * +d.p))), (r) => `賣出成交，實現損益 ${M(r.gain)}`); return; }
      case 'bond-years': BD.years = +d.y; U.render(); return;
      case 'bond-issue': { const r = res(G.issueBond(Math.min(+BD.amount || 0, 1e12), BD.years), (x) => `公司債發行完成，募得 ${M(x.bond.amount)}`); if (r && r.ok) BD.amount = ''; return; }
      case 'bond-call': if (el.dataset.confirm) res(G.callBond(+d.id), '已提前贖回'); else { el.dataset.confirm = '1'; el.textContent = '再按一次確認'; } return;
    }
    if (act0) act0(a, d, el);
  };
})();
