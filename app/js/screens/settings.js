import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { app, screen, topBar, toggle, updateSettings, confirmDialog, toast, rerender, exportData, importData } from '../core.js';
import { LANGS, LANG_NAMES } from '../config.js';
import { spoilerPicker } from '../components/spoilers.js';
import { canVibrate, fx } from '../fx.js';
import { storageAvailable, clearAll } from '../storage.js';
import { encodeBackup, decodeBackup } from '../progress.js';
import { copyText } from '../components/review.js';

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

/** Export / import of the progress as a copyable code (no games in progress). */
function backupSection() {
  const out = h('textarea', { class: 'text-input backup-code', id: 'backup-out', readonly: true, rows: '3', spellcheck: 'false', 'aria-label': t('settings.backupCode') });
  const copyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-block backup-copy', onclick: async () => {
    toast((await copyText(out.value)) ? t('settings.backupCopied') : t('settings.backupCopyFailed'));
    out.select();
  } }, svg(ICONS.copy), t('settings.backupCopy'));
  const outWrap = h('div', { class: 'backup-out', hidden: true }, out, copyBtn);
  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-block backup-export', onclick: async () => {
    fx.tap();
    out.value = await encodeBackup(exportData());
    outWrap.hidden = false;
    out.focus();
    out.select();
  } }, svg(ICONS.download), t('settings.backupExport'));

  const input = h('textarea', { class: 'text-input backup-in', id: 'backup-in', rows: '3', spellcheck: 'false', autocomplete: 'off', placeholder: 'CT1…' });
  const msg = h('p', { class: 'banner banner-error backup-error', role: 'alert', hidden: true });
  const importBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block backup-import', onclick: async () => {
    msg.hidden = true;
    const res = await decodeBackup(input.value);
    if (!res.ok) { msg.textContent = t(`settings.backupError.${res.error}`); msg.hidden = false; return; }
    if (!(await confirmDialog(t('settings.backupConfirm'), { title: t('settings.backupConfirmTitle'), okLabel: t('settings.backupImport'), cancelLabel: t('settings.backupNo') }))) return;
    const before = getLang();
    if (!importData(res.data)) { msg.textContent = t('settings.backupError.format'); msg.hidden = false; return; }
    if (app.settings.lang && app.settings.lang !== before) await settingsHooks.changeLanguage(app.settings.lang);
    toast(t('settings.backupDone'));
    rerender();
  } }, svg(ICONS.upload), t('settings.backupImport'));

  return h('section', { class: 'card backup', 'aria-labelledby': 'backup-title' },
    h('h2', { class: 'section-title', id: 'backup-title' }, t('settings.backup')),
    h('p', { class: 'muted' }, t('settings.backupHint')),
    exportBtn,
    outWrap,
    h('label', { class: 'field-label backup-in-label', for: 'backup-in' }, t('settings.backupPaste')),
    input,
    msg,
    importBtn);
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
    h('section', { class: 'card rows-card' },
      h('div', { class: 'row-setting' },
        h('label', { class: 'row-label', for: 'lang-select' }, svg(ICONS.globe), t('settings.language')),
        langSelect)),
    h('section', { class: 'card rows-card' },
      h('div', { class: 'row-setting' },
        h('span', { class: 'row-label', id: 'theme-label' }, t('settings.theme')),
        segmented('theme-label', [['dark', t('settings.dark'), 'moon'], ['light', t('settings.light'), 'sun']], s.theme, (v) => updateSettings({ theme: v }))),
      toggle(t('settings.sound'), s.sound, (v) => updateSettings({ sound: v })),
      toggle(t('settings.vibration'), s.vibration, (v) => { updateSettings({ vibration: v }); if (v) fx.correct(); },
        { hint: canVibrate() ? null : t('settings.vibrationUnsupported') }),
      toggle(t('settings.timer'), s.timer, (v) => updateSettings({ timer: v }), { hint: `${t('setup.timerHint')} ${t('setup.timerPause')}` })),
    spoilerSection(),
    backupSection(),
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
