// Quick game: 15 mixed questions against the clock. Score = 100 per correct answer
// + up to 100 speed bonus (proportional to the time left). Best score is stored.
// The run is saved after every step (key `quick`), so a reload offers "Continue quick game".
// The finished summary is kept (key `quickResult`) until the player leaves the results screen,
// so reloading there shows the results again.
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, num } from '../i18n.js';
import { app, go, screen, topBar, makePool, recordAnswer, recordLifeline, updateStats, getStats, setBack, confirmDialog, levelPicker, levelBadge, noQuestionsBanner, filterIsEmpty, noteMissed, unlockAchievement } from '../core.js';
import * as store from '../storage.js';
import { CATEGORIES, LEVEL_IDS, QUICK_LENGTH, TIMER_SECONDS, fullLifelines, levelOrDefault } from '../config.js';
import { quickPlan, shuffledOrder } from '../data.js';
import { isObj, isInt, isPermutation, isValidFx, isValidClock, isValidLifelines, migrateClock } from '../game.js';
import { fx, confetti } from '../fx.js';
import { questionView, emptyFx, newClock } from '../components/question.js';
import { lifelinesLeft } from '../components/board.js';
import { reviewSection } from '../components/review.js';

const SAVE_KEY = 'quick';
const RESULT_KEY = 'quickResult';
const RUN_VERSION = 1;
let run = null;

export function pointsFor(correct, remaining) {
  return correct ? 100 + Math.round((100 * remaining) / TIMER_SECONDS) : 0;
}

function newRun(level) {
  const pool = makePool();
  if (!pool.categories().length) return null;
  const lvl = levelOrDefault(level);
  // Slots per world in proportion to the questions it can offer (no world with a single question
  // filling the game), at most as many questions as the filter leaves (no repeats in a run).
  const plan = quickPlan(pool, lvl, QUICK_LENGTH);
  if (!plan.length) return null;
  return {
    v: RUN_VERSION, pool, plan, index: 0, score: 0, correct: 0, total: plan.length, level: lvl,
    lifelines: fullLifelines(),
    seen: [], // ids asked in this run: never repeated while unseen questions remain
    current: null, // the question on screen { id, order, fx, clock } so a re-render (or Breath) keeps control of it
    missed: [], // ids answered wrong (or timed out), for "Review mistakes" on the results screen
  };
}

/** Ids of the missed questions: unique strings, at most `max`. */
const isMissedList = (m, max) => Array.isArray(m) && m.length <= max && m.every((id) => typeof id === 'string' && id) && new Set(m).size === m.length;

/** Best quick-game score for a level (records are kept per level since 1.5.0). */
export const bestFor = (stats, level) => stats.bestByLevel?.[levelOrDefault(level)] || 0;

/** Each right answer scores 100 plus a speed bonus of up to 100; wrong answers score 0. */
const isValidScore = (score, correct) => isInt(score, correct * 100, correct * 200);

function isValidRun(r) {
  try {
    if (!isObj(r) || r.v !== RUN_VERSION || r.finished) return false;
    if (!isInt(r.total, 1, QUICK_LENGTH) || !Array.isArray(r.plan) || r.plan.length !== r.total
      || !r.plan.every((c) => CATEGORIES.includes(c))) return false;
    if (!isInt(r.index, 0, r.total - 1) || !isInt(r.correct, 0, r.index) || !isValidScore(r.score, r.correct)) return false;
    if (!LEVEL_IDS.includes(r.level) || !isValidLifelines(r.lifelines)) return false;
    // One id per question asked (the current one included) plus at most one Breath swap.
    if (!Array.isArray(r.seen) || r.seen.length > r.index + 2 || !r.seen.every((id) => typeof id === 'string')
      || new Set(r.seen).size !== r.seen.length) return false;
    // Every answered question is either right or missed (saves from before 1.5.0 have no list).
    if (!isMissedList(r.missed, r.index - r.correct) || !r.missed.every((id) => r.seen.includes(id))) return false;
    const c = r.current;
    if (c !== null && (!isObj(c) || typeof c.id !== 'string' || !isPermutation(c.order, 4) || !isValidFx(c.fx) || !isValidClock(c.clock))) return false;
    return true;
  } catch {
    return false;
  }
}

