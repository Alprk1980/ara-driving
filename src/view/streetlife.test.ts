import { describe, expect, it } from 'vitest';
import { CAR_SHAPES, carGeometry } from './streetlife.ts';

const TRIANGLE_BUDGET = 700; // each is drawn up to 90 times, so a town car stays cheap

const faces = (g: ReturnType<typeof carGeometry>) => {
  const p = g.getAttribute('position'), c = g.getAttribute('color'), out: { n: number[]; mid: number[]; white: boolean }[] = [];
  const v = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)];
  const flat = g.index ? g.toNonIndexed() : g, count = flat.getAttribute('position').count;
  void count;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const [a, b, d] = [v(i), v(i + 1), v(i + 2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    out.push({ n: [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], mid: [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3], white: c.getX(i) > 0.95 && c.getY(i) > 0.95 && c.getZ(i) > 0.95 });
  }
  return out;
};

describe('the town cars', () => {
  for (const [k, shape] of CAR_SHAPES.entries()) {
    const list = faces(carGeometry(shape)), { cabin: c, body } = shape, midZ = (Math.min(...body.map((p) => p[0])) + Math.max(...body.map((p) => p[0]))) / 2;
    const facing = (axis: number, sign: number) => list.filter((f) => sign * f.n[axis] > 1e-6);

    it(`body ${k}: every panel faces outward, so none can vanish`, () => {
      const panels = list.filter((f) => f.white);
      for (const f of panels) expect(f.n[0] * f.mid[0] + f.n[1] * (f.mid[1] - 0.75) + f.n[2] * (f.mid[2] - midZ)).toBeGreaterThanOrEqual(-1e-6);
    });

    it(`body ${k}: the cabin is closed: a back, a roof and both sides face out`, () => {
      const inCabin = (f: { mid: number[] }) => f.mid[1] > c.base && f.mid[1] <= c.top + 0.02;
      expect(facing(2, -1).filter(inCabin).length, 'rear of the cabin').toBeGreaterThan(0);
      expect(facing(2, 1).filter(inCabin).length, 'windscreen').toBeGreaterThan(0);
      expect(facing(1, 1).filter((f) => f.mid[1] > c.top - 0.01 && f.white).length, 'roof').toBeGreaterThan(0);
      for (const s of [1, -1]) expect(facing(0, s).filter(inCabin).length, 'side').toBeGreaterThan(0);
    });

    it(`body ${k}: tyres and trim are dark and glass isn't white, so paint can't reach them`, () => {
      const g = carGeometry(shape), col = g.getAttribute('color');
      let dark = 0, paint = 0;
      for (let i = 0; i < col.count; i++) { const white = col.getX(i) > 0.95 && col.getY(i) > 0.95 && col.getZ(i) > 0.95; if (white) paint++; else dark++; }
      expect(dark).toBeGreaterThan(100);
      expect(paint).toBeGreaterThan(30);
    });
  }
});

describe('town car bodies', () => {
  for (const shape of CAR_SHAPES) {
    const pos = carGeometry(shape).getAttribute('position'), zs = shape.body.map((p) => p[0]), nose = Math.max(...zs), tail = Math.min(...zs), sill = shape.body[0][1];
    const widest = (from: number, to: number) => { let w = 0; for (let i = 0; i < pos.count; i++) if (pos.getZ(i) >= from && pos.getZ(i) <= to && pos.getY(i) >= sill - 0.001 && pos.getY(i) <= sill + 0.1) w = Math.max(w, Math.abs(pos.getX(i))); return w; };

    it(`${shape.id} narrows toward its ends`, () => {
      const middle = widest(-0.5, 0.5);
      expect(middle).toBeGreaterThan(shape.half - 0.05);
      expect(widest(nose - 0.05, nose + 0.05)).toBeLessThan(middle * 0.9);
      expect(widest(tail - 0.05, tail + 0.05)).toBeLessThan(middle * 0.95);
    });

    it(`${shape.id} stays cheap to draw`, () => {
      expect(pos.count / 3).toBeLessThan(TRIANGLE_BUDGET);
    });
  }
});
