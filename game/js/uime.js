// v1.0.0-rc3 介面：「個人」分頁（身價、收支、薪酬、與公司之間的資金往來、生活與收藏、公益）與「公司股票」的庫藏股買回。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (v) => G.money(v);
  const DAY = 86400000;
  const cls = (v) => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  const val = (id) => { const el = document.getElementById(id); return el ? +String(el.value).replace(/[^\d.]/g, '') : 0; };
  const imgWord = (v) => (v >= 75 ? '形象極佳' : v >= 60 ? '形象良好' : v >= 40 ? '普通' : v >= 25 ? '形象不佳' : '聲名狼藉');
  // 輸入框：金額以「萬美元」以上常用，提供快速按鈕
  const amountRow = (id, presets, ph) => `<div class="me-amt"><input id="${id}" type="text" inputmode="numeric" placeholder="${esc(ph || '金額（美元）')}" autocomplete="off">${presets.map((v) => `<button class="btn sm" data-act="me-fill" data-id="${id}" data-v="${v}">${M(v)}</button>`).join('')}</div>`;

  function spark(hist) {
    if (!hist || hist.length < 2) return '<p class="note">每月底會記錄一次身價，下個月起就能看到走勢。</p>';
    const vals = hist.map((x) => x.w), mn = Math.min(...vals), mx = Math.max(...vals), w = 320, ht = 80;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(ht - 6 - ((v - mn) / (mx - mn || 1)) * (ht - 12)).toFixed(1)}`).join(' ');
    return `<figure class="spark"><figcaption>身價走勢（近 ${vals.length} 個月）</figcaption><svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" role="img" aria-label="身價走勢"><polygon points="0,${ht} ${pts} ${w},${ht}" class="area"/><polyline points="${pts}" class="line"/></svg><div class="axis"><span>${M(mn)}</span><span>${M(mx)}</span></div></figure>`;
  }

  U.meTab = () => {
    const S = G.S, m = G.initMe(S), F = S.fin, st = F.stock;
    const worth = G.netWorth(), stake = G.myStakeValue(), items = G.itemsValue();
    const L = m.last || m.mon;
    const net = L.salary + L.divs + L.interest + L.gains - L.tax - L.living - L.upkeep - L.give;
    const crisis = G.companyCrisis();
    // 收支
    const flow = [['董事長薪酬', L.salary], ['股利與盈餘分配', L.divs], ['利息', L.interest], ['出售持股與資產', L.gains], ['所得稅', -L.tax], ['生活費', -L.living], ['資產持有成本', -L.upkeep], ['公益捐款', -L.give]].filter(([, v]) => Math.abs(v) >= 1);
    // 與公司之間
    let company;
    if (st.listed) {
      company = `<h4>在股市買賣自家股票</h4>
        <p class="note">目前持有 ${G.num(Math.round(G.myShares()))} 股（${S.founder.equity}%），股價 $${st.price.toFixed(2)}。賣出一次最多 2%，之後要隔 30 天；賣股會壓低股價、上新聞，並扣 10% 稅。持股跌破 50% 後，股東會支持度不足時可能被撤換。</p>
        <div class="row-btns">${[0.005, 0.01, 0.02].map((f) => `<button class="btn sm" data-act="me-sell" data-f="${f}" ${S.time < m.sellAt ? 'disabled' : ''}>賣出 ${(f * 100).toFixed(1)}%（約 ${M(st.shares * f * st.price)}）</button>`).join('')}</div>
        ${S.time < m.sellAt ? `<p class="meta">${Math.ceil((m.sellAt - S.time) / DAY)} 天後才能再賣。</p>` : ''}
        ${amountRow('me-buyown', [1e6, 10e6, 100e6])}
        <div class="row-btns"><button class="btn" data-act="me-buyown">用個人資金買進自家股票</button></div>
        <p class="meta">市場上還可買約 ${G.num(Math.round(G.ownFloat() * 0.5))} 股；買進會推升股價，持股最多到 ${G.PERSONAL.buyMaxEquity}%。</p>`;
    } else {
      const lim = G.distLimit(), y = new Date(S.time).getUTCFullYear();
      company = `<h4>盈餘分配（未上市）</h4>
        <p class="note">每年一次，依持股比例分給股東（你 ${S.founder.equity}%），扣 20% 股利所得稅。上限是近 12 個月淨利的一半、公司現金的 30% 與保留盈餘三者取最小，目前 ${M(lim)}。</p>
        ${m.distYear === y ? '<p class="meta">今年已經分配過了。</p>' : `${amountRow('me-dist', [lim * 0.25, lim * 0.5, lim].filter((v) => v >= 1e5).map((v) => Math.floor(v / 1e5) * 1e5))}<div class="row-btns"><button class="btn" data-act="me-dist" ${lim < 1e5 ? 'disabled' : ''}>分配盈餘</button></div>`}`;
    }
    const pps = G.injectPrice();
    company += `<h4>個人增資</h4>
      <p class="note">把個人資金投入公司換成股份：${st.listed ? '以市價九五折' : '以每股淨值'}（$${pps.toFixed(2)}／股）發行新股給你，公司現金增加、你的持股提高。</p>
      ${amountRow('me-inject', [1e6, 10e6, 100e6])}<div class="row-btns"><button class="btn" data-act="me-inject">增資</button></div>
      <h4>股東借款</h4>
      <p class="note">借錢給公司，公司每月付你利息；之後公司現金足夠時可以要求還款。公司周轉不靈時，這是最快的救急方式。目前借出 ${M(m.lend)}，年利率 ${(m.lendRate * 100).toFixed(1)}%。</p>
      ${amountRow('me-lend', [1e6, 10e6, 50e6])}
      <div class="row-btns"><label class="fsel"><span>年利率</span><select id="me-rate">${[0, 0.02, 0.04, 0.06, 0.08].map((r) => `<option value="${r}" ${Math.abs(r - m.lendRate) < 1e-6 ? 'selected' : ''}>${(r * 100).toFixed(0)}%</option>`).join('')}</select></label><button class="btn" data-act="me-lend">借給公司</button><button class="btn" data-act="me-recall" ${m.lend > 0 ? '' : 'disabled'}>要求還款</button></div>`;
    // 生活與收藏
    const owned = m.items.length ? `<ul class="me-items">${m.items.map((x) => `<li><span><b>${esc(x.name)}</b><small>買入 ${M(x.cost)} · ${new Date(x.since).toISOString().slice(0, 7)}</small></span><span class="${cls(x.value - x.cost)}">${M(x.value)}</span><button class="btn sm" data-act="me-sellitem" data-uid="${x.uid}">出售</button></li>`).join('')}</ul>` : '<p class="note">還沒有任何個人資產。</p>';
    const catalog = Object.entries(G.ITEM_KIND).map(([k, name]) => `<div class="me-cat"><h5>${name}</h5>${G.ITEMS.filter((x) => x.kind === k).map((x) => `<button class="me-buy" data-act="me-buyitem" data-id="${x.id}" ${m.cash < x.price ? 'disabled' : ''}><b>${esc(x.name)}</b><span>${M(x.price)}</span><small>${esc(x.desc)}${x.lux ? ' · 奢侈品' : ''}</small></button>`).join('')}</div>`).join('');
    const salaryNote = S.founder.type === 'manager' ? `董事會核定上限 ${M(G.salaryCap())}。` : `同規模公司的合理年薪約 ${M(G.fairSalary())}；公司虧損、罷工或發生失事時，領超過兩倍會被批評、員工士氣下降。`;
    return `<section class="kpis me-kpis">
        <div class="wide"><span>個人身價</span><b class="${cls(worth)}">${M(worth)}</b><em>起始個人資金 ${M(m.start)}</em></div>
        <div><span>個人現金</span><b class="${cls(m.cash)}">${M(m.cash)}</b><em>存款年息 ${G.PERSONAL.depositRate * 100}%</em></div>
        <div><span>自家持股</span><b>${M(stake)}</b><em>${S.founder.equity}% · ${st.listed ? '依股價' : '依股東權益估算'}</em></div>
        <div><span>房產與收藏</span><b>${M(items)}</b><em>${m.items.length} 件</em></div>
        <div><span>借給公司</span><b>${M(m.lend)}</b><em>股東借款</em></div>
      </section>
      <div class="me-image"><span>個人形象</span><div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(m.image)}" aria-label="個人形象"><i style="width:${m.image.toFixed(0)}%"></i></div><b>${m.image.toFixed(0)} · ${imgWord(m.image)}</b></div>
      <p class="note">個人形象會慢慢影響公司的社會評價。做公益會加分；${crisis.length ? `<b class="neg">公司目前${crisis.join('、')}，這時買奢侈品很容易被爆料。</b>` : '公司有困難時買奢侈品、領高薪會被批評。'}</p>
      ${spark(m.hist)}
      <h3>上個月收支</h3>
      ${flow.length ? `<table class="me-flow"><tbody>${flow.map(([l, v]) => `<tr><td>${l}</td><td class="${cls(v)}">${M(v)}</td></tr>`).join('')}<tr class="total"><td>淨增減</td><td class="${cls(net)}">${M(net)}</td></tr></tbody></table>` : '<p class="note">月底結算後會顯示。</p>'}
      <p class="meta">累計：薪酬 ${M(m.tot.salary)} · 股利 ${M(m.tot.divs)} · 繳稅 ${M(m.tot.tax)} · 捐款 ${M(m.given)}</p>
      <h3>董事長薪酬</h3>
      <p class="note">由公司支付，列入人事費用；扣 30% 所得稅後進你的個人帳戶。目前年薪 ${M(m.salary)}。${salaryNote}</p>
      ${amountRow('me-salary', [0, 300e3, 1e6, 3e6], '年薪（美元）')}
      <div class="row-btns"><button class="btn" data-act="me-salary">設定年薪</button></div>
      <h3>你與公司之間</h3>
      <p class="note">公司的錢只能透過薪酬、股利（未上市為盈餘分配）或出售持股進到你的口袋；個人的錢可以增資、借給公司或在股市增持。</p>
      ${company}
      <h3>生活與收藏</h3>
      ${owned}
      <details class="me-shop"><summary>選購個人資產</summary>${catalog}<p class="note">買進要另付約 1% 的手續費與稅；賣出以市價九五折成交，獲利扣 10% 稅。住宅與收藏會隨時間增值或漲跌，車、船、飛機會貶值，每月都有持有成本。私人飛機讓政府標案評分與聯盟契合度各 +5。</p></details>
      <h3>公益</h3>
      <p class="note">捐款提升個人形象與社會評價，也會上新聞。基金會每月自動捐出設定的金額。</p>
      ${amountRow('me-donate', [1e6, 10e6, 100e6])}
      <div class="row-btns"><button class="btn" data-act="me-donate">捐款</button></div>
      ${amountRow('me-found', [0, 100e3, 1e6], '每月捐款（美元）')}
      <div class="row-btns"><button class="btn" data-act="me-found">${m.foundation ? `基金會每月 ${M(m.foundation)}：更新` : '成立基金會'}</button></div>
      <p class="note">稅率簡化：薪資 30%、股利 20%、出售持股與資產 10%。公司破產時個人資產不受影響（有限責任）。</p>`;
  };

  // ---------- 公司股票：庫藏股 ----------
  const holders0 = U.holdersBox;
  U.holdersBox = () => {
    const S = G.S, F = S.fin, st = F.stock, b = F.buyback;
    let box = '';
    if (st.listed) {
      const room = G.buybackRoom(), chk = G.buybackChecks();
      box = `<section class="buyback"><h4>庫藏股</h4>`;
      if (b) {
        const pct = b.budget ? b.spent / b.budget : 0;
        box += `<p class="note">買回計畫執行中：${new Date(b.start).toISOString().slice(0, 10)} 起 ${b.days} 天，預算 ${M(b.budget)}。已買回 ${G.num(Math.round(b.n))} 股，花費 ${M(b.spent)}${b.n ? `，平均每股 $${(b.spent / b.n).toFixed(2)}` : ''}。</p>
          <div class="meter"><i style="width:${(pct * 100).toFixed(0)}%"></i></div>
          <div class="row-btns"><button class="btn" data-act="bb-stop">停止買回</button></div>`;
      } else {
        box += `<p class="note">由公司在市場上分批買回自己的股票：流通股數減少、每股盈餘提高，你的持股比例也跟著提高；宣布時股價通常上漲 2–4%，年度股東會也會把買回金額算進回饋股東。每年最多買回 10%。</p>
          <ul class="checks">${chk.map(([t, ok, v]) => `<li class="${ok ? 'pos' : 'neg'}"><span>${ok ? '✓' : '✗'}</span>${esc(t)}<em>${v ? esc(String(v)) : ''}</em></li>`).join('')}</ul>
          ${amountRow('bb-amt', [room.money * 0.25, room.money * 0.5, room.money].filter((v) => v >= 1e5).map((v) => Math.floor(v / 1e5) * 1e5), '買回預算（美元）')}
          <div class="row-btns"><label class="fsel"><span>期間</span><select id="bb-days">${[30, 60, 90].map((d) => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${d} 天</option>`).join('')}</select></label><button class="btn primary" data-act="bb-start" ${chk.every((x) => x[1]) ? '' : 'disabled'}>宣布買回</button></div>`;
      }
      const tr = st.treasury || 0;
      if (tr >= 1) {
        const n1 = Math.floor(tr), half = Math.floor(tr / 2);
        box += `<p class="note">目前持有庫藏股 ${G.num(n1)} 股（成本 ${M(F.treasuryCost)}，市值約 ${M(n1 * st.price)}），列在資產負債表的權益減項。</p>
          <div class="row-btns"><button class="btn" data-act="tr-sell" data-n="${half}">賣回市場一半</button><button class="btn" data-act="tr-sell" data-n="${n1}">全部賣回市場</button><button class="btn" data-act="tr-staff" data-n="${Math.max(1, Math.floor(tr / 4))}">發四分之一給員工當獎勵</button></div>`;
      }
      box += '</section>';
    }
    return box + (holders0 ? holders0() : '');
  };

  // ---------- 操作 ----------
  const done = (r, okMsg) => { if (!r || !r.ok) { if (r && r.msg) U.toast(r.msg, true); } else { if (okMsg) U.toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); U.render(); U.updateTop(); } };
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    switch (a) {
      case 'me-fill': { const inp = document.getElementById(d.id); if (inp) inp.value = Math.round(+d.v); return; }
      case 'me-salary': return done(G.setSalary(val('me-salary')), (r) => `年薪設定為 ${M(r.v)}${r.capped ? '（已到董事會上限）' : ''}`);
      case 'me-dist': return done(G.ownerDistribution(val('me-dist')), (r) => `分得 ${M(r.mine)}`);
      case 'me-inject': return done(G.injectCapital(val('me-inject')), '增資完成');
      case 'me-lend': return done(G.lendToCompany(val('me-lend'), +($('#me-rate') || {}).value), '已借給公司');
      case 'me-recall': return done(G.recallLoan(val('me-lend') || G.S.me.lend), '公司已還款');
      case 'me-sell': return done(G.sellOwnShares(+d.f), (r) => (r.warn ? r.warn : '已賣出持股'));
      case 'me-buyown': return done(G.buyOwnShares(val('me-buyown')), (r) => `買進 ${G.num(Math.round(r.n))} 股`);
      case 'me-buyitem': return done(G.buyItem(d.id), (r) => (r.note ? `已購入，但${r.note}` : '已購入'));
      case 'me-sellitem': return done(G.sellItem(+d.uid), (r) => `已出售，得款 ${M(r.proceeds)}`);
      case 'me-donate': return done(G.donate(val('me-donate')), '感謝你的善心');
      case 'me-found': return done(G.setFoundation(val('me-found')), '已更新基金會');
      case 'bb-start': return done(G.startBuyback(val('bb-amt'), +($('#bb-days') || {}).value), '已宣布庫藏股買回');
      case 'bb-stop': return done(G.stopBuyback('提前停止'), '已停止買回');
      case 'tr-sell': return done(G.reissueTreasury(+d.n, 'market'), (r) => `得款 ${M(r.proceeds)}`);
      case 'tr-staff': return done(G.reissueTreasury(+d.n, 'staff'), (r) => `全體士氣 +${r.boost.toFixed(0)}`);
      default: break;
    }
    if (act0) act0(a, d, el);
  };
})();
