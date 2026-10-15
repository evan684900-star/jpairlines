// Arbres réalistes générés par EZ-Tree (https://github.com/dgreenheck/ez-tree, MIT) :
// - une dizaine de modèles (pins, chênes, frênes, bouleaux, buissons) générés au chargement, allégés pour le jeu,
//   avec écorce texturée (couleur, relief, rugosité, occlusion) et feuillage en textures détourées ;
// - près de la caméra : vrais arbres 3D (instanciés, ombres, feuillage qui bouge au vent) ;
// - au loin : « imposteurs » = photos de ces mêmes arbres prises au chargement (vue de côté + vue de dessus),
//   posées sur des panneaux croisés : quelques triangles par arbre, ce qui permet des forêts denses.
import * as THREE from 'three';
import { Tree } from 'ez-tree/tree.js';
import { loadPreset } from 'ez-tree/presets/index.js';
import { injectShared } from './shared.js';

// kind : catégorie utilisée par le décor ; height : hauteur visée (m)
export const TREE_VARIANTS = [
  { preset: 'Pine Small', seed: 11, height: 15, kind: 'conifer' },
  { preset: 'Pine Medium', seed: 23, height: 21, kind: 'conifer' },
  { preset: 'Pine Small', seed: 47, height: 11, kind: 'conifer' },
  { preset: 'Pine Large', seed: 5, height: 25, kind: 'conifer' },
  { preset: 'Oak Small', seed: 5, height: 11, kind: 'broadleaf' },
  { preset: 'Oak Medium', seed: 9, height: 15, kind: 'broadleaf' },
  { preset: 'Ash Small', seed: 3, height: 13, kind: 'broadleaf' },
  { preset: 'Aspen Small', seed: 7, height: 14, kind: 'broadleaf', leaves: 'ash' }, // bouleau (feuilles vertes d'été)
  { preset: 'Bush 2', seed: 4, height: 2.4, kind: 'bush' },
  { preset: 'Bush 1', seed: 8, height: 3.2, kind: 'bush' },
];
export const variantsOf = (kind) => TREE_VARIANTS.map((v, i) => (v.kind === kind ? i : -1)).filter((i) => i >= 0);

const CELL = 256, COLS = 4;
const ROWS = Math.ceil((TREE_VARIANTS.length * 2) / COLS);

// ondulation au vent, identique pour l'écorce, le feuillage et les imposteurs (ils bougent ensemble)
const SWAY = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 jpBase = instanceMatrix[3].xyz;
  #else
    vec3 jpBase = vec3(0.0);
  #endif
  {
    float jpH = max(0.0, transformed.y - 1.5);
    float jpK = jpH * jpH * 0.0006 * (0.6 + jpWind);
    transformed.x += sin(jpTime * 1.3 + jpBase.x * 0.07 + jpBase.z * 0.03) * jpK;
    transformed.z += cos(jpTime * 1.1 + jpBase.z * 0.07) * jpK * 0.8;
  }
`;
export const TREE_U = { jpWind: { value: 0.3 }, uNear: { value: 200 }, uLight: { value: new THREE.Color(1, 1, 1) } };

function swayMaterial(mat, flutter = false) {
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
    Object.assign(shader.uniforms, TREE_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float jpTime;\nuniform float jpWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY}${flutter ? 'transformed += normal * sin(jpTime * 5.0 + position.x * 4.0 + position.y * 3.0) * 0.04 * (0.4 + jpWind);' : ''}`);
  };
  mat.customProgramCacheKey = () => `jp-sway-${flutter}`;
  return mat;
}

// attend qu'une texture soit chargée (au plus 10 s), puis la marque pour l'envoi au GPU
function waitTexture(t) {
  return new Promise((res) => {
    if (!t) return res();
    const t0 = performance.now();
    const check = () => {
      if (t.image?.width || performance.now() - t0 > 10000) { t.needsUpdate = true; res(); } else setTimeout(check, 30);
    };
    check();
  });
}

