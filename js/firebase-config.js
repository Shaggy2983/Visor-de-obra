/* Configuración del proyecto de Firebase de COORDINATE (cuentas de
   usuario, obras compartidas y sincronización).

   Se copia de la consola de Firebase: Configuración del proyecto →
   General → Tus apps → app web → «firebaseConfig». Estos valores no son
   secretos: identifican el proyecto, y lo que protege los datos son las
   reglas de seguridad (firestore.rules y storage.rules).

   Mientras apiKey esté vacío, la app funciona como siempre, sólo en el
   teléfono, y no aparece nada de cuentas ni equipo. */
export const FIREBASE = {
  apiKey: 'AIzaSyBwEKtgXTfq_mXo0ow7payIS2Gw_aqDXtE',
  authDomain: 'coordinate-b7759.firebaseapp.com',
  projectId: 'coordinate-b7759',
  storageBucket: 'coordinate-b7759.firebasestorage.app',
  messagingSenderId: '181407868247',
  appId: '1:181407868247:web:3f2568421b9a635bcdca12'
};

/* Para probar con los emuladores locales: abrir la app con ?emulador=1. */
export const EMULADOR = new URLSearchParams(location.search).has('emulador');
