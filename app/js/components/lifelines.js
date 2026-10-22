// Lifeline row (SPEC "Ayudas (v2)"): three themed icon buttons under the question,
// a "?" toggle with a short explanation of each, and a live status line.
// The rules live in components/question.js; this module only renders.
import { h, svg } from '../dom.js';
import { ICONS, lifelineSvg } from '../icons.js';
import { t } from '../i18n.js';
import { LIFELINES } from '../config.js';

/**
 * @param {(kind:string) => void} onPick
 * @returns {{ el: HTMLElement, update: (st: Record<string,{left:boolean, enabled:boolean, armed?:boolean, reason?:string|null}>) => void, say: (msg:string) => void }}
 */
export function lifelineBar(onPick) {
  const helpId = `ll-help-${Math.random().toString(36).slice(2, 8)}`;
  const buttons = Object.fromEntries(LIFELINES.map((k) => [k, h('button', {
    type: 'button', class: `lifeline lifeline-${k}`, dataset: { kind: k },
    onclick: () => onPick(k),
  },
  h('span', { class: 'lifeline-art', 'aria-hidden': 'true', html: lifelineSvg(k, 30) }),
  h('span', { class: 'lifeline-name', 'aria-hidden': 'true' }, t(`lifeline.${k}.name`)),
  h('span', { class: 'lifeline-used-mark', 'aria-hidden': 'true' }))]));

  const help = h('div', { class: 'lifeline-help', id: helpId, hidden: true },
    h('ul', {}, LIFELINES.map((k) => h('li', {},
      h('span', { class: 'lifeline-help-art', 'aria-hidden': 'true', html: lifelineSvg(k, 22) }),
      h('span', {}, h('b', {}, t(`lifeline.${k}.name`)), ' — ', t(`lifeline.${k}.desc`))))),
    h('p', { class: 'muted' }, t('lifeline.rules')));
  const helpBtn = h('button', {
    type: 'button', class: 'lifeline-help-btn', 'aria-expanded': 'false', 'aria-controls': helpId,
    'aria-label': t('lifeline.help'), title: t('lifeline.help'),
    onclick: () => {
      const open = help.hidden;
      help.hidden = !open;
      helpBtn.setAttribute('aria-expanded', String(open));
    },
  }, svg(ICONS.help));
  const status = h('p', { class: 'lifeline-status', role: 'status', 'aria-live': 'polite' });
  // Why a lifeline the player still has can't be used right now (visible, not only in title/aria).
  const reasons = h('p', { class: 'lifeline-reasons', id: `${helpId}-why` });

  const el = h('div', { class: 'lifelines', role: 'group', 'aria-label': t('lifeline.title') },
    h('div', { class: 'lifeline-row' }, LIFELINES.map((k) => buttons[k]), helpBtn),
    reasons,
    status,
    help);

  function update(st) {
    const why = [];
    for (const k of LIFELINES) {
      const b = buttons[k];
      const s = st[k] || { left: false, enabled: false };
      const name = t(`lifeline.${k}.name`);
      let label = t('common.labelled', { label: name, text: t(`lifeline.${k}.desc`) });
      let tip = t(`lifeline.${k}.desc`);
      const blocked = s.left && !s.armed && !s.enabled && s.reason;
      if (!s.left && !s.armed) { label = t('lifeline.used', { name }); tip = label; } else if (s.armed) { label = t('lifeline.stormlight.armed'); tip = label; } else if (blocked) { label = t('common.labelled', { label: name, text: s.reason }); tip = s.reason; }
      if (blocked && !why.includes(s.reason)) why.push(s.reason);
      b.disabled = !s.left || !s.enabled || !!s.armed;
      b.classList.toggle('used', !s.left && !s.armed);
      b.classList.toggle('armed', !!s.armed);
      b.classList.toggle('blocked', !!blocked);
      b.setAttribute('aria-label', label);
      b.title = `${name} — ${tip}`;
    }
    reasons.replaceChildren(...why.map((r) => h('span', {}, r)));
  }

  return { el, update, say: (msg) => { status.textContent = msg; } };
}
