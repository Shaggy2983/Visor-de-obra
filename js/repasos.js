/* Punch list de terminaciones: lo que hay que repasar antes de entregar
   (pintura, pañete, cerámica, carpintería…), cada cosa con su número, su
   zona, quién la corrige y fotos de antes y de después.

   Los repasos son de la obra, no de una visita: siguen apareciendo en las
   visitas siguientes hasta que se cierran. Cada cambio de estado y cada
   foto llevan la fecha de la visita en que se hicieron, así el informe de
   una visita antigua enseña la lista tal como estaba ese día. */

import { listarRepasos, guardarRepaso, borrarRepaso } from './partes.js';
import { el, nuevoId, ahora, plural, reducirImagen, mismaObra } from './utiles.js';

export const CATEGORIAS = {
  pintura: 'Pintura',
  panete: 'Pañete y empastado',
  ceramica: 'Cerámica y pisos',
  plafon: 'Plafón y techos',
  carpinteria: 'Puertas y carpintería',
  ventanas: 'Ventanas y vidrios',
  sanitarios: 'Sanitarios y grifería',
  electrico: 'Eléctrico',
  impermeabilizacion: 'Impermeabilización',
  limpieza: 'Limpieza',
  otros: 'Otros'
};

export const ESTADOS = { pendiente: 'Pendiente', corregido: 'Corregido', cerrado: 'Cerrado' };
export const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const FILTROS = {
  abiertos: 'Abiertos',
  pendiente: 'Por corregir',
  corregido: 'Por verificar',
  cerrado: 'Cerrados',
  todos: 'Todos'
};

/* Estado de un repaso el día de una visita. */
export function estadoEn(r, fecha) {
  if (r.cerrado && r.cerrado <= fecha) return 'cerrado';
  if (r.corregido && r.corregido <= fecha) return 'corregido';
  return 'pendiente';
}

/* Fotos de una fase («antes» o «despues») que ya existían ese día. */
export function fotosEn(r, fecha, fase) {
  return r.fotos.filter((f) => f.fase === fase && (f.fecha || '') <= fecha);
}

/* Los repasos que tocan en una visita: los de su obra abiertos ese día
   (o cerrados ese mismo día) y los que se crearon en ella. */
export function repasosDe(todos, v) {
  return todos
    .filter((r) => r.visita === v.id
      || (mismaObra(r.obra, v.obra) && r.desde <= v.fecha && !(r.cerrado && r.cerrado < v.fecha)))
    .sort((a, b) => a.numero - b.numero);
}

export function cuentaEstados(lista, fecha) {
  const cuenta = { pendiente: 0, corregido: 0, cerrado: 0 };
  for (const r of lista) cuenta[estadoEn(r, fecha)]++;
  return cuenta;
}

/* Fechas de un repaso en una línea: «desde 2026-10-12 · corregido 2026-10-20». */
export function historial(r, fecha) {
  return [
    `desde ${r.desde}`,
    r.corregido && r.corregido <= fecha && `corregido ${r.corregido}`,
    r.cerrado && r.cerrado <= fecha && `cerrado ${r.cerrado}`
  ].filter(Boolean).join(' · ');
}

/* La sección del punch list en la ficha de la visita. */
/* contratistas(visita) → [{uid, nombre}]: quienes tienen papel de
   contratista en la obra compartida de la visita (vacío si no lo es). */
/* plano: { nombre(id) → nombre del plano o null, ubicar(r), ver(r) }:
   situar el repaso en un plano de la obra y verlo allí. */
