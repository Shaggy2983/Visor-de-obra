/* Partes de visita diaria guardados en el teléfono (IndexedDB). Cada visita
   es un registro con sus fotos y su firma dentro, como Blob, para que todo
   siga ahí aunque no haya cobertura. Va en su propia base para no tocar la
   del modelo IFC.

   Los planos van en una tabla aparte: se cargan una vez por obra y los
   usan todas las visitas. Las notas puestas sobre un plano sí son de cada
   visita y viajan dentro de ella.

   Los repasos del punch list tampoco son de una visita sino de la obra:
   siguen abiertos de visita en visita hasta que se cierran, y sus fotos
   se guardan una sola vez. */

// Nombre heredado de la primera versión: cambiarlo dejaría huérfanas las
// visitas ya guardadas en los teléfonos.
const BASE = 'visitas-obra-e04';
const TABLA = 'visitas';
const PLANOS = 'planos';
const REPASOS = 'repasos';

function abrir() {
  return new Promise((cumplir, fallar) => {
    const peticion = indexedDB.open(BASE, 3);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      for (const tabla of [TABLA, PLANOS, REPASOS]) {
        if (!bd.objectStoreNames.contains(tabla)) bd.createObjectStore(tabla, { keyPath: 'id' });
      }
    };
    peticion.onsuccess = () => cumplir(peticion.result);
    peticion.onerror = () => fallar(peticion.error);
  });
}

async function operar(modo, hacer, tabla = TABLA) {
  const bd = await abrir();
  try {
    return await new Promise((cumplir, fallar) => {
      const t = bd.transaction(tabla, modo);
      const p = hacer(t.objectStore(tabla));
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

/* --- planos --- */

export async function listarPlanos() {
  const todos = await operar('readonly', (t) => t.getAll(), PLANOS);
  return (todos || []).sort((a, b) => a.creado - b.creado);
}

export function leerPlano(id) {
  return operar('readonly', (t) => t.get(id), PLANOS).then((p) => p || null);
}

export function guardarPlano(plano) {
  return operar('readwrite', (t) => t.put(plano), PLANOS);
}

export function borrarPlano(id) {
  return operar('readwrite', (t) => t.delete(id), PLANOS);
}

/* --- repasos del punch list --- */

export async function listarRepasos() {
  return (await operar('readonly', (t) => t.getAll(), REPASOS)) || [];
}

export function leerRepaso(id) {
  return operar('readonly', (t) => t.get(id), REPASOS).then((r) => r || null);
}

export function guardarRepaso(repaso) {
  return operar('readwrite', (t) => t.put(repaso), REPASOS);
}

export function borrarRepaso(id) {
  return operar('readwrite', (t) => t.delete(id), REPASOS);
}
