// ============================================================
// FIREBASE CLOUD MESSAGING SERVICE WORKER
// Maneja notificaciones push en background
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// IMPORTANTE: Debe coincidir exactamente con firebase-config.js
firebase.initializeApp({
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID"
});

const messaging = firebase.messaging();

// ── Manejo de mensajes en background ──────────────────────
messaging.onBackgroundMessage(payload => {
  console.log('[FCM SW] Mensaje en background:', payload);

  const { title, body, icon } = {
    title: 'KineSport PR',
    body:  'Tienes una actualización sobre tu cita.',
    icon:  '/icons/icon.svg',
    ...payload.notification
  };

  self.registration.showNotification(title, {
    body,
    icon,
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
