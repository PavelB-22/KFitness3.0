/* Kfitnes · вкладки «Питание» и «Добавки» (только просмотр) */

function renderPlan(kind, listSel, chipsSel, emptyText) {
  const plans = state[kind];
  const list = $(listSel);
  if (!plans.length) {
    $(chipsSel).innerHTML = '';
    list.innerHTML = emptyBox('Пока пусто', emptyText);
    return;
  }
  const selKey = kind + 'Week';
  const cur = plans.find(p => p.id === state.sel[selKey]) || plans[plans.length - 1];
  chips($(chipsSel), plans, cur.id, id => { state.sel[selKey] = id; save(false); renderPlan(kind, listSel, chipsSel, emptyText); });

  list.innerHTML = cur.sections.map((s, si) => `
    <div class="card meal" style="animation-delay:${si * 45}ms">
      <h3>${esc(s.title)}</h3>
      ${s.options.map(o => `
        <div class="opt">
          ${o.title ? `<h4>${esc(o.title)}</h4>` : ''}
          <ul>${o.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
          ${o.note ? (o.note.length > 140
            ? `<details><summary>Как приготовить</summary><p>${esc(o.note)}</p></details>`
            : `<p>${esc(o.note)}</p>`) : ''}
        </div>`).join('')}
    </div>`).join('');
}

renders.food = () => renderPlan('food', '#food-list', '#food-weeks', 'Нет планов питания. Добавь их через «+» внизу → Питание → «+» справа вверху.');
renders.supp = () => renderPlan('supplements', '#supp-list', '#supp-weeks', 'Нет планов добавок. Добавь их через «+» внизу → Добавки → «+» справа вверху.');
