import { h } from '../dom.js';
import { t } from '../i18n.js';
import { screen, topBar } from '../core.js';
import { APP_VERSION } from '../config.js';

export function aboutScreen() {
  return screen('about',
    topBar(t('about.title')),
    h('section', { class: 'card prose' },
      h('p', {}, t('about.body')),
      h('h2', {}, t('about.howTo')),
      h('ol', {}, [1, 2, 3, 4].map((i) => h('li', {}, t(`about.rule${i}`)))),
      h('p', { class: 'muted' }, t('about.offline'))),
    h('p', { class: 'disclaimer', role: 'note' }, t('about.disclaimer')),
    h('p', { class: 'muted center' }, t('about.version', { v: APP_VERSION })));
}
