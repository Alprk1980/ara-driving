import { describe, expect, it } from 'vitest';
import { Town, type Box } from '../sim/town.ts';
import { cellIndex, craterRadius, cutRect, ROWS, strike, TILE, TILE_VOXELS, tileCols, tilesNear, tileWidth, tileKey, wallOf, wallPoint, WALLS, wallSpan, type Tile } from './wallbreak.ts';

const block: Box = { x: 100, z: 200, hx: 12.5, hz: 9, h: 14, hue: 0.3 };
const open = (b: Box, w: (typeof WALLS)[number], along: number, y: number, r: number): Tile[] => tilesNear(b, w, along, y, r).map((t) => ({ ...t, cells: new Array(TILE_VOXELS).fill(true) }));
const left = (tiles: Tile[]) => tiles.reduce((n, t) => n + t.cells.filter(Boolean).length, 0);

describe('which wall took it', () => {
  it('follows the normal, and on a corner the nearer wall', () => {
    expect(wallOf(block, 1, 0, 113, 200)).toEqual({ axis: 'x', sign: 1 });
    expect(wallOf(block, 0, -1, 100, 190)).toEqual({ axis: 'z', sign: -1 });
    expect(wallOf(block, 1, 1, 114, 209.5)).toEqual({ axis: 'x', sign: 1 });
  });
});

describe('the wall around a hole', () => {
  it('covers every bit of the wall the tiles do not, for every wall of real buildings', () => {
    const town = new Town();
    for (const b of town.boxes.slice(0, 200)) for (const w of WALLS) {
      const tiles = open(b, w, wallSpan(b, w) / 2, 0.8, 3), opened = new Set(tiles.map((t) => tileKey(t.col, t.row)));
      const area = cutRect(b, w, { hx: b.hx, hz: b.hz, y0: 0, y1: b.h }, opened).reduce((n, q) => n + (q.a1 - q.a0) * (q.y1 - q.y0), 0);
      expect(area + opened.size * tileWidth(b, w) * TILE).toBeCloseTo(wallSpan(b, w) * b.h, 6);
    }
  });

  it('is one quad when nothing is open, and never overlaps a tile', () => {
    const w = WALLS[0], rect = { hx: block.hx, hz: block.hz, y0: 0, y1: block.h };
    expect(cutRect(block, w, rect, new Set()).length).toBe(1);
    const quads = cutRect(block, w, rect, new Set([tileKey(2, 0)])), tw = tileWidth(block, w);
    for (const q of quads) expect(q.y0 >= TILE || q.a1 <= 2 * tw + 1e-9 || q.a0 >= 3 * tw - 1e-9).toBe(true);
  });

  it('cuts a street floor and the wall above it where the tiles run across the join', () => {
    const w = WALLS[0], tw = tileWidth(block, w), opened = new Set([tileKey(1, 0), tileKey(1, 1)]);
    const low = cutRect(block, w, { hx: block.hx, hz: block.hz, y0: 0, y1: 3 }, opened), high = cutRect(block, w, { hx: block.hx, hz: block.hz, y0: 3, y1: block.h }, opened);
    const covered = [...low, ...high].reduce((n, q) => n + (q.a1 - q.a0) * (q.y1 - q.y0), 0);
    expect(covered + 2 * tw * TILE).toBeCloseTo(wallSpan(block, w) * block.h, 6);
  });

  it('puts points on the face, and depth inside it', () => {
    for (const w of WALLS) {
      const out = wallPoint(block, w, 5, 0), inn = wallPoint(block, w, 5, 1);
      expect(Math.max(Math.abs(out.x - block.x) / block.hx, Math.abs(out.z - block.z) / block.hz)).toBeCloseTo(1, 9);
      expect(Math.max(Math.abs(inn.x - block.x) - block.hx, Math.abs(inn.z - block.z) - block.hz)).toBeCloseTo(-1, 9);
    }
  });
});

describe('a crater', () => {
  const w = WALLS[2], tw = tileWidth(block, w);

  it('opens about the 200 voxels the plan allowed, even at the hardest hit', () => {
    const tiles = open(block, w, 12, 0.8, craterRadius(30));
    expect(tiles.length).toBeLessThanOrEqual(12);
    expect(tiles.length * TILE_VOXELS).toBeLessThanOrEqual(384);
    expect(open(block, w, 12, 0.8, craterRadius(5)).length * TILE_VOXELS).toBeLessThanOrEqual(192);
  });

  it('grows with speed, goes deeper at its middle, and repeats exactly', () => {
    const hit = (speed: number) => { const t = open(block, w, 12, 0.8, 3); strike(t, tw, 12, 0.8, craterRadius(speed)); return t; };
    expect(left(hit(25))).toBeLessThan(left(hit(6)));
    expect(hit(14)).toEqual(hit(14));
    const t = hit(25), outer = t.flatMap((x) => x.cells.slice(0, TILE_VOXELS / 2)), inner = t.flatMap((x) => x.cells.slice(TILE_VOXELS / 2));
    expect(outer.filter(Boolean).length).toBeLessThan(inner.filter(Boolean).length);
    expect(inner.some((c) => !c)).toBe(true);
  });

  it('adds up over repeated hits and never brings a voxel back', () => {
    const t = open(block, w, 12, 0.8, 3);
    strike(t, tw, 12, 0.8, 1.2);
    const one = left(t), was = t.map((x) => [...x.cells]);
    strike(t, tw, 14, 0.8, 1.2);
    expect(left(t)).toBeLessThan(one);
    t.forEach((x, k) => x.cells.forEach((c, i) => { if (!was[k][i]) expect(c).toBe(false); }));
  });

  it('leaves no voxel hanging on its own', () => {
    for (const speed of [6, 12, 20, 28]) for (let along = 3; along < 22; along += 1.7) {
      const t = open(block, w, along, 0.8, craterRadius(speed));
      strike(t, tw, along, 0.8, craterRadius(speed));
      const cell = (a: number, h: number, l: number) => {
        const x = t.find((q) => q.col === Math.floor(a / 4) && q.row === Math.floor(h / 4));
        if (!x) return a >= 0 && h >= 0 && h < ROWS * 4 && a < tileCols(block, w) * 4; // solid wall
        return l >= 0 && l < 2 && x.cells[cellIndex(a % 4, h % 4, l)];
      };
      for (const x of t) for (let l = 0; l < 2; l++) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        if (!x.cells[cellIndex(i, j, l)]) continue;
        const a = x.col * 4 + i, h = x.row * 4 + j;
        expect(cell(a - 1, h, l) || cell(a + 1, h, l) || cell(a, h - 1, l) || cell(a, h + 1, l) || cell(a, h, 1 - l)).toBeTruthy();
      }
    }
  });
});
