// v1.0.0 地圖細節：晝夜分界（依遊戲時間計算太陽直射點）、颱風與火山灰的影響範圍、暫停起降的機場、飛機塗裝顏色。
(function () {
  const G = window.G, M = G.map;
  const R = Math.PI / 180, DAY = 86400000;
  // 顯示設定（記在這台裝置上）：晝夜預設關閉、天候預設開啟
  M.show.night = false; M.show.wx = true;
  try { const v = JSON.parse(localStorage.getItem('af-map-x') || 'null'); if (v) { M.show.night = !!v.night; M.show.wx = v.wx !== false; } } catch (e) { /* 用預設 */ }
  G.setMapX = (k, on) => {
    M.show[k] = on;
    try { localStorage.setItem('af-map-x', JSON.stringify({ night: M.show.night, wx: M.show.wx })); } catch (e) { /* 存不了就算了 */ }
  };

  // ---------- 太陽位置 ----------
  // 直射點緯度（赤緯）與經度：簡化公式，誤差在 1° 以內，足夠畫晝夜線
  G.subsolar = (t) => {
    const d = new Date(t), y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = (t - y0) / DAY;
    const dec = -23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365.24);
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    // 均時差（分鐘）：讓正午更準
    const B = (2 * Math.PI * (doy - 81)) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    let lon = -15 * (h - 12 + eot / 60);
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec, lon };
  };
  G.isNight = (ap, t) => {
    const s = G.subsolar(t);
    const cz = Math.sin(ap.lat * R) * Math.sin(s.lat * R) + Math.cos(ap.lat * R) * Math.cos(s.lat * R) * Math.cos((ap.lon - s.lon) * R);
    return cz < -0.0145; // 太陽在地平線下（含大氣折射）
  };

  M.underlay = (c, P) => {
    const S = G.S;
    if (!S || !M.show.night) return;
    const s = G.subsolar(S.time), k = P.view.k;
    const lonL = P.view.cx - P.W / 2 / k - 2, lonR = P.view.cx + P.W / 2 / k + 2;
    const step = Math.max(0.5, Math.min(3, 40 / k));
    const td = Math.tan(Math.max(0.2, Math.abs(s.lat)) * R) * Math.sign(s.lat || 1);
    const pts = [];
    for (let lon = lonL; lon <= lonR + step; lon += step) {
      const lat = Math.atan(-Math.cos((lon - s.lon) * R) / td) / R;
      pts.push(P.toScreen(lon, lat, 0));
    }
    // 北半球夏天（赤緯 > 0）夜晚在分界線南側
    const edgeY = s.lat >= 0 ? P.H + 10 : -10;
    // 晨昏帶：三層漸淡，讓分界線柔和一點
    [[0, 0.16], [1.5, 0.05], [3, 0.04]].forEach(([shift, a]) => {
      c.beginPath();
      pts.forEach(([x, y], i) => { const yy = y + (s.lat >= 0 ? shift : -shift) * Math.min(6, k / 6); i ? c.lineTo(x, yy) : c.moveTo(x, yy); });
      c.lineTo(pts[pts.length - 1][0], edgeY); c.lineTo(pts[0][0], edgeY); c.closePath();
      c.fillStyle = `rgba(12,22,48,${a})`; c.fill();
    });
    // 太陽直射點
    for (const o of P.offsets()) {
      const [x, y] = P.toScreen(s.lon, s.lat, o);
      if (x < -20 || x > P.W + 20 || y < -20 || y > P.H + 20) continue;
      c.beginPath(); c.arc(x, y, 6, 0, 7); c.fillStyle = 'rgba(255,200,40,0.9)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
    }
  };

  let fontData = '';
  M.overlay = (c, P) => {
    const S = G.S;
    if (!S || !M.show.wx || !G.activeEvents) return;
    const k = P.view.k;
    G.activeEvents().forEach((e) => {
      if (!e.fx || !e.fx.closed || !e.where || !G.AP[e.where]) return;
      const ap = G.AP[e.where], rad = e.radius || 60;
      const left = Math.max(0, (e.end - S.time) / DAY);
      for (const o of P.offsets()) {
        const [x, y] = P.toScreen(ap.lon, ap.lat, o);
        const [, y2] = P.toScreen(ap.lon, ap.lat + rad / 111, o);
        const rr = Math.max(10, Math.abs(y - y2)), rx = Math.max(10, (k * rad) / (111 * Math.max(0.2, Math.cos(ap.lat * R))));
        if (x + rx < -10 || x - rx > P.W + 10 || y + rr < -10 || y - rr > P.H + 10) continue;
        const storm = e.type === 'storm' && /颱風|颶風/.test(e.wx || '');
        c.save();
        c.beginPath(); c.ellipse(x, y, rx, rr, 0, 0, 7);
        c.fillStyle = storm ? 'rgba(90,120,220,0.16)' : e.wx === '火山灰' ? 'rgba(110,90,80,0.2)' : 'rgba(120,130,150,0.16)'; c.fill();
        c.setLineDash([5, 4]); c.lineWidth = 1.4; c.strokeStyle = storm ? 'rgba(60,90,200,0.75)' : 'rgba(80,70,60,0.7)'; c.stroke(); c.setLineDash([]);
        // 颱風：旋轉的螺旋
        if (storm) {
          const rot = (S.time / 3600000) * 0.6;
          c.translate(x, y); c.rotate(-rot);
          c.lineWidth = 2; c.strokeStyle = 'rgba(60,90,200,0.55)';
          for (let a = 0; a < 2; a++) { c.beginPath(); for (let i = 0; i <= 30; i++) { const th = i / 30 * Math.PI * 1.6 + a * Math.PI, r0 = 3 + (i / 30) * rr * 0.75; const px = Math.cos(th) * r0, py = Math.sin(th) * r0; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); }
        }
        c.restore();
        if (k >= 4) {
          c.font = '600 11px ' + (fontData || (fontData = getComputedStyle(document.documentElement).getPropertyValue('--font-data').trim() || 'monospace'));
          const txt = `${e.wx || e.name} · 剩 ${left < 1 ? Math.max(1, Math.round(left * 24)) + ' 小時' : left.toFixed(1) + ' 天'}`;
          c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.92)'; c.strokeText(txt, x + rx * 0.72, y - rr * 0.72);
          c.fillStyle = '#3a2a7a'; c.fillText(txt, x + rx * 0.72, y - rr * 0.72);
        }
      }
      // 暫停起降的機場：紅色叉叉
      (e.sc.list || []).forEach((iata) => {
        const a = G.AP[iata]; if (!a) return;
        const [x, y] = P.screenOf(a);
        if (x < -10 || x > P.W + 10 || y < -10 || y > P.H + 10) return;
        c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,255,255,0.95)';
        c.beginPath(); c.moveTo(x - 4.5, y - 4.5); c.lineTo(x + 4.5, y + 4.5); c.moveTo(x + 4.5, y - 4.5); c.lineTo(x - 4.5, y + 4.5); c.stroke();
        c.lineWidth = 1.4; c.strokeStyle = '#d23a2f'; c.stroke();
      });
    });
  };

  // ---------- 飛機在地圖上的顏色（塗裝） ----------
  G.planeColors = (ac) => {
    const S = G.S, r = ac.route && S.routes.find((x) => x.id === ac.route);
    const br = G.brandOf && G.brandOf(r);
    if (br) return { body: '#ffffff', tail: br.color };
    const L = S.company.livery;
    if (!L) return { body: '#ffffff', tail: S.company.color };
    return { body: L.style === 'full' ? L.tail : L.body, tail: L.tail };
  };
})();
