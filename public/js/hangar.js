// Hangar 3D : une scène à part (le monde est déchargé pendant ce temps), l'avion au centre sur un plateau
// tournant, caméra orbitale à la souris / au doigt. La personnalisation est appliquée en direct.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPlaneMesh, animatePlaneMesh, disposePlaneMesh } from './planeModel.js';
import { aircraftById } from './aircraft.js';

// ----- textures procédurales -----
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}
// béton ciré avec taches et joints de dalles
const concrete = () => canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#8d9094';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const g = 120 + Math.random() * 40;
    x.fillStyle = `rgba(${g},${g},${g + 4},${Math.random() * 0.25})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 14; i++) {
    const r = 20 + Math.random() * 70;
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, 'rgba(40,40,44,0.18)');
    gr.addColorStop(1, 'rgba(40,40,44,0)');
    x.save();
    x.translate(Math.random() * w, Math.random() * h);
    x.fillStyle = gr;
    x.fillRect(-r, -r, r * 2, r * 2);
    x.restore();
  }
  x.strokeStyle = 'rgba(50,52,56,0.55)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, w, h);
}, [10, 8]);
// tôle ondulée des murs
const corrugated = () => canvasTex(256, 256, (x, w, h) => {
  for (let i = 0; i < w; i++) {
    const v = 150 + Math.sin((i / w) * Math.PI * 16) * 38;
    x.fillStyle = `rgb(${v - 8},${v},${v + 8})`;
    x.fillRect(i, 0, 1, h);
  }
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(110,80,50,${Math.random() * 0.12})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 10 + Math.random() * 60);
  }
}, [12, 2]);
// grand logo au sol
const floorLogo = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.translate(512, 512);
  x.strokeStyle = 'rgba(245,181,50,0.9)';
  x.lineWidth = 22;
  x.beginPath(); x.arc(0, 0, 470, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 8;
  x.beginPath(); x.arc(0, 0, 420, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(245,181,50,0.85)';
  x.font = 'bold 150px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('JP AIRLINES', 0, 330);
  x.rotate(Math.PI);
  x.fillText('HANGAR 1', 0, 330);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
// ciel vu par les portes ouvertes
const skyTex = () => canvasTex(256, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5b9be0');
  g.addColorStop(0.65, '#cfe4f7');
  g.addColorStop(0.66, '#6d8f4a');
  g.addColorStop(1, '#55703a');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(Math.random() * w, 30 + Math.random() * 90, 20 + Math.random() * 30, 6 + Math.random() * 6, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#3b3e44';
  x.fillRect(0, h * 0.66, w, 8); // piste
});

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

export class Hangar {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
    this.view = { yaw: 0.8, pitch: 0.18, dist: 15, target: new THREE.Vector3(0, 1.2, 0), autoSpin: true };
    this.plane = null;
    this.t = 0;
    this.built = false;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const S = this.scene;
    const pm = new THREE.PMREMGenerator(this.renderer);
    S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    S.environmentIntensity = 0.55;
    pm.dispose();
    S.background = new THREE.Color(0x1a1d22);
    S.fog = new THREE.Fog(0x1a1d22, 40, 90);

    const W = 44, D = 36, H = 13;
    const floorMat = new THREE.MeshStandardMaterial({ map: concrete(), roughness: 0.42, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat);
    floor.receiveShadow = true;
    S.add(floor);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorLogo(), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    logo.position.y = 0.01;
    logo.receiveShadow = true;
    S.add(logo);
    // bandes jaunes et noires de sécurité au sol
    const hazard = canvasTex(128, 16, (x, w, h) => { for (let i = -2; i < 16; i++) { x.fillStyle = i % 2 ? '#1c1c1c' : '#f2c21b'; x.beginPath(); x.moveTo(i * 16, h); x.lineTo(i * 16 + 16, h); x.lineTo(i * 16 + 32, 0); x.lineTo(i * 16 + 16, 0); x.fill(); } }, [20, 1]);
    for (const z of [-D / 2 + 4, D / 2 - 6]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 4, 0.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
      strip.position.set(0, 0.012, z);
      S.add(strip);
    }

    // plateau tournant
    this.turntable = new THREE.Group();
    S.add(this.turntable);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.4, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.35, metalness: 0.6 }));
    tt.position.y = 0.09;
    tt.receiveShadow = true;
    this.turntable.add(tt);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7.25, 0.06, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf5b532 }));
    rim.position.y = 0.19;
    this.turntable.add(rim);

    // murs en tôle, toit à fermes métalliques
    const wallMat = new THREE.MeshStandardMaterial({ map: corrugated(), roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
    back.position.set(0, H / 2, -D / 2);
    S.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
      side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * W / 2, H / 2, 0);
      S.add(side);
    }
    // façade avant : grandes portes ouvertes sur le terrain
    const frontMat = wallMat.clone();
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - 13, H), frontMat);
      p.position.set(s * (13 + (W / 2 - 13) / 2), H / 2, D / 2);
      p.rotation.y = Math.PI;
      S.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(26, H - 9), frontMat);
    lintel.position.set(0, 9 + (H - 9) / 2, D / 2);
    lintel.rotation.y = Math.PI;
    S.add(lintel);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: skyTex(), fog: false }));
    outside.position.set(0, 8, D / 2 + 14);
    outside.rotation.y = Math.PI;
    S.add(outside);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6f7a84, roughness: 0.5, metalness: 0.6 });
    for (const s of [-1, 1]) box(9, 9, 0.3, doorMat, s * 17.5, 4.5, D / 2 + 0.4, S); // portes coulissantes ouvertes
    // toit en pente et fermes
    const roofMat = new THREE.MeshStandardMaterial({ map: corrugated(), color: 0x9aa0a8, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 / Math.cos(0.22) + 0.5, D).rotateX(Math.PI / 2), roofMat);
      r.position.set(s * W / 4, H + Math.tan(0.22) * W / 4, 0);
      r.rotation.z = -s * 0.22; // plus haut au faîtage, au centre
      S.add(r);
    }
    const steel = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.45, metalness: 0.8 });
    for (let z = -D / 2 + 3; z < D / 2; z += 6) {
      box(W, 0.35, 0.35, steel, 0, H - 0.2, z, S);
      for (const s of [-1, 1]) {
        const b = box(W / 2 / Math.cos(0.22), 0.3, 0.3, steel, s * W / 4, H + Math.tan(0.22) * W / 4 - 0.2, z, S);
        b.rotation.z = -s * 0.22;
      }
      for (let k = -3; k <= 3; k++) {
        const x0 = k * (W / 8), h0 = H + Math.tan(0.22) * (W / 2 - Math.abs(x0)) - H;
        if (h0 > 0.4) box(0.18, h0, 0.18, steel, x0, H + h0 / 2 - 0.2, z, S);
      }
    }
    // piliers
    for (const s of [-1, 1]) for (let z = -D / 2 + 3; z < D / 2; z += 6) box(0.5, H, 0.5, steel, s * (W / 2 - 0.3), H / 2, z, S);

    // éclairage : lampes industrielles suspendues + lumière du jour par les portes
    S.add(new THREE.HemisphereLight(0xdfe8f5, 0x3a3630, 0.55));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.4, metalness: 0.7 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
    for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.8, 20, 1, true), lampMat);
      shade.position.set(x, H - 2.2, z);
      S.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20).rotateX(Math.PI / 2), glowMat);
      bulb.position.set(x, H - 2.6, z);
      S.add(bulb);
      box(0.04, 2, 0.04, steel, x, H - 1.2, z, S);
      const l = new THREE.PointLight(0xffe9c4, 60, 26, 1.6);
      l.position.set(x, H - 2.9, z);
      S.add(l);
    }
    const key = new THREE.SpotLight(0xfff4e0, 900, 60, 0.42, 0.6, 1.4);
    key.position.set(6, H - 1, 9);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    S.add(key, key.target);
    const day = new THREE.DirectionalLight(0xcfe2ff, 1.2);
    day.position.set(-4, 10, 40);
    S.add(day);

    // atelier : établis, armoires à outils, fûts, caisses, chariot, escabeau
    const red = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.45, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.85 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1f5fa8, roughness: 0.5, metalness: 0.3 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5, metalness: 0.3 });
    for (let i = 0; i < 4; i++) {
      box(1.6, 1.8, 0.7, red, -16 + i * 1.7, 0.9, -D / 2 + 0.5, S);
      for (let k = 0; k < 4; k++) box(1.5, 0.04, 0.02, steel, -16 + i * 1.7, 0.35 + k * 0.4, -D / 2 + 0.86, S);
    }
    box(5, 0.12, 1.2, wood, 8, 1, -D / 2 + 0.8, S);
    for (const x of [6, 10]) box(0.1, 1, 1, steel, x, 0.5, -D / 2 + 0.8, S);
    const pegboard = box(5, 2, 0.05, new THREE.MeshStandardMaterial({ color: 0x5a4c3a, roughness: 0.9 }), 8, 2.4, -D / 2 + 0.05, S);
    void pegboard;
    for (let i = 0; i < 9; i++) box(0.08, 0.5 + Math.random() * 0.4, 0.04, steel, 6 + i * 0.5, 2.3, -D / 2 + 0.1, S);
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.25, 20);
    for (const [x, z, m] of [[19, -14, blue], [19.9, -14.2, red], [19.4, -13.3, blue], [-19.5, 12, yellow], [-18.6, 12.4, yellow]]) {
      const d = new THREE.Mesh(drumGeo, m);
      d.position.set(x, 0.62, z);
      d.castShadow = d.receiveShadow = true;
      S.add(d);
    }
    for (const [x, z, s] of [[-19, -14, 1.2], [-17.6, -14.3, 1], [-18.4, -12.9, 0.8], [-18.6, -14, 0.7]]) {
      const c = box(s, s, s, wood, x, s / 2 + (x === -18.6 ? 1.2 : 0), z, S);
      c.rotation.y = Math.random();
    }
    // chariot de piste et escabeau
    box(2.2, 0.5, 1.2, yellow, 16, 0.55, 10, S);
    for (const [x, z] of [[15.2, 9.5], [16.8, 9.5], [15.2, 10.5], [16.8, 10.5]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.15, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }));
      wh.position.set(x, 0.22, z);
      S.add(wh);
    }
    for (let k = 0; k < 5; k++) box(0.9, 0.05, 0.3, steel, -14, 0.4 + k * 0.45, 8 + k * 0.18, S);
    for (const s of [-1, 1]) {
      const rail = box(0.06, 2.6, 0.06, steel, -14 + s * 0.45, 1.3, 8.4, S);
      rail.rotation.x = -0.35;
    }
    // panneau JP Airlines au fond
    const sign = canvasTex(512, 128, (x, w, h) => {
      x.fillStyle = '#12161c'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#f5b532'; x.font = 'bold 80px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('JP AIRLINES', w / 2, h / 2 + 4);
    });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: sign }));
    sg.position.set(0, 9.5, -D / 2 + 0.05);
    S.add(sg);
  }

  // place un avion (type + livrée) au centre du plateau
  setPlane(type, livery, keepView = false) {
    if (this.plane) {
      this.turntable.remove(this.plane);
      disposePlaneMesh(this.plane);
    }
    const def = aircraftById(type);
    const m = createPlaneMesh(type, { livery, detail: true });
    m.position.y = def.specs.gear + 0.19; // roues sur le plateau
    this.turntable.add(m);
    this.plane = m;
    if (keepView) return;
    const span = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    this.view.dist = THREE.MathUtils.clamp(Math.max(span.x, span.z) * 1.25, 9, 26);
    this.view.target.y = Math.max(1, span.y * 0.45);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    // sur grand écran, l'avion est décalé vers la gauche pour laisser la place au panneau de personnalisation
    if (innerWidth > 760) this.camera.setViewOffset(innerWidth, innerHeight, Math.min(340, innerWidth * 0.3) / 2, 0, innerWidth, innerHeight);
    else this.camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.18, innerWidth, innerHeight);
    this.camera.updateProjectionMatrix();
  }

  drag(dx, dy) {
    this.view.yaw -= dx * 0.006;
    this.view.pitch = THREE.MathUtils.clamp(this.view.pitch + dy * 0.004, 0.02, 1.1);
    this.view.autoSpin = false;
  }
  zoom(f) { this.view.dist = THREE.MathUtils.clamp(this.view.dist * f, 6, 30); }

  update(dt) {
    this.t += dt;
    const v = this.view;
    if (v.autoSpin) this.turntable.rotation.y += dt * 0.18;
    const c = Math.cos(v.pitch);
    this.camera.position.set(Math.sin(v.yaw) * c * v.dist, v.target.y + Math.sin(v.pitch) * v.dist, Math.cos(v.yaw) * c * v.dist);
    this.camera.lookAt(v.target);
    // hélice qui tourne doucement au ralenti
    if (this.plane) animatePlaneMesh(this.plane, { rpm: 0.08, gearPos: 1, flapPos: 0, lights: false, night: 0 }, dt, this.t);
  }

  // point de la carrosserie sous la souris (autocollants) : { p, n } dans le repère de l'avion, ou null
  pick(clientX, clientY) {
    if (!this.plane) return null;
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets = [];
    this.plane.traverse((o) => { if (o.isMesh && o.userData.paint) targets.push(o); });
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit || !hit.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (n.dot(ray.ray.direction) > 0) n.negate(); // face tournée vers la caméra
    const q = this.plane.getWorldQuaternion(new THREE.Quaternion()).invert();
    return { p: this.plane.worldToLocal(hit.point.clone()), n: n.applyQuaternion(q).normalize() };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
