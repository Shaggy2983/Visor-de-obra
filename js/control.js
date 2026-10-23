/* Control de obra (control.html): consultas RFI, órdenes de cambio,
   recepción de materiales y seguridad (SST).

   Rutas: #/rfi · #/cambios · #/materiales · #/sst · #/r/<sección>/<id>
   Todo se guarda en el teléfono según se escribe y, en una obra
   compartida, se sincroniza con el equipo. Datos en js/control-datos.js. */

import * as partes from './partes.js';
import { avisar as avisarEn } from './interfaz.js';
import { el, nuevoId, hoy, ahora, fechaLarga, plural, reducirImagen, mismaObra } from './utiles.js';
import {
  codigo, numeroDe, num,
  DISCIPLINAS, ESTADOS_RFI, nuevaRfi, esperaRfi, rfiVencida,
  TIPOS_CAMBIO, ESTADOS_CAMBIO, MONEDAS, ORIGENES, nuevoCambio, nuevaLineaCambio, importeLinea, totalCambio, totalConSigno,
  nuevaRecepcion, nuevaLineaMaterial, estadoRecepcion, ESTADOS_RECEPCION, faltanteLinea,
  TIPOS_SST, ICONOS_SST, PERMISOS, CLASES_INCIDENTE, nuevoSst, diasSinAccidentes, permisoOlvidado, incidenteAbierto,
  resumenControl
} from './control-datos.js';
import { documento, dato, cifra, cabecera, pie, cajaFirma, imprimir } from './impreso.js';
import { equipo } from './equipo.js';

const $ = (id) => document.getElementById(id);
const LADO_FOTO = 1600, CALIDAD_FOTO = 0.8;
const nodos = {
  lista: $('vista-lista'), ficha: $('vista-ficha'), form: $('ficha'), contenido: $('contenido'),
  filtro: $('filtro-obras'), nuevo: $('btn-nuevo'), volver: $('volver'), estado: $('estado-guardado'),
  aviso: $('aviso'), dialogo: $('dialogo'), informe: $('informe'), obras: $('obras-conocidas'),
  camara: $('entrada-camara'), galeria: $('entrada-galeria'), fotoGrande: $('foto-grande')
};
const avisar = (t, ms) => avisarEn(nodos.aviso, t, ms);
const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('es-DO', { maximumFractionDigits: d, minimumFractionDigits: d }));
const dinero = (n, moneda) => `${moneda} ${fmt(n, 2)}`;
const autorActual = () => (equipo.usuario && (equipo.usuario.displayName || equipo.usuario.email)) || '';
const CLAVE_OBRA = 'crd-obra-control';

let seccion = 'rfi';
let obraSel = (() => { try { return localStorage.getItem(CLAVE_OBRA) || ''; } catch (e) { return ''; } })();
let actual = null;
let pendiente = false;
let temporizador = null;
let urls = [];
let destinoFoto = null;
const urlDe = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const liberar = () => { for (const u of urls) URL.revokeObjectURL(u); urls = []; };

/* ------------------------------------------------------------------ */
/* secciones                                                           */
/* ------------------------------------------------------------------ */

const S = {
  rfi: {
    nombre: 'RFI', titulo: 'Consultas (RFI)', prefijo: 'RFI', boton: '+ RFI',
    listar: partes.listarRfis, leer: partes.leerRfi, guardar: partes.guardarRfi, borrar: partes.borrarRfi,
    nuevo: (obra, numero) => nuevaRfi({ obra, numero, autor: autorActual() }),
    vacio: 'Todavía no hay consultas. Una RFI es una pregunta al proyectista o a la dirección sobre algo que no está claro en planos o especificaciones: con su referencia, foto y fecha en que necesitas la respuesta.'
  },
  cambios: {
    nombre: 'Cambios', titulo: 'Órdenes de cambio', prefijo: 'OC', boton: '+ Orden',
    listar: partes.listarCambios, leer: partes.leerCambio, guardar: partes.guardarCambio, borrar: partes.borrarCambio,
    nuevo: (obra, numero) => nuevoCambio({ obra, numero, autor: autorActual() }),
    vacio: 'Todavía no hay órdenes de cambio. Registra cada adicional o deductivo con sus partidas, el impacto en plazo y quién lo aprueba.'
  },
  materiales: {
    nombre: 'Materiales', titulo: 'Recepción de materiales', prefijo: 'RM', boton: '+ Recepción',
    listar: partes.listarRecepciones, leer: partes.leerRecepcion, guardar: partes.guardarRecepcion, borrar: partes.borrarRecepcion,
    nuevo: (obra, numero) => nuevaRecepcion({ obra, numero, autor: autorActual() }),
    vacio: 'Todavía no hay recepciones. Al llegar un camión: proveedor, conduce, foto del conduce y lo pedido frente a lo recibido; los faltantes y rechazos quedan anotados.'
  },
  sst: {
    nombre: 'Seguridad', titulo: 'Seguridad y salud (SST)', prefijo: 'SST', boton: '+ Registro',
    listar: partes.listarSeguridad, leer: partes.leerSeguridad, guardar: partes.guardarSeguridad, borrar: partes.borrarSeguridad,
    nuevo: (obra, numero, tipo) => nuevoSst({ obra, numero, tipo, autor: autorActual() }),
    vacio: 'Todavía no hay registros de seguridad: charlas de 5 minutos con asistentes, revisión de EPP, permisos de trabajo (altura, caliente, excavación…) e incidentes.'
  }
};

/* ------------------------------------------------------------------ */
/* guardado y rutas                                                    */
/* ------------------------------------------------------------------ */

function cambiado() {
  if (!actual) return;
  actual.modificado = Date.now();
  pendiente = true;
  nodos.estado.textContent = 'Guardando…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarYa, 500);
}

async function guardarYa() {
  clearTimeout(temporizador);
  if (!pendiente || !actual) return;
  pendiente = false;
  const r = actual, s = S[actual.__seccion];
  try {
    const { __seccion, ...limpio } = r;
    await s.guardar(limpio);
    if (r === actual) nodos.estado.textContent = `Guardado ${ahora()}`;
  } catch (e) {
    pendiente = true;
    nodos.estado.textContent = 'Sin guardar';
    avisar('No se ha podido guardar. ¿Queda espacio en el teléfono?', 5000);
  }
}

