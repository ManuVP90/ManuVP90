// Player board: each player's gems with 0/1/2 charges.
import { h } from '../dom.js';
import { gemSvg } from '../icons.js';
import { t } from '../i18n.js';
import { charges, infusedCount } from '../game.js';

export function avatar(color, name, size = 40) {
  return h('span', { class: 'avatar', 'aria-hidden': 'true', '--cat': `var(--c-${color})`, style: { width: `${size}px`, height: `${size}px` }, html: gemSvg(color, { size: Math.round(size * 0.8) }) },
    h('b', { class: 'avatar-initial' }, (name || '?').trim().charAt(0).toUpperCase()));
}

export function gemRow(state, player, size = 22) {
  return h('ul', { class: 'gems', role: 'list' }, state.categories.map((cat) => {
    const n = charges(player, cat);
    const label = t(`classic.gem${n}`, { category: t(`cat.${cat}`) });
    return h('li', { class: `gem ${n >= 2 ? 'infused' : ''}`, title: label, 'aria-label': label, '--cat': `var(--c-${cat})`, html: gemSvg(cat, { charges: n, size }) });
  }));
}

export function board(state, { compact = false } = {}) {
  return h('section', { class: `board ${compact ? 'compact' : ''}`, 'aria-label': t('classic.board') },
    h('ol', { class: 'board-list' }, state.players.map((p, i) => h('li', {
      class: `board-player ${i === state.current ? 'current' : ''}`,
      'aria-current': i === state.current ? 'true' : null,
    },
    avatar(p.color, p.name, compact ? 32 : 40),
    h('div', { class: 'board-info' },
      h('span', { class: 'board-name' }, p.name,
        h('span', { class: 'sr-only' }, ` — ${t('classic.gemCount', { n: infusedCount(state, p), total: state.categories.length })}`)),
      gemRow(state, p, compact ? 18 : 22))))));
}
