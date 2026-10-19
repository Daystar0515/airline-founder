// v0.4 介面：財務報表、銀行、股市、破產與撤換；手機／電腦雙版面切換。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  const neg = (v) => (v < 0 ? 'neg' : '');
  const OPEX_ZH = { alliance: '聯盟會費與入盟費', fuel: '燃油', payroll: '人事薪資', hiring: '招募與訓練', crew: '機組飛行津貼', catering: '餐飲供餐', maint: '航線維修與零件', mxcheck: '定期檢查（A/B/C/D）', airport: '機場、航路與地勤', service: '機上服務備品', lease: '飛機租金', hub: '樞紐營運費', overhead: '管理費用', marketing: '行銷與公關', refit: '客艙改裝（租賃機）', refurb: '飛機整修（租賃機）', loyalty: '會員福利與營運', routefee: '開航與申請費', incident: '事故、延誤與賠償', insurance: '機身與責任保險', crewlegacy: '機組人事' };
  U.finTab = U.finTab || 'pl';

  // ---------- 財務分頁 ----------
  U.financeTab = () => {
    const S = G.S, F = S.fin, c = G.credit(), a = G.assets();
    const tabs = [['pl', '損益表'], ['top', '航線排行'], ['bs', '資產負債表'], ['cf', '現金流量表'], ['bank', '貸款與公司債'], ['stock', '公司股票'], ['market', '股市投資']];
    const head = `
      ${S.cash <= 0 ? `<div class="callout warn"><b>現金已經耗盡</b><p>可以向銀行申請信用貸款或以自有飛機抵押貸款。現金連續 60 天為負且無法借款時，公司會破產。</p>${U.finTab !== 'bank' ? '<button class="btn primary" data-act="fin-tab" data-k="bank">前往銀行</button>' : ''}</div>` : ''}
      <section class="kpis">
        <div><span>現金</span><b class="${neg(S.cash)}">${G.money(S.cash, 2)}</b><em>總資產 ${M(a.total)}</em></div>
        <div><span>股東權益</span><b>${M(G.equityBook())}</b><em>負債 ${M(G.debt())}</em></div>
        <div><span>信用評等</span><b>${c.grade}</b><em>評分 ${c.score.toFixed(0)} · 負債比 ${pct(c.lev, 0)}</em></div>
        <div><span>${F.stock.listed ? '股價' : '你的持股'}</span><b>${F.stock.listed ? '$' + F.stock.price.toFixed(2) : S.founder.equity + '%'}</b><em>${F.stock.listed ? '市值 ' + M(F.stock.price * F.stock.shares) : F.stock.pending ? '上市審查中' : '尚未上市'}</em></div>
      </section>
      <div class="seg fin-seg" role="tablist">${tabs.map(([k, n]) => `<button data-act="fin-tab" data-k="${k}" aria-pressed="${U.finTab === k}">${n}</button>`).join('')}</div>`;
    const body = { pl, bs, cf, bank, stock, top: () => (U.topRoutes ? U.topRoutes() : ''), market: () => (U.marketTab ? U.marketTab() : '') }[U.finTab]();
    return head + body;
  };
  const months = () => G.S.fin.statements.slice(-6).reverse();
  const colHead = (ms) => `<th>項目</th>${ms.map((m) => `<th>${m.y}/${String(m.m).padStart(2, '0')}</th>`).join('')}`;
  const row = (label, ms, f, cls) => `<tr class="${cls || ''}"><td>${label}</td>${ms.map((m) => { const v = f(m); return `<td class="${v < 0 ? 'neg' : ''}">${v == null || v === 0 ? '—' : M(v)}</td>`; }).join('')}</tr>`;
  const empty = '<p class="note">第一個月結束後，這裡會出現正式報表。</p>';

  function pl() {
    const ms = months();
    if (!ms.length) return empty;
    const cats = [...new Set(ms.flatMap((m) => Object.keys(m.opCats)))].sort((x, y) => (ms[0].opCats[y] || 0) - (ms[0].opCats[x] || 0));
    return `<div class="table-wrap"><table class="fs"><thead><tr>${colHead(ms)}</tr></thead><tbody>
      ${row('營業收入', ms, (m) => m.rev, 'strong')}
      ${row('　其中付費餐點', ms, (m) => m.anc)}
      ${ms.some((m) => m.gov) ? row('　其中政府合約', ms, (m) => m.gov || 0) : ''}
      ${ms.some((m) => m.member) ? row('　其中會員年費', ms, (m) => m.member || 0) : ''}
      ${cats.map((k) => row('　' + (OPEX_ZH[k] || k), ms, (m) => -(m.opCats[k] || 0))).join('')}
      ${row('營業費用合計', ms, (m) => -m.opex, 'sub')}
      ${row('EBITDA', ms, (m) => m.ebitda, 'strong')}
      ${row('折舊與攤銷', ms, (m) => -m.dep)}
      ${row('營業利益', ms, (m) => m.ebit, 'strong')}
      ${row('處分資產與投資損益（含股利）', ms, (m) => m.gain)}
      ${row('利息與財務費用', ms, (m) => -m.interest)}
      ${row('稅前淨利', ms, (m) => m.pretax, 'sub')}
      ${row(`所得稅（${G.TAX_RATE * 100}%）`, ms, (m) => -m.tax)}
      ${row('稅後淨利', ms, (m) => m.ni, 'strong total')}
      <tr><td>營業利益率</td>${ms.map((m) => `<td class="${neg(m.ebit)}">${m.rev ? pct(m.ebit / m.rev) : '—'}</td>`).join('')}</tr>
    </tbody></table></div>
    <p class="note">虧損可以扣抵未來的應納稅額，目前累積可扣抵虧損 ${M(G.S.fin.lossCF)}。租賃飛機的租金列為營業費用（尚未採用 IFRS 16 使用權資產）。</p>`;
  }
  function bs() {
    const st = G.S.fin.statements.slice(-1)[0];
    if (!st) return empty;
    const b = st.bs, liab = b.loans + (b.bonds || 0), ok = Math.abs(b.assets - (liab + b.equity)) < 1;
    const line = (l, v, cls) => `<tr class="${cls || ''}"><td>${l}</td><td class="${neg(v)}">${M(v)}</td></tr>`;
    return `<p class="sub">${st.y} 年 ${st.m} 月底</p>
      <div class="bs-grid">
        <div class="table-wrap"><table class="fs"><thead><tr><th>資產</th><th></th></tr></thead><tbody>
          ${line('現金', b.cash)}${line('飛機（帳面價值）', b.aircraft)}${line('樞紐與設施', b.facilities)}${line('租機保證金', b.deposits)}${b.invest ? line('股票投資（成本）', b.invest) : ''}${line('資產總計', b.assets, 'strong total')}
        </tbody></table></div>
        <div class="table-wrap"><table class="fs"><thead><tr><th>負債與權益</th><th></th></tr></thead><tbody>
          ${line('銀行借款', b.loans)}${b.bonds ? line('應付公司債', b.bonds) : ''}${line('負債總計', liab, 'sub')}
          ${line('股本（創業投入）', b.capital)}${line('上市與增資股本', b.ipo)}${line('保留盈餘', b.retained)}${line('權益總計', b.equity, 'sub')}
          ${line('負債與權益總計', liab + b.equity, 'strong total')}
        </tbody></table></div>
      </div>
      <p class="note ${ok ? 'pos' : 'neg'}">${ok ? '✓ 資產 = 負債 + 權益，帳目平衡' : '帳目不平衡，請回報這個問題'}</p>`;
  }
  function cf() {
    const ms = months();
    if (!ms.length) return empty;
    return `<div class="table-wrap"><table class="fs"><thead><tr>${colHead(ms)}</tr></thead><tbody>
      ${row('期初現金', ms, (m) => m.cf.start)}
      ${row('營業活動現金流', ms, (m) => m.cf.op, 'strong')}
      ${row('投資活動現金流', ms, (m) => m.cf.inv, 'strong')}
      ${row('籌資活動現金流', ms, (m) => m.cf.fin, 'strong')}
      ${row('本期現金增減', ms, (m) => m.cf.net, 'sub')}
      ${row('期末現金', ms, (m) => m.cf.end, 'strong total')}
    </tbody></table></div>
    <p class="note">營業活動：營收減去營業費用、利息與稅。投資活動：購機、樞紐與設施、租機保證金、買賣其他航空公司股票與收到的股利，以及出售飛機、保險理賠、保證金退回。籌資活動：借款、發行公司債、還本、上市與增資、發放股利。</p>`;
  }

  // ---------- 銀行 ----------
  U.loanDraft = U.loanDraft || { type: 'unsecured', years: 3, amount: '', collateral: [] };
  function bank() {
    const S = G.S, o = G.loanOffers(), c = o.credit, D = U.loanDraft;
    const loans = S.fin.loans;
    const selLend = o.secured.collateral.filter((x) => D.collateral.includes(x.id)).reduce((s, x) => s + x.lend, 0);
    const limit = D.type === 'unsecured' ? o.unsecured.limit : selLend;
    const rate = D.type === 'unsecured' ? o.unsecured.rate : o.secured.rate;
    const maxY = D.type === 'unsecured' ? o.unsecured.maxYears : o.secured.maxYears;
    const amt = Math.min(+D.amount || 0, limit);
    const n = D.years * 12, r = rate / 12, pay = amt ? (amt * r) / (1 - Math.pow(1 + r, -n)) : 0;
    return `
      <section class="credit"><div><span class="lbl">信用評等</span><b>${c.grade}</b></div>
        <div class="meter" role="img" aria-label="信用評分 ${c.score.toFixed(0)}"><i style="width:${c.score}%"></i></div>
        <p class="meta">評分 ${c.score.toFixed(0)}／100：社會評價、近三個月營業利益率 ${pct(c.margin)}、負債比 ${pct(c.lev, 0)}、飛安紀錄、逾期紀錄與營運時間。</p></section>
      <div class="loan-types">
        <button class="ltype" data-act="loan-type" data-k="unsecured" aria-pressed="${D.type === 'unsecured'}"><b>信用貸款</b><span>年利率 ${pct(o.unsecured.rate, 2)}</span><em>${o.unsecured.limit > 0 ? '可貸 ' + M(o.unsecured.limit) : '目前無法核貸'} · 最長 ${o.unsecured.maxYears} 年</em></button>
        <button class="ltype" data-act="loan-type" data-k="secured" aria-pressed="${D.type === 'secured'}"><b>飛機抵押貸款</b><span>年利率 ${pct(o.secured.rate, 2)}</span><em>${o.secured.collateral.length ? '抵押品市價 65%' : '沒有可抵押的自有飛機'} · 最長 ${o.secured.maxYears} 年</em></button>
      </div>
      ${D.type === 'secured' ? `<div class="collat">${o.secured.collateral.length ? o.secured.collateral.map((x) => `<label class="chk"><input type="checkbox" id="col-${x.id}" data-act="loan-col" data-id="${x.id}" ${D.collateral.includes(x.id) ? 'checked' : ''}> ${esc(x.reg)} ${esc(x.model)} · 市價 ${M(x.value)} · 可貸 ${M(x.lend)}</label>`).join('') : '<p class="note">只有「購買」的飛機能當抵押品；租賃飛機的所有權屬於租賃公司。</p>'}</div>` : ''}
      <div class="loan-form">
        <label>貸款金額（美元）<input id="loan-amt" type="number" min="0" step="1000000" value="${D.amount}" placeholder="最多 ${M(limit)}" data-act="loan-amt"></label>
        <label>期限<select id="loan-years" data-act="loan-years">${Array.from({ length: maxY }, (_, i) => i + 1).map((y) => `<option value="${y}" ${y === D.years ? 'selected' : ''}>${y} 年（${y * 12} 期）</option>`).join('')}</select></label>
      </div>
      <p class="meta" id="loan-preview">${amt ? `每月還款約 ${M(pay)}，總利息約 ${M(pay * n - amt)}` : '輸入金額後顯示每月還款'}</p>
      <div class="row-btns"><button class="btn primary" data-act="loan-take" ${limit > 0 ? '' : 'disabled'}>申請貸款</button></div>
      <h3>目前借款</h3>
      ${loans.length ? loans.map((l) => `<article class="loan"><header><b>${l.type === 'secured' ? '抵押貸款' : '信用貸款'}</b><span>${pct(l.rate, 2)}</span>${l.missed ? `<span class="chip curfew">逾期 ${l.missed} 期</span>` : ''}</header>
        <p class="meta">餘額 ${M(l.balance)}／原貸 ${M(l.principal)} · 每月 ${M(l.payment)} · 剩 ${l.left} 期${l.collateral ? ' · 抵押：' + l.collateral.map((id) => (S.fleet.find((a) => a.id === id) || {}).reg || '—').join('、') : ''}</p>
        <div class="row-btns"><button class="btn sm" data-act="loan-repay" data-id="${l.id}" ${S.cash >= l.balance ? '' : 'disabled'}>提前清償 ${M(l.balance)}</button></div></article>`).join('') : '<p class="note">目前沒有借款。</p>'}
      <p class="note">每月底自動扣繳本息。現金不足會逾期並加計 2% 滯納金；連續逾期 3 期，抵押貸款由銀行收回飛機抵債，信用貸款則會被聲請破產。抵押中的飛機不能出售。</p>
      ${U.bondSection ? U.bondSection() : ''}`;
  }

  // ---------- 股市 ----------
  function stock() {
    const S = G.S, st = S.fin.stock;
    if (!st.listed) {
      const k = G.ipoCheck(), f = U.ipoFloat || 0.25;
      const pre = G.fairValue(), price = pre / st.shares, raise = price * st.shares * f / (1 - f) * (1 - G.IPO.fee);
      return `<p class="sub">股票上市可以一次募得大量資金，但你的持股會被稀釋；持股低於 50% 後，年度股東會支持度連續兩年不足 40% 就會被撤換。</p>
        <ul class="checks">${k.items.map(([n, ok, v]) => `<li class="${ok ? 'pos' : 'neg'}"><span>${ok ? '✓' : '✗'}</span>${n}<em>${esc(v)}</em></li>`).join('')}</ul>
        ${st.pending ? `<div class="callout"><b>上市審查中</b><p>預計 ${Math.max(0, Math.ceil((st.pending.at - S.time) / 86400000))} 天後掛牌，釋出 ${Math.round(st.pending.floatPct * 100)}% 新股。</p></div>` : `
        <label class="slider"><span>釋出新股比例<small>上市後占總股數</small></span><input type="range" id="ipo-float" min="0.1" max="0.4" step="0.05" value="${f}" data-act="ipo-float"><output>${Math.round(f * 100)}%</output></label>
        <dl class="facts"><dt>估計上市前市值</dt><dd>${M(pre)}（本益比 ${G.peRatio().toFixed(1)} 倍）</dd><dt>估計承銷價</dt><dd>$${price.toFixed(2)}／股</dd><dt>估計募得資金</dt><dd>${M(raise)}（扣除 5% 承銷費）</dd><dt>上市後你的持股</dt><dd>${(S.founder.equity * (1 - f)).toFixed(1)}%</dd></dl>
        <div class="row-btns"><button class="btn primary" data-act="ipo-apply" ${k.ok ? '' : 'disabled'}>申請上市（申請費 ${M(G.IPO.applyFee)}，審查 ${G.IPO.reviewDays} 天）</button></div>`}`;
    }
    const h = st.hist, p0 = st.ipoPrice, chg = (st.price - p0) / p0;
    let spark = '';
    if (h.length > 1) {
      const vals = h.map((x) => x.p), mn = Math.min(...vals), mx = Math.max(...vals), w = 320, ht = 80;
      const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${ht - 6 - ((v - mn) / (mx - mn || 1)) * (ht - 12)}`).join(' ');
      spark = `<figure class="spark"><figcaption>上市以來股價（近 ${h.length} 個交易日）</figcaption><svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none"><polygon points="0,${ht} ${pts} ${w},${ht}" class="area"/><polyline points="${pts}" class="line"/></svg><div class="axis"><span>$${mn.toFixed(2)}</span><span>$${mx.toFixed(2)}</span></div></figure>`;
    }
    const ni = S.fin.statements.slice(-12).reduce((s, x) => s + x.ni, 0);
    return `<dl class="facts"><dt>股價</dt><dd>$${st.price.toFixed(2)} <span class="${neg(chg)}">（較承銷價 ${chg >= 0 ? '+' : ''}${pct(chg)}）</span></dd>
        <dt>市值</dt><dd>${M(st.price * st.shares)}</dd><dt>本益比</dt><dd>${ni > 0 ? (st.price * st.shares / ni).toFixed(1) + ' 倍' : '虧損中'}</dd>
        <dt>總股數</dt><dd>${(st.shares / 1e6).toFixed(1)} 百萬股</dd><dt>你的持股</dt><dd>${S.founder.equity}%${S.founder.equity >= 50 ? '（過半，經營權穩固）' : ''}</dd>
        <dt>上次股東會支持度</dt><dd>${st.lastApproval != null ? st.lastApproval.toFixed(0) + '%' : '尚未召開'}</dd></dl>
      ${U.ownStockExtra ? U.ownStockExtra() : spark}
      <label class="slider"><span>股利發放率<small>年度稅後淨利</small></span><input type="range" id="payout" min="0" max="0.8" step="0.05" value="${st.payout}" data-act="payout"><output>${Math.round(st.payout * 100)}%</output></label>
      <div class="row-btns"><button class="btn" data-act="issue" data-p="0.1">現金增資 10%</button><button class="btn" data-act="issue" data-p="0.2">現金增資 20%</button></div>
      ${U.holdersBox ? U.holdersBox() : ''}
      <p class="note">股價＝大盤（多空循環、波動群聚）× 1.2 倍貝他 ＋ 航空類股消息 ＋ 公司自己的波動（負債越高、市值越小越大）＋ 每天向合理價值回歸 1.2%（近 12 個月淨利 × 本益比 ＋ 淨現金）。每月結算後依獲利變化跳空；失事、罷工、退出聯盟會下跌，加入聯盟、盟友入股會上漲；除息日股價扣掉股利。增資以市價九五折發行，每年最多一次，會稀釋你的持股。</p>`;
  }

  // ---------- 操作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    if (act0) act0(a, d, el);
    const D = U.loanDraft;
    if (a === 'fin-tab') { U.finTab = d.k; U.go('finance'); }
    if (a === 'loan-type') { D.type = d.k; D.years = Math.min(D.years, G.LOAN.maxYears[d.k]); U.render(); }
    if (a === 'loan-take') {
      const r = G.takeLoan({ type: D.type, amount: Math.min(+D.amount || 0, Infinity), years: D.years, collateral: D.collateral });
      if (r.ok) { U.toast(`已撥款 ${M(r.loan.principal)}`); D.amount = ''; D.collateral = []; } else U.toast(r.msg, true);
      U.render(); U.updateTop();
    }
    if (a === 'loan-repay') { const r = G.repayLoan(+d.id); U.toast(r.ok ? '已提前清償' : r.msg, !r.ok); U.render(); }
    if (a === 'ipo-apply') { const r = G.ipoApply(U.ipoFloat || 0.25); U.toast(r.ok ? '已送出上市申請' : r.msg, !r.ok); U.render(); }
    if (a === 'issue') { const r = G.issueShares(+d.p); U.toast(r.ok ? `增資募得 ${M(r.net)}` : r.msg, !r.ok); U.render(); }
    if (a === 'layout') { G.setLayoutPref(d.k); U.render(); }
    if (a === 'gameover-restart') { G.setSpeed(0); G.S = null; G.wipe(); U.closeModal(); G.showIntro(); }
  };
  const ch0 = U.change3;
  U.change3 = (el, a) => {
    if (ch0 && ch0(el, a)) return true;
    const D = U.loanDraft;
    if (a === 'loan-col') { const id = +el.dataset.id; D.collateral = el.checked ? [...D.collateral, id] : D.collateral.filter((x) => x !== id); U.render(); return true; }
    if (a === 'loan-years') { D.years = +el.value; U.render(); return true; }
    if (a === 'loan-amt') { D.amount = el.value; U.render(); return true; }
    if (a === 'payout') { G.setPayout(+el.value); return true; }
    return false;
  };
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.act === 'ipo-float') { U.ipoFloat = +el.value; el.nextElementSibling.textContent = Math.round(el.value * 100) + '%'; }
    if (el.dataset.act === 'payout') el.nextElementSibling.textContent = Math.round(el.value * 100) + '%';
    if (el.dataset.act === 'loan-amt') U.loanDraft.amount = el.value;
  });

  // ---------- 遊戲結束 ----------
  U.gameOver = (reason) => {
    const S = G.S;
    const title = reason === 'bankrupt' ? '公司破產' : '你被撤換了';
    const why = reason === 'bankrupt' ? '現金長期為負、無法再向銀行借款，或信用貸款連續違約，法院宣告破產。' : reason === 'shareholders' ? '持股未過半，年度股東會連續兩年支持度不足，股東會撤換經營者。' : '董事會決議解除你的經營職務。';
    U.modal(`<p class="eyebrow danger-ink">遊戲結束</p><h2>${title}</h2><p>${why}</p>
      <dl class="facts"><dt>經營期間</dt><dd>${((S.time - S.start) / (365 * 86400000)).toFixed(1)} 年</dd><dt>機隊</dt><dd>${S.fleet.length} 架</dd><dt>航線</dt><dd>${S.routes.length} 條</dd><dt>社會評價</dt><dd>${S.rep.toFixed(0)}</dd><dt>你的持股</dt><dd>${S.founder.equity}%</dd></dl>
      <div class="row-btns"><button class="btn primary" data-act="gameover-restart">重新創業</button></div>`);
  };

  // ---------- 手機／電腦雙版面 ----------
  const KEY = 'airline-founder-layout';
  G.layoutPref = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } };
  G.detectLayout = () => {
    const pref = G.layoutPref();
    if (pref !== 'auto') return pref;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600 || window.innerWidth < 760;
    return (coarse && Math.min(screen.width, screen.height) < 820) || small ? 'mobile' : 'desktop';
  };
  G.applyLayout = () => {
    const mode = G.detectLayout(), root = document.documentElement;
    if (root.dataset.layout !== mode) {
      root.dataset.layout = mode;
      const p = $('#panel');
      if (p) p.dataset.sheet = mode === 'mobile' ? 'closed' : 'half'; // 手機版預設收起抽屜，電腦版預設展開面板
      window.dispatchEvent(new Event('resize'));
    }
  };
  G.setLayoutPref = (k) => { try { localStorage.setItem(KEY, k); } catch (e) {} G.applyLayout(); };
  U.isMobile = () => document.documentElement.dataset.layout === 'mobile';
  // 手機版：底部抽屜狀態（closed／half／full）
  U.sheet = (state) => {
    const p = $('#panel');
    if (!p) return;
    p.dataset.sheet = state;
    const h = $('#sheet-handle');
    if (h) h.setAttribute('aria-label', state === 'full' ? '縮小面板' : '展開面板');
  };
  const go0 = U.go;
  U.go = (tab) => { go0(tab); if ($('#panel').dataset.sheet === 'closed') { U.sheet('half'); window.dispatchEvent(new Event('resize')); } };
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('#tabs [data-tab]');
    if (tab && tab.dataset.tab === U.tab && $('#panel').dataset.sheet !== 'closed' && e.isTrusted) {
      setTimeout(() => U.sheet('closed'), 0); // 再點一次目前的分頁就收起（電腦版收成只剩圖示列）
    }
    if (U.isMobile() && e.target.closest('#sheet-handle')) U.sheet($('#panel').dataset.sheet === 'full' ? 'half' : 'full');
  }, true);
  window.addEventListener('resize', () => { if (G.layoutPref() === 'auto') G.applyLayout(); });
  U.layoutSetting = () => {
    const p = G.layoutPref();
    return `<div><span class="lbl">顯示版面</span><div class="seg" role="group" aria-label="顯示版面">${[['auto', '自動偵測'], ['desktop', '電腦版'], ['mobile', '手機版']].map(([k, n]) => `<button data-act="layout" data-k="${k}" aria-pressed="${p === k}">${n}</button>`).join('')}</div><p class="note">目前使用${U.isMobile() ? '手機版' : '電腦版'}。自動偵測會依螢幕大小與觸控裝置選擇。</p></div>`;
  };
})();

// 總覽加上現金耗盡提醒
(function () {
  const G = window.G, U = G.ui, ov0 = U.overviewV3;
  U.overviewV3 = () => (G.S.cash <= 0 ? `<div class="callout warn"><b>現金已經耗盡</b><p>向銀行申請信用貸款或飛機抵押貸款，避免公司破產。</p><button class="btn primary" data-act="fin-tab" data-k="bank">前往銀行</button></div>` : '') + (ov0 ? ov0() : '');
})();
