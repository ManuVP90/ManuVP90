// Shared app state, router and small UI building blocks used by every screen.
import { h, svg } from './dom.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import * as store from './storage.js';
import { CATEGORIES, CAT_COLORS, CAT_INK } from './config.js';
import { Pool } from './data.js';
import { setFxPrefs, fx } from './fx.js';

// ---------- settings & stats ----------
const DEFAULT_SETTINGS = { lang: null, theme: 'dark', sound: true, vibration: true, timer: true, disabledWorks: [] };

export const app = {
  settings: { ...DEFAULT_SETTINGS },
  questions: [],
  loadError: null,
  sessionUsed: {}, // used ids for quick/practice in this session (memory only)
};

export function loadSettings() {
  const s = store.load('settings', {});
  app.settings = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
  if (!Array.isArray(app.settings.disabledWorks)) app.settings.disabledWorks = [];
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
});

export function getStats() {
  const s = store.load('stats', null);
  const base = emptyStats();
  if (!s || typeof s !== 'object') return base;
  return { ...base, ...s, cats: { ...base.cats, ...(s.cats || {}) } };
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

/** A pool over the loaded questions respecting the spoiler filter. */
export function makePool(used = app.sessionUsed) {
  return new Pool(app.questions, app.settings.disabledWorks, used);
}

// ---------- router ----------
const screens = {};
let current = null;
let cleanups = [];
let backHandler = null;
let inHistory = false;
let ignorePop = false;

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
  const el = screens[name](params);
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
  if (fn) fn(); else go('home');
});

// ---------- UI building blocks ----------
export function iconButton(icon, label, onclick, cls = '') {
  return h('button', { type: 'button', class: `icon-btn ${cls}`, 'aria-label': label, title: label, onclick }, svg(ICONS[icon]));
}

/** Standard top bar: back/home button, title, optional right-side node. */
export function topBar(title, { back = () => go('home'), backIcon = 'back', backLabel = t('common.back'), right = null } = {}) {
  return h('header', { class: 'topbar' },
    back ? iconButton(backIcon, backLabel, back) : h('span', { class: 'topbar-spacer' }),
    title ? h('h1', { class: 'topbar-title' }, title) : h('span', { class: 'topbar-title' }),
    right || h('span', { class: 'topbar-spacer' }),
  );
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
    [1, 2, 3].map((i) => h('i', { class: i <= d ? 'on' : '' })));
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

export function confirmDialog(message, { okLabel = t('common.confirm'), cancelLabel = t('common.cancel'), danger = false } = {}) {
  closeModal(false);
  modalReturnFocus = document.activeElement;
  return new Promise((resolve) => {
    modalResolve = resolve;
    const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => closeModal(true) }, okLabel);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => closeModal(false) }, cancelLabel);
    const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-msg' },
      h('p', { id: 'modal-msg' }, message),
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
