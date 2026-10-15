// Maisons réalistes générées par le code : plusieurs types (pavillon, maison à étage, longère, maison en L,
// grange, villa à toit en croupe), construits face par face avec des coordonnées de texture en mètres.
// Façades en crépi avec soubassement sali, fenêtres encadrées, volets, porte ; toits en tuiles (canal ou ardoise)
// avec relief, débords et cheminées. Instanciées par type : deux appels de dessin par type et par morceau de décor.
import * as THREE from 'three';
import { TEX } from './textures.js';
import { injectShared } from './shared.js';

// ---------- construction de la géométrie ----------
class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.fac = []; this.idx = []; }
  // face plane : p0→p1 = sens « u » (largeur), p0→p3 = sens « v » (hauteur) ; facade = [type, longueur du mur]
  quad(p0, p1, p2, p3, facade = [0, 0], uOff = 0) {
    const b = this.pos.length / 3;
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p3, p0)).normalize();
    const eu = new THREE.Vector3().subVectors(p1, p0), lu = eu.length(); eu.normalize();
    const ev = new THREE.Vector3().subVectors(p3, p0);
    const ev2 = ev.clone().sub(eu.clone().multiplyScalar(ev.dot(eu))).normalize();
    for (const p of [p0, p1, p2, p3]) {
      const d = new THREE.Vector3().subVectors(p, p0);
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z);
      this.uv.push(d.dot(eu) + uOff, d.dot(ev2)); this.fac.push(facade[0], facade[1] || lu);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  tri(p0, p1, p2) {
    const b = this.pos.length / 3;
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
    const eu = new THREE.Vector3().subVectors(p1, p0).normalize();
    const ev = n.clone().cross(eu);
    for (const p of [p0, p1, p2]) {
      const d = new THREE.Vector3().subVectors(p, p0);
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z);
      this.uv.push(d.dot(eu), d.dot(ev) + p0.y); this.fac.push(0, 0);
    }
    this.idx.push(b, b + 1, b + 2);
  }
  // boîte (mur, cheminée) : x0..x1, y0..y1, z0..z1 ; front = numéro de la face avec porte (-1 = aucune)
  box(x0, x1, y0, y1, z0, z1, windows = true, front = -1) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const t = (i) => [windows ? (front === i ? 2 : 1) : 0, 0];
    this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), t(0)); // +z
    this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), t(1)); // -z
    this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), t(2)); // +x
    this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), t(3)); // -x
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), [0, 0]); // dessus
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('facade', new THREE.Float32BufferAttribute(this.fac, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// toit à deux pans, faîtage selon z ; w = largeur (x), d = longueur (z), h = hauteur des murs
function gableRoof(R, W, cx, cz, w, d, h, pitch, o = 0.45, t = 0.16) {
  const rise = (w / 2) * Math.tan(pitch);
  const ridge = h + rise;
  const ex = w / 2 + o, ey = h - o * Math.tan(pitch);
  const z0 = cz - d / 2 - o, z1 = cz + d / 2 + o;
  // pans (dessus), dessous et bordures
  for (const s of [-1, 1]) {
    const e = V(cx + s * ex, ey, 0), r = V(cx, ridge, 0);
    const a = s > 0 ? [V(e.x, e.y, z1), V(e.x, e.y, z0), V(r.x, r.y, z0), V(r.x, r.y, z1)] : [V(e.x, e.y, z0), V(e.x, e.y, z1), V(r.x, r.y, z1), V(r.x, r.y, z0)];
    R.quad(...a);
    const b = a.map((p) => p.clone().add(V(0, -t, 0)));
    R.quad(b[1], b[0], b[3], b[2]);
    // bordure d'égout
    R.quad(b[0], b[1], a[1], a[0]);
  }
  // rives (tranches aux pignons)
  for (const z of [z0, z1]) {
    const sgn = z === z0 ? -1 : 1;
    const L = V(cx - ex, ey, z), Rr = V(cx + ex, ey, z), T = V(cx, ridge, z);
    const Ld = L.clone().add(V(0, -t, 0)), Rd = Rr.clone().add(V(0, -t, 0)), Td = T.clone().add(V(0, -t, 0));
    if (sgn > 0) { R.quad(Ld, Td, T, L); R.quad(Td, Rd, Rr, T); } else { R.quad(Td, Ld, L, T); R.quad(Rd, Td, T, Rr); }
  }
  // pignons (murs triangulaires sous le toit)
  for (const z of [cz - d / 2, cz + d / 2]) {
    const a = V(cx - w / 2, h, z), b = V(cx + w / 2, h, z), c = V(cx, ridge - 0.05, z);
    if (z > cz) W.tri(a, b, c); else W.tri(b, a, c);
  }
  return ridge;
}

// toit en croupe (quatre pans)
function hipRoof(R, cx, cz, w, d, h, pitch, o = 0.45) {
  const rise = (w / 2) * Math.tan(pitch);
  const ridgeY = h + rise, ey = h - o * Math.tan(pitch);
  const ex = w / 2 + o, ez = d / 2 + o, rl = Math.max(0, d / 2 - w / 2);
  const A = V(cx - ex, ey, cz - ez), B = V(cx + ex, ey, cz - ez), C = V(cx + ex, ey, cz + ez), D = V(cx - ex, ey, cz + ez);
  const R0 = V(cx, ridgeY, cz - rl), R1 = V(cx, ridgeY, cz + rl);
  R.quad(D, C, R1, R1.clone().add(V(-0.001, 0, 0)));
  R.quad(B, A, R0, R0.clone().add(V(0.001, 0, 0)));
  R.quad(C, B, R0, R1);
  R.quad(A, D, R1, R0);
  return ridgeY;
}

function chimney(W, x, z, y0, y1) { W.box(x - 0.35, x + 0.35, y0, y1, z - 0.35, z + 0.35, false); }

// Types de maisons : [walls, roof] (repère local, façade principale vers +z)
function houseTypes() {
  const types = [];
  const make = (fn) => { const W = new Builder(), R = new Builder(); fn(W, R); types.push({ walls: W.geometry(), roof: R.geometry() }); };
  // pavillon de plain-pied
  make((W, R) => { W.box(-4, 4, 0, 3, -5, 5, true, 0); const top = gableRoof(R, W, 0, 0, 8, 10, 3, 0.7); chimney(W, 1.6, -2.5, 3, top + 0.6); });
  // maison à étage
  make((W, R) => { W.box(-4.5, 4.5, 0, 5.8, -5.5, 5.5, true, 0); const top = gableRoof(R, W, 0, 0, 9, 11, 5.8, 0.62); chimney(W, -1.8, 3, 5.8, top + 0.5); });
  // longère (longue et basse)
  make((W, R) => { W.box(-3.5, 3.5, 0, 3.2, -9, 9, true, 2); const top = gableRoof(R, W, 0, 0, 7, 18, 3.2, 0.78); chimney(W, 0.9, -6, 3.2, top + 0.6); chimney(W, 0.9, 6, 3.2, top + 0.6); });
  // maison en L
  make((W, R) => {
    W.box(-4, 4, 0, 5.6, -6, 6, true, 0);
    W.box(4, 10, 0, 3, -6, 0, true, 0);
    gableRoof(R, W, 0, 0, 8, 12, 5.6, 0.66);
    // aile : faîtage selon x (on construit selon z puis on tourne)
    const R2 = new Builder(), W2 = new Builder();
    gableRoof(R2, W2, 0, 0, 6, 6.6, 3, 0.66);
    const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(7.3, 0, -3);
    for (const [src, dst] of [[R2, R], [W2, W]]) {
      const g = src.geometry().applyMatrix4(rot);
      const b = dst.pos.length / 3;
      dst.pos.push(...g.attributes.position.array); dst.nor.push(...g.attributes.normal.array);
      dst.uv.push(...g.attributes.uv.array); dst.fac.push(...g.attributes.facade.array);
      dst.idx.push(...g.index.array.map((i) => i + b));
    }
    chimney(W, -2, 2, 5.6, 9.2);
  });
  // grange / hangar agricole
  make((W, R) => { W.box(-6, 6, 0, 5, -10, 10, false); gableRoof(R, W, 0, 0, 12, 20, 5, 0.5, 0.6); });
  // villa à toit en croupe
  make((W, R) => { W.box(-5, 5, 0, 3.4, -6.5, 6.5, true, 0); hipRoof(R, 0, 0, 10, 13, 3.4, 0.5); chimney(W, 2.5, 1, 3.4, 6.6); });
  return types;
}

// ---------- matériaux ----------
const HASH = 'float jpHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }';

function wallMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
    shader.uniforms.tDetail = { value: TEX.detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 facade;\nvarying vec2 vFacade;\nvarying vec2 vWallUv;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFacade = facade; vWallUv = uv;
        #ifdef USE_INSTANCING
          vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071);
        #else
          vSeed = 0.5;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDetail; uniform float jpNight;
        varying vec2 vFacade; varying vec2 vWallUv; varying float vSeed;
        float jpGlass; float jpLit; float jpRoughW; ${HASH}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec2 uv = vWallUv;
          vec3 base = diffuseColor.rgb;
          // crépi : grain et taches, soubassement plus sombre et sali
          float grain = texture2D(tDetail, uv * 0.9).r * 0.6 + texture2D(tDetail, uv * 0.23).g * 0.4;
          base *= mix(0.84, 1.08, grain);
          float plinth = 1.0 - smoothstep(0.45, 0.5, uv.y);
          base = mix(base, base * vec3(0.62, 0.6, 0.58), plinth);
          base *= mix(0.78, 1.0, smoothstep(0.0, 1.4, uv.y));
          jpGlass = 0.0; jpLit = 0.0; jpRoughW = 0.92;
          if (vFacade.x > 0.5) {
            float L = vFacade.y, bay = 2.7;
            float n = max(1.0, floor(L / bay));
            float u = uv.x - (L - n * bay) * 0.5;
            float cell = floor(u / bay), fu = u - cell * bay;
            float fl = floor(uv.y / 2.8), fv = uv.y - fl * 2.8;
            bool inside = u > 0.0 && cell < n;
            bool door = vFacade.x > 1.5 && fl < 0.5 && abs(cell - floor(n * 0.5)) < 0.5;
            if (inside && door) {
              // porte en bois avec encadrement
              float dx = abs(fu - bay * 0.5);
              if (dx < 0.55 && fv < 2.15) {
                vec3 wood = mix(vec3(0.24, 0.14, 0.07), vec3(0.32, 0.24, 0.16), vSeed);
                base = dx > 0.47 || fv > 2.07 ? vec3(0.85, 0.84, 0.8) : wood * mix(0.85, 1.05, texture2D(tDetail, uv * vec2(0.6, 3.0)).r);
                jpRoughW = 0.7;
              }
            } else if (inside && fv > 0.85 && fv < 2.25) {
              float dx = abs(fu - bay * 0.5), dy = fv - 0.85;
              float hw = 0.6;
              if (dx < hw) {
                // fenêtre : encadrement blanc, croisillon, vitre sombre qui reflète le ciel
                bool frame = dx > hw - 0.08 || dy < 0.08 || dy > 1.32 || abs(dx) < 0.03 || abs(dy - 0.8) < 0.03;
                if (frame) { base = vec3(0.86, 0.86, 0.84); jpRoughW = 0.5; }
                else {
                  float r = jpHash(vec2(cell, fl) + vSeed * 17.0);
                  base = mix(vec3(0.03, 0.04, 0.05), vec3(0.12, 0.14, 0.16), r);
                  jpGlass = 1.0;
                  jpLit = step(0.5, jpHash(vec2(cell * 3.1, fl + vSeed * 7.0)));
                }
              } else if (dx < hw + 0.5 && vSeed > 0.45 && vFacade.x > 0.5) {
                // volets
                vec3 shut = vSeed > 0.8 ? vec3(0.18, 0.3, 0.22) : vSeed > 0.62 ? vec3(0.22, 0.32, 0.45) : vec3(0.42, 0.3, 0.2);
                float slat = step(0.5, fract(dy * 9.0));
                base = shut * mix(0.85, 1.0, slat);
                jpRoughW = 0.7;
              }
              // appui de fenêtre
              if (dx < hw + 0.1 && fv > 0.76 && fv < 0.85) base = vec3(0.7, 0.69, 0.66);
            }
          }
          diffuseColor.rgb = base;
        }
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(jpRoughW, 0.06, jpGlass);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += jpGlass * jpLit * smoothstep(0.35, 0.9, jpNight) * vec3(1.0, 0.7, 0.4) * 2.5;`);
  };
  mat.customProgramCacheKey = () => 'jp-house-wall';
  return mat;
}

function roofMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
    shader.uniforms.tDetail = { value: TEX.detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoofUv;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRoofUv = uv;
        #ifdef USE_INSTANCING
          vSeed = fract(instanceMatrix[3].x * 0.113 + instanceMatrix[3].z * 0.057);
        #else
          vSeed = 0.5;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDetail;
        varying vec2 vRoofUv; varying float vSeed;
        float jpTileH; ${HASH}
        vec3 jpBump(vec3 n, float h, float scale) {
          vec2 dH = vec2(dFdx(h), dFdy(h)) * scale;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, n), r2 = cross(n, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
          return normalize(abs(det) * n - grad);
        }`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec2 uv = vRoofUv;
          vec3 base = diffuseColor.rgb;
          float lum = dot(base, vec3(0.3, 0.55, 0.15));
          bool slate = lum < 0.12 && abs(base.r - base.b) < 0.04;
          float rowH = slate ? 0.22 : 0.33, tileW = slate ? 0.3 : 0.24;
          float row = floor(uv.y / rowH), fv = fract(uv.y / rowH);
          float off = mod(row, 2.0) * 0.5;
          float col = floor(uv.x / tileW + off), fu = fract(uv.x / tileW + off);
          float rnd = jpHash(vec2(col, row) + vSeed * 31.0);
          // tuile canal : profil arrondi ; ardoise : plate, bord inférieur marqué
          float prof = slate ? 0.6 + 0.4 * smoothstep(0.0, 0.08, fu) * smoothstep(1.0, 0.92, fu) : sin(fu * 3.14159);
          float lap = smoothstep(0.0, 0.18, fv);
          jpTileH = prof * 0.6 + lap * 0.4;
          base *= mix(0.72, 1.12, rnd) * mix(0.55, 1.0, lap) * mix(0.8, 1.06, prof);
          // salissures et mousse
          float grime = texture2D(tDetail, uv * 0.11).g;
          base = mix(base, base * vec3(0.75, 0.8, 0.62), smoothstep(0.55, 0.85, grime) * 0.5);
          diffuseColor.rgb = base;
        }
      `)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = jpBump(normal, jpTileH, 0.06);`);
  };
  mat.customProgramCacheKey = () => 'jp-house-roof';
  return mat;
}

