#!/usr/bin/env node
// Edge-case regression tests (Playwright + Chromium) for the Beta 1 findings (docs/BETA-1.md).
// Usage: node tools/edge.mjs          (SCREENSHOT_DIR=/some/dir to choose where PNGs go)
// Deterministic: Math.random is seeded in every page and timers use Playwright's fake clock.
// Each test opens a fresh context (service workers blocked so routes and storage are exact).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, APP_DIR } from './serve.mjs';
import { ALL_WORKS } from '../app/js/works.js';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall back to a global install */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(join(globalRoot, 'noop.js'))('playwright');
}

const { chromium, devices } = await loadPlaywright();
const SHOTS = process.env.SCREENSHOT_DIR || join(tmpdir(), 'cosmere-edge');
mkdirSync(SHOTS, { recursive: true });

const LANGS = ['es', 'en', 'fr', 'de', 'it'];
const strings = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(APP_DIR, 'i18n', `${l}.json`), 'utf8'))]));
const T = (lang, key, params = {}) => Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
  key.split('.').reduce((o, k) => o?.[k], strings[lang]));
const QS = JSON.parse(readFileSync(join(APP_DIR, 'data', 'questions.es.json'), 'utf8'));
const answers = Object.fromEntries(QS.map((q) => [q.q, q.o[0]]));
const CATS = ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere'];
const onlyWorks = (works) => ALL_WORKS.filter((w) => !works.includes(w));
const poolOf = (works) => QS.filter((q) => works.includes(q.w));

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const T0 = new Date('2026-10-16T10:00:00Z').getTime();

function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }

function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Opens the app in a fresh context. `storage` (key → raw string, without the app prefix) is
 * written before the app boots; `clock` installs the fake clock at T0.
 */
