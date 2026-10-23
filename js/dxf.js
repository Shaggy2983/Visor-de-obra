/* Planos DXF: lectura (en js/dxf-worker.js), dibujo en lienzo, paso a
   imagen para «Planos y notas» y visor 2D con capas y medición exacta.

   Coordenadas: las del dibujo (unidades del DXF) relativas a geom.origen;
   la Y del DXF crece hacia arriba y la de la pantalla hacia abajo. */

import { el } from './utiles.js';
import { formatoMedida, area, longitud } from './medir-plano.js';

/* --- lectura --- */

export function esDxf(archivo) {
  return /\.dxf$/i.test((archivo && archivo.name) || '') || (archivo && archivo.type === 'image/vnd.dxf');
}

export async function leerDxf(archivo) {
  const texto = await archivo.text();
  if (/^AC10\d\d/.test(texto.slice(0, 6))) {
    throw new Error('Es un DWG con extensión .dxf. Guárdalo como DXF desde AutoCAD.');
  }
  if (!/SECTION/.test(texto.slice(0, 4000))) {
    throw new Error('El archivo no parece un DXF de texto. En AutoCAD: Guardar como → «AutoCAD DXF» (no binario).');
  }
  const trabajador = new Worker(new URL('./dxf-worker.js', import.meta.url));
  try {
    return await new Promise((cumplir, fallar) => {
      trabajador.onmessage = (ev) => (ev.data.ok ? cumplir(ev.data.resultado) : fallar(new Error(ev.data.error)));
      trabajador.onerror = (ev) => fallar(new Error(ev.message || 'No se pudo leer el DXF'));
      trabajador.postMessage({ texto });
    });
  } finally {
    trabajador.terminate();
  }
}

/* --- dibujo --- */

// Sobre fondo claro, el blanco/gris claro del DXF (color 7 y parecidos)
// pasa a negro; sobre fondo oscuro, el negro pasa a blanco.
function ajustarColor(color, fondoClaro) {
  const n = parseInt(color.slice(1), 16);
  const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  const luz = (0.299 * r + 0.587 * g + 0.114 * b);
  const saturacion = Math.max(r, g, b) - Math.min(r, g, b);
  if (fondoClaro) {
    // Blancos y grises claros → negro; colores vivos y claros (amarillo, cian,
    // verde) se oscurecen para que se lean sobre blanco.
    if (luz > 170 && saturacion < 60) return '#111111';
    if (luz > 110) return `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`;
    return color;
  }
  if (luz < 40) return '#e9eef5';
  return color;
}

/* Prepara (una vez) un Path2D por grupo en coordenadas del dibujo. */
function caminos(geom) {
  if (geom._caminos) return geom._caminos;
  geom._caminos = geom.grupos.map((g) => {
    const p = new Path2D();
    const { puntos, cortes } = g;
    const total = puntos.length / 2;
    for (let i = 0; i < cortes.length; i++) {
      const ini = cortes[i], fin = i + 1 < cortes.length ? cortes[i + 1] : total;
      p.moveTo(puntos[ini * 2], -puntos[ini * 2 + 1]);
      for (let k = ini + 1; k < fin; k++) p.lineTo(puntos[k * 2], -puntos[k * 2 + 1]);
    }
    return p;
  });
  return geom._caminos;
}

/* vista: { escala (px por unidad), tx, ty } — pantalla = (x·escala + tx, −y·escala + ty)
   opciones: { ocultas: Set(índice de capa), fondoClaro, grosor (px), textos } */
