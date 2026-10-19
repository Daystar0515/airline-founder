// v0.9.0 介面：「聯盟」分頁（三大真實聯盟、自創聯盟、邀請 AI／朋友、審核 AI 的入盟申請）。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const pct = (v) => Math.round(v * 100) + '%';
  const DAY = 86400000;
  const C = () => G.CARRIERS;
  const badge = (code, color) => `<span class="cbadge" style="--c:${color || G.carrierColor(code)}">${esc(code)}</span>`;
  const checks = (items) => `<ul class="checks">${items.map(([n, ok, v]) => `<li class="${ok ? 'pos' : 'neg'}"><span>${ok ? '✓' : '✗'}</span>${esc(n)}<em>${esc(v)}</em></li>`).join('')}</ul>`;
  const DISC = '星空聯盟、寰宇一家、天合聯盟與各航空公司名稱僅用於遊戲模擬，成員名單依 2026 年 10 月維基百科。本作為非官方粉絲作品，與各聯盟及航空公司無關、未經授權；入盟條件、費用與效益皆為遊戲設定。';

  // 其他頁面用：航空公司的聯盟標籤
  U.allyChip = (code) => {
    const id = G.ALLY_OF[code];
    if (id) { const a = G.ALLIANCES[id]; return `<span class="chip ally" style="--c:${a.color}" title="${esc(a.name)}">${esc(a.zh)}</span>`; }
    const al = G.allyState();
    if (al.kind && al.kind !== 'real' && al.members.some((m) => m.code === code)) return `<span class="chip ally" style="--c:${esc(al.color)}">${esc(al.name)}</span>`;
    return '';
  };
  const rc0 = U.routeRivalChip;
  U.routeRivalChip = (r) => {
    let s = rc0 ? rc0(r) : '';
    if (G.allyActive()) {
      const P = G.allyPartners(), mates = G.rivalsOn(r.a, r.b).filter((x) => G.isPartner(x.code)).length;
      if (P.hubs.has(r.b)) s += '<span class="chip ally" style="--c:' + esc(G.allyColor()) + '" title="飛往盟友樞紐：盟友接轉機旅客、貴賓室共享">盟友樞紐</span>';
      if (mates) s += `<span class="chip" title="同航線的盟友改為合作">${mates} 家盟友</span>`;
    }
    return s;
  };

  // ---------- 分頁 ----------
  let aiQ = '', open = null;
  function effects() {
    if (!G.allyActive()) return '';
    const P = G.allyPartners(), S = G.S, X = G.ALLY, st = P.strength;
    const toHub = S.routes.filter((r) => P.hubs.has(r.b)).length, fromHub = S.routes.filter((r) => P.hubs.has(r.a)).length;
    const shared = S.routes.filter((r) => G.rivalsOn(r.a, r.b).some((x) => G.isPartner(x.code))).length;
    return `<h4>目前的聯盟效益</h4>
      <dl class="facts">
        <dt>盟友</dt><dd>${P.ai.size} 家航空公司${P.human.size ? `、${P.human.size} 位玩家` : ''} · 聯盟航網約 ${G.num(P.dests)} 個航點</dd>
        <dt>效益強度</dt><dd><b>${pct(st)}</b>${st < 1 ? '<small class="src">自創聯盟的航網越大，效益越接近三大聯盟（航點數 ÷ 900）</small>' : ''}</dd>
        <dt>轉機銜接</dt><dd>${toHub} 條航線飛往盟友樞紐：攬客力 +${(X.feedDest * st * 100).toFixed(1)}%${fromHub ? `；${fromHub} 條從盟友樞紐出發 +${(X.feedHub * st * 100).toFixed(1)}%` : ''}</dd>
        <dt>常客互惠</dt><dd>所有航線商務客 +${((X.ffpB + (S.loyalty ? X.ffpLoy : 0)) * st * 100).toFixed(1)}%${S.loyalty ? '（含會員方案加成）' : '<small class="src">推出會員方案後再多 +' + (X.ffpLoy * st * 100).toFixed(1) + '%</small>'}</dd>
        <dt>貴賓室共享</dt><dd>飛往盟友樞紐的商務、頭等艙 +${(X.lounge * st * 100).toFixed(1)}%</dd>
        <dt>代碼共享</dt><dd>${shared} 條航線上的盟友改為合作：稀釋只剩原本的 ${pct(X.partnerMul)}，也不會對你打價格戰</dd>
        <dt>年費</dt><dd>${M(G.allyDues())}／年（每天攤提，記在「聯盟會費」）</dd>
      </dl>`;
  }
  function current() {
    const S = G.S, al = G.allyState();
    const inbox = al.inbox.length ? `<div class="callout"><b>聯盟邀請</b>${al.inbox.map((x) => `<p>${esc(x.fromName)}（${esc(x.from)}）邀請你加入「${esc(x.ally.name)}」</p><div class="row-btns"><button class="btn sm primary" data-act="ally-inv-yes" data-from="${esc(x.from)}">接受</button><button class="btn sm" data-act="ally-inv-no" data-from="${esc(x.from)}">婉拒</button></div>`).join('')}</div>` : '';
    if (!al.kind) return inbox + `<section class="ally-cur none"><b>尚未加入航空聯盟</b><p class="note">可以申請加入下方的三大聯盟，或自己成立聯盟、邀請 AI 航空公司或連線的朋友加入。</p></section>`;
    if (al.kind === 'real') {
      const a = G.ALLIANCES[al.id];
      const stTxt = al.status === 'applied' ? `入盟審查中，約 ${Math.max(0, Math.ceil((al.at - S.time) / DAY))} 天後公布結果` : al.status === 'joining' ? `已通過審查，系統整合中，約 ${Math.max(0, Math.ceil((al.at - S.time) / DAY))} 天後正式加入` : `正式成員（${new Date(al.since).toISOString().slice(0, 10)} 起）`;
      return inbox + `<section class="ally-cur" style="--c:${a.color}"><header><span class="ally-dot"></span><b>${esc(a.zh)}</b><small>${esc(a.name)}</small><span class="spacer"></span><button class="btn sm danger" data-act="ally-leave">${al.status === 'applied' ? '撤回申請' : '退出聯盟'}</button></header>
        <p>${stTxt}</p>${al.warn ? `<p class="neg">聯盟警告 ${al.warn}／3：社會評價過低</p>` : ''}${effects()}</section>`;
    }
    const owner = al.kind === 'own';
    const N = G.net, hp = N ? Object.entries(N.players).filter(([id, p]) => id !== N.myId && p && p.code && !al.members.some((m) => m.code === p.code)) : [];
    return inbox + `<section class="ally-cur" style="--c:${esc(al.color)}"><header><span class="ally-dot"></span><b>${esc(al.name)}</b><small>${owner ? '你創立的聯盟' : `由 ${esc(al.owner)} 創立`}</small><span class="spacer"></span><button class="btn sm danger" data-act="ally-leave">${owner ? '解散聯盟' : '退出聯盟'}</button></header>
      <div class="table-wrap"><table class="rv-table"><thead><tr><th>成員</th><th>類型</th><th>加入</th>${owner ? '<th></th>' : ''}</tr></thead><tbody>
        ${al.members.map((m) => `<tr><td>${badge(m.code)} ${esc(m.name)}${m.code === S.company.code ? ' <small class="muted">（你）</small>' : ''}</td><td>${m.kind === 'ai' ? 'AI 航空公司' : '玩家'}${m.founder ? '・創辦人' : ''}</td><td>${m.since ? new Date(m.since).toISOString().slice(0, 7) : '—'}</td>${owner ? `<td>${m.founder ? '' : `<button class="btn sm" data-act="ally-kick" data-code="${esc(m.code)}">移出</button>`}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      ${owner && al.apps.length ? `<h4>入盟申請（${al.apps.length}）</h4>${al.apps.map((x) => `<div class="ally-app">${badge(x.code)} <b>${esc(G.carrierName(C()[x.code]))}</b><small>${esc((x.notes || []).join('、'))} · ${Math.max(0, 30 - Math.floor((S.time - x.at) / DAY))} 天內回覆</small><div class="row-btns"><button class="btn sm primary" data-act="ally-app-yes" data-code="${x.code}">同意加入</button><button class="btn sm" data-act="ally-app-no" data-code="${x.code}">婉拒</button></div></div>`).join('')}` : ''}
      ${owner && al.invites.length ? `<h4>等待回覆的邀請</h4><p class="note">${al.invites.map((x) => `${esc(x.kind === 'ai' ? G.carrierName(C()[x.code]) : x.code)}（${Math.max(0, Math.ceil((x.reply - S.time) / DAY))} 天內）`).join('、')}</p>` : ''}
      ${owner ? `<h4>邀請成員</h4>
        ${hp.length ? `<p class="note">連線中的朋友：</p><div class="row-btns">${hp.map(([, p]) => `<button class="btn sm" data-act="ally-inv-human" data-code="${esc(p.code)}" ${p.ally ? 'disabled title="對方已在其他聯盟"' : ''}>邀請 ${esc(p.name)}${p.ally ? `（已在${esc(p.ally.name)}）` : ''}</button>`).join('')}</div>` : ''}
        <label class="search"><span>邀請 AI 航空公司</span><input id="ally-q" type="search" placeholder="代碼或名稱，例如 JX、星宇、Emirates" value="${esc(aiQ)}" autocomplete="off"></label>
        <div id="ally-cands">${cands()}</div>
        <p class="note">三大聯盟的成員不會考慮；評價越高、聯盟越大、雙方航網越能銜接（又不重疊），越容易答應。持有對方 3% 以上股權也有幫助。對方約 1–3 週內回覆。</p>` : ''}
      ${effects()}</section>`;
  }
  function cands() {
    const S = G.S, al = G.allyState();
    let list;
    if (aiQ) {
      const q = aiQ.toLowerCase();
      list = Object.values(C()).filter((c) => c.code !== S.company.code && (c.code.toLowerCase() === q || c.name.toLowerCase().includes(q) || (c.zh && c.zh.includes(aiQ)))).slice(0, 12).map((c) => c.code);
    } else {
      const seen = new Set();
      list = [];
      Object.keys(S.hubs).forEach((h) => (G.carriersAt(h) || []).forEach(([code]) => { if (!seen.has(code) && G.allyInviteEval(code).p > 0 && !al.members.some((m) => m.code === code)) { seen.add(code); list.push(code); } }));
      list = list.slice(0, 8);
    }
    if (!list.length) return `<p class="empty">${aiQ ? '找不到符合的航空公司。' : '你的樞紐沒有尚未加入聯盟的航空公司，請用搜尋。'}</p>`;
    return list.map((code) => {
      const c = C()[code], e = G.allyInviteEval(code), sent = al.invites.some((x) => x.code === code), mem = al.members.some((m) => m.code === code);
      return `<div class="ally-cand">${badge(code)}<span><b>${esc(G.carrierName(c))}</b><small>${esc(G.countryZh(c.cc))} · ${c.lcc ? '低成本' : '傳統'} · 約 ${G.num(G.carrierFleetEst(code))} 架${e.notes && e.notes.length ? ' · ' + esc(e.notes.join('、')) : ''}</small></span>
        ${e.p > 0 ? `<em class="${e.p >= 0.5 ? 'pos' : e.p < 0.25 ? 'neg' : ''}">同意機率約 ${pct(e.p)}</em><button class="btn sm" data-act="ally-inv-ai" data-code="${code}" ${sent || mem ? 'disabled' : ''}>${mem ? '已是成員' : sent ? '已邀請' : '邀請'}</button>` : `<em class="neg">${esc(e.why)}</em>`}</div>`;
    }).join('');
  }
  function realCards() {
    const S = G.S, al = G.allyState(), reqs = G.allyReqs(), okReq = reqs.every((x) => x[1]);
    return Object.values(G.ALLIANCES).map((a) => {
      const fit = G.allyFit(a.id), isOpen = open === a.id, mine = al.kind === 'real' && al.id === a.id;
      const cool = al.cool[a.id] && S.time < al.cool[a.id];
      return `<article class="ally-card ${isOpen ? 'open' : ''}" style="--c:${a.color}">
        <button class="ally-head" data-act="ally-open" data-id="${a.id}" aria-expanded="${isOpen}"><span class="ally-dot"></span><span class="ally-name"><b>${esc(a.zh)}</b><small>${esc(a.name)} · ${a.founded} 年成立 · ${a.members.length} 家成員</small></span>${mine ? '<span class="chip dev">你的聯盟</span>' : `<span class="chip ${fit.likely ? 'fit-l' : 'warn'}">${fit.likely ? '契合' : '不易通過'}</span>`}</button>
        ${isOpen ? `<div class="ally-body">
          <div class="ally-members">${a.members.map((c) => `<button class="chip linkish" data-act="rv-open" data-code="${c}">${badge(c, a.color)} ${esc(G.carrierName(C()[c]))}</button>`).join('')}</div>
          <p class="note">${esc(a.note)} 會員等級：${esc(a.tiers)}。</p>
          <h4>真實聯盟提供的合作</h4><ul class="plain">${G.BENEFITS_REAL.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          ${mine ? '' : `<h4>入盟條件</h4>${checks(reqs)}
          <h4>網路契合度 ${fit.score.toFixed(0)}／100（50 以上才會通過）</h4>
          ${fit.notes.length ? `<ul class="plain">${fit.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="note">沒有特別的加分或扣分。</p>'}
          <dl class="facts"><dt>申請費</dt><dd>${M(G.ALLY.applyFee)}（不退還），審查約 ${G.ALLY.review} 天</dd><dt>入盟費</dt><dd>${M(G.allyJoinFee())}（通過後支付），整合約 ${G.ALLY.integrate} 天</dd><dt>年費</dt><dd>${M(G.ALLY.duesBase + G.ALLY.duesPer * S.fleet.length)}（依機隊規模）</dd><dt>退出</dt><dd>違約金為 ${G.ALLY.exitMonths} 個月年費，社會評價 −2</dd></dl>
          <div class="row-btns"><button class="btn primary" data-act="ally-apply" data-id="${a.id}" ${okReq && !al.kind && !cool ? '' : 'disabled'}>${cool ? `被婉拒，${Math.ceil((al.cool[a.id] - S.time) / DAY)} 天後可再申請` : al.kind ? '請先退出目前的聯盟' : `申請加入${esc(a.zh)}`}</button></div>`}
        </div>` : ''}
      </article>`;
    }).join('');
  }
  function ownCard() {
    const al = G.allyState();
    if (al.kind) return '';
    const reqs = G.allyOwnReqs(), ok = reqs.every((x) => x[1]);
    return `<h3>自創聯盟</h3>
      <p class="note">成立自己的聯盟，邀請還沒加入三大聯盟的航空公司（例如星宇、阿聯酋、低成本航空）或連線中的朋友。成立費 ${M(G.ALLY.ownFound)}，年度營運費 ${M(G.ALLY.ownBase)} ＋每個成員 ${M(G.ALLY.ownPer)}；最多 ${G.ALLY.maxOwn} 個成員。之後 AI 航空公司也可能主動申請加入。</p>
      ${checks(reqs)}
      <div class="ally-found"><label class="field">聯盟名稱<input id="ally-name" maxlength="24" placeholder="例如 Formosa Alliance" autocomplete="off"></label>
        <label class="field color">代表色<input id="ally-color" type="color" value="${esc(G.S.company.color)}"></label>
        <button class="btn primary" data-act="ally-found" ${ok ? '' : 'disabled'}>成立聯盟</button></div>`;
  }
  U.allianceTab = () => {
    const al = G.allyState();
    return `<p class="note disclaimer">${DISC}</p>
      <h3>你的聯盟</h3>${current()}
      <h3>三大航空聯盟</h3>${realCards()}
      ${ownCard()}
      ${al.news.length ? `<h3>聯盟動態</h3>${al.news.slice(0, 8).map((n) => `<p class="rv-line"><small class="muted">${new Date(n.t).toISOString().slice(0, 10)}</small> ${esc(n.text)}</p>`).join('')}` : ''}`;
  };
  document.addEventListener('input', (e) => { if (e.target.id === 'ally-q') { aiQ = e.target.value.trim(); const el = $('#ally-cands'); if (el) el.innerHTML = cands(); } });

  const res = (r, ok) => { if (!r || r.ok === false) U.toast((r && r.msg) || '無法執行', true); else if (ok) U.toast(ok); U.render(); return r; };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'ally-open': open = open === d.id ? null : d.id; U.render(); return;
      case 'ally-apply': res(G.allyApply(d.id), '已送出入盟申請'); return;
      case 'ally-leave': if (el.dataset.confirm) res(G.allyLeave(), '已處理'); else { el.dataset.confirm = '1'; el.textContent = '再按一次確認'; } return;
      case 'ally-found': res(G.allyFound(($('#ally-name') || {}).value, ($('#ally-color') || {}).value), '聯盟已成立'); return;
      case 'ally-inv-ai': res(G.allyInviteAI(d.code), '已送出邀請，對方約 1–3 週內回覆'); return;
      case 'ally-inv-human': res(G.allyInviteHuman(d.code), '已送出邀請'); return;
      case 'ally-kick': res(G.allyKick(d.code), '已移出'); return;
      case 'ally-app-yes': res(G.allyAnswerApp(d.code, true), '已同意加入'); return;
      case 'ally-app-no': res(G.allyAnswerApp(d.code, false), '已婉拒'); return;
      case 'ally-inv-yes': res(G.allyAnswerInvite(d.from, true), '已加入聯盟'); return;
      case 'ally-inv-no': res(G.allyAnswerInvite(d.from, false), '已婉拒'); return;
    }
    if (act0) act0(a, d, el);
  };
})();
