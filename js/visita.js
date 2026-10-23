/* Visita diaria de obra: lista de partes, ficha de cada visita, planos
   con notas y fotos, punch list de repasos, informe para imprimir en PDF,
   informe interactivo y copia de seguridad. Todo se queda en el teléfono y se guarda según se
   escribe. */

import {
  listarVisitas, leerVisita, guardarVisita, borrarVisita,
  listarPlanos, leerPlano, guardarPlano, borrarPlano,
  listarRepasos, leerRepaso, guardarRepaso,
  listarInspecciones, leerInspeccion, guardarInspeccion, listarVaciados, leerVaciado, guardarVaciado
} from './partes.js';
import { avisar } from './interfaz.js';
import {
  el, nuevoId, dos, hoy, ahora, fechaLarga, plural, decodificar, reducirImagen,
  aDatos, deDatos, descargar, enlaceSeguro, mismaObra
} from './utiles.js';
import { leerArchivoPlano, crearVisorPlano, componerPlano, TIPOS_NOTA } from './planos.js';
import { generarInformeInteractivo } from './informe-interactivo.js';
import {
  crearPunchList, estadoEn, fotosEn, cuentaEstados, historial, CATEGORIAS, ESTADOS
} from './repasos.js';
import { crearNube } from './nube.js';
import { avisoPendiente, vinculadas } from './cuentas.js';
import * as novedades from './novedades.js';
import { equipo, planosRemotos } from './equipo.js';
import { iniciarEquipoUI } from './equipo-ui.js';
import { crearMisRepasos } from './mis-repasos.js';
import { climaActual, permisoUbicacion } from './clima.js';
import { resumenCalidad } from './calidad-datos.js';

const $ = (id) => document.getElementById(id);

const CLIMAS = ['Soleado', 'Nublado', 'Lluvia', 'Viento', 'Niebla', 'Helada', 'Calor'];
const JORNADAS = ['Normal', 'Parcial', 'Sin actividad'];
const GRAVEDADES = { leve: 'Leve', media: 'Media', grave: 'Grave' };
const CONTACTO = 'hola@coordinate.do · coordinate.do · Santo Domingo, RD';
const LEMA = 'Los problemas se resuelven en el modelo, no en obra.';
const LADO_FOTO = 1600;       // lado mayor de las fotos guardadas, en píxeles
const CALIDAD_FOTO = 0.8;

const nodos = {
  vistaLista: $('vista-lista'),
  vistaFicha: $('vista-ficha'),
  nueva: $('btn-nueva'),
  buscar: $('buscar'),
  lista: $('lista'),
  listaVacia: $('lista-vacia'),
  exportar: $('btn-exportar'),
  importar: $('btn-importar'),
  entradaCopia: $('entrada-copia'),
  ficha: $('ficha'),
  estadoGuardado: $('estado-guardado'),
  climas: $('climas'),
  jornadas: $('jornadas'),
  personal: $('personal'),
  totalPersonal: $('total-personal'),
  botonPersonal: $('btn-personal'),
  incidencias: $('incidencias'),
  totalIncidencias: $('total-incidencias'),
  botonIncidencia: $('btn-incidencia'),
  fotos: $('fotos'),
  totalFotos: $('total-fotos'),
  camara: $('btn-camara'),
  galeria: $('btn-galeria'),
  entradaCamara: $('entrada-camara'),
  entradaGaleria: $('entrada-galeria'),
  firma: $('firma'),
  borrarFirma: $('btn-borrar-firma'),
  firmaCaja: $('firma-caja'),
  firmar: $('btn-firmar'),
  firmaListo: $('btn-firma-listo'),
  firmaAyuda: $('firma-ayuda'),
  firmaAdjuntar: $('btn-firma-adjuntar'),
  firmaMia: $('btn-firma-mia'),
  firmaGuardar: $('btn-firma-guardar'),
  entradaFirma: $('entrada-firma'),
  informe: $('informe'),
  botonInforme: $('btn-informe'),
  compartir: $('btn-compartir'),
  borrar: $('btn-borrar'),
  planos: $('planos'),
  totalPlanos: $('total-planos'),
  botonPlano: $('btn-plano'),
  entradaPlano: $('entrada-plano'),
  otrosPlanos: $('btn-otros-planos'),
  botonInteractivo: $('btn-interactivo'),
  cuentas: $('cuentas'),
  correo: $('btn-correo'),
  nube: $('btn-nube'),
  copiaNube: $('btn-copia-nube'),
  repasos: $('repasos'),
  totalRepasos: $('total-repasos'),
  filtrosRepasos: $('filtros-repasos'),
  repaso: $('btn-repaso'),
  repasoFoto: $('btn-repaso-foto'),
  punchPdf: $('btn-punch-pdf'),
  entradaRepasoCamara: $('entrada-repaso-camara'),
  entradaRepasoGaleria: $('entrada-repaso-galeria'),
  avisoLectura: $('aviso-lectura'),
  fotoGrande: $('foto-grande'),
  aviso: $('aviso'),
  botonClima: $('btn-clima')
};

let actual = null;        // la visita abierta en la ficha
let pendiente = false;    // hay cambios sin escribir en IndexedDB
let temporizador = null;
let urlsFicha = [];       // object URLs de las miniaturas, para liberarlas
let todas = [];           // visitas de la lista, para el buscador
let urlsPlanos = [];      // miniaturas de los planos en la ficha
let verTodosPlanos = false;

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

/* Visitas guardadas antes de que existieran los planos no traen notas
   ni dibujos. */
function normalizar(v) {
  if (!Array.isArray(v.notas)) v.notas = [];
  if (!Array.isArray(v.trazos)) v.trazos = [];
  if (!Array.isArray(v.medidas)) v.medidas = [];
  if (!Array.isArray(v.fotosRemotas)) v.fotosRemotas = [];
  for (const f of v.fotos) if (f.nota === undefined) f.nota = null;
  return v;
}

function totalPersonas(v) {
  return v.personal.reduce((s, p) => s + (Number(p.numero) || 0), 0);
}

const abiertas = (v) => v.incidencias.filter((i) => i.estado !== 'cerrada');

/* ------------------------------------------------------------------ */
/* rutas: #/v/<id> abre una visita, #/v/<id>/plano/<id> uno de sus      */
/* planos (así el botón atrás del teléfono cierra el plano); el resto,  */
/* la lista                                                            */
/* ------------------------------------------------------------------ */

let notaAlAbrir = null;   // nota que enfocar al abrir el plano

const rutaVisita = (v) => `#/v/${encodeURIComponent(v.id)}`;
const rutaPlano = (v, planoId) => `${rutaVisita(v)}/plano/${encodeURIComponent(planoId)}`;

