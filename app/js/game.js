// Classic-mode rules (SPEC §2), kept free of DOM code.
import {
  CATEGORIES, CHARGES_TO_INFUSE, LIFELINES, LEVEL_IDS, MAX_PLAYERS, MAX_STREAK, TIMER_MS, fullLifelines, levelOrDefault,
} from './config.js';
import { cleanIds } from './progress.js';

// v2 adds the game level and per-player lifelines; v3 adds the random first player, the
// consecutive-answer limit (streak) and the question clock. Older saves are migrated on load.
// Since 1.3.0 the clock stores the time left ({ remaining: ms }) instead of a wall-clock
// deadline; migrateClock converts the old shape. Since 1.4.0 it also stores `savedAt`, the wall
// time (epoch ms) at which `remaining` was measured while the question was revealed: the time
// spent away (Home, another app, a reload) is deducted on return. null = paused / never shown.
// 1.4.0 also adds per-player stats ({ answered, correct, lifelines }) and the game's play time.
// v4 (2.0.0) adds the "full round" option (beta 4, lead decision 3): `fullRound`, the starting
// player (`starter`), the players who answered the final right (`winners`) and the players still
// to play in the closing round (`roundLeft`, null while nobody has won).
export const STATE_VERSION = 4;
export const PHASES = ['handoff', 'spin', 'choose', 'final-intro', 'question', 'won'];

const randomIndex = (n) => Math.floor(Math.random() * n);

