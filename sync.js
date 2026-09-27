/* Kfitnes · синхронизация с приватным репозиторием GitHub (файл data.json)
   Логика простая: у данных есть отметка времени updated.
   Кто новее (телефон или GitHub), тот и прав. Первое подключение объединяет обе стороны. */
const GH_KEY = 'kfitnes-gh';
const GH_FILE = 'data.json';
let gh = (() => { try { return JSON.parse(localStorage.getItem(GH_KEY)) || null; } catch { return null; } })();
let pushT = 0, busy = false, dirty = false;

const ghSave = () => gh ? localStorage.setItem(GH_KEY, JSON.stringify(gh)) : localStorage.removeItem(GH_KEY);

/* base64 ⇄ UTF-8 (кириллица) */
const b64enc = str => { const b = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

async function ghApi(path, opt = {}) {
  const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}${path}`, {
    ...opt, cache: 'no-store',
    headers: { Authorization: `Bearer ${gh.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Ключ неверный или истёк' : r.status === 403 ? 'У ключа нет доступа к репозиторию (нужно Contents: Read and write)' : `GitHub ответил ${r.status}`);
    e.status = r.status; throw e;
  }
  return r.json();
}

/* Данные для облака: без выбранных вкладок (это настройки конкретного телефона) */
const cloudCopy = () => { const { sel, ...rest } = state; return rest; };

async function pull() {
  const f = await ghApi(`/contents/${GH_FILE}`);
  if (!f) return null;
  gh.sha = f.sha;
  const text = f.content ? b64dec(f.content) : await (await fetch(f.download_url, { cache: 'no-store' })).text();
  return normalize(JSON.parse(text));
}

async function push() {
  const body = { message: `Kfitnes · ${new Date().toLocaleString('ru-RU')}`, content: b64enc(JSON.stringify(cloudCopy(), null, 1)) };
  if (gh.sha) body.sha = gh.sha;
  try {
    const r = await ghApi(`/contents/${GH_FILE}`, { method: 'PUT', body: JSON.stringify(body) });
    gh.sha = r.content.sha;
  } catch (e) {
    // Файл поменялся на другом устройстве → берём свежий sha и пробуем ещё раз
    if (e.status === 409 || e.status === 422) { await pull(); body.sha = gh.sha; const r = await ghApi(`/contents/${GH_FILE}`, { method: 'PUT', body: JSON.stringify(body) }); gh.sha = r.content.sha; }
    else throw e;
  }
}

/* Объединение при первом подключении: планы по id, веса с обеих сторон (телефон главнее) */
function mergeStates(local, remote) {
  const out = normalize({ ...remote, sel: local.sel });
  KINDS.forEach(k => { local[k].forEach(p => { if (!out[k].some(x => x.id === p.id)) out[k].push(p); }); sortPlans(out[k]); });
  out.logs = { ...remote.logs, ...local.logs };
  out.updated = Date.now();
  return out;
}

async function syncNow(silent) {
  if (!gh || busy) { dirty = !!gh; return; }
  busy = true; dirty = false; setSyncUi('Синхронизация…');
  try {
    const remote = await pull();
    const first = !gh.last;
    if (!remote) await push();                                   // в репозитории пусто → отправляем своё
    else if (first) { state = mergeStates(state, remote); saveLocalOnly(); await push(); renderAll(); }
    else if (remote.updated > state.updated) { state = normalize({ ...remote, sel: state.sel }); saveLocalOnly(); renderAll(); }
    else if (remote.updated < state.updated) await push();
    gh.last = Date.now(); gh.err = ''; ghSave();
    setSyncUi();
    if (!silent) toast('Синхронизировано с GitHub');
  } catch (e) {
    gh.err = e.message || 'Нет связи'; ghSave(); setSyncUi();
    if (!silent) toast('GitHub: ' + gh.err);
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

/* Вызывается из save(): через 2 с после последнего изменения отправляем в облако */
function onDataChanged() {
  if (!gh) return;
  clearTimeout(pushT);
  setSyncUi('Есть несохранённые изменения…');
  pushT = setTimeout(() => syncNow(true), 2000);
}
document.addEventListener('visibilitychange', () => {
  if (!gh) return;
  if (document.hidden && pushT) { clearTimeout(pushT); pushT = 0; syncNow(true); }
  else if (!document.hidden) syncNow(true);                   // вернулся в приложение → подтянуть свежее
});

/* ---- интерфейс ---- */
const ago = t => { if (!t) return 'ещё не было'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
function setSyncUi(msg) {
  const txt = !gh ? 'Не подключено · данные только на этом iPhone'
    : msg || (gh.err ? `⚠️ ${gh.err}` : `✓ ${gh.owner}/${gh.repo} · ${ago(gh.last)}`);
  const el = $('#sync-state'); if (el) el.textContent = txt;
  $('#sync-off').hidden = !!gh; $('#sync-on').hidden = !gh;
  if (gh) { $('#sync-repo').textContent = `${gh.owner}/${gh.repo}`; $('#sync-last').textContent = msg || (gh.err ? `⚠️ ${gh.err}` : `Последняя синхронизация: ${ago(gh.last)}`); }
}

$('#btn-sync').onclick = () => { setSyncUi(); openSheet('#sheet-sync'); };
$('#gh-connect').onclick = async () => {
  const owner = $('#gh-owner').value.trim().replace(/^@/, '');
  const repo = $('#gh-repo').value.trim();
  const token = $('#gh-token').value.trim();
  if (!owner || !repo || !token) return toast('Заполни все три поля');
  gh = { owner, repo, token };
  const btn = $('#gh-connect'); btn.disabled = true; btn.textContent = 'Проверяю…';
  try {
    const info = await ghApi('');
    if (!info) throw new Error('Репозиторий не найден. Проверь логин и название');
    if (!info.private) throw new Error('Репозиторий публичный. Сделай его Private в настройках');
    ghSave(); $('#gh-token').value = '';
    await syncNow();
  } catch (e) { gh = null; ghSave(); toast(e.message); }
  btn.disabled = false; btn.textContent = 'Подключить'; setSyncUi();
};
$('#gh-now').onclick = () => syncNow();
$('#gh-off').onclick = () => { gh = null; ghSave(); setSyncUi(); toast('Отключено. Данные на телефоне остались'); };
