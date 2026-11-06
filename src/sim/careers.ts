// A shift at work: sign on at a station or depot, take its vehicle out, and work through the tasks it deals. The careers'
// pay, ranks, vehicles and call kinds are in schemas/careers.ts, with their sources; this is how a shift runs.
//
// Each task is booked a time, the way real work is: a bus timetable, or a crew's run to a call at its working pace plus
// the time at the scene. A task pays the rank's hourly wage for that booked time, so dawdling earns nothing extra and
// a quick, careful run earns the on-time bonus. Nothing here fails a shift: a late bus or a slow run is still paid.
import { BASE_SAYS, CALL_KINDS, CAREERS, careerRank, RANK_KINDS, type CallCard, type CallCareer, type CareerId, type CareerRank } from '../../schemas/careers.ts';
import type { Place } from '../../schemas/content.ts';
import type { FleetId } from '../../schemas/fleet.ts';
import { POINT_GBP } from './economy.ts';
import type { KerbCar } from './parked.ts';
import { route } from './route.ts';
import type { TrafficCar } from './traffic.ts';
import { dist, type BusStop, type Plot, type Rng, type Town, type Vec } from './town.ts';

export const GAME_HOUR_S = 20; // a 480 s day (game.ts DAY_S) over 24 hours
export const SHIFT_CALLS = 3; // calls on a shift before heading back, judged: about five minutes' play
export const BUS_SHIFT_STOPS = 8; // stops from the garage to the relief point, where a real driver hands over mid-route
export const TIMING_EVERY = 4; // every fourth stop is a timing point, where an early bus waits for its time
// The Traffic Commissioners count a bus on time from 1 minute early to 5 minutes 59 seconds late, and treat running early
// as the worse fault. This town's runs are a few minutes, not an hour, so the late allowance is judged to suit: 30 s.
export const LATE_OK_S = 30;
export const ON_TIME_BONUS = 0.15; // judged: enough to notice on the payslip
export const TARGET_SLACK = 1.35; // a response target is the run at working pace with this much slack, judged
// Working paces, from the traffic the town already runs: buses average 9 m/s round their loops, a crew on blue lights
// cruises at 16, and a recovery truck at 12 (src/sim/traffic.ts, where each is sourced or judged).
export const PACE_MPS = { bus: 9, blue: 16, work: 12 } as const;
export const DWELL_S = 7, PER_PERSON_S = 3.5; // doors and pulling away, and each passenger's tap: traffic.ts, from TfL's 10.5-14.5 s average dwell
export const AT_M = 14, STILL_MPS = 1; // close enough to the scene, and stopped
export const LOAD_S = 12, DROP_S = 8, HANDOVER_S = 6; // winching a car up (traffic.ts), letting it down, handing a patient over: judged
export const PULL_RANGE_M = 35, PULL_HOLD_S = 8, LOST_M = 600; // close enough behind for the blue lights to tell them, and to stop behind once they've pulled in (police stop well back, judged); the word at the window; and gone
export const CALL_RING_M: [number, number] = [350, 900]; // how far off a call comes in: across a district or two
// What a traffic stop is for, with the real fixed penalties in England: speeding £100 and 3 points, a hand-held phone £200
// and 6, no seatbelt £100, a red light £100 and 3 (GOV.UK's penalty tables). Words, not a pursuit: decided 2026-10-30.
export const STOP_REASONS = [
  { why: 'speeding', outcome: 'a £100 fixed penalty and 3 points' },
  { why: 'using a phone at the wheel', outcome: 'a £200 fixed penalty and 6 points' },
  { why: 'no seatbelt', outcome: 'a £100 fixed penalty' },
  { why: 'going through a red light', outcome: 'a £100 fixed penalty and 3 points' },
] as const;