// ---------- génération des modèles ----------
function makeVariant(def) {
  const tree = new Tree();
  const o = loadPreset(def.preset);
  o.seed = def.seed;
  if (def.leaves) { o.leaves.type = def.leaves; o.leaves.tint = 0xffffff; }
  // allègement pour le jeu : moins de sections et de feuilles (un peu plus grandes)
  for (const k in o.branch.sections) o.branch.sections[k] = Math.max(3, Math.round(o.branch.sections[k] * 0.35));
  for (const k in o.branch.segments) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.6));
  o.leaves.count = Math.max(4, Math.round(o.leaves.count * 0.5));
  o.leaves.size *= 1.4;
  tree.options.copy(o);
  tree.generate();
  const bGeo = tree.branchesMesh.geometry, lGeo = tree.leavesMesh.geometry;
  const box = new THREE.Box3().setFromObject(tree);
  const s = def.height / Math.max(1, box.max.y - Math.min(0, box.min.y));
  bGeo.scale(s, s, s); lGeo.scale(s, s, s);
  // feuillage éclairé comme un volume : normales orientées depuis le centre de la couronne
  lGeo.computeBoundingBox();
  const c = lGeo.boundingBox.getCenter(new THREE.Vector3());
  const p = lGeo.attributes.position, n = lGeo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.8, p.getZ(i) - c.z).normalize();
    v.y += 0.35;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  bGeo.computeBoundingSphere(); lGeo.computeBoundingSphere();
  const bm = tree.branchesMesh.material, lm = tree.leavesMesh.material;
  const bark = swayMaterial(new THREE.MeshStandardMaterial({
    map: bm.map, normalMap: bm.normalMap, roughnessMap: bm.roughnessMap, aoMap: bm.aoMap, color: bm.color, roughness: 1, metalness: 0,
  }));
  const leaves = swayMaterial(new THREE.MeshStandardMaterial({
    map: lm.map, color: lm.color.clone().multiplyScalar(0.92), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0,
  }), true);
  leaves.alphaToCoverage = true;
  const size = new THREE.Box3().setFromBufferAttribute(lGeo.attributes.position).union(new THREE.Box3().setFromBufferAttribute(bGeo.attributes.position));
  return { def, bGeo, lGeo, bark, leaves, box: size, textures: [bm.map, bm.normalMap, bm.roughnessMap, bm.aoMap, lm.map] };
}

// ---------- photos des arbres pour les imposteurs ----------
function captureAtlas(renderer, variants) {
  const rt = new THREE.WebGLRenderTarget(CELL * COLS, CELL * ROWS, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe2efff, 0x4b4232, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(0.5, 1, 0.8);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x2b3523, 0); // couleur de feuillage sans opacité : pas de halo sombre au filtrage
  renderer.clear();
  const data = [];
  variants.forEach((vr, i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(vr.bGeo, vr.bark), new THREE.Mesh(vr.lGeo, vr.leaves));
    scene.add(group);
    const b = vr.box;
    const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h = b.max.y;
    const side = Math.max(w, h) * 1.04;
    const top = w * 1.04;
    for (const view of [0, 1]) {
      const idx = i * 2 + view, col = idx % COLS, row = Math.floor(idx / COLS);
      rt.viewport.set(col * CELL, row * CELL, CELL, CELL);
      rt.scissor.set(col * CELL, row * CELL, CELL, CELL);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt); // three ne relit le cadrage de la cible qu'ici
      if (view === 0) {
        cam.left = -side / 2; cam.right = side / 2; cam.bottom = 0; cam.top = side;
        cam.position.set(0, 0, 200); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
      } else {
        cam.left = -top / 2; cam.right = top / 2; cam.bottom = -top / 2; cam.top = top / 2;
        cam.position.set(0, 300, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
      }
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
    }
    scene.remove(group);
    // taille du panneau de côté, taille et hauteur du panneau du dessus
    data.push(new THREE.Vector4(side, top, h * (vr.def.kind === 'conifer' ? 0.5 : 0.62), 0));
  });
  rt.scissorTest = false;
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  return { texture: rt.texture, data };
}

