// App start (loaded by app.js): settings → strings → questions → screens → service worker.
import { app, loadSettings, updateSettings, register, go, setFatalHandler } from './core.js';
import { showBootError } from './boot-error.js';
import { setLang, detectLang, getLang } from './i18n.js';
import { loadQuestions } from './data.js';
import { homeScreen } from './screens/home.js';
import { setupScreen, classicScreen } from './screens/classic.js';
import { quickScreen } from './screens/quick.js';
import { practiceSetupScreen, practiceScreen } from './screens/practice.js';
import { statsScreen } from './screens/stats.js';
import { settingsScreen, settingsHooks } from './screens/settings.js';
import { aboutScreen } from './screens/about.js';

register('home', homeScreen);
register('classic-setup', setupScreen);
register('classic', classicScreen);
register('quick', quickScreen);
register('practice-setup', practiceSetupScreen);
register('practice', practiceScreen);
register('stats', statsScreen);
register('settings', settingsScreen);
register('about', aboutScreen);

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

export async function main() {
  setFatalHandler(showBootError);
  loadSettings();
  await useLanguage(app.settings.lang || detectLang());
  document.body.classList.remove('booting');
  go('home');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}