// Couleurs réalistes (sRGB) : crépis et tuiles
export const WALL_COLORS = [0xe8e0cf, 0xdcccb0, 0xcfc0a2, 0xf0ece2, 0xd9c7a6, 0xc9b9a2, 0xe2d6c2, 0xbfb3a3];
export const ROOF_COLORS = [0xa04a2c, 0x8e3d27, 0xb25a36, 0x7a3a26, 0x3a3c40, 0x2f3236, 0x6b4a3a];

export class HouseLibrary {
  constructor() {
    this.types = houseTypes();
    this.wallMat = wallMaterial();
    this.roofMat = roofMaterial();
  }

  // houses : [{ m: Matrix4, type, wall, roof }] → maillages instanciés (murs + toits par type)
  meshes(houses) {
    const out = [];
    const col = new THREE.Color();
    this.types.forEach((t, ti) => {
      const list = houses.filter((h) => h.type === ti);
      if (!list.length) return;
      const walls = new THREE.InstancedMesh(t.walls, this.wallMat, list.length);
      const roofs = new THREE.InstancedMesh(t.roof, this.roofMat, list.length);
      list.forEach((h, i) => {
        walls.setMatrixAt(i, h.m); roofs.setMatrixAt(i, h.m);
        walls.setColorAt(i, col.setHex(h.wall)); roofs.setColorAt(i, col.setHex(h.roof));
      });
      for (const m of [walls, roofs]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); }
      out.push(walls, roofs);
    });
    return out;
  }
}

