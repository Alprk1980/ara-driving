// Every car's cabin, as Qwen chose it, holds to the trim rules: a dark dash top that doesn't reflect in the windscreen.
import { describe, expect, it } from 'vitest';
import { interiorErrors, type InteriorPalette } from '../../schemas/interiors.ts';
import { CARS } from '../sim/economy.ts';
import interiors from './interiors.json';

const ids = CARS.map((c) => c.id);
describe('the cabins', () => {
  it('cover every car and pass the trim rules', () => {
    expect((interiors as InteriorPalette[]).map((p) => p.id).sort()).toEqual([...ids].sort());
    expect((interiors as InteriorPalette[]).flatMap((p) => interiorErrors(p, ids))).toEqual([]);
  });
  it('turn away a pale dashboard, and coloured seats in an everyday car', () => {
    const ok: InteriorPalette = { id: 'hatchback', pad: '#2b2e34', lower: '#3a3e46', frame: '#33363d', lining: '#c9c4b8', seat: '#2f333b', rim: '#1e2026', screen: '#16263a' };
    expect(interiorErrors(ok, ids)).toEqual([]);
    expect(interiorErrors({ ...ok, pad: '#d8d2c4' }, ids).join()).toMatch(/windscreen/);
    expect(interiorErrors({ ...ok, seat: '#c8201e' }, ids).join()).toMatch(/coloured seats/);
    expect(interiorErrors({ ...ok, id: 'supercar', seat: '#c8201e' }, ids)).toEqual([]);
  });
});