export type Base = { career: CareerId; name: string; at: Vec; heading: number };
export type TaskKind = 'stop' | 'call' | 'convey' | 'tow' | 'drop' | 'fix' | 'pull' | 'return';
export type Task = {
  kind: TaskKind; at: Vec; title: string; text: string; hold: number; blue: boolean;
  booked: number; // seconds this task is booked to take
  due: number; // shift seconds by which it's on time
  timing?: boolean; // a bus timing point: an early bus waits here
  stop?: BusStop; card?: CallCard; fix?: number; kerb?: KerbCar; wreck?: TrafficCar; offender?: TrafficCar; reason?: (typeof STOP_REASONS)[number];
};
export type ShiftEvent =
  | { type: 'paid'; task: Task; pay: number; onTime: boolean; note: string }
  | { type: 'phase'; label: string }
  | { type: 'rank'; career: CareerId; rank: number }
  | { type: 'done' };

/** What a shift needs from the town and its traffic: the game provides it. Kept narrow so tests can drive a shift. */
export type ShiftWorld = {
  town: Town; places: Place[]; calls: CallCard[]; rng: Rng;
  plots: Plot[]; placeOf(p: Plot): Place | undefined;
  breakdown(near: Vec): KerbCar | null; // a car at the kerb that won't start
  offender(near: Vec): TrafficCar | null; // a driver breaking the law, for a traffic stop
  pullOver(c: TrafficCar, on: boolean): void;
  board(s: BusStop): number; // people waiting, who get on
  sendRecovery(k: KerbCar): void;
  collected(k: KerbCar): void;
  dropWreck(w: TrafficCar): void;
};

const placeName = (w: ShiftWorld, at: Vec) => {
  const p = w.plots.reduce((b, q) => (dist(q.road, at) < dist(b.road, at) ? q : b));
  return w.placeOf(p)?.name ?? 'the high street';
};
const headingAlong = (town: Town, at: Vec) => {
  const e = town.edges[town.snap(at).edge], a = town.nodes[e.a], b = town.nodes[e.b];
  return Math.atan2(b.x - a.x, b.z - a.z);
};

/** Where each career signs on: the blue-light stations, and the depots whose names say what they are. */
export function careerBases(town: Town, places: Place[], placeOf: (p: Plot) => Place | undefined): Base[] {
  const out: Base[] = [];
  for (const s of town.services) out.push({ career: s.id, name: `${CAREERS[s.id].who[4].toUpperCase()}${CAREERS[s.id].who.slice(5)}`, at: s.road, heading: headingAlong(town, s.road) });
  for (const career of ['bus', 'recovery', 'mechanic'] as const) {
    const plot = town.plots.find((p) => { const pl = placeOf(p); return pl?.kind === 'depot' && BASE_SAYS[career].test(pl.name); });
    if (plot) out.push({ career, name: placeOf(plot)!.name, at: plot.road, heading: headingAlong(town, plot.road) });
  }
  void places;
  return out;
}

export const payFor = (rank: CareerRank, bookedS: number, onTime: boolean) => Math.max(1, Math.round((rank.gbpHour / POINT_GBP) * (bookedS / GAME_HOUR_S) * (onTime ? 1 + ON_TIME_BONUS : 1)));
const runS = (town: Town, from: Vec, to: Vec, mps: number) => route(town, from, to).length / mps;

export class Shift {
  readonly career: CareerId;
  readonly vehicle: FleetId;
  readonly base: Base;
  rankIndex: number;
  tasks: Task[] = [];
  clock = 0; // seconds since signing on
  held = 0; // seconds stopped at the current task
  earned = 0;
  jobs = 0; // tasks paid this shift
  callsLeft = SHIFT_CALLS;
  rider: KerbCar | TrafficCar | null = null; // a car on the recovery truck's bed
  pulled = false; // the driver being stopped has pulled in
  private w: ShiftWorld;

  constructor(career: CareerId, vehicle: FleetId, base: Base, jobsSoFar: number, w: ShiftWorld, from: Vec) {
    this.career = career;
    this.vehicle = vehicle;
    this.base = base;
    this.rankIndex = careerRank(jobsSoFar);
    this.w = w;
    if (career === 'bus') this.planBus(from); else this.deal(from);
  }

  get rank(): CareerRank { return CAREERS[this.career].ranks[this.rankIndex]; }
  get task(): Task | null { return this.tasks[0] ?? null; }
  /** Blue lights on: on the way to an emergency, until you're there. */
  get blue(): boolean { const t = this.task; return !!t && t.blue && this.held === 0 && !(t.kind === 'pull' && this.pulled); }

