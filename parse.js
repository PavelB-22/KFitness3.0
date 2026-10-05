/* Kfitnes · разбор PDF тренера прямо на телефоне (pdf.js, без интернета) */

if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

/* PDF → массив строк. Склеиваем кусочки текста по высоте строки */
async function pdfLines(file, kind) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim());
    const links = (await page.getAnnotations().catch(() => [])).filter(a => a.subtype === 'Link' && a.url && a.rect);
    const rows = [];
    items.forEach(i => {
      const y = i.transform[5], x = i.transform[4];
      let r = rows.find(r => Math.abs(r.y - y) < 3);
      if (!r) rows.push(r = { y, parts: [] });
      r.parts.push({ x, w: i.width || 0, h: i.height || 10, s: i.str });
    });
    /* Ссылка «видео» → строка, у которой она стоит по высоте. Кладём метку в конец строки */
    links.forEach(a => {
      const y1 = Math.min(a.rect[1], a.rect[3]), h = Math.abs(a.rect[3] - a.rect[1]), base = y1 + h * 0.25;
      let best = null;
      rows.forEach(r => { const d = Math.abs(r.y - base); if (d <= h + 4 && (!best || d < best.d)) best = { r, d }; });
      if (best) (best.r.vids = best.r.vids || []).push({ x: Math.min(a.rect[0], a.rect[2]), url: a.url });
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      /* Пробел ставим только если между кусками есть настоящий зазор. Если зазор ~0, библиотека
         просто разрезала слово или число на части («кроссовер|е», «5|.»): склеиваем вплотную. */
      let t = '', end = null;
      r.parts.sort((a, b) => a.x - b.x).forEach(p => {
        const gap = end === null ? 0 : p.x - end;
        if (t && gap > Math.max(0.8, p.h * 0.12) && !/\s$/.test(t) && !/^\s/.test(p.s)) t += ' ';
        t += p.s;
        end = p.x + p.w;
      });
      t = t.replace(/\s+/g, ' ').trim();
      const vs = (r.vids || []).sort((a, b) => a.x - b.x).filter((v, i, arr) => !arr.slice(0, i).some(w => w.url === v.url));
      lines.push(t + vs.map(v => ' ⟦v:' + encodeURIComponent(v.url) + '⟧').join(''));
    });
  }
  return joinLines(lines.map(clean).filter(Boolean), kind);
}

/* Чистим мусор: логотипы, маркеры списков, слово «ВИДЕО» */
const clean = s => s
  .replace(/^(\d{1,2})\s+([.)])/, '$1$2')
  .replace(/(\d)\s+\*\s*(\d)/g, '$1*$2')
  .replace(/[\uf000-\uf0ff•●▪■◦]/g, '')
  .replace(/\(?\s*(ВИДЕО|видео)\s*\)?/g, ' ')
  .replace(/\(\s*\)/g, '')
  .replace(/\s+/g, ' ').trim();

/* Склейка строк, которые PDF разорвал: «1.» + «текст», перенос длинной фразы */
const HEAD_LINE = /^(вариант(?![а-яё])|или$|приготовлени|из предложенных|дополнительно$)/i;
const DONE_ITEM = /(\d|(?:^|[^а-яёa-z])(?:г|гр|кг|мл|л|шт|мг|мкг|ч\.?\s?л|ст\.?\s?л|капсул[а-яё]*|кап|таб[а-яё]*|ломтик[а-яё]*|порци[а-яё]*|штук[а-яё]*|грамм[а-яё]*)\.?|\))\s*$/i;
function joinLines(lines, kind) {
  const out = [];
  const food = kind === 'food' || kind === 'supp';
  lines.forEach(l => {
    const prev = out[out.length - 1];
    /* питание и добавки: заголовки и готовые пункты («50 г») никогда не клеим к соседям */
    if (food && prev !== undefined && !/^\d{1,2}[.)]$/.test(prev)) {
      const bare = x => x.replace(/:$/, '').trim();
      const isHead = x => HEAD_LINE.test(bare(x)) || FOOD_SEC.test(bare(x)) || (SUPP_SEC.test(bare(x)) && bare(x).length < 40);
      const open0 = prev.split('(').length > prev.split(')').length;
      if (isHead(l) || isHead(prev) || /:$/.test(prev) || (!open0 && /^[а-яё]/.test(l) && DONE_ITEM.test(prev))) { out.push(l); return; }
    }
    if (prev !== undefined && /^\d{1,2}[.)]$/.test(prev)) { out[out.length - 1] = prev + ' ' + l; return; }
    const open = prev && (prev.replace(/⟦v:[^⟧]*⟧/g, '').split('(').length > prev.replace(/⟦v:[^⟧]*⟧/g, '').split(')').length);
    if (prev && (open || (/^[а-яё(]/.test(l) && !/^(или|вариант)/i.test(l) && !/[.:!]$/.test(prev.replace(/\s*⟦v:[^⟧]*⟧/g, ''))))) { out[out.length - 1] = prev + ' ' + l; return; }
    out.push(l);
  });
  return out;
}
const JUNK = /^(KFitness|Вадим Карельский|Программа|тренировок|ПЛАН ПИТАНИЯ|НА НЕДЕЛЮ|МЕНЮ|РЕКОМЕНДУЕМЫЕ|ДОБАВКИ|\d{1,2})$/i;
const cap = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

