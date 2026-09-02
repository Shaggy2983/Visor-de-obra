/* Arranque y cableado de la aplicación. */

import { Visor } from './visor.js';
import { arDisponible, RealidadAumentada } from './ar.js';
import { guardarModelo, leerModelo } from './almacen.js';
import {
  nombreDeClase, fila, filaResultado, pintarPropiedades, resumenAR, avisar
} from './interfaz.js';

const $ = (id) => document.getElementById(id);

const nodos = {
  lienzo: $('lienzo'),
  titulo: document.querySelector('.titulo'),
  abrir: $('btn-abrir'),
  abrir2: $('btn-abrir-2'),
  ejemplo: $('btn-ejemplo'),
  entrada: $('entrada-ifc'),
  ar: $('btn-ar'),
  panel: $('panel'),
  botonPanel: $('btn-panel'),
  cerrarPanel: $('btn-cerrar-panel'),
  encuadrar: $('btn-encuadrar'),
  aislar: $('btn-aislar'),
  ocultar: $('btn-ocultar'),
  todo: $('btn-todo'),
  listaPlantas: $('lista-plantas'),
  listaCategorias: $('lista-categorias'),
  corte: $('corte'),
  corteTexto: $('corte-texto'),
  corteApagar: $('btn-corte-apagar'),
  buscar: $('entrada-buscar'),
  resultados: $('resultados'),
  propiedades: $('propiedades'),
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

const estado = {
  elementos: new Map(),   // expressID → {clase, tipo, nombre, guid, planta}
  categorias: new Map(),  // etiqueta → {ids: [], visible}
  plantas: new Map(),     // idPlanta → {nombre, cota, visible, cuenta}
  sinPlanta: { visible: true, cuenta: 0 },
  ocultos: new Set(),
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
  estado.sinPlanta = { visible: true, cuenta: 0 };
  estado.cargado = false;
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

  const medidas = visor.asentar();
  pintarFiltros();
  prepararCorte(medidas.alto);

  estado.cargado = true;
  nodos.cargando.hidden = true;
  for (const b of [nodos.botonPanel, nodos.encuadrar, nodos.todo]) b.disabled = false;
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

function aplicar() {
  visor.aplicarVisibilidad(esVisible);
  refrescarBotones();
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
      alCambiar: (v) => { cat.visible = v; aplicar(); }
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
/* corte horizontal                                                    */
/* ------------------------------------------------------------------ */

function prepararCorte(alto) {
  nodos.corte.value = nodos.corte.max;
  nodos.corteTexto.textContent = 'Sin corte';
  visor.cortar(null);
  nodos.corte.oninput = () => {
    const t = Number(nodos.corte.value) / Number(nodos.corte.max);
    if (t >= 1) {
      visor.cortar(null);
      nodos.corteTexto.textContent = 'Sin corte';
      return;
    }
    const altura = t * alto;
    visor.cortar(altura);
    nodos.corteTexto.textContent = `Se ve por debajo de ${altura.toFixed(2)} m`;
  };
}

/* ------------------------------------------------------------------ */
/* selección                                                           */
/* ------------------------------------------------------------------ */

function seleccionar(id, opciones = {}) {
  visor.seleccionar(id ?? null);
  refrescarBotones();
  if (id === null || id === undefined) {
    nodos.arFicha.hidden = true;
    return;
  }
  const e = estado.elementos.get(id);
  if (e && !opciones.callado) {
    avisar(nodos.aviso, `${e.clase} · ${e.nombre || 'sin nombre'}`);
  }
  estado.destinoPropiedades = opciones.destino || 'panel';
  nodos.propiedades.textContent = '';
  const cargando = document.createElement('p');
  cargando.className = 'vacio';
  cargando.textContent = 'Leyendo datos…';
  nodos.propiedades.append(cargando);
  if (trabajador) trabajador.postMessage({ tipo: 'propiedades', id });
}

function mostrarPropiedades(m) {
  if (m.id !== visor.seleccion) return;
  pintarPropiedades(nodos.propiedades, m.grupos);
  if (estado.destinoPropiedades === 'ar') {
    nodos.arFicha.innerHTML = resumenAR(m.grupos);
    nodos.arFicha.hidden = false;
  }
}

function refrescarBotones() {
  const hay = visor.seleccion !== null && visor.seleccion !== undefined;
  nodos.aislar.disabled = !hay;
  nodos.ocultar.disabled = !hay;
  nodos.aislar.classList.toggle('activo', visor.aislado);
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
  const golpe = visor.apuntar(x, y);
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

nodos.botonPanel.addEventListener('click', () => {
  nodos.panel.hidden = !nodos.panel.hidden;
});
nodos.cerrarPanel.addEventListener('click', () => { nodos.panel.hidden = true; });

for (const pestana of document.querySelectorAll('.pestana[data-hoja]')) {
  pestana.addEventListener('click', () => {
    for (const p of document.querySelectorAll('.pestana[data-hoja]')) {
      p.classList.toggle('activa', p === pestana);
    }
    for (const h of document.querySelectorAll('.hoja')) {
      h.classList.toggle('activa', h.id === pestana.dataset.hoja);
    }
  });
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

nodos.todo.addEventListener('click', () => {
  estado.ocultos.clear();
  for (const p of estado.plantas.values()) p.visible = true;
  estado.sinPlanta.visible = true;
  for (const c of estado.categorias.values()) c.visible = true;
  if (visor.aislado) visor.aislar(false);
  pintarFiltros();
  aplicar();
  nodos.corte.value = nodos.corte.max;
  nodos.corte.dispatchEvent(new Event('input'));
});

nodos.corteApagar.addEventListener('click', () => {
  nodos.corte.value = nodos.corte.max;
  nodos.corte.dispatchEvent(new Event('input'));
});

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
  ar.alTerminar = () => { nodos.ar.disabled = !estado.cargado; };

  nodos.ar.addEventListener('click', async () => {
    if (!estado.cargado) {
      avisar(nodos.aviso, 'Abre primero un modelo IFC.');
      return;
    }
    try {
      nodos.ar.disabled = true;
      nodos.panel.hidden = true;
      await ar.iniciar();
    } catch (e) {
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
