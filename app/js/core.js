// Shared app state, router and small UI building blocks used by every screen.
import { h, svg } from './dom.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import * as store from './storage.js';
import { CATEGORIES, CAT_COLORS, CAT_INK, DIFFICULTIES, LANGS, LEVEL_IDS, LIFELINES, DEFAULT_LEVEL, RECENT_MAX, levelOrDefault } from './config.js';
import { Pool } from './data.js';
import { setFxPrefs, fx } from './fx.js';

// ---------- settings & stats ----------
// onbStep: the first-run introduction step being shown (0–2), so a reload there resumes it; null otherwise.
const DEFAULT_SETTINGS = { lang: null, theme: 'dark', sound: true, vibration: true, timer: true, disabledWorks: [], level: DEFAULT_LEVEL, onboarded: false, onbStep: null };

export const app = {
  settings: { ...DEFAULT_SETTINGS },
  questions: [],
  loadError: null,
  sessionUsed: {}, // used ids for quick/practice in this session (memory only)
};

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** Keeps only the stored settings that have the right type; anything else gets its default. */
export function sanitizeSettings(s) {
  const out = { ...DEFAULT_SETTINGS, disabledWorks: [] };
  if (!isObj(s)) return out;
  if (LANGS.includes(s.lang)) out.lang = s.lang;
  if (s.theme === 'light' || s.theme === 'dark') out.theme = s.theme;
  for (const k of ['sound', 'vibration', 'timer', 'onboarded']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (Array.isArray(s.disabledWorks)) out.disabledWorks = [...new Set(s.disabledWorks.filter((w) => typeof w === 'string'))];
  out.level = levelOrDefault(s.level);
  if (Number.isInteger(s.onbStep) && s.onbStep >= 0 && s.onbStep <= 2) out.onbStep = s.onbStep;
  return out;
}

/**
 * The first-run introduction is due: the (sanitized) settings don't say it was seen. Missing,
 * corrupt or null settings therefore show it, and so does a reload in the middle of it.
 */
export function needsOnboarding() { return app.settings.onboarded !== true; }

export function loadSettings() {
  app.settings = sanitizeSettings(store.load('settings', null));
  applySettings();
}

export function updateSettings(patch) {
  Object.assign(app.settings, patch);
  store.save('settings', app.settings);
  applySettings();
}

function applySettings() {
  const theme = app.settings.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eef2fa' : '#0a0f1f');
  setFxPrefs({ sound: !!app.settings.sound, vibration: !!app.settings.vibration });
}

const emptyStats = () => ({
  classicGames: 0, quickGames: 0, bestQuick: 0,
  cats: Object.fromEntries(CATEGORIES.map((c) => [c, { a: 0, c: 0 }])),
  lifelines: Object.fromEntries(LIFELINES.map((k) => [k, 0])),
});

/** Stored stats with every field checked: odd values (wrong type, negative) count as 0. */
export function getStats() {
  const s = store.load('stats', null);
  const base = emptyStats();
  if (!isObj(s)) return base;
  for (const k of ['classicGames', 'quickGames', 'bestQuick']) base[k] = count(s[k]);
  if (isObj(s.cats)) {
    for (const c of CATEGORIES) {
      const v = s.cats[c];
      if (!isObj(v)) continue;
      const a = count(v.a);
      base.cats[c] = { a, c: Math.min(count(v.c), a) };
    }
  }
  if (isObj(s.lifelines)) for (const k of LIFELINES) base.lifelines[k] = count(s.lifelines[k]);
  return base;
}

export function updateStats(fn) {
  const s = getStats();
  fn(s);
  store.save('stats', s);
  return s;
}

export function recordAnswer(cat, correct) {
  updateStats((s) => {
    const c = (s.cats[cat] ||= { a: 0, c: 0 });
    c.a++;
    if (correct) c.c++;
  });
}

export function recordLifeline(kind) {
  updateStats((s) => { s.lifelines[kind] = (s.lifelines[kind] || 0) + 1; });
}

// ---------- recently seen questions (across games and sessions) ----------
// A ring buffer of the last RECENT_MAX question ids per language (`recent` key), so every draw
// (quick, practice, classic) prefers questions not seen lately, then the least recently seen.
const recentLang = () => app.questionsLang || app.questions?.lang || 'en';
function loadRecent() {
  const r = store.load('recent', null);
  const list = isObj(r) && Array.isArray(r[recentLang()]) ? r[recentLang()] : [];
  return [...new Set(list.filter((id) => typeof id === 'string'))].slice(-RECENT_MAX);
}
/** Remembers that question `id` was shown (most recent last). */
export function noteSeen(id) {
  const r = store.load('recent', null);
  const all = isObj(r) ? r : {};
  const list = loadRecent().filter((x) => x !== id);
  list.push(id);
  all[recentLang()] = list.slice(-RECENT_MAX);
  store.save('recent', all);
}
/** Recency tracker for a Pool: rank(id) is -1 when not seen lately, higher = seen more recently. */
function recentTracker() {
  const list = loadRecent();
  const rank = new Map(list.map((id, i) => [id, i]));
  let top = list.length;
  return {
    rank: (id) => (rank.has(id) ? rank.get(id) : -1),
    add: (id) => { rank.set(id, top++); noteSeen(id); },
  };
}

/** A pool over the loaded questions respecting the spoiler filter. */
export function makePool(used = app.sessionUsed) {
  return new Pool(app.questions, app.settings.disabledWorks, used, recentTracker());
}

/** True when the spoiler filter leaves no question at all. */
export function filterIsEmpty() {
  return app.questions.length > 0 && new Pool(app.questions, app.settings.disabledWorks).size() === 0;
}

/** Warning shown when the spoiler filter leaves no question, with a button to Settings. */
export function noQuestionsBanner(extraClass = '') {
  return h('section', { class: `card empty-filter ${extraClass}`, role: 'status' },
    h('p', { class: 'banner banner-warn' }, t('errors.emptyFilter')),
    h('button', { type: 'button', class: 'btn btn-ghost btn-block empty-filter-settings', onclick: () => go('settings') }, svg(ICONS.settings), t('common.openSettings')));
}

// ---------- router ----------
const screens = {};
let current = null;
let cleanups = [];
let backHandler = null;
let inHistory = false;
let ignorePop = false;
let renderFailures = 0;
let fatalHandler = null;
/** Called when even Home cannot render after startup (app.js shows the error screen). */
export function setFatalHandler(fn) { fatalHandler = fn; }

export function register(name, render) { screens[name] = render; }
export function onCleanup(fn) { cleanups.push(fn); }
/** Handler for the system back button on the current screen (defaults to going home). */
export function setBack(fn) { backHandler = fn; }
export function currentScreen() { return current; }

export function go(name, params = {}) {
  for (const fn of cleanups) { try { fn(); } catch (e) { console.error(e); } }
  cleanups = [];
  backHandler = null;
  closeModal();
  const root = document.getElementById('app');
  let el;
  try {
    el = screens[name](params);
  } catch (e) {
    // A screen that cannot render (odd state) must not brick the app: go home, or report it.
    if (name !== 'home' && renderFailures++ < 3) {
      console.warn(`screen "${name}" failed`, e);
      go('home');
      return;
    }
    if (fatalHandler && current) { fatalHandler(e); return; }
    throw e;
  }
  renderFailures = 0;
  el.classList.add('screen-enter');
  root.replaceChildren(el);
  current = { name, params };
  window.scrollTo(0, 0);
  const focusTarget = el.querySelector('[data-autofocus]') || el.querySelector('h1');
  if (focusTarget) {
    if (!focusTarget.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT)$/.test(focusTarget.tagName)) {
      focusTarget.setAttribute('tabindex', '-1');
    }
    focusTarget.focus({ preventScroll: true });
  }
  if (name === 'home') {
    if (inHistory) { inHistory = false; ignorePop = true; history.back(); }
  } else if (!inHistory) {
    try { history.pushState({ app: 1 }, ''); inHistory = true; } catch { /* ignore */ }
  }
}

