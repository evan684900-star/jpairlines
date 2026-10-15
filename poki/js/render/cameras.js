import { tr } from '../i18n.js';
// Caméras : poursuite, cockpit, orbite libre, spectateur (au bord de la trajectoire).
// Transitions fluides entre les vues et tremblements (désactivables, et coupés si le système
// demande moins d'animations).
import * as THREE from 'three';
import { groundHeight } from '../world.js';
import { setCockpitView } from '../planeModel.js';

export const CAMERA_MODES = [
  { id: 'chase', name: tr('Poursuite', 'Chase') },
  { id: 'cockpit', name: 'Cockpit' },
  { id: 'orbit', name: tr('Orbite libre', 'Free orbit') },
  { id: 'spectator', name: tr('Spectateur', 'Spectator') },
];

const TRANSITION = 0.75; // s
const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.09);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
const ease = (t) => t * t * (3 - 2 * t);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.prevMode = 0;
    this.blend = 1;
    this.dist = 19;
    this.orbit = { yaw: 0, pitch: 0, dragging: false };
    this.chaseQuat = new THREE.Quaternion();
    this.free = { yaw: 0.6, pitch: 0.25 };
    this.spot = new THREE.Vector3(); // position du spectateur
    this.spotTimer = 0;
    this.poses = [0, 1, 2, 3].map(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() }));
    this.shakeT = 0;
    this.impulse = 0;
    this.fov = 65;
  }

  get modeName() { return CAMERA_MODES[this.mode].name; }

  next() {
    this.prevMode = this.mode;
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    this.blend = 0;
    if (CAMERA_MODES[this.mode].id === 'spectator') this.spotTimer = 0;
  }

  reset(plane) {
    this.chaseQuat.copy(plane.quat);
    this.spotTimer = 0;
  }

  // secousse ponctuelle (toucher des roues, crash)
  kick(amount) { this.impulse = Math.min(1.5, this.impulse + amount); }

  pose(id, out, plane, mesh, dt) {
    const o = this.orbit;
    _q2.setFromEuler(_e.set(-o.pitch, o.yaw, 0, 'YXZ'));
    if (id === 'chase') {
      _q.copy(this.chaseQuat).multiply(_q2);
      out.pos.set(0, this.dist * 0.24, this.dist).applyQuaternion(_q).add(plane.pos);
      out.quat.copy(_q).multiply(tilt);
    } else if (id === 'cockpit') {
      out.pos.copy(mesh.userData.eye).applyQuaternion(plane.quat).add(plane.pos);
      out.quat.copy(plane.quat).multiply(_q2);
    } else if (id === 'orbit') {
      // orbite libre : indépendante de l'attitude de l'avion (cliquer-glisser pour tourner)
      const yaw = this.free.yaw + o.yaw, pitch = THREE.MathUtils.clamp(this.free.pitch + o.pitch, -0.5, 1.4);
      out.pos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(this.dist * 1.3).add(plane.pos);
      _m.lookAt(out.pos, plane.pos, THREE.Object3D.DEFAULT_UP);
      out.quat.setFromRotationMatrix(_m);
    } else {
      // spectateur : posé à côté de la trajectoire, l'avion passe devant puis on se replace
      this.spotTimer -= dt;
      const far = this.spot.distanceTo(plane.pos);
      if (this.spotTimer <= 0 || far > 900) {
        const fwd = _v.copy(plane.velocity).setY(0);
        if (fwd.lengthSq() < 1) fwd.set(0, 0, -1).applyQuaternion(plane.quat).setY(0);
        fwd.normalize();
        const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const ahead = THREE.MathUtils.clamp(plane.speed * 6, 30, 400);
        this.spot.copy(plane.pos).addScaledVector(fwd, ahead).addScaledVector(side, 25 + plane.speed * 0.6);
        this.spot.y = Math.max(plane.pos.y - 15, groundHeight(this.spot.x, this.spot.z) + 2);
        this.spotTimer = 14;
      }
      out.pos.copy(this.spot);
      _m.lookAt(out.pos, plane.pos, THREE.Object3D.DEFAULT_UP);
      out.quat.setFromRotationMatrix(_m);
    }
  }

  // fx : { shake 0..1 (vibrations), motion (effets autorisés) }
  update(dt, plane, mesh, fx = {}) {
    const o = this.orbit;
    if (!o.dragging) {
      o.yaw *= Math.exp(-dt * 1.5);
      o.pitch *= Math.exp(-dt * 1.5);
      if (CAMERA_MODES[this.mode].id === 'orbit') this.free.yaw += dt * 0.05; // lente rotation automatique
    }
    this.chaseQuat.slerp(plane.quat, 1 - Math.exp(-dt * 4));
    const id = CAMERA_MODES[this.mode].id;
    const cur = this.poses[this.mode];
    this.pose(id, cur, plane, mesh, dt);
    const cam = this.camera;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / TRANSITION);
      const prev = this.poses[this.prevMode];
      this.pose(CAMERA_MODES[this.prevMode].id, prev, plane, mesh, 0);
      const t = ease(this.blend);
      cam.position.lerpVectors(prev.pos, cur.pos, t);
      cam.quaternion.slerpQuaternions(prev.quat, cur.quat, t);
    } else {
      cam.position.copy(cur.pos);
      cam.quaternion.copy(cur.quat);
    }
    // vue intérieure seulement une fois la transition presque finie
    const inside = id === 'cockpit' && this.blend > 0.85 && !plane.crashed;
    setCockpitView(mesh, inside);
    cam.near = inside ? 0.15 : 0.5;
    // tremblements : moteur, roulage, décrochage, vitesse, impacts
    this.impulse *= Math.exp(-dt * 5);
    if (fx.motion) {
      this.shakeT += dt;
      const a = (fx.shake || 0) * (inside ? 1 : 0.6) + this.impulse;
      if (a > 0.001) {
        const t = this.shakeT;
        const n = (f, p) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.31 + p * 1.7) * 0.4;
        _q.setFromEuler(_e.set(n(31, 0) * 0.004 * a, n(27, 2) * 0.004 * a, n(23, 4) * 0.003 * a));
        cam.quaternion.multiply(_q);
        cam.position.y += n(37, 1) * 0.03 * a;
      }
    }
    // jamais sous le sol
    const g = Math.max(0, groundHeight(cam.position.x, cam.position.z)) + (inside ? 0.3 : 1.5);
    if (cam.position.y < g) cam.position.y = g;
    cam.updateProjectionMatrix();
    return inside;
  }
}
