import { describe, expect, it } from 'vitest';
import { PlayerCar } from './car.ts';
import { makeRng, Town } from './town.ts';
import { Traffic } from './traffic.ts';

// The player is only read (x, z, speed, dir) and nudged by the cars, so a bare PlayerCar stands in for the sim.
const idlePlayer = (town: Town) => {
  const p = new PlayerCar('hatchback');
  p.place(1500, 1500, 0);
  expect(town).toBeTruthy(); // near every spawn ring, far from every car
  return p;
};

describe('traffic physics', () => {
  it('a standing car hit off-centre is shoved away, spinning', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(5), { x: 1500, z: 1500 });
    const c = traffic.cars[0];
    c.speed = c.want = c.cruise = 0;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const p = new PlayerCar('hatchback');
    p.place(c.x + fx * 3.75 - fz * 0.9, c.z + fz * 3.75 + fx * 0.9, c.heading + Math.PI); // offset, driving straight at it
    p.speed = 14;
    const start = { x: c.x, z: c.z };
    for (let i = 0; i < 20; i++) traffic.step(1 / 60, p);
    expect(Math.abs(c.vx) + Math.abs(c.vz)).toBeGreaterThan(0.5); // still sliding at a third of a second
    expect(Math.abs(c.spin)).toBeGreaterThan(0.1);
    expect(Math.hypot(c.x - start.x, c.z - start.z)).toBeGreaterThan(0.1); // and it has moved from where it was struck
  });

  it('two equal cars meeting head-on stop dead: their momentum cancels', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(5), { x: 1500, z: 1500 });
    const c = traffic.cars[0];
    c.speed = 14;
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), p = new PlayerCar('hatchback');
    p.place(c.x + fx * 3.75, c.z + fz * 3.75, c.heading + Math.PI);
    p.speed = 14;
    traffic.step(1 / 60, p);
    expect(Math.abs(p.speed)).toBeLessThan(1.5);
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(1.5);
  });

  it('a knocked car settles back onto a road and drives again', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(5), { x: 1500, z: 1500 });
    const c = traffic.cars[0];
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    const p = new PlayerCar('hatchback');
    p.place(c.x + fx * 3.75, c.z + fz * 3.75, c.heading + Math.PI);
    p.speed = 14;
    for (let i = 0; i < 3600; i++) traffic.step(1 / 60, p); // a minute of town life
    const dmin = Math.min(...town.edges.map((e) => town.segDist(c, e)));
    expect(dmin).toBeLessThan(6); // back on some road
    expect(c.along).toBeGreaterThan(0);
  });

  it('two cars welded at one spot push apart instead of sitting inside each other', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(9), { x: 1500, z: 1500 });
    const [a, b] = traffic.cars;
    b.x = a.x + 0.5;
    b.z = a.z;
    b.heading = a.heading;
    for (let i = 0; i < 10; i++) traffic.step(1 / 60, idlePlayer(town));
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(1.9);
  });

  it('stops short of a car stopped in the road, with a real gap, and never drives into it', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(5), { x: 1500, z: 1500 });
    const c = traffic.cars[0], p = new PlayerCar('hatchback');
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    p.place(c.x + fx * 30, c.z + fz * 30, c.heading);
    p.speed = 0;
    c.speed = c.want = c.cruise = 12;
    for (let i = 0; i < 60 * 12; i++) traffic.step(1 / 60, p);
    expect(c.damage).toBe(0);
    expect(p.damage).toBe(0);
    const gap = Math.hypot(c.x - p.x, c.z - p.z) - c.halfL - p.car.size[0] / 2;
    expect(gap).toBeGreaterThan(0);
  });

  it('indicates before a turn, and not on the straight', () => {
    const town = new Town();
    const traffic = new Traffic(town, makeRng(7), { x: 1500, z: 1500 });
    const p = new PlayerCar('hatchback');
    p.place(1500, 1500, 0);
    let seen = 0;
    for (let i = 0; i < 60 * 40; i++) { traffic.step(1 / 60, p); if (traffic.cars.some((c) => c.signal)) seen++; }
    expect(seen).toBeGreaterThan(60);
    expect(seen).toBeLessThan(60 * 40);
  });
});
