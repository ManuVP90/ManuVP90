#!/usr/bin/env node
// Unit tests of the game engine (Node only: node:test + node:assert, no browser, no dependencies).
// Usage: node tools/unit.mjs            (node --test tools/unit.mjs also works)
//
// Pure modules (no DOM) are imported directly: config.js, data.js, game.js, text.js, works.js, i18n.js.
// The save validators that live in DOM modules (quick run in screens/quick.js, classic load in
// screens/classic.js, settings and the recently-seen ring buffer in core.js) are reached through
// their exported loaders with a minimal in-memory `window.localStorage` / `document` stub
// (installed only for that section, after the pure tests are defined).
//
// Not covered here (DOM-bound, covered by tools/smoke.mjs and tools/edge.mjs in a real browser):
//  - lifeline *application* rules in components/question.js (Atium picks 2 wrong options,
//    Stormlight strike/retry, Atium/Stormlight exclusivity in the UI, Breath carrying an armed
//    Stormlight): only the resulting effect shape (isValidFx) is tested here;
//  - pointsFor / quick scoring flow and screen transitions (screens/quick.js, classic.js);
//  - the timer countdown (performance.now) in components/question.js; clockLeft/migrateClock are tested;
//  - i18n.t() / setLang() (need fetch); matchLang is tested.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORIES, LEVELS, LEVEL_IDS, LIFELINES, MAX_STREAK, TIMER_MS, RECENT_MAX, QUICK_MAX_SCORE, fullLifelines, levelOrDefault,
} from '../app/js/config.js';
import { recordDaily, canPlayDaily, currentStreak, emptyDaily, shareText, HIT_MARK, MISS_MARK } from '../app/js/daily.js';
import { Pool, quickPlan, nearestDifficulty, shuffle, shuffledOrder } from '../app/js/data.js';
import {
  STATE_VERSION, newClassicGame, migrateState, isValidState, applyAnswer, isValidFx, isValidClock, isValidLifelines,
  clockLeft, migrateClock, allInfused, isInfused, startPhase, isGroupGame, roundRest, isClosingRound,
  stampClock, SESSION_ID, localizeAutoNames,
} from '../app/js/game.js';
import { readFileSync } from 'node:fs';
import { graphemes, initialOf, cleanName, limitGraphemes, NAME_MAX } from '../app/js/text.js';
import { mergeIdMaps } from '../app/js/progress.js';
import { ALL_WORKS, WORK_TITLES, workTitle } from '../app/js/works.js';
import { matchLang } from '../app/js/i18n.js';

// ---------- helpers ----------
const realRandom = Math.random;
function seed(s) {
  let a = s >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Synthetic questions. spec: { cat: { d: count } } ; works cycle through `works` (per category).
 * ids: <cat>-d<d>-<n>
 */
function makeQuestions(spec, works = ['way-of-kings']) {
  const out = [];
  for (const [c, ds] of Object.entries(spec)) {
    let n = 0;
    for (const [d, count] of Object.entries(ds)) {
      for (let i = 0; i < count; i++) {
        out.push({ id: `${c}-d${d}-${i}`, c, d: Number(d), w: works[n++ % works.length], q: `Q ${c} ${d} ${i}`, o: ['a', 'b', 'c', 'd'], x: '' });
      }
    }
  }
  return out;
}
const full = (n) => ({ 1: n, 2: n, 3: n, 4: n });
const tally = (arr) => arr.reduce((o, k) => { o[k] = (o[k] || 0) + 1; return o; }, {});

/** A recency tracker like core.makePool's (rank -1 = not seen lately; higher = more recent). */
function tracker(list = []) {
  const rank = new Map(list.map((id, i) => [id, i]));
  let top = list.length;
  return { rank: (id) => (rank.has(id) ? rank.get(id) : -1), add: (id) => { rank.set(id, top++); } };
}

const P2 = [{ name: 'Ana', color: 'roshar' }, { name: 'Bo', color: 'sel' }];
function game(players = P2, opts = {}) {
  seed(1);
  const s = newClassicGame({ players, timer: true, categories: [...CATEGORIES], level: 'normal', ...opts });
  return s;
}
const pend = (cat, final = false) => ({ id: `${cat}-d1-0`, cat, order: [0, 1, 2, 3], final, fx: null, clock: null });
const infuseAll = (p, cats = CATEGORIES) => { for (const c of cats) p.charges[c] = 2; };
const clone = (o) => JSON.parse(JSON.stringify(o));

// =====================================================================================
describe('config', () => {
  test('levels: weights over difficulties 1-4, final difficulty in range', () => {
    for (const id of LEVEL_IDS) {
      const { weights, final } = LEVELS[id];
      assert.ok(Object.keys(weights).every((d) => [1, 2, 3, 4].includes(Number(d))), id);
      assert.ok(Object.values(weights).every((w) => w > 0), id);
      assert.ok([1, 2, 3, 4].includes(final), id);
    }
    assert.deepEqual(LEVELS.normal.weights, { 1: 40, 2: 40, 3: 20 });
    assert.equal(levelOrDefault('bogus'), 'normal');
    assert.equal(levelOrDefault('expert'), 'expert');
  });
  test('fullLifelines: one of each', () => {
    assert.deepEqual(fullLifelines(), Object.fromEntries(LIFELINES.map((k) => [k, 1])));
  });
});

// =====================================================================================
describe('leveled draws and weights', () => {
  const qs = makeQuestions({ roshar: full(400) });
  const freq = (level, n = 3000) => {
    seed(42);
    const pool = new Pool(qs);
    const ds = [];
    for (let i = 0; i < n; i++) { pool.used = {}; ds.push(pool.drawLeveled('roshar', level).d); }
    return Object.fromEntries(Object.entries(tally(ds)).map(([d, k]) => [d, k / n]));
  };
  const close = (got, want, tol = 0.04) => {
    for (const d of [1, 2, 3, 4]) {
      const w = (want[d] || 0) / 100;
      assert.ok(Math.abs((got[d] || 0) - w) <= tol, `d${d}: got ${(got[d] || 0).toFixed(3)}, want ${w}`);
    }
  };
  test('easy draws only difficulty 1', () => close(freq('easy'), LEVELS.easy.weights, 0));
  test('normal ≈ 40/40/20', () => close(freq('normal'), LEVELS.normal.weights));
  test('hard ≈ 20/40/40', () => close(freq('hard'), LEVELS.hard.weights));
  test('expert ≈ 30/70', () => close(freq('expert'), LEVELS.expert.weights));
  test('unknown level behaves like normal', () => close(freq('nonsense', 2000), LEVELS.normal.weights));

  test('drawAnyLeveled weights categories by their questions', () => {
    seed(3);
    const pool = new Pool(makeQuestions({ roshar: full(30), sel: full(10) }));
    const cats = [];
    for (let i = 0; i < 4000; i++) { pool.used = {}; cats.push(pool.drawAnyLeveled('normal').c); }
    const t = tally(cats);
    assert.ok(Math.abs(t.roshar / 4000 - 0.75) < 0.04, JSON.stringify(t));
    assert.equal(t.scadrial, undefined);
  });

  test('no repeats in a category until every candidate was used, never twice in a row', () => {
    seed(5);
    const pool = new Pool(makeQuestions({ sel: { 1: 6 } }));
    const first = Array.from({ length: 6 }, () => pool.draw('sel').id);
    assert.equal(new Set(first).size, 6);
    const next = pool.draw('sel').id;
    assert.notEqual(next, first[5], 'the question asked last does not come straight back');
    assert.equal(pool.recycled, true);
  });

  test('drawAny is uniform per question across categories', () => {
    seed(9);
    const pool = new Pool(makeQuestions({ roshar: { 1: 1 }, sel: { 1: 9 } }));
    const ids = Array.from({ length: 10 }, () => pool.drawAny().id);
    assert.equal(new Set(ids).size, 10, 'every question once before any repeat');
  });
});

// =====================================================================================
describe('fallback when a difficulty is exhausted or missing', () => {
  test('hard without difficulty-4 data draws 3 (and 2), never null', () => {
    seed(11);
    const pool = new Pool(makeQuestions({ nalthis: { 1: 50, 2: 50, 3: 50 } }));
    const ds = Array.from({ length: 300 }, () => { pool.used = {}; return pool.drawLeveled('nalthis', 'hard').d; });
    assert.ok(ds.every((d) => d === 2 || d === 3), JSON.stringify(tally(ds)));
    assert.ok(tally(ds)[3] > tally(ds)[2], 'the weight of 4 goes to 3');
  });
  test('easy with difficulty 1 used up falls back to 2', () => {
    seed(12);
    const pool = new Pool(makeQuestions({ sel: { 1: 3, 2: 5, 3: 5 } }));
    const ds = Array.from({ length: 8 }, () => pool.drawLeveled('sel', 'easy').d);
    assert.deepEqual(ds.slice(0, 3), [1, 1, 1]);
    assert.deepEqual(ds.slice(3), [2, 2, 2, 2, 2], 'one step outside the level, never 3');
  });
  test('easy with 1 and 2 used up takes unused harder questions before repeating any (beta 4, M1)', () => {
    seed(13);
    const pool = new Pool(makeQuestions({ sel: { 1: 2, 2: 2, 3: 3 } }));
    const qs = Array.from({ length: 7 }, () => pool.drawLeveled('sel', 'easy'));
    assert.deepEqual(qs.map((q) => q.d), [1, 1, 2, 2, 3, 3, 3], 'the level first, then the nearest unused difficulty');
    assert.equal(new Set(qs.map((q) => q.id)).size, 7, 'no repeat while an unused question exists');
  });
  test('beta 4 M1: Easy with a narrow filter (cosmere 1 + 4) never serves the same question twice in a row', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      seed(s);
      const pool = new Pool(makeQuestions({ cosmere: { 1: 1, 4: 1 } }));
      const ids = Array.from({ length: 12 }, () => pool.drawLeveled('cosmere', 'easy').id);
      assert.equal(ids[0], 'cosmere-d1-0', 'the level\'s own question first');
      assert.equal(ids[1], 'cosmere-d4-0', 'then the unused one, even outside the range');
      for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `seed ${s}: draw ${i} repeats the previous question`);
    }
  });
  test('beta 4 M1: recycling never returns the question asked last when another exists (also with a stored `used`)', () => {
    seed(21);
    const pool = new Pool(makeQuestions({ sel: { 1: 1, 2: 1, 3: 1 } }));
    pool.used = { sel: ['sel-d3-0', 'sel-d2-0', 'sel-d1-0'] }; // everything asked, d1 last
    for (let i = 0; i < 20; i++) {
      const last = pool.used.sel.at(-1);
      const q = pool.drawLeveled('sel', 'easy');
      assert.notEqual(q.id, last, `draw ${i}`);
    }
    const one = new Pool(makeQuestions({ sel: { 1: 1 } }));
    assert.equal(one.drawLeveled('sel', 'easy').id, 'sel-d1-0');
    assert.equal(one.drawLeveled('sel', 'easy').id, 'sel-d1-0', 'a single question still comes back (nothing else exists)');
  });
  test('expert with no 3/4 in a category draws 2', () => {
    seed(14);
    const pool = new Pool(makeQuestions({ otros: { 1: 5, 2: 5 } }));
    assert.equal(pool.drawLeveled('otros', 'expert').d, 2);
  });
  test('a category with a single difficulty far from the level still returns a question', () => {
    seed(15);
    const pool = new Pool(makeQuestions({ otros: { 1: 3 } }));
    assert.equal(pool.drawLeveled('otros', 'expert').d, 1);
    assert.equal(pool.drawLeveled('roshar', 'expert'), null, 'empty category → null');
  });
  test('nearestDifficulty: ties go inside the level, then harder if asked', () => {
    seed(16);
    assert.equal(nearestDifficulty(4, { 1: 1, 2: 1, 3: 1 }), 3);
    assert.equal(nearestDifficulty(2, { 1: 1, 3: 1 }, { 3: 50 }), 3);
    assert.equal(nearestDifficulty(2, { 1: 1, 3: 1 }, null, true), 3);
    assert.equal(nearestDifficulty(2, {}), null);
  });
  test('drawFinal: target difficulty, nearest (harder on ties) when missing, unused first', () => {
    seed(17);
    let pool = new Pool(makeQuestions({ roshar: { 1: 5, 2: 5, 3: 5 } }));
    assert.equal(pool.drawFinal(['roshar'], 4).d, 3);
    pool = new Pool(makeQuestions({ roshar: { 2: 5, 4: 5 } }));
    assert.equal(pool.drawFinal(['roshar'], 3).d, 4, 'tie between 2 and 4 → harder');
    pool = new Pool(makeQuestions({ roshar: { 3: 3 } }));
    pool.used = { roshar: ['roshar-d3-0', 'roshar-d3-1'] };
    assert.equal(pool.drawFinal(['roshar'], 3).id, 'roshar-d3-2', 'prefers the one not asked in the game');
  });
  test('drawFinal falls back to an asked question when every one was used', () => {
    seed(18);
    const pool = new Pool(makeQuestions({ roshar: { 3: 2 } }));
    pool.used = { roshar: ['roshar-d3-0', 'roshar-d3-1'] };
    assert.ok(pool.drawFinal(['roshar'], 3));
  });
});

