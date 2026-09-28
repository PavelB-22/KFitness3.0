/* Kfitnes · старт: кто вошёл, данные, нужный экран */
(async () => {
  try {
    await initStorage();
    await initSync();

    if (isTrainer()) { showScreen('clients'); return; }

    renderAll();
    const s = state.sel.screen;
    showScreen(['train', 'food', 'supp', 'measurements'].includes(s) ? s : 'train');
  } catch (e) {
    renderAll();
  }
})();
