/* Calidad de obra (calidad.html): inspecciones con checklist y liberación
   firmada, y registro de vaciados de hormigón con sus probetas.

   Rutas: #/inspecciones · #/inspeccion/ID · #/vaciados · #/vaciado/ID
   (#/vaciado/ID/probeta/PID abre el vaciado en esa probeta).

   Todo se guarda en el teléfono según se escribe (partes.js) y, en una
   obra compartida, se sincroniza con el equipo como las visitas. */

import {
  listarInspecciones, leerInspeccion, guardarInspeccion, borrarInspeccion,
  listarVaciados, leerVaciado, guardarVaciado, borrarVaciado,
  listarVisitas, listarRepasos, guardarRepaso
} from './partes.js';
import { avisar as avisarEn } from './interfaz.js';
import { el, nuevoId, hoy, ahora, fechaLarga, plural, reducirImagen, decodificar, mismaObra } from './utiles.js';
import {
  PLANTILLAS, VALORES, RESULTADOS, METODOS, UNIDADES,
  nuevaInspeccion, cuentaPuntos, resultadoSugerido, numeroDe, codigo,
  nuevoVaciado, fechaRotura, estadoProbeta, volumenReal, revenimientoFuera, evaluacion, agendaRoturas,
  numero, resumenCalidad
} from './calidad-datos.js';
import { equipo } from './equipo.js';

const $ = (id) => document.getElementById(id);
const LADO_FOTO = 1600;
const CALIDAD_FOTO = 0.8;
const CONTACTO = 'hola@coordinate.do · coordinate.do · Santo Domingo, RD';
const LEMA = 'Los problemas se resuelven en el modelo, no en obra.';
const CLAVE_OBRA = 'crd-obra-calidad';

const nodos = {
  lista: $('vista-lista'), ficha: $('vista-ficha'), form: $('ficha'),
  tarjetas: $('lista'), vacia: $('lista-vacia'), filtro: $('filtro-obras'), agenda: $('agenda'),
  nuevo: $('btn-nuevo'), volver: $('volver'), estado: $('estado-guardado'),
  camara: $('entrada-camara'), galeria: $('entrada-galeria'), entradaFirma: $('entrada-firma'),
  aviso: $('aviso'), dialogo: $('dialogo'), informe: $('informe'), fotoGrande: $('foto-grande'),
  obras: $('obras-conocidas')
};
const avisar = (t, ms) => avisarEn(nodos.aviso, t, ms);

let seccion = 'inspecciones';     // la pestaña de la lista
let filtroObra = '';
let actual = null;                // registro abierto
let tipoActual = null;            // 'inspecciones' | 'vaciados'
let urls = [];
let temporizador = null;
let pendiente = false;
let destinoFoto = null;           // { punto } en una inspección, {} general

const urlDe = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
function liberar() { for (const u of urls) URL.revokeObjectURL(u); urls = []; }

function obraGuardada() { try { return localStorage.getItem(CLAVE_OBRA) || ''; } catch (e) { return ''; } }
function recordarObra(o) { try { if (o) localStorage.setItem(CLAVE_OBRA, o); } catch (e) { /* nada */ } }

/* ------------------------------------------------------------------ */
/* guardado                                                            */
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
  const r = actual;
  try {
    await (tipoActual === 'vaciados' ? guardarVaciado(r) : guardarInspeccion(r));
    if (r === actual) nodos.estado.textContent = `Guardado ${ahora()}`;
  } catch (e) {
    pendiente = true;
    nodos.estado.textContent = 'Sin guardar';
    avisar('No se ha podido guardar. ¿Queda espacio en el teléfono?', 5000);
  }
}

/* ------------------------------------------------------------------ */
/* rutas                                                               */
/* ------------------------------------------------------------------ */

