import { describe, expect, it } from 'vitest';
import type { Sky } from '../../schemas/content.ts';
import { skyAt } from './sky.ts';

const key = (id: string, at: number, sky: string, night: number): Sky => ({ id, at, sky, fog: sky, sun: '#ffffff', sunPower: 1, ambient: 1, tint: '#ffffff', night });
const keys = [key('day', 0.5, '#ffffff', 0), key('dark', 0.9, '#000000', 1)];

describe('sky', () => {
  it('lands on a keyframe', () => {
    expect(skyAt(keys, 0.5, 0).sky[0]).toBeCloseTo(1);
    expect(skyAt(keys, 0.9, 0).night).toBeCloseTo(1);
  });
  it('blends between keyframes', () => expect(skyAt(keys, 0.7, 0).sky[0]).toBeCloseTo(0.5));
  it('wraps past midnight without a jump', () => {
    const before = skyAt(keys, 0.99, 0).sky[0], after = skyAt(keys, 0.01, 0).sky[0];
    expect(Math.abs(after - before)).toBeLessThan(0.1);
    expect(skyAt(keys, 0.2, 0).sky[0]).toBeCloseTo(0.5);
  });
  it('rain dims the sun and pulls the fog in', () => {
    const dry = skyAt(keys, 0.5, 0), wet = skyAt(keys, 0.5, 1);
    expect(wet.sunPower).toBeLessThan(dry.sunPower);
    expect(wet.fogFar).toBeLessThan(dry.fogFar);
  });
});
