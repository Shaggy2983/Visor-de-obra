/* Mudanza de dirección: de shaggy2983.github.io/Visor-de-obra/ a
   app.coordinate.com.do.

   Lo que la app guarda en el teléfono (IndexedDB y localStorage) va atado
   a la dirección: en la nueva el teléfono empieza vacío. Lo sincronizado
   vuelve solo al entrar con la cuenta; esto trae además lo que sólo estaba
   en el teléfono (visitas sin cuenta o sin subir, «mi firma», el último
   modelo IFC, cuentas vinculadas y ajustes).

   Cómo viaja: la misma página (mudanza.html) está en las dos direcciones.
   Una abre la otra con window.open y se pasan los datos con postMessage,
   que admite Blob (fotos, planos, IFC) sin convertirlos. Cada lado sólo
   acepta mensajes del otro origen exacto y sólo se los manda a él.

     · Desde la vieja: «Mudar mis datos» abre la nueva; la nueva dice
       «listo» y la vieja le manda todo.
     · Desde la nueva: «Traer mis datos» abre la vieja; la vieja manda todo
       a quien la abrió nada más cargar.

   Al importar no se pisa nada más nuevo: un registro que ya existe sólo se
   sustituye si el que llega está modificado después, y una clave de
   localStorage sólo se pone si no existe.

   ACTIVA = false hasta que la dirección nueva esté publicada: sin eso no
   sale ningún aviso y la página sólo explica que todavía no hay mudanza. */

export const ACTIVA = false;
export const VIEJA = { origen: 'https://shaggy2983.github.io', ruta: '/Visor-de-obra/' };
export const NUEVA = { origen: 'https://app.coordinate.com.do', ruta: '/' };

const BASES = ['visitas-obra-e04', 'visor-obra-e04'];
// Propias de este navegador y este momento: no tienen sentido en la otra.
const NO_COPIAR = /^(crd-sin-storage|crd-dictado-arranque|crd-mudanza-|crd-mudada|coordinate-oauth-)/;
const HECHA = 'crd-mudada';              // en la vieja: cuándo se mudó
const OFRECIDA = 'crd-mudanza-ofrecida'; // en la nueva: ya se ofreció traer

/* En pruebas locales (127.0.0.1 / localhost) los orígenes se pasan en la
   URL: ?vieja=http://127.0.0.1:8001&nueva=http://127.0.0.1:8002 */
function direcciones() {
  const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const q = new URLSearchParams(location.search);
  if (local && q.get('vieja') && q.get('nueva')) {
    return { vieja: { origen: q.get('vieja'), ruta: '/' }, nueva: { origen: q.get('nueva'), ruta: '/' }, prueba: true };
  }
  return { vieja: VIEJA, nueva: NUEVA, prueba: false };
}

export function lado() {
  const d = direcciones();
  if (location.origin === d.vieja.origen) return 'vieja';
  if (location.origin === d.nueva.origen) return 'nueva';
  return '';
}

const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin memoria */ } };

/* ------------------------------------------------------------------ */
/* leer todo (lado viejo)                                              */
/* ------------------------------------------------------------------ */

const prometer = (p) => new Promise((cumplir, fallar) => { p.onsuccess = () => cumplir(p.result); p.onerror = () => fallar(p.error); });

async function basesExistentes() {
  if (!indexedDB.databases) return null;
  try { return await indexedDB.databases(); } catch (e) { return null; }
}

async function leerBase(nombre) {
  const bd = await prometer(indexedDB.open(nombre));
  try {
    const tablas = [];
    for (const t of bd.objectStoreNames) {
      const almacen = bd.transaction(t, 'readonly').objectStore(t);
      const [claves, valores] = await Promise.all([prometer(almacen.getAllKeys()), prometer(almacen.getAll())]);
      tablas.push({
        nombre: t,
        keyPath: almacen.keyPath,
        registros: claves.map((clave, i) => ({ clave, valor: valores[i] }))
      });
    }
    return { nombre, version: bd.version, tablas };
  } finally {
    bd.close();
  }
}

export async function reunir() {
  const existentes = await basesExistentes();
  const bases = [];
  for (const nombre of BASES) {
    if (existentes && !existentes.some((b) => b.name === nombre)) continue;
    const base = await leerBase(nombre);
    if (base.tablas.length) bases.push(base);
  }
  const local = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^(crd-|coordinate-)/.test(k) && !NO_COPIAR.test(k)) local[k] = localStorage.getItem(k);
    }
  } catch (e) { /* sin memoria */ }
  return { tipo: 'datos', formato: 1, bases, local };
}

/* ------------------------------------------------------------------ */
/* importar (lado nuevo)                                               */
/* ------------------------------------------------------------------ */

const fecha = (r) => (r && typeof r === 'object' ? Number(r.modificado ?? r.modificada ?? r.fecha ?? 0) || 0 : 0);

