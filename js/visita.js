/* Visita diaria de obra: lista de partes, ficha de cada visita, planos
   con notas y fotos, punch list de repasos, informe para imprimir en PDF,
   informe interactivo y copia de seguridad. Todo se queda en el teléfono y se guarda según se
   escribe. */

import {
  listarVisitas, leerVisita, guardarVisita, borrarVisita,
  listarPlanos, leerPlano, guardarPlano, borrarPlano,
  listarRepasos, leerRepaso, guardarRepaso
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
import { avisoPendiente } from './cuentas.js';
import { equipo } from './equipo.js';
import { iniciarEquipoUI } from './equipo-ui.js';

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
  aviso: $('aviso')
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
  visor.cerrar();
  return mostrarLista();
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

async function mostrarLista() {
  actual = null;
  liberarUrls();
  liberarUrlsPlanos();
  punch.liberar();
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

function tarjeta(v) {
  const pendientes = abiertas(v).length;
  const graves = abiertas(v).some((i) => i.gravedad === 'grave');
  return el('a', { class: 'tarjeta', href: `#/v/${encodeURIComponent(v.id)}` },
    el('div', { class: 'tarjeta-fecha' }, fechaLarga(v.fecha), v.hora ? ` · ${v.hora}` : ''),
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
  nodos.avisoLectura.hidden = equipo.rolEn(v.obraId) !== 'lector';
  nodos.estadoGuardado.textContent = 'Guardado';
  if (!recarga) scrollTo(0, 0);
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
            onchange: (ev) => { inc.estado = ev.target.checked ? 'cerrada' : 'abierta'; pintarIncidencias(); cambiado(); }
          }),
          'Resuelta'),
        inc.desde && inc.desde !== actual.fecha && el('span', { class: 'pie' }, `Desde ${inc.desde}`),
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
  nodos.totalFotos.textContent = actual.fotos.length ? String(actual.fotos.length) : '';
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
  const usado = (p) => visita.notas.some((n) => n.plano === p.id) || visita.trazos.some((t) => t.plano === p.id);
  const propios = planos.filter((p) => mismaObra(p.obra, visita.obra) || usado(p));
  const visibles = verTodosPlanos ? planos : propios;
  nodos.otrosPlanos.hidden = verTodosPlanos || planos.length === propios.length;
  nodos.otrosPlanos.textContent = `Ver planos de otras obras (${planos.length - propios.length})`;
  nodos.totalPlanos.textContent = visita.notas.length ? plural(visita.notas.length, 'nota', 'notas') : '';
  nodos.planos.replaceChildren(...visibles.map((p) => {
    const notas = visita.notas.filter((n) => n.plano === p.id);
    const dibujos = visita.trazos.filter((t) => t.plano === p.id).length;
    const url = URL.createObjectURL(p.blob);
    urlsPlanos.push(url);
    return el('div', { class: 'plano-ficha' },
      el('button', { type: 'button', class: 'plano-abrir', onclick: () => abrirPlano(p.id) },
        el('img', { src: url, alt: '', loading: 'lazy' }),
        el('span', { class: 'plano-titulo' }, p.nombre),
        el('span', { class: 'pie' },
          [notas.length && plural(notas.length, 'nota', 'notas'), dibujos && plural(dibujos, 'trazo', 'trazos')]
            .filter(Boolean).join(' · ') || 'Sin notas en esta visita',
          !mismaObra(p.obra, visita.obra) && p.obra ? ` · ${p.obra}` : '')
      ),
      el('button', {
        type: 'button', class: 'boton quitar', title: 'Quitar plano', 'aria-label': `Quitar ${p.nombre}`,
        onclick: () => quitarPlano(p)
      }, '✕')
    );
  }));
  if (!visibles.length) {
    nodos.planos.append(el('p', { class: 'pie' }, 'Carga un plano (PDF o imagen) para marcar notas sobre él.'));
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
    avisar(nodos.aviso, 'No se ha podido leer ese plano. Prueba con un PDF o una imagen.', 5000);
  }
}

/* Un plano con notas en alguna visita no se borra: esas visitas y sus
   informes lo necesitan. */
async function quitarPlano(plano) {
  await guardarYa();
  const usos = (await listarVisitas()).filter((v) =>
    (v.notas || []).some((n) => n.plano === plano.id) || (v.trazos || []).some((t) => t.plano === plano.id));
  if (usos.length) {
    alert(`«${plano.nombre}» tiene notas o dibujos en ${plural(usos.length, 'visita', 'visitas')}. Bórralos antes si quieres quitarlo.`);
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
  alCerrar: cerrarPlano
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
  calidadFoto: CALIDAD_FOTO
});