async function enrutar() {
  await guardarYa();
  const m = location.hash.match(/^#\/r\/(rfi|cambios|materiales|sst)\/([^/]+)$/);
  if (m) {
    const r = await S[m[1]].leer(decodeURIComponent(m[2]));
    if (r) return abrir(m[1], r);
  }
  const s = (location.hash.match(/^#\/(rfi|cambios|materiales|sst)$/) || [])[1];
  if (!s) history.replaceState(null, '', `#/${seccion}`);
  seccion = s || seccion;
  return mostrarLista();
}

async function obrasConocidas() {
  const nombres = new Map();
  const poner = (n) => { const t = (n || '').trim(); if (t && !nombres.has(t.toLowerCase())) nombres.set(t.toLowerCase(), t); };
  const listas = await Promise.all([...Object.values(S).map((s) => s.listar()), partes.listarVisitas(), partes.listarRepasos()]);
  for (const l of listas) for (const r of l) poner(r.obra);
  for (const o of equipo.obras || []) poner(o.nombre);
  return [...nombres.values()];
}

/* ------------------------------------------------------------------ */
/* lista                                                               */
/* ------------------------------------------------------------------ */

async function mostrarLista() {
  actual = null;
  liberar();
  nodos.ficha.hidden = true;
  nodos.lista.hidden = false;
  nodos.nuevo.hidden = false;
  nodos.nuevo.textContent = S[seccion].boton;
  document.querySelector('.titulo-seccion').textContent = S[seccion].titulo;
  for (const k of Object.keys(S)) {
    const p = $(`pestana-${k}`);
    p.classList.toggle('activa', k === seccion);
    p.setAttribute('aria-selected', k === seccion ? 'true' : 'false');
  }
  resumenControl().catch(() => {});
  const todos = await S[seccion].listar();
  const obras = [...new Map(todos.filter((r) => r.obra).map((r) => [r.obra.trim().toLowerCase(), r.obra.trim()])).values()];
  if (obraSel && !obras.some((o) => mismaObra(o, obraSel))) obraSel = '';
  nodos.filtro.hidden = obras.length < 2;
  nodos.filtro.replaceChildren(...['', ...obras].map((o) => el('button', {
    type: 'button', class: `chip${mismaObra(o, obraSel) ? ' activo' : ''}`,
    onclick: () => { obraSel = o; mostrarLista(); }
  }, o || 'Todas')));
  const visibles = todos.filter((r) => !obraSel || mismaObra(r.obra, obraSel));
  const resumen = { rfi: resumenRfi, cambios: resumenCambios, materiales: resumenMateriales, sst: resumenSst }[seccion](visibles);
  const tarjeta = { rfi: tarjetaRfi, cambios: tarjetaCambio, materiales: tarjetaRecepcion, sst: tarjetaSst }[seccion];
  nodos.contenido.replaceChildren(
    visibles.length ? resumen : null,
    visibles.length ? el('div', { class: 'tarjetas' }, ...visibles.map(tarjeta)) : el('p', { class: 'vacio' }, S[seccion].vacio));
}

const indicador = (valor, texto, clase = '') => el('div', { class: `indicador ${clase}` }, el('strong', {}, valor), el('span', {}, texto));
const enlaceFicha = (s, r) => `#/r/${s}/${encodeURIComponent(r.id)}`;
const etiqueta = (texto, clase) => el('span', { class: `etiqueta ${clase}` }, texto);

function resumenRfi(lista) {
  const abiertas = lista.filter((r) => r.estado === 'abierta');
  const respondidas = lista.filter((r) => r.estado !== 'abierta' && r.fechaRespuesta);
  const media = respondidas.length ? respondidas.reduce((s, r) => s + (esperaRfi(r) || 0), 0) / respondidas.length : null;
  const vencidas = abiertas.filter((r) => rfiVencida(r)).length;
  return el('div', { class: 'indicadores grupo' },
    indicador(String(abiertas.length), 'abiertas', abiertas.length ? 'regular' : ''),
    indicador(String(vencidas), 'vencidas', vencidas ? 'mal' : ''),
    indicador(media == null ? '—' : `${fmt(media, 1)} d`, 'respuesta media'));
}

function tarjetaRfi(r) {
  const vencida = rfiVencida(r);
  return el('a', { class: 'tarjeta', href: enlaceFicha('rfi', r) },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('RFI', r.numero)} · ${fechaLarga(r.fecha)} `,
      etiqueta(ESTADOS_RFI[r.estado], r.estado === 'abierta' ? (vencida ? 'gravedad-grave' : 'atencion') : 'ok')),
    el('div', { class: 'tarjeta-obra' }, `❓ ${r.asunto || 'Consulta sin asunto'}`),
    el('div', { class: 'tarjeta-texto' }, [r.obra, DISCIPLINAS[r.disciplina], r.dirigidaA && `a ${r.dirigidaA}`].filter(Boolean).join(' · ')),
    el('div', { class: 'tarjeta-datos' },
      el('span', { class: vencida ? 'tarjeta-alerta' : '' }, `${esperaRfi(r)} días${r.estado === 'abierta' ? ' esperando' : ' en responder'}`),
      r.requerida && r.estado === 'abierta' ? el('span', {}, `para el ${r.requerida}`) : null,
      r.costo || r.plazo ? el('span', {}, [r.costo && 'impacta costo', r.plazo && 'impacta plazo'].filter(Boolean).join(' · ')) : null));
}

function resumenCambios(lista) {
  const porMoneda = new Map();
  for (const c of lista) {
    const k = c.moneda || 'RD$';
    if (!porMoneda.has(k)) porMoneda.set(k, { aprobado: 0, pendiente: 0 });
    const t = porMoneda.get(k);
    if (c.estado === 'aprobada') t.aprobado += totalConSigno(c);
    if (c.estado === 'enviada' || c.estado === 'borrador') t.pendiente += totalConSigno(c);
  }
  const plazo = lista.filter((c) => c.estado === 'aprobada').reduce((s, c) => s + (num(c.plazo) || 0), 0);
  return el('div', { class: 'indicadores grupo' },
    ...[...porMoneda.entries()].flatMap(([m, t]) => [indicador(dinero(t.aprobado, m), 'aprobado'), indicador(dinero(t.pendiente, m), 'por aprobar', t.pendiente ? 'regular' : '')]),
    indicador(`${fmt(plazo)} d`, 'plazo aprobado'));
}

function tarjetaCambio(c) {
  const clase = { borrador: 'atencion', enviada: 'atencion', aprobada: 'ok', rechazada: 'gravedad-grave' }[c.estado];
  return el('a', { class: 'tarjeta', href: enlaceFicha('cambios', c) },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('OC', c.numero)} · ${fechaLarga(c.fecha)} `, etiqueta(ESTADOS_CAMBIO[c.estado], clase)),
    el('div', { class: 'tarjeta-obra' }, `📝 ${c.titulo || 'Orden sin título'}`),
    el('div', { class: 'tarjeta-texto' }, [c.obra, TIPOS_CAMBIO[c.tipo], ORIGENES[c.origen]].filter(Boolean).join(' · ')),
    el('div', { class: 'tarjeta-datos' },
      el('span', {}, `${c.tipo === 'deductivo' ? '−' : ''}${dinero(totalCambio(c), c.moneda)}`),
      num(c.plazo) ? el('span', {}, `${c.plazo} días de plazo`) : null,
      el('span', {}, plural(c.partidas.length, 'partida', 'partidas'))));
}

function resumenMateriales(lista) {
  const faltantes = lista.filter((r) => estadoRecepcion(r) === 'parcial').length;
  const rechazos = lista.filter((r) => estadoRecepcion(r) === 'rechazo').length;
  return el('div', { class: 'indicadores grupo' },
    indicador(String(lista.length), 'recepciones'),
    indicador(String(faltantes), 'con faltantes', faltantes ? 'regular' : ''),
    indicador(String(rechazos), 'con rechazo', rechazos ? 'mal' : ''));
}

function tarjetaRecepcion(r) {
  const e = estadoRecepcion(r);
  const clase = { completa: 'ok', parcial: 'atencion', rechazo: 'gravedad-grave', vacia: 'atencion' }[e];
  return el('a', { class: 'tarjeta', href: enlaceFicha('materiales', r) },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('RM', r.numero)} · ${fechaLarga(r.fecha)} `, etiqueta(ESTADOS_RECEPCION[e], clase)),
    el('div', { class: 'tarjeta-obra' }, `📦 ${r.proveedor || 'Proveedor sin nombre'}`),
    el('div', { class: 'tarjeta-texto' }, [r.obra, r.conduce && `conduce ${r.conduce}`, r.lineas.map((l) => l.descripcion).filter(Boolean).slice(0, 3).join(', ')].filter(Boolean).join(' · ')),
    el('div', { class: 'tarjeta-datos' }, el('span', {}, plural(r.lineas.length, 'material', 'materiales')), r.fotos.length ? el('span', {}, `📷 ${r.fotos.length}`) : null));
}

function resumenSst(lista) {
  const dias = diasSinAccidentes(lista, obraSel);
  const mes = hoy().slice(0, 7);
  const charlas = lista.filter((r) => r.tipo === 'charla' && r.fecha.startsWith(mes)).length;
  const olvidados = lista.filter((r) => permisoOlvidado(r)).length;
  return el('div', { class: 'indicadores grupo' },
    indicador(dias == null ? 'Sin accidentes' : `${dias} d`, dias == null ? 'registrados' : 'sin accidentes', dias != null && dias < 7 ? 'mal' : ''),
    indicador(String(charlas), 'charlas este mes'),
    indicador(String(olvidados), 'permisos sin cerrar', olvidados ? 'mal' : ''),
    indicador(String(lista.filter(incidenteAbierto).length), 'incidentes abiertos', lista.some(incidenteAbierto) ? 'regular' : ''));
}

function tarjetaSst(r) {
  const extra = r.tipo === 'charla' ? [r.tema, plural(r.asistentes.length, 'asistente', 'asistentes')]
    : r.tipo === 'epp' ? [r.zona, `${r.puntos.filter((p) => p.valor === 'no').length} faltas`]
      : r.tipo === 'permiso' ? [PERMISOS[r.clase]?.nombre, r.zona, r.cerrado ? `cerrado ${r.cierre || ''}` : 'abierto']
        : [CLASES_INCIDENTE[r.clase], r.lugar, r.cerrado ? 'cerrado' : 'acciones abiertas'];
  const alerta = permisoOlvidado(r) || (r.tipo === 'incidente' && !r.cerrado);
  return el('a', { class: 'tarjeta', href: enlaceFicha('sst', r) },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('SST', r.numero)} · ${fechaLarga(r.fecha)}`, alerta ? ' ' : '', alerta ? etiqueta(permisoOlvidado(r) ? 'Sin cerrar' : 'Abierto', 'gravedad-grave') : null),
    el('div', { class: 'tarjeta-obra' }, `${ICONOS_SST[r.tipo]} ${TIPOS_SST[r.tipo]}`),
    el('div', { class: 'tarjeta-texto' }, [r.obra, ...extra].filter(Boolean).join(' · ')));
}

