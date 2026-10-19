// v1.0 存檔系統：5 個存檔欄位、自動存檔、存檔前檢查、每月備份、壓縮、匯出／匯入存檔檔案。
// 存檔放在瀏覽器的 localStorage；iPhone Safari 一段時間沒開網站可能清掉資料，所以提供匯出成檔案。
(function () {
  const G = window.G;
  const P = 'af-slot-', META = 'af-slots', BACKUP = 'af-backup', LEGACY = 'airline-founder-save-v1', AUTO = 'af-autosave';
  G.SLOTS = 5;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { localStorage.setItem(k, v); },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } },
  };
  const readMeta = () => { try { return JSON.parse(ls.get(META)) || { active: null, slots: {} }; } catch (e) { return { active: null, slots: {} }; } };
  const writeMeta = (m) => { try { ls.set(META, JSON.stringify(m)); } catch (e) { /* 空間不足時 meta 很小，下次再寫 */ } };
  G.slotMeta = () => readMeta();
  G.activeSlot = () => readMeta().active;
  G.setActiveSlot = (n) => { const m = readMeta(); m.active = n; writeMeta(m); };
  const pack = (S) => 'LZ1:' + G.lz.pack(JSON.stringify(S));
  const unpack = (s) => (s.startsWith('LZ1:') ? JSON.parse(G.lz.unpack(s.slice(4))) : JSON.parse(s));
  const summary = (S) => ({ name: S.company.name, code: S.company.code, color: S.company.color, logo: null, time: S.time, saved: Date.now(), cash: Math.round(S.cash), fleet: S.fleet.length, routes: S.routes.length, ver: G.VERSION, over: !!(S.fin && S.fin.bankrupt) || !!S.over });

  // 舊版（單一存檔）搬到第 1 欄
  (function migrateLegacy() {
    const old = ls.get(LEGACY), m = readMeta();
    if (!old || Object.keys(m.slots).length) return;
    try {
      const S = JSON.parse(old);
      ls.set(P + 1, pack(S));
      m.slots[1] = { ...summary(S), saved: Date.now() }; m.active = 1;
      writeMeta(m); ls.del(LEGACY);
    } catch (e) { /* 舊存檔壞了就留著，不刪 */ }
  })();

  // 存檔前檢查：數字壞掉就不要蓋掉上一次正常的存檔
  const bad = (v) => typeof v !== 'number' || !Number.isFinite(v);
  G.saveProblem = (S) => {
    if (!S || !S.company || !Array.isArray(S.fleet) || !Array.isArray(S.routes)) return '存檔結構不完整';
    if (bad(S.cash)) return '現金數值異常';
    if (bad(S.time)) return '遊戲時間異常';
    if (S.fin && (bad(S.fin.retained) || bad(S.fin.capital))) return '財務數值異常';
    if (S.fleet.some((a) => bad(a.hours) || (a.book != null && bad(a.book)))) return '飛機數值異常';
    return null;
  };
  let warned = 0;
  G.lastSaveError = null;
  G.save = (opt) => {
    const S = G.S;
    if (!S) return false;
    if (G.halted && !(opt && opt.force)) return false; // 發生程式錯誤後不自動覆蓋存檔
    const why = G.saveProblem(S);
    if (why) { G.lastSaveError = why; if (Date.now() - warned > 60000) { warned = Date.now(); G.ui && G.ui.toast(`沒有存檔：${why}。上一次正常的存檔仍保留。`, true); } return false; }
    const m = readMeta();
    let n = m.active;
    if (!n) { n = G.freeSlot() || 1; m.active = n; }
    let data;
    try { data = pack(S); } catch (e) { G.lastSaveError = '壓縮失敗'; return false; }
    const write = () => { ls.set(P + n, data); m.slots[n] = summary(S); m.slots[n].size = data.length; writeMeta(m); };
    try { write(); }
    catch (e) {
      // 空間不足：先刪掉每月備份再試一次
      ls.del(BACKUP);
      try { write(); } catch (e2) {
        G.lastSaveError = '瀏覽器儲存空間不足';
        if (Date.now() - warned > 60000) { warned = Date.now(); G.ui && G.ui.toast('瀏覽器儲存空間不足，無法存檔。請到「存檔管理」刪除不用的存檔，或匯出存檔檔案。', true); }
        return false;
      }
    }
    G.lastSaveError = null; G.lastSaved = Date.now();
    // 每個遊戲月的第一次存檔，另外留一份備份
    const mon = new Date(S.time).toISOString().slice(0, 7);
    if (m.backupMonth !== mon || m.backupSlot !== n) {
      try { ls.set(BACKUP, data); const mm = readMeta(); mm.backupMonth = mon; mm.backupSlot = n; mm.backup = summary(S); writeMeta(mm); } catch (e) { /* 備份失敗不影響主存檔 */ }
    }
    if (!G._persistAsked && navigator.storage && navigator.storage.persist) { G._persistAsked = true; navigator.storage.persist().catch(() => {}); }
    return true;
  };
  G.loadSlot = (n) => {
    const s = n === 'backup' ? ls.get(BACKUP) : ls.get(P + n);
    if (!s) return { ok: false, msg: '這個欄位沒有存檔' };
    let S;
    try { S = unpack(s); } catch (e) { return { ok: false, msg: '存檔損毀，無法讀取' + (n !== 'backup' && ls.get(BACKUP) ? '；可以試試「每月備份」' : '') }; }
    try { G.S = G.migrateSave(S); } catch (e) { return { ok: false, msg: '存檔升級失敗：' + e.message }; }
    const m = readMeta();
    if (n === 'backup') { n = m.backupSlot || G.freeSlot() || 1; }
    m.active = n; writeMeta(m);
    G.halted = false;
    G._emit('all');
    return { ok: true, slot: n };
  };
  G.load = () => G.loadSlot(G.activeSlot() || 1).ok;
  G.hasSave = () => Object.keys(readMeta().slots).length > 0;
  G.freeSlot = () => { const m = readMeta(); for (let i = 1; i <= G.SLOTS; i++) if (!m.slots[i]) return i; return null; };
  G.deleteSlot = (n) => { const m = readMeta(); ls.del(P + n); delete m.slots[n]; if (m.active === n) m.active = null; if (m.backupSlot === n) { ls.del(BACKUP); delete m.backup; delete m.backupSlot; delete m.backupMonth; } writeMeta(m); };
  G.wipe = () => { const n = G.activeSlot(); if (n) G.deleteSlot(n); };
  // 新遊戲：用指定欄位（或第一個空欄位）
  G.useSlotForNew = (n) => { const m = readMeta(); m.active = n || G.freeSlot() || 1; writeMeta(m); return m.active; };
  G.storageUsed = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { /* 忽略 */ } return n; };

  // ---------- 自動存檔頻率 ----------
  G.AUTOSAVE = { often: '每 15 秒（推薦）', week: '每遊戲週一次', month: '每遊戲月一次', off: '關閉（只在離開與手動時存檔）' };
  G.autosaveMode = () => ls.get(AUTO) || 'often';
  G.setAutosave = (k) => { try { ls.set(AUTO, k); } catch (e) { /* 忽略 */ } };

  // ---------- 匯出／匯入 ----------
  G.exportSave = () => JSON.stringify({ app: 'airline-founder', ver: G.VERSION, exported: new Date().toISOString(), save: G.S });
  const fileName = () => { const S = G.S, d = new Date(S.time).toISOString().slice(0, 10); return `航空公司創始人-${S.company.code}-${d}.json`; };
  const framed = () => { try { return window.top !== window; } catch (e) { return true; } };
  G.FRAMED_MSG = '在預覽頁面裡無法下載檔案。請用下載的 HTML 檔或 GitHub Pages 上的遊戲開啟後再匯出。';
  G.downloadSave = async () => {
    if (!G.S) return { ok: false, msg: '沒有進行中的遊戲' };
    if (framed()) { G.save({ force: true }); return { ok: false, msg: G.FRAMED_MSG }; }
    G.save({ force: true });
    const name = fileName(), blob = new Blob([G.exportSave()], { type: 'application/json' });
    // iPhone：用分享選單（可以「儲存到檔案」）；其他：直接下載
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (G.ui && G.ui.isMobile && G.ui.isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return { ok: true, name, shared: true };
      }
    } catch (e) { if (e && e.name === 'AbortError') return { ok: false, msg: '已取消' }; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true, name };
  };
  G.importSaveText = (txt, slot) => {
    let o;
    try { o = JSON.parse(txt); } catch (e) { return { ok: false, msg: '不是有效的存檔檔案' }; }
    const S = o && o.app === 'airline-founder' ? o.save : o;
    if (!S || !S.company || !S.fleet) return { ok: false, msg: '檔案裡找不到航空公司存檔' };
    let M;
    try { M = G.migrateSave(S); } catch (e) { return { ok: false, msg: '存檔升級失敗：' + e.message }; }
    const why = G.saveProblem(M);
    if (why) return { ok: false, msg: '存檔內容異常：' + why };
    G.S = M; G.halted = false;
    G.useSlotForNew(slot);
    const ok = G.save({ force: true });
    G._emit('all');
    return { ok: true, saved: ok, slot: G.activeSlot() };
  };
  G.pickSaveFile = () => new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => res(null); rd.readAsText(f); };
    inp.click();
  });
})();

