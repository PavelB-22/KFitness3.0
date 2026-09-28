/* Kfitnes · общее: хранилище, утилиты, навигация, шторки */
const APP_VERSION = '3.0';
const STORE = 'kfitnes-v3';
const OLD_STORES = ['kfitnes-v2'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUPS = ['Грудь', 'Спина', 'Ноги', 'Плечи', 'Бицепс', 'Трицепс', 'Пресс'];
const KINDS = ['training', 'food', 'supplements'];
const KIND_INFO = {
  training:    { title: 'Программы тренировок', one: 'программу тренировок', short: 'тренировки' },
  food:        { title: 'Планы питания',        one: 'план питания',         short: 'питание' },
  supplements: { title: 'Добавки',              one: 'план добавок',         short: 'добавки' }
};

const blank = () => ({ training: [], food: [], supplements: [], measurements: [], logs: {}, settings: { rest: 90 }, sel: {}, updated: 0 });

function normalize(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { ...blank(), ...s, settings: { rest: 90, ...(s.settings || {}) }, sel: s.sel || {} };
  KINDS.forEach(k => { out[k] = Array.isArray(out[k]) ? out[k].filter(p => p && p.id) : []; });
  if (!out.logs || typeof out.logs !== 'object') out.logs = {};
  out.measurements = Array.isArray(out.measurements)
    ? out.measurements.filter(m => m && typeof m.date === 'string' && m.v && typeof m.v === 'object')
    : [];
  delete out.deleted;
  return out;
}

/* Порядок недель: по номеру в id (gym-2 раньше gym-10) */
const sortPlans = l => l.sort((a, b) => String(a.id).localeCompare(String(b.id), 'ru', { numeric: true }));

/* IndexedDB: вторая копия данных на телефоне */
const idb = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((ok, fail) => {
      if (!window.indexedDB) return fail();
      const r = indexedDB.open('kfitnes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
    return this.db;
  },
  async get(key) {
    const db = await this.open();
    return new Promise(ok => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => ok(q.result); q.onerror = () => ok(null);
    });
  },
  async set(key, val) {
    const db = await this.open();
    db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
  }
};

function loadLocal() {
  for (const k of [STORE, ...OLD_STORES]) {
    try { const raw = localStorage.getItem(k); if (raw) return normalize(JSON.parse(raw)); } catch {}
  }
  return null;
}
const hadLocal = !!loadLocal();
let state = loadLocal() || blank();
KINDS.forEach(k => sortPlans(state[k]));
let idbReady = false;

/* Сохранение. change=true → данные поменялись (не просто переключили вкладку) → уходит в облако */
function save(change = true) {
  if (change) state.updated = Date.now();
  const json = JSON.stringify(state);
  try { localStorage.setItem(STORE, json); }
  catch { toast('Не удалось сохранить: мало места'); }
  if (idbReady) idb.set(STORE, json).catch(() => {});
  if (change && typeof onDataChanged === 'function') onDataChanged();
}

/* Старт хранилища: если localStorage пуст, поднимаем из IndexedDB */
async function initStorage() {
  try {
    const raw = await idb.get(STORE) || await idb.get('kfitnes-v2');
    if (raw && !hadLocal) { state = normalize(JSON.parse(raw)); KINDS.forEach(k => sortPlans(state[k])); }
  } catch {}
  idbReady = true;
  try { localStorage.setItem(STORE, JSON.stringify(state)); OLD_STORES.forEach(k => localStorage.removeItem(k)); } catch {}
  idb.set(STORE, JSON.stringify(state)).catch(() => {});
}

/* Просим iOS не удалять данные сайта */
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}

/* Добавить / заменить план (одинаковый id → замена) */
function upsertPlan(kind, plan) {
  const i = state[kind].findIndex(p => p.id === plan.id);
  i >= 0 ? (state[kind][i] = plan) : state[kind].push(plan);
  sortPlans(state[kind]);
}

/* Удаление плана. Для тренировок удаляются и веса этой недели */
function deletePlan(kind, id) {
  state[kind] = state[kind].filter(p => p.id !== id);
  if (kind === 'training') Object.keys(state.logs).forEach(k => { if (k.startsWith(id + '|')) delete state.logs[k]; });
  save(); renderAll();
}
const logsOf = id => Object.keys(state.logs).filter(k => k.startsWith(id + '|')).length;

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

const exKey = name => String(name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const logKey = (weekId, day, idx) => `${weekId}|${day}|${idx}`;
const fmtKg = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
const uid = p => `${p}-${Date.now()}`;

/* Чипсы (недели/группы) с выбором */
function chips(el, items, selId, onPick) {
  el.innerHTML = items.map(i =>
    `<button class="chip" role="tab" aria-selected="${i.id === selId}" data-id="${esc(i.id)}">${esc(i.title)}</button>`).join('');
  el.onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    onPick(b.dataset.id); vibrate(8);
  };
  const act = el.querySelector('[aria-selected=true]');
  if (act) el.scrollLeft = act.offsetLeft - (el.clientWidth - act.offsetWidth) / 2;
}

function emptyBox(title, text) {
  return `<div class="card empty"><b>${esc(title)}</b>${esc(text)}</div>`;
}

/* Навигация по вкладкам */
const renders = {};
function showScreen(name) {
  $$('.screen').forEach(s => {
    const on = s.id === 'screen-' + name;
    s.hidden = !on; s.classList.toggle('active', on);
  });
  $$('.tab[data-screen]').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
  // Таймер только на «Тренировках»: класс на body + CSS прячет кнопку на других вкладках
  document.body.dataset.screen = name;
  state.sel.screen = name; save(false);
  renders[name] && renders[name]();
  window.scrollTo({ top: 0 });
}
$$('.tab[data-screen]').forEach(t => t.addEventListener('click', () => { showScreen(t.dataset.screen); vibrate(8); }));

/* Шторки (модальные окна). Можно открывать одну поверх другой */
function openSheet(id) {
  const s = $(id); s.hidden = false;
  s.style.zIndex = 50 + $$('.sheet.open').length;
  requestAnimationFrame(() => s.classList.add('open'));
}
function closeSheet(s) {
  if (typeof s === 'string') s = $(s);
  s.classList.remove('open');
  setTimeout(() => { if (!s.classList.contains('open')) s.hidden = true; }, 280);
}
$$('.sheet').forEach(s => {
  s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) closeSheet(s); });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const top = $$('.sheet.open').sort((a, b) => b.style.zIndex - a.style.zIndex)[0];
  top && closeSheet(top);
});

function renderAll() { Object.values(renders).forEach(r => r()); }
