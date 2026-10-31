import { describe, expect, it } from 'vitest';
import { PlayerCar } from './car.ts';
import { districtAt } from './districts.ts';
import { makeRng, ROAD_W, Town, type Vec } from './town.ts';
import { Walkers, WALK_MPS } from './walkers.ts';

const town = new Town();
const roadDist = (p: Vec) => Math.min(...town.edges.map((e) => town.segDist(p, e)));

describe('people on the pavements', () => {
  const car = new PlayerCar('hatchback');
  car.place(1200, 1650, 0);

  it('walk at real walking speeds', () => {
    const w = new Walkers(town, makeRng(3), car);
    for (const p of w.people) { expect(p.speed).toBeGreaterThanOrEqual(WALK_MPS[0]); expect(p.speed).toBeLessThanOrEqual(WALK_MPS[1]); }
    expect(WALK_MPS[0]).toBeGreaterThanOrEqual(1);
    expect(WALK_MPS[1]).toBeLessThanOrEqual(1.6);
  });

  it('stay on the pavement, off the road and out of buildings', () => {
    const w = new Walkers(town, makeRng(3), car);
    for (let i = 0; i < 600; i++) w.step(1 / 30, car);
    const atJunction = (p: Vec) => town.nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 16); // where they cross
    for (const p of w.people) if (!atJunction(p) && !p.zebra && !p.over) expect(roadDist(p), `${p.x},${p.z}`).toBeGreaterThan(ROAD_W / 2 - 0.5);
    const inside = w.people.filter((p) => town.boxes.some((b) => Math.abs(p.x - b.x) < b.hx - 0.3 && Math.abs(p.z - b.z) < b.hz - 0.3));
    expect(inside.length).toBeLessThanOrEqual(2); // a junction's corner can clip a plot; nobody lives in a wall
  });

  it('crowd Old Town far more than the Works', () => {
    const tally = (x: number, z: number) => {
      const c = new PlayerCar('hatchback');
      c.place(x, z, 0);
      const w = new Walkers(town, makeRng(5), c);
      return w.people.filter((p) => districtAt(p.x, p.z) === districtAt(x, z)).length;
    };
    expect(tally(1160, 1660)).toBeGreaterThan(tally(2560, 2480));
  });

  it('never get run over, even when the car mounts the pavement at speed', () => {
    const c = new PlayerCar('hatchback');
    c.place(1200, 1650, 0);
    const w = new Walkers(town, makeRng(9), c);
    let closest = Infinity;
    for (let i = 0; i < 900; i++) {
      const p = w.people[i % w.people.length];
      if (i % 90 === 0) { c.x = p.x + 1.2; c.z = p.z + 1.2; }
      c.speed = 12;
      w.step(1 / 60, c);
      for (const q of w.people) closest = Math.min(closest, Math.hypot(q.x - c.x, q.z - c.z));
    }
    expect(closest).toBeGreaterThanOrEqual(1.85);
  });
});
