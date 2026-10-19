// Classic-mode rules (SPEC §2), kept free of DOM code.
import {
  CATEGORIES, CHARGES_TO_INFUSE, LIFELINES, LEVEL_IDS, MAX_PLAYERS, MAX_STREAK, TIMER_MS, fullLifelines, levelOrDefault,
} from './config.js';

// v2 adds the game level and per-player lifelines; v3 adds the random first player, the
// consecutive-answer limit (streak) and the question clock. Older saves are migrated on load.
// Since 1.3.0 the clock stores the time left ({ remaining: ms }) instead of a wall-clock
// deadline; migrateClock converts the old shape. Since 1.4.0 it also stores `savedAt`, the wall
// time (epoch ms) at which `remaining` was measured while the question was revealed: the time
// spent away (Home, another app, a reload) is deducted on return. null = paused / never shown.
// 1.4.0 also adds per-player stats ({ answered, correct, lifelines }) and the game's play time.
export const STATE_VERSION = 3;
export const PHASES = ['handoff', 'spin', 'choose', 'final-intro', 'question', 'won'];

const randomIndex = (n) => Math.floor(Math.random() * n);

export function newClassicGame({ players, timer, categories, level }) {
  const multi = players.length > 1;
  return {
    v: STATE_VERSION,
    players: players.map((p) => ({ name: p.name, color: p.color, charges: {}, lifelines: fullLifelines(), stats: emptyPlayerStats() })),
    current: multi ? randomIndex(players.length) : 0, // SPEC: the starting player is drawn at random
    phase: multi ? 'handoff' : 'spin',
    first: multi, // show "Starts: {name}" on the first handoff
    streak: 0, // correct answers in a row in the current turn
    timer: !!timer,
    level: levelOrDefault(level),
    categories,
    used: {},
    pending: null, // { id, cat, order, final, fx: { removed, struck, armed }, clock: { remaining } }
    resume: null, // phase to restore after the handoff shown when a saved game is resumed
    asked: 0,
    winner: null,
    startedAt: Date.now(),
    playMs: 0, // time spent playing (screens of this game on display), for the victory screen
  };
}

/** Per-player counters shown on the victory screen. */
export const emptyPlayerStats = () => ({ answered: 0, correct: 0, lifelines: 0 });
const isValidPlayerStats = (st) => isObj(st) && isInt(st.answered) && isInt(st.correct, 0, st.answered) && isInt(st.lifelines, 0, 3);

// Shape checks shared with the quick game's saved run.
export const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export const isInt = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max;
export const isPermutation = (a, n) => Array.isArray(a) && a.length === n && [...Array(n).keys()].every((i) => a.includes(i));
const optIndexes = (a, max = 3) => Array.isArray(a) && a.length <= max && a.every((i) => isInt(i, 1, 3)) && new Set(a).size === a.length;
/**
 * Lifeline effects on a question ({ removed, struck, armed }); null/undefined means none yet.
 * Atium removes at most 2 wrong options; Stormlight strikes at most 1 (and is no longer armed
 * then); the two can't be combined on one question, so their effects never coexist.
 */
export function isValidFx(fx) {
  if (fx === undefined || fx === null) return true;
  if (!isObj(fx) || !optIndexes(fx.removed, 2) || !optIndexes(fx.struck, 1) || typeof fx.armed !== 'boolean') return false;
  if (fx.removed.some((i) => fx.struck.includes(i))) return false;
  if (fx.armed && fx.struck.length) return false;
  if (fx.removed.length && (fx.armed || fx.struck.length)) return false;
  return true;
}
/**
 * Question countdown ({ remaining: ms left, 0..TIMER_MS, savedAt: epoch ms | null }); null/undefined
 * means not started. `savedAt` set = the question was revealed and its time keeps running.
 */
export const isValidClock = (c) => c === undefined || c === null
  || (isObj(c) && isInt(c.remaining, 0, TIMER_MS) && (c.savedAt === undefined || c.savedAt === null || typeof c.savedAt === 'number'));
