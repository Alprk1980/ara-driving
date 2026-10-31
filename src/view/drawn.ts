// The buildings built from drawings, standing in the town. Their pieces are merged into one mesh per patch of the map, so a patch out of
// view costs nothing, and each patch has a plain twin with the windows and small trim left off, for when it's far enough away not to show.
// They break as the town's other buildings do, through WallDamage: one that's hit comes out of its patch, and a stand-in takes over,
// the same pieces with the opened tiles cut out of them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Piece } from '../../schemas/house.ts';
import { piecesGeometry } from '../photovox/pieces.ts';
import { DRAWN_FOOT, type Box, type Town } from '../sim/town.ts';
import { TILE, tileWidth, VOXEL, LAYERS, wallKey, wallPoint, WALLS, type Wall } from './wallbreak.ts';
import type { Breakable } from './walls.ts';

const PATCH_M = 320, NEAR_M = 300; // the twin swaps in past NEAR_M, about where a window stops reading through the fog
const PLAIN_AREA_M2 = 8; // a panel smaller than this is left off the plain twin
const SITE_REACH_M = 2.5; // how far from a building's walls a hit still counts as a hit on it: a porch post, say
const CRATER_DEPTH = LAYERS * VOXEL, PROUD_M = 1.6; // how far a hole runs in behind the wall, and out past it through porches and panels
const FILES = (import.meta as unknown as { glob: (path: string, opts: { eager: true }) => Record<string, { default: { id: string; pieces: Piece[] } }> }).glob('../data/drawn/*.json', { eager: true });
const PIECES = new Map(Object.values(FILES).map(({ default: b }) => [b.id, b.pieces]));

const plain = (pieces: Piece[]) => pieces.filter((p) => p.role === 'wall' || p.role === 'roof' || Math.max(p.w * p.l, p.w * p.h, p.l * p.h) >= PLAIN_AREA_M2);

type Span = { start: number; count: number };
type Patch = { near: THREE.Mesh; far: THREE.Mesh; at: THREE.Vector3 };
type Cuboid = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
type Site = { id: string; x: number; z: number; turn: number; box: Box; matrix: THREE.Matrix4; patch: Patch | null; near: Span; far: Span };

const material = () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

/** Everything the town stands on a drawing: the lots, the place plots and the stations. */
function placements(town: Town) {
  const out: { id: string; x: number; z: number; turn: number }[] = [];
  for (const b of town.boxes) if (b.drawn) out.push({ id: b.drawn, x: b.x, z: b.z, turn: b.turn ?? 0 });
  for (const d of town.drawnPlots.values()) out.push(d);
  for (const s of town.services) { const f = DRAWN_FOOT.find((m) => m.service === s.id); if (f) out.push({ id: f.id, x: s.x, z: s.z, turn: s.heading }); }
  return out;
}

/** The walls at street level, as an axis-aligned box in the town: what a crater lands on, set in from any porch out in front. */
function wallBox(pieces: Piece[], m: THREE.Matrix4): Box {
  const low = pieces.filter((p) => p.role === 'wall' && p.y < 1 && p.h > 2.5), box = new THREE.Box3(), v = new THREE.Vector3();
  for (const p of low) for (const x of [p.x - p.w / 2, p.x + p.w / 2]) for (const z of [p.z - p.l / 2, p.z + p.l / 2]) box.expandByPoint(v.set(x, 0, z).applyMatrix4(m));
  return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, hx: (box.max.x - box.min.x) / 2, hz: (box.max.z - box.min.z) / 2, h: 0, hue: 0 };
}

