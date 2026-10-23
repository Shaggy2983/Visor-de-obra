/* Panel del equipo (panel.html): resumen diario y semanal de las
   bitácoras de las obras compartidas. Lee de la nube (sin fotos), así
   sirve también en el navegador del ordenador. Las cuentas están en
   resumen.js; aquí sólo se pinta. */

import { el, plural, fechaLarga, hoy } from './utiles.js';
import { avisar } from './interfaz.js';
import { equipo, ROLES } from './equipo.js';
import { iniciarEquipoUI } from './equipo-ui.js';
import * as novedades from './novedades.js';
import { resumenDia, resumenSemana, lunes, sumarDias } from './resumen.js';

const $ = (id) => document.getElementById(id);
const nodos = {
  grupoEquipo: $('grupo-equipo'), panel: $('panel'), pestanas: $('pestanas'), obra: $('obra'),
  fecha: $('fecha'), antes: $('antes'), despues: $('despues'), hoy: $('hoy'), recargar: $('recargar'),
  imprimir: $('imprimir'), novedades: $('novedades'), estado: $('estado'), contenido: $('contenido'), aviso: $('aviso')
};
const GRAVEDAD = { grave: 'Grave', media: 'Media', leve: 'Leve' };
const DIA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CONTACTO = 'hola@coordinate.do · coordinate.do · Santo Domingo, RD';

const estado = { vista: 'dia', obra: 'todas', fecha: hoy() };
let pintando = 0;

/* --- estado en la dirección: panel.html#vista=semana&obra=ID&fecha=… --- */

function leerHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (['dia', 'semana'].includes(p.get('vista'))) estado.vista = p.get('vista');
  if (p.get('obra')) estado.obra = p.get('obra');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('fecha') || '')) estado.fecha = p.get('fecha');
}

function escribirHash() {
  const p = new URLSearchParams({ vista: estado.vista, obra: estado.obra, fecha: estado.fecha });
  history.replaceState(null, '', `#${p}`);
}

/* --- obras que se pueden resumir --- */

function obrasVisibles() {
  if (!equipo.usuario) return [];
  const uid = equipo.usuario.uid;
  return equipo.obras.filter((o) => ['admin', 'editor', 'lector'].includes(o.miembros[uid]));
}

function pintarSelector() {
  const obras = obrasVisibles();
  const uid = equipo.usuario.uid;
  if (estado.obra !== 'todas' && !obras.some((o) => o.id === estado.obra)) estado.obra = 'todas';
  nodos.obra.replaceChildren(
    el('option', { value: 'todas', selected: estado.obra === 'todas' }, `Todas mis obras (${obras.length})`),
    ...obras.map((o) => el('option', { value: o.id, selected: estado.obra === o.id },
      `${o.nombre}${o.miembros[uid] === 'admin' ? '' : ` · ${ROLES[o.miembros[uid]].toLowerCase()}`}`)));
}

/* --- piezas --- */

const cifra = (valor, texto, clase = '') => el('div', { class: `cifra ${clase}` }, el('strong', {}, String(valor)), el('span', {}, texto));
const etiqueta = (texto, clase) => el('span', { class: `etiqueta ${clase || ''}` }, texto);
const enlaceVisita = (id, texto = 'Abrir') => el('a', { class: 'enlace', href: `./visita.html#/v/${encodeURIComponent(id)}` }, texto);
const enlaceObra = (o) => el('a', { class: 'enlace', href: `./perfil.html#/obra/${encodeURIComponent(o.id)}` }, 'Espacio de la obra →');

function cabeceraImpresa(titulo, subtitulo) {
  return el('div', { class: 'impreso-cabecera' },
    el('div', { class: 'impreso-marca' }, 'C◎ORDINATE'),
    el('div', {}, el('strong', {}, titulo), el('div', { class: 'pie' }, subtitulo)));
}

function listaIncidencias(lista, vacio) {
  if (!lista.length) return el('p', { class: 'pie' }, vacio);
  return el('ul', { class: 'panel-lista' }, ...lista.map((i) => el('li', {},
    etiqueta(GRAVEDAD[i.gravedad] || i.gravedad || 'Media', `gravedad-${i.gravedad}`),
    ' ', i.texto || '(sin texto)',
    el('span', { class: 'pie' }, ` · desde ${i.alta}${i.hora ? ` ${i.hora}` : ''}${i.estado === 'cerrada' && i.resueltaFecha ? ` · resuelta ${i.resueltaFecha}${i.resuelta ? ` ${i.resuelta}` : ''}` : ''}`))));
}

