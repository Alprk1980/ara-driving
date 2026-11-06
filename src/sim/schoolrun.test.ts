// The school run: on a school day, in the peaks round 8 and 3, children walk to the schools and the road outside each
// is 20 mph, with the speeding offence and the thanks the road-sense record gives.
import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import places from '../data/places.json';
import { NEUTRAL } from './car.ts';
import { Game, STEP, type GameEvent, type Wallet } from './game.ts';
import { inPeak, SCHOOL_KMH, schoolDay, ZONE_M } from './schoolrun.ts';
import { dist, Town } from './town.ts';

const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const wallet: Wallet = { points: () => 0, spend: () => false, earn: () => {} };
const DAY_S = 480;
/** A game on a Friday in term, at 08:15. */
function at815() {
  const g = new Game({ places: places as Place[], quests }, wallet, { town, seed: 2, day: '2026-11-06' });
  g.time = (8.25 / 24 - 0.3) * DAY_S; // the clock starts at 07:12
  return g;
}

describe('when the school run is on', () => {
  it('runs on weekdays in term, not at weekends or in the holidays', () => {
    expect(schoolDay('2026-11-06')).toBe(true); // a Friday
    expect(schoolDay('2026-11-07')).toBe(false); // Saturday
    expect(schoolDay('2026-08-12')).toBe(false); // the summer holidays
    expect(schoolDay('2026-12-24')).toBe(false); // Christmas
    expect(schoolDay('2026-10-27')).toBe(false); // half term
  });
  it('covers the hour before school and after it', () => {
    expect(inPeak(8.25 / 24)).toBe(true);
    expect(inPeak(15.5 / 24)).toBe(true);
    expect(inPeak(12 / 24)).toBe(false);
    expect(inPeak(20 / 24)).toBe(false);
    expect(at815().schoolRun).toBe(true);
  });
  it('knows the town\'s schools', () => {
    const g = at815();
    expect(g.schools.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the 20 mph past a school', () => {
  function drivePast(kmh: number) {
    const g = at815(), s = g.schools[0], t = g.town, e = t.edges[t.snap(s.gate).edge], a = t.nodes[e.a], b = t.nodes[e.b];
    const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, along = (s.gate.x - a.x) * ux + (s.gate.z - a.z) * uz;
    const seen: GameEvent[] = [];
    g.on((x) => seen.push(x));
    const p = g.player, start = along - ZONE_M - 20, end = along + ZONE_M + 30;
    for (let d = start; d < end; d += (kmh / 3.6) * STEP) {
      p.place(a.x + ux * d + uz * 3, a.z + uz * d - ux * 3, Math.atan2(ux, uz));
      p.speed = kmh / 3.6;
      g.step(NEUTRAL);
    }
    void dist;
    return seen.filter((x) => x.type === 'road').map((x) => (x as { moment: string }).moment);
  }
  it('is speeding at 30 mph while the run is on', () => {
    expect(drivePast(48)).toContain('school_fast');
  }, 60000);
  it('is thanked for keeping to it all the way through', () => {
    const m = drivePast(SCHOOL_KMH - 4);
    expect(m).toContain('school_calm');
    expect(m).not.toContain('school_fast');
  }, 60000);
});

describe('children on the way to school', () => {
  it('walk near a school while the run is on, and are smaller than adults', () => {
    const g = at815(), s = g.schools[0];
    g.player.place(s.gate.x, s.gate.z, 0);
    for (let i = 0; i < 60 / STEP; i++) g.step(NEUTRAL);
    const kids = g.walkers.people.filter((w) => w.kid);
    expect(kids.length).toBeGreaterThan(5);
    for (const k of kids) { expect(k.tall).toBeLessThan(0.96); expect(dist(k, s.gate)).toBeLessThan(260); }
  }, 60000);
});
