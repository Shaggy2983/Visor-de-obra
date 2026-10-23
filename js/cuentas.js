/* Cuentas vinculadas: Google (Gmail y Drive) y Microsoft (Outlook y
   OneDrive), sin servidor propio. El teléfono habla directamente con cada
   proveedor mediante OAuth:

   - Google: flujo implícito (el navegador recibe el token en la vuelta).
     Los tokens duran una hora y Google no da tokens de renovación a una
     app sin servidor; al caducar se renueva con una vuelta rápida por
     Google, sin volver a pedir la contraseña.
   - Microsoft: código de autorización con PKCE, el flujo para apps de
     página única. Da un token de renovación, así que se renueva solo.

   Los tokens se guardan en este navegador (localStorage) y nunca salen
   del teléfono salvo hacia el propio proveedor. La vuelta del proveedor
   llega a oauth.html, que termina el proceso y devuelve a la visita. */

import { CONFIG } from './cuentas-config.js';

const CLAVE_CUENTAS = 'coordinate-cuentas';
const CLAVE_CONFIG = 'coordinate-cuentas-config';
const CLAVE_PENDIENTE = 'coordinate-oauth-pendiente';
const CLAVE_AVISO = 'coordinate-oauth-aviso';

export const CARPETA_RAIZ = 'COORDINATE Visitas';
export const CARPETA_COPIAS = 'Copias de seguridad';

export const PROVEEDORES = {
  google: {
    nombre: 'Google',
    servicios: 'Gmail y Google Drive',
    nube: 'Google Drive',
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    // drive.file: sólo ve los archivos que crea la propia app.
    alcance: 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send'
  },
  microsoft: {
    nombre: 'Microsoft',
    servicios: 'Outlook y OneDrive',
    nube: 'OneDrive',
    alcance: 'openid profile email offline_access User.Read Mail.Send Files.ReadWrite'
  }
};

/* Hace falta volver a pasar por el proveedor (token caducado o retirado). */
export class ErrorReautorizar extends Error {
  constructor(proveedor, mensaje) {
    super(mensaje || `La sesión de ${PROVEEDORES[proveedor].nombre} ha caducado.`);
    this.proveedor = proveedor;
  }
}

/* ------------------------------------------------------------------ */
/* almacenamiento local                                                */
/* ------------------------------------------------------------------ */

function leer(clave, almacen = localStorage) {
  try {
    return JSON.parse(almacen.getItem(clave)) || null;
  } catch (e) {
    return null;
  }
}

function escribir(clave, valor, almacen = localStorage) {
  try {
    if (valor == null) almacen.removeItem(clave);
    else almacen.setItem(clave, JSON.stringify(valor));
  } catch (e) { /* modo privado o sin espacio: la cuenta no se recordará */ }
}

export function leerConfig() {
  const propia = leer(CLAVE_CONFIG) || {};
  return {
    google: { ...CONFIG.google, ...(propia.google || {}) },
    microsoft: { ...CONFIG.microsoft, ...(propia.microsoft || {}) }
  };
}

export function guardarConfig(config) {
  escribir(CLAVE_CONFIG, config);
}

export const configurado = (proveedor) => Boolean(leerConfig()[proveedor].clientId.trim());

export function cuentas() {
  return leer(CLAVE_CUENTAS) || {};
}

function guardarCuenta(proveedor, datos) {
  const todas = cuentas();
  if (datos) todas[proveedor] = datos;
  else delete todas[proveedor];
  escribir(CLAVE_CUENTAS, todas);
}

export const vinculadas = () => Object.keys(cuentas()).filter((p) => PROVEEDORES[p]);

/* Mensaje que deja oauth.html para mostrarlo al volver a la app. */
export function avisoPendiente() {
  const aviso = leer(CLAVE_AVISO, sessionStorage);
  escribir(CLAVE_AVISO, null, sessionStorage);
  return aviso;
}

export function uriRetorno() {
  return new URL('oauth.html', location.href).href.split('#')[0].split('?')[0];
}

/* ------------------------------------------------------------------ */
/* vincular                                                            */
/* ------------------------------------------------------------------ */

