// Classic mode: setup, turn handoff, wheel, wildcard, questions, final question, victory.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import {
  app, go, screen, topBar, iconButton, toggle, toast, makePool, recordAnswer, recordLifeline,
  updateStats, catStyle, setBack, onCleanup, levelPicker, levelBadge, confirmDialog, noQuestionsBanner, filterIsEmpty,
} from '../core.js';
import * as store from '../storage.js';
import { CATEGORIES, MIN_PLAYERS, MAX_PLAYERS, MAX_STREAK, LEVELS, levelOrDefault, fullLifelines } from '../config.js';
import { cleanName, initialOf } from '../text.js';
import { newClassicGame, isValidState, migrateState, applyAnswer, startPhase, isInfused, allInfused, infusedCount, emptyPlayerStats } from '../game.js';
import { shuffledOrder } from '../data.js';
import { fx, confetti } from '../fx.js';
import { questionView, emptyFx, newClock } from '../components/question.js';
import { wheel, WILDCARD } from '../components/wheel.js';
import { board, avatar, gemRow, lifelinesLeft } from '../components/board.js';

const SAVE_KEY = 'classic';
let state = null; // current classic game (in memory)

/**
 * The saved classic game, migrated and deep-checked; null if there is none or it is unusable
 * (unparseable, foreign shape, out-of-range values…). An unusable save is deleted so it can
 * never block the app or show a "Continue game" that does nothing.
 */
export function loadSavedGame() {
  const raw = store.load(SAVE_KEY, null);
  if (raw === null) {
    if (store.hasRaw(SAVE_KEY)) store.remove(SAVE_KEY); // not even JSON
    return null;
  }
  try {
    const oldVersion = raw?.v;
    const s = migrateState(raw);
    if (!isValidState(s) || s.phase === 'won' || !pendingMatchesData(s)) { store.remove(SAVE_KEY); return null; }
    if (oldVersion !== s.v) store.save(SAVE_KEY, s); // keep the upgraded save
    return s;
  } catch (e) {
    console.warn('discarding saved game', e);
    store.remove(SAVE_KEY);
    return null;
  }
}

/** A pending question that exists in the data must belong to the category the save says. */
function pendingMatchesData(s) {
  if (!s.pending) return true;
  const q = app.questions.find((x) => x.id === s.pending.id);
  return !q || q.c === s.pending.cat;
}

// Play time for the victory screen: the time between saves while this game is on screen, each
// gap capped (a phone left on the table for an hour doesn't count as an hour of play).
const MAX_GAP_MS = 5 * 60 * 1000;
let activeSince = null;
function trackTime() {
  const t0 = performance.now();
  if (activeSince !== null && state) state.playMs = (state.playMs || 0) + Math.round(Math.min(MAX_GAP_MS, Math.max(0, t0 - activeSince)));
  activeSince = t0;
}

function save() {
  trackTime();
  if (state.phase === 'won') store.remove(SAVE_KEY);
  else store.save(SAVE_KEY, state);
}

