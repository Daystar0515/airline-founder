// v0.7.0 接近現實的飛行路徑：大圓航線＋避開封閉空域＋兩岸航路。v1.2.0 依 2026 年 10 月的實際情況補強：
// 1. 幾乎所有民航機都避開的空域：烏克蘭、北韓、敘利亞、利比亞、葉門、蘇丹。
// 2. 中東衝突：伊朗、伊拉克、黎巴嫩空域，除了當地的航空公司，多數航空公司避開（歐洲航空安全局建議）。
// 3. 俄羅斯與白俄羅斯空域：2022 年起對歐盟、英、美、加、挪威、瑞士、冰島、澳、紐、日、韓、台灣等國的航空公司關閉或自主避飛。
// 4. 印度與巴基斯坦互相關閉領空（2025 年 4 月起，巴基斯坦一再延長到 2026 年 11 月）。
// 5. 青藏高原：地形太高，客機失壓時無法下降到安全高度，中國以外的航空公司多半避開。
// 6. 台灣出發的航班不能直接穿越台灣海峽進入中國大陸：兩岸航線走北線或南線；飛東南亞、南亞、歐洲要先經香港飛航情報區，
//    再走瓊州海峽、海南島以南，或經廣東、廣西、雲南往緬甸（台灣的航空公司飛歐洲的常規航路）。
// 繞飛時在 1°×1° 格點上找最短路，再拉直成少數幾個轉折點；路徑長度會影響飛行時間、油耗與航程限制。
(function () {
  const G = window.G;
  const R = Math.PI / 180;
  const W = 360, H = 180;
  G.AIRSPACE = {
    allClosed: ['UA', 'KP', 'SY', 'LY', 'YE', 'SD'],
    midClosed: ['IR', 'IQ', 'LB'],
    ruClosed: ['RU', 'BY'],
    ruBanned: new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB CA NO CH IS LI US AU NZ JP KR TW AL ME MK'.split(' ')),
    corridors: [
      { name: '兩岸北線', lat: 27.4, lon: 123.2 },
      { name: '兩岸南線（經香港飛航情報區）', lat: 21.7, lon: 117.4 },
    ],
    // 台灣出發往東南亞、南亞、歐洲的航路（先經香港飛航情報區）
    twGate: { lat: 21.3, lon: 117.2 },
    twRoutes: [
      { name: '經香港、瓊州海峽', pts: [{ lat: 20.25, lon: 110.8 }, { lat: 20.2, lon: 109.6 }] },
      { name: '經香港、海南島以南（三亞飛航情報區）', pts: [{ lat: 17.3, lon: 111.4 }] },
      { name: '經香港、廣東、廣西、雲南往緬甸', pts: [{ lat: 22.2, lon: 112.6 }, { lat: 23.6, lon: 106.6 }, { lat: 25.0, lon: 102.7 }, { lat: 24.7, lon: 98.3 }] },
    ],
    zh: { all: '戰區', mid: '伊朗、伊拉克', ru: '俄羅斯', pk: '巴基斯坦', in: '印度', tibet: '青藏高原', cn: '中國大陸' },
  };
  // ---------- 格點地圖 ----------
  function decode(b64) {
    const bin = atob(b64), out = new Uint8Array(W * H);
    for (let i = 0; i < bin.length; i++) { const v = bin.charCodeAt(i); for (let k = 0; k < 8; k++) { const j = i * 8 + k; if (j < out.length) out[j] = (v >> (7 - k)) & 1; } }
    return out;
  }
  function dilate(m) {
    const o = new Uint8Array(m);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!m[r * W + c]) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr; if (rr < 0 || rr >= H) continue; o[rr * W + ((c + dc + W) % W)] = 1; }
    }
    return o;
  }
  let raw = null;
  const combos = new Map();
  function getRaw() {
    if (raw) return raw;
    const M = window.AIRSPACE_MASKS || {};
    raw = {};
    Object.keys(M).forEach((k) => (raw[k] = decode(M[k])));
    return raw;
  }
  // 依航空公司國籍組合要避開的空域；key 例如 all|mid|ru|tibet
  function getMask(key) {
    let m = combos.get(key);
    if (m) return m;
    const r = getRaw(), base = new Uint8Array(W * H);
    key.split('|').forEach((k) => { const x = r[k]; if (x) for (let i = 0; i < base.length; i++) base[i] |= x[i]; });
    m = { base, wide: dilate(base) };
    combos.set(key, m);
    return m;
  }
  const cellOf = (lat, lon) => { const r = Math.min(H - 1, Math.max(0, Math.floor(90 - lat))), c = ((Math.floor(lon + 180) % W) + W) % W; return r * W + c; };
  const center = (i) => ({ lat: 89.5 - Math.floor(i / W), lon: (i % W) - 179.5 });
  const hav = (a, b) => { const s = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, s))); };
  // 大圓上的取樣點
  function slerpPts(a, b, stepDeg) {
    const d = hav(a, b) / 6371;
    const n = Math.max(1, Math.ceil(d / (stepDeg * R)));
    const p1 = [a.lat * R, a.lon * R], p2 = [b.lat * R, b.lon * R], out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (d < 1e-9) { out.push({ lat: a.lat, lon: a.lon }); continue; }
      const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1[0]) * Math.cos(p1[1]) + B * Math.cos(p2[0]) * Math.cos(p2[1]);
      const y = A * Math.cos(p1[0]) * Math.sin(p1[1]) + B * Math.cos(p2[0]) * Math.sin(p2[1]);
      const z = A * Math.sin(p1[0]) + B * Math.sin(p2[0]);
      out.push({ lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / R, lon: Math.atan2(y, x) / R });
    }
    return out;
  }
  // 端點附近（起降時本來就在當地空域外圍）不算違規
  // ends：端點附近 5×5 格的允許清單（Uint8Array）
  function endZone(cells) {
    const z = new Uint8Array(W * H);
    cells.forEach((e) => { const r = Math.floor(e / W), c = e % W; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr; if (rr >= 0 && rr < H) z[rr * W + ((c + dc + W) % W)] = 1; } });
    return z;
  }
  function clear(a, b, mask, zone) {
    for (const p of slerpPts(a, b, 0.4)) { const i = cellOf(p.lat, p.lon); if (mask[i] && !zone[i]) return false; }
    return true;
  }
  // 每一列往東西、斜向、南北走一格的距離（公里）
  const STEP = (() => { const t = []; for (let r = 0; r < H; r++) { const la = 89.5 - r; t.push({ ew: hav({ lat: la, lon: 0 }, { lat: la, lon: 1 }), up: hav({ lat: la, lon: 0 }, { lat: la + 1, lon: 1 }), dn: hav({ lat: la, lon: 0 }, { lat: la - 1, lon: 1 }) }); } return t; })();
  // ---------- A* ----------
  function astar(a, b, mask, zone) {
    const s = cellOf(a.lat, a.lon), g = cellOf(b.lat, b.lon);
    const gScore = new Float64Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
    // 二元堆積（用型別陣列）
    let hf = new Float64Array(1 << 16), hi = new Int32Array(1 << 16), hn = 0;
    const push = (f, i) => {
      if (hn === hf.length) { const f2 = new Float64Array(hn * 2), i2 = new Int32Array(hn * 2); f2.set(hf); i2.set(hi); hf = f2; hi = i2; }
      let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hi[k] = hi[p]; k = p; } hf[k] = f; hi[k] = i;
    };
    const pop = () => {
      const top = hi[0], lf = hf[--hn], li = hi[hn]; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = -1, mf = lf; if (l < hn && hf[l] < mf) { m = l; mf = hf[l]; } if (r < hn && hf[r] < mf) { m = r; mf = hf[r]; } if (m < 0) break; hf[k] = hf[m]; hi[k] = hi[m]; k = m; }
      hf[k] = lf; hi[k] = li; return top;
    };
    const gc = center(g);
    gScore[s] = 0; push(hav(center(s), gc), s);
    let n = 0;
    while (hn && n++ < 70000) {
      const i = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === g) break;
      const r = Math.floor(i / W), c = i % W, st = STEP[r];
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr; if (rr < 0 || rr >= H) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const j = rr * W + ((c + dc + W) % W);
          if (closed[j] || (mask[j] && !zone[j])) continue;
          const step = !dc ? 111.2 : !dr ? st.ew : dr < 0 ? st.up : st.dn;
          const t = gScore[i] + step;
          if (t < gScore[j]) { gScore[j] = t; came[j] = i; push(t + hav(center(j), gc), j); }
        }
      }
    }
    if (came[g] < 0 && s !== g) return null;
    const cells = []; for (let i = g; i >= 0 && i !== s; i = came[i]) cells.push(i);
    cells.reverse();
    return cells.map(center);
  }
  // 把格點路徑拉直成少數轉折點
  function pull(pts, mask, zone) {
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clear(pts[i], pts[j], mask, zone)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  function segment(a, b, key) {
    const mk = getMask(key);
    const zone = endZone([cellOf(a.lat, a.lon), cellOf(b.lat, b.lon)]);
    if (clear(a, b, mk.base, zone)) return [a, b];
    // v1.2.0 先用加寬一格的遮罩（離邊界遠一點）；找不到或繞太遠時改用原始遮罩，才能穿過高加索這類狹窄走廊
    let cells = astar(a, b, mk.wide, zone), m = mk.wide;
    const c2 = astar(a, b, mk.base, zone);
    const len = (cs) => (cs ? cs.reduce((s, p, i) => s + (i ? hav(cs[i - 1], p) : 0), 0) : Infinity);
    if (c2 && (!cells || len(c2) < len(cells) * 0.93)) { cells = c2; m = mk.base; }
    if (!cells) return [a, b];
    return pull([a, ...cells, b], m, zone);
  }
  const A_ = () => G.AIRSPACE;
  const maskKey = (cc) => {
    const k = ['all'];
    if (!A_().midClosed.includes(cc)) k.push('mid');
    if (A_().ruBanned.has(cc)) k.push('ru');
    if (cc === 'IN') k.push('pk');
    if (cc === 'PK') k.push('in');
    if (cc !== 'CN') k.push('tibet');
    return k.join('|');
  };
  const ccOf = (ap) => ap.cc;
  // 這家航空公司能不能飛這兩座機場（目的地本身在封閉空域內）
  G.airspaceWhy = (A, B, cc) => {
    const S = A_();
    for (const ap of [A, B]) {
      const c = ccOf(ap);
      if (S.allClosed.includes(c)) return `${G.countryZh(ap.cc)}領空目前對民航機關閉`;
      if (S.midClosed.includes(c) && !S.midClosed.includes(cc)) return `${G.countryZh(ap.cc)}一帶衝突，多數航空公司暫停飛航（2026 年 10 月）`;
      if (S.ruClosed.includes(c) && S.ruBanned.has(cc)) return `${G.countryZh(ap.cc)}領空對${G.countryZh(cc)}的航空公司關閉`;
      if ((c === 'PK' && cc === 'IN') || (c === 'IN' && cc === 'PK')) return `${G.countryZh(ap.cc)}領空對${G.countryZh(cc)}的航空公司關閉`;
    }
    return null;
  };
  const pathKm = (wps) => { let km = 0; for (let i = 1; i < wps.length; i++) km += hav(wps[i - 1], wps[i]); return km; };
  const join = (...parts) => parts.reduce((acc, p) => (acc.length ? acc.concat(p.slice(1)) : p.slice()), []);
  // 直飛會穿過哪些要避開的空域（給航路說明用）
  function crossed(a, b, key) {
    const r = getRaw(), zone = endZone([cellOf(a.lat, a.lon), cellOf(b.lat, b.lon)]), out = [];
    key.split('|').forEach((k) => { if (r[k] && !clear(a, b, r[k], zone)) out.push(A_().zh[k] || k); });
    return out;
  }
  const cache = new Map();
  // 飛行路徑：wps 是轉折點（含起訖），km 是實際飛行距離，via 是經過的航路說明
  G.flightPath = (A, B, cc) => {
    cc = cc || G.homeCC();
    const fwd = A.iata < B.iata, X = fwd ? A : B, Y = fwd ? B : A;
    const k = maskKey(cc), key = X.iata + Y.iata + k;
    let p = cache.get(key);
    if (!p) {
      const a = { lat: X.lat, lon: X.lon }, b = { lat: Y.lat, lon: Y.lon };
      let wps, via = [];
      const tw = (x) => x.cc === 'TW', cn = (x) => x.cc === 'CN', near = (x) => ['CN', 'HK', 'MO', 'TW'].includes(x.cc);
      if ((tw(X) && cn(Y)) || (cn(X) && tw(Y))) {
        // 兩岸航路：走總距離較短的一條
        const best = A_().corridors.map((w) => ({ w, d: hav(a, w) + hav(w, b) })).sort((x, y) => x.d - y.d)[0];
        wps = [...segment(a, best.w, k), ...segment(best.w, b, k).slice(1)];
        via.push(best.w.name);
      } else if ((tw(X) && !near(Y)) || (tw(Y) && !near(X))) {
        // 台灣出發：不能直接穿越海峽進入中國大陸
        const T = tw(X) ? a : b, O = tw(X) ? b : a, kc = k + '|cn';
        const zone = endZone([cellOf(T.lat, T.lon), cellOf(O.lat, O.lon)]);
        if (clear(T, O, getMask(kc).base, zone)) wps = segment(T, O, kc);
        else {
          const g = A_().twGate;
          const plans = A_().twRoutes.map((rt) => {
            const pts = [T, g, ...rt.pts];
            const legs = [];
            for (let i = 1; i < pts.length; i++) legs.push(segment(pts[i - 1], pts[i], k));
            legs.push(segment(pts[pts.length - 1], O, kc));
            const w = join(...legs);
            return { w, km: pathKm(w), name: rt.name };
          }).sort((x, y) => x.km - y.km);
          wps = plans[0].w; via.push(plans[0].name);
        }
        if (!tw(X)) wps = wps.slice().reverse();
      } else wps = segment(a, b, k);
      if (wps.length > 2 && !via.length) { const c = crossed(a, b, k); via.push(c.length ? `繞過${c.join('、')}空域` : '繞過封閉空域'); }
      p = { wps, km: pathKm(wps), via, direct: hav(a, b) };
      cache.set(key, p);
    }
    // 回傳方向一致的路徑
    return fwd ? p : (p.rev = p.rev || { ...p, wps: p.wps.slice().reverse() });
  };
  G.pathCached = (A, B, cc) => cache.has((A.iata < B.iata ? A.iata + B.iata : B.iata + A.iata) + maskKey(cc || G.homeCC()));
  G.homeCC = () => {
    const S = G.S, h = S && G.primaryHub && G.primaryHub();
    return h && G.AP[h] ? G.AP[h].cc : 'TW';
  };
  // 玩家航班的實際飛行距離（兩端都是機場時才算路徑；空中轉降等臨時點用大圓距離）
  // 開航檢查：機場類型（v0.6.3）＋封閉空域
  const roleWhy0 = G.routeRoleWhy;
  G.routeRoleWhy = (A, B) => (roleWhy0 && roleWhy0(A, B)) || G.airspaceWhy(A, B, G.homeCC());
  G.legKm = (A, B) => (A.iata && B.iata && G.AP[A.iata] && G.AP[B.iata] && A.iata !== B.iata ? G.flightPath(A, B).km : G.dist(A, B));
})();
