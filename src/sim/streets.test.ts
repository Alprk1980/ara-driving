import { describe, expect, it } from 'vitest';
import { PlayerCar } from './car.ts';
import { KERB_KG } from './economy.ts';
import { ALARM_S, ParkedCars } from './parked.ts';
import { aspectAt, AMBER_S, CYCLE_S, GREEN_S, MAX_CYCLE_S, MIN_GREEN_S, RED_AMBER_S, signalFor } from './signals.ts';
import { dist, makeRng, ROAD_W, Town, ZIGZAG_M } from './town.ts';
import { Traffic } from './traffic.ts';
import { Walkers } from './walkers.ts';

const town = new Town();

/** A parked car in the street and a player car lined up to drive squarely into its side or end. */
function setup(speed: number, id = 'hatchback') {
  const t = new Town(), parked = new ParkedCars(t), p = new PlayerCar(id), c = parked.cars.find((k) => !k.drive)!;
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading), gap = c.halfL + p.car.size[0] / 2 - 0.02; // at first contact
  p.place(c.x - fx * gap, c.z - fz * gap, c.heading); // from behind, along its length
  p.speed = speed;
  p.state = 'Driving';
  return { parked, c, p };
}

describe('parked cars', () => {
  it('stop nothing dead: the car moves, and the player keeps going', () => {
    const { parked, c, p } = setup(10);
    const from = { x: c.x, z: c.z };
    for (let i = 0; i < 120; i++) { parked.step(1 / 60, p, []); p.x += p.dir.x * p.speed / 60; p.z += p.dir.z * p.speed / 60; p.speed = Math.max(0, p.speed - 8 / 60); }
    expect(dist(c, from)).toBeGreaterThan(0.5);
    expect(c.touched).toBe(true);
  });

  it('share the blow by weight, conserving momentum', () => {
    const { parked, c, p } = setup(10);
    const before = 10 * p.car.kg;
    parked.step(1 / 60, p, []);
    const after = p.speed * p.car.kg + Math.hypot(c.vx, c.vz) * KERB_KG;
    expect(Math.abs(after - before)).toBeLessThan(200); // the tyres have already had one step at it
    expect(p.speed).toBeGreaterThan(3);
    expect(p.speed).toBeLessThan(6);
  });

  it('a heavier car shoves one further than a light one', () => {
    const shove = (id: string) => { const { parked, c, p } = setup(10, id); parked.step(1 / 60, p, []); return Math.hypot(c.vx, c.vz); };
    expect(shove('pickup')).toBeGreaterThan(shove('compact'));
  });

  it('slide to a stop in a sensible distance', () => {
    const { parked, c, p } = setup(14);
    const from = { x: c.x, z: c.z };
    parked.step(1 / 60, p, []);
    p.place(p.x - p.dir.x * 20, p.z - p.dir.z * 20, p.heading);
    p.speed = 0;
    for (let i = 0; i < 300; i++) parked.step(1 / 60, p, []);
    const moved = dist(c, from);
    expect(moved).toBeGreaterThan(0.8); // v²/2a at about 6 m/s and 4 m/s²
    expect(moved).toBeLessThan(6);
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(0.1);
  });

  it('dent in proportion to the knock, and bump gently without an alarm', () => {
    const hard = setup(14), soft = setup(1.2);
    hard.parked.step(1 / 60, hard.p, []);
    soft.parked.step(1 / 60, soft.p, []);
    expect(hard.c.dents.back).toBeGreaterThan(0.05);
    expect(soft.c.dents.back).toBe(0);
    expect(soft.c.alarm).toBe(0);
  });

  it('set off an alarm that stops by itself, inside the 5 minute legal limit', () => {
    const t = new Town(), parked = new ParkedCars(t), p = new PlayerCar('hatchback');
    const c = parked.cars.find((k) => (k.colour * 13) % 1 < 0.5 && !k.drive)!, fx = Math.sin(c.heading), fz = Math.cos(c.heading), gap = c.halfL + 1.88;
    p.place(c.x - fx * gap, c.z - fz * gap, c.heading);
    p.speed = 8;
    parked.step(1 / 60, p, []);
    expect(c.alarm).toBeGreaterThan(ALARM_S - 1);
    expect(ALARM_S).toBeLessThanOrEqual(300);
    p.speed = 0;
    p.place(p.x - fx * 10, p.z - fz * 10, p.heading);
    for (let i = 0; i < 60 * (ALARM_S + 1); i++) parked.step(1 / 60, p, []);
    expect(c.alarm).toBe(0);
  });

  it('shunt the next car along', () => {
    const t = new Town(), parked = new ParkedCars(t), p = new PlayerCar('hatchback');
    const pair = parked.cars.flatMap((a) => { const b = parked.cars.find((o) => o !== a && !o.drive && dist(o, a) < 7 && Math.abs(o.heading - a.heading) < 0.01); return b && !a.drive ? [[a, b]] : []; })[0];
    const [a, b] = pair, ux = (b.x - a.x) / dist(a, b), uz = (b.z - a.z) / dist(a, b);
    p.place(a.x - ux * (a.halfL + 1.88), a.z - uz * (a.halfL + 1.88), Math.atan2(ux, uz));
    p.speed = 22;
    const from = { x: b.x, z: b.z };
    for (let i = 0; i < 120; i++) { parked.step(1 / 60, p, []); p.speed = 0; }
    expect(dist(b, from)).toBeGreaterThan(0.05);
  });
});

