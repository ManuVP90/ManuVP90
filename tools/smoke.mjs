#!/usr/bin/env node
// End-to-end smoke test (Playwright + Chromium) on a phone viewport.
// Usage: node tools/smoke.mjs        (SCREENSHOT_DIR=/some/dir to choose where PNGs go)
// Walks the first-run introduction, then plays a full classic game with 2 players to victory on "Difícil" using each lifeline once
// (random starting player, at most 3 correct answers per turn), checks resume after reload
// (pass-the-phone screen first), cycles through all 5 languages, plays a quick game on "Fácil",
// practices difficulty 4 (fallback while there is no expert data), opens stats and about,
// migrates a v1 save, and checks the app loads offline. Fails on any console error.
// Math.random is seeded so every run plays the same game (see SEED).
// Edge cases (corrupt saves, timers, history, repetitions, layout) live in tools/edge.mjs.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, APP_DIR } from './serve.mjs';

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
const SHOTS = process.env.SCREENSHOT_DIR || join(tmpdir(), 'cosmere-smoke');
mkdirSync(SHOTS, { recursive: true });

const LANGS = ['es', 'en', 'fr', 'de', 'it'];
const strings = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(APP_DIR, 'i18n', `${l}.json`), 'utf8'))]));
// Correct answer for each question text, per language (o[0] is always correct).
const answers = {};
const diffOf = {}; // question text -> difficulty
let maxDiff = 0;
for (const l of LANGS) {
  try {
    for (const q of JSON.parse(readFileSync(join(APP_DIR, 'data', `questions.${l}.json`), 'utf8'))) {
      answers[q.q] = q.o[0];
      diffOf[q.q] = q.d;
      maxDiff = Math.max(maxDiff, q.d);
    }
  } catch { /* missing language file */ }
}
const hasD4 = maxDiff >= 4;

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-ES' });
// Deterministic randomness: a seeded PRNG replaces Math.random in the page.
const SEED = Number(process.env.SEED || 20261016);
await context.addInitScript((seed) => {
  let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}, SEED);
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) errors.push(`requestfailed: ${r.url()}`); });

let step = 0;
const log = (m) => console.log(`  ${String(++step).padStart(2, '0')} ${m}`);
const shot = async (name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  // Every captured screen must be free of leaked JS values such as "null" or "undefined".
  const leaked = await page.evaluate(() => (document.body.innerText.match(/\b(null|undefined|NaN|\[object Object\])\b/) || [])[0]);
  if (leaked) throw new Error(`screen "${name}" shows the literal text "${leaked}"`);
};
function assert(cond, msg) { if (!cond) throw new Error(`Assertion failed: ${msg}`); }
const T = (lang, key) => key.split('.').reduce((o, k) => o?.[k], strings[lang]);

/** Answers the visible question: correctly when `correct`, otherwise picks a wrong option. */
async function answer(correct = true) {
  await page.waitForSelector('.qcard .option');
  const qtext = (await page.textContent('.qtext')).trim();
  const right = answers[qtext];
  assert(right, `unknown question text: ${qtext}`);
  const opts = page.locator('.qcard .option:not([disabled])'); // skip options removed by lifelines
  const texts = await opts.locator('.option-text').allTextContents();
  let idx = texts.findIndex((t) => (t.trim() === right) === correct);
  if (idx < 0) idx = 0;
  await opts.nth(idx).click();
  await page.waitForSelector('.qcard .continue:not([hidden])');
  return correct;
}

const qText = async () => (await page.textContent('.qtext')).trim();
const qId = async () => page.getAttribute('.qtext', 'id');
const enabledOptions = () => page.locator('.qcard .option:not([disabled])').count();
const lifelineBtn = (kind) => page.locator(`.qcard .lifeline-${kind}`);

