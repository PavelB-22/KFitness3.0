/* Kfitnes · вкладка «Замеры»: ввод по дате, график и таблица.
   Экран и кнопка меню создаются здесь — index.html править не нужно. */

const BODY = [
  { key: 'weight', name: 'Вес',    unit: 'кг' },
  { key: 'neck',   name: 'Шея',    unit: 'см' },
  { key: 'biceps', name: 'Бицепс', unit: 'см' },
  { key: 'chest',  name: 'Грудь',  unit: 'см' },
  { key: 'waist',  name: 'Талия',  unit: 'см' },
  { key: 'belly',  name: 'Живот',  unit: 'см' },
  { key: 'hips',   name: 'Бёдра',  unit: 'см' },
  { key: 'thigh',  name: 'Бедро',  unit: 'см' },
  { key: 'calf',   name: 'Голень', unit: 'см' }
];

/* дата по местному времени, а не по UTC */
const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const meas = () => (Array.isArray(state.measurements) ? state.measurements : (state.measurements = []));

let mFormDate = localDay();
let mChartKey = 'weight';

(function mountMeasurements() {
  const app = $('#app');
  if (app && !$('#screen-measurements')) {
    const sec = document.createElement('section');
    sec.className = 'screen';
    sec.id = 'screen-measurements';
    sec.hidden = true;
    sec.innerHTML =
      '<header class="top"><small>KFitness</small><h1>Замеры</h1></header>' +
      '<p class="sub">Выбери дату и впиши показатели. Ниже — график и таблица прогресса.</p>' +
      '<div class="card" id="measurement-form"></div>' +
      '<div class="mactions">' +
        '<button class="btn ghost" id="measurement-del" type="button" hidden>Удалить</button>' +
        '<button class="btn" id="measurement-save" type="button">Сохранить замер</button>' +
      '</div>' +
      '<h2 class="sec-h">График прогресса</h2>' +
      '<div class="chips small" id="measurement-pick" role="tablist" aria-label="Показатель"></div>' +
      '<div class="card chart-card" id="measurement-chart"></div>' +
      '<h2 class="sec-h">Таблица замеров</h2>' +
      '<div id="measurement-table"></div>';
    app.appendChild(sec);
  }

  const supp = $('.tabbar .tab[data-screen="supp"]');
  if (supp && !$('.tab[data-screen="measurements"]')) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.type = 'button';
    b.dataset.screen = 'measurements';
    b.dataset.clientTab = '';
    b.setAttribute('aria-label', 'Замеры');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 15l4-5 3 3 5-7"/></svg><span>Замеры</span>';
    b.addEventListener('click', () => { showScreen('measurements'); vibrate(8); });
    supp.after(b);
  }

  $('#measurement-save').onclick = () => { saveMeasurement(); vibrate(10); };
  $('#measurement-del').onclick = () => {
    if (confirm('Удалить замер за ' + shortDate(mFormDate) + '?')) deleteMeasurement();
  };
})();

/* ───── форма ввода ───── */
function renderMeasureForm() {
  const box = $('#measurement-form');
  if (!box) return;
  const cur = meas().find(m => m.date === mFormDate);
  const v = (cur && cur.v) || {};

  box.innerHTML =
    '<div class="mdate">' +
      '<button class="step" type="button" data-md="-1" aria-label="Предыдущий день">‹</button>' +
      '<input type="date" id="m-date" value="' + mFormDate + '" max="' + localDay() + '" aria-label="Дата замера">' +
      '<button class="step" type="button" data-md="1" aria-label="Следующий день">›</button>' +
    '</div>' +
    '<div class="mgrid">' +
      BODY.map(f =>
        '<label class="mfield"><b class="mlabel">' + f.name + '</b>' +
          '<span class="mwrap"><input data-mkey="' + f.key + '" type="text" inputmode="decimal" autocomplete="off" placeholder="—" value="' +
            (v[f.key] != null ? String(v[f.key]).replace('.', ',') : '') + '"><em>' + f.unit + '</em></span>' +
        '</label>').join('') +
    '</div>';

  $('#measurement-save').textContent = cur ? 'Обновить замер' : 'Сохранить замер';
  $('#measurement-del').hidden = !cur;

  const d = $('#m-date');
  d.onchange = () => {
    if (!d.value) return;
    mFormDate = d.value > localDay() ? localDay() : d.value;
    renderMeasureForm();
  };
  box.querySelectorAll('.step').forEach(b => {
    b.onclick = () => { shiftDate(Number(b.dataset.md)); vibrate(8); };
  });
}

function shiftDate(by) {
  const d = new Date(mFormDate + 'T12:00:00');
  d.setDate(d.getDate() + by);
  const next = localDay(d);
  if (next > localDay()) return;
  mFormDate = next;
  renderMeasureForm();
}

