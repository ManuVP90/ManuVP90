#!/usr/bin/env node
// Lists English question ids that are new or changed since a git revision, per category.
// Translators use it to know what to (re)translate.  Usage: node tools/changed-ids.mjs <rev>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
if (!rev) { console.error('usage: node tools/changed-ids.mjs <git-rev>'); process.exit(2); }
const FIELDS = ['q', 'a', 'wrong', 'explain'];
const out = {};
for (const cat of ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere']) {
  const now = JSON.parse(readFileSync(join(ROOT, 'content/en', `${cat}.json`), 'utf8'));
  let old = [];
  try { old = JSON.parse(execFileSync('git', ['show', `${rev}:content/en/${cat}.json`], { cwd: ROOT, encoding: 'utf8' })); } catch {}
  const byId = new Map(old.map((q) => [q.id, q]));
  out[cat] = {
    new: now.filter((q) => !byId.has(q.id)).map((q) => q.id),
    changed: now.filter((q) => byId.has(q.id) && FIELDS.some((f) => JSON.stringify(q[f]) !== JSON.stringify(byId.get(q.id)[f]))).map((q) => q.id),
  };
}
console.log(JSON.stringify(out, null, 1));
