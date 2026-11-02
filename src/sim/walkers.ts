// People on the pavements. Only those near the player exist, as with traffic. Speeds come from pedestrian studies: about
// 1.2 m/s for design, 1.55 for young adults, 1.0-1.1 for older people. Town centres are busy and works estates nearly
// empty; the shares are judged, as the surveys found give no counts. Some cross at a zebra: they wait at the kerb, and
// step out once what's coming can stop, as the Highway Code asks (rules 19 and 195): drivers should give way to someone
// waiting, and must to someone on the stripes. At a signalled junction they wait for the green man. Some stop at a bus
// stop and queue for a bus, which takes them, and others get off it. This stays a friendly game on purpose: anyone in
// the car's way gets out of it, so a pedestrian is never hit.
import type { PlayerCar } from './car.ts';
import { districtAt, type DistrictId } from './districts.ts';
import { walkFor } from './signals.ts';
import { dist, ROAD_W, type BusStop, type Rng, type Town, type Vec, type Zebra } from './town.ts';

export const WALK_MPS: [number, number] = [1.05, 1.55];
const COUNT = 70, SPAWN_MIN = 45, SPAWN_MAX = 210, DESPAWN = 250;
const PAVEMENT = ROAD_W / 2 + 1.6; // the middle of the 3 m pavement
export const STRIDE_M = 0.75;
const NOTICE_M = 9, CLEAR_M = 1.9, STEP_ASIDE_M = 2.6, STEP_ASIDE_MPS = 4; // how far off they see a car coming, and how they get out of the way
const BUSY: Record<DistrictId, number> = { oldtown: 1, business: 0.8, garden: 0.25, works: 0.08 };
const CORNER_M = 15, QUEUE_SHARE = 0.3, QUEUE_MAX_S = 150, QUEUE_MAX = 6; // the share who want a bus is judged
const CROSS_SHARE = 0.4, CALM_MPS2 = 3, STOP_MARGIN_M = 7, KERB_WAIT_S = 12; // the share of people who want the far side is judged; after this long they stop waiting for a gap and just go, as traffic has stopped for them by now

type Near = { x: number; z: number; speed: number; heading: number };
export type Walker = { x: number; z: number; heading: number; speed: number; edge: number; to: number; along: number; side: 1 | -1; aside: number; phase: number; look: number; tall: number; zebra: Zebra | null; off: number; waited: number; onRoad: boolean; corner: number; over: boolean; queue: BusStop | null };

export class Walkers {
  people: Walker[] = [];
  private town: Town;
  private rng: Rng;
  private clock = 0;

  constructor(town: Town, rng: Rng, near: Vec) {
    this.town = town;
    this.rng = rng;
    for (let i = 0; i < COUNT; i++) {
      const w: Walker = { x: 0, z: 0, heading: 0, speed: 0, edge: 0, to: 0, along: 0, side: 1, aside: 0, phase: rng() * 6.28, look: rng(), tall: 0.92 + rng() * 0.16, zebra: null, off: 0, waited: 0, onRoad: false, corner: -1, over: false, queue: null };
      this.place(w, near);
      this.people.push(w);
    }
  }

  /** Someone is on these stripes or waiting at them, so a driver gives way. */
  busy(z: Zebra): boolean {
    return this.people.some((w) => w.zebra === z);
  }

  /** Someone is actually on the stripes, not just waiting at them. */
  onStripes(z: Zebra): boolean {
    return this.people.some((w) => w.zebra === z && w.onRoad);
  }

  /** A bus has pulled in: everyone queueing gets on, and a few get off who were somewhere else. Returns how many got on and off. */
  board(s: BusStop, player: Vec): number {
    const on = this.people.filter((w) => w.queue === s);
    for (const w of on) { w.queue = null; this.place(w, player); }
    const off = Math.floor(this.rng() * 3);
    const free = this.people.filter((w) => !w.zebra && !w.queue && !w.over && dist(w, player) > SPAWN_MAX).slice(0, off);
    for (const w of free) { // along the pavement, walking on from the stop
      w.edge = s.edge; w.to = s.to; w.side = 1; w.along = s.along + 2 + this.rng() * 3; w.aside = 0; w.corner = -1;
      this.pose(w);
    }
    return on.length + free.length;
  }

  /** Who's waiting here. */
  queued(s: BusStop): number { return this.people.filter((w) => w.queue === s).length; }

  private place(w: Walker, near: Vec) {
    const { edges, nodes } = this.town;
    let k = 0, spot = near;
    for (let t = 0; t < 60; t++) {
      k = Math.floor(this.rng() * edges.length);
      const e = edges[k], a = nodes[e.a], b = nodes[e.b], s = this.rng();
      spot = { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s };
      const d = dist(spot, near);
      if (d > SPAWN_MIN && d < SPAWN_MAX && this.rng() < BUSY[districtAt(spot.x, spot.z)]) break;
    }
    const e = edges[k];
    w.edge = k;
    w.to = this.rng() < 0.5 ? e.a : e.b;
    const from = nodes[e.a === w.to ? e.b : e.a];
    w.along = Math.min(e.len - 1, dist(spot, from));
    w.side = this.rng() < 0.5 ? 1 : -1;
    w.speed = WALK_MPS[0] + this.rng() * (WALK_MPS[1] - WALK_MPS[0]);
    w.aside = 0;
    w.zebra = null;
    w.onRoad = false;
    w.queue = null;
    w.over = false;
    w.corner = -1;
    this.pose(w);
  }