function tabla(cabeceras, filas, clase = '') {
  return el('div', { class: 'tabla-envoltura' }, el('table', { class: `tabla ${clase}` },
    el('thead', {}, el('tr', {}, ...cabeceras.map((c) => el('th', {}, c)))),
    el('tbody', {}, ...filas.map((f) => el('tr', {}, ...f.map((c) => el('td', {}, c)))))));
}

/* --- calidad, seguimiento y control --- */

const pct = (x) => `${Math.round(x)} %`;
const dinero = (moneda, n) => `${moneda} ${n.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
const corta = (f) => (f ? `${f.slice(8)}/${f.slice(5, 7)}` : '');
const mitad = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

function lineaAviso(texto, clase = 'atencion') {
  return el('li', {}, etiqueta(clase === 'gravedad-grave' ? 'Vencido' : 'Atención', clase), ' ', texto);
}

/* Lo que hay que mirar: vencidos y abiertos, en una sola lista. */
function avisosRegistros(rg) {
  const l = [];
  if (rg.calidad.roturasVencidas) l.push(lineaAviso(`${plural(rg.calidad.roturasVencidas, 'probeta', 'probetas')} con la rotura vencida sin resultado`, 'gravedad-grave'));
  if (rg.calidad.roturasHoy) l.push(lineaAviso(`${plural(rg.calidad.roturasHoy, 'probeta toca', 'probetas tocan')} romper`));
  for (const b of rg.calidad.bajas) l.push(lineaAviso(`${b.codigo} ${b.elemento}: ${b.dias} días al ${pct(b.pct * 100)} de f'c, por debajo de lo esperado`, 'gravedad-grave'));
  for (const a of rg.acuerdos.vencidos) l.push(lineaAviso(`Acuerdo vencido (${a.minuta}, ${corta(a.limite)}): ${a.texto}${a.responsable ? ` · ${a.responsable}` : ''}`, 'gravedad-grave'));
  for (const q of rg.rfi.vencidas) l.push(lineaAviso(`${q.codigo} sin respuesta, requerida para el ${corta(q.requerida)}: ${q.asunto}${q.dirigidaA ? ` · ${q.dirigidaA}` : ''}`, 'gravedad-grave'));
  if (rg.sst.permisosOlvidados) l.push(lineaAviso(`${plural(rg.sst.permisosOlvidados, 'permiso de trabajo', 'permisos de trabajo')} de días anteriores sin cerrar`, 'gravedad-grave'));
  if (rg.sst.incidentesAbiertos) l.push(lineaAviso(`${plural(rg.sst.incidentesAbiertos, 'incidente', 'incidentes')} con acciones sin cerrar`));
  if (rg.cambios.enviadas) l.push(lineaAviso(`${plural(rg.cambios.enviadas, 'orden de cambio enviada', 'órdenes de cambio enviadas')}, esperando aprobación`));
  for (const m of rg.materiales.problemas) l.push(lineaAviso(`${m.codigo} ${m.proveedor}: ${m.estado.toLowerCase()}`));
  return l.length ? el('ul', { class: 'panel-lista' }, ...l) : null;
}

function lineaAvance(av) {
  if (!av) return null;
  const clase = av.desviacion < -5 ? 'gravedad-grave' : av.desviacion < 0 ? 'atencion' : 'ok';
  return el('p', { class: 'pie' }, 'Avance: ', el('strong', {}, `${pct(av.real)} real`), ` · ${pct(av.programado)} programado · `,
    etiqueta(`${av.desviacion >= 0 ? '+' : ''}${Math.round(av.desviacion)} pts`, clase),
    av.spi != null ? ` · índice ${av.spi.toFixed(2)}` : '');
}

