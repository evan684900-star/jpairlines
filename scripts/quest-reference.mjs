// Affiche les données utiles pour écrire des quêtes : aéroports, lieux, villes, bateaux,
// montgolfières, éoliennes. Usage : node scripts/quest-reference.mjs [x z rayon]
//   avec x z rayon : profil du relief autour d'un point (altitudes sur une grille)
import {
  AIRPORTS, LANDMARKS, CITIES, SHIPS, BALLOONS, WIND_FARMS, VOLCANO, HALF, terrainHeight,
} from '../public/js/world.js';
const r = Math.round;
const [qx, qz, qr] = process.argv.slice(2).map(Number);
if (Number.isFinite(qx)) {
  const R = qr || 3000, step = R / 6;
  console.log(`Relief autour de (${qx}, ${qz}) — altitudes en m (négatif = mer), lignes = z, colonnes = x`);
  console.log('z\\x'.padStart(8) + Array.from({ length: 13 }, (_, i) => String(r(qx - R + i * step)).padStart(7)).join(''));
  for (let j = 0; j <= 12; j++) {
    const z = qz - R + j * step;
    console.log(String(r(z)).padStart(8) + Array.from({ length: 13 }, (_, i) => String(r(terrainHeight(qx - R + i * step, z))).padStart(7)).join(''));
  }
  process.exit(0);
}
console.log(`Carte : de ${-HALF} à ${HALF} m en x et z. Nord = -z, Est = +x. Mer = altitude < 0.`);
console.log('\nAÉROPORTS (id, nom, type, x, z, altitude, orientation de la piste au compas (les deux sens), longueur)');
for (const a of AIRPORTS) console.log(`  ${a.id.padEnd(9)} ${a.name.padEnd(24)} ${a.type.padEnd(13)} x=${r(a.x)} z=${r(a.z)} alt=${a.elev} piste=${String(Math.round(((180 - (a.heading * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}°/${String(Math.round(((360 - (a.heading * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}° L=${a.length}`);
console.log('\nLIEUX (id, nom, type, x, z, altitude du sol)');
for (const l of LANDMARKS) console.log(`  ${l.id.padEnd(12)} ${l.name.padEnd(24)} ${l.type.padEnd(11)} x=${r(l.x)} z=${r(l.z)} sol=${r(terrainHeight(l.x, l.z))}`);
console.log('\nVILLES (nom, x, z, rayon)');
for (const c of CITIES) console.log(`  ${c.name.padEnd(12)} x=${r(c.x)} z=${r(c.z)} rayon=${c.radius}`);
console.log('\nBATEAUX (index, type, centre du cercle x z, rayon, vitesse m/s) — tournent en rond');
SHIPS.forEach((s, i) => console.log(`  ${String(i).padStart(2)} ${s.kind.padEnd(6)} x=${r(s.x)} z=${r(s.z)} rayon=${r(s.radius)} v=${s.speed.toFixed(1)}`));
console.log('\nMONTGOLFIÈRES (index, centre x z, altitude, rayon)');
BALLOONS.forEach((b, i) => console.log(`  ${String(i).padStart(2)} x=${r(b.x)} z=${r(b.z)} alt=${r(b.alt)} rayon=${r(b.radius)}`));
console.log('\nÉOLIENNES (parcs : centre x z, nombre, orientation de la ligne en degrés) — mâts de 80 m + pales 36 m, ~220 m entre éoliennes');
for (const w of WIND_FARMS) console.log(`  x=${r(w.x)} z=${r(w.z)} n=${w.n} orientation=${r((w.heading * 180) / Math.PI)}`);
console.log(`\nVOLCAN : x=${VOLCANO.x} z=${VOLCANO.z} sommet≈${VOLCANO.h} m, rayon de l'île ${VOLCANO.r} m`);
