/* Piezas comunes de los documentos impresos (PDF) de calidad y
   seguimiento: banda con el logotipo, cabecera, ficha en recuadros,
   cifras, secciones numeradas, firmas y pie. Los estilos son los del
   informe de la visita (css/visita.css, @media print) más la página con
   nombre «acta» de css/calidad.css. */

import { el, ahora } from './utiles.js';

export const CONTACTO = 'hola.coordinate.rd@gmail.com · coordinate.do · Santo Domingo, RD';
export const LEMA = 'Los problemas se resuelven en el modelo, no en obra.';

export function logotipo() {
  const marca = el('span', { class: 'marca', 'aria-label': 'COORDINATE' });
  marca.innerHTML = 'C<svg viewBox="10 10 44 44" aria-hidden="true">'
    + '<g fill="currentColor"><circle cx="32.00" cy="14.67" r="4.53"/><circle cx="44.25" cy="19.75" r="4.53"/><circle cx="49.33" cy="32.00" r="4.53"/><circle cx="44.25" cy="44.25" r="4.53"/><circle cx="32.00" cy="49.33" r="4.53"/><circle cx="19.75" cy="44.25" r="4.53"/><circle cx="14.67" cy="32.00" r="4.53"/><circle cx="19.75" cy="19.75" r="4.53"/></g>'
    + '<circle cx="32" cy="32" r="6" fill="#62a0e8"/></svg>ORDINATE';
  return marca;
}

/* Un documento: lleva la cuenta de sus secciones numeradas. */
export function documento() {
  let n = 0;
  return {
    titulo(texto, extra) {
      n += 1;
      return el('h2', { class: 'informe-h2' },
        el('span', { class: 'informe-h2-n' }, String(n).padStart(2, '0')),
        el('span', {}, texto),
        extra ? el('span', { class: 'informe-h2-extra' }, extra) : null);
    }
  };
}

export const dato = (t, valor) => el('div', { class: 'informe-dato' }, el('span', {}, t), el('strong', {}, valor || '—'));
export const cifra = (n, t, clase = '') => el('div', { class: `informe-cifra ${clase}` }, el('strong', {}, String(n)), el('span', {}, t));

export function cabecera(tipoDoc, numeroDoc, h1, obra) {
  return [
    el('div', { class: 'informe-banda' }, logotipo(),
      el('div', { class: 'informe-banda-doc' }, el('span', { class: 'informe-tipo' }, tipoDoc), el('strong', {}, numeroDoc))),
    el('header', { class: 'informe-cabecera' },
      el('div', {}, el('h1', {}, h1), el('p', { class: 'informe-obra' }, obra || 'Obra sin nombre')),
      el('div', { class: 'informe-sello' }, el('span', {}, 'Emitido'),
        el('strong', {}, new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })), el('span', {}, ahora())))
  ];
}

export const pie = () => el('footer', { class: 'informe-pie informe-pie-pegado' }, el('span', {}, LEMA), el('span', {}, CONTACTO));

/* Recuadro de firma. La firma va como fondo y no como <img>: Chrome a
   veces manda una imagen sola a la página siguiente y parte el bloque. */
export function hueco(url) {
  return el('div', {
    class: 'informe-hueco', role: url ? 'img' : null, 'aria-label': url ? 'Firma' : null,
    style: url ? `background: url("${url}") left bottom / contain no-repeat` : null
  });
}

export function cajaFirma(url, nombre, papel) {
  return el('div', { class: 'informe-firma-caja' }, hueco(url), el('strong', {}, nombre || 'Nombre y cargo'), el('span', {}, papel));
}

/* Pone el documento en el <article class="informe"> y abre el diálogo de
   impresión, con las imágenes (y firmas de fondo) ya decodificadas. */
export async function imprimir(articulo, nombre, nodos, { pagina = null } = {}) {
  articulo.replaceChildren(...el('div', {}, ...nodos).childNodes);
  // Página con nombre (pie de página propio): «acta» por defecto (calidad).
  articulo.style.page = pagina || '';
  await Promise.all([...articulo.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  await Promise.all([...articulo.querySelectorAll('.informe-hueco[style], .informe-firma-celda[style]')].map((n) => {
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