// ---------- Immeubles de ville ----------
// Trois styles choisis par immeuble : tour de verre (meneaux, nez de dalle), bureaux en béton à bandeaux
// de fenêtres, immeuble en brique (fenêtres encadrées, vitrines au rez-de-chaussée). Toit en gravier.
export function createCityMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
    shader.uniforms.tDetail = { value: TEX.detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityW;\nvarying vec3 vCityN;\nvarying vec3 vCityBase;\nvarying float vCityH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 cw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
          vCityBase = instanceMatrix[3].xyz;
          vCityH = length(instanceMatrix[1].xyz);
          vCityN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vCityBase = vec3(0.0); vCityH = 10.0;
          vCityN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vCityW = (modelMatrix * cw).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tDetail; uniform float jpNight;
        varying vec3 vCityW; varying vec3 vCityN; varying vec3 vCityBase; varying float vCityH;
        float jpGlass; float jpLit; float jpRough; float jpMetal; ${HASH}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec3 n = normalize(vCityN);
          float seed = jpHash(floor(vCityBase.xz));
          float style = vCityH > 45.0 ? (seed < 0.75 ? 0.0 : 1.0) : vCityH > 22.0 ? (seed < 0.3 ? 0.0 : seed < 0.75 ? 1.0 : 2.0) : (seed < 0.6 ? 2.0 : 1.0);
          vec3 base = diffuseColor.rgb;
          jpGlass = 0.0; jpLit = 0.0; jpRough = 0.85; jpMetal = 0.0;
          float y = vCityW.y - vCityBase.y;
          if (n.y > 0.7) {
            // toit plat en gravier
            float g = texture2D(tDetail, vCityW.xz * 0.35).r * 0.6 + texture2D(tDetail, vCityW.xz * 0.05).g * 0.4;
            base = vec3(0.36, 0.35, 0.33) * mix(0.75, 1.15, g);
          } else if (abs(n.y) < 0.3) {
            float u = abs(n.x) > abs(n.z) ? vCityW.z : vCityW.x;
            float fl = 3.4, fy = mod(y, fl), floorI = floor(y / fl);
            // taille d'un pixel à l'écran (m) : les motifs trop fins sont remplacés par leur teinte moyenne
            float fw = max(fwidth(y), fwidth(u));
            float fine = 1.0 - smoothstep(0.06, 0.18, fw);
            float mid = 1.0 - smoothstep(0.25, 0.7, fw);
            float r = jpHash(vec2(floor(u / 3.0), floorI) + seed * 13.0);
            if (style < 0.5) {
              // mur-rideau : verre teinté, meneaux tous les 1,5 m, nez de dalle à chaque étage
              float mul = step(fract(u / 1.5), 0.05) * fine;
              float slab = step(fy, 0.35) * mid;
              vec3 glass = mix(vec3(0.05, 0.09, 0.12), vec3(0.1, 0.16, 0.2), seed) * mix(0.85, 1.15, r);
              base = mix(glass, vec3(0.42, 0.44, 0.46), max(mul, slab));
              jpGlass = 1.0 - max(mul, slab); jpRough = mix(0.35, 0.05, jpGlass); jpMetal = 0.5 * jpGlass;
            } else if (style < 1.5) {
              // béton, bandeaux de fenêtres horizontaux
              float band = step(1.0, fy) * step(fy, 2.7);
              float post = step(fract(u / 4.0), 0.06) * fine;
              vec3 conc = base * vec3(0.95, 0.94, 0.9) * mix(0.85, 1.08, texture2D(tDetail, vec2(u, y) * 0.3).r);
              vec3 bandCol = band > 0.5 && post < 0.5 ? mix(vec3(0.06, 0.08, 0.1), vec3(0.16, 0.19, 0.22), r) : conc;
              base = mix(mix(conc, vec3(0.1, 0.12, 0.14), 0.45), bandCol, mid);
              jpGlass = band * (1.0 - post) * mid; jpRough = mix(0.9, 0.08, jpGlass);
            } else {
              // brique : lits et joints, fenêtres encadrées, vitrines au rez-de-chaussée
              float bh = 0.3, row = floor(y / bh), bx = u / 0.6 + mod(row, 2.0) * 0.5;
              float mortar = max(step(fract(y / bh), 0.1), step(fract(bx), 0.06));
              vec3 brick = mix(vec3(0.42, 0.2, 0.14), vec3(0.55, 0.3, 0.2), jpHash(vec2(floor(bx), row))) * mix(0.9, 1.0, seed);
              base = mix(mix(vec3(0.5, 0.29, 0.21) * mix(0.9, 1.0, seed), brick, fine), vec3(0.62, 0.6, 0.56), mortar * fine);
              float cell = fract(u / 3.2), cy = fy;
              bool shop = floorI < 0.5;
              float wx = abs(cell - 0.5) * 3.2, wh = shop ? 2.6 : 1.5, wy0 = shop ? 0.3 : 0.9;
              if (wx < (shop ? 1.4 : 0.6) && cy > wy0 && cy < wy0 + wh) {
                bool frame = wx > (shop ? 1.32 : 0.53) || cy < wy0 + 0.07 || cy > wy0 + wh - 0.07;
                vec3 win = frame ? vec3(0.8, 0.8, 0.78) : mix(vec3(0.05, 0.06, 0.07), vec3(0.15, 0.17, 0.2), r);
                base = mix(mix(base, vec3(0.25, 0.22, 0.21), 0.6), win, mid);
                jpGlass = frame ? 0.0 : mid; jpRough = frame ? 0.5 : mix(0.8, 0.06, mid);
              }
            }
            jpLit = jpGlass * step(0.55, jpHash(vec2(floor(u / 3.0) * 1.3, floorI) + seed * 5.0));
            // salissures en bas des façades
            base *= mix(0.75, 1.0, smoothstep(0.0, 3.0, y));
          }
          diffuseColor.rgb = base;
        }
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = jpRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = jpMetal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += jpLit * smoothstep(0.35, 0.9, jpNight) * mix(vec3(1.0, 0.72, 0.42), vec3(0.85, 0.92, 1.0), jpHash(vCityW.xz * 0.21)) * 2.6;`);
  };
  mat.customProgramCacheKey = () => 'jp-city';
  return mat;
}

// Acrotère (rebord du toit) : cadre de quatre côtés, dans un carré unitaire
export function parapetGeometry() {
  const parts = [];
  const t = 0.02;
  for (const [x, z, w, d] of [[0, 0.5 - t / 2, 1, t], [0, -0.5 + t / 2, 1, t], [0.5 - t / 2, 0, t, 1], [-0.5 + t / 2, 0, t, 1]]) {
    parts.push(new THREE.BoxGeometry(w, 1, d).translate(x, 0.5, z));
  }
  const pos = [], nor = [], idx = [];
  for (const g of parts) {
    const b = pos.length / 3;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    idx.push(...g.index.array.map((i) => i + b));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