// ---------------------------------------------------------------- setup
export function setupScreen(params = {}) {
  const last = store.load('lastPlayers', null);
  const lastOk = Array.isArray(last) ? last.filter((p) => p && typeof p === 'object') : [];
  const initial = params.players || (lastOk.length ? lastOk : null);
  let players = (initial || [{}, {}]).slice(0, MAX_PLAYERS).map((p, i) => ({
    name: typeof p.name === 'string' ? cleanName(p.name) : '',
    color: CATEGORIES.includes(p.color) ? p.color : CATEGORIES[i],
  }));
  let timer = params.timer ?? app.settings.timer;
  let level = levelOrDefault(params.level ?? app.settings.level);

  const list = h('ol', { class: 'setup-players' });
  const countLabel = h('output', { class: 'stepper-value', 'aria-live': 'polite' });
  const minus = iconButton('minus', t('setup.fewer'), () => setCount(players.length - 1), 'stepper-btn');
  const plus = iconButton('plus', t('setup.more'), () => setCount(players.length + 1), 'stepper-btn');

  function freeColor() { return CATEGORIES.find((c) => !players.some((p) => p.color === c)) || CATEGORIES[0]; }

  function setCount(n) {
    n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
    while (players.length < n) players.push({ name: '', color: freeColor() });
    players.length = n;
    fx.tap();
    renderList();
  }

  function renderList() {
    countLabel.textContent = String(players.length);
    minus.disabled = players.length <= MIN_PLAYERS;
    plus.disabled = players.length >= MAX_PLAYERS;
    list.replaceChildren(...players.map((p, i) => {
      const inputId = `pname-${i}`;
      const input = h('input', {
        id: inputId, type: 'text', class: 'text-input', value: p.name, maxlength: '24', autocomplete: 'off',
        autocapitalize: 'words', enterkeyhint: 'next', placeholder: t('setup.namePlaceholder', { n: i + 1 }),
        oninput: (e) => {
          p.name = e.target.value;
          // Live avatar initial while typing (the number when the name is empty).
          const ini = input.closest('.setup-player')?.querySelector('.avatar-initial');
          if (ini) ini.textContent = initialOf(p.name, String(i + 1));
        },
      });
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': `${t('setup.color')} — ${t('setup.player', { n: i + 1 })}` },
        CATEGORIES.map((c) => h('button', {
          type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(p.color === c),
          'aria-label': t(`gem.${c}`), title: t(`gem.${c}`), ...catStyle(c),
          html: gemSvg(c, { size: 28 }),
          onclick: () => {
            const other = players.find((o) => o !== p && o.color === c);
            if (other) other.color = p.color; // swap so colors stay unique
            p.color = c;
            fx.tap();
            renderList();
            list.querySelectorAll('.setup-player')[i]?.querySelector(`.swatch[aria-checked="true"]`)?.focus();
          },
        })));
      return h('li', { class: 'setup-player card', ...catStyle(p.color) },
        h('div', { class: 'setup-player-row' },
          avatar(p.color, p.name.trim() ? p.name : String(i + 1), 44),
          h('div', { class: 'grow' },
            h('label', { for: inputId, class: 'field-label' }, t('setup.player', { n: i + 1 })),
            input)),
        swatches);
    }));
  }
  renderList();

  const empty = filterIsEmpty();
  function start() {
    const pool = makePool({});
    const categories = pool.categories();
    if (!categories.length) { toast(t('errors.emptyFilter')); return; }
    const named = players.map((p, i) => ({ name: cleanName(p.name) || t('setup.namePlaceholder', { n: i + 1 }), color: p.color }));
    store.save('lastPlayers', players.map((p) => ({ name: cleanName(p.name), color: p.color })));
    state = newClassicGame({ players: named, timer, categories, level });
    save();
    fx.tap();
    go('classic');
  }

  return screen('setup',
    topBar(t('setup.title')),
    empty ? noQuestionsBanner() : null,
    h('section', { class: 'card stepper-card' },
      h('span', { class: 'row-label', id: 'pcount' }, t('setup.playerCount')),
      h('div', { class: 'stepper', role: 'group', 'aria-labelledby': 'pcount' }, minus, countLabel, plus)),
    list,
    levelPicker(level, (l) => { level = l; }),
    h('section', { class: 'card' }, toggle(t('setup.timer'), timer, (v) => { timer = v; }, { hint: t('setup.timerHint') }),
      h('p', { class: 'muted setup-timer-note' }, t('setup.timerPause'))),
    h('div', { class: 'sticky-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: start, disabled: empty }, svg(ICONS.play), t('setup.start'))),
  );
}

// ---------------------------------------------------------------- game
function ensureState() {
  if (!state) state = loadSavedGame();
  if (!state) return false;
  const before = JSON.stringify([state.categories, state.phase, state.resume]);
  // Respect the current spoiler filter: drop categories that no longer have questions, except
  // the one of a question already drawn (it stays pending, see questionPhase).
  const available = makePool(state.used).categories();
  if (available.length) {
    const kept = state.categories.filter((c) => available.includes(c) || c === state.pending?.cat);
    state.categories = kept.length ? kept : available;
  }
  // Fewer categories can complete a player's gems: keep the final-question phases consistent.
  const ready = allInfused(state, cur());
  if (!state.pending) {
    if (ready && (state.phase === 'spin' || state.phase === 'choose')) state.phase = 'final-intro';
    if (!ready && state.phase === 'final-intro') state.phase = 'spin';
    // Keep the phase a resumed game returns to after the handoff (a wildcard choice stays a
    // choice); only fix it when the gems no longer match it.
    if (state.phase === 'handoff' && state.resume) {
      if (ready && ['spin', 'choose'].includes(state.resume)) state.resume = 'final-intro';
      if (!ready && state.resume === 'final-intro') state.resume = null;
    }
  }
  // A solo game never needs the pass-the-phone screen.
  if (state.players.length === 1 && state.phase === 'handoff') {
    state.phase = state.resume || (state.pending ? 'question' : startPhase(state));
    state.resume = null;
  }
  if (JSON.stringify([state.categories, state.phase, state.resume]) !== before) save();
  return true;
}

const cur = () => state.players[state.current];
let liveQuestion = null; // the question card on screen (classic), to know if its timer is running

/**
 * Home / Back. On a revealed question with the timer on, the time keeps running while away
 * (no free thinking time), so the player confirms first.
 */
async function leave() {
  if (state?.phase === 'question' && liveQuestion?.timerRunning?.() && document.contains(liveQuestion)) {
    const ok = await confirmDialog(t('classic.leaveTimerBody'), {
      title: t('classic.leaveTimerTitle'), okLabel: t('classic.leaveTimerYes'), cancelLabel: t('classic.leaveTimerNo'),
    });
    if (!ok || !state) return;
  }
  save();
  activeSince = null;
  go('home');
}

function gameBar(title) {
  return topBar(title, { back: leave, backIcon: 'home', backLabel: t('classic.leave'), right: levelBadge(state.level) });
}

/** "Turn of {name}" where only the name is shortened with an ellipsis when space runs out. */
function turnTitle(name) {
  const [before, after = ''] = t('turn.turnOf', { name: '\u0001' }).split('\u0001');
  return h('span', { class: 'turn-title' },
    before ? h('span', { class: 'turn-fix' }, before) : null,
    h('span', { class: 'turn-name' }, name),
    after ? h('span', { class: 'turn-fix' }, after) : null);
}

/**
 * A saved game resumed from Home (after a reload or after leaving): in multi-player games the
 * phone may be in anyone's hands, so the pass-the-phone screen comes first and the pending
 * question is only revealed after "Ready" (its clock is stopped until then).
 */
function applyResume() {
  if (state.players.length > 1 && state.phase !== 'handoff' && state.phase !== 'won') {
    state.resume = state.phase;
    state.phase = 'handoff';
    save();
  }
}

/** The spoiler filter leaves no question for this game: say so instead of spinning forever. */
function noQuestionsView() {
  return screen('classic-empty', gameBar(t('home.classic')),
    noQuestionsBanner(),
    h('p', { class: 'muted center' }, t('classic.emptySaved')),
    h('div', { class: 'stack-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '', onclick: leave }, t('common.home'))));
}

export function classicScreen(params = {}) {
  liveQuestion = null;
  if (!ensureState()) { setTimeout(() => go('home')); return screen('', h('h1', {}, t('common.loading'))); }
  if (params.resume) applyResume();
  if (activeSince === null) activeSince = performance.now();
  setBack(leave);
  if (!state.pending && state.phase !== 'won' && !makePool(state.used).categories().length) return noQuestionsView();
  switch (state.phase) {
    case 'handoff': return handoffView();
    case 'spin': return spinView();
    case 'choose': return chooseView();
    case 'final-intro': return finalIntroView();
    case 'question': return questionPhase();
    case 'won': return victoryView();
    default:
      state.phase = startPhase(state);
      return spinView();
  }
}

function handoffView() {
  const p = cur();
  return screen('handoff', gameBar(''),
    h('div', { class: 'handoff-body', ...catStyle(p.color) },
      svg(ICONS.phone, 'handoff-phone'),
      state.first ? h('p', { class: 'handoff-starts', role: 'status' }, t('turn.starts', { name: p.name })) : null,
      h('p', { class: 'handoff-pass' }, t('turn.passTo')),
      avatar(p.color, p.name, 96),
      h('h1', { class: 'handoff-name' }, p.name),
      gemRow(state, p, 26),
      lifelinesLeft(p, 26),
      h('p', { class: 'muted' }, t('turn.noPeek'))),
    h('div', { class: 'sticky-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '',
        onclick: () => {
          fx.tap();
          state.first = false;
          state.phase = state.resume || (state.pending ? 'question' : startPhase(state));
          state.resume = null;
          if (state.phase === 'question' && !state.pending) state.phase = startPhase(state);
          save();
          go('classic');
        },
      }, t('turn.ready'))));
}

function spinView() {
  const p = cur();
  const status = h('p', { class: 'wheel-status', 'aria-live': 'polite' }, t('wheel.tapToSpin'));
  const spinBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => w.spin() }, svg(ICONS.refresh), t('wheel.spin'));
  let el = null;
  const w = wheel(state.categories, (result) => {
    spinBtn.disabled = true;
    let delay = 1100;
    if (result === WILDCARD) {
      status.textContent = t('wheel.landed', { category: t('wheel.wildcard') });
      state.phase = 'choose';
    } else if (isInfused(p, result)) {
      // An already-infused gem gives nothing, so it acts as a wildcard among the gems still to infuse.
      status.textContent = t('wheel.infusedPick', { category: t(`cat.${result}`) });
      status.classList.add('notice');
      state.phase = 'choose';
      delay = 2500; // a rule worth reading: stays ~2.5 s, or until tapped
    } else {
      status.textContent = t('wheel.landed', { category: t(`cat.${result}`) });
      status.setAttribute('style', `--cat: var(--c-${result})`);
      status.classList.add('landed');
      setPending(result, false);
    }
    save();
    let moved = false;
    const next = () => { if (!moved) { moved = true; go('classic'); } };
    const timer = setTimeout(next, delay);
    if (delay > 1100) setTimeout(() => el?.addEventListener('click', next), 0);
    onCleanup(() => { moved = true; clearTimeout(timer); });
  });
  w.querySelector('.wheel').addEventListener('click', () => { spinBtn.disabled = true; status.textContent = t('wheel.spinning'); });
  spinBtn.addEventListener('click', () => { spinBtn.disabled = true; status.textContent = t('wheel.spinning'); });

  el = screen('spin', gameBar(turnTitle(p.name)),
    board(state, { compact: true }),
    w,
    status,
    h('div', { class: 'sticky-actions' }, spinBtn));
  return el;
}

function chooseView() {
  const open = state.categories.filter((c) => !isInfused(cur(), c));
  return screen('choose', gameBar(t('wheel.chooseTitle')),
    h('p', { class: 'lead center' }, t('wheel.chooseHint')),
    h('div', { class: 'cat-grid' }, (open.length ? open : state.categories).map((c) => h('button', {
      type: 'button', class: 'cat-choice', ...catStyle(c),
      onclick: () => { fx.tap(); setPending(c, false); save(); go('classic'); },
    }, h('span', { class: 'cat-choice-gem', 'aria-hidden': 'true', html: gemSvg(c, { charges: Math.min(cur().charges[c] || 0, 2), size: 40 }) }),
    h('span', {}, t(`cat.${c}`))))));
}

function finalIntroView() {
  const p = cur();
  return screen('final-intro', gameBar(''),
    h('div', { class: 'final-body', ...catStyle(p.color) },
      svg(ICONS.trophy, 'final-trophy'),
      h('h1', { class: 'final-title' }, t('classic.finalTitle')),
      avatar(p.color, p.name, 72),
      gemRow(state, p, 28),
      h('p', { class: 'lead' }, t('classic.finalIntro', { name: p.name }))),
    h('div', { class: 'sticky-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block btn-final', 'data-autofocus': '',
        onclick: () => {
          fx.tap();
          const q = makePool(state.used).drawFinal(state.categories, LEVELS[levelOrDefault(state.level)].final);
          if (!q) { toast(t('errors.noQuestions')); return; }
          state.pending = { id: q.id, cat: q.c, order: shuffledOrder(), final: true };
          state.phase = 'question';
          save();
          go('classic');
        },
      }, t('classic.finalReady'))));
}

