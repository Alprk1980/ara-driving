import { describe, expect, it } from 'vitest';
import type { Part } from './content.ts';
import { FURNITURE_IDS, furnitureErrors, type FurnitureId, type FurnitureModel } from './furniture.ts';

const part = (shape: Part['shape'], x: number, y: number, z: number, w: number, h: number, l: number, color: string): Part => ({ shape, x, y, z, w, h, l, color });

// One sensible model of each, built to the rules, for the tests to break.
const GOOD: Record<FurnitureId, Part[]> = {
  bench: [part('box', 0, 0.4, 0, 1.8, 0.08, 0.45, '#8a5a34'), part('box', 0, 0.48, -0.19, 1.8, 0.4, 0.07, '#8a5a34'), part('box', -0.8, 0, 0, 0.08, 0.4, 0.45, '#33363d'), part('box', 0.8, 0, 0, 0.08, 0.4, 0.45, '#33363d')],
  bin: [part('cylinder', 0, 0, 0, 0.5, 0.9, 0.5, '#2f5d50'), part('cylinder', 0, 0.9, 0, 0.52, 0.1, 0.52, '#23262e')],
  planter: [part('box', 0, 0, 0, 1.1, 0.55, 1.1, '#8d8f98'), part('cone', 0, 0.55, 0, 1, 0.9, 1, '#3f9a57')],
  bollard: [part('cylinder', 0, 0, 0, 0.2, 1.05, 0.2, '#23262e'), part('cylinder', 0, 0.85, 0, 0.21, 0.08, 0.21, '#f4efd8')],
  cycle_rack: [part('box', -0.35, 0, 0, 0.05, 0.75, 0.05, '#9aa0ab'), part('box', 0.35, 0, 0, 0.05, 0.75, 0.05, '#9aa0ab'), part('box', 0, 0.72, 0, 0.75, 0.05, 0.05, '#9aa0ab')],
  bus_shelter: [part('box', 0, 2.4, 0, 3.6, 0.1, 1.5, '#3d4a5c'), part('box', 0, 0, -0.68, 3.5, 2.4, 0.05, '#a9d2e4'), part('box', -1.75, 0, -0.1, 0.06, 2.4, 1.2, '#a9d2e4'), part('box', 1.75, 0, -0.1, 0.06, 2.4, 1.2, '#a9d2e4'), part('box', 0, 0.45, -0.45, 2.2, 0.08, 0.35, '#8a5a34'), part('box', 0, 0, -0.45, 2, 0.45, 0.06, '#3d4a5c')],
  container: [part('box', 0, 0, 0, 2.44, 2.59, 6.06, '#ffffff'), part('box', 0, 0, 3.0, 2.3, 2.4, 0.04, '#9aa0ab')],
  pallets: [part('box', 0, 0, 0, 1.2, 0.14, 1.0, '#a9794a'), part('box', 0, 0.14, 0, 1.1, 0.9, 0.95, '#c49a66')],
};
const good = (id: FurnitureId): FurnitureModel => ({ id, parts: structuredClone(GOOD[id]) });
const fails = (id: FurnitureId, edit: (ps: Part[]) => void, text: string) => {
  const m = good(id);
  edit(m.parts);
  const errs = furnitureErrors(m);
  expect(errs.some((e) => e.includes(text)), `${text} in ${JSON.stringify(errs)}`).toBe(true);
};

describe('street furniture', () => {
  it.each(FURNITURE_IDS)('passes a sensible %s', (id) => expect(furnitureErrors(good(id))).toEqual([]));

  it('rejects unknown kinds and bad parts', () => {
    expect(furnitureErrors({ id: 'phone_box' as FurnitureId, parts: [] })[0]).toContain('must be one of');
    fails('bin', (ps) => { ps[0].color = '#2F5D50'; }, 'lowercase');
    fails('bin', (ps) => { ps[0].color = '#ffffff'; }, 'pure white');
    fails('bin', (ps) => { ps[1].y = 1.3; }, 'floats');
    fails('bin', (ps) => { ps[0].x = ps[1].x = 0.3; }, 'centre it');
  });

  it('keeps to real sizes', () => {
    fails('bin', (ps) => { ps[0].h = 1.4; ps[1].y = 1.4; }, 'tall');
    fails('bench', (ps) => { for (const p of ps.slice(0, 2)) p.w = 2.4; }, 'wide along the kerb');
    fails('container', (ps) => { ps[0].l = 12.2; }, 'deep');
  });

  it('wants the features that make each one read', () => {
    fails('bench', (ps) => { ps[0].y = 0.6; ps[1].y = 0.68; ps[2].h = ps[3].h = 0.6; }, 'needs a seat');
    fails('bench', (ps) => { ps[1].h = 0.2; }, 'needs a back');
    fails('bollard', (ps) => { ps[1].color = '#33363d'; }, 'contrasting collar');
    fails('cycle_rack', (ps) => { ps[1].h = 0.3; }, 'exactly 2 legs');
    fails('cycle_rack', (ps) => { ps[2].l = 0.12; }, 'tube');
    fails('bus_shelter', (ps) => { ps.push(part('box', 0, 0, 0.7, 3, 2.4, 0.05, '#a9d2e4')); }, 'open to the road');
    fails('bus_shelter', (ps) => { ps[1].z = 0.68; }, 'back wall');
    fails('planter', (ps) => { ps[1].color = '#8a5a34'; }, 'needs plants');
    fails('pallets', (ps) => { ps[0].w = 1.4; }, 'real pallet');
    fails('container', (ps) => { ps[1].color = '#ffffff'; }, 'only part 1');
  });
});

describe('the shipped street furniture', () => {
  it('has every kind, and each one is valid', async () => {
    const shipped = (await import('../src/data/furniture.json')).default as unknown as FurnitureModel[];
    expect(shipped.map((m) => m.id).sort()).toEqual([...FURNITURE_IDS].sort());
    for (const m of shipped) expect(furnitureErrors(m), m.id).toEqual([]);
  });
});