/* ------------------------------------------------------------------ */
/* crear                                                               */
/* ------------------------------------------------------------------ */

async function nuevo() {
  const obras = await obrasConocidas();
  nodos.obras.replaceChildren(...obras.map((o) => el('option', { value: o })));
  const campoObra = el('input', { class: 'campo', 'data-campo': 'obra', value: obraSel || obras[0] || '', placeholder: 'Nombre o código de la obra', list: 'obras-conocidas' });
  const crear = async (tipo) => {
    const obra = campoObra.value.trim();
    if (!obra) return campoObra.focus();
    try { localStorage.setItem(CLAVE_OBRA, obra); } catch (e) { /* nada */ }
    nodos.dialogo.close();
    const s = S[seccion];
    const r = s.nuevo(obra, numeroDe(await s.listar(), obra), tipo);
    await s.guardar(r);
    location.hash = enlaceFicha(seccion, r);
    return null;
  };
  nodos.dialogo.replaceChildren(
    el('div', { class: 'dialogo-cabecera' }, el('h2', {}, `Nuevo · ${S[seccion].titulo}`), el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => nodos.dialogo.close() }, '✕')),
    el('div', { class: 'dialogo-cuerpo' },
      el('label', { class: 'etiqueta-campo' }, 'Obra', campoObra),
      seccion === 'sst'
        ? el('div', { class: 'plantillas' }, ...Object.entries(TIPOS_SST).map(([k, t]) => el('button', { type: 'button', class: 'plantilla', onclick: () => crear(k) },
          el('span', { class: 'plantilla-icono' }, ICONOS_SST[k]), el('span', {}, el('strong', {}, t)))))
        : el('div', { class: 'fila-botones' }, el('button', { type: 'button', class: 'boton boton-destacado', onclick: () => crear() }, 'Crear'))));
  nodos.dialogo.showModal();
}

/* ------------------------------------------------------------------ */
/* ficha: piezas comunes                                               */
/* ------------------------------------------------------------------ */

function abrir(s, r) {
  liberar();
  actual = { ...r, __seccion: s };
  nodos.lista.hidden = true;
  nodos.ficha.hidden = false;
  nodos.nuevo.hidden = true;
  nodos.volver.href = `#/${s}`;
  nodos.volver.textContent = `← ${S[s].nombre}`;
  nodos.estado.textContent = '';
  document.querySelector('.titulo-seccion').textContent = codigo(S[s].prefijo, r.numero);
  pintar();
  scrollTo(0, 0);
}

function pintar() {
  const y = scrollY;
  liberar();
  const f = { rfi: fichaRfi, cambios: fichaCambio, materiales: fichaRecepcion, sst: fichaSst }[actual.__seccion];
  nodos.form.replaceChildren(...f(actual).filter(Boolean));
  scrollTo(0, y);
}

function campo(obj, clave, { etiqueta, tipo = 'text', placeholder = '', modo, datos, alSalir, lista } = {}) {
  const atr = { class: 'campo', type: tipo, value: obj[clave] ?? '', placeholder, inputmode: modo, list: lista };
  if (datos) atr['data-campo'] = datos;
  const n = el('input', atr);
  n.addEventListener('input', () => { obj[clave] = n.value; cambiado(); });
  if (alSalir) n.addEventListener('change', alSalir);
  return etiqueta ? el('label', {}, etiqueta, n) : n;
}

function area(obj, clave, { etiqueta, placeholder = '', filas = 3 } = {}) {
  const t = el('textarea', { class: 'campo', rows: filas, placeholder });
  t.value = obj[clave] || '';
  t.addEventListener('input', () => { obj[clave] = t.value; cambiado(); });
  return etiqueta ? el('label', {}, etiqueta, t) : t;
}

function selector(obj, clave, opciones, { etiqueta, alCambiar } = {}) {
  const s = el('select', { class: 'campo' }, ...Object.entries(opciones).map(([k, t]) => el('option', { value: k, selected: obj[clave] === k }, t)));
  s.addEventListener('change', () => { obj[clave] = s.value; cambiado(); if (alCambiar) alCambiar(s.value); });
  return etiqueta ? el('label', {}, etiqueta, s) : s;
}

