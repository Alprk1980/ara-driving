// Draws the wall damage worked out in wallbreak.ts. One fixed pool of voxels and pockets, so a long drive can't slow
// the game down: when the pool runs out, the building hit longest ago is put right. A damaged building's walls come
// out of the town's merged meshes and a stand-in takes over, the same walls with holes, on the same materials.
import * as THREE from 'three';
import type { Box } from '../sim/town.ts';
import { alongOf, ACROSS, cellIndex, craterRadius, HIT_HEIGHT, LAYERS, strike, TILE, TILE_VOXELS, tileKey, tilesNear, tileWidth, VOXEL, wallKey, wallOf, wallPoint, type Tile, type Wall } from './wallbreak.ts';

const POOL_TILES = 200, MAX_BUILDINGS = 8, FILL = 1.01; // a hair over full size, so an intact wall reads as wall and only the crater shows blocks
const OUTER_GAP = 0.2; // seconds between hits on a wall, so scraping along one isn't a rebuild every frame
const POCKET = '#17181d';

const col = new THREE.Color(), matrix = new THREE.Matrix4();

/** What a set of buildings has to offer to be broken: see them, take one away, and build its stand-in with the opened tiles cut out. */
export type Breakable = {
  indexOf(b: Box): number;
  setWalls(i: number, on: boolean): void;
  standIn(i: number, open: ReadonlyMap<string, ReadonlySet<string>>): THREE.Group;
  colorAt(i: number, wall: Wall, along: number, y: number, out: THREE.Color): THREE.Color;
};

type Opened = Tile & { slot: number };
type Damaged = { b: Box; index: number; mesh: THREE.Group | null; walls: Map<string, { wall: Wall; tiles: Map<string, Opened> }> };

export class WallDamage {
  private voxels: THREE.InstancedMesh;
  private pockets: THREE.InstancedMesh;
  private free: number[] = [];
  private damaged: Damaged[] = []; // oldest first
  private last = -Infinity;
  private scene: THREE.Object3D;
  private town: Breakable;

