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

/** The difficulties a level draws from, plus one step on each side (its fallback range). */
function levelRange(level) {
  const ds = Object.keys(LEVELS[levelOrDefault(level)].weights).map(Number);
  return [Math.min(...ds) - 1, Math.max(...ds) + 1];
}

/**
 * A pool of questions filtered by the spoiler filter. `used` maps category -> ids already
 * asked; it is mutated in place so callers can persist it (classic game) or keep it in memory.
 * A question is not repeated until every candidate for that draw has been used, and the
 * question just shown never comes back right away when a category starts over.
 */
export class Pool {
  /**
   * @param {object} [recent] recency tracker across games ({ rank(id), add(id) }, see core.makePool):
   *        among the candidates of a draw, questions not seen lately come first, then the least
   *        recently seen. `recycled` turns true when a draw had to start a category over.
   */
  constructor(questions, disabledWorks = [], used = {}, recent = null) {
    const off = new Set(disabledWorks);
    this.used = used;
    this.recent = recent;
    this.recycled = false;
    this.byCat = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
    this.byId = new Map();
    this.allById = new Map(); // every loaded question, filter or not
    for (const q of questions) {
      this.allById.set(q.id, q);
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

  /** Questions of `cat` a level can use (its difficulties, one step outside included). */
  levelSize(cat, level) {
    const [lo, hi] = levelRange(level);
    return (this.byCat[cat] || []).filter((q) => q.d >= lo && q.d <= hi).length;
  }

  get(id) { return this.byId.get(id) || null; }

  /**
   * A question by id even if the spoiler filter now hides it: a question already on screen stays
   * pending when the filter changes (no free re-draw).
   */
  getAny(id) { return this.allById.get(id) || null; }

  /** How many questions of `cat` pass `filter`, and how many of those are still unused. */
  counts(cat, filter = () => true) {
    const usedIds = new Set(this.used[cat] || []);
    let all = 0;
    let fresh = 0;
    for (const q of this.byCat[cat] || []) {
      if (!filter(q)) continue;
      all++;
      if (!usedIds.has(q.id)) fresh++;
    }
    return { all, fresh };
  }

  draw(cat, filter = () => true) {
    const cands = (this.byCat[cat] || []).filter(filter);
    if (!cands.length) return null;
    const usedList = this.used[cat] || [];
    const usedIds = new Set(usedList);
    let fresh = cands.filter((q) => !usedIds.has(q.id));
    if (!fresh.length) {
      // Exhausted: forget these candidates and start over, except the one asked last,
      // which stays "used" so it can't come straight back.
      const ids = new Set(cands.map((q) => q.id));
      const last = cands.length > 1 ? [...usedList].reverse().find((id) => ids.has(id)) : undefined;
      this.used[cat] = usedList.filter((id) => !ids.has(id) || id === last);
      fresh = cands.filter((q) => q.id !== last);
      this.recycled = true;
    }
    // Across games: questions not seen lately first, then the least recently seen one.
    let best = fresh;
    if (this.recent) {
      const rank = (x) => this.recent.rank(x.id);
      const low = Math.min(...fresh.map(rank));
      best = fresh.filter((x) => rank(x) === low);
    }
    const q = pick(best);
    (this.used[cat] ||= []).push(q.id);
    this.recent?.add(q.id);
    return q;
  }

  /** `list` without the questions seen lately (across games), unless that leaves nothing. */
  notRecent(list) {
    if (!this.recent) return list;
    const out = list.filter((q) => this.recent.rank(q.id) < 0);
    return out.length ? out : list;
  }

  /**
   * Any category, optional difficulty. The category is chosen with a weight equal to its
   * unused questions (all of them once everything was used), so every question has the same
   * chance and a world with a single question doesn't come up as often as a big one.
   */
  drawAny(difficulty = null, cats = this.categories()) {
    const f = (q) => !difficulty || q.d === difficulty;
    const c = weightedCategory(cats, (cat) => this.counts(cat, f));
    return c ? this.draw(c, f) : null;
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
    // Difficulties are weighed on the questions not seen lately when there are any.
    const unused = list.filter((q) => !usedIds.has(q.id));
    for (const q of list) all[q.d] = (all[q.d] || 0) + 1;
    const [lo0, hi0] = levelRange(level);
    for (const q of this.notRecent(unused.filter((x) => x.d >= lo0 && x.d <= hi0)).concat(unused.filter((x) => x.d < lo0 || x.d > hi0))) {
      fresh[q.d] = (fresh[q.d] || 0) + 1;
    }
    // Unused questions may come from one step outside the level (Easy → 2, Expert → 2); when the
    // level's range has none left, any unused difficulty comes first (beta 4, M1: a narrow filter
    // must not serve the same question twice while another one is unused); only when every
    // question of the category was asked are they recycled, never the one asked last if there is
    // any other.
    const [lo, hi] = levelRange(level);
    // Outside the level the nearest difficulty comes first, the harder one on ties (beta 5, item 7:
    // Easy falls back to 2, then 3, then 4, as its description says).
    const near = Object.fromEntries(Object.entries(fresh).filter(([d]) => d >= lo && d <= hi));
    if (Object.keys(near).length || Object.keys(fresh).length) {
      const inside = Object.keys(near).length > 0;
      const d = nearestDifficulty(weightedPick(weights), inside ? near : fresh, weights, !inside);
      return d ? this.draw(cat, (q) => q.d === d) : null;
    }
    const lastId = list.length > 1 ? (this.used[cat] || []).at(-1) : undefined;
    const others = {};
    for (const q of list) if (q.id !== lastId) others[q.d] = (others[q.d] || 0) + 1;
    const d = nearestDifficulty(weightedPick(weights), Object.keys(others).length ? others : all, weights);
    return d ? this.draw(cat, (q) => q.d === d && q.id !== lastId) : null;
  }

  /** Any available category (weighted by its questions), drawn for a level. */
  drawAnyLeveled(level, cats = this.categories()) {
    const c = weightedCategory(cats, (cat) => this.counts(cat));
    return c ? this.drawLeveled(c, level) : null;
  }

  /**
   * Quick game draw: a question of `cat` that is not in `seen` (ids already asked in this
   * run), for `level`. The difficulty is chosen like drawLeveled, but only among questions
   * not seen in the run; ones unused in the session are preferred. Null when `cat` has
   * nothing left that the run hasn't seen.
   */
  drawUnseen(cat, level, seen) {
    const cands = (this.byCat[cat] || []).filter((q) => !seen.has(q.id));
    if (!cands.length) return null;
    const { weights } = LEVELS[levelOrDefault(level)];
    const [lo, hi] = levelRange(level);
    const tally = (list) => list.reduce((o, q) => { o[q.d] = (o[q.d] || 0) + 1; return o; }, {});
    const inRange = cands.filter((q) => q.d >= lo && q.d <= hi);
    const d = nearestDifficulty(weightedPick(weights), tally(this.notRecent(inRange.length ? inRange : cands)), weights, !inRange.length);
    return this.draw(cat, (q) => q.d === d && !seen.has(q.id));
  }

  /**
   * Is there another question with the same category and difficulty (for the Breath lifeline)?
   * `seen` (optional) holds ids that must not come back (the quick game's run).
   */
  hasAlternative(q, seen = null) {
    return (this.byCat[q.c] || []).some((x) => x.d === q.d && x.id !== q.id && !seen?.has(x.id));
  }

  /** Another question of the same category and difficulty (not in `seen`), or null. */
  drawAlternative(q, seen = null) {
    const f = (x) => x.d === q.d && x.id !== q.id && !seen?.has(x.id);
    return this.hasAlternative(q, seen) ? this.draw(q.c, f) : null;
  }

  /**
   * Final question: random category, difficulty `target` (by level) if any category has it,
   * otherwise the nearest difficulty available (preferring the harder one on ties).
   * Questions not asked yet in this game (`used`) come first: the final question is a repeat
   * only when every question of the available categories has already been asked.
   */
  drawFinal(cats = this.categories(), target = 3) {
    const freshCounts = {};
    const counts = {};
    for (const c of cats) {
      const usedIds = new Set(this.used[c] || []);
      for (const q of this.byCat[c]) {
        counts[q.d] = (counts[q.d] || 0) + 1;
        if (!usedIds.has(q.id)) freshCounts[q.d] = (freshCounts[q.d] || 0) + 1;
      }
    }
    const d = nearestDifficulty(target, Object.keys(freshCounts).length ? freshCounts : counts, null, true);
    return d ? this.drawAny(d, cats) : null;
  }
}

/** Picks one of `cats` weighted by its unused candidates (all candidates once none is unused). */
function weightedCategory(cats, countsOf) {
  const rows = cats.map((c) => ({ c, ...countsOf(c) })).filter((r) => r.all > 0);
  if (!rows.length) return null;
  const key = rows.some((r) => r.fresh > 0) ? 'fresh' : 'all';
  const total = rows.reduce((n, r) => n + r[key], 0);
  let x = Math.random() * total;
  for (const r of rows) { if ((x -= r[key]) < 0) return r.c; }
  return rows[rows.length - 1].c;
}

/**
 * Quick game plan: `total` category slots (capped at the pool size) shared out in proportion
 * to the questions each category offers at this level (largest remainder), never more slots
 * than a category has questions; then shuffled so the worlds alternate. Slots beyond what the
 * level's questions cover go to the categories that still have questions of any difficulty.
 */
export function quickPlan(pool, level, total) {
  const cats = pool.categories();
  const cap = Object.fromEntries(cats.map((c) => [c, pool.size(c)]));
  const lvl = Object.fromEntries(cats.map((c) => [c, pool.levelSize(c, level)]));
  const n = Object.fromEntries(cats.map((c) => [c, 0]));
  let left = Math.min(total, cats.reduce((s, c) => s + cap[c], 0));
  // First the level's own questions, then anything else.
  for (const limit of [lvl, cap]) {
    const room = (c) => Math.max(0, limit[c] - n[c]);
    const totalRoom = cats.reduce((s, c) => s + room(c), 0);
    if (!left || !totalRoom) continue;
    const give = Math.min(left, totalRoom);
    const share = cats.map((c) => {
      const exact = (give * room(c)) / totalRoom;
      return { c, k: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let given = 0;
    for (const s of share) { n[s.c] += s.k; given += s.k; }
    share.sort((a, b) => b.rest - a.rest || Math.random() - 0.5);
    for (const s of share) {
      if (given >= give) break;
      if (n[s.c] < limit[s.c]) { n[s.c]++; given++; }
    }
    left -= given;
  }
  return shuffle(cats.flatMap((c) => Array(n[c]).fill(c)));
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
