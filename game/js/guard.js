// v1.0 錯誤保護：程式出錯時暫停遊戲、不再自動存檔（避免把壞掉的資料蓋掉正常存檔），並提供匯出存檔與回報。
(function () {
  const G = window.G, U = G.ui;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const seen = new Set();
  let lastText = '';
  G.errors = [];
  G.reportError = (e, where) => {
    const msg = (e && (e.message || e.reason || String(e))) || '未知錯誤';
    const stack = (e && e.stack ? String(e.stack) : '').split('\n').slice(0, 6).join('\n');
    const key = msg + (stack.split('\n')[1] || '');
    console.error(e);
    G.errors.push({ t: Date.now(), msg, where });
    if (where === 'sim') { G.halted = true; if (G.speed) G.speed = 0; }
    if (seen.has(key) && where !== 'sim') return;
    seen.add(key);
    lastText = `航空公司創始人 v${G.VERSION}\n${navigator.userAgent}\n遊戲日期：${G.S ? new Date(G.S.time).toISOString().slice(0, 10) : '—'}\n錯誤：${msg}\n${stack}`;
    if (!U || !U.modal) return;
    U.modal(`<p class="eyebrow danger-ink">發生程式錯誤</p><h2>${where === 'sim' ? '遊戲已暫停' : '畫面出了點問題'}</h2>
      <p>${where === 'sim' ? '模擬時發生錯誤。為了保護存檔，遊戲已暫停，也暫停自動存檔，上一次正常的存檔仍保留。' : '介面顯示時發生錯誤，遊戲資料應該沒有受影響。'}建議先匯出存檔，再把下面的錯誤訊息回報給作者。</p>
      <pre class="errbox">${esc(lastText)}</pre>
      <div class="row-btns">
        <button class="btn primary" data-act="err-export">匯出存檔</button>
        <button class="btn" data-act="err-copy">複製錯誤訊息</button>
        ${G.REPORT_URL ? `<a class="btn" href="${esc(G.REPORT_URL)}" target="_blank" rel="noopener">回報問題</a>` : ''}
        ${where === 'sim' ? '<button class="btn" data-act="err-reload">讀取最後一次存檔</button><button class="btn" data-act="err-resume">仍要繼續</button>' : '<button class="btn" data-act="modal-close">繼續</button>'}
      </div>`);
  };
  window.addEventListener('error', (e) => { if (e && e.error) G.reportError(e.error, 'ui'); });
  window.addEventListener('unhandledrejection', (e) => G.reportError(e.reason || e, 'ui'));
  // 事件通知處理完後清掉事件種類（給 uihelp.js 的通知過濾用）
  G.on(() => { if (G.clearEvKind) G.clearEvKind(); });
  // 模擬出錯就停下來
  const tick0 = G.tick;
  G.tick = (dt) => { if (G.halted) return; try { tick0(dt); } catch (e) { G.reportError(e, 'sim'); } };

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'err-export': G.downloadSave().then((r) => U.toast(r.ok ? (r.shared ? '已開啟分享選單' : `已匯出 ${r.name}`) : r.msg, !r.ok)); return;
      case 'err-copy': (navigator.clipboard ? navigator.clipboard.writeText(lastText) : Promise.reject()).then(() => U.toast('已複製錯誤訊息'), () => U.toast('無法複製，請手動選取文字', true)); return;
      case 'err-reload': { const r = G.loadSlot(G.activeSlot() || 1); if (r.ok) { U.closeModal(); G.enterGame && G.enterGame(); U.toast('已讀取最後一次存檔'); } else U.toast(r.msg, true); return; }
      case 'err-resume': G.halted = false; U.closeModal(); U.toast('已恢復；如果錯誤再次出現，建議讀取最後一次存檔', true); return;
    }
    if (act0) act0(a, d, el);
  };
})();
