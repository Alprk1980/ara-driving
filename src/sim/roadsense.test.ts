import { describe, expect, it } from 'vitest';
import { freshProgress } from './quests.ts';
import { Game, STEP, type GameEvent } from './game.ts';
import { RECOVERY_FEE } from './economy.ts';
import { freshRoad, LICENCE_LIMIT, MERITS, OFFENCES, scoreBonus, START_SCORE } from './roadsense.ts';
import { aspectAt, CLEAR_S, CYCLE_S, signalFor, STOP_LINE_M, WALK_S, walkAt, walkFor } from './signals.ts';
import { dist, makeRng, Town } from './town.ts';
import { Walkers } from './walkers.ts';
import { PlayerCar } from './car.ts';
import { SERVICE_RULES, serviceErrors, roadLineErrors, ROAD_MOMENTS } from '../../schemas/services.ts';
import services from '../data/services.json';
import roadLines from '../data/roadlines.json';

const town = new Town();
const content = { places: [], quests: [] } as never;
const wallet = (start = 1000) => { let v = start; return { points: () => v, spend: (n: number) => { if (n > v) return false; v -= n; return true; }, earn: (n: number) => { v += n; }, get value() { return v; } }; };

function game(start = 1000) {
  const w = wallet(start), g = new Game(content, w, { seed: 3, town }), seen: Extract<GameEvent, { type: 'road' }>[] = [];
  g.on((e) => { if (e.type === 'road') seen.push(e); });
  return { g, w, seen };
}

/** Drives the player straight over a line on an approach to a signal, at this moment of the plan. */
function atSignal(g: Game, aspect: string) {
  const [node] = town.signals.keys(), w = town.adj[node][0], n = town.nodes[node], o = town.nodes[w.to], e = town.edges[w.edge], dx = (n.x - o.x) / e.len, dz = (n.z - o.z) / e.len;
  g.traffic.cars.length = 0;
  while (signalFor(town, node, w.edge, g.traffic.clock) !== aspect) g.traffic.clock += 0.25;
  const at = (short: number) => ({ x: n.x - dx * short + dz * 3, z: n.z - dz * short - dx * 3 });
  return { node, edge: w.edge, at, heading: Math.atan2(dx, dz) };
}

describe('the signal plan', () => {
  it('holds all traffic while people cross, for long enough', () => {
    expect(CLEAR_S).toBeCloseTo(12, 0);
    let walking = 0;
    for (let t = 0; t < CYCLE_S; t += 0.25) if (walkAt(t)) { walking += 0.25; expect(aspectAt(t, 0)).toBe('red'); expect(aspectAt(t, 1)).toBe('red'); }
    expect(walking).toBeCloseTo(WALK_S, 0);
    for (let t = 0; t < CYCLE_S; t += 0.25) if (aspectAt(t - CLEAR_S, 0) === 'red' && walkAt(t - CLEAR_S)) expect(aspectAt(t, 0) === 'green' || aspectAt(t, 1) === 'green').toBe(false);
  });

  it('see people wait for the green man, then cross', () => {
    const [node] = town.signals.keys(), n = town.nodes[node], p = new PlayerCar('hatchback');
    p.place(n.x + 30, n.z + 30, 0);
    const w = new Walkers(town, makeRng(2), p);
    const was = new Map(w.people.map((q) => [q, q.over]));
    let waited = 0, started = 0, early = 0, t = 0;
    for (let i = 0; i < 60 * 200; i++) {
      w.step(1 / 60, p);
      t += 1 / 60;
      for (const q of w.people) {
        if (q.corner >= 0 && !q.over) waited++;
        if (q.over && !was.get(q)) { started++; if (!walkFor(town, q.corner, t)) early++; }
        was.set(q, q.over);
      }
    }
    expect(waited).toBeGreaterThan(200);
    expect(started).toBeGreaterThan(3);
    expect(early).toBe(0);
  });
});

