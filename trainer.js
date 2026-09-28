/* Kfitnes · режим тренера: «Клиенты», «Аналитика», «Настройки».
   Экраны и вкладки создаются здесь — index.html править не нужно. */

let trClients = [];
let trAnalytics = null;

const dateRu = iso => iso
  ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

(function mountTrainer() {
  const app = $('#app');
  const bar = $('.tabbar');
  const screens = { clients: 'Клиенты', analytics: 'Аналитика', settings: 'Настройки' };
  const icons = {
    clients: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.5a3 3 0 0 1 0 5.5M18 14.5c2 .6 3 2.4 3 5"/>',
    analytics: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'
  };

  Object.entries(screens).forEach(([id, title]) => {
    if (!$('#screen-' + id)) {
      const sec = document.createElement('section');
      sec.className = 'screen';
      sec.id = 'screen-' + id;
      sec.hidden = true;
      sec.innerHTML = '<header class="top"><small>KFitness · тренер</small><h1>' + title + '</h1></header>' +
        '<div id="trainer-' + id + '"></div>';
      app.appendChild(sec);
    }
    if (!$('.tab[data-screen="' + id + '"]')) {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.dataset.screen = id;
      b.dataset.trainerTab = '';
      b.hidden = true;
      b.setAttribute('aria-label', title);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icons[id] + '</svg><span>' + title + '</span>';
      b.addEventListener('click', () => { showScreen(id); vibrate(8); });
      bar.appendChild(b);
    }
  });

  /* штатные вкладки клиента помечаем, чтобы прятать их у тренера */
  $$('.tabbar .tab[data-screen="train"], .tabbar .tab[data-screen="food"], .tabbar .tab[data-screen="supp"], #open-data')
    .forEach(t => { t.dataset.clientTab = ''; });
})();

/* какое меню показать: клиентское или тренерское */
function setMenu(mode) {
  const client = mode === 'client';
  $$('[data-client-tab]').forEach(t => { t.hidden = !client; });
  $$('[data-trainer-tab]').forEach(t => { t.hidden = client; });
}

/* вызывается из sync.js после входа */
function applyRole() {
  if (isTrainer()) {
    setMenu('trainer');
    loadTrainerClients();
    loadAnalytics();
  } else {
    setMenu('client');
  }
}

/* ───── Клиенты ───── */
async function loadTrainerClients() {
  try {
    const d = await api('/clients');
    trClients = (d.clients || []).filter(c => c.role !== 'trainer');
  } catch (e) {
    trClients = [];
    toast('Клиенты: ' + e.message);
  }
  renderTrainerClients();
}

function renderTrainerClients() {
  const box = $('#trainer-clients');
  if (!box) return;

  if (!trClients.length) {
    box.innerHTML = emptyBox('Клиентов пока нет', 'Добавь первого клиента во вкладке «Настройки».');
    return;
  }

  const stat = id => ((trAnalytics && trAnalytics.clients) || []).find(x => x.id === id);

  box.innerHTML =
    '<p class="sub">Нажми на клиента — откроются его тренировки, питание, добавки и замеры.</p>' +
    '<div class="rows">' +
    trClients.map(c => {
      const s = stat(c.id);
      return '<button class="row" type="button" data-client="' + esc(c.id) + '">' +
        '<i aria-hidden="true">' + esc((c.name || '?').trim().charAt(0)) + '</i>' +
        '<span><b>' + esc(c.name) + '</b><small>Код ' + esc(c.code) +
          (s ? ' · замеров: ' + s.measurements : '') + '</small></span>' +
        '<em aria-hidden="true">›</em>' +
      '</button>';
    }).join('') +
    '</div>';

  box.onclick = e => {
    const b = e.target.closest('[data-client]');
    if (b) openClient(b.dataset.client);
  };
}

