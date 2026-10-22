// Global constants shared by every module.
export const APP_VERSION = '2.0.1';

/** Category ids, in wheel / board order (SPEC §2). */
export const CATEGORIES = ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere'];

/** Gem color per category (SPEC §2). Also used as the player color palette. */
export const CAT_COLORS = {
  roshar: '#2f6fd6',   // sapphire
  scadrial: '#c0392b', // garnet / ruby
  sel: '#1e9e5a',      // emerald
  nalthis: '#e0a526',  // heliodor
  otros: '#8e44ad',    // amethyst
  cosmere: '#9aa7b8',  // diamond
};

/** Text color to use on top of a solid gem fill (contrast >= 4.5:1). */
export const CAT_INK = {
  roshar: '#ffffff',
  scadrial: '#ffffff',
  sel: '#04140b',
  nalthis: '#1d1300',
  otros: '#ffffff',
  cosmere: '#0d1320',
};

export const LANGS = ['es', 'en', 'fr', 'de', 'it'];
/** Device languages without their own UI that fall back to another supported one. */
export const LANG_ALIASES = { ca: 'es', gl: 'es', eu: 'es' };
export const LANG_NAMES = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano' };

export const TIMER_SECONDS = 30;
export const TIMER_MS = TIMER_SECONDS * 1000;
export const QUICK_LENGTH = 15;
/** Best possible quick-game score: every answer right (100) with the full speed bonus (100). */
export const QUICK_MAX_SCORE = QUICK_LENGTH * 200;
/** Taps on a question's options are ignored this long after it is painted (beta 4, G1: double tap on "Next"). */
export const INPUT_GUARD_MS = 350;
export const CHARGES_TO_INFUSE = 2;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
/** Classic: correct answers in a row before the turn passes anyway (multi-player games). */
export const MAX_STREAK = 3;

/** Question difficulties: 1 easy, 2 medium, 3 hard, 4 expert (SPEC §3.1). */
export const DIFFICULTIES = [1, 2, 3, 4];

/**
 * Game difficulty levels (SPEC "Nivel de dificultad de la partida (v2)").
 * weights: chance of each question difficulty; final: difficulty of the classic final question.
 * When a difficulty has no (unused) questions left in a category, the nearest one is used.
 */
export const LEVELS = {
  easy: { weights: { 1: 100 }, final: 2 },
  normal: { weights: { 1: 40, 2: 40, 3: 20 }, final: 3 },
  hard: { weights: { 2: 20, 3: 40, 4: 40 }, final: 4 },
  expert: { weights: { 3: 30, 4: 70 }, final: 4 },
};
export const LEVEL_IDS = Object.keys(LEVELS);
export const DEFAULT_LEVEL = 'normal';
export const levelOrDefault = (l) => (LEVEL_IDS.includes(l) ? l : DEFAULT_LEVEL);

/** Lifelines (SPEC "Ayudas (v2)"), in display order. Each player gets one of each per game. */
export const LIFELINES = ['atium', 'stormlight', 'breath'];
export const fullLifelines = () => Object.fromEntries(LIFELINES.map((k) => [k, 1]));
/** Recently seen question ids remembered per language (across games and sessions) to avoid repeats. */
export const RECENT_MAX = 150;
/** Missed question ids remembered per language for "Review mistakes" and practice "My mistakes". */
export const MISSED_MAX = 200;
/** Discovered question ids remembered per language (collection progress); far above any data file. */
export const SEEN_MAX = 5000;
/** Where "Report this question" opens a prefilled issue. */
export const REPORT_URL = 'https://github.com/ManuVP90/ManuVP90/issues/new';
export const REPORT_TEMPLATE = 'error-en-pregunta.md';
