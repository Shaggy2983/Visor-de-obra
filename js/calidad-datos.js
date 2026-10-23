/* Calidad de obra: protocolos de inspección (checklist por partida con
   liberación firmada) y registro de vaciados de hormigón con sus probetas.
   Aquí van los datos y las cuentas; la pantalla está en js/calidad.js.

   Las plantillas son una guía de partida: cada inspección copia sus puntos
   y se pueden añadir o quitar los que la obra necesite. Los criterios de
   aceptación son los del proyecto y sus especificaciones; las cifras de
   referencia (porcentajes de resistencia a 7 y 14 días, tolerancia del
   revenimiento) son orientativas. */

import { listarInspecciones, listarVaciados } from './partes.js';
import { nuevoId, hoy, ahora, mismaObra } from './utiles.js';

export const PLANTILLAS = {
  acero: {
    nombre: 'Acero de refuerzo antes de vaciar', icono: '🔩', categoria: 'otros',
    puntos: [
      'Diámetros y cantidad de varillas según plano',
      'Separación de estribos y zonas de confinamiento',
      'Longitudes de traslape y anclaje',
      'Recubrimientos con separadores (calzos y silletas)',
      'Ganchos y dobleces según detalle',
      'Acero limpio: sin óxido suelto, grasa ni barro',
      'Amarres firmes: el armado no se desplaza',
      'Pases y piezas embebidas colocados'
    ]
  },
  encofrado: {
    nombre: 'Encofrado y apuntalamiento', icono: '🪵', categoria: 'otros',
    puntos: [
      'Dimensiones, niveles y plomos según plano',
      'Alineación y escuadra',
      'Puntales y arriostramiento suficientes, sobre base firme',
      'Juntas cerradas: sin fuga de lechada',
      'Superficies limpias y con desmoldante',
      'Contraflecha donde se indica',
      'Accesos y plataformas seguras para el vaciado'
    ]
  },
  prevaciado: {
    nombre: 'Liberación para vaciar hormigón', icono: '🚧', categoria: 'otros',
    puntos: [
      'Acero y encofrado liberados',
      'Instalaciones embebidas revisadas (eléctricas, sanitarias, mangas)',
      'Juntas de construcción definidas',
      'Fondo limpio y encofrado humedecido',
      "Pedido confirmado: f'c, revenimiento, volumen y hora",
      'Bomba y vibradores con respaldo; personal suficiente',
      'Cono de Abrams y moldes de probetas en obra',
      'Plan de curado y previsión de lluvia'
    ]
  },
  mamposteria: {
    nombre: 'Mampostería de bloques', icono: '🧱', categoria: 'otros',
    puntos: [
      'Replanteo y ejes según plano',
      'Plomo, nivel y alineación de hiladas',
      'Juntas llenas y de espesor uniforme',
      'Acero vertical y huecos rellenos donde corresponde',
      'Vigas de amarre y dinteles en vanos',
      'Trabazón en esquinas y encuentros',
      'Pases de instalaciones antes de pañetar'
    ]
  },
  sanitaria: {
    nombre: 'Instalación sanitaria · prueba de presión', icono: '🚿', categoria: 'sanitarios',
    puntos: [
      'Diámetros, pendientes y recorridos según plano',
      'Uniones pegadas o selladas, sin fugas visibles',
      'Prueba de presión del agua potable sin caída (presión y tiempo del proyecto)',
      'Prueba de estanqueidad del drenaje sin fugas',
      'Tuberías fijadas y protegidas',
      'Registros y ventilaciones colocados',
      'Salidas taponadas y tramo protegido antes de cerrar'
    ]
  },
  electrica: {
    nombre: 'Instalación eléctrica antes de cerrar', icono: '⚡', categoria: 'electrico',
    puntos: [
      'Tuberías y cajas según plano y a su altura',
      'Cajas fijas, a plomo y a nivel',
      'Tubería sin aplastamientos y con curvas correctas',
      'Guías pasadas: tuberías continuas',
      'Corrientes débiles separadas',
      'Puesta a tierra prevista'
    ]
  },
  impermeabilizacion: {
    nombre: 'Impermeabilización · prueba de inundación', icono: '💧', categoria: 'impermeabilizacion',
    puntos: [
      'Superficie limpia, seca y con pendiente a los desagües',
      'Mediacañas y remates en encuentros con muros',
      'Imprimación según el fabricante',
      'Solapes y número de capas según especificación',
      'Desagües y pasantes sellados',
      'Prueba de inundación (24–48 h) sin filtraciones'
    ]
  },
  drywall: {
    nombre: 'Drywall · estructura antes de cerrar', icono: '📐', categoria: 'plafon',
    puntos: [
      'Canales y parales a la separación indicada',
      'Plomo y alineación',
      'Refuerzos para muebles, sanitarios y equipos',
      'Instalaciones dentro del muro probadas',
      'Aislamiento colocado',
      'Placas del tipo indicado (RH, RF) en su zona'
    ]
  },
  ceramica: {
    nombre: 'Cerámica y pisos', icono: '🔲', categoria: 'ceramica',
    puntos: [
      'Material según muestra aprobada (lote y tono)',
      'Nivel, pendientes y planimetría',
      'Juntas alineadas y de ancho uniforme',
      'Sin piezas huecas (prueba de golpeo)',
      'Cortes y remates limpios',
      'Fragüe completo y limpieza final'
    ]
  },
  pintura: {
    nombre: 'Pintura y terminación', icono: '🎨', categoria: 'pintura',
    puntos: [
      'Superficie lisa, sin fisuras ni manchas de humedad',
      'Color y acabado según muestra',
      'Manos aplicadas según especificación',
      'Cubrimiento uniforme, sin chorreos ni marcas',
      'Cortes limpios en esquinas y encuentros',
      'Áreas vecinas protegidas y limpias'
    ]
  },
  libre: { nombre: 'Inspección libre', icono: '📝', categoria: 'otros', puntos: [] }
};