function aleatorio(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return base64url(b);
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function retoPkce(verificador) {
  const resumen = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  return base64url(new Uint8Array(resumen));
}

/* Lleva al proveedor. silencioso: renovar sin pedir nada si ya hay permiso. */
export async function vincular(proveedor, { silencioso = false, volver = null } = {}) {
  const config = leerConfig()[proveedor];
  if (!config.clientId) throw new Error(`Falta el ID de cliente de ${PROVEEDORES[proveedor].nombre}.`);
  const estado = aleatorio(16);
  const pendiente = {
    proveedor, estado, silencioso,
    volver: volver || `${location.pathname}${location.hash}`
  };
  const cuenta = cuentas()[proveedor];
  let url;
  if (proveedor === 'google') {
    url = new URL(PROVEEDORES.google.autorizar);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: uriRetorno(),
      response_type: 'token',
      scope: PROVEEDORES.google.alcance,
      include_granted_scopes: 'true',
      state: estado,
      prompt: silencioso ? 'none' : 'select_account',
      ...(cuenta && cuenta.email ? { login_hint: cuenta.email } : {})
    });
  } else {
    pendiente.verificador = aleatorio(48);
    url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant || 'common')}/oauth2/v2.0/authorize`);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: uriRetorno(),
      response_type: 'code',
      response_mode: 'query',
      scope: PROVEEDORES.microsoft.alcance,
      state: estado,
      code_challenge: await retoPkce(pendiente.verificador),
      code_challenge_method: 'S256',
      prompt: silencioso ? 'none' : 'select_account',
      ...(cuenta && cuenta.email ? { login_hint: cuenta.email } : {})
    });
  }
  escribir(CLAVE_PENDIENTE, pendiente, sessionStorage);
  location.assign(url.href);
}

async function pedirTokenMicrosoft(cuerpo) {
  const config = leerConfig().microsoft;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant || 'common')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, scope: PROVEEDORES.microsoft.alcance, ...cuerpo })
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error_description || datos.error || `Microsoft respondió ${r.status}`);
  return datos;
}

async function perfil(proveedor, token) {
  const url = proveedor === 'google'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName';
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error('No se ha podido leer el perfil de la cuenta.');
  const d = await r.json();
  return proveedor === 'google'
    ? { email: d.email, nombre: d.name || d.email }
    : { email: d.mail || d.userPrincipalName, nombre: d.displayName || d.mail || d.userPrincipalName };
}

const SIN_INTERACCION = ['interaction_required', 'login_required', 'consent_required', 'account_selection_required'];

/* Se ejecuta en oauth.html, a la vuelta del proveedor. */
export async function completarAutorizacion() {
  const pendiente = leer(CLAVE_PENDIENTE, sessionStorage);
  escribir(CLAVE_PENDIENTE, null, sessionStorage);
  const volver = (pendiente && pendiente.volver) || 'visita.html';
  const avisar = (texto, error = false) => escribir(CLAVE_AVISO, { texto, error }, sessionStorage);

  try {
    if (!pendiente) throw new Error('La vinculación no empezó en esta app.');
    const { proveedor } = pendiente;
    const respuesta = new URLSearchParams(proveedor === 'google' ? location.hash.slice(1) : location.search);
    if (respuesta.get('state') !== pendiente.estado) throw new Error('La respuesta no corresponde a esta petición.');

    const error = respuesta.get('error');
    if (error) {
      // Renovar en silencio no fue posible: se repite pidiendo la cuenta.
      if (pendiente.silencioso && SIN_INTERACCION.includes(error)) {
        await vincular(proveedor, { volver });
        return;
      }
      throw new Error(error === 'access_denied'
        ? 'Se canceló la vinculación.'
        : respuesta.get('error_description') || error);
    }

    let datos;
    if (proveedor === 'google') {
      datos = {
        token: respuesta.get('access_token'),
        caduca: Date.now() + (Number(respuesta.get('expires_in')) || 3600) * 1000,
        alcance: respuesta.get('scope') || ''
      };
    } else {
      const t = await pedirTokenMicrosoft({
        grant_type: 'authorization_code',
        code: respuesta.get('code'),
        redirect_uri: uriRetorno(),
        code_verifier: pendiente.verificador
      });
      datos = {
        token: t.access_token,
        renovacion: t.refresh_token || null,
        caduca: Date.now() + (Number(t.expires_in) || 3600) * 1000,
        alcance: t.scope || ''
      };
    }
    const quien = await perfil(proveedor, datos.token);
    guardarCuenta(proveedor, { ...datos, ...quien, vinculada: (cuentas()[proveedor] || {}).vinculada || Date.now() });
    if (!pendiente.silencioso) avisar(`Cuenta de ${PROVEEDORES[proveedor].nombre} vinculada: ${quien.email}`);
  } catch (e) {
    avisar(`No se ha podido vincular la cuenta. ${e.message || ''}`.trim(), true);
  }
  location.replace(volver);
}

export async function desvincular(proveedor) {
  const cuenta = cuentas()[proveedor];
  guardarCuenta(proveedor, null);
  // Google permite retirar el permiso desde la app; en Microsoft se hace
  // desde la propia cuenta (account.microsoft.com → Privacidad → Apps).
  if (proveedor === 'google' && cuenta && cuenta.token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cuenta.token)}`, { method: 'POST' });
    } catch (e) { /* sin red: el token caducará solo en una hora */ }
  }
}

