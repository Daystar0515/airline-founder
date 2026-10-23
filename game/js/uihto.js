// v1.2.0 介面：收購提案、惡意併購的經營權保衛戰
(function () {
  const G = window.G, U = G.ui;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const pct = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + '%';
  const DAY = 86400000;
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };

  const bar = (cp) => `<div class="hto-bar" role="img" aria-label="股權結構">
      <i class="me" style="width:${cp.pMe * 100}%"></i><i class="fr" style="width:${cp.pFr * 100}%"></i><i class="other" style="width:${cp.pOther * 100}%"></i><i class="raid" style="width:${cp.pRaid * 100}%"></i><b style="left:50%"></b></div>
    <p class="hto-legend"><span class="me">你 ${pct(cp.pMe)}</span><span class="fr">友好股東 ${pct(cp.pFr)}</span><span class="other">其他股東 ${pct(cp.pOther)}</span>${cp.raid ? `<span class="raid">收購方 ${pct(cp.pRaid)}</span>` : ''}</p>`;
  U.htoCard = (full) => {
    const S = G.S, H = G.htoState(), st = S.fin.stock;
    if (H.offer) {
      const O = H.offer;
      return `<div class="callout warn hto"><b>${esc(O.name)}提出收購提案</b>
        <p>以 ${M(O.value)}（溢價 ${Math.round((O.prem - 1) * 100)}%）買下整間公司；你依持股 ${S.founder.equity}% 可以分得約 ${M((S.founder.equity / 100) * O.value)}。${O.foreign ? '對方是外國航空集團，還要通過主管機關的外資審查（不一定會過）。' : ''}</p>
        <p>接受就是把公司賣掉，<b>遊戲結束</b>；拒絕的話一年內不會再收到提案。期限：${Math.max(1, Math.ceil((O.until - S.time) / DAY))} 天。</p>
        <div class="row-btns"><button class="btn sm" data-act="hto-decline">拒絕</button><button class="btn sm danger" data-act="hto-accept">接受，出售公司</button></div></div>`;
    }
    if (!st.listed) return '';
    const R = H.raid, cp = G.htoCap();
    if (R && (R.disclosed || R.stage === 'tender')) {
      const f = G.htoForecast();
      const tender = R.stage === 'tender';
      return `<div class="callout warn hto"><b>經營權保衛戰：${esc(R.name)}${tender ? '公開收購中' : '持續買進你的股票'}</b>
        ${bar(cp)}
        ${tender ? `<p>收購價每股 $${R.tender.price.toFixed(2)}（目前股價 $${st.price.toFixed(2)}），${Math.max(0, Math.ceil((R.tender.until - S.time) / DAY))} 天後截止。依目前情況，預估其他股東約 ${pct(f.q, 0)} 會應賣，收購方將取得約 <b>${pct(f.pAfter)}</b>：<b class="${f.win ? 'neg' : 'pos'}">${f.win ? '過半，你會失去經營權' : '未過半，收購失敗'}</b>。</p>` : `<p>對方已申報持股 ${pct(cp.pRaid)}。持股到一成左右，很可能發動公開收購。</p>`}
        <p>收購方加上應賣的股份超過 50%，你就失去經營權（遊戲結束）。你的持股與友好股東不會應賣。</p>
        <div class="hto-acts">
          <button class="btn sm" data-act="go" data-tab="me">個人增持自家股票</button>
          <button class="btn sm" data-act="hto-knight" ${R.knight ? 'disabled' : ''}>請盟友當白騎士</button>
          <button class="btn sm" data-act="hto-ir" ${(R.ir || 0) >= G.HTO.ir.max ? 'disabled' : ''}>股東溝通（${M(G.HTO.ir.cost)}）</button>
          <button class="btn sm danger" data-act="hto-pill" ${S.time < H.pillUntil ? 'disabled' : ''}>${S.time < H.pillUntil ? '毒丸條款生效中' : `毒丸條款（${M(G.HTO.pill.fee)}）`}</button>
        </div>
        <p class="note">個人增持：用個人帳戶在市場買進，減少可應賣的股份。白騎士：請上市的盟友買進 8–15% 支持你（不一定答應）。股東溝通：降低股東應賣的意願（最多兩次）。毒丸：一年內收購方多半會放棄，但股價下跌、股東會支持度下降。公司買回庫藏股也會減少流通股。</p></div>`;
    }
    if (!full) return '';
    const risk = G.htoRisk();
    const lv = S.founder.equity >= 50 ? null : risk > 0.6 ? '高' : risk > 0.3 ? '中' : risk > 0 ? '低' : '很低';
    return `<div class="callout hto"><b>經營權</b>${bar(cp)}
      <p>${S.founder.equity >= 50 ? '你個人持股過半，不會被惡意併購。' : `你個人持股 ${S.founder.equity}%，未過半。被惡意併購的風險：<b>${lv}</b>${risk ? '（股價低於合理價值、你的持股偏低、連續虧損，國內上市航空集團就可能出手）' : '（國內沒有規模夠大、能買下你的上市航空集團，外國集團受外資持股上限限制）'}。`}</p>
      ${S.founder.equity < 50 && S.time >= H.pillUntil && S.time >= H.pillCool ? `<div class="row-btns"><button class="btn sm" data-act="hto-pill">預先通過毒丸條款（${M(G.HTO.pill.fee)}）</button></div>` : S.time < H.pillUntil ? `<p class="note">毒丸條款生效到 ${new Date(H.pillUntil).toISOString().slice(0, 10)}。</p>` : ''}</div>`;
  };
  // 財務頁頂端與「公司股票」分頁、個人頁、總覽
  const ft0 = U.financeTab;
  U.financeTab = () => { const c = U.htoCard(U.finTab === 'stock'); const h = ft0(); return c ? (U.finTab === 'stock' ? h.replace('</section>', '</section>' + c) : c + h) : h; };
  const me0 = U.meTab;
  if (me0) U.meTab = () => U.htoCard(false) + me0();
  const oe0 = U.overviewExtra;
  U.overviewExtra = () => (oe0 ? oe0() : '') + U.htoCard(false);

  // 重要事件跳出視窗並暫停
  G.on((w, d) => {
    if (w !== 'event' || !d || d.kind !== 'hto' || !d.modal || !G.S) return;
    if (G.net && G.net.code) return; // 連線時不暫停整個房間，只顯示通知
    G.setSpeed(0);
    U.modal(`<p class="eyebrow ${d.warn ? 'danger-ink' : ''}">經營權</p><h2>${d.warn ? '注意' : '消息'}</h2><p>${esc(d.text)}</p>${U.htoCard(false)}<div class="row-btns"><button class="btn primary" data-act="modal-close">知道了</button></div>`);
  });

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'hto-accept':
        if (!el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = '再按一次：出售公司（遊戲結束）'; return; }
        U.closeModal(); res(G.htoAcceptOffer()); U.render(); return;
      case 'hto-decline': res(G.htoDeclineOffer(), '已拒絕收購提案'); U.closeModal(); U.render(); return;
      case 'hto-pill':
        if (!el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = '再按一次：通過毒丸條款'; return; }
        res(G.htoPill(), '毒丸條款已通過'); U.render(); return;
      case 'hto-ir': res(G.htoIR(), '已舉辦投資人說明會'); U.render(); return;
      case 'hto-knight': { const r = res(G.htoKnight()); if (r && r.ok && !r.fail) U.toast('白騎士已進場'); U.render(); return; }
    }
    if (act0) act0(a, d, el);
  };
})();
