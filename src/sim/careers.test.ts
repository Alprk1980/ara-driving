// Stage D: signing on, working a shift and being paid the job's real rate. The player is moved to each task rather
// than driven there: the sat nav and the traffic have tests of their own.
import { describe, expect, it } from 'vitest';
import { CALL_KINDS, callErrors, callSetErrors, CAREER_IDS, CAREERS, careerRank, RANK_JOBS, type CallCard, type CareerId } from '../../schemas/careers.ts';
import { FLEET_RULES } from '../../schemas/fleet.ts';
import type { Place, QuestText } from '../../schemas/content.ts';
import calls from '../data/calls.json';
import places from '../data/places.json';
import { NEUTRAL } from './car.ts';
import { GAME_HOUR_S, LATE_OK_S, payFor, PULL_RANGE_M, type Task } from './careers.ts';
import { carById, isWorkCar, POINT_GBP, WORK_CARS } from './economy.ts';
import { Game, STEP, type GameEvent, type Wallet } from './game.ts';
import { dist, Town } from './town.ts';
import { tripErrors } from '../save.ts';

const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const purse = (n = 0): Wallet & { n: number } => ({ n, points() { return this.n; }, spend(k) { if (k > this.n) return false; this.n -= k; return true; }, earn(k) { this.n += k; } });
const content = { places: places as Place[], quests, calls: calls as CallCard[] };

function game(jobs: Partial<Record<CareerId, number>> = {}) {
  const w = purse(), g = new Game(content, w, { town, seed: 5 });
  g.progress.careers = { ...jobs };
  const events: GameEvent[] = [];
  g.on((e) => events.push(e));
  return { g, w, events };
}

/** Out of the car at a career's base, ready to sign on. */
function atBase(g: Game, career: CareerId) {
  const b = g.bases.find((x) => x.career === career)!;
  g.getOut();
  Object.assign(g.foot!, { x: b.at.x, z: b.at.z });
  return b;
}

/** Put the vehicle at the task, stopped, and run until it's paid or the task changes. */
function work(g: Game, limit = 120) {
  const t = g.shift!.task!, p = g.player;
  if (t.kind !== 'pull') { p.place(t.at.x, t.at.z, p.heading); p.speed = 0; }
  for (let i = 0; i < limit / STEP && g.shift?.task === t; i++) {
    if (t.kind !== 'pull') { p.x = t.at.x; p.z = t.at.z; p.speed = 0; }
    g.step(NEUTRAL);
  }
  return t;
}

describe('the careers, as researched', () => {
  it('pay rises with every rank, and never falls below the apprentice minimum wage', () => {
    for (const id of CAREER_IDS) {
      const r = CAREERS[id].ranks.map((x) => x.gbpHour);
      expect(r[0]).toBeGreaterThanOrEqual(7.55);
      expect(r[1]).toBeGreaterThan(r[0]);
      expect(r[2]).toBeGreaterThan(r[1]);
    }
  });
  it('turns the fire service\'s NJC pay into an hour over its 42 hour week', () => {
    expect(CAREERS.fire.ranks[1].gbpHour).toBeCloseTo(38881 / (42 * 52.14), 1);
  });
  it('pays a bus driver the ASHE median, £16.30, as about 11.6 Points each game hour', () => {
    expect(payFor(CAREERS.bus.ranks[1], GAME_HOUR_S, false)).toBe(Math.round(16.3 / POINT_GBP));
    expect(payFor(CAREERS.bus.ranks[1], GAME_HOUR_S * 10, true)).toBe(Math.round((16.3 / POINT_GBP) * 10 * 1.15));
  });
  it('gives every rank a vehicle that exists and can be driven', () => {
    for (const id of CAREER_IDS) for (const r of CAREERS[id].ranks) for (const v of r.vehicles) { expect(FLEET_RULES[v]).toBeTruthy(); expect(isWorkCar(v)).toBe(true); }
  });
  it('keeps buses to their 100 km/h limiter and goods vehicles to 90', () => {
    expect(carById('bus_double').topKmh).toBe(100);
    expect(carById('recovery_truck').topKmh).toBe(90);
    for (const c of WORK_CARS) expect(c.size[0]).toBeGreaterThan(4);
  });
  it('ranks by jobs done', () => {
    expect(careerRank(0)).toBe(0);
    expect(careerRank(RANK_JOBS[1])).toBe(1);
    expect(careerRank(RANK_JOBS[2] + 5)).toBe(2);
  });
});

