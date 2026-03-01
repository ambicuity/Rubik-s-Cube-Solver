/**
 * service-worker.js — PWA offline cache
 *
 * Caches all static assets on install. Serves from cache first (offline-first
 * strategy) so the core app (capture, solve) works without any network.
 * Only Gemini explanations require internet.
 */

const CACHE_NAME = 'rubiks-solver-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './src/camera.js',
    './src/colorDetection.js',
    './src/cubeState.js',
    './src/validator.js',
    './src/solver.js',
    './src/optimalSolver.js',
    './src/visualizer.js',
    './src/geminiClient.js',
    './src/ui.js',
    './src/autoCaptureController.js',
    './src/solutionAnimator.js',
    './src/threeScene.js',
    './src/vendor/three.module.js',
];

// ---- Install: cache all static assets ----
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// ---- Activate: remove stale caches ----
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ---- Fetch: cache-first for static, network-only for proxy ----
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Always go network for proxy requests (Gemini API calls)
    if (url.pathname.includes('/gemini') || url.hostname.includes('cloudfunctions') ||
        url.hostname.includes('workers.dev') || url.hostname.includes('googleapis')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Cache-first for everything else
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request).then(response => {
                // Cache successful GET responses
                if (event.request.method === 'GET' && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
