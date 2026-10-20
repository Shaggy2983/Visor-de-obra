/* Piezas comunes de la visita diaria, los planos y los informes. */

export function el(etiqueta, atributos = {}, ...hijos) {
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

export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const dos = (n) => String(n).padStart(2, '0');

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function ahora() {
  const d = new Date();
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function fechaLarga(iso) {
  if (!iso) return 'Sin fecha';
  const [a, m, d] = iso.split('-').map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export async function decodificar(archivo) {
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

/* Dibuja una imagen (o un lienzo ya pintado) con el lado mayor limitado y
   la devuelve como JPEG. El fondo blanco evita que las transparencias de
   un PNG salgan negras. */
export async function reducirImagen(fuente, lado, calidad) {
  const imagen = fuente instanceof Blob ? await decodificar(fuente) : fuente;
  const ancho = imagen.width, alto = imagen.height;
  const escala = Math.min(1, lado / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  if (fuente instanceof Blob && imagen.close) imagen.close();
  const blob = await new Promise((cumplir) => lienzo.toBlob(cumplir, 'image/jpeg', calidad));
  return { blob, ancho: lienzo.width, alto: lienzo.height };
}

export function aDatos(blob) {
  return new Promise((cumplir, fallar) => {
    const lector = new FileReader();
    lector.onload = () => cumplir(lector.result);
    lector.onerror = () => fallar(lector.error);
    lector.readAsDataURL(blob);
  });
}

export async function deDatos(url) {
  return (await fetch(url)).blob();
}

export function descargar(blob, nombre) {
  const enlace = el('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 30000);
}

/* Convierte lo que se escribe en un campo de enlace en una URL web
   segura (http o https), o null si es una referencia sin dirección
   («Plano A-201», «Especificación 09 91 23»). Así nunca se enlaza a
   javascript:, data: ni similares. */
export function enlaceSeguro(texto) {
  const t = (texto || '').trim();
  if (!t || /\s/.test(t)) return null;
  let candidato = t;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    // «www.marca.com/ficha» o «marca.com»: se le pone https delante.
    if (!/^[^/]+\.[a-z]{2,}(\/|$)/i.test(t)) return null;
    candidato = `https://${t}`;
  }
  try {
    const url = new URL(candidato);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (e) {
    return null;
  }
}
