// Startup error screen with a "clear data and restart" action.
// Self-contained on purpose (no other app module): it must work when those fail to load.
// Strings come from i18n/<lang>.json ("boot" section); the copy below is used when even
// that file cannot be fetched.
const PREFIX = 'cosmere-trivia:';
const LANGS = ['es', 'en', 'fr', 'de', 'it'];
const ALIASES = { ca: 'es', gl: 'es', eu: 'es' };

const FALLBACK = {
  es: {
    title: 'Algo ha fallado',
    body: 'La app no ha podido arrancar. Puede que los datos guardados estén dañados: borrarlos suele arreglarlo (se perderán la partida en curso, los ajustes y las estadísticas).',
    reset: 'Borrar datos y reiniciar',
    retry: 'Reintentar',
  },
  en: {
    title: 'Something went wrong',
    body: 'The app couldn’t start. The saved data may be damaged: clearing it usually fixes this (you’ll lose the game in progress, your settings and stats).',
    reset: 'Clear data and restart',
    retry: 'Try again',
  },
  fr: {
    title: 'Un problème est survenu',
    body: 'L’application n’a pas pu démarrer. Les données enregistrées sont peut-être endommagées : les effacer règle généralement le problème (la partie en cours, les réglages et les statistiques seront perdus).',
    reset: 'Effacer les données et redémarrer',
    retry: 'Réessayer',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Die App konnte nicht starten. Möglicherweise sind die gespeicherten Daten beschädigt; sie zu löschen behebt das meistens (das laufende Spiel, die Einstellungen und die Statistik gehen verloren).',
    reset: 'Daten löschen und neu starten',
    retry: 'Erneut versuchen',
  },
  it: {
    title: 'Qualcosa è andato storto',
    body: 'L’app non è riuscita ad avviarsi. I dati salvati potrebbero essere danneggiati: cancellarli di solito risolve il problema (perderai la partita in corso, le impostazioni e le statistiche).',
    reset: 'Cancella i dati e riavvia',
    retry: 'Riprova',
  },
};

function matchLang(tag) {
  const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
  return LANGS.includes(base) ? base : (ALIASES[base] || null);
}

/** The saved language if it is valid, else the device language, else English. */
function pickLang() {
  try {
    const s = JSON.parse(localStorage.getItem(`${PREFIX}settings`));
    if (s && LANGS.includes(s.lang)) return s.lang;
  } catch { /* corrupt or unavailable: use the device language */ }
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const m = matchLang(l);
      if (m) return m;
    }
  } catch { /* ignore */ }
  return 'en';
}

async function strings(lang) {
  const base = FALLBACK[lang] || FALLBACK.en;
  try {
    const res = await fetch(`i18n/${lang}.json`);
    const boot = res.ok ? (await res.json()).boot : null;
    if (boot && typeof boot === 'object') {
      return Object.fromEntries(Object.keys(base).map((k) => [k, typeof boot[k] === 'string' ? boot[k] : base[k]]));
    }
  } catch { /* offline or broken file: built-in copy */ }
  return base;
}

/** Removes everything this app stores on the device: its localStorage keys and its caches. */
export async function clearAppData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  try {
    if (self.caches) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('cosmere-trivia-')).map((n) => caches.delete(n)));
    }
  } catch { /* ignore */ }
}

let shown = false;

export async function showBootError(err) {
  console.error('Startup failed:', err);
  if (shown) return;
  shown = true;
  const lang = pickLang();
  const s = await strings(lang);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => (k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v)));
    kids.forEach((k) => n.append(k));
    return n;
  };
  const reset = el('button', {
    type: 'button', class: 'btn btn-danger btn-block boot-reset',
    onclick: async () => { reset.disabled = true; await clearAppData(); location.reload(); },
  }, s.reset);
  const retry = el('button', { type: 'button', class: 'btn btn-ghost btn-block boot-retry', onclick: () => location.reload() }, s.retry);
  const main = el('main', { class: 'screen boot-error', role: 'alert' },
    el('div', { class: 'boot-error-body' },
      el('div', { class: 'boot-gem boot-gem-broken', 'aria-hidden': 'true' }),
      el('h1', { class: 'boot-error-title' }, s.title),
      el('p', { class: 'lead' }, s.body)),
    el('div', { class: 'stack-actions' }, reset, retry));
  document.documentElement.lang = lang;
  document.body.classList.remove('booting');
  const root = document.getElementById('app') || document.body;
  root.replaceChildren(main);
  reset.focus();
}
