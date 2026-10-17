// Question card: category, difficulty, optional countdown, 4 shuffled options,
// reveal + explanation + continue button. Used by every mode.
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t } from '../i18n.js';
import { catPill, catStyle, diffPips, onCleanup } from '../core.js';
import { fx, reducedMotion } from '../fx.js';
import { TIMER_SECONDS } from '../config.js';
import { shuffledOrder, shuffle } from '../data.js';
import { lifelineBar } from './lifelines.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TIMER_MS = TIMER_SECONDS * 1000;

/** Effects of the lifelines on one question (stored with the pending question). */
export const emptyFx = (armed = false) => ({ removed: [], struck: [], armed });

/**
 * @param {object} opts
 * @param {object} opts.question  {id, c, d, q, o, x}
 * @param {number[]} [opts.order] display order of option indexes (0 = correct)
 * @param {boolean} [opts.timer]
 * @param {{deadline:number|null}} [opts.clock] countdown state, mutated in place so the screen can
 *        persist it: `deadline` is the wall-clock time (Date.now()) when time runs out. A reload or
 *        a resume keeps the deadline, so the timer never restarts; if it already passed, the
 *        question resolves as a timeout as soon as it is shown.
 * @param {() => void} [opts.onClockChange] called when the deadline is set or moved (pause/resume)
 * @param {boolean} [opts.final]
 * @param {Node} [opts.top]       optional node rendered above the card (progress, score…)
 * @param {(res:{correct:boolean, timedOut:boolean, remaining:number}) => (string|Node|Array|null)} opts.onAnswer
 *        returns extra feedback content (e.g. "+1 charge") shown under the explanation.
 * @param {() => void} opts.onContinue
 * @param {string} [opts.continueLabel]
 * @param {object} [opts.lifelines] omit for no lifelines (practice, final question)
 * @param {Record<string, number>} opts.lifelines.left   uses left per lifeline (read live; the screen decrements it)
 * @param {boolean} opts.lifelines.breathOk  another question of the same category and difficulty exists
 * @param {{removed:number[], struck:number[], armed:boolean}} [opts.lifelines.fx] effects on this question,
 *        mutated in place so the screen can persist them (classic and quick games survive a reload)
 * @param {(kind:string) => void} opts.lifelines.onUse  called after a lifeline is applied ('breath': swap the
 *        question; an armed Stormlight (fx.armed) carries over to the new question)
 * @param {() => void} [opts.lifelines.onChange]  called when fx changes without a new use (Stormlight retry)
 * @returns {HTMLElement & {pauseTimer: () => void, resumeTimer: () => void}}
 */
