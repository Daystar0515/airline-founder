// v0.9.0 航空聯盟：三大真實聯盟（成員依 2026 年 10 月維基百科）、玩家自創聯盟、邀請 AI 或連線朋友、AI 主動申請加入。
// 效益（依真實聯盟的合作內容簡化）：
//   1. 轉機銜接：飛往盟友樞紐的航線，盟友把轉機旅客接給你（一票到底、行李直掛）。
//   2. 常客互惠：會員在聯盟內累積、兌換里程，高等級會員互認 → 商務客更願意搭你。
//   3. 貴賓室共享：飛往盟友樞紐的商務／頭等艙乘客可以用盟友的貴賓室。
//   4. 代碼共享：同航線的盟友改為合作，對你的稀釋大幅減少，也不會對你發動價格戰。
// 成本：入盟費、年費（依機隊規模），自創聯盟有成立費與營運費；聯盟網路越大效益越強（自創聯盟起步較弱）。
(function () {
  const G = window.G;
  const DAY = 86400000, YEAR = 365 * DAY;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const C = () => G.CARRIERS;

  G.ALLY = {
    applyFee: 0.5e6, joinBase: 8e6, joinPer: 0.15e6, joinMax: 30e6,
    duesBase: 1.2e6, duesPer: 30e3,            // 真實聯盟年費：基本＋每架飛機
    ownFound: 3e6, ownBase: 0.3e6, ownPer: 0.15e6, // 自創聯盟：成立費、年度營運費（基本＋每個成員）
    review: 60, integrate: 90, exitMonths: 6, cooldown: 365,
    partnerMul: 0.4, feedDest: 0.12, feedHub: 0.05, ffpB: 0.04, ffpLoy: 0.03, lounge: 0.05,
    req: { fleet: 20, rep: 65, months: 18, intl: 6, credit: 55 },
    own: { fleet: 8, rep: 55 }, maxOwn: 15,
  };
  // 2026 年 10 月的正式成員（維基百科；HA 夏威夷航空 2026 年 4 月以附屬成員加入寰宇一家，資料中已併入 AS）
  const RAW = {
    star: { name: 'Star Alliance', zh: '星空聯盟', color: '#59616c', founded: 1997, tiers: 'Silver／Gold',
      members: 'A3 AC CA AI NZ NH OZ OS AV SN CM OU MS ET BR AZ LO LH ZH SQ SA LX TP TG TK UA',
      note: '成員最多的聯盟。ITA 航空 2026 年 4 月 1 日加入；韓亞航空預計 2026 年 12 月完成與大韓航空整合後退出。' },
    oneworld: { name: 'oneworld', zh: '寰宇一家', color: '#8a2245', founded: 1999, tiers: 'Ruby／Sapphire／Emerald',
      members: 'AS HA AA BA CX FJ AY IB JL MH WY QF QR AT RJ UL',
      note: '斐濟航空 2025 年 4 月升為正式成員、阿曼航空 2025 年 6 月加入、夏威夷航空 2026 年 4 月以附屬成員加入；菲律賓航空宣布 2027 年加入。' },
    skyteam: { name: 'SkyTeam', zh: '天合聯盟', color: '#1c5fae', founded: 2000, tiers: 'Elite／Elite Plus',
      members: 'AR AM UX AF CI MU DL GA KQ KL KE ME SV RO VN VS MF SK',
      note: '北歐航空 2024 年 9 月由星空聯盟轉入；ITA 航空 2025 年退出；俄羅斯航空的會籍自 2022 年起暫停，不列入。' },
  };
  G.ALLIANCES = {};
  G.BENEFITS_REAL = ['常客計畫互惠：在任一成員累積與兌換里程，高等級會員身分互認', '高等級會員與商務艙旅客共用成員的貴賓室，享優先報到、登機與行李', '代碼共享與轉機銜接：一張機票到底、行李直掛、轉機時間有保障', '樞紐機場航廈共用（co-location）', '聯盟環球票與區域通行票'];
  function build() {
    Object.entries(RAW).forEach(([id, a]) => {
      G.ALLIANCES[id] = { id, ...a, members: a.members.split(' ').filter((c) => C()[c]) };
    });
    G.ALLY_OF = {};
    Object.values(G.ALLIANCES).forEach((a) => a.members.forEach((c) => (G.ALLY_OF[c] = a.id)));
  }
  build();

  // ---------- 狀態 ----------
  const blank = () => ({ ver: 1, kind: null, id: null, status: null, at: null, since: null, name: null, color: null, members: [], invites: [], apps: [], inbox: [], cool: {}, news: [], warn: 0 });
  const i0 = G.initV9;
  G.initV9 = (S) => { if (i0) i0(S); S.ally = S.ally || blank(); };
  const A = () => { const S = G.S; if (!S.ally) S.ally = blank(); return S.ally; };
  G.allyState = A;
  const bump = () => { A().ver++; cache = null; };
  function news(text, kind) {
    const al = A();
    al.news.unshift({ t: G.S.time, text });
    al.news = al.news.slice(0, 30);
    G.log(text, kind);
    G._emit('event', { kind: 'ally', text, warn: kind === 'warn' });
  }
  G.allyName = () => { const al = A(); return al.kind === 'real' ? G.ALLIANCES[al.id].zh : al.name; };
  G.allyColor = () => { const al = A(); return al.kind === 'real' ? G.ALLIANCES[al.id].color : al.color; };
  G.allyActive = () => { const al = A(); return al.kind && (al.kind !== 'real' || al.status === 'member'); };
  const intlRoutes = () => G.S.routes.filter((r) => G.AP[r.a].cc !== G.AP[r.b].cc).length;
  const fleetN = () => G.S.fleet.length;

  // ---------- 盟友 ----------
  let cache = null;
  function humanPlayers() {
    const N = G.net;
    if (!N || !N.players) return [];
    return Object.entries(N.players).filter(([id, p]) => id !== N.myId && p && p.code).map(([id, p]) => ({ id, ...p }));
  }
  G.allyPartners = () => {
    const al = A(), key = al.ver + '.' + ((G.net && G.net.ver) || 0) + '.' + (G.S.company.code);
    if (cache && cache.key === key) return cache;
    const ai = new Set(), human = new Set(), hubs = new Set();
    if (G.allyActive()) {
      if (al.kind === 'real') {
        G.ALLIANCES[al.id].members.forEach((c) => { if (c !== G.S.company.code) ai.add(c); });
        humanPlayers().forEach((p) => { if (p.ally && p.ally.kind === 'real' && p.ally.id === al.id && p.ally.status === 'member') human.add(p.code); });
      } else {
        let mem = al.members;
        if (al.kind === 'guest') { const o = humanPlayers().find((p) => p.code === al.owner && p.ally && p.ally.id === al.id); if (o) mem = o.ally.members; }
        mem.forEach((m) => { if (m.code === G.S.company.code) return; (m.kind === 'ai' ? ai : human).add(m.code); });
        if (al.kind === 'guest') human.add(al.owner);
      }
    }
    ai.forEach((c) => C()[c].hubs.forEach((h) => hubs.add(h)));
    const hp = humanPlayers();
    human.forEach((code) => { const p = hp.find((x) => x.code === code); if (p && p.hub) hubs.add(p.hub); });
    // 聯盟網路的航點數 → 效益強度（三大聯盟視為 1）
    let strength = 0, dests = 0;
    if (ai.size || human.size) {
      if (al.kind === 'real') { strength = 1; dests = networkSize([...ai]); }
      else { dests = networkSize([...ai]) + human.size * 30; strength = clamp(dests / 900, 0.2, 0.9); }
    }
    cache = { key, ai, human, hubs, strength, dests, n: ai.size + human.size };
    return cache;
  };
  const netCache = new Map();
  function networkSize(codes) {
    const k = codes.slice().sort().join(',');
    if (netCache.has(k)) return netCache.get(k);
    const set = new Set();
    codes.forEach((c) => C()[c].routes.forEach((r) => { set.add(r.slice(0, 3)); set.add(r.slice(3)); }));
    netCache.set(k, set.size);
    return set.size;
  }
  G.isPartner = (code) => { const P = G.allyPartners(); return P.ai.has(code) || P.human.has(code); };
  G.allyRivalMul = (code) => (G.isPartner(code) ? G.ALLY.partnerMul : 1);
  // 給 segments.js：這條航線因聯盟多出的攬客力
  G.allyBoost = (r, seg, cls) => {
    const P = G.allyPartners();
    if (!P.n || !P.strength) return 1;
    const X = G.ALLY, st = P.strength;
    const destHub = P.hubs.has(r.b), origHub = P.hubs.has(r.a); // 目的地是盟友樞紐：接轉機旅客；出發地也是盟友樞紐：盟友把旅客接給你
    let b = 1;
    if (destHub) b *= 1 + X.feedDest * st;
    if (origHub) b *= 1 + X.feedHub * st;
    if (seg === 'B') {
      b *= 1 + st * (X.ffpB + (G.S.loyalty ? X.ffpLoy : 0));
      if ((cls === 'J' || cls === 'F') && destHub) b *= 1 + X.lounge * st;
    }
    return b;
  };
  // 估算聯盟對每條航線的加成（給介面）
  G.allyRouteGain = (r) => {
    const L = G.allyBoost(r, 'L', 'Y'), B = G.allyBoost(r, 'B', 'J');
    return { L, B };
  };

  // ---------- 真實聯盟：條件與審查 ----------
  G.allyReqs = () => {
    const S = G.S, X = G.ALLY.req, months = (S.time - S.start) / (30 * DAY), c = G.credit();
    const al = A();
    return [
      [`機隊 ≥ ${X.fleet} 架`, fleetN() >= X.fleet, `${fleetN()} 架`],
      [`社會評價 ≥ ${X.rep}`, S.rep >= X.rep, S.rep.toFixed(0)],
      [`營運滿 ${X.months} 個月`, months >= X.months, `${Math.floor(months)} 個月`],
      [`國際航線 ≥ ${X.intl} 條`, intlRoutes() >= X.intl, `${intlRoutes()} 條`],
      ['信用評等 BBB 以上', c.score >= X.credit, c.grade],
      ['近 2 年無失事', !S.safety.lastCrash || S.time - S.safety.lastCrash > 2 * YEAR, S.safety.lastCrash ? '有' : '無'],
      ['目前沒有加入其他聯盟', !al.kind, al.kind ? G.allyName() : '無'],
    ];
  };
  // 網路契合度：成員會不會同意你加入
  G.allyFit = (id) => {
    const S = G.S, al = G.ALLIANCES[id], hub = G.primaryHub(), home = G.homeCC();
    const notes = [];
    let score = 55 + (S.rep - 65) * 0.8 + Math.min(10, fleetN() / 10);
    const conflict = al.members.filter((c) => C()[c].hubs.includes(hub));
    if (conflict.length) { score -= 35 * Math.min(2, conflict.length); notes.push(`你的主要樞紐 ${hub} 也是 ${conflict.map((c) => G.carrierName(C()[c])).join('、')} 的樞紐，既有成員可能反對`); }
    const same = al.members.filter((c) => C()[c].cc === home && !conflict.includes(c));
    if (same.length) { score -= 8 * Math.min(3, same.length); notes.push(`同國已有成員：${same.map((c) => G.carrierName(C()[c])).join('、')}`); }
    const served = new Set();
    al.members.forEach((c) => C()[c].routes.forEach((k) => { served.add(k.slice(0, 3)); served.add(k.slice(3)); }));
    const mine = new Set(); S.routes.forEach((r) => { mine.add(r.a); mine.add(r.b); });
    const newD = [...mine].filter((x) => !served.has(x)).length;
    if (newD) { score += Math.min(20, newD * 2); notes.push(`能為聯盟增加 ${newD} 個新航點`); }
    const hubsOf = new Set(); al.members.forEach((c) => C()[c].hubs.forEach((h) => hubsOf.add(h)));
    const link = S.routes.filter((r) => hubsOf.has(r.b)).length;
    if (link) { score += Math.min(15, link * 3); notes.push(`${link} 條航線能和成員的樞紐銜接`); }
    if (!S.hubs[hub] || !served.has(hub)) { score += 5; notes.push(`${hub} 是聯盟還沒有的市場`); }
    return { score: clamp(score, 0, 100), notes, likely: score >= 50 };
  };
  G.allyJoinFee = () => Math.min(G.ALLY.joinMax, G.ALLY.joinBase + G.ALLY.joinPer * fleetN());
  G.allyDues = () => {
    const al = A(), X = G.ALLY;
    if (!al.kind) return 0;
    if (al.kind === 'real') return al.status === 'member' || al.status === 'joining' ? X.duesBase + X.duesPer * fleetN() : 0;
    if (al.kind === 'own') return X.ownBase + X.ownPer * al.members.length;
    return 0;
  };
  G.allyApply = (id) => {
    const S = G.S, al = A(), a = G.ALLIANCES[id];
    if (!a) return { ok: false, msg: '找不到這個聯盟' };
    if (al.kind) return { ok: false, msg: '你已經在聯盟裡或正在申請' };
    if (al.cool[id] && S.time < al.cool[id]) return { ok: false, msg: `${a.zh}拒絕過你的申請，${Math.ceil((al.cool[id] - S.time) / DAY)} 天後才能再申請` };
    if (!G.allyReqs().every((x) => x[1])) return { ok: false, msg: '尚未符合入盟條件' };
    if (S.cash < G.ALLY.applyFee + G.allyJoinFee()) return { ok: false, msg: `現金不足，申請費加入盟費需要 ${G.money(G.ALLY.applyFee + G.allyJoinFee())}` };
    G._spend(G.ALLY.applyFee, 'alliance');
    Object.assign(al, { kind: 'real', id, status: 'applied', at: S.time + G.ALLY.review * DAY, since: null });
    bump();
    news(`向${a.zh}提出入盟申請，審查約 ${G.ALLY.review} 天`);
    return { ok: true };
  };
  G.allyLeave = () => {
    const S = G.S, al = A();
    if (!al.kind) return { ok: false };
    const name = G.allyName();
    if (al.kind === 'real') {
      if (al.status === 'member' || al.status === 'joining') {
        const fee = (G.allyDues() / 12) * G.ALLY.exitMonths;
        G._spend(fee, 'alliance');
        G.repDelta(-2, `退出${name}`);
        news(`退出${name}，支付 ${G.ALLY.exitMonths} 個月年費作為違約金 ${G.money(fee)}`, 'warn');
        if (G.stockShock) G.stockShock(-0.03);
      } else news(`撤回${name}的入盟申請`);
    } else if (al.kind === 'own') {
      al.members.filter((m) => m.kind === 'player').forEach((m) => G.netSendCode && G.netSendCode(m.code, { t: 'ally-dissolve', id: al.id }));
      news(`解散自創聯盟「${name}」`, 'warn');
    } else if (al.kind === 'guest') {
      if (G.netSendCode) G.netSendCode(al.owner, { t: 'ally-leave', id: al.id, code: S.company.code });
      news(`退出「${name}」`);
    }
    const keep = { cool: al.cool, news: al.news, inbox: al.inbox };
    S.ally = { ...blank(), ...keep, ver: al.ver + 1 };
    cache = null;
    return { ok: true };
  };

  // ---------- 自創聯盟 ----------
  G.allyOwnReqs = () => {
    const S = G.S, X = G.ALLY.own, al = A();
    return [
      [`機隊 ≥ ${X.fleet} 架`, fleetN() >= X.fleet, `${fleetN()} 架`],
      [`社會評價 ≥ ${X.rep}`, S.rep >= X.rep, S.rep.toFixed(0)],
      ['目前沒有加入其他聯盟', !al.kind, al.kind ? G.allyName() : '無'],
      [`現金 ≥ ${G.money(G.ALLY.ownFound)}`, S.cash >= G.ALLY.ownFound, G.money(S.cash)],
    ];
  };
  G.allyFound = (name, color) => {
    const S = G.S, al = A();
    name = String(name || '').trim().slice(0, 24);
    if (!name) return { ok: false, msg: '請輸入聯盟名稱' };
    if (Object.values(G.ALLIANCES).some((a) => a.zh === name || a.name.toLowerCase() === name.toLowerCase())) return { ok: false, msg: '不能和真實聯盟同名' };
    if (!G.allyOwnReqs().every((x) => x[1])) return { ok: false, msg: '尚未符合成立條件' };
    G._spend(G.ALLY.ownFound, 'alliance');
    Object.assign(al, { kind: 'own', id: S.company.code + '-' + Math.floor(S.time / DAY).toString(36), status: 'member', name, color: color || S.company.color, since: S.time, members: [{ code: S.company.code, kind: 'player', name: S.company.name, since: S.time, founder: true }], invites: [], apps: [] });
    bump();
    news(`成立航空聯盟「${name}」，成立費 ${G.money(G.ALLY.ownFound)}`);
    return { ok: true };
  };
  // AI 對邀請的評估（0–1 的同意機率與原因）
  G.allyInviteEval = (code) => {
    const S = G.S, c = C()[code], al = A();
    if (!c) return { p: 0, why: '找不到這家航空公司' };
    if (G.ALLY_OF[code]) return { p: 0, why: `已是${G.ALLIANCES[G.ALLY_OF[code]].zh}成員，不會考慮` };
    const par = G.STOCK_OF && G.STOCK_OF[code];
    if (par && par !== code && G.ALLY_OF[par]) return { p: 0, why: `母公司${G.carrierName(C()[par])}是${G.ALLIANCES[G.ALLY_OF[par]].zh}成員` };
    if (al.members.some((m) => m.code === code)) return { p: 0, why: '已經是成員' };
    const P = G.allyPartners();
    const notes = [];
    let s = 40 + (S.rep - 60) * 0.8 + P.strength * 25;
    const myAps = new Set(); S.routes.forEach((r) => { myAps.add(r.a); myAps.add(r.b); });
    const connect = c.hubs.filter((h) => myAps.has(h)).length + (c.routes.some((k) => k.includes(G.primaryHub())) ? 1 : 0);
    if (connect) { s += Math.min(20, connect * 6); notes.push('雙方航網可以銜接'); }
    const overlap = S.routes.filter((r) => G.carriersOn(r.a, r.b).includes(code)).length;
    if (overlap) { s -= Math.min(24, overlap * 4); notes.push(`和你有 ${overlap} 條重疊航線`); }
    const theirs = G.carrierFleetEst(code), ratio = theirs / Math.max(1, fleetN());
    if (ratio > 20) { s -= 30; notes.push('對方規模遠大於你'); } else if (ratio > 5) { s -= 15; notes.push('對方規模比你大很多'); } else if (ratio < 1) { s += 8; notes.push('你的規模比對方大'); }
    if (c.lcc) { s -= 20; notes.push('低成本航空很少加入聯盟'); }
    if (['EK', 'EY', 'FZ', 'WN', 'FR'].includes(code)) { s -= 25; notes.push('一向堅持不加入聯盟'); }
    const stake = G.stakeIn ? G.stakeIn(code) : 0;
    if (stake >= 0.03) { s += 15; notes.push(`你持有對方 ${(stake * 100).toFixed(1)}% 股權`); }
    return { p: clamp(s / 100, 0.03, 0.9), score: s, notes };
  };
  G.allyInviteAI = (code) => {
    const S = G.S, al = A();
    if (al.kind !== 'own') return { ok: false, msg: '只有自創聯盟的創辦人可以邀請' };
    if (al.members.length >= G.ALLY.maxOwn) return { ok: false, msg: `聯盟最多 ${G.ALLY.maxOwn} 個成員` };
    if (al.invites.some((x) => x.code === code)) return { ok: false, msg: '已經邀請過，等待回覆中' };
    const e = G.allyInviteEval(code);
    if (e.p <= 0) return { ok: false, msg: e.why };
    al.invites.push({ code, kind: 'ai', at: S.time, reply: S.time + (7 + Math.floor(Math.random() * 14)) * DAY, p: e.p });
    bump();
    G.log(`邀請${G.carrierName(C()[code])}加入「${al.name}」`);
    return { ok: true };
  };
  G.allyInviteHuman = (code) => {
    const S = G.S, al = A();
    if (al.kind !== 'own') return { ok: false, msg: '只有自創聯盟的創辦人可以邀請' };
    if (!G.netSendCode) return { ok: false, msg: '需要多人連線' };
    if (al.members.length >= G.ALLY.maxOwn) return { ok: false, msg: `聯盟最多 ${G.ALLY.maxOwn} 個成員` };
    if (al.members.some((m) => m.code === code)) return { ok: false, msg: '已經是成員' };
    const ok = G.netSendCode(code, { t: 'ally-inv', ally: { id: al.id, name: al.name, color: al.color }, from: S.company.code, fromName: S.company.name });
    if (!ok) return { ok: false, msg: '對方不在房間裡' };
    al.invites = al.invites.filter((x) => x.code !== code);
    al.invites.push({ code, kind: 'player', at: S.time, reply: S.time + 14 * DAY });
    bump();
    G.log(`邀請玩家 ${code} 加入「${al.name}」`);
    return { ok: true };
  };
  G.allyKick = (code) => {
    const al = A();
    if (al.kind !== 'own') return { ok: false };
    const m = al.members.find((x) => x.code === code && !x.founder);
    if (!m) return { ok: false };
    al.members = al.members.filter((x) => x !== m);
    if (m.kind === 'player' && G.netSendCode) G.netSendCode(code, { t: 'ally-kick', id: al.id });
    bump();
    news(`${m.name} 退出「${al.name}」`);
    return { ok: true };
  };
  G.allyAnswerApp = (code, yes) => {
    const S = G.S, al = A(), app = al.apps.find((x) => x.code === code);
    if (!app) return { ok: false };
    al.apps = al.apps.filter((x) => x !== app);
    if (yes) {
      if (al.members.length >= G.ALLY.maxOwn) return { ok: false, msg: `聯盟最多 ${G.ALLY.maxOwn} 個成員` };
      al.members.push({ code, kind: 'ai', name: G.carrierName(C()[code]), since: S.time });
      news(`${G.carrierName(C()[code])}正式加入「${al.name}」`);
    } else G.log(`婉拒${G.carrierName(C()[code])}的入盟申請`);
    bump();
    return { ok: true };
  };
  // 收到朋友的邀請
  G.allyAnswerInvite = (from, yes) => {
    const S = G.S, al = A(), inv = al.inbox.find((x) => x.from === from);
    if (!inv) return { ok: false };
    al.inbox = al.inbox.filter((x) => x !== inv);
    if (!yes) { if (G.netSendCode) G.netSendCode(from, { t: 'ally-dec', id: inv.ally.id, code: S.company.code }); bump(); return { ok: true }; }
    if (al.kind) return { ok: false, msg: `請先退出${G.allyName()}` };
    if (!G.netSendCode || !G.netSendCode(from, { t: 'ally-acc', id: inv.ally.id, code: S.company.code, name: S.company.name })) return { ok: false, msg: '對方已經不在房間裡' };
    Object.assign(al, { kind: 'guest', id: inv.ally.id, status: 'member', name: inv.ally.name, color: inv.ally.color, owner: from, since: S.time, members: [{ code: from, kind: 'player', name: inv.fromName, founder: true }, { code: S.company.code, kind: 'player', name: S.company.name }] });
    bump();
    news(`加入 ${inv.fromName} 創立的「${inv.ally.name}」`);
    return { ok: true };
  };

  // ---------- 連線訊息 ----------
  (G.netHandlers = G.netHandlers || []).push(onNet);
  function onNet(from, m) {
    const S = G.S;
    if (!S || !m || !m.t || !m.t.startsWith('ally-')) return;
    const al = A();
    if (m.t === 'ally-inv') {
      al.inbox = al.inbox.filter((x) => x.from !== m.from);
      al.inbox.push({ from: m.from, fromName: m.fromName, ally: m.ally, at: S.time });
      bump();
      G._emit('event', { kind: 'ally', text: `${m.fromName} 邀請你加入航空聯盟「${m.ally.name}」，到「聯盟」分頁回覆` });
    } else if (m.t === 'ally-acc' && al.kind === 'own' && al.id === m.id) {
      al.invites = al.invites.filter((x) => x.code !== m.code);
      if (!al.members.some((x) => x.code === m.code)) al.members.push({ code: m.code, kind: 'player', name: m.name, since: S.time });
      bump();
      news(`${m.name} 加入「${al.name}」`);
    } else if (m.t === 'ally-dec' && al.kind === 'own') {
      al.invites = al.invites.filter((x) => x.code !== m.code); bump();
      G._emit('event', { kind: 'ally', text: `${m.code} 婉拒了聯盟邀請` });
    } else if (m.t === 'ally-leave' && al.kind === 'own' && al.id === m.id) {
      const x = al.members.find((y) => y.code === m.code);
      al.members = al.members.filter((y) => y.code !== m.code); bump();
      if (x) news(`${x.name} 退出「${al.name}」`);
    } else if ((m.t === 'ally-kick' || m.t === 'ally-dissolve') && al.kind === 'guest' && al.id === m.id) {
      const name = al.name;
      S.ally = { ...blank(), cool: al.cool, news: al.news, inbox: al.inbox, ver: al.ver + 1 }; cache = null;
      news(m.t === 'ally-kick' ? `你被移出「${name}」` : `「${name}」已被創辦人解散`, 'warn');
    }
  }
  // 公開給其他玩家的聯盟資訊（併入 netSummary）
  G.netExtras = G.netExtras || [];
  G.netExtras.push(() => {
    const al = A();
    if (!al.kind) return { ally: null };
    if (al.kind === 'real') return { ally: { kind: 'real', id: al.id, status: al.status, name: G.ALLIANCES[al.id].zh, color: G.ALLIANCES[al.id].color } };
    if (al.kind === 'own') return { ally: { kind: 'own', id: al.id, name: al.name, color: al.color, owner: G.S.company.code, members: al.members.map((m) => ({ code: m.code, kind: m.kind, name: m.name })) } };
    return { ally: { kind: 'guest', id: al.id, name: al.name, color: al.color, owner: al.owner } };
  });

  // ---------- 每日 ----------
  G.allianceDaily = () => {
    const S = G.S, al = A(), X = G.ALLY;
    const dues = G.allyDues();
    if (dues > 0) G._spend(dues / 365, 'alliance');
    if (al.kind === 'real' && al.status === 'applied' && S.time >= al.at) {
      const a = G.ALLIANCES[al.id], fit = G.allyFit(al.id), miss = G.allyReqs().slice(0, 6).find((x) => !x[1]), ok = !miss;
      if (ok && fit.likely) {
        const fee = G.allyJoinFee();
        G._spend(fee, 'alliance');
        Object.assign(al, { status: 'joining', at: S.time + X.integrate * DAY });
        bump();
        news(`${a.zh}通過你的入盟申請！支付入盟費 ${G.money(fee)}，接下來約 ${X.integrate} 天進行系統整合（訂位、常客計畫、貴賓室、轉機銜接）`);
      } else {
        const why = !ok ? `審查期間不再符合「${miss[0]}」（目前 ${miss[2]}）` : fit.notes.find((n) => /反對|同國/.test(n)) || '網路契合度不足';
        al.cool[al.id] = S.time + X.cooldown * DAY;
        S.ally = { ...blank(), cool: al.cool, news: al.news, inbox: al.inbox, ver: al.ver + 1 }; cache = null;
        news(`${a.zh}婉拒你的入盟申請：${why}。一年後可以再申請`, 'warn');
      }
    } else if (al.kind === 'real' && al.status === 'joining' && S.time >= al.at) {
      Object.assign(al, { status: 'member', since: S.time });
      bump();
      G.repDelta(3, `正式成為${G.ALLIANCES[al.id].zh}成員`);
      if (G.stockShock) G.stockShock(0.04);
      news(`正式成為${G.ALLIANCES[al.id].zh}成員：轉機銜接、常客互惠、貴賓室共享開始生效`);
    }
    if (al.kind === 'own') {
      // AI 回覆邀請
      al.invites.slice().forEach((inv) => {
        if (S.time < inv.reply) return;
        al.invites = al.invites.filter((x) => x !== inv);
        if (inv.kind !== 'ai') { bump(); return; } // 朋友逾期沒回覆
        const name = G.carrierName(C()[inv.code]);
        if (!G.ALLY_OF[inv.code] && Math.random() < inv.p && al.members.length < X.maxOwn) {
          al.members.push({ code: inv.code, kind: 'ai', name, since: S.time });
          news(`${name}接受邀請，加入「${al.name}」`);
        } else news(`${name}婉拒加入「${al.name}」的邀請`);
        bump();
      });
      al.apps = al.apps.filter((x) => S.time - x.at < 30 * DAY);
    }
    if (new Date(S.time).getUTCDate() === 1) monthly();
  };
  function monthly() {
    const S = G.S, al = A();
    // 真實聯盟：社會評價太低會被警告、再犯除名
    if (al.kind === 'real' && al.status === 'member') {
      if (S.rep < 40) {
        al.warn = (al.warn || 0) + 1;
        if (al.warn >= 3) { const name = G.allyName(); S.ally = { ...blank(), cool: { ...al.cool, [al.id]: S.time + G.ALLY.cooldown * DAY }, news: al.news, inbox: al.inbox, ver: al.ver + 1 }; cache = null; G.repDelta(-4, `被${name}除名`); news(`社會評價長期過低，被${name}除名`, 'warn'); return; }
        news(`${G.allyName()}警告：你的服務品質與評價過低（${S.rep.toFixed(0)}），連續 3 個月未改善將被除名`, 'warn');
      } else al.warn = 0;
    }
    if (al.kind !== 'own') return;
    // AI 成員：評價太低會退出
    if (S.rep < 40) al.members.filter((m) => m.kind === 'ai').forEach((m) => { if (Math.random() < 0.15) { al.members = al.members.filter((x) => x !== m); bump(); news(`${m.name}因為你的評價下滑，退出「${al.name}」`, 'warn'); } });
    // AI 主動申請：在你或盟友樞紐營運、尚未加入聯盟的航空公司
    if (al.members.length >= G.ALLY.maxOwn || al.apps.length >= 3) return;
    const P = G.allyPartners(), spots = new Set([...Object.keys(S.hubs), ...P.hubs]);
    const cands = [];
    spots.forEach((h) => (G.carriersAt(h) || []).slice(0, 12).forEach(([code]) => {
      if (G.allyInviteEval(code).p <= 0 || al.members.some((m) => m.code === code) || al.apps.some((x) => x.code === code) || al.invites.some((x) => x.code === code) || cands.includes(code)) return;
      cands.push(code);
    }));
    const scored = cands.map((code) => ({ code, e: G.allyInviteEval(code) })).filter((x) => x.e.score >= 50).sort((a, b) => b.e.score - a.e.score);
    if (scored.length && Math.random() < 0.3) {
      const x = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
      al.apps.push({ code: x.code, at: S.time, notes: x.e.notes });
      bump();
      news(`${G.carrierName(C()[x.code])}申請加入「${al.name}」，到「聯盟」分頁審核（30 天內有效）`);
    }
  }
})();