function setPending(cat, final) {
  const q = makePool(state.used).drawLeveled(cat, state.level);
  if (!q) { state.phase = 'spin'; return; }
  state.pending = { id: q.id, cat, order: shuffledOrder(), final };
  state.phase = 'question';
}

function questionPhase() {
  const pool = makePool(state.used);
  // A question already drawn stays pending even if the spoiler filter now hides it: changing the
  // settings must not give a free re-draw (or a fresh timer). Only a question that no longer
  // exists in the data is replaced, and it keeps the time it had left.
  let q = state.pending && pool.getAny(state.pending.id);
  if (!q) {
    const final = !!state.pending?.final;
    const clock = state.pending?.clock;
    q = final ? pool.drawFinal(state.categories, LEVELS[levelOrDefault(state.level)].final)
      : pool.drawLeveled(state.pending?.cat || state.categories[0], state.level);
    if (!q) { state.pending = null; state.phase = startPhase(state); save(); return classicScreen(); }
    state.pending = { id: q.id, cat: q.c, order: shuffledOrder(), final, ...(clock ? { clock } : {}) };
    save();
  }
  const p = cur();
  const pend = state.pending;
  const top = h('div', { class: 'q-top' }, avatar(p.color, p.name, 28), h('span', { class: 'q-top-name' }, p.name));
  // Lifelines: one of each per player and game; never on the final question (SPEC v2).
  p.lifelines ||= fullLifelines();
  const lifelines = pend.final ? null : {
    left: p.lifelines,
    breathOk: pool.hasAlternative(q),
    fx: (pend.fx ||= emptyFx()),
    onUse: (kind) => {
      p.lifelines[kind] = Math.max(0, (p.lifelines[kind] || 0) - 1);
      (p.stats ||= emptyPlayerStats()).lifelines++;
      recordLifeline(kind);
      if (kind === 'breath') {
        const alt = pool.drawAlternative(q);
        // An armed Stormlight carries over to the new question; the new question gets a new clock.
        if (alt) state.pending = { id: alt.id, cat: alt.c, order: shuffledOrder(), final: false, fx: emptyFx(!!pend.fx?.armed) };
        save();
        go('classic');
        return;
      }
      save();
    },
    onChange: save,
  };
  if (state.timer) pend.clock ||= newClock();
  liveQuestion = questionView({
      question: q, order: pend.order, timer: state.timer, clock: pend.clock, onClockChange: save, final: pend.final, top, lifelines,
      onAnswer: ({ correct }) => {
        recordAnswer(q.c, correct);
        const st = (p.stats ||= emptyPlayerStats());
        st.answered++;
        if (correct) st.correct++;
        const res = applyAnswer(state, correct);
        if (res.won) updateStats((s) => { s.classicGames++; });
        save();
        return feedbackFor(res, p);
      },
      onContinue: () => go('classic'),
    });
  return screen('question', gameBar(pend.final ? t('question.final') : turnTitle(p.name)), liveQuestion);
}

