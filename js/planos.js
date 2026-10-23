/* Planos de la visita: cargar un plano (PDF o imagen), verlo con zoom y
   desplazamiento con los dedos, dibujar a mano alzada encima y clavar en
   él notas numeradas con sus fotos, tonos de pintura y enlaces. El plano se guarda una vez por obra; las notas son de cada
   visita y sus coordenadas van en fracción del plano (0–1), así no
   dependen de la resolución con que se cargó. */

import { el, nuevoId, ahora, reducirImagen, decodificar, enlaceSeguro } from './utiles.js';
import { esDxf, leerDxf, dxfAImagen } from './dxf.js';
import {
  ESCALAS, TIPOS_MEDIDA, textoMedida, formatoMedida, puntoEtiqueta, pintarMedidas, enPx, longitud
} from './medir-plano.js';

export const TIPOS_NOTA = {
  observacion: 'Observación',
  incidencia: 'Incidencia',
  avance: 'Avance'
};

/* Color de cada tipo en los informes (en pantalla lo pone el CSS). */
export const COLOR_NOTA = {
  observacion: '#3d7cc4',
  incidencia: '#d64545',
  avance: '#2f9e6a'
};

/* Colores del rotulador. */
export const COLORES_TRAZO = {
  rojo: '#d64545',
  azul: '#3d7cc4',
  verde: '#2f9e6a',
  amarillo: '#e6b422',
  negro: '#121826'
};

/* Grosor del trazo en fracción del lado mayor del plano: así se ve igual
   en pantalla, en el PDF y en el informe, sea cual sea la resolución. */
export const GROSORES = { fino: 0.0015, medio: 0.003, grueso: 0.006 };

export const ACABADOS = ['Mate', 'Satinado', 'Semibrillo', 'Brillo'];

/* Los puntos de un trazo, en píxeles de un plano de ancho × alto. */
export function puntosTrazo(trazo, ancho, alto) {
  return trazo.puntos.map(([x, y]) => `${(x * ancho).toFixed(1)},${(y * alto).toFixed(1)}`).join(' ');
}

export function grosorTrazo(trazo, ancho, alto) {
  return (GROSORES[trazo.grosor] || GROSORES.medio) * Math.max(ancho, alto);
}

const LADO_PLANO = 4096;          // lado mayor del plano guardado, en píxeles
const AREA_MAXIMA = 16e6;         // los móviles no pintan lienzos mayores
const CALIDAD_PLANO = 0.88;
const MAX_PAGINAS = 30;

/* ------------------------------------------------------------------ */
/* carga                                                               */
/* ------------------------------------------------------------------ */

function nombreBase(archivo) {
  return (archivo.name || 'Plano').replace(/\.[^.]+$/, '');
}

async function paginasDePdf(archivo, alProgreso) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const documento = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
  let total = documento.numPages;
  if (total > 1 && !confirm(`El PDF tiene ${total} páginas. Se cargará cada una como un plano${total > MAX_PAGINAS ? ` (sólo las ${MAX_PAGINAS} primeras)` : ''}. ¿Seguir?`)) {
    total = 1;
  }
  total = Math.min(total, MAX_PAGINAS);
  const salida = [];
  for (let n = 1; n <= total; n++) {
    alProgreso(`Leyendo página ${n} de ${total}…`);
    const pagina = await documento.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    let escala = LADO_PLANO / Math.max(base.width, base.height);
    escala = Math.min(escala, Math.sqrt(AREA_MAXIMA / (base.width * base.height)));
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(vista.width);
    lienzo.height = Math.floor(vista.height);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
    const imagen = await reducirImagen(lienzo, LADO_PLANO, CALIDAD_PLANO);
    // Milímetros de papel por píxel: con la escala del plano (1:100…) se mide.
    const papelMmPorPx = (base.width * 25.4 / 72) / imagen.ancho;
    salida.push({ ...imagen, papelMmPorPx, nombre: total > 1 ? `${nombreBase(archivo)} · p. ${n}` : nombreBase(archivo) });
    lienzo.width = lienzo.height = 0;
    pagina.cleanup();
  }
  await documento.destroy();
  return salida;
}

/* Devuelve los planos listos para guardar (uno por página si es un PDF). */
export async function leerArchivoPlano(archivo, obra, alProgreso = () => {}) {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
  let imagenes;
  if (esDxf(archivo)) {
    alProgreso('Leyendo el DXF…');
    const geom = await leerDxf(archivo);
    alProgreso('Dibujando el plano…');
    const imagen = await dxfAImagen(geom, LADO_PLANO, AREA_MAXIMA);
    imagenes = [{ ...imagen, nombre: nombreBase(archivo), escalaTexto: `DXF en ${geom.unidades}${geom.unidadesDeclaradas ? '' : ' (supuestas)'}` }];
  } else {
    imagenes = esPdf
      ? await paginasDePdf(archivo, alProgreso)
      : [{ ...(await reducirImagen(archivo, LADO_PLANO, CALIDAD_PLANO)), nombre: nombreBase(archivo) }];
  }
  return imagenes.map((i) => ({
    id: nuevoId(),
    nombre: i.nombre,
    obra: obra || '',
    blob: i.blob,
    ancho: i.ancho,
    alto: i.alto,
    ...(i.mPorPx ? { mPorPx: i.mPorPx, escalaTexto: i.escalaTexto } : {}),
    ...(i.papelMmPorPx ? { papelMmPorPx: i.papelMmPorPx } : {}),
    creado: Date.now()
  }));
}

/* ------------------------------------------------------------------ */
/* plano con sus notas pintadas, para el informe                       */
/* ------------------------------------------------------------------ */

/* Color de los repasos en el plano según su estado (los de la pantalla
   salen de css/visita.css con los mismos tonos). */
export const COLOR_REPASO = { pendiente: '#c0392b', corregido: '#c0601a', cerrado: '#2e7d4f' };

