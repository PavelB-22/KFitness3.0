/* Kfitnes · «Доступно обновление»: плашка сверху, по нажатию приложение перезагружается на новую версию.
   Иконку удалять и добавлять заново больше не нужно. */

(function () {
  const css = document.createElement('style');
  css.textContent = `
  .upd{position:fixed;z-index:300;left:50%;top:calc(env(safe-area-inset-top, 0px) + 8px);
    transform:translateX(-50%);display:flex;align-items:center;gap:10px;
    width:calc(100% - 24px);max-width:420px;padding:10px 10px 10px 16px;border-radius:99px;
    background:rgba(24,24,27,.94);border:1px solid rgba(255,255,255,.14);
    -webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);
    box-shadow:0 12px 36px rgba(0,0,0,.55);color:#f5f5f5;font:600 14px/1.25 -apple-system,system-ui,sans-serif;
    animation:updIn .35s cubic-bezier(.2,.9,.2,1)}
  @keyframes updIn{from{opacity:0;transform:translate(-50%,-14px)}}
  .upd span{flex:1;min-width:0}
  .upd button{border:0;cursor:pointer;font:inherit;-webkit-tap-highlight-color:transparent}
  .upd .go{padding:9px 16px;border-radius:99px;color:#fff;font-weight:800;
    background:linear-gradient(135deg,#ff4d5e,#e0112b 55%,#8a0016)}
  .upd .x{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.1);color:#cfcfd4;font-size:17px;line-height:1}`;
  document.head.appendChild(css);

  let shown = false;

  function showBanner() {
    if (shown) return;
    shown = true;
    const el = document.createElement('div');
    el.className = 'upd';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>Доступно обновление</span><button class="go">Обновить</button><button class="x" aria-label="Скрыть">×</button>';
    el.querySelector('.x').onclick = () => el.remove();
    el.querySelector('.go').onclick = e => {
      e.target.disabled = true;
      e.target.textContent = 'Обновляю…';
      apply();
    };
    document.body.appendChild(el);
  }

  function apply() {
    try {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }).catch(() => {});
    } catch (e) {}
    setTimeout(() => location.reload(), 200);
  }

  /* ── способ 1: появилась новая версия воркера (sw.js изменился) ── */
  const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showBanner(); });
  }

  /* ── способ 2: поменялся сам index.html (новые номера версий файлов) ── */
  const hash = t => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return h; };
  let base = null;
  async function pageHash() {
    const r = await fetch('./index.html', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error('bad');
    return hash(await r.text());
  }
  async function checkPage() {
    try {
      const h = await pageHash();
      if (base === null) base = h;
      else if (h !== base) showBanner();
    } catch (e) { /* нет сети: ничего не делаем */ }
  }

  function check() {
    if (shown || document.visibilityState === 'hidden') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
    }
    checkPage();
  }

  checkPage();                                                    // запоминаем «текущую» версию
  document.addEventListener('visibilitychange', check);           // вернулся в приложение
  window.addEventListener('online', check);
  window.addEventListener('focus', check);
  setInterval(check, 10 * 60 * 1000);                             // и раз в 10 минут, пока открыто

  /* для проверки вручную из консоли: window.__kfCheckUpdate() */
  window.__kfCheckUpdate = check;
})();
