// Comptes joueurs : e-mail + mot de passe, ou Google. Sauvegarde de la progression dans le compte.
// Stockage : un fichier JSON (data/accounts.json), suffisant pour quelques milliers de joueurs.
// Sécurité : mots de passe hachés avec scrypt (sel aléatoire), jetons de session aléatoires stockés hachés,
// limitation des tentatives par adresse IP, corps de requête limités, comparaison à temps constant.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// page du jeu où revenir après la connexion Google par redirection
const GAME_URL = (process.env.GAME_URL || 'https://jpairlines.vercel.app/').replace(/#.*$/, '');
const SESSION_DAYS = 60;
const MAX_BODY = 64 * 1024; // une sauvegarde fait quelques Ko
// pages autorisées à appeler l'API depuis un autre domaine (jeu sur Vercel). Vide = toutes : l'API n'utilise pas
// de cookies mais un jeton envoyé explicitement, qu'un autre site ne peut pas lire.
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* premier lancement */ }
db.users ||= {};
db.sessions ||= {};
db.times ||= {}; // classements : { idQuête: { idJoueur: { ms, at } } }

// écriture atomique, regroupée (au plus une toutes les 500 ms)
let saveTimer = null;
function store() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  }, 500);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => Date.now();
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Pilote';
const QUEST_RE = /^[a-z0-9-]{1,60}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// scrypt asynchrone : ne bloque pas le relais multijoueur pendant le calcul
const scrypt = promisify(crypto.scrypt);
async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex');
  return { salt, hash };
}
async function checkPassword(password, user) {
  if (!user.hash) return false;
  const { hash } = await hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { userId, expires: now() + SESSION_DAYS * 86400000 };
  // ménage des sessions expirées
  for (const [k, s] of Object.entries(db.sessions)) if (s.expires < now()) delete db.sessions[k];
  store();
  return token;
}
function userFromRequest(req) {
  const m = /^Bearer ([\w-]{20,100})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const s = db.sessions[sha(m[1])];
  if (!s || s.expires < now()) return null;
  return db.users[s.userId] || null;
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, google: !!u.googleSub, save: u.save || null });

// limitation des tentatives : 10 essais par minute et par IP sur la connexion / l'inscription
const attempts = new Map();
function limited(ip) {
  const t = now();
  const a = (attempts.get(ip) || []).filter((x) => t - x < 60000);
  a.push(t);
  attempts.set(ip, a);
  if (attempts.size > 5000) attempts.clear();
  return a.length > 10;
}

// vérification du jeton Google (signature contrôlée par Google, puis destinataire et e-mail vérifiés ici)
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID || typeof credential !== 'string' || credential.length > 4096) return null;
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) return null;
  const p = await r.json();
  const issOk = p.iss === 'accounts.google.com' || p.iss === 'https://accounts.google.com';
  if (p.aud !== GOOGLE_CLIENT_ID || !issOk || Number(p.exp) * 1000 < now() || String(p.email_verified) !== 'true') return null;
  return { sub: String(p.sub), email: String(p.email).toLowerCase(), name: p.given_name || p.name || '' };
}

// compte lié à une identité Google (même adresse vérifiée par Google : on relie le compte existant)
function googleUser(g, name, save) {
  let user = Object.values(db.users).find((u) => u.googleSub === g.sub) || Object.values(db.users).find((u) => u.email === g.email);
  if (!user) {
    const id = crypto.randomUUID();
    user = db.users[id] = { id, email: g.email, name: cleanName(name || g.name), created: now(), save: cleanSave(save) };
  }
  user.googleSub = g.sub;
  store();
  return user;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('trop gros')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        // formulaire envoyé par Google (redirection) ou JSON envoyé par le jeu
        if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) resolve(Object.fromEntries(new URLSearchParams(text)));
        else resolve(JSON.parse(text || '{}'));
      } catch { reject(new Error('json')); }
    });
    req.on('error', reject);
  });
}

function send(res, code, obj, headers) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}

function cors(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (ORIGINS.length && !ORIGINS.includes(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin, Vary: 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  };
}

// une sauvegarde de jeu : objet JSON raisonnable (vérifié côté serveur, sans faire confiance au client pour la taille)
function cleanSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const json = JSON.stringify(s);
  if (json.length > 48 * 1024) return null;
  return JSON.parse(json);
}