describe('the calls Qwen wrote', () => {
  it('each pass the rules, and every kind of call has one', () => {
    expect((calls as CallCard[]).flatMap(callErrors)).toEqual([]);
    expect(callSetErrors(calls as CallCard[])).toEqual([]);
  });
  it('keep a family game gentle', () => {
    expect(callErrors({ id: 'x', career: 'ambulance', kind: 'cat1', title: 'Collapse', text: 'Someone is unconscious and bleeding at {place}.' }).join()).toMatch(/family game/);
  });
  it('say where with {place}', () => {
    expect(callErrors({ id: 'x', career: 'fire', kind: 'bin_fire', title: 'Bin fire', text: 'A wheelie bin is smouldering behind the shops.' }).join()).toMatch(/\{place\}/);
  });
});

describe('signing on', () => {
  it('finds a base for every career in the town', () => {
    const { g } = game();
    expect(g.bases.map((b) => b.career).sort()).toEqual([...CAREER_IDS].sort());
  });
  it('swaps your car for the service\'s vehicle, keeps yours, and puts it back when you sign off', () => {
    const { g, events } = game();
    g.player.fuel = 17;
    const b = atBase(g, 'bus');
    expect(g.signOn('bus')).toBe(true);
    expect(g.player.car.id).toBe('bus_single'); // a trainee takes the single decker
    expect(g.foot).toBeNull();
    expect(g.yours.fuel).toBe(17);
    expect(g.snapshot().car).toBe('hatchback'); // a save holds your own car, outside the base
    expect(g.offers).toEqual([]);
    const left = { x: g.ownCar!.x, z: g.ownCar!.z };
    g.signOff();
    expect(g.player.car.id).toBe('hatchback');
    expect(g.player.fuel).toBe(17);
    expect(dist(g.player, left)).toBeLessThan(0.01); // still where you left it
    expect(g.foot).not.toBeNull(); // walked here, so you walk back
    expect(dist(g.foot!, b.at)).toBeLessThan(25);
    expect(g.dest).toBe('Your car');
    expect(events.filter((e) => e.type === 'shift').map((e) => (e as { what: string }).what)).toEqual(['on', 'off']);
  });
  it('needs you at the right base', () => {
    const { g } = game();
    atBase(g, 'fire');
    expect(g.signOn('bus')).toBe(false);
    expect(g.signOn('fire')).toBe(true);
  });
  it('lets a higher rank take the bigger vehicle', () => {
    const { g } = game({ bus: RANK_JOBS[1] });
    atBase(g, 'bus');
    expect(g.vehiclesFor('bus')).toContain('bus_double');
    expect(g.signOn('bus', 'bus_double')).toBe(true);
    expect(g.player.car.id).toBe('bus_double');
  });
});

describe('a bus shift', () => {
  it('runs its stops in order, waits at a timing point when early, pays each stop and ends at the garage', () => {
    const { g, w, events } = game();
    atBase(g, 'bus');
    g.signOn('bus');
    const stops = g.shift!.tasks.filter((t) => t.kind === 'stop');
    expect(stops.length).toBe(8);
    expect(stops.filter((t) => t.timing).length).toBe(2);
    let waited = false;
    while (g.shift && g.shift.task?.kind === 'stop') {
      const t = g.shift.task;
      const early = t.timing && t.due - g.shift.clock > 20;
      const before = g.shift.clock;
      work(g);
      if (early) waited = g.shift!.clock >= t.due - 1 && g.shift!.clock - before > 15;
    }
    expect(waited).toBe(true); // jumping between stops is always early, so a timing point holds the bus
    const paid = events.filter((e) => e.type === 'shiftPaid');
    expect(paid.length).toBe(8);
    expect(w.n).toBeGreaterThan(0);
    expect(g.shift!.task!.kind).toBe('return');
    work(g);
    expect(g.shift).toBeNull();
    expect(g.player.car.id).toBe('hatchback');
    expect(g.progress.careers!.bus).toBe(8);
  }, 60000); // a whole shift of town, stepped at 60 a second
  it('allows a little lateness and no more', () => {
    expect(LATE_OK_S).toBeGreaterThan(0);
    expect(LATE_OK_S).toBeLessThanOrEqual(60);
  });
});

