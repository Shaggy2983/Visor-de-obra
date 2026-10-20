/* Arranque y cableado de la aplicación. */

import { Visor, FONDOS } from './visor.js';
import { Medidor, metros } from './medir.js';
import { Cortes } from './cortes.js';
import { arDisponible, RealidadAumentada } from './ar.js';
import { guardarModelo, leerModelo } from './almacen.js';
import {
  nombreDeClase, fila, filaResultado, pintarPropiedades, resumenAR, avisar
} from './interfaz.js';

const $ = (id) => document.getElementById(id);

const nodos = {
  lienzo: $('lienzo'),
  titulo: document.querySelector('.titulo-seccion'),
  abrir: $('btn-abrir'),
  abrir2: $('btn-abrir-2'),
  ejemplo: $('btn-ejemplo'),
  entrada: $('entrada-ifc'),
  ar: $('btn-ar'),
  panel: $('panel'),
  botonPanel: $('btn-panel'),
  cerrarPanel: $('btn-cerrar-panel'),
  encuadrar: $('btn-encuadrar'),
  medir: $('btn-medir'),
  botonCortes: $('btn-cortes'),
  botonVista: $('btn-vista'),
  todo: $('btn-todo'),
  listaPlantas: $('lista-plantas'),
  listaCategorias: $('lista-categorias'),
  buscar: $('entrada-buscar'),
  resultados: $('resultados'),
  propiedades: $('propiedades'),
  filtroPropiedades: $('filtro-propiedades'),
  ficha: $('ficha-elemento'),
  fichaClase: $('ficha-clase'),
  fichaNombre: $('ficha-nombre'),
  fichaDatos: $('ficha-datos'),
  fichaCerrar: $('ficha-cerrar'),
  verPropiedades: $('btn-propiedades'),
  aislar: $('btn-aislar'),
  ocultar: $('btn-ocultar'),
  transparentar: $('btn-transparentar'),
  rayos: $('btn-rayos'),
  barraMedir: $('barra-medir'),
  medirAyuda: $('medir-ayuda'),
  capaMedidas: $('capa-medidas'),
  fondos: $('fondos'),
  transparencia: $('transparencia'),
  transparenciaTexto: $('transparencia-texto'),
  transparentesTexto: $('transparentes-texto'),
  quitarTransparencias: $('btn-quitar-transparencias'),
  luz: $('luz'),
  luzTexto: $('luz-texto'),
  verAristas: $('ver-aristas'),
  verRejilla: $('ver-rejilla'),
  portada: $('portada'),
  portadaTexto: $('portada-texto'),
  estadoAR: $('estado-ar'),
  cargando: $('cargando'),
  cargandoTexto: $('cargando-texto'),
  progreso: $('progreso'),
  aviso: $('aviso'),
  capaAR: $('capa-ar'),
  arMensaje: $('ar-mensaje'),
  arFicha: $('ar-ficha'),
  arSalir: $('ar-salir'),
  arRecolocar: $('ar-recolocar')
};

const visor = new Visor(nodos.lienzo);
let ar = null;
let trabajador = null;

const medidor = new Medidor(visor, {
  capa: nodos.capaMedidas,
  barra: nodos.barraMedir,
  ayuda: nodos.medirAyuda,
  avisar: (t) => avisar(nodos.aviso, t)
});

const cortes = new Cortes(visor, {
  tipos: $('cortes-tipos'),
  controles: $('cortes-controles'),
  relleno: $('corte-relleno'),
  verPlano: $('corte-ver-plano'),
  avisar: (t) => avisar(nodos.aviso, t),
  alPedirCara: () => avisar(nodos.aviso, 'Toca una cara del modelo para cortar paralelo a ella.', 3500)
});

const estado = {
  elementos: new Map(),   // expressID → {clase, tipo, nombre, guid, planta}
  categorias: new Map(),  // etiqueta → {ids: [], visible}
  plantas: new Map(),     // idPlanta → {nombre, cota, visible, cuenta}
  sinPlanta: { visible: true, cuenta: 0 },
  ocultos: new Set(),
  transparentes: new Set(),   // elementos puestos en transparente uno a uno
  rayosX: false,              // todo transparente menos lo seleccionado
  grupos: null,               // propiedades del elemento seleccionado
  cargado: false,
  arListo: false,
  destinoPropiedades: 'panel'
};

