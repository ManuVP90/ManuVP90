// Achievements showcase ("Logros"): every achievement as a gem, cut and colored like its world's,
// infused when unlocked and empty (with a lock) while locked; locked ones with a measurable goal
// show their progress. Reachable from Home and from Stats.
import { h, svg } from '../dom.js';
import { ICONS, gemSvg } from '../icons.js';
import { t, num, getLang } from '../i18n.js';
import { screen, topBar, getAchievements, achievementContext, checkAchievements, catStyle, go } from '../core.js';
import { ACHIEVEMENTS, progressOf } from '../achievements.js';

function when(ms) {
  try { return new Intl.DateTimeFormat(getLang(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)); } catch { return ''; }
}

export function achievementsScreen(params = {}) {
  checkAchievements({ silent: true }); // anything already earned shows as unlocked right away
  const state = getAchievements();
  const ctx = achievementContext();
  const done = ACHIEVEMENTS.filter((a) => state.unlocked[a.id]).length;
  const total = ACHIEVEMENTS.length;
  const back = params.from === 'stats' ? () => go('stats') : () => go('home');
  const card = (a) => {
    const at = state.unlocked[a.id];
    const prog = at ? null : progressOf(a.id, ctx);
    return h('li', { class: `ach-card ${at ? 'unlocked' : 'locked'}`, dataset: { ach: a.id }, ...catStyle(a.gem) },
      h('span', { class: 'ach-gem', 'aria-hidden': 'true' },
        h('span', { html: gemSvg(a.gem, { size: 44, charges: at ? 2 : 0 }) }),
        at ? null : svg(ICONS.lock, 'ach-lock')),
      h('div', { class: 'ach-body' },
        h('h3', { class: 'ach-name' }, t(`ach.${a.id}.name`)),
        h('p', { class: 'ach-desc' }, t(`ach.${a.id}.desc`)),
        at ? h('p', { class: 'ach-when' }, svg(ICONS.check), h('span', {}, t('ach.unlockedOn', { date: when(at) })))
          : h('p', { class: 'sr-only' }, t('ach.locked')),
        prog ? h('div', { class: 'ach-progress' },
          h('span', { class: 'ach-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(prog[1]), 'aria-valuenow': String(prog[0]), 'aria-label': t(`ach.${a.id}.name`) },
            h('span', { class: 'ach-fill', style: { width: `${Math.round((prog[0] / prog[1]) * 100)}%` } })),
          h('span', { class: 'ach-count' }, t('ach.progress', { n: num(prog[0]), total: num(prog[1]) }))) : null));
  };
  return screen('achievements',
    topBar(t('ach.title'), { back }),
    h('section', { class: 'card ach-summary' },
      svg(ICONS.medal, 'ach-summary-icon'),
      h('div', {},
        h('p', { class: 'ach-summary-count' }, t('ach.count', { n: num(done), total: num(total) })),
        h('div', { class: 'ach-track ach-track-big', 'aria-hidden': 'true' }, h('span', { class: 'ach-fill', style: { width: `${Math.round((done / total) * 100)}%` } })),
        h('p', { class: 'muted ach-local' }, t('ach.local')))),
    h('ul', { class: 'ach-list' }, ACHIEVEMENTS.filter((a) => state.unlocked[a.id]).map(card), ACHIEVEMENTS.filter((a) => !state.unlocked[a.id]).map(card)));
}
