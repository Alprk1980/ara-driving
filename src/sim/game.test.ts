// The tests the design document asks for, run against the real simulation with a scripted driver.
import { describe, expect, it } from 'vitest';
import type { Find, Goal, Place, QuestText, Regular, TownEventCard } from '../../schemas/content.ts';
import { runSession, table } from '../../tools/balance.ts';
import { CASUAL, SKILLED } from './autopilot.ts';
import { PlayerCar } from './car.ts';
import { CAR_JOBS, carById, CARS, FIND_ALL_REWARD, FIND_REWARD, GOAL_REWARD, IDLE_L_PER_MIN, MARKET_BOOST, payout, RANK_REP, rankOf, rankPay, REGULAR_FINALE, streakBonus, TRIAL_KMH } from './economy.ts';
import { FuelManager } from './fuel.ts';
import { DAY_S, Game, STEP, type GameEvent, type Wallet } from './game.ts';
import { advance, freshDaily, goalsFor } from './goals.ts';
import { ActiveQuest, freshProgress, ghostPose, QuestGenerator, type Offer } from './quests.ts';
import { aStar, buildManoeuvres, Navigator, route } from './route.ts';
import { dist, makeRng, Town } from './town.ts';

const places: Place[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const content = { places, quests };
const town = new Town();
const wallet = (points = 0): Wallet & { value: number } => ({
  value: points,
  points() { return this.value; },
  spend(n) { if (n > this.value) return false; this.value -= n; return true; },
  earn(n) { this.value += n; },
});

describe('town', () => {
  it('reaches every road from home', () => {
    for (const n of town.nodes) expect(aStar(town, 0, n.id).length).toBeGreaterThan(0);
  });
  it('keeps stations and home on roads, with six stations', () => {
    expect(town.stations.length).toBe(6);
    for (const s of [...town.stations, town.home]) expect(town.offRoad(s.road)).toBe(false);
    expect(town.plots.length).toBeGreaterThan(30);
  });
  it('lands no building on a road or a plot', () => {
    for (const p of [...town.plots, ...town.stations, town.home]) expect(town.boxAt(p.road.x, p.road.z, 2)).toBeNull();
  });
});

describe('payouts', () => {
  it('matches the design document worked examples', () => {
    expect(payout('delivery', 1.5, 1)).toBe(50);
    expect(payout('delivery', 1.5, 1.25)).toBe(63);
    expect(payout('passenger', 1.5, 1.3)).toBe(72);
    expect(payout('trial', 1.5, 1.5)).toBe(101);
  });
});

describe('fuel', () => {
  it('warns once per drop and re-arms after a refill', () => {
    const car = new PlayerCar('hatchback', 11);
    car.state = 'Driving';
    car.speed = 20;
    const f = new FuelManager();
    const seen: string[] = [];
    for (let i = 0; i < 40000 && car.fuel > 0; i++) for (const e of f.tick(STEP, car, { steer: 0, throttle: 1, brake: 0 }, 0.1)) seen.push(e.type === 'fuelLow' ? e.level : e.type);
    expect(seen).toEqual(['amber', 'red', 'tankEmpty']);
    f.add(car, 30);
    for (let i = 0; i < 40000 && car.fuel > 8; i++) for (const e of f.tick(STEP, car, { steer: 0, throttle: 1, brake: 0 }, 0.1)) seen.push(e.type === 'fuelLow' ? e.level : e.type);
    expect(seen.slice(3)).toEqual(['amber']);
  });
  it('burns about the table figure per km at half throttle', () => {
    const car = new PlayerCar('hatchback');
    car.state = 'Driving';
    car.speed = 16.7;
    const f = new FuelManager();
    const before = car.fuel;
    for (let i = 0; i < 3600; i++) f.tick(STEP, car, { steer: 0, throttle: 0.5, brake: 0 }, 0.1);
    const km = (16.7 * 60) / 1000;
    expect((before - car.fuel - IDLE_L_PER_MIN) / km).toBeCloseTo(carById('hatchback').burn, 0);
  });
});

describe('damage', () => {
  it('a save can hand the car over already dented, and setCar carries it between cars', () => {
    const g = new Game(content, wallet(0), { damage: 0.4, town });
    expect(g.player.damage).toBeCloseTo(0.4, 6);
    g.setCar('pickup', 30, 0.25);
    expect(g.player.damage).toBeCloseTo(0.25, 6);
  });
  it('a wall crash marks the car and says which end took it', () => {
    const g = new Game(content, wallet(0), { town });
    const b = g.town.boxes[0];
    g.player.place(b.x, b.z - b.hz - 3, 0); // facing +z into the building
    g.player.state = 'Driving';
    g.player.speed = 20;
    let seen = 0;
    g.on((ev) => { if (ev.type === 'bump') seen = ev.speed; });
    for (let i = 0; i < 300 && !(g.player.damage > 0); i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(g.player.damage).toBeGreaterThan(0);
    expect(g.player.dents.front).toBeGreaterThan(0); // the sim keeps the dents per side, for the dents and the HUD
    expect(seen).toBeGreaterThan(0);
    expect(g.player.hit?.nz).toBeLessThanOrEqual(0);
  });
  it('a stop at the pump mends the car', () => {
    const g = new Game(content, wallet(0), { damage: 0.5, town });
    g.player.state = 'Refuelling';
    for (let i = 0; i < 600 && g.player.damage > 0; i++) g.step();
    expect(g.player.damage).toBe(0);
  });
});

describe('no dead end', () => {
  it('from every road node, with no fuel and no Points, a tow leads to a paying quest in range', () => {
    for (const carDef of CARS) for (const n of town.nodes.filter((_, i) => i % 7 === 0)) {
      const g = new Game(content, wallet(0), { carId: carDef.id, fuel: 0, seed: n.id + 1, town });
      g.player.place(n.x, n.z, 0);
      g.player.state = 'Stranded';
      g.acceptTow();
      expect(g.player.fuel).toBeCloseTo(carDef.tank * 0.25, 5);
      expect(g.player.state).toBe('Parked');
      const fits = g.offers.filter((o) => (o.routeKm + o.approachKm) * carDef.burn * 1.3 <= g.player.fuel);
      expect(fits.length, `${carDef.id} at node ${n.id}`).toBeGreaterThan(0);
    }
  });
  it('a broke player who rolls into a pump can still be towed', () => {
    const g = new Game(content, wallet(0), { fuel: 0, seed: 3, town });
    g.player.state = 'Stranded';
    expect(g.buyFuel(10)).toBe(0);
    g.acceptTow();
    expect(g.player.state).toBe('Parked');
  });
});

describe('quest generator', () => {
  it('always gives three offers, one affordable, across many seeds', () => {
    const rng = makeRng(5);
    for (let s = 0; s < 400; s++) {
      const gen = new QuestGenerator(town, content, makeRng(s));
      const node = town.nodes[Math.floor(rng() * town.nodes.length)];
      const car = CARS[s % CARS.length];
      const fuel = Math.max(rng() * car.tank, car.tank * 0.25);
      const offers: Offer[] = gen.offers(node, car, fuel);
      expect(offers.length).toBe(3);
      expect(offers.some((o) => o.litres <= fuel), `${car.id} at node ${node.id} on ${fuel} L`).toBe(true);
    }
  });
  it('quotes pay from the formula only', () => {
    const gen = new QuestGenerator(town, content, makeRng(1));
    for (const o of gen.offers(town.home, CARS[0], 40)) expect(o.basePay).toBe(payout(o.type, o.routeKm, 1));
  });
});

describe('fast travel and tow', () => {
  it('keeps a waypoint routed after a tow', () => {
    const g = new Game(content, wallet(50), { fuel: 0, seed: 2, town });
    g.setWaypoint(town.nodes[3]);
    g.player.state = 'Stranded';
    g.acceptTow();
    expect(g.nav).not.toBeNull();
    expect(g.nav!.route.length).toBeGreaterThan(100);
  });
  it('fast travel is free, burns nothing and forfeits the quest', () => {
    const w = wallet(100);
    const g = new Game(content, w, { seed: 2, town });
    const log: GameEvent[] = [];
    g.on((e) => log.push(e));
    g.accept(g.offers[0].id);
    g.player.place(100, 100, 0);
    const fuel = g.player.fuel;
    g.fastTravel('station');
    expect(g.quest).toBeNull();
    expect(log.some((e) => e.type === 'questFailed')).toBe(true);
    expect(w.value).toBe(100);
    expect(g.player.fuel).toBe(fuel);
    expect(dist(g.player, g.town.nearestStation(g.player))).toBeLessThan(40);
  });
  it('sells only what the balance and tank allow', () => {
    const w = wallet(7);
    const g = new Game(content, w, { fuel: 20, seed: 2, town });
    expect(g.buyFuel(15)).toBe(7);
    expect(w.value).toBe(0);
    expect(g.player.fuel).toBe(27);
  });
});

describe('refuelling after a tow', () => {
  it('can buy fuel at home, so a towed player with Points never runs dry on the way to a station', () => {
    const w = wallet(100);
    const g = new Game(content, w, { fuel: 0, seed: 6, town });
    g.player.place(100, 100, 0);
    g.player.state = 'Stranded';
    g.acceptTow();
    expect(g.canRefuel).toBe(true);
    g.beginRefuel();
    expect(g.buyFuel(30)).toBe(30);
    expect(g.player.fuel).toBeCloseTo(40, 5);
    g.endRefuel();
    expect(g.player.state).toBe('Parked');
  });
});

describe('time trial', () => {
  it('reroutes through the checkpoints still to come', () => {
    const g = new Game(content, wallet(0), { seed: 9, town });
    const trial = g.offers.find((o) => o.type === 'trial')!;
    g.accept(trial.id);
    g.player.place(trial.start.road.x, trial.start.road.z, 0);
    g.step();
    expect(g.quest!.phase).toBe('Active');
    g.player.place(200, 200, 0); // far off the course
    for (let i = 0; i < 200; i++) g.step();
    const r = g.nav!.route;
    for (const gate of trial.gates) expect(Math.min(...r.points.map((p) => dist(p, g.town.snap(gate).point) ))).toBeLessThan(400);
    const near = (p: { x: number; z: number }) => r.points.some((q, i) => i && dist(q, p) + dist(r.points[i - 1], p) < dist(q, r.points[i - 1]) + 1);
    for (const gate of trial.gates) expect(near(gate)).toBe(true);
  });
});

describe('traffic', () => {
  it('keeps to the road and to the left lane', () => {
    const g = new Game(content, wallet(0), { seed: 4, town });
    let off = 0, seen = 0;
    for (let s = 0; s < 3600 * 3; s++) {
      g.step();
      if (s % 60) continue;
      for (const c of g.traffic.cars) { if (c.dormant) continue; seen++; if (town.offRoad(c)) off++; }
    }
    expect(off / seen).toBeLessThan(0.03);
  });
  it('stops behind a parked player, then goes round', () => {
    const g = new Game(content, wallet(0), { seed: 4, town });
    const c = g.traffic.cars[0];
    const e = town.edges.find((x) => x.len > 200)!;
    const a = town.nodes[e.a], b = town.nodes[e.b], dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len;
    g.player.place(a.x + dx * 120 + dz * 3, a.z + dz * 120 - dx * 3, 0); // parked in the left lane of a long road
    Object.assign(c, { edge: town.edges.indexOf(e), to: e.b, along: 60, x: a.x + dx * 60 + dz * 3, z: a.z + dz * 60 - dx * 3, heading: Math.atan2(dx, dz), speed: 12, cruise: 12, want: 12 });
    let hits = 0, stopped = false;
    g.on((ev) => { if (ev.type === 'bump') hits++; });
    for (let s = 0; s < 60 * 25; s++) {
      g.step();
      stopped ||= c.speed < 0.5;
      if (c.edge !== town.edges.indexOf(e) || c.along > 140) break;
    }
    expect(stopped).toBe(true);
    expect(hits).toBe(0);
    expect(c.edge !== town.edges.indexOf(e) || c.along > 140).toBe(true);
  });
  it('a crash is a bump and costs care', () => {
    const g = new Game(content, wallet(0), { seed: 4, town });
    const delivery = g.offers.find((o) => o.type === 'delivery')!;
    g.accept(delivery.id);
    g.player.place(delivery.start.road.x, delivery.start.road.z, 0);
    g.step();
    const log: GameEvent[] = [];
    g.on((e) => log.push(e));
    const c = g.traffic.cars[0];
    Object.assign(c, { x: g.player.x, z: g.player.z + 3.85, heading: Math.PI, speed: 12, want: 12 }); // bumper to bumper, driving straight into the player
    g.step();
    expect(log.some((e) => e.type === 'bump' && e.by === 'car')).toBe(true);
    expect(g.quest!.care).toBeCloseTo(0.8);
  });
  it('a real crash bends the other car too, and a bad one leaves it a wreck that traffic gets round', () => {
    const g = new Game(content, wallet(0), { seed: 4, town });
    const c = g.traffic.cars[0];
    g.player.place(1500, 1500, 0);
    g.step();
    Object.assign(c, { x: g.player.x, z: g.player.z + 3.85, heading: Math.PI, speed: 25, want: 25 });
    g.player.speed = 25;
    g.step();
    expect(c.damage).toBeGreaterThan(0.4);
    expect(c.dents.front).toBeGreaterThan(0.4);
    expect(c.wreck).toBeGreaterThan(0);
    expect(g.player.dents.front).toBeGreaterThan(0.4);
    const was = { x: c.x, z: c.z };
    for (let i = 0; i < 300; i++) g.traffic.step(1 / 60, g.player);
    expect(Math.hypot(c.x - was.x, c.z - was.z)).toBeLessThan(25); // it slid, and then it stayed
    expect(c.speed).toBe(0);
  });
  it('a light knock dents the other car but leaves it driving', () => {
    const g = new Game(content, wallet(0), { seed: 4, town });
    const c = g.traffic.cars[0];
    g.player.place(1500, 1500, 0);
    g.step();
    Object.assign(c, { x: g.player.x, z: g.player.z + 3.85, heading: Math.PI, speed: 6, want: 6 });
    g.step();
    expect(c.damage).toBeGreaterThan(0);
    expect(c.wreck).toBe(0);
  });
});

describe('job twists', () => {
  const ride = (twist: Offer['twist'], type: Offer['type'] = 'delivery') => new ActiveQuest({ type, twist, routeKm: 1.5, goldSeconds: 60 } as Offer);
  it('a fragile load loses double for a bump', () => {
    const q = ride('fragile'), plain = ride(undefined);
    q.onBump(); plain.onBump();
    expect(q.care).toBeCloseTo(0.6);
    expect(plain.care).toBeCloseTo(0.8);
  });
  it('a sleeper hates a hard stop three times over', () => {
    const q = ride('sleeping', 'passenger');
    q.onHardStop();
    expect(q.care).toBeCloseTo(0.7);
  });
  it('a melting load keeps inside the grace, then drains', () => {
    const q = ride('melting');
    for (let i = 0; i < 60 * 70; i++) q.tick(STEP, { x: 0, z: 0, heading: 0 });
    expect(q.care).toBe(1);
    for (let i = 0; i < 60 * 30; i++) q.tick(STEP, { x: 0, z: 0, heading: 0 });
    expect(q.care).toBeLessThan(0.6);
    expect(q.care).toBeGreaterThan(0.4);
  });
  it('pays more for a clean run, and quotes that top pay', () => {
    expect(ride('fragile').finish(CARS[0]).pay).toBeGreaterThan(ride(undefined).finish(CARS[0]).pay);
    const twisted: QuestText[] = [{ id: 't', type: 'delivery', twist: 'fragile', title: 'Eggs', text: 'Gently to {dropoff}.' }, ...quests.slice(1)];
    const gen = new QuestGenerator(town, { places, quests: twisted }, makeRng(1), { ...freshProgress(), rep: 2 });
    const o = gen.offers(town.home, CARS[0], 40).find((x) => x.type === 'delivery')!;
    expect(o.twist).toBe('fragile');
    expect(o.maxPay).toBe(payout('delivery', o.routeKm, 1 + 0.25 + 0.15));
  });
});

// Puts the player at the end of the job in hand and steps once, as a finished job.
const finishJob = (g: Game) => {
  const q = g.quest!;
  g.player.place(q.offer.start.road.x, q.offer.start.road.z, 0);
  g.step();
  q.gate = q.offer.gates.length;
  g.player.place(q.offer.end.road.x, q.offer.end.road.z, 0);
  g.step();
};

describe('regulars', () => {
  const job = (type: QuestText['type'], title: string) => ({ type, title, text: `${title} to {dropoff}.`, thanks: `${title} done.` });
  const mira: Regular = { id: 'mira', name: 'Mira', role: 'Baker', jobs: [job('delivery', 'One'), job('passenger', 'Two'), job('delivery', 'Three')] };
  it('walks a story in order, saves the step and pays a finale', () => {
    const w = wallet(0), g = new Game({ places, quests, regulars: [mira] }, w, { seed: 3, town });
    const log: GameEvent[] = [];
    g.on((e) => log.push(e));
    for (const [i, title] of ['One', 'Two', 'Three'].entries()) {
      for (let t = 0; t < 40 && !g.offers.some((o) => o.regular); t++) g.refreshOffers();
      const o = g.offers.find((x) => x.regular)!;
      expect(o.title).toBe(title);
      expect(o.regular!.step).toBe(i);
      g.accept(o.id);
      finishJob(g);
      expect(g.progress.arcs.mira).toBe(i + 1);
    }
    const said = log.filter((e) => e.type === 'regular');
    expect(said.map((e) => e.finale)).toEqual([0, 0, REGULAR_FINALE]);
    g.refreshOffers();
    expect(g.offers.some((o) => o.regular)).toBe(false);
  });
  it('holds a story back when the job is given up', () => {
    const g = new Game({ places, quests, regulars: [mira] }, wallet(0), { seed: 3, town });
    for (let t = 0; t < 40 && !g.offers.some((o) => o.regular); t++) g.refreshOffers();
    g.accept(g.offers.find((x) => x.regular)!.id);
    g.failQuest('You gave it up');
    expect(g.progress.arcs.mira).toBeUndefined();
  });
});

describe('streaks', () => {
  it('raises pay job by job and tops out', () => {
    expect([0, 1, 4, 9].map(streakBonus)).toEqual([0, 0.05, 0.2, 0.2]);
  });
  it('pays the bonus, and a tow or fast travel ends it', () => {
    const w = wallet(0), g = new Game(content, w, { seed: 8, town });
    const run = () => { g.accept(g.offers.find((o) => o.type === 'delivery')!.id); const before = w.value; const q = g.quest!; finishJob(g); return { paid: w.value - before, base: q.offer.basePay, max: q.offer.maxPay }; };
    run();
    const second = run();
    expect(g.streak).toBe(2);
    expect(second.paid).toBe(Math.round(second.max * 1.05));
    g.fastTravel('home');
    expect(g.streak).toBe(0);
  });
  it('a lost job ends it', () => {
    const g = new Game(content, wallet(0), { seed: 8, town });
    g.streak = 3;
    g.accept(g.offers[0].id);
    g.failQuest('You gave it up');
    expect(g.streak).toBe(0);
  });
});

describe('finds', () => {
  const finds: Find[] = [{ id: 'a', name: 'A', clue: 'Here.', prop: 'gnome', spot: 0 }, { id: 'b', name: 'B', clue: 'There.', prop: 'duck', spot: 1 }];
  const visit = (g: Game, spot: number) => { g.player.place(town.spots[spot].x, town.spots[spot].z, 0); for (let i = 0; i < 25; i++) g.step(); };
  it('hides them where a car can reach', () => {
    expect(town.spots.length).toBeGreaterThanOrEqual(40);
    for (const s of town.spots) expect(town.boxAt(s.x, s.z, 3)).toBeNull();
  });
  it('rewards each once and a bonus for the set', () => {
    const w = wallet(0), g = new Game({ ...content, finds }, w, { seed: 1, town });
    visit(g, 0);
    visit(g, 0);
    expect(w.value).toBe(FIND_REWARD);
    expect(g.unfound.map((f) => f.id)).toEqual(['b']);
    visit(g, 1);
    expect(w.value).toBe(FIND_REWARD * 2 + FIND_ALL_REWARD);
  });
  it('remembers what was found', () => {
    const w = wallet(0), g = new Game({ ...content, finds }, w, { seed: 1, town, progress: { ...freshProgress(), found: ['a'] } });
    visit(g, 0);
    expect(w.value).toBe(0);
  });
});

describe('ghosts', () => {
  it('records a finished trial and offers it back as a rematch', () => {
    const g = new Game(content, wallet(0), { seed: 5, town });
    const trial = g.offers.find((o) => o.type === 'trial')!;
    g.accept(trial.id);
    const q = g.quest!;
    finishJob(g);
    expect(q.elapsed).toBeLessThan(1);
    const ghost = g.progress.ghosts[0];
    expect(ghost).toBeDefined();
    expect(town.plots[ghost.s]).toBe(trial.start);
    g.player.place(trial.start.road.x, trial.start.road.z, 0);
    let again: Offer | undefined;
    for (let t = 0; t < 60 && !again; t++) { g.refreshOffers(); again = g.offers.find((o) => o.rematch); }
    expect(again).toBeDefined();
    expect(again!.end).toBe(trial.end);
  });
  it('never lets a rematch take the only job the tank can cover', () => {
    const s = town.plots.indexOf(town.plots.slice().sort((a, b) => dist(a, town.home) - dist(b, town.home))[0]);
    const e = town.plots.indexOf(town.plots.slice().sort((a, b) => dist(b, town.home) - dist(a, town.home))[0]);
    for (let seed = 0; seed < 150; seed++) {
      const progress = { ...freshProgress(), ghosts: [{ s, e, time: 200, track: [] }] };
      const gen = new QuestGenerator(town, content, makeRng(seed), progress);
      const offers = gen.offers(town.home, CARS[0], 10);
      expect(offers.some((o) => o.litres <= 10), `seed ${seed}`).toBe(true);
    }
  });
  it('keeps only a faster run on the same course', () => {
    const g = new Game(content, wallet(0), { seed: 5, town });
    const log: GameEvent[] = [];
    g.on((e) => log.push(e));
    const trial = g.offers.find((o) => o.type === 'trial')!;
    g.progress.ghosts.push({ s: town.plots.indexOf(trial.start), e: town.plots.indexOf(trial.end), time: 0.001, track: [] });
    g.accept(trial.id);
    finishJob(g);
    expect(log.some((e) => e.type === 'ghost')).toBe(false);
    expect(g.progress.ghosts.length).toBe(1);
  });
  it('replays a run smoothly and ends with it', () => {
    const g = { s: 0, e: 1, time: 1, track: [0, 0, 0, 10, 0, 0, 20, 0, 1] };
    expect(ghostPose(g, 0.125)!.x).toBeCloseTo(5);
    expect(ghostPose(g, 0.375)!.heading).toBeCloseTo(0.5);
    expect(ghostPose(g, 0.6)).toBeNull();
  });
});

describe('ranks', () => {
  it('climbs by reputation', () => {
    expect(RANK_REP.map(rankOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rankOf(1)).toBe(0);
    expect(rankPay(3)).toBe(0);
    expect(rankPay(6)).toBeCloseTo(0.1);
  });
  it('holds twists back from a new driver', () => {
    const twisted: QuestText[] = [{ id: 't', type: 'delivery', twist: 'fragile', title: 'Eggs', text: 'Gently to {dropoff}.' }, ...quests];
    const offers = new QuestGenerator(town, { places, quests: twisted }, makeRng(1)).offers(town.home, CARS[0], 40);
    expect(offers.some((o) => o.twist)).toBe(false);
  });
  it('earns reputation for a job, more for a clean one, and says when it ranks up', () => {
    const g = new Game(content, wallet(0), { seed: 8, town });
    const log: GameEvent[] = [];
    g.on((e) => log.push(e));
    g.accept(g.offers.find((o) => o.type === 'delivery')!.id);
    finishJob(g);
    expect(g.progress.rep).toBe(2);
    expect(log.some((e) => e.type === 'rank' && e.level === 1)).toBe(true);
  });
  it('opens longer work at rank three', () => {
    const longest = (rep: number) => Math.max(...Array.from({ length: 60 }, (_, s) => new QuestGenerator(town, content, makeRng(s), { ...freshProgress(), rep }).offers(town.nodes[0], CARS[0], 40)).flat().map((o) => o.routeKm)); // a corner, where the long roads are
    expect(longest(0)).toBeLessThanOrEqual(4);
    expect(longest(12)).toBeGreaterThan(4);
  });
});

describe('car jobs', () => {
  const haul: QuestText = { id: 'h', type: 'delivery', car: 'pickup', title: 'Piano', text: 'Haul it to {dropoff}.' };
  const race: QuestText = { id: 'r', type: 'trial', car: 'supercar', title: 'Grand run', text: 'Blast to {dropoff}.' };
  const rich = { places, quests: [...quests, haul, race] };
  const find = (carId: string, rep: number, type: Offer['type']) => {
    for (let s = 0; s < 80; s++) {
      const o = new QuestGenerator(town, rich, makeRng(s), { ...freshProgress(), rep }).offers(town.home, CARS.find((c) => c.id === carId)!, 60).find((x) => x.carJob);
      if (o) return o;
    }
    return undefined;
  };
  it('offers one only in the right car and from the right rank', () => {
    expect(find('pickup', 6, 'delivery')?.title).toBe('Piano');
    expect(find('supercar', 6, 'trial')?.title).toBe('Grand run');
    expect(find('hatchback', 6, 'delivery')).toBeUndefined();
    expect(find('pickup', 2, 'delivery')).toBeUndefined();
  });
  it('quotes the higher pay, pays it, and tightens the Gold time', () => {
    const o = find('pickup', 6, 'delivery')!, pickup = CARS.find((c) => c.id === 'pickup')!;
    expect(o.basePay).toBe(payout('delivery', o.routeKm, 1, 1.25 * CAR_JOBS.pickup.mult));
    expect(new ActiveQuest(o).finish(pickup).pay).toBe(o.maxPay);
    const r = find('supercar', 6, 'trial')!;
    expect(r.goldSeconds).toBeLessThan((r.routeKm / (TRIAL_KMH * (165 / 110))) * 3600);
  });
});

describe('daily goals', () => {
  const mk = (kind: Goal['kind'], n: number, target = 1): Goal => ({ id: `${kind}_${n}`, kind, target, text: 'Go' });
  const goals = (['delivery', 'passenger', 'trial', 'clean', 'km', 'spotless'] as const).flatMap((k) => [mk(k, 1), mk(k, 2)]);
  it('gives everyone the same three different goals on a day, and new ones the next', () => {
    const a = goalsFor(goals, '2026-11-01');
    expect(a.map((g) => g.id)).toEqual(goalsFor(goals, '2026-11-01').map((g) => g.id));
    expect(new Set(a.map((g) => g.kind)).size).toBe(3);
    expect(['2026-11-02', '2026-11-03', '2026-11-04'].some((d) => goalsFor(goals, d).map((g) => g.id).join() !== a.map((g) => g.id).join())).toBe(true);
  });
  it('finishes a goal once', () => {
    const today = [mk('delivery', 1, 2)], d = freshDaily('x');
    expect(advance(today, d, 'delivery', 1)).toEqual([]);
    expect(advance(today, d, 'delivery', 1).length).toBe(1);
    expect(advance(today, d, 'delivery', 1)).toEqual([]);
  });
  it('a run in a row keeps its best', () => {
    const today = [mk('streak', 1, 3)], d = freshDaily('x');
    advance(today, d, 'streak', 2, true);
    advance(today, d, 'streak', 1, true);
    expect(d.counts.streak).toBe(2);
  });
  it('pays through a played job, and starts afresh on a new day', () => {
    const w = wallet(0), day = '2026-11-01', list = [mk('clean', 1), mk('delivery', 1), mk('km', 1, 3)];
    const g = new Game({ ...content, goals: list }, w, { seed: 8, town, day });
    g.goals = list;
    g.accept(g.offers.find((o) => o.type === 'delivery')!.id);
    const paid = (() => { const q = g.quest!; finishJob(g); return q.offer.maxPay; })();
    expect(w.value).toBe(paid + GOAL_REWARD * 2);
    const next = new Game({ ...content, goals: list }, wallet(0), { seed: 8, town, day: '2026-11-02', progress: g.progress });
    expect(next.progress.daily.done).toEqual([]);
  });
});

describe('town events', () => {
  const works: TownEventCard = { id: 'w', kind: 'roadworks', title: 'Dug up', text: 'Mind the road.' };
  const market: TownEventCard = { id: 'm', kind: 'market', title: 'Fair', text: 'Market day.', boost: 'shop' };
  const running = (g: Game, want: string) => { for (let i = 0; i < 400 && g.event?.kind !== want; i++) { g.time += 90; g.step(); } };
  it('sends routes around a dug-up street, and slows a car that drives down it', () => {
    const g = new Game(content, wallet(0), { seed: 2, town, events: [works] });
    running(g, 'roadworks');
    expect(town.rough).toBeGreaterThanOrEqual(0);
    const e = town.edges[town.rough], a = town.nodes[e.a], b = town.nodes[e.b];
    expect(aStar(town, e.a, e.b).length).toBeGreaterThan(2);
    const p = g.player, h = Math.atan2(b.x - a.x, b.z - a.z);
    p.place(a.x + Math.sin(h) * 30, a.z + Math.cos(h) * 30, h);
    p.state = 'Driving';
    p.speed = 25;
    for (let i = 0; i < 180; i++) g.step({ steer: 0, throttle: 1, brake: 0 });
    expect(p.speed).toBeLessThan(12);
    town.rough = -1;
  });
  it('pays more on market day, for the right places only, and says so', () => {
    const g = new Game(content, wallet(0), { seed: 2, town, events: [market] });
    running(g, 'market');
    const o = g.offers[0];
    expect(o.market).toBe(true); // every stub place is a shop
    expect(o.basePay).toBe(payout(o.type, o.routeKm, 1, 1 + MARKET_BOOST));
  });
  it('still gives a broke driver a job with a street closed', () => {
    const g = new Game(content, wallet(0), { seed: 2, town, events: [works], fuel: 10 });
    running(g, 'roadworks');
    expect(g.offers.some((o) => o.litres <= g.player.fuel)).toBe(true);
    town.rough = -1;
  });
});

describe('the day', () => {
  it('runs through night and day and the first stretch stays dry', () => {
    const g = new Game(content, wallet(0), { seed: 1, town });
    expect(g.dayFrac).toBeCloseTo(0.3);
    expect(g.rain).toBe(0);
    g.time = DAY_S * 0.2;
    expect(g.dayFrac).toBeCloseTo(0.5);
    const wet = Array.from({ length: 20000 }, (_, i) => { g.time = i * 5; return g.rain; }).filter((r) => r > 0).length / 20000;
    expect(wet).toBeGreaterThan(0.04); // a March day is wet one time in three (Met Office), raining for 6 of its hours: 8%
    expect(wet).toBeLessThan(0.14);
  });
});

describe('voice routing', () => {
  it('calls each cue once and in order, and none after its junction', () => {
    const r = route(town, town.nodes[0], town.nodes[120]);
    const nav = new Navigator(r);
    const cues: string[] = [];
    for (let along = 0; along <= r.length; along += 2) {
      const i = r.cum.findIndex((c) => c >= along);
      const a = r.points[Math.max(0, i - 1)], b = r.points[i], t = i ? (along - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1]) : 0;
      const cue = nav.step({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, 15);
      if (cue) { cues.push(cue.key); expect(cue.manoeuvre.at).toBeGreaterThan(along - 3); }
    }
    expect(new Set(cues).size).toBe(cues.length);
    expect(cues.at(-1)).toBe('end:reached');
  });
  it('names turns from the driver\'s seat', () => {
    // Heading +z (the camera looks that way) with +x on the driver's left, as car.ts steers it.
    const pts = [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 100, z: 100 }];
    expect(buildManoeuvres(pts, [0, 100, 200])[0].kind).toBe('left');
  });
});

describe('a played session', () => {
  it('a scripted driver finishes quests and earns Points', () => {
    const s = runSession(town, 'hatchback', CASUAL, 11);
    expect(s.quests).toBeGreaterThan(1);
    expect(s.earned).toBeGreaterThan(50);
  });
  it('holds the economy to the design document', () => {
    for (const style of [CASUAL, SKILLED]) {
      const rows = table(town, style, 24); // the same seed count as tools/balance.ts: fewer seeds swings the ratios ±10% on traffic luck alone
      for (const r of rows) {
        expect(r.share, `${r.id} fuel share`).toBeGreaterThan(5); // fuel was cut to a third after play: it's a small bill now, not the game
        expect(r.share, `${r.id} fuel share`).toBeLessThan(25);
        expect(r.net / rows[0].net, `${r.id} net vs Hatchback`).toBeLessThan(2.3); // with fuel cheap, a better car keeps more of what it earns, and a session's fewer jobs make this noisier
      }
    }
  }, 600000);
});