async function enrutar() {
  await guardarYa();
  const m = location.hash.match(/^#\/v\/([^/]+)(?:\/plano\/([^/]+))?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const planoId = m[2] && decodeURIComponent(m[2]);
    if (!actual || actual.id !== id) {
      visor.cerrar();
      const v = await leerVisita(id);
      if (!v) {
        history.replaceState(null, '', location.pathname);
        return mostrarLista();
      }
      abrirFicha(normalizar(v));
    }
    if (planoId) {
      const plano = await leerPlano(planoId);
      if (plano) {
        const nota = notaAlAbrir;
        notaAlAbrir = null;
        return visor.abrir(plano, nota);
      }
    }
    if (visor.abierto) {
      visor.cerrar();
      pintarPlanos();
      pintarFotos();
    }
    return;
  }
  // Vistas del menú: cuentas vinculadas, copia de seguridad y novedades.
  const vista = (location.hash.match(/^#\/(cuentas|copia|novedades)$/) || [])[1] || '';
  visor.cerrar();
  await mostrarLista(vista === 'novedades' ? '' : vista);
  if (vista === 'novedades') {
    history.replaceState(null, '', location.pathname);
    menuEquipo();
  }
}

let planoDesdeFicha = false;   // se llegó al plano desde la ficha: "volver" es ir atrás

function abrirPlano(planoId, notaId = null) {
  notaAlAbrir = notaId;
  planoDesdeFicha = true;
  location.hash = rutaPlano(actual, planoId);
}

function cerrarPlano() {
  if (planoDesdeFicha) history.back();
  else location.replace(rutaVisita(actual));
  planoDesdeFicha = false;
}

/* ------------------------------------------------------------------ */
/* lista                                                               */
/* ------------------------------------------------------------------ */

async function mostrarLista(vista = '') {
  actual = null;
  nodos.vistaLista.classList.toggle('modo-datos', Boolean(vista));
  $('grupo-cuentas').classList.toggle('activo', vista === 'cuentas');
  $('grupo-copia').classList.toggle('activo', vista === 'copia');
  if (vista) nodos.vistaLista.scrollTop = 0;
  pintarAvisosCalidad();
  liberarUrls();
  liberarUrlsPlanos();
  punch.liberar();
  misRepasos.pintar();
  nube.pintarCuentas(nodos.cuentas);
  nodos.vistaFicha.hidden = true;
  nodos.vistaLista.hidden = false;
  nodos.nueva.hidden = false;
  try {
    todas = await listarVisitas();
  } catch (e) {
    todas = [];
    avisar(nodos.aviso, 'No se pueden leer las visitas guardadas en este navegador.', 5000);
  }
  pintarLista();
}

/* Avisos de calidad en el inicio: probetas por romper y protocolos de
   inspección sin cerrar (js/calidad.js). */
async function pintarAvisosCalidad() {
  const caja = $('avisos-calidad');
  let r;
  try { r = await resumenCalidad(); } catch (e) { return; }
  const avisos = [];
  const tarjeta = (href, icono, titulo, texto, urgente) => el('a', { class: `aviso-calidad${urgente ? ' urgente' : ''}`, href },
    el('span', {}, icono), el('span', {}, el('strong', {}, titulo), el('p', { class: 'pie' }, texto)));
  if (r.hoy || r.vencidas) {
    avisos.push(tarjeta('./calidad.html#/vaciados', '🧱',
      [r.hoy && `${plural(r.hoy, 'probeta', 'probetas')} para romper hoy`, r.vencidas && `${r.vencidas} vencida${r.vencidas === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      'Anota el resultado del laboratorio en el vaciado.', r.vencidas > 0));
  }
  if (r.bajas) avisos.push(tarjeta('./calidad.html#/vaciados', '⚠️', `${plural(r.bajas, 'vaciado', 'vaciados')} por debajo de f'c a 28 días`, 'Revisa los resultados con el calculista.', true));
  if (r.abiertas) avisos.push(tarjeta('./calidad.html#/inspecciones', '✅', `${plural(r.abiertas, 'inspección abierta', 'inspecciones abiertas')}`, 'Falta el resultado o la firma de liberación.', false));
  caja.replaceChildren(...avisos);
  caja.hidden = !avisos.length;
}

function coincide(v, texto) {
  if (!texto) return true;
  const pajar = [
    v.fecha, v.obra, v.autor, v.trabajos, v.maquinaria, v.materiales, v.observaciones,
    ...v.personal.map((p) => `${p.empresa} ${p.oficio}`),
    ...v.incidencias.map((i) => i.texto),
    ...v.fotos.map((f) => f.pie),
    ...(v.notas || []).map((n) => [
      n.texto,
      ...(n.pinturas || []).map((t) => `${t.marca} ${t.nombre} ${t.acabado}`),
      ...(n.enlaces || []).map((e) => `${e.titulo} ${e.url}`)
    ].join(' '))
  ].join(' ').toLowerCase();
  return texto.toLowerCase().split(/\s+/).every((t) => pajar.includes(t));
}

function pintarLista() {
  const texto = nodos.buscar.value.trim();
  const visibles = todas.filter((v) => coincide(v, texto));
  nodos.lista.replaceChildren(...visibles.map(tarjeta));
  nodos.listaVacia.hidden = todas.length > 0;
  if (todas.length && !visibles.length) {
    nodos.lista.append(el('p', { class: 'vacio' }, 'Ninguna visita coincide con la búsqueda.'));
  }
}

const miUid = () => (equipo.usuario ? equipo.usuario.uid : null);

function tarjeta(v) {
  const pendientes = abiertas(v).length;
  const graves = abiertas(v).some((i) => i.gravedad === 'grave');
  const nov = miUid() && novedades.deVisita(miUid(), v.id);
  return el('a', { class: `tarjeta${nov ? ' con-novedad' : ''}`, href: `#/v/${encodeURIComponent(v.id)}` },
    el('div', { class: 'tarjeta-fecha' }, fechaLarga(v.fecha), v.hora ? ` · ${v.hora}` : '',
      nov && el('span', { class: `etiqueta ${nov.nuevo ? 'ok' : 'atencion'}` }, nov.nuevo ? 'Nueva' : 'Actualizada'),
      nov && nov.quien && el('span', { class: 'pie' }, ` de ${nov.quien}`)),
    el('div', { class: 'tarjeta-obra' }, v.obra || 'Obra sin nombre'),
    v.trabajos && el('div', { class: 'tarjeta-texto' }, v.trabajos),
    el('div', { class: 'tarjeta-datos' },
      el('span', {}, plural(totalPersonas(v), 'persona', 'personas')),
      pendientes > 0 && el('span', { class: graves ? 'pendientes grave' : 'pendientes' },
        plural(pendientes, 'incidencia abierta', 'incidencias abiertas')),
      v.fotos.length > 0 && el('span', {}, plural(v.fotos.length, 'foto', 'fotos')),
      (v.notas || []).length > 0 && el('span', {}, plural(v.notas.length, 'nota en plano', 'notas en plano')),
      v.clima.length > 0 && el('span', {}, v.clima.join(', ')),
      v.obraId && el('span', { class: 'compartida', title: 'Obra compartida con tu equipo' }, '☁ Compartida')
    )
  );
}

/* Una visita nueva arranca con la obra, el autor y el personal de la
   anterior, y arrastra las incidencias que quedaron sin resolver. */
async function nuevaVisita() {
  const anterior = (await listarVisitas())[0];
  const v = {
    id: nuevoId(),
    fecha: hoy(),
    hora: ahora(),
    obra: anterior ? anterior.obra : '',
    obraId: anterior ? anterior.obraId || null : null,
    autor: anterior ? anterior.autor : '',
    clima: [],
    temperatura: '',
    jornada: 'Normal',
    personal: anterior
      ? anterior.personal.map((p) => ({ ...p, id: nuevoId() }))
      : [{ id: nuevoId(), empresa: '', oficio: '', numero: '' }],
    trabajos: '',
    maquinaria: '',
    materiales: '',
    incidencias: anterior ? abiertas(anterior).map((i) => ({ ...i, desde: i.desde || anterior.fecha })) : [],
    fotos: [],
    notas: [],
    trazos: [],
    medidas: [],
    observaciones: '',
    firma: null,
    creada: Date.now(),
    modificada: Date.now()
  };
  await guardarVisita(v);
  location.hash = rutaVisita(v);
}

/* ------------------------------------------------------------------ */
/* ficha                                                               */
/* ------------------------------------------------------------------ */

function abrirFicha(v, { recarga = false } = {}) {
  actual = v;
  if (miUid()) novedades.quitar(miUid(), v.id);
  nodos.vistaLista.hidden = true;
  nodos.vistaFicha.hidden = false;
  nodos.nueva.hidden = true;
  for (const campo of nodos.ficha.querySelectorAll('[data-campo]')) {
    campo.value = v[campo.dataset.campo] || '';
  }
  pintarClima();
  pintarPersonal();
  pintarIncidencias();
  punch.reiniciar();
  pintarFotos();
  verTodosPlanos = false;
  pintarPlanos();
  firma.cargar(v.firma);
  const firmaRemota = document.getElementById('firma-remota');
  firmaRemota.hidden = !(!v.firma && v.firmaRemota);
  firmaRemota.replaceChildren(...(v.firmaRemota && !v.firma
    ? ['Firmada en otro teléfono. ', v.firmaRemota.enlace
      ? el('a', { href: v.firmaRemota.enlace, target: '_blank', rel: 'noopener noreferrer' }, 'Ver la firma en la nube')
      : 'La imagen está en el teléfono de quien firmó.']
    : []));
  nodos.avisoLectura.hidden = equipo.rolEn(v.obraId) !== 'lector';
  nodos.estadoGuardado.textContent = 'Guardado';
  if (!recarga) scrollTo(0, 0);
  if (!recarga && v.fecha === hoy() && !v.temperatura) tomarClima({ automatico: true });
}

/* --- tiempo del lugar (js/clima.js) --- */

let pidiendoClima = false;

async function tomarClima({ automatico = false } = {}) {
  if (pidiendoClima || !actual) return;
  if (automatico && (!navigator.onLine || (await permisoUbicacion()) === 'denied')) return;
  const visita = actual;
  pidiendoClima = true;
  nodos.botonClima.disabled = true;
  nodos.botonClima.textContent = 'Consultando…';
  try {
    const datos = await climaActual();
    if (actual !== visita) return;
    // Lo automático no pisa lo que el usuario ya escribió mientras tanto.
    if (automatico && visita.temperatura) return;
    visita.temperatura = datos.temperatura;
    const campo = nodos.ficha.querySelector('[data-campo="temperatura"]');
    if (campo) campo.value = datos.temperatura;
    if (datos.clima.length && (!automatico || visita.clima.length === 0)) visita.clima = datos.clima;
    pintarClima();
    cambiado();
    avisar(nodos.aviso, `Tiempo del lugar: ${[datos.clima.join(', '), datos.temperatura].filter(Boolean).join(' · ')}`);
  } catch (e) {
    if (automatico) return;
    const textos = {
      permiso: 'Permite la ubicación para tomar el tiempo (Ajustes de la app → Permisos).',
      'sin-senal': 'Sin señal no se puede consultar el tiempo.',
      ubicacion: 'No se ha podido saber dónde estás. Activa la ubicación del teléfono.'
    };
    avisar(nodos.aviso, textos[e.message] || 'No se ha podido consultar el tiempo.', 5000);
  } finally {
    pidiendoClima = false;
    nodos.botonClima.disabled = false;
    nodos.botonClima.textContent = '📍 Tomar del lugar';
  }
}

function cambiado() {
  pendiente = true;
  nodos.estadoGuardado.textContent = 'Guardando…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarYa, 500);
}

async function guardarYa() {
  clearTimeout(temporizador);
  await punch.guardarYa();
  if (!pendiente || !actual) return;
  pendiente = false;
  actual.modificada = Date.now();
  try {
    await guardarVisita(actual);
    nodos.estadoGuardado.textContent = `Guardado ${ahora()}`;
  } catch (e) {
    pendiente = true;
    nodos.estadoGuardado.textContent = 'Sin guardar';
    avisar(nodos.aviso, 'No se ha podido guardar. ¿Queda espacio en el teléfono?', 5000);
  }
}

function chip(texto, activo, alTocar) {
  return el('button', {
    type: 'button',
    class: activo ? 'chip activo' : 'chip',
    'aria-pressed': String(activo),
    onclick: alTocar
  }, texto);
}

function pintarClima() {
  nodos.climas.replaceChildren(...CLIMAS.map((c) => chip(c, actual.clima.includes(c), () => {
    actual.clima = actual.clima.includes(c)
      ? actual.clima.filter((x) => x !== c)
      : CLIMAS.filter((x) => x === c || actual.clima.includes(x));
    pintarClima();
    cambiado();
  })));
  nodos.jornadas.replaceChildren(
    el('span', { class: 'pie chips-etiqueta' }, 'Jornada:'),
    ...JORNADAS.map((j) => chip(j, actual.jornada === j, () => {
      actual.jornada = j;
      pintarClima();
      cambiado();
    }))
  );
}

/* --- personal --- */

function pintarPersonal() {
  nodos.personal.replaceChildren(...actual.personal.map((p) => {
    const editar = (clave) => (ev) => {
      p[clave] = ev.target.value;
      contarPersonal();
      cambiado();
    };
    return el('div', { class: 'fila-personal' },
      el('input', { class: 'campo', value: p.empresa, placeholder: 'Empresa', oninput: editar('empresa') }),
      el('input', { class: 'campo', value: p.oficio, placeholder: 'Oficio', oninput: editar('oficio') }),
      el('input', {
        class: 'campo numero', value: p.numero, type: 'number', min: '0', inputmode: 'numeric',
        placeholder: 'Nº', 'aria-label': 'Número de personas', oninput: editar('numero')
      }),
      el('button', {
        type: 'button', class: 'boton quitar', title: 'Quitar', 'aria-label': 'Quitar fila',
        onclick: () => {
          actual.personal = actual.personal.filter((x) => x !== p);
          pintarPersonal();
          cambiado();
        }
      }, '✕')
    );
  }));
  contarPersonal();
}

function contarPersonal() {
  nodos.totalPersonal.textContent = `Total: ${plural(totalPersonas(actual), 'persona', 'personas')}`;
}

/* --- incidencias --- */

/* «10:42», «Desde 2026-10-20 08:15», «… · resuelta 15:20». */
function horasIncidencia(i, fecha) {
  const alta = i.desde && i.desde !== fecha ? `Desde ${i.desde}${i.hora ? ` ${i.hora}` : ''}` : (i.hora ? `🕒 ${i.hora}` : '');
  const fin = i.estado === 'cerrada' && i.resuelta
    ? `resuelta ${i.resueltaFecha && i.resueltaFecha !== fecha ? `${i.resueltaFecha} ` : ''}${i.resuelta}` : '';
  return [alta, fin].filter(Boolean).join(' · ');
}

function pintarIncidencias() {
  nodos.incidencias.replaceChildren(...actual.incidencias.map((inc) => {
    const cerrada = inc.estado === 'cerrada';
    return el('div', { class: `incidencia ${inc.gravedad}${cerrada ? ' cerrada' : ''}` },
      el('textarea', {
        class: 'campo', rows: 2, value: inc.texto, placeholder: 'Qué pasa, dónde y quién debe resolverlo',
        oninput: (ev) => { inc.texto = ev.target.value; cambiado(); }
      }),
      el('div', { class: 'incidencia-pie' },
        el('select', {
          class: 'campo', 'aria-label': 'Gravedad',
          onchange: (ev) => { inc.gravedad = ev.target.value; pintarIncidencias(); cambiado(); }
        }, ...Object.entries(GRAVEDADES).map(([valor, texto]) =>
          el('option', { value: valor, selected: inc.gravedad === valor }, texto))),
        el('label', { class: 'casilla' },
          el('input', {
            type: 'checkbox', checked: cerrada,
            onchange: (ev) => {
              inc.estado = ev.target.checked ? 'cerrada' : 'abierta';
              if (ev.target.checked) { inc.resuelta = ahora(); inc.resueltaFecha = actual.fecha; } else { delete inc.resuelta; delete inc.resueltaFecha; }
              pintarIncidencias(); cambiado();
            }
          }),
          'Resuelta'),
        el('span', { class: 'pie' }, horasIncidencia(inc, actual.fecha)),
        el('button', {
          type: 'button', class: 'boton quitar', title: 'Quitar', 'aria-label': 'Quitar incidencia',
          onclick: () => {
            actual.incidencias = actual.incidencias.filter((x) => x !== inc);
            pintarIncidencias();
            cambiado();
          }
        }, '✕')
      )
    );
  }));
  const n = abiertas(actual).length;
  nodos.totalIncidencias.textContent = actual.incidencias.length
    ? plural(n, 'abierta', 'abiertas') : '';
}

/* --- fotos --- */

function liberarUrls() {
  for (const u of urlsFicha) URL.revokeObjectURL(u);
  urlsFicha = [];
}

function urlDe(blob) {
  const u = URL.createObjectURL(blob);
  urlsFicha.push(u);
  return u;
}

function pintarFotos() {
  liberarUrls();
  nodos.fotos.replaceChildren(...actual.fotos.map((f) => {
    const url = urlDe(f.blob);
    const nota = f.nota && actual.notas.find((n) => n.id === f.nota);
    return el('figure', { class: 'foto' },
      el('img', { src: url, alt: f.pie || 'Foto de obra', loading: 'lazy', onclick: () => ampliar(url) }),
      nota && el('button', {
        type: 'button', class: `foto-nota tipo-${nota.tipo}`, title: 'Ver en el plano',
        onclick: () => abrirPlano(nota.plano, nota.id)
      }, `Nota ${nota.numero}`),
      el('input', {
        class: 'campo', value: f.pie, placeholder: 'Pie de foto',
        oninput: (ev) => { f.pie = ev.target.value; cambiado(); }
      }),
      el('button', {
        type: 'button', class: 'boton quitar', title: 'Quitar foto', 'aria-label': 'Quitar foto',
        onclick: () => {
          if (!confirm('¿Quitar esta foto?')) return;
          actual.fotos = actual.fotos.filter((x) => x !== f);
          pintarFotos();
          cambiado();
        }
      }, '✕')
    );
  }));
  // Fotos de otra persona que no están en este teléfono (sin Storage):
  // se abren en su Drive u OneDrive.
  for (const f of actual.fotosRemotas || []) {
    nodos.fotos.append(f.enlace
      ? el('a', { class: 'foto foto-remota', href: f.enlace, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir en la nube' },
        el('span', { class: 'foto-remota-icono' }, '📷'), el('span', {}, f.pie || 'Ver foto en la nube'))
      : el('div', { class: 'foto foto-remota' },
        el('span', { class: 'foto-remota-icono' }, '📷'), el('span', {}, 'En el teléfono de quien la hizo')));
  }
  const totalFotos = actual.fotos.length + (actual.fotosRemotas || []).length;
  nodos.totalFotos.textContent = totalFotos ? String(totalFotos) : '';
}

function ampliar(url) {
  nodos.fotoGrande.querySelector('img').src = url;
  nodos.fotoGrande.hidden = false;
}

async function anadirFotos(archivos, notaId = null) {
  if (!actual || !archivos.length) return;
  const visita = actual;
  avisar(nodos.aviso, archivos.length > 1 ? `Guardando ${archivos.length} fotos…` : 'Guardando foto…');
  for (const archivo of archivos) {
    try {
      const { blob } = await reducirImagen(archivo, LADO_FOTO, CALIDAD_FOTO);
      if (blob) visita.fotos.push({ id: nuevoId(), blob, pie: '', hora: ahora(), nota: notaId });
    } catch (e) {
      avisar(nodos.aviso, `No se ha podido leer ${archivo.name || 'la imagen'}.`, 4000);
    }
  }
  if (actual === visita) {
    if (!visor.abierto) pintarFotos();
    pendiente = true;
    await guardarYa();
  } else {
    await guardarVisita(visita);
  }
}

/* --- planos --- */

function liberarUrlsPlanos() {
  for (const u of urlsPlanos) URL.revokeObjectURL(u);
  urlsPlanos = [];
}

/* Se muestran los planos de la obra de esta visita (y los que ya tengan
   notas suyas); el resto, a un toque, por si la obra cambió de nombre. */
async function pintarPlanos() {
  const visita = actual;
  let planos = [];
  try {
    planos = await listarPlanos();
  } catch (e) { /* sin planos */ }
  if (actual !== visita) return;
  liberarUrlsPlanos();
  const usado = (p) => visita.notas.some((n) => n.plano === p.id) || visita.trazos.some((t) => t.plano === p.id)
    || visita.medidas.some((m) => m.plano === p.id);
  const propios = planos.filter((p) => mismaObra(p.obra, visita.obra) || usado(p));
  const visibles = verTodosPlanos ? planos : propios;
  nodos.otrosPlanos.hidden = verTodosPlanos || planos.length === propios.length;
  nodos.otrosPlanos.textContent = `Ver planos de otras obras (${planos.length - propios.length})`;
  nodos.totalPlanos.textContent = visita.notas.length ? plural(visita.notas.length, 'nota', 'notas') : '';
  nodos.planos.replaceChildren(...visibles.map((p) => {
    const notas = visita.notas.filter((n) => n.plano === p.id);
    const dibujos = visita.trazos.filter((t) => t.plano === p.id).length;
    const medidas = visita.medidas.filter((m) => m.plano === p.id).length;
    const url = URL.createObjectURL(p.blob);
    urlsPlanos.push(url);
    return el('div', { class: 'plano-ficha' },
      el('button', { type: 'button', class: 'plano-abrir', onclick: () => abrirPlano(p.id) },
        el('img', { src: url, alt: '', loading: 'lazy' }),
        el('span', { class: 'plano-titulo' }, p.nombre),
        el('span', { class: 'pie' },
          [notas.length && plural(notas.length, 'nota', 'notas'), dibujos && plural(dibujos, 'trazo', 'trazos'),
            medidas && plural(medidas, 'medida', 'medidas'), p.mPorPx && `📏 ${p.escalaTexto || 'con escala'}`]
            .filter(Boolean).join(' · ') || 'Sin notas en esta visita',
          !mismaObra(p.obra, visita.obra) && p.obra ? ` · ${p.obra}` : '')
      ),
      el('button', {
        type: 'button', class: 'boton quitar', title: 'Quitar plano', 'aria-label': `Quitar ${p.nombre}`,
        onclick: () => quitarPlano(p)
      }, '✕')
    );
  }));
  // Planos de la obra que están en la nube de otra persona (sin Storage).
  for (const p of visita.obraId ? planosRemotos(visita.obraId) : []) {
    if (planos.some((x) => x.id === p.id)) continue;
    nodos.planos.append(el('div', { class: 'plano-ficha' },
      p.enlace
        ? el('a', { class: 'plano-abrir plano-remoto', href: p.enlace, target: '_blank', rel: 'noopener noreferrer' },
          el('span', { class: 'plano-remoto-icono' }, '🗺️'), el('span', { class: 'plano-titulo' }, p.nombre || 'Plano'),
          el('span', { class: 'pie' }, 'En la nube de quien lo cargó · abrir'))
        : el('div', { class: 'plano-abrir plano-remoto' },
          el('span', { class: 'plano-remoto-icono' }, '🗺️'), el('span', { class: 'plano-titulo' }, p.nombre || 'Plano'),
          el('span', { class: 'pie' }, 'Sólo en el teléfono de quien lo cargó'))));
  }
  if (!visibles.length && !nodos.planos.childElementCount) {
    nodos.planos.append(el('p', { class: 'pie' }, 'Carga un plano (PDF, DXF o imagen) para marcar notas y medir sobre él.'));
  }
}

async function cargarPlano(archivo) {
  const visita = actual;
  avisar(nodos.aviso, 'Preparando el plano…', 60000);
  try {
    const planos = await leerArchivoPlano(archivo, visita.obra, (texto) => avisar(nodos.aviso, texto, 60000));
    for (const p of planos) await guardarPlano(p);
    avisar(nodos.aviso, planos.length > 1 ? `${planos.length} planos cargados.` : 'Plano cargado.');
    if (actual !== visita) return;
    await pintarPlanos();
    if (planos.length === 1) abrirPlano(planos[0].id);
  } catch (e) {
    console.error(e);
    avisar(nodos.aviso, /\.dxf$/i.test(archivo.name || '') && e && e.message
      ? `No se ha podido leer el DXF: ${e.message}`
      : 'No se ha podido leer ese plano. Prueba con un PDF, un DXF o una imagen.', 6000);
  }
}

/* Un plano con notas en alguna visita no se borra: esas visitas y sus
   informes lo necesitan. */
async function quitarPlano(plano) {
  await guardarYa();
  const usos = (await listarVisitas()).filter((v) =>
    (v.notas || []).some((n) => n.plano === plano.id) || (v.trazos || []).some((t) => t.plano === plano.id)
    || (v.medidas || []).some((m) => m.plano === plano.id));
  if (usos.length) {
    alert(`«${plano.nombre}» tiene notas, dibujos o medidas en ${plural(usos.length, 'visita', 'visitas')}. Bórralos antes si quieres quitarlo.`);
    return;
  }
  if (!confirm(`¿Quitar el plano «${plano.nombre}» del teléfono?`)) return;
  await borrarPlano(plano.id);
  pintarPlanos();
}

const visor = crearVisorPlano({
  visita: () => actual,
  cambiado,
  anadirFotos,
  ampliar: (url) => ampliar(url),
  alCerrar: cerrarPlano,
  guardarPlano: (p) => guardarPlano(p).catch(() => avisar(nodos.aviso, 'No se ha podido guardar la escala del plano.', 4000))
});

const punch = crearPunchList({
  nodos: {
    lista: nodos.repasos,
    total: nodos.totalRepasos,
    filtros: nodos.filtrosRepasos,
    nuevo: nodos.repaso,
    nuevoFoto: nodos.repasoFoto,
    pdf: nodos.punchPdf,
    entradaCamara: nodos.entradaRepasoCamara,
    entradaGaleria: nodos.entradaRepasoGaleria
  },
  visita: () => actual,
  avisar: (texto, ms) => avisar(nodos.aviso, texto, ms),
  ampliar: (url) => ampliar(url),
  alGuardar: (texto) => { nodos.estadoGuardado.textContent = texto; },
  ladoFoto: LADO_FOTO,
  calidadFoto: CALIDAD_FOTO,
  contratistas: (v) => equipo.contratistas(v.obraId)
});

const misRepasos = crearMisRepasos({
  grupo: $('grupo-mis-repasos'),
  contenedor: $('mis-repasos'),
  entradaCamara: $('entrada-mis-camara'),
  entradaGaleria: $('entrada-mis-galeria'),
  uid: () => (equipo.usuario ? equipo.usuario.uid : null),
  avisar: (texto, ms) => avisar(nodos.aviso, texto, ms),
  ampliar: (url) => ampliar(url),
  ladoFoto: LADO_FOTO,
  calidadFoto: CALIDAD_FOTO
});

/* --- firma ---
   El recuadro está bloqueado hasta pulsar «Firmar», para que un roce al
   desplazar la ficha no deje trazos. «Listo» lo vuelve a bloquear, y se
   bloquea solo al abrir otra visita. */

const MI_FIRMA = 'crd-mi-firma';
function leerMiFirma() {
  try { return localStorage.getItem(MI_FIRMA); } catch { return null; }
}

const firma = (() => {
  const lienzo = nodos.firma;
  const ctx = lienzo.getContext('2d');
  let trazando = false;
  let huboTrazo = false;
  let bloqueada = true;

  function pintarEstado() {
    nodos.firmaCaja.classList.toggle('bloqueada', bloqueada);
    nodos.firmaCaja.classList.toggle('con-firma', huboTrazo);
    nodos.firmar.hidden = !bloqueada;
    nodos.firmar.textContent = huboTrazo ? '✍ Volver a firmar' : '✍ Firmar';
    nodos.firmaListo.hidden = bloqueada;
    nodos.borrarFirma.hidden = !huboTrazo;
    nodos.firmaMia.hidden = !leerMiFirma();
    nodos.firmaGuardar.hidden = !huboTrazo;
    nodos.firmaAyuda.textContent = bloqueada
      ? (huboTrazo ? 'Firma guardada y bloqueada.' : 'La firma está bloqueada para evitar trazos por error. Pulsa «Firmar» para habilitarla.')
      : 'Firma con el dedo dentro del recuadro y pulsa «Listo» para bloquearla.';
  }

  function bloquear(si) {
    bloqueada = si;
    pintarEstado();
  }

  function preparar() {
    const r = lienzo.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    lienzo.width = Math.max(1, Math.round(r.width * dpr));
    lienzo.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }

  function punto(ev) {
    const r = lienzo.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  lienzo.addEventListener('pointerdown', (ev) => {
    if (bloqueada) return;   // sin preventDefault: el dedo desplaza la página
    trazando = true;
    lienzo.setPointerCapture(ev.pointerId);
    ctx.beginPath();
    ctx.moveTo(...punto(ev));
    ev.preventDefault();
  });
  lienzo.addEventListener('pointermove', (ev) => {
    if (!trazando) return;
    ctx.lineTo(...punto(ev));
    ctx.stroke();
    huboTrazo = true;
  });
  const terminar = () => {
    if (!trazando) return;
    trazando = false;
    if (!huboTrazo || !actual) return;
    const visita = actual;
    pintarEstado();
    lienzo.toBlob((blob) => {
      visita.firma = blob;
      if (actual === visita) cambiado();
      else guardarVisita(visita);
    }, 'image/png');
  };
  lienzo.addEventListener('pointerup', terminar);
  lienzo.addEventListener('pointercancel', terminar);

  // Al girar el teléfono cambia el tamaño del recuadro: se vuelve a pintar.
  let anchoPrevio = 0;
  addEventListener('resize', () => {
    const ancho = lienzo.getBoundingClientRect().width;
    if (!actual || !ancho || ancho === anchoPrevio) return;
    anchoPrevio = ancho;
    firma.cargar(actual.firma, { mantenerBloqueo: true });
  });

  nodos.firmar.addEventListener('click', () => {
    if (huboTrazo) {
      if (!confirm('¿Borrar la firma actual y volver a firmar?')) return;
      firma.borrar();
    }
    bloquear(false);
  });
  nodos.firmaListo.addEventListener('click', () => {
    bloquear(true);
    if (huboTrazo) alFirmar();
  });

  /* Firma adjunta: una imagen (foto o escaneo de la firma, o un PNG).
     Se recorta al trazo, el papel blanco pasa a transparente y se encaja
     en el recuadro sin deformarla. */
  async function prepararImagen(origen) {
    const img = await decodificar(origen);
    const r = lienzo.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width * dpr));
    const H = Math.max(1, Math.round(r.height * dpr));
    // 1) a un lienzo de trabajo, como mucho 1600 px de ancho
    const k = Math.min(1, 1600 / img.width);
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const t = new OffscreenCanvas(w, h);
    const tc = t.getContext('2d', { willReadFrequently: true });
    tc.drawImage(img, 0, 0, w, h);
    const datos = tc.getImageData(0, 0, w, h);
    const px = datos.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const luz = (px[i] + px[i + 1] + px[i + 2]) / 3;
        // papel claro → transparente; tinta → se queda (con borde suave)
        const alfa = px[i + 3] * Math.min(1, Math.max(0, (225 - luz) / 70));
        px[i + 3] = alfa;
        if (alfa > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) throw new Error('vacia');
    tc.putImageData(datos, 0, 0);
    // 2) recorte con margen y encaje en el recuadro
    const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const esc = Math.min((W * 0.92) / cw, (H * 0.85) / ch);
    const fin = new OffscreenCanvas(W, H);
    fin.getContext('2d').drawImage(t, x0, y0, cw, ch, (W - cw * esc) / 2, (H - ch * esc) / 2, cw * esc, ch * esc);
    return fin.convertToBlob({ type: 'image/png' });
  }

  async function ponerFirma(blob) {
    if (!actual) return;
    if (huboTrazo && !confirm('¿Cambiar la firma actual por esta?')) return;
    actual.firma = blob;
    await firma.cargar(blob);
    cambiado();
    alFirmar();
  }

  nodos.firmaAdjuntar.addEventListener('click', () => nodos.entradaFirma.click());
  nodos.entradaFirma.addEventListener('change', async () => {
    const archivo = nodos.entradaFirma.files[0];
    nodos.entradaFirma.value = '';
    if (!archivo) return;
    try {
      await ponerFirma(await prepararImagen(archivo));
      avisar(nodos.aviso, 'Firma adjuntada. Puedes guardarla como «mi firma» para las próximas visitas.', 4000);
    } catch (e) {
      avisar(nodos.aviso, e.message === 'vacia'
        ? 'No se ve ninguna firma en la imagen. Usa una foto con la firma en tinta oscura sobre papel blanco.'
        : 'No se ha podido leer la imagen de la firma.', 5000);
    }
  });

  nodos.firmaGuardar.addEventListener('click', async () => {
    if (!actual?.firma) return;
    try {
      localStorage.setItem(MI_FIRMA, await aDatos(actual.firma));
      pintarEstado();
      avisar(nodos.aviso, 'Guardada como tu firma en este teléfono. En las próximas visitas: «⭐ Usar mi firma».', 4000);
    } catch {
      avisar(nodos.aviso, 'No se ha podido guardar la firma en este teléfono.', 4000);
    }
  });

  nodos.firmaMia.addEventListener('click', async () => {
    const datos = leerMiFirma();
    if (!datos) return;
    await ponerFirma(await deDatos(datos));
  });

  return {
    async cargar(blob, { mantenerBloqueo = false } = {}) {
      preparar();
      huboTrazo = Boolean(blob);
      if (!mantenerBloqueo) bloqueada = true;
      pintarEstado();
      if (!blob) return;
      const img = await decodificar(blob);
      const r = lienzo.getBoundingClientRect();
      ctx.drawImage(img, 0, 0, r.width, r.height);
    },
    borrar() {
      preparar();
      huboTrazo = false;
      pintarEstado();
      if (actual) { actual.firma = null; cambiado(); }
    }
  };
})();

/* ------------------------------------------------------------------ */
/* informe para imprimir (o guardar como PDF) y resumen para compartir */
/* ------------------------------------------------------------------ */

/* Logotipo «C◎ORDINATE» para la cabecera del informe. Es marcado fijo
   (no hay datos del usuario dentro), por eso puede ir como innerHTML. */
function logotipo() {
  const marca = el('span', { class: 'marca', 'aria-label': 'COORDINATE' });
  marca.innerHTML = 'C<svg viewBox="10 10 44 44" aria-hidden="true">'
    + '<g fill="currentColor"><circle cx="32.00" cy="14.67" r="4.53"/><circle cx="44.25" cy="19.75" r="4.53"/><circle cx="49.33" cy="32.00" r="4.53"/><circle cx="44.25" cy="44.25" r="4.53"/><circle cx="32.00" cy="49.33" r="4.53"/><circle cx="19.75" cy="44.25" r="4.53"/><circle cx="14.67" cy="32.00" r="4.53"/><circle cx="19.75" cy="19.75" r="4.53"/></g>'
    + '<circle cx="32" cy="32" r="6" fill="#62a0e8"/></svg>ORDINATE';
  return marca;
}

function pieInforme() {
  return el('footer', { class: 'informe-pie' },
    el('span', {}, LEMA),
    el('span', {}, CONTACTO)
  );
}

/* Nº de documento estable: PV-AAAAMMDD-HHMM (fecha y hora de la visita). */
function numeroParte(v) {
  return `PV-${(v.fecha || '').replaceAll('-', '')}-${(v.hora || '0000').replace(':', '')}`;
}

/* Cabecera de las secciones: «1 · Personal en obra». */
let seccionN = 0;
function titulo(texto, extra) {
  seccionN += 1;
  return el('h2', { class: 'informe-h2' },
    el('span', { class: 'informe-h2-n' }, String(seccionN).padStart(2, '0')),
    el('span', {}, texto),
    extra ? el('span', { class: 'informe-h2-extra' }, extra) : null);
}

function bloqueN(texto, contenido) {
  if (!contenido || !String(contenido).trim()) return null;
  return el('section', {}, titulo(texto), el('p', { class: 'parrafo' }, contenido));
}

function etiqueta(texto, clase) {
  return el('span', { class: `informe-etiqueta ${clase}` }, texto);
}

/* Trabajos como línea de tiempo: «08:15 · texto» → fila Hora | Actividad. */
function lineaTiempo(texto) {
  const lineas = String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return null;
  const filas = lineas.map((l) => {
    const m = l.match(/^(\d{1,2}:\d{2})\s*·\s*(.*)$/);
    return m ? { hora: m[1], texto: m[2] } : { hora: '', texto: l };
  });
  return el('section', {},
    titulo('Trabajos realizados', `${plural(filas.length, 'registro', 'registros')}`),
    el('table', { class: 'informe-tabla informe-tiempo' },
      el('thead', {}, el('tr', {}, el('th', { class: 'informe-hora' }, 'Hora'), el('th', {}, 'Actividad'))),
      el('tbody', {}, ...filas.map((f) => el('tr', {},
        el('td', { class: 'informe-hora' }, f.hora ? el('span', { class: 'informe-reloj' }, f.hora) : '—'),
        el('td', {}, f.texto))))));
}

/* Fila de cifras clave bajo la ficha. */
function cifras(v, repasos) {
  const abiertas = v.incidencias.filter((i) => i.estado !== 'cerrada').length;
  const c = cuentaEstados(repasos, v.fecha);
  const caja = (n, t, clase = '') => el('div', { class: `informe-cifra ${clase}` }, el('strong', {}, String(n)), el('span', {}, t));
  return el('div', { class: 'informe-cifras' },
    caja(totalPersonas(v), 'personas en obra'),
    caja(v.incidencias.length, abiertas ? `incidencias · ${abiertas} abiertas` : 'incidencias', abiertas ? 'alerta' : ''),
    caja(repasos.length, `repasos · ${c.pendiente} por corregir`, c.pendiente ? 'aviso' : ''),
    caja(v.fotos.length, 'fotos'));
}

/* Punch list para el PDF: una fila por repaso, con la última foto de
   antes y la de después tal como estaban el día de la visita. */
function seccionRepasos(lista, fecha, url, nombre) {
  if (!lista.length) return null;
  const c = cuentaEstados(lista, fecha);
  const foto = (fotos) => fotos.length
    ? el('div', {},
      el('img', { src: url(fotos[fotos.length - 1].blob), alt: '' }),
      fotos.length > 1 ? el('span', { class: 'informe-nota' }, `+${fotos.length - 1}`) : null)
    : el('span', { class: 'informe-nota' }, '—');
  return el('section', { class: 'informe-repasos' },
    titulo(nombre, `${c.pendiente} por corregir · ${c.corregido} por verificar · ${c.cerrado} cerrados`),
    el('table', { class: 'informe-tabla' },
      el('thead', {}, el('tr', {},
        el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Zona'), el('th', {}, 'Qué corregir'),
        el('th', {}, 'Responsable'), el('th', {}, 'Estado'), el('th', {}, 'Antes'), el('th', {}, 'Después'))),
      el('tbody', {}, ...lista.map((r) => {
        const estado = estadoEn(r, fecha);
        return el('tr', { class: `estado-${estado}` },
          el('td', { class: 'num' }, String(r.numero)),
          el('td', {}, r.zona || '—', el('div', { class: 'informe-nota' }, CATEGORIAS[r.categoria] || r.categoria)),
          el('td', {}, r.texto || '—',
            r.prioridad === 'alta' ? el('div', { class: 'informe-alta' }, 'Prioridad alta') : null),
          el('td', {}, r.responsable || '—'),
          el('td', {}, el('strong', {}, ESTADOS[estado]), el('div', { class: 'informe-nota' }, historial(r, fecha))),
          el('td', { class: 'informe-mini' }, foto(fotosEn(r, fecha, 'antes'))),
          el('td', { class: 'informe-mini' }, foto(fotosEn(r, fecha, 'despues'))));
      })))
  );
}

/* Abre el diálogo de impresión con lo que ya hay en #informe. */
async function lanzarImpresion(titulo, urls) {
  // El diálogo de impresión no espera a las imágenes: hay que decodificarlas antes.
  await Promise.all([...nodos.informe.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  // …y las firmas, que van como fondo.
  await Promise.all([...nodos.informe.querySelectorAll('.informe-hueco[style]')].map((n) => {
    const m = n.style.backgroundImage.match(/url\("?(.*?)"?\)/);
    if (!m) return null;
    const img = new Image();
    img.src = m[1];
    return img.decode().catch(() => {});
  }));
  // El título del documento es el nombre que propone el PDF.
  const tituloAntes = document.title;
  document.title = titulo.trim();
  addEventListener('afterprint', () => { document.title = tituloAntes; }, { once: true });
  window.print();
  setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u); }, 60000);
}

/* Inspecciones y vaciados de la misma obra y fecha, para el parte. */
async function calidadDelDia(v) {
  const tres = (n) => String(n || 0).padStart(3, '0');
  const RES = { liberada: 'Liberada', condicionada: 'Con observaciones', rechazada: 'Rechazada' };
  try {
    const ins = (await listarInspecciones()).filter((r) => r.fecha === v.fecha && mismaObra(r.obra, v.obra));
    const vac = (await listarVaciados()).filter((r) => r.fecha === v.fecha && mismaObra(r.obra, v.obra));
    return [
      ...ins.map((r) => ({ codigo: `IN-${tres(r.numero)}`, titulo: r.titulo, zona: r.zona, resultado: RES[r.resultado] || 'En curso' })),
      ...vac.map((r) => ({
        codigo: `VH-${tres(r.numero)}`, titulo: `Vaciado · ${r.elemento || 'hormigón'}`, zona: r.zona,
        resultado: `${(r.camiones || []).reduce((t, c) => t + (parseFloat(String(c.m3).replace(',', '.')) || 0), 0).toLocaleString('es-DO', { maximumFractionDigits: 2 })} m³${r.fc ? ` · f'c ${r.fc} ${r.unidad}` : ''}`
      }))
    ];
  } catch (e) {
    return [];
  }
}

async function imprimir() {
  await guardarYa();
  const v = actual;
  const urls = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  avisar(nodos.aviso, 'Preparando el informe…', 20000);
  const planosInforme = [];
  for (const plano of await planosConNotas(v)) {
    const notas = v.notas.filter((k) => k.plano === plano.id).sort((a, b) => a.numero - b.numero);
    const trazos = v.trazos.filter((t) => t.plano === plano.id);
    const medidas = v.medidas.filter((m) => m.plano === plano.id);
    planosInforme.push({ plano, notas, imagen: await componerPlano(plano, notas, trazos, 2400, medidas) });
  }
  nodos.aviso.hidden = true;

  const calidadDia = await calidadDelDia(v);
  // Pasa por el(): los apartados vacíos llegan como null y no deben pintarse.
  seccionN = 0;
  const repasosV = punch.lista(v);
  const dato = (t, valor) => el('div', { class: 'informe-dato' }, el('span', {}, t), el('strong', {}, valor || '—'));
  nodos.informe.replaceChildren(...el('div', {},
    el('div', { class: 'informe-banda' },
      logotipo(),
      el('div', { class: 'informe-banda-doc' },
        el('span', { class: 'informe-tipo' }, 'Parte diario de obra'),
        el('strong', {}, numeroParte(v)))),
    el('header', { class: 'informe-cabecera' },
      el('div', {},
        el('h1', {}, 'Parte de visita de obra'),
        el('p', { class: 'informe-obra' }, v.obra || 'Obra sin nombre')),
      el('div', { class: 'informe-sello' },
        el('span', {}, 'Emitido'),
        el('strong', {}, new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })),
        el('span', {}, ahora()))),
    el('div', { class: 'informe-ficha' },
      dato('Fecha', fechaLarga(v.fecha)),
      dato('Hora de inicio', v.hora),
      dato('Realizada por', v.autor),
      dato('Jornada', v.jornada),
      dato('Tiempo', v.clima.join(', ')),
      dato('Temperatura', v.temperatura)),
    cifras(v, repasosV),
    v.personal.some((p) => p.empresa || p.oficio || p.numero) && el('section', {},
      titulo('Personal en obra', plural(totalPersonas(v), 'persona', 'personas')),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Empresa'), el('th', {}, 'Oficio'), el('th', { class: 'num' }, 'Nº'))),
        el('tbody', {}, ...v.personal.filter((p) => p.empresa || p.oficio || p.numero).map((p) =>
          el('tr', {}, el('td', {}, p.empresa), el('td', {}, p.oficio), el('td', { class: 'num' }, p.numero))))
      )
    ),
    lineaTiempo(v.trabajos),
    (v.maquinaria?.trim() || v.materiales?.trim()) && el('section', {},
      titulo('Medios y materiales'),
      el('div', { class: 'informe-dos' },
        el('div', {}, el('h3', {}, 'Maquinaria y medios'), el('p', { class: 'parrafo' }, v.maquinaria?.trim() || '—')),
        el('div', {}, el('h3', {}, 'Materiales recibidos'), el('p', { class: 'parrafo' }, v.materiales?.trim() || '—')))),
    v.incidencias.length > 0 && el('section', {},
      titulo('Incidencias', `${v.incidencias.filter((i) => i.estado !== 'cerrada').length} abiertas · ${v.incidencias.filter((i) => i.estado === 'cerrada').length} resueltas`),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Hora'), el('th', {}, 'Descripción'), el('th', {}, 'Gravedad'), el('th', {}, 'Estado'))),
        el('tbody', {}, ...v.incidencias.map((i) => el('tr', {},
          el('td', { class: 'informe-hora' }, horasIncidencia(i, v.fecha).replace('🕒 ', '') || '—'),
          el('td', {}, i.texto),
          el('td', {}, etiqueta(GRAVEDADES[i.gravedad] || i.gravedad, `grav-${i.gravedad}`)),
          el('td', {}, etiqueta(i.estado === 'cerrada' ? 'Resuelta' : 'Abierta', i.estado === 'cerrada' ? 'ok' : 'abierta'))))))
    ),
    seccionRepasos(repasosV, v.fecha, url, 'Punch list · repasos de terminaciones'),
    calidadDia.length > 0 && el('section', {},
      titulo('Calidad · inspecciones y vaciados del día', plural(calidadDia.length, 'registro', 'registros')),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Nº'), el('th', {}, 'Registro'), el('th', {}, 'Zona'), el('th', {}, 'Resultado'))),
        el('tbody', {}, ...calidadDia.map((x) => el('tr', {},
          el('td', { class: 'informe-hora' }, x.codigo), el('td', {}, x.titulo), el('td', {}, x.zona || '—'), el('td', {}, x.resultado)))))),
    bloqueN('Observaciones e instrucciones', v.observaciones),
    ...planosInforme.map(({ plano, imagen, notas }) => el('section', { class: 'informe-plano' },
      titulo(`Plano · ${plano.nombre}`, notas.length ? plural(notas.length, 'nota', 'notas') : null),
      el('img', { src: url(imagen), alt: plano.nombre }),
      notas.length > 0 && el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Tipo'), el('th', {}, 'Nota'), el('th', {}, 'Fotos'))),
        el('tbody', {}, ...notas.map((k) => el('tr', {},
          el('td', { class: 'num' }, String(k.numero)),
          el('td', {}, TIPOS_NOTA[k.tipo] || k.tipo),
          el('td', {}, k.texto || '—', detallesInforme(k)),
          el('td', {}, v.fotos.map((f, i) => (f.nota === k.id ? String(i + 1) : null)).filter(Boolean).join(', ') || '—')))))
    )),
    v.fotos.length > 0 && el('section', { class: 'informe-seccion-fotos' },
      titulo('Registro fotográfico', plural(v.fotos.length, 'foto', 'fotos')),
      el('div', { class: 'informe-fotos' }, ...v.fotos.map((f, n) => {
        const nota = f.nota && v.notas.find((k) => k.id === f.nota);
        return el('figure', {},
          el('img', { src: url(f.blob), alt: '' }),
          el('figcaption', {}, [`${n + 1}`, nota && `Nota ${nota.numero}`, f.pie, f.hora].filter(Boolean).join(' · ')));
      }))
    ),
    el('section', { class: 'informe-firma' },
      titulo('Conformidad'),
      el('div', { class: 'informe-firmas' },
        el('div', { class: 'informe-firma-caja' },
          // Como fondo y no <img>: así Chrome no parte el bloque de firmas.
          el('div', { class: 'informe-hueco', role: v.firma ? 'img' : null, 'aria-label': v.firma ? 'Firma' : null,
            style: v.firma ? `background: url("${url(v.firma)}") left bottom / contain no-repeat` : null }),
          el('strong', {}, v.autor || 'Nombre y cargo'),
          el('span', {}, `Elaborado · ${fechaLarga(v.fecha)}`)),
        el('div', { class: 'informe-firma-caja' },
          el('div', { class: 'informe-hueco' }),
          el('strong', {}, 'Nombre y cargo'),
          el('span', {}, 'Recibido / Vo. Bo.')))),
    el('p', { class: 'informe-legal' },
      `Documento ${numeroParte(v)} generado con COORDINATE · Visita de obra. Refleja lo observado en la fecha indicada; `
      + 'no sustituye los documentos de diseño ni las órdenes de la dirección técnica.'),
    pieInforme()
  ).childNodes);
  await lanzarImpresion(`Visita ${v.fecha} ${v.obra}`, urls);
}

