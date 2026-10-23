// v1.2.0 介面：劇本模式（標題畫面的劇本清單、遊戲中的目標進度、結算畫面）
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 86400000;
  const ymd = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`; };
  const stars = (n) => `<span class="stars" aria-label="${n} 顆星">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;
  const fmt = (p) => (p.bool ? (p.cur >= p.target ? '已達成' : '未達成') : p.money ? `${G.money(p.cur)}／目標 ${p.target <= 1 ? '大於 0' : G.money(p.target)}` : p.ratio ? `${p.cur.toFixed(2)} 倍／${p.target} 倍` : `${G.num(p.cur)}${p.unit || ''}／${G.num(p.target)}${p.unit || ''}`);
  const prog = (p) => (p.bool ? (p.ok ? 1 : 0) : p.money && p.target <= 1 ? (p.cur > 0 ? 1 : 0) : Math.max(0, Math.min(1, p.target ? p.cur / p.target : 0)));

  // ---------- 標題畫面：劇本清單 ----------
  U.scenDialog = () => {
    const rec = G.scenRecords();
    U.modal(`<h2>劇本模式</h2>
      <p class="sub">用虛構的航空公司，在固定的開局與難度下，限期達成目標。主要目標沒達成就是失敗；兩個加分目標各多一顆星。<b>每個劇本的成績只算一次</b>：第一次結束（成功、失敗或時間到）就記錄下來，之後再玩是練習。劇本可以照常存檔，但不能更改難度。</p>
      <div class="scen-list">${G.SCENARIOS.map((sc) => { const r = rec[sc.id], D = G.DIFF[sc.diff]; return `<article class="scen ${r ? 'done' : ''}">
        <header><b>${esc(sc.name)}</b><span class="chip">${esc(D.name)}</span><span class="chip">${sc.years} 年</span>${r ? `${stars(r.stars)}` : '<span class="chip dev">尚未挑戰</span>'}</header>
        <p>${esc(sc.blurb)}</p>
        <ul class="scen-start">${sc.start.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <ol class="scen-goals">${sc.goals.map((g, i) => `<li>${i ? '<small>加分</small>' : '<small>主要</small>'}${esc(g.text)}${r && r.goals ? (r.goals[i] ? ' <b class="pos">✓</b>' : ' <b class="neg">✗</b>') : ''}</li>`).join('')}</ol>
        ${r ? `<p class="note">成績已記錄：${r.stars ? `${r.stars} 顆星` : '失敗'}（${new Date(r.t).toLocaleDateString('zh-TW')}）。再玩一次是練習，不會改變成績。</p>` : ''}
        <div class="row-btns"><button class="btn ${r ? '' : 'primary'}" data-act="scen-start" data-id="${sc.id}">${r ? '再玩一次（練習）' : '開始挑戰'}</button></div>
      </article>`; }).join('')}</div>`, 'wide');
  };
  function begin(id, slot) {
    if (G.S && G.save) { try { G.save(); } catch (e) { /* 標題畫面沒有進行中的遊戲 */ } }
    if (G.net) G.netLeave();
    U.closeModal();
    const r = G.startScenario(id, slot);
    if (!r.ok) { U.toast(r.msg, true); return; }
    G.enterGame();
    G.save({ force: true });
    U.scenBrief();
  }
  // 沒有空欄位時，借用存檔管理選一個欄位覆蓋
  const sng0 = G.startNewGame;
  G.startNewGame = () => {
    if (G._scenPending) { const id = G._scenPending; G._scenPending = null; begin(id, G._newSlot); return; }
    sng0();
  };
  U.scenBrief = () => {
    const S = G.S, sc = S && S.scen && G.scenById(S.scen.id);
    if (!sc) return;
    G.setSpeed(0);
    U.modal(`<p class="eyebrow">劇本模式${S.scen.practice ? ' · 練習' : ''}</p><h2>${esc(sc.name)}</h2><p>${esc(sc.blurb)}</p>
      <ol class="scen-goals">${sc.goals.map((g, i) => `<li>${i ? '<small>加分</small>' : '<small>主要</small>'}${esc(g.text)}</li>`).join('')}</ol>
      <p class="note">期限：${ymd(S.scen.end)}。主要目標在期限內達成（或結算時成立）才算成功；破產、被撤換或被併購就失敗。${S.scen.practice ? '這個劇本的成績已經記錄過了，這次是練習。' : '第一次結束的結果就是正式成績。'}</p>
      <div class="row-btns"><button class="btn primary" data-act="modal-close">開始</button></div>`);
  };

  // ---------- 遊戲中：目標進度 ----------
  U.scenCard = () => {
    const S = G.S, X = S && S.scen;
    if (!X) return '';
    const sc = G.scenById(X.id), P = G.scenProgress(S);
    if (!sc || !P) return '';
    const left = Math.max(0, Math.ceil((X.end - S.time) / DAY));
    return `<section class="card scen-card"><header><b>劇本：${esc(sc.name)}</b>${X.practice ? '<span class="chip">練習</span>' : ''}${X.done ? (X.result.fail ? '<span class="chip warn">失敗</span>' : stars(X.result.stars)) : `<span class="chip">剩 ${left >= 365 ? (left / 365).toFixed(1) + ' 年' : left + ' 天'}</span>`}</header>
      ${P.map((p, i) => `<div class="scen-goal ${p.ok ? 'ok' : ''}"><span>${i ? '加分' : '主要'}</span><b>${esc(p.text)}</b><small>${p.ok ? (p.latched ? '已達成' : '目前達成') : fmt(p)}</small><i style="--p:${(prog(p) * 100).toFixed(0)}%"></i></div>`).join('')}
      ${X.done ? '<p class="note">劇本已結算，可以繼續自由經營。</p>' : `<div class="row-btns"><button class="btn sm" data-act="scen-brief">劇本說明</button>${P[0].ok && !X.done ? '<button class="btn sm" data-act="scen-settle">現在結算</button>' : ''}</div>`}</section>`;
  };
  const oe0 = U.overviewExtra;
  U.overviewExtra = () => U.scenCard() + (oe0 ? oe0() : '');

  // ---------- 結算 ----------
  G.on((w, d) => {
    if (w !== 'event' || !d || !G.S) return;
    if (d.kind === 'scen-goal') U.toast(d.text);
    if (d.kind === 'scen-end') {
      const S = G.S, X = S.scen, sc = G.scenById(X.id), P = G.scenProgress(S);
      if (S.over) return; // 破產、被撤換、被併購：遊戲結束畫面會顯示
      G.setSpeed(0);
      U.modal(`<p class="eyebrow">劇本結算${X.practice ? ' · 練習' : ''}</p><h2>${esc(sc.name)}：${X.result.fail ? '失敗' : '完成'}</h2>
        <p class="big-stars">${stars(X.result.stars)}</p>
        <ol class="scen-goals">${P.map((p, i) => `<li>${i ? '<small>加分</small>' : '<small>主要</small>'}${esc(p.text)} ${p.ok ? '<b class="pos">✓</b>' : `<b class="neg">✗</b> <small>${fmt(p)}</small>`}</li>`).join('')}</ol>
        <p class="note">${X.practice ? '這是練習，正式成績維持第一次的結果。' : '成績已記錄，之後再玩這個劇本是練習。'}可以繼續自由經營這間公司。</p>
        <div class="row-btns"><button class="btn primary" data-act="modal-close">繼續經營</button><button class="btn" data-act="m-title">回到標題畫面</button></div>`);
    }
  });
  // 遊戲結束畫面加上劇本結果
  const go0 = U.gameOver;
  U.gameOver = (reason) => {
    go0(reason);
    const S = G.S, X = S && S.scen;
    if (!X) return;
    const sc = G.scenById(X.id), h = document.querySelector('#modal-box h2');
    if (sc && h) h.insertAdjacentHTML('afterend', `<div class="callout warn"><b>劇本「${esc(sc.name)}」失敗</b><p>${X.practice ? '這是練習，正式成績不變。' : '成績已記錄為失敗。'}</p></div>`);
  };

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 't-scen': U.scenDialog(); return;
      case 'scen-start': {
        const n = G.freeSlot();
        if (n) begin(d.id, n);
        else { G._scenPending = d.id; U.slotsDialog(true); }
        return;
      }
      case 'scen-brief': U.scenBrief(); return;
      case 'scen-settle': if (!el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = '再按一次：結算（之後無法再拿星）'; return; } G.scenFinish('early'); U.render(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