export function newClassicGame({ players, timer, categories, level, fullRound = true }) {
  const multi = players.length > 1;
  const current = multi ? randomIndex(players.length) : 0; // SPEC: the starting player is drawn at random
  return {
    v: STATE_VERSION,
    // `auto` (beta 6, item 4): the player left the name empty, so `name` is the default "Player n"
    // of the current language (localizeAutoNames refreshes it after a language change).
    players: players.map((p) => ({ name: p.name, ...(p.auto ? { auto: true } : {}), color: p.color, charges: {}, lifelines: fullLifelines(), stats: emptyPlayerStats() })),
    current,
    starter: current, // a round runs from this player to the one before them
    fullRound: multi && fullRound !== false, // after a right final, the rest of the round still plays
    winners: [], // players who answered the final right (several when they share the victory)
    roundLeft: null, // closing round: players still to play their turn after the first right final
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
    winner: null, // the first winner (kept for older code paths); see `winners`
    startedAt: Date.now(),
    playMs: 0, // time spent playing (screens of this game on display), for the victory screen
    missed: [], // ids answered wrong in this game, for "Review mistakes" on the victory screen (1.5.0)
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
 * Question countdown ({ remaining: ms left, 0..TIMER_MS, savedAt: epoch ms | null, mono?, sid? });
 * null/undefined means not started. `savedAt` set = the question was revealed and its time keeps
 * running. Beta 6 (item 2): `mono` is performance.now() at the same moment and `sid` the page
 * session (SESSION_ID) it belongs to, so time away within one page session is measured with the
 * monotonic clock and a system clock moved back gives nothing back; after a reload (another
 * session) only the wall time is left.
 */
const isTime = (n) => Number.isFinite(n) && n >= 0;
export const isValidClock = (c) => c === undefined || c === null
  || (isObj(c) && isInt(c.remaining, 0, TIMER_MS)
    && (c.savedAt === undefined || c.savedAt === null || isTime(c.savedAt))
    && (c.mono === undefined || isTime(c.mono))
    && (c.sid === undefined || (typeof c.sid === 'string' && c.sid.length <= 40)));
/** Converts a pre-1.3 clock ({ deadline: epoch ms }) to the time it had left. Other shapes are left as they are. */
export function migrateClock(c) {
  if (!isObj(c) || 'remaining' in c || !('deadline' in c)) return c;
  if (c.deadline === null) return null; // never started
  if (!Number.isFinite(c.deadline)) return c; // garbage: validation rejects it
  return { remaining: Math.max(0, Math.min(TIMER_MS, Math.round(c.deadline - Date.now()))), savedAt: null };
}

/** This page load (a reload is another session): tags clocks whose `mono` can be compared. */
export const SESSION_ID = (() => {
  try { return Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('-'); } catch { return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
})();
const monoNow = () => (typeof performance !== 'undefined' ? performance.now() : NaN);

/**
 * Marks clock `c` as measured now (savedAt + mono + sid), or paused (`running` false: savedAt null).
 * Mutates and returns it.
 */
export function stampClock(c, running = true, now = Date.now(), mono = monoNow()) {
  c.savedAt = running ? now : null;
  if (running && isTime(mono)) { c.mono = mono; c.sid = SESSION_ID; } else { delete c.mono; delete c.sid; }
  return c;
}

/**
 * Time left on a clock now, deducting the time elapsed since it was saved while running.
 * Same page session (`sid` = SESSION_ID): the larger of the monotonic and the wall elapsed time
 * (moving the system clock back gives nothing back; a device asleep, where performance.now() may
 * stop, still counts by the wall clock). Another session (a reload): the wall time only. A
 * negative or unreadable elapsed time counts as 0.
 */
export function clockLeft(c, now = Date.now(), mono = monoNow()) {
  if (!isObj(c) || !isInt(c.remaining, 0, TIMER_MS)) return TIMER_MS;
  if (typeof c.savedAt !== 'number') return c.remaining;
  const pos = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  let away = pos(now - c.savedAt);
  if (c.sid === SESSION_ID && typeof c.mono === 'number') away = Math.max(away, pos(mono - c.mono));
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
  if (s.v === 3) {
    // Games started before 2.0.0 keep their rules: the first right final wins at once.
    s.fullRound = false;
    s.starter = isInt(s.current) ? s.current : 0;
    s.winners = s.phase === 'won' && isInt(s.winner) ? [s.winner] : [];
    s.roundLeft = null;
    s.v = 4;
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
  s.missed = cleanIds(s.missed); // saves from before 1.5.0 have none
  if (typeof s.fullRound !== 'boolean') s.fullRound = false;
  if (Array.isArray(s.players) && s.players.length < 2) s.fullRound = false;
  if (!isInt(s.starter, 0, Array.isArray(s.players) ? Math.max(0, s.players.length - 1) : 0)) s.starter = 0;
  if (s.winners === undefined) s.winners = [];
  if (s.roundLeft === undefined) s.roundLeft = null;
  if (s.phase !== 'won') s.winner = null;
  return s;
}

/**
 * Gives every player without a chosen name (`auto`) the default name `nameOf(index)` of the
 * current language (beta 6, item 4: "Jugador 1" becomes "Player 1" after switching to English).
 * Mutates the state; returns true when a name changed.
 */
export function localizeAutoNames(state, nameOf) {
  let changed = false;
  state?.players?.forEach((p, i) => {
    if (p?.auto !== true) return;
    const name = nameOf(i);
    if (typeof name === 'string' && name && name !== p.name) { p.name = name; changed = true; }
  });
  return changed;
}

const indexList = (a, n) => Array.isArray(a) && a.every((i) => isInt(i, 0, n - 1)) && new Set(a).size === a.length;

function isValidPlayer(p) {
  return isObj(p) && typeof p.name === 'string' && p.name.length <= 64 && CATEGORIES.includes(p.color)
    && (p.auto === undefined || typeof p.auto === 'boolean')
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
    // Full round (v4): winners and the closing round must agree with each other and the turn.
    const n = s.players.length;
    if (typeof s.fullRound !== 'boolean' || (s.fullRound && n < 2) || !isInt(s.starter, 0, n - 1)) return false;
    if (!indexList(s.winners, n)) return false;
    if (s.roundLeft !== null && (!s.fullRound || !s.winners.length || !indexList(s.roundLeft, n)
      || s.roundLeft.some((i) => s.winners.includes(i) || i === s.current))) return false;
    if (s.phase === 'won' && (!s.winners.length || s.winners[0] !== s.winner)) return false;
    if (s.phase !== 'won' && s.winners.length && (s.roundLeft === null || s.winners.includes(s.current))) return false;
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

/** A classic game with 2+ players: it doesn't feed personal stats, "My mistakes" or individual achievements. */
export const isGroupGame = (state) => (state?.players?.length || 0) > 1;

/** Players who still play in this round after `state.current` (up to the one before the starter). */
export function roundRest(state) {
  const n = state.players.length;
  const out = [];
  for (let i = (state.current + 1) % n; i !== state.starter && out.length < n; i = (i + 1) % n) out.push(i);
  return out;
}

function endGame(state, result) {
  state.winner = state.winners[0];
  state.roundLeft = null;
  state.phase = 'won';
  result.won = true;
  result.winners = [...state.winners];
}

function passTurn(state, result) {
  state.streak = 0;
  if (state.roundLeft) {
    // Closing round: only the players left in it play, then the game ends.
    if (!state.roundLeft.length) { result.roundOver = true; endGame(state, result); return; }
    state.current = state.roundLeft.shift();
  } else state.current = (state.current + 1) % state.players.length;
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
  const result = { correct, final, cat, player: p.name, gained: false, infused: false, alreadyInfused: false, won: false, streakEnd: false, finalWin: false, shared: false, roundOver: false };
  state.pending = null;
  state.asked++;

  if (correct && final) {
    state.winners = [...(state.winners || []), state.current];
    result.finalWin = true;
    result.shared = state.winners.length > 1;
    // Full round (lead decision 3): the players left in this round still play their turn, and
    // whoever also answers the final right shares the victory.
    if (state.fullRound && state.players.length > 1) {
      if (state.roundLeft === null) state.roundLeft = roundRest(state);
      if (state.roundLeft.length) { result.roundGoesOn = !result.shared; passTurn(state, result); return result; }
      result.roundOver = result.shared;
    }
    endGame(state, result);
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

/** True while a full round is closing after someone answered the final right: nobody gets another turn. */
export function isClosingRound(state) {
  return Boolean(state && state.fullRound && state.roundLeft != null && Array.isArray(state.winners) && state.winners.length > 0);
}
