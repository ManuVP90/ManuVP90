// App start (loaded by app.js): settings → strings → questions → screens → service worker.
import { app, loadSettings, updateSettings, register, go, setFatalHandler, needsOnboarding, getStats, checkAchievements } from './core.js';
import { showBootError } from './boot-error.js';
import { setLang, detectLang, getLang } from './i18n.js';
import { loadQuestions } from './data.js';
import { homeScreen } from './screens/home.js';
import { setupScreen, classicScreen, loadSavedGame } from './screens/classic.js';
import { quickScreen, loadSavedResult, loadSavedRun } from './screens/quick.js';
import { practiceSetupScreen, practiceScreen } from './screens/practice.js';
import { statsScreen } from './screens/stats.js';
import { settingsScreen, settingsHooks } from './screens/settings.js';
import { aboutScreen } from './screens/about.js';
import { onboardingScreen } from './screens/onboarding.js';
import { dailyScreen } from './screens/daily.js';
import { achievementsScreen } from './screens/achievements.js';
import { watchRegistration } from './update.js';

register('home', homeScreen);
register('classic-setup', setupScreen);
register('classic', classicScreen);
register('quick', quickScreen);
register('practice-setup', practiceSetupScreen);
register('practice', practiceScreen);
register('stats', statsScreen);
register('settings', settingsScreen);
register('about', aboutScreen);
register('onboarding', onboardingScreen);
register('daily', dailyScreen);
register('achievements', achievementsScreen);

async function useLanguage(lang) {
  await setLang(lang);
  try {
    app.questions = await loadQuestions(getLang());
    app.questionsLang = app.questions.lang || getLang();
    app.loadError = null;
  } catch (e) {
    console.warn(e);
    app.questions = [];
    app.loadError = e;
  }
  cacheForOffline(getLang());
}

settingsHooks.changeLanguage = async (lang) => {
  updateSettings({ lang });
  await useLanguage(lang);
};
settingsHooks.afterReset = async () => {
  loadSettings();
  app.sessionUsed = {};
  await useLanguage(detectLang());
};

// Ask the service worker to keep the active language's question file for offline use
// (SPEC: only the active language is downloaded).
function cacheForOffline(lang) {
  if (!('serviceWorker' in navigator)) return;
  const urls = [`data/questions.${lang}.json`, `i18n/${lang}.json`];
  if (app.questionsLang && app.questionsLang !== lang) urls.push(`data/questions.${app.questionsLang}.json`);
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: 'cache-urls', urls });
  }).catch(() => {});
}

/** Someone has already played here (stats or a saved game): not a first run, whatever the settings say. */
function hasPlayed() {
  const s = getStats();
  const answered = Object.values(s.cats).reduce((n, c) => n + c.a, 0);
  return s.classicGames + s.quickGames + s.bestQuick + answered > 0 || !!loadSavedGame() || !!loadSavedRun();
}

export async function main() {
  setFatalHandler(showBootError);
  loadSettings();
  await useLanguage(app.settings.lang || detectLang());
  // The introduction is due while the sanitized settings don't say it was seen (so missing,
  // corrupt or null settings show it). Players with stats or saved games just get the flag.
  let onboard = needsOnboarding();
  if (onboard && app.settings.onbStep === null && hasPlayed()) { updateSettings({ onboarded: true }); onboard = false; }
  // Achievements already earned by progress from before 1.6.0 (or elsewhere) unlock quietly.
  checkAchievements({ silent: true });
  document.body.classList.remove('booting');
  go('home');
  // Home stays underneath, so Back from these screens lands there.
  if (onboard) go('onboarding', { step: app.settings.onbStep ?? 0 });
  else if (loadSavedResult()) go('quick', { results: true }); // reloaded on the quick-game results

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(watchRegistration).catch((e) => console.warn('SW registration failed', e));
  }
}
