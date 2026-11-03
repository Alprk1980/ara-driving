// Town traffic: cars that keep to the left lane, take turns at junctions, queue, and pass a car left in their way, with
// buses on their routes and the emergency services among them. Drivers stop at red lights and give way at zebras, as the
// Highway Code says they must (rule 195) and as UK studies found 97% do at a full zebra; here they all do. A blue light
// behind makes them pull in and stop (rule 219). Only the cars near the player exist, so a car that drifts too far away is
// moved to a road closer by.
import { addCrush, crushLevel, sideOf, type PlayerCar, type Side } from './car.ts';
import townCars from '../data/towncars.json' with { type: 'json' };
import fleet from '../data/fleet.json' with { type: 'json' };
import { FLEET_RULES, type FleetId, type Role } from '../../schemas/fleet.ts';
import { carsOverlap, type CarBox } from './collide.ts';
import { KERB_KG } from './economy.ts';
import type { KerbCar, ParkedCars } from './parked.ts';
import { signalFor, STOP_LINE_M } from './signals.ts';
import type { CrossingLight } from './crossings.ts';
import { dist, ROAD_W, type BusRoute, type BusStop, type Leg, type Rng, type Town, type Vec, type Zebra } from './town.ts';

const COUNT = 16;
const SPAWN_MIN = 220, SPAWN_MAX = 380, DESPAWN = 460;
const LANE = 3, PASS_LANE = -2;
const THINK_STEPS = 6; // the look-ahead is the costly part and does not need 60 Hz
const CAR_R = 1.15, SIDE_GAP = 2.4;
const QUEUE_GAP_M = 2.5; // bumper to bumper in a queue: the two-second rule shrinks to about this at a standstill
const SIGNAL_M = 35; // drivers indicate this far from a turn
const SLIDE_MPS2 = 7; // tyres skidding on dry tarmac, a friction of about 0.7
const WRECK_AT = 0.45, WRECK_S = 150; // this bent and a car can't drive on: it sits with its hazards on until the crews have been, or this long at most
const JUNCTION_M = 16, CLEAR_M = 14, TURN_MPS = 6.5, GIVE_UP_S = 4, PASS_AFTER_S = 3, PASS_HOLD_S = 3;
export const TRAFFIC_LENGTH = 4.1;
const CALM_MPS2 = 3, ZEBRA_STOP_M = 2.5, SIGNAL_LOOK_M = 45; // a driver's calm stop is about 3 m/s²
// Most stops are request stops: a bus pulls in only for someone waiting, who holds out an arm, or for someone aboard,
// who rings the bell once before their stop (operators' guides, such as East Yorkshire's and Reliance's). How often a
// passenger wants a given stop is judged.
const ALIGHT_ODDS = 0.5;
const STOP_BLOCKED_S = 2; // held this long short of the stop, it lets people on and off where it is; judged, and under PASS_AFTER_S, which restarts the wait
export const HAIL_M = 4; // close enough to the stop's pole for the driver to see you waiting
const DOORS_S = 7, PER_PERSON_S = 3.5, STOP_LANE = 4.4, STOP_LOOK_M = 34, AT_STOP_M = 1.5; // doors and pulling away, plus 3-5 s for each contactless tap: TfL's average dwell is 10.5-14.5 s. The lane puts a bus's flank at the kerb
const CREEP_MPS = 2.5, BLUE_MPS = 16, BLUE_LANE = 0, BLUE_DODGE = 1.8, BLUE_GAP = 2.15, PULL_IN_MPS = 3, YIELD_LANE = 3.6, GIVE_WAY_M = 70, GIVE_WAY_SIDE_M = 9, RED_CROSS_MPS = 5, BLUE_PASS_S = 1, ON_SCENE_M = 11; // UK blue-light drivers may treat a red as a give way, so they slow and cross; about 58 km/h in town, judged
const BLOCK_MPS = 2, STATION_RANGE_M = 800, HOME_M = 18, CHASE_MPS = 24, REPLAN_S = 3, TAIL_M = 14; // a crew comes from its own station if that's near enough; a pursuit runs at about 55 mph in town, judged
const SCENE_S = 25, CALLOUT_S: [number, number] = [100, 220], HEAVY_WRECK = 0.7, HEAVY_KG = 3000; // real attendance is 8-9 minutes (NHS and Home Office figures): this town has seconds, on purpose, so you see them come
const CAR_KG = KERB_KG, CROSS_M = 450; // a callout's run, past the player
const BUSES: FleetId[] = ['bus_double', 'bus_single', 'bus_double', 'bus_single'], CREWS: FleetId[] = ['police_car', 'police_van', 'ambulance', 'fire_engine', 'recovery_truck'];
const GONE_M = 150, LOAD_S = 12, BED_M = 1.15, RECOVERY_MPS = 12, COLLECT_EVERY_S = 8, WINCH_RATE = 1.5; // a car comes up the bed in a dozen seconds, judged, as no figure turned up; a real recovery takes 40-60 minutes to arrive, and here a minute or two, on purpose

type Rider = { x: number; z: number; heading: number; lift: number; riding: boolean };
type Job = { at: Vec; wreck: TrafficCar | null; kerb?: KerbCar; player?: boolean };