/* ------------------------------------------------------------------ */
/* worker                                                              */
/* ------------------------------------------------------------------ */

function nuevoTrabajador() {
  if (trabajador) trabajador.terminate();
  trabajador = new Worker(new URL('./ifc-worker.js', import.meta.url), { type: 'module' });
  trabajador.onmessage = (ev) => recibir(ev.data);
  trabajador.onerror = (ev) => {
    fallo(ev.message || 'No se pudo iniciar el lector de IFC.');
  };
  return trabajador;
}

function recibir(m) {
  if (m.tipo === 'estado') {
    nodos.cargandoTexto.textContent = m.texto;
    nodos.progreso.style.width = `${m.porcentaje}%`;
  } else if (m.tipo === 'lote') {
    visor.anadirLote(m);
  } else if (m.tipo === 'listo') {
    terminarCarga(m);
  } else if (m.tipo === 'propiedades') {
    mostrarPropiedades(m);
  } else if (m.tipo === 'error') {
    fallo(m.mensaje);
  }
}

function fallo(mensaje) {
  nodos.cargando.hidden = true;
  nodos.portada.hidden = false;
  nodos.portadaTexto.textContent = `No se pudo abrir el modelo: ${mensaje}`;
}

/* ------------------------------------------------------------------ */
/* carga                                                               */
/* ------------------------------------------------------------------ */

async function cargar(datos, nombre, recordar) {
  nodos.portada.hidden = true;
  nodos.cargando.hidden = false;
  nodos.progreso.style.width = '0%';
  nodos.cargandoTexto.textContent = 'Preparando…';

  visor.vaciar();
  estado.elementos.clear();
  estado.categorias.clear();
  estado.plantas.clear();
  estado.ocultos.clear();
  estado.transparentes.clear();
  estado.rayosX = false;
  estado.sinPlanta = { visible: true, cuenta: 0 };
  estado.cargado = false;
  cerrarFicha();
  medidor.borrar();
  medidor.encender(false);
  nodos.titulo.textContent = nombre.replace(/\.ifc$/i, '');

  if (recordar) await guardarModelo(nombre, datos.slice(0));

  nuevoTrabajador().postMessage({ tipo: 'cargar', datos }, [datos]);
}

function terminarCarga(m) {
  for (const [id, tipo, nombre, guid] of m.elementos) {
    estado.elementos.set(id, { clase: nombreDeClase(tipo), tipo, nombre, guid, planta: undefined });
  }
  for (const [id, nombrePlanta, cota] of m.plantas.lista) {
    estado.plantas.set(id, { nombre: nombrePlanta, cota, visible: true, cuenta: 0 });
  }
  for (const [idElemento, idPlanta] of m.plantas.porElemento) {
    const e = estado.elementos.get(idElemento);
    const p = estado.plantas.get(idPlanta);
    if (e && p) { e.planta = idPlanta; p.cuenta++; }
  }
  for (const [id, e] of estado.elementos) {
    if (e.planta === undefined) estado.sinPlanta.cuenta++;
    let cat = estado.categorias.get(e.clase);
    if (!cat) estado.categorias.set(e.clase, (cat = { ids: [], visible: true }));
    cat.ids.push(id);
  }

  visor.asentar();
  visor.mostrarRejilla(nodos.verRejilla.checked);
  pintarFiltros();
  cortes.preparar();
  aplicar();
  if (nodos.verAristas.checked) ponerAristas(true);

  estado.cargado = true;
  nodos.cargando.hidden = true;
  for (const b of [nodos.botonPanel, nodos.encuadrar, nodos.medir, nodos.botonCortes, nodos.botonVista, nodos.todo]) {
    b.disabled = false;
  }
  nodos.ar.disabled = !estado.arListo;
  // El panel se queda cerrado: al terminar de cargar lo que interesa es ver
  // el modelo, no la lista de filtros tapándolo.
  nodos.panel.hidden = true;

  const total = estado.elementos.size;
  avisar(nodos.aviso, `${total.toLocaleString('es-ES')} elementos · ${m.esquema || 'IFC'}`, 3200);
}

