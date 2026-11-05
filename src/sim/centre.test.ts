import { describe, expect, it } from 'vitest';
import { districtAt } from './districts.ts';
import { findDoors } from './doors.ts';
import { CENTRE_D, CENTRE_FLOORS, CENTRE_STYLE, CENTRE_W, dist, ROAD_W, Town } from './town.ts';

const town = new Town();
const c = town.centre!;

describe('the shopping centre', () => {
  it('stands in the Business Quarter', () => {
    expect(c).not.toBeNull();
    expect(districtAt(c.box.x, c.box.z)).toBe('business');
    expect(c.box.style).toBe(CENTRE_STYLE);
  });

  it('is a small centre by ICSC Europe\'s measure: 5,000 m2 or more', () => {
    expect(CENTRE_W * CENTRE_D * CENTRE_FLOORS).toBeGreaterThanOrEqual(5000);
    expect(c.box.hx * c.box.hz * 4).toBeCloseTo(CENTRE_W * CENTRE_D, 0);
  });

  it('took the ground: nothing else stands on its site, and no road runs through it', () => {
    const s = c.site;
    expect(town.boxes.filter((b) => b !== c.box && Math.abs(b.x - s.x) < b.hx + s.hx && Math.abs(b.z - s.z) < b.hz + s.hz)).toEqual([]);
    expect(Math.min(...town.edges.map((e) => town.segDist(c.box, e)))).toBeGreaterThan(ROAD_W / 2 + Math.min(c.box.hx, c.box.hz));
    expect(town.plots.every((p) => !(Math.abs(p.x - s.x) < s.hx && Math.abs(p.z - s.z) < s.hz))).toBe(true);
  });

  it('has a car park in front, between the pavement and the doors', () => {
    const park = town.parked.filter((p) => Math.abs(p.x - c.site.x) < c.site.hx && Math.abs(p.z - c.site.z) < c.site.hz);
    expect(park.length).toBeGreaterThan(15);
    for (const p of park) expect(town.boxAt(p.x, p.z, 1)).toBeNull(); // out on the tarmac, not in the building
  });

  it('has a door on its front, which you can walk up to', () => {
    const door = findDoors(town).find((d) => d.plot === c.plot)!;
    expect(door).toBeDefined();
    expect(dist(door, c.plot.road)).toBeLessThan(40); // on the street side, across the car park
    expect(town.boxAt(door.x, door.z, 0)).toBeNull();
  });
});
