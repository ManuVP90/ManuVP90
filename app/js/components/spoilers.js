// Spoiler filter picker: the works grouped by world (official titles from works.js), a
// checkbox per world and per work, "all" / "none" shortcuts and a live summary.
// Used by Settings and by the first-run introduction. Changes are saved at once.
import { h } from '../dom.js';
import { gemSvg } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { app, updateSettings, catStyle } from '../core.js';
import { WORK_GROUPS, ALL_WORKS, workTitle } from '../works.js';

/**
 * @param {object} [opts]
 * @param {string} [opts.allLabel]   label of the "select all" shortcut
 * @param {string} [opts.noneLabel]  label of the "select none" shortcut
 * @param {string} [opts.idPrefix]   prefix for element ids (two pickers never share ids)
 * @param {boolean} [opts.collapsed] works lists folded under each world (compact first-run view)
 * @param {string} [opts.emptyWarning] shown while no work is selected
 * @param {(selected:number) => void} [opts.onChange] called with the number of selected works after each change
 */
export function spoilerPicker({
  allLabel = t('settings.all'), noneLabel = t('settings.none'), idPrefix = 'work', collapsed = false, emptyWarning = null, onChange = null,
} = {}) {
  const off = new Set(app.settings.disabledWorks);
  const lang = getLang();
  const summary = h('p', { class: 'muted spoiler-summary', 'aria-live': 'polite' });
  const warn = emptyWarning ? h('p', { class: 'banner banner-warn spoiler-warn', role: 'status', hidden: true }, emptyWarning) : null;
  const boxes = new Map();
  const groupBoxes = new Map();
  const counts = new Map(); // "3/7" per world in the collapsed view

  function commit() {
    updateSettings({ disabledWorks: ALL_WORKS.filter((w) => off.has(w)) });
    sync();
  }
  function sync() {
    for (const [w, box] of boxes) box.checked = !off.has(w);
    for (const g of WORK_GROUPS) {
      const gb = groupBoxes.get(g.id);
      const on = g.works.filter((w) => !off.has(w)).length;
      gb.checked = on === g.works.length;
      gb.indeterminate = on > 0 && on < g.works.length;
      const c = counts.get(g.id);
      if (c) c.textContent = `${on}/${g.works.length}`;
    }
    summary.textContent = t('settings.selected', { n: ALL_WORKS.length - off.size, total: ALL_WORKS.length });
    if (warn) warn.hidden = off.size < ALL_WORKS.length;
    onChange?.(ALL_WORKS.length - off.size);
  }

  const groups = WORK_GROUPS.map((g) => {
    const gid = `${idPrefix}-g-${g.id}`;
    const gb = h('input', {
      type: 'checkbox', id: gid, class: 'check',
      onchange: (e) => { g.works.forEach((w) => (e.target.checked ? off.delete(w) : off.add(w))); commit(); },
    });
    groupBoxes.set(g.id, gb);
    if (collapsed && g.works.length > 1) counts.set(g.id, h('span', { class: 'work-count', 'aria-hidden': 'true' }));
    const list = h('ul', { class: 'work-list' }, g.works.map((w) => {
      const id = `${idPrefix}-${w}`;
      const box = h('input', { type: 'checkbox', id, class: 'check', onchange: (e) => { if (e.target.checked) off.delete(w); else off.add(w); commit(); } });
      boxes.set(w, box);
      return h('li', {}, h('label', { class: 'check-row', for: id }, box, h('span', {}, workTitle(w, lang))));
    }));
    const head = h('label', { class: 'check-row group-row', for: gid }, gb,
      h('span', { class: 'group-gem', 'aria-hidden': 'true', html: gemSvg(g.id, { size: 20 }) }),
      h('span', { class: 'group-name' }, t(`cat.${g.id}`)));
    if (!collapsed || g.works.length < 2) {
      return h('fieldset', { class: `work-group ${collapsed ? 'collapsed' : ''}`, ...catStyle(g.id) }, h('legend', { class: 'sr-only' }, t(`cat.${g.id}`)), head, list);
    }
    // Collapsed: the world checkbox stays one tap away; its single works fold behind a toggle.
    list.id = `${gid}-list`;
    list.hidden = true;
    const more = h('button', {
      type: 'button', class: 'work-toggle', 'aria-expanded': 'false', 'aria-controls': list.id,
      'aria-label': t('onboarding.showWorks', { world: t(`cat.${g.id}`) }),
      onclick: () => {
        list.hidden = !list.hidden;
        more.setAttribute('aria-expanded', String(!list.hidden));
      },
    }, counts.get(g.id), h('span', { class: 'work-chevron', 'aria-hidden': 'true' }));
    return h('fieldset', { class: 'work-group collapsed', ...catStyle(g.id) },
      h('legend', { class: 'sr-only' }, t(`cat.${g.id}`)),
      h('div', { class: 'group-line' }, head, more),
      list);
  });

  const el = h('div', { class: 'spoiler-picker' },
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-small btn-ghost spoiler-all', onclick: () => { off.clear(); commit(); } }, allLabel),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost spoiler-none', onclick: () => { ALL_WORKS.forEach((w) => off.add(w)); commit(); } }, noneLabel)),
    summary,
    warn,
    groups);
  sync();
  /** Selects every work (the introduction's "I've read everything" shortcut). */
  el.selectAll = () => { off.clear(); commit(); };
  return el;
}