/* ------------------------------------------------------------------ */
/* filtros de visibilidad                                              */
/* ------------------------------------------------------------------ */

function esVisible(id) {
  const e = estado.elementos.get(id);
  if (!e) return true;
  if (estado.ocultos.has(id)) return false;
  const cat = estado.categorias.get(e.clase);
  if (cat && !cat.visible) return false;
  if (e.planta === undefined) return estado.sinPlanta.visible;
  const p = estado.plantas.get(e.planta);
  return !p || p.visible;
}

function esTransparente(id) {
  if (estado.rayosX) return id !== visor.seleccion;
  if (estado.transparentes.has(id)) return true;
  const e = estado.elementos.get(id);
  const cat = e && estado.categorias.get(e.clase);
  return !!(cat && cat.transparente);
}

function aplicar() {
  visor.aplicarVisibilidad(esVisible, esTransparente);
  // Si el filtro ha ocultado lo seleccionado, el visor ya lo ha soltado.
  if (visor.seleccion === null) cerrarFicha();
  refrescarBotones();
  contarTransparentes();
}

function contarTransparentes() {
  const categorias = [...estado.categorias.values()].filter((c) => c.transparente).length;
  const partes = [
    estado.transparentes.size && `${estado.transparentes.size} ${estado.transparentes.size === 1 ? 'elemento' : 'elementos'}`,
    categorias && `${categorias} ${categorias === 1 ? 'categoría' : 'categorías'}`,
    estado.rayosX && 'rayos X'
  ].filter(Boolean);
  nodos.transparentesTexto.textContent = partes.length ? `En transparente: ${partes.join(', ')}` : '';
  nodos.quitarTransparencias.hidden = !partes.length;
}

function quitarTransparencias() {
  estado.transparentes.clear();
  estado.rayosX = false;
  for (const c of estado.categorias.values()) c.transparente = false;
  pintarFiltros();
  aplicar();
}

function pintarFiltros() {
  nodos.listaPlantas.textContent = '';
  const plantas = Array.from(estado.plantas).sort((a, b) => a[1].cota - b[1].cota);
  for (const [id, p] of plantas) {
    if (!p.cuenta) continue;
    nodos.listaPlantas.append(fila({
      etiqueta: p.nombre,
      cuenta: p.cuenta,
      marcada: p.visible,
      alCambiar: (v) => { p.visible = v; aplicar(); }
    }));
  }
  if (estado.sinPlanta.cuenta) {
    nodos.listaPlantas.append(fila({
      etiqueta: plantas.length ? 'Sin planta asignada' : 'Todo el modelo',
      cuenta: estado.sinPlanta.cuenta,
      marcada: estado.sinPlanta.visible,
      alCambiar: (v) => { estado.sinPlanta.visible = v; aplicar(); }
    }));
  }

  nodos.listaCategorias.textContent = '';
  const categorias = Array.from(estado.categorias).sort(
    (a, b) => b[1].ids.length - a[1].ids.length
  );
  for (const [etiqueta, cat] of categorias) {
    nodos.listaCategorias.append(fila({
      etiqueta,
      cuenta: cat.ids.length,
      marcada: cat.visible,
      alCambiar: (v) => { cat.visible = v; aplicar(); },
      transparente: cat.transparente,
      alTransparentar: (v) => { cat.transparente = v; pintarFiltros(); aplicar(); }
    }));
  }
}

function marcarTodas(cuales) {
  if (cuales === 'plantas') {
    for (const p of estado.plantas.values()) p.visible = true;
    estado.sinPlanta.visible = true;
  } else {
    for (const c of estado.categorias.values()) c.visible = true;
  }
  pintarFiltros();
  aplicar();
}

/* ------------------------------------------------------------------ */
/* selección                                                           */
/* ------------------------------------------------------------------ */

