// Classic-mode rules (SPEC §2), kept free of DOM code.
import {
  CATEGORIES, CHARGES_TO_INFUSE, LIFELINES, LEVEL_IDS, MAX_PLAYERS, MAX_STREAK, fullLifelines, levelOrDefault,
} from './config.js';

// v2 adds the game level and per-player lifelines; v3 adds the random first player, the
// consecutive-answer limit (streak) and the question deadline. Older saves are migrated on load.
export const STATE_VERSION = 3;
export const PHASES = ['handoff', 'spin', 'choose', 'final-intro', 'question', 'won'];

const randomIndex = (n) => Math.floor(Math.random() * n);

export function newClassicGame({ players, timer, categories, level }) {
  const multi = players.length > 1;
  return {
    v: STATE_VERSION,
    players: players.map((p) => ({ name: p.name, color: p.color, charges: {}, lifelines: fullLifelines() })),
    current: multi ? randomIndex(players.length) : 0, // SPEC: the starting player is drawn at random
    phase: multi ? 'handoff' : 'spin',
    first: multi, // show "Starts: {name}" on the first handoff
    streak: 0, // correct answers in a row in the current turn
    timer: !!timer,
    level: levelOrDefault(level),
    categories,
    used: {},
    pending: null, // { id, cat, order, final, fx: { removed, struck, armed }, clock: { deadline } }
    resume: null, // phase to restore after the handoff shown when a saved game is resumed
    asked: 0,
    winner: null,
    startedAt: Date.now(),
  };
}

// Shape checks shared with the quick game's saved run.
export const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export const isInt = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max;
export const isPermutation = (a, n) => Array.isArray(a) && a.length === n && [...Array(n).keys()].every((i) => a.includes(i));
const optIndexes = (a) => Array.isArray(a) && a.length <= 3 && a.every((i) => isInt(i, 1, 3)) && new Set(a).size === a.length;
/** Lifeline effects on a question ({ removed, struck, armed }); null/undefined means none yet. */
export const isValidFx = (fx) => fx === undefined || fx === null
  || (isObj(fx) && optIndexes(fx.removed) && optIndexes(fx.struck) && typeof fx.armed === 'boolean');
/** Question countdown ({ deadline: epoch ms | null }); null/undefined means not started. */
export const isValidClock = (c) => c === undefined || c === null || (isObj(c) && (c.deadline === null || Number.isFinite(c.deadline)));
export const isValidLifelines = (l) => isObj(l) && LIFELINES.every((k) => isInt(l[k], 0, 1));

/**
 * Upgrades an older saved game in place (v1 → v2: level Normal, full lifelines;
 * v2 → v3: streak 0). Never throws; whatever cannot be upgraded is left for isValidState to reject.
 */