function chips(opciones, valor, alElegir) {
  return el('div', { class: 'chips', role: 'radiogroup' }, ...Object.entries(opciones).map(([k, t]) => el('button', {
    type: 'button', class: `chip${valor === k ? ' activo' : ''}`, role: 'radio', 'aria-checked': valor === k ? 'true' : 'false',
    onclick: () => alElegir(k)
  }, t)));
}

function casilla(obj, clave, texto, alCambiar) {
  const c = el('input', { type: 'checkbox', checked: Boolean(obj[clave]) });
  c.addEventListener('change', () => { obj[clave] = c.checked; cambiado(); if (alCambiar) alCambiar(c.checked); });
  return el('label', { class: 'casilla' }, c, texto);
}

const cabeceraFicha = (r, icono, extra) => el('div', { class: 'grupo-cabecera' }, el('h2', {}, `${icono} ${codigo(S[r.__seccion].prefijo, r.numero)}`), extra || el('span', { class: 'pie' }, fechaLarga(r.fecha)));
const datosComunes = (r) => [
  campo(r, 'obra', { etiqueta: 'Obra', datos: 'obra' }),
  el('div', { class: 'dos' }, campo(r, 'fecha', { etiqueta: 'Fecha', tipo: 'date' }), campo(r, 'hora', { etiqueta: 'Hora', tipo: 'time' }))
];

function seccionFotos(r, titulo = 'Fotos') {
  const remotas = r.fotosRemotas || [];
  return el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, titulo), el('span', { class: 'pie' }, r.fotos.length ? plural(r.fotos.length, 'foto', 'fotos') : '')),
    el('div', { class: 'fotos' },
      ...r.fotos.map((f) => {
        const u = urlDe(f.blob);
        const pieFoto = el('input', { class: 'campo', value: f.pie || '', placeholder: 'Pie de foto' });
        pieFoto.addEventListener('input', () => { f.pie = pieFoto.value; cambiado(); });
        return el('figure', { class: 'foto' },
          el('img', { src: u, alt: '', onclick: () => { nodos.fotoGrande.querySelector('img').src = u; nodos.fotoGrande.hidden = false; } }),
          el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Quitar foto', onclick: () => { if (!confirm('¿Quitar esta foto?')) return; r.fotos = r.fotos.filter((x) => x !== f); cambiado(); pintar(); } }, '✕'),
          pieFoto);
      }),
      ...remotas.map((f) => (f.enlace
        ? el('a', { class: 'foto-remota', href: f.enlace, target: '_blank', rel: 'noopener noreferrer' }, el('span', { class: 'foto-remota-icono' }, '📷'), 'Ver foto en la nube')
        : el('span', { class: 'foto-remota' }, el('span', { class: 'foto-remota-icono' }, '📷'), 'Foto en el teléfono de su autor')))),
    el('div', { class: 'fila-botones' },
      el('button', { type: 'button', class: 'boton', onclick: () => { destinoFoto = actual; nodos.camara.click(); } }, 'Hacer foto'),
      el('button', { type: 'button', class: 'boton', onclick: () => { destinoFoto = actual; nodos.galeria.click(); } }, 'De la galería')));
}

for (const entrada of [nodos.camara, nodos.galeria]) {
  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files];
    entrada.value = '';
    const r = destinoFoto;
    destinoFoto = null;
    if (!r || !archivos.length) return;
    avisar(archivos.length > 1 ? `Guardando ${archivos.length} fotos…` : 'Guardando foto…');
    for (const a of archivos) {
      try {
        const { blob } = await reducirImagen(a, LADO_FOTO, CALIDAD_FOTO);
        if (blob) r.fotos.push({ id: nuevoId(), blob, fecha: hoy(), hora: ahora(), pie: '' });
      } catch (e) { avisar(`No se ha podido leer ${a.name || 'la imagen'}.`, 4000); }
    }
    if (r === actual) { cambiado(); pintar(); }
  });
}
nodos.fotoGrande.addEventListener('click', () => { nodos.fotoGrande.hidden = true; });

function acciones(r, textoPdf, pdf) {
  return el('section', { class: 'grupo acciones-ficha' },
    el('button', { type: 'button', class: 'boton boton-destacado grande', onclick: async () => { await guardarYa(); pdf(r); } }, textoPdf),
    el('button', {
      type: 'button', class: 'boton boton-peligro grande', onclick: async () => {
        if (!confirm('¿Borrar este registro con sus fotos? No se puede deshacer.')) return;
        pendiente = false;
        clearTimeout(temporizador);
        const s = r.__seccion;
        actual = null;
        await S[s].borrar(r.id);
        location.hash = `#/${s}`;
      }
    }, 'Borrar'));
}

