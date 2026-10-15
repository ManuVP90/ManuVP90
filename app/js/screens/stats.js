import { h } from '../dom.js';
import { gemSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { screen, topBar, getStats, catStyle } from '../core.js';
import { CATEGORIES } from '../config.js';

const pct = (c, a) => (a ? Math.round((c / a) * 100) : 0);

export function statsScreen() {
  const s = getStats();
  let answered = 0;
  let correct = 0;
  for (const c of CATEGORIES) { answered += s.cats[c]?.a || 0; correct += s.cats[c]?.c || 0; }
  const tile = (label, value) => h('div', { class: 'tile' }, h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));

  return screen('stats',
    topBar(t('stats.title')),
    h('div', { class: 'tiles' },
      tile(t('stats.classicGames'), num(s.classicGames)),
      tile(t('stats.quickGames'), num(s.quickGames)),
      tile(t('stats.bestQuick'), num(s.bestQuick)),
      tile(t('stats.answered'), num(answered)),
      tile(t('stats.accuracy'), answered ? `${pct(correct, answered)} %` : '—')),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, t('stats.byCategory')),
      answered ? null : h('p', { class: 'muted' }, t('stats.none')),
      h('ul', { class: 'bars' }, CATEGORIES.map((c) => {
        const { a = 0, c: ok = 0 } = s.cats[c] || {};
        const p = pct(ok, a);
        return h('li', { class: 'bar-row', ...catStyle(c) },
          h('span', { class: 'bar-gem', 'aria-hidden': 'true', html: gemSvg(c, { size: 22 }) }),
          h('span', { class: 'bar-label' }, t(`cat.${c}`)),
          h('span', { class: 'bar-track', role: 'img', 'aria-label': `${t(`cat.${c}`)}: ${p} % (${t('stats.of', { correct: ok, total: a })})` },
            h('span', { class: 'bar-fill', style: { width: `${p}%` } })),
          h('span', { class: 'bar-value', 'aria-hidden': 'true' }, a ? `${p} %` : '—'));
      }))));
}