export type TrafficCar = {
  x: number; z: number; heading: number; speed: number; cruise: number; want: number; colour: number;
  edge: number; to: number; along: number; nextEdge: number; nextTo: number;
  lane: number; laneGoal: number; waiting: number; passing: number; holding: number; cool: number; braking: boolean;
  vx: number; vz: number; spin: number; // momentum from a hit: while it lasts the car slides instead of driving
  dents: Record<Side, number>; damage: number; wreck: number; // how bent it is, as on the player's car, and the seconds left until a wreck is recovered
  halfL: number; halfW: number; // its body's true size, from the model it's drawn with
  signal: -1 | 0 | 1; // indicating: -1 left, 1 right
  role: Role | 'car'; fleet: FleetId | null; kg: number;
  plan: Leg[] | null; leg: number; route: number; // a bus's route, or a crew's way to a job
  dwell: number; served: number; // seconds left at a stop, and the last stop's index on the route
  callAt: number; calling: boolean; // the stop it last looked at, and whether someone aboard wants it
  blue: boolean; scene: number; job: Job | null; dormant: boolean; // dormant: an off-duty crew, off the map until called
  chase: boolean; replan: number; returning: boolean; // following the player; heading back to the station
  amber: boolean; load: Rider | null; loading: number; // a recovery truck's beacons, what's on its bed, and the seconds left winching it up
  riding: boolean; lift: number; // on a recovery truck's bed, and how high off the road
};

/** One town car model per traffic car, in turn, so the sim collides with what's drawn. */
const MODELS = (townCars as { body: number[][]; half: number }[]).map((m) => {
  const zs = m.body.map((p) => p[0]);
  return { halfL: (Math.max(...zs) - Math.min(...zs)) / 2, halfW: m.half };
});
export const modelFor = (i: number) => MODELS[i % MODELS.length];
const fleetModel = (id: FleetId) => {
  const m = (fleet as { id: string; body: number[][]; half: number }[]).find((v) => v.id === id)!, zs = m.body.map((p) => p[0]);
  return { halfL: (Math.max(...zs) - Math.min(...zs)) / 2, halfW: m.half };
};
const brakeFor = (gap: number) => (gap <= 0 ? 0 : Math.sqrt(2 * CALM_MPS2 * gap)); // the speed that still stops in this gap
const asBox = (p: PlayerCar): CarBox => ({ x: p.x, z: p.z, heading: p.heading, halfL: p.car.size[0] / 2, halfW: p.car.size[2] / 2 });

export class Traffic {
  cars: TrafficCar[] = [];
  private town: Town;
  private rng: Rng;
  private ticks = 0;
  lastCrash: { nx: number; nz: number; dv: number } | null = null; // the normal of this step's hit on the player, if any, and the change of speed it gave them
  clock = 0; // the signal plans run from this
  stuck = 0; // seconds the player has driven on, holding up a crew on blue lights
  private holding = false;
  walkers: { busy(z: Zebra): boolean; onStripes(z: Zebra): boolean; lights: ReadonlyMap<Zebra, CrossingLight>; board(s: BusStop, player: Vec): number; queued?(s: BusStop): number } | null = null;
  kerb: ParkedCars | null = null;
  private nextCall: number;
  private nextCollect = COLLECT_EVERY_S;
  private seen: Vec = { x: 0, z: 0 }; // where the player was, for putting a car back in play
  /** The player out of the car. Anyone in the road ahead gets a stop: Highway Code rule H2 asks drivers to give way to
   * people crossing, and this town never hits a pedestrian. */
  you: Vec | null = null;
  private inRoad: Vec | null = null;
  /** Where you're waiting at a stop, so the bus pulls in for you; and the bus you're riding, once you've rung the bell. */
  hailing: Vec | null = null;
  rider: { bus: TrafficCar; rang: boolean } | null = null;
  onRecovered: (() => void) | null = null; // the truck has the player's car
  private held = new Map<number, TrafficCar>(); // junction -> the car crossing it

  constructor(town: Town, rng: Rng, near: Vec) {
    this.town = town;
    this.rng = rng;
    for (let i = 0; i < COUNT; i++) {
      const c = this.blank(rng(), modelFor(i));
      this.place(c, near);
      this.cars.push(c);
    }
    BUSES.forEach((id, i) => {
      const c = this.blank(rng(), fleetModel(id), id);
      c.route = i % town.routes.length;
      this.placeBus(c, near);
      this.cars.push(c);
    });
    for (const id of CREWS) {
      const c = this.blank(rng(), fleetModel(id), id);
      if (id === 'police_car') this.place(c, near); else c.dormant = true; // one patrol car is always out; the rest wait for a call
      this.cars.push(c);
    }
    this.nextCall = CALLOUT_S[0] + rng() * (CALLOUT_S[1] - CALLOUT_S[0]);
  }

  private blank(colour: number, size: { halfL: number; halfW: number }, id: FleetId | null = null): TrafficCar {
    return { x: -1000, z: -1000, heading: 0, speed: 0, cruise: 0, want: 0, colour, edge: 0, to: 0, along: 0, nextEdge: 0, nextTo: 0, lane: LANE, laneGoal: LANE, waiting: 0, passing: 0, holding: -1, cool: 0, braking: false, vx: 0, vz: 0, spin: 0, dents: { front: 0, back: 0, left: 0, right: 0 }, damage: 0, wreck: 0, ...size, signal: 0, role: id ? FLEET_RULES[id].role : 'car', fleet: id, kg: id ? FLEET_RULES[id].kg : CAR_KG, plan: null, leg: 0, route: 0, dwell: 0, served: -1, callAt: -1, calling: false, blue: false, scene: 0, job: null, dormant: false, chase: false, replan: 0, returning: false, amber: false, load: null, loading: 0, riding: false, lift: 0 };
  }