// =====================================================================================
describe('daily challenge: no replay, share text (beta 4)', () => {
  const marks = (n) => Array.from({ length: 5 }, (_, i) => ({ c: CATEGORIES[i], ok: i < n }));
  test('M3: a date at or before the last challenge played can never be played again', () => {
    let s = emptyDaily();
    assert.equal(canPlayDaily(s, '2026-10-20'), true, 'nothing played yet');
    s = recordDaily(s, { date: '2026-10-20', lang: 'es', marks: marks(3) });
    assert.equal(canPlayDaily(s, '2026-10-20'), false, 'same day');
    assert.equal(canPlayDaily(s, '2026-10-19'), false, 'clock moved back one day (or a trip west)');
    assert.equal(canPlayDaily(s, '2025-01-01'), false, 'clock moved back a year');
    assert.equal(canPlayDaily(s, '2026-10-21'), true, 'the next day');
    // An older run finished late counts but neither moves `last` back nor replaces the result.
    const late = recordDaily(s, { date: '2026-10-18', lang: 'es', marks: marks(5) });
    assert.equal(late.last, '2026-10-20'); assert.equal(late.result.date, '2026-10-20'); assert.equal(late.played, 2);
    assert.equal(canPlayDaily(late, '2026-10-19'), false);
  });
  test('M3: the streak is not broken while the device date is at or before the last challenge', () => {
    let s = recordDaily(emptyDaily(), { date: '2026-10-19', lang: 'es', marks: marks(1) });
    s = recordDaily(s, { date: '2026-10-20', lang: 'es', marks: marks(1) });
    assert.equal(currentStreak(s, '2026-10-17'), 2);
    assert.equal(currentStreak(s, '2026-10-21'), 2);
    assert.equal(currentStreak(s, '2026-10-22'), 0);
  });
  test('share text: one check or cross per question, the date as given (localized by the caller)', () => {
    const txt = shareText({ title: 'T', date: '21 de octubre de 2026', marks: [{ c: 'scadrial', ok: false }, { c: 'cosmere', ok: true }, { c: 'roshar', ok: true }], streakLabel: 'S', filteredLabel: 'F' });
    assert.equal(txt, `T · 21 de octubre de 2026\n${MISS_MARK}${HIT_MARK}${HIT_MARK} 2/3\nS\nF`);
    assert.equal(HIT_MARK, '✅'); assert.equal(MISS_MARK, '❌');
    assert.ok(!/[🟦🟥🟩🟨🟪⬜⬛]/u.test(txt), 'no world squares that read as hit/miss');
  });
});

describe('spoiler filter', () => {
  const qs = makeQuestions({ roshar: full(4), sel: { 1: 4 } }, ['way-of-kings', 'oathbringer']);
  test('disabled works never come out of any draw', () => {
    seed(21);
    const pool = new Pool(qs, ['oathbringer']);
    for (let i = 0; i < 200; i++) {
      for (const q of [pool.drawAny(), pool.drawAnyLeveled('hard'), pool.drawLeveled('roshar', 'easy'), pool.drawFinal(undefined, 3)]) {
        assert.notEqual(q.w, 'oathbringer');
      }
    }
    assert.equal(pool.size(), qs.filter((q) => q.w !== 'oathbringer').length);
  });
  test('a category left empty disappears from categories()', () => {
    const pool = new Pool(makeQuestions({ roshar: { 1: 2 }, sel: { 1: 2 } }).map((q) => ({ ...q, w: q.c === 'sel' ? 'elantris' : 'way-of-kings' })), ['elantris']);
    assert.deepEqual(pool.categories(), ['roshar']);
    assert.equal(pool.draw('sel'), null);
    assert.equal(pool.get('sel-d1-0'), null);
    assert.ok(pool.getAny('sel-d1-0'), 'getAny still finds a filtered question (pending question survives a filter change)');
  });
  test('everything filtered: no categories, quick plan empty, draws null', () => {
    const pool = new Pool(qs, ['way-of-kings', 'oathbringer']);
    assert.deepEqual(pool.categories(), []);
    assert.deepEqual(quickPlan(pool, 'normal', 15), []);
    assert.equal(pool.drawAny(), null);
    assert.equal(pool.drawAnyLeveled('normal'), null);
    assert.equal(pool.drawFinal([], 3), null);
  });
});

// =====================================================================================
describe('quick plan', () => {
  test('slots proportional to the questions each world offers (largest remainder)', () => {
    seed(31);
    const pool = new Pool(makeQuestions({ roshar: { 1: 30 }, sel: { 1: 10 } }));
    const plan = quickPlan(pool, 'easy', 15);
    assert.equal(plan.length, 15);
    assert.deepEqual(tally(plan), { roshar: 11, sel: 4 });
  });
  test('all six worlds with the real distribution share 15 slots fairly', () => {
    seed(32);
    const spec = Object.fromEntries(CATEGORIES.map((c) => [c, c === 'nalthis' ? { 1: 16, 2: 16, 3: 16, 4: 12 } : full(20)]));
    const plan = quickPlan(new Pool(makeQuestions(spec)), 'normal', 15);
    const t = tally(plan);
    assert.equal(plan.length, 15);
    for (const c of CATEGORIES) assert.ok(t[c] >= 2 && t[c] <= 3, `${c}: ${t[c]}`);
  });
  test('never more slots than a world has questions; total capped at the pool', () => {
    seed(33);
    const pool = new Pool(makeQuestions({ roshar: { 1: 2 }, sel: { 3: 1 } }));
    const plan = quickPlan(pool, 'easy', 15);
    assert.equal(plan.length, 3);
    assert.deepEqual(tally(plan), { roshar: 2, sel: 1 });
  });
  test('a run following the plan never repeats a question (drawUnseen)', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      seed(s);
      const pool = new Pool(makeQuestions({ roshar: { 1: 3, 2: 2 }, sel: { 1: 4 }, nalthis: { 4: 2 } }));
      const plan = quickPlan(pool, 'normal', 15);
      const seen = new Set();
      for (const c of plan) {
        const q = pool.drawUnseen(c, 'normal', seen);
        assert.ok(q, `seed ${s}: plan slot ${c} had a question`);
        assert.ok(!seen.has(q.id), `seed ${s}: ${q.id} repeated`);
        seen.add(q.id);
      }
      assert.equal(seen.size, plan.length);
    }
  });
  test('Breath alternative: same category and difficulty, not seen in the run', () => {
    seed(34);
    const pool = new Pool(makeQuestions({ sel: { 2: 3, 3: 3 } }));
    const q = pool.getAny('sel-d2-0');
    const seen = new Set(['sel-d2-0', 'sel-d2-1']);
    assert.equal(pool.hasAlternative(q, seen), true);
    assert.equal(pool.drawAlternative(q, seen).id, 'sel-d2-2');
    seen.add('sel-d2-2');
    assert.equal(pool.hasAlternative(q, seen), false);
    assert.equal(pool.drawAlternative(q, seen), null);
  });
});

