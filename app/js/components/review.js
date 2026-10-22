// "Review mistakes" list (end of a quick or classic game) and the "Report this question" link.
import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, num, getLang } from '../i18n.js';
import { app, catStyle, catPill } from '../core.js';
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

const MODE_NAMES = { classic: 'home.classic', quick: 'home.quick', practice: 'home.practice', daily: 'daily.title' };

/** The report of question `q` with every field name in the UI language. */
function reportFor(q, mode) {
  const lang = app.questionsLang || getLang();
  const f = (k) => t(`report.field.${k}`);
  return buildReport(q, {
    lang, version: APP_VERSION, mode,
    labels: {
      id: f('id'), language: f('language'), world: f('world'), difficulty: f('difficulty'), mode: f('mode'),
      version: f('version'), question: f('question'), explanation: f('explanation'), describe: t('report.describe'),
      worldName: q?.c ? t(`cat.${q.c}`) : '', modeName: MODE_NAMES[mode] ? t(MODE_NAMES[mode]) : mode,
      format: t('common.labelled'),
    },
  });
}

/**
 * "Report a mistake" (opens a prefilled GitHub issue; offline it copies the report instead) and
 * "Copy report" for players without a GitHub account (lead decision 4): both discreet, side by side.
 */
export function reportLink(q, mode = '') {
  const rep = reportFor(q, mode);
  // What happened goes in a line under the two actions, not in a toast: a toast covered the
  // explanation for a few seconds (beta 5); this one stays until the next question.
  const status = h('span', { class: 'report-status', role: 'status', 'aria-live': 'polite', hidden: true });
  const say = (msg) => { status.textContent = msg; status.hidden = false; };
  const link = h('a', {
    class: 'report-link', href: rep.url, target: '_blank', rel: 'noopener noreferrer',
    onclick: async (e) => {
      if (navigator.onLine !== false) return; // online: the link opens the issue form
      e.preventDefault();
      say((await copyText(rep.text)) ? t('report.offlineCopied') : t('report.offlineFailed'));
    },
  }, svg(ICONS.flag), h('span', {}, t('report.link')));
  const copy = h('button', {
    type: 'button', class: 'report-copy',
    onclick: async () => { say((await copyText(rep.text)) ? t('report.copied') : t('report.copyFailed')); },
  }, svg(ICONS.copy), h('span', {}, t('report.copy')));
  return h('span', { class: 'report-actions' }, link, copy, status);
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
export function reviewSection(ids, mode = '', { group = false } = {}) {
  const qs = [...new Set(ids)].map((id) => app.questions.find((q) => q.id === id)).filter(Boolean);
  if (!qs.length) {
    return h('p', { class: 'review-none muted' }, svg(ICONS.check), h('span', {}, t('review.none')));
  }
  return h('details', { class: 'card review' },
    h('summary', { class: 'review-summary' },
      svg(ICONS.book), h('span', { class: 'review-title' }, t('review.title', { n: num(qs.length) })),
      svg(ICONS.chevron, 'review-chevron')),
    // Group games don't feed "My mistakes" (lead decision 2), so the hint doesn't point there.
    h('p', { class: 'muted review-hint' }, t(group ? 'review.hintGroup' : 'review.hint')),
    h('ol', { class: 'review-list' }, qs.map((q) => reviewItem(q, mode))));
}
