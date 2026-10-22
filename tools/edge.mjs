#!/usr/bin/env node
// Edge-case regression tests (Playwright + Chromium) for the Beta 1–3 findings (docs/BETA-1.md) and the 1.5.0 / 1.6.0 features.
// Usage: node tools/edge.mjs          (SCREENSHOT_DIR=/some/dir to choose where PNGs go; ONLY=<regex> for a subset)
// Deterministic: Math.random is seeded in every page and timers use Playwright's fake clock.
// Each test opens a fresh context (service workers blocked so routes and storage are exact, except the
// real update-flow test, which allows them).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, APP_DIR } from './serve.mjs';
import { ALL_WORKS } from '../app/js/works.js';
import { encodeBackup, checksum } from '../app/js/progress.js';
import { APP_VERSION, INPUT_GUARD_MS } from '../app/js/config.js';
import { dailyPick, addDays, recordDaily, currentStreak, sanitizeDaily, emptyDaily, shareText, DAILY_DIFFS } from '../app/js/daily.js';

// Playwright: a local install first (node_modules at the repo root, as in CI:
// `npm install --no-save playwright@<version>`), then the global one (`npm root -g`).
async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall back to a global install */ }
  try {
    const globalRoot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  } catch (e) {
    console.error('Playwright not found. Install it locally (npm install --no-save playwright@1.56.1 && npx playwright install chromium) or globally.');
    throw e;
  }
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
 * written before the app boots; `clock` installs the fake clock at T0. Unless `fresh` is set,
 * empty settings are stored too, so the first-run introduction stays out of the way.
 */
async function open({ locale = 'es-ES', device = 'Pixel 7', viewport = null, seed = 7, storage = null, clock = false, before = null, allow = [], fresh = false, swAllowed = false, url = BASE } = {}) {
  const context = await browser.newContext({ ...devices[device], ...(viewport ? { viewport } : {}), locale, serviceWorkers: swAllowed ? 'allow' : 'block' });
  await context.addInitScript(seedRandom, seed);
  storage = fresh ? storage : { settings: '{}', ...(storage || {}) };
  if (!fresh && storage) {
    // Mark the introduction as seen unless the test says otherwise (or stores corrupt settings).
    try { const s = JSON.parse(storage.settings); if (s && typeof s === 'object' && !Array.isArray(s) && !('onboarded' in s)) storage.settings = JSON.stringify({ ...s, onboarded: true }); } catch { /* corrupt on purpose */ }
  }
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
  if (clock === 'paused') {
    await page.clock.pauseAt(T0 + 1000); // time only moves with runFor (exact timer checks)
    // Beta 6 (item 1): every screen reached by a tap ignores all taps for INPUT_GUARD_MS. With time
    // paused, page.click() first lets the guard of a fresh screen run out (Playwright would wait for
    // pointer events forever). Tests of the guard itself use mouse / programmatic clicks.
    const click = page.click.bind(page);
    page.click = async (sel, opts) => {
      if (await page.evaluate(() => !!document.querySelector('#app .screen.input-guard')).catch(() => false)) await page.clock.runFor(INPUT_GUARD_MS);
      return click(sel, opts);
    };
  }
  if (before) await before(page, context);
  await page.goto(url);
  return { context, page, errors };
}

/**
 * Beta 5 (item 1): a screen reached by a tap ignores taps on its main actions for INPUT_GUARD_MS.
 * With the paused fake clock, time has to move before tapping them.
 */
async function tapReady(page, sel) {
  await page.waitForSelector(sel);
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.click(sel);
}

const results = [];
async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(name)) return; // ONLY=<regex> runs a subset
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
    // Beta 2: stricter checks (lifeline effects, clock, charges, final-phase consistency).
    fxThreeRemoved: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [1, 2, 3], struck: [], armed: false } } }) },
    fxOverlap: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [1], struck: [1], armed: false } } }) },
    fxAtiumStorm: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [1, 2], struck: [], armed: true } } }) },
    fxAtiumStruck: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [1, 2], struck: [3], armed: false } } }) },
    fxTwoStruck: { classic: JSON.stringify({ ...good, pending: { ...good.pending, fx: { removed: [], struck: [1, 2], armed: false } } }) },
    chargesThree: { classic: JSON.stringify({ ...good, players: [{ ...p0, charges: { roshar: 3 } }, good.players[1]] }) },
    chargesHuge: { classic: JSON.stringify({ ...good, players: [{ ...p0, charges: { roshar: 99 } }, good.players[1]] }) },
    clockTooBig: { classic: JSON.stringify({ ...good, pending: { ...good.pending, clock: { remaining: 40000 } } }) },
    clockNegative: { classic: JSON.stringify({ ...good, pending: { ...good.pending, clock: { remaining: -5 } } }) },
    clockFloat: { classic: JSON.stringify({ ...good, pending: { ...good.pending, clock: { remaining: 12.5 } } }) },
    allInfusedSpin: { classic: JSON.stringify({ ...good, phase: 'spin', pending: null, players: [{ ...p0, charges: Object.fromEntries(CATS.map((c) => [c, 2])) }, good.players[1]] }) },
    allInfusedNotFinal: { classic: JSON.stringify({ ...good, players: [{ ...p0, charges: Object.fromEntries(CATS.map((c) => [c, 2])) }, good.players[1]] }) },
    finalNotReady: { classic: JSON.stringify({ ...good, pending: { ...good.pending, final: true } }) },
    finalIntroNotReady: { classic: JSON.stringify({ ...good, phase: 'final-intro', pending: null }) },
    resumeSpinReady: { classic: JSON.stringify({ ...good, phase: 'handoff', resume: 'spin', pending: null, players: [{ ...p0, charges: Object.fromEntries(CATS.map((c) => [c, 2])) }, good.players[1]] }) },
    quickClockBig: { quick: JSON.stringify({ v: 1, plan: ['roshar'], total: 1, index: 0, score: 0, correct: 0, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [], current: { id: good.pending.id, order: [0, 1, 2, 3], fx: null, clock: { remaining: 99999 } } }) },
    quickFxCombo: { quick: JSON.stringify({ v: 1, plan: ['roshar'], total: 1, index: 0, score: 0, correct: 0, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [], current: { id: good.pending.id, order: [0, 1, 2, 3], fx: { removed: [1, 2], struck: [], armed: true }, clock: null } }) },
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
    await page.waitForSelector('.home, .onboarding', { timeout: 5000 }).catch(() => { throw new Error(`${name}: home did not render`); });
    if (await page.$('.onboarding')) {
      // Corrupt settings: the introduction is shown again (settings.onboarded isn't true).
      assert(['invalidJSON', 'settingsArray'].includes(name), `${name}: introduction only for corrupt settings`);
      await page.click('.onb-skip');
      await page.waitForSelector('.home', { timeout: 5000 });
    }
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
      assert(vals.every((v) => /^(\d[\d.\s]*|—|\d+\s?%)$/.test(v.trim())), `${name}: stat tiles are numbers (${vals})`);
    }
    if (name === 'lastPlayers') {
      await page.click('.menu-btn >> nth=0');
      await page.waitForSelector('.setup .setup-player');
    }
    await context.close();
  }

  // A valid v1 save (old shape) still migrates and resumes; a valid v3 save resumes too, and so
  // does a player with every gem infused who is on the final question.
  const v1 = { v: 1, players: [{ name: 'Viejo', color: 'nalthis', charges: { roshar: 2 } }], current: 0, categories: CATS, phase: 'spin', used: {}, asked: 3 };
  const ready = { ...good, phase: 'final-intro', pending: null, players: [{ ...p0, charges: Object.fromEntries(CATS.map((c) => [c, 2])) }, good.players[1]] };
  for (const [name, save, expect] of [['v1', v1, '.spin'], ['v3', good, '.handoff'], ['ready', ready, '.handoff']]) {
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
    storage: { settings: '{"lang":"xx"}', stats: '{"quickGames":3}', 'other-app:keep': 'yes' }, fresh: true,
    before: (p) => p.route('**/js/main.js', (r) => r.abort()),
  });
  await page.waitForSelector('.boot-error');
  assert(await text(page, '.boot-error-title') === T('de', 'boot.title'), 'error title in German (device language)');
  assert(await text(page, '.boot-reset') === T('de', 'boot.reset'), 'reset button in German');
  await shot(page, 'e-boot-error-de');
  assert(await page.evaluate(() => document.activeElement?.classList.contains('boot-retry')), 'initial focus on the harmless "Try again"');
  // An offline cache that must survive the reset (the app has to keep working offline).
  await page.evaluate(async () => { const c = await caches.open('cosmere-trivia-vtest'); await c.put('probe.txt', new Response('ok')); });
  await page.click('.boot-reset');
  await page.waitForSelector('.boot-confirm:not([hidden])');
  assert(await text(page, '.boot-confirm-msg') === T('de', 'boot.confirm'), 'one-step confirmation in German');
  assert(await page.evaluate(() => document.activeElement?.classList.contains('boot-reset-no')), 'focus on "Cancel" in the confirmation');
  await shot(page, 'e-boot-error-confirm-de');
  await page.click('.boot-reset-no');
  await page.waitForSelector('.boot-confirm', { state: 'hidden' });
  assert(await page.evaluate(() => localStorage.getItem('cosmere-trivia:stats')) !== null, 'cancel clears nothing');
  await page.unroute('**/js/main.js');
  await page.click('.boot-reset');
  await Promise.all([page.waitForNavigation(), page.click('.boot-reset-yes')]);
  await page.waitForSelector('.onboarding'); // all data gone = first run again
  const left = await page.evaluate(() => Object.keys(localStorage));
  // Only the introduction's own progress (settings.onbStep) has been written since.
  assert(!left.some((k) => k.startsWith('cosmere-trivia:') && k !== 'cosmere-trivia:settings'), `app storage cleared (${left})`);
  assert(JSON.parse(await page.evaluate(() => localStorage.getItem('cosmere-trivia:settings')) || '{}').onboarded !== true, 'settings start over');
  assert(left.includes('other-app:keep'), 'other apps’ storage kept');
  assert((await page.evaluate(() => caches.keys())).includes('cosmere-trivia-vtest'), 'offline caches are not deleted');
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

// ------------------------------------------------------------------ 3. classic timer: remaining time, paused off-screen
const hide = (page, hidden) => page.evaluate((hd) => {
  Object.defineProperty(document, 'visibilityState', { value: hd ? 'hidden' : 'visible', configurable: true });
  Object.defineProperty(document, 'hidden', { value: hd, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

const savedClock = async (page) => JSON.parse(await lsGet(page, 'classic'))?.pending?.clock;
const secs = async (page) => Number(await text(page, '.timer-num'));
/** Home button / system Back on a revealed classic question: confirm "the time keeps running". */
async function leaveClassic(page, how = 'button') {
  if (how === 'button') await page.click('.topbar-back'); else await page.goBack();
  await page.waitForSelector('.modal');
  assert(await text(page, '#modal-msg') === T('es', 'classic.leaveTimerBody'), 'leaving warns that the time keeps running');
  await page.click('.modal .btn-primary');
  await page.waitForSelector('.home .menu-continue-classic');
}

await test('classic timer: runs in real time once revealed (hidden page, Home, reload, handoff); only an unrevealed question waits', async (use) => {
  const { page } = await use({ clock: 'paused', storage: { classic: JSON.stringify(classicSave()) } });
  await page.waitForSelector('.home .menu-continue-classic');
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  assert(!(await page.$('.qcard')), 'resume shows the pass-the-phone screen before the question');
  assert(await text(page, '.handoff-name') === 'Ana', 'handoff names the player whose turn it is');
  await page.clock.runFor(45_000); // never revealed: the handoff before the reveal is the only pause
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await secs(page) === 30, 'a question never shown starts at 30 s after any time on the handoff');
  await page.clock.runFor(3_500);
  const c1 = await savedClock(page);
  assert(c1.remaining >= 26_000 && c1.remaining <= 27_500 && typeof c1.savedAt === 'number', `time left persisted with its wall time about every second (${JSON.stringify(c1)})`);
  await page.clock.runFor(6_500);
  assert(await secs(page) === 20, `10 s later: 20 (got ${await secs(page)})`);
  const q = await text(page, '.qtext');

  // System clock jumps (manual change, DST…) don't touch the countdown while it is on screen.
  await page.clock.setSystemTime(T0 + 3_600_000);
  await page.clock.runFor(1_000);
  assert(await secs(page) === 19, `a system clock jump changes nothing (${await secs(page)})`);

  // Page hidden (Home, another app, lock screen): the time keeps running.
  await hide(page, true);
  assert((await savedClock(page)).remaining === 19_000, `hidden page persists the time left (${(await savedClock(page)).remaining})`);
  await page.clock.runFor(5_000);
  await hide(page, false);
  assert(await secs(page) === 14, `time away is deducted on return (${await secs(page)})`);
  await page.clock.runFor(2_000);
  assert(await secs(page) === 12, 'counts on once visible');

  // Reload: Home and the handoff count too, because the question was already seen.
  await page.reload();
  await page.waitForSelector('.home .menu-continue-classic');
  await page.clock.runFor(2_000);
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  await page.clock.runFor(1_000);
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.qtext') === q, 'same question after reload');
  assert(await secs(page) === 9, `reload, Home and handoff all count once revealed (${await secs(page)})`);

  // Home button: asks first (cancel stays), then saves and keeps counting.
  await page.click('.topbar-back');
  await page.waitForSelector('.modal');
  await shot(page, 'e-classic-leave-timer');
  await page.click('.modal .btn-ghost');
  await page.waitForSelector('.modal', { state: 'detached' });
  assert(await page.$('.qcard:not(.answered)'), 'cancel keeps the question on screen');
  await leaveClassic(page);
  await page.clock.runFor(3_000);
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  const afterHome = await secs(page);
  assert(afterHome >= 5 && afterHome <= 6, `time on Home counted (${afterHome})`);

  // A clock moved backwards gives no time back.
  await page.clock.setSystemTime(T0);
  await page.clock.runFor(1_000);
  assert(await secs(page) === afterHome - 1, 'a backwards system clock gives nothing back');

  // Android back: same confirmation; away long enough → timeout as soon as it is shown again.
  await leaveClassic(page, 'back');
  await page.clock.runFor(30_000);
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .continue:not([hidden])');
  assert(await text(page, '.verdict') === T('es', 'question.timeout'), 'time ran out while away: resolves as a timeout');
  await page.click('.qcard .continue');
  await page.waitForSelector('.handoff');
  assert(await text(page, '.handoff-name') === 'Bea', 'timeout passes the turn');
});

await test('classic timer: a question saved at 0 s resolves as a timeout; old deadline saves migrate', async (use) => {
  const save = classicSave();
  save.pending.clock = { remaining: 0 };
  let { page, context } = await use({ clock: true, storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .continue:not([hidden])');
  assert(await text(page, '.verdict') === T('es', 'question.timeout'), 'question with no time left resolves as timeout');
  const saved = JSON.parse(await lsGet(page, 'classic'));
  assert(saved.current === 1 && saved.pending === null, 'turn passed and saved');
  await context.close();
  // A 1.2 save with a wall-clock deadline 12 s ahead (the paused clock reads T0 + 1 s) becomes 12 s left.
  const old = classicSave();
  old.pending.clock = { deadline: T0 + 13_000 };
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(old) } }));
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.timer-num') === '12', `legacy deadline migrated to remaining time (${await text(page, '.timer-num')})`);
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
  const pausedLeft = JSON.parse(await lsGet(page, 'quick')).current.clock.remaining;
  assert(pausedLeft > 24_000 && pausedLeft <= 25_000, `the paused time left is persisted with the dialog open (${pausedLeft})`);
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
  await page.click('.modal .btn-danger'); // abandon
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
  assert(JSON.stringify(out.migr) === JSON.stringify([true, 4, 'normal', true, 'hard', 0]), `v1/v2 saves migrate to v4 (${out.migr})`);
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
  assert(strings.fr.quick.bestLevel === 'Meilleur score ({level})\u00a0: {n}', 'fr bestLevel with U+00A0');
  // In the app: the German spoiler filter group and the French best score (per level since 1.5.0).
  const { page, context } = await use({ locale: 'fr-FR', storage: { stats: '{"bestQuick":1234,"bestByLevel":{"normal":1234}}' } });
  await page.click('.menu-quick');
  await page.waitForSelector('.quick-best');
  const fmt = await page.evaluate(() => new Intl.NumberFormat('fr').format(1234));
  assert(await text(page, '.quick-best') === T('fr', 'quick.bestLevel', { level: T('fr', 'level.normal'), n: fmt }), `French best score from i18n (${await text(page, '.quick-best')})`);
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
  await page.click('.modal .btn-danger');
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.spin');
  m = await check();
  assert(!m.overflow && !m.title && !m.badge && !m.fix, `classic game bar wraps (${JSON.stringify(m)})`);
  assert(!m.board, 'scoreboard cells hold their gems at 200 %');
  await shot(page, 'e-zoom200-classic');
});

// ================================================================== Beta 2 findings
// ------------------------------------------------------------------ B2-1. quick: reload with the quit dialog open
await test('B2 quick timer: the quit dialog pauses only while on screen; a reload or hidden page counts', async (use) => {
  const { page } = await use({ clock: 'paused' });
  await page.click('.menu-quick');
  await tapReady(page, '.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .timer-num');
  await page.clock.runFor(5_000);
  await page.goBack();
  await page.waitForSelector('.modal');
  const c = JSON.parse(await lsGet(page, 'quick')).current.clock;
  assert(c.remaining === 25_000 && c.savedAt === null, `paused time saved when the dialog opens (${JSON.stringify(c)})`);
  await page.clock.runFor(40_000); // the player is deciding: no time passes
  await page.reload(); // leaving ends the pause
  await page.waitForSelector('.home .menu-continue-quick');
  await page.clock.runFor(10_000);
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard .timer-num');
  assert(await text(page, '.timer-num') === '15', `time behind the dialog is free, time away is not (${await text(page, '.timer-num')})`);
  await hide(page, true);
  await page.clock.runFor(4_000);
  await hide(page, false);
  assert(await text(page, '.timer-num') === '11', `hidden page keeps counting (${await text(page, '.timer-num')})`);
  await hide(page, true);
  await page.clock.runFor(20_000);
  await hide(page, false);
  await page.waitForSelector('.qcard .continue:not([hidden])');
  assert(await text(page, '.verdict') === T('es', 'question.timeout'), 'runs out while hidden → timeout on return');
});

// ------------------------------------------------------------------ B2-2. spoiler filter can't re-draw a pending question
await test('B2 spoiler filter: a question already shown stays pending (classic and quick), with its time left', async (use) => {
  const q = QS.find((x) => x.d <= 2 && x.c === 'roshar');
  const save = classicSave({ pending: { id: q.id, cat: q.c, order: [2, 0, 3, 1], final: false, clock: { remaining: 12_000 } } });
  const hideIt = JSON.stringify({ disabledWorks: [q.w] });
  let { page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(save), settings: hideIt } });
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.qtext') === q.q, 'classic: same question although its book is now filtered out');
  assert(await text(page, '.timer-num') === '12', 'classic: time left kept (no fresh timer)');
  assert((await page.locator('.qcard .option-text').allTextContents()).map((x) => x.trim())[1] === q.o[0], 'classic: same option order');
  await context.close();
  // Changing the filter in Settings mid-game (Home → Settings → Continue) changes nothing either.
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(save) } }));
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  await page.click('.topbar-back');
  await page.click('.modal .btn-primary'); // "the time keeps running" (the paused clock doesn't move)
  await page.click('.small-btn >> nth=1');
  await page.click('.spoiler-none');
  await page.click('.topbar .icon-btn');
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard');
  // Only the input guards' INPUT_GUARD_MS on the screens in between ran (beta 6: page.click lets them run out).
  const left = Number(await text(page, '.timer-num'));
  assert(await text(page, '.qtext') === q.q && left >= 10 && left <= 12, `classic: settings change mid-question gives no re-draw (${left})`);
  await context.close();
  const run = { v: 1, plan: Array(15).fill('roshar'), total: 15, index: 3, score: 300, correct: 3, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [q.id], current: { id: q.id, order: [3, 2, 1, 0], fx: { removed: [], struck: [], armed: false }, clock: { remaining: 9_000 } } };
  ({ page, context } = await use({ clock: 'paused', storage: { quick: JSON.stringify(run), settings: hideIt } }));
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard .timer-num');
  assert(await text(page, '.qtext') === q.q, 'quick: same question although filtered out');
  assert(await text(page, '.timer-num') === '9', 'quick: time left kept');
});

