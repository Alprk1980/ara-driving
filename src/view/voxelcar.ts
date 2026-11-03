// The player's car sculpted from its body profile (src/data/carprofiles.json, made by Qwen and checked by
// schemas/carprofiles.ts). The same CarRig contract as the block body in carmesh.ts: pop-off parts, spinning wheels and
// the cockpit dash all behave identically; the body is one smooth skin over the sculpt, and it bends in a crash.
import * as THREE from 'three';
import profilesJson from '../data/carprofiles.json';
import type { Design, Driver } from '../save.ts';
import type { Mark, Side } from '../sim/car.ts';
import type { Car } from '../sim/economy.ts';
import { carProfileErrors, profileVsCar, type CarBodyProfile } from '../../schemas/carprofiles.ts';
import { foldSkin, skinNormals, surfaceNet } from './carsurface.ts';
import { addLamps, box, buildCockpit, buildDriver, type Lookup } from './cockpit.ts';
import { carFittings, carVoxels, GLASS, HEAD, TAIL } from './voxels.ts';
import { DEFAULT_PAINT, paintTexture, TAIL_DIM, type CarRig } from './carmesh.ts';

const byId = new Map<string, CarBodyProfile>();
for (const p of profilesJson as unknown as CarBodyProfile[]) if (!carProfileErrors(p).length) byId.set(p.id, p);

/** The profile for a car, if it exists and fits its metres; the scene falls back to the block body without one. */
export function voxelProfileFor(car: Car): CarBodyProfile | undefined {
  const p = byId.get(car.id);
  return p && !profileVsCar(p, car.size).length ? p : undefined;
}

/** The design's paint canvas sampled per voxel, snapped to the design's own colours so the body matches its parts and few InstancedMeshes appear. */
function paintSampler(car: Car, design: Design, find: Lookup): (xm: number, ym: number, zm: number) => string {
  const [len, tall] = car.size;
  const tex = paintTexture(design, find);
  const cv = tex.image as HTMLCanvasElement;
  const data = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
  tex.dispose();
  const palette = [find(design.paint)?.colors[0] ?? DEFAULT_PAINT, ...(find(design.pattern)?.colors ?? []), ...(find(design.decal)?.colors ?? [])];
  const rgb = palette.map((hex) => { const n = Number.parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; });
  return (_xm, ym, zm) => {
    const u = Math.min(cv.width - 1, Math.max(0, Math.round((zm / len + 0.5) * (cv.width - 1))));
    const v = Math.min(cv.height - 1, Math.max(0, Math.round((1 - ym / tall) * (cv.height - 1))));
    const i = (v * cv.width + u) * 4;
    let best = 0, gap = Infinity;
    rgb.forEach(([r, g, b], k) => {
      const d = (r - data[i]) ** 2 + (g - data[i + 1]) ** 2 + (b - data[i + 2]) ** 2;
      if (d < gap) { gap = d; best = k; }
    });
    return palette[best];
  };
}

