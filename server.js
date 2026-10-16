// Serveur JP Airlines : sert le jeu et relaie les positions des joueurs.
// Léger : un seul processus, aucune base de données, ~quelques Ko/s par joueur.
// Peut aussi tourner seul (jeu hébergé sur Vercel) : il suffit d'indiquer
// son adresse dans public/js/config.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { handleApi } from './accounts.js';
import { cleanChat } from './chat.js';
import { cleanLivery } from './public/js/livery.js';

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 100;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const THREE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/three');
const THREE_FILE = path.join(THREE_DIR, 'build/three.module.js');
const ADDONS = path.join(THREE_DIR, 'examples/jsm');

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return; // comptes joueurs (/api/…)
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  // three.js est servi directement depuis node_modules (en local, sans build)
  if (url.pathname === '/vendor/three.module.js') return sendFile(THREE_FILE, res);
  if (url.pathname.startsWith('/vendor/addons/')) {
    const f = path.normalize(path.join(ADDONS, decodeURIComponent(url.pathname.slice('/vendor/addons/'.length))));
    if (!f.startsWith(ADDONS + path.sep)) { res.writeHead(403); return res.end(); }
    return sendFile(f, res);
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  sendFile(file, res);
});

function sendFile(file, res) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const players = new Map();
const chatHistory = []; // derniers messages, envoyés aux nouveaux arrivants
let nextId = 1;

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Serveur plein');
  const id = nextId++;
  const player = { id, name: 'Pilote', p: null, q: null, s: 0, r: 0, g: 1, f: 0, l: 0, a: 0 };
  players.set(id, player);
  const liveries = Object.fromEntries([...players.values()].filter((p) => p.livery).map((p) => [p.id, p.livery]));
  ws.send(JSON.stringify({ t: 'welcome', id, chat: chatHistory, liveries }));
  const sent = []; // horodatage des derniers messages (anti-spam)
  const recentText = []; // derniers messages du joueur (mot envoyé lettre par lettre)

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello' && typeof msg.name === 'string') {
      player.name = msg.name.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16) || 'Pilote';
    } else if (msg.t === 'state' && isVec(msg.p, 3) && isVec(msg.q, 4)) {
      player.p = msg.p;
      player.q = msg.q;
      // état visible par les autres : vitesse, régime, train, volets, feux, type d'avion
      for (const k of ['s', 'r', 'g', 'f', 'l']) player[k] = num(msg[k], 0, 1000);
      player.a = Math.round(num(msg.a, 0, 31));
    } else if (msg.t === 'livery') {
      // peinture de l'avion (hangar), vérifiée puis relayée à tous
      const now = Date.now();
      if (now - (player.liveryAt || 0) < 500) return;
      player.liveryAt = now;
      player.livery = cleanLivery(msg.l);
      const data = JSON.stringify({ t: 'livery', id, l: player.livery });
      for (const c of wss.clients) if (c.readyState === 1) c.send(data);
    } else if (msg.t === 'chat') {
      const now = Date.now();
      while (sent.length && now - sent[0] > 10000) sent.shift();
      if (sent.length >= 5 || (sent.length && now - sent[sent.length - 1] < 1000)) {
        ws.send(JSON.stringify({ t: 'chat-info', text: 'Doucement ! Attends un peu avant de réécrire.' }));
        return;
      }
      const text = cleanChat(msg.text, recentText);
      if (!text) {
        if (typeof msg.text === 'string' && msg.text.trim()) ws.send(JSON.stringify({ t: 'chat-info', text: 'Message bloqué : langage interdit.' }));
        return;
      }
      sent.push(now);
      recentText.push(text);
      if (recentText.length > 5) recentText.shift();
      const line = { id, name: player.name, text, ts: now };
      chatHistory.push(line);
      if (chatHistory.length > 30) chatHistory.shift();
      const data = JSON.stringify({ t: 'chat', ...line });
      for (const c of wss.clients) if (c.readyState === 1) c.send(data);
    }
  });
  ws.on('close', () => players.delete(id));
  ws.on('error', () => players.delete(id));
});

// diffusion à 10 Hz
setInterval(() => {
  if (!wss.clients.size) return;
  const data = JSON.stringify({ t: 'players', list: [...players.values()].map(({ livery, liveryAt, ...p }) => p) });
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}, 100);

server.listen(PORT, () => console.log(`JP Airlines sur http://localhost:${PORT}`));
