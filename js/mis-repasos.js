/* «Mis repasos»: lo que ve un contratista en la lista de visitas. Son los
   repasos del punch list que le han asignado en obras compartidas: ve la
   foto del defecto, sube la del arreglo y lo marca como corregido. No
   puede cerrarlo; eso lo hace quien verifica en obra. */

import { listarRepasos, guardarRepaso } from './partes.js';
import { el, nuevoId, hoy, ahora, plural, reducirImagen } from './utiles.js';
import { CATEGORIAS, ESTADOS } from './repasos.js';

const estadoDe = (r) => (r.cerrado ? 'cerrado' : r.corregido ? 'corregido' : 'pendiente');

/* opciones: { grupo, contenedor, entradaCamara, entradaGaleria, uid() → uid
   o null, avisar(texto, ms), ampliar(url), ladoFoto, calidadFoto } */
export function crearMisRepasos(opciones) {
  const { grupo, contenedor } = opciones;
  let urls = [];
  let destino = null;     // repaso al que va la foto que se está haciendo

  function liberar() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  async function pintar() {
    const uid = opciones.uid();
    const mios = uid ? (await listarRepasos()).filter((r) => r.asignado === uid) : [];
    grupo.hidden = !mios.length;
    if (!mios.length) return;
    liberar();
    // Primero lo pendiente; dentro, por obra y número.
    const peso = { pendiente: 0, corregido: 1, cerrado: 2 };
    mios.sort((a, b) => peso[estadoDe(a)] - peso[estadoDe(b)]
      || (a.obra || '').localeCompare(b.obra || '', 'es') || a.numero - b.numero);
    const pendientes = mios.filter((r) => estadoDe(r) === 'pendiente').length;
    contenedor.replaceChildren(...el('div', {},
      el('p', { class: 'pie' }, pendientes
        ? `${plural(pendientes, 'repaso por corregir', 'repasos por corregir')}. Haz la foto del arreglo y márcalo como corregido.`
        : 'Todo lo asignado está corregido. Quien verifica en obra lo cerrará.'),
      ...mios.map(tarjeta)
    ).childNodes);
  }

  function miniaturas(fotos) {
    return el('div', { class: 'nota-fotos' }, ...fotos.map((f) => {
      const u = URL.createObjectURL(f.blob);
      urls.push(u);
      return el('figure', {}, el('img', { src: u, alt: '', onclick: () => opciones.ampliar(u) }));
    }));
  }

  function tarjeta(r) {
    const estado = estadoDe(r);
    const antes = r.fotos.filter((f) => f.fase === 'antes');
    const despues = r.fotos.filter((f) => f.fase === 'despues');
    return el('article', { class: `repaso mi-repaso estado-${estado}` },
      el('div', { class: 'mi-repaso-cabecera' },
        el('span', { class: 'repaso-num' }, String(r.numero)),
        el('div', { class: 'repaso-textos' },
          el('strong', {}, r.obra || 'Obra'),
          el('span', {}, [r.zona, CATEGORIAS[r.categoria]].filter(Boolean).join(' · '))),
        el('span', { class: 'repaso-estado' }, ESTADOS[estado])),
      el('p', { class: 'mi-repaso-texto' }, r.texto || 'Sin descripción'),
      r.prioridad === 'alta' && el('p', { class: 'pie prioridad' }, 'Prioridad alta'),
      antes.length > 0 && el('h3', { class: 'mi-repaso-sub' }, 'Antes'),
      antes.length > 0 && miniaturas(antes),
      el('h3', { class: 'mi-repaso-sub' }, 'Después'),
      despues.length > 0 ? miniaturas(despues) : el('p', { class: 'pie' }, 'Todavía sin foto del arreglo.'),
      estado !== 'cerrado' && el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'boton', onclick: () => pedirFoto(r) }, '+ Foto del arreglo'),
        el('button', { type: 'button', class: 'enlace', onclick: () => pedirFoto(r, true) }, 'Galería'),
        estado === 'pendiente'
          ? el('button', { type: 'button', class: 'boton boton-destacado', onclick: () => marcar(r, true) }, 'Marcar corregido')
          : el('button', { type: 'button', class: 'enlace', onclick: () => marcar(r, false) }, 'Volver a pendiente'))
    );
  }

  async function marcar(r, corregido) {
    r.corregido = corregido ? hoy() : null;
    r.modificado = Date.now();
    await guardarRepaso(r);
    opciones.avisar(corregido ? `Repaso ${r.numero} marcado como corregido.` : `Repaso ${r.numero} vuelve a pendiente.`);
    pintar();
  }

  function pedirFoto(r, galeria = false) {
    destino = r;
    (galeria ? opciones.entradaGaleria : opciones.entradaCamara).click();
  }

  async function anadirFotos(archivos) {
    const r = destino;
    destino = null;
    if (!r || !archivos.length) return;
    opciones.avisar('Guardando foto…');
    for (const archivo of archivos) {
      try {
        const { blob } = await reducirImagen(archivo, opciones.ladoFoto, opciones.calidadFoto);
        if (blob) r.fotos.push({ id: nuevoId(), blob, fase: 'despues', fecha: hoy(), hora: ahora() });
      } catch (e) {
        opciones.avisar('No se ha podido leer la imagen.', 4000);
      }
    }
    // La foto del arreglo es la señal de que está corregido.
    if (!r.corregido) r.corregido = hoy();
    r.modificado = Date.now();
    await guardarRepaso(r);
    opciones.avisar(`Repaso ${r.numero} corregido. Se enviará en cuanto haya señal.`, 3500);
    pintar();
  }

  for (const entrada of [opciones.entradaCamara, opciones.entradaGaleria]) {
    entrada.addEventListener('change', () => {
      const archivos = [...entrada.files];
      entrada.value = '';
      anadirFotos(archivos);
    });
  }

  return { pintar, liberar };
}
