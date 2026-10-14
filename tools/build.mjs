#!/usr/bin/env node
// Validates content/ and generates app/data/questions.<lang>.json.
// Usage: node tools/build.mjs [--check]   (--check: validate only, write nothing)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'es', 'fr', 'de', 'it'];
const CATEGORIES = ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere'];
const WORKS = [
  'elantris', 'hope-of-elantris', 'emperors-soul',
  'final-empire', 'well-of-ascension', 'hero-of-ages', 'eleventh-metal', 'allomancer-jak',
  'alloy-of-law', 'shadows-of-self', 'bands-of-mourning', 'lost-metal', 'secret-history', 'mistborn-misc',
  'way-of-kings', 'words-of-radiance', 'edgedancer', 'oathbringer', 'dawnshard', 'rhythm-of-war', 'wind-and-truth',
  'warbreaker', 'white-sand', 'shadows-for-silence', 'sixth-of-the-dusk',
  'tress', 'yumi', 'sunlit-man', 'emberdark', 'arcanum', 'wob',
];
const checkOnly = process.argv.includes('--check');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

function load(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { err(`${path}: invalid JSON (${e.message})`); return null; }
}

function checkText(where, item) {
  if (!nonEmpty(item.q)) err(`${where}: missing q`);
  if (!nonEmpty(item.a)) err(`${where}: missing a`);
  if (!Array.isArray(item.wrong) || item.wrong.length !== 3 || !item.wrong.every(nonEmpty)) {
    err(`${where}: wrong must be 3 non-empty strings`);
  } else {
    const all = [item.a, ...item.wrong].map((s) => s.trim().toLowerCase());
    if (new Set(all).size !== 4) err(`${where}: options are not unique`);
  }
  if (!nonEmpty(item.explain)) err(`${where}: missing explain`);
}

const output = Object.fromEntries(LANGS.map((l) => [l, []]));
const stats = {};

for (const cat of CATEGORIES) {
  const enPath = join(ROOT, 'content/en', `${cat}.json`);
  const en = load(enPath);
  if (!en) { warn(`content/en/${cat}.json: missing`); continue; }
  const ids = new Set();
  stats[cat] = { total: en.length, d1: 0, d2: 0, d3: 0 };
  for (const [i, item] of en.entries()) {
    const where = `en/${cat}[${i}] ${item.id ?? '?'}`;
    if (!/^[a-z]+-\d{3}$/.test(item.id ?? '') || !item.id.startsWith(`${cat}-`)) err(`${where}: bad id`);
    if (ids.has(item.id)) err(`${where}: duplicate id`);
    ids.add(item.id);
    if (item.category !== cat) err(`${where}: category must be ${cat}`);
    if (![1, 2, 3].includes(item.difficulty)) err(`${where}: difficulty must be 1-3`);
    else stats[cat][`d${item.difficulty}`]++;
    if (!WORKS.includes(item.work)) err(`${where}: unknown work "${item.work}"`);
    if (!Array.isArray(item.terms)) err(`${where}: terms must be an array`);
    checkText(where, item);
  }

  for (const lang of LANGS) {
    let tr = en;
    if (lang !== 'en') {
      tr = load(join(ROOT, `content/${lang}`, `${cat}.json`));
      if (!tr) { warn(`content/${lang}/${cat}.json: missing (lang skipped for this category)`); continue; }
      const byId = new Map(tr.map((t) => [t.id, t]));
      for (const id of ids) if (!byId.has(id)) err(`${lang}/${cat}: missing translation for ${id}`);
      for (const t of tr) if (!ids.has(t.id)) err(`${lang}/${cat}: unknown id ${t.id}`);
      tr = en.map((e) => ({ ...e, ...byId.get(e.id) }));
      for (const t of tr) if (byId.has(t.id)) checkText(`${lang}/${cat} ${t.id}`, t);
    }
    for (const t of tr) {
      output[lang].push({
        id: t.id, c: t.category, d: t.difficulty, w: t.work,
        q: t.q, o: [t.a, ...t.wrong], x: t.explain,
      });
    }
  }
}

// Glossary sanity
const glossary = load(join(ROOT, 'content/glossary.json'));
if (glossary) {
  for (const [term, entry] of Object.entries(glossary)) {
    for (const lang of LANGS.filter((l) => l !== 'en')) {
      if (!nonEmpty(entry[lang])) warn(`glossary "${term}": missing ${lang}`);
    }
  }
} else warn('content/glossary.json: missing');

for (const w of warnings) console.warn('WARN', w);
for (const e of errors) console.error('ERROR', e);
console.table(stats);
for (const lang of LANGS) console.log(`${lang}: ${output[lang].length} questions`);

if (errors.length) { console.error(`\n${errors.length} error(s)`); process.exit(1); }
if (!checkOnly) {
  mkdirSync(join(ROOT, 'app/data'), { recursive: true });
  for (const lang of LANGS) {
    writeFileSync(join(ROOT, 'app/data', `questions.${lang}.json`), JSON.stringify(output[lang]));
  }
  console.log('Wrote app/data/questions.<lang>.json');
}
