import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { app, screen, topBar, toggle, updateSettings, confirmDialog, toast, rerender } from '../core.js';
import { LANGS, LANG_NAMES } from '../config.js';
import { spoilerPicker } from '../components/spoilers.js';
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
  return h('section', { class: 'card', 'aria-labelledby': 'spoilers-title' },
    h('h2', { class: 'section-title', id: 'spoilers-title' }, t('settings.spoilers')),
    h('p', { class: 'muted' }, t('settings.spoilersHint')),
    spoilerPicker({ emptyWarning: t('onboarding.noneWarn') }));
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
      toggle(t('settings.timer'), s.timer, (v) => updateSettings({ timer: v }), { hint: `${t('setup.timerHint')} ${t('setup.timerPause')}` })),
    spoilerSection(),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, t('settings.data')),
      h('button', {
        type: 'button', class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!(await confirmDialog(t('settings.resetConfirm'), { danger: true, okLabel: t('settings.reset'), cancelLabel: t('settings.resetNo') }))) return;
          clearAll();
          await settingsHooks.afterReset();
          toast(t('settings.resetDone'));
          rerender();
        },
      }, t('settings.reset'))));
}
