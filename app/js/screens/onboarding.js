// First-run introduction (also reachable from About): 1) what have you read? (spoiler filter),
// 2) the rules in 20 seconds, 3) start. Skippable at any step; finishing or skipping saves
// settings.onboarded. It opens by itself while settings.onboarded isn't true (main.js), and
// settings.onbStep remembers the step so a reload in the middle comes back to it.
// On a first run step 1 starts with nothing selected; "Next" needs at least one work.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg, lifelineSvg, WILDCARD_SHAPE } from '../icons.js';
import { t } from '../i18n.js';
import { app, go, screen, setBack, updateSettings, toast } from '../core.js';
import { ALL_WORKS } from '../works.js';
import { CATEGORIES, LIFELINES } from '../config.js';
import { spoilerPicker } from '../components/spoilers.js';
import { fx } from '../fx.js';

const STEPS = 3;

export function onboardingScreen(params = {}) {
  const step = Math.max(0, Math.min(STEPS - 1, params.step | 0));
  if (params.from !== 'about') {
    // First run: nothing is selected yet (unless the player had already set a filter); a reload
    // later in the introduction keeps the picks and the step.
    const patch = { onbStep: step };
    if (app.settings.onbStep === null && !app.settings.disabledWorks.length) patch.disabledWorks = [...ALL_WORKS];
    updateSettings(patch);
  }
  const done = () => {
    const patch = { onboarded: true, onbStep: null };
    // Skipped on a first run with nothing picked: no filter rather than a game with no questions.
    if (params.from !== 'about' && app.settings.disabledWorks.length >= ALL_WORKS.length) {
      patch.disabledWorks = [];
      toast(t('onboarding.skippedNoFilter'));
    }
    updateSettings(patch);
    go(params.from === 'about' ? 'about' : 'home');
  };
  const to = (n) => { fx.tap(); go('onboarding', { ...params, step: n }); };
  setBack(step > 0 ? () => to(step - 1) : done);

  const head = h('header', { class: 'onb-head' },
    h('ol', { class: 'onb-dots', 'aria-hidden': 'true' }, Array.from({ length: STEPS }, (_, i) => h('li', { class: i <= step ? 'on' : '' }))),
    h('p', { class: 'onb-step' }, t('onboarding.step', { n: step + 1, total: STEPS })),
    step < STEPS - 1 ? h('button', { type: 'button', class: 'btn btn-small btn-ghost onb-skip', onclick: done }, t('onboarding.skip')) : null);

  const next = step < STEPS - 1
    ? h('button', { type: 'button', class: 'btn btn-primary btn-block onb-next', onclick: () => to(step + 1), 'aria-describedby': step === 0 ? 'onb-why' : null }, t('onboarding.next'))
    : null;
  // Why "Next" is disabled on step 1 (no work selected), right above it.
  const why = h('p', { class: 'onb-why muted', id: 'onb-why', role: 'status', hidden: true }, t('onboarding.pickOne'));

  let body;
  if (step === 0) {
    const picker = spoilerPicker({
      allLabel: t('onboarding.all'), noneLabel: t('onboarding.none'), idPrefix: 'onb', collapsed: true,
      onChange: (n) => { next.disabled = n === 0; why.hidden = n > 0; },
    });
    body = [
      h('p', { class: 'onb-kicker' }, t('onboarding.welcome')),
      h('h1', { class: 'onb-title' }, t('onboarding.readTitle')),
      h('p', { class: 'muted' }, t('onboarding.readHint')),
      h('button', {
        type: 'button', class: 'btn btn-primary btn-block onb-readall',
        onclick: () => { picker.selectAll(); to(1); },
      }, svg(ICONS.check), t('onboarding.readAll')),
      h('p', { class: 'onb-or muted' }, t('onboarding.orPick')),
      h('section', { class: 'card onb-works' }, picker),
    ];
  } else if (step === 1) {
    const wildcard = `<svg viewBox="0 0 24 24" width="40" height="40"><polygon points="${WILDCARD_SHAPE}" fill="var(--accent)"/></svg>`;
    body = [
      h('h1', { class: 'onb-title' }, t('onboarding.rulesTitle')),
      h('ul', { class: 'onb-rules' },
        h('li', {}, h('span', { class: 'onb-art', 'aria-hidden': 'true', html: wildcard }), h('p', {}, t('onboarding.ruleWheel'))),
        h('li', {}, h('span', { class: 'onb-art onb-gems', 'aria-hidden': 'true', html: CATEGORIES.map((c, i) => gemSvg(c, { charges: i < 2 ? 2 : (i < 4 ? 1 : 0), size: 18 })).join('') }),
          h('p', {}, t('onboarding.ruleGems'))),
        h('li', {}, h('span', { class: 'onb-art onb-lifelines', 'aria-hidden': 'true', html: LIFELINES.map((k) => lifelineSvg(k, 24)).join('') }),
          h('p', {}, t('onboarding.ruleLifelines')))),
    ];
  } else {
    body = [
      h('div', { class: 'onb-final' },
        svg(ICONS.sparkle, 'onb-final-icon'),
        h('h1', { class: 'onb-title' }, t('onboarding.startTitle')),
        h('p', { class: 'lead' }, t('onboarding.startBody'))),
    ];
  }

  const primary = next
    || h('button', { type: 'button', class: 'btn btn-primary btn-block onb-start', 'data-autofocus': '', onclick: () => { fx.tap(); done(); } }, svg(ICONS.play), t('onboarding.start'));
  return screen('onboarding',
    head,
    ...body,
    h('div', { class: 'sticky-actions onb-actions' },
      step === 0 ? why : null,
      primary,
      step > 0 ? h('button', { type: 'button', class: 'btn btn-ghost btn-block onb-back', onclick: () => to(step - 1) }, t('common.back')) : null));
}