// panneaux croisés + panneau horizontal (unitaires, mis à l'échelle dans le shader selon le modèle)
function impostorGeometry() {
  const pos = [], uv = [], part = [], idx = [];
  const quad = (pts, uvs, pr) => {
    const b = pos.length / 3;
    for (let k = 0; k < 4; k++) { pos.push(...pts[k]); uv.push(...uvs[k]); part.push(pr); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const U4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
  quad([[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]], U4, 0);
  quad([[0, 0, 0.5], [0, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5]], U4, 0);
  quad([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]], U4, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

function impostorMaterial(atlas, data) {
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tAtlas: { value: null }, uVar: { value: data } }]),
    defines: { VARIANTS: data.length, COLS: COLS.toFixed(1), ROWS: ROWS.toFixed(1) },
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute float part;
      attribute vec3 iPos; attribute vec3 iData; // iData = (rotation, échelle, variante)
      uniform vec4 uVar[VARIANTS];
      uniform float uNear; uniform float jpTime; uniform float jpWind;
      varying vec2 vUv; varying float vTop;
      void main() {
        float iVar = iData.z;
        int vi = int(iVar + 0.5);
        vec4 d = uVar[vi];
        vec3 transformed = part < 0.5 ? position * d.x : vec3(position.x * d.y, d.z, position.z * d.y);
        vec3 jpBase = iPos;
        {
          float jpH = max(0.0, transformed.y - 1.5);
          float jpK = jpH * jpH * 0.0006 * (0.6 + jpWind);
          transformed.x += sin(jpTime * 1.3 + jpBase.x * 0.07 + jpBase.z * 0.03) * jpK;
          transformed.z += cos(jpTime * 1.1 + jpBase.z * 0.07) * jpK * 0.8;
        }
        float c = cos(iData.x), sn = sin(iData.x);
        transformed *= iData.y;
        vec3 wp = iPos + vec3(c * transformed.x + sn * transformed.z, transformed.y, -sn * transformed.x + c * transformed.z);
        // les arbres proches sont dessinés en vrai 3D : on efface leur imposteur
        vec3 dc = iPos - cameraPosition;
        if (dot(dc.xz, dc.xz) + dc.y * dc.y * 0.25 < uNear * uNear) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float idx = iVar * 2.0 + part;
        vec2 cell = vec2(mod(idx, COLS), floor(idx / COLS));
        vUv = (cell + clamp(uv, 0.004, 0.996)) / vec2(COLS, ROWS);
        vTop = part;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tAtlas; uniform vec3 uLight;
      varying vec2 vUv; varying float vTop;
      void main() {
        vec4 c = texture2D(tAtlas, vUv);
        if (c.a < 0.5) discard;
        float shade = 1.0;
        #ifdef USE_FOG
          shade = 0.55 + 0.45 * jpCloudShadowAt(vFogWorld);
        #endif
        gl_FragColor = vec4(c.rgb * uLight * shade, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.tAtlas.value = atlas;
  Object.assign(mat.uniforms, TREE_U);
  return mat;
}

export class TreeLibrary {
  // construit les modèles, attend leurs textures et prend les photos des imposteurs
  async build(renderer) {
    this.variants = TREE_VARIANTS.map(makeVariant);
    await Promise.all(this.variants.flatMap((v) => v.textures.map(waitTexture)));
    const { texture, data } = captureAtlas(renderer, this.variants);
    this.atlas = texture;
    this.variantData = data;
    this.impostorGeo = impostorGeometry();
    this.impostorMat = impostorMaterial(texture, data);
    return this;
  }

  // imposteurs d'un morceau de décor : data = Float32Array [x, y, z, rotation, échelle, variante] × n
  impostors(data, n, center) {
    const geo = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'uv', 'part']) geo.setAttribute(k, this.impostorGeo.attributes[k]);
    geo.setIndex(this.impostorGeo.index);
    const buf = new THREE.InstancedInterleavedBuffer(data, TREE_STRIDE);
    geo.setAttribute('iPos', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    geo.setAttribute('iData', new THREE.InterleavedBufferAttribute(buf, 3, 3));
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(center, 1600);
    const mesh = new THREE.Mesh(geo, this.impostorMat);
    mesh.userData.disposeGeometry = true;
    return mesh;
  }
}

export const TREE_STRIDE = 6;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function treeMatrix(d, i, out = _m) {
  const o = i * TREE_STRIDE;
  return out.compose(_p.set(d[o], d[o + 1], d[o + 2]), _q.setFromAxisAngle(_up, d[o + 3]), _s.setScalar(d[o + 4]));
}

// Vrais arbres 3D autour de la caméra (les plus proches), remplis à partir des listes du décor
export class NearTrees {
  constructor(scene, lib, capacity = 500) {
    this.lib = lib;
    this.meshes = lib.variants.map((v) => {
      const b = new THREE.InstancedMesh(v.bGeo, v.bark, capacity);
      const l = new THREE.InstancedMesh(v.lGeo, v.leaves, capacity);
      for (const m of [b, l]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
      // ombre du feuillage découpée selon la forme des feuilles
      l.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: v.leaves.map, alphaTest: 0.5 });
      return { b, l };
    });
    this.capacity = capacity;
    this.timer = 0;
  }

  // chunks : arbres { data, n } des morceaux de décor proches ; radius : rayon maximal ;
  // maxTrees : nombre maximal d'arbres 3D (au-delà, le rayon se resserre sur les plus proches)
  update(dt, camPos, chunks, radius, maxTrees) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const R = radius + 45; // un peu plus large : pas de trou entre deux mises à jour
    const R2 = R * R;
    const cand = this.cand || (this.cand = []);
    cand.length = 0;
    for (const { data, n } of chunks) {
      for (let i = 0; i < n; i++) {
        const o = i * TREE_STRIDE;
        const dx = data[o] - camPos.x, dy = data[o + 1] - camPos.y, dz = data[o + 2] - camPos.z;
        const d2 = dx * dx + dy * dy * 0.25 + dz * dz;
        if (d2 < R2) cand.push([d2, data, i]);
      }
    }
    let near = radius;
    if (cand.length > maxTrees) {
      cand.sort((a, b) => a[0] - b[0]);
      cand.length = maxTrees;
      near = Math.min(radius, Math.sqrt(cand[cand.length - 1][0]) - 45);
    }
    TREE_U.uNear.value = Math.max(0, near);
    const counts = this.meshes.map(() => 0);
    for (const [, data, i] of cand) {
      const v = data[i * TREE_STRIDE + 5];
      const k = counts[v];
      if (k >= this.capacity) continue;
      const m = treeMatrix(data, i);
      this.meshes[v].b.setMatrixAt(k, m);
      this.meshes[v].l.setMatrixAt(k, m);
      counts[v] = k + 1;
    }
    this.meshes.forEach((m, i) => {
      m.b.count = m.l.count = counts[i];
      m.b.instanceMatrix.needsUpdate = m.l.instanceMatrix.needsUpdate = true;
    });
  }

  setVisible(v) { for (const m of this.meshes) m.b.visible = m.l.visible = v; }
}
