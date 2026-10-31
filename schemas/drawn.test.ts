import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import buildingStyles from '../src/data/buildingstyles.json';
import { buildingTypes, type Band } from './buildingideas.ts';
import { drawnErrors } from './drawn.ts';
import type { Piece } from './house.ts';

const TYPE = { wide: [6, 20] as Band, deep: [6, 20] as Band, storeys: [1, 3] as Band };
const box = (role: Piece['role'], x: number, y: number, z: number, w: number, h: number, l: number, more: Partial<Piece> = {}): Piece => ({ role, x, y, z, w, h, l, color: '#887766', ...more });
const shed = (): Piece[] => [
  box('wall', 5, 0, -5, 10, 5, 10), box('roof', 5, 5, -5, 10, 2, 10, { ridge: 'z', peak: 0.5 }),
  box('door', 5, 0, 0.02, 1, 2.1, 0.04), box('window', 2, 2, 0.02, 1, 1, 0.04), box('window', 8, 2, 0.02, 1, 1, 0.04), box('window', 2, 2, -10.02, 1, 1, 0.04), box('window', 8, 2, -10.02, 1, 1, 0.04),
  ...Array.from({ length: 9 }, (_, i) => box('trim', 1 + i, 0, 0.02, 0.5, 0.3, 0.04)),
];

describe('a building drawn in pieces', () => {
  it('accepts a sound one', () => { expect(drawnErrors(shed(), TYPE, 2)).toEqual([]); });
  it('measures the footprint from the walls, not the eaves', () => { expect(drawnErrors([...shed(), box('trim', 5, 4.9, -5, 30, 0.1, 30)], { ...TYPE, wide: [9, 11] }, 2).join()).not.toMatch(/wide/); });
  it('refuses the wrong footprint', () => { expect(drawnErrors(shed(), { ...TYPE, wide: [12, 20] }, 2).join()).toMatch(/wide/); });
  it('refuses a height the storeys cannot explain', () => { expect(drawnErrors(shed(), TYPE, 9).join()).toMatch(/tall/); });
  it('refuses a door nobody fits through', () => { const h = shed(); h[2] = { ...h[2], h: 1.5 }; expect(drawnErrors(h, TYPE, 2).join()).toMatch(/a door 1.50/); });
  it('wants windows front and back', () => { expect(drawnErrors(shed().filter((p) => !(p.role === 'window' && p.z < -5)), TYPE, 2).join()).toMatch(/front and back/); });
  it('refuses a spike through the roof, as Qwen\'s house had', () => { expect(drawnErrors([...shed(), box('trim', 5, 3, 0.02, 0.1, 6, 0.04)], TYPE, 2).join()).toMatch(/over the roof/); });
  it('refuses a piece floating free', () => { expect(drawnErrors([...shed(), box('trim', 5, 30, 3, 1, 1, 1)], TYPE, 2).join()).toMatch(/float|tall/); });
  it('refuses a hip longer than the ridge can give', () => { const h = shed(); h[1] = { ...h[1], hip: 6 }; expect(drawnErrors(h, TYPE, 2).join()).toMatch(/hip/); });
  it('refuses an inset that leaves no top', () => { const h = shed(); h[1] = { ...h[1], inset: 5 }; expect(drawnErrors(h, TYPE, 2).join()).toMatch(/inset/); });
  it('refuses an arch on anything but a thin panel', () => { const h = shed(); h[0] = { ...h[0], arch: true }; expect(drawnErrors(h, TYPE, 2).join()).toMatch(/arch/); });
});

describe('the shipped drawn buildings', () => {
  const types = buildingTypes(buildingStyles as never), dir = 'src/data/drawn';
  for (const file of readdirSync(dir)) it(`${file} passes`, () => {
    const b = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
    expect(drawnErrors(b.pieces, types.find((t) => t.type === b.type)!, b.storeys)).toEqual([]);
  });
});
