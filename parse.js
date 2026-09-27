/* Kfitnes · разбор PDF тренера прямо на телефоне (pdf.js, без интернета) */

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

/* PDF → массив строк. Склеиваем кусочки текста по высоте строки */
async function pdfLines(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const items = (await (await pdf.getPage(p)).getTextContent()).items.filter(i => i.str && i.str.trim());
    const rows = [];
    items.forEach(i => {
      const y = i.transform[5], x = i.transform[4];
      let r = rows.find(r => Math.abs(r.y - y) < 3);
      if (!r) rows.push(r = { y, parts: [] });
      r.parts.push({ x, s: i.str });
    });
    rows.sort((a, b) => b.y - a.y).forEach(r =>
      lines.push(r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return joinLines(lines.map(clean).filter(Boolean));
}

/* Чистим мусор: логотипы, маркеры списков, слово «ВИДЕО» */
const clean = s => s
  .replace(/[\uf000-\uf0ff•●▪■◦]/g, '')
  .replace(/\(?\s*(ВИДЕО|видео)\s*\)?/g, ' ')
  .replace(/\(\s*\)/g, '')
  .replace(/\s+/g, ' ').trim();

/* Склейка строк, которые PDF разорвал: «1.» + «текст», перенос длинной фразы */
function joinLines(lines) {
  const out = [];
  lines.forEach(l => {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^\d{1,2}[.)]$/.test(prev)) { out[out.length - 1] = prev + ' ' + l; return; }
    const open = prev && (prev.split('(').length > prev.split(')').length);
    if (prev && (open || (/^[а-яё(]/.test(l) && !/^(или|вариант)/i.test(l) && !/[.:!]$/.test(prev)))) { out[out.length - 1] = prev + ' ' + l; return; }
    out.push(l);
  });
  return out;
}
const JUNK = /^(KFitness|Вадим Карельский|Программа|тренировок|ПЛАН ПИТАНИЯ|НА НЕДЕЛЮ|МЕНЮ|РЕКОМЕНДУЕМЫЕ|ДОБАВКИ|\d{1,2})$/i;
const cap = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

/* Группа мышц по названию упражнения */
const GROUP_RULES = [
  ['Пресс', /пресс|скручиван|планк|v.?складк|колени к груди|подъ[её]м (ног|корпуса)|ножницы|велосипед/],
  ['Трицепс', /трицепс|французск|обратн[а-я]* отжиман|разгибани[а-я]* рук|узким хватом.*жим|брусья/],
  ['Бицепс', /бицепс|молот|сгибани[а-я]* рук|скотт/],
  ['Плечи', /дельт|плеч|махи|арнольд|жим (штанги |гантелей )?(сидя |стоя )?(вверх|над головой)|армейск|протяжк|разведени[а-я]* .*в стороны|жим со жгутом вверх/],
  ['Спина', /спин|тяг[а-я]* (верхн|горизонт|вертикал|гантел|штанги в наклон|блока|жгута|резинки|т-гриф)|подтягиван|гиперэкст|ласточк|пуловер|шраги/],
  ['Грудь', /груд|разведени[а-я]* гантелей л[её]ж|жим (штанги|гантелей)? ?л[её]ж|жим .*под углом|бабочк|сведени[а-я]* рук|кроссовер|отжиман/],
  ['Ноги', /ног|присед|выпад|бедр|ягодич|икр|станов|румынск|мостик|гакк|сгибани[а-я]* ног|разгибани[а-я]* ног|отведени[а-я]* ноги|толчок стены|степ|зашагиван/]
];
function guessGroup(name) {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  for (const [g, re] of GROUP_RULES) if (re.test(n)) return g;
  return 'Другое';
}

/* Тренировки: «День N» → упражнения «1. Название 4*12 (примечание)» */
const SCHEME = /(\d+\s*[*хx×]\s*\d+(?:\s*-\s*\d+)?|\d+(?:\s*-\s*\d+){2,})/;
function parseTraining(lines) {
  const days = [], notes = [];
  let day = null, last = null;
  lines.forEach(l => {
    if (JUNK.test(l)) return;
    const dm = l.match(/^День\s*(\d+)/i);
    if (dm) { days.push(day = { title: `День ${dm[1]}`, exercises: [] }); last = null; return; }
    const em = l.match(/^(\d{1,2})[.)]\s*(.+)$/);
    if (day && em) {
      let rest = em[2], scheme = '', note = '';
      const sm = rest.match(SCHEME);
      if (sm) {
        scheme = sm[1].replace(/\s+/g, '').replace(/[хx×]/g, '*');
        note = rest.slice(sm.index + sm[0].length).replace(/^[\s,.-]+/, '').replace(/^\((.*)\)$/, '$1').trim();
        rest = rest.slice(0, sm.index);
      }
      const name = rest.replace(/[\s,.-]+$/, '').trim();
      if (name) day.exercises.push(last = { name, scheme, group: guessGroup(name), ...(note ? { note } : {}) });
      return;
    }
    // Строка-продолжение длинного названия (перенос в PDF)
    if (day && last && !last.scheme && /^[а-яё]/.test(l)) {
      const sm = l.match(SCHEME);
      if (sm) { last.name += ' ' + l.slice(0, sm.index).trim(); last.scheme = sm[1].replace(/\s+/g, '').replace(/[хx×]/g, '*'); }
      else last.name += ' ' + l;
      last.group = guessGroup(last.name);
      return;
    }
    if (!day) notes.push(l); else if (!em && day.exercises.length === 0) notes.push(l);
  });
  return { days: days.filter(d => d.exercises.length), note: notes.filter(n => n.length > 12).join(' ').slice(0, 300) };
}

