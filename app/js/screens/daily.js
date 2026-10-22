// Daily challenge ("Reto diario"): 5 questions that are the same for everyone on the same date and
// language (seeded draw in daily.js), mixed difficulty 1–3, 30-second timer, one attempt per day,
// a streak of consecutive days and a spoiler-free result to share (gem-colored squares).
// The run is saved after every step under `daily.run`, so leaving or reloading resumes it (the
// question's time keeps running in real time, like the other timed games). Works offline.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { app, go, screen, topBar, setBack, confirmDialog, toast, recordAnswer, noteMissed, noteSeen, getDaily, saveDaily, noQuestionsBanner, filterIsEmpty, catStyle, makePool, actionButton } from '../core.js';
import { TIMER_SECONDS } from '../config.js';
import { dateKey, addDays, dailyPick, recordDaily, currentStreak, canPlayDaily, shareText, DAILY_LENGTH } from '../daily.js';
import { questionView, emptyFx, newClock } from '../components/question.js';
import { reviewSection, copyText } from '../components/review.js';
import { fx, confetti } from '../fx.js';

let liveQuestion = null;
let cheered = null;

const today = () => dateKey(new Date());
const qLang = () => app.questionsLang || 'en';
/** Does the spoiler filter hide any question? Then the selection may differ from other players'. */
const filterActive = () => app.questions.some((q) => app.settings.disabledWorks.includes(q.w));

/** Home's description of the challenge: to play, in progress or done today (score and streak). */
export function dailyStatus() {
  const d = getDaily();
  const day = today();
  if (d.run) return { state: 'run', n: d.run.index + 1, total: d.run.items.length };
  if (!canPlayDaily(d, day)) {
    // "Done today" only for today's result: with the device date moved back (beta 5, item 13)
    // the last result is from a later date, so Home just says the latest challenge was played.
    const r = d.result?.date === d.last && d.result.date === day ? d.result : null;
    if (!r) return { state: 'locked' };
    return { state: 'done', score: r.marks.filter((m) => m.ok).length, total: r.marks.length, streak: currentStreak(d, day) };
  }
  return { state: 'todo', streak: currentStreak(d, day) };
}

export function dailyScreen() {
  const d = getDaily();
  if (d.run) return runView(d);
  const day = today();
  // Today's challenge was played, or the device date is at or before the last one played (clock
  // moved back, a trip west): no replay, the last result is shown instead (beta 4, M3).
  if (!canPlayDaily(d, day)) return d.result?.date === d.last ? resultView(d) : lockedView(d);
  return introView(d);
}

/** The last result isn't stored (very old save): just say when the next challenge comes. */
function lockedView(d) {
  setBack(() => go('home'));
  return screen('daily-result',
    topBar(t('daily.title')),
    h('div', { class: 'result-body daily-locked-body' },
      svg(ICONS.calendar, 'result-icon'),
      h('p', { class: 'banner banner-info daily-clock-note', role: 'note' }, t('daily.clockBack', { date: formatDate(addDays(d.last, 1)) })),
      streakLine(d, today())),
    h('div', { class: 'stack-actions' },
      actionButton({ class: 'btn btn-ghost btn-block', 'data-autofocus': '', onclick: () => go('home') }, t('common.home'))));
}

function streakLine(d, day) {
  const s = currentStreak(d, day);
  return h('p', { class: 'daily-streak' }, svg(ICONS.flame),
    h('span', {}, s ? t('daily.streak', { n: num(s) }) : t('daily.noStreak')),
    d.best ? h('span', { class: 'muted daily-best' }, t('daily.best', { n: num(d.best) })) : null);
}

function introView(d) {
  const day = today();
  const empty = filterIsEmpty();
  const start = () => {
    const items = dailyPick(app.questions, app.settings.disabledWorks, day, qLang());
    if (!items.length) { toast(t('errors.noQuestions')); return; }
    fx.tap();
    const cur = getDaily();
    if (cur.run || !canPlayDaily(cur, day)) { go('daily'); return; } // started or finished in another tab
    saveDaily({ ...cur, run: { date: day, lang: qLang(), items, index: 0, marks: [], filtered: filterActive(), current: null } });
    go('daily');
  };
  return screen('daily-intro',
    topBar(t('daily.title')),
    empty ? noQuestionsBanner() : null,
    h('section', { class: 'card daily-intro-card' },
      svg(ICONS.calendar, 'daily-intro-icon'),
      h('p', { class: 'daily-date' }, formatDate(day)),
      h('p', { class: 'lead' }, t('daily.intro', { n: DAILY_LENGTH, s: TIMER_SECONDS })),
      h('p', { class: 'muted' }, t('daily.once')),
      streakLine(d, day)),
    filterActive() && !empty ? h('p', { class: 'banner banner-info daily-filter-note', role: 'note' }, t('daily.filterNote')) : null,
    h('div', { class: 'sticky-actions' },
      actionButton({ class: 'btn btn-primary btn-block daily-start', 'data-autofocus': '', disabled: empty, onclick: start }, svg(ICONS.play), t('daily.start'))));
}

/** Leaving a timed question asks first: its time keeps running. */
async function leave() {
  if (liveQuestion?.timerRunning?.() && document.contains(liveQuestion)) {
    const ok = await confirmDialog(t('classic.leaveTimerBody'), {
      title: t('daily.leaveTitle'), okLabel: t('classic.leaveTimerYes'), cancelLabel: t('classic.leaveTimerNo'),
    });
    if (!ok) return;
  }
  go('home');
}

