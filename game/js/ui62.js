// v0.6.2 介面：新機／二手市場分頁、批次購買與連號編號、艙位設定（存檔與套用）、客艙改裝費用與工期。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v, d) => G.money(v, d);
  const DAY = 86400000;
  const date = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '/');
  const pct = (v) => Math.round(v * 100) + '%';
  const condCls = (c) => (c >= 0.85 ? 'good' : c >= 0.7 ? 'mid' : 'bad');
  const condZh = (c) => (c >= 0.88 ? '極佳' : c >= 0.78 ? '良好' : c >= 0.68 ? '普通' : '偏差');

  let tab = 'new', filter = 'all';
  const FILTERS = [['all', '全部'], ['turboprop', '渦輪螺旋槳'], ['regional', '區域噴射機'], ['narrow', '窄體機'], ['wide', '寬體機']];
  const passFilter = (t) => filter === 'all' || t.body === filter;

  // ---------- 選購飛機（新機／二手市場）----------
  U.buyDialog = () => {
    const S = G.S;
    if (!S.usedMkt) G.refreshUsedMarket(S);
    const head = `<h2>選購飛機</h2>
      <p class="sub">現金 ${M(S.cash, 2)}。新飛機會停放在主要樞紐 ${G.primaryHub()}。</p>
      <div class="tabs2" role="tablist">
        <button role="tab" data-act="buy-tab" data-k="new" aria-selected="${tab === 'new'}">原廠新機</button>
        <button role="tab" data-act="buy-tab" data-k="used" aria-selected="${tab === 'used'}">二手市場 <small>${S.usedMkt.items.length} 架</small></button>
      </div>
      <div class="seg" role="group" aria-label="機種篩選">${FILTERS.map(([k, n]) => `<button data-act="buy-filter" data-k="${k}" aria-pressed="${k === filter}">${n}</button>`).join('')}</div>`;
    U.modal(head + (tab === 'new' ? newTab(S) : usedTab(S)), 'wide');
  };
  function newTab(S) {
    const groups = {};
    window.AIRCRAFT.forEach((t) => { if (t.used || t.only || !passFilter(t)) return; (groups[t.mfr] = groups[t.mfr] || []).push(t); });
    return `<p class="note">原廠交機：機況 100%，交機前可免費設定艙位；之後要改艙位得送廠改裝。可一次訂購多架。</p>
      <div class="table-wrap"><table class="catalog">
      <thead><tr><th>機型</th><th>最多座位</th><th>航程</th><th>跑道需求</th><th>油耗/時</th><th>價格</th><th>月租</th><th></th></tr></thead>
      <tbody>${Object.entries(groups).map(([mfr, ts]) => `<tr class="grp"><td colspan="8">${G.ZH(mfr)}</td></tr>` + ts.map((t) => `<tr>
        <td><b>${esc(t.model)}</b>${G.restrictionTags(t).map((x) => `<span class="chip warn">${x}</span>`).join('')}<small>${t.wide ? '寬體 · 4 艙等' : '3 艙等'}${G.presetsFor(t.id).length ? ` · ${G.presetsFor(t.id).length} 個艙位設定` : ''}</small></td>
        <td data-l="最多座位">${t.maxSeats}</td><td data-l="航程">${G.num(t.range)} km</td><td data-l="跑道需求">${G.num(t.rwy)} m</td><td data-l="油耗/時">${G.num(t.fuel)} kg</td>
        <td data-l="價格">${M(t.price * 1e6)}</td><td data-l="月租">${M(G.leaseMonthly(t))}</td>
        <td class="btns"><button class="btn sm primary" data-act="order" data-t="${t.id}" data-mode="buy">購買</button><button class="btn sm" data-act="order" data-t="${t.id}" data-mode="lease">租賃</button></td>
      </tr>`).join('')).join('')}</tbody></table></div>`;
  }
  function usedTab(S) {
    const mk = S.usedMkt, items = mk.items.filter((it) => passFilter(G.TYPES[it.type]));
    const left = Math.max(0, Math.ceil((mk.nextAt - S.time) / DAY));
    return `<p class="note">${G.quarterLabel(mk.since)}的待售飛機，每季第一天刷新（下次 ${date(mk.nextAt)}，還有 ${left} 天）。同一款飛機會因機齡、機況與原本的艙位配置而有不同價格；機況越差越容易故障、維修費越高。買下後沿用原艙位，要改得花錢送廠改裝。</p>
      <label class="field reg-field">飛機編號（選填，留白自動編為 ${esc(G.defaultReg())}）<input id="used-reg" maxlength="10" placeholder="${esc(G.regHint())}" autocomplete="off"></label>
      ${items.length ? `<div class="used-list">${items.map((it) => usedCard(S, it)).join('')}</div>` : '<p class="empty">這一類目前沒有待售的飛機，下一季再來看看。</p>'}`;
  }
  function usedCard(S, it) {
    const t = G.TYPES[it.type], seats = G.cabinSeats(it.cabin), newP = t.used ? t.price / 0.5 * 1e6 : t.price * 1e6;
    return `<article class="used">
      <header><b>${esc(t.model)}</b><span class="mfr">${G.ZH(t.mfr)}</span>${G.restrictionTags(t).map((x) => `<span class="chip warn">${x}</span>`).join('')}</header>
      <div class="cond ${condCls(it.cond)}"><i style="width:${pct(it.cond)}"></i><span>機況 ${pct(it.cond)} · ${condZh(it.cond)}</span></div>
      <dl>
        <dt>機齡</dt><dd>${it.age} 年</dd><dt>累計</dt><dd>${G.num(it.hours)} 小時／${G.num(it.cycles)} 起降</dd>
        <dt>艙位</dt><dd>${seats} 座 · ${esc(G.cabinSummary(t, it.cabin))}</dd><dt>來源</dt><dd>${esc(it.seller)}</dd>
        ${U.usedRefurbNote ? U.usedRefurbNote(it) : ''}
      </dl>
      <footer><span class="price"><b>${M(it.price)}</b><small>約新機的 ${pct(it.price / newP)} · 月租 ${M(it.lease)}</small></span>
        <span class="btns"><button class="btn sm primary" data-act="used-buy" data-id="${it.id}" data-mode="buy" ${S.cash < it.price ? 'disabled' : ''}>購買</button><button class="btn sm" data-act="used-buy" data-id="${it.id}" data-mode="lease" ${S.cash < it.lease * 2 ? 'disabled' : ''}>租賃</button></span></footer>
    </article>`;
  }

  // ---------- 訂購新機：數量、起始編號、艙位設定 ----------
  let order = null;
  U.orderDialog = (typeId, mode) => {
    const t = G.TYPES[typeId], pres = G.presetsFor(typeId);
    order = { t: typeId, mode, n: 1, reg: '', preset: pres.length ? pres[pres.length - 1].id : 0 };
    drawOrder();
  };
  U.orderState = () => order;
  U.drawOrder = () => drawOrder();
  function drawOrder() {
    const S = G.S, t = G.TYPES[order.t], pres = G.presetsFor(order.t);
    const unit = order.mode === 'buy' ? t.price * 1e6 : G.leaseMonthly(t) * 2;
    U.modal(`<h2>${order.mode === 'buy' ? '購買' : '租賃'} ${esc(t.model)}</h2>
      <p class="sub">現金 ${M(S.cash, 2)} · 每架${order.mode === 'buy' ? '價格' : '保證金（兩個月租金）'} ${M(unit)}${order.mode === 'lease' ? `，月租 ${M(G.leaseMonthly(t))}` : ''}</p>
      <div class="order-grid">
        <label class="field">數量<span class="qty"><button class="btn sm" data-act="ord-n" data-d="-1" aria-label="減少">−</button><input id="ord-n" type="number" min="1" max="20" value="${order.n}" data-act="ord-n-in"><button class="btn sm" data-act="ord-n" data-d="1" aria-label="增加">＋</button></span></label>
        <label class="field">第一架的飛機編號（選填）<input id="ord-reg" maxlength="10" placeholder="留白 = ${esc(G.defaultReg())}" value="${esc(order.reg)}" autocomplete="off" data-act="ord-reg"></label>
        ${t.freighter ? '' : `<label class="field">艙位設定<select id="ord-preset" data-act="ord-preset">
          <option value="0" ${!order.preset ? 'selected' : ''}>原廠預設配置（交機後可免費調整）</option>
          ${pres.map((p) => `<option value="${p.id}" ${p.id === order.preset ? 'selected' : ''}>${esc(p.name)} · ${G.cabinSeats(p.cabin)} 座</option>`).join('')}
        </select></label>`}
      </div>
      ${U.orderExtra ? U.orderExtra(order) : ''}
      <div id="ord-sum" ${order.queue ? 'hidden' : ''}>${orderSummary()}</div>
      <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="buy">返回機型列表</button><button class="btn primary" data-act="ord-go">${order.queue ? '確認訂購' : `確認${order.mode === 'buy' ? '購買' : '租賃'}`}</button></div>`);
  }
  function orderSummary() {
    const S = G.S, t = G.TYPES[order.t];
    const unit = order.mode === 'buy' ? t.price * 1e6 : G.leaseMonthly(t) * 2, tot = unit * order.n;
    const seq = G.regSequence(order.reg || null, order.n);
    const pr = order.preset && G.presetsFor(order.t).find((p) => p.id === order.preset);
    const cab = pr ? pr.cabin : G.defaultCabin(t);
    const regs = seq.ok ? (seq.regs.length > 4 ? `${seq.regs.slice(0, 3).join('、')} … ${seq.regs[seq.regs.length - 1]}` : seq.regs.join('、')) : '';
    return `<dl class="order-sum">
      <dt>編號</dt><dd>${seq.ok ? esc(regs) : `<span class="neg">${esc(seq.msg)}</span>`}</dd>
      <dt>${t.freighter ? '酬載' : '艙位'}</dt><dd>${t.freighter ? `全貨機 · ${t.cargo} 公噸` : `${G.cabinSeats(cab)} 座 · ${esc(G.cabinSummary(t, cab))}`}</dd>
      <dt>${order.mode === 'buy' ? '總價' : '保證金合計'}</dt><dd><b class="${S.cash < tot ? 'neg' : ''}">${M(tot)}</b>${order.mode === 'lease' ? `，之後每月租金 ${M(G.leaseMonthly(t) * order.n)}` : ''}${S.cash < tot ? '（現金不足）' : ''}</dd>
    </dl>`;
  }
  const refreshOrder = () => { const el = $('#ord-sum'); if (el) el.innerHTML = orderSummary(); };

  // ---------- 艙等配置：改裝費用、艙位設定、套用到同批飛機 ----------
  let batch = null; // 剛買的一批飛機（同機型），設定第一架時可一併套用
  U.cabinSaveLabel = (ac) => (ac.newCabin ? '儲存配置' : '排入改裝');
  const refitText = (ac, cab) => {
    if (ac.newCabin) return `<b>交機前免費調整。</b>這架飛機還沒首航，艙位可以隨意更改；首航後再改就要送廠改裝（花錢、停飛數天）。`;
    const plan = G.refitPlan(ac, cab);
    if (!plan) return `艙位沒有變動。修改後會顯示改裝費用與工期。${ac.refitQueue ? `<br>已排定改裝 ${M(ac.refitQueue.cost)}、${ac.refitQueue.days} 天。` : ''}`;
    return `<b>改裝費用 ${M(plan.cost)} · 工期約 ${plan.days} 天</b>（安裝 ${plan.installed} 個座位）。飛機會在下次停在樞紐時進廠，期間停飛。${ac.mode === 'buy' ? '費用列為資本支出、計入飛機帳面價值。' : '租賃機的改裝費用列為當期費用。'}${ac.refitQueue ? '<br>這會取代原本已排定的改裝。' : ''}`;
  };
  U.cabinExtra = (ac, cab) => {
    const t = G.TYPES[ac.type], pres = G.presetsFor(ac.type);
    const others = batch && batch.type === ac.type ? batch.ids.filter((id) => id !== ac.id && G.S.fleet.some((a) => a.id === id && a.newCabin)) : [];
    return `<div class="refit-box ${ac.newCabin ? 'free' : ''}" id="refit-info">${refitText(ac, cab)}</div>
      <div class="presets">
        <span class="lbl">艙位設定</span>
        ${pres.length ? pres.map((p) => `<span class="preset"><button class="btn sm" data-act="pre-apply" data-id="${p.id}" title="${esc(G.cabinSummary(t, p.cabin))}">${esc(p.name)} · ${G.cabinSeats(p.cabin)} 座</button><button class="x" data-act="pre-del" data-id="${p.id}" aria-label="刪除 ${esc(p.name)}">×</button></span>`).join('') : `<small class="muted">還沒有 ${esc(t.model)} 的艙位設定</small>`}
        <span class="pre-save"><input id="pre-name" maxlength="24" placeholder="設定名稱，例如 長程兩艙" autocomplete="off"><button class="btn sm" data-act="pre-save">存成艙位設定</button></span>
      </div>
      ${others.length ? `<label class="check"><input type="checkbox" id="cab-batch" checked> 同時套用到這次${batch.mode === 'buy' ? '購買' : '租賃'}的其他 ${others.length} 架（${others.map((id) => esc(G.S.fleet.find((a) => a.id === id).reg)).join('、')}）</label>` : ''}`;
  };
  U.cabinExtraUpdate = (ac, cab) => {
    const el = $('#refit-info');
    if (el) el.innerHTML = refitText(ac, cab);
  };
  U.afterCabinSave = (draft) => {
    const cb = $('#cab-batch');
    if (!cb || !cb.checked || !batch) return;
    let n = 0;
    batch.ids.forEach((id) => {
      const a = G.S.fleet.find((x) => x.id === id);
      if (a && id !== draft.acId && a.newCabin && G.setCabin(id, JSON.parse(JSON.stringify(draft.cabin))).ok) n++;
    });
    if (n) U.toast(`已套用到同批 ${n + 1} 架飛機`);
    batch = null;
  };

  // ---------- 動作 ----------
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    const S = G.S;
    switch (a) {
      case 'buy-tab': tab = d.k; U.buyDialog(); return;
      case 'buy-filter': filter = d.k; U.buyDialog(); return;
      case 'order': U.orderDialog(d.t, d.mode); return;
      case 'ord-n': order.n = Math.max(1, Math.min(20, order.n + +d.d)); $('#ord-n').value = order.n; refreshOrder(); return;
      case 'ord-go': {
        if (order.queue && U.orderGo) { U.orderGo(order); return; }
        const r = res(G.acquireMany(order.t, order.mode, order.n, order.reg || null, order.preset || null));
        if (r.ok) {
          const t = G.TYPES[order.t], acs = r.acs;
          U.toast(`${acs.length} 架 ${t.model}（${acs.length > 1 ? acs[0].reg + '–' + acs[acs.length - 1].reg : acs[0].reg}）已加入機隊${r.msg ? '；' + r.msg : ''}`);
          U.tab = 'fleet'; U.render();
          if (!order.preset && !t.freighter) { batch = { type: order.t, mode: order.mode, ids: acs.map((x) => x.id) }; U.cabinDialog(acs[0].id); } else U.closeModal();
        }
        return;
      }
      case 'used-buy': {
        const reg = ($('#used-reg') || {}).value || '';
        const r = res(G.buyUsed(+d.id, d.mode, reg.trim() || null));
        if (r.ok) { U.toast(`二手 ${G.TYPES[r.ac.type].model}（${r.ac.reg}）已加入機隊，機況 ${pct(r.ac.cond)}`); U.tab = 'fleet'; U.render(); U.buyDialog(); }
        return;
      }
      case 'pre-apply': {
        const dr = U.getCabinDraft(), p = (S.cabinPresets || []).find((x) => x.id === +d.id);
        if (dr && p) { dr.cabin = JSON.parse(JSON.stringify(p.cabin)); U.redrawCabin(); }
        return;
      }
      case 'pre-del': { G.deletePreset(+d.id); U.redrawCabin(); return; }
      case 'pre-save': {
        const dr = U.getCabinDraft(), ac = S.fleet.find((x) => x.id === dr.acId), t = G.TYPES[ac.type];
        const u = G.cabinUsage(t, dr.cabin);
        if (u.units > t.units + 0.01 || u.seats > t.maxSeats) { U.toast('配置超出容量，不能存成設定', true); return; }
        const r = G.savePreset(($('#pre-name') || {}).value, ac.type, dr.cabin);
        U.toast(`已存成艙位設定「${r.preset.name}」，之後購買或租賃 ${t.model} 時可直接套用`);
        U.redrawCabin();
        return;
      }
      case 'refit-cancel': res(G.cancelRefit(+d.id), '已取消客艙改裝'); U.render(); return;
    }
    if (act0) act0(a, d, el);
  };
  // 數量與編號輸入框即時更新摘要
  document.addEventListener('input', (e) => {
    const a = e.target.dataset && e.target.dataset.act;
    if (!order) return;
    if (a === 'ord-n-in') { order.n = Math.max(1, Math.min(20, Math.round(+e.target.value || 1))); if (order.queue) U.drawOrder(); else refreshOrder(); }
    if (a === 'ord-reg') { order.reg = e.target.value.trim(); refreshOrder(); }
  });
  document.addEventListener('change', (e) => {
    const a = e.target.dataset && e.target.dataset.act;
    if (a === 'ord-preset' && order) { order.preset = +e.target.value; refreshOrder(); }
    if (a === 'ord-n-in' && order) e.target.value = order.n;
  });
})();
