// Achievements ("Logros"), pure part (no DOM, no storage): the list, the stored-state sanitizer and
// the rules. Everything is local: nothing is sent anywhere. Each achievement has a gem (category
// cut and color, see icons.gemSvg) and either
//  - a `check(ctx)` evaluated against the player's progress (stats, discovered questions, daily
//    challenge, languages played), so progress made before 1.6.0 counts too; or
//  - `event: true`: unlocked by a moment in a game (core.unlockAchievement(id)).
// Names and descriptions live in i18n under `ach.<id>.name` / `ach.<id>.desc`. Names only use
// terms whose glossary status is `official` in each language (or generic wording).
import { CATEGORIES, LIFELINES, LANGS } from './config.js';

export const QUICK_SCORE_GOAL = 2000;
export const ANSWERED_GOAL = 100;
export const RADIANT_WINS = 5;
export const POLYGLOT_LANGS = 3;

const answered = (s) => CATEGORIES.reduce((n, c) => n + (s.cats[c]?.a || 0), 0);

/** In display order. `gem`: category whose gem represents it. */
export const ACHIEVEMENTS = [
  { id: 'firstWin', gem: 'roshar', check: (x) => x.stats.classicGames >= 1 },
  { id: 'radiant', gem: 'roshar', check: (x) => x.stats.classicGames >= RADIANT_WINS, goal: (x) => [x.stats.classicGames, RADIANT_WINS] },
  { id: 'fullTable', gem: 'otros', event: true },
  { id: 'flawless', gem: 'sel', event: true },
  { id: 'expertPure', gem: 'scadrial', event: true },
  { id: 'quickPerfect', gem: 'nalthis', event: true },
  { id: 'quickScore', gem: 'nalthis', check: (x) => x.stats.bestQuick >= QUICK_SCORE_GOAL, goal: (x) => [x.stats.bestQuick, QUICK_SCORE_GOAL] },
  { id: 'allWorlds', gem: 'cosmere', check: (x) => CATEGORIES.every((c) => (x.stats.cats[c]?.c || 0) > 0), goal: (x) => [CATEGORIES.filter((c) => (x.stats.cats[c]?.c || 0) > 0).length, CATEGORIES.length] },
  { id: 'answered100', gem: 'sel', check: (x) => answered(x.stats) >= ANSWERED_GOAL, goal: (x) => [answered(x.stats), ANSWERED_GOAL] },
  { id: 'allLifelines', gem: 'otros', check: (x) => LIFELINES.every((k) => (x.stats.lifelines[k] || 0) > 0), goal: (x) => [LIFELINES.filter((k) => (x.stats.lifelines[k] || 0) > 0).length, LIFELINES.length] },
  { id: 'stormlightSave', gem: 'roshar', event: true },
  { id: 'compendium', gem: 'sel', check: (x) => x.collection.worlds.some((w) => w.total > 0 && w.seen >= w.total), goal: (x) => { const w = bestWorld(x.collection); return w ? [w.seen, w.total] : null; } },
  { id: 'halfCosmere', gem: 'cosmere', check: (x) => x.collection.total > 0 && x.collection.seen * 2 >= x.collection.total, goal: (x) => [x.collection.seen, Math.ceil(x.collection.total / 2)] },
  { id: 'polyglot', gem: 'otros', check: (x) => x.langs.length >= POLYGLOT_LANGS, goal: (x) => [x.langs.length, POLYGLOT_LANGS] },
  { id: 'dailyFirst', gem: 'nalthis', check: (x) => x.daily.played >= 1 },
  { id: 'dailyPerfect', gem: 'scadrial', check: (x) => x.daily.perfect >= 1 },
  { id: 'dailyStreak3', gem: 'cosmere', check: (x) => x.daily.best >= 3, goal: (x) => [x.daily.best, 3] },
  { id: 'dailyStreak10', gem: 'scadrial', check: (x) => x.daily.best >= 10, goal: (x) => [x.daily.best, 10] },
  { id: 'missedClear', gem: 'sel', event: true },
];
export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** The world closest to being complete (for the "compendium" progress line). */
function bestWorld(col) {
  const ws = col.worlds.filter((w) => w.total > 0);
  if (!ws.length) return null;
  return ws.reduce((a, b) => (b.seen / b.total > a.seen / a.total ? b : a));
}

// ---------- stored state: { unlocked: { id: epoch ms }, langs: [lang, …] } ----------
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export const emptyAchievements = () => ({ unlocked: {}, langs: [] });

/** Keeps only known ids with a sane timestamp and known languages. */
export function sanitizeAchievements(s) {
  const out = emptyAchievements();
  if (!isObj(s)) return out;
  if (isObj(s.unlocked)) {
    for (const id of ACHIEVEMENT_IDS) {
      const v = s.unlocked[id];
      if (Number.isInteger(v) && v >= 0 && v <= 8.64e15) out.unlocked[id] = v;
    }
  }
  if (Array.isArray(s.langs)) out.langs = LANGS.filter((l) => s.langs.includes(l));
  return out;
}

/**
 * Ids of the `check` achievements that `ctx` now satisfies and `state` doesn't have yet.
 * ctx = { stats (sanitized), collection: { seen, total, worlds: [{ cat, seen, total }] }, daily, langs }.
 */
export function newlyEarned(state, ctx) {
  return ACHIEVEMENTS.filter((a) => a.check && !state.unlocked[a.id] && safe(() => a.check(ctx))).map((a) => a.id);
}

/** [done, goal] for a locked achievement with a measurable goal, or null. */
export function progressOf(id, ctx) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a?.goal) return null;
  const g = safe(() => a.goal(ctx));
  if (!Array.isArray(g)) return null;
  return [Math.min(g[0], g[1]), g[1]];
}

function safe(fn) { try { return fn(); } catch { return null; } }