/* ------------------------------------------------------------------ */
/* llamadas a las API                                                  */
/* ------------------------------------------------------------------ */

async function tokenValido(proveedor) {
  const cuenta = cuentas()[proveedor];
  if (!cuenta) throw new ErrorReautorizar(proveedor, `No hay ninguna cuenta de ${PROVEEDORES[proveedor].nombre} vinculada.`);
  if (cuenta.caduca - Date.now() > 60000) return cuenta.token;
  return renovar(proveedor);
}

async function renovar(proveedor) {
  const cuenta = cuentas()[proveedor];
  if (proveedor === 'microsoft' && cuenta && cuenta.renovacion) {
    try {
      const t = await pedirTokenMicrosoft({ grant_type: 'refresh_token', refresh_token: cuenta.renovacion });
      guardarCuenta(proveedor, {
        ...cuenta,
        token: t.access_token,
        renovacion: t.refresh_token || cuenta.renovacion,
        caduca: Date.now() + (Number(t.expires_in) || 3600) * 1000
      });
      return t.access_token;
    } catch (e) { /* la renovación también caducó: hay que volver a pasar */ }
  }
  throw new ErrorReautorizar(proveedor);
}

/* fetch con el token del proveedor; si el token ya no vale, se renueva
   una vez y, si tampoco, hay que volver a autorizar. */
async function api(proveedor, url, opciones = {}, reintento = true) {
  const token = await tokenValido(proveedor);
  const r = await fetch(url, { ...opciones, headers: { ...(opciones.headers || {}), Authorization: `Bearer ${token}` } });
  if (r.status === 401) {
    if (reintento) {
      const cuenta = cuentas()[proveedor];
      guardarCuenta(proveedor, { ...cuenta, caduca: 0 });
      return api(proveedor, url, opciones, false);
    }
    throw new ErrorReautorizar(proveedor);
  }
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    let mensaje = cuerpo;
    try {
      const d = JSON.parse(cuerpo);
      mensaje = (d.error && (d.error.message || d.error)) || d.message || cuerpo;
    } catch (e) { /* no era JSON */ }
    if (r.status === 403 && proveedor === 'google') {
      mensaje = `Google no ha dado permiso para esto. Vuelve a vincular la cuenta y marca todos los permisos. (${mensaje})`;
    }
    throw new Error(String(mensaje).slice(0, 300) || `Error ${r.status}`);
  }
  return r;
}

/* ------------------------------------------------------------------ */
/* correo                                                              */
/* ------------------------------------------------------------------ */

const sinSaltos = (t) => String(t || '').replace(/[\r\n]+/g, ' ').trim();

export function direcciones(texto) {
  return String(texto || '').split(/[,;\s]+/).map((d) => d.trim()).filter(Boolean);
}

export const direccionValida = (d) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(d);