export function rerender() { if (current) go(current.name, current.params); }

window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  inHistory = false;
  if (modalEl) { closeModal(false); history.pushState({ app: 1 }, ''); inHistory = true; return; }
  const fn = backHandler;
  if (fn) {
    // Re-arm the history entry first: if the handler stays on this screen (e.g. the player
    // cancels a "quit?" dialog), the next Back must reach the app again instead of closing it.
    try { history.pushState({ app: 1 }, ''); inHistory = true; } catch { /* ignore */ }
    fn();
  } else go('home');
});

// ---------- UI building blocks ----------
export function iconButton(icon, label, onclick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onclick }, svg(ICONS[icon]));
}

/** Standard top bar: back/home button, title, optional right-side node. */
export function topBar(title, { back = () => go('home'), backIcon = 'back', backLabel = t('common.back'), right = null } = {}) {
  return h('header', { class: 'topbar' }, h('div', { class: 'topbar-row' },
    back ? iconButton(backIcon, backLabel, back, 'topbar-back') : h('span', { class: 'topbar-spacer topbar-back' }),
    title ? h('h1', { class: 'topbar-title' }, title) : h('span', { class: 'topbar-title' }),
    right ? h('div', { class: 'topbar-right' }, right) : h('span', { class: 'topbar-spacer topbar-right' }),
  ));
}

export function screen(cls, ...children) {
  return h('main', { class: `screen ${cls || ''}` }, ...children);
}

export function catStyle(cat) {
  return { '--cat': CAT_COLORS[cat], '--cat-ink': CAT_INK[cat] };
}

export function catPill(cat, extra = '') {
  return h('span', { class: `cat-pill ${extra}`, ...catStyle(cat) }, t(`cat.${cat}`));
}

