// Classic mode: setup, turn handoff, wheel, wildcard, questions, final question, victory.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t } from '../i18n.js';
import {
  app, go, screen, topBar, iconButton, toggle, toast, makePool, recordAnswer,
  updateStats, catStyle, setBack, onCleanup,
} from '../core.js';
import * as store from '../storage.js';
import { CATEGORIES, MIN_PLAYERS, MAX_PLAYERS } from '../config.js';
import { newClassicGame, isValidState, applyAnswer, startPhase, isInfused } from '../game.js';
import { shuffledOrder } from '../data.js';
import { fx, confetti } from '../fx.js';
import { questionView } from '../components/question.js';
import { wheel, WILDCARD } from '../components/wheel.js';
import { board, avatar, gemRow } from '../components/board.js';

const SAVE_KEY = 'classic';
let state = null; // current classic game (in memory)

export function loadSavedGame() {
  const s = store.load(SAVE_KEY, null);
  if (!isValidState(s) || s.phase === 'won') return null;
  return s;
}

function save() {
  if (state.phase === 'won') store.remove(SAVE_KEY);
  else store.save(SAVE_KEY, state);
}

// ---------------------------------------------------------------- setup
export function setupScreen(params = {}) {
  const last = store.load('lastPlayers', null);
  const initial = params.players || (Array.isArray(last) && last.length ? last : null);
  let players = (initial || [{}, {}]).slice(0, MAX_PLAYERS).map((p, i) => ({
    name: typeof p.name === 'string' ? p.name : '',
    color: CATEGORIES.includes(p.color) ? p.color : CATEGORIES[i],
  }));
  let timer = params.timer ?? app.settings.timer;

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
        id: inputId, type: 'text', class: 'text-input', value: p.name, maxlength: '16', autocomplete: 'off',
        autocapitalize: 'words', enterkeyhint: 'next', placeholder: t('setup.namePlaceholder', { n: i + 1 }),
        oninput: (e) => { p.name = e.target.value; },
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
          avatar(p.color, p.name || String(i + 1), 44),
          h('div', { class: 'grow' },
            h('label', { for: inputId, class: 'field-label' }, t('setup.player', { n: i + 1 })),
            input)),
        swatches);
    }));
  }
  renderList();

  function start() {
    const pool = makePool({});
    const categories = pool.categories();
    if (!categories.length) { toast(t('errors.noQuestions')); return; }
    const named = players.map((p, i) => ({ name: (p.name || '').trim() || t('setup.namePlaceholder', { n: i + 1 }), color: p.color }));
    store.save('lastPlayers', players.map((p) => ({ name: (p.name || '').trim(), color: p.color })));
    state = newClassicGame({ players: named, timer, categories });
    save();
    fx.tap();
    go('classic');
  }

  return screen('setup',
    topBar(t('setup.title')),
    h('section', { class: 'card stepper-card' },
      h('span', { class: 'row-label', id: 'pcount' }, t('setup.playerCount')),
      h('div', { class: 'stepper', role: 'group', 'aria-labelledby': 'pcount' }, minus, countLabel, plus)),
    list,
    h('section', { class: 'card' }, toggle(t('setup.timer'), timer, (v) => { timer = v; }, { hint: t('setup.timerHint') })),
    h('div', { class: 'sticky-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: start }, svg(ICONS.play), t('setup.start'))),
  );
}

// ---------------------------------------------------------------- game
function ensureState() {
  if (!state) state = loadSavedGame();
  if (!state) return false;
  // Respect the current spoiler filter: drop categories that no longer have questions.
  const available = makePool(state.used).categories();
  if (available.length) {
    const kept = state.categories.filter((c) => available.includes(c));
    state.categories = kept.length ? kept : available;
  }
  return true;
}

const cur = () => state.players[state.current];

function leave() {
  save();
  go('home');
}

function gameBar(title) {
  return topBar(title, { back: leave, backIcon: 'home', backLabel: t('classic.leave') });
}

export function classicScreen() {
  if (!ensureState()) { setTimeout(() => go('home')); return screen('', h('h1', {}, t('common.loading'))); }
  setBack(leave);
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
      h('p', { class: 'handoff-pass' }, t('turn.passTo')),
      avatar(p.color, p.name, 96),
      h('h1', { class: 'handoff-name' }, p.name),
      gemRow(state, p, 26),
      h('p', { class: 'muted' }, t('turn.noPeek'))),
    h('div', { class: 'sticky-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '',
        onclick: () => {
          fx.tap();
          state.phase = state.pending ? 'question' : startPhase(state);
          save();
          go('classic');
        },
      }, t('turn.ready'))));
}

