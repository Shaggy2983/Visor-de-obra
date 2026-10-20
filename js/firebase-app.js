/* Carga perezosa de Firebase: el SDK (unos 600 KB) sólo se descarga si
   el proyecto está configurado, y una sola vez. Con ?emulador=1 se usa
   el Firebase local de pruebas (emuladores) en lugar del real. */

import { FIREBASE, EMULADOR } from './firebase-config.js';

const DEMO = {
  apiKey: 'demo',
  authDomain: 'demo-coordinate.firebaseapp.com',
  projectId: 'demo-coordinate',
  storageBucket: 'demo-coordinate.appspot.com',
  appId: 'demo'
};

export const configurado = () => EMULADOR || Boolean(FIREBASE.apiKey);

let carga = null;

export function cargarFirebase() {
  if (!carga) {
    carga = (async () => {
      const fb = await import('../vendor/firebase/firebase.js');
      const app = fb.initializeApp(EMULADOR ? DEMO : FIREBASE);
      const auth = fb.getAuth(app);
      const db = fb.getFirestore(app);
      const storage = fb.getStorage(app);
      if (EMULADOR) {
        fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
        fb.connectStorageEmulator(storage, '127.0.0.1', 9199);
      }
      auth.languageCode = 'es';
      return { fb, auth, db, storage };
    })();
  }
  return carga;
}
