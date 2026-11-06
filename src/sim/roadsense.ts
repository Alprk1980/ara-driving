// How the player drives, marked both ways. The score out of 100 works like a UK black-box insurance score: smooth, careful
// driving lifts it, and a good one pays, as telematics policies discount premiums (one published case gives 21%; insurers'
// formulas are private, so the sizes here are judged). Licence points follow the UK's: 3 for a red light or a zebra offence,
// from council and solicitors' guides rather than the statute. Failing to stop after a collision is an offence under
// section 170 of the Road Traffic Act 1988; the 6 points are from memory of its 5-10 range, unconfirmed. A blue light is
// "should" in the Highway Code (rule 219), not "must", so blocking one costs score but no licence points.
// Friendly on purpose: 12 points means a ban in life, and here a course, as a ban would stop the game. Points last 3 game
// days for 3 real years. Police who catch you have a word and a fine: they never ram, block or hurt anyone.
import type { Game } from './game.ts';
import { signalFor, STOP_LINE_M, type Aspect } from './signals.ts';
import { dist, ROAD_W, type Vec, type Zebra } from './town.ts';
import type { TrafficCar } from './traffic.ts';
import type { RoadMoment } from '../../schemas/services.ts';

export type Offence = 'red_run' | 'zebra_run' | 'blue_block' | 'drove_off' | 'phone_use' | 'hoax_call';
export type Merit = 'red_stop' | 'zebra_wait' | 'blue_pull' | 'stopped_after';
export type RoadEntry = { moment: RoadMoment; at: number; by: number }; // what happened, when on the record's clock, and how far it moved the score
export type RoadRecord = { score: number; marks: { kind: Offence; at: number }[]; clock: number; good: number; bad: number; log?: RoadEntry[] }; // log: missing from older saves

export const START_SCORE = 50, LICENCE_LIMIT = 12, MARK_DAYS = 3, COURSE_COST = 60, POLICE_FINE = 20; // eased after play (2026-11-02): a slip shouldn't cost a job's pay
// Driving well pays as you go: each clean kilometre, with no knock, sharp stop or offence, earns a little. Twice the fuel a
// kilometre burns, well short of a job's pay, so it rewards care without replacing the work. A game number, not a real one.
export const CLEAN_KM = 1, CLEAN_PAY = 4;
export const OFFENCES: Record<Offence, { points: number; drop: number }> = { red_run: { points: 3, drop: 6 }, zebra_run: { points: 3, drop: 6 }, blue_block: { points: 0, drop: 3 }, drove_off: { points: 6, drop: 10 }, phone_use: { points: 6, drop: 8 }, hoax_call: { points: 0, drop: 5 } }; // the score drops were halved after play (2026-11-02); the licence points are the real ones: a hand-held phone at the wheel is 6 points since 2017, and a hoax call costs score: the offence exists, but the search couldn't confirm its terms
export const MERITS: Record<Merit, { pay: number; rise: number }> = { red_stop: { pay: 5, rise: 1 }, zebra_wait: { pay: 8, rise: 2 }, blue_pull: { pay: 15, rise: 3 }, stopped_after: { pay: 0, rise: 0 } }; // only thanks, so a bump is never worth having
const SIGNAL_SHOWN_M = 80; // how far ahead the dash shows a signal: judged, about two junction spacings in Old Town
const LOG_KEEP = 30, TREND_EVERY_S = 30, TREND_SAMPLES = 5; // the arrow compares now with about two minutes ago
const SMOOTH_PER_KM = 0.6, HARD_STOP_DROP = 1, BUMP_DROP = 2, COOLDOWN_S = 15, BLOCK_S = 4, MOVING_MPS = 1.5, STILL_MPS = 1;
const WAIT_M = 16, LOOK_M = 34, CREW_M = 70, SEEN_M = 90, STOP_FOR_S = 3, LEAVE_M = 90, LEAVE_S = 20, MIN_KNOCK_MPS = 4;
const TALK_M = 35, TALK_S = 2, LOST_M = 350, LOST_S = 25, CHASE_MAX_S = 120, GOT_AWAY_DROP = 10;

export const freshRoad = (): RoadRecord => ({ score: START_SCORE, marks: [], clock: 0, good: 0, bad: 0 });

/** The bonus a score earns on job pay. */
export const scoreBonus = (score: number) => (score >= 90 ? 0.15 : score >= 75 ? 0.1 : score >= 60 ? 0.05 : 0);