/* Día: un bloque compacto bajo las bitácoras. */
function registrosDia(rg) {
  if (!rg.hay) return null;
  const hechos = [
    rg.calidad.inspecciones.length && `${plural(rg.calidad.inspecciones.length, 'inspección', 'inspecciones')} (${rg.calidad.inspecciones.map((i) => `${i.codigo} ${i.titulo}: ${i.texto.toLowerCase()}`).join('; ')})`,
    rg.calidad.vaciados.length && `${plural(rg.calidad.vaciados.length, 'vaciado', 'vaciados')} (${rg.calidad.vaciados.map((v) => `${v.codigo} ${v.elemento}${v.m3 ? ` ${mitad(v.m3)} m³` : ''}`).join('; ')})`,
    rg.acuerdos.reuniones && plural(rg.acuerdos.reuniones, 'reunión', 'reuniones'),
    rg.rfi.nuevas && plural(rg.rfi.nuevas, 'RFI nueva', 'RFI nuevas'),
    rg.rfi.respondidas && plural(rg.rfi.respondidas, 'RFI respondida', 'RFI respondidas'),
    rg.cambios.aprobadas && `${plural(rg.cambios.aprobadas, 'orden de cambio aprobada', 'órdenes de cambio aprobadas')} (${rg.cambios.totales.map(([m, n]) => dinero(m, n)).join(' + ')})`,
    rg.materiales.recepciones && plural(rg.materiales.recepciones, 'recepción de materiales', 'recepciones de materiales'),
    rg.sst.charlas && `${plural(rg.sst.charlas, 'charla', 'charlas')} de seguridad (${plural(rg.sst.asistentes, 'asistente', 'asistentes')})`,
    rg.sst.permisos.length && plural(rg.sst.permisos.length, 'permiso de trabajo', 'permisos de trabajo'),
    rg.sst.incidentes.length && `${plural(rg.sst.incidentes.length, 'incidente', 'incidentes')} (${rg.sst.incidentes.map((i) => i.clase.toLowerCase()).join(', ')})`
  ].filter(Boolean);
  return el('div', { class: 'panel-registros' },
    el('h3', { class: 'panel-sub' }, 'Calidad, seguimiento y control'),
    lineaAvance(rg.avance),
    hechos.length ? el('ul', { class: 'panel-trabajos' }, ...hechos.map((h) => el('li', {}, h))) : el('p', { class: 'pie' }, 'Sin registros nuevos este día.'),
    avisosRegistros(rg));
}

/* Semana: secciones 6 a 9 del reporte. */
function registrosSemana(rg) {
  if (!rg.hay) return [];
  const c = rg.calidad, s = rg.sst;
  return [
    el('h3', { class: 'panel-sub' }, '6. Calidad'),
    c.inspecciones.length
      ? tabla(['Inspección', 'Partida', 'Zona', 'Fecha', 'Resultado'], c.inspecciones.map((i) => [i.codigo, i.titulo, i.zona || '—', corta(i.fecha),
        etiqueta(i.texto, i.resultado === 'rechazada' ? 'gravedad-grave' : i.resultado === 'liberada' ? 'ok' : 'atencion')]))
      : el('p', { class: 'pie' }, 'Sin inspecciones esta semana.'),
    c.vaciados.length > 0 && tabla(['Vaciado', 'Elemento', 'f\'c', 'm³', 'Probetas'], c.vaciados.map((v) => [v.codigo, [v.elemento, v.zona].filter(Boolean).join(' · ') || '—', v.fc || '—', v.m3 ? mitad(v.m3) : '—', String(v.probetas)])),
    el('p', { class: 'pie' }, `Roturas: ${c.roturasVencidas} vencidas · ${c.roturasHoy} para hoy · ${c.roturasProximas} en los próximos 7 días`),

    el('h3', { class: 'panel-sub' }, '7. Avance, reuniones y días afectados'),
    lineaAvance(rg.avance) || el('p', { class: 'pie' }, 'Sin programa de avance para esta obra.'),
    el('p', { class: 'pie' }, `${plural(rg.acuerdos.reuniones, 'reunión', 'reuniones')} · ${plural(rg.acuerdos.abiertos, 'acuerdo abierto', 'acuerdos abiertos')} · ${plural(rg.acuerdos.vencidos.length, 'vencido', 'vencidos')}`),
    rg.dias.total > 0 && el('p', { class: 'pie' }, `Días afectados: ${mitad(rg.dias.total)} (${rg.dias.porCausa.map(([k, n]) => `${k.toLowerCase()} ${mitad(n)}`).join(', ')})`),

    el('h3', { class: 'panel-sub' }, '8. RFI, cambios y materiales'),
    el('p', { class: 'pie' }, [
      `RFI: ${plural(rg.rfi.nuevas, 'nueva', 'nuevas')} · ${plural(rg.rfi.respondidas, 'respondida', 'respondidas')} · ${plural(rg.rfi.abiertas, 'abierta', 'abiertas')}`,
      `órdenes de cambio: ${plural(rg.cambios.aprobadas, 'aprobada', 'aprobadas')}${rg.cambios.totales.length ? ` (${rg.cambios.totales.map(([m, n]) => dinero(m, n)).join(' + ')})` : ''} · ${rg.cambios.enviadas} por aprobar`,
      `${plural(rg.materiales.recepciones, 'recepción', 'recepciones')} de materiales, ${rg.materiales.problemas.length} con faltante o rechazo`
    ].join(' · ')),

    el('h3', { class: 'panel-sub' }, '9. Seguridad'),
    el('div', { class: 'cifras cifras-pequenas' },
      cifra(s.charlas, s.charlas === 1 ? 'charla' : 'charlas'),
      cifra(s.asistentes, 'asistentes'),
      cifra(s.revisionesEpp, 'revisiones de EPP'),
      cifra(s.permisos.length, 'permisos de trabajo'),
      cifra(s.incidentes.length, 'incidentes', s.incidentes.length ? 'alerta' : ''),
      s.sinAccidentes != null && cifra(s.sinAccidentes, 'días sin accidentes')),

    avisosRegistros(rg) && el('h3', { class: 'panel-sub' }, 'Pendientes y vencidos'),
    avisosRegistros(rg)
  ];
}

