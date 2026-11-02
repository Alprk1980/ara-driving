// What runs the junctions, as the driver sees it: signal heads on the near-side kerb at each stop line, and Belisha beacons
// on striped poles at each end of a zebra. Each approach also gets a secondary head: in the UK it stands beyond the
// junction (TSRGD 2002 reg. 43, gov.uk Know your traffic signs), where a driver stopped at the line, with the primary
// beside them, can still see it. Neither source fixes the side. The far offside corner of this town's wide junctions falls
// behind a right-hand-drive car's windscreen pillar, so it goes on the far nearside corner, on that corner's pole.
// A beacon must flash by law (TSRGD 2016 Schedule 14) but the rate isn't given; 40 a minute is one maker's figure, so take
// it as an example, and a pelican's flashing amber and green man use the same beat. Pelicans and puffins have a pole on
// each kerb, each with a head for both directions of traffic, back to back, and a red and green man facing across.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { signalFor, walkFor } from '../sim/signals.ts';
import { STOP_LINE_M } from '../sim/signals.ts';
import { ROAD_W, type Town, type Zebra } from '../sim/town.ts';
import type { CrossingLight } from '../sim/crossings.ts';

const BEACON_PER_MIN = 40, KERB_OUT = 0.5, REFRESH_S = 0.2, BACK_TO_BACK_M = 0.22; // the secondary head sits just behind the primary
const LIT: Record<string, string> = { red: '#ff2b1c', amber: '#ffb01f', green: '#28e06a' }, DIM: Record<string, string> = { red: '#3d1612', amber: '#3d2f12', green: '#123d24' };

type Head = { node: number; edge: number };

export class RoadControl {
  private heads: Head[] = [];
  private bulbs: THREE.InstancedMesh;
  private globes: THREE.InstancedMesh;
  private crossBulbs: THREE.InstancedMesh;
  private signalled: Zebra[] = [];
  private clock = 0;
  private flash = 0;
  private town: Town;