async function open({ locale = 'es-ES', device = 'Pixel 7', viewport = null, seed = 7, storage = null, clock = false, before = null, allow = [] } = {}) {
  const context = await browser.newContext({ ...devices[device], ...(viewport ? { viewport } : {}), locale, serviceWorkers: 'block' });
  await context.addInitScript(seedRandom, seed);
  if (storage) {
    await context.addInitScript((data) => {
      if (sessionStorage.getItem('__edge_seeded')) return; // only before the first boot
      sessionStorage.setItem('__edge_seeded', '1');
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k.includes(':') ? k : `cosmere-trivia:${k}`, v);
    }, storage);
  }
  const page = await context.newPage();
  const errors = [];
  const allowed = (m) => allow.some((re) => re.test(m));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => { if (!allowed(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on('requestfailed', (r) => { if (!r.url().includes('favicon') && !allowed(r.url())) errors.push(`requestfailed: ${r.url()}`); });
  if (clock) await page.clock.install({ time: T0 });
  if (before) await before(page, context);
  await page.goto(BASE);
  return { context, page, errors };
}

const results = [];
async function test(name, fn) {
  const started = Date.now();
  let ctx = null;
  const all = [];
  const use = async (opts) => { ctx = await open(opts); all.push(ctx); return ctx; };
  try {
    await fn(use);
    const errs = all.flatMap((c) => c.errors);
    if (errs.length) throw new Error(`Console errors:\n${errs.join('\n')}`);
    results.push([name, null]);
    console.log(`  ok   ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (e) {
    if (ctx) await ctx.page.screenshot({ path: join(SHOTS, `zz-fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {});
    results.push([name, e]);
    console.log(`  FAIL ${name}\n       ${e.message.split('\n').join('\n       ')}`);
  } finally {
    for (const c of all) await c.context.close().catch(() => {});
  }
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const text = async (page, sel) => ((await page.textContent(sel)) || '').trim();
const leakedText = (page) => page.evaluate(() => (document.body.innerText.match(/\b(null|undefined|NaN|\[object Object\])\b/) || [])[0]);
const lsGet = (page, key) => page.evaluate((k) => localStorage.getItem(`cosmere-trivia:${k}`), key);

/** Clicks the right (or a wrong) enabled option of the visible question. */
async function answer(page, correct = true) {
  await page.waitForSelector('.qcard .option');
  const right = answers[await text(page, '.qtext')];
  assert(right, 'known question');
  const opts = page.locator('.qcard .option:not([disabled])');
  const texts = (await opts.locator('.option-text').allTextContents()).map((s) => s.trim());
  let i = texts.findIndex((s) => (s === right) === correct);
  if (i < 0) i = 0;
  await opts.nth(i).click();
}

// A valid v3 classic save.
function classicSave(over = {}) {
  const q = QS.find((x) => x.d <= 2);
  return {
    v: 3, players: [
      { name: 'Ana', color: 'roshar', charges: {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } },
      { name: 'Bea', color: 'sel', charges: {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } },
    ],
    current: 0, phase: 'question', first: false, streak: 0, timer: true, level: 'normal', categories: CATS, used: {},
    pending: { id: q.id, cat: q.c, order: [0, 1, 2, 3], final: false }, resume: null, asked: 2, winner: null, startedAt: T0,
    ...over,
  };
}

console.log(`Edge tests against ${BASE}`);

// ------------------------------------------------------------------ 1. corrupt / odd saved state
await test('corrupt saves never brick the app; only valid saves offer "Continue"', async (use) => {
  const good = classicSave();
  const p0 = good.players[0];
  const bad = {
    invalidJSON: { classic: '{not json', settings: '{{', stats: 'nope', quick: '{' },
    array: { classic: '[]' }, number: { classic: '42' }, string: { classic: '"hola"' }, onlyVersion: { classic: '{"v":3}' },
    playersNull: { classic: JSON.stringify({ ...good, players: [null] }) },
    noCharges: { classic: JSON.stringify({ ...good, players: [{ name: 'Hoid', color: 'roshar' }] }) },
    negCurrent: { classic: JSON.stringify({ ...good, current: -1 }) },
    bigCurrent: { classic: JSON.stringify({ ...good, current: 2 }) },
    floatCurrent: { classic: JSON.stringify({ ...good, current: 0.5 }) },
    badCats: { classic: JSON.stringify({ ...good, categories: ['urithiru'] }) },
    noCats: { classic: JSON.stringify({ ...good, categories: [] }) },
    dupCats: { classic: JSON.stringify({ ...good, categories: ['roshar', 'roshar'] }) },
    sevenPlayers: { classic: JSON.stringify({ ...good, players: Array(7).fill(p0) }) },
    nameNumber: { classic: JSON.stringify({ ...good, players: [{ ...p0, name: 123 }] }) },
    badColor: { classic: JSON.stringify({ ...good, players: [{ ...p0, color: 'gold' }] }) },
    badLifelines: { classic: JSON.stringify({ ...good, players: [{ ...p0, lifelines: 'all' }] }) },
    negCharges: { classic: JSON.stringify({ ...good, players: [{ ...p0, charges: { roshar: -1 } }] }) },
    orderBad: { classic: JSON.stringify({ ...good, pending: { ...good.pending, order: [0, 0, 0, 0] } }) },
    orderShort: { classic: JSON.stringify({ ...good, pending: { ...good.pending, order: [0, 1, 2] } }) },
    pendingBad: { classic: JSON.stringify({ ...good, pending: { id: 'nope-999', cat: 'roshar', order: [0, 0, 0, 0], final: false } }) },
    fxBad: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [0], struck: [], armed: false } } }) },
    clockBad: { classic: JSON.stringify({ ...good, pending: { ...good.pending, clock: { deadline: 'soon' } } }) },
    questionNoPending: { classic: JSON.stringify({ ...good, pending: null }) },
    badPhase: { classic: JSON.stringify({ ...good, phase: 'dance' }) },
    quickBad: { quick: JSON.stringify({ v: 1, plan: 'x' }) },
    quickIndex: { quick: JSON.stringify({ v: 1, plan: ['roshar'], total: 1, index: 5, score: 0, correct: 0, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [], current: null }) },
    lastPlayers: { lastPlayers: '[null, 5, {"name": 3}, "x"]' },
    settingsWeird: { settings: JSON.stringify({ lang: 'xx', theme: 42, disabledWorks: 'all', level: 'imposible', timer: 'yes', sound: null }) },
    settingsArray: { settings: '[1,2,3]', stats: '[]' },
    statsWeird: { stats: JSON.stringify({ cats: { roshar: null, sel: 'x', nalthis: { a: -3, c: 'y' }, otros: { a: 2, c: 9 } }, lifelines: null, bestQuick: 'mucho', classicGames: -2 }) },
  };
  for (const [name, storage] of Object.entries(bad)) {
    const { page, context } = await use({ storage });
    await page.waitForSelector('.home', { timeout: 5000 }).catch(() => { throw new Error(`${name}: home did not render`); });
    assert(!(await page.$('.menu-continue')), `${name}: no "Continue" for an invalid save`);
    if (storage.classic) assert(await lsGet(page, 'classic') === null, `${name}: invalid classic save deleted`);
    if (storage.quick) assert(await lsGet(page, 'quick') === null, `${name}: invalid quick save deleted`);
    assert(!(await leakedText(page)), `${name}: no leaked JS values on home`);
    if (name === 'settingsWeird') {
      assert(await page.evaluate(() => document.documentElement.lang) === 'es', 'invalid stored lang → device language (es)');
      assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'invalid theme → dark');
    }
    if (name.startsWith('stats') || name === 'settingsArray') {
      await page.click('.small-btn >> nth=0');
      await page.waitForSelector('.stats');
      assert(!(await leakedText(page)), `${name}: stats show no NaN/undefined`);
      const vals = await page.locator('.tile-value').allTextContents();
      assert(vals.every((v) => /^(\d[\d.\s]*|—|\d+ %)$/.test(v.trim())), `${name}: stat tiles are numbers (${vals})`);
    }
    if (name === 'lastPlayers') {
      await page.click('.menu-btn >> nth=0');
      await page.waitForSelector('.setup .setup-player');
    }
    await context.close();
  }

  // A valid v1 save (old shape) still migrates and resumes; a valid v3 save resumes too.
  const v1 = { v: 1, players: [{ name: 'Viejo', color: 'nalthis', charges: { roshar: 2 } }], current: 0, categories: CATS, phase: 'spin', used: {}, asked: 3 };
  for (const [name, save, expect] of [['v1', v1, '.spin'], ['v3', good, '.handoff']]) {
    const { page, context } = await use({ storage: { classic: JSON.stringify(save) } });
    await page.waitForSelector('.home .menu-continue-classic');
    await page.click('.home .menu-continue-classic');
    await page.waitForSelector(expect);
    await context.close();
  }
});

