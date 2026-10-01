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
  .vid-box{width:100%;max-width:560px;background:#111;border:1px solid rgba(255,255,255,.1);
    border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .vid-head{display:flex;align-items:center;gap:10px;padding:12px 14px}
  .vid-head b{flex:1;font-size:15px;line-height:1.3;min-width:0}
  .vid-x{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.1);
    color:#fff;font-size:20px;line-height:1;cursor:pointer}
  .vid-frame{position:relative;width:100%;aspect-ratio:16/9;background:#000}
  .vid-frame iframe,.vid-frame video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
  .vid-foot{padding:10px 14px 14px;font-size:13px;color:#8d8d93;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .vid-foot a{color:#ff6b7b;font-weight:700;text-decoration:none}
  .vid-ext{padding:28px 18px;text-align:center}
  .vid-ext p{margin:0 0 14px;color:#8d8d93;font-size:14px}
  .vid-ext a{display:inline-block;padding:12px 22px;border-radius:99px;background:linear-gradient(135deg,#ff4d5e,#e0112b 55%,#8a0016);
    color:#fff;font-weight:700;text-decoration:none}`;
  document.head.appendChild(css);

  /* ссылка → как показывать: iframe-плеер, файл или просто кнопка «открыть» */
  function embedOf(raw) {
    let u;
    try { u = new URL(raw.trim()); } catch (e) { return null; }
    const h = u.hostname.replace(/^(www\.|m\.)/, '');
    let m;
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
    ov.remove();                                   // вместе с плеером — звук останавливается
    document.removeEventListener('keydown', onKey);
  }
  const onKey = e => { if (e.key === 'Escape') closeVideo(); };

  window.openVideo = function (url, title) {
    closeVideo();
    const safe = String(url).replace(/"/g, '&quot;');
    const emb = embedOf(url);
    const ov = document.createElement('div');
    ov.className = 'vid-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    const player = !emb
      ? `<div class="vid-ext"><p>Это видео нельзя показать прямо в приложении.</p><a href="${safe}" target="_blank" rel="noopener">Открыть видео</a></div>`
      : emb.type === 'file'
        ? `<div class="vid-frame"><video src="${emb.src}" controls playsinline autoplay></video></div>`
        : `<div class="vid-frame"><iframe src="${emb.src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    ov.innerHTML = `<div class="vid-box">
      <div class="vid-head"><b></b><button class="vid-x" aria-label="Закрыть">×</button></div>
      ${player}
      ${emb ? `<div class="vid-foot"><span>Не играет?</span><a href="${safe}" target="_blank" rel="noopener">Открыть в браузере</a></div>` : ''}
    </div>`;
    ov.querySelector('.vid-head b').textContent = title || 'Как делать упражнение';
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.vid-x')) closeVideo(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
  };
})();