/* тренер «заходит» в аккаунт клиента */
async function openClient(id) {
  const c = trClients.find(x => x.id === id);
  if (!c) return;

  viewId = c.id;
  viewName = c.name;
  lastErr = '';
  /* чистый лист, чтобы данные разных клиентов не смешались */
  state = normalize({ sel: { ...state.sel, screen: 'train' } });

  setMenu('client');
  renderTopbar();
  showScreen('train');

  try {
    const remote = await pull();
    state = normalize({ ...(remote || {}), sel: state.sel });
    lastSync = Date.now();
    saveLocalOnly();
  } catch (e) {
    lastErr = e.message;
    toast('Не загрузилось: ' + e.message);
  }
  renderAll();
  showScreen(state.sel.screen || 'train');
  toast('Профиль: ' + c.name);
}

/* вернуться из клиента к списку */
async function closeClient() {
  if (pushT) { clearTimeout(pushT); pushT = 0; await syncNow(true); }   // досохраняем изменения
  viewId = null;
  viewName = '';
  lastSync = 0;
  state = normalize({ sel: state.sel });
  saveLocalOnly();

  setMenu('trainer');
  renderTopbar();
  showScreen('clients');
  loadTrainerClients();
  loadAnalytics();
}

/* ───── Аналитика ───── */
async function loadAnalytics() {
  try { trAnalytics = await api('/analytics'); }
  catch (e) { trAnalytics = null; }
  renderAnalytics();
  renderTrainerClients();
}

function renderAnalytics() {
  const box = $('#trainer-analytics');
  if (!box) return;

  if (!trAnalytics) {
    box.innerHTML = emptyBox('Нет данных', 'Сервер не отдал аналитику. Проверь, что код воркера в Cloudflare обновлён.');
    return;
  }

  const s = trAnalytics;
  const list = s.clients || [];

  /* регистрации по месяцам за последние 6 месяцев */
  const months = [];
  const d0 = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
    months.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''), n: 0 });
  }
  list.forEach(c => {
    const k = (c.created_at || '').slice(0, 7);
    const m = months.find(x => x.key === k);
    if (m) m.n++;
  });
  const top = Math.max(1, ...months.map(m => m.n));

  box.innerHTML =
    '<div class="stats">' +
      '<div><b>' + (s.total || 0) + '</b><span>всего клиентов</span></div>' +
      '<div><b>' + (s.active7 || 0) + '</b><span>активны за 7 дней</span></div>' +
      '<div><b>' + (s.new30 || 0) + '</b><span>новых за 30 дней</span></div>' +
    '</div>' +
    '<h2 class="sec-h">Новые клиенты по месяцам</h2>' +
    '<div class="card regbars">' + months.map(m =>
      '<div class="rb"><i style="height:' + Math.round(m.n / top * 100) + '%"></i><b>' + m.n + '</b><span>' + m.label + '</span></div>').join('') +
    '</div>' +
    '<h2 class="sec-h">Регистрации</h2>' +
    (list.length
      ? '<div class="mlist">' + list.map(c =>
          '<div class="mrow">' +
            '<span><b>' + esc(c.name) + '</b><small>код ' + esc(c.code) + ' · с ' + esc(dateRu(c.created_at)) +
              ' · замеров: ' + (c.measurements || 0) + '</small></span>' +
            '<button class="mini del" type="button" data-del="' + esc(c.id) + '" data-name="' + esc(c.name) + '">Удалить</button>' +
          '</div>').join('') + '</div>'
      : emptyBox('Клиентов нет', 'Добавь первого клиента в «Настройках».'));

  box.onclick = async e => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    if (!confirm('Удалить клиента «' + b.dataset.name + '» вместе со всеми программами и замерами? Это нельзя отменить.')) return;
    try {
      await api('/clients/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' });
      toast('Клиент удалён');
      await loadTrainerClients();
      await loadAnalytics();
    } catch (err) { toast('Не удалилось: ' + err.message); }
  };
}