// ------------------------------------------------------------------ 2. localized startup error screen
await test('startup failure shows a localized error screen with "clear data and restart"', async (use) => {
  const allow = [/Startup failed/, /ERR_FAILED/, /main\.js/, /home\.js/, /boom/, /Failed to fetch dynamically imported module/, /i18n\/de\.json/];
  // (a) A module that fails to load, German device, invalid stored language.
  let { page } = await use({
    locale: 'de-DE', allow,
    storage: { settings: '{"lang":"xx"}', stats: '{"quickGames":3}', 'other-app:keep': 'yes' },
    before: (p) => p.route('**/js/main.js', (r) => r.abort()),
  });
  await page.waitForSelector('.boot-error');
  assert(await text(page, '.boot-error-title') === T('de', 'boot.title'), 'error title in German (device language)');
  assert(await text(page, '.boot-reset') === T('de', 'boot.reset'), 'reset button in German');
  await shot(page, 'e-boot-error-de');
  await page.unroute('**/js/main.js');
  await Promise.all([page.waitForNavigation(), page.click('.boot-reset')]);
  await page.waitForSelector('.home');
  const left = await page.evaluate(() => Object.keys(localStorage));
  assert(!left.some((k) => k.startsWith('cosmere-trivia:')), `app storage cleared (${left})`);
  assert(left.includes('other-app:keep'), 'other apps’ storage kept');
  await page.context().close();

  // (b) Even the strings file fails: built-in copy in the device language.
  ({ page } = await use({
    locale: 'de-CH', allow,
    before: async (p) => { await p.route('**/js/main.js', (r) => r.abort()); await p.route('**/i18n/de.json', (r) => r.abort()); },
  }));
  await page.waitForSelector('.boot-error');
  assert(await text(page, '.boot-error-title') === 'Etwas ist schiefgelaufen', 'built-in German copy');
  await page.context().close();

  // (c) A screen that throws while starting (Catalan device → Spanish).
  ({ page } = await use({
    locale: 'ca-ES', allow,
    before: (p) => p.route('**/js/screens/home.js', (r) => r.fulfill({
      contentType: 'text/javascript', body: 'export function homeScreen() { throw new Error("boom"); }',
    })),
  }));
  await page.waitForSelector('.boot-error');
  assert(await text(page, '.boot-error-title') === T('es', 'boot.title'), 'error screen in Spanish for a Catalan device');
  assert(await text(page, '.boot-reset') === 'Borrar datos y reiniciar', '"Borrar datos y reiniciar"');
  await shot(page, 'e-boot-error-es');
});

// ------------------------------------------------------------------ 3. classic timer survives reload/back; handoff on resume
await test('classic: timer keeps its deadline across reload/back and resumes behind the handoff', async (use) => {
  const { page } = await use({ clock: true, storage: { classic: JSON.stringify(classicSave()) } });
  await page.waitForSelector('.home .menu-continue-classic');
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  assert(!(await page.$('.qcard')), 'resume shows the pass-the-phone screen before the question');
  assert(await text(page, '.handoff-name') === 'Ana', 'handoff names the player whose turn it is');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.timer-num') === '30', 'fresh question starts at 30 s');
  await page.clock.runFor(10_000);
  assert(await text(page, '.timer-num') === '20', `10 s later: 20 (got ${await text(page, '.timer-num')})`);
  const q = await text(page, '.qtext');

  await page.reload();
  await page.waitForSelector('.home .menu-continue-classic');
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  await page.clock.runFor(4_000); // time on the handoff screen still counts
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.qtext') === q, 'same question after reload');
  const afterReload = Number(await text(page, '.timer-num'));
  assert(afterReload <= 16 && afterReload >= 15, `timer did not reset on reload (${afterReload})`);

  await page.goBack(); // Android back: leaves to Home (game saved)
  await page.waitForSelector('.home .menu-continue-classic');
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(Number(await text(page, '.timer-num')) <= afterReload, 'timer did not reset after Back');
  await page.clock.runFor(20_000);
  await page.waitForSelector('.qcard .continue:not([hidden])');
  assert(await text(page, '.verdict') === T('es', 'question.timeout'), 'expires as a timeout');
  await page.click('.qcard .continue');
  await page.waitForSelector('.handoff');
  assert(await text(page, '.handoff-name') === 'Bea', 'timeout passes the turn');
});