// ------------------------------------------------------------------ B2-3. i18n templates take the label as-is
await test('B2 strings: {category}/{world} templates read well with any label (articles included), all 5 languages', async (use) => {
  const walk = (o, f, p = '') => Object.entries(o).forEach(([k, v]) => (typeof v === 'object' ? walk(v, f, `${p}${k}.`) : f(`${p}${k}`, v)));
  for (const lang of LANGS) {
    walk(strings[lang], (k, v) => {
      for (const m of v.matchAll(/\{(category|world)\}/g)) {
        const before = v.slice(0, m.index);
        // The label may only start the text, follow a colon / middle dot, or be exclaimed on its own.
        assert(before === '' || /(:|·)[  ]$/.test(before) || /^[¡¿]?$/.test(before), `${lang} ${k}: "{${m[1]}}" must be insertable as-is ("${v}")`);
      }
    });
  }
  const exact = {
    es: { 'classic.charge': ['cosmere', '+1 carga · El Cosmere (1/2)'], 'classic.infused': ['cosmere', 'Gema infundida: El Cosmere'] },
    de: { 'classic.charge': ['cosmere', '+1 Ladung: Das Kosmeer (1/2)'], 'classic.infused': ['otros', 'Edelstein aufgeladen: Andere Welten'] },
  };
  for (const [lang, keys] of Object.entries(exact)) {
    for (const [k, [cat, want]] of Object.entries(keys)) {
      const got = T(lang, k, { category: strings[lang].cat[cat], n: 1 });
      assert(got === want, `${lang} ${k} → "${got}"`);
    }
  }
  assert(strings.es.lifeline.title === 'Ayudas' && strings.es.stats.lifelines === 'Ayudas usadas' && strings.es.about.lifelines === 'Ayudas', 'es: lifelines group is "Ayudas"');
  assert(strings.es.wheel.wildcard === 'Comodín', 'es: the wheel sector stays "Comodín"');
  for (const lang of LANGS) {
    const group = [strings[lang].lifeline.title, strings[lang].lifeline.help, strings[lang].stats.lifelines, strings[lang].about.lifelines, strings[lang].quick.introLifelines].join(' ').toLowerCase();
    assert(!group.includes(strings[lang].wheel.wildcard.toLowerCase()), `${lang}: lifelines and the wildcard sector have different names`);
    assert(strings[lang].about.rule6, `${lang}: About explains the already-infused rule`);
  }
  // In the game: German infusion feedback with an article label, and 6 rules in About.
  const p0 = { name: 'Ana', color: 'roshar', charges: { cosmere: 1 }, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  const qc = QS.find((x) => x.c === 'cosmere' && x.d <= 2);
  const deQ = JSON.parse(readFileSync(join(APP_DIR, 'data', 'questions.de.json'), 'utf8')).find((x) => x.id === qc.id);
  const save = classicSave({ players: [p0, { ...p0, name: 'Bea', color: 'sel', charges: {} }], pending: { id: qc.id, cat: 'cosmere', order: [0, 1, 2, 3], final: false } });
  const { page } = await use({ locale: 'de-DE', storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .option');
  await page.locator('.qcard .option').nth(0).click(); // order [0,1,2,3]: the first one is right
  await page.waitForSelector('.feedback-extra');
  const fb = await text(page, '.feedback-extra');
  assert(fb.includes(T('de', 'classic.infused', { category: 'Das Kosmeer' })), `German feedback "${fb}" (${deQ ? 'de data' : 'en fallback'})`);
  await shot(page, 'e-b2-de-infused');
});

// ------------------------------------------------------------------ B2-4. streak limit on the last gem
await test('B2 classic: the 3rd answer in a row infusing the last gem says both things and passes the turn', async (use) => {
  const qc = QS.find((x) => x.c === 'cosmere' && x.d <= 2);
  const full = Object.fromEntries(CATS.map((c) => [c, 2]));
  const ana = { name: 'Ana', color: 'roshar', charges: { ...full, cosmere: 1 }, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  const bea = { name: 'Bea', color: 'sel', charges: {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  const save = classicSave({ players: [ana, bea], streak: 2, pending: { id: qc.id, cat: 'cosmere', order: [0, 1, 2, 3], final: false } });
  const { page } = await use({ storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.locator('.qcard .option').nth(0).click();
  await page.waitForSelector('.feedback-extra');
  const lines = (await page.locator('.feedback-extra .outcome').allTextContents()).map((x) => x.trim());
  assert(lines.includes(T('es', 'classic.infused', { category: 'El Cosmere' })), `infused line (${lines})`);
  assert(lines.includes(T('es', 'classic.allInfusedNext')), `all gems infused, final next turn (${lines})`);
  assert(lines.includes(T('es', 'classic.streakPass', { n: 3, name: 'Bea' })), `turn passes (${lines})`);
  await shot(page, 'e-b2-streak-last-gem');
  await page.click('.qcard .continue');
  await page.waitForSelector('.handoff');
  assert(await text(page, '.handoff-name') === 'Bea', 'Bea plays next');
  const st = JSON.parse(await lsGet(page, 'classic'));
  assert(st.current === 1 && st.streak === 0, 'turn passed and saved');
  // Bea misses → Ana's next turn opens on the final question.
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.spin');
});

// ------------------------------------------------------------------ B2-5. setup avatars, home confirmations, infused-gem notice
await test('B2 UI: live setup avatars, specific "new game" confirmations, already-infused notice stays 2.5 s or until tapped', async (use) => {
  let { page, context } = await use({});
  await page.click('.menu-btn >> nth=0');
  await page.waitForSelector('.setup');
  await page.fill('#pname-0', '');
  assert(await text(page, '.setup-player >> nth=0 >> .avatar-initial') === '1', 'empty name → player number');
  await page.locator('#pname-0').pressSequentially('élan');
  assert(await text(page, '.setup-player >> nth=0 >> .avatar-initial') === 'É', `avatar initial updates while typing (${await text(page, '.setup-player >> nth=0 >> .avatar-initial')})`);
  await page.fill('#pname-0', '🔥Kal');
  await page.dispatchEvent('#pname-0', 'input');
  assert(await text(page, '.setup-player >> nth=0 >> .avatar-initial') === '🔥', 'emoji initial while typing');
  await context.close();

  const run = { v: 1, plan: Array(15).fill('roshar'), total: 15, index: 2, score: 200, correct: 2, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: [], current: null };
  ({ page, context } = await use({ storage: { classic: JSON.stringify(classicSave()), quick: JSON.stringify(run) } }));
  await page.click('.menu-btn:not(.menu-continue) >> nth=0');
  await page.waitForSelector('.modal');
  assert(await text(page, '#modal-msg') === T('es', 'home.newGameConfirmClassic'), 'classic: specific confirmation');
  assert((await text(page, '#modal-msg')).includes('partida clásica en curso'), 'names the classic game');
  await page.click('.modal .btn-ghost');
  await page.click('.menu-quick');
  await page.waitForSelector('.modal');
  assert((await text(page, '#modal-msg')).includes('partida rápida en curso'), 'quick: specific confirmation');
  await page.click('.modal .btn-ghost');
  await context.close();

  // Wheel lands on an infused gem: the rule stays on screen ~2.5 s, or until tapped.
  const ana = { name: 'Ana', color: 'roshar', charges: { roshar: 2 }, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  // Two worlds still open (with only one, 2.0.0 goes straight to it: see the 2.0 wildcard test).
  const save = classicSave({ players: [ana], categories: ['roshar', 'sel', 'nalthis'], phase: 'spin', pending: null });
  for (const tap of [false, true]) {
    ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(save) } }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('.menu-continue-classic');
    await page.waitForSelector('.spin');
    await page.evaluate(() => { Math.random = () => 0.01; }); // first sector: Roshar (infused)
    await page.click('.spin .sticky-actions .btn-primary');
    await page.clock.runFor(700); // the (reduced) spin lands
    await page.waitForSelector('.wheel-status.notice');
    assert(await text(page, '.wheel-status') === T('es', 'wheel.infusedPick', { category: 'Roshar' }), 'already-infused notice');
    if (!tap) {
      await shot(page, 'e-b2-infused-notice');
      await page.clock.runFor(1_500);
      assert(await page.$('.spin'), 'notice still on screen after 1.5 s');
      await page.clock.runFor(1_200);
      await page.waitForSelector('.choose');
    } else {
      await page.click('.wheel-status');
      await page.waitForSelector('.choose');
    }
    await context.close();
  }
});

// ------------------------------------------------------------------ B2-6. first-run introduction
await test('B2 onboarding: first launch asks what you read, explains the rules, never shows again; reachable from About', async (use) => {
  for (const [locale, lang] of [['es-ES', 'es'], ['de-DE', 'de'], ['fr-FR', 'fr'], ['it-IT', 'it'], ['en-GB', 'en']]) {
    const { page, context } = await use({ locale, fresh: true });
    await page.waitForSelector('.onboarding');
    assert(await text(page, '.onb-title') === T(lang, 'onboarding.readTitle'), `${lang}: step 1 title`);
    if (lang === 'es' || lang === 'de') await shot(page, `e-b2-onboarding-1-${lang}`);
    if (lang !== 'es') {
      assert(await page.isDisabled('.onb-next'), `${lang}: nothing selected yet, "Next" disabled`);
      await page.click('.onb-readall'); // "I've read everything" goes straight to the rules
      await page.waitForSelector('.onb-rules');
      if (lang === 'de') await shot(page, 'e-b2-onboarding-2-de');
      await page.click('.onb-skip');
      await page.waitForSelector('.home');
      await context.close();
      continue;
    }
    // Nothing selected at first: "Next" is disabled and says why; "Todo" enables it.
    assert(JSON.parse(await lsGet(page, 'settings')).disabledWorks.length === ALL_WORKS.length, 'first run starts with nothing selected');
    assert(await page.isDisabled('.onb-next'), '"Siguiente" disabled with nothing selected');
    assert(await page.isVisible('.onb-why') && await text(page, '.onb-why') === T('es', 'onboarding.pickOne'), 'the reason is shown');
    await page.click('.spoiler-all');
    assert(await page.isEnabled('.onb-next') && await page.locator('.onb-why').isHidden(), '"Siguiente" enabled once something is selected');
    await page.click('.spoiler-none');
    assert(await page.isDisabled('.onb-next'), '"Nada" disables it again');
    await page.click('.spoiler-all');
    await page.uncheck('#onb-g-scadrial');
    await page.click('.work-group.collapsed:has(#onb-g-scadrial) .work-toggle');
    await page.check('#onb-final-empire');
    assert(await text(page, '.work-group.collapsed:has(#onb-g-scadrial) .work-count') === '1/11', 'per-world count');
    await shot(page, 'e-b2-onboarding-1-es-open');
    let saved = JSON.parse(await lsGet(page, 'settings'));
    assert(saved.disabledWorks.includes('well-of-ascension') && !saved.disabledWorks.includes('final-empire') && !saved.disabledWorks.includes('way-of-kings'), 'spoiler filter saved from the introduction');
    await page.click('.onb-next');
    await page.waitForSelector('.onb-rules li >> nth=2');
    assert(await text(page, '.onb-step') === T('es', 'onboarding.step', { n: 2, total: 3 }), 'step 2 of 3');
    await shot(page, 'e-b2-onboarding-2-es');
    await page.click('.onb-next');
    await page.waitForSelector('.onb-start');
    await shot(page, 'e-b2-onboarding-3-es');
    await page.click('.onb-start');
    await page.waitForSelector('.home');
    saved = JSON.parse(await lsGet(page, 'settings'));
    assert(saved.onboarded === true, 'introduction marked as seen');
    await page.reload();
    await page.waitForSelector('.home');
    assert(!(await page.$('.onboarding')), 'not shown again');
    await page.click('.small-btn >> nth=2');
    await page.waitForSelector('.about .about-intro');
    assert(await page.locator('.about ol li').count() === 10, 'About lists 10 rules (already-infused gem, timer, final miss, full round, group games)');
    await page.click('.about-intro');
    await page.waitForSelector('.onboarding');
    assert(await page.isChecked('#onb-final-empire') && !(await page.isChecked('#onb-well-of-ascension')), 'introduction reflects the saved filter');
    await page.click('.onb-skip');
    await page.waitForSelector('.about');
    await context.close();
  }
  // Skipping on the first step also counts as seen (with nothing picked, nothing is filtered).
  const { page } = await use({ fresh: true });
  await page.click('.onb-skip');
  await page.waitForSelector('.home');
  assert(JSON.parse(await lsGet(page, 'settings')).disabledWorks.length === 0, 'skipping with nothing picked filters nothing');
  assert(!(await page.$('.home-empty')), 'so Home has questions');
  await page.reload();
  await page.waitForSelector('.home');
  assert(!(await page.$('.onboarding')), 'skipped introduction never comes back');
});

// ------------------------------------------------------------------ B2-7. quick results survive a reload
await test('B2 quick: reloading on the results screen shows the results once more', async (use) => {
  const works = ['eleventh-metal'];
  const n = poolOf(works).length;
  const { page } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks(works), level: 'easy' }) } });
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  for (let k = 0; k < n; k++) {
    await page.waitForSelector('.quick .qcard .option');
    await answer(page, k === 0);
    await page.click('.qcard .continue');
  }
  await page.waitForSelector('.quick-result');
  const score = await text(page, '.result-score');
  const count = await text(page, '.quick-result .lead');
  await page.reload();
  await page.waitForSelector('.quick-result');
  assert(await text(page, '.result-score') === score && await text(page, '.quick-result .lead') === count, 'same results after reload');
  const stats = JSON.parse(await lsGet(page, 'stats'));
  assert(stats.quickGames === 1, `the game is counted once (${stats.quickGames})`);
  await page.click('.quick-result .btn-ghost');
  await page.waitForSelector('.home');
  await page.reload();
  await page.waitForSelector('.home');
  assert(!(await page.$('.quick-result')), 'dismissed results are not shown again');
  assert(await lsGet(page, 'quickResult') === null, 'summary removed once dismissed');
});

// ------------------------------------------------------------------ B2-8. Home at 200 % text, 320 px
await test('B2 home at 200 % text and 320 px: the bottom buttons wrap instead of overflowing', async (use) => {
  for (const lang of ['es', 'de', 'fr']) {
    const { page, context } = await use({ locale: `${lang}-${lang.toUpperCase()}`, viewport: { width: 320, height: 568 } });
    await page.waitForSelector('.home');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.locator('.small-row').scrollIntoViewIfNeeded();
    const m = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      btns: [...document.querySelectorAll('.small-btn')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }),
      cut: [...document.querySelectorAll('.small-btn span:not(.icon)')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > e.closest('.small-btn').getBoundingClientRect().right + 1).map((e) => e.textContent),
      // A label may wrap between words, never inside one: at most one line per word.
      split: [...document.querySelectorAll('.small-btn span:not(.icon)')].filter((e) => {
        const r = document.createRange(); r.selectNodeContents(e);
        const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
        return lines > e.textContent.trim().split(/\s+/).length;
      }).map((e) => e.textContent),
    }));
    assert(!m.split.length, `${lang}: no label broken mid-word (${m.split})`);
    assert(!m.overflow, `${lang}: no horizontal scroll (${JSON.stringify(m)})`);
    assert(m.btns.every(([l, r]) => l >= 0 && r <= 320), `${lang}: buttons inside the screen (${JSON.stringify(m.btns)})`);
    assert(!m.cut.length, `${lang}: labels not cut (${m.cut})`);
    await shot(page, `e-b2-home-200-${lang}`);
    await context.close();
  }
});

// ------------------------------------------------------------------ B2-9. engine: streak + last gem, stricter validation
await test('B2 engine: streak ends on the last gem, fx/clock/charges validation', async (use) => {
  const { page } = await use({});
  await page.waitForSelector('.home');
  const r = await page.evaluate(async () => {
    const g = await import('./js/game.js');
    const s = g.newClassicGame({ players: [{ name: 'A', color: 'roshar' }, { name: 'B', color: 'sel' }], timer: true, categories: ['roshar', 'sel'], level: 'normal' });
    s.current = 0; s.phase = 'question'; s.streak = 2;
    s.players[0].charges = { roshar: 2, sel: 1 };
    s.pending = { id: 'x', cat: 'sel', order: [0, 1, 2, 3], final: false };
    const res = g.applyAnswer(s, true);
    const fx = (o) => g.isValidFx({ removed: [], struck: [], armed: false, ...o });
    return {
      res: [res.infused, res.allInfused, res.streakEnd, res.next], phase: s.phase, cur: s.current, valid: g.isValidState(s),
      fx: [fx({}), fx({ removed: [1, 2] }), fx({ struck: [3] }), fx({ armed: true }), fx({ removed: [1, 2, 3] }), fx({ removed: [1], struck: [1] }), fx({ removed: [1, 2], armed: true }), fx({ struck: [1, 2] }), fx({ removed: [0] })],
      clock: [g.isValidClock({ remaining: 0 }), g.isValidClock({ remaining: 30000 }), g.isValidClock({ remaining: 30001 }), g.isValidClock({ remaining: -1 }), g.isValidClock({ deadline: 5 })],
    };
  });
  assert(JSON.stringify(r.res) === JSON.stringify([true, true, true, 'B']) && r.phase === 'handoff' && r.cur === 1 && r.valid, `streak + last gem (${JSON.stringify(r)})`);
  assert(JSON.stringify(r.fx) === JSON.stringify([true, true, true, true, false, false, false, false, false]), `fx rules (${r.fx})`);
  assert(JSON.stringify(r.clock) === JSON.stringify([true, true, false, false, false]), `clock rules (${r.clock})`);
});

// ================================================================== Beta 3 findings
const LL = () => ({ atium: 1, stormlight: 1, breath: 1 });
const quickRun = (over = {}) => ({ v: 1, plan: Array(15).fill('roshar'), total: 15, index: 3, score: 300, correct: 3, level: 'normal', lifelines: LL(), seen: [], current: null, ...over });

// ------------------------------------------------------------------ B3-1. timer decision: engine + copy
await test('B3 timer: clockLeft deducts away time (clock back across a load → timed out, NaN → no deduction, never below 0); setup and leave copy in 5 languages', async (use) => {
  const { page } = await use({});
  await page.waitForSelector('.home');
  const r = await page.evaluate(async () => {
    const g = await import('./js/game.js');
    const now = 1_000_000;
    return [
      g.clockLeft({ remaining: 20_000, savedAt: now - 5_000 }, now), // away 5 s
      g.clockLeft({ remaining: 20_000, savedAt: now + 60_000 }, now), // clock moved back across a load: timed out (beta 6b N2)
      g.clockLeft({ remaining: 20_000, savedAt: NaN }, now),
      g.clockLeft({ remaining: 20_000, savedAt: now - 99_000 }, now), // capped at 0
      g.clockLeft({ remaining: 20_000, savedAt: null }, now), // paused / not revealed
      g.clockLeft({ remaining: 20_000, savedAt: now - 5_000 }, NaN),
    ];
  });
  assert(JSON.stringify(r) === JSON.stringify([15_000, 0, 20_000, 0, 20_000, 20_000]), `clockLeft (${r})`);
  for (const lang of LANGS) {
    for (const k of ['classic.leaveTimerTitle', 'classic.leaveTimerBody', 'classic.leaveTimerYes', 'classic.leaveTimerNo', 'setup.timerPause']) assert(T(lang, k), `${lang}: ${k}`);
  }
  assert(T('es', 'classic.leaveTimerBody').startsWith('Si sales, el tiempo de la pregunta sigue corriendo'), 'es leave copy as decided');
  await page.click('.menu-btn >> nth=0');
  await page.waitForSelector('.setup .setup-timer-note');
  assert(await text(page, '.setup-timer-note') === T('es', 'setup.timerPause'), 'setup explains that no timer = free pauses');
});

// ------------------------------------------------------------------ B3-2. onboarding: first-run rules, reload, 320 px at 200 %
await test('B3 onboarding: null/corrupt settings show it, reload keeps step and picks, players are marked silently, 320×568 at 200 %', async (use) => {
  for (const settings of ['null', '"x"', '{"onboarded":"yes"}']) {
    const { page, context } = await use({ storage: { settings } });
    await page.waitForSelector('.onboarding', { timeout: 5000 }).catch(() => { throw new Error(`settings ${settings}: introduction not shown`); });
    await context.close();
  }
  // Reload on step 2 comes back to step 2 with the picks kept.
  let { page, context } = await use({ fresh: true });
  await page.waitForSelector('.onboarding');
  await page.check('#onb-g-roshar');
  await page.click('.onb-next');
  await page.waitForSelector('.onb-rules');
  await page.reload();
  await page.waitForSelector('.onb-rules');
  const st = JSON.parse(await lsGet(page, 'settings'));
  assert(st.onbStep === 1 && st.onboarded !== true, `reload mid-introduction resumes at its step (${JSON.stringify(st)})`);
  assert(!st.disabledWorks.some((w) => poolOf([w]).some((q) => q.c === 'roshar')) && st.disabledWorks.length > 0, 'picks kept after reload');
  await page.click('.onb-back');
  await page.waitForSelector('#onb-g-roshar');
  assert(await page.isChecked('#onb-g-roshar') && await page.isEnabled('.onb-next'), 'step 1 shows the kept picks');
  await context.close();
  // Existing stats or a saved game without the flag: not a first run; the flag is written silently.
  for (const storage of [{ stats: JSON.stringify({ quickGames: 2, bestQuick: 900 }) }, { quick: JSON.stringify(quickRun()) }]) {
    ({ page, context } = await use({ fresh: true, storage: { settings: '{"lang":"es"}', ...storage } }));
    await page.waitForSelector('.home');
    assert(!(await page.$('.onboarding')), `players skip the introduction (${Object.keys(storage)})`);
    assert(JSON.parse(await lsGet(page, 'settings')).onboarded === true, 'flag written');
    await context.close();
  }
  // 320×568 with 200 % text: no overflow, counters inside the cards, "Siguiente" reachable.
  ({ page, context } = await use({ fresh: true, viewport: { width: 320, height: 568 } }));
  await page.waitForSelector('.onboarding');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.click('.spoiler-all');
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    toggles: [...document.querySelectorAll('.work-toggle')].filter((b) => b.getBoundingClientRect().right > b.closest('.onb-works').getBoundingClientRect().right + 1).length,
  }));
  assert(m.sw <= 320 && m.toggles === 0, `no horizontal overflow, counters inside (${JSON.stringify(m)})`);
  await page.screenshot({ path: join(SHOTS, 'e-b3-onb-320-200.png'), fullPage: true });
  await page.locator('.onb-next').scrollIntoViewIfNeeded();
  const box = await page.locator('.onb-next').boundingBox();
  assert(box && box.y >= 0 && box.y + box.height <= 568 + 1, `"Siguiente" reachable (${JSON.stringify(box)})`);
  await shot(page, 'e-b3-onb-320-200-next');
  await page.click('.onb-next');
  await page.waitForSelector('.onb-rules');
});

