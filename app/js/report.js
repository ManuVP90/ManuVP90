// Pure helper for "Report this question": builds the prefilled GitHub issue (no DOM).
import { REPORT_URL, REPORT_TEMPLATE } from './config.js';

/** Longest URL we open: GitHub and browsers handle ~8 KB; stay well below. */
export const REPORT_MAX_URL = 6000;

/** Cuts `s` to at most `max` characters (code points, never half an emoji), with an ellipsis. */
export function clip(s, max) {
  const chars = Array.from(String(s ?? '').replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/**
 * The issue for question `q` ({ id, c, d, q, o, x }; o[0] is the correct answer).
 * `labels` holds the localized lines ({ describe }) so the reporter sees their own language.
 * Returns { title, body, url, text } where `text` is the plain report (title + body) to copy
 * when offline. The URL never exceeds REPORT_MAX_URL: the explanation is shortened first,
 * then dropped, then the question and options are shortened.
 */
export function buildReport(q, { lang = 'en', version = '', mode = '', labels = {} } = {}) {
  const id = clip(q?.id || '?', 64);
  const title = clip(`[${id}] ${q?.q || ''}`, 120);
  const make = (qMax, oMax, xMax) => {
    const opts = (Array.isArray(q?.o) ? q.o : []).map((o, i) => `- ${i === 0 ? '✅' : '❌'} ${clip(o, oMax)}`);
    const lines = [
      `**ID:** ${id}`,
      `**Idioma / Language:** ${lang}`,
      q?.c ? `**Mundo / World:** ${q.c} · **Dificultad / Difficulty:** ${q.d ?? '?'}` : null,
      mode ? `**Modo / Mode:** ${mode}` : null,
      `**Versión / Version:** ${version}`,
      '',
      `**Pregunta / Question:** ${clip(q?.q, qMax)}`,
      '',
      ...opts,
      xMax > 0 && q?.x ? `\n**Explicación / Explanation:** ${clip(q.x, xMax)}` : null,
      '',
      `**${labels.describe || 'What is wrong?'}**`,
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
  if (url(body).length > REPORT_MAX_URL) body = `**ID:** ${id}\n**Idioma / Language:** ${lang}\n**Versión / Version:** ${version}`;
  return { title, body, url: url(body), text: `${title}\n\n${make(2000, 500, 2000)}` };
}
