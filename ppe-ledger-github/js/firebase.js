// ============================================================================
// Firebase wiring: app init, Auth helpers, and a Firestore adapter that
// mimics the small document-store API the app logic (js/app.js) is written
// against — collection(x).doc(y).set()/.update()/.delete()/.onSnapshot(),
// collection(x).add(), collection(x).onSnapshot(). Keeping that shape means
// app.js doesn't need to know it's talking to Firestore specifically.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  collection as fsCollection, doc as fsDoc,
  onSnapshot as fsOnSnapshot,
  setDoc, updateDoc, deleteDoc, addDoc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const firestore = getFirestore(app);

// ---- Auth helpers ----
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
export async function signInEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}
export async function signOutUser() {
  await signOut(auth);
}

// ---- Firestore adapter (mirrors the tiny API app.js expects) ----
function wrapDocSnapshot(snap) {
  return { id: snap.id, exists: typeof snap.exists === "function" ? snap.exists() : !!snap.exists, data: () => snap.data() };
}
function wrapDocRef(ref) {
  return {
    id: ref.id,
    path: ref.path,
    get: async () => wrapDocSnapshot(await getDoc(ref)),
    set: (data) => setDoc(ref, data),
    update: (data) => updateDoc(ref, data),
    delete: () => deleteDoc(ref),
    onSnapshot: (next, err) => fsOnSnapshot(ref, (snap) => next(wrapDocSnapshot(snap)), err),
  };
}
function wrapCollectionRef(ref) {
  return {
    path: ref.path,
    doc: (id) => wrapDocRef(id ? fsDoc(ref, id) : fsDoc(ref)),
    add: async (data) => wrapDocRef(await addDoc(ref, data)),
    onSnapshot: (next, err) =>
      fsOnSnapshot(
        ref,
        (snap) => next({ docs: snap.docs.map((d) => wrapDocSnapshot(d)) }),
        err
      ),
  };
}
export const db = {
  collection: (path) => wrapCollectionRef(fsCollection(firestore, path)),
  doc: (path) => wrapDocRef(fsDoc(firestore, path)),
};

// ---- Plain browser download (replaces the Claude "downloads" capability) ----
export function browserDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
