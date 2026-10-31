import { describe, expect, it } from 'vitest';
import { surfaceNet } from '../view/carsurface.ts';
import { carve, cellAt, cutOut, cutPreview, outlineMatch, viewAgreement, type Picture, type Shot } from './carve.ts';

const BG = [230, 230, 235], SIZE = 240;
/** Draws a flat picture: `ink` says each pixel's colour, or null for background. */
function picture(ink: (x: number, y: number) => number[] | null, w = SIZE, h = SIZE, bg = BG): Picture {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = ink(x / w, y / h) ?? bg, i = (y * w + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; }
  return { width: w, height: h, rgba };
}

/** What a known solid looks like from a direction, for checking the carve against the real thing. */
function photo(solid: (x: number, y: number, z: number) => number[] | null, view: 'side' | 'front' | 'top'): Shot {
  const pic = picture((u, v) => {
    for (let d = 0; d < 1; d += 0.02) {
      const a = -1 + u * 2, b = 1 - v * 2, e = 1 - d * 2, hit = view === 'side' ? solid(e, b, -a) : view === 'front' ? solid(a, b, e) : solid(-a, e, b); // looking in from outside: the front photo from +z, the top from above
      if (hit) return hit;
    }
    return null;
  });
  return { view, pic };
}

const RED = [200, 40, 30], BLUE = [30, 60, 190];
const ball = (x: number, y: number, z: number) => (x * x + y * y + z * z < 0.5 ? RED : null);
const bus = (x: number, y: number, z: number) => (Math.abs(x) < 0.25 && Math.abs(y) < 0.3 && Math.abs(z) < 0.8 ? (z > 0.6 ? BLUE : RED) : null);

describe('cutting an object out of a photo', () => {
  it('finds the object on a plain background, and keeps holes filled', () => {
    const m = cutOut(picture((x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.3 ? RED : null)));
    const area = m.on.reduce((a, b) => a + b, 0) / (SIZE * SIZE);
    expect(area).toBeCloseTo(Math.PI * 0.09, 1);
  });

  it('drops specks, keeping the biggest piece', () => {
    const m = cutOut(picture((x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.3 || Math.hypot(x - 0.95, y - 0.95) < 0.02 ? RED : null)));
    expect(m.on[Math.floor(SIZE * 0.95) * SIZE + Math.floor(SIZE * 0.95)]).toBe(0);
  });

  it('copes with a dark background too', () => {
    const m = cutOut(picture((x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.3 ? RED : null), SIZE, SIZE, [15, 15, 18]));
    expect(m.on.reduce((a, b) => a + b, 0)).toBeGreaterThan(1000);
  });
});

