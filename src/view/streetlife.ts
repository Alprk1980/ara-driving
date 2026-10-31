// What makes the town look lived in, drawn cheaply: instanced furniture, parked cars, people, and town traffic. Traffic and
// parked cars share three low-poly bodies, and traffic bends in the vertex shader from a per-car dent attribute,
// the same accordion as the player's foldSkin, so sixteen wrecks cost no more than sixteen clean cars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ALARM_HZ, type KerbCar, type ParkedCars } from '../sim/parked.ts';
import type { Traffic, TrafficCar } from '../sim/traffic.ts';
import { FURNITURE_KINDS, type Furniture, type Town, type Vec } from '../sim/town.ts';
import type { Walkers } from '../sim/walkers.ts';
import { TAIL_BRAKE, TAIL_DIM } from './carmesh.ts';
import type { Part } from '../../schemas/content.ts';
import type { TownCar } from '../../schemas/towncars.ts';
import townCars from '../data/towncars.json';
import { LIVERY } from '../../schemas/fleet.ts';
import { beaconAt, fleetGeometry, FLEET_SHAPES } from './fleet.ts';
import { paintedMaterial, partsGeometry } from './parts.ts';

const part = (shape: Part['shape'], x: number, y: number, z: number, w: number, h: number, l: number, color: string): Part => ({ shape, x, y, z, w, h, l, color });

// White parts take each instance's tint, for hedges and containers.
export const FURNITURE_PARTS: Record<(typeof FURNITURE_KINDS)[number], Part[]> = {
  bench: [part('box', 0, 0.42, 0, 1.7, 0.08, 0.45, '#8a5a34'), part('box', 0, 0.62, -0.2, 1.7, 0.42, 0.07, '#8a5a34'), part('box', -0.7, 0, 0, 0.09, 0.44, 0.44, '#33363d'), part('box', 0.7, 0, 0, 0.09, 0.44, 0.44, '#33363d')],
  bin: [part('cylinder', 0, 0, 0, 0.5, 0.95, 0.5, '#2f5d50'), part('cylinder', 0, 0.95, 0, 0.56, 0.1, 0.56, '#23262e')],
  planter: [part('box', 0, 0, 0, 1.1, 0.55, 1.1, '#8d8f98'), part('cone', 0, 0.55, 0, 1.15, 1, 1.15, '#3f9a57')],
  bollard: [part('cylinder', 0, 0, 0, 0.2, 0.95, 0.2, '#23262e'), part('cylinder', 0, 0.75, 0, 0.22, 0.08, 0.22, '#f4efd8')],
  cycle_rack: [part('box', -0.5, 0.4, 0, 0.06, 0.8, 0.7, '#9aa0ab'), part('box', 0.5, 0.4, 0, 0.06, 0.8, 0.7, '#9aa0ab'), part('box', 0, 0.55, 0, 1.1, 0.06, 0.06, '#9aa0ab')],
  bus_shelter: [part('box', 0, 2.3, 0, 3.4, 0.1, 1.5, '#3d4a5c'), part('box', 0, 0, -0.65, 3.3, 2.3, 0.05, '#a9d2e4'), part('box', -1.65, 0, 0, 0.06, 2.3, 1.4, '#3d4a5c'), part('box', 1.65, 0, 0, 0.06, 2.3, 1.4, '#3d4a5c'), part('box', 0, 0.45, -0.4, 2.2, 0.08, 0.34, '#8a5a34')],
  hedge: [part('box', 0, 0, 0, 1, 0.95, 0.6, '#ffffff')],
  container: [part('box', 0, 0, 0, 2.44, 2.6, 6.06, '#ffffff'), part('box', 0, 2.6, 0, 2.3, 0.05, 5.9, '#c9ccd2')],
  pallets: [part('box', 0, 0, 0, 1.2, 0.15, 1.2, '#a9794a'), part('box', 0, 0.15, 0, 1.1, 0.9, 1.1, '#c49a66'), part('box', 1.5, 0, 0.4, 1.2, 0.15, 1.2, '#a9794a'), part('box', 1.5, 0.15, 0.4, 1, 0.6, 1, '#b08a58')],
};

const PARKED_DRAWN = 90, PARKED_REFRESH_S = 1; // only the parked cars nearest the player are drawn, re-picked now and then
const PARKED_RANGE_M = 260, ALARMS_DRAWN = 12, BLUE_HZ = 3; // 2-4 Hz is the usual range for warning beacons, from memory of UN R65, which the search couldn't confirm