// ------------------------------------------------------------------ B3-3. empty spoiler filter
await test('B3 empty filter: Home banner → Settings; classic setup/continue and quick say so instead of spinning', async (use) => {
  const none = JSON.stringify({ disabledWorks: ALL_WORKS });
  const spin = classicSave({ phase: 'spin', pending: null });
  let { page, context } = await use({ storage: { settings: none, classic: JSON.stringify(spin), quick: JSON.stringify(quickRun()) } });
  await page.waitForSelector('.home .home-empty');
  assert(await text(page, '.home-empty .banner') === T('es', 'errors.emptyFilter'), 'Home warns');
  await shot(page, 'e-b3-home-empty');
  await page.click('.home-empty .empty-filter-settings');
  await page.waitForSelector('.settings');
  await page.goBack();
  await page.waitForSelector('.home');
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.classic-empty', { timeout: 5000 });
  assert(await page.$('.classic-empty .empty-filter-settings'), 'continuing a classic game explains and offers Settings');
  await page.click('.classic-empty .stack-actions .btn-primary');
  await page.waitForSelector('.home .menu-continue-classic');
  assert(await lsGet(page, 'classic') !== null, 'the classic game stays saved');
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick-empty', { timeout: 5000 });
  await page.click('.quick-empty .stack-actions .btn-primary');
  await page.waitForSelector('.home .menu-continue-quick');
  await page.click('.menu-users, .menu-btn:has-text("' + T('es', 'home.classic') + '")');
  await page.click('.modal .btn-primary');
  await page.waitForSelector('.setup .empty-filter');
  assert(await page.isDisabled('.setup .sticky-actions .btn-primary'), 'setup: start disabled with the filter empty');
  await context.close();
  // A resumed question whose world is now filtered out still plays; afterwards the game says it can't go on.
  const q = QS.find((x) => x.d <= 2 && x.c === 'roshar');
  const one = classicSave({ players: [classicSave().players[0]], pending: { id: q.id, cat: q.c, order: [0, 1, 2, 3], final: false }, timer: false });
  ({ page, context } = await use({ storage: { settings: none, classic: JSON.stringify(one) } }));
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.qcard');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.classic-empty', { timeout: 5000 });
});

// ------------------------------------------------------------------ B3-4. wildcard choice survives a reload on the handoff
await test('B3 classic: reload on the handoff of a resumed wildcard choice keeps the choice', async (use) => {
  const { page } = await use({ storage: { classic: JSON.stringify(classicSave({ phase: 'choose', pending: null })) } });
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  assert(JSON.parse(await lsGet(page, 'classic')).resume === 'choose', 'resume remembers the choice');
  await page.reload();
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.choose .cat-choice');
});

// ------------------------------------------------------------------ B3-5. stricter save validation
await test('B3 validation: pending category, unique colors, quick score/correct, result vs best score', async (use) => {
  const good = classicSave();
  const qR = QS.find((x) => x.c === 'roshar');
  const qN = QS.find((x) => x.c === 'nalthis');
  const p = good.players;
  const cases = {
    pendingCatMismatch: { classic: JSON.stringify({ ...good, pending: { id: qR.id, cat: 'sel', order: [0, 1, 2, 3], final: false } }) },
    pendingCatNotInGame: { classic: JSON.stringify({ ...good, categories: ['roshar', 'sel'], pending: { id: qN.id, cat: 'nalthis', order: [0, 1, 2, 3], final: false } }) },
    dupColors: { classic: JSON.stringify({ ...good, players: [p[0], { ...p[1], color: p[0].color }] }) },
    quickCorrectGtIndex: { quick: JSON.stringify(quickRun({ correct: 4, score: 400 })) },
    quickScoreHigh: { quick: JSON.stringify(quickRun({ score: 601 })) },
    quickScoreLow: { quick: JSON.stringify(quickRun({ score: 299 })) },
  };
  for (const [name, storage] of Object.entries(cases)) {
    const { page, context } = await use({ storage });
    await page.waitForSelector('.home');
    assert(!(await page.$('.menu-continue')), `${name}: rejected`);
    await context.close();
  }
  const ok = { score: 1500, correct: 10, total: 15, level: 'normal', record: true };
  for (const [name, res, best, shown] of [
    ['recordNotBest', ok, 1200, false], ['scoreAboveBest', { ...ok, record: false }, 1400, false],
    ['scoreTooLowForCorrect', { ...ok, score: 900, record: false }, 2000, false], ['consistent', ok, 1500, true],
  ]) {
    const { page, context } = await use({ storage: { quickResult: JSON.stringify(res), stats: JSON.stringify({ bestQuick: best, quickGames: 1 }) } });
    await page.waitForSelector(shown ? '.quick-result' : '.home');
    assert(!!(await page.$('.quick-result')) === shown, `${name}: result ${shown ? 'shown' : 'rejected'}`);
    if (!shown) assert(await lsGet(page, 'quickResult') === null, `${name}: deleted`);
    await context.close();
  }
});

// ------------------------------------------------------------------ B3-6. repeats across games
await test('B3 repeats: recently seen ids persist per language (ring of 150) and draws prefer unseen, then least recent; practice says when they repeat', async (use) => {
  const roshar = QS.filter((q) => q.c === 'roshar').map((q) => q.id);
  const fresh = roshar[5];
  const recent = roshar.filter((id) => id !== fresh);
  let { page, context } = await use({ storage: { recent: JSON.stringify({ es: recent, en: ['zzz'] }) } });
  await page.waitForSelector('.home');
  const r = await page.evaluate(async () => {
    const core = await import('./js/core.js');
    const a = core.makePool({}).draw('roshar').id; // the only one not seen lately
    const b = core.makePool({ roshar: [a] }).draw('roshar').id; // then the least recently seen
    for (let i = 0; i < 200; i++) core.noteSeen(`fake-${i}`);
    const stored = JSON.parse(localStorage.getItem('cosmere-trivia:recent'));
    return { a, b, len: stored.es.length, last: stored.es.at(-1), en: stored.en };
  });
  assert(r.a === fresh, `unseen question first (${r.a})`);
  assert(r.b === recent[0], `then the least recently seen (${r.b} vs ${recent[0]})`);
  assert(r.len === 150 && r.last === 'fake-199' && JSON.stringify(r.en) === '["zzz"]', `ring buffer of 150 per language (${JSON.stringify(r)})`);
  await context.close();

  // A quick game after another one avoids the questions of the first.
  ({ page, context } = await use({ clock: true }));
  const playQuick = async () => {
    await page.click('.menu-quick');
    await page.click('.quick-intro .sticky-actions .btn-primary');
    const ids = [];
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('.quick .qcard:not(.answered) .option');
      ids.push(await text(page, '.qtext'));
      await answer(page, true);
      await page.click('.qcard .continue');
    }
    await page.goBack();
    await page.click('.modal .btn-danger');
    await page.waitForSelector('.home');
    return ids;
  };
  const first = await playQuick();
  await page.reload();
  await page.waitForSelector('.home');
  const second = await playQuick();
  assert(!second.some((q) => first.includes(q)), 'second quick game repeats nothing from the first (across a reload)');
  await context.close();

  // Practice on a tiny filter: once everything was seen, it says so.
  const counts = {};
  for (const q of QS) counts[q.w] = (counts[q.w] || 0) + 1;
  const [w, n] = Object.entries(counts).filter(([, k]) => k >= 2).sort((a, b) => a[1] - b[1])[0];
  ({ page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks([w]) }) } }));
  await page.click('.menu-btn >> nth=2');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  let shownAt = -1;
  for (let i = 0; i <= n; i++) {
    await page.waitForSelector('.practice .qcard:not(.answered) .option');
    if (await page.$('.practice-repeat')) { shownAt = i; break; }
    await answer(page, true);
    await page.click('.qcard .continue');
  }
  assert(shownAt === n, `"all seen" notice right after the ${n} questions (${shownAt})`);
  assert(await text(page, '.practice-repeat') === T('es', 'practice.allSeen'), 'notice text');
});

// ------------------------------------------------------------------ B3-7. lifeline labels
await test('B3 lifelines: "used" label is gender-neutral; French lifeline names are capitalized everywhere', async () => {
  const gendered = { es: /usad[ao]\s*$|: ya usad/, it: /usat[ao]\s*$/, fr: /utilisée?\s*$/, de: /^$/, en: /^$/ };
  for (const lang of LANGS) {
    const used = T(lang, 'lifeline.used');
    assert(used.includes('{name}') && !gendered[lang].test(used), `${lang}: neutral "used" label (${used})`);
  }
  const fr = JSON.stringify(Object.values(strings.fr).flatMap(function vals(v) { return typeof v === 'object' ? Object.values(v).flatMap(vals) : [v]; }));
  for (const name of ['Atium', 'Fulgiflamme', 'Souffle']) {
    assert(!new RegExp(`(^|[\\s’'"(])${name.toLowerCase()}\\b`).test(fr), `fr: "${name}" always capitalized`);
  }
});