function seleccionar(id, opciones = {}) {
  visor.seleccionar(id ?? null);
  estado.grupos = null;
  if (estado.rayosX) {
    // Rayos X sigue al elemento seleccionado; sin selección, se apaga.
    if (id === null || id === undefined) estado.rayosX = false;
    aplicar();
  }
  refrescarBotones();
  if (id === null || id === undefined) {
    nodos.arFicha.hidden = true;
    cerrarFicha();
    nodos.filtroPropiedades.hidden = true;
    nodos.propiedades.replaceChildren(textoVacio('Toca un elemento del modelo para ver sus datos.'));
    return;
  }
  estado.destinoPropiedades = opciones.destino || 'panel';
  if (estado.destinoPropiedades !== 'ar') abrirFicha(id);
  nodos.propiedades.replaceChildren(textoVacio('Leyendo datos…'));
  if (trabajador) trabajador.postMessage({ tipo: 'propiedades', id });
}

function textoVacio(texto) {
  const p = document.createElement('p');
  p.className = 'vacio';
  p.textContent = texto;
  return p;
}

/* Medidas de la caja envolvente del elemento, en metros, con las cotas
   contadas desde la base del modelo. */
function medidasDe(id) {
  const caja = visor.cajaDeElemento(id);
  if (!caja || caja.isEmpty()) return null;
  return {
    x: caja.max.x - caja.min.x,
    z: caja.max.z - caja.min.z,
    alto: caja.max.y - caja.min.y,
    abajo: caja.min.y,
    arriba: caja.max.y
  };
}

function abrirFicha(id) {
  const e = estado.elementos.get(id);
  nodos.fichaClase.textContent = e ? e.clase : 'Elemento';
  nodos.fichaNombre.textContent = (e && e.nombre) || 'Sin nombre';
  pintarDatosFicha(id);
  nodos.ficha.hidden = false;
}

function pintarDatosFicha(id) {
  const e = estado.elementos.get(id);
  const planta = e && e.planta !== undefined && estado.plantas.get(e.planta);
  const m = medidasDe(id);
  const elemento = estado.grupos && estado.grupos.find((g) => g.titulo === 'Elemento');
  const dato = (clave) => elemento && (elemento.filas.find(([c]) => c === clave) || [])[1];
  nodos.fichaDatos.textContent = [
    dato('Tipo de objeto'),
    planta && planta.nombre,
    m && `${metros(Math.max(m.x, m.z))} × ${metros(Math.min(m.x, m.z))} × alto ${metros(m.alto)}`
  ].filter(Boolean).join(' · ');
}

function cerrarFicha() {
  nodos.ficha.hidden = true;
}

function mostrarPropiedades(m) {
  if (m.id !== visor.seleccion) return;
  const grupos = m.grupos.slice();
  const e = estado.elementos.get(m.id);
  const planta = e && e.planta !== undefined && estado.plantas.get(e.planta);
  if (planta && grupos[0] && grupos[0].titulo === 'Elemento') {
    grupos[0] = { ...grupos[0], filas: grupos[0].filas.concat([['Planta', planta.nombre]]) };
  }
  const md = medidasDe(m.id);
  if (md) {
    grupos.splice(grupos[0] && grupos[0].titulo === 'Elemento' ? 1 : 0, 0, {
      titulo: 'Medidas (caja envolvente)',
      filas: [
        ['Largo en X', metros(md.x)],
        ['Largo en Z', metros(md.z)],
        ['Alto', metros(md.alto)],
        ['Cota inferior', metros(md.abajo)],
        ['Cota superior', metros(md.arriba)]
      ]
    });
  }
  estado.grupos = grupos;
  nodos.filtroPropiedades.hidden = false;
  pintarListaPropiedades();
  if (!nodos.ficha.hidden) pintarDatosFicha(m.id);
  if (estado.destinoPropiedades === 'ar') {
    nodos.arFicha.innerHTML = resumenAR(m.grupos);
    nodos.arFicha.hidden = false;
  }
}

