/* Kfitnes · синхронизация с облаком KFitness (Cloudflare) */

let busy = false, dirty = false, pushT = 0;
let who = null;          // кто вошёл: { id, name, code, role }
let viewId = null;       // тренер: id открытого клиента
let viewName = '';       // тренер: имя открытого клиента
let lastSync = 0, lastErr = '';

const isTrainer = () => !!(who && who.role === 'trainer');
/* тренеру синхронизировать нечего, пока он не открыл клиента */
const canSync = () => !!who && (!isTrainer() || !!viewId);

const withView = url => viewId
  ? url + (url.includes('?') ? '&' : '?') + 'client=' + encodeURIComponent(viewId)
  : url;

async function api(path, opt = {}) {
  const r = await fetch(path, {
    ...opt,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }
  });
  if (r.status === 401) { location.href = '/login.html'; throw new Error('Нужен вход'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('Сервер ответил ' + r.status));
  return d;
}

async function pull() {
  const d = await api(withView('/api/state'));
  return d.state ? normalize(d.state) : null;
}

async function push() {
  const { sel, ...rest } = state;
  await api(withView('/api/state'), { method: 'POST', body: JSON.stringify({ state: rest }) });
}

/* первое подключение: объединяем телефон и облако */
function mergeStates(local, remote) {
  const out = normalize({ ...remote, sel: local.sel });
  KINDS.forEach(k => {
    const byId = new Map();
    remote[k].forEach(p => byId.set(p.id, p));
    local[k].forEach(p => { if (!byId.has(p.id)) byId.set(p.id, p); });
    out[k] = sortPlans([...byId.values()]);
  });
  out.logs = { ...remote.logs, ...local.logs };

  const byDate = new Map();
  (remote.measurements || []).forEach(m => m && m.date && byDate.set(m.date, m));
  (local.measurements || []).forEach(m => { if (m && m.date && !byDate.has(m.date)) byDate.set(m.date, m); });
  out.measurements = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function syncNow(silent) {
  if (!canSync()) return;
  if (busy) { dirty = true; return; }
  busy = true; dirty = false;
  setSyncUi('Синхронизация…');
  try {
    const first = !lastSync;
    const remote = await pull();

    if (!remote) {
      await push();
    } else if (first) {
      state = mergeStates(state, remote);
      saveLocalOnly();
      await push();
      renderAll();
    } else if ((remote.updated || 0) > (state.updated || 0)) {
      state = normalize({ ...remote, sel: state.sel });
      saveLocalOnly();
      renderAll();
    } else if ((remote.updated || 0) < (state.updated || 0)) {
      await push();
    }

    lastSync = Date.now(); lastErr = '';
    setSyncUi();
    if (!silent) toast('Сохранено');
  } catch (e) {
    lastErr = e.message || 'Нет связи';
    setSyncUi();
    if (!silent) toast('Связь: ' + lastErr);
  }
  busy = false;
  if (dirty) syncNow(true);
}

function saveLocalOnly() {
  const json = JSON.stringify(state);
  try { localStorage.setItem(STORE, json); } catch {}
  idb.set(STORE, json).catch(() => {});
}

/* вызывается из save() в core.js */
function onDataChanged() {
  if (!canSync()) return;
  clearTimeout(pushT);
  setSyncUi('Есть несохранённые изменения…');
  pushT = setTimeout(() => { pushT = 0; syncNow(true); }, 2000);
}

document.addEventListener('visibilitychange', () => {
  if (!canSync()) return;
  if (document.hidden && pushT) { clearTimeout(pushT); pushT = 0; syncNow(true); }
  else if (!document.hidden) syncNow(true);
});

const ago = t => {
  if (!t) return 'ещё не было';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'только что'
    : m < 60 ? `${m} мин назад`
    : new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function setSyncUi(msg) {
  const name = viewName || (who && who.name) || '';
  const txt = lastErr ? '⚠️ ' + lastErr : msg || (name ? `${name} · ${ago(lastSync)}` : 'Синхронизация…');
  const st = $('#sync-state'); if (st) st.textContent = txt;
  const rep = $('#sync-repo'); if (rep && name) rep.textContent = name;
  const lst = $('#sync-last');
  if (lst) lst.textContent = lastErr ? '⚠️ ' + lastErr : 'Последняя синхронизация: ' + ago(lastSync);
}

/* ───── шапка: справа вверху «Выйти», под кнопкой имя ───── */
function renderTopbar() {
  let bar = $('#topbar');
  if (!bar) {
    bar = document.createElement('header');
    bar.id = 'topbar';
    bar.className = 'topbar';
    bar.innerHTML =
      '<div class="topbar-right">' +
        '<button class="out" id="who-out" type="button">Выйти</button>' +
        '<div class="who-name" id="who-name"></div>' +
        '<div class="who-view" id="who-view" hidden></div>' +
      '</div>';
    document.body.appendChild(bar);
    $('#who-out').onclick = async () => {
      try { await fetch('/logout', { method: 'POST' }); } catch (e) {}
      location.href = '/login.html';
    };
  }

  bar.hidden = !who;
  if (!who) return;

  $('#who-name').textContent = who.name + (isTrainer() ? ' · тренер' : '');

  const v = $('#who-view');
  if (isTrainer() && viewId) {
    v.hidden = false;
    v.innerHTML = '<span>Клиент: <b>' + esc(viewName) + '</b></span>' +
      '<button class="mini" id="back-clients" type="button">‹ К списку</button>';
    $('#back-clients').onclick = () => { closeClient(); vibrate(8); };
  } else {
    v.hidden = true;
    v.innerHTML = '';
  }
}

async function initWho() {
  const d = await api('/me');
  who = d.client;
  ['#who-box', '#switch-box'].forEach(s => { const el = $(s); if (el) el.hidden = true; });
  renderTopbar();
  if (typeof applyRole === 'function') applyRole();
}

async function initSync() {
  await initWho();
  await syncNow(true);
}

/* ───── окно «Облако» вместо старого GitHub ───── */
const sheetSync = $('#sheet-sync');
if (sheetSync) {
  sheetSync.innerHTML =
    '<div class="sheet-body">' +
      '<div class="grab" aria-hidden="true"></div>' +
      '<header class="sheet-head">' +
        '<button class="x" data-close aria-label="Назад">‹</button>' +
        '<h2>Облако</h2><span class="spacer"></span>' +
      '</header>' +
      '<p class="hint">Данные хранятся в облаке KFitness и привязаны к коду входа. ' +
        'Заходи с любого телефона — программы, веса и замеры будут на месте.</p>' +
      '<div class="field"><span>Профиль</span><b id="sync-repo">—</b></div>' +
      '<p class="hint" id="sync-last"></p>' +
      '<button class="btn full" id="sync-now" type="button">Синхронизировать сейчас</button>' +
    '</div>';
  const go = $('#sync-now');
  if (go) go.onclick = () => { syncNow(false); vibrate(10); };
}

const btnSync = $('#btn-sync');
if (btnSync) {
  const b = btnSync.querySelector('b');
  if (b) b.textContent = 'Облако KFitness';
  btnSync.onclick = () => { setSyncUi(); openSheet('#sheet-sync'); };
}
