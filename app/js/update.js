// "New version available · Update": when a new service worker is installed and waiting, the
// player is offered the update instead of the app swapping versions mid-session. The notice
// never shows while a question is being answered (it waits until the question is answered or
// left), and tapping "Update" asks the waiting worker to take over (skip-waiting) and reloads.
// Games in progress are saved after every step, so the reload resumes them.
import { h, svg } from './dom.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import { whenIdle, onQuestionBusy } from './core.js';

let el = null;
let offered = null; // the waiting worker already offered
let dismissed = false;
let reloading = false;

function hide() { el?.remove(); el = null; }

function show() {
  if (!offered || dismissed || reloading) return;
  hide();
  const worker = offered;
  const btn = h('button', { type: 'button', class: 'update-btn', onclick: () => apply(worker, btn) }, svg(ICONS.refresh), h('span', { class: 'update-label' }, t('update.action')));
  const later = h('button', { type: 'button', class: 'update-close', 'aria-label': t('update.later'), title: t('update.later'), onclick: () => { dismissed = true; hide(); } }, svg(ICONS.x));
  el = h('div', { class: 'update-toast', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'update-text' }, t('update.available')), btn, later);
  document.body.appendChild(el);
}

function apply(worker, btn) {
  reloading = true;
  btn.disabled = true;
  btn.querySelector('.update-label').textContent = t('update.updating');
  // The page reloads on controllerchange; if that never comes (worker gone), reload anyway.
  try { worker.postMessage({ type: 'skip-waiting' }); } catch { /* ignore */ }
  setTimeout(() => location.reload(), 4000);
}

/** Offers the update of `worker` (a waiting ServiceWorker, or anything with postMessage) once idle. */
export function offerUpdate(worker) {
  if (!worker || worker === offered) return;
  offered = worker;
  dismissed = false;
  whenIdle(show);
}

// A question starting while the notice is up: hide it and offer it again once the question is over.
onQuestionBusy(() => { if (el) { hide(); whenIdle(show); } });

/** Hooks a service-worker registration: offers waiting updates, reloads after the swap. */
export function watchRegistration(reg) {
  if (!reg) return; // registration blocked (some embedded browsers)
  const sw = navigator.serviceWorker;
  // Only an update when a worker already controls the page (the first install needs no reload).
  const consider = (w) => { if (w && sw.controller) offerUpdate(w); };
  consider(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') consider(reg.waiting || w); });
  });
  sw.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  // A PWA can stay open for days: look for a new version when it comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}
