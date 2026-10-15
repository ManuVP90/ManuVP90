// Global constants shared by every module.
export const APP_VERSION = '1.1.0';

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
export const LANG_NAMES = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano' };

export const TIMER_SECONDS = 30;
export const QUICK_LENGTH = 15;
export const CHARGES_TO_INFUSE = 2;
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;

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

/** Lifelines (SPEC "Comodines (v2)"), in display order. Each player gets one of each per game. */
export const LIFELINES = ['atium', 'stormlight', 'breath'];
export const fullLifelines = () => Object.fromEntries(LIFELINES.map((k) => [k, 1]));
