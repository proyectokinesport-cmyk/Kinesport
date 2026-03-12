# KineSport PR — Guía de Setup Completo

## PASO 1: Firebase — Crear Proyecto

1. Ve a [console.firebase.google.com](https://console.firebase.google.com)
2. Clic en **"Agregar proyecto"**
3. Nombre: `kinesport-pr`
4. Habilitar Google Analytics (opcional)
5. Crear proyecto

---

## PASO 2: Firebase — Activar Servicios

### Authentication
1. Sidebar → **Authentication** → Get started
2. Tab **"Sign-in method"** → Habilitar **Email/password**
3. Guardar

### Firestore Database
1. Sidebar → **Firestore Database** → Create database
2. Seleccionar **Production mode**
3. Elegir región: `us-east1` (Puerto Rico/East US)
4. Crear

### Subir las reglas de Firestore
1. Tab **"Rules"** en Firestore
2. Pegar el contenido de `firestore.rules`
3. Publicar

### Cloud Messaging (Push Notifications)
1. Sidebar → **Project Settings** → tab **"Cloud Messaging"**
2. En **"Web Push certificates"** → clic **"Generate key pair"**
3. Copiar la clave generada (VAPID Key)

---

## PASO 3: Obtener Credenciales Firebase

1. **Project Settings** → tab **"General"**
2. Scroll hasta **"Your apps"** → clic **"</>** (Web)"
3. App nickname: `kinesport-web`
4. ✅ Habilitar Firebase Hosting (opcional)
5. Clic "Register app"
6. Copiar el objeto `firebaseConfig`

---

## PASO 4: Configurar el Proyecto

Editar **2 archivos** con tus credenciales reales:

### `js/firebase-config.js`
```javascript
const firebaseConfig = {
  apiKey:            "tu-api-key",
  authDomain:        "tu-proyecto.firebaseapp.com",
  projectId:         "tu-proyecto-id",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "tu-sender-id",
  appId:             "tu-app-id"
};

const ADMIN_EMAILS = ['tu-email-admin@gmail.com'];  // ← tu email de admin

const VAPID_KEY = 'tu-vapid-key-aqui';  // ← del paso 2
```

### `firebase-messaging-sw.js`
Reemplazar los mismos valores de `firebaseConfig` en este archivo también.

---

## PASO 5: Crear Cuenta Admin

1. Abre la app
2. Ve a `/register.html`
3. Regístrate con el email que pusiste en `ADMIN_EMAILS`
4. Ese usuario automáticamente recibirá el rol `admin`

---

## PASO 6: GitHub — Subir el Proyecto

```bash
# Instalar Git si no lo tienes: https://git-scm.com

cd "c:/Users/bigio/OneDrive/Desktop/Proyecto KineSport"

git init
git add .
git commit -m "feat: initial KineSport PR app setup"

# Crear repositorio en github.com/new (nombre: kinesport-pr)
# Luego:
git branch -M main
git remote add origin https://github.com/TU_USUARIO/kinesport-pr.git
git push -u origin main
```

---

## PASO 7: Vercel — Deploy

### Opción A: Deploy desde GitHub (recomendado)
1. Ve a [vercel.com](https://vercel.com) → Sign in with GitHub
2. **"New Project"** → Import `kinesport-pr`
3. Framework Preset: **Other**
4. Root Directory: `/` (dejar vacío)
5. **Deploy** ✅

### Opción B: Vercel CLI
```bash
npm install -g vercel
cd "c:/Users/bigio/OneDrive/Desktop/Proyecto KineSport"
vercel --prod
```

---

## PASO 8: Configurar dominio en Firebase Auth

Después de tener tu URL de Vercel (ej: `kinesport-pr.vercel.app`):

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Agregar tu dominio Vercel: `kinesport-pr.vercel.app`
3. Guardar

---

## PASO 9: Iconos PNG (para mejor compatibilidad)

Los iconos SVG funcionan en la mayoría de navegadores modernos.
Para máxima compatibilidad (especialmente iOS), genera PNGs:

1. Abre `icons/icon.svg` en el navegador
2. Usa [realfavicongenerator.net](https://realfavicongenerator.net) → subir el SVG
3. Descargar el paquete → copiar `favicon-192x192.png` y `favicon-512x512.png` a la carpeta `icons/`
4. Renombrarlos como `icon-192.png` y `icon-512.png`

---

## Estructura final del proyecto

```
Proyecto KineSport/
├── index.html              ← App principal (clientes)
├── login.html              ← Login
├── register.html           ← Registro con términos
├── admin.html              ← Panel admin
├── terms.html              ← Términos y condiciones
├── privacy.html            ← Política de privacidad
├── manifest.json           ← PWA config
├── service-worker.js       ← SW para offline + cache
├── firebase-messaging-sw.js← SW para push notifications
├── vercel.json             ← Config de Vercel
├── firestore.rules         ← Reglas de seguridad Firestore
├── .gitignore
├── js/
│   ├── firebase-config.js  ← ⚠️ Poner tus credenciales aquí
│   ├── auth.js
│   ├── notifications.js
│   ├── app.js
│   └── admin.js
└── icons/
    ├── icon.svg
    ├── icon-192.png        ← Generar con realfavicongenerator
    └── icon-512.png        ← Generar con realfavicongenerator
```

---

## Flujo de usuarios

| Acción | Resultado |
|--------|-----------|
| Usuario nuevo entra a la app | Redirige a `/login.html` |
| Clic "Crear cuenta" | Va a `/register.html` |
| Registro con email en `ADMIN_EMAILS` | Rol **admin** → redirige a `/admin.html` |
| Registro normal | Rol **cliente** → redirige a `/index.html` |
| Login como admin | Redirige a `/admin.html` |
| Login como cliente | Redirige a `/index.html` |

---

## Push Notifications — Flujo

1. Cliente abre la app → acepta permiso de notificaciones
2. FCM token se guarda en Firestore (`users/{uid}.fcmToken`)
3. Admin confirma/cancela una cita → se crea documento en `notifications/`
4. Para envío real de push desde servidor: implementar **Cloud Function** que
   escuche `notifications` collection y llame a FCM API

> **Nota:** Las notificaciones in-app (cuando el usuario tiene la app abierta)
> funcionan inmediatamente. Para notificaciones en background, necesitas una
> Cloud Function (Firebase Blaze plan).

---

## Comandos útiles

```bash
# Ver app localmente (necesita un servidor HTTP, no file://)
npx serve .
# Luego abre http://localhost:3000

# O con Python:
python -m http.server 3000
```
