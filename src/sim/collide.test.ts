import { describe, expect, it } from 'vitest';
import { carsOverlap, type CarBox } from './collide.ts';

const car = (x: number, z: number, heading = 0): CarBox => ({ x, z, heading, halfL: 2.1, halfW: 0.9 });

describe('two cars as rectangles', () => {
  it('sees cars nose to tail that a circle would call clear or call touching wrongly', () => {
    expect(carsOverlap(car(0, 0), car(0, 4.1))).not.toBeNull(); // 4.2 m of car in 4.1 m
    expect(carsOverlap(car(0, 0), car(0, 4.3))).toBeNull();
    expect(carsOverlap(car(0, 0), car(1.7, 0))).not.toBeNull(); // door to door
    expect(carsOverlap(car(0, 0), car(1.9, 0))).toBeNull();
  });
  it('pushes along the shortest way out, from the first car toward the second', () => {
    const hit = carsOverlap(car(0, 0), car(0, 4))!;
    expect(hit.nz).toBeCloseTo(1, 6);
    expect(hit.nx).toBeCloseTo(0, 6);
    expect(hit.depth).toBeCloseTo(0.2, 6);
    const back = carsOverlap(car(0, 4), car(0, 0))!;
    expect(back.nz).toBeCloseTo(-1, 6);
  });
  it('handles cars at an angle: a corner can clear where the middles look close', () => {
    expect(carsOverlap(car(0, 0), car(3.2, 2.6, Math.PI / 2))).toBeNull();
    expect(carsOverlap(car(0, 0), car(0, 2.5, Math.PI / 2))).not.toBeNull();
  });
  it('gives the same answer either way round', () => {
    for (const [x, z, h] of [[1, 2, 0.4], [2, 3, 1.2], [0.5, 4.2, 0.1]]) {
      expect(!!carsOverlap(car(0, 0), car(x, z, h))).toBe(!!carsOverlap(car(x, z, h), car(0, 0)));
    }
  });
});
