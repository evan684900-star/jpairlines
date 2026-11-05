// Firebase, chargé à la demande depuis les serveurs de Google (gstatic.com) : le jeu démarre sans attendre, et
// reste jouable hors ligne si Firebase est injoignable.
import { FIREBASE } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2';
let job = null;

// { auth, db, A (fonctions d'authentification), D (fonctions de la base) }
export function firebase() {
  job ??= (async () => {
    const [{ initializeApp }, A, D] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`),
    ]);
    const app = initializeApp(FIREBASE);
    const auth = A.getAuth(app);
    const db = D.getDatabase(app);
    return { app, auth, db, A, D };
  })();
  return job;
}

// premier état connu de la connexion (utilisateur ou null), une fois Firebase prêt
export async function authReady() {
  const fb = await firebase();
  await fb.auth.authStateReady();
  return fb;
}

// joueur identifié (compte ou invité anonyme) : le multijoueur et le chat en ont besoin
export async function ensureUser() {
  const fb = await authReady();
  if (!fb.auth.currentUser) await fb.A.signInAnonymously(fb.auth);
  return fb;
}
