// Multijoueur par Firebase Realtime Database : chaque pilote écrit sa position dans players/<uid> (de 5 fois par
// seconde près d'un autre joueur à une fois toutes les 5 s à l'arrêt, voir netTick dans main.js) et lit celle des
// autres ; peintures des avions dans liveries/<uid> ; chat dans chat/ ; statistiques de
// fréquentation dans stats/. Un joueur sans compte est un « invité » anonyme. Quand la connexion se coupe, Firebase
// efface tout seul la position du joueur ; les entrées oubliées (onglet tué, plantage) sont ignorées puis nettoyées.
import { firebase, ensureUser } from './firebase.js';
import { cleanChat } from './chatFilter.js';

const STALE = 20000; // ms : une position plus vieille est ignorée…
const PRUNE = 60000; // …et effacée au-delà (par n'importe quel joueur)
const CHAT_GAP = 1500; // ms entre deux messages d'un même joueur (vérifié aussi par les règles de la base)
const CHAT_KEEP = 24 * 3600 * 1000; // les messages de plus d'un jour sont effacés
const day = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ, heure de Paris

export class Net {
  // h : { players(list), livery(id, l), chat(name, text, cls), status(connected) }
  constructor(h) {
    this.h = h;
    this.uid = null;
    this.connected = false;
    this.offset = 0; // décalage horloge locale → horloge du serveur Firebase
    this.lastChat = 0;
    this.liveries = new Map();
    this.state = null;
  }
  get ready() { return this.connected && !!this.uid; }
  now() { return Date.now() + this.offset; }

  async start(name, livery) {
    this.name = name;
    this.livery = livery;
    let fb;
    try { fb = await ensureUser(); } catch (e) { console.warn('Multijoueur indisponible', e); return; }
    const { db, D, auth, A } = fb;
    this.fb = fb;
    this.uid = auth.currentUser.uid;
    D.onValue(D.ref(db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
    // (re)connexion : on se réinscrit (Firebase oublie les « à la déconnexion » quand la connexion tombe)
    D.onValue(D.ref(db, '.info/connected'), (s) => {
      this.connected = !!s.val();
      this.h.status(this.connected);
      if (this.connected) this.join();
    });
    // changement de compte (connexion, déconnexion) : on reprend sous le nouvel identifiant
    A.onAuthStateChanged(auth, (u) => {
      if (!u) { A.signInAnonymously(auth).catch(() => {}); return; }
      if (u.uid !== this.uid) { this.uid = u.uid; this.join(); }
    });

    // autres pilotes
    D.onValue(D.ref(db, 'players'), (snap) => {
      const list = [], now = this.now();
      snap.forEach((c) => {
        const v = c.val();
        if (!v || typeof v.t !== 'number') return;
        if (now - v.t > PRUNE && c.key !== this.uid) { D.remove(c.ref).catch(() => {}); return; }
        if (now - v.t > STALE) return;
        list.push({ id: c.key, name: String(v.n || 'Pilote').slice(0, 16), t: v.t, p: v.p, q: v.q, s: v.s, r: v.r, g: v.g, f: v.f, l: v.l, a: v.a, k: v.k });
      });
      this.h.players(list);
    });
    // peintures (seulement celles qui changent)
    D.onValue(D.ref(db, 'liveries'), (snap) => {
      const seen = new Set();
      snap.forEach((c) => {
        seen.add(c.key);
        const json = JSON.stringify(c.val());
        if (this.liveries.get(c.key) !== json) { this.liveries.set(c.key, json); this.h.livery(c.key, c.val()); }
      });
      for (const k of [...this.liveries.keys()]) if (!seen.has(k)) this.liveries.delete(k);
    });
    // chat : les 30 derniers messages, puis les nouveaux ; chaque texte est filtré à l'affichage
    const since = Date.now();
    D.onChildAdded(D.query(D.ref(db, 'chat'), D.limitToLast(30)), (c) => {
      const m = c.val();
      if (!m || typeof m.x !== 'string') return;
      const text = cleanChat(m.x);
      if (!text) return;
      const old = typeof m.t === 'number' && m.t - this.offset < since - 2000;
      this.h.chat(String(m.n || 'Pilote').slice(0, 16), text, m.u === this.uid ? 'me' : old ? 'old' : '');
    });
    // ménage : messages de plus d'un jour
    D.get(D.query(D.ref(db, 'chat'), D.orderByChild('t'), D.endAt(Date.now() - CHAT_KEEP), D.limitToFirst(50)))
      .then((s) => s.forEach((c) => { D.remove(c.ref).catch(() => {}); })).catch(() => {});
    this.count('visits');
  }

  // inscription : position effacée et peinture retirée automatiquement à la déconnexion
  join() {
    if (!this.fb || !this.uid || !this.connected) return;
    const { db, D } = this.fb;
    const me = D.ref(db, `players/${this.uid}`), lv = D.ref(db, `liveries/${this.uid}`);
    D.onDisconnect(me).remove().catch(() => {});
    D.onDisconnect(lv).remove().catch(() => {});
    if (this.state) this.sendState(this.state);
    if (this.livery) this.sendLivery(this.livery);
  }

  // état de mon avion (appelé 5 fois par seconde)
  sendState(s) {
    this.state = s;
    if (!this.ready) return;
    const { db, D } = this.fb;
    D.set(D.ref(db, `players/${this.uid}`), { ...s, n: String(this.name || 'Pilote').slice(0, 16), t: D.serverTimestamp() }).catch(() => {});
  }
  setName(name) { this.name = name; }
  sendLivery(l) {
    this.livery = l;
    if (!this.ready) return;
    const { db, D } = this.fb;
    D.set(D.ref(db, `liveries/${this.uid}`), JSON.parse(JSON.stringify(l))).catch(() => {});
  }

  // message de chat ; renvoie un message d'information si l'envoi est refusé
  sendChat(raw) {
    if (!this.ready) return 'Chat indisponible : pas de connexion au serveur multijoueur';
    const now = Date.now();
    if (now - this.lastChat < CHAT_GAP) return 'Doucement ! Attends un peu avant de réécrire.';
    const text = cleanChat(raw);
    if (!text) return raw.trim() ? 'Message bloqué : langage interdit.' : '';
    this.lastChat = now;
    const { db, D } = this.fb;
    const key = D.push(D.ref(db, 'chat')).key;
    // message et heure du dernier message envoyés ensemble : les règles de la base vérifient l'écart entre deux messages
    D.update(D.ref(db), {
      [`chat/${key}`]: { u: this.uid, n: String(this.name || 'Pilote').slice(0, 16), x: text, t: D.serverTimestamp() },
      [`lastChat/${this.uid}`]: D.serverTimestamp(),
    }).catch(() => {});
    this.count('chat');
    return '';
  }

  // statistiques de fréquentation (page stats.html) : compteurs du jour
  count(key, quest) {
    if (!this.fb) return;
    const { db, D } = this.fb;
    const inc = (path) => D.runTransaction(D.ref(db, path), (n) => (n || 0) + 1).catch(() => {});
    inc(`stats/days/${day()}/${key}`);
    if (quest) inc(`stats/quests/${quest}`);
  }
  questDone(id) { if (/^[a-z0-9-]{1,60}$/.test(id)) this.count('quests', id); }
}
