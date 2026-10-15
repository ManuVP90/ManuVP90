// Question loading and drawing.
// Generated format (tools/build.mjs): { id, c, d, w, q, o: [correct, wrong, wrong, wrong], x }
import { CATEGORIES } from './config.js';

const loaded = new Map();

/** Loads questions for a language. Falls back to English if that file is missing. */
export async function loadQuestions(lang) {
  if (loaded.has(lang)) return loaded.get(lang);
  let list = null;
  try {
    const res = await fetch(`data/questions.${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list = await res.json();
  } catch (e) {
    console.warn(`questions.${lang}.json could not be loaded`, e);
    if (lang !== 'en') return loadQuestions('en');
    throw e;
  }
  list = Array.isArray(list) ? list.filter(isValid) : [];
  // A language whose translations aren't ready yet is generated as an empty file: use English.
  if (!list.length && lang !== 'en') return loadQuestions('en');
  list.lang = lang;
  loaded.set(lang, list);
  return list;
}

function isValid(q) {
  return q && typeof q.id === 'string' && CATEGORIES.includes(q.c) && typeof q.q === 'string'
    && Array.isArray(q.o) && q.o.length === 4;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Random display order of the 4 options; o[0] is always the correct one in the data. */
export const shuffledOrder = () => shuffle([0, 1, 2, 3]);

/**
 * A pool of questions filtered by the spoiler filter. `used` maps category -> ids already
 * asked; it is mutated in place so callers can persist it (classic game) or keep it in memory.
 * A question is not repeated until every candidate for that draw has been used.
 */
export class Pool {
  constructor(questions, disabledWorks = [], used = {}) {
    const off = new Set(disabledWorks);
    this.used = used;
    this.byCat = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
    this.byId = new Map();
    for (const q of questions) {
      if (off.has(q.w)) continue;
      this.byCat[q.c].push(q);
      this.byId.set(q.id, q);
    }
  }

  /** Categories that have at least one question under the filter. */
  categories() { return CATEGORIES.filter((c) => this.byCat[c].length > 0); }

  size(cat = null, difficulty = null) {
    const cats = cat ? [cat] : CATEGORIES;
    let n = 0;
    for (const c of cats) n += this.byCat[c].filter((q) => !difficulty || q.d === difficulty).length;
    return n;
  }

  get(id) { return this.byId.get(id) || null; }

  draw(cat, filter = () => true) {
    const cands = (this.byCat[cat] || []).filter(filter);
    if (!cands.length) return null;
    const usedIds = new Set(this.used[cat] || []);
    let fresh = cands.filter((q) => !usedIds.has(q.id));
    if (!fresh.length) {
      // Exhausted: forget these candidates and start over.
      const ids = new Set(cands.map((q) => q.id));
      this.used[cat] = (this.used[cat] || []).filter((id) => !ids.has(id));
      fresh = cands;
    }
    const q = pick(fresh);
    (this.used[cat] ||= []).push(q.id);
    return q;
  }

  /** Any category, optional difficulty. */
  drawAny(difficulty = null, cats = this.categories()) {
    const f = (q) => !difficulty || q.d === difficulty;
    const eligible = cats.filter((c) => this.byCat[c].some(f));
    if (!eligible.length) return null;
    return this.draw(pick(eligible), f);
  }

  /** Final question: random category, difficulty 3 if any exists, otherwise the highest available. */
  drawFinal(cats = this.categories()) {
    let maxD = 0;
    for (const c of cats) for (const q of this.byCat[c]) maxD = Math.max(maxD, q.d);
    if (!maxD) return null;
    return this.drawAny(maxD, cats);
  }
}