function cifrasRegistros(t) {
  if (!t.hay) return null;
  return el('div', { class: 'cifras cifras-pequenas' },
    cifra(t.inspecciones, t.inspecciones === 1 ? 'inspección' : 'inspecciones'),
    cifra(t.vaciados, t.vaciados === 1 ? 'vaciado' : 'vaciados'),
    cifra(t.roturas, 'probetas por romper', t.roturas ? 'alerta' : ''),
    cifra(t.rfiAbiertas, 'RFI abiertas', t.rfiVencidas ? 'alerta' : ''),
    cifra(t.acuerdosVencidos, 'acuerdos vencidos', t.acuerdosVencidos ? 'alerta' : ''),
    cifra(t.cambiosPendientes, 'cambios por aprobar'),
    cifra(t.permisosOlvidados, 'permisos sin cerrar', t.permisosOlvidados ? 'alerta' : ''),
    t.diasAfectados > 0 && cifra(mitad(t.diasAfectados), 'días afectados'));
}

/* --- diario --- */

function pintarDia(r) {
  const t = r.total;
  const sinVisita = r.sinVisita.length;
  return [
    cabeceraImpresa('Resumen diario de obra', fechaLarga(r.fecha)),
    el('h2', { class: 'panel-titulo' }, fechaLarga(r.fecha)),
    el('div', { class: 'cifras' },
      cifra(t.visitas, t.visitas === 1 ? 'bitácora' : 'bitácoras'),
      cifra(t.firmadas, 'firmadas'),
      cifra(t.personas, 'personas en obra'),
      cifra(t.incNuevas, 'incidencias nuevas'),
      cifra(t.incAbiertas, 'incidencias abiertas', t.graves ? 'alerta' : ''),
      cifra(t.repAbiertos, 'repasos abiertos')),
    cifrasRegistros(r.registros),
    sinVisita > 0 && r.obras.length > 1 && el('p', { class: 'aviso-lectura' },
      `Sin bitácora este día: ${r.sinVisita.map((o) => o.nombre).join(', ')}.`),
    ...r.obras.map((x) => el('section', { class: 'grupo panel-obra-tarjeta' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, x.obra.nombre), enlaceObra(x.obra)),
      el('p', { class: 'pie' }, [
        plural(x.visitas.length, 'bitácora', 'bitácoras'),
        x.personas && plural(x.personas, 'persona', 'personas'),
        x.incNuevas.length && plural(x.incNuevas.length, 'incidencia nueva', 'incidencias nuevas'),
        x.incResueltas.length && plural(x.incResueltas.length, 'resuelta', 'resueltas'),
        plural(x.incAbiertas.length, 'incidencia abierta', 'incidencias abiertas'),
        (x.repNuevos || x.repCorregidos || x.repCerrados) && `repasos: ${x.repNuevos} nuevos, ${x.repCorregidos} corregidos, ${x.repCerrados} cerrados`,
        `${x.repAbiertos} repasos abiertos`
      ].filter(Boolean).join(' · ')),
      x.visitas.length
        ? el('div', { class: 'panel-visitas' }, ...x.visitas.map((v) => el('article', { class: 'panel-visita' },
          el('div', { class: 'panel-visita-cabecera' },
            el('strong', {}, `${v.hora ? `${v.hora} · ` : ''}${v.autor}`),
            v.firmada ? etiqueta('Firmada', 'ok') : etiqueta('Sin firmar', 'atencion'),
            v.jornada !== 'Normal' && etiqueta(v.jornada, 'atencion'),
            v.carpeta && el('a', { class: 'enlace', href: v.carpeta, target: '_blank', rel: 'noopener noreferrer', title: 'Fotos, firma y planos en la nube del autor' }, '📷 Fotos'),
            enlaceVisita(v.id)),
          el('p', { class: 'pie' }, [plural(v.personas, 'persona', 'personas'), [v.clima.join(', '), v.temperatura].filter(Boolean).join(' · '), v.fotos && plural(v.fotos, 'foto', 'fotos')].filter(Boolean).join(' · ')),
          v.trabajos.length
            ? el('ul', { class: 'panel-trabajos' }, ...v.trabajos.map((l) => el('li', {}, l)))
            : el('p', { class: 'pie' }, 'Sin trabajos anotados.'))))
        : el('p', { class: 'vacio' }, 'Sin bitácora este día.'),
      x.incNuevas.length > 0 && el('h3', { class: 'panel-sub' }, 'Incidencias nuevas'),
      x.incNuevas.length > 0 && listaIncidencias(x.incNuevas, ''),
      x.incResueltas.length > 0 && el('h3', { class: 'panel-sub' }, 'Resueltas este día'),
      x.incResueltas.length > 0 && listaIncidencias(x.incResueltas, ''),
      registrosDia(x.registros))),
    pieImpreso()
  ];
}

