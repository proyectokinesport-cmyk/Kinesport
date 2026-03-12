// ============================================================
// FIREBASE CONFIG — Reemplaza con tus credenciales reales
// Firebase Console → Project Settings → General → Your apps
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyDitx8gX34FKh9Wb_sGU_beFqZrzg8p-eo",
  authDomain:        "kinesport-3ab0c.firebaseapp.com",
  projectId:         "kinesport-3ab0c",
  storageBucket:     "kinesport-3ab0c.firebasestorage.app",
  messagingSenderId: "853047186966",
  appId:             "1:853047186966:web:dce874b0c82ca91cf70737"
};

// ============================================================
// ADMIN EMAILS — Usuarios que se registran con estos emails
// automáticamente reciben el rol 'admin'
// ============================================================
const ADMIN_EMAILS = [
  'rivrra@gmail.com'
  // Agrega más emails admin aquí
];

// ============================================================
// VAPID KEY — Firebase Console → Project Settings →
// Cloud Messaging → Web Push certificates → Key pair
// ============================================================
const VAPID_KEY = 'BGlmv5i6SPjhq7q1jz1Egm1krsXQtrxk-THra-PDIPvpPppeezffAfDBEwzsVUQXde2tU0rBVCNhTxm0fiYOXw4';

// ============================================================
// Inicialización (no modificar)
// ============================================================
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// Habilitar persistencia offline para Firestore
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence: múltiples tabs abiertas.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence: no soportado por el navegador.');
  }
});
