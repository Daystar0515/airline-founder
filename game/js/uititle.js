// v1.0 介面：標題畫面、遊戲選單、存檔管理、關於（資料來源、授權、更新紀錄、製作）。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const gdate = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`; };
  const rtime = (t) => (t ? new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const inGame = () => !!G.S && document.body.classList.contains('intro') === false;

  // ---------- 標題畫面 ----------
  U.titleScreen = () => {
    const box = $('#intro-title');
    if (!box) return;
    const m = G.slotMeta(), a = m.active && m.slots[m.active] ? m.active : Object.keys(m.slots).map(Number).sort((x, y) => (m.slots[y].saved || 0) - (m.slots[x].saved || 0))[0];
    const s = a ? m.slots[a] : null;
    $('#title-logo').innerHTML = G.LOGO_SVG;
    $('#ver-eyebrow').textContent = `AIRLINE FOUNDER · v${G.VERSION}`;
    $('#title-cont').innerHTML = s ? `<button class="slot-card" data-act="t-cont" data-n="${a}">
        <span class="cbadge big" style="--c:${esc(s.color)}">${esc(s.code)}</span>
        <span class="slot-info"><b>繼續：${esc(s.name)}</b><small>遊戲日期 ${gdate(s.time)} · 現金 ${M(s.cash)} · ${s.fleet} 架 · ${s.routes || 0} 條航線</small><small>第 ${a} 欄 · 存於 ${rtime(s.saved)}</small></span>
        <span class="go" aria-hidden="true">›</span></button>` : '';
  };

  // ---------- 存檔管理 ----------
  let pickForNew = false;
  U.slotsDialog = (forNew) => {
    pickForNew = !!forNew;
    const m = G.slotMeta(), rows = [];
    for (let n = 1; n <= G.SLOTS; n++) {
      const s = m.slots[n], cur = G.S && m.active === n && inGame();
      rows.push(s ? `<article class="slot ${cur ? 'cur' : ''}">
          <span class="cbadge big" style="--c:${esc(s.color)}">${esc(s.code)}</span>
          <div class="slot-info"><b>${esc(s.name)}${cur ? ' <span class="chip dev">進行中</span>' : ''}${s.over ? ' <span class="chip curfew">已結束</span>' : ''}</b>
            <small>遊戲日期 ${gdate(s.time)} · 現金 ${M(s.cash)} · ${s.fleet} 架 · ${s.routes || 0} 條航線</small>
            <small>第 ${n} 欄 · 存於 ${rtime(s.saved)}${s.size ? ` · ${Math.round(s.size * 2 / 1024)} KB` : ''}</small></div>
          <div class="row-btns">${pickForNew ? `<button class="btn sm danger" data-act="slot-new" data-n="${n}">覆蓋並開新遊戲</button>` : `${cur ? '' : `<button class="btn sm primary" data-act="slot-load" data-n="${n}">讀取</button>`}<button class="btn sm" data-act="slot-export" data-n="${n}">匯出</button><button class="btn sm danger" data-act="slot-del" data-n="${n}">刪除</button>`}</div>
        </article>` : `<article class="slot slot-empty"><span class="cbadge big" style="--c:#c3ccd5">${n}</span><div class="slot-info"><b>空欄位</b><small>第 ${n} 欄</small></div>
          <div class="row-btns"><button class="btn sm ${pickForNew ? 'primary' : ''}" data-act="slot-new" data-n="${n}">在這裡開新遊戲</button><button class="btn sm" data-act="slot-import" data-n="${n}">匯入到這裡</button></div></article>`);
    }
    const used = G.storageUsed();
    U.modal(`<h2>${pickForNew ? '選擇存檔欄位' : '存檔管理'}</h2>
      <p class="sub">${pickForNew ? '5 個欄位都有存檔了，請選一個覆蓋。' : '最多 5 個存檔，每個存檔都會自動壓縮。遊戲會依「設定」的頻率自動存到目前的欄位。'}</p>
      <div class="slots">${rows.join('')}</div>
      ${!pickForNew && m.backup ? `<div class="callout"><b>每月備份</b><p>${esc(m.backup.name)} · 遊戲日期 ${gdate(m.backup.time)}（每個遊戲月第一次存檔時更新；主存檔損毀時可以用來救回）</p><button class="btn sm" data-act="slot-load" data-n="backup">讀取備份</button></div>` : ''}
      <p class="note">目前使用瀏覽器儲存空間約 ${Math.round(used / 1024)} KB。iPhone 的 Safari 可能清除一段時間沒開的網站資料；建議把遊戲「加入主畫面」，並定期匯出存檔檔案保存到「檔案」或雲端硬碟。</p>`, 'wide');
  };
  async function doImport(n) {
    const txt = await G.pickSaveFile();
    if (txt == null) return;
    if (G.S && inGame()) G.save();
    if (G.net) G.netLeave();
    const r = G.importSaveText(txt, n);
    if (!r.ok) { U.toast(r.msg, true); return; }
    U.closeModal();
    G.enterGame();
    U.toast(`已匯入 ${G.S.company.name}（第 ${r.slot} 欄）`);
  }

  // ---------- 遊戲選單 ----------
  U.menuDialog = () => {
    U.modal(`<div class="menu-head"><div class="title-logo sm">${G.LOGO_SVG}</div><div><b>航空公司創始人</b><small>v${esc(G.VERSION)}</small></div></div>
      <div class="menu-grid">
        <button class="mbtn" data-act="save"><b>立即存檔</b><small>存到第 ${G.activeSlot() || 1} 欄</small></button>
        <button class="mbtn" data-act="m-slots"><b>存檔管理</b><small>讀取、刪除、匯入</small></button>
        <button class="mbtn" data-act="m-export"><b>匯出存檔檔案</b><small>備份到檔案或雲端</small></button>
        <button class="mbtn" data-act="m-settings"><b>設定</b><small>版面、自動存檔、通知</small></button>
        <button class="mbtn" data-act="m-help"><b>遊戲百科</b><small>規則與名詞說明</small></button>
        <button class="mbtn" data-act="m-tutorial"><b>新手引導</b><small>從頭帶你玩一次</small></button>
        <button class="mbtn" data-act="m-ach"><b>成就與大事記</b><small>公司的里程碑</small></button>
        <button class="mbtn" data-act="m-about"><b>關於</b><small>資料來源、授權、更新紀錄</small></button>
        <button class="mbtn" data-act="m-title"><b>回到標題畫面</b><small>先自動存檔</small></button>
      </div>`);
  };

  // ---------- 關於 ----------
  let aboutTab = 'about';
  U.aboutDialog = (tab) => {
    if (tab) aboutTab = tab;
    const tabs = [['about', '關於'], ['data', '資料來源與授權'], ['log', '更新紀錄']];
    const body = {
      about: `<div class="about-hero"><div class="title-logo">${G.LOGO_SVG}</div><div><p class="eyebrow">AIRLINE FOUNDER · v${esc(G.VERSION)}</p><h2>航空公司創始人</h2><p class="sub">在真實的全球機場網路上創立航空公司、設立樞紐、購買飛機、開設航線，和真實航空公司與朋友競爭。</p></div></div>
        <div class="callout"><b>非官方、非營利的粉絲作品</b><p>遊戲中出現的航空公司、航空聯盟、機場與飛機製造商名稱，僅用於遊戲模擬，本作與這些公司及組織無關，也未經授權。真實航空公司在遊戲裡不會破產、不會出現醜聞或飛安事故；班次、票價、股價、股利與經營表現都是估算或虛構。</p></div>
        <dl class="facts"><dt>企劃與設計</dt><dd>本作作者（大學生、業餘開發者）</dd><dt>程式開發</dt><dd>與 Anthropic 的 Claude 協作完成（vibe coding）</dd><dt>平台</dt><dd>網頁遊戲：iPhone Safari、Windows 的 Chrome／Edge</dd><dt>存檔</dt><dd>只存在你的瀏覽器裡，不會上傳到任何伺服器；多人連線時只傳送公司的公開資訊</dd><dt>回報問題</dt><dd>${G.REPORT_URL ? `<a href="${esc(G.REPORT_URL)}" target="_blank" rel="noopener">GitHub Issues</a>` : '請把錯誤畫面的訊息與匯出的存檔傳給作者'}</dd></dl>`,
      data: `<ul class="plain src-list">
        <li><b>機場與跑道</b>：OurAirports（公有領域）</li>
        <li><b>機場時區、航空公司母國</b>：OpenFlights（Open Database License，ODbL）。依 ODbL，本作由此衍生的資料（機場時區、航空公司母國）以相同授權提供，原始資料見 github.com/jpatokal/openflights</li>
        <li><b>真實航空公司航網與機場類型</b>：Jonty/airline-route-data（2026 年；資料整理自 flightsfrom.com，原始資料未附授權條款）。本作僅作非營利遊戲模擬使用；如權利人要求，作者會移除相關資料</li>
        <li><b>真實機隊數</b>：維基百科「List of largest airlines」各洲列表與航空公司條目（CC BY-SA）</li>
        <li><b>航空聯盟成員</b>：維基百科 Star Alliance、Oneworld、SkyTeam 條目（2026 年 10 月，CC BY-SA）</li>
        <li><b>地圖、國界、海岸線、人口與經濟</b>：Natural Earth（公有領域）；底圖 Natural Earth I</li>
        <li><b>封閉空域</b>：依 Natural Earth 國界計算</li>
        <li><b>雙邊旅客統計（2024）</b>：日本 JNTO、台灣交通部觀光署、韓國觀光公社、泰國、越南、新加坡 STB、香港旅發局、西班牙 INE Frontur</li>
        <li><b>國際商務城市等級</b>：GaWC 2024 World Cities</li>
        <li><b>宵禁</b>：設計者提供、維基百科 Night flying restrictions；部分標註「待校對」</li>
        <li><b>機型規格與價格</b>：各製造商公開規格的近似值</li>
        <li><b>程式元件</b>：PeerJS（MIT，多人連線時才從 jsDelivr 載入）；存檔壓縮演算法改寫自 lz-string（MIT，Pieroxy）</li>
        <li><b>字型</b>：Inter、JetBrains Mono、Noto Sans TC（SIL Open Font License，Google Fonts）</li>
      </ul>`,
      log: `<ol class="changelog">${G.CHANGELOG.map(([v, t]) => `<li><b>v${esc(v)}</b><span>${esc(t)}</span></li>`).join('')}</ol><p class="note">完整的設計過程記錄在規格書中。</p>`,
    }[aboutTab];
    U.modal(`<h2>關於</h2><div class="seg" role="tablist">${tabs.map(([k, n]) => `<button data-act="about-tab" data-k="${k}" aria-pressed="${k === aboutTab}">${n}</button>`).join('')}</div>${body}`, 'wide');
  };

  // ---------- 動作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 't-cont': case 'slot-load': {
        if (G.S && inGame()) G.save();
        if (G.net) G.netLeave();
        const r = G.loadSlot(d.n === 'backup' ? 'backup' : +d.n);
        if (!r.ok) { U.toast(r.msg, true); return; }
        U.closeModal(); G.enterGame(); U.toast(`已讀取 ${G.S.company.name}`);
        if (G.S.over && U.gameOver) U.gameOver(G.S.over); // 已結束的存檔：直接顯示經營回顧
        return;
      }
      case 't-new': { const n = G.freeSlot(); if (n) { G._newSlot = n; G.startNewGame(); } else U.slotsDialog(true); return; }
      case 'slot-new': { if (el.dataset.confirm || !G.slotMeta().slots[d.n]) { if (G.S && inGame()) G.save(); if (G.net) G.netLeave(); G._newSlot = +d.n; U.closeModal(); G.S = null; G.showIntro(); G.startNewGame(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認覆蓋'; } return; }
      case 't-slots': case 'm-slots': U.slotsDialog(false); return;
      case 't-import': doImport(G.freeSlot() || null); return;
      case 'slot-import': doImport(+d.n); return;
      case 'slot-export': G.exportSlot(+d.n).then((r) => U.toast(r.ok ? (r.shared ? '已開啟分享選單' : `已匯出 ${r.name}`) : r.msg, !r.ok)); return;
      case 'slot-del': if (el.dataset.confirm) { const cur = G.S && G.activeSlot() === +d.n && inGame(); G.deleteSlot(+d.n); if (cur) { G.setSpeed(0); G.S = null; U.closeModal(); G.showIntro(); U.toast('已刪除存檔'); } else { U.slotsDialog(pickForNew); U.titleScreen(); } } else { el.dataset.confirm = '1'; el.textContent = '再按一次刪除'; } return;
      case 'm-export': G.downloadSave().then((r) => U.toast(r.ok ? (r.shared ? '已開啟分享選單' : `已匯出 ${r.name}`) : r.msg, !r.ok)); return;
      case 'm-title': if (G.S) G.save(); if (G.net) G.netLeave(); G.setSpeed(0); U.closeModal(); G.S = null; G.showIntro(); return;
      case 't-about': case 'm-about': U.aboutDialog(); return;
      case 'about-tab': U.aboutDialog(d.k); return;
      case 'menu': U.menuDialog(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