  constructor(scene: THREE.Object3D, town: Breakable) {
    this.scene = scene;
    this.town = town;
    this.voxels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), POOL_TILES * TILE_VOXELS);
    this.pockets = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: POCKET, side: THREE.BackSide }), POOL_TILES);
    for (const mesh of [this.voxels, this.pockets]) { mesh.count = 0; mesh.frustumCulled = false; }
    this.voxels.setColorAt(0, col.set('#ffffff'));
    for (let s = POOL_TILES - 1; s >= 0; s--) this.free.push(s);
    scene.add(this.pockets, this.voxels);
  }

  /** What the pool holds right now. */
  get stats() {
    let tiles = 0, voxels = 0;
    for (const d of this.damaged) for (const { tiles: all } of d.walls.values()) for (const t of all.values()) { tiles++; voxels += t.cells.filter(Boolean).length; }
    return { buildings: this.damaged.length, tiles, voxels, pool: POOL_TILES * TILE_VOXELS };
  }

  /** A car hit a building here. `y` is how far up the wall, for the bench; on the road it's the car's nose. */
  hit(b: Box, nx: number, nz: number, x: number, z: number, speed: number, y = HIT_HEIGHT, now = performance.now() / 1000) {
    if (now - this.last < OUTER_GAP) return;
    this.last = now;
    const wall = wallOf(b, nx, nz, x, z), along = alongOf(b, wall, x, z), radius = craterRadius(speed);
    const near = tilesNear(b, wall, along, y, radius);
    const d = this.buildingFor(b, near.length);
    if (!d) return;
    const entry = d.walls.get(wallKey(wall)) ?? { wall, tiles: new Map<string, Opened>() };
    d.walls.set(wallKey(wall), entry);
    for (const { col: c, row } of near) {
      const key = tileKey(c, row);
      if (entry.tiles.has(key) || !this.free.length) continue;
      entry.tiles.set(key, { col: c, row, cells: new Array(TILE_VOXELS).fill(true), slot: this.free.pop()! });
    }
    const tiles = [...entry.tiles.values()];
    strike(tiles, tileWidth(b, wall), along, y, radius);
    for (const t of tiles) this.drawTile(d.index, b, wall, t);
    this.rebuild(d);
    this.touch();
  }

  /** Put every wall right. */
  mendAll() {
    while (this.damaged.length) this.mend(this.damaged[0]);
    this.touch();
  }

  private buildingFor(b: Box, needs: number): Damaged | null {
    const found = this.damaged.find((d) => d.b === b);
    if (found) { this.damaged.push(...this.damaged.splice(this.damaged.indexOf(found), 1)); return found; } // the newest hit goes to the back of the queue
    while (this.damaged.length && (this.damaged.length >= MAX_BUILDINGS || this.free.length < needs)) this.mend(this.damaged[0]);
    const index = this.town.indexOf(b);
    if (index < 0) return null;
    this.town.setWalls(index, false);
    const d: Damaged = { b, index, mesh: null, walls: new Map() };
    this.damaged.push(d);
    return d;
  }

  private mend(d: Damaged) {
    for (const { tiles } of d.walls.values()) for (const t of tiles.values()) {
      for (let i = 0; i < TILE_VOXELS; i++) this.voxels.setMatrixAt(t.slot * TILE_VOXELS + i, matrix.makeScale(0, 0, 0));
      this.pockets.setMatrixAt(t.slot, matrix.makeScale(0, 0, 0));
      this.free.push(t.slot);
    }
    this.town.setWalls(d.index, true);
    this.dropMesh(d);
    this.damaged.splice(this.damaged.indexOf(d), 1);
  }

  private dropMesh(d: Damaged) {
    if (!d.mesh) return;
    this.scene.remove(d.mesh);
    for (const m of d.mesh.children) (m as THREE.Mesh).geometry.dispose();
  }

  private drawTile(index: number, b: Box, wall: Wall, t: Opened) {
    const tw = tileWidth(b, wall);
    const across = tw / ACROSS, sized = wall.axis === 'x' ? [VOXEL, VOXEL, across] : [across, VOXEL, VOXEL];
    for (let layer = 0; layer < LAYERS; layer++) for (let j = 0; j < ACROSS; j++) for (let i = 0; i < ACROSS; i++) {
      const at = t.slot * TILE_VOXELS + cellIndex(i, j, layer), along = (t.col + (i + 0.5) / ACROSS) * tw, y = (t.row + (j + 0.5) / ACROSS) * TILE;
      if (!t.cells[cellIndex(i, j, layer)]) { this.voxels.setMatrixAt(at, matrix.makeScale(0, 0, 0)); continue; }
      const { x, z } = wallPoint(b, wall, along, (layer + 0.5) * VOXEL);
      this.voxels.setMatrixAt(at, matrix.makeScale(sized[0] * FILL, sized[1] * FILL, sized[2] * FILL).setPosition(x, y, z));
      this.voxels.setColorAt(at, this.town.colorAt(index, wall, along, y, col));
    }
    const depth = LAYERS * VOXEL + 0.02, { x, z } = wallPoint(b, wall, (t.col + 0.5) * tw, depth / 2);
    this.pockets.setMatrixAt(t.slot, matrix.makeScale(wall.axis === 'x' ? depth : tw, TILE, wall.axis === 'x' ? tw : depth).setPosition(x, (t.row + 0.5) * TILE, z));
  }

  /** The stand-in walls: the same building, but for the tiles opened on it. */
  private rebuild(d: Damaged) {
    this.dropMesh(d);
    d.mesh = this.town.standIn(d.index, new Map([...d.walls].map(([k, v]) => [k, new Set(v.tiles.keys())])));
    this.scene.add(d.mesh);
  }

  private touch() {
    const top = this.free.length === POOL_TILES ? 0 : Math.max(...Array.from({ length: POOL_TILES }, (_, s) => s).filter((s) => !this.free.includes(s))) + 1;
    this.voxels.count = top * TILE_VOXELS;
    this.pockets.count = top;
    this.voxels.instanceMatrix.needsUpdate = this.pockets.instanceMatrix.needsUpdate = true;
    if (this.voxels.instanceColor) this.voxels.instanceColor.needsUpdate = true;
  }
}
