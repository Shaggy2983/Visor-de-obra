/* Partes de visita diaria guardados en el teléfono (IndexedDB). Cada visita
   es un registro con sus fotos y su firma dentro, como Blob, para que todo
   siga ahí aunque no haya cobertura. Va en su propia base para no tocar la
   del modelo IFC.

   Los planos van en una tabla aparte: se cargan una vez por obra y los
   usan todas las visitas. Las notas puestas sobre un plano sí son de cada
   visita y viajan dentro de ella.

   Los repasos del punch list tampoco son de una visita sino de la obra:
   siguen abiertos de visita en visita hasta que se cierran, y sus fotos
   se guardan una sola vez.

   Con una cuenta de equipo, lo de las obras compartidas se sincroniza
   (js/equipo.js). Para eso cada guardado avisa con el evento «crd-cambio»
   (salvo los que hace la propia sincronización, que van «callados»), y
   cada borrado de algo ya compartido deja una baja pendiente de subir.
   Las tablas «sinc» y «subidos» son de la sincronización: la versión de
   cada registro que ya está en la nube y los archivos ya subidos. */

// Nombre heredado de la primera versión: cambiarlo dejaría huérfanas las
// visitas ya guardadas en los teléfonos.
const BASE = 'visitas-obra-e04';
const TABLA = 'visitas';
const PLANOS = 'planos';
const REPASOS = 'repasos';
const BAJAS = 'bajas';
const SINC = 'sinc';
const SUBIDOS = 'subidos';
const INSPECCIONES = 'inspecciones';
const VACIADOS = 'vaciados';

function abrir() {
  return new Promise((cumplir, fallar) => {
    const peticion = indexedDB.open(BASE, 5);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      for (const tabla of [TABLA, PLANOS, REPASOS, BAJAS, SINC, INSPECCIONES, VACIADOS]) {
        if (!bd.objectStoreNames.contains(tabla)) bd.createObjectStore(tabla, { keyPath: 'id' });
      }
      if (!bd.objectStoreNames.contains(SUBIDOS)) bd.createObjectStore(SUBIDOS, { keyPath: 'ruta' });
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

function avisarCambio(callado) {
  if (!callado) dispatchEvent(new CustomEvent('crd-cambio'));
}

/* Al borrar algo que ya está en una obra compartida, queda una baja para
   borrarlo también de la nube en la próxima sincronización. */
async function borrarConBaja(tabla, tipo, id, callado) {
  const previo = await operar('readonly', (t) => t.get(id), tabla);
  await operar('readwrite', (t) => t.delete(id), tabla);
  if (!callado && previo && previo.obraId) {
    await operar('readwrite', (t) => t.put({ id: `${tipo}:${id}`, tipo, registro: id, obraId: previo.obraId, cuando: Date.now() }), BAJAS);
  }
  avisarCambio(callado);
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

export async function guardarVisita(visita, { callado = false } = {}) {
  await operar('readwrite', (t) => t.put(visita));
  avisarCambio(callado);
}

export function borrarVisita(id, { callado = false } = {}) {
  return borrarConBaja(TABLA, 'visitas', id, callado);
}

/* --- planos --- */

export async function listarPlanos() {
  const todos = await operar('readonly', (t) => t.getAll(), PLANOS);
  return (todos || []).sort((a, b) => a.creado - b.creado);
}

export function leerPlano(id) {
  return operar('readonly', (t) => t.get(id), PLANOS).then((p) => p || null);
}

export async function guardarPlano(plano, { callado = false } = {}) {
  await operar('readwrite', (t) => t.put(plano), PLANOS);
  avisarCambio(callado);
}

export function borrarPlano(id, { callado = false } = {}) {
  return borrarConBaja(PLANOS, 'planos', id, callado);
}

/* --- repasos del punch list --- */

export async function listarRepasos() {
  return (await operar('readonly', (t) => t.getAll(), REPASOS)) || [];
}

export function leerRepaso(id) {
  return operar('readonly', (t) => t.get(id), REPASOS).then((r) => r || null);
}

export async function guardarRepaso(repaso, { callado = false } = {}) {
  await operar('readwrite', (t) => t.put(repaso), REPASOS);
  avisarCambio(callado);
}

export function borrarRepaso(id, { callado = false } = {}) {
  return borrarConBaja(REPASOS, 'repasos', id, callado);
}

/* --- calidad: inspecciones (protocolos de liberación) y vaciados de
   hormigón. Como los repasos, son de la obra y no de una visita. --- */

const porFecha = (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0);

export async function listarInspecciones() {
  return ((await operar('readonly', (t) => t.getAll(), INSPECCIONES)) || []).sort(porFecha);
}

export function leerInspeccion(id) {
  return operar('readonly', (t) => t.get(id), INSPECCIONES).then((r) => r || null);
}

export async function guardarInspeccion(r, { callado = false } = {}) {
  await operar('readwrite', (t) => t.put(r), INSPECCIONES);
  avisarCambio(callado);
}

export function borrarInspeccion(id, { callado = false } = {}) {
  return borrarConBaja(INSPECCIONES, 'inspecciones', id, callado);
}

export async function listarVaciados() {
  return ((await operar('readonly', (t) => t.getAll(), VACIADOS)) || []).sort(porFecha);
}

export function leerVaciado(id) {
  return operar('readonly', (t) => t.get(id), VACIADOS).then((r) => r || null);
}

export async function guardarVaciado(r, { callado = false } = {}) {
  await operar('readwrite', (t) => t.put(r), VACIADOS);
  avisarCambio(callado);
}

export function borrarVaciado(id, { callado = false } = {}) {
  return borrarConBaja(VACIADOS, 'vaciados', id, callado);
}

/* --- estado de la sincronización --- */

export async function listarBajas() {
  return (await operar('readonly', (t) => t.getAll(), BAJAS)) || [];
}

export function quitarBaja(id) {
  return operar('readwrite', (t) => t.delete(id), BAJAS);
}

/* Versión de un registro que ya está en la nube (0 si no está). */
export async function versionSincronizada(tipo, id) {
  const r = await operar('readonly', (t) => t.get(`${tipo}:${id}`), SINC);
  return r ? r.version : 0;
}

export function anotarSincronizada(tipo, id, version) {
  return operar('readwrite', (t) => t.put({ id: `${tipo}:${id}`, version }), SINC);
}

export async function estaSubido(ruta) {
  return Boolean(await operar('readonly', (t) => t.get(ruta), SUBIDOS));
}

export function anotarSubido(ruta) {
  return operar('readwrite', (t) => t.put({ ruta }), SUBIDOS);
}
