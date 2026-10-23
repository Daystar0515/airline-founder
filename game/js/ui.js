// 介面：頂部狀態列、右側面板分頁、對話框。
(function () {
  const G = window.G;
  const U = (G.ui = {});
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => (v * 100).toFixed(0) + '%';
  const hrs = (m) => `${Math.floor(m / 60)} 小時 ${String(Math.round(m % 60)).padStart(2, '0')} 分`;
  const cname = (c) => G.S.company.cabinNames[c] || G.CLASS_DEFAULT_NAME[c];
  const COST_ZH = { fuel: '燃油', payroll: '人事薪資', hiring: '招募與訓練', crew: '機組飛行津貼', catering: '餐飲供餐', maint: '維修準備金', airport: '機場與航管', service: '機上服務', lease: '飛機租賃', hub: '樞紐營運費', overhead: '管理費用', marketing: '行銷與公關', mxcheck: '定期檢查（A/B/C/D）', incident: '事故、延誤與賠償', capex: '購機（資本支出）', setup: '樞紐、設施與開航（一次性）', deposit: '租機保證金', refit: '客艙改裝（租賃機）', refurb: '飛機整修（租賃機）', loyalty: '會員福利與營運' };
  const ST_ZH = { idle: '待命', turn: '過站整備', sched: '等待起飛', air: '飛行中', stuck: '受宵禁阻擋', maint: '檢查中', aog: '故障修理', refit: '客艙改裝', refurb: '整修中' };
  const dur = (ms) => (ms >= 86400000 ? `${Math.ceil(ms / 86400000)} 天` : `${Math.max(1, Math.ceil(ms / 3600000))} 小時`);
  const repWord = (r) => (r >= 75 ? '優良' : r >= 60 ? '良好' : r >= 45 ? '普通' : r >= 30 ? '不佳' : '惡劣');

  U.tab = 'overview';
  U.expanded = {};

  // ---------- 提示 ----------
  let toastTimer;
  U.toast = (msg, bad) => {
    const t = $('#toast');
    t.textContent = msg; t.className = bad ? 'show bad' : 'show';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = ''), 2600);
  };
  const res = (r, okMsg) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (okMsg) U.toast(okMsg); return r; };

  U.tooltip = (ap, x, y) => {
    const t = $('#tip');
    if (!ap) { t.hidden = true; return; }
    const cf = G.curfew(ap);
    t.innerHTML = `<b>${esc(ap.iata)}</b> ${esc(ap.city)}<br><span>${esc(G.countryZh(ap.cc))} · ${G.SIZE_ZH[ap.size]} · ${G.ROLE_ZH[ap.role || 0]}${ap.mil ? ' · 軍民合用' : ''}${cf ? ' · 宵禁 ' + cf.from + '–' + cf.to : ''}</span>`;
    t.hidden = false;
    const r = t.parentElement.getBoundingClientRect();
    t.style.left = Math.min(x + 14, r.width - t.offsetWidth - 8) + 'px';
    t.style.top = Math.min(y + 14, r.height - t.offsetHeight - 8) + 'px';
  };

  // ---------- 頂部列 ----------
  const dateFmt = {}; // 建立 Intl.DateTimeFormat 很慢，每個時區只建一次
  const setText = (sel, t) => { const el = $(sel); if (el.textContent !== t) el.textContent = t; };
  U.updateTop = () => {
    const S = G.S;
    if (!S) return;
    const hub = G.AP[G.primaryHub()];
    const d = new Date(S.time);
    $('#co-name').textContent = S.company.name;
    $('#co-code').textContent = S.company.code;
    $('#co-code').style.background = S.company.color;
    const lg = $('#co-logo');
    if (S.company.logo) { if (lg.getAttribute('src') !== S.company.logo) lg.src = S.company.logo; lg.hidden = false; $('#co-code').hidden = true; }
    else { lg.hidden = true; $('#co-code').hidden = false; }
    setText('#rep', `${S.rep.toFixed(0)} ${repWord(S.rep)}`);
    $('#rep').className = S.rep < 45 ? 'neg' : S.rep >= 60 ? 'pos' : '';
    setText('#cash', G.money(S.cash, 2));
    $('#cash').classList.toggle('neg', S.cash < 0);
    const tz = hub.tz || 'UTC';
    if (!dateFmt[tz]) { try { dateFmt[tz] = new Intl.DateTimeFormat('zh-TW', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { dateFmt[tz] = new Intl.DateTimeFormat('zh-TW', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); } }
    // v0.6.2 時間以天為單位：只顯示遊戲日期（以 UTC 換日）與當天進度
    const dd = new Date(S.time), wk = '日一二三四五六'[dd.getUTCDay()];
    setText('#clock', `${dd.getUTCFullYear()}/${String(dd.getUTCMonth() + 1).padStart(2, '0')}/${String(dd.getUTCDate()).padStart(2, '0')}（${wk}）`);
    setText('#clock-tz', G.net && G.net.code ? `房間 ${G.net.code} · ${G.net.count ? G.net.count() : 1} 人${G.net.waiting ? ' · 等待中' : ''}` : '遊戲日期');
    const pb = $('#day-prog'); if (pb) pb.style.width = (G.dayProgress() * 100).toFixed(1) + '%';
    const nd = $('[data-act="next-day"]'); if (nd) nd.setAttribute('aria-pressed', String(G.speed === 3 && G.stepping && G.stepping()));
    document.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === G.speed && !(G.stepping && G.stepping()))));
  };

  // ---------- 面板 ----------
  let lastHtml = '';
  U.render = () => {
    if (!G.S) return;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === U.tab)));
    const body = $('#panel-body');
    const keep = body.scrollTop;
    const html = (U.tabHeader ? U.tabHeader(U.tab) : '') + ({ overview, airport, fleet, routes, hubs, finance: U.financeTab || finance, staff: U.staffTab, service: U.serviceTab, social: U.socialTab, gov: U.govTab, rivals: U.rivalsTab, alliance: U.allianceTab, me: U.meTab })[U.tab]();
    if (html !== lastHtml || body.dataset.tab !== U.tab) { body.innerHTML = html; lastHtml = html; body.dataset.tab = U.tab; body.scrollTop = keep; } // 內容沒變就不重建，避免卡頓
    if (U.socialBadge) U.socialBadge();
    if (U.govBadge) U.govBadge();
  };
  U.go = (tab) => { U.tab = tab; U.render(); };

  function overview() {
    const S = G.S, last = S.days[S.days.length - 1];
    const air = S.fleet.filter((a) => a.st === 'air').length;
    const hubs = Object.keys(S.hubs);
    const focus = Object.keys(G.focusCities());
    const todayPax = S.day.pax;
    return `
      <section class="kpis">
        <div><span>機隊</span><b>${S.fleet.length}</b><em>${air} 架飛行中</em></div>
        <div><span>航線</span><b>${S.routes.length}</b><em>${hubs.length} 個樞紐</em></div>
        <div><span>今日旅客</span><b>${G.num(todayPax)}</b><em>昨日 ${last ? G.num(last.pax) : '—'}</em></div>
        <div><span>昨日損益</span><b class="${last && last.rev - last.costOp < 0 ? 'neg' : 'pos'}">${last ? G.money(last.rev - last.costOp) : '—'}</b><em>營收 ${last ? G.money(last.rev) : '—'}</em></div>
        <div><span>社會評價</span><b class="${S.rep < 45 ? 'neg' : S.rep >= 60 ? 'pos' : ''}">${S.rep.toFixed(0)}</b><em>${repWord(S.rep)} · 攬客力 ×${G.repFactor(S.rep).toFixed(2)}</em></div>
        <div><span>飛安紀錄</span><b class="${S.safety.crashes ? 'neg' : ''}">${S.safety.crashes ? S.safety.crashes + ' 起失事' : '零失事'}</b><em>緊急轉降 ${S.safety.emergencies} · 機械延誤 ${S.safety.delays}</em></div>
      </section>
      ${U.overviewV3 ? U.overviewV3() : ''}
      ${(() => { const g = S.fleet.filter((a) => a.grounded).length, od = S.fleet.filter((a) => Object.values(G.overdue(a)).some((v) => v > 0)).length; return g || od ? `<div class="callout warn"><b>${g ? g + ' 架飛機遭稽查停飛' : od + ' 架飛機維修逾期'}</b><p>逾期越久，客艙故障、延誤、緊急轉降與失事的機率越高。到「機隊」安排檢查或調整維修政策。</p><button class="btn" data-act="go" data-tab="fleet">前往機隊</button></div>` : ''; })()}
      ${S.fleet.length === 0 ? `<div class="callout"><b>下一步：取得第一架飛機</b><p>到「機隊」購買或租賃飛機，再點選地圖上的機場開設第一條航線。</p><button class="btn primary" data-act="buy">選購飛機</button></div>` :
        S.routes.length === 0 ? `<div class="callout"><b>下一步：開設航線</b><p>在地圖上點選想飛往的機場，從右側機場資訊按「開設航線」。</p></div>` : ''}
      ${focus.length ? `<h3>重點城市</h3><p class="chips">${focus.map((k) => `<span class="chip">${esc(k.split(':')[1])}</span>`).join('')}</p>` : ''}
      ${U.overviewExtra ? U.overviewExtra() : ''}
      <h3>營運日誌</h3>
      <ol class="log">${S.log.slice(0, 40).map((l) => `<li class="${l.kind}"><time>${new Date(l.t).toISOString().slice(5, 16).replace('T', ' ')}Z</time>${esc(l.msg)}</li>`).join('')}</ol>
      <h3>公司設定</h3>
      <div class="logo-set">
        <div class="logo-prev">${S.company.logo ? `<img src="${S.company.logo}" alt="${esc(S.company.name)} 標誌">` : `<span style="background:${S.company.color}">${esc(S.company.code)}</span>`}</div>
        <div><b>企業標誌</b><p class="meta">可以匯入自己的圖片（PNG、JPG、WebP、SVG，其他尺寸會自動置中裁切成 500×500），或使用依公司名稱、代碼與企業色自動產生的標誌。</p>
        <div class="row-btns"><button class="btn sm" data-act="logo-pick">匯入標誌</button><button class="btn sm" data-act="logo-auto">${S.company.logoAuto ? '換一個樣式' : '改用自動產生'}</button></div>${S.company.logoAuto ? `<p class="note">目前是自動產生的「${G.logoStyleFor(S.company.name, S.company.code, S.company.logoAuto.seed).name}」樣式。</p>` : ''}</div>
      </div>
      <div class="form-grid">
        ${G.CLASSES.map((c) => `<label>${G.CLASS_DEFAULT_NAME[c]}名稱<input id="cn-${c}" data-cabin-name="${c}" value="${esc(cname(c))}" maxlength="12"></label>`).join('')}
      </div>
      <div class="row-btns"><button class="btn" data-act="save">立即存檔</button><button class="btn" data-act="m-slots">存檔管理</button><button class="btn" data-act="m-export">匯出存檔檔案</button><button class="btn" data-act="m-settings">設定</button><button class="btn" data-act="m-title">回到標題畫面</button></div>
      <p class="note">${G.lastSaved ? `上次存檔：${new Date(G.lastSaved).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}，存在第 ${G.activeSlot() || 1} 欄。` : ''}iPhone 的 Safari 可能清除很久沒開的網站資料，建議定期「匯出存檔檔案」，或把遊戲加到主畫面。</p>`;
  }

  function airport() {
    const S = G.S, iata = G.map.selected;
    if (!iata) return `<div class="empty"><b>尚未選取機場</b><p>點選地圖上的任何機場，查看跑道、宵禁、腹地人口與樞紐狀態。滾輪縮放可顯示更多中小型機場。</p></div>`;
    const ap = G.AP[iata], cf = G.curfew(ap), hub = S.hubs[iata];
    const hubIatas = Object.keys(S.hubs);
    const routesHere = S.routes.filter((r) => r.a === iata || r.b === iata);
    const pop = ap.popK >= 1000 ? (ap.popK / 1000).toFixed(1) + ' 百萬' : G.num(ap.popK) + ' 千';
    const hs = hub || routesHere.length ? G.hubStats(iata) : null;
    const subTxt = (h) => (h.subs ? `（另有子公司 ${h.subs.toFixed(1)} 班，算進你的集團）` : '');
    return `
      <header class="ap-head">
        <div class="iata">${ap.iata}</div>
        <div><h2>${esc(ap.name)}</h2><p>${esc(ap.city)} · ${esc(G.countryZh(ap.cc))}</p></div>
      </header>
      <dl class="facts">
        <dt>機場等級</dt><dd>${G.SIZE_ZH[ap.size]}${ap.mil ? '<span class="chip warn">軍民合用</span>' : ''}<small class="src">${G.SIZE_DESC[ap.size]}（最長跑道 ${ap.rwy ? G.num(ap.rwy) + ' 公尺' : '不詳'}）</small></dd>
        <dt>機場類型</dt><dd>${G.ROLE_ZH[ap.role || 0]}<small class="src">${G.ROLE_DESC[ap.role || 0]}${ap.role === 2 ? `：${G.allowedIntl(ap).map((x) => `${x.iata} ${esc(x.city)}`).join('、')}` : ''}</small></dd>
        <dt>ICAO</dt><dd>${esc(ap.icao)}</dd>
        <dt>當地時間</dt><dd>${G.localTimeStr(ap, S.time)}　<small>${esc(ap.tz || '依經度估算')}</small></dd>
        <dt>宵禁</dt><dd>${cf ? `<span class="chip curfew">${cf.from}–${cf.to}</span> ${esc(cf.note)}${cf.src === 'verify' ? '<small>（待校對）</small>' : ''}` : '無'}</dd>
        <dt>腹地人口</dt><dd>約 ${pop} 人</dd>
        <dt>人均 GDP 係數</dt><dd>${G.wealth(ap.cc).toFixed(2)}</dd>
        <dt>其他航空每日離場</dt><dd>約 ${G.num(Math.round(G.hubStats(iata).base))} 班<small class="src">${G.hubStats(iata).est ? '這座機場沒有航空公司航線資料，依腹地人口估算' : '依在此營運的航空公司目前的班次即時加總；已被你整合的航空公司不計'}</small></dd>
        ${hs && !hub ? `<dt>你的航班占比</dt><dd>${pct(hs.share)}<small class="src">你的每日離場 ${hs.deps.toFixed(1)} 班${subTxt(hs)}</small></dd>` : ''}
      </dl>
      ${hub ? `<div class="callout hub"><b>${hub.type === 'primary' ? '主要樞紐' : '次要樞紐'}${hs.fortress ? '・要塞樞紐' : ''}</b><p>你的每日離場 ${hs.deps.toFixed(1)} 班${subTxt(hs)}，占機場 ${pct(hs.share)}${hub.type === 'primary' ? `（超過 ${pct(G.FORTRESS_SHARE)} 升格為要塞樞紐）` : ''}</p><button class="btn" data-act="go" data-tab="hubs">管理樞紐</button></div>` : ''}
      <div class="row-btns">
        ${hubIatas.length && !hub ? `<button class="btn primary" data-act="route-new" data-b="${iata}">開設航線到這裡</button>` : ''}
        ${hub ? `<button class="btn primary" data-act="route-new-from" data-a="${iata}">從這裡開設航線</button>` : ''}
        ${!hub || hub.type !== 'primary' ? `<button class="btn" data-act="hub-set" data-iata="${iata}" data-type="primary">設為主要樞紐（${G.money(G.hubFee(ap, 'primary') - (hub ? G.hubFee(ap, 'secondary') : 0))}）</button>` : ''}
        ${!hub ? `<button class="btn" data-act="hub-set" data-iata="${iata}" data-type="secondary">設為次要樞紐（${G.money(G.hubFee(ap, 'secondary'))}）</button>` : ''}
      </div>
      ${U.airportExtra ? U.airportExtra(ap) : ''}
      ${routesHere.length ? `<h3>你在此的航線</h3>${routesHere.map(routeLine).join('')}` : ''}`;
  }

  function routeLine(r) {
    const n = G.routeAircraft(r).length;
    return `<button class="list-row" data-act="route-open" data-id="${r.id}"><span class="pair">${r.a} ⇄ ${r.b}</span><span>${G.num(G.dist(G.AP[r.a], G.AP[r.b]))} 公里</span><span>${n} 架</span></button>`;
  }

  function mxBars(ac) {
    return `<div class="mx">${G.CHECK_LEVELS.map((lv) => {
      const c = G.CHECKS[lv], r = ac.mx[lv] / c.interval, at = G.S.maintPolicy[lv];
      const cls = r > 1 ? 'over' : r >= (at.at / c.interval) * 0.9 ? 'due' : '';
      return `<div class="mxb ${cls}" title="${c.name}：距上次 ${G.num(ac.mx[lv])} 小時／間隔 ${G.num(c.interval)} 小時"><span>${lv}</span><i><b style="width:${Math.min(100, r * 100)}%"></b></i><em>${r > 1 ? '逾期 ' + Math.round((r - 1) * 100) + '%' : G.num(c.interval - ac.mx[lv]) + 'h'}</em></div>`;
    }).join('')}</div>`;
  }
  function policyCard() {
    const P = G.S.maintPolicy, on = P.enabled !== false;
    const head = `<header><label class="switch"><input type="checkbox" id="mx-master" data-act="mx-master" ${on ? 'checked' : ''}><span></span><b>自動維修${on ? '已開啟' : '已關閉'}</b></label>
      <button class="btn sm" data-act="policy-toggle">${U.policyOpen ? '收合' : '調整設定'}</button></header>
      <p class="meta">${on ? `飛機累計時數到達設定值時，下次回到樞紐就自動進場檢查：${G.CHECK_LEVELS.map((lv) => `${lv} ${P[lv].auto ? G.num(P[lv].at) + 'h' : '手動'}`).join(' · ')}` : '所有檢查都需要手動安排，逾期風險自行承擔。'}</p>`;
    if (!U.policyOpen) return `<section class="policy">${head}</section>`;
    return `<section class="policy">${head}
      <label class="chk"><input type="checkbox" id="mx-hangar" data-act="mx-hangar" ${P.useHangar !== false ? 'checked' : ''}> C／D 檢自動調機到有足夠維修棚廠的樞紐（避免委外費用 ×1.5）</label>
      <p class="meta">設定超過標準間隔可以省下停場時間，但逾期越多風險越高。個別飛機可以在下方卡片關閉自動維修。</p>
      ${G.CHECK_LEVELS.map((lv) => { const c = G.CHECKS[lv]; return `<div class="prow">
        <label class="chk"><input type="checkbox" id="pa-${lv}" data-act="policy-auto" data-lv="${lv}" ${P[lv].auto ? 'checked' : ''}> ${c.name}</label>
        <input type="number" id="ph-${lv}" min="${Math.round(c.interval * 0.5)}" max="${Math.round(c.interval * 1.5)}" step="${lv === 'A' ? 50 : 100}" value="${P[lv].at}" data-act="policy-at" data-lv="${lv}" aria-label="${c.name}觸發時數" ${P[lv].auto ? '' : 'disabled'}>
        <small>小時（標準 ${G.num(c.interval)}）· 約 ${G.money(c.cost)} 起 · ${c.desc}${c.hangar ? `；需 ${c.hangar} 級維修棚廠，否則委外` : ''}</small>
      </div>`; }).join('')}
    </section>`;
  }
  function fleet() {
    const S = G.S;
    const rowOf = (ac) => {
      const t = G.TYPES[ac.type], r = S.routes.find((x) => x.id === ac.route);
      let where = ac.loc;
      if (ac.st === 'air' || ac.st === 'sched') where = `${G.legFno(ac) ? `<b class="fno">${G.legFno(ac)}</b> ` : ''}${ac.leg.from} → ${ac.leg.to}`;
      const eta = ac.st === 'air' ? `抵達 ${G.localTimeStr(G.AP[ac.leg.to], ac.leg.arr)}` : ac.st === 'sched' ? `起飛 ${G.localTimeStr(G.AP[ac.leg.from], ac.leg.dep)}${ac.waitCurfew ? '（宵禁等待）' : ''}` : '';
      const ll = ac.lastLeg;
      let stTxt = ST_ZH[ac.st];
      if (ac.st === 'maint') stTxt = `${G.CHECKS[ac.mxLv].name}中 · 剩 ${dur(ac.mxUntil - S.time)}`;
      if (ac.st === 'aog') stTxt = `故障修理 · 剩 ${dur(ac.aogUntil - S.time)}`;
      if (ac.st === 'refit') stTxt = `客艙改裝 · 剩 ${dur(ac.refitUntil - S.time)}`;
      if (ac.st === 'refurb') stTxt = `${ac.refurbQueue && ac.refurbQueue.out ? '委外' : ''}整修 · 剩 ${dur(ac.refurbUntil - S.time)}`;
      if (ac.st === 'air' && ac.leg.emergency) stTxt = '緊急轉降中';
      const tags = (ac.refurbQueue && ac.st !== 'refurb' ? `<span class="chip warn">待整修${ac.refurbQueue.at ? '（' + ac.refurbQueue.at + '）' : '（委外）'}</span>` : '') + (ac.refitQueue && ac.st !== 'refit' ? `<span class="chip warn">待改裝 ${G.money(ac.refitQueue.cost)}</span>` : '') + (ac.charter ? '<span class="chip warn">政府包機任務</span>' : '') + (ac.grounded ? '<span class="chip curfew">稽查停飛</span>' : '') + (ac.mxQueue ? `<span class="chip warn">待${G.CHECKS[ac.mxQueue].name}</span>` : '') + (ac.leg && ac.leg.delayed >= 60 && ac.st === 'sched' ? `<span class="chip warn">機械延誤</span>` : '');
      return `<article class="ac ${ac.st}${ac.grounded ? ' grounded' : ''}">
        <header><b>${esc(ac.reg)}</b><span>${esc(t.model)}</span><span class="st">${stTxt}</span></header>
        ${U.acThumb ? U.acThumb(ac) : ''}
        <p>${where} <small>${eta}</small>${tags}</p>
        ${mxBars(ac)}
        <p class="meta">${t.freighter ? `全貨機 · 酬載 ${t.cargo} 噸` : `${G.cabinSeats(ac.cabin)} 座`} · ${ac.mode === 'buy' ? '自有' : '租賃 ' + G.money(ac.lease) + '/月'}${ac.cond != null ? ` · 機況 <b class="${ac.cond < 0.7 ? 'neg' : ''}">${Math.round(ac.cond * 100)}%</b>` : ''}${ac.usedBuy ? ' · 二手' : ''} · 累計 ${G.num(ac.hours)} 小時／${G.num(ac.cycles)} 起降${ll ? ` · 上一航段載客 ${ll.pax}/${ll.seats}` : ''}</p>
        <div class="row-btns">
          <select id="as-${ac.id}" data-act="assign" data-id="${ac.id}" aria-label="指派航線">
            <option value="">未指派航線</option>
            ${S.routes.map((x) => `<option value="${x.id}" ${x.id === ac.route ? 'selected' : ''}>${x.a} ⇄ ${x.b}${x.fno ? ' · ' + G.fno(x.fno.out) : ''}</option>`).join('')}
          </select>
          <select id="mxr-${ac.id}" data-act="mx-request" data-id="${ac.id}" aria-label="安排檢查" ${ac.st === 'maint' ? 'disabled' : ''}>
            <option value="">安排檢查…</option>
            ${G.CHECK_LEVELS.map((lv) => `<option value="${lv}">${G.CHECKS[lv].name}（${G.money(G.checkPlan(t, lv, G.hangarLevel(ac.loc)).cost)}）</option>`).join('')}
          </select>
          <label class="chk sm"><input type="checkbox" id="amx-${ac.id}" data-act="ac-automx" data-id="${ac.id}" ${ac.autoMx !== false ? 'checked' : ''} ${G.S.maintPolicy.enabled === false ? 'disabled' : ''}> 自動維修</label>
          ${t.freighter ? '' : `<button class="btn sm" data-act="cabin" data-id="${ac.id}">艙等配置</button>`}
          <button class="btn sm" data-act="reg-edit" data-id="${ac.id}">改編號</button>
          ${ac.st !== 'refurb' && !ac.refurbQueue && G.refurbPlan(ac, 2) ? `<button class="btn sm" data-act="refurb" data-id="${ac.id}">整修</button>` : ''}
          ${ac.refurbQueue && ac.st !== 'refurb' ? `<button class="btn sm" data-act="refurb-cancel" data-id="${ac.id}">取消整修</button>` : ''}
          ${ac.refitQueue && ac.st !== 'refit' ? `<button class="btn sm" data-act="refit-cancel" data-id="${ac.id}">取消改裝</button>` : ''}
          <button class="btn sm" data-act="locate" data-id="${ac.id}">定位</button>
          ${U.acButtons ? U.acButtons(ac) : ''}
          <button class="btn sm danger" data-act="sell" data-id="${ac.id}">${ac.mode === 'buy' ? '出售' : '退租'}</button>
        </div>
      </article>`;
    };
    const rows = S.fleet.length ? [U.fleetBody ? U.fleetBody(S.fleet, rowOf) : S.fleet.map(rowOf).join('')] : [];
    return `<div class="row-btns"><button class="btn primary" data-act="buy">選購飛機</button></div>
      ${S.fleet.length ? policyCard() : ''}
      ${rows.length ? rows.join('') : '<div class="empty"><b>機隊還是空的</b><p>新機與二手機都可以購買或租賃。租賃只需兩個月保證金，適合剛起步的公司。</p></div>'}`;
  }

  function routes() {
    const S = G.S;
    if (!S.routes.length) return `<div class="empty"><b>還沒有航線</b><p>點選地圖上的機場，再從機場資訊開設航線。每條航線必須從你的樞紐出發。</p></div>`;
    const rowOf = (r) => {
      const A = G.AP[r.a], B = G.AP[r.b], d = G.dist(A, B), st = r.stats;
      const lf = st.seats ? st.pax / st.seats : 0;
      const open = U.expanded[r.id];
      const freq = G.routeFreq(r);
      const acs = G.routeAircraft(r);
      const focus = G.focusCities()[G.cityKey(B)];
      return `<article class="route ${open ? 'open' : ''}">
        <button class="route-head" data-act="route-toggle" data-id="${r.id}" aria-expanded="${!!open}">
          <span class="pair">${r.a} ⇄ ${r.b}${r.fno ? `<small class="fno">${G.routeFno(r)}</small>` : ''}${r.gov ? '<span class="chip warn">補貼航線</span>' : ''}${U.routeRivalChip ? U.routeRivalChip(r) : ''}${U.routeAdviceChip ? U.routeAdviceChip(r) : ''}${G.routeRoleWhy(G.AP[r.a], G.AP[r.b]) ? '<span class="chip" title="v0.6.3 前開設，依新的機場類型規則已不能新開，但可繼續營運">舊制航線</span>' : ''}</span>
          <span>${G.num(d)} 公里</span>
          <span>每日 ${freq.toFixed(1)} 班</span>
          <span class="${st.rev - st.cost < 0 ? 'neg' : 'pos'}">${st.flights ? G.money(st.rev - st.cost) : '—'}</span>
        </button>
        ${open ? `<div class="route-body">
          <p class="sub">${esc(A.city)} → ${esc(B.city)}（${esc(G.countryZh(B.cc))}）${focus ? '<span class="chip">重點城市</span>' : ''}${G.curfew(A) || G.curfew(B) ? '<span class="chip curfew">含宵禁機場</span>' : ''}</p>
          <dl class="facts">
            <dt>本月航班</dt><dd>${st.flights}</dd>
            <dt>本月載客率</dt><dd>${st.seats ? pct(lf) : '—'}</dd>
            <dt>本月營收</dt><dd>${G.money(st.rev)}</dd>
            <dt>本月直接成本</dt><dd>${G.money(st.cost)}</dd>
            <dt>本月乘客滿意度</dt><dd>${st.pax ? pct(st.satSum / st.pax) : '—'}</dd>
            <dt>本月延誤航班</dt><dd>${st.delays || 0}</dd>
            <dt>本月取消航班</dt><dd>${st.cancels || 0}</dd>
            <dt>單向每日總市場</dt><dd>約 ${G.num(G.routeMarket(A, B))} 人</dd>
            ${U.segFacts ? U.segFacts(A, B) : ''}
            ${U.routeFacts ? U.routeFacts(r) : ''}
          </dl>
          ${U.routeAdviceBox ? U.routeAdviceBox(r) : ''}
          ${U.routeExtra ? U.routeExtra(r) : ''}
          <h4>航班編號</h4>
          <div class="fno-edit"><span class="fno-pair"><span>${esc(S.company.code)}</span><input type="number" id="fno-o-${r.id}" min="1" max="9999" value="${r.fno ? r.fno.out : ''}" aria-label="去程航班編號"><small>${r.a}→${r.b}</small></span>
            <span class="fno-pair"><span>${esc(S.company.code)}</span><input type="number" id="fno-b-${r.id}" min="1" max="9999" value="${r.fno ? r.fno.back : ''}" aria-label="回程航班編號"><small>${r.b}→${r.a}</small></span>
            <button class="btn sm" data-act="fno-save" data-id="${r.id}">更新</button></div>
          <div class="fare-head"><h4>票價（相對參考票價）</h4>
            <label class="switch sm"><input type="checkbox" id="af-${r.id}" data-act="auto-fare" data-id="${r.id}" ${r.autoFare ? 'checked' : ''}><span></span>自動最佳定價</label></div>
          <p class="note">${r.autoFare ? '依每架飛機的艙等座位數與座椅等級，每天自動調整到期望營收最高的票價；手動拖曳任一票價就會改回手動。' : '手動定價中。開啟「自動最佳定價」，或按下方按鈕套用一次建議票價。'}${r.fareCap && r.fareCap.Y != null ? ` 補貼合約規定${esc(cname('Y'))}不得高於 ${Math.round(r.fareCap.Y * 100)}%。` : ''}</p>
          ${G.CLASSES.map((c) => `<label class="slider"><span>${esc(cname(c))}<small>${G.money(G.refFare(d, c) * r.fare[c])}</small></span>
            <input type="range" id="fare-${r.id}-${c}" min="0.6" max="${r.fareCap && r.fareCap[c] != null ? r.fareCap[c] : 1.6}" step="0.02" value="${r.fare[c]}" data-act="fare" data-id="${r.id}" data-c="${c}"><output>${Math.round(r.fare[c] * 100)}%</output></label>`).join('')}
          ${!r.autoFare && acs.length ? `<div class="row-btns"><button class="btn sm" data-act="fare-opt" data-id="${r.id}">套用建議票價</button></div>` : ''}
          <h4>執飛飛機</h4>
          ${acs.length ? acs.map((ac) => `<p class="meta">${esc(ac.reg)} · ${esc(G.TYPES[ac.type].model)} · ${ST_ZH[ac.st]}</p>`).join('') : '<p class="meta">尚未指派飛機，到「機隊」為飛機選擇這條航線。</p>'}
          <div class="row-btns"><button class="btn danger" data-act="route-close" data-id="${r.id}">停飛航線</button></div>
        </div>` : ''}
      </article>`;
    };
    return U.routesBody ? U.routesBody(S.routes, rowOf) : S.routes.map(rowOf).join('');
  }

  function hubs() {
    const S = G.S;
    const focus = G.focusCities();
    return Object.entries(S.hubs).map(([iata, h]) => {
      const ap = G.AP[iata], hs = G.hubStats(iata);
      return `<article class="hubcard">
        <header><div class="iata">${iata}</div><div><h2>${esc(ap.city)}</h2><p>${h.type === 'primary' ? '主要樞紐' : '次要樞紐'}${hs.fortress ? ' · <b class="pos">要塞樞紐</b>' : ''}</p></div></header>
        <div class="meter" role="img" aria-label="航班占比 ${pct(hs.share)}"><i style="width:${Math.min(100, hs.share * 100)}%"></i><b style="left:${G.FORTRESS_SHARE * 100}%"></b></div>
        <p class="meta">你的每日離場 ${hs.deps.toFixed(1)} 班${hs.subs ? `＋子公司 ${hs.subs.toFixed(1)} 班` : ''}／其他航空約 ${G.num(Math.round(hs.base))} 班 · 占比 ${pct(hs.share)}${h.type === 'primary' ? `，超過 ${pct(G.FORTRESS_SHARE)} 升格要塞樞紐` : ''}</p>
        ${Object.entries(G.UPGRADES).map(([k, u]) => `<div class="upg"><div><b>${u.name}</b> <span class="lv">${'●'.repeat(h.upgrades[k])}${'○'.repeat(u.max - h.upgrades[k])}</span><p class="meta">${u.desc}；每級月費 ${G.money(u.upkeep)}</p></div>
          <button class="btn sm" data-act="upgrade" data-iata="${iata}" data-k="${k}" ${h.upgrades[k] >= u.max ? 'disabled' : ''}>${h.upgrades[k] >= u.max ? '已滿級' : '升級 ' + G.money(u.cost)}</button></div>`).join('')}
        ${U.hubExtra ? U.hubExtra(iata) : ''}
        <div class="row-btns">
          ${h.type !== 'primary' ? `<button class="btn" data-act="hub-set" data-iata="${iata}" data-type="primary">升為主要樞紐</button><button class="btn danger" data-act="hub-remove" data-iata="${iata}">撤銷樞紐</button>` : ''}
          <button class="btn" data-act="select" data-iata="${iata}">在地圖上查看</button>
        </div>
      </article>`;
    }).join('') + `<p class="note">在地圖上點選任一機場，即可設為主要或次要樞紐。主要樞紐只能有一個；更換主要樞紐時，原主要樞紐會改為次要樞紐。${Object.keys(focus).length ? '' : '從兩個不同樞紐飛往同一城市，該城市會成為重點城市，提升攬客力。'}</p>`;
  }

  function finance() {
    const S = G.S;
    const d = S.day;
    const costNow = Object.entries(d.cost).filter(([k]) => !G.ONE_OFF.includes(k)).reduce((s, [, v]) => s + v, 0);
    const days = S.days.slice(-60);
    let spark = '';
    if (days.length > 1) {
      const vals = days.map((x) => x.cash), mn = Math.min(...vals), mx = Math.max(...vals), w = 320, h = 70;
      const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 6 - ((v - mn) / (mx - mn || 1)) * (h - 12)}`).join(' ');
      spark = `<figure class="spark"><figcaption>近 ${days.length} 日現金</figcaption><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="0,${h} ${pts} ${w},${h}" class="area"/><polyline points="${pts}" class="line"/></svg><div class="axis"><span>${G.money(mn)}</span><span>${G.money(mx)}</span></div></figure>`;
    }
    const months = S.months.slice(-6).reverse();
    const cats = Object.keys(COST_ZH);
    return `
      <section class="kpis">
        <div><span>現金</span><b class="${S.cash < 0 ? 'neg' : ''}">${G.money(S.cash, 2)}</b><em>起始資金 ${G.money(G.START_CASH)}</em></div>
        <div><span>今日營收</span><b>${G.money(d.rev)}</b><em>今日營運成本 ${G.money(costNow)}</em></div>
      </section>
      ${spark}
      <h3>月度損益表</h3>
      ${months.length ? `<div class="table-wrap"><table>
        <thead><tr><th>項目</th>${months.map((m) => `<th>${m.y}/${String(m.m).padStart(2, '0')}</th>`).join('')}</tr></thead>
        <tbody>
          <tr class="strong"><td>營收</td>${months.map((m) => `<td>${G.money(m.rev)}</td>`).join('')}</tr>
          <tr><td>　其中付費餐點收入</td>${months.map((m) => `<td>${m.anc ? G.money(m.anc) : '—'}</td>`).join('')}</tr>
          ${cats.filter((c) => !G.ONE_OFF.includes(c)).map((c) => `<tr><td>${COST_ZH[c]}</td>${months.map((m) => `<td>${m.cost[c] ? '-' + G.money(m.cost[c]) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr class="strong"><td>營業損益</td>${months.map((m) => { const op = m.rev - cats.filter((c) => !G.ONE_OFF.includes(c)).reduce((s, c) => s + (m.cost[c] || 0), 0); return `<td class="${op < 0 ? 'neg' : 'pos'}">${G.money(op)}</td>`; }).join('')}</tr>
          <tr><td>其他收入（出售飛機、保險理賠）</td>${months.map((m) => `<td>${m.other ? G.money(m.other) : '—'}</td>`).join('')}</tr>
          ${G.ONE_OFF.map((c) => `<tr><td>${COST_ZH[c]}</td>${months.map((m) => `<td>${m.cost[c] ? '-' + G.money(m.cost[c]) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td>載客人次</td>${months.map((m) => `<td>${G.num(m.pax)}</td>`).join('')}</tr>
          <tr><td>航班數</td>${months.map((m) => `<td>${G.num(m.flights)}</td>`).join('')}</tr>
        </tbody></table></div>` : '<p class="note">第一個月結束後會出現月度損益表。</p>'}
      <p class="note">第一階段的財務是簡化版損益表；資產負債表、現金流量表、折舊與貸款會在之後的階段加入。</p>`;
  }

  // ---------- 對話框 ----------
  U.modal = (html, cls) => {
    const m = $('#modal');
    $('#modal-box').className = cls || '';
    $('#modal-box').innerHTML = html + '<button class="close" data-act="modal-close" aria-label="關閉">×</button>';
    m.hidden = false;
    const f = $('#modal-box').querySelector('input,select,button');
    if (f) f.focus();
  };
  U.closeModal = () => { $('#modal').hidden = true; };

  let buyFilter = 'all';
  U.buyDialog = () => {
    const S = G.S;
    const groups = {};
    window.AIRCRAFT.forEach((t) => {
      if (buyFilter !== 'all' && (buyFilter === 'used' ? !t.used : t.body !== buyFilter)) return;
      (groups[t.mfr] = groups[t.mfr] || []).push(t);
    });
    const filters = [['all', '全部'], ['turboprop', '渦輪螺旋槳'], ['regional', '區域噴射機'], ['narrow', '窄體機'], ['wide', '寬體機'], ['used', '二手機']];
    U.modal(`<h2>選購飛機</h2>
      <p class="sub">現金 ${G.money(S.cash, 2)}。新飛機會停放在主要樞紐 ${G.primaryHub()}。</p>
      <label class="field reg-field">飛機編號（選填，留白自動編為 ${esc(G.defaultReg())}）<input id="buy-reg" maxlength="10" placeholder="${esc(G.regHint())}" autocomplete="off" value="${esc(U.regDraft || '')}"></label>
      <div class="seg" role="group" aria-label="機種篩選">${filters.map(([k, n]) => `<button data-act="buy-filter" data-k="${k}" aria-pressed="${k === buyFilter}">${n}</button>`).join('')}</div>
      <div class="table-wrap"><table class="catalog">
        <thead><tr><th>機型</th><th>最多座位</th><th>航程</th><th>跑道需求</th><th>油耗/時</th><th>價格</th><th>月租</th><th></th></tr></thead>
        <tbody>${Object.entries(groups).map(([mfr, ts]) => `<tr class="grp"><td colspan="8">${G.ZH(mfr)}</td></tr>` + ts.map((t) => `<tr>
          <td><b>${esc(t.model)}</b>${t.used ? '<span class="chip">二手</span>' : ''}${G.restrictionTags(t).map((x) => `<span class="chip warn">${x}</span>`).join('')}<small>${t.wide ? '寬體 · 4 艙等' : '3 艙等'}</small></td>
          <td data-l="最多座位">${t.maxSeats}</td><td data-l="航程">${G.num(t.range)} km</td><td data-l="跑道需求">${G.num(t.rwy)} m</td><td data-l="油耗/時">${G.num(t.fuel)} kg</td>
          <td data-l="價格">${G.money(t.price * 1e6)}</td><td data-l="月租">${G.money(G.leaseMonthly(t))}</td>
          <td class="btns"><button class="btn sm primary" data-act="acquire" data-t="${t.id}" data-mode="buy" ${S.cash < t.price * 1e6 ? 'disabled' : ''}>購買</button><button class="btn sm" data-act="acquire" data-t="${t.id}" data-mode="lease">租賃</button></td>
        </tr>`).join('')).join('')}</tbody></table></div>`, 'wide');
  };
  G.ZH = (mfr) => `${window.MFR_ZH[mfr]}${window.MFR_ZH[mfr] !== mfr ? ' ' + mfr : ''}`;

  let cabinDraft = null;
  U.getCabinDraft = () => cabinDraft;
  U.redrawCabin = () => drawCabin();
  U.cabinDialog = (acId) => {
    const ac = G.S.fleet.find((a) => a.id === acId), t = G.TYPES[ac.type];
    cabinDraft = { acId, cabin: JSON.parse(JSON.stringify(ac.cabin)) };
    drawCabin();
  };
  function drawCabin() {
    const ac = G.S.fleet.find((a) => a.id === cabinDraft.acId), t = G.TYPES[ac.type], cab = cabinDraft.cabin;
    const u = G.cabinUsage(t, cab);
    const over = u.units > t.units + 0.01 || u.seats > t.maxSeats;
    const cls = G.classesFor(t);
    U.modal(`<h2>艙等配置 · ${esc(ac.reg)}</h2>
      <p class="sub">${esc(t.model)}：機艙容量 ${t.units} 座位單位，逃生認證上限 ${t.maxSeats} 座。等級越高的座椅占用越多空間，也帶來更高滿意度與攬客力。</p>
      <div class="capbar ${over ? 'over' : ''}">${cls.map((c) => { const k = cab[c]; const w = k.seats * G.seatUnits(t, c, k.tier) / t.units * 100; return w > 0 ? `<i class="c-${c}" style="width:${Math.min(100, w)}%" title="${esc(cname(c))}"></i>` : ''; }).join('')}</div>
      <p class="capline ${over ? 'neg' : ''}">已用 ${u.units.toFixed(0)} / ${t.units} 單位 · ${u.seats} / ${t.maxSeats} 座${over ? ' · 超出容量，請減少座位或降低等級' : ''}</p>
      ${U.cabinExtra ? U.cabinExtra(ac, cab) : ''}
      ${cls.map((c) => { const k = cab[c]; const maxS = Math.floor(t.units / G.seatUnits(t, c, 0)); return `<div class="cabrow">
        <span class="swatch c-${c}"></span><b>${esc(cname(c))}</b>
        <input type="range" id="cs-${c}" min="0" max="${Math.min(t.maxSeats, maxS)}" value="${k.seats}" data-act="cab-seats" data-c="${c}" aria-label="${esc(cname(c))}座位數">
        <input type="number" id="cn2-${c}" min="0" max="${t.maxSeats}" value="${k.seats}" data-act="cab-seats" data-c="${c}" aria-label="${esc(cname(c))}座位數">
        <select id="ct-${c}" data-act="cab-tier" data-c="${c}" aria-label="${esc(cname(c))}等級">${G.TIERS.map((n, i) => `<option value="${i}" ${i === k.tier ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <small>${G.seatUnits(t, c, k.tier).toFixed(2)} 單位/座</small>
      </div>`; }).join('')}
      <div class="row-btns"><button class="btn" data-act="cab-preset" data-p="1">全經濟艙</button><button class="btn" data-act="cab-preset" data-p="2">兩艙</button><button class="btn" data-act="cab-preset" data-p="3">${t.wide ? '四艙' : '三艙'}</button>
      <span class="spacer"></span><button class="btn" data-act="cab-fill">經濟艙填滿剩餘空間</button><button class="btn primary" data-act="cab-save" ${over ? 'disabled' : ''}>${U.cabinSaveLabel ? U.cabinSaveLabel(ac, cab) : '儲存配置'}</button></div>`, 'wide');
  }
  // 拖曳座位數時就地更新，不重繪整個對話框
  function updateCabin(src) {
    const ac = G.S.fleet.find((a) => a.id === cabinDraft.acId), t = G.TYPES[ac.type], cab = cabinDraft.cabin;
    const u = G.cabinUsage(t, cab), over = u.units > t.units + 0.01 || u.seats > t.maxSeats;
    const c = src.dataset.c;
    [$('#cs-' + c), $('#cn2-' + c)].forEach((x) => { if (x && x !== src) x.value = cab[c].seats; });
    $('.capbar').className = 'capbar' + (over ? ' over' : '');
    $('.capbar').innerHTML = G.classesFor(t).map((k) => { const w = cab[k].seats * G.seatUnits(t, k, cab[k].tier) / t.units * 100; return w > 0 ? `<i class="c-${k}" style="width:${Math.min(100, w)}%"></i>` : ''; }).join('');
    const line = $('.capline');
    line.className = 'capline' + (over ? ' neg' : '');
    line.textContent = `已用 ${u.units.toFixed(0)} / ${t.units} 單位 · ${u.seats} / ${t.maxSeats} 座${over ? ' · 超出容量，請減少座位或降低等級' : ''}`;
    $('[data-act="cab-save"]').disabled = over;
    if (U.cabinExtraUpdate) U.cabinExtraUpdate(ac, cab);
  }
  function cabinPreset(p) {
    const ac = G.S.fleet.find((a) => a.id === cabinDraft.acId), t = G.TYPES[ac.type], cab = cabinDraft.cabin;
    G.classesFor(t).forEach((c) => (cab[c].seats = 0));
    if (p >= 2) cab.J.seats = Math.round((t.units * (t.wide ? 0.13 : 0.08)) / G.seatUnits(t, 'J', cab.J.tier));
    if (p >= 3) {
      cab.W.seats = Math.round((t.units * 0.08) / G.seatUnits(t, 'W', cab.W.tier));
      if (t.wide) cab.F.seats = Math.round((t.units * 0.06) / G.seatUnits(t, 'F', cab.F.tier));
    }
    fillY();
  }
  function fillY() {
    const ac = G.S.fleet.find((a) => a.id === cabinDraft.acId), t = G.TYPES[ac.type], cab = cabinDraft.cabin;
    cab.Y.seats = 0;
    const u = G.cabinUsage(t, cab);
    cab.Y.seats = Math.max(0, Math.min(t.maxSeats - u.seats, Math.floor((t.units - u.units) / G.seatUnits(t, 'Y', cab.Y.tier))));
    drawCabin();
  }

  U.routeDialog = (a, b) => {
    const S = G.S, hubs = Object.keys(S.hubs);
    if (!a) a = hubs.includes(G.primaryHub()) ? G.primaryHub() : hubs[0];
    const A = G.AP[a];
    const B = b ? G.AP[b] : null;
    const list = B ? null : G.AIRPORTS.filter((x) => x.iata !== a && x.size === 0 && !G.routeRoleWhy(A, x)).map((x) => ({ x, d: G.dist(A, x), m: G.routeMarket(A, x) })).sort((p, q) => q.m - p.m).slice(0, 10);
    let body = '';
    if (B) {
      const f = G.routeForecast(a, b);
      const types = [...new Set(S.fleet.map((ac) => ac.type))];
      const roleWhy = G.routeRoleWhy(A, B);
      const fit = roleWhy ? [] : window.AIRCRAFT.filter((t) => !G.canFly(t, A, B));
      const dev = U.devBox ? U.devBox(a, b) : '';
      body = `${dev}${roleWhy ? `<div class="callout warn"><b>這條航線不能開</b><p>${esc(roleWhy)}。</p></div>` : ''}<dl class="facts">
          <dt>距離</dt><dd>${G.num(f.dist)} 公里${U.pathNote ? U.pathNote(A, B) : ''}</dd>
          <dt>單向每日總市場</dt><dd>約 ${G.num(f.market)} 人（所有航空公司合計）</dd>
          <dt>宵禁</dt><dd>${[A, B].map((x) => G.curfew(x) ? `${x.iata} ${G.curfew(x).from}–${G.curfew(x).to}` : '').filter(Boolean).join('、') || '無'}</dd>
          <dt>開航費</dt><dd>${G.money(G.routeOpenFee(B) + G.routeOpenFee(A) / 2)}</dd>
          ${U.segFacts ? U.segFacts(A, B) : ''}
        </dl>
        <div class="table-wrap"><table><thead><tr><th>艙等</th><th>每日市場</th><th>觀光／商務</th><th>參考單程票價</th></tr></thead><tbody>
        ${G.CLASSES.map((c) => `<tr><td>${esc(cname(c))}</td><td>${G.num(f.classes[c].market)}</td><td>${G.num(f.classes[c].leisure)}／${G.num(f.classes[c].business)}</td><td>${G.money(f.classes[c].fare)}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">觀光客重 CP 值，對票價敏感；商務客幾乎不在意票價，但看重座椅等級、貴賓室、班次密度與準點。</p>
        ${U.rivalFacts ? U.rivalFacts(A, B) : ''}
        ${roleWhy ? '' : `<p class="sub">可執飛機型：${fit.length ? fit.map((t) => `${esc(t.model)}${types.includes(t.id) ? '（機隊已有）' : ''}`).join('、') : '沒有任何機型能飛這條航線'}</p>`}
        ${fit.length && !dev ? U.routeSetup(a, b) : ''}
        <div class="row-btns">${dev ? `<button class="btn primary" data-act="dev-open" data-a="${a}" data-b="${b}">前往這條航線</button>` : `<button class="btn primary" data-act="route-create" data-a="${a}" data-b="${b}" ${fit.length ? '' : 'disabled'}>開設 ${a} ⇄ ${b}</button>`}</div>`;
    } else {
      body = `<label class="search"><span>自選目的地</span><input id="route-search" type="search" placeholder="IATA 代碼、英文城市或機場名、中文國名，例如 DAD、Fukuoka、Narita、日本" autocomplete="off" data-a="${a}"></label>
        <div id="route-results"><p class="sub">推薦：${esc(A.city)} 出發、市場最大的 10 個大型機場。也可以直接在地圖上點選任一機場。</p>
        ${list.map((o) => U.destRow(a, o)).join('')}</div>`;
    }
    U.modal(`<h2>開設航線</h2>
      <label class="inline">出發樞紐 <select id="route-from" data-act="route-from" data-b="${b || ''}">${hubs.map((h) => `<option value="${h}" ${h === a ? 'selected' : ''}>${h} ${esc(G.AP[h].city)}</option>`).join('')}</select></label>
      ${B ? `<h3>${a} ⇄ ${b}　<small>${esc(A.city)} → ${esc(B.city)}</small></h3>` : ''}
      ${body}`);
  };

  // ---------- 企業標誌匯入：統一轉成 500×500 ----------
  U.pickLogo = (done) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return U.toast('圖片超過 8 MB，請換一張較小的圖片', true);
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          const w = im.naturalWidth || 500, h = im.naturalHeight || 500, side = Math.min(w, h);
          const cv = document.createElement('canvas'); cv.width = cv.height = 500;
          const cx = cv.getContext('2d');
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 500, 500);
          let url = cv.toDataURL('image/png');
          if (url.length > 600000) { const webp = cv.toDataURL('image/webp', 0.9); if (webp.startsWith('data:image/webp')) url = webp; }
          const note = w === 500 && h === 500 ? null : `原圖 ${w}×${h}，已${w !== h ? '置中裁切並' : ''}縮放為 500×500`;
          done(url, note);
        };
        im.onerror = () => U.toast('無法讀取這張圖片，請改用 PNG 或 JPG', true);
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  };
  U.eventDialog = (e) => {
    if (e.kind !== 'crash') return;
    U.modal(`<p class="eyebrow danger-ink">重大飛安事故</p><h2>${esc(e.reg)} 失事</h2>
      <p>${esc(e.msg)}</p>
      <dl class="facts"><dt>機上人數</dt><dd>${e.onboard}</dd><dt>罹難</dt><dd>${e.deaths}</dd><dt>受傷</dt><dd>${e.injuries}</dd><dt>賠償總額</dt><dd>${G.money(e.comp)}</dd><dt>社會評價</dt><dd>${G.S.rep.toFixed(0)}（-35）</dd></dl>
      ${e.grounded ? `<p class="sub">民航主管機關稽查後，${e.grounded} 架維修逾期的飛機停飛，完成檢查前只能空機調往樞紐。</p>` : ''}
      <div class="row-btns"><button class="btn primary" data-act="modal-close">了解</button><button class="btn" data-act="go-fleet-close">檢視機隊</button></div>`);
  };

  // 開航目的地列表的一列：標出沒有任何機型能飛的目的地
  U.destRow = (a, { x, d, m }) => {
    const A = G.AP[a], role = G.routeRoleWhy(A, x), can = !role && window.AIRCRAFT.some((t) => !G.canFly(t, A, x));
    return `<button class="list-row dest" data-act="route-pick" data-a="${a}" data-b="${x.iata}"><span class="pair">${x.iata}</span><span>${esc(x.city)} · ${esc(G.countryZh(x.cc))}${role ? ' <span class="chip warn">機場類型不符</span>' : can ? '' : ' <span class="chip">無機型可飛</span>'}${U.devChip ? U.devChip(a, x.iata) : ''}</span><span>${G.num(d)} km</span><span>${G.num(m)} 人/日</span></button>`;
  };
  U.searchDest = (a, q) => {
    const box = $('#route-results');
    if (!box) return;
    q = q.trim().toLowerCase();
    const A = G.AP[a];
    if (!q) {
      const rec = G.AIRPORTS.filter((x) => x.iata !== a && x.size === 0 && !G.routeRoleWhy(A, x)).map((x) => ({ x, d: G.dist(A, x), m: G.routeMarket(A, x) })).sort((p, r) => r.m - p.m).slice(0, 10);
      box.innerHTML = `<p class="sub">推薦：${esc(A.city)} 出發、市場最大的 10 個大型機場。</p>${rec.map((o) => U.destRow(a, o)).join('')}`;
      return;
    }
    const hits = G.AIRPORTS.filter((x) => x.iata !== a && (
      x.iata.toLowerCase() === q || x.icao.toLowerCase() === q || x.iata.toLowerCase().startsWith(q) ||
      x.city.toLowerCase().includes(q) || x.name.toLowerCase().includes(q) ||
      G.countryZh(x.cc).includes(q) || (window.COUNTRIES[x.cc] && window.COUNTRIES[x.cc][1].toLowerCase().includes(q)) ||
      false))
      .map((x) => ({ x, d: G.dist(A, x), m: G.routeMarket(A, x), exact: x.iata.toLowerCase() === q }))
      .sort((p, r) => (r.exact - p.exact) || (r.m - p.m)).slice(0, 30);
    box.innerHTML = hits.length ? `<p class="sub">找到 ${hits.length === 30 ? '30 個以上' : hits.length + ' 個'}機場，依市場大小排序。</p>${hits.map((o) => U.destRow(a, o)).join('')}` : '<p class="sub">找不到符合的機場。試試 IATA 代碼（例如 DAD）或英文城市名稱。</p>';
  };

  // ---------- 事件 ----------
  U.bind = () => {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'button')) {
        if (e.target.id === 'modal') U.closeModal();
        return;
      }
      act(el.dataset.act, el.dataset, el);
    });
    document.addEventListener('input', (e) => {
      const el = e.target, a = el.dataset.act;
      if (el.id === 'route-search') { U.searchDest(el.dataset.a, el.value); return; }
      if (a === 'fare') {
        const r = G.S.routes.find((x) => x.id === +el.dataset.id);
        r.fare[el.dataset.c] = +el.value;
        if (r.autoFare) { r.autoFare = false; const sw = document.getElementById('af-' + r.id); if (sw) sw.checked = false; }
        el.nextElementSibling.textContent = Math.round(el.value * 100) + '%';
        el.parentElement.querySelector('small').textContent = G.money(G.refFare(G.dist(G.AP[r.a], G.AP[r.b]), el.dataset.c) * r.fare[el.dataset.c]);
      }
      if (a === 'cab-seats') { cabinDraft.cabin[el.dataset.c].seats = Math.max(0, Math.round(+el.value || 0)); updateCabin(el); }
      if (el.dataset.cabinName) G.S.company.cabinNames[el.dataset.cabinName] = el.value.trim() || G.CLASS_DEFAULT_NAME[el.dataset.cabinName];
    });
    document.addEventListener('change', (e) => {
      const el = e.target, a = el.dataset.act;
      if (U.change3 && U.change3(el, a)) return;
      if (a === 'assign') { res(G.assign(+el.dataset.id, el.value ? +el.value : null), el.value ? '已指派航線' : '已解除指派'); U.render(); G.map.invalidate(); }
      if (a === 'mx-request' && el.value) { res(G.requestCheck(+el.dataset.id, el.value), '已安排檢查'); U.render(); }
      if (a === 'mx-master') { G.S.maintPolicy.enabled = el.checked; G.log(`自動維修${el.checked ? '開啟' : '關閉'}`); U.render(); }
      if (a === 'mx-hangar') { G.S.maintPolicy.useHangar = el.checked; }
      if (a === 'ac-automx') { const ac = G.S.fleet.find((x) => x.id === +el.dataset.id); ac.autoMx = el.checked; U.render(); }
      if (a === 'policy-auto') { G.setPolicy(el.dataset.lv, { auto: el.checked }); U.render(); }
      if (a === 'policy-at') { const lv = el.dataset.lv, c = G.CHECKS[lv]; const v = Math.max(c.interval * 0.5, Math.min(c.interval * 1.5, +el.value || c.interval)); G.setPolicy(lv, { at: v }); el.value = v; }
      if (a === 'cab-tier') { cabinDraft.cabin[el.dataset.c].tier = +el.value; drawCabin(); }
      if (a === 'route-from') U.routeDialog(el.value, el.dataset.b || null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').hidden) U.closeModal();
      if (e.key === ' ' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName) && G.S) { e.preventDefault(); G.setSpeed(G.speed ? 0 : G.lastSpeed || 1, { user: true }); }
    });
  };

  function act(a, d, el) {
    const S = G.S;
    switch (a) {
      case 'tab': U.go(d.tab); break;
      case 'go': U.go(d.tab); break;
      case 'speed': G.setSpeed(+d.speed, { user: true }); break;
      case 'next-day': G.nextDay(); break;
      case 'modal-close': U.closeModal(); break;
      case 'go-fleet-close': U.closeModal(); U.go('fleet'); break;
      case 'buy': U.buyDialog(); break;
      case 'acquire': {
        const regEl = $('#buy-reg'), reg = regEl ? regEl.value.trim() : '';
        const r = res(G.acquire(d.t, d.mode, null, reg || null));
        if (r.ok) { U.regDraft = ''; U.toast(`${G.TYPES[d.t].model}（${r.ac.reg}）已加入機隊`); U.tab = 'fleet'; U.render(); U.cabinDialog(r.ac.id); }
        break;
      }
      case 'cabin': U.cabinDialog(+d.id); break;
      case 'cab-preset': cabinPreset(+d.p); break;
      case 'cab-fill': fillY(); break;
      case 'cab-save': { const r = res(G.setCabin(cabinDraft.acId, cabinDraft.cabin), null); if (r.ok) { if (U.afterCabinSave) U.afterCabinSave(cabinDraft); U.toast(r.queued ? `已排入客艙改裝：${G.money(r.plan.cost)}、約 ${r.plan.days} 天，飛機下次停在樞紐時開工` : r.msg || '艙等配置已儲存'); U.closeModal(); U.render(); } break; }
      case 'sell': if (el.dataset.confirm) { res(G.sellAircraft(+d.id)); U.render(); G.map.invalidate(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認'; } break;
      case 'locate': { const ac = S.fleet.find((x) => x.id === +d.id); G.map.selected = ac.leg ? ac.leg.to : ac.loc; G.map.flyTo(G.map.selected); break; }
      case 'select': G.map.selected = d.iata; G.map.flyTo(d.iata); U.go('airport'); break;
      case 'hub-set': res(G.setHub(d.iata, d.type), '樞紐已設定'); U.render(); G.map.invalidate(); break;
      case 'hub-remove': res(G.removeHub(d.iata), '已撤銷樞紐'); U.render(); G.map.invalidate(); break;
      case 'upgrade': res(G.upgradeHub(d.iata, d.k), '升級完成'); U.render(); break;
      case 'route-new': U.routeDialog(null, d.b); break;
      case 'route-new-from': U.routeDialog(d.a, null); break;
      case 'route-pick': U.routeDialog(d.a, d.b); break;
      case 'route-create': {
        const out = +($('#rs-out') || {}).value, back = +($('#rs-back') || {}).value;
        const auto = $('#rs-auto') ? $('#rs-auto').checked : true;
        const pickAc = document.querySelector('input[name="rs-ac"]:checked');
        const r = res(G.openRoute(d.a, d.b, { fno: out && back ? { out, back } : null, autoFare: auto }));
        if (r.ok) {
          let msg = `${d.a} ⇄ ${d.b}（${G.routeFno(r.route)}）開航`;
          if (pickAc && pickAc.value) { const x = G.assign(+pickAc.value, r.route.id); if (x.ok) msg += `，已指派 ${G.S.fleet.find((q) => q.id === +pickAc.value).reg}`; }
          else msg += '，記得到機隊指派飛機';
          if (auto) G.optimizeFares(r.route);
          U.closeModal(); U.toast(msg); U.expanded[r.route.id] = true; U.go('routes'); G.map.invalidate();
        }
        break;
      }
      case 'route-open': U.expanded[d.id] = true; U.go('routes'); break;
      case 'route-toggle': U.expanded[d.id] = !U.expanded[d.id]; U.render(); break;
      case 'route-close': if (el.dataset.confirm) { G.closeRoute(+d.id); U.render(); G.map.invalidate(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認停飛'; } break;
      case 'save': { const ok = G.save({ force: true }); U.toast(ok ? `已存檔（第 ${G.activeSlot()} 欄）` : `無法存檔：${G.lastSaveError || '這個環境不能使用瀏覽器儲存空間'}`, !ok); break; }
      case 'export': {
        const txt = G.exportSave();
        const done = () => U.toast('存檔代碼已複製');
        if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => U.modal(`<h2>存檔代碼</h2><textarea id="exp" readonly rows="8">${esc(txt)}</textarea>`));
        else U.modal(`<h2>存檔代碼</h2><textarea id="exp" readonly rows="8">${esc(txt)}</textarea>`);
        break;
      }
      case 'import': U.modal(`<h2>貼上存檔代碼</h2><textarea id="imp" rows="8" placeholder="貼上先前複製的存檔代碼"></textarea><div class="row-btns"><button class="btn primary" data-act="import-go">載入</button></div>`); break;
      case 'import-go': try { G.importSave($('#imp').value); G.ensureLogo(); U.closeModal(); U.toast('存檔已載入'); G.map.invalidate(); U.render(); } catch (e) { U.toast('存檔代碼格式不正確', true); } break;
      case 'policy-toggle': U.policyOpen = !U.policyOpen; U.render(); break;
      case 'logo-pick': U.pickLogo((url, note) => { G.setLogo(url); U.toast(note || '企業標誌已更新'); U.render(); U.updateTop(); G.map.invalidate(); }); break;
      case 'logo-clear': G.setLogo(null); U.render(); U.updateTop(); G.map.invalidate(); break;
      case 'logo-auto': { const a = G.S.company.logoAuto; const g = G.autoLogo(a ? a.seed + 1 : 0); U.toast(`已換成自動產生的「${g.style.name}」樣式`); U.render(); U.updateTop(); G.map.invalidate(); break; }
      default: if (U.act3) U.act3(a, d, el); break;
      case 'newgame': if (el.dataset.confirm) { G.setSpeed(0); G.S = null; G.wipe(); G.showIntro(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次：刪除存檔並重新開始'; } break;
    }
  }
})();