await test('classic: a deadline that passed while away resolves as a timeout on resume', async (use) => {
  const save = classicSave();
  save.pending.clock = { deadline: T0 - 1000 };
  const { page } = await use({ clock: true, storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .continue:not([hidden])');
  assert(await text(page, '.verdict') === T('es', 'question.timeout'), 'expired question resolves as timeout');
  const saved = JSON.parse(await lsGet(page, 'classic'));
  assert(saved.current === 1 && saved.pending === null, 'turn passed and saved');
});

// ------------------------------------------------------------------ 4. quick game: history, pause, persistence
await test('quick: Back+Cancel re-arms Back, dialog pauses the timer, reload resumes the run', async (use) => {
  const { page } = await use({ clock: true });
  await page.waitForSelector('.home');
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .timer-num');
  await page.clock.runFor(5_000);
  assert(await text(page, '.timer-num') === '25', '25 s left');
  await page.goBack();
  await page.waitForSelector('.modal');
  await page.clock.runFor(60_000);
  assert(await text(page, '.timer-num') === '25', 'timer paused while the quit dialog is open');
  assert(!(await page.$('.verdict')), 'no timeout behind the dialog');
  assert(await page.$('.qcard.paused'), 'question blurred while paused');
  await shot(page, 'e-quick-quit-dialog');
  await page.click('.modal .btn-ghost'); // cancel
  await page.clock.runFor(3_000);
  assert(await text(page, '.timer-num') === '22', `timer resumes on cancel (${await text(page, '.timer-num')})`);
  await page.goBack(); // a second Back must show the dialog again, not leave the app
  await page.waitForSelector('.modal');
  assert(page.url().startsWith(BASE), 'still in the app after a second Back');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.goBack(); // and a third
  await page.waitForSelector('.modal');
  await page.click('.modal .btn-ghost');

  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForFunction(() => document.querySelector('.progress-label')?.textContent.includes('2'));
  const q2 = await text(page, '.qtext');
  const score = await text(page, '.score-value');
  await page.clock.runFor(4_000);
  await page.reload();
  await page.waitForSelector('.home .menu-continue-quick');
  assert((await text(page, '.menu-continue-quick .menu-desc')) === T('es', 'home.continueQuickDesc', { n: 2, total: 15, score }), 'home offers "Continuar partida rápida" with progress');
  await shot(page, 'e-home-continue-quick');
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard');
  assert(await text(page, '.qtext') === q2, 'same question after reload');
  assert(await text(page, '.progress-label') === T('es', 'question.progress', { n: 2, total: 15 }), 'same position');
  assert(await text(page, '.score-value') === score, 'same score');
  assert(Number(await text(page, '.timer-num')) <= 26, 'timer kept running across the reload');
  await page.goBack();
  await page.click('.modal .btn-primary'); // abandon
  await page.waitForSelector('.home');
  assert(!(await page.$('.menu-continue-quick')), 'abandoned run is not offered');
  assert(await lsGet(page, 'quick') === null, 'abandoned run deleted');
});

// ------------------------------------------------------------------ 5. no repetitions with narrow spoiler filters
await test('quick: no repeated questions with narrow spoiler filters (weighted plan)', async (use) => {
  const cases = [
    { works: ['way-of-kings', 'hope-of-elantris'], level: 'easy' }, // Sel only has hard questions here
    { works: ['edgedancer', 'eleventh-metal', 'allomancer-jak'], level: 'normal' }, // 7 questions in all
    { works: ['wob', 'dawnshard', 'hope-of-elantris'], level: 'expert' },
  ];
  for (const [i, c] of cases.entries()) {
    const pool = poolOf(c.works);
    const settings = JSON.stringify({ disabledWorks: onlyWorks(c.works), level: c.level });
    const { page, context } = await use({ seed: 11 + i, storage: { settings } });
    await page.click('.menu-quick');
    await page.click('.quick-intro .sticky-actions .btn-primary');
    const seen = [];
    for (let k = 0; k < 20; k++) {
      await page.waitForSelector('.quick .qcard, .quick-result');
      if (await page.$('.quick-result')) break;
      seen.push(await text(page, '.qtext'));
      await answer(page, k % 2 === 0);
      await page.click('.qcard .continue');
    }
    const expected = Math.min(15, pool.length);
    assert(seen.length === expected, `case ${i}: ${expected} questions (got ${seen.length})`);
    assert(new Set(seen).size === seen.length, `case ${i}: no repeats (${seen.length - new Set(seen).size} repeated)`);
    assert(await lsGet(page, 'quick') === null, `case ${i}: finished run removed from storage`);
    await context.close();
  }
});

await test('practice: never the same question twice in a row; "all worlds" covers every question first', async (use) => {
  // Two questions in one world: after the pool resets, the last one must not come straight back.
  let works = ['eleventh-metal'];
  let { page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks(works) }) } });
  await page.click('.menu-btn >> nth=2');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  let prev = null;
  for (let k = 0; k < 8; k++) {
    await page.waitForSelector('.practice .qcard');
    const q = await text(page, '.qtext');
    assert(q !== prev, `practice repeated "${q}" right away`);
    prev = q;
    await answer(page, true);
    await page.click('.qcard .continue');
    await page.waitForFunction((old) => document.querySelector('.qtext')?.textContent.trim() !== old || !document.querySelector('.continue:not([hidden])'), q);
  }
  await context.close();
  // All worlds: categories weighted by available questions, so every question shows up once
  // before any comes back (a world with 1 question isn't drawn as often as one with 20).
  works = ['edgedancer', 'hope-of-elantris', 'wob'];
  const n = poolOf(works).length;
  ({ page, context } = await use({ seed: 3, storage: { settings: JSON.stringify({ disabledWorks: onlyWorks(works) }) } }));
  await page.click('.menu-btn >> nth=2');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  const seen = [];
  for (let k = 0; k < n; k++) {
    await page.waitForSelector('.practice .qcard .option');
    seen.push(await text(page, '.qtext'));
    await answer(page, false);
    await page.click('.qcard .continue');
  }
  assert(new Set(seen).size === n, `first ${n} practice questions are all different (${new Set(seen).size})`);
});