/* Filas editables (partidas, materiales, asistentes, controles). */
function filas(lista, { columnas, nueva, textoNuevo, alCambiar }) {
  return [
    el('div', { class: 'filas-control' }, ...lista.map((x, i) => el('div', {
      class: `fila-control${columnas.length > 2 ? ' ancha' : ''}`,
      style: `--columnas:${columnas.map((c) => c.ancho || '1fr').join(' ')} 2.4rem;--resto:${columnas.length - 1}`
    },
      ...columnas.map((c) => {
        const n = el('input', { class: 'campo', value: x[c.clave] ?? '', placeholder: c.placeholder || '', inputmode: c.modo, type: c.tipo || 'text', 'aria-label': c.titulo });
        n.addEventListener('input', () => { x[c.clave] = n.value; cambiado(); if (alCambiar) alCambiar(); });
        return el('label', {}, i === 0 || c.siempre ? c.titulo : '', n);
      }),
      el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Quitar', onclick: () => { lista.splice(lista.indexOf(x), 1); cambiado(); pintar(); } }, '✕')))),
    el('div', { class: 'fila-botones' }, el('button', {
      type: 'button', class: 'boton', onclick: () => {
        lista.push(nueva());
        cambiado(); pintar();
        const ultimas = nodos.form.querySelectorAll('.fila-control');
        ultimas[ultimas.length - 1]?.querySelector('input')?.focus();
      }
    }, textoNuevo))
  ];
}

/* ------------------------------------------------------------------ */
/* RFI                                                                 */
/* ------------------------------------------------------------------ */

function fichaRfi(r) {
  const vencida = rfiVencida(r);
  return [
    el('section', { class: 'grupo' },
      cabeceraFicha(r, '❓', etiqueta(ESTADOS_RFI[r.estado], r.estado === 'abierta' ? (vencida ? 'gravedad-grave' : 'atencion') : 'ok')),
      campo(r, 'asunto', { etiqueta: 'Asunto', placeholder: 'p. ej. Cota de nivel de losa en eje C' }),
      ...datosComunes(r),
      el('div', { class: 'dos' },
        selector(r, 'disciplina', DISCIPLINAS, { etiqueta: 'Disciplina' }),
        campo(r, 'referencia', { etiqueta: 'Plano o especificación', placeholder: 'p. ej. EST-N3-001, detalle 4' })),
      el('div', { class: 'dos' },
        campo(r, 'dirigidaA', { etiqueta: 'Dirigida a', placeholder: 'Proyectista / dirección' }),
        campo(r, 'solicita', { etiqueta: 'Solicita', datos: 'autor', placeholder: 'Nombre y cargo' })),
      campo(r, 'requerida', { etiqueta: 'Respuesta requerida para', tipo: 'date', alSalir: pintar }),
      vencida ? el('p', { class: 'pie aviso-texto' }, `Vencida: se necesitaba el ${r.requerida}. ${esperaRfi(r)} días esperando.`) : null),
    el('section', { class: 'grupo' },
      el('h2', {}, 'Consulta'),
      area(r, 'pregunta', { placeholder: 'Qué no está claro, dónde y por qué hace falta saberlo', filas: 4 }),
      el('h2', {}, 'Propuesta de la obra (opcional)'),
      area(r, 'propuesta', { placeholder: 'Cómo propones resolverlo', filas: 2 })),
    seccionFotos(r),
    el('section', { class: 'grupo' },
      el('h2', {}, 'Respuesta'),
      chips(ESTADOS_RFI, r.estado, (k) => {
        r.estado = k;
        if (k !== 'abierta' && !r.fechaRespuesta) r.fechaRespuesta = hoy();
        if (k === 'abierta') r.fechaRespuesta = '';
        cambiado(); pintar();
      }),
      area(r, 'respuesta', { placeholder: 'Respuesta recibida', filas: 4 }),
      el('div', { class: 'dos' },
        campo(r, 'respondePor', { etiqueta: 'Responde', placeholder: 'Nombre y cargo' }),
        campo(r, 'fechaRespuesta', { etiqueta: 'Fecha de respuesta', tipo: 'date', alSalir: pintar })),
      el('div', { class: 'fila-botones' }, casilla(r, 'costo', 'Impacta el costo', pintar), casilla(r, 'plazo', 'Impacta el plazo', pintar)),
      (r.costo || r.plazo) && !r.cambio ? el('div', { class: 'fila-botones' }, el('button', {
        type: 'button', class: 'boton boton-destacado', onclick: () => cambioDesdeRfi(r)
      }, 'Crear orden de cambio')) : null,
      r.cambio ? el('p', { class: 'pie' }, el('a', { href: `#/r/cambios/${encodeURIComponent(r.cambio)}` }, '→ Ver la orden de cambio')) : null,
      el('p', { class: 'pie' }, `${esperaRfi(r)} días ${r.estado === 'abierta' ? 'esperando respuesta' : 'en responder'}.`)),
    acciones(r, 'RFI en PDF', pdfRfi)
  ];
}

async function cambioDesdeRfi(r) {
  const s = S.cambios;
  const c = s.nuevo(r.obra, numeroDe(await s.listar(), r.obra));
  Object.assign(c, { titulo: r.asunto, origen: 'rfi', rfi: r.id, descripcion: `Según respuesta a ${codigo('RFI', r.numero)}: ${r.respuesta || r.pregunta}`.trim(), ...(r.obraId ? { obraId: r.obraId } : {}) });
  await s.guardar(c);
  r.cambio = c.id;
  cambiado();
  await guardarYa();
  location.hash = enlaceFicha('cambios', c);
}

function pdfRfi(r) {
  const { titulo } = documento();
  imprimir(nodos.informe, `${codigo('RFI', r.numero)} ${r.obra} ${r.fecha}`, [
    ...cabecera('Solicitud de información (RFI)', `${codigo('RFI', r.numero)}-${r.fecha.replaceAll('-', '')}`, r.asunto || 'Consulta', r.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', fechaLarga(r.fecha)), dato('Disciplina', DISCIPLINAS[r.disciplina]), dato('Referencia', r.referencia),
      dato('Dirigida a', r.dirigidaA), dato('Solicita', r.solicita), dato('Respuesta requerida', r.requerida ? fechaLarga(r.requerida) : '')),
    el('section', {}, titulo('Consulta'), el('p', { class: 'parrafo' }, r.pregunta || '—')),
    r.propuesta?.trim() ? el('section', {}, titulo('Propuesta de la obra'), el('p', { class: 'parrafo' }, r.propuesta.trim())) : null,
    fotosPdf(r, titulo),
    el('section', {}, titulo('Respuesta', ESTADOS_RFI[r.estado]),
      el('p', { class: 'parrafo' }, r.respuesta?.trim() || '—'),
      el('p', { class: 'informe-nota' }, [r.respondePor && `Responde: ${r.respondePor}`, r.fechaRespuesta && `Fecha: ${r.fechaRespuesta}`, `Días en responder: ${esperaRfi(r)}`, r.costo && 'Impacta el costo', r.plazo && 'Impacta el plazo'].filter(Boolean).join(' · '))),
    el('section', { class: 'informe-firma' }, titulo('Firmas'),
      el('div', { class: 'informe-firmas' }, cajaFirma(null, r.solicita, 'Solicita'), cajaFirma(null, r.respondePor, 'Responde'))),
    pie()
  ], { pagina: 'control' });
}

function fotosPdf(r, titulo) {
  if (!r.fotos.length) return null;
  return el('section', {}, titulo('Fotos', plural(r.fotos.length, 'foto', 'fotos')),
    el('div', { class: 'informe-fotos' }, ...r.fotos.map((f) => el('figure', {}, el('img', { src: urlDe(f.blob), alt: '' }), f.pie ? el('figcaption', {}, f.pie) : null))));
}

/* ------------------------------------------------------------------ */
/* órdenes de cambio                                                   */
/* ------------------------------------------------------------------ */

function fichaCambio(c) {
  const total = el('p', { class: 'total-cambio' });
  const pintarTotal = () => { total.textContent = `Total: ${c.tipo === 'deductivo' ? '−' : ''}${dinero(totalCambio(c), c.moneda)}`; };
  pintarTotal();
  const clase = { borrador: 'atencion', enviada: 'atencion', aprobada: 'ok', rechazada: 'gravedad-grave' }[c.estado];
  return [
    el('section', { class: 'grupo' },
      cabeceraFicha(c, '📝', etiqueta(ESTADOS_CAMBIO[c.estado], clase)),
      campo(c, 'titulo', { etiqueta: 'Título', placeholder: 'p. ej. Cambio de cerámica en baños' }),
      ...datosComunes(c),
      el('div', { class: 'dos' }, selector(c, 'origen', ORIGENES, { etiqueta: 'Origen' }), selector(c, 'tipo', TIPOS_CAMBIO, { etiqueta: 'Tipo', alCambiar: pintar })),
      area(c, 'descripcion', { etiqueta: 'Descripción del cambio', placeholder: 'Qué cambia, dónde y por qué', filas: 3 }),
      c.rfi ? el('p', { class: 'pie' }, el('a', { href: `#/r/rfi/${encodeURIComponent(c.rfi)}` }, '← Viene de una RFI')) : null),
    c.tipo !== 'sinCosto' ? el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Partidas'), (() => {
        const m = el('select', { class: 'campo campo-moneda', 'aria-label': 'Moneda' }, ...MONEDAS.map((x) => el('option', { value: x, selected: c.moneda === x }, x)));
        m.addEventListener('change', () => { c.moneda = m.value; cambiado(); pintarTotal(); });
        return m;
      })()),
      ...filas(c.partidas, {
        columnas: [
          { clave: 'descripcion', titulo: 'Descripción', ancho: '2fr' },
          { clave: 'unidad', titulo: 'Ud.', ancho: '3.4rem' },
          { clave: 'cantidad', titulo: 'Cant.', modo: 'decimal', ancho: '4rem' },
          { clave: 'precio', titulo: 'Precio', modo: 'decimal', ancho: '5rem' }
        ],
        nueva: nuevaLineaCambio, textoNuevo: '+ Partida', alCambiar: pintarTotal
      }),
      total,
      el('p', { class: 'pie' }, 'Montos de referencia antes de impuestos; el ITBIS va aparte según el contrato.')) : null,
    el('section', { class: 'grupo' },
      el('h2', {}, 'Plazo y aprobación'),
      campo(c, 'plazo', { etiqueta: 'Impacto en plazo (días)', modo: 'numeric', placeholder: '0' }),
      chips(ESTADOS_CAMBIO, c.estado, (k) => {
        c.estado = k;
        if ((k === 'aprobada' || k === 'rechazada') && !c.fechaAprobacion) c.fechaAprobacion = hoy();
        cambiado(); pintar();
      }),
      el('div', { class: 'dos' },
        campo(c, 'solicita', { etiqueta: 'Solicita', datos: 'autor' }),
        campo(c, 'aprueba', { etiqueta: 'Aprueba', placeholder: 'Cliente / dirección' })),
      campo(c, 'fechaAprobacion', { etiqueta: 'Fecha de aprobación', tipo: 'date' }),
      area(c, 'observaciones', { etiqueta: 'Observaciones', filas: 2 })),
    seccionFotos(c),
    acciones(c, 'Orden de cambio en PDF', pdfCambio)
  ];
}