export class RoadSense {
  rec: RoadRecord;
  private g: Game;
  private last: Vec;
  private held: string | null = null; // the signal we're waiting at
  private gave: Zebra | null = null; // the zebra we've stopped for
  private ready = new Map<string, number>();
  private clean = 0; // kilometres driven since the last slip
  private thanked = new WeakSet<TrafficCar>();
  incident: (Vec & { age: number; still: number }) | null = null;
  chaser: TrafficCar | null = null;
  private chaseAge = 0;
  private talk = 0;
  private lost = 0;
  private past: number[] = [];
  private nextSample = 0;

  constructor(g: Game, rec: RoadRecord) {
    this.g = g;
    this.rec = rec;
    this.last = { x: g.player.x, z: g.player.z };
  }

  get points() { return this.rec.marks.reduce((n, m) => n + OFFENCES[m.kind].points, 0); }
  get bonus() { return scoreBonus(this.rec.score); }
  /** How the score has moved over the last couple of minutes. */
  get trend() { return this.rec.score - (this.past[0] ?? this.rec.score); }

  private remember(moment: RoadMoment, by: number) {
    const log = (this.rec.log ??= []);
    log.unshift({ moment, at: this.rec.clock, by });
    log.length = Math.min(log.length, LOG_KEEP);
  }

  private nudge(by: number) { this.rec.score = Math.max(0, Math.min(100, this.rec.score + by)); }

  private merit(kind: Merit) {
    if (this.g.time < (this.ready.get(kind) ?? 0)) return;
    this.ready.set(kind, this.g.time + COOLDOWN_S);
    const m = MERITS[kind];
    this.nudge(m.rise);
    this.rec.good++;
    this.remember(kind, m.rise);
    this.g.roadEvent({ moment: kind, pay: m.pay, points: 0 });
  }

  private offence(kind: Offence) {
    if (this.g.time < (this.ready.get(kind) ?? 0)) return;
    this.clean = 0;
    this.ready.set(kind, this.g.time + COOLDOWN_S);
    const o = OFFENCES[kind];
    this.nudge(-o.drop);
    this.rec.bad++;
    this.remember(kind, -o.drop);
    if (o.points) this.rec.marks.push({ kind, at: this.rec.clock });
    this.g.roadEvent({ moment: kind, pay: 0, points: o.points });
    const police = this.g.traffic.cars.some((c) => c.role === 'police' && !c.dormant && dist(c, this.g.player) < SEEN_M);
    if (kind === 'drove_off' || (police && kind !== 'hoax_call')) this.pursue();
    if (this.points >= LICENCE_LIMIT) {
      this.rec.marks = [];
      this.rec.score = Math.max(this.rec.score, START_SCORE);
      this.remember('course', 0);
      this.g.roadEvent({ moment: 'course', pay: -COURSE_COST, points: 0 });
    }
  }

  private pursue() {
    if (this.chaser) return;
    this.chaser = this.g.traffic.pursue(this.g.player);
    this.chaseAge = this.talk = this.lost = 0;
  }

  private endChase() {
    if (this.chaser) this.g.traffic.endPursuit(this.chaser);
    this.chaser = null;
  }

  /** Fast travel, a tow or a new start: nothing follows you. */
  reset() {
    this.endChase();
    this.incident = null;
    this.held = this.gave = null;
    this.last = { x: this.g.player.x, z: this.g.player.z };
  }

  /** A knock into another car, which you have to stop for. */
  knocked(speed: number) {
    if (speed >= MIN_KNOCK_MPS && !this.incident) this.incident = { x: this.g.player.x, z: this.g.player.z, age: 0, still: 0 };
    this.nudge(-BUMP_DROP);
    this.clean = 0;
  }

  phoneAtWheel() { this.offence('phone_use'); }
  hoaxCall() { this.offence('hoax_call'); }
  hardStop() { this.nudge(-HARD_STOP_DROP); this.clean = 0; }
  /** A knock into a wall: it doesn't mark the record, but it isn't clean driving either. */
  scraped() { this.clean = 0; }
  smooth(km: number) {
    this.nudge(km * SMOOTH_PER_KM);
    if ((this.clean += km) >= CLEAN_KM - 1e-9) { this.clean = 0; this.g.goodDriving(CLEAN_PAY); }
  }

