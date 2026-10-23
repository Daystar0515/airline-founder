// v1.0 成就、公司大事記、經營統計（給結局回顧用）。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const intl = (r) => G.AP[r.a].cc !== G.AP[r.b].cc;
  const flying = (r) => G.routeAircraft(r).length > 0;
  const dist = (r) => G.dist(G.AP[r.a], G.AP[r.b]);
  const last12 = (S, k) => (S.fin ? S.fin.statements.slice(-12).reduce((s, x) => s + (x[k] || 0), 0) : 0);
  const years = (S) => (S.time - S.start) / YEAR;
  // [代號, 名稱, 說明, 條件, 進度(可省略)]
  G.ACHIEVEMENTS = [
    ['first-ac', '第一架飛機', '取得第一架飛機', (S) => S.fleet.length >= 1],
    ['first-flight', '首航', '第一條航線載到旅客', (S) => S.stats.pax > 0],
    ['intl', '跨出國門', '營運一條國際航線', (S) => S.routes.some((r) => intl(r) && flying(r))],
    ['longhaul', '洲際飛行', '營運一條 7,000 公里以上的航線', (S) => S.routes.some((r) => dist(r) >= 7000 && flying(r))],
    ['ulr', '超長程', '營運一條 12,000 公里以上的航線', (S) => S.routes.some((r) => dist(r) >= 12000 && flying(r))],
    ['shuttle', '空中巴士', '一條航線每天 10 班以上', (S) => S.routes.some((r) => G.routeFreq(r) >= 10)],
    ['wide', '寬體時代', '機隊有第一架寬體機', (S) => S.fleet.some((a) => G.TYPES[a.type].wide)],
    ['used', '精打細算', '買進或租進一架二手飛機', (S) => S.fleet.some((a) => a.usedBuy) || S.stats.usedBought > 0],
    ['fleet10', '小有規模', '機隊達到 10 架', (S) => S.fleet.length >= 10, (S) => [S.fleet.length, 10]],
    ['fleet50', '區域強權', '機隊達到 50 架', (S) => S.fleet.length >= 50, (S) => [S.fleet.length, 50]],
    ['fleet100', '百機俱樂部', '機隊達到 100 架', (S) => S.fleet.length >= 100, (S) => [S.fleet.length, 100]],
    ['fleet250', '航空巨頭', '機隊達到 250 架', (S) => S.fleet.length >= 250, (S) => [S.fleet.length, 250]],
    ['routes20', '航網成形', '營運 20 條航線', (S) => S.routes.filter(flying).length >= 20, (S) => [S.routes.filter(flying).length, 20]],
    ['routes100', '全球航網', '營運 100 條航線', (S) => S.routes.filter(flying).length >= 100, (S) => [S.routes.filter(flying).length, 100]],
    ['hubs3', '多樞紐策略', '同時擁有 3 個樞紐', (S) => Object.keys(S.hubs).length >= 3, (S) => [Object.keys(S.hubs).length, 3]],
    ['fortress', '要塞樞紐', '主要樞紐的航班占比超過 70%', (S) => Object.keys(S.hubs).some((h) => G.hubStats(h).fortress)],
    ['profit', '轉虧為盈', '第一次單月稅後淨利為正', (S) => S.fin.statements.some((x) => x.ni > 0)],
    ['profit100m', '獲利一億', '近 12 個月稅後淨利達 1 億美元', (S) => last12(S, 'ni') >= 1e8, (S) => [Math.max(0, last12(S, 'ni')) / 1e6, 100]],
    ['rev1b', '十億營收', '近 12 個月營收達 10 億美元', (S) => last12(S, 'rev') >= 1e9, (S) => [last12(S, 'rev') / 1e6, 1000]],
    ['pax1m', '百萬旅客', '累計載客 100 萬人次', (S) => S.stats.pax >= 1e6, (S) => [S.stats.pax / 1e4, 100]],
    ['pax10m', '千萬旅客', '累計載客 1,000 萬人次', (S) => S.stats.pax >= 1e7, (S) => [S.stats.pax / 1e5, 100]],
    ['rep80', '口碑航空', '社會評價達到 80', (S) => S.rep >= 80, (S) => [S.rep, 80]],
    ['safe5', '五年零失事', '營運滿 5 年且從未失事', (S) => years(S) >= 5 && !S.safety.crashes, (S) => [S.safety.crashes ? 0 : years(S), 5]],
    ['decade', '十年老店', '營運滿 10 年', (S) => years(S) >= 10, (S) => [years(S), 10]],
    ['loyalty', '會員經濟', '推出會員方案', (S) => !!S.loyalty],
    ['gov', '政府信賴', '完成一份政府合約', (S) => S.stats.govDone > 0],
    ['ipo', '敲鐘上市', '公司股票上市', (S) => S.fin.stock.listed],
    ['cap10b', '百億市值', '市值達到 100 億美元', (S) => S.fin.stock.listed && S.fin.stock.price * S.fin.stock.shares >= 1e10],
    ['bond', '債市新秀', '發行第一檔公司債', (S) => S.stats.bonds > 0 || (S.fin.bonds || []).length > 0],
    ['investor', '股市投資人', '同時持有 3 家航空公司的股票', (S) => S.mkt && Object.keys(S.mkt.port).length >= 3, (S) => [S.mkt ? Object.keys(S.mkt.port).length : 0, 3]],
    ['ally', '加入聯盟', '成為三大航空聯盟的正式成員', (S) => S.ally && S.ally.kind === 'real' && S.ally.status === 'member'],
    ['ally-own', '自立門戶', '自創聯盟有 3 個以上成員', (S) => S.ally && S.ally.kind === 'own' && S.ally.members.length >= 3],
    ['cash10b', '現金為王', '現金達到 100 億美元', (S) => S.cash >= 1e10],
    ['multi', '好友同場', '在多人連線房間裡和朋友一起玩', () => !!(G.net && G.net.count && G.net.count() >= 2)],
  ];
  const blankStats = (S) => ({ pax: 0, flights: 0, peakFleet: S.fleet.length, peakRoutes: S.routes.length, peakCash: S.cash, peakRep: S.rep, govDone: 0, bonds: 0, usedBought: 0, bestMonthNi: null, worstMonthNi: null });
  const i0 = G.initV9;
  G.initV9 = (S) => { if (i0) i0(S); ensure(S); };
  function ensure(S) {
    if (!S.stats) {
      S.stats = blankStats(S);
      // 舊存檔：用現有的每日紀錄補上累計數字
      (S.months || []).forEach((m) => { S.stats.pax += m.pax || 0; S.stats.flights += m.flights || 0; });
    }
    S.ach = S.ach || {};
    S.timeline = S.timeline || [{ t: S.start, kind: 'found', text: `${S.company.name} 成立，主要樞紐 ${Object.keys(S.hubs).find((h) => S.hubs[h].type === 'primary') || ''}` }];
    return S;
  }
  G.ensureAch = () => G.S && ensure(G.S);
  G.addTimeline = (kind, text) => {
    const S = G.S; if (!S) return;
    ensure(S);
    S.timeline.push({ t: S.time, kind, text });
    if (S.timeline.length > 200) S.timeline.splice(1, 1);
  };
  G.checkAchievements = (quiet) => {
    const S = G.S; if (!S) return [];
    ensure(S);
    const got = [];
    G.ACHIEVEMENTS.forEach(([id, name, desc, cond]) => {
      if (S.ach[id]) return;
      let ok = false;
      try { ok = cond(S); } catch (e) { ok = false; }
      if (!ok) return;
      S.ach[id] = S.time;
      got.push(name);
      G.addTimeline('ach', `解鎖成就「${name}」：${desc}`);
      try { const all = JSON.parse(localStorage.getItem('af-ach-all') || '{}'); all[id] = 1; localStorage.setItem('af-ach-all', JSON.stringify(all)); } catch (e) { /* 忽略 */ }
      if (!quiet) { G.log(`解鎖成就「${name}」`); G._emit('event', { kind: 'achievement', id, name, desc }); }
    });
    return got;
  };
  G.achProgress = (id) => { const a = G.ACHIEVEMENTS.find((x) => x[0] === id); if (!a || !a[4] || !G.S) return null; try { return a[4](G.S); } catch (e) { return null; } };

  // 每天：累計統計、檢查成就
  G.on((w, d) => {
    const S = G.S;
    if (!S) return;
    if (w === 'day') {
      ensure(S);
      const st = S.stats, last = S.days[S.days.length - 1];
      if (last && last.t !== st.lastDayT) { st.lastDayT = last.t; st.pax += last.pax || 0; st.flights += last.flights || 0; }
      st.peakFleet = Math.max(st.peakFleet, S.fleet.length); st.peakRoutes = Math.max(st.peakRoutes, S.routes.length);
      st.peakCash = Math.max(st.peakCash, S.cash); st.peakRep = Math.max(st.peakRep || 0, S.rep);
      const fs = S.fin && S.fin.statements[S.fin.statements.length - 1];
      if (fs && st.lastFs !== `${fs.y}-${fs.m}`) {
        st.lastFs = `${fs.y}-${fs.m}`;
        if (st.bestMonthNi == null || fs.ni > st.bestMonthNi.v) st.bestMonthNi = { v: fs.ni, y: fs.y, m: fs.m };
        if (st.worstMonthNi == null || fs.ni < st.worstMonthNi.v) st.worstMonthNi = { v: fs.ni, y: fs.y, m: fs.m };
      }
      G.checkAchievements();
    }
    if (w === 'event' && d) {
      ensure(S);
      const T = {
        crash: () => `${d.reg || '飛機'} 失事，罹難 ${d.deaths || 0} 人`,
        strike: () => '員工罷工',
        ipo: () => `股票上市，募得 ${G.money(d.net)}`,
        bankrupt: () => '公司破產',
        dismissed: () => ({ shareholders: '被股東會撤換', takeover: '被惡意併購，失去經營權', sold: '公司被收購' }[d.reason] || '被董事會撤換'),
        repossess: () => '銀行收回抵押的飛機',
      }[d.kind];
      if (T) G.addTimeline(d.kind, T());
      if (d.kind === 'gov-done') { S.stats.govDone++; G.addTimeline('gov', `完成政府合約：${d.contract.title}`); }
      if (d.kind === 'ally' && /正式成為|成立航空聯盟|加入 .* 創立的/.test(d.text || '')) G.addTimeline('ally', d.text.replace(/：.*$/, ''));
    }
    if (w === 'fleet') { /* 機隊變化在每日檢查 */ }
  });
  // 發行公司債、買二手機：記進統計
  const bond0 = G.issueBond;
  if (bond0) G.issueBond = (...a) => { const r = bond0(...a); if (r.ok && G.S) { ensure(G.S); G.S.stats.bonds++; G.addTimeline('bond', `發行 ${r.bond.years} 年期公司債 ${G.money(r.bond.amount)}`); } return r; };
  const used0 = G.buyUsed;
  if (used0) G.buyUsed = (...a) => { const r = used0(...a); if (r.ok && G.S) { ensure(G.S); G.S.stats.usedBought++; } return r; };
  const hub0 = G.setHub;
  if (hub0) G.setHub = (...a) => { const r = hub0(...a); if (r && r.ok !== false && G.S && a[0]) G.addTimeline('hub', a[1] === 'primary' ? `主要樞紐設為 ${a[0]}` : `在 ${a[0]} 設立次要樞紐`); return r; };
})();