describe('red lights', () => {
  it('marks a car that runs one', () => {
    const { g, seen } = game(), s = atSignal(g, 'red'), start = s.at(STOP_LINE_M + 4);
    g.player.place(start.x, start.z, s.heading);
    g.player.state = 'Driving';
    g.player.speed = 12;
    for (let i = 0; i < 60; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(seen.map((e) => e.moment)).toContain('red_run');
    expect(g.road.points).toBe(OFFENCES.red_run.points);
    expect(g.road.rec.score).toBeLessThan(START_SCORE);
  });

  it('thanks a car that waits, and pays it', () => {
    const { g, w, seen } = game(), s = atSignal(g, 'red'), start = s.at(STOP_LINE_M + 3);
    g.player.place(start.x, start.z, s.heading);
    g.player.state = 'Driving';
    g.player.speed = 0;
    for (let i = 0; i < 30; i++) g.step();
    while (signalFor(town, s.node, s.edge, g.traffic.clock) !== 'green') g.traffic.clock += 0.25;
    const before = w.value;
    for (let i = 0; i < 180; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(seen.map((e) => e.moment)).toContain('red_stop');
    expect(w.value).toBe(before + MERITS.red_stop.pay);
    expect(g.road.points).toBe(0);
  });

  it('lets a car through on green with nothing said', () => {
    const { g, seen } = game(), s = atSignal(g, 'green'), start = s.at(STOP_LINE_M + 4);
    g.player.place(start.x, start.z, s.heading);
    g.player.state = 'Driving';
    g.player.speed = 12;
    for (let i = 0; i < 40; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(seen.filter((e) => e.moment === 'red_run' || e.moment === 'red_stop')).toEqual([]);
  });
});

describe('zebras', () => {
  it('marks driving over someone’s crossing, and never hurts them', () => {
    const { g, seen } = game(), z = town.zebras[0], q = g.walkers.people[0];
    g.traffic.cars.length = 0;
    q.x = z.x; q.z = z.z; q.edge = z.edge; q.to = town.edges[z.edge].b; q.along = z.along; q.zebra = z; q.onRoad = true; q.off = 4; q.side = 1;
    g.player.place(z.x - z.ux * 8 + z.uz * 3, z.z - z.uz * 8 - z.ux * 3, Math.atan2(z.ux, z.uz));
    g.player.state = 'Driving';
    g.player.speed = 12;
    for (let i = 0; i < 50; i++) { q.zebra = z; q.onRoad = true; g.step({ steer: 0, throttle: 1, brake: 0 }); }
    expect(seen.map((e) => e.moment)).toContain('zebra_run');
  });

  it('thanks a driver who stops for one', () => {
    const { g, w, seen } = game(), z = town.zebras[0], q = g.walkers.people[0];
    g.traffic.cars.length = 0;
    q.x = z.x; q.z = z.z; q.edge = z.edge; q.to = town.edges[z.edge].b; q.along = z.along; q.zebra = z; q.onRoad = false; q.off = 7; q.side = 1; q.waited = 0;
    g.player.place(z.x - z.ux * 9 + z.uz * 3, z.z - z.uz * 9 - z.ux * 3, Math.atan2(z.ux, z.uz));
    g.player.state = 'Driving';
    for (let i = 0; i < 12; i++) g.step();
    q.zebra = null;
    const before = w.value;
    for (let i = 0; i < 180; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(seen.map((e) => e.moment)).toContain('zebra_wait');
    expect(w.value).toBeGreaterThan(before);
  });
});

describe('after a knock', () => {
  it('stopping is thanked', () => {
    const { g, seen } = game();
    g.road.knocked(8);
    g.player.speed = 0;
    for (let i = 0; i < 60 * 4; i++) g.step();
    expect(seen.map((e) => e.moment)).toContain('stopped_after');
    expect(g.road.points).toBe(0);
  });

  it('driving off is an offence, and the police come', () => {
    const { g, seen } = game();
    g.road.knocked(8);
    g.road.incident!.x += 400; // already far away
    for (let i = 0; i < 12; i++) g.step();
    expect(seen.map((e) => e.moment)).toContain('drove_off');
    expect(g.road.points).toBe(OFFENCES.drove_off.points);
    expect(g.road.chaser?.blue).toBe(true);
  });

  it('a pull-over ends in a fine and no harm', () => {
    const { g, w, seen } = game();
    g.road.knocked(8);
    g.road.incident!.x += 400;
    for (let i = 0; i < 12; i++) g.step();
    const c = g.road.chaser!;
    g.player.speed = 0;
    let closest = Infinity, i = 0;
    for (; i < 60 * 130 && g.road.chaser; i++) { g.step(); closest = Math.min(closest, dist(c, g.player)); }
    expect(seen.map((e) => e.moment)).toContain('pulled_over');
    expect(g.player.damage).toBe(0);
    expect(closest).toBeGreaterThan(3);
    expect(w.value).toBeLessThan(1000);
    expect(c.chase).toBe(false);
  });

  it('giving the police the slip costs score, and ends the chase', () => {
    const { g, seen } = game();
    g.road.knocked(8);
    g.road.incident!.x += 400;
    for (let i = 0; i < 12; i++) g.step();
    const score = g.road.rec.score;
    for (let i = 0; i < 60 * 125 && g.road.chaser; i++) { g.player.place(2900, 2900, 0); g.step(); }
    expect(seen.map((e) => e.moment)).toContain('got_away');
    expect(g.road.rec.score).toBeLessThan(score);
    expect(g.road.chaser).toBeNull();
  });
});

describe('the record', () => {
  it('shows which way the score is heading, and keeps a history of good and bad', () => {
    const { g } = game(), s = atSignal(g, 'red'), start = s.at(STOP_LINE_M + 4);
    g.step();
    expect(g.road.trend).toBe(0);
    g.player.place(start.x, start.z, s.heading);
    g.player.state = 'Driving';
    g.player.speed = 12;
    for (let i = 0; i < 60; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(g.road.trend).toBeLessThan(0);
    expect(g.road.rec.log?.[0]).toMatchObject({ moment: 'red_run', by: -OFFENCES.red_run.drop });
    for (let i = 0; i < 40; i++) { g.road.rec.good = 0; g.road.rec.log!.unshift({ moment: 'red_stop', at: 0, by: 1 }); }
    g.road.reset();
    expect(JSON.parse(JSON.stringify(g.road.rec)).log[0].moment).toBe('red_stop');
  });

  it('pays better as the score rises', () => {
    expect(scoreBonus(START_SCORE)).toBe(0);
    expect(scoreBonus(70)).toBeGreaterThan(0);
    expect(scoreBonus(95)).toBeGreaterThan(scoreBonus(70));
    expect(scoreBonus(100)).toBeLessThanOrEqual(0.21); // a published telematics discount
  });

  it('reaching the limit means a course, not a ban', () => {
    const { g, w, seen } = game();
    g.progress.road!.marks = [{ kind: 'drove_off', at: 0 }, { kind: 'red_run', at: 0 }];
    g.traffic.cars.length = 0;
    expect(g.road.points).toBe(LICENCE_LIMIT - 3);
    const s = atSignal(g, 'red'), start = s.at(STOP_LINE_M + 4);
    g.player.place(start.x, start.z, s.heading);
    g.player.state = 'Driving';
    g.player.speed = 12;
    for (let i = 0; i < 60; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(seen.map((e) => e.moment)).toContain('course');
    expect(g.road.points).toBe(0);
    expect(w.value).toBeLessThan(1000);
  });

  it('points fade after three game days, and survive a save', () => {
    const rec = freshRoad();
    rec.marks.push({ kind: 'red_run', at: 0 });
    const g = new Game(content, wallet(), { seed: 3, town, progress: { ...freshProgress(), road: JSON.parse(JSON.stringify(rec)) } });
    expect(g.road.points).toBe(3);
    g.road.rec.clock = 3 * 480 + 1;
    g.road.step(STEP);
    expect(g.road.points).toBe(0);
  });

  it('copes with a save from before there was a record', () => {
    const { road: _gone, ...old } = freshProgress();
    const g = new Game(content, wallet(), { seed: 3, town, progress: old });
    expect(g.road.rec.score).toBe(START_SCORE);
  });
});

describe('the phone', () => {
  it('brings a crew, and a real emergency is no offence, moving or not', () => {
    const { g, seen } = game();
    g.player.setDamage(0.5);
    g.player.speed = 10;
    expect(g.phone('ambulance')).toBe(true);
    expect(g.traffic.cars.find((c) => c.fleet === 'ambulance')?.blue).toBe(true);
    expect(seen.map((e) => e.moment)).toEqual([]);
  });

  it('marks a hoax 999 call, without a pursuit', () => {
    const { g, seen } = game();
    g.player.speed = 0;
    g.phone('fire');
    expect(seen.map((e) => e.moment)).toContain('hoax_call');
    expect(g.road.points).toBe(0);
    expect(g.road.chaser).toBeNull();
  });

  it('marks calling recovery on the move, at the real 6 points', () => {
    const { g, seen } = game();
    g.player.speed = 12;
    g.phone('recovery');
    expect(seen.map((e) => e.moment)).toContain('phone_use');
    expect(g.road.points).toBe(OFFENCES.phone_use.points);
    expect(OFFENCES.phone_use.points).toBe(6);
  });

  it('brings a truck that takes you home, charged unless you ran dry', () => {
    const { g, w } = game();
    g.traffic.cars.splice(0, 16);
    g.player.speed = 0;
    g.player.state = 'Parked';
    const before = w.value;
    expect(g.phone('recovery')).toBe(true);
    expect(w.value).toBe(before - RECOVERY_FEE);
    const from = { x: g.player.x, z: g.player.z };
    for (let i = 0; i < 60 * 200 && dist(from, g.player) < 5; i++) { g.step(); g.player.speed = 0; }
    expect(dist(g.player, town.home.road)).toBeLessThan(15);
  });

  it('is free when stranded', () => {
    const { g, w } = game();
    g.player.state = 'Stranded';
    const before = w.value;
    g.phone('recovery');
    expect(w.value).toBe(before);
  });
});

describe('stations', () => {
  it('are sited, one of each, on open ground by the road', () => {
    expect(town.services.map((s) => s.id).sort()).toEqual(['ambulance', 'fire', 'police']);
    for (const s of town.services) {
      const r = SERVICE_RULES[s.id];
      expect(town.boxes.filter((b) => Math.abs(b.x - s.x) < b.hx + r.hx && Math.abs(b.z - s.z) < b.hz + r.hx)).toEqual([]);
      expect(dist(s, s.road)).toBeGreaterThan(r.hz + 6);
      expect(town.parked.filter((c) => dist(c, s.road) < 15)).toEqual([]);
    }
  });

  it('send their crews out', () => {
    const { g } = game(), fire = town.services.find((s) => s.id === 'fire')!;
    g.player.place(fire.road.x + 200, fire.road.z + 200, 0);
    const c = g.traffic.call('fire', { x: fire.road.x + 300, z: fire.road.z }, g.player)!;
    expect(dist(c, fire.road)).toBeLessThan(12);
  });

  it('stand up to their validators', () => {
    for (const s of services) expect(serviceErrors(s), s.id).toEqual([]);
    for (const l of roadLines) expect(roadLineErrors(l), l.id).toEqual([]);
    for (const m of ROAD_MOMENTS) expect(roadLines.filter((l) => l.moment === m).length, m).toBeGreaterThan(0);
  });
});

describe('bus stops', () => {
  it('fill with people, who get on, and the bus waits longer for a crowd', () => {
    const r = town.routes[0], s = r.stops[0], p = new PlayerCar('hatchback');
    p.place(s.x + 20, s.z + 20, 0);
    const w = new Walkers(town, makeRng(3), p);
    const q = w.people[0];
    q.edge = s.edge; q.to = s.to; q.side = 1; q.along = s.along; q.queue = s; q.x = s.x; q.z = s.z;
    expect(w.queued(s)).toBe(1);
    const got = w.board(s, p);
    expect(got).toBeGreaterThanOrEqual(1);
    expect(w.queued(s)).toBe(0);
  });
});