// ------------------------------------------------------------------ B3-8. victory screen
await test('B3 victory: per-player stats and duration; "Play again" keeps players, timer and level', async (use) => {
  const cats = ['roshar', 'sel'];
  const save = classicSave({
    phase: 'final-intro', pending: null, timer: false, level: 'hard', categories: cats, asked: 9, playMs: 754_000,
    players: [
      { name: 'Ana', color: 'roshar', charges: { roshar: 2, sel: 2 }, lifelines: { atium: 0, stormlight: 1, breath: 0 }, stats: { answered: 8, correct: 6, lifelines: 2 } },
      { name: 'Bea', color: 'sel', charges: { roshar: 1 }, lifelines: LL(), stats: { answered: 4, correct: 1, lifelines: 0 } },
    ],
  });
  const { page } = await use({ storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.click('.btn-final');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.victory .vstats-player');
  const rows = await page.$$eval('.vstats-player', (els) => els.map((e) => [...e.querySelectorAll('dd')].map((d) => d.textContent.trim().replace(/\u00a0/g, ' '))));
  assert(JSON.stringify(rows) === JSON.stringify([['7/9', '78 %', '2', '2/2'], ['1/4', '25 %', '0', '0/2']]), `per-player stats (${JSON.stringify(rows)})`);
  assert(/^Duración: 12:3\d$/.test(await text(page, '.victory-duration')), `duration shown (${await text(page, '.victory-duration')})`);
  await page.screenshot({ path: join(SHOTS, 'e-b3-victory.png'), fullPage: true });
  await page.click('.victory .stack-actions .btn-primary');
  await page.waitForSelector('.setup');
  const names = await page.$$eval('.setup-player .text-input', (els) => els.map((e) => e.value));
  assert(JSON.stringify(names) === '["Ana","Bea"]', `same players (${names})`);
  assert(await page.getAttribute('.setup .switch', 'aria-checked') === 'false', 'timer setting kept');
  assert(await page.getAttribute('.level-opt[aria-checked="true"]', 'data-level') === 'hard', 'level kept');
});

// ------------------------------------------------------------------ B3-9. i18n polish and long names
await test('B3 i18n: unambiguous dialog buttons (5 langs), French typography, IT/FR apostrophes; long names wrap to 2 lines', async (use) => {
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  for (const lang of LANGS) {
    for (const [ok, no] of [['home.newGameYes', 'home.newGameNo'], ['quick.quitYes', 'quick.quitNo'], ['classic.leaveTimerYes', 'classic.leaveTimerNo'], ['settings.reset', 'settings.resetNo']]) {
      const a = T(lang, ok); const b = T(lang, no);
      assert(a && b && a !== b && ![a, b].includes(T(lang, 'common.cancel')), `${lang}: ${ok}/${no} are distinct verbs (${a} / ${b})`);
    }
    for (const [k, v] of flat(strings[lang])) {
      if (lang === 'fr' || lang === 'it') assert(!v.includes("'"), `${lang}: typographic apostrophe in ${k}`);
      if (lang !== 'fr') continue;
      const s = v.replace(/\{[^}]*\}/g, 'X').replace(/https?:\S+/g, '');
      assert(!/[^\u00a0\u202f]([?!:;»])/.test(s.replace(/\d:\d/g, '')) && !/«[^\u00a0\u202f]/.test(s), `fr: no-break space in ${k} (${JSON.stringify(v)})`);
    }
  }
  assert(T('de', 'quick.quitTitle') === 'Schnelles Spiel beenden?' && T('de', 'quick.quitNo') === 'Weiterspielen' && T('de', 'quick.quitYes') === 'Spiel beenden', 'de quick-quit dialog');
  for (const [locale, lang] of [['de-DE', 'de'], ['fr-FR', 'fr']]) {
    const { page, context } = await use({ locale });
    await page.click('.menu-quick');
    await page.click('.quick-intro .sticky-actions .btn-primary');
    await page.waitForSelector('.quick .qcard');
    await page.goBack();
    await page.waitForSelector('.modal');
    assert(await text(page, '.modal-title') === T(lang, 'quick.quitTitle') && await text(page, '.modal .btn-ghost') === T(lang, 'quick.quitNo')
      && await text(page, '.modal .btn-danger') === T(lang, 'quick.quitYes'), `${lang}: quit dialog labels`);
    await shot(page, `e-b3-quit-${lang}`);
    await context.close();
  }
  // Long names at 390 px: the game bar title and the compact board wrap to 2 lines instead of cutting.
  const long = ['Kaladin Bendito', 'Shallan Davar Ve', 'Dalinar Kholin X', 'Jasnah Kholin Yy'];
  const save = classicSave({ phase: 'spin', pending: null, players: long.map((name, i) => ({ name, color: CATS[i], charges: {}, lifelines: LL() })) });
  const { page } = await use({ viewport: { width: 390, height: 844 }, storage: { classic: JSON.stringify(save) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.spin .board');
  const m = await page.evaluate(() => {
    const cut = (e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1;
    const title = document.querySelector('.topbar-title');
    const lh = parseFloat(getComputedStyle(title).lineHeight);
    return { title: cut(title), lines: Math.round(title.clientHeight / lh), names: [...document.querySelectorAll('.board-name')].filter(cut).map((e) => e.textContent) };
  });
  assert(!m.title && m.lines <= 2, `game bar title fits in at most 2 lines (${JSON.stringify(m)})`);
  assert(!m.names.length, `compact board shows full names (${m.names})`);
  await shot(page, 'e-b3-long-names-390');
});

// ================================================================== 1.5.0 features
const fmtEs = (n) => new Intl.NumberFormat('es').format(n);
/** A quick run on its last question (index 14 of 15); `missed` ⊆ the questions already asked. */
function quickRunNearEnd({ level = 'hard', score = 1400, correct = 7, missed = [] } = {}) {
  const qs = QS.slice(0, 15);
  return {
    v: 1, plan: qs.map((q) => q.c), total: 15, index: 14, score, correct, level, lifelines: LL(),
    seen: qs.map((q) => q.id), current: { id: qs[14].id, order: [0, 1, 2, 3], fx: null, clock: null }, missed,
  };
}
const parseReport = (href) => {
  const u = new URL(href);
  return { origin: `${u.origin}${u.pathname}`, template: u.searchParams.get('template'), title: u.searchParams.get('title'), body: u.searchParams.get('body'), length: href.length };
};

await test('1.5 report: prefilled GitHub issue (id, language, text, options, version), length-safe, offline copy', async (use) => {
  const { page, context } = await use({});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.click('.menu-btn >> nth=2'); // Práctica
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard .option');
  assert(!(await page.$('.report-link')), 'no report link before answering');
  const qtext = await text(page, '.qtext');
  const q = QS.find((x) => x.q === qtext);
  await answer(page, false);
  await page.waitForSelector('.feedback .report-link');
  assert(await text(page, '.feedback .report-link') === T('es', 'report.link'), 'link label');
  const r = parseReport(await page.getAttribute('.feedback .report-link', 'href'));
  assert(r.origin === 'https://github.com/ManuVP90/ManuVP90/issues/new' && r.template === 'error-en-pregunta.md', `issue URL + template (${r.origin} ${r.template})`);
  assert(r.title.includes(q.id), 'title has the question id');
  for (const part of [q.id, '**Idioma:** es', q.q, ...q.o, APP_VERSION, T('es', 'report.describe')]) assert(r.body.includes(part), `body includes "${part}"`);
  assert(r.length <= 6000, `URL length ${r.length}`);
  assert(await page.getAttribute('.feedback .report-link', 'target') === '_blank' && (await page.getAttribute('.feedback .report-link', 'rel')).includes('noopener'), 'opens in a new tab, noopener');
  // Huge texts stay under the limit and keep the id (pure builder, same module the app uses).
  const big = await page.evaluate(async () => {
    const { buildReport } = await import('./js/report.js');
    const r = buildReport({ id: 'roshar-001', c: 'roshar', d: 2, q: '¿'.repeat(4000), o: ['ñ'.repeat(900), 'b', 'c', 'd'], x: '😀'.repeat(3000) }, { lang: 'es', version: '1.5.0' });
    return { len: r.url.length, id: r.body.includes('roshar-001'), text: r.text.length };
  });
  assert(big.len <= 6000 && big.id, `long question keeps the URL short (${JSON.stringify(big)})`);
  await shot(page, 'e-15-report-link');
  // Offline: the report is copied to the clipboard instead of opening GitHub.
  await context.setOffline(true);
  const pages = context.pages().length;
  await page.click('.feedback .report-link');
  await page.waitForFunction((m) => document.querySelector('.feedback .report-status')?.textContent === m, T('es', 'report.offlineCopied'));
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert(clip.includes(q.id) && clip.includes(q.q) && clip.includes(q.o[0]), 'clipboard holds the report');
  assert(context.pages().length === pages, 'no tab opened offline');
  await shot(page, 'e-15-report-offline');
  await context.setOffline(false);
  // French and German labels in the body.
  for (const [locale, lang] of [['fr-FR', 'fr'], ['de-DE', 'de']]) {
    const x = await use({ locale });
    await x.page.click('.menu-btn >> nth=2');
    await x.page.click('.practice-setup .sticky-actions .btn-primary');
    await x.page.waitForSelector('.practice .qcard .option');
    await x.page.click('.qcard .option >> nth=0');
    await x.page.waitForSelector('.feedback .report-link');
    const rr = parseReport(await x.page.getAttribute('.feedback .report-link', 'href'));
    assert(rr.body.includes(`**${T(lang, 'report.field.language')}${lang === 'fr' ? '\u00a0:' : ':'}** ${lang}`) && rr.body.includes(T(lang, 'report.describe')), `${lang}: language and localized prompt`);
    assert(await text(x.page, '.feedback .report-link') === T(lang, 'report.link'), `${lang}: link label`);
    await x.context.close();
  }
});

await test('1.5 quick records per level: legacy best kept, per-level intro, record + reload', async (use) => {
  let { page, context } = await use({ storage: { stats: '{"bestQuick":1234}', settings: '{"level":"normal"}' } });
  await page.click('.menu-quick');
  await page.waitForSelector('.quick-best');
  assert(await text(page, '.quick-best') === T('es', 'quick.noBestLevel', { level: T('es', 'level.normal') }), 'no record yet for Normal');
  assert(await text(page, '.quick-best-legacy') === T('es', 'quick.bestLegacy', { n: fmtEs(1234) }), 'legacy record shown');
  await context.close();

  const stats = { bestQuick: 1500, bestByLevel: { easy: 900, hard: 1500 } };
  ({ page, context } = await use({ storage: { stats: JSON.stringify(stats), settings: '{"level":"normal"}' } }));
  await page.click('.menu-quick');
  await page.waitForSelector('.quick-best');
  assert(!(await page.$('.quick-best-legacy')), 'no legacy line when a level record holds the best');
  await page.click('.level-opt[data-level="easy"]');
  assert(await text(page, '.quick-best') === T('es', 'quick.bestLevel', { level: T('es', 'level.easy'), n: fmtEs(900) }), 'intro follows the chosen level');
  await shot(page, 'e-15-quick-intro-best');
  await context.close();

  // A record on Difícil: only that level changes; the results survive a reload.
  ({ page, context } = await use({ storage: { stats: JSON.stringify(stats), quick: JSON.stringify(quickRunNearEnd({ level: 'hard', score: 1400, correct: 7 })) } }));
  await page.click('.menu-continue-quick');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.quick-result .record-badge');
  const s = JSON.parse(await lsGet(page, 'stats'));
  assert(s.bestByLevel.hard > 1500 && s.bestByLevel.easy === 900 && !s.bestByLevel.normal && s.bestQuick === s.bestByLevel.hard, `per-level records (${JSON.stringify(s.bestByLevel)}, ${s.bestQuick})`);
  assert(await text(page, '.quick-result .quick-best') === T('es', 'quick.bestLevel', { level: T('es', 'level.hard'), n: fmtEs(s.bestByLevel.hard) }), 'results show the level record');
  await page.reload();
  await page.waitForSelector('.quick-result .record-badge');
  await context.close();

  // Records are per level: a first Fácil score is a record even below another level's best.
  ({ page, context } = await use({ storage: { stats: JSON.stringify({ bestQuick: 3000, bestByLevel: { hard: 3000 } }), quick: JSON.stringify(quickRunNearEnd({ level: 'easy', score: 700, correct: 7 })) } }));
  await page.click('.menu-continue-quick');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.quick-result');
  assert(await page.$('.quick-result .record-badge'), 'first Fácil score is a Fácil record even below another level');
  await context.close();

  // A results screen saved by 1.4.0 (record of the single best) still shows after the update.
  ({ page, context } = await use({ storage: { stats: '{"bestQuick":1234,"quickGames":3}', quickResult: JSON.stringify({ score: 1234, correct: 7, total: 15, level: 'easy', record: true }) } }));
  await page.waitForSelector('.quick-result .record-badge');
  assert(await page.$('.quick-result .review-none, .quick-result .review') !== null, 'review area rendered for an old summary');
  await context.close();
  // Inconsistent per-level data: a level record above the overall one is clamped, not trusted blindly.
  ({ page, context } = await use({ storage: { stats: JSON.stringify({ bestQuick: 10, bestByLevel: { normal: 'x', hard: -4, expert: 2500 } }) } }));
  await page.click('.small-btn >> nth=0');
  await page.waitForSelector('.stats .record-row');
  const rows = await page.locator('.record-value').allTextContents();
  assert(rows.join('|') === ['—', '—', '—', fmtEs(2500)].join('|'), `records per level in Stats (${rows})`);
  assert((await page.locator('.tile-value').nth(3).textContent()).trim() === fmtEs(2500), 'overall record ≥ every level');
  await shot(page, 'e-15-stats-records');
});

await test('1.5 review mistakes: quick results and classic victory list missed questions; missed ids saved', async (use) => {
  const prev = QS[3];
  const last = QS[14];
  let { page, context } = await use({ storage: { quick: JSON.stringify(quickRunNearEnd({ level: 'normal', score: 1000, correct: 6, missed: [prev.id] })) } });
  await page.click('.menu-continue-quick');
  await answer(page, false);
  await page.click('.qcard .continue');
  await page.waitForSelector('.quick-result .review');
  assert(await text(page, '.review-title') === T('es', 'review.title', { n: 2 }), 'summary counts 2 misses');
  assert(!(await page.locator('.review-list').isVisible()), 'collapsed by default');
  await page.click('.review-summary');
  const items = page.locator('.review-item');
  assert(await items.count() === 2, 'two items');
  const all = (await items.allTextContents()).join('\n');
  for (const q of [prev, last]) {
    assert(all.includes(q.q) && all.includes(T('es', 'review.answer', { answer: q.o[0] })), `item for ${q.id}`);
    if (q.x) assert(all.includes(q.x), `explanation for ${q.id}`);
  }
  assert(await page.locator('.review-item .report-link').count() === 2, 'each item can be reported');
  const missed = JSON.parse(await lsGet(page, 'missed'));
  assert(missed.es.includes(last.id), 'the miss is remembered for practice');
  await shot(page, 'e-15-review-quick');
  await page.reload();
  await page.waitForSelector('.quick-result .review');
  assert(await text(page, '.review-title') === T('es', 'review.title', { n: 2 }), 'review survives a reload');
  await context.close();

  // No misses: a short positive note instead of the list.
  ({ page, context } = await use({ storage: { quick: JSON.stringify(quickRunNearEnd({ level: 'normal', score: 1400, correct: 14 })) } }));
  await page.click('.menu-continue-quick');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.quick-result .review-none');
  assert(await text(page, '.review-none') === T('es', 'review.none'), 'no-miss note');
  await context.close();

  // Invalid missed lists in a saved run: the run is discarded.
  for (const missedBad of [['nope-1'], QS.slice(0, 9).map((q) => q.id), 'x', [prev.id, prev.id]]) {
    ({ page, context } = await use({ storage: { quick: JSON.stringify(quickRunNearEnd({ level: 'normal', score: 600, correct: 6, missed: missedBad })) } }));
    await page.waitForSelector('.home');
    assert(!(await page.$('.menu-continue-quick')), `invalid missed list ${JSON.stringify(missedBad).slice(0, 40)} rejected`);
    assert(await lsGet(page, 'quick') === null, 'invalid run deleted');
    await context.close();
  }

  // Classic: the victory screen lists the game's misses (kept in the saved game).
  const fq = QS.find((q) => q.d >= 3);
  const old = QS[7];
  const save = classicSave({
    timer: false, missed: [old.id],
    players: [
      { name: 'Ana', color: 'roshar', charges: Object.fromEntries(CATS.map((c) => [c, 2])), lifelines: LL() },
      { name: 'Bea', color: 'sel', charges: {}, lifelines: LL() },
    ],
    pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true },
  });
  ({ page, context } = await use({ storage: { classic: JSON.stringify(save) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await answer(page, false); // final missed: joins the list
  await page.click('.qcard .continue');
  const kept = JSON.parse(await lsGet(page, 'classic'));
  assert(kept.missed.includes(old.id) && kept.missed.includes(fq.id), `classic save keeps the misses (${kept.missed})`);
  await context.close();
  ({ page, context } = await use({ storage: { classic: JSON.stringify(save) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.victory .review');
  assert(await text(page, '.victory .review-title') === T('es', 'review.title', { n: 1 }), 'victory review counts the game misses');
  await page.click('.victory .review-summary');
  assert((await text(page, '.victory .review-item')).includes(old.o[0]), 'victory review shows the right answer');
  await shot(page, 'e-15-review-victory');
  // A v3 save without the field (1.4.0) still loads.
  const { missed: _m, ...noMissed } = save;
  const x = await use({ storage: { classic: JSON.stringify(noMissed) } });
  await x.page.waitForSelector('.menu-continue-classic');
});

await test('1.5 practice "My mistakes": only missed questions, removed when answered right, capped list', async (use) => {
  const a = QS[20];
  const b = QS[40];
  let { page, context } = await use({ storage: { missed: JSON.stringify({ es: [a.id, b.id], en: ['roshar-001'] }) } });
  await page.click('.menu-btn >> nth=2');
  await page.waitForSelector('.practice-setup .chip-missed');
  assert(await text(page, '.chip-missed') === T('es', 'practice.missed', { n: 2 }), 'chip counts the missed questions of this language');
  await page.click('.chip-missed');
  assert(await page.locator('.practice-diff').isHidden(), 'difficulty hidden for My mistakes');
  assert(await page.locator('.chips-cat .chip[aria-checked="true"]').count() === 0, 'one choice across both cards');
  assert((await page.locator('.practice-setup p[aria-live]').textContent()).trim() === T('es', 'practice.missedAvailable', { n: 2 }), 'count line');
  await shot(page, 'e-15-practice-missed-setup');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  const seen = [];
  // First question: wrong → stays. Then right, right → list empty → back to setup.
  await page.waitForSelector('.practice .qcard .option');
  seen.push(await text(page, '.qtext'));
  assert(await text(page, '.topbar-title') === T('es', 'practice.missedTitle'), 'title');
  await answer(page, false);
  await page.click('.qcard .continue');
  await page.waitForSelector('.practice .qcard .option');
  seen.push(await text(page, '.qtext'));
  assert(seen[0] !== seen[1] && seen.every((q) => q === a.q || q === b.q), 'only missed questions, no repeat until both shown');
  await answer(page, true);
  await page.waitForSelector('.missed-cleared');
  assert(await text(page, '.missed-left') === T('es', 'practice.missedLeft', { n: 1 }), 'one left');
  await shot(page, 'e-15-practice-missed-cleared');
  await page.click('.qcard .continue');
  await page.waitForSelector('.practice .qcard .option');
  assert(await text(page, '.qtext') === seen[0], 'the one still missed comes back');
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.waitForSelector('.practice-setup');
  await page.waitForFunction((m) => document.getElementById('toast').textContent === m, T('es', 'practice.missedDone'));
  assert(await page.locator('.chip-missed').isDisabled(), 'chip disabled with nothing left');
  assert(await text(page, '.practice-missed-hint') === T('es', 'practice.missedNone'), 'empty hint');
  const m = JSON.parse(await lsGet(page, 'missed'));
  assert(!m.es && m.en.length === 1, `es list emptied, other languages kept (${JSON.stringify(m)})`);
  await context.close();

  // Normal practice: a miss joins the list; the spoiler filter hides missed questions it excludes.
  ({ page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks([QS[0].w]) }), missed: JSON.stringify({ es: [QS[0].id, QS.find((q) => q.w !== QS[0].w).id] }) } }));
  await page.click('.menu-btn >> nth=2');
  assert(await text(page, '.chip-missed') === T('es', 'practice.missed', { n: 1 }), 'filtered by the spoiler filter');
  await context.close();

  // The list is capped (most recent kept) and garbage is ignored.
  ({ page, context } = await use({ storage: { missed: '{"es": "nope", "xx": [1,2]}' } }));
  await page.click('.menu-btn >> nth=2');
  assert(await page.locator('.chip-missed').isDisabled(), 'garbage missed list → empty');
  const capped = await page.evaluate(async (ids) => {
    const core = await import('./js/core.js');
    ids.forEach((id) => core.noteMissed(id));
    core.noteMissed(ids[0]); // seen again: becomes the most recent
    return core.getMissed();
  }, QS.slice(0, 205).map((q) => q.id));
  assert(capped.length === 200 && capped[199] === QS[0].id && !capped.includes(QS[1].id) && capped[0] === QS[6].id, `capped at 200 (${capped.length}, ${capped[0]}, ${capped[199]})`);
});

await test('1.5 export / import progress: round trip, no games in progress, garbage rejected safely', async (use) => {
  const stats = { classicGames: 3, quickGames: 5, bestQuick: 2100, bestByLevel: { hard: 2100, easy: 800 }, cats: { roshar: { a: 10, c: 7 } }, lifelines: { atium: 2, stormlight: 1, breath: 0 } };
  const src = {
    stats: JSON.stringify(stats), settings: JSON.stringify({ theme: 'light', sound: false, level: 'hard', disabledWorks: [ALL_WORKS[0]] }),
    missed: JSON.stringify({ es: [QS[1].id, QS[2].id] }), recent: JSON.stringify({ es: QS.slice(0, 150).map((q) => q.id), en: ['roshar-001'] }),
    classic: JSON.stringify(classicSave()),
  };
  let { page, context } = await use({ storage: src });
  await page.click('.small-btn >> nth=1');
  await page.click('.backup-export');
  await page.waitForSelector('.backup-out:not([hidden])');
  const code = await page.inputValue('.backup-code');
  assert(/^CT1z?\.[A-Za-z0-9_-]+$/.test(code), `code format (${code.slice(0, 20)}…)`);
  assert(code.length < 3000, `short code (${code.length} chars)`);
  await shot(page, 'e-15-backup-export');
  await context.close();

  // Import on a "new phone".
  ({ page, context } = await use({ storage: { stats: '{"quickGames":1}' } }));
  await page.click('.small-btn >> nth=1');
  const tryImport = async (value) => {
    await page.fill('.backup-in', value);
    await page.click('.backup-import');
  };
  const bad = {
    empty: ['   ', 'empty'], words: ['hola, esto no es un código', 'format'], prefix: ['CT1.!!!!', 'format'],
    notJson: [`CT1.${Buffer.from('not json').toString('base64url')}`, 'format'],
    array: [`CT1.${Buffer.from('[1,2]').toString('base64url')}`, 'format'],
    otherApp: [`CT1.${Buffer.from(JSON.stringify({ app: 'x', v: 1, d: {}, c: checksum('{}') })).toString('base64url')}`, 'format'],
    version: ['CT2.abcd', 'version'],
    tampered: [`CT1.${Buffer.from(JSON.stringify({ app: 'cosmere-trivia', v: 1, d: { stats: { bestQuick: 99999 } }, c: checksum('{"stats":{"bestQuick":1}}') })).toString('base64url')}`, 'checksum'],
    cut: [code.slice(0, Math.floor(code.length / 2)), null],
  };
  for (const [name, [value, err]] of Object.entries(bad)) {
    await tryImport(value);
    await page.waitForSelector('.backup-error:not([hidden])');
    const msg = await text(page, '.backup-error');
    if (err) assert(msg === T('es', `settings.backupError.${err}`), `${name}: "${msg}"`);
    else assert(Object.values(strings.es.settings.backupError).includes(msg), `${name}: rejected (${msg})`);
    assert(!(await page.$('.modal')), `${name}: no confirmation`);
  }
  assert(JSON.parse(await lsGet(page, 'stats')).quickGames === 1, 'garbage changed nothing');
  await shot(page, 'e-15-backup-error');
  // Cancel keeps the data; confirm imports.
  await tryImport(code);
  await page.waitForSelector('.modal');
  assert(await text(page, '.modal-title') === T('es', 'settings.backupConfirmTitle'), 'confirmation');
  await page.click('.modal .btn-ghost');
  assert(JSON.parse(await lsGet(page, 'stats')).quickGames === 1, 'cancel changes nothing');
  await page.click('.backup-import');
  await page.waitForSelector('.modal');
  await page.click('.modal .btn-primary');
  await page.waitForFunction((m) => document.getElementById('toast').textContent === m, T('es', 'settings.backupDone'));
  const got = JSON.parse(await lsGet(page, 'stats'));
  assert(got.quickGames === 5 && got.bestByLevel.hard === 2100 && got.bestByLevel.easy === 800 && got.cats.roshar.c === 7 && got.lifelines.atium === 2, `stats imported (${JSON.stringify(got)})`);
  const set = JSON.parse(await lsGet(page, 'settings'));
  assert(set.theme === 'light' && set.sound === false && set.level === 'hard' && set.disabledWorks[0] === ALL_WORKS[0] && set.onboarded === true, 'settings imported');
  assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme applied at once');
  assert(JSON.parse(await lsGet(page, 'missed')).es.length === 2 && JSON.parse(await lsGet(page, 'recent')).es.length === 150, 'missed + recent imported');
  assert(await lsGet(page, 'classic') === null, 'games in progress are not part of a backup');
  await context.close();

  // A valid code with odd values inside: sanitized like stored data, never crashes.
  const d = { stats: { bestQuick: 'mucho', cats: { roshar: { a: -1, c: 9 } }, bestByLevel: [] }, settings: { lang: 'xx', theme: 5, disabledWorks: 'all' }, missed: { es: [1, null, 'ok-1'], zz: ['a'] }, recent: 'x' };
  const weird = await encodeBackup(d, { compress: false });
  ({ page, context } = await use({}));
  await page.click('.small-btn >> nth=1');
  await page.fill('.backup-in', weird);
  await page.click('.backup-import');
  await page.click('.modal .btn-primary');
  await page.waitForFunction((m) => document.getElementById('toast').textContent === m, T('es', 'settings.backupDone'));
  const s2 = JSON.parse(await lsGet(page, 'stats'));
  assert(s2.bestQuick === 0 && s2.cats.roshar.a === 0, 'odd stats → 0');
  assert(JSON.stringify(JSON.parse(await lsGet(page, 'missed'))) === '{"es":["ok-1"]}', 'only valid ids kept');
  assert(await page.evaluate(() => document.documentElement.lang) === 'es', 'invalid language ignored');
  assert(!(await leakedText(page)), 'no leaked values');
  // Nothing usable at all → format error.
  await page.fill('.backup-in', await encodeBackup({ foo: 1 }, { compress: false }));
  await page.click('.backup-import');
  await page.click('.modal .btn-primary');
  await page.waitForSelector('.backup-error:not([hidden])');
  assert(await text(page, '.backup-error') === T('es', 'settings.backupError.format'), 'empty backup rejected');
});

await test('1.5 update notice: waits while a question is open, "Update" sends skip-waiting; sw.js waits for it', async (use) => {
  const sw = readFileSync(join(APP_DIR, 'sw.js'), 'utf8');
  assert(/msg\.type === 'skip-waiting'[^\n]*self\.skipWaiting\(\)/.test(sw), 'sw.js answers skip-waiting');
  assert(!/addAll\([^)]*\)\)\)\s*\.then\(\(\) => self\.skipWaiting\(\)\)/.test(sw), 'install no longer swaps silently');
  const { page } = await use({ clock: true });
  await page.waitForSelector('.home');
  // Offered on Home: shown right away.
  await page.evaluate(async () => {
    const m = await import('./js/update.js');
    window.__w1 = { msgs: [], postMessage(x) { this.msgs.push(x); } };
    m.offerUpdate(window.__w1);
  });
  await page.waitForSelector('.update-toast');
  assert(await text(page, '.update-text') === T('es', 'update.available') && await text(page, '.update-btn') === T('es', 'update.action'), `notice text (${await text(page, '.update-toast')})`);
  await shot(page, 'e-15-update-home');
  // A question starts: the notice hides; it comes back once the question is answered.
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .option');
  await page.waitForTimeout(50);
  assert(!(await page.$('.update-toast')), 'hidden while answering');
  await answer(page, true);
  await page.waitForSelector('.update-toast');
  await page.click('.qcard .continue');
  await page.waitForSelector('.quick .qcard .option:not([disabled])');
  await page.waitForTimeout(50);
  assert(!(await page.$('.update-toast')), 'hidden again on the next question');
  // A new version found mid-question waits too.
  await page.evaluate(async () => {
    const m = await import('./js/update.js');
    window.__w2 = { msgs: [], postMessage(x) { this.msgs.push(x); } };
    m.offerUpdate(window.__w2);
  });
  await page.waitForTimeout(100);
  assert(!(await page.$('.update-toast')), 'not shown mid-question');
  await answer(page, false);
  await page.waitForSelector('.update-toast');
  await shot(page, 'e-15-update-after-answer');
  // "Later" closes it; nothing is sent.
  await page.click('.update-close');
  assert(!(await page.$('.update-toast')), 'closed');
  assert((await page.evaluate(() => window.__w2.msgs.length)) === 0, 'nothing sent on "Later"');
  // Offered again (e.g. next launch) → "Update" asks the waiting worker to take over.
  await page.evaluate(async () => {
    const m = await import('./js/update.js');
    window.__w3 = { msgs: [], postMessage(x) { this.msgs.push(x); } };
    m.offerUpdate(window.__w3);
  });
  await page.click('.update-btn');
  assert(JSON.stringify(await page.evaluate(() => window.__w3.msgs)) === '[{"type":"skip-waiting"}]', 'skip-waiting sent');
  assert(await text(page, '.update-btn') === T('es', 'update.updating'), 'button shows progress');
  // No controller change (fake worker): the page reloads by itself after a moment, and the run resumes.
  await Promise.all([page.waitForEvent('load'), page.clock.runFor(4500)]);
  await page.waitForSelector('.home .menu-continue-quick');
});

await test('1.5 update flow with a real service worker: new version waits for "Update", then takes over', async (use) => {
  // Its own origin, whose sw.js changes between "builds" (the rest is served from app/ as usual).
  let build = 'A';
  const { createServer } = await import('node:http');
  const swServer = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/sw.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`${readFileSync(join(APP_DIR, 'sw.js'), 'utf8')}\n// test build ${build}\n`);
      return;
    }
    const up = await fetch(new URL(req.url, BASE));
    res.writeHead(up.status, { 'content-type': up.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(Buffer.from(await up.arrayBuffer()));
  });
  await new Promise((r) => swServer.listen(0, '127.0.0.1', r));
  try {
    const { page } = await use({ swAllowed: true, url: `http://127.0.0.1:${swServer.address().port}/` });
    await page.waitForSelector('.home');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForSelector('.home');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert(!(await page.$('.update-toast')), 'first install: no notice');
    build = 'B';
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.waitForSelector('.update-toast', { timeout: 15000 });
    assert(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r.waiting)), 'new worker waits (no silent swap)');
    await shot(page, 'e-15-update-real');
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.click('.update-btn')]);
    await page.waitForSelector('.home');
    const after = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => ({ waiting: !!r.waiting, active: !!r.active, controlled: !!navigator.serviceWorker.controller })));
    assert(!after.waiting && after.active && after.controlled, `new version in control after Update (${JSON.stringify(after)})`);
    assert(!(await page.$('.update-toast')), 'no notice after the update');
  } finally {
    swServer.close();
  }
});

// ------------------------------------------------------------------ 1.6.0: daily challenge, achievements, collection
const byText = Object.fromEntries(QS.map((q) => [q.q, q]));
const qById = Object.fromEntries(QS.map((q) => [q.id, q]));
const lsJSON = async (page, key) => JSON.parse((await lsGet(page, key)) || 'null');
/** Answers the visible daily questions (right unless its index is in `miss`) and returns their ids. */
async function playDaily(page, { from = 0, to = 5, miss = [] } = {}) {
  const ids = [];
  for (let i = from; i < to; i++) {
    await page.waitForSelector('.daily .qcard .option:not([disabled])');
    ids.push(byText[await text(page, '.qtext')].id);
    await answer(page, !miss.includes(i));
    await page.click('.daily .continue');
  }
  return ids;
}