/* El punch list solo, para pasárselo a los contratistas. */
async function imprimirPunch() {
  await guardarYa();
  const v = actual;
  const lista = punch.lista(v);
  if (!lista.length) return;
  const urls = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
  const responsables = [...new Set(lista.map((r) => r.responsable.trim()).filter(Boolean))];
  seccionN = 0;
  const dato = (t, valor) => el('div', { class: 'informe-dato' }, el('span', {}, t), el('strong', {}, valor || '—'));
  nodos.informe.replaceChildren(...el('div', {},
    el('div', { class: 'informe-banda' },
      logotipo(),
      el('div', { class: 'informe-banda-doc' },
        el('span', { class: 'informe-tipo' }, 'Punch list de terminaciones'),
        el('strong', {}, numeroParte(v).replace('PV-', 'PL-')))),
    el('header', { class: 'informe-cabecera' },
      el('div', {},
        el('h1', {}, 'Punch list de terminaciones'),
        el('p', { class: 'informe-obra' }, v.obra || 'Obra sin nombre')),
      el('div', { class: 'informe-sello' },
        el('span', {}, 'Emitido'),
        el('strong', {}, new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })),
        el('span', {}, ahora()))),
    el('div', { class: 'informe-ficha' },
      dato('Fecha de revisión', fechaLarga(v.fecha)),
      dato('Revisado por', v.autor),
      dato('Responsables', responsables.join(', '))),
    seccionRepasos(lista, v.fecha, url, 'Repasos'),
    el('section', { class: 'informe-firma' },
      titulo('Conformidad'),
      el('div', { class: 'informe-firmas' },
        el('div', { class: 'informe-firma-caja' }, el('div', { class: 'informe-hueco' }),
          el('strong', {}, v.autor || 'Nombre y cargo'), el('span', {}, 'Revisado por')),
        el('div', { class: 'informe-firma-caja' }, el('div', { class: 'informe-hueco' }),
          el('strong', {}, 'Nombre y cargo'), el('span', {}, 'Contratista · recibido')))),
    pieInforme()
  ).childNodes);
  await lanzarImpresion(`Punch list ${v.fecha} ${v.obra}`, urls);
}

