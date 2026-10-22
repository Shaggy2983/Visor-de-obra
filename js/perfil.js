/* Perfil (perfil.html): tus datos (nombre, cargo, empresa, teléfono,
   foto), tus obras con tu papel en cada una, tus últimas bitácoras y la
   cuenta y el equipo. En #/obra/<id>, el espacio de una obra: miembros,
   equipos, cifras y bitácoras recientes.

   Lo que ven de ti los demás (nombre, cargo, empresa y foto) va en la
   ficha de cada obra y equipo; el teléfono, sólo en tu ficha privada. */

import { el, plural, fechaLarga, hoy, decodificar } from './utiles.js';
import { avisar } from './interfaz.js';
import { equipo, ROLES, PAPELES_EQUIPO } from './equipo.js';
import { iniciarEquipoUI } from './equipo-ui.js';
import { listarVisitas, listarRepasos, listarPlanos } from './partes.js';
import { incidencias, estadoRepaso, personasDe, firmada, autorDe, ultimaPorPersona, lunes, sumarDias } from './resumen.js';

const $ = (id) => document.getElementById(id);
const nodos = {
  vistaPerfil: $('vista-perfil'), vistaObra: $('vista-obra'), miPerfil: $('mi-perfil'), misObras: $('mis-obras'),
  misBitacoras: $('mis-bitacoras'), grupoEquipo: $('grupo-equipo'), titulo: $('titulo-seccion'), aviso: $('aviso')
};
const dialogo = $('dialogo');
const LADO_FOTO = 160;
const aviso = (t, ms) => avisar(nodos.aviso, t, ms);
// replaceChildren pintaría «null» o «false» de las piezas condicionales.
const poner = (nodo, ...hijos) => nodo.replaceChildren(...hijos.filter((h) => h != null && h !== false));

/* --- piezas --- */

function avatar(p, pequeno = false) {
  const clase = `avatar${pequeno ? ' pequeno' : ''}`;
  if (p && p.foto) return el('img', { class: clase, src: p.foto, alt: '' });
  return el('span', { class: clase, 'aria-hidden': 'true' }, ((p && p.nombre) || '?').charAt(0).toUpperCase());
}

const cifra = (valor, texto, clase = '') => el('div', { class: `cifra ${clase}` }, el('strong', {}, String(valor)), el('span', {}, texto));
const enlaceVisita = (id, texto = 'Abrir') => el('a', { class: 'enlace', href: `./visita.html#/v/${encodeURIComponent(id)}` }, texto);

function abrir(titulo, ...contenido) {
  const cerrar = el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => dialogo.close() }, '✕');
  dialogo.replaceChildren(el('div', { class: 'dialogo-cabecera' }, el('h2', {}, titulo), cerrar), el('div', { class: 'dialogo-cuerpo' }, ...contenido));
  if (!dialogo.open) dialogo.showModal();
}