/* Питание и добавки: разделы → варианты → пункты */
const FOOD_SEC = /^(завтрак|перекус|обед|ужин|заключительный при[её]м.*|3 основных при[её]ма|полдник)(\s*\(.*\))?$/i;
const SUPP_SEC = /^(перед|после|за несколько|во время|утром|вечером|днём|днем|натощак|ежедневно|преп)/i;
function parseSections(lines, kind) {
  const sections = [];
  let sec = null, opt = null, cooking = false;
  const newSec = title => { sections.push(sec = { title, options: [] }); opt = null; cooking = false; };
  const newOpt = title => { if (!sec) newSec(kind === 'food' ? 'План' : 'Добавки'); sec.options.push(opt = { title, items: [], note: '' }); cooking = false; };
  lines.forEach(raw => {
    const l = raw.replace(/:$/, '').trim();
    if (!l || JUNK.test(l) || /^из предложенных вариантов/i.test(l) || /^дополнительно$/i.test(l)) return;
    const isSec = kind === 'food' ? FOOD_SEC.test(l) : SUPP_SEC.test(l) && l.length < 40;
    if (isSec) { newSec(/^преп/i.test(l) ? 'Препараты' : cap(l)); return; }
    if (/^вариант\b/i.test(l)) { newOpt(l.replace(/[“"]/g, '«').replace(/”/g, '»')); return; }
    if (/^или$/i.test(l)) { newOpt('Или'); return; }
    if (!opt) newOpt('');
    if (/^приготовлени/i.test(l)) { cooking = true; return; }
    const item = l.replace(/^\d{1,2}[.)]\s*/, '');
    if (cooking || (item.length > 90 && !/\d+\s*(г|мл|шт|мг|кап)/.test(item)) || /^все ингр/i.test(item)) {
      opt.note = (opt.note + (opt.note ? ' ' : '') + item).trim(); return;
    }
    opt.items.push(item);
  });
  sections.forEach(s => { s.options = s.options.filter(o => o.items.length || o.note); });
  return sections.filter(s => s.options.length);
}

/* Главная функция: файл → план для нужного раздела */
async function parsePdf(file, kind) {
  const lines = await pdfLines(file);
  if (!lines.length) throw new Error('В PDF нет текста (похоже, это картинка)');
  const base = file.name.replace(/\.pdf$/i, '').replace(/^[0-9a-f]{20,}_/i, '').trim();
  if (kind === 'training') {
    const t = parseTraining(lines);
    if (!t.days.length) throw new Error('Не нашёл «День 1, День 2…» с упражнениями');
    return { id: uid('gym'), title: `Тренировки · ${base}`, source: file.name, ...(t.note ? { note: t.note } : {}), days: t.days };
  }
  const sections = parseSections(lines, kind);
  if (!sections.length) throw new Error('Не удалось разобрать разделы в PDF');
  return { id: uid(kind === 'food' ? 'food' : 'supp'), title: `${kind === 'food' ? 'Питание' : 'Добавки'} · ${base}`, source: file.name, sections };
}