/* Tonos y enlaces de una nota para el PDF. Chrome conserva los enlaces
   al guardar como PDF, así que siguen siendo clicables en el archivo. */
function detallesInforme(k) {
  const pinturas = (k.pinturas || []).filter((t) => t.marca || t.nombre);
  const enlaces = (k.enlaces || []).filter((e) => e.titulo || e.url);
  if (!pinturas.length && !enlaces.length) return null;
  return el('div', { class: 'informe-detalles' },
    pinturas.map((t) => el('div', {},
      el('span', { class: 'muestra', style: `background:${/^#[0-9a-f]{6}$/i.test(t.hex) ? t.hex : '#fff'}` }),
      [t.marca, t.nombre, t.acabado].filter(Boolean).join(' · '),
      t.hex ? el('span', { class: 'informe-nota' }, ` (${t.hex.toUpperCase()})`) : null)),
    enlaces.map((e) => {
      const url = enlaceSeguro(e.url);
      return el('div', {}, '↗ ',
        url ? el('a', { href: url }, e.titulo || url) : (e.titulo || e.url),
        url && e.titulo ? el('span', { class: 'informe-nota' }, ` ${url}`) : null,
        !url && e.titulo && e.url ? el('span', { class: 'informe-nota' }, ` (${e.url})`) : null);
    }));
}