function spinView() {
  const p = cur();
  const status = h('p', { class: 'wheel-status', 'aria-live': 'polite' }, t('wheel.tapToSpin'));
  const spinBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => w.spin() }, svg(ICONS.refresh), t('wheel.spin'));
  const w = wheel(state.categories, (result) => {
    spinBtn.disabled = true;
    if (result === WILDCARD) {
      status.textContent = t('wheel.landed', { category: t('wheel.wildcard') });
      state.phase = 'choose';
    } else if (isInfused(p, result)) {
      // An already-infused gem gives nothing, so it acts as a wildcard among the gems still to infuse.
      status.textContent = t('wheel.infusedPick', { category: t(`cat.${result}`) });
      state.phase = 'choose';
    } else {
      status.textContent = t('wheel.landed', { category: t(`cat.${result}`) });
      status.setAttribute('style', `--cat: var(--c-${result})`);
      status.classList.add('landed');
      setPending(result, false);
    }
    save();
    const timer = setTimeout(() => go('classic'), 1100);
    onCleanup(() => clearTimeout(timer));
  });
  w.querySelector('.wheel').addEventListener('click', () => { spinBtn.disabled = true; status.textContent = t('wheel.spinning'); });
  spinBtn.addEventListener('click', () => { spinBtn.disabled = true; status.textContent = t('wheel.spinning'); });

  return screen('spin', gameBar(t('turn.turnOf', { name: p.name })),
    board(state, { compact: true }),
    w,
    status,
    h('div', { class: 'sticky-actions' }, spinBtn));
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
          const q = makePool(state.used).drawFinal(state.categories);
          if (!q) { toast(t('errors.noQuestions')); return; }
          state.pending = { id: q.id, cat: q.c, order: shuffledOrder(), final: true };
          state.phase = 'question';
          save();
          go('classic');
        },
      }, t('classic.finalReady'))));
}

function setPending(cat, final) {
  const q = makePool(state.used).draw(cat);
  if (!q) { state.phase = 'spin'; return; }
  state.pending = { id: q.id, cat, order: shuffledOrder(), final };
  state.phase = 'question';
}

function questionPhase() {
  const pool = makePool(state.used);
  let q = state.pending && pool.get(state.pending.id);
  if (!q) { // question vanished (filter/data changed): draw again
    const final = !!state.pending?.final;
    q = final ? pool.drawFinal(state.categories) : pool.draw(state.pending?.cat || state.categories[0]);
    if (!q) { state.pending = null; state.phase = 'spin'; save(); return spinView(); }
    state.pending = { id: q.id, cat: q.c, order: shuffledOrder(), final };
    save();
  }
  const p = cur();
  const pend = state.pending;
  const top = h('div', { class: 'q-top' }, avatar(p.color, p.name, 28), h('span', { class: 'q-top-name' }, p.name));
  return screen('question', gameBar(pend.final ? t('question.final') : t('turn.turnOf', { name: p.name })),
    questionView({
      question: q, order: pend.order, timer: state.timer, final: pend.final, top,
      onAnswer: ({ correct }) => {
        recordAnswer(q.c, correct);
        const res = applyAnswer(state, correct);
        if (res.won) updateStats((s) => { s.classicGames++; });
        save();
        return feedbackFor(res);
      },
      onContinue: () => go('classic'),
    }));
}

function feedbackFor(res) {
  const cat = t(`cat.${res.cat}`);
  const lines = [];
  if (res.won) return null;
  if (res.correct) {
    if (res.alreadyInfused) lines.push(t('classic.alreadyInfused', { category: cat }));
    else if (res.infused) { lines.push(t('classic.infused', { category: cat })); setTimeout(() => fx.infuse(), 350); }
    else lines.push(t('classic.charge', { category: cat, n: res.charges }));
    lines.push(res.allInfused ? t('classic.allInfused') : t('classic.spinAgain'));
  } else {
    if (res.final) lines.push(t('classic.finalFail'));
    lines.push(state.players.length > 1 ? t('classic.passTurn', { name: res.next }) : t('classic.soloMiss'));
  }
  const p = res.correct ? cur() : null;
  return [
    ...lines.map((l) => h('p', { class: 'outcome' }, l)),
    p ? gemRow(state, p, 24) : null,
  ];
}

function victoryView() {
  const winner = state.players[state.winner ?? state.current];
  const el = screen('victory',
    h('div', { class: 'victory-body', ...catStyle(winner.color) },
      svg(ICONS.trophy, 'victory-trophy'),
      h('h1', { class: 'victory-title' }, t('victory.title', { name: winner.name })),
      h('p', { class: 'lead' }, t('victory.subtitle')),
      board(state),
      h('p', { class: 'muted' }, t('victory.answered', { n: state.asked }))),
    h('div', { class: 'stack-actions' },
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block', 'data-autofocus': '',
        onclick: () => {
          const players = state.players.map((p) => ({ name: p.name, color: p.color }));
          const timer = state.timer;
          state = null;
          go('classic-setup', { players, timer });
        },
      }, t('common.playAgain')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block', onclick: () => { state = null; go('home'); } }, t('common.home'))));
  setBack(() => { state = null; go('home'); });
  requestAnimationFrame(() => { confetti(el); fx.victory(); });
  return el;
}

/** Called when a new game is started from setup (resets memory state). */
export function resetClassic() { state = null; store.remove(SAVE_KEY); }