  // The bus: a route by rank (the short Inner Circle to start), from the stop nearest the garage, round to the relief point.
  private planBus(from: Vec) {
    const { town } = this.w, routes = town.routes.map((r, i) => ({ r, i })).filter(({ r }) => (this.rankIndex === 0 ? r.name.startsWith('2') : r.name.startsWith('1')));
    const pick = (routes.length ? routes : town.routes.map((r, i) => ({ r, i })))[Math.floor(this.w.rng() * Math.max(1, routes.length || town.routes.length))];
    const stops = pick.r.stops, first = stops.reduce((b, s, k) => (dist(s, from) < dist(stops[b], from) ? k : b), 0);
    let at: Vec = from, t = 0;
    for (let n = 0; n < Math.min(BUS_SHIFT_STOPS, stops.length * 2); n++) {
      const s = stops[(first + n) % stops.length], run = runS(town, at, s, PACE_MPS.bus), dwell = DWELL_S + PER_PERSON_S * 1.5;
      t += run + dwell;
      const timing = (n + 1) % TIMING_EVERY === 0;
      this.tasks.push({ kind: 'stop', at: s, stop: s, title: `${pick.r.name} to ${pick.r.via}`, text: `Stop ${n + 1} of ${BUS_SHIFT_STOPS}: ${placeName(this.w, s)}`, hold: DWELL_S, blue: false, booked: run + dwell, due: t, timing });
      at = s;
    }
    this.backToBase(at, t);
  }

  private backToBase(from: Vec, t: number) {
    const run = runS(this.w.town, from, this.base.at, PACE_MPS.work);
    this.tasks.push({ kind: 'return', at: this.base.at, title: 'Back to base', text: `Take the vehicle back to ${this.base.name}`, hold: 1, blue: false, booked: run, due: t + run * TARGET_SLACK });
  }

  /** The next call, somewhere across town from here. */
  private deal(from: Vec) {
    if (this.callsLeft-- <= 0) return this.backToBase(from, this.clock);
    const w = this.w, career = this.career as CallCareer;
    if (this.career === 'police' && this.rankIndex >= 1 && w.rng() < 0.4) { // a traffic stop
      const c = w.offender(from);
      if (c) {
        const reason = STOP_REASONS[Math.floor(w.rng() * STOP_REASONS.length)];
        return this.add({ kind: 'pull', at: c, offender: c, reason, title: 'Traffic stop', text: `A driver ahead is ${reason.why}. Get behind them with your lights on.`, hold: PULL_HOLD_S, blue: true }, from, PACE_MPS.blue);
      }
    }
    const allowed = this.rankIndex === 0 ? RANK_KINDS[career] : undefined;
    const pool = w.calls.filter((c) => c.career === career && (!allowed || allowed.includes(c.kind)));
    const card = pool[Math.floor(w.rng() * pool.length)];
    if (!card) return this.backToBase(from, this.clock);
    const rule = (CALL_KINDS[career] as Record<string, { hold: number; blue?: boolean; fix?: number }>)[card.kind];
    if (this.career === 'mechanic' || this.career === 'recovery') {
      const k = w.breakdown(from);
      if (!k) return this.backToBase(from, this.clock);
      const name = placeName(w, k);
      return this.add({ kind: this.career === 'mechanic' ? 'fix' : 'tow', at: k, kerb: k, card, fix: rule.fix, title: card.title, text: card.text.replace('{place}', name), hold: this.career === 'recovery' ? LOAD_S : rule.hold, blue: false }, from, PACE_MPS.work);
    }
    const at = this.callSpot(from), name = placeName(w, at);
    this.add({ kind: 'call', at, card, title: card.title, text: card.text.replace('{place}', name), hold: rule.hold, blue: !!rule.blue }, from, rule.blue ? PACE_MPS.blue : PACE_MPS.work);
  }

