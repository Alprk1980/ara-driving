import { describe, expect, it } from 'vitest';
import shipped from '../src/data/towncars.json';
import { townCarErrors, type TownCar } from './towncars.ts';

const good = (): TownCar => ({ id: 'test_car', name: 'Test Car', body: [[-2.2, 0.3], [-2.2, 0.82], [-2.0, 0.92], [-1.3, 0.94], [0.95, 0.94], [1.9, 0.76], [2.2, 0.62], [2.2, 0.3]], cabin: { rear: -1.5, front: 1.0, rearTop: -0.95, frontTop: 0.2, base: 0.94, top: 1.44 }, half: 0.9 });
const fails = (edit: (c: TownCar) => void, text: string) => { const c = good(); edit(c); expect(townCarErrors(c).some((e) => e.includes(text)), text).toBe(true); };

describe('a town car', () => {
  it('passes a sensible one', () => expect(townCarErrors(good())).toEqual([]));
  it('keeps to real sizes', () => {
    fails((c) => { c.body[0][0] = c.body[1][0] = -3.6; c.body[7][0] = c.body[6][0] = 3.6; }, 'real cars');
    fails((c) => { c.half = 1.4; }, 'half');
    fails((c) => { c.cabin.top = 2.6; }, 'road cars');
  });
  it('wants a shape that can be built', () => {
    fails((c) => { c.body[3][0] = -2.1; }, 'backwards');
    fails((c) => { c.cabin.base = 0.8; }, 'must meet the top');
    fails((c) => { c.cabin.frontTop = 0.9; }, 'lean back');
    fails((c) => { c.cabin.front = 1.9; }, 'bonnet ahead');
    fails((c) => { c.cabin.rearTop = 0; c.cabin.frontTop = 0.2; }, 'roof is too short');
    fails((c) => { c.body = c.body.slice(0, 3); }, '6-10');
  });
  it('rejects a bonnet that rises to the nose', () => fails((c) => { c.body[6][1] = 1.1; }, 'bonnet must fall'));
});

describe('the shipped town cars', () => {
  const cars = shipped as unknown as TownCar[];
  it('are all valid, and a real mix', () => {
    for (const c of cars) expect(townCarErrors(c), c.id).toEqual([]);
    expect(cars.length).toBeGreaterThanOrEqual(6);
    expect(cars.some((c) => c.van)).toBe(true);
    const heights = cars.map((c) => c.cabin.top);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.3);
  });
});