/* --- semanal --- */

function pintarSemana(r) {
  const t = r.total;
  const rango = `${fechaLarga(r.inicio)} – ${fechaLarga(r.fin)}`;
  return [
    cabeceraImpresa('Resumen semanal de obra', rango),
    el('h2', { class: 'panel-titulo' }, `Semana del ${r.inicio.slice(8)}/${r.inicio.slice(5, 7)} al ${r.fin.slice(8)}/${r.fin.slice(5, 7)}/${r.fin.slice(0, 4)}`),
    el('div', { class: 'cifras' },
      cifra(t.visitas, 'bitácoras'),
      cifra(t.firmadas, 'firmadas'),
      cifra(t.personasDia, 'personas·día'),
      cifra(t.incNuevas, 'incidencias nuevas'),
      cifra(t.incResueltas, 'resueltas'),
      cifra(t.incAbiertas, 'siguen abiertas', t.incAbiertas ? 'alerta' : ''),
      cifra(t.repCerrados, 'repasos cerrados'),
      cifra(t.repAbiertos, 'repasos abiertos')),
    cifrasRegistros(r.registros),
    ...r.obras.map((x) => el('section', { class: 'grupo panel-obra-tarjeta' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, x.obra.nombre), enlaceObra(x.obra)),
      el('p', { class: 'pie' }, `${plural(x.visitas, 'bitácora', 'bitácoras')} en ${plural(x.diasConVisita, 'día', 'días')} · ${x.firmadas} firmadas`),

      el('h3', { class: 'panel-sub' }, '1. Visitas por día'),
      tabla(['Día', 'Bitácoras', 'Quién', 'Personal', 'Tiempo'], x.porDia.map((d, i) => [
        `${DIA_CORTO[i]} ${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}`,
        d.visitas || '—',
        d.autores.join(', ') || '—',
        d.visitas ? String(d.personas) : '—',
        [d.clima.join(', '), d.temperatura, d.sinActividad && 'sin actividad', d.parcial && 'jornada parcial'].filter(Boolean).join(' · ') || '—'
      ]), 'tabla-dias'),

      el('h3', { class: 'panel-sub' }, '2. Por persona'),
      x.porPersona.length
        ? tabla(['Persona', 'Bitácoras', 'Días', 'Firmadas'], x.porPersona.map((p) => [p.nombre, String(p.visitas), String(p.dias), `${p.firmadas} de ${p.visitas}`]))
        : el('p', { class: 'pie' }, 'Nadie hizo bitácora esta semana.'),

      el('h3', { class: 'panel-sub' }, '3. Incidencias'),
      el('p', { class: 'pie' }, `${x.incidencias.nuevas.length} nuevas · ${x.incidencias.resueltas.length} resueltas · ${x.incidencias.abiertas.length} abiertas al cierre de la semana`),
      listaIncidencias(x.incidencias.abiertas, 'Ninguna incidencia abierta.'),

      el('h3', { class: 'panel-sub' }, '4. Repasos (punch list)'),
      el('p', { class: 'pie' }, `${x.repasos.nuevos} nuevos · ${x.repasos.corregidos} corregidos · ${x.repasos.cerrados} cerrados · ${x.repasos.abiertos} abiertos al cierre`),
      x.repasos.porResponsable.length > 0 && tabla(['Responsable', 'Por corregir', 'Por verificar'],
        x.repasos.porResponsable.map((p) => [p.responsable, String(p.pendiente), String(p.corregido)])),

      el('h3', { class: 'panel-sub' }, '5. Personal y clima'),
      el('div', { class: 'cifras cifras-pequenas' },
        cifra(x.personal.promedio, 'personas/día (promedio)'),
        cifra(x.personal.maximo, 'máximo en un día'),
        cifra(x.personal.total, 'personas·día'),
        cifra(x.clima.lluvia, x.clima.lluvia === 1 ? 'día con lluvia' : 'días con lluvia'),
        cifra(x.clima.sinActividad, 'días sin actividad'),
        cifra(x.clima.parcial, 'jornadas parciales')),
      ...registrosSemana(x.registros))),
    pieImpreso()
  ];
}