function pintarListaPropiedades() {
  if (!estado.grupos) return;
  pintarPropiedades(nodos.propiedades, estado.grupos, {
    filtro: nodos.filtroPropiedades.value,
    alCopiar: async (valor) => {
      try {
        await navigator.clipboard.writeText(valor);
        avisar(nodos.aviso, 'Copiado.');
      } catch (e) { /* sin portapapeles */ }
    }
  });
}

nodos.filtroPropiedades.addEventListener('input', pintarListaPropiedades);

function refrescarBotones() {
  const hay = visor.seleccion !== null && visor.seleccion !== undefined;
  nodos.aislar.classList.toggle('activo', visor.aislado);
  nodos.rayos.classList.toggle('activo', estado.rayosX);
  nodos.transparentar.classList.toggle('activo', hay && estado.transparentes.has(visor.seleccion));
  nodos.transparentar.textContent = hay && estado.transparentes.has(visor.seleccion) ? 'Opaco' : 'Transparentar';
}

/* toque sobre el lienzo: distinguimos un toque de un giro de cámara */
let pulsacion = null;
nodos.lienzo.addEventListener('pointerdown', (ev) => {
  pulsacion = { x: ev.clientX, y: ev.clientY, t: Date.now() };
});
nodos.lienzo.addEventListener('pointerup', (ev) => {
  if (!pulsacion || !estado.cargado) { pulsacion = null; return; }
  const movido = Math.hypot(ev.clientX - pulsacion.x, ev.clientY - pulsacion.y);
  const rapido = Date.now() - pulsacion.t < 600;
  pulsacion = null;
  if (movido > 10 || !rapido) return;

  const caja = nodos.lienzo.getBoundingClientRect();
  const x = ((ev.clientX - caja.left) / caja.width) * 2 - 1;
  const y = -((ev.clientY - caja.top) / caja.height) * 2 + 1;
  if (medidor.activo) {
    medidor.tocar(x, y, ev.clientX - caja.left, ev.clientY - caja.top);
    return;
  }
  const golpe = visor.apuntar(x, y);
  if (cortes.esperandoCara) {
    cortes.tocar(golpe);
    return;
  }
  seleccionar(golpe ? golpe.id : null);
});

/* ------------------------------------------------------------------ */
/* buscador                                                            */
/* ------------------------------------------------------------------ */

let temporizadorBusqueda = 0;
nodos.buscar.addEventListener('input', () => {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(buscar, 180);
});

function buscar() {
  const texto = nodos.buscar.value.trim().toLowerCase();
  nodos.resultados.textContent = '';
  if (texto.length < 2) return;

  let encontrados = 0;
  for (const [id, e] of estado.elementos) {
    if (encontrados >= 60) break;
    const saco = `${e.nombre} ${e.clase} ${e.tipo} ${e.guid}`.toLowerCase();
    if (!saco.includes(texto)) continue;
    encontrados++;
    nodos.resultados.append(filaResultado({
      etiqueta: e.nombre || `${e.clase} ${id}`,
      detalle: e.clase,
      alTocar: () => {
        seleccionar(id, { callado: true });
        visor.encuadrar(id);
      }
    }));
  }
  if (!encontrados) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = 'Nada con ese nombre.';
    nodos.resultados.append(p);
  }
}

/* ------------------------------------------------------------------ */
/* botones                                                             */
/* ------------------------------------------------------------------ */

function abrirArchivo() { nodos.entrada.click(); }
nodos.abrir.addEventListener('click', abrirArchivo);
nodos.abrir2.addEventListener('click', abrirArchivo);

nodos.entrada.addEventListener('change', async () => {
  const archivo = nodos.entrada.files && nodos.entrada.files[0];
  if (!archivo) return;
  const datos = await archivo.arrayBuffer();
  nodos.entrada.value = '';
  cargar(datos, archivo.name, true);
});

nodos.ejemplo.addEventListener('click', async () => {
  try {
    const respuesta = await fetch('./ejemplo.ifc');
    if (!respuesta.ok) throw new Error('no está en el servidor');
    cargar(await respuesta.arrayBuffer(), 'ejemplo.ifc', true);
  } catch (e) {
    avisar(nodos.aviso, `No se pudo abrir el ejemplo: ${e.message || e}`, 4000);
  }
});