export function pintarDxf(ctx, geom, vista, opciones = {}) {
  const { ocultas = new Set(), fondoClaro = false, grosor = 1, textos = true } = opciones;
  const lista = caminos(geom);
  ctx.save();
  ctx.setTransform(vista.escala * vista.dpr, 0, 0, vista.escala * vista.dpr, vista.tx * vista.dpr, vista.ty * vista.dpr);
  ctx.lineWidth = grosor / vista.escala;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  geom.grupos.forEach((g, i) => {
    if (ocultas.has(g.capa)) return;
    ctx.strokeStyle = ajustarColor(g.color, fondoClaro);
    ctx.stroke(lista[i]);
  });
  ctx.restore();
  if (!textos) return;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const t of geom.textos) {
    if (ocultas.has(t.capa)) continue;
    const alto = t.h * vista.escala;
    if (alto < 3) continue;
    const x = (t.x * vista.escala + vista.tx), y = (-t.y * vista.escala + vista.ty);
    if (x < -2000 || y < -2000 || x > ctx.canvas.width / vista.dpr + 2000 || y > ctx.canvas.height / vista.dpr + 2000) continue;
    ctx.setTransform(vista.dpr, 0, 0, vista.dpr, 0, 0);
    ctx.translate(x, y);
    ctx.rotate(-t.rot);
    ctx.fillStyle = ajustarColor(t.color, fondoClaro);
    ctx.font = `${alto.toFixed(1)}px Inter, Arial, sans-serif`;
    ctx.textAlign = ['left', 'center', 'right'][t.alinH] || 'left';
    const lineas = t.texto.split('\n');
    const salto = alto * 1.35;
    // MTEXT: el punto es la esquina de arriba (0), el medio (1) o abajo (2);
    // TEXT: línea base (3), medio (1) o abajo (0).
    let y0 = 0;
    if (t.mtext) y0 = t.alinV === 0 ? alto : t.alinV === 1 ? alto / 2 - (lineas.length - 1) * salto / 2 : -(lineas.length - 1) * salto;
    else y0 = t.alinV === 1 ? alto / 2 : t.alinV === 0 ? 0 : 0;
    lineas.forEach((l, i) => ctx.fillText(l, 0, y0 + i * salto));
  }
  ctx.restore();
}

/* --- a imagen, para «Planos y notas» --- */

/* Devuelve { blob, ancho, alto, mPorPx }: el plano en JPEG sobre blanco y
   cuántos metros mide cada píxel (para medir sin calibrar). */