// =====================================================================================
describe('recently seen questions (across games)', () => {
  test('draws prefer questions not seen lately', () => {
    seed(41);
    const ids = Array.from({ length: 10 }, (_, i) => `sel-d1-${i}`);
    const pool = new Pool(makeQuestions({ sel: { 1: 10 } }), [], {}, tracker(ids.slice(0, 8)));
    const got = [pool.draw('sel').id, pool.draw('sel').id].sort();
    assert.deepEqual(got, ['sel-d1-8', 'sel-d1-9']);
  });
  test('then the least recently seen one', () => {
    seed(42);
    const order = ['sel-d1-3', 'sel-d1-1', 'sel-d1-0', 'sel-d1-2']; // 3 is the oldest
    const pool = new Pool(makeQuestions({ sel: { 1: 4 } }), [], {}, tracker(order));
    assert.deepEqual([pool.draw('sel').id, pool.draw('sel').id, pool.draw('sel').id], ['sel-d1-3', 'sel-d1-1', 'sel-d1-0']);
  });
  test('leveled and unseen draws also prefer the not-seen-lately ones', () => {
    seed(43);
    const recent = makeQuestions({ roshar: { 1: 20 } }).map((q) => q.id).slice(0, 19);
    for (let i = 0; i < 20; i++) {
      const pool = new Pool(makeQuestions({ roshar: { 1: 20 } }), [], {}, tracker(recent));
      assert.equal(pool.drawLeveled('roshar', 'easy').id, 'roshar-d1-19');
      const pool2 = new Pool(makeQuestions({ roshar: { 1: 20 } }), [], {}, tracker(recent));
      assert.equal(pool2.drawUnseen('roshar', 'easy', new Set()).id, 'roshar-d1-19');
    }
  });
});

// =====================================================================================
describe('save validation and migration (classic)', () => {
  test('a new game is valid; solo starts on spin, multi on a handoff', () => {
    const s = game();
    assert.equal(s.v, STATE_VERSION);
    assert.equal(isValidState(s), true);
    assert.equal(s.phase, 'handoff');
    assert.equal(s.first, true);
    const solo = game([{ name: 'Solo', color: 'otros' }]);
    assert.equal(solo.phase, 'spin');
    assert.equal(solo.current, 0);
    assert.equal(isValidState(solo), true);
  });
  test('the starting player is drawn at random', () => {
    const starters = new Set();
    for (let i = 0; i < 40; i++) {
      seed(100 + i);
      starters.add(newClassicGame({ players: [...P2, { name: 'C', color: 'otros' }], timer: false, categories: [...CATEGORIES], level: 'easy' }).current);
    }
    assert.deepEqual([...starters].sort(), [0, 1, 2]);
  });
  test('valid saves in each phase', () => {
    const base = game();
    const variants = [
      { phase: 'spin' }, { phase: 'choose' }, { phase: 'question', pending: pend('sel') },
      { phase: 'handoff', resume: 'question', pending: pend('roshar') },
      { phase: 'question', pending: { ...pend('sel'), fx: { removed: [1, 2], struck: [], armed: false }, clock: { remaining: 12000, savedAt: Date.now() } } },
      { phase: 'question', pending: { ...pend('sel'), fx: { removed: [], struck: [3], armed: false }, clock: { remaining: 0, savedAt: null } } },
      { phase: 'won', winner: 1, winners: [1] },
      { phase: 'won', winner: 1, winners: [1, 0] },
    ];
    for (const v of variants) assert.equal(isValidState({ ...clone(base), ...v }), true, JSON.stringify(v));
    const fin = clone(base);
    fin.phase = 'final-intro';
    infuseAll(fin.players[fin.current]);
    assert.equal(isValidState(fin), true);
    assert.equal(isValidState({ ...fin, phase: 'question', pending: pend('sel', true) }), true);
  });
  test('v1 save migrates to v4: level normal, full lifelines, streak 0, stats added, no full round', () => {
    const v1 = { v: 1, players: [{ name: 'Ana', color: 'roshar', charges: { roshar: 1 } }, { name: 'Bo', color: 'sel', charges: {} }],
      current: 1, phase: 'spin', timer: true, categories: [...CATEGORIES], used: {}, pending: null, asked: 3, winner: null };
    const s = migrateState(clone(v1));
    assert.equal(s.v, 4);
    assert.equal(s.fullRound, false);
    assert.deepEqual([s.starter, s.winners, s.roundLeft], [1, [], null]);
    assert.equal(s.level, 'normal');
    assert.equal(s.streak, 0);
    assert.equal(s.first, false);
    for (const p of s.players) { assert.deepEqual(p.lifelines, fullLifelines()); assert.deepEqual(p.stats, { answered: 0, correct: 0, lifelines: 0 }); }
    assert.equal(isValidState(s), true);
  });
  test('v2 save keeps its level and lifelines', () => {
    const v2 = { ...clone(game()), v: 2, level: 'hard' };
    delete v2.streak; delete v2.first;
    v2.players[0].lifelines = { atium: 0, stormlight: 1, breath: 1 };
    const s = migrateState(v2);
    assert.equal(s.level, 'hard');
    assert.deepEqual(s.players[0].lifelines, { atium: 0, stormlight: 1, breath: 1 });
    assert.equal(isValidState(s), true);
  });
  test('light normalization: bad level/streak/used/resume/asked get safe defaults', () => {
    const s = migrateState({ ...clone(game()), level: 'insane', streak: 99, used: { roshar: [1, 2] }, resume: 'nope', asked: -1, playMs: 'x' });
    assert.equal(s.level, 'normal');
    assert.equal(s.streak, 0);
    assert.deepEqual(s.used, {});
    assert.equal(s.resume, null);
    assert.equal(s.asked, 0);
    assert.equal(s.playMs, 0);
    assert.equal(isValidState(s), true);
  });
  test('a lifeline count out of range is invalid as stored and spent (0) after migration', () => {
    const s = clone(game());
    s.players[0].lifelines.atium = 2;
    assert.equal(isValidState(s), false);
    migrateState(s);
    assert.equal(s.players[0].lifelines.atium, 0);
    assert.equal(isValidState(s), true);
  });
  test('pre-1.3 clock deadline is converted', () => {
    const now = Date.now();
    const c = migrateClock({ deadline: now + 10000 });
    assert.ok(c.remaining > 9000 && c.remaining <= 10000);
    assert.equal(c.savedAt, null);
    assert.equal(migrateClock({ deadline: null }), null);
    assert.equal(migrateClock({ deadline: now - 99999 }).remaining, 0);
    assert.deepEqual(migrateClock({ remaining: 5 }), { remaining: 5 });
    const s = migrateState({ ...clone(game()), phase: 'question', pending: { ...pend('sel'), clock: { deadline: now + 5000 } } });
    assert.equal(isValidState(s), true);
  });
  test('clockLeft deducts time away, never gives time back', () => {
    const now = 1_000_000;
    assert.equal(clockLeft({ remaining: 20000, savedAt: now - 5000 }, now), 15000);
    assert.equal(clockLeft({ remaining: 20000, savedAt: now + 5000 }, now), 0, 'clock moved back across a reload: timed out, never time back (beta 6b N2)');
    assert.equal(clockLeft({ remaining: 20000, savedAt: now + 1500 }, now), 20000, 'small NTP correction tolerated');
    assert.equal(clockLeft({ remaining: 3000, savedAt: now - 60000 }, now), 0);
    assert.equal(clockLeft({ remaining: 7000, savedAt: null }, now), 7000, 'paused');
    assert.equal(clockLeft(null, now), TIMER_MS);
    assert.equal(clockLeft({ remaining: 'x' }, now), TIMER_MS);
    assert.equal(clockLeft({ remaining: 7000, savedAt: NaN }, now), 7000);
  });

  const invalid = {
    'null': () => null,
    'array': () => [],
    'string': () => 'save',
    'number': () => 42,
    'future version': (s) => ({ ...s, v: 99 }),
    'no players': (s) => ({ ...s, players: [] }),
    '7 players': (s) => ({ ...s, players: Array.from({ length: 7 }, (_, i) => ({ ...s.players[0], color: CATEGORIES[i % 6] })) }),
    'player not an object': (s) => ({ ...s, players: [s.players[0], 'Bo'] }),
    'player name not a string': (s) => { s.players[0].name = 5; return s; },
    'player name too long': (s) => { s.players[0].name = 'x'.repeat(65); return s; },
    'unknown color': (s) => { s.players[0].color = '#fff'; return s; },
    'duplicate colors': (s) => { s.players[1].color = s.players[0].color; return s; },
    'charges above 2': (s) => { s.players[0].charges.roshar = 3; return s; },
    'negative charges': (s) => { s.players[0].charges.roshar = -1; return s; },
    'charges in unknown category': (s) => { s.players[0].charges.mars = 1; return s; },
    'lifelines missing': (s) => { s.players[0].lifelines = null; return s; },
    'stats missing fields': (s) => { s.players[0].stats = { answered: 1 }; return s; },
    'stats correct > answered': (s) => { s.players[0].stats = { answered: 1, correct: 2, lifelines: 0 }; return s; },
    'current out of range': (s) => ({ ...s, current: 2 }),
    'current negative': (s) => ({ ...s, current: -1 }),
    'current not integer': (s) => ({ ...s, current: 0.5 }),
    'no categories': (s) => ({ ...s, categories: [] }),
    'unknown category': (s) => ({ ...s, categories: ['roshar', 'mars'] }),
    'duplicate category': (s) => ({ ...s, categories: ['roshar', 'roshar'] }),
    'unknown phase': (s) => ({ ...s, phase: 'dance' }),
    'question without pending': (s) => ({ ...s, phase: 'question', pending: null }),
    'won without winner': (s) => ({ ...s, phase: 'won', winner: null }),
    'handoff to a question without pending': (s) => ({ ...s, phase: 'handoff', resume: 'question', pending: null }),
    'pending category not in game': (s) => ({ ...s, categories: ['roshar'], phase: 'question', pending: pend('sel') }),
    'pending order not a permutation': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), order: [0, 0, 1, 2] } }),
    'pending id empty': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), id: '' } }),
    'pending final not boolean': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), final: 'no' } }),
    'final question for a player without all gems': (s) => ({ ...s, phase: 'question', pending: pend('sel', true) }),
    'normal question for a player with all gems': (s) => { infuseAll(s.players[s.current]); return { ...s, phase: 'question', pending: pend('sel') }; },
    'spin for a player with all gems': (s) => { infuseAll(s.players[s.current]); return { ...s, phase: 'spin' }; },
    'final-intro without all gems': (s) => ({ ...s, phase: 'final-intro' }),
    'fx removes 3 options': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), fx: { removed: [1, 2, 3], struck: [], armed: false } } }),
    'fx removes the correct option': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), fx: { removed: [0, 1], struck: [], armed: false } } }),
    'fx atium + stormlight together': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), fx: { removed: [1, 2], struck: [], armed: true } } }),
    'clock above 30 s': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), clock: { remaining: TIMER_MS + 1 } } }),
    'clock negative': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), clock: { remaining: -1 } } }),
    'clock savedAt string': (s) => ({ ...s, phase: 'question', pending: { ...pend('sel'), clock: { remaining: 100, savedAt: 'now' } } }),
  };
  for (const [name, mutate] of Object.entries(invalid)) {
    test(`rejects: ${name}`, () => {
      const s = mutate(clone(game()));
      assert.equal(isValidState(migrateState(s)), false);
    });
  }
  test('migrateState and isValidState never throw on garbage', () => {
    for (const g of [undefined, null, 0, '', [], {}, { v: 1 }, { v: 2, players: 'x' }, { v: 3, players: [null] }, { v: 3, players: [{}], categories: null }]) {
      assert.doesNotThrow(() => isValidState(migrateState(g)));
      assert.equal(isValidState(migrateState(g)), false);
    }
  });
});

