// "Review mistakes" list (end of a quick or classic game) and the "Report this question" link.
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, num, getLang } from '../i18n.js';
import { app, catStyle, catPill, toast } from '../core.js';
import { APP_VERSION } from '../config.js';
import { buildReport } from '../report.js';

/** Copies `text` to the clipboard; resolves true on success (Clipboard API, then a textarea fallback). */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* permission denied or insecure context: try the old way */ }
  try {
    const ta = h('textarea', { class: 'sr-only', readonly: true, 'aria-hidden': 'true' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Discreet link that opens a prefilled GitHub issue for question `q`. Offline, the report is
 * copied to the clipboard instead (and the player is told), so it can be sent later.
 */
export function reportLink(q, mode = '') {
  const lang = app.questionsLang || getLang();
  const rep = buildReport(q, { lang, version: APP_VERSION, mode, labels: { describe: t('report.describe') } });
  return h('a', {
    class: 'report-link', href: rep.url, target: '_blank', rel: 'noopener noreferrer',
    onclick: async (e) => {
      if (navigator.onLine !== false) return; // online: the link opens the issue form
      e.preventDefault();
      toast((await copyText(rep.text)) ? t('report.offlineCopied') : t('report.offlineFailed'));
    },
  }, svg(ICONS.flag), h('span', {}, t('report.link')));
}

/** One missed question: category, text, right answer and explanation. */
function reviewItem(q, mode) {
  return h('li', { class: 'review-item', ...catStyle(q.c) },
    h('div', { class: 'review-head' }, catPill(q.c)),
    h('p', { class: 'review-q' }, q.q),
    h('p', { class: 'review-a' }, svg(ICONS.check), h('span', {}, t('review.answer', { answer: q.o[0] }))),
    q.x ? h('p', { class: 'review-x' }, q.x) : null,
    reportLink(q, mode));
}

/**
 * Collapsible "Review mistakes (n)" section for the ids missed in a game. Ids that no longer
 * exist in the loaded data are skipped. With no misses it says so.
 */
export function reviewSection(ids, mode = '') {
  const qs = [...new Set(ids)].map((id) => app.questions.find((q) => q.id === id)).filter(Boolean);
  if (!qs.length) {
    return h('p', { class: 'review-none muted' }, svg(ICONS.check), h('span', {}, t('review.none')));
  }
  return h('details', { class: 'card review' },
    h('summary', { class: 'review-summary' },
      svg(ICONS.book), h('span', { class: 'review-title' }, t('review.title', { n: num(qs.length) })),
      svg(ICONS.chevron, 'review-chevron')),
    h('p', { class: 'muted review-hint' }, t('review.hint')),
    h('ol', { class: 'review-list' }, qs.map((q) => reviewItem(q, mode))));
}