  constructor(scene: THREE.Scene, town: Town) {
    this.town = town;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const places: { x: number; z: number; heading: number }[] = [], backs: { x: number; z: number; heading: number }[] = [], seconds: Head[] = [];
    for (const [node] of town.signals) {
      const n = town.nodes[node], arms = town.adj[node].map((w) => { const o = town.nodes[w.to], len = town.edges[w.edge].len; return { edge: w.edge, dx: (n.x - o.x) / len, dz: (n.z - o.z) / len }; }); // d: travelling toward the junction
      const poles = arms.map((a) => ({ x: n.x - a.dx * STOP_LINE_M + a.dz * (ROAD_W / 2 + KERB_OUT), z: n.z - a.dz * STOP_LINE_M - a.dx * (ROAD_W / 2 + KERB_OUT) }));
      arms.forEach((a, i) => {
        this.heads.push({ node, edge: a.edge });
        places.push({ ...poles[i], heading: Math.atan2(-a.dx, -a.dz) });
        // The secondary: on the pole ahead and to the left across the junction, back to back with that pole's own head.
        const far = poles.find((q) => (q.x - n.x) * a.dx + (q.z - n.z) * a.dz > 0 && (q.x - n.x) * a.dz - (q.z - n.z) * a.dx > 0);
        if (!far) return;
        backs.push({ x: far.x + a.dx * BACK_TO_BACK_M, z: far.z + a.dz * BACK_TO_BACK_M, heading: Math.atan2(-a.dx, -a.dz) });
        seconds.push({ node, edge: a.edge });
      });
    }
    const all = [...places, ...backs];
    this.heads.push(...seconds); // in the same order as all: primaries, then secondaries
    const dark = new THREE.MeshLambertMaterial({ color: '#23262c' });
    const post = mergeGeometries([new THREE.CylinderGeometry(0.06, 0.07, 2.9, 8).translate(0, 1.45, 0), new THREE.BoxGeometry(0.34, 0.98, 0.22).translate(0, 2.75, 0), new THREE.BoxGeometry(0.24, 0.3, 0.14).translate(0, 1.9, 0)])!;
    const posts = new THREE.InstancedMesh(post, dark, Math.max(1, places.length));
    const backHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.98, 0.22).translate(0, 2.75, 0), dark, Math.max(1, backs.length));
    backs.forEach((h, i) => backHeads.setMatrixAt(i, m.compose(p.set(h.x, 0, h.z), q.setFromAxisAngle(up, h.heading), one)));
    this.bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, all.length * 4)); // three for traffic and one for people
    all.forEach((h, i) => {
      q.setFromAxisAngle(up, h.heading);
      if (i < places.length) posts.setMatrixAt(i, m.compose(p.set(h.x, 0, h.z), q, one));
      for (let k = 0; k < 3; k++) {
        p.set(0, 3.05 - k * 0.3, 0.12).applyQuaternion(q).add(new THREE.Vector3(h.x, 0, h.z));
        this.bulbs.setMatrixAt(i * 4 + k, m.compose(p, q, one));
        this.bulbs.setColorAt(i * 4 + k, new THREE.Color('#222222'));
      }
      p.set(0, 1.9, 0.09).applyQuaternion(q).add(new THREE.Vector3(h.x, 0, h.z));
      this.bulbs.setMatrixAt(i * 4 + 3, i < places.length ? m.compose(p, q, one) : m.makeScale(0, 0, 0)); // the push-button box is on the primary only
      this.bulbs.setColorAt(i * 4 + 3, new THREE.Color('#222222'));
    });
    posts.frustumCulled = backHeads.frustumCulled = this.bulbs.frustumCulled = false;
    scene.add(posts, backHeads, this.bulbs);

    // Pelicans and puffins: per kerb, a pole, a head facing each way along the road, and a man facing across it.
    const signalled = town.zebras.filter((z) => z.kind !== 'zebra'), crossPosts: THREE.Matrix4[] = [], crossHeads: THREE.Matrix4[] = [], crossBulbs: THREE.Matrix4[] = [];
    for (const z of signalled) for (const s of [1, -1]) {
      const kerb = new THREE.Vector3(z.x - z.uz * s * (ROAD_W / 2 + KERB_OUT), 0, z.z + z.ux * s * (ROAD_W / 2 + KERB_OUT));
      crossPosts.push(new THREE.Matrix4().makeTranslation(kerb.x, 0, kerb.z));
      for (const way of [1, -1]) { // the head that drivers going this way along the road see
        const face = new THREE.Vector3(-z.ux * way, 0, -z.uz * way), q2 = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(face.x, face.z));
        crossHeads.push(new THREE.Matrix4().compose(kerb.clone().addScaledVector(face, 0.11), q2, one));
        for (let k = 0; k < 3; k++) crossBulbs.push(new THREE.Matrix4().compose(kerb.clone().addScaledVector(face, 0.23).setY(3.05 - k * 0.3), q2, one));
      }
      const across = new THREE.Vector3(z.uz * s, 0, -z.ux * s); // toward the far kerb, where the people who need it stand
      crossBulbs.push(new THREE.Matrix4().compose(kerb.clone().addScaledVector(across, 0.08).setY(2.1), new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(across.x, across.z)), one));
    }
    this.signalled = signalled;
    const cpost = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 3.3, 8).translate(0, 1.65, 0), dark, Math.max(1, crossPosts.length));
    const chead = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.98, 0.22).translate(0, 2.75, 0), dark, Math.max(1, crossHeads.length));
    this.crossBulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, crossBulbs.length));
    crossPosts.forEach((mx, i) => cpost.setMatrixAt(i, mx));
    crossHeads.forEach((mx, i) => chead.setMatrixAt(i, mx));
    crossBulbs.forEach((mx, i) => { this.crossBulbs.setMatrixAt(i, mx); this.crossBulbs.setColorAt(i, new THREE.Color('#222222')); });
    cpost.frustumCulled = chead.frustumCulled = this.crossBulbs.frustumCulled = false;
    scene.add(cpost, chead, this.crossBulbs);

    const ends = town.zebras.filter((z) => z.kind === 'zebra').flatMap((z) => [1, -1].map((s) => ({ x: z.x - z.uz * s * (ROAD_W / 2 + KERB_OUT), z: z.z + z.ux * s * (ROAD_W / 2 + KERB_OUT) })));
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

  draw(dt: number, time: number, lights?: ReadonlyMap<Zebra, CrossingLight>) {
    const c = new THREE.Color();
    this.flash += dt;
    const on = (this.flash * BEACON_PER_MIN) / 60 % 1 < 0.5;
    for (let i = 0; i < this.globes.count; i++) this.globes.setColorAt(i, c.set(on ? '#ffc23a' : '#7a5a24'));
    this.globes.instanceColor!.needsUpdate = true;
    // Each crossing: two poles, each two heads of three bulbs and a man, so seven bulbs a pole.
    this.signalled.forEach((z, n) => {
      const light = lights?.get(z), a = light?.traffic ?? 'green', man = light?.man ?? 'red';
      for (let pole = 0; pole < 2; pole++) {
        const at = (n * 2 + pole) * 7;
        for (let head = 0; head < 2; head++) {
          this.crossBulbs.setColorAt(at + head * 3, c.set(a === 'red' || a === 'redAmber' ? LIT.red : DIM.red));
          this.crossBulbs.setColorAt(at + head * 3 + 1, c.set(a === 'amber' || a === 'redAmber' || (a === 'flashingAmber' && on) ? LIT.amber : DIM.amber));
          this.crossBulbs.setColorAt(at + head * 3 + 2, c.set(a === 'green' ? LIT.green : DIM.green));
        }
        this.crossBulbs.setColorAt(at + 6, c.set(man === 'green' || (man === 'flashing' && on) ? LIT.green : man === 'flashing' ? DIM.green : LIT.red));
      }
    });
    if (this.crossBulbs.instanceColor) this.crossBulbs.instanceColor.needsUpdate = true;
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
