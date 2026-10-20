#!/usr/bin/env node
// Native-reviewer kit: writes docs/verification/<lang>.md (es, fr, de, it) with the glossary terms
// used in the questions whose status for that language is not `official` / `unchanged` (or that
// have no glossary entry / no form for that language), sorted by how many questions use them,
// in batches of 20. Each row: English term, current form, status, nº of questions, example
// question ids, sources, and a checkbox column for the reviewer.
// Usage: node tools/verification-list.mjs [lang...]   (default: es fr de it)
//        node tools/verification-list.mjs --stdout es  (print instead of writing)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const toStdout = args.includes('--stdout');
const langs = args.filter((a) => !a.startsWith('--'));
const LANGS = langs.length ? langs : ['es', 'fr', 'de', 'it'];
const BATCH = 20;
const OK = new Set(['official', 'unchanged']);

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const glossary = readJson(join(ROOT, 'content/glossary.json'), {});
const byLower = new Map(Object.entries(glossary).map(([k, v]) => [k.toLowerCase(), [k, v]]));

// term (glossary key, or as written in the question) -> question ids
const usage = new Map();
const enDir = join(ROOT, 'content/en');
const questions = [];
for (const f of readdirSync(enDir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
  for (const q of readJson(join(enDir, f), [])) {
    questions.push(q);
    for (const t of new Set((q.terms ?? []).map((x) => byLower.get(x.toLowerCase())?.[0] ?? x))) {
      if (!usage.has(t)) usage.set(t, []);
      usage.get(t).push(q.id);
    }
  }
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Up to 3 sources, preferring the ones that look specific to `lang`. */
function pickSources(list, lang) {
  const src = [...new Set((list ?? []).map(String))];
  const mine = (s) => new RegExp(`(//${lang}\\.|\\.${lang}/|/${lang}/|\\[${lang}\\]|^${lang}[.:]|${lang}\\.coppermind)`, 'i').test(s);
  const sorted = [...src.filter(mine), ...src.filter((s) => !mine(s))];
  const out = new Map(); // dedupe key -> rendered cell text
  for (const s of sorted) {
    if (out.size >= 3) break;
    const url = s.match(/https?:\/\/\S+/)?.[0];
    if (!url) { out.set(s, esc(s.length > 80 ? `${s.slice(0, 77)}…` : s)); continue; }
    const clean = url.replace(/[).,;»"]+$/, '');
    if (out.has(clean)) continue;
    let host = clean;
    try { host = new URL(clean).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
    out.set(clean, `[${esc(host)}](${clean.replace(/\|/g, '%7C').replace(/\)/g, '%29')})`);
  }
  return [...out.values()].join('<br>') || '—';
}

const INTRO = {
  es: 'Comprueba cada término con tu edición en español (Nova / B de Bolsillo). Marca **confirmado** si la forma actual es la de la edición publicada, o escribe la forma correcta en **corregir a** (con libro y capítulo o página si puedes).',
  fr: 'Vérifiez chaque terme dans votre édition française (Le Livre de Poche / Orbit). Cochez **confirmado** si la forme actuelle est celle de l’édition publiée, sinon écrivez la bonne forme après **corregir a** (avec le livre et le chapitre ou la page si possible).',
  de: 'Bitte prüfe jeden Begriff anhand deiner deutschen Ausgabe (Heyne / Piper). Kreuze **confirmado** an, wenn die aktuelle Form der veröffentlichten Ausgabe entspricht, sonst trage die richtige Form bei **corregir a** ein (wenn möglich mit Buch und Kapitel oder Seite).',
  it: 'Controlla ogni termine con la tua edizione italiana (Mondadori / Fanucci). Segna **confirmado** se la forma attuale è quella dell’edizione pubblicata, altrimenti scrivi la forma corretta dopo **corregir a** (con libro e capitolo o pagina se puoi).',
};
const NAME = { es: 'español', fr: 'francés', de: 'alemán', it: 'italiano' };
const STATUS_ORDER = ['missing', 'no-entry', 'unverified', 'community', 'unpublished'];

function build(lang) {
  const review = readJson(join(ROOT, `content/${lang}/glossary-review.json`), {});
  const rows = [];
  for (const [term, ids] of usage) {
    const entry = glossary[term];
    const rev = review[term];
    let form = entry?.[lang];
    let status = entry?.status?.[lang];
    let sources = entry?.sources;
    if (!entry) status = 'no-entry';
    else if (!status || !form) status = 'missing';
    if ((status === 'missing' || status === 'no-entry') && rev?.[lang]) {
      form = rev[lang];
      sources = rev.sources;
      status = `${status} (revisión: ${rev.status ?? '?'})`;
    }
    if (OK.has(status)) continue;
    rows.push({ term, form: form || '—', status, n: ids.length, ids, sources });
  }
  rows.sort((a, b) => b.n - a.n || a.term.localeCompare(b.term));

  const counts = {};
  for (const r of rows) { const k = r.status.split(' ')[0]; counts[k] = (counts[k] || 0) + 1; }
  const touched = new Set(rows.flatMap((r) => r.ids));
  const lines = [];
  lines.push(`# Verificación de términos — ${NAME[lang] ?? lang} (\`${lang}\`)`);
  lines.push('');
  lines.push(`> Generado por \`node tools/verification-list.mjs\` a partir de \`content/glossary.json\` y \`content/en/*.json\`. No lo edites a mano para cambiar términos: anota aquí y luego se pasa al glosario (ver [CONTRIBUTING.md](../CONTRIBUTING.md#revisar-términos)).`);
  lines.push('');
  lines.push(INTRO[lang] ?? INTRO.es);
  lines.push('');
  lines.push(`**${rows.length} términos** por verificar, usados en **${touched.size} de ${questions.length} preguntas**. `
    + `Por estado: ${STATUS_ORDER.filter((s) => counts[s]).map((s) => `\`${s}\` ${counts[s]}`).join(' · ')}. `
    + `Ordenados por número de preguntas que los usan, en lotes de ${BATCH}: el lote 1 es el que más preguntas arregla.`);
  lines.push('');
  lines.push('Estados: `unverified` = sin comprobar con la edición publicada · `community` = sin traducción oficial conocida, se usa la de la comunidad · `unpublished` = la obra no está publicada en este idioma · `missing` = el glosario no tiene forma o estado para este idioma · `no-entry` = el término no está en el glosario.');
  lines.push('');
  const batches = Math.ceil(rows.length / BATCH);
  if (batches > 1) {
    lines.push('Lotes: ' + Array.from({ length: batches }, (_, i) => `[${i + 1}](#lote-${i + 1})`).join(' · '));
    lines.push('');
  }
  for (let b = 0; b < batches; b++) {
    const slice = rows.slice(b * BATCH, (b + 1) * BATCH);
    lines.push(`## Lote ${b + 1}`);
    lines.push('');
    lines.push(`Términos ${b * BATCH + 1}–${b * BATCH + slice.length}. Revisor/a: ________ · Fecha: ________`);
    lines.push('');
    lines.push('| # | Inglés | Forma actual | Estado | Nº preg. | Ejemplos | Fuentes | Revisión |');
    lines.push('|---|---|---|---|---|---|---|---|');
    slice.forEach((r, i) => {
      const ex = r.ids.slice(0, 3).map((id) => `\`${id}\``).join(' ') + (r.ids.length > 3 ? ' …' : '');
      lines.push(`| ${b * BATCH + i + 1} | ${esc(r.term)} | ${esc(r.form)} | ${esc(r.status)} | ${r.n} | ${ex} | ${pickSources(r.sources, lang)} | ☐ confirmado<br>☐ corregir a: ______ |`);
    });
    lines.push('');
  }
  if (!rows.length) lines.push('Nada pendiente: todos los términos usados están `official` o `unchanged`.\n');
  return { text: lines.join('\n'), rows, touched };
}

for (const lang of LANGS) {
  const { text, rows, touched } = build(lang);
  if (toStdout) { console.log(text); continue; }
  mkdirSync(join(ROOT, 'docs/verification'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/verification', `${lang}.md`), text);
  console.log(`docs/verification/${lang}.md: ${rows.length} term(s), ${Math.ceil(rows.length / BATCH)} batch(es), ${touched.size} question(s) affected`);
}
