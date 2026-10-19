// Text helpers that respect user-perceived characters (grapheme clusters), so names that
// start with an emoji, a flag or a family sequence are never cut in half.
let segmenter = null;
try { segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch { /* old browser */ }

/** Splits a string into grapheme clusters (code points as a fallback). */
export function graphemes(str) {
  const s = String(str ?? '');
  if (segmenter) return Array.from(segmenter.segment(s), (x) => x.segment);
  return Array.from(s);
}

/** Initial for an avatar: the first grapheme, upper-cased when it is a letter. */
export function initialOf(name, fallback = '?') {
  const first = graphemes(String(name ?? '').trim())[0];
  return first ? first.toLocaleUpperCase() : fallback;
}

/** Removes lone surrogates (e.g. left by a maxlength cut) and caps the length in graphemes. */
export function cleanName(name, max = 24) {
  const s = String(name ?? '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return graphemes(s.trim()).slice(0, max).join('').trim();
}
