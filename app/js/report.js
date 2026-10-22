// Pure helper for "Report this question": builds the prefilled GitHub issue (no DOM).
import { REPORT_URL, REPORT_TEMPLATE } from './config.js';

/** Longest URL we open: GitHub and browsers handle ~8 KB; stay well below. */
export const REPORT_MAX_URL = 6000;

/** Cuts `s` to at most `max` characters (code points, never half an emoji), with an ellipsis. */
export function clip(s, max) {
  const chars = Array.from(String(s ?? '').replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/** English field names, used for any label the caller doesn't pass. */
export const REPORT_LABELS = {
  id: 'ID', language: 'Language', world: 'World', difficulty: 'Difficulty', mode: 'Mode', version: 'Version',
  question: 'Question', explanation: 'Explanation', describe: 'What is wrong?',
};

/**
 * The issue for question `q` ({ id, c, d, q, o, x }; o[0] is the correct answer).
 * `labels` holds the localized field names (see REPORT_LABELS), `worldName` / `modeName` and `format`
 * (a "{label}: {text}" template for the language's colon), so the
 * whole body is in the reporter's language (beta 4: no Spanish/English mix).
 * Returns { title, body, url, text } where `text` is the plain report (title + body) to copy
 * ("Copy report", or the link when offline). The URL never exceeds REPORT_MAX_URL: the
 * explanation is shortened first, then dropped, then the question and options are shortened.
 */
export function buildReport(q, { lang = 'en', version = '', mode = '', labels = {} } = {}) {
  const L = { ...REPORT_LABELS, ...Object.fromEntries(Object.entries(labels).filter(([k, v]) => k !== 'format' && typeof v === 'string' && v)) };
  const id = clip(q?.id || '?', 64);
  const title = clip(`[${id}] ${q?.q || ''}`, 120);
  // "Label:" in the language's typography (French puts a no-break space before the colon), from
  // a "{label}: {text}" template (i18n common.labelled).
  const head = (labels.format || '{label}: {text}').split('{text}')[0].trimEnd();
  const field = (name, value) => `**${head.replace('{label}', L[name])}** ${value}`;
  const make = (qMax, oMax, xMax) => {
    const opts = (Array.isArray(q?.o) ? q.o : []).map((o, i) => `- ${i === 0 ? '✅' : '❌'} ${clip(o, oMax)}`);
    const lines = [
      field('id', id),
      field('language', lang),
      q?.c ? `${field('world', L.worldName || q.c)} · ${field('difficulty', q.d ?? '?')}` : null,
      mode ? field('mode', L.modeName || mode) : null,
      field('version', version),
      '',
      field('question', clip(q?.q, qMax)),
      '',
      ...opts,
      xMax > 0 && q?.x ? `\n${field('explanation', clip(q.x, xMax))}` : null,
      '',
      `**${L.describe}**`,
      '',
    ].filter((l) => l !== null);
    return lines.join('\n');
  };
  const url = (body) => `${REPORT_URL}?template=${encodeURIComponent(REPORT_TEMPLATE)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  // Progressively shorter versions until the URL fits.
  const tries = [[600, 200, 800], [600, 200, 300], [600, 200, 0], [300, 120, 0], [160, 60, 0], [80, 30, 0]];
  let body = '';
  for (const [qm, om, xm] of tries) {
    body = make(qm, om, xm);
    if (url(body).length <= REPORT_MAX_URL) break;
  }
  if (url(body).length > REPORT_MAX_URL) body = [field('id', id), field('language', lang), field('version', version)].join('\n');
  return { title, body, url: url(body), text: `${title}\n\n${make(2000, 500, 2000)}` };
}
