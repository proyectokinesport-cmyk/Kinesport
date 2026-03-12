// ============================================================
// FIREBASE CLOUD MESSAGING SERVICE WORKER
// Maneja notificaciones push en background
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// IMPORTANTE: Debe coincidir exactamente con firebase-config.js
firebase.initializeApp({
  apiKey:            "AIzaSyDitx8gX34FKh9Wb_sGU_beFqZrzg8p-eo",
  authDomain:        "kinesport-3ab0c.firebaseapp.com",
  projectId:         "kinesport-3ab0c",
  storageBucket:     "kinesport-3ab0c.firebasestorage.app",
  messagingSenderId: "853047186966",
  appId:             "1:853047186966:web:dce874b0c82ca91cf70737"
});

const messaging = firebase.messaging();

// ── Manejo de mensajes en background ──────────────────────
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Mensaje en background:', payload);

  const title = (payload.data && payload.data.title) || 'KineSport';
  const body  = (payload.data && payload.data.body)  || 'Nueva actualización.';

  self.registration.showNotification(title, {
    body,
    icon:    '/icons/icon.svg',
    badge:   '/icons/icon.svg',
    vibrate: [200, 100, 200],
    tag:     'kinesport-fcm',
    data:    payload.data || {}
  });
});

// ── Click en notificación ─────────────────────────────────
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