/* ───── Настройки ───── */
function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function trDownload(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function renderSettings() {
  const box = $('#trainer-settings');
  if (!box) return;

  box.innerHTML =
    '<div class="card tcard">' +
      '<h2 class="sec-h first">Новый клиент</h2>' +
      '<p class="sub">Код из 4 символов — по нему клиент входит в приложение.</p>' +
      '<label class="tfield"><span>Имя</span><input id="nc-name" autocomplete="off" placeholder="Иван И."></label>' +
      '<label class="tfield"><span>Код входа</span><input id="nc-code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="IVAN"></label>' +
      '<div class="mactions">' +
        '<button class="btn ghost" id="nc-gen" type="button">Придумать код</button>' +
        '<button class="btn" id="nc-add" type="button">Добавить</button>' +
      '</div>' +
      '<p class="hint" id="nc-msg" role="status"></p>' +
    '</div>' +

    '<div class="card tcard">' +
      '<h2 class="sec-h first">Резервная копия</h2>' +
      '<p class="sub">Все клиенты с программами, весами и замерами в одном файле. Сохраняй раз в неделю в «Файлы».</p>' +
      '<button class="btn full" id="bk-save" type="button">Скачать копию</button>' +
      '<button class="btn ghost full" id="bk-load" type="button">Восстановить из копии</button>' +
      '<input type="file" id="bk-file" accept=".json,application/json" hidden>' +
    '</div>' +

    '<div class="card tcard">' +
      '<h2 class="sec-h first">Облако</h2>' +
      '<p class="sub">Данные хранятся в базе Cloudflare. Каждое изменение сохраняется автоматически через 2 секунды.</p>' +
      '<button class="btn ghost full" id="st-check" type="button">Проверить связь</button>' +
    '</div>';

  box.onclick = async e => {
    const t = e.target.closest('button');
    if (!t) return;
    const msg = $('#nc-msg');

    if (t.id === 'nc-gen') { $('#nc-code').value = randomCode(); return; }

    if (t.id === 'nc-add') {
      const name = $('#nc-name').value.trim();
      const code = $('#nc-code').value.trim().toUpperCase();
      if (!name) { msg.textContent = 'Впиши имя'; return; }
      if (!/^[A-ZА-Я0-9]{4}$/.test(code)) { msg.textContent = 'Код — ровно 4 буквы или цифры'; return; }
      try {
        await api('/clients', { method: 'POST', body: JSON.stringify({ name, code }) });
        $('#nc-name').value = ''; $('#nc-code').value = '';
        msg.textContent = 'Готово. Код для входа: ' + code;
        toast('Клиент добавлен');
        await loadTrainerClients();
        await loadAnalytics();
      } catch (err) { msg.textContent = err.message; }
      return;
    }

    if (t.id === 'bk-save') {
      toast('Собираю копию…');
      const out = { app: 'kfitnes', type: 'trainer-backup', exported: new Date().toISOString(), clients: [] };
      for (const c of trClients) {
        try {
          const d = await api('/api/state?client=' + encodeURIComponent(c.id));
          out.clients.push({ id: c.id, name: c.name, code: c.code, created_at: c.created_at, state: d.state });
        } catch (err) {
          out.clients.push({ id: c.id, name: c.name, code: c.code, error: err.message });
        }
      }
      trDownload('kfitness-backup-' + localDay() + '.json', out);
      return;
    }

    if (t.id === 'bk-load') { $('#bk-file').click(); return; }

    if (t.id === 'st-check') {
      try { await api('/me'); toast('Связь с облаком есть'); }
      catch (err) { toast('Нет связи: ' + err.message); }
    }
  };

  $('#bk-file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || d.type !== 'trainer-backup' || !Array.isArray(d.clients)) throw new Error('Это не копия тренера');
      const items = d.clients.filter(c => c.state && trClients.some(x => x.id === c.id));
      if (!items.length) { toast('В файле нет клиентов из текущей базы'); return; }
      if (!confirm('Перезаписать данные ' + items.length + ' клиент(ов) данными из копии?')) return;
      for (const c of items) {
        await api('/api/state?client=' + encodeURIComponent(c.id), { method: 'POST', body: JSON.stringify({ state: c.state }) });
      }
      toast('Восстановлено: ' + items.length);
      loadAnalytics();
    } catch (err) { toast('Не удалось: ' + err.message); }
  };
}

renders.clients = renderTrainerClients;
renders.analytics = renderAnalytics;
renders.settings = renderSettings;
