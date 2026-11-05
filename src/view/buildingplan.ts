/**
 * What each building is, pure so tests and headless runs see the same town: which style, which paint, how tall, and
 * which walls and roof parts make it up. The facade itself is a pattern function, sampled per pixel for the textures in
 * facades.ts and per voxel for a broken wall in walls.ts, so a crater always matches the wall around it.
 */
import type { BuildingStyle } from '../../schemas/buildings.ts';
import type { Box } from '../sim/town.ts';
import { DISTRICT_IDS } from '../sim/districts.ts';

export const CORNICE = 0.35;
const SETBACK_IN = 2.6, SETBACK_FROM = 0.62; // the tower steps back this far, this share of the way up

export type Plan = { style: BuildingStyle; wall: string; storeys: number; ground: number; top: number; tierFrom: number; tierIn: number };

const hash = (a: number, b: number) => {
  let h = Math.imul(Math.round(a) * 73856093 ^ Math.round(b) * 19349663, 0x5bd1e995);
  h ^= h >>> 13;
  return (Math.imul(h, 0x5bd1e995) >>> 0) / 4294967296;
};

/** Pick a style: a stretch of street shares a favourite, as real streets are built in runs, with others in among it. */
export function planBuilding(b: Box, styles: readonly BuildingStyle[]): Plan {
  const pinned = b.style ? styles.find((s) => s.id === b.style) : undefined;
  const district = b.district ?? DISTRICT_IDS[2], kin = styles.filter((s) => s.district === district && !s.use); // a style kept for one building is never picked at random
  const pool = kin.length ? kin : styles;
  const favourite = pool[Math.floor(hash(Math.floor(b.x / 170), Math.floor(b.z / 170)) * pool.length)];
  const style = pinned ?? (b.hue < 0.45 ? favourite : pool[Math.floor(hash(b.x, b.z) * pool.length)]);
  const wall = style.walls[Math.floor(hash(b.z, b.x) * style.walls.length)];
  const [lo, hi] = style.storeys, wanted = Math.round(b.h / 3.4);
  const storeys = Math.max(lo, Math.min(hi, wanted));
  const ground = style.ground.kind === 'same' ? 0 : style.ground.height;
  const top = ground + (storeys - (ground ? 1 : 0)) * style.storey;
  const stepped = style.roof.kind === 'setback' && Math.min(b.hx, b.hz) > SETBACK_IN + 4;
  return { style, wall, storeys, ground, top, tierFrom: stepped ? ground + Math.round(((top - ground) * SETBACK_FROM) / style.storey) * style.storey : top, tierIn: stepped ? SETBACK_IN : 0 };
}

export type FacePart = 'wall' | 'glass' | 'frame' | 'accent' | 'main' | 'dark';

const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

/** One storey's bay: fx across it and fy up it, 0..1. */
export function upperPart(s: BuildingStyle, fx: number, fy: number): FacePart {
  const { form, w, h } = s.window, x0 = 0.5 - w / 2, x1 = 0.5 + w / 2, y0 = 0.52 - h / 2, y1 = 0.52 + h / 2;
  if (fy > 0.965) return 'frame'; // a string course at each floor
  if (form === 'ribbon') {
    if (!within(fy, y0, y1)) return 'wall';
    return fx < 0.04 || fx > 0.96 ? 'frame' : 'glass';
  }
  if (form === 'curtain') {
    if (!within(fx, x0, x1) || !within(fy, y0, y1)) return 'frame';
    return Math.abs(fx - 0.5) < 0.012 || Math.abs(fy - 0.52) < 0.012 ? 'frame' : 'glass';
  }
  if (form === 'shuttered' && within(fy, y0, y1) && (within(fx, x0 - w * 0.42, x0) || within(fx, x1, x1 + w * 0.42))) return 'accent';
  if (within(fx, x0 - 0.03, x1 + 0.03) && within(fy, y0 - 0.05, y0)) return 'frame'; // the sill
  if (!within(fx, x0, x1) || !within(fy, y0, y1)) return 'wall';
  if (form === 'arched') {
    const rx = w / 2, ry = rx * (s.bay / s.storey), cy = y1 - ry;
    if (fy > cy && ((fx - 0.5) / rx) ** 2 + ((fy - cy) / ry) ** 2 > 1) return 'wall';
  }
  const inX = Math.min(fx - x0, x1 - fx), inY = Math.min(fy - y0, y1 - fy);
  return inX < 0.025 || inY < 0.025 || Math.abs(fx - 0.5) < 0.012 ? 'frame' : 'glass';
}

/** The street floor: `cell` counts the bays along it, so doors and bays can alternate. */
export function groundPart(s: BuildingStyle, cell: number, fx: number, fy: number): FacePart {
  switch (s.ground.kind) {
    case 'shopfront':
      if (fy > 0.76) return 'accent'; // the fascia
      if (fy < 0.1 || fx < 0.05 || fx > 0.95) return 'main';
      return cell % 3 === 1 && within(fx, 0.38, 0.62) ? 'dark' : 'glass';
    case 'arcade': {
      const open = ((fx - 0.5) / 0.42) ** 2 + (Math.max(0, fy - 0.42) / 0.46) ** 2 < 1;
      if (open) return fx > 0.42 && fx < 0.58 && fy < 0.62 && cell % 3 === 1 ? 'dark' : 'glass'; // glazed shop bays, a door in every third, not black holes
      return fy > 0.92 ? 'accent' : 'main';
    }
    case 'lobby':
      if (fy > 0.84) return 'main';
      if (cell % 4 === 1 && within(fx, 0.2, 0.8)) return within(fx, 0.47, 0.53) ? 'accent' : 'glass';
      if (fy < 0.14) return 'main';
      return within(fx, 0.1, 0.9) ? 'glass' : 'main';
    case 'loading':
      if (cell % 2 === 0 && within(fx, 0.08, 0.92) && fy < 0.82) return Math.floor(fy * 14) % 3 === 0 ? 'accent' : 'main';
      return fy > 0.9 ? 'accent' : 'wall';
    default:
      return 'wall';
  }
}

export type WallRect = { role: 'upper' | 'ground'; hx: number; hz: number; y0: number; y1: number; inset: number };

/** The boxes of wall a building is made of, ground up; a setback tower's top sits inset. */
export function wallRects(b: Box, p: Plan): WallRect[] {
  const out: WallRect[] = [];
  if (p.ground) out.push({ role: 'ground', hx: b.hx, hz: b.hz, y0: 0, y1: p.ground, inset: 0 });
  if (p.tierFrom > p.ground) out.push({ role: 'upper', hx: b.hx, hz: b.hz, y0: p.ground, y1: p.tierFrom, inset: 0 });
  if (p.tierIn) out.push({ role: 'upper', hx: b.hx - p.tierIn, hz: b.hz - p.tierIn, y0: p.tierFrom, y1: p.top, inset: p.tierIn });
  return out;
}

/** Whole bays along a wall of this span, so a window is never cut by a corner. */
export const baysOn = (span: number, bay: number) => Math.max(1, Math.round(span / bay));