await test('1.6 daily engine: seeded per date + language, mixed 1–3, distinct worlds, filter = filtered pool; streak rules; spoiler-free share', async () => {
  const a = dailyPick(QS, [], '2026-10-16', 'es');
  const b = dailyPick([...QS].reverse(), [], '2026-10-16', 'es');
  assert(a.length === 5 && JSON.stringify(a) === JSON.stringify(b), 'same date + language → same questions and option orders, whatever the data order');
  assert(JSON.stringify(dailyPick(QS, [], '2026-10-17', 'es')) !== JSON.stringify(a), 'another date → another challenge');
  assert(JSON.stringify(dailyPick(QS, [], '2026-10-16', 'en')) !== JSON.stringify(a), 'the language is part of the seed');
  assert(JSON.stringify(a.map((x) => qById[x.id].d)) === JSON.stringify(DAILY_DIFFS), `difficulties ramp 1,2,2,3,3 (${a.map((x) => qById[x.id].d)})`);
  assert(new Set(a.map((x) => qById[x.id].c)).size === 5, 'five different worlds');
  assert(a.every((x) => [...x.order].sort().join() === '0,1,2,3'), 'option orders are permutations');
  // Spoiler filter: the selection is computed over the filtered pool (and stays deterministic).
  const few = ['mistborn-final-empire', 'way-of-kings'];
  const f = dailyPick(QS, onlyWorks(few), '2026-10-16', 'es');
  assert(f.length === 5 && f.every((x) => few.includes(qById[x.id].w)), 'filtered challenge only uses allowed works');
  assert(JSON.stringify(f) === JSON.stringify(dailyPick(QS, onlyWorks(few), '2026-10-16', 'es')), 'filtered challenge is deterministic too');
  assert(dailyPick(QS, ALL_WORKS, '2026-10-16', 'es').length === 0, 'empty filter → no challenge');
  const tiny = poolOf(['warbreaker']).slice(0, 3);
  assert(dailyPick(tiny, [], '2026-10-16', 'es').length === 3, 'a tiny pool gives what it has');
  // Calendar and streak.
  assert(addDays('2026-12-31', 1) === '2027-01-01' && addDays('2024-03-01', -1) === '2024-02-29' && addDays('2026-03-29', 1) === '2026-03-30', 'addDays across years, leap days, DST');
  let s = emptyDaily();
  const marks = (n) => Array.from({ length: 5 }, (_, i) => ({ c: CATS[i], ok: i < n }));
  s = recordDaily(s, { date: '2026-10-14', lang: 'es', marks: marks(5) });
  s = recordDaily(s, { date: '2026-10-15', lang: 'es', marks: marks(3) });
  assert(s.streak === 2 && s.best === 2 && s.played === 2 && s.perfect === 1, `consecutive days (${JSON.stringify(s)})`);
  assert(JSON.stringify(recordDaily(s, { date: '2026-10-15', lang: 'es', marks: marks(5) })) === JSON.stringify(s), 'one result per date');
  assert(currentStreak(s, '2026-10-16') === 2 && currentStreak(s, '2026-10-17') === 0, 'streak alive the next day, broken after a missed day');
  s = recordDaily(s, { date: '2026-10-18', lang: 'es', marks: marks(1) });
  assert(s.streak === 1 && s.best === 2 && s.played === 3, 'a gap restarts the streak, best kept');
  const odd = sanitizeDaily({ last: 'ayer', streak: -4, best: 'x', played: 2, perfect: 9, result: { date: '2026-10-18', lang: 'es', marks: [{ c: 'urithiru', ok: 1 }] }, run: { date: 'x' } });
  assert(odd.last === null && odd.streak === 0 && odd.perfect === 2 && odd.result === null && odd.run === null, `sanitized (${JSON.stringify(odd)})`);
  const share = shareText({ title: 'T', date: '2026-10-16', marks: [{ c: 'roshar', ok: true }, { c: 'sel', ok: false }, { c: 'nalthis', ok: true }], streakLabel: 'S' });
  assert(share === 'T · 2026-10-16\n✅❌✅ 2/3\nS', `share text: ${JSON.stringify(share)}`);
});

await test('1.6 daily UI: today’s 5 questions with timer, resume after reload, one attempt, streak + share, offline-safe', async (use) => {
  const { page } = await use({ clock: true });
  const day = await page.evaluate(async () => (await import('./js/daily.js')).dateKey());
  const expected = dailyPick(QS, [], day, 'es').map((x) => x.id);
  await page.click('.menu-daily');
  await page.waitForSelector('.daily-intro');
  assert(!(await page.$('.daily-filter-note')), 'no filter note without a spoiler filter');
  await shot(page, 'e-16-daily-intro');
  await page.click('.daily-start');
  await page.waitForSelector('.daily .qcard .timer');
  const order = await page.locator('.daily .option-text').allTextContents();
  const first = qById[expected[0]];
  assert(JSON.stringify(order.map((s) => s.trim())) === JSON.stringify(dailyPick(QS, [], day, 'es')[0].order.map((i) => first.o[i])), 'option order from the seed');
  const ids = await playDaily(page, { from: 0, to: 2, miss: [1] });
  // Reload mid-challenge: Home offers to continue, and it resumes at question 3.
  await page.reload();
  await page.waitForSelector('.home .menu-daily.daily-run');
  assert((await text(page, '.menu-daily .menu-title')) === T('es', 'home.dailyContinue'), 'continue label');
  await page.click('.menu-daily');
  await page.waitForSelector('.daily .progress-label');
  assert((await text(page, '.daily .progress-label')) === T('es', 'question.progress', { n: 3, total: 5 }), 'resumes at question 3');
  assert((await page.locator('.daily-top .daily-mark.ok').count()) === 1 && (await page.locator('.daily-top .daily-mark.bad').count()) === 1, 'marks so far');
  ids.push(...await playDaily(page, { from: 2, to: 5 }));
  assert(JSON.stringify(ids) === JSON.stringify(expected), `the seeded questions, in order (${ids} vs ${expected})`);
  await page.waitForSelector('.daily-result');
  assert((await text(page, '.daily-result .result-score')) === T('es', 'daily.result', { n: 4, total: 5 }), 'score 4/5');
  assert((await page.locator('.daily-result .review-list .review-item').count()) === 1, 'the missed question can be reviewed');
  const st = await lsJSON(page, 'daily');
  assert(st.last === day && st.streak === 1 && st.played === 1 && !st.run, `stored result (${JSON.stringify(st)})`);
  // Share: no navigator.share here → clipboard, spoiler-free text with gem squares.
  await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); navigator.clipboard.writeText = async (s) => { window.__copied = s; }; });
  await page.click('.daily-share');
  await page.waitForFunction(() => window.__copied);
  const shared = await page.evaluate(() => window.__copied);
  const lines = shared.split('\n');
  // Beta 4: ✅/❌ per question (no world colors to misread) and the date in the player's language.
  const [yy, mm, dd] = day.split('-').map(Number);
  const localDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(yy, mm - 1, dd));
  assert(lines[0].endsWith(` · ${localDay}`) && !lines[0].includes(day), `localized share date: ${JSON.stringify(lines[0])}`);
  assert(lines[1] === '✅❌✅✅✅ 4/5', `share marks: ${JSON.stringify(shared)}`);
  assert(ids.every((id) => !shared.includes(qById[id].q) && !shared.includes(qById[id].o[0])), 'no question or answer in the share text');
  assert((await text(page, '#toast')) === T('es', 'daily.copied'), 'copied toast');
  await shot(page, 'e-16-daily-result');
  // One attempt per day: Home says done, and the challenge screen shows the result again.
  await page.click('.daily-result .stack-actions:last-child .btn-ghost');
  await page.waitForSelector('.home .menu-daily.daily-done');
  assert((await text(page, '.menu-daily .menu-desc')) === T('es', 'home.dailyDone', { n: 4, total: 5, streak: 1 }), 'home: done today');
  await page.click('.menu-daily');
  await page.waitForSelector('.daily-result');
  assert(!(await page.$('.daily-start')), 'no second attempt');
  assert(!(await leakedText(page)), 'no leaked null/undefined');
});

await test('1.6 daily: 10-day streak and perfect day unlock achievements; a broken streak shows none; spoiler filter note', async (use) => {
  const day = (await (await use({ clock: true })).page.evaluate(async () => (await import('./js/daily.js')).dateKey()));
  const prev = addDays(day, -1);
  const { page } = await use({ clock: true, storage: { daily: JSON.stringify({ v: 1, last: prev, streak: 9, best: 9, played: 9, perfect: 0, result: null, run: null }) } });
  assert((await text(page, '.menu-daily .menu-desc')) === T('es', 'home.dailyStreak', { n: 9 }), 'home shows the streak at stake');
  await page.click('.menu-daily');
  await page.click('.daily-start');
  await playDaily(page);
  await page.waitForSelector('.daily-result');
  const st = await lsJSON(page, 'daily');
  assert(st.streak === 10 && st.best === 10 && st.perfect === 1, `streak 10 (${JSON.stringify(st)})`);
  const ach = await lsJSON(page, 'achievements');
  for (const id of ['dailyFirst', 'dailyPerfect', 'dailyStreak3', 'dailyStreak10']) assert(ach.unlocked[id] > 0, `${id} unlocked`);
  await page.waitForSelector('.ach-toast');
  assert((await page.locator('.ach-toast').count()) === 1, 'one notice at a time (queued)');
  // A streak whose last day is 3 days ago is broken.
  const old = await use({ clock: true, storage: { daily: JSON.stringify({ v: 1, last: addDays(day, -3), streak: 5, best: 5, played: 5, perfect: 0 }) } });
  await old.page.click('.menu-daily');
  assert((await text(old.page, '.daily-streak span:not(.icon)')) === T('es', 'daily.noStreak'), 'broken streak');
  // Spoiler filter: note on the intro and only allowed works.
  const few = ['mistborn-final-empire', 'way-of-kings', 'elantris', 'warbreaker', 'emperors-soul'];
  const fl = await use({ clock: true, storage: { settings: JSON.stringify({ disabledWorks: onlyWorks(few) }) } });
  await fl.page.click('.menu-daily');
  await fl.page.waitForSelector('.daily-filter-note');
  await fl.page.click('.daily-start');
  const ids = await playDaily(fl.page);
  assert(JSON.stringify(ids) === JSON.stringify(dailyPick(QS, onlyWorks(few), day, 'es').map((x) => x.id)), 'filtered pool selection');
  await fl.page.click('.daily-share').catch(() => {});
  assert((await text(fl.page, '.daily-share-preview')).includes(T('es', 'daily.shareFiltered')), 'share text says the filter was on');
});

await test('1.6 achievements: retroactive and silent at start, showcase, notice waits for the question, classic moments, corrupt state', async (use) => {
  // Progress from before 1.6.0: unlocked quietly at start.
  const { page } = await use({ storage: { stats: JSON.stringify({ classicGames: 5, bestQuick: 2100, bestByLevel: { normal: 2100 }, lifelines: { atium: 1, stormlight: 1, breath: 0 }, cats: { roshar: { a: 40, c: 30 } } }) } });
  await page.waitForSelector('.home');
  let ach = await lsJSON(page, 'achievements');
  assert(['firstWin', 'radiant', 'quickScore'].every((id) => ach.unlocked[id]) && Object.keys(ach.unlocked).length === 3, `retroactive (${JSON.stringify(ach)})`);
  assert(!(await page.$('.ach-toast')), 'no notices at start');
  await page.click('.small-btn:has-text("' + T('es', 'home.achievements') + '")');
  await page.waitForSelector('.achievements');
  assert((await page.locator('.ach-card.unlocked').count()) === 3 && (await page.locator('.ach-card.locked .ach-lock').count()) === 16, 'showcase: 3 unlocked, 16 locked with a lock');
  assert((await text(page, '.ach-card[data-ach="answered100"] .ach-count')) === '40/100', 'progress of a locked goal');
  assert((await text(page, '.ach-summary-count')) === T('es', 'ach.count', { n: 3, total: 19 }), 'summary');
  await shot(page, 'e-16-achievements');
  await page.click('.topbar-back');
  // Breath is the last lifeline missing: the notice waits until the question is answered.
  await page.click('.menu-quick');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard');
  await page.click('.lifeline[data-kind="breath"], .lifeline-breath').catch(async () => { await page.locator('.lifeline').nth(2).click(); });
  await page.waitForSelector('.quick .qcard .option:not([disabled])');
  ach = await lsJSON(page, 'achievements');
  assert(ach.unlocked.allLifelines, 'allLifelines unlocked');
  await page.waitForTimeout(400);
  assert(!(await page.$('.ach-toast')), 'no notice while the question is open');
  await answer(page, true);
  await page.waitForSelector('.ach-toast[data-ach="allLifelines"]');
  assert((await text(page, '.ach-toast-name')) === T('es', 'ach.allLifelines.name'), 'notice names it');
  // Classic: winning the final with 6 players on Expert without lifelines.
  const fq = QS.find((q) => q.d === 4);
  const six = CATS.map((c, i) => ({ name: `P${i + 1}`, color: c, charges: i ? {} : Object.fromEntries(CATS.map((x) => [x, 2])), lifelines: { atium: 1, stormlight: 1, breath: 1 }, stats: { answered: 12, correct: 12, lifelines: 0 } }));
  const win = await use({ storage: { classic: JSON.stringify(classicSave({ players: six, level: 'expert', timer: false, pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true }, asked: 20 })) } });
  await win.page.click('.menu-continue-classic');
  await win.page.click('.handoff .btn-primary').catch(() => {});
  await answer(win.page, true);
  await win.page.click('.continue');
  await win.page.waitForSelector('.victory');
  ach = await lsJSON(win.page, 'achievements');
  // 2.0.0 (lead decision 2): a group game only unlocks group achievements and counts as a group game.
  const st6 = await lsJSON(win.page, 'stats');
  assert(ach.unlocked.fullTable && !ach.unlocked.expertPure && !ach.unlocked.firstWin && st6.groupGames === 1 && !st6.classicGames, `group win: only fullTable (${JSON.stringify(ach)} ${JSON.stringify(st6)})`);
  // The same win playing solo unlocks the individual ones.
  const one = [{ ...six[0], name: 'Ana' }];
  const solo1 = await use({ storage: { classic: JSON.stringify(classicSave({ players: one, level: 'expert', timer: false, pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true }, asked: 20 })) } });
  await solo1.page.click('.menu-continue-classic');
  await answer(solo1.page, true);
  await solo1.page.click('.continue');
  await solo1.page.waitForSelector('.victory');
  ach = await lsJSON(solo1.page, 'achievements');
  assert(ach.unlocked.expertPure && ach.unlocked.firstWin && !ach.unlocked.fullTable, `solo win achievements (${JSON.stringify(ach)})`);
  // Infusing the sixth gem without a miss.
  const sq = QS.find((q) => q.c === 'cosmere' && q.d <= 2);
  const solo = [{ name: 'Ana', color: 'roshar', charges: { ...Object.fromEntries(CATS.map((x) => [x, 2])), cosmere: 1 }, lifelines: { atium: 1, stormlight: 1, breath: 1 }, stats: { answered: 11, correct: 11, lifelines: 0 } }];
  const fl = await use({ storage: { classic: JSON.stringify(classicSave({ players: solo, timer: false, pending: { id: sq.id, cat: 'cosmere', order: [0, 1, 2, 3], final: false } })) } });
  await fl.page.click('.menu-continue-classic');
  await answer(fl.page, true);
  await fl.page.waitForSelector('.ach-toast[data-ach="flawless"]');
  // Corrupt achievement / daily / seen state never breaks the app and is sanitized.
  const bad = await use({ storage: { achievements: '{"unlocked":{"nope":1,"firstWin":"yes","polyglot":-3},"langs":["xx","es",5]}', daily: '"garbage"', seen: '[1,2]' } });
  await bad.page.waitForSelector('.home');
  const ex = await bad.page.evaluate(async () => (await import('./js/core.js')).exportData());
  assert(JSON.stringify(ex.achievements) === '{"unlocked":{},"langs":["es"]}' && ex.daily.played === 0 && !('run' in ex.daily) && JSON.stringify(ex.seen) === '{}', `sanitized (${JSON.stringify(ex.achievements)})`);
});

await test('1.6 collection: X/Y discovered overall, per world and difficulty, respecting the spoiler filter; polyglot; export/import', async (use) => {
  const ro = QS.filter((q) => q.c === 'roshar').slice(0, 3).map((q) => q.id);
  const se = QS.filter((q) => q.c === 'sel').slice(0, 2).map((q) => q.id);
  const other = QS.find((q) => q.c === 'nalthis').id;
  const storage = { seen: JSON.stringify({ es: [...ro, ...se, 'gone-999'] }), recent: JSON.stringify({ es: [other, ro[0]] }), achievements: JSON.stringify({ unlocked: {}, langs: ['en', 'fr'] }) };
  const { page } = await use({ storage });
  await page.click('.small-btn >> nth=0');
  await page.waitForSelector('.stats .collection');
  // Beta 5 (decision 1): once `seen` exists the recent ring isn't merged (group games feed the ring),
  // so `other`, only in the ring, is not discovered.
  assert((await text(page, '.col-total strong')) === T('es', 'stats.discovered', { n: 5, total: QS.length }), `overall (${await text(page, '.col-total strong')})`);
  const rTotal = QS.filter((q) => q.c === 'roshar').length;
  assert((await text(page, '.col-world[data-cat="roshar"] .col-value')) === T('es', 'stats.discoveredOf', { n: 3, total: rTotal }), 'roshar row');
  const d = (n) => QS.filter((q) => q.d === n);
  const seenAll = new Set([...ro, ...se]);
  for (const n of [1, 2, 3, 4]) {
    if (!d(n).length) continue;
    assert((await text(page, `.col-diff[data-d="${n}"] .col-value`)) === T('es', 'stats.discoveredOf', { n: d(n).filter((q) => seenAll.has(q.id)).length, total: d(n).length }), `difficulty ${n} row`);
  }
  assert(!(await page.$('.col-filter')), 'no filter note');
  await shot(page, 'e-16-collection');
  // Practice: a new question is discovered, and answering in a 3rd language unlocks Polyglot.
  await page.click('.topbar-back');
  await page.click('.menu-btn >> nth=2');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  await answer(page, true);
  const ach = await lsJSON(page, 'achievements');
  assert(ach.unlocked.polyglot && JSON.stringify(ach.langs) === '["es","en","fr"]', `polyglot (${JSON.stringify(ach)})`);
  const seen = await lsJSON(page, 'seen');
  assert(seen.es.length === 7, `seen set grew (${seen.es.length})`);
  // Export / import round trip includes seen, achievements and daily (never a challenge in progress).
  const roundTrip = await page.evaluate(async () => {
    const core = await import('./js/core.js');
    localStorage.setItem('cosmere-trivia:daily', JSON.stringify({ v: 1, last: '2026-10-15', streak: 4, best: 6, played: 8, perfect: 2, result: null, run: null }));
    const d = core.exportData();
    for (const k of ['seen', 'achievements', 'daily']) localStorage.removeItem(`cosmere-trivia:${k}`);
    const ok = core.importData(JSON.parse(JSON.stringify(d)));
    return { ok, d, seen: core.getDiscovered().size, ach: core.getAchievements(), daily: core.getDaily() };
  });
  assert(roundTrip.ok && roundTrip.ach.unlocked.polyglot && roundTrip.daily.best === 6 && roundTrip.daily.streak === 4 && roundTrip.seen >= 7, `round trip (${JSON.stringify({ ...roundTrip, d: undefined })})`);
  // Spoiler filter: hidden works don't count and their world disappears.
  const fl = await use({ storage: { ...storage, settings: JSON.stringify({ disabledWorks: [...new Set(QS.filter((q) => q.c === 'roshar').map((q) => q.w))] }) } });
  await fl.page.click('.small-btn >> nth=0');
  await fl.page.waitForSelector('.stats .collection .col-filter');
  assert(!(await fl.page.$('.col-world[data-cat="roshar"]')), 'filtered world hidden');
  const allowed = QS.filter((q) => !QS.some((r) => r.c === 'roshar' && r.w === q.w));
  assert((await text(fl.page, '.col-total strong')) === T('es', 'stats.discovered', { n: allowed.filter((q) => seenAll.has(q.id)).length, total: allowed.length }), 'filtered overall');
});

// ================================================================== Beta 4 findings (docs/BETA-4.md)
/**
 * The double tap of beta 4 G1: a real tap on `sel` (the "Next"/"Ready" button), then — in the same
 * frame of fake time — taps where the next question's options are, plus programmatic clicks on
 * them (which bypass `pointer-events`, so the JS guard is checked too).
 */
async function doubleTap(page, sel) {
  await page.locator(sel).scrollIntoViewIfNeeded();
  const b = await page.locator(sel).boundingBox();
  const x = b.x + b.width / 2; const y = b.y + b.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  const pts = await page.evaluate(() => [...document.querySelectorAll('.qcard .option')].map((o) => { const r = o.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }).filter(([, py]) => py > 0 && py < innerHeight));
  for (const [px, py] of pts) await page.mouse.click(px, py);
  await page.evaluate(() => document.querySelectorAll('.qcard .option, .qcard .lifeline').forEach((o) => o.click()));
}
const unanswered = (page) => page.evaluate(() => !!document.querySelector('.qcard') && !document.querySelector('.qcard .option[disabled], .qcard .option.correct, .qcard .option.wrong, .qcard .lifeline.used') && document.querySelector('.qcard .continue').hidden);

await test('B4 G1: a double tap on "Next"/"Ready" never answers the next question (quick, daily, practice, classic)', async (use) => {
  // Quick game, 320×568 like the tester's iPhone SE; time only moves with runFor.
  let { page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } });
  await page.click('.menu-quick');
  await tapReady(page, '.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard.input-guard');
  await page.clock.runFor(400);
  await answer(page, true);
  const q1 = await text(page, '.qtext');
  await doubleTap(page, '.qcard .continue');
  assert((await text(page, '.progress-label')) === T('es', 'question.progress', { n: 2, total: 15 }), `one tap = one question (${await text(page, '.progress-label')})`);
  assert(await text(page, '.qtext') !== q1, 'the next question is shown');
  assert(await unanswered(page), 'quick: the second tap did not answer question 2');
  assert(JSON.parse(await lsGet(page, 'quick')).index === 1 && JSON.parse(await lsGet(page, 'quick')).lifelines.atium === 1, 'quick: save untouched (index 1, lifelines kept)');
  await page.clock.runFor(200);
  await page.evaluate(() => document.querySelector('.qcard .option').click());
  assert(await unanswered(page), 'still guarded 200 ms after painting');
  await page.clock.runFor(200);
  assert(!(await page.$('.qcard.input-guard')), 'guard lifted after 350 ms');
  await answer(page, false);
  assert(!(await unanswered(page)), 'a tap after the guard answers normally');
  // The old "Next" can't fire twice either: two synchronous clicks advance exactly one question.
  await page.evaluate(() => { const b = document.querySelector('.qcard .continue'); b.click(); b.click(); });
  assert((await text(page, '.progress-label')) === T('es', 'question.progress', { n: 3, total: 15 }), 'two clicks on "Next" = one question');
  await context.close();

  // Daily challenge: the double tap must not spend question 2.
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } }));
  await page.click('.menu-daily');
  await tapReady(page, '.daily-start');
  await page.waitForSelector('.daily .qcard');
  await page.clock.runFor(400);
  await answer(page, true);
  await doubleTap(page, '.daily .continue');
  assert(await unanswered(page), 'daily: question 2 not answered by the second tap');
  const run = (await lsJSON(page, 'daily')).run;
  assert(run.index === 1 && run.marks.length === 1, `daily: one mark only (${JSON.stringify(run.marks)})`);
  await shot(page, 'e-b4-g1-daily-after-double-tap');
  await context.close();

  // Practice.
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } }));
  await page.click('.menu-btn >> nth=2');
  await tapReady(page, '.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  await page.clock.runFor(400);
  await answer(page, true);
  await doubleTap(page, '.qcard .continue');
  assert(await unanswered(page), 'practice: the next question not answered');
  assert((await text(page, '.tally')) === T('es', 'practice.tally', { correct: 1, total: 1 }), 'practice: tally counts one answer');
  await context.close();

  // Classic: the handoff's "Ready" (same place as the options) and the answer's "Continue".
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 }, storage: { classic: JSON.stringify(classicSave()) } }));
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  await page.clock.runFor(INPUT_GUARD_MS); // the handoff's own guard (beta 5) is not what is tested here
  await doubleTap(page, '.handoff .btn-primary');
  await page.waitForSelector('.classic .qcard, .qcard');
  assert(await unanswered(page), 'classic: the tap after "Ready" did not answer');
  await page.clock.runFor(400);
  await answer(page, true);
  await page.evaluate(() => { const b = document.querySelector('.qcard .continue'); b.click(); b.click(); });
  const st = JSON.parse(await lsGet(page, 'classic'));
  assert(st.asked === 3 && st.players[0].stats?.a !== 2, `classic: one answer recorded (${JSON.stringify({ asked: st.asked, phase: st.phase })})`);
});

