// 啟動流程：開場畫面、創立公司、選擇第一個主要樞紐、時間流速與自動存檔。
(function () {
  const G = window.G;
  const $ = (s) => document.querySelector(s);
  // v0.6.2 時間以「一天」為最小單位：速度是每幾秒過一天；玩家按暫停會把今天跑完才停，
  // 「下一天」會把今天跑完後自動暫停。飛機在一天之內照常飛行。
  // 每秒現實時間推進的遊戲分鐘數：每 4 秒、2 秒、1 秒一天
  const SPEEDS = [0, 360, 720, 1440];
  let acc = 0;
  const DAYMS = 86400000;
  G.speed = 0; G.lastSpeed = 1;
  let stepDay = false;
  G.dayEnd = () => (Math.floor(G.S.time / DAYMS) + 1) * DAYMS;
  G.dayProgress = () => (G.S ? (G.S.time % DAYMS) / DAYMS : 0);
  G.finishDay = () => { if (!G.S) return; let m = Math.round((G.dayEnd() - G.S.time) / 60000); if (G.net && G.net.limit != null) m = Math.min(m, Math.floor((G.net.limit - G.S.time) / 60000)); if (m > 0) G.advance(m); };
  // opt.user：玩家自己按的暫停 → 先把今天跑完；事件觸發的暫停（失事、罷工通知…）立刻停
  G.setSpeed = (s, opt) => {
    // v0.8.0 多人連線：客人按的速度變成請求，由房主決定
    if (G.net && G.net.onLocalSpeed && !(opt && opt.remote) && G.net.onLocalSpeed(s, opt)) return;
    const wasRunning = G.speed;
    G.speed = s; stepDay = false;
    if (s) G.lastSpeed = s;
    else if (opt && opt.user && wasRunning) { acc = 0; G.finishDay(); }
    G.ui.updateTop();
    if (G.net && G.net.afterSpeed) G.net.afterSpeed();
  };
  G.nextDay = (opt) => {
    if (!G.S) return;
    if (G.net && G.net.onNextDay && !(opt && opt.remote) && G.net.onNextDay()) return;
    stepDay = true; G.speed = 3; G.ui.updateTop();
    if (G.net && G.net.afterSpeed) G.net.afterSpeed();
  };
  G.stepping = () => stepDay;

  let uiAcc = 0, panelAcc = 0, saveDay = null, lastSave = 0;
  const SAVE_EVERY = 15000; // 最快每 15 秒存一次檔（高速時每秒就是一天，每天存會一直卡一下）
  G.tick = (dt) => {
    if (!G.S) return;
    if (G.speed) {
      acc += dt * SPEEDS[G.speed];
      if (acc >= 1) {
        let m = Math.floor(acc); acc -= m;
        // v0.8.0 多人連線：不能比最慢的玩家快超過一天
        if (G.net && G.net.limit != null) {
          const room = Math.floor((G.net.limit - G.S.time) / 60000);
          G.net.waiting = m > room;
          if (m > room) { m = Math.max(0, room); acc = 0; }
          if (!m) { uiAcc += dt; if (uiAcc > 0.5) { uiAcc = 0; G.ui.updateTop(); } return; }
        }
        if (stepDay) {
          const rem = Math.round((G.dayEnd() - G.S.time) / 60000);
          if (m >= rem) { G.advance(rem); acc = 0; stepDay = false; G.speed = 0; G.ui.updateTop(); if (G.net && G.net.afterSpeed) G.net.afterSpeed(); return; }
        }
        G.advance(m);
      }
    }
    uiAcc += dt; panelAcc += dt;
    if (uiAcc > 0.5) { uiAcc = 0; G.ui.updateTop(); }
    if (G.speed) { const pb = document.getElementById('day-prog'); if (pb) pb.style.width = (G.dayProgress() * 100).toFixed(1) + '%'; }
    // 面板每秒最多重畫一次，而且只在面板打開時；內容沒變就不動畫面
    if (panelAcc > 1) {
      panelAcc = 0;
      const busy = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && $('#panel').contains(document.activeElement);
      const open = $('#panel').dataset.sheet !== 'closed';
      if (G.speed && open && !busy && ['overview', 'fleet', 'finance', 'airport', 'staff', 'gov'].includes(G.ui.tab)) G.ui.render();
    }
  };
  G.on((what, data) => {
    if (what === 'day') {
      const d = Math.floor(G.S.time / 86400000), mode = G.autosaveMode ? G.autosaveMode() : 'often', dt = new Date(G.S.time);
      // v1.0 自動存檔頻率（設定頁）：每 15 秒／每遊戲週／每遊戲月／關閉
      const due = mode === 'often' ? performance.now() - lastSave > SAVE_EVERY : mode === 'week' ? dt.getUTCDay() === 1 : mode === 'month' ? dt.getUTCDate() === 1 : false;
      if (d !== saveDay && due) { saveDay = d; lastSave = performance.now(); G.save(); }
    }
    if (what === 'all') { G.map.invalidate(); G.ui.render(); G.ui.updateTop(); }
    if (what === 'routes' || what === 'hubs' || what === 'fleet') G.map.invalidate();
    if (what === 'logo') { G.ui.updateTop(); G.map.invalidate(); }
    if (what === 'event') {
      if (data.kind === 'crash') { G.setSpeed(0); G.ui.eventDialog(data); G.save(); }
      if (data.kind === 'emergency') G.ui.toast(`${data.reg} 發生機械故障，緊急轉降 ${data.to.iata}`, true);
      if (data.kind === 'union') G.ui.toast(`${G.STAFF[data.group].name}成立工會`);
      if (data.kind === 'demand') G.ui.toast(`${G.STAFF[data.group].name}工會提出訴求，請在 14 天內到「人事」回應`, true);
      if (data.kind === 'strike-notice') { G.setSpeed(0); G.ui.toast(`${G.STAFF[data.group].name}工會宣布 ${G.STRIKE_NOTICE_DAYS} 天後罷工`, true); G.ui.go('staff'); }
      if (data.kind === 'strike') G.ui.toast(`${G.STAFF[data.group].name}罷工開始`, true);
      if (data.kind === 'strike-end') G.ui.toast(`${G.STAFF[data.group].name}罷工結束`);
      if (data.kind === 'board' || (data.kind === 'dismissed' && G.S.board && !data.reason)) { G.setSpeed(0); G.ui.boardDialog(data); G.save(); }
      if (data.kind === 'dismissed' && data.reason) { G.setSpeed(0); G.ui.gameOver(data.reason); }
      if (data.kind === 'bankrupt') { G.setSpeed(0); G.ui.gameOver('bankrupt'); }
      if (data.kind === 'cash-out') { G.setSpeed(0); G.ui.toast('現金已經耗盡，可以到「財務 › 貸款與公司債」借款', true); G.ui.finTab = 'bank'; G.ui.go('finance'); }
      if (data.kind === 'loan-missed') G.ui.toast(`貸款逾期第 ${data.missed} 期，連續 3 期將被收回抵押品或聲請破產`, true);
      if (data.kind === 'repossess') G.ui.toast('銀行收回了抵押的飛機', true);
      if (data.kind === 'ipo') { G.ui.toast(`股票上市！募得 ${G.money(data.net)}，市值 ${G.money(data.cap)}`); }
      if (data.kind === 'ipo-fail') G.ui.toast('上市審查被退回：條件不再符合', true);
      if (data.kind === 'social') { if (data.mine) G.ui.toast(`社群動態已更新：${data.mine} 則與公司有關的新話題`); G.ui.socialBadge(); if (G.ui.tab === 'social') G.ui.render(); }
      if (data.kind === 'gov-tender') { if (data.tender.kind === 'evac') { G.setSpeed(0); G.ui.toast(`緊急撤僑任務：${data.tender.title}，請在 48 小時內回覆`, true); G.ui.go('gov'); } else G.ui.toast(`新的政府標案：${data.tender.title}`); }
      if (data.kind === 'gov-won') { G.ui.toast(`得標！${data.contract.title}${data.contract.state === 'pick' ? '，請在 3 天內派機' : ''}`); if (data.contract.state === 'pick') { G.setSpeed(0); G.ui.go('gov'); } }
      if (data.kind === 'rival') G.ui.toast(data.text);
      if (data.kind === 'ally' || data.kind === 'holder') G.ui.toast(data.text, !!data.warn);
      if (data.kind === 'size-advice') G.ui.toast(data.text);
      if (data.kind === 'used-refresh') G.ui.toast(`二手飛機市場已更新：本季有 ${data.n} 架待售`);
      if (data.kind === 'gov-lost') G.ui.toast(`未得標：${data.tender.title}`, true);
      if (data.kind === 'gov-done') G.ui.toast(`合約完成：${data.contract.title}`);
      if (data.kind === 'gov-failed') G.ui.toast(`合約失敗：${data.contract.title}`, true);
      if (data.kind.startsWith('gov-') && G.ui.govBadge) { G.ui.govBadge(); if (G.ui.tab === 'gov') G.ui.render(); }
      if (data.kind === 'agm-warn') G.ui.toast(`股東會支持度只有 ${data.approval.toFixed(0)}%，明年再不足將被撤換`, true);
      G.map.invalidate();
    }
  });

  // ---------- 開場 ----------
  const COLORS = ['#e8a23a', '#d9534f', '#3fa7d6', '#5cb85c', '#b07cd8', '#f0d35a', '#e47ba5', '#4fd1c5'];
  let draft = null;
  G.showIntro = () => {
    document.body.classList.add('intro');
    $('#intro').hidden = false;
    $('#intro').classList.remove('picking');
    // v1.0 先顯示標題畫面
    $('#intro-title').hidden = false;
    $('#intro-step1').hidden = true;
    $('#intro-step2').hidden = true;
    if (G.ui.titleScreen) G.ui.titleScreen();
    $('#swatches').innerHTML = COLORS.map((c, i) => `<button type="button" class="sw" style="background:${c}" data-color="${c}" aria-label="顏色 ${i + 1}" aria-pressed="${i === 0}"></button>`).join('');
    draft = { color: COLORS[0], founder: 'classic', logo: null, logoSeed: 0 };
    $('#founders').innerHTML = G.ui.founderCards(draft.founder);
    introLogo();
    G.map.onPick = null;
    G.map.flyTo('TPE', 5);
  };
  // 開場的標誌預覽：沒有上傳就依名稱、代碼、企業色即時產生
  function introLogo() {
    if (draft.logo) return;
    const name = $('#f-name').value.trim() || '航空公司', code = ($('#f-code').value.trim().toUpperCase() || 'AF').slice(0, 2);
    const g = G.genLogo({ name, code, color: draft.color, seed: draft.logoSeed });
    draft.autoUrl = g.url;
    $('#intro-logo').innerHTML = `<img src="${g.url}" alt="自動產生的標誌預覽">`;
    $('#intro-logo-note').textContent = `自動產生：${g.style.name}樣式（會跟著公司名稱、代碼、企業色改變）。也可以匯入 500×500 像素的圖片。`;
  }
  let logoTimer = 0;
  const introLogoSoon = () => { clearTimeout(logoTimer); logoTimer = setTimeout(introLogo, 250); };
  function startPickHub() {
    const name = $('#f-name').value.trim(), code = $('#f-code').value.trim().toUpperCase();
    if (!name) return G.ui.toast('請輸入航空公司名稱', true);
    if (!/^[A-Z0-9]{2}$/.test(code)) return G.ui.toast('航空公司代碼需為兩個英文字母或數字', true);
    draft.name = name; draft.code = code;
    $('#intro-step1').hidden = true;
    $('#intro-step2').hidden = false;
    $('#intro').classList.add('picking');
    showHubChoice(null);
    G.map.onPick = (ap) => showHubChoice(ap);
  }
  function showHubChoice(ap) {
    const box = $('#hub-choice');
    if (!ap) { box.innerHTML = '<p class="sub">在地圖上點選一座機場，或從下方快速選擇。滾輪縮放、拖曳移動地圖。</p>'; return; }
    const F = G.FOUNDERS[draft.founder];
    const fee = G.hubFee(ap, 'primary') * (F.hubFee || 1), cf = G.curfew(ap), startCash = G.START_CASH * F.cash;
    box.innerHTML = `<div class="ap-head"><div class="iata">${ap.iata}</div><div><h2>${ap.name}</h2><p>${ap.city} · ${G.countryZh(ap.cc)} · ${G.SIZE_ZH[ap.size]}</p></div></div>
      <dl class="facts"><dt>設立費用</dt><dd>${G.money(fee)}（起始資金 ${G.money(startCash)}，${F.name}）</dd><dt>最長跑道</dt><dd>${ap.rwy ? G.num(ap.rwy) + ' 公尺' : '資料不詳'}</dd>
      <dt>腹地人口</dt><dd>約 ${G.num(ap.popK)} 千人</dd><dt>宵禁</dt><dd>${cf ? cf.from + '–' + cf.to : '無'}</dd></dl>
      <button class="btn primary big" id="found" data-iata="${ap.iata}">以 ${ap.iata} 為主要樞紐，創立 ${draft.name}</button>`;
    $('#found').onclick = () => {
      const auto = !draft.logo;
      const logo = draft.logo || G.genLogo({ name: draft.name, code: draft.code, color: draft.color, seed: draft.logoSeed }).url;
      if (G.useSlotForNew) G.useSlotForNew(G._newSlot || null); // v1.0 存到選定的欄位
      G.newGame({ name: draft.name, code: draft.code, color: draft.color, logo, logoAuto: auto ? { seed: draft.logoSeed } : null, hub: ap.iata, founder: draft.founder });
      endIntro();
      if (G.afterNewGame) G.afterNewGame();
      G.ui.toast(`${draft.name} 正式成立！`);
      G.ui.go('overview');
      G.save();
    };
  }
  // v1.0 標題畫面 → 新遊戲表單；讀檔後進入遊戲
  G.startNewGame = () => {
    $('#intro-title').hidden = true; $('#intro-step1').hidden = false; $('#intro-step2').hidden = true;
    $('#f-name').value = ''; $('#f-code').value = '';
    draft = { color: COLORS[0], founder: 'classic', logo: null, logoSeed: 0 };
    document.querySelectorAll('#swatches .sw').forEach((x, i) => x.setAttribute('aria-pressed', String(i === 0)));
    $('#founders').innerHTML = G.ui.founderCards(draft.founder);
    introLogo();
    const f = $('#f-name'); if (f && !G.ui.isMobile()) f.focus();
  };
  G.enterGame = () => { G.ensureLogo(); endIntro(); G.map.flyTo(G.primaryHub(), 6); G.ui.go('overview'); };
  function endIntro() {
    document.body.classList.remove('intro');
    $('#intro').hidden = true;
    $('#intro').classList.remove('picking');
    G.map.onPick = (ap) => { if (ap) G.ui.go('airport'); else G.ui.render(); };
    G.map.invalidate();
    G.ui.updateTop();
    G.setSpeed(0);
  }

  window.addEventListener('DOMContentLoaded', () => {
    G.applyLayout(); // 依裝置選擇手機版或電腦版
    G.ui.bind();
    G.map.init($('#base'), $('#top'));
    $('#f-next').onclick = startPickHub;
    $('#f-logo').onclick = () => G.ui.pickLogo((url, note) => { draft.logo = url; $('#intro-logo').innerHTML = `<img src="${url}" alt="企業標誌預覽">`; $('#intro-logo-note').textContent = '已匯入你的標誌。按「換一個樣式」可改回自動產生。'; if (note) G.ui.toast(note); });
    $('#f-logo-gen').onclick = () => { if (draft.logo) draft.logo = null; else draft.logoSeed++; introLogo(); };
    $('#f-name').addEventListener('input', introLogoSoon);
    $('#f-code').addEventListener('input', introLogoSoon);
    $('#intro-form').onsubmit = (e) => { e.preventDefault(); startPickHub(); };
    $('#back0').onclick = () => { $('#intro-step1').hidden = true; $('#intro-title').hidden = false; G.ui.titleScreen(); };
    $('#founders').addEventListener('click', (e) => {
      const b = e.target.closest('[data-founder]'); if (!b) return;
      draft.founder = b.dataset.founder;
      document.querySelectorAll('#founders .fcard').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    $('#swatches').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      draft.color = b.dataset.color;
      document.querySelectorAll('#swatches .sw').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      introLogo();
    });
    document.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = () => { const ap = G.AP[b.dataset.quick]; G.map.selected = ap.iata; G.map.flyTo(ap.iata, 14); showHubChoice(ap); }));
    $('#back1').onclick = () => { $('#intro-step1').hidden = false; $('#intro-step2').hidden = true; $('#intro').classList.remove('picking'); G.map.onPick = null; };
    window.addEventListener('beforeunload', () => { if (G.S) G.save(); });
    window.addEventListener('pagehide', () => { if (G.S) G.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.S) G.save(); }); // 手機切到背景時也存檔
    G.showIntro();
  });
})();
