import { describe, expect, it } from 'vitest';
import stylesJson from '../src/data/buildingstyles.json';
import { DISTRICT_IDS, type DistrictId } from '../src/sim/districts.ts';
import { Town } from '../src/sim/town.ts';
import { groundPart, planBuilding, upperPart, wallRects } from '../src/view/buildingplan.ts';
import { buildingSetErrors, buildingStyleErrors, colorGap, contrast, type BuildingStyle } from './buildings.ts';

const good = (): BuildingStyle => ({
  id: 'test_row', name: 'Test Row', district: 'garden', finish: 'brick', walls: ['#c08a6e', '#a8765c', '#d6ac92'], trim: '#efe6d6', glass: '#2a3a4c', bay: 3.4, storey: 3,
  window: { form: 'tall', w: 0.42, h: 0.62 }, ground: { kind: 'same', height: 3.2, main: '#efe6d6', accent: '#2f5d50' }, roof: { kind: 'pitched', color: '#6b5148' }, storeys: [2, 2],
});
const styles = stylesJson as unknown as BuildingStyle[];

describe('a building style', () => {
  it('passes a sensible one', () => expect(buildingStyleErrors(good())).toEqual([]));

  it('turns down colours that would not read', () => {
    const glass = good(); glass.glass = '#a8573f';
    expect(buildingStyleErrors(glass).some((e) => e.includes("doesn't stand out"))).toBe(true);
    const loud = good(); loud.walls[0] = '#ff0010';
    expect(buildingStyleErrors(loud).some((e) => e.includes('too loud'))).toBe(true);
    const same = good(); same.walls[1] = '#c18b6f';
    expect(buildingStyleErrors(same).some((e) => e.includes('too alike'))).toBe(true);
  });

  it('keeps each window form true to itself', () => {
    const ribbon = good(); ribbon.window = { form: 'ribbon', w: 0.5, h: 0.8 };
    expect(buildingStyleErrors(ribbon).filter((e) => e.includes('ribbon')).length).toBe(2);
    const curtain = good(); curtain.window = { form: 'curtain', w: 0.5, h: 0.4 };
    expect(buildingStyleErrors(curtain).some((e) => e.includes('curtain'))).toBe(true);
    const tall = good(); tall.window = { form: 'tall', w: 0.9, h: 0.3 };
    expect(buildingStyleErrors(tall).some((e) => e.includes('taller'))).toBe(true);
  });

  it('holds a style to its district: zoned floors, the right street floor', () => {
    const high = good(); high.storeys = [2, 3];
    expect(buildingStyleErrors(high).some((e) => e.includes('zoned for'))).toBe(true);
    const shop = good(); shop.ground.kind = 'shopfront';
    expect(buildingStyleErrors(shop).some((e) => e.includes('garden suburb'))).toBe(true);
    const shed = good(); shed.district = 'works';
    expect(buildingStyleErrors(shed).some((e) => e.includes('loading'))).toBe(true);
  });

  it('measures contrast and colour distance', () => {
    expect(contrast('#ffffff', '#000000')).toBeGreaterThan(20);
    expect(contrast('#808080', '#808080')).toBe(1);
    expect(colorGap('#000000', '#ffffff')).toBeCloseTo(441.67, 1);
  });
});

describe('the shipped styles', () => {
  it('are all valid and make a varied set', () => {
    for (const s of styles) expect(buildingStyleErrors(s), s.id).toEqual([]);
    expect(buildingSetErrors(styles)).toEqual([]);
  });

  it('look different between districts: palettes barely overlap', () => {
    for (const a of styles) for (const b of styles) {
      if (a.district === b.district) continue;
      const near = a.walls.filter((c) => b.walls.some((d) => colorGap(c, d) < 16)).length;
      expect(near, `${a.id} and ${b.id}`).toBeLessThan(2);
    }
  });

  it('every style draws windows and every street floor differs from the floors above', () => {
    const count = (f: (x: number, y: number) => string, part: string) => { let n = 0; for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) if (f((x + 0.5) / 40, (y + 0.5) / 40) === part) n++; return n; };
    for (const s of styles) {
      expect(count((x, y) => upperPart(s, x, y), 'glass'), s.id).toBeGreaterThan(80);
      if (s.ground.kind !== 'same') expect(count((x, y) => groundPart(s, 2, x, y), 'wall') < 1000, s.id).toBe(true);
    }
  });
});

describe('the plan of a building', () => {
  const town = new Town();
  it('gives every building a style of its own district, inside its zoning', () => {
    for (const b of town.boxes) {
      const p = planBuilding(b, styles);
      expect(p.style.district).toBe(b.district);
      expect(p.storeys).toBeGreaterThanOrEqual(p.style.storeys[0]);
      expect(p.storeys).toBeLessThanOrEqual(p.style.storeys[1]);
      expect(p.style.walls).toContain(p.wall);
      expect(p.top).toBeGreaterThan(4);
    }
  });

  it('is the same every time, and uses every style in the set', () => {
    const b = town.boxes[10];
    expect(planBuilding(b, styles)).toEqual(planBuilding(b, styles));
    const used = new Set(town.boxes.map((x) => planBuilding(x, styles).style.id));
    for (const s of styles) expect(used.has(s.id), s.id).toBe(true);
  });

  it('mixes styles within a district, with no style over half of it', () => {
    for (const d of DISTRICT_IDS as readonly DistrictId[]) {
      const list = town.boxes.filter((b) => b.district === d), tally = new Map<string, number>();
      for (const b of list) { const id = planBuilding(b, styles).style.id; tally.set(id, (tally.get(id) ?? 0) + 1); }
      expect(Math.max(...tally.values()) / list.length, d).toBeLessThan(0.5);
    }
  });

  it('stacks walls from the ground to the roof without a gap', () => {
    for (const b of town.boxes.slice(0, 300)) {
      const p = planBuilding(b, styles), rects = wallRects(b, p);
      expect(rects[0].y0).toBe(0);
      rects.forEach((r, i) => { if (i) expect(r.y0).toBeCloseTo(rects[i - 1].y1, 6); });
      expect(rects[rects.length - 1].y1).toBeCloseTo(p.top, 6);
    }
  });
});
