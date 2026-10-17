#!/usr/bin/env node
// Merges content/<lang>/glossary-review.json into content/glossary.json.
// The per-language review (made by that language's translator) wins over the first pass.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gPath = join(ROOT, 'content/glossary.json');
const glossary = JSON.parse(readFileSync(gPath, 'utf8'));
const byLower = new Map(Object.keys(glossary).map((k) => [k.toLowerCase(), k]));

for (const lang of ['es', 'fr', 'de', 'it']) {
  const rPath = join(ROOT, `content/${lang}/glossary-review.json`);
  if (!existsSync(rPath)) { console.warn(`${lang}: no review`); continue; }
  const review = JSON.parse(readFileSync(rPath, 'utf8'));
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
    if (r.notes) e.notes = [e.notes, `[${lang}] ${r.notes}`].filter(Boolean).join(' ');
    if (r.sources?.length) e.sources = [...new Set([...(e.sources ?? []), ...r.sources])];
  }
  console.log(`${lang}: ${Object.keys(review).length} reviewed, ${changed} changed, ${added} added`);
}
writeFileSync(gPath, JSON.stringify(glossary, null, 2) + '\n');