/* Foto de perfil: cuadrada, recortada al centro, 160 px, JPEG. */
async function fotoCuadrada(archivo) {
  const img = await decodificar(archivo);
  const lado = Math.min(img.width, img.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = LADO_FOTO;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
  ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
  return lienzo.toDataURL('image/jpeg', 0.8);
}

/* --- mi perfil --- */

function pintarPerfil() {
  const p = { nombre: equipo.nombre, ...equipo.perfil };
  let miFirma = null;
  try { miFirma = localStorage.getItem('crd-mi-firma'); } catch (e) { /* sin memoria */ }
  nodos.miPerfil.hidden = false;
  poner(nodos.miPerfil, 
    el('div', { class: 'perfil-cabecera' },
      avatar(p),
      el('div', { class: 'perfil-datos' },
        el('h2', { class: 'perfil-nombre' }, equipo.nombre),
        el('p', { class: 'pie' }, [p.cargo, p.empresa].filter(Boolean).join(' · ') || 'Añade tu cargo y tu empresa'),
        el('p', { class: 'pie' }, [equipo.usuario.email, p.telefono].filter(Boolean).join(' · ')))),
    el('div', { class: 'fila-botones' },
      el('button', { type: 'button', class: 'boton boton-destacado', onclick: editarPerfil }, 'Editar perfil'),
      el('a', { class: 'boton', href: './panel.html' }, '📊 Panel diario y semanal')),
    el('h3', { class: 'panel-sub' }, 'Mi firma'),
    miFirma
      ? el('img', { class: 'firma-muestra', src: miFirma, alt: 'Tu firma guardada' })
      : null,
    el('p', { class: 'pie' }, miFirma
      ? 'Guardada en este dispositivo. En cada visita: «⭐ Usar mi firma».'
      : 'Todavía no hay firma guardada en este dispositivo. En una visita, firma o adjunta tu firma y pulsa «Guardar como mi firma».'));
}

function editarPerfil() {
  const p = { ...equipo.perfil };
  let foto = p.foto || '';
  const campo = (etiqueta, valor, atributos = {}) => {
    const i = el('input', { class: 'campo', value: valor || '', ...atributos });
    return { nodo: el('label', {}, etiqueta, i), valor: () => i.value };
  };
  const nombre = campo('Nombre y apellido', equipo.nombre, { autocomplete: 'name', required: true, maxlength: 80 });
  const cargo = campo('Cargo', p.cargo, { placeholder: 'p. ej. Coordinador BIM, Supervisor de obra', maxlength: 80 });
  const empresa = campo('Empresa', p.empresa, { maxlength: 80, autocomplete: 'organization' });
  const telefono = campo('Teléfono (sólo lo ves tú)', p.telefono, { type: 'tel', autocomplete: 'tel', maxlength: 30 });
  const vista = el('div', { class: 'perfil-cabecera' }, avatar({ nombre: equipo.nombre, foto }));
  const entrada = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const repintar = () => vista.replaceChildren(avatar({ nombre: nombre.valor() || equipo.nombre, foto }),
    el('div', { class: 'fila-botones' },
      el('button', { type: 'button', class: 'boton', onclick: () => entrada.click() }, foto ? 'Cambiar foto' : 'Poner foto'),
      foto && el('button', { type: 'button', class: 'enlace', onclick: () => { foto = ''; repintar(); } }, 'Quitar foto')));
  entrada.addEventListener('change', async () => {
    const a = entrada.files[0];
    entrada.value = '';
    if (!a) return;
    try { foto = await fotoCuadrada(a); repintar(); } catch (e) { aviso('No se ha podido leer la imagen.', 4000); }
  });
  repintar();
  const guardar = el('button', { type: 'submit', class: 'boton boton-destacado' }, 'Guardar');
  abrir('Mi perfil',
    el('form', {
      class: 'dialogo-formulario',
      onsubmit: async (ev) => {
        ev.preventDefault();
        guardar.disabled = true;
        guardar.textContent = 'Guardando…';
        try {
          await equipo.guardarPerfil({ nombre: nombre.valor(), cargo: cargo.valor(), empresa: empresa.valor(), telefono: telefono.valor(), foto });
          dialogo.close();
          aviso('Perfil guardado. Tu equipo verá los cambios en sus obras.');
        } catch (e) {
          console.error(e);
          aviso(e && e.code === 'unavailable' ? 'Sin conexión: prueba cuando haya señal.' : 'No se ha podido guardar el perfil.', 5000);
        } finally {
          guardar.disabled = false;
          guardar.textContent = 'Guardar';
        }
      }
    }, vista, entrada, nombre.nodo, cargo.nodo, empresa.nodo, telefono.nodo,
    el('p', { class: 'pie' }, 'Nombre, cargo, empresa y foto los ven los miembros de tus obras y equipos.'),
    guardar));
}

/* --- mis obras --- */

function pintarObras() {
  const uid = equipo.usuario.uid;
  nodos.misObras.hidden = false;
  const nombreEquipo = (id) => (equipo.equipos.find((e) => e.id === id) || {}).nombre;
  poner(nodos.misObras, 
    el('div', { class: 'grupo-cabecera' }, el('h2', {}, `Mis obras (${equipo.obras.length})`)),
    equipo.obras.length
      ? el('div', { class: 'rejilla tres' }, ...equipo.obras.map((o) => {
        const rol = o.miembros[uid];
        const equipos = Object.keys(o.equipos || {}).map(nombreEquipo).filter(Boolean);
        return el('div', { class: 'obra-tarjeta' },
          el('strong', {}, o.nombre),
          el('span', { class: 'pie' }, [ROLES[rol], plural(Object.keys(o.miembros).length, 'persona', 'personas'), equipos.length && `equipos: ${equipos.join(', ')}`].filter(Boolean).join(' · ')),
          el('div', { class: 'fila-botones' },
            el('a', { class: 'boton', href: `#/obra/${encodeURIComponent(o.id)}` }, 'Espacio de la obra'),
            rol !== 'contratista' && el('a', { class: 'boton', href: `./panel.html#vista=dia&obra=${encodeURIComponent(o.id)}` }, 'Panel')));
      }))
      : el('p', { class: 'pie' }, 'Todavía no estás en ninguna obra compartida. Comparte una o acepta una invitación en «Cuenta y equipo».'),
    equipo.equipos.length > 0 && el('h3', { class: 'panel-sub' }, 'Mis equipos de trabajo'),
    equipo.equipos.length > 0 && el('div', { class: 'rejilla tres' }, ...equipo.equipos.map((e) =>
      el('div', { class: 'obra-tarjeta' },
        el('strong', {}, e.nombre),
        el('span', { class: 'pie' }, `${PAPELES_EQUIPO[e.miembros[uid]]} · ${plural(Object.keys(e.miembros).length, 'persona', 'personas')} · ${plural(Object.keys(e.obras || {}).length, 'obra', 'obras')}`),
        el('span', { class: 'pie' }, Object.values(e.obras || {}).map((x) => x.nombre).join(', '))))));
}

/* --- mis últimas bitácoras (de la nube, en todas mis obras) --- */

let bitacorasPedidas = '';
async function pintarBitacoras() {
  const uid = equipo.usuario.uid;
  const obras = equipo.obras.filter((o) => o.miembros[uid] !== 'contratista');
  const clave = obras.map((o) => o.id).join();
  if (!obras.length) { nodos.misBitacoras.hidden = true; return; }
  if (clave === bitacorasPedidas) return;
  bitacorasPedidas = clave;
  nodos.misBitacoras.hidden = false;
  nodos.misBitacoras.replaceChildren(el('h2', {}, 'Mis últimas bitácoras'), el('p', { class: 'pie' }, 'Leyendo…'));
  try {
    const todas = [];
    for (const o of obras) {
      const { visitas } = await equipo.leerObra(o);
      for (const v of visitas) if (v._autor === uid) todas.push({ ...v, _obra: o });
    }
    // Las que aún no se han subido (o de obras sin compartir), del teléfono.
    const enNube = new Set(todas.map((v) => v.id));
    const locales = (await listarVisitas().catch(() => [])).filter((v) => !enNube.has(v.id) && !v.obraId);
    const lista = [...todas, ...locales.map((v) => ({ ...v, _local: true }))]
      .sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || ''))).slice(0, 12);
    poner(nodos.misBitacoras, 
      el('h2', {}, 'Mis últimas bitácoras'),
      lista.length
        ? el('div', { class: 'tabla-envoltura' }, el('table', { class: 'tabla' },
          el('thead', {}, el('tr', {}, ...['Fecha', 'Obra', 'Personal', 'Incid. abiertas', 'Firma', ''].map((t) => el('th', {}, t)))),
          el('tbody', {}, ...lista.map((v) => el('tr', {},
            el('td', {}, `${v.fecha}${v.hora ? ` ${v.hora}` : ''}`),
            el('td', {}, v._obra ? v._obra.nombre : `${v.obra || 'Sin obra'} (sólo en este dispositivo)`),
            el('td', {}, String(personasDe(v))),
            el('td', {}, String((v.incidencias || []).filter((i) => i.estado !== 'cerrada').length)),
            el('td', {}, firmada(v) ? '✓' : '—'),
            el('td', {}, enlaceVisita(v.id)))))))
        : el('p', { class: 'pie' }, 'Todavía no has hecho bitácoras en tus obras compartidas.'));
  } catch (e) {
    console.error(e);
    bitacorasPedidas = '';
    nodos.misBitacoras.replaceChildren(el('h2', {}, 'Mis últimas bitácoras'), el('p', { class: 'pie' }, 'No se han podido leer (¿sin conexión?).'));
  }
}