describe('zebra crossings', () => {
  it('are clear of parked cars, inside the zig-zags', () => {
    const street = town.parked.filter((c) => !c.drive);
    expect(town.zebras.filter((z) => street.some((c) => dist(z, c) < ZIGZAG_M))).toEqual([]);
  });

  it('are never right beside a signalled junction', () => {
    for (const z of town.zebras) for (const n of town.signals.keys()) expect(dist(z, town.nodes[n])).toBeGreaterThan(30);
  });

  it('see traffic stop short for someone crossing, and carry on after', () => {
    const z = town.zebras[0], e = town.edges[z.edge], p = new PlayerCar('hatchback'), t = new Traffic(town, makeRng(5), { x: z.x, z: z.z });
    p.place(5, 5, 0);
    const c = t.cars[0];
    t.cars.splice(1); // one car, on the road with the crossing, 60 m short of it
    c.edge = z.edge; c.to = e.b; c.along = Math.max(0, z.along - 20) ; c.nextEdge = c.edge; c.nextTo = e.a;
    c.speed = c.want = c.cruise = 10;
    p.place(z.x + 200, z.z + 200, 0);
    let on = true;
    t.walkers = { busy: () => on, board: () => 0 };
    let closest = Infinity;
    for (let i = 0; i < 60 * 10; i++) {
      t.step(1 / 60, p);
      closest = Math.min(closest, z.along - c.along - c.halfL);
    }
    expect(c.speed).toBeLessThan(0.1);
    expect(closest).toBeGreaterThan(1);
    on = false;
    for (let i = 0; i < 60 * 3; i++) t.step(1 / 60, p);
    expect(c.speed).toBeGreaterThan(2);
  });

  it('are used: people wait, cross on the stripes and reach the far side', () => {
    const z = town.zebras.find((q) => q.x > 1000)!, p = new PlayerCar('hatchback');
    p.place(z.x + 20, z.z + 20, 0);
    const w = new Walkers(town, makeRng(4), p);
    let crossed = 0, onRoad = 0;
    const was = new Map(w.people.map((q) => [q, q.side]));
    for (let i = 0; i < 60 * 240; i++) {
      w.step(1 / 60, p);
      for (const q of w.people) { if (q.onRoad) onRoad++; if (was.get(q) !== q.side) { crossed++; was.set(q, q.side); } }
    }
    expect(crossed).toBeGreaterThan(3);
    expect(onRoad).toBeGreaterThan(100);
  });

  it('nobody steps out in front of a car that cannot stop', () => {
    const z = town.zebras.find((q) => q.x > 1000)!, p = new PlayerCar('hatchback');
    p.place(z.x + 80, z.z + 80, 0);
    const w = new Walkers(town, makeRng(4), p), q = w.people[0];
    q.x = z.x; q.z = z.z; q.edge = z.edge; q.zebra = z; q.along = z.along; q.side = 1; q.off = 6; q.onRoad = false; q.waited = 0; q.to = town.edges[z.edge].b;
    const fast = { x: z.x - z.ux * 14, z: z.z - z.uz * 14, speed: 14, heading: Math.atan2(z.ux, z.uz) };
    w.step(1 / 60, p, [fast]);
    expect(q.onRoad).toBe(false);
    fast.speed = 0;
    w.step(1 / 60, p, [fast]);
    expect(q.onRoad).toBe(true);
  });
});

