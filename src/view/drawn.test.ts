import { describe, expect, it } from 'vitest';
import type { Piece } from '../../schemas/house.ts';
import { cut } from './drawn.ts';

const wall: Piece = { role: 'wall', x: 0, y: 0, z: 0, w: 10, h: 6, l: 8, color: '#888888' };
const volume = (list: Piece[]) => list.reduce((n, p) => n + p.w * p.h * p.l, 0);
const hole = { x0: -1, x1: 1, y0: -0.3, y1: 2, z0: 3, z1: 6 };

describe('cutting a crater from a building', () => {
  it('takes out exactly the part inside the hole', () => { expect(volume(cut(wall, hole))).toBeCloseTo(480 - 2 * 2 * 1, 5); });
  it('leaves a box it misses alone', () => { expect(cut(wall, { ...hole, x0: 20, x1: 30 })).toEqual([wall]); });
  it('takes a panel clean through', () => { const glass: Piece = { ...wall, role: 'window', z: 4, l: 0.04, w: 1, x: 0, h: 1, y: 0.5 }; expect(cut(glass, hole)).toEqual([]); });
  it('never cuts a roof', () => { const roof: Piece = { ...wall, role: 'roof', ridge: 'z', peak: 0.5 }; expect(cut(roof, hole)).toEqual([roof]); });
  it('drops an arch it reaches, but keeps a tall raked panel', () => { expect(cut({ ...wall, h: 3, arch: true }, hole)).toEqual([]); const tall = { ...wall, h: 8, fall: 2 }; expect(cut(tall, hole)).toEqual([tall]); });
});
