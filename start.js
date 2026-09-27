/* Kfitnes · старт: спрашиваем сервер, кто мы, и тянем данные */
(async () => {
  try {
    await initStorage();      // поднимаем копию с телефона
    await initSync();         // кто я + данные с сервера
    renderAll();              // перерисовываем всё
    const s = state.sel.screen || 'train';
    showScreen(s);            // возвращаемся на ту вкладку, где были
  } catch (e) {
    // если сервер не ответил — работаем на том, что есть в телефоне
    renderAll();
  }
})();
