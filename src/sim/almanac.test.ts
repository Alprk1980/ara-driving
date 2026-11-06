// The town's sun and rain against published figures for Birmingham.
import { describe, expect, it } from 'vitest';
import { isBST, lightFrac, RAIN_SPELL_H, sunFor, WET_DAYS, wetOdds } from './almanac.ts';
import { Game, isNight } from './game.ts';
import { Town } from './town.ts';

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
const MIN = 1 / 60;

describe('the sun', () => {
  // Birmingham's published times (timeanddate.com, from memory of its tables): within a few minutes.
  it.each([
    ['2026-11-06', '07:11', '16:31'],
    ['2026-06-21', '04:43', '21:34'],
    ['2026-12-21', '08:16', '15:55'],
  ])('rises and sets on %s as Birmingham does', (day, rise, set) => {
    const s = sunFor(day);
    expect(Math.abs(s.rise - hm(rise))).toBeLessThan(5 * MIN);
    expect(Math.abs(s.set - hm(set))).toBeLessThan(5 * MIN);
  });
  it('keeps British Summer Time from the last Sunday in March to the last in October', () => {
    expect(isBST(2026, 3, 28)).toBe(false);
    expect(isBST(2026, 3, 29)).toBe(true);
    expect(isBST(2026, 10, 24)).toBe(true);
    expect(isBST(2026, 10, 25)).toBe(false);
  });
  it('puts sunrise and sunset where the skies were drawn, and night only after dark', () => {
    const s = sunFor('2026-12-21');
    expect(lightFrac(s.rise / 24, s)).toBeCloseTo(0.25, 5);
    expect(lightFrac(s.set / 24, s)).toBeCloseTo(0.75, 5);
    expect(isNight(lightFrac(17 / 24, s))).toBe(true); // dark by five in December
    const june = sunFor('2026-06-21');
    expect(isNight(lightFrac(21 / 24, june))).toBe(false); // still light at nine in June
  });
});

describe('the rain', () => {
  it('comes from the Met Office\'s 132 wet days a year', () => {
    expect(WET_DAYS.reduce((a, b) => a + b, 0)).toBeCloseTo(132.5, 0);
    expect(wetOdds(11)).toBeGreaterThan(wetOdds(7)); // November is the wettest month, July the driest
  });
  it('falls on about the right share of days, and for a wet day\'s hours', () => {
    const town = new Town(), g = new Game({ places: [{ id: 'a', name: 'A', kind: 'shop' }], quests: [] }, { points: () => 0, spend: () => false, earn: () => {} }, { town, day: '2026-11-06' });
    let wet = 0, n = 0;
    for (let t = 200; t < 480 * 400; t += 5) { g.time = t; n++; if (g.rain > 0) wet++; }
    expect(wet / n).toBeCloseTo(wetOdds(11) * (RAIN_SPELL_H / 24), 1.5);
  });
});
