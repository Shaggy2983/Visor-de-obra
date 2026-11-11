/* Guarda el último IFC abierto dentro del teléfono (IndexedDB), para que
   la app arranque con el modelo puesto aunque no haya cobertura, y la
   geometría ya procesada de ese mismo archivo, para que la segunda vez
   abra en segundos en lugar de volver a teselarlo. */

import { abrirBase } from './bd.js';

const BASE = 'coordinate-obra-modelo';
const HEREDADA = 'visor-obra-e04';   // nombre de las primeras versiones; se muda sola
const TABLA = 'modelos';
const GEOMETRIA = 'geometria';
const CLAVE = 'ultimo';

function abrir() {
  return abrirBase(BASE, 2, (bd) => {
    for (const t of [TABLA, GEOMETRIA]) {
      if (!bd.objectStoreNames.contains(t)) bd.createObjectStore(t);
    }
  }, HEREDADA);
}

function transaccion(bd, modo, tabla = TABLA) {
  return bd.transaction(tabla, modo).objectStore(tabla);
}

/* Geometría procesada del último modelo: {firma, lotes, listo}. La firma
   es la huella del archivo IFC; si no coincide, no sirve. */
export async function guardarGeometria(firma, contenido) {
  try {
    const bd = await abrir();
    await new Promise((cumplir, fallar) => {
      const p = transaccion(bd, 'readwrite', GEOMETRIA).put({ firma, ...contenido, fecha: Date.now() }, CLAVE);
      p.onsuccess = cumplir;
      p.onerror = () => fallar(p.error);
    });
    bd.close();
    return true;
  } catch (e) {
    return false;   // sin espacio: la próxima vez se vuelve a procesar
  }
}

export async function leerGeometria(firma) {
  try {
    const bd = await abrir();
    const g = await new Promise((cumplir, fallar) => {
      const p = transaccion(bd, 'readonly', GEOMETRIA).get(CLAVE);
      p.onsuccess = () => cumplir(p.result || null);
      p.onerror = () => fallar(p.error);
    });
    bd.close();
    return g && g.firma === firma ? g : null;
  } catch (e) {
    return null;
  }
}

export async function guardarModelo(nombre, datos) {
  try {
    const bd = await abrir();
    await new Promise((cumplir, fallar) => {
      const p = transaccion(bd, 'readwrite').put({ nombre, datos, fecha: Date.now() }, CLAVE);
      p.onsuccess = cumplir;
      p.onerror = () => fallar(p.error);
    });
    bd.close();
    return true;
  } catch (e) {
    // Sin espacio o en modo privado: no es motivo para romper nada.
    return false;
  }
}

export async function leerModelo() {
  try {
    const bd = await abrir();
    const guardado = await new Promise((cumplir, fallar) => {
      const p = transaccion(bd, 'readonly').get(CLAVE);
      p.onsuccess = () => cumplir(p.result || null);
      p.onerror = () => fallar(p.error);
    });
    bd.close();
    return guardado;
  } catch (e) {
    return null;
  }
}

export async function olvidarModelo() {
  try {
    const bd = await abrir();
    await new Promise((cumplir) => {
      const t = bd.transaction([TABLA, GEOMETRIA], 'readwrite');
      t.objectStore(TABLA).delete(CLAVE);
      t.objectStore(GEOMETRIA).delete(CLAVE);
      t.oncomplete = cumplir;
      t.onerror = cumplir;
    });
    bd.close();
  } catch (e) { /* nada que borrar */ }
}
