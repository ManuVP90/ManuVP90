#!/usr/bin/env node
// Edge-case regression tests (Playwright + Chromium) for the Beta 1 and Beta 2 findings (docs/BETA-1.md).
// Usage: node tools/edge.mjs          (SCREENSHOT_DIR=/some/dir to choose where PNGs go; ONLY=<regex> for a subset)
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
 * written before the app boots; `clock` installs the fake clock at T0. Unless `fresh` is set,
 * empty settings are stored too, so the first-run introduction stays out of the way.
 */
async function open({ locale = 'es-ES', device = 'Pixel 7', viewport = null, seed = 7, storage = null, clock = false, before = null, allow = [], fresh = false } = {}) {
  const context = await browser.newContext({ ...devices[device], ...(viewport ? { viewport } : {}), locale, serviceWorkers: 'block' });
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
  if (clock === 'paused') await page.clock.pauseAt(T0 + 1000); // time only moves with runFor (exact timer checks)
  if (before) await before(page, context);
  await page.goto(BASE);
  return { context, page, errors };
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
      assert(vals.every((v) => /^(\d[\d.\s]*|—|\d+ %)$/.test(v.trim())), `${name}: stat tiles are numbers (${vals})`);
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.handoff .btn-primary');
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
  await page.click('.quick-intro .sticky-actions .btn-primary');
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
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  assert(await text(page, '.qtext') === q.q, 'classic: same question although its book is now filtered out');
  assert(await text(page, '.timer-num') === '12', 'classic: time left kept (no fresh timer)');
  assert((await page.locator('.qcard .option-text').allTextContents()).map((x) => x.trim())[1] === q.o[0], 'classic: same option order');
  await context.close();
  // Changing the filter in Settings mid-game (Home → Settings → Continue) changes nothing either.
  ({ page, context } = await use({ clock: 'paused', storage: { classic: JSON.stringify(save) } }));
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard .timer-num');
  await page.click('.topbar-back');
  await page.click('.modal .btn-primary'); // "the time keeps running" (the paused clock doesn't move)
  await page.click('.small-btn >> nth=1');
  await page.click('.spoiler-none');
  await page.click('.topbar .icon-btn');
  await page.click('.menu-continue-classic');
  await page.click('.handoff .btn-primary');
  await page.waitForSelector('.qcard');
  assert(await text(page, '.qtext') === q.q && await text(page, '.timer-num') === '12', 'classic: settings change mid-question gives no re-draw');
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
  const save = classicSave({ players: [ana], categories: ['roshar', 'sel'], phase: 'spin', pending: null });
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
    assert(await page.locator('.about ol li').count() === 6, 'About lists 6 rules (already-infused gem included)');
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
await test('B3 timer: clockLeft deducts away time (negative/NaN → 0, never below 0); setup and leave copy in 5 languages', async (use) => {
  const { page } = await use({});
  await page.waitForSelector('.home');
  const r = await page.evaluate(async () => {
    const g = await import('./js/game.js');
    const now = 1_000_000;
    return [
      g.clockLeft({ remaining: 20_000, savedAt: now - 5_000 }, now), // away 5 s
      g.clockLeft({ remaining: 20_000, savedAt: now + 60_000 }, now), // clock moved back: nothing given back
      g.clockLeft({ remaining: 20_000, savedAt: NaN }, now),
      g.clockLeft({ remaining: 20_000, savedAt: now - 99_000 }, now), // capped at 0
      g.clockLeft({ remaining: 20_000, savedAt: null }, now), // paused / not revealed
      g.clockLeft({ remaining: 20_000, savedAt: now - 5_000 }, NaN),
    ];
  });
  assert(JSON.stringify(r) === JSON.stringify([15_000, 20_000, 20_000, 0, 20_000, 20_000]), `clockLeft (${r})`);
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

await browser.close();
server.close();
const failed = results.filter(([, e]) => e);
console.log(failed.length ? `\nEDGE FAILED: ${failed.length} of ${results.length}` : `\nEDGE OK — ${results.length} tests, screenshots in ${SHOTS}`);
process.exitCode = failed.length ? 1 : 0;
