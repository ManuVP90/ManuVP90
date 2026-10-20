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
  CATEGORIES, LEVELS, LEVEL_IDS, LIFELINES, MAX_STREAK, TIMER_MS, RECENT_MAX, fullLifelines, levelOrDefault,
} from '../app/js/config.js';
import { Pool, quickPlan, nearestDifficulty, shuffle, shuffledOrder } from '../app/js/data.js';
import {
  STATE_VERSION, newClassicGame, migrateState, isValidState, applyAnswer, isValidFx, isValidClock, isValidLifelines,
  clockLeft, migrateClock, allInfused, isInfused, startPhase,
} from '../app/js/game.js';
import { graphemes, initialOf, cleanName } from '../app/js/text.js';
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
  test('easy recycles its own questions once 1 and 2 are used up (never 3)', () => {
    seed(13);
    const pool = new Pool(makeQuestions({ sel: { 1: 2, 2: 2, 3: 20 } }));
    const ds = Array.from({ length: 12 }, () => pool.drawLeveled('sel', 'easy').d);
    assert.ok(ds.every((d) => d <= 2), JSON.stringify(ds));
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
      { phase: 'won', winner: 1 },
    ];
    for (const v of variants) assert.equal(isValidState({ ...clone(base), ...v }), true, JSON.stringify(v));
    const fin = clone(base);
    fin.phase = 'final-intro';
    infuseAll(fin.players[fin.current]);
    assert.equal(isValidState(fin), true);
    assert.equal(isValidState({ ...fin, phase: 'question', pending: pend('sel', true) }), true);
  });
  test('v1 save migrates to v3: level normal, full lifelines, streak 0, stats added', () => {
    const v1 = { v: 1, players: [{ name: 'Ana', color: 'roshar', charges: { roshar: 1 } }, { name: 'Bo', color: 'sel', charges: {} }],
      current: 1, phase: 'spin', timer: true, categories: [...CATEGORIES], used: {}, pending: null, asked: 3, winner: null };
    const s = migrateState(clone(v1));
    assert.equal(s.v, 3);
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
    assert.equal(clockLeft({ remaining: 20000, savedAt: now + 5000 }, now), 20000, 'clock moved backwards');
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
  test('final question: right answer wins, wrong passes the turn', () => {
    let s = game(); s.current = 0; infuseAll(s.players[0]);
    let r = ask(s, 'sel', true, true);
    assert.equal(r.won, true); assert.equal(s.phase, 'won'); assert.equal(s.winner, 0);
    assert.equal(isValidState(s), true);
    s = game(); s.current = 0; infuseAll(s.players[0]);
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
  test('the issue template the app links to exists', { skip: !cfg.REPORT_TEMPLATE && 'no REPORT_TEMPLATE' }, async () => {
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(new URL(`../.github/ISSUE_TEMPLATE/${cfg.REPORT_TEMPLATE}`, import.meta.url)), cfg.REPORT_TEMPLATE);
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

  test('classic: a v1 save is migrated and written back as v3', () => {
    put('classic', { v: 1, players: [{ name: 'Ana', color: 'roshar', charges: {} }, { name: 'Bo', color: 'sel', charges: {} }],
      current: 0, phase: 'spin', timer: false, categories: [...CATEGORIES], used: {}, pending: null, asked: 0, winner: null });
    const s = classic.loadSavedGame();
    assert.ok(s); assert.equal(s.v, 3);
    assert.equal(JSON.parse(mem.get(PREFIX + 'classic')).v, 3);
  });
  test('classic: corrupt, invalid or finished saves are deleted', () => {
    for (const bad of ['{oops', 'null', JSON.stringify({ v: 3 }), JSON.stringify({ ...game(), phase: 'won', winner: 0 })]) {
      put('classic', bad);
      assert.equal(classic.loadSavedGame(), null, bad.slice(0, 40));
      assert.equal(has('classic'), false);
    }
  });
});

process.on('exit', () => { Math.random = realRandom; });
