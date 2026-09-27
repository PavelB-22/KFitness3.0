/* Kfitnes · «+»: разделы данных, списки программ, добавление, удаление, копии */

const today = () => new Date().toISOString().slice(0, 10);
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
let listKind = null, addKind = null, pending = null;

/* ---- экран «Данные» ---- */
function renderData() {
  const logs = Object.keys(state.logs).length;
  const rows = [
    ['training', '🏋️', 'Программы тренировок', state.training.length, plural(state.training.length, 'неделя', 'недели', 'недель')],
    ['food', '🥗', 'Питание', state.food.length, plural(state.food.length, 'план', 'плана', 'планов')],
    ['supplements', '💊', 'Добавки', state.supplements.length, plural(state.supplements.length, 'неделя', 'недели', 'недель')],
    ['logs', '📈', 'Записи веса', logs, plural(logs, 'запись', 'записи', 'записей')]
  ];
  $('#data-rows').innerHTML = rows.map(([k, ic, t, n, w]) => `
    <button class="row" data-kind="${k}">
      <i aria-hidden="true">${ic}</i><span><b>${t}</b><small>${n} ${w}</small></span><em aria-hidden="true">›</em>
    </button>`).join('');
  $('#app-ver').textContent = `Kfitnes ${APP_VERSION}`;
  setSyncUi();
}
$('#data-rows').onclick = e => { const b = e.target.closest('.row'); if (b) openList(b.dataset.kind); };
$('#open-data').onclick = () => { renderData(); openSheet('#sheet-data'); vibrate(10); };

/* ---- список программ раздела ---- */
function openList(kind) { listKind = kind; renderList(); openSheet('#sheet-list'); vibrate(8); }

function renderList() {
  const kind = listKind, ul = $('#list-items');
  if (kind === 'logs') {
    $('#t-list').textContent = 'Записи веса';
    $('#list-add').hidden = true;
    $('#list-hint').textContent = 'Веса по неделям. Вписывать их нужно на вкладке «Тренировки» напротив упражнения. Здесь можно стереть веса целой недели.';
    const weeks = state.training.map(w => ({ w, n: logsOf(w.id) })).filter(x => x.n);
    ul.innerHTML = weeks.length ? weeks.map(({ w, n }) => item(w.id, w.title, `${n} ${plural(n, 'запись', 'записи', 'записей')} веса`)).join('')
      : `<li class="plist-empty">Пока нет ни одной записи веса</li>`;
    return;
  }
  const info = KIND_INFO[kind], list = state[kind];
  $('#t-list').textContent = info.title;
  $('#list-add').hidden = false;
  $('#list-hint').textContent = 'Плюсик справа вверху добавляет новую программу. Корзина удаляет ненужную или дубль.';
  ul.innerHTML = list.length ? list.map(p => item(p.id, p.title, describe(kind, p))).join('')
    : `<li class="plist-empty">Пусто. Нажми «+» справа вверху, чтобы добавить</li>`;
}

function describe(kind, p) {
  if (kind === 'training') {
    const ex = p.days.reduce((s, d) => s + d.exercises.length, 0), n = logsOf(p.id);
    return `${p.days.length} ${plural(p.days.length, 'тренировка', 'тренировки', 'тренировок')} · ${ex} упр.` + (n ? ` · ${n} ${plural(n, 'вес', 'веса', 'весов')}` : '');
  }
  const items = p.sections.reduce((s, x) => s + x.options.reduce((a, o) => a + o.items.length, 0), 0);
  return `${p.sections.length} ${plural(p.sections.length, 'раздел', 'раздела', 'разделов')} · ${items} ${plural(items, 'пункт', 'пункта', 'пунктов')}`;
}

const item = (id, title, sub) => `
  <li class="pitem" data-id="${esc(id)}">
    <span><b>${esc(title)}</b><small>${esc(sub)}</small></span>
    <button class="del" data-del="${esc(id)}" aria-label="Удалить: ${esc(title)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>
    </button>
  </li>`;

$('#list-items').onclick = e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const id = b.dataset.del, kind = listKind;
  if (kind === 'logs') {
    const w = state.training.find(x => x.id === id), n = logsOf(id);
    return confirmDel(`Стереть веса · ${w.title}?`, `Удалится ${n} ${plural(n, 'запись', 'записи', 'записей')} веса. Сама программа останется.`, () => {
      Object.keys(state.logs).forEach(k => { if (k.startsWith(id + '|')) delete state.logs[k]; });
      save(); renderAll(); toast('Веса удалены');
    });
  }
  const p = state[kind].find(x => x.id === id), n = kind === 'training' ? logsOf(id) : 0;
  confirmDel(`Удалить «${p.title}»?`,
    (n ? `Вместе с программой удалятся записанные веса: ${n} шт. ` : '') + 'Если нужно, сначала сохрани копию в «+» → «Сохранить копию».',
    () => { deletePlan(kind, id); toast(`«${p.title}» удалён`); });
};

function confirmDel(title, text, onOk) {
  $('#c-title').textContent = title; $('#c-text').textContent = text;
  $('#c-ok').onclick = () => { onOk(); closeSheet('#sheet-confirm'); renderList(); renderData(); vibrate(20); };
  openSheet('#sheet-confirm');
}