function saveMeasurement() {
  const v = {};
  let bad = '';
  $$('#measurement-form input[data-mkey]').forEach(inp => {
    const raw = inp.value.trim().replace(',', '.');
    if (!raw) return;
    const n = Number(raw);
    if (!isFinite(n) || n <= 0 || n > 400) { bad = inp.closest('.mfield').querySelector('.mlabel').textContent; return; }
    v[inp.dataset.mkey] = Math.round(n * 10) / 10;
  });
  if (bad) { toast('Проверь поле «' + bad + '»'); return; }
  if (!Object.keys(v).length) { toast('Заполни хотя бы один показатель'); return; }

  const list = meas();
  const i = list.findIndex(m => m.date === mFormDate);
  if (i >= 0) list[i] = { date: mFormDate, v }; else list.push({ date: mFormDate, v });
  list.sort((a, b) => a.date.localeCompare(b.date));

  save();
  renderMeasurements();
  toast('Замер сохранён');
}

function deleteMeasurement() {
  state.measurements = meas().filter(m => m.date !== mFormDate);
  save();
  renderMeasurements();
  toast('Замер удалён');
}

/* ───── график и таблица ───── */
function renderMeasurements() {
  renderMeasureForm();
  const pick = $('#measurement-pick'), chart = $('#measurement-chart'), table = $('#measurement-table');
  if (!pick || !chart || !table) return;

  const list = meas();
  if (!list.length) {
    pick.innerHTML = '';
    chart.innerHTML = '<p class="hint center">Сохрани первый замер — здесь появится график.</p>';
    table.innerHTML = '';
    return;
  }

  chips(pick, BODY.map(f => ({ id: f.key, title: f.name })), mChartKey, id => { mChartKey = id; renderMeasurements(); });
  drawBodyChart();

  const cols = list.slice().reverse();   // свежие слева
  table.innerHTML =
    '<div class="mtablewrap"><table class="mtable"><thead><tr><th scope="col">Показатель</th>' +
      cols.map(m => '<th scope="col"><button type="button" data-date="' + m.date + '">' + shortDate(m.date) + '</button></th>').join('') +
    '</tr></thead><tbody>' +
      BODY.map(f => '<tr><th scope="row">' + f.name + '</th>' +
        cols.map(m => '<td>' + (m.v[f.key] != null ? fmtKg(m.v[f.key]) : '<span class="dash">—</span>') + '</td>').join('') +
      '</tr>').join('') +
    '</tbody></table></div>' +
    '<p class="hint">Нажми на дату в таблице, чтобы исправить этот замер.</p>';

  table.onclick = e => {
    const b = e.target.closest('[data-date]');
    if (!b) return;
    mFormDate = b.dataset.date;
    renderMeasureForm();
    $('#measurement-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-');
  return d + '.' + m + '.' + y.slice(2);
}

function drawBodyChart() {
  const box = $('#measurement-chart');
  const f = BODY.find(x => x.key === mChartKey) || BODY[0];
    const pts = meas().filter(m => m && m.v && m.v[f.key] != null).map(m => ({ d: m.date, v: m.v[f.key] }));

  if (pts.length < 2) {
    box.innerHTML = '<p class="hint center">Для графика «' + f.name + '» нужно минимум 2 замера.</p>';
    return;
  }

  const W = 340, H = 200, pl = 40, pr = 14, pt = 14, pb = 28;
  const vals = pts.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;

  const x = i => pl + i * (W - pl - pr) / (pts.length - 1);
  const y = v => pt + (max - v) / (max - min) * (H - pt - pb);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - pb) + ' L' + x(0).toFixed(1) + ' ' + (H - pb) + ' Z';

  let grid = '';
  for (let g = 0; g <= 3; g++) {
    const val = max - g * (max - min) / 3, yy = y(val);
    grid += '<line x1="' + pl + '" y1="' + yy + '" x2="' + (W - pr) + '" y2="' + yy + '" stroke="rgba(255,255,255,.07)"/>' +
      '<text x="' + (pl - 6) + '" y="' + (yy + 3) + '" text-anchor="end" fill="#8d8d93" font-size="9">' + fmtKg(val) + '</text>';
  }
  const dots = pts.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3.5" fill="#fff" stroke="#ff2d45" stroke-width="2"/>').join('');

  const first = pts[0].v, last = pts[pts.length - 1].v, diff = last - first;

  box.innerHTML =
    '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График: ' + f.name + '">' +
      '<defs><linearGradient id="mgArea" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#ff2d45" stop-opacity=".35"/><stop offset="1" stop-color="#ff2d45" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#mgArea)"/>' +
      '<path d="' + line + '" fill="none" stroke="#ff2d45" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      dots +
      '<text x="' + pl + '" y="' + (H - 8) + '" fill="#8d8d93" font-size="9">' + shortDate(pts[0].d) + '</text>' +
      '<text x="' + (W - pr) + '" y="' + (H - 8) + '" fill="#8d8d93" font-size="9" text-anchor="end">' + shortDate(pts[pts.length - 1].d) + '</text>' +
    '</svg>' +
    '<div class="mstats">' +
      '<div><b>' + fmtKg(first) + '</b><span>было, ' + f.unit + '</span></div>' +
      '<div><b>' + fmtKg(last) + '</b><span>сейчас, ' + f.unit + '</span></div>' +
      '<div><b class="accent">' + (diff > 0 ? '+' : '') + fmtKg(diff) + '</b><span>изменение</span></div>' +
    '</div>';
}

renders.measurements = renderMeasurements;
