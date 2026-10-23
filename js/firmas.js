/* Firmas en el teléfono para minutas y registros de control (RFI, órdenes
   de cambio, recepciones, permisos, charlas…). Cada registro guarda
   r.firmas = { papel: { blob, nombre, en } }. La sincronización
   (equipo.js) sube cada blob a la nube y, en otro teléfono que no pueda
   bajarlo, queda { ruta, enlace } en su lugar.

   La firma se hace en una hoja a pantalla completa que sólo se abre al
   pulsar «Firmar»: así no se traza por error al desplazar la ficha. */

import { el } from './utiles.js';

export function leerMiFirma() { try { return localStorage.getItem('crd-mi-firma'); } catch (e) { return null; } }

const urls = new WeakMap();
/* Dirección de la imagen de una firma (para la ficha y el PDF). */
export function urlFirma(r, papel) {
  const f = r.firmas && r.firmas[papel];
  if (!f) return null;
  if (f.blob) {
    if (!urls.has(f.blob)) urls.set(f.blob, URL.createObjectURL(f.blob));
    return urls.get(f.blob);
  }
  return null;
}
export const firmado = (r, papel) => Boolean(r.firmas && r.firmas[papel] && (r.firmas[papel].blob || r.firmas[papel].ruta));
export const cuantasFirmas = (r) => Object.keys(r.firmas || {}).filter((p) => firmado(r, p)).length;
const fechaCorta = (ms) => new Date(ms).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });

/* Hoja de firma: devuelve el PNG (fondo transparente) o null si se cancela. */
export function pedirFirma(titulo, nombre = '') {
  return new Promise((resolver) => {
    const lienzo = el('canvas', { class: 'hoja-firma-lienzo', 'aria-label': 'Espacio para firmar con el dedo' });
    const ctx = lienzo.getContext('2d');
    let trazos = 0, trazando = false;
    const aceptar = el('button', { type: 'button', class: 'boton boton-destacado', disabled: true }, 'Aceptar firma');
    const hoja = el('div', { class: 'hoja-firma', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      el('div', { class: 'hoja-firma-caja' },
        el('div', { class: 'hoja-firma-cabecera' },
          el('strong', {}, titulo),
          nombre && el('span', { class: 'pie' }, nombre)),
        lienzo,
        el('p', { class: 'pie' }, 'Firma con el dedo dentro del recuadro.'),
        el('div', { class: 'fila-botones' },
          el('button', { type: 'button', class: 'boton', onclick: () => cerrar(null) }, 'Cancelar'),
          el('button', { type: 'button', class: 'enlace', onclick: limpiar }, 'Borrar trazo'),
          aceptar)));

    function preparar() {
      const b = lienzo.getBoundingClientRect();
      const dpr = devicePixelRatio || 1;
      lienzo.width = Math.max(1, Math.round(b.width * dpr));
      lienzo.height = Math.max(1, Math.round(b.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#111' });
    }
    function limpiar() { trazos = 0; aceptar.disabled = true; preparar(); }
    function cerrar(valor) {
      removeEventListener('keydown', tecla);
      hoja.remove();
      resolver(valor);
    }
    const tecla = (ev) => { if (ev.key === 'Escape') cerrar(null); };
    const punto = (ev) => { const b = lienzo.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
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
      trazos++;
      aceptar.disabled = trazos < 3;
    });
    const fin = () => { trazando = false; };
    lienzo.addEventListener('pointerup', fin);
    lienzo.addEventListener('pointercancel', fin);
    aceptar.addEventListener('click', () => recortar(lienzo).toBlob((b) => cerrar(b), 'image/png'));

    document.body.append(hoja);
    addEventListener('keydown', tecla);
    requestAnimationFrame(preparar);
  });
}

/* Recorta el lienzo al trazo (con un margen) para que encaje en el PDF. */
function recortar(lienzo) {
  const { width: w, height: h } = lienzo;
  const px = lienzo.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return lienzo;
  const m = Math.round(Math.min(w, h) * 0.04);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const salida = el('canvas', { width: x1 - x0 + 1, height: y1 - y0 + 1 });
  salida.getContext('2d').drawImage(lienzo, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);
  return salida;
}

/* Tarjeta de una firma: vista, nombre, fecha y botones.
   papel: { papel, titulo, nombre: () => texto | undefined }
   Si «nombre» no viene, la tarjeta pide el nombre en un campo propio. */
export function tarjetaFirma(r, { papel, titulo, nombre }, alCambiar) {
  const nodo = el('div', { class: 'firma-tarjeta' });
  const nombreDe = () => (nombre && nombre()) || (r.firmas && r.firmas[papel] && r.firmas[papel].nombre) || '';

  async function poner(blob) {
    r.firmas = { ...(r.firmas || {}) };
    r.firmas[papel] = { ...(r.firmas[papel] || {}), blob, nombre: nombreDe(), en: Date.now() };
    delete r.firmas[papel].ruta;
    delete r.firmas[papel].enlace;
    alCambiar();
    pintar();
  }

  function pintar() {
    const f = (r.firmas || {})[papel] || {};
    const hecho = firmado(r, papel);
    const url = urlFirma(r, papel);
    const mia = leerMiFirma();
    const campoNombre = !nombre && el('input', {
      class: 'campo', value: f.nombre || '', placeholder: 'Nombre y cargo', 'aria-label': `Nombre de quien firma: ${titulo}`,
      oninput: (ev) => {
        r.firmas = { ...(r.firmas || {}) };
        r.firmas[papel] = { ...(r.firmas[papel] || {}), nombre: ev.target.value };
        alCambiar();
      }
    });
    nodo.classList.toggle('con-firma', hecho);
    nodo.replaceChildren(
      el('div', { class: 'firma-tarjeta-titulo' }, el('strong', {}, titulo), hecho && f.en ? el('span', { class: 'pie' }, fechaCorta(f.en)) : null),
      el('div', { class: 'firma-vista', style: url ? `background-image:url("${url}")` : null },
        !url && (f.ruta
          ? (f.enlace ? el('a', { class: 'enlace', href: f.enlace, target: '_blank', rel: 'noopener noreferrer' }, 'Ver la firma en la nube') : el('span', { class: 'pie' }, 'Firmada en otro teléfono'))
          : el('span', { class: 'pie' }, 'Sin firmar'))),
      campoNombre || el('span', { class: 'firma-tarjeta-nombre' }, nombreDe() || `Nombre: en «${titulo}», arriba`),
      el('div', { class: 'fila-botones' },
        el('button', {
          type: 'button', class: hecho ? 'boton' : 'boton boton-destacado',
          onclick: async () => {
            if (hecho && !confirm('¿Cambiar la firma actual?')) return;
            const blob = await pedirFirma(titulo, nombreDe());
            if (blob) poner(blob);
          }
        }, hecho ? '✍ Volver a firmar' : '✍ Firmar'),
        mia && el('button', {
          type: 'button', class: 'boton', title: 'La firma guardada en este teléfono',
          onclick: async () => {
            if (hecho && !confirm('¿Cambiar la firma actual por la tuya guardada?')) return;
            poner(await (await fetch(mia)).blob());
          }
        }, '⭐ Mi firma'),
        hecho && el('button', {
          type: 'button', class: 'enlace boton-peligro-texto',
          onclick: () => {
            if (!confirm('¿Borrar esta firma?')) return;
            r.firmas = { ...(r.firmas || {}) };
            const { nombre: n } = r.firmas[papel] || {};
            r.firmas[papel] = n ? { nombre: n } : undefined;
            if (!r.firmas[papel]) delete r.firmas[papel];
            alCambiar();
            pintar();
          }
        }, 'Borrar')));
  }
  pintar();
  return nodo;
}

/* Sección «Firmas» con una tarjeta por papel. */
export function seccionFirmas(r, papeles, { titulo = 'Firmas', nota = 'Firma en el teléfono; sale en el PDF. Se puede imprimir sin firmar y firmar a mano.', alCambiar }) {
  const cuenta = el('span', { class: 'pie' });
  const contar = () => { cuenta.textContent = `${papeles.filter((p) => firmado(r, p.papel)).length} de ${papeles.length}`; };
  contar();
  const cambio = () => { contar(); alCambiar(); };
  return el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, titulo), cuenta),
    el('div', { class: 'firmas-tarjetas' }, ...papeles.map((p) => tarjetaFirma(r, p, cambio))),
    nota && el('p', { class: 'pie' }, nota));
}