export const VALORES = { si: 'Cumple', no: 'No cumple', na: 'N/A' };

export const RESULTADOS = {
  liberada: 'Liberada',
  condicionada: 'Liberada con observaciones',
  rechazada: 'Rechazada'
};

export const METODOS = { bomba: 'Bomba', canaleta: 'Canaleta', grua: 'Grúa y cubo', manual: 'Manual' };
export const UNIDADES = ['kg/cm²', 'psi', 'MPa'];

/* Fracción de f'c que suele alcanzarse a cada edad (referencia, cemento
   normal). Sirve para avisar de un resultado bajo antes de los 28 días. */
export const ESPERADO = { 3: 0.4, 7: 0.65, 14: 0.85, 28: 1 };

/* ------------------------------------------------------------------ */
/* inspecciones                                                        */
/* ------------------------------------------------------------------ */

export function numeroDe(lista, obra) {
  return lista.filter((r) => mismaObra(r.obra, obra)).reduce((m, r) => Math.max(m, r.numero || 0), 0) + 1;
}

export const codigo = (prefijo, n) => `${prefijo}-${String(n || 0).padStart(3, '0')}`;

export function nuevaInspeccion({ obra, plantilla = 'libre', inspector = '', numero = 1 }) {
  const p = PLANTILLAS[plantilla] || PLANTILLAS.libre;
  return {
    id: nuevoId(),
    obra,
    numero,
    plantilla,
    titulo: p.nombre,
    zona: '',
    contratista: '',
    fecha: hoy(),
    hora: ahora(),
    inspector,
    puntos: p.puntos.map((texto) => ({ id: nuevoId(), texto, valor: '', nota: '', propio: false })),
    fotos: [],
    observaciones: '',
    resultado: '',
    firma: null,
    firmadaPor: '',
    firmadaEn: null,
    creado: Date.now(),
    modificado: Date.now()
  };
}

export function cuentaPuntos(r) {
  const c = { total: r.puntos.length, si: 0, no: 0, na: 0, pendientes: 0 };
  for (const p of r.puntos) { if (p.valor) c[p.valor]++; else c.pendientes++; }
  return c;
}

/* Lo que propondría el checklist: rechazada si algo no cumple, liberada
   si todo está revisado; mientras falten puntos, nada. */
export function resultadoSugerido(r) {
  const c = cuentaPuntos(r);
  if (c.no) return 'rechazada';
  if (!c.pendientes && c.total) return 'liberada';
  return '';
}

/* ------------------------------------------------------------------ */
/* vaciados y probetas                                                 */
/* ------------------------------------------------------------------ */