/** Converts a pre-1.3 clock ({ deadline: epoch ms }) to the time it had left. Other shapes are left as they are. */
export function migrateClock(c) {
  if (!isObj(c) || 'remaining' in c || !('deadline' in c)) return c;
  if (c.deadline === null) return null; // never started
  if (!Number.isFinite(c.deadline)) return c; // garbage: validation rejects it
  return { remaining: Math.max(0, Math.min(TIMER_MS, Math.round(c.deadline - Date.now()))), savedAt: null };
}

/**
 * Time left on a clock now, deducting the wall time elapsed since it was saved while running.
 * A negative or unreadable elapsed time counts as 0 (a clock moved backwards gives nothing back).
 */
export function clockLeft(c, now = Date.now()) {
  if (!isObj(c) || !isInt(c.remaining, 0, TIMER_MS)) return TIMER_MS;
  if (typeof c.savedAt !== 'number') return c.remaining;
  let away = now - c.savedAt;
  if (!Number.isFinite(away) || away < 0) away = 0;
  return Math.max(0, Math.round(c.remaining - away));
}
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
  if (isObj(s.pending) && 'clock' in s.pending) s.pending.clock = migrateClock(s.pending.clock);
  if (Array.isArray(s.players)) {
    for (const p of s.players) {
      if (!isObj(p)) continue;
      if (!('stats' in p)) p.stats = emptyPlayerStats(); // saves from before 1.4.0
      if (!isObj(p.lifelines)) continue;
      for (const k of LIFELINES) if (!isInt(p.lifelines[k], 0, 1)) p.lifelines[k] = 0;
    }
    // Multi-player turns end at MAX_STREAK correct answers, so a higher streak can't be real.
    if (s.players.length > 1 && s.streak >= MAX_STREAK) s.streak = 0;
  }
  if (!isInt(s.playMs)) s.playMs = 0;
  if (s.phase !== 'won') s.winner = null;
  return s;
}

function isValidPlayer(p) {
  return isObj(p) && typeof p.name === 'string' && p.name.length <= 64 && CATEGORIES.includes(p.color)
    && isObj(p.charges) && Object.entries(p.charges).every(([c, n]) => CATEGORIES.includes(c) && isInt(n, 0, CHARGES_TO_INFUSE))
    && isValidLifelines(p.lifelines) && isValidPlayerStats(p.stats);
}

function isValidPending(p, categories) {
  if (p === null || p === undefined) return true;
  if (!isObj(p) || typeof p.id !== 'string' || !p.id || !CATEGORIES.includes(p.cat) || !categories.includes(p.cat)) return false;
  if (!isPermutation(p.order, 4) || typeof p.final !== 'boolean') return false;
  return isValidFx(p.fx) && isValidClock(p.clock);
}

/** Deep check of a (migrated) saved game. Anything odd means the save is discarded. */
export function isValidState(s) {
  try {
    if (!isObj(s) || s.v !== STATE_VERSION) return false;
    if (!Array.isArray(s.players) || s.players.length < 1 || s.players.length > MAX_PLAYERS) return false;
    if (!s.players.every(isValidPlayer)) return false;
    if (new Set(s.players.map((p) => p.color)).size !== s.players.length) return false; // colors are unique
    if (!isInt(s.current, 0, s.players.length - 1)) return false;
    if (!Array.isArray(s.categories) || !s.categories.length || !s.categories.every((c) => CATEGORIES.includes(c))
      || new Set(s.categories).size !== s.categories.length) return false;
    if (!PHASES.includes(s.phase)) return false;
    if (!isValidPending(s.pending, s.categories)) return false;
    if (s.phase === 'question' && !s.pending) return false;
    if (s.phase === 'won' && !isInt(s.winner, 0, s.players.length - 1)) return false;
    if (s.phase === 'handoff' && s.resume === 'question' && !s.pending) return false;
    // A player with every gem infused only plays the final question, and only they get one.
    const ready = allInfused(s, s.players[s.current]);
    const phase = s.phase === 'handoff' ? (s.resume || null) : s.phase;
    if (s.pending && s.pending.final !== ready) return false;
    if (ready && (phase === 'spin' || phase === 'choose')) return false;
    if (!ready && phase === 'final-intro') return false;
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
