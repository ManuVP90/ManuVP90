// Question loading and drawing.
// Generated format (tools/build.mjs): { id, c, d, w, q, o: [correct, wrong, wrong, wrong], x }
import { CATEGORIES, DIFFICULTIES, LEVELS, levelOrDefault } from './config.js';

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

  /**
   * Draws a question in `cat` for a game difficulty level (SPEC v2): a target difficulty is
   * picked by the level's weights; if that difficulty has no unused question in the category,
   * the nearest difficulty that does is used (preferring ones inside the level, at most one
   * step outside it). When those are used up, already-asked questions come back.
   */
  drawLeveled(cat, level) {
    const list = this.byCat[cat] || [];
    if (!list.length) return null;
    const { weights } = LEVELS[levelOrDefault(level)];
    const usedIds = new Set(this.used[cat] || []);
    const fresh = {};
    const all = {};
    for (const q of list) {
      all[q.d] = (all[q.d] || 0) + 1;
      if (!usedIds.has(q.id)) fresh[q.d] = (fresh[q.d] || 0) + 1;
    }
    // Unused questions may come from one step outside the level (Easy → 2, Expert → 2);
    // past that, the level's own questions are recycled instead.
    const ds = Object.keys(weights).map(Number);
    const lo = Math.min(...ds) - 1;
    const hi = Math.max(...ds) + 1;
    const near = Object.fromEntries(Object.entries(fresh).filter(([d]) => d >= lo && d <= hi));
    const counts = Object.keys(near).length ? near : all;
    const d = nearestDifficulty(weightedPick(weights), counts, weights);
    return d ? this.draw(cat, (q) => q.d === d) : null;
  }

  /** Any available category, drawn for a level. */
  drawAnyLeveled(level, cats = this.categories()) {
    const eligible = cats.filter((c) => this.byCat[c].length);
    return eligible.length ? this.drawLeveled(pick(eligible), level) : null;
  }

  /** Is there another question with the same category and difficulty (for the Breath lifeline)? */
  hasAlternative(q) {
    return (this.byCat[q.c] || []).some((x) => x.d === q.d && x.id !== q.id);
  }

  /** Another question of the same category and difficulty, or null. */
  drawAlternative(q) {
    return this.hasAlternative(q) ? this.draw(q.c, (x) => x.d === q.d && x.id !== q.id) : null;
  }

  /**
   * Final question: random category, difficulty `target` (by level) if any category has it,
   * otherwise the nearest difficulty available (preferring the harder one on ties).
   */
  drawFinal(cats = this.categories(), target = 3) {
    const counts = {};
    for (const c of cats) for (const q of this.byCat[c]) counts[q.d] = (counts[q.d] || 0) + 1;
    const d = nearestDifficulty(target, counts, null, true);
    return d ? this.drawAny(d, cats) : null;
  }
}

/** Picks a key of `weights` with probability proportional to its value. */
function weightedPick(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [d, w] of entries) { if ((r -= w) < 0) return Number(d); }
  return Number(entries[entries.length - 1][0]);
}

/**
 * The difficulty closest to `target` with counts[d] > 0. Ties go to a difficulty inside
 * `preferred` (the level's weights), then to the harder one if `preferHarder`, else random.
 */
export function nearestDifficulty(target, counts, preferred = null, preferHarder = false) {
  const avail = DIFFICULTIES.filter((d) => counts[d] > 0);
  if (!avail.length) return null;
  const best = Math.min(...avail.map((d) => Math.abs(d - target)));
  let cands = avail.filter((d) => Math.abs(d - target) === best);
  if (cands.length > 1 && preferred) {
    const inLevel = cands.filter((d) => preferred[d]);
    if (inLevel.length) cands = inLevel;
  }
  if (cands.length > 1 && preferHarder) return Math.max(...cands);
  return pick(cands);
}
