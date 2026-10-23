/* Exportar a Excel (CSV): una tabla por tipo de registro, de todas las
   obras o de una. Se abre en Excel, Google Sheets o LibreOffice.

   Formato: UTF-8 con BOM (para que Excel lea bien las tildes), separador
   coma y punto decimal (como en la configuración regional de RD). */

import * as partes from './partes.js';
import { hoy, mismaObra, el, descargar, plural } from './utiles.js';
import { estadoEn, CATEGORIAS, ESTADOS as ESTADOS_REPASO } from './repasos.js';
import { cuentaPuntos, RESULTADOS, volumenReal, fechaRotura, numero, codigo } from './calidad-datos.js';
import { CAUSAS, programadoPartida, realPartida } from './seguimiento-datos.js';
import {
  DISCIPLINAS, ESTADOS_RFI, esperaRfi, TIPOS_CAMBIO, ESTADOS_CAMBIO, totalCambio, faltanteLinea,
  TIPOS_SST, PERMISOS, CLASES_INCIDENTE, num
} from './control-datos.js';

const celda = (v) => {
  if (v == null) return '';
  const t = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function aCsv(filas) {
  return `﻿${filas.map((f) => f.map(celda).join(',')).join('\r\n')}\r\n`;
}

const deObra = (obra) => (r) => !obra || mismaObra(r.obra, obra);
const GRAVEDAD = { leve: 'Leve', media: 'Media', grave: 'Grave' };

export const TABLAS = [
  {
    id: 'visitas', nombre: 'Visitas (partes diarios)',
    async filas(obra) {
      const vs = (await partes.listarVisitas()).filter(deObra(obra));
      return [['Fecha', 'Hora', 'Obra', 'Realizada por', 'Jornada', 'Causa', 'Horas perdidas', 'Tiempo', 'Temperatura', 'Personas', 'Trabajos', 'Incidencias abiertas', 'Fotos', 'Firmada'],
        ...vs.map((v) => [v.fecha, v.hora, v.obra, v.autor, v.jornada, CAUSAS[v.afectacion?.causa] || '', v.afectacion?.horas || '', (v.clima || []).join(' / '), v.temperatura,
          (v.personal || []).reduce((s, p) => s + (Number(p.numero) || 0), 0), v.trabajos, (v.incidencias || []).filter((i) => i.estado !== 'cerrada').length,
          (v.fotos || []).length, v.firma || v.firmaRemota ? 'Sí' : 'No'])];
    }
  },
  {
    id: 'incidencias', nombre: 'Incidencias',
    async filas(obra) {
      const vs = (await partes.listarVisitas()).filter(deObra(obra));
      return [['Obra', 'Fecha de la visita', 'Hora', 'Incidencia', 'Gravedad', 'Estado'],
        ...vs.flatMap((v) => (v.incidencias || []).map((i) => [v.obra, v.fecha, i.hora || '', i.texto, GRAVEDAD[i.gravedad] || i.gravedad, i.estado === 'cerrada' ? 'Resuelta' : 'Abierta']))];
    }
  },
  {
    id: 'personal', nombre: 'Personal en obra',
    async filas(obra) {
      const vs = (await partes.listarVisitas()).filter(deObra(obra));
      return [['Obra', 'Fecha', 'Empresa', 'Oficio', 'Personas'],
        ...vs.flatMap((v) => (v.personal || []).filter((p) => p.empresa || p.oficio || p.numero).map((p) => [v.obra, v.fecha, p.empresa, p.oficio, Number(p.numero) || 0]))];
    }
  },
  {
    id: 'repasos', nombre: 'Punch list (repasos)',
    async filas(obra) {
      const rs = (await partes.listarRepasos()).filter(deObra(obra)).sort((a, b) => (a.obra || '').localeCompare(b.obra || '') || a.numero - b.numero);
      return [['Obra', 'Nº', 'Zona', 'Tipo', 'Qué corregir', 'Responsable', 'Prioridad', 'Desde', 'Corregido', 'Cerrado', 'Estado hoy', 'En plano'],
        ...rs.map((r) => [r.obra, r.numero, r.zona, CATEGORIAS[r.categoria] || r.categoria, r.texto, r.responsable, r.prioridad, r.desde, r.corregido || '', r.cerrado || '',
          ESTADOS_REPASO[estadoEn(r, hoy())], r.ubicacion ? 'Sí' : 'No'])];
    }
  },
  {
    id: 'inspecciones', nombre: 'Inspecciones',
    async filas(obra) {
      const rs = (await partes.listarInspecciones()).filter(deObra(obra));
      return [['Obra', 'Código', 'Fecha', 'Inspección', 'Zona', 'Contratista', 'Inspeccionado por', 'Cumple', 'No cumple', 'N/A', 'Sin revisar', 'Resultado', 'Firmada'],
        ...rs.map((r) => { const c = cuentaPuntos(r); return [r.obra, codigo('IN', r.numero), r.fecha, r.titulo, r.zona, r.contratista, r.inspector, c.si, c.no, c.na, c.pendientes, RESULTADOS[r.resultado] || 'En curso', r.firma || r.firmaRemota ? 'Sí' : 'No']; })];
    }
  },
  {
    id: 'vaciados', nombre: 'Vaciados de hormigón',
    async filas(obra) {
      const vs = (await partes.listarVaciados()).filter(deObra(obra));
      return [["Obra", 'Código', 'Fecha', 'Elemento', 'Nivel y ejes', "f'c", 'Unidad', 'Revenimiento especificado (pulg)', 'm³ previstos', 'm³ colocados', 'Camiones', 'Planta'],
        ...vs.map((v) => [v.obra, codigo('VH', v.numero), v.fecha, v.elemento, v.zona, v.fc, v.unidad, v.revenimiento, v.volumenPrevisto, volumenReal(v), (v.camiones || []).length, v.proveedor])];
    }
  },
  {
    id: 'probetas', nombre: 'Probetas',
    async filas(obra) {
      const vs = (await partes.listarVaciados()).filter(deObra(obra));
      return [['Obra', 'Vaciado', 'Elemento', 'Probeta', 'Edad (días)', 'Fecha de rotura', 'Resultado', 'Unidad', "% de f'c"],
        ...vs.flatMap((v) => (v.probetas || []).map((p) => {
          const x = numero(p.valor), fc = numero(v.fc);
          return [v.obra, codigo('VH', v.numero), v.elemento, p.codigo, p.dias, fechaRotura(v, p), x ?? '', v.unidad, x != null && fc ? Math.round((x / fc) * 100) : ''];
        }))];
    }
  },
  {
    id: 'avance', nombre: 'Avance por partida',
    async filas(obra) {
      const ps = (await partes.listarProgramas()).filter(deObra(obra));
      const dia = hoy();
      return [['Obra', 'Partida', 'Peso %', 'Inicio', 'Fin', 'Programado hoy %', 'Real hoy %', 'Desviación (pts)'],
        ...ps.flatMap((p) => p.partidas.map((x) => { const pr = programadoPartida(x, dia), re = realPartida(x, dia); return [p.obra, x.nombre, Number(x.peso) || 0, x.inicio, x.fin, pr, re, re - pr]; }))];
    }
  },
  {
    id: 'acuerdos', nombre: 'Acuerdos de las minutas',
    async filas(obra) {
      const ms = (await partes.listarMinutas()).filter(deObra(obra));
      return [['Obra', 'Minuta', 'Fecha', 'Acuerdo', 'Responsable', 'Fecha límite', 'Estado'],
        ...ms.flatMap((m) => m.acuerdos.map((a) => [m.obra, codigo('MR', m.numero), m.fecha, a.texto, a.responsable, a.limite, a.estado === 'cumplido' ? 'Cumplido' : 'Abierto']))];
    }
  },
  {
    id: 'rfi', nombre: 'Consultas (RFI)',
    async filas(obra) {
      const rs = (await partes.listarRfis()).filter(deObra(obra));
      return [['Obra', 'Código', 'Fecha', 'Asunto', 'Disciplina', 'Referencia', 'Dirigida a', 'Requerida para', 'Estado', 'Fecha de respuesta', 'Días', 'Impacta costo', 'Impacta plazo'],
        ...rs.map((r) => [r.obra, codigo('RFI', r.numero), r.fecha, r.asunto, DISCIPLINAS[r.disciplina] || r.disciplina, r.referencia, r.dirigidaA, r.requerida, ESTADOS_RFI[r.estado],
          r.fechaRespuesta, esperaRfi(r), r.costo ? 'Sí' : 'No', r.plazo ? 'Sí' : 'No'])];
    }
  },
  {
    id: 'cambios', nombre: 'Órdenes de cambio',
    async filas(obra) {
      const cs = (await partes.listarCambios()).filter(deObra(obra));
      return [['Obra', 'Código', 'Fecha', 'Título', 'Tipo', 'Estado', 'Moneda', 'Importe', 'Días de plazo', 'Aprueba', 'Fecha de aprobación'],
        ...cs.map((c) => [c.obra, codigo('OC', c.numero), c.fecha, c.titulo, TIPOS_CAMBIO[c.tipo], ESTADOS_CAMBIO[c.estado], c.moneda,
          (c.tipo === 'deductivo' ? -1 : c.tipo === 'sinCosto' ? 0 : 1) * totalCambio(c), num(c.plazo) ?? '', c.aprueba, c.fechaAprobacion])];
    }
  },
  {
    id: 'materiales', nombre: 'Recepción de materiales',
    async filas(obra) {
      const rs = (await partes.listarRecepciones()).filter(deObra(obra));
      return [['Obra', 'Código', 'Fecha', 'Proveedor', 'Conduce', 'Material', 'Unidad', 'Pedido', 'Recibido', 'Rechazado', 'Falta'],
        ...rs.flatMap((r) => r.lineas.map((l) => [r.obra, codigo('RM', r.numero), r.fecha, r.proveedor, r.conduce, l.descripcion, l.unidad, num(l.pedida) ?? '', num(l.recibida) ?? '', num(l.rechazada) ?? '', faltanteLinea(l)]))];
    }
  },
  {
    id: 'seguridad', nombre: 'Seguridad (SST)',
    async filas(obra) {
      const rs = (await partes.listarSeguridad()).filter(deObra(obra));
      const detalle = (r) => (r.tipo === 'charla' ? `${r.tema || ''} (${(r.asistentes || []).length} asistentes)`
        : r.tipo === 'epp' ? `${r.zona || ''}: ${(r.puntos || []).filter((p) => p.valor === 'no').map((p) => p.texto).join(', ') || 'sin faltas'}`
          : r.tipo === 'permiso' ? `${PERMISOS[r.clase]?.nombre || ''}: ${r.trabajo || ''}`
            : `${CLASES_INCIDENTE[r.clase] || ''}: ${r.descripcion || ''}`);
      const estado = (r) => (r.tipo === 'permiso' || r.tipo === 'incidente' ? (r.cerrado ? 'Cerrado' : 'Abierto') : '');
      return [['Obra', 'Código', 'Fecha', 'Tipo', 'Responsable', 'Detalle', 'Estado'],
        ...rs.map((r) => [r.obra, codigo('SST', r.numero), r.fecha, TIPOS_SST[r.tipo], r.responsable, detalle(r), estado(r)])];
    }
  }
];

const nombreArchivo = (id, obra) => `coordinate-${id}${obra ? `-${obra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : ''}-${hoy()}.csv`;

export async function descargarTabla(t, obra) {
  const filas = await t.filas(obra);
  descargar(new Blob([aCsv(filas)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(t.id, obra));
  return filas.length - 1;
}

/* La vista «Exportar a Excel» (visita.html#/exportar). */
export async function pintarExportar(contenedor, obras, avisar) {
  const selector = el('select', { class: 'campo' }, el('option', { value: '' }, 'Todas las obras'), ...obras.map((o) => el('option', { value: o }, o)));
  const lista = el('div', { class: 'exportar-lista' });
  const pintarLista = async () => {
    const obra = selector.value;
    const cuentas = await Promise.all(TABLAS.map(async (t) => (await t.filas(obra)).length - 1));
    lista.replaceChildren(...TABLAS.map((t, i) => el('div', { class: 'exportar-fila' },
      el('span', {}, el('strong', {}, t.nombre), el('span', { class: 'pie' }, plural(cuentas[i], 'fila', 'filas'))),
      el('button', {
        type: 'button', class: 'boton', disabled: !cuentas[i],
        onclick: async () => { const n = await descargarTabla(t, obra); avisar(`${t.nombre}: ${plural(n, 'fila', 'filas')} descargadas.`, 3000); }
      }, 'CSV'))));
  };
  selector.addEventListener('change', pintarLista);
  contenedor.replaceChildren(
    el('label', {}, 'Obra', selector),
    lista,
    el('div', { class: 'fila-botones' }, el('button', {
      type: 'button', class: 'boton boton-destacado', onclick: async () => {
        let n = 0;
        for (const t of TABLAS) {
          if ((await t.filas(selector.value)).length > 1) { await descargarTabla(t, selector.value); n++; await new Promise((r) => setTimeout(r, 400)); }
        }
        avisar(`${plural(n, 'archivo descargado', 'archivos descargados')}. Si el navegador pregunta, permite varias descargas.`, 5000);
      }
    }, 'Descargar todo')));
  await pintarLista();
}