/* Firmas de los asistentes (charla, minuta): una fila por persona con su
   botón. La clave de cada firma es «a:<id del asistente>». */
export function firmasAsistentes(r, asistentes, alCambiar) {
  const cuenta = el('span', { class: 'pie' });
  const filas = el('div', { class: 'firmas-asistentes' });
  const seccion = el('section', { class: 'grupo' },
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, 'Firmas de asistentes'), cuenta),
    el('p', { class: 'pie' }, 'Pasa el teléfono: cada asistente firma en su línea. Sale en la hoja de asistencia del PDF.'),
    filas);
  const lista = () => asistentes.filter((a) => (a.nombre || '').trim());
  const contar = () => { const l = lista(); cuenta.textContent = `${l.filter((a) => firmado(r, `a:${a.id}`)).length} de ${l.length}`; };
  const hechas = new Map(); // id → { nodo, pintar, texto }
  const fila = (a) => {
    const previa = hechas.get(a.id);
    const texto = `${a.nombre}|${a.empresa || ''}`;
    if (previa) {
      // Mismo nodo (un toque en «Firmar» justo al salir del campo no se pierde).
      if (previa.texto !== texto) { previa.texto = texto; previa.pintar(); }
      return previa.nodo;
    }
    const nodo = el('div', { class: 'firma-asistente' });
    const clave = `a:${a.id}`;
    const pintar = () => {
      const url = urlFirma(r, clave), hecho = firmado(r, clave);
      nodo.replaceChildren(
        el('span', {}, el('strong', {}, a.nombre), a.empresa ? el('span', { class: 'pie' }, ` · ${a.empresa}`) : null),
        el('div', { class: 'firma-mini', style: url ? `background-image:url("${url}")` : null }, !url && hecho ? '✓' : null),
        el('button', {
          type: 'button', class: hecho ? 'enlace' : 'boton',
          onclick: async () => {
            const blob = await pedirFirma(`Firma de ${a.nombre}`, a.empresa || '');
            if (!blob) return;
            r.firmas = { ...(r.firmas || {}), [clave]: { blob, nombre: a.nombre, en: Date.now() } };
            alCambiar();
            pintar();
            contar();
          }
        }, hecho ? 'Cambiar' : '✍ Firmar'));
    };
    pintar();
    hechas.set(a.id, { nodo, pintar, texto });
    return nodo;
  };
  const repintar = () => {
    const l = lista();
    seccion.hidden = !l.length;
    const nuevos = l.map(fila);
    // Sin tocar el DOM si no cambian las filas: sacar y volver a meter un
    // botón a mitad de un toque anula el toque.
    const actuales = [...filas.children];
    if (nuevos.length !== actuales.length || nuevos.some((n, i) => n !== actuales[i])) filas.replaceChildren(...nuevos);
    contar();
  };
  repintar();
  // Los nombres se escriben más arriba: al salir de un campo, se actualiza.
  const alSalir = () => {
    if (!seccion.isConnected) { document.removeEventListener('change', alSalir, true); return; }
    repintar();
  };
  document.addEventListener('change', alSalir, true);
  return seccion;
}

/* Celda de la hoja de asistencia del PDF con la firma de fondo. */
export function celdaFirmaAsistente(r, a) {
  const url = urlFirma(r, `a:${a.id}`);
  return el('td', { class: 'informe-firma-celda', style: url ? `background: url("${url}") left center / contain no-repeat` : null });
}
