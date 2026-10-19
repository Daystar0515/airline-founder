// v0.4.2 介面：社群媒體分頁（每週刷新的動態、回應話題、公司自行發文）與分頁提醒徽章。
(function () {
  const G = window.G, U = G.ui;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DAY = 86400000;
  const num = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 萬' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
  const ago = (t) => { const d = Math.floor((G.S.time - t) / DAY); return d <= 0 ? '今天' : d === 1 ? '昨天' : `${d} 天前`; };
  U.socialFilter = U.socialFilter || 'all';
  U.postDraft = U.postDraft || { type: 'promo', text: '', route: '' };

  const pending = () => {
    const S = G.S;
    if (!S || !S.social) return 0;
    return S.social.posts.filter((p) => p.related && !p.own && p.opts && !p.answered).length;
  };
  U.socialBadge = () => {
    const b = document.querySelector('#tabs [data-tab="social"]');
    if (!b) return;
    const n = pending();
    if (n) b.dataset.badge = n; else delete b.dataset.badge;
  };

  function effectsSummary(S) {
    const live = S.social.effects.filter((e) => S.time < e.until);
    if (!live.length) return '';
    const items = live.map((e) => {
      const r = e.route && S.routes.find((x) => x.id === e.route);
      const parts = [];
      if (e.demand) parts.push(`訂位 ${e.demand >= 1 ? '+' : ''}${Math.round((e.demand - 1) * 100)}%`);
      if (e.yield) parts.push(`票價收益 ${Math.round((e.yield - 1) * 100)}%`);
      return `<li><span>${r ? `${r.a}–${r.b}` : '全航線'}</span><b class="${(e.demand || 1) * (e.yield || 1) >= 1 ? 'pos' : 'neg'}">${parts.join('，')}</b><em>剩 ${Math.max(1, Math.ceil((e.until - S.time) / DAY))} 天</em></li>`;
    });
    return `<div class="effects"><h4>目前的社群影響</h4><ul>${items.join('')}</ul></div>`;
  }

  function composer(S) {
    const D = U.postDraft, T = G.SOCIAL_POST_TYPES[D.type];
    const left = G.SOCIAL_WEEKLY_LIMIT - S.social.postedThisWeek;
    if (!U.composeOpen) return `<button class="btn compose-open" data-act="post-compose"><b>＋ 發布貼文</b><span class="meta">本週還能發 ${left} 則</span></button>`;
    const routes = S.routes.map((r) => `<option value="${r.id}" ${+D.route === r.id ? 'selected' : ''}>${r.a}–${r.b}</option>`).join('');
    return `<div class="composer">
      <header><b>發布貼文</b><span class="meta">本週還能發 ${left} 則</span><button class="btn link" data-act="post-compose">收起</button></header>
      <div class="seg" role="group" aria-label="貼文類型">${Object.entries(G.SOCIAL_POST_TYPES).map(([k, t]) => `<button data-act="post-type" data-k="${k}" aria-pressed="${D.type === k}">${t.name}</button>`).join('')}</div>
      <p class="note">${esc(T.desc)}</p>
      ${T.needRoute ? `<label class="field">要宣傳的航線<select data-act="post-route"><option value="">選擇航線</option>${routes}</select></label>` : ''}
      <textarea data-act="post-text" rows="3" maxlength="140" placeholder="想說什麼？留白會使用預設文案">${esc(D.text)}</textarea>
      <div class="row-btns"><span class="spacer"></span><button class="btn primary" data-act="post-publish" ${left <= 0 ? 'disabled' : ''}>發布</button></div>
    </div>`;
  }

  function postCard(p) {
    const C = G.SOCIAL_CATS[p.cat];
    const initial = esc(p.name.slice(0, 1));
    const avatar = p.own && G.S.company.logo ? `<img src="${G.S.company.logo}" alt="">` : initial;
    let foot = '';
    if (p.opts && p.related && !p.own) {
      if (p.answered) foot = `<p class="reply ${p.answered.ok ? 'ok' : 'bad'}">已回應：${esc(p.answered.label)} · ${p.answered.ok ? '效果良好' : '效果不如預期'}</p>`;
      else foot = `<div class="replies"><p class="meta">${p.sentiment < 0 ? '這則話題對公司不利，一週內沒有回應會損害社會評價。' : '要回應這則貼文嗎？'}</p>${p.opts.map((o) => `<button class="reply-opt" data-act="post-reply" data-id="${p.id}" data-k="${o.key}"><b>${esc(o.label)}</b><span>${esc(o.hint)}</span></button>`).join('')}</div>`;
    } else if (p.opts && !p.related && !p.answered) {
      foot = `<div class="replies">${p.opts.map((o) => `<button class="reply-opt" data-act="post-reply" data-id="${p.id}" data-k="${o.key}"><b>${esc(o.label)}</b><span>${esc(o.hint)}</span></button>`).join('')}</div>`;
    } else if (p.answered) foot = `<p class="reply ${p.answered.ok ? 'ok' : 'bad'}">已回應：${esc(p.answered.label)} · ${p.answered.ok ? '效果良好' : '效果不如預期'}</p>`;
    const tone = p.own ? 'own' : !p.related ? '' : p.sentiment < 0 ? 'tone-neg' : p.sentiment > 0 ? 'tone-pos' : '';
    return `<article class="post ${tone}">
      <div class="avatar" style="--c:${p.own ? G.S.company.color : C.color}">${avatar}</div>
      <div class="post-main">
        <header><b>${esc(p.name)}</b><span>@${esc(p.handle)} · ${ago(p.t)}</span><i class="tag" style="--c:${C.color}">${p.own ? '本公司' : C.name}</i></header>
        <p class="post-text">${esc(p.text)}</p>
        ${p.note ? `<p class="reply bad">${esc(p.note)}</p>` : ''}
        <footer><span>♥ ${num(p.likes)}</span><span>轉發 ${num(p.shares)}</span><span>留言 ${num(p.comments)}</span>${p.related && !p.own ? '<span class="about">與公司有關</span>' : ''}</footer>
        ${foot}
      </div>
    </article>`;
  }

  U.socialTab = () => {
    const S = G.S;
    if (!S.social) G.initSocial(S);
    const so = S.social, F = U.socialFilter;
    const list = so.posts.filter((p) => F === 'all' || (F === 'mine' ? p.related : p.cat === F && !p.own) || (F === 'own' && p.own));
    const days = Math.max(1, Math.ceil((so.nextAt - S.time) / DAY));
    const n = pending();
    const filters = [['all', '全部'], ['mine', '與公司有關'], ['news', '新聞'], ['kol', '自媒體'], ['biz', '企業'], ['public', '民眾'], ['own', '我的貼文']];
    return `<div class="sec-head"><h3>社群動態</h3><span class="meta">第 ${so.week + 1} 週 · ${days} 天後刷新</span></div>
      ${n ? `<div class="callout warn"><b>${n} 則與公司有關的話題等待回應</b><p>回應方式會影響社會評價、訂位與股價；負面話題放著不管，下週刷新時會扣社會評價。</p></div>` : ''}
      ${composer(S)}
      ${effectsSummary(S)}
      <div class="seg filter" role="group" aria-label="篩選">${filters.map(([k, nm]) => `<button data-act="social-filter" data-k="${k}" aria-pressed="${F === k}">${nm}</button>`).join('')}</div>
      <div class="feed">${list.length ? list.map(postCard).join('') : '<div class="empty"><b>沒有符合的貼文</b><p>換個篩選條件看看。</p></div>'}</div>`;
  };

  // 地圖置中時扣掉左側面板（電腦版）
  if (G.map) G.map.padLeft = () => {
    if (U.isMobile()) return 0;
    if (document.body.classList.contains('intro')) { const c = $('.intro-card'); return c ? c.getBoundingClientRect().right : 0; }
    const p = $('#panel');
    if (!p) return 0;
    const el = p.dataset.sheet === 'closed' ? $('#tabs') : $('#panel-body');
    return el ? el.getBoundingClientRect().right : 0;
  };

  // ---------- 操作 ----------
  const act0 = U.act3;
  U.act3 = (a, d, el) => {
    if (act0) act0(a, d, el);
    if (a === 'zoom') G.map.zoomBy(+d.f);
    if (a === 'social-filter') { U.socialFilter = d.k; U.render(); }
    if (a === 'post-compose') { U.composeOpen = !U.composeOpen; U.render(); }
    if (a === 'post-type') { U.postDraft.type = d.k; U.render(); }
    if (a === 'post-reply') {
      const r = G.respondPost(+d.id, d.k);
      if (r.ok) U.toast(r.verdict, !r.success);
      U.render(); U.updateTop(); U.socialBadge();
    }
    if (a === 'post-publish') {
      const D = U.postDraft;
      const r = G.publishPost({ type: D.type, text: D.text, routeId: D.route ? +D.route : null });
      if (r.ok) { U.toast(r.note ? '已發布，但' + r.note : '已發布'); D.text = ''; U.socialFilter = 'all'; U.composeOpen = false; } else U.toast(r.msg, true);
      U.render(); U.updateTop();
    }
  };
  const ch0 = U.change3;
  U.change3 = (el, a) => {
    if (ch0 && ch0(el, a)) return true;
    if (a === 'post-route') { U.postDraft.route = el.value; return true; }
    return false;
  };
  document.addEventListener('input', (e) => { if (e.target.dataset.act === 'post-text') U.postDraft.text = e.target.value; });
})();