export function crearPunchList({ nodos, visita, avisar, ampliar, alGuardar, ladoFoto, calidadFoto, contratistas = () => [], plano = null }) {
  let todos = [];
  let filtro = 'abiertos';
  const desplegados = new Set();
  let urls = [];
  const sucios = new Set();
  let temporizador = null;
  let destinoFoto = null;   // { repaso, fase } o { nuevo: true }

  function liberar() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  function urlDe(blob) {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  }

  async function cargar() {
    try {
      todos = await listarRepasos();
    } catch (e) {
      todos = [];
    }
    pintar();
  }

  /* --- guardado: cada repaso es un registro aparte --- */

  function cambiado(r) {
    r.modificado = Date.now();
    sucios.add(r);
    alGuardar('Guardando…');
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarYa, 500);
  }

  async function guardarYa() {
    clearTimeout(temporizador);
    if (!sucios.size) return;
    const lote = [...sucios];
    sucios.clear();
    try {
      for (const r of lote) await guardarRepaso(r);
      alGuardar(`Guardado ${ahora()}`);
    } catch (e) {
      for (const r of lote) sucios.add(r);
      alGuardar('Sin guardar');
      avisar('No se ha podido guardar el punch list. ¿Queda espacio en el teléfono?', 5000);
    }
  }

  /* --- datos --- */

  function siguienteNumero(obra) {
    return todos.filter((r) => mismaObra(r.obra, obra)).reduce((m, r) => Math.max(m, r.numero), 0) + 1;
  }

  /* El nuevo repaso hereda la zona y el tipo del último: se suele ir
     estancia por estancia apuntando varios seguidos. */
  function nuevo(v) {
    const ultimo = todos.filter((r) => mismaObra(r.obra, v.obra)).sort((a, b) => b.creado - a.creado)[0];
    const r = {
      id: nuevoId(),
      obra: v.obra,
      visita: v.id,
      numero: siguienteNumero(v.obra),
      zona: ultimo ? ultimo.zona : '',
      categoria: ultimo ? ultimo.categoria : 'pintura',
      texto: '',
      responsable: '',
      prioridad: 'media',
      fotos: [],
      desde: v.fecha,
      corregido: null,
      cerrado: null,
      creado: Date.now(),
      modificado: Date.now()
    };
    todos.push(r);
    desplegados.add(r.id);
    if (filtro !== 'todos' && filtro !== 'abiertos' && filtro !== 'pendiente') filtro = 'abiertos';
    cambiado(r);
    return r;
  }

  function cambiarEstado(r, estado, fecha) {
    const antes = (f) => (f && f <= fecha ? f : fecha);
    if (estado === 'pendiente') {
      r.corregido = null;
      r.cerrado = null;
    } else if (estado === 'corregido') {
      r.corregido = antes(r.corregido);
      r.cerrado = null;
    } else {
      r.corregido = antes(r.corregido);
      r.cerrado = fecha;
    }
    cambiado(r);
  }

  async function anadirFotos(archivos) {
    const v = visita();
    const destino = destinoFoto;
    destinoFoto = null;
    if (!v || !destino || !archivos.length) return;
    avisar(archivos.length > 1 ? `Guardando ${archivos.length} fotos…` : 'Guardando foto…');
    const fotos = [];
    for (const archivo of archivos) {
      try {
        const { blob } = await reducirImagen(archivo, ladoFoto, calidadFoto);
        if (blob) fotos.push({ id: nuevoId(), blob, fecha: v.fecha, hora: ahora() });
      } catch (e) {
        avisar(`No se ha podido leer ${archivo.name || 'la imagen'}.`, 4000);
      }
    }
    if (!fotos.length) return;
    const r = destino.nuevo ? nuevo(v) : destino.repaso;
    const fase = destino.nuevo ? 'antes' : destino.fase;
    for (const f of fotos) r.fotos.push({ ...f, fase });
    // La foto del arreglo hecho es la señal de que está corregido.
    if (fase === 'despues' && estadoEn(r, v.fecha) === 'pendiente') {
      cambiarEstado(r, 'corregido', v.fecha);
      avisar(`Repaso ${r.numero} pasa a corregido. Ciérralo cuando lo verifiques.`, 4000);
    } else {
      avisar(fotos.length > 1 ? 'Fotos guardadas.' : 'Foto guardada.');
    }
    cambiado(r);
    await guardarYa();
    if (visita() === v) {
      pintar();
      if (destino.nuevo) enfocar(r);
    }
  }

  function pedirFoto(destino, galeria = false) {
    destinoFoto = destino;
    (galeria ? nodos.entradaGaleria : nodos.entradaCamara).click();
  }

  function enfocar(r) {
    const tarjeta = nodos.lista.querySelector(`[data-repaso="${r.id}"]`);
    if (!tarjeta) return;
    tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const texto = tarjeta.querySelector('textarea');
    if (texto) texto.focus({ preventScroll: true });
  }

  /* --- pintar --- */

  function lista(v = visita()) {
    return v ? repasosDe(todos, v) : [];
  }

  function visibles(v) {
    return lista(v).filter((r) => {
      const e = estadoEn(r, v.fecha);
      if (filtro === 'todos') return true;
      if (filtro === 'abiertos') return e !== 'cerrado' || r.cerrado === v.fecha || desplegados.has(r.id);
      return e === filtro;
    });
  }

  function pintar() {
    const v = visita();
    if (!v) return;
    // Los repasos creados en esta visita siguen el nombre de la obra si se corrige.
    for (const r of todos) {
      if (r.visita === v.id && r.obra !== v.obra) { r.obra = v.obra; cambiado(r); }
    }
    liberar();
    const todosVisita = lista(v);
    const cuenta = cuentaEstados(todosVisita, v.fecha);
    nodos.total.textContent = todosVisita.length
      ? [cuenta.pendiente && `${cuenta.pendiente} por corregir`, cuenta.corregido && `${cuenta.corregido} por verificar`]
        .filter(Boolean).join(' · ') || 'Todo cerrado'
      : '';
    nodos.filtros.hidden = !todosVisita.length;
    nodos.filtros.replaceChildren(...Object.entries(FILTROS).map(([clave, texto]) => el('button', {
      type: 'button',
      class: filtro === clave ? 'chip activo' : 'chip',
      'aria-pressed': String(filtro === clave),
      onclick: () => { filtro = clave; pintar(); }
    }, texto)));
    nodos.pdf.hidden = !todosVisita.length;

    const empresas = [...new Set(v.personal.map((p) => p.empresa.trim()).filter(Boolean))];
    const sugerencias = el('datalist', { id: 'empresas-repaso' }, ...empresas.map((e) => el('option', { value: e })));
    const mostrar = visibles(v);
    nodos.lista.replaceChildren(sugerencias, ...mostrar.map((r) => tarjeta(r, v)));
    if (!todosVisita.length) {
      nodos.lista.append(el('p', { class: 'pie' }, 'Sin repasos en esta obra. Recorre las terminaciones y apunta cada defecto con su foto.'));
    } else if (!mostrar.length) {
      nodos.lista.append(el('p', { class: 'pie' }, 'Ningún repaso en este apartado.'));
    }
  }

  function miniatura(foto, clase) {
    if (!foto) return el('span', { class: `repaso-mini vacia ${clase}` });
    return el('img', { class: `repaso-mini ${clase}`, src: urlDe(foto.blob), alt: '', loading: 'lazy' });
  }

  function tarjeta(r, v) {
    const estado = estadoEn(r, v.fecha);
    const abierto = desplegados.has(r.id);
    const antes = fotosEn(r, v.fecha, 'antes');
    const despues = fotosEn(r, v.fecha, 'despues');
    return el('article', { class: `repaso estado-${estado} prioridad-${r.prioridad}`, 'data-repaso': r.id },
      el('button', {
        type: 'button', class: 'repaso-resumen', 'aria-expanded': String(abierto),
        onclick: () => {
          if (abierto) desplegados.delete(r.id); else desplegados.add(r.id);
          pintar();
        }
      },
        el('span', { class: 'repaso-num' }, String(r.numero)),
        el('span', { class: 'repaso-textos' },
          el('strong', {}, [r.zona, CATEGORIAS[r.categoria]].filter(Boolean).join(' · ') || 'Sin zona'),
          el('span', {}, r.texto || 'Sin descripción'),
          r.asignado && el('span', { class: 'repaso-asignado' }, `→ ${r.asignadoNombre || 'Contratista'}`)),
        miniatura(antes[antes.length - 1], 'antes'),
        miniatura(despues[despues.length - 1], 'despues'),
        el('span', { class: 'repaso-estado' }, ESTADOS[estado])
      ),
      abierto && editor(r, v, estado, antes, despues)
    );
  }

  function campo(etiqueta, control) {
    return el('label', {}, etiqueta, control);
  }

  function opciones(mapa, actual) {
    return Object.entries(mapa).map(([valor, texto]) => el('option', { value: valor, selected: actual === valor }, texto));
  }

  function editor(r, v, estado, antes, despues) {
    const editar = (clave) => (ev) => { r[clave] = ev.target.value; cambiado(r); };
    return el('div', { class: 'repaso-editor' },
      el('div', { class: 'chips repaso-estados', role: 'radiogroup', 'aria-label': 'Estado' },
        ...Object.entries(ESTADOS).map(([clave, texto]) => el('button', {
          type: 'button', role: 'radio',
          class: estado === clave ? `chip activo estado-${clave}` : 'chip',
          'aria-checked': String(estado === clave),
          onclick: () => {
            if (estado === clave) return;
            cambiarEstado(r, clave, v.fecha);
            pintar();
          }
        }, texto))),
      el('div', { class: 'dos' },
        campo('Zona', el('input', {
          class: 'campo', value: r.zona, placeholder: 'Planta, apto., estancia, eje', oninput: editar('zona')
        })),
        campo('Tipo', el('select', { class: 'campo', onchange: editar('categoria') }, ...opciones(CATEGORIAS, r.categoria)))
      ),
      campo('Qué hay que corregir', el('textarea', {
        class: 'campo', rows: 2, value: r.texto,
        placeholder: 'p. ej. Fisura en esquina de ventana, repintar paño completo',
        oninput: editar('texto')
      })),
      el('div', { class: 'dos' },
        campo('Responsable', el('input', {
          class: 'campo', value: r.responsable, list: 'empresas-repaso', placeholder: 'Empresa u oficio',
          oninput: editar('responsable')
        })),
        campo('Prioridad', el('select', {
          class: 'campo', onchange: (ev) => { r.prioridad = ev.target.value; cambiado(r); pintar(); }
        }, ...opciones(PRIORIDADES, r.prioridad)))
      ),
      asignacion(r, v),
      ubicacion(r),
      filaFotos(r, 'antes', 'Antes (defecto)', antes),
      filaFotos(r, 'despues', 'Después (corregido)', despues),
      el('div', { class: 'repaso-pie' },
        el('span', { class: 'pie' }, historial(r, v.fecha)),
        el('button', {
          type: 'button', class: 'enlace boton-peligro-texto',
          onclick: () => quitar(r)
        }, 'Borrar repaso')
      )
    );
  }

  /* En una obra compartida, el repaso se puede asignar a un contratista:
     lo verá en su teléfono, subirá la foto de después y lo marcará como
     corregido. */
  function asignacion(r, v) {
    const lista = contratistas(v);
    if (!lista.length && !r.asignado) return null;
    const opciones = [{ uid: '', nombre: 'Nadie' }, ...lista];
    if (r.asignado && !lista.some((c) => c.uid === r.asignado)) {
      opciones.push({ uid: r.asignado, nombre: r.asignadoNombre || 'Contratista' });
    }
    return campo('Asignado a (contratista)', el('select', {
      class: 'campo',
      onchange: (ev) => {
        const elegido = opciones.find((c) => c.uid === ev.target.value);
        r.asignado = elegido && elegido.uid ? elegido.uid : null;
        r.asignadoNombre = r.asignado ? elegido.nombre : null;
        if (r.asignado && !r.responsable) r.responsable = elegido.nombre;
        cambiado(r);
        pintar();
      }
    }, ...opciones.map((c) => el('option', { value: c.uid, selected: (r.asignado || '') === c.uid }, c.nombre))));
  }

  /* Dónde está el repaso en un plano de la obra («R3» sobre el plano). */
  function ubicacion(r) {
    if (!plano) return null;
    const nombre = r.ubicacion && plano.nombre(r.ubicacion.plano);
    return el('div', { class: 'repaso-ubicacion' },
      r.ubicacion
        ? [el('span', { class: 'pie' }, `📍 En el plano ${nombre ? `«${nombre}»` : ''}`),
          el('button', { type: 'button', class: 'enlace', onclick: () => plano.ver(r) }, 'Ver'),
          el('button', { type: 'button', class: 'enlace', onclick: () => plano.ubicar(r) }, 'Cambiar'),
          el('button', {
            type: 'button', class: 'enlace boton-peligro-texto',
            onclick: () => { r.ubicacion = null; cambiado(r); pintar(); }
          }, 'Quitar')]
        : el('button', { type: 'button', class: 'boton', onclick: () => plano.ubicar(r) }, '📍 Marcar en el plano'));
  }

  function filaFotos(r, fase, titulo, fotos) {
    return el('div', { class: 'repaso-fotos' },
      el('div', { class: 'repaso-fotos-cabecera' },
        el('h3', {}, titulo),
        el('button', { type: 'button', class: 'boton', onclick: () => pedirFoto({ repaso: r, fase }) }, '+ Foto'),
        el('button', { type: 'button', class: 'enlace', onclick: () => pedirFoto({ repaso: r, fase }, true) }, 'Galería')
      ),
      fotos.length > 0 && el('div', { class: 'nota-fotos' }, ...fotos.map((f) => {
        const url = urlDe(f.blob);
        return el('figure', {},
          el('img', { src: url, alt: `${titulo}, ${f.fecha} ${f.hora}`, onclick: () => ampliar(url) }),
          el('button', {
            type: 'button', class: 'boton quitar', title: 'Quitar foto', 'aria-label': 'Quitar foto',
            onclick: () => {
              if (!confirm('¿Quitar esta foto?')) return;
              r.fotos = r.fotos.filter((x) => x !== f);
              cambiado(r);
              pintar();
            }
          }, '✕'));
      }))
    );
  }

  async function quitar(r) {
    const fotos = r.fotos.length ? ` y ${plural(r.fotos.length, 'foto', 'fotos')}` : '';
    if (!confirm(`¿Borrar el repaso ${r.numero}${fotos}? Desaparece también de las demás visitas.`)) return;
    sucios.delete(r);
    todos = todos.filter((x) => x !== r);
    desplegados.delete(r.id);
    try {
      await borrarRepaso(r.id);
    } catch (e) {
      avisar('No se ha podido borrar.', 4000);
    }
    pintar();
  }

  /* --- cableado --- */

  nodos.nuevoFoto.addEventListener('click', () => pedirFoto({ nuevo: true }));
  nodos.nuevo.addEventListener('click', () => {
    const v = visita();
    if (!v) return;
    const r = nuevo(v);
    pintar();
    enfocar(r);
  });
  for (const entrada of [nodos.entradaCamara, nodos.entradaGaleria]) {
    entrada.addEventListener('change', () => {
      const archivos = [...entrada.files];
      entrada.value = '';
      anadirFotos(archivos);
    });
  }

  return {
    cargar,
    pintar,
    guardarYa,
    lista,
    /* Al cambiar de visita: nada desplegado y vuelta al filtro de abiertos. */
    reiniciar() {
      desplegados.clear();
      filtro = 'abiertos';
      liberar();
      return cargar();
    },
    liberar,
    todos: () => todos,
    /* Situar un repaso (lo llama el visor de planos). */
    ubicar(r, datos) {
      r.ubicacion = datos;
      cambiado(r);
      pintar();
    },
    /* Desplegar un repaso y llevarlo a la vista. */
    mostrarRepaso(id) {
      const r = todos.find((x) => x.id === id);
      if (!r) return;
      desplegados.add(id);
      const v = visita();
      if (v && filtro !== 'todos' && !visibles(v).includes(r)) filtro = 'todos';
      pintar();
      requestAnimationFrame(() => nodos.lista.querySelector(`[data-repaso="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }));
    }
  };
}