await test('B4 M3: the daily challenge of a date at or before the last one played can’t be replayed (clock moved back)', async (use) => {
  const day = (await (await use({ clock: true })).page.evaluate(async () => (await import('./js/daily.js')).dateKey()));
  const later = addDays(day, 2);
  const marks = CATS.slice(0, 5).map((c, i) => ({ c, ok: i !== 2 }));
  // The device date went back two days after playing: the last result is shown, no "Start".
  const daily = { v: 1, last: later, streak: 3, best: 3, played: 3, perfect: 0, result: { date: later, lang: 'es', marks, ids: [], filtered: false }, run: null };
  let { page, context } = await use({ clock: true, viewport: { width: 320, height: 568 }, storage: { daily: JSON.stringify(daily) } });
  await page.waitForSelector('.home .menu-daily');
  // Beta 5 (item 13): not "Done today" (that result is from a later date), just "already played".
  assert((await text(page, '.menu-daily .menu-desc')) === T('es', 'home.dailyLocked'), `home: locked, not "done today" (${await text(page, '.menu-daily .menu-desc')})`);
  await page.click('.menu-daily');
  await page.waitForSelector('.daily-result');
  assert(!(await page.$('.daily-start')), 'no replay with the clock moved back');
  assert(await page.$('.daily-clock-note'), 'the screen says why');
  assert(!(await page.$('.daily-next')), 'no "come back tomorrow" (it would be wrong)');
  assert((await text(page, '.daily-result .result-score')) === T('es', 'daily.result', { n: 4, total: 5 }), 'the last result');
  await shot(page, 'e-b4-m3-daily-clock-back');
  await context.close();
  // No result stored with that date (old save): a locked screen, never the intro.
  ({ page, context } = await use({ clock: true, viewport: { width: 390, height: 844 }, storage: { daily: JSON.stringify({ ...daily, result: null }) } }));
  await page.waitForSelector('.home .menu-daily');
  assert((await text(page, '.menu-daily .menu-desc')) === T('es', 'home.dailyLocked'), 'home: locked');
  await page.click('.menu-daily');
  await page.waitForSelector('.daily-clock-note');
  assert(!(await page.$('.daily-start')), 'locked: no start');
  await shot(page, 'e-b4-m3-daily-locked');
  await context.close();
  // The day after the last one played is playable again.
  ({ page, context } = await use({ clock: true, storage: { daily: JSON.stringify({ ...daily, last: addDays(day, -1), result: { ...daily.result, date: addDays(day, -1) } }) } }));
  await page.click('.menu-daily');
  await page.waitForSelector('.daily-start');
});

await test('B4 layout: Stats at 200 % / 320 px, question card at 200 % (no mid-word breaks, timer in its ring), lifelines at 320 px, hyphenation lang', async (use) => {
  const stats = { classicGames: 12, quickGames: 34, bestQuick: 2980, bestByLevel: { easy: 2100, normal: 2980, hard: 1500, expert: 900 }, cats: Object.fromEntries(CATS.map((c, i) => [c, { a: 100 + i, c: 60 + i }])), lifelines: { atium: 12, stormlight: 7, breath: 3 } };
  for (const lang of ['es', 'de', 'fr']) {
    const { page, context } = await use({ locale: `${lang}-${lang.toUpperCase()}`, viewport: { width: 320, height: 568 }, storage: { stats: JSON.stringify(stats) } });
    await page.waitForSelector('.home');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.click('.small-btn >> nth=0');
    await page.waitForSelector('.stats .tile');
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      out: [...document.querySelectorAll('.stats .tile, .stats .bar-row, .stats .col-row, .stats .record-row, .stats .lifeline-stats li')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5 || e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className || e.tagName}: ${e.textContent} ${e.scrollWidth}/${e.clientWidth}`),
    }));
    assert(m.sw <= 320 && !m.out.length, `${lang}: Stats fit 320 px at 200 % (${JSON.stringify(m)})`);
    await page.screenshot({ path: join(SHOTS, `e-b4-stats-200-${lang}.png`), fullPage: true });
    await context.close();
  }
  // Question card at 200 %, 320 px: the tester's "La esmerald/a" question.
  const q = QS.find((x) => x.o.includes('La esmeralda'));
  const run = { ...quickRun(), current: { id: q.id, order: [0, 1, 2, 3], fx: null, clock: { remaining: 30000, savedAt: null } } };
  run.plan[run.index] = q.c;
  const { page } = await use({ viewport: { width: 320, height: 568 }, storage: { quick: JSON.stringify(run) } });
  await page.waitForSelector('.home');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard .timer-num');
  const c = await page.evaluate(() => {
    // A word drawn on two lines although it fits on one: split mid-word for no reason.
    const split = [];
    for (const e of document.querySelectorAll('.option-text, .qtext')) {
      const node = e.firstChild; if (!node || node.nodeType !== 3) continue;
      const re = /\S+/g; let mm;
      while ((mm = re.exec(node.data))) {
        const r = document.createRange(); r.setStart(node, mm.index); r.setEnd(node, mm.index + mm[0].length);
        const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
        const width = [...r.getClientRects()].reduce((s, x) => s + x.width, 0);
        if (tops.size > 1 && width <= e.clientWidth) split.push(mm[0]);
      }
    }
    const num = document.querySelector('.timer-num'); const ring = document.querySelector('.timer');
    const r = document.createRange(); r.selectNodeContents(num); const tb = r.getBoundingClientRect(); const rb = ring.getBoundingClientRect();
    const ll = [...document.querySelectorAll('.lifeline')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent);
    return { split, timer: { text: num.textContent, tw: tb.width, th: tb.height, rw: rb.width, rh: rb.height }, ll, lang: document.querySelector('.qcard').lang, hy: getComputedStyle(document.querySelector('.option-text')).hyphens, sw: document.documentElement.scrollWidth };
  });
  assert(!c.split.length, `no word broken while it fits a line (${c.split})`);
  // The digits sit inside the ring's inner circle (stroke 4 of a 48 viewBox: about 83 % of the width).
  assert(c.timer.text === '30' && c.timer.tw <= c.timer.rw * 0.8 && c.timer.th <= c.timer.rh * 0.8, `"30" fits its ring (${JSON.stringify(c.timer)})`);
  assert(c.lang === 'es' && c.hy === 'auto', `the card carries the questions' language for hyphenation (${c.lang}, ${c.hy})`);
  assert(!c.ll.length && c.sw <= 320, `lifelines and page fit (${JSON.stringify(c)})`);
  await page.screenshot({ path: join(SHOTS, 'e-b4-quick-200.png'), fullPage: true });
  // 320 px, normal text: "Luz tormentosa" used (struck through) still fits its button.
  for (const lang of ['es', 'fr', 'de', 'it', 'en']) {
    const { page: p, context } = await use({ locale: `${lang}-${lang.toUpperCase()}`, viewport: { width: 320, height: 568 }, storage: { quick: JSON.stringify({ ...quickRun(), lifelines: { atium: 0, stormlight: 0, breath: 1 } }) } });
    await p.click('.menu-continue-quick');
    await p.waitForSelector('.quick .qcard .lifeline');
    const ll = await p.evaluate(() => [...document.querySelectorAll('.lifeline')].map((b) => {
      const n = b.querySelector('.lifeline-name'); const r = document.createRange(); r.selectNodeContents(n); const t = r.getBoundingClientRect(); const o = b.getBoundingClientRect();
      return { name: n.textContent, inside: t.left >= o.left && t.right <= o.right + 0.5, right: o.right };
    }));
    assert(ll.every((x) => x.inside && x.right <= 320), `${lang}: lifeline labels inside their buttons at 320 px (${JSON.stringify(ll)})`);
    if (lang === 'es' || lang === 'fr') await p.screenshot({ path: join(SHOTS, `e-b4-lifelines-320-${lang}.png`), fullPage: true });
    await context.close();
  }
});

await test('B4 layout: onboarding notice never over the list; Home "Acerca de" on one line at 393 px', async (use) => {
  for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
    const { page, context } = await use({ fresh: true, viewport: vp });
    await page.waitForSelector('.onboarding .onb-next');
    await page.click('.onb-next', { force: true }).catch(() => {}); // disabled: shows the reason
    await page.evaluate(() => { const w = document.getElementById('onb-why'); if (w) w.hidden = false; });
    await page.waitForSelector('#onb-why:not([hidden])');
    // At the top the list runs under the sticky bar (the tester's screenshot): the notice's area must
    // be painted by the bar itself, never show a list row through it.
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(await page.evaluate(() => { const r = document.getElementById('onb-why').getBoundingClientRect(); return [...document.querySelectorAll('.onb-works .spoiler-group, .onb-works li, .onb-works label')].some((e) => { const b = e.getBoundingClientRect(); return b.top < r.bottom && b.bottom > r.top; }); }), `${vp.width}: the list really passes under the bar here`);
    const m = await page.evaluate(() => {
      const why = document.getElementById('onb-why'); const bar = why.closest('.onb-actions');
      const r = why.getBoundingClientRect();
      const hits = [];
      for (let x = r.left + 4; x < r.right; x += 12) for (const y of [r.top + 2, r.top + r.height / 2, r.bottom - 2]) {
        const e = document.elementFromPoint(x, y); if (e && !bar.contains(e)) hits.push(e.className || e.tagName);
      }
      const bg = getComputedStyle(bar).backgroundColor;
      return { hits, bg, opaque: !/rgba\(.*, 0\)$/.test(bg) && bg !== 'transparent' };
    });
    assert(!m.hits.length && m.opaque, `${vp.width}: the notice sits on the bar's own background (${JSON.stringify(m)})`);
    await shot(page, `e-b4-onb-notice-${vp.width}`);
    await context.close();
  }
  for (const [lang, width] of [['es', 393], ['es', 390], ['es', 320], ['de', 393], ['fr', 393], ['it', 393]]) {
    const { page, context } = await use({ locale: `${lang}-${lang.toUpperCase()}`, viewport: { width, height: 852 } });
    await page.waitForSelector('.home .small-btn');
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      two: [...document.querySelectorAll('.small-btn > span')].filter((s) => { const r = document.createRange(); r.selectNodeContents(s); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1; }).map((s) => s.textContent),
      out: [...document.querySelectorAll('.small-btn')].filter((b) => b.getBoundingClientRect().right > innerWidth + 0.5).length,
    }));
    assert(!m.two.length && !m.out && m.sw <= width, `${lang} ${width}: bottom labels on one line, inside (${JSON.stringify(m)})`);
    if (lang === 'es' && width !== 390) await shot(page, `e-b4-home-${width}`);
    await context.close();
  }
});

await test('B4 records: an imported or stored quick record above 3000 is clamped', async (use) => {
  const { page } = await use({ storage: { stats: JSON.stringify({ bestQuick: 99999, quickGames: 1, bestByLevel: { hard: 5000 } }) } });
  await page.waitForSelector('.home');
  const s = await page.evaluate(async () => { const core = await import('./js/core.js'); const a = core.getStats(); core.importData({ stats: { bestQuick: 1e9 } }); return [a, core.getStats()]; });
  assert(s[0].bestQuick === 3000 && s[0].bestByLevel.hard === 3000 && s[1].bestQuick === 3000, `clamped (${JSON.stringify(s)})`);
});

// ------------------------------------------------------------------ 2.0.0: beta 4 batch 2 (lead decisions 2–4, m1–m4, m14, suggestions)
/** A v4 classic save (2.0.0 fields) on top of classicSave. */
const save4 = (over = {}) => classicSave({ v: 4, fullRound: true, starter: 0, winners: [], roundLeft: null, ...over });
const allGems = () => Object.fromEntries(CATS.map((c) => [c, 2]));
const pl = (name, color, charges = {}) => ({ name, color, charges, lifelines: { atium: 1, stormlight: 1, breath: 1 }, stats: { answered: 4, correct: 3, lifelines: 0 } });

await test('2.0 group games: 2+ players feed no personal stats, "My mistakes", lifeline counts or individual achievements', async (use) => {
  const q = QS.find((x) => x.c === 'roshar' && x.d <= 2);
  const { page } = await use({ storage: { classic: JSON.stringify(save4({ players: [pl('Ana', 'roshar'), pl('Bea', 'sel')], pending: { id: q.id, cat: 'roshar', order: [0, 1, 2, 3], final: false } })) } });
  // m3: "Continue game" says whose turn it is.
  assert(await text(page, '.menu-continue-classic .menu-desc') === T('es', 'home.continueTurn', { name: 'Ana', players: 'Ana, Bea' }), 'continue says whose turn it is');
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .option');
  await page.waitForTimeout(400); // input guard
  await page.click('.lifeline >> nth=0'); // Atium
  await answer(page, false);
  await page.waitForSelector('.feedback .report-link');
  const st = await lsJSON(page, 'stats');
  const answered = st ? CATS.reduce((n, c) => n + (st.cats?.[c]?.a || 0), 0) : 0;
  assert(!answered && !(st?.lifelines?.atium), `no personal answers or lifelines recorded (${JSON.stringify(st)})`);
  assert(!(await lsJSON(page, 'missed'))?.es?.length, '"My mistakes" untouched');
  assert((await lsJSON(page, 'classic')).missed.includes(q.id), 'the game still keeps its own list for the victory review');
  assert(!Object.keys((await lsJSON(page, 'achievements'))?.unlocked || {}).length, 'no achievement');
  // A group victory: counted apart, explained, review hint without "My mistakes".
  const fq = QS.find((x) => x.d === 3);
  const win = await use({ storage: { classic: JSON.stringify(save4({ fullRound: false, players: [pl('Ana', 'roshar', allGems()), pl('Bea', 'sel')], missed: [q.id], pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true } })) } });
  await win.page.click('.menu-continue-classic');
  await win.page.click('.handoff .btn-primary');
  await answer(win.page, true);
  await win.page.click('.continue');
  await win.page.waitForSelector('.victory');
  assert(await text(win.page, '.victory-group') === T('es', 'victory.groupNote'), 'victory explains the group game');
  await win.page.click('.review-summary');
  assert(await text(win.page, '.review-hint') === T('es', 'review.hintGroup'), 'group review hint');
  const s2 = await lsJSON(win.page, 'stats');
  assert(s2.groupGames === 1 && !s2.classicGames, `counted as a group game (${JSON.stringify(s2)})`);
  assert(!(await lsJSON(win.page, 'achievements'))?.unlocked?.firstWin, 'no firstWin from a group game');
  // Stats: "Group games" tile + note; achievements: the group note.
  await win.page.click('.victory .btn-ghost');
  await win.page.click('.small-btn >> nth=0');
  await win.page.waitForSelector('.stats .tiles');
  const tiles = await win.page.locator('.tile').allTextContents();
  assert(tiles.some((x) => x.includes(T('es', 'stats.groupGames')) && x.includes('1')), `group games tile (${tiles})`);
  assert(await text(win.page, '.stats-group-note') === T('es', 'stats.groupNote'), 'stats note');
  for (const w of [320, 390]) { await win.page.setViewportSize({ width: w, height: 760 }); await shot(win.page, `e-20-stats-${w}`); }
  await win.page.click('.stats-ach');
  assert(await text(win.page, '.ach-group-note') === T('es', 'ach.groupNote'), 'achievements note');
  assert(await text(win.page, '.ach-card[data-ach="firstWin"] .ach-desc') === T('es', 'ach.firstWin.desc'), 'firstWin says solo');
});

