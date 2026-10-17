#!/usr/bin/env node
// Terminology consistency report: for each translated question, flags glossary terms whose
// English form leaks into the translation, or whose localized form seems absent.
// Heuristic (inflection makes exact matching impossible); review flagged items by hand.
// Usage: node tools/check-terms.mjs [lang...]
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATS = ['roshar', 'scadrial', 'sel', 'nalthis', 'otros', 'cosmere'];
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['es', 'fr', 'de', 'it'];
const glossary = JSON.parse(readFileSync(join(ROOT, 'content/glossary.json'), 'utf8'));
const gl = new Map(Object.entries(glossary).map(([k, v]) => [k.toLowerCase(), v]));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
const text = (q) => norm([q.q, q.a, ...q.wrong, q.explain].join(' \u0001 '));
const stem = (w) => w.slice(0, Math.max(4, Math.min(w.length - 2, 7)));

for (const lang of langs) {
  let leaks = 0, absent = 0;
  for (const cat of CATS) {
    const en = JSON.parse(readFileSync(join(ROOT, 'content/en', `${cat}.json`), 'utf8'));
    const tr = new Map(JSON.parse(readFileSync(join(ROOT, `content/${lang}`, `${cat}.json`), 'utf8')).map((t) => [t.id, t]));
    for (const q of en) {
      const t = tr.get(q.id);
      if (!t) continue;
      const body = text(t);
      for (const term of q.terms) {
        const e = gl.get(term.toLowerCase());
        const loc = e?.[lang];
        if (!loc || norm(loc) === norm(term)) continue;
        const words = norm(loc).split(/[\s'-]+/).filter((w) => w.length > 3);
        const found = words.length === 0 || words.some((w) => body.includes(stem(w)));
        const enLeak = new RegExp(`\\b${norm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(body);
        if (enLeak && !found) { leaks++; console.log(`${lang} ${q.id} LEAK  "${term}" → expected "${loc}" (${e.status?.[lang]})`); }
        else if (!found) { absent++; console.log(`${lang} ${q.id} ABSENT "${term}" → "${loc}" (${e.status?.[lang]})`); }
      }
    }
  }
  console.error(`${lang}: ${leaks} leak(s), ${absent} possibly absent`);
}
