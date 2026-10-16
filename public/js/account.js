// Compte joueur (côté jeu) : connexion par e-mail + mot de passe ou Google, et sauvegarde de la progression
// sur le serveur Node (accounts.js). Sans compte, tout reste dans le navigateur comme avant.
import { MULTIPLAYER_URL, ACCOUNT_URL } from './config.js';

const TOKEN_KEY = 'jpairlines-token';

// adresse de l'API : même serveur que le multijoueur (wss://hôte/ws → https://hôte)
function apiBase() {
  if (ACCOUNT_URL) return ACCOUNT_URL.replace(/\/$/, '');
  if (MULTIPLAYER_URL) return MULTIPLAYER_URL.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
  return location.protocol.startsWith('http') ? location.origin : '';
}

export class Account {
  constructor() {
    this.base = apiBase();
    this.token = null;
    try { this.token = localStorage.getItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
    this.user = null;
    this.pushTimer = null;
    this.onChange = () => {};
  }

  get loggedIn() { return !!this.user; }

  async api(path, { method = 'GET', body } = {}) {
    let r;
    try {
      r = await fetch(`${this.base}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Serveur injoignable. Réessaie plus tard (tu peux jouer sans compte).');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && this.token && path !== 'login') this.forget();
      throw new Error(data.error || `Erreur ${r.status}`);
    }
    return data;
  }

  setSession({ token, user }) {
    this.token = token;
    this.user = user;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* stockage indisponible */ }
    this.onChange(user);
    return user;
  }
  forget() {
    this.token = null;
    this.user = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
    this.onChange(null);
  }

  // jeton reçu au retour de Google (redirection)
  useToken(token) {
    this.token = token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* stockage indisponible */ }
  }

  // reprise de la session enregistrée (au chargement)
  async restore() {
    if (!this.token) return null;
    try {
      const { user } = await this.api('me');
      this.user = user;
      this.onChange(user);
      return user;
    } catch { return null; }
  }

  async config() {
    try { return await this.api('config'); } catch { return {}; }
  }
  register(email, password, name, save) { return this.api('register', { method: 'POST', body: { email, password, name, save } }).then((d) => this.setSession(d)); }
  login(email, password) { return this.api('login', { method: 'POST', body: { email, password } }).then((d) => this.setSession(d)); }
  google(credential, name, save) { return this.api('google', { method: 'POST', body: { credential, name, save } }).then((d) => this.setSession(d)); }
  async logout() {
    await this.flush();
    try { await this.api('logout', { method: 'POST' }); } catch { /* déjà déconnecté */ }
    this.forget();
  }

  // classements des missions chronométrées
  submitTime(quest, ms) { return this.api('times', { method: 'POST', body: { quest, ms } }); }
  times(quest) { return this.api(`times?quest=${encodeURIComponent(quest)}`); }

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
    try { await this.api('save', { method: 'PUT', body: { save, name: save.name } }); } catch { /* réessayé à la prochaine sauvegarde */ }
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
    money: Math.max(remote.money || 0, local.money || 0),
    xp: Math.max(remote.xp || 0, local.xp || 0),
  };
}

// bouton officiel « Continuer avec Google » (script Google chargé seulement si le serveur est configuré).
// Mode redirection : la page part chez Google puis revient connectée, sans fenêtre surgissante
// (souvent bloquée par les navigateurs). Le retour est lu par takeRedirectToken().
export function mountGoogleButton(el, clientId, base) {
  if (!clientId) return false;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => {
    window.google.accounts.id.initialize({ client_id: clientId, ux_mode: 'redirect', login_uri: `${base}/api/google-redirect` });
    window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fr', width: 300 });
  };
  document.head.appendChild(s);
  return true;
}

// retour de Google : #jp-token=… (connecté) ou #jp-error=… ; l'ancre est aussitôt effacée de l'adresse
export function takeRedirectToken() {
  const m = /[#&]jp-(token|error)=([^&]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return m[1] === 'token' ? { token: decodeURIComponent(m[2]) } : { error: decodeURIComponent(m[2]) };
}
