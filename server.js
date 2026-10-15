// Serveur JP Airlines : sert le jeu et relaie les positions des joueurs.
// Léger : un seul processus, aucune base de données, ~quelques Ko/s par joueur.
// Peut aussi tourner seul (jeu hébergé sur Vercel) : il suffit d'indiquer
// son adresse dans public/js/config.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

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

const server = http.createServer((req, res) => {
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
let nextId = 1;

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);
const isVec = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'Serveur plein');
  const id = nextId++;
  const player = { id, name: 'Pilote', p: null, q: null, s: 0, r: 0, g: 1, f: 0, l: 0, a: 0 };
  players.set(id, player);
  ws.send(JSON.stringify({ t: 'welcome', id }));

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
    }
  });
  ws.on('close', () => players.delete(id));
  ws.on('error', () => players.delete(id));
});

// diffusion à 10 Hz
setInterval(() => {
  if (!wss.clients.size) return;
  const data = JSON.stringify({ t: 'players', list: [...players.values()] });
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}, 100);

server.listen(PORT, () => console.log(`JP Airlines sur http://localhost:${PORT}`));
