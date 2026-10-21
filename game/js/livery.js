// v1.0.0 塗裝：側視圖產生器（純 SVG，不用任何圖片素材）、塗裝樣式與預設配色、重新塗裝的費用。
// 機隊卡片的縮圖、塗裝編輯器的預覽都用同一個產生器；地圖上的飛機則用機身色與尾翼色（map10.js）。
(function () {
  const G = window.G;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  G.LIVERY_STYLES = {
    classic: { name: '經典腰線', desc: '白色機身、窗戶下一道腰線、機腹淺色' },
    band: { name: '彩色機腹', desc: '下半部整片企業色，現代傳統航空常見' },
    swoosh: { name: '弧形飾帶', desc: '從機身中段掃向尾翼的弧形色帶' },
    minimal: { name: '歐式純白', desc: '全白機身，只有尾翼與公司名稱上色' },
    full: { name: '全機彩繪', desc: '整架飛機塗上企業色，白色字樣' },
  };
  G.LIVERY_PRESETS = [
    { name: '海軍藍金', body: '#ffffff', belly: '#14365f', stripe: '#c9a646', tail: '#14365f', engines: '#14365f', title: '#14365f' },
    { name: '朱紅', body: '#ffffff', belly: '#d7dce1', stripe: '#c8102e', tail: '#c8102e', engines: '#c8102e', title: '#c8102e' },
    { name: '翡翠', body: '#ffffff', belly: '#0f6b5a', stripe: '#0f6b5a', tail: '#0f6b5a', engines: '#d7dce1', title: '#0f6b5a' },
    { name: '橘色低成本', body: '#ffffff', belly: '#f28c28', stripe: '#f28c28', tail: '#f28c28', engines: '#f28c28', title: '#3a3a3a' },
    { name: '紫羅蘭', body: '#f6f4fb', belly: '#4b2a7b', stripe: '#b88be0', tail: '#4b2a7b', engines: '#4b2a7b', title: '#4b2a7b' },
    { name: '天空藍', body: '#ffffff', belly: '#cfe6f7', stripe: '#1f8ad6', tail: '#1f8ad6', engines: '#1f8ad6', title: '#0d4f80' },
  ];
  G.REPAINT_COST = 120e3; // 每架飛機重新塗裝（第一次設定免費）
  G.defaultLivery = (S) => {
    const c = S.company.color || '#1f6feb';
    return { style: 'classic', body: '#ffffff', belly: '#d9dee3', stripe: c, tail: c, engines: '#c7ced6', title: c, tailLogo: 'code' };
  };
  G.livery = () => { const S = G.S; return S.company.livery || G.defaultLivery(S); };
  const okColor = (v) => /^#[0-9a-f]{6}$/i.test(v);
  G.setLivery = (L) => {
    const S = G.S, cur = S.company.livery;
    const nl = { style: G.LIVERY_STYLES[L.style] ? L.style : 'classic' };
    ['body', 'belly', 'stripe', 'tail', 'engines', 'title'].forEach((k) => (nl[k] = okColor(L[k]) ? L[k].toLowerCase() : G.defaultLivery(S)[k]));
    nl.tailLogo = ['code', 'logo', 'none'].includes(L.tailLogo) ? L.tailLogo : 'code';
    const same = cur && JSON.stringify(cur) === JSON.stringify(nl);
    if (same) return { ok: true, cost: 0 };
    const cost = cur ? G.repaintCost() : 0;
    if (cost && S.cash < cost) return { ok: false, msg: `資金不足：全機隊重新塗裝需要 ${G.money(cost)}` };
    if (cost) G._spend(cost, 'marketing');
    S.company.livery = nl;
    S.company.liveryVer = (S.company.liveryVer || 0) + 1;
    G.log(cur ? `全機隊換上新塗裝（${G.LIVERY_STYLES[nl.style].name}），塗裝費 ${G.money(cost)}` : `設定公司塗裝：${G.LIVERY_STYLES[nl.style].name}`);
    // 換新塗裝讓品牌形象短暫提升
    if (cur && G.S.rep < 90) G.S.rep = Math.min(100, G.S.rep + 0.5);
    G._emit('fleet');
    return { ok: true, cost };
  };
  G.repaintCost = () => G.S.fleet.filter((a) => !G.brandOf || !G.brandOf(G.S.routes.find((r) => r.id === a.route))).length * G.REPAINT_COST;
  // 子航空公司的塗裝：低成本用彩色機腹、區域航空用經典腰線、併購保留品牌用原公司的顏色
  G.brandLivery = (b) => {
    const c = b.color || '#f28c28';
    if (b.kind === 'lcc') return { style: 'band', body: '#ffffff', belly: c, stripe: c, tail: c, engines: c, title: c, tailLogo: 'code' };
    if (b.kind === 'regional') return { style: 'classic', body: '#ffffff', belly: '#d9dee3', stripe: c, tail: c, engines: '#c7ced6', title: c, tailLogo: 'code' };
    return { style: 'swoosh', body: '#ffffff', belly: '#d9dee3', stripe: c, tail: c, engines: c, title: c, tailLogo: 'code' };
  };
  G.lccLivery = () => { const b = G.brands().find((x) => x.kind === 'lcc'); return G.brandLivery(b || { kind: 'lcc' }); };

  // ---------- 側視圖 ----------
  // 機頭朝左；viewBox 200 × 60。kind：narrow／wide／prop／regional；freighter 沒有客艙窗戶
  let uid = 0;
  G.liverySVG = (L, o) => {
    o = o || {};
    const id = 'lv' + (++uid);
    const kind = o.kind || 'narrow', wide = kind === 'wide', prop = kind === 'prop';
    const y0 = wide ? 24 : 26, y1 = wide ? 46 : 44, mid = (y0 + y1) / 2, h = y1 - y0;
    const nose = prop ? 10 : 6;
    const fus = `M ${nose + 14} ${y0} L 156 ${y0} Q 176 ${y0 + 1} 193 ${mid - 3} L 193 ${mid + 1} Q 172 ${y1} 148 ${y1} L ${nose + 10} ${y1} Q ${nose} ${y1} ${nose - 2} ${mid + 3} Q ${nose - 2} ${y0 + 4} ${nose + 6} ${y0 + 1.5} Q ${nose + 9} ${y0} ${nose + 14} ${y0} Z`;
    const fin = `M 148 ${y0 + 0.5} L 167 ${wide ? 2 : 4} L 183 ${wide ? 2 : 4} L 190 ${mid - 3.5} Z`;
    const stab = `M 170 ${mid - 2} L 195 ${mid - 6} L 198 ${mid - 3} L 178 ${mid + 1.5} Z`;
    const S = G.S, title = o.title != null ? o.title : S ? S.company.name : '';
    const code = o.code != null ? o.code : S ? S.company.code : '';
    const style = L.style;
    const bodyCol = style === 'full' ? L.tail : L.body;
    let paint = '';
    if (style === 'classic') paint = `<rect x="0" y="${mid + 1.5}" width="200" height="40" fill="${L.belly}"/><rect x="0" y="${mid - 0.4}" width="200" height="${wide ? 2.6 : 2.2}" fill="${L.stripe}"/>`;
    if (style === 'band') paint = `<path d="M 0 ${mid - 1} L 120 ${mid - 1} Q 160 ${mid - 2} 200 ${y0 - 4} L 200 70 L 0 70 Z" fill="${L.belly}"/><path d="M 0 ${mid - 2.6} L 120 ${mid - 2.6} Q 160 ${mid - 3.6} 200 ${y0 - 5.6} L 200 ${y0 - 4} Q 160 ${mid - 2} 120 ${mid - 1} L 0 ${mid - 1} Z" fill="${L.stripe}"/>`;
    if (style === 'swoosh') paint = `<rect x="0" y="${mid + 2}" width="200" height="40" fill="${L.belly}" opacity="0.55"/><path d="M 70 ${y1 + 2} Q 120 ${mid + 2} 200 ${y0 - 6} L 200 ${y0 + 3} Q 130 ${mid + 6} 90 ${y1 + 2} Z" fill="${L.stripe}"/>`;
    if (style === 'minimal') paint = '';
    if (style === 'full') paint = `<rect x="0" y="${mid + 3}" width="200" height="40" fill="${L.belly}" opacity="0.35"/>`;
    // 窗戶
    let win = '';
    if (!o.freighter) {
      const n = wide ? 30 : prop ? 16 : 24, x1 = prop ? 34 : 30, x2 = wide ? 146 : prop ? 120 : 140, wy = mid - (wide ? 3.6 : 3);
      for (let i = 0; i < n; i++) win += `<rect x="${(x1 + ((x2 - x1) * i) / (n - 1)).toFixed(1)}" y="${wy}" width="1.7" height="2.1" rx="0.8"/>`;
      win = `<g fill="${style === 'full' ? 'rgba(255,255,255,0.75)' : '#2b3a4a'}" opacity="0.85">${win}</g>`;
      win += `<rect x="${prop ? 52 : 50}" y="${y0 + 2.5}" width="3.2" height="${h - 7}" rx="1" fill="none" stroke="rgba(30,40,50,0.35)" stroke-width="0.6"/>`;
    } else {
      win = `<rect x="118" y="${y0 + 2}" width="18" height="${h - 6}" rx="1" fill="none" stroke="rgba(30,40,50,0.35)" stroke-width="0.7"/>`;
    }
    const cockpit = `<path d="M ${nose + 1.5} ${mid - 3} Q ${nose + 4} ${y0 + 3} ${nose + 10} ${y0 + 2.6} L ${nose + 11} ${mid - 3.2} Z" fill="#22303d" opacity="0.85"/>`;
    // 機翼與發動機
    let wing, eng;
    if (prop) {
      wing = `<path d="M 74 ${y0 + 0.5} L 112 ${y0 + 0.5} L 106 ${y0 - 3} L 80 ${y0 - 3} Z" fill="#c9d0d7" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>`;
      eng = `<rect x="78" y="${y0 - 1}" width="20" height="7" rx="3" fill="${L.engines}" stroke="rgba(0,0,0,0.3)" stroke-width="0.5"/><rect x="75" y="${y0 - 5}" width="1.4" height="15" fill="#2b2b2b"/>`;
    } else {
      wing = `<path d="M 78 ${y1 - 3} L 122 ${y1 - 3} L 108 ${y1 + 8} L 96 ${y1 + 8} Z" fill="#c9d0d7" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>`;
      eng = wide ? `<rect x="70" y="${y1 + 1}" width="30" height="11" rx="5" fill="${L.engines}" stroke="rgba(0,0,0,0.3)" stroke-width="0.6"/><ellipse cx="71" cy="${y1 + 6.5}" rx="2" ry="5" fill="#59636d"/>`
        : `<rect x="76" y="${y1 + 1}" width="22" height="8" rx="3.6" fill="${L.engines}" stroke="rgba(0,0,0,0.3)" stroke-width="0.6"/><ellipse cx="77" cy="${y1 + 5}" rx="1.5" ry="3.6" fill="#59636d"/>`;
    }
    // 尾翼標誌
    let logo = '';
    const fx = 172, fy = wide ? 16 : 17;
    if (L.tailLogo === 'logo' && o.logo) logo = `<image href="${esc(o.logo)}" x="${fx - 9}" y="${fy - 9}" width="18" height="18" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}-fin)"/>`;
    else if (L.tailLogo !== 'none') logo = `<text x="${fx}" y="${fy + 3.5}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="10" fill="${style === 'full' ? '#ffffff' : L.body}" opacity="0.95">${esc(code)}</text>`;
    const titleCol = style === 'full' ? '#ffffff' : L.title;
    const titleSvg = title ? `<text x="${prop ? 60 : 58}" y="${y0 + (wide ? 6.4 : 5.6)}" font-family="'Noto Sans TC',Inter,Arial,sans-serif" font-weight="700" font-size="${wide ? 6.8 : 6}" fill="${titleCol}" textLength="${Math.min(80, title.length * 6.6)}" lengthAdjust="spacingAndGlyphs">${esc(title)}</text>` : '';
    const reg = o.reg ? `<text x="140" y="${y1 - 1.6}" font-family="Inter,Arial,sans-serif" font-size="3.2" fill="${style === 'full' ? '#fff' : '#3a4652'}" opacity="0.8">${esc(o.reg)}</text>` : '';
    const size = o.w ? `width="${o.w}"${o.h && o.h !== 'auto' ? ` height="${o.h}"` : ''}` : 'width="200" height="60"';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" ${size} role="img" aria-label="${esc(o.label || '飛機塗裝側視圖')}">
      <defs><clipPath id="${id}-f"><path d="${fus}"/></clipPath><clipPath id="${id}-fin"><path d="${fin}"/></clipPath></defs>
      <ellipse cx="100" cy="${y1 + 12}" rx="86" ry="2.2" fill="rgba(0,0,0,0.12)"/>
      ${prop ? '' : wing}
      <path d="${fin}" fill="${L.tail}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
      ${logo}
      <path d="${fus}" fill="${bodyCol}"/>
      <g clip-path="url(#${id}-f)">${paint}</g>
      <path d="${fus}" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="0.6"/>
      <path d="${stab}" fill="${L.tail}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
      ${cockpit}${win}${titleSvg}${reg}
      ${prop ? wing : ''}${eng}
    </svg>`;
  };
  G.liveryKind = (t) => (t.body === 'turboprop' ? 'prop' : t.wide ? 'wide' : 'narrow');

  // 縮圖：同一種塗裝與機型大類只產生一次，用 blob 網址給 <img>，避免每張卡片都塞一大段 SVG
  const cache = new Map();
  G.liveryThumb = (ac) => {
    const S = G.S, t = G.TYPES[ac.type], r = ac.route && S.routes.find((x) => x.id === ac.route);
    const br = G.brandOf ? G.brandOf(r) : null;
    const L = br ? G.brandLivery(br) : G.livery();
    const kind = G.liveryKind(t), fr = !!t.freighter;
    const title = br ? br.name : S.company.name, code = br ? br.code : S.company.code;
    const key = JSON.stringify([L, kind, fr, title, code, L.tailLogo === 'logo' ? (S.company.logo || '').length : 0]);
    let u = cache.get(key);
    if (!u) {
      const svg = G.liverySVG(L, { kind, freighter: fr, title, code, logo: S.company.logo });
      try { u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); } catch (e) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
      cache.set(key, u);
      if (cache.size > 60) { const k0 = cache.keys().next().value; try { URL.revokeObjectURL(cache.get(k0)); } catch (e) { /* 略過 */ } cache.delete(k0); }
    }
    return u;
  };
})();
