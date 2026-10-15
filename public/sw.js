/**
 * Brand Bucket Command Center — Progressive Web App Service Worker
 * Provides offline caching for static assets, app shell, and background sync integration.
 */

const CACHE_NAME = 'bb-command-center-v2';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/offline-sales/beat-plan',
  '/products',
  '/customers',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: Precache core app shell & static routes
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean up old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (e.g. POST/PUT/DELETE mutations handled by offline-sync queue)
  if (request.method !== 'GET') {
    return;
  }

  // Handle Chrome extension schemes or non-HTTP
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Cache-First for static assets (Next.js chunks, fonts, icons, CSS)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached and fetch in background to refresh
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-First with Cache Fallback for navigation and HTML pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback to cached dashboard or root
          const fallback = await caches.match('/dashboard');
          return fallback || caches.match('/');
        })
    );
    return;
  }

  // Default Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// Background Sync Event: Trigger offline sync queue when connection restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue' || event.tag === 'sync-photos') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'TRIGGER_OFFLINE_SYNC',
            tag: event.tag,
          });
        });
      })
    );
  }
});

// Listen for messages from frontend clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fix 32b: Push Event Handler
self.addEventListener('push', (event) => {
  let data = { title: 'Brand Bucket Alert', body: 'New operational alert received', url: '/dashboard' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'bb-alert', // prevents duplicate notifications
    data: { url: data.url || '/dashboard' }, // where to navigate on click
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Brand Bucket Alert', options));
});

// Fix 32b: Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
