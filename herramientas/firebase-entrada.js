/* Lo que la app usa del SDK de Firebase. Ver vendor/firebase/LEEME.txt. */
export { initializeApp } from 'firebase/app';
export {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, signOut, deleteUser, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, reauthenticateWithPopup,
  reauthenticateWithCredential, EmailAuthProvider
} from 'firebase/auth';
export {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, serverTimestamp, Timestamp, FieldPath, writeBatch,
  arrayUnion, arrayRemove, deleteField
} from 'firebase/firestore';
export {
  getStorage, connectStorageEmulator, ref, uploadBytes, getBlob, deleteObject, listAll
} from 'firebase/storage';
