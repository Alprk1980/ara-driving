// The canal and its basin: built on open ground, solid to a car, and moored with boats of a real narrowboat's size.
import { describe, expect, it } from 'vitest';
import { BOAT_MAX_L, BOAT_W, inWater, moorings, WATER } from './waterside.ts';
import { Town } from './town.ts';

const town = new Town();
describe('the canal', () => {
  it('has nothing built in it, and keeps clear of the plots, the finds and the parked cars', () => {
    expect(town.boxes.filter((b) => inWater(b.x, b.z, Math.max(b.hx, b.hz))).length).toBe(0);
    for (const list of [town.plots, town.spots, town.parked, town.trees]) expect(list.filter((p) => inWater(p.x, p.z, 1)).length).toBe(0);
  });
  it('stops a car at its edge', () => {
    for (const w of WATER) expect(town.boxAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2, 0.5)).not.toBeNull();
  });
  it('is moored with narrowboats no bigger than the locks take, all in the water', () => {
    const boats = moorings();
    expect(boats.length).toBeGreaterThan(15);
    for (const b of boats) {
      expect(b.len).toBeLessThanOrEqual(BOAT_MAX_L);
      expect(inWater(b.x, b.z)).toBe(true);
    }
    expect(BOAT_W).toBeCloseTo(2.08, 2); // 6 ft 10 in
  });
});