export async function dxfAImagen(geom, lado = 4096, areaMaxima = 16e6) {
  const { caja } = geom;
  const w = Math.max(1e-9, caja.x1 - caja.x0), h = Math.max(1e-9, caja.y1 - caja.y0);
  const margen = 0.03;
  let escala = lado / (Math.max(w, h) * (1 + 2 * margen));
  const ancho0 = w * (1 + 2 * margen) * escala, alto0 = h * (1 + 2 * margen) * escala;
  const reduce = Math.min(1, Math.sqrt(areaMaxima / (ancho0 * alto0)));
  escala *= reduce;
  const ancho = Math.max(1, Math.round(w * (1 + 2 * margen) * escala));
  const alto = Math.max(1, Math.round(h * (1 + 2 * margen) * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ancho, alto);
  const vista = { escala, dpr: 1, tx: (-caja.x0 + w * margen) * escala, ty: (caja.y1 + h * margen) * escala };
  const ocultas = new Set(geom.capas.map((c, i) => (c.visible ? -1 : i)).filter((i) => i >= 0));
  pintarDxf(ctx, geom, vista, { ocultas, fondoClaro: true, grosor: Math.max(1.5, lado / 1600) });
  const blob = await new Promise((c) => lienzo.toBlob(c, 'image/jpeg', 0.9));
  lienzo.width = lienzo.height = 0;
  return { blob, ancho, alto, mPorPx: geom.metrosPorUnidad / escala };
}

/* --- visor 2D (Modelo 3D → abrir un .dxf) --- */

const UNIDADES = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

export function crearVisorDxf(capa, { alCerrar, avisar }) {
  const lienzo = el('canvas', { class: 'dxf-lienzo' });
  const nombre = el('span', { class: 'plano-nombre' });
  const ayuda = el('p', { class: 'plano-ayuda' });
  const panelCapas = el('div', { class: 'dxf-capas', hidden: true });
  const herramientas = el('div', { class: 'plano-herramientas', hidden: true });
  const lectura = el('div', { class: 'dxf-lectura', hidden: true });
  const botonCapas = el('button', { type: 'button', class: 'boton' }, 'Capas');
  const botonMedir = el('button', { type: 'button', class: 'boton' }, '📏 Medir');
  capa.replaceChildren(
    el('div', { class: 'plano-barra' },
      el('button', { type: 'button', class: 'boton', onclick: () => alCerrar() }, '← Volver'),
      nombre,
      el('button', { type: 'button', class: 'boton', title: 'Ver todo', onclick: () => { encuadrar(); pintar(); } }, '⤢'),
      botonCapas, botonMedir),
    ayuda, herramientas,
    el('div', { class: 'dxf-marco' }, lienzo, lectura, panelCapas));
  const marco = capa.querySelector('.dxf-marco');
  const ctx = lienzo.getContext('2d');

  let geom = null;
  const vista = { escala: 1, tx: 0, ty: 0, dpr: 1 };
  const ocultas = new Set();
  let medir = null;   // { tipo, puntos: [[x,y]], cursor }
  let tipoMedida = 'distancia';
  const fondoClaro = () => getComputedStyle(document.documentElement).colorScheme.includes('light');

  /* --- vista --- */
  function dimensionar() {
    const r = marco.getBoundingClientRect();
    vista.dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = Math.max(1, Math.round(r.width * vista.dpr));
    lienzo.height = Math.max(1, Math.round(r.height * vista.dpr));
    lienzo.style.width = `${r.width}px`;
    lienzo.style.height = `${r.height}px`;
  }
  function encuadrar() {
    const r = marco.getBoundingClientRect();
    const { caja } = geom;
    const w = caja.x1 - caja.x0 || 1, h = caja.y1 - caja.y0 || 1;
    vista.escala = Math.min(r.width / w, r.height / h) * 0.92;
    vista.tx = r.width / 2 - (caja.x0 + w / 2) * vista.escala;
    vista.ty = r.height / 2 + (caja.y0 + h / 2) * vista.escala;
  }
  const aDibujo = (p) => [(p.x - vista.tx) / vista.escala, -(p.y - vista.ty) / vista.escala];
  const aPantalla = ([x, y]) => ({ x: x * vista.escala + vista.tx, y: -y * vista.escala + vista.ty });

  let pendiente = false;
  function pintar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      if (!geom) return;
      const claro = fondoClaro();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = claro ? '#ffffff' : '#0e1420';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      pintarDxf(ctx, geom, vista, { ocultas, fondoClaro: claro });
      pintarMedida();
    });
  }

  /* --- medir (con enganche a extremos, centros y puntos medios) --- */
  function enganchar(p) {
    const e = geom.enganches;
    const radio = 14;
    let mejor = null, md = radio * radio;
    const [x, y] = aDibujo(p);
    const tol = radio / vista.escala;
    for (let i = 0; i < e.length; i += 2) {
      const dx = e[i] - x, dy = e[i + 1] - y;
      if (dx > tol || dx < -tol || dy > tol || dy < -tol) continue;
      const d = (dx * dx + dy * dy) * vista.escala * vista.escala;
      if (d < md) { md = d; mejor = [e[i], e[i + 1]]; }
    }
    return mejor ? { punto: mejor, enganchado: true } : { punto: [x, y], enganchado: false };
  }

  function valorMedida(puntos, tipo) {
    const k = geom.metrosPorUnidad;
    if (tipo === 'area') return area(puntos) * k * k;
    return longitud(puntos, false) * k;
  }

  function pintarMedida() {
    if (!medir) { lectura.hidden = true; return; }
    const pts = medir.cursor ? [...medir.puntos, medir.cursor] : medir.puntos;
    ctx.save();
    ctx.setTransform(vista.dpr, 0, 0, vista.dpr, 0, 0);
    ctx.strokeStyle = '#ff6b2c';
    ctx.fillStyle = 'rgba(255,107,44,.15)';
    ctx.lineWidth = 2.5;
    if (pts.length > 1) {
      ctx.beginPath();
      pts.forEach((q, i) => { const s = aPantalla(q); ctx[i ? 'lineTo' : 'moveTo'](s.x, s.y); });
      if (tipoMedida === 'area' && pts.length > 2) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
    }
    for (const q of pts) {
      const s = aPantalla(q);
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b2c'; ctx.fill();
    }
    if (medir.cursor && medir.enganchado) {
      const s = aPantalla(medir.cursor);
      ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
      ctx.strokeRect(s.x - 8, s.y - 8, 16, 16);
    }
    ctx.restore();
    const valor = pts.length > (tipoMedida === 'area' ? 2 : 1) ? valorMedida(pts, tipoMedida) : null;
    lectura.hidden = valor == null;
    if (valor != null) {
      const segmento = tipoMedida !== 'area' && pts.length > 2 ? ` · tramo ${formatoMedida(valorMedida(pts.slice(-2), 'distancia'), 'distancia')}` : '';
      lectura.textContent = `${formatoMedida(valor, tipoMedida)}${segmento}`;
    }
  }

  function pintarHerramientas() {
    herramientas.replaceChildren(
      el('div', { class: 'chips' }, ...[['distancia', 'Distancia'], ['longitud', 'Recorrido'], ['area', 'Área']].map(([k, t]) =>
        el('button', { type: 'button', class: `chip${tipoMedida === k ? ' activo' : ''}`, onclick: () => { tipoMedida = k; medir = { puntos: [] }; pintarHerramientas(); pintar(); } }, t))),
      el('button', { type: 'button', class: 'boton', onclick: () => { if (medir) { medir.puntos.pop(); pintar(); } } }, 'Deshacer punto'),
      el('button', { type: 'button', class: 'boton', onclick: () => { medir = { puntos: [] }; pintar(); } }, 'Nueva'),
      el('label', { class: 'dxf-unidades' }, 'Unidades',
        el('select', {
          class: 'campo',
          onchange: (ev) => { geom.unidades = ev.target.value; geom.metrosPorUnidad = UNIDADES[ev.target.value]; pintar(); }
        }, ...Object.keys(UNIDADES).map((u) => el('option', { value: u, selected: geom.unidades === u }, u)))));
    ayuda.textContent = tipoMedida === 'distancia'
      ? 'Toca dos puntos. El cuadro verde indica que engancha a un extremo, centro o punto medio.'
      : tipoMedida === 'longitud' ? 'Toca los puntos del recorrido; se suman los tramos.'
        : 'Toca los vértices del contorno; el área se cierra sola.';
  }

  botonMedir.addEventListener('click', () => {
    if (medir) {
      medir = null;
      botonMedir.textContent = '📏 Medir';
      botonMedir.classList.remove('boton-destacado');
      herramientas.hidden = true;
      ayuda.textContent = 'Arrastra para moverte, pellizca para acercar.';
    } else {
      medir = { puntos: [] };
      botonMedir.textContent = 'Listo';
      botonMedir.classList.add('boton-destacado');
      herramientas.hidden = false;
      pintarHerramientas();
      if (!geom.unidadesDeclaradas) avisar(`El DXF no declara unidades: se supone ${geom.unidades}. Cámbialo en «Unidades» si no es así.`, 6000);
    }
    requestAnimationFrame(() => { dimensionar(); pintar(); });
  });

  botonCapas.addEventListener('click', () => {
    panelCapas.hidden = !panelCapas.hidden;
    if (!panelCapas.hidden) pintarCapas();
  });
  function pintarCapas() {
    const conCosas = new Set([...geom.grupos.map((g) => g.capa), ...geom.textos.map((t) => t.capa)]);
    panelCapas.replaceChildren(...[
      el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'enlace', onclick: () => { ocultas.clear(); pintarCapas(); pintar(); } }, 'Todas'),
        el('button', { type: 'button', class: 'enlace', onclick: () => { geom.capas.forEach((_, i) => ocultas.add(i)); pintarCapas(); pintar(); } }, 'Ninguna')),
      ...geom.capas.map((c, i) => conCosas.has(i) && el('label', { class: 'dxf-capa' },
        el('input', { type: 'checkbox', checked: !ocultas.has(i), onchange: (ev) => { if (ev.target.checked) ocultas.delete(i); else ocultas.add(i); pintar(); } }),
        el('span', { class: 'dxf-muestra', style: `background:${c.color}` }),
        c.nombre))
    ].filter(Boolean));
  }

  /* --- gestos --- */
  const punteros = new Map();
  let gesto = null;
  const local = (ev) => { const r = marco.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  lienzo.addEventListener('pointerdown', (ev) => {
    lienzo.setPointerCapture(ev.pointerId);
    const p = local(ev);
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1) gesto = { inicio: p, ultimo: p, movido: false, t: performance.now() };
    else if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      gesto.movido = true;
      gesto.pinza = { d: Math.hypot(a.x - b.x, a.y - b.y), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, escala: vista.escala, tx: vista.tx, ty: vista.ty };
    }
  });
  lienzo.addEventListener('pointermove', (ev) => {
    const p = local(ev);
    if (medir && ev.pointerType === 'mouse' && !punteros.size) {
      const e = enganchar(p);
      medir.cursor = medir.puntos.length ? e.punto : null;
      medir.enganchado = e.enganchado;
      pintar();
    }
    if (!punteros.has(ev.pointerId) || !gesto) return;
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1) {
      if (Math.hypot(p.x - gesto.inicio.x, p.y - gesto.inicio.y) > 8) gesto.movido = true;
      if (!gesto.movido) return;
      vista.tx += p.x - gesto.ultimo.x; vista.ty += p.y - gesto.ultimo.y;
      gesto.ultimo = p;
      pintar();
    } else if (punteros.size === 2 && gesto.pinza) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = gesto.pinza;
      const escala = z.escala * d / z.d;
      const px = (z.c.x - z.tx) / z.escala, py = (z.c.y - z.ty) / z.escala;
      vista.escala = escala; vista.tx = c.x - px * escala; vista.ty = c.y - py * escala;
      pintar();
    }
  });
  function soltar(ev) {
    if (!punteros.has(ev.pointerId)) return;
    punteros.delete(ev.pointerId);
    if (punteros.size === 1 && gesto) { gesto.ultimo = [...punteros.values()][0]; gesto.pinza = null; return; }
    if (punteros.size || !gesto) return;
    const toque = !gesto.movido && performance.now() - gesto.t < 600 && ev.type === 'pointerup';
    gesto = null;
    if (toque && medir) {
      const e = enganchar(local(ev));
      if (tipoMedida === 'distancia' && medir.puntos.length >= 2) medir.puntos = [];
      medir.puntos.push(e.punto);
      medir.cursor = null;
      pintar();
    }
  }
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
  lienzo.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const p = local(ev);
    const f = Math.exp(-ev.deltaY * 0.0015);
    vista.tx = p.x - (p.x - vista.tx) * f; vista.ty = p.y - (p.y - vista.ty) * f; vista.escala *= f;
    pintar();
  }, { passive: false });
  addEventListener('resize', () => { if (geom && !capa.hidden) { dimensionar(); pintar(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', pintar);
  new MutationObserver(pintar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

  return {
    abrir(nuevo, titulo) {
      geom = nuevo;
      ocultas.clear();
      geom.capas.forEach((c, i) => { if (!c.visible) ocultas.add(i); });
      medir = null;
      botonMedir.textContent = '📏 Medir';
      botonMedir.classList.remove('boton-destacado');
      herramientas.hidden = true;
      panelCapas.hidden = true;
      nombre.textContent = titulo;
      const faltan = Object.entries(geom.omitidas).filter(([k]) => ['HATCH', 'IMAGE', 'WIPEOUT', 'MLINE', 'LEADER', 'MULTILEADER', 'TABLE', 'REGION', '3DSOLID'].includes(k));
      ayuda.textContent = `${geom.capas.length} capas · unidades: ${geom.unidades}${geom.unidadesDeclaradas ? '' : ' (supuestas)'}`
        + (faltan.length ? ` · sin dibujar: ${faltan.map(([k, n]) => `${n} ${k}`).join(', ')}` : '')
        + (geom.recortado ? ' · plano muy grande: se ha recortado' : '');
      capa.hidden = false;
      requestAnimationFrame(() => { dimensionar(); encuadrar(); pintar(); });
    },
    cerrar() {
      capa.hidden = true;
      geom = null;
    }
  };
}