  private pose(w: Walker) {
    const e = this.town.edges[w.edge], b = this.town.nodes[w.to], a = this.town.nodes[e.a === w.to ? e.b : e.a];
    const dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len, off = w.zebra ? w.off : (PAVEMENT + w.aside) * w.side;
    w.x = a.x + dx * w.along + dz * off;
    w.z = a.z + dz * w.along - dx * off;
    w.heading = w.onRoad ? Math.atan2(-dz * w.side, dx * w.side) : Math.atan2(dx, dz);
  }

  /** Off the far side of a junction, onto the road that carries straight on. */
  private turnOver(w: Walker) {
    const e = this.town.edges[w.edge], n = this.town.nodes[w.to], o = this.town.nodes[e.a === w.to ? e.b : e.a], dx = (n.x - o.x) / e.len, dz = (n.z - o.z) / e.len;
    const ways = this.town.adj[w.to].filter((a) => a.edge !== w.edge);
    const ahead = (a: { to: number; edge: number }) => { const t = this.town.nodes[a.to], l = this.town.edges[a.edge].len; return ((t.x - n.x) * dx + (t.z - n.z) * dz) / l; };
    const next = ways.reduce((a, b) => (ahead(b) > ahead(a) ? b : a));
    w.edge = next.edge;
    w.to = next.to;
    w.along = CORNER_M;
    w.over = false;
    w.corner = -1;
  }

  /** Nothing coming that couldn't stop in the room left. */
  private safe(z: Zebra, cars: readonly Near[]) {
    return cars.every((c) => {
      const d = dist(c, z), v = Math.abs(c.speed);
      if (v < 0.5 || d > 60) return true;
      const toward = (z.x - c.x) * Math.sin(c.heading) + (z.z - c.z) * Math.cos(c.heading);
      return toward < 0 || d > (v * v) / (2 * CALM_MPS2) + STOP_MARGIN_M;
    });
  }

  /** Walking the stripes, or standing at the kerb until it's safe to. */
  private crossing(w: Walker, dt: number, cars: readonly Near[]) {
    if (!w.onRoad) {
      w.waited += dt;
      if (!this.safe(w.zebra!, cars) && w.waited < KERB_WAIT_S) return;
      w.onRoad = true;
    }
    w.off -= w.side * w.speed * dt; // from this kerb to the other
    w.phase += ((w.speed / STRIDE_M) * Math.PI) * dt;
    if (w.off * w.side < -PAVEMENT) {
      w.side = w.side === 1 ? -1 : 1;
      w.zebra = null;
      w.onRoad = false;
    }
  }

  step(dt: number, player: PlayerCar, traffic: readonly Near[] = []) {
    const eyes: Near[] = [...traffic, { x: player.x, z: player.z, speed: player.speed, heading: player.heading }];
    this.clock += dt;
    for (const w of this.people) {
      const d = dist(w, player);
      if (d > DESPAWN) { this.place(w, player); continue; }
      if (w.zebra) this.crossing(w, dt, eyes);
      else if (w.queue) { if ((w.waited += dt) > QUEUE_MAX_S) w.queue = null; } // given up, and walking instead
      else if (w.corner >= 0 && !w.over) { // at the kerb of a signalled junction
        if (walkFor(this.town, w.corner, this.clock)) w.over = true;
      } else {
        const coming = d < NOTICE_M && Math.abs(player.speed) > 0.8, want = coming ? STEP_ASIDE_M : 0;
        w.aside += Math.max(-STEP_ASIDE_MPS * dt, Math.min(STEP_ASIDE_MPS * dt, want - w.aside));
        const stopped = d < NOTICE_M * 0.6 && Math.abs(player.speed) > 0.8;
        const was = w.along;
        if (!stopped) {
          w.along += w.speed * dt;
          w.phase += ((w.speed / STRIDE_M) * Math.PI) * dt;
        }
        const e = this.town.edges[w.edge], forward = w.to === e.b;
        for (const z of this.town.zebrasOn.get(w.edge) ?? []) { // reached the stripes
          const at = forward ? z.along : e.len - z.along;
          if (was < at && w.along >= at && this.rng() < CROSS_SHARE) { w.zebra = z; w.along = at; w.off = (PAVEMENT - 1) * w.side; w.waited = 0; w.aside = 0; }
        }
        for (const s of this.town.stopsOn.get(w.edge) ?? []) { // reached a bus stop
          if (s.to === w.to && w.side === 1 && was < s.along && w.along >= s.along && this.rng() < QUEUE_SHARE && this.queued(s) < QUEUE_MAX) { w.queue = s; w.waited = 0; }
        }
        if (w.over) {
          if (w.along >= e.len + CORNER_M) this.turnOver(w); // straight over, and on down the next road
        } else if (this.town.signals.has(w.to) && w.along >= e.len - CORNER_M && w.along - w.speed * dt < e.len - CORNER_M) w.corner = w.to;
        else if (!w.zebra && w.along >= e.len) {
          const on = this.town.adj[w.to].filter((n) => n.edge !== w.edge), next = on.length ? on[Math.floor(this.rng() * on.length)] : { to: e.a === w.to ? e.b : e.a, edge: w.edge };
          w.edge = next.edge;
          w.to = next.to;
          w.along = 0.5;
        }
      }
      this.pose(w);
      const near = dist(w, player);
      if (near < CLEAR_M && near > 0) { // a car on the pavement: they're always quicker than it
        w.x = player.x + ((w.x - player.x) / near) * CLEAR_M;
        w.z = player.z + ((w.z - player.z) / near) * CLEAR_M;
      }
    }
  }
}
