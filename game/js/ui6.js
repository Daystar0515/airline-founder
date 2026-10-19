// v0.6 介面：開航設定（航班編號、自動定價、推薦閒置飛機）、飛機改編號、政府合約分頁。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const DAY = 86400000;
  const pct = (v) => Math.round(v * 100) + '%';
  const days = (ms) => Math.max(0, Math.ceil(ms / DAY));
  const date = (t) => new Date(t).toISOString().slice(0, 10);

  // ---------- 開航設定 ----------
  U.routeSetup = (a, b) => {
    const S = G.S, n = G.nextFlightNo();
    const idle = G.recommendIdle(a, b).slice(0, 4);
    let rec = '';
    if (idle.length) {
      const best = idle[0];
      rec = `<h4>推薦執飛飛機（機隊內閒置）</h4>
        <p class="note">依每架閒置飛機的艙等配置與最佳票價估算；最推薦機型：<b>${esc(best.type.model)}</b>。</p>
        <div class="pick-list">${idle.map((e, i) => `<label class="pick ${i === 0 ? 'best' : ''}"><input type="radio" name="rs-ac" value="${e.ac.id}" ${i === 0 ? 'checked' : ''}>
          <span><b>${esc(e.ac.reg)}</b> ${esc(e.type.model)} · ${G.cabinSeats(e.ac.cabin)} 座${i === 0 ? '<i class="tag-best">推薦</i>' : ''}</span>
          <span class="pick-num">預估每日 <b class="${e.daily.profit < 0 ? 'neg' : 'pos'}">${M(e.daily.profit)}</b> · 載客率 ${pct(e.lf)}</span></label>`).join('')}
          <label class="pick"><input type="radio" name="rs-ac" value=""><span>先不指派</span></label></div>`;
    } else {
      const types = G.recommendType(a, b).slice(0, 3);
      rec = `<h4>推薦機型</h4>
        <p class="note">機隊裡沒有能飛這條航線的閒置飛機。依預設艙等估算，扣掉租金後每日獲利最高的機型：</p>
        <div class="pick-list">${types.map((e, i) => `<div class="pick ${i === 0 ? 'best' : ''}"><span><b>${esc(e.type.model)}</b>${i === 0 ? '<i class="tag-best">推薦</i>' : ''}</span><span class="pick-num">扣租金後每日 <b class="${e.net < 0 ? 'neg' : 'pos'}">${M(e.net)}</b> · 載客率 ${pct(e.lf)}</span></div>`).join('')}</div>`;
    }
    return `<div class="route-setup">
      <h4>航班編號</h4>
      <div class="fno-edit"><span class="fno-pair"><span>${esc(S.company.code)}</span><input type="number" id="rs-out" min="1" max="9999" value="${n.out}" aria-label="去程航班編號"><small>${a}→${b}</small></span>
        <span class="fno-pair"><span>${esc(S.company.code)}</span><input type="number" id="rs-back" min="1" max="9999" value="${n.back}" aria-label="回程航班編號"><small>${b}→${a}</small></span></div>
      <label class="switch"><input type="checkbox" id="rs-auto" checked><span></span>依艙等自動最佳定價</label>
      ${rec}
    </div>`;
  };

  // ---------- 旅客組成說明（觀光／商務、真實數據加成）----------
  U.segFacts = (A, B) => {
    const sg = G.routeSegments(A, B), af = sg.aff, ga = G.gawc(A), gb = G.gawc(B);
    let h = `<dt>旅客組成</dt><dd>觀光 ${pct(1 - sg.bs)}／商務 ${pct(sg.bs)}</dd>`;
    if (af.m > 1.001) h += `<dt>觀光熱度</dt><dd>需求 ×${af.m.toFixed(2)}<small class="src">${esc(af.note)}（2024）</small></dd>`;
    if (af.pref >= 0.05) h += `<dt>旅遊嚮往度</dt><dd>觀光客較不在意票價<small class="src">${esc(af.prefNote)}（2024）</small></dd>`;
    if (ga || gb) h += `<dt>國際商務城市</dt><dd>${[[A, ga], [B, gb]].filter(([, g]) => g).map(([ap, g]) => `${ap.iata} ${g[1]}`).join('、')}<small class="src">GaWC 2024 世界城市分級</small></dd>`;
    return h;
  };

  // ---------- 飛機改編號 ----------
  U.regDialog = (acId) => {
    const ac = G.S.fleet.find((a) => a.id === acId);
    U.modal(`<h2>修改飛機編號</h2><p class="sub">${esc(G.TYPES[ac.type].model)} · 目前 ${esc(ac.reg)}</p>
      <label class="field">新編號<input id="reg-new" maxlength="10" value="${esc(ac.reg)}" placeholder="${esc(G.regHint())}" autocomplete="off"></label>
      <p class="note">2–10 個英文字母、數字或連字號，不能和機隊其他飛機重複。</p>
      <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="modal-close">取消</button><button class="btn primary" data-act="reg-save" data-id="${ac.id}">儲存</button></div>`);
    setTimeout(() => { const i = $('#reg-new'); if (i) { i.focus(); i.select(); } }, 30);
  };

  // ---------- 政府合約分頁 ----------
  const KIND = (k) => G.GOV_KINDS[k];
  function scorecard() {
    const q = G.govQuality(), p = q.parts;
    const item = (n, v, w) => `<div><span>${n}<em> ×${w}</em></span><b>${Math.round(v)}</b></div>`;
    return `<div class="gov-score"><div class="gov-total"><span>投標品質分數</span><b>${q.quality.toFixed(1)}</b><em>${q.bonus ? `前政府官員背景：總分 ×${(1 + q.bonus).toFixed(2)}` : '總分 = 價格分數 50% ＋ 品質分數 50%'}</em></div>
      <div class="gov-parts">${item('社會評價', p.rep, '30%')}${item('飛安紀錄', p.safety, '25%')}${item('準點率', p.ontime, '20%')}${item('信用評分', p.credit, '15%')}${item('員工士氣', p.staff, '10%')}</div></div>`;
  }
  function bidLine(t, v) {
    const sc = G.govScore(t, v);
    return `價格分數 ${sc.price.toFixed(0)} · 預估總分 <b>${sc.total.toFixed(1)}</b>`;
  }
  function tenderCard(t) {
    const S = G.S, why = G.govEligible(t), left = days(t.deadline - S.time);
    const K = KIND(t.kind);
    let facts = `<dt>招標機關</dt><dd>${esc(t.agency)}</dd>`;
    if (t.kind === 'pso') facts += `<dt>航線</dt><dd>${t.a} ⇄ ${t.b} · ${G.num(t.dist)} 公里</dd><dt>每月補貼上限</dt><dd>${M(t.budget)}</dd>`;
    if (t.kind === 'charter' || t.kind === 'evac') {
      const rt = G.TYPES[t.refType];
      facts += `<dt>航線</dt><dd>${t.a} ⇄ ${t.b} · ${G.num(t.dist)} 公里</dd><dt>需求</dt><dd>至少 ${t.seats} 座、航程 ${G.num(t.dist)} 公里以上</dd>`;
      facts += `<dt>${t.kind === 'evac' ? '固定酬勞' : '預算上限'}</dt><dd>${M(t.budget)}</dd><dt>成本參考</dt><dd>以 ${esc(rt ? rt.model : '—')} 估算往返約 ${rt ? M(G.charterCost(rt, G.AP[t.a], G.AP[t.b])) : '—'}</dd>`;
      const n = G.charterCandidates({ a: t.a, b: t.b, seats: t.seats }).length;
      facts += `<dt>機隊可派</dt><dd>${n ? n + ' 架' : '<span class="neg">目前沒有符合的飛機</span>'}</dd>`;
    }
    if (t.kind === 'travel') facts += `<dt>樞紐</dt><dd>${t.a}（目前 ${G.routesFrom(t.a).length} 條航線）</dd><dt>每月採購金額</dt><dd>${M(t.budget)}</dd>`;
    facts += t.kind === 'evac' ? `<dt>回覆期限</dt><dd>${left <= 1 ? '不到 1 天' : left + ' 天'}</dd>` : `<dt>截止投標</dt><dd>${left} 天後（${t.rivals.length} 家競爭）</dd>`;
    let form = '';
    if (why) form = `<p class="reply bad">${esc(why)}</p>`;
    else if (t.kind === 'evac') {
      const cand = G.charterCandidates({ a: t.a, b: t.b, seats: t.seats });
      form = cand.length ? `<div class="row-btns"><select id="evac-ac-${t.id}">${cand.map((ac) => `<option value="${ac.id}">${esc(ac.reg)} ${esc(G.TYPES[ac.type].model)} · ${G.cabinSeats(ac.cabin)} 座${ac.route ? '（暫停原航線）' : ''}</option>`).join('')}</select>
        <button class="btn primary" data-act="gov-evac" data-id="${t.id}">接受任務</button><button class="btn" data-act="gov-decline" data-id="${t.id}">婉拒</button></div>`
        : `<p class="reply bad">機隊沒有符合需求的飛機。</p><div class="row-btns"><button class="btn" data-act="gov-decline" data-id="${t.id}">婉拒</button></div>`;
    } else {
      const isT = t.kind === 'travel';
      const v = t.bid != null ? t.bid : isT ? 0.1 : t.budget * 0.8;
      const min = isT ? 0 : 0.4, max = isT ? 0.3 : 1, cur = isT ? v : v / t.budget;
      form = `<div class="bid">
        <label class="slider"><span>${isT ? '提供折扣' : '報價'}<small id="bid-v-${t.id}">${isT ? pct(v) : M(v)}</small></span>
          <input type="range" id="bid-${t.id}" min="${min}" max="${max}" step="0.01" value="${cur.toFixed(2)}" data-act="gov-bid-range" data-id="${t.id}"><output>${isT ? '' : pct(cur)}</output></label>
        <p class="meta" id="bid-s-${t.id}">${bidLine(t, v)}</p>
        <div class="row-btns">${t.bid != null ? `<span class="chip">已投標 ${isT ? '折扣 ' + pct(t.bid) : M(t.bid)}</span><span class="spacer"></span><button class="btn sm" data-act="gov-withdraw" data-id="${t.id}">撤回</button>` : '<span class="spacer"></span>'}
          <button class="btn primary sm" data-act="gov-bid" data-id="${t.id}">${t.bid != null ? '更新投標' : '投標'}</button></div></div>`;
    }
    return `<article class="gov-card ${t.kind}"><header><i class="gov-ico">${K.icon}</i><div><b>${esc(t.title)}</b><span>${K.name}</span></div></header>
      <p class="sub">${esc(t.desc)}</p><dl class="facts">${facts}</dl>${form}</article>`;
  }
  function contractCard(c) {
    const S = G.S, K = KIND(c.kind);
    let body = '';
    if (c.kind === 'pso') {
      const r = S.routes.find((x) => x.id === c.routeId);
      const dIn = new Date(S.time).getUTCDate(), need = c.weekly * 2 * (dIn / 7);
      const done = r ? r.stats.flights : 0, n = r ? G.routeAircraft(r).length : 0;
      body = `<dl class="facts"><dt>本月執飛</dt><dd>${done} 班（到今天應有約 ${Math.round(need)} 班）</dd><dt>執飛飛機</dt><dd>${n ? n + ' 架' : '<span class="neg">尚未指派，到「機隊」指派飛機</span>'}</dd>
        <dt>每月補貼</dt><dd>${M(c.price)}</dd><dt>經濟艙票價上限</dt><dd>${pct(c.fareCapY)}</dd><dt>累計撥款</dt><dd>${M(c.paid)}</dd><dt>合約到期</dt><dd>${date(c.end)}</dd>${c.strikes ? `<dt>未達標</dt><dd class="neg">連續 ${c.strikes}/${G.GOV.strikes} 個月</dd>` : ''}</dl>
        ${r ? `<div class="row-btns"><button class="btn sm" data-act="route-open" data-id="${r.id}">查看航線</button></div>` : ''}`;
    } else if (c.kind === 'travel') {
      const rs = G.routesFrom(c.a);
      let fl = 0, dl = 0; rs.forEach((r) => { fl += r.stats.flights; dl += r.stats.delays || 0; });
      body = `<dl class="facts"><dt>${c.a} 航線</dt><dd class="${rs.length < c.minRoutes ? 'neg' : ''}">${rs.length}／至少 ${c.minRoutes} 條</dd><dt>本月準點率</dt><dd class="${fl && 1 - dl / fl < c.otp ? 'neg' : ''}">${fl ? pct(1 - dl / fl) : '—'}（要求 ${pct(c.otp)}）</dd>
        <dt>每月收入</dt><dd>${M(c.budget * (1 - c.price))}（折扣 ${pct(c.price)}）</dd><dt>累計撥款</dt><dd>${M(c.paid)}</dd><dt>合約到期</dt><dd>${date(c.end)}</dd></dl>`;
    } else if (c.state === 'pick') {
      const cand = G.charterCandidates(c);
      const lt = c.pickBy - S.time;
      body = `<p class="reply bad">請在${lt < DAY ? '今天結束前' : ` ${days(lt)} 天內`}派出飛機，否則罰款 ${M(c.price * 0.1)}。</p>
        ${cand.length ? `<div class="row-btns"><select id="disp-${c.id}">${cand.map((ac) => `<option value="${ac.id}">${esc(ac.reg)} ${esc(G.TYPES[ac.type].model)} · ${G.cabinSeats(ac.cabin)} 座${ac.route ? '（暫停原航線）' : ''}</option>`).join('')}</select><button class="btn primary" data-act="gov-dispatch" data-id="${c.id}">派機執行</button></div>` : '<p class="note">機隊沒有符合的飛機（座位與航程），可以先租一架。</p>'}
        <dl class="facts"><dt>酬勞</dt><dd>${M(c.price)}</dd><dt>完成期限</dt><dd>${date(c.dueBy)}</dd></dl>`;
    } else {
      const ac = S.fleet.find((a) => a.id === c.acId), ch = ac && ac.charter;
      const stage = !ch ? '—' : ch.i <= 0 ? `調機前往 ${c.a}` : ch.i === 1 ? `飛往 ${c.b}` : ac.st === 'turn' && ac.loc === c.b ? `在 ${c.b} 停留中` : `返回 ${c.a}`;
      body = `<dl class="facts"><dt>執行飛機</dt><dd>${esc(c.reg)}</dd><dt>進度</dt><dd>${stage}</dd><dt>酬勞</dt><dd>${M(c.price)}（完成後入帳）</dd><dt>完成期限</dt><dd>${date(c.dueBy)}</dd></dl>`;
    }
    return `<article class="gov-card ${c.kind} active"><header><i class="gov-ico">${K.icon}</i><div><b>${esc(c.title)}</b><span>${K.name} · ${c.state === 'pick' ? '待派機' : c.state === 'flying' ? '執行中' : '履約中'}</span></div></header>${body}</article>`;
  }
  U.govTab = () => {
    const S = G.S;
    if (!S.gov) G.initGov(S);
    const gv = S.gov;
    const urgent = gv.tenders.filter((t) => t.kind === 'evac');
    const open = gv.tenders.filter((t) => t.kind !== 'evac');
    const nextIn = days(gv.nextAt - S.time);
    return `<div class="sec-head"><h3>政府合約</h3><span class="meta">${open.length ? `${open.length} 個標案招標中` : `約 ${nextIn} 天後有新標案`}</span></div>
      ${scorecard()}
      ${urgent.length ? `<h3>緊急任務</h3>${urgent.map(tenderCard).join('')}` : ''}
      ${gv.contracts.length ? `<h3>執行中的合約</h3>${gv.contracts.map(contractCard).join('')}` : ''}
      <h3>招標中</h3>
      ${open.length ? open.map(tenderCard).join('') : '<div class="empty"><b>目前沒有招標</b><p>政府會不定期公告偏遠航線補貼、包機與公務運輸標案，只限你設有樞紐的國家。</p></div>'}
      ${gv.done.length ? `<h3>紀錄</h3><ul class="gov-log">${gv.done.slice(0, 12).map((c) => `<li class="${c.state}"><b>${{ done: '完成', failed: '失敗', lost: '未得標' }[c.state] || c.state}</b><span>${esc(c.title)}</span><em>${esc(c.note || '')}</em></li>`).join('')}</ul>` : ''}`;
  };
  // 待處理數量：分頁徽章
  U.govBadge = () => {
    const b = document.querySelector('#tabs [data-tab="gov"]');
    if (!b || !G.S || !G.S.gov) return;
    const n = G.S.gov.tenders.filter((t) => t.kind === 'evac').length + G.S.gov.contracts.filter((c) => c.state === 'pick').length;
    if (n) b.dataset.badge = n; else delete b.dataset.badge;
  };

  // ---------- 操作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    if (act0) act0(a, d, el);
    const S = G.S, done = (r, ok) => { if (r && r.ok === false) U.toast(r.msg, true); else if (ok) U.toast(ok); U.render(); U.updateTop(); U.govBadge(); };
    if (a === 'fno-save') {
      const out = +($('#fno-o-' + d.id) || {}).value, back = +($('#fno-b-' + d.id) || {}).value;
      done(G.setFlightNo(+d.id, out, back), '航班編號已更新');
    }
    if (a === 'fare-opt') { const r = S.routes.find((x) => x.id === +d.id); G.optimizeFares(r); done(null, '已套用建議票價'); }
    if (a === 'reg-edit') U.regDialog(+d.id);
    if (a === 'reg-save') { const r = G.renameAircraft(+d.id, ($('#reg-new') || {}).value); if (r.ok) { U.closeModal(); done(r, '飛機編號已更新'); } else U.toast(r.msg, true); }
    if (a === 'gov-bid') {
      const t = S.gov.tenders.find((x) => x.id === +d.id), v = +$('#bid-' + d.id).value;
      done(G.govBid(t.id, t.kind === 'travel' ? v : Math.round(t.budget * v / 1000) * 1000), '已送出投標');
    }
    if (a === 'gov-withdraw') done(G.govWithdraw(+d.id), '已撤回投標');
    if (a === 'gov-evac') { const r = G.govAcceptEvac(+d.id, +$('#evac-ac-' + d.id).value); done(r, r.ok ? '已派機執行撤僑任務' : null); G.map.invalidate(); }
    if (a === 'gov-decline') done(G.govDecline(+d.id), '已婉拒');
    if (a === 'gov-dispatch') { const r = G.govDispatch(+d.id, +$('#disp-' + d.id).value); done(r, r.ok ? `已派 ${r.contract.reg} 執行` : null); }
  };
  const ch0 = U.change3;
  U.change3 = (el, a) => {
    if (ch0 && ch0(el, a)) return true;
    if (a === 'auto-fare') {
      const r = G.S.routes.find((x) => x.id === +el.dataset.id);
      r.autoFare = el.checked;
      if (r.autoFare) G.optimizeFares(r);
      U.render(); return true;
    }
    return false;
  };
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'buy-reg') U.regDraft = el.value;
    if (el.dataset.act === 'gov-bid-range') {
      const t = G.S.gov.tenders.find((x) => x.id === +el.dataset.id);
      const v = t.kind === 'travel' ? +el.value : Math.round(t.budget * +el.value / 1000) * 1000;
      $('#bid-v-' + t.id).textContent = t.kind === 'travel' ? pct(v) : M(v);
      el.nextElementSibling.textContent = t.kind === 'travel' ? '' : pct(+el.value);
      $('#bid-s-' + t.id).innerHTML = bidLine(t, v);
    }
  });
})();
