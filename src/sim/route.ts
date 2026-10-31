// Routing and turn-by-turn: A* on the road graph, turned into a polyline with manoeuvres the voice reads out.
import { dist, type Town, type Vec } from './town.ts';

const ROUGH_DETOUR_M = 600; // worth this far out of the way to miss a dug-up street, but it can always be driven

export type ManoeuvreKind = 'left' | 'right' | 'uturn' | 'arrive';
export type Manoeuvre = { id: string; kind: ManoeuvreKind; at: number }; // at = metres along the route
export type Route = { points: Vec[]; cum: number[]; length: number; manoeuvres: Manoeuvre[] };

export function aStar(town: Town, from: number, to: number): number[] {
  const open = new Set([from]), came = new Map<number, number>();
  const g = new Map([[from, 0]]), h = (n: number) => dist(town.nodes[n], town.nodes[to]);
  const f = new Map([[from, h(from)]]);
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const n of open) if ((f.get(n) ?? Infinity) < best) { best = f.get(n)!; cur = n; }
    if (cur === to) {
      const path = [cur];
      while (came.has(path[0])) path.unshift(came.get(path[0])!);
      return path;
    }
    open.delete(cur);
    for (const { to: m, edge } of town.adj[cur]) {
      const score = g.get(cur)! + town.edges[edge].len + (edge === town.rough ? ROUGH_DETOUR_M : 0);
      if (score < (g.get(m) ?? Infinity)) { came.set(m, cur); g.set(m, score); f.set(m, score + h(m)); open.add(m); }
    }
  }
  return [];
}

export const signedAngle = (a: Vec, b: Vec) => {
  const deg = (Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) * 180) / Math.PI;
  return deg;
};

export function buildManoeuvres(points: Vec[], cum: number[]): Manoeuvre[] {
  const out: Manoeuvre[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const angle = signedAngle({ x: b.x - a.x, z: b.z - a.z }, { x: c.x - b.x, z: c.z - b.z });
    if (Math.abs(angle) < 30) continue; // a bend, not a turn
    // World z points south on screen, so a positive cross product is a right turn for the driver.
    const kind = Math.abs(angle) > 150 ? 'uturn' : angle > 0 ? 'right' : 'left';
    out.push({ id: `m${i}`, kind, at: cum[i] });
  }
  return [...out, { id: 'end', kind: 'arrive', at: cum.at(-1) ?? 0 }];
}

function polyline(points: Vec[]): Route {
  const clean = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1);
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + dist(clean[i - 1], clean[i]));
  return { points: clean, cum, length: cum.at(-1) ?? 0, manoeuvres: buildManoeuvres(clean, cum) };
}

/** Road route between two points, starting off towards `heading` when both directions are similar. */
export function route(town: Town, from: Vec, to: Vec, heading?: Vec): Route {
  const s = town.snap(from), t = town.snap(to);
  if (s.edge === t.edge) return polyline([s.point, t.point]);
  const se = town.edges[s.edge], te = town.edges[t.edge];
  let best: { cost: number; nodes: number[] } | null = null;
  for (const a of [se.a, se.b]) for (const b of [te.a, te.b]) {
    const nodes = aStar(town, a, b);
    if (!nodes.length) continue;
    let cost = dist(s.point, town.nodes[a]) + dist(town.nodes[b], t.point);
    for (let i = 1; i < nodes.length; i++) cost += dist(town.nodes[nodes[i - 1]], town.nodes[nodes[i]]);
    if (heading) {
      const n = town.nodes[a];
      if ((n.x - s.point.x) * heading.x + (n.z - s.point.z) * heading.z < 0) cost += 120; // a U-turn costs time
    }
    if (!best || cost < best.cost) best = { cost, nodes };
  }
  return polyline([s.point, ...(best?.nodes ?? []).map((n) => town.nodes[n]), t.point]);
}

/** One route through several stops in order, such as a time trial's remaining checkpoints. */
export function routeVia(town: Town, from: Vec, stops: Vec[], heading?: Vec): Route {
  const points: Vec[] = [];
  let at = from;
  for (const [i, stop] of stops.entries()) {
    points.push(...route(town, at, stop, i ? undefined : heading).points);
    at = stop;
  }
  return polyline(points);
}

/** Where the car is along a route: searches near the last position so a looping road cannot jump ahead. */
export function project(r: Route, p: Vec, near: number): { travelled: number; off: number } {
  let best = { travelled: near, off: Infinity };
  for (let i = 0; i < r.points.length - 1; i++) {
    if (r.cum[i + 1] < near - 60 || r.cum[i] > near + 200) continue;
    const a = r.points[i], b = r.points[i + 1], len = r.cum[i + 1] - r.cum[i];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)));
    const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    const d = dist(p, q);
    if (d < best.off) best = { travelled: r.cum[i] + t * len, off: d };
  }
  return best;
}

export function pointAt(r: Route, along: number): Vec {
  for (let i = 0; i < r.points.length - 1; i++) {
    if (along <= r.cum[i + 1]) {
      const t = (along - r.cum[i]) / (r.cum[i + 1] - r.cum[i]);
      const a = r.points[i], b = r.points[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return r.points.at(-1) ?? { x: 0, z: 0 };
}

export type Cue = { key: string; manoeuvre: Manoeuvre; stage: 'ahead' | 'now' | 'reached' };

/** Tracks one route and hands out each cue once. Cues trigger on time to reach the turn. */
export class Navigator {
  travelled = 0;
  off = 0;
  route: Route;
  private spoken = new Set<string>();
  constructor(r: Route) { this.route = r; }

  step(p: Vec, speedMps: number): Cue | null {
    const at = project(this.route, p, this.travelled);
    this.travelled = Math.max(this.travelled, at.travelled);
    this.off = at.off;
    const next = this.route.manoeuvres.find((m) => m.at > this.travelled - 1);
    if (!next) return null;
    const metres = next.at - this.travelled;
    const seconds = metres / Math.max(speedMps, 1);
    if (next.kind === 'arrive') return metres < 15 ? this.say(next, 'reached') : null;
    if (seconds < 3 || metres < 20) return this.say(next, 'now');
    if (seconds < 8 || metres < 60) return this.say(next, 'ahead');
    return null;
  }

  private say(manoeuvre: Manoeuvre, stage: Cue['stage']): Cue | null {
    const key = `${manoeuvre.id}:${stage}`;
    if (this.spoken.has(key)) return null;
    this.spoken.add(key);
    return { key, manoeuvre, stage };
  }

  next(): Manoeuvre | null {
    return this.route.manoeuvres.find((m) => m.at > this.travelled - 1) ?? null;
  }
}
