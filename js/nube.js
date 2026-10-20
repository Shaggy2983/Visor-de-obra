/* Interfaz de las cuentas vinculadas: tarjetas para vincular Google y
   Microsoft, y los diálogos de enviar por correo, guardar en la nube y
   copia de seguridad en la nube. Lo que habla con los proveedores está en
   cuentas.js; aquí sólo se pregunta y se informa. */

import { el, plural, fechaLarga } from './utiles.js';
import {
  PROVEEDORES, CARPETA_RAIZ, CARPETA_COPIAS, ErrorReautorizar,
  cuentas, vinculadas, configurado, leerConfig, guardarConfig, uriRetorno,
  vincular, desvincular, enviarCorreo, direcciones, subirArchivo, listarArchivos,
  descargarArchivo
} from './cuentas.js';

const CLAVE_DESTINATARIOS = 'coordinate-destinatarios';

/* opciones (las da visita.js):
     avisar(texto, ms)       mensaje breve en pantalla
     informe(visita)         → { blob, nombre } del informe interactivo
     resumen(visita)         → texto del parte
     copia()                 → { blob, nombre } de la copia de seguridad
     restaurar(blob)         importa una copia                          */
export function crearNube(opciones) {
  const dialogo = document.getElementById('dialogo');

  /* --- diálogo genérico --- */

  function abrir(titulo, ...contenido) {
    const cerrar = el('button', { type: 'button', class: 'boton quitar', 'aria-label': 'Cerrar', onclick: () => dialogo.close() }, '✕');
    dialogo.replaceChildren(
      el('div', { class: 'dialogo-cabecera' }, el('h2', {}, titulo), cerrar),
      el('div', { class: 'dialogo-cuerpo' }, ...contenido)
    );
    if (!dialogo.open) dialogo.showModal();
  }

  /* Con el diálogo abierto (capa superior) el aviso normal queda debajo:
     el error se escribe dentro del propio diálogo. */
  function fallo(texto) {
    if (!dialogo.open) return opciones.avisar(texto, 6000);
    let nodo = dialogo.querySelector('.dialogo-error');
    if (!nodo) {
      nodo = el('p', { class: 'error dialogo-error', role: 'alert' });
      dialogo.querySelector('.dialogo-cuerpo').prepend(nodo);
    }
    nodo.textContent = texto;
    nodo.scrollIntoView({ block: 'nearest' });
  }

  function ocupado(boton, texto) {
    const antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = texto;
    return () => { boton.disabled = false; boton.textContent = antes; };
  }

  /* Ejecuta una acción con la nube; si la sesión caducó, ofrece renovarla
     y devuelve null. La renovación pasa por el proveedor y vuelve a esta
     misma pantalla. */
  async function conCuenta(proveedor, accion) {
    try {
      return await accion();
    } catch (e) {
      if (e instanceof ErrorReautorizar) {
        if (confirm(`${e.message} ¿Renovar ahora? Volverás a esta misma pantalla y tendrás que repetir la acción.`)) {
          await vincular(proveedor, { silencioso: true });
        }
        return null;
      }
      if (e instanceof TypeError) throw new Error('Sin conexión con el servicio. Comprueba la cobertura.');
      throw e;
    }
  }

  function selectorCuenta(nombreGrupo) {
    const lista = vinculadas();
    if (lista.length === 1) {
      return { nodo: el('p', { class: 'pie' }, `Con ${PROVEEDORES[lista[0]].nombre}: ${cuentas()[lista[0]].email}`), valor: () => lista[0] };
    }
    const nodo = el('div', { class: 'chips', role: 'radiogroup' }, lista.map((p, i) => el('label', { class: 'opcion' },
      el('input', { type: 'radio', name: nombreGrupo, value: p, checked: i === 0 }),
      `${PROVEEDORES[p].nombre} · ${cuentas()[p].email}`)));
    return { nodo, valor: () => nodo.querySelector('input:checked').value };
  }

  function sinCuentas() {
    abrir('Ninguna cuenta vinculada',
      el('p', {}, 'Vincula una cuenta de Google o de Microsoft en la lista de visitas, sección ',
        el('strong', {}, 'Cuentas vinculadas'), '.'));
  }

  /* --- tarjetas de cuentas (lista de visitas) --- */

  function pintarCuentas(contenedor) {
    const datos = cuentas();
    contenedor.replaceChildren(...Object.entries(PROVEEDORES).map(([clave, p]) => {
      const cuenta = datos[clave];
      const listo = configurado(clave);
      return el('div', { class: `cuenta${cuenta ? ' vinculada' : ''}` },
        el('div', { class: 'cuenta-datos' },
          el('strong', {}, p.nombre),
          el('span', { class: 'pie' }, p.servicios),
          el('span', { class: 'cuenta-estado' },
            cuenta ? `Vinculada: ${cuenta.email}` : listo ? 'Sin vincular' : 'Falta configurar el ID de cliente')),
        cuenta
          ? el('button', {
            type: 'button', class: 'boton',
            onclick: async () => {
              if (!confirm(`¿Desvincular ${cuenta.email}? Lo ya enviado o guardado en la nube no se toca.`)) return;
              await desvincular(clave);
              pintarCuentas(contenedor);
              opciones.avisar(`Cuenta de ${p.nombre} desvinculada.`);
            }
          }, 'Desvincular')
          : el('button', {
            type: 'button', class: listo ? 'boton boton-destacado' : 'boton',
            onclick: () => (listo ? vincular(clave).catch((e) => opciones.avisar(e.message, 5000)) : configurar(contenedor))
          }, listo ? 'Vincular' : 'Configurar')
      );
    }), el('button', { type: 'button', class: 'enlace', onclick: () => configurar(contenedor) }, 'Configurar los ID de cliente'));
  }

  function configurar(contenedor) {
    const config = leerConfig();
    const google = el('input', { type: 'text', class: 'campo', value: config.google.clientId, placeholder: '…apps.googleusercontent.com', autocapitalize: 'off', spellcheck: false });
    const microsoft = el('input', { type: 'text', class: 'campo', value: config.microsoft.clientId, placeholder: '00000000-0000-0000-0000-000000000000', autocapitalize: 'off', spellcheck: false });
    const inquilino = el('input', { type: 'text', class: 'campo', value: config.microsoft.tenant || 'common', autocapitalize: 'off', spellcheck: false });
    const retorno = uriRetorno();
    abrir('Configurar cuentas',
      el('p', { class: 'pie' }, 'Cada proveedor pide registrar la app una vez y da un «ID de cliente». No es una contraseña: sólo identifica esta app. Los pasos están en el README del proyecto.'),
      el('label', {}, 'URI de redirección (regístrala tal cual en los dos)',
        el('input', { type: 'text', class: 'campo', value: retorno, readOnly: true, onclick: (ev) => ev.target.select() })),
      el('label', {}, 'Google · ID de cliente (aplicación web)', google),
      el('label', {}, 'Microsoft · ID de aplicación (cliente)', microsoft),
      el('label', {}, 'Microsoft · inquilino («common» para Outlook, Hotmail y empresas)', inquilino),
      el('div', { class: 'fila-botones' },
        el('button', {
          type: 'button', class: 'boton boton-destacado',
          onclick: () => {
            guardarConfig({
              google: { clientId: google.value.trim() },
              microsoft: { clientId: microsoft.value.trim(), tenant: inquilino.value.trim() || 'common' }
            });
            dialogo.close();
            pintarCuentas(contenedor);
            opciones.avisar('Configuración guardada.');
          }
        }, 'Guardar')));
  }

  /* --- enviar por correo --- */

  function recordarDestinatarios(obra) {
    try { return (JSON.parse(localStorage.getItem(CLAVE_DESTINATARIOS)) || {})[obra || ''] || ''; } catch (e) { return ''; }
  }

  function guardarDestinatarios(obra, texto) {
    try {
      const todos = JSON.parse(localStorage.getItem(CLAVE_DESTINATARIOS)) || {};
      todos[obra || ''] = texto;
      localStorage.setItem(CLAVE_DESTINATARIOS, JSON.stringify(todos));
    } catch (e) { /* sin memoria de destinatarios */ }
  }

  function enviar(visita) {
    if (!vinculadas().length) return sinCuentas();
    const cuenta = selectorCuenta('cuenta-correo');
    const para = el('input', { type: 'text', inputmode: 'email', class: 'campo', value: recordarDestinatarios(visita.obra), placeholder: 'correo@empresa.com, otro@…', autocapitalize: 'off', spellcheck: false });
    const cc = el('input', { type: 'text', inputmode: 'email', class: 'campo', placeholder: 'Opcional', autocapitalize: 'off', spellcheck: false });
    const asunto = el('input', { type: 'text', class: 'campo', value: `Parte de visita · ${visita.obra || 'Obra'} · ${fechaLarga(visita.fecha)}` });
    const texto = el('textarea', { class: 'campo', rows: 8, value: opciones.resumen(visita) });
    const conInforme = el('input', { type: 'checkbox', checked: true });
    const conFotos = el('input', { type: 'checkbox', checked: false });
    const boton = el('button', { type: 'submit', class: 'boton boton-destacado grande' }, 'Enviar');
    const formulario = el('form', {
      class: 'dialogo-formulario',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const listo = ocupado(boton, 'Enviando…');
        try {
          const proveedor = cuenta.valor();
          const adjuntos = [];
          if (conInforme.checked) {
            const inf = await opciones.informe(visita);
            adjuntos.push({ nombre: inf.nombre, tipo: 'text/html', blob: inf.blob });
          }
          if (conFotos.checked) {
            visita.fotos.forEach((f, i) => adjuntos.push({
              nombre: `foto-${String(i + 1).padStart(2, '0')}${f.pie ? '-' + f.pie.slice(0, 40) : ''}.jpg`,
              tipo: 'image/jpeg', blob: f.blob
            }));
          }
          const hecho = await conCuenta(proveedor, async () => {
            await enviarCorreo(proveedor, {
              para: direcciones(para.value), cc: direcciones(cc.value),
              asunto: asunto.value, texto: texto.value, adjuntos
            });
            return true;
          });
          if (hecho) {
            guardarDestinatarios(visita.obra, para.value);
            dialogo.close();
            opciones.avisar(`Enviado a ${plural(direcciones(para.value).length, 'destinatario', 'destinatarios')}.`, 4000);
          }
        } catch (e) {
          fallo(`No se ha enviado: ${e.message}`);
        } finally {
          listo();
        }
      }
    },
    cuenta.nodo,
    el('label', {}, 'Para', para),
    el('label', {}, 'Copia', cc),
    el('label', {}, 'Asunto', asunto),
    el('label', {}, 'Mensaje', texto),
    el('label', { class: 'casilla' }, conInforme, 'Adjuntar el informe interactivo (planos, notas y fotos)'),
    visita.fotos.length > 0 && el('label', { class: 'casilla' }, conFotos,
      visita.fotos.length === 1 ? 'Adjuntar además la foto suelta' : `Adjuntar además las ${visita.fotos.length} fotos sueltas`),
    boton);
    abrir('Enviar por correo', formulario);
  }

  /* --- guardar el informe en la nube --- */

  function guardar(visita) {
    if (!vinculadas().length) return sinCuentas();
    const cuenta = selectorCuenta('cuenta-nube');
    const boton = el('button', { type: 'button', class: 'boton boton-destacado grande' }, 'Guardar');
    const resultado = el('div', {});
    boton.addEventListener('click', async () => {
      const listo = ocupado(boton, 'Subiendo…');
      try {
        const proveedor = cuenta.valor();
        const inf = await opciones.informe(visita);
        const subido = await conCuenta(proveedor, () => subirArchivo(proveedor, [visita.obra || 'Sin obra'], inf.nombre, inf.blob, 'text/html'));
        if (subido) {
          resultado.replaceChildren(
            el('p', {}, `Guardado en ${PROVEEDORES[proveedor].nube}: ${CARPETA_RAIZ} / ${visita.obra || 'Sin obra'} / ${subido.nombre}`),
            subido.url && el('a', { class: 'boton', href: subido.url, target: '_blank', rel: 'noopener noreferrer' }, `Abrir en ${PROVEEDORES[proveedor].nube}`));
        }
      } catch (e) {
        resultado.replaceChildren(el('p', { class: 'error' }, `No se ha guardado: ${e.message}`));
      } finally {
        listo();
      }
    });
    abrir('Guardar en la nube',
      cuenta.nodo,
      el('p', { class: 'pie' }, `Se sube el informe interactivo a la carpeta «${CARPETA_RAIZ} / ${visita.obra || 'Sin obra'}». Si ya estaba, se sustituye por el de ahora.`),
      boton, resultado);
  }

  /* --- copia de seguridad en la nube --- */

  function copiaNube() {
    if (!vinculadas().length) return sinCuentas();
    const cuenta = selectorCuenta('cuenta-copia');
    const subir = el('button', { type: 'button', class: 'boton boton-destacado' }, 'Guardar copia ahora');
    const ver = el('button', { type: 'button', class: 'boton' }, 'Ver copias guardadas');
    const lista = el('div', { class: 'copias' });

    subir.addEventListener('click', async () => {
      const listo = ocupado(subir, 'Subiendo…');
      try {
        const proveedor = cuenta.valor();
        const copia = await opciones.copia();
        if (!copia) return;
        const subido = await conCuenta(proveedor, () => subirArchivo(proveedor, [CARPETA_COPIAS], copia.nombre, copia.blob, 'application/json'));
        if (subido) {
          dialogo.close();
          opciones.avisar(`Copia guardada en ${PROVEEDORES[proveedor].nube}: ${subido.nombre}`, 4000);
        }
      } catch (e) {
        fallo(`No se ha guardado la copia: ${e.message}`);
      } finally {
        listo();
      }
    });

    ver.addEventListener('click', async () => {
      const listo = ocupado(ver, 'Buscando…');
      try {
        const proveedor = cuenta.valor();
        const archivos = await conCuenta(proveedor, () => listarArchivos(proveedor, [CARPETA_COPIAS]));
        if (!archivos) return;
        const copias = archivos.filter((a) => /\.json$/i.test(a.nombre));
        lista.replaceChildren(...(copias.length ? copias.map((a) => el('div', { class: 'copia-fila' },
          el('span', {}, a.nombre, el('span', { class: 'pie' }, ` · ${new Date(a.fecha).toLocaleString('es-ES')}${a.tamano ? ` · ${(a.tamano / 1048576).toFixed(1)} MB` : ''}`)),
          el('button', {
            type: 'button', class: 'boton',
            onclick: async (ev) => {
              if (!confirm(`¿Restaurar «${a.nombre}»? Se añaden las visitas que falten y se actualizan las que estén más nuevas en la copia; no se borra nada.`)) return;
              const fin = ocupado(ev.target, 'Descargando…');
              try {
                const blob = await conCuenta(proveedor, () => descargarArchivo(proveedor, a.id));
                if (blob) {
                  dialogo.close();
                  await opciones.restaurar(blob);
                }
              } catch (e) {
                fallo(`No se ha podido restaurar: ${e.message}`);
              } finally {
                fin();
              }
            }
          }, 'Restaurar'))) : [el('p', { class: 'pie' }, 'No hay copias en esta cuenta todavía.')]));
      } catch (e) {
        lista.replaceChildren(el('p', { class: 'error' }, e.message));
      } finally {
        listo();
      }
    });

    abrir('Copia de seguridad en la nube',
      cuenta.nodo,
      el('p', { class: 'pie' }, `Las copias van a «${CARPETA_RAIZ} / ${CARPETA_COPIAS}», con todas las visitas, fotos y planos. Sirven para pasar las visitas a otro teléfono o recuperarlas.`),
      el('div', { class: 'fila-botones' }, subir, ver),
      lista);
  }

  return { pintarCuentas, enviar, guardar, copiaNube };
}
