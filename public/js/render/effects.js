// Effets visuels liés au vol (lecture seule de l'état de l'avion) :
// fumée et flamme moteur, poussière au roulage, fumée de pneus au toucher, crash,
// tourbillons de condensation en bout d'aile, pluie autour de la caméra, éclairs d'orage.
import * as THREE from 'three';
import { TEX } from './textures.js';
import { groundHeight, onRunway } from '../world.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------- Particules : panneaux face caméra (fumée = mélange normal, feu = additif) ----------
class ParticlePool {
  constructor(max, additive) {
    this.max = max;
    this.n = 0;
    this.p = []; // { pos, vel, life, maxLife, size, grow, color, alpha, drag, rise }
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tPuff: { value: TEX.puff }, light: { value: new THREE.Color(1, 1, 1) } }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        attribute vec4 iPos; attribute vec4 iCol;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec4 mvPosition = viewMatrix * vec4(iPos.xyz + (right * position.x + up * position.y) * iPos.w, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vUv = uv; vCol = iCol;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D tPuff; uniform vec3 light;
        varying vec2 vUv; varying vec4 vCol;
        void main() {
          float a = texture2D(tPuff, vUv).a * vCol.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb * light, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  emit(pos, vel, o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      pos: pos.clone(), vel: vel.clone(), life: 0, maxLife: o.life ?? 2, size: o.size ?? 1, grow: o.grow ?? 1,
      color: o.color ?? new THREE.Color(0.6, 0.6, 0.6), alpha: o.alpha ?? 0.5, drag: o.drag ?? 0.5, rise: o.rise ?? 0,
    });
  }

  update(dt) {
    const P = this.aPos.array, C = this.aCol.array;
    let k = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life += dt;
      if (q.life >= q.maxLife) { this.p.splice(i, 1); continue; }
      q.vel.multiplyScalar(Math.exp(-q.drag * dt));
      q.vel.y += q.rise * dt;
      q.pos.addScaledVector(q.vel, dt);
      const t = q.life / q.maxLife;
      const fade = Math.min(1, q.life * 8) * (1 - t) * (1 - t);
      P[k * 4] = q.pos.x; P[k * 4 + 1] = q.pos.y; P[k * 4 + 2] = q.pos.z; P[k * 4 + 3] = q.size * (1 + q.grow * t);
      C[k * 4] = q.color.r; C[k * 4 + 1] = q.color.g; C[k * 4 + 2] = q.color.b; C[k * 4 + 3] = q.alpha * fade;
      k++;
    }
    this.mesh.geometry.instanceCount = k;
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
  }

  clear() { this.p.length = 0; }
}

