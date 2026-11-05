import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { tripErrors } from '../save.ts';
import type { DriveIntent } from './car.ts';
import { afterEating, afterRun, ENERGY_KCAL, FULL_RUN_S, REAL_RUN_KCAL_PER_KG_KM, RUN_KCAL_PER_M, RUNNER_KG } from './energy.ts';
import { Game, STEP, type Wallet } from './game.ts';
import { FOOT_RUN_MPS, FOOT_WALK_MPS } from './onfoot.ts';
import { Town } from './town.ts';

const places: Place[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const wallet = (): Wallet => ({ points: () => 0, spend: () => false, earn: () => {} });
const run = (g: Game, s: number, intent: DriveIntent) => { for (let i = 0; i < s / STEP; i++) g.step(intent); };
// Round and round in the middle of a crossroads, where no wall gets in the way: steering 0.2 makes a circle about 5 m across.
const jog: DriveIntent = { steer: 0.2, throttle: 1, brake: 0, handbrake: true }, stroll: DriveIntent = { steer: 0.2, throttle: 0.5, brake: 0 }; // held at half: holding it right forward breaks into a run after a few seconds

function outAtCrossroads() {
  const g = new Game({ places, quests }, wallet(), { town, seed: 4 });
  g.traffic.cars.length = 0;
  g.getOut();
  const n = town.nodes[town.adj.findIndex((a) => a.length >= 4)];
  Object.assign(g.foot!, { x: n.x, z: n.z });
  return g;
}

describe('running energy', () => {
  it('starts from the real cost of running, made gentler for play', () => {
    const real = (REAL_RUN_KCAL_PER_KG_KM * RUNNER_KG) / 1000; // kcal a metre for a 60 kg runner
    expect(real).toBeCloseTo(0.06, 3);
    expect(RUN_KCAL_PER_M / real).toBeGreaterThan(3); // the bar runs out faster than a body would: a departure, on purpose
    expect(FULL_RUN_S).toBeGreaterThanOrEqual(180); // a few minutes
  });

  it('drains while you run, and a full bar lasts a few minutes', () => {
    const g = outAtCrossroads();
    run(g, 60, jog);
    expect(g.energy).toBeCloseTo(1 - 60 / FULL_RUN_S, 1);
    run(g, FULL_RUN_S, jog);
    expect(g.energy).toBeLessThan(0.03);
    expect(g.foot!.running).toBe(false); // too tired to run
    expect(Math.abs(g.foot!.speed)).toBeCloseTo(FOOT_WALK_MPS, 1); // but still walking at full speed
  }, 30000); // five minutes of town, stepped at 60 a second

  it('costs nothing to walk', () => {
    const g = outAtCrossroads();
    run(g, 60, stroll);
    expect(g.energy).toBe(1);
  });

  it('comes back when you eat: a snack part of the way, a meal all of it', () => {
    expect(afterEating(0, 105)).toBeCloseTo(105 / ENERGY_KCAL, 5); // a banana, about half
    expect(afterEating(0, 105)).toBeLessThan(1);
    expect(afterEating(0, 600)).toBe(1); // a meal deal fills it
    const g = outAtCrossroads();
    g.energy = 0;
    g.eat(139); // a can of cola
    run(g, 2, jog);
    expect(g.foot!.running).toBe(true);
    expect(Math.abs(g.foot!.speed)).toBeCloseTo(FOOT_RUN_MPS, 1);
  });

  it('is saved with the drive', () => {
    const g = outAtCrossroads();
    g.energy = 0.4;
    const trip = g.snapshot();
    expect(trip.energy).toBe(0.4);
    expect(tripErrors(trip)).toEqual([]);
    expect(tripErrors({ ...trip, energy: 2 })).not.toEqual([]);
    const back = new Game({ places, quests }, wallet(), { town, seed: 4, trip });
    expect(back.energy).toBe(0.4);
  });

  it('never goes below empty', () => { expect(afterRun(0.01, 1000)).toBe(0); });
});
