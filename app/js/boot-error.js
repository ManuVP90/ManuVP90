// Startup error screen: "Try again" (focused, harmless) and "Clear data and restart", which asks
// for a one-step confirmation and only removes this app's localStorage keys. The service-worker
// caches are kept, so the app still starts (and the reset works) offline.
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
    confirm: '¿Borrar los datos de la app? Se perderán la partida en curso, los ajustes y las estadísticas.',
    confirmYes: 'Sí, borrar y reiniciar',
    cancel: 'No borrar',
  },
  en: {
    title: 'Something went wrong',
    body: 'The app couldn’t start. The saved data may be damaged: clearing it usually fixes this (you’ll lose the game in progress, your settings and stats).',
    reset: 'Clear data and restart',
    retry: 'Try again',
    confirm: 'Clear the app’s data? You’ll lose the game in progress, your settings and stats.',
    confirmYes: 'Yes, clear and restart',
    cancel: 'Keep my data',
  },
  fr: {
    title: 'Un problème est survenu',
    body: 'L’application n’a pas pu démarrer. Les données enregistrées sont peut-être endommagées : les effacer règle généralement le problème (la partie en cours, les réglages et les statistiques seront perdus).',
    reset: 'Effacer les données et redémarrer',
    retry: 'Réessayer',
    confirm: 'Effacer les données de l’application ? La partie en cours, les réglages et les statistiques seront perdus.',
    confirmYes: 'Oui, effacer et redémarrer',
    cancel: 'Ne rien effacer',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Die App konnte nicht starten. Möglicherweise sind die gespeicherten Daten beschädigt; sie zu löschen behebt das meistens (das laufende Spiel, die Einstellungen und die Statistik gehen verloren).',
    reset: 'Daten löschen und neu starten',
    retry: 'Erneut versuchen',
    confirm: 'App-Daten löschen? Das laufende Spiel, die Einstellungen und die Statistik gehen verloren.',
    confirmYes: 'Ja, löschen und neu starten',
    cancel: 'Nicht löschen',
  },
  it: {
    title: 'Qualcosa è andato storto',
    body: 'L’app non è riuscita ad avviarsi. I dati salvati potrebbero essere danneggiati: cancellarli di solito risolve il problema (perderai la partita in corso, le impostazioni e le statistiche).',
    reset: 'Cancella i dati e riavvia',
    retry: 'Riprova',
    confirm: 'Cancellare i dati dell’app? Perderai la partita in corso, le impostazioni e le statistiche.',
    confirmYes: 'Sì, cancella e riavvia',
    cancel: 'Non cancellare',
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

/**
 * Removes this app's saved data (its `cosmere-trivia:` localStorage keys). The offline caches are
 * left alone on purpose: deleting them would leave an offline device with no app at all.
 */
export function clearAppData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
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
  const retry = el('button', { type: 'button', class: 'btn btn-primary btn-block boot-retry', onclick: () => location.reload() }, s.retry);
  const reset = el('button', { type: 'button', class: 'btn btn-ghost btn-block boot-reset', onclick: () => ask(true) }, s.reset);
  // One-step confirmation before anything is deleted.
  const yes = el('button', {
    type: 'button', class: 'btn btn-danger btn-block boot-reset-yes',
    onclick: () => { yes.disabled = true; clearAppData(); location.reload(); },
  }, s.confirmYes);
  const no = el('button', { type: 'button', class: 'btn btn-ghost btn-block boot-reset-no', onclick: () => ask(false) }, s.cancel);
  const confirmBox = el('div', { class: 'boot-confirm', role: 'alertdialog', 'aria-labelledby': 'boot-confirm-msg' },
    el('p', { id: 'boot-confirm-msg', class: 'boot-confirm-msg' }, s.confirm), yes, no);
  const actions = el('div', { class: 'stack-actions' }, retry, reset);
  function ask(open) {
    confirmBox.hidden = !open;
    actions.hidden = open;
    (open ? no : reset).focus();
  }
  confirmBox.hidden = true;
  const main = el('main', { class: 'screen boot-error', role: 'alert' },
    el('div', { class: 'boot-error-body' },
      el('div', { class: 'boot-gem boot-gem-broken', 'aria-hidden': 'true' }),
      el('h1', { class: 'boot-error-title' }, s.title),
      el('p', { class: 'lead' }, s.body)),
    actions,
    confirmBox);
  document.documentElement.lang = lang;
  document.body.classList.remove('booting');
  const root = document.getElementById('app') || document.body;
  root.replaceChildren(main);
  retry.focus(); // the harmless choice first
}
