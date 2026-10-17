// Statistiques de fréquentation du serveur : chiffres globaux par jour (aucune donnée personnelle).
// Enregistrées dans data/stats.json (60 derniers jours), consultables sur /stats.html.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), 'data');
const FILE = path.join(DATA_DIR, 'stats.json');
const QUEST_RE = /^[a-z0-9-]{1,60}$/;
// jour en heure de Paris (AAAA-MM-JJ)
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export class Stats {
  constructor(getOnline = () => 0) {
    this.data = { days: [], quests: {} };
    try { Object.assign(this.data, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* premier lancement */ }
    this.getOnline = getOnline;
    this.started = Date.now();
    // chaque minute : minutes de jeu cumulées (nombre de joueurs connectés) et sauvegarde
    setInterval(() => {
      const d = this.day();
      d.minutes += this.online ?? 0;
      this.save();
    }, 60000).unref();
  }

  day() {
    const id = today();
    let d = this.data.days[this.data.days.length - 1];
    if (!d || d.day !== id) {
      d = { day: id, visits: 0, peak: 0, minutes: 0, quests: 0, chat: 0 };
      this.data.days.push(d);
      if (this.data.days.length > 60) this.data.days.shift();
    }
    return d;
  }
  join(online) {
    const d = this.day();
    d.visits++;
    this.setOnline(online);
  }
  setOnline(n) {
    this.online = n;
    const d = this.day();
    d.peak = Math.max(d.peak, n);
  }
  quest(id) {
    if (!QUEST_RE.test(id)) return;
    this.day().quests++;
    const q = this.data.quests;
    if (q[id] === undefined && Object.keys(q).length >= 300) return;
    q[id] = (q[id] || 0) + 1;
  }
  chat() { this.day().chat++; }

  save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(this.data));
      fs.renameSync(`${FILE}.tmp`, FILE);
    } catch { /* disque indisponible : on réessaiera */ }
  }

  summary(online, accounts) {
    this.setOnline(online);
    const days = this.data.days.slice(-30);
    const sum = (k) => days.reduce((n, d) => n + d[k], 0);
    return {
      online, accounts, uptimeH: Math.round((Date.now() - this.started) / 360000) / 10,
      today: this.day(),
      last30: { visits: sum('visits'), minutes: sum('minutes'), quests: sum('quests'), chat: sum('chat'), peak: Math.max(0, ...days.map((d) => d.peak)) },
      days,
      topQuests: Object.entries(this.data.quests).sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }
}
