import { describe, expect, it } from 'vitest';
import { surfaceNet } from '../view/carsurface.ts';
import { simplify, type Mesh } from './wrap.ts';

/** A shape as a skin, as the tool makes one. */
function skinOf(n: number, solid: (x: number, y: number, z: number) => boolean, hue: (x: number, y: number, z: number) => string = () => 'a', passes = 4): Mesh {
  const s = surfaceNet({ lo: [0, 0, 0], hi: [n - 1, n - 1, n - 1] }, solid, hue, (x, y, z) => [x, y, z], passes), names = [...s.quads.keys()], tris: number[] = [], hues: number[] = [];
  names.forEach((name, h) => { const list = s.quads.get(name)!; for (let i = 0; i < list.length; i += 3) { tris.push(list[i], list[i + 1], list[i + 2]); hues.push(h); } });
  return { points: s.points, tris, hues };
}

const area = (m: { points: ArrayLike<number>; tris: number[]; hues: number[] }, hue?: number) => {
  let sum = 0;
  for (let t = 0; t < m.tris.length / 3; t++) {
    if (hue !== undefined && m.hues[t] !== hue) continue;
    const [a, b, c] = [m.tris[t * 3] * 3, m.tris[t * 3 + 1] * 3, m.tris[t * 3 + 2] * 3], p = m.points;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
};
const box = (x: number, y: number, z: number) => x >= 8 && x < 32 && y >= 8 && y < 32 && z >= 8 && z < 32;
const ball = (x: number, y: number, z: number) => Math.hypot(x - 20, y - 20, z - 20) < 14;

describe('wrapping a skin for the game', () => {
  it('takes a box down to almost nothing', () => {
    const m = skinOf(40, box), w = simplify(m, 100);
    expect(m.tris.length / 3).toBeGreaterThan(3000);
    expect(w.tris.length / 3).toBeLessThanOrEqual(100);
    expect(Math.abs(area(w) - area(m)) / area(m)).toBeLessThan(0.05);
  });

  it('keeps a ball round, spending its triangles on the curve', () => {
    const m = skinOf(40, ball), w = simplify(m, 400), radius = (i: number, p: ArrayLike<number>) => Math.hypot(p[i] - 20, p[i + 1] - 20, p[i + 2] - 20);
    expect(w.tris.length / 3).toBeLessThanOrEqual(400);
    const rs: number[] = [];
    for (let i = 0; i < w.points.length; i += 3) rs.push(radius(i, w.points));
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(2.5);
    expect(Math.abs(area(w) - area(m)) / area(m)).toBeLessThan(0.06);
  });

  it('keeps a window on a flat wall, at its own size', () => {
    const windowed = (x: number, y: number) => (x >= 16 && x < 24 && y >= 16 && y < 24 ? 'w' : 'a');
    const m = skinOf(40, box, (x, y, z) => (z >= 31 ? windowed(x, y) : 'a')), w = simplify(m, 200), glass = [...new Set(m.hues)].find((h) => area(m, h) < area(m) / 3)!;
    expect(area(w, glass)).toBeGreaterThan(area(m, glass) * 0.85);
    expect(area(w, glass)).toBeLessThan(area(m, glass) * 1.15);
  });

  it('leaves no folded or broken surface behind', () => {
    const w = simplify(skinOf(40, ball), 200), edges = new Map<string, number>();
    for (let t = 0; t < w.tris.length / 3; t++) for (let k = 0; k < 3; k++) { const a = w.tris[t * 3 + k], b = w.tris[t * 3 + (k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
    expect([...edges.values()].every((n) => n === 2)).toBe(true); // closed, with no holes or pinches
  });

  it('stops short of the budget rather than damage the shape', () => {
    const m = skinOf(40, ball), w = simplify(m, 10, 0.05);
    expect(w.tris.length / 3).toBeGreaterThan(10);
  });

  it('is quick enough to run while you wait', () => {
    const m = skinOf(64, (x, y, z) => Math.hypot(x - 32, y - 32, z - 32) < 28), start = performance.now();
    simplify(m, 2000);
    expect(performance.now() - start).toBeLessThan(10000);
  });
});
