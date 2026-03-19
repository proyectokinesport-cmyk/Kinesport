// ============================================================
// SERVICE WORKER — KineSport PR
// Cache app shell + manejo offline
// ============================================================
const CACHE_NAME = 'kinesport-v10';

// Archivos del app shell a cachear
const SHELL_FILES = [
  '/index.html',
  '/login.html',
  '/register.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/js/firebase-config.js',
  '/js/auth.js',
  '/js/notifications.js',
  '/js/app.js',
  '/js/admin.js'
];

// ── INSTALL: cachear app shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_FILES);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network first para HTML, Cache first para assets ─
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) return;

  // Ignorar requests a Firebase/APIs
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) return;

  // Network first para HTML y JS (siempre fresco cuando hay red)
  const isAppFile = request.mode === 'navigate'
    || request.headers.get('accept')?.includes('text/html')
    || /\.(js|html)(\?.*)?$/.test(url.pathname);

  if (isAppFile) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache first solo para íconos e imágenes (activos estáticos)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── CLICK en notificación ─────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(c => c.url.includes('/index.html'));
      if (existing) return existing.focus();
      return clients.openWindow('/index.html');
    })
  );
});
