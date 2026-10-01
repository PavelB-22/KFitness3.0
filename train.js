/* Kfitnes · вкладка «Тренировки» + прогресс */

function curWeek() {
  const w = state.training;
  return w.find(x => x.id === state.sel.week) || w[w.length - 1];
}

/* Прошлый записанный вес этого упражнения (в предыдущих неделях) */
function prevWeight(weekIdx, name) {
  const k = exKey(name);
  for (let i = weekIdx - 1; i >= 0; i--) {
    const wk = state.training[i]; let best = null;
    wk.days.forEach((d, di) => d.exercises.forEach((e, ei) => {
      const v = state.logs[logKey(wk.id, di, ei)];
      if (exKey(e.name) === k && v > 0) best = Math.max(best || 0, v);
    }));
    if (best) return { v: best, week: wk.title };
  }
  return null;
}

function renderTrain() {
  const list = $('#train-list');
  if (!state.training.length) {
    $('#train-weeks').innerHTML = ''; $('#train-days').innerHTML = ''; $('#train-note').textContent = '';
    list.innerHTML = emptyBox('Пока пусто', 'Программ тренировок нет. Нажми «+» внизу → Программы тренировок → «+» справа вверху, чтобы добавить PDF или JSON от тренера.');
    renderProgress(); return;
  }
  const wk = curWeek();
  const wIdx = state.training.indexOf(wk);
  chips($('#train-weeks'), state.training, wk.id, id => { state.sel.week = id; state.sel.day = 0; save(false); renderTrain(); });

  const day = Math.min(state.sel.day || 0, wk.days.length - 1);
  const seg = $('#train-days');
  seg.innerHTML = wk.days.map((d, i) =>
    `<button role="tab" aria-selected="${i === day}" data-i="${i}">${esc(d.title.replace('День ', 'Д'))}</button>`).join('');
  seg.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state.sel.day = +b.dataset.i; save(false); renderTrain(); vibrate(8);
  };
  $('#train-note').textContent = wk.note || '';

  list.innerHTML = wk.days[day].exercises.map((e, i) => {
    const v = state.logs[logKey(wk.id, day, i)];
    const p = prevWeight(wIdx, e.name);
    let diff = '';
    if (p) {
      const d = v > 0 ? v - p.v : null;
      diff = `<span class="tag">прошлый раз ${fmtKg(p.v)} кг</span>` +
        (d ? `<span class="tag ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtKg(d)}</span>` : '');
    }
    const id = `w-${i}`;
    return `<div class="card ex${e.video || (e.videos && e.videos.length) ? ' has-video' : ''}" data-i="${i}" style="animation-delay:${i * 40}ms">
      <div>
        <div class="ex-name">${i + 1}. ${esc(e.name)}</div>
        <div class="ex-meta">
          ${e.video || (e.videos && e.videos.length) ? `<span class="tag play">▶ видео${e.videos && e.videos.length > 1 ? ' ×' + e.videos.length : ''}</span>` : ''}
          ${e.scheme ? `<span class="tag red">${esc(e.scheme)}</span>` : ''}
          <span class="tag">${esc(e.group || '')}</span>
          ${e.note ? `<span class="tag">${esc(e.note)}</span>` : ''}${diff}
        </div>
      </div>
      <label class="w ${v > 0 ? 'filled' : ''}" for="${id}">
        <input id="${id}" inputmode="decimal" enterkeyhint="done" placeholder="–" data-i="${i}"
          aria-label="Максимальный вес: ${esc(e.name)}" value="${v > 0 ? fmtKg(v) : ''}"><span>кг</span>
      </label>
    </div>`;
  }).join('');

  /* тап по упражнению (не по полю веса) → окошко с видео */
  list.querySelectorAll('.card.ex.has-video').forEach(card => {
    card.addEventListener('click', ev => {
      if (ev.target.closest('label.w, input')) return;
      const ex = wk.days[day].exercises[+card.dataset.i];
      const src = ex && (ex.videos && ex.videos.length ? ex.videos : ex.video);
      if (src && window.openVideo) { vibrate(8); openVideo(src, ex.name); }
    });
  });

  list.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const n = parseFloat(inp.value.replace(',', '.'));
      const k = logKey(wk.id, day, +inp.dataset.i);
      if (n > 0 && n < 1000) state.logs[k] = n; else delete state.logs[k];
      save(); vibrate(10);
      const y = window.scrollY; renderTrain(); window.scrollTo(0, y);
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });
  renderProgress();
}

