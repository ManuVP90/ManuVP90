// localStorage wrapper that never throws. If storage is unavailable (private mode,
// blocked cookies, quota) values live in memory for the session only.
const PREFIX = 'cosmere-trivia:';
const memory = new Map();
let usable = null;

export function storageAvailable() {
  if (usable !== null) return usable;
  try {
    const k = `${PREFIX}__probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    usable = true;
  } catch {
    usable = false;
  }
  return usable;
}

export function load(key, fallback = null) {
  let raw = null;
  try {
    raw = storageAvailable() ? window.localStorage.getItem(PREFIX + key) : null;
  } catch { /* ignore */ }
  if (raw == null) raw = memory.has(key) ? memory.get(key) : null;
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function save(key, value) {
  let raw;
  try { raw = JSON.stringify(value); } catch { return; }
  memory.set(key, raw);
  try { if (storageAvailable()) window.localStorage.setItem(PREFIX + key, raw); } catch { /* quota etc. */ }
}

export function remove(key) {
  memory.delete(key);
  try { if (storageAvailable()) window.localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

export function clearAll() {
  memory.clear();
  try {
    if (!storageAvailable()) return;
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
}
