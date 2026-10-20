/* Interfaz de la cuenta y el equipo, en la lista de visitas: entrar o
   crear cuenta, invitaciones recibidas, obras compartidas con su equipo
   y estado de la sincronización. La lógica está en equipo.js. */

import { el, plural } from './utiles.js';
import { equipo, ROLES } from './equipo.js';

const URL_APP = 'https://shaggy2983.github.io/Visor-de-obra/visita.html';

const MENSAJES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'No hay ninguna cuenta con ese correo.',
  'auth/invalid-email': 'Ese correo no es válido.',
  'auth/missing-password': 'Escribe la contraseña.',
  'auth/email-already-in-use': 'Ya hay una cuenta con ese correo: entra con ella.',
  'auth/weak-password': 'La contraseña necesita al menos 6 caracteres.',
  'auth/network-request-failed': 'Sin conexión. Prueba cuando haya señal.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google.',
  'permission-denied': 'No tienes permiso para hacer eso en esta obra.',
  'crd/ya-miembro': 'Esa persona ya es miembro de la obra.'
};

function mensaje(e) {
  return MENSAJES[e && e.code] || `Algo no ha ido bien${e && e.code ? ` (${e.code})` : ''}.`;
}

/* opciones: { grupo, contenedor, avisar(texto, ms), obrasLocales() → [nombres] } */
export function iniciarEquipoUI(opciones) {
  const { grupo, contenedor, avisar } = opciones;
  const dialogo = document.getElementById('dialogo');
  if (!equipo.activo) return;
  grupo.hidden = false;

  /* --- diálogo --- */

  function abrir(titulo, ...contenido) {
    const cerrar = el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => dialogo.close() }, '✕');
    dialogo.replaceChildren(
      el('div', { class: 'dialogo-cabecera' }, el('h2', {}, titulo), cerrar),
      el('div', { class: 'dialogo-cuerpo' }, ...contenido)
    );
    if (!dialogo.open) dialogo.showModal();
  }

  function fallo(texto) {
    if (!dialogo.open) return avisar(texto, 6000);
    let nodo = dialogo.querySelector('.dialogo-error');
    if (!nodo) {
      nodo = el('p', { class: 'error dialogo-error', role: 'alert' });
      dialogo.querySelector('.dialogo-cuerpo').prepend(nodo);
    }
    nodo.textContent = texto;
  }

  /* Ejecuta una acción con el botón ocupado; los errores salen escritos. */
  async function con(boton, texto, accion) {
    const antes = boton && boton.textContent;
    if (boton) { boton.disabled = true; boton.textContent = texto; }
    try {
      return await accion();
    } catch (e) {
      if (e && e.code === 'auth/popup-closed-by-user') return null;
      console.error(e);
      fallo(mensaje(e));
      return null;
    } finally {
      if (boton && boton.isConnected) { boton.disabled = false; boton.textContent = antes; }
    }
  }

  const campo = (etiqueta, atributos) => el('label', {}, etiqueta, el('input', { class: 'campo', ...atributos }));

  /* --- entrar y crear cuenta --- */

  function dialogoEntrar() {
    const correo = campo('Correo', { type: 'email', autocomplete: 'email', required: true });
    const clave = campo('Contraseña', { type: 'password', autocomplete: 'current-password', required: true });
    const entrar = el('button', { type: 'submit', class: 'boton boton-destacado' }, 'Entrar');
    abrir('Entrar',
      el('form', {
        class: 'dialogo-formulario',
        onsubmit: (ev) => {
          ev.preventDefault();
          con(entrar, 'Entrando…', async () => {
            await equipo.entrar(correo.querySelector('input').value, clave.querySelector('input').value);
            dialogo.close();
            avisar('Sesión iniciada.');
          });
        }
      }, correo, clave, entrar),
      botonGoogle(),
      el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'enlace', onclick: dialogoRegistro }, 'Crear una cuenta'),
        el('button', {
          type: 'button', class: 'enlace',
          onclick: (ev) => con(ev.target, 'Enviando…', async () => {
            const c = correo.querySelector('input').value;
            if (!c) return fallo('Escribe tu correo y vuelve a pulsar.');
            await equipo.restablecer(c);
            fallo(`Te hemos enviado un correo a ${c} para cambiar la contraseña.`);
          })
        }, 'Olvidé mi contraseña'))
    );
  }

  function botonGoogle() {
    return el('button', {
      type: 'button', class: 'boton grande',
      onclick: (ev) => con(ev.target, 'Abriendo Google…', async () => {
        await equipo.entrarConGoogle();
        if (dialogo.open) dialogo.close();
      })
    }, 'Entrar con Google');
  }

  function dialogoRegistro() {
    const nombre = campo('Nombre y apellido', { autocomplete: 'name', required: true });
    const correo = campo('Correo', { type: 'email', autocomplete: 'email', required: true });
    const clave = campo('Contraseña (mínimo 6 caracteres)', { type: 'password', autocomplete: 'new-password', minlength: 6, required: true });
    const crear = el('button', { type: 'submit', class: 'boton boton-destacado' }, 'Crear cuenta');
    abrir('Crear cuenta',
      el('form', {
        class: 'dialogo-formulario',
        onsubmit: (ev) => {
          ev.preventDefault();
          const c = correo.querySelector('input').value;
          con(crear, 'Creando…', async () => {
            await equipo.registrar(nombre.querySelector('input').value, c, clave.querySelector('input').value);
            abrir('Cuenta creada',
              el('p', {}, `Te hemos enviado un correo a ${c}. Pulsa el enlace para verificarlo: hace falta para recibir invitaciones a obras.`),
              el('button', { type: 'button', class: 'boton boton-destacado', onclick: () => dialogo.close() }, 'Entendido'));
          });
        }
      }, nombre, correo, clave, crear),
      botonGoogle(),
      el('button', { type: 'button', class: 'enlace', onclick: dialogoEntrar }, 'Ya tengo cuenta')
    );
  }

  /* --- compartir una obra --- */

  async function dialogoCompartir() {
    const compartidas = equipo.obras.map((o) => o.nombre.trim().toLowerCase());
    const locales = (await opciones.obrasLocales()).filter((n) => !compartidas.includes(n.trim().toLowerCase()));
    const nombre = campo('Nombre de la obra', { list: 'obras-locales', required: true, maxlength: 120 });
    const boton = el('button', { type: 'submit', class: 'boton boton-destacado' }, 'Compartir');
    abrir('Compartir una obra',
      el('p', { class: 'pie' }, 'Las visitas, repasos y planos de este teléfono con ese nombre de obra se suben a la nube y se sincronizan con quien invites. Lo nuevo que se haga con ese nombre, también.'),
      locales.length > 0 && el('div', { class: 'opciones-obra' }, ...locales.map((n) =>
        el('button', { type: 'button', class: 'chip', onclick: () => { nombre.querySelector('input').value = n; } }, n))),
      el('form', {
        class: 'dialogo-formulario',
        onsubmit: (ev) => {
          ev.preventDefault();
          con(boton, 'Compartiendo…', async () => {
            const id = await equipo.crearObra(nombre.querySelector('input').value);
            const obra = equipo.obras.find((o) => o.id === id);
            if (obra) dialogoObra(obra); else dialogo.close();
            avisar('Obra compartida. Ahora invita a tu equipo.');
          });
        }
      }, nombre, el('datalist', { id: 'obras-locales' }, ...locales.map((n) => el('option', { value: n }))), boton)
    );
  }

  /* --- gestionar una obra compartida --- */

  function selectorRol(actual, alCambiar, conAdmin = true) {
    return el('select', { class: 'campo selector-rol', onchange: (ev) => alCambiar(ev.target.value) },
      ...Object.entries(ROLES).filter(([k]) => conAdmin || k !== 'admin')
        .map(([k, t]) => el('option', { value: k, selected: k === actual }, t)));
  }

  function dialogoObra(obra) {
    const uid = equipo.usuario.uid;
    const soyAdmin = obra.miembros[uid] === 'admin';
    const rehacer = () => {
      const fresca = equipo.obras.find((o) => o.id === obra.id);
      if (fresca) dialogoObra(fresca); else dialogo.close();
    };
    const personas = obra.personas || {};
    const miembros = Object.entries(obra.miembros).sort((a, b) =>
      (a[1] === 'admin' ? -1 : 0) - (b[1] === 'admin' ? -1 : 0));

    const filasMiembros = miembros.map(([id, rol]) => {
      const p = personas[id] || {};
      const yo = id === uid;
      return el('div', { class: 'miembro' },
        el('div', { class: 'miembro-datos' },
          el('strong', {}, (p.nombre || 'Sin nombre') + (yo ? ' (tú)' : '')),
          el('span', { class: 'pie' }, p.correo || '')),
        soyAdmin && !yo
          ? selectorRol(rol, (nuevo) => con(null, '', async () => { await equipo.cambiarRol(obra, id, nuevo); rehacer(); }))
          : el('span', { class: 'miembro-rol' }, ROLES[rol] || rol),
        soyAdmin && !yo && el('button', {
          type: 'button', class: 'boton quitar', title: 'Quitar de la obra', 'aria-label': `Quitar a ${p.nombre || id}`,
          onclick: () => {
            if (!confirm(`¿Quitar a ${p.nombre || p.correo || 'esta persona'} de la obra?`)) return;
            con(null, '', async () => { await equipo.quitarMiembro(obra, id); rehacer(); });
          }
        }, '✕'));
    });

    const pendientes = Object.entries(obra.invitaciones || {}).map(([correo, rol]) =>
      el('div', { class: 'miembro' },
        el('div', { class: 'miembro-datos' }, el('strong', {}, correo), el('span', { class: 'pie' }, 'Invitación pendiente')),
        el('span', { class: 'miembro-rol' }, ROLES[rol] || rol),
        soyAdmin && el('button', {
          type: 'button', class: 'boton quitar', title: 'Cancelar invitación', 'aria-label': `Cancelar invitación de ${correo}`,
          onclick: () => con(null, '', async () => { await equipo.quitarInvitacion(obra, correo); rehacer(); })
        }, '✕')));

    let rolNuevo = 'editor';
    const correo = campo('Correo de la persona', { type: 'email', required: true });
    const invitar = el('button', { type: 'submit', class: 'boton boton-destacado' }, 'Invitar');

    abrir(obra.nombre,
      el('p', { class: 'pie' }, `Tu papel: ${ROLES[obra.miembros[uid]]}. `,
        'Administrador gestiona el equipo; Editor escribe visitas, repasos y planos; Solo lectura los ve.'),
      el('h3', { class: 'dialogo-sub' }, `Equipo (${plural(miembros.length, 'persona', 'personas')})`),
      ...filasMiembros,
      ...pendientes,
      soyAdmin && el('form', {
        class: 'dialogo-formulario invitar',
        onsubmit: (ev) => {
          ev.preventDefault();
          const c = correo.querySelector('input').value.trim().toLowerCase();
          con(invitar, 'Invitando…', async () => {
            await equipo.invitar(obra, c, rolNuevo);
            rehacer();
            ofrecerAviso(obra.nombre, c);
          });
        }
      },
        el('h3', { class: 'dialogo-sub' }, 'Invitar'),
        correo,
        el('label', {}, 'Papel', selectorRol(rolNuevo, (r) => { rolNuevo = r; })),
        el('p', { class: 'pie' }, 'Verá la invitación al entrar en la app con ese correo.'),
        invitar),
      el('div', { class: 'fila-botones acciones-obra' },
        !soyAdmin && el('button', {
          type: 'button', class: 'boton boton-peligro',
          onclick: (ev) => {
            if (!confirm(`¿Salir de «${obra.nombre}»? Lo que hay en este teléfono se queda, pero deja de sincronizarse.`)) return;
            con(ev.target, 'Saliendo…', async () => { await equipo.salirDeObra(obra); dialogo.close(); avisar('Has salido de la obra.'); });
          }
        }, 'Salir de la obra'),
        soyAdmin && el('button', {
          type: 'button', class: 'boton boton-peligro',
          onclick: (ev) => {
            if (!confirm(`¿Borrar «${obra.nombre}» de la nube? Se borran sus visitas, repasos, planos y fotos para todo el equipo. Lo que hay en este teléfono se queda.`)) return;
            con(ev.target, 'Borrando…', async () => { await equipo.borrarObra(obra); dialogo.close(); avisar('Obra borrada de la nube.'); });
          }
        }, 'Borrar de la nube'))
    );
  }

  /* La invitación no manda correo: se avisa a la persona por donde se quiera. */
  function ofrecerAviso(nombreObra, correo) {
    const texto = `Te he invitado a la obra «${nombreObra}» en COORDINATE · Obra. Entra en ${URL_APP} con tu cuenta ${correo} y acepta la invitación.`;
    const aviso = el('div', { class: 'aviso-invitacion' },
      el('p', {}, `Invitación creada para ${correo}. Avísale:`),
      el('button', {
        type: 'button', class: 'boton',
        onclick: async () => {
          try {
            if (navigator.share) await navigator.share({ title: 'Invitación a obra', text: texto });
            else { await navigator.clipboard.writeText(texto); fallo('Mensaje copiado: pégalo en WhatsApp o en un correo.'); }
          } catch (e) { /* cancelado */ }
        }
      }, 'Enviar aviso'));
    dialogo.querySelector('.dialogo-cuerpo').prepend(aviso);
  }

  /* --- borrar la cuenta --- */

  async function borrarCuenta(boton) {
    if (!confirm('¿Borrar tu cuenta? Sales de todas las obras compartidas y se borran de la nube las que sólo eran tuyas. Lo que hay en este teléfono se queda. No se puede deshacer.')) return;
    await con(boton, 'Borrando…', async () => {
      try {
        await equipo.borrarCuenta();
      } catch (e) {
        if (e.code === 'crd/admin-con-equipo') {
          fallo(`Antes cede la administración (o borra la obra) de: ${e.obras.join(', ')}.`);
          return;
        }
        if (e.code !== 'auth/requires-recent-login') throw e;
        // Por seguridad hay que volver a identificarse.
        const clave = equipo.conGoogle ? null : prompt('Por seguridad, escribe tu contraseña para borrar la cuenta:');
        if (!equipo.conGoogle && !clave) return;
        await equipo.reautenticar(clave);
        await equipo.borrarCuenta();
      }
      avisar('Cuenta borrada.', 4000);
    });
  }

  /* --- pintar la sección --- */

  function pintar() {
    if (!equipo.listo) {
      contenedor.replaceChildren(el('p', { class: 'pie' }, 'Comprobando la sesión…'));
      return;
    }
    if (!equipo.usuario) {
      contenedor.replaceChildren(
        el('p', { class: 'pie' }, 'Entra con tu cuenta para compartir obras con tu equipo y tener tus visitas, repasos y planos en todos tus teléfonos. Sin cuenta, todo sigue funcionando en este teléfono.'),
        el('div', { class: 'fila-botones' },
          el('button', { type: 'button', class: 'boton boton-destacado', onclick: dialogoEntrar }, 'Entrar'),
          el('button', { type: 'button', class: 'boton', onclick: dialogoRegistro }, 'Crear cuenta')));
      return;
    }
    const u = equipo.usuario;
    const estado = equipo.estado;
    // Pasa por el(): las piezas condicionales llegan como false y no se pintan.
    contenedor.replaceChildren(...el('div', {},
      el('div', { class: 'cuenta vinculada' },
        el('span', { class: 'inicial', 'aria-hidden': 'true' }, equipo.nombre.charAt(0).toUpperCase()),
        el('div', { class: 'cuenta-datos' },
          el('strong', {}, equipo.nombre),
          el('span', { class: 'cuenta-estado' }, u.email)),
        el('button', {
          type: 'button', class: 'boton', title: 'Sincronizar ahora',
          disabled: estado.fase === 'sincronizando',
          onclick: () => equipo.sincronizar()
        }, '⟳')),
      estado.texto && el('p', { class: `pie estado-sinc fase-${estado.fase}` }, estado.texto),
      !equipo.verificado && el('div', { class: 'aviso-verificar' },
        el('p', {}, `Verifica tu correo ${u.email} con el enlace que te enviamos: hace falta para recibir invitaciones.`),
        el('div', { class: 'fila-botones' },
          el('button', {
            type: 'button', class: 'boton',
            onclick: (ev) => con(ev.target, 'Comprobando…', async () => {
              if (!(await equipo.comprobarVerificacion())) avisar('Todavía no figura como verificado.', 4000);
            })
          }, 'Ya lo verifiqué'),
          el('button', {
            type: 'button', class: 'enlace',
            onclick: (ev) => con(ev.target, 'Enviando…', async () => { await equipo.reenviarVerificacion(); avisar('Correo de verificación enviado.'); })
          }, 'Reenviar el correo'))),
      ...equipo.invitaciones.map((o) => el('div', { class: 'invitacion' },
        el('p', {}, 'Te invitan a ', el('strong', {}, o.nombre), ` como ${(ROLES[o.invitaciones[equipo.correo]] || '').toLowerCase()}.`),
        el('div', { class: 'fila-botones' },
          el('button', {
            type: 'button', class: 'boton boton-destacado',
            onclick: (ev) => con(ev.target, 'Aceptando…', async () => { await equipo.aceptar(o); avisar(`Ya estás en «${o.nombre}». Bajando sus datos…`, 4000); })
          }, 'Aceptar'),
          el('button', {
            type: 'button', class: 'boton',
            onclick: (ev) => con(ev.target, 'Rechazando…', () => equipo.rechazar(o))
          }, 'Rechazar')))),
      el('h3', { class: 'equipo-sub' }, 'Obras compartidas'),
      equipo.obras.length
        ? el('div', { class: 'obras-compartidas' }, ...equipo.obras.map((o) => el('button', {
          type: 'button', class: 'obra-compartida', onclick: () => dialogoObra(o)
        },
          el('span', { class: 'obra-nombre' }, o.nombre),
          el('span', { class: 'pie' }, `${ROLES[o.miembros[u.uid]]} · ${plural(Object.keys(o.miembros).length, 'persona', 'personas')}`
            + (Object.keys(o.invitaciones || {}).length ? ` · ${plural(Object.keys(o.invitaciones).length, 'invitación', 'invitaciones')}` : '')))))
        : el('p', { class: 'pie' }, 'Todavía no compartes ninguna obra.'),
      el('div', { class: 'fila-botones' },
        el('button', { type: 'button', class: 'boton', onclick: dialogoCompartir }, '+ Compartir una obra')),
      el('div', { class: 'fila-botones cuenta-pie' },
        el('button', { type: 'button', class: 'enlace', onclick: () => equipo.salir() }, 'Cerrar sesión'),
        el('button', { type: 'button', class: 'enlace boton-peligro-texto', onclick: (ev) => borrarCuenta(ev.target) }, 'Borrar mi cuenta'))
    ).childNodes);
  }

  equipo.addEventListener('cambio', pintar);
  pintar();
  equipo.iniciar().catch((e) => {
    console.error(e);
    contenedor.replaceChildren(el('p', { class: 'pie' }, 'No se pudo cargar la conexión con el equipo. Revisa la señal y vuelve a abrir la app.'));
  });
}