/* ---- добавление программы в раздел ---- */
$('#list-add').onclick = () => {
  addKind = listKind; pending = null;
  $('#t-add').textContent = 'Добавить ' + KIND_INFO[addKind].one;
  $('#add-pick').hidden = false; $('#add-preview').hidden = true;
  openSheet('#sheet-add');
};

function showPreview(plan, from) {
  pending = plan;
  $('#add-title').value = plan.title;
  $('#add-summary').textContent = `${from} · ${describe(addKind, plan)}. Проверь, что всё распозналось правильно.`;
  $('#add-body').innerHTML = addKind === 'training'
    ? plan.days.map(d => `<h4>${esc(d.title)}</h4><ol>${d.exercises.map(e =>
        `<li>${esc(e.name)} <small>${esc(e.scheme || '')} · ${esc(e.group)}</small></li>`).join('')}</ol>`).join('')
    : plan.sections.map(s => `<h4>${esc(s.title)}</h4>${s.options.map(o =>
        `${o.title ? `<p class="ot">${esc(o.title)}</p>` : ''}<ul>${o.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}`).join('');
  $('#add-pick').hidden = true; $('#add-preview').hidden = false;
}

$('#file-pdf').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  toast('Читаю PDF…');
  try { showPreview(await parsePdf(f, addKind), 'PDF'); }
  catch (err) { toast(err.message || 'Не получилось прочитать PDF'); }
});

/* JSON: одна программа, список программ или целая копия Kfitnes */
$('#file-json').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    let list = Array.isArray(d) ? d : Array.isArray(d[addKind]) ? d[addKind] : [d];
    list = list.filter(p => p && p.id && (addKind === 'training' ? Array.isArray(p.days) : Array.isArray(p.sections)));
    if (!list.length) throw 0;
    if (list.length === 1) return showPreview(list[0], 'JSON');
    list.forEach(p => upsertPlan(addKind, p));
    save(); renderAll(); renderList(); renderData(); closeSheet('#sheet-add');
    toast(`Добавлено: ${list.length}`);
  } catch { toast(`В файле нет раздела «${KIND_INFO[addKind].short}»`); }
});

$('#add-cancel').onclick = () => { pending = null; $('#add-pick').hidden = false; $('#add-preview').hidden = true; };
$('#add-ok').onclick = () => {
  if (!pending) return;
  pending.title = $('#add-title').value.trim() || pending.title;
  upsertPlan(addKind, pending);
  // Сразу показываем новую программу на её вкладке
  const selKey = { training: 'week', food: 'foodWeek', supplements: 'supplementsWeek' }[addKind];
  state.sel[selKey] = pending.id; if (addKind === 'training') state.sel.day = 0;
  save(); renderAll(); renderList(); renderData();
  closeSheet('#sheet-add'); toast(`«${pending.title}» добавлен`); vibrate(20);
  pending = null;
};

/* ---- резервные копии ---- */
async function giveFile(name, text, type) {
  const blob = new Blob([text], { type }), file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('#btn-save').onclick = () => {
  const { sel, ...rest } = state;
  giveFile(`kfitnes-backup-${today()}.json`, JSON.stringify({ app: 'kfitnes', version: 3, exported: new Date().toISOString(), ...rest }, null, 1), 'application/json');
};

$('#btn-csv').onclick = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Неделя', 'День', '№', 'Упражнение', 'Группа', 'Схема', 'Макс. вес, кг']];
  state.training.forEach(wk => wk.days.forEach((d, di) => d.exercises.forEach((e, ei) => {
    const v = state.logs[logKey(wk.id, di, ei)];
    rows.push([wk.title, d.title, ei + 1, e.name, e.group || '', e.scheme || '', v > 0 ? String(v).replace('.', ',') : '']);
  })));
  giveFile(`kfitnes-weights-${today()}.csv`, '\uFEFF' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv');
};

/* Восстановление: объединяем с тем, что есть (одинаковые id заменяются) */
$('#file-restore').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d !== 'object' || !(d.training || d.food || d.supplements || d.logs)) throw 0;
    let n = 0;
    KINDS.forEach(k => (Array.isArray(d[k]) ? d[k] : []).forEach(p => {
      if (p && p.id && (k === 'training' ? Array.isArray(p.days) : Array.isArray(p.sections))) { upsertPlan(k, p); n++; }
    }));
    let w = 0;
    for (const [k, v] of Object.entries(d.logs || {})) { const x = Number(v); if (x > 0 && x < 1000) { state.logs[k] = x; w++; } }
    if (d.settings?.rest) state.settings.rest = d.settings.rest;
    save(); renderAll(); renderData();
    toast(`Готово: ${n} ${plural(n, 'программа', 'программы', 'программ')}, ${w} ${plural(w, 'вес', 'веса', 'весов')}`);
    vibrate(20);
  } catch { toast('Это не файл Kfitnes или он повреждён'); }
});

/* ---- старт ---- */
(async () => {
  await initStorage();
  showScreen(state.sel.screen || 'train');
  if (typeof gh !== 'undefined' && gh) syncNow(true);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js');
})();
