// v0.8.0 多人連線介面：總覽頁的房間卡片、建立／加入房間、二手市場購買改由房主確認。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const DAY = 86400000;
  let busy = false, kind = 'peer', testing = false, testMsg = null;
  const kindPick = () => `<div class="seg" role="group" aria-label="連線方式">
      <button data-act="net-kind" data-k="peer" aria-pressed="${kind === 'peer'}">網路（朋友在不同地方）</button>
      <button data-act="net-kind" data-k="local" aria-pressed="${kind === 'local'}">本機測試（同一台電腦的分頁）</button></div>`;

  U.overviewExtra = () => {
    const N = G.net;
    if (!N) {
      return `<section class="netcard">
        <header><b>多人連線</b><small>最多 4 人在同一個世界競爭</small></header>
        <p class="note">房主建立房間後把代碼給朋友；每個人經營自己的航空公司，同航線會互相搶旅客，二手市場也共用。時間由房主控制，所有人最多只會差一天。</p>
        ${kindPick()}
        <div class="net-row"><button class="btn primary" data-act="net-host" ${busy ? 'disabled' : ''}>建立房間</button>
          <input id="net-code" maxlength="8" placeholder="房間代碼" autocomplete="off" aria-label="房間代碼"><button class="btn" data-act="net-join" ${busy ? 'disabled' : ''}>加入</button></div>
        ${kind === 'peer' ? `<p class="note">網路模式使用 PeerJS 的免費配對服務，裝置之間直接連線。手機網路、學校或公司網路可能擋住直連，建議用家裡的 Wi-Fi。</p>
          <div class="row-btns"><button class="btn sm" data-act="net-test" ${testing ? 'disabled' : ''}>${testing ? '測試中…' : '測試我的網路'}</button></div>${testMsg ? `<p class="note ${testMsg.kind === 'open' ? 'pos' : 'neg'}">${esc(testMsg.msg)}</p>` : ''}` : ''}
      </section>`;
    }
    const me = N.myId, list = Object.entries(N.players).sort((a, b) => (a[0] === 'host' ? -1 : b[0] === 'host' ? 1 : 0));
    const today = Math.floor(G.S.time / DAY);
    return `<section class="netcard on">
      <header><b>多人連線 · ${N.role === 'host' ? '你是房主' : '已加入房間'}</b><span class="spacer"></span><button class="btn sm danger" data-act="net-leave">${N.role === 'host' ? '關閉房間' : '離開'}</button></header>
      <div class="room-code"><span>房間代碼</span><b>${esc(N.code)}</b><small>${N.transport === 'local' ? '本機測試' : '網路'} · ${list.length}／4 人</small></div>
      <div class="table-wrap"><table class="net-players"><thead><tr><th>航空公司</th><th>樞紐</th><th>航線</th><th>機隊</th><th>上月營收</th><th>進度</th></tr></thead><tbody>
        ${list.map(([id, p]) => `<tr><td><span class="cbadge" style="--c:${esc(p.color)}">${esc(p.code)}</span>${esc(p.name)}${id === me ? ' <small class="muted">（你）</small>' : id === 'host' ? ' <small class="muted">（房主）</small>' : ''}${p.ally ? `<span class="chip ally" style="--c:${esc(p.ally.color || '#888')}">${esc(p.ally.name)}</span>` : ''}${p.stock ? `<small class="muted"> 股價 $${(+p.stock.price).toFixed(2)}</small>` : ''}</td><td>${esc(p.hub || '')}</td><td>${(p.routes || []).length}</td><td>${p.fleet || 0}</td><td>${p.revLast ? M(p.revLast) : '—'}</td><td>${p.away ? '<span class="chip warn">暫離</span>' : p.day >= today ? '同步' : `落後 ${today - p.day} 天`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">${N.role === 'host' ? '你控制時間速度；朋友按速度鍵或暫停時會請你這邊執行。你切到背景時整個房間會暫停。' : '時間由房主控制，你按速度鍵會送出請求。你切到背景時會標為「暫離」，房間不再等你；回來後自動追上進度。'}其他玩家的航線在地圖上以虛線顯示，同航線會互相稀釋攬客力。</p>
    </section>`;
  };

  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'net-kind': kind = d.k; U.render(); return;
      case 'net-test': testing = true; U.render(); G.netTest().then((r) => { testing = false; testMsg = r; U.render(); }); return;
      case 'net-host': {
        busy = true; U.render();
        G.netHost(kind).then((r) => { busy = false; if (r.ok) U.toast(`房間已建立，代碼 ${r.code}，把代碼給朋友就能加入`); else U.toast(r.msg, true); U.render(); });
        return;
      }
      case 'net-join': {
        const code = ($('#net-code') || {}).value || '';
        busy = true; U.render(); U.toast('連線中…');
        G.netJoin(code, kind).then((r) => { busy = false; if (r.ok) U.toast(`已加入房間 ${r.code}`); else U.toast(r.msg, true); U.render(); if (G.map) G.map.invalidate(); });
        return;
      }
      case 'net-leave': if (el.dataset.confirm) { G.netLeave(); U.render(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認'; } return;
      case 'used-buy':
        // 客人買二手飛機：先請房主保留，成功後才在自己這邊成交
        if (G.net && G.net.role === 'client') {
          const reg = (($('#used-reg') || {}).value || '').trim() || null, id = +d.id, mode = d.mode;
          const it = G.S.usedMkt && G.S.usedMkt.items.find((x) => x.id === id);
          if (!it) { U.toast('這架飛機已經被買走了', true); return; }
          if (G.S.cash < (mode === 'buy' ? it.price : it.lease * 2)) { U.toast('現金不足', true); return; }
          if (reg) { const why = G.checkReg(G.normReg(reg)); if (why) { U.toast(why, true); return; } }
          G.net.requestUsed(id).then((r) => {
            if (!r.ok) { U.toast(r.msg || '無法購買', true); return; }
            const x = G.buyUsed(id, mode, reg);
            if (!x.ok) U.toast(x.msg || '無法購買', true);
            else { U.toast(`二手 ${G.TYPES[x.ac.type].model}（${x.ac.reg}）已加入機隊`); U.tab = 'fleet'; U.render(); if (U.buyDialog) U.buyDialog(); }
          });
          return;
        }
        break;
    }
    if (act0) act0(a, d, el);
  };
})();