function pdfCambio(c) {
  const { titulo } = documento();
  const total = totalCambio(c);
  imprimir(nodos.informe, `${codigo('OC', c.numero)} ${c.obra} ${c.fecha}`, [
    ...cabecera('Orden de cambio', `${codigo('OC', c.numero)}-${c.fecha.replaceAll('-', '')}`, c.titulo || 'Orden de cambio', c.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', fechaLarga(c.fecha)), dato('Tipo', TIPOS_CAMBIO[c.tipo]), dato('Origen', ORIGENES[c.origen]),
      dato('Estado', ESTADOS_CAMBIO[c.estado]), dato('Impacto en plazo', num(c.plazo) ? `${c.plazo} días` : 'Sin impacto'), dato('Aprobación', c.fechaAprobacion)),
    el('section', {}, titulo('Descripción'), el('p', { class: 'parrafo' }, c.descripcion || '—')),
    c.tipo !== 'sinCosto' && c.partidas.length ? el('section', { class: 'informe-larga' }, titulo('Partidas', c.moneda),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Descripción'), el('th', {}, 'Ud.'), el('th', { class: 'num' }, 'Cantidad'), el('th', { class: 'num' }, 'Precio'), el('th', { class: 'num' }, 'Importe'))),
        el('tbody', {}, ...c.partidas.map((l, i) => el('tr', {}, el('td', { class: 'num' }, String(i + 1)), el('td', {}, l.descripcion || '—'), el('td', {}, l.unidad),
          el('td', { class: 'num' }, fmt(num(l.cantidad), 2)), el('td', { class: 'num' }, fmt(num(l.precio), 2)), el('td', { class: 'num' }, fmt(importeLinea(l), 2)))),
          el('tr', { class: 'informe-total' }, el('td', {}), el('td', {}, el('strong', {}, c.tipo === 'deductivo' ? 'Total deductivo' : 'Total adicional')), el('td', {}), el('td', {}), el('td', {}),
            el('td', { class: 'num' }, el('strong', {}, dinero(total, c.moneda)))))),
      el('p', { class: 'informe-nota' }, 'Montos antes de impuestos; el ITBIS se aplica según el contrato.')) : null,
    c.observaciones?.trim() ? el('section', {}, titulo('Observaciones'), el('p', { class: 'parrafo' }, c.observaciones.trim())) : null,
    fotosPdf(c, titulo),
    el('section', { class: 'informe-firma' }, titulo('Aprobación'),
      el('div', { class: 'informe-firmas' }, cajaFirma(null, c.solicita, 'Solicita'), cajaFirma(null, c.aprueba, 'Aprueba'))),
    pie()
  ], { pagina: 'control' });
}

/* ------------------------------------------------------------------ */
/* recepción de materiales                                             */
/* ------------------------------------------------------------------ */

function fichaRecepcion(r) {
  const e = estadoRecepcion(r);
  const clase = { completa: 'ok', parcial: 'atencion', rechazo: 'gravedad-grave', vacia: 'atencion' }[e];
  const faltan = r.lineas.filter((l) => faltanteLinea(l) > 0 || (num(l.rechazada) || 0) > 0);
  return [
    el('section', { class: 'grupo' },
      cabeceraFicha(r, '📦', etiqueta(ESTADOS_RECEPCION[e], clase)),
      campo(r, 'proveedor', { etiqueta: 'Proveedor', placeholder: 'Suplidor' }),
      ...datosComunes(r),
      el('div', { class: 'dos' },
        campo(r, 'conduce', { etiqueta: 'Nº de conduce / factura' }),
        campo(r, 'orden', { etiqueta: 'Orden de compra', placeholder: 'Opcional' })),
      campo(r, 'recibe', { etiqueta: 'Recibe', datos: 'autor', placeholder: 'Nombre y cargo' })),
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Materiales'), el('span', { class: 'pie' }, plural(r.lineas.length, 'línea', 'líneas'))),
      ...filas(r.lineas, {
        columnas: [
          { clave: 'descripcion', titulo: 'Material', ancho: '2fr' },
          { clave: 'unidad', titulo: 'Ud.', ancho: '3.2rem' },
          { clave: 'pedida', titulo: 'Pedido', modo: 'decimal', ancho: '3.8rem' },
          { clave: 'recibida', titulo: 'Recibido', modo: 'decimal', ancho: '3.8rem' },
          { clave: 'rechazada', titulo: 'Rechazo', modo: 'decimal', ancho: '3.8rem' }
        ],
        nueva: nuevaLineaMaterial, textoNuevo: '+ Material'
      }),
      faltan.length ? el('div', { class: 'aviso-repasos' }, el('p', {}, faltan.map((l) => [l.descripcion || 'Material',
        faltanteLinea(l) > 0 && `faltan ${fmt(faltanteLinea(l), 2)} ${l.unidad}`, (num(l.rechazada) || 0) > 0 && `rechazado ${fmt(num(l.rechazada), 2)} ${l.unidad}`].filter(Boolean).join(': ')).join(' · '))) : null,
      el('p', { class: 'pie' }, 'Haz foto del conduce firmado y de lo rechazado. Lo pendiente se ve en la lista como «Faltante».')),
    seccionFotos(r, 'Fotos (conduce y material)'),
    el('section', { class: 'grupo' }, el('h2', {}, 'Observaciones'), area(r, 'observaciones', { placeholder: 'Estado del material, motivo del rechazo, almacenamiento…', filas: 3 })),
    acciones(r, 'Recepción en PDF', pdfRecepcion)
  ];
}

