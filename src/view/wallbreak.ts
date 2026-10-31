/**
 * Breaking a building's wall, pure so it can be tested: no three here, src/view/walls.ts draws it. A wall stays one
 * plain quad until it's hit. A hit opens the 2 m tiles around it, each a tile of voxels two layers deep, and knocks a
 * crater out of them. Only opened tiles cost anything, so the town can stay 1,700 plain boxes.
 */
import type { Box } from '../sim/town.ts';

type Footprint = Pick<Box, 'x' | 'z' | 'hx' | 'hz'>;

export const TILE = 2; // metres, roughly along the wall and exactly up it
export const ROWS = 2; // tiles up the wall from the ground: a car never reaches further
export const ACROSS = 4, LAYERS = 2; // voxels in a tile, each way across it, and deep
export const VOXEL = TILE / ACROSS;
export const TILE_VOXELS = ACROSS * ACROSS * LAYERS;
export const HIT_HEIGHT = 0.8; // metres up the wall that a car's nose lands
const FULL_MPS = 28; // as car.ts DAMAGE_FULL_MPS: the hardest hit makes the widest crater

export type Wall = { axis: 'x' | 'z'; sign: 1 | -1 };
export const WALLS: Wall[] = [{ axis: 'x', sign: 1 }, { axis: 'x', sign: -1 }, { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 }];
export const wallKey = (w: Wall) => `${w.axis}${w.sign > 0 ? '+' : '-'}`;

/** Which wall took a blow, from the normal pointing out at the car; on a corner, the one the hit is nearest. */
export function wallOf(b: Box, nx: number, nz: number, x: number, z: number): Wall {
  if (nx && !nz) return { axis: 'x', sign: nx > 0 ? 1 : -1 };
  if (nz && !nx) return { axis: 'z', sign: nz > 0 ? 1 : -1 };
  const outX = Math.abs(x - b.x) - b.hx, outZ = Math.abs(z - b.z) - b.hz;
  return outX >= outZ ? { axis: 'x', sign: x >= b.x ? 1 : -1 } : { axis: 'z', sign: z >= b.z ? 1 : -1 };
}

export const wallSpan = (b: Footprint, w: Wall) => (w.axis === 'x' ? b.hz : b.hx) * 2;
export const tileCols = (b: Box, w: Wall) => Math.max(1, Math.floor(wallSpan(b, w) / TILE));
export const tileWidth = (b: Box, w: Wall) => wallSpan(b, w) / tileCols(b, w);

/** Metres along a wall from its low end, for a world position. */
export const alongOf = (b: Box, w: Wall, x: number, z: number) => Math.max(0, Math.min(wallSpan(b, w), w.axis === 'x' ? z - (b.z - b.hz) : x - (b.x - b.hx)));

/** World x and z of a point on a wall, `depth` metres in from its face. */
export function wallPoint(b: Footprint, w: Wall, along: number, depth: number): { x: number; z: number } {
  return w.axis === 'x' ? { x: b.x + w.sign * (b.hx - depth), z: b.z - b.hz + along } : { x: b.x - b.hx + along, z: b.z + w.sign * (b.hz - depth) };
}

/** The crater's radius in metres for an impact speed. */
export const craterRadius = (speed: number) => Math.min(3, 0.9 + (Math.max(0, speed) / FULL_MPS) * 2.6);

export const tileKey = (col: number, row: number) => `${col},${row}`;
export const cellIndex = (i: number, j: number, layer: number) => (layer * ACROSS + j) * ACROSS + i;

/** One opened tile: which of its voxels are still there. */
export type Tile = { col: number; row: number; cells: boolean[] };

/** The tiles a crater reaches on this wall. */
export function tilesNear(b: Box, w: Wall, along: number, y: number, radius: number): { col: number; row: number }[] {
  const cols = tileCols(b, w), tw = tileWidth(b, w), out: { col: number; row: number }[] = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < cols; col++) {
    const nearA = Math.max(col * tw - along, 0, along - (col + 1) * tw), nearY = Math.max(row * TILE - y, 0, y - (row + 1) * TILE);
    if (Math.hypot(nearA, nearY) < radius + 0.7) out.push({ col, row });
  }
  return out;
}