export async function componerPlano(plano, notas, trazos = [], lado = 2400, medidas = [], repasos = []) {
  const imagen = await decodificar(plano.blob);
  const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  if (imagen.close) imagen.close();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of trazos) {
    ctx.strokeStyle = COLORES_TRAZO[t.color] || t.color;
    ctx.lineWidth = grosorTrazo(t, lienzo.width, lienzo.height);
    ctx.beginPath();
    t.puntos.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x * lienzo.width, y * lienzo.height));
    ctx.stroke();
  }
  pintarMedidas(ctx, plano, medidas, lienzo.width, lienzo.height);
  const radio = Math.max(16, Math.max(lienzo.width, lienzo.height) * 0.017);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(radio * 1.05)}px Inter, system-ui, sans-serif`;
  for (const n of notas) {
    const x = n.x * lienzo.width, y = n.y * lienzo.height;
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_NOTA[n.tipo] || COLOR_NOTA.observacion;
    ctx.fill();
    ctx.lineWidth = radio * 0.22;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n.numero), x, y + radio * 0.05);
  }
  // Repasos del punch list: cuadrados «R3», del color de su estado.
  ctx.font = `700 ${Math.round(radio * 0.85)}px Inter, system-ui, sans-serif`;
  for (const r of repasos) {
    const x = r.x * lienzo.width, y = r.y * lienzo.height, l = radio * 1.15;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - l, y - l, l * 2, l * 2, l * 0.3) : ctx.rect(x - l, y - l, l * 2, l * 2);
    ctx.fillStyle = COLOR_REPASO[r.estado] || COLOR_REPASO.pendiente;
    ctx.fill();
    ctx.lineWidth = radio * 0.22;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(`R${r.numero}`, x, y + radio * 0.05);
  }
  return new Promise((cumplir) => lienzo.toBlob(cumplir, 'image/jpeg', 0.88));
}

/* ------------------------------------------------------------------ */
/* visor a pantalla completa                                           */
/* ------------------------------------------------------------------ */

/* opciones:
     visita()                  la visita abierta
     cambiado()                avisar de que hay que guardar
     anadirFotos(archivos, id) guardar fotos nuevas ligadas a la nota id
     ampliar(url)              ver una foto en grande
     alCerrar()                el usuario pide salir del plano
     guardarPlano(plano)       guardar el plano (su escala, al calibrar)
     repasos(planoId)          repasos situados en ese plano [{id, numero, x, y, estado}]
     alUbicar(r, planoId, x, y) el usuario ha situado el repaso r
     alTocarRepaso(id)         el usuario toca un repaso en el plano */
export function crearVisorPlano(opciones) {
  const $ = (id) => document.getElementById(id);
  const n = {
    capa: $('plano-capa'),
    nombre: $('plano-nombre'),
    cerrar: $('plano-cerrar'),
    modo: $('plano-modo'),
    dibujar: $('plano-dibujar'),
    medir: $('plano-medir'),
    medirHerr: $('plano-medir-herr'),
    medidas: $('plano-medidas'),
    etiquetas: $('plano-etiquetas'),
    herramientas: $('plano-herramientas'),
    trazos: $('plano-trazos'),
    ayuda: $('plano-ayuda'),
    marco: $('plano-marco'),
    lienzo: $('plano-lienzo'),
    img: $('plano-img'),
    pines: $('plano-pines'),
    hoja: $('nota-hoja')
  };

  let plano = null;
  let urlPlano = null;
  let urlsHoja = [];
  let seleccionada = null;   // id de la nota abierta en la hoja
  let modo = 'ver';          // 'ver' | 'anadir' | 'mover' | 'ubicar' | 'dibujar' | 'medir' | 'calibrar'
  let repasoUbicar = null;   // repaso que se está situando en el plano
  let tipoMedida = 'distancia';
  let enCurso = [];          // puntos de la medida que se está tomando (0–1)
  let arrastre = null;       // índice del punto de la medida en curso que se arrastra
  const vista = { escala: 1, tx: 0, ty: 0, minimo: 0.1, maximo: 4 };
  const pluma = { color: 'rojo', grosor: 'medio', goma: false };
  let trazo = null;          // el trazo que se está dibujando: {datos, nodo}

  const visita = () => opciones.visita();
  const trazosDelPlano = () => visita().trazos.filter((t) => t.plano === plano.id);
  const notasDelPlano = () => visita().notas.filter((x) => x.plano === plano.id);
  const medidasDelPlano = () => (visita().medidas || []).filter((x) => x.plano === plano.id);
  const nota = (id) => visita().notas.find((x) => x.id === id);

  /* --- transformaciones --- */

  function aplicar() {
    n.lienzo.style.transform = `translate(${vista.tx}px, ${vista.ty}px) scale(${vista.escala})`;
    n.lienzo.style.setProperty('--inversa', String(1 / vista.escala));
  }

  function encuadrar() {
    const r = n.marco.getBoundingClientRect();
    const ajuste = Math.min(r.width / plano.ancho, r.height / plano.alto);
    vista.minimo = ajuste * 0.8;
    vista.maximo = Math.max(ajuste * 4, 3);
    vista.escala = ajuste;
    vista.tx = (r.width - plano.ancho * ajuste) / 2;
    vista.ty = (r.height - plano.alto * ajuste) / 2;
    aplicar();
  }

  /* Zoom manteniendo fijo el punto (cx, cy) de la pantalla. */
  function zoom(factor, cx, cy) {
    const nueva = Math.min(vista.maximo, Math.max(vista.minimo, vista.escala * factor));
    const px = (cx - vista.tx) / vista.escala, py = (cy - vista.ty) / vista.escala;
    vista.escala = nueva;
    vista.tx = cx - px * nueva;
    vista.ty = cy - py * nueva;
    aplicar();
  }

  function centrarEn(x, y) {
    const r = n.marco.getBoundingClientRect();
    vista.escala = Math.max(vista.escala, Math.min(vista.maximo, vista.minimo / 0.8 * 2.5));
    vista.tx = r.width / 2 - x * plano.ancho * vista.escala;
    vista.ty = r.height * 0.35 - y * plano.alto * vista.escala;
    aplicar();
  }

  /* --- gestos: un dedo arrastra, dos dedos acercan, un toque señala --- */

  const punteros = new Map();
  let gesto = null;

  function local(ev) {
    const r = n.marco.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function datosPinza() {
    const [a, b] = [...punteros.values()];
    return { distancia: Math.hypot(a.x - b.x, a.y - b.y), centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  // Sin esto el navegador toma el arrastre por una selección o por arrastrar
  // la imagen y cancela el gesto a medias (pointercancel).
  n.marco.addEventListener('dragstart', (ev) => ev.preventDefault());

  n.marco.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') ev.preventDefault();
    n.marco.setPointerCapture(ev.pointerId);
    const p = local(ev);
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1) {
      gesto = { inicio: p, ultimo: p, tiempo: performance.now(), movido: false, pin: ev.target.closest('.pin') };
      if ((modo === 'medir' || modo === 'calibrar') && enCurso.length) {
        arrastre = puntoCerca(p);
        if (arrastre != null) gesto.movido = true;
      }
      if (modo === 'dibujar') {
        gesto.movido = true;   // en modo dibujo un toque no es un toque
        if (pluma.goma) borrarEn(p);
        else empezarTrazo(p);
      }
    } else if (punteros.size === 2) {
      // El segundo dedo convierte el gesto en pellizco: el trazo a medias se descarta.
      descartarTrazo();
      arrastre = null;
      gesto.movido = true;
      const d = datosPinza();
      gesto.pinza = { ...d, escala: vista.escala, tx: vista.tx, ty: vista.ty };
    }
  });

  n.marco.addEventListener('pointermove', (ev) => {
    if (!punteros.has(ev.pointerId) || !gesto) return;
    const p = local(ev);
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1 && arrastre != null) {
      const [x, y] = aPlano(p);
      enCurso[arrastre] = [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
      pintarMedidas2();
    } else if (punteros.size === 1 && modo === 'dibujar' && !gesto.pinzado) {
      if (pluma.goma) borrarEn(p);
      else seguirTrazo(p);
    } else if (punteros.size === 1) {
      if (Math.hypot(p.x - gesto.inicio.x, p.y - gesto.inicio.y) > 8) gesto.movido = true;
      if (!gesto.movido) return;
      vista.tx += p.x - gesto.ultimo.x;
      vista.ty += p.y - gesto.ultimo.y;
      gesto.ultimo = p;
      aplicar();
    } else if (punteros.size === 2 && gesto.pinza) {
      const d = datosPinza(), z = gesto.pinza;
      const escala = Math.min(vista.maximo, Math.max(vista.minimo, z.escala * d.distancia / z.distancia));
      const px = (z.centro.x - z.tx) / z.escala, py = (z.centro.y - z.ty) / z.escala;
      vista.escala = escala;
      vista.tx = d.centro.x - px * escala;
      vista.ty = d.centro.y - py * escala;
      aplicar();
    }
  });

  function soltar(ev) {
    if (!punteros.has(ev.pointerId)) return;
    punteros.delete(ev.pointerId);
    if (!gesto) return;
    if (punteros.size === 1) {
      // Queda un dedo tras pellizcar: sigue arrastrando desde donde está.
      gesto.ultimo = [...punteros.values()][0];
      gesto.pinza = null;
      gesto.pinzado = true;
    } else if (punteros.size === 0) {
      arrastre = null;
      terminarTrazo();
      const toque = !gesto.movido && performance.now() - gesto.tiempo < 600 && ev.type === 'pointerup';
      const g = gesto;
      gesto = null;
      if (toque) tocar(local(ev), g.pin);
    }
  }
  n.marco.addEventListener('pointerup', soltar);
  n.marco.addEventListener('pointercancel', soltar);

  n.marco.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const p = local(ev);
    zoom(Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  n.marco.addEventListener('dblclick', (ev) => {
    const p = local(ev);
    zoom(2, p.x, p.y);
  });

  /* --- dibujo a mano alzada --- */

  function aPlano(p) {
    return [
      (p.x - vista.tx) / vista.escala / plano.ancho,
      (p.y - vista.ty) / vista.escala / plano.alto
    ];
  }

  function nodoTrazo() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  }

  function vestir(nodo, t) {
    nodo.setAttribute('points', puntosTrazo(t, plano.ancho, plano.alto));
    nodo.setAttribute('stroke', COLORES_TRAZO[t.color] || t.color);
    nodo.setAttribute('stroke-width', grosorTrazo(t, plano.ancho, plano.alto).toFixed(1));
    nodo.dataset.id = t.id;
    return nodo;
  }

  function pintarTrazos() {
    n.trazos.setAttribute('viewBox', `0 0 ${plano.ancho} ${plano.alto}`);
    n.trazos.replaceChildren(...trazosDelPlano().map((t) => vestir(nodoTrazo(), t)));
  }

  const redondear = (v) => Math.round(v * 10000) / 10000;

  function empezarTrazo(p) {
    const [x, y] = aPlano(p);
    const datos = {
      id: nuevoId(), plano: plano.id, color: pluma.color, grosor: pluma.grosor,
      puntos: [[redondear(x), redondear(y)]], hora: ahora()
    };
    trazo = { datos, nodo: vestir(nodoTrazo(), datos), ultimo: p };
    n.trazos.append(trazo.nodo);
  }

  function seguirTrazo(p) {
    if (!trazo) return;
    // Un punto cada 2 px de pantalla basta y deja el trazo ligero.
    if (Math.hypot(p.x - trazo.ultimo.x, p.y - trazo.ultimo.y) < 2) return;
    trazo.ultimo = p;
    const [x, y] = aPlano(p);
    trazo.datos.puntos.push([redondear(x), redondear(y)]);
    vestir(trazo.nodo, trazo.datos);
  }

  function terminarTrazo() {
    if (!trazo) return;
    const { datos } = trazo;
    trazo = null;
    // Un toque sin arrastrar deja un punto: se dibuja como un trazo mínimo.
    if (datos.puntos.length === 1) datos.puntos.push([datos.puntos[0][0] + 0.0001, datos.puntos[0][1]]);
    visita().trazos.push(datos);
    opciones.cambiado();
    actualizarHerramientas();
  }

  function descartarTrazo() {
    if (!trazo) return;
    trazo.nodo.remove();
    trazo = null;
  }

  /* Goma: borra el trazo que pase a menos de 14 px de pantalla del dedo. */
  function borrarEn(p) {
    const [x, y] = aPlano(p);
    const tolerancia = 14 / vista.escala;
    const px = x * plano.ancho, py = y * plano.alto;
    const cerca = (t) => {
      const margen = tolerancia + grosorTrazo(t, plano.ancho, plano.alto) / 2;
      for (let i = 1; i < t.puntos.length; i++) {
        const ax = t.puntos[i - 1][0] * plano.ancho, ay = t.puntos[i - 1][1] * plano.alto;
        const bx = t.puntos[i][0] * plano.ancho, by = t.puntos[i][1] * plano.alto;
        const dx = bx - ax, dy = by - ay;
        const largo = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo));
        if (Math.hypot(px - (ax + u * dx), py - (ay + u * dy)) <= margen) return true;
      }
      return false;
    };
    const v = visita();
    const antes = v.trazos.length;
    v.trazos = v.trazos.filter((t) => t.plano !== plano.id || !cerca(t));
    if (v.trazos.length !== antes) {
      opciones.cambiado();
      pintarTrazos();
      actualizarHerramientas();
    }
  }

  function deshacer() {
    const v = visita();
    const ultimo = [...v.trazos].reverse().find((t) => t.plano === plano.id);
    if (!ultimo) return;
    v.trazos = v.trazos.filter((t) => t !== ultimo);
    opciones.cambiado();
    pintarTrazos();
    actualizarHerramientas();
  }

  function borrarDibujos() {
    if (!confirm('¿Borrar todos los dibujos de este plano en esta visita?')) return;
    const v = visita();
    v.trazos = v.trazos.filter((t) => t.plano !== plano.id);
    opciones.cambiado();
    pintarTrazos();
    actualizarHerramientas();
  }

  function actualizarHerramientas() {
    n.herramientas.replaceChildren(
      el('div', { class: 'colores', role: 'radiogroup', 'aria-label': 'Color' },
        Object.entries(COLORES_TRAZO).map(([nombre, hex]) => el('button', {
          type: 'button', class: `color${!pluma.goma && pluma.color === nombre ? ' activo' : ''}`,
          style: `background:${hex}`, title: nombre, 'aria-label': nombre,
          'aria-pressed': String(!pluma.goma && pluma.color === nombre),
          onclick: () => { pluma.color = nombre; pluma.goma = false; actualizarHerramientas(); }
        }))),
      el('div', { class: 'grosores' },
        Object.keys(GROSORES).map((g) => el('button', {
          type: 'button', class: `grosor${pluma.grosor === g ? ' activo' : ''}`, title: g, 'aria-label': `Trazo ${g}`,
          'aria-pressed': String(pluma.grosor === g),
          onclick: () => { pluma.grosor = g; pluma.goma = false; actualizarHerramientas(); }
        }, el('span', { class: `raya raya-${g}` })))),
      el('button', {
        type: 'button', class: `boton${pluma.goma ? ' activo' : ''}`, 'aria-pressed': String(pluma.goma),
        onclick: () => { pluma.goma = !pluma.goma; actualizarHerramientas(); }
      }, 'Goma'),
      el('button', { type: 'button', class: 'boton', disabled: !trazosDelPlano().length, onclick: deshacer }, 'Deshacer'),
      el('button', { type: 'button', class: 'boton boton-peligro', disabled: !trazosDelPlano().length, onclick: borrarDibujos }, 'Borrar todo')
    );
    n.ayuda.textContent = pluma.goma
      ? 'Pasa el dedo por encima de un trazo para borrarlo.'
      : 'Dibuja con un dedo. Con dos dedos, mueve y acerca el plano.';
  }

  function tocar(p, pin) {
    const x = (p.x - vista.tx) / vista.escala / plano.ancho;
    const y = (p.y - vista.ty) / vista.escala / plano.alto;
    const dentro = x >= 0 && x <= 1 && y >= 0 && y <= 1;

    if (modo === 'medir' || modo === 'calibrar') {
      if (!dentro) return;
      anadirPunto([x, y]);
      return;
    }
    if (modo === 'ubicar') {
      if (!dentro || !repasoUbicar) return;
      opciones.alUbicar(repasoUbicar, plano.id, x, y);
      repasoUbicar = null;
      ponerModo('ver');
      pintarPines();
      return;
    }
    if (modo === 'anadir') {
      if (!dentro) return;
      const v = visita();
      const nueva = {
        id: nuevoId(), plano: plano.id, x, y,
        numero: v.notas.reduce((m, k) => Math.max(m, k.numero), 0) + 1,
        tipo: 'observacion', texto: '', hora: ahora()
      };
      v.notas.push(nueva);
      opciones.cambiado();
      ponerModo('ver');
      seleccionar(nueva.id, true);
      return;
    }
    if (modo === 'mover') {
      if (!dentro) return;
      const k = nota(seleccionada);
      if (k) { k.x = x; k.y = y; opciones.cambiado(); }
      ponerModo('ver');
      pintarPines();
      return;
    }
    if (pin && pin.dataset.repaso) { if (opciones.alTocarRepaso) opciones.alTocarRepaso(pin.dataset.repaso); return; }
    if (pin) seleccionar(pin.dataset.id);
    else if (seleccionada) seleccionar(null);
  }

  function ponerModo(nuevo) {
    descartarTrazo();
    const arriba = n.marco.getBoundingClientRect().top;
    modo = nuevo;
    const situando = modo === 'anadir' || modo === 'mover' || modo === 'ubicar';
    if (modo !== 'ubicar') repasoUbicar = null;
    n.capa.classList.toggle('anadiendo', situando);
    n.capa.classList.toggle('dibujando', modo === 'dibujar');
    const midiendo = modo === 'medir' || modo === 'calibrar';
    n.capa.classList.toggle('midiendo', midiendo);
    n.medir.hidden = modo === 'dibujar' || situando;
    n.medir.textContent = midiendo ? 'Listo' : '📏';
    n.medir.classList.toggle('boton-destacado', midiendo);
    n.medirHerr.hidden = !midiendo;
    if (!midiendo) { enCurso = []; pintarMedidas2(); }
    n.modo.hidden = modo === 'dibujar' || midiendo;
    n.modo.textContent = modo === 'ver' ? '+ Nota' : 'Cancelar';
    n.modo.classList.toggle('boton-destacado', modo === 'ver');
    n.dibujar.hidden = situando || midiendo;
    n.dibujar.textContent = modo === 'dibujar' ? 'Listo' : '✎ Dibujar';
    n.dibujar.classList.toggle('boton-destacado', modo === 'dibujar');
    n.herramientas.hidden = modo !== 'dibujar';
    // La barra de herramientas empuja el plano: se compensa para que no salte.
    if (plano) {
      vista.ty -= n.marco.getBoundingClientRect().top - arriba;
      aplicar();
    }
    if (modo === 'dibujar') {
      pluma.goma = false;
      return actualizarHerramientas();
    }
    if (midiendo) return herramientasMedir();
    const k = nota(seleccionada);
    n.ayuda.textContent = modo === 'ubicar' && repasoUbicar
      ? `Toca el plano donde está el repaso ${repasoUbicar.numero}.`
      : modo === 'anadir'
      ? 'Toca el plano donde quieras la nota.'
      : modo === 'mover' && k
        ? `Toca el nuevo sitio de la nota ${k.numero}.`
        : 'Pellizca para acercar. Toca un número para ver su nota.';
  }

  n.modo.addEventListener('click', () => {
    ponerModo(modo === 'ver' ? 'anadir' : 'ver');
    if (modo === 'anadir') seleccionar(null);
  });

  n.medir.addEventListener('click', () => {
    const entrar = !(modo === 'medir' || modo === 'calibrar');
    ponerModo(entrar ? 'medir' : 'ver');
    if (entrar) {
      seleccionar(null);
      if (!plano.mPorPx) ofrecerCalibrar();
    }
  });

  n.dibujar.addEventListener('click', () => {
    ponerModo(modo === 'dibujar' ? 'ver' : 'dibujar');
    if (modo === 'dibujar') seleccionar(null);
  });

  /* --- medir: distancias, recorridos y áreas, con la escala del plano --- */

  const SVG = 'http://www.w3.org/2000/svg';

  function puntoCerca(p) {
    let mejor = null, md = 22;
    enCurso.forEach(([x, y], i) => {
      const sx = x * plano.ancho * vista.escala + vista.tx, sy = y * plano.alto * vista.escala + vista.ty;
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < md) { md = d; mejor = i; }
    });
    return mejor;
  }

  function pintarMedidas2() {
    if (!plano) return;
    n.medidas.setAttribute('viewBox', `0 0 ${plano.ancho} ${plano.alto}`);
    const grosor = Math.max(plano.ancho, plano.alto) * 0.0016;
    const lista = medidasDelPlano();
    const actual = enCurso.length ? [{ id: '', tipo: modo === 'calibrar' ? 'distancia' : tipoMedida, puntos: enCurso, enCurso: true }] : [];
    const nodos = [];
    for (const m of [...lista, ...actual]) {
      const pts = enPx(plano, m.puntos);
      const forma = document.createElementNS(SVG, m.tipo === 'area' && pts.length > 2 ? 'polygon' : 'polyline');
      forma.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
      forma.setAttribute('class', `medida medida-${m.tipo}${m.enCurso ? ' en-curso' : ''}`);
      forma.setAttribute('stroke-width', (grosor * (m.enCurso ? 1.3 : 1)).toFixed(1));
      if (m.tipo !== 'area') forma.setAttribute('stroke-dasharray', `${(grosor * 3).toFixed(1)} ${(grosor * 2).toFixed(1)}`);
      nodos.push(forma);
      for (const [x, y] of pts) {
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y);
        c.setAttribute('r', (grosor * (m.enCurso ? 3.2 : 1.8)).toFixed(1));
        c.setAttribute('class', `medida-punto${m.enCurso ? ' en-curso' : ''}`);
        nodos.push(c);
      }
    }
    n.medidas.replaceChildren(...nodos);
    n.etiquetas.replaceChildren(...[...lista, ...actual].filter((m) => m.puntos.length > (m.tipo === 'area' ? 2 : 1)).map((m) => {
      const [x, y] = puntoEtiqueta(m);
      return el('button', {
        type: 'button', class: `medida-etiqueta${m.enCurso ? ' en-curso' : ''}`,
        style: `left:${x * 100}%;top:${y * 100}%`,
        title: m.enCurso ? '' : 'Tocar para borrar esta medida',
        onclick: (ev) => {
          ev.stopPropagation();
          if (m.enCurso) return;
          if (!confirm(`¿Borrar la medida de ${textoMedida(plano, m)}?`)) return;
          visita().medidas = visita().medidas.filter((x2) => x2.id !== m.id);
          opciones.cambiado();
          pintarMedidas2();
          if (modo === 'medir') herramientasMedir();
        }
      }, m.enCurso && modo === 'calibrar' ? 'Cota' : textoMedida(plano, m));
    }));
  }

  function anadirPunto(q) {
    const redondo = [redondear(q[0]), redondear(q[1])];
    if (modo === 'calibrar') {
      enCurso.push(redondo);
      if (enCurso.length === 2) {
        pintarMedidas2();
        setTimeout(terminarCalibrado, 30);
        return;
      }
    } else {
      if (tipoMedida === 'distancia' && enCurso.length >= 2) enCurso = [];
      enCurso.push(redondo);
      if (tipoMedida === 'distancia' && enCurso.length === 2) guardarMedida();
    }
    pintarMedidas2();
    herramientasMedir();
  }

  function guardarMedida() {
    const minimo = tipoMedida === 'area' ? 3 : 2;
    if (enCurso.length < minimo) return;
    const v = visita();
    if (!Array.isArray(v.medidas)) v.medidas = [];
    v.medidas.push({ id: nuevoId(), plano: plano.id, tipo: tipoMedida, puntos: enCurso, hora: ahora() });
    opciones.cambiado();
    enCurso = [];
    pintarMedidas2();
    herramientasMedir();
  }

  function ponerEscala(mPorPx, texto) {
    plano.mPorPx = mPorPx;
    plano.escalaTexto = texto;
    plano.modificado = Date.now();
    if (opciones.guardarPlano) opciones.guardarPlano(plano);
    pintarMedidas2();
  }

  function terminarCalibrado() {
    const px = longitud(enPx(plano, enCurso));
    const escrito = prompt('¿Cuánto mide en la realidad esa cota? (en metros, p. ej. 6,00)');
    const metros = escrito && Number(escrito.replace(',', '.').replace(/[^\d.]/g, ''));
    enCurso = [];
    if (metros > 0 && px > 0) {
      ponerEscala(metros / px, `cota de ${formatoMedida(metros, 'distancia')}`);
    }
    ponerModo('medir');
  }

  function ofrecerCalibrar() {
    n.ayuda.textContent = plano.papelMmPorPx
      ? 'Este plano no tiene escala todavía: elige la escala del plano (1:100…) o calibra con una cota.'
      : 'Este plano no tiene escala todavía: calibra con una cota conocida (toca sus dos extremos).';
  }

  function herramientasMedir() {
    const escalaActual = plano.mPorPx && plano.papelMmPorPx ? Math.round(plano.mPorPx * 1000 / plano.papelMmPorPx) : null;
    const lista = medidasDelPlano();
    n.medirHerr.replaceChildren(...[
      el('div', { class: 'chips' }, ...Object.entries(TIPOS_MEDIDA).map(([k, t]) => el('button', {
        type: 'button', class: `chip${tipoMedida === k && modo === 'medir' ? ' activo' : ''}`,
        onclick: () => { tipoMedida = k; enCurso = []; ponerModo('medir'); pintarMedidas2(); }
      }, t))),
      modo === 'medir' && tipoMedida !== 'distancia' && el('button', {
        type: 'button', class: 'boton boton-destacado', disabled: enCurso.length < (tipoMedida === 'area' ? 3 : 2), onclick: guardarMedida
      }, 'Terminar'),
      enCurso.length > 0 && el('button', { type: 'button', class: 'boton', onclick: () => { enCurso.pop(); pintarMedidas2(); herramientasMedir(); } }, 'Deshacer punto'),
      plano.papelMmPorPx && el('label', { class: 'escala-plano' }, 'Escala',
        el('select', {
          class: 'campo',
          onchange: (ev) => {
            const nEsc = Number(ev.target.value);
            if (nEsc) ponerEscala(plano.papelMmPorPx * nEsc / 1000, `1:${nEsc}`);
            herramientasMedir();
          }
        },
          el('option', { value: '', selected: !/^1:/.test(plano.escalaTexto || '') }, plano.mPorPx && !/^1:/.test(plano.escalaTexto || '') ? (plano.escalaTexto || 'Calibrada') : '—'),
          ...ESCALAS.map((e) => el('option', { value: e, selected: escalaActual === e && plano.escalaTexto === `1:${e}` }, `1:${e}`)))),
      el('button', {
        type: 'button', class: `boton${modo === 'calibrar' ? ' activo' : ''}`,
        onclick: () => { enCurso = []; ponerModo(modo === 'calibrar' ? 'medir' : 'calibrar'); pintarMedidas2(); }
      }, modo === 'calibrar' ? 'Cancelar calibrado' : 'Calibrar con una cota'),
      lista.length > 0 && el('span', { class: 'pie' }, `${lista.length} ${lista.length === 1 ? 'medida guardada' : 'medidas guardadas'} · toca una para borrarla`)
    ].filter((x) => x != null && x !== false));
    n.ayuda.textContent = modo === 'calibrar'
      ? 'Toca los dos extremos de una cota cuya medida conozcas.'
      : !plano.mPorPx
        ? (plano.papelMmPorPx ? 'Sin escala: elige la escala del plano o calibra con una cota.' : 'Sin escala: calibra con una cota conocida.')
        : `Escala: ${plano.escalaTexto || 'calibrada'}. ${tipoMedida === 'distancia' ? 'Toca dos puntos.' : tipoMedida === 'area' ? 'Toca los vértices y pulsa Terminar.' : 'Toca los puntos del recorrido y pulsa Terminar.'} Puedes arrastrar los puntos para afinar.`;
  }

  /* --- pines y hoja de la nota --- */

  function pintarPines() {
    const repasos = opciones.repasos ? opciones.repasos(plano.id) : [];
    n.pines.replaceChildren(...notasDelPlano().map((k) => el('button', {
      type: 'button',
      class: `pin tipo-${k.tipo}${k.id === seleccionada ? ' activo' : ''}`,
      'data-id': k.id,
      style: `left:${k.x * 100}%;top:${k.y * 100}%`,
      'aria-label': `Nota ${k.numero}`
    }, String(k.numero))), ...repasos.map((r) => el('button', {
      type: 'button',
      class: `pin pin-repaso estado-${r.estado}`,
      'data-repaso': r.id,
      style: `left:${r.x * 100}%;top:${r.y * 100}%`,
      'aria-label': `Repaso ${r.numero}`
    }, `R${r.numero}`)));
  }

  function liberarHoja() {
    for (const u of urlsHoja) URL.revokeObjectURL(u);
    urlsHoja = [];
  }

  function urlHoja(blob) {
    const u = URL.createObjectURL(blob);
    urlsHoja.push(u);
    return u;
  }

  /* La hoja de la nota quita alto al plano: si el pin queda tapado o
     fuera, se desplaza el plano para traerlo al centro de lo que se ve. */
  function asegurarVisible(k) {
    requestAnimationFrame(() => {
      const r = n.marco.getBoundingClientRect();
      const x = vista.tx + k.x * plano.ancho * vista.escala;
      const y = vista.ty + k.y * plano.alto * vista.escala;
      const mx = r.width * 0.2, my = r.height * 0.2;
      if (x > mx && x < r.width - mx && y > my && y < r.height - my) return;
      vista.tx += r.width / 2 - x;
      vista.ty += r.height / 2 - y;
      aplicar();
    });
  }

  function seleccionar(id, enfocar = false) {
    seleccionada = id;
    pintarPines();
    pintarHoja();
    const k = nota(id);
    if (k) asegurarVisible(k);
    if (enfocar) {
      const area = n.hoja.querySelector('textarea');
      if (area) area.focus();
    }
  }

  function entradaFotos(captura) {
    const entrada = el('input', { type: 'file', accept: 'image/*', hidden: true, multiple: !captura });
    if (captura) entrada.setAttribute('capture', 'environment');
    entrada.addEventListener('change', async () => {
      const archivos = [...entrada.files];
      const id = seleccionada;
      if (!archivos.length || !id) return;
      await opciones.anadirFotos(archivos, id);
      if (seleccionada === id) pintarHoja();
    });
    return entrada;
  }

  /* --- detalles de la nota: tonos de pintura y enlaces o referencias.
         Se editan sin repintar la hoja, para no perder el foco al escribir. --- */

  function quitar(etiqueta, alQuitar) {
    return el('button', { type: 'button', class: 'boton quitar', 'aria-label': etiqueta, title: etiqueta, onclick: alQuitar }, '✕');
  }

  function detallePinturas(k) {
    k.pinturas = k.pinturas || [];
    return el('div', { class: 'nota-detalle' },
      el('div', { class: 'grupo-cabecera' },
        el('h3', {}, 'Pintura y acabados'),
        el('button', {
          type: 'button', class: 'enlace',
          onclick: () => {
            k.pinturas.push({ id: nuevoId(), hex: '#f2efe6', marca: '', nombre: '', acabado: 'Mate' });
            opciones.cambiado();
            pintarHoja();
            const filas = n.hoja.querySelectorAll('.fila-pintura');
            filas[filas.length - 1].querySelector('input[type=text]').focus();
          }
        }, '+ Añadir tono')),
      k.pinturas.map((pt) => {
        const editar = (clave) => (ev) => { pt[clave] = ev.target.value; opciones.cambiado(); };
        return el('div', { class: 'fila-pintura' },
          el('input', { type: 'color', class: 'muestra-color', value: pt.hex || '#ffffff', 'aria-label': 'Color del tono', oninput: editar('hex') }),
          el('input', { type: 'text', class: 'campo', value: pt.marca, placeholder: 'Marca', oninput: editar('marca') }),
          el('input', { type: 'text', class: 'campo', value: pt.nombre, placeholder: 'Nombre o código del tono', oninput: editar('nombre') }),
          el('select', { class: 'campo', 'aria-label': 'Acabado', onchange: editar('acabado') },
            ACABADOS.map((a) => el('option', { value: a, selected: pt.acabado === a }, a))),
          quitar('Quitar tono', () => {
            k.pinturas = k.pinturas.filter((x) => x !== pt);
            opciones.cambiado();
            pintarHoja();
          }));
      }));
  }

  function detalleEnlaces(k) {
    k.enlaces = k.enlaces || [];
    return el('div', { class: 'nota-detalle' },
      el('div', { class: 'grupo-cabecera' },
        el('h3', {}, 'Enlaces y referencias'),
        el('button', {
          type: 'button', class: 'enlace',
          onclick: () => {
            k.enlaces.push({ id: nuevoId(), titulo: '', url: '' });
            opciones.cambiado();
            pintarHoja();
            const filas = n.hoja.querySelectorAll('.fila-enlace');
            filas[filas.length - 1].querySelector('input').focus();
          }
        }, '+ Añadir enlace')),
      k.enlaces.map((e) => {
        const abrir = el('a', { class: 'boton abrir-enlace', target: '_blank', rel: 'noopener noreferrer' }, 'Abrir');
        const comprobar = () => {
          const url = enlaceSeguro(e.url);
          abrir.hidden = !url;
          if (url) abrir.href = url; else abrir.removeAttribute('href');
        };
        comprobar();
        return el('div', { class: 'fila-enlace' },
          el('input', {
            type: 'text', class: 'campo', value: e.titulo, placeholder: 'Título (ficha técnica, catálogo…)',
            oninput: (ev) => { e.titulo = ev.target.value; opciones.cambiado(); }
          }),
          el('input', {
            type: 'url', class: 'campo', value: e.url, inputmode: 'url', autocapitalize: 'off',
            placeholder: 'https://… o una referencia (Plano A-201)',
            oninput: (ev) => { e.url = ev.target.value; comprobar(); opciones.cambiado(); }
          }),
          abrir,
          quitar('Quitar enlace', () => {
            k.enlaces = k.enlaces.filter((x) => x !== e);
            opciones.cambiado();
            pintarHoja();
          }));
      }));
  }

  function pintarHoja() {
    liberarHoja();
    const k = nota(seleccionada);
    n.hoja.hidden = !k;
    n.capa.classList.toggle('con-hoja', Boolean(k));
    if (!k) return n.hoja.replaceChildren();

    const v = visita();
    const suyas = v.fotos.filter((f) => f.nota === k.id);
    const camara = entradaFotos(true);
    const galeria = entradaFotos(false);
    const sueltas = v.fotos.filter((f) => f.nota !== k.id);
    const selector = el('div', { class: 'vincular', hidden: true },
      sueltas.length
        ? sueltas.map((f) => el('button', {
          type: 'button', class: 'vincular-foto',
          title: f.nota ? 'Ya está en otra nota: se moverá a esta' : 'Añadir a esta nota',
          onclick: () => { f.nota = k.id; opciones.cambiado(); pintarHoja(); }
        }, el('img', { src: urlHoja(f.blob), alt: '' }), f.nota ? el('span', {}, `N${nota(f.nota)?.numero ?? '?'}`) : null))
        : el('p', { class: 'pie' }, 'No hay otras fotos en esta visita.'));

    // Pasa por el(): las piezas vacías llegan como false y no deben pintarse.
    n.hoja.replaceChildren(...el('div', {},
      el('div', { class: 'nota-cabecera' },
        el('span', { class: `pin pin-fijo tipo-${k.tipo}` }, String(k.numero)),
        el('strong', {}, `Nota ${k.numero}`),
        el('span', { class: 'pie' }, k.hora || ''),
        el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar nota', onclick: () => seleccionar(null) }, '✕')
      ),
      el('div', { class: 'chips' }, Object.entries(TIPOS_NOTA).map(([clave, texto]) => el('button', {
        type: 'button', class: `chip${k.tipo === clave ? ' activo' : ''}`, 'aria-pressed': String(k.tipo === clave),
        onclick: () => { k.tipo = clave; opciones.cambiado(); pintarPines(); pintarHoja(); }
      }, texto))),
      el('textarea', {
        class: 'campo', rows: 3, value: k.texto, placeholder: 'Qué se ve aquí, qué hay que hacer, quién…',
        oninput: (ev) => { k.texto = ev.target.value; opciones.cambiado(); }
      }),
      detallePinturas(k),
      detalleEnlaces(k),
      suyas.length > 0 && el('div', { class: 'nota-fotos' }, suyas.map((f) => {
        const url = urlHoja(f.blob);
        return el('figure', {},
          el('img', { src: url, alt: f.pie || '', onclick: () => opciones.ampliar(url) }),
          el('button', {
            type: 'button', class: 'boton quitar', title: 'Quitar de la nota (la foto se queda en la visita)',
            'aria-label': 'Quitar de la nota',
            onclick: () => { f.nota = null; opciones.cambiado(); pintarHoja(); }
          }, '✕'));
      })),
      el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'boton', onclick: () => camara.click() }, 'Hacer foto'),
        el('button', { type: 'button', class: 'boton', onclick: () => galeria.click() }, 'Galería'),
        el('button', {
          type: 'button', class: 'boton',
          onclick: () => { selector.hidden = !selector.hidden; }
        }, 'Vincular foto'),
        camara, galeria
      ),
      selector,
      el('div', { class: 'fila-botones nota-acciones' },
        el('button', { type: 'button', class: 'boton', onclick: () => ponerModo('mover') }, 'Mover'),
        el('button', {
          type: 'button', class: 'boton boton-peligro',
          onclick: () => {
            if (!confirm(`¿Borrar la nota ${k.numero}? Sus fotos se quedan en la visita.`)) return;
            v.notas = v.notas.filter((x) => x !== k);
            for (const f of v.fotos) if (f.nota === k.id) f.nota = null;
            opciones.cambiado();
            seleccionar(null);
          }
        }, 'Borrar nota')
      )
    ).childNodes);
  }

  /* --- abrir y cerrar --- */

  n.cerrar.addEventListener('click', () => opciones.alCerrar());
  addEventListener('resize', () => { if (plano && !n.capa.hidden) encuadrar(); });

  return {
    get abierto() { return Boolean(plano); },
    get planoId() { return plano && plano.id; },

    async abrir(nuevo, notaId = null) {
      if (!plano || plano.id !== nuevo.id) {
        if (urlPlano) URL.revokeObjectURL(urlPlano);
        plano = nuevo;
        urlPlano = URL.createObjectURL(plano.blob);
        n.img.src = urlPlano;
        n.lienzo.style.width = `${plano.ancho}px`;
        n.lienzo.style.height = `${plano.alto}px`;
        n.nombre.textContent = plano.nombre;
        n.capa.hidden = false;
        document.documentElement.classList.add('con-plano');
        encuadrar();
      }
      pintarTrazos();
      enCurso = [];
      ponerModo('ver');
      pintarMedidas2();
      seleccionar(notaId);
      const k = nota(notaId);
      if (k) centrarEn(k.x, k.y);
    },

    cerrar() {
      if (!plano) return;
      liberarHoja();
      if (urlPlano) URL.revokeObjectURL(urlPlano);
      urlPlano = null;
      plano = null;
      seleccionada = null;
      n.img.removeAttribute('src');
      n.capa.hidden = true;
      n.hoja.hidden = true;
      n.trazos.replaceChildren();
      n.medidas.replaceChildren();
      n.etiquetas.replaceChildren();
      enCurso = [];
      descartarTrazo();
      document.documentElement.classList.remove('con-plano');
    },

    /* Situar un repaso del punch list: el siguiente toque en el plano
       lo deja ahí (opciones.alUbicar). */
    ubicar(repaso) {
      if (!plano) return;
      seleccionar(null);
      repasoUbicar = repaso;
      ponerModo('ubicar');
    },

    centrar(x, y) { if (plano) centrarEn(x, y); },

    /* Repintar tras un cambio hecho fuera del visor (fotos nuevas…). */
    refrescar() {
      if (!plano) return;
      pintarTrazos();
      pintarMedidas2();
      pintarPines();
      pintarHoja();
    }
  };
}