describe('blue-light shifts', () => {
  it('answer calls on blue lights, then take the patient to the clinic', () => {
    const { g, events } = game();
    atBase(g, 'ambulance');
    g.signOn('ambulance');
    const s = g.shift!;
    // Make the first call a category 1, which always goes to hospital.
    const cat1 = (calls as CallCard[]).find((c) => c.career === 'ambulance' && c.kind === 'cat1')!;
    Object.assign(s.task!, { card: cat1, blue: true });
    g.step(NEUTRAL);
    expect(g.player.blue).toBe(true);
    work(g);
    expect(s.task!.kind).toBe('convey');
    work(g);
    expect(events.filter((e) => e.type === 'shiftPaid').length).toBe(2);
    expect(s.task!.kind).toBe('call'); // the next shout
  });
  it('hold the scene for the call kind\'s time', () => {
    const { g } = game();
    atBase(g, 'fire');
    g.signOn('fire');
    const t = g.shift!.task!;
    const rule = (CALL_KINDS.fire as Record<string, { hold: number }>)[t.card!.kind];
    expect(t.hold).toBe(rule.hold);
    const start = g.shift!.clock;
    g.player.place(t.at.x, t.at.z, 0);
    work(g);
    expect(g.shift!.clock - start).toBeGreaterThanOrEqual(rule.hold - STEP);
  });
  it('take a crash in town to the front of the list for the crew on duty', () => {
    const { g } = game({ fire: RANK_JOBS[1] });
    atBase(g, 'fire');
    g.signOn('fire');
    const w = g.traffic.cars.find((c) => c.role === 'car')!;
    w.wreck = 100;
    w.damage = 0.8;
    expect(g.traffic.onIncident!(w, 'fire')).toBe(true);
    expect(g.shift!.task!.wreck).toBe(w);
  });
  it('a police constable stops a driver for a word, who pulls in and is let go', () => {
    const { g, events } = game({ police: RANK_JOBS[1] });
    atBase(g, 'police');
    g.signOn('police', 'police_car');
    const s = g.shift!, c = g.traffic.cars.find((x) => x.role === 'car' && !x.dormant)!;
    const p = g.player;
    s.tasks.unshift({ kind: 'pull', at: c, offender: c, reason: { why: 'speeding', outcome: 'a £100 fixed penalty and 3 points' }, title: 'Traffic stop', text: '', hold: 8, blue: true, booked: 20, due: 30 } as Task);
    p.place(c.x - Math.sin(c.heading) * (PULL_RANGE_M - 10), c.z - Math.cos(c.heading) * (PULL_RANGE_M - 10), c.heading);
    g.step(NEUTRAL);
    expect(c.pulled).toBe(true);
    for (let i = 0; i < 20 / STEP && s.task?.kind === 'pull'; i++) { p.x = c.x - Math.sin(c.heading) * 9; p.z = c.z - Math.cos(c.heading) * 9; p.speed = 0; g.step(NEUTRAL); }
    expect(c.pulled).toBe(false);
    expect(events.some((e) => e.type === 'shiftPaid' && /fixed penalty/.test(e.note))).toBe(true);
  });
});

describe('recovery and roadside work', () => {
  it('a recovery driver winches the car up, carries it, and drops it at the yard', () => {
    const { g } = game();
    atBase(g, 'recovery');
    g.signOn('recovery');
    const s = g.shift!, t = s.task!;
    expect(t.kind).toBe('tow');
    work(g);
    expect(s.rider).toBe(t.kerb);
    expect(t.kerb!.riding).toBe(true);
    expect(s.task!.kind).toBe('drop');
    const p = g.player;
    p.place(s.base.at.x + 30, s.base.at.z, 0);
    g.step(NEUTRAL);
    expect(dist(t.kerb!, p)).toBeLessThan(3); // it rides on the bed
    work(g);
    expect(s.rider).toBeNull();
    expect(t.kerb!.riding).toBe(false);
  });
  it('a mechanic mends it there, or calls a truck when it needs the garage', () => {
    const { g, events } = game();
    atBase(g, 'mechanic');
    g.signOn('mechanic');
    expect(g.shift!.task!.kind).toBe('fix');
    expect(['battery', 'tyre', 'fuel']).toContain(g.shift!.task!.card!.kind); // an apprentice starts on the simple faults
    work(g);
    const paid = events.find((e) => e.type === 'shiftPaid');
    expect(paid && /Fixed|recovery truck/.test((paid as { note: string }).note)).toBe(true);
  });
  it('promotes after enough jobs', () => {
    const { g, events } = game({ mechanic: RANK_JOBS[1] - 1 });
    atBase(g, 'mechanic');
    g.signOn('mechanic');
    work(g);
    expect(events.some((e) => e.type === 'careerRank' && e.rank === 1)).toBe(true);
    expect(g.shift!.rank.title).toBe(CAREERS.mechanic.ranks[1].title);
  });
});

describe('deliveries of their own', () => {
  it('a shop or depot sends some of the delivery work, with its own goods', () => {
    const { g } = game();
    let seen = 0;
    for (let i = 0; i < 30; i++) { g.refreshOffers(); seen += g.offers.filter((o) => o.business).length; }
    expect(seen).toBeGreaterThan(0);
    const o = (() => { for (let i = 0; i < 30; i++) { g.refreshOffers(); const b = g.offers.find((x) => x.business); if (b) return b; } return null; })()!;
    expect(o.type).toBe('delivery');
    expect(o.title).toContain(o.business!);
  });
});

