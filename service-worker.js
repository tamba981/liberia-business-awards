// ============================================
// LIBERIA BUSINESS AWARDS - SERVICE WORKER v3.0
// PWA READY - MVP PRODUCTION
// ============================================

const CACHE_NAME = 'lba-v3-' + new Date().toISOString().split('T')[0];
const OFFLINE_URL = '/offline.html';

// ============================================
// FILES TO CACHE - ONLY CONFIRMED EXISTING FILES
// ============================================
const PRECACHE_FILES = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/images/logo.png',
  '/images/LBA-cover.png'
];

// Extra files for spotlight page
const SPOTLIGHT_FILES = [
  '/spotlight/index.html',
  '/spotlight/',
  '/spotlight'
];

// ============================================
// INSTALL EVENT - Cache essential files with error handling
// ============================================
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v3.0...');
  
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Cache each file individually to avoid addAll failure
      for (const url of PRECACHE_FILES) {
        try {
          const response = await fetch(url);
          if (response && response.ok) {
            await cache.put(url, response);
            console.log(`[Service Worker] Cached: ${url}`);
          } else {
            console.warn(`[Service Worker] Failed to cache: ${url} (${response?.status})`);
          }
        } catch (error) {
          console.warn(`[Service Worker] Error caching ${url}:`, error);
        }
      }
      
      // Cache spotlight page if accessible
      try {
        const spotlightResponse = await fetch('/spotlight/index.html');
        if (spotlightResponse && spotlightResponse.ok) {
          await cache.put('/spotlight/index.html', spotlightResponse);
          console.log('[Service Worker] Cached spotlight page');
        }
      } catch (error) {
        console.warn('[Service Worker] Spotlight page not cached yet');
      }
      
      console.log('[Service Worker] Installation complete');
      return self.skipWaiting();
    })()
  );
});

// ============================================
// ACTIVATE EVENT - Clean up old caches
// ============================================
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('lba-')) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
      console.log('[Service Worker] Activation complete, claiming clients');
      await self.clients.claim();
    })()
  );
});

// ============================================
// FETCH EVENT - Network first with cache fallback
// ============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests and chrome-extension
  if (event.request.method !== 'GET' || 
      event.request.url.startsWith('chrome-extension://') ||
      event.request.url.includes('chrome-extension')) {
    return;
  }
  
  // API requests - go to network only (no cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(error => {
        console.warn('[Service Worker] API fetch failed:', url.pathname);
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'You are offline. Please check your connection.' 
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // Static assets - cache first strategy
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Return a minimal placeholder for images
          if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
            return new Response('', { status: 200, statusText: 'Offline' });
          }
        });
      })
    );
    return;
  }
  
  // HTML pages - network first with offline fallback
  if (url.pathname.match(/\.html$/) || url.pathname === '/' || url.pathname === '/spotlight' || url.pathname === '/spotlight/') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        }
        throw new Error('Network response not ok');
      }).catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        const offlinePage = await caches.match(OFFLINE_URL);
        return offlinePage || new Response('You are offline', { status: 503 });
      })
    );
    return;
  }
  
  // Default - network first with cache fallback
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }
      throw new Error('Network response not ok');
    }).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      return cachedResponse || new Response('Content unavailable offline', { status: 503 });
    })
  );
});

// ============================================
// BACKGROUND SYNC for offline form submissions
// ============================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-forms') {
    console.log('[Service Worker] Background sync triggered');
    event.waitUntil(syncForms());
  }
});

async function syncForms() {
  try {
    const formQueue = await getFormQueue();
    for (const form of formQueue) {
      await submitForm(form);
    }
    await clearFormQueue();
    console.log('[Service Worker] Synced', formQueue.length, 'forms');
  } catch (error) {
    console.error('[Service Worker] Form sync failed:', error);
  }
}

async function getFormQueue() {
  // Placeholder - implement actual queue retrieval
  return [];
}

async function submitForm(formData) {
  // Placeholder - implement actual form submission
  console.log('Submitting form:', formData);
}

async function clearFormQueue() {
  // Placeholder
}

// ============================================
// PUSH NOTIFICATIONS (Optional)
// ============================================
self.addEventListener('push', event => {
  const data = event.data?.json() || { title: 'Liberia Business Awards', body: 'New update available!' };
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// ============================================
// MESSAGE HANDLING
// ============================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] LBA Service Worker v3.0 loaded');
