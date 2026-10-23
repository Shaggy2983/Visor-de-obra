/* Seguimiento de obra: programa de avance por partidas (curva S), minutas
   de reunión con acuerdos y días afectados (lluvia, paro…). Aquí van los
   datos y las cuentas; la pantalla está en js/seguimiento.js.

   Avance: cada partida tiene un peso (lo que pesa en la obra, en %), sus
   fechas programadas de inicio y fin y los avances anotados (fecha y %
   acumulado). Lo programado de una partida crece en línea recta entre su
   inicio y su fin; el avance de la obra es la media ponderada por pesos. */

import { nuevoId, hoy, ahora, mismaObra } from './utiles.js';
import { listarMinutas } from './partes.js';

/* ------------------------------------------------------------------ */
/* días afectados                                                      */
/* ------------------------------------------------------------------ */

export const CAUSAS = {
  lluvia: 'Lluvia',
  paro: 'Paro o huelga',
  material: 'Falta de material',
  personal: 'Falta de personal',
  equipo: 'Avería de equipo',
  suspension: 'Orden de suspensión',
  feriado: 'Feriado',
  otro: 'Otra causa'
};

const JORNADA_HORAS = 8;

/* Un día por fecha (si hay varias visitas, la más afectada). Sin
   actividad = 1 día; parcial = horas perdidas / 8 (o medio día si no se
   anotaron horas). */
