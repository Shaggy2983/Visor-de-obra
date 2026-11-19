/* Obra de ejemplo con datos inventados: una visita de ayer y otra de hoy,
   tres repasos del punch list y una inspección de acero. Sirve para que
   quien abre la app por primera vez (y los revisores de Google Play) vea
   cómo se llena sin tener que escribirlo todo. Todo lleva el id
   «ejemplo-…» y la obra OBRA_EJEMPLO, así se borra entero con un botón.
   Nunca datos reales de clientes. */
import {
  guardarVisita, borrarVisita, listarVisitas,
  guardarRepaso, borrarRepaso, listarRepasos,
  guardarInspeccion, borrarInspeccion, listarInspecciones
} from './partes.js';
import { nuevaInspeccion } from './calidad-datos.js';

export const OBRA_EJEMPLO = 'Residencial Los Pinos (ejemplo)';
const PREFIJO = 'ejemplo-';
export const esEjemplo = (r) => Boolean(r && (String(r.id || '').startsWith(PREFIJO) || r.id === 'guia-ejemplo'));

const dos = (n) => String(n).padStart(2, '0');
const dia = (desfase) => {
  const d = new Date();
  d.setDate(d.getDate() + desfase);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

function visita(id, fecha, extra) {
  const t = Date.now();
  return {
    id: PREFIJO + id,
    fecha,
    hora: '07:45',
    obra: OBRA_EJEMPLO,
    obraId: null,
    autor: 'Supervisor de ejemplo',
    clima: ['Soleado'],
    temperatura: '24 / 31 °C',
    jornada: 'Normal',
    afectacion: { causa: '', horas: '', nota: '' },
    personal: [
      { id: `${id}-p1`, empresa: 'Constructora Ejemplo', oficio: 'Albañiles', numero: '8' },
      { id: `${id}-p2`, empresa: 'Constructora Ejemplo', oficio: 'Varilleros', numero: '4' },
      { id: `${id}-p3`, empresa: 'Instalaciones Ejemplo', oficio: 'Electricistas', numero: '3' }
    ],
    trabajos: '',
    maquinaria: 'Mezcladora, vibrador, andamios',
    materiales: '',
    incidencias: [],
    fotos: [], notas: [], trazos: [], medidas: [],
    observaciones: '',
    firma: null,
    creada: t,
    modificada: t,
    ...extra
  };
}

export async function crearObraEjemplo() {
  const ayer = dia(-1);
  const hoyIso = dia(0);
  await guardarVisita(visita('v1', ayer, {
    trabajos: '07:50 · Replanteo de muros del nivel 2\n09:30 · Armado de columnas ejes B y C\n14:00 · Colocación de tuberías eléctricas en losa',
    materiales: '30 sacos de cemento, 2 t de varilla de 3/8"',
    incidencias: [
      { id: 'ejemplo-i1', texto: 'Falta acero de confinamiento en la columna C-4', gravedad: 'alta', estado: 'abierta', desde: ayer, hora: '10:15' },
      { id: 'ejemplo-i2', texto: 'Bloques sin curar en el acopio del nivel 1', gravedad: 'baja', estado: 'abierta', desde: ayer, hora: '11:40' }
    ],
    observaciones: 'Visita de ejemplo con datos inventados. Puedes abrirla, cambiarla o borrarla.'
  }), { callado: true });
  await guardarVisita(visita('v2', hoyIso, {
    hora: '08:00',
    trabajos: '08:10 · Corrección del acero en la columna C-4\n10:00 · Encofrado de la losa del nivel 2\n15:30 · Limpieza del área de trabajo',
    materiales: '12 planchas de plywood, 200 puntales',
    incidencias: [
      { id: 'ejemplo-i1', texto: 'Falta acero de confinamiento en la columna C-4', gravedad: 'alta', estado: 'cerrada', desde: ayer, hora: '10:15', resuelta: '08:40' },
      { id: 'ejemplo-i2', texto: 'Bloques sin curar en el acopio del nivel 1', gravedad: 'baja', estado: 'abierta', desde: ayer, hora: '11:40' }
    ],
    observaciones: 'Visita de ejemplo con datos inventados. Prueba a firmarla, sacar el informe PDF o añadir un plano.'
  }), { callado: true });

  const repaso = (n, zona, categoria, texto, responsable, prioridad, estado) => ({
    id: `${PREFIJO}r${n}`, obra: OBRA_EJEMPLO, visita: `${PREFIJO}v2`, numero: n,
    zona, categoria, texto, responsable, prioridad, fotos: [],
    desde: ayer,
    corregido: estado !== 'pendiente' ? hoyIso : null,
    cerrado: estado === 'cerrado' ? hoyIso : null,
    creado: Date.now() + n, modificado: Date.now() + n
  });
  await guardarRepaso(repaso(1, 'Apto 2A · Sala', 'pintura', 'Retocar pintura junto al interruptor', 'Pintores Ejemplo', 'baja', 'pendiente'), { callado: true });
  await guardarRepaso(repaso(2, 'Apto 2A · Baño', 'ceramica', 'Cerámica con sonido hueco en la ducha', 'Cerámica Ejemplo', 'alta', 'corregido'), { callado: true });
  await guardarRepaso(repaso(3, 'Pasillo nivel 2', 'electrico', 'Falta tapa en caja de registro', 'Instalaciones Ejemplo', 'media', 'cerrado'), { callado: true });

  const ins = nuevaInspeccion({ obra: OBRA_EJEMPLO, plantilla: 'acero', inspector: 'Supervisor de ejemplo', numero: 1 });
  ins.id = `${PREFIJO}in1`;
  ins.zona = 'Columnas ejes B y C, nivel 2';
  ins.contratista = 'Constructora Ejemplo';
  ins.puntos.forEach((p, i) => { p.valor = i === 1 ? 'no' : 'si'; });
  ins.puntos[1].nota = 'Estribos a 20 cm en zona de confinamiento; el plano pide 10 cm.';
  ins.resultado = 'condicionada';
  ins.observaciones = 'Inspección de ejemplo con datos inventados.';
  await guardarInspeccion(ins, { callado: true });
}

export async function hayEjemplo() {
  return (await listarVisitas()).some(esEjemplo);
}

export async function borrarObraEjemplo() {
  for (const v of (await listarVisitas()).filter(esEjemplo)) await borrarVisita(v.id, { callado: true });
  for (const r of (await listarRepasos()).filter(esEjemplo)) await borrarRepaso(r.id, { callado: true });
  for (const r of (await listarInspecciones()).filter(esEjemplo)) await borrarInspeccion(r.id, { callado: true });
}