await test('2.0 full round: setup option (default on with 2+ players), closing round, shared victory with 2 winners', async (use) => {
  // Setup: on by default with 2 players, hidden solo, kept by "Play again".
  let { page } = await use({});
  await page.click('.menu-btn >> nth=0');
  await page.waitForSelector('.setup');
  assert(await page.isVisible('.setup-fullround') && await page.getAttribute('.setup-fullround .switch', 'aria-checked') === 'true', 'on by default with 2 players');
  assert(await text(page, '.setup-fullround .row-label small') === T('es', 'setup.fullRoundHint'), 'explained in setup');
  for (const w of [320, 390]) { await page.setViewportSize({ width: w, height: 900 }); await page.locator('.setup-fullround').scrollIntoViewIfNeeded(); await shot(page, `e-20-setup-${w}`); }
  await page.setViewportSize({ width: 320, height: 900 });
  const big = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth) <= 320, 'setup: no overflow at 320 with 200 % text');
  await page.locator('.setup-fullround').scrollIntoViewIfNeeded();
  await shot(page, 'e-20-setup-320-200');
  await big.evaluate((el) => el.remove());
  await page.click('.stepper-btn >> nth=0');
  assert(!(await page.isVisible('.setup-fullround')), 'hidden with 1 player');
  await page.click('.stepper-btn >> nth=1');
  await page.click('.setup-fullround .switch');
  await page.click('.setup .sticky-actions .btn-primary');
  await page.waitForSelector('.handoff');
  assert((await lsJSON(page, 'classic')).fullRound === false, 'switched off → saved off');
  // Closing round: Ana started; Bea answers the final right; Cy plays on and also answers it right.
  const fq = QS.filter((x) => x.d === 3);
  const players = [pl('Ana', 'roshar'), pl('Bea', 'sel', allGems()), pl('Cy', 'nalthis', allGems())];
  ({ page } = await use({ viewport: { width: 390, height: 844 }, storage: { classic: JSON.stringify(save4({ players, current: 1, starter: 0, missed: [], pending: { id: fq[0].id, cat: fq[0].c, order: [0, 1, 2, 3], final: true } })) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await answer(page, true);
  await page.waitForSelector('.feedback-extra');
  const fb = await text(page, '.feedback-extra');
  assert(fb.includes(T('es', 'classic.finalRoundOn')) && fb.includes(T('es', 'classic.passTurn', { name: 'Cy' })), `the round goes on (${fb})`);
  await page.click('.continue');
  await page.waitForSelector('.handoff .handoff-closing');
  assert(await text(page, '.handoff-closing') === T('es', 'turn.lastTurn', { names: 'Bea' }), 'last-turn notice');
  assert(await text(page, '.handoff-name') === 'Cy', 'Cy plays the rest of the round');
  await shot(page, 'e-20-closing-handoff');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.final-intro');
  await page.click('.btn-final');
  await answer(page, true);
  await page.waitForSelector('.feedback-extra');
  const fb2 = await text(page, '.feedback-extra');
  assert(fb2.includes(T('es', 'classic.finalShare')) && fb2.includes(T('es', 'classic.roundOver')), `shared + round over (${fb2})`);
  await page.click('.continue');
  await page.waitForSelector('.victory.victory-shared');
  assert(await text(page, '.victory-title') === T('es', 'victory.titleShared', { names: 'Bea y Cy' }), `shared title (${await text(page, '.victory-title')})`);
  assert(await page.locator('.vstats-player.winner').count() === 2 && await page.locator('.victory-avatars .avatar').count() === 2, 'two winners marked');
  assert(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no overflow at 390');
  await shot(page, 'e-20-victory-2-winners-390');
  await page.setViewportSize({ width: 320, height: 640 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth) <= 320, 'no overflow at 320');
  await shot(page, 'e-20-victory-2-winners-320');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth) <= 320, 'no overflow at 320 with 200 % text');
  await shot(page, 'e-20-victory-2-winners-320-200');
  // "Play again" keeps the option.
  await page.click('.victory .stack-actions .btn-primary');
  await page.waitForSelector('.setup');
  assert(await page.getAttribute('.setup-fullround .switch', 'aria-checked') === 'true', 'play again keeps the full round');
  // German: the list of names follows the language.
  ({ page } = await use({ locale: 'de-DE', storage: { classic: JSON.stringify(save4({ players: [pl('Ana', 'roshar', allGems()), pl('Bea', 'sel', allGems()), pl('Cy', 'nalthis', allGems())], current: 2, starter: 0, winners: [0, 1], roundLeft: [], missed: [], pending: { id: fq[1].id, cat: fq[1].c, order: [0, 1, 2, 3], final: true } })) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .option');
  await page.waitForTimeout(400);
  await page.locator('.qcard .option').nth(0).click();
  await page.click('.continue');
  await page.waitForSelector('.victory');
  assert(await text(page, '.victory-title') === T('de', 'victory.titleShared', { names: 'Ana, Bea und Cy' }), `de title (${await text(page, '.victory-title')})`);
});

await test('2.0 report: "Avisar de un error" + "Copiar informe" (no GitHub needed), body fully localized', async (use) => {
  for (const [locale, lang] of [['es-ES', 'es'], ['de-DE', 'de'], ['fr-FR', 'fr']]) {
    const { page, context } = await use({ locale, viewport: { width: 320, height: 640 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await page.click('.menu-btn >> nth=2');
    await page.click('.practice-setup .sticky-actions .btn-primary');
    await page.waitForSelector('.practice .qcard .option');
    await page.waitForTimeout(400);
    await page.click('.qcard .option >> nth=0');
    await page.waitForSelector('.feedback .report-copy');
    assert(await text(page, '.feedback .report-link') === T(lang, 'report.link') && await text(page, '.feedback .report-copy') === T(lang, 'report.copy'), `${lang}: labels`);
    await page.click('.feedback .report-copy');
    // Beta 5: the result is a line under the actions (decision 2: GitHub or whoever maintains the
    // game), not a toast over the explanation.
    await page.waitForFunction((m) => document.querySelector('.feedback .report-status:not([hidden])')?.textContent === m, T(lang, 'report.copied'));
    assert(T(lang, 'report.copied').includes('GitHub'), `${lang}: says where to send it`);
    assert(!(await page.evaluate(() => document.getElementById('toast').classList.contains('show'))), `${lang}: no toast`);
    const overlap = await page.evaluate(() => {
      const a = document.querySelector('.feedback .explain')?.getBoundingClientRect();
      const b = document.querySelector('.feedback .report-status').getBoundingClientRect();
      return a ? !(b.top >= a.bottom - 0.5 || b.bottom <= a.top + 0.5) : false;
    });
    assert(!overlap, `${lang}: the message doesn't cover the explanation`);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const colon = lang === 'fr' ? '\u00a0:' : ':';
    for (const k of ['id', 'language', 'world', 'difficulty', 'mode', 'version', 'question']) assert(clip.includes(`**${T(lang, `report.field.${k}`)}${colon}**`), `${lang}: field ${k} localized`);
    assert(clip.includes(T(lang, 'home.practice')) && clip.includes(T(lang, 'report.describe')), `${lang}: mode name and prompt`);
    if (lang !== 'es') assert(!/Idioma|Pregunta|Versión/.test(clip), `${lang}: no Spanish labels`);
    const out = await page.evaluate(() => [...document.querySelectorAll('.report-actions, .report-actions > *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length);
    assert(!out && await page.evaluate(() => document.documentElement.scrollWidth) <= 320, `${lang}: actions fit at 320`);
    await shot(page, `e-20-report-${lang}-320`);
    await context.close();
  }
});

await test('2.0 texts: Easy says "mostly", texts follow the spoiler filter, About rules, German register and number format', async (use) => {
  assert(strings.es.level.easyDesc.startsWith('Sobre todo preguntas fáciles'), 'm1: Easy says "mostly easy"');
  // m2: the whole Cosmere vs a filter that leaves one world.
  let { page, context } = await use({});
  assert(await text(page, '.menu-btn:has-text("' + T('es', 'home.classic') + '") .menu-desc') === T('es', 'home.classicDesc'), 'all worlds: six gems');
  await context.close();
  const scadrialOnly = ALL_WORKS.filter((w) => QS.some((q) => q.w === w && q.c === 'scadrial'));
  ({ page, context } = await use({ storage: { settings: JSON.stringify({ disabledWorks: onlyWorks(scadrialOnly) }) } }));
  assert(await text(page, '.menu-btn:has-text("' + T('es', 'home.classic') + '") .menu-desc') === T('es', 'home.classicDescFiltered'), 'filtered: all your gems');
  await page.click('.menu-quick');
  assert(await text(page, '.quick-intro .lead') === T('es', 'quick.introFiltered', { n: 15, s: 30 }), 'quick intro: your worlds');
  // Achievements out of reach with this filter carry a note; reachable ones don't.
  await page.goto(BASE);
  await page.click('.small-btn >> nth=3');
  await page.waitForSelector('.achievements');
  for (const id of ['flawless', 'allWorlds', 'halfCosmere']) assert(await page.$(`.ach-card[data-ach="${id}"] .ach-blocked`), `${id}: blocked note`);
  for (const id of ['firstWin', 'dailyFirst']) assert(!(await page.$(`.ach-card[data-ach="${id}"] .ach-blocked`)), `${id}: no note`);
  assert(await text(page, '.ach-card[data-ach="flawless"] .ach-blocked') === T('es', 'ach.blocked'), 'note text');
  await shot(page, 'e-20-ach-blocked');
  await context.close();
  // m4: About explains the timer, failing the final, no cap solo, the full round and group games.
  ({ page, context } = await use({ viewport: { width: 390, height: 844 } }));
  await page.click('.small-btn >> nth=2');
  await page.waitForSelector('.about');
  const about = await text(page, '.about');
  for (const k of ['rule5', 'rule7', 'rule8', 'rule9', 'rule10']) assert(about.includes(T('es', `about.${k}`)), `About ${k}`);
  assert(/en solitario no hay límite/.test(T('es', 'about.rule5')), 'no cap solo');
  await shot(page, 'e-20-about-390');
  await page.setViewportSize({ width: 320, height: 640 });
  await shot(page, 'e-20-about-320');
  await context.close();
  // m14: German register ("Spiel", "anhaken") and localized numbers.
  const de = JSON.stringify(strings.de);
  assert(!/Partie|abhak|abgehakt/.test(de), 'German: no "Partie" / "abhaken"');
  assert(!/\b2000\b/.test(JSON.stringify(strings.de.ach)), 'no hard-coded 2000');
  assert(strings.de.ach.stormlightSave.desc !== 'Liege mit aktivem Sturmlicht daneben und antworte im zweiten Versuch richtig.', 'reworded Stormlight achievement');
  ({ page, context } = await use({ locale: 'de-DE' }));
  await page.click('.small-btn >> nth=3');
  assert(await text(page, '.ach-card[data-ach="quickScore"] .ach-desc') === T('de', 'ach.quickScore.desc', { n: '2.000' }), 'German number format');
  await context.close();
});

await test('2.0 resume: the handoff warns that a revealed question’s clock kept running (live), or ran out', async (use) => {
  const q = QS.find((x) => x.d <= 2);
  const mk = (remaining) => save4({ players: [pl('Ana', 'roshar'), pl('Bea', 'sel')], current: 1, phase: 'question', pending: { id: q.id, cat: q.c, order: [0, 1, 2, 3], final: false, clock: { remaining, savedAt: T0 } } });
  let { page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(mk(20_000)) } });
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff-clock');
  assert(await text(page, '.handoff-clock') === T('es', 'turn.clockRunning', { s: 19 }), `seconds left (${await text(page, '.handoff-clock')})`);
  await page.clock.runFor(5_000);
  assert(await text(page, '.handoff-clock') === T('es', 'turn.clockRunning', { s: 14 }), 'updated live');
  await shot(page, 'e-20-handoff-clock');
  await context.close();
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(mk(800)) } }));
  await page.click('.menu-continue-classic');
  assert(await text(page, '.handoff-clock') === T('es', 'turn.clockOut'), 'ran out');
  await context.close();
  // Never revealed (no savedAt): no warning.
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(save4({ players: [pl('Ana', 'roshar'), pl('Bea', 'sel')], pending: { id: q.id, cat: q.c, order: [0, 1, 2, 3], final: false, clock: { remaining: 30_000, savedAt: null } } })) } }));
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  assert(!(await page.$('.handoff-clock')), 'no warning for a question never shown');
  await context.close();
});

await test('2.0 spoiler picker and wildcard: works without questions say so; a single free world skips the choice', async (use) => {
  const withQ = new Set(QS.map((q) => q.w));
  const empty = ALL_WORKS.filter((w) => !withQ.has(w));
  let { page, context } = await use({});
  await page.click('.small-btn >> nth=1');
  await page.waitForSelector('.spoiler-picker');
  assert(await page.locator('.work-empty').count() === empty.length, `${empty.length} works labelled (${empty})`);
  for (const w of empty) assert((await text(page, `label[for="work-${w}"]`)).includes(T('es', 'settings.noQuestionsYet')), `${w} labelled`);
  if (empty.length) { await page.locator(`label[for="work-${empty[0]}"]`).scrollIntoViewIfNeeded(); await shot(page, 'e-20-spoilers-empty'); }
  await context.close();
  // Wheel on an infused gem (Math.random 0.01 → Roshar) or the wildcard (0.99) with one world open: straight to it.
  const ana = { name: 'Ana', color: 'roshar', charges: { roshar: 2 }, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  for (const [r, key] of [[0.01, 'wheel.infusedOnly'], [0.99, 'wheel.wildcardOnly']]) {
    ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(classicSave({ players: [ana], categories: ['roshar', 'sel'], phase: 'spin', pending: null })) } }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('.menu-continue-classic');
    await page.waitForSelector('.spin');
    await page.evaluate((x) => { Math.random = () => x; }, r);
    await page.click('.spin .sticky-actions .btn-primary');
    await page.clock.runFor(700);
    await page.waitForSelector('.wheel-status.notice');
    assert(await text(page, '.wheel-status') === T('es', key, { category: 'Sel' }), `${key}: says it`);
    const saved = await lsJSON(page, 'classic');
    assert(saved.phase === 'question' && saved.pending.cat === 'sel', 'the Sel question is already drawn');
    await page.clock.runFor(2_600);
    await page.waitForSelector('.question .qcard');
    assert(!(await page.$('.choose')), 'no choice screen');
    await context.close();
  }
});

// ================================================================== Beta 5 findings (docs/BETA-5.md)
await test('B5 item 1: screen-change buttons are guarded (quick results, classic handoff and victory, daily result, practice) and fire once', async (use) => {
  const fresh = (page) => page.evaluate(() => !!document.querySelector('.screen.input-guard'));
  // Quick: a double tap on "Ver resultados" must not start another game from the results screen.
  const ro = QS.filter((q) => q.c === 'roshar').slice(0, 15).map((q) => q.id);
  const run = { v: 1, plan: Array(15).fill('roshar'), total: 15, index: 14, score: 1400, correct: 14, level: 'normal', lifelines: { atium: 1, stormlight: 1, breath: 1 }, seen: ro, missed: [],
    current: { id: ro[14], order: [0, 1, 2, 3], fx: { removed: [], struck: [], armed: false }, clock: { remaining: 30_000 } } };
  let { page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 }, storage: { quick: JSON.stringify(run) } });
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard');
  await page.clock.runFor(INPUT_GUARD_MS);
  await answer(page, true);
  assert(await text(page, '.qcard .continue') === T('es', 'quick.seeResults'), 'last question: "Ver resultados"');
  await doubleTap(page, '.qcard .continue');
  await page.waitForSelector('.quick-result');
  assert(await fresh(page), 'the results screen starts guarded');
  // Real taps where "Jugar otra vez" / "Inicio" are, and programmatic clicks (the JS guard).
  for (const sel of ['.quick-again', '.quick-home']) {
    const b = await page.locator(sel).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  await page.evaluate(() => { document.querySelector('.quick-again').click(); document.querySelector('.quick-home').click(); });
  assert(await page.$('.quick-result') && await lsGet(page, 'quick') === null && await lsGet(page, 'quickResult') !== null, 'still on the results (no new game, record screen kept)');
  await shot(page, 'e-b5-1-quick-result-after-double-tap');
  await page.clock.runFor(INPUT_GUARD_MS);
  assert(!(await fresh(page)), 'guard lifted after INPUT_GUARD_MS');
  const recent0 = ((await lsJSON(page, 'recent'))?.es || []).length;
  await page.evaluate(() => { const b = document.querySelector('.quick-again'); b.click(); b.click(); });
  await page.waitForSelector('.quick .qcard');
  assert(JSON.parse(await lsGet(page, 'quick')).index === 0, 'then "Jugar otra vez" works');
  assert(((await lsJSON(page, 'recent'))?.es || []).length === recent0 + 1, 'two clicks on it started one game (one question drawn)');
  await context.close();

  // Classic: a double tap on "Continuar" must not skip "Pasa el móvil".
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 }, storage: { classic: JSON.stringify(classicSave({ timer: false })) } }));
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard');
  await page.clock.runFor(INPUT_GUARD_MS);
  await answer(page, false);
  await doubleTap(page, '.qcard .continue');
  await page.waitForSelector('.handoff');
  assert(await text(page, '.handoff-name') === 'Bea' && !(await page.$('.qcard')), 'the handoff to Bea stays on screen');
  await page.evaluate(() => document.querySelector('.handoff .btn-primary').click());
  assert(await page.$('.handoff') && (await lsJSON(page, 'classic')).phase === 'handoff', 'a click while fresh does nothing');
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.evaluate(() => { const b = document.querySelector('.handoff .btn-primary'); b.click(); b.click(); });
  assert((await lsJSON(page, 'classic')).phase !== 'handoff', 'after the guard "Empezar mi turno" works (once)');
  await context.close();

  // Classic victory: the double tap on the final's "Continuar" never lands on "Jugar otra vez".
  const fq = QS.find((x) => x.d === 3);
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 }, storage: { classic: JSON.stringify(save4({ fullRound: false, timer: false, players: [pl('Ana', 'roshar', allGems()), pl('Bea', 'sel')], pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true } })) } }));
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard');
  await page.clock.runFor(INPUT_GUARD_MS);
  await answer(page, true);
  await doubleTap(page, '.qcard .continue');
  await page.waitForSelector('.victory');
  await page.evaluate(() => document.querySelectorAll('.victory .stack-actions .btn').forEach((b) => b.click()));
  assert(await page.$('.victory') && !(await page.$('.setup')), 'victory screen kept');
  await context.close();

  // Daily: the double tap on the 5th "Ver resultados" doesn't press the result screen's buttons.
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } }));
  await page.click('.menu-daily');
  await tapReady(page, '.daily-start');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.daily .qcard .option:not([disabled])');
    await page.clock.runFor(INPUT_GUARD_MS);
    await answer(page, true);
    if (i < 4) await page.click('.daily .continue');
  }
  await doubleTap(page, '.daily .continue');
  await page.waitForSelector('.daily-result');
  await page.evaluate(() => document.querySelector('.daily-home').click());
  assert(await page.$('.daily-result') && await fresh(page), 'daily result kept while fresh');
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.evaluate(() => document.querySelector('.daily-home').click());
  await page.waitForSelector('.home');
  await context.close();

  // Practice: the setup reached from Home ignores a tap on "Empezar" for a moment.
  ({ page, context } = await use({ clock: 'paused' }));
  await page.click('.menu-btn >> nth=2');
  await page.waitForSelector('.practice-setup');
  await page.evaluate(() => document.querySelector('.practice-start').click());
  assert(await page.$('.practice-setup') && !(await page.$('.qcard')), 'practice: still on setup');
  await tapReady(page, '.practice-start');
  await page.waitForSelector('.practice .qcard');
  await page.clock.runFor(INPUT_GUARD_MS);
  await answer(page, true);
  await page.click('.qcard .continue');
  await page.evaluate(() => document.querySelector('.practice-end').click());
  assert(await page.$('.practice .qcard'), 'practice: "Terminar" guarded on the fresh question screen');
});

await test('B5 item 2: Settings and classic setup at 200 % text and 320 px: no overflow, labels never one letter per line', async (use) => {
  const check = (page) => page.evaluate(() => {
    const words = (s) => s.trim().split(/[\s\-‐]+/).filter(Boolean).length; // a hyphen is a fair break
    const lines = (el) => {
      const r = document.createRange();
      const tops = new Set();
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        r.selectNodeContents(n);
        for (const rect of r.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
      }
      return tops.size;
    };
    const bad = [...document.querySelectorAll('.row-label, .stepper-card .row-label')].map((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
      return { t: own.trim(), w: words(own), l: lines(el) };
    }).filter((x) => x.t && x.l > x.w);
    const out = [...document.querySelectorAll('.screen .card *')].filter((e) => {
      const r = e.getBoundingClientRect();
      const c = e.closest('.card').getBoundingClientRect();
      return r.width > 0 && r.right > c.right + 1;
    }).map((e) => e.className || e.tagName).slice(0, 5);
    return { sw: document.documentElement.scrollWidth, bad, out };
  });
  for (const [locale, lang] of [['es-ES', 'es'], ['en-GB', 'en'], ['fr-FR', 'fr'], ['de-DE', 'de'], ['it-IT', 'it']]) {
    const { page, context } = await use({ locale, viewport: { width: 320, height: 640 } });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    for (const [btn, scr] of [['.small-btn >> nth=1', '.settings'], ['.menu-btn >> nth=0', '.setup']]) {
      await page.click(btn);
      await page.waitForSelector(scr);
      const m = await check(page);
      assert(m.sw <= 320 && !m.bad.length && !m.out.length, `${lang} ${scr} at 200 %: ${JSON.stringify(m)}`);
      if (lang === 'es' || lang === 'de') await shot(page, `e-b5-2-${scr.slice(1)}-${lang}-320-200`);
      await page.click('.topbar-back');
      await page.waitForSelector('.home');
    }
    // At normal size the language row keeps label and selector on one line.
    await page.addStyleTag({ content: 'html { font-size: 100% !important; }' });
    await page.click('.small-btn >> nth=1');
    await page.waitForSelector('.settings');
    const same = await page.evaluate(() => { const r = document.querySelector('.settings .row-setting'); return Math.abs(r.querySelector('.row-label').getBoundingClientRect().top - r.querySelector('select').getBoundingClientRect().top) < 20; });
    assert(same, `${lang}: language row on one line at 100 %`);
    assert((await check(page)).bad.length === 0, `${lang}: no broken labels at 100 %`);
    await context.close();
  }
});