export function migrateState(s) {
  if (!isObj(s)) return s;
  if (s.v === 1) s.v = 2;
  if (s.v === 2) {
    if (Array.isArray(s.players)) {
      for (const p of s.players) {
        if (isObj(p) && !isObj(p.lifelines)) p.lifelines = fullLifelines();
      }
    }
    s.level = levelOrDefault(s.level);
    s.streak = 0;
    s.first = false;
    s.v = 3;
  }
  if (s.v !== STATE_VERSION) return s;
  // Light normalization of fields that have a safe default.
  if (!LEVEL_IDS.includes(s.level)) s.level = levelOrDefault(s.level);
  if (typeof s.timer !== 'boolean') s.timer = !!s.timer;
  if (!isInt(s.asked)) s.asked = 0;
  if (!isInt(s.streak, 0, MAX_STREAK)) s.streak = 0;
  if (typeof s.first !== 'boolean') s.first = false;
  if (!isObj(s.used) || !Object.values(s.used).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'))) s.used = {};
  if (s.resume !== null && s.resume !== undefined && !PHASES.includes(s.resume)) s.resume = null;
  if (Array.isArray(s.players)) {
    for (const p of s.players) {
      if (!isObj(p) || !isObj(p.lifelines)) continue;
      for (const k of LIFELINES) if (!isInt(p.lifelines[k], 0, 1)) p.lifelines[k] = 0;
    }
  }
  return s;
}

function isValidPlayer(p) {
  return isObj(p) && typeof p.name === 'string' && p.name.length <= 64 && CATEGORIES.includes(p.color)
    && isObj(p.charges) && Object.entries(p.charges).every(([c, n]) => CATEGORIES.includes(c) && isInt(n, 0, 99))
    && isValidLifelines(p.lifelines);
}

function isValidPending(p) {
  if (p === null || p === undefined) return true;
  if (!isObj(p) || typeof p.id !== 'string' || !p.id || !CATEGORIES.includes(p.cat)) return false;
  if (!isPermutation(p.order, 4) || typeof p.final !== 'boolean') return false;
  return isValidFx(p.fx) && isValidClock(p.clock);
}

/** Deep check of a (migrated) saved game. Anything odd means the save is discarded. */
export function isValidState(s) {
  try {
    if (!isObj(s) || s.v !== STATE_VERSION) return false;
    if (!Array.isArray(s.players) || s.players.length < 1 || s.players.length > MAX_PLAYERS) return false;
    if (!s.players.every(isValidPlayer)) return false;
    if (!isInt(s.current, 0, s.players.length - 1)) return false;
    if (!Array.isArray(s.categories) || !s.categories.length || !s.categories.every((c) => CATEGORIES.includes(c))
      || new Set(s.categories).size !== s.categories.length) return false;
    if (!PHASES.includes(s.phase)) return false;
    if (!isValidPending(s.pending)) return false;
    if (s.phase === 'question' && !s.pending) return false;
    if (s.phase === 'won' && !isInt(s.winner, 0, s.players.length - 1)) return false;
    return true;
  } catch {
    return false;
  }
}

export const charges = (player, cat) => Math.min(player.charges[cat] || 0, CHARGES_TO_INFUSE);
export const isInfused = (player, cat) => charges(player, cat) >= CHARGES_TO_INFUSE;
export const infusedCount = (state, player) => state.categories.filter((c) => isInfused(player, c)).length;
export const allInfused = (state, player) => state.categories.length > 0
  && state.categories.every((c) => isInfused(player, c));

/** Phase a player starts in when it's (still) their turn. */
export function startPhase(state) {
  return allInfused(state, state.players[state.current]) ? 'final-intro' : 'spin';
}

function passTurn(state, result) {
  state.current = (state.current + 1) % state.players.length;
  state.streak = 0;
  result.next = state.players[state.current].name;
  state.phase = state.players.length > 1 ? 'handoff' : startPhase(state);
}

/**
 * Applies the answer to the pending question and moves the game forward.
 * Returns a description of what happened, for the feedback message.
 */
export function applyAnswer(state, correct) {
  const p = state.players[state.current];
  const { cat, final } = state.pending;
  const result = { correct, final, cat, player: p.name, gained: false, infused: false, alreadyInfused: false, won: false, streakEnd: false };
  state.pending = null;
  state.asked++;

  if (correct && final) {
    state.winner = state.current;
    state.phase = 'won';
    result.won = true;
    return result;
  }
  if (correct) {
    if (isInfused(p, cat)) {
      result.alreadyInfused = true;
    } else {
      p.charges[cat] = (p.charges[cat] || 0) + 1;
      result.gained = true;
      result.charges = p.charges[cat];
      result.infused = isInfused(p, cat);
    }
    result.allInfused = allInfused(state, p);
    state.streak = (state.streak || 0) + 1;
    // SPEC: at most MAX_STREAK correct answers per turn; then the turn passes even on a right answer.
    if (state.players.length > 1 && state.streak >= MAX_STREAK) {
      result.streakEnd = true;
      passTurn(state, result);
      return result;
    }
    state.phase = startPhase(state);
    return result;
  }
  // Wrong (or timed out): turn passes.
  passTurn(state, result);
  return result;
}
