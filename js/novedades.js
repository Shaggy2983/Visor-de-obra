/* Novedades del equipo: bitácoras, repasos, inspecciones y vaciados que otros han creado o
   cambiado en las obras compartidas y que todavía no has abierto.

   Las apunta la sincronización (equipo.js, al bajar) y se guardan en el
   teléfono por usuario (localStorage). Al abrir la visita se quitan. No
   sale nada del teléfono. */

const MAX = 100;
const clave = (uid) => `crd-novedades:${uid}`;

export function lista(uid) {
  if (!uid) return [];
  try { return JSON.parse(localStorage.getItem(clave(uid))) || []; } catch (e) { return []; }
}

function guardar(uid, items) {
  try { localStorage.setItem(clave(uid), JSON.stringify(items.slice(0, MAX))); } catch (e) { /* sin memoria */ }
  dispatchEvent(new CustomEvent('crd-novedades', { detail: { total: items.length } }));
}

/* Una novedad por registro: si vuelve a cambiar, se actualiza (y si era
   «nuevo» lo sigue siendo hasta que se abra). */
export function anotar(uid, items) {
  if (!uid || !items.length) return;
  const actuales = lista(uid);
  for (const n of items) {
    const previa = actuales.findIndex((x) => x.id === n.id);
    if (previa >= 0) {
      const p = actuales.splice(previa, 1)[0];
      n.nuevo = p.nuevo || n.nuevo;
    }
    actuales.unshift(n);
  }
  guardar(uid, actuales);
}

export function quitar(uid, id) {
  const actuales = lista(uid);
  const quedan = actuales.filter((x) => x.id !== id);
  if (quedan.length !== actuales.length) guardar(uid, quedan);
}

export function vaciar(uid) {
  guardar(uid, []);
}

export const deVisita = (uid, id) => lista(uid).find((x) => x.id === id) || null;

/* «3 bitácoras nuevas en Torre A · de Pedro y Ana». */
export function frase(items) {
  const visitas = items.filter((x) => x.tipo === 'visitas');
  const repasos = items.filter((x) => x.tipo === 'repasos');
  const obras = [...new Set(items.map((x) => x.obra))];
  const quienes = [...new Set(items.map((x) => x.quien).filter(Boolean))];
  const partes = [];
  if (visitas.length) {
    const nuevas = visitas.filter((x) => x.nuevo).length;
    partes.push(nuevas === visitas.length
      ? `${visitas.length} ${visitas.length === 1 ? 'bitácora nueva' : 'bitácoras nuevas'}`
      : `${visitas.length} ${visitas.length === 1 ? 'bitácora' : 'bitácoras'} con cambios`);
  }
  if (repasos.length) partes.push(`${repasos.length} ${repasos.length === 1 ? 'repaso' : 'repasos'} con cambios`);
  const calidad = items.filter((x) => x.tipo === 'inspecciones' || x.tipo === 'vaciados');
  if (calidad.length) partes.push(`${calidad.length} ${calidad.length === 1 ? 'registro' : 'registros'} de calidad`);
  if (!partes.length) return '';
  const donde = obras.length === 1 ? ` en ${obras[0]}` : ` en ${obras.length} obras`;
  const de = quienes.length ? ` · de ${quienes.length > 2 ? `${quienes.slice(0, 2).join(', ')} y otros` : quienes.join(' y ')}` : '';
  return `${partes.join(' y ')}${donde}${de}`;
}
