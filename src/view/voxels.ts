/**
 * The cars as voxels (the way armored-tactics builds its world): a solid of whole
 * voxels, only its shell kept, one voxel in five a shade darker. Pure — no three
 * here; src/view/voxelcar.ts meshes these models into a CarRig. The sculptor reads
 * a car profile (schemas/carprofiles.ts) and its metres, so every shape stays true
 * to the car's size.
 */
import type { CarBodyProfile, ProfileKey } from '../../schemas/carprofiles.ts';
import type { Side } from '../sim/car.ts';
import { drivingPosition } from './drivingposition.ts';

export type VoxelCell = readonly [number, number, number];

/** Voxels grouped by colour: positions in voxel units (x across, y up from the ground, z nose-ward), size world units each. */
export interface VoxelModel {
  readonly byColor: ReadonlyMap<string, readonly VoxelCell[]>;
  /** World units per voxel. */
  readonly size: number;
  /** Voxels in all (for the tests and a sanity check). */
  readonly count: number;
  /** A key that changes when the model would look different (to rebuild only then). */
  readonly key: string;
  /** How much of its cell each voxel fills (absent: 0.98, a hairline between voxels). */
  readonly fill?: number;
  /** The grid's true middle across and along, half a voxel off zero on an even count; subtract it to centre the model. */
  readonly mid: readonly [number, number];
}

