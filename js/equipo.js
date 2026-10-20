/* Cuenta de usuario, obras compartidas y sincronización con Firebase.

   La app sigue siendo «primero el teléfono»: todo se escribe en IndexedDB
   (partes.js) y funciona sin señal. Lo que pertenece a una obra
   compartida se sincroniza cuando hay conexión:

   · subir: cada visita, repaso o plano cuya versión local es más nueva
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

export const ROLES = { admin: 'Administrador', editor: 'Editor', lector: 'Solo lectura', contratista: 'Contratista' };
export const PAPELES_EQUIPO = { admin: 'Administrador', miembro: 'Miembro' };
const ESCRIBEN = ['admin', 'editor'];

// Los planos primero: las notas de las visitas apuntan a ellos.
const TIPOS = {
  planos: { listar: partes.listarPlanos, leer: partes.leerPlano, guardar: partes.guardarPlano, borrar: partes.borrarPlano },
  visitas: { listar: partes.listarVisitas, leer: partes.leerVisita, guardar: partes.guardarVisita, borrar: partes.borrarVisita },
  repasos: { listar: partes.listarRepasos, leer: partes.leerRepaso, guardar: partes.guardarRepaso, borrar: partes.borrarRepaso }
};

const version = (r) => r.modificada || r.modificado || r.creado || 0;
const estadoRepaso = (r) => (r.cerrado ? 'cerrado' : r.corregido ? 'corregido' : 'pendiente');
const minusculas = (c) => (c || '').trim().toLowerCase();
const extension = (blob) => (/png/.test(blob.type) ? 'png' : 'jpg');
const tipoImagen = (blob) => (blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg');

async function huella(blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].slice(0, 6).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* Separa un registro en sus datos (sin Blobs) y los archivos que lleva. */
async function separar(tipo, r, obraId) {
  const base = `obras/${obraId}/archivos/`;
  const archivos = [];
  const datos = { ...r };
  if (tipo === 'visitas' || tipo === 'repasos') {
    datos.fotos = (r.fotos || []).map(({ blob, ...foto }) => {
      const ruta = `${base}${foto.id}.${extension(blob)}`;
      archivos.push({ ruta, blob });
      return { ...foto, ruta };
    });
  }
  if (tipo === 'visitas') {
    datos.firma = null;
    datos.firmaRuta = null;
    if (r.firma) {
      datos.firmaRuta = `${base}firma-${r.id}-${await huella(r.firma)}.png`;
      archivos.push({ ruta: datos.firmaRuta, blob: r.firma });
    }
  }
  if (tipo === 'planos') {
    delete datos.blob;
    datos.ruta = `${base}plano-${r.id}.${extension(r.blob)}`;
    archivos.push({ ruta: datos.ruta, blob: r.blob });
  }
  return { datos, archivos };
}

/* Lo contrario: rehace el registro local, reutilizando las imágenes que
   ya están en el teléfono y bajando las que falten. */
async function juntar(tipo, datos, local, bajar) {
  const r = { ...datos };
  if (tipo === 'visitas' || tipo === 'repasos') {
    r.fotos = await Promise.all((datos.fotos || []).map(async ({ ruta, ...foto }) => {
      const previa = local && (local.fotos || []).find((f) => f.id === foto.id && f.blob);
      return { ...foto, blob: previa ? previa.blob : await bajar(ruta) };
    }));
  }
  if (tipo === 'visitas') {
    r.firma = datos.firmaRuta ? await bajar(datos.firmaRuta) : null;
    delete r.firmaRuta;
  }
  if (tipo === 'planos') {
    r.blob = local && local.blob ? local.blob : await bajar(datos.ruta);
    delete r.ruta;
  }
  return r;
}

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
    addEventListener('crd-cambio', () => this.programar(4000));
    addEventListener('online', () => this.programar(500));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.programar(800); });
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

  /* Tras pulsar el enlace del correo: se recarga el usuario y su token,
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
    await fb.setDoc(fb.doc(db, 'usuarios', this.usuario.uid),
      { nombre: this.nombre, correo: this.correo, visto: fb.serverTimestamp() }, { merge: true });
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

  ficha() {
    return { nombre: this.nombre, correo: this.correo };
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
    this.ponerEstado('sincronizando', 'Sincronizando…');
    const cambiados = new Set();
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
          if (ESCRIBEN.includes(obra.miembros[uid])) await this.subir(obra, tipo);
          await this.bajar(obra, tipo, cambiados);
        }
      }
      this.ponerEstado('ok', this.obras.length ? `Sincronizado a las ${ahora()}` : '');
    } catch (e) {
      console.error(e);
      this.ponerEstado('error', 'No se pudo sincronizar; se reintentará solo.');
    } finally {
      this.sincronizando = false;
      if (cambiados.size) dispatchEvent(new CustomEvent('crd-remoto', { detail: { ids: [...cambiados] } }));
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

  async subir(obra, tipo, filtro = () => true) {
    const { fb, db, storage } = this.f;
    for (const r of await TIPOS[tipo].listar()) {
      if (r.obraId !== obra.id || !filtro(r)) continue;
      const v = version(r);
      if (v <= await partes.versionSincronizada(tipo, r.id)) continue;
      const { datos, archivos } = await separar(tipo, r, obra.id);
      for (const a of archivos) {
        if (!a.blob || await partes.estaSubido(a.ruta)) continue;
        await fb.uploadBytes(fb.ref(storage, a.ruta), a.blob, { contentType: tipoImagen(a.blob) });
        await partes.anotarSubido(a.ruta);
      }
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

  async bajar(obra, tipo, cambiados) {
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
      if (local && version(local) >= x.version) continue;
      const r = await juntar(tipo, JSON.parse(x.datos), local, bajarArchivo);
      await T.guardar(r, { callado: true });
      await partes.anotarSincronizada(tipo, d.id, x.version);
      cambiados.add(d.id);
    }
    try { localStorage.setItem(clave, String(nueva)); } catch (e) { /* se repetirá */ }
  }
}

export const equipo = new Equipo();
