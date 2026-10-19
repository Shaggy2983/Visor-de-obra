/* Visita diaria de obra: lista de partes, ficha de cada visita, informe
   para imprimir en PDF y copia de seguridad. Todo se queda en el teléfono
   y se guarda según se escribe. */

import { listarVisitas, leerVisita, guardarVisita, borrarVisita } from './partes.js';
import { avisar } from './interfaz.js';

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
  fotoGrande: $('foto-grande'),
  aviso: $('aviso')
};

let actual = null;        // la visita abierta en la ficha
let pendiente = false;    // hay cambios sin escribir en IndexedDB
let temporizador = null;
let urlsFicha = [];       // object URLs de las miniaturas, para liberarlas
let todas = [];           // visitas de la lista, para el buscador

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
    else if (clave === 'class') nodo.className = valor;
    else if (clave in nodo && clave !== 'list') nodo[clave] = valor;
    else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : String(hijo));
  }
  return nodo;
}

function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const dos = (n) => String(n).padStart(2, '0');

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function ahora() {
  const d = new Date();
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function fechaLarga(iso) {
  if (!iso) return 'Sin fecha';
  const [a, m, d] = iso.split('-').map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function totalPersonas(v) {
  return v.personal.reduce((s, p) => s + (Number(p.numero) || 0), 0);
}

const abiertas = (v) => v.incidencias.filter((i) => i.estado !== 'cerrada');

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/* ------------------------------------------------------------------ */
/* rutas: #/v/<id> abre una visita; cualquier otra cosa, la lista      */
/* ------------------------------------------------------------------ */

async function enrutar() {
  await guardarYa();
  const m = location.hash.match(/^#\/v\/(.+)$/);
  if (m) {
    const v = await leerVisita(decodeURIComponent(m[1]));
    if (v) return abrirFicha(v);
    history.replaceState(null, '', location.pathname);
  }
  return mostrarLista();
}

/* ------------------------------------------------------------------ */
/* lista                                                               */
/* ------------------------------------------------------------------ */

async function mostrarLista() {
  actual = null;
  liberarUrls();
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
    ...v.fotos.map((f) => f.pie)
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
      v.clima.length > 0 && el('span', {}, v.clima.join(', '))
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
    observaciones: '',
    firma: null,
    creada: Date.now(),
    modificada: Date.now()
  };
  await guardarVisita(v);
  location.hash = `#/v/${encodeURIComponent(v.id)}`;
}

/* ------------------------------------------------------------------ */
/* ficha                                                               */
/* ------------------------------------------------------------------ */

function abrirFicha(v) {
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
  pintarFotos();
  firma.cargar(v.firma);
  nodos.estadoGuardado.textContent = 'Guardado';
  scrollTo(0, 0);
}

function cambiado() {
  pendiente = true;
  nodos.estadoGuardado.textContent = 'Guardando…';
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarYa, 500);
}

async function guardarYa() {
  clearTimeout(temporizador);
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
    return el('figure', { class: 'foto' },
      el('img', { src: url, alt: f.pie || 'Foto de obra', loading: 'lazy', onclick: () => ampliar(url) }),
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

async function decodificar(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch (e) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/* Reduce la foto antes de guardarla: una de 12 MP del móvil pasa a unos
   pocos cientos de KB, que es lo que aguanta bien IndexedDB en cantidad. */
async function comprimir(archivo) {
  const imagen = await decodificar(archivo);
  const ancho = imagen.width, alto = imagen.height;
  const escala = Math.min(1, LADO_FOTO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  if (imagen.close) imagen.close();
  return new Promise((cumplir) => lienzo.toBlob(cumplir, 'image/jpeg', CALIDAD_FOTO));
}

async function anadirFotos(archivos) {
  if (!actual || !archivos.length) return;
  const visita = actual;
  avisar(nodos.aviso, archivos.length > 1 ? `Guardando ${archivos.length} fotos…` : 'Guardando foto…');
  for (const archivo of archivos) {
    try {
      const blob = await comprimir(archivo);
      if (blob) visita.fotos.push({ id: nuevoId(), blob, pie: '', hora: ahora() });
    } catch (e) {
      avisar(nodos.aviso, `No se ha podido leer ${archivo.name || 'la imagen'}.`, 4000);
    }
  }
  if (actual === visita) {
    pintarFotos();
    pendiente = true;
    await guardarYa();
  } else {
    await guardarVisita(visita);
  }
}

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
  marca.innerHTML = 'C<svg viewBox="0 0 64 64" aria-hidden="true">'
    + '<circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="4"/>'
    + '<path d="M32 6V58M6 32H58" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    + '<g fill="#62a0e8"><circle cx="32" cy="6" r="4.5"/><circle cx="58" cy="32" r="4.5"/>'
    + '<circle cx="32" cy="58" r="4.5"/><circle cx="6" cy="32" r="4.5"/><circle cx="32" cy="32" r="6.5"/></g>'
    + '</svg>ORDINATE';
  return marca;
}

function bloque(titulo, texto) {
  if (!texto || !texto.trim()) return null;
  return el('section', {}, el('h2', {}, titulo), el('p', { class: 'parrafo' }, texto));
}

async function imprimir() {
  await guardarYa();
  const v = actual;
  const urls = [];
  const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  // Pasa por el(): los apartados vacíos llegan como null y no deben pintarse.
  nodos.informe.replaceChildren(...el('div', {},
    el('div', { class: 'informe-banda' },
      logotipo(),
      el('span', { class: 'informe-tipo' }, 'coordinate.do')
    ),
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
    bloque('Observaciones e instrucciones', v.observaciones),
    v.fotos.length > 0 && el('section', {},
      el('h2', {}, 'Fotos'),
      el('div', { class: 'informe-fotos' }, ...v.fotos.map((f, n) => el('figure', {},
        el('img', { src: url(f.blob), alt: '' }),
        el('figcaption', {}, [`${n + 1}`, f.pie, f.hora].filter(Boolean).join(' · ')))))
    ),
    el('section', { class: 'informe-firma' },
      el('h2', {}, 'Firma'),
      v.firma ? el('img', { src: url(v.firma), alt: 'Firma' }) : el('div', { class: 'informe-hueco' }),
      el('p', {}, v.autor || '')
    ),
    el('footer', { class: 'informe-pie' },
      el('span', {}, LEMA),
      el('span', {}, CONTACTO)
    )
  ).childNodes);

  // El diálogo de impresión no espera a las imágenes: hay que decodificarlas antes.
  await Promise.all([...nodos.informe.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  // El título del documento es el nombre que propone el PDF.
  const tituloAntes = document.title;
  document.title = `Visita ${v.fecha} ${v.obra}`.trim();
  addEventListener('afterprint', () => { document.title = tituloAntes; }, { once: true });
  window.print();
  setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u); }, 60000);
}

function resumen(v) {
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
    v.observaciones && `\nObservaciones:\n${v.observaciones}`,
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

function aDatos(blob) {
  return new Promise((cumplir, fallar) => {
    const lector = new FileReader();
    lector.onload = () => cumplir(lector.result);
    lector.onerror = () => fallar(lector.error);
    lector.readAsDataURL(blob);
  });
}

async function deDatos(url) {
  return (await fetch(url)).blob();
}

async function exportar() {
  const visitas = await listarVisitas();
  if (!visitas.length) {
    avisar(nodos.aviso, 'No hay visitas que exportar.');
    return;
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
  const json = JSON.stringify({ formato: 'visitas-obra-e04', version: 1, exportada: new Date().toISOString(), visitas: salida });
  const enlace = el('a', {
    href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `visitas-obra-${hoy()}.json`
  });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 30000);
  avisar(nodos.aviso, `Copia lista: ${plural(visitas.length, 'visita', 'visitas')}.`);
}

/* Al importar, una visita que ya existe sólo se sustituye si la copia es
   más reciente: así importar dos veces lo mismo no pisa nada. */
async function importar(archivo) {
  try {
    const datos = JSON.parse(await archivo.text());
    if (datos.formato !== 'visitas-obra-e04' || !Array.isArray(datos.visitas)) {
      throw new Error('formato');
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

nodos.borrarFirma.addEventListener('click', () => firma.borrar());
nodos.botonInforme.addEventListener('click', imprimir);
nodos.compartir.addEventListener('click', compartir);
nodos.borrar.addEventListener('click', async () => {
  if (!confirm('¿Borrar esta visita con sus fotos? No se puede deshacer.')) return;
  const id = actual.id;
  pendiente = false;
  actual = null;
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

enrutar();
