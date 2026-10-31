// Crash shavings: one fixed pool of boxes thrown off an impact, bouncing off buildings and shrinking away.
// No allocations during a drive, the same way fx.ts does its pools.
import * as THREE from 'three';
import type { Town } from '../sim/town.ts';

const CHUNKS = 56, GRAVITY = -9.8, FADE_S = 0.6;

type Chunk = { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; w: number; h: number; l: number; life: number; spin: number };

export class Debris {
  private mesh: THREE.InstancedMesh;
  private pool: Chunk[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), CHUNKS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < CHUNKS; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.col.set('#ffffff'));
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, w: 0, h: 0, l: 0, life: 0, spin: 0 });
    }
    scene.add(this.mesh);
  }

  /** Shards thrown off a crash: away from the wall, up, and tumbling. */
  burst(x: number, z: number, nx: number, nz: number, power: number, paint: string) {
    const n = Math.min(12, 4 + Math.floor(power / 4));
    for (let i = 0; i < n; i++) {
      const c = this.pool[this.next];
      const a = Math.atan2(nx, nz) + (Math.random() - 0.5) * 1.7, lob = 2 + Math.random() * Math.min(9, power * 0.5);
      Object.assign(c, {
        x, y: 0.35 + Math.random() * 0.7, z,
        vx: Math.sin(a) * lob, vy: 2 + Math.random() * 4, vz: Math.cos(a) * lob,
        rx: Math.random() * 7, ry: Math.random() * 7, rz: Math.random() * 7,
        w: 0.1 + Math.random() * 0.22, h: 0.06 + Math.random() * 0.12, l: 0.1 + Math.random() * 0.22,
        life: 1.6 + Math.random() * 1.2, spin: 2 + Math.random() * 6,
      });
      this.mesh.setColorAt(this.next, this.col.set(i % 3 === 0 ? '#2b2f3a' : paint));
      this.next = (this.next + 1) % CHUNKS;
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  step(dt: number, town: Town) {
    this.pool.forEach((c, i) => {
      if (c.life <= 0) return;
      c.life -= dt;
      if (c.life <= 0) return this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      const px = c.x, pz = c.z;
      c.vy += GRAVITY * dt;
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.y += c.vy * dt;
      const box = town.boxAt(c.x, c.z, 0.08);
      if (box) {
        // bounce back out of the face it crossed, judged by which one it went deeper past
        if (Math.abs(c.x - box.x) - box.hx > Math.abs(c.z - box.z) - box.hz) { c.vx *= -0.45; c.x = px; }
        else { c.vz *= -0.45; c.z = pz; }
      }
      if (c.y < c.h / 2) {
        c.y = c.h / 2;
        if (c.vy < 0) c.vy *= -0.3;
        c.vx *= 0.7; c.vz *= 0.7; c.spin *= 0.6;
      }
      c.rx += c.spin * 1.3 * dt; c.ry += c.spin * dt; c.rz += c.spin * 0.7 * dt;
      const k = Math.min(1, c.life / FADE_S); // shrink away at the end instead of blinking out
      this.q.setFromEuler(this.e.set(c.rx, c.ry, c.rz));
      this.mesh.setMatrixAt(i, this.m.compose(this.v.set(c.x, c.y, c.z), this.q, this.s.set(c.w * k, c.h * k, c.l * k)));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