/** The saved, unfinished quick game (validated), or null. Unusable saves are deleted. */
export function loadSavedRun() {
  if (run && !run.finished) return run;
  const raw = store.load(SAVE_KEY, null);
  if (raw === null) { if (store.hasRaw(SAVE_KEY)) store.remove(SAVE_KEY); return null; }
  if (isObj(raw?.current) && 'clock' in raw.current) raw.current.clock = migrateClock(raw.current.clock);
  if (isObj(raw) && !('missed' in raw)) raw.missed = []; // runs saved before 1.5.0
  if (!isValidRun(raw)) { store.remove(SAVE_KEY); return null; }
  return raw;
}

/** The summary of a finished quick game whose results screen wasn't dismissed yet, or null. */
export function loadSavedResult() {
  const r = store.load(RESULT_KEY, null);
  const stats = getStats();
  if (isObj(r) && !('missed' in r)) r.missed = []; // summaries saved before 1.5.0
  // The summary must agree with the stats it was recorded into: a record is the level's best score
  // (or, for a summary saved before 1.5.0, the overall one).
  const best = isObj(r) ? Math.max(bestFor(stats, r.level), stats.bestQuick) : 0;
  const ok = isObj(r) && isInt(r.total, 1, QUICK_LENGTH) && isInt(r.correct, 0, r.total) && isValidScore(r.score, r.correct)
    && LEVEL_IDS.includes(r.level) && typeof r.record === 'boolean' && isMissedList(r.missed, r.total - r.correct)
    && (r.record ? r.score > 0 && (bestFor(stats, r.level) === r.score || stats.bestQuick === r.score) : best >= r.score);
  if (!ok) { if (store.hasRaw(RESULT_KEY)) store.remove(RESULT_KEY); return null; }
  return { score: r.score, correct: r.correct, total: r.total, level: r.level, record: r.record, missed: r.missed };
}

/** The results screen was left: the summary is not shown again. */
export function dismissResult() { store.remove(RESULT_KEY); }

function saveRun() {
  if (!run || run.finished) { store.remove(SAVE_KEY); return; }
  const { pool, ...data } = run;
  store.save(SAVE_KEY, data);
}

/** Drops the quick game in progress (abandoned, or replaced by a new one). */
export function discardRun() {
  run = null;
  store.remove(SAVE_KEY);
  store.remove(RESULT_KEY);
}

/** Next question: the planned world first; if it has nothing unseen left, any world that does. */
function drawNext() {
  const seen = new Set(run.seen);
  const { pool } = run;
  let q = pool.drawUnseen(run.plan[run.index], run.level, seen);
  if (!q) {
    const open = pool.categories().map((c) => [c, pool.byCat[c].filter((x) => !seen.has(x.id)).length]).filter(([, n]) => n > 0);
    let x = Math.random() * open.reduce((s, [, n]) => s + n, 0);
    const cat = open.find(([, n]) => (x -= n) < 0)?.[0] || open[open.length - 1]?.[0];
    q = cat ? pool.drawUnseen(cat, run.level, seen) : pool.drawAnyLeveled(run.level); // last resort: the filter shrank mid-run
  }
  return q;
}