function base64Texto(texto) {
  const bytes = new TextEncoder().encode(texto);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function base64Blob(blob) {
  const datos = await new Promise((cumplir, fallar) => {
    const lector = new FileReader();
    lector.onload = () => cumplir(lector.result);
    lector.onerror = () => fallar(lector.error);
    lector.readAsDataURL(blob);
  });
  return datos.slice(datos.indexOf(',') + 1);
}

const encabezado = (texto) => `=?UTF-8?B?${base64Texto(sinSaltos(texto))}?=`;
const lineas76 = (b64) => b64.replace(/.{1,76}/g, '$&\r\n');

async function mimeGmail({ para, cc, asunto, texto, adjuntos }) {
  const limite = `coordinate-${aleatorio(12)}`;
  const partes = [
    `To: ${para.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${encabezado(asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    lineas76(base64Texto(texto))
  ].filter((l) => l !== null);
  const trozos = [partes.join('\r\n')];
  for (const a of adjuntos) {
    const nombre = sinSaltos(a.nombre).replace(/"/g, '');
    trozos.push([
      `--${limite}`,
      `Content-Type: ${a.tipo}; name="${encabezado(nombre)}"`,
      `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Content-Transfer-Encoding: base64',
      '',
      lineas76(await base64Blob(a.blob))
    ].join('\r\n'));
  }
  trozos.push(`--${limite}--\r\n`);
  return new Blob([trozos.join('\r\n')], { type: 'message/rfc822' });
}

const LIMITE_GRAPH = 3 * 1024 * 1024;   // adjuntos mayores van por sesión de subida
const TROZO_GRAPH = 320 * 1024 * 10;    // múltiplo de 320 KiB, como pide Graph