addEventListener('dragover', (ev) => ev.preventDefault());
addEventListener('drop', async (ev) => {
  ev.preventDefault();
  const archivo = ev.dataTransfer && ev.dataTransfer.files[0];
  if (archivo && /\.ifc$/i.test(archivo.name)) {
    cargar(await archivo.arrayBuffer(), archivo.name, true);
  }
});

/* Cortes y Vista abren el panel más bajo: se ajustan mirando el modelo. */
const HOJAS_BAJAS = ['hoja-cortes', 'hoja-vista'];

function hojaActiva() {
  const p = document.querySelector('.pestana.activa');
  return p && p.dataset.hoja;
}

function abrirHoja(id) {
  for (const p of document.querySelectorAll('.pestana[data-hoja]')) {
    p.classList.toggle('activa', p.dataset.hoja === id);
    if (p.dataset.hoja === id) p.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  for (const h of document.querySelectorAll('.hoja')) {
    h.classList.toggle('activa', h.id === id);
  }
  nodos.panel.classList.toggle('panel-bajo', HOJAS_BAJAS.includes(id));
  nodos.panel.hidden = false;
  if (medidor.activo) medidor.encender(false);
  nodos.medir.classList.remove('activo');
  marcarBarra();
}

/* El botón de la barra de la hoja abierta se ve encendido; si se vuelve
   a tocar, cierra el panel. */
function alternarHoja(id) {
  if (!nodos.panel.hidden && hojaActiva() === id) cerrarPanel();
  else abrirHoja(id);
}

function cerrarPanel() {
  nodos.panel.hidden = true;
  marcarBarra();
}

function marcarBarra() {
  const abierta = !nodos.panel.hidden && hojaActiva();
  nodos.botonCortes.classList.toggle('activo', abierta === 'hoja-cortes' || cortes.activo);
  nodos.botonVista.classList.toggle('activo', abierta === 'hoja-vista');
  nodos.botonPanel.classList.toggle('activo', !!abierta && !HOJAS_BAJAS.includes(abierta));
}

nodos.botonPanel.addEventListener('click', () => {
  const hoja = hojaActiva();
  alternarHoja(hoja && !HOJAS_BAJAS.includes(hoja) ? hoja : 'hoja-filtros');
});
nodos.cerrarPanel.addEventListener('click', cerrarPanel);
nodos.botonCortes.addEventListener('click', () => alternarHoja('hoja-cortes'));
nodos.botonVista.addEventListener('click', () => alternarHoja('hoja-vista'));

for (const pestana of document.querySelectorAll('.pestana[data-hoja]')) {
  pestana.addEventListener('click', () => abrirHoja(pestana.dataset.hoja));
}

for (const boton of document.querySelectorAll('[data-todo]')) {
  boton.addEventListener('click', () => marcarTodas(boton.dataset.todo));
}

nodos.encuadrar.addEventListener('click', () => {
  visor.encuadrar(visor.seleccion ?? undefined);
});

nodos.aislar.addEventListener('click', () => {
  visor.aislar(!visor.aislado);
  refrescarBotones();
});

nodos.ocultar.addEventListener('click', () => {
  if (visor.seleccion === null) return;
  estado.ocultos.add(visor.seleccion);
  if (visor.aislado) visor.aislar(false);
  seleccionar(null);
  aplicar();
});

nodos.transparentar.addEventListener('click', () => {
  const id = visor.seleccion;
  if (id === null) return;
  if (estado.transparentes.has(id)) {
    estado.transparentes.delete(id);
  } else {
    // Se ve en transparente al soltarlo; mientras sigue seleccionado, resaltado.
    estado.transparentes.add(id);
    avisar(nodos.aviso, 'En transparente. Se puede tocar lo que hay detrás.');
  }
  aplicar();
});

nodos.rayos.addEventListener('click', () => {
  if (visor.seleccion === null) return;
  estado.rayosX = !estado.rayosX;
  aplicar();
});

nodos.verPropiedades.addEventListener('click', () => abrirHoja('hoja-propiedades'));
nodos.fichaCerrar.addEventListener('click', () => seleccionar(null));

nodos.todo.addEventListener('click', () => {
  estado.ocultos.clear();
  for (const p of estado.plantas.values()) p.visible = true;
  estado.sinPlanta.visible = true;
  for (const c of estado.categorias.values()) { c.visible = true; c.transparente = false; }
  estado.transparentes.clear();
  estado.rayosX = false;
  if (visor.aislado) visor.aislar(false);
  cortes.quitar();
  marcarBarra();
  pintarFiltros();
  aplicar();
});

nodos.quitarTransparencias.addEventListener('click', quitarTransparencias);

/* ------------------------------------------------------------------ */
/* medir                                                               */
/* ------------------------------------------------------------------ */

nodos.medir.addEventListener('click', () => {
  const encender = !medidor.activo;
  if (encender) {
    cerrarPanel();
    seleccionar(null);
  }
  medidor.encender(encender);
  nodos.medir.classList.toggle('activo', encender);
});

nodos.barraMedir.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.medir) medidor.ponerModo(b.dataset.medir);
  else if (b.dataset.accion === 'cerrar') medidor.cerrarArea();
  else if (b.dataset.accion === 'deshacer') medidor.deshacer();
  else if (b.dataset.accion === 'borrar') medidor.borrar();
  else if (b.dataset.accion === 'listo') {
    medidor.encender(false);
    nodos.medir.classList.remove('activo');
  }
});