/** Start screen: rules, level choice (remembered) and best score. */
function introView() {
  let level = levelOrDefault(app.settings.level);
  const stats = getStats();
  const empty = filterIsEmpty();
  const bestEl = h('p', { class: 'muted quick-best', 'aria-live': 'polite' });
  const showBest = () => {
    const best = bestFor(stats, level);
    bestEl.textContent = best ? t('quick.bestLevel', { level: t(`level.${level}`), n: num(best) }) : t('quick.noBestLevel', { level: t(`level.${level}`) });
  };
  showBest();
  // A record from before 1.5.0 (one best for every level) that no level record has beaten yet.
  const legacy = stats.bestQuick > Math.max(0, ...LEVEL_IDS.map((l) => bestFor(stats, l)))
    ? h('p', { class: 'muted quick-best-legacy' }, t('quick.bestLegacy', { n: num(stats.bestQuick) })) : null;
  return screen('quick-intro',
    topBar(t('quick.title')),
    empty ? noQuestionsBanner() : null,
    h('section', { class: 'card quick-intro-card' },
      svg(ICONS.bolt, 'quick-intro-icon'),
      // "from every world" only while the spoiler filter leaves all six (beta 4, m2).
      h('p', { class: 'lead' }, t(empty || makePool({}).categories().length >= CATEGORIES.length ? 'quick.intro' : 'quick.introFiltered', { n: QUICK_LENGTH, s: TIMER_SECONDS })),
      lifelinesLeft({ lifelines: fullLifelines() }, 28),
      h('p', { class: 'muted' }, t('quick.introLifelines')),
      bestEl,
      legacy),
    levelPicker(level, (l) => { level = l; showBest(); }),
    h('div', { class: 'sticky-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', disabled: empty,
        onclick: () => { fx.tap(); go('quick', { start: level }); },
      }, svg(ICONS.play), t('quick.start'))));
}

export function quickScreen(params = {}) {
  if (params.start || params.restart) dismissResult();
  if (params.start) { run = newRun(params.start); saveRun(); }
  else if (params.restart && run) { run = newRun(run.level); saveRun(); }
  else if (params.results && !run) {
    // Reloaded on the results screen: show the saved summary once more.
    const r = loadSavedResult();
    if (!r) return introView();
    run = { ...r, index: r.total, finished: true, restored: true };
  }
  else if (params.resume && !run) {
    const saved = loadSavedRun();
    run = saved ? { ...saved, pool: makePool() } : null;
    if (!run) return introView();
  } else if (!run || (run.finished && !params.results)) { run = null; return introView(); }
  if (!run) return introView();
  if (run.index >= run.total) return resultView();

  let view = null;
  const quit = async () => {
    view?.pauseTimer(); // no time passes while the player decides
    const ok = await confirmDialog(t('quick.quitBody'), { title: t('quick.quitTitle'), okLabel: t('quick.quitYes'), cancelLabel: t('quick.quitNo'), danger: true });
    if (ok) { discardRun(); go('home'); } else view?.resumeTimer();
  };
  setBack(quit);
  // The question on screen stays even if the spoiler filter now hides it (no free re-draw).
  let q = run.current && run.pool.getAny(run.current.id);
  if (!q) {
    q = drawNext();
    // The filter changed and leaves nothing: keep the run (it can go on once books are marked again).
    if (!q) {
      const saved = run;
      run = null;
      setBack(() => go('home'));
      return screen('quick-empty', topBar(t('quick.title')),
        noQuestionsBanner(),
        h('p', { class: 'muted center' }, t('quick.emptySaved', { n: saved.index + 1, total: saved.total })),
        h('div', { class: 'stack-actions' }, h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', onclick: () => go('home') }, t('common.home'))));
    }
    if (!run.seen.includes(q.id)) run.seen.push(q.id);
    run.current = { id: q.id, order: shuffledOrder(), fx: emptyFx(), clock: newClock() };
  }
  const cur = run.current;
  cur.fx ||= emptyFx();
  cur.clock ||= newClock();
  const scoreEl = h('span', { class: 'score-value' }, num(run.score));
  const top = h('div', { class: 'q-top quick-top' },
    h('span', { class: 'progress-label' }, t('question.progress', { n: run.index + 1, total: run.total })),
    h('span', { class: 'grow' }),
    h('span', { class: 'score' }, t('quick.score'), ' ', scoreEl));
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(run.total), 'aria-valuenow': String(run.index), 'aria-label': t('quick.title') },
    h('span', { style: { width: `${(run.index / run.total) * 100}%` } }));

  const seen = new Set(run.seen);
  const lifelines = {
    left: run.lifelines,
    breathOk: run.pool.hasAlternative(q, seen),
    fx: cur.fx,
    onUse: (kind) => {
      run.lifelines[kind] = Math.max(0, run.lifelines[kind] - 1);
      recordLifeline(kind);
      if (kind === 'breath') {
        const alt = run.pool.drawAlternative(q, seen);
        if (alt) {
          run.seen.push(alt.id);
          // An armed Stormlight carries over to the new question.
          run.current = { id: alt.id, order: shuffledOrder(), fx: emptyFx(!!cur.fx.armed), clock: newClock() };
        }
        saveRun();
        go('quick');
        return;
      }
      saveRun();
    },
    onChange: saveRun,
  };

  view = questionView({
    question: q, order: cur.order, timer: true, clock: cur.clock, onClockChange: saveRun, top, lifelines, mode: 'quick',
    continueLabel: run.index + 1 >= run.total ? t('quick.seeResults') : t('common.next'),
    onAnswer: ({ correct, remaining }) => {
      recordAnswer(q.c, correct);
      if (correct && cur.fx?.struck?.length) unlockAchievement('stormlightSave');
      if (!correct) { noteMissed(q.id); (run.missed ||= []).push(q.id); }
      const pts = pointsFor(correct, remaining);
      run.score += pts;
      if (correct) run.correct++;
      run.index++;
      run.current = null;
      if (run.index >= run.total) finish(); else saveRun();
      scoreEl.textContent = num(run.score);
      return correct ? h('p', { class: 'points' }, t('quick.points', { n: num(pts) })) : null;
    },
    onContinue: () => go('quick', run?.finished ? { results: true } : {}),
  });
  saveRun();
  return screen('question quick',
    topBar(t('quick.title'), { back: quit, right: levelBadge(run.level) }),
    bar,
    view);
}