/** What's left of a box with a cuboid taken out: up to six boxes. */
export function cut(p: Piece, c: Cuboid): Piece[] {
  const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y0 = p.y, y1 = p.y + p.h, z0 = p.z - p.l / 2, z1 = p.z + p.l / 2;
  if (c.x1 <= x0 || c.x0 >= x1 || c.y1 <= y0 || c.y0 >= y1 || c.z1 <= z0 || c.z0 >= z1) return [p];
  if (p.role === 'roof') return [p];
  if (p.fall !== undefined || p.arch) return p.h > TILE * 3 ? [p] : []; // a tall raked panel stays; an arch or a brace goes with the wall it was on
  const out: Piece[] = [], part = (a0: number, a1: number, b0: number, b1: number, d0: number, d1: number) => { if (a1 - a0 > 0.01 && b1 - b0 > 0.01 && d1 - d0 > 0.01) out.push({ ...p, x: (a0 + a1) / 2, w: a1 - a0, y: b0, h: b1 - b0, z: (d0 + d1) / 2, l: d1 - d0 }); };
  const cx0 = Math.max(x0, c.x0), cx1 = Math.min(x1, c.x1), cy0 = Math.max(y0, c.y0), cy1 = Math.min(y1, c.y1);
  part(x0, cx0, y0, y1, z0, z1);
  part(cx1, x1, y0, y1, z0, z1);
  part(cx0, cx1, y0, cy0, z0, z1);
  part(cx0, cx1, cy1, y1, z0, z1);
  part(cx0, cx1, cy0, cy1, z0, Math.max(z0, c.z0));
  part(cx0, cx1, cy0, cy1, Math.min(z1, c.z1), z1);
  return out;
}

export class DrawnBuildings implements Breakable {
  private patches: Patch[] = [];
  private sites: Site[] = [];
  private home = new Map<THREE.BufferAttribute, Float32Array>();
  private mat = material();
  readonly count: number;

  constructor(scene: THREE.Scene, town: Town) {
    const near = new Map<string, THREE.BufferGeometry>(), far = new Map<string, THREE.BufferGeometry>();
    const cells = new Map<string, { near: THREE.BufferGeometry[]; far: THREE.BufferGeometry[]; sites: Site[]; x: number; z: number; n: number }>();
    const shift = new THREE.Matrix4(), all = placements(town);
    this.count = all.length;
    for (const p of all) {
      const pieces = PIECES.get(p.id), foot = DRAWN_FOOT.find((f) => f.id === p.id);
      if (!pieces || !foot) continue;
      if (!near.has(p.id)) { near.set(p.id, piecesGeometry(pieces)); far.set(p.id, piecesGeometry(plain(pieces))); }
      // The sites hold the middle of the solid footprint, and the pieces start from the front left corner.
      const m = new THREE.Matrix4().makeRotationY(p.turn).setPosition(p.x, 0, p.z).multiply(shift.makeTranslation(-foot.cx, 0, -foot.cz));
      const key = `${Math.floor(p.x / PATCH_M)},${Math.floor(p.z / PATCH_M)}`;
      if (!cells.has(key)) cells.set(key, { near: [], far: [], sites: [], x: 0, z: 0, n: 0 });
      const c = cells.get(key)!, count = (list: THREE.BufferGeometry[]) => list.reduce((n, g) => n + g.getAttribute('position').count, 0);
      const site: Site = { ...p, box: wallBox(pieces, m), matrix: m, patch: null, near: { start: count(c.near), count: near.get(p.id)!.getAttribute('position').count }, far: { start: count(c.far), count: far.get(p.id)!.getAttribute('position').count } };
      c.near.push(near.get(p.id)!.clone().applyMatrix4(m));
      c.far.push(far.get(p.id)!.clone().applyMatrix4(m));
      c.sites.push(site);
      this.sites.push(site);
      c.x += p.x; c.z += p.z; c.n++;
    }
    for (const c of cells.values()) {
      const a = new THREE.Mesh(mergeGeometries(c.near), this.mat), b = new THREE.Mesh(mergeGeometries(c.far), this.mat);
      for (const g of [...c.near, ...c.far]) g.dispose();
      a.castShadow = a.receiveShadow = b.receiveShadow = true;
      for (const mesh of [a, b]) scene.add(mesh);
      b.visible = false;
      const patch = { near: a, far: b, at: new THREE.Vector3(c.x / c.n, 0, c.z / c.n) };
      for (const s of c.sites) s.patch = patch;
      this.patches.push(patch);
    }
    for (const g of [...near.values(), ...far.values()]) g.dispose();
  }

  /** Close patches in full, the rest plain. */
  update(from: THREE.Vector3) {
    for (const p of this.patches) {
      const close = Math.hypot(p.at.x - from.x, p.at.z - from.z) < NEAR_M + PATCH_M / 2;
      if (p.near.visible !== close) { p.near.visible = close; p.far.visible = !close; }
    }
  }