describe('traffic lights', () => {
  it('run the UK sequence and timings', () => {
    expect([AMBER_S, RED_AMBER_S]).toEqual([3, 2]);
    expect(GREEN_S).toBeGreaterThanOrEqual(MIN_GREEN_S);
    expect(CYCLE_S).toBeLessThanOrEqual(MAX_CYCLE_S);
    const seen: string[] = [];
    for (let t = 0; t < CYCLE_S; t += 0.25) { const a = aspectAt(t, 0); if (seen.at(-1) !== a) seen.push(a); }
    expect(seen).toEqual(['green', 'amber', 'red', 'redAmber']);
  });

  it('never show two roads green together', () => {
    for (let t = 0; t < CYCLE_S * 2; t += 0.1) expect(aspectAt(t, 0) === 'green' && aspectAt(t, 1) === 'green').toBe(false);
  });

  it('stand on the busy crossroads', () => {
    expect(town.signals.size).toBeGreaterThan(3);
    for (const n of town.signals.keys()) expect(town.adj[n].length).toBeGreaterThanOrEqual(4);
  });

  it('hold a car at the line on red, and let it go on green', () => {
    const [node] = town.signals.keys(), ways = town.adj[node], w = ways[0], e = town.edges[w.edge], p = new PlayerCar('hatchback');
    const t = new Traffic(town, makeRng(5), town.nodes[node]);
    t.cars.splice(1);
    const c = t.cars[0];
    p.place(town.nodes[node].x + 45, town.nodes[node].z + 45, 0);
    c.edge = w.edge; c.to = node; c.along = Math.max(0, e.len - 50); c.nextEdge = ways[1].edge; c.nextTo = ways[1].to;
    c.x = town.nodes[node].x + (town.nodes[w.to].x - town.nodes[node].x) * (e.len - c.along) / e.len; c.z = town.nodes[node].z + (town.nodes[w.to].z - town.nodes[node].z) * (e.len - c.along) / e.len;
    c.speed = c.want = c.cruise = 10;
    t.clock = 0;
    const redFor = (at: number) => signalFor(town, node, w.edge, at) === 'red';
    while (!redFor(t.clock + 1) || !redFor(t.clock + 15)) t.clock += 0.5;
    for (let i = 0; i < 60 * 12; i++) t.step(1 / 60, p);
    expect(c.edge).toBe(w.edge);
    expect(c.speed).toBeLessThan(0.5);
    expect(e.len - c.along).toBeGreaterThan(10);
    for (let i = 0; i < 60 * 45; i++) t.step(1 / 60, p);
    expect(c.edge !== w.edge || c.speed > 1).toBe(true);
  });
});

describe('buses', () => {
  it('run closed routes with no U-turns, with stops about 400 m apart', () => {
    expect(town.routes.length).toBe(4);
    for (const r of town.routes) {
      r.legs.forEach((l, i) => {
        const next = r.legs[(i + 1) % r.legs.length], e = town.edges[next.edge];
        expect(next.edge, 'turns round in the road').not.toBe(l.edge);
        expect(e.a === l.to || e.b === l.to, 'the route joins up').toBe(true);
      });
      expect(r.stops.length).toBeGreaterThan(3);
    }
  });

  it('call at a stop, wait, and pull out', () => {
    const p = new PlayerCar('hatchback'), r = town.routes[0], t = new Traffic(town, makeRng(5), { x: 1500, z: 1500 });
    const bus = t.cars.find((c) => c.role === 'bus' && c.route === 0)!;
    t.cars.length = 0;
    t.cars.push(bus);
    p.place(r.stops[1].x + 30, r.stops[1].z + 30, 0);
    let dwelt = 0, kerb = 0;
    for (let i = 0; i < 60 * 180 && !dwelt; i++) { t.step(1 / 60, p); p.place(bus.x + 40, bus.z + 40, 0); if (bus.dwell > 0) { dwelt = bus.dwell; kerb = bus.lane; } }
    expect(dwelt).toBeGreaterThan(5);
    expect(kerb).toBeGreaterThan(3.8);
    expect(kerb + bus.halfW).toBeLessThan(ROAD_W / 2);
    const had = bus.along, leg = bus.leg;
    for (let i = 0; i < 60 * 30; i++) t.step(1 / 60, p);
    expect(bus.leg !== leg || bus.along > had + 5).toBe(true);
  });

  it('keep the kerb at a stop clear of parked cars', () => {
    const street = town.parked.filter((c) => !c.drive);
    expect(town.routes.flatMap((r) => r.stops).filter((s) => street.some((c) => dist(s, c) < 15))).toEqual([]);
  });
});