/* Planos que salen en los informes: los que tienen notas o dibujos. */
async function planosConNotas(v) {
  const ids = [...new Set([...v.notas.map((k) => k.plano), ...v.trazos.map((t) => t.plano), ...v.medidas.map((m) => m.plano)])];
  const planos = await Promise.all(ids.map((id) => leerPlano(id)));
  return planos.filter(Boolean);
}

async function generarInforme(v) {
  const blob = await generarInformeInteractivo(v, await planosConNotas(v), {
    contacto: CONTACTO, lema: LEMA, repasos: punch.lista(v)
  });
  const nombre = `informe-visita-${v.fecha}${v.obra ? '-' + v.obra.toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, '-').replace(/^-|-$/g, '') : ''}.html`;
  return { blob, nombre };
}

async function informeInteractivo() {
  await guardarYa();
  const v = actual;
  avisar(nodos.aviso, 'Preparando el informe interactivo…', 60000);
  try {
    const { blob, nombre } = await generarInforme(v);
    const archivo = new File([blob], nombre, { type: 'text/html' });
    nodos.aviso.hidden = true;
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ title: `Visita ${v.fecha} ${v.obra}`.trim(), files: [archivo] });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    descargar(blob, nombre);
    avisar(nodos.aviso, 'Informe descargado. Ábrelo en el navegador o envíalo por correo.', 4000);
  } catch (e) {
    avisar(nodos.aviso, 'No se ha podido preparar el informe interactivo.', 4000);
  }
}

