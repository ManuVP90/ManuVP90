#!/usr/bin/env node
// Merges content/<lang>/glossary-review.json into content/glossary.json, then normalizes and
// audits the result. The per-language review (made by that language's translator) wins over the
// first pass, with one exception: the golden rule.
//
//  1. Merge: forms, statuses and sources from each review; review notes are appended as
//     "[lang] note" only if that exact segment is not already present.
//  2. Normalize: duplicated note segments and duplicated sources are removed.
//  3. Audit (beta round 4, m8): a term may only be `official` in a language if at least one of its
//     sources is evidence of that language's published edition (publisher page, library record,
//     retailer/edition listing, book text, or a review quoting the edition). Wikis (any Coppermind,
//     fandom, Wikipedia...), fan sites and internal references ("glossary", content files) do not
//     count. Otherwise the status becomes `community` (a localized wiki/fan form exists) or
//     `unverified` (nothing at all), and an "[audit] ..." note records the downgrade.
//
// Running it twice in a row never changes the file (idempotent; tested in tools/unit.mjs).
// Usage: node tools/merge-glossary.mjs [--quiet]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LANGS = ['es', 'fr', 'de', 'it'];

// ---------- notes ----------
// Notes are a free-text base followed by "[xx] ..." segments (xx = language or "audit").
const SEG = /\s*(?=\[(?:es|fr|de|it|audit)\] )/;
export function splitNotes(notes) {
  return String(notes ?? '').split(SEG).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
export function dedupeNotes(notes) {
  const out = [];
  for (const seg of splitNotes(notes)) if (!out.includes(seg)) out.push(seg);
  // A segment fully contained in another one (e.g. a truncated copy) is redundant.
  return out.filter((s, i) => !out.some((o, j) => j !== i && o.length > s.length && o.includes(s) && o.startsWith(s.slice(0, 4))))
    .join(' ');
}
export function addNote(notes, seg) {
  const s = seg.replace(/\s+/g, ' ').trim();
  if (!s) return dedupeNotes(notes);
  const segs = splitNotes(notes);
  if (segs.includes(s)) return dedupeNotes(notes);
  return dedupeNotes([...segs, s].join(' '));
}
export function removeNote(notes, seg) {
  return splitNotes(notes).filter((s) => s !== seg).join(' ');
}

// ---------- sources ----------
// Wikis, fan sites and fan forums: never evidence of a published edition.
const WIKI = /coppermind|fandom\.com|wikia\.com|wikipedia|everybodywiki|wikimonde|wikibrief|marjorie-wiki|franco\.wiki|wikiland|17thshard|cosmere\.fr|cosmere\.es|forum-elbakin|fanfiktion|reddit\.com|webfantasy\.fr|reihenfolge\.org|buchtipp\.de\/reihenfolgen|himmelsblau\.org|tercerafundacion|reactormag|brandonsanderson\.com|\bfan (wiki|site|sources)\b|\bwiki\b/i;
// Internal / derived references: not evidence of anything by themselves.
const INTERNAL = /^(glossary\b|content\/|WORK_TITLES|by analogy|plural of|searched together|coppermind \/ fandom searches|no italian edition|no .* edition .*found)/i;
// Publishers, national/public library records, retailers listing the edition, book text.
const EDITION = /penguinrandomhouse|penguinlibros|penguin\.de|piper\.de|heyne|mondadori|fanucci|livredepoche|hachette\.fr|droemer-knaur|bnf\.fr|bibliotheque|sbn\.it|dnb\.de|bne\.es|books\.google|archive\.org|epdf\.pub|amazon\.|casadellibro|libraccio|lafeltrinelli|thalia\.de|audible\.|legimi|izneo|librairie-gallimard|bookenstock|ibs\.it|fnac\.|hugendubel|jpc\.de|buchfreund|ebay\.|monalira\.org\/biblio|scifi-universe|edition excerpt|blurb|listing|\btitle "|\(mondadori \d{4}\)|^mondadori \d{4}$/i;
// Reviews and reading blogs that quote the published edition (incl. the French translator's blog).
const REVIEW = /babelio|goodreads|phantastik-couch|lovelybooks|lecturalia|pretemoitaplume|teilzeithelden|lesejury|chemins-khatovar|melaniefazi|buecherbriefe|anikaentrelibros|lesmillemondes|limaginaerum|gedankenfunken|buchwurm|eligeunlibro|booknode|paperblog|piumedicarta|criticasfrikis|quelibroleo|lesescapades|blog\.flore\.nz|lebaralivres|chiacchiereletterarie|entreteclasytinta|boywithletters|malecturotheque|livraddict|sometimesabook|fantasymagazine|librinews|bdfi\.net|noosfere|buechertreff|lapiedradesisifo|ellector|ladylivre|lespipelettes|phantastisch-lesen|worldofbooksanddreams|zauberspiegel|mondesdepoche|geeksantiques|buechereule|reviews? (of|calling)|reader reviews/i;

/** Language a source speaks for, or null when it cannot be told from the source itself. */
export function sourceLang(s) {
  const t = String(s);
  const host = (t.match(/^(?:https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,})(?=[/ ]|$)/i)?.[1] ?? '').toLowerCase();
  if (/^it\./.test(host) || /\/it(?:\/|\s|$)|^it[.\s]|\bitalian\b|mondadori|fanucci|libraccio|conciliatore|^es\/it /i.test(t) || /\.it$/.test(host)) return 'it';
  if (/^es\./.test(host) || /\bspanish\b|ilimitado|^es\./i.test(t) || /\.(es|com\.co|com\.pa|com\.ar|com\.mx)$/.test(host) ||
      /penguinrandomhouse\.com|penguinlibros|lecturalia|tercerafundacion|quelibroleo|criticasfrikis|eligeunlibro|anikaentrelibros|entreteclasytinta|boywithletters|lapiedradesisifo|nacidos-de-la-bruma|cosmere\.es/i.test(t)) return 'es';
  if (/Metall-der-Goetter/i.test(t)) return 'de'; // German audiobook listed on a French store
  if (/^fr\.|\.fr$/.test(host) || /\/fr\/|content\/fr\//.test(t) ||
      /melaniefazi|elbakin|Vent_et_v|epdf\.pub\/le-|livredepoche|gallimard|hachette|scifi-universe|ladylivre|lespipelettes|mondesdepoche|Fils-des-Brumes|\bfrench\b|\/fr\/|pretemoitaplume|chemins-khatovar|lebaralivres|malecturotheque|lesescapades|babelio|booknode|bdfi|noosfere|livraddict|blog\.flore\.nz|limaginaerum|lesmillemondes|paperblog\.fr|sometimesabook/i.test(t)) return 'fr';
  if (/^de\.|\.de$/.test(host) || /\/de\/|kosmeer|penguinrandomhouse\.de|phantastisch-lesen|lovelybooks|lesejury|marjorie-wiki|wikibrief|himmelsblau|gedankenfunken|buchwurm/i.test(t)) return 'de';
  return null;
}