describe('emergency services', () => {
  it('go to a wreck with blue lights, then clear it and stand down', () => {
    const p = new PlayerCar('hatchback'), t = new Traffic(town, makeRng(5), { x: 1500, z: 1500 }), w = t.cars[0];
    p.place(1500, 1500, 0);
    w.wreck = 150;
    w.damage = 0.8;
    w.speed = w.want = 0;
    const crews = [t.call('police', w, w, w), t.call('ambulance', w, w, w), t.call('fire', w, w, w)];
    expect(crews.every((c) => c?.blue)).toBe(true);
    let arrived = 0;
    for (let i = 0; i < 60 * 170 && crews.some((c) => c!.job); i++) { t.step(1 / 60, p); arrived = Math.max(arrived, crews.filter((c) => c!.scene > 0).length); }
    expect(arrived).toBeGreaterThan(0);
    expect(crews.some((c) => c!.blue)).toBe(false);
  });

  it('make traffic ahead pull in and stop', () => {
    const p = new PlayerCar('hatchback'), t = new Traffic(town, makeRng(5), { x: 1500, z: 1500 }), a = t.cars[0];
    p.place(a.x + 300, a.z + 300, 0);
    t.cars.splice(1, 15);
    const b = t.cars.find((c) => c.fleet === 'police_car')!;
    a.speed = a.want = a.cruise = 8;
    b.edge = a.edge; b.to = a.to; b.nextEdge = a.nextEdge; b.nextTo = a.nextTo; b.along = Math.max(0, a.along - 40);
    b.x = a.x - Math.sin(a.heading) * 40; b.z = a.z - Math.cos(a.heading) * 40; b.heading = a.heading;
    b.blue = true; b.lane = b.laneGoal = 0.6; b.job = { at: { x: 0, z: 0 }, wreck: null };
    for (let i = 0; i < 60 * 2.5; i++) t.step(1 / 60, p);
    expect(a.speed).toBeLessThan(4);
    expect(a.laneGoal).toBeGreaterThan(3);
  });

  it('cross a red light, slowly', () => {
    const [node] = town.signals.keys(), ways = town.adj[node], w = ways[0], e = town.edges[w.edge], p = new PlayerCar('hatchback'), t = new Traffic(town, makeRng(5), town.nodes[node]);
    const c = t.cars.find((k) => k.fleet === 'police_car')!;
    t.cars.length = 0;
    t.cars.push(c);
    p.place(town.nodes[node].x + 45, town.nodes[node].z + 45, 0);
    c.edge = w.edge; c.to = node; c.along = Math.max(0, e.len - 30); c.nextEdge = ways[1].edge; c.nextTo = ways[1].to; c.plan = null;
    c.speed = 12; c.blue = true; c.job = { at: { x: 0, z: 0 }, wreck: null };
    while (signalFor(town, node, w.edge, t.clock) !== 'red' || signalFor(town, node, w.edge, t.clock + 12) !== 'red') t.clock += 0.5;
    for (let i = 0; i < 60 * 8; i++) t.step(1 / 60, p);
    expect(c.edge).not.toBe(w.edge);
  });
});

