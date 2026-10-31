// A light version of a skin for putting in the game: the surface kept, the triangles it doesn't need gone. Edge collapse by
// quadric error (Garland and Heckbert, 1997): each vertex remembers the planes of its triangles, and the edge that moves
// the surface least is folded away, again and again. Flat walls cost nothing, so they go first; curves cost more, so they
// stay. Colour is the catch, as quadrics only see shape, so a window on a flat wall would melt away: a vertex on the edge
// of a colour can only slide along that edge while it runs fairly straight, and a corner can't move, so a window keeps its
// shape. A collapse that would fold a triangle over, or pinch the surface (the link condition), is refused.
export type Mesh = { points: Float32Array | number[]; tris: number[]; hues: number[] }; // tris: three vertex indices each; hues: a colour for each triangle
export type Wrapped = { points: number[]; tris: number[]; hues: number[] };

const STRAIGHT = 0.82; // cos 35°: how sharply a colour's edge may bend at a point and still count as running on through it
type Quadric = Float64Array; // the ten unique terms of a symmetric 4x4
const quadricOf = (a: number, b: number, c: number, d: number, w: number): Quadric => Float64Array.of(a * a * w, a * b * w, a * c * w, a * d * w, b * b * w, b * c * w, b * d * w, c * c * w, c * d * w, d * d * w);
const addTo = (q: Quadric, r: Quadric) => { for (let i = 0; i < 10; i++) q[i] += r[i]; };
const errorAt = (q: Quadric, x: number, y: number, z: number) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];

/** A plain binary heap: stale entries are dropped when they come up. */
class Heap {
  private items: { cost: number; from: number; to: number; stamp: number }[] = [];
  get size() { return this.items.length; }
  push(e: { cost: number; from: number; to: number; stamp: number }) {
    const h = this.items;
    h.push(e);
    for (let i = h.length - 1; i > 0;) { const p = (i - 1) >> 1; if (h[p].cost <= h[i].cost) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  }
  pop() {
    const h = this.items, top = h[0], last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l].cost < h[m].cost) m = l; if (r < h.length && h[r].cost < h[m].cost) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; }
    }
    return top;
  }
}