try {
  // ---------------------------------------------------------------- first-run introduction (auto-detected es)
  await page.goto(BASE);
  await page.waitForSelector('.onboarding');
  assert((await page.textContent('.onb-title')).trim() === T('es', 'onboarding.readTitle'), 'first launch asks what you have read (Spanish)');
  await shot('00a-onboarding-read');
  await page.click('.spoiler-none');
  await page.click('.spoiler-all');
  await page.click('.onb-next');
  await page.waitForSelector('.onb-rules');
  await shot('00b-onboarding-rules');
  await page.click('.onb-next');
  await page.click('.onb-start');
  await page.waitForSelector('.home');
  log('first-run introduction: what have you read → rules → start');

  // ---------------------------------------------------------------- home
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
  assert(await page.getAttribute('.level-opt[data-level="normal"]', 'aria-checked') === 'true', 'level defaults to Normal');
  await page.click('.level-opt[data-level="hard"]');
  assert(await page.getAttribute('.level-opt[data-level="hard"]', 'aria-checked') === 'true', 'Difícil selected');
  await page.locator('.level-card').scrollIntoViewIfNeeded();
  await shot('02-setup-level');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('02-setup');
  await page.click('.sticky-actions .btn-primary');
  log('classic setup with 2 players on "Difícil"');

  // ---------------------------------------------------------------- classic: play to victory
  let questions = 0;
  let firstSpinShot = false;
  let badgeChecked = false;
  let starter = null; // drawn at random: shown as "Empieza: {name}" on the first handoff
  let streak = 0; // correct answers in a row in the current turn
  let resumed = false;
  let maxStreak = 0;
  const usedLifelines = new Set();
  for (let guard = 0; guard < 400; guard++) {
    await page.waitForSelector('.handoff, .spin, .choose, .final-intro, .question, .victory');
    if (await page.$('.victory')) break;
    if (!badgeChecked && await page.$('.level-badge')) {
      assert((await page.textContent('.level-badge-text')).trim() === T('es', 'level.hard'), 'game bar shows the level');
      badgeChecked = true;
    }
    if (await page.$('.handoff')) {
      const who = (await page.textContent('.handoff-name')).trim();
      if (questions === 0) {
        starter = who;
        assert(['Shallan', 'Vin'].includes(starter), `starter is a player (${starter})`);
        assert((await page.textContent('.handoff-starts')).trim() === T('es', 'turn.starts').replace('{name}', starter), 'first handoff says who starts');
        await shot('03-handoff');
      } else {
        assert(!(await page.$('.handoff-starts')), '"Empieza" only on the first handoff');
      }
      streak = 0;
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
      const d = diffOf[await qText()];
      const player = (await page.textContent('.q-top-name')).trim();
      if (questions === 0) {
        assert(player === starter, 'the drawn starter plays the first question');
        // The DOM must not tell which option is right.
        const leak = await page.locator('.qcard .option').evaluateAll((bs) => bs.some((b) => b.hasAttribute('data-idx') || Object.keys(b.dataset).length));
        assert(!leak, 'options carry no index/dataset that reveals the answer');
      }
      if (isFinal) {
        assert(!(await page.$('.qcard .lifelines')), 'no lifelines on the final question');
        assert(d === (hasD4 ? 4 : 3), `final question on Difícil is difficulty 4, or the nearest available (got ${d})`);
      } else {
        assert(d >= 2, `Difícil draws difficulty 2-4 (got ${d})`);
        assert(await page.$('.qcard .lifelines'), 'lifeline row under the question');
      }
      if (questions === 0) {
        await shot('07-question');
        await page.click('.lifeline-help-btn');
        await page.waitForSelector('.lifeline-help:not([hidden])');
        await shot('07b-lifeline-help');
        await page.click('.lifeline-help-btn');
      }
      if (isFinal) {
        await shot('10-final-question');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      if (questions === 0) {
        // Stormlight (starter): armed before answering, a wrong pick is struck and they choose again.
        await lifelineBtn('stormlight').click();
        await page.waitForSelector('.qcard .lifeline-stormlight.armed');
        await shot('07c-stormlight-armed');
        const right = answers[await qText()];
        const texts = await page.locator('.qcard .option .option-text').allTextContents();
        await page.locator('.qcard .option').nth(texts.findIndex((x) => x.trim() !== right)).click();
        await page.waitForSelector('.qcard .option.struck');
        assert(await page.locator('.qcard .continue').isHidden(), 'Stormlight: no reveal after the first wrong pick');
        assert(!(await page.$('.qcard .option.correct')), 'Stormlight: correct answer not revealed');
        assert(await enabledOptions() === 3, 'Stormlight: 3 options left to choose from');
        assert(await lifelineBtn('stormlight').evaluate((b) => b.classList.contains('used')), 'Stormlight shown as used');
        await shot('07d-stormlight-retry');
        usedLifelines.add('stormlight');
      }
      if (questions === 1) {
        // Breath (other player): the question is swapped for another of the same category and difficulty.
        const before = await qId();
        const beforeD = diffOf[await qText()];
        const beforeCat = await page.textContent('.qcard .cat-pill');
        await lifelineBtn('breath').click();
        await page.waitForFunction((id) => document.querySelector('.qtext')?.id !== id, before);
        assert(diffOf[await qText()] === beforeD, 'Breath keeps the difficulty');
        assert(await page.textContent('.qcard .cat-pill') === beforeCat, 'Breath keeps the category');
        assert(await lifelineBtn('breath').evaluate((b) => b.disabled && b.classList.contains('used')), 'Breath shown as used');
        usedLifelines.add('breath');
        // Atium: two wrong answers removed, two options left.
        await lifelineBtn('atium').click();
        await page.waitForSelector('.qcard .option.eliminated');
        assert(await page.locator('.qcard .option.eliminated').count() === 2, 'Atium removes two options');
        assert(await enabledOptions() === 2, 'Atium leaves 2 options');
        const right = answers[await qText()];
        const left = await page.locator('.qcard .option:not([disabled]) .option-text').allTextContents();
        assert(left.some((x) => x.trim() === right), 'Atium keeps the correct answer');
        await shot('07e-atium');
        usedLifelines.add('atium');
      }
      if (questions === 2) {
        const used = await page.locator('.qcard .lifeline.used').count();
        assert(used === 2 || used === 1, `lifelines stay spent for the rest of the game (used: ${used})`);
      }
      // The starter always misses (Stormlight retry included); the other player always answers right.
      const correct = player !== starter;
      await answer(correct);
      if (correct && !isFinal) {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
        const extra = await page.textContent('.feedback-extra');
        if (streak === 3) {
          assert(extra.includes(T('es', 'classic.streakPass').replace('{n}', '3').replace('{name}', starter)), `3rd correct answer passes the turn (${extra})`);
          streak = 0;
        } else {
          assert(!extra.includes(T('es', 'classic.streakPass').split('{n}')[1].split('{name}')[0].trim()), 'no streak message before the 3rd');
        }
      }
      if (questions === 0) await shot('08-reveal');
      if (questions === 3) {
        // Reload mid-game: the game must be resumable from home.
        await page.reload();
        await page.waitForSelector('.home .menu-continue-classic');
        await shot('11-home-continue');
        await page.click('.home .menu-continue-classic');
        await page.waitForSelector('.handoff');
        resumed = true;
        log('reload → "Continue game" resumes the classic game on the pass-the-phone screen');
      } else {
        await page.click('.qcard .continue');
      }
      questions++;
    }
  }
  await page.waitForSelector('.victory', { timeout: 5000 });
  await page.waitForTimeout(900);
  await shot('12-victory');
  const winnerName = starter === 'Shallan' ? 'Vin' : 'Shallan';
  assert((await page.textContent('.victory-title')).includes(winnerName), `the player who never misses (${winnerName}) wins`);
  assert(usedLifelines.size === 3, 'each lifeline used once');
  assert(resumed, 'game was resumed after a reload');
  assert(maxStreak === 3, `turn passed after 3 correct answers in a row (max streak ${maxStreak})`);
  log(`classic game on Difícil: ${starter} started (random), ${winnerName} won after ${questions} questions (Stormlight retry, Breath swap, Atium 2 options, 3-answer turns)`);
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
  await page.waitForSelector('.quick-intro');
  assert(await page.getAttribute('.level-opt[data-level="hard"]', 'aria-checked') === 'true', 'last level choice remembered');
  await page.click('.level-opt[data-level="easy"]');
  await shot('17a-quick-intro');
  await page.click('.quick-intro .sticky-actions .btn-primary');
  for (let i = 0; ; i++) {
    await page.waitForSelector('.quick .qcard, .quick-result');
    if (await page.$('.quick-result')) break;
    if (i === 0) assert((await page.textContent('.level-badge-text')).trim() === T('es', 'level.easy'), 'quick game shows level');
    assert(diffOf[await qText()] === 1, 'Fácil draws difficulty 1');
    if (i === 2) { // one lifeline in quick mode
      await lifelineBtn('atium').click();
      assert(await enabledOptions() === 2, 'Atium in quick game');
    }
    if (i === 3) assert(await lifelineBtn('atium').evaluate((b) => b.disabled), 'quick game: one Atium per game');
    await answer(i % 4 !== 3);
    if (i === 1) await shot('17-quick-question');
    await page.click('.qcard .continue');
    assert(i < 20, 'quick game ends');
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await shot('18-quick-result');
  const scoreText = await page.textContent('.result-score');
  assert(/\d/.test(scoreText), 'quick score shown');
  log(`quick game on Fácil finished: ${scoreText.trim()}`);
  await page.click('.quick-result .btn-ghost');

  // ---------------------------------------------------------------- practice
  await page.click('.menu-btn >> nth=2');
  await page.waitForSelector('.practice-setup');
  await page.click('.chips-cat .chip >> nth=1');
  assert(await page.locator('.chips-diff .chip').count() === 5, 'practice offers any + 4 difficulties');
  await page.click('.chips-diff .chip >> nth=4'); // Experto
  if (!hasD4) {
    await page.waitForSelector('.practice-note:not([hidden])');
    assert((await page.textContent('.practice-note')).includes(T('es', 'difficulty.4')), 'fallback message names Experto');
  }
  assert(await page.isEnabled('.practice-setup .sticky-actions .btn-primary'), 'practice can start (with fallback)');
  await shot('19-practice-setup');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  assert(diffOf[await qText()] === (hasD4 ? 4 : 3), 'practice difficulty 4 (or nearest available)');
  assert(!(await page.$('.qcard .lifelines')), 'no lifelines in practice');
  assert(await page.locator('.qcard .pips i').count() === 4, 'difficulty pips show 4 levels');
  await answer(false);
  await shot('20-practice-question');
  assert(await page.$('.explain'), 'practice shows explanation');
  await page.click('.qcard .continue');
  await page.waitForSelector('.practice .qcard');
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.practice-setup');
  await page.click('.topbar .icon-btn');
  log(`practice difficulty 4 (${hasD4 ? 'expert questions' : 'no expert data yet: fallback message + nearest difficulty'})`);

  // ---------------------------------------------------------------- stats & about
  await page.click('.small-btn >> nth=0');
  await page.waitForSelector('.stats .bar-row');
  const llUses = (await page.locator('.lifeline-stats-value').allTextContents()).map(Number);
  // 2.0.0 (lead decision 2): the 2-player classic game is a group game, so only the quick game's Atium counts.
  assert(llUses.length === 3 && llUses[0] === 1 && llUses[1] === 0 && llUses[2] === 0, `lifeline uses counted: quick only, not the group game (${llUses})`);
  const tiles = await page.locator('.stats .tile .tile-value').allTextContents();
  assert(tiles[0] === '0' && tiles[1] === '1', `classic solo wins 0, group games 1 (${tiles})`);
  await shot('21-stats');
  await page.click('.topbar .icon-btn');
  await page.click('.small-btn >> nth=2');
  await page.waitForSelector('.about .disclaimer');
  assert(await page.locator('.about-lifelines li').count() === 3, 'about explains the 3 lifelines');
  await shot('22-about');
  await page.locator('#about-lifelines').scrollIntoViewIfNeeded();
  await shot('22b-about-lifelines');
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

  // ---------------------------------------------------------------- v1 save migration
  const anyQ = pool.find((q) => q.d <= 3);
  await page.evaluate((q) => {
    localStorage.setItem('cosmere-trivia:classic', JSON.stringify({
      v: 1, players: [{ name: 'Kelsier', color: 'scadrial', charges: { scadrial: 1 } }], current: 0, phase: 'question', timer: false,
      categories: ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere'], used: {}, pending: { id: q.id, cat: q.c, order: [0, 1, 2, 3], final: false },
      asked: 3, winner: null, startedAt: Date.now(),
    }));
  }, anyQ);
  await page.reload();
  await page.waitForSelector('.home .menu-continue-classic');
  await page.click('.home .menu-continue-classic');
  await page.waitForSelector('.question .qcard');
  assert((await page.textContent('.level-badge-text')).trim() === T('es', 'level.normal'), 'v1 save migrates to Normal');
  assert(await page.locator('.qcard .lifeline:not([disabled])').count() === 3, 'v1 save gets lifelines');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('cosmere-trivia:classic')).v) === 4, 'save upgraded to v4');
  await page.evaluate(() => localStorage.removeItem('cosmere-trivia:classic'));
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.home');
  log('v1 saved game migrated to v4 (level Normal, full lifelines)');

  // ---------------------------------------------------------------- offline
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.home');
  await page.click('.menu-btn:has-text("' + T('es', 'home.practice') + '")');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  log('works offline after first load (service worker)');

  // ---------------------------------------------------------------- daily challenge (still offline), achievements, collection
  await page.click('.topbar .icon-btn'); // practice → practice setup
  await page.waitForSelector('.practice-setup');
  await page.click('.topbar .icon-btn');
  await page.click('.home .menu-daily');
  await page.waitForSelector('.daily-intro');
  await shot('26-daily-intro');
  await page.click('.daily-start');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.daily .qcard .timer');
    const qd = diffOf[(await page.textContent('.qtext')).trim()];
    assert(qd >= 1 && qd <= 3, `daily questions are difficulty 1–3 (got ${qd})`);
    await answer(i !== 3);
    if (i === 0) await shot('27-daily-question');
    await page.click('.qcard .continue');
  }
  await page.waitForSelector('.daily-result');
  assert((await page.textContent('.daily-result .result-score')).trim() === T('es', 'daily.result').replace('{n}', '4').replace('{total}', '5'), 'daily result 4/5');
  assert(/^✅✅✅❌✅ 4\/5$/mu.test(await page.textContent('.daily-share-preview')), 'share preview: ✅/❌ per question (beta 4)');
  await shot('28-daily-result');
  await context.setOffline(false);
  await page.click('.daily-result .stack-actions:last-child .btn-ghost');
  await page.waitForSelector('.home .menu-daily.daily-done');
  await page.click('.small-btn >> nth=0');
  await page.waitForSelector('.stats .collection .col-total');
  const discovered = Number((await page.textContent('.col-total strong')).match(/^\d+/)[0]);
  assert(discovered >= 20, `collection counts discovered questions (${discovered})`);
  await shot('29-stats-collection');
  await page.click('.stats-ach');
  await page.waitForSelector('.achievements .ach-card');
  const unlocked = await page.locator('.ach-card.unlocked').count();
  assert(unlocked >= 3 && await page.locator('.ach-card[data-ach="dailyFirst"].unlocked').count() === 1, `achievements unlocked by this run (${unlocked})`);
  await shot('30-achievements');
  await page.click('.topbar .icon-btn'); // → stats
  await page.waitForSelector('.stats');
  await page.click('.topbar .icon-btn');
  await page.waitForSelector('.home');
  await page.click('.home .menu-btn:has-text("' + T('es', 'home.practice') + '")');
  await page.click('.practice-setup .sticky-actions .btn-primary');
  await page.waitForSelector('.practice .qcard');
  log(`daily challenge offline (4/5, share text), collection (${discovered} discovered), ${unlocked} achievements`);

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
