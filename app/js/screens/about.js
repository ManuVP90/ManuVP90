import { h, svg } from '../dom.js';
import { ICONS, lifelineSvg } from '../icons.js';
import { t } from '../i18n.js';
import { screen, topBar, go } from '../core.js';
import { APP_VERSION, LIFELINES, LEVEL_IDS } from '../config.js';

export function aboutScreen() {
  return screen('about',
    topBar(t('about.title')),
    h('section', { class: 'card prose' },
      h('p', {}, t('about.body')),
      h('h2', {}, t('about.howTo')),
      h('ol', {}, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => h('li', {}, t(`about.rule${i}`)))),
      h('h2', {}, t('about.levels')),
      h('ul', { class: 'about-levels' }, LEVEL_IDS.map((l) => h('li', {}, h('b', {}, t(`level.${l}`)), ' — ', t(`level.${l}Desc`)))),
      h('p', {}, t('about.levelsFinal')),
      h('h2', { id: 'about-lifelines' }, t('about.lifelines')),
      h('ul', { class: 'about-lifelines' }, LIFELINES.map((k) => h('li', {},
        h('span', { class: 'about-lifeline-art', 'aria-hidden': 'true', html: lifelineSvg(k, 36) }),
        h('span', {}, h('b', {}, t(`lifeline.${k}.name`)), ' — ', t(`lifeline.${k}.long`))))),
      h('p', {}, t('lifeline.rules')),
      h('p', { class: 'muted' }, t('about.offline')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-block about-intro', onclick: () => go('onboarding', { from: 'about' }) },
        svg(ICONS.sparkle), t('about.intro'))),
    h('p', { class: 'disclaimer', role: 'note' }, t('about.disclaimer')),
    h('p', { class: 'muted center' }, t('about.version', { v: APP_VERSION })));
}
