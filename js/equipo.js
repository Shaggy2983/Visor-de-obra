/* Cuenta de usuario, obras compartidas y sincronización con Firebase.

   La app sigue siendo «primero el teléfono»: todo se escribe en IndexedDB
   (partes.js) y funciona sin señal. Lo que pertenece a una obra
   compartida se sincroniza cuando hay conexión:

   · subir: cada visita, repaso, plano, inspección, vaciado, programa o minuta cuya versión local es más nueva
     que la que ya está en la nube. Las fotos, firmas y planos van a
     Storage (obras/{obra}/archivos/…) una sola vez, por su id.
   · bajar: lo que otros han cambiado desde la última vez (marca por
     obra y tipo con la hora del servidor).
   · bajas: lo borrado en el teléfono se marca como borrado en la nube.

   Si dos personas tocan lo mismo, gana la última que guardó. Un registro
   entra en una obra compartida en cuanto su nombre de obra coincide con
   el de una obra de la que eres miembro (o ya lleva su obraId).

   En la nube cada registro es un documento con sus datos en JSON (las
   coordenadas de los dibujos son listas de listas, que Firestore no
   admite), su versión y si está borrado. Los repasos llevan además, a la
   vista de las reglas, a quién están asignados y su estado.

   Equipos de trabajo: un grupo de personas reutilizable que se vincula a
   obras con un papel. Al vincularlo, sus miembros entran en la obra;
   quien entra después en el equipo se añade solo a sus obras al
   sincronizar, y quien sale deja de estar en ellas.

   Contratista: papel de obra que sólo ve y corrige los repasos que tiene
   asignados (foto de después y «corregido»); no los cierra. */

import { cargarFirebase, configurado } from './firebase-app.js';
import * as partes from './partes.js';
import { mismaObra, ahora } from './utiles.js';
import * as novedades from './novedades.js';
import { vinculadas, subirArchivo, compartirCarpeta } from './cuentas.js';

export const ROLES = { admin: 'Administrador', editor: 'Editor', lector: 'Solo lectura', contratista: 'Contratista' };
export const PAPELES_EQUIPO = { admin: 'Administrador', miembro: 'Miembro' };
const ESCRIBEN = ['admin', 'editor'];

// Los planos primero: las notas de las visitas apuntan a ellos.
const TIPOS = {
  planos: { listar: partes.listarPlanos, leer: partes.leerPlano, guardar: partes.guardarPlano, borrar: partes.borrarPlano },
  visitas: { listar: partes.listarVisitas, leer: partes.leerVisita, guardar: partes.guardarVisita, borrar: partes.borrarVisita },
  repasos: { listar: partes.listarRepasos, leer: partes.leerRepaso, guardar: partes.guardarRepaso, borrar: partes.borrarRepaso },
  inspecciones: { listar: partes.listarInspecciones, leer: partes.leerInspeccion, guardar: partes.guardarInspeccion, borrar: partes.borrarInspeccion },
  vaciados: { listar: partes.listarVaciados, leer: partes.leerVaciado, guardar: partes.guardarVaciado, borrar: partes.borrarVaciado },
  programas: { listar: partes.listarProgramas, leer: partes.leerPrograma, guardar: partes.guardarPrograma, borrar: partes.borrarPrograma },
  minutas: { listar: partes.listarMinutas, leer: partes.leerMinuta, guardar: partes.guardarMinuta, borrar: partes.borrarMinuta },
  rfis: { listar: partes.listarRfis, leer: partes.leerRfi, guardar: partes.guardarRfi, borrar: partes.borrarRfi },
  cambios: { listar: partes.listarCambios, leer: partes.leerCambio, guardar: partes.guardarCambio, borrar: partes.borrarCambio },
  recepciones: { listar: partes.listarRecepciones, leer: partes.leerRecepcion, guardar: partes.guardarRecepcion, borrar: partes.borrarRecepcion },
  seguridad: { listar: partes.listarSeguridad, leer: partes.leerSeguridad, guardar: partes.guardarSeguridad, borrar: partes.borrarSeguridad }
};
// Qué tipos llevan fotos y cuáles firma (como Blob dentro del registro).
const CON_FOTOS = new Set(['visitas', 'repasos', 'inspecciones', 'vaciados', 'rfis', 'cambios', 'recepciones', 'seguridad']);
const CON_FIRMA = new Set(['visitas', 'inspecciones']);

