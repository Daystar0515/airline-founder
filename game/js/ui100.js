// v1.0.0-rc2 介面：手機版排版（底部分頁「更多」、鎖住雙擊放大、長清單分頁）、世界局勢（突發事件）卡片與對話框。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 86400000;
  const date = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '/');

  // ---------- 鎖住雙擊放大與頁面縮放 ----------
  // CSS 的 touch-action: manipulation 會關掉雙擊放大；iOS 的兩指縮放頁面另外擋掉（地圖自己處理兩指縮放）
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', (e) => { if (!e.target.closest('input, textarea, #mapwrap')) e.preventDefault(); }, { passive: false });

  // ---------- 長清單分頁 ----------
  const PAGE = 40, lims = {}, sigs = {};
  U.pageLimit = (k, sig) => { if (sigs[k] !== sig) { sigs[k] = sig; lims[k] = PAGE; } return lims[k] || PAGE; };
  U.moreBtn = (k, rest, unit) => (rest > 0 ? `<button class="btn more-btn" data-act="list-more" data-k="${k}">顯示更多（還有 ${rest} ${unit}）</button>` : '');

  // ---------- 手機版底部分頁：常用 5 個 + 更多 ----------
  const SECONDARY = () => [...document.querySelectorAll('#tabs .tab2')];
  function moreState() {
    const btn = $('#tabs .tab-more');
    if (!btn) return;
    const cur = SECONDARY().find((b) => b.dataset.tab === U.tab);
    btn.setAttribute('aria-selected', String(!!cur));
    btn.querySelector('span').textContent = cur ? cur.textContent.trim() : '更多';
    const badge = SECONDARY().reduce((s, b) => s + (+b.dataset.badge || 0), 0);
    if (badge) btn.dataset.badge = badge; else delete btn.dataset.badge;
  }
  function closeMore() {
    const sh = $('#tab-more-sheet'), btn = $('#tabs .tab-more');
    if (sh) sh.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function openMore() {
    const sh = $('#tab-more-sheet'), btn = $('#tabs .tab-more'), bar = $('#tabs');
    if (!sh || !bar) return;
    sh.innerHTML = SECONDARY().map((b) => `<button role="menuitem" data-act="tab" data-tab="${b.dataset.tab}" aria-current="${b.dataset.tab === U.tab}" ${b.dataset.badge ? `data-badge="${b.dataset.badge}"` : ''}>${b.innerHTML}</button>`).join('');
    sh.style.bottom = `${Math.round(window.innerHeight - bar.getBoundingClientRect().top + 8)}px`;
    sh.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('click', (e) => {
    const sh = $('#tab-more-sheet');
    if (sh && !sh.hidden && !e.target.closest('#tab-more-sheet, #tabs .tab-more')) closeMore();
    if (sh && !sh.hidden && e.target.closest('#tab-more-sheet [data-tab]')) setTimeout(closeMore, 0);
  }, true);
  const render0 = U.render;
  U.render = (...a) => { const r = render0(...a); moreState(); return r; };
  const badge0 = U.socialBadge;
  if (badge0) U.socialBadge = (...a) => { badge0(...a); moreState(); };

  // ---------- 世界局勢 ----------
  const ICON = {
    oil: '<path d="M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    virus: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    chart: '<path d="M3 5l6 7 4-3 8 10M3 21h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    star: '<path d="M12 3l2.8 5.9 6.2.8-4.6 4.3 1.2 6.2L12 17.1 6.4 20.2l1.2-6.2L3 9.7l6.2-.8z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.1-1.1 2-2.5 2-1.1 0-2-.4-2.6-1.2M12 6.5v1.5M12 16v1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/>',
    tower: '<path d="M9 21l1-10h4l1 10M8 11h8M10 11V7h4v4M12 7V3"/>',
    volcano: '<path d="M3 20l6-9h6l6 9zM10 11l2-4 2 4M11 4l1-2 1 2"/>',
    storm: '<path d="M7 16a4 4 0 01-.5-8 5.5 5.5 0 0110.7 1.5A3.5 3.5 0 0117 16"/><path d="M12 13l-2 4h3l-2 4"/>',
  };
  const icon = (k) => `<svg class="ti" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ICON.flag}</svg>`;
  const left = (e) => { const S = G.S; return S.time < e.start ? `${Math.max(1, Math.ceil((e.start - S.time) / DAY))} 天後開始` : `還有 ${Math.max(1, Math.ceil((e.end - S.time) / DAY))} 天`; };
  const fxChips = (e) => G.eventEffects(e).map(([t, k]) => `<span class="chip fx-${k}">${esc(t)}</span>`).join('');
  const canAnswer = (e) => { const w = G.S.world; return !(w.answered && w.answered[e.id]) && G.eventOptions(e).length > 0 && G.S.time < e.end; };

  U.worldCard = () => {
    const S = G.S;
    if (!S.world) return '';
    const evs = [...G.activeEvents(), ...G.upcomingEvents()].sort((a, b) => (G.eventHitsMe(b) - G.eventHitsMe(a)) || a.start - b.start);
    const fm = G.marketFuelMul(), mine = G.fuelMul(), h = S.world.hedge;
    const fuelLine = `<p class="world-fuel"><span>航空燃油</span><b class="${fm > 1.05 ? 'neg' : fm < 0.95 ? 'pos' : ''}">$${(G.FUEL_PRICE * fm).toFixed(2)}／公斤</b>${Math.abs(fm - 1) >= 0.01 ? `<em>${fm > 1 ? '+' : '−'}${Math.round(Math.abs(fm - 1) * 100)}%</em>` : ''}${h && S.time < h.until ? `<em class="hedge">避險中：你的價格 $${(G.FUEL_PRICE * mine).toFixed(2)}，到 ${date(h.until)}</em>` : ''}</p>`;
    const rows = evs.map((e) => {
      const hit = G.eventHitsMe(e);
      return `<button class="ev-row ${e.sev}${hit ? ' hit' : ''}" data-act="ev-open" data-id="${e.id}">
        <i class="ev-ic">${icon(e.icon)}</i>
        <span class="ev-main"><b>${esc(e.title)}</b><small>${esc(G.eventScopeText(e))} · ${left(e)}${hit ? ' · 影響你的航網' : ''}</small><span class="ev-fx">${fxChips(e)}</span></span>
        ${hit && canAnswer(e) ? '<em class="ev-act">可應對</em>' : ''}
      </button>`;
    }).join('');
    return `<section class="world">
      <div class="sec-head"><h3>世界局勢</h3><button class="btn link" data-act="help-topic" data-k="events">說明</button></div>
      ${fuelLine}
      ${rows || '<p class="note">目前國際情勢平穩。</p>'}
    </section>`;
  };
  const v3 = U.overviewV3;
  U.overviewV3 = () => (U.worldCard ? U.worldCard() : '') + (v3 ? v3() : '');

  U.eventDialog2 = (id) => {
    const S = G.S, e = S.world.events.find((x) => x.id === id) || null;
    if (!e) { U.toast('這個事件已經結束了'); return; }
    const hit = G.eventHitsMe(e), ans = S.world.answered && S.world.answered[e.id];
    const opts = canAnswer(e) ? G.eventOptions(e) : [];
    U.modal(`<div class="ev-dlg ${e.sev}">
      <header><i class="ev-ic">${icon(e.icon)}</i><div><small>${esc(e.name)} · ${esc(G.eventScopeText(e))}</small><h2>${esc(e.title)}</h2></div></header>
      <p>${esc(e.text)}</p>
      <dl class="ev-meta"><dt>期間</dt><dd>${date(e.start)} – ${date(e.end)}（${left(e)}）</dd><dt>影響</dt><dd class="ev-fx">${fxChips(e)}</dd><dt>你的航網</dt><dd>${hit ? '<b class="neg">受到影響</b>' : '沒有直接影響'}</dd></dl>
      ${opts.length ? `<h3>你要怎麼應對？</h3><div class="replies">${opts.map((o) => `<button class="reply-opt" data-act="ev-answer" data-id="${e.id}" data-k="${o.key}"><b>${esc(o.label)}</b><span>${esc(o.hint)}</span></button>`).join('')}<button class="reply-opt" data-act="ev-answer" data-id="${e.id}" data-k="none"><b>暫不處理</b><span>維持現狀，之後還能從「總覽 › 世界局勢」再打開</span></button></div>` : ans && ans !== 'none' ? `<p class="reply ok">已採取應對措施。</p>` : ''}
      <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="modal-close">關閉</button></div>
    </div>`);
  };

  // 事件發生時的通知
  G.on((w, d) => {
    if (w !== 'event' || !d) return;
    if (d.kind === 'world') {
      const e = d.ev, S = G.S;
      const opts = d.mine || e.sc.k === 'global' ? G.eventOptions(e) : [];
      const modalOpen = !$('#modal').hidden;
      const solo = !G.net;
      if (opts.length && e.type !== 'storm' && solo && !modalOpen && !document.body.classList.contains('intro')) {
        G.setSpeed(0);
        U.eventDialog2(e.id);
      } else if (d.mine || e.sc.k === 'global') U.toast(`${e.start > S.time ? '預告：' : ''}${e.title}`, e.sev === 'bad');
      if (U.tab === 'overview' || U.tab === 'social') U.render();
    }
    if (d.kind === 'world-end' && U.tab === 'overview') U.render();
  });

  // ---------- 成就 ----------
  if (G.ACHIEVEMENTS && !G.ACHIEVEMENTS.some((a) => a[0] === 'hedge')) {
    G.ACHIEVEMENTS.push(
      ['hedge', '避險高手', '面對油價變動，簽下燃油避險合約', (S) => (S.stats && S.stats.hedges) > 0],
      ['crisis', '逆風高飛', '疫情或經濟衰退衝擊你的航網時，單月仍然獲利', (S) => (S.stats && S.stats.crisisProfit) > 0],
    );
  }

  // ---------- 操作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'list-more': lims[d.k] = (lims[d.k] || PAGE) + PAGE; U.render(); return;
      case 'tab-more': { const sh = $('#tab-more-sheet'); if (sh && sh.hidden) openMore(); else closeMore(); return; }
      case 'ev-open': U.eventDialog2(+d.id); return;
      case 'ev-answer': {
        const r = G.eventRespond(+d.id, d.k);
        if (!r.ok) { U.toast(r.msg, true); return; }
        U.closeModal();
        if (d.k !== 'none') U.toast(`已採取措施：${r.label}`);
        U.render(); U.updateTop();
        return;
      }
      case 'help-topic': if (U.helpDialog) { U.helpDialog(d.k); return; } break;
      default: break;
    }
    if (act0) act0(a, d, el);
  };
})();