// ------------------------------------------------------------------ 6. engine rules (pure functions, in the page)
await test('engine: final prefers unseen, random starter, 3-answer turns, migration, language & initials', async (use) => {
  const { page } = await use({});
  await page.waitForSelector('.home');
  const out = await page.evaluate(async () => {
    const { Pool, quickPlan } = await import('./js/data.js');
    const game = await import('./js/game.js');
    const { matchLang } = await import('./js/i18n.js');
    const { initialOf } = await import('./js/text.js');
    const qs = await (await fetch('data/questions.es.json')).json();
    const r = {};
    // Final question: every target-difficulty question but one already asked → that one.
    const d4 = qs.filter((q) => q.d === 4);
    let ok = 0;
    for (let i = 0; i < 25; i++) {
      const keep = d4[(i * 7) % d4.length];
      const used = {};
      for (const q of d4) if (q.id !== keep.id) (used[q.c] ||= []).push(q.id);
      if (new Pool(qs, [], used).drawFinal(undefined, 4).id === keep.id) ok++;
    }
    r.finalUnseen = ok;
    // Quick plan: shares follow the available questions; never more than a category holds.
    const pool = new Pool(qs.filter((q) => ['edgedancer', 'eleventh-metal', 'warbreaker'].includes(q.w)));
    const plan = quickPlan(pool, 'normal', 15);
    r.plan = plan.reduce((o, c) => { o[c] = (o[c] || 0) + 1; return o; }, {});
    const small = new Pool(qs.filter((q) => ['eleventh-metal'].includes(q.w)));
    r.smallPlan = quickPlan(small, 'easy', 15).length;
    // Random starting player.
    const starts = [0, 0, 0];
    const p3 = [{ name: 'A', color: 'roshar' }, { name: 'B', color: 'sel' }, { name: 'C', color: 'otros' }];
    for (let i = 0; i < 900; i++) starts[game.newClassicGame({ players: p3, timer: false, categories: ['roshar'], level: 'normal' }).current]++;
    r.starts = starts;
    const g = game.newClassicGame({ players: p3, timer: false, categories: ['roshar', 'sel'], level: 'normal' });
    r.first = g.first;
    // 3 correct answers per turn at most (multi-player).
    const who = g.current;
    const res = [];
    for (let i = 0; i < 3; i++) { g.pending = { id: 'x', cat: i < 2 ? 'roshar' : 'sel', order: [0, 1, 2, 3], final: false }; res.push(game.applyAnswer(g, true)); }
    r.streak = { passed: g.current === (who + 1) % 3, streakEnd: res.map((x) => x.streakEnd), phase: g.phase, streakAfter: g.streak };
    const solo = game.newClassicGame({ players: [p3[0]], timer: false, categories: ['roshar', 'sel', 'nalthis'], level: 'normal' });
    for (let i = 0; i < 4; i++) { solo.pending = { id: 'x', cat: 'nalthis', order: [0, 1, 2, 3], final: false }; game.applyAnswer(solo, true); }
    r.solo = { current: solo.current, phase: solo.phase, first: solo.first };
    // Migration.
    const v1 = game.migrateState({ v: 1, players: [{ name: 'V', color: 'sel', charges: {} }], current: 0, categories: ['sel'], phase: 'spin' });
    const v2 = game.migrateState({ v: 2, level: 'hard', players: [{ name: 'V', color: 'sel', charges: { sel: 1 }, lifelines: { atium: 0, stormlight: 1, breath: 1 } }], current: 0, categories: ['sel'], phase: 'spin', pending: null });
    r.migr = [game.isValidState(v1), v1.v, v1.level, game.isValidState(v2), v2.level, v2.players[0].lifelines.atium];
    r.lang = ['ca-ES', 'ca-ES-valencia', 'gl', 'eu-ES', 'de-AT', 'pt-BR', 'xx'].map(matchLang);
    r.initials = ['🔥Kaladin', '👨‍👩‍👧 Familia', 'ángel', '  vin', '🇪🇸 Spain', ''].map((n) => initialOf(n));
    return r;
  });
  assert(out.finalUnseen === 25, `final question picks the unseen one (${out.finalUnseen}/25)`);
  const cap = (works, c) => poolOf(works).filter((q) => q.c === c).length;
  const W = ['edgedancer', 'eleventh-metal', 'warbreaker'];
  assert(Object.values(out.plan).reduce((a, b) => a + b, 0) === 15, 'plan has 15 slots');
  for (const [c, k] of Object.entries(out.plan)) assert(k <= cap(W, c), `plan never exceeds ${c}'s questions (${k})`);
  assert(out.plan.nalthis > out.plan.roshar && out.plan.nalthis > out.plan.scadrial, `big world gets more slots (${JSON.stringify(out.plan)})`);
  assert(out.smallPlan === poolOf(['eleventh-metal']).length, 'plan capped at the pool size');
  assert(out.starts.every((n) => n > 230 && n < 370), `starting player is random (${out.starts})`);
  assert(out.first === true, 'first handoff flagged');
  assert(out.streak.passed && JSON.stringify(out.streak.streakEnd) === '[false,false,true]' && out.streak.phase === 'handoff' && out.streak.streakAfter === 0,
    `turn passes after 3 correct answers (${JSON.stringify(out.streak)})`);
  assert(out.solo.current === 0 && out.solo.phase !== 'handoff' && out.solo.first === false, 'no limit and no handoff for a single player');
  assert(JSON.stringify(out.migr) === JSON.stringify([true, 3, 'normal', true, 'hard', 0]), `v1/v2 saves migrate to v3 (${out.migr})`);
  assert(JSON.stringify(out.lang) === JSON.stringify(['es', 'es', 'es', 'es', 'de', null, null]), `ca/gl/eu → es (${out.lang})`);
  assert(JSON.stringify(out.initials) === JSON.stringify(['🔥', '👨‍👩‍👧', 'Á', 'V', '🇪🇸', '?']), `grapheme initials (${out.initials})`);
});