function feedbackFor(res, player) {
  const cat = t(`cat.${res.cat}`);
  const lines = [];
  if (res.won) return null;
  if (res.correct) {
    if (res.alreadyInfused) lines.push(t('classic.alreadyInfused', { category: cat }));
    else if (res.infused) { lines.push(t('classic.infused', { category: cat })); setTimeout(() => fx.infuse(), 350); }
    else lines.push(t('classic.charge', { category: cat, n: res.charges }));
    if (res.streakEnd) {
      // The 3rd answer in a row can also infuse the last gem: say both, the final comes next turn.
      if (res.allInfused) lines.push(t('classic.allInfusedNext'));
      lines.push(t('classic.streakPass', { n: MAX_STREAK, name: res.next }));
    } else lines.push(res.allInfused ? t('classic.allInfused') : t('classic.spinAgain'));
  } else {
    if (res.final) lines.push(t('classic.finalFail'));
    lines.push(state.players.length > 1 ? t('classic.passTurn', { name: res.next }) : t('classic.soloMiss'));
  }
  const p = res.correct ? player : null;
  return [
    ...lines.map((l) => h('p', { class: 'outcome' }, l)),
    p ? gemRow(state, p, 24) : null,
  ];
}

/** "1:05:09" / "12:04" from milliseconds. */
function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Per-player summary on the victory screen: right answers, accuracy, lifelines used, gems. */
function playerStats() {
  const rows = state.players.map((p, i) => {
    const st = p.stats || emptyPlayerStats();
    const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
    const item = (cls, label, value) => h('div', { class: `vstat ${cls}` }, h('dt', {}, label), h('dd', {}, value));
    return h('li', { class: `vstats-player ${i === state.winner ? 'winner' : ''}`, '--pc': `var(--c-${p.color})` },
      h('div', { class: 'vstats-head' },
        avatar(p.color, p.name, 32),
        h('span', { class: 'vstats-name' }, p.name),
        i === state.winner ? svg(ICONS.trophy, 'vstats-trophy') : null),
      h('dl', { class: 'vstats-grid' },
        item('vstat-correct', t('victory.correct'), t('victory.correctOf', { n: num(st.correct), total: num(st.answered) })),
        item('vstat-acc', t('victory.accuracy'), t('victory.percent', { n: num(acc) })),
        item('vstat-lifelines', t('victory.lifelines'), num(st.lifelines)),
        item('vstat-gems', t('victory.gems'), t('victory.correctOf', { n: num(infusedCount(state, p)), total: num(state.categories.length) }))));
  });
  return h('section', { class: 'vstats', 'aria-labelledby': 'vstats-title' },
    h('h2', { class: 'section-title', id: 'vstats-title' }, t('victory.statsTitle')),
    h('ol', { class: 'vstats-list' }, rows));
}

