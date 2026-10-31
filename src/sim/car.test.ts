// The crash record and the damage it leaves sit on the car itself, tested against one hand-built wall.
import { describe, expect, it } from 'vitest';
import { addCrush, crushLevel, DAMAGE_FULL_MPS, NEUTRAL, NO_DAMAGE_MPS, PlayerCar, sideOf } from './car.ts';
import type { Box, Town } from './town.ts';

describe('which face took the blow', () => {
  it('calls a wall on the side the car steers towards its right', () => {
    const open = { boxAt: () => null, offRoad: () => false, roughAt: () => false } as unknown as Town;
    const car = new PlayerCar('hatchback');
    car.x = car.z = 500;
    car.speed = 10;
    for (let i = 0; i < 30; i++) car.step(1 / 60, { steer: 1, throttle: 0.5, brake: 0 }, open);
    const rightward = Math.sign(Math.sin(car.heading)); // the nose swung this way along x, so that's the right of a car that faced +z
    expect(rightward).not.toBe(0);
    expect(sideOf(-rightward, 0, 0)).toBe('right'); // the normal points away from a wall on that side, at the car
    expect(sideOf(rightward, 0, 0)).toBe('left');
  });

  it('holds at any heading', () => {
    for (const h of [0, 0.7, 2.4, -1.9]) {
      const f = { x: Math.sin(h), z: Math.cos(h) }, right = { x: -f.z, z: f.x };
      expect(sideOf(-f.x, -f.z, h)).toBe('front');
      expect(sideOf(f.x, f.z, h)).toBe('back');
      expect(sideOf(-right.x, -right.z, h)).toBe('right');
      expect(sideOf(right.x, right.z, h)).toBe('left');
    }
  });
});

const wall: Box = { x: 0, z: 12, hx: 3, hz: 3, h: 8, hue: 0 };
const town = {
  boxAt: (x: number, z: number, r: number): Box | null =>
    Math.abs(x - wall.x) < wall.hx + r && Math.abs(z - wall.z) < wall.hz + r ? wall : null,
  offRoad: () => false,
  roughAt: () => false,
} as unknown as Town;

const driveIntoWall = (car: PlayerCar, launch: number, throttle: number): number => {
  car.place(0, 0, 0); // facing +z, straight at the wall
  car.state = 'Driving';
  car.speed = launch;
  for (let i = 0; i < 600; i++) {
    const impact = car.step(1 / 60, { steer: 0, throttle, brake: 0 }, town);
    if (impact > 0) return impact;
  }
  return 0;
};