/** Collapses `m` until it's within `budget` triangles, or until the next collapse would move the surface further than `maxError`. */
export function simplify(m: Mesh, budget: number, maxError = Infinity): Wrapped {
  const n = m.points.length / 3, p = Float64Array.from(m.points), tris = Int32Array.from(m.tris), count = tris.length / 3;
  const alive = new Uint8Array(count).fill(1), around: Set<number>[] = Array.from({ length: n }, () => new Set()), q: Quadric[] = Array.from({ length: n }, () => new Float64Array(10));
  const stamps = new Int32Array(n);
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
    for (const v of [a, b, c]) around[v].add(t);
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (!l) continue;
    const d = -(nx * p[a * 3] + ny * p[a * 3 + 1] + nz * p[a * 3 + 2]) / l, plane = quadricOf(nx / l, ny / l, nz / l, d, l / 2);
    for (const v of [a, b, c]) addTo(q[v], plane);
  }
  const huesAt = (v: number) => new Set([...around[v]].map((t) => m.hues[t]));
  const neighbours = (v: number) => { const s = new Set<number>(); for (const t of around[v]) for (let k = 0; k < 3; k++) if (tris[t * 3 + k] !== v) s.add(tris[t * 3 + k]); return s; };
  const shared = (a: number, b: number) => [...around[a]].filter((t) => around[b].has(t));

  /** Whether folding `from` onto `to` is safe. */
  function allowed(from: number, to: number) {
    const faces = shared(from, to);
    if (faces.length !== 2) return false; // an edge of an open surface, or a pinch
    const here = huesAt(from), there = huesAt(to);
    for (const h of here) if (!there.has(h)) return false; // a colour would lose ground
    if (here.size > 2) return false; // a corner where colours meet
    if (here.size === 2) { // on a colour's edge, it may only slide along that edge, and only where the edge runs straight on
      if (m.hues[faces[0]] === m.hues[faces[1]]) return false;
      const rims = [...neighbours(from)].filter((o) => { const f = shared(from, o); return f.length === 2 && m.hues[f[0]] !== m.hues[f[1]]; });
      if (rims.length !== 2 || !rims.includes(to)) return false;
      const other = rims[0] === to ? rims[1] : rims[0], ax = p[from * 3] - p[other * 3], ay = p[from * 3 + 1] - p[other * 3 + 1], az = p[from * 3 + 2] - p[other * 3 + 2], bx = p[to * 3] - p[from * 3], by = p[to * 3 + 1] - p[from * 3 + 1], bz = p[to * 3 + 2] - p[from * 3 + 2];
      if ((ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1) < STRAIGHT) return false;
    }
    const a = neighbours(from), b = neighbours(to);
    let common = 0;
    for (const v of a) if (b.has(v)) common++;
    if (common !== 2) return false; // the link condition: anything else pinches the surface
    for (const t of around[from]) { // no triangle may turn over
      if (faces.includes(t)) continue;
      const v = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]], i = v.indexOf(from), o1 = v[(i + 1) % 3], o2 = v[(i + 2) % 3];
      const ux = p[o1 * 3] - p[from * 3], uy = p[o1 * 3 + 1] - p[from * 3 + 1], uz = p[o1 * 3 + 2] - p[from * 3 + 2], vx = p[o2 * 3] - p[from * 3], vy = p[o2 * 3 + 1] - p[from * 3 + 1], vz = p[o2 * 3 + 2] - p[from * 3 + 2];
      const ax = p[o1 * 3] - p[to * 3], ay = p[o1 * 3 + 1] - p[to * 3 + 1], az = p[o1 * 3 + 2] - p[to * 3 + 2], bx = p[o2 * 3] - p[to * 3], by = p[o2 * 3 + 1] - p[to * 3 + 1], bz = p[o2 * 3 + 2] - p[to * 3 + 2];
      const n1x = uy * vz - uz * vy, n1y = uz * vx - ux * vz, n1z = ux * vy - uy * vx, n2x = ay * bz - az * by, n2y = az * bx - ax * bz, n2z = ax * by - ay * bx;
      if (n1x * n2x + n1y * n2y + n1z * n2z <= 0) return false;
    }
    return true;
  }

  const heap = new Heap();
  const offer = (from: number, to: number) => {
    const c = new Float64Array(q[from]);
    addTo(c, q[to]);
    heap.push({ cost: errorAt(c, p[to * 3], p[to * 3 + 1], p[to * 3 + 2]), from, to, stamp: stamps[from] + stamps[to] });
  };
  for (let v = 0; v < n; v++) for (const o of neighbours(v)) offer(v, o);

  let left = count;
  const gone = new Uint8Array(n);
  while (left > budget && heap.size) {
    const e = heap.pop();
    if (gone[e.from] || gone[e.to] || e.stamp !== stamps[e.from] + stamps[e.to]) continue;
    if (e.cost > maxError) break;
    if (!allowed(e.from, e.to)) continue;
    for (const t of [...around[e.from]]) {
      const has = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]].includes(e.to);
      if (has) { // this triangle folds away
        alive[t] = 0;
        left--;
        for (let k = 0; k < 3; k++) around[tris[t * 3 + k]].delete(t);
      } else {
        for (let k = 0; k < 3; k++) if (tris[t * 3 + k] === e.from) tris[t * 3 + k] = e.to;
        around[e.to].add(t);
      }
    }
    around[e.from].clear();
    gone[e.from] = 1;
    addTo(q[e.to], q[e.from]);
    stamps[e.to]++;
    for (const o of neighbours(e.to)) { stamps[o]++; }
    for (const o of neighbours(e.to)) { offer(e.to, o); offer(o, e.to); }
  }

  const keep = new Int32Array(n).fill(-1), points: number[] = [], out: number[] = [], hues: number[] = [];
  for (let t = 0; t < count; t++) {
    if (!alive[t]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k];
      if (keep[v] < 0) { keep[v] = points.length / 3; points.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]); }
      out.push(keep[v]);
    }
    hues.push(m.hues[t]);
  }
  return { points, tris: out, hues };
}