await test('B5 item 3: last round — failing the final and the 3rd hit infusing the last gem promise no next turn', async (use) => {
  const fq = QS.find((x) => x.d === 3);
  // Ana answered the final right; Bea (all gems) and Cy play the closing round. Bea fails her final.
  const players = [pl('Ana', 'roshar', allGems()), pl('Bea', 'sel', allGems()), pl('Cy', 'nalthis')];
  let { page, context } = await use({ storage: { classic: JSON.stringify(save4({ players, current: 1, starter: 0, winners: [0], roundLeft: [2], missed: [], pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true } })) } });
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await answer(page, false);
  await page.waitForSelector('.feedback-extra');
  let lines = (await page.locator('.feedback-extra .outcome').allTextContents()).map((x) => x.trim());
  assert(lines.includes(T('es', 'classic.finalFailLast')) && !lines.includes(T('es', 'classic.finalFail')), `final failed in the last round (${lines})`);
  assert(lines.includes(T('es', 'classic.passTurn', { name: 'Cy' })), `the turn passes to Cy (${lines})`);
  await shot(page, 'e-b5-3-final-fail-last');
  await context.close();
  // Same closing round: Bea's 3rd right answer in a row infuses her last gem.
  const qc = QS.find((x) => x.c === 'cosmere' && x.d <= 2);
  const bea = pl('Bea', 'sel', { ...allGems(), cosmere: 1 });
  ({ page, context } = await use({ storage: { classic: JSON.stringify(save4({ players: [pl('Ana', 'roshar', allGems()), bea, pl('Cy', 'nalthis')], current: 1, starter: 0, winners: [0], roundLeft: [2], streak: 2, missed: [], pending: { id: qc.id, cat: 'cosmere', order: [0, 1, 2, 3], final: false } })) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await answer(page, true);
  await page.waitForSelector('.feedback-extra');
  lines = (await page.locator('.feedback-extra .outcome').allTextContents()).map((x) => x.trim());
  assert(lines.includes(T('es', 'classic.lastChanceGone')) && !lines.includes(T('es', 'classic.allInfusedNext')), `last gem in the last round: no final next turn (${lines})`);
  assert(lines.includes(T('es', 'classic.streakPass', { n: 3, name: 'Cy' })), `streak passes to Cy (${lines})`);
  await shot(page, 'e-b5-3-last-chance-gone');
  for (const l of LANGS) for (const k of ['finalFailLast', 'lastChanceGone']) assert(T(l, `classic.${k}`)?.length > 10, `${l}: classic.${k}`);
});

await test('B5 item 6 (decision 1): group games don’t feed the collection or Compendio; solo games do', async (use) => {
  const cos = QS.filter((q) => q.c === 'cosmere').map((q) => q.id);
  const [missing, ...rest] = cos;
  const storage = (players) => ({
    seen: JSON.stringify({ es: rest }), recent: JSON.stringify({ es: rest.slice(-150) }),
    classic: JSON.stringify(classicSave({ players, phase: 'choose', pending: null, categories: ['cosmere', 'sel'], timer: false })),
  });
  const ana = { name: 'Ana', color: 'roshar', charges: {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  const bea = { name: 'Bea', color: 'sel', charges: {}, lifelines: { atium: 1, stormlight: 1, breath: 1 } };
  for (const group of [true, false]) {
    // All but one Cosmere question discovered, and every other one seen lately: the draw takes the missing one.
    const { page, context } = await use({ storage: { ...storage(group ? [ana, bea] : [ana]), ...(group ? {} : { recent: JSON.stringify({ es: rest.slice(-150) }) }) } });
    await page.click('.menu-continue-classic');
    if (group) await page.click('.handoff .btn-primary');
    await page.click('.cat-choice[style*="cosmere"], .cat-choice >> nth=0');
    await page.waitForSelector('.qcard .option');
    const pend = (await lsJSON(page, 'classic')).pending;
    assert(pend.cat === 'cosmere', 'a Cosmere question');
    const seen = (await lsJSON(page, 'seen')).es;
    const recent = (await lsJSON(page, 'recent')).es;
    assert(recent.at(-1) === pend.id, `${group ? 'group' : 'solo'}: the ring learns it (repeats avoided either way)`);
    assert(seen.includes(pend.id) === !group, `${group ? 'group: not discovered' : 'solo: discovered'} (${pend.id})`);
    await answer(page, true);
    await page.waitForSelector('.feedback');
    const unlocked = (await lsJSON(page, 'achievements'))?.unlocked || {};
    assert(pend.id === missing, `the draw took the undiscovered question (${pend.id})`);
    assert(!!unlocked.compendium === !group, `${group ? 'group: no' : 'solo:'} Compendio (${JSON.stringify(unlocked)})`);
    if (group) {
      await page.click('.qcard .continue');
      await page.click('.topbar-back');
      await page.click('.small-btn >> nth=0');
      await page.waitForSelector('.stats .collection');
      assert(await text(page, '.collection .col-world[data-cat="cosmere"] .col-value') === T('es', 'stats.discoveredOf', { n: rest.length, total: cos.length }), 'Stats: the collection did not grow');
      assert(await text(page, '.stats-group-note') === T('es', 'stats.groupNote'), 'the note says so');
      for (const l of LANGS) assert(/colecci|collection|Sammlung|collezione/i.test(T(l, 'stats.groupNote')) && /colecci|collection|Sammlung|collezione/i.test(T(l, 'victory.groupNote')), `${l}: notes mention the collection`);
    }
    await context.close();
  }
});

await test('B5 items 7–9, 12, 13 + suggestions: texts, percent, name field, achievement notice, DE "Problem melden"', async (use) => {
  // 7: Easy says harder ones come when easy ones run out.
  for (const [l, re] of [['es', /más difícil/], ['en', /harder/], ['fr', /plus difficiles/], ['de', /schwerere/], ['it', /più difficile/]]) assert(re.test(T(l, 'level.easyDesc')), `${l}: easyDesc`);
  // 9: French UI strings don't assume a man; suggestion: German "Problem melden"; decision 2: where to send the copy.
  const frAll = JSON.stringify(strings.fr);
  for (const bad of ['Êtes-vous sûr', 'une fois connecté', 'Jouez seul']) assert(!frAll.includes(bad), `fr: no "${bad}"`);
  assert(T('fr', 'settings.resetConfirm').endsWith('Voulez-vous vraiment tout effacer ?') && T('fr', 'report.offlineFailed').endsWith('quand vous serez en ligne.'), 'fr: neutral wording');
  assert(T('de', 'report.link') === 'Problem melden', 'de: "Problem melden" (not "Fehler", which is also "Meine Fehler")');
  // 8: Stats percent follows the language (fr "{n} %" with a no-break space, it "{n}%") and never splits.
  const ids = QS.slice(0, 49).map((q) => q.id);
  for (const [locale, lang] of [['fr-FR', 'fr'], ['it-IT', 'it']]) {
    const { page, context } = await use({ locale, viewport: { width: 320, height: 640 }, storage: { seen: JSON.stringify({ [lang]: ids }), stats: JSON.stringify({ cats: { roshar: { a: 3, c: 2 } } }) } });
    await page.click('.small-btn >> nth=0');
    await page.waitForSelector('.stats .collection');
    const total = JSON.parse(readFileSync(join(APP_DIR, 'data', `questions.${lang}.json`), 'utf8')).length;
    const n = Math.round((49 / total) * 100);
    assert(await text(page, '.col-pct') === `(${T(lang, 'victory.percent', { n })})`, `${lang}: collection percent (${await text(page, '.col-pct')})`);
    assert(await page.evaluate(() => document.querySelector('.col-pct').getClientRects().length) === 1, `${lang}: "(n %)" on one line`);
    const tiles = await page.locator('.tile-value').allTextContents();
    assert(tiles.includes(T(lang, 'victory.percent', { n: 67 })), `${lang}: accuracy tile (${tiles})`);
    await context.close();
  }
  // 12: the name field has no UTF-16 maxlength; 24 graphemes, emoji whole.
  let { page, context } = await use({ viewport: { width: 390, height: 844 } });
  await page.click('.menu-btn >> nth=0');
  await page.waitForSelector('.setup #pname-0');
  assert(await page.getAttribute('#pname-0', 'maxlength') === null, 'no maxlength');
  const family = '👨‍👩‍👧‍👦';
  const name = `Ana ${family}${'🇪🇸'.repeat(8)}`;
  await page.fill('#pname-0', name);
  assert(await page.inputValue('#pname-0') === name, 'a 13-grapheme name with emoji is kept whole');
  await page.fill('#pname-0', '🙂'.repeat(30));
  assert(await page.inputValue('#pname-0') === '🙂'.repeat(24), 'capped at 24 graphemes');
  await page.fill('#pname-0', name);
  await page.click('.setup-start');
  await page.waitForSelector('.handoff');
  assert((await lsJSON(page, 'classic')).players[0].name === name, 'saved whole');
  await context.close();
  // 13: Home with the clock moved back after today's challenge.
  const day = await (await use({ clock: true })).page.evaluate(async () => (await import('./js/daily.js')).dateKey());
  const marks = CATS.slice(0, 5).map((c) => ({ c, ok: true }));
  const daily = (date) => JSON.stringify({ v: 1, last: date, streak: 2, best: 2, played: 2, perfect: 0, result: { date, lang: 'es', marks, ids: [], filtered: false }, run: null });
  ({ page, context } = await use({ clock: true, storage: { daily: daily(addDays(day, 1)) } }));
  await page.waitForSelector('.home .menu-daily');
  assert(await text(page, '.menu-daily .menu-desc') === T('es', 'home.dailyLocked'), `clock back: no "Hecho hoy" (${await text(page, '.menu-daily .menu-desc')})`);
  await context.close();
  ({ page, context } = await use({ clock: true, storage: { daily: daily(day) } }));
  assert(await text(page, '.menu-daily .menu-desc') === T('es', 'home.dailyDone', { n: 5, total: 5, streak: 2 }), 'today: "Hecho hoy"');
  await context.close();
  // Suggestion: the achievement notice never covers the Back button, and a tap closes it.
  for (const width of [320, 390]) {
    ({ page, context } = await use({ clock: 'paused', viewport: { width, height: 700 } }));
    await page.emulateMedia({ reducedMotion: 'reduce' }); // the screenshot shows the notice, not its entry animation
    await page.click('.small-btn >> nth=0');
    await page.waitForSelector('.stats');
    await page.evaluate(async () => (await import('./js/core.js')).unlockAchievement('answered100'));
    await page.waitForSelector('.ach-toast');
    const [a, b] = await page.evaluate(() => [document.querySelector('.ach-toast'), document.querySelector('.topbar-back')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    assert(a.l >= b.r || a.t >= b.b, `${width}: notice clear of Back (${JSON.stringify([a, b])})`);
    await shot(page, `e-b5-ach-toast-${width}`);
    await page.click('.ach-toast');
    await page.waitForSelector('.ach-toast', { state: 'detached' });
    await page.click('.topbar-back');
    await page.waitForSelector('.home');
    await context.close();
  }
});

// ================================================================== Beta 6 findings (docs/BETA-6.md)
await test('B6 item 1: every control of a fresh screen is guarded (wheel "Girar", Home menu, onboarding), not the first screen at boot', async (use) => {
  const fresh = (page) => page.evaluate(() => !!document.querySelector('#app .screen.input-guard'));
  const tapAt = async (page, sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const b = await page.locator(sel).first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  // Solo classic, 320×568: the double tap on "Empezar" must not spin the wheel ("Girar" sits where "Empezar" was).
  let { page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } });
  await page.waitForSelector('.home');
  assert(!(await fresh(page)), 'Home at boot: no guard');
  await page.evaluate(() => document.querySelector('.menu-primary').click()); // works at once (boot screen)
  await page.waitForSelector('.setup');
  assert(await fresh(page), 'setup starts guarded');
  await page.evaluate(() => document.querySelector('.stepper-btn').click());
  assert(await page.locator('.setup-player').count() === 2, 'the stepper (a plain button) is guarded too');
  await page.click('.stepper-btn >> nth=0');
  assert(await page.locator('.setup-player').count() === 1, 'then it works');
  await page.clock.runFor(INPUT_GUARD_MS);
  const sb = await page.locator('.setup-start').boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); // lands on "Girar"
  await page.waitForSelector('.spin');
  await page.evaluate(() => { document.querySelector('.spin .sticky-actions .btn').click(); document.querySelector('.spin .wheel').click(); });
  await tapAt(page, '.spin .wheel');
  await page.clock.runFor(100);
  assert(await text(page, '.wheel-status') === T('es', 'wheel.tapToSpin') && !(await page.$eval('.spin .sticky-actions .btn', (b) => b.disabled)), 'the wheel did not spin');
  assert((await lsJSON(page, 'classic')).phase === 'spin', 'still the spin phase');
  await shot(page, 'e-b6-1-spin-after-double-tap');
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.click('.spin .sticky-actions .btn');
  assert(await text(page, '.wheel-status') === T('es', 'wheel.spinning'), '"Girar" works after the guard');
  await context.close();

  // Home reached from Settings: its menu ignores the second tap.
  ({ page, context } = await use({ clock: 'paused', viewport: { width: 320, height: 568 } }));
  await page.click('.small-btn >> nth=1');
  await page.waitForSelector('.settings');
  await page.clock.runFor(INPUT_GUARD_MS);
  await tapAt(page, '.topbar-back');
  await page.waitForSelector('.home');
  assert(await fresh(page), 'Home reached by a tap starts guarded');
  await page.evaluate(() => document.querySelectorAll('.home .menu-btn, .home .small-btn').forEach((b) => b.click()));
  await tapAt(page, '.menu-btn >> nth=2');
  assert(await page.$('.home') && !(await page.$('.modal')), 'no menu entry opened (Práctica, Ajustes…)');
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.evaluate(() => document.querySelectorAll('.home .menu-btn')[2].click());
  await page.waitForSelector('.practice-setup');
  await context.close();

  // First-run introduction: step 1 at boot is not guarded; steps 2 and 3 are.
  ({ page, context } = await use({ clock: 'paused', fresh: true, viewport: { width: 320, height: 568 } }));
  await page.waitForSelector('.onboarding .onb-readall');
  assert(!(await fresh(page)), 'the introduction at boot has no guard');
  await page.evaluate(() => document.querySelector('.onb-readall').click());
  await page.waitForSelector('.onboarding .onb-next');
  const step = () => text(page, '.onb-step');
  assert(await step() === T('es', 'onboarding.step', { n: 2, total: 3 }), 'step 2');
  await page.evaluate(() => document.querySelector('.onb-next').click());
  await tapAt(page, '.onb-next');
  assert(await step() === T('es', 'onboarding.step', { n: 2, total: 3 }), 'a tap on the fresh step 2 does nothing');
  await page.clock.runFor(INPUT_GUARD_MS);
  await page.locator('.onb-next').scrollIntoViewIfNeeded();
  const nb = await page.locator('.onb-next').boundingBox();
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); // where "Empezar" appears
  await page.waitForSelector('.onboarding .onb-start');
  assert(await step() === T('es', 'onboarding.step', { n: 3, total: 3 }), 'the double tap on "Siguiente" does not press "Empezar"');
  await page.evaluate(() => document.querySelector('.onb-start').click());
  assert(await page.$('.onboarding'), 'step 3 guarded');
  await page.click('.onb-start');
  await page.waitForSelector('.home');
  assert(JSON.parse(await lsGet(page, 'settings')).onboarded === true, 'then "Empezar" finishes the introduction');
});

await test('B6 item 2: moving the system clock back while away gives no time back (quick and classic); a reload uses the wall time', async (use) => {
  // Quick game: 2 s on screen, 20 s hidden while the clock is moved back 60 s → 8 s left, not 28.
  let { page, context } = await use({ clock: 'paused' });
  await page.click('.menu-quick');
  await tapReady(page, '.quick-intro .sticky-actions .btn-primary');
  await page.waitForSelector('.quick .qcard .timer-num');
  assert(await secs(page) === 30, 'starts at 30');
  await page.clock.runFor(2_000);
  await hide(page, true);
  const c = (await lsJSON(page, 'quick')).current.clock;
  assert(c.remaining === 28_000 && typeof c.mono === 'number' && typeof c.sid === 'string', `saved with the monotonic stamp (${JSON.stringify(c)})`);
  await page.clock.runFor(20_000);
  await page.clock.setSystemTime(await page.evaluate(() => Date.now()) - 60_000);
  await hide(page, false);
  assert(await secs(page) === 8, `20 s away count although the clock went back (${await secs(page)})`);
  await page.clock.runFor(1_000);
  assert(await secs(page) === 7, 'and it counts on');
  // A reload is another session: the wall time since the last save counts (here 2 s).
  await page.reload();
  await page.waitForSelector('.home .menu-continue-quick');
  await page.clock.runFor(2_000);
  await page.click('.menu-continue-quick');
  await page.waitForSelector('.quick .qcard .timer-num');
  const afterReload = await secs(page);
  assert(afterReload >= 4 && afterReload <= 5, `reload: wall time counted (${afterReload})`);
  await context.close();

  // Classic (timer on): the same with Home in between instead of a hidden page.
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(classicSave()) } }));
  await page.click('.menu-continue-classic');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  await page.clock.runFor(5_000);
  await leaveClassic(page);
  await page.clock.runFor(10_000);
  await page.clock.setSystemTime(await page.evaluate(() => Date.now()) - 120_000);
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff .handoff-clock');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  const left = await secs(page);
  assert(left >= 14 && left <= 15, `classic: Home time counted despite the clock moved back (${left})`);
});

await test('B6 item 3: Home at 200 % text, 320/390 px: "Herausforderung" and "Cosmoverso" fit, no word split', async (use) => {
  for (const width of [320, 390]) {
    for (const [locale, lang] of [['es-ES', 'es'], ['en-US', 'en'], ['fr-FR', 'fr'], ['de-DE', 'de'], ['it-IT', 'it']]) {
      const { page, context } = await use({ locale, viewport: { width, height: 700 } });
      await page.waitForSelector('.home .menu-daily');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.waitForTimeout(50);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('#app *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > W + 0.5 || b.left < -0.5); }).map((e) => e.className);
        const split = [];
        for (const el of document.querySelectorAll('.title, .menu-title')) {
          const box = el.closest('.menu-btn, .hero').getBoundingClientRect();
          if (el.getBoundingClientRect().right > box.right + 0.5) over.push(el.className);
          const n = el.firstChild;
          for (const m of n.data.matchAll(/[^\s-]+/g)) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            if ([...rg.getClientRects()].filter((x) => x.width > 0).length > 1) split.push(m[0]);
          }
        }
        return { over, split, sw: document.documentElement.scrollWidth, W };
      });
      assert(r.sw <= r.W && !r.over.length && !r.split.length, `${lang} ${width}: ${JSON.stringify(r)}`);
      if (width === 320 && (lang === 'de' || lang === 'it')) await page.screenshot({ path: join(SHOTS, `e-b6-3-home-200-${lang}.png`), fullPage: true });
      await context.close();
    }
  }
});

await test('B6 item 4: default player names follow the language (setup, saved game, Home, handoff, victory, Play again)', async (use) => {
  // Empty names in Spanish: "Jugador 1/2" stored as defaults.
  let { page, context } = await use({ clock: true });
  await page.click('.menu-primary');
  await tapReady(page, '.setup-start');
  await page.waitForSelector('.handoff');
  const s = await lsJSON(page, 'classic');
  assert(JSON.stringify(s.players.map((p) => [p.name, p.auto])) === JSON.stringify([['Jugador 1', true], ['Jugador 2', true]]), `defaults stored (${JSON.stringify(s.players.map((p) => [p.name, p.auto]))})`);
  await context.close();

  // The same kind of save opened in English: Home, handoff and victory say "Player 1"; Play again leaves the field empty.
  const EN = JSON.parse(readFileSync(join(APP_DIR, 'data', 'questions.en.json'), 'utf8'));
  const enAnswers = Object.fromEntries(EN.map((q) => [q.q, q.o[0]]));
  const fq = EN.find((x) => x.d === 3);
  const save = save4({ fullRound: false, timer: false, players: [{ ...pl('Jugador 1', 'roshar', allGems()), auto: true }, pl('Bea', 'sel')], pending: { id: fq.id, cat: fq.c, order: [0, 1, 2, 3], final: true } });
  ({ page, context } = await use({ locale: 'en-US', clock: true, storage: { settings: JSON.stringify({ lang: 'en' }), classic: JSON.stringify(save) } }));
  await page.waitForSelector('.home .menu-continue-classic');
  assert(await text(page, '.menu-continue-classic .menu-desc') === T('en', 'home.continueTurn', { name: 'Player 1', players: 'Player 1, Bea' }), `Home (${await text(page, '.menu-continue-classic .menu-desc')})`);
  await page.click('.menu-continue-classic');
  await page.waitForSelector('.handoff');
  assert(await text(page, '.handoff-name') === 'Player 1', 'handoff in English');
  await tapReady(page, '.handoff .btn-primary');
  await page.waitForSelector('.qcard .option');
  await page.waitForTimeout(INPUT_GUARD_MS + 50);
  const right = enAnswers[await text(page, '.qtext')];
  const opts = page.locator('.qcard .option .option-text');
  const texts = (await opts.allTextContents()).map((x) => x.trim());
  await page.locator('.qcard .option').nth(texts.indexOf(right)).click();
  await tapReady(page, '.qcard .continue');
  await page.waitForSelector('.victory');
  assert(await text(page, '.victory-title') === T('en', 'victory.title', { name: 'Player 1' }), `victory (${await text(page, '.victory-title')})`);
  await tapReady(page, '.victory .stack-actions .btn-primary');
  await page.waitForSelector('.setup');
  const fields = await page.$$eval('.setup-player .text-input', (els) => els.map((e) => [e.value, e.placeholder]));
  assert(JSON.stringify(fields) === JSON.stringify([['', 'Player 1'], ['Bea', 'Player 2']]), `Play again keeps the default as a default (${JSON.stringify(fields)})`);
});

await test('B6 item 5: es reset text, de closing-round texts, no line starting with "·" on Home or Stats, Stats "(n %)" whole (200 %, 320/390 px)', async (use) => {
  assert(T('es', 'settings.resetConfirm').endsWith('¿Quieres borrarlo todo?') && !T('es', 'settings.resetConfirm').includes('Seguro'), 'es reset');
  assert(T('de', 'classic.finalRoundOn').endsWith('Wer die Finalfrage ebenfalls richtig beantwortet, teilt sich den Sieg.'), 'de finalRoundOn');
  assert(T('de', 'classic.lastChanceGone').endsWith('Aber die Runde endet jetzt: Du bekommst keinen weiteren Zug.'), 'de lastChanceGone');
  const ids = QS.slice(0, 15).map((q) => q.id);
  for (const width of [320, 390]) {
    for (const [locale, lang] of [['fr-FR', 'fr'], ['it-IT', 'it'], ['de-DE', 'de'], ['es-ES', 'es'], ['en-US', 'en']]) {
      const { page, context } = await use({ locale, viewport: { width, height: 700 }, storage: { seen: JSON.stringify({ [lang]: ids }), stats: JSON.stringify({ quickGames: 1, cats: { roshar: { a: 15, c: 15 } } }) } });
      await page.waitForSelector('.home');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      // A middle dot is never the first thing on a line (Home descriptions and the Stats percent).
      const dotStartsLine = () => page.evaluate(() => {
        const bad = [];
        const walker = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          for (const m of n.data.matchAll(/·/g)) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + 1);
            const dot = rg.getBoundingClientRect();
            const block = n.parentElement.closest('p, li, .menu-desc, .menu-text, div');
            const left = block.getBoundingClientRect().left + parseFloat(getComputedStyle(block).paddingLeft);
            if (dot.left - left < 2) bad.push(n.data);
          }
        }
        return bad;
      });
      let bad = await dotStartsLine();
      assert(!bad.length, `${lang} ${width} Home: ${JSON.stringify(bad)}`);
      await page.click('.small-btn >> nth=0');
      await page.waitForSelector('.stats .collection .col-pct');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      bad = await dotStartsLine();
      assert(!bad.length, `${lang} ${width} Stats: ${JSON.stringify(bad)}`);
      assert(/^\(.+\)$/.test(await text(page, '.col-pct')) && await page.evaluate(() => document.querySelector('.col-pct').getClientRects().length) === 1, `${lang} ${width}: percent "(n %)" in one piece`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${lang} ${width}: no overflow`);
      if (lang === 'fr' && width === 320) await shot(page, 'e-b6-5-stats-fr-200');
      await context.close();
    }
  }
});

// ------------------------------------------------------------------ 2.0.3 (beta 6b)
await test('B6b N1: opening a non-HTML file in the tab never replaces the offline shell', async (use) => {
  const { page, context } = await use({ swAllowed: true });
  await page.waitForSelector('.home');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.home');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Another tab of the same app opens the files directly (its own broken-page noise is not checked).
  const other = await context.newPage();
  for (const path of ['icons/icon.svg', 'manifest.webmanifest', 'data/questions.es.json']) {
    await other.goto(new URL(path, BASE).href);
    await other.waitForTimeout(300); // let the worker finish its background cache write
  }
  await other.close();
  await context.setOffline(true);
  await page.goto(BASE);
  await page.waitForSelector('.home', { timeout: 10000 });
  await context.setOffline(false);
});

await browser.close();
server.close();
const failed = results.filter(([, e]) => e);
console.log(failed.length ? `\nEDGE FAILED: ${failed.length} of ${results.length}` : `\nEDGE OK — ${results.length} tests, screenshots in ${SHOTS}`);
process.exitCode = failed.length ? 1 : 0;