/** Records the result once, removes the saved run and keeps the summary for the results screen. */
function finish() {
  if (run.finished) return;
  run.finished = true;
  const prevBest = bestFor(getStats(), run.level);
  run.record = run.score > prevBest && run.score > 0;
  run.missed ||= [];
  if (run.total === QUICK_LENGTH && run.correct === run.total) unlockAchievement('quickPerfect');
  updateStats((s) => {
    s.quickGames++;
    s.bestByLevel[run.level] = Math.max(bestFor(s, run.level), run.score);
    s.bestQuick = Math.max(s.bestQuick || 0, run.score);
  });
  store.remove(SAVE_KEY);
  store.save(RESULT_KEY, { score: run.score, correct: run.correct, total: run.total, level: run.level, record: run.record, missed: run.missed });
}

function resultView() {
  finish();
  const leave = (fn) => () => { dismissResult(); fn(); };
  setBack(leave(() => go('home')));
  const best = bestFor(getStats(), run.level);
  const el = screen('quick-result',
    topBar(t('quick.finished'), { back: leave(() => go('home')) }),
    h('div', { class: 'result-body' },
      svg(ICONS.bolt, 'result-icon'),
      h('p', { class: 'result-score', 'aria-live': 'polite' }, t('quick.result', { score: num(run.score) })),
      run.record ? h('p', { class: 'record-badge' }, svg(ICONS.trophy), t('quick.newRecord')) : null,
      h('p', { class: 'lead' }, t('quick.correctCount', { n: run.correct, total: run.total })),
      h('p', { class: 'muted quick-best' }, t('quick.bestLevel', { level: t(`level.${run.level}`), n: num(best) }))),
    reviewSection(run.missed || []),
    h('div', { class: 'stack-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', onclick: leave(() => go('quick', { restart: true })) }, svg(ICONS.refresh), t('common.playAgain')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: leave(() => go('home')) }, t('common.home'))));
  if (run.record && !run.restored) requestAnimationFrame(() => { confetti(el, 60); fx.victory(); });
  return el;
}
