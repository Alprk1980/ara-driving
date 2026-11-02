// The town's people, built like Habit Camp's voxel figures: legs and shoes, a torso, arms with hands, a box head with eyes
// and one of five hair styles, each a flat colour from src/data/people.json. They keep its chunky proportions on purpose
// (about 5.5 heads tall, where a real adult is about 7.5), scaled from its 1.5 m children up to adult height. Each look is
// one merged mesh, and limbs swing in the vertex shader from a per-person attribute, so 70 people cost about 24 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from '../../schemas/content.ts';
import type { PersonLook } from '../../schemas/people.ts';
import people from '../data/people.json';
import { STRIDE_M } from '../sim/walkers.ts';
import { paintedMaterial, partsGeometry } from './parts.ts';

export const LOOKS = people as PersonLook[];

// The mean of English men (176 cm, Health Survey for England via Statista) and women (about 162 cm, a weaker source), rounded up a little.
export const PERSON_M = 1.7;
const FIGURE_H = 6, CELL = PERSON_M / FIGURE_H; // Habit Camp's figure is 6 cells tall; every size below is in its cells
const LEG_LEN = 2.65, SHOULDER_Y = LEG_LEN + 1.82, HEAD_Y = LEG_LEN + 2.6, CROWN = HEAD_Y + 0.55, ARM_OUT = 0.06;
export const HIP_M = LEG_LEN * CELL, SHOULDER_M = SHOULDER_Y * CELL;
const EYE = '#241a14';

// Real hips swing about 31 degrees in all (level walking studies), and knees, ankles and pelvis find the rest of the step.
// These legs are straight, so they swing as far as the walkers' step needs, or the feet would slide along the pavement.
export const HIP_SWING = Math.asin(STRIDE_M / 2 / HIP_M);
const ARM_SWING = 0.4, IDLE_SWAY = 0.05, IDLE_HZ = 0.24; // judged: no study found gave shoulder angles; Habit Camp uses 0.45 and 0.05
export const BOB_M = 0.038; // the body's rise and fall in a step: 3.81 cm measured in 52 men walking normally
const PACE_S = 0.25; // how long someone takes to fall into step, or out of it

/** One limb and the point it swings from. Weights say which way it follows the hip and arm angles; the body has neither. */
type Joint = { pivot: number; hip: number; arm: number; parts: Part[] };

const lighter = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

/** The figure in metres, facing +z with its feet on y 0, limb by limb. */
export function figureJoints(look: PersonLook): Joint[] {
  const box = (w: number, h: number, l: number, color: string, x: number, y: number, z: number): Part => ({ shape: 'box', x: x * CELL, y: (y - h / 2) * CELL, z: z * CELL, w: w * CELL, h: h * CELL, l: l * CELL, color });
  const legs = [-1, 1].map((s): Joint => ({ pivot: HIP_M, hip: -s, arm: 0, parts: [
    box(0.62, LEG_LEN - 0.35, 0.66, look.trousers, s * 0.36, (LEG_LEN + 0.35) / 2, 0),
    box(0.66, 0.35, 0.92, look.shoes, s * 0.36, 0.175, 0.12),
  ] }));
  const arms = [-1, 1].map((s): Joint => ({ pivot: SHOULDER_M, hip: 0, arm: s, parts: [
    box(0.4, 0.86, 0.44, look.shirt, s * 0.94, SHOULDER_Y - 0.43, 0),
    box(0.36, 1, 0.4, look.skin, s * 0.94, SHOULDER_Y - 1.36, 0),
  ] }));
  const { hair } = look;
  const crown = box(1.16, 0.28, 1.12, hair, 0, CROWN + 0.1, 0), nape = box(1.16, 0.6, 0.22, hair, 0, HEAD_Y + 0.22, -0.5);
  const styles: Record<PersonLook['hairStyle'], Part[]> = {
    short: [crown, nape],
    long: [crown, box(1.18, 1.35, 0.24, hair, 0, HEAD_Y - 0.15, -0.52), box(0.12, 0.95, 0.9, hair, -0.6, HEAD_Y + 0.1, -0.05), box(0.12, 0.95, 0.9, hair, 0.6, HEAD_Y + 0.1, -0.05)],
    ponytail: [crown, nape, box(0.34, 0.95, 0.3, hair, 0, HEAD_Y - 0.2, -0.74)],
    curly: [box(1.32, 0.46, 1.26, hair, 0, CROWN + 0.18, 0), box(1.32, 0.85, 0.3, hair, 0, HEAD_Y + 0.1, -0.52), box(0.16, 0.6, 1, hair, -0.64, HEAD_Y + 0.25, -0.05), box(0.16, 0.6, 1, hair, 0.64, HEAD_Y + 0.25, -0.05)],
    cap: [box(1.16, 0.5, 0.22, hair, 0, HEAD_Y + 0.15, -0.5), box(1.18, 0.34, 1.14, lighter(look.shirt, 0.8), 0, CROWN + 0.12, 0), box(1, 0.1, 0.5, lighter(look.shirt, 0.8), 0, CROWN - 0.02, 0.76)],
  };
  const body: Joint = { pivot: 0, hip: 0, arm: 0, parts: [
    box(1.44, 2, 0.8, look.shirt, 0, LEG_LEN + 1, 0),
    box(1.1, 1.1, 1.05, look.skin, 0, HEAD_Y, 0),
    box(0.16, 0.16, 0.05, EYE, -0.24, HEAD_Y + 0.05, 0.53),
    box(0.16, 0.16, 0.05, EYE, 0.24, HEAD_Y + 0.05, 0.53),
    ...styles[look.hairStyle],
  ] };
  return [body, ...legs, ...arms];
}

/** One look as one mesh, with each vertex knowing its joint: [pivot height, hip weight, arm weight]. */
export function figureGeometry(look: PersonLook): THREE.BufferGeometry {
  return mergeGeometries(figureJoints(look).map((j) => {
    const g = partsGeometry(j.parts);
    if (j.arm) g.translate(0, -j.pivot, 0).rotateZ(j.arm * ARM_OUT).translate(0, j.pivot, 0); // arms hang a touch clear of the body
    g.setAttribute('limb', new THREE.Float32BufferAttribute(Array.from({ length: g.getAttribute('position').count }, () => [j.pivot, j.hip, j.arm]).flat(), 3));
    return g;
  }))!;
}

/** Bends each limb from its joint, in the same way the town's cars take their dents. */
export function figureMaterial(): THREE.MeshLambertMaterial {
  const m = paintedMaterial();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 limb; attribute vec2 stride;
        vec3 swung(vec3 v) { float a = limb.y * stride.x + limb.z * stride.y, c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = swung(objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y -= limb.x; transformed = swung(transformed); transformed.y += limb.x;');
  };
  m.customProgramCacheKey = () => 'walking-figure';
  return m;
}

/** A walk at `pace` 1, a stand at 0: the angles for a phase in the stride, and how far the body has dropped, lowest with the legs apart. */
export function walkPose(phase: number, pace: number, clock: number) {
  const s = Math.sin(phase), idle = IDLE_SWAY * Math.sin(clock * IDLE_HZ * Math.PI * 2 + phase) * (1 - pace);
  return { hip: HIP_SWING * s * pace, arm: ARM_SWING * s * pace + idle, drop: BOB_M * s * s * pace };
}

/** Someone who has stopped eases out of their stride, and doesn't freeze halfway through it. */
export const nextPace = (pace: number, walking: boolean, dt: number) => Math.max(0, Math.min(1, pace + ((walking ? 1 : -1) * dt) / PACE_S));
