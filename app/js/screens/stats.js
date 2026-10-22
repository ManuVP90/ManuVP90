import { h, svg } from '../dom.js';
import { ICONS, gemSvg, lifelineSvg } from '../icons.js';
import { t, num } from '../i18n.js';
import { app, go, screen, topBar, getStats, catStyle, collection, getAchievements, checkAchievements } from '../core.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { CATEGORIES, LIFELINES, LEVEL_IDS, DIFFICULTIES } from '../config.js';

const pct = (c, a) => (a ? Math.round((c / a) * 100) : 0);

export function statsScreen() {
  const s = getStats();
  let answered = 0;
  let correct = 0;
  for (const c of CATEGORIES) { answered += s.cats[c]?.a || 0; correct += s.cats[c]?.c || 0; }
  const tile = (label, value) => h('div', { class: 'tile' }, h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));

  checkAchievements({ silent: true });
  const unlocked = Object.keys(getAchievements().unlocked).length;
  return screen('stats',
    topBar(t('stats.title')),
    h('button', { type: 'button', class: 'menu-btn stats-ach', onclick: () => go('achievements', { from: 'stats' }) },
      svg(ICONS.medal, 'menu-icon'),
      h('span', { class: 'menu-text' },
        h('span', { class: 'menu-title' }, t('ach.title')),
        h('span', { class: 'menu-desc' }, t('ach.count', { n: num(unlocked), total: num(ACHIEVEMENTS.length) })))),
    h('div', { class: 'tiles' },
      tile(t('stats.classicGames'), num(s.classicGames)),
      tile(t('stats.groupGames'), num(s.groupGames)),
      tile(t('stats.quickGames'), num(s.quickGames)),
      tile(t('stats.bestQuick'), num(s.bestQuick)),
      tile(t('stats.answered'), num(answered)),
      tile(t('stats.accuracy'), answered ? `${pct(correct, answered)} %` : '—')),
    h('p', { class: 'muted stats-group-note', role: 'note' }, t('stats.groupNote')),
    collectionCard(),
    h('section', { class: 'card quick-records' },
      h('h2', { class: 'section-title' }, t('stats.recordsByLevel')),
      h('ul', { class: 'records' }, LEVEL_IDS.map((l, i) => h('li', { class: `record-row level-${l}` },
        h('span', { class: 'pips', 'aria-hidden': 'true' }, DIFFICULTIES.map((d) => h('i', { class: d <= i + 1 ? 'on' : '' }))),
        h('span', { class: 'record-level' }, t(`level.${l}`)),
        h('span', { class: 'record-value' }, s.bestByLevel[l] ? num(s.bestByLevel[l]) : '—'))))),
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
      }))),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, t('stats.lifelines')),
      h('ul', { class: 'lifeline-stats' }, LIFELINES.map((k) => h('li', {},
        h('span', { class: 'lifeline-stats-art', 'aria-hidden': 'true', html: lifelineSvg(k, 28) }),
        h('span', { class: 'lifeline-stats-value' }, num(s.lifelines?.[k] || 0)),
        h('span', { class: 'lifeline-stats-label' }, t(`lifeline.${k}.name`)))))));
}

/**
 * "X/Y questions discovered": overall, per world and per difficulty, counted over the questions the
 * spoiler filter allows (a question seen before the filter hid it doesn't count while hidden).
 */
function collectionCard() {
  const col = collection();
  const filtered = app.questions.some((q) => app.settings.disabledWorks.includes(q.w));
  const row = (cls, icon, label, x, attrs = {}) => h('li', { class: `col-row ${cls}`, ...attrs },
    icon,
    h('span', { class: 'col-label' }, label),
    h('span', { class: 'col-track', 'aria-hidden': 'true' }, h('span', { class: 'col-fill', style: { width: `${pct(x.seen, x.total)}%` } })),
    h('span', { class: 'col-value' }, t('stats.discoveredOf', { n: num(x.seen), total: num(x.total) })));
  return h('section', { class: 'card collection' },
    h('h2', { class: 'section-title' }, t('stats.collection')),
    h('p', { class: 'col-total' }, h('strong', {}, t('stats.discovered', { n: num(col.seen), total: num(col.total) })),
      h('span', { class: 'muted' }, ` · ${pct(col.seen, col.total)} %`)),
    filtered ? h('p', { class: 'muted col-filter' }, t('stats.collectionFiltered')) : null,
    h('ul', { class: 'col-list col-worlds' }, col.worlds.filter((w) => w.total > 0).map((w) => row(`col-world`, h('span', { class: 'bar-gem', 'aria-hidden': 'true', html: gemSvg(w.cat, { size: 20, charges: w.seen >= w.total ? 2 : w.seen ? 1 : 0 }) }), t(`cat.${w.cat}`), w, { ...catStyle(w.cat), dataset: { cat: w.cat } }))),
    h('h3', { class: 'col-subtitle' }, t('stats.byDifficulty')),
    h('ul', { class: 'col-list col-diffs' }, col.diffs.filter((d) => d.total > 0).map((d) => row('col-diff', h('span', { class: 'pips', 'aria-hidden': 'true' }, DIFFICULTIES.map((i) => h('i', { class: i <= d.d ? 'on' : '' }))), t(`difficulty.${d.d}`), d, { dataset: { d: String(d.d) } }))));
}
