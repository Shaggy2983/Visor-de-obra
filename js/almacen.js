/* Guarda el último IFC abierto dentro del teléfono (IndexedDB), para que
   la app arranque con el modelo puesto aunque no haya cobertura. */

const BASE = 'visor-obra-e04';
const TABLA = 'modelos';
const CLAVE = 'ultimo';

function abrir() {
  return new Promise((cumplir, fallar) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(TABLA)) bd.createObjectStore(TABLA);
    };
    peticion.onsuccess = () => cumplir(peticion.result);
    peticion.onerror = () => fallar(peticion.error);
  });
}

function transaccion(bd, modo) {
  return bd.transaction(TABLA, modo).objectStore(TABLA);
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
      const p = transaccion(bd, 'readwrite').delete(CLAVE);
      p.onsuccess = cumplir;
      p.onerror = cumplir;
    });
    bd.close();
  } catch (e) { /* nada que borrar */ }
}