async function enrutar() {
  await guardarYa();
  const h = location.hash;
  let m = h.match(/^#\/inspeccion\/([^/]+)$/);
  if (m) {
    const r = await leerInspeccion(decodeURIComponent(m[1]));
    if (r) return abrir('inspecciones', normalizarInspeccion(r));
  }
  m = h.match(/^#\/vaciado\/([^/]+)(?:\/probeta\/([^/]+))?$/);
  if (m) {
    const r = await leerVaciado(decodeURIComponent(m[1]));
    if (r) return abrir('vaciados', normalizarVaciado(r), m[2] && decodeURIComponent(m[2]));
  }
  seccion = /^#\/vaciado/.test(h) ? 'vaciados' : 'inspecciones';
  if (!/^#\/(inspecciones|vaciados)$/.test(h)) history.replaceState(null, '', `#/${seccion}`);
  return mostrarLista();
}

function normalizarInspeccion(r) {
  return { puntos: [], fotos: [], observaciones: '', resultado: '', firma: null, ...r };
}
function normalizarVaciado(r) {
  return { camiones: [], probetas: [], fotos: [], unidad: 'kg/cm²', metodo: 'bomba', ...r };
}

/* ------------------------------------------------------------------ */
/* lista                                                               */
/* ------------------------------------------------------------------ */

async function obrasConocidas() {
  const nombres = new Map();
  const poner = (n) => { const t = (n || '').trim(); if (t && !nombres.has(t.toLowerCase())) nombres.set(t.toLowerCase(), t); };
  const [visitas, repasos, ins, vac] = await Promise.all([listarVisitas(), listarRepasos(), listarInspecciones(), listarVaciados()]);
  for (const r of [...ins, ...vac, ...visitas, ...repasos]) poner(r.obra);
  for (const o of equipo.obras || []) poner(o.nombre);
  return [...nombres.values()];
}

async function mostrarLista() {
  actual = null;
  tipoActual = null;
  liberar();
  nodos.ficha.hidden = true;
  nodos.lista.hidden = false;
  nodos.nuevo.hidden = false;
  nodos.nuevo.textContent = seccion === 'vaciados' ? '+ Vaciado' : '+ Inspección';
  document.querySelector('.titulo-seccion').textContent = seccion === 'vaciados' ? 'Vaciados' : 'Inspecciones';
  for (const s of ['inspecciones', 'vaciados']) {
    const p = $(`pestana-${s}`);
    p.classList.toggle('activa', s === seccion);
    p.setAttribute('aria-selected', s === seccion ? 'true' : 'false');
  }
  const todos = seccion === 'vaciados' ? (await listarVaciados()).map(normalizarVaciado) : (await listarInspecciones()).map(normalizarInspeccion);
  resumenCalidad().catch(() => {});

  // Filtro por obra cuando hay más de una.
  const obras = [...new Map(todos.filter((r) => r.obra).map((r) => [r.obra.trim().toLowerCase(), r.obra.trim()])).values()];
  if (filtroObra && !obras.some((o) => mismaObra(o, filtroObra))) filtroObra = '';
  nodos.filtro.hidden = obras.length < 2;
  nodos.filtro.replaceChildren(...['', ...obras].map((o) => el('button', {
    type: 'button', class: `chip${mismaObra(o, filtroObra) ? ' activo' : ''}`,
    onclick: () => { filtroObra = o; mostrarLista(); }
  }, o || 'Todas')));
  const visibles = todos.filter((r) => !filtroObra || mismaObra(r.obra, filtroObra));

  pintarAgenda(seccion === 'vaciados' ? visibles : []);
  nodos.tarjetas.replaceChildren(...visibles.map((r) => (seccion === 'vaciados' ? tarjetaVaciado(r) : tarjetaInspeccion(r))));
  nodos.vacia.hidden = visibles.length > 0;
  nodos.vacia.replaceChildren(...(seccion === 'vaciados'
    ? ['Todavía no hay vaciados. Pulsa ', el('strong', {}, '+ Vaciado'), ' el día que se hormigona: conduces, revenimiento y probetas, con aviso el día de cada rotura.']
    : ['Todavía no hay inspecciones. Pulsa ', el('strong', {}, '+ Inspección'), ' y elige la partida (acero, encofrado, instalaciones, impermeabilización…): cada punto se marca Cumple / No cumple y se libera con firma.']));
}

function etiquetaResultado(r) {
  if (!r.resultado) return el('span', { class: 'etiqueta atencion' }, 'En curso');
  const clase = r.resultado === 'rechazada' ? 'gravedad-grave' : r.resultado === 'condicionada' ? 'atencion' : 'ok';
  return el('span', { class: `etiqueta ${clase}` }, RESULTADOS[r.resultado]);
}

function tarjetaInspeccion(r) {
  const c = cuentaPuntos(r);
  const p = PLANTILLAS[r.plantilla] || PLANTILLAS.libre;
  return el('a', { class: 'tarjeta', href: `#/inspeccion/${encodeURIComponent(r.id)}` },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('IN', r.numero)} · ${fechaLarga(r.fecha)} `, etiquetaResultado(r)),
    el('div', { class: 'tarjeta-obra' }, `${p.icono} ${r.titulo || p.nombre}`),
    el('div', { class: 'tarjeta-texto' }, [r.obra, r.zona, r.contratista].filter(Boolean).join(' · ') || 'Sin zona'),
    el('div', { class: 'tarjeta-datos' },
      el('span', {}, `${c.total - c.pendientes}/${c.total} revisados`),
      c.no ? el('span', { class: 'tarjeta-alerta' }, `${c.no} no cumple${c.no === 1 ? '' : 'n'}`) : null,
      r.firma || r.firmaRemota ? el('span', {}, '✍ firmada') : null,
      r.fotos.length ? el('span', {}, `📷 ${r.fotos.length}`) : null));
}

function tarjetaVaciado(v) {
  const ev = evaluacion(v);
  const ult = ev.at(-1);
  const pendientes = v.probetas.filter((p) => estadoProbeta(v, p) !== 'rota');
  const vencidas = pendientes.filter((p) => estadoProbeta(v, p) === 'vencida').length;
  return el('a', { class: 'tarjeta', href: `#/vaciado/${encodeURIComponent(v.id)}` },
    el('div', { class: 'tarjeta-fecha' }, `${codigo('VH', v.numero)} · ${fechaLarga(v.fecha)}`),
    el('div', { class: 'tarjeta-obra' }, `🧱 ${v.elemento || 'Elemento sin nombre'}`),
    el('div', { class: 'tarjeta-texto' }, [v.obra, v.zona, v.fc && `f'c ${v.fc} ${v.unidad}`].filter(Boolean).join(' · ')),
    el('div', { class: 'tarjeta-datos' },
      el('span', {}, `${fmt(volumenReal(v))} m³${v.volumenPrevisto ? ` / ${v.volumenPrevisto} previstos` : ''}`),
      el('span', {}, plural(v.camiones.length, 'camión', 'camiones')),
      pendientes.length ? el('span', { class: vencidas ? 'tarjeta-alerta' : '' }, `${plural(pendientes.length, 'probeta', 'probetas')} por romper${vencidas ? ` · ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''}`) : null,
      ult ? el('span', { class: ult.bien === false ? 'tarjeta-alerta' : '' }, `${ult.dias} d: ${ult.pct != null ? `${Math.round(ult.pct * 100)} % f'c` : fmt(ult.promedio)}`) : null));
}

const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toLocaleString('es-DO', { maximumFractionDigits: d }));

function pintarAgenda(vaciados) {
  const agenda = agendaRoturas(vaciados, hoy(), 7);
  nodos.agenda.hidden = !agenda.length;
  if (!agenda.length) return nodos.agenda.replaceChildren();
  const nombre = { vencida: 'Vencida', hoy: 'Hoy', pendiente: '' };
  nodos.agenda.replaceChildren(
    el('h2', {}, 'Roturas de probetas'),
    el('div', { class: 'agenda-lista' }, ...agenda.map(({ vaciado: v, probeta: p, fecha, estado }) => el('a', {
      class: `agenda-item ${estado}`, href: `#/vaciado/${encodeURIComponent(v.id)}/probeta/${encodeURIComponent(p.id)}`
    },
      el('span', { class: 'agenda-fecha' }, nombre[estado] || fechaCorta(fecha)),
      el('span', { class: 'agenda-texto' }, el('strong', {}, `${p.codigo || 'Probeta'} · ${p.dias} días`), el('span', { class: 'pie' }, `${v.elemento || 'Vaciado'} · ${v.obra || ''}`))))),
    el('p', { class: 'pie' }, 'Toca una para anotar el resultado del laboratorio.'));
}

const fechaCorta = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

/* ------------------------------------------------------------------ */
/* crear                                                               */
/* ------------------------------------------------------------------ */

async function nuevo() {
  const obras = await obrasConocidas();
  const obraInicial = filtroObra || obraGuardada() || obras[0] || '';
  const campoObra = el('input', { class: 'campo', 'data-campo': 'obra', value: obraInicial, placeholder: 'Nombre o código de la obra', list: 'obras-conocidas' });
  nodos.obras.replaceChildren(...obras.map((o) => el('option', { value: o })));

  const crear = async (plantilla) => {
    const obra = campoObra.value.trim();
    if (!obra) { campoObra.focus(); return avisar('Escribe la obra.', 2500); }
    recordarObra(obra);
    nodos.dialogo.close();
    const visitas = await listarVisitas();
    const ultimaVisita = visitas.find((v) => mismaObra(v.obra, obra)) || visitas[0];
    const autor = ultimaVisita ? ultimaVisita.autor || '' : '';
    if (seccion === 'vaciados') {
      const r = nuevoVaciado({ obra, autor, numero: numeroDe(await listarVaciados(), obra) });
      // Hereda del último vaciado de la obra lo que no suele cambiar.
      const previo = (await listarVaciados()).find((x) => mismaObra(x.obra, obra));
      if (previo) Object.assign(r, { fc: previo.fc, unidad: previo.unidad, revenimiento: previo.revenimiento, proveedor: previo.proveedor, metodo: previo.metodo });
      await guardarVaciado(r);
      location.hash = `#/vaciado/${r.id}`;
    } else {
      const r = nuevaInspeccion({ obra, plantilla, inspector: autor, numero: numeroDe(await listarInspecciones(), obra) });
      await guardarInspeccion(r);
      location.hash = `#/inspeccion/${r.id}`;
    }
  };

  const cerrar = el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => nodos.dialogo.close() }, '✕');
  nodos.dialogo.replaceChildren(
    el('div', { class: 'dialogo-cabecera' }, el('h2', {}, seccion === 'vaciados' ? 'Nuevo vaciado' : 'Nueva inspección'), cerrar),
    el('div', { class: 'dialogo-cuerpo' },
      el('label', { class: 'etiqueta-campo' }, 'Obra', campoObra),
      seccion === 'vaciados'
        ? el('div', { class: 'fila-botones' }, el('button', { type: 'button', class: 'boton boton-destacado', onclick: () => crear() }, 'Crear el vaciado'))
        : [el('p', { class: 'pie' }, 'Elige la partida. Los puntos son una guía: luego puedes añadir o quitar.'),
          el('div', { class: 'plantillas' }, ...Object.entries(PLANTILLAS).map(([k, p]) => el('button', {
            type: 'button', class: 'plantilla', onclick: () => crear(k)
          }, el('span', { class: 'plantilla-icono' }, p.icono), el('span', {}, el('strong', {}, p.nombre),
            el('span', { class: 'pie' }, p.puntos.length ? plural(p.puntos.length, 'punto', 'puntos') : 'Tú pones los puntos')))))]));
  nodos.dialogo.showModal();
}

