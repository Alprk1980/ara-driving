// The canal and its basin as you see them: dark green water a little below the bank, a brick coping along the edge, a
// gravel towpath, and the narrowboats moored along it, each a black hull under a painted cabin with a cream roof edge.
import * as THREE from 'three';
import { BASIN, BOAT_W, CANAL, moorings, TOWPATH, WATER, type Rect } from '../sim/waterside.ts';

const WATER_C = '#3f5f52', COPING = '#a39c90', PATH = '#b9a98a', HULL = '#1b1c1f', CREAM = '#efe3c0', WATER_Y = 0.03; // just above the ground, which would hide it lower: the coping round it stands proud as the bank

export function buildWaterside(): THREE.Group {
  const g = new THREE.Group(), flat = (r: Rect, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2), mat);
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    g.add(m);
  };
  const water = new THREE.MeshPhongMaterial({ color: WATER_C, shininess: 80, specular: '#5c7a70' }), stone = new THREE.MeshLambertMaterial({ color: COPING });
  // The water, and the coping round its edge.
  for (const r of WATER) {
    flat(r, WATER_Y, water);
    for (const [x, z, w, l] of [[r.x0, (r.z0 + r.z1) / 2, 0.5, r.z1 - r.z0], [r.x1, (r.z0 + r.z1) / 2, 0.5, r.z1 - r.z0], [(r.x0 + r.x1) / 2, r.z0, r.x1 - r.x0, 0.5], [(r.x0 + r.x1) / 2, r.z1, r.x1 - r.x0, 0.5]] as const) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, l), stone);
      c.position.set(x, 0.15, z);
      g.add(c);
    }
  }
  // The canal runs into the basin: no coping across the join.
  g.children = g.children.filter((o) => !(o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry && (Math.abs(o.position.z - CANAL.z1) < 0.1 || Math.abs(o.position.z - BASIN.z0) < 0.1)));
  for (const [x0, x1] of [[BASIN.x0, CANAL.x0], [CANAL.x1, BASIN.x1]] as const) { // the basin's near edge, either side of the canal's mouth
    const c = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, 0.5), stone);
    c.position.set((x0 + x1) / 2, 0.15, BASIN.z0);
    g.add(c);
  }
  flat(TOWPATH, 0.025, new THREE.MeshLambertMaterial({ color: PATH }));
  const hull = new THREE.MeshLambertMaterial({ color: HULL }), cream = new THREE.MeshLambertMaterial({ color: CREAM }), cabins = new Map<string, THREE.Material>();
  for (const b of moorings()) {
    const boat = new THREE.Group(), paint = cabins.get(b.livery) ?? cabins.set(b.livery, new THREE.MeshLambertMaterial({ color: b.livery })).get(b.livery)!;
    const add = (w: number, h: number, l: number, y: number, z: number, m: THREE.Material) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); p.position.set(0, y, z); p.castShadow = true; boat.add(p); };
    add(BOAT_W, 0.75, b.len, WATER_Y + 0.15, 0, hull); // the hull, about half a metre out of the water
    add(BOAT_W - 0.24, 1.05, b.len * 0.72, WATER_Y + 1.05, -b.len * 0.06, paint); // the cabin
    add(BOAT_W - 0.1, 0.08, b.len * 0.72 + 0.1, WATER_Y + 1.62, -b.len * 0.06, cream); // its roof edge
    add(0.35, 0.5, 0.35, WATER_Y + 1.9, -b.len * 0.2, hull); // a chimney for the stove
    boat.position.set(b.x, 0, b.z);
    boat.rotation.y = b.heading;
    g.add(boat);
  }
  return g;
}
