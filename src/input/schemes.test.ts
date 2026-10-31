// Input parity: one scripted route, driven through each scheme, must finish within 5% of the same time.
import { describe, expect, it } from 'vitest';
import { drive, SKILLED } from '../sim/autopilot.ts';
import { Game, STEP } from '../sim/game.ts';
import { Town } from '../sim/town.ts';
import { Dpad, FloatingJoystick, freshHeld, InputRouter, STICK_RADIUS, Tilt, type InputScheme } from './schemes.ts';

const content = { places: [{ id: 'a', name: 'A', kind: 'shop' as const }], quests: [] };
const wallet = { points: () => 0, spend: () => false, earn: () => {} };
const town = new Town(7, { bare: true }); // parked cars are a fair hazard, but a smooth input running wide into one says nothing about the input

async function lap(scheme: InputScheme, feed: (steer: number, go: boolean, brake: boolean) => void): Promise<number> {
  const g = new Game(content, wallet, { seed: 4, town });
  g.traffic.cars.length = 0; // an empty road: what's being timed is the input, not who pulled out in front
  const router = new InputRouter(scheme);
  await router.setScheme(scheme);
  const to = town.nodes[100];
  g.setWaypoint(to);
  for (let s = 0; s < 3600 * 5; s++) {
    if (!g.nav) return s * STEP;
    const want = drive(g, SKILLED);
    feed(want.steer, want.throttle > 0, want.brake > 0);
    g.step(router.step(STEP, g.player.speed / g.player.vMax));
  }
  throw new Error(`${scheme.id} never arrived`);
}

describe('input parity', () => {
  it('every scheme drives one route in about the same time', async () => {
    const dHeld = freshHeld(), jHeld = freshHeld(), tHeld = freshHeld();
    const dpad = new Dpad(dHeld), stick = new FloatingJoystick(jHeld);
    const tilt = new Tilt(tHeld);
    tilt.start = async () => true; // no sensor under test; tiltDeg is fed directly
    const times = {
      dpad: await lap(dpad, (s, go, brake) => Object.assign(dHeld, { left: s < -0.2, right: s > 0.2, go, brake })),
      joystick: await lap(stick, (s, go, brake) => { stick.offsetX = s * STICK_RADIUS; Object.assign(jHeld, { go, brake }); }),
      tilt: await lap(tilt, (s, go, brake) => { tilt.tiltDeg = s * 28; Object.assign(tHeld, { go, brake }); }),
    };
    console.table(times);
    const all = Object.values(times), lo = Math.min(...all), hi = Math.max(...all);
    expect(hi / lo).toBeLessThan(1.05);
  });

  it('falls back to the joystick when tilt cannot start', async () => {
    const stick = new FloatingJoystick(freshHeld());
    const failed: string[] = [];
    const router = new InputRouter(stick, (id) => failed.push(id));
    const tilt = new Tilt(freshHeld());
    tilt.start = async () => false;
    expect(await router.setScheme(tilt)).toBe('joystick');
    expect(failed).toEqual(['tilt']);
  });

  it('never leaves a pedal held when switching', async () => {
    const held = freshHeld();
    const dpad = new Dpad(held);
    const router = new InputRouter(dpad);
    await router.setScheme(dpad);
    held.go = true;
    router.step(STEP, 0);
    await router.setScheme(new FloatingJoystick(freshHeld()));
    expect(router.intent.throttle).toBe(0);
  });
});
