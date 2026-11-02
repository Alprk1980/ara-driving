import { describe, expect, it } from 'vitest';
import { PlayerCar } from './car.ts';
import { districtAt } from './districts.ts';
import { makeRng, ROAD_W, Town, type Vec } from './town.ts';
import { Walkers, WALK_MPS } from './walkers.ts';
import { signalFor } from './signals.ts';

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

describe('people at signalled junctions', () => {
  it('are never on a road whose traffic has a green or amber', () => {
    const node = [...town.signals.keys()][0], n = town.nodes[node], car = new PlayerCar('hatchback');
    car.place(n.x + 40, n.z + 40, 0); // near enough that people fill these streets
    const w = new Walkers(town, makeRng(5), car), arms = town.adj[node].map((a) => { const o = town.nodes[a.to], len = town.edges[a.edge].len; return { edge: a.edge, ux: (o.x - n.x) / len, uz: (o.z - n.z) / len }; });
    let seen = 0, clock = 0;
    for (let i = 0; i < 30 * 60 * 6; i++) { // six minutes, several signal cycles
      w.step(1 / 30, car);
      clock += 1 / 30;
      for (const p of w.people) {
        const dx = p.x - n.x, dz = p.z - n.z;
        for (const a of arms) {
          const along = dx * a.ux + dz * a.uz, across = Math.abs(dx * a.uz - dz * a.ux);
          if (along < ROAD_W / 2 || along > 25 || across > ROAD_W / 2 - 1) continue; // well inside this arm's carriageway, beyond the junction box
          seen++;
          const aspect = signalFor(town, node, a.edge, clock);
          expect(aspect === "green" || aspect === "amber", `on edge ${a.edge} at ${clock.toFixed(1)} s with ${aspect}: ${JSON.stringify({ edge: p.edge, to: p.to, along: Math.round(p.along), side: p.side, over: p.over, corner: p.corner, zebra: !!p.zebra, x: Math.round(p.x - n.x), z: Math.round(p.z - n.z) })}`).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(0); // someone did cross
  });
});