export function nuevoVaciado({ obra, autor = '', numero = 1 }) {
  return {
    id: nuevoId(),
    obra,
    numero,
    elemento: '',
    zona: '',
    fecha: hoy(),
    hora: ahora(),
    fc: '',
    unidad: 'kg/cm²',
    revenimiento: '',          // especificado, en pulgadas
    volumenPrevisto: '',
    proveedor: '',
    metodo: 'bomba',
    inspeccion: '',            // id de la liberación para vaciar, si la hay
    camiones: [],
    probetas: [],
    curado: '',
    observaciones: '',
    autor,
    fotos: [],
    creado: Date.now(),
    modificado: Date.now()
  };
}

export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + Number(dias || 0));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export const fechaRotura = (vaciado, p) => sumarDias(vaciado.fecha, p.dias);

export const numero = (x) => {
  const n = parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* pendiente · hoy · vencida · rota */
export function estadoProbeta(vaciado, p, dia = hoy()) {
  if (numero(p.valor) != null) return 'rota';
  const f = fechaRotura(vaciado, p);
  if (f < dia) return 'vencida';
  if (f === dia) return 'hoy';
  return 'pendiente';
}

export const volumenReal = (v) => v.camiones.reduce((s, c) => s + (numero(c.m3) || 0), 0);

/* ¿El revenimiento medido se sale de lo especificado? ±1" de tolerancia
   de referencia (la del proyecto manda). */
export function revenimientoFuera(v, c) {
  const esp = numero(v.revenimiento), med = numero(c.slump);
  return esp != null && med != null && Math.abs(med - esp) > 1;
}

/* Resultados por edad: promedio, % de f'c y si va bien respecto a lo
   esperable a esa edad. A 28 días: cumple si el promedio llega a f'c. */
export function evaluacion(v) {
  const fc = numero(v.fc);
  const porEdad = new Map();
  for (const p of v.probetas) {
    const x = numero(p.valor);
    if (x == null) continue;
    if (!porEdad.has(p.dias)) porEdad.set(p.dias, []);
    porEdad.get(p.dias).push(x);
  }
  return [...porEdad.entries()].sort((a, b) => a[0] - b[0]).map(([dias, valores]) => {
    const promedio = valores.reduce((s, x) => s + x, 0) / valores.length;
    const pct = fc ? promedio / fc : null;
    const esperado = ESPERADO[dias] ?? (dias >= 28 ? 1 : null);
    const bien = pct == null || esperado == null ? null : pct >= esperado;
    return { dias, n: valores.length, promedio, pct, esperado, bien, minimo: Math.min(...valores) };
  });
}

/* Agenda de roturas de todas las obras: lo que toca hoy, lo vencido y lo
   de los próximos días. */
export function agendaRoturas(vaciados, dia = hoy(), dias = 7) {
  const limite = sumarDias(dia, dias);
  const salida = [];
  for (const v of vaciados) {
    for (const p of v.probetas) {
      const estado = estadoProbeta(v, p, dia);
      if (estado === 'rota') continue;
      const fecha = fechaRotura(v, p);
      if (estado === 'pendiente' && fecha > limite) continue;
      salida.push({ vaciado: v, probeta: p, fecha, estado });
    }
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* Cuentas para los avisos del inicio y el punto rojo del menú. Se dejan
   en localStorage («crd-roturas») para que el menú las lea en cualquier
   página sin abrir la base de datos. */
export async function resumenCalidad(dia = hoy()) {
  const [inspecciones, vaciados] = await Promise.all([listarInspecciones(), listarVaciados()]);
  const agenda = agendaRoturas(vaciados, dia, 3);
  const r = {
    dia,
    hoy: agenda.filter((x) => x.estado === 'hoy').length,
    vencidas: agenda.filter((x) => x.estado === 'vencida').length,
    proximas: agenda.filter((x) => x.estado === 'pendiente').length,
    abiertas: inspecciones.filter((i) => !i.resultado).length,
    rechazadas: inspecciones.filter((i) => i.resultado === 'rechazada').length,
    bajas: vaciados.filter((v) => evaluacion(v).some((e) => e.dias >= 28 && e.bien === false)).length
  };
  try { localStorage.setItem('crd-roturas', JSON.stringify(r)); } catch (e) { /* sin almacenamiento */ }
  if (window.crdMenu) window.crdMenu.avisos();
  return r;
}