/* ------------------------------------------------------------------ */
/* ficha común                                                         */
/* ------------------------------------------------------------------ */

function abrir(tipo, r, probetaId) {
  liberar();
  actual = r;
  tipoActual = tipo;
  nodos.lista.hidden = true;
  nodos.ficha.hidden = false;
  nodos.nuevo.hidden = true;
  nodos.volver.href = tipo === 'vaciados' ? '#/vaciados' : '#/inspecciones';
  nodos.volver.textContent = tipo === 'vaciados' ? '← Vaciados' : '← Inspecciones';
  document.querySelector('.titulo-seccion').textContent = tipo === 'vaciados' ? codigo('VH', r.numero) : codigo('IN', r.numero);
  nodos.estado.textContent = '';
  pintarFicha();
  scrollTo(0, 0);
  if (probetaId) {
    const fila = nodos.form.querySelector(`[data-probeta="${CSS.escape(probetaId)}"]`);
    if (fila) {
      fila.scrollIntoView({ block: 'center' });
      fila.classList.add('resaltada');
      const entrada = fila.querySelector('input[data-valor]');
      if (entrada) setTimeout(() => entrada.focus({ preventScroll: true }), 300);
    }
  }
}

function pintarFicha() {
  const y = scrollY;
  liberar();
  nodos.form.replaceChildren(...(tipoActual === 'vaciados' ? fichaVaciado(actual) : fichaInspeccion(actual)));
  scrollTo(0, y);
}

/* Campo de texto enlazado a una propiedad del registro. */
function campo(obj, clave, { tipo = 'text', etiqueta, placeholder = '', modo, alCambiar, alSalir, lista, datos } = {}) {
  const atributos = { class: 'campo', type: tipo, value: obj[clave] ?? '', placeholder, inputmode: modo, list: lista };
  if (datos) atributos['data-campo'] = datos;
  const entrada = el('input', atributos);
  entrada.addEventListener('input', () => {
    obj[clave] = entrada.value;
    cambiado();
    if (alCambiar) alCambiar(entrada.value);
  });
  // Lo que obliga a repintar la ficha espera a que se deje el campo.
  if (alSalir) entrada.addEventListener('change', () => alSalir(entrada.value));
  return etiqueta ? el('label', {}, etiqueta, entrada) : entrada;
}

function area(obj, clave, { etiqueta, placeholder = '', filas = 3 } = {}) {
  const t = el('textarea', { class: 'campo', rows: filas, placeholder, 'data-campo': clave === 'observaciones' ? 'observaciones' : undefined });
  t.value = obj[clave] || '';
  t.addEventListener('input', () => { obj[clave] = t.value; cambiado(); });
  return etiqueta ? el('label', {}, etiqueta, t) : t;
}

function chips(opciones, valor, alElegir, { vacio = false } = {}) {
  return el('div', { class: 'chips', role: 'radiogroup' }, ...Object.entries(opciones).map(([k, t]) => el('button', {
    type: 'button', class: `chip${valor === k ? ' activo' : ''}`, role: 'radio', 'aria-checked': valor === k ? 'true' : 'false',
    onclick: () => alElegir(vacio && valor === k ? '' : k)
  }, t)));
}

function seccionFotos(r, { titulo = 'Fotos', filtro = (f) => !f.punto } = {}) {
  const fotos = r.fotos.filter(filtro);
  const remotas = (r.fotosRemotas || []).filter(filtro);
  return el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, titulo), el('span', { class: 'pie' }, fotos.length ? plural(fotos.length, 'foto', 'fotos') : '')),
    el('div', { class: 'fotos' }, ...fotos.map((f) => miniatura(r, f)), ...remotas.map(fotoRemota)),
    el('div', { class: 'fila-botones' },
      el('button', { type: 'button', class: 'boton', onclick: () => pedirFoto({}, 'camara') }, 'Hacer foto'),
      el('button', { type: 'button', class: 'boton', onclick: () => pedirFoto({}, 'galeria') }, 'De la galería')));
}

function miniatura(r, f) {
  const u = urlDe(f.blob);
  return el('figure', { class: 'foto' },
    el('img', { src: u, alt: '', onclick: () => ampliar(u) }),
    el('button', {
      type: 'button', class: 'boton quitar', 'aria-label': 'Quitar foto',
      onclick: () => { if (!confirm('¿Quitar esta foto?')) return; r.fotos = r.fotos.filter((x) => x !== f); cambiado(); pintarFicha(); }
    }, '✕'),
    f.pie != null || !f.punto ? (() => {
      const pie = el('input', { class: 'campo', value: f.pie || '', placeholder: 'Pie de foto' });
      pie.addEventListener('input', () => { f.pie = pie.value; cambiado(); });
      return pie;
    })() : null);
}

function fotoRemota(f) {
  return f.enlace
    ? el('a', { class: 'foto-remota', href: f.enlace, target: '_blank', rel: 'noopener noreferrer' }, el('span', { class: 'foto-remota-icono' }, '📷'), 'Ver foto en la nube')
    : el('span', { class: 'foto-remota' }, el('span', { class: 'foto-remota-icono' }, '📷'), 'Foto en el teléfono de su autor');
}

function ampliar(u) {
  nodos.fotoGrande.querySelector('img').src = u;
  nodos.fotoGrande.hidden = false;
}
nodos.fotoGrande.addEventListener('click', () => { nodos.fotoGrande.hidden = true; });

function pedirFoto(destino, origen) {
  destinoFoto = destino;
  (origen === 'camara' ? nodos.camara : nodos.galeria).click();
}

async function anadirFotos(archivos) {
  const r = actual, destino = destinoFoto;
  destinoFoto = null;
  if (!r || !destino || !archivos.length) return;
  avisar(archivos.length > 1 ? `Guardando ${archivos.length} fotos…` : 'Guardando foto…');
  for (const archivo of archivos) {
    try {
      const { blob } = await reducirImagen(archivo, LADO_FOTO, CALIDAD_FOTO);
      if (blob) r.fotos.push({ id: nuevoId(), blob, fecha: hoy(), hora: ahora(), pie: '', ...(destino.punto ? { punto: destino.punto } : {}) });
    } catch (e) {
      avisar(`No se ha podido leer ${archivo.name || 'la imagen'}.`, 4000);
    }
  }
  if (r !== actual) return guardarRegistro(r);
  cambiado();
  pintarFicha();
}
const guardarRegistro = (r) => (r.camiones ? guardarVaciado(r) : guardarInspeccion(r));
for (const entrada of [nodos.camara, nodos.galeria]) {
  entrada.addEventListener('change', () => {
    const archivos = [...entrada.files];
    entrada.value = '';
    anadirFotos(archivos);
  });
}

/* ------------------------------------------------------------------ */
/* inspección                                                          */
/* ------------------------------------------------------------------ */

