/* Partes de visita diaria guardados en el teléfono (IndexedDB). Cada visita
   es un registro con sus fotos y su firma dentro, como Blob, para que todo
   siga ahí aunque no haya cobertura. Va en su propia base para no tocar la
   del modelo IFC. */

// Nombre heredado de la primera versión: cambiarlo dejaría huérfanas las
// visitas ya guardadas en los teléfonos.
const BASE = 'visitas-obra-e04';
const TABLA = 'visitas';

function abrir() {
  return new Promise((cumplir, fallar) => {
    const peticion = indexedDB.open(BASE, 1);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(TABLA)) {
        bd.createObjectStore(TABLA, { keyPath: 'id' });
      }
    };
    peticion.onsuccess = () => cumplir(peticion.result);
    peticion.onerror = () => fallar(peticion.error);
  });
}

async function operar(modo, hacer) {
  const bd = await abrir();
  try {
    return await new Promise((cumplir, fallar) => {
      const t = bd.transaction(TABLA, modo);
      const p = hacer(t.objectStore(TABLA));
      t.oncomplete = () => cumplir(p ? p.result : undefined);
      t.onerror = () => fallar(t.error);
      t.onabort = () => fallar(t.error);
    });
  } finally {
    bd.close();
  }
}

/* Más reciente primero: por fecha de la visita y, dentro del día, por hora. */
function orden(a, b) {
  return (b.fecha + b.hora).localeCompare(a.fecha + a.hora) || b.creada - a.creada;
}

export async function listarVisitas() {
  const todas = await operar('readonly', (t) => t.getAll());
  return (todas || []).sort(orden);
}

export function leerVisita(id) {
  return operar('readonly', (t) => t.get(id)).then((v) => v || null);
}

export function guardarVisita(visita) {
  return operar('readwrite', (t) => t.put(visita));
}

export function borrarVisita(id) {
  return operar('readwrite', (t) => t.delete(id));
}
