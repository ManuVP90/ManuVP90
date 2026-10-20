// Daily challenge ("Reto diario"), pure part (no DOM, no storage): the date key, the seeded draw
// that gives everyone the same 5 questions on the same date and language, the streak rules and
// the spoiler-free share text. Imported by core.js, screens/daily.js and the tests.
import { CATEGORIES } from './config.js';

export const DAILY_LENGTH = 5;
/** Difficulty of each slot: a gentle ramp from easy to hard (expert questions stay out). */
export const DAILY_DIFFS = [1, 2, 2, 3, 3];
export const DAILY_VERSION = 1;

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD (the challenge changes at the player's midnight). */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const isDateKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
/** The date key `n` days after `key` (n may be negative). Calendar arithmetic in UTC, so DST never matters. */
export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 32-bit FNV-1a hash of a string. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Seeded PRNG (mulberry32) from a string seed: same seed, same sequence, on every device. */
export function seededRandom(seed) {
  let a = hash32(String(seed));
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The day's questions: DAILY_LENGTH questions drawn with a PRNG seeded by `${date}|${lang}` from the
 * questions the spoiler filter allows (sorted by id first, so the order of the data file doesn't
 * matter). Same date + language + filter → the same questions and option orders for everyone; a
 * spoiler filter that hides questions changes the pool, so the selection is computed over the
 * filtered pool. Slot difficulties follow DAILY_DIFFS (nearest available difficulty if one is
 * missing), and each slot prefers a world not used yet. Returns [{ id, order }] (may be shorter
 * when the pool is tiny; [] when it is empty).
 */
export function dailyPick(questions, disabledWorks, date, lang) {
  const off = new Set(disabledWorks || []);
  const pool = questions.filter((q) => !off.has(q.w) && CATEGORIES.includes(q.c))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rnd = seededRandom(`${date}|${lang}`);
  const out = [];
  const usedIds = new Set();
  const usedCats = new Set();
  for (const target of DAILY_DIFFS) {
    const left = pool.filter((q) => !usedIds.has(q.id));
    if (!left.length) break;
    // Nearest difficulty to the slot's that still has questions (ties: the easier one), within 1–3 if possible.
    const ds = [...new Set(left.map((q) => q.d))];
    const inRange = ds.filter((d) => d <= 3);
    const pickFrom = inRange.length ? inRange : ds;
    const best = Math.min(...pickFrom.map((d) => Math.abs(d - target)));
    const d = Math.min(...pickFrom.filter((x) => Math.abs(x - target) === best));
    let cands = left.filter((q) => q.d === d);
    const freshWorld = cands.filter((q) => !usedCats.has(q.c));
    if (freshWorld.length) cands = freshWorld;
    const q = cands[Math.floor(rnd() * cands.length)];
    // Option order from the same generator: the layout is the same for everyone too.
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    out.push({ id: q.id, order });
    usedIds.add(q.id);
    usedCats.add(q.c);
  }
  return out;
}

// ---------- stored state ----------
// { v, last: date of the last finished challenge, streak, best, played, perfect,
//   result: { date, lang, marks: [{ c, ok }], ids, filtered } (the last finished one, for today's screen),
//   run: the challenge in progress { date, lang, items: [{ id, order }], index, marks, filtered, current } }
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
export const emptyDaily = () => ({ v: DAILY_VERSION, last: null, streak: 0, best: 0, played: 0, perfect: 0, result: null, run: null });

const isMark = (m) => isObj(m) && CATEGORIES.includes(m.c) && typeof m.ok === 'boolean';
const isMarks = (a, max) => Array.isArray(a) && a.length <= max && a.every(isMark);

function cleanResult(r) {
  if (!isObj(r) || !isDateKey(r.date) || typeof r.lang !== 'string' || !isMarks(r.marks, DAILY_LENGTH) || !r.marks.length) return null;
  const ids = Array.isArray(r.ids) && r.ids.length === r.marks.length && r.ids.every((id) => typeof id === 'string' && id) ? [...r.ids] : [];
  return { date: r.date, lang: r.lang, marks: r.marks.map((m) => ({ c: m.c, ok: m.ok })), ids, filtered: r.filtered === true };
}

/** Run validation (the question clock and option order are checked by the caller's helpers). */
export function isValidDailyRun(r, { isPermutation, isValidClock } = {}) {
  if (!isObj(r) || !isDateKey(r.date) || typeof r.lang !== 'string') return false;
  if (!Array.isArray(r.items) || !r.items.length || r.items.length > DAILY_LENGTH) return false;
  const ids = new Set();
  for (const it of r.items) {
    if (!isObj(it) || typeof it.id !== 'string' || !it.id || ids.has(it.id)) return false;
    if (isPermutation && !isPermutation(it.order, 4)) return false;
    ids.add(it.id);
  }
  if (!Number.isInteger(r.index) || r.index < 0 || r.index >= r.items.length) return false;
  if (!isMarks(r.marks, r.items.length) || r.marks.length !== r.index) return false;
  if (r.current !== null && r.current !== undefined) {
    if (!isObj(r.current) || (isValidClock && !isValidClock(r.current.clock))) return false;
  }
  return true;
}

/** Stored daily state with every field checked; anything odd falls back to its default. */
export function sanitizeDaily(s, helpers) {
  const out = emptyDaily();
  if (!isObj(s)) return out;
  if (isDateKey(s.last)) out.last = s.last;
  out.streak = count(s.streak);
  out.played = count(s.played);
  out.perfect = Math.min(count(s.perfect), out.played);
  out.best = Math.max(count(s.best), out.streak);
  if (!out.last) out.streak = 0;
  out.result = cleanResult(s.result);
  if (isValidDailyRun(s.run, helpers)) out.run = s.run;
  return out;
}

/** The streak as it stands on `today`: it is broken once a whole day passed without a challenge. */
export function currentStreak(state, today) {
  if (!state.last) return 0;
  return state.last === today || state.last === addDays(today, -1) ? state.streak : 0;
}

/** Records a finished challenge of `date` (once per date): streak, best, counters, last result. */
export function recordDaily(state, { date, lang, marks, ids = [], filtered = false }) {
  const s = { ...state };
  if (s.last === date) return s; // already counted
  const consecutive = s.last && addDays(s.last, 1) === date;
  // A run finished for an older date than the last one (resumed late) only fills the counters.
  if (s.last && s.last > date) { s.played++; return s; }
  s.streak = consecutive ? s.streak + 1 : 1;
  s.best = Math.max(s.best, s.streak);
  s.last = date;
  s.played++;
  if (marks.length === DAILY_LENGTH && marks.every((m) => m.ok)) s.perfect++;
  s.result = { date, lang, marks: marks.map((m) => ({ c: m.c, ok: m.ok })), ids: [...ids], filtered: !!filtered };
  return s;
}

/** Emoji square per world (gem color) for a right answer; a black square for a miss. */
export const SQUARES = { roshar: '🟦', scadrial: '🟥', sel: '🟩', nalthis: '🟨', otros: '🟪', cosmere: '⬜' };
export const MISS_SQUARE = '⬛';

/**
 * Spoiler-free share text: title + date, one square per question (gem color when right, black when
 * missed: worlds only, no question or answer), score, streak and an optional link.
 */
export function shareText({ title, date, marks, streakLabel = '', filteredLabel = '', url = '' }) {
  const squares = marks.map((m) => (m.ok ? SQUARES[m.c] || '🟦' : MISS_SQUARE)).join('');
  const score = `${marks.filter((m) => m.ok).length}/${marks.length}`;
  return [`${title} · ${date}`, `${squares} ${score}`, streakLabel, filteredLabel, url].filter(Boolean).join('\n');
}
