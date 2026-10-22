// 世界地圖：米勒投影、拖曳平移、滾輪縮放、跨換日線無縫顯示、大圓航線與飛行中的飛機。
(function () {
  const G = window.G;
  const M = (G.map = {});
  const R = Math.PI / 180;
  const millerY = (lat) => (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-85, Math.min(85, lat)) * R))) / R;

  let base, top, bctx, tctx, W = 0, H = 0, dpr = 1;
  const view = { cx: 121, cy: millerY(24), k: 6 };
  M.view = view;
  let landPath = null, gridPath = null;
  let dirtyBase = true;
  // 拖曳、縮放時先移動上一張完整畫面的快照，停手後才完整重畫
  let snap = null, sctx = null, snapView = null, interactUntil = 0, lastFull = 0, fullCost = 8;
  M.selected = null; // 選取的機場 IATA
  // v0.8.0 地圖顯示：航線、飛機（記在這台裝置上）
  M.show = { routes: true, planes: true };
  try { const v = localStorage.getItem('af-map-layers'); if (v === 'routes') M.show.planes = false; if (v === 'planes') M.show.routes = false; } catch (e) { /* 無法讀取就用預設 */ }
  M.hover = null;
  M.onPick = null;
  M.pickMode = false; // 創立公司時選擇樞紐
  const K_MAX = 2400; // 最大縮放（每經度像素），約可看清整座機場的跑道
  const KV0 = 60, KV1 = 150; // 從 KV0 開始淡入高精度向量圖層，到 KV1 完全取代點陣底圖
  const invMillerY = (y) => (Math.atan(Math.exp((y * R) / 1.25)) - Math.PI / 4) / 0.4 / R;

  // ---------- 樣式快取：getComputedStyle 很慢，只在初始化與視窗改變時讀一次 ----------
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let T = {};
  function readTokens() {
    T = { sea: css('--sea'), land: css('--land'), border: css('--border'), grid: css('--grid'), ap: css('--ap'), apLarge: css('--ap-large'), curfew: css('--curfew'), accent: css('--accent'), fg: css('--fg'), font: css('--font-data') };
  }

  // ---------- 高精度向量圖層（Natural Earth 10m，10°×10° 分格，兩種精度）----------
  // 檔案放在圖磚資料夾，第一次放大時才載入；每一格也是第一次出現在畫面上時才解碼。
  const lodState = {};
  function loadLod(i) {
    if (lodState[i]) return;
    lodState[i] = 'loading';
    const el = document.createElement('script');
    el.src = M.tileBase + `detail-${i}.js`;
    el.onload = () => { lodState[i] = 'ready'; dirtyBase = true; };
    el.onerror = () => { lodState[i] = 'fail'; };
    document.head.appendChild(el);
  }
  const lodReady = (i) => lodState[i] === 'ready' && window.DETAIL_LODS && window.DETAIL_LODS[i];
  const cellCache = {};
  function cellPaths(i, key) {
    const ck = i + ':' + key;
    if (cellCache[ck] !== undefined) return cellCache[ck];
    const D = window.DETAIL_LODS[i], e = D.cells[key];
    if (!e) return (cellCache[ck] = null);
    const q = D.q, [cx, cy] = key.split('_').map(Number);
    const x0 = (-180 + cx * D.cell) * q, x1 = x0 + D.cell * q, y0 = (-90 + cy * D.cell) * q, y1 = y0 + D.cell * q;
    const onEdge = (ax, ay, bx, by) => (ax === bx && (ax === x0 || ax === x1)) || (ay === by && (ay === y0 || ay === y1));
    const fill = new Path2D(), coast = new Path2D(), bnd = new Path2D();
    e.f.forEach((arr) => {
      let x = 0, y = 0, px = 0, py = 0, sx = 0, sy = 0, first = true;
      for (let j = 0; j < arr.length; j += 2) {
        x += arr[j]; y += arr[j + 1];
        const lon = x / q, my = millerY(y / q);
        if (first) { fill.moveTo(lon, my); coast.moveTo(lon, my); sx = x; sy = y; first = false; }
        else {
          fill.lineTo(lon, my);
          onEdge(px, py, x, y) ? coast.moveTo(lon, my) : coast.lineTo(lon, my); // 格子邊界上的裁切邊不描海岸線
        }
        px = x; py = y;
      }
      fill.closePath();
      if (!onEdge(px, py, sx, sy)) coast.lineTo(sx / q, millerY(sy / q));
    });
    e.b.forEach((arr) => {
      let x = 0, y = 0;
      for (let j = 0; j < arr.length; j += 2) { x += arr[j]; y += arr[j + 1]; j ? bnd.lineTo(x / q, millerY(y / q)) : bnd.moveTo(x / q, millerY(y / q)); }
    });
    return (cellCache[ck] = { fill, coast, bnd });
  }
  // 畫面範圍內的格子（含換日線兩側）
  function visibleCells(cell) {
    const half = W / 2 / view.k, latTop = invMillerY(view.cy + H / 2 / view.k), latBot = invMillerY(view.cy - H / 2 / view.k);
    const out = [];
    const cy0 = Math.max(0, Math.floor((latBot + 90) / cell)), cy1 = Math.min(180 / cell - 1, Math.floor((latTop + 90) / cell));
    for (const o of offsets()) {
      const lon0 = view.cx - half - o, lon1 = view.cx + half - o;
      const cx0 = Math.max(0, Math.floor((lon0 + 180) / cell)), cx1 = Math.min(360 / cell - 1, Math.floor((lon1 + 180) / cell));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push([cx + '_' + cy, o]);
    }
    return out;
  }
  function drawDetail(c, va) {
    const want = view.k >= 450 ? 1 : 0;
    loadLod(0); if (want) loadLod(1);
    const i = want && lodReady(1) ? 1 : lodReady(0) ? 0 : -1;
    if (i < 0) return false;
    const D = window.DETAIL_LODS[i];
    const byOff = {};
    visibleCells(D.cell).forEach(([key, o]) => { const p = cellPaths(i, key); if (p) (byOff[o] = byOff[o] || []).push(p); });
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = va; c.fillStyle = T.sea; c.fillRect(0, 0, W, H);
    for (const o in byOff) {
      const list = byOff[o], fill = new Path2D();
      list.forEach((p) => fill.addPath(p.fill)); // 同一條路徑一次填色，格子接縫不會出現細線
      c.setTransform(dpr * view.k, 0, 0, -dpr * view.k, dpr * (W / 2 + (+o - view.cx) * view.k), dpr * (H / 2 + view.cy * view.k));
      c.globalAlpha = va; c.fillStyle = T.land; c.fill(fill, 'nonzero');
      c.globalAlpha = Math.max(va, 0.35);
      c.strokeStyle = 'rgba(70, 105, 135, 0.7)'; c.lineWidth = 1.1 / view.k;
      list.forEach((p) => c.stroke(p.coast));
      c.strokeStyle = 'rgba(120, 80, 110, 0.75)'; c.lineWidth = 1.3 / view.k; c.setLineDash([5 / view.k, 3 / view.k]);
      list.forEach((p) => c.stroke(p.bnd));
      c.setLineDash([]);
    }
    c.globalAlpha = 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  M.init = (baseEl, topEl) => {
    base = baseEl; top = topEl;
    bctx = base.getContext('2d'); tctx = top.getContext('2d');
    // 陸地
    landPath = new Path2D();
    window.WORLD_POLYS.forEach((ring) => {
      ring.forEach(([lon, lat], i) => (i ? landPath.lineTo(lon, millerY(lat)) : landPath.moveTo(lon, millerY(lat))));
      landPath.closePath();
    });
    gridPath = new Path2D();
    for (let lon = -180; lon <= 180; lon += 30) { gridPath.moveTo(lon, millerY(-80)); gridPath.lineTo(lon, millerY(80)); }
    for (let lat = -60; lat <= 80; lat += 20) { gridPath.moveTo(-180, millerY(lat)); gridPath.lineTo(180, millerY(lat)); }
    readTokens();
    snap = document.createElement('canvas'); sctx = snap.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    requestAnimationFrame(frame);
  };
  function resize() {
    const r = top.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    [base, top].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; });
    snap.width = base.width; snap.height = base.height; snapView = null;
    view.k = Math.max(view.k, W / 360);
    readTokens();
    dirtyBase = true;
  }
  M.invalidate = () => (dirtyBase = true);

  const toScreen = (lon, lat, off) => [(lon + (off || 0) - view.cx) * view.k + W / 2, (view.cy - millerY(lat)) * view.k + H / 2];
  // 回傳畫面上可見的經度位移（處理換日線）
  function offsets() {
    const half = W / 2 / view.k;
    const out = [];
    for (const o of [-360, 0, 360]) if (view.cx - half < 180 + o && view.cx + half > -180 + o) out.push(o);
    return out;
  }
  function screenOf(ap) {
    // 選擇離畫面中心最近的那一份
    let best = null;
    for (const o of [-360, 0, 360]) {
      const p = toScreen(ap.lon, ap.lat, o);
      if (!best || Math.abs(p[0] - W / 2) < Math.abs(best[0] - W / 2)) best = p;
    }
    return best;
  }
  M.screenOf = screenOf;

  // ---------- 大圓航線 ----------
  const gcCache = {};
  // v0.7.0 兩端都是機場時，依實際飛行路徑（繞飛、兩岸航路）分段畫大圓
  function gc(a, b, n, cc) {
    if (!n && a.iata && b.iata && G.AP[a.iata] && G.AP[b.iata] && G.flightPath && a.iata !== b.iata) {
      const p = G.flightPath(a, b, cc);
      if (p.wps.length > 2) {
        const key = a.iata + '>' + b.iata + '>' + (cc || 'me') + 'P';
        if (gcCache[key]) return gcCache[key];
        let out = [];
        for (let i = 1; i < p.wps.length; i++) {
          const seg = gc0(p.wps[i - 1], p.wps[i]);
          if (out.length) { const last = out[out.length - 1][0]; let off = 0; while (seg[0][0] + off - last > 180) off -= 360; while (seg[0][0] + off - last < -180) off += 360; out = out.concat(seg.slice(1).map(([x, y]) => [x + off, y])); }
          else out = seg.slice();
        }
        return (gcCache[key] = out);
      }
    }
    return gc0(a, b, n);
  }
  function gc0(a, b, n) {
    const key = (a.iata || a.lat.toFixed(3) + ',' + a.lon.toFixed(3)) + '>' + (b.iata || b.lat.toFixed(3) + ',' + b.lon.toFixed(3));
    if (gcCache[key]) return gcCache[key];
    const p1 = [a.lat * R, a.lon * R], p2 = [b.lat * R, b.lon * R];
    const d = G.dist(a, b) / 6371;
    const pts = [];
    n = n || Math.max(8, Math.ceil(d * 40));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      let lat, lon;
      if (d < 1e-6) { lat = a.lat; lon = a.lon; } else {
        const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(p1[0]) * Math.cos(p1[1]) + B * Math.cos(p2[0]) * Math.cos(p2[1]);
        const y = A * Math.cos(p1[0]) * Math.sin(p1[1]) + B * Math.cos(p2[0]) * Math.sin(p2[1]);
        const z = A * Math.sin(p1[0]) + B * Math.sin(p2[0]);
        lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / R; lon = Math.atan2(y, x) / R;
      }
      if (prev != null) { while (lon - prev > 180) lon -= 360; while (lon - prev < -180) lon += 360; }
      prev = lon;
      pts.push([lon, lat]);
    }
    return (gcCache[key] = pts);
  }
  M.gc = gc;
  function pointAlong(pts, f) {
    const x = f * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), t = x - i;
    const a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-(millerY(b[1]) - millerY(a[1])), b[0] - a[0])];
  }

  // 大圓航線上某個比例位置的經緯度（給飛行中事件使用）
  M.pointAt = (A, B, f) => { const [lon, lat] = pointAlong(gc(A, B), f); return { lat, lon: ((lon + 540) % 360) - 180 }; };
  // 企業標誌圖片快取
  let logoImg = null, logoSrc = null;
  function logo() {
    const src = G.S && G.S.company.logo;
    if (src !== logoSrc) {
      logoSrc = src; logoImg = null;
      if (src) { const im = new Image(); im.onload = () => { logoImg = im; dirtyBase = true; }; im.src = src; }
    }
    return logoImg;
  }

  // ---------- 底圖 ----------
  function visibleAirports() {
    const S = G.S, k = view.k;
    const th = k < 3 ? 4000 : k < 5 ? 1500 : k < 9 ? 500 : k < 16 ? 120 : 0;
    const must = new Set();
    if (S) { Object.keys(S.hubs).forEach((x) => must.add(x)); S.routes.forEach((r) => { must.add(r.a); must.add(r.b); }); }
    if (M.selected) must.add(M.selected);
    const out = [];
    for (const ap of G.AIRPORTS) {
      if (ap.popK < th && !must.has(ap.iata) && !(k >= 16)) continue;
      const p = screenOf(ap);
      if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      out.push({ ap, x: p[0], y: p[1], must: must.has(ap.iata) });
    }
    return out;
  }
  // ---------- 底圖圖磚（Natural Earth I 21600×10800，米勒投影）----------
  M.tileBase = 'tiles/';
  const tiles = {};
  const TILE_LIMIT = 28; // 解碼後每張 1024² 圖磚約 4 MB，超過就釋放最久沒用到的
  let drawSeq = 0;
  function tile(L, x, y) {
    const key = `${L}/${x}_${y}`;
    let t = tiles[key];
    if (!t) {
      t = tiles[key] = { img: new Image(), ok: false, used: 0, L };
      t.img.decoding = 'async';
      t.img.onload = () => { t.ok = true; dirtyBase = true; };
      t.img.src = M.tileBase + key + '.jpg';
    }
    t.used = drawSeq;
    return t;
  }
  function trimTiles() {
    const keys = Object.keys(tiles);
    if (keys.length <= TILE_LIMIT) return;
    keys.filter((k) => tiles[k].L > 0 && tiles[k].used < drawSeq).sort((a, b) => tiles[a].used - tiles[b].used)
      .slice(0, keys.length - TILE_LIMIT).forEach((k) => { tiles[k].img.src = ''; delete tiles[k]; });
  }
  function drawTiles(c) {
    const TM = window.TILE_META;
    if (!TM) return false;
    const need = view.k * dpr;
    let L = 0;
    while (L < TM.levels - 1 && (TM.base * 2 ** L) / 360 < need * 0.85) L++;
    let any = false;
    const layer = (lv, check) => {
      const m = TM['l' + lv], ppd = m.w / 360, ts = TM.tile / ppd;
      const half = W / 2 / view.k, halfH = H / 2 / view.k;
      for (const o of offsets()) {
        const x0 = view.cx - half - o, x1 = view.cx + half - o, yTop = view.cy + halfH, yBot = view.cy - halfH;
        const tx0 = Math.max(0, Math.floor((x0 + 180) / ts)), tx1 = Math.min(m.nx - 1, Math.floor((x1 + 180) / ts));
        const ty0 = Math.max(0, Math.floor((TM.yMax - yTop) / ts)), ty1 = Math.min(m.ny - 1, Math.floor((TM.yMax - yBot) / ts));
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          const t = tile(lv, tx, ty);
          if (check) { if (!t.ok) return false; continue; }
          if (!t.ok) continue;
          const sx = (-180 + tx * ts + o - view.cx) * view.k + W / 2, sy = (view.cy - (TM.yMax - ty * ts)) * view.k + H / 2;
          c.drawImage(t.img, sx, sy, (t.img.naturalWidth / ppd) * view.k + 0.6, (t.img.naturalHeight / ppd) * view.k + 0.6);
          any = true;
        }
      }
      return true;
    };
    drawSeq++;
    // 目前層級的圖磚都載入了就只畫這一層；否則先墊世界圖與上一層，避免出現空白
    if (L === 0 || !layer(L, true)) { layer(0); if (L >= 2) layer(L - 1); }
    if (L >= 1) layer(L);
    trimTiles();
    return any;
  }
  // 依機型大類的白色飛機圖示（機頭朝 +x）
  const ICONS = (() => {
    const mk = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); for (let i = pts.length - 2; i > 0; i--) p.lineTo(pts[i][0], -pts[i][1]); p.closePath(); return p; };
    const narrow = mk([[9, 0], [7.4, -1.2], [2.2, -1.3], [-1.2, -8.2], [-3.2, -8.2], [-1.6, -1.3], [-6, -1.1], [-7.9, -4.2], [-9.4, -4.2], [-8.6, -0.8], [-9.2, 0]]);
    const wide = mk([[11, 0], [9, -1.9], [3.2, -2], [-1.6, -11.5], [-4.2, -11.5], [-2.2, -2], [-7.6, -1.7], [-10, -5.4], [-11.8, -5.4], [-10.8, -1.2], [-11.4, 0]]);
    const prop = mk([[8.2, 0], [6.8, -1.1], [1.6, -1.1], [1.6, -9.4], [-0.6, -9.4], [-0.6, -1.1], [-5.4, -0.9], [-6.4, -3.6], [-7.8, -3.6], [-7.2, -0.6], [-8, 0]]);
    const wideEng = new Path2D(); [[0.9, 4.8], [0.9, -4.8]].forEach(([x, y]) => wideEng.ellipse(x, y, 1.9, 0.9, 0, 0, 7));
    const props = new Path2D(); [3.6, -3.6, 6.4, -6.4].forEach((y) => { props.moveTo(2.9, y - 1.6); props.lineTo(2.9, y + 1.6); });
    // v1.0.0 塗裝：窄體機與螺旋槳機的發動機
    const narrowEng = new Path2D(); [[1.1, 3.7], [1.1, -3.7]].forEach(([x, y]) => { narrowEng.moveTo(x + 1.5, y); narrowEng.ellipse(x, y, 1.5, 0.75, 0, 0, 7); });
    const propEng = new Path2D(); [3.6, -3.6, 6.4, -6.4].forEach((y) => { propEng.moveTo(2.6, y); propEng.ellipse(1.3, y, 1.3, 0.62, 0, 0, 7); });
    return { narrow, wide, prop, wideEng, props, narrowEng, propEng };
  })();
  M.ICONS = ICONS;
  // fill：機身色；tail：機尾（垂直與水平尾翼）色；eng：發動機色（沒有就用原本的樣子）；fixed：固定縮放（塗裝編輯器的預覽用）
  function drawPlane(c, x, y, ang, t, fill, tail, eng, fixed) {
    const kind = t.body === 'turboprop' ? 'prop' : t.wide ? 'wide' : 'narrow';
    const s = fixed || Math.max(0.62, Math.min(1.15, 0.55 + view.k / 40)) * (t.body === 'regional' ? 0.85 : 1);
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    c.lineJoin = 'round'; c.lineWidth = 1.8 / s; c.strokeStyle = 'rgba(16,26,36,0.88)';
    c.stroke(ICONS[kind]); c.fillStyle = fill; c.fill(ICONS[kind]);
    // v1.0.0 塗裝：尾翼與水平尾翼塗上尾翼色
    if (tail && tail !== fill) { c.save(); c.clip(ICONS[kind]); c.fillStyle = tail; c.fillRect(-13, -7, kind === 'wide' ? 6.6 : kind === 'prop' ? 7.6 : 6.6, 14); c.restore(); }
    if (eng) {
      const ep = ICONS[kind === 'wide' ? 'wideEng' : kind === 'prop' ? 'propEng' : 'narrowEng'];
      c.fillStyle = eng; c.fill(ep); c.lineWidth = 0.5; c.strokeStyle = 'rgba(16,26,36,0.75)'; c.stroke(ep);
    } else if (kind === 'wide') { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill(ICONS.wideEng); }
    if (kind === 'prop') { c.lineWidth = 0.9; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke(ICONS.props); }
    c.restore();
  }
  M.drawIcon = (c, x, y, ang, t, col, scale) => drawPlane(c, x, y, ang, t, col.body, col.tail, col.engines, scale);
  // 深色字加白色外框，在淺色底圖上清楚可讀
  function haloText(c, txt, x, y, color) {
    c.lineWidth = 3.2; c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineJoin = 'round';
    c.strokeText(txt, x, y); c.fillStyle = color; c.fillText(txt, x, y);
  }

  let rwList = null;
  function drawRunways(c) {
    if (!rwList) rwList = Object.keys(window.RUNWAYS).filter((i) => G.AP[i]).map((i) => [G.AP[i], millerY(G.AP[i].lat), window.RUNWAYS[i]]);
    const half = W / 2 / view.k + 0.1, halfH = H / 2 / view.k + 0.1;
    c.save(); c.lineCap = 'butt';
    for (const o of offsets()) {
      for (const [ap, apy, rws] of rwList) {
        const dx = ap.lon + o - view.cx, dy = apy - view.cy;
        if (Math.abs(dx) > half || Math.abs(dy) > halfH) continue;
        const ppm = view.k / (111320 * Math.cos(ap.lat * Math.PI / 180)); // 每公尺幾像素
        rws.forEach(([la1, lo1, la2, lo2, w]) => {
          const [x1, y1] = toScreen(lo1, la1, o), [x2, y2] = toScreen(lo2, la2, o);
          const lw = Math.max(2.2, w * ppm);
          c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
          c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = lw + 2; c.stroke();
          c.strokeStyle = '#3b4652'; c.lineWidth = lw; c.stroke();
          if (lw >= 4) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.8; c.stroke(); c.setLineDash([]); }
        });
      }
    }
    c.restore();
  }

  let visCache = [];
  function drawBase() {
    const c = bctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = T.sea; c.fillRect(0, 0, W, H);
    const va = Math.max(0, Math.min(1, (view.k - KV0) / (KV1 - KV0))); // 向量圖層不透明度
    // 圖磚還沒載入時先用 50m 向量陸地墊底（世界圖磚載入後就不必畫）
    const t0 = window.TILE_META && tile(0, 0, 0);
    if (va < 1 && !(t0 && t0.ok)) {
      for (const o of offsets()) {
        c.setTransform(dpr * view.k, 0, 0, -dpr * view.k, dpr * (W / 2 + (o - view.cx) * view.k), dpr * (H / 2 + view.cy * view.k));
        c.fillStyle = T.land; c.fill(landPath);
      }
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingQuality = 'high';
    const sat = va < 1 || !lodReady(0) ? drawTiles(c) : true; // 向量層還沒載入完成前繼續用圖磚
    if (sat) { c.fillStyle = 'rgba(255, 255, 255, 0.14)'; c.fillRect(0, 0, W, H); } // 稍微提亮，讓航線與文字跳出來
    for (const o of offsets()) {
      c.setTransform(dpr * view.k, 0, 0, -dpr * view.k, dpr * (W / 2 + (o - view.cx) * view.k), dpr * (H / 2 + view.cy * view.k));
      c.lineWidth = 1 / view.k;
      if (view.k < 40) { c.strokeStyle = T.grid; c.stroke(gridPath); }
    }
    // 世界尺度用 50m 國界；放大後換成 10m 向量海岸線與國界，畫面維持銳利
    const vec = va > 0 && drawDetail(c, va);
    if (!vec || va < 1) {
      const a = vec ? 1 - va : 1;
      for (const o of offsets()) {
        c.setTransform(dpr * view.k, 0, 0, -dpr * view.k, dpr * (W / 2 + (o - view.cx) * view.k), dpr * (H / 2 + view.cy * view.k));
        c.globalAlpha = a; c.strokeStyle = T.border; c.lineWidth = 0.8 / view.k; c.stroke(landPath);
      }
      c.globalAlpha = 1;
    }
    if (view.k > KV0 * 0.7) loadLod(0); // 快放大到向量層時先預載
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // v0.7.0 選取的真實航空公司航網
    if (M.show.routes && M.rival && G.CARRIERS && G.CARRIERS[M.rival]) {
      const rc = G.CARRIERS[M.rival], col = G.carrierColor(rc.code);
      c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1;
      const until = performance.now() + 30; let pending = false; // 每一幀最多花 30 毫秒計算繞飛路徑，其餘下一幀再補
      rc.routes.slice(0, 1500).forEach((k) => {
        const A = G.AP[k.slice(0, 3)], B = G.AP[k.slice(3)];
        if (!A || !B) return;
        const ready = G.pathCached(A, B, rc.cc) || performance.now() < until;
        if (!ready) pending = true;
        const pts = ready ? gc(A, B, undefined, rc.cc) : gc0(A, B);
        for (const o of offsets()) {
          c.beginPath();
          pts.forEach(([lon, lat], i) => { const [x, y] = toScreen(lon, lat, o); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.stroke();
        }
      });
      c.globalAlpha = 1;
      if (pending) setTimeout(() => M.invalidate && M.invalidate(), 50);
    }
    // v0.8.0 多人連線：其他玩家的航線
    if (M.show.routes && G.net && G.net.otherRoutes) G.net.otherRoutes().forEach(({ a, b, color }) => {
      const A = G.AP[a], B = G.AP[b];
      if (!A || !B) return;
      const pts = gc(A, B);
      for (const o of offsets()) { c.beginPath(); pts.forEach(([lon, lat], i) => { const [x, y] = toScreen(lon, lat, o); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.globalAlpha = 0.85; c.strokeStyle = color; c.lineWidth = 1.4; c.setLineDash([6, 3]); c.stroke(); }
      c.globalAlpha = 1; c.setLineDash([]);
    });
    // 航線
    const S = G.S;
    if (S && M.show.routes) {
      const col = S.company.color;
      S.routes.forEach((r) => {
        const pts = gc(G.AP[r.a], G.AP[r.b]);
        const active = G.routeAircraft(r).length > 0;
        for (const o of offsets()) {
          c.beginPath();
          pts.forEach(([lon, lat], i) => { const [x, y] = toScreen(lon, lat, o); i ? c.lineTo(x, y) : c.moveTo(x, y); });
          c.globalAlpha = active ? 0.9 : 0.6; c.strokeStyle = '#ffffff'; c.lineWidth = active ? 4.2 : 3; c.setLineDash(active ? [] : [4, 4]); c.stroke();
          c.strokeStyle = active ? col : '#5d6b78';
          c.globalAlpha = active ? 0.95 : 0.75;
          c.lineWidth = active ? 1.8 : 1.1;
          c.stroke();
        }
      });
      c.globalAlpha = 1; c.setLineDash([]);
    }
    // 跑道：放大到機場等級時，用 OurAirports 跑道兩端座標畫出真實方位與長度
    if (view.k >= 150 && window.RUNWAYS) drawRunways(c);
    // 機場
    visCache = visibleAirports();
    const k = view.k;
    const labelTh = k < 10 ? 6000 : k < 20 ? 1500 : k < 40 ? 300 : 0;
    const f11 = '11px ' + T.font, f11b = '700 11px ' + T.font, f12 = '12px ' + T.font, f12b = '700 12px ' + T.font;
    visCache.forEach(({ ap, x, y, must }) => {
      const hub = S && S.hubs[ap.iata];
      if (hub) {
        const s = hub.type === 'primary' ? 7 : 5.5;
        c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
        c.fillStyle = S.company.color; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        c.fillRect(-s / 2, -s / 2, s, s); c.strokeRect(-s / 2, -s / 2, s, s);
        if (G.hubStats(ap.iata).fortress) { c.strokeStyle = S.company.color; c.lineWidth = 1.5; c.strokeRect(-s, -s, s * 2, s * 2); }
        c.restore();
        // 放大後在主要樞紐旁顯示企業標誌
        const im = logo();
        if (im && hub.type === 'primary' && k >= 8) {
          const R = 13, lx = x - 18, ly = y - 20;
          c.save(); c.beginPath(); c.arc(lx, ly, R, 0, 7); c.fillStyle = '#ffffff'; c.fill(); c.clip();
          c.drawImage(im, lx - R, ly - R, R * 2, R * 2); c.restore();
          c.beginPath(); c.arc(lx, ly, R, 0, 7); c.strokeStyle = S.company.color; c.lineWidth = 2; c.stroke();
        }
      } else {
        const r = ap.size === 0 ? 2.8 : ap.size === 1 ? 2.1 : 1.6;
        c.beginPath(); c.arc(x, y, r, 0, 7);
        c.fillStyle = G.curfew(ap) ? T.curfew : ap.size === 0 ? T.apLarge : T.ap;
        c.lineWidth = ap.size === 2 ? 1.2 : 2; c.strokeStyle = 'rgba(255,255,255,0.95)'; c.stroke(); c.fill();
      }
      if (must || ap.popK >= labelTh) {
        c.font = k >= 300 ? (hub ? f12b : f12) : hub ? f11b : f11;
        haloText(c, k >= 300 ? `${ap.iata} ${ap.name}` : k >= 60 ? `${ap.iata} ${ap.city}` : ap.iata, x + 8, y + 4, '#17212b');
      }
    });
    dirtyBase = false;
  }
  // 完整重畫後存一張快照，拖曳、縮放時用它平移縮放，不必每一幀都重畫底圖
  function fullDraw() {
    const t = performance.now();
    drawBase();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, snap.width, snap.height);
    sctx.drawImage(base, 0, 0);
    snapView = { cx: view.cx, cy: view.cy, k: view.k };
    lastFull = performance.now();
    fullCost = fullCost * 0.6 + (lastFull - t) * 0.4;
  }
  function drawSnap() {
    const s = view.k / snapView.k;
    let dcx = snapView.cx - view.cx;
    if (dcx > 180) dcx -= 360; if (dcx < -180) dcx += 360;
    const ox = dcx * view.k + W / 2 - (s * W) / 2, oy = (view.cy - snapView.cy) * view.k + H / 2 - (s * H) / 2;
    const c = bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = T.sea; c.fillRect(0, 0, base.width, base.height);
    c.imageSmoothingQuality = 'low';
    c.drawImage(snap, ox * dpr, oy * dpr, snap.width * s, snap.height * s);
  }
  const interact = () => (interactUntil = performance.now() + 160);

  // ---------- 每幀：飛機、選取、懸停 ----------
  let lastT = performance.now();
  // v1.0：任何一幀出錯都不能讓畫面停住（錯誤交給 guard.js 處理）
  function frame(now) {
    try { frame0(now); } catch (e) { if (G.reportError) G.reportError(e); else console.error(e); }
    requestAnimationFrame(frame);
  }
  function frame0(now) {
    const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
    if (G.tick) G.tick(dt);
    if (dirtyBase) {
      const now = performance.now(), busy = now < interactUntil;
      const s = snapView ? view.k / snapView.k : 0;
      // 互動中：快照可用、縮放差距不大、距離上次完整重畫還不久 → 只移動快照
      if (busy && snapView && s > 0.5 && s < 2.5 && now - lastFull < Math.max(220, fullCost * 5)) drawSnap();
      else fullDraw();
    }
    const c = tctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const S = G.S;
    if (M.underlay) M.underlay(c, { toScreen, offsets, screenOf, W, H, view, millerY });
    if (S && M.show.planes) {
      S.fleet.forEach((ac) => {
        if (ac.st !== 'air' || !ac.leg) return;
        const L = ac.leg, pts = gc(...G.legEnds(L));
        const f = Math.max(0, Math.min(1, (S.time - L.dep) / (L.arr - L.dep)));
        const [lon, lat, ang] = pointAlong(pts, f);
        for (const o of offsets()) {
          const [x, y] = toScreen(lon, lat, o);
          if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
          const pc = G.planeColors ? G.planeColors(ac) : null;
          const plain = L.emergency || (L.ferry && !L.charter);
          drawPlane(c, x, y, ang, G.TYPES[ac.type], L.emergency ? '#ff6b5e' : L.ferry && !L.charter ? '#b8c4ca' : pc ? pc.body : '#ffffff', plain ? null : pc && pc.tail, plain ? null : pc && pc.engines);
        }
      });
    }
    // v1.0.0 疊加圖層：晝夜分界、天候與關閉的機場（map10.js）
    if (M.overlay) M.overlay(c, { toScreen, offsets, screenOf, W, H, view, millerY });
    for (const [iata, style] of [[M.hover, 'hover'], [M.selected, 'sel']]) {
      if (!iata) continue;
      const [x, y] = screenOf(G.AP[iata]);
      c.beginPath(); c.arc(x, y, style === 'sel' ? 9 : 7, 0, 7);
      c.strokeStyle = style === 'sel' ? T.accent : T.fg; c.lineWidth = style === 'sel' ? 2 : 1; c.stroke();
    }
  }

  // ---------- 操作 ----------
  M.zoomBy = (f) => { view.k = Math.max(W / 360, Math.min(K_MAX, view.k * f)); interact(); dirtyBase = true; };
  M.flyTo = (iata, k) => {
    const ap = G.AP[iata];
    if (k) view.k = Math.min(K_MAX, k);
    const pad = M.padLeft ? M.padLeft() : 0; // 扣掉左側面板遮住的寬度，讓機場落在可見區域中央
    view.cx = ap.lon - pad / 2 / view.k; view.cy = millerY(ap.lat);
    dirtyBase = true;
  };
  function pick(x, y) {
    let best = null, bd = 14 * 14;
    visCache.forEach((v) => { const d = (v.x - x) ** 2 + (v.y - y) ** 2; if (d < bd) { bd = d; best = v.ap; } });
    return best;
  }
  function bindInput() {
    let drag = null;
    const pts = new Map();
    let pinch = null;
    top.addEventListener('pointerdown', (e) => {
      top.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; drag = null; }
      else drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cy: view.cy, moved: false };
    });
    top.addEventListener('pointermove', (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        view.k = Math.max(W / 360, Math.min(K_MAX, (pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.d));
        interact(); dirtyBase = true; return;
      }
      if (drag) {
        const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          view.cx = drag.cx - dx / view.k;
          view.cy = Math.max(-140, Math.min(160, drag.cy + dy / view.k));
          if (view.cx > 180) view.cx -= 360; if (view.cx < -180) view.cx += 360;
          interact(); dirtyBase = true;
        }
        return;
      }
      const ap = pick(e.offsetX, e.offsetY);
      const h = ap ? ap.iata : null;
      if (h !== M.hover) { M.hover = h; G.ui && G.ui.tooltip(ap, e.offsetX, e.offsetY); }
      else if (ap) G.ui && G.ui.tooltip(ap, e.offsetX, e.offsetY);
      top.style.cursor = ap ? 'pointer' : 'grab';
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; return; }
      if (drag && drag.moved) interactUntil = 0; // 放開後立刻完整重畫
      if (drag && !drag.moved) {
        const ap = pick(e.offsetX, e.offsetY);
        M.selected = ap ? ap.iata : null;
        dirtyBase = true;
        if (M.onPick) M.onPick(ap);
      }
      drag = null;
    };
    top.addEventListener('pointerup', up);
    top.addEventListener('pointercancel', up);
    top.addEventListener('pointerleave', () => { M.hover = null; G.ui && G.ui.tooltip(null); });
    top.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const nk = Math.max(W / 360, Math.min(K_MAX, view.k * f));
      const mx = e.offsetX - W / 2, my = e.offsetY - H / 2;
      view.cx += mx / view.k - mx / nk;
      view.cy -= my / view.k - my / nk;
      view.k = nk;
      interact(); dirtyBase = true;
    }, { passive: false });
  }
})();