  /** Puts a bus on its route somewhere in the ring round the player, or at the nearest point of the route if none is. */
  private placeBus(c: TrafficCar, near: Vec) {
    const r: BusRoute = this.town.routes[c.route], legs = r.legs;
    const mid = (l: Leg) => { const e = this.town.edges[l.edge], a = this.town.nodes[e.a], b = this.town.nodes[e.b]; return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }; };
    const scored = legs.map((l, i) => ({ i, d: Math.abs(dist(mid(l), near) - (SPAWN_MIN + SPAWN_MAX) / 2) })).sort((a, b) => a.d - b.d);
    const leg = scored[Math.floor(this.rng() * Math.min(3, scored.length))].i;
    this.release(c);
    c.vx = c.vz = c.spin = 0;
    c.dents = { front: 0, back: 0, left: 0, right: 0 };
    c.damage = c.wreck = c.dwell = 0;
    c.served = c.callAt = -1;
    c.plan = legs;
    c.leg = (leg + legs.length - 1) % legs.length;
    c.edge = legs[leg].edge;
    c.to = legs[leg].to;
    c.along = this.town.edges[c.edge].len * (0.2 + this.rng() * 0.5);
    c.cruise = c.speed = c.want = 10 + this.rng() * 2;
    c.lane = c.laneGoal = LANE;
    c.waiting = c.passing = 0;
    this.pickNext(c);
    const p = this.lanePoint(c, c.along), q = this.lanePoint(c, c.along + 2);
    c.x = p.x;
    c.z = p.z;
    c.heading = Math.atan2(q.x - p.x, q.z - p.z);
  }

  private edgeEnds(edge: number, to: number) {
    const e = this.town.edges[edge], b = this.town.nodes[to], a = this.town.nodes[e.a === to ? e.b : e.a];
    return { a, b, len: e.len, dx: (b.x - a.x) / e.len, dz: (b.z - a.z) / e.len };
  }

  private pickNext(c: TrafficCar) {
    if (c.plan) {
      c.leg++;
      if (c.role === 'bus') c.leg %= c.plan.length;
      const w = c.plan[c.role === 'bus' ? (c.leg + 1) % c.plan.length : c.leg + 1];
      if (w) { c.nextEdge = w.edge; c.nextTo = w.to; return; }
      c.plan = null; // the end of a crew's way: from here it's any road
    }
    const onward = this.town.adj[c.to].filter((w) => w.edge !== c.edge), clear = onward.filter((w) => w.edge !== this.town.rough);
    const ways = clear.length ? clear : onward;
    const w = ways.length ? ways[Math.floor(this.rng() * ways.length)] : { to: this.town.edges[c.edge].a === c.to ? this.town.edges[c.edge].b : this.town.edges[c.edge].a, edge: c.edge };
    c.nextEdge = w.edge;
    c.nextTo = w.to;
  }

  private place(c: TrafficCar, near: Vec) {
    const { edges, nodes } = this.town;
    let k = Math.floor(this.rng() * edges.length);
    for (let t = 0; t < 40; t++) {
      const e = edges[k], d = dist({ x: (nodes[e.a].x + nodes[e.b].x) / 2, z: (nodes[e.a].z + nodes[e.b].z) / 2 }, near);
      if (d > SPAWN_MIN && d < SPAWN_MAX) break;
      k = Math.floor(this.rng() * edges.length);
    }
    this.release(c);
    c.vx = c.vz = c.spin = 0;
    c.dents = { front: 0, back: 0, left: 0, right: 0 };
    c.damage = c.wreck = 0;
    c.edge = k;
    c.to = this.rng() < 0.5 ? edges[k].a : edges[k].b;
    c.along = edges[k].len * (0.2 + this.rng() * 0.5);
    c.cruise = c.speed = c.want = 10 + this.rng() * 4;
    c.lane = c.laneGoal = LANE;
    c.waiting = c.passing = 0;
    this.pickNext(c);
    const p = this.lanePoint(c, c.along), q = this.lanePoint(c, c.along + 2);
    c.x = p.x;
    c.z = p.z;
    c.heading = Math.atan2(q.x - p.x, q.z - p.z);
  }

  private release(c: TrafficCar) {
    if (c.holding >= 0 && this.held.get(c.holding) === c) this.held.delete(c.holding);
    c.holding = -1;
  }

  /** A point in this car's lane, `s` metres along its edge, running on to the next edge past the end. */
  private lanePoint(c: TrafficCar, s: number): Vec {
    let e = this.edgeEnds(c.edge, c.to);
    if (s > e.len) { s -= e.len; e = this.edgeEnds(c.nextEdge, c.nextTo); }
    return { x: e.a.x + e.dx * s + e.dz * c.lane, z: e.a.z + e.dz * s - e.dx * c.lane }; // +dz,-dx is the driver's left
  }

  private think(c: TrafficCar, player: PlayerCar) {
    const dt = THINK_STEPS / 60, e = this.edgeEnds(c.edge, c.to), left = e.len - c.along;
    let want = c.blue ? BLUE_MPS : c.cruise, blocked = false;

    if ((left < 25 && c.nextEdge !== c.edge) || c.edge === this.town.rough) want = Math.min(want, TURN_MPS);
    c.signal = left < SIGNAL_M && c.nextEdge !== c.edge ? this.turnWay(c) : 0;

    const aspect = signalFor(this.town, c.to, c.edge, this.clock), line = left - STOP_LINE_M - c.halfL;
    if (aspect && aspect !== 'green' && left < SIGNAL_LOOK_M && line > -2) {
      const committed = aspect === 'amber' && line < (c.speed * c.speed) / (2 * CALM_MPS2); // too close to stop, you carry on through the amber
      if (c.blue) want = Math.min(want, RED_CROSS_MPS);
      else if (!committed) want = Math.min(want, brakeFor(line));
    }
    for (const z of this.town.zebrasOn.get(c.edge) ?? []) {
      const at = c.to === this.town.edges[c.edge].b ? z.along : e.len - z.along, gap = at - c.along - c.halfL - ZEBRA_STOP_M;
      if (gap < -1.5 || gap > 30) continue;
      const light = this.walkers?.lights.get(z), a = light?.traffic;
      // A pelican or puffin: stop on red, and on amber unless too close; on a pelican's flashing amber, go once it's clear.
      const stop = light ? a === 'red' || a === 'redAmber' || (a === 'amber' && gap > (c.speed * c.speed) / (2 * CALM_MPS2)) || (a === 'flashingAmber' && this.walkers!.onStripes(z)) : this.walkers?.busy(z);
      if (stop) want = Math.min(want, c.blue ? RED_CROSS_MPS : brakeFor(gap));
    }
    if (c.role === 'bus' && c.plan) want = this.busStop(c, want, dt, this.seen);
    if (c.chase) {
      if ((c.replan -= dt) <= 0) { // the road to wherever they've got to now
        c.replan = REPLAN_S;
        c.plan = this.town.route(c.to, this.town.snap(player).edge);
        c.leg = -2;
        this.pickNext(c);
      }
      const behind = dist(c, player);
      want = behind < TAIL_M * 3 ? Math.min(CHASE_MPS, Math.abs(player.speed) + Math.max(0, behind - TAIL_M) * 0.6) : CHASE_MPS; // it follows, and never rams
    } else {
      if (c.job?.wreck && (c.job.wreck.wreck <= 0 || c.job.wreck.riding) && c.role !== 'recovery') this.finish(c); // recovered before they got there
      if (c.job && !c.plan && left < ON_SCENE_M && dist(c, c.job.at) > ON_SCENE_M * 2) this.finish(c); // the end of the road and nothing here: the shout was elsewhere
    }
    if (c.returning && dist(c, this.home(c)!.road) < HOME_M) this.standDown(c);
    if (c.role === 'recovery' && c.job) {
      const here = dist(c, c.job.at) < ON_SCENE_M + c.halfL || c.loading > 0;
      if (here) want = 0;
      if (here && c.loading <= 0 && !this.cars.some((o) => o !== c && o.scene > 0 && o.job?.wreck === c.job!.wreck && c.job!.wreck)) { // a crew at work goes first, then the car goes on
        c.loading = LOAD_S;
        c.load = c.job.wreck ?? c.job.kerb ?? null;
        if (c.load) c.load.riding = true;
      }
      if (c.loading > 0 && (c.loading -= dt) <= 0) { c.loading = 0; this.finish(c); }
    } else if (c.job && !c.chase && dist(c, c.job.at) < ON_SCENE_M + c.halfL) {
      if (c.job.wreck && c.scene <= 0) c.scene = SCENE_S;
      else if (!c.job.wreck) this.finish(c);
    }
    if (c.scene > 0) {
      want = 0;
      c.laneGoal = LANE;
      if ((c.scene -= dt) <= 0) this.finish(c);
    }

    if (left < JUNCTION_M && !aspect && !c.blue) {
      const holder = this.held.get(c.to);
      if (!holder) { this.held.set(c.to, c); c.holding = c.to; }
      else if (holder !== c && c.waiting < GIVE_UP_S) { want = left < 11 ? 0 : Math.min(want, 4); c.waiting += dt; }
    }

    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), gap = 9 + c.speed * 1.3;
    const ahead = (o: Vec) => {
      const dx = o.x - c.x, dz = o.z - c.z, along = dx * fx + dz * fz;
      return along > 0 && along < gap + c.halfL && Math.abs(dx * fz - dz * fx) < (c.blue ? BLUE_GAP : SIDE_GAP) ? along : -1;
    };
    let yielding = false, inWay = 0; // which side of the car what's stopping it lies, driver's left positive
    for (const o of this.cars) {
      if (o === c || o.dormant || o.riding) continue;
      const at = ahead(o);
      if (at >= 0) want = Math.min(want, at - c.halfL - o.halfL < QUEUE_GAP_M ? 0 : o.speed);
      if (at >= 0 && (o.wreck > 0 || o.dwell > 0 || o.scene > 0 || (c.blue && o.speed < 1))) { blocked = true; inWay = (o.x - c.x) * fz - (o.z - c.z) * fx; } // a wreck in the lane, a bus at its stop or a crew at work is passed like anything else left in the way
      if (!c.blue && o.blue && o.scene <= 0 && o.speed > 2 && dist(o, c) < GIVE_WAY_M) { // pull in and stop until it's gone by, unless it's stuck behind you, when moving on is what clears the way
        const dx = c.x - o.x, dz = c.z - o.z, fwd = dx * Math.sin(o.heading) + dz * Math.cos(o.heading), side = Math.abs(dx * Math.cos(o.heading) - dz * Math.sin(o.heading));
        if (fwd > -2 && side < GIVE_WAY_SIDE_M) yielding = true;
      }
    }
    for (const o of this.kerb?.shoved ?? []) { // a car knocked out into the road
      const at = ahead(o);
      if (at < 0) continue;
      want = Math.min(want, at - c.halfL - o.halfL < QUEUE_GAP_M ? 0 : 3);
      blocked = true;
    }
    const toPlayer = ahead(player);
    if (toPlayer >= 0) {
      want = Math.min(want, toPlayer - c.halfL - player.car.size[0] / 2 < QUEUE_GAP_M ? 0 : Math.max(0, player.speed));
      blocked = true;
      inWay = (player.x - c.x) * fz - (player.z - c.z) * fx;
      if (c.blue && !c.chase && player.speed > BLOCK_MPS) { this.stuck += dt; this.holding = true; } // driving on in front of a crew. Sitting at a red isn't blocking: rule 219 says not to break the law to clear the way, and a crew goes round
    }

    // Nose up against the player's car, stopped where it isn't squarely in the lane ahead, such as one left parked while
    // you walk: that's blocked too, so the driver pulls out and goes round rather than waiting behind it for ever.
    const reach = { x: c.x + fx * 1.5, z: c.z + fz * 1.5, heading: c.heading, halfL: c.halfL, halfW: c.halfW };
    if (toPlayer < 0 && Math.abs(player.speed) < 1 && carsOverlap(reach, asBox(player))) { blocked = true; inWay = (player.x - c.x) * fz - (player.z - c.z) * fx; }
    const toYou = this.inRoad ? ahead(this.inRoad) : -1;
    if (toYou >= 0) {
      want = Math.min(want, toYou - c.halfL < QUEUE_GAP_M + 1 ? 0 : Math.min(want, (toYou - c.halfL) * 0.5)); // eases down, and stops short of you
      blocked = true;
      inWay = (this.inRoad!.x - c.x) * fz - (this.inRoad!.z - c.z) * fx;
    }

    // Left waiting behind a stopped player, a driver eventually pulls out and goes round.
    c.waiting = blocked && c.speed < 1 ? c.waiting + dt : c.want > 0 ? 0 : c.waiting;
    // A crew runs down the crown of the road, with both sides pulled in, and only leans away from what's still in the gap.
    // Going round, it swings out as far as what's in the way needs, if that's further than the usual line, but stays on the road.
    const roundIt = Math.max(-(ROAD_W / 2 - c.halfW - 0.3), Math.min(PASS_LANE, c.lane + inWay - SIDE_GAP - 0.4));
    if (c.waiting > (c.blue ? BLUE_PASS_S : PASS_AFTER_S) && blocked) { c.laneGoal = c.blue ? (inWay > 0 ? -BLUE_DODGE : BLUE_DODGE) : roundIt; c.passing = PASS_HOLD_S; c.waiting = 0; }
    // Going round the player's stopped car, it stays out until its tail is past, as a long bus needs longer than the hold.
    if (!c.blue && c.laneGoal <= PASS_LANE && Math.abs(player.speed) < 1) {
      const dx = player.x - c.x, dz = player.z - c.z, along = dx * fx + dz * fz;
      if (along > -(c.halfL + player.car.size[0] / 2 + 2) && along < gap + c.halfL && Math.abs(dx * fz - dz * fx) < LANE + 2) c.passing = Math.max(c.passing, 0.5);
    }
    const rest = c.blue ? BLUE_LANE : LANE;
    if ((c.passing -= dt) <= 0 && c.laneGoal !== rest && !(c.role === 'bus' && c.laneGoal === STOP_LANE) && c.scene <= 0) c.laneGoal = rest;
    if (((!c.blue && c.laneGoal <= PASS_LANE) || (c.blue && c.laneGoal !== BLUE_LANE)) && !blocked && c.scene <= 0) want = Math.max(want, 6);
    if (c.blue && c.laneGoal !== BLUE_LANE && blocked && c.scene <= 0) want = Math.max(want, CREEP_MPS); // a car at a standstill can't change lane, so a crew edges forward as it leans round
    if (yielding) { want = c.lane < YIELD_LANE - 0.3 ? Math.min(want, PULL_IN_MPS) : 0; c.laneGoal = YIELD_LANE; } // still rolling while they move over: a stopped car can't

    c.want = want;
    c.braking = want < c.speed - 0.5;
    if (c.role === 'recovery' && !c.job && dist(c, this.seen) > GONE_M) this.standDown(c); // job done and out of sight, it's back at the yard
    else if (dist(c, this.seen) > DESPAWN && !c.job && !c.returning) { // a crew on a job carries on to it
      if (c.role === 'bus') this.placeBus(c, this.seen);
      else if (c.fleet && c.fleet !== 'police_car') this.standDown(c);
      else this.place(c, this.seen);
    }
  }

  /** Pulling in at the next stop on this road, waiting there, and pulling out again. */
  private busStop(c: TrafficCar, want: number, dt: number, player: Vec): number {
    const stops = this.town.routes[c.route].stops;
    if (c.dwell > 0) {
      if ((c.dwell -= dt) <= 0) { c.laneGoal = LANE; c.lane = Math.min(c.lane, STOP_LANE); }
      c.signal = 1; // right, to pull out
      return 0;
    }
    const k = stops.findIndex((s) => s.leg === c.leg && s.along > c.along - AT_STOP_M), s = stops[k];
    if (!s || k === c.served) return want;
    const gap = s.along - c.along;
    if (gap > STOP_LOOK_M) return want;
    if (c.callAt !== k) { c.callAt = k; c.calling = this.rng() < ALIGHT_ODDS; }
    const wanted = c.calling || (this.walkers?.queued?.(s) ?? 0) > 0 || (this.hailing !== null && dist(this.hailing, s) < HAIL_M) || (this.rider?.bus === c && this.rider.rang);
    if (!wanted) return want; // nobody to set down or pick up: it carries on past
    c.laneGoal = STOP_LANE;
    c.signal = -1;
    // At the pole, or held short of a stop someone has parked in, where a driver opens the doors anyway.
    if ((gap < AT_STOP_M && c.speed < 1.5) || (c.waiting > STOP_BLOCKED_S && c.speed < 0.5)) { c.dwell = DOORS_S + PER_PERSON_S * (this.walkers?.board(s, player) ?? 0); c.served = k; return 0; }
    return Math.min(want, Math.max(1.2, brakeFor(gap)));
  }

  /** A crew finishing: the wreck goes when the last of them leaves, and they drive off as ordinary traffic, lights out. */
  private finish(c: TrafficCar) {
    const wreck = c.job?.wreck, forPlayer = c.job?.player;
    c.job = null;
    if (forPlayer) this.onRecovered?.();
    c.blue = c.chase = false;
    c.scene = 0;
    c.plan = null;
    c.laneGoal = LANE;
    c.cruise = 11;
    if (wreck && wreck.wreck > 0 && !wreck.riding && !this.cars.some((o) => o.job?.wreck === wreck)) wreck.wreck = 0.01;
    const home = this.home(c);
    if (home && c.fleet !== 'police_car') { // back to the station, lights out
      c.plan = this.town.route(c.to, home.edge);
      c.leg = -2;
      c.returning = true;
    }
    this.pickNext(c);
  }

  private home(c: TrafficCar) { return this.town.services.find((s) => s.id === c.role); }

  /** Turns a car on its road to face the job, so it doesn't set off the long way round. */
  private face(c: TrafficCar, at: Vec) {
    const e = this.town.edges[c.edge], from = this.town.nodes[e.a === c.to ? e.b : e.a];
    if (dist(from, at) < dist(this.town.nodes[c.to], at)) {
      c.to = e.a === c.to ? e.b : e.a;
      c.along = e.len - c.along;
    }
    c.lane = c.laneGoal = LANE;
    const p = this.lanePoint(c, c.along), q = this.lanePoint(c, c.along + 2);
    c.x = p.x;
    c.z = p.z;
    c.heading = Math.atan2(q.x - p.x, q.z - p.z);
  }

  /** Out of sight, whatever's on the bed is gone for good: a wreck's slot returns to the traffic, and a parked car to where it stood. */
  private unload(c: TrafficCar) {
    const r = c.load;
    c.load = null;
    if (!r) return;
    const car = this.cars.find((o) => o === r);
    if (car) {
      car.riding = false;
      car.lift = 0;
      car.wreck = 0;
      this.place(car, this.seen);
    } else this.kerb?.collected(r as KerbCar);
  }

  /** The car on the bed follows the truck: while winching it creeps up the bed, and after that it's tied down. */
  private ride(c: TrafficCar, dt: number) {
    const r = c.load!, back = c.halfL * 0.3, winching = c.loading > 0, pull = winching ? Math.min(1, dt * WINCH_RATE) : 1;
    r.x += (c.x - Math.sin(c.heading) * back - r.x) * pull;
    r.z += (c.z - Math.cos(c.heading) * back - r.z) * pull;
    let turn = c.heading - r.heading;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    r.heading += turn * pull;
    r.lift = BED_M * (winching ? 1 - c.loading / LOAD_S : 1);
  }

  private standDown(c: TrafficCar) {
    this.release(c);
    this.unload(c);
    c.dormant = true;
    c.returning = false;
    c.amber = false;
    c.plan = null;
    c.x = c.z = -1000;
    c.speed = c.want = c.vx = c.vz = 0;
  }

  /** Sends a crew of this service to a place, starting a street or two away on the far side, if one is free. */
  call(role: Exclude<Role, 'bus'>, at: Vec, near: Vec, wreck: TrafficCar | null = null, extra: Partial<Job> = {}): TrafficCar | null {
    const free = this.cars.filter((c) => c.role === role && !c.job && !c.load && c.wreck <= 0).sort((a, b) => Number(b.dormant) - Number(a.dormant))[0];
    return free ? this.send(free, at, near, wreck, extra) : null;
  }

  /** A recovery truck for the player's own car. */
  recover(player: PlayerCar) { return this.call('recovery', player, { x: player.x + 120, z: player.z + 90 }, null, { player: true }); }

  /** Out of the station if it's close enough to matter, or from a street or two away if it isn't. */
  private send(free: TrafficCar, at: Vec, near: Vec, wreck: TrafficCar | null, extra: Partial<Job> = {}) {
    if (free.dormant) {
      const home = this.home(free);
      free.dormant = false;
      this.place(free, near);
      if (home && dist(home.road, at) < STATION_RANGE_M) {
        const e = this.town.edges[home.edge];
        free.edge = home.edge;
        free.to = e.b;
        free.along = home.along;
        free.speed = 2;
      }
      this.face(free, at);
    }
    free.returning = false;
    this.release(free);
    const way = this.town.route(free.to, this.town.snap(at).edge);
    free.plan = way;
    free.leg = -2; // the plan starts at the road after this one
    free.job = { at, wreck, ...extra };
    if (free.role === 'recovery') { // amber, not blue: it keeps to the lights and the lane like anyone else
      free.amber = true;
      free.cruise = RECOVERY_MPS;
    } else {
      free.blue = true;
      free.cruise = BLUE_MPS;
      free.laneGoal = free.lane = BLUE_LANE;
    }
    this.pickNext(free);
    return free;
  }

  /** The police set off after the player. The patrol car goes if it's free. */
  pursue(player: PlayerCar): TrafficCar | null {
    const free = this.cars.filter((c) => c.role === 'police' && !c.job).sort((a, b) => dist(a, player) * Number(!a.dormant) - dist(b, player) * Number(!b.dormant) + Number(a.dormant) - Number(b.dormant))[0];
    if (!free) return null;
    this.send(free, player, { x: player.x + 150, z: player.z - 150 }, null);
    free.chase = true;
    free.replan = 0;
    free.cruise = CHASE_MPS;
    return free;
  }

  endPursuit(c: TrafficCar) { this.finish(c); }

  /** Who comes to a crash: police and an ambulance always, and the fire service when it's bad. */
  private respond(w: TrafficCar) {
    this.call('police', w, w, w);
    this.call('ambulance', w, w, w);
    if (w.damage >= HEAVY_WRECK) this.call('fire', w, w, w);
    this.call('recovery', w, w, w);
  }

  /** Which way the car turns at the end of its road: -1 left, 1 right, 0 straight on. */
  private turnWay(c: TrafficCar): -1 | 0 | 1 {
    const here = this.edgeEnds(c.edge, c.to), next = this.edgeEnds(c.nextEdge, c.nextTo);
    const cross = here.dx * next.dz - here.dz * next.dx; // the driver's left is +z-ward of a car heading +x, so positive is a left turn here
    return Math.abs(cross) < 0.35 ? 0 : cross > 0 ? 1 : -1;
  }

  /** Moves every car and returns the speed of any impact with the player this step. */
  /** `focus`: where cars are kept around, which is you when you're on foot and the car otherwise. */
  step(dt: number, player: PlayerCar, focus: Vec = player): number {
    const thinking = this.ticks++ % THINK_STEPS === 0;
    let impact = 0;
    this.lastCrash = null;
    this.clock += dt;
    this.seen = { x: focus.x, z: focus.z };
    const you = this.you; // on the carriageway itself: someone at the kerb, waiting for a bus, is not in the way
    this.inRoad = you && this.town.edges.some((e) => this.town.segDist(you, e) < ROAD_W / 2) ? you : null;
    if ((this.nextCollect -= dt) <= 0) { // anything left bent at the kerb gets picked up
      this.nextCollect = COLLECT_EVERY_S;
      const left = this.kerb?.wrecked();
      if (left) this.call('recovery', left, left, null, { kerb: left });
    }
    if ((this.nextCall -= dt) <= 0) { // somewhere else in town there's a shout on: a crew goes through, past the player
      this.nextCall = CALLOUT_S[0] + this.rng() * (CALLOUT_S[1] - CALLOUT_S[0]);
      const a = this.rng() * Math.PI * 2, roles = ['police', 'ambulance', 'fire'] as const;
      this.call(roles[Math.floor(this.rng() * 3)], this.town.snap({ x: focus.x + Math.sin(a) * CROSS_M, z: focus.z + Math.cos(a) * CROSS_M }).point, { x: focus.x - Math.sin(a) * 300, z: focus.z - Math.cos(a) * 300 });
    }
    for (const c of this.cars) {
      if (c.dormant || c.riding) continue;
      c.cool -= dt;
      if (c.wreck > 0 && (c.wreck -= dt) <= 0) this.place(c, focus);
      if (Math.abs(c.vx) + Math.abs(c.vz) > 0.25 || Math.abs(c.spin) > 0.1) this.roll(c, dt);
      else this.drive(c, dt, thinking, player);
      if (c.load) this.ride(c, dt);

      const touch = carsOverlap(c, asBox(player));
      if (touch) {
        const { nx, nz, depth: push } = touch;
        if (!this.town.boxAt(player.x + nx * push, player.z + nz * push, CAR_R)) { player.x += nx * push; player.z += nz * push; }
        else { c.x -= nx * push; c.z -= nz * push; }
        if (c.cool <= 0) {
          const f = player.dir;
          const rvx = f.x * player.speed - Math.sin(c.heading) * c.speed - c.vx;
          const rvz = f.z * player.speed - Math.cos(c.heading) * c.speed - c.vz;
          const closing = rvx * nx + rvz * nz; // negative when they drive into each other
          impact = Math.max(impact, Math.abs(closing));
          this.lastCrash = { nx, nz, dv: 0 };
          // Momentum carries through: two cars of about the same weight leave a crash at the average of their velocities, so a head-on stops both dead.
          const cvx = Math.sin(c.heading) * c.speed + c.vx, cvz = Math.cos(c.heading) * c.speed + c.vz;
          const pm = player.car.kg, total = pm + c.kg, pvx = f.x * player.speed, pvz = f.z * player.speed, mx = (cvx * c.kg + pvx * pm) / total, mz = (cvz * c.kg + pvz * pm) / total;
          player.speed = mx * f.x + mz * f.z;
          c.speed = 0;
          c.cool = 1.5;
          // The two share the collision by weight: each is bent as if it had hit a wall at its own change of speed, half the
          // closing speed between cars of the same weight, and nearly all of it for a car that runs into a bus.
          const bent = crushLevel((Math.abs(closing) * pm) / total), side = sideOf(-nx, -nz, c.heading);
          this.lastCrash.dv = (Math.abs(closing) * c.kg) / total;
          c.dents[side] = addCrush(c.dents[side], bent);
          c.damage = addCrush(c.damage, bent);
          if (c.damage >= WRECK_AT && c.wreck <= 0 && c.role === 'car') { c.wreck = WRECK_S; this.release(c); this.respond(c); }
          // A real accident (not a rub) hands the car the player's momentum; the slide across the contact face spins it.
          if (closing < -6 && c.kg < HEAVY_KG) {
            c.vx = mx;
            c.vz = mz;
            const vt = rvx * -nz + rvz * nx; // tangential slip: dead centre spins nothing, a side-swipe spins hard
            const lever = (player.x - c.x) * nz - (player.z - c.z) * nx; // a blow away from the car's middle turns it, as well as pushing it
            c.spin = Math.max(-3.5, Math.min(3.5, (vt / CAR_R) * 0.4 + lever * closing * 0.12));
            c.cool = 2;
          }
        }
      }
    }
    if (thinking) { if (!this.holding) this.stuck = 0; this.holding = false; }
    this.separate();
    return impact;
  }

  /** The lane-following drive: think, speed up or slow, keep to the lane and steer along it. */
  private drive(c: TrafficCar, dt: number, thinking: boolean, player: PlayerCar) {
    if (c.wreck > 0) { c.speed = 0; return; }
    if (thinking) this.think(c, player);
    c.speed += Math.max(-9 * dt, Math.min(3 * dt, (c.cool > 0 ? 0 : c.want) - c.speed));
    // Whatever it was planning, no driver rolls into a car that's right there: they stop and wait.
    const nose = { x: c.x + Math.sin(c.heading) * (c.speed * dt + 0.15), z: c.z + Math.cos(c.heading) * (c.speed * dt + 0.15), heading: c.heading, halfL: c.halfL, halfW: c.halfW };
    if (Math.abs(player.speed) < 3 && carsOverlap(nose, asBox(player)) && !carsOverlap(c, asBox(player))) c.speed = 0;
    c.along += c.speed * dt;
    c.lane += Math.max(-2 * dt, Math.min(2 * dt, c.laneGoal - c.lane));
    const len = this.town.edges[c.edge].len;
    if (c.along >= len) {
      c.along -= len;
      c.edge = c.nextEdge;
      c.to = c.nextTo;
      this.pickNext(c);
    }
    if (c.holding >= 0 && c.holding !== c.to && c.along > CLEAR_M) this.release(c);

    const t = this.lanePoint(c, c.along + 6);
    let err = Math.atan2(t.x - c.x, t.z - c.z) - c.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, err));
    c.x += Math.sin(c.heading) * c.speed * dt;
    c.z += Math.cos(c.heading) * c.speed * dt;
  }

  /** A knocked car obeys momentum, not the lane: it slides, rotates, bounces off walls and slows. */
  private roll(c: TrafficCar, dt: number) {
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    if (this.town.boxAt(nx, nz, CAR_R)) { c.vx *= -0.3; c.vz *= -0.3; }
    else { c.x = nx; c.z = nz; }
    c.heading += c.spin * dt;
    const v = Math.hypot(c.vx, c.vz), slowed = v > 0 ? Math.max(0, v - SLIDE_MPS2 * dt) / v : 0; // friction is a steady force, not a share of the speed
    c.vx *= slowed;
    c.vz *= slowed;
    c.spin *= Math.max(0, 1 - 3 * dt);
    if (Math.abs(c.vx) + Math.abs(c.vz) < 0.25 && Math.abs(c.spin) < 0.1) this.settle(c);
  }

  /** Park a finished slide back on the nearest road, facing the way it points, ready to drive again. */
  private settle(c: TrafficCar) {
    c.vx = c.vz = c.spin = 0;
    c.plan = null;
    let best: { d: number; edge: number; to: number; along: number; lane: number } | null = null;
    this.town.edges.forEach((e, i) => {
      const a = this.town.nodes[e.a], b = this.town.nodes[e.b];
      const dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len;
      const s = Math.max(0, Math.min(e.len, (c.x - a.x) * dx + (c.z - a.z) * dz));
      const d = dist(c, { x: a.x + dx * s, z: a.z + dz * s });
      if (!best || d < best.d) {
        const face = Math.sin(c.heading) * dx + Math.cos(c.heading) * dz >= 0; // which way along this edge is the car pointing
        const ux = face ? dx : -dx, uz = face ? dz : -dz; // its direction of travel on this edge
        const px = c.x - (a.x + dx * s), pz = c.z - (a.z + dz * s); // how far off the centre line it sits
        best = {
          d,
          edge: i,
          to: face ? e.b : e.a,
          along: face ? s : e.len - s,
          lane: Math.max(0.6, Math.min(3.5, px * uz - pz * ux)), // keep to its own left, never settle into oncoming lanes
        };
      }
    });
    const p = best!;
    c.edge = p.edge;
    c.to = p.to;
    c.along = Math.max(1, Math.min(this.town.edges[p.edge].len - 1, p.along));
    c.lane = p.lane;
    c.laneGoal = LANE;
    c.speed = 0;
    c.cool = 1.5; // the driver sits a moment before pulling away
    c.waiting = 0;
    c.passing = 0;
    this.release(c);
    this.pickNext(c);
  }

  /** Two cars that end up inside each other shove off, so a knock never welds them together. */
  private separate() {
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        if (a.dormant || b.dormant || a.riding || b.riding) continue;
        const hit = carsOverlap(a, b);
        if (!hit) continue;
        const { nx, nz } = hit, half = hit.depth / 2;
        a.x -= nx * half;
        a.z -= nz * half;
        b.x += nx * half;
        b.z += nz * half;
        const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (closing < 0) {
          a.vx += nx * closing * 0.5;
          a.vz += nz * closing * 0.5;
          b.vx -= nx * closing * 0.5;
          b.vz -= nz * closing * 0.5;
        }
      }
    }
  }

  /** How far off the nearest crew on the move is, for the siren, or null. */
  sirenFrom(p: Vec): number | null {
    let best: number | null = null;
    for (const c of this.cars) if (c.blue && c.scene <= 0 && !c.dormant) { const d = dist(c, p); if (best === null || d < best) best = d; }
    return best;
  }

  /** The nearest car squarely in the way of a point heading along `dir`, within `range` metres. */
  blocker(p: Vec, dir: Vec, range: number): { gap: number; speed: number } | null {
    let best: { gap: number; speed: number } | null = null;
    for (const c of this.cars) {
      if (c.dormant) continue;
      const dx = c.x - p.x, dz = c.z - p.z, along = dx * dir.x + dz * dir.z;
      if (along > 0 && along < range && Math.abs(dx * dir.z - dz * dir.x) < 1.8 && (!best || along < best.gap)) best = { gap: along, speed: c.speed };
    }
    return best;
  }
}