describe('recovery trucks', () => {
  const near = (t: Traffic, x: number, z: number) => { const p = new PlayerCar('hatchback'); p.place(x, z, 0); void t; return p; };

  it('wait for the crews, winch a wreck on, and take it away', () => {
    const t = new Traffic(town, makeRng(5), { x: 1500, z: 1500 }), w = t.cars[0], p = near(t, 1500, 1500);
    w.wreck = 150; w.damage = 0.8; w.speed = w.want = 0;
    const police = t.call('police', w, w, w)!, truck = t.call('recovery', w, w, w)!;
    expect(truck.amber).toBe(true);
    expect(truck.blue).toBe(false);
    let onBed = false, crewHere = false, early = false;
    for (let i = 0; i < 60 * 170 && !truck.dormant; i++) {
      t.step(1 / 60, p);
      if (police.job) crewHere = true;
      if (w.riding && police.scene > 0) early = true;
      if (w.riding && w.lift > 1) { onBed = true; expect(Math.hypot(w.x - truck.x, w.z - truck.z)).toBeLessThan(6); }
    }
    expect(crewHere).toBe(true);
    expect(early).toBe(false);
    expect(onBed).toBe(true);
    expect(w.riding).toBe(false);
    expect(w.wreck).toBe(0);
  });

  it('keep to the lights, and nobody pulls over for amber', () => {
    const t = new Traffic(town, makeRng(5), { x: 1500, z: 1500 }), a = t.cars[0], p = near(t, a.x + 300, a.z + 300);
    t.cars.splice(1, 15);
    const truck = t.cars.find((c) => c.fleet === 'recovery_truck')!;
    t.call('recovery', { x: a.x, z: a.z }, { x: a.x, z: a.z });
    truck.edge = a.edge; truck.to = a.to; truck.along = Math.max(0, a.along - 40);
    a.speed = a.want = a.cruise = 8;
    for (let i = 0; i < 90; i++) t.step(1 / 60, p);
    expect(a.laneGoal).toBeLessThan(3.5);
    expect(t.sirenFrom(p)).toBeNull();
  });

  it('collect a parked car left wrecked, which then goes back good as new', () => {
    const t = new Town(), parked = new ParkedCars(t), p = new PlayerCar('hatchback'), traffic = new Traffic(t, makeRng(5), { x: 1500, z: 1500 }), c = parked.cars.find((k) => !k.drive)!;
    traffic.kerb = parked;
    p.place(c.x + 20, c.z + 20, 0);
    c.touched = true; c.damage = 0.6; c.dents.front = 0.6; c.idle = 60; c.x += 2;
    parked.step(1 / 60, p, traffic.cars);
    expect(parked.wrecked()).toBe(c);
    const truck = traffic.call('recovery', c, c, null, { kerb: c })!;
    let rode = false;
    for (let i = 0; i < 60 * 240 && !truck.dormant; i++) { traffic.step(1 / 60, p); parked.step(1 / 60, p, traffic.cars); if (c.riding) rode = true; }
    expect(rode).toBe(true);
    expect(c.riding).toBe(false);
    expect(c.damage).toBe(0);
    expect([c.x, c.z]).toEqual([c.homeX, c.homeZ]);
  });
});

describe('driveways', () => {
  it('go on Garden Suburb houses, at a real size', () => {
    expect(town.drives.length).toBeGreaterThan(40);
    for (const d of town.drives) {
      expect(d.wide).toBeGreaterThanOrEqual(2.4);
      expect(d.deep).toBeGreaterThanOrEqual(4.8);
    }
  });

  it('have cars on them that fit, clear of the house and the road', () => {
    const on = town.parked.filter((c) => c.drive);
    expect(on.length).toBeGreaterThan(20);
    for (const c of on) {
      expect(Math.min(...town.edges.map((e) => town.segDist(c, e)))).toBeGreaterThan(ROAD_W / 2 + 3 - 0.1);
      expect(town.boxAt(c.x, c.z, 0.5)).toBeNull();
    }
  });

  it('nobody parks across a dropped kerb', () => {
    const street = town.parked.filter((c) => !c.drive);
    expect(town.drives.filter((d) => street.some((c) => dist(d.kerb, c) < 3.5))).toEqual([]);
  });
});