// Routes /api/… ; renvoie true si la requête a été traitée
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const h = cors(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, h); res.end(); return true; }
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';
  try {
    const route = `${req.method} ${url.pathname}`;
    if (route === 'GET /api/config') return send(res, 200, { google: GOOGLE_CLIENT_ID || null }, h), true;

    if (route === 'POST /api/register') {
      if (limited(ip)) return send(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' }, h), true;
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Adresse e-mail invalide.' }, h), true;
      if (password.length < 8 || password.length > 200) return send(res, 400, { error: 'Le mot de passe doit faire au moins 8 caractères.' }, h), true;
      if (Object.values(db.users).some((u) => u.email === email)) return send(res, 409, { error: 'Un compte existe déjà avec cette adresse.' }, h), true;
      const id = crypto.randomUUID();
      db.users[id] = { id, email, name: cleanName(b.name), ...(await hashPassword(password)), created: now(), save: cleanSave(b.save) };
      store();
      return send(res, 200, { token: newSession(id), user: publicUser(db.users[id]) }, h), true;
    }

    if (route === 'POST /api/login') {
      if (limited(ip)) return send(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' }, h), true;
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const user = Object.values(db.users).find((u) => u.email === email);
      if (!user || !(await checkPassword(String(b.password || ''), user))) {
        const msg = user && !user.hash ? 'Ce compte utilise la connexion Google.' : 'E-mail ou mot de passe incorrect.';
        return send(res, 401, { error: msg }, h), true;
      }
      return send(res, 200, { token: newSession(user.id), user: publicUser(user) }, h), true;
    }

    if (route === 'POST /api/google') {
      if (limited(ip)) return send(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' }, h), true;
      if (!GOOGLE_CLIENT_ID) return send(res, 501, { error: 'Connexion Google non configurée sur le serveur.' }, h), true;
      const b = await readBody(req);
      const g = await verifyGoogle(b.credential);
      if (!g) return send(res, 401, { error: 'Connexion Google refusée.' }, h), true;
      const user = googleUser(g, b.name, b.save);
      return send(res, 200, { token: newSession(user.id), user: publicUser(user) }, h), true;
    }

    // connexion Google par redirection (sans fenêtre surgissante) : Google renvoie ici un formulaire,
    // puis on retourne au jeu avec le jeton dans l'ancre de l'adresse (jamais envoyée à un serveur)
    if (route === 'POST /api/google-redirect') {
      const back = (frag) => { res.writeHead(303, { Location: `${GAME_URL}#${frag}`, 'Cache-Control': 'no-store' }); res.end(); };
      if (limited(ip)) return back('jp-error=trop-de-tentatives'), true;
      if (!GOOGLE_CLIENT_ID) return back('jp-error=google-non-configure'), true;
      const b = await readBody(req);
      const g = await verifyGoogle(b.credential);
      if (!g) return back('jp-error=google-refuse'), true;
      const user = googleUser(g);
      return back(`jp-token=${newSession(user.id)}`), true;
    }

    // classement d'une mission chronométrée (lecture libre ; « me » si connecté)
    if (route === 'GET /api/times') {
      const quest = url.searchParams.get('quest') || '';
      if (!QUEST_RE.test(quest)) return send(res, 400, { error: 'Quête inconnue.' }, h), true;
      const all = Object.entries(db.times[quest] || {}).filter(([id]) => db.users[id]).sort((a, b) => a[1].ms - b[1].ms);
      const top = all.slice(0, 10).map(([id, t]) => ({ name: db.users[id].name, ms: t.ms }));
      const me = userFromRequest(req);
      const i = me ? all.findIndex(([id]) => id === me.id) : -1;
      return send(res, 200, { top, total: all.length, me: i >= 0 ? { rank: i + 1, ms: all[i][1].ms } : null }, h), true;
    }

    const user = userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' }, h), true;

    if (route === 'POST /api/times') {
      const b = await readBody(req);
      const quest = String(b.quest || ''), ms = Math.round(Number(b.ms));
      if (!QUEST_RE.test(quest)) return send(res, 400, { error: 'Quête inconnue.' }, h), true;
      // un temps plausible : entre 20 s et 2 h
      if (!Number.isFinite(ms) || ms < 20000 || ms > 7200000) return send(res, 400, { error: 'Temps invalide.' }, h), true;
      if (now() - (user.lastTime || 0) < 5000) return send(res, 429, { error: 'Doucement !' }, h), true;
      user.lastTime = now();
      if (!db.times[quest] && Object.keys(db.times).length >= 300) return send(res, 400, { error: 'Quête inconnue.' }, h), true;
      const board = (db.times[quest] ||= {});
      const prev = board[user.id];
      const best = !prev || ms < prev.ms;
      if (best) board[user.id] = { ms, at: now() };
      store();
      const all = Object.values(board).sort((a, c) => a.ms - c.ms);
      return send(res, 200, { best, ms: board[user.id].ms, rank: all.indexOf(board[user.id]) + 1, total: all.length }, h), true;
    }

    if (route === 'GET /api/me') return send(res, 200, { user: publicUser(user) }, h), true;
    if (route === 'PUT /api/save') {
      const b = await readBody(req);
      const s = cleanSave(b.save);
      if (!s) return send(res, 400, { error: 'Sauvegarde invalide.' }, h), true;
      user.save = s;
      if (b.name) user.name = cleanName(b.name);
      user.updated = now();
      store();
      return send(res, 200, { ok: true }, h), true;
    }
    if (route === 'POST /api/logout') {
      const m = /^Bearer ([\w-]+)$/.exec(req.headers.authorization || '');
      if (m) delete db.sessions[sha(m[1])];
      store();
      return send(res, 200, { ok: true }, h), true;
    }
    send(res, 404, { error: 'Introuvable' }, h);
  } catch (e) {
    send(res, e.message === 'trop gros' ? 413 : 400, { error: 'Requête invalide.' }, h);
  }
  return true;
}
