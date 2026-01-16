// service-worker.js
const CACHE_NAME = 'lba-v3.0-' + new Date().getTime();
const OFFLINE_URL = '/offline.html';

// Files to cache immediately
const PRECACHE_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/main.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(PRECACHE_FILES);
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
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
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Handle API requests differently
  if (event.request.url.includes('/submit-form')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the new resource
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.log('[Service Worker] Fetch failed; returning offline page', error);
            
            // If user is offline and requesting HTML, show offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
            
            // For other file types, return appropriate fallback
            if (event.request.destination === 'image') {
              return caches.match('/icons/offline-image.png');
            }
            
            if (event.request.destination === 'font') {
              return new Response('Offline', { status: 408, statusText: 'Offline' });
            }
          });
      })
  );
});

// Background sync for form submissions when offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-forms') {
    console.log('[Service Worker] Background sync for forms');
    event.waitUntil(syncForms());
  }
});

// Periodic sync for updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-content') {
    console.log('[Service Worker] Periodic sync for content updates');
    event.waitUntil(updateContent());
  }
});

// Helper functions
async function syncForms() {
  // Implement form syncing logic here
  console.log('Syncing forms...');
}

async function updateContent() {
  // Implement content update logic here
  console.log('Updating content...');
}