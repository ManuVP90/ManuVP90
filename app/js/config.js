// Global constants shared by every module.
export const APP_VERSION = '0.2.0';

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
