/* Planos de la visita: cargar un plano (PDF o imagen), verlo con zoom y
   desplazamiento con los dedos, y clavar en él notas numeradas con sus
   fotos. El plano se guarda una vez por obra; las notas son de cada
   visita y sus coordenadas van en fracción del plano (0–1), así no
   dependen de la resolución con que se cargó. */

import { el, nuevoId, ahora, reducirImagen, decodificar } from './utiles.js';

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
    salida.push({ ...imagen, nombre: total > 1 ? `${nombreBase(archivo)} · p. ${n}` : nombreBase(archivo) });
    lienzo.width = lienzo.height = 0;
    pagina.cleanup();
  }
  await documento.destroy();
  return salida;
}

/* Devuelve los planos listos para guardar (uno por página si es un PDF). */
export async function leerArchivoPlano(archivo, obra, alProgreso = () => {}) {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
  const imagenes = esPdf
    ? await paginasDePdf(archivo, alProgreso)
    : [{ ...(await reducirImagen(archivo, LADO_PLANO, CALIDAD_PLANO)), nombre: nombreBase(archivo) }];
  return imagenes.map((i) => ({
    id: nuevoId(),
    nombre: i.nombre,
    obra: obra || '',
    blob: i.blob,
    ancho: i.ancho,
    alto: i.alto,
    creado: Date.now()
  }));
}

/* ------------------------------------------------------------------ */
/* plano con sus notas pintadas, para el informe                       */
/* ------------------------------------------------------------------ */

export async function componerPlano(plano, notas, lado = 2400) {
  const imagen = await decodificar(plano.blob);
  const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  if (imagen.close) imagen.close();
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
     alCerrar()                el usuario pide salir del plano          */
export function crearVisorPlano(opciones) {
  const $ = (id) => document.getElementById(id);
  const n = {
    capa: $('plano-capa'),
    nombre: $('plano-nombre'),
    cerrar: $('plano-cerrar'),
    modo: $('plano-modo'),
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
  let modo = 'ver';          // 'ver' | 'anadir' | 'mover'
  const vista = { escala: 1, tx: 0, ty: 0, minimo: 0.1, maximo: 4 };

  const visita = () => opciones.visita();
  const notasDelPlano = () => visita().notas.filter((x) => x.plano === plano.id);
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

  n.marco.addEventListener('pointerdown', (ev) => {
    n.marco.setPointerCapture(ev.pointerId);
    const p = local(ev);
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1) {
      gesto = { inicio: p, ultimo: p, tiempo: performance.now(), movido: false, pin: ev.target.closest('.pin') };
    } else if (punteros.size === 2) {
      gesto.movido = true;
      const d = datosPinza();
      gesto.pinza = { ...d, escala: vista.escala, tx: vista.tx, ty: vista.ty };
    }
  });

  n.marco.addEventListener('pointermove', (ev) => {
    if (!punteros.has(ev.pointerId) || !gesto) return;
    const p = local(ev);
    punteros.set(ev.pointerId, p);
    if (punteros.size === 1) {
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
    } else if (punteros.size === 0) {
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

  function tocar(p, pin) {
    const x = (p.x - vista.tx) / vista.escala / plano.ancho;
    const y = (p.y - vista.ty) / vista.escala / plano.alto;
    const dentro = x >= 0 && x <= 1 && y >= 0 && y <= 1;

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
    if (pin) seleccionar(pin.dataset.id);
    else if (seleccionada) seleccionar(null);
  }

  function ponerModo(nuevo) {
    modo = nuevo;
    n.capa.classList.toggle('anadiendo', modo !== 'ver');
    n.modo.textContent = modo === 'ver' ? '+ Nota' : 'Cancelar';
    n.modo.classList.toggle('boton-destacado', modo === 'ver');
    const k = nota(seleccionada);
    n.ayuda.textContent = modo === 'anadir'
      ? 'Toca el plano donde quieras la nota.'
      : modo === 'mover' && k
        ? `Toca el nuevo sitio de la nota ${k.numero}.`
        : 'Pellizca para acercar. Toca un número para ver su nota.';
  }

  n.modo.addEventListener('click', () => {
    ponerModo(modo === 'ver' ? 'anadir' : 'ver');
    if (modo === 'anadir') seleccionar(null);
  });

  /* --- pines y hoja de la nota --- */

  function pintarPines() {
    n.pines.replaceChildren(...notasDelPlano().map((k) => el('button', {
      type: 'button',
      class: `pin tipo-${k.tipo}${k.id === seleccionada ? ' activo' : ''}`,
      'data-id': k.id,
      style: `left:${k.x * 100}%;top:${k.y * 100}%`,
      'aria-label': `Nota ${k.numero}`
    }, String(k.numero))));
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
      ponerModo('ver');
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
      document.documentElement.classList.remove('con-plano');
    },

    /* Repintar tras un cambio hecho fuera del visor (fotos nuevas…). */
    refrescar() {
      if (!plano) return;
      pintarPines();
      pintarHoja();
    }
  };
}
