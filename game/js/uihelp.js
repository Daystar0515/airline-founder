// v1.0 介面：遊戲百科、分頁標題與說明按鈕、設定頁、通知多寡、新手引導。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } } };

  // ---------- 遊戲百科 ----------
  let topic = 'start', hq = '';
  U.helpDialog = (t) => {
    if (t) topic = t;
    const list = G.HELP.filter(([k, title, cat, body]) => !hq || title.includes(hq) || body.replace(/<[^>]+>/g, '').includes(hq)).sort((a, b) => (hq ? (b[1].includes(hq) ? 1 : 0) - (a[1].includes(hq) ? 1 : 0) : 0));
    if (list.length && !list.some((x) => x[0] === topic)) topic = list[0][0];
    const cur = G.HELP.find((x) => x[0] === topic) || G.HELP[0];
    const cats = [...new Set(list.map((x) => x[2]))];
    U.modal(`<h2>遊戲百科</h2>
      <div class="help-wrap">
        <nav class="help-nav" aria-label="主題">
          <label class="search"><span class="sr">搜尋</span><input id="help-q" type="search" placeholder="搜尋，例如 載客率、聯盟" value="${esc(hq)}" autocomplete="off"></label>
          <div id="help-list">${cats.map((c) => `<p class="help-cat">${esc(c)}</p>${list.filter((x) => x[2] === c).map(([k, title]) => `<button class="help-item" data-act="help-topic" data-k="${k}" aria-current="${k === cur[0]}">${esc(title)}</button>`).join('')}`).join('') || '<p class="note">找不到符合的主題。</p>'}</div>
        </nav>
        <article class="help-body"><h3>${esc(cur[1])}</h3>${cur[3]}</article>
      </div>`, 'wide help');
  };
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'help-q') return;
    hq = e.target.value.trim();
    const pos = e.target.selectionStart;
    U.helpDialog();
    const el = $('#help-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) { /* 忽略 */ } }
  });

  // ---------- 分頁標題 ----------
  U.tabHeader = (tab) => {
    const info = G.TAB_INFO[tab];
    if (!info) return '';
    const sub = store.get('af-tab-tips', '1') === '1';
    return (U.tutInline ? U.tutInline() : '') + `<div class="tab-head"><div><b>${esc(info[0])}</b>${sub ? `<small>${esc(info[1])}</small>` : ''}</div><button class="help-btn" data-act="help" data-k="${info[2]}" aria-label="${esc(info[0])}說明">?</button></div>`;
  };

  // ---------- 通知多寡 ----------
  const QUIET = ['rival', 'size-advice', 'used-refresh', 'social', 'gov-tender', 'gov-lost', 'gov-done', 'holder', 'union', 'strike-end', 'net', 'ally'];
  let evKind = null;
  G.on((w, d) => { evKind = w === 'event' && d ? d.kind : null; }); // 在 main.js 的事件處理之前記下事件種類
  G.clearEvKind = () => { evKind = null; };
  const toast0 = U.toast;
  U.toast = (msg, bad) => {
    const lv = store.get('af-notify', 'all');
    if (evKind && !bad && (lv === 'minimal' || (lv === 'important' && QUIET.includes(evKind)))) return;
    toast0(msg, bad);
  };

  // ---------- 設定 ----------
  U.settingsDialog = () => {
    const seg = (name, opts, cur, act) => `<div class="set-row"><span class="lbl">${name}</span><div class="seg" role="group" aria-label="${name}">${opts.map(([k, n]) => `<button data-act="${act}" data-k="${k}" aria-pressed="${k === cur}">${n}</button>`).join('')}</div></div>`;
    const lay = G.layoutPref(), mp = G.map && G.map.show ? (G.map.show.routes && G.map.show.planes ? 'both' : G.map.show.routes ? 'routes' : 'planes') : 'both';
    U.modal(`<h2>設定</h2>
      <div class="settings">
        ${seg('顯示版面', [['auto', '自動偵測'], ['desktop', '電腦版'], ['mobile', '手機版']], lay, 'set-layout')}
        <p class="note">目前使用${U.isMobile() ? '手機版' : '電腦版'}。自動偵測會依螢幕大小與觸控裝置選擇。</p>
        ${seg('地圖顯示', [['both', '航線＋飛機'], ['routes', '只顯示航線'], ['planes', '只顯示飛機']], mp, 'set-layers')}
        ${seg('自動存檔', Object.entries(G.AUTOSAVE).map(([k, n]) => [k, n.replace('（推薦）', '').replace('（只在離開與手動時存檔）', '')]), G.autosaveMode(), 'set-autosave')}
        <p class="note">${G.AUTOSAVE[G.autosaveMode()]}。不管選哪一種，離開網頁、切到背景與手動存檔都會存。</p>
        ${seg('通知', [['all', '全部'], ['important', '只顯示重要的'], ['minimal', '只顯示警告']], store.get('af-notify', 'all'), 'set-notify')}
        <p class="note">「只顯示重要的」會略過對手動態、二手市場、社群、標案公告等一般消息；營運日誌仍會完整記錄。</p>
        ${seg('分頁上方的說明文字', [['1', '顯示'], ['0', '隱藏']], store.get('af-tab-tips', '1'), 'set-tips')}
        <div class="set-row"><span class="lbl">新手引導</span><div class="row-btns"><button class="btn sm" data-act="m-tutorial" ${G.S ? '' : 'disabled'}>重新開始新手引導</button></div></div>
        <div class="set-row"><span class="lbl">存檔</span><div class="row-btns"><button class="btn sm" data-act="m-slots">存檔管理</button>${G.S ? '<button class="btn sm" data-act="m-export">匯出存檔檔案</button>' : ''}</div></div>
        ${G.pwaCapable ? `<p class="note">${G.isStandalone() ? '已從主畫面開啟，可以離線遊玩。' : '可以把遊戲加到主畫面：iPhone Safari 按「分享」→「加入主畫面」；電腦的 Chrome／Edge 按網址列右側的安裝圖示。'}</p>` : ''}
      </div>`);
  };

  // ---------- 新手引導 ----------
  const STEPS = [
    { t: '歡迎來到航空公司創始人', d: '接下來帶你走完第一個月：取得飛機、開航線、讓飛機起飛、看月報。大約 5 分鐘，隨時可以跳過。', next: '開始' },
    { t: '取得第一架飛機', d: '打開「機隊」分頁，按「選購飛機」，挑一架 A320neo 或 ATR 72 按「租賃」。租賃只要付兩個月租金當保證金。', hi: '[data-tab="fleet"]', hi2: '[data-act="buy"]', btn: ['打開機隊', 'go-fleet'], done: (S) => S.fleet.length > 0 },
    { t: '設定艙等', d: '新飛機可以免費設定艙等。先用預設的配置就好，按「儲存配置」關掉視窗。之後隨時可以在機隊的「艙等配置」修改。', next: '下一步', done: () => $('#modal').hidden },
    { t: '開設第一條航線', d: '在地圖上點一座機場（例如成田 NRT、香港 HKG），在機場資訊按「開設航線」。也可以按下面的按鈕，從推薦清單挑一個目的地。開航時可以直接指派推薦的飛機。', btn: ['打開開航視窗', 'tut-route'], done: (S) => S.routes.length > 0 },
    { t: '指派飛機', d: '如果開航時沒有指派飛機，回到「機隊」，在飛機卡片的「未指派航線」選單選擇剛開的航線。', hi: '[data-tab="fleet"]', done: (S) => S.fleet.some((a) => a.route) },
    { t: '讓時間開始流動', d: '按右上角的 ▶ 讓時間開始前進，你的飛機會照時刻表起飛。▶▶▶ 是每秒一天。', hi: '.speeds', done: (S) => S.fleet.some((a) => a.st === 'air' || a.st === 'sched') && G.speed > 0 },
    { t: '看看你的航線', d: '打開「航線」分頁，點你的航線展開：這裡有載客率、票價（預設是自動最佳定價）與航班編號。', hi: '[data-tab="routes"]', done: () => U.tab === 'routes' && Object.values(U.expanded || {}).some(Boolean) },
    { t: '等第一份月報', d: '每月 1 日會結算損益。讓時間繼續跑到下個月，再打開「財務」看損益表。', hi: '[data-tab="finance"]', done: (S) => S.fin.statements.length > 0 && U.tab === 'finance' },
    { t: '完成！', d: '接下來可以：多開幾條航線、設立次要樞紐、到「人事」看員工、在「服務」推出會員方案、累積實力後加入「聯盟」。不懂的地方按每個分頁右上角的「?」，或從左上角的選單打開遊戲百科。', next: '完成' },
  ];
  const tut = () => (G.S && G.S.tut) || null;
  U.startTutorial = () => { if (!G.S) return; G.S.tut = { step: 0, on: true }; store.set('af-tut-seen', '1'); drawTut(); };
  const stopTut = (done) => { if (G.S && G.S.tut) { G.S.tut.on = false; G.S.tut.done = !!done; } drawTut(); };
  let lastKey = '', inlineStep = -1;
  const glow = (sels) => { document.querySelectorAll('.tut-glow').forEach((x) => x.classList.remove('tut-glow')); sels.filter(Boolean).forEach((sel) => document.querySelectorAll(sel).forEach((x) => x.classList.add('tut-glow'))); };
  const cardHtml = (T, st) => `<div class="tut-top"><span class="tut-step">新手引導 ${T.step}/${STEPS.length - 1}</span><button class="tut-x" data-act="tut-skip" aria-label="結束新手引導">×</button></div>
          <b>${esc(st.t)}</b><p>${esc(st.d)}</p>
          <div class="row-btns">${st.btn ? `<button class="btn sm primary" data-act="${st.btn[1]}">${esc(st.btn[0])}</button>` : ''}${st.next ? `<button class="btn sm ${st.btn ? '' : 'primary'}" data-act="tut-next">${esc(st.next)}</button>` : ''}${T.step > 0 && T.step < STEPS.length - 1 ? '<button class="btn sm link" data-act="tut-skip">跳過引導</button>' : ''}${T.step === 0 ? '<button class="btn sm" data-act="tut-skip">不用了，我自己玩</button>' : ''}</div>`;
  // 手機：面板全開時把引導卡片放在面板最上面（不遮住內容）；其他時候浮在地圖上方
  const inlineMode = () => U.isMobile() && $('#panel').dataset.sheet === 'full';
  U.tutInline = () => {
    const T = tut();
    if (!T || !T.on || !inlineMode()) return '';
    return `<section class="tut-inline">${cardHtml(T, STEPS[T.step])}</section>`;
  };
  function drawTut() {
    let el = $('#tut');
    const T = tut();
    if (!T || !T.on || document.body.classList.contains('intro')) {
      if (el) el.hidden = true; glow([]); lastKey = '';
      if (inlineStep !== -1) { inlineStep = -1; U.render(); }
      return;
    }
    if (!el) { el = document.createElement('section'); el.id = 'tut'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    const st = STEPS[T.step], modalOpen = !$('#modal').hidden;
    if (U.isMobile() && (modalOpen || inlineMode())) {
      el.hidden = true; lastKey = '';
      const want = inlineMode() ? T.step : -2;
      if (inlineStep !== want) { inlineStep = want; U.render(); }
      glow(modalOpen ? [] : [st.hi, st.hi2]);
      return;
    }
    if (inlineStep !== -1) { inlineStep = -1; U.render(); }
    const mini = modalOpen, key = T.step + (mini ? 'm' : '');
    el.hidden = false;
    el.className = mini ? 'mini' : '';
    if (key !== lastKey) {
      lastKey = key;
      el.innerHTML = mini ? `<button class="tut-mini" data-act="tut-expand">新手引導 ${T.step}/${STEPS.length - 1}：${esc(st.t)}</button>` : cardHtml(T, st);
    }
    glow(mini ? [] : [st.hi, st.hi2]);
  }
  // 對話框開關時立刻更新，不要等下一次檢查
  const modal0 = U.modal, close0 = U.closeModal;
  U.modal = (...a) => { modal0(...a); if (tut() && tut().on) drawTut(); };
  U.closeModal = (...a) => { close0(...a); if (tut() && tut().on) drawTut(); };
  setInterval(() => {
    const T = tut();
    if (!T || !T.on) { if ($('#tut') && !$('#tut').hidden) drawTut(); return; }
    const st = STEPS[T.step];
    if (st.done && st.done(G.S)) { T.step = Math.min(STEPS.length - 1, T.step + 1); }
    drawTut();
  }, 500);
  G.afterNewGame = () => {
    const first = store.get('af-tut-seen', '0') !== '1';
    U.modal(`<div class="about-hero"><div class="title-logo">${G.logoSvg()}</div><div><h2>${esc(G.S.company.name)} 成立了！</h2><p class="sub">${first ? '第一次玩嗎？新手引導會帶你完成第一個月的營運，大約 5 分鐘。' : '要開啟新手引導嗎？'}</p></div></div>
      <div class="row-btns"><button class="btn primary" data-act="tut-start">開始新手引導${first ? '（推薦）' : ''}</button><button class="btn" data-act="modal-close">我自己玩</button><button class="btn" data-act="m-help">先看遊戲百科</button></div>`);
  };

  // ---------- 動作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 't-help': case 'm-help': U.helpDialog(); return;
      case 'help': U.helpDialog(d.k); return;
      case 'help-topic': topic = d.k; U.helpDialog(); { const b = document.querySelector('.help-body'); if (b) b.scrollTop = 0; if (U.isMobile()) { const h = document.querySelector('.help-body h3'); if (h) h.scrollIntoView({ block: 'start' }); } } return;
      case 't-settings': case 'm-settings': U.settingsDialog(); return;
      case 'set-layout': G.setLayoutPref(d.k); U.settingsDialog(); U.render(); return;
      case 'set-layers': if (U.setLayers) U.setLayers(d.k); U.settingsDialog(); return;
      case 'set-autosave': G.setAutosave(d.k); U.settingsDialog(); return;
      case 'set-notify': store.set('af-notify', d.k); U.settingsDialog(); return;
      case 'set-tips': store.set('af-tab-tips', d.k); U.settingsDialog(); U.render(); return;
      case 'm-tutorial': case 'tut-start': U.closeModal(); U.startTutorial(); return;
      case 'tut-next': { const T = tut(); if (!T) return; if (T.step >= STEPS.length - 1) stopTut(true); else { T.step++; drawTut(); } return; }
      case 'tut-skip': stopTut(false); U.toast('已結束新手引導，可以從選單重新開始'); return;
      case 'tut-expand': U.closeModal(); drawTut(); return;
      case 'go-fleet': U.go('fleet'); return;
      case 'tut-route': U.routeDialog(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