/* ------------------------------------------------------------------ */
/* vista: fondo, transparencia, luz, aristas, rejilla, vistas rápidas  */
/* ------------------------------------------------------------------ */

const AJUSTES = 'crd-visor-ajustes';

function leerAjustes() {
  try {
    return JSON.parse(localStorage.getItem(AJUSTES)) || {};
  } catch (e) {
    return {};
  }
}

function guardarAjustes(cambios) {
  try {
    localStorage.setItem(AJUSTES, JSON.stringify({ ...leerAjustes(), ...cambios }));
  } catch (e) { /* sin almacenamiento: se pierde al cerrar */ }
}

function pintarFondos() {
  nodos.fondos.replaceChildren(...Object.entries(FONDOS).map(([clave, f]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clave === visor.fondo ? 'fondo activo' : 'fondo';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(clave === visor.fondo));
    const muestra = document.createElement('span');
    muestra.className = 'fondo-muestra';
    muestra.style.background = f.degradado ? `linear-gradient(${f.degradado[0]}, ${f.degradado[1]})` : f.color;
    const nombre = document.createElement('span');
    nombre.textContent = f.nombre;
    b.append(muestra, nombre);
    b.addEventListener('click', () => {
      visor.ponerFondo(clave);
      guardarAjustes({ fondo: clave });
      pintarFondos();
    });
    return b;
  }));
}

async function ponerAristas(si) {
  if (si && !visor.aristas && estado.cargado) avisar(nodos.aviso, 'Calculando aristas…', 60000);
  await visor.mostrarAristas(si);
  if (si && nodos.aviso.textContent.startsWith('Calculando')) nodos.aviso.hidden = true;
}

nodos.transparencia.addEventListener('input', () => {
  const v = Number(nodos.transparencia.value);
  visor.ponerOpacidad(1 - v / 100);
  nodos.transparenciaTexto.textContent = v ? `${v} %` : 'Opaco';
});

nodos.luz.addEventListener('input', () => {
  const v = Number(nodos.luz.value);
  visor.render.toneMappingExposure = v / 100;
  nodos.luzTexto.textContent = `${v} %`;
  guardarAjustes({ luz: v });
});

nodos.verAristas.addEventListener('change', () => {
  ponerAristas(nodos.verAristas.checked);
  guardarAjustes({ aristas: nodos.verAristas.checked });
});

nodos.verRejilla.addEventListener('change', () => {
  visor.mostrarRejilla(nodos.verRejilla.checked);
  guardarAjustes({ rejilla: nodos.verRejilla.checked });
});

