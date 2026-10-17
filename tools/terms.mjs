#!/usr/bin/env node
// Lists question `terms` missing from content/glossary.json (case-insensitive).
// Usage: node tools/terms.mjs [--json]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gPath = join(ROOT, 'content/glossary.json');
const glossary = existsSync(gPath) ? JSON.parse(readFileSync(gPath, 'utf8')) : {};
const known = new Set(Object.keys(glossary).map((k) => k.toLowerCase()));

const missing = new Map(); // term -> [ids]
const dir = join(ROOT, 'content/en');
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  for (const q of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
    for (const t of q.terms ?? []) {
      if (known.has(t.toLowerCase())) continue;
      if (!missing.has(t)) missing.set(t, []);
      missing.get(t).push(q.id);
    }
  }
}
const sorted = [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(sorted), null, 1));
else {
  for (const [t, ids] of sorted) console.log(`${t}\t${ids.join(',')}`);
  console.error(`${sorted.length} missing term(s)`);
}
