// Classic-mode rules (SPEC §2), kept free of DOM code.
import { CHARGES_TO_INFUSE, LIFELINES, fullLifelines, levelOrDefault } from './config.js';

// v2 adds the game level and per-player lifelines; v1 saves are migrated on load.
export const STATE_VERSION = 2;

export function newClassicGame({ players, timer, categories, level }) {
  return {
    v: STATE_VERSION,
    players: players.map((p) => ({ name: p.name, color: p.color, charges: {}, lifelines: fullLifelines() })),
    current: 0,
    phase: players.length > 1 ? 'handoff' : 'spin',
    timer: !!timer,
    level: levelOrDefault(level),
    categories,
    used: {},
    pending: null, // { id, cat, order, final, fx: { removed, struck, armed } }
    asked: 0,
    winner: null,
    startedAt: Date.now(),
  };
}

/** Upgrades an older saved game in place (v1 → v2: level Normal, full lifelines). */
export function migrateState(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.v === 1) s.v = 2;
  if (s.v !== STATE_VERSION) return s;
  s.level = levelOrDefault(s.level);
  if (Array.isArray(s.players)) {
    for (const p of s.players) {
      if (!p || typeof p !== 'object') continue;
      if (!p.lifelines || typeof p.lifelines !== 'object') p.lifelines = fullLifelines();
      for (const k of LIFELINES) if (!Number.isInteger(p.lifelines[k]) || p.lifelines[k] < 0) p.lifelines[k] = 0;
    }
  }
  return s;
}

export function isValidState(s) {
  return s && s.v === STATE_VERSION && Array.isArray(s.players) && s.players.length >= 1
    && s.players.length <= 6 && Number.isInteger(s.current) && s.current < s.players.length
    && Array.isArray(s.categories) && typeof s.phase === 'string';
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

/**
 * Applies the answer to the pending question and moves the game forward.
 * Returns a description of what happened, for the feedback message.
 */
export function applyAnswer(state, correct) {
  const p = state.players[state.current];
  const { cat, final } = state.pending;
  const result = { correct, final, cat, player: p.name, gained: false, infused: false, alreadyInfused: false, won: false };
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
    state.phase = startPhase(state);
    return result;
  }
  // Wrong (or timed out): turn passes.
  state.current = (state.current + 1) % state.players.length;
  result.next = state.players[state.current].name;
  state.phase = state.players.length > 1 ? 'handoff' : startPhase(state);
  return result;
}