function resumen(v) {
  const repasos = punch.lista(v).filter((r) => estadoEn(r, v.fecha) !== 'cerrado' || r.cerrado === v.fecha);
  const lineas = [
    `COORDINATE · PARTE DE VISITA · ${v.obra || 'Obra'}`,
    `${fechaLarga(v.fecha)}${v.hora ? ' · ' + v.hora : ''}`,
    v.autor && `Visita: ${v.autor}`,
    (v.clima.length || v.temperatura) && `Tiempo: ${[v.clima.join(', '), v.temperatura].filter(Boolean).join(' · ')}`,
    v.jornada && v.jornada !== 'Normal' && `Jornada: ${v.jornada}`,
    `Personal: ${totalPersonas(v)}`,
    ...v.personal.filter((p) => p.empresa || p.oficio).map((p) =>
      `  · ${[p.empresa, p.oficio].filter(Boolean).join(' – ')}: ${p.numero || 0}`),
    v.trabajos && `\nTrabajos:\n${v.trabajos}`,
    v.maquinaria && `\nMaquinaria:\n${v.maquinaria}`,
    v.materiales && `\nMateriales:\n${v.materiales}`,
    v.incidencias.length && '\nIncidencias:',
    ...v.incidencias.map((i) =>
      `  · ${i.hora ? `${i.hora} ` : ''}[${(GRAVEDADES[i.gravedad] || i.gravedad).toUpperCase()}${i.estado === 'cerrada' ? `, resuelta${i.resuelta ? ` ${i.resuelta}` : ''}` : ''}] ${i.texto}`),
    repasos.length && '\nPunch list (repasos):',
    ...repasos.map((r) =>
      `  ${r.numero}. [${ESTADOS[estadoEn(r, v.fecha)].toUpperCase()}] `
      + `${[r.zona, CATEGORIAS[r.categoria]].filter(Boolean).join(' · ')}: ${r.texto || '(sin descripción)'}`
      + (r.responsable ? ` → ${r.responsable}` : '')),
    v.observaciones && `\nObservaciones:\n${v.observaciones}`,
    v.notas.length && '\nNotas en plano:',
    ...v.notas.slice().sort((a, b) => a.numero - b.numero).flatMap((k) => [
      `  ${k.numero}. [${TIPOS_NOTA[k.tipo] || k.tipo}] ${k.texto || '(sin texto)'}`,
      ...(k.pinturas || []).filter((t) => t.marca || t.nombre).map((t) =>
        `     Pintura: ${[t.marca, t.nombre, t.acabado, t.hex && t.hex.toUpperCase()].filter(Boolean).join(' · ')}`),
      ...(k.enlaces || []).filter((e) => e.titulo || e.url).map((e) =>
        `     ${[e.titulo, e.url].filter(Boolean).join(': ')}`)
    ]),
    v.fotos.length && `\n${plural(v.fotos.length, 'foto', 'fotos')}`,
    `\n— COORDINATE · ${CONTACTO}`
  ];
  return lineas.filter(Boolean).join('\n');
}

