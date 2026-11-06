// The town: a seeded road graph on a 3 km square, buildings between the roads, stations, home and place plots.
// Pure data, no rendering, so tests and headless runs use the same town the player sees.
export type Vec = { x: number; z: number };
export type RoadNode = Vec & { id: number };
export type Edge = { a: number; b: number; len: number };
import type { CrossingKind } from './crossings.ts';
import drawnFoot from '../data/drawnfoot.json' with { type: 'json' };
import { DISTRICTS, districtAt, onBuffer, type DistrictId } from './districts.ts';
import { SERVICE_RULES, type ServiceId } from '../../schemas/services.ts';

export type Box = { x: number; z: number; hx: number; hz: number; h: number; hue: number; district?: DistrictId; style?: string; front?: Vec; drawn?: string; turn?: number }; // style: a bench can pin one; front: unit vector to the street
export type DrawnFoot = { id: string; type: string; district?: DistrictId; kind?: string; service?: string; cx: number; cz: number; w: number; d: number; h: number };
export const DRAWN_FOOT = drawnFoot as unknown as DrawnFoot[]; // the buildings built from drawings, as the town needs to site them
// How many lots take each design. Spread out, so the same one doesn't turn up twice in a street.
export const DRAWN_COPIES: Record<DistrictId, number> = { oldtown: 8, business: 6, garden: 16, works: 6 };
const DRAWN_APART_M = 110, DRAWN_FILLS = 0.5, DRAWN_ASSEMBLY = 3; // how far apart two of a design stand, how much of a lot's front one must fill, and how many neighbouring lots a big one may take
export const FURNITURE_KINDS = ['bench', 'bin', 'planter', 'bollard', 'cycle_rack', 'bus_shelter', 'hedge', 'container', 'pallets', 'post_box', 'grit_bin'] as const;
// Post boxes: Ofcom holds Royal Mail to having 98% of people within half a mile (805 m) of one; a town keeps them much
// closer, so here one stands every POST_BOX_M along the busier streets, judged. Grit bins stand at some junctions, where
// councils put them for the slopes and corners people walk and drive in snow: the share is judged.
export const POST_BOX_REACH_M = 805, POST_BOX_M = 380, GRIT_SHARE = 0.18;
export type ParkedCar = Vec & { heading: number; colour: number; drive?: boolean };
export type Zebra = Vec & { edge: number; along: number; ux: number; uz: number; kind: CrossingKind }; // along: metres from the edge's node a; a pelican or puffin has signals
export type Leg = { edge: number; to: number };
export type BusStop = Vec & { leg: number; along: number; edge: number; to: number; route: number }; // along: metres into the leg, in the direction of travel; route: its index in town.routes
export type BusRoute = { legs: Leg[]; stops: BusStop[]; name: string; via: string }; // name: the number on the blind and the stop's flag; via: the words beside it
export type Service = Vec & { id: ServiceId; heading: number; road: Vec; edge: number; along: number; apron: number }; // along: metres from the edge's node a
export type Drive = Vec & { fx: number; fz: number; deep: number; wide: number; kerb: Vec }; // paving from the pavement to the house; f points at the street
export type Furniture = Vec & { kind: (typeof FURNITURE_KINDS)[number]; heading: number; len: number; tint?: number };
const BAY_M = 6.6, JUNCTION_CLEAR = 28; // a 6 m parallel bay with a little give, kept far enough off a junction that a car swinging out of the turn misses it
export const ZEBRA_OFF = 26; // metres from a junction to a crossing
export const ZIGZAG_M = 16; // no parking within the zig-zags (Highway Code rule 190); the length is about eight marks, from memory, as no source gave it
// Circular routes are numbered as Birmingham numbers its Outer and Inner Circles (the 11 and the 8): one number for the
// loop, with C for the buses going clockwise and A for anticlockwise, as seen on the map. No B, which could be read as
// "backwards".
const CIRCLES = [{ num: '1', via: 'Outer Circle' }, { num: '2', via: 'Inner Circle' }] as const;
const STOP_SPACING_M = 400, STOP_CLEAR_M = 22; // 400 m apart, the long-standing UK rule of thumb (Edinburgh and Surrey guidance); room for a 12 m bus to pull in and out, judged
const APRON_M = 12; // a forecourt deep enough to stand a fire engine on, clear of the pavement
const SERVICE_AT: Record<ServiceId, Vec> = { fire: { x: 1350, z: 1300 }, ambulance: { x: 1750, z: 1750 }, police: { x: 1480, z: 1560 } }; // near the middle, so a crew can reach most of town quickly
const DRIVE_WIDE = 3, DRIVE_SHARE = 0.65, DRIVE_CAR = 0.7, KERB_CLEAR = 4.5; // councils ask for 2.4-3 m wide and 4.8-5 m deep, which the 6 m front garden gives; the shares are judged
export type Plot = Vec & { node: number; road: Vec };
// The shopping centre (decided 2026-11-05): one building in the Business Quarter where a block of offices stood. ICSC
// Europe's shopping centre standard starts a small centre at 5,000 m2; two floors of 60 by 45 m give 5,400. Retail
// floors run taller than offices, about 5 m each, judged. In front, a surface car park of two rows of bays either side of
// an aisle: 2.4 by 4.8 m bays and a 6 m aisle for parking square to it, the usual UK sizes (from general knowledge of
// car park design guidance, not looked up this time).
export const CENTRE_STYLE = 'shopping_centre'; // its building style in buildingstyles.json, kept for it alone
export const CENTRE_W = 60, CENTRE_D = 45, CENTRE_H = 10, CENTRE_FLOORS = 2;
const BAY_W = 2.4, BAY_L = 4.8, AISLE_M = 6, CENTRE_PAVE_M = 3, CENTRE_WALK_M = 8, CENTRE_FULL = 0.6; // pavement kept, the path to the doors, and how many bays are taken: judged
const CENTRE_PARK_M = BAY_L * 2 + AISLE_M + 0.4;
export type Centre = { box: Box; plot: Plot; site: { x: number; z: number; hx: number; hz: number } };

export const SIZE = 3000;
export const ROAD_W = 12;
export const PLOT_SOLID = 7; // half the footprint of a place's building
const N = 11;

