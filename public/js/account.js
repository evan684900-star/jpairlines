// Compte joueur (côté jeu) : connexion par e-mail + mot de passe ou Google (Firebase Authentication), sauvegarde de
// la progression et classements des missions chronométrées (Firebase Realtime Database). Sans compte, tout reste dans
// le navigateur comme avant (le joueur est alors un « invité » anonyme, pour le multijoueur et le chat).
import { firebase, authReady } from './firebase.js';
import { t } from './i18n.js';

// messages d'erreur de Firebase → phrases du jeu (déjà traduites)
const ERRORS = {
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-email': 'Adresse e-mail invalide.',
  'auth/weak-password': 'Le mot de passe doit faire au moins 8 caractères.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse.',
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
  'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
  'auth/user-not-found': 'E-mail ou mot de passe incorrect.',
  'auth/too-many-requests': 'Trop de tentatives, réessaie dans une minute.',
  'auth/popup-closed-by-user': 'Connexion Google refusée.',
  'auth/cancelled-popup-request': 'Connexion Google refusée.',
  'auth/network-request-failed': 'Serveur injoignable. Réessaie plus tard (tu peux jouer sans compte).',
};
const fail = (e) => new Error(t(ERRORS[e?.code] || (e?.code?.startsWith?.('auth/') ? 'Connexion impossible.' : 'Serveur injoignable. Réessaie plus tard (tu peux jouer sans compte).')));
const cleanName = (n) => String(n || '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 16) || 'Pilote';

// Ancien serveur de comptes (VPS) : sert seulement à récupérer la progression d'un ancien compte (même e-mail et même
// mot de passe). Injoignable (école, serveur arrêté) : on continue sans, après 6 s au plus.
const LEGACY = globalThis.JP_LEGACY_URL || 'https://217-160-131-60.sslip.io:8443'; // (JP_LEGACY_URL : tests)
async function legacyLogin(email, password) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${LEGACY}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: ctrl.signal,
    });
    if (!r.ok) return { refused: true }; // identifiants inconnus de l'ancien serveur
    const d = await r.json();
    return d?.user ? { name: d.user.name, save: d.user.save || null } : { refused: true };
  } catch { return { unreachable: true }; } finally { clearTimeout(timer); }
}

export class Account {
  constructor() {
    this.user = null; // { uid, name, email, google, save }
    this.pushTimer = null;
    this.onChange = () => {};
    this.onLegacySave = () => {}; // progression d'un ancien compte récupérée sans pouvoir créer le compte Firebase
  }

  get loggedIn() { return !!this.user; }

  // données du compte enregistrées dans la base (nom et sauvegarde)
  async load(fu) {
    const { db, D } = await firebase();
    const snap = await D.get(D.ref(db, `users/${fu.uid}`));
    const data = snap.val() || {};
    this.user = {
      uid: fu.uid, name: data.name || fu.displayName || (fu.email || '').split('@')[0] || 'Pilote', email: fu.email || '',
      google: fu.providerData.some((p) => p.providerId === 'google.com'), save: data.save || null,
    };
    this.onChange(this.user);
    return this.user;
  }

  // reprise de la session enregistrée (au chargement), y compris le retour d'une connexion Google par redirection
  async restore() {
    try {
      const fb = await authReady();
      const back = await fb.A.getRedirectResult(fb.auth).catch(() => null);
      const fu = fb.auth.currentUser;
      if (!fu || fu.isAnonymous) return null;
      const user = await this.load(fu);
      user.fromRedirect = !!back;
      return user;
    } catch { return null; }
  }