async function compartir() {
  await guardarYa();
  const v = actual;
  const texto = resumen(v);
  const titulo = `Visita ${v.fecha} ${v.obra}`.trim();
  const archivos = v.fotos.map((f, n) =>
    new File([f.blob], `visita-${v.fecha}-${dos(n + 1)}.jpg`, { type: 'image/jpeg' }));

  if (navigator.share) {
    try {
      if (archivos.length && navigator.canShare && navigator.canShare({ files: archivos })) {
        await navigator.share({ title: titulo, text: texto, files: archivos });
      } else {
        await navigator.share({ title: titulo, text: texto });
      }
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    avisar(nodos.aviso, 'Resumen copiado. Pégalo en el correo o en el chat.');
  } catch (e) {
    avisar(nodos.aviso, 'Este navegador no deja compartir ni copiar.', 4000);
  }
}

/* ------------------------------------------------------------------ */
/* copia de seguridad: un JSON con las fotos dentro, en base64         */
/* ------------------------------------------------------------------ */

/* La copia entera como JSON, o null si no hay nada que copiar. */
async function generarCopia() {
  await guardarYa();
  const visitas = await listarVisitas();
  if (!visitas.length) {
    avisar(nodos.aviso, 'No hay visitas que copiar.');
    return null;
  }
  avisar(nodos.aviso, 'Preparando la copia…', 10000);
  const salida = [];
  for (const v of visitas) {
    salida.push({
      ...v,
      firma: v.firma ? await aDatos(v.firma) : null,
      fotos: await Promise.all(v.fotos.map(async (f) => ({ ...f, blob: await aDatos(f.blob) })))
    });
  }
  const planos = [];
  for (const p of await listarPlanos()) planos.push({ ...p, blob: await aDatos(p.blob) });
  const repasos = [];
  for (const r of await listarRepasos()) {
    repasos.push({ ...r, fotos: await Promise.all(r.fotos.map(async (f) => ({ ...f, blob: await aDatos(f.blob) }))) });
  }
  // Calidad (desde la versión 4): inspecciones con su firma y vaciados.
  const conFotos = async (r) => ({
    ...r,
    firma: r.firma ? await aDatos(r.firma) : null,
    fotos: await Promise.all((r.fotos || []).map(async (f) => ({ ...f, blob: await aDatos(f.blob) })))
  });
  const inspecciones = await Promise.all((await listarInspecciones()).map(conFotos));
  const vaciados = await Promise.all((await listarVaciados()).map(conFotos));
  const json = JSON.stringify({
    formato: 'visitas-obra-e04', version: 4, exportada: new Date().toISOString(), visitas: salida, planos, repasos, inspecciones, vaciados
  });
  nodos.aviso.hidden = true;
  return {
    blob: new Blob([json], { type: 'application/json' }),
    nombre: `copia-visitas-${hoy()}-${ahora().replace(':', '')}.json`,
    resumen: `${plural(visitas.length, 'visita', 'visitas')}, ${plural(planos.length, 'plano', 'planos')}, `
      + `${plural(repasos.length, 'repaso', 'repasos')}, ${plural(inspecciones.length, 'inspección', 'inspecciones')} y `
      + plural(vaciados.length, 'vaciado', 'vaciados')
  };
}

async function exportar() {
  const copia = await generarCopia();
  if (!copia) return;
  descargar(copia.blob, copia.nombre);
  avisar(nodos.aviso, `Copia lista: ${copia.resumen}.`);
}

/* Al importar, una visita que ya existe sólo se sustituye si la copia es
   más reciente: así importar dos veces lo mismo no pisa nada. */
async function importar(archivo) {
  try {
    const datos = JSON.parse(await archivo.text());
    if (datos.formato !== 'visitas-obra-e04' || !Array.isArray(datos.visitas)) {
      throw new Error('formato');
    }
    // Las copias de la versión 1 no traen planos.
    for (const p of datos.planos || []) {
      if (!(await leerPlano(p.id))) await guardarPlano({ ...p, blob: await deDatos(p.blob) });
    }
    // Las copias anteriores a la versión 3 no traen punch list.
    for (const r of datos.repasos || []) {
      const existente = await leerRepaso(r.id);
      if (existente && existente.modificado >= r.modificado) continue;
      await guardarRepaso({ ...r, fotos: await Promise.all(r.fotos.map(async (f) => ({ ...f, blob: await deDatos(f.blob) }))) });
    }
    // Las copias anteriores a la versión 4 no traen calidad.
    const deCopia = async (r) => ({
      ...r,
      firma: r.firma ? await deDatos(r.firma) : null,
      fotos: await Promise.all((r.fotos || []).map(async (f) => ({ ...f, blob: await deDatos(f.blob) })))
    });
    for (const [lista, leer, guardar] of [[datos.inspecciones, leerInspeccion, guardarInspeccion], [datos.vaciados, leerVaciado, guardarVaciado]]) {
      for (const r of lista || []) {
        const existente = await leer(r.id);
        if (existente && existente.modificado >= r.modificado) continue;
        await guardar(await deCopia(r));
      }
    }
    let nuevas = 0, actualizadas = 0;
    for (const v of datos.visitas) {
      const existente = await leerVisita(v.id);
      if (existente && existente.modificada >= v.modificada) continue;
      await guardarVisita({
        ...v,
        firma: v.firma ? await deDatos(v.firma) : null,
        fotos: await Promise.all(v.fotos.map(async (f) => ({ ...f, blob: await deDatos(f.blob) })))
      });
      if (existente) actualizadas++; else nuevas++;
    }
    avisar(nodos.aviso, `Importadas: ${nuevas} nuevas, ${actualizadas} actualizadas.`, 4000);
    await mostrarLista();
  } catch (e) {
    avisar(nodos.aviso, 'Ese archivo no es una copia de visitas válida.', 4000);
  }
}

/* ------------------------------------------------------------------ */
/* cableado                                                            */
/* ------------------------------------------------------------------ */

nodos.nueva.addEventListener('click', () => {
  nuevaVisita().catch(() => avisar(nodos.aviso, 'No se ha podido crear la visita.', 4000));
});
nodos.buscar.addEventListener('input', pintarLista);

nodos.ficha.addEventListener('input', (ev) => {
  const campo = ev.target.dataset && ev.target.dataset.campo;
  if (!campo || !actual) return;
  actual[campo] = ev.target.value;
  cambiado();
  if (campo === 'obra' || campo === 'fecha') punch.pintar();
});

nodos.botonClima.addEventListener('click', () => tomarClima());

/* El menú del símbolo (funciones y aspecto) lo maneja js/menu.js. */

nodos.botonPersonal.addEventListener('click', () => {
  actual.personal.push({ id: nuevoId(), empresa: '', oficio: '', numero: '' });
  pintarPersonal();
  nodos.personal.lastElementChild.querySelector('input').focus();
  cambiado();
});

nodos.botonIncidencia.addEventListener('click', () => {
  actual.incidencias.push({ id: nuevoId(), texto: '', gravedad: 'media', estado: 'abierta', desde: actual.fecha, hora: ahora() });
  pintarIncidencias();
  nodos.incidencias.lastElementChild.querySelector('textarea').focus();
  cambiado();
});

nodos.camara.addEventListener('click', () => nodos.entradaCamara.click());
nodos.galeria.addEventListener('click', () => nodos.entradaGaleria.click());
for (const entrada of [nodos.entradaCamara, nodos.entradaGaleria]) {
  entrada.addEventListener('change', () => {
    const archivos = [...entrada.files];
    entrada.value = '';
    anadirFotos(archivos);
  });
}
nodos.fotoGrande.addEventListener('click', () => { nodos.fotoGrande.hidden = true; });

nodos.botonPlano.addEventListener('click', () => nodos.entradaPlano.click());
nodos.entradaPlano.addEventListener('change', () => {
  const archivo = nodos.entradaPlano.files[0];
  nodos.entradaPlano.value = '';
  if (archivo) cargarPlano(archivo);
});
nodos.otrosPlanos.addEventListener('click', () => { verTodosPlanos = true; pintarPlanos(); });
document.getElementById('plano-guia').addEventListener('click', () => window.crdGuia && window.crdGuia.empezar('plano'));
nodos.botonInteractivo.addEventListener('click', informeInteractivo);

const nube = crearNube({
  avisar: (texto, ms) => avisar(nodos.aviso, texto, ms),
  informe: generarInforme,
  resumen,
  copia: generarCopia,
  restaurar: importar
});
nodos.correo.addEventListener('click', async () => { await guardarYa(); nube.enviar(actual); });
nodos.nube.addEventListener('click', async () => { await guardarYa(); nube.guardar(actual); });
nodos.copiaNube.addEventListener('click', () => nube.copiaNube());

/* --- aviso a los administradores al firmar ---
   En una obra compartida, al terminar de firmar se ofrece mandar el parte
   a sus administradores: con la cuenta vinculada (Gmail u Outlook, con el
   informe adjunto) o con la app de correo del teléfono (sólo el texto).
   Además les llega como novedad en la app al sincronizar. */
async function alFirmar() {
  const v = actual;
  if (!v || !v.obraId || !equipo.usuario || v.avisoAdmin) return;
  const admins = equipo.administradores(v.obraId);
  if (!admins.length) return;
  await guardarYa();
  const correos = admins.map((a) => a.correo);
  const asunto = `Bitácora firmada · ${v.obra || 'Obra'} · ${fechaLarga(v.fecha)}`;
  const marcar = () => {
    if (actual !== v) return;
    v.avisoAdmin = Date.now();
    cambiado();
  };
  const conCuenta = vinculadas().length > 0;
  const cuerpo = resumen(v);
  const mailto = `mailto:${correos.map((c) => encodeURIComponent(c).replace('%40', '@')).join(',')}?subject=${encodeURIComponent(asunto)}`
    + `&body=${encodeURIComponent(cuerpo.length > 1800 ? `${cuerpo.slice(0, 1800)}\n…` : cuerpo)}`;
  const dialogo = document.getElementById('dialogo');
  nube.abrir('Avisar al administrador',
    el('p', {}, 'Bitácora firmada. ¿La mandas a ',
      el('strong', {}, admins.map((a) => a.nombre || a.correo).join(', ')), '?'),
    el('p', { class: 'pie' }, `${correos.join(', ')} · Además le aparecerá como novedad en la app cuando sincronice.`),
    el('div', { class: 'fila-botones' },
      conCuenta && el('button', {
        type: 'button', class: 'boton boton-destacado',
        onclick: () => nube.enviar(v, { para: correos.join(', '), asunto, alEnviar: marcar })
      }, 'Enviar con mi cuenta (con informe)'),
      el('a', {
        class: conCuenta ? 'boton' : 'boton boton-destacado', href: mailto,
        onclick: () => { marcar(); setTimeout(() => dialogo.close(), 300); }
      }, 'Abrir en mi app de correo'),
      el('button', { type: 'button', class: 'enlace', onclick: () => dialogo.close() }, 'Ahora no')),
    !conCuenta && el('p', { class: 'pie' }, 'Para mandar también el informe con fotos y planos, vincula Gmail u Outlook en «Cuentas vinculadas».'));
}

/* --- equipo: novedades, panel y perfil (menú del símbolo → Novedades) --- */

function pintarBotonEquipo() {
  const activo = Boolean(equipo.activo && equipo.usuario);
  if (window.crdMenu) window.crdMenu.equipo(activo, activo ? novedades.lista(miUid()).length : 0);
}
if (window.crdMenu) window.crdMenu.alNovedades = () => menuEquipo();

function menuEquipo() {
  const uid = miUid();
  const lista = novedades.lista(uid);
  const dialogo = document.getElementById('dialogo');
  const ir = (href) => { dialogo.close(); location.href = href; };
  nube.abrir('Equipo',
    el('div', { class: 'fila-botones' },
      el('a', { class: 'boton boton-destacado', href: './panel.html' }, '📊 Panel diario y semanal'),
      el('a', { class: 'boton', href: './perfil.html' }, '👤 Mi perfil y mis obras')),
    el('h3', { class: 'dialogo-sub' }, lista.length ? `Novedades sin abrir (${lista.length})` : 'Sin novedades'),
    lista.length
      ? el('div', { class: 'obras-compartidas menu-equipo' }, ...lista.slice(0, 30).map((n) => el('button', {
        type: 'button', class: 'obra-compartida',
        onclick: () => {
          if (n.tipo === 'visitas') return ir(`#/v/${encodeURIComponent(n.id)}`);
          if (n.tipo === 'inspecciones' || n.tipo === 'vaciados') {
            novedades.quitar(uid, n.id);
            return ir(`./calidad.html#/${n.tipo === 'vaciados' ? 'vaciado' : 'inspeccion'}/${encodeURIComponent(n.id)}`);
          }
          novedades.quitar(uid, n.id);
          menuEquipo();
        }
      },
        el('span', { class: 'obra-nombre' },
          el('span', { class: `etiqueta ${n.nuevo ? 'ok' : 'atencion'}` }, n.nuevo ? 'Nueva' : 'Actualizada'), ' ',
          n.tipo === 'visitas' ? `${n.obra} · ${n.fecha ? fechaLarga(n.fecha) : ''}` : `${n.obra} · ${n.titulo}`),
        el('span', { class: 'pie' }, [n.quien && `de ${n.quien}`, n.tipo === 'repasos' && 'toca para marcarlo como visto'].filter(Boolean).join(' · ')))))
      : el('p', { class: 'pie' }, 'Cuando alguien de tu equipo cree o cambie una bitácora en tus obras compartidas, aparecerá aquí.'),
    lista.length > 0 && el('button', {
      type: 'button', class: 'enlace',
      onclick: () => { novedades.vaciar(uid); dialogo.close(); if (!actual) pintarLista(); }
    }, 'Marcar todo como visto'));
}

addEventListener('crd-novedades', () => { pintarBotonEquipo(); if (!actual && !nodos.vistaLista.hidden) pintarLista(); });

nodos.borrarFirma.addEventListener('click', () => {
  if (confirm('¿Borrar la firma?')) firma.borrar();
});
nodos.botonInforme.addEventListener('click', imprimir);
nodos.punchPdf.addEventListener('click', imprimirPunch);
nodos.compartir.addEventListener('click', compartir);
nodos.borrar.addEventListener('click', async () => {
  if (!confirm('¿Borrar esta visita con sus fotos? No se puede deshacer.')) return;
  const id = actual.id;
  pendiente = false;
  actual = null;
  liberarUrlsPlanos();
  await borrarVisita(id);
  location.hash = '';
});

nodos.exportar.addEventListener('click', () => {
  exportar().catch(() => avisar(nodos.aviso, 'No se ha podido preparar la copia.', 4000));
});
nodos.importar.addEventListener('click', () => nodos.entradaCopia.click());
nodos.entradaCopia.addEventListener('change', () => {
  const archivo = nodos.entradaCopia.files[0];
  nodos.entradaCopia.value = '';
  if (archivo) importar(archivo);
});

addEventListener('hashchange', enrutar);
// Al pasar a segundo plano (cambiar de app, bloquear) se escribe lo pendiente.
addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });
addEventListener('pagehide', guardarYa);

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* --- equipo: cuenta, obras compartidas y sincronización --- */

