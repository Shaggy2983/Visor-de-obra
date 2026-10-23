/* Pruebas de las reglas de seguridad (firestore.rules y storage.rules)
   contra los emuladores de Firebase. Ver pruebas/LEEME.md. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, FieldPath, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
// fileURLToPath y no .pathname: en Windows .pathname da «/C:/…» y rompe la ruta.
const R = fileURLToPath(new URL('../', import.meta.url));
const env = await initializeTestEnvironment({
  projectId: 'demo-coordinate',
  firestore: { rules: readFileSync(R + 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: readFileSync(R + 'storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 }
});
await env.clearFirestore();
const A = env.authenticatedContext('ana', { email: 'ana@obra.do', email_verified: true });
const B = env.authenticatedContext('beto', { email: 'Beto@Obra.do', email_verified: true });
const Bnv = env.authenticatedContext('beto', { email: 'beto@obra.do', email_verified: false });
const X = env.authenticatedContext('extra', { email: 'x@x.do', email_verified: true });
const dA = A.firestore(), dB = B.firestore(), dX = X.firestore();
let ok = 0, mal = 0;
const prueba = async (nombre, p) => { try { await p; ok++; } catch (e) { mal++; console.log('FALLA:', nombre, e.message.slice(0, 160)); } };
const obra = { nombre: 'Torre A', creador: 'ana', miembros: { ana: 'admin' }, miembrosLista: ['ana'], invitaciones: {}, invitadosLista: [], modificada: 1 };
await prueba('crear obra', assertSucceeds(setDoc(doc(dA, 'obras/o1'), obra)));
await prueba('crear obra ajena', assertFails(setDoc(doc(dX, 'obras/o2'), { ...obra, creador: 'ana' })));
await prueba('crear obra con otros miembros', assertFails(setDoc(doc(dX, 'obras/o3'), { ...obra, creador: 'extra', miembros: { extra: 'admin', ana: 'editor' }, miembrosLista: ['extra', 'ana'] })));
await prueba('extraño no lee', assertFails(getDoc(doc(dX, 'obras/o1'))));
await prueba('invitar beto', assertSucceeds(updateDoc(doc(dA, 'obras/o1'), new FieldPath('invitaciones', 'beto@obra.do'), 'editor', 'invitadosLista', arrayUnion('beto@obra.do'))));
await prueba('beto ve invitación (consulta)', assertSucceeds(getDocs(query(collection(dB, 'obras'), where('invitadosLista', 'array-contains', 'beto@obra.do')))));
await prueba('beto sin verificar no ve', assertFails(getDoc(doc(Bnv.firestore(), 'obras/o1'))));
await prueba('beto no se pone admin', assertFails(updateDoc(doc(dB, 'obras/o1'), new FieldPath('miembros', 'beto'), 'admin', 'miembrosLista', arrayUnion('beto'), new FieldPath('invitaciones', 'beto@obra.do'), deleteField(), 'invitadosLista', arrayRemove('beto@obra.do'))));
await prueba('beto acepta', assertSucceeds(updateDoc(doc(dB, 'obras/o1'), new FieldPath('personas', 'beto'), { nombre: 'Beto', correo: 'beto@obra.do' }, new FieldPath('miembros', 'beto'), 'editor', 'miembrosLista', arrayUnion('beto'), new FieldPath('invitaciones', 'beto@obra.do'), deleteField(), 'invitadosLista', arrayRemove('beto@obra.do'))));
await prueba('beto toca ficha ajena', assertFails(updateDoc(doc(dB, 'obras/o1'), new FieldPath('personas', 'ana'), { nombre: 'X' })));
await prueba('beto lista sus obras', assertSucceeds(getDocs(query(collection(dB, 'obras'), where('miembrosLista', 'array-contains', 'beto')))));
await prueba('beto escribe visita', assertSucceeds(setDoc(doc(dB, 'obras/o1/visitas/v1'), { datos: '{}', modificada: 2 })));
await prueba('extraño no lee visita', assertFails(getDoc(doc(dX, 'obras/o1/visitas/v1'))));
await prueba('colección no permitida', assertFails(setDoc(doc(dB, 'obras/o1/otra/v1'), { a: 1 })));
await prueba('beto no cambia roles', assertFails(updateDoc(doc(dB, 'obras/o1'), new FieldPath('miembros', 'ana'), 'lector')));
await prueba('ana pasa beto a lector', assertSucceeds(updateDoc(doc(dA, 'obras/o1'), new FieldPath('miembros', 'beto'), 'lector')));
await prueba('lector no escribe', assertFails(setDoc(doc(dB, 'obras/o1/visitas/v2'), { datos: '{}' })));
await prueba('lector lee', assertSucceeds(getDoc(doc(dB, 'obras/o1/visitas/v1'))));
const png = new Uint8Array([137, 80, 78, 71]);
await prueba('ana sube foto', assertSucceeds(uploadBytes(ref(A.storage(), 'obras/o1/archivos/f1.jpg'), png, { contentType: 'image/jpeg' })));
await prueba('lector baja foto', assertSucceeds(getBytes(ref(B.storage(), 'obras/o1/archivos/f1.jpg'))));
await prueba('lector no sube', assertFails(uploadBytes(ref(B.storage(), 'obras/o1/archivos/f2.jpg'), png, { contentType: 'image/jpeg' })));
await prueba('extraño no baja', assertFails(getBytes(ref(X.storage(), 'obras/o1/archivos/f1.jpg'))));
await prueba('no imagen', assertFails(uploadBytes(ref(A.storage(), 'obras/o1/archivos/x.txt'), png, { contentType: 'text/plain' })));
await prueba('beto se va', assertSucceeds(updateDoc(doc(dB, 'obras/o1'), new FieldPath('miembros', 'beto'), deleteField(), 'miembrosLista', arrayRemove('beto'))));
await prueba('ana no deja la obra sin admin', assertFails(updateDoc(doc(dA, 'obras/o1'), new FieldPath('miembros', 'ana'), 'editor')));
await prueba('usuario propio', assertSucceeds(setDoc(doc(dA, 'usuarios/ana'), { nombre: 'Ana' })));
await prueba('usuario ajeno', assertFails(getDoc(doc(dX, 'usuarios/ana'))));
await prueba('extraño no borra obra', assertFails(deleteDoc(doc(dX, 'obras/o1'))));
await prueba('ana borra obra', assertSucceeds(deleteDoc(doc(dA, 'obras/o1'))));

// --- equipos de trabajo ---
const C = env.authenticatedContext('carla', { email: 'carla@obra.do', email_verified: true });
const D = env.authenticatedContext('dan', { email: 'dan@obra.do', email_verified: true });
const dC = C.firestore(), dD = D.firestore();
const grupo = (nombre, creador, extra = {}) => ({ nombre, creador, miembros: { [creador]: 'admin' }, miembrosLista: [creador], invitaciones: {}, invitadosLista: [], personas: {}, modificada: 1, ...extra });
const aceptar = (bd, ruta, quien, correo, papel) => updateDoc(doc(bd, ruta), new FieldPath('miembros', quien), papel, 'miembrosLista', arrayUnion(quien),
  new FieldPath('invitaciones', correo), deleteField(), 'invitadosLista', arrayRemove(correo), new FieldPath('personas', quien), { nombre: quien, correo });
await prueba('crear equipo', assertSucceeds(setDoc(doc(dA, 'equipos/e1'), grupo('Oficina técnica', 'ana'))));
await prueba('equipo con papel raro', assertFails(setDoc(doc(dA, 'equipos/e9'), grupo('X', 'ana', { miembros: { ana: 'editor' } }))));
await prueba('extraño no lee equipo', assertFails(getDoc(doc(dX, 'equipos/e1'))));
await prueba('invitar a carla al equipo', assertSucceeds(updateDoc(doc(dA, 'equipos/e1'), new FieldPath('invitaciones', 'carla@obra.do'), 'miembro', 'invitadosLista', arrayUnion('carla@obra.do'))));
await prueba('carla acepta el equipo', assertSucceeds(aceptar(dC, 'equipos/e1', 'carla', 'carla@obra.do', 'miembro')));
await prueba('crear obra o2', assertSucceeds(setDoc(doc(dA, 'obras/o2'), grupo('Torre B', 'ana', { equipos: {}, porEquipo: {} }))));
await prueba('ana vincula el equipo a la obra', assertSucceeds(updateDoc(doc(dA, 'obras/o2'), new FieldPath('equipos', 'e1'), 'editor',
  new FieldPath('porEquipo', 'e1'), ['carla'], new FieldPath('miembros', 'carla'), 'editor', 'miembrosLista', arrayUnion('carla'), 'ultimoEquipo', 'e1')));
await prueba('ana apunta la obra en el equipo', assertSucceeds(updateDoc(doc(dA, 'equipos/e1'), new FieldPath('obras', 'o2'), { nombre: 'Torre B', papel: 'editor' })));
await prueba('invitar a dan al equipo', assertSucceeds(updateDoc(doc(dA, 'equipos/e1'), new FieldPath('invitaciones', 'dan@obra.do'), 'miembro', 'invitadosLista', arrayUnion('dan@obra.do'))));
const unirse = (bd, quien, obra, eid, papel, lista) => updateDoc(doc(bd, `obras/${obra}`), new FieldPath('miembros', quien), papel, 'miembrosLista', arrayUnion(quien),
  new FieldPath('porEquipo', eid), lista, new FieldPath('personas', quien), { nombre: quien }, 'ultimoEquipo', eid);
await prueba('dan no se une antes de entrar al equipo', assertFails(unirse(dD, 'dan', 'o2', 'e1', 'editor', ['carla', 'dan'])));
await prueba('dan acepta el equipo', assertSucceeds(aceptar(dD, 'equipos/e1', 'dan', 'dan@obra.do', 'miembro')));
await prueba('dan no se une como admin', assertFails(unirse(dD, 'dan', 'o2', 'e1', 'admin', ['carla', 'dan'])));
await prueba('dan se une a la obra por el equipo', assertSucceeds(unirse(dD, 'dan', 'o2', 'e1', 'editor', ['carla', 'dan'])));
await prueba('dan lee la obra', assertSucceeds(getDoc(doc(dD, 'obras/o2'))));
await prueba('extraño no se une por el equipo', assertFails(unirse(dX, 'extra', 'o2', 'e1', 'editor', ['carla', 'dan', 'extra'])));
await prueba('crear obra o3 sin equipo', assertSucceeds(setDoc(doc(dA, 'obras/o3'), grupo('Torre C', 'ana'))));
await prueba('dan no se une a obra no vinculada', assertFails(unirse(dD, 'dan', 'o3', 'e1', 'editor', ['dan'])));
// carla administra un equipo e2 vinculado a una obra que no administra
await prueba('carla crea equipo e2', assertSucceeds(setDoc(doc(dC, 'equipos/e2'), grupo('Cuadrilla', 'carla'))));
await prueba('carla invita a dan a e2', assertSucceeds(updateDoc(doc(dC, 'equipos/e2'), new FieldPath('invitaciones', 'dan@obra.do'), 'miembro', 'invitadosLista', arrayUnion('dan@obra.do'))));
await prueba('dan acepta e2', assertSucceeds(aceptar(dD, 'equipos/e2', 'dan', 'dan@obra.do', 'miembro')));
await prueba('ana vincula e2 a o3', assertSucceeds(updateDoc(doc(dA, 'obras/o3'), new FieldPath('equipos', 'e2'), 'lector', new FieldPath('porEquipo', 'e2'), [], 'ultimoEquipo', 'e2')));
await prueba('dan se une a o3 por e2', assertSucceeds(unirse(dD, 'dan', 'o3', 'e2', 'lector', ['dan'])));
await prueba('carla no quita a ana (no entró por su equipo)', assertFails(updateDoc(doc(dC, 'obras/o3'), new FieldPath('miembros', 'ana'), deleteField(), 'miembrosLista', arrayRemove('ana'), 'ultimoEquipo', 'e2')));
await prueba('carla quita a dan de o3 por e2', assertSucceeds(updateDoc(doc(dC, 'obras/o3'), new FieldPath('miembros', 'dan'), deleteField(), 'miembrosLista', arrayRemove('dan'),
  new FieldPath('personas', 'dan'), deleteField(), new FieldPath('porEquipo', 'e2'), [], 'ultimoEquipo', 'e2')));
await prueba('miembro del equipo no lo gestiona', assertFails(updateDoc(doc(dD, 'equipos/e1'), new FieldPath('invitaciones', 'x@x.do'), 'miembro', 'invitadosLista', arrayUnion('x@x.do'))));
await prueba('dan sale del equipo e1', assertSucceeds(updateDoc(doc(dD, 'equipos/e1'), new FieldPath('miembros', 'dan'), deleteField(), 'miembrosLista', arrayRemove('dan'), new FieldPath('personas', 'dan'), deleteField())));

// --- contratista ---
const P = env.authenticatedContext('pepe', { email: 'pepe@obra.do', email_verified: true });
const dP = P.firestore();
await prueba('ana pone a pepe de contratista', assertSucceeds(updateDoc(doc(dA, 'obras/o2'), new FieldPath('miembros', 'pepe'), 'contratista', 'miembrosLista', arrayUnion('pepe'))));
await prueba('ana escribe repaso de pepe', assertSucceeds(setDoc(doc(dA, 'obras/o2/repasos/r1'), { datos: '{}', version: 1, asignado: 'pepe', estado: 'pendiente', borrado: false })));
await prueba('ana escribe repaso de otro', assertSucceeds(setDoc(doc(dA, 'obras/o2/repasos/r2'), { datos: '{}', version: 1, asignado: 'otro', estado: 'pendiente', borrado: false })));
await prueba('ana escribe visita', assertSucceeds(setDoc(doc(dA, 'obras/o2/visitas/v1'), { datos: '{}', version: 1, borrado: false })));
await prueba('pepe lista sus repasos', assertSucceeds(getDocs(query(collection(dP, 'obras/o2/repasos'), where('asignado', '==', 'pepe')))));
await prueba('pepe no lista todos', assertFails(getDocs(collection(dP, 'obras/o2/repasos'))));
await prueba('pepe no lee repaso ajeno', assertFails(getDoc(doc(dP, 'obras/o2/repasos/r2'))));
await prueba('pepe no lee visitas', assertFails(getDoc(doc(dP, 'obras/o2/visitas/v1'))));
await prueba('pepe marca corregido', assertSucceeds(setDoc(doc(dP, 'obras/o2/repasos/r1'), { datos: '{"x":1}', version: 2, asignado: 'pepe', estado: 'corregido', borrado: false })));
await prueba('pepe no cierra', assertFails(setDoc(doc(dP, 'obras/o2/repasos/r1'), { datos: '{}', version: 3, asignado: 'pepe', estado: 'cerrado', borrado: false })));
await prueba('pepe no reasigna', assertFails(setDoc(doc(dP, 'obras/o2/repasos/r1'), { datos: '{}', version: 3, asignado: 'otro', estado: 'corregido', borrado: false })));
await prueba('pepe no borra', assertFails(deleteDoc(doc(dP, 'obras/o2/repasos/r1'))));
await prueba('pepe no crea', assertFails(setDoc(doc(dP, 'obras/o2/repasos/r9'), { datos: '{}', version: 1, asignado: 'pepe', estado: 'pendiente', borrado: false })));
await prueba('ana cierra el repaso', assertSucceeds(setDoc(doc(dA, 'obras/o2/repasos/r1'), { datos: '{}', version: 4, asignado: 'pepe', estado: 'cerrado', borrado: false })));
await prueba('pepe no toca un repaso cerrado', assertFails(setDoc(doc(dP, 'obras/o2/repasos/r1'), { datos: '{}', version: 5, asignado: 'pepe', estado: 'corregido', borrado: false })));
await prueba('pepe sube foto', assertSucceeds(uploadBytes(ref(P.storage(), 'obras/o2/archivos/despues.jpg'), png, { contentType: 'image/jpeg' })));
await prueba('pepe no borra fotos', assertFails(deleteObject(ref(P.storage(), 'obras/o2/archivos/despues.jpg'))));

// --- ficha del perfil (nombre, cargo, empresa, foto) ---
const ficha = { nombre: 'Pepe Pérez', correo: 'pepe@obra.do', cargo: 'Pintor', empresa: 'Acabados SRL', foto: 'data:image/jpeg;base64,AAAA' };
await prueba('pepe pone al día su ficha en la obra', assertSucceeds(updateDoc(doc(dP, 'obras/o2'), new FieldPath('personas', 'pepe'), ficha, 'modificada', 9)));
await prueba('pepe no mete datos de más en su ficha', assertFails(updateDoc(doc(dP, 'obras/o2'), new FieldPath('personas', 'pepe'), { ...ficha, telefono: '809' })));
await prueba('pepe no pone una foto enorme', assertFails(updateDoc(doc(dP, 'obras/o2'), new FieldPath('personas', 'pepe'), { ...ficha, foto: 'x'.repeat(40001) })));
await prueba('pepe no cambia la ficha de ana', assertFails(updateDoc(doc(dP, 'obras/o2'), new FieldPath('personas', 'ana'), ficha)));
await prueba('pepe no se cambia el papel con la ficha', assertFails(updateDoc(doc(dP, 'obras/o2'), new FieldPath('personas', 'pepe'), ficha, new FieldPath('miembros', 'pepe'), 'admin')));
await prueba('extraño no se pone ficha en la obra', assertFails(updateDoc(doc(dX, 'obras/o2'), new FieldPath('personas', 'extra'), { nombre: 'X' })));
await prueba('carla pone al día su ficha en el equipo', assertSucceeds(updateDoc(doc(dC, 'equipos/e1'), new FieldPath('personas', 'carla'), { nombre: 'Carla', correo: 'carla@obra.do', cargo: 'Supervisora' }, 'modificada', 9)));
await prueba('carla no toca la ficha de ana en el equipo', assertFails(updateDoc(doc(dC, 'equipos/e1'), new FieldPath('personas', 'ana'), { nombre: 'Y' })));
await prueba('usuario guarda su perfil privado', assertSucceeds(setDoc(doc(dP, 'usuarios/pepe'), { nombre: 'Pepe', telefono: '809', cargo: 'Pintor' }, { merge: true })));
await prueba('nadie lee el perfil privado ajeno', assertFails(getDoc(doc(dA, 'usuarios/pepe'))));

// --- calidad: inspecciones y vaciados (como las visitas) ---
await prueba('ana escribe inspección', assertSucceeds(setDoc(doc(dA, 'obras/o2/inspecciones/i1'), { datos: '{}', version: 1, borrado: false })));
await prueba('ana escribe vaciado', assertSucceeds(setDoc(doc(dA, 'obras/o2/vaciados/h1'), { datos: '{}', version: 1, borrado: false })));
await prueba('pepe (contratista) no lee inspecciones', assertFails(getDoc(doc(dP, 'obras/o2/inspecciones/i1'))));
await prueba('pepe (contratista) no escribe vaciados', assertFails(setDoc(doc(dP, 'obras/o2/vaciados/h2'), { datos: '{}', version: 1, borrado: false })));
await prueba('extraño no lee vaciados', assertFails(getDoc(doc(dX, 'obras/o2/vaciados/h1'))));

// --- seguimiento: programa de avance y minutas ---
await prueba('ana escribe programa', assertSucceeds(setDoc(doc(dA, 'obras/o2/programas/prog-o2'), { datos: '{}', version: 1, borrado: false })));
await prueba('ana escribe minuta', assertSucceeds(setDoc(doc(dA, 'obras/o2/minutas/m1'), { datos: '{}', version: 1, borrado: false })));
await prueba('pepe (contratista) no lee minutas', assertFails(getDoc(doc(dP, 'obras/o2/minutas/m1'))));
await prueba('extraño no lee el programa', assertFails(getDoc(doc(dX, 'obras/o2/programas/prog-o2'))));

// --- control: RFI, órdenes de cambio, recepciones y seguridad ---
for (const c of ['rfis', 'cambios', 'recepciones', 'seguridad']) {
  await prueba(`ana escribe ${c}`, assertSucceeds(setDoc(doc(dA, `obras/o2/${c}/x1`), { datos: '{}', version: 1, borrado: false })));
}
await prueba('pepe (contratista) no lee RFI', assertFails(getDoc(doc(dP, 'obras/o2/rfis/x1'))));
await prueba('pepe (contratista) no escribe seguridad', assertFails(setDoc(doc(dP, 'obras/o2/seguridad/x2'), { datos: '{}', version: 1, borrado: false })));

console.log(`reglas: ${ok} bien, ${mal} mal`);
await env.cleanup();
process.exit(mal ? 1 : 0);