/** A colour a shade darker (k 0..1 of the way to black). */
export function shade(color: string, k: number): string {
  const n = Number.parseInt(color.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** A small stable hash of a voxel. */
function spot(x: number, y: number, z: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** How many voxels of `size` span `length` (at least one). */
export const voxelsFor = (length: number, size: number): number => Math.max(1, Math.round(length / size));

/** Keep only the shell of a cell test: a voxel buried on all six sides never shows. */
function shellOnly(has: BoundedHas): VoxelCell[] {
  const out: VoxelCell[] = [];
  for (let x = has.min[0]; x <= has.max[0]; x++)
    for (let y = has.min[1]; y <= has.max[1]; y++)
      for (let z = has.min[2]; z <= has.max[2]; z++) {
        if (!has(x, y, z)) continue;
        if (has(x - 1, y, z) && has(x + 1, y, z) && has(x, y - 1, z) && has(x, y + 1, z) && has(x, y, z - 1) && has(x, y, z + 1)) continue;
        out.push([x, y, z]);
      }
  return out;
}

/** Bounds a cell test answers inside, for the shell pass. */
interface Bounds { min: [number, number, number]; max: [number, number, number] }
type BoundedHas = ((x: number, y: number, z: number) => boolean) & Bounds;

/**
 * A solid `nx` x `ny` x `nz` voxels, `size` world units each, of the cells
 * `inside(x, y, z)` keeps (x and z counted from the middle, y from the ground),
 * only those on its surface; one voxel in five a shade darker. `color` may pick a colour per voxel.
 */
export function voxelSolid(nx: number, ny: number, nz: number, size: number, color: string | ((x: number, y: number, z: number) => string | null), inside: (x: number, y: number, z: number) => boolean = () => true, speckle = true): VoxelModel {
  const x0 = -Math.floor((nx - 1) / 2), z0 = -Math.floor((nz - 1) / 2);
  const has: BoundedHas = Object.assign(
    (x: number, y: number, z: number) => x >= x0 && x < x0 + nx && y >= 0 && y < ny && z >= z0 && z < z0 + nz && inside(x, y, z),
    { min: [x0, 0, z0] as [number, number, number], max: [x0 + nx - 1, ny - 1, z0 + nz - 1] as [number, number, number] },
  );
  const byColor = new Map<string, VoxelCell[]>();
  let count = 0;
  for (const [x, y, z] of shellOnly(has)) {
    const base = typeof color === 'string' ? color : color(x, y, z);
    if (base === null) continue;
    const c = speckle && spot(x, y, z) % 5 === 0 ? shade(base, 0.14) : base;
    byColor.set(c, [...(byColor.get(c) ?? []), [x, y, z]]);
    count++;
  }
  return { byColor, size, count, key: `solid|${nx}x${ny}x${nz}|${size}|${typeof color === 'string' ? color : 'fn'}`, mid: [x0 + (nx - 1) / 2, z0 + (nz - 1) / 2] };
}

/** The line's height (v) at z, lerping between its points. */
export function lineAt(keys: readonly ProfileKey[], z: number): number {
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (z >= keys[i].z && z <= keys[i + 1].z) { lo = keys[i]; hi = keys[i + 1]; break; }
  const t = hi.z === lo.z ? 0 : (z - lo.z) / (hi.z - lo.z);
  return lo.v + (hi.v - lo.v) * t;
}

// The non-paint slots, exported so the mesh builder knows which voxels need glow materials.
export const GLASS = '#9fd4e8', GLASS_DIM = '#8fc4d8', TRIM = '#3a3a40', HEAD = '#fff2c0', TAIL = '#c8322a', ARCH = '#26262a';
const TIRE = '#1b1b1f', TIRE_DIM = '#171719', RIM = '#c8c8cc', RIM_DIM = '#b0b0b4', HUB = '#8a8a90';

/** A car sculpted from its profile: the body, and each wheel as its own model (hub at its centre). */
export interface CarVoxels {
  readonly body: VoxelModel;
  /** Wheel models centred on their hubs (x across, y up, z along the car); place them at these metres. */
  readonly wheels: { readonly model: VoxelModel; readonly x: number; readonly z: number; readonly front: boolean }[];
  readonly wheelRadius: number;
  readonly wheelWidth: number;
  /** The wheel model's hub row, in voxels. */
  readonly wheelHub: number;
  /** The body's solid and its colours, cell by cell, for the smooth skin (carsurface.ts). */
  readonly solid: (x: number, y: number, z: number) => boolean;
  readonly colorAt: (x: number, y: number, z: number) => string;
  readonly grid: { lo: [number, number, number]; hi: [number, number, number] };
}

/** Voxels across, up and along, and the size, for a car of these metres. */
const carGrid = (size: readonly [number, number, number], vox?: number) => {
  const vs = vox ?? Math.min(size[1], size[2]) / 26;
  return { vs, nx: voxelsFor(size[2], vs), ny: voxelsFor(size[1], vs), nz: voxelsFor(size[0], vs) };
};

/**
 * Sculpt a car: voxels about `vox` across (default: a 26-deep grid on the body's smaller span).
 * `paint` colours the body panels from the voxel's position in metres, x and z from the middle of the car; glass, trim, lights, arches and tyres come from their own slots.
 * The car is the union of a lower body and a cabin, so the cabin always stands on the body rather than being cut by its top line.
 */
export function carVoxels(p: CarBodyProfile, size: readonly [number, number, number], paint: string | ((xm: number, ym: number, zm: number) => string), vox?: number): CarVoxels {
  const [len, tall, wide] = size;
  const { vs, nx, ny, nz } = carGrid(size, vox);
  const x0 = -Math.floor((nx - 1) / 2), z0 = -Math.floor((nz - 1) / 2);
  const zfOf = (z: number) => (nz === 1 ? 0.5 : (z - z0) / (nz - 1));
  const ymOf = (y: number) => (ny === 1 ? 0 : (y / (ny - 1)) * tall);
  const xmOf = (x: number) => (nx === 1 ? 0 : ((x - x0) / (nx - 1) - 0.5) * wide);
  const wheelR = p.wheels.radius, axleR = wheelR + vs * 1.5, belt = p.cabin.belt * tall, roof = p.cabin.height * tall;
  const axles = [p.wheels.rear, p.wheels.front];
  const xTrack = (p.wheels.track * wide) / 2, wellIn = xTrack - p.wheels.width / 2 - vs * 1.5, cabHalf = (p.cabin.width * wide) / 2;
  const bodyHalf = (zf: number) => (lineAt(p.width, zf) * wide) / 2;
  const glassEdge = (ym: number) => {
    const t = Math.min(1, Math.max(0, (ym - belt) / Math.max(0.01, roof - belt)));
    return { front: p.cabin.front - t * p.cabin.rakeF, back: p.cabin.back + t * p.cabin.rakeR };
  };
  const inTray = (xm: number, ym: number, zf: number) => !!p.bed && zf * len > vs * 2 && zf < p.bed.front && ym > p.bed.floor * tall && Math.abs(xm) < bodyHalf(zf) - vs * 2;

  const inside = (x: number, y: number, z: number) => {
    const ym = ymOf(y), xm = xmOf(x), zf = zfOf(z), zm = zf * len;
    if (ym < p.sill) return false; // open underneath: the sill is the floor
    if (Math.abs(xm) > bodyHalf(zf)) return false; // inside the width line
    if (Math.abs(xm) > wellIn) for (const az of axles) {
      const dy = ym - wheelR, dz = zm - az * len;
      if (dy * dy + dz * dz < axleR * axleR) return false; // a wheel well, only as deep as the wheel
    }
    if (inTray(xm, ym, zf)) return false; // the walls and tailgate stay, the tray is empty
    if (ym <= lineAt(p.panel, zf) * tall) return true; // the lower body
    // The cabin: a glass house with raked ends, its column running down into the body so it can't float.
    if (ym > roof || Math.abs(xm) > cabHalf) return false;
    const edge = glassEdge(ym);
    return zf <= edge.front && zf >= edge.back;
  };

  const color = (x: number, y: number, z: number): string => {
    const ym = ymOf(y), xm = xmOf(x), zf = zfOf(z), zm = zf * len;
    if (Math.abs(xm) > wellIn - vs && Math.abs(xm) < bodyHalf(zf) - vs) for (const az of axles) { // the outside stays painted, so the arch has a clean edge
      const dy = ym - wheelR, dz = zm - az * len;
      if (Math.hypot(dy, dz) < axleR + vs) return ARCH; // the well's dark lining
    }
    const painted = typeof paint === 'function' ? paint(xm, ym, zm - len / 2) : paint;
    if (ym > belt && ym > lineAt(p.panel, zf) * tall) {
      if (ym > roof - vs * 2) return painted; // a steel roof
      const edge = glassEdge(ym), side = Math.abs(xm) > cabHalf - vs * 2;
      const atEnd = zf * len > edge.front * len - vs * 2 || zf * len < edge.back * len + vs * 2;
      const atB = Math.abs(zf - (p.cabin.front + p.cabin.back) / 2) * len < vs;
      if (side && (atEnd || atB)) return painted; // the pillars
      return GLASS;
    }
    if (p.bed && zf < p.bed.front && ym <= p.bed.floor * tall + vs && Math.abs(xm) < bodyHalf(zf) - vs * 2) return TRIM; // the bed liner
    const band = (top: number) => ym > p.sill + (top - p.sill) * 0.55 && ym < p.sill + (top - p.sill) * 0.88;
    const corner = Math.abs(xm) > bodyHalf(zf) * 0.5;
    if (zm > len - vs * 2 && corner && band(lineAt(p.panel, 1) * tall)) return HEAD; // headlamps at the nose corners
    if (zm < vs * 2 && corner && band(lineAt(p.panel, 0) * tall)) return TAIL; // tail lamps at the tail corners
    return painted;
  };

  // A hair over full size and no speckle, so the panels read as one surface rather than a pile of cubes.
  const body = Object.assign(voxelSolid(nx, ny, nz, vs, color, inside, false), { key: `car|${p.id}|${typeof paint === 'function' ? 'fn' : paint}|${vs}`, fill: 1.01 });

  const wr = Math.max(2, Math.round(wheelR / vs)), wn = voxelsFor(p.wheels.width, vs), rV = wheelR / vs;
  const wheel = Object.assign(voxelSolid(wn, wr * 2 + 1, wr * 2 + 1, vs, (x, y, z) => {
    const c = wr, rr = y - c, rz = z, d = Math.hypot(rr, rz);
    if (d > rV) return null;
    if (d > rV - 1.5) return TIRE; // the tread band
    if (d > rV * 0.55) return TIRE_DIM; // sidewall
    const spoke = ((Math.round(Math.atan2(rr, rz) / (Math.PI / 3)) % 2) + 2) % 2 === 0 && d < rV * 0.55;
    if (d <= rV * 0.2) return HUB;
    return spoke ? RIM : d <= rV * 0.55 ? RIM_DIM : TIRE_DIM;
  }, (x, y, z) => Math.hypot(y - wr, z) <= rV, false), { key: `wheel|${wheelR}|${p.wheels.width}|${vs}`, fill: 1.01 });

  return {
    body,
    wheels: [
      { model: wheel, x: xTrack, z: p.wheels.front * len, front: true },
      { model: wheel, x: -xTrack, z: p.wheels.front * len, front: true },
      { model: wheel, x: xTrack, z: p.wheels.rear * len, front: false },
      { model: wheel, x: -xTrack, z: p.wheels.rear * len, front: false },
    ],
    wheelRadius: wheelR,
    wheelWidth: p.wheels.width,
    wheelHub: wr,
    solid: inside,
    colorAt: color,
    grid: { lo: [x0, 0, z0], hi: [x0 + nx - 1, ny - 1, z0 + nz - 1] },
  };
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** Cells split into separate lumps, biggest first; voxels touching at a face, edge or corner count as joined (the shell pass leaves the cabin on the body by an edge). */
function lumps(cells: readonly VoxelCell[]): VoxelCell[][] {
  const left = new Map(cells.map((c) => [cellKey(c[0], c[1], c[2]), c]));
  const out: VoxelCell[][] = [];
  for (const [start, first] of left) {
    if (!left.delete(start)) continue;
    const lump: VoxelCell[] = [first], todo: VoxelCell[] = [first];
    while (todo.length) {
      const [x, y, z] = todo.pop()!;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const k = cellKey(x + dx, y + dy, z + dz), c = left.get(k);
        if (c && left.delete(k)) { lump.push(c); todo.push(c); }
      }
    }
    out.push(lump);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** How many separate lumps a model is: 1 means nothing floats. */
export const voxelPieces = (model: VoxelModel): number => lumps([...model.byColor.values()].flat()).length;

/** Where the bolted-on parts go, in metres with x and z from the middle of the car: all measured off the sculpted body, so they touch it. */
export function carFittings(p: CarBodyProfile, size: readonly [number, number, number]) {
  const [len, tall, wide] = size;
  const { vs } = carGrid(size);
  const roof = p.cabin.height * tall, belt = p.cabin.belt * tall;
  const cabLen = (p.cabin.front - p.cabin.back) * len, cabZ = ((p.cabin.front + p.cabin.back) / 2 - 0.5) * len;
  const mirrorT = 0.3, pose = drivingPosition({ floor: p.sill, belt, roof, front: cabZ + cabLen / 2, back: cabZ - cabLen / 2, wide });
  const halfAt = (zf: number) => (lineAt(p.width, zf) * wide) / 2;
  const reach = p.wheels.radius + vs * 2.5;
  const skirtBack = p.wheels.rear * len + reach, skirtFront = p.wheels.front * len - reach;
  const trackIn = (p.wheels.track * wide) / 2 - p.wheels.width / 2 - vs * 2.5, sideLimit = 0.2;
  // How far each face folds at full damage: the ends stop short of the wheels.
  const crush: Record<Side, number> = { front: Math.min(0.46, (1 - p.wheels.front) * len - reach), back: Math.min(0.4, p.wheels.rear * len - reach), left: sideLimit, right: sideLimit };
  const coreBack = Math.max(crush.back, p.bed ? p.bed.front * len : 0) + vs * 4, coreFront = len - crush.front - vs * 4; // a pickup's core stops at the bed
  let coreTop = tall;
  for (let i = 0; i <= 10; i++) coreTop = Math.min(coreTop, lineAt(p.panel, (coreBack + ((coreFront - coreBack) * i) / 10) / len) * tall);
  const coreBottom = p.sill + vs * 1.5;
  coreTop -= vs * 2;
  return {
    vs, roof, belt, cabLen, cabZ,
    /** Each mirror's root, on the cabin's side at the foot of the windscreen; mirror it across x. */
    mirror: { x: (p.cabin.width * wide) / 2, y: belt + (roof - belt) * mirrorT, z: (p.cabin.front - mirrorT * p.cabin.rakeF - 0.5) * len - vs },
    /** Where the driver sits, and the seat itself for short. */
    pose,
    seat: pose.seat,
    /** Top of the boot where the wing's posts stand, and the bumpers' half-widths. */
    deck: lineAt(p.panel, 0.05) * tall,
    bumper: { front: halfAt(1) * 0.98, back: halfAt(0) * 0.98 },
    /** The sill between the two wheel wells. */
    skirt: { x: halfAt(0.5), z: (skirtBack + skirtFront) / 2 - len / 2, length: skirtFront - skirtBack, belly: (p.sill + lineAt(p.panel, 0.5) * tall) / 2 },
    crush,
    /** The dark box inside the shell that a torn panel shows, instead of daylight through a hollow car. */
    core: { w: (Math.min(trackIn, (Math.min(...p.width.map((k) => k.v)) * wide) / 2 - sideLimit) - vs * 2) * 2, h: coreTop - coreBottom, l: coreFront - coreBack, y: (coreTop + coreBottom) / 2, z: (coreFront + coreBack) / 2 - len / 2 },
  };
}
