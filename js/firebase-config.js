/* Configuración del proyecto de Firebase de COORDINATE (cuentas de
   usuario, obras compartidas y sincronización).

   Se copia de la consola de Firebase: Configuración del proyecto →
   General → Tus apps → app web → «firebaseConfig». Estos valores no son
   secretos: identifican el proyecto, y lo que protege los datos son las
   reglas de seguridad (firestore.rules y storage.rules).

   Mientras apiKey esté vacío, la app funciona como siempre, sólo en el
   teléfono, y no aparece nada de cuentas ni equipo. */
export const FIREBASE = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* Para probar con los emuladores locales: abrir la app con ?emulador=1. */
export const EMULADOR = new URLSearchParams(location.search).has('emulador');