export function diasAfectados(visitas, obra) {
  const porFecha = new Map();
  for (const v of visitas) {
    if (obra && !mismaObra(v.obra, obra)) continue;
    if (!v.jornada || v.jornada === 'Normal') continue;
    const a = v.afectacion || {};
    const horas = parseFloat(String(a.horas || '').replace(',', '.'));
    const dias = v.jornada === 'Sin actividad' ? 1 : Number.isFinite(horas) ? Math.min(1, horas / JORNADA_HORAS) : 0.5;
    const d = { fecha: v.fecha, obra: v.obra, jornada: v.jornada, causa: a.causa || '', horas: Number.isFinite(horas) ? horas : null, nota: a.nota || '', autor: v.autor || '', dias, visita: v.id };
    const previo = porFecha.get(`${v.obra}|${v.fecha}`);
    if (!previo || d.dias > previo.dias) porFecha.set(`${v.obra}|${v.fecha}`, d);
  }
  return [...porFecha.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function totalesPorCausa(dias) {
  const t = new Map();
  for (const d of dias) {
    const k = d.causa || 'sin';
    t.set(k, (t.get(k) || 0) + d.dias);
  }
  return [...t.entries()].sort((a, b) => b[1] - a[1]);
}

/* ------------------------------------------------------------------ */
/* programa de avance                                                  */
/* ------------------------------------------------------------------ */

/* Partidas típicas de un edificio, con pesos de referencia (suman 100).
   Son un punto de partida: cada obra pone los suyos (del presupuesto). */
export const PARTIDAS_EDIFICACION = [
  ['Preliminares y movimiento de tierra', 4],
  ['Cimentación', 10],
  ['Estructura de hormigón', 26],
  ['Mampostería', 8],
  ['Instalaciones sanitarias', 7],
  ['Instalaciones eléctricas', 8],
  ['Pañete y terminación de muros', 8],
  ['Pisos y revestimientos', 9],
  ['Carpintería, puertas y ventanas', 8],
  ['Pintura', 5],
  ['Equipos y terminaciones', 5],
  ['Limpieza y entrega', 2]
];

const slug = (t) => (t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Un programa por obra, con id fijo a partir del nombre: así dos teléfonos
   que lo crean a la vez escriben el mismo documento. */
export const idPrograma = (obra) => `prog-${slug(obra) || 'obra'}`;

export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + Number(dias || 0));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export function diasEntre(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export function nuevoPrograma({ obra, inicio = hoy(), fin = sumarDias(hoy(), 180), tipicas = true }) {
  const total = diasEntre(inicio, fin) || 1;
  // Las partidas típicas se reparten en cascada a lo largo del plazo.
  const partidas = tipicas ? PARTIDAS_EDIFICACION.map(([nombre, peso], i, todas) => {
    const n = todas.length;
    const a = Math.round((i / n) * total * 0.85);
    const b = Math.round(Math.min(total, a + total * 0.3 + (peso / 100) * total));
    return { id: nuevoId(), nombre, peso, inicio: sumarDias(inicio, a), fin: sumarDias(inicio, b), avances: [] };
  }) : [];
  return { id: idPrograma(obra), obra, inicio, fin, partidas, creado: Date.now(), modificado: Date.now() };
}

export const pesoTotal = (p) => p.partidas.reduce((s, x) => s + (Number(x.peso) || 0), 0);

export function programadoPartida(x, fecha) {
  if (!x.inicio || !x.fin) return 0;
  if (fecha < x.inicio) return 0;
  if (fecha >= x.fin) return 100;
  const total = diasEntre(x.inicio, x.fin) || 1;
  return Math.max(0, Math.min(100, (diasEntre(x.inicio, fecha) / total) * 100));
}

export function realPartida(x, fecha) {
  let ultimo = null;
  for (const a of x.avances || []) if (a.fecha <= fecha && (!ultimo || a.fecha >= ultimo.fecha)) ultimo = a;
  return ultimo ? Number(ultimo.pct) || 0 : 0;
}

function ponderado(p, fecha, fn) {
  const total = pesoTotal(p);
  if (!total) return 0;
  return p.partidas.reduce((s, x) => s + (Number(x.peso) || 0) * fn(x, fecha), 0) / total;
}

export const programado = (p, fecha) => ponderado(p, fecha, programadoPartida);
export const real = (p, fecha) => ponderado(p, fecha, realPartida);

/* Fechas de la curva: semanales desde el inicio hasta el fin (o hasta hoy
   si la obra va retrasada), con el último día siempre incluido. */
export function curva(p, dia = hoy()) {
  if (!p.inicio || !p.fin) return [];
  const fin = p.fin > dia ? p.fin : dia;
  const puntos = [];
  for (let f = p.inicio; f <= fin; f = sumarDias(f, 7)) puntos.push(f);
  if (puntos.at(-1) !== fin) puntos.push(fin);
  if (dia > p.inicio && dia < fin && !puntos.includes(dia)) puntos.push(dia);
  puntos.sort();
  return puntos.map((fecha) => ({ fecha, programado: programado(p, fecha), real: fecha <= dia ? real(p, fecha) : null }));
}

/* Anotar el % de una partida en una fecha: sustituye el de ese día. */
export function anotarAvance(x, pct, fecha = hoy(), autor = '') {
  const valor = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  x.avances = (x.avances || []).filter((a) => a.fecha !== fecha);
  x.avances.push({ fecha, pct: valor, autor, hora: ahora() });
  x.avances.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function indicadores(p, dia = hoy()) {
  const prog = programado(p, dia);
  const re = real(p, dia);
  return { programado: prog, real: re, desviacion: re - prog, spi: prog > 0 ? re / prog : null };
}

/* ------------------------------------------------------------------ */
/* minutas                                                             */
/* ------------------------------------------------------------------ */

export function numeroDe(lista, obra) {
  return lista.filter((r) => mismaObra(r.obra, obra)).reduce((m, r) => Math.max(m, r.numero || 0), 0) + 1;
}

export const codigo = (prefijo, n) => `${prefijo}-${String(n || 0).padStart(3, '0')}`;

/* Una minuta nueva trae los asistentes y los acuerdos abiertos de la
   anterior de la misma obra: el seguimiento de una reunión a la otra. */
export function nuevaMinuta({ obra, numero, anterior = null, convoca = '' }) {
  return {
    id: nuevoId(),
    obra,
    numero,
    fecha: hoy(),
    hora: ahora(),
    lugar: anterior ? anterior.lugar : '',
    convoca: anterior ? anterior.convoca : convoca,
    asistentes: anterior ? anterior.asistentes.map((a) => ({ ...a, id: nuevoId(), presente: true })) : [],
    temas: '',
    acuerdos: anterior ? anterior.acuerdos.filter((a) => a.estado !== 'cumplido').map((a) => ({ ...a, origen: a.origen || anterior.numero })) : [],
    proxima: '',
    observaciones: '',
    creado: Date.now(),
    modificado: Date.now()
  };
}

export function nuevoAcuerdo(numeroMinuta) {
  return { id: nuevoId(), texto: '', responsable: '', limite: '', estado: 'abierto', cumplido: null, origen: numeroMinuta };
}

export const vencido = (a, dia = hoy()) => a.estado !== 'cumplido' && a.limite && a.limite < dia;

/* Acuerdos abiertos de la última minuta de cada obra. */
export function acuerdosAbiertos(minutas, dia = hoy()) {
  const ultimas = new Map();
  for (const m of minutas) {
    const k = (m.obra || '').trim().toLowerCase();
    const u = ultimas.get(k);
    if (!u || (m.fecha + m.hora) > (u.fecha + u.hora)) ultimas.set(k, m);
  }
  const salida = [];
  for (const m of ultimas.values()) for (const a of m.acuerdos) if (a.estado !== 'cumplido') salida.push({ minuta: m, acuerdo: a, vencido: vencido(a, dia) });
  return salida;
}

/* Acuerdos vencidos para el aviso del inicio y el punto rojo del menú
   (localStorage «crd-acuerdos-vencidos»). */
export async function resumenSeguimiento(dia = hoy()) {
  const abiertos = acuerdosAbiertos(await listarMinutas(), dia);
  const r = { abiertos: abiertos.length, vencidos: abiertos.filter((x) => x.vencido).length };
  try { localStorage.setItem('crd-acuerdos-vencidos', String(r.vencidos)); } catch (e) { /* sin almacenamiento */ }
  if (window.crdMenu) window.crdMenu.avisos();
  return r;
}
