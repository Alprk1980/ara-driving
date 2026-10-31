import { describe, expect, it } from 'vitest';
import profilesJson from '../src/data/carprofiles.json';
import { CARS } from '../src/sim/economy.ts';
import { carProfileErrors, profileVsCar, type CarBodyProfile } from './carprofiles.ts';

// A sensible hatchback: the shape every test case bends away from.
const hatch = (): CarBodyProfile => ({
  id: 'hatchback',
  sill: 0.3,
  wheels: { radius: 0.32, width: 0.2, front: 0.78, rear: 0.26, track: 0.82 },
  panel: [
    { z: 0, v: 0.62 },
    { z: 0.2, v: 0.66 },
    { z: 0.5, v: 0.68 },
    { z: 0.8, v: 0.64 },
    { z: 1, v: 0.5 },
  ],
  width: [
    { z: 0, v: 0.86 },
    { z: 0.5, v: 0.9 },
    { z: 1, v: 0.82 },
  ],
  cabin: { front: 0.78, back: 0.3, width: 0.72, height: 0.9, belt: 0.66, rakeF: 0.09, rakeR: 0.07 },
});

const pickup = (): CarBodyProfile => ({
  ...hatch(),
  id: 'pickup',
  sill: 0.38,
  wheels: { radius: 0.38, width: 0.24, front: 0.76, rear: 0.24, track: 0.84 },
  panel: [
    { z: 0, v: 0.5 },
    { z: 0.25, v: 0.5 },
    { z: 0.5, v: 0.55 },
    { z: 0.8, v: 0.6 },
    { z: 1, v: 0.52 },
  ],
  cabin: { front: 0.76, back: 0.55, width: 0.7, height: 0.92, belt: 0.6, rakeF: 0.04, rakeR: 0.03 },
  bed: { front: 0.5, floor: 0.4 },
});

describe('the shipped profiles', () => {
  const profiles = profilesJson as unknown as CarBodyProfile[];
  it('cover every car and pass both checks', () => {
    expect(profiles.length).toBe(CARS.length);
    for (const car of CARS) {
      const p = profiles.find((x) => x.id === car.id);
      if (!p) { expect(p, `no profile for ${car.id}`).toBeTruthy(); continue; }
      expect(carProfileErrors(p), car.id).toEqual([]);
      expect(profileVsCar(p, car.size), car.id).toEqual([]);
    }
  });
});

