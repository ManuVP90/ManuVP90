#!/usr/bin/env node
// Fast static checks of the PWA shell (no browser). Exit code 1 on any failure.
// Usage: node tools/check-app.mjs [--base <git ref>]   (--base or CHECK_BASE: also require a CACHE_VERSION bump
//        when shell files under app/ changed since that ref)
//  - every .js under app/js is precached (SHELL in app/sw.js) and every SHELL entry exists
//  - CACHE_VERSION is present in app/sw.js
//  - the 5 app/i18n/<lang>.json files have identical key sets and the same {placeholders} per key
//  - manifest icons exist
//  - WORK_TITLES (app/js/works.js) has a non-empty title for every work id in every language
//  - (warning only) the work ids of works.js match the ones tools/build.mjs accepts
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as childProcess from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const LANGS = ['es', 'en', 'fr', 'de', 'it'];

const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const passed = [];
function check(name, fn) {
  const before = failures.length;
  try { fn(); } catch (e) { fail(`${name}: ${e.message}`); }
  if (failures.length === before) passed.push(name);
}

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---------- service worker ----------
const sw = readFileSync(join(APP, 'sw.js'), 'utf8');

check('CACHE_VERSION', () => {
  const m = sw.match(/const\s+CACHE_VERSION\s*=\s*['"`]([^'"`]+)['"`]/);
  if (!m) fail('app/sw.js: CACHE_VERSION constant not found');
  else if (!m[1].trim()) fail('app/sw.js: CACHE_VERSION is empty');
  else console.log(`CACHE_VERSION = ${m[1]}`);
});

check('SHELL', () => {
  const m = sw.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/);
  if (!m) { fail('app/sw.js: SHELL array not found'); return; }
  const shell = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
  const seen = new Set();
  for (const entry of shell) {
    if (seen.has(entry)) fail(`app/sw.js SHELL: duplicate entry "${entry}"`);
    seen.add(entry);
    if (entry === './' || entry === '.') continue;
    if (!existsSync(join(APP, entry))) fail(`app/sw.js SHELL: "${entry}" does not exist under app/`);
  }
  const jsFiles = walk(join(APP, 'js')).filter((f) => f.endsWith('.js')).map((f) => relative(APP, f).split('\\').join('/'));
  for (const f of jsFiles) if (!seen.has(f)) fail(`app/sw.js SHELL: missing "${f}" (every module must be precached for offline use)`);
  for (const f of ['index.html', 'manifest.webmanifest', 'i18n/en.json']) if (!seen.has(f)) fail(`app/sw.js SHELL: missing "${f}"`);
  const css = walk(join(APP, 'css')).filter((f) => f.endsWith('.css')).map((f) => relative(APP, f).split('\\').join('/'));
  for (const f of css) if (!seen.has(f)) fail(`app/sw.js SHELL: missing "${f}"`);
  console.log(`SHELL: ${shell.length} entries, ${jsFiles.length} JS modules`);
});

// ---------- i18n ----------
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}
const placeholders = (v) => [...new Set([...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');

check('i18n', () => {
  const dicts = {};
  for (const l of LANGS) {
    const p = join(APP, 'i18n', `${l}.json`);
    if (!existsSync(p)) { fail(`app/i18n/${l}.json: missing`); continue; }
    try { dicts[l] = flatten(JSON.parse(readFileSync(p, 'utf8'))); } catch (e) { fail(`app/i18n/${l}.json: invalid JSON (${e.message})`); }
  }
  const ref = dicts.en;
  if (!ref) return;
  for (const l of LANGS.filter((x) => x !== 'en' && dicts[x])) {
    const d = dicts[l];
    for (const k of ref.keys()) if (!d.has(k)) fail(`app/i18n/${l}.json: missing key "${k}"`);
    for (const k of d.keys()) if (!ref.has(k)) fail(`app/i18n/${l}.json: extra key "${k}" (not in en.json)`);
    for (const [k, v] of d) {
      if (!ref.has(k)) continue;
      if (typeof v !== typeof ref.get(k)) fail(`app/i18n/${l}.json "${k}": type ${typeof v}, en.json has ${typeof ref.get(k)}`);
      if (typeof v === 'string' && !v.trim()) fail(`app/i18n/${l}.json "${k}": empty string`);
      const a = placeholders(ref.get(k));
      const b = placeholders(v);
      if (a !== b) fail(`app/i18n/${l}.json "${k}": placeholders {${b}} differ from en.json {${a}}`);
    }
  }
  console.log(`i18n: ${ref.size} keys × ${Object.keys(dicts).length} languages`);
});

// ---------- manifest ----------
check('manifest', () => {
  const man = JSON.parse(readFileSync(join(APP, 'manifest.webmanifest'), 'utf8'));
  if (!Array.isArray(man.icons) || !man.icons.length) { fail('manifest.webmanifest: no icons'); return; }
  for (const i of man.icons) if (!existsSync(join(APP, i.src))) fail(`manifest.webmanifest: icon "${i.src}" does not exist`);
  if (!man.icons.some((i) => /maskable/.test(i.purpose || ''))) warn('manifest.webmanifest: no maskable icon');
  for (const k of ['name', 'short_name', 'start_url', 'display']) if (!man[k]) fail(`manifest.webmanifest: missing "${k}"`);
  const html = readFileSync(join(APP, 'index.html'), 'utf8');
  if (!/rel=["']manifest["']/.test(html)) fail('index.html: no <link rel="manifest">');
});

// ---------- works ----------
const works = await import(pathToFileURL(join(APP, 'js/works.js')).href);
check('WORK_TITLES', () => {
  const ids = works.ALL_WORKS;
  if (!Array.isArray(ids) || !ids.length) { fail('works.js: ALL_WORKS is empty'); return; }
  if (new Set(ids).size !== ids.length) fail('works.js: duplicate work id in WORK_GROUPS');
  for (const l of LANGS) {
    const t = works.WORK_TITLES?.[l];
    if (!t) { fail(`works.js: WORK_TITLES.${l} missing`); continue; }
    for (const id of ids) if (typeof t[id] !== 'string' || !t[id].trim()) fail(`works.js: WORK_TITLES.${l} has no title for "${id}"`);
    for (const id of Object.keys(t)) if (!ids.includes(id)) warn(`works.js: WORK_TITLES.${l} has unknown id "${id}"`);
  }
  // The content pipeline's list should match (a mismatch means a work can't be filtered or can't be used).
  const build = readFileSync(join(ROOT, 'tools/build.mjs'), 'utf8').match(/const WORKS = \[([\s\S]*?)\];/);
  if (build) {
    const b = [...build[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const id of b) if (!ids.includes(id)) warn(`tools/build.mjs accepts work "${id}" that works.js does not list (no spoiler toggle)`);
    for (const id of ids) if (!b.includes(id)) warn(`works.js lists work "${id}" that tools/build.mjs rejects`);
  }
  console.log(`works: ${ids.length} ids × ${LANGS.length} languages`);
});

// ---------- CACHE_VERSION bump (only with --base <git ref>, e.g. in CI) ----------
const baseIdx = process.argv.indexOf('--base');
const base = baseIdx > 0 ? process.argv[baseIdx + 1] : process.env.CHECK_BASE;
if (base && !/^0+$/.test(base)) {
  check('CACHE_VERSION bump', () => {
    const { execFileSync } = childProcess;
    const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    let changed;
    try { changed = git('diff', '--name-only', base, '--', 'app').split('\n').filter(Boolean); }
    catch { warn(`CACHE_VERSION bump: git ref "${base}" not available, skipped`); return; }
    // Question data is fetched at runtime (stale-while-revalidate), not part of the precached shell.
    const shellChanged = changed.filter((f) => !f.startsWith('app/data/'));
    if (!shellChanged.length) { console.log(`CACHE_VERSION bump: no shell file changed since ${base}`); return; }
    let old = null;
    try { old = git('show', `${base}:app/sw.js`).match(/const\s+CACHE_VERSION\s*=\s*['"`]([^'"`]+)['"`]/)?.[1] ?? null; } catch { /* new file */ }
    const now = sw.match(/const\s+CACHE_VERSION\s*=\s*['"`]([^'"`]+)['"`]/)?.[1];
    if (old !== null && old === now) {
      fail(`app/sw.js: ${shellChanged.length} shell file(s) changed since ${base} (${shellChanged.slice(0, 5).join(', ')}${shellChanged.length > 5 ? ', …' : ''}) but CACHE_VERSION is still "${now}"`);
    } else console.log(`CACHE_VERSION bump: ${old} → ${now} (${shellChanged.length} shell file(s) changed since ${base})`);
  });
}

for (const w of warnings) console.warn('WARN', w);
for (const f of failures) console.error('FAIL', f);
console.log(`\ncheck-app: ${passed.length} check(s) passed${failures.length ? `, ${failures.length} failure(s)` : ''}: ${passed.join(', ')}`);
process.exit(failures.length ? 1 : 0);