async function enviarOutlook({ para, cc, asunto, texto, adjuntos }) {
  const G = 'https://graph.microsoft.com/v1.0/me';
  const json = { 'Content-Type': 'application/json' };
  const mensaje = {
    subject: sinSaltos(asunto),
    body: { contentType: 'Text', content: texto },
    toRecipients: para.map((address) => ({ emailAddress: { address } })),
    ccRecipients: cc.map((address) => ({ emailAddress: { address } }))
  };
  const total = adjuntos.reduce((s, a) => s + a.blob.size, 0);
  const comoAdjunto = async (a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: sinSaltos(a.nombre), contentType: a.tipo, contentBytes: await base64Blob(a.blob)
  });

  if (total <= LIMITE_GRAPH) {
    mensaje.attachments = await Promise.all(adjuntos.map(comoAdjunto));
    await api('microsoft', `${G}/sendMail`, { method: 'POST', headers: json, body: JSON.stringify({ message: mensaje, saveToSentItems: true }) });
    return;
  }
  // Mensajes grandes: borrador, adjuntos uno a uno y envío.
  const borrador = await (await api('microsoft', `${G}/messages`, { method: 'POST', headers: json, body: JSON.stringify(mensaje) })).json();
  for (const a of adjuntos) {
    if (a.blob.size <= LIMITE_GRAPH) {
      await api('microsoft', `${G}/messages/${borrador.id}/attachments`, { method: 'POST', headers: json, body: JSON.stringify(await comoAdjunto(a)) });
      continue;
    }
    const sesion = await (await api('microsoft', `${G}/messages/${borrador.id}/attachments/createUploadSession`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ AttachmentItem: { attachmentType: 'file', name: sinSaltos(a.nombre), size: a.blob.size, contentType: a.tipo } })
    })).json();
    for (let inicio = 0; inicio < a.blob.size; inicio += TROZO_GRAPH) {
      const fin = Math.min(inicio + TROZO_GRAPH, a.blob.size);
      // La URL de la sesión ya va firmada: no lleva token.
      const r = await fetch(sesion.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${inicio}-${fin - 1}/${a.blob.size}` },
        body: a.blob.slice(inicio, fin)
      });
      if (!r.ok) throw new Error(`No se ha podido subir ${a.nombre} (${r.status}).`);
    }
  }
  await api('microsoft', `${G}/messages/${borrador.id}/send`, { method: 'POST' });
}

/* correo: { para: [], cc: [], asunto, texto, adjuntos: [{ nombre, tipo, blob }] } */
export async function enviarCorreo(proveedor, correo) {
  const limpio = { cc: [], adjuntos: [], ...correo };
  const malas = [...limpio.para, ...limpio.cc].filter((d) => !direccionValida(d));
  if (!limpio.para.length) throw new Error('Falta al menos un destinatario.');
  if (malas.length) throw new Error(`Dirección no válida: ${malas.join(', ')}`);
  if (proveedor === 'google') {
    await api('google', 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
      method: 'POST', headers: { 'Content-Type': 'message/rfc822' }, body: await mimeGmail(limpio)
    });
  } else {
    await enviarOutlook(limpio);
  }
}

/* ------------------------------------------------------------------ */
/* almacenamiento                                                      */
/* ------------------------------------------------------------------ */

/* Nombre válido para carpetas y archivos en Drive y OneDrive. */
export function nombreArchivo(texto, alternativo = 'sin-nombre') {
  const limpio = String(texto || '').replace(/[\\/:*?"<>|#%\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return (limpio || alternativo).slice(0, 80);
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const CARPETA_DRIVE = 'application/vnd.google-apps.folder';
const comillas = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function buscarDrive(q, campos = 'files(id,name,modifiedTime,size,webViewLink)') {
  const url = `${DRIVE}/files?${new URLSearchParams({ q, fields: campos, spaces: 'drive', pageSize: '100', orderBy: 'modifiedTime desc' })}`;
  return (await (await api('google', url)).json()).files || [];
}

async function carpetaDrive(ruta, crear = true) {
  let padre = 'root';
  for (const nombre of ruta) {
    const halladas = await buscarDrive(`name = '${comillas(nombre)}' and mimeType = '${CARPETA_DRIVE}' and '${padre}' in parents and trashed = false`, 'files(id)');
    if (halladas.length) {
      padre = halladas[0].id;
    } else if (crear) {
      const r = await api('google', `${DRIVE}/files?fields=id`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, mimeType: CARPETA_DRIVE, parents: [padre] })
      });
      padre = (await r.json()).id;
    } else {
      return null;
    }
  }
  return padre;
}

async function subirDrive(ruta, nombre, blob, tipo) {
  const carpeta = await carpetaDrive(ruta);
  const existentes = await buscarDrive(`name = '${comillas(nombre)}' and '${carpeta}' in parents and trashed = false`, 'files(id)');
  const id = existentes.length ? existentes[0].id : null;
  // Subida reanudable: abre una sesión y manda el archivo de una vez.
  const sesion = await api('google',
    `https://www.googleapis.com/upload/drive/v3/files${id ? `/${id}` : ''}?uploadType=resumable&fields=id,name,webViewLink`, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo },
      body: JSON.stringify(id ? { name: nombre } : { name: nombre, parents: [carpeta], mimeType: tipo })
    });
  const destino = sesion.headers.get('Location');
  if (!destino) throw new Error('Google Drive no ha abierto la subida.');
  const r = await fetch(destino, { method: 'PUT', headers: { 'Content-Type': tipo }, body: blob });
  if (!r.ok) throw new Error(`Google Drive rechazó el archivo (${r.status}).`);
  const d = await r.json();
  return { id: d.id, nombre: d.name, url: d.webViewLink || `https://drive.google.com/file/d/${d.id}/view` };
}

const GRAPH_DRIVE = 'https://graph.microsoft.com/v1.0/me/drive';
const rutaOneDrive = (partes) => partes.map((p) => encodeURIComponent(p)).join('/');

async function subirOneDrive(ruta, nombre, blob, tipo) {
  // La subida por ruta crea las carpetas que falten.
  const url = `${GRAPH_DRIVE}/root:/${rutaOneDrive([...ruta, nombre])}:/content?@microsoft.graph.conflictBehavior=replace`;
  const d = await (await api('microsoft', url, { method: 'PUT', headers: { 'Content-Type': tipo }, body: blob })).json();
  return { id: d.id, nombre: d.name, url: d.webUrl };
}