// =====================================================================================
describe('applyAnswer rules', () => {
  const ask = (s, cat, correct, final = false) => { s.phase = 'question'; s.pending = pend(cat, final); return applyAnswer(s, correct); };

  test('correct answer: +1 charge, keeps playing; second infuses the gem', () => {
    const s = game(); s.current = 0; s.phase = 'spin';
    let r = ask(s, 'roshar', true);
    assert.equal(r.gained, true); assert.equal(r.charges, 1); assert.equal(r.infused, false);
    assert.equal(s.current, 0); assert.equal(s.phase, 'spin'); assert.equal(s.streak, 1);
    r = ask(s, 'roshar', true);
    assert.equal(r.infused, true); assert.equal(isInfused(s.players[0], 'roshar'), true);
    assert.equal(s.asked, 2); assert.equal(s.pending, null);
    assert.equal(isValidState(s), true);
  });
  test('correct answer on an infused gem gains nothing', () => {
    const s = game(); s.current = 0; s.players[0].charges.sel = 2;
    const r = ask(s, 'sel', true);
    assert.equal(r.alreadyInfused, true); assert.equal(r.gained, false); assert.equal(s.players[0].charges.sel, 2);
  });
  test('wrong answer passes the turn to the next player (handoff), streak reset', () => {
    const s = game(); s.current = 1; s.streak = 2;
    const r = ask(s, 'sel', false);
    assert.equal(r.correct, false); assert.equal(s.current, 0); assert.equal(s.phase, 'handoff');
    assert.equal(s.streak, 0); assert.equal(r.next, 'Ana');
    assert.equal(isValidState(s), true);
  });
  test(`streak limit: the turn passes after ${MAX_STREAK} correct answers with 2+ players`, () => {
    const s = game(); s.current = 0;
    for (let i = 1; i < MAX_STREAK; i++) assert.equal(ask(s, CATEGORIES[i], true).streakEnd, false);
    const r = ask(s, 'cosmere', true);
    assert.equal(r.streakEnd, true); assert.equal(r.gained, true);
    assert.equal(s.current, 1); assert.equal(s.phase, 'handoff'); assert.equal(s.streak, 0);
  });
  test('solo: no streak limit', () => {
    const s = game([{ name: 'Solo', color: 'roshar' }]);
    for (let i = 0; i < 8; i++) assert.equal(ask(s, CATEGORIES[i % 6], true).streakEnd, false);
    assert.equal(s.phase, 'spin'); assert.equal(s.current, 0);
    ask(s, 'roshar', false);
    assert.equal(s.current, 0, 'solo keeps the turn after a miss'); assert.equal(s.phase, 'spin');
  });
  test('last gem on the 3rd answer in a row: streak ends and the final comes on the next turn', () => {
    const s = game(); s.current = 0;
    infuseAll(s.players[0], CATEGORIES.slice(0, 5)); s.players[0].charges.cosmere = 1; s.streak = 2;
    const r = ask(s, 'cosmere', true);
    assert.equal(r.infused, true); assert.equal(r.allInfused, true); assert.equal(r.streakEnd, true);
    assert.equal(s.current, 1); assert.equal(s.phase, 'handoff');
    assert.equal(isValidState(s), true);
    s.current = 0; // back to Ana
    assert.equal(startPhase(s), 'final-intro');
  });
  test('last gem without hitting the limit goes straight to final-intro', () => {
    const s = game(); s.current = 0;
    infuseAll(s.players[0], CATEGORIES.slice(0, 5)); s.players[0].charges.cosmere = 1;
    const r = ask(s, 'cosmere', true);
    assert.equal(r.allInfused, true); assert.equal(s.phase, 'final-intro'); assert.equal(s.current, 0);
    assert.equal(isValidState(s), true);
  });
  test('final question (full round off): right answer wins, wrong passes the turn', () => {
    let s = game(P2, { fullRound: false }); s.current = 0; infuseAll(s.players[0]);
    let r = ask(s, 'sel', true, true);
    assert.equal(r.won, true); assert.equal(s.phase, 'won'); assert.equal(s.winner, 0);
    assert.equal(isValidState(s), true);
    s = game(P2, { fullRound: false }); s.current = 0; infuseAll(s.players[0]);
    r = ask(s, 'sel', false, true);
    assert.equal(r.won, false); assert.equal(s.current, 1); assert.equal(s.winner, null);
    assert.equal(isValidState(s), true);
  });
  test('allInfused only counts the game categories (filtered worlds)', () => {
    const s = game(P2, { categories: ['roshar', 'sel'] });
    infuseAll(s.players[0], ['roshar', 'sel']);
    assert.equal(allInfused(s, s.players[0]), true);
    assert.equal(allInfused({ categories: [] }, s.players[0]), false);
  });
});

