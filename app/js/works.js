// Work ids (SPEC §4) grouped for the spoiler filter, plus display titles per language.
// Groups reuse the category (world) ids so their labels come from the localized
// category names in i18n (cat.<id>).

export const WORK_GROUPS = [
  { id: 'roshar', works: ['way-of-kings', 'words-of-radiance', 'edgedancer', 'oathbringer', 'dawnshard', 'rhythm-of-war', 'wind-and-truth'] },
  { id: 'scadrial', works: ['final-empire', 'well-of-ascension', 'hero-of-ages', 'secret-history', 'eleventh-metal', 'allomancer-jak',
    'alloy-of-law', 'shadows-of-self', 'bands-of-mourning', 'lost-metal', 'mistborn-misc'] },
  { id: 'sel', works: ['elantris', 'emperors-soul', 'hope-of-elantris'] },
  { id: 'nalthis', works: ['warbreaker'] },
  { id: 'otros', works: ['white-sand', 'shadows-for-silence', 'sixth-of-the-dusk', 'tress', 'yumi', 'sunlit-man', 'emberdark'] },
  { id: 'cosmere', works: ['arcanum', 'wob'] },
];

export const ALL_WORKS = WORK_GROUPS.flatMap((g) => g.works);

const EN = {
  'elantris': 'Elantris',
  'hope-of-elantris': 'The Hope of Elantris',
  'emperors-soul': "The Emperor's Soul",
  'final-empire': 'The Final Empire',
  'well-of-ascension': 'The Well of Ascension',
  'hero-of-ages': 'The Hero of Ages',
  'eleventh-metal': 'The Eleventh Metal',
  'allomancer-jak': 'Allomancer Jak and the Pits of Eltania',
  'alloy-of-law': 'The Alloy of Law',
  'shadows-of-self': 'Shadows of Self',
  'bands-of-mourning': 'The Bands of Mourning',
  'lost-metal': 'The Lost Metal',
  'secret-history': 'Mistborn: Secret History',
  'mistborn-misc': 'Other Mistborn material',
  'way-of-kings': 'The Way of Kings',
  'words-of-radiance': 'Words of Radiance',
  'edgedancer': 'Edgedancer',
  'oathbringer': 'Oathbringer',
  'dawnshard': 'Dawnshard',
  'rhythm-of-war': 'Rhythm of War',
  'wind-and-truth': 'Wind and Truth',
  'warbreaker': 'Warbreaker',
  'white-sand': 'White Sand',
  'shadows-for-silence': 'Shadows for Silence in the Forests of Hell',
  'sixth-of-the-dusk': 'Sixth of the Dusk',
  'tress': 'Tress of the Emerald Sea',
  'yumi': 'Yumi and the Nightmare Painter',
  'sunlit-man': 'The Sunlit Man',
  'emberdark': 'Isles of the Emberdark',
  'arcanum': 'Arcanum Unbounded (essays)',
  'wob': 'Words of Brandon (interviews)',
};

// TODO(i18n): localized official titles
export const WORK_TITLES = {
  en: { ...EN },
  es: { ...EN },
  fr: { ...EN },
  de: { ...EN },
  it: { ...EN },
};

export function workTitle(id, lang) {
  return (WORK_TITLES[lang] && WORK_TITLES[lang][id]) || EN[id] || id;
}