// 匯出指定欄位（不必先讀取）
(function () {
  const G = window.G;
  G.exportSlot = async (n) => {
    const s = (() => { try { return localStorage.getItem('af-slot-' + n); } catch (e) { return null; } })();
    if (!s) return { ok: false, msg: '這個欄位沒有存檔' };
    try { if (window.top !== window) return { ok: false, msg: G.FRAMED_MSG }; } catch (e) { return { ok: false, msg: G.FRAMED_MSG }; }
    let S;
    try { S = s.startsWith('LZ1:') ? JSON.parse(G.lz.unpack(s.slice(4))) : JSON.parse(s); } catch (e) { return { ok: false, msg: '存檔損毀' }; }
    const prev = G.S; G.S = S;
    try { const name = `航空公司創始人-${S.company.code}-${new Date(S.time).toISOString().slice(0, 10)}.json`;
      const blob = new Blob([G.exportSave()], { type: 'application/json' });
      try { const file = new File([blob], name, { type: 'application/json' }); if (G.ui.isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) { G.S = prev; await navigator.share({ files: [file], title: name }); return { ok: true, name, shared: true }; } } catch (e) { if (e && e.name === 'AbortError') { G.S = prev; return { ok: false, msg: '已取消' }; } }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, name };
    } finally { G.S = prev; }
  };
})();