/** A small stable hash of a voxel, so a crater's edge is jagged but repeatable. */
function jag(a: number, y: number, layer: number): number {
  let h = Math.imul(a * 73856093 ^ y * 19349663 ^ layer * 83492791, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 5) / 5;
}

/** Knock a crater out of a wall's opened tiles: through the outer layer at `radius`, the inner one nearer the middle; a voxel left with no neighbours falls. */
export function strike(tiles: readonly Tile[], tw: number, along: number, y: number, radius: number) {
  const here = new Map<string, Tile>(tiles.map((t) => [tileKey(t.col, t.row), t]));
  for (const t of tiles) for (let layer = 0; layer < LAYERS; layer++) for (let j = 0; j < ACROSS; j++) for (let i = 0; i < ACROSS; i++) {
    const a = t.col * ACROSS + i, h = t.row * ACROSS + j;
    const d = Math.hypot(((a + 0.5) / ACROSS) * tw - along, ((h + 0.5) / ACROSS) * TILE - y);
    if (d < (layer === 0 ? radius : radius * 0.65) + jag(a, h, layer) * 0.6 - 0.2) t.cells[cellIndex(i, j, layer)] = false;
  }
  const alive = (a: number, h: number, layer: number) => {
    if (layer < 0 || layer >= LAYERS || h < 0) return false;
    if (h >= ROWS * ACROSS) return true; // the wall above the tiles
    const t = here.get(tileKey(Math.floor(a / ACROSS), Math.floor(h / ACROSS)));
    return t ? t.cells[cellIndex(a % ACROSS, h % ACROSS, layer)] : true; // a tile not opened is solid wall, and holds its neighbours up
  };
  for (const t of tiles) for (let layer = 0; layer < LAYERS; layer++) for (let j = 0; j < ACROSS; j++) for (let i = 0; i < ACROSS; i++) {
    const a = t.col * ACROSS + i, h = t.row * ACROSS + j;
    if (!t.cells[cellIndex(i, j, layer)]) continue;
    const held = alive(a - 1, h, layer) || alive(a + 1, h, layer) || alive(a, h - 1, layer) || alive(a, h + 1, layer) || alive(a, h, layer ? 0 : 1);
    if (!held) t.cells[cellIndex(i, j, layer)] = false;
  }
}

export type Quad = { a0: number; a1: number; y0: number; y1: number };

/** A stretch of wall, from y0 to y1, as the rectangles left around its opened tiles: runs of closed tiles merged. */
export function cutRect(b: Box, w: Wall, r: { hx: number; hz: number; y0: number; y1: number }, open: ReadonlySet<string> | undefined): Quad[] {
  const span = wallSpan({ x: 0, z: 0, hx: r.hx, hz: r.hz }, w);
  if (!open?.size) return [{ a0: 0, a1: span, y0: r.y0, y1: r.y1 }];
  const cols = tileCols(b, w), tw = tileWidth(b, w), out: Quad[] = [];
  const cuts = [r.y0, ...Array.from({ length: ROWS + 1 }, (_, k) => k * TILE).filter((y) => y > r.y0 && y < r.y1), r.y1];
  for (let k = 0; k < cuts.length - 1; k++) {
    const y0 = cuts[k], y1 = cuts[k + 1], row = Math.floor(y0 / TILE);
    if (row >= ROWS) { out.push({ a0: 0, a1: span, y0, y1 }); continue; }
    let from = -1;
    for (let col = 0; col <= cols; col++) {
      const closed = col < cols && !open.has(tileKey(col, row));
      if (closed && from < 0) from = col;
      if (!closed && from >= 0) { out.push({ a0: from * tw, a1: col * tw, y0, y1 }); from = -1; }
    }
  }
  return out;
}