async function abrirPara(base) {
  const existentes = await basesExistentes();
  const previa = existentes && existentes.find((b) => b.name === base.nombre);
  // Nunca se baja la versión: la app la abre con la suya y fallaría.
  const version = Math.max(base.version, (previa && previa.version) || 0);
  const peticion = indexedDB.open(base.nombre, version);
  peticion.onupgradeneeded = () => {
    const bd = peticion.result;
    for (const t of base.tablas) {
      if (!bd.objectStoreNames.contains(t.nombre)) bd.createObjectStore(t.nombre, t.keyPath ? { keyPath: t.keyPath } : undefined);
    }
  };
  const bd = await prometer(peticion);
  // Si la base ya existía en esa versión pero le falta una tabla, se sube
  // una versión para crearla (pasa sólo con bases a medio crear).
  if (base.tablas.some((t) => !bd.objectStoreNames.contains(t.nombre))) {
    const v = bd.version + 1;
    bd.close();
    const otra = indexedDB.open(base.nombre, v);
    otra.onupgradeneeded = () => {
      for (const t of base.tablas) {
        if (!otra.result.objectStoreNames.contains(t.nombre)) otra.result.createObjectStore(t.nombre, t.keyPath ? { keyPath: t.keyPath } : undefined);
      }
    };
    return prometer(otra);
  }
  return bd;
}

async function importarBase(base, cuenta) {
  const bd = await abrirPara(base);
  try {
    for (const t of base.tablas) {
      const almacen = () => bd.transaction(t.nombre, 'readwrite').objectStore(t.nombre);
      for (const { clave, valor } of t.registros) {
        const previo = await prometer(almacen().get(clave));
        if (previo !== undefined && fecha(previo) >= fecha(valor)) { cuenta.iguales++; continue; }
        await prometer(t.keyPath ? almacen().put(valor) : almacen().put(valor, clave));
        if (previo === undefined) cuenta.nuevos++; else cuenta.actualizados++;
        if (t.nombre === 'visitas') cuenta.visitas++;
      }
    }
  } finally {
    bd.close();
  }
}

export async function importar(datos) {
  if (!datos || datos.tipo !== 'datos' || datos.formato !== 1 || !Array.isArray(datos.bases)) throw new Error('formato');
  const cuenta = { nuevos: 0, actualizados: 0, iguales: 0, visitas: 0, ajustes: 0 };
  for (const base of datos.bases) {
    if (!BASES.includes(base.nombre)) continue;
    await importarBase(base, cuenta);
  }
  for (const [k, v] of Object.entries(datos.local || {})) {
    if (!/^(crd-|coordinate-)/.test(k) || NO_COPIAR.test(k) || typeof v !== 'string') continue;
    if (leer(k) === null) { escribir(k, v); cuenta.ajustes++; }
  }
  escribir(OFRECIDA, String(Date.now()));
  return cuenta;
}

/* ------------------------------------------------------------------ */
/* la página mudanza.html                                              */
/* ------------------------------------------------------------------ */