  private callSpot(from: Vec): Vec {
    const w = this.w, ring = w.plots.filter((p) => { const d = dist(p.road, from); return d > CALL_RING_M[0] && d < CALL_RING_M[1]; });
    const list = ring.length ? ring : w.plots;
    return list[Math.floor(w.rng() * list.length)].road;
  }

  private add(t: Omit<Task, 'booked' | 'due'>, from: Vec, pace: number) {
    const run = runS(this.w.town, from, t.at, pace);
    this.tasks.push({ ...t, booked: run + t.hold, due: this.clock + run * TARGET_SLACK + t.hold });
  }

  /** A crash in town that this crew is called to: it goes to the front of the list. */
  incident(w: TrafficCar, from: Vec): boolean {
    const t = this.task, career = this.career;
    if (!t || t.wreck === w || this.held > 0 || (career === 'recovery' && this.rider)) return false;
    if ((career === 'fire' || career === 'recovery') && this.rankIndex < 1) return false; // crash work opens at the second rank
    if (career === 'bus' || career === 'mechanic') return false;
    const name = placeName(this.w, w);
    const call = { police: ['Crash on the road', 'emergency'], ambulance: ['Crash: people to check over', 'cat2'], fire: ['Crash rescue', 'rescue'], recovery: ['Crash to clear', ''] } as const;
    const [title, kind] = call[career], hold = career === 'recovery' ? LOAD_S : (CALL_KINDS as Record<string, Record<string, { hold: number }>>)[career][kind].hold;
    const run = runS(this.w.town, from, w, PACE_MPS.blue);
    this.tasks.unshift({ kind: career === 'recovery' ? 'tow' : 'call', at: w, wreck: w, title, text: `Two cars have bumped near ${name}. Everyone's out and safe.`, hold, blue: career !== 'recovery', booked: run + hold, due: this.clock + run * TARGET_SLACK + hold });
    this.held = 0;
    this.pulled = false;
    return true;
  }

  /** One step. `you`: the vehicle's place and speed. Returns what happened, for the game to pay and show. */
  step(dt: number, you: Vec & { speed: number; heading: number }): ShiftEvent[] {
    this.clock += dt;
    const out: ShiftEvent[] = [], t = this.task;
    if (!t) return out;
    if (this.rider) this.carry(you);
    if (t.kind === 'pull') {
      const c = t.offender!;
      t.at = c;
      if (!this.pulled) {
        const behind = (c.x - you.x) * Math.sin(you.heading) + (c.z - you.z) * Math.cos(you.heading);
        if (dist(c, you) < PULL_RANGE_M && behind > 0) { this.pulled = true; this.w.pullOver(c, true); out.push({ type: 'phase', label: 'They have seen your lights and are pulling in' }); }
        else if (dist(c, you) > LOST_M || c.dormant) { this.tasks.shift(); out.push({ type: 'phase', label: 'Lost them in the traffic' }); this.deal(you); return out; }
      }
    }
    if (t.wreck && t.kind === 'call' && t.wreck.wreck <= 0) { this.tasks.shift(); out.push({ type: 'phase', label: 'Another crew cleared that one' }); return out; }
    const here = dist(t.at, you) < (t.kind === 'pull' ? PULL_RANGE_M : AT_M) && Math.abs(you.speed) < STILL_MPS && (t.kind !== 'pull' || this.pulled);
    if (!here) { this.held = 0; return out; }
    if (this.held === 0) {
      if (t.kind === 'stop') {
        const n = this.w.board(t.stop!);
        t.hold = DWELL_S + PER_PERSON_S * n;
        if (t.timing && t.due - this.clock > t.hold) t.hold = t.due - this.clock; // early at a timing point: wait for your time
        out.push({ type: 'phase', label: n ? `Doors open: ${n} getting on` : 'Doors open' });
      } else out.push({ type: 'phase', label: HOLD_LABEL[t.kind] });
    }
    this.held += dt;
    if (this.held < t.hold) return out;
    this.held = 0;
    this.pulled = false;
    this.tasks.shift();
    out.push(...this.complete(t, you));
    return out;
  }

