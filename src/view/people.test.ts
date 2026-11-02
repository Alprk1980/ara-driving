import { describe, expect, it } from 'vitest';
import { HAIR_STYLES, peopleSetErrors, personErrors, type PersonLook } from '../../schemas/people.ts';
import { STRIDE_M } from '../sim/walkers.ts';
import { BOB_M, figureGeometry, figureJoints, HIP_M, HIP_SWING, LOOKS, nextPace, PERSON_M, SHOULDER_M, walkPose } from './people.ts';

const TRIANGLE_BUDGET = 400; // seventy of these are on screen at once
const look = (hairStyle: PersonLook['hairStyle']): PersonLook => ({ ...LOOKS[0], hairStyle });
const bounds = (g: ReturnType<typeof figureGeometry>) => { g.computeBoundingBox(); return g.boundingBox!; };

describe('the shipped looks', () => {
  it('all pass, and together make a real crowd', () => {
    expect(LOOKS.flatMap(personErrors)).toEqual([]);
    expect(peopleSetErrors(LOOKS)).toEqual([]);
  });
});

describe('the figure', () => {
  for (const style of HAIR_STYLES) {
    const g = figureGeometry(look(style)), box = bounds(g);
    it(`${style}: stands on the ground at about adult height`, () => {
      expect(box.min.y).toBeCloseTo(0, 5);
      expect(box.max.y).toBeGreaterThan(PERSON_M - 0.06);
      expect(box.max.y).toBeLessThan(PERSON_M + 0.06);
    });
    it(`${style}: stays cheap to draw`, () => expect(g.getAttribute('position').count / 4 * 2).toBeLessThan(TRIANGLE_BUDGET));
  }

  it('looks the way it walks: eyes and toes on the +z side', () => {
    const parts = figureJoints(LOOKS[0]).flatMap((j) => j.parts);
    const eyes = parts.filter((p) => p.color === '#241a14'), shoes = figureJoints(LOOKS[0]).filter((j) => j.hip).map((j) => j.parts[1]);
    expect(eyes).toHaveLength(2);
    for (const e of eyes) expect(e.z).toBeGreaterThan(0);
    for (const s of shoes) expect(s.z).toBeGreaterThan(0);
  });

  it('swings each limb from its own joint, legs at the hip and arms at the shoulder', () => {
    const joints = figureJoints(LOOKS[0]);
    expect(joints.filter((j) => j.hip).map((j) => j.pivot)).toEqual([HIP_M, HIP_M]);
    expect(joints.filter((j) => j.arm).map((j) => j.pivot)).toEqual([SHOULDER_M, SHOULDER_M]);
  });

  it('moves opposite arm and leg together, as people do', () => {
    const [, legA, , armA] = figureJoints(LOOKS[0]), p = walkPose(Math.PI / 2, 1, 0);
    const legX = legA.parts[0].x, armX = armA.parts[0].x;
    expect(Math.sign(legX)).toBe(Math.sign(armX));
    expect(Math.sign(legA.hip * p.hip)).toBe(-Math.sign(armA.arm * p.arm));
  });
});

describe('the walk', () => {
  it('reaches as far as the step the walkers take, so feet do not slide', () => {
    expect(2 * HIP_M * Math.sin(HIP_SWING)).toBeCloseTo(STRIDE_M, 5);
  });

  it('rises and falls as far as a real walk, lowest with the legs apart', () => {
    expect(walkPose(0, 1, 0).drop).toBe(0);
    expect(walkPose(Math.PI / 2, 1, 0).drop).toBeCloseTo(BOB_M, 5);
  });

  it('stands still at pace 0, with no stride left in the legs', () => {
    const p = walkPose(1.2, 0, 3);
    expect(p.hip).toBe(0);
    expect(p.drop).toBe(0);
    expect(Math.abs(p.arm)).toBeLessThan(0.06);
  });

  it('eases into step and out of it, within limits', () => {
    expect(nextPace(0, true, 0.1)).toBeCloseTo(0.4, 5);
    expect(nextPace(1, true, 0.1)).toBe(1);
    expect(nextPace(0.2, false, 1)).toBe(0);
  });
});
