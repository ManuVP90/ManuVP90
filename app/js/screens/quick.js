// Quick game: 15 mixed questions against the clock. Score = 100 per correct answer
// + up to 100 speed bonus (proportional to the time left). Best score is stored.
// The run is saved after every step (key `quick`), so a reload offers "Continue quick game".
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, num } from '../i18n.js';
import { app, go, screen, topBar, makePool, recordAnswer, recordLifeline, updateStats, getStats, toast, setBack, confirmDialog, levelPicker, levelBadge } from '../core.js';
import * as store from '../storage.js';
import { CATEGORIES, LEVEL_IDS, QUICK_LENGTH, TIMER_SECONDS, fullLifelines, levelOrDefault } from '../config.js';
import { quickPlan, shuffledOrder } from '../data.js';
import { isObj, isInt, isPermutation, isValidFx, isValidClock, isValidLifelines } from '../game.js';
import { fx, confetti } from '../fx.js';
import { questionView, emptyFx } from '../components/question.js';
import { lifelinesLeft } from '../components/board.js';

const SAVE_KEY = 'quick';
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
  };
}

function isValidRun(r) {
  try {
    if (!isObj(r) || r.v !== RUN_VERSION || r.finished) return false;
    if (!isInt(r.total, 1, QUICK_LENGTH) || !Array.isArray(r.plan) || r.plan.length !== r.total
      || !r.plan.every((c) => CATEGORIES.includes(c))) return false;
    if (!isInt(r.index, 0, r.total - 1) || !isInt(r.correct, 0, r.index) || !isInt(r.score, 0, r.index * 200)) return false;
    if (!LEVEL_IDS.includes(r.level) || !isValidLifelines(r.lifelines)) return false;
    if (!Array.isArray(r.seen) || !r.seen.every((id) => typeof id === 'string')) return false;
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
  if (!isValidRun(raw)) { store.remove(SAVE_KEY); return null; }
  return raw;
}

function saveRun() {
  if (!run || run.finished) { store.remove(SAVE_KEY); return; }
  const { pool, ...data } = run;
  store.save(SAVE_KEY, data);
}

/** Drops the quick game in progress (abandoned, or replaced by a new one). */
export function discardRun() {
  run = null;
  store.remove(SAVE_KEY);
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
  const best = getStats().bestQuick || 0;
  return screen('quick-intro',
    topBar(t('quick.title')),
    h('section', { class: 'card quick-intro-card' },
      svg(ICONS.bolt, 'quick-intro-icon'),
      h('p', { class: 'lead' }, t('quick.intro', { n: QUICK_LENGTH, s: TIMER_SECONDS })),
      lifelinesLeft({ lifelines: fullLifelines() }, 28),
      h('p', { class: 'muted' }, t('quick.introLifelines')),
      best ? h('p', { class: 'muted quick-best' }, t('quick.bestScore', { n: num(best) })) : null),
    levelPicker(level, (l) => { level = l; }),
    h('div', { class: 'sticky-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '',
        onclick: () => { fx.tap(); go('quick', { start: level }); },
      }, svg(ICONS.play), t('quick.start'))));
}

export function quickScreen(params = {}) {
  if (params.start) { run = newRun(params.start); saveRun(); }
  else if (params.restart && run) { run = newRun(run.level); saveRun(); }
  else if (params.resume && !run) {
    const saved = loadSavedRun();
    run = saved ? { ...saved, pool: makePool() } : null;
    if (!run) return introView();
  } else if (!run || (run.finished && !params.results)) { run = null; return introView(); }
  if (!run) { setTimeout(() => go('home')); toast(t('errors.noQuestions')); return screen('', h('h1', {}, t('quick.title'))); }
  if (run.index >= run.total) return resultView();

  let view = null;
  const quit = async () => {
    view?.pauseTimer(); // no time passes while the player decides
    if (await confirmDialog(t('quick.quitConfirm'))) { discardRun(); go('home'); } else view?.resumeTimer();
  };
  setBack(quit);
  let q = run.current && run.pool.get(run.current.id);
  if (!q) {
    q = drawNext();
    if (!q) { discardRun(); setTimeout(() => go('home')); toast(t('errors.noQuestions')); return screen('', h('h1', {}, t('quick.title'))); }
    if (!run.seen.includes(q.id)) run.seen.push(q.id);
    run.current = { id: q.id, order: shuffledOrder(), fx: emptyFx(), clock: { deadline: null } };
  }
  const cur = run.current;
  cur.fx ||= emptyFx();
  cur.clock ||= { deadline: null };
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
          run.current = { id: alt.id, order: shuffledOrder(), fx: emptyFx(!!cur.fx.armed), clock: { deadline: null } };
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
    question: q, order: cur.order, timer: true, clock: cur.clock, onClockChange: saveRun, top, lifelines,
    continueLabel: run.index + 1 >= run.total ? t('quick.seeResults') : t('common.next'),
    onAnswer: ({ correct, remaining }) => {
      recordAnswer(q.c, correct);
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

/** Records the result once and removes the saved run. */
function finish() {
  if (run.finished) return;
  run.finished = true;
  const prevBest = getStats().bestQuick || 0;
  run.record = run.score > prevBest && run.score > 0;
  updateStats((s) => { s.quickGames++; s.bestQuick = Math.max(s.bestQuick || 0, run.score); });
  store.remove(SAVE_KEY);
}

function resultView() {
  finish();
  const best = getStats().bestQuick;
  const el = screen('quick-result',
    topBar(t('quick.finished')),
    h('div', { class: 'result-body' },
      svg(ICONS.bolt, 'result-icon'),
      h('p', { class: 'result-score', 'aria-live': 'polite' }, t('quick.result', { score: num(run.score) })),
      run.record ? h('p', { class: 'record-badge' }, svg(ICONS.trophy), t('quick.newRecord')) : null,
      h('p', { class: 'lead' }, t('quick.correctCount', { n: run.correct, total: run.total })),
      h('p', { class: 'muted quick-best' }, t('quick.bestScore', { n: num(best) }))),
    h('div', { class: 'stack-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', onclick: () => go('quick', { restart: true }) }, svg(ICONS.refresh), t('common.playAgain')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => go('home') }, t('common.home'))));
  if (run.record) requestAnimationFrame(() => { confetti(el, 60); fx.victory(); });
  return el;
}
