// UI string loading and lookup. Strings live in app/i18n/<lang>.json as nested objects;
// look them up with dotted keys: t('home.classic'), t('turn.turnOf', { name }).
import { LANGS, LANG_ALIASES } from './config.js';

let dict = {};
let fallback = {};
let current = 'en';

async function fetchDict(lang) {
  const res = await fetch(`i18n/${lang}.json`);
  if (!res.ok) throw new Error(`i18n ${lang}: HTTP ${res.status}`);
  return res.json();
}

/** Supported UI language for a BCP 47 tag ('ca-ES-valencia' → 'es'), or null. */
export function matchLang(tag) {
  const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
  if (LANGS.includes(base)) return base;
  return LANG_ALIASES[base] || null;
}

/** First supported language among the device languages (English if none). */
export function detectLang() {
  let prefs = [];
  try { prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language]; } catch { /* ignore */ }
  for (const l of prefs) {
    const m = matchLang(l);
    if (m) return m;
  }
  return 'en';
}

export async function setLang(lang) {
  if (!LANGS.includes(lang)) lang = detectLang();
  if (!Object.keys(fallback).length) {
    try { fallback = await fetchDict('en'); } catch (e) { console.warn(e); }
  }
  try {
    dict = lang === 'en' ? fallback : await fetchDict(lang);
  } catch (e) {
    console.warn(e);
    dict = fallback;
  }
  current = lang;
  document.documentElement.lang = lang;
  document.title = t('app.title');
  return lang;
}

export function getLang() { return current; }

function lookup(obj, key) {
  let v = obj;
  for (const part of key.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[part];
  }
  return typeof v === 'string' ? v : undefined;
}

export function t(key, params) {
  let s = lookup(dict, key) ?? lookup(fallback, key) ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}

/** Localized number formatting. */
export function num(n) {
  try { return new Intl.NumberFormat(current).format(n); } catch { return String(n); }
}
