// ============================================================
// AUTH SERVICE — Maneja login, registro, logout y roles
// ============================================================
const AuthService = {

  // ── Registro de nuevo usuario ─────────────────────────────
  async register({ name, email, password, phone, acceptedTerms }) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const role = ADMIN_EMAILS.includes(email.toLowerCase().trim()) ? 'admin' : 'client';

    await cred.user.updateProfile({ displayName: name });

    await db.collection('users').doc(cred.user.uid).set({
      name:              name,
      email:             email.toLowerCase().trim(),
      phone:             phone || '',
      role:              role,
      acceptedTerms:     acceptedTerms,
      acceptedTermsAt:   firebase.firestore.FieldValue.serverTimestamp(),
      fcmToken:          null,
      createdAt:         firebase.firestore.FieldValue.serverTimestamp()
    });

    return { user: cred.user, role };
  },

  // ── Login ─────────────────────────────────────────────────
  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  // ── Logout ────────────────────────────────────────────────
  async logout() {
    await auth.signOut();
    window.location.href = '/login.html';
  },

  // ── Obtener datos del usuario actual desde Firestore ──────
  async getCurrentUserData() {
    const user = auth.currentUser;
    if (!user) return null;
    const doc = await db.collection('users').doc(user.uid).get();
    return doc.exists ? { uid: user.uid, ...doc.data() } : null;
  },

  // ── Proteger página (requiere login) ─────────────────────
  // Si el usuario es admin, lo redirige a admin.html (a menos que
  // skipAdminRedirect sea true)
  requireAuth(skipAdminRedirect = false) {
    return new Promise((resolve) => {
      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.location.href = '/login.html';
          return;
        }
        try {
          const userData = await AuthService.getCurrentUserData();
          if (!skipAdminRedirect && userData?.role === 'admin') {
            window.location.href = '/admin.html';
            return;
          }
          resolve(userData);
        } catch (e) {
          console.error('Error obteniendo usuario:', e);
          window.location.href = '/login.html';
        }
      });
    });
  },

  // ── Proteger página de admin ──────────────────────────────
  requireAdmin() {
    return new Promise((resolve) => {
      auth.onAuthStateChanged(async (user) => {
        if (!user) {
          window.location.href = '/login.html';
          return;
        }
        try {
          const userData = await AuthService.getCurrentUserData();
          if (userData?.role !== 'admin') {
            window.location.href = '/index.html';
            return;
          }
          resolve(userData);
        } catch (e) {
          window.location.href = '/login.html';
        }
      });
    });
  },

  // ── Redirigir si ya está autenticado (para login/register) ─
  redirectIfLoggedIn() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const userData = await AuthService.getCurrentUserData();
      window.location.href = userData?.role === 'admin' ? '/admin.html' : '/index.html';
    });
  }
};