function fichaInspeccion(r) {
  const c = cuentaPuntos(r);
  const sugerido = resultadoSugerido(r);
  const p = PLANTILLAS[r.plantilla] || PLANTILLAS.libre;
  const fotosDe = (punto) => r.fotos.filter((f) => f.punto === punto.id);
  const remotasDe = (punto) => (r.fotosRemotas || []).filter((f) => f.punto === punto.id);

  const filaPunto = (punto, i) => {
    const nota = el('input', { class: 'campo', value: punto.nota || '', placeholder: punto.valor === 'no' ? 'Qué falla y dónde' : 'Nota (opcional)' });
    nota.addEventListener('input', () => { punto.nota = nota.value; cambiado(); });
    const texto = punto.propio
      ? (() => { const t = el('input', { class: 'campo punto-texto-propio', value: punto.texto, placeholder: 'Qué se revisa' }); t.addEventListener('input', () => { punto.texto = t.value; cambiado(); }); return t; })()
      : el('span', { class: 'punto-texto' }, punto.texto);
    return el('div', { class: `punto ${punto.valor || 'sin-revisar'}`, 'data-punto': punto.id },
      el('div', { class: 'punto-cabecera' },
        el('span', { class: 'punto-n' }, String(i + 1)),
        texto,
        el('button', {
          type: 'button', class: 'boton quitar', 'aria-label': 'Quitar este punto',
          onclick: () => { if (!confirm('¿Quitar este punto del checklist?')) return; r.puntos = r.puntos.filter((x) => x !== punto); r.fotos = r.fotos.filter((f) => f.punto !== punto.id); cambiado(); pintarFicha(); }
        }, '✕')),
      el('div', { class: 'punto-valores', role: 'radiogroup', 'aria-label': punto.texto },
        ...Object.entries(VALORES).map(([k, t]) => el('button', {
          type: 'button', class: `valor valor-${k}${punto.valor === k ? ' activo' : ''}`, role: 'radio', 'aria-checked': punto.valor === k ? 'true' : 'false',
          onclick: () => { punto.valor = punto.valor === k ? '' : k; cambiado(); pintarFicha(); }
        }, { si: '✓ ', no: '✗ ', na: '' }[k] + t)),
        el('button', { type: 'button', class: 'boton valor-foto', title: 'Foto de este punto', 'aria-label': 'Foto de este punto', onclick: () => pedirFoto({ punto: punto.id }, 'camara') }, '📷')),
      (punto.valor === 'no' || punto.nota || fotosDe(punto).length || remotasDe(punto).length) ? el('div', { class: 'punto-detalle' },
        nota,
        fotosDe(punto).length || remotasDe(punto).length
          ? el('div', { class: 'fotos fotos-punto' }, ...fotosDe(punto).map((f) => miniatura(r, f)), ...remotasDe(punto).map(fotoRemota)) : null,
        punto.repaso ? el('p', { class: 'pie' }, '→ Pasado al punch list') : null) : null);
  };

  const enRepasos = r.puntos.filter((x) => x.valor === 'no' && !x.repaso);

  return [
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, `${p.icono} ${codigo('IN', r.numero)}`), etiquetaResultado(r)),
      campo(r, 'titulo', { etiqueta: 'Inspección', placeholder: 'Qué se inspecciona' }),
      campo(r, 'obra', { etiqueta: 'Obra', datos: 'obra', alCambiar: recordarObra }),
      campo(r, 'zona', { etiqueta: 'Zona o elemento', placeholder: 'Nivel, ejes, elemento (p. ej. Losa N3 ejes A–D / 1–4)' }),
      el('div', { class: 'dos' },
        campo(r, 'fecha', { etiqueta: 'Fecha', tipo: 'date' }),
        campo(r, 'hora', { etiqueta: 'Hora', tipo: 'time' })),
      el('div', { class: 'dos' },
        campo(r, 'contratista', { etiqueta: 'Contratista o responsable', placeholder: 'Empresa / maestro' }),
        campo(r, 'inspector', { etiqueta: 'Inspeccionado por', datos: 'autor', placeholder: 'Nombre y cargo' }))),

    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' },
        el('h2', {}, 'Checklist'),
        el('span', { class: 'pie' }, `${c.total - c.pendientes}/${c.total} revisados${c.no ? ` · ${c.no} no cumple${c.no === 1 ? '' : 'n'}` : ''}`)),
      el('div', { class: 'progreso', 'aria-hidden': 'true' },
        el('span', { class: 'progreso-si', style: `width:${c.total ? (c.si / c.total) * 100 : 0}%` }),
        el('span', { class: 'progreso-no', style: `width:${c.total ? (c.no / c.total) * 100 : 0}%` }),
        el('span', { class: 'progreso-na', style: `width:${c.total ? (c.na / c.total) * 100 : 0}%` })),
      el('div', { class: 'puntos' }, ...r.puntos.map(filaPunto)),
      el('div', { class: 'fila-botones' },
        el('button', {
          type: 'button', class: 'boton', onclick: () => {
            r.puntos.push({ id: nuevoId(), texto: '', valor: '', nota: '', propio: true });
            cambiado(); pintarFicha();
            const ultimo = nodos.form.querySelectorAll('.punto-texto-propio');
            ultimo[ultimo.length - 1]?.focus();
          }
        }, '+ Añadir punto'),
        c.pendientes > 0 && c.total > 0 ? el('button', {
          type: 'button', class: 'enlace', onclick: () => {
            for (const x of r.puntos) if (!x.valor) x.valor = 'si';
            cambiado(); pintarFicha();
          }
        }, 'Marcar el resto como «Cumple»') : null),
      enRepasos.length ? el('div', { class: 'aviso-repasos' },
        el('p', {}, `${plural(enRepasos.length, 'punto no cumple', 'puntos no cumplen')}. Pásalos al punch list para que el responsable los corrija y se sigan en las visitas.`),
        el('button', { type: 'button', class: 'boton boton-destacado', onclick: (ev) => pasarARepasos(r, ev.target) }, `Pasar ${enRepasos.length} al punch list`)) : null),

    seccionFotos(r, { titulo: 'Fotos generales' }),

    el('section', { class: 'grupo' },
      el('h2', {}, 'Observaciones'),
      area(r, 'observaciones', { placeholder: 'Condiciones, instrucciones dadas, próxima revisión…', filas: 3 })),

    el('section', { class: 'grupo' },
      el('h2', {}, 'Resultado'),
      chips(RESULTADOS, r.resultado, (k) => { r.resultado = k; cambiado(); pintarFicha(); }, { vacio: true }),
      sugerido && sugerido !== r.resultado ? el('p', { class: 'pie' },
        `Según el checklist: «${RESULTADOS[sugerido]}». `,
        el('button', { type: 'button', class: 'enlace', onclick: () => { r.resultado = sugerido; cambiado(); pintarFicha(); } }, 'Usar')) : null,
      c.pendientes && r.resultado ? el('p', { class: 'pie aviso-texto' }, `Quedan ${plural(c.pendientes, 'punto', 'puntos')} sin revisar.`) : null),

    seccionFirma(r, { titulo: 'Firma de liberación', quien: 'inspector' }),

    el('section', { class: 'grupo acciones-ficha' },
      el('button', { type: 'button', class: 'boton boton-destacado grande', onclick: () => actaInspeccion(r) }, 'Acta en PDF'),
      el('button', { type: 'button', class: 'boton boton-peligro grande', onclick: () => borrar(r) }, 'Borrar esta inspección'))
  ];
}

/* Los «No cumple» pasan a repasos de la obra, con la foto del punto como
   «antes» y el contratista como responsable. */
async function pasarARepasos(r, boton) {
  boton.disabled = true;
  const todos = await listarRepasos();
  let n = todos.filter((x) => mismaObra(x.obra, r.obra)).reduce((m, x) => Math.max(m, x.numero || 0), 0);
  const categoria = (PLANTILLAS[r.plantilla] || PLANTILLAS.libre).categoria;
  let hechos = 0;
  for (const punto of r.puntos.filter((x) => x.valor === 'no' && !x.repaso)) {
    const repaso = {
      id: nuevoId(),
      obra: r.obra,
      ...(r.obraId ? { obraId: r.obraId } : {}),
      visita: null,
      inspeccion: r.id,
      numero: ++n,
      zona: r.zona || '',
      categoria,
      texto: `[${codigo('IN', r.numero)}] ${punto.texto}${punto.nota ? ` — ${punto.nota}` : ''}`,
      responsable: r.contratista || '',
      prioridad: 'alta',
      fotos: r.fotos.filter((f) => f.punto === punto.id).map((f) => ({ id: nuevoId(), blob: f.blob, fecha: r.fecha, hora: f.hora, fase: 'antes' })),
      desde: r.fecha,
      corregido: null,
      cerrado: null,
      creado: Date.now(),
      modificado: Date.now()
    };
    await guardarRepaso(repaso);
    punto.repaso = repaso.id;
    hechos++;
  }
  cambiado();
  pintarFicha();
  avisar(`${plural(hechos, 'repaso creado', 'repasos creados')} en el punch list de ${r.obra}.`, 4000);
}