/* Sube blob a CARPETA_RAIZ/…ruta/nombre y devuelve { id, nombre, url }. */
export function subirArchivo(proveedor, ruta, nombre, blob, tipo) {
  const completa = [CARPETA_RAIZ, ...ruta.map((r) => nombreArchivo(r))];
  const limpio = nombreArchivo(nombre, 'archivo');
  return proveedor === 'google' ? subirDrive(completa, limpio, blob, tipo) : subirOneDrive(completa, limpio, blob, tipo);
}

/* Comparte (sólo lectura) la carpeta CARPETA_RAIZ/…ruta con unos correos y
   devuelve su enlace. Google: permiso por persona, sin correo de aviso.
   Microsoft: invitación sin correo que exige entrar con esa cuenta. Los
   correos ya compartidos se recuerdan para no repetir. */
export async function compartirCarpeta(proveedor, ruta, correos) {
  const completa = [CARPETA_RAIZ, ...ruta.map((r) => nombreArchivo(r))];
  const clave = `crd-compartida:${proveedor}:${completa.join('/')}`;
  let hechos = [];
  try { hechos = JSON.parse(localStorage.getItem(clave)) || []; } catch (e) { /* nada */ }
  const nuevos = correos.map((c) => c.trim().toLowerCase()).filter((c) => c && !hechos.includes(c));
  let enlace = null;
  if (proveedor === 'google') {
    const id = await carpetaDrive(completa, true);
    for (const correo of nuevos) {
      await api('google', `${DRIVE}/files/${id}/permissions?sendNotificationEmail=false`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: correo })
      });
      hechos.push(correo);
    }
    enlace = `https://drive.google.com/drive/folders/${id}`;
  } else {
    const item = await (await api('microsoft', `${GRAPH_DRIVE}/root:/${rutaOneDrive(completa)}?select=id,webUrl`)).json();
    if (nuevos.length) {
      await api('microsoft', `${GRAPH_DRIVE}/items/${item.id}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: nuevos.map((email) => ({ email })), requireSignIn: true, sendInvitation: false, roles: ['read'] })
      });
      hechos.push(...nuevos);
    }
    enlace = item.webUrl;
  }
  try { localStorage.setItem(clave, JSON.stringify(hechos)); } catch (e) { /* se repetirá */ }
  return enlace;
}

/* Archivos de CARPETA_RAIZ/…ruta, el más reciente primero. */
export async function listarArchivos(proveedor, ruta) {
  const completa = [CARPETA_RAIZ, ...ruta.map((r) => nombreArchivo(r))];
  if (proveedor === 'google') {
    const carpeta = await carpetaDrive(completa, false);
    if (!carpeta) return [];
    const archivos = await buscarDrive(`'${carpeta}' in parents and mimeType != '${CARPETA_DRIVE}' and trashed = false`);
    return archivos.map((a) => ({ id: a.id, nombre: a.name, fecha: a.modifiedTime, tamano: Number(a.size) || 0 }));
  }
  const url = `${GRAPH_DRIVE}/root:/${rutaOneDrive(completa)}:/children?$top=200`;
  const token = await tokenValido('microsoft');
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return [];
  if (r.status === 401) throw new ErrorReautorizar('microsoft');
  if (!r.ok) throw new Error(`OneDrive respondió ${r.status}`);
  return ((await r.json()).value || [])
    .filter((a) => a.file)
    .map((a) => ({ id: a.id, nombre: a.name, fecha: a.lastModifiedDateTime, tamano: a.size || 0 }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

export async function descargarArchivo(proveedor, id) {
  if (proveedor === 'google') {
    return (await api('google', `${DRIVE}/files/${encodeURIComponent(id)}?alt=media`)).blob();
  }
  const item = await (await api('microsoft', `${GRAPH_DRIVE}/items/${encodeURIComponent(id)}?select=id,@microsoft.graph.downloadUrl`)).json();
  // La URL de descarga ya va firmada.
  const r = await fetch(item['@microsoft.graph.downloadUrl']);
  if (!r.ok) throw new Error(`No se ha podido descargar (${r.status}).`);
  return r.blob();
}