  private complete(t: Task, you: Vec): ShiftEvent[] {
    const out: ShiftEvent[] = [], w = this.w;
    let note = '';
    if (t.kind === 'return') { out.push({ type: 'done' }); return out; }
    if (t.kind === 'tow') {
      this.rider = t.wreck ?? t.kerb!;
      this.rider.riding = true;
      const run = runS(w.town, you, this.base.at, PACE_MPS.work);
      this.tasks.unshift({ kind: 'drop', at: this.base.at, title: 'Back to the yard', text: `Take it to ${this.base.name}`, hold: DROP_S, blue: false, booked: run + DROP_S, due: this.clock + run * TARGET_SLACK + DROP_S });
      note = 'On the bed and strapped down';
    }
    if (t.kind === 'drop' && this.rider) {
      const r = this.rider;
      this.rider = null;
      r.riding = false;
      r.lift = 0;
      if ('homeX' in r) w.collected(r); else w.dropWreck(r);
      note = 'Dropped at the yard';
    }
    if (t.kind === 'fix') {
      const fixed = w.rng() < (t.fix ?? 0.8);
      if (!fixed) w.sendRecovery(t.kerb!);
      note = fixed ? 'Fixed at the roadside' : 'Needs the garage: a recovery truck is on its way';
    }
    if (t.kind === 'pull') { w.pullOver(t.offender!, false); note = `Stopped for ${t.reason!.why}: ${t.reason!.outcome}`; }
    if (t.kind === 'call' && t.card && this.career === 'ambulance') {
      const rule = (CALL_KINDS.ambulance as Record<string, { convey: boolean }>)[t.card.kind];
      if (rule?.convey && this.vehicle !== 'rrv') {
        const clinic = w.plots.filter((p) => w.placeOf(p)?.kind === 'clinic').sort((a, b) => dist(a.road, you) - dist(b.road, you))[0];
        if (clinic) {
          const run = runS(w.town, you, clinic.road, PACE_MPS.blue);
          this.tasks.unshift({ kind: 'convey', at: clinic.road, title: 'To the clinic', text: `Take your patient to ${w.placeOf(clinic)!.name}`, hold: HANDOVER_S, blue: true, booked: run + HANDOVER_S, due: this.clock + run * TARGET_SLACK + HANDOVER_S });
        }
      }
    }
    const onTime = t.kind === 'stop' ? this.clock <= t.due + LATE_OK_S : this.clock <= t.due;
    const pay = payFor(this.rank, t.booked, onTime);
    this.earned += pay;
    this.jobs++;
    out.push({ type: 'paid', task: t, pay, onTime, note });
    const nextBusy = this.tasks.some((x) => x.kind !== 'return');
    if (!nextBusy && this.career !== 'bus' && !this.tasks.length) this.deal(you);
    return out;
  }

  /** Called by the game after a task is paid, with the career's jobs so far: a step up the ladder, if it's come. */
  promote(jobs: number): ShiftEvent | null {
    const r = careerRank(jobs);
    if (r <= this.rankIndex) return null;
    this.rankIndex = r;
    return { type: 'rank', career: this.career, rank: r };
  }

  /** The car on the bed rides along, as traffic.ts does for its own trucks. */
  private carry(you: Vec & { heading: number }) {
    const r = this.rider!, back = 1.6;
    r.x = you.x - Math.sin(you.heading) * back;
    r.z = you.z - Math.cos(you.heading) * back;
    r.heading = you.heading;
    r.lift = 1.15;
  }

  /** Where the vehicle should head: the current task. */
  get target(): Vec | null { return this.task?.at ?? null; }
  /** Seconds until the current task's due time; negative when late. */
  get dueIn(): number | null { const t = this.task; return t ? t.due - this.clock : null; }
}

const HOLD_LABEL: Record<TaskKind, string> = {
  stop: 'Doors open', call: 'On scene', convey: 'Handing over at the clinic', tow: 'Winching it up', drop: 'Letting it down', fix: 'Having a look under the bonnet', pull: 'A word at the window', return: 'Back at base',
};

export const careerName = (id: CareerId) => CAREERS[id].name;
export { CAREERS, careerRank };