function pieImpreso() {
  return el('p', { class: 'impreso-pie' }, `Generado el ${fechaLarga(hoy())} por ${equipo.nombre} · COORDINATE · ${CONTACTO}`);
}

/* --- novedades sin abrir --- */

function pintarNovedades() {
  const lista = novedades.lista(equipo.usuario && equipo.usuario.uid);
  nodos.novedades.hidden = !lista.length;
  if (!lista.length) return;
  nodos.novedades.replaceChildren(
    el('div', { class: 'grupo-cabecera' },
      el('h2', {}, `Novedades sin abrir (${lista.length})`),
      el('button', { type: 'button', class: 'enlace', onclick: () => { novedades.vaciar(equipo.usuario.uid); pintarNovedades(); } }, 'Marcar todo como visto')),
    el('ul', { class: 'panel-lista' }, ...lista.slice(0, 8).map((n) => el('li', {},
      etiqueta(n.nuevo ? 'Nueva' : 'Actualizada', n.nuevo ? 'ok' : 'atencion'), ' ',
      n.tipo === 'visitas' ? enlaceVisita(n.id, `${n.obra} · ${n.fecha || ''}`) : `${n.obra} · ${n.titulo}`,
      el('span', { class: 'pie' }, ` · ${n.quien || ''}`)))));
}

/* --- pintar --- */