export function questionView({
  question: q, order = shuffledOrder(), timer = false, clock = null, onClockChange = null, final = false, top = null,
  onAnswer, onContinue, continueLabel = t('common.continue'), lifelines = null,
}) {
  let answered = false;
  let remaining = TIMER_SECONDS;
  let interval = null;
  let pausedAt = null;
  const shownAt = Date.now();

  const live = h('div', { class: 'feedback', 'aria-live': 'polite', 'aria-atomic': 'true' });
  // The option's data index (0 = correct) lives only in this closure, never in the DOM.
  const idxOf = new Map();
  const optionButtons = order.map((idx, pos) => {
    const b = h('button', {
      type: 'button',
      class: 'option',
      onclick: () => answer(idx),
    }, h('span', { class: 'option-letter', 'aria-hidden': 'true' }, LETTERS[pos]),
    h('span', { class: 'option-text' }, q.o[idx]),
    h('span', { class: 'option-mark', 'aria-hidden': 'true' }));
    idxOf.set(b, idx);
    return b;
  });
  const btnFor = (i) => optionButtons.find((b) => idxOf.get(b) === i);

  // Countdown ring
  let timerEl = null;
  let ring = null;
  let timerNum = null;
  const C = 2 * Math.PI * 20;
  const clk = timer ? (clock || { deadline: null }) : null;
  const timeLeft = () => Math.max(0, Math.min(TIMER_MS, clk.deadline - Date.now())) / 1000;
  function paint() {
    remaining = timeLeft();
    const secs = Math.ceil(remaining);
    timerNum.textContent = String(secs);
    ring.style.strokeDashoffset = String(C * (1 - remaining / TIMER_SECONDS));
    timerEl.classList.toggle('low', remaining <= 10);
    if (secs % 5 === 0) timerEl.setAttribute('aria-label', t('question.secondsLeft', { s: secs }));
  }
  function tick() {
    paint();
    if (remaining <= 0) answer(-1);
  }
  const startTicking = () => { clearInterval(interval); interval = setInterval(tick, 200); };
  if (timer) {
    if (!Number.isFinite(clk.deadline)) { clk.deadline = Date.now() + TIMER_MS; onClockChange?.(); }
    timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': t('question.secondsLeft', { s: TIMER_SECONDS }) });
    timerEl.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="timer-track"/><circle cx="24" cy="24" r="20" class="timer-ring" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
    timerNum = h('span', { class: 'timer-num', 'aria-hidden': 'true' }, String(TIMER_SECONDS));
    timerEl.appendChild(timerNum);
    ring = timerEl.querySelector('.timer-ring');
    paint();
    startTicking();
    onCleanup(() => clearInterval(interval));
  }

  const continueBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block continue', hidden: true, onclick: () => { fx.tap(); onContinue(); } }, continueLabel);

  function answer(idx) {
    if (answered || pausedAt !== null) return;
    if (idx > 0 && effects?.armed) { // Stormlight: strike the wrong option and choose again
      effects.armed = false;
      effects.struck.push(idx);
      markStruck(idx, true);
      card.classList.remove('stormlight-armed');
      fx.saved();
      bar.say(t('lifeline.stormlight.saved'));
      refreshBar();
      lifelines.onChange?.();
      optionButtons.find((b) => !b.disabled)?.focus({ preventScroll: true });
      return;
    }
    answered = true;
    if (bar) bar.el.hidden = true;
    clearInterval(interval);
    if (timer) remaining = timeLeft();
    const correct = idx === 0;
    const timedOut = idx === -1;
    card.classList.add('answered', correct ? 'is-right' : 'is-wrong-answer');
    for (const b of optionButtons) {
      const i = idxOf.get(b);
      b.disabled = true;
      b.setAttribute('aria-disabled', 'true');
      const mark = b.querySelector('.option-mark');
      if (i === 0) { b.classList.add('correct'); mark.innerHTML = ICONS.check; }
      else if (effects?.struck.includes(i)) b.classList.add('dim');
      else if (i === idx) { b.classList.add('wrong'); mark.innerHTML = ICONS.x; }
      else b.classList.add('dim');
    }
    if (correct) fx.correct(); else fx.wrong();

    const extra = onAnswer({ correct, timedOut, remaining, ms: Date.now() - shownAt });
    const verdict = correct ? t('question.correct') : (timedOut ? t('question.timeout') : t('question.incorrect'));
    // replaceChildren() would render null as the text "null", so drop the empty slots first.
    live.replaceChildren(...[
      h('p', { class: `verdict ${correct ? 'ok' : 'bad'}` }, svg(correct ? ICONS.check : ICONS.x), h('span', {}, verdict)),
      correct ? null : h('p', { class: 'answer-was' }, t('question.answerWas', { answer: q.o[0] })),
      q.x ? h('p', { class: 'explain' }, q.x) : null,
      extra ? h('div', { class: 'feedback-extra' }, extra) : null,
    ].filter(Boolean));
    continueBtn.hidden = false;
    continueBtn.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      try { continueBtn.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { /* old browsers */ }
    });
  }

  // ---------- lifelines ----------
  const effects = lifelines ? (lifelines.fx ||= emptyFx()) : null;
  const wrongLeft = () => [1, 2, 3].filter((i) => !effects.removed.includes(i) && !effects.struck.includes(i));
  // SPEC: Atium and Stormlight can't be combined on the same question.
  const atiumUsedHere = () => effects.removed.length > 0;
  const stormlightUsedHere = () => effects.armed || effects.struck.length > 0;

  function markRemoved(i) {
    const b = btnFor(i);
    b.disabled = true;
    b.classList.add('eliminated');
    b.setAttribute('aria-label', t('lifeline.atium.removed', { option: q.o[i] }));
  }
  function markStruck(i, animate = false) {
    const b = btnFor(i);
    b.disabled = true;
    b.classList.add('wrong', 'struck');
    if (animate) b.classList.add('shake');
    b.querySelector('.option-mark').innerHTML = ICONS.x;
    b.setAttribute('aria-label', t('lifeline.stormlight.struck', { option: q.o[i] }));
  }

  let bar = null;
  function refreshBar() {
    const left = (k) => (lifelines.left?.[k] || 0) > 0;
    const anyWrong = wrongLeft().length > 0;
    const combo = t('lifeline.noCombo');
    bar.update({
      atium: { left: left('atium'), enabled: anyWrong && !stormlightUsedHere(), reason: stormlightUsedHere() ? combo : null },
      stormlight: { left: left('stormlight'), enabled: anyWrong && !atiumUsedHere(), armed: effects.armed, reason: atiumUsedHere() ? combo : null },
      breath: { left: left('breath'), enabled: !!lifelines.breathOk, reason: lifelines.breathOk ? null : t('lifeline.breath.none') },
    });
  }
  function useLifeline(kind) {
    if (answered || pausedAt !== null || !((lifelines.left?.[kind] || 0) > 0)) return;
    if (kind === 'atium') {
      if (stormlightUsedHere()) return;
      const gone = shuffle(wrongLeft()).slice(0, 2);
      if (!gone.length) return;
      effects.removed.push(...gone);
      gone.forEach(markRemoved);
      bar.say(t('lifeline.atium.done'));
    } else if (kind === 'stormlight') {
      if (effects.armed || atiumUsedHere() || !wrongLeft().length) return;
      effects.armed = true;
      card.classList.add('stormlight-armed');
      bar.say(t('lifeline.stormlight.armed'));
    } else if (kind === 'breath') {
      if (!lifelines.breathOk) return;
    } else return;
    fx.lifeline();
    lifelines.onUse(kind); // the screen spends it (and swaps the question for Breath)
    if (kind !== 'breath') refreshBar();
  }
  if (lifelines) bar = lifelineBar(useLifeline);

  const card = h('section', { class: `qcard ${final ? 'final' : ''}`, ...catStyle(q.c), 'aria-labelledby': `q-${q.id}` },
    h('div', { class: 'qcard-head' },
      catPill(q.c),
      diffPips(q.d),
      final ? h('span', { class: 'final-badge' }, svg(ICONS.trophy), t('question.final')) : null,
      h('span', { class: 'grow' }),
      timerEl),
    h('h2', { class: 'qtext', id: `q-${q.id}`, tabindex: '-1', 'data-autofocus': '' }, q.q),
    h('div', { class: 'options', role: 'group', 'aria-labelledby': `q-${q.id}` }, optionButtons),
    bar ? bar.el : null,
    live,
    continueBtn,
  );

  if (effects) { // restore effects after a reload
    effects.removed.forEach(markRemoved);
    effects.struck.forEach((i) => markStruck(i));
    if (effects.armed) { card.classList.add('stormlight-armed'); bar.say(t('lifeline.stormlight.armed')); }
    refreshBar();
  }

  const wrap = h('div', { class: 'question-wrap' }, top, card);
  /** Stops the countdown (e.g. while a "quit?" dialog is open); resumeTimer gives the time back. */
  wrap.pauseTimer = () => {
    if (!timer || answered || pausedAt !== null) return;
    pausedAt = Date.now();
    clearInterval(interval);
    card.classList.add('paused');
  };
  wrap.resumeTimer = () => {
    if (pausedAt === null) return;
    clk.deadline += Date.now() - pausedAt;
    pausedAt = null;
    card.classList.remove('paused');
    onClockChange?.();
    if (!answered) { paint(); startTicking(); }
  };
  // Time already ran out (reload or resume after the deadline): resolve as a timeout once shown.
  if (timer && timeLeft() <= 0) queueMicrotask(() => answer(-1));
  return wrap;
}
