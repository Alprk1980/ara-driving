import { describe, expect, it } from 'vitest';
import profilesJson from '../data/carprofiles.json';
import type { CarBodyProfile } from '../../schemas/carprofiles.ts';
import { CARS } from '../sim/economy.ts';
import { RECLINE } from './drivingposition.ts';
import { carFittings, carVoxels, voxelPieces, voxelSolid, voxelsFor, shade, GLASS, HEAD, TAIL, ARCH } from './voxels.ts';

const hatch = (): CarBodyProfile => ({
  id: 'hatchback',
  sill: 0.3,
  wheels: { radius: 0.32, width: 0.2, front: 0.74, rear: 0.26, track: 0.82 },
  panel: [{ z: 0, v: 0.62 }, { z: 0.2, v: 0.66 }, { z: 0.5, v: 0.68 }, { z: 0.8, v: 0.64 }, { z: 1, v: 0.5 }],
  width: [{ z: 0, v: 0.86 }, { z: 0.5, v: 0.9 }, { z: 1, v: 0.82 }],
  cabin: { front: 0.78, back: 0.3, width: 0.72, height: 0.9, belt: 0.55, rakeF: 0.09, rakeR: 0.07 },
});

const pickup = (): CarBodyProfile => ({
  ...hatch(),
  id: 'pickup',
  sill: 0.38,
  wheels: { radius: 0.38, width: 0.24, front: 0.76, rear: 0.24, track: 0.84 },
  panel: [{ z: 0, v: 0.5 }, { z: 0.25, v: 0.5 }, { z: 0.5, v: 0.55 }, { z: 0.8, v: 0.6 }, { z: 1, v: 0.52 }],
  cabin: { front: 0.8, back: 0.55, width: 0.7, height: 0.92, belt: 0.6, rakeF: 0.08, rakeR: 0.03 },
  bed: { front: 0.5, floor: 0.4 },
});

const allCells = (m: ReturnType<typeof carVoxels>['body']) => [...m.byColor.values()].flat();

describe('voxel solid basics', () => {
  it('keeps only the shell and shrinks the count', () => {
    const five = voxelSolid(5, 5, 5, 0.1, '#808080');
    expect(five.count).toBe(5 ** 3 - 3 ** 3);
    expect(voxelSolid(1, 1, 1, 1, '#808080').count).toBe(1);
  });
  it('spaces voxels and shades one in five', () => {
    expect(voxelsFor(3.8, 0.15)).toBe(25);
    expect(shade('#ffffff', 0.5)).toBe('#808080');
  });
});

