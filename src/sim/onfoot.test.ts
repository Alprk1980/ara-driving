import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { tripErrors } from '../save.ts';
import { NEUTRAL, type DriveIntent } from './car.ts';
import { Game, STEP, type GameEvent, type Wallet } from './game.ts';
import { BODY_R, FOOT_RUN_MPS, FOOT_WALK_MPS, OnFoot } from './onfoot.ts';
import { dist, Town } from './town.ts';

const places: Place[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const wallet = (): Wallet => ({ points: () => 0, spend: () => false, earn: () => {} });
const fresh = () => new Game({ places, quests }, wallet(), { town, seed: 4 });
const walk: DriveIntent = { steer: 0, throttle: 1, brake: 0 };
const run = (g: Game, s: number, intent = walk) => { for (let i = 0; i < s / STEP; i++) g.step(intent); };

describe('getting out of the car', () => {
  it('waits for the car to stop, then puts you by the driver\'s door', () => {
    const g = fresh();
    g.player.speed = 5;
    expect(g.getOut()).toBe(false);
    g.player.speed = 0;
    g.traffic.cars.length = 0; // nothing coming past the door
    const seen: GameEvent[] = [];
    g.on((e) => seen.push(e));
    expect(g.getOut()).toBe(true);
    expect(seen).toContainEqual({ type: 'foot', out: true });
    const f = g.foot!, p = g.player, right = { x: -Math.cos(p.heading), z: Math.sin(p.heading) };
    const across = (f.x - p.x) * right.x + (f.z - p.z) * right.z;
    expect(Math.abs(across)).toBeGreaterThan(p.car.size[2] / 2);
    expect(dist(f, p)).toBeLessThan(p.car.size[2]);
    expect(g.player.state).toBe('Parked');
  });

  it('keeps the door shut while a car comes up close behind on that side (rule 239)', () => {
    const g = fresh(), p = g.player;
    p.speed = 0;
    const back = { x: p.x - Math.sin(p.heading) * 15 - Math.cos(p.heading) * 2, z: p.z - Math.cos(p.heading) * 15 + Math.sin(p.heading) * 2 };
    g.traffic.cars.length = 0;
    g.traffic.cars.push({ ...g.traffic.cars[0], ...back, heading: p.heading, speed: 9 } as never);
    expect(g.cantGetOut).toMatch(/wait/);
  });
});

describe('walking', () => {
  it('walks at a walking pace and runs at a jog', () => {
    const g = fresh();
    g.traffic.cars.length = 0;
    g.getOut();
    run(g, 1.5);
    expect(g.foot!.speed).toBeCloseTo(FOOT_WALK_MPS, 3);
    expect(FOOT_WALK_MPS).toBeGreaterThan(1.2);
    expect(FOOT_WALK_MPS).toBeLessThan(2); // under the walk-to-run speed
    run(g, 1.5, { ...walk, handbrake: true });
    expect(g.foot!.running).toBe(true);
    expect(g.foot!.speed).toBeCloseTo(FOOT_RUN_MPS, 3);
  });

  it('leaves the car parked where it was, engine off', () => {
    const g = fresh();
    g.traffic.cars.length = 0;
    const at = { x: g.player.x, z: g.player.z }, fuel = g.player.fuel;
    g.getOut();
    run(g, 5);
    expect(dist(g.player, at)).toBeLessThan(0.01);
    expect(g.player.fuel).toBe(fuel);
  });

  it('never walks into a building', () => {
    const f = new OnFoot({ x: 0, z: 0, heading: 0 }), b = town.boxes[40];
    Object.assign(f, { x: b.x - b.hx - 3, z: b.z, heading: Math.PI / 2 }); // facing +x, at the wall
    for (let i = 0; i < 600; i++) f.step(STEP, walk, town);
    expect(town.boxAt(f.x, f.z, BODY_R * 0.9)).toBeNull();
  });

  it('steps round a car rather than through it', () => {
    const g = fresh();
    g.traffic.cars.length = 0;
    g.getOut();
    const p = g.player, f = g.foot!;
    f.heading = Math.atan2(p.x - f.x, p.z - f.z); // straight at your own car
    run(g, 3);
    const along = (f.x - p.x) * Math.sin(p.heading) + (f.z - p.z) * Math.cos(p.heading), across = (f.x - p.x) * -Math.cos(p.heading) + (f.z - p.z) * Math.sin(p.heading);
    expect(Math.abs(along) > p.car.size[0] / 2 || Math.abs(across) > p.car.size[2] / 2).toBe(true);
  });

  it('gets back in only near the car', () => {
    const g = fresh();
    g.traffic.cars.length = 0;
    g.getOut();
    g.foot!.x += 40;
    expect(g.getIn()).toBe(false);
    g.foot!.x -= 40;
    expect(g.getIn()).toBe(true);
    expect(g.foot).toBeNull();
  });

  it('keeps the town round you, not round the car', () => {
    const g = fresh();
    g.getOut();
    g.foot!.x += 600; // far down the road from the car
    run(g, 1, NEUTRAL);
    expect(g.walkers.people.every((w) => dist(w, g.foot!) < 260)).toBe(true);
  });

  it('a car in the road stops short of you', () => {
    const g = fresh();
    g.getOut();
    run(g, 3, NEUTRAL);
    const c = g.traffic.cars.find((k) => !k.dormant && !k.fleet && k.speed > 5)!;
    const f = g.foot!;
    f.x = c.x + Math.sin(c.heading) * 30; // standing in its lane, 30 m ahead
    f.z = c.z + Math.cos(c.heading) * 30;
    const hold = { x: f.x, z: f.z };
    let closest = Infinity;
    for (let i = 0; i < 8 / STEP; i++) { Object.assign(f, hold); g.step(NEUTRAL); closest = Math.min(closest, dist(c, f)); }
    expect(closest).toBeLessThan(25); // it did come on toward you
    expect(closest).toBeGreaterThan(c.halfL);
  });

  it('a zebra is busy while you wait at it', () => {
    const g = fresh(), z = town.zebras.find((q) => q.kind === 'zebra')!;
    g.getOut();
    expect(g.walkers.busy(z)).toBe(g.walkers.people.some((w) => w.zebra === z));
    g.foot!.x = z.x + z.uz * 7;
    g.foot!.z = z.z - z.ux * 7;
    g.walkers.you = g.foot;
    expect(g.walkers.busy(z)).toBe(true);
  });

  it('saves where you are on foot, and picks it up again', () => {
    const g = fresh();
    g.traffic.cars.length = 0;
    g.getOut();
    run(g, 2);
    const trip = g.snapshot();
    expect(tripErrors(trip)).toEqual([]);
    expect(trip.foot).not.toBeNull();
    const back = new Game({ places, quests }, wallet(), { town, seed: 4, trip });
    expect(back.foot!.x).toBeCloseTo(g.foot!.x, 5);
    expect(tripErrors({ ...trip, foot: undefined })).toEqual([]); // a save from before walking
  });
});