describe('your own car while you work', () => {
  it('stays parked where you left it, solid to the traffic, and you get straight back in when it is outside', () => {
    const { g } = game();
    const b = g.bases.find((x) => x.career === 'fire')!;
    g.player.place(b.at.x, b.at.z, b.heading); // parked right outside
    expect(g.signOn('fire')).toBe(true);
    expect(dist(g.player, g.ownCar!)).toBeGreaterThan(10); // the fire engine waits along the road, clear of your car
    g.step(NEUTRAL);
    expect(g.traffic.yours).toMatchObject({ x: b.at.x, z: b.at.z });
    g.signOff();
    expect(g.foot).toBeNull();
    expect(g.player.car.id).toBe('hatchback');
    expect(dist(g.player, b.at)).toBeLessThan(0.01);
    expect(g.traffic.yours).not.toBeNull(); // until the next step clears it
    g.step(NEUTRAL);
    expect(g.traffic.yours).toBeNull();
  });
});

describe('a shift in the save', () => {
  it('comes back as it was: the vehicle, the tasks, the clock and your car where you left it', () => {
    const { g } = game();
    atBase(g, 'bus');
    g.signOn('bus');
    work(g);
    work(g);
    const trip = g.snapshot();
    expect(tripErrors(trip)).toEqual([]);
    expect(trip.shift!.tasks.length).toBe(g.shift!.tasks.length);
    const back = new Game(content, purse(), { town, seed: 5, trip });
    expect(back.player.car.id).toBe('bus_single');
    expect(back.shift!.jobs).toBe(2);
    expect(back.shift!.clock).toBeCloseTo(g.shift!.clock, 5);
    expect(back.shift!.task!.title).toBe(g.shift!.task!.title);
    expect(back.shift!.task!.stop).toBe(g.shift!.task!.stop);
    expect(back.ownCar).toMatchObject({ id: 'hatchback', x: g.ownCar!.x, z: g.ownCar!.z });
    back.signOff();
    expect(back.player.car.id).toBe('hatchback');
  });
  it("keeps a car on the recovery truck's bed", () => {
    const { g } = game();
    atBase(g, 'recovery');
    g.signOn('recovery');
    const k = g.shift!.task!.kerb!;
    work(g);
    const back = new Game(content, purse(), { town, seed: 5, trip: g.snapshot() });
    expect(back.shift!.rider).toBe(back.parked.cars[g.parked.cars.indexOf(k)]);
    expect(back.shift!.task!.kind).toBe('drop');
  });
  it('drops a shift that is malformed, and keeps the drive', () => {
    const { g } = game();
    atBase(g, 'police');
    g.signOn('police');
    const trip = g.snapshot();
    (trip.shift as unknown as { career: string }).career = 'pirate';
    expect(tripErrors(trip).join()).toMatch(/shift/);
  });
});

describe('the workshop', () => {
  it('books a car in at the garage for its real hours, and the work is done on foot at the bench', () => {
    const { g, events } = game({ mechanic: RANK_JOBS[1] });
    atBase(g, 'mechanic');
    g.signOn('mechanic');
    const s = g.shift!, mot = (calls as CallCard[]).find((c) => c.career === 'mechanic' && c.kind === 'mot')!;
    s.tasks.unshift({ kind: 'bench', at: s.base.at, card: mot, title: mot.title, text: '', hold: CALL_KINDS.mechanic.mot.hours * GAME_HOUR_S, blue: false, booked: CALL_KINDS.mechanic.mot.hours * GAME_HOUR_S, due: 99 } as Task);
    expect(s.task!.hold).toBeCloseTo(17.5, 5); // 52 minutes of MOT at 20 s an hour
    g.getOut();
    Object.assign(g.foot!, { x: s.base.at.x + 3, z: s.base.at.z });
    const start = s.clock;
    for (let i = 0; i < 30 / STEP && s.task?.kind === 'bench'; i++) g.step(NEUTRAL);
    expect(s.clock - start).toBeGreaterThanOrEqual(17.5 - STEP);
    expect(events.some((e) => e.type === 'shiftPaid' && e.title === mot.title)).toBe(true);
  });
  it('gives the workshop kinds real hours, and an apprentice services', () => {
    expect(CALL_KINDS.mechanic.mot.hours).toBeLessThanOrEqual(1);
    expect(CALL_KINDS.mechanic.clutch.hours).toBeGreaterThanOrEqual(3);
    expect(CALL_KINDS.mechanic.clutch.hours).toBeLessThanOrEqual(5);
  });
});

describe('holes in buildings', () => {
  it('know which town they were knocked into', () => {
    expect(new Town().layoutKey).toBe(town.layoutKey);
  });
});
