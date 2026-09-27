/* Kfitnes · синхронизация с сервером KFitness (база Cloudflare)
   ------------------------------------------------------------------
   Логика та же, что была с GitHub: у данных есть отметка времени updated.
   Кто новее — тот и прав. Первое подключение объединяет обе стороны.

   Было:  data.json в приватном репозитории GitHub.
   Стало: /api/state на сервере. Приложение работает «от имени» того,
          чей код введён при входе. Тренер может переключиться на клиента. */

let busy = false, dirty = false, pushT = 0;
let who = null;              // { id, name, code, role } — чей профиль открыт
let viewId = null;           // у тренера — id клиента, которого смотрим
let lastSync = 0, lastErr = '';

/* ─────────── доступ к серверу ─────────── */

const withView = (url) => viewId ? url + (url.includes('?') ? '&' : '?') + 'client=' + encodeURIComponent(viewId) : url;

async function api(path, opt = {}) {
  const r = await fetch(path, {
    ...opt,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }
  });
  if (r.status === 401) { location.href = '/'; throw new Error('Нужен вход'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('Сервер ответил ' + r.status));
  return d;
}

/* ─────────── чтение и запись ─────────── */

async function pull() {
  const d = await api(withView('/api/state'));
  who = d.client || who;
  return d.state ? normalize(d.state) : null;
}

async function push() {
  const { sel, ...rest } = state;
  await api(withView('/api/state'), {
    method: 'POST',
    body: JSON.stringify({ state: rest })
  });
}

/* ─────────── объединение при первом подключении ─────────── */

function mergeStates(local, remote) {
  const out = normalize({ ...remote, sel: local.sel });
  KINDS.forEach(k => {
    const byId = new Map();
    remote[k].forEach(p => byId.set(p.id, p));
    local[k].forEach(p => {
      const r = byId.get(p.id);
      if (!r) byId.set(p.id, p);        // есть только на телефоне → берём
    });
    out[k] = sortPlans([...byId.values()]);
  });
  // веса: телефон главнее
  out.logs = { ...remote.logs, ...local.logs };
  return out;
}

/* ─────────── главный цикл синхронизации ─────────── */

async function syncNow(silent) {
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

/* Сохранить на телефоне, не запуская новую отправку */
function saveLocalOnly() {
  const json = JSON.stringify(state);
  try { localStorage.setItem(STORE, json); } catch {}
  idb.set(STORE, json).catch(() => {});
}

/* Вызывается из save(): через 2 с после последнего изменения — в облако */
function onDataChanged() {
  clearTimeout(pushT);
  setSyncUi('Есть несохранённые изменения…');
  pushT = setTimeout(() => { pushT = 0; syncNow(true); }, 2000);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && pushT) { clearTimeout(pushT); pushT = 0; syncNow(true); }
  else if (!document.hidden) syncNow(true);
});

/* ─────────── интерфейс ─────────── */

const ago = (t) => {
  if (!t) return 'ещё не было';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'только что'
    : m < 60 ? `${m} мин назад`
    : new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function setSyncUi(msg) {
  const txt = lastErr
    ? '⚠️ ' + lastErr
    : msg || (who ? `${who.name} · ${ago(lastSync)}` : 'Синхронизация…');

  const st = $('#sync-state'); if (st) st.textContent = txt;
  const rep = $('#sync-repo'); if (rep && who) rep.textContent = who.name;
  const lst = $('#sync-last');
  if (lst) lst.textContent = lastErr ? '⚠️ ' + lastErr : 'Последняя синхронизация: ' + ago(lastSync);
}

/* ─────────── шапка: кто я и переключение клиентов ─────────── */

function renderWho() {
  const box = $('#who-box'); if (!box || !who) return;
  const trainers = who.role === 'trainer';
  box.hidden = false;
  box.innerHTML =
    '<span class="who-name">' + esc(who.name) + (trainers ? ' · тренер' : '') + '</span>' +
    '<button class="who-out" id="who-out">Выйти</button>';

  const btn = $('#who-out');
  if (btn) btn.onclick = async () => {
    await fetch('/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  };
}

/* Загружаем, кто мы, и если тренер — список людей */
async function initWho() {
  try {
    const d = await api('/me');
    who = d.client;
    renderWho();
    if (who.role !== 'trainer') return;

    const c = await api('/clients');
    const list = (c.clients || []).filter(x => x.role !== 'trainer');
    if (!list.length) return;
    viewId = list[0].id;                 // тренер сразу смотрит первого клиента
    renderSwitcher(list);
    who = list[0];
    renderWho();
  } catch (e) { /* выбросит на вход через api() */ }
}

function renderSwitcher(list) {
  const box = $('#switch-box'); if (!box) return;
  box.hidden = false;
  box.innerHTML = '<div class="sw-label">Клиент</div><div class="sw-chips">' +
    list.map(c => '<button class="sw-chip' + (c.id === viewId ? ' on' : '') +
      '" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('') +
    '</div>';
  box.onclick = (e) => {
    const b = e.target.closest('.sw-chip'); if (!b) return;
    viewId = b.dataset.id;
    who = list.find(x => x.id === viewId) || who;
    lastSync = 0;
    initWho();
    syncNow(true);
    vibrate(8);
  };
}

/* ─────────── окно синхронизации (вместо GitHub) ─────────── */

const sheetSync = $('#sheet-sync');
if (sheetSync) {
  sheetSync.innerHTML =
    '<div class="sheet-body">' +
      '<div class="grab" aria-hidden="true"></div>' +
      '<header class="sheet-head">' +
        '<button class="x" data-close aria-label="Назад">‹</button>' +
        '<h2>Синхронизация</h2><span class="spacer"></span>' +
      '</header>' +
      '<p class="hint">Данные хранятся на сервере KFitness и привязаны к твоему коду. ' +
        'Заходи с любого телефона — программы и веса будут на месте.</p>' +
      '<div class="field"><span>Профиль</span><b id="sync-repo">—</b></div>' +
      '<p class="hint" id="sync-last"></p>' +
      '<button class="btn full" id="sync-now">Синхронизировать сейчас</button>' +
      '<p class="hint center" id="app-ver"></p>' +
    '</div>';

  const go = $('#sync-now');
  if (go) go.onclick = () => { syncNow(false); vibrate(10); };
}

/* ─────────── старт ─────────── */

async function initSync() {
  await initWho();
  await syncNow(true);
}
