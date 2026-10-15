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

/**
 * @param {object} opts
 * @param {object} opts.question  {id, c, d, q, o, x}
 * @param {number[]} [opts.order] display order of option indexes (0 = correct)
 * @param {boolean} [opts.timer]
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
 *        mutated in place so the screen can persist them (classic games survive a reload)
 * @param {(kind:string) => void} opts.lifelines.onUse  called after a lifeline is applied ('breath': swap the question)
 * @param {() => void} [opts.lifelines.onChange]  called when fx changes without a new use (Stormlight retry)
 */
export function questionView({ question: q, order = shuffledOrder(), timer = false, final = false, top = null, onAnswer, onContinue, continueLabel = t('common.continue'), lifelines = null }) {
  let answered = false;
  let remaining = TIMER_SECONDS;
  let interval = null;
  const startedAt = performance.now();

  const live = h('div', { class: 'feedback', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const optionButtons = order.map((idx, pos) => h('button', {
    type: 'button',
    class: 'option',
    dataset: { idx: String(idx) },
    onclick: () => answer(idx),
  }, h('span', { class: 'option-letter', 'aria-hidden': 'true' }, LETTERS[pos]),
  h('span', { class: 'option-text' }, q.o[idx]),
  h('span', { class: 'option-mark', 'aria-hidden': 'true' })));

  // Countdown ring
  let timerEl = null;
  let ring = null;
  let timerNum = null;
  if (timer) {
    const C = 2 * Math.PI * 20;
    timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': t('question.secondsLeft', { s: TIMER_SECONDS }) });
    timerEl.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="timer-track"/><circle cx="24" cy="24" r="20" class="timer-ring" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
    timerNum = h('span', { class: 'timer-num', 'aria-hidden': 'true' }, String(TIMER_SECONDS));
    timerEl.appendChild(timerNum);
    ring = timerEl.querySelector('.timer-ring');
    interval = setInterval(() => {
      remaining = Math.max(0, TIMER_SECONDS - (performance.now() - startedAt) / 1000);
      const secs = Math.ceil(remaining);
      timerNum.textContent = String(secs);
      ring.style.strokeDashoffset = String(C * (1 - remaining / TIMER_SECONDS));
      timerEl.classList.toggle('low', remaining <= 10);
      if (secs % 5 === 0) timerEl.setAttribute('aria-label', t('question.secondsLeft', { s: secs }));
      if (remaining <= 0) answer(-1);
    }, 200);
    onCleanup(() => clearInterval(interval));
  }

  const continueBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block continue', hidden: true, onclick: () => { fx.tap(); onContinue(); } }, continueLabel);

  function answer(idx) {
    if (answered) return;
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
    if (timer) remaining = Math.max(0, TIMER_SECONDS - (performance.now() - startedAt) / 1000);
    const correct = idx === 0;
    const timedOut = idx === -1;
    card.classList.add('answered', correct ? 'is-right' : 'is-wrong-answer');
    for (const b of optionButtons) {
      const i = Number(b.dataset.idx);
      b.disabled = true;
      b.setAttribute('aria-disabled', 'true');
      const mark = b.querySelector('.option-mark');
      if (i === 0) { b.classList.add('correct'); mark.innerHTML = ICONS.check; }
      else if (effects?.struck.includes(i)) b.classList.add('dim');
      else if (i === idx) { b.classList.add('wrong'); mark.innerHTML = ICONS.x; }
      else b.classList.add('dim');
    }
    if (correct) fx.correct(); else fx.wrong();

    const extra = onAnswer({ correct, timedOut, remaining, ms: performance.now() - startedAt });
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
  const effects = lifelines ? (lifelines.fx ||= { removed: [], struck: [], armed: false }) : null;
  const btnFor = (i) => optionButtons.find((b) => Number(b.dataset.idx) === i);
  const wrongLeft = () => [1, 2, 3].filter((i) => !effects.removed.includes(i) && !effects.struck.includes(i));

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
    bar.update({
      atium: { left: left('atium'), enabled: anyWrong },
      stormlight: { left: left('stormlight'), enabled: anyWrong, armed: effects.armed },
      breath: { left: left('breath'), enabled: !!lifelines.breathOk },
    });
  }
  function useLifeline(kind) {
    if (answered || !((lifelines.left?.[kind] || 0) > 0)) return;
    if (kind === 'atium') {
      const gone = shuffle(wrongLeft()).slice(0, 2);
      if (!gone.length) return;
      effects.removed.push(...gone);
      gone.forEach(markRemoved);
      bar.say(t('lifeline.atium.done'));
    } else if (kind === 'stormlight') {
      if (effects.armed || !wrongLeft().length) return;
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

  return h('div', { class: 'question-wrap' }, top, card);
}
