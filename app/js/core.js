// Shared app state, router and small UI building blocks used by every screen.
import { h, svg } from './dom.js';
import { ICONS, gemSvg } from './icons.js';
import { t } from './i18n.js';
import * as store from './storage.js';
import { CATEGORIES, CAT_COLORS, CAT_INK, DIFFICULTIES, LANGS, LEVEL_IDS, LIFELINES, DEFAULT_LEVEL, RECENT_MAX, MISSED_MAX, SEEN_MAX, QUICK_MAX_SCORE, levelOrDefault } from './config.js';
import { ACHIEVEMENTS, sanitizeAchievements, newlyEarned } from './achievements.js';
import { sanitizeDaily } from './daily.js';
import { addId, removeId, cleanIds, cleanIdMap } from './progress.js';
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
  // classicGames: solo classic games won. groupGames (2.0.0): classic games of 2+ players finished;
  // they feed nothing else (lead decision 2: group play isn't the device owner's progress).
  classicGames: 0, groupGames: 0, quickGames: 0, bestQuick: 0,
  // Quick-game best score per level (1.5.0). `bestQuick` stays the best of all (older saves only have it).
  bestByLevel: Object.fromEntries(LEVEL_IDS.map((l) => [l, 0])),
  cats: Object.fromEntries(CATEGORIES.map((c) => [c, { a: 0, c: 0 }])),
  lifelines: Object.fromEntries(LIFELINES.map((k) => [k, 0])),
});