/* --- firma --- */

const firma = (() => {
  const lienzo = nodos.firma;
  const ctx = lienzo.getContext('2d');
  let trazando = false;
  let huboTrazo = false;

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
    firma.cargar(actual.firma);
  });

  return {
    async cargar(blob) {
      preparar();
      huboTrazo = Boolean(blob);
      if (!blob) return;
      const img = await decodificar(blob);
      const r = lienzo.getBoundingClientRect();
      ctx.drawImage(img, 0, 0, r.width, r.height);
    },
    borrar() {
      preparar();
      huboTrazo = false;
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

function bloque(titulo, texto) {
  if (!texto || !texto.trim()) return null;
  return el('section', {}, el('h2', {}, titulo), el('p', { class: 'parrafo' }, texto));
}

function bandaInforme() {
  return el('div', { class: 'informe-banda' },
    logotipo(),
    el('span', { class: 'informe-tipo' }, 'coordinate.do')
  );
}

function pieInforme() {
  return el('footer', { class: 'informe-pie' },
    el('span', {}, LEMA),
    el('span', {}, CONTACTO)
  );
}

/* Punch list para el PDF: una fila por repaso, con la última foto de
   antes y la de después tal como estaban el día de la visita. */
function seccionRepasos(lista, fecha, url, titulo) {
  if (!lista.length) return null;
  const c = cuentaEstados(lista, fecha);
  const foto = (fotos) => fotos.length
    ? el('div', {},
      el('img', { src: url(fotos[fotos.length - 1].blob), alt: '' }),
      fotos.length > 1 ? el('span', { class: 'informe-nota' }, `+${fotos.length - 1}`) : null)
    : el('span', { class: 'informe-nota' }, '—');
  return el('section', { class: 'informe-repasos' },
    el('h2', {}, titulo),
    el('p', { class: 'informe-nota' },
      `${c.pendiente} por corregir · ${c.corregido} corregidos por verificar · ${c.cerrado} cerrados`),
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
  // El título del documento es el nombre que propone el PDF.
  const tituloAntes = document.title;
  document.title = titulo.trim();
  addEventListener('afterprint', () => { document.title = tituloAntes; }, { once: true });
  window.print();
  setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u); }, 60000);
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
    planosInforme.push({ plano, notas, imagen: await componerPlano(plano, notas, trazos) });
  }
  nodos.aviso.hidden = true;

  // Pasa por el(): los apartados vacíos llegan como null y no deben pintarse.
  nodos.informe.replaceChildren(...el('div', {},
    bandaInforme(),
    el('header', {},
      el('h1', {}, 'Parte de visita de obra'),
      el('p', { class: 'informe-obra' }, v.obra || 'Obra sin nombre'),
      el('table', { class: 'informe-datos' }, el('tbody', {},
        el('tr', {}, el('th', {}, 'Fecha'), el('td', {}, fechaLarga(v.fecha), v.hora ? ` · ${v.hora}` : '')),
        el('tr', {}, el('th', {}, 'Realizada por'), el('td', {}, v.autor || '—')),
        el('tr', {}, el('th', {}, 'Tiempo'), el('td', {},
          [v.clima.join(', '), v.temperatura].filter(Boolean).join(' · ') || '—')),
        el('tr', {}, el('th', {}, 'Jornada'), el('td', {}, v.jornada || '—'))
      ))
    ),
    v.personal.some((p) => p.empresa || p.oficio || p.numero) && el('section', {},
      el('h2', {}, `Personal en obra (${totalPersonas(v)})`),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Empresa'), el('th', {}, 'Oficio'), el('th', { class: 'num' }, 'Nº'))),
        el('tbody', {}, ...v.personal.filter((p) => p.empresa || p.oficio || p.numero).map((p) =>
          el('tr', {}, el('td', {}, p.empresa), el('td', {}, p.oficio), el('td', { class: 'num' }, p.numero))))
      )
    ),
    bloque('Trabajos realizados', v.trabajos),
    bloque('Maquinaria y medios', v.maquinaria),
    bloque('Materiales recibidos', v.materiales),
    v.incidencias.length > 0 && el('section', {},
      el('h2', {}, 'Incidencias'),
      el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Descripción'), el('th', {}, 'Gravedad'), el('th', {}, 'Estado'))),
        el('tbody', {}, ...v.incidencias.map((i) => el('tr', {},
          el('td', {}, i.texto, i.desde && i.desde !== v.fecha ? el('span', { class: 'informe-nota' }, ` (desde ${i.desde})`) : null),
          el('td', {}, GRAVEDADES[i.gravedad] || i.gravedad),
          el('td', {}, i.estado === 'cerrada' ? 'Resuelta' : 'Abierta')))))
    ),
    seccionRepasos(punch.lista(v), v.fecha, url, 'Punch list · repasos de terminaciones'),
    bloque('Observaciones e instrucciones', v.observaciones),
    ...planosInforme.map(({ plano, imagen, notas }) => el('section', { class: 'informe-plano' },
      el('h2', {}, `Plano · ${plano.nombre}`),
      el('img', { src: url(imagen), alt: plano.nombre }),
      notas.length > 0 && el('table', { class: 'informe-tabla' },
        el('thead', {}, el('tr', {}, el('th', { class: 'num' }, 'Nº'), el('th', {}, 'Tipo'), el('th', {}, 'Nota'), el('th', {}, 'Fotos'))),
        el('tbody', {}, ...notas.map((k) => el('tr', {},
          el('td', { class: 'num' }, String(k.numero)),
          el('td', {}, TIPOS_NOTA[k.tipo] || k.tipo),
          el('td', {}, k.texto || '—', detallesInforme(k)),
          el('td', {}, v.fotos.map((f, i) => (f.nota === k.id ? String(i + 1) : null)).filter(Boolean).join(', ') || '—')))))
    )),
    v.fotos.length > 0 && el('section', {},
      el('h2', {}, 'Fotos'),
      el('div', { class: 'informe-fotos' }, ...v.fotos.map((f, n) => {
        const nota = f.nota && v.notas.find((k) => k.id === f.nota);
        return el('figure', {},
          el('img', { src: url(f.blob), alt: '' }),
          el('figcaption', {}, [`${n + 1}`, nota && `Nota ${nota.numero}`, f.pie, f.hora].filter(Boolean).join(' · ')));
      }))
    ),
    el('section', { class: 'informe-firma' },
      el('h2', {}, 'Firma'),
      v.firma ? el('img', { src: url(v.firma), alt: 'Firma' }) : el('div', { class: 'informe-hueco' }),
      el('p', {}, v.autor || '')
    ),
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
  nodos.informe.replaceChildren(...el('div', {},
    bandaInforme(),
    el('header', {},
      el('h1', {}, 'Punch list de terminaciones'),
      el('p', { class: 'informe-obra' }, v.obra || 'Obra sin nombre'),
      el('table', { class: 'informe-datos' }, el('tbody', {},
        el('tr', {}, el('th', {}, 'Fecha'), el('td', {}, fechaLarga(v.fecha))),
        el('tr', {}, el('th', {}, 'Revisado por'), el('td', {}, v.autor || '—')),
        responsables.length > 0 && el('tr', {}, el('th', {}, 'Responsables'), el('td', {}, responsables.join(', ')))
      ))
    ),
    seccionRepasos(lista, v.fecha, url, 'Repasos'),
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
  const ids = [...new Set([...v.notas.map((k) => k.plano), ...v.trazos.map((t) => t.plano)])];
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
      `  · [${(GRAVEDADES[i.gravedad] || i.gravedad).toUpperCase()}${i.estado === 'cerrada' ? ', resuelta' : ''}] ${i.texto}`),
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
  const json = JSON.stringify({
    formato: 'visitas-obra-e04', version: 3, exportada: new Date().toISOString(), visitas: salida, planos, repasos
  });
  nodos.aviso.hidden = true;
  return {
    blob: new Blob([json], { type: 'application/json' }),
    nombre: `copia-visitas-${hoy()}-${ahora().replace(':', '')}.json`,
    resumen: `${plural(visitas.length, 'visita', 'visitas')}, ${plural(planos.length, 'plano', 'planos')} y `
      + plural(repasos.length, 'repaso', 'repasos')
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

nodos.botonPersonal.addEventListener('click', () => {
  actual.personal.push({ id: nuevoId(), empresa: '', oficio: '', numero: '' });
  pintarPersonal();
  nodos.personal.lastElementChild.querySelector('input').focus();
  cambiado();
});

nodos.botonIncidencia.addEventListener('click', () => {
  actual.incidencias.push({ id: nuevoId(), texto: '', gravedad: 'media', estado: 'abierta', desde: actual.fecha });
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

nodos.borrarFirma.addEventListener('click', () => firma.borrar());
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
  if (actual) nodos.avisoLectura.hidden = equipo.rolEn(actual.obraId) !== 'lector';
});

// Mensaje de la vuelta de Google o Microsoft (cuenta vinculada o error).
const avisoCuentas = avisoPendiente();
if (avisoCuentas) avisar(nodos.aviso, avisoCuentas.texto, avisoCuentas.error ? 7000 : 4000);

enrutar();
