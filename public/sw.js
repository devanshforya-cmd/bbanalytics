/**
 * Brand Bucket Command Center — Progressive Web App Service Worker
 * Provides offline caching for static assets, app shell, and background sync integration.
 */

const CACHE_NAME = 'bb-command-center-v7-field-push';
// Install: Precache core app shell & static routes
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: Clean up all old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(keys.filter((key) => key.startsWith('bb-command-center-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
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

  // In local development, bypass cache completely so all code updates are immediate
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0') {
    return;
  }

  // Private API responses, account-specific RSC payloads, and other origins
  // must always go to the network; their data is never stored in the shell cache.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('RSC')) return;

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
          return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Offline</title><body><h1>You are offline</h1><p>Reconnect to load this page. Your pending changes are saved on this device.</p></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }

  // Other GET requests use normal browser/network semantics.

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
    body: typeof data.body === 'string' ? data.body.slice(0, 300) : 'Open the app to review your work alerts.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'bb-alert', // prevents duplicate notifications
    data: { url: typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') && !/[\\\r\n]/.test(data.url) ? data.url : '/' },
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 100) : 'BB Analytics', options),
    self.clients.matchAll({ type: 'window' }).then(windows => windows.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED' }))),
  ]));
});

// Fix 32b: Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data?.url;
  const path = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !/[\\\r\n]/.test(raw) ? raw : '/';
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
