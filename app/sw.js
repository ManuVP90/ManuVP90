// Service worker: precaches the app shell, serves same-origin GETs cache-first while
// refreshing the cache in the background (stale-while-revalidate).
// Bump CACHE_VERSION whenever any shell file changes so clients pick up the new version.
// A new version installs in the background and waits: the page offers "New version available ·
// Update" (js/update.js) and sends 'skip-waiting' when the player taps it, so the app never swaps
// versions in the middle of a question.
const CACHE_VERSION = 'v19';
const CACHE = `cosmere-trivia-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/achievements.js',
  'js/app.js',
  'js/boot-error.js',
  'js/config.js',
  'js/core.js',
  'js/daily.js',
  'js/data.js',
  'js/dom.js',
  'js/fx.js',
  'js/game.js',
  'js/i18n.js',
  'js/icons.js',
  'js/main.js',
  'js/progress.js',
  'js/report.js',
  'js/storage.js',
  'js/text.js',
  'js/update.js',
  'js/works.js',
  'js/components/board.js',
  'js/components/lifelines.js',
  'js/components/question.js',
  'js/components/review.js',
  'js/components/spoilers.js',
  'js/components/wheel.js',
  'js/screens/about.js',
  'js/screens/achievements.js',
  'js/screens/classic.js',
  'js/screens/daily.js',
  'js/screens/home.js',
  'js/screens/onboarding.js',
  'js/screens/practice.js',
  'js/screens/quick.js',
  'js/screens/settings.js',
  'js/screens/stats.js',
  'i18n/en.json', // fallback strings; the active language is added at runtime
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      // No skipWaiting here: with an older version in control, this one waits for the player's OK.
      // Exception: pages of v12 or older can't show the notice (they always swapped silently), so
      // replacing one of those keeps the old behavior once.
      .then(() => caches.keys())
      .then((keys) => { if (keys.some((k) => { const m = /^cosmere-trivia-v(\d+)$/.exec(k); return m && Number(m[1]) <= 12; })) return self.skipWaiting(); }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cosmere-trivia-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks us to keep the active language's data (questions + strings) offline.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'skip-waiting') { self.skipWaiting(); return; }
  if (msg.type === 'cache-urls' && Array.isArray(msg.urls)) {
    event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(msg.urls.map(async (u) => {
      const url = new URL(u, self.registration.scope);
      if (url.origin !== self.location.origin) return;
      if (!(await cache.match(url))) {
        try { await cache.add(url); } catch { /* offline: ignore */ }
      }
    }))));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isNav = req.mode === 'navigate';
    const key = isNav ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: isNav });
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(isNav ? 'index.html' : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response('Offline', { status: 503, statusText: 'Offline' });
  })());
});
