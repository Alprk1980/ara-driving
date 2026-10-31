/**
 * The car's skin. The sculpted voxels stay the source of the shape, but they're drawn as one smooth surface: naive
 * surface nets puts a vertex in each cube the surface crosses and joins them into quads, then a little smoothing rounds
 * the steps away. Because it's a real mesh it can bend: `foldSkin` is the crash model, pure so it can be tested.
 * Crumple zones crush like an accordion, shortening from the outside in, with the panels buckling as they fold.
 */
import type { Mark, Side } from '../sim/car.ts';

export type Skin = {
  points: Float32Array; // x, y, z of each vertex in metres, x and z from the middle of the car
  quads: Map<string, number[]>; // two triangles per quad, as indices, per colour
};

type Grid = { lo: [number, number, number]; hi: [number, number, number] };

const SMOOTH_PASSES = 3, SMOOTH_PULL = 0.55;
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** A smooth closed surface round the solid cells. `at` gives a cell's centre in metres. */
export function surfaceNet(grid: Grid, solid: (x: number, y: number, z: number) => boolean, color: (x: number, y: number, z: number) => string, at: (x: number, y: number, z: number) => [number, number, number], passes = SMOOTH_PASSES): Skin {
  const [x0, y0, z0] = grid.lo.map((v) => v - 1), nx = grid.hi[0] - grid.lo[0] + 3, ny = grid.hi[1] - grid.lo[1] + 3, nz = grid.hi[2] - grid.lo[2] + 3;
  const cell = (x: number, y: number, z: number) => (x - x0) + nx * ((y - y0) + ny * (z - z0));
  const full = new Uint8Array(nx * ny * nz);
  for (let z = z0 + 1; z < z0 + nz - 1; z++) for (let y = y0 + 1; y < y0 + ny - 1; y++) for (let x = x0 + 1; x < x0 + nx - 1; x++) if (solid(x, y, z)) full[cell(x, y, z)] = 1;

  // One vertex per mixed cube, a cube being the eight cells from (x, y, z) up: the average of where its edges cross.
  const vertex = new Int32Array(nx * ny * nz).fill(-1), pos: number[] = [];
  for (let z = z0; z < z0 + nz - 1; z++) for (let y = y0; y < y0 + ny - 1; y++) for (let x = x0; x < x0 + nx - 1; x++) {
    let mask = 0;
    for (let i = 0; i < 8; i++) if (full[cell(x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1))]) mask |= 1 << i;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
      sx += ((a & 1) + (b & 1)) / 2; sy += (((a >> 1) & 1) + ((b >> 1) & 1)) / 2; sz += (((a >> 2) & 1) + ((b >> 2) & 1)) / 2;
      n++;
    }
    vertex[cell(x, y, z)] = pos.length / 3;
    pos.push(x + sx / n, y + sy / n, z + sz / n);
  }

  // A quad for each face between a solid cell and an empty one, coloured by the solid cell.
  const quads = new Map<string, number[]>(), links = Array.from({ length: pos.length / 3 }, () => new Set<number>());
  const add = (hue: string, a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const list = quads.get(hue) ?? [];
    if (flip) list.push(a, c, b, a, d, c); else list.push(a, b, c, a, c, d);
    quads.set(hue, list);
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) { links[p].add(q); links[q].add(p); }
  };
  const v = (x: number, y: number, z: number) => vertex[cell(x, y, z)];
  for (let z = z0 + 1; z < z0 + nz - 1; z++) for (let y = y0 + 1; y < y0 + ny - 1; y++) for (let x = x0; x < x0 + nx - 1; x++) {
    const here = full[cell(x, y, z)], next = full[cell(x + 1, y, z)];
    if (here !== next) add(here ? color(x, y, z) : color(x + 1, y, z), v(x, y - 1, z - 1), v(x, y, z - 1), v(x, y, z), v(x, y - 1, z), !here);
  }
  for (let z = z0 + 1; z < z0 + nz - 1; z++) for (let y = y0; y < y0 + ny - 1; y++) for (let x = x0 + 1; x < x0 + nx - 1; x++) {
    const here = full[cell(x, y, z)], next = full[cell(x, y + 1, z)];
    if (here !== next) add(here ? color(x, y, z) : color(x, y + 1, z), v(x - 1, y, z - 1), v(x - 1, y, z), v(x, y, z), v(x, y, z - 1), !here);
  }
  for (let z = z0; z < z0 + nz - 1; z++) for (let y = y0 + 1; y < y0 + ny - 1; y++) for (let x = x0 + 1; x < x0 + nx - 1; x++) {
    const here = full[cell(x, y, z)], next = full[cell(x, y, z + 1)];
    if (here !== next) add(here ? color(x, y, z) : color(x, y, z + 1), v(x - 1, y - 1, z), v(x, y - 1, z), v(x, y, z), v(x - 1, y, z), !here);
  }

  // Round off the steps the grid leaves: each vertex drifts toward its neighbours' average.
  let cur = Float32Array.from(pos);
  for (let pass = 0; pass < passes; pass++) {
    const nxt = cur.slice();
    links.forEach((around, i) => {
      if (!around.size) return;
      let sx = 0, sy = 0, sz = 0;
      for (const j of around) { sx += cur[j * 3]; sy += cur[j * 3 + 1]; sz += cur[j * 3 + 2]; }
      for (const [k, s] of [[0, sx], [1, sy], [2, sz]] as const) nxt[i * 3 + k] += (s / around.size - cur[i * 3 + k]) * SMOOTH_PULL;
    });
    cur = nxt;
  }

  // A cube's corner cell sits half a voxel in from its centre, so a vertex's grid position maps onto cell centres directly.
  const o = at(0, 0, 0), e = at(1, 1, 1), step = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const points = new Float32Array(cur.length);
  for (let i = 0; i < cur.length; i += 3) for (let k = 0; k < 3; k++) points[i + k] = o[k] + cur[i + k] * step[k];
  return { points, quads };
}