/* Nombres de obra que hay en el teléfono, para compartir una. */
async function obrasLocales() {
  const nombres = new Map();
  for (const r of [...await listarVisitas(), ...await listarRepasos(), ...await listarPlanos()]) {
    const n = (r.obra || '').trim();
    if (n && !nombres.has(n.toLowerCase())) nombres.set(n.toLowerCase(), n);
  }
  return [...nombres.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

iniciarEquipoUI({
  grupo: $('grupo-equipo'),
  contenedor: $('equipo'),
  avisar: (texto, ms) => avisar(nodos.aviso, texto, ms),
  obrasLocales
});

/* Llegan cambios de la nube (o se ha asignado una obra compartida): se
   repinta lo que se está viendo. La visita abierta sólo se recarga si no
   hay cambios propios sin guardar. */
addEventListener('crd-remoto', async (ev) => {
  const ids = new Set(ev.detail.ids);
  const nuevas = (ev.detail.nuevas || []).filter((n) => !actual || n.id !== actual.id);
  if (nuevas.length) avisar(nodos.aviso, `👥 ${novedades.frase(nuevas)}`, 6000);
  if (actual && ids.has(actual.id) && miUid()) novedades.quitar(miUid(), actual.id);
  if (!actual) {
    if (!nodos.vistaLista.hidden) mostrarLista();
    return;
  }
  if (ids.has(actual.id) && !pendiente && !visor.abierto) {
    const fresca = await leerVisita(actual.id);
    if (fresca && actual && fresca.id === actual.id) abrirFicha(normalizar(fresca), { recarga: true });
    else if (!fresca) location.hash = '';
    return;
  }
  punch.cargar();
  if (!visor.abierto) pintarPlanos();
});
equipo.addEventListener('cambio', () => {
  pintarBotonEquipo();
  if (actual) nodos.avisoLectura.hidden = equipo.rolEn(actual.obraId) !== 'lector';
  else misRepasos.pintar();
});

// Mensaje de la vuelta de Google o Microsoft (cuenta vinculada o error).
const avisoCuentas = avisoPendiente();
if (avisoCuentas) avisar(nodos.aviso, avisoCuentas.texto, avisoCuentas.error ? 7000 : 4000);

enrutar();