const version = (r) => r.modificada || r.modificado || r.creado || 0;
const estadoRepaso = (r) => (r.cerrado ? 'cerrado' : r.corregido ? 'corregido' : 'pendiente');
const minusculas = (c) => (c || '').trim().toLowerCase();
const extension = (blob) => (/png/.test(blob.type) ? 'png' : 'jpg');
const tipoImagen = (blob) => (blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg');

async function huella(blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].slice(0, 6).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* Archivos que no están en Storage: se suben a la nube vinculada del autor
   (Drive u OneDrive) y su enlace viaja en los datos. Este mapa recuerda
   ruta → enlace en el teléfono que los subió. */
const CLAVE_ENLACES = 'crd-enlaces';
const leerMapa = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
const escribirMapa = (k, m) => { try { localStorage.setItem(k, JSON.stringify(m)); } catch (e) { /* lleno */ } };
export const planosRemotos = (obraId) => (leerMapa('crd-planos-remotos')[obraId] || []);

/* Separa un registro en sus datos (sin Blobs) y los archivos que lleva. */
async function separar(tipo, r, obraId) {
  const base = `obras/${obraId}/archivos/`;
  const enlaces = leerMapa(CLAVE_ENLACES);
  const archivos = [];
  const datos = { ...r };
  delete datos.fotosRemotas;
  delete datos.firmaRemota;
  if (CON_FOTOS.has(tipo)) {
    datos.fotos = (r.fotos || []).map(({ blob, ...foto }) => {
      const ruta = `${base}${foto.id}.${extension(blob)}`;
      archivos.push({ ruta, blob });
      return { ...foto, ruta, ...(enlaces[ruta] || foto.enlace ? { enlace: enlaces[ruta] || foto.enlace } : {}) };
    });
    // Las fotos de otros que este teléfono no pudo bajar siguen en los datos.
    const propias = new Set(datos.fotos.map((f) => f.id));
    for (const f of r.fotosRemotas || []) if (!propias.has(f.id)) datos.fotos.push(f);
  }
  if (CON_FIRMA.has(tipo)) {
    datos.firma = null;
    datos.firmaRuta = null;
    datos.firmaEnlace = null;
    if (r.firma) {
      datos.firmaRuta = `${base}firma-${r.id}-${await huella(r.firma)}.png`;
      datos.firmaEnlace = enlaces[datos.firmaRuta] || null;
      archivos.push({ ruta: datos.firmaRuta, blob: r.firma });
    } else if (r.firmaRemota) {
      datos.firmaRuta = r.firmaRemota.ruta;
      datos.firmaEnlace = r.firmaRemota.enlace || null;
    }
  }
  // Varias firmas por registro (minutas y control): { papel: { blob, nombre, en } }.
  if (r.firmas) {
    datos.firmas = {};
    for (const [papel, f] of Object.entries(r.firmas)) {
      if (!f) continue;
      const { blob, ...resto } = f;
      if (blob) {
        const ruta = `${base}firma-${r.id}-${papel.replace(/[^\w-]/g, '_')}-${await huella(blob)}.png`;
        archivos.push({ ruta, blob });
        datos.firmas[papel] = { ...resto, ruta, enlace: enlaces[ruta] || null };
      } else datos.firmas[papel] = resto;
    }
  }
  if (tipo === 'planos') {
    delete datos.blob;
    datos.ruta = `${base}plano-${r.id}.${extension(r.blob)}`;
    if (enlaces[datos.ruta]) datos.enlace = enlaces[datos.ruta];
    archivos.push({ ruta: datos.ruta, blob: r.blob });
  }
  return { datos, archivos };
}

/* Lo contrario: rehace el registro local, reutilizando las imágenes que
   ya están en el teléfono y bajando las que falten. Lo que no se puede
   bajar (sin Storage) queda como «remoto», con su enlace si lo hay. */
async function juntar(tipo, datos, local, bajar) {
  const intentar = async (ruta) => { try { return await bajar(ruta); } catch (e) { return null; } };
  const r = { ...datos };
  if (CON_FOTOS.has(tipo)) {
    r.fotos = [];
    r.fotosRemotas = [];
    for (const { ruta, ...foto } of datos.fotos || []) {
      const previa = local && (local.fotos || []).find((f) => f.id === foto.id && f.blob);
      const blob = previa ? previa.blob : await intentar(ruta);
      if (blob) r.fotos.push({ ...foto, blob });
      else r.fotosRemotas.push({ ...foto, ruta });
    }
  }
  if (CON_FIRMA.has(tipo)) {
    r.firma = null;
    r.firmaRemota = null;
    if (datos.firmaRuta) {
      if (local && local.firma && datos.firmaRuta.endsWith(`-${await huella(local.firma)}.png`)) r.firma = local.firma;
      else r.firma = await intentar(datos.firmaRuta);
      if (!r.firma) r.firmaRemota = { ruta: datos.firmaRuta, enlace: datos.firmaEnlace || null };
    }
    delete r.firmaRuta;
    delete r.firmaEnlace;
  }
  if (datos.firmas) {
    r.firmas = {};
    for (const [papel, f] of Object.entries(datos.firmas)) {
      if (!f) continue;
      if (!f.ruta) { r.firmas[papel] = f; continue; }
      const previa = local && local.firmas && local.firmas[papel];
      let blob = previa && previa.blob && f.ruta.endsWith(`-${await huella(previa.blob)}.png`) ? previa.blob : null;
      if (!blob) blob = await intentar(f.ruta);
      if (blob) {
        const { ruta, enlace, ...resto } = f;
        r.firmas[papel] = { ...resto, blob };
      } else r.firmas[papel] = f;
    }
  }
  if (tipo === 'planos') {
    r.blob = local && local.blob ? local.blob : await intentar(datos.ruta);
    if (!r.blob) {
      const e = new Error('Plano sin archivo');
      e.code = 'crd/sin-archivo';
      throw e;
    }
    delete r.ruta;
  }
  return r;
}

const tresCifras = (n) => String(n || 0).padStart(3, '0');
function tituloNovedad(tipo, r) {
  if (tipo === 'visitas') return r.autor || 'Bitácora';
  if (tipo === 'inspecciones') return `Inspección IN-${tresCifras(r.numero)} · ${r.titulo || ''}${r.zona ? ` · ${r.zona}` : ''}`;
  if (tipo === 'vaciados') return `Vaciado VH-${tresCifras(r.numero)} · ${r.elemento || ''}`;
  if (tipo === 'programas') return 'Programa y avance';
  if (tipo === 'minutas') return `Minuta MR-${tresCifras(r.numero)}`;
  if (tipo === 'rfis') return `RFI-${tresCifras(r.numero)} · ${r.asunto || ''}`;
  if (tipo === 'cambios') return `Orden de cambio OC-${tresCifras(r.numero)} · ${r.titulo || ''}`;
  if (tipo === 'recepciones') return `Recepción RM-${tresCifras(r.numero)} · ${r.proveedor || ''}`;
  if (tipo === 'seguridad') return `Seguridad SST-${tresCifras(r.numero)}`;
  return `Repaso ${r.numero || ''} ${r.zona ? `· ${r.zona}` : ''}`.trim();
}

// Errores de subida que indican que no hay Storage (plan sin Blaze).
const FALTA_STORAGE = ['storage/unknown', 'storage/bucket-not-found', 'storage/project-not-found', 'storage/no-default-bucket', 'storage/unauthorized'];

const MI_FIRMA = 'crd-mi-firma';
const MI_FIRMA_EN = 'crd-mi-firma-en';
function leerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function escribirLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin memoria */ } }

export class Equipo extends EventTarget {
  constructor() {
    super();
    this.f = null;              // {fb, auth, db, storage}
    this.usuario = null;
    this.listo = false;         // ya se sabe si hay sesión
    this.obras = [];
    this.invitaciones = [];
    this.equipos = [];
    this.invitacionesEquipo = [];
    this.estado = { fase: 'apagado', texto: '' };
    this.sincronizando = false;
    this.otraVez = false;
    this.perfil = {};           // cargo, empresa, teléfono y foto (usuarios/{uid})
    this.cacheObras = new Map(); // obraId → { cuando, datos } para el panel
  }

  get activo() { return configurado(); }
  get nombre() { return this.usuario ? (this.usuario.displayName || this.usuario.email.split('@')[0]) : ''; }
  get correo() { return this.usuario ? minusculas(this.usuario.email) : ''; }
  get verificado() { return Boolean(this.usuario && this.usuario.emailVerified); }

