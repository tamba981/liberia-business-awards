// ============================================
// LIBERIA BUSINESS AWARDS - SERVICE WORKER v3.1
// NO OFFLINE MESSAGE - SIMPLE CACHE ONLY
// ============================================

const CACHE_NAME = 'lba-cache-v1';

// ============================================
// FILES TO CACHE
// ============================================
const PRECACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/logo.png',
  '/images/LBA-cover.png'
];

// ============================================
// INSTALL EVENT
// ============================================
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        PRECACHE_FILES.map(url => {
          return fetch(url).then(response => {
            if (response && response.ok) {
              return cache.put(url, response);
            }
          }).catch(() => {});
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ============================================
// ACTIVATE EVENT
// ============================================
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ============================================
// FETCH EVENT - SIMPLE CACHE ONLY, NO OFFLINE PAGE
// ============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip API requests - go to network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For everything else, try network first, fallback to cache (no offline message)
  event.respondWith(
    fetch(event.request).then(response => {
      // Cache successful responses for future use
      if (response && response.ok) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(() => {
      // If offline, try to serve from cache silently (no message)
      return caches.match(event.request);
    })
  );
});

console.log('[Service Worker] LBA Service Worker v3.1 loaded - No offline messages');