  private signals() {
    const { town, player: p, traffic } = this.g;
    for (const node of town.signals.keys()) {
      const n = town.nodes[node];
      if (Math.abs(p.x - n.x) > LOOK_M || Math.abs(p.z - n.z) > LOOK_M) continue;
      for (const w of town.adj[node]) {
        const a = this.approach(node, w.to, w.edge), was = a.short(this.last), now = a.short(p), lane = a.left(p);
        if (lane < -1 || lane > ROAD_W / 2 + 1 || now > LOOK_M) continue;
        const aspect = signalFor(town, node, w.edge, traffic.clock), key = `${node}:${w.edge}`;
        if (Math.abs(p.speed) < STILL_MPS && now > STOP_LINE_M - 2 && now < STOP_LINE_M + 14 && aspect !== 'green') this.held = key;
        if (was > STOP_LINE_M && now <= STOP_LINE_M && Math.abs(p.speed) > MOVING_MPS) {
          if ((aspect === 'red' || aspect === 'redAmber') && !p.blue) this.offence('red_run'); // on blue lights a red is a give way (TSRGD 2016's exemption for the emergency services); a crossing's red still binds, as people are on it
          else if (this.held === key) this.merit('red_stop');
          this.held = null;
        }
      }
    }
  }

  private approach(node: number, from: number, edge: number) {
    const n = this.g.town.nodes[node], o = this.g.town.nodes[from], len = this.g.town.edges[edge].len, dx = (n.x - o.x) / len, dz = (n.z - o.z) / len;
    return { dx, dz, short: (q: Vec) => (n.x - q.x) * dx + (n.z - q.z) * dz, left: (q: Vec) => (q.x - n.x) * dz - (q.z - n.z) * dx };
  }

  private zebras() {
    const { town, player: p, walkers } = this.g;
    for (const z of town.zebras) {
      if (Math.abs(p.x - z.x) > LOOK_M || Math.abs(p.z - z.z) > LOOK_M) continue;
      const on = (q: Vec) => (q.x - z.x) * z.ux + (q.z - z.z) * z.uz, was = on(this.last), now = on(p), across = Math.abs((p.x - z.x) * z.uz - (p.z - z.z) * z.ux);
      if (across > ROAD_W / 2 + 1) continue;
      const light = walkers.lights.get(z);
      if (light) { // a pelican or puffin: its red is a red light, and its flashing amber means give way to anyone still on it
        const a = light.traffic;
        if (Math.abs(p.speed) < STILL_MPS && Math.abs(now) < WAIT_M && (a === 'red' || a === 'redAmber')) this.gave = z;
        if (was * now <= 0 && was !== now && Math.abs(p.speed) > MOVING_MPS) {
          if (a === 'red' || a === 'redAmber') this.offence('red_run');
          else if (a === 'flashingAmber' && walkers.onStripes(z)) this.offence('zebra_run');
          else if (this.gave === z) this.merit('red_stop');
          this.gave = null;
        }
        continue;
      }
      if (Math.abs(p.speed) < STILL_MPS && Math.abs(now) < WAIT_M && walkers.busy(z)) this.gave = z;
      if (was * now <= 0 && was !== now && Math.abs(p.speed) > MOVING_MPS) {
        if (walkers.onStripes(z)) this.offence('zebra_run');
        else if (this.gave === z) this.merit('zebra_wait');
        this.gave = null;
      }
    }
  }

  private crews() {
    const { player: p, traffic } = this.g;
    if (traffic.stuck > BLOCK_S) { traffic.stuck = 0; this.offence('blue_block'); }
    if (Math.abs(p.speed) >= STILL_MPS * 2) return;
    for (const c of traffic.cars) {
      if (!c.blue || c.scene > 0 || c.chase || this.thanked.has(c) || dist(c, p) > CREW_M) continue;
      const coming = (p.x - c.x) * Math.sin(c.heading) + (p.z - c.z) * Math.cos(c.heading);
      if (coming > 0 && c.speed > 3) { this.thanked.add(c); this.merit('blue_pull'); }
    }
    for (const c of traffic.cars) if (!c.blue) this.thanked.delete(c);
  }

  private stopping(dt: number) {
    const i = this.incident, p = this.g.player;
    if (!i) return;
    i.age += dt;
    if (Math.abs(p.speed) < STILL_MPS && dist(i, p) < LEAVE_M) i.still += dt;
    if (i.still >= STOP_FOR_S) { this.incident = null; this.merit('stopped_after'); }
    else if (i.age > LEAVE_S || dist(i, p) > LEAVE_M) { this.incident = null; this.offence('drove_off'); }
  }

  private chase(dt: number) {
    const c = this.chaser, p = this.g.player;
    if (!c) return;
    this.chaseAge += dt;
    const far = dist(c, p);
    this.talk = far < TALK_M && Math.abs(p.speed) < STILL_MPS ? this.talk + dt : 0;
    this.lost = far > LOST_M ? this.lost + dt : 0;
    if (this.talk >= TALK_S) { // a word and a fine, and that's the end of it
      this.endChase();
      this.remember('pulled_over', 0);
      this.g.roadEvent({ moment: 'pulled_over', pay: -POLICE_FINE, points: 0 });
    } else if (this.lost > LOST_S || this.chaseAge > CHASE_MAX_S) {
      this.endChase();
      this.nudge(-GOT_AWAY_DROP);
      this.remember('got_away', -GOT_AWAY_DROP);
      this.g.roadEvent({ moment: 'got_away', pay: 0, points: 0 });
    }
  }