  avisar() { this.dispatchEvent(new Event('cambio')); }

  ponerEstado(fase, texto) {
    this.estado = { fase, texto };
    this.avisar();
  }

  async iniciar() {
    if (!configurado()) return;
    this.f = await cargarFirebase();
    const { fb, auth } = this.f;
    fb.getRedirectResult(auth).catch(() => {});
    fb.onAuthStateChanged(auth, async (u) => {
      this.usuario = u;
      this.listo = true;
      if (u) {
        try { await this.prepararUsuario(); } catch (e) { /* sin red: ya se hará */ }
        this.sincronizar();
      } else {
        this.obras = [];
        this.invitaciones = [];
        this.equipos = [];
        this.invitacionesEquipo = [];
        this.ponerEstado('fuera', '');
      }
      this.avisar();
    });
    addEventListener('crd-cambio', () => { this.pendiente = true; this.programar(4000); });
    addEventListener('online', () => this.programar(500));
    // Al salir de la app (otra app, pantalla apagada) se sube ya lo
    // pendiente: es lo que más a menudo se queda sin subir.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.programar(800);
      else if (this.pendiente) this.programar(0);
    });
    setInterval(() => { if (!document.hidden) this.programar(0); }, 120000);
  }

  programar(ms) {
    clearTimeout(this.temporizador);
    if (this.usuario) this.temporizador = setTimeout(() => this.sincronizar(), ms);
  }

  /* --------------------------------------------------------------- */
  /* sesión                                                           */
  /* --------------------------------------------------------------- */

  async entrar(correo, clave) {
    await this.f.fb.signInWithEmailAndPassword(this.f.auth, correo.trim(), clave);
  }

  async registrar(nombre, correo, clave) {
    const { fb, auth } = this.f;
    const c = await fb.createUserWithEmailAndPassword(auth, correo.trim(), clave);
    await fb.updateProfile(c.user, { displayName: nombre.trim() });
    this.usuario = auth.currentUser;
    await fb.sendEmailVerification(c.user).catch(() => {});
    await this.prepararUsuario();
    this.avisar();
  }

  async entrarConGoogle() {
    const { fb, auth } = this.f;
    const proveedor = new fb.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    try {
      await fb.signInWithPopup(auth, proveedor);
    } catch (e) {
      // Donde no se abren ventanas emergentes, se va y se vuelve.
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        return fb.signInWithRedirect(auth, proveedor);
      }
      throw e;
    }
  }

  restablecer(correo) {
    return this.f.fb.sendPasswordResetEmail(this.f.auth, correo.trim());
  }

  reenviarVerificacion() {
    return this.f.fb.sendEmailVerification(this.usuario);
  }

  /* Tras tocar el enlace del correo: se recarga el usuario y su token,
     que es lo que miran las reglas para dejar usar las invitaciones. */
  async comprobarVerificacion() {
    await this.usuario.reload();
    await this.usuario.getIdToken(true);
    this.usuario = this.f.auth.currentUser;
    if (this.usuario.emailVerified) await this.refrescarObras();
    this.avisar();
    return this.usuario.emailVerified;
  }

  salir() {
    return this.f.fb.signOut(this.f.auth);
  }

  async prepararUsuario() {
    const { fb, db } = this.f;
    const ref = fb.doc(db, 'usuarios', this.usuario.uid);
    await fb.setDoc(ref, { nombre: this.nombre, correo: this.correo, visto: fb.serverTimestamp() }, { merge: true });
    const d = (await fb.getDoc(ref)).data() || {};
    this.perfil = { cargo: d.cargo || '', empresa: d.empresa || '', telefono: d.telefono || '', foto: d.foto || '' };
    await this.ponerAlDiaMiFirma(d).catch((e) => console.warn('mi firma', e.code || e));
    this.avisar();
  }

  /* «Mi firma» vive en el teléfono (localStorage, para usarla sin señal) y
     también en la ficha privada de la cuenta (usuarios/{uid}.miFirma), para
     que no se pierda al cambiar de teléfono o de dirección de la app. Gana
     la más reciente (crd-mi-firma-en). */
  async ponerAlDiaMiFirma(d) {
    const local = leerLocal(MI_FIRMA);
    const localEn = Number(leerLocal(MI_FIRMA_EN)) || 0;
    const nube = typeof d.miFirma === 'string' ? d.miFirma : '';
    const nubeEn = Number(d.miFirmaEn) || 0;
    if (nube && (!local || nubeEn > localEn)) {
      if (nube !== local) {
        escribirLocal(MI_FIRMA, nube);
        escribirLocal(MI_FIRMA_EN, String(nubeEn || Date.now()));
        dispatchEvent(new CustomEvent('crd-mi-firma'));
      }
    } else if (local && local !== nube) {
      await this.guardarMiFirma(local, localEn || Date.now());
    }
  }

  async guardarMiFirma(datos, en = Date.now()) {
    escribirLocal(MI_FIRMA_EN, String(en));
    if (!this.usuario || !this.f) return false;
    // Una ficha de Firestore no pasa de 1 MB: una firma recortada ocupa
    // unas decenas de kB; si fuera enorme, se queda sólo en el teléfono.
    if (!datos || datos.length > 700000) return false;
    const { fb, db } = this.f;
    await fb.setDoc(fb.doc(db, 'usuarios', this.usuario.uid), { miFirma: datos, miFirmaEn: en }, { merge: true });
    return true;
  }

  /* Guarda el perfil y pone al día la ficha que ven los demás en cada obra
     y equipo (nombre, cargo, empresa y foto; el teléfono sólo en la ficha
     propia). */
  async guardarPerfil({ nombre, cargo, empresa, telefono, foto }) {
    const { fb, db } = this.f;
    const limpio = (t, n) => String(t || '').trim().slice(0, n);
    nombre = limpio(nombre, 80);
    if (nombre && nombre !== this.usuario.displayName) {
      await fb.updateProfile(this.usuario, { displayName: nombre });
      this.usuario = this.f.auth.currentUser;
    }
    this.perfil = { cargo: limpio(cargo, 80), empresa: limpio(empresa, 80), telefono: limpio(telefono, 30), foto: foto || '' };
    await fb.setDoc(fb.doc(db, 'usuarios', this.usuario.uid),
      { nombre: this.nombre, correo: this.correo, ...this.perfil }, { merge: true });
    const uid = this.usuario.uid;
    const ficha = this.ficha();
    for (const [grupos, coleccion] of [[this.obras, 'obras'], [this.equipos, 'equipos']]) {
      for (const g of grupos) {
        if (!(uid in g.miembros)) continue;
        await fb.updateDoc(this.ref(g, coleccion), new fb.FieldPath('personas', uid), ficha, 'modificada', Date.now())
          .catch((e) => console.warn('ficha', g.nombre, e.code));
      }
    }
    await this.refrescarObras();
  }

  /* Para borrar la cuenta Google pide haber entrado hace poco. */
  async reautenticar(clave) {
    const { fb } = this.f;
    const conGoogle = this.usuario.providerData.some((p) => p.providerId === 'google.com');
    if (conGoogle) {
      await fb.reauthenticateWithPopup(this.usuario, new fb.GoogleAuthProvider());
    } else {
      await fb.reauthenticateWithCredential(this.usuario, fb.EmailAuthProvider.credential(this.usuario.email, clave));
    }
  }

  get conGoogle() {
    return Boolean(this.usuario && this.usuario.providerData.some((p) => p.providerId === 'google.com'));
  }

  /* Borra la cuenta: sale de las obras compartidas, borra las que sólo
     eran suyas (con todo lo que tienen en la nube) y su ficha. Lo que hay
     en este teléfono se queda. Si administra una obra con más gente y es
     el único administrador, primero tiene que ceder la administración. */
  async borrarCuenta() {
    const { fb, db } = this.f;
    await this.refrescarObras();
    const uid = this.usuario.uid;
    const bloquean = this.obras.filter((o) => o.miembros[uid] === 'admin'
      && Object.keys(o.miembros).length > 1
      && Object.values(o.miembros).filter((r) => r === 'admin').length === 1);
    if (bloquean.length) {
      const e = new Error('Administras obras con más gente');
      e.code = 'crd/admin-con-equipo';
      e.obras = bloquean.map((o) => o.nombre);
      throw e;
    }
    const equiposBloquean = this.equipos.filter((e) => e.miembros[uid] === 'admin'
      && Object.keys(e.miembros).length > 1
      && Object.values(e.miembros).filter((r) => r === 'admin').length === 1);
    if (equiposBloquean.length) {
      const e = new Error('Administras equipos con más gente');
      e.code = 'crd/admin-con-equipo';
      e.obras = equiposBloquean.map((x) => `equipo ${x.nombre}`);
      throw e;
    }
    for (const o of this.obras) {
      if (Object.keys(o.miembros).length === 1) await this.borrarObra(o);
      else await this.salirDeObra(o);
    }
    for (const e of this.equipos) {
      if (Object.keys(e.miembros).length === 1) await this.borrarEquipo(e);
      else await this.salirDeEquipo(e);
    }
    await fb.deleteDoc(fb.doc(db, 'usuarios', uid));
    await fb.deleteUser(this.usuario);
  }

  /* --------------------------------------------------------------- */
  /* obras compartidas                                                */
  /* --------------------------------------------------------------- */

  async refrescarObras() {
    const { fb, db } = this.f;
    const col = fb.collection(db, 'obras');
    const mias = await fb.getDocs(fb.query(col, fb.where('miembrosLista', 'array-contains', this.usuario.uid)));
    this.obras = mias.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    this.invitaciones = [];
    const colEquipos = fb.collection(db, 'equipos');
    const equipos = await fb.getDocs(fb.query(colEquipos, fb.where('miembrosLista', 'array-contains', this.usuario.uid)));
    this.equipos = equipos.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    this.invitacionesEquipo = [];
    if (this.verificado) {
      const inv = await fb.getDocs(fb.query(col, fb.where('invitadosLista', 'array-contains', this.correo)));
      this.invitaciones = inv.docs.map((d) => ({ id: d.id, ...d.data() }));
      const invE = await fb.getDocs(fb.query(colEquipos, fb.where('invitadosLista', 'array-contains', this.correo)));
      this.invitacionesEquipo = invE.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    this.avisar();
  }

  /* Miembros de una obra con papel de contratista, para asignarles repasos. */
  contratistas(obraId) {
    const o = obraId && this.obras.find((x) => x.id === obraId);
    if (!o) return [];
    return Object.entries(o.miembros).filter(([, r]) => r === 'contratista')
      .map(([id]) => ({ uid: id, nombre: (o.personas && o.personas[id] && o.personas[id].nombre) || 'Contratista' }));
  }

  rolEn(obraId) {
    const o = obraId && this.obras.find((x) => x.id === obraId);
    return o && this.usuario ? o.miembros[this.usuario.uid] || null : null;
  }

  /* Lo que ven de ti los demás miembros. Sólo lo que tiene valor, para no
     engordar el documento de la obra. */
  ficha() {
    const f = { nombre: this.nombre, correo: this.correo };
    for (const k of ['cargo', 'empresa', 'foto']) if (this.perfil[k]) f[k] = this.perfil[k];
    return f;
  }

  /* Administradores de una obra (menos tú), con su correo: para avisarles. */
  administradores(obraId) {
    const o = obraId && this.obras.find((x) => x.id === obraId);
    if (!o || !this.usuario) return [];
    return Object.entries(o.miembros)
      .filter(([id, r]) => r === 'admin' && id !== this.usuario.uid)
      .map(([id]) => ({ uid: id, ...(o.personas || {})[id] }))
      .filter((p) => p.correo);
  }

  nombreDe(obra, uid) {
    if (this.usuario && uid === this.usuario.uid) return this.nombre;
    const p = (obra.personas || {})[uid];
    return (p && p.nombre) || '';
  }

  /* Visitas y repasos de una obra tal como están en la nube (sin fotos):
     lo que usan el panel y el espacio de la obra. Se guarda un minuto en
     memoria para no repetir lecturas al cambiar de pestaña. */
  async leerObra(obra, { fresco = false } = {}) {
    const previo = this.cacheObras.get(obra.id);
    if (!fresco && previo && Date.now() - previo.cuando < 60000) return previo.datos;
    const { fb, db } = this.f;
    const rol = obra.miembros[this.usuario.uid];
    if (!rol || rol === 'contratista') return { visitas: [], repasos: [] };
    const leer = async (tipo) => {
      const res = await fb.getDocs(fb.collection(db, 'obras', obra.id, tipo));
      return res.docs.map((d) => ({ d, x: d.data() })).filter(({ x }) => !x.borrado && x.datos)
        .map(({ d, x }) => {
          try {
            return { ...JSON.parse(x.datos), id: d.id, _autor: x.autor || null, _actualizado: x.actualizado ? x.actualizado.toMillis() : 0 };
          } catch (e) { return null; }
        }).filter(Boolean);
    };
    // Además de bitácoras y repasos, los registros de calidad, seguimiento
    // y control (sin fotos ni firmas: sólo los datos).
    const tipos = ['visitas', 'repasos', 'inspecciones', 'vaciados', 'programas', 'minutas', 'rfis', 'cambios', 'recepciones', 'seguridad'];
    const listas = await Promise.all(tipos.map((t) => leer(t).catch((e) => {
      if (t === 'visitas' || t === 'repasos') throw e;
      return [];
    })));
    const datos = Object.fromEntries(tipos.map((t, i) => [t, listas[i]]));
    this.cacheObras.set(obra.id, { cuando: Date.now(), datos });
    return datos;
  }

  ref(obra, coleccion = 'obras') {
    return this.f.fb.doc(this.f.db, coleccion, obra.id || obra);
  }

  async crearObra(nombre) {
    const { fb, db } = this.f;
    const uid = this.usuario.uid;
    const ref = fb.doc(fb.collection(db, 'obras'));
    await fb.setDoc(ref, {
      nombre: nombre.trim(),
      creador: uid,
      miembros: { [uid]: 'admin' },
      miembrosLista: [uid],
      invitaciones: {},
      invitadosLista: [],
      personas: { [uid]: this.ficha() },
      creada: fb.serverTimestamp(),
      modificada: Date.now()
    });
    await this.refrescarObras();
    this.programar(0);
    return ref.id;
  }

  /* Lo mismo sirve para obras y para equipos («coleccion»). */

  async invitar(grupo, correo, rol, coleccion = 'obras') {
    const { fb } = this.f;
    const c = minusculas(correo);
    if (Object.values(grupo.personas || {}).some((p) => p.correo === c)) {
      const e = new Error('Ya es miembro');
      e.code = 'crd/ya-miembro';
      throw e;
    }
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('invitaciones', c), rol,
      'invitadosLista', fb.arrayUnion(c), 'modificada', Date.now());
    await this.refrescarObras();
  }

  async quitarInvitacion(grupo, correo, coleccion = 'obras') {
    const { fb } = this.f;
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('invitaciones', correo), fb.deleteField(),
      'invitadosLista', fb.arrayRemove(correo), 'modificada', Date.now());
    await this.refrescarObras();
  }

  async cambiarRol(grupo, uid, rol, coleccion = 'obras') {
    const { fb } = this.f;
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('miembros', uid), rol, 'modificada', Date.now());
    await this.refrescarObras();
  }

  async quitarMiembro(grupo, uid, coleccion = 'obras') {
    const { fb } = this.f;
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('miembros', uid), fb.deleteField(),
      'miembrosLista', fb.arrayRemove(uid), new fb.FieldPath('personas', uid), fb.deleteField(),
      'modificada', Date.now());
    // Quien sale de un equipo sale también de las obras a las que entró por él.
    if (coleccion === 'equipos') await this.quitarDeObrasDelEquipo(grupo, uid);
    await this.refrescarObras();
  }

  async aceptar(grupo, coleccion = 'obras') {
    const { fb } = this.f;
    const uid = this.usuario.uid;
    const c = this.correo;
    await fb.updateDoc(this.ref(grupo, coleccion),
      new fb.FieldPath('miembros', uid), grupo.invitaciones[c],
      'miembrosLista', fb.arrayUnion(uid),
      new fb.FieldPath('invitaciones', c), fb.deleteField(),
      'invitadosLista', fb.arrayRemove(c),
      new fb.FieldPath('personas', uid), this.ficha(),
      'modificada', Date.now());
    await this.refrescarObras();
    if (coleccion === 'equipos') await this.reconciliar();
    this.programar(0);
  }

  async rechazar(grupo, coleccion = 'obras') {
    const { fb } = this.f;
    const c = this.correo;
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('invitaciones', c), fb.deleteField(),
      'invitadosLista', fb.arrayRemove(c), 'modificada', Date.now());
    await this.refrescarObras();
  }

  async salirDeObra(obra) {
    await this.irse(obra, 'obras');
    await this.soltarLocales(obra.id);
    await this.refrescarObras();
  }

  async irse(grupo, coleccion) {
    const { fb } = this.f;
    const uid = this.usuario.uid;
    await fb.updateDoc(this.ref(grupo, coleccion), new fb.FieldPath('miembros', uid), fb.deleteField(),
      'miembrosLista', fb.arrayRemove(uid), new fb.FieldPath('personas', uid), fb.deleteField(),
      'modificada', Date.now());
  }

  /* --------------------------------------------------------------- */
  /* equipos de trabajo                                               */
  /* --------------------------------------------------------------- */

  async crearEquipo(nombre) {
    const { fb, db } = this.f;
    const uid = this.usuario.uid;
    const ref = fb.doc(fb.collection(db, 'equipos'));
    await fb.setDoc(ref, {
      nombre: nombre.trim(),
      creador: uid,
      miembros: { [uid]: 'admin' },
      miembrosLista: [uid],
      invitaciones: {},
      invitadosLista: [],
      personas: { [uid]: this.ficha() },
      obras: {},
      creada: fb.serverTimestamp(),
      modificada: Date.now()
    });
    await this.refrescarObras();
    return ref.id;
  }

  async salirDeEquipo(equipo) {
    const uid = this.usuario.uid;
    await this.irse(equipo, 'equipos');
    for (const obraId of Object.keys(equipo.obras || {})) {
      const o = this.obras.find((x) => x.id === obraId);
      if (o && ((o.porEquipo || {})[equipo.id] || []).includes(uid) && o.miembros[uid] !== 'admin') {
        await this.irse(o, 'obras').catch(() => {});
      }
    }
    await this.refrescarObras();
  }

  /* Al borrar el equipo, sus miembros salen de las obras a las que
     entraron por él. */
  async borrarEquipo(equipo) {
    const { fb } = this.f;
    for (const id of Object.keys(equipo.miembros)) await this.quitarDeObrasDelEquipo(equipo, id);
    for (const obraId of Object.keys(equipo.obras || {})) {
      const o = this.obras.find((x) => x.id === obraId);
      if (o && o.miembros[this.usuario.uid] === 'admin') {
        await fb.updateDoc(this.ref(o), new fb.FieldPath('equipos', equipo.id), fb.deleteField(),
          new fb.FieldPath('porEquipo', equipo.id), fb.deleteField(), 'modificada', Date.now()).catch(() => {});
      }
    }
    await fb.deleteDoc(this.ref(equipo, 'equipos'));
    await this.refrescarObras();
  }

  /* Como administrador del equipo: saca a alguien de sus obras (sólo de
     aquellas a las que entró por el equipo; las reglas lo comprueban). */
  async quitarDeObrasDelEquipo(equipo, uid) {
    const { fb } = this.f;
    for (const obraId of Object.keys(equipo.obras || {})) {
      await fb.updateDoc(this.ref(obraId),
        new fb.FieldPath('miembros', uid), fb.deleteField(),
        'miembrosLista', fb.arrayRemove(uid),
        new fb.FieldPath('personas', uid), fb.deleteField(),
        new fb.FieldPath('porEquipo', equipo.id), fb.arrayRemove(uid),
        'ultimoEquipo', equipo.id,
        'modificada', Date.now()).catch(() => {});
    }
  }

  /* Vincula un equipo a una obra con un papel: hace falta administrar las
     dos. Los miembros actuales entran ya; los futuros, al sincronizar. */
  async vincularEquipo(obra, equipo, papel) {
    const { fb } = this.f;
    const nuevos = Object.keys(equipo.miembros).filter((id) => !(id in obra.miembros));
    const cambios = [
      new fb.FieldPath('equipos', equipo.id), papel,
      new fb.FieldPath('porEquipo', equipo.id), nuevos,
      'ultimoEquipo', equipo.id,
      'modificada', Date.now()
    ];
    if (nuevos.length) cambios.push('miembrosLista', fb.arrayUnion(...nuevos));
    for (const id of nuevos) {
      cambios.push(new fb.FieldPath('miembros', id), papel);
      if (equipo.personas && equipo.personas[id]) cambios.push(new fb.FieldPath('personas', id), equipo.personas[id]);
    }
    await fb.updateDoc(this.ref(obra), ...cambios);
    await fb.updateDoc(this.ref(equipo, 'equipos'), new fb.FieldPath('obras', obra.id),
      { nombre: obra.nombre, papel }, 'modificada', Date.now());
    await this.refrescarObras();
  }

  async desvincularEquipo(obra, equipoId) {
    const { fb } = this.f;
    const salen = ((obra.porEquipo || {})[equipoId] || []).filter((id) => obra.miembros[id] && obra.miembros[id] !== 'admin');
    const cambios = [
      new fb.FieldPath('equipos', equipoId), fb.deleteField(),
      new fb.FieldPath('porEquipo', equipoId), fb.deleteField(),
      'modificada', Date.now()
    ];
    if (salen.length) cambios.push('miembrosLista', fb.arrayRemove(...salen));
    for (const id of salen) cambios.push(new fb.FieldPath('miembros', id), fb.deleteField(), new fb.FieldPath('personas', id), fb.deleteField());
    await fb.updateDoc(this.ref(obra), ...cambios);
    const equipo = this.equipos.find((e) => e.id === equipoId);
    if (equipo && equipo.miembros[this.usuario.uid] === 'admin') {
      await fb.updateDoc(this.ref(equipo, 'equipos'), new fb.FieldPath('obras', obra.id), fb.deleteField(),
        'modificada', Date.now()).catch(() => {});
    }
    await this.refrescarObras();
  }

  /* Pone al día las obras por equipos: entra en las obras de mis equipos
     donde aún no estoy y sale de aquellas a las que entré por un equipo
     del que ya no soy miembro. */
  async reconciliar() {
    const { fb } = this.f;
    const uid = this.usuario.uid;
    let cambio = false;
    const mias = new Set(this.obras.map((o) => o.id));
    for (const eq of this.equipos) {
      for (const [obraId, info] of Object.entries(eq.obras || {})) {
        if (mias.has(obraId)) continue;
        try {
          await fb.updateDoc(this.ref(obraId),
            new fb.FieldPath('miembros', uid), info.papel,
            'miembrosLista', fb.arrayUnion(uid),
            new fb.FieldPath('porEquipo', eq.id), fb.arrayUnion(uid),
            new fb.FieldPath('personas', uid), this.ficha(),
            'ultimoEquipo', eq.id,
            'modificada', Date.now());
          mias.add(obraId);
          cambio = true;
        } catch (e) { /* la obra ya no está vinculada a ese equipo */ }
      }
    }
    const misEquipos = new Set(this.equipos.map((e) => e.id));
    for (const o of this.obras) {
      if (o.miembros[uid] === 'admin') continue;
      const porEquipos = Object.entries(o.porEquipo || {}).filter(([, lista]) => lista.includes(uid)).map(([eid]) => eid);
      if (porEquipos.length && porEquipos.every((eid) => !misEquipos.has(eid))) {
        await this.irse(o, 'obras').catch(() => {});
        await this.soltarLocales(o.id);
        cambio = true;
      }
    }
    if (cambio) await this.refrescarObras();
  }

  /* Borra la obra de la nube con todo lo que tiene. Lo que hay en este
     teléfono se queda, ya sin compartir. */
  async borrarObra(obra) {
    const { fb, db, storage } = this.f;
    for (const tipo of Object.keys(TIPOS)) {
      const docs = (await fb.getDocs(fb.collection(db, 'obras', obra.id, tipo))).docs;
      for (let i = 0; i < docs.length; i += 400) {
        const lote = fb.writeBatch(db);
        for (const d of docs.slice(i, i + 400)) lote.delete(d.ref);
        await lote.commit();
      }
    }
    const archivos = await fb.listAll(fb.ref(storage, `obras/${obra.id}/archivos`));
    for (const a of archivos.items) await fb.deleteObject(a).catch(() => {});
    await fb.deleteDoc(this.ref(obra));
    await this.soltarLocales(obra.id);
    await this.refrescarObras();
  }

  async soltarLocales(obraId) {
    for (const T of Object.values(TIPOS)) {
      for (const r of await T.listar()) {
        if (r.obraId === obraId) await T.guardar({ ...r, obraId: null }, { callado: true });
      }
    }
  }

  /* --------------------------------------------------------------- */
  /* sincronización                                                   */
  /* --------------------------------------------------------------- */

  async sincronizar() {
    if (!this.usuario) return;
    if (this.sincronizando) { this.otraVez = true; return; }
    if (!navigator.onLine) {
      this.ponerEstado('sin-red', 'Sin conexión: se sincroniza al volver la señal.');
      return;
    }
    this.sincronizando = true;
    this.pendiente = false;
    this.ponerEstado('sincronizando', 'Sincronizando…');
    const cambiados = new Set();
    const nuevas = [];
    try {
      await this.refrescarObras();
      await this.reconciliar();
      await this.asignarObras(cambiados);
      await this.subirBajas();
      const uid = this.usuario.uid;
      for (const obra of this.obras) {
        if (obra.miembros[uid] === 'contratista') {
          await this.subirAsignados(obra);
          await this.bajarAsignados(obra, cambiados);
          continue;
        }
        for (const tipo of Object.keys(TIPOS)) {
          const escribe = ESCRIBEN.includes(obra.miembros[uid]);
          // El programa se baja primero para juntar el avance de otros
          // teléfonos antes de subir el propio.
          if (tipo === 'programas') {
            await this.bajar(obra, tipo, cambiados, nuevas);
            if (escribe) await this.subir(obra, tipo);
            continue;
          }
          if (escribe) await this.subir(obra, tipo);
          await this.bajar(obra, tipo, cambiados, nuevas);
        }
      }
      if (nuevas.length) {
        novedades.anotar(this.usuario.uid, nuevas);
        this.cacheObras.clear();
      }
      this.ponerEstado('ok', this.obras.length ? `Sincronizado a las ${ahora()}` : '');
    } catch (e) {
      console.error(e);
      this.pendiente = true;
      this.ponerEstado('error', 'No se pudo sincronizar; se reintentará solo.');
    } finally {
      this.sincronizando = false;
      if (cambiados.size) dispatchEvent(new CustomEvent('crd-remoto', { detail: { ids: [...cambiados], nuevas } }));
      if (this.otraVez) { this.otraVez = false; this.programar(1000); }
    }
  }

  /* Lo que en el teléfono lleva el nombre de una obra compartida (y aún
     no tiene obraId) pasa a ella. */
  async asignarObras(cambiados) {
    const uid = this.usuario.uid;
    const destino = this.obras.filter((o) => ESCRIBEN.includes(o.miembros[uid]));
    if (!destino.length) return;
    for (const T of Object.values(TIPOS)) {
      for (const r of await T.listar()) {
        if (r.obraId || !r.obra) continue;
        const obra = destino.find((o) => mismaObra(o.nombre, r.obra));
        if (!obra) continue;
        await T.guardar({ ...r, obraId: obra.id }, { callado: true });
        cambiados.add(r.id);
      }
    }
  }

  async subirBajas() {
    const { fb, db } = this.f;
    const uid = this.usuario.uid;
    for (const b of await partes.listarBajas()) {
      const obra = this.obras.find((o) => o.id === b.obraId);
      if (obra && ESCRIBEN.includes(obra.miembros[uid])) {
        await fb.setDoc(fb.doc(db, 'obras', b.obraId, b.tipo, b.registro), {
          datos: '', version: b.cuando, borrado: true, autor: uid, actualizado: fb.serverTimestamp()
        });
      }
      await partes.quitarBaja(b.id);
    }
  }

  /* ¿Hay Storage? Sin plan Blaze no existe: se recuerda 6 h y, mientras,
     los archivos van a la nube vinculada del autor. */
  get sinStorage() {
    try { return Date.now() - Number(localStorage.getItem('crd-sin-storage') || 0) < 6 * 3600e3; } catch (e) { return false; }
  }

  marcarSinStorage() {
    try { localStorage.setItem('crd-sin-storage', String(Date.now())); } catch (e) { /* nada */ }
  }

  /* Sube un archivo al Drive u OneDrive del autor (carpeta «Obras / nombre
     de la obra», compartida con el equipo) y devuelve su enlace, o null. */
  async subirAVinculada(obra, archivo) {
    const lista = vinculadas();
    const proveedor = lista.includes('google') ? 'google' : lista[0];
    if (!proveedor) return null;
    const ruta = ['Obras', obra.nombre];
    try {
      const subido = await subirArchivo(proveedor, ruta, archivo.ruta.split('/').pop(), archivo.blob, tipoImagen(archivo.blob));
      if (!this.compartidas) this.compartidas = new Set();
      if (!this.compartidas.has(obra.id)) {
        const correos = Object.entries(obra.personas || {})
          .filter(([id, p]) => id !== this.usuario.uid && p && p.correo).map(([, p]) => p.correo);
        const carpeta = await compartirCarpeta(proveedor, ruta, correos).catch((e) => { console.warn('compartir', e); return null; });
        if (carpeta) {
          const m = leerMapa('crd-carpetas');
          m[obra.id] = carpeta;
          escribirMapa('crd-carpetas', m);
        }
        this.compartidas.add(obra.id);
      }
      return subido.url || null;
    } catch (e) {
      console.warn('nube vinculada', e);
      return null;
    }
  }

  async subir(obra, tipo, filtro = () => true) {
    const { fb, db, storage } = this.f;
    const pendientes = new Set(Object.keys(leerMapa('crd-archivos-pendientes')));
    for (const r of await TIPOS[tipo].listar()) {
      if (r.obraId !== obra.id || !filtro(r)) continue;
      const v = version(r);
      const yaSubido = v <= await partes.versionSincronizada(tipo, r.id);
      if (yaSubido && !pendientes.has(r.id)) continue;
      const { datos, archivos } = await separar(tipo, r, obra.id);
      const enlaces = leerMapa(CLAVE_ENLACES);
      let faltan = 0, nuevos = 0;
      for (const a of archivos) {
        if (!a.blob || await partes.estaSubido(a.ruta) || enlaces[a.ruta]) continue;
        if (!this.sinStorage) {
          try {
            await fb.uploadBytes(fb.ref(storage, a.ruta), a.blob, { contentType: tipoImagen(a.blob) });
            await partes.anotarSubido(a.ruta);
            continue;
          } catch (e) {
            if (!FALTA_STORAGE.includes(e && e.code)) throw e;
            this.marcarSinStorage();
          }
        }
        const enlace = await this.subirAVinculada(obra, a);
        if (enlace) { enlaces[a.ruta] = enlace; nuevos++; } else faltan++;
      }
      escribirMapa(CLAVE_ENLACES, enlaces);
      // Lo que no ha podido subirse a ningún sitio se reintenta más tarde.
      const mapaPendientes = leerMapa('crd-archivos-pendientes');
      if (faltan) mapaPendientes[r.id] = Date.now(); else delete mapaPendientes[r.id];
      escribirMapa('crd-archivos-pendientes', mapaPendientes);
      // Los enlaces conseguidos ahora, a los datos.
      if (datos.fotos) for (const f of datos.fotos) if (!f.enlace && enlaces[f.ruta]) f.enlace = enlaces[f.ruta];
      if (datos.firmaRuta && !datos.firmaEnlace && enlaces[datos.firmaRuta]) datos.firmaEnlace = enlaces[datos.firmaRuta];
      if (datos.firmas) for (const f of Object.values(datos.firmas)) if (f && f.ruta && !f.enlace && enlaces[f.ruta]) f.enlace = enlaces[f.ruta];
      if (tipo === 'planos' && !datos.enlace && enlaces[datos.ruta]) datos.enlace = enlaces[datos.ruta];
      const carpeta = leerMapa('crd-carpetas')[obra.id];
      if (carpeta && tipo !== 'planos') datos.carpetaEnlace = carpeta;
      if (yaSubido && !nuevos) continue;
      const documento = {
        datos: JSON.stringify(datos), version: v, borrado: false,
        autor: this.usuario.uid, actualizado: fb.serverTimestamp()
      };
      // A la vista de las reglas: a quién está asignado y en qué estado.
      if (tipo === 'repasos') Object.assign(documento, { asignado: r.asignado || null, estado: estadoRepaso(r) });
      await fb.setDoc(fb.doc(db, 'obras', obra.id, tipo, r.id), documento);
      await partes.anotarSincronizada(tipo, r.id, v);
    }
  }

  /* El contratista sube sólo sus repasos sin cerrar (las reglas no le
     dejan otra cosa). */
  subirAsignados(obra) {
    const uid = this.usuario.uid;
    return this.subir(obra, 'repasos', (r) => r.asignado === uid && !r.cerrado);
  }

  /* …y baja sólo los suyos: no puede consultar el resto. */
  async bajarAsignados(obra, cambiados) {
    const { fb, db, storage } = this.f;
    const T = TIPOS.repasos;
    const res = await fb.getDocs(fb.query(fb.collection(db, 'obras', obra.id, 'repasos'),
      fb.where('asignado', '==', this.usuario.uid)));
    const bajarArchivo = async (ruta) => {
      const blob = await fb.getBlob(fb.ref(storage, ruta));
      await partes.anotarSubido(ruta);
      return blob;
    };
    for (const d of res.docs) {
      const x = d.data();
      const local = await T.leer(d.id);
      if (x.borrado || (local && version(local) >= x.version)) continue;
      const r = await juntar('repasos', JSON.parse(x.datos), local, bajarArchivo);
      await T.guardar(r, { callado: true });
      await partes.anotarSincronizada('repasos', d.id, x.version);
      cambiados.add(d.id);
    }
  }

  async bajar(obra, tipo, cambiados, nuevas) {
    const { fb, db, storage } = this.f;
    const T = TIPOS[tipo];
    const clave = `crd-marca:${this.usuario.uid}:${obra.id}:${tipo}`;
    let marca = 0;
    try { marca = Number(localStorage.getItem(clave)) || 0; } catch (e) { /* sin almacenamiento */ }
    // Un poco hacia atrás: volver a ver un documento no hace daño.
    const desde = fb.Timestamp.fromMillis(Math.max(0, marca - 5000));
    const res = await fb.getDocs(fb.query(fb.collection(db, 'obras', obra.id, tipo), fb.where('actualizado', '>', desde)));
    const bajarArchivo = async (ruta) => {
      const blob = await fb.getBlob(fb.ref(storage, ruta));
      await partes.anotarSubido(ruta);
      return blob;
    };
    let nueva = marca;
    for (const d of res.docs) {
      const x = d.data();
      if (x.actualizado) nueva = Math.max(nueva, x.actualizado.toMillis());
      const local = await T.leer(d.id);
      if (x.borrado) {
        if (local && local.obraId === obra.id) {
          await T.borrar(d.id, { callado: true });
          cambiados.add(d.id);
        }
        continue;
      }
      // El programa de avance es un documento por obra: si este teléfono
      // tiene cambios sin subir, se juntan partida a partida en vez de
      // pisarse (gana la última escritura en todo lo demás).
      if (tipo === 'programas' && local && version(local) !== x.version
        && version(local) > await partes.versionSincronizada(tipo, d.id)) {
        const { fusionarProgramas } = await import('./seguimiento-datos.js');
        const junto = fusionarProgramas(local, JSON.parse(x.datos));
        junto.modificado = Math.max(version(local), x.version) + 1;
        await T.guardar(junto, { callado: true });
        cambiados.add(d.id);
        continue;
      }
      if (local && version(local) >= x.version) continue;
      let r;
      try {
        r = await juntar(tipo, JSON.parse(x.datos), local, bajarArchivo);
      } catch (e) {
        if (e.code !== 'crd/sin-archivo') throw e;
        // Plano que no está en Storage: se recuerda con su enlace.
        const dp = JSON.parse(x.datos);
        const m = leerMapa('crd-planos-remotos');
        m[obra.id] = [...(m[obra.id] || []).filter((p) => p.id !== d.id), { id: d.id, nombre: dp.nombre, enlace: dp.enlace || null, obra: dp.obra }];
        escribirMapa('crd-planos-remotos', m);
        continue;
      }
      await T.guardar(r, { callado: true });
      await partes.anotarSincronizada(tipo, d.id, x.version);
      cambiados.add(d.id);
      // Lo que hace otro es novedad (salvo la primera vez que se baja la
      // obra entera: entonces sería todo).
      if (marca && nuevas && x.autor && x.autor !== this.usuario.uid && tipo !== 'planos') {
        nuevas.push({
          id: d.id, tipo, obraId: obra.id, obra: obra.nombre, nuevo: !local,
          quien: this.nombreDe(obra, x.autor) || r.autor || '',
          fecha: r.fecha || r.desde || '',
          titulo: tituloNovedad(tipo, r),
          cuando: x.actualizado ? x.actualizado.toMillis() : Date.now()
        });
      }
    }
    try { localStorage.setItem(clave, String(nueva)); } catch (e) { /* se repetirá */ }
  }
}

export const equipo = new Equipo();