describe('crash damage', () => {
  it('records the hit, with the wall normal pointing back at the car', () => {
    const car = new PlayerCar('hatchback');
    const impact = driveIntoWall(car, 14, 1);
    expect(impact).toBeGreaterThan(0);
    expect(car.hit).not.toBeNull();
    expect(car.hit!.nz).toBe(-1); // the wall is ahead, so its normal comes back at the nose
    expect(car.hit!.speed).toBe(impact);
    expect(car.damage).toBeCloseTo(crushLevel(impact, car.car.tough), 6);
  });
  it('clears the hit on the next clean step', () => {
    const car = new PlayerCar('hatchback');
    expect(driveIntoWall(car, 14, 1)).toBeGreaterThan(0);
    car.speed = 0;
    car.step(1 / 60, NEUTRAL, town);
    expect(car.hit).toBeNull();
  });
  it('a soft knock barely marks it', () => {
    const car = new PlayerCar('hatchback');
    driveIntoWall(car, 6, 0); // coasting in, so the wall gets a gentle tap
    expect(car.damage).toBeGreaterThan(0);
    expect(car.damage).toBeLessThan(0.2);
  });
  it('wears down, but never past a write-off', () => {
    const car = new PlayerCar('hatchback');
    car.place(0, 6, 0); // close to the wall and rolling
    car.state = 'Driving';
    for (let i = 0; i < 40; i++) {
      car.speed = DAMAGE_FULL_MPS;
      car.step(1 / 60, NEUTRAL, town);
    }
    expect(car.damage).toBe(1);
  });
  it('puts the dent on the face that took the blow', () => {
    const car = new PlayerCar('hatchback');
    driveIntoWall(car, 14, 1);
    expect(car.dents.front).toBeCloseTo(car.damage, 6);
    expect(car.dents.back + car.dents.left + car.dents.right).toBe(0);
  });
  it('scales with impact: nothing at a parking knock, about half at 56 km/h, all at 100', () => {
    expect(crushLevel(NO_DAMAGE_MPS)).toBe(0);
    expect(crushLevel(15.6)).toBeGreaterThan(0.45);
    expect(crushLevel(15.6)).toBeLessThan(0.55);
    expect(crushLevel(DAMAGE_FULL_MPS)).toBe(1);
    expect(crushLevel(8.3)).toBeLessThan(0.25); // 30 km/h
  });
  it('lets a tough car take more, and repeat knocks build up slower than they add', () => {
    expect(crushLevel(14, 1.3)).toBeLessThan(crushLevel(14));
    expect(addCrush(0.3, 0.3)).toBeLessThan(0.6);
    expect(addCrush(0.3, 0.3)).toBeGreaterThan(0.3);
  });
  it('bends for the speed into the wall, not the speed along it', () => {
    const square = new PlayerCar('hatchback'), glancing = new PlayerCar('hatchback');
    for (const [c, x, z, h] of [[square, 0, 7, 0], [glancing, -2.5, 7.5, 1.35]] as const) {
      c.place(x, z, h);
      c.state = 'Driving';
      c.speed = 18;
      for (let i = 0; i < 120 && c.damage === 0; i++) c.step(1 / 60, { steer: 0, throttle: 0, brake: 0 }, town);
    }
    expect(square.damage).toBeGreaterThan(glancing.damage * 3);
  });
  it('marks where the blow landed', () => {
    const car = new PlayerCar('hatchback');
    driveIntoWall(car, 14, 1);
    expect(car.marks.length).toBe(1);
    expect(car.marks[0].side).toBe('front');
    expect(Math.abs(car.marks[0].at)).toBeLessThan(0.05);
    car.mend(0);
    expect(car.marks).toEqual([]);
  });
  it('old damage arrives as a dented nose', () => {
    const car = new PlayerCar('hatchback');
    car.setDamage(0.5);
    expect(car.dents.front).toBeCloseTo(0.5, 6);
    expect(car.dents.left).toBe(0);
  });
  it('the pump thins every dent in the same proportion', () => {
    const car = new PlayerCar('hatchback');
    driveIntoWall(car, 14, 1);
    const dent = car.dents.front;
    car.mend(car.damage / 2);
    expect(car.dents.front).toBeCloseTo(dent / 2, 6);
    expect(car.damage).toBeCloseTo(dent / 2, 6);
  });
});

describe('at the controls', () => {
  const open = { boxAt: () => null, offRoad: () => false, roughAt: () => false } as unknown as Town;
  const rolling = (speed: number) => { const c = new PlayerCar('hatchback'); c.place(500, 500, 0); c.state = 'Driving'; c.speed = speed; return c; };

  it('the handbrake slows the car, but far less than the footbrake, as it holds only the rear wheels', () => {
    const hand = rolling(15), foot = rolling(15);
    for (let i = 0; i < 60; i++) { hand.step(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: true }, open); foot.step(1 / 60, { steer: 0, throttle: 0, brake: 1 }, open); }
    expect(hand.speed).toBeLessThan(13);
    expect(foot.speed).toBeLessThan(hand.speed - 3);
  });
  it('the handbrake stops the car dead at the end and swings the tail in a turn', () => {
    const c = rolling(1);
    for (let i = 0; i < 120; i++) c.step(1 / 60, { steer: 0, throttle: 0, brake: 0, handbrake: true }, open);
    expect(c.speed).toBe(0);
    const plain = rolling(12), swung = rolling(12);
    for (let i = 0; i < 20; i++) { plain.step(1 / 60, { steer: 1, throttle: 0, brake: 0 }, open); swung.step(1 / 60, { steer: 1, throttle: 0, brake: 0, handbrake: true }, open); }
    expect(Math.abs(swung.heading)).toBeGreaterThan(Math.abs(plain.heading));
  });
  it('the stalk toggles, swaps sides, and cancels itself after a turn', () => {
    const c = rolling(10);
    const step = (intent: Partial<{ steer: number; indicate: -1 | 1 }>) => c.step(1 / 60, { steer: 0, throttle: 0.3, brake: 0, ...intent }, open);
    step({ indicate: 1 });
    expect(c.indicator).toBe(1);
    step({ indicate: 1 });
    expect(c.indicator).toBe(0);
    step({ indicate: -1 });
    expect(c.indicator).toBe(-1);
    for (let i = 0; i < 90; i++) step({ steer: -1 });
    expect(c.indicator).toBe(-1); // still turning
    step({});
    expect(c.indicator).toBe(0); // straightened up
  });
});