/** Where a new game opens: any place on the map, but not the district the last game started in, so each game feels new. */
export function dealStart(town: Town, roll: () => number, last = -1): number {
  const was = town.plots[last], other = town.plots.map((_, i) => i).filter((i) => !was || districtAt(town.plots[i].x, town.plots[i].z) !== districtAt(was.x, was.z));
  const from = other.length ? other : town.plots.map((_, i) => i);
  return from[Math.floor(roll() * from.length)];
}

export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof makeRng>;

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

export class Town {
  nodes: RoadNode[] = [];
  edges: Edge[] = [];
  adj: { to: number; edge: number }[][] = [];
  boxes: Box[] = [];
  drawnPlots = new Map<Plot, { id: string; x: number; z: number; turn: number }>(); // the plots that take a drawn building, set when the places are known
  trees: Vec[] = [];
  parked: ParkedCar[] = [];
  furniture: Furniture[] = [];
  zebras: Zebra[] = [];
  zebrasOn = new Map<number, Zebra[]>();
  signals = new Map<number, number>(); // junction -> its place in the signal plan, so neighbours don't all change together
  routes: BusRoute[] = [];
  stopsOn = new Map<number, BusStop[]>();
  drives: Drive[] = [];
  services: Service[] = [];
  home!: Plot;
  stations: Plot[] = [];
  plots: Plot[] = [];
  spots: Vec[] = []; // hiding places for finds, off the road but reachable
  centre: Centre | null = null;
  rough = -1; // the street taken up by today's roadworks or parade, or -1
  private cells = new Map<number, Box[]>();
  private kerb = new Map<number, Box[]>(); // where the parked cars started: they can be shoved, so they aren't walls, but layout still steers round them

  constructor(seed = 7, opts: { bare?: boolean } = {}) { // bare: no parked cars, street furniture, lights or zebras, for timing a clear road
    const rng = makeRng(seed);
    this.roads(rng);
    this.sites();
    this.scenery(rng);
    this.control(!opts.bare);
    if (!opts.bare) this.dress(makeRng(seed + 2));
    this.hide(makeRng(seed + 1)); // its own stream, so adding spots leaves the town's layout alone
    for (const p of this.plots) this.index({ x: p.x, z: p.z, hx: PLOT_SOLID, hz: PLOT_SOLID, h: 0, hue: 0 }); // the building drawn on a plot is solid
    const open = this.flood();
    this.spots = this.spots.filter((s) => open.has(this.gridKey(s.x, s.z)));
    if (!opts.bare) this.siteServices();
    if (!opts.bare) this.siteCentre(makeRng(seed + 4));
    if (!opts.bare) this.siteDrawn(makeRng(seed + 3));
  }

  /** The rectangle a building takes with its front edge held where it is, and the way that faces. */
  private frontage(frontAt: Vec, front: Vec, w: number, d: number) {
    const onX = Math.abs(front.x) >= Math.abs(front.z), sign = (onX ? front.x : front.z) >= 0 ? 1 : -1;
    return { x: frontAt.x - (onX ? sign * d / 2 : 0), z: frontAt.z - (onX ? 0 : sign * d / 2), hx: onX ? d / 2 : w / 2, hz: onX ? w / 2 : d / 2, turn: onX ? (sign * Math.PI) / 2 : sign > 0 ? 0 : Math.PI };
  }

  private overlapping(r: { x: number; z: number; hx: number; hz: number }) {
    return this.boxes.filter((o) => Math.abs(r.x - o.x) < r.hx + o.hx + 0.3 && Math.abs(r.z - o.z) < r.hz + o.hz + 0.3);
  }

  private standsClear(r: { x: number; z: number; hx: number; hz: number }) {
    for (const p of this.plots) if (Math.abs(r.x - p.x) < r.hx + PLOT_SOLID && Math.abs(r.z - p.z) < r.hz + PLOT_SOLID) return false;
    for (const s of this.services) if (Math.abs(r.x - s.x) < r.hx + 20 && Math.abs(r.z - s.z) < r.hz + 20) return false;
    return [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => !this.edges.some((e) => this.segDist({ x: r.x + a * r.hx, z: r.z + b * r.hz }, e) < ROAD_W / 2 + 1));
  }

