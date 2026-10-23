/* Control de obra: consultas (RFI), órdenes de cambio, recepción de
   materiales y seguridad (charlas, EPP, permisos de trabajo e
   incidentes). Datos, plantillas y cuentas; la pantalla está en
   js/control.js. Todo es por obra y lleva número correlativo. */

import { nuevoId, hoy, ahora, mismaObra } from './utiles.js';
import { listarRfis, listarCambios, listarRecepciones, listarSeguridad } from './partes.js';

export const codigo = (prefijo, n) => `${prefijo}-${String(n || 0).padStart(3, '0')}`;
export const numeroDe = (lista, obra) => lista.filter((r) => mismaObra(r.obra, obra)).reduce((m, r) => Math.max(m, r.numero || 0), 0) + 1;
export const num = (x) => { const n = parseFloat(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

export function diasEntre(a, b) {
  if (!a || !b) return null;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

const base = (obra, numero) => ({ id: nuevoId(), obra, numero, fecha: hoy(), hora: ahora(), fotos: [], creado: Date.now(), modificado: Date.now() });

/* ------------------------------------------------------------------ */
/* RFI                                                                 */
/* ------------------------------------------------------------------ */

export const DISCIPLINAS = {
  ARQ: 'Arquitectura', EST: 'Estructura', HDS: 'Hidrosanitaria', SAN: 'Sanitaria', ELE: 'Eléctrica',
  MEC: 'Mecánica / climatización', PCI: 'Protección contra incendios', FAC: 'Fachada', URB: 'Urbanización'
};
export const ESTADOS_RFI = { abierta: 'Abierta', respondida: 'Respondida', cerrada: 'Cerrada' };

export function nuevaRfi({ obra, numero, autor = '' }) {
  return {
    ...base(obra, numero),
    asunto: '', disciplina: 'ARQ', referencia: '', pregunta: '', propuesta: '',
    dirigidaA: '', solicita: autor, requerida: '', estado: 'abierta',
    respuesta: '', respondePor: '', fechaRespuesta: '', costo: false, plazo: false, cambio: ''
  };
}

/* Días de espera: desde que se hizo hasta la respuesta (o hasta hoy). */
export const esperaRfi = (r, dia = hoy()) => diasEntre(r.fecha, r.estado === 'abierta' ? dia : (r.fechaRespuesta || dia));
export const rfiVencida = (r, dia = hoy()) => r.estado === 'abierta' && r.requerida && r.requerida < dia;

/* ------------------------------------------------------------------ */
/* órdenes de cambio                                                   */
/* ------------------------------------------------------------------ */

export const TIPOS_CAMBIO = { adicional: 'Adicional', deductivo: 'Deductivo', sinCosto: 'Sin costo' };
export const ESTADOS_CAMBIO = { borrador: 'Borrador', enviada: 'Enviada', aprobada: 'Aprobada', rechazada: 'Rechazada' };
export const MONEDAS = ['RD$', 'USD'];
export const ORIGENES = { cliente: 'Pedido del cliente', diseno: 'Cambio de diseño', obra: 'Condición de obra', rfi: 'Respuesta a una RFI', otro: 'Otro' };

export function nuevoCambio({ obra, numero, autor = '' }) {
  return {
    ...base(obra, numero),
    titulo: '', origen: 'cliente', rfi: '', tipo: 'adicional', descripcion: '',
    moneda: 'RD$', partidas: [], plazo: '', estado: 'borrador',
    solicita: autor, aprueba: '', fechaAprobacion: '', observaciones: ''
  };
}

export const nuevaLineaCambio = () => ({ id: nuevoId(), descripcion: '', unidad: 'ud', cantidad: '', precio: '' });
export const importeLinea = (l) => (num(l.cantidad) || 0) * (num(l.precio) || 0);
export const totalCambio = (c) => c.partidas.reduce((s, l) => s + importeLinea(l), 0);
/* Con signo: los deductivos restan del contrato. */
export const totalConSigno = (c) => (c.tipo === 'deductivo' ? -1 : c.tipo === 'sinCosto' ? 0 : 1) * totalCambio(c);

/* ------------------------------------------------------------------ */
/* recepción de materiales                                             */
/* ------------------------------------------------------------------ */

export function nuevaRecepcion({ obra, numero, autor = '' }) {
  return { ...base(obra, numero), proveedor: '', conduce: '', orden: '', lineas: [], recibe: autor, observaciones: '' };
}

export const nuevaLineaMaterial = () => ({ id: nuevoId(), descripcion: '', unidad: 'ud', pedida: '', recibida: '', rechazada: '', nota: '' });

export function estadoRecepcion(r) {
  let parcial = false, rechazo = false;
  for (const l of r.lineas) {
    if ((num(l.rechazada) || 0) > 0) rechazo = true;
    const p = num(l.pedida), rec = num(l.recibida);
    if (p != null && rec != null && rec < p) parcial = true;
  }
  return rechazo ? 'rechazo' : parcial ? 'parcial' : r.lineas.length ? 'completa' : 'vacia';
}
export const ESTADOS_RECEPCION = { completa: 'Completa', parcial: 'Faltante', rechazo: 'Con rechazo', vacia: 'Sin líneas' };
export const faltanteLinea = (l) => Math.max(0, (num(l.pedida) || 0) - (num(l.recibida) || 0));

/* ------------------------------------------------------------------ */
/* seguridad                                                           */
/* ------------------------------------------------------------------ */

export const TIPOS_SST = {
  charla: 'Charla de 5 minutos',
  epp: 'Revisión de EPP',
  permiso: 'Permiso de trabajo',
  incidente: 'Incidente o casi accidente'
};
export const ICONOS_SST = { charla: '🗣️', epp: '🦺', permiso: '📄', incidente: '⚠️' };

export const EPP = ['Casco', 'Chaleco reflectivo', 'Botas de seguridad', 'Guantes', 'Lentes de seguridad', 'Protección auditiva', 'Arnés y línea de vida (en altura)', 'Mascarilla o respirador'];

export const PERMISOS = {
  altura: { nombre: 'Trabajo en altura', controles: ['Arnés de cuerpo completo y línea de vida anclada', 'Andamio o plataforma inspeccionados y con barandas', 'Área inferior señalizada y acordonada', 'Personal capacitado para altura', 'Escaleras en buen estado y amarradas'] },
  caliente: { nombre: 'Trabajo en caliente (soldadura, corte)', controles: ['Extintor a mano y vigente', 'Área sin materiales combustibles (radio 10 m)', 'Vigilante de fuego asignado', 'Careta, guantes y ropa adecuada', 'Ventilación suficiente'] },
  confinado: { nombre: 'Espacio confinado', controles: ['Atmósfera medida (oxígeno, gases)', 'Ventilación forzada', 'Vigía en la entrada', 'Plan de rescate y equipo listo', 'Comunicación permanente'] },
  excavacion: { nombre: 'Excavación y zanjas', controles: ['Taludes o entibado según profundidad', 'Servicios enterrados identificados', 'Material excavado a más de 60 cm del borde', 'Accesos y salidas con escalera', 'Borde señalizado y con baranda'] },
  electrico: { nombre: 'Trabajo eléctrico', controles: ['Circuito desenergizado y bloqueado (candado y tarjeta)', 'Ausencia de tensión verificada', 'Herramientas aisladas', 'Personal calificado', 'Área señalizada'] },
  izaje: { nombre: 'Izaje de cargas', controles: ['Grúa y accesorios inspeccionados', 'Operador y señalero calificados', 'Carga dentro de la capacidad', 'Radio de giro acordonado', 'Viento dentro de lo permitido'] }
};

export const CLASES_INCIDENTE = { casi: 'Casi accidente', material: 'Daño material', sinBaja: 'Accidente sin baja', conBaja: 'Accidente con baja' };

export function nuevoSst({ obra, numero, tipo = 'charla', autor = '' }) {
  const r = { ...base(obra, numero), tipo, responsable: autor, observaciones: '' };
  if (tipo === 'charla') Object.assign(r, { tema: '', duracion: '5', asistentes: [] });
  if (tipo === 'epp') Object.assign(r, { zona: '', personas: '', puntos: EPP.map((texto) => ({ id: nuevoId(), texto, valor: '', nota: '' })) });
  if (tipo === 'permiso') Object.assign(r, { clase: 'altura', zona: '', trabajo: '', ejecuta: '', desde: ahora(), hasta: '', controles: PERMISOS.altura.controles.map((texto) => ({ id: nuevoId(), texto, valor: '' })), autoriza: '', cerrado: false, cierre: '' });
  if (tipo === 'incidente') Object.assign(r, { clase: 'casi', lugar: '', descripcion: '', afectado: '', causas: '', acciones: '', accionResponsable: '', limite: '', cerrado: false });
  return r;
}

/* Días sin accidentes en una obra: desde el último con o sin baja. */
export function diasSinAccidentes(registros, obra, dia = hoy()) {
  const accidentes = registros.filter((r) => r.tipo === 'incidente' && (r.clase === 'conBaja' || r.clase === 'sinBaja') && (!obra || mismaObra(r.obra, obra)));
  if (!accidentes.length) return null;
  const ultimo = accidentes.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
  return diasEntre(ultimo, dia);
}

/* Permisos abiertos de días anteriores (se olvidó cerrarlos) e incidentes
   con acciones sin cerrar. */
export const permisoOlvidado = (r, dia = hoy()) => r.tipo === 'permiso' && !r.cerrado && r.fecha < dia;
export const incidenteAbierto = (r) => r.tipo === 'incidente' && !r.cerrado;

/* ------------------------------------------------------------------ */
/* avisos                                                              */
/* ------------------------------------------------------------------ */

/* Para el inicio y el punto rojo del menú (localStorage
   «crd-control-avisos»). */
export async function resumenControl(dia = hoy()) {
  const [rfis, cambios, recepciones, sst] = await Promise.all([listarRfis(), listarCambios(), listarRecepciones(), listarSeguridad()]);
  const r = {
    rfiVencidas: rfis.filter((x) => rfiVencida(x, dia)).length,
    rfiAbiertas: rfis.filter((x) => x.estado === 'abierta').length,
    cambiosPendientes: cambios.filter((x) => x.estado === 'enviada').length,
    faltantes: recepciones.filter((x) => estadoRecepcion(x) === 'parcial').length,
    permisos: sst.filter((x) => permisoOlvidado(x, dia)).length,
    incidentes: sst.filter(incidenteAbierto).length
  };
  try { localStorage.setItem('crd-control-avisos', String(r.rfiVencidas + r.permisos)); } catch (e) { /* sin almacenamiento */ }
  if (window.crdMenu) window.crdMenu.avisos();
  return r;
}