const hedgeGreens = ['#3f8a4d', '#4c9a58', '#37794a'], boxColours = ['#b0473a', '#3d6fa8', '#c28a2e', '#3f7f6a', '#6a6f78'];

function buildFurniture(group: THREE.Group, list: readonly Furniture[]) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scale = new THREE.Vector3(), c = new THREE.Color();
  for (const kind of FURNITURE_KINDS) {
    const of = list.filter((f) => f.kind === kind);
    if (!of.length) continue;
    const mesh = new THREE.InstancedMesh(partsGeometry(FURNITURE_PARTS[kind]), paintedMaterial(), of.length);
    of.forEach((f, i) => {
      mesh.setMatrixAt(i, m.compose(pos.set(f.x, 0, f.z), q.setFromAxisAngle(up, f.heading), scale.set(kind === 'hedge' ? f.len : 1, 1, 1)));
      const shade = (f.tint ?? (i * 0.37) % 1);
      mesh.setColorAt(i, c.set(kind === 'hedge' ? hedgeGreens[i % 3] : kind === 'container' ? boxColours[Math.floor(shade * 5)] : '#ffffff'));
    });
    mesh.frustumCulled = false;
    group.add(mesh);
  }
}

export const CAR_SHAPES = townCars as unknown as TownCar[]; // designed by Qwen, held to real sizes by schemas/towncars.ts
const WHEEL_R = 0.33;
// A car narrows toward each end, seen from above, and has dark arches round its wheels. Both sizes are judged by eye, as
// no standard gives them: they take the box out of an outline extruded straight across.
const NOSE_TAPER_M = 0.9, NOSE_WIDE = 0.84, TAIL_TAPER_M = 0.7, TAIL_WIDE = 0.9, ARCH_GAP = 0.08, ARCH_SIDES = 10, OUTLINE_STEP_M = 0.4;

