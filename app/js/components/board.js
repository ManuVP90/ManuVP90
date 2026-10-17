// Player board: each player's gems with 0/1/2 charges.
import { h } from '../dom.js';
import { gemSvg, lifelineSvg } from '../icons.js';
import { LIFELINES } from '../config.js';
import { t } from '../i18n.js';
import { charges, infusedCount } from '../game.js';
import { initialOf } from '../text.js';

export function avatar(color, name, size = 40) {
  return h('span', { class: 'avatar', 'aria-hidden': 'true', '--cat': `var(--c-${color})`, style: { width: `${size}px`, height: `${size}px` }, html: gemSvg(color, { size: Math.round(size * 0.8) }) },
    h('b', { class: 'avatar-initial' }, initialOf(name)));
}

export function gemRow(state, player, size = 22) {
  return h('ul', { class: 'gems', role: 'list' }, state.categories.map((cat) => {
    const n = charges(player, cat);
    const label = t(`classic.gem${n}`, { category: t(`cat.${cat}`) });
    return h('li', { class: `gem ${n >= 2 ? 'infused' : ''}`, title: label, 'aria-label': label, '--cat': `var(--c-${cat})`, html: gemSvg(cat, { charges: n, size }) });
  }));
}

/**
 * Player board. The compact version (game screens) is a grid that always shows every player,
 * so whoever has the turn is visible even with 6 players on a 320 px screen: 1–3 players in
 * one row, 4 in 2×2, 5–6 in three columns with mini gems.
 */
export function board(state, { compact = false } = {}) {
  const n = state.players.length;
  const cols = !compact ? 1 : (n === 4 ? 2 : Math.min(n, 3));
  const dense = compact && n >= 3;
  const gemSize = !compact ? 22 : (n >= 5 ? 11 : (n >= 3 ? 13 : 16));
  return h('section', { class: `board ${compact ? 'compact' : ''} ${dense ? 'dense' : ''}`, 'aria-label': t('classic.board'), '--cols': String(cols) },
    h('ol', { class: 'board-list' }, state.players.map((p, i) => h('li', {
      class: `board-player ${i === state.current ? 'current' : ''}`,
      'aria-current': i === state.current ? 'true' : null,
      '--pc': `var(--c-${p.color})`,
    },
    avatar(p.color, p.name, !compact ? 40 : (dense ? 24 : 32)),
    h('div', { class: 'board-info' },
      h('span', { class: 'board-name' }, p.name,
        h('span', { class: 'sr-only' }, ` — ${t('classic.gemCount', { n: infusedCount(state, p), total: state.categories.length })}`)),
      gemRow(state, p, gemSize))))));
}

/** Small read-only row with the lifelines a player has left (used ones are faded). */
export function lifelinesLeft(player, size = 22) {
  return h('ul', { class: 'lifelines-left', role: 'list', 'aria-label': t('lifeline.title') }, LIFELINES.map((k) => {
    const left = (player.lifelines?.[k] || 0) > 0;
    const name = t(`lifeline.${k}.name`);
    const label = left ? name : t('lifeline.used', { name });
    return h('li', { class: left ? '' : 'used', title: label, 'aria-label': label, html: lifelineSvg(k, size) });
  }));
}