// ------------------------------------------------------------------ 7. language detection
await test('language: ca/gl/eu devices get Spanish; an invalid stored language uses the device language', async (use) => {
  for (const [locale, lang, storage] of [['ca-ES', 'es'], ['gl-ES', 'es'], ['eu-ES', 'es'], ['it-IT', 'it', { settings: '{"lang":"klingon"}' }]]) {
    const { page, context } = await use({ locale, storage });
    await page.waitForSelector('.home');
    assert(await page.evaluate(() => document.documentElement.lang) === lang, `${locale} → ${lang}`);
    assert(await text(page, 'h1.title') === T(lang, 'app.title'), `${locale}: title in ${lang}`);
    await context.close();
  }
});

// ------------------------------------------------------------------ 8. six players at 320 / 390 px
const LONG = ['🔥Kaladin Bendito', 'Shallan Davar 🎨', 'Maximiliano Ferr', '👨‍👩‍👧 Familia Ruiz', 'Vin Venture', 'Wayne el Sombrer'];
function sixSave(over = {}) {
  return classicSave({
    players: LONG.map((name, i) => ({ name, color: CATS[i], charges: i % 2 ? { roshar: 2, sel: 1 } : {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } })),
    current: 5, phase: 'spin', pending: null, ...over,
  });
}
await test('board: with 6 long names the current player is always visible (320 and 390 px)', async (use) => {
  for (const [w, h, locale, lang] of [[320, 568, 'es-ES', 'es'], [390, 844, 'de-DE', 'de']]) {
    for (const current of [0, 5]) {
      const { page, context } = await use({ locale, viewport: { width: w, height: h }, storage: { classic: JSON.stringify(sixSave({ current })) } });
      await page.click('.menu-continue-classic');
      await page.waitForSelector('.handoff');
      assert(await text(page, '.handoff .avatar-initial') === [...new Intl.Segmenter().segment(LONG[current])][0].segment.toUpperCase(), 'avatar initial is the first grapheme');
      if (current === 0) await shot(page, `e-handoff-emoji-${w}`);
      await page.click('.handoff .btn-primary');
      await page.waitForSelector('.spin .board-player.current');
      const m = await page.evaluate(() => {
        const r = document.querySelector('.board-player.current').getBoundingClientRect();
        const all = [...document.querySelectorAll('.board-player')].map((e) => e.getBoundingClientRect());
        const fix = [...document.querySelectorAll('.turn-fix')].map((e) => e.scrollWidth <= e.clientWidth + 1);
        return {
          cur: [r.left, r.right, r.top, r.bottom], vw: innerWidth, vh: innerHeight,
          allIn: all.every((b) => b.left >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight),
          overflow: document.documentElement.scrollWidth > innerWidth, fix,
          gemsFit: [...document.querySelectorAll('.board-player .gems')].every((g) => g.scrollWidth <= g.clientWidth + 1),
          initials: [...document.querySelectorAll('.board .avatar-initial')].map((e) => e.textContent),
        };
      });
      assert(m.allIn, `${w}px: all 6 players inside the viewport (${JSON.stringify(m)})`);
      assert(m.cur[0] >= 0 && m.cur[1] <= m.vw && m.cur[3] <= m.vh, `${w}px: current player visible`);
      assert(!m.overflow, `${w}px: no horizontal overflow`);
      assert(m.gemsFit, `${w}px: mini gems fit their cells`);
      assert(m.fix.every(Boolean), `${w}px: "${T(lang, 'turn.turnOf')}" keeps its fixed words`);
      assert(m.initials[0] === '🔥' && m.initials[3] === '👨‍👩‍👧', `board initials (${m.initials})`);
      await shot(page, `e-board6-${w}-p${current}`);
      await context.close();
    }
  }
});