describe('car body profiles', () => {
  it('passes a sensible hatchback and pickup', () => {
    expect(carProfileErrors(hatch())).toEqual([]);
    expect(carProfileErrors(pickup())).toEqual([]);
    expect(profileVsCar(hatch(), [3.8, 1.5, 1.8])).toEqual([]);
    expect(profileVsCar(pickup(), [4.8, 1.8, 1.95])).toEqual([]);
  });

  it('wants a snake_case id and numbers where the sculptor reads them', () => {
    const p = hatch();
    p.id = 'Hatch Back';
    expect(carProfileErrors(p).some((e) => e.includes('snake_case'))).toBe(true);
    const q = hatch();
    (q.panel[1] as { v: number }).v = 'tall' as unknown as number;
    expect(carProfileErrors(q).some((e) => e.includes('panel[1]'))).toBe(true);
  });

  it('wants the silhouette lines to run tail to nose without doubling back', () => {
    const p = hatch();
    p.panel[2].z = 0.1;
    const errs = carProfileErrors(p);
    expect(errs.some((e) => e.includes('z must grow'))).toBe(true);
    const q = hatch();
    q.width.pop();
    q.width.push({ z: 0.9, v: 0.82 });
    expect(carProfileErrors(q).some((e) => e.includes('width must end at z 1'))).toBe(true);
    const r = hatch();
    r.panel[0].z = 0.1;
    expect(carProfileErrors(r).some((e) => e.includes('panel must start at z 0'))).toBe(true);
  });

  it('keeps wheels believable next to the body', () => {
    const p = hatch();
    p.wheels.radius = 0.6;
    expect(carProfileErrors(p).some((e) => e.includes('wheels.radius'))).toBe(true);
    const q = hatch();
    q.wheels.front = 0.3;
    q.wheels.rear = 0.2;
    expect(carProfileErrors(q).some((e) => e.includes('wheelbase'))).toBe(true);
    const r = hatch();
    r.sill = 0.5;
    expect(carProfileErrors(r).some((e) => e.includes('sill'))).toBe(true);
  });

  it('keeps the cabin a cabin', () => {
    const p = hatch();
    p.cabin.front = 0.38;
    expect(carProfileErrors(p).some((e) => e.includes('too short'))).toBe(true);
    const q = hatch();
    q.cabin.belt = 0.88;
    q.cabin.height = 0.9;
    expect(carProfileErrors(q).some((e) => e.includes('roof must sit above the belt'))).toBe(true);
  });

  it('checks the shape against the car it has to fit', () => {
    const squat = hatch();
    squat.wheels.radius = 0.45;
    expect(profileVsCar(squat, [4.5, 1.15, 2]).some((e) => e.includes('wheels too tall'))).toBe(true);
    const sunken = hatch();
    sunken.cabin.height = 0.5;
    expect(profileVsCar(sunken, [3.8, 1.5, 1.8]).some((e) => e.includes('rise above the panel'))).toBe(true);
    const wedge = hatch();
    wedge.cabin.width = 0.9;
    expect(profileVsCar(wedge, [3.8, 1.5, 1.8]).some((e) => e.includes('wider than the body'))).toBe(true);
    const truck = pickup();
    truck.bed!.front = 0.7;
    expect(profileVsCar(truck, [4.8, 1.8, 1.95]).some((e) => e.includes('stop behind the cabin'))).toBe(true);
  });

  it('keeps the body under the windows and the wheels under the body', () => {
    const buried = hatch();
    buried.panel[0].v = 0.82;
    expect(profileVsCar(buried, [3.8, 1.5, 1.8]).some((e) => e.includes('over the belt line'))).toBe(true);
    const stubby = hatch();
    stubby.cabin.back = 0.5;
    stubby.cabin.rakeF = 0.1;
    stubby.cabin.rakeR = 0.1;
    expect(profileVsCar(stubby, [3.8, 1.5, 1.8]).some((e) => e.includes('too short a roof'))).toBe(true);
    const forward = hatch();
    forward.cabin.front = 0.82;
    expect(profileVsCar(forward, [3.8, 1.5, 1.8]).some((e) => e.includes('behind the front axle'))).toBe(true);
    const low = hatch();
    low.panel[4].v = 0.32;
    low.panel[3].v = 0.34;
    expect(profileVsCar(low, [3.8, 1.5, 1.8]).some((e) => e.includes('front arch breaks through'))).toBe(true);
  });

  it('leaves room for the windows and the driver', () => {
    const slit = hatch();
    slit.cabin.belt = 0.76;
    expect(profileVsCar(slit, [3.8, 1.5, 1.8]).some((e) => e.includes('glass needs'))).toBe(true);
    const low = hatch();
    low.cabin.height = 0.85;
    expect(profileVsCar(low, [3.8, 1.2, 1.8]).some((e) => e.includes('too low to seat'))).toBe(true);
  });

  it('keeps a pickup bed a bed', () => {
    const shallow = pickup();
    shallow.bed!.floor = 0.2;
    expect(profileVsCar(shallow, [4.8, 1.8, 1.95]).some((e) => e.includes('above the sill'))).toBe(true);
    const flat = pickup();
    flat.bed!.floor = 0.48;
    expect(profileVsCar(flat, [4.8, 1.8, 1.95]).some((e) => e.includes('needs walls'))).toBe(true);
  });
});