// =====================================================================================
describe('full round and group games (2.0.0, lead decisions 2 and 3)', () => {
  const P4 = [...P2, { name: 'Cy', color: 'nalthis' }, { name: 'Di', color: 'otros' }];
  const ask = (s, cat, correct, final = false) => { s.phase = 'question'; s.pending = pend(cat, final); return applyAnswer(s, correct); };
  /** A 4-player game started by `starter`, with `current` holding every gem. */
  const setup = (starter, current, opts = {}) => {
    const s = game(P4, opts); s.starter = starter; s.current = current; infuseAll(s.players[current]); s.phase = 'final-intro';
    return s;
  };

  test('defaults: on with 2+ players, never solo; the starter is the random first player', () => {
    const s = game(P4);
    assert.equal(s.fullRound, true); assert.equal(s.starter, s.current);
    assert.deepEqual([s.winners, s.roundLeft], [[], null]);
    assert.equal(game(P4, { fullRound: false }).fullRound, false);
    assert.equal(game([{ name: 'Solo', color: 'roshar' }]).fullRound, false);
    assert.equal(isValidState(s), true);
  });
  test('isGroupGame: 2+ players only', () => {
    assert.equal(isGroupGame(game(P2)), true);
    assert.equal(isGroupGame(game([{ name: 'Solo', color: 'roshar' }])), false);
    assert.equal(isGroupGame(null), false);
  });
  test('roundRest: the players after the current one, up to the one before the starter', () => {
    assert.deepEqual(roundRest({ ...setup(1, 1) }), [2, 3, 0]);
    assert.deepEqual(roundRest({ ...setup(1, 3) }), [0]);
    assert.deepEqual(roundRest({ ...setup(1, 0) }), []);
    assert.deepEqual(roundRest({ ...setup(0, 0) }), [1, 2, 3]);
  });
  test('a right final with players left in the round: they play on, then one who also answers right shares the victory', () => {
    const s = setup(0, 1); // Bo (2nd in the round) answers the final right; Cy and Di still play
    let r = ask(s, 'sel', true, true);
    assert.equal(r.finalWin, true); assert.equal(r.won, false); assert.equal(r.roundGoesOn, true); assert.equal(r.shared, false);
    assert.deepEqual(s.winners, [1]); assert.deepEqual(s.roundLeft, [3]); assert.equal(s.current, 2); assert.equal(s.phase, 'handoff');
    assert.equal(r.next, 'Cy');
    assert.equal(isValidState(s), true);
    // Cy misses an ordinary question: the turn goes to Di (the last of the round), not back to Ana.
    s.phase = 'spin';
    r = ask(s, 'roshar', false);
    assert.equal(r.won, false); assert.equal(s.current, 3); assert.deepEqual(s.roundLeft, []); assert.equal(r.next, 'Di');
    assert.equal(isValidState(s), true);
    // Di has every gem and answers the final right: shared victory, the round is over.
    infuseAll(s.players[3]);
    r = ask(s, 'cosmere', true, true);
    assert.equal(r.won, true); assert.equal(r.shared, true); assert.equal(r.roundOver, true);
    assert.deepEqual(s.winners, [1, 3]); assert.deepEqual(r.winners, [1, 3]); assert.equal(s.winner, 1);
    assert.equal(s.phase, 'won'); assert.equal(s.roundLeft, null);
    assert.equal(isValidState(s), true);
  });
  test('the closing round ends after the last player even on a miss or a 3-answer streak: one winner', () => {
    let s = setup(2, 0); // Ana answers right; only Bo is left (Cy started)
    ask(s, 'sel', true, true);
    assert.deepEqual([s.current, s.roundLeft], [1, []]);
    s.phase = 'spin';
    let r = ask(s, 'roshar', false);
    assert.equal(r.won, true); assert.equal(r.roundOver, true); assert.equal(r.shared, false); assert.deepEqual(s.winners, [0]);
    s = setup(2, 0);
    ask(s, 'sel', true, true);
    s.phase = 'spin';
    for (let i = 0; i < MAX_STREAK - 1; i++) assert.equal(ask(s, CATEGORIES[i], true).won, false);
    r = ask(s, 'nalthis', true);
    assert.equal(r.streakEnd, true); assert.equal(r.won, true); assert.equal(r.roundOver, true);
  });
  test('the last player of the round answering the final right wins at once; full round off wins at once', () => {
    let s = setup(1, 0); // Ana is the last of the round started by Bo
    let r = ask(s, 'sel', true, true);
    assert.equal(r.won, true); assert.equal(r.roundOver, false); assert.deepEqual(s.winners, [0]);
    s = setup(0, 0, { fullRound: false });
    r = ask(s, 'sel', true, true);
    assert.equal(r.won, true); assert.deepEqual(s.winners, [0]);
  });
  test('validation of the new fields and migration of a 1.6 (v3) save', () => {
    const s = setup(0, 1);
    ask(s, 'sel', true, true);
    const ok = clone(s);
    assert.equal(isValidState(ok), true);
    const bad = [
      { fullRound: 'yes' }, { starter: 9 }, { starter: -1 }, { winners: [1, 1] }, { winners: [7] }, { winners: 'x' },
      { roundLeft: [1] }, { roundLeft: [2] }, { roundLeft: [3, 3] }, { roundLeft: [9] }, { roundLeft: [3], winners: [] },
      { roundLeft: null }, { fullRound: false }, { phase: 'won', winner: 0, winners: [1] }, { phase: 'won', winner: 1, winners: [] },
    ];
    for (const b of bad) assert.equal(isValidState({ ...clone(ok), ...b }), false, JSON.stringify(b));
    assert.equal(isValidState({ ...game([{ name: 'Solo', color: 'roshar' }]), fullRound: true }), false, 'solo can\'t have a full round');
    // A 1.6.0 save in progress (v3): the old rules stay (first right final wins), nothing else changes.
    const v3 = { ...clone(game(P4)), v: 3, current: 2 };
    for (const k of ['fullRound', 'starter', 'winners', 'roundLeft']) delete v3[k];
    const m = migrateState(v3);
    assert.equal(m.v, STATE_VERSION);
    assert.deepEqual([m.fullRound, m.starter, m.winners, m.roundLeft], [false, 2, [], null]);
    assert.equal(isValidState(m), true);
    // Odd values in a v4 save get safe defaults only where that is harmless.
    const odd = migrateState({ ...clone(game(P4)), fullRound: 1, starter: 'x' });
    assert.deepEqual([odd.fullRound, odd.starter], [false, 0]);
    assert.equal(isValidState(odd), true);
  });
});

// =====================================================================================
describe('lifeline effects validation', () => {
  const ok = [null, undefined,
    { removed: [], struck: [], armed: false },
    { removed: [1, 3], struck: [], armed: false }, // Atium
    { removed: [], struck: [], armed: true }, // Stormlight armed
    { removed: [], struck: [2], armed: false }, // Stormlight spent on a wrong pick
  ];
  const bad = [
    'fx', [], {}, { removed: [1], struck: [] }, // armed missing
    { removed: [1, 2, 3], struck: [], armed: false }, // more than 2 removed
    { removed: [0, 1], struck: [], armed: false }, // the correct option (0) removed
    { removed: [1, 1], struck: [], armed: false }, // duplicate
    { removed: [], struck: [1, 2], armed: false }, // two strikes
    { removed: [], struck: [0], armed: false }, // struck the correct one
    { removed: [], struck: [1], armed: true }, // still armed after a strike
    { removed: [1, 2], struck: [], armed: true }, // Atium + armed Stormlight
    { removed: [1], struck: [2], armed: false }, // Atium + spent Stormlight
    { removed: [1.5], struck: [], armed: false },
    { removed: ['1'], struck: [], armed: false },
    { removed: [], struck: [], armed: 'yes' },
  ];
  for (const fx of ok) test(`valid fx ${JSON.stringify(fx)}`, () => assert.equal(isValidFx(fx), true));
  for (const fx of bad) test(`invalid fx ${JSON.stringify(fx)}`, () => assert.equal(isValidFx(fx), false));
  test('lifeline counts are 0 or 1 of each', () => {
    assert.equal(isValidLifelines(fullLifelines()), true);
    assert.equal(isValidLifelines({ atium: 0, stormlight: 0, breath: 0 }), true);
    for (const l of [null, [], {}, { atium: 1, stormlight: 1 }, { atium: 2, stormlight: 1, breath: 1 }, { atium: -1, stormlight: 1, breath: 1 }, { atium: '1', stormlight: 1, breath: 1 }]) {
      assert.equal(isValidLifelines(l), false, JSON.stringify(l));
    }
  });
  test('clock shape', () => {
    for (const c of [null, undefined, { remaining: 0 }, { remaining: TIMER_MS, savedAt: null }, { remaining: 5, savedAt: 123 }]) assert.equal(isValidClock(c), true);
    for (const c of [{}, { remaining: -1 }, { remaining: TIMER_MS + 1 }, { remaining: 1.5 }, { remaining: 5, savedAt: '1' }, 'x']) assert.equal(isValidClock(c), false);
  });
});

// =====================================================================================
describe('helpers: shuffle, text, works, language matching', () => {
  test('shuffle returns a permutation and leaves the input alone', () => {
    seed(51);
    const a = [1, 2, 3, 4, 5];
    const b = shuffle(a);
    assert.deepEqual(a, [1, 2, 3, 4, 5]);
    assert.deepEqual([...b].sort(), a);
    const o = shuffledOrder();
    assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
  });
  test('grapheme-aware initials and names', () => {
    assert.equal(initialOf('kaladin'), 'K');
    assert.equal(initialOf('  élan'), 'É');
    assert.equal(initialOf('👨‍👩‍👧 Family'), '👨‍👩‍👧');
    assert.equal(initialOf('🇪🇸 Spain'), '🇪🇸');
    assert.equal(initialOf(''), '?');
    assert.equal(initialOf(null, '-'), '-');
    assert.equal(graphemes('a👍🏽b').length, 3);
    assert.equal(cleanName('  Shallan  '), 'Shallan');
    assert.equal(cleanName('x\uD83D'), 'x', 'lone surrogate removed');
    assert.equal(cleanName('🙂'.repeat(30), 24), '🙂'.repeat(24));
  });
  test('work titles exist for every work and language, with English fallback', () => {
    for (const l of ['es', 'en', 'fr', 'de', 'it']) {
      for (const id of ALL_WORKS) assert.ok(workTitle(id, l), `${l}/${id}`);
      assert.ok(WORK_TITLES[l], l);
    }
    assert.equal(workTitle('way-of-kings', 'xx'), 'The Way of Kings');
    assert.equal(workTitle('nope', 'es'), 'nope');
  });
  test('language matching (ca/gl/eu → es)', () => {
    assert.equal(matchLang('es-ES'), 'es');
    assert.equal(matchLang('ca-ES-valencia'), 'es');
    assert.equal(matchLang('gl'), 'es');
    assert.equal(matchLang('EU_es'), 'es');
    assert.equal(matchLang('de-AT'), 'de');
    assert.equal(matchLang('pt-BR'), null);
    assert.equal(matchLang(undefined), null);
  });
});