function pdfRecepcion(r) {
  const { titulo } = documento();
  imprimir(nodos.informe, `${codigo('RM', r.numero)} ${r.obra} ${r.fecha}`, [
    ...cabecera('Recepción de materiales', `${codigo('RM', r.numero)}-${r.fecha.replaceAll('-', '')}`, r.proveedor || 'Recepción de materiales', r.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', `${fechaLarga(r.fecha)}${r.hora ? ` · ${r.hora}` : ''}`), dato('Conduce / factura', r.conduce), dato('Orden de compra', r.orden),
      dato('Recibe', r.recibe), dato('Estado', ESTADOS_RECEPCION[estadoRecepcion(r)]), dato('Líneas', String(r.lineas.length))),
    el('section', { class: 'informe-larga' }, titulo('Materiales'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Material'), el('th', {}, 'Ud.'), el('th', { class: 'num' }, 'Pedido'), el('th', { class: 'num' }, 'Recibido'), el('th', { class: 'num' }, 'Rechazo'), el('th', { class: 'num' }, 'Falta'))),
        el('tbody', {}, ...r.lineas.map((l) => el('tr', {}, el('td', {}, l.descripcion || '—'), el('td', {}, l.unidad),
          el('td', { class: 'num' }, fmt(num(l.pedida), 2)), el('td', { class: 'num' }, fmt(num(l.recibida), 2)),
          el('td', { class: 'num' }, fmt(num(l.rechazada), 2)), el('td', { class: 'num' }, faltanteLinea(l) ? fmt(faltanteLinea(l), 2) : '—')))))),
    r.observaciones?.trim() ? el('section', {}, titulo('Observaciones'), el('p', { class: 'parrafo' }, r.observaciones.trim())) : null,
    fotosPdf(r, titulo),
    el('section', { class: 'informe-firma' }, titulo('Conformidad'),
      el('div', { class: 'informe-firmas' }, cajaFirma(null, r.recibe, 'Recibe en obra'), cajaFirma(null, '', `Entrega · ${r.proveedor || 'proveedor'}`))),
    pie()
  ], { pagina: 'control' });
}

/* ------------------------------------------------------------------ */
/* seguridad                                                           */
/* ------------------------------------------------------------------ */

function fichaSst(r) {
  const comunes = [
    el('section', { class: 'grupo' },
      cabeceraFicha(r, ICONOS_SST[r.tipo], el('span', { class: 'pie' }, TIPOS_SST[r.tipo])),
      ...datosComunes(r),
      campo(r, 'responsable', { etiqueta: r.tipo === 'charla' ? 'Imparte' : r.tipo === 'permiso' ? 'Solicita' : 'Responsable', datos: 'autor', placeholder: 'Nombre y cargo' }))
  ];
  const propio = { charla: fichaCharla, epp: fichaEpp, permiso: fichaPermiso, incidente: fichaIncidente }[r.tipo](r);
  return [...comunes, ...propio, seccionFotos(r),
    el('section', { class: 'grupo' }, el('h2', {}, 'Observaciones'), area(r, 'observaciones', { filas: 2 })),
    acciones(r, 'Registro en PDF', pdfSst)];
}

function fichaCharla(r) {
  return [el('section', { class: 'grupo' },
    el('h2', {}, 'Charla'),
    campo(r, 'tema', { etiqueta: 'Tema', placeholder: 'p. ej. Uso correcto del arnés' }),
    campo(r, 'duracion', { etiqueta: 'Duración (min)', modo: 'numeric' })),
  el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Asistentes'), el('span', { class: 'pie' }, plural(r.asistentes.length, 'persona', 'personas'))),
    ...filas(r.asistentes, {
      columnas: [{ clave: 'nombre', titulo: 'Nombre', ancho: '1.3fr' }, { clave: 'empresa', titulo: 'Empresa / oficio', ancho: '1fr' }],
      nueva: () => ({ id: nuevoId(), nombre: '', empresa: '' }), textoNuevo: '+ Asistente'
    }),
    el('p', { class: 'pie' }, 'El PDF sale con una columna para que firme cada asistente.'))];
}

function puntosChecklist(lista, conNota = true) {
  const valores = { si: '✓ Cumple', no: '✗ No cumple', na: 'N/A' };
  return el('div', { class: 'puntos' }, ...lista.map((p, i) => {
    const nota = el('input', { class: 'campo', value: p.nota || '', placeholder: 'Nota' });
    nota.addEventListener('input', () => { p.nota = nota.value; cambiado(); });
    return el('div', { class: `punto ${p.valor || 'sin-revisar'}` },
      el('div', { class: 'punto-cabecera' }, el('span', { class: 'punto-n' }, String(i + 1)), el('span', { class: 'punto-texto' }, p.texto)),
      el('div', { class: 'punto-valores punto-valores-tres' }, ...Object.entries(valores).map(([k, t]) => el('button', {
        type: 'button', class: `valor valor-${k}${p.valor === k ? ' activo' : ''}`, onclick: () => { p.valor = p.valor === k ? '' : k; cambiado(); pintar(); }
      }, t))),
      conNota && (p.valor === 'no' || p.nota) ? el('div', { class: 'punto-detalle' }, nota) : null);
  }));
}

function fichaEpp(r) {
  const no = r.puntos.filter((p) => p.valor === 'no').length;
  return [el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Equipo de protección personal'), el('span', { class: 'pie' }, no ? `${no} faltas` : '')),
    el('div', { class: 'dos' }, campo(r, 'zona', { etiqueta: 'Frente o zona' }), campo(r, 'personas', { etiqueta: 'Personas revisadas', modo: 'numeric' })),
    puntosChecklist(r.puntos))];
}

function fichaPermiso(r) {
  return [el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Permiso'), etiqueta(r.cerrado ? 'Cerrado' : 'Abierto', r.cerrado ? 'ok' : permisoOlvidado(r) ? 'gravedad-grave' : 'atencion')),
    selector(r, 'clase', Object.fromEntries(Object.entries(PERMISOS).map(([k, p]) => [k, p.nombre])), {
      etiqueta: 'Tipo de trabajo',
      alCambiar: (k) => {
        // Al cambiar de tipo, los controles pasan a los de ese trabajo.
        if (r.controles.some((c) => c.valor) && !confirm('¿Cambiar los controles por los de este tipo de trabajo?')) return pintar();
        r.controles = PERMISOS[k].controles.map((texto) => ({ id: nuevoId(), texto, valor: '' }));
        cambiado(); return pintar();
      }
    }),
    campo(r, 'trabajo', { etiqueta: 'Trabajo a realizar', placeholder: 'p. ej. Montaje de barandas en fachada norte' }),
    el('div', { class: 'dos' }, campo(r, 'zona', { etiqueta: 'Zona' }), campo(r, 'ejecuta', { etiqueta: 'Ejecuta (empresa / cuadrilla)' })),
    el('div', { class: 'dos' }, campo(r, 'desde', { etiqueta: 'Desde', tipo: 'time' }), campo(r, 'hasta', { etiqueta: 'Hasta', tipo: 'time' }))),
  el('section', { class: 'grupo' },
    el('h2', {}, 'Controles antes de empezar'),
    puntosChecklist(r.controles, false),
    campo(r, 'autoriza', { etiqueta: 'Autoriza', placeholder: 'Nombre y cargo' }),
    el('div', { class: 'fila-botones' }, casilla(r, 'cerrado', 'Trabajo terminado y permiso cerrado', (si) => { r.cierre = si ? ahora() : ''; cambiado(); pintar(); })),
    permisoOlvidado(r) ? el('p', { class: 'pie aviso-texto' }, 'Este permiso es de otro día y sigue abierto: ciérralo.') : null)];
}

