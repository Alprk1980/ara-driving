import { describe, expect, it } from 'vitest';
import profilesJson from '../data/carprofiles.json';
import type { CarBodyProfile } from '../../schemas/carprofiles.ts';
import type { Mark, Side } from '../sim/car.ts';
import { CARS } from '../sim/economy.ts';
import { foldSkin, skinNormals, surfaceNet } from './carsurface.ts';
import { carFittings, carVoxels, GLASS, HEAD, TAIL } from './voxels.ts';

const profiles = profilesJson as unknown as CarBodyProfile[];
const rigs = CARS.map((car) => {
  const p = profiles.find((x) => x.id === car.id)!, c = carVoxels(p, car.size, '#d0443c'), vs = c.body.size, [mx, mz] = c.body.mid;
  const skin = surfaceNet(c.grid, c.solid, c.colorAt, (x, y, z) => [(x - mx) * vs, (y + 0.5) * vs, (z - mz) * vs]);
  return { car, p, vs, skin, fit: carFittings(p, car.size) };
});
const SIDES: Side[] = ['front', 'back', 'left', 'right'];
const axis = { front: [2, 1], back: [2, -1], left: [0, 1], right: [0, -1] } as const;
const extent = (pts: ArrayLike<number>, k: number, sign: number) => { let m = -Infinity; for (let i = k; i < pts.length; i += 3) m = Math.max(m, sign * pts[i]); return m; };

describe('the skin', () => {
  it('stays true to the car it was sculpted from, within a voxel or two', () => {
    for (const r of rigs) {
      const [len, tall, wide] = r.car.size;
      expect(extent(r.skin.points, 2, 1), r.car.id).toBeGreaterThan(len / 2 - r.vs * 3);
      expect(extent(r.skin.points, 2, 1), r.car.id).toBeLessThan(len / 2 + r.vs);
      expect(extent(r.skin.points, 0, 1), r.car.id).toBeGreaterThan((wide * 0.8) / 2);
      expect(extent(r.skin.points, 1, 1), r.car.id).toBeLessThan(tall + r.vs);
      expect(extent(r.skin.points, 1, 1), r.car.id).toBeGreaterThan(r.p.cabin.height * tall - r.vs * 3);
    }
  });

  it('is smooth: far fewer flat 90 degree steps than a pile of cubes', () => {
    for (const r of rigs) {
      const n = new Float32Array(r.skin.points.length);
      skinNormals(r.skin.points, r.skin.quads.values(), n);
      let axisAligned = 0;
      for (let i = 0; i < n.length; i += 3) if (Math.max(Math.abs(n[i]), Math.abs(n[i + 1]), Math.abs(n[i + 2])) > 0.985) axisAligned++;
      expect(axisAligned / (n.length / 3), r.car.id).toBeLessThan(0.7);
    }
  });

  it('keeps its glass and its lamps as their own surfaces, and stays light enough for a phone', () => {
    for (const r of rigs) {
      for (const hue of [GLASS, HEAD, TAIL]) expect(r.skin.quads.get(hue)?.length ?? 0, `${r.car.id} ${hue}`).toBeGreaterThan(30);
      const tris = [...r.skin.quads.values()].reduce((n, l) => n + l.length / 3, 0);
      expect(tris, r.car.id).toBeLessThan(28000);
    }
  });

  it('has outward-facing normals', () => {
    for (const r of rigs) {
      const n = new Float32Array(r.skin.points.length);
      skinNormals(r.skin.points, r.skin.quads.values(), n);
      let out = 0, count = 0;
      for (let i = 0; i < n.length; i += 3) {
        if (r.skin.points[i + 1] < r.car.size[1] * 0.75) continue; // the roof and the top of the cabin face up
        count++;
        if (n[i + 1] > -0.2) out++;
      }
      expect(out / count, r.car.id).toBeGreaterThan(0.9);
    }
  });
});

describe('a crash folds the skin (every car, side and depth)', () => {
  const fold = (r: (typeof rigs)[number], marks: Mark[]) => {
    const out = new Float32Array(r.skin.points.length);
    foldSkin(r.skin.points, out, marks, r.fit.crush, r.car.size);
    return out;
  };

  it('leaves an unmarked car exactly as sculpted', () => {
    for (const r of rigs) expect(fold(r, [])).toEqual(r.skin.points);
  });

  it('shortens the side it hit, deeper the harder the hit, and leaves the far side alone', () => {
    for (const r of rigs) for (const side of SIDES) {
      const [k, sign] = axis[side], whole = extent(r.skin.points, k, sign);
      let was = whole;
      for (const depth of [0.2, 0.5, 1]) {
        const out = fold(r, [{ side, at: 0, depth }]);
        let centre = -Infinity;
        const other = k === 2 ? 0 : 2, span = (k === 2 ? r.car.size[2] : r.car.size[0]) * 0.1;
        for (let i = 0; i < out.length; i += 3) if (Math.abs(out[i + other]) < span) centre = Math.max(centre, sign * out[i + k]);
        expect(centre, `${r.car.id} ${side} ${depth}`).toBeLessThan(was + 1e-3);
        was = centre;
        expect(extent(out, k, -sign), `${r.car.id} ${side} far`).toBeCloseTo(extent(r.skin.points, k, -sign), 2);
      }
      expect(whole - was, `${r.car.id} ${side}`).toBeGreaterThan(r.fit.crush[side] * 0.4); // a tapered flank meets the fold late
      expect(whole - was, `${r.car.id} ${side}`).toBeLessThan(r.fit.crush[side] * 1.5);
    }
  });

  it('puts the dent where the blow landed', () => {
    for (const r of rigs) {
      const near = fold(r, [{ side: 'front', at: 1, depth: 0.7 }]), half = r.car.size[2] / 2;
      const reachAt = (pts: Float32Array, x: number) => { let m = -Infinity; for (let i = 0; i < pts.length; i += 3) if (Math.abs(pts[i] - x) < half * 0.25) m = Math.max(m, pts[i + 2]); return m; };
      const bite = (x: number) => reachAt(r.skin.points, x) - reachAt(near, x);
      expect(Math.abs(bite(half * 0.7) - bite(-half * 0.7)), r.car.id).toBeGreaterThan(r.fit.crush.front * 0.15);
    }
  });

  it('never tears: neighbouring vertices stay together, and the car stays in one piece', () => {
    for (const r of rigs) {
      const out = fold(r, SIDES.map((side) => ({ side, at: 0, depth: 1 })));
      for (const v of out) expect(Number.isFinite(v)).toBe(true);
      let longest = 0;
      for (const list of r.skin.quads.values()) for (let i = 0; i < list.length; i += 3) {
        const a = list[i] * 3, b = list[i + 1] * 3;
        longest = Math.max(longest, Math.hypot(out[a] - out[b], out[a + 1] - out[b + 1], out[a + 2] - out[b + 2]));
      }
      expect(longest, r.car.id).toBeLessThan(0.5);
    }
  });

  it('keeps every wheel clear of the crush', () => {
    for (const r of rigs) {
      const out = fold(r, [{ side: 'front', at: 0, depth: 1 }, { side: 'back', at: 0, depth: 1 }]), [len] = r.car.size;
      const frontAxle = (r.p.wheels.front - 0.5) * len, rearAxle = (r.p.wheels.rear - 0.5) * len, r2 = r.p.wheels.radius;
      expect(extent(out, 2, 1), r.car.id).toBeGreaterThan(frontAxle + r2);
      expect(extent(out, 2, -1), r.car.id).toBeGreaterThan(-rearAxle + r2);
    }
  });
});