// =====================================================================================
// "Report this question" (app/js/report.js, pure). Skipped if the module is not there.
describe('report question link', async () => {
  let report = null;
  try { report = await import('../app/js/report.js'); } catch { /* module not present in this version */ }
  const cfg = await import('../app/js/config.js');
  const q = { id: 'roshar-001', c: 'roshar', d: 1, q: '¿Qué cuadrilla dirige Kaladin?', o: ['Puente Cuatro', 'Puente Dos', 'Puente Diecisiete', 'Puente Dieciocho'], x: 'Explicación.' };
  test('prefilled issue with id, language, question and the issue template', { skip: !report && 'app/js/report.js not present' }, () => {
    const r = report.buildReport(q, { lang: 'es', version: '9.9.9', labels: { describe: '¿Qué está mal?' } });
    assert.ok(r.title.includes('roshar-001'));
    assert.ok(r.body.includes('roshar-001') && r.body.includes('es') && r.body.includes(q.q) && r.body.includes('¿Qué está mal?'));
    assert.ok(r.url.startsWith(cfg.REPORT_URL));
    assert.ok(r.url.includes(`template=${encodeURIComponent(cfg.REPORT_TEMPLATE)}`));
    assert.ok(r.url.length <= report.REPORT_MAX_URL);
  });
  test('very long texts still give a URL under the limit', { skip: !report && 'app/js/report.js not present' }, () => {
    const long = { ...q, q: '🙂'.repeat(5000), o: q.o.map((o) => o.repeat(500)), x: 'x'.repeat(9000) };
    const r = report.buildReport(long, { lang: 'de' });
    assert.ok(r.url.length <= report.REPORT_MAX_URL, String(r.url.length));
    assert.ok(r.body.includes('roshar-001'));
    assert.ok(!/[\uD800-\uDBFF]$/.test(r.title), 'no half emoji');
  });
  test('2.0.0: the body is fully in the reporter\'s language (no Spanish/English mix); English by default', { skip: !report && 'app/js/report.js not present' }, () => {
    const labels = { id: 'ID', language: 'Sprache', world: 'Welt', difficulty: 'Schwierigkeit', mode: 'Modus', version: 'Version', question: 'Frage', explanation: 'Erklärung', describe: 'Was ist falsch?', worldName: 'Roschar', modeName: 'Klassisches Spiel' };
    const r = report.buildReport(q, { lang: 'de', version: '2.0.0', mode: 'classic', labels });
    for (const part of ['**Sprache:** de', '**Welt:** Roschar · **Schwierigkeit:** 1', '**Modus:** Klassisches Spiel', '**Version:** 2.0.0', `**Frage:** ${q.q}`, '**Erklärung:** Explicación.', '**Was ist falsch?**']) assert.ok(r.body.includes(part), part);
    assert.ok(!/Idioma|Language|Mundo|Pregunta|Question|Explanation|Versión/.test(r.body), r.body);
    assert.ok(r.text.includes('**Frage:**'));
    const en = report.buildReport(q, { lang: 'en', version: '2.0.0', mode: 'quick' });
    for (const part of ['**Language:** en', '**World:** roshar', '**Mode:** quick', '**Question:**', '**What is wrong?**']) assert.ok(en.body.includes(part), part);
    assert.ok(!/Idioma|Mundo|Pregunta/.test(en.body));
    const fr = report.buildReport(q, { lang: 'fr', version: '2.0.0', labels: { language: 'Langue', format: '{label}\u00a0: {text}' } });
    assert.ok(fr.body.includes('**Langue\u00a0:** fr'), 'French colon with a no-break space');
  });
  test('the issue template the app links to exists', { skip: !cfg.REPORT_TEMPLATE && 'no REPORT_TEMPLATE' }, async () => {
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(new URL(`../.github/ISSUE_TEMPLATE/${cfg.REPORT_TEMPLATE}`, import.meta.url)), cfg.REPORT_TEMPLATE);
  });
});

// =====================================================================================
describe('achievements unreachable under the spoiler filter (2.0.0)', async () => {
  const { isBlocked, ACHIEVEMENTS } = await import('../app/js/achievements.js');
  const world = (cat, seen, total) => ({ cat, seen, total });
  const col = (worlds) => ({ seen: worlds.reduce((n, w) => n + w.seen, 0), total: worlds.reduce((n, w) => n + w.total, 0), worlds });
  const stats = (hit = []) => ({ cats: Object.fromEntries(CATEGORIES.map((c) => [c, { a: 1, c: hit.includes(c) ? 1 : 0 }])) });
  const all = col(CATEGORIES.map((c) => world(c, 0, 10)));
  test('no filter: nothing is blocked', () => {
    const ctx = { stats: stats(), collection: all, filtered: all };
    for (const a of ACHIEVEMENTS) assert.equal(isBlocked(a.id, ctx), false, a.id);
  });
  test('a filter hiding a whole world blocks the six-gem and every-world ones, unless already done', () => {
    const filtered = col(CATEGORIES.map((c) => world(c, 0, c === 'otros' ? 0 : 10)));
    const ctx = { stats: stats(), collection: all, filtered };
    assert.equal(isBlocked('flawless', ctx), true);
    assert.equal(isBlocked('allWorlds', ctx), true);
    assert.equal(isBlocked('allWorlds', { ...ctx, stats: stats(['otros']) }), false, 'a world answered right before still counts');
    assert.equal(isBlocked('compendium', ctx), false, 'another world can still be completed');
    assert.equal(isBlocked('halfCosmere', ctx), false, '50 of 60 still reachable');
    assert.equal(isBlocked('firstWin', ctx), false);
  });
  test('a narrow filter blocks compendium, half the Cosmere and the perfect quick game', () => {
    const filtered = col(CATEGORIES.map((c) => world(c, 0, c === 'sel' ? 4 : 0)));
    const ctx = { stats: stats(), collection: all, filtered };
    for (const id of ['compendium', 'halfCosmere', 'quickPerfect', 'flawless']) assert.equal(isBlocked(id, ctx), true, id);
    // Questions seen before the filter count: a world already discovered but for what the filter allows.
    const seenAll = col(CATEGORIES.map((c) => world(c, c === 'sel' ? 6 : 0, 10)));
    assert.equal(isBlocked('compendium', { ...ctx, collection: seenAll, filtered: col(CATEGORIES.map((c) => world(c, 0, c === 'sel' ? 4 : 0))) }), false);
    assert.equal(isBlocked('compendium', { stats: stats(), collection: all }), false, 'no filter info: never blocked');
  });
});

