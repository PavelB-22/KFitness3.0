/* Kfitnes · окошко с видео упражнения (тап по упражнению в «Тренировках») */

(function () {
  const css = document.createElement('style');
  css.textContent = `
  .card.ex.has-video{cursor:pointer;-webkit-tap-highlight-color:transparent}
  .card.ex.has-video:active{transform:scale(.99)}
  .tag.play{background:rgba(255,45,69,.14);border-color:rgba(255,45,69,.45);color:#ff6b7b;font-weight:700}
  .vid-ov{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
    padding:calc(env(safe-area-inset-top) + 16px) 14px calc(env(safe-area-inset-bottom) + 16px);
    background:rgba(0,0,0,.82);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:vidIn .2s ease}
  @keyframes vidIn{from{opacity:0}to{opacity:1}}
  .vid-box{width:100%;max-width:560px;max-height:100%;overflow:auto;background:#111;border:1px solid rgba(255,255,255,.1);
    border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .vid-head{display:flex;align-items:center;gap:10px;padding:12px 14px}
  .vid-head b{flex:1;font-size:15px;line-height:1.3;min-width:0}
  .vid-x{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.1);
    color:#fff;font-size:20px;line-height:1;cursor:pointer}
  .vid-tabs{display:flex;gap:8px;padding:0 14px 10px;flex-wrap:wrap}
  .vid-tabs button{flex:1 1 140px;padding:9px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.05);color:#cfcfd4;font-size:13px;font-weight:600;line-height:1.25;cursor:pointer;text-align:left}
  .vid-tabs button.on{background:linear-gradient(135deg,#ff4d5e,#e0112b 55%,#8a0016);border-color:transparent;color:#fff}
  .vid-frame{position:relative;width:100%;aspect-ratio:16/9;background:#000}
  .vid-frame iframe,.vid-frame video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
  .vid-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8d8d93;font-size:14px;pointer-events:none}
  .vid-foot{padding:10px 14px 14px;font-size:13px;color:#8d8d93;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .vid-foot a{color:#ff6b7b;font-weight:700;text-decoration:none}
  .vid-ext{padding:28px 18px;text-align:center}
  .vid-ext p{margin:0 0 14px;color:#8d8d93;font-size:14px}
  .vid-ext a{display:inline-block;padding:12px 22px;border-radius:99px;background:linear-gradient(135deg,#ff4d5e,#e0112b 55%,#8a0016);
    color:#fff;font-weight:700;text-decoration:none}`;
  document.head.appendChild(css);

  /* ссылка → как показывать */
  function embedOf(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch (e) { return null; }
    const h = u.hostname.replace(/^(www\.|m\.)/, '');
    let m;
    /* Яндекс.Диск: iframe он не разрешает, поэтому берём поток через наш воркер */
    if ((h === 'yadi.sk' || /^disk\.yandex\.[a-z.]+$/.test(h)) && /^\/[di]\//.test(u.pathname)) {
      return { type: 'ydisk', src: '/api/ydisk/stream?url=' + encodeURIComponent(u.href) };
    }
    if (h === 'youtu.be') m = u.pathname.slice(1).split('/')[0];
    else if (h.endsWith('youtube.com') || h.endsWith('youtube-nocookie.com')) {
      if (u.pathname === '/watch') m = u.searchParams.get('v');
      else if ((m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/))) m = m[1];
    }
    if (m && /^[\w-]{6,}$/.test(m)) {
      return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m}?playsinline=1&rel=0&autoplay=1` };
    }
    if (h === 'vimeo.com' && (m = u.pathname.match(/\/(\d+)/))) {
      return { type: 'iframe', src: `https://player.vimeo.com/video/${m[1]}?playsinline=1&autoplay=1` };
    }
    if (h === 'rutube.ru' && (m = u.pathname.match(/\/video\/(?:private\/)?([0-9a-f]{20,})/i))) {
      return { type: 'iframe', src: `https://rutube.ru/play/embed/${m[1]}` };
    }
    if (h === 'drive.google.com' && (m = u.pathname.match(/\/file\/d\/([\w-]+)/))) {
      return { type: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` };
    }
    if (/\.(mp4|mov|m4v|webm)$/i.test(u.pathname)) return { type: 'file', src: u.href };
    return null;
  }

  function closeVideo() {
    const ov = document.querySelector('.vid-ov');
    if (!ov) return;
    ov.remove();                                   // вместе с плеером: звук останавливается
    document.removeEventListener('keydown', onKey);
  }
  const onKey = e => { if (e.key === 'Escape') closeVideo(); };
  const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /* src: одна ссылка или список ссылок (суперсет: два видео), labels: подписи к вкладкам */
  window.openVideo = function (src, title, labels) {
    closeVideo();
    const list = (Array.isArray(src) ? src : [src]).filter(Boolean);
    if (!list.length) return;
    if (!labels || labels.length !== list.length) {
      const parts = String(title || '').split(/\s+\+\s+/);
      labels = parts.length === list.length ? parts : list.map((_, i) => 'Видео ' + (i + 1));
    }
    const ov = document.createElement('div');
    ov.className = 'vid-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `<div class="vid-box">
      <div class="vid-head"><b></b><button class="vid-x" aria-label="Закрыть">×</button></div>
      ${list.length > 1 ? '<div class="vid-tabs"></div>' : ''}
      <div class="vid-slot"></div>
      <div class="vid-foot"></div>
    </div>`;
    ov.querySelector('.vid-head b').textContent = title || 'Как делать упражнение';

    const slot = ov.querySelector('.vid-slot'), foot = ov.querySelector('.vid-foot');

    function external(url, text) {
      slot.innerHTML = `<div class="vid-ext"><p></p><a target="_blank" rel="noopener">Открыть видео</a></div>`;
      slot.querySelector('p').textContent = text;
      slot.querySelector('a').href = url;
    }

    function show(i) {
      const url = list[i], emb = embedOf(url);
      ov.querySelectorAll('.vid-tabs button').forEach((b, k) => b.classList.toggle('on', k === i));
      const label = /yandex|yadi/.test(url) ? 'Открыть в Яндекс Диске' : 'Открыть в браузере';
      foot.innerHTML = emb ? `<span>Не играет?</span><a target="_blank" rel="noopener">${label}</a>` : '';
      if (emb) foot.querySelector('a').href = url;

      if (!emb) return external(url, 'Это видео нельзя показать прямо в приложении.');

      if (emb.type === 'iframe') {
        slot.innerHTML = `<div class="vid-frame"><iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
        slot.querySelector('iframe').src = emb.src;
        return;
      }
      /* прямой файл или Яндекс.Диск через воркер */
      slot.innerHTML = `<div class="vid-frame"><video controls playsinline autoplay preload="metadata"></video><div class="vid-load">Загружаю видео…</div></div>`;
      const v = slot.querySelector('video'), ld = slot.querySelector('.vid-load');
      v.addEventListener('loadedmetadata', () => ld.remove());
      v.addEventListener('playing', () => ld.remove());
      v.addEventListener('error', () => external(url, emb.type === 'ydisk'
        ? 'Яндекс не отдал видео в приложение (или оно не поддерживается телефоном).'
        : 'Не получилось проиграть видео здесь.'));
      v.src = emb.src;
      v.play().catch(() => {});
    }

    if (list.length > 1) {
      const tabs = ov.querySelector('.vid-tabs');
      list.forEach((_, i) => {
        const b = document.createElement('button');
        b.textContent = (i + 1) + '. ' + labels[i];
        b.onclick = () => show(i);
        tabs.appendChild(b);
      });
    }

    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.vid-x')) closeVideo(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    show(0);
  };
})();
