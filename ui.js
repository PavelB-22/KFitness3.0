/* Kfitnes · шторки: шапка с «назад» и «+» не прячется под панелью Safari, закрытие свайпом вниз */

(function () {
  /* Запущено как настоящее приложение с экрана «Домой» или внутри Safari / браузера мессенджера? */
  const standalone = navigator.standalone === true ||
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!standalone) document.documentElement.classList.add('in-browser');

  const css = document.createElement('style');
  css.textContent = `
  /* шторка не выше экрана минус запас сверху (статус-бар и панель браузера) */
  .sheet-body{max-height:calc(100dvh - var(--safe-t, 0px) - 44px)!important;overscroll-behavior:contain}
  html.in-browser .sheet-body{max-height:calc(100dvh - var(--safe-t, 0px) - 120px)!important}
  /* шапка («назад», название, «+») остаётся на месте при прокрутке */
  .sheet-head{position:sticky;top:-10px;z-index:3;margin:0 -18px 14px;padding:10px 18px 10px;background:#0e0e10}
  .grab{position:relative;z-index:4;padding:10px 0;background-clip:content-box;height:5px;box-sizing:content-box;touch-action:none}
  .sheet-body.drag{transition:none!important}
  .sheet-body.snap{transition:transform .22s ease}
  /* если приложение открыто внутри браузера: опускаем верхние элементы ниже его панели */
  html.in-browser .topbar{top:calc(var(--safe-t, 0px) + 62px)!important}
  html.in-browser #app{padding-top:calc(var(--safe-t, 0px) + 134px)!important}`;
  document.head.appendChild(css);

  /* свайп вниз: тянем за ручку или шапку (или с самого верха прокрученного списка) */
  let sheet = null, body = null, y0 = 0, dy = 0, live = false;

  document.addEventListener('touchstart', e => {
    const b = e.target.closest && e.target.closest('.sheet-body');
    if (!b) return;
    const s = b.closest('.sheet');
    if (!s || !s.classList.contains('open')) return;
    const grip = e.target.closest('.grab, .sheet-head');
    if (!grip && b.scrollTop > 0) return;
    if (e.target.closest('input, textarea, select, button.addbtn')) return;
    sheet = s; body = b; y0 = e.touches[0].clientY; dy = 0; live = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!body) return;
    dy = e.touches[0].clientY - y0;
    if (!live) {
      if (dy < 8) { if (dy < -8) body = null; return; }   // вверх — это обычная прокрутка
      live = true; body.classList.add('drag'); body.classList.remove('snap');
    }
    if (e.cancelable) e.preventDefault();
    body.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
  }, { passive: false });

  function end() {
    if (!body) return;
    const b = body, s = sheet, d = dy, was = live;
    body = sheet = null; live = false;
    if (!was) return;
    b.classList.remove('drag'); b.classList.add('snap');
    if (d > 110) {
      b.style.transform = 'translateY(100%)';
      setTimeout(() => { if (window.closeSheet) closeSheet(s); b.classList.remove('snap'); b.style.transform = ''; }, 200);
    } else {
      b.style.transform = '';
      setTimeout(() => b.classList.remove('snap'), 240);
    }
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
