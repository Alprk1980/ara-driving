// What runs the junctions, as the driver sees it: signal heads on the near-side kerb at each stop line, and Belisha beacons
// on striped poles at each end of a zebra. A beacon must flash by law (TSRGD 2016 Schedule 14) but the rate isn't given;
// 40 a minute is one maker's figure, so take it as an example.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signalFor, walkFor } from '../sim/signals.ts';
import { STOP_LINE_M } from '../sim/signals.ts';
import { ROAD_W, type Town } from '../sim/town.ts';

const BEACON_PER_MIN = 40, KERB_OUT = 0.5, REFRESH_S = 0.2;
const LIT: Record<string, string> = { red: '#ff2b1c', amber: '#ffb01f', green: '#28e06a' }, DIM: Record<string, string> = { red: '#3d1612', amber: '#3d2f12', green: '#123d24' };

type Head = { node: number; edge: number };

export class RoadControl {
  private heads: Head[] = [];
  private bulbs: THREE.InstancedMesh;
  private globes: THREE.InstancedMesh;
  private clock = 0;
  private flash = 0;
  private town: Town;

  constructor(scene: THREE.Scene, town: Town) {
    this.town = town;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const places: { x: number; z: number; heading: number }[] = [];
    for (const [node] of town.signals) for (const w of town.adj[node]) {
      const n = town.nodes[node], o = town.nodes[w.to], e = town.edges[w.edge], dx = (n.x - o.x) / e.len, dz = (n.z - o.z) / e.len; // d: travelling toward the junction
      this.heads.push({ node, edge: w.edge });
      places.push({ x: n.x - dx * STOP_LINE_M + dz * (ROAD_W / 2 + KERB_OUT), z: n.z - dz * STOP_LINE_M - dx * (ROAD_W / 2 + KERB_OUT), heading: Math.atan2(-dx, -dz) });
    }
    const dark = new THREE.MeshLambertMaterial({ color: '#23262c' });
    const post = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.07, 2.9, 8).translate(0, 1.45, 0), new THREE.BoxGeometry(0.34, 0.98, 0.22).translate(0, 2.75, 0), new THREE.BoxGeometry(0.24, 0.3, 0.14).translate(0, 1.9, 0)])!;
    const posts = new THREE.InstancedMesh(post, dark, Math.max(1, places.length));
    this.bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, places.length * 4)); // three for traffic and one for people
    places.forEach((h, i) => {
      q.setFromAxisAngle(up, h.heading);
      posts.setMatrixAt(i, m.compose(p.set(h.x, 0, h.z), q, one));
      for (let k = 0; k < 3; k++) {
        p.set(0, 3.05 - k * 0.3, 0.12).applyQuaternion(q).add(new THREE.Vector3(h.x, 0, h.z));
        this.bulbs.setMatrixAt(i * 4 + k, m.compose(p, q, one));
        this.bulbs.setColorAt(i * 4 + k, new THREE.Color('#222222'));
      }
      p.set(0, 1.9, 0.09).applyQuaternion(q).add(new THREE.Vector3(h.x, 0, h.z));
      this.bulbs.setMatrixAt(i * 4 + 3, m.compose(p, q, one));
      this.bulbs.setColorAt(i * 4 + 3, new THREE.Color('#222222'));
    });
    posts.frustumCulled = this.bulbs.frustumCulled = false;
    scene.add(posts, this.bulbs);

    const ends = town.zebras.flatMap((z) => [1, -1].map((s) => ({ x: z.x - z.uz * s * (ROAD_W / 2 + KERB_OUT), z: z.z + z.ux * s * (ROAD_W / 2 + KERB_OUT) })));
    const stripes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) stripes.push(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).translate(0, 0.25 + i * 0.5, 0));
    const paint = (g: THREE.BufferGeometry, hex: string) => { const n = g.getAttribute('position').count, c = new THREE.Color(hex); g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3)); return g; };
    const pole = mergeGeometries(stripes.map((g, i) => paint(g, i % 2 ? '#f4f4f0' : '#17181b')))!;
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, ends.length));
    this.globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, ends.length));
    ends.forEach((b, i) => {
      poles.setMatrixAt(i, m.makeTranslation(b.x, 0, b.z));
      this.globes.setMatrixAt(i, m.makeTranslation(b.x, 2.65, b.z));
      this.globes.setColorAt(i, new THREE.Color('#d9a23a'));
    });
    poles.frustumCulled = this.globes.frustumCulled = false;
    scene.add(poles, this.globes);
  }

  draw(dt: number, time: number) {
    const c = new THREE.Color();
    this.flash += dt;
    const on = (this.flash * BEACON_PER_MIN) / 60 % 1 < 0.5;
    for (let i = 0; i < this.globes.count; i++) this.globes.setColorAt(i, c.set(on ? '#ffc23a' : '#7a5a24'));
    this.globes.instanceColor!.needsUpdate = true;
    if ((this.clock -= dt) > 0) return;
    this.clock = REFRESH_S;
    this.heads.forEach((h, i) => {
      const a = signalFor(this.town, h.node, h.edge, time);
      this.bulbs.setColorAt(i * 4, c.set(a === 'red' || a === 'redAmber' ? LIT.red : DIM.red));
      this.bulbs.setColorAt(i * 4 + 1, c.set(a === 'amber' || a === 'redAmber' ? LIT.amber : DIM.amber));
      this.bulbs.setColorAt(i * 4 + 2, c.set(a === 'green' ? LIT.green : DIM.green));
      this.bulbs.setColorAt(i * 4 + 3, c.set(walkFor(this.town, h.node, time) ? LIT.green : LIT.red)); // the green man, or the red one
    });
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
}