function fichaIncidente(r) {
  return [el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Incidente'), etiqueta(r.cerrado ? 'Cerrado' : 'Abierto', r.cerrado ? 'ok' : 'gravedad-grave')),
    chips(CLASES_INCIDENTE, r.clase, (k) => { r.clase = k; cambiado(); pintar(); }),
    campo(r, 'lugar', { etiqueta: 'Lugar' }),
    area(r, 'descripcion', { etiqueta: 'Qué pasó', placeholder: 'Hechos, sin juicios: qué, cómo, con qué', filas: 3 }),
    campo(r, 'afectado', { etiqueta: 'Persona o equipo afectado (opcional)', placeholder: 'Nombre o puesto; sin datos médicos' }),
    area(r, 'causas', { etiqueta: 'Causas', filas: 2 })),
  el('section', { class: 'grupo' },
    el('h2', {}, 'Acciones'),
    area(r, 'acciones', { placeholder: 'Qué se hará para que no se repita', filas: 3 }),
    el('div', { class: 'dos' }, campo(r, 'accionResponsable', { etiqueta: 'Responsable' }), campo(r, 'limite', { etiqueta: 'Fecha límite', tipo: 'date' })),
    el('div', { class: 'fila-botones' }, casilla(r, 'cerrado', 'Acciones cumplidas, incidente cerrado', () => pintar())),
    el('p', { class: 'pie' }, 'Ante un accidente con lesión, primero la atención y los avisos que exige la ley; este registro es el seguimiento en obra.'))];
}

function pdfSst(r) {
  const { titulo } = documento();
  const tabla = (lista) => el('table', { class: 'informe-tabla' },
    el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Punto'), el('th', {}, 'Estado'), el('th', {}, 'Nota'))),
    el('tbody', {}, ...lista.map((p, i) => el('tr', {}, el('td', { class: 'num' }, String(i + 1)), el('td', {}, p.texto),
      el('td', {}, el('span', { class: `informe-estado ${p.valor || 'pendiente'}` }, { si: 'Cumple', no: 'No cumple', na: 'N/A' }[p.valor] || 'Sin revisar')), el('td', {}, p.nota || '')))));
  const cuerpo = {
    charla: () => [
      el('section', {}, titulo('Tema'), el('p', { class: 'parrafo' }, `${r.tema || '—'}${r.duracion ? ` · ${r.duracion} min` : ''}`)),
      el('section', { class: 'informe-larga' }, titulo('Asistentes', plural(r.asistentes.length, 'persona', 'personas')),
        el('table', { class: 'informe-tabla informe-asistentes' },
          el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Nombre'), el('th', {}, 'Empresa / oficio'), el('th', {}, 'Firma'))),
          el('tbody', {}, ...r.asistentes.map((a, i) => el('tr', {}, el('td', { class: 'num' }, String(i + 1)), el('td', {}, a.nombre || '—'), el('td', {}, a.empresa || '—'), el('td', { class: 'informe-firma-celda' }, ''))))))],
    epp: () => [el('section', {}, titulo('Equipo de protección personal', [r.zona, r.personas && `${r.personas} personas`].filter(Boolean).join(' · ')), tabla(r.puntos))],
    permiso: () => [
      el('div', { class: 'informe-ficha' }, dato('Tipo de trabajo', PERMISOS[r.clase]?.nombre), dato('Zona', r.zona), dato('Ejecuta', r.ejecuta),
        dato('Horario', [r.desde, r.hasta].filter(Boolean).join(' – ')), dato('Estado', r.cerrado ? `Cerrado ${r.cierre || ''}` : 'Abierto'), dato('Autoriza', r.autoriza)),
      el('section', {}, titulo('Trabajo'), el('p', { class: 'parrafo' }, r.trabajo || '—')),
      el('section', {}, titulo('Controles'), tabla(r.controles))],
    incidente: () => [
      el('div', { class: 'informe-ficha' }, dato('Clase', CLASES_INCIDENTE[r.clase]), dato('Lugar', r.lugar), dato('Estado', r.cerrado ? 'Cerrado' : 'Abierto')),
      el('section', {}, titulo('Qué pasó'), el('p', { class: 'parrafo' }, r.descripcion || '—'), r.afectado ? el('p', { class: 'informe-nota' }, `Afectado: ${r.afectado}`) : null),
      el('section', {}, titulo('Causas'), el('p', { class: 'parrafo' }, r.causas || '—')),
      el('section', {}, titulo('Acciones'), el('p', { class: 'parrafo' }, r.acciones || '—'),
        el('p', { class: 'informe-nota' }, [r.accionResponsable && `Responsable: ${r.accionResponsable}`, r.limite && `Fecha límite: ${r.limite}`].filter(Boolean).join(' · ')))]
  }[r.tipo]();
  const firmas = r.tipo === 'permiso' ? [cajaFirma(null, r.responsable, 'Solicita'), cajaFirma(null, r.autoriza, 'Autoriza')]
    : [cajaFirma(null, r.responsable, r.tipo === 'charla' ? 'Imparte' : 'Responsable'), cajaFirma(null, '', 'Supervisión')];
  imprimir(nodos.informe, `${codigo('SST', r.numero)} ${r.obra} ${r.fecha}`, [
    ...cabecera(TIPOS_SST[r.tipo], `${codigo('SST', r.numero)}-${r.fecha.replaceAll('-', '')}`, TIPOS_SST[r.tipo], r.obra),
    r.tipo === 'permiso' || r.tipo === 'incidente' ? null : el('div', { class: 'informe-ficha' }, dato('Fecha', `${fechaLarga(r.fecha)}${r.hora ? ` · ${r.hora}` : ''}`), dato(r.tipo === 'charla' ? 'Imparte' : 'Responsable', r.responsable), dato('Obra', r.obra)),
    ...cuerpo,
    r.observaciones?.trim() ? el('section', {}, titulo('Observaciones'), el('p', { class: 'parrafo' }, r.observaciones.trim())) : null,
    fotosPdf(r, titulo),
    el('section', { class: 'informe-firma' }, titulo('Firmas'), el('div', { class: 'informe-firmas' }, ...firmas)),
    pie()
  ], { pagina: 'control' });
}

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

nodos.nuevo.addEventListener('click', nuevo);
addEventListener('hashchange', enrutar);
addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });
addEventListener('pagehide', guardarYa);
addEventListener('crd-remoto', async (ev) => {
  const ids = new Set(ev.detail.ids);
  if (!actual) return mostrarLista();
  if (ids.has(actual.id) && !pendiente) {
    const fresco = await S[actual.__seccion].leer(actual.id);
    if (fresco) { actual = { ...fresco, __seccion: actual.__seccion }; pintar(); }
  }
  return null;
});

if (equipo.activo) equipo.iniciar().catch(() => {});
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

enrutar();
