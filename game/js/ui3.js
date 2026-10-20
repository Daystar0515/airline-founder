// v0.3 介面：人事分頁、服務（餐飲）分頁、創始人與董事會、工會事件。
(function () {
  const G = window.G, U = G.ui;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => (v * 100).toFixed(0) + '%';
  const DAY = 86400000;
  const moraleWord = (m) => (m >= 75 ? '高昂' : m >= 60 ? '穩定' : m >= 45 ? '浮動' : m >= 30 ? '低落' : '瀕臨崩潰');
  const days = (ms) => Math.max(0, Math.ceil(ms / DAY));
  const cname = (c) => G.S.company.cabinNames[c] || G.CLASS_DEFAULT_NAME[c];

  // ---------- 總覽：創始人、董事會、勞資提醒 ----------
  U.overviewV3 = () => {
    const S = G.S, F = G.founder(), B = S.board;
    const pending = G.UNION_GROUPS.filter((g) => S.hr.unions[g].demand);
    const strikes = G.UNION_GROUPS.filter((g) => S.hr.unions[g].strike);
    let html = '';
    if (strikes.length) html += `<div class="callout warn"><b>${strikes.map((g) => G.STAFF[g].name).join('、')}${strikes.some((g) => S.hr.unions[g].strike.active) ? '罷工中' : '即將罷工'}</b><p>罷工期間大部分航班取消，社會評價每天下滑。可以到「人事」與工會和解。</p><button class="btn" data-act="go" data-tab="staff">前往人事</button></div>`;
    else if (pending.length) html += `<div class="callout"><b>${pending.length} 項工會訴求待回應</b><p>${pending.map((g) => `${G.STAFF[g].name}：${esc(S.hr.unions[g].demand.text)}（剩 ${days(S.hr.unions[g].demand.deadline - S.time)} 天）`).join('<br>')}</p><button class="btn" data-act="go" data-tab="staff">前往人事</button></div>`;
    html += `<section class="founder-card"><div><span class="lbl">創始人背景</span><b>${esc(F.name)}</b><em>${esc(F.tag)}</em></div><div><span class="lbl">你的持股</span><b>${S.founder.equity}%</b><em>${S.founder.equity === 100 ? '全資擁有' : S.founder.equity === 0 ? '受託經營，未持股' : '其餘由投資人持有'}</em></div></section>`;
    if (B) {
      const prog = Math.max(0, Math.min(1, B.termProfit / B.target));
      const left = B.probation ? B.probation.end - S.time : B.end - S.time;
      html += `<section class="board"><header><b>董事會協議 · 第 ${B.term} 任期</b><span class="chip ${B.probation ? 'curfew' : ''}">${B.probation ? '留任察看' : esc(G.BOARD.clauses[B.clause].name)}</span></header>
        <div class="meter" role="img" aria-label="累計營業利益達成 ${pct(prog)}"><i style="width:${prog * 100}%"></i></div>
        ${B.pending ? '<button class="btn sm primary" data-act="board-open">董事會等待你回覆</button>' : ''}
        <p class="meta">${B.probation ? `察看期營業利益 ${G.money(B.yearProfit)}／需 ${G.money(B.target / G.BOARD.termYears)}` : `任期累計營業利益 ${G.money(B.termProfit)}／目標 ${G.money(B.target)}`} · 社會評價需 ≥ ${G.BOARD.repMin} · 剩 ${Math.floor(days(left) / 365)} 年 ${days(left) % 365} 天</p></section>`;
    }
    return html;
  };

  // ---------- 人事分頁 ----------
  U.staffTab = () => {
    const S = G.S, req = G.staffRequired(), hr = S.hr;
    const total = G.STAFF_GROUPS.reduce((s, g) => s + hr.groups[g].count, 0);
    const cards = G.STAFF_GROUPS.map((g) => {
      const grp = hr.groups[g], st = G.STAFF[g], u = hr.unions[g], ratio = req[g] ? grp.count / req[g] : 1;
      let union = '';
      if (u) {
        if (!u.formed) union = `<p class="meta">尚未成立工會（${grp.count}／${G.UNION_FORM_AT} 人時成立）</p>`;
        else {
          union = `<p class="meta">工會已成立 · 勞資關係 ${u.relation.toFixed(0)}／100</p>`;
          if (u.strike) {
            const s = u.strike;
            union += `<div class="demand strike"><b>${s.active ? `罷工中，剩 ${days(s.end - S.time)} 天` : `${days(s.start - S.time)} 天後罷工`}</b><p>訴求：${esc(s.demand.text)}。和解需接受訴求${s.demand.kind === 'raise' ? `並再加碼（調薪 ${Math.round(s.demand.pct * 1.2)}%）` : ''}。</p><div class="row-btns"><button class="btn sm primary" data-act="settle" data-g="${g}">和解</button></div></div>`;
          } else if (u.demand) {
            const d = u.demand;
            const p = Math.min(0.99, 0.4 + u.relation / 200 + (typeof G.founder().union === 'object' ? G.fmod('union', g) : G.fmod('union')));
            union += `<div class="demand"><b>工會訴求（剩 ${days(d.deadline - S.time)} 天回應）</b><p>${esc(d.text)}</p><div class="row-btns"><button class="btn sm primary" data-act="demand" data-g="${g}" data-c="accept">接受</button><button class="btn sm" data-act="demand" data-g="${g}" data-c="negotiate">協商（成功率約 ${pct(p)}）</button><button class="btn sm danger" data-act="demand" data-g="${g}" data-c="reject">拒絕</button></div></div>`;
          }
        }
      }
      return `<article class="staff">
        <header><b>${st.name}</b><span>${G.num(grp.count)}／需求 ${G.num(req[g])} 人</span>${ratio < 0.95 ? '<span class="chip curfew">人力不足</span>' : ''}${G.onStrike(g) ? '<span class="chip curfew">罷工中</span>' : ''}</header>
        <div class="meter" role="img" aria-label="人力 ${pct(ratio)}"><i style="width:${Math.min(100, ratio * 100)}%;${ratio < 0.95 ? 'background:var(--neg)' : ''}"></i></div>
        <label class="slider"><span>薪資水準<small id="wl-${g}">${pct(grp.wage)} · ${G.money(G.wageMonthly(g))}/人月</small></span>
          <input type="range" id="wage-${g}" min="0.7" max="1.6" step="0.01" value="${grp.wage}" data-act="wage" data-g="${g}"><output>${pct(grp.wage)}</output></label>
        <p class="meta">士氣 <b class="${grp.morale < 45 ? 'neg' : grp.morale >= 60 ? 'pos' : ''}">${grp.morale.toFixed(0)} ${moraleWord(grp.morale)}</b> · 每月薪資 ${G.money(grp.count * G.wageMonthly(g))}</p>
        ${union}
      </article>`;
    }).join('');
    return `<section class="kpis">
        <div><span>員工總數</span><b>${G.num(total)}</b><em>需求 ${G.num(Object.values(req).reduce((a, b) => a + b, 0))} 人</em></div>
        <div><span>每月人事薪資</span><b>${G.money(G.payrollMonthly())}</b><em>依 ${esc(G.countryZh(G.AP[G.primaryHub()].cc))} 薪資水準</em></div>
      </section>
      <div><span class="lbl">機組排班政策</span>
        <div class="seg" role="group" aria-label="排班政策">${Object.entries(G.SCHEDULES).map(([k, v]) => `<button data-act="sched" data-k="${k}" aria-pressed="${hr.sched === k}">${v.name}</button>`).join('')}</div>
        <p class="meta">緊湊排班讓同樣人數飛更多班（機師與空服員需求 ÷1.15），但工作量上升、士氣下降；寬鬆排班相反。</p></div>
      ${cards}
      <p class="note">人力不足時：機師不足會直接取消航班；空服員不足會降低服務滿意度，低於七成也會取消航班；地勤與維修技師不足會拉長過站與檢查時間。新飛機交機時會先招募八成新增人力，其餘每天陸續到職，招募速度取決於薪資、士氣與社會評價。</p>`;
  };

  // ---------- 服務分頁（餐飲供餐）----------
  U.serviceTab = () => {
    const S = G.S, C = S.catering;
    const recent = S.days.slice(-7).filter((d) => d.sat != null);
    const sat = recent.length ? recent.reduce((s, d) => s + d.sat, 0) / recent.length : null;
    const kitchens = Object.entries(S.hubs).filter(([, h]) => h.upgrades.kitchen > 0).map(([k]) => k);
    const rows = G.CLASSES.map((c) => {
      const ex = (h) => G.mealExpect(c, h);
      const costFor = (h) => G.catering(c, h, '', 1).cost;
      return `<tr><td>${esc(cname(c))}</td><td><select id="meal-${c}" data-act="meal" data-c="${c}" aria-label="${esc(cname(c))}餐點">${G.MEAL_ORDER.map((k) => `<option value="${k}" ${C.meals[c] === k ? 'selected' : ''}>${G.MEALS[k].name}</option>`).join('')}</select></td>
        <td data-l="每人成本（1／3／10 小時）">${[1, 3, 10].map((h) => G.money(costFor(h))).join(' / ')}</td>
        <td data-l="滿意度影響">${[1, 3, 10].map((h) => { const m = G.catering(c, h, '', 1).mult; return `<span class="${m < 0.97 ? 'neg' : m > 1.03 ? 'pos' : ''}">${m >= 1 ? '+' : ''}${Math.round((m - 1) * 100)}%</span>`; }).join(' / ')}</td></tr>`;
    }).join('');
    return `<section class="kpis">
        <div><span>近 7 日乘客滿意度</span><b>${sat != null ? pct(sat) : '—'}</b><em>座椅、餐飲、空服、準點、客艙狀況的綜合</em></div>
        <div><span>自建空廚</span><b>${kitchens.length ? kitchens.join('、') : '無'}</b><em>在「樞紐」興建，餐點成本 ×0.75</em></div>
      </section>
      <h3>各艙等餐點</h3>
      <div class="table-wrap"><table class="meals">
        <thead><tr><th>艙等</th><th>供餐</th><th>每人成本<br><small>1／3／10 小時</small></th><th>滿意度影響<br><small>1／3／10 小時</small></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="note">金額為每位旅客的餐點成本（外站空廚、目前供應商）。10 小時以上的長程航班供應兩餐；1.5 小時以下只算半份。旅客期待隨航程與艙等提高：短程經濟艙付費餐點就夠，長程商務艙沒有熱食會明顯扣分。「付費餐點」在經濟艙約三成旅客購買，每份毛利 $${G.BOB.margin}。</p>
      <h3>空廚供應商（外站）</h3>
      <div class="seg" role="group" aria-label="空廚供應商">${Object.entries(G.SUPPLIERS).map(([k, v]) => `<button data-act="supplier" data-k="${k}" aria-pressed="${C.supplier === k}">${v.name}（成本 ×${v.cost}）</button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="special-meals" data-act="special" ${C.special ? 'checked' : ''}> 提供特殊餐（素食、清真、兒童餐、低敏），餐點成本 +2%，滿意度小幅提升</label>`;
  };

  // ---------- 操作 ----------
  U.act3 = (a, d) => {
    if (a === 'demand') { const r = G.respondDemand(d.g, d.c); if (r && r.msg) U.toast(r.msg, d.c !== 'accept'); U.render(); }
    if (a === 'settle') { G.settleStrike(d.g); U.toast(`已與${G.STAFF[d.g].name}工會和解`); U.render(); }
    if (a === 'sched') { G.setSchedule(d.k); U.render(); }
    if (a === 'supplier') { G.setCatering({ supplier: d.k }); U.render(); }
    if (a === 'renew') { G.boardRenew(d.k); U.closeModal(); U.render(); U.toast('已與董事會簽約'); }
    if (a === 'probation-ok') { G.boardRenew(); U.closeModal(); U.render(); }
    if (a === 'board-open') { const B = G.S.board; if (B && B.pending) U.boardDialog({ kind: 'board', ...B.pending }); if (B && B.dismissed) U.boardDialog({ kind: 'dismissed' }); }
    if (a === 'restart') { G.setSpeed(0); G.S = null; G.wipe(); U.closeModal(); G.showIntro(); }
  };
  U.change3 = (el, a) => {
    if (a === 'wage') { G.setWage(el.dataset.g, +el.value); U.render(); return true; }
    if (a === 'meal') { G.setMeal(el.dataset.c, el.value); U.render(); return true; }
    if (a === 'special') { G.setCatering({ special: el.checked }); U.render(); return true; }
    return false;
  };
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.act === 'wage') {
      const g = el.dataset.g;
      el.nextElementSibling.textContent = pct(+el.value);
      const lab = document.getElementById('wl-' + g);
      if (lab) lab.textContent = `${pct(+el.value)} · ${G.money(G.STAFF[g].wage * G.wageFactor(G.AP[G.primaryHub()].cc) * +el.value * G.fmod('payroll'))}/人月`;
    }
  });

  // ---------- 事件對話框 ----------
  U.boardDialog = (e) => {
    const S = G.S, B = S.board;
    if (!B) return;
    if (e.kind === 'dismissed') {
      U.modal(`<p class="eyebrow danger-ink">董事會決議</p><h2>你被解除經營職務</h2>
        <p>留任察看期間仍未達成董事會要求。${esc(S.company.name)} 將由新的經營團隊接手。</p>
        <dl class="facts"><dt>經營期間</dt><dd>${Math.round((S.time - S.start) / (365 * DAY) * 10) / 10} 年</dd><dt>機隊</dt><dd>${S.fleet.length} 架</dd><dt>持股</dt><dd>${S.founder.equity}%</dd><dt>社會評價</dt><dd>${S.rep.toFixed(0)}</dd></dl>
        <div class="row-btns"><button class="btn primary" data-act="restart">重新創業</button></div>`);
      return;
    }
    if (!e.met) {
      U.modal(`<p class="eyebrow">董事會決議</p><h2>第 ${B.term} 任期未達目標，留任察看一年</h2>
        <p>任期累計營業利益 ${G.money(B.termProfit)}，目標 ${G.money(B.target)}；社會評價 ${S.rep.toFixed(0)}，需 ≥ ${G.BOARD.repMin}。</p>
        <p class="sub">未來一年營業利益需達 ${G.money(B.target / G.BOARD.termYears)}，且社會評價 ≥ ${G.BOARD.repMin}，才能續約（只能標準續約）；否則將被解除職務。</p>
        <div class="row-btns"><button class="btn primary" data-act="probation-ok">接受察看</button></div>`);
      return;
    }
    const only = e.probationPassed;
    U.modal(`<p class="eyebrow">董事會續約</p><h2>${only ? '通過察看，' : ''}簽訂第 ${B.term + 1} 任期協議</h2>
      <p>${only ? '察看期達標，董事會同意以標準條件續約。' : `第 ${B.term} 任期累計營業利益 ${G.money(B.termProfit)}，達成目標 ${G.money(B.target)}。選擇下一任期要談的條款：`}</p>
      <div class="clauses">${Object.entries(G.BOARD.clauses).map(([k, c]) => `<button class="clause" data-act="renew" data-k="${k}" ${only && k !== 'standard' ? 'disabled' : ''}><b>${c.name}</b><span>${c.desc}</span><em>新目標 ${G.money(B.target * c.targetMul)}</em></button>`).join('')}</div>`);
  };
  // 開場：創始人背景卡片
  U.founderCards = (sel) => G.FOUNDER_ORDER.map((k) => {
    const f = G.FOUNDERS[k];
    return `<button type="button" class="fcard" data-founder="${k}" aria-pressed="${k === sel}">
      <span class="fhead"><b>${f.name}</b><em>${f.tag}</em></span>
      <span class="fdesc">${f.desc}</span>
      <span class="fpros">${f.pros.map((x) => `<i class="pro">＋ ${x}</i>`).join('')}${f.cons.map((x) => `<i class="con">－ ${x}</i>`).join('')}</span>
    </button>`;
  }).join('');
})();
