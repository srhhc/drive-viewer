/* ============================================
   דרייב-צפייה — Service Worker
   Offline support + fast repeat loads
   Strategy: cache-first for app shell,
   stale-while-revalidate for data files.
   ============================================ */

const CACHE_VERSION = 'drive-viewer-v3';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/config.js',
    './js/data.js',
    './js/search.js',
    './js/series.js',
    './js/ui.js',
    './js/player.js',
    './js/app.js',
    'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap'
];

// Data files: don't pre-cache (they change daily), but serve stale-while-revalidate
const DATA_PATTERN = /\/data\//;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin GET requests (plus the CDN libs we pre-cached)
    if (event.request.method !== 'GET') return;

    // Data files: stale-while-revalidate
    if (url.origin === self.location.origin && DATA_PATTERN.test(url.pathname)) {
        event.respondWith(
            caches.open(CACHE_VERSION).then(async (cache) => {
                const cached = await cache.match(event.request);
                const network = fetch(event.request)
                    .then((response) => {
                        if (response && response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        );
        return;
    }

    // Navigations (HTML): network-first so new versions appear immediately,
    // cache fallback for offline. JS/CSS: cache-first with revalidate.
    if (url.origin === self.location.origin) {
        if (event.request.mode === 'navigate') {
            event.respondWith(
                fetch(event.request)
                    .then((response) => {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
                        return response;
                    })
                    .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
            );
            return;
        }
        // JS/CSS: stale-while-revalidate so code updates propagate on next visit
        event.respondWith(
            caches.open(CACHE_VERSION).then(async (cache) => {
                const cached = await cache.match(event.request);
                const network = fetch(event.request)
                    .then((response) => {
                        if (response && response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        );
    }
});
