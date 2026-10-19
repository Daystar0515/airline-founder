// v0.6.3 機場類型：國際機場（國際線＋國內線）、國內線機場（只飛國內線）、限定國際機場（國內線＋少數指定的國際航點）。
// 資料由 tools/build_roles.py 依 OpenFlights 2014 年航線產生（data/roles.js）。
// 「國內線」指起訖在同一個國家或地區；台灣、香港、澳門、中國大陸各自算一個地區，兩岸與港澳航線視為國際線。
(function () {
  const G = window.G;
  const ROLE = window.AP_ROLE || {}, ALLOW = window.AP_ALLOW || {};
  G.ROLE_ZH = ['國際機場', '國內線機場', '限定國際機場'];
  G.ROLE_DESC = ['可飛國內線與世界各地的國際線', '只能飛國內線', '可飛國內線，國際線只限特定航點'];
  G.AIRPORTS.forEach((a) => { a.role = ROLE[a.iata] || 0; if (a.role === 2) a.allow = ALLOW[a.iata] || []; });
  G.apRole = (ap) => ap.role || 0;
  // 這座機場能不能飛到另一國的 B
  const sideWhy = (A, B) => {
    if (A.role === 1) return `${A.iata} 是國內線機場，只能飛${G.countryZh(A.cc)}國內航線`;
    if (A.role === 2 && !A.allow.includes(B.iata)) return `${A.iata} 是限定國際機場，國際線只能飛 ${A.allow.join('、')}`;
    return null;
  };
  // 開航前的機場類型檢查：回傳不能開的原因，可以開就回傳 null
  G.routeRoleWhy = (A, B) => {
    if (!A || !B || A.cc === B.cc) return null;
    return sideWhy(A, B) || sideWhy(B, A);
  };
  G.isIntl = (A, B) => A.cc !== B.cc;
  // 限定國際機場可飛的國際航點（給介面用）
  G.allowedIntl = (ap) => (ap.role === 2 ? ap.allow.map((k) => G.AP[k]).filter(Boolean) : []);
})();