/* ------------------------------------------------------------------ */
/* firma (inspección)                                                  */
/* ------------------------------------------------------------------ */

function leerMiFirma() { try { return localStorage.getItem('crd-mi-firma'); } catch (e) { return null; } }

function seccionFirma(r, { titulo }) {
  const lienzo = el('canvas', { class: 'firma' });
  const caja = el('div', { class: 'firma-caja bloqueada' }, lienzo);
  const ctx = lienzo.getContext('2d');
  let bloqueada = true, trazando = false, hubo = Boolean(r.firma);
  const ayuda = el('p', { class: 'pie' });
  const firmar = el('button', { type: 'button', class: 'boton boton-destacado firma-firmar' });
  const listo = el('button', { type: 'button', class: 'boton boton-destacado' }, 'Listo, bloquear la firma');
  const borrarB = el('button', { type: 'button', class: 'enlace boton-peligro-texto' }, 'Borrar firma');
  const mia = el('button', { type: 'button', class: 'boton' }, '⭐ Usar mi firma');
  caja.append(firmar);

  function estado() {
    caja.classList.toggle('bloqueada', bloqueada);
    caja.classList.toggle('con-firma', hubo);
    firmar.hidden = !bloqueada;
    firmar.textContent = hubo ? '✍ Volver a firmar' : '✍ Firmar';
    listo.hidden = bloqueada;
    borrarB.hidden = !hubo;
    mia.hidden = !leerMiFirma();
    ayuda.textContent = bloqueada
      ? (hubo ? `Firmada${r.firmadaEn ? ` el ${new Date(r.firmadaEn).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.` : 'Bloqueada para evitar trazos por error. Pulsa «Firmar».')
      : 'Firma con el dedo y pulsa «Listo».';
  }

  function preparar() {
    const b = lienzo.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    lienzo.width = Math.max(1, Math.round(b.width * dpr));
    lienzo.height = Math.max(1, Math.round(b.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(ctx, { lineWidth: 2.2, lineCap: 'round', lineJoin: 'round', strokeStyle: '#111' });
  }

  async function cargar() {
    preparar();
    if (!r.firma) return;
    try {
      const img = await decodificar(r.firma);
      const b = lienzo.getBoundingClientRect();
      const k = Math.min(b.width / img.width, b.height / img.height);
      ctx.drawImage(img, (b.width - img.width * k) / 2, (b.height - img.height * k) / 2, img.width * k, img.height * k);
    } catch (e) { /* firma ilegible: se deja en blanco */ }
  }

  const punto = (ev) => { const b = lienzo.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
  lienzo.addEventListener('pointerdown', (ev) => {
    if (bloqueada) return;
    trazando = true;
    lienzo.setPointerCapture(ev.pointerId);
    ctx.beginPath();
    ctx.moveTo(...punto(ev));
    ev.preventDefault();
  });
  lienzo.addEventListener('pointermove', (ev) => { if (!trazando) return; ctx.lineTo(...punto(ev)); ctx.stroke(); hubo = true; });
  const terminar = () => {
    if (!trazando) return;
    trazando = false;
    if (!hubo) return;
    lienzo.toBlob((blob) => { r.firma = blob; r.firmaRemota = null; r.firmadaEn = Date.now(); r.firmadaPor = r.firmadaPor || r.inspector || ''; cambiado(); }, 'image/png');
    estado();
  };
  lienzo.addEventListener('pointerup', terminar);
  lienzo.addEventListener('pointercancel', terminar);

  firmar.addEventListener('click', () => {
    if (hubo) {
      if (!confirm('¿Borrar la firma actual y volver a firmar?')) return;
      r.firma = null; hubo = false; preparar(); cambiado();
    }
    bloqueada = false; estado();
  });
  listo.addEventListener('click', () => {
    bloqueada = true; estado();
    if (hubo && !r.resultado) avisar('Firmada. Falta marcar el resultado: liberada, con observaciones o rechazada.', 4500);
  });
  borrarB.addEventListener('click', () => {
    if (!confirm('¿Borrar la firma?')) return;
    r.firma = null; r.firmadaEn = null; hubo = false; preparar(); cambiado(); estado();
  });
  mia.addEventListener('click', async () => {
    const datos = leerMiFirma();
    if (!datos) return;
    if (hubo && !confirm('¿Cambiar la firma actual por la tuya guardada?')) return;
    r.firma = await (await fetch(datos)).blob();
    r.firmadaEn = Date.now();
    r.firmadaPor = r.firmadaPor || r.inspector || '';
    hubo = true;
    cambiado();
    await cargar();
    estado();
  });

  requestAnimationFrame(() => { cargar(); estado(); });
  estado();
  const firmante = campo(r, 'firmadaPor', { etiqueta: 'Firma', placeholder: 'Nombre y cargo de quien libera' });
  return el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, titulo), borrarB),
    caja,
    el('div', { class: 'fila-botones' }, listo, mia),
    ayuda,
    r.firmaRemota && !r.firma ? el('p', { class: 'pie firma-remota' }, r.firmaRemota.enlace
      ? el('a', { href: r.firmaRemota.enlace, target: '_blank', rel: 'noopener noreferrer' }, 'Ver la firma en la nube')
      : 'La firma está en el teléfono de quien la hizo.') : null,
    firmante);
}

/* ------------------------------------------------------------------ */
/* vaciado                                                             */
/* ------------------------------------------------------------------ */

function fichaVaciado(v) {
  const evalNodo = el('div', { class: 'evaluacion' });
  const pintarEval = () => evalNodo.replaceChildren(...nodosEvaluacion(v));
  pintarEval();

  const filaCamion = (c, i) => {
    const fuera = () => revenimientoFuera(v, c);
    const slump = el('input', { class: 'campo', value: c.slump ?? '', inputmode: 'decimal', placeholder: 'pulg' });
    const marca = () => slump.classList.toggle('fuera', fuera());
    marca();
    slump.addEventListener('input', () => { c.slump = slump.value; marca(); cambiado(); });
    const m3 = el('input', { class: 'campo', value: c.m3 ?? '', inputmode: 'decimal', placeholder: 'm³' });
    m3.addEventListener('input', () => { c.m3 = m3.value; cambiado(); pintarTotales(); });
    const conduce = el('input', { class: 'campo', value: c.conduce || '', placeholder: 'Nº conduce' });
    conduce.addEventListener('input', () => { c.conduce = conduce.value; cambiado(); });
    const hora = el('input', { class: 'campo', type: 'time', value: c.hora || '' });
    hora.addEventListener('input', () => { c.hora = hora.value; cambiado(); });
    return el('div', { class: 'camion' },
      el('span', { class: 'camion-n' }, String(i + 1)),
      el('label', {}, 'Conduce', conduce),
      el('label', {}, 'm³', m3),
      el('label', {}, 'Hora', hora),
      el('label', {}, 'Rev.', slump),
      el('button', {
        type: 'button', class: 'boton quitar', 'aria-label': 'Quitar camión',
        onclick: () => { if (!confirm('¿Quitar este camión?')) return; v.camiones = v.camiones.filter((x) => x !== c); cambiado(); pintarFicha(); }
      }, '✕'));
  };

  const totales = el('p', { class: 'pie' });
  const pintarTotales = () => {
    const r = volumenReal(v), p = numero(v.volumenPrevisto);
    totales.textContent = `Total: ${fmt(r, 2)} m³${p ? ` de ${fmt(p, 2)} previstos (${Math.round((r / p) * 100)} %)` : ''}`;
  };
  pintarTotales();

  const filaProbeta = (p) => {
    const estado = estadoProbeta(v, p);
    const valor = el('input', { class: 'campo', value: p.valor ?? '', inputmode: 'decimal', placeholder: v.unidad, 'data-valor': '1' });
    const pct = el('span', { class: 'probeta-pct' });
    const pintarPct = () => {
      const x = numero(p.valor), fc = numero(v.fc);
      pct.textContent = x != null && fc ? `${Math.round((x / fc) * 100)} %` : '';
    };
    pintarPct();
    valor.addEventListener('input', () => { p.valor = valor.value; if (numero(valor.value) != null && !p.rotaEl) p.rotaEl = hoy(); cambiado(); pintarPct(); pintarEval(); });
    const cod = el('input', { class: 'campo', value: p.codigo || '', placeholder: 'Código' });
    cod.addEventListener('input', () => { p.codigo = cod.value; cambiado(); });
    const edad = el('select', { class: 'campo' }, ...[3, 7, 14, 28, 56].map((d) => el('option', { value: d, selected: Number(p.dias) === d }, `${d} d`)));
    edad.addEventListener('change', () => { p.dias = Number(edad.value); cambiado(); pintarFicha(); });
    const nombres = { rota: '', hoy: 'Romper hoy', vencida: 'Vencida', pendiente: '' };
    return el('div', { class: `probeta ${estado}`, 'data-probeta': p.id },
      cod, edad,
      el('span', { class: 'probeta-fecha' }, fechaCorta(fechaRotura(v, p)), nombres[estado] ? el('span', { class: `etiqueta ${estado === 'vencida' ? 'gravedad-grave' : 'atencion'}` }, nombres[estado]) : null),
      valor, pct,
      el('button', {
        type: 'button', class: 'boton quitar', 'aria-label': 'Quitar probeta',
        onclick: () => { if (!confirm('¿Quitar esta probeta?')) return; v.probetas = v.probetas.filter((x) => x !== p); cambiado(); pintarFicha(); }
      }, '✕'));
  };

  const juego = () => {
    const n = new Set(v.probetas.map((p) => (p.codigo || '').split('-')[1])).size + 1;
    const base = `${codigo('VH', v.numero)}-${n}`;
    for (const [dias, letra] of [[7, 'A'], [28, 'B'], [28, 'C']]) v.probetas.push({ id: nuevoId(), codigo: `${base}${letra}`, dias, valor: '' });
    cambiado(); pintarFicha();
  };

  const inspeccionesObra = [];
  listarInspecciones().then((lista) => {
    for (const i of lista.filter((x) => mismaObra(x.obra, v.obra))) inspeccionesObra.push(i);
    selectInsp.replaceChildren(el('option', { value: '' }, '— Ninguna —'),
      ...inspeccionesObra.map((i) => el('option', { value: i.id, selected: i.id === v.inspeccion },
        `${codigo('IN', i.numero)} · ${i.titulo}${i.zona ? ` · ${i.zona}` : ''}${i.resultado ? ` (${RESULTADOS[i.resultado]})` : ''}`)));
  });
  const selectInsp = el('select', { class: 'campo' }, el('option', { value: '' }, '— Ninguna —'));
  selectInsp.addEventListener('change', () => { v.inspeccion = selectInsp.value; cambiado(); });

  return [
    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, `🧱 ${codigo('VH', v.numero)}`), el('span', { class: 'pie' }, fechaLarga(v.fecha))),
      campo(v, 'elemento', { etiqueta: 'Elemento', placeholder: 'Losa, vigas, columnas, zapatas…' }),
      campo(v, 'zona', { etiqueta: 'Nivel y ejes', placeholder: 'p. ej. Nivel 3, ejes A–D / 1–4' }),
      campo(v, 'obra', { etiqueta: 'Obra', datos: 'obra', alCambiar: recordarObra }),
      el('div', { class: 'dos' },
        campo(v, 'fecha', { etiqueta: 'Fecha', tipo: 'date', alSalir: () => pintarFicha() }),
        campo(v, 'hora', { etiqueta: 'Hora de inicio', tipo: 'time' })),
      el('div', { class: 'tres' },
        campo(v, 'fc', { etiqueta: "f'c", modo: 'decimal', placeholder: '210', alSalir: () => pintarFicha() }),
        el('label', {}, 'Unidad', (() => {
          const s = el('select', { class: 'campo' }, ...UNIDADES.map((u) => el('option', { value: u, selected: v.unidad === u }, u)));
          s.addEventListener('change', () => { v.unidad = s.value; cambiado(); pintarFicha(); });
          return s;
        })()),
        campo(v, 'revenimiento', { etiqueta: 'Revenimiento (pulg)', modo: 'decimal', placeholder: '4' })),
      el('div', { class: 'dos' },
        campo(v, 'volumenPrevisto', { etiqueta: 'Volumen previsto (m³)', modo: 'decimal', alCambiar: pintarTotales }),
        campo(v, 'proveedor', { etiqueta: 'Planta / suplidor', placeholder: 'Hormigonera' })),
      el('label', {}, 'Colocación'),
      chips(METODOS, v.metodo, (k) => { v.metodo = k; cambiado(); pintarFicha(); }),
      el('label', {}, 'Liberación previa', selectInsp),
      campo(v, 'autor', { etiqueta: 'Registrado por', datos: 'autor', placeholder: 'Nombre y cargo' })),

    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Camiones'), el('span', { class: 'pie' }, plural(v.camiones.length, 'camión', 'camiones'))),
      el('div', { class: 'camiones' }, ...v.camiones.map(filaCamion)),
      totales,
      v.camiones.some((c) => revenimientoFuera(v, c)) ? el('p', { class: 'pie aviso-texto' }, `Hay revenimientos fuera de ${v.revenimiento}" ± 1". Anota en observaciones si se rechazó o se ajustó el camión.`) : null,
      el('div', { class: 'fila-botones' },
        el('button', {
          type: 'button', class: 'boton boton-destacado', onclick: () => {
            const ultimo = v.camiones.at(-1);
            v.camiones.push({ id: nuevoId(), conduce: '', m3: ultimo ? ultimo.m3 : '', hora: ahora(), slump: '' });
            cambiado(); pintarFicha();
            const conduces = nodos.form.querySelectorAll('.camion input');
            conduces[conduces.length - 4]?.focus();
          }
        }, '+ Camión'))),

    el('section', { class: 'grupo' },
      el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Probetas'), el('span', { class: 'pie' }, plural(v.probetas.length, 'probeta', 'probetas'))),
      v.probetas.length ? el('div', { class: 'probeta probeta-cabecera', 'aria-hidden': 'true' },
        el('span', {}, 'Código'), el('span', {}, 'Edad'), el('span', {}, 'Rotura'), el('span', {}, `Resultado (${v.unidad})`), el('span', {}, '% f\'c'), el('span', {})) : null,
      el('div', { class: 'probetas' }, ...v.probetas.map(filaProbeta)),
      el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'boton boton-destacado', onclick: juego }, '+ Juego (7 · 28 · 28 días)'),
        el('button', {
          type: 'button', class: 'boton', onclick: () => {
            v.probetas.push({ id: nuevoId(), codigo: `${codigo('VH', v.numero)}-${v.probetas.length + 1}`, dias: 28, valor: '' });
            cambiado(); pintarFicha();
          }
        }, '+ Probeta')),
      evalNodo,
      el('p', { class: 'pie' }, 'El día de cada rotura sale un aviso en el inicio y en el menú. Referencia: a 7 días ≈ 65 % de f\'c y a 28 días el promedio debe llegar a f\'c; el criterio de aceptación es el del proyecto.')),

    seccionFotos(v),

    el('section', { class: 'grupo' },
      el('h2', {}, 'Curado y observaciones'),
      area(v, 'curado', { placeholder: 'Método y duración del curado (agua, membrana, mantas)…', filas: 2 }),
      area(v, 'observaciones', { placeholder: 'Juntas, incidencias, camiones rechazados, clima…', filas: 3 })),

    el('section', { class: 'grupo acciones-ficha' },
      el('button', { type: 'button', class: 'boton boton-destacado grande', onclick: () => registroVaciado(v) }, 'Registro en PDF'),
      el('button', { type: 'button', class: 'boton boton-peligro grande', onclick: () => borrar(v) }, 'Borrar este vaciado'))
  ];
}

function nodosEvaluacion(v) {
  const ev = evaluacion(v);
  if (!ev.length) return [];
  return [el('table', { class: 'tabla-evaluacion' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Edad'), el('th', {}, 'Nº'), el('th', {}, 'Promedio'), el('th', {}, '% f\'c'), el('th', {}, ''))),
    el('tbody', {}, ...ev.map((e) => el('tr', {},
      el('td', {}, `${e.dias} d`), el('td', {}, String(e.n)), el('td', {}, `${fmt(e.promedio)} ${v.unidad}`),
      el('td', {}, e.pct != null ? `${Math.round(e.pct * 100)} %` : '—'),
      el('td', {}, e.bien == null ? '' : el('span', { class: `etiqueta ${e.bien ? 'ok' : 'gravedad-grave'}` },
        e.dias >= 28 ? (e.bien ? 'Cumple' : 'No llega') : (e.bien ? 'Va bien' : 'Bajo'))))))) ];
}

/* ------------------------------------------------------------------ */
/* borrar                                                              */
/* ------------------------------------------------------------------ */

async function borrar(r) {
  const nombre = tipoActual === 'vaciados' ? 'este vaciado' : 'esta inspección';
  if (!confirm(`¿Borrar ${nombre} con sus fotos? No se puede deshacer.`)) return;
  pendiente = false;
  clearTimeout(temporizador);
  const tipo = tipoActual;
  actual = null;
  await (tipo === 'vaciados' ? borrarVaciado(r.id) : borrarInspeccion(r.id));
  location.hash = tipo === 'vaciados' ? '#/vaciados' : '#/inspecciones';
}

/* ------------------------------------------------------------------ */
/* PDF: acta de inspección y registro de vaciado                       */
/* ------------------------------------------------------------------ */

let seccionN = 0;
function logotipo() {
  const marca = el('span', { class: 'marca', 'aria-label': 'COORDINATE' });
  marca.innerHTML = 'C<svg viewBox="10 10 44 44" aria-hidden="true">'
    + '<g fill="currentColor"><circle cx="32.00" cy="14.67" r="4.53"/><circle cx="44.25" cy="19.75" r="4.53"/><circle cx="49.33" cy="32.00" r="4.53"/><circle cx="44.25" cy="44.25" r="4.53"/><circle cx="32.00" cy="49.33" r="4.53"/><circle cx="19.75" cy="44.25" r="4.53"/><circle cx="14.67" cy="32.00" r="4.53"/><circle cx="19.75" cy="19.75" r="4.53"/></g>'
    + '<circle cx="32" cy="32" r="6" fill="#62a0e8"/></svg>ORDINATE';
  return marca;
}
function titulo(texto, extra) {
  seccionN += 1;
  return el('h2', { class: 'informe-h2' },
    el('span', { class: 'informe-h2-n' }, String(seccionN).padStart(2, '0')),
    el('span', {}, texto),
    extra ? el('span', { class: 'informe-h2-extra' }, extra) : null);
}
/* La firma va como fondo de su recuadro y no como <img>: Chrome a veces
   manda una imagen sola a la página siguiente y parte el bloque de firmas. */
const firmaImpresa = (u) => el('div', { class: 'informe-hueco', role: u ? 'img' : null, 'aria-label': u ? 'Firma' : null,
  style: u ? `background: url("${u}") left bottom / contain no-repeat` : null });
const dato = (t, valor) => el('div', { class: 'informe-dato' }, el('span', {}, t), el('strong', {}, valor || '—'));
const cifra = (n, t, clase = '') => el('div', { class: `informe-cifra ${clase}` }, el('strong', {}, String(n)), el('span', {}, t));

function cabecera(tipoDoc, numeroDoc, h1, obra) {
  return [
    el('div', { class: 'informe-banda' }, logotipo(),
      el('div', { class: 'informe-banda-doc' }, el('span', { class: 'informe-tipo' }, tipoDoc), el('strong', {}, numeroDoc))),
    el('header', { class: 'informe-cabecera' },
      el('div', {}, el('h1', {}, h1), el('p', { class: 'informe-obra' }, obra || 'Obra sin nombre')),
      el('div', { class: 'informe-sello' }, el('span', {}, 'Emitido'),
        el('strong', {}, new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })), el('span', {}, ahora())))
  ];
}
const pie = () => el('footer', { class: 'informe-pie' }, el('span', {}, LEMA), el('span', {}, CONTACTO));

async function imprimirDoc(nombre, nodosDoc, pieTexto) {
  await guardarYa();
  nodos.informe.dataset.pie = pieTexto;
  nodos.informe.replaceChildren(...el('div', {}, ...nodosDoc).childNodes);
  await Promise.all([...nodos.informe.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  // …y las firmas, que van como fondo.
  await Promise.all([...nodos.informe.querySelectorAll('.informe-hueco[style]')].map((n) => {
    const m = n.style.backgroundImage.match(/url\("?(.*?)"?\)/);
    if (!m) return null;
    const img = new Image();
    img.src = m[1];
    return img.decode().catch(() => {});
  }));
  const antes = document.title;
  document.title = nombre;
  addEventListener('afterprint', () => { document.title = antes; }, { once: true });
  window.print();
}

function actaInspeccion(r) {
  seccionN = 0;
  const c = cuentaPuntos(r);
  const fotosDe = (punto) => r.fotos.filter((f) => f.punto === punto.id);
  const generales = r.fotos.filter((f) => !f.punto);
  const numeroDoc = `${codigo('IN', r.numero)}-${(r.fecha || '').replaceAll('-', '')}`;
  imprimirDoc(`Acta ${codigo('IN', r.numero)} ${r.obra} ${r.fecha}`, [
    ...cabecera('Acta de inspección y liberación', numeroDoc, r.titulo || 'Inspección', r.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', `${fechaLarga(r.fecha)}${r.hora ? ` · ${r.hora}` : ''}`),
      dato('Zona o elemento', r.zona),
      dato('Contratista', r.contratista),
      dato('Inspeccionado por', r.inspector),
      dato('Resultado', RESULTADOS[r.resultado] || 'En curso'),
      dato('Puntos revisados', `${c.total - c.pendientes} de ${c.total}`)),
    el('div', { class: 'informe-cifras' },
      cifra(c.si, 'cumplen'), cifra(c.no, 'no cumplen', c.no ? 'alerta' : ''), cifra(c.na, 'no aplican'), cifra(c.pendientes, 'sin revisar', c.pendientes ? 'aviso' : '')),
    el('section', {},
      titulo('Checklist'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Punto revisado'), el('th', {}, 'Estado'), el('th', {}, 'Observación'))),
        el('tbody', {}, ...r.puntos.map((p, i) => el('tr', {},
          el('td', { class: 'num' }, String(i + 1)),
          el('td', {}, p.texto || '—'),
          el('td', {}, el('span', { class: `informe-estado ${p.valor || 'pendiente'}` }, VALORES[p.valor] || 'Sin revisar')),
          el('td', {}, [p.nota, fotosDe(p).length && `📷 ${fotosDe(p).length}`, p.repaso && '→ punch list'].filter(Boolean).join(' · ') || '')))))),
    r.observaciones?.trim() ? el('section', {}, titulo('Observaciones'), el('p', { class: 'parrafo' }, r.observaciones.trim())) : null,
    r.fotos.length ? el('section', {},
      titulo('Fotos', plural(r.fotos.length, 'foto', 'fotos')),
      el('div', { class: 'informe-fotos' }, ...[...r.puntos.flatMap((p) => fotosDe(p).map((f) => [f, `Punto ${r.puntos.indexOf(p) + 1}: ${p.texto}`])), ...generales.map((f) => [f, f.pie || ''])]
        .map(([f, texto]) => el('figure', {}, el('img', { src: urlDe(f.blob), alt: '' }), texto ? el('figcaption', {}, texto) : null)))) : null,
    el('section', { class: 'informe-firma' },
      titulo('Liberación'),
      el('div', { class: 'informe-firmas' },
        el('div', { class: 'informe-firma-caja' }, firmaImpresa(r.firma ? urlDe(r.firma) : null),
          el('strong', {}, r.firmadaPor || r.inspector || 'Nombre y cargo'), el('span', {}, `Inspección · ${RESULTADOS[r.resultado] || 'sin resultado'}`)),
        el('div', { class: 'informe-firma-caja' }, el('div', { class: 'informe-hueco' }),
          el('strong', {}, r.contratista || 'Nombre y cargo'), el('span', {}, 'Contratista · enterado')))),
    pie()
  ], `COORDINATE · Acta de inspección ${codigo('IN', r.numero)}`);
}

function registroVaciado(v) {
  seccionN = 0;
  const ev = evaluacion(v);
  const real = volumenReal(v);
  const numeroDoc = `${codigo('VH', v.numero)}-${(v.fecha || '').replaceAll('-', '')}`;
  imprimirDoc(`Vaciado ${codigo('VH', v.numero)} ${v.obra} ${v.fecha}`, [
    ...cabecera('Registro de vaciado de hormigón', numeroDoc, v.elemento || 'Vaciado de hormigón', v.obra),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', `${fechaLarga(v.fecha)}${v.hora ? ` · ${v.hora}` : ''}`),
      dato('Nivel y ejes', v.zona),
      dato("Resistencia f'c", v.fc ? `${v.fc} ${v.unidad}` : ''),
      dato('Revenimiento especificado', v.revenimiento ? `${v.revenimiento}"` : ''),
      dato('Planta / suplidor', v.proveedor),
      dato('Colocación', METODOS[v.metodo])),
    el('div', { class: 'informe-cifras' },
      cifra(fmt(real, 2), `m³ colocados${v.volumenPrevisto ? ` de ${v.volumenPrevisto}` : ''}`),
      cifra(v.camiones.length, 'camiones'),
      cifra(v.camiones.filter((c) => revenimientoFuera(v, c)).length, 'revenimientos fuera', v.camiones.some((c) => revenimientoFuera(v, c)) ? 'aviso' : ''),
      cifra(v.probetas.length, 'probetas')),
    v.camiones.length ? el('section', {},
      titulo('Camiones', `${fmt(real, 2)} m³`),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Conduce'), el('th', {}, 'Hora'), el('th', { class: 'num' }, 'm³'), el('th', { class: 'num' }, 'Revenimiento'))),
        el('tbody', {}, ...v.camiones.map((c, i) => el('tr', {},
          el('td', { class: 'num' }, String(i + 1)), el('td', {}, c.conduce || '—'), el('td', { class: 'informe-hora' }, c.hora || '—'),
          el('td', { class: 'num' }, c.m3 || '—'), el('td', { class: 'num' }, c.slump ? `${c.slump}"${revenimientoFuera(v, c) ? ' ⚠' : ''}` : '—')))))) : null,
    v.probetas.length ? el('section', {},
      titulo('Probetas'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Código'), el('th', { class: 'num' }, 'Edad'), el('th', {}, 'Fecha de rotura'), el('th', { class: 'num' }, `Resultado (${v.unidad})`), el('th', { class: 'num' }, "% f'c"))),
        el('tbody', {}, ...v.probetas.map((p) => {
          const x = numero(p.valor), fc = numero(v.fc);
          return el('tr', {}, el('td', {}, p.codigo || '—'), el('td', { class: 'num' }, `${p.dias} d`), el('td', {}, fechaRotura(v, p)),
            el('td', { class: 'num' }, x != null ? fmt(x) : 'Pendiente'), el('td', { class: 'num' }, x != null && fc ? `${Math.round((x / fc) * 100)} %` : '—'));
        }))),
      ev.length ? el('table', { class: 'informe-tabla informe-evaluacion' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Edad'), el('th', { class: 'num' }, 'Nº'), el('th', { class: 'num' }, 'Promedio'), el('th', { class: 'num' }, "% f'c"), el('th', {}, 'Valoración'))),
        el('tbody', {}, ...ev.map((e) => el('tr', {}, el('td', {}, `${e.dias} días`), el('td', { class: 'num' }, String(e.n)),
          el('td', { class: 'num' }, `${fmt(e.promedio)} ${v.unidad}`), el('td', { class: 'num' }, e.pct != null ? `${Math.round(e.pct * 100)} %` : '—'),
          el('td', {}, e.bien == null ? '—' : e.dias >= 28 ? (e.bien ? 'Cumple f\'c' : 'No alcanza f\'c') : (e.bien ? 'Dentro de lo esperado' : 'Por debajo de lo esperado')))))) : null) : null,
    (v.curado?.trim() || v.observaciones?.trim()) ? el('section', {},
      titulo('Curado y observaciones'),
      el('div', { class: 'informe-dos' },
        el('div', {}, el('h3', {}, 'Curado'), el('p', { class: 'parrafo' }, v.curado?.trim() || '—')),
        el('div', {}, el('h3', {}, 'Observaciones'), el('p', { class: 'parrafo' }, v.observaciones?.trim() || '—')))) : null,
    v.fotos.length ? el('section', {},
      titulo('Fotos', plural(v.fotos.length, 'foto', 'fotos')),
      el('div', { class: 'informe-fotos' }, ...v.fotos.map((f) => el('figure', {}, el('img', { src: urlDe(f.blob), alt: '' }), f.pie ? el('figcaption', {}, f.pie) : null)))) : null,
    el('section', { class: 'informe-firma' },
      titulo('Conformidad'),
      el('div', { class: 'informe-firmas' },
        el('div', { class: 'informe-firma-caja' }, el('div', { class: 'informe-hueco' }), el('strong', {}, v.autor || 'Nombre y cargo'), el('span', {}, 'Supervisión')),
        el('div', { class: 'informe-firma-caja' }, el('div', { class: 'informe-hueco' }), el('strong', {}, v.proveedor || 'Nombre y cargo'), el('span', {}, 'Contratista / suplidor')))),
    pie()
  ], `COORDINATE · Registro de vaciado ${codigo('VH', v.numero)}`);
}

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

nodos.nuevo.addEventListener('click', nuevo);
addEventListener('hashchange', enrutar);
addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });
addEventListener('pagehide', guardarYa);

// Cambios que llegan del equipo: se repinta la lista, o la ficha si no hay
// nada propio sin guardar.
addEventListener('crd-remoto', async (ev) => {
  const ids = new Set(ev.detail.ids);
  if (!actual) return mostrarLista();
  if (ids.has(actual.id) && !pendiente) {
    const fresco = tipoActual === 'vaciados' ? await leerVaciado(actual.id) : await leerInspeccion(actual.id);
    if (fresco) { actual = tipoActual === 'vaciados' ? normalizarVaciado(fresco) : normalizarInspeccion(fresco); pintarFicha(); }
  }
});

if (equipo.activo) equipo.iniciar().catch(() => {});
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

enrutar();
