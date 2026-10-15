import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { app, screen, topBar, toggle, updateSettings, confirmDialog, toast, rerender, catStyle } from '../core.js';
import { LANGS, LANG_NAMES } from '../config.js';
import { WORK_GROUPS, ALL_WORKS, workTitle } from '../works.js';
import { canVibrate, fx } from '../fx.js';
import { storageAvailable, clearAll } from '../storage.js';

/** Hook set by app.js: switches language (loads strings + questions) and re-renders. */
export const settingsHooks = { changeLanguage: async () => {}, afterReset: async () => {} };

function segmented(labelId, options, value, onchange) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': labelId }, options.map(([v, label, icon]) => h('button', {
    type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(v === value),
    onclick: (e) => {
      e.currentTarget.parentElement.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      fx.tap();
      onchange(v);
    },
  }, icon ? svg(ICONS[icon]) : null, label)));
}

function spoilerSection() {
  const off = new Set(app.settings.disabledWorks);
  const lang = getLang();
  const summary = h('p', { class: 'muted', 'aria-live': 'polite' });
  const boxes = new Map();
  const groupBoxes = new Map();

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
    }
    summary.textContent = t('settings.selected', { n: ALL_WORKS.length - off.size, total: ALL_WORKS.length });
  }

  const groups = WORK_GROUPS.map((g) => {
    const gid = `wg-${g.id}`;
    const gb = h('input', {
      type: 'checkbox', id: gid, class: 'check',
      onchange: (e) => { g.works.forEach((w) => (e.target.checked ? off.delete(w) : off.add(w))); commit(); },
    });
    groupBoxes.set(g.id, gb);
    return h('fieldset', { class: 'work-group', ...catStyle(g.id) },
      h('legend', { class: 'sr-only' }, t(`cat.${g.id}`)),
      h('label', { class: 'check-row group-row', for: gid }, gb,
        h('span', { class: 'group-gem', 'aria-hidden': 'true', html: gemSvg(g.id, { size: 20 }) }),
        h('span', { class: 'group-name' }, t(`cat.${g.id}`))),
      h('ul', { class: 'work-list' }, g.works.map((w) => {
        const id = `work-${w}`;
        const box = h('input', { type: 'checkbox', id, class: 'check', onchange: (e) => { if (e.target.checked) off.delete(w); else off.add(w); commit(); } });
        boxes.set(w, box);
        return h('li', {}, h('label', { class: 'check-row', for: id }, box, h('span', {}, workTitle(w, lang))));
      })));
  });

  const el = h('section', { class: 'card', 'aria-labelledby': 'spoilers-title' },
    h('h2', { class: 'section-title', id: 'spoilers-title' }, t('settings.spoilers')),
    h('p', { class: 'muted' }, t('settings.spoilersHint')),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => { off.clear(); commit(); } }, t('settings.all')),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => { ALL_WORKS.forEach((w) => off.add(w)); commit(); } }, t('settings.none'))),
    summary,
    groups);
  sync();
  return el;
}

export function settingsScreen() {
  const s = app.settings;
  const langSelect = h('select', {
    id: 'lang-select', class: 'select',
    onchange: async (e) => { await settingsHooks.changeLanguage(e.target.value); rerender(); },
  }, LANGS.map((l) => h('option', { value: l, selected: l === getLang() }, LANG_NAMES[l])));

  return screen('settings',
    topBar(t('settings.title')),
    storageAvailable() ? null : h('p', { class: 'banner banner-warn', role: 'status' }, t('settings.storageWarning')),
    h('section', { class: 'card' },
      h('div', { class: 'row-setting' },
        h('label', { class: 'row-label', for: 'lang-select' }, svg(ICONS.globe), t('settings.language')),
        langSelect)),
    h('section', { class: 'card' },
      h('div', { class: 'row-setting' },
        h('span', { class: 'row-label', id: 'theme-label' }, t('settings.theme')),
        segmented('theme-label', [['dark', t('settings.dark'), 'moon'], ['light', t('settings.light'), 'sun']], s.theme, (v) => updateSettings({ theme: v }))),
      toggle(t('settings.sound'), s.sound, (v) => updateSettings({ sound: v })),
      toggle(t('settings.vibration'), s.vibration, (v) => { updateSettings({ vibration: v }); if (v) fx.correct(); },
        { hint: canVibrate() ? null : t('settings.vibrationUnsupported') }),
      toggle(t('settings.timer'), s.timer, (v) => updateSettings({ timer: v }), { hint: t('setup.timerHint') })),
    spoilerSection(),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, t('settings.data')),
      h('button', {
        type: 'button', class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!(await confirmDialog(t('settings.resetConfirm'), { danger: true, okLabel: t('settings.reset') }))) return;
          clearAll();
          await settingsHooks.afterReset();
          toast(t('settings.resetDone'));
          rerender();
        },
      }, t('settings.reset'))));
}
