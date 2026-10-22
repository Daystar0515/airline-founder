// v1.0.0 塗裝：只影響地圖上的飛機圖示——機身、機尾（垂直與水平尾翼）、發動機三個顏色。
// 子航空公司的飛機用它自己的品牌色；重新塗裝全機隊要花錢（第一次設定免費）。
(function () {
  const G = window.G;
  G.LIVERY_PARTS = [['body', '機身'], ['tail', '機尾'], ['engines', '發動機']];
  G.LIVERY_PRESETS = [
    { name: '海軍藍', body: '#ffffff', tail: '#14365f', engines: '#14365f' },
    { name: '朱紅', body: '#ffffff', tail: '#c8102e', engines: '#c8102e' },
    { name: '翡翠', body: '#ffffff', tail: '#0f6b5a', engines: '#c7ced6' },
    { name: '橘色', body: '#ffffff', tail: '#f28c28', engines: '#f28c28' },
    { name: '紫羅蘭', body: '#f6f4fb', tail: '#4b2a7b', engines: '#4b2a7b' },
    { name: '天空藍', body: '#ffffff', tail: '#1f8ad6', engines: '#c7ced6' },
    { name: '銀灰', body: '#d9dee3', tail: '#3a4652', engines: '#3a4652' },
    { name: '全機彩繪', body: '#1f6feb', tail: '#ffffff', engines: '#ffffff' },
  ];
  G.REPAINT_COST = 120e3; // 每架飛機重新塗裝（第一次設定免費）
  const okColor = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
  G.defaultLivery = (S) => ({ body: '#ffffff', tail: S.company.color || '#1f6feb', engines: '#c7ced6' });
  // 開發中版本的塗裝（有樣式、腰線等欄位）只保留三個顏色
  const norm = (L, S) => {
    const d = G.defaultLivery(S);
    if (!L) return d;
    const body = L.style === 'full' && okColor(L.tail) ? L.tail : L.body;
    return { body: okColor(body) ? body : d.body, tail: okColor(L.tail) ? L.tail : d.tail, engines: okColor(L.engines) ? L.engines : d.engines };
  };
  G.livery = () => { const S = G.S; return norm(S.company.livery, S); };
  G.repaintCost = () => G.S.fleet.filter((a) => !G.brandOf || !G.brandOf(G.S.routes.find((r) => r.id === a.route))).length * G.REPAINT_COST;
  G.setLivery = (L) => {
    const S = G.S, cur = S.company.livery ? G.livery() : null;
    const nl = {};
    G.LIVERY_PARTS.forEach(([k]) => (nl[k] = okColor(L[k]) ? L[k].toLowerCase() : G.livery()[k]));
    if (cur && JSON.stringify(cur) === JSON.stringify(nl)) return { ok: true, cost: 0 };
    const cost = cur ? G.repaintCost() : 0;
    if (cost && S.cash < cost) return { ok: false, msg: `資金不足：全機隊重新塗裝需要 ${G.money(cost)}` };
    if (cost) G._spend(cost, 'marketing');
    S.company.livery = nl;
    G.log(cur ? `全機隊換上新塗裝，塗裝費 ${G.money(cost)}` : '設定公司塗裝');
    G._emit('fleet');
    return { ok: true, cost };
  };
  // 子航空公司：白色機身、品牌色機尾；低成本航空的發動機也塗品牌色
  G.brandLivery = (b) => {
    const c = (b && b.color) || '#f28c28';
    return { body: '#ffffff', tail: c, engines: b && b.kind === 'lcc' ? c : '#c7ced6' };
  };
})();