// ------------------------------------------------------------------ 9. German / French UI strings
await test('strings: German Roschar, "Am Zug", typographic apostrophes; French colon spacing', async (use) => {
  const walk = (o, f, p = '') => Object.entries(o).forEach(([k, v]) => (typeof v === 'object' ? walk(v, f, `${p}${k}.`) : f(`${p}${k}`, v)));
  walk(strings.de, (k, v) => assert(!v.includes("'"), `de ${k} uses a straight apostrophe`));
  assert(strings.de.cat.roshar === 'Roschar', 'de cat.roshar = Roschar');
  assert(strings.de.turn.turnOf.startsWith('Am Zug'), 'de turnOf = "Am Zug: {name}"');
  walk(strings.fr, (k, v) => assert(!/[^ \s]:(\s|$)/.test(v) || /https?:/.test(v), `fr ${k}: needs a space before ":"`));
  assert(strings.fr.quick.bestScore === 'Meilleur score : {n}', 'fr bestScore with U+00A0');
  // In the app: the German spoiler filter group and the French best score.
  const { page, context } = await use({ locale: 'fr-FR', storage: { stats: '{"bestQuick":1234}' } });
  await page.click('.menu-quick');
  await page.waitForSelector('.quick-best');
  const fmt = await page.evaluate(() => new Intl.NumberFormat('fr').format(1234));
  assert(await text(page, '.quick-best') === T('fr', 'quick.bestScore', { n: fmt }), `French best score from i18n (${await text(page, '.quick-best')})`);
  await context.close();
  const de = await use({ locale: 'de-DE' });
  await de.page.click('.small-btn >> nth=1');
  await de.page.waitForSelector('.settings .group-name');
  assert((await de.page.locator('.group-name').allTextContents()).includes('Roschar'), 'spoiler filter group label "Roschar"');
});

