// The planning rules, held against the built town: each district has its share of the map, keeps its zoning, and its
// neighbours are ones a planner would allow.
import { describe, expect, it } from 'vitest';
import { DISTRICTS, DISTRICT_IDS, districtAt, onBuffer } from './districts.ts';
import { dealStart, ROAD_W, Town } from './town.ts';

const town = new Town();

describe('street furniture', () => {
  const longWay = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) }); // furniture is built long across x
  const road = (p: { x: number; z: number }) => town.edges.reduce((best, e) => (town.segDist(p, e) < town.segDist(p, best) ? e : best));
  it('runs parallel to the road it stands beside, never end-on to it', () => {
    const list = town.furniture.filter((f) => ['bench', 'bus_shelter', 'hedge', 'cycle_rack'].includes(f.kind)).filter((_, i) => i % 7 === 0);
    expect(list.length).toBeGreaterThan(100);
    let square = 0;
    for (const f of list) {
      const e = road(f), a = town.nodes[e.a], b = town.nodes[e.b], u = { x: (b.x - a.x) / e.len, z: (b.z - a.z) / e.len }, l = longWay(f.heading);
      if (Math.abs(l.x * u.x + l.z * u.z) > 0.9) square++;
    }
    expect(square / list.length).toBeGreaterThan(0.97); // corners can sit nearer the cross street
  });
  it('faces benches and shelters toward the road, not the wall', () => {
    for (const f of town.furniture.filter((x) => x.kind === 'bench' || x.kind === 'bus_shelter').slice(0, 150)) {
      const e = road(f), a = town.nodes[e.a], b = town.nodes[e.b], t = Math.max(0, Math.min(1, ((f.x - a.x) * (b.x - a.x) + (f.z - a.z) * (b.z - a.z)) / e.len ** 2));
      const near = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      expect(Math.sin(f.heading) * (near.x - f.x) + Math.cos(f.heading) * (near.z - f.z)).toBeGreaterThan(0);
    }
  });
});

describe('the heart of a district', () => {
  it('is a real place in that district, reachable by road', () => {
    for (const id of DISTRICT_IDS) {
      const p = town.heart(id);
      expect(districtAt(p.x, p.z), id).toBe(id);
      expect(town.boxAt(p.road.x, p.road.z, 2), id).toBeNull();
    }
  });
});

describe('where a new game opens', () => {
  it('lands in a different district from the last game, and all over the map', () => {
    let roll = 0.137;
    const next = () => (roll = (roll * 9301 + 0.4927) % 1);
    const seen = new Set<string>();
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const at = dealStart(town, next, last), p = town.plots[at];
      expect(p).toBeTruthy();
      if (last >= 0) expect(districtAt(p.x, p.z)).not.toBe(districtAt(town.plots[last].x, town.plots[last].z));
      seen.add(districtAt(p.x, p.z));
      last = at;
    }
    expect(seen.size).toBe(4);
  });
  it('still starts somewhere sensible with no last game, and in the game itself', () => {
    expect(town.plots[dealStart(town, () => 0.5)]).toBeTruthy();
    for (const p of town.plots) expect(town.boxAt(p.road.x, p.road.z, 2)).toBeNull();
  });
});

describe('the four districts', () => {
  it('each take a real share of the map', () => {
    const count = Object.fromEntries(DISTRICT_IDS.map((d) => [d, 0]));
    for (let x = 25; x < 3000; x += 50) for (let z = 25; z < 3000; z += 50) count[districtAt(x, z)]++;
    const all = Object.values(count).reduce((a, b) => a + b);
    for (const d of DISTRICT_IDS) expect(count[d] / all, d).toBeGreaterThan(0.09);
  });

  it('each have plenty of buildings', () => {
    for (const d of DISTRICT_IDS) expect(town.boxes.filter((b) => b.district === d).length, d).toBeGreaterThan(60);
  });

  it('build by their own zoning: plot, height and setback', () => {
    for (const b of town.boxes.filter((o) => !o.drawn && o !== town.centre?.box)) { // a drawn building keeps its drawing's size, held in drawnsites.test.ts; the shopping centre is held in centre.test.ts
      const r = DISTRICTS[b.district!], long = Math.max(b.hx, b.hz), short = Math.min(b.hx, b.hz);
      expect(long).toBeLessThanOrEqual(Math.max(r.plot[1], r.depth[1]) + 1e-9);
      expect(short).toBeGreaterThanOrEqual(Math.min(r.plot[0], r.depth[0]) - 1e-9);
      const floors = Math.round(b.h / 3.4);
      expect(floors).toBeGreaterThanOrEqual(r.storeys[0]);
      expect(floors).toBeLessThanOrEqual(r.storeys[1]);
    }
  });

  it('enclose Old Town streets between 1:1 and 1:3, the range the design guides ask for', () => {
    const r = DISTRICTS.oldtown, across = ROAD_W + 2 * r.setback;
    expect((r.storeys[1] * 3.4) / across).toBeLessThanOrEqual(1);
    expect((r.storeys[0] * 3.4) / across).toBeGreaterThanOrEqual(1 / 3);
  });

  it('keep the business centre next to the old core, and the works at the edge on a buffer', () => {
    const near = (d: string) => town.boxes.filter((b) => b.district === d);
    const mean = (l: { x: number; z: number }[]) => ({ x: l.reduce((n, b) => n + b.x, 0) / l.length, z: l.reduce((n, b) => n + b.z, 0) / l.length });
    const rim = (p: { x: number; z: number }) => Math.hypot(p.x - 1500, p.z - 1500);
    expect(rim(mean(near('business')))).toBeLessThan(400);
    expect(rim(mean(near('oldtown')))).toBeLessThan(500);
    expect(rim(mean(near('works')))).toBeGreaterThan(800);
    for (const b of town.boxes) expect(onBuffer(b.x, b.z)).toBe(false);
  });

  it('read differently along a street: Old Town is the densest frontage, the Works the sparsest', () => {
    const cover = (d: keyof typeof DISTRICTS) => {
      const list = town.boxes.filter((b) => b.district === d);
      return list.reduce((n, b) => n + 4 * b.hx * b.hz, 0) / list.length;
    };
    expect(cover('works')).toBeGreaterThan(cover('oldtown') * 2);
    expect(cover('garden')).toBeLessThan(cover('oldtown'));
  });

  it('plant the suburbs and leave the works bare', () => {
    const share = (d: string) => town.trees.filter((t) => districtAt(t.x, t.z) === d).length;
    expect(share('garden')).toBeGreaterThan(share('works') * 3);
    expect(share('garden')).toBeGreaterThan(share('business') * 3);
  });
});