/* Сбор истории: упражнение → [{неделя, макс}] */
function collectHistory() {
  const map = new Map();
  state.training.forEach(wk => wk.days.forEach((d, di) => d.exercises.forEach((e, ei) => {
    const v = state.logs[logKey(wk.id, di, ei)];
    if (!(v > 0)) return;
    const k = exKey(e.name);
    if (!map.has(k)) map.set(k, { name: e.name, group: e.group || 'Другое', pts: new Map() });
    const pts = map.get(k).pts;
    pts.set(wk.id, { week: wk.title, v: Math.max(v, pts.get(wk.id)?.v || 0) });
  })));
  return [...map.values()].map(x => ({ ...x, pts: [...x.pts.values()] }));
}

function spark(pts) {
  const W = 300, H = 56, pad = 6;
  if (pts.length < 2) return '';
  const vs = pts.map(p => p.v), mn = Math.min(...vs), mx = Math.max(...vs), rng = mx - mn || 1;
  const xy = pts.map((p, i) => [pad + i * (W - 2 * pad) / (pts.length - 1), H - 14 - (p.v - mn) / rng * (H - 24)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${xy.at(-1)[0]} ${H - 10} L${xy[0][0]} ${H - 10} Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ff2d45"/></linearGradient>
    <linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,45,69,.25)"/><stop offset="1" stop-color="rgba(255,45,69,0)"/></linearGradient></defs>
    <path class="ar" d="${area}"/><path class="ln" d="${line}"/>
    ${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#fff"/>`).join('')}
  </svg>`;
}

function renderProgress() {
  const all = collectHistory();
  const g = state.sel.group || 'Все';
  const groups = ['Все', ...GROUPS.filter(x => all.some(a => a.group === x))];
  chips($('#prog-groups'), groups.map(x => ({ id: x, title: x })), g, id => { state.sel.group = id; save(false); renderProgress(); });

  const rows = all.filter(a => g === 'Все' || a.group === g);
  const withGrowth = rows.filter(r => r.pts.length > 1);
  const pct = r => (r.pts.at(-1).v - r.pts[0].v) / r.pts[0].v * 100;
  const avg = withGrowth.length ? withGrowth.reduce((s, r) => s + pct(r), 0) / withGrowth.length : 0;
  const records = rows.reduce((s, r) => s + (r.pts.length > 1 && r.pts.at(-1).v >= Math.max(...r.pts.map(p => p.v)) && pct(r) > 0 ? 1 : 0), 0);

  $('#prog-summary').innerHTML = rows.length ? `
    <div><b>${rows.length}</b><span>упражнений с весом</span></div>
    <div><b>${avg > 0 ? '+' : ''}${avg.toFixed(1)}%</b><span>средний прирост</span></div>
    <div><b>${records}</b><span>на рекорде сейчас</span></div>` : '';

  $('#prog-list').innerHTML = rows.length ? rows
    .sort((a, b) => b.pts.length - a.pts.length || a.name.localeCompare(b.name))
    .map(r => {
      const first = r.pts[0].v, last = r.pts.at(-1).v, best = Math.max(...r.pts.map(p => p.v));
      const p = r.pts.length > 1 ? pct(r) : null;
      return `<div class="card">
        <div class="pr-head"><div class="ex-name">${esc(r.name)}</div>
          <div class="pr-pct ${p > 0 ? 'up' : ''}">${p === null ? '' : (p > 0 ? '+' : '') + p.toFixed(0) + '%'}</div></div>
        <div class="ex-meta"><span class="tag">${esc(r.group)}</span>
          <span class="tag">${fmtKg(first)} → ${fmtKg(last)} кг</span>
          <span class="tag red">рекорд ${fmtKg(best)} кг</span>
          <span class="tag">${r.pts.length} нед.</span></div>
        ${spark(r.pts)}
      </div>`;
    }).join('')
    : emptyBox('Прогресса пока нет', 'Вписывай максимальный вес напротив упражнений, и здесь появятся графики по неделям.');
}

renders.train = renderTrain;