/** 'edition' | 'review' | 'wiki' | 'internal' | 'other'. A compound source ("a ; b") takes the
 *  strongest kind among its parts (edition > review > wiki > other > internal). */
const RANK = ['edition', 'review', 'wiki', 'other', 'internal'];
export function sourceKind(s) {
  const parts = String(s).split(/\s+;\s+/).filter(Boolean);
  if (parts.length > 1) return parts.map(kindOf).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
  return kindOf(s);
}
function kindOf(s) {
  const t = String(s);
  if (INTERNAL.test(t)) return 'internal';
  if (/translator/i.test(t) && /elbakin/i.test(t)) return 'review'; // the French translator on her own wording
  if (WIKI.test(t)) return 'wiki';
  if (EDITION.test(t)) return 'edition';
  if (REVIEW.test(t)) return 'review';
  return 'other';
}

/** Sources of `entry` that speak for `lang` (own language hint, or listed by that language's reviewer). */
export function sourcesFor(entry, lang, reviewSources = []) {
  return (entry.sources ?? []).filter((s) => {
    const l = sourceLang(s);
    return l === lang || (l === null && reviewSources.includes(s));
  });
}

export const AUDIT_NOTE = (lang, to) =>
  `[audit] ${lang}: downgraded from official to ${to} (beta round 4, m8): no source on record from the published ${lang} edition (wiki/fan/internal references only).`;

