/**
 * OAPP v3 - Service Worker
 * Caches application shell and assets.
 */

const CACHE_NAME = 'oapp-v3-cache-v5';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './api.js',
    './storage.js',
    './manifest.json'
    // Icons are optional to cache strictly if they are large, but good for PWA
];

// Install Event - Cache Assets
self.addEventListener('install', event => {
    console.log('[SW] Installing New Version...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // Activate immediately
    );
});

// Activate Event - Cleanup Old Caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of open clients
    );
});

// Fetch Event - Network First for API, Cache First for Assets?
// Requirement: Offline-first. 
// Strategy: 
// 1. For Navigation/Assets -> Cache First, falling back to Network.
// 2. For API -> Network First, falling back to offline handling in code (app.js catches error). 
//    Note: We generally don't cache API GET responses in SW for this app structure, 
//    as we use localStorage for data persistence controlled by app.js logic.
//    So SW mainly ensures the App Shell loads.

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // If it's an API call, let the network handle it (app.js handles failure)
    if (url.pathname.includes('/webhook/')) {
        return;
    }

    // For static assets
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Return cached response if found
                if (response) {
                    return response;
                }
                // Otherwise fetch from network
                return fetch(event.request);
            })
    );
});