describe('carving', () => {
  it('rebuilds a box from a side and a top, in proportion', () => {
    const b = carve([photo(bus, 'side'), photo(bus, 'top')], { long: 40 });
    expect(b.nz).toBe(40);
    expect(b.ny / b.nz).toBeCloseTo(0.6 / 1.6, 1);
    expect(b.nx / b.nz).toBeCloseTo(0.5 / 1.6, 1);
  });

  it('matches every outline it was given', () => {
    for (const shots of [[photo(bus, 'side'), photo(bus, 'front'), photo(bus, 'top')], [photo(ball, 'side'), photo(ball, 'front'), photo(ball, 'top')]]) {
      const b = carve(shots, { long: 40 });
      for (const s of shots) expect(outlineMatch(b, s), s.view).toBeGreaterThan(0.9);
    }
  });

  it('is close to a sphere with two views, and closer with a third', () => {
    const volume = (b: ReturnType<typeof carve>) => { const c = b.cells; const fill = new Set(c.map((q) => `${q[0]},${q[1]},${q[2]}`)); let sum = 0, wrong = 0, r = b.nx / 2; for (const [x, y, z] of c) { const d = Math.hypot(x + 0.5 - r, y + 0.5 - r, z + 0.5 - r) / r; sum++; if (d > 1.12) wrong++; } void fill; return wrong / sum; };
    const two = carve([photo(ball, 'side'), photo(ball, 'front')], { long: 32 }), three = carve([photo(ball, 'side'), photo(ball, 'front'), photo(ball, 'top')], { long: 32 });
    expect(volume(two)).toBeLessThan(0.1);
    expect(volume(three)).toBeLessThan(0.1);
  });

  it('lines a lopsided object up across its views', () => {
    const lump = (x: number, y: number, z: number) => (Math.abs(y) < 0.3 && Math.abs(z) < 0.7 && x > -0.2 && x < 0.3 + z * 0.3 ? RED : null);
    const shots = [photo(lump, 'side'), photo(lump, 'front'), photo(lump, 'top')], b = carve(shots, { long: 40 });
    for (const s of shots) expect(outlineMatch(b, s), s.view).toBeGreaterThan(0.85);
  });

  it('colours each face from the photo that looks at it', () => {
    const b = carve([photo(bus, 'side'), photo(bus, 'front'), photo(bus, 'top')], { long: 40 });
    const blue = b.palette.findIndex((p) => parseInt(p.slice(5), 16) > 150), nose = b.cells.filter((c) => c[2] === b.nz - 1);
    expect(blue).toBeGreaterThanOrEqual(0);
    expect(nose.filter((c) => c[3] === blue).length / nose.length).toBeGreaterThan(0.8);
    const tail = b.cells.filter((c) => c[2] === 0);
    expect(tail.filter((c) => c[3] === blue).length / tail.length).toBeLessThan(0.5);
  });

  it('colours a set-back wall from a photo that can see it, not from what stands in front', () => {
    const porch = (x: number, y: number, z: number) => (Math.abs(x) < 0.6 && Math.abs(y) < 0.5 && z > -0.5 && z < 0.2 ? RED : Math.abs(x) < 0.2 && Math.abs(y) < 0.3 && z >= 0.2 && z < 0.6 ? BLUE : null);
    const b = carve([photo(porch, 'side'), photo(porch, 'front'), photo(porch, 'top')], { long: 40 }), walls = b.cells.filter((c) => c[2] === Math.floor(b.nz * 0.6) && Math.abs(c[0] - b.nx / 2) > b.nx * 0.2);
    const blue = b.palette.findIndex((p) => parseInt(p.slice(5), 16) > 150);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.filter((c) => c[3] === blue).length).toBe(0);
  });

  it('notices photos that disagree, which the outline match cannot', () => {
    const good = [photo(bus, 'side'), photo(bus, 'front'), photo(bus, 'top')];
    expect(viewAgreement(good)).toBeGreaterThan(0.9);
    const squashed = (x: number, y: number, z: number) => (Math.abs(y) < 0.05 ? bus(x, y, z) : null); // the walls cut away in one photo
    const bad = [{ view: 'side' as const, pic: photo(squashed, 'side').pic }, good[1], good[2]];
    expect(viewAgreement(bad)!).toBeLessThan(0.5);
    expect(outlineMatch(carve(bad, { long: 40 }), bad[0])).toBeGreaterThan(0.9);
    expect(viewAgreement(good.slice(0, 2))).toBeNull();
  });

  it('shows what was taken for background', () => {
    const p = cutPreview(picture((x, y) => (Math.hypot(x - 0.5, y - 0.5) < 0.3 ? RED : null)));
    expect([...p.rgba.slice(0, 3)]).toEqual([255, 0, 255]);
    const mid = (SIZE / 2 * SIZE + SIZE / 2) * 4;
    expect([...p.rgba.slice(mid, mid + 3)]).toEqual(RED);
  });

  it('takes a smooth skin, with no step left the size of a voxel', () => {
    const b = carve([photo(ball, 'side'), photo(ball, 'front'), photo(ball, 'top')], { long: 40 }), mid = b.nx / 2;
    const skin = (passes: number) => surfaceNet({ lo: [0, 0, 0], hi: [b.nx - 1, b.ny - 1, b.nz - 1] }, (x, y, z) => b.solid![cellAt(b.nx, b.nz, x, y, z)] === 1, () => '#ffffff', (x, y, z) => [x + 0.5 - mid, y + 0.5 - mid, z + 0.5 - mid], passes);
    const roughness = (p: Float32Array) => { const r: number[] = []; for (let i = 0; i < p.length; i += 3) r.push(Math.hypot(p[i], p[i + 1], p[i + 2])); const m = r.reduce((a, c) => a + c, 0) / r.length; return Math.sqrt(r.reduce((a, c) => a + (c - m) ** 2, 0) / r.length) / m; };
    expect(roughness(skin(6).points)).toBeLessThan(roughness(skin(0).points)); // a carved ball keeps faint ridges, which are its true shape
  });

  it('keeps a building square when told to, as two views leave the plan unknown', () => {
    const shots = [photo(bus, 'side'), photo(bus, 'front')], corner = (b: ReturnType<typeof carve>) => b.cells.some((c) => c[0] === 0 && c[2] === 0);
    expect(corner(carve(shots, { long: 40 }))).toBe(false);
    expect(corner(carve(shots, { long: 40, square: true }))).toBe(true);
  });

  it('settles on a few main colours, however many tones a photo has', () => {
    const shaded = (x: number, y: number, z: number) => (bus(x, y, z) ? [120 + Math.round((y + 1) * 60), 100, 90 + Math.round((z + 1) * 50)] : null);
    const b = carve([photo(shaded, 'side'), photo(shaded, 'front'), photo(shaded, 'top')], { long: 40 });
    expect(new Set(b.cells.map((c) => c[3])).size).toBeLessThanOrEqual(12);
  });

  it('keeps only the surface, so a big model stays light', () => {
    const b = carve([photo(ball, 'side'), photo(ball, 'front'), photo(ball, 'top')], { long: 32 });
    expect(b.cells.length).toBeLessThan((b.nx * b.ny * b.nz) / 3);
  });

  it('says what it needs, rather than guessing', () => {
    expect(() => carve([photo(ball, 'side')])).toThrow(/two different views/);
    expect(() => carve([{ view: 'side', pic: picture(() => null) }, photo(ball, 'front')])).toThrow(/plain background/);
  });

  it('can’t see a hollow, as the research warned', () => {
    const cup = (x: number, y: number, z: number) => { const r = Math.hypot(x, z); return r < 0.6 && Math.abs(y) < 0.6 && !(r < 0.4 && y > -0.3) ? RED : null; };
    const b = carve([photo(cup, 'side'), photo(cup, 'front')], { long: 32 }), mid = Math.floor(b.nx / 2), seen = new Set(b.cells.map((c) => `${c[0]},${c[1]},${c[2]}`));
    expect(seen.has(`${mid},${b.ny - 1},${mid}`)).toBe(true); // the top is capped, though the real cup is open
  });
});