/** Enforces the golden rule; returns the list of downgrades [{term, lang, to}]. */
export function auditOfficial(glossary, reviews = {}) {
  const changes = [];
  for (const [term, e] of Object.entries(glossary)) {
    for (const lang of LANGS) {
      if (e.status?.[lang] !== 'official') {
        continue;
      }
      const rs = reviews[lang]?.[term]?.sources ?? reviews[lang]?.[findKey(reviews[lang], term)]?.sources ?? [];
      const own = sourcesFor(e, lang, rs);
      const ok = own.some((s) => ['edition', 'review'].includes(sourceKind(s)));
      if (ok) {
        for (const to of ['community', 'unverified']) e.notes = removeNote(e.notes, AUDIT_NOTE(lang, to));
        continue;
      }
      const to = own.some((s) => sourceKind(s) === 'wiki') ? 'community' : 'unverified';
      e.status[lang] = to;
      e.notes = addNote(e.notes, AUDIT_NOTE(lang, to));
      changes.push({ term, lang, to });
    }
  }
  return changes;
}
function findKey(obj, term) {
  if (!obj) return undefined;
  const l = term.toLowerCase();
  return Object.keys(obj).find((k) => k.toLowerCase() === l);
}

/** Merges the per-language reviews into the glossary (in place). Returns per-language stats. */
export function mergeReviews(glossary, reviews) {
  const byLower = new Map(Object.keys(glossary).map((k) => [k.toLowerCase(), k]));
  const stats = {};
  for (const lang of LANGS) {
    const review = reviews[lang];
    if (!review) continue;
    let changed = 0, added = 0;
    for (const [term, r] of Object.entries(review)) {
      const key = byLower.get(term.toLowerCase()) ?? term;
      if (!glossary[key]) {
        glossary[key] = { status: {}, notes: '', sources: [] };
        byLower.set(key.toLowerCase(), key);
        added++;
      }
      const e = glossary[key];
      e.status ??= {};
      if (r[lang] && r[lang] !== e[lang]) changed++;
      if (r[lang]) e[lang] = r[lang];
      if (r.status) e.status[lang] = r.status;
      if (r.notes) e.notes = addNote(e.notes, `[${lang}] ${r.notes}`);
      if (r.sources?.length) e.sources = [...new Set([...(e.sources ?? []), ...r.sources])];
    }
    stats[lang] = { reviewed: Object.keys(review).length, changed, added };
  }
  return stats;
}

/** Removes duplicated note segments and sources everywhere (in place). */
export function normalize(glossary) {
  for (const e of Object.values(glossary)) {
    e.notes = dedupeNotes(e.notes);
    e.sources = [...new Set(e.sources ?? [])];
  }
}

/** Full pipeline on in-memory objects: merge → normalize → audit. */
export function run(glossary, reviews) {
  const stats = mergeReviews(glossary, reviews);
  normalize(glossary);
  const downgrades = auditOfficial(glossary, reviews);
  return { stats, downgrades };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const gPath = join(ROOT, 'content/glossary.json');
  const quiet = process.argv.includes('--quiet');
  const glossary = JSON.parse(readFileSync(gPath, 'utf8'));
  const reviews = {};
  for (const lang of LANGS) {
    const rPath = join(ROOT, `content/${lang}/glossary-review.json`);
    if (existsSync(rPath)) reviews[lang] = JSON.parse(readFileSync(rPath, 'utf8'));
    else console.warn(`${lang}: no review`);
  }
  const before = readFileSync(gPath, 'utf8');
  const orig = JSON.parse(before);
  const { downgrades } = run(glossary, reviews);
  // Report against the file on disk (a review saying "official" that the audit keeps downgraded is
  // not a change), so a second run reports nothing.
  for (const lang of LANGS) {
    const forms = [], statuses = [];
    for (const [term, e] of Object.entries(glossary)) {
      const o = orig[term] ?? { status: {} };
      if ((o[lang] ?? '') !== (e[lang] ?? '')) forms.push(`  ${lang} "${term}": ${o[lang] ?? '—'} → ${e[lang]}`);
      if ((o.status?.[lang] ?? '') !== (e.status?.[lang] ?? '')) statuses.push(`  ${lang} "${term}": ${o.status?.[lang] ?? '—'} → ${e.status?.[lang]}`);
    }
    const kept = downgrades.filter((d) => d.lang === lang).length;
    console.log(`${lang}: ${forms.length} form change(s), ${statuses.length} status change(s); ${kept} review "official" held back by the audit (no edition source)`);
    if (!quiet) for (const l of [...forms, ...statuses]) console.log(l);
  }
  const after = JSON.stringify(glossary, null, 2) + '\n';
  if (after !== before) writeFileSync(gPath, after);
  console.log(after === before ? 'glossary unchanged' : 'glossary written');
}