/** Stats with every field checked: odd values (wrong type, negative) count as 0. */
export function sanitizeStats(s) {
  const base = emptyStats();
  if (!isObj(s)) return base;
  for (const k of ['classicGames', 'groupGames', 'quickGames', 'bestQuick']) base[k] = count(s[k]);
  if (isObj(s.bestByLevel)) for (const l of LEVEL_IDS) base.bestByLevel[l] = count(s.bestByLevel[l]);
  // No record above the best possible score (edited storage, a tampered import): clamped to it.
  const score = (n) => Math.min(n, QUICK_MAX_SCORE);
  base.bestQuick = score(base.bestQuick);
  for (const l of LEVEL_IDS) base.bestByLevel[l] = score(base.bestByLevel[l]);
  // The overall record is never below a level's record.
  base.bestQuick = Math.max(base.bestQuick, ...Object.values(base.bestByLevel));
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

/** Stored stats, sanitized. */
export function getStats() { return sanitizeStats(store.load('stats', null)); }

export function updateStats(fn) {
  const s = getStats();
  fn(s);
  store.save('stats', s);
  checkAchievements(); // records, wins, answers and lifelines can unlock achievements
  return s;
}

export function recordAnswer(cat, correct) {
  noteLangPlayed();
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
  noteDiscovered(id);
}

// ---------- discovered questions (collection progress) ----------
// Per language (`seen` key, { es: [...] }): every question id ever shown, capped at SEEN_MAX.
// The recently-seen ring (kept since 1.4.0) is merged in, so players from before 1.6.0 keep theirs.
function noteDiscovered(id) {
  const all = loadIdMap('seen');
  const list = cleanIds(all[recentLang()], SEEN_MAX);
  if (list.includes(id)) return;
  all[recentLang()] = addId(list, id, SEEN_MAX);
  store.save('seen', all);
}
/** Ids of the questions discovered in the active question language. */
export function getDiscovered() {
  return new Set([...cleanIds(loadIdMap('seen')[recentLang()], SEEN_MAX), ...loadRecent()]);
}
/**
 * Collection progress over `questions` minus the works in `disabledWorks`: how many were discovered,
 * overall, per world and per difficulty. Ids that no longer exist in the data don't count.
 */
export function collection(disabledWorks = app.settings.disabledWorks, questions = app.questions, seen = getDiscovered()) {
  const off = new Set(disabledWorks || []);
  const worlds = Object.fromEntries(CATEGORIES.map((c) => [c, { cat: c, seen: 0, total: 0 }]));
  const diffs = Object.fromEntries(DIFFICULTIES.map((d) => [d, { d, seen: 0, total: 0 }]));
  let total = 0;
  let found = 0;
  for (const q of questions) {
    if (off.has(q.w) || !worlds[q.c]) continue;
    const hit = seen.has(q.id) ? 1 : 0;
    total++; found += hit;
    worlds[q.c].total++; worlds[q.c].seen += hit;
    if (diffs[q.d]) { diffs[q.d].total++; diffs[q.d].seen += hit; }
  }
  return { seen: found, total, worlds: Object.values(worlds), diffs: Object.values(diffs) };
}
// ---------- missed questions ("Review mistakes", practice "My mistakes") ----------
// Per language (`missed` key): ids answered wrong in any mode, most recent last, capped at MISSED_MAX.
// A question leaves the list when it is answered right in practice.
function loadIdMap(key) { const m = store.load(key, null); return isObj(m) ? m : {}; }
/** Missed question ids in the active question language (most recent last). */
export function getMissed() { return cleanIds(loadIdMap('missed')[recentLang()], MISSED_MAX); }
export function noteMissed(id) {
  const all = loadIdMap('missed');
  all[recentLang()] = addId(all[recentLang()], id, MISSED_MAX);
  store.save('missed', all);
}
export function clearMissed(id) {
  const all = loadIdMap('missed');
  const list = removeId(all[recentLang()], id);
  if (list.length) all[recentLang()] = list; else delete all[recentLang()];
  store.save('missed', all);
}

// ---------- daily challenge state ----------
const dailyHelpers = { isPermutation: (a, n) => Array.isArray(a) && a.length === n && [...Array(n).keys()].every((i) => a.includes(i)),
  isValidClock: (c) => c === undefined || c === null || (isObj(c) && Number.isInteger(c.remaining) && c.remaining >= 0 && c.remaining <= 30000
    && (c.savedAt === null || c.savedAt === undefined || (Number.isFinite(c.savedAt) && c.savedAt >= 0))) };
/** The stored daily-challenge state, sanitized (an invalid run is dropped). */
export function getDaily() { return sanitizeDaily(store.load('daily', null), dailyHelpers); }
/** Saves the daily state; `check: false` for in-progress saves (the timer writes about once a second). */
export function saveDaily(d, { check = true } = {}) { store.save('daily', d); if (check) checkAchievements(); }

// ---------- achievements ----------
export function getAchievements() { return sanitizeAchievements(store.load('achievements', null)); }
/**
 * What the achievement rules look at. Collection-based ones count every question of the language
 * (no filter); `filtered` (the collection under the spoiler filter) only says what is unreachable.
 */
export function achievementContext() {
  return { stats: getStats(), collection: collection([]), filtered: collection(), daily: getDaily(), langs: getAchievements().langs };
}
/** Remembers that a question was answered in the active question language (for "play in 3 languages"). */
function noteLangPlayed() {
  const lang = recentLang();
  const a = getAchievements();
  if (!LANGS.includes(lang) || a.langs.includes(lang)) return;
  a.langs.push(lang);
  store.save('achievements', a);
}
/** Unlocks achievement `id` (once) and announces it. */
export function unlockAchievement(id, { silent = false } = {}) {
  const a = getAchievements();
  if (a.unlocked[id] || !ACHIEVEMENTS.some((x) => x.id === id)) return false;
  a.unlocked[id] = Date.now();
  store.save('achievements', a);
  if (!silent) announce(id);
  return true;
}
/** Unlocks every achievement whose rule the current progress meets; returns the new ids. */
export function checkAchievements({ silent = false } = {}) {
  if (!app.questions) return [];
  let ids = [];
  try { ids = newlyEarned(getAchievements(), achievementContext()); } catch (e) { console.warn(e); }
  for (const id of ids) unlockAchievement(id, { silent });
  return ids;
}

// Unlock notices: queued, one at a time, never while a question is unanswered (they wait for it).
const achQueue = [];
let achEl = null;
let achTimer = null;
function announce(id) {
  achQueue.push(id);
  whenIdle(nextAnnouncement);
}
function nextAnnouncement() {
  if (achEl || !achQueue.length) return;
  if (questionBusy) { whenIdle(nextAnnouncement); return; }
  const id = achQueue.shift();
  const def = ACHIEVEMENTS.find((x) => x.id === id);
  const close = () => { clearTimeout(achTimer); achEl?.remove(); achEl = null; setTimeout(nextAnnouncement, 250); };
  // Not clickable (pointer-events: none): it sits over the top bar and must never swallow a tap.
  achEl = h('div', { class: 'ach-toast', role: 'status', 'aria-live': 'polite', dataset: { ach: id } },
    h('span', { class: 'ach-toast-gem', 'aria-hidden': 'true', html: gemSvg(def.gem, { size: 34 }) }),
    h('span', { class: 'ach-toast-text' },
      h('span', { class: 'ach-toast-label' }, t('ach.unlocked')),
      h('span', { class: 'ach-toast-name' }, t(`ach.${id}.name`))));
  document.body.appendChild(achEl);
  try { fx.infuse(); } catch { /* sound is optional */ }
  achTimer = setTimeout(close, 3600);
}

// ---------- export / import ----------
/** What a backup holds: settings, stats and records, missed and recently seen questions (no games in progress). */
export function exportData() {
  const { onbStep, ...settings } = sanitizeSettings(store.load('settings', null));
  return {
    settings,
    stats: getStats(),
    missed: cleanIdMap(store.load('missed', null), LANGS, MISSED_MAX),
    recent: cleanIdMap(store.load('recent', null), LANGS, RECENT_MAX),
    seen: cleanIdMap(store.load('seen', null), LANGS, SEEN_MAX),
    achievements: getAchievements(),
    daily: (({ run, ...d }) => d)(getDaily()), // no challenge in progress, like the other games
  };
}

/**
 * Replaces the progress with a decoded backup. Every part is sanitized like stored data; a part
 * that is missing or has the wrong shape is left untouched. Returns false when nothing usable was found.
 */
export function importData(d) {
  if (!isObj(d)) return false;
  const parts = ['settings', 'stats', 'missed', 'recent', 'seen', 'achievements', 'daily'].filter((k) => isObj(d[k]));
  if (!parts.length) return false;
  if (isObj(d.settings)) {
    // Never bring back the first-run introduction: whoever imports has already played.
    store.save('settings', { ...sanitizeSettings(d.settings), onboarded: true, onbStep: null });
    loadSettings();
  }
  if (isObj(d.stats)) store.save('stats', sanitizeStats(d.stats));
  if (isObj(d.missed)) store.save('missed', cleanIdMap(d.missed, LANGS, MISSED_MAX));
  if (isObj(d.recent)) store.save('recent', cleanIdMap(d.recent, LANGS, RECENT_MAX));
  if (isObj(d.seen)) store.save('seen', cleanIdMap(d.seen, LANGS, SEEN_MAX));
  if (isObj(d.achievements)) store.save('achievements', sanitizeAchievements(d.achievements));
  if (isObj(d.daily)) {
    // Today's challenge in progress (if any) stays: a backup never holds one.
    const run = getDaily().run;
    store.save('daily', { ...sanitizeDaily({ ...d.daily, run: null }), run });
  }
  return true;
}

// ---------- "a question is being answered" (no interruptions meanwhile) ----------
let questionBusy = false;
let idleQueue = [];
const busyHooks = [];
/** `fn` runs whenever a question starts being answered. */
export function onQuestionBusy(fn) { busyHooks.push(fn); }
/** Set by the question card: true while an unanswered question is on screen. */
export function setQuestionBusy(v) {
  const was = questionBusy;
  questionBusy = !!v;
  if (questionBusy && !was) for (const fn of busyHooks) { try { fn(); } catch (e) { console.error(e); } }
  // Flushed a moment later: a question swapped for another (Breath, next question) is busy again by then.
  if (!questionBusy) setTimeout(flushIdle, 0);
}
function flushIdle() {
  if (questionBusy) return;
  const q = idleQueue;
  idleQueue = [];
  for (const fn of q) { try { fn(); } catch (e) { console.error(e); } }
}
export function isQuestionBusy() { return questionBusy; }
/** Runs `fn` now, or as soon as no unanswered question is on screen. */
export function whenIdle(fn) { if (questionBusy) idleQueue.push(fn); else fn(); }

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