function victoryView() {
  const winner = state.players[state.winner ?? state.current];
  const el = screen('victory',
    h('div', { class: 'victory-body', ...catStyle(winner.color) },
      svg(ICONS.trophy, 'victory-trophy'),
      h('h1', { class: 'victory-title' }, t('victory.title', { name: winner.name })),
      h('p', { class: 'lead' }, t('victory.subtitle')),
      h('p', { class: 'muted victory-meta' },
        h('span', { class: 'victory-duration' }, t('victory.duration', { time: formatDuration(state.playMs) })),
        ' · ',
        h('span', {}, t('victory.answered', { n: state.asked }))),
      playerStats()),
    h('div', { class: 'stack-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '',
        onclick: () => {
          // Same players, colors, timer and level: straight back to a prefilled setup.
          const players = state.players.map((p) => ({ name: p.name, color: p.color }));
          const timer = state.timer;
          const level = state.level;
          state = null;
          activeSince = null;
          go('classic-setup', { players, timer, level });
        },
      }, svg(ICONS.refresh), t('common.playAgain')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => { state = null; activeSince = null; go('home'); } }, t('common.home'))));
  setBack(() => { state = null; activeSince = null; go('home'); });
  requestAnimationFrame(() => { confetti(el); fx.victory(); });
  return el;
}

/** Called when a new game is started from setup (resets memory state). */
export function resetClassic() { state = null; store.remove(SAVE_KEY); }