export function diffPips(d) {
  const label = t('difficulty.label', { level: t(`difficulty.${d}`) });
  return h('span', { class: 'pips', role: 'img', 'aria-label': label, title: label },
    DIFFICULTIES.map((i) => h('i', { class: i <= d ? 'on' : '' })));
}

/** Pips lit for a level's meter: 1 (easy) to 4 (expert). */
const levelTop = (l) => LEVEL_IDS.indexOf(l) + 1;

/** Compact badge with the game level (game bar / quick game). */
export function levelBadge(level) {
  const l = levelOrDefault(level);
  const label = t('level.badge', { level: t(`level.${l}`) });
  return h('span', { class: `level-badge level-${l}`, title: label },
    h('span', { class: 'pips', 'aria-hidden': 'true' }, DIFFICULTIES.map((i) => h('i', { class: i <= levelTop(l) ? 'on' : '' }))),
    h('span', { class: 'sr-only' }, label),
    h('span', { class: 'level-badge-text', 'aria-hidden': 'true' }, t(`level.${l}`)));
}

/** Radio group to choose the game level; remembers the choice in settings. */
export function levelPicker(value, onchange) {
  let cur = levelOrDefault(value);
  const id = `lvl-${Math.random().toString(36).slice(2, 8)}`;
  const desc = h('p', { class: 'level-desc muted', id: `${id}-desc`, 'aria-live': 'polite' }, t(`level.${cur}Desc`));
  const buttons = LEVEL_IDS.map((l) => h('button', {
    type: 'button', role: 'radio', class: `level-opt level-${l}`, 'aria-checked': String(l === cur), dataset: { level: l },
    tabindex: l === cur ? '0' : '-1', 'aria-describedby': `${id}-desc`,
    onclick: () => select(l, false),
    onkeydown: (e) => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!k) return;
      e.preventDefault();
      select(LEVEL_IDS[(LEVEL_IDS.indexOf(cur) + k + LEVEL_IDS.length) % LEVEL_IDS.length], true);
    },
  },
  h('span', { class: 'pips', 'aria-hidden': 'true' }, DIFFICULTIES.map((i) => h('i', { class: i <= levelTop(l) ? 'on' : '' }))),
  h('span', { class: 'level-name' }, t(`level.${l}`))));
  function select(l, focus) {
    cur = l;
    buttons.forEach((b) => {
      const on = b.dataset.level === l;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) b.focus();
    });
    desc.textContent = t(`level.${l}Desc`);
    fx.tap();
    updateSettings({ level: l });
    onchange(l);
  }
  return h('section', { class: 'card level-card' },
    h('h2', { class: 'section-title', id }, t('level.title')),
    h('div', { class: 'level-group', role: 'radiogroup', 'aria-labelledby': id }, buttons),
    desc);
}

/** Accessible on/off switch. */
export function toggle(label, checked, onchange, { hint = null, disabled = false } = {}) {
  const id = `sw-${Math.random().toString(36).slice(2, 8)}`;
  const btn = h('button', {
    type: 'button', class: 'switch', role: 'switch', id, 'aria-checked': String(!!checked), disabled,
    'aria-describedby': hint ? `${id}-hint` : null,
    onclick: () => {
      const v = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(v));
      fx.tap();
      onchange(v);
    },
  }, h('span', { class: 'switch-thumb' }));
  return h('div', { class: 'row-setting' },
    h('label', { for: id, class: 'row-label' }, label, hint ? h('small', { id: `${id}-hint` }, hint) : null),
    btn);
}

// Toasts
let toastTimer = null;
export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// Modal confirm dialog
let modalEl = null;
let modalResolve = null;
let modalReturnFocus = null;

function closeModal(result = false) {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  const r = modalResolve;
  modalResolve = null;
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  if (r) r(result);
}

/**
 * Yes/no dialog. Every caller should pass explicit `okLabel` / `cancelLabel` verbs ("Keep playing" /
 * "Quit game") so neither button can be read two ways; `title` is an optional bold question.
 */
export function confirmDialog(message, { title = null, okLabel = t('common.confirm'), cancelLabel = t('common.cancel'), danger = false } = {}) {
  closeModal(false);
  modalReturnFocus = document.activeElement;
  return new Promise((resolve) => {
    modalResolve = resolve;
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => closeModal(true) }, okLabel);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => closeModal(false) }, cancelLabel);
    const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': title ? 'modal-title' : 'modal-msg', 'aria-describedby': title ? 'modal-msg' : null },
      title ? h('h2', { id: 'modal-title', class: 'modal-title' }, title) : null,
      message ? h('p', { id: 'modal-msg' }, message) : null,
      h('div', { class: 'modal-actions' }, cancel, ok));
    modalEl = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === modalEl) closeModal(false); },
      onkeydown: (e) => {
        if (e.key === 'Escape') closeModal(false);
        if (e.key === 'Tab') { // simple focus trap between the two buttons
          const f = [cancel, ok];
          const i = f.indexOf(document.activeElement);
          e.preventDefault();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
      } }, box);
    document.body.appendChild(modalEl);
    cancel.focus();
  });
}