/* Группа мышц по названию упражнения */
const GROUP_RULES = [
  ['Пресс', /пресс|скручиван|планк|v.?складк|колени к груди|подъ[её]м (ног|корпуса)|ножницы|велосипед/],
  ['Трицепс', /трицепс|кик.?б[эе]к|французск|обратн[а-я]* отжиман|разгибани[а-я]* рук|узким хватом.*жим|брусья/],
  ['Бицепс', /бицепс|молот|сгибани[а-я]* рук|скотт/],
  ['Плечи', /дельт|плеч|махи|фронтальн[а-я]* подъ[её]м|тяг[а-я]* (штанги |гантелей )?к подбородку|жим (штанги |гантелей )?(сидя|из-за головы)|арнольд|жим (штанги |гантелей )?(сидя |стоя )?(вверх|над головой)|армейск|протяжк|разведени[а-я]* .*в стороны|жим со жгутом вверх/],
  ['Спина', /спин|вертикальн[а-я]* тяг|горизонтальн[а-я]* (рычажн[а-я]* )?тяг|рычажн[а-я]* тяг|тяг[а-я]* (верхн|горизонт|вертикал|гантел|штанги в наклон|блока|жгута|резинки|т-гриф)|подтягиван|гиперэкст|ласточк|пуловер|шраги/],
  ['Грудь', /груд|разведени[а-я]* гантелей л[её]ж|жим (штанги|гантелей)? ?л[её]ж|жим .*под углом|бабочк|сведени[а-я]* рук|кроссовер|отжиман/],
  ['Ноги', /ног|присед|выпад|бедр|ягодич|икр|станов|румынск|мостик|гакк|сгибани[а-я]* ног|разгибани[а-я]* ног|отведени[а-я]* ноги|толчок стены|степ|зашагиван/]
];
function guessGroup(name) {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  for (const [g, re] of GROUP_RULES) if (re.test(n)) return g;
  return 'Другое';
}

