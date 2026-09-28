/* Kfitnes · таймер отдыха
   Считаем от времени окончания (endAt), а не тиками: так таймер не «отстаёт»,
   если iPhone притормозил вкладку.
   Звук: короткие сигналы за 3, 2, 1 с и трель на финише.
   Важно: звук включается только после ручного нажатия «Старт» или «Тест звука». */
const PRESETS = [30, 45, 60, 90, 120, 150, 180, 240];
const CIRC = 2 * Math.PI * 88;

let tm = {
  total: state.settings.rest,
  left: state.settings.rest,
  endAt: 0,
  id: 0
};

let audioCtx;
let wakeLock;
let scheduled = [];

const mmss = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.ceil(s % 60)) % 60).padStart(2, '0')}`;
const fmtLeft = s => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ---- звук ---- */

function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function mediaSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {}
}

/* Сигнал финиша: вызывается только когда пользователь запустил таймер */
function tone(step) {
  const a = ctx();
  const notes = step || [784, 1046, 1318];
  const dur = 0.75;
  const volume = 0.5;

  if (!a) {
    vibrate([250, 120, 250, 120, 350]);
    return;
  }

  mediaSession();

  notes.forEach((freq, i) => {
    const start = a.currentTime + (notes.length > 1 ? i * 0.22 : 0);
    const end = start + dur;

    [1, 2, 3].forEach((mult, k) => {
      const o = a.createOscillator();
      const g = a.createGain();

      o.type = k === 0 ? 'sine' : (k === 1 ? 'square' : 'triangle');
      o.frequency.value = freq * mult;
      o.connect(g);
      g.connect(a.destination);

      const vol = volume * (k === 0 ? 1 : k === 1 ? 0.16 : 0.07);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
      g.gain.setValueAtTime(vol, Math.max(start + 0.02, end - 0.12));
      g.gain.exponentialRampToValueAtTime(0.0001, end);

      try {
        o.start(start);
        o.stop(end + 0.02);
      } catch {}
    });
  });

  vibrate([250, 120, 250, 120, 350]);
}

/* Предупреждения за 3, 2 и 1 секунду */
function scheduleAlerts(secondsLeft) {
  stopAlerts();

  const a = ctx();
  if (!a) return;

  [3, 2, 1].forEach(s => {
    if (secondsLeft <= s + 0.3) return;

    const o = a.createOscillator();
    const g = a.createGain();

    o.type = 'sine';
    o.frequency.value = s === 1 ? 1046 : 660;
    o.connect(g);
    g.connect(a.destination);

    const at = a.currentTime + (secondsLeft - s);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);

    try {
      o.start(at);
      o.stop(at + 0.12);
      scheduled.push(o);
    } catch {}
  });
}

function stopAlerts() {
  scheduled.forEach(o => {
    try { o.stop(); } catch {}
  });
  scheduled = [];
}

/* ---- экран не гаснет, пока идёт отдых ---- */

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}

/* Тихо сбрасывает таймер: без сигнала и вибрации */
function resetQuietly() {
  clearInterval(tm.id);
  stopAlerts();
  keepAwake(false);
  tm.endAt = 0;
  tm.left = tm.total;
  drawTimer();
}

/* При возврате из фона:
   если время закончилось, не проигрываем старый финишный звук. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !tm.endAt) return;

  const remaining = (tm.endAt - Date.now()) / 1000;

  if (remaining <= 0) {
    resetQuietly();
    return;
  }

  tm.left = remaining;
  drawTimer();
});

/* Safari иногда держит старую страницу в памяти.
   При её возврате сбрасываем старый таймер без звука. */
window.addEventListener('pageshow', e => {
  if (e.persisted) resetQuietly();
});

/* ---- отрисовка ---- */

function drawTimer() {
  const running = !!tm.endAt;

  $('#ring-time').textContent = fmtLeft(tm.left);
  $('#ring-fg').style.strokeDasharray = CIRC;
  $('#ring-fg').style.strokeDashoffset = CIRC * (1 - tm.left / tm.total);

  $('#t-start').textContent = running
    ? 'Пауза'
    : (tm.left < tm.total && tm.left > 0 ? 'Продолжить' : 'Старт');

  $('.ring').classList.toggle('done', tm.left <= 0);

  const fab = $('#fab-timer');
  fab.classList.toggle('run', running);

  $('#fab-time').textContent = running ? fmtLeft(tm.left) : '';

  document.querySelectorAll('#t-presets .chip').forEach(c => {
    c.setAttribute('aria-selected', +c.dataset.id === tm.total);
  });
}

function tick() {
  tm.left = (tm.endAt - Date.now()) / 1000;

  if (tm.left <= 0) {
    tm.left = 0;
    tm.endAt = 0;
    clearInterval(tm.id);
    keepAwake(false);
    tone();
    toast('Отдых окончен, погнали');

    setTimeout(() => {
      if (!tm.endAt) {
        tm.left = tm.total;
        drawTimer();
      }
    }, 4000);
  }

  drawTimer();
}

function startPause() {
  /* Звук создаётся только после ручного клика пользователя */
  ctx();
  mediaSession();

  if (tm.endAt) {
    tm.left = (tm.endAt - Date.now()) / 1000;
    tm.endAt = 0;
    clearInterval(tm.id);
    stopAlerts();
    keepAwake(false);
  } else {
    if (tm.left <= 0.5) tm.left = tm.total;

    tm.endAt = Date.now() + tm.left * 1000;
    clearInterval(tm.id);
    tm.id = setInterval(tick, 200);

    scheduleAlerts(tm.left);
    keepAwake(true);
  }

  vibrate(10);
  drawTimer();
}

function setTotal(sec) {
  sec = Math.min(900, Math.max(15, sec));

  if (tm.endAt) {
    tm.endAt += (sec - tm.total) * 1000;
    tm.left = (tm.endAt - Date.now()) / 1000;
    scheduleAlerts(tm.left);
  } else {
    tm.left = sec;
  }

  tm.total = sec;
  state.settings.rest = sec;
  save();
  drawTimer();
}

$('#t-presets').innerHTML = PRESETS.map(s =>
  `<button class="chip" data-id="${s}" aria-selected="false">${
    s < 60 ? s + ' с' : mmss(s).replace(':00', '') + (s % 60 ? '' : ' мин')
  }</button>`
).join('');

$('#t-presets').onclick = e => {
  const b = e.target.closest('.chip');
  if (b) {
    setTotal(+b.dataset.id);
    vibrate(8);
  }
};

$('#t-minus').onclick = () => setTotal(tm.total - 15);
$('#t-plus').onclick = () => setTotal(tm.total + 15);

$('#t-start').onclick = startPause;

$('#t-reset').onclick = () => {
  resetQuietly();
};

$('#t-test').onclick = () => {
  ctx();
  mediaSession();
  tone();
  toast('Так звучит финиш');
};

$('#fab-timer').onclick = () => {
  drawTimer();
  openSheet('#sheet-timer');
};

drawTimer();
