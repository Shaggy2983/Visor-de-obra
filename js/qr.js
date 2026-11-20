/* Códigos QR para pegar en obra: el de la obra abre su lista de visitas y el
   de un elemento del modelo abre el visor en ese elemento. Se genera en el
   teléfono (qrcode-generator, MIT, en vendor/qrcode) y se entrega como
   etiqueta PNG para imprimir, compartir o guardar. Sin servicios externos. */
import qrcode from '../vendor/qrcode/qrcode.mjs';
import { el } from './utiles.js';

/* Dirección absoluta de una página de la app, con sus parámetros. */
export function enlaceApp(pagina, parametros = {}) {
  const u = new URL(pagina, location.href);
  u.search = '';
  u.hash = '';
  for (const [k, v] of Object.entries(parametros)) if (v) u.searchParams.set(k, v);
  return u.href;
}

function matriz(texto) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  return { n, oscuro: (f, c) => q.isDark(f, c) };
}

function partirLineas(ctx, texto, ancho, max = 2) {
  const palabras = String(texto || '').split(/\s+/);
  const lineas = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) {
      lineas.push(linea);
      linea = p;
    } else linea = prueba;
  }
  if (linea) lineas.push(linea);
  if (lineas.length > max) {
    lineas.length = max;
    lineas[max - 1] = `${lineas[max - 1].replace(/.{0,1}$/, '')}…`;
  }
  return lineas;
}

/* Etiqueta en PNG de 900 × 1100 px: marca, título, QR y pie. Siempre en
   claro (es para papel), con la paleta Acero de los impresos. */
export async function etiquetaQR({ titulo, subtitulo, url }) {
  const W = 900;
  const H = 1100;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  await document.fonts?.ready;
  const fuente = (peso, px) => `${peso} ${px}px Inter, system-ui, sans-serif`;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b3560';
  ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#ffffff';
  ctx.font = fuente(700, 44);
  ctx.textBaseline = 'middle';
  ctx.fillText('C◎ORDINATE', 48, 56);
  ctx.font = fuente(500, 26);
  ctx.textAlign = 'right';
  ctx.fillText('Visita de obra', W - 48, 58);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#121826';
  ctx.font = fuente(700, 46);
  ctx.textBaseline = 'alphabetic';
  let y = 182;
  for (const l of partirLineas(ctx, titulo, W - 96)) { ctx.fillText(l, 48, y); y += 54; }
  if (subtitulo) {
    ctx.fillStyle = '#3d7cc4';
    ctx.font = fuente(500, 30);
    for (const l of partirLineas(ctx, subtitulo, W - 96, 2)) { ctx.fillText(l, 48, y); y += 38; }
  }

  const { n, oscuro } = matriz(url);
  const borde = 4;
  const lado = 640;
  const modulo = Math.floor(lado / (n + borde * 2));
  const real = modulo * (n + borde * 2);
  const x0 = Math.round((W - real) / 2);
  const y0 = Math.max(y + 10, 300);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x0, y0, real, real);
  ctx.fillStyle = '#121826';
  for (let f = 0; f < n; f += 1) {
    for (let col = 0; col < n; col += 1) {
      if (oscuro(f, col)) ctx.fillRect(x0 + (col + borde) * modulo, y0 + (f + borde) * modulo, modulo, modulo);
    }
  }

  ctx.fillStyle = '#5b6576';
  ctx.font = fuente(500, 24);
  ctx.textAlign = 'center';
  ctx.fillText('Escanea con la cámara del teléfono', W / 2, H - 58);
  ctx.font = fuente(400, 20);
  ctx.fillText('Los problemas se resuelven en el modelo, no en obra.', W / 2, H - 26);

  return new Promise((ok) => c.toBlob(ok, 'image/png'));
}

const archivoDe = (titulo) => `qr-${String(titulo || 'coordinate').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50)}.png`;

/* Hoja con el QR y las acciones: compartir/imprimir, guardar y copiar el enlace. */
export async function mostrarQR({ titulo, subtitulo, url, nota }) {
  const blob = await etiquetaQR({ titulo, subtitulo, url });
  const nombre = archivoDe(titulo);
  const imagen = URL.createObjectURL(blob);
  const archivo = new File([blob], nombre, { type: 'image/png' });
  const puedeCompartir = Boolean(navigator.canShare && navigator.canShare({ files: [archivo] }));

  const estado = el('p', { class: 'qr-estado', role: 'status' });
  const cerrar = () => { dialogo.close(); dialogo.remove(); URL.revokeObjectURL(imagen); };
  const dialogo = el('dialog', { class: 'dialogo qr-dialogo', 'aria-label': `Código QR · ${titulo}` },
    el('h2', {}, 'Código QR'),
    el('img', { class: 'qr-imagen', src: imagen, alt: `Etiqueta con el código QR de ${titulo}` }),
    nota ? el('p', { class: 'qr-nota' }, nota) : null,
    el('div', { class: 'qr-acciones' },
      puedeCompartir
        ? el('button', {
          type: 'button', class: 'boton', onclick: async () => {
            try { await navigator.share({ files: [archivo], title: titulo }); } catch { /* cancelado */ }
          }
        }, 'Compartir o imprimir')
        : null,
      el('a', { class: 'boton', href: imagen, download: nombre }, 'Guardar imagen'),
      el('button', {
        type: 'button', class: 'boton', onclick: async () => {
          try { await navigator.clipboard.writeText(url); estado.textContent = 'Enlace copiado.'; } catch { estado.textContent = url; }
        }
      }, 'Copiar enlace'),
      el('button', { type: 'button', class: 'boton', onclick: cerrar }, 'Cerrar')),
    estado);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  document.body.append(dialogo);
  dialogo.showModal();
}