function marksRow(marks, total, size = 22) {
  return h('div', { class: 'daily-marks', role: 'img', 'aria-label': t('daily.marksLabel', { n: marks.filter((m) => m.ok).length, total }) },
    Array.from({ length: total }, (_, i) => {
      const m = marks[i];
      const cls = m ? (m.ok ? 'ok' : 'bad') : 'todo';
      return h('span', { class: `daily-mark ${cls}`, 'aria-hidden': 'true', ...(m ? catStyle(m.c) : {}), html: m ? gemSvg(m.c, { size, charges: m.ok ? 2 : 0, color: m.ok ? undefined : 'currentColor' }) : '' });
    }));
}

function runView(d) {
  const run = d.run;
  const persist = () => { const cur = getDaily(); saveDaily({ ...cur, run }, { check: false }); };
  setBack(leave);
  const pool = makePool();
  // A question that vanished from the data (new data version) is skipped as a miss-free gap: drop it.
  let item = run.items[run.index];
  let q = pool.getAny(item.id);
  while (!q && run.index < run.items.length) {
    run.items.splice(run.index, 1);
    item = run.items[run.index];
    q = item && pool.getAny(item.id);
  }
  if (!q) return finish(run);
  if (!run.current) {
    run.current = { fx: emptyFx(), clock: newClock() };
    noteSeen(q.id); // discovered (collection progress)
    persist();
  }
  const total = run.items.length;
  const top = h('div', { class: 'q-top daily-top' },
    h('span', { class: 'progress-label' }, t('question.progress', { n: run.index + 1, total })),
    h('span', { class: 'grow' }),
    marksRow(run.marks, total, 18));
  liveQuestion = questionView({
    question: q, order: item.order, timer: true, clock: run.current.clock, onClockChange: persist, top, mode: 'daily',
    continueLabel: run.index + 1 >= total ? t('quick.seeResults') : t('common.next'),
    onAnswer: ({ correct }) => {
      recordAnswer(q.c, correct);
      if (!correct) noteMissed(q.id);
      run.marks.push({ c: q.c, ok: correct });
      run.index++;
      run.current = null;
      if (run.index >= total) finish(run, false); else persist();
      return null;
    },
    onContinue: () => go('daily'),
  });
  return screen('question daily',
    topBar(t('daily.title'), { back: leave, backIcon: 'home', backLabel: t('common.home') }),
    liveQuestion);
}

/** Records the finished run once (streak, counters, today's result) and removes it. */
function finish(run, render = true) {
  const cur = getDaily();
  if (run.marks.length) {
    const next = recordDaily({ ...cur, run: null }, { date: run.date, lang: run.lang, marks: run.marks, ids: run.items.slice(0, run.marks.length).map((x) => x.id), filtered: run.filtered });
    saveDaily({ ...next, run: null });
  } else saveDaily({ ...cur, run: null });
  return render ? dailyScreen() : null;
}

function formatDate(key, style = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  try {
    const [y, m, dd] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(document.documentElement.lang || undefined, style).format(new Date(y, m - 1, dd));
  } catch { return key; }
}
/** The share text's date: localized, without the weekday ("21 de octubre de 2026", "21. Oktober 2026"). */
const shareDate = (key) => formatDate(key, { day: 'numeric', month: 'long', year: 'numeric' });

function resultView(d) {
  const r = d.result;
  const day = today();
  const ok = r.marks.filter((m) => m.ok).length;
  const total = r.marks.length;
  const streak = currentStreak(d, day);
  setBack(() => go('home'));
  const text = shareText({
    title: `${t('app.title')} · ${t('daily.title')}`, date: shareDate(r.date), marks: r.marks,
    streakLabel: streak ? t('daily.shareStreak', { n: streak }) : '',
    filteredLabel: r.filtered ? t('daily.shareFiltered') : '',
    url: /^https?:/.test(location.href) ? location.href.split(/[?#]/)[0] : '',
  });
  const share = async () => {
    fx.tap();
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    toast((await copyText(text)) ? t('daily.copied') : t('daily.copyFailed'));
  };
  const missedIds = (r.ids || []).filter((_, i) => r.marks[i] && !r.marks[i].ok);
  const el = screen('daily-result',
    topBar(t('daily.title')),
    h('div', { class: 'result-body daily-result-body' },
      svg(ICONS.calendar, 'result-icon'),
      h('p', { class: 'daily-date' }, formatDate(r.date)),
      r.date !== day ? h('p', { class: 'banner banner-info daily-clock-note', role: 'note' }, t('daily.clockBack', { date: formatDate(addDays(d.last, 1)) })) : null,
      h('p', { class: 'result-score', 'aria-live': 'polite' }, t('daily.result', { n: ok, total })),
      marksRow(r.marks, total, 34),
      streakLine(d, day),
      r.date === day ? h('p', { class: 'muted daily-next' }, t('daily.comeBack')) : null),
    h('pre', { class: 'daily-share-preview', 'aria-label': t('daily.sharePreview') }, text),
    h('div', { class: 'stack-actions' },
      actionButton({ class: 'btn btn-primary btn-block daily-share', 'data-autofocus': '', onclick: share, once: false }, svg(ICONS.share), t('daily.share'))),
    r.ids?.length ? reviewSection(missedIds, 'daily') : null,
    h('div', { class: 'stack-actions' },
      actionButton({ class: 'btn btn-ghost btn-block daily-home', onclick: () => go('home') }, t('common.home'))));
  // A perfect day: confetti once per session (not on every visit to the result).
  if (ok === total && total === DAILY_LENGTH && cheered !== r.date) {
    cheered = r.date;
    requestAnimationFrame(() => { confetti(el, 50); fx.victory(); });
  }
  return el;
}