export function iniciarPagina(nodos) {
  const d = direcciones();
  const donde = lado();
  const urlDe = (x) => `${x.origen}${x.ruta}mudanza.html${d.prueba ? location.search : ''}`;
  const appNueva = `${d.nueva.origen}${d.nueva.ruta}visita.html`;
  const poner = (texto, clase = '') => { nodos.estado.textContent = texto; nodos.estado.className = `pie mudanza-estado ${clase}`; };
  const mostrar = (...botones) => { for (const b of Object.values(nodos.botones)) b.hidden = !botones.includes(b); };

  if (!ACTIVA && !d.prueba) {
    nodos.texto.textContent = 'La app sigue en su dirección de siempre. Cuando cambie, aquí podrás pasar tus datos a la nueva con un toque.';
    mostrar(nodos.botones.volver);
    return;
  }

  if (donde === 'vieja') {
    let enviados = false;
    const enviar = async (destino) => {
      if (enviados) return;
      enviados = true;
      poner('Reuniendo tus datos…');
      try {
        destino.postMessage(await reunir(), d.nueva.origen);
        poner('Pasando los datos a la nueva dirección…');
      } catch (e) {
        enviados = false;
        poner('No se han podido reunir los datos. Usa «Copia de seguridad» para llevarlos a mano.', 'error');
      }
    };
    addEventListener('message', (ev) => {
      if (ev.origin !== d.nueva.origen || !ev.data) return;
      if (ev.data.tipo === 'listo') enviar(ev.source);
      if (ev.data.tipo === 'hecho') {
        escribir(HECHA, new Date().toISOString());
        poner(`Hecho: ${resumen(ev.data.cuenta)}. Ya puedes usar la nueva dirección.`, 'ok');
        mostrar(nodos.botones.abrir);
        if (window.opener) setTimeout(() => window.close(), 2500);
      }
      if (ev.data.tipo === 'error') { enviados = false; poner('La nueva dirección no ha podido guardar los datos. Vuelve a intentarlo o usa «Copia de seguridad».', 'error'); }
    });
    nodos.texto.textContent = `COORDINATE · Obra se muda a ${d.nueva.origen.replace(/^https?:\/\//, '')}. Tus visitas, repasos, registros, «mi firma» y ajustes guardados en este teléfono pasan a la nueva dirección. No se borra nada de aquí.`;
    nodos.botones.abrir.href = appNueva;
    if (leer(HECHA)) poner(`Ya los pasaste el ${new Date(leer(HECHA)).toLocaleDateString('es-DO')}. Puedes repetirlo: no se duplica nada.`);
    if (window.opener) {
      // La abrió la nueva para traer los datos: se mandan ya.
      mostrar();
      enviar(window.opener);
    } else {
      mostrar(nodos.botones.mudar, nodos.botones.abrir);
      nodos.botones.mudar.addEventListener('click', () => {
        enviados = false;
        const w = window.open(urlDe(d.nueva), 'crd-mudanza');
        if (!w) poner('El navegador no ha dejado abrir la nueva dirección. Permite las ventanas emergentes o usa «Copia de seguridad».', 'error');
        else poner('Abriendo la nueva dirección…');
      });
    }
    return;
  }

  if (donde === 'nueva') {
    addEventListener('message', async (ev) => {
      if (ev.origin !== d.vieja.origen || !ev.data || ev.data.tipo !== 'datos') return;
      poner('Guardando tus datos en este teléfono…');
      try {
        const cuenta = await importar(ev.data);
        ev.source.postMessage({ tipo: 'hecho', cuenta }, d.vieja.origen);
        poner(`Hecho: ${resumen(cuenta)}.`, 'ok');
        mostrar(nodos.botones.entrar);
      } catch (e) {
        ev.source.postMessage({ tipo: 'error' }, d.vieja.origen);
        poner('No se han podido guardar los datos. Vuelve a intentarlo.', 'error');
      }
    });
    nodos.texto.textContent = 'Si usabas la app en la dirección anterior (shaggy2983.github.io), aquí traes lo que tenías guardado en este teléfono. Lo que estaba sincronizado con tu cuenta vuelve solo al entrar.';
    nodos.botones.entrar.href = './visita.html';
    if (window.opener) {
      // La abrió la vieja con «Mudar mis datos»: se le avisa de que ya escucha.
      mostrar();
      poner('Esperando los datos…');
      window.opener.postMessage({ tipo: 'listo' }, d.vieja.origen);
    } else {
      mostrar(nodos.botones.traer, nodos.botones.entrar);
      nodos.botones.traer.addEventListener('click', () => {
        const w = window.open(urlDe(d.vieja), 'crd-mudanza');
        if (!w) poner('El navegador no ha dejado abrir la dirección anterior. Permite las ventanas emergentes o usa «Copia de seguridad».', 'error');
        else poner('Abriendo la dirección anterior…');
      });
    }
    return;
  }

  nodos.texto.textContent = 'Esta página sólo sirve en la app publicada.';
  mostrar(nodos.botones.volver);
}

function resumen(c) {
  if (!c) return 'datos pasados';
  const partes = [];
  if (c.visitas) partes.push(`${c.visitas} ${c.visitas === 1 ? 'visita' : 'visitas'}`);
  const otros = c.nuevos + c.actualizados - c.visitas;
  if (otros > 0) partes.push(`${otros} ${otros === 1 ? 'registro más' : 'registros más'}`);
  if (c.ajustes) partes.push(`${c.ajustes} ${c.ajustes === 1 ? 'ajuste' : 'ajustes'}`);
  return partes.length ? partes.join(', ') : 'no había nada nuevo que pasar';
}

/* ------------------------------------------------------------------ */
/* aviso en las páginas de la app (lo pone menu.js)                     */
/* ------------------------------------------------------------------ */

export function avisoEnPagina() {
  if (!ACTIVA) return;
  const donde = lado();
  if (!donde) return;
  if (donde === 'nueva' && leer(OFRECIDA)) return;
  const destino = document.querySelector('main') || document.body;
  const caja = document.createElement('div');
  caja.className = 'aviso-mudanza';
  caja.setAttribute('role', 'note');
  const texto = document.createElement('p');
  const accion = document.createElement('a');
  accion.className = 'boton boton-destacado';
  if (donde === 'vieja') {
    texto.textContent = leer(HECHA)
      ? 'Ya pasaste tus datos a la nueva dirección de la app.'
      : `La app se muda a ${NUEVA.origen.replace('https://', '')}. Pasa tus datos con un toque: no se pierde nada.`;
    accion.href = leer(HECHA) ? `${NUEVA.origen}${NUEVA.ruta}visita.html` : './mudanza.html';
    accion.textContent = leer(HECHA) ? 'Abrir la nueva' : 'Mudar mis datos';
  } else {
    texto.textContent = '¿Usabas la app en la dirección anterior? Trae lo que tenías en este teléfono.';
    accion.href = './mudanza.html';
    accion.textContent = 'Traer mis datos';
  }
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'boton';
  cerrar.textContent = donde === 'nueva' ? 'No hace falta' : 'Luego';
  cerrar.addEventListener('click', () => {
    if (donde === 'nueva') escribir(OFRECIDA, String(Date.now()));
    caja.remove();
  });
  const botones = document.createElement('div');
  botones.className = 'fila-botones';
  botones.append(accion, cerrar);
  caja.append(texto, botones);
  destino.prepend(caja);
}
