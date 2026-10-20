// Practice: choose a world and difficulty, or "My mistakes" (questions missed in any mode);
// no score, always shows the explanation. A missed question answered right here leaves the list.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { go, screen, topBar, makePool, recordAnswer, catStyle, toast, getMissed, noteMissed, clearMissed, unlockAchievement } from '../core.js';
import { CATEGORIES, DIFFICULTIES } from '../config.js';
import { nearestDifficulty, pick } from '../data.js';
import { questionView } from '../components/question.js';

const MISSED = 'missed';
const sel = { cat: 'all', d: 0 };
let tally = { correct: 0, total: 0 };
// "My mistakes": ids already drawn in this practice session (no repeats until all were shown).
let missedShown = new Set();
let lastMissed = null;

/** Missed questions that the spoiler filter still allows. */
const missedIn = (pool) => getMissed().filter((id) => pool.get(id));

export function practiceSetupScreen() {
  const pool = makePool();
  const available = pool.categories();
  const missed = missedIn(pool);
  if (sel.cat === MISSED ? !missed.length : (sel.cat !== 'all' && !available.includes(sel.cat))) sel.cat = 'all';
  const countEl = h('p', { class: 'muted center', 'aria-live': 'polite' });
  const startBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: start }, svg(ICONS.play), t('practice.start'));

  const noteEl = h('p', { class: 'banner banner-warn practice-note', role: 'status', hidden: true });

  function count() {
    diffCard.hidden = sel.cat === MISSED;
    if (sel.cat === MISSED) {
      countEl.textContent = t('practice.missedAvailable', { n: num(missed.length) });
      noteEl.hidden = true;
      startBtn.disabled = !missed.length;
      return;
    }
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

  // "My mistakes" and the worlds are one choice split in two cards: the group spans the screen.
  const chip = (value, label, group, extra = {}) => h('button', {
    type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(sel[group] === value), dataset: { group }, ...extra,
    onclick: (e) => {
      sel[group] = value;
      const scope = e.currentTarget.closest('.screen') || e.currentTarget.parentElement;
      scope.querySelectorAll(`.chip[data-group="${group}"]`).forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      count();
    },
  }, label);

  function start() {
    tally = { correct: 0, total: 0 };
    missedShown = new Set();
    lastMissed = null;
    go('practice');
  }

  // Nothing to practice at all: the spoiler filter leaves no questions. Say so and offer Settings.
  const none = pool.size() === 0 ? h('section', { class: 'card practice-empty', role: 'status' },
    h('p', { class: 'banner banner-warn' }, t('practice.noneFilter')),
    h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => go('settings') }, svg(ICONS.settings), t('common.openSettings'))) : null;

  const diffCard = h('section', { class: 'card practice-diff' },
    h('h2', { class: 'section-title', id: 'pr-d' }, t('practice.difficulty')),
    h('div', { class: 'chips chips-diff', role: 'radiogroup', 'aria-labelledby': 'pr-d' },
      chip(0, t('practice.any'), 'd'), DIFFICULTIES.map((d) => chip(d, t(`difficulty.${d}`), 'd'))));

  // "My mistakes": its own card above the worlds, disabled (with the reason) while the list is empty.
  const missedChip = chip(MISSED, [svg(ICONS.refresh), t('practice.missed', { n: num(missed.length) })], 'cat', { class: 'chip chip-missed', disabled: !missed.length || null });
  const missedCard = h('section', { class: 'card practice-missed' },
    h('div', { class: 'chips chips-missed', role: 'radiogroup', 'aria-label': t('practice.missedLabel') }, missedChip),
    h('p', { class: 'muted practice-missed-hint' }, missed.length ? t('practice.missedHint') : t('practice.missedNone')));

  const el = screen('practice-setup',
    topBar(t('practice.title')),
    none,
    missedCard,
    h('section', { class: 'card' },
      h('h2', { class: 'section-title', id: 'pr-cat' }, t('practice.category')),
      h('div', { class: 'chips chips-cat', role: 'radiogroup', 'aria-labelledby': 'pr-cat' },
        chip('all', t('practice.all'), 'cat'),
        CATEGORIES.filter((c) => available.includes(c)).map((c) => chip(c, [h('span', { class: 'chip-gem', 'aria-hidden': 'true', html: gemSvg(c, { size: 18 }) }), t(`cat.${c}`)], 'cat', catStyle(c))))),
    diffCard,
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
  if (!sel.d || sel.cat === MISSED) return 0;
  const cats = sel.cat === 'all' ? CATEGORIES : [sel.cat];
  const counts = {};
  for (const d of DIFFICULTIES) counts[d] = cats.reduce((n, c) => n + pool.size(c, d), 0);
  return nearestDifficulty(sel.d, counts, null, true);
}

