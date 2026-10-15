// Practice: choose a world and difficulty; no score, always shows the explanation.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { go, screen, topBar, makePool, recordAnswer, catStyle, toast } from '../core.js';
import { CATEGORIES, DIFFICULTIES } from '../config.js';
import { nearestDifficulty } from '../data.js';
import { questionView } from '../components/question.js';

const sel = { cat: 'all', d: 0 };
let tally = { correct: 0, total: 0 };

export function practiceSetupScreen() {
  const pool = makePool();
  const available = pool.categories();
  if (sel.cat !== 'all' && !available.includes(sel.cat)) sel.cat = 'all';
  const countEl = h('p', { class: 'muted center', 'aria-live': 'polite' });
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: start }, svg(ICONS.play), t('practice.start'));

  const noteEl = h('p', { class: 'banner banner-warn practice-note', role: 'status', hidden: true });

  function count() {
    const cat = sel.cat === 'all' ? null : sel.cat;
    const n = pool.size(cat, sel.d || null);
    const d = effectiveDifficulty(pool);
    countEl.textContent = t('practice.available', { n: num(d === sel.d ? n : pool.size(cat, d || null)) });
    // A difficulty with no questions yet (e.g. Expert before its questions ship) falls back to the nearest one.
    noteEl.hidden = !(sel.d && n === 0);
    if (!noteEl.hidden) {
      noteEl.textContent = d
        ? t('practice.fallback', { level: t(`difficulty.${sel.d}`), fallback: t(`difficulty.${d}`) })
        : t('practice.empty', { level: t(`difficulty.${sel.d}`) });
    }
    startBtn.disabled = pool.size(cat, d || null) === 0;
  }

  const chip = (value, label, group, extra = {}) => h('button', {
    type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(sel[group] === value), ...extra,
    onclick: (e) => {
      sel[group] = value;
      e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      count();
    },
  }, label);

  function start() {
    tally = { correct: 0, total: 0 };
    go('practice');
  }

  const el = screen('practice-setup',
    topBar(t('practice.title')),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title', id: 'pr-cat' }, t('practice.category')),
      h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': 'pr-cat' },
        chip('all', t('practice.all'), 'cat'),
        CATEGORIES.filter((c) => available.includes(c)).map((c) => chip(c, [h('span', { class: 'chip-gem', 'aria-hidden': 'true', html: gemSvg(c, { size: 18 }) }), t(`cat.${c}`)], 'cat', catStyle(c))))),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title', id: 'pr-d' }, t('practice.difficulty')),
      h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': 'pr-d' },
        chip(0, t('practice.any'), 'd'), DIFFICULTIES.map((d) => chip(d, t(`difficulty.${d}`), 'd')))),
    countEl,
    noteEl,
    h('div', { class: 'sticky-actions' }, startBtn));
  count();
  return el;
}

/**
 * The difficulty practice actually draws: the chosen one, or the nearest one that has questions
 * for the chosen world (0 = any, null = nothing at all).
 */
function effectiveDifficulty(pool) {
  if (!sel.d) return 0;
  const cats = sel.cat === 'all' ? CATEGORIES : [sel.cat];
  const counts = {};
  for (const d of DIFFICULTIES) counts[d] = cats.reduce((n, c) => n + pool.size(c, d), 0);
  return nearestDifficulty(sel.d, counts, null, true);
}

export function practiceScreen() {
  const pool = makePool();
  const d = effectiveDifficulty(pool);
  const filter = (q) => !d || q.d === d;
  const q = d === null ? null : (sel.cat === 'all' ? pool.drawAny(d || null) : pool.draw(sel.cat, filter));
  if (!q) { setTimeout(() => go('practice-setup')); toast(t('errors.noQuestions')); return screen('', h('h1', {}, t('practice.title'))); }
  const tallyEl = h('span', { class: 'tally' }, t('practice.tally', { correct: tally.correct, total: tally.total }));
  const end = () => go('practice-setup');
  return screen('question practice',
    topBar(t('practice.title'), { back: end, right: h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: end }, t('practice.end')) }),
    questionView({
      question: q,
      top: h('div', { class: 'q-top' }, tallyEl),
      continueLabel: t('common.next'),
      onAnswer: ({ correct }) => {
        recordAnswer(q.c, correct);
        tally.total++;
        if (correct) tally.correct++;
        tallyEl.textContent = t('practice.tally', { correct: tally.correct, total: tally.total });
        return null;
      },
      onContinue: () => go('practice'),
    }));
}