// ---------- Traînée en ruban (tourbillons de bout d'aile) ----------
class Ribbon {
  constructor(len = 80) {
    this.len = len;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(len * 2 * 3);
    this.alpha = new Float32Array(len * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < len - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { light: { value: new THREE.Color(1, 1, 1) } }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        attribute float alpha; varying float vA;
        void main() { vA = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 light; varying float vA;
        void main() { gl_FragColor = vec4(light, vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  push(p, strength) {
    this.pts.unshift({ p: p.clone(), s: strength, age: 0 });
    if (this.pts.length > this.len) this.pts.pop();
  }

  update(dt, camPos) {
    const n = this.pts.length;
    for (const q of this.pts) q.age += dt;
    for (let i = 0; i < this.len; i++) {
      const q = this.pts[Math.min(i, n - 1)];
      if (!q) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const nx = this.pts[Math.min(i + 1, n - 1)];
      // largeur orientée face caméra
      _v.copy(nx.p).sub(q.p);
      if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1);
      _w.copy(camPos).sub(q.p).cross(_v).normalize().multiplyScalar(0.25 + q.age * 0.6);
      this.pos.set([q.p.x + _w.x, q.p.y + _w.y, q.p.z + _w.z, q.p.x - _w.x, q.p.y - _w.y, q.p.z - _w.z], i * 6);
      const a = i < n ? q.s * Math.max(0, 1 - q.age / 3) * 0.55 : 0;
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

// ---------- Pluie : traits autour de la caméra, entièrement animés dans le shader ----------
function makeRain(count = 6000) {
  const pos = new Float32Array(count * 2 * 3), end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2] = 0; end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('isEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      box: { value: 70 }, time: { value: 0 }, rel: { value: new THREE.Vector3() }, amount: { value: 0 }, light: { value: new THREE.Color(0.7, 0.75, 0.8) },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute float isEnd; uniform float box; uniform float time; uniform vec3 rel; uniform float amount;
      varying float vA;
      void main() {
        // chaque goutte tombe dans une boîte qui suit la caméra (enroulement)
        vec3 p = position * box + rel * time;
        p = mod(p, box) - box * 0.5;
        vec3 wp = cameraPosition + p - rel * 0.045 * isEnd;
        vA = amount * step(fract(position.x * 37.0), amount) * (0.25 + 0.35 * isEnd) * (1.0 - smoothstep(box * 0.3, box * 0.5, length(p))) * smoothstep(1.0, 3.0, length(p));
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 light; varying float vA;
      void main() { gl_FragColor = vec4(light, vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  return lines;
}

// ---------- Éclair ----------
function makeBolt() {
  const pts = [];
  let x = 0, z = 0;
  for (let y = 1; y >= 0; y -= 0.05) {
    pts.push(new THREE.Vector3(x, y, z));
    x += (Math.random() - 0.5) * 0.12; z += (Math.random() - 0.5) * 0.12;
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.004, 4, false);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.85, 1).multiplyScalar(30), fog: false }));
  m.visible = false;
  return m;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new ParticlePool(1500, false);
    this.fire = new ParticlePool(400, true);
    this.ribbons = [new Ribbon(), new Ribbon()];
    this.rain = makeRain();
    this.bolt = makeBolt();
    scene.add(this.smoke.mesh, this.fire.mesh, this.rain, this.bolt, ...this.ribbons.map((r) => r.mesh));
    this.wasOnGround = true;
    this.wasEngine = false;
    this.wasCrashed = false;
    this.lastVy = 0;
    this.acc = { exhaust: 0, dust: 0, crash: 0 };
    this.crashPos = new THREE.Vector3();
    this.crashTime = 0;
    this.flash = 0;
    this.nextBolt = 8;
    this.events = []; // { type: 'touchdown' | 'thunder' | 'crash' | 'engineStart', ... } pour le son et la caméra
  }

  world(mesh, local, out) { return out.copy(local).applyQuaternion(mesh.quaternion).add(mesh.position); }

  // ctx : { camera, weather, cfg, light (couleur ambiante des particules), dt }
  update(dt, plane, mesh, ctx) {
    this.events.length = 0;
    const cfg = ctx.cfg;
    const dens = ctx.density;
    const u = mesh.userData;
    const light = ctx.light;
    this.smoke.mat.uniforms.light.value.copy(light);
    for (const r of this.ribbons) r.mesh.material.uniforms.light.value.copy(light).multiplyScalar(1.2);

    // toucher des roues : vitesse verticale juste avant le contact
    if (!this.wasOnGround && plane.onGround && !plane.crashed) {
      const vs = -this.lastVy;
      this.events.push({ type: 'touchdown', strength: Math.min(1.5, vs / 3) });
      if (cfg.particles) for (const w of u.wheels.slice(0, 2)) {
        this.world(mesh, w, _v);
        for (let i = 0; i < 6 * dens; i++) this.smoke.emit(_v, _w.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2).addScaledVector(plane.velocity, 0.2), { life: 2.2, size: 1.2, grow: 3, color: new THREE.Color(0.85, 0.85, 0.85), alpha: 0.45 + vs * 0.1, drag: 1.5 });
      }
    }
    this.wasOnGround = plane.onGround;
    this.lastVy = plane.velocity.y;

    if (cfg.particles && !plane.crashed) {
      // démarrage du moteur : bouffée de fumée et petite flamme à l'échappement
      if (plane.engineOn && !this.wasEngine) {
        this.world(mesh, u.exhaust, _v);
        for (let i = 0; i < 14; i++) this.smoke.emit(_v, _w.set((Math.random() - 0.5), -0.5 - Math.random(), 1 + Math.random()).applyQuaternion(mesh.quaternion), { life: 2.5, size: 0.5, grow: 4, color: new THREE.Color(0.25, 0.25, 0.27), alpha: 0.6, drag: 1.2, rise: 0.4 });
        for (let i = 0; i < 6; i++) this.fire.emit(_v, _w.set((Math.random() - 0.5) * 0.5, -0.5, 1.5).applyQuaternion(mesh.quaternion), { life: 0.18, size: 0.35, grow: 1, color: new THREE.Color(1, 0.55, 0.15).multiplyScalar(3), alpha: 1, drag: 4 });
        this.events.push({ type: 'engineStart' });
      }
      // fumée d'échappement légère
      if (plane.engineOn) {
        this.acc.exhaust += dt * (4 + plane.rpm * 10) * dens;
        while (this.acc.exhaust > 1) {
          this.acc.exhaust--;
          this.world(mesh, u.exhaust, _v);
          _w.set((Math.random() - 0.5) * 0.3, -0.3, 2).applyQuaternion(mesh.quaternion).addScaledVector(plane.velocity, 0.92);
          this.smoke.emit(_v, _w, { life: 1.4, size: 0.25, grow: 3, color: new THREE.Color(0.55, 0.57, 0.62), alpha: 0.1 + (1 - plane.rpm) * 0.08, drag: 0.8, rise: 0.3 });
        }
      }
      // fumigène de voltige (touche N), couleur choisie au hangar
      if (plane.smokeOn && !plane.onGround && !plane.crashed) {
        this.acc.smokeTrail = (this.acc.smokeTrail || 0) + dt * 55;
        while (this.acc.smokeTrail > 1) {
          this.acc.smokeTrail--;
          this.world(mesh, u.exhaust, _v);
          _v.addScaledVector(plane.velocity, -Math.random() * dt);
          _w.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0).addScaledVector(plane.velocity, 0.15);
          this.smoke.emit(_v, _w, { life: 9, size: 1.1, grow: 5, color: plane.smokeColor || new THREE.Color(1, 1, 1), alpha: 0.75, drag: 1.2, rise: 0.15 });
        }
      }
      // poussière au roulage (beaucoup plus sur l'herbe et la terre) et souffle de l'hélice
      const wet = plane.onWater; // hydravion sur l'eau : gerbes d'écume au lieu de poussière
      if (plane.onGround && (wet ? plane.speed > 3 : plane.speed > 4 || plane.rpm > 0.5)) {
        const a = onRunway(plane.pos.x, plane.pos.z);
        const paved = a && a.surface !== 'grass';
        const rate = (wet ? 26 : paved ? 3 : 14) * Math.min(1, plane.speed / (wet ? 15 : 25) + (wet ? 0 : plane.rpm * 0.4)) * dens;
        this.acc.dust += dt * rate;
        while (this.acc.dust > 1) {
          this.acc.dust--;
          const w = u.wheels[Math.random() < 0.5 ? 0 : 1];
          this.world(mesh, w, _v);
          _v.y = wet ? 0.15 : groundHeight(_v.x, _v.z) + 0.3;
          if (wet) {
            _w.set((Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 4).addScaledVector(plane.velocity, 0.15);
            this.smoke.emit(_v, _w, { life: 1.6, size: 1.0, grow: 3, color: new THREE.Color(0.92, 0.95, 0.97), alpha: 0.45, drag: 1.2, rise: -2.5 });
            continue;
          }
          _w.set((Math.random() - 0.5) * 3, Math.random() * 1.2, (Math.random() - 0.5) * 3).addScaledVector(plane.velocity, 0.3);
          const c = paved ? new THREE.Color(0.62, 0.6, 0.57) : new THREE.Color(0.55, 0.45, 0.32);
          this.smoke.emit(_v, _w, { life: 2.6, size: 1.4, grow: 4, color: c, alpha: paved ? 0.12 : 0.3, drag: 1.4, rise: 0.15 });
        }
      }
      // tourbillons de condensation : forts facteurs de charge, air humide, grande vitesse
      const humid = ctx.weather.rain > 0.1 || ctx.weather.haze > 0.001 ? 1 : ctx.weather.stratus > 0.5 ? 0.6 : 0.25;
      const s = Math.max(0, Math.min(1, (Math.abs(plane.gLoad) - 1.6) / 1.5)) * humid + (plane.ias > 70 ? (plane.ias - 70) / 20 * humid * 0.4 : 0);
      for (let i = 0; i < 2; i++) this.ribbons[i].push(this.world(mesh, u.wingtips[i], _v), plane.onGround ? 0 : Math.min(1, s));
    }
    this.wasEngine = plane.engineOn;

    // crash : boule de feu et fumée noire pendant quelques secondes
    if (plane.crashed && !this.wasCrashed) {
      this.crashPos.copy(plane.pos);
      this.crashTime = 0;
      this.events.push({ type: 'crash' });
      const water = groundHeight(plane.pos.x, plane.pos.z) < 0;
      for (let i = 0; i < 40 * dens; i++) {
        _w.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(14);
        if (water) this.smoke.emit(plane.pos, _w, { life: 2, size: 2, grow: 3, color: new THREE.Color(0.9, 0.95, 1), alpha: 0.6, drag: 1, rise: -6 });
        else this.fire.emit(plane.pos, _w, { life: 0.9, size: 3, grow: 2, color: new THREE.Color(1, 0.45, 0.1).multiplyScalar(4), alpha: 1, drag: 2, rise: 3 });
      }
    }
    if (plane.crashed && cfg.particles) {
      this.crashTime += dt;
      if (this.crashTime < 30) {
        this.acc.crash += dt * 12 * dens;
        while (this.acc.crash > 1) {
          this.acc.crash--;
          _w.set((Math.random() - 0.5) * 2, 4 + Math.random() * 3, (Math.random() - 0.5) * 2);
          this.smoke.emit(this.crashPos, _w, { life: 6, size: 3, grow: 6, color: new THREE.Color(0.1, 0.1, 0.1), alpha: 0.55, drag: 0.3, rise: 0.8 });
          if (this.crashTime < 12 && Math.random() < 0.5) this.fire.emit(this.crashPos, _w.multiplyScalar(0.5), { life: 0.7, size: 2, grow: 0.5, color: new THREE.Color(1, 0.5, 0.15).multiplyScalar(3), alpha: 0.9, drag: 1, rise: 2 });
        }
      }
    }
    this.wasCrashed = plane.crashed;
    if (!plane.crashed && this.crashTime) { this.crashTime = 0; this.smoke.clear(); this.fire.clear(); }

    this.smoke.update(dt);
    this.fire.update(dt);
    for (const r of this.ribbons) r.update(dt, ctx.camera.position);

    // pluie : vitesse des gouttes vue depuis l'avion (traits inclinés en vol)
    const w = ctx.weather;
    const ru = this.rain.material.uniforms;
    ru.amount.value = Math.min(1, w.rain);
    this.rain.visible = w.rain > 0.02;
    ru.time.value += dt;
    ru.time.value %= 1000;
    ru.rel.value.set(0, -9, 0).sub(_v.copy(plane.velocity).multiplyScalar(0.6));
    ru.light.value.copy(light).multiplyScalar(0.9);

    // orage : éclairs au loin, puis tonnerre (le son arrive plus tard)
    this.flash *= Math.exp(-dt * 9);
    this.bolt.visible = this.flash > 0.25;
    if (w.storm > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 14;
        const a = Math.random() * Math.PI * 2, d = 2500 + Math.random() * 8000;
        const x = ctx.camera.position.x + Math.cos(a) * d, z = ctx.camera.position.z + Math.sin(a) * d;
        const gy = Math.max(0, groundHeight(x, z));
        this.bolt.position.set(x, gy, z);
        this.bolt.scale.set(2200, 2400 - gy * 0.3, 2200);
        this.bolt.rotation.y = Math.random() * 6.28;
        this.flash = 1;
        this.events.push({ type: 'thunder', delay: d / 340, strength: 1 - d / 12000 });
      }
    }
    return this.events;
  }
}