  step(dt: number) {
    this.rec.clock += dt;
    if (this.rec.clock >= this.nextSample) {
      this.nextSample = this.rec.clock + TREND_EVERY_S;
      this.past.push(this.rec.score);
      if (this.past.length > TREND_SAMPLES) this.past.shift();
    }
    const life = (MARK_DAYS * 480); // a day is 480 s: see DAY_S in game.ts
    if (this.rec.marks.length && this.rec.clock - this.rec.marks[0].at > life) this.rec.marks.shift();
    this.signals();
    this.zebras();
    this.crews();
    this.stopping(dt);
    this.chase(dt);
    this.last = { x: this.g.player.x, z: this.g.player.z };
  }

  /** The signal on the road ahead and how far to its stop line, as a car's traffic light display shows it. */
  signalAhead(range = SIGNAL_SHOWN_M): { aspect: Aspect; metres: number } | null {
    const { town, player: p, traffic } = this.g, fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let best: { aspect: Aspect; metres: number } | null = null;
    for (const node of town.signals.keys()) {
      const n = town.nodes[node];
      if (Math.abs(p.x - n.x) > range + STOP_LINE_M || Math.abs(p.z - n.z) > range + STOP_LINE_M) continue;
      for (const w of town.adj[node]) {
        const a = this.approach(node, w.to, w.edge), now = a.short(p), lane = a.left(p);
        if (lane < -1 || lane > ROAD_W / 2 + 1 || a.dx * fx + a.dz * fz < 0.5 || now < STOP_LINE_M - 2 || now > range + STOP_LINE_M) continue;
        const metres = Math.max(0, now - STOP_LINE_M - p.car.size[0] / 2);
        if (!best || metres < best.metres) best = { aspect: signalFor(town, node, w.edge, traffic.clock)!, metres };
      }
    }
    for (const z of town.zebras) { // and the pelicans and puffins; a flashing amber shows as amber
      const light = this.g.walkers.lights.get(z);
      if (!light) continue;
      const along = (z.x - p.x) * fx + (z.z - p.z) * fz, across = Math.abs((z.x - p.x) * fz - (z.z - p.z) * fx);
      if (along < 2 || along > range || across > ROAD_W / 2 + 1) continue;
      const metres = Math.max(0, along - 2.5 - p.car.size[0] / 2), a = light.traffic;
      if (!best || metres < best.metres) best = { aspect: a === 'flashingAmber' ? 'amber' : a, metres };
    }
    return best;
  }

  /** How far ahead the road says stop, for a driver who keeps the rules. */
  stopAhead(): number | null {
    const { town, player: p, traffic, walkers } = this.g, fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let best: number | null = null;
    for (const node of town.signals.keys()) {
      const n = town.nodes[node];
      if (Math.abs(p.x - n.x) > 60 || Math.abs(p.z - n.z) > 60) continue;
      for (const w of town.adj[node]) {
        const a = this.approach(node, w.to, w.edge), now = a.short(p), lane = a.left(p), aspect = signalFor(town, node, w.edge, traffic.clock);
        if (lane < -1 || lane > ROAD_W / 2 + 1 || a.dx * fx + a.dz * fz < 0.5 || now < STOP_LINE_M + 0.5 || now > 60 || aspect === 'green') continue;
        const gap = now - STOP_LINE_M - p.car.size[0] / 2;
        if (aspect === 'amber' && gap < (p.speed * p.speed) / 14) continue; // too close to stop, you go on through
        if (best === null || gap < best) best = gap;
      }
    }
    for (const z of town.zebras) {
      const along = (z.x - p.x) * fx + (z.z - p.z) * fz, across = Math.abs((z.x - p.x) * fz - (z.z - p.z) * fx);
      if (along < 3 || along > 45 || across > ROAD_W / 2 + 1) continue;
      const a = walkers.lights.get(z)?.traffic;
      if (a ? !(a === 'red' || a === 'redAmber' || a === 'amber' || (a === 'flashingAmber' && walkers.onStripes(z))) : !walkers.busy(z)) continue;
      const gap = along - 3 - p.car.size[0] / 2;
      if (best === null || gap < best) best = gap;
    }
    return best;
  }
}