async function pintar({ fresco = false } = {}) {
  if (!equipo.usuario) return;
  const turno = ++pintando;
  escribirHash();
  for (const b of nodos.pestanas.children) b.classList.toggle('activo', b.dataset.vista === estado.vista);
  nodos.fecha.value = estado.fecha;
  nodos.imprimir.textContent = estado.vista === 'semana' ? 'Reporte semanal en PDF' : 'Resumen del día en PDF';
  pintarNovedades();
  const obras = obrasVisibles().filter((o) => estado.obra === 'todas' || o.id === estado.obra);
  if (!obras.length) {
    nodos.estado.textContent = '';
    nodos.contenido.replaceChildren(el('div', { class: 'vacio' },
      el('p', {}, 'Todavía no tienes obras compartidas que resumir.'),
      el('p', {}, 'Comparte una obra o crea un equipo de trabajo desde ', el('a', { href: './perfil.html', class: 'enlace' }, 'tu perfil'),
        ' (o en la app, «Cuenta y equipo»). Las bitácoras que tu equipo haga en esas obras aparecerán aquí.')));
    return;
  }
  nodos.estado.textContent = 'Leyendo las bitácoras de la nube…';
  try {
    const datos = await Promise.all(obras.map(async (obra) => ({ obra, ...(await equipo.leerObra(obra, { fresco })) })));
    if (turno !== pintando) return;
    const nombreDe = (obra, u) => equipo.nombreDe(obra, u);
    const r = estado.vista === 'semana'
      ? resumenSemana(datos, lunes(estado.fecha), nombreDe)
      : resumenDia(datos, estado.fecha, nombreDe);
    nodos.contenido.replaceChildren(...(estado.vista === 'semana' ? pintarSemana(r) : pintarDia(r)).filter(Boolean));
    nodos.estado.textContent = `Datos de la nube a las ${new Date().toTimeString().slice(0, 5)}. Lo que aún no se ha sincronizado desde los teléfonos no aparece.`;
  } catch (e) {
    console.error(e);
    if (turno !== pintando) return;
    nodos.estado.textContent = '';
    nodos.contenido.replaceChildren(el('p', { class: 'error' },
      e && e.code === 'unavailable' ? 'Sin conexión: el panel necesita señal para leer las bitácoras.' : `No se pudieron leer las bitácoras (${(e && e.code) || 'error'}).`));
  }
}

function mover(dias) {
  estado.fecha = sumarDias(estado.fecha, estado.vista === 'semana' ? dias * 7 : dias);
  pintar();
}

/* --- cableado --- */

nodos.pestanas.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-vista]');
  if (!b) return;
  estado.vista = b.dataset.vista;
  pintar();
});
nodos.obra.addEventListener('change', () => { estado.obra = nodos.obra.value; pintar(); });
nodos.fecha.addEventListener('change', () => { if (nodos.fecha.value) { estado.fecha = nodos.fecha.value; pintar(); } });
nodos.antes.addEventListener('click', () => mover(-1));
nodos.despues.addEventListener('click', () => mover(1));
nodos.hoy.addEventListener('click', () => { estado.fecha = hoy(); pintar(); });
nodos.recargar.addEventListener('click', () => { equipo.sincronizar(); pintar({ fresco: true }); });
nodos.imprimir.addEventListener('click', () => {
  document.title = estado.vista === 'semana'
    ? `Resumen semanal ${lunes(estado.fecha)}` : `Resumen diario ${estado.fecha}`;
  print();
  document.title = 'COORDINATE · Panel del equipo';
});


addEventListener('crd-novedades', pintarNovedades);
addEventListener('crd-remoto', (ev) => { if ((ev.detail.nuevas || []).length) pintar({ fresco: true }); });

leerHash();

if (!equipo.activo) {
  nodos.grupoEquipo.hidden = false;
  $('equipo').replaceChildren(el('p', { class: 'pie' }, 'Las cuentas de equipo no están configuradas en esta instalación.'));
} else {
  // La cuenta (entrar, crear cuenta) se muestra sólo sin sesión.
  iniciarEquipoUI({
    grupo: nodos.grupoEquipo,
    contenedor: $('equipo'),
    avisar: (texto, ms) => avisar(nodos.aviso, texto, ms),
    obrasLocales: async () => []
  });
  let firmadoAntes = null;
  equipo.addEventListener('cambio', () => {
    const dentro = Boolean(equipo.usuario);
    nodos.grupoEquipo.hidden = dentro || !equipo.listo;
    nodos.panel.hidden = !dentro;
    if (!dentro) return;
    pintarSelector();
    const clave = equipo.obras.map((o) => o.id).join();
    if (clave !== firmadoAntes) { firmadoAntes = clave; pintar(); }
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
