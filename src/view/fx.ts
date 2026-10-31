// Short-lived effects: skid marks, dust, tyre smoke, crash sparks and rain. Each is a fixed pool of instances,
// so an effect never allocates during a drive.
import * as THREE from 'three';

const SKIDS = 400, PUFFS = 90, DROPS = 180, DROP_BOX = 40, DROP_CLEAR = 5;
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

type Puff = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number };

export class Fx {
  private skids: THREE.InstancedMesh;
  private puffs: THREE.InstancedMesh;
  private drops: THREE.InstancedMesh;
  private pool: Puff[] = [];
  private nextSkid = 0;
  private nextPuff = 0;
  private dropAt: { x: number; y: number; z: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const strip = new THREE.PlaneGeometry(1, 1);
    strip.rotateX(-Math.PI / 2);
    this.skids = new THREE.InstancedMesh(strip, new THREE.MeshBasicMaterial({ color: '#23262e', transparent: true, opacity: 0.5, depthWrite: false }), SKIDS);
    this.skids.frustumCulled = false;
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), PUFFS);
    this.puffs.frustumCulled = false;
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.9, 0.018), new THREE.MeshBasicMaterial({ color: '#d6e6f5', transparent: true, opacity: 0.45, depthWrite: false }), DROPS);
    this.drops.frustumCulled = false;
    for (let i = 0; i < SKIDS; i++) this.skids.setMatrixAt(i, hidden);
    for (let i = 0; i < PUFFS; i++) {
      this.puffs.setMatrixAt(i, hidden);
      this.puffs.setColorAt(i, this.col.set('#ffffff'));
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, grow: 0 });
    }
    for (let i = 0; i < DROPS; i++) this.dropAt.push({ x: Math.random() * DROP_BOX, y: Math.random() * 22, z: Math.random() * DROP_BOX });
    this.drops.visible = false;
    scene.add(this.skids, this.puffs, this.drops);
  }

  /** One strip of rubber between two road points. */
  skid(ax: number, az: number, bx: number, bz: number) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05 || len > 3) return;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(ax - bx, az - bz) + Math.PI / 2);
    this.m.compose(this.v.set((ax + bx) / 2, 0.06, (az + bz) / 2), this.q, this.s.set(len, 1, 0.24));
    this.skids.setMatrixAt(this.nextSkid, this.m);
    this.nextSkid = (this.nextSkid + 1) % SKIDS;
    this.skids.instanceMatrix.needsUpdate = true;
  }

  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, color: string) {
    const i = this.nextPuff;
    Object.assign(this.pool[i], { x, y, z, vx, vy, vz, life, max: life, size, grow });
    this.puffs.setColorAt(i, this.col.set(color));
    this.puffs.instanceColor!.needsUpdate = true;
    this.nextPuff = (i + 1) % PUFFS;
  }

  sparks(x: number, z: number, power: number) {
    const count = Math.min(14, 5 + Math.floor(power));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 7, s = 3 + Math.random() * power * 0.7;
      this.puff(x, 0.7, z, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 0.35 + Math.random() * 0.25, 0.09, -0.1, i % 2 ? '#ffd23e' : '#ff8a2b');
    }
  }

  step(dt: number) {
    this.pool.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt;
      if (p.life <= 0) return this.puffs.setMatrixAt(i, hidden);
      p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97; p.vy -= p.grow < 0 ? 12 * dt : 0;
      p.size = Math.max(0.01, p.size + p.grow * dt);
      const k = p.size * (0.4 + (0.6 * p.life) / p.max);
      this.puffs.setMatrixAt(i, this.m.makeScale(k, k, k).setPosition(p.x, p.y, p.z));
    });
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  /** Falling rain in a box that travels with the camera, wrapped so the drops never run out. */
  rain(strength: number, at: THREE.Vector3, dt: number) {
    this.drops.visible = strength > 0.02;
    if (!this.drops.visible) return;
    this.drops.count = Math.floor(DROPS * strength);
    this.dropAt.forEach((d, i) => {
      d.y -= 34 * dt;
      if (d.y < 0) d.y += 22;
      const x = at.x + ((d.x - at.x) % DROP_BOX + DROP_BOX) % DROP_BOX - DROP_BOX / 2;
      const z = at.z + ((d.z - at.z) % DROP_BOX + DROP_BOX) % DROP_BOX - DROP_BOX / 2;
      const clear = Math.hypot(x - at.x, z - at.z) < DROP_CLEAR; // a drop on the lens would read as a pole
      this.drops.setMatrixAt(i, clear ? hidden : this.m.makeTranslation(x, d.y, z));
    });
    this.drops.instanceMatrix.needsUpdate = true;
  }
}
