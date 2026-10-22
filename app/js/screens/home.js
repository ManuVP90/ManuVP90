import { h, svg } from '../dom.js';
import { ICONS } from '../icons.js';
import { t, getLang, num } from '../i18n.js';
import { app, go, screen, confirmDialog, noQuestionsBanner, filterIsEmpty, makePool } from '../core.js';
import { CATEGORIES } from '../config.js';
import { fx } from '../fx.js';
import { loadSavedGame } from './classic.js';
import { loadSavedRun, discardRun } from './quick.js';
import { dailyStatus } from './daily.js';

function logo() {
  // Six gems around a central Stormlight diamond.
  return h('div', { class: 'logo', 'aria-hidden': 'true', html: `<svg viewBox="0 0 120 120" width="120" height="120">
    <defs><radialGradient id="lg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8fd3ff" stop-opacity=".55"/><stop offset="1" stop-color="#8fd3ff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="60" cy="60" r="58" fill="url(#lg)"/>
    ${['#2f6fd6', '#c0392b', '#1e9e5a', '#e0a526', '#8e44ad', '#9aa7b8'].map((c, i) => {
    const a = (i * 60 - 90) * Math.PI / 180; const x = 60 + 40 * Math.cos(a); const y = 60 + 40 * Math.sin(a);
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${i * 60})"><polygon points="0,-11 9,-4 9,6 0,12 -9,6 -9,-4" fill="${c}"/><polygon points="0,-5 4,-1.5 4,3 0,6 -4,3 -4,-1.5" fill="#fff" fill-opacity=".35"/></g>`;
  }).join('')}
    <polygon points="60,38 76,52 60,84 44,52" fill="#e9f6ff"/><polygon points="60,38 66,52 60,84 54,52" fill="#8fd3ff" opacity=".55"/><path d="M44 52h32" stroke="#5aa9e0" stroke-width="1.5"/>
  </svg>` });
}

function bigButton(icon, title, desc, onclick, cls = '') {
  return h('button', { type: 'button', class: `menu-btn ${cls}`, onclick: () => { fx.tap(); onclick(); } },
    svg(ICONS[icon], 'menu-icon'),
    h('span', { class: 'menu-text' }, h('span', { class: 'menu-title' }, title), desc ? h('span', { class: 'menu-desc' }, desc) : null));
}

export function homeScreen() {
  // Only valid saves are offered ("Continue" must always work).
  const saved = loadSavedGame();
  const savedQuick = loadSavedRun();
  const startClassic = async () => {
    if (saved && !(await confirmDialog(t('home.newGameConfirmClassic'), { okLabel: t('home.newGameYes'), cancelLabel: t('home.newGameNo') }))) return;
    go('classic-setup');
  };
  const startQuick = async () => {
    if (savedQuick) {
      if (!(await confirmDialog(t('home.newGameConfirmQuick'), { okLabel: t('home.newGameYes'), cancelLabel: t('home.newGameNo') }))) return;
      discardRun();
    }
    go('quick');
  };
  const daily = dailyStatus();
  const dailyDesc = daily.state === 'run' ? t('home.dailyRun', { n: daily.n, total: daily.total })
    : daily.state === 'done' ? t('home.dailyDone', { n: daily.score, total: daily.total, streak: num(daily.streak) })
      : daily.state === 'locked' ? t('home.dailyLocked')
      : daily.streak ? t('home.dailyStreak', { n: num(daily.streak) }) : t('home.dailyDesc');
  // Texts follow the spoiler filter (beta 4, m2): "all your gems" when it leaves fewer than six worlds.
  const allWorlds = app.loadError || filterIsEmpty() || makePool({}).categories().length >= CATEGORIES.length;
  // "Continue game" says whose turn it is (beta 4, m3).
  const continueDesc = () => {
    const players = saved.players.map((p) => p.name).join(', ');
    return saved.players.length > 1 ? t('home.continueTurn', { name: saved.players[saved.current].name, players }) : t('home.continueDesc', { players });
  };
  const smallBtn = (icon, label, target) => h('button', { type: 'button', class: 'small-btn', onclick: () => { fx.tap(); go(target); } }, svg(ICONS[icon]), h('span', {}, label));

  return screen('home',
    h('div', { class: 'hero' },
      logo(),
      h('h1', { class: 'title' }, t('app.title')),
      h('p', { class: 'tagline' }, t('app.tagline'))),
    app.loadError ? h('p', { class: 'banner banner-error', role: 'alert' }, t('errors.load')) : null,
    !app.loadError && app.questionsLang && app.questionsLang !== getLang()
      ? h('p', { class: 'banner banner-warn', role: 'status' }, t('errors.fallback')) : null,
    // The spoiler filter leaves no question: warn before any game is started.
    !app.loadError && filterIsEmpty() ? noQuestionsBanner('home-empty') : null,
    h('nav', { class: 'menu', 'aria-label': t('app.title') },
      saved ? bigButton('play', t('home.continue'), continueDesc(), () => go('classic', { resume: true }), 'menu-continue menu-continue-classic') : null,
      savedQuick ? bigButton('bolt', t('home.continueQuick'), t('home.continueQuickDesc', { n: savedQuick.index + 1, total: savedQuick.total, score: num(savedQuick.score) }), () => go('quick', { resume: true }), 'menu-continue menu-continue-quick') : null,
      bigButton('users', t('home.classic'), t(allWorlds ? 'home.classicDesc' : 'home.classicDescFiltered'), startClassic, saved || savedQuick ? '' : 'menu-primary'),
      bigButton('bolt', t('home.quick'), t('home.quickDesc'), startQuick, 'menu-quick'),
      bigButton('book', t('home.practice'), t('home.practiceDesc'), () => go('practice-setup')),
      bigButton('calendar', daily.state === 'run' ? t('home.dailyContinue') : t('home.daily'), dailyDesc, () => go('daily'), `menu-daily daily-${daily.state}`)),
    h('div', { class: 'small-row' },
      smallBtn('stats', t('home.stats'), 'stats'),
      smallBtn('settings', t('home.settings'), 'settings'),
      smallBtn('info', t('home.about'), 'about'),
      smallBtn('medal', t('home.achievements'), 'achievements')),
  );
}
