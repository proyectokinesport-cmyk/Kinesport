// ============================================================
// NOTIFICATIONS SERVICE — Firebase Cloud Messaging (FCM)
// ============================================================
const NotificationService = {

  // ── Inicializa FCM y solicita permiso ─────────────────────
  async init() {
    if (!('Notification' in window)) return;
    if (!firebase.messaging.isSupported()) return;

    try {
      const messaging = firebase.messaging();
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        console.log('Permiso de notificaciones denegado.');
        return;
      }

      // Obtener token FCM
      const token = await messaging.getToken({ vapidKey: VAPID_KEY });
      if (token) {
        await NotificationService.saveToken(token);
      }

      // Escuchar mensajes cuando la app está en primer plano
      messaging.onMessage((payload) => {
        const { title, body } = payload.notification || {};
        NotificationService.showToast(title || 'KineSport PR', body || '');
      });

    } catch (err) {
      console.error('Error iniciando FCM:', err);
    }
  },

  // ── Guarda el token FCM del usuario en Firestore ──────────
  async saveToken(token) {
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('users').doc(user.uid).update({ fcmToken: token });
  },

  // ── Muestra un toast de notificación en la UI ─────────────
  showToast(title, body) {
    const toast      = document.getElementById('ks-toast');
    const toastTitle = document.getElementById('ks-toast-title');
    const toastBody  = document.getElementById('ks-toast-body');
    if (!toast) return;

    toastTitle.textContent = title;
    toastBody.textContent  = body;
    toast.classList.remove('translate-y-full', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
      toast.classList.add('translate-y-full', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 5000);
  },

  // ── Enviar notificación a un usuario (desde admin) ────────
  // Esto guarda en Firestore; un Cloud Function lo enviaría via FCM.
  // Para producción, implementar Cloud Function trigger.
  async sendToUser(userId, title, body) {
    await db.collection('notifications').add({
      userId,
      title,
      body,
      read:      false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // ── Contar notificaciones no leídas ──────────────────────
  async getUnreadCount(userId) {
    const snap = await db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();
    return snap.size;
  },

  // ── Marcar notificación como leída ────────────────────────
  async markAsRead(notifId) {
    await db.collection('notifications').doc(notifId).update({ read: true });
  },

  // ── Habilitar notificaciones manualmente (toggle) ─────────
  async enable() {
    if (!('Notification' in window) || !firebase.messaging.isSupported()) {
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    try {
      const messaging = firebase.messaging();
      const token = await messaging.getToken({ vapidKey: VAPID_KEY });
      if (token) {
        await NotificationService.saveToken(token);
        messaging.onMessage((payload) => {
          const { title, body } = payload.notification || {};
          NotificationService.showToast(title || 'KineSport', body || '');
        });
      }
      return 'granted';
    } catch (err) {
      console.error('FCM enable error:', err);
      return 'error';
    }
  },

  // ── Deshabilitar notificaciones (quitar token) ────────────
  async disable() {
    const user = auth.currentUser;
    if (!user) return;
    await db.collection('users').doc(user.uid).update({ fcmToken: '' });
  },

  // ── Estado actual del permiso ─────────────────────────────
  getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'granted', 'denied', 'default'
  }
};
