// v1.0.0 介面：轉機、貨運、季節、子品牌、時刻帶、訂單排隊、併購、難度、排行榜、塗裝編輯器、航線歷史圖、地圖圖層。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const N = (v) => G.num(Math.round(v));
  const pct = (v) => Math.round(v * 100) + '%';
  const DAY = 86400000;
  const MON = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const ymd = (t) => new Date(t).toISOString().slice(0, 10);
  const res = (r, ok) => { if (r && r.ok === false) U.toast(r.msg || '無法執行', true); else if (ok) U.toast(ok); return r; };
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 略過 */ } } };

  // ====================================================================
  // 總覽：v1.0 營運摘要
  // ====================================================================
  G.companyValue = () => { const st = G.S.fin.stock; return st && st.listed ? st.price * st.shares : G.fairValue(); };
  const ov0 = U.overviewExtra;
  U.overviewExtra = () => {
    const S = G.S, last = S.days[S.days.length - 1] || {};
    const D = G.DIFF[S.diff || 'normal'];
    const ord = (S.orders || []).slice().sort((a, b) => a.due - b.due);
    const subs = S.mna ? S.mna.subs : [];
    const card = `<section class="v10card">
      <header><b>營運概況</b><span class="chip">${esc(D.name)}難度</span><span class="spacer"></span><button class="btn sm" data-act="m-board">排行榜</button><button class="btn sm" data-act="m-livery">塗裝</button></header>
      <div class="v10grid">
        <div><span>昨日轉機旅客</span><b>${N(last.xfer || 0)}</b><em>${last.pax ? pct((last.xfer || 0) / last.pax) + ' 的旅客' : '—'}</em></div>
        <div><span>昨日貨運</span><b>${M(last.cargo || 0)}</b><em>${N(last.tons || 0)} 公噸</em></div>
        <div><span>訂單</span><b>${ord.length} 架</b><em>${ord.length ? `下一架 ${ymd(ord[0].due)}` : '沒有排隊中的訂單'}</em></div>
        <div><span>子公司</span><b>${subs.length} 家</b><em>${subs.length ? M(subs.reduce((s, x) => s + x.book, 0)) + ' 帳面' : '可在「競爭」發動併購'}</em></div>
      </div>
      <p class="note">${esc(seasonLine(S.time))}</p>
    </section>`;
    return card + (ov0 ? ov0() : '');
  };
  function seasonLine(t) {
    const m = new Date(t).getUTCMonth() + 1;
    const peak = { 1: '寒假與農曆年前後，觀光需求偏高', 2: '農曆新年假期帶來返鄉與出遊人潮', 3: '春季淡季，商務需求回升', 4: '春假與賞櫻旺季', 5: '日本黃金週後轉為平季', 6: '暑假前的平季', 7: '暑假旺季，觀光需求最高', 8: '暑假旺季，觀光需求最高', 9: '暑假結束，觀光淡季、商務回升', 10: '秋季商務旺季、年底貨運旺季開始', 11: '淡季；貨運迎來年底旺季（黑色星期五）', 12: '耶誕與跨年，觀光與貨運都很忙' }[m];
    return `季節：${peak}。南半球的季節相反，熱帶地區的季節差異較小。`;
  }

  // ====================================================================
  // 機隊：塗裝縮圖、訂單、全貨機
  // ====================================================================
  // 機隊卡片：只標示子航空公司與全貨機（塗裝只顯示在地圖上）
  U.acThumb = (ac) => {
    const t = G.TYPES[ac.type], r = ac.route && G.S.routes.find((x) => x.id === ac.route), br = G.brandOf(r);
    return br || t.freighter ? `<p class="ac-tags">${br ? brandChip(br) : ''}${t.freighter ? '<span class="chip">全貨機</span>' : ''}</p>` : '';
  };
  const fb0 = U.fleetBody;
  U.fleetBody = (fleet, rowOf) => ordersBox() + (fb0 ? fb0(fleet, rowOf) : fleet.map(rowOf).join(''));
  function ordersBox() {
    const S = G.S, list = (S.orders || []).slice().sort((a, b) => a.due - b.due);
    if (!list.length) return '';
    const by = {};
    list.forEach((o) => { const k = o.type + o.mode; (by[k] = by[k] || { o, n: 0, ids: [], first: o.due, last: o.due }); by[k].n++; by[k].ids.push(o.id); by[k].last = Math.max(by[k].last, o.due); });
    return `<section class="orders"><h3>排隊中的訂單（${list.length} 架）</h3>
      ${Object.values(by).map(({ o, n, ids, first, last }) => { const t = G.TYPES[o.type]; return `<div class="ord-row"><span><b>${esc(t.model)}</b> × ${n}<small>${o.mode === 'buy' ? `購買 · 單價 ${M(o.unit)} · 已付訂金 ${M(o.dep * n)}` : `租賃 · 月租 ${M(o.lease)}`}</small></span><span>${ymd(first)}${last > first ? ' 起' : ''}${list.some((x) => ids.includes(x.id) && x.delay && x.told) ? '<span class="chip warn">延後</span>' : ''}</span><button class="btn sm" data-act="ord-cancel" data-id="${ids[ids.length - 1]}">取消一架</button></div>`; }).join('')}
      <p class="note">交機日到時，購買的飛機要付清尾款（現金不足會暫存在工廠）；取消訂單只退一半訂金。</p></section>`;
  }
  // 訂購視窗：立即交機（現貨，原價）或排隊訂購（折扣，但要等）
  U.orderExtra = (o) => {
    const t = G.TYPES[o.t];
    if (t.used) return '';
    const months = G.leadMonths(o.t), disc = G.orderDiscount(o.n), unit = t.price * 1e6 * (1 - disc);
    return `<div class="seg ord-q" role="group" aria-label="交機方式"><button data-act="ord-q" data-k="0" aria-pressed="${!o.queue}">立即交機（現貨價）</button><button data-act="ord-q" data-k="1" aria-pressed="${!!o.queue}">向原廠訂購（排隊 ${months} 個月）</button></div>
      ${o.queue ? `<dl class="order-sum"><dt>交機</dt><dd>約 ${months} 個月後開始，每週交一架${t.freighter ? '' : '；艙位設定會在交機時套用'}</dd>
        <dt>批量折扣</dt><dd>${pct(disc)}（一次訂越多折扣越高，最多 ${pct(G.ORDER.discMax)}）</dd>
        <dt>${o.mode === 'buy' ? '單價' : '月租'}</dt><dd>${o.mode === 'buy' ? `${M(unit)}，現在先付 ${pct(G.ORDER.deposit)} 訂金，共 <b class="${G.S.cash < unit * G.ORDER.deposit * o.n ? 'neg' : ''}">${M(unit * G.ORDER.deposit * o.n)}</b>` : `${M(G.leaseMonthly(t) * (1 - G.ORDER.leaseDisc))}（長約折扣 ${pct(G.ORDER.leaseDisc)}），交機時付兩個月保證金`}</dd></dl>
        <p class="note">原廠可能延後交機（約 15% 的訂單會晚 1–4 個月，前兩個月通知）。</p>` : ''}`;
  };
  U.orderGo = (o) => {
    const pr = o.preset && G.presetsFor(o.t).find((p) => p.id === o.preset);
    const r = res(G.placeOrder(o.t, o.mode, o.n, pr ? pr.cabin : null));
    if (r.ok) { U.toast(`已向原廠訂購 ${o.n} 架 ${G.TYPES[o.t].model}，約 ${r.months} 個月後開始交機`); U.closeModal(); U.tab = 'fleet'; U.render(); }
  };

  // ====================================================================
  // 航線：轉機、貨運、季節、子品牌、歷史圖
  // ====================================================================
  U.routeFacts = (r) => {
    const A = G.AP[r.a], B = G.AP[r.b], st = r.stats, x = G.xferFor(r);
    const sL = G.seasonMul(A, B, 'L'), sB = G.seasonMul(A, B, 'B'), sC = G.seasonMul(A, B, 'C');
    const br = G.brandOf(r), K = G.brandKind(br);
    return `<dt>品牌</dt><dd>${br ? `${brandChip(br)}（${esc(K.name)}${K.fare !== 1 ? `，票價 ×${K.fare}` : ''}）` : esc(G.S.company.name)}</dd>
      <dt>轉機旅客（估）</dt><dd>${G.noXfer(r) ? `${esc(K.name)}不接轉機` : x ? `每日約 ${N(x.tot)} 人` : '目前沒有'}<small class="src">經由你的樞紐接駁、沒有直飛可搭的旅客</small></dd>
      <dt>本月貨運</dt><dd>${N(st.tons || 0)} 公噸 · ${M(st.cargoRev || 0)}<small class="src">每日市場約 ${N(G.cargoMarket(A, B))} 公噸，你的運力 ${N(G.routeCargoCap(r))} 公噸／日</small></dd>
      <dt>本月季節係數</dt><dd>觀光 ×${sL.toFixed(2)} · 商務 ×${sB.toFixed(2)} · 貨運 ×${sC.toFixed(2)}</dd>`;
  };
  function seasonStrip(A, B) {
    const y = new Date(G.S.time).getUTCFullYear(), now = new Date(G.S.time).getUTCMonth();
    const v = MON.map((_, i) => G.seasonMul(A, B, 'L', Date.UTC(y, i, 15)));
    const mx = Math.max(...v), mn = Math.min(...v);
    return `<div class="season" role="img" aria-label="觀光需求的季節變化">${v.map((x, i) => `<i class="${i === now ? 'now' : ''}" style="height:${(20 + 80 * (x - mn) / (mx - mn || 1)).toFixed(0)}%" title="${MON[i]} ×${x.toFixed(2)}"><b>${i + 1}</b></i>`).join('')}</div>`;
  }
  function histChart(r) {
    const h = (r.hist || []).slice(-12);
    if (h.length < 2) return '<p class="note">開航滿兩個月後，這裡會顯示每月損益與載客率的走勢。</p>';
    const P = h.map((x) => (x.rev || 0) - (x.cost || 0)), L = h.map((x) => (x.seats ? x.pax / x.seats : 0));
    const w = 320, ht = 110, pad = 18, bw = (w - pad) / h.length;
    const mx = Math.max(1, ...P.map(Math.abs)), zero = P.some((p) => p < 0) ? ht / 2 : ht - 14;
    const sc = (p) => (p / mx) * (P.some((q) => q < 0) ? ht / 2 - 8 : ht - 22);
    const bars = P.map((p, i) => { const hh = Math.abs(sc(p)); return `<rect x="${(pad + i * bw + bw * 0.18).toFixed(1)}" y="${(p >= 0 ? zero - hh : zero).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(0.8, hh).toFixed(1)}" class="${p >= 0 ? 'pb' : 'nb'}"><title>${M(p)}</title></rect>`; }).join('');
    const line = L.map((l, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${(ht - 8 - l * (ht - 20)).toFixed(1)}`).join(' ');
    const now = new Date(G.S.time), lab = h.map((_, i) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (h.length - i), 1)); return d.getUTCMonth() + 1; });
    return `<figure class="rhist"><figcaption>近 ${h.length} 個月：<span class="k pb"></span>直接損益 <span class="k ln"></span>載客率</figcaption>
      <svg viewBox="0 0 ${w} ${ht + 12}" role="img" aria-label="航線每月損益與載客率"><line x1="${pad}" x2="${w}" y1="${zero}" y2="${zero}" class="axis"/>${bars}<polyline points="${line}" class="ln"/>
      ${lab.map((m, i) => `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${ht + 10}" text-anchor="middle">${m}</text>`).join('')}</svg>
      <div class="axis-note"><span>最高 ${M(Math.max(...P))}</span><span>載客率 ${pct(Math.min(...L))}–${pct(Math.max(...L))}</span></div></figure>`;
  }
  const re0 = U.routeExtra;
  U.routeExtra = (r) => {
    const S = G.S, A = G.AP[r.a], B = G.AP[r.b];
    return `${re0 ? re0(r) : ''}
      <h4>每月走勢</h4>${histChart(r)}
      <h4>季節（觀光需求）</h4>${seasonStrip(A, B)}
      ${G.brands().length ? `<h4>由誰經營（每次切換 ${M(G.BRAND.rebrand)}）</h4><div class="row-btns brand-pick">${[null, ...G.brands()].map((b) => { const on = (r.brand || null) === (b ? b.id : null), why = b ? G.brandWhy(r, b) : null; return `<button class="btn sm ${on ? 'primary' : ''}" data-act="rt-brand" data-id="${r.id}" data-b="${b ? b.id : ''}" ${on || why ? 'disabled' : ''} ${why ? `title="${esc(why)}"` : ''}>${b ? `<span class="cbadge" style="--c:${esc(b.color)}">${esc(b.code)}</span>${esc(b.name)}` : `<span class="cbadge" style="--c:${esc(S.company.color)}">${esc(S.company.code)}</span>${esc(S.company.name)}`}</button>`; }).join('')}</div>` : ''}`;
  };
  // 航線頁上方：集團與子航空公司
  const brandChip = (b) => `<span class="chip lcc" style="--c:${esc(b.color)}">${esc(b.name)}</span>`;
  U.brandChip = brandChip;
  const rb0 = U.routesBody;
  U.routesBody = (routes, rowOf) => groupCard() + (rb0 ? rb0(routes, rowOf) : routes.map(rowOf).join(''));
  let brandForm = null; // 正在填的子航空公司類型
  U.groupTiers = () => `<table class="tiers"><thead><tr><th>機隊</th>${G.GROUP_TIERS.map(([f]) => `<th>${f}+</th>`).join('')}</tr></thead><tbody><tr><td>旗下航空公司</td>${G.GROUP_TIERS.map(([f, k]) => `<td class="${G.S.fleet.length >= f ? 'on' : ''}">${k}</td>`).join('')}</tr></tbody></table>`;
  function groupCard() {
    const S = G.S, cap = G.groupCap(), used = G.groupUsed(), nx = G.groupNext(), list = G.brands();
    const founded = list.filter((b) => !b.from).length;
    const rows = list.map((b) => {
      const K = G.BRAND_KINDS[b.kind], rs = S.routes.filter((r) => r.brand === b.id), ids = new Set(rs.map((r) => r.id));
      const p = rs.reduce((t, r) => t + (r.stats.rev - r.stats.cost), 0), n = S.fleet.filter((a) => ids.has(a.route)).length;
      return `<div class="brand-row" style="--c:${esc(b.color)}"><span class="cbadge" style="--c:${esc(b.color)}">${esc(b.code)}</span><span class="nm"><b>${esc(b.name)}</b><small>${esc(K.name)}${b.from ? '（併購保留品牌）' : ''} · ${rs.length} 條航線、${n} 架 · 本月直接損益 <b class="${p < 0 ? 'neg' : 'pos'}">${M(p)}</b></small></span><button class="btn sm" data-act="brand-close" data-id="${b.id}">${b.from ? '併入主品牌' : '結束並併回'}（${M(n * (G.REPAINT_COST || 120e3))}）</button></div>`;
    }).join('');
    const subsN = S.mna ? S.mna.subs.length + S.mna.deals.length : 0;
    const head = `<header><b>集團</b><small>旗下航空公司 ${used}／${cap} 家${subsN ? `（含 ${subsN} 家獨立子公司或收購案）` : ''}${nx ? ` · 機隊 ${nx[0]} 架可增加到 ${nx[1]} 家` : ''}</small></header>`;
    let form = '';
    if (brandForm) {
      const K = G.BRAND_KINDS[brandForm];
      form = `<div class="brand-form"><h4>成立${esc(K.name)}</h4><p class="note">${esc(K.desc)}</p>
        <div class="form-grid"><label>名稱<input id="br-name" maxlength="20" placeholder="${brandForm === 'lcc' ? '例如：蓬萊快飛' : '例如：蓬萊區域航空'}" autocomplete="off"></label>
        <label>兩碼代碼<input id="br-code" maxlength="2" placeholder="例如：${brandForm === 'lcc' ? 'PQ' : 'PR'}" autocomplete="off"></label>
        <label>品牌色<input id="br-color" type="color" value="${brandForm === 'lcc' ? '#f28c28' : '#2f9e6c'}"></label></div>
        <div class="row-btns"><button class="btn primary" data-act="brand-found" data-k="${brandForm}">成立（${M(K.setup)}）</button><button class="btn" data-act="brand-cancel">取消</button></div></div>`;
    }
    const canFound = used < cap && founded < G.BRAND.maxFounded;
    const add = brandForm ? '' : canFound
      ? `<div class="row-btns">${Object.entries(G.BRAND_KINDS).filter(([, K]) => K.found).map(([k, K]) => `<button class="btn sm" data-act="brand-new" data-k="${k}">成立${esc(K.name)}（${M(K.setup)}）</button>`).join('')}</div>`
      : `<p class="note">${founded >= G.BRAND.maxFounded ? `自創的子航空公司最多 ${G.BRAND.maxFounded} 家。` : cap === 0 ? `機隊達到 ${G.GROUP_TIERS[0][0]} 架才能成立子航空公司。` : '集團已達目前規模的上限。'}</p>`;
    if (!list.length && !brandForm && !subsN) {
      return `<section class="groupcard">${head}<p class="note">成立子航空公司，用不同品牌經營不同市場：低成本航空搶價格敏感的觀光客、區域航空用較低成本飛短程並接駁樞紐。收購其他航空公司後，也可以整合成保留原品牌的子航空公司。每家每月固定管理成本 ${M(G.BRAND.fixed)}。</p>${add}<details><summary>旗下航空公司的上限</summary>${U.groupTiers()}<p class="note">自創、保留品牌的併購與獨立子公司合計。真實的航空集團大多旗下有 2–6 家航空公司：華航集團約 120 架、3 家；國泰約 200 架、2 家；全日空約 300 架、3 家；漢莎集團約 700 架、6 家。</p></details></section>`;
    }
    return `<section class="groupcard">${head}${rows}${form}${add}<details><summary>旗下航空公司的上限</summary>${U.groupTiers()}<p class="note">自創（最多 ${G.BRAND.maxFounded} 家）、保留品牌的併購與獨立子公司合計；每家子航空公司每月固定管理成本 ${M(G.BRAND.fixed)}。到航線詳細資料切換由哪家經營（每次 ${M(G.BRAND.rebrand)}）。</p></details></section>`;
  }

  // ====================================================================
  // 樞紐：轉機
  // ====================================================================
  const he0 = U.hubExtra;
  U.hubExtra = (iata) => {
    const x = G.xferHub(iata);
    const box = `<div class="xfer"><b>轉機</b><p class="meta">${x.pairs ? `經由 ${iata} 銜接 ${N(x.pairs)} 組城市，每日約 ${N(x.pax)} 位轉機旅客（兩段都搭你的航班）。` : '至少要有兩條從這裡出發、而且方向順路的航線，才會有轉機旅客。'}</p>
      ${x.top.length ? `<ol class="xfer-top">${x.top.slice(0, 8).map((p) => `<li><span>${p.a} ⇄ ${p.b}</span><small>${esc(G.AP[p.a].city)}–${esc(G.AP[p.b].city)}</small><em>${N(p.pax)} 人／日</em></li>`).join('')}</ol>` : ''}
      <p class="note">繞路越少、兩段班次越多、票價越便宜、樞紐地勤設施越好，轉機客越多；有其他航空直飛的城市很難搶到轉機客。轉機旅客的票價比直飛便宜約 ${pct(G.XFER.fareDisc)}，每人另有 ${M(G.XFER.handling)} 的轉機地勤成本。</p></div>`;
    return box + (he0 ? he0(iata) : '');
  };

  // ====================================================================
  // 機場：時刻帶
  // ====================================================================
  const ae0 = U.airportExtra;
  U.airportExtra = (ap) => {
    let box = '';
    if (G.isSlotAp(ap.iata)) {
      const S = G.S, s = G.slots(ap.iata), need = G.slotNeed(ap.iata), hub = S.hubs[ap.iata];
      const avail = G.slotAvail(ap.iata), price = G.slotPrice(ap.iata);
      box = `<section class="slots"><h3>時刻帶（管制機場）</h3>
        ${hub ? `<p class="note">這裡是你的樞紐，起降時刻帶由機場長期分配，不必另外購買。</p>` : `<dl class="facts"><dt>持有</dt><dd>${s.held} 個（每日來回）</dd><dt>目前使用</dt><dd>${need.toFixed(1)} 個</dd><dt>本季釋出</dt><dd>${avail ? `${avail} 個，每個 ${M(price)}` : '沒有，下季（1、4、7、10 月）再來看看'}</dd></dl>
        <div class="row-btns"><button class="btn sm" data-act="slot-buy" data-iata="${ap.iata}" ${avail ? '' : 'disabled'}>買進 1 個</button><button class="btn sm" data-act="slot-sell" data-iata="${ap.iata}" ${s.held > Math.ceil(need - 1e-6) ? '' : 'disabled'}>賣出 1 個（${M(price * G.SLOT.sell)}）</button></div>
        <p class="note">每架飛機每天在這裡的來回班次都要佔用時刻帶。每年 3 月底、10 月底航季結束時，長期用不到的時刻帶會被收回一半（用進廢退）。時刻帶列為無形資產。</p>`}
      </section>`;
    }
    return (ae0 ? ae0(ap) : '') + box;
  };

  // ====================================================================
  // 競爭：併購
  // ====================================================================
  U.subsBox = () => {
    const m = G.mnaState(), S = G.S;
    if (!m.subs.length && !m.deals.length) return '';
    return `<section class="subs"><h3>子公司與收購案</h3>
      ${m.deals.map((d) => `<div class="sub-row deal"><span><b>${esc(d.name)}</b><small>收購審查中 · 出價 ${M(d.price)} · 約 ${Math.max(0, Math.ceil((d.due - S.time) / DAY))} 天後公布結果 · 核准機會約 ${pct(d.p)}</small></span><button class="btn sm" data-act="mna-withdraw" data-id="${d.id}">撤回</button></div>`).join('')}
      ${m.subs.map((x) => `<div class="sub-row"><span><b>${esc(x.name)}</b><small>${x.codes.join('、')} · 收購價 ${M(x.cost)} · 帳面 ${M(x.book)} · 上月認列 <b class="${x.last < 0 ? 'neg' : 'pos'}">${M(x.last)}</b> · 累計股利 ${M(x.divs)}${x.integ ? ` · <b>整合中（${x.integ.mode === 'brand' ? '保留品牌' : '併入主品牌'}），剩 ${Math.max(0, Math.ceil((x.integ.until - S.time) / DAY))} 天</b>` : ''}</small></span>${x.integ ? '' : `<button class="btn sm primary" data-act="integ-open" data-k="${x.key}">整合…</button><button class="btn sm" data-act="mna-sell" data-k="${x.key}" ${S.time - x.since < 180 * DAY ? 'disabled title="收購滿半年才能出售"' : ''}>出售（約 ${M(G.mnaSaleValue(x))}）</button>`}</div>`).join('')}
      ${(m.merged || []).length ? `<p class="note">已整合：${m.merged.map((x) => `${esc(x.name)}（${x.mode === 'brand' ? '保留品牌' : '併入主品牌'}，${x.aircraft} 架、${x.routes} 條航線）`).join('、')}</p>` : ''}
      <p class="note">獨立子公司仍用原品牌自己營運，以權益法入帳：每月依獲利認列投資收益，一半以現金股利匯回；不再搶你的旅客、不打價格戰，飛往它的樞紐多 ${pct(G.MNA.feed)} 攬客力。按「整合…」可以把它的飛機、航線與樞紐併進你的航網。</p></section>`;
  };
  U.rvExtra = (c) => {
    const why = G.mnaWhyNot(c.code);
    if (G.isSub(c.code)) return `<p class="note pos">${esc(G.carrierName(c))}是你的子公司。</p>`;
    if (G.isMerged && G.isMerged(c.code)) return `<p class="note pos">${esc(G.carrierName(c))}已經併入你的公司。</p>`;
    const T = G.mnaTarget(c.code);
    if (!T) return '';
    const ap = G.mnaApproval(T);
    return `<div class="mna"><h4>收購${T.listed ? `（${esc(T.name)}，含 ${T.codes.length} 個品牌）` : ''}</h4>
      <p class="meta">${T.listed ? `市值 ${M(T.cap)}，公開收購價（溢價 30%）${M(T.price)}${T.held ? `，扣掉你已持有的股份` : ''}` : `協議收購價（依機隊約 ${N(T.fleet)} 架估算）${M(T.price)}`} · 顧問費 ${M(T.price * G.MNA.advisory)} · 審查約 ${G.MNA.review} 天 · 核准機會約 ${pct(ap.p)}${ap.overlap ? `（與你有 ${ap.overlap} 條航線重疊）` : ''}</p>
      ${why ? `<p class="note">${esc(why)}</p>` : `<div class="row-btns"><button class="btn sm" data-act="mna-offer" data-code="${c.code}">發動收購</button></div>`}</div>`;
  };

  // 整合子公司：三種選擇
  U.integDialog = (key) => {
    const S = G.S, sub = G.mnaState().subs.find((x) => x.key === key);
    if (!sub) return;
    const plan = G.mnaIntegPlan(sub), X = G.INTEG;
    const cB = G.mnaIntegCost(sub, 'brand', plan), cM = G.mnaIntegCost(sub, 'main', plan);
    const opt = (mode, title, ex, body, cost) => `<div class="integ-opt"><h4>${title}</h4><p class="note">${ex}</p><ul class="plain">${body}</ul>${mode ? `<div class="row-btns"><button class="btn ${mode === 'brand' ? 'primary' : ''}" data-act="integ-go" data-k="${key}" data-m="${mode}" ${plan.routes.length ? '' : 'disabled'}>${title}（${M(cost)}）</button></div>` : ''}</div>`;
    U.modal(`<h2>整合${esc(sub.name)}</h2>
      <p class="sub">${plan.routes.length ? `預計轉入 ${plan.aircraft} 架飛機、${plan.routes.length} 條航線${plan.hubs.length ? `，${plan.hubs.join('、')} 會成為你的次要樞紐` : ''}${plan.capped ? `（對方約 ${plan.est} 架，一次最多轉入 ${X.maxFleet} 架，其餘退租）` : ''}。整合約 ${X.days} 天，期間員工士氣 −${X.morale}。` : '這家公司的航線沒辦法由你經營（機場類型或航程限制），只能維持獨立子公司。'}</p>
      <div class="integ-grid">
        ${opt(null, '維持獨立子公司', '現在的狀態：對方用自己的品牌、自己營運。', `<li>每月依獲利認列投資收益，一半以股利匯回</li><li>不搶你的客人、不打價格戰</li><li>滿半年可以出售</li>`)}
        ${opt('brand', '整合，保留品牌', '像國泰收購港龍後的「國泰港龍」：飛機、航線、樞紐與時刻帶都交給你調度，但飛機上仍是原本的名字。', `<li>成為你的子航空公司「${esc(sub.name)}」${G.CARRIERS[sub.codes[0]] && G.CARRIERS[sub.codes[0]].lcc ? '（照樣是低成本航空）' : ''}</li><li>在它的母國保有在地旅客的忠誠度（攬客力 +${pct(G.BRAND_KINDS.acq.home)}）</li><li>每月固定管理成本 ${M(G.BRAND.fixed)}；之後隨時可以再併入主品牌</li>`, cB)}
        ${opt('main', '完全併入主品牌', '像 2020 年國泰港龍停飛、航線全部改由國泰經營：一次到位，全部換成你的品牌。', `<li>飛機全部重新塗裝（每架 ${M(X.repaint)}）</li><li>不佔集團的子航空公司名額、沒有額外管理成本</li><li>失去原品牌在母國的忠誠度</li>`, cM)}
      </div>
      <p class="note">整合費包含收購價的 ${pct(X.costPct)} 與每架飛機 ${M(X.perAc)} 的系統、訓練與換證費用。帳上的子公司投資會轉成飛機（自有飛機最多約收購價的六成，其餘是租約）、租機保證金與商譽。整合後這家公司不再是你的對手；你原本已經在飛的航線不會重複開設。</p>`, 'wide');
  };

  // ====================================================================
  // 排行榜（這台裝置上的所有存檔）
  // ====================================================================
  const BOARD = 'af-board';
  const loadBoard = () => { try { return JSON.parse(store.get(BOARD, '[]')) || []; } catch (e) { return []; } };
  G.boardScore = (v, diff) => Math.round((v / 1e6) * (G.DIFF[diff || 'normal'] || G.DIFF.normal).score);
  G.boardRecord = () => {
    const S = G.S;
    if (!S || !S.fin) return;
    S.gid = S.gid || Math.random().toString(36).slice(2, 10);
    const v = G.companyValue(), b = loadBoard().filter((x) => x.gid !== S.gid);
    b.push({ gid: S.gid, name: S.company.name, code: S.company.code, color: S.company.color, diff: S.diff || 'normal', value: v, worth: G.netWorth ? G.netWorth() : 0, pax: (S.stats && S.stats.pax) || 0, fleet: S.fleet.length, years: (S.time - S.start) / (365 * DAY), score: G.boardScore(v, S.diff), date: ymd(S.time), at: Date.now() });
    b.sort((x, y) => y.score - x.score);
    store.set(BOARD, JSON.stringify(b.slice(0, 50)));
  };
  G.on((w) => { if (w === 'day' && G.S && new Date(G.S.time).getUTCDate() === 1) G.boardRecord(); });
  let boardBy = 'score';
  U.boardDialog = () => {
    const S = G.S;
    if (S) G.boardRecord();
    const b = loadBoard(), key = { score: 'score', value: 'value', worth: 'worth', pax: 'pax' }[boardBy];
    const rows = b.slice().sort((x, y) => y[key] - x[key]).slice(0, 20);
    const fmt = (x) => (boardBy === 'pax' ? N(x.pax) + ' 人次' : boardBy === 'score' ? N(x.score) + ' 分' : M(x[key]));
    // 和真實航空公司比機隊規模
    let realRank = '';
    if (S) {
      const mine = S.fleet.length, all = Object.keys(G.CARRIERS).map((c) => G.carrierFleetEst(c));
      const rank = 1 + all.filter((n) => n > mine).length;
      const near = Object.values(G.CARRIERS).map((c) => ({ c, n: G.carrierFleetEst(c.code) })).filter((x) => x.n >= mine).sort((a, b2) => a.n - b2.n)[0];
      realRank = `<div class="callout"><b>機隊規模在全世界 ${N(all.length)} 家航空公司中排第 ${N(rank)} 名</b><p>你有 ${mine} 架飛機${near ? `，下一個目標：${esc(G.carrierName(near.c))}（約 ${N(near.n)} 架）` : '，已經是世界最大'}。</p></div>`;
    }
    U.modal(`<h2>排行榜</h2>
      <p class="sub">這台裝置上所有存檔的最佳成績（每月 1 日自動記錄）。分數 = 公司價值（百萬美元）× 難度倍率。</p>
      <div class="seg" role="group" aria-label="排序依據">${[['score', '分數'], ['value', '公司價值'], ['worth', '創辦人身價'], ['pax', '累計旅客']].map(([k, n]) => `<button data-act="board-by" data-k="${k}" aria-pressed="${boardBy === k}">${n}</button>`).join('')}</div>
      ${rows.length ? `<ol class="board">${rows.map((x, i) => `<li class="${S && x.gid === S.gid ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="cbadge" style="--c:${esc(x.color || '#888')}">${esc(x.code)}</span><span class="nm"><b>${esc(x.name)}</b><small>${esc((G.DIFF[x.diff] || G.DIFF.normal).name)} · 經營 ${x.years.toFixed(1)} 年 · ${x.fleet} 架 · ${esc(x.date)}</small></span><b class="v">${fmt(x)}</b></li>`).join('')}</ol>` : '<p class="empty">還沒有紀錄，經營滿一個月後就會出現。</p>'}
      ${realRank}
      <div class="row-btns"><span class="spacer"></span>${rows.length ? '<button class="btn sm danger" data-act="board-clear">清除紀錄</button>' : ''}<button class="btn primary" data-act="modal-close">關閉</button></div>`);
  };

  // ====================================================================
  // 塗裝編輯器
  // ====================================================================
  let lv = null;
  U.liveryDialog = () => { lv = JSON.parse(JSON.stringify(G.livery())); drawLivery(); };
  // 預覽：直接用地圖上的飛機圖示，放大畫在一小塊海面上
  const PREV = [['A20N', '窄體機'], ['B789', '寬體機'], ['AT76', '螺旋槳機']];
  function paintPreview() {
    const cv = $('#lv-canvas');
    if (!cv || !G.map.drawIcon) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 480, h = 150;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#a7cbe3'; c.fillRect(0, 0, w, h);
    const sc = Math.min(4.2, w / 115);
    c.font = '12px ' + (getComputedStyle(document.documentElement).getPropertyValue('--font-body') || 'sans-serif');
    c.textAlign = 'center';
    PREV.forEach(([id, name], i) => {
      const t = G.TYPES[id], x = (w / 3) * (i + 0.5), y = 66;
      G.map.drawIcon(c, x, y, -Math.PI / 2, t, lv, sc);
      c.fillStyle = '#17212b'; c.fillText(name, x, h - 10);
    });
  }
  function drawLivery() {
    const S = G.S, first = !S.company.livery;
    const col = (k, n) => `<label class="lv-col"><input type="color" id="lv-${k}" data-lv="${k}" value="${esc(lv[k])}"><span>${n}</span></label>`;
    U.modal(`<h2>塗裝</h2>
      <p class="sub">決定地圖上飛機圖示的機身、機尾與發動機顏色。</p>
      <canvas id="lv-canvas" class="lv-canvas" role="img" aria-label="塗裝預覽：窄體機、寬體機、螺旋槳機"></canvas>
      <div class="lv-cols">${G.LIVERY_PARTS.map(([k, n]) => col(k, n)).join('')}</div>
      <div class="lv-presets"><span class="lbl">配色範本</span>${G.LIVERY_PRESETS.map((p, i) => `<button class="lv-pre" data-act="lv-preset" data-i="${i}" title="${esc(p.name)}"><i style="background:${p.body}"></i><i style="background:${p.tail}"></i><i style="background:${p.engines}"></i><span>${esc(p.name)}</span></button>`).join('')}<button class="lv-pre" data-act="lv-preset" data-i="co"><i style="background:#ffffff"></i><i style="background:${esc(S.company.color)}"></i><span>企業色</span></button></div>
      <p class="note">${first ? '第一次設定塗裝免費。' : `換新塗裝需要重新噴漆：每架 ${M(G.REPAINT_COST)}，全機隊（子航空公司的飛機除外）共 ${M(G.repaintCost())}。`}子航空公司航線的飛機用它自己的品牌色。</p>
      <div class="row-btns"><span class="spacer"></span><button class="btn" data-act="modal-close">取消</button><button class="btn primary" data-act="lv-save">${first ? '套用塗裝' : `重新塗裝（${M(G.repaintCost())}）`}</button></div>`);
    requestAnimationFrame(paintPreview);
  }
  const lvRefresh = () => paintPreview();
  document.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.lv; if (k && lv) { lv[k] = e.target.value; lvRefresh(); } });

  // ====================================================================
  // 地圖圖層：晝夜、天候
  // ====================================================================
  const syncX = () => document.querySelectorAll('#layers [data-act="layer-x"]').forEach((b) => b.setAttribute('aria-pressed', String(!!G.map.show[b.dataset.k])));
  setTimeout(syncX, 0);

  // ====================================================================
  // 成就
  // ====================================================================
  if (G.ACHIEVEMENTS) G.ACHIEVEMENTS.push(
    ['tycoon', '集團化', '完成第一次併購，擁有子公司', (S) => !!(S.mna && S.mna.subs.length)],
    ['lccbrand', '雙品牌', '成立第一家子航空公司', (S) => (S.brands || []).length > 0],
    ['integrator', '整合者', '完成第一次併購整合', (S) => ((S.stats && S.stats.integrations) || 0) > 0],
    ['bigfamily', '航空集團', '旗下同時有 4 家航空公司', (S) => G.groupUsed() >= 4],
    ['freighter', '貨運起飛', '擁有第一架全貨機', (S) => S.fleet.some((a) => G.TYPES[a.type].freighter)],
    ['connector', '轉機樞紐', '單日轉機旅客超過 1,000 人', (S) => S.days.some((d) => (d.xfer || 0) >= 1000), (S) => [Math.max(0, ...S.days.map((d) => d.xfer || 0)), 1000]],
    ['bigorder', '大訂單', '一次向原廠訂購 10 架以上', (S) => (S.orders || []).length >= 10],
    ['hardmode', '硬派經營', '在硬派難度連續獲利 12 個月', (S) => S.diff === 'brutal' && S.fin.statements.length >= 12 && S.fin.statements.slice(-12).every((x) => x.ni > 0)],
  );

  // ====================================================================
  // 動作
  // ====================================================================
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    const S = G.S;
    switch (a) {
      case 'ord-cancel': if (el.dataset.confirm) { res(G.cancelOrder(+d.id), '已取消一架訂單'); U.render(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認（退一半訂金）'; } return;
      case 'ord-q': if (U.orderState) { U.orderState().queue = d.k === '1'; U.drawOrder(); } return;
      case 'rt-brand': res(G.setRouteBrand(+d.id, d.b || null)); U.render(); G.map.invalidate(); return;
      case 'brand-new': brandForm = d.k; U.render(); return;
      case 'brand-cancel': brandForm = null; U.render(); return;
      case 'brand-found': { const r = res(G.foundBrand({ kind: d.k, name: ($('#br-name') || {}).value, code: ($('#br-code') || {}).value, color: ($('#br-color') || {}).value })); if (r.ok) { brandForm = null; U.toast(`「${r.brand.name}」成立！到航線詳細資料把航線交給它經營`); U.render(); } return; }
      case 'brand-close': if (el.dataset.confirm) { const r = res(G.closeBrand(d.id)); if (r.ok) U.toast(`${r.routes} 條航線改由主品牌經營`); U.render(); G.map.invalidate(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認（航線改回主品牌）'; } return;
      case 'integ-open': U.integDialog(d.k); return;
      case 'integ-go': { const r = res(G.mnaIntegrate(d.k, d.m)); if (r.ok) { U.closeModal(); U.toast(`開始整合，約 ${G.INTEG.days} 天後完成`); U.render(); } return; }
      case 'slot-buy': res(G.buySlot(d.iata), `已買進 ${d.iata} 時刻帶`); U.render(); return;
      case 'slot-sell': res(G.sellSlot(d.iata), `已賣出 ${d.iata} 時刻帶`); U.render(); return;
      case 'mna-offer': if (el.dataset.confirm) { const r = res(G.mnaOffer(d.code)); if (r.ok) { U.toast(`已送出收購案，約 ${G.MNA.review} 天後公布審查結果`); U.render(); } } else { el.dataset.confirm = '1'; el.textContent = '確定發動收購？再按一次'; } return;
      case 'mna-withdraw': res(G.mnaWithdraw(+d.id)); U.render(); return;
      case 'mna-sell': if (el.dataset.confirm) { const r = res(G.mnaSell(d.k)); if (r.ok) U.toast(`已出售，處分損益 ${M(r.gain)}`); U.render(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次確認出售'; } return;
      case 'm-board': U.boardDialog(); return;
      case 'board-by': boardBy = d.k; U.boardDialog(); return;
      case 'board-clear': if (el.dataset.confirm) { store.set(BOARD, '[]'); U.boardDialog(); } else { el.dataset.confirm = '1'; el.textContent = '再按一次清除'; } return;
      case 'm-livery': if (!S) return; U.liveryDialog(); return;
      case 'lv-preset': { const p = d.i === 'co' ? G.defaultLivery(S) : G.LIVERY_PRESETS[+d.i]; G.LIVERY_PARTS.forEach(([k]) => (lv[k] = p[k])); drawLivery(); return; }
      case 'lv-save': { const r = res(G.setLivery(lv)); if (r.ok) { U.closeModal(); U.toast(r.cost ? `全機隊重新塗裝完成（${M(r.cost)}）` : '塗裝已套用'); U.render(); G.map.invalidate(); } return; }
      case 'layer-x': G.setMapX(d.k, !G.map.show[d.k]); syncX(); G.map.invalidate(); return;
    }
    if (act0) act0(a, d, el);
  };
})();