for (const b of document.querySelectorAll('[data-vista]')) {
  b.addEventListener('click', () => visor.vista(b.dataset.vista));
}

function aplicarAjustes() {
  const a = leerAjustes();
  if (a.fondo && FONDOS[a.fondo]) visor.ponerFondo(a.fondo);
  if (a.luz) nodos.luz.value = String(a.luz);
  visor.render.toneMappingExposure = Number(nodos.luz.value) / 100;
  nodos.luzTexto.textContent = `${nodos.luz.value} %`;
  nodos.verAristas.checked = !!a.aristas;
  nodos.verRejilla.checked = a.rejilla !== false;
  pintarFondos();
}

aplicarAjustes();

/* ------------------------------------------------------------------ */
/* realidad aumentada                                                  */
/* ------------------------------------------------------------------ */

async function prepararAR() {
  const disponible = await arDisponible();
  if (!disponible) {
    nodos.estadoAR.textContent =
      'Este equipo no ofrece realidad aumentada. El resto del visor funciona igual.';
    nodos.ar.disabled = true;
    nodos.ar.title = 'Realidad aumentada no disponible en este navegador';
    return;
  }
  nodos.estadoAR.textContent = 'Realidad aumentada disponible en este equipo.';
  estado.arListo = true;
  if (estado.cargado) nodos.ar.disabled = false;

  ar = new RealidadAumentada(visor, {
    capa: nodos.capaAR,
    mensaje: nodos.arMensaje,
    ficha: nodos.arFicha,
    alSeleccionar: (id) => seleccionar(id, { destino: 'ar', callado: true })
  });
  ar.alTerminar = () => {
    nodos.ar.disabled = !estado.cargado;
    cortes.ocultarAyudas(false);
  };

  nodos.ar.addEventListener('click', async () => {
    if (!estado.cargado) {
      avisar(nodos.aviso, 'Abre primero un modelo IFC.');
      return;
    }
    try {
      nodos.ar.disabled = true;
      cerrarPanel();
      cerrarFicha();
      if (medidor.activo) { medidor.encender(false); nodos.medir.classList.remove('activo'); }
      cortes.ocultarAyudas(true);
      await ar.iniciar();
    } catch (e) {
      cortes.ocultarAyudas(false);
      nodos.ar.disabled = false;
      avisar(nodos.aviso, `No se pudo abrir la cámara: ${e.message || e}`, 4000);
    }
  });

  nodos.arSalir.addEventListener('click', () => ar.terminar());
  nodos.arRecolocar.addEventListener('click', () => ar.recolocar());
  $('ar-girar-izq').addEventListener('click', () => ar.girar(-Math.PI / 12));
  $('ar-girar-der').addEventListener('click', () => ar.girar(Math.PI / 12));
  $('ar-subir').addEventListener('click', () => ar.subir(0.1));
  $('ar-bajar').addEventListener('click', () => ar.subir(-0.1));

  for (const boton of document.querySelectorAll('.ar-escala')) {
    boton.addEventListener('click', () => {
      for (const b of document.querySelectorAll('.ar-escala')) {
        b.classList.toggle('activa', b === boton);
      }
      ar.ponerEscala(Number(boton.dataset.escala));
    });
  }
}

/* ------------------------------------------------------------------ */
/* arranque                                                            */
/* ------------------------------------------------------------------ */

async function arrancar() {
  prepararAR();

  const guardado = await leerModelo();
  if (guardado && guardado.datos) {
    nodos.portadaTexto.textContent = `Abriendo ${guardado.nombre}…`;
    cargar(guardado.datos, guardado.nombre, false);
    return;
  }

  // Un modelo incluido en la propia app (útil para el APK de Capacitor).
  try {
    const respuesta = await fetch('./modelo.ifc');
    if (respuesta.ok) {
      cargar(await respuesta.arrayBuffer(), 'modelo.ifc', false);
    }
  } catch (e) { /* no hay modelo incluido: se abre desde el teléfono */ }
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

arrancar();
