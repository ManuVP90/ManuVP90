#!/usr/bin/env node
// End-to-end smoke test (Playwright + Chromium) on a phone viewport.
// Usage: node tools/smoke.mjs        (SCREENSHOT_DIR=/some/dir to choose where PNGs go)
// Plays a full classic game with 2 players to victory, checks resume after reload,
// cycles through all 5 languages, plays a quick game to the end, opens practice,
// stats and about, and checks the app loads offline. Fails on any console error.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, APP_DIR } from './serve.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall back to a global install */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(join(globalRoot, 'noop.js'))('playwright');
}

const { chromium, devices } = await loadPlaywright();
const SHOTS = process.env.SCREENSHOT_DIR || join(tmpdir(), 'cosmere-smoke');
mkdirSync(SHOTS, { recursive: true });

const LANGS = ['es', 'en', 'fr', 'de', 'it'];
const strings = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(APP_DIR, 'i18n', `${l}.json`), 'utf8'))]));
// Correct answer for each question text, per language (o[0] is always correct).
const answers = {};
for (const l of LANGS) {
  try {
    for (const q of JSON.parse(readFileSync(join(APP_DIR, 'data', `questions.${l}.json`), 'utf8'))) answers[q.q] = q.o[0];
  } catch { /* missing language file */ }
}

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) errors.push(`requestfailed: ${r.url()}`); });

let step = 0;
const log = (m) => console.log(`  ${String(++step).padStart(2, '0')} ${m}`);
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };
function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }
const T = (lang, key) => key.split('.').reduce((o, k) => o?.[k], strings[lang]);

/** Answers the visible question: correctly when `correct`, otherwise picks a wrong option. */
async function answer(correct = true) {
  await page.waitForSelector('.qcard .option');
  const qtext = (await page.textContent('.qtext')).trim();
  const right = answers[qtext];
  assert(right, `unknown question text: ${qtext}`);
  const opts = page.locator('.qcard .option');
  const texts = await opts.locator('.option-text').allTextContents();
  let idx = texts.findIndex((t) => (t.trim() === right) === correct);
  if (idx < 0) idx = 0;
  await opts.nth(idx).click();
  await page.waitForSelector('.qcard .continue:not([hidden])');
  return correct;
}

