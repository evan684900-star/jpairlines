// Intégration du SDK Poki : chargement, phases de jeu, pubs entre deux parties et pubs récompensées.
// Si le SDK n'est pas disponible (test en local, bloqueur de pubs), le jeu fonctionne normalement sans pub.
const SDK_URL = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

let sdk = null; // window.PokiSDK une fois initialisé
let playing = false;
let onAdStart = () => {}, onAdEnd = () => {};

function load() {
  return new Promise((resolve) => {
    if (window.PokiSDK) return resolve(window.PokiSDK);
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve(window.PokiSDK || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.PokiSDK || null), 6000); // réseau lent : on n'attend pas indéfiniment
  });
}

export const Poki = {
  // hooks : { adStart: couper le son et mettre en pause, adEnd: reprendre }
  async init(hooks = {}) {
    onAdStart = hooks.adStart || onAdStart;
    onAdEnd = hooks.adEnd || onAdEnd;
    if (/[?&]nopoki\b/.test(location.search)) return false;
    const P = await load();
    if (!P) return false;
    try { await P.init(); sdk = P; } catch { sdk = P; /* bloqueur de pubs : le SDK reste utilisable sans pub */ }
    try { if (/[?&]pokidebug\b/.test(location.search)) sdk.setDebug(true); } catch { /* option absente */ }
    return true;
  },
  get available() { return !!sdk; },
  loadingFinished() { try { sdk?.gameLoadingFinished(); } catch { /* sans effet */ } },
  gameplayStart() { if (playing) return; playing = true; try { sdk?.gameplayStart(); } catch { /* sans effet */ } },
  gameplayStop() { if (!playing) return; playing = false; try { sdk?.gameplayStop(); } catch { /* sans effet */ } },

  // pub entre deux parties (Poki décide s'il en montre une) ; le jeu est en pause et muet pendant la pub
  async commercialBreak() {
    if (!sdk) return;
    const was = playing;
    this.gameplayStop();
    try { await sdk.commercialBreak(() => onAdStart()); } catch { /* pas de pub */ }
    onAdEnd();
    if (was) this.gameplayStart();
  },

  // pub récompensée, toujours proposée au joueur (jamais imposée) : true si elle a été regardée jusqu'au bout
  async rewardedBreak() {
    if (!sdk) return false;
    const was = playing;
    this.gameplayStop();
    let ok = false;
    try { ok = !!(await sdk.rewardedBreak(() => onAdStart())); } catch { ok = false; }
    onAdEnd();
    if (was) this.gameplayStart();
    return ok;
  },
};
