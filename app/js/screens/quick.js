// Quick game: 15 mixed questions against the clock. Score = 100 per correct answer
// + up to 100 speed bonus (proportional to the time left). Best score is stored.
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, num } from '../i18n.js';
import { go, screen, topBar, makePool, recordAnswer, updateStats, getStats, toast, setBack, confirmDialog } from '../core.js';
import { QUICK_LENGTH, TIMER_SECONDS } from '../config.js';
import { shuffle } from '../data.js';
import { fx, confetti } from '../fx.js';
import { questionView } from '../components/question.js';

let run = null;

export function pointsFor(correct, remaining) {
  return correct ? 100 + Math.round((100 * remaining) / TIMER_SECONDS) : 0;
}

function newRun() {
  const pool = makePool();
  const cats = pool.categories();
  if (!cats.length) return null;
  const total = Math.min(QUICK_LENGTH, pool.size());
  // Spread categories evenly: shuffled rounds of all available categories.
  const plan = [];
  while (plan.length < total) plan.push(...shuffle(cats));
  plan.length = total;
  return { pool, plan, index: 0, score: 0, correct: 0, total };
}

export function quickScreen(params = {}) {
  if (params.restart || !run || run.finished) run = newRun();
  if (!run) { setTimeout(() => go('home')); toast(t('errors.noQuestions')); return screen('', h('h1', {}, t('quick.title'))); }
  if (run.index >= run.total) return resultView();

  const quit = async () => {
    if (await confirmDialog(t('quick.quitConfirm'))) { run = null; go('home'); }
  };
  setBack(quit);
  const q = run.pool.draw(run.plan[run.index]) || run.pool.drawAny();
  const scoreEl = h('span', { class: 'score-value' }, num(run.score));
  const top = h('div', { class: 'q-top quick-top' },
    h('span', { class: 'progress-label' }, t('question.progress', { n: run.index + 1, total: run.total })),
    h('span', { class: 'grow' }),
    h('span', { class: 'score' }, t('quick.score'), ' ', scoreEl));
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(run.total), 'aria-valuenow': String(run.index), 'aria-label': t('quick.title') },
    h('span', { style: { width: `${(run.index / run.total) * 100}%` } }));

  return screen('question quick',
    topBar(t('quick.title'), { back: quit }),
    bar,
    questionView({
      question: q, timer: true, top,
      continueLabel: run.index + 1 >= run.total ? t('quick.seeResults') : t('common.next'),
      onAnswer: ({ correct, remaining }) => {
        recordAnswer(q.c, correct);
        const pts = pointsFor(correct, remaining);
        run.score += pts;
        if (correct) run.correct++;
        run.index++;
        scoreEl.textContent = num(run.score);
        return correct ? h('p', { class: 'points' }, t('quick.points', { n: num(pts) })) : null;
      },
      onContinue: () => go('quick'),
    }));
}

function resultView() {
  if (!run.finished) {
    run.finished = true;
    const prevBest = getStats().bestQuick || 0;
    run.record = run.score > prevBest && run.score > 0;
    updateStats((s) => { s.quickGames++; s.bestQuick = Math.max(s.bestQuick || 0, run.score); });
  }
  const best = getStats().bestQuick;
  const el = screen('quick-result',
    topBar(t('quick.finished')),
    h('div', { class: 'result-body' },
      svg(ICONS.bolt, 'result-icon'),
      h('p', { class: 'result-score', 'aria-live': 'polite' }, t('quick.result', { score: num(run.score) })),
      run.record ? h('p', { class: 'record-badge' }, svg(ICONS.trophy), t('quick.newRecord')) : null,
      h('p', { class: 'lead' }, t('quick.correctCount', { n: run.correct, total: run.total })),
      h('p', { class: 'muted' }, `${t('quick.best')}: ${num(best)}`)),
    h('div', { class: 'stack-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', onclick: () => go('quick', { restart: true }) }, svg(ICONS.refresh), t('common.playAgain')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => go('home') }, t('common.home'))));
  if (run.record) requestAnimationFrame(() => { confetti(el, 60); fx.victory(); });
  return el;
}
