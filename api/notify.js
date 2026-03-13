// ============================================================
// Vercel Serverless Function — Enviar push al admin via FCM
// ============================================================
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    )
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { type, userName, service, date, time } = req.body;

    const isCancellation = type === 'cancellation';
    const title = isCancellation ? '❌ Cita cancelada' : '📅 Nueva cita solicitada';
    const body  = isCancellation
      ? `${userName} canceló ${service} del ${date} a las ${time}`
      : `${userName} reservó ${service} el ${date} a las ${time}`;

    // Buscar todos los admins y obtener sus FCM tokens
    const db = admin.firestore();
    const snap = await db.collection('users').where('role', '==', 'admin').get();

    const tokens = snap.docs
      .map(d => d.data().fcmToken)
      .filter(Boolean);

    if (tokens.length === 0) {
      return res.status(200).json({ message: 'No hay tokens de admin registrados' });
    }

    // Enviar push como data-only para que solo el service worker lo muestre (evita doble notificación)
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title, body },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: 'https://kinesportpr.com/admin.html' }
      }
    });

    res.status(200).json({ success: true, sent: result.successCount, failed: result.failureCount });

  } catch (err) {
    console.error('[notify]', err);
    res.status(500).json({ error: err.message });
  }
};