/** Forward is +z. The body is one mesh per colour over a shared skin; wheels are groups so steering and spinning work. `profile` tries a body the lab is tuning. */
export function buildVoxelCar(car: Car, design: Design, driver: Driver, find: Lookup, profile?: CarBodyProfile): CarRig {
  const [len, , wide] = car.size;
  const p = profile ?? voxelProfileFor(car) ?? byId.get('hatchback')!;
  const sculpt = carVoxels(p, car.size, paintSampler(car, design, find));
  const fit = carFittings(p, car.size);

  const root = new THREE.Group(), body = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: '#23262e' });
  const basePaint = find(design.paint)?.colors[0] ?? DEFAULT_PAINT;
  const kit = find(design.body);
  const trim = kit ? new THREE.MeshLambertMaterial({ color: kit.colors[0] }) : dark;
  const heads = new THREE.MeshBasicMaterial({ color: '#fff3c0' }), tails = new THREE.MeshBasicMaterial({ color: TAIL_DIM });
  const glassMat = new THREE.MeshLambertMaterial({ color: '#8fd0ea', transparent: true, opacity: 0.32 });

  const mats = new Map<string, THREE.Material>();
  const matFor = (color: string): THREE.Material => {
    if (color === TAIL) return tails; // the brake swap reaches every tail lamp
    if (color === HEAD) return heads;
    if (color === GLASS) return glassMat;
    let m = mats.get(color);
    if (!m) { m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }); mats.set(color, m); } // both sides, so the cabin has an inside through the glass
    return m;
  };

  // One skin, one mesh per colour, all sharing the vertices so a crash bends them together. x and z cells count from
  // the middle, y from the ground: the body sits on the world floor.
  const [midX, midZ] = sculpt.body.mid, vs = sculpt.body.size;
  const skin = surfaceNet(sculpt.grid, sculpt.solid, sculpt.colorAt, (x, y, z) => [(x - midX) * vs, (y + 0.5) * vs, (z - midZ) * vs]);
  const place = new THREE.BufferAttribute(skin.points.slice(), 3), normal = new THREE.BufferAttribute(new Float32Array(skin.points.length), 3);
  skinNormals(place.array, skin.quads.values(), normal.array as Float32Array);
  for (const [color, index] of skin.quads) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', place);
    g.setAttribute('normal', normal);
    g.setIndex(index);
    const mesh = new THREE.Mesh(g, matFor(color));
    mesh.castShadow = color !== GLASS;
    mesh.frustumCulled = false;
    body.add(mesh);
  }
  // The dark core seen through the glass, and the parts bolted to a side, which fold in with it.
  body.add(box(fit.core.w, fit.core.h, fit.core.l, dark, 0, fit.core.y, fit.core.z));
  const bolted: { mesh: THREE.Object3D; side: Side; axis: 'x' | 'z'; from: number; sign: number }[] = [];
  const bolt = (mesh: THREE.Object3D, side: Side) => {
    const axis = side === 'front' || side === 'back' ? 'z' : 'x';
    bolted.push({ mesh, side, axis, from: mesh.position[axis], sign: side === 'front' || side === 'left' ? 1 : -1 });
  };

  // Body kits and the taxi sign stay plain boxes on top of the voxels, as on the block body.
  const { roof, belt, cabZ, cabLen } = fit;
  if (kit?.style === 'spoiler' || kit?.style === 'signature') {
    for (const part of [box(wide * 0.92, 0.07, 0.34, trim, 0, fit.deck + 0.3, -len * 0.45), ...[-1, 1].map((s) => box(0.07, 0.3, 0.2, trim, (s * wide) / 3, fit.deck + 0.15, -len * 0.45))]) {
      body.add(part);
      bolt(part, 'back');
    }
  }
  if (kit?.style === 'sport_kit' || kit?.style === 'signature') {
    for (const s of [-1, 1]) {
      const skirt = box(0.1, 0.12, fit.skirt.length, trim, s * fit.skirt.x, p.sill, fit.skirt.z);
      body.add(skirt);
      bolt(skirt, s > 0 ? 'left' : 'right');
    }
    const lip = box(fit.bumper.front * 1.8, 0.08, 0.2, trim, 0, p.sill + 0.02, len / 2 + 0.08);
    body.add(lip);
    bolt(lip, 'front');
  }
  if (kit?.style === 'signature') for (const s of [-1, 1]) {
    const stripe = box(0.05, 0.1, fit.skirt.length, new THREE.MeshBasicMaterial({ color: kit.colors[1] }), s * (fit.skirt.x + 0.02), fit.skirt.belly, fit.skirt.z);
    body.add(stripe);
    bolt(stripe, s > 0 ? 'left' : 'right');
  }
  if (car.id === 'taxi') body.add(box(0.7, 0.2, 0.26, new THREE.MeshLambertMaterial({ color: '#ffd23e', emissive: '#a07a00' }), 0, roof + 0.1, cabZ));

  // Bumpers and mirrors the DamageRig can pop off.
  const fragile: { mesh: THREE.Object3D; side: 'front' | 'back' | 'left' | 'right' }[] = [];
  const paintBox = new THREE.MeshLambertMaterial({ color: basePaint });
  for (const s of [-1, 1]) {
    const b = box((s > 0 ? fit.bumper.front : fit.bumper.back) * 2, 0.16, 0.16, paintBox, 0, p.sill + 0.09, s * (len / 2 + 0.05));
    body.add(b);
    bolt(b, s > 0 ? 'front' : 'back');
    fragile.push({ mesh: b, side: s > 0 ? 'front' : 'back' });
  }
  for (const s of [-1, 1]) {
    const mirror = new THREE.Group();
    mirror.add(box(0.14, 0.05, 0.05, dark, s * 0.05, 0, 0));
    mirror.add(box(0.05, 0.15, 0.13, trim, s * 0.14, 0.03, 0));
    mirror.position.set(s * fit.mirror.x, fit.mirror.y, fit.mirror.z);
    body.add(mirror);
    fragile.push({ mesh: mirror, side: s > 0 ? 'left' : 'right' });
  }
  root.add(body);
  const lamps = addLamps(body, len, wide, (p.sill + Math.min(p.panel[0].v, p.panel[p.panel.length - 1].v) * car.size[1]) / 2 + 0.12);

  const seat = buildDriver(driver, find, fit.pose);
  seat.position.set(fit.seat.x, fit.seat.y, fit.seat.z);
  seat.scale.setScalar(fit.seat.scale);
  body.add(seat);

  // Round wheels: a steer group holding a roll group, so rig.front steers and rig.wheels spins.
  const wheels: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
  const tyreMat = new THREE.MeshLambertMaterial({ color: '#1b1b1f' }), rimMat = new THREE.MeshLambertMaterial({ color: '#c8c8cc' });
  const r = sculpt.wheelRadius, wd = sculpt.wheelWidth;
  const tyre = new THREE.CylinderGeometry(r, r, wd, 28).rotateZ(Math.PI / 2), rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, wd + 0.02, 24).rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(wd + 0.05, r * 0.16, r * 1.1);
  for (const w of sculpt.wheels) {
    const steer = new THREE.Group(), roll = new THREE.Group();
    roll.add(new THREE.Mesh(tyre, tyreMat), new THREE.Mesh(rim, rimMat));
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(spoke, dark); s.rotation.x = (i * Math.PI) / 3; roll.add(s); }
    steer.add(roll);
    steer.position.set(w.x, r, w.z - len / 2);
    root.add(steer);
    wheels.push(roll);
    if (w.front) front.push(steer);
  }

  // Seen only from the cockpit camera, which hides the body. Everything sits below the sightline.
  const paintSkin = new THREE.MeshLambertMaterial({ color: basePaint });
  const { dash, dashCanvas, dashTex, hands, eye, mirror, back } = buildCockpit(car.size, { floor: p.sill, deck: belt - p.sill, roof, cabZ, cabLen, pose: fit.pose }, paintSkin, dark, driver, find);

  // The crash: fold the skin where the marks are, and take the normals with it so the light shows the dents.
  const crumple = (levels: Record<Side, number>, marks: readonly Mark[]) => {
    foldSkin(skin.points, place.array as Float32Array, marks, fit.crush, car.size);
    skinNormals(place.array, skin.quads.values(), normal.array as Float32Array);
    place.needsUpdate = normal.needsUpdate = true;
    for (const b of bolted) b.mesh.position[b.axis] = b.from - b.sign * levels[b.side] * fit.crush[b.side] * 0.8;
  };

  root.add(dash);
  return { root, body, wheels, front, dash, dashCanvas, dashTex, hands, eye, mirror, back, tails, heads, crush: null, ...lamps, fragile, crumple, seat };
}