  /** The drawn building a car has just hit, as the box its walls make. */
  boxAt(x: number, z: number): Box | null {
    let best: Site | null = null, gap = SITE_REACH_M;
    for (const s of this.sites) {
      const out = Math.max(Math.abs(x - s.box.x) - s.box.hx, Math.abs(z - s.box.z) - s.box.hz);
      if (out < gap) { gap = out; best = s; }
    }
    return best?.box ?? null;
  }

  indexOf(b: Box) { return this.sites.findIndex((s) => s.box === b); }

  private collapse(mesh: THREE.Mesh, r: Span, on: boolean) {
    const a = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!this.home.has(a)) this.home.set(a, (a.array as Float32Array).slice());
    const arr = a.array as Float32Array, was = this.home.get(a)!;
    if (on) arr.set(was.subarray(r.start * 3, (r.start + r.count) * 3), r.start * 3);
    else arr.fill(0, r.start * 3, (r.start + r.count) * 3);
    a.needsUpdate = true;
  }

  setWalls(i: number, on: boolean) {
    const s = this.sites[i];
    if (!s.patch) return;
    this.collapse(s.patch.near, s.near, on);
    this.collapse(s.patch.far, s.far, on);
  }

  /** Where a tile lands on the building's own pieces, running from behind the wall out through whatever stands in front of it. */
  private tileIn(s: Site, wall: Wall, col: number, row: number): Cuboid {
    const tw = tileWidth(s.box, wall), inverse = s.matrix.clone().invert(), box = new THREE.Box3(), v = new THREE.Vector3();
    for (const along of [col * tw, (col + 1) * tw]) for (const inset of [-PROUD_M, CRATER_DEPTH]) { const w = wallPoint(s.box, wall, along, inset); box.expandByPoint(v.set(w.x, 0, w.z).applyMatrix4(inverse)); }
    return { x0: box.min.x, x1: box.max.x, y0: row * TILE - (row === 0 ? 0.3 : 0), y1: (row + 1) * TILE, z0: box.min.z, z1: box.max.z };
  }

  standIn(i: number, open: ReadonlyMap<string, ReadonlySet<string>>): THREE.Group {
    const s = this.sites[i];
    let pieces = PIECES.get(s.id) ?? [];
    for (const wall of WALLS) for (const key of open.get(wallKey(wall)) ?? []) {
      const [col, row] = key.split(',').map(Number), c = this.tileIn(s, wall, col, row);
      pieces = pieces.flatMap((p) => cut(p, c));
    }
    const g = piecesGeometry(pieces).applyMatrix4(s.matrix), mesh = new THREE.Mesh(g, this.mat), group = new THREE.Group();
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  /** The colour of whatever stands furthest out at a spot on the wall, for the voxels that replace it. */
  colorAt(i: number, wall: Wall, along: number, y: number, out: THREE.Color): THREE.Color {
    const s = this.sites[i], inverse = s.matrix.clone().invert(), a = wallPoint(s.box, wall, along, 0), b = wallPoint(s.box, wall, along, -1);
    const on = new THREE.Vector3(a.x, 0, a.z).applyMatrix4(inverse), ahead = new THREE.Vector3(b.x, 0, b.z).applyMatrix4(inverse).sub(on);
    const onX = Math.abs(ahead.x) > Math.abs(ahead.z), sign = Math.sign(onX ? ahead.x : ahead.z) || 1;
    let best: Piece | null = null, reach = -Infinity;
    for (const p of PIECES.get(s.id) ?? []) {
      if (p.role === 'roof' || Math.abs(y - (p.y + p.h / 2)) > p.h / 2) continue;
      if (onX ? Math.abs(on.z - p.z) > p.l / 2 : Math.abs(on.x - p.x) > p.w / 2) continue;
      const front = (onX ? p.x : p.z) * sign + (onX ? p.w : p.l) / 2;
      if (front > (onX ? on.x : on.z) * sign + 0.5) continue; // a porch out in front isn't the wall
      if (front > reach) { reach = front; best = p; }
    }
    return out.set(best?.color ?? '#888888');
  }
}
