// v0.5.0 自動產生航空公司標誌：玩家沒有上傳時，依公司名稱、代碼與企業色畫出 500×500 標誌。
// 八種原創樣式（尾翼、字母、羽翼、地球、地平線、羅盤、飛鳥、字印），不模仿任何真實航空公司。
(function () {
  const G = window.G;
  const SIZE = 500, C = 250;
  const FONT = 'Inter, "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif';

  // ---------- 小工具 ----------
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = parseInt(m ? m[1] : 'e8a23a', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const firstChar = (name, code) => {
    const ch = [...(name || '').trim()].find((c) => /\S/.test(c));
    return ch ? (/[a-z]/i.test(ch) ? ch.toUpperCase() : ch) : (code || 'A')[0];
  };

  G.LOGO_STYLES = [
    { key: 'fin', name: '尾翼' }, { key: 'mono', name: '字母' }, { key: 'wing', name: '羽翼' }, { key: 'globe', name: '地球' },
    { key: 'horizon', name: '地平線' }, { key: 'star', name: '羅盤' }, { key: 'bird', name: '飛鳥' }, { key: 'seal', name: '字印' },
  ];

  // ---------- 各樣式 ----------
  const circle = (c, r, fill) => { c.beginPath(); c.arc(C, C, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); };
  const DRAW = {
    fin(c, P, r) {
      circle(c, 240, P.base);
      const lean = 40 + r() * 50;
      c.beginPath(); c.moveTo(118, 392); c.lineTo(250 + lean * 0.3, 92); c.lineTo(352 + lean * 0.3, 92); c.lineTo(322, 392); c.closePath();
      c.fillStyle = '#fff'; c.fill();
      c.save(); c.clip();
      c.fillStyle = P.dark; c.beginPath(); c.moveTo(120, 330); c.lineTo(400, 230); c.lineTo(400, 275); c.lineTo(120, 375); c.closePath(); c.fill();
      c.fillStyle = P.base; c.beginPath(); c.moveTo(120, 285); c.lineTo(400, 185); c.lineTo(400, 210); c.lineTo(120, 310); c.closePath(); c.fill();
      c.restore();
      c.fillStyle = '#fff'; c.font = `800 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(P.code, C, 450);
    },
    mono(c, P, r) {
      circle(c, 240, P.dark);
      const rot = -0.35 - r() * 0.3;
      c.save(); c.translate(C, C); c.rotate(rot);
      c.lineWidth = 22; c.strokeStyle = P.base; c.beginPath(); c.ellipse(0, 0, 205, 78, 0, Math.PI, Math.PI * 2); c.stroke();
      c.restore();
      c.fillStyle = '#fff'; c.font = `900 205px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 16; c.strokeStyle = P.dark; c.lineJoin = 'round'; c.strokeText(P.code, C, C + 12); c.fillText(P.code, C, C + 12);
      c.save(); c.translate(C, C); c.rotate(rot);
      c.lineWidth = 22; c.strokeStyle = P.base; c.beginPath(); c.ellipse(0, 0, 205, 78, 0, 0, Math.PI); c.stroke();
      c.restore();
    },
    wing(c, P, r) {
      circle(c, 240, '#fff');
      c.lineWidth = 18; c.strokeStyle = P.base; c.beginPath(); c.arc(C, C, 226, 0, Math.PI * 2); c.stroke();
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const y = 350 - i * 58, len = 300 - i * 30, x = 95;
        c.beginPath(); c.moveTo(x, y + 30);
        c.quadraticCurveTo(x + len * 0.55, y - 12, x + len, y - 92 - i * 6);
        c.quadraticCurveTo(x + len * 0.6, y + 22, x, y + 70);
        c.closePath(); c.fillStyle = [P.base, P.dark, P.mid, P.base, P.dark][i]; c.fill();
      }
    },
    globe(c, P, r) {
      circle(c, 240, P.base);
      c.save(); c.beginPath(); c.arc(C, C, 175, 0, Math.PI * 2); c.clip();
      c.fillStyle = P.dark; c.fillRect(0, 0, SIZE, SIZE);
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 9;
      [175, 115, 50].forEach((rx) => { c.beginPath(); c.ellipse(C, C, rx, 175, 0, 0, Math.PI * 2); c.stroke(); });
      [-110, -55, 0, 55, 110].forEach((dy) => { c.beginPath(); c.moveTo(0, C + dy); c.lineTo(SIZE, C + dy); c.stroke(); });
      c.restore();
      c.lineWidth = 12; c.strokeStyle = '#fff'; c.beginPath(); c.arc(C, C, 205, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
      const a = Math.PI * 1.78, px = C + 205 * Math.cos(a), py = C + 205 * Math.sin(a);
      c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2); c.scale(6, 6); c.fillStyle = '#fff'; c.fill(G.map.ICONS.narrow); c.restore();
    },
    horizon(c, P, r) {
      c.save(); c.beginPath(); c.arc(C, C, 240, 0, Math.PI * 2); c.clip();
      const g = c.createLinearGradient(0, 0, 0, SIZE); g.addColorStop(0, P.light); g.addColorStop(1, '#fff'); c.fillStyle = g; c.fillRect(0, 0, SIZE, SIZE);
      c.fillStyle = P.base; c.beginPath(); c.arc(C, 300, 110, Math.PI, 0); c.fill();
      [[300, 34, P.dark], [350, 28, P.base], [393, 22, P.dark], [430, 70, P.base]].forEach(([y, h, col]) => { c.fillStyle = col; c.fillRect(0, y, SIZE, h - 8); });
      c.strokeStyle = '#fff'; c.lineWidth = 8; c.lineCap = 'round';
      const tilt = 0.25 + r() * 0.2; c.beginPath(); c.moveTo(60, 230); c.quadraticCurveTo(250, 150 - tilt * 100, 440, 110); c.stroke();
      c.restore();
    },
    star(c, P, r) {
      circle(c, 240, P.dark);
      c.lineWidth = 6; c.strokeStyle = P.base; c.beginPath(); c.arc(C, C, 200, 0, Math.PI * 2); c.stroke();
      const pts = (R1, R2, rot) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = rot + (i * Math.PI) / 4, rr = i % 2 ? R2 : R1; c.lineTo(C + rr * Math.cos(a), C + rr * Math.sin(a)); } c.closePath(); };
      const rot = -Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI / 4);
      pts(185, 52, rot); c.fillStyle = P.base; c.fill();
      pts(110, 30, rot + Math.PI / 4); c.fillStyle = '#fff'; c.fill();
      circle(c, 22, P.dark);
    },
    bird(c, P, r) {
      circle(c, 240, P.base);
      c.fillStyle = '#fff';
      const lift = r() * 30;
      c.beginPath(); c.moveTo(95, 250 - lift);
      c.quadraticCurveTo(180, 150 - lift, 250, 265);
      c.quadraticCurveTo(320, 140, 410, 175 + lift);
      c.quadraticCurveTo(320, 190, 255, 320);
      c.quadraticCurveTo(190, 205, 95, 250 - lift);
      c.fill();
      c.fillStyle = P.dark; c.beginPath(); c.arc(C, C, 240, Math.PI * 0.15, Math.PI * 0.85); c.arc(C, C, 200, Math.PI * 0.85, Math.PI * 0.15, true); c.fill();
    },
    seal(c, P, r) {
      const rr = 70, x = 20, w = 460;
      c.beginPath(); c.roundRect ? c.roundRect(x, x, w, w, rr) : c.rect(x, x, w, w); c.fillStyle = P.base; c.fill();
      c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.roundRect ? c.roundRect(52, 52, 396, 396, 46) : c.rect(52, 52, 396, 396); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const ch = P.initial, cjk = /[㐀-鿿]/.test(ch);
      c.font = `${cjk ? 700 : 900} ${cjk ? 270 : 300}px ${FONT}`;
      c.fillText(ch, C, C + (cjk ? 12 : 18));
      c.fillStyle = P.dark; c.fillRect(52, 395, 396, 53);
      c.fillStyle = '#fff'; c.font = `800 34px ${FONT}`; c.fillText(P.code, C, 423);
    },
  };

  // seed：同一個名稱與代碼預設得到同一個樣式；按「換一個」就把 seed 加一
  G.logoStyleFor = (name, code, seed) => G.LOGO_STYLES[(hash((name || '') + '|' + (code || '')) + (seed || 0)) % G.LOGO_STYLES.length];
  G.genLogo = ({ name, code, color, seed }) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    const c = cv.getContext('2d');
    const st = G.logoStyleFor(name, code, seed);
    const P = { base: color, dark: mix(color, '#0d1824', 0.55), mid: mix(color, '#ffffff', 0.35), light: mix(color, '#ffffff', 0.72), code: (code || 'AF').toUpperCase(), initial: firstChar(name, code) };
    DRAW[st.key](c, P, rng(hash(name + code) + (seed || 0) * 7919));
    return { url: cv.toDataURL('image/png'), style: st };
  };
})();
