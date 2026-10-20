/* Pruebas de las reglas de seguridad (firestore.rules y storage.rules)
   contra los emuladores de Firebase. Ver pruebas/LEEME.md. */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, FieldPath, deleteField, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
const R = new URL('../', import.meta.url).pathname;
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
console.log(`reglas: ${ok} bien, ${mal} mal`);
await env.cleanup();
process.exit(mal ? 1 : 0);