try {
  // ---------------------------------------------------------------- home (auto-detected es)
  await page.goto(BASE);
  await page.waitForSelector('.home');
  assert((await page.textContent('h1.title')).trim() === T('es', 'app.title'), 'Spanish title from navigator.language');
  await shot('01-home-es');
  log('home rendered in Spanish (auto-detected)');

  // ---------------------------------------------------------------- classic: setup
  await page.click('.menu-btn:has-text("' + T('es', 'home.classic') + '")');
  await page.waitForSelector('.setup');
  while ((await page.locator('.setup-player').count()) > 2) await page.click('.stepper-btn >> nth=0');
  while ((await page.locator('.setup-player').count()) < 2) await page.click('.stepper-btn >> nth=1');
  await page.fill('#pname-0', 'Shallan');
  await page.fill('#pname-1', 'Vin');
  await page.click('.setup-player >> nth=1 >> .swatch >> nth=4'); // amethyst for player 2
  await shot('02-setup');
  await page.click('.sticky-actions .btn-primary');
  log('classic setup with 2 players');

  // ---------------------------------------------------------------- classic: play to victory
  let questions = 0;
  let firstSpinShot = false;
  let wrongDone = false;
  for (let guard = 0; guard < 400; guard++) {
    await page.waitForSelector('.handoff, .spin, .choose, .final-intro, .question, .victory');
    if (await page.$('.victory')) break;
    if (await page.$('.handoff')) {
      if (questions === 0) await shot('03-handoff');
      await page.click('.handoff .btn-primary');
    } else if (await page.$('.spin')) {
      if (!firstSpinShot) {
        await shot('04-wheel');
        await page.click('.wheel');
        await page.waitForTimeout(1200);
        await shot('05-wheel-spinning');
        firstSpinShot = true;
        await page.emulateMedia({ reducedMotion: 'reduce' }); // speed up the remaining spins
      } else {
        await page.click('.wheel');
      }
      await page.waitForSelector('.choose, .question', { timeout: 10000 });
    } else if (await page.$('.choose')) {
      await shot('06-wildcard');
      await page.click('.cat-choice >> nth=0');
    } else if (await page.$('.final-intro')) {
      await shot('09-final-intro');
      await page.click('.final-intro .btn-final');
    } else if (await page.$('.question')) {
      const isFinal = !!(await page.$('.qcard.final'));
      if (questions === 0) await shot('07-question');
      if (isFinal) {
        await shot('10-final-question');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      // First answer is wrong on purpose (turn must pass to player 2), then always right.
      const correct = wrongDone ? true : (wrongDone = true, false);
      await answer(correct);
      if (questions === 0) await shot('08-reveal');
      if (questions === 3) {
        // Reload mid-game: the game must be resumable from home.
        await page.reload();
        await page.waitForSelector('.home .menu-continue');
        await shot('11-home-continue');
        await page.click('.home .menu-continue');
        log('reload → "Continue game" resumes the classic game');
      } else {
        await page.click('.qcard .continue');
      }
      questions++;
    }
  }
  await page.waitForSelector('.victory', { timeout: 5000 });
  await page.waitForTimeout(900);
  await shot('12-victory');
  assert((await page.textContent('.victory-title')).includes('Vin'), 'player 2 (Vin) wins after player 1 missed');
  log(`classic game won by Vin after ${questions} questions (wrong answer passed the turn)`);
  await page.click('.victory .btn-ghost');
  await page.waitForSelector('.home');
  assert(!(await page.$('.menu-continue')), 'finished game is no longer resumable');

  // ---------------------------------------------------------------- languages
  await page.click('.small-btn >> nth=1');
  await page.waitForSelector('.settings');
  await shot('13-settings-es');
  for (const lang of ['en', 'fr', 'de', 'it', 'es']) {
    await page.selectOption('#lang-select', lang);
    await page.waitForFunction((l) => document.documentElement.lang === l, lang);
    await page.waitForFunction((title) => document.querySelector('.topbar-title')?.textContent === title, T(lang, 'settings.title'));
    if (lang === 'de') await shot('14-settings-de');
    await page.click('.topbar .icon-btn');
    await page.waitForSelector('.home');
    assert((await page.textContent('h1.title')).trim() === T(lang, 'app.title'), `title in ${lang}`);
    if (lang !== 'es') await shot(`15-home-${lang}`);
    await page.click('.small-btn >> nth=1');
    await page.waitForSelector('.settings');
  }
  log('switched through en, fr, de, it, es');

  // light theme
  await page.click('.seg >> nth=1');
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.home');
  assert(await page.evaluate(() => document.documentElement.dataset.theme === 'light'), 'light theme applied');
  await shot('16-home-light');
  await page.click('.small-btn >> nth=1');
  await page.click('.seg >> nth=0');
  await page.click('.topbar .icon-btn');
  log('theme toggle');

  // ---------------------------------------------------------------- quick game
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('.menu-btn >> nth=1');
  for (let i = 0; ; i++) {
    await page.waitForSelector('.quick .qcard, .quick-result');
    if (await page.$('.quick-result')) break;
    await answer(i % 4 !== 3);
    if (i === 1) await shot('17-quick-question');
    await page.click('.qcard .continue');
    assert(i < 20, 'quick game ends');
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await shot('18-quick-result');
  const scoreText = await page.textContent('.result-score');
  assert(/\d/.test(scoreText), 'quick score shown');
  log(`quick game finished: ${scoreText.trim()}`);
  await page.click('.quick-result .btn-ghost');

  // ---------------------------------------------------------------- practice
  await page.click('.menu-btn >> nth=2');
  await page.waitForSelector('.practice-setup');
  await page.click('.chips >> nth=0 >> .chip >> nth=1');
  await page.click('.chips >> nth=1 >> .chip >> nth=3');
  await shot('19-practice-setup');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await answer(false);
  await shot('20-practice-question');
  assert(await page.$('.explain'), 'practice shows explanation');
  await page.click('.qcard .continue');
  await page.waitForSelector('.practice .qcard');
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.practice-setup');
  await page.click('.topbar .icon-btn');
  log('practice mode');

  // ---------------------------------------------------------------- stats & about
  await page.click('.small-btn >> nth=0');
  await page.waitForSelector('.stats .bar-row');
  await shot('21-stats');
  await page.click('.topbar .icon-btn');
  await page.click('.small-btn >> nth=2');
  await page.waitForSelector('.about .disclaimer');
  await shot('22-about');
  await page.click('.topbar .icon-btn');
  log('stats and about');

  // ---------------------------------------------------------------- spoiler filter
  await page.click('.small-btn >> nth=1');
  await page.click('.btn-row .btn >> nth=1'); // select none
  await page.check('#work-way-of-kings');
  await page.check('#work-elantris');
  await shot('23-spoilers');
  await page.click('.topbar .icon-btn');
  await page.click('.menu-btn >> nth=0');
  await page.waitForSelector('.setup');
  await page.click('.sticky-actions .btn-primary');
  await page.waitForSelector('.handoff');
  await page.click('.handoff .btn-primary');
  const wedges = await page.locator('.wheel-sectors path').count();
  const usedLang = await page.evaluate(() => fetch('data/questions.es.json').then((r) => r.json()).then((a) => (a.length ? 'es' : 'en')));
  const pool = JSON.parse(readFileSync(join(APP_DIR, 'data', `questions.${usedLang}.json`), 'utf8'));
  const expected = new Set(pool.filter((q) => q.w === 'way-of-kings' || q.w === 'elantris').map((q) => q.c)).size + 1;
  assert(wedges === expected && wedges < 7, `wheel shows only categories with questions + wildcard (got ${wedges}, expected ${expected})`);
  await shot('24-wheel-filtered');
  log('spoiler filter shrinks the wheel');
  await page.click('.topbar .icon-btn');
  await page.click('.small-btn >> nth=1');
  await page.click('.btn-row .btn >> nth=0'); // select all again
  await page.click('.topbar .icon-btn');

  // ---------------------------------------------------------------- offline
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.home');
  await page.click('.menu-btn:has-text("' + T('es', 'home.practice') + '")');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  await context.setOffline(false);
  log('works offline after first load (service worker)');

  // ---------------------------------------------------------------- tablet / desktop sanity
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.click('.topbar .icon-btn'); // practice → practice setup
  await page.waitForSelector('.practice-setup');
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.home');
  await shot('25-home-tablet');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, 'no horizontal overflow on tablet');
  log('tablet viewport');

  if (errors.length) throw new Error(`Console errors:\n${errors.join('\n')}`);
  console.log(`\nSMOKE OK — screenshots in ${SHOTS}`);
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.error(`\nSMOKE FAILED: ${e.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
