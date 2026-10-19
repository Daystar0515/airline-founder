// v1.0 可加到主畫面（PWA）：只在獨立網站（例如 GitHub Pages）啟用；在 claude.ai 預覽或直接開檔案時不啟用。
(function () {
  const G = window.G;
  const top = (() => { try { return window.top === window; } catch (e) { return false; } })();
  G.pwaCapable = top && /^https?:$/.test(location.protocol) && 'serviceWorker' in navigator && !/claude\.ai|claudeusercontent/.test(location.hostname);
  G.isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (!G.pwaCapable) return;
  const head = document.head;
  const add = (tag, attrs) => { const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); head.appendChild(el); };
  add('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  add('link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: 'icons/favicon-32.png' });
  add('link', { rel: 'apple-touch-icon', href: 'icons/apple-touch-icon.png' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: '航空創始人' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
  add('meta', { name: 'theme-color', content: '#eef2f5' });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller && G.ui) G.ui.toast('有新版本，重新整理頁面後就會套用（記得先存檔）');
        });
      });
    }).catch(() => { /* 不支援或被擋下就算了，遊戲照常運作 */ });
  });
})();
