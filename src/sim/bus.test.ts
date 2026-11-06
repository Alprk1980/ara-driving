import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { tripErrors } from '../save.ts';
import { NEUTRAL } from './car.ts';
import { AT_DOOR_M, DOOR_H_M, DOOR_W_M } from './doors.ts';
import { BUS_FARE } from './economy.ts';
import { Game, STEP, type GameEvent, type Wallet } from './game.ts';
import { dist, ROAD_W, Town, type BusStop } from './town.ts';
import type { TrafficCar } from './traffic.ts';

const places: Place[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const purse = (n: number): Wallet & { n: number } => ({ n, points() { return this.n; }, spend(k) { if (k > this.n) return false; this.n -= k; return true; }, earn(k) { this.n += k; } });

/** You on foot at a stop, and a bus on that route coming up to it. */
function atStop(points = 10) {
  const w = purse(points), g = new Game({ places, quests }, w, { town, seed: 9 });
  g.getOut();
  const bus = g.traffic.cars.find((c) => c.role === 'bus')!, legs = town.routes[bus.route].legs;
  const k = town.routes[bus.route].stops.findIndex((s) => s.along > 40);
  const s = town.routes[bus.route].stops[k];
  put(g, bus, s, 35);
  Object.assign(g.foot!, { x: s.x, z: s.z });
  for (const c of g.traffic.cars) if (c !== bus && c.role !== 'bus') Object.assign(c, { x: -5000, z: -5000, dormant: true }); // a quiet road
  void legs;
  return { g, w, bus, s, k };
}

function put(g: Game, bus: TrafficCar, s: BusStop, before: number) {
  const legs = town.routes[bus.route].legs, l = legs[s.leg], next = legs[(s.leg + 1) % legs.length];
  const e = town.edges[l.edge], to = town.nodes[l.to], from = town.nodes[e.a === l.to ? e.b : e.a], ux = (to.x - from.x) / e.len, uz = (to.z - from.z) / e.len;
  const along = s.along - before; // and where that is on the map, or it counts as far off and is put back elsewhere
  Object.assign(bus, { leg: s.leg, edge: l.edge, to: l.to, nextEdge: next.edge, nextTo: next.to, along, x: from.x + ux * along, z: from.z + uz * along, heading: Math.atan2(ux, uz), speed: 10, want: 10, dwell: 0, served: -1, callAt: -1 });
  void g;
}

const run = (g: Game, s: number, until: () => boolean = () => false) => { for (let i = 0; i < s / STEP && !until(); i++) g.step(NEUTRAL); };

describe('the bus', () => {
  it('pulls in for you waiting at the stop', () => {
    const { g, bus, s } = atStop();
    expect(g.atStop).not.toBeNull();
    run(g, 20, () => bus.dwell > 0);
    expect(bus.dwell).toBeGreaterThan(0);
    expect(dist(bus, s)).toBeLessThan(9);
    expect(g.busHere).toBe(bus);
  });

  it('takes the fare, and carries you', () => {
    const { g, w, bus } = atStop();
    run(g, 20, () => bus.dwell > 0);
    const seen: GameEvent[] = [];
    g.on((e) => seen.push(e));
    expect(g.board()).toBe(true);
    expect(w.n).toBe(10 - BUS_FARE);
    expect(seen).toContainEqual({ type: 'bus', what: 'on', fare: BUS_FARE });
    run(g, 6);
    expect(dist(g.foot!, bus)).toBeLessThan(0.01);
    expect(g.traffic.you).toBeNull(); // nobody stops for you while you're sat on a bus
  });

  it('won\'t take you without the fare', () => {
    const { g, bus } = atStop(BUS_FARE - 1);
    run(g, 20, () => bus.dwell > 0);
    expect(g.board()).toBe(false);
    expect(g.ride).toBeNull();
  });

  it('stops where you rang, and you step off onto the pavement', () => {
    const { g, bus } = atStop();
    run(g, 20, () => bus.dwell > 0);
    g.board();
    run(g, 12, () => bus.dwell <= 0); // doors shut and away
    expect(g.ringBell()).toBe(true);
    expect(g.ringBell()).toBe(false); // once is enough
    const stops = town.routes[bus.route].stops;
    run(g, 120, () => g.ride === null);
    expect(g.ride).toBeNull();
    const f = g.foot!, stop = stops.reduce((a, b) => (dist(a, f) < dist(b, f) ? a : b));
    expect(dist(stop, f)).toBeLessThan(10);
    expect(town.boxAt(f.x, f.z, 0.25)).toBeNull();
    expect(Math.min(...town.edges.map((e) => town.segDist(f, e)))).toBeGreaterThan(ROAD_W / 2 - 0.5); // off the road
  });

  it('saves you at the kerb if you leave mid-ride', () => {
    const { g, bus } = atStop();
    run(g, 20, () => bus.dwell > 0);
    g.board();
    run(g, 10);
    const trip = g.snapshot();
    expect(tripErrors(trip)).toEqual([]);
    expect(dist(trip.foot!, bus)).toBeGreaterThan(bus.halfW);
  });
});

describe('the doors', () => {
  const g = new Game({ places, quests }, purse(0), { town, seed: 9 });
  it('are on most of the named places, on the outside of a wall', () => {
    expect(g.doors.length).toBeGreaterThan(town.plots.length * 0.6);
    for (const d of g.doors) {
      expect(town.boxAt(d.x, d.z, 0)).toBeNull();
      expect(town.boxAt(d.x - Math.sin(d.heading) * 0.3, d.z - Math.cos(d.heading) * 0.3, 0)).not.toBeNull(); // the wall right behind it
    }
  });
  it('face the street', () => {
    for (const d of g.doors) expect(dist({ x: d.x + Math.sin(d.heading) * 3, z: d.z + Math.cos(d.heading) * 3 }, d.plot.road)).toBeLessThan(dist(d, d.plot.road));
  });
  it('are a real door\'s size', () => {
    expect(DOOR_W_M).toBeCloseTo(0.838, 2);
    expect(DOOR_H_M).toBeCloseTo(1.981, 2);
  });
  it('are found when you walk up to one', () => {
    g.getOut();
    const d = g.doors[0];
    Object.assign(g.foot!, { x: d.x + Math.sin(d.heading) * (AT_DOOR_M - 0.5), z: d.z + Math.cos(d.heading) * (AT_DOOR_M - 0.5) });
    expect(g.atDoor).toBe(d);
  });
});

describe('which bus is which', () => {
  it('numbers each loop, C for clockwise and A for anticlockwise as the map shows it', () => {
    expect(town.routes.map((r) => r.name).sort()).toEqual(['1A', '1C', '2A', '2C']);
    for (const r of town.routes) {
      // The loop's top side, the leg nearest the top of the map (least z): going clockwise, that runs to the right.
      const mid = (i: number) => { const e = town.edges[r.legs[i].edge]; return (town.nodes[e.a].z + town.nodes[e.b].z) / 2; };
      const top = r.legs.map((_, i) => i).reduce((a, b) => (mid(b) < mid(a) ? b : a)), l = r.legs[top], e = town.edges[l.edge];
      const from = town.nodes[e.a === l.to ? e.b : e.a], to = town.nodes[l.to];
      expect(to.x > from.x, `${r.name} along its top side`).toBe(r.name.endsWith('C'));
    }
  });

  it('lists each stop\'s routes on its flag', () => {
    town.routes.forEach((r, i) => { for (const s of r.stops) { expect(s.route).toBe(i); expect(town.routesAt(s)).toContain(r); } });
  });

  it('shows the route at the stop and on the bus', () => {
    const { g, bus } = atStop();
    expect(g.stopBoard!.map((b) => b.name)).toContain(town.routes[bus.route].name);
    run(g, 20, () => bus.dwell > 0);
    g.board();
    expect(g.rideRoute!.name).toBe(town.routes[bus.route].name);
    expect(g.stopBoard).toBeNull();
  });

  it('brings the next bus round soon after one has gone, about when the board says', () => {
    const { g, bus, s } = atStop();
    put(g, bus, s, -15); // just gone: the rest of its loop is kilometres
    const said = g.stopBoard!.find((b) => b.name === town.routes[bus.route].name)!.due!;
    expect(said).toBeLessThan(90);
    let t = 0;
    run(g, 240, () => { t += STEP; return bus.dwell > 0 && dist(bus, s) < 9; });
    expect(bus.dwell).toBeGreaterThan(0);
    expect(dist(bus, s)).toBeLessThan(9);
    expect(t).toBeGreaterThan(said * 0.5);
    expect(t).toBeLessThan(said * 1.6 + 10);
  });
});

describe('a car parked at the kerb by the stop', () => {
  /** Your car left at the kerb this far before the stop, as a player might, and a bus coming up behind it. */
  function parkedBy(before: number) {
    const { g, bus, s } = atStop();
    const l = town.routes[bus.route].legs[s.leg], e = town.edges[l.edge], to = town.nodes[l.to], from = town.nodes[e.a === l.to ? e.b : e.a];
    const ux = (to.x - from.x) / e.len, uz = (to.z - from.z) / e.len, along = s.along - before, kerb = 4.4; // +uz,-ux is the driver's left
    g.player.place(from.x + ux * along + uz * kerb, from.z + uz * along - ux * kerb, Math.atan2(ux, uz));
    put(g, bus, s, before + 45);
    return { g, bus, s };
  }
  for (const before of [22, 12, 4, 0, -6, -14]) { // negative: just past the stop, where the bus pulls back out
    it(`doesn't stop the bus for good, ${before} m before the stop`, () => {
      const { g, bus, s } = parkedBy(before);
      run(g, 40, () => bus.dwell > 0);
      expect(bus.dwell, 'the bus pulled in for you').toBeGreaterThan(0);
      run(g, 30, () => bus.dwell <= 0);
      const at = { x: bus.x, z: bus.z };
      run(g, 30);
      expect(dist(bus, at), 'and drove on').toBeGreaterThan(40);
      void s;
    }, 60000);
  }
});