/** A town car from its outline: flat-shaded, with painted pillars, separate panes of glass, bumpers and round wheels. White panels take each car's paint. */
export function carGeometry(shape: TownCar): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], white = new THREE.Color('#ffffff'), glass = new THREE.Color('#5f7f96'), rubber = new THREE.Color('#25282e'), silver = new THREE.Color('#c4c7cd');
  type P = [number, number, number];
  const tri = (a: P, b: P, c: P, colour: THREE.Color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(colour.r, colour.g, colour.b); };
  const face = (a: P, b: P, c: P, d: P, colour: THREE.Color) => { tri(a, b, c, colour); tri(a, c, d, colour); };
  /** A pane set into a four-cornered panel: u along it, v up it, nudged out so it sits proud of the paint. */
  const pane = (a: P, b: P, c: P, d: P, u0: number, u1: number, v0: number, v1: number, out: P) => {
    const at = (u: number, v: number): P => [0, 1, 2].map((k) => (a[k] + (b[k] - a[k]) * u) * (1 - v) + (d[k] + (c[k] - d[k]) * u) * v + out[k] * 0.012) as P;
    face(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), glass);
  };
  const { cabin: c, half } = shape;
  const tailZ = Math.min(...shape.body.map((p) => p[0])), noseZ = Math.max(...shape.body.map((p) => p[0]));
  /** How much of its width the car keeps at this point along it. */
  const plan = (z: number) => {
    const n = Math.max(0, 1 - (noseZ - z) / NOSE_TAPER_M), t = Math.max(0, 1 - (z - tailZ) / TAIL_TAPER_M);
    return 1 - (1 - NOSE_WIDE) * n * n - (1 - TAIL_WIDE) * t * t;
  };
  // Extra points along the outline near the ends, so the taper curves, and the side panels have somewhere to bend.
  const body = shape.body.flatMap((p, i) => {
    const next = shape.body[i + 1];
    if (!next) return [p];
    const steps = Math.max(1, Math.ceil(Math.abs(next[0] - p[0]) / OUTLINE_STEP_M) * (Math.min(noseZ - p[0], p[0] - tailZ) < NOSE_TAPER_M + OUTLINE_STEP_M ? 1 : 0));
    return Array.from({ length: steps }, (_, k): [number, number] => [p[0] + ((next[0] - p[0]) * k) / steps, p[1] + ((next[1] - p[1]) * k) / steps]);
  });
  const sill = body[0][1], wheelR = shape.wheel ?? WHEEL_R;
  const waist = 0.62, across = (y: number) => half - Math.max(0, y - waist) * 0.28; // the sides draw in above the waist
  for (let i = 0; i < body.length; i++) {
    const [z0, y0] = body[i], [z1, y1] = body[(i + 1) % body.length];
    face([-across(y0), y0, z0], [-across(y1), y1, z1], [across(y1), y1, z1], [across(y0), y0, z0], white); // round the outline, across the car
  }
  for (const s of [1, -1]) for (let i = 0; i < body.length - 1; i++) { // the flanks, a strip down from each stretch of outline, so they can follow the taper
    const [z0, y0] = body[i], [z1, y1] = body[i + 1];
    if (z1 > z0) face([s * half, sill, z0], [s * half, sill, z1], [s * across(y1), y1, z1], [s * across(y0), y0, z0], white);
  }
  const wheelZ = shape.axles ?? [tailZ + 0.8, noseZ - 0.72], arch = new THREE.Color('#15171b');
  const low = across(c.base) - 0.03, high = low - 0.17, r = c.rear, f = c.front, rt = c.rearTop, ft = c.frontTop, y0 = c.base, y1 = c.top;
  face([-high, y1, rt], [-high, y1, ft], [high, y1, ft], [high, y1, rt], white); // the roof
  const screen: [P, P, P, P] = [[-low, y0, f], [low, y0, f], [high, y1, ft], [-high, y1, ft]], back: [P, P, P, P] = [[low, y0, r], [-low, y0, r], [-high, y1, rt], [high, y1, rt]];
  face(...screen, white);
  face(...back, white);
  pane(...screen, 0.07, 0.93, 0.08, 0.9, [0, 0.6, 0.8]);
  if (!shape.van) pane(...back, 0.1, 0.9, 0.12, 0.88, [0, 0.6, -0.8]);
  for (const s of [1, -1]) {
    const a: P = [s * low, y0, r], b: P = [s * low, y0, f], d: P = [s * high, y1, ft], e: P = [s * high, y1, rt];
    if (s > 0) face(a, b, d, e, white); else face(a, e, d, b, white);
    const twoDoor = shape.id === 'coupe', split = twoDoor ? 0.34 : 0.5; // a coupe's long door and small rear quarter
    if (!shape.van) pane(a, b, d, e, 0.1, split, 0.12, 0.88, [s, 0.2, 0]); // the rear door's window, then the B pillar
    pane(a, b, d, e, shape.van ? 0.56 : split + 0.04, 0.9, 0.12, 0.88, [s, 0.2, 0]);
    // A dark sill along the bottom of the doors, in short lengths so it stays on the tapered sides.
    for (let z = tailZ + 0.15; z < noseZ - 0.15 - 1e-6; z += OUTLINE_STEP_M) {
      const z1 = Math.min(z + OUTLINE_STEP_M, noseZ - 0.15);
      face([s * (half + 0.005), sill, z], [s * (half + 0.005), sill, z1], [s * (half + 0.005), sill + 0.09, z1], [s * (half + 0.005), sill + 0.09, z], rubber);
    }
    // The wheel arches: dark half-rounds on the flanks that the wheels sit in.
    for (const z of wheelZ) for (let k = 0; k < ARCH_SIDES; k++) {
      const r = wheelR + ARCH_GAP, at = (j: number): P => { const a = (j / ARCH_SIDES) * Math.PI; return [s * (half + 0.008), Math.max(sill, wheelR + Math.sin(a) * r), z + Math.cos(a) * r]; };
      tri([s * (half + 0.008), Math.max(sill, wheelR), z], at(k), at(k + 1), arch);
    }
  }
  for (let i = 0; i < pos.length; i += 3) pos[i] *= plan(pos[i + 2]); // everything so far follows the taper
  // Every face turned to look outward from the car's middle, so no panel is ever culled from the side you're looking at.
  const midZ = (tailZ + noseZ) / 2;
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3, cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - 0.75, cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3 - midZ;
    if (nx * cx + ny * cy + nz * cz >= 0) continue;
    for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const normal = g.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) if (Math.abs(normal.getX(i)) > 0.995) normal.setXYZ(i, Math.sign(normal.getX(i)), 0, 0); // the straight of the flanks reads as one flat panel, and the taper still catches the light
  const tinted = (geo: THREE.BufferGeometry, colour: THREE.Color) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    flat.deleteAttribute('uv');
    flat.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: flat.getAttribute('position').count }, () => [colour.r, colour.g, colour.b]).flat(), 3));
    return flat;
  };
  const tail = tailZ, nose = noseZ;
  const parts = wheelZ.flatMap((z) => [-1, 1].flatMap((s) => [
    tinted(new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 14).rotateZ(Math.PI / 2).translate(s * (half * plan(z) - 0.09), wheelR, z), rubber),
    tinted(new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.24, 10).rotateZ(Math.PI / 2).translate(s * (half * plan(z) - 0.09), wheelR, z), silver),
  ]));
  for (const z of [tail - 0.03, nose + 0.03]) parts.push(tinted(new THREE.BoxGeometry(half * 2 * plan(z) - 0.08, 0.2, 0.1).translate(0, sill + 0.1, z), rubber));
  for (const s of [1, -1]) {
    parts.push(tinted(new THREE.BoxGeometry(0.2, 0.09, 0.1).translate(s * (low * plan(c.front - 0.28) + 0.09), c.base + 0.12, c.front - 0.28), rubber));
    parts.push(tinted(new THREE.BoxGeometry(0.38, 0.14, 0.05).translate(s * (half * TAIL_WIDE - 0.28), 0.7, tail - 0.01), new THREE.Color('#a12a26'))); // lamps of their own, for the cars that are parked
    parts.push(tinted(new THREE.BoxGeometry(0.36, 0.12, 0.05).translate(s * (half * NOSE_WIDE - 0.28), 0.56, nose + 0.01), new THREE.Color('#f5ecc8')));
  }
  return mergeGeometries([g, ...parts])!;
}