/* Тренировки: «День N» → упражнения «1. Название 4*12 (примечание)» */
const SCHEME = /(\d+\s*[*хx×]\s*(?:\d+(?:\s*-\s*\d+)?(?:\/\d+)?|[mM][aA][xX]|[мМ][аА][кК][сС]\w*)|\d+(?:\s*[-/]\s*\d+){2,})/;
const normScheme = s => s.replace(/\s+/g, '').replace(/^(\d+)[хx×]/, '$1*').replace(/[мМ][аА][кК][сС]\w*/, 'max');
function parseTraining(lines) {
  const days = [], notes = [];
  let day = null, last = null, ended = false;
  const STOP = /^(внимани|важно|примечани|комментари|рекомендаци|совет)/i;
  const DAY = /^(?:д[еe]нь|тренировка|day)\s*(?:№|#)?\s*(\d+)/i;
  /* «1.», «2 », «3)», «4-», «5,», «5 .» перед названием: любой вариант, лишь бы дальше шла буква */
  const NUM = /^[\s•*\-–—]*(?:(\d{1,2})\s*[.)\-–—:,]*\s*)?([A-Za-zА-Яа-яЁё].*)$/;
  const mkEx = (rest, vids) => {
    let scheme = '', note = '';
    const sm = rest.match(SCHEME);
    if (sm) {
      scheme = normScheme(sm[1]);
      note = rest.slice(sm.index + sm[0].length).replace(/^[\s,.-]+/, '').replace(/^\((.*)\)$/, '$1').trim();
      rest = rest.slice(0, sm.index);
    }
    const name = rest.replace(/[\s,.:;–—-]+$/, '').replace(/^[\s,.:;–—-]+/, '').replace(/\s+/g, ' ').trim();
    if (!name || !/[A-Za-zА-Яа-яЁё]{2}/.test(name)) return null;
    return { name, scheme, group: guessGroup(name), ...(note ? { note } : {}), ...(vids.length ? { video: vids[0] } : {}), ...(vids.length > 1 ? { videos: vids } : {}) };
  };
  lines.forEach(l => {
    /* ссылка на видео: из PDF-ссылки или обычный текст https://... */
    const vids = [];
    l = l.replace(/\s*⟦v:([^⟧]*)⟧/g, (_, u) => { try { vids.push(decodeURIComponent(u)); } catch (e) { vids.push(u); } return ''; });
    if (!vids.length) { const um = l.match(/https?:\/\/[^\s)]+/); if (um) { vids.push(um[0]); l = l.replace(um[0], '').trim(); } }
    l = l.trim();
    if (!l && !vids.length) return;
    if (JUNK.test(l)) return;

    const dm = l.match(DAY);
    if (dm) { days.push(day = { title: `День ${dm[1]}`, exercises: [] }); last = null; ended = false; return; }
    if (STOP.test(l)) { ended = true; last = null; return; }   // «ВНИМАНИЕ!!!» и всё, что после: не упражнения
    if (ended) return;

    const m = l.match(NUM);
    const hasNum = !!(m && m[1]);
    const body = m ? m[2] : l;
    const hasScheme = SCHEME.test(body);
    const upper = /^[A-ZА-ЯЁ]/.test(body);
    const short = body.length <= 110 && body.split(/\s+/).length <= 16;
    /* упражнение: есть номер, ИЛИ (заглавная буква и есть видео/схема) */
    const looksEx = m && short && (hasNum || (upper && (vids.length || hasScheme)));

    if (looksEx && !(hasNum && !upper && !vids.length && !hasScheme && last && !last.scheme)) {
      if (!day) days.push(day = { title: `День ${days.length + 1}`, exercises: [] });
      const ex = mkEx(body, vids);
      if (ex) { day.exercises.push(last = ex); return; }
    }

    /* продолжение длинного названия или лишняя ссылка */
    if (vids.length && day && last) {
      const all = [...(last.videos || (last.video ? [last.video] : [])), ...vids].filter((v, i, a) => a.indexOf(v) === i);
      last.video = all[0]; if (all.length > 1) last.videos = all;
    }
    if (day && last && !last.scheme && /^[а-яё]/.test(l)) {
      const sm = l.match(SCHEME);
      if (sm) { last.name += ' ' + l.slice(0, sm.index).trim(); last.scheme = normScheme(sm[1]); }
      else last.name += ' ' + l;
      last.group = guessGroup(last.name);
      return;
    }
    if (!day) notes.push(l); else if (day.exercises.length === 0) notes.push(l);
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
    if (/^вариант(?![а-яё])/i.test(l)) {
      const vm = l.match(/^(вариант\s*\d+)\s*[:.\-–—]?\s+(.+)$/i);
      if (vm && /\d+\s*(г|гр|мл|шт|мг|кап|ломт|ч\.?\s?л|ст\.?\s?л)/i.test(vm[2])) { newOpt(cap(vm[1].replace(/\s+/g, ' '))); opt.items.push(vm[2].trim()); return; }
      newOpt(l.replace(/[“"]/g, '«').replace(/”/g, '»')); return;
    }
    if (/^или$/i.test(l)) { newOpt('Или'); return; }
    if (!opt) newOpt('');
    const cm = l.match(/^приготовлени[а-яё]*\s*[:.\-–—]?\s*(.*)$/i);
    if (cm) { cooking = true; if (cm[1]) opt.note = (opt.note + (opt.note ? ' ' : '') + cm[1]).trim(); return; }
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
  const lines = await pdfLines(file, kind === 'training' ? 'training' : kind === 'food' ? 'food' : 'supp');
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