// ------------------------------------------------------------------ 10. lifeline details
await test('lifelines: no answer index in the DOM, Atium/Stormlight exclusive with visible reason, Breath keeps Stormlight', async (use) => {
  let { page, context } = await use({ seed: 5 });
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .option');
  const html = await page.locator('.qcard .options').innerHTML();
  assert(!/data-idx|data-i\b|data-correct/.test(html), 'options carry no answer index');
  await page.click('.qcard .lifeline-atium');
  await page.waitForSelector('.qcard .option.eliminated');
  assert(await page.locator('.qcard .lifeline-stormlight').isDisabled(), 'Stormlight disabled after Atium');
  assert(await text(page, '.lifeline-reasons') === T('es', 'lifeline.noCombo'), 'visible reason under the lifelines');
  await shot(page, 'e-lifeline-reason-combo');
  await context.close();

  ({ page, context } = await use({ seed: 5 }));
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .option');
  await page.click('.qcard .lifeline-stormlight');
  await page.waitForSelector('.qcard.stormlight-armed');
  assert(await page.locator('.qcard .lifeline-atium').isDisabled(), 'Atium disabled while Stormlight is armed');
  const before = await text(page, '.qtext');
  await page.click('.qcard .lifeline-breath');
  await page.waitForFunction((q) => document.querySelector('.qtext')?.textContent.trim() !== q, before);
  assert(await page.$('.qcard.stormlight-armed'), 'Stormlight still armed on the new question');
  await answer(page, false);
  await page.waitForSelector('.qcard .option.struck');
  assert(await page.locator('.qcard .continue').isHidden(), 'carried-over Stormlight saves the wrong pick');
  await context.close();

  // Breath without an alternative: the reason is on screen.
  const lone = QS.find((q) => QS.filter((x) => x.w === q.w && x.c === q.c && x.d === q.d).length === 1);
  const pool = poolOf([lone.w]);
  const total = Math.min(15, pool.length);
  const run = { v: 1, plan: Array(total).fill(lone.c), total, index: 0, score: 0, correct: 0, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [lone.id], current: { id: lone.id, order: [3, 2, 1, 0], fx: { removed: [], struck: [], armed: false }, clock: { deadline: null } } };
  ({ page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks([lone.w]) }), quick: JSON.stringify(run) } }));
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard');
  assert(await page.locator('.qcard .lifeline-breath').isDisabled(), 'Breath disabled');
  assert(await text(page, '.lifeline-reasons') === T('es', 'lifeline.breath.none'), 'Breath reason visible');
  await shot(page, 'e-lifeline-reason-breath');
  await context.close();

  // Practice with nothing available explains why and links to Settings.
  ({ page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: ALL_WORKS }) } }));
  await page.click('.menu-btn >> nth=2');
  await page.waitForSelector('.practice-empty');
  assert((await text(page, '.practice-empty')).includes(T('es', 'practice.noneFilter')), 'practice explains the empty filter');
  await shot(page, 'e-practice-empty');
  await page.click('.practice-empty .btn');
  await page.waitForSelector('.settings');
});

// ------------------------------------------------------------------ 11. 200 % text at 320 px
await test('200 % text at 320 px: titles and level badge wrap, lifeline names never break mid-word', async (use) => {
  const { page } = await use({ viewport: { width: 320, height: 568 }, storage: { classic: JSON.stringify(sixSave({ players: sixSave().players.slice(0, 2), current: 1 })) } });
  await page.waitForSelector('.home');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const check = () => page.evaluate(() => {
    const cut = (e) => e && (e.scrollWidth > e.clientWidth + 1);
    const t = document.querySelector('.topbar-title');
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      title: cut(t) || getComputedStyle(t).textOverflow === 'ellipsis' && getComputedStyle(t).whiteSpace === 'nowrap',
      badge: cut(document.querySelector('.level-badge-text')) || cut(document.querySelector('.level-badge')),
      names: [...document.querySelectorAll('.lifeline-name')].filter(cut).map((e) => e.textContent),
      fix: [...document.querySelectorAll('.turn-fix')].some(cut),
      board: [...document.querySelectorAll('.board-player, .board-player .gems')].some(cut),
    };
  });
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .lifeline');
  let m = await check();
  assert(!m.overflow && !m.title && !m.badge, `quick game bar wraps (${JSON.stringify(m)})`);
  assert(!m.names.length, `lifeline names fit without breaking (${m.names})`);
  await shot(page, 'e-zoom200-quick');
  await page.goBack();
  await page.click('.modal .btn-primary');
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.spin');
  m = await check();
  assert(!m.overflow && !m.title && !m.badge && !m.fix, `classic game bar wraps (${JSON.stringify(m)})`);
  assert(!m.board, 'scoreboard cells hold their gems at 200 %');
  await shot(page, 'e-zoom200-classic');
});

await browser.close();
server.close();
const failed = results.filter(([, e]) => e);
console.log(failed.length ? `\nEDGE FAILED: ${failed.length} of ${results.length}` : `\nEDGE OK — ${results.length} tests, screenshots in ${SHOTS}`);
process.exitCode = failed.length ? 1 : 0;
