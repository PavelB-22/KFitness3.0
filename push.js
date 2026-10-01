/* Kfitnes · уведомления тренеру: плашка «Новое» у клиента + push на телефон.
   Подключается после trainer.js, остальные файлы не трогает. */

let trNotifs = [];

(function addCss() {
  const st = document.createElement('style');
  st.textContent =
    '.nb{min-width:22px;height:22px;padding:0 7px;border-radius:11px;background:var(--grad);color:#fff;' +
      'font-size:13px;font-weight:700;display:grid;place-items:center;flex:none}' +
    '.row .nt{display:block;color:#ffb3bb;margin-top:2px;white-space:normal}' +
    '.row.has-new{border-color:rgba(255,45,69,.5);background:rgba(255,45,69,.08)}' +
    '.pushbox{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}' +
    '.pushbox small{color:var(--mut);font-size:13px;line-height:1.4}';
  document.head.appendChild(st);
})();

const u8 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

function setAppBadgeSafe(n) {
  try {
    if (!navigator.setAppBadge) return;
    if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
  } catch (e) {}
}

async function loadNotifs() {
  if (typeof isTrainer !== 'function' || !isTrainer()) return;
  try {
    const d = await api('/api/notifs');
    trNotifs = d.notifs || [];
  } catch (e) { return; }
  setAppBadgeSafe(trNotifs.length);
  decorateClients();
}

const newOf = id => trNotifs.filter(n => n.client_id === id);

function pushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'nosupport';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && localStorage.getItem('kf-push') === '1') return 'on';
  return 'off';
}

async function enablePush() {
  try {
    if (pushState() === 'nosupport') throw new Error('Открой приложение с экрана «Домой»');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Уведомления запрещены в настройках телефона');
    const reg = await navigator.serviceWorker.ready;
    const k = await api('/api/push/key');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(k.key) });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    localStorage.setItem('kf-push', '1');
    toast('Уведомления включены');
    decorateClients();
  } catch (e) { toast(e.message || 'Не получилось включить'); }
}

function decorateClients() {
  const box = $('#trainer-clients');
  if (!box || !box.querySelector('[data-client]')) return;
  box.querySelectorAll('.nb,.nt,.pushbox').forEach(x => x.remove());

  $$('[data-client]', box).forEach(b => {
    const l = newOf(b.dataset.client);
    b.classList.toggle('has-new', l.length > 0);
    if (!l.length) return;
    const sp = b.querySelector('span');
    if (sp) { const t = document.createElement('small'); t.className = 'nt'; t.textContent = l[0].text; sp.appendChild(t); }
    const bd = document.createElement('span');
    bd.className = 'nb'; bd.textContent = l.length;
    b.insertBefore(bd, b.querySelector('em'));
  });

  const ps = pushState();
  if (ps === 'on') return;
  const card = document.createElement('div');
  card.className = 'card pushbox';
  if (ps === 'off') {
    card.innerHTML = '<b>🔔 Уведомления на телефон</b><small>Когда клиент добавит вес или замеры, придёт уведомление.</small>' +
      '<button class="btn full" id="push-on" type="button">Включить уведомления</button>';
  } else if (ps === 'denied') {
    card.innerHTML = '<b>🔔 Уведомления выключены</b><small>Включи их в настройках телефона: Настройки → Уведомления → KFitness.</small>';
  } else {
    card.innerHTML = '<b>🔔 Уведомления на телефон</b><small>Добавь приложение на экран «Домой» и открой его оттуда, тогда появится кнопка включения.</small>';
  }
  box.insertBefore(card, box.firstChild);
  const btn = $('#push-on');
  if (btn) btn.onclick = enablePush;
}

/* подмешиваемся в готовые функции, не меняя их код */
const _renderTrainerClients = renderTrainerClients;
renderTrainerClients = function () { _renderTrainerClients(); decorateClients(); };
renders.clients = renderTrainerClients;

const _openClient = openClient;
openClient = async function (id) {
  trNotifs = trNotifs.filter(n => n.client_id !== id);
  setAppBadgeSafe(trNotifs.length);
  api('/api/notifs/read', { method: 'POST', body: JSON.stringify({ client: id }) }).catch(() => {});
  return _openClient(id);
};

const _closeClient = closeClient;
closeClient = async function () { await _closeClient(); loadNotifs(); };

const _applyRole = applyRole;
applyRole = function () { _applyRole(); loadNotifs(); };

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNotifs(); });
setInterval(() => {
  if (!document.hidden && typeof isTrainer === 'function' && isTrainer() && !viewId) loadNotifs();
}, 30000);