describe('the sculptor', () => {
  it('builds a hatchback body of a sane size', () => {
    const c = carVoxels(hatch(), [3.8, 1.5, 1.8], '#d0443c');
    expect(c.body.count).toBeGreaterThan(800);
    expect(c.body.count).toBeLessThan(15000);
    expect(c.body.byColor.size).toBeGreaterThan(1);
    expect(c.wheels.length).toBe(4);
    expect(c.wheels[0]!.model.count).toBeGreaterThan(20);
  });

  it('is left-right symmetric', () => {
    const cells = allCells(carVoxels(hatch(), [3.8, 1.5, 1.8], '#d0443c').body);
    const xs = cells.map((cell) => cell[0]);
    const flip = Math.min(...xs) + Math.max(...xs);
    const set = new Set(cells.map((cell) => `${cell[0]},${cell[1]},${cell[2]}`));
    for (const cell of cells) expect(set.has(`${flip - cell[0]},${cell[1]},${cell[2]}`)).toBe(true);
  });

  it('floats nothing under the sill and nothing above the panel line', () => {
    const p = hatch(), size = [3.8, 1.5, 1.8] as const;
    const c = carVoxels(p, size, '#d0443c');
    const ny = voxelsFor(size[1], c.body.size);
    for (const cell of allCells(c.body)) {
      expect((cell[1] / (ny - 1)) * size[1]).toBeGreaterThanOrEqual(p.sill - 1e-9);
    }
    const maxY = Math.max(...allCells(c.body).map((cell) => cell[1]));
    expect((maxY / (ny - 1)) * size[1]).toBeLessThanOrEqual(0.9 * size[1] + c.body.size); // roof fraction caps it
  });

  it('cuts wheel wells at the wheels and leaves the body whole between them', () => {
    const p = hatch(), size = [3.8, 1.5, 1.8] as const;
    const c = carVoxels(p, size, '#d0443c');
    const ny = voxelsFor(size[1], c.body.size), nz = voxelsFor(size[0], c.body.size), nx = voxelsFor(size[2], c.body.size);
    const z0 = -Math.floor((nz - 1) / 2), x0 = -Math.floor((nx - 1) / 2);
    const xC = Math.round(x0 + (nx - 1) / 2);
    const xWheel = Math.round(x0 + (nx - 1) * (0.5 + p.wheels.track / 2));
    const set = new Set(allCells(c.body).map((cell) => `${cell[0]},${cell[1]},${cell[2]}`));
    const y = Math.round((p.wheels.radius / size[1]) * (ny - 1));
    for (const az of [p.wheels.rear, p.wheels.front]) {
      const z = Math.round(az * (nz - 1)) + z0;
      expect(set.has(`${xWheel},${y},${z}`)).toBe(false); // room for the wheel
      expect(set.has(`${xC},${Math.ceil((p.sill / size[1]) * (ny - 1))},${z}`)).toBe(true); // the floor runs on under the middle
    }
  });
  it('hollows the pickup bed but keeps its walls', () => {
    const p = pickup(), size = [4.8, 1.8, 1.95] as const;
    const c = carVoxels(p, size, '#3c6fd0');
    const ny = voxelsFor(size[1], c.body.size), nz = voxelsFor(size[0], c.body.size);
    const nxW = voxelsFor(size[2], c.body.size);
    const z0 = -Math.floor((nz - 1) / 2), x0 = -Math.floor((nxW - 1) / 2);
    const xC = Math.round(x0 + (nxW - 1) / 2);
    const set = new Set(allCells(c.body).map((cell) => `${cell[0]},${cell[1]},${cell[2]}`));
    const zMidBed = Math.round(0.12 * (nz - 1)) + z0; // between the tail lamp and the rear wheel, centre height: the tray is air
    const yTray = Math.round((0.8 / size[1]) * (ny - 1)); // 0.8 m: above the 0.72 m floor, under the 0.9 m wall top
    expect(set.has(`${xC},${yTray},${zMidBed}`)).toBe(false);
    // the bed floor is there under the tray: the surface sits right at the floor line
    const yFloor = Math.round(p.bed!.floor * (ny - 1));
    expect(set.has(`${xC},${yFloor},${zMidBed}`)).toBe(true);
  });

  it('gives each wheel a tyre, a rim and a hub, all round', () => {
    const c = carVoxels(hatch(), [3.8, 1.5, 1.8], '#d0443c');
    const w = c.wheels[0]!.model;
    expect(w.count).toBeGreaterThan(40);
    const xs = [...w.byColor.values()].flat().map((cell) => cell[0]);
    const ys = [...w.byColor.values()].flat().map((cell) => cell[1]);
    const spanY = Math.max(...ys) - Math.min(...ys), wantY = Math.round((c.wheelRadius * 2) / w.size);
    expect(spanY).toBeGreaterThanOrEqual(wantY - 1);
    expect(spanY).toBeLessThanOrEqual(wantY + 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(Math.round(c.wheelWidth / w.size) + 1);
  });
});

describe('every shipped car', () => {
  const profiles = profilesJson as unknown as CarBodyProfile[];
  const shapes = CARS.map((car) => ({ car, p: profiles.find((x) => x.id === car.id)! }));
  const cellsOf = (m: ReturnType<typeof carVoxels>['body'], colors: string[]) => colors.flatMap((c) => [...(m.byColor.get(c) ?? []), ...(m.byColor.get(shade(c, 0.14)) ?? [])]);

  it('is one piece, with a roof and glass', () => {
    for (const { car, p } of shapes) {
      const { body } = carVoxels(p, car.size, '#d0443c');
      expect(voxelPieces(body), car.id).toBe(1);
      const ny = voxelsFor(car.size[1], body.size), top = Math.max(...allCells(body).map((c) => c[1]));
      expect((top / (ny - 1)) * car.size[1], `${car.id} roof`).toBeGreaterThan((p.cabin.height * car.size[1]) - body.size * 2);
      expect(cellsOf(body, [GLASS]).length, `${car.id} glass`).toBeGreaterThan(100);
      const roofCells = allCells(body).filter((c) => c[1] === top);
      expect(roofCells.length, `${car.id} roof panel`).toBeGreaterThan(40);
    }
  });

  it('puts lamps at the corners, not across the whole end', () => {
    for (const { car, p } of shapes) {
      const { body } = carVoxels(p, car.size, '#d0443c');
      for (const lamp of [HEAD, TAIL]) {
        const cells = cellsOf(body, [lamp]);
        expect(cells.length, `${car.id} ${lamp}`).toBeGreaterThan(4);
        const xs = cells.map((c) => c[0] - body.mid[0]);
        expect(Math.min(...xs.map(Math.abs)), `${car.id} ${lamp}`).toBeGreaterThan(3);
        expect(Math.min(...xs) < 0 && Math.max(...xs) > 0, `${car.id} ${lamp}`).toBe(true);
      }
    }
  });

  it('bolts its mirrors onto the cabin and seats the driver inside', () => {
    for (const { car, p } of shapes) {
      const { body } = carVoxels(p, car.size, '#d0443c');
      const f = carFittings(p, car.size), vs = body.size;
      const world = allCells(body).map(([x, y, z]) => [(x - body.mid[0]) * vs, (y + 0.5) * vs, (z - body.mid[1]) * vs] as const);
      for (const s of [-1, 1]) {
        const near = world.some(([x, y, z]) => Math.abs(x - s * f.mirror.x) < vs * 1.5 && Math.abs(y - f.mirror.y) < vs * 1.5 && Math.abs(z - f.mirror.z) < vs * 1.5);
        expect(near, `${car.id} mirror ${s}`).toBe(true);
      }
      expect(f.seat.y + 0.87 * Math.cos(RECLINE) * f.seat.scale, `${car.id} head`).toBeLessThan(f.roof); // leaning back in the seat
      expect(f.seat.scale, `${car.id} driver size`).toBeGreaterThan(0.6);
      expect(f.seat.scale, `${car.id} no giants`).toBeLessThanOrEqual(1);
      expect(f.pose.eye.y, `${car.id} eyes under the roof`).toBeLessThan(f.roof - 0.1);
      expect(f.pose.eye.y, `${car.id} eyes over the bonnet`).toBeGreaterThan(f.belt);
      expect(f.pose.eye.x, `${car.id} sits on the right`).toBeLessThan(0);
      expect(f.pose.wheel.z, `${car.id} wheel ahead of the eyes`).toBeGreaterThan(f.pose.eye.z + 0.4);
      expect(Math.abs(f.seat.x) + 0.23 * f.seat.scale, `${car.id} shoulders`).toBeLessThan((p.cabin.width * car.size[2]) / 2);
      expect(Math.abs(f.seat.z - f.cabZ), `${car.id} seat`).toBeLessThan(f.cabLen / 2);
    }
  });

  it('seats each wheel in its well, clear of the lower body', () => {
    for (const { car, p } of shapes) {
      const c = carVoxels(p, car.size, '#d0443c');
      expect(c.body.byColor.get(ARCH)?.length ?? 0, car.id).toBeGreaterThan(10);
      for (const w of c.wheels) {
        const cells = [...w.model.byColor.values()].flat();
        const span = Math.max(...cells.map((cell) => cell[1])) - Math.min(...cells.map((cell) => cell[1]));
        expect(Math.abs((Math.max(...cells.map((cell) => cell[1])) + Math.min(...cells.map((cell) => cell[1]))) / 2 - c.wheelHub), `${car.id} hub`).toBeLessThanOrEqual(0.5);
        expect(span * c.body.size, car.id).toBeGreaterThan(p.wheels.radius * 1.6);
      }
    }
  });
});

describe('the sculptor with a pattern', () => {
  it('hands paint metres from the middle of the car', () => {
    const zs: number[] = [];
    carVoxels(hatch(), [3.8, 1.5, 1.8], (_x, _y, z) => { zs.push(z); return '#d0443c'; });
    expect(Math.min(...zs)).toBeLessThan(-1.7);
    expect(Math.max(...zs)).toBeGreaterThan(1.7);
    expect(Math.max(...zs)).toBeLessThanOrEqual(1.9);
  });
});