/* --- espacio de una obra --- */

let obraPintada = '';
async function pintarObra(id, { fresco = false } = {}) {
  const obra = equipo.obras.find((o) => o.id === id);
  nodos.titulo.textContent = 'Obra';
  if (!obra) {
    nodos.vistaObra.replaceChildren(el('p', { class: 'vacio' }, 'No estás en esta obra (o ya no existe).'),
      el('a', { class: 'boton', href: '#/' }, '← Mi perfil'));
    return;
  }
  const uid = equipo.usuario.uid;
  const rol = obra.miembros[uid];
  const soyAdmin = rol === 'admin';
  const firma = `${id}:${obra.modificada}`;
  const cabecera = el('div', {},
    el('div', { class: 'ficha-barra' }, el('a', { class: 'enlace', href: '#/' }, '← Mi perfil'), el('span', { class: 'pie' }, `Tu papel: ${ROLES[rol]}`)),
    el('h2', { class: 'panel-titulo' }, obra.nombre),
    rol !== 'contratista' && el('div', { class: 'fila-botones' },
      el('a', { class: 'boton boton-destacado', href: `./panel.html#vista=dia&obra=${encodeURIComponent(id)}` }, 'Resumen de hoy'),
      el('a', { class: 'boton', href: `./panel.html#vista=semana&obra=${encodeURIComponent(id)}` }, 'Resumen semanal'),
      el('button', { type: 'button', class: 'boton', title: 'Volver a leer de la nube', onclick: () => pintarObra(id, { fresco: true }) }, '⟳')));
  if (obraPintada !== firma || fresco) {
    nodos.vistaObra.replaceChildren(cabecera, el('p', { class: 'pie' }, 'Leyendo la obra…'));
  }
  obraPintada = firma;

  let datos = { visitas: [], repasos: [] };
  let error = null;
  if (rol !== 'contratista') {
    try { datos = await equipo.leerObra(obra, { fresco }); } catch (e) { error = e; console.error(e); }
  }
  if (location.hash !== `#/obra/${encodeURIComponent(id)}`) return;

  const { visitas, repasos } = datos;
  const fecha = hoy();
  const inc = incidencias(visitas, fecha).filter((i) => i.estado !== 'cerrada');
  const repAbiertos = repasos.filter((r) => estadoRepaso(r, fecha) !== 'cerrado');
  const ordenadas = visitas.slice().sort((a, b) => (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')));
  const inicio = lunes(fecha);
  const semana = visitas.filter((v) => v.fecha >= inicio && v.fecha <= sumarDias(inicio, 6)).length;
  const ultima = ultimaPorPersona(visitas);
  const nombre = (u) => equipo.nombreDe(obra, u);
  const personas = obra.personas || {};
  const nombreEquipo = (eid) => (equipo.equipos.find((e) => e.id === eid) || {}).nombre || 'Equipo';
  const por = (pid) => Object.entries(obra.porEquipo || {}).filter(([, l]) => l.includes(pid)).map(([eid]) => nombreEquipo(eid));
  const miembros = Object.entries(obra.miembros)
    .sort((a, b) => ['admin', 'editor', 'lector', 'contratista'].indexOf(a[1]) - ['admin', 'editor', 'lector', 'contratista'].indexOf(b[1]));

  poner(nodos.vistaObra, 
    cabecera,
    error && el('p', { class: 'error' }, 'No se han podido leer las bitácoras (¿sin conexión?).'),
    rol === 'contratista'
      ? el('p', { class: 'aviso-lectura' }, 'Como contratista ves sólo los repasos que te asignan, en la app («Mis repasos asignados»).')
      : el('div', { class: 'cifras' },
        cifra(visitas.length, 'bitácoras en total'),
        cifra(semana, 'esta semana'),
        cifra(ordenadas[0] ? `${ordenadas[0].fecha.slice(8)}/${ordenadas[0].fecha.slice(5, 7)}` : '—', 'última bitácora'),
        cifra(inc.length, 'incidencias abiertas', inc.some((i) => i.gravedad === 'grave') ? 'alerta' : ''),
        cifra(repAbiertos.length, 'repasos abiertos'),
        cifra(miembros.length, 'personas en la obra')),

    el('section', { class: 'grupo' },
      el('h2', {}, `Equipo de la obra (${miembros.length})`),
      el('div', { class: 'rejilla tres' }, ...miembros.map(([pid, r]) => {
        const p = personas[pid] || {};
        const via = por(pid);
        const ult = ultima.get(pid);
        return el('div', { class: 'persona' },
          avatar(p, true),
          el('div', { class: 'persona-datos' },
            el('strong', {}, `${p.nombre || 'Sin nombre'}${pid === uid ? ' (tú)' : ''}`),
            el('span', { class: 'pie' }, [p.cargo, p.empresa].filter(Boolean).join(' · ') || p.correo || ''),
            el('span', { class: 'pie' }, [ROLES[r], via.length && `por ${via.join(', ')}`, ult && `última bitácora ${ult}`].filter(Boolean).join(' · '))));
      })),
      soyAdmin && Object.keys(obra.invitaciones || {}).length > 0 && el('p', { class: 'pie' },
        `Invitaciones pendientes: ${Object.keys(obra.invitaciones).join(', ')}`),
      el('p', { class: 'pie' }, soyAdmin
        ? 'Invita, cambia papeles o vincula equipos en Mi perfil → Cuenta y equipo → la obra.'
        : 'Lo gestiona el administrador de la obra.')),

    Object.keys(obra.equipos || {}).length > 0 && el('section', { class: 'grupo' },
      el('h2', {}, 'Equipos de trabajo vinculados'),
      el('ul', { class: 'panel-lista' }, ...Object.entries(obra.equipos).map(([eid, papel]) =>
        el('li', {}, el('strong', {}, nombreEquipo(eid)), ` · ${ROLES[papel] || papel} · ${plural(((obra.porEquipo || {})[eid] || []).length, 'persona', 'personas')}`)))),

    rol !== 'contratista' && el('section', { class: 'grupo' },
      el('h2', {}, 'Bitácoras recientes'),
      ordenadas.length
        ? el('div', { class: 'tabla-envoltura' }, el('table', { class: 'tabla' },
          el('thead', {}, el('tr', {}, ...['Fecha', 'Quién', 'Personal', 'Incid. abiertas', 'Fotos', 'Firma', ''].map((t) => el('th', {}, t)))),
          el('tbody', {}, ...ordenadas.slice(0, 20).map((v) => el('tr', {},
            el('td', {}, `${v.fecha}${v.hora ? ` ${v.hora}` : ''}`),
            el('td', {}, autorDe(v, nombre)),
            el('td', {}, String(personasDe(v))),
            el('td', {}, String((v.incidencias || []).filter((i) => i.estado !== 'cerrada').length)),
            el('td', {}, String((v.fotos || []).length)),
            el('td', {}, firmada(v) ? '✓' : '—'),
            el('td', {}, enlaceVisita(v.id)))))))
        : el('p', { class: 'pie' }, 'Todavía no hay bitácoras de esta obra en la nube.')),

    rol !== 'contratista' && inc.length > 0 && el('section', { class: 'grupo' },
      el('h2', {}, `Incidencias abiertas (${inc.length})`),
      el('ul', { class: 'panel-lista' }, ...inc.map((i) => el('li', {},
        el('span', { class: `etiqueta gravedad-${i.gravedad}` }, { grave: 'Grave', media: 'Media', leve: 'Leve' }[i.gravedad] || 'Media'),
        ' ', i.texto || '(sin texto)', el('span', { class: 'pie' }, ` · desde ${i.alta}`))))));
}

/* --- rutas y arranque --- */

function enrutar() {
  if (!equipo.usuario) {
    nodos.vistaObra.hidden = true;
    nodos.vistaPerfil.hidden = false;
    nodos.titulo.textContent = 'Perfil';
    for (const n of [nodos.miPerfil, nodos.misObras, nodos.misBitacoras]) n.hidden = true;
    return;
  }
  const m = location.hash.match(/^#\/obra\/([^/]+)$/);
  nodos.vistaObra.hidden = !m;
  nodos.vistaPerfil.hidden = Boolean(m);
  if (m) { pintarObra(decodeURIComponent(m[1])); scrollTo(0, 0); return; }
  nodos.titulo.textContent = 'Perfil';
  pintarPerfil();
  pintarObras();
  pintarBitacoras();
}


async function obrasLocales() {
  const nombres = new Map();
  for (const r of [...await listarVisitas(), ...await listarRepasos(), ...await listarPlanos()]) {
    const n = (r.obra || '').trim();
    if (n && !nombres.has(n.toLowerCase())) nombres.set(n.toLowerCase(), n);
  }
  return [...nombres.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

if (!equipo.activo) {
  nodos.grupoEquipo.hidden = false;
  $('equipo').replaceChildren(el('p', { class: 'pie' }, 'Las cuentas de equipo no están configuradas en esta instalación.'));
} else {
  iniciarEquipoUI({ grupo: nodos.grupoEquipo, contenedor: $('equipo'), avisar: aviso, obrasLocales });
  equipo.addEventListener('cambio', enrutar);
  addEventListener('hashchange', enrutar);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
