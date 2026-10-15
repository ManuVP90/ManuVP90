// Practice: choose a world and difficulty; no score, always shows the explanation.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { go, screen, topBar, makePool, recordAnswer, catStyle, toast } from '../core.js';
import { CATEGORIES } from '../config.js';
import { questionView } from '../components/question.js';

const sel = { cat: 'all', d: 0 };
let tally = { correct: 0, total: 0 };

export function practiceSetupScreen() {
  const pool = makePool();
  const available = pool.categories();
  if (sel.cat !== 'all' && !available.includes(sel.cat)) sel.cat = 'all';
  const countEl = h('p', { class: 'muted center', 'aria-live': 'polite' });
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: start }, svg(ICONS.play), t('practice.start'));

  function count() {
    const n = pool.size(sel.cat === 'all' ? null : sel.cat, sel.d || null);
    countEl.textContent = t('practice.available', { n: num(n) });
    startBtn.disabled = n === 0;
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
        chip(0, t('practice.any'), 'd'), [1, 2, 3].map((d) => chip(d, t(`difficulty.${d}`), 'd')))),
    countEl,
    h('div', { class: 'sticky-actions' }, startBtn));
  count();
  return el;
}

export function practiceScreen() {
  const pool = makePool();
  const filter = (q) => !sel.d || q.d === sel.d;
  const q = sel.cat === 'all' ? pool.drawAny(sel.d || null) : pool.draw(sel.cat, filter);
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