/** Smooth vertex normals for a skin, from every quad touching each vertex. */
export function skinNormals(points: ArrayLike<number>, quads: Iterable<number[]>, out: Float32Array) {
  out.fill(0);
  const p = points;
  for (const list of quads) for (let i = 0; i < list.length; i += 3) {
    const a = list[i] * 3, b = list[i + 1] * 3, c = list[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { out[q] += nx; out[q + 1] += ny; out[q + 2] += nz; }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
}

const OUT: Record<Side, { axis: 0 | 2; sign: 1 | -1 }> = { front: { axis: 2, sign: 1 }, back: { axis: 2, sign: -1 }, left: { axis: 0, sign: 1 }, right: { axis: 0, sign: -1 } };
const SPREAD = { end: 0.62, side: 0.3 }; // how far a dent reaches across a face, as a share of the car's half width or length
const ZONE = 2.3; // metres of body that fold for each metre of crush
const BUCKLE = 0.3, RIPPLE = 7; // how far panels buckle out, as a share of the crush, and how tightly, in folds per metre

/** The crushed body: each mark shortens the car where it landed, folding the metal behind it, and the panels buckle as they go. Writes into `out`. */
export function foldSkin(base: ArrayLike<number>, out: Float32Array, marks: readonly Mark[], limits: Readonly<Record<Side, number>>, size: readonly [number, number, number]) {
  const [len, tall, wide] = size;
  for (let i = 0; i < out.length; i++) out[i] = base[i];
  for (const m of marks) {
    const { axis, sign } = OUT[m.side], end = axis === 2, across = end ? 0 : 2, half = (end ? wide : len) / 2, reach = end ? len / 2 : wide / 2, spread = half * (end ? SPREAD.end : SPREAD.side);
    const crush = m.depth * limits[m.side], from = (m.at || 0) * half * (m.side === 'front' || m.side === 'right' ? -1 : 1) * (end ? 1 : -1);
    for (let i = 0; i < out.length; i += 3) {
      const s = sign * out[i + axis], w = Math.exp(-(((out[i + across] - from) / spread) ** 2)), d = crush * w;
      if (d < 1e-4) continue;
      const zone = d * ZONE, start = reach - zone;
      if (s <= start) continue;
      const t = (s - start) / zone; // 0 where the fold starts, 1 at the outside
      const noise = Math.sin(out[i + across] * 5.3 + out[i + 1] * 4.1) * 0.5 + 0.5;
      out[i + axis] = sign * (start + (s - start) * (1 - 1 / ZONE) - d * 0.12 * t * noise);
      const wave = Math.sin(s * RIPPLE * Math.PI) * d * BUCKLE * t;
      const up = out[i + 1] / tall;
      out[i + 1] += wave * (up > 0.5 ? 1 : -0.4);
      out[i + across] += wave * 0.35 * Math.sign(out[i + across] - from);
    }
  }
}