  // Comes last and uses its own stream, so it moves nothing else: a lot's building is swapped for a drawn one of its district, whose front
  // keeps to the lot's front, and the solid shrinks or grows to fit. Parked cars and furniture were set against the lot, so they stay clear.
  private siteDrawn(rng: Rng) {
    const order = this.boxes.map((b) => ({ b, k: rng() })).sort((p, q) => p.k - q.k).map((p) => p.b), gone = new Set<Box>();
    for (const m of DRAWN_FOOT) {
      if (!m.district) continue;
      const taken: Box[] = [];
      for (const b of order) {
        if (taken.length >= DRAWN_COPIES[m.district]) break;
        if (gone.has(b) || b.district !== m.district || b.drawn || !b.front || b === this.centre?.box || taken.some((o) => dist(o, b) < DRAWN_APART_M)) continue;
        const onX = Math.abs(b.front.x) >= Math.abs(b.front.z), along = onX ? b.hz : b.hx, depth = onX ? b.hx : b.hz;
        if (m.w / 2 < along * DRAWN_FILLS) continue;
        const frontAt = { x: b.x + (onX ? Math.sign(b.front.x) * depth : 0), z: b.z + (onX ? 0 : Math.sign(b.front.z) * depth) }, r = this.frontage(frontAt, b.front, m.w, m.d);
        // A building too big for its lot takes in the lots beside it, as a developer would, up to DRAWN_ASSEMBLY of them.
        const others = this.overlapping(r).filter((o) => o !== b);
        if (others.includes(this.centre?.box as Box)) continue;
        if (others.length > DRAWN_ASSEMBLY || others.some((o) => o.district !== m.district || o.drawn) || !this.standsClear(r)) continue;
        if (others.length) {
          const inside = (v: Vec) => Math.abs(v.x - r.x) < r.hx + 1 && Math.abs(v.z - r.z) < r.hz + 1;
          if (this.spots.some(inside)) continue;
          for (const o of others) {
            gone.add(o);
            this.boxes.splice(this.boxes.indexOf(o), 1);
            for (const list of this.cells.values()) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); }
          }
          this.trees = this.trees.filter((v) => !inside(v));
          this.furniture = this.furniture.filter((v) => !inside(v));
          this.parked = this.parked.filter((v) => !inside(v));
        }
        b.x = r.x; b.z = r.z; b.hx = r.hx; b.hz = r.hz; b.h = m.h; b.drawn = m.id; b.turn = r.turn;
        this.index(b);
        taken.push(b);
      }
    }
  }

  // The places: each kind's drawn building takes every other plot of that kind. One that outgrows its plot grows back from the plot's
  // front, and only where that ground is clear; it then clears the trees and clutter on it, as a station does.
  fitPlaces(kindOf: (p: Plot) => string | undefined, held: Plot[]) {
    if (this.drawnPlots.size) return;
    const seen = new Map<string, number>();
    for (const p of this.plots) {
      const kind = kindOf(p), m = DRAWN_FOOT.find((f) => f.kind === kind);
      if (!m || !kind || held.includes(p)) continue;
      const n = seen.get(kind) ?? 0;
      seen.set(kind, n + 1);
      if (n % 2) continue;
      const len = dist(p, p.road) || 1, front = { x: (p.road.x - p.x) / len, z: (p.road.z - p.z) / len }, onX = Math.abs(front.x) >= Math.abs(front.z);
      const frontAt = { x: p.x + (onX ? Math.sign(front.x) * PLOT_SOLID : 0), z: p.z + (onX ? 0 : Math.sign(front.z) * PLOT_SOLID) };
      const r = this.frontage(frontAt, front, Math.max(m.w, 1), Math.max(m.d, 1));
      const fits = m.w <= PLOT_SOLID * 2 + 0.6 && m.d <= PLOT_SOLID * 2 + 0.6;
      if (!fits) {
        const others = this.plots.filter((q) => q !== p);
        const inside = (v: Vec) => Math.abs(v.x - r.x) < r.hx + 1 && Math.abs(v.z - r.z) < r.hz + 1;
        if (this.overlapping(r).length || others.some((q) => Math.abs(r.x - q.x) < r.hx + PLOT_SOLID && Math.abs(r.z - q.z) < r.hz + PLOT_SOLID)) continue;
        if (this.services.some((s) => dist(s, r) < Math.max(r.hx, r.hz) + 24) || this.spots.some(inside) || this.edges.some((e) => [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.segDist({ x: r.x + a * r.hx, z: r.z + b * r.hz }, e) < ROAD_W / 2 + 1))) continue;
        this.index({ x: r.x, z: r.z, hx: r.hx, hz: r.hz, h: 0, hue: 0 });
        const clear = (v: Vec) => !inside(v);
        this.trees = this.trees.filter(clear);
        this.furniture = this.furniture.filter(clear);
        this.parked = this.parked.filter(clear);
      }
      this.drawnPlots.set(p, { id: m.id, x: r.x, z: r.z, turn: r.turn });
    }
  }

  private gridKey = (x: number, z: number) => Math.round(x / 6) * 10000 + Math.round(z / 6);

  // Every 6 m cell a car can get to from home, so nothing is ever hidden behind a closed row of buildings.
  private flood(): Set<number> {
    const start = this.home.road, seen = new Set([this.gridKey(start.x, start.z)]), todo = [start];
    while (todo.length) {
      const { x, z } = todo.pop()!;
      for (const [a, b] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
        const nx = x + a, nz = z + b, k = this.gridKey(nx, nz);
        if (nx < 4 || nz < 4 || nx > SIZE - 4 || nz > SIZE - 4 || seen.has(k) || this.boxAt(nx, nz, 2) || this.kerbAt(nx, nz, 2)) continue;
        seen.add(k);
        todo.push({ x: nx, z: nz });
      }
    }
    return seen;
  }

  private roads(rng: Rng) {
    const at = (i: number, j: number) => i * N + j;
    const span = (SIZE - 2 * 150) / (N - 1);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const edgeI = i === 0 || i === N - 1, edgeJ = j === 0 || j === N - 1;
      const jitter = () => (rng() - 0.5) * 70;
      this.nodes.push({ id: at(i, j), x: 150 + i * span + (edgeI ? 0 : jitter()), z: 150 + j * span + (edgeJ ? 0 : jitter()) });
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const border = (k: number) => k === 0 || k === N - 1;
      // Dropping a few inner links gives longer blocks, so the grid does not read as graph paper.
      if (i < N - 1 && (border(j) || rng() > 0.14)) this.link(at(i, j), at(i + 1, j));
      if (j < N - 1 && (border(i) || rng() > 0.14)) this.link(at(i, j), at(i, j + 1));
    }
    this.connect();
    this.adj = this.nodes.map(() => []);
    this.edges.forEach((e, k) => { this.adj[e.a].push({ to: e.b, edge: k }); this.adj[e.b].push({ to: e.a, edge: k }); });
  }

  private link(a: number, b: number) {
    this.edges.push({ a, b, len: dist(this.nodes[a], this.nodes[b]) });
  }

  // The border ring always survives, but an inner node can lose every link; tie it to its nearest neighbour.
  private connect() {
    const seen = new Set([0]), stack = [0];
    const near = (n: number) => this.edges.filter((e) => e.a === n || e.b === n).map((e) => (e.a === n ? e.b : e.a));
    while (stack.length) for (const m of near(stack.pop()!)) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    for (const n of this.nodes) {
      if (seen.has(n.id)) continue;
      const best = [...seen].sort((p, q) => dist(this.nodes[p], n) - dist(this.nodes[q], n))[0];
      this.link(n.id, best);
      seen.add(n.id);
    }
  }

  // A plot sits on the verge of an edge's midpoint, set back from the road.
  private plotAt(edge: Edge, side: 1 | -1, setback = 26, t = 0.5): Plot {
    const a = this.nodes[edge.a], b = this.nodes[edge.b];
    const dx = (b.x - a.x) / edge.len, dz = (b.z - a.z) / edge.len;
    const road = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    return { x: road.x - dz * side * setback, z: road.z + dx * side * setback, node: edge.a, road };
  }

  private sites() {
    const nearest = (x: number, z: number) => this.edges.reduce((best, e) => {
      const m = { x: (this.nodes[e.a].x + this.nodes[e.b].x) / 2, z: (this.nodes[e.a].z + this.nodes[e.b].z) / 2 };
      return dist(m, { x, z }) < dist(this.mid(best), { x, z }) ? e : best;
    }, this.edges[0]);
    this.home = this.plotAt(nearest(SIZE / 2, SIZE / 2), 1, 30);
    const spots: [number, number][] = [[750, 750], [2250, 750], [750, 2250], [2250, 2250], [1500, 450], [1500, 2550]];
    this.stations = spots.map(([x, z]) => this.plotAt(nearest(x, z), -1, 24));
    const taken = [this.home, ...this.stations];
    this.edges.forEach((e, k) => {
      if (k % 2) return;
      const p = this.plotAt(e, k % 4 ? 1 : -1, 18, 0.5);
      if (e.len > 120 && taken.every((t) => dist(t, p) > 60)) this.plots.push(p);
    });
  }

  private mid(e: Edge): Vec {
    return { x: (this.nodes[e.a].x + this.nodes[e.b].x) / 2, z: (this.nodes[e.a].z + this.nodes[e.b].z) / 2 };
  }

  private scenery(rng: Rng) {
    const clear = [this.home, ...this.stations, ...this.plots];
    const onRoad = (x: number, z: number, m: number) => this.edges.some((e) => this.segDist({ x, z }, e) < m);
    const roadFree = (x: number, z: number, hx: number, hz: number) => [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => !onRoad(x + a * hx, z + b * hz, ROAD_W / 2 + 2.5));
    const lotFree = (x: number, z: number, hx: number, hz: number, gap: number) => {
      for (let cx = x - hx - gap; ; cx = Math.min(cx + 60, x + hx + gap)) {
        for (let cz = z - hz - gap; ; cz = Math.min(cz + 60, z + hz + gap)) {
          for (const o of this.cells.get(this.key(cx, cz)) ?? []) if (Math.abs(x - o.x) < hx + o.hx + gap && Math.abs(z - o.z) < hz + o.hz + gap) return false;
          if (cz >= z + hz + gap) break;
        }
        if (cx >= x + hx + gap) break;
      }
      return true;
    };
    // Buildings face the street: walk each side of each road and fill the frontage by the rules of the district it runs through.
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, alongX = Math.abs(ux) > Math.abs(uz);
      for (const side of [1, -1]) {
        let run = 0;
        for (let along = 20; along < e.len - 20;) {
          const here = { x: a.x + ux * along, z: a.z + uz * along }, district = districtAt(here.x - uz * side * 20, here.z + ux * side * 20), rules = DISTRICTS[district];
          const span = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
          const halfLong = span(rules.plot), depth = span(rules.depth);
          along += halfLong;
          const off = ROAD_W / 2 + rules.setback + depth;
          const x = a.x + ux * along - uz * side * off, z = a.z + uz * along + ux * side * off;
          const hx = alongX ? halfLong : depth, hz = alongX ? depth : halfLong, r = Math.max(hx, hz);
          run++;
          const alley = run % rules.alleyEvery === 0 ? 5 + rng() * 4 : 0;
          along += halfLong + span(rules.gap) + alley;
          const storeys = rules.storeys[0] + Math.floor(rng() * rng() * (rules.storeys[1] - rules.storeys[0] + 1));
          if (rng() < rules.skip || x < 20 || z < 20 || x > SIZE - 20 || z > SIZE - 20 || along > e.len - 12) continue;
          if (onBuffer(x, z) || clear.some((c) => dist(c, { x, z }) < r + 18)) continue;
          if (!roadFree(x, z, hx, hz) || !lotFree(x, z, hx, hz, 0.3)) continue;
          const box: Box = { x, z, hx, hz, h: storeys * 3.4, hue: rng(), district, front: { x: uz * side, z: -ux * side } };
          this.boxes.push(box);
          this.index(box);
        }
      }
    }
    for (let t = 0; t < 4000 && this.trees.length < 800; t++) {
      const x = 20 + rng() * (SIZE - 40), z = 20 + rng() * (SIZE - 40), keep = rng();
      if (!onBuffer(x, z) && keep > DISTRICTS[districtAt(x, z)].trees) continue;
      if (!onRoad(x, z, ROAD_W / 2 + 3) && !this.boxAt(x, z, 4) && clear.every((c) => dist(c, { x, z }) > 22)) this.trees.push({ x, z });
    }
    // The trees that frame a wide suburban street: a planted verge along each road through the gardens.
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      for (let along = 24; along < e.len - 24; along += 42) for (const side of [1, -1]) {
        const x = a.x + ux * along - uz * side * (ROAD_W / 2 + 5), z = a.z + uz * along + ux * side * (ROAD_W / 2 + 5);
        if (districtAt(x, z) === 'garden' && !this.boxAt(x, z, 3) && !onRoad(x, z, ROAD_W / 2 + 3) && clear.every((c) => dist(c, { x, z }) > 22)) this.trees.push({ x, z });
      }
    }
  }

  // The shopping centre, after the stations and before the drawn buildings, on its own stream: the Business Quarter road
  // nearest the district's middle with room on one side takes it, and the offices on that ground come down.
  private siteCentre(rng: Rng) {
    const mine = this.boxes.filter((b) => b.district === 'business');
    if (!mine.length) return;
    const middle = { x: mine.reduce((t, b) => t + b.x, 0) / mine.length, z: mine.reduce((t, b) => t + b.z, 0) / mine.length };
    const near = [this.home, ...this.stations];
    const tries = this.edges.map((e, k) => ({ e, k, d: dist(this.mid(e), middle) })).filter((t) => t.e.len > CENTRE_W + 50).sort((a, b) => a.d - b.d);
    for (const { e, k } of tries) for (const side of [1, -1] as const) {
      const a = this.nodes[e.a], b = this.nodes[e.b], ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, m = this.mid(e);
      const n = { x: -uz * side, z: ux * side }, front = { x: -n.x, z: -n.z }, onX = Math.abs(n.x) > Math.abs(n.z);
      const frontOff = ROAD_W / 2 + CENTRE_PAVE_M + CENTRE_PARK_M, frontAt = { x: m.x + n.x * frontOff, z: m.z + n.z * frontOff };
      const r = this.frontage(frontAt, front, CENTRE_W, CENTRE_D);
      const near0 = ROAD_W / 2 + CENTRE_PAVE_M, deep = frontOff + CENTRE_D - near0, mid0 = near0 + deep / 2;
      const site = { x: m.x + n.x * mid0, z: m.z + n.z * mid0, hx: onX ? deep / 2 : CENTRE_W / 2 + 2, hz: onX ? CENTRE_W / 2 + 2 : deep / 2 };
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([p, q]) => ({ x: site.x + p * site.hx, z: site.z + q * site.hz }));
      if (corners.some((c) => districtAt(c.x, c.z) !== 'business' || onBuffer(c.x, c.z))) continue;
      if (!this.standsClear(site) || near.some((t) => Math.abs(t.x - site.x) < site.hx + 30 && Math.abs(t.z - site.z) < site.hz + 30)) continue;
      const inside = (v: Vec, pad = 0) => Math.abs(v.x - site.x) < site.hx + pad && Math.abs(v.z - site.z) < site.hz + pad;
      if (this.spots.some((v) => inside(v, 1))) continue;
      for (const o of this.overlapping(site)) {
        this.boxes.splice(this.boxes.indexOf(o), 1);
        for (const list of this.cells.values()) { const i = list.indexOf(o); if (i >= 0) list.splice(i, 1); }
      }
      this.trees = this.trees.filter((v) => !inside(v, 2));
      this.furniture = this.furniture.filter((v) => !inside(v, 1));
      this.parked = this.parked.filter((v) => !inside(v, 1));
      const box: Box = { x: r.x, z: r.z, hx: r.hx, hz: r.hz, h: CENTRE_H, hue: 0.55, district: 'business', front, style: CENTRE_STYLE };
      this.boxes.push(box);
      this.index(box);
      // The car park: two rows of bays along the road, a gap left for the walk to the doors, cars nosed in square.
      const along = { x: ux, z: uz };
      for (const row of [near0 + BAY_L / 2 + 0.2, near0 + BAY_L * 1.5 + AISLE_M + 0.2]) {
        for (let t = -CENTRE_W / 2 + BAY_W / 2; t < CENTRE_W / 2; t += BAY_W) {
          if (Math.abs(t) < CENTRE_WALK_M / 2 || rng() > CENTRE_FULL) continue;
          this.parked.push({ x: m.x + n.x * row + along.x * t, z: m.z + n.z * row + along.z * t, heading: Math.atan2(n.x, n.z) + (rng() < 0.5 ? Math.PI : 0), colour: rng() });
        }
      }
      this.centre = { box, plot: { x: r.x, z: r.z, node: e.a, road: { x: m.x + n.x * (ROAD_W / 2 - 1), z: m.z + n.z * (ROAD_W / 2 - 1) } }, site };
      void k;
      return;
    }
  }

  /** The place at the heart of a district: where its name goes on the map, and where fast travel lands. */
  heart(id: DistrictId): Plot {
    const mine = this.boxes.filter((b) => b.district === id), n = mine.length || 1;
    const mid = { x: mine.reduce((s, b) => s + b.x, 0) / n, z: mine.reduce((s, b) => s + b.z, 0) / n };
    const inside = this.plots.filter((p) => districtAt(p.x, p.z) === id);
    return (inside.length ? inside : this.plots).reduce((a, b) => (dist(b, mid) < dist(a, mid) ? b : a));
  }

  // A site for each station, on open ground by a long road near where it's wanted. This comes last, so that it moves
  // nothing else in the town: it only clears the trees, furniture and parked cars on its own plot.
  private siteServices() {
    for (const id of ['fire', 'ambulance', 'police'] as const) {
      const r = SERVICE_RULES[id], reach = Math.max(r.hx, r.hz) + 2;
      let best: { d: number; at: Service; hx: number; hz: number } | null = null;
      for (const [k, e] of this.edges.entries()) {
        if (e.len < 150) continue;
        const a = this.nodes[e.a], b = this.nodes[e.b], ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, lengthways = Math.abs(ux) > Math.abs(uz);
        for (let along = 50; along < e.len - 50; along += 12) for (const side of [1, -1]) {
          const off = ROAD_W / 2 + 3 + APRON_M + r.hz, road = { x: a.x + ux * along, z: a.z + uz * along }, x = road.x - uz * side * off, z = road.z + ux * side * off, p = { x, z };
          const d = dist(p, SERVICE_AT[id]);
          if ((best && d >= best.d) || districtAt(x, z) === 'works' || onBuffer(x, z)) continue;
          if (this.boxAt(x, z, reach) || this.edges.some((o) => o !== e && this.segDist(p, o) < reach + ROAD_W / 2 + 3)) continue;
          if (this.spots.some((s) => dist(s, p) < reach + 6) || this.services.some((s) => dist(s, p) < 80) || this.plots.some((q) => dist(q.road, road) < 30) || this.zebras.some((q) => dist(q, road) < 30) || this.routes.some((q) => q.stops.some((s) => dist(s, road) < 30))) continue;
          best = { d, hx: lengthways ? r.hx : r.hz, hz: lengthways ? r.hz : r.hx, at: { id, x, z, heading: Math.atan2(road.x - x, road.z - z), road, edge: k, along, apron: APRON_M } }; // its front to the street
        }
      }
      if (!best) continue;
      const { at, hx, hz } = best;
      this.services.push(at);
      this.index({ x: at.x, z: at.z, hx, hz, h: 0, hue: 0 });
      const clear = (p: Vec) => dist(p, at) > reach + 2 && dist(p, at.road) > APRON_M + 8;
      this.trees = this.trees.filter(clear);
      this.furniture = this.furniture.filter(clear);
      this.parked = this.parked.filter(clear);
    }
  }

  // How the roads are run. Signals go on the crossroads of the two busy districts, and zebras on the roads between them,
  // never right next to a signal, where a queue would stand on the stripes. Then bus routes, and their stops.
  private control(ruled: boolean) {
    if (ruled) this.nodes.forEach((n, i) => {
      const zone = districtAt(n.x, n.z);
      if (this.adj[i].length >= 4 && (zone === 'oldtown' || zone === 'business')) this.signals.set(i, this.signals.size * 0.37 % 1);
    });
    if (ruled) this.edges.forEach((e, k) => {
      if (e.len < 100) return;
      const a = this.nodes[e.a], b = this.nodes[e.b], ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      for (const [along, end] of [[ZEBRA_OFF, e.a], [e.len - ZEBRA_OFF, e.b]]) {
        const p = { x: a.x + ux * along, z: a.z + uz * along }, zone = districtAt(p.x, p.z);
        if ((zone !== 'oldtown' && zone !== 'business') || this.signals.has(end)) continue;
        // Old Town keeps old pelicans, the Business Quarter has puffins, and every other crossing in each is a zebra: a
        // judged mix for a town of this age (see crossings.ts).
        const kind: CrossingKind = this.zebras.length % 2 === 0 ? 'zebra' : zone === 'oldtown' ? 'pelican' : 'puffin';
        const z = { ...p, edge: k, along, ux, uz, kind };
        this.zebras.push(z);
        this.zebrasOn.set(k, [...(this.zebrasOn.get(k) ?? []), z]);
      }
    });
    const ring = (lo: number, hi: number) => this.loop([lo * N + lo, hi * N + lo, hi * N + hi, lo * N + hi]);
    [ring(2, 8), ring(4, 6)].forEach((legs, i) => {
      for (const way of [legs, this.backwards(legs)]) {
        const name = CIRCLES[i].num + (this.clockwise(way) ? 'C' : 'A');
        this.routes.push({ legs: way, stops: this.findStops(way, this.routes.length), name, via: CIRCLES[i].via });
      }
    });
    for (const r of this.routes) for (const s of r.stops) this.stopsOn.set(s.edge, [...(this.stopsOn.get(s.edge) ?? []), s]);
  }

  /** A closed loop through these junctions, by the shortest roads, avoiding roads it has already used. */
  private loop(via: number[]): Leg[] {
    const legs: Leg[] = [], used = new Set<number>();
    via.forEach((from, i) => {
      const path = this.shortest(from, via[(i + 1) % via.length], used);
      for (const l of path) used.add(l.edge);
      legs.push(...path);
    });
    for (let i = 0; i < legs.length;) { // a road run out and straight back along is a spur, and a bus can't turn round in the street
      const j = (i + 1) % legs.length;
      if (legs.length > 2 && legs[i].edge === legs[j].edge) { legs.splice(Math.max(i, j), 1); legs.splice(Math.min(i, j), 1); i = Math.max(0, i - 1); } else i++;
    }
    return legs;
  }

  private shortest(from: number, to: number, used: Set<number>): Leg[] {
    const cost = this.nodes.map(() => Infinity), via: (Leg & { from: number })[] = [], done = new Set<number>();
    cost[from] = 0;
    for (;;) {
      let at = -1;
      for (let i = 0; i < cost.length; i++) if (!done.has(i) && cost[i] < Infinity && (at < 0 || cost[i] < cost[at])) at = i;
      if (at < 0 || at === to) break;
      done.add(at);
      for (const w of this.adj[at]) {
        const c = cost[at] + this.edges[w.edge].len * (used.has(w.edge) ? 6 : 1);
        if (c < cost[w.to]) { cost[w.to] = c; via[w.to] = { ...w, from: at }; }
      }
    }
    const path: Leg[] = [];
    for (let n = to; n !== from && via[n]; n = via[n].from) path.unshift({ edge: via[n].edge, to: n });
    return path;
  }

  /** The roads from a junction to either end of an edge, ending on that edge. */
  route(from: number, edge: number): Leg[] {
    const e = this.edges[edge], path = this.shortest(from, e.a, new Set());
    return path.at(-1)?.edge === edge ? path : [...path, { edge, to: e.b }];
  }

  /** Whether a loop runs clockwise on the map, where x runs right and z runs down the page. */
  private clockwise(legs: Leg[]): boolean {
    let twice = 0;
    legs.forEach((l, i) => { const a = this.nodes[l.to], b = this.nodes[legs[(i + 1) % legs.length].to]; twice += a.x * b.z - b.x * a.z; });
    return twice > 0; // the shoelace sum, positive for clockwise with the page's z axis pointing down
  }

  /** The routes calling at a stop, by name: any route with a stop on this spot. */
  routesAt(p: Vec): BusRoute[] {
    return this.routes.filter((r) => r.stops.some((s) => dist(s, p) < 6));
  }

  /** The same loop the other way round. */
  private backwards(legs: Leg[]): Leg[] {
    return legs.map((l) => ({ edge: l.edge, to: this.edges[l.edge].a === l.to ? this.edges[l.edge].b : this.edges[l.edge].a })).reverse();
  }

  private findStops(legs: Leg[], route: number): BusStop[] {
    const stops: BusStop[] = [];
    let since = STOP_SPACING_M / 2;
    legs.forEach((l, leg) => {
      const e = this.edges[l.edge], b = this.nodes[l.to], a = this.nodes[e.a === l.to ? e.b : e.a], dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len;
      for (let along = 45; along < e.len - 45; along += 15) {
        const p = { x: a.x + dx * along, z: a.z + dz * along };
        if (since + along < STOP_SPACING_M || this.zebras.some((z) => dist(z, p) < 40) || stops.some((s) => dist(s, p) < 80)) continue;
        stops.push({ x: p.x + dz * (ROAD_W / 2 + 1), z: p.z - dx * (ROAD_W / 2 + 1), leg, along, edge: l.edge, to: l.to, route });
        since = -along;
      }
      since += e.len;
    });
    return stops;
  }

  // Front drives on the Garden Suburb's houses: a paved bay to the side of the path, in the 6 m front garden, reached over
  // a dropped kerb. Its own stream, as a new drive shouldn't move anything else in the town.
  private driveways(rng: Rng) {
    const garden = DISTRICTS.garden.setback - 3; // the setback less the 3 m pavement
    for (const b of this.boxes) {
      const f = b.front;
      if (b.district !== 'garden' || !f || rng() > DRIVE_SHARE) continue;
      const wide = Math.abs(f.x) > Math.abs(f.z) ? b.hz : b.hx, deep = Math.abs(f.x) > Math.abs(f.z) ? b.hx : b.hz, s = rng() < 0.5 ? 1 : -1, off = wide - 1.2, across = { x: f.z * s, z: -f.x * s };
      const at = (out: number) => ({ x: b.x + f.x * out + across.x * off, z: b.z + f.z * out + across.z * off });
      const mid = at(deep + garden / 2), kerb = at(deep + DISTRICTS.garden.setback);
      if (this.trees.some((t) => dist(t, mid) < 4.2) || this.edges.some((e) => this.segDist(kerb, e) < ROAD_W / 2 - 0.5)) continue;
      this.drives.push({ ...mid, fx: f.x, fz: f.z, deep: garden, wide: DRIVE_WIDE, kerb });
      if (rng() < DRIVE_CAR) this.parked.push({ ...mid, heading: Math.atan2(f.x, f.z) + (rng() < 0.7 ? Math.PI : 0), colour: rng(), drive: true }); // most people drive straight in
    }
  }

  // What makes a street lived in. Parked cars take 6 m parallel bays (Surrey and Southend street guidance), half up on
  // the kerb as they so often are on British streets, which keeps the lane clear, and stay well back from a junction; furniture sits on the kerb side of the pavement, never in the walking line.
  private dress(rng: Rng) {
    const clear = [this.home, ...this.stations, ...this.plots].map((p) => ('road' in p ? p.road : p));
    this.driveways(makeRng(Math.floor(rng() * 1e9)));
    const stops = this.routes.flatMap((r) => r.stops), keepClear = (p: Vec) => this.zebras.some((z) => dist(z, p) < ZIGZAG_M + 2) || stops.some((s) => dist(s, p) < STOP_CLEAR_M) || this.drives.some((d) => dist(d.kerb, p) < KERB_CLEAR);
    this.edges.forEach((e) => {
      const a = this.nodes[e.a], b = this.nodes[e.b], ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len;
      const at = (along: number, off: number, side: number) => ({ x: a.x + ux * along - uz * side * off, z: a.z + uz * along + ux * side * off });
      const faceRoad = (side: number) => Math.atan2(uz * side, -ux * side); // furniture is built long across x with its front to +z: this sets it parallel to the kerb, looking at the road
      for (const side of [1, -1]) {
        for (let along = JUNCTION_CLEAR; along < e.len - JUNCTION_CLEAR; along += BAY_M) {
          const p = at(along, ROAD_W / 2 - 0.4, side), d = DISTRICTS[districtAt(p.x, p.z)];
          if (rng() > d.parked || clear.some((c) => dist(c, p) < 14) || keepClear(p)) continue;
          // UK kerbside parking faces the way of the traffic on that side, which keeps left.
          this.parked.push({ ...p, heading: Math.atan2(ux * -side, uz * -side), colour: rng() });
          const lengthways = Math.abs(ux) > Math.abs(uz); // solid at its true size, so a car in the lane passes clear of it
          this.index({ x: p.x, z: p.z, hx: lengthways ? 2.2 : 0.9, hz: lengthways ? 0.9 : 2.2, h: 0, hue: 0 }, this.kerb);
        }
        const near = (p: Vec) => !this.boxAt(p.x, p.z, 1.2) && !this.kerbAt(p.x, p.z, 1.2) && clear.every((c) => dist(c, p) > 8) && this.drives.every((d) => dist(d.kerb, p) > 3) && stops.every((s) => dist(s, p) > 4);
        for (let along = 20; along < e.len - 20; along += 14 + rng() * 12) {
          const p = at(along, ROAD_W / 2 + 0.55, side), id = districtAt(p.x, p.z);
          const kinds = id === 'oldtown' ? (['bench', 'bin', 'planter', 'bollard'] as const) : id === 'business' ? (['planter', 'bench', 'cycle_rack', 'bin'] as const) : id === 'garden' ? (['bin'] as const) : ([] as const);
          if (!kinds.length || rng() > (id === 'garden' ? 0.2 : 0.75) || !near(p)) continue;
          this.furniture.push({ kind: kinds[Math.floor(rng() * kinds.length)], ...p, heading: faceRoad(side), len: 1 });
        }
      }
    });
    this.postBoxes(makeRng(Math.floor(rng() * 1e9)));
    for (const r of this.routes) for (const s of r.stops) { // the shelter's back to the buildings, its seat looking at the road
      const l = r.legs[s.leg], e = this.edges[l.edge], b = this.nodes[l.to], a = this.nodes[e.a === l.to ? e.b : e.a];
      this.furniture.push({ kind: 'bus_shelter', x: s.x, z: s.z, heading: Math.atan2(-(b.z - a.z), b.x - a.x), len: 1 });
    }
    for (const b of this.boxes) {
      const f = b.front;
      if (!f) continue;
      const wide = Math.abs(f.x) > Math.abs(f.z) ? b.hz : b.hx, heading = Math.atan2(f.x, f.z), deep = Math.abs(f.x) > Math.abs(f.z) ? b.hx : b.hz;
      if (b.district === 'garden') {
        // A front garden: a low hedge on the pavement line, broken for the path to the door.
        const line = deep + DISTRICTS.garden.setback - 3.6, side = { x: f.z, z: -f.x };
        for (const s of [-1, 1]) {
          const end = this.drives.some((d) => dist(d, { x: b.x + f.x * (deep + 3) + side.x * s * (wide - 1.2), z: b.z + f.z * (deep + 3) + side.z * s * (wide - 1.2) }) < 0.5) ? wide - 2.9 : wide, len = end - 0.7, mid = 0.7 + len / 2; // a drive takes the outer end of the hedge
          if (len < 1) continue;
          const p = { x: b.x + f.x * line + side.x * s * mid, z: b.z + f.z * line + side.z * s * mid };
          this.furniture.push({ kind: 'hedge', ...p, heading, len });
        }
      }
      if (b.district === 'works') {
        // The yard: stores and containers stand beside the shed, loading kept to the side as the codes ask.
        const side = { x: f.z, z: -f.x }, s = rng() < 0.5 ? 1 : -1, reach = wide + 4.5;
        for (let i = 0; i < 2; i++) {
          if (rng() < 0.3) continue;
          const p = { x: b.x + side.x * s * reach + f.x * (i * 7 - 3), z: b.z + side.z * s * reach + f.z * (i * 7 - 3) };
          if (!this.boxAt(p.x, p.z, 3.4) && !this.edges.some((e) => this.segDist(p, e) < ROAD_W / 2 + 4)) this.furniture.push({ kind: rng() < 0.65 ? 'container' : 'pallets', ...p, heading: Math.atan2(side.x, side.z) + (rng() < 0.5 ? 0 : Math.PI), len: 1, tint: rng() }); // parked up square to the shed
        }
      }
    }
  }

  /** Pillar boxes along the kerb, spaced so nowhere in town is far from one, and grit bins at some junction corners. */
  private postBoxes(rng: Rng) {
    const clear = [this.home, ...this.stations, ...this.plots].map((p) => ('road' in p ? p.road : p)), stops = this.routes.flatMap((r) => r.stops);
    const free = (p: Vec) => !this.boxAt(p.x, p.z, 0.8) && !this.kerbAt(p.x, p.z, 0.8) && clear.every((c) => dist(c, p) > 6) && stops.every((s) => dist(s, p) > 5) && this.drives.every((d) => dist(d.kerb, p) > 3) && this.furniture.every((f) => dist(f, p) > 2);
    const placed: Vec[] = [];
    for (const e of [...this.edges].sort((a, b) => b.len - a.len)) {
      const a = this.nodes[e.a], b = this.nodes[e.b], ux = (b.x - a.x) / e.len, uz = (b.z - a.z) / e.len, side = rng() < 0.5 ? 1 : -1;
      for (let along = 30; along < e.len - 30; along += 12) {
        const p = { x: a.x + ux * along - uz * side * (ROAD_W / 2 + 0.6), z: a.z + uz * along + ux * side * (ROAD_W / 2 + 0.6) };
        if (placed.some((q) => dist(q, p) < POST_BOX_M) || !free(p)) continue;
        placed.push(p);
        this.furniture.push({ kind: 'post_box', ...p, heading: Math.atan2(uz * side, -ux * side), len: 1 });
      }
    }
    for (const n of this.nodes) {
      if (rng() > GRIT_SHARE || this.adj[this.nodes.indexOf(n)].length < 3) continue;
      const k = this.adj[this.nodes.indexOf(n)][0], o = this.nodes[k.to], d = dist(n, o) || 1, ux = (o.x - n.x) / d, uz = (o.z - n.z) / d;
      const p = { x: n.x + ux * 16 - uz * (ROAD_W / 2 + 1.4), z: n.z + uz * 16 + ux * (ROAD_W / 2 + 1.4) };
      if (free(p)) this.furniture.push({ kind: 'grit_bin', ...p, heading: Math.atan2(uz, -ux), len: 1 });
    }
  }

  // Away from the road and spread across the whole town.
  private hide(rng: Rng) {
    const clear = [this.home, ...this.stations, ...this.plots];
    for (let t = 0; t < 6000 && this.spots.length < 48; t++) {
      const p = { x: 40 + rng() * (SIZE - 80), z: 40 + rng() * (SIZE - 80) };
      const road = Math.min(...this.edges.map((e) => this.segDist(p, e)));
      if (road < 14 || road > 70 || this.boxAt(p.x, p.z, 5)) continue;
      if (clear.every((c) => dist(c, p) > 30) && this.spots.every((s) => dist(s, p) > 130)) this.spots.push(p);
    }
  }

  segDist(p: Vec, e: Edge): number {
    const a = this.nodes[e.a], b = this.nodes[e.b];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (e.len * e.len)));
    return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.z - (a.z + (b.z - a.z) * t));
  }

  private key = (x: number, z: number) => Math.floor(x / 60) * 1000 + Math.floor(z / 60);
  private index(b: Box, cells = this.cells) {
    for (let x = b.x - b.hx; x <= b.x + b.hx + 60; x += 60) for (let z = b.z - b.hz; z <= b.z + b.hz + 60; z += 60) {
      const k = this.key(x, z);
      if (!cells.has(k)) cells.set(k, []);
      if (!cells.get(k)!.includes(b)) cells.get(k)!.push(b);
    }
  }

  private kerbAt(x: number, z: number, r: number): boolean {
    return (this.kerb.get(this.key(x, z)) ?? []).some((b) => Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r);
  }

  /** The building a circle at (x, z) touches, if any. */
  boxAt(x: number, z: number, r: number): Box | null {
    for (const b of this.cells.get(this.key(x, z)) ?? []) if (Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r) return b;
    return null;
  }

  offRoad(p: Vec): boolean {
    return !this.edges.some((e) => Math.abs(p.x - (this.nodes[e.a].x + this.nodes[e.b].x) / 2) < e.len && this.segDist(p, e) < ROAD_W / 2 + 1);
  }

  nearestStation(p: Vec): Plot {
    return this.stations.reduce((b, s) => (dist(s, p) < dist(b, p) ? s : b));
  }

  roughAt(p: Vec): boolean {
    return this.rough >= 0 && this.segDist(p, this.edges[this.rough]) < ROAD_W / 2 + 1;
  }

  /** The closest point on any road, and the edge it lies on. */
  /** Which buildings stand where, in a few characters: a saved hole names a building by its index here, so a save from a
   *  town built differently (new places put different buildings on the plots) can tell its holes no longer fit. */
  get layoutKey(): string { return `${this.boxes.length}:${Math.round(this.boxes.reduce((s, b) => s + b.x * 3 + b.z, 0))}`; }

  snap(p: Vec): { point: Vec; edge: number } {
    let best = { d: Infinity, edge: 0, point: p };
    this.edges.forEach((e, k) => {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (e.len * e.len)));
      const point = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const d = dist(point, p);
      if (d < best.d) best = { d, edge: k, point };
    });
    return { point: best.point, edge: best.edge };
  }
}