  async register(email, password, name, save) {
    if (password.length < 8) throw new Error(t('Le mot de passe doit faire au moins 8 caractères.'));
    try {
      const { auth, db, A, D } = await firebase();
      const { user: fu } = await A.createUserWithEmailAndPassword(auth, email, password);
      // ancien compte du VPS avec les mêmes identifiants : sa progression est fusionnée dans le nouveau compte
      const found = await legacyLogin(email, password);
      const old = found?.save ? found : null;
      const merged = old?.save ? mergeSaves(save || {}, old.save) : save || {};
      await D.set(D.ref(db, `users/${fu.uid}`), { name: cleanName(old?.name || name), save: JSON.parse(JSON.stringify(merged)), updated: D.serverTimestamp() });
      const user = await this.load(fu);
      user.imported = !!old?.save;
      return user;
    } catch (e) { throw fail(e); }
  }
  async login(email, password) {
    let first;
    try {
      const { auth, A } = await firebase();
      const { user: fu } = await A.signInWithEmailAndPassword(auth, email, password);
      return this.load(fu);
    } catch (e) { first = e; }
    // pas encore de compte Firebase : peut-être un compte de l'ancien serveur → il est recréé ici avec sa progression
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(first?.code) && password.length >= 8) {
      const old = await legacyLogin(email, password);
      if (old.unreachable) throw new Error(t('E-mail ou mot de passe incorrect. (Pour récupérer un compte de l\'ancien serveur, connecte-toi depuis chez toi : l\'ancien serveur est injoignable d\'ici.)'));
      if (!old.refused) {
        try {
          const { auth, db, A, D } = await firebase();
          const { user: fu } = await A.createUserWithEmailAndPassword(auth, email, password);
          await D.set(D.ref(db, `users/${fu.uid}`), { name: cleanName(old.name), save: JSON.parse(JSON.stringify(old.save || {})), updated: D.serverTimestamp() });
          const user = await this.load(fu);
          user.imported = true;
          return user;
        } catch (e) {
          // un compte Firebase existe déjà avec cette adresse (Google ou autre mot de passe) : la progression de
          // l'ancien serveur est gardée sur cet appareil, et fusionnée à la prochaine connexion
          if (e?.code === 'auth/email-already-in-use') {
            if (old.save) this.onLegacySave(old.save);
            throw new Error(t('Progression de l\'ancien serveur récupérée sur cet appareil ✔. Un compte existe déjà avec cette adresse : connecte-toi avec « Continuer avec Google » ou ton nouveau mot de passe pour l\'y ajouter.'));
          }
          throw fail(e);
        }
      }
    }
    throw fail(first);
  }
  // Google : fenêtre de connexion ; si le navigateur la bloque, la page part chez Google puis revient (restore)
  async google(name) {
    try {
      const { auth, db, A, D } = await firebase();
      const provider = new A.GoogleAuthProvider();
      let fu;
      try { ({ user: fu } = await A.signInWithPopup(auth, provider)); } catch (e) {
        if (e?.code === 'auth/popup-blocked') { await A.signInWithRedirect(auth, provider); return null; }
        throw e;
      }
      // premier passage : on crée la fiche du joueur
      const ref = D.ref(db, `users/${fu.uid}/name`);
      if (!(await D.get(ref)).exists()) await D.set(ref, cleanName(name || fu.displayName));
      return this.load(fu);
    } catch (e) { throw fail(e); }
  }
  async logout() {
    await this.flush();
    try { const { auth, A } = await firebase(); await A.signOut(auth); } catch { /* déjà déconnecté */ }
    this.user = null;
    this.onChange(null);
  }

  // ----- classements des missions chronométrées -----
  // tous les temps d'une quête, du meilleur au moins bon (quelques dizaines de joueurs : on lit tout)
  async board(quest) {
    const { db, D } = await firebase();
    const snap = await D.get(D.query(D.ref(db, `times/${quest}`), D.orderByChild('ms')));
    const all = [];
    snap.forEach((c) => { all.push({ uid: c.key, ...c.val() }); });
    return all;
  }
  async submitTime(quest, ms) {
    const { db, D } = await firebase();
    const ref = D.ref(db, `times/${quest}/${this.user.uid}`);
    const prev = (await D.get(ref)).val();
    const best = !prev || ms < prev.ms;
    if (best) await D.set(ref, { name: this.user.name, ms, at: D.serverTimestamp() });
    const all = await this.board(quest);
    const i = all.findIndex((x) => x.uid === this.user.uid);
    return { best, ms: best ? ms : prev.ms, rank: i + 1, total: all.length };
  }
  async times(quest) {
    const all = await this.board(quest);
    const i = this.user ? all.findIndex((x) => x.uid === this.user.uid) : -1;
    return { top: all.slice(0, 10).map((x) => ({ name: x.name, ms: x.ms })), total: all.length, me: i >= 0 ? { rank: i + 1, ms: all[i].ms } : null };
  }

  // envoi de la sauvegarde (regroupé : au plus une fois toutes les 4 s)
  pushSave(save) {
    if (!this.user) return;
    this.pending = save;
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => this.flush(), 4000);
  }
  async flush() {
    clearTimeout(this.pushTimer);
    this.pushTimer = null;
    if (!this.user || !this.pending) return;
    const save = this.pending;
    this.pending = null;
    try {
      const { db, D } = await firebase();
      if (save.name) this.user.name = cleanName(save.name);
      // JSON aller-retour : la base refuse les valeurs undefined
      await D.set(D.ref(db, `users/${this.user.uid}`), { name: this.user.name, save: JSON.parse(JSON.stringify(save)), updated: D.serverTimestamp() });
    } catch { /* réessayé à la prochaine sauvegarde */ }
  }
}

// Fusion d'une sauvegarde locale et de celle du compte : on ne perd jamais une quête réussie ni un aéroport découvert
export function mergeSaves(local, remote) {
  if (!remote) return local;
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  return {
    ...local,
    ...remote,
    completed: union(remote.completed, local.completed),
    visited: union(remote.visited, local.visited),
    owned: union(remote.owned, local.owned), // achats du hangar
    liveries: { ...(local.liveries || {}), ...(remote.liveries || {}) },
    fuel: { ...(remote.fuel || {}), ...(local.fuel || {}) }, // carburant laissé dans chaque avion (cet appareil d'abord)
    money: Math.max(remote.money || 0, local.money || 0),
    xp: Math.max(remote.xp || 0, local.xp || 0),
  };
}