/** Next "My mistakes" question: one not shown yet in this session, never the last one twice in a row. */
function drawMissed(pool) {
  const ids = missedIn(pool);
  if (!ids.length) return null;
  let fresh = ids.filter((id) => !missedShown.has(id));
  if (!fresh.length) {
    missedShown = new Set();
    fresh = ids.length > 1 ? ids.filter((id) => id !== lastMissed) : ids;
  }
  const id = pick(fresh);
  missedShown.add(id);
  lastMissed = id;
  return pool.get(id);
}

export function practiceScreen() {
  const pool = makePool();
  const missedMode = sel.cat === MISSED;
  const d = effectiveDifficulty(pool);
  const filter = (q) => !d || q.d === d;
  let q;
  if (missedMode) q = drawMissed(pool);
  else q = d === null ? null : (sel.cat === 'all' ? pool.drawAny(d || null) : pool.draw(sel.cat, filter));
  if (!q) { setTimeout(() => go('practice-setup')); toast(t('errors.noQuestions')); return screen('', h('h1', {}, t('practice.title'))); }
  // Every available question has been seen in this session: from now on they come back.
  const repeat = !missedMode && pool.recycled ? h('p', { class: 'banner banner-warn practice-repeat', role: 'status' }, t('practice.allSeen')) : null;
  const tallyEl = h('span', { class: 'tally' }, t('practice.tally', { correct: tally.correct, total: tally.total }));
  const leftEl = missedMode ? h('span', { class: 'missed-left' }, t('practice.missedLeft', { n: num(missedIn(pool).length) })) : null;
  const end = () => go('practice-setup');
  return screen(`question practice${missedMode ? ' practice-missed-run' : ''}`,
    topBar(missedMode ? t('practice.missedTitle') : t('practice.title'), { back: end, right: h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: end }, t('practice.end')) }),
    questionView({
      question: q,
      mode: missedMode ? 'practice-missed' : 'practice',
      top: [repeat, h('div', { class: 'q-top' }, tallyEl, leftEl ? h('span', { class: 'grow' }) : null, leftEl)],
      continueLabel: t('common.next'),
      onAnswer: ({ correct }) => {
        recordAnswer(q.c, correct);
        // A question answered right in practice leaves "My mistakes"; a wrong one joins it.
        if (correct) clearMissed(q.id); else noteMissed(q.id);
        tally.total++;
        if (correct) tally.correct++;
        tallyEl.textContent = t('practice.tally', { correct: tally.correct, total: tally.total });
        if (leftEl) leftEl.textContent = t('practice.missedLeft', { n: num(missedIn(pool).length) });
        return missedMode && correct ? h('p', { class: 'outcome missed-cleared' }, t('practice.missedCleared')) : null;
      },
      onContinue: () => {
        if (missedMode && !missedIn(pool).length) {
          // Every mistake reviewed: back to the setup, which now offers the worlds.
          toast(t('practice.missedDone'));
          unlockAchievement('missedClear');
          sel.cat = 'all';
          go('practice-setup');
          return;
        }
        go('practice');
      },
    }));
}
