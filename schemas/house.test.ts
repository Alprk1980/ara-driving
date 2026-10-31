import { describe, expect, it } from 'vitest';
import { houseErrors, trianglesOf, type HouseSize, type Piece } from './house.ts';

const SIZE: HouseSize = { wide: [11, 13], tall: [7.5, 9], deep: [9, 15], triangles: 1200 };
const box = (role: Piece['role'], x: number, y: number, z: number, w: number, h: number, l: number): Piece => ({ role, x, y, z, w, h, l, color: '#887766' });
const roof = (x: number, y: number, z: number, w: number, h: number, l: number, ridge: 'x' | 'z'): Piece => ({ ...box('roof', x, y, z, w, h, l), ridge, peak: 0.5 });
const panel = (role: Piece['role'], x: number, y: number) => box(role, x, y, 6.05, 1, 1.5, 0.1);
const house = (): Piece[] => [
  box('wall', -2, 0, 0, 8, 5.5, 12), roof(-2, 5.5, 0, 8, 2.7, 12, 'z'), box('wall', 3.5, 0, 0, 4, 3, 10), roof(3.5, 3, 0, 4, 1.5, 10, 'x'),
  panel('window', -4, 1), panel('window', -4, 3.5), panel('window', -2, 3.5), panel('window', 0, 3.5), panel('window', 0, 1), panel('door', -2, 0), box('door', 5.55, 0, 0, 0.1, 2, 1), box('garage_door', 3.5, 0, 5.05, 3, 2.2, 0.1),
];

describe('a building in parts', () => {
  it('accepts a sound house', () => {
    expect(houseErrors(house(), SIZE)).toEqual([]);
    expect(trianglesOf(house())).toBeLessThan(200);
  });
  it('refuses a floating window', () => { const h = house(); h[4] = { ...h[4], x: 30 }; expect(houseErrors(h, SIZE).join()).toMatch(/sit on a wall/); });
  it('refuses the wrong size', () => { const h = house(); h[0] = { ...h[0], w: 30 }; expect(houseErrors(h, SIZE).join()).toMatch(/wide/); });
  it('refuses a roof with no pitch given', () => { const h = house(); delete h[1].peak; expect(houseErrors(h, SIZE).join()).toMatch(/ridge/); });
  it('refuses a garage as tall as the house', () => { const h = house(); h[3] = { ...h[3], y: 5.5, h: 2.7 }; h[2] = { ...h[2], h: 5.5 }; expect(houseErrors(h, SIZE).join()).toMatch(/lower/); });
  it('refuses a missing garage door', () => { expect(houseErrors([...house().filter((p) => p.role !== 'garage_door'), box('trim', -2, 0, 6.2, 8, 0.3, 0.3)], SIZE).join()).toMatch(/garage_door/); });
  it('holds the main roof to the share of the front the drawing gives it', () => { expect(houseErrors(house(), { ...SIZE, mainRoofShare: [0.8, 0.9] }).join()).toMatch(/spans/); });
  it('holds the eaves to the drawing', () => { expect(houseErrors(house(), { ...SIZE, eaves: [0.2, 0.3] }).join()).toMatch(/eaves/); });
  it('asks for the glass the drawing shows', () => { expect(houseErrors(house(), { ...SIZE, frontWindows: 20 }).join()).toMatch(/window panes/); });
  it('asks for the glass on the back too', () => { expect(houseErrors(house(), { ...SIZE, backWindows: 2 }).join()).toMatch(/on the back/); });
  it('refuses a gable off centre or turned sideways', () => { const h = house(); h[1] = { ...h[1], ridge: 'x' }; expect(houseErrors(h, { ...SIZE, gableMain: true }).join()).toMatch(/centred gable/); });
  it('wants the wing roof as one slope falling to the right', () => { const h = house(); h[3] = { ...h[3], ridge: 'z', peak: 0.5 }; expect(houseErrors(h, { ...SIZE, wingShed: true }).join()).toMatch(/one slope/); h[3] = { ...h[3], peak: 0 }; expect(houseErrors(h, { ...SIZE, wingShed: true })).toEqual([]); });
  it('wants a raked window where the drawing has one', () => { const h = house(); expect(houseErrors(h, { ...SIZE, rakedWindow: true }).join()).toMatch(/follows the gable/); h[6] = { ...h[6], fall: 0.5 }; expect(houseErrors(h, { ...SIZE, rakedWindow: true })).toEqual([]); });
  it('refuses a fall on a wall, or one deeper than the panel', () => { const h = house(); h[0] = { ...h[0], fall: 1 }; expect(houseErrors(h, SIZE).join()).toMatch(/fall/); const g = house(); g[6] = { ...g[6], fall: 2 }; expect(houseErrors(g, SIZE).join()).toMatch(/fall/); });
  it('holds doors to real sizes', () => { expect(houseErrors(house(), { ...SIZE, door: { h: [1.95, 2.15], w: [0.75, 1] } }).join()).toMatch(/a door of 1.00 × 1.50/); });
  it('holds the garage door to real sizes', () => { expect(houseErrors(house(), { ...SIZE, garage: { h: [1.95, 2.6], w: [3.5, 4.3] } }).join()).toMatch(/garage door of 3.00/); });
  it('takes as many pieces as the drawing allows', () => { const many = [...house(), ...Array.from({ length: 80 }, () => box('trim', -2, 0, 6.2, 8, 0.3, 0.3))]; expect(houseErrors(many, { ...SIZE, triangles: 2000 }).join()).toMatch(/use 12-80/); expect(houseErrors(many, { ...SIZE, triangles: 2000, pieces: 100 })).toEqual([]); });
});