/** Each car's paint goes on its white panels only, so tyres, trim and glass keep their own colours. */
const paintOnlyPanels = (vertex: string) => vertex.replace('#include <color_vertex>', '#include <color_vertex>\n  if (color.r < 0.95 || color.g < 0.95 || color.b < 0.95) vColor.rgb = color.rgb;');

export function parkedMaterial(): THREE.MeshLambertMaterial {
  const m = paintedMaterial();
  m.onBeforeCompile = (shader) => { shader.vertexShader = paintOnlyPanels(shader.vertexShader); };
  m.customProgramCacheKey = () => 'town-car-paint';
  return m;
}

/** The same paint, with a dent attribute that folds the car up in the vertex shader, from the ends and sides of its size. */
function bendingMaterial(ends = 2.05, sides = 0.9): THREE.MeshLambertMaterial {
  const m = paintedMaterial();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = paintOnlyPanels(shader.vertexShader)
      .replace('#include <common>', '#include <common>\nattribute vec4 dent;\nfloat fold(float s, float edge, float d) { float start = edge - d * 2.3; if (s <= start || d <= 0.0) return s; return start + (s - start) * 0.565; }')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float z = transformed.z, x = transformed.x;
          transformed.z = fold(z, ${ends.toFixed(2)}, dent.x * 0.46);
          transformed.z = -fold(-transformed.z, ${ends.toFixed(2)}, dent.y * 0.4);
          transformed.x = fold(x, ${sides.toFixed(2)}, dent.z * 0.2);
          transformed.x = -fold(-transformed.x, ${sides.toFixed(2)}, dent.w * 0.2);
          float top = step(0.75, transformed.y);
          transformed.y += sin(z * 21.0) * top * (dent.x * step(0.9, z) + dent.y * step(z, -0.9)) * 0.06; }`);
  };
  m.customProgramCacheKey = () => `town-car-dent-${ends}-${sides}`;
  return m;
}

export class StreetLife {
  private cars: THREE.InstancedMesh[] = [];
  private tails: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private dents: THREE.InstancedBufferAttribute[] = [];
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private legs: [THREE.InstancedMesh, THREE.InstancedMesh];
  private clock = 0;
  private blinkers: THREE.InstancedMesh;
  private parked: THREE.InstancedMesh[] = [];
  private parkedDents: THREE.InstancedBufferAttribute[] = [];
  private parkedSlots: KerbCar[][] = [];
  private parkedClock = 0;
  private alarms: THREE.InstancedMesh;
  private fleet: { mesh: THREE.InstancedMesh; dents: THREE.InstancedBufferAttribute; cars: TrafficCar[] }[] = [];
  private blues: [THREE.InstancedMesh, THREE.InstancedMesh];
  private crews: TrafficCar[];

  constructor(scene: THREE.Scene, town: Town, traffic: Traffic, walkers: Walkers, kerb: ParkedCars) {
    const group = new THREE.Group();
    scene.add(group);
    buildFurniture(group, town.furniture);
    const c = new THREE.Color(), n = traffic.cars.length, kinds = CAR_SHAPES.length, plain = traffic.cars.filter((car) => !car.fleet);
    const lamp = mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.36, 0.13, 0.05).translate(s * 0.6, 0, 0)))!;
    this.tails = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    this.heads = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    CAR_SHAPES.forEach((shape, k) => {
      const body = carGeometry(shape), drive = body.clone(), mine = plain.filter((_, i) => i % kinds === k);
      const standing = new THREE.InstancedBufferAttribute(new Float32Array(PARKED_DRAWN * 4), 4);
      standing.setUsage(THREE.DynamicDrawUsage);
      body.setAttribute('dent', standing);
      this.parkedDents.push(standing);
      this.parkedSlots.push([]);
      const parked = new THREE.InstancedMesh(body, bendingMaterial(), PARKED_DRAWN);
      parked.setColorAt(0, c.set('#ffffff'));
      parked.count = 0;
      parked.frustumCulled = false;
      group.add(parked);
      this.parked.push(parked);
      const dents = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4);
      dents.setUsage(THREE.DynamicDrawUsage);
      drive.setAttribute('dent', dents);
      const cars = new THREE.InstancedMesh(drive, bendingMaterial(), mine.length);
      mine.forEach((car, i) => cars.setColorAt(i, c.setHSL(car.colour, 0.45, 0.6)));
      cars.frustumCulled = false;
      cars.castShadow = true;
      group.add(cars);
      this.cars.push(cars);
      this.dents.push(dents);
    });
    for (const shape of FLEET_SHAPES) {
      const mine = traffic.cars.filter((car) => car.fleet === shape.id);
      if (!mine.length) continue;
      const g = fleetGeometry(shape), dents = new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4);
      dents.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('dent', dents);
      const mesh = new THREE.InstancedMesh(g, bendingMaterial(mine[0].halfL - 0.2, shape.half - 0.1), mine.length);
      mine.forEach((_, i) => mesh.setColorAt(i, c.set('#ffffff')));
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      group.add(mesh);
      this.fleet.push({ mesh, dents, cars: mine });
    }
    this.crews = traffic.cars.filter((car) => car.role !== 'bus' && car.fleet);
    const lamp2 = new THREE.BoxGeometry(0.42, 0.14, 0.26);
    const blue = () => new THREE.InstancedMesh(lamp2, new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.crews.length);
    this.blues = [blue(), blue()];
    for (const b of this.blues) this.crews.forEach((car, i) => b.setColorAt(i, c.set(LIVERY[car.role as keyof typeof LIVERY].beacon))); // blue for the emergency services, amber for recovery
    for (const b of this.blues) { b.frustumCulled = false; group.add(b); }
    const corners4 = mergeGeometries([[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => new THREE.BoxGeometry(0.2, 0.12, 0.08).translate(x, 0, z)))!;
    this.alarms = new THREE.InstancedMesh(corners4, new THREE.MeshBasicMaterial({ color: '#ffa21f' }), ALARMS_DRAWN);
    this.alarms.frustumCulled = false;
    this.alarms.count = 0;
    group.add(this.alarms);
    const corners = mergeGeometries([-1, 1].map((e) => new THREE.BoxGeometry(0.16, 0.1, 0.08).translate(1, 0, e)))!;
    this.blinkers = new THREE.InstancedMesh(corners, new THREE.MeshBasicMaterial({ color: '#ffa21f' }), n);
    this.blinkers.frustumCulled = false;
    group.add(this.blinkers);
    traffic.cars.forEach((_, i) => {
      this.tails.setColorAt(i, c.set(TAIL_DIM));
      this.heads.setColorAt(i, c.set('#fff3c0'));
    });
    for (const mesh of [this.tails, this.heads]) { mesh.frustumCulled = false; group.add(mesh); }

    // A person, about 1.7 m: separate legs so they can swing, tinted per person.
    const people = walkers.people.length, shirt = new THREE.BoxGeometry(0.44, 0.62, 0.24).translate(0, 1.16, 0), skull = new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.6, 0), leg = new THREE.BoxGeometry(0.16, 0.84, 0.17).translate(0, -0.42, 0);
    const skin = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.torso = new THREE.InstancedMesh(shirt, new THREE.MeshLambertMaterial({ color: '#ffffff' }), people);
    this.head = new THREE.InstancedMesh(skull, skin, people);
    this.legs = [new THREE.InstancedMesh(leg, new THREE.MeshLambertMaterial({ color: '#ffffff' }), people), new THREE.InstancedMesh(leg, new THREE.MeshLambertMaterial({ color: '#ffffff' }), people)];
    const skins = ['#f1c7a6', '#e0ac82', '#b67a50', '#8a5636', '#5f3a24'];
    walkers.people.forEach((w, i) => {
      this.torso.setColorAt(i, c.setHSL(w.shirt, 0.55, 0.55));
      this.head.setColorAt(i, c.set(skins[Math.floor(w.legs * 5)]));
      for (const l of this.legs) l.setColorAt(i, c.setHSL(0.6, 0.25, 0.2 + w.legs * 0.25));
    });
    for (const mesh of [this.torso, this.head, ...this.legs]) { mesh.frustumCulled = false; group.add(mesh); }
  }

  /** Keep the nearest parked cars drawn. Cheap enough at once a second: a plain scan of a list of hundreds. */
  private nearParked(list: readonly KerbCar[], near: Vec) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    const close = list.map((p) => ({ p, d: (p.x - near.x) ** 2 + (p.z - near.z) ** 2 })).filter((c) => c.d < PARKED_RANGE_M ** 2).sort((a, b) => a.d - b.d).slice(0, PARKED_DRAWN);
    this.parked.forEach((mesh, k) => {
      const mine = close.filter(({ p }) => Math.floor(p.colour * 977) % this.parked.length === k);
      this.parkedSlots[k] = mine.map(({ p }) => p);
      mine.forEach(({ p }, i) => {
        mesh.setMatrixAt(i, m.compose(pos.set(p.x, 0, p.z), q.setFromAxisAngle(up, p.heading), one));
        mesh.setColorAt(i, c.setHSL(p.colour, 0.3 + p.colour * 0.25, 0.42 + ((p.colour * 7) % 1) * 0.3));
        this.parkedDents[k].setXYZW(i, p.dents.front, p.dents.back, p.dents.left, p.dents.right);
      });
      mesh.count = mine.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      this.parkedDents[k].needsUpdate = true;
    });
  }

  /** The few that have been hit move and bend between refreshes, and flash their hazards while the alarm sounds. */
  private stirredParked() {
    const m = new THREE.Matrix4(), scale = new THREE.Matrix4(), flash = this.clock * ALARM_HZ % 1 < 0.5;
    let alarms = 0;
    this.parked.forEach((mesh, k) => {
      let moved = false;
      this.parkedSlots[k].forEach((p, i) => {
        if (!p.touched) return;
        moved = true;
        mesh.setMatrixAt(i, m.makeRotationY(p.heading).setPosition(p.x, p.lift, p.z));
        this.parkedDents[k].setXYZW(i, p.dents.front, p.dents.back, p.dents.left, p.dents.right);
        if (p.alarm > 0 && flash && alarms < ALARMS_DRAWN) this.alarms.setMatrixAt(alarms++, m.makeRotationY(p.heading).multiply(scale.makeScale(p.halfW - 0.05, 1, p.halfL)).setPosition(p.x, 0.72, p.z));
      });
      if (moved) mesh.instanceMatrix.needsUpdate = this.parkedDents[k].needsUpdate = true;
    });
    this.alarms.count = alarms;
    this.alarms.instanceMatrix.needsUpdate = true;
  }

  private drawFleet() {
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const f of this.fleet) {
      f.cars.forEach((car, i) => {
        f.mesh.setMatrixAt(i, car.dormant ? zero : m.makeRotationY(car.heading).setPosition(car.x, 0, car.z));
        f.dents.setXYZW(i, car.dents.front, car.dents.back, car.dents.left, car.dents.right);
      });
      f.mesh.instanceMatrix.needsUpdate = f.dents.needsUpdate = true;
    }
    const left = this.clock * BLUE_HZ % 1 < 0.5;
    this.crews.forEach((car, i) => {
      const b = beaconAt(FLEET_SHAPES.find((v) => v.id === car.fleet)!), fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const k of [0, 1]) {
        const lit = (car.blue || car.amber) && !car.dormant && left === (k === 0), side = (k ? -1 : 1) * b.wide * 0.6;
        s.set(car.x + fx * b.z + fz * side, b.y + 0.04, car.z + fz * b.z - fx * side);
        this.blues[k].setMatrixAt(i, lit ? m.makeRotationY(car.heading).setPosition(s) : zero);
      }
    });
    for (const b of this.blues) b.instanceMatrix.needsUpdate = true;
  }

  draw(dt: number, traffic: Traffic, walkers: Walkers, kerb: ParkedCars, near: Vec) {
    this.clock += dt;
    if ((this.parkedClock -= dt) <= 0) { this.parkedClock = PARKED_REFRESH_S; this.nearParked(kerb.cars, near); }
    this.stirredParked();
    this.drawFleet();
    const m = new THREE.Matrix4(), mirror = new THREE.Matrix4(), c = new THREE.Color(), blink = this.clock % 1 < 0.5;
    const kinds = CAR_SHAPES.length;
    let plain = 0;
    traffic.cars.forEach((car, i) => {
      if (!car.fleet) {
        const k = plain % kinds, at = Math.floor(plain / kinds);
        plain++;
        this.cars[k].setMatrixAt(at, m.makeRotationY(car.heading).setPosition(car.x, car.lift, car.z));
        this.dents[k].setXYZW(at, car.dents.front, car.dents.back, car.dents.left, car.dents.right);
      }
      const half = car.halfL;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading), d = car.dents;
      const hazard = car.wreck > 0, rear = half + 0.03 - d.back * 0.4, nose = half + 0.03 - d.front * 0.46;
      this.tails.setMatrixAt(i, m.makeRotationY(car.heading).setPosition(car.x - fx * rear, 0.78 + car.lift, car.z - fz * rear));
      this.tails.setColorAt(i, c.set(hazard ? (blink ? '#ff9a1f' : TAIL_DIM) : car.braking ? TAIL_BRAKE : TAIL_DIM));
      this.heads.setMatrixAt(i, m.makeRotationY(car.heading).setPosition(car.x + fx * nose, d.front > 0.6 ? -5 : 0.62 + car.lift, car.z + fz * nose)); // a smashed nose has no lamps
      this.heads.setColorAt(i, c.set(hazard ? (blink ? '#ff9a1f' : '#54504a') : '#fff3c0'));
      // +x is the driver's left, so a right turn mirrors the lamps across: x scales by the car's width with a sign.
      const on = car.signal && !car.dormant && this.clock % (2 / 3) < 1 / 3;
      if (on) this.blinkers.setMatrixAt(i, m.makeRotationY(car.heading).multiply(mirror.makeScale(car.signal < 0 ? car.halfW : -car.halfW, 1, car.halfL - 0.02)).setPosition(car.x, 0.72, car.z));
      else this.blinkers.setMatrixAt(i, m.makeScale(0, 0, 0));
    });
    this.blinkers.instanceMatrix.needsUpdate = true;
    for (const k of this.cars.keys()) this.dents[k].needsUpdate = this.cars[k].instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceColor!.needsUpdate = this.heads.instanceColor!.needsUpdate = true;

    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0), swing = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    walkers.people.forEach((w, i) => {
      const bob = Math.abs(Math.sin(w.phase)) * 0.03, sway = Math.sin(w.phase) * 0.5;
      q.setFromAxisAngle(up, w.heading);
      s.setScalar(w.tall);
      this.torso.setMatrixAt(i, m.compose(p.set(w.x, bob, w.z), q, s));
      this.head.setMatrixAt(i, m);
      this.legs.forEach((l, k) => {
        const off = (k ? 0.11 : -0.11) * w.tall;
        swing.setFromAxisAngle(side, k ? sway : -sway).premultiply(q);
        p.set(w.x + Math.cos(w.heading) * off, 0.84 * w.tall + bob, w.z - Math.sin(w.heading) * off);
        l.setMatrixAt(i, m.compose(p, swing, s));
      });
    });
    for (const mesh of [this.torso, this.head, ...this.legs]) mesh.instanceMatrix.needsUpdate = true;
  }
}
