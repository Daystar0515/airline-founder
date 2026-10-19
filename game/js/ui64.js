// v0.6.4 介面：會員方案（服務分頁）、飛機整修對話框、二手市場的整修估價。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v, d) => G.money(v, d);
  const pct = (v) => Math.round(v * 100) + '%';
  const num = (v) => G.num(Math.round(v));
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };

  // ---------- 會員方案：估算 ----------
  // 還沒開辦時，用最近 30 天的旅客估算潛在會員
  function poolNow() {
    const st = G.loyaltyStats();
    if (st && (st.pool.B || st.pool.L)) return st.pool;
    const ds = G.S.days.slice(-30), n = Math.max(1, ds.length);
    const b = ds.reduce((s, d) => s + (d.paxB || 0), 0) / n, all = ds.reduce((s, d) => s + (d.pax || 0), 0) / n;
    return { B: (b * 365) / G.LOY.trips.B, L: (Math.max(0, all - b) * 365) / G.LOY.trips.L };
  }
  // 穩定後的預估：每個等級的會員數、每月年費收入與福利成本、攬客率加成
  function project(tiers) {
    const pool = poolNow(), out = { tiers: [], fee: 0, cost: 0, boost: { B: 0, L: 0 }, members: 0 };
    ['B', 'L'].forEach((s) => {
      const rates = G.joinRates(tiers, s);
      tiers.forEach((t, i) => {
        const e = G.tierEcon(t, s), m = pool[s] * rates[i];
        out.tiers[i] = out.tiers[i] || {};
        out.tiers[i][s] = { rate: rates[i], m, e };
        out.fee += (m * t.fee) / 12; out.cost += (m * e.cost) / 12; out.members += m;
        out.boost[s] += (pool[s] ? m / pool[s] : 0) * Math.min(1.5, e.value / G.LOY.ref[s]);
      });
    });
    out.cost += G.LOY.adminMonthly + G.LOY.adminPerMember * out.members;
    out.boost.B = Math.min(G.LOY.boostCap, 1 + G.LOY.boost * out.boost.B);
    out.boost.L = Math.min(G.LOY.boostCap, 1 + G.LOY.boost * out.boost.L);
    out.pool = pool;
    return out;
  }

  // ---------- 服務分頁：會員方案摘要 ----------
  const service0 = U.serviceTab;
  U.serviceTab = () => {
    const st = G.loyaltyStats();
    let html;
    if (!st) {
      html = `<div class="callout"><b>會員方案</b><p>自訂會員等級、年費與福利：年費是固定收入，會員也會優先搭你的航班（固定客流）。貴賓室、優先登機、保證座位、升等券較吸引商務客；票價折扣、行李、選位、生日禮較吸引觀光客。開辦費 ${M(G.LOY.setup)}。</p><button class="btn primary" data-act="loy-edit">規劃會員方案</button></div>`;
    } else {
      const P = G.S.loyalty, last = st.last;
      html = `<section class="loy-sum">
        <header><h3>${esc(P.name)}</h3><span class="spacer"></span><button class="btn sm" data-act="loy-edit">調整等級與福利</button></header>
        <div class="kpis">
          <div><span>會員人數</span><b>${num(st.total)}</b><em>商務 ${num(G.memberCount('B'))}・觀光 ${num(G.memberCount('L'))}</em></div>
          <div><span>${last ? `${last.m} 月` : '本月至今'}年費收入</span><b class="pos">${M(last ? last.fee : st.mtd.fee)}</b><em>福利與營運成本 ${M(last ? last.cost : st.mtd.cost)}</em></div>
          <div><span>會員帶來的攬客率</span><b class="b-sm">商務 +${pct(st.boost.B - 1)}<br>觀光 +${pct(st.boost.L - 1)}</b><em>會員越多、福利越好，加成越高（上限 +${pct(G.LOY.boostCap - 1)}）</em></div>
        </div>
        <div class="table-wrap"><table class="loy-tiers"><thead><tr><th>等級</th><th>年費</th><th>商務會員</th><th>觀光會員</th></tr></thead><tbody>
        ${st.tiers.map(({ t, mB, mL }) => `<tr class="tier-row"><td><b>${esc(t.name)}</b></td><td>${t.fee ? M(t.fee) : '免費'}</td><td>${num(mB)}</td><td>${num(mL)}</td></tr><tr class="ben-row"><td colspan="4" class="ben-list">${benSummary(t)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="note">會員人數每天朝「潛在會員 × 加入率」移動；潛在會員是最近 30 天搭你航班的不重複旅客（商務客一年約搭 ${G.LOY.trips.B} 趟、觀光客約 ${G.LOY.trips.L} 趟）。平均票價 ${M(st.fare)}。</p>
      </section>`;
    }
    return html + '<h3 class="sec-gap">餐飲</h3>' + service0();
  };
  const benSummary = (t) => G.BENEFITS.filter((b) => t.ben[b.id]).map((b) => `<span class="chip ${b.fit === 'B' ? 'fit-b' : b.fit === 'L' ? 'fit-l' : ''}">${esc(b.name)}：${esc(b.levels[t.ben[b.id]])}</span>`).join('') || '<small class="muted">沒有福利</small>';

  // ---------- 會員方案編輯器 ----------
  let draft = null;
  U.loyaltyDialog = () => {
    const P = G.S.loyalty;
    const src = P ? { name: P.name, tiers: P.tiers.map((t) => ({ name: t.name, fee: t.fee, ben: { ...t.ben } })) } : G.defaultLoyalty();
    draft = JSON.parse(JSON.stringify(src));
    drawLoy();
  };
  function drawLoy() {
    const P = G.S.loyalty, T = draft.tiers;
    U.modal(`<h2>${P ? '調整會員方案' : '規劃會員方案'}</h2>
      <p class="sub">等級數、名稱、年費與每一級的福利都由你決定（最多 ${G.LOY.maxTiers} 級）。年費可以是 0（免費入會的基本等級）。${P ? '調整不需再付開辦費；同名等級的會員會保留。' : `開辦費 ${M(G.LOY.setup)}，之後每月系統與客服 ${M(G.LOY.adminMonthly)} 加每位會員每月 $${G.LOY.adminPerMember.toFixed(2)}。`}</p>
      <div class="loy-top"><label class="field">方案名稱<input id="loy-name" maxlength="20" value="${esc(draft.name)}" data-act="loy-name"></label>
        <span class="spacer"></span>
        <button class="btn sm" data-act="loy-del-tier" ${T.length <= 1 ? 'disabled' : ''}>－ 減少一級</button>
        <button class="btn sm" data-act="loy-add-tier" ${T.length >= G.LOY.maxTiers ? 'disabled' : ''}>＋ 增加一級</button></div>
      <div class="table-wrap"><table class="loy-edit">
        <thead><tr><th>福利</th>${T.map((t, i) => `<th><input class="tier-name" maxlength="12" value="${esc(t.name)}" data-act="loy-tname" data-i="${i}" aria-label="第 ${i + 1} 級名稱"></th>`).join('')}</tr></thead>
        <tbody>
          <tr class="fee-row"><td><b>年費</b><small>美元／年</small></td>${T.map((t, i) => `<td><input type="number" min="0" max="${G.LOY.maxFee}" step="10" value="${t.fee}" data-act="loy-fee" data-i="${i}" aria-label="${esc(t.name)}年費"></td>`).join('')}</tr>
          ${G.BENEFITS.map((b) => `<tr><td><b>${esc(b.name)}</b><small class="fit ${b.fit === 'B' ? 'fit-b' : b.fit === 'L' ? 'fit-l' : ''}">${G.FIT_ZH[b.fit]}${b.note ? '・' + esc(b.note) : ''}</small></td>
            ${T.map((t, i) => `<td><select data-act="loy-ben" data-i="${i}" data-b="${b.id}" aria-label="${esc(t.name)} ${esc(b.name)}">${b.levels.map((n, lv) => `<option value="${lv}" ${(t.ben[b.id] || 0) === lv ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
        </tbody>
        <tfoot id="loy-est">${estRows()}</tfoot>
      </table></div>
      <div id="loy-total">${estTotal()}</div>
      <div class="row-btns">${P ? '<button class="btn danger" data-act="loy-stop">停辦會員方案</button>' : ''}<span class="spacer"></span><button class="btn" data-act="modal-close">取消</button><button class="btn primary" data-act="loy-save">${P ? '儲存調整' : `開辦（${M(G.LOY.setup)}）`}</button></div>`, 'wide');
  }
  function estRows() {
    const pj = project(draft.tiers);
    const cell = (f) => draft.tiers.map((t, i) => `<td>${f(pj.tiers[i], t)}</td>`).join('');
    return `<tr><td>商務客覺得值<small>每人每年</small></td>${cell((x) => M(x.B.e.value))}</tr>
      <tr><td>觀光客覺得值<small>每人每年</small></td>${cell((x) => M(x.L.e.value))}</tr>
      <tr><td>你的福利成本<small>商務／觀光每人每年</small></td>${cell((x) => `${M(x.B.e.cost)}／${M(x.L.e.cost)}`)}</tr>
      <tr><td>預估加入率<small>商務／觀光</small></td>${cell((x) => `${pct(x.B.rate)}／${pct(x.L.rate)}`)}</tr>
      <tr><td>穩定後會員數</td>${cell((x) => num(x.B.m + x.L.m))}</tr>`;
  }
  function estTotal() {
    const pj = project(draft.tiers), net = pj.fee - pj.cost;
    if (!pj.pool.B && !pj.pool.L) return '<p class="note">還沒有旅客資料：開航並營運一段時間後，這裡會估算會員數與收支。</p>';
    return `<dl class="order-sum">
      <dt>潛在會員</dt><dd>商務 ${num(pj.pool.B)}・觀光 ${num(pj.pool.L)}（依最近 30 天的旅客）</dd>
      <dt>穩定後每月</dt><dd>年費收入 <b class="pos">${M(pj.fee)}</b>，福利與營運成本 <b>${M(pj.cost)}</b>，淨額 <b class="${net < 0 ? 'neg' : 'pos'}">${M(net)}</b></dd>
      <dt>攬客率加成</dt><dd>商務 +${pct(pj.boost.B - 1)}・觀光 +${pct(pj.boost.L - 1)}（多出來的旅客另外帶來票價收入）</dd>
    </dl>`;
  }
  const refreshEst = () => { const a = $('#loy-est'), b = $('#loy-total'); if (a) a.innerHTML = estRows(); if (b) b.innerHTML = estTotal(); };

  // ---------- 整修對話框 ----------
  U.refurbDialog = (acId) => {
    const S = G.S, ac = S.fleet.find((a) => a.id === acId), t = G.TYPES[ac.type];
    const plan0 = G.refurbPlan(ac, 2);
    if (!plan0) return U.toast('這架飛機的機況已接近整修上限', true);
    const out = G.refurbPlan(ac, -1);
    const hubs = Object.keys(S.hubs);
    const need = plan0.cls.hangar;
    U.modal(`<h2>整修 ${esc(ac.reg)} <small>${esc(t.model)}</small></h2>
      <p class="sub">機況 <b>${pct(plan0.cond)}</b> → 整修後 <b>${pct(plan0.cap)}</b>。整修不會回到 100%：上限從 95% 起，累計每 6,000 飛行小時降 1%（這架 ${num(ac.hours)} 小時）。</p>
      <div class="table-wrap"><table class="refurb-cls"><thead><tr><th>機況</th><th>整修等級</th><th>自修需要</th><th>內容</th></tr></thead><tbody>
        ${G.REFURB.classes.map((c, i) => { const hi = i ? G.REFURB.classes[i - 1].min : 1; return `<tr class="${c === plan0.cls ? 'cur' : ''}"><td>${c.min ? `${pct(c.min)}–${pct(hi)}` : `低於 ${pct(hi)}`}</td><td><b>${c.name}</b></td><td>${c.hangar ? `${c.hangar} 級維修棚廠` : '任何樞紐'}</td><td>${esc(c.desc)}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="note">自己的棚廠等級不夠就要委外給維修廠：費用 ×${G.REFURB.outCost}、工期 ×${G.REFURB.outDays}。維修棚廠在「樞紐」興建。</p>
      <h4>選擇整修地點</h4>
      <div class="pick-list">
        ${hubs.map((k) => { const lv = G.hangarLevel(k), p = G.refurbPlan(ac, lv), ok = !p.out; return `<label class="pick ${ok ? '' : 'off'}"><input type="radio" name="rf-at" value="${k}" ${ok ? '' : 'disabled'}>
          <span><b>${k}</b> 自修 · 棚廠 ${lv} 級${ok ? '' : `<i class="tag-warn">需 ${need} 級</i>`}</span><span class="pick-num">${ok ? `${M(p.cost)} · 約 ${p.days} 天${ac.loc !== k ? ' · 需空機調機' : ''}` : '不能自修'}</span></label>`; }).join('')}
        <label class="pick"><input type="radio" name="rf-at" value=""><span><b>委外</b> · 在下一個停靠的樞紐交給維修廠</span><span class="pick-num">${M(out.cost)} · 約 ${out.days} 天</span></label>
      </div>
      <p class="note">${ac.mode === 'buy' ? '自有飛機的整修列為資本支出、計入帳面價值。' : '租賃飛機的整修列為當期費用。'}整修期間停飛；機況越好，故障與延誤越少、維修費越低、客艙品質越高。</p>
      <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="modal-close">取消</button><button class="btn primary" data-act="refurb-go" data-id="${ac.id}">排入整修</button></div>`);
    const first = document.querySelector('input[name="rf-at"]:not([disabled])');
    if (first) first.checked = true;
  };
  // 二手市場卡片的整修估價
  U.usedRefurbNote = (it) => {
    const fake = { type: it.type, cond: it.cond, hours: it.hours };
    const best = Math.max(0, ...Object.keys(G.S.hubs).map((k) => G.hangarLevel(k)));
    const p = G.refurbPlan(fake, best);
    if (!p) return '';
    return `<dt>整修</dt><dd>${pct(p.cond)} → ${pct(p.cap)}：${p.cls.name}${p.out ? `委外 ${M(p.cost)}` : `自修 ${M(p.cost)}`}</dd>`;
  };

  // ---------- 動作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'loy-edit': U.loyaltyDialog(); return;
      case 'loy-add-tier': if (draft.tiers.length < G.LOY.maxTiers) { const last = draft.tiers[draft.tiers.length - 1]; draft.tiers.push({ name: `第 ${draft.tiers.length + 1} 級`, fee: Math.round((last ? last.fee : 0) * 2 + 100), ben: { ...(last ? last.ben : {}) } }); drawLoy(); } return;
      case 'loy-del-tier': if (draft.tiers.length > 1) { draft.tiers.pop(); drawLoy(); } return;
      case 'loy-save': { const r = res(G.setLoyalty(draft)); if (r.ok) { U.toast(`會員方案「${G.S.loyalty.name}」已${G.S.loyalty.since === G.S.time ? '推出' : '更新'}`); U.closeModal(); U.render(); } return; }
      case 'loy-stop': if (el.dataset.confirm) { res(G.stopLoyalty(), '已停辦會員方案'); U.closeModal(); U.render(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認停辦'; } return;
      case 'refurb': U.refurbDialog(+d.id); return;
      case 'refurb-go': { const at = (document.querySelector('input[name="rf-at"]:checked') || {}).value || null; const r = res(G.queueRefurb(+d.id, at)); if (r.ok) { U.toast(`已排入${r.plan.cls.name}：${M(r.plan.cost)}、約 ${r.plan.days} 天`); U.closeModal(); U.render(); } return; }
      case 'refurb-cancel': res(G.cancelRefurb(+d.id), '已取消整修'); U.render(); return;
    }
    if (act0) act0(a, d, el);
  };
  document.addEventListener('input', (e) => {
    const x = e.target, a = x.dataset && x.dataset.act;
    if (!draft || !a || !a.startsWith('loy-')) return;
    if (a === 'loy-name') draft.name = x.value;
    if (a === 'loy-tname') draft.tiers[+x.dataset.i].name = x.value;
    if (a === 'loy-fee') { draft.tiers[+x.dataset.i].fee = Math.max(0, Math.min(G.LOY.maxFee, +x.value || 0)); refreshEst(); }
  });
  document.addEventListener('change', (e) => {
    const x = e.target, a = x.dataset && x.dataset.act;
    if (a === 'loy-ben' && draft) { draft.tiers[+x.dataset.i].ben[x.dataset.b] = +x.value; refreshEst(); }
  });
})();
