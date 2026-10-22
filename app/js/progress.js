// Pure helpers for the player's progress (no DOM, no storage): the missed-questions list and
// the export / import code. Imported by core.js and by the unit tests.
import { MISSED_MAX } from './config.js';

// ---------- id lists (missed questions, recently seen) ----------
const isId = (x) => typeof x === 'string' && x.length > 0 && x.length <= 64;

/** A clean list of unique question ids (most recent last), at most `max` long. Anything else → []. */
export function cleanIds(list, max = MISSED_MAX) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  // Walk from the end so the most recent occurrence of a duplicate wins.
  for (let i = list.length - 1; i >= 0 && out.length < max; i--) {
    const id = list[i];
    if (!isId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.reverse();
}

/** `list` with `id` added as the most recent entry (moved if already there), capped at `max`. */
export function addId(list, id, max = MISSED_MAX) {
  if (!isId(id)) return cleanIds(list, max);
  return cleanIds([...cleanIds(list, max).filter((x) => x !== id), id], max);
}

/** `list` without `id`. */
export function removeId(list, id) {
  return cleanIds(list, Number.MAX_SAFE_INTEGER).filter((x) => x !== id);
}

/** Per-language map of id lists ({ es: [...], en: [...] }) with every list cleaned; unknown languages dropped. */
export function cleanIdMap(map, langs, max = MISSED_MAX) {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const l of langs) {
    const ids = cleanIds(map[l], max);
    if (ids.length) out[l] = ids;
  }
  return out;
}

/**
 * `base` with the ids of `extra` added per language (ids already in `base` keep their place),
 * every list cleaned and capped at `max`. Used once to seed the collection from the recently-seen
 * ring of players from before 1.6.0 (beta 5: the ring itself is no longer merged).
 */
export function mergeIdMaps(base, extra, langs, max = MISSED_MAX) {
  const a = cleanIdMap(base, langs, max);
  const b = cleanIdMap(extra, langs, max);
  const out = {};
  for (const l of langs) {
    const own = a[l] || [];
    const have = new Set(own);
    const ids = cleanIds([...(b[l] || []).filter((id) => !have.has(id)), ...own], max);
    if (ids.length) out[l] = ids;
  }
  return out;
}

// ---------- export / import code ----------
// Code = "CT1." + base64url(JSON) or, when the browser can compress, "CT1z." + base64url(deflate-raw(JSON)).
// JSON = { app: 'cosmere-trivia', v: 1, d: <data>, c: <checksum of JSON.stringify(d)> }.
export const BACKUP_APP = 'cosmere-trivia';
export const BACKUP_VERSION = 1;
const MAX_CODE_LENGTH = 200000; // far above any real backup; guards against pasting a novel

/** FNV-1a 32-bit hash of a string, as 8 hex digits. */
export function checksum(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, Stream, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** Turns `data` (plain JSON-able object) into a copyable code. */
export async function encodeBackup(data, { compress = true } = {}) {
  const payload = JSON.stringify({ app: BACKUP_APP, v: BACKUP_VERSION, d: data, c: checksum(JSON.stringify(data)) });
  const bytes = new TextEncoder().encode(payload);
  if (compress && canCompress()) {
    try { return `CT1z.${toBase64Url(await pipe(bytes, CompressionStream, 'deflate-raw'))}`; } catch { /* fall back to plain */ }
  }
  return `CT1.${toBase64Url(bytes)}`;
}

/**
 * Reads a code made by encodeBackup. Never throws: returns { ok: true, data } or
 * { ok: false, error } with error one of 'empty', 'format', 'checksum', 'version', 'unsupported'.
 */
export async function decodeBackup(code) {
  const s = String(code ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'empty' };
  if (s.length > MAX_CODE_LENGTH) return { ok: false, error: 'format' };
  const m = /^CT(\d+)(z?)\.([A-Za-z0-9_-]+)$/.exec(s);
  if (!m) return { ok: false, error: 'format' };
  if (m[1] !== '1') return { ok: false, error: 'version' };
  let payload;
  try {
    let bytes = fromBase64Url(m[3]);
    if (m[2]) {
      if (!canCompress()) return { ok: false, error: 'unsupported' };
      bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
    }
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'format' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.app !== BACKUP_APP) return { ok: false, error: 'format' };
  if (payload.v !== BACKUP_VERSION) return { ok: false, error: 'version' };
  const d = payload.d;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
  if (typeof payload.c !== 'string' || payload.c !== checksum(JSON.stringify(d))) return { ok: false, error: 'checksum' };
  return { ok: true, data: d };
}