// =====================================================================================
// Storage-backed validators, reached through DOM modules with an in-memory stub.
describe('stored data through the app loaders (stubbed storage)', () => {
  const mem = new Map();
  let core; let quick; let classic;
  const PREFIX = 'cosmere-trivia:';
  const put = (k, v) => mem.set(PREFIX + k, typeof v === 'string' ? v : JSON.stringify(v));
  const has = (k) => mem.has(PREFIX + k);

  before(async () => {
    const node = () => ({ dataset: {}, style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
    globalThis.window ??= {
      addEventListener() {}, scrollTo() {},
      localStorage: {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
        key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
      },
    };
    globalThis.document ??= { documentElement: node(), querySelector: () => null, getElementById: () => null, createElement: node, createElementNS: node, createTextNode: () => ({}), addEventListener() {} };
    core = await import('../app/js/core.js');
    quick = await import('../app/js/screens/quick.js');
    classic = await import('../app/js/screens/classic.js');
  });

  test('settings: wrong types fall back to defaults', () => {
    const d = core.sanitizeSettings(null);
    assert.equal(d.onboarded, false);
    assert.equal(d.level, 'normal');
    const s = core.sanitizeSettings({ lang: 'xx', theme: 'neon', sound: 'yes', disabledWorks: ['a', 'a', 3, null], level: 'expert', onbStep: 7, onboarded: true });
    assert.equal(s.lang, null); assert.equal(s.theme, 'dark'); assert.equal(s.sound, true);
    assert.deepEqual(s.disabledWorks, ['a']); assert.equal(s.level, 'expert'); assert.equal(s.onbStep, null); assert.equal(s.onboarded, true);
    for (const g of [[], 'x', 5, { disabledWorks: 'all' }]) assert.doesNotThrow(() => core.sanitizeSettings(g));
  });

  test('stats: odd values count as 0, correct ≤ answered', () => {
    put('stats', { classicGames: -3, quickGames: 'many', bestQuick: 1200, cats: { roshar: { a: 2, c: 5 }, sel: 'x' }, lifelines: { atium: 2.5, breath: 4 } });
    const st = core.getStats();
    assert.equal(st.classicGames, 0); assert.equal(st.quickGames, 0); assert.equal(st.bestQuick, 1200);
    assert.deepEqual(st.cats.roshar, { a: 2, c: 2 }); assert.deepEqual(st.cats.sel, { a: 0, c: 0 });
    assert.equal(st.lifelines.atium, 0); assert.equal(st.lifelines.breath, 4);
    put('stats', '{not json'); assert.equal(core.getStats().bestQuick, 0);
  });
  test('stats 2.0.0: group games are a separate counter (missing in older saves → 0; odd → 0; imported)', () => {
    put('stats', { classicGames: 2 });
    assert.equal(core.getStats().groupGames, 0);
    put('stats', { groupGames: -1 }); assert.equal(core.getStats().groupGames, 0);
    put('stats', { groupGames: 4.5 }); assert.equal(core.getStats().groupGames, 0);
    put('stats', { groupGames: 7, classicGames: 1 });
    assert.deepEqual([core.getStats().groupGames, core.getStats().classicGames], [7, 1]);
    assert.equal(core.sanitizeStats({ groupGames: 3 }).groupGames, 3);
  });
  test(`stats: quick records are clamped to the best possible score (${QUICK_MAX_SCORE}), also on import`, () => {
    assert.equal(QUICK_MAX_SCORE, 3000);
    put('stats', { bestQuick: 99999, bestByLevel: { easy: 3001, hard: 2500, expert: 1e9 } });
    const st = core.getStats();
    assert.equal(st.bestQuick, 3000);
    assert.deepEqual(st.bestByLevel, { easy: 3000, normal: 0, hard: 2500, expert: 3000 });
    assert.equal(core.sanitizeStats({ bestQuick: 3000 }).bestQuick, 3000, 'the maximum itself is kept');
    assert.ok(core.importData({ stats: { bestQuick: 123456, bestByLevel: { normal: 5000 } } }));
    const imp = core.getStats();
    assert.equal(imp.bestQuick, 3000); assert.equal(imp.bestByLevel.normal, 3000);
  });

  test(`recently seen: ring buffer of ${RECENT_MAX} per language, most recent last, no duplicates`, () => {
    mem.delete(PREFIX + 'recent');
    for (let i = 0; i < RECENT_MAX + 20; i++) core.noteSeen(`q${i}`);
    core.noteSeen('q30');
    const r = JSON.parse(mem.get(PREFIX + 'recent'));
    const list = Object.values(r)[0];
    assert.equal(list.length, RECENT_MAX);
    assert.equal(list.at(-1), 'q30');
    assert.equal(new Set(list).size, list.length);
    assert.ok(!list.includes('q0'));
  });

  test('makePool uses the recency buffer', () => {
    core.app.questions = makeQuestions({ sel: { 1: 3 } });
    core.app.settings.disabledWorks = [];
    mem.delete(PREFIX + 'recent');
    core.noteSeen('sel-d1-0'); core.noteSeen('sel-d1-1');
    seed(61);
    assert.equal(core.makePool({}).draw('sel').id, 'sel-d1-2');
    core.app.questions = [];
  });

  const run = () => ({ v: 1, plan: ['roshar', 'sel', 'roshar'], index: 1, score: 150, correct: 1, total: 3, level: 'easy',
    lifelines: fullLifelines(), seen: ['roshar-d1-0', 'sel-d1-0'], current: { id: 'sel-d1-0', order: [3, 2, 1, 0], fx: null, clock: { remaining: 9000, savedAt: null } } });
  test('quick run: a valid save is offered', () => {
    put('quick', run());
    const r = quick.loadSavedRun();
    assert.ok(r); assert.equal(r.index, 1);
  });
  const badRuns = {
    'not JSON': '{', 'null': 'null', 'array': [], 'wrong version': { v: 2 }, 'finished': { finished: true },
    'total 0': { total: 0, plan: [] }, 'total 16': { total: 16 }, 'plan length mismatch': { plan: ['roshar'] },
    'unknown world in plan': { plan: ['roshar', 'mars', 'sel'] }, 'index ≥ total': { index: 3 }, 'correct > index': { correct: 2, score: 300 },
    'score too low': { score: 50 }, 'score too high': { score: 201 }, 'unknown level': { level: 'insane' },
    'lifelines 2': { lifelines: { atium: 2, stormlight: 1, breath: 1 } }, 'seen too long': { seen: ['a', 'b', 'c', 'd'] },
    'seen duplicates': { seen: ['a', 'a'] }, 'seen not strings': { seen: [1] }, 'current order bad': { current: { id: 'x', order: [0, 1, 2] } },
    'current fx bad': { current: { id: 'x', order: [0, 1, 2, 3], fx: { removed: [0], struck: [], armed: false } } },
    'current clock bad': { current: { id: 'x', order: [0, 1, 2, 3], clock: { remaining: 99999 } } },
  };
  for (const [name, patch] of Object.entries(badRuns)) {
    test(`quick run rejected and deleted: ${name}`, () => {
      put('quick', typeof patch === 'string' || Array.isArray(patch) ? patch : { ...run(), ...patch });
      assert.equal(quick.loadSavedRun(), null);
      assert.equal(has('quick'), false, 'the unusable save is removed');
    });
  }
  test('quick result must agree with the best score', () => {
    put('stats', { bestQuick: 900 });
    put('quickResult', { score: 900, correct: 5, total: 15, level: 'normal', record: true });
    assert.ok(quick.loadSavedResult());
    put('quickResult', { score: 800, correct: 5, total: 15, level: 'normal', record: true });
    assert.equal(quick.loadSavedResult(), null);
    put('quickResult', { score: 800, correct: 5, total: 15, level: 'normal', record: false });
    assert.ok(quick.loadSavedResult());
    put('quickResult', { score: 950, correct: 5, total: 15, level: 'normal', record: false });
    assert.equal(quick.loadSavedResult(), null, 'not a record but above the best');
  });

  test('classic: a v1 save is migrated and written back as v4', () => {
    put('classic', { v: 1, players: [{ name: 'Ana', color: 'roshar', charges: {} }, { name: 'Bo', color: 'sel', charges: {} }],
      current: 0, phase: 'spin', timer: false, categories: [...CATEGORIES], used: {}, pending: null, asked: 0, winner: null });
    const s = classic.loadSavedGame();
    assert.ok(s); assert.equal(s.v, 4);
    assert.equal(JSON.parse(mem.get(PREFIX + 'classic')).v, 4);
  });
  test('classic: corrupt, invalid or finished saves are deleted', () => {
    for (const bad of ['{oops', 'null', JSON.stringify({ v: 3 }), JSON.stringify({ ...game(), phase: 'won', winner: 0 })]) {
      put('classic', bad);
      assert.equal(classic.loadSavedGame(), null, bad.slice(0, 40));
      assert.equal(has('classic'), false);
    }
  });
  // storage.js keeps a memory copy too, so keys are removed through it.
  const drop = async (...keys) => { const store = await import('../app/js/storage.js'); for (const k of keys) store.remove(k); };
  test('beta 5 decision 1: group-game draws avoid recent questions but never join the collection', async () => {
    await drop('recent', 'seen');
    core.app.questions = makeQuestions({ sel: { 1: 4 } });
    core.app.settings.disabledWorks = [];
    seed(71);
    const solo = core.makePool({}).draw('sel');
    const group = core.makePool({}, { discover: false }).draw('sel');
    assert.notEqual(group.id, solo.id, 'the group draw still avoids the recent one');
    const found = core.getDiscovered();
    assert.ok(found.has(solo.id), 'solo draw discovered');
    assert.ok(!found.has(group.id), 'group draw not discovered');
    assert.deepEqual(Object.values(JSON.parse(mem.get(PREFIX + 'recent')))[0], [solo.id, group.id], 'both in the recent ring');
    assert.equal(core.collection([]).seen, 1, 'collection counts only the solo question');
    core.app.questions = [];
  });
  test('beta 5: players from before 1.6.0 (recent ring, no `seen`) keep it as their collection, once', async () => {
    await drop('recent', 'seen');
    core.app.questions = makeQuestions({ sel: { 1: 4 } });
    put('recent', { en: ['sel-d1-0', 'sel-d1-1'] });
    assert.deepEqual([...core.getDiscovered()].sort(), ['sel-d1-0', 'sel-d1-1'], 'seeded from the ring');
    assert.ok(has('seen'), 'written once');
    core.noteSeen('sel-d1-2', { discover: false });
    assert.equal(core.getDiscovered().size, 2, 'later ring entries (group games) are not merged');
    // A backup from before 1.6.0 (no `seen`) brings its ring into the collection.
    assert.ok(core.importData({ recent: { en: ['sel-d1-3'] } }));
    assert.ok(core.getDiscovered().has('sel-d1-3'));
    core.app.questions = [];
  });
});

process.on('exit', () => { Math.random = realRandom; });

// ============================================================================================
// Glossary merge (tools/merge-glossary.mjs) — beta round 4, m8 + m9. Separate block owned by the
// terminologist; it only reads content files, never writes them.
// ============================================================================================
{
  const M = await import('./merge-glossary.mjs');
  const { readFileSync, existsSync } = await import('node:fs');
  const ROOT = new URL('..', import.meta.url);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fixture = () => ({
    glossary: {
      Raboniel: { es: 'Raboniel', status: { es: 'unchanged' }, notes: 'Proper name. [es] X. [es] X. [es] X.', sources: ['https://coppermind.net', 'https://coppermind.net'] },
      Shardblade: { es: 'Hoja Esquirlada', status: { es: 'official' }, notes: '', sources: ['https://www.penguinlibros.com/es/fantasia/x-el-camino-de-los-reyes (Nova blurb)'] },
      Lone: { es: 'Solo', status: { es: 'official' }, notes: '', sources: [] },
      Jak: { es: 'Alomante Jak', status: { es: 'official' }, notes: '', sources: ['https://tercerafundacion.net/ficha/1 ; https://archive.org/details/arcanum-ilimitado (contents)'] },
    },
    reviews: { es: { Raboniel: { es: 'Rabeniel', status: 'official', sources: ['https://es.coppermind.net/wiki/Rabeniel'], notes: 'page title' } } },
  });

  describe('merge-glossary (beta 4, m8/m9)', () => {
    test('m9: triplicated note segments and duplicated sources collapse to one', () => {
      assert.equal(M.dedupeNotes('Base. [es] A b. [fr] C. [es] A b. [fr] C. [es] A b.  [fr] C. '), 'Base. [es] A b. [fr] C.');
      const { glossary } = fixture();
      M.normalize(glossary);
      assert.equal(glossary.Raboniel.notes, 'Proper name. [es] X.');
      assert.deepEqual(glossary.Raboniel.sources, ['https://coppermind.net']);
    });
    test('m9: running the merge twice never changes the result (idempotent)', () => {
      const { glossary, reviews } = fixture();
      M.run(glossary, reviews);
      const once = JSON.stringify(glossary);
      for (let i = 0; i < 3; i++) M.run(glossary, clone(reviews));
      assert.equal(JSON.stringify(glossary), once);
      assert.equal(M.splitNotes(glossary.Raboniel.notes).filter((s) => s === '[es] page title').length, 1);
    });
    test('m8: es.coppermind alone is community, nothing at all is unverified, an edition source stays official', () => {
      const { glossary, reviews } = fixture();
      const { downgrades } = M.run(glossary, reviews);
      assert.equal(glossary.Raboniel.status.es, 'community', 'Rabeniel: only es.coppermind');
      assert.equal(glossary.Lone.status.es, 'unverified');
      assert.equal(glossary.Shardblade.status.es, 'official');
      assert.equal(glossary.Jak.status.es, 'official', 'a compound "wiki ; archive.org" source counts as edition evidence');
      assert.deepEqual(downgrades.map((d) => `${d.term}:${d.to}`).sort(), ['Lone:unverified', 'Raboniel:community']);
      assert.match(glossary.Raboniel.notes, /\[audit\] es: downgraded from official to community/);
    });
    test('source classification', () => {
      assert.equal(M.sourceKind('https://es.coppermind.net/wiki/Esquirla'), 'wiki');
      assert.equal(M.sourceKind('https://kosmeer.fandom.com/de/ (German fan wiki citing Heyne/Piper editions)wiki/X'), 'wiki');
      assert.equal(M.sourceKind('glossary (status official)'), 'internal');
      assert.equal(M.sourceKind('https://www.mondadori.it/libri/x/'), 'edition');
      assert.equal(M.sourceKind('https://www.babelio.com/livres/x'), 'review');
      assert.equal(M.sourceLang('https://it.coppermind.net/wiki/Cosmoverso'), 'it');
      assert.equal(M.sourceLang('https://www.livredepoche.com/livre/x'), 'fr');
    });
    test('content/glossary.json is already merged: no duplicates, no official without an edition source, a re-run is a no-op', () => {
      const gPath = new URL('content/glossary.json', ROOT);
      const glossary = JSON.parse(readFileSync(gPath, 'utf8'));
      const reviews = {};
      for (const lang of M.LANGS) {
        const p = new URL(`content/${lang}/glossary-review.json`, ROOT);
        if (existsSync(p)) reviews[lang] = JSON.parse(readFileSync(p, 'utf8'));
      }
      const before = JSON.stringify(glossary);
      for (const [term, e] of Object.entries(glossary)) {
        const segs = M.splitNotes(e.notes);
        assert.equal(new Set(segs).size, segs.length, `duplicated note segment in "${term}"`);
        assert.equal(new Set(e.sources ?? []).size, (e.sources ?? []).length, `duplicated source in "${term}"`);
      }
      M.run(glossary, reviews);
      assert.equal(JSON.stringify(glossary), before, 'node tools/merge-glossary.mjs would change the glossary: run it');
      for (const [term, e] of Object.entries(glossary)) for (const lang of M.LANGS) {
        if (e.status?.[lang] !== 'official') continue;
        const own = M.sourcesFor(e, lang, reviews[lang]?.[term]?.sources ?? []);
        assert.ok(own.some((s) => ['edition', 'review'].includes(M.sourceKind(s))), `${lang} "${term}" is official without an edition source`);
      }
    });
  });
}

describe('beta 5: closing round messages', () => {
  test('isClosingRound is true only after a right final with players left in a full round', () => {
    const players = ['A', 'B', 'C'].map((name, i) => ({ name, color: ['roshar', 'sel', 'nalthis'][i] }));
    const s = newClassicGame({ players, timer: false, categories: ['roshar', 'sel'], level: 'normal', fullRound: true });
    assert.equal(isClosingRound(s), false, 'fresh game');
    s.winners = [0]; s.roundLeft = [1, 2];
    assert.equal(isClosingRound(s), true, 'someone won, round still closing');
    s.fullRound = false;
    assert.equal(isClosingRound(s), false, 'no full round option');
    assert.equal(isClosingRound(null), false);
  });
});

describe('beta 5: names, Easy fallback, collection merge', () => {
  test('item 12: player names are capped at 24 graphemes, emoji never cut in half', () => {
    assert.equal(NAME_MAX, 24);
    const family = '👨‍👩‍👧‍👦'; // 11 UTF-16 units, one grapheme
    const name = `Ana ${family}${'🇪🇸'.repeat(10)}`;
    assert.ok(name.length > 24, 'longer than a UTF-16 maxlength of 24');
    assert.equal(limitGraphemes(name), name, '4 + 1 + 10 = 15 graphemes: kept whole');
    assert.equal(cleanName(name), name);
    const long = `${'🙂'.repeat(20)}${family}${family}${'x'.repeat(5)}`;
    const cut = limitGraphemes(long);
    assert.equal(graphemes(cut).length, 24);
    assert.ok(cut.endsWith(`${family}${family}xx`), 'whole emoji kept, the cut falls after them');
    assert.equal(limitGraphemes('Ana  '), 'Ana  ', 'live typing keeps trailing spaces');
    assert.equal(cleanName(`  ${'é'.repeat(30)}  `), 'é'.repeat(24));
  });
  test('item 7: Easy with 1 and 2 used up takes the nearest harder difficulty first (3 before 4)', () => {
    for (const s of [1, 2, 3, 4, 5, 6]) {
      seed(s);
      const pool = new Pool(makeQuestions({ cosmere: { 1: 1, 3: 2, 4: 2 } }));
      const ds = Array.from({ length: 5 }, () => pool.drawLeveled('cosmere', 'easy').d);
      assert.deepEqual(ds, [1, 3, 3, 4, 4], `seed ${s}`);
      seed(s);
      const quickPool = new Pool(makeQuestions({ cosmere: { 1: 1, 3: 1, 4: 1 } }));
      const seen = new Set(['cosmere-d1-0']);
      assert.equal(quickPool.drawUnseen('cosmere', 'easy', seen).d, 3, `quick seed ${s}: 3 before 4`);
    }
  });
  test('mergeIdMaps: adds the extra ids per language, keeps the base, cleans and caps', () => {
    const out = mergeIdMaps({ es: ['a', 'b'], xx: ['z'] }, { es: ['b', 'c', 5], en: ['d'] }, ['es', 'en'], 3);
    assert.deepEqual(out, { es: ['c', 'a', 'b'], en: ['d'] });
    assert.deepEqual(mergeIdMaps(null, 'x', ['es']), {});
  });
});

describe('Beta 6 (2.0.2)', () => {
  const LANG_CODES = ['es', 'en', 'fr', 'de', 'it'];
  const strings = Object.fromEntries(LANG_CODES.map((l) => [l, JSON.parse(readFileSync(new URL(`../app/i18n/${l}.json`, import.meta.url), 'utf8'))]));
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  test('no UI string names "Trivial" (Hasbro trademark); the disclaimer says not affiliated nor endorsed', () => {
    for (const l of LANG_CODES) {
      for (const [k, v] of flat(strings[l])) assert.ok(!/trivial/i.test(v), `${l} ${k}: "${v}"`);
    }
    const endorsed = { es: /ni cuenta con su respaldo/, en: /not affiliated with or endorsed by/, fr: /non approuvé/, de: /nicht unterstützt/, it: /né da loro approvato/ };
    for (const l of LANG_CODES) assert.match(strings[l].about.disclaimer, endorsed[l], l);
    assert.ok(/\u00A0/.test(strings.fr.about.disclaimer) || !/[?!:;]/.test(strings.fr.about.disclaimer), 'fr typography');
  });
  test('item 5: strings (es reset without "¿Seguro?", de closing-round texts, middle dots glued in Home)', () => {
    assert.ok(!/Seguro/.test(strings.es.settings.resetConfirm) && /¿Quieres borrarlo todo\?$/.test(strings.es.settings.resetConfirm));
    assert.match(strings.de.classic.finalRoundOn, /Wer die Finalfrage ebenfalls richtig beantwortet, teilt sich den Sieg\.$/);
    assert.match(strings.de.classic.lastChanceGone, /Aber die Runde endet jetzt: Du bekommst keinen weiteren Zug\.$/);
    for (const l of LANG_CODES) for (const [k, v] of Object.entries(strings[l].home)) assert.ok(!v.includes(' · '), `${l} home.${k}: "·" can start a line`);
  });
  test('item 2: clockLeft within a session uses the monotonic clock (system clock moved back gives nothing back)', () => {
    const wall = 1_800_000_000_000;
    const c = stampClock({ remaining: 25_000 }, true, wall, 1_000);
    assert.equal(c.savedAt, wall);
    assert.equal(c.sid, SESSION_ID);
    assert.ok(isValidClock(c));
    // 20 s away, the system clock moved back 60 s meanwhile: 20 s are deducted, not 0.
    assert.equal(clockLeft(c, wall + 20_000 - 60_000, 21_000), 5_000);
    // Clock moved forward: the wall time counts (never more time than the monotonic one gives).
    assert.equal(clockLeft(c, wall + 30_000, 6_000), 0);
    // Device asleep (performance.now() stopped): the wall time still counts.
    assert.equal(clockLeft(c, wall + 10_000, 1_000), 15_000);
    // Another page session (a reload): only the wall time, never a stale monotonic value.
    const other = { ...c, sid: 'other-session' };
    assert.equal(clockLeft(other, wall + 4_000, 999_999), 21_000);
    assert.equal(clockLeft(other, wall - 60_000, 999_999), 0, 'clock back across a reload: timed out (beta 6b N2)');
    // Paused: no stamp, time kept.
    const paused = stampClock({ ...c }, false);
    assert.equal(paused.savedAt, null);
    assert.ok(!('mono' in paused) && !('sid' in paused));
    assert.equal(clockLeft(paused), 25_000);
  });
  test('item 2: isValidClock checks the session fields', () => {
    assert.ok(isValidClock({ remaining: 1000, savedAt: 5, mono: 3.5, sid: 'a-b' }));
    assert.ok(isValidClock({ remaining: 1000, savedAt: 5 }), 'older saves without them');
    for (const bad of [{ mono: -1 }, { mono: 'x' }, { sid: 5 }, { sid: 'x'.repeat(41) }, { savedAt: -3 }]) {
      assert.ok(!isValidClock({ remaining: 1000, savedAt: 5, ...bad }), JSON.stringify(bad));
    }
  });
  test('item 4: default player names are stored as such and follow the language', () => {
    seed(4);
    const s = newClassicGame({ players: [{ name: 'Jugador 1', auto: true, color: 'roshar' }, { name: 'Ana', color: 'scadrial' }], timer: false, categories: [...CATEGORIES], level: 'normal' });
    assert.equal(s.players[0].auto, true);
    assert.ok(!('auto' in s.players[1]));
    assert.ok(isValidState(s));
    assert.ok(!isValidState({ ...s, players: [{ ...s.players[0], auto: 'yes' }, s.players[1]] }), 'auto must be a boolean');
    assert.equal(localizeAutoNames(s, (i) => `Player ${i + 1}`), true);
    assert.deepEqual(s.players.map((p) => p.name), ['Player 1', 'Ana']);
    assert.equal(localizeAutoNames(s, (i) => `Player ${i + 1}`), false, 'nothing to change');
    const old = migrateState(JSON.parse(JSON.stringify(s)));
    delete old.players[0].auto;
    assert.ok(isValidState(old), 'saves from before 2.0.2 (no auto) stay valid');
    localizeAutoNames(old, () => 'X');
    assert.equal(old.players[0].name, 'Player 1', 'a name without the flag is kept');
  });
});
