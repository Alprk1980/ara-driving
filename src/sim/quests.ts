// Quests: the offer generator and one quest's lifecycle. Pay comes only from economy.ts, so generated
// text can never change it.
import type { Find, Goal, JobCar, Place, QuestText, QuestType, Regular, Twist } from '../../schemas/content.ts';
import { CAR_JOBS, CARGO_BONUS, CLOCK_DRAIN, CLOCK_GRACE, LONG_HAUL, MARKET_BOOST, payout, QUEST_PAY, RANK_CAR_JOBS, RANK_LONG_HAUL, RANK_TWISTS, rankOf, ROUTE_BANDS, TIP_BONUS, TRIAL_GRADES, trialKmh, TWIST_RULES, type Car } from './economy.ts';
import { freshDaily, type Daily } from './goals.ts';
import { SHOPS } from './shops.ts';
import type { CallCard, CareerId } from '../../schemas/careers.ts';
import type { TownCase } from '../../schemas/cases.ts';
import type { CaseProgress } from './casebook.ts';
import type { RivalCrew } from '../../schemas/rivals.ts';
import { ROGUE_ODDS, ROGUE_PAY, ROGUE_RANK, ROGUE_SCORE, type RogueJob } from '../../schemas/rogue.ts';
import type { Season } from './rivals.ts';
import { freshRoad, type RoadRecord } from './roadsense.ts';
import { pointAt, route, type Route } from './route.ts';
import { dist, type Plot, type Rng, type Town, type Vec } from './town.ts';

export type Offer = {
  id: number; type: QuestType; title: string; text: string;
  start: Plot; end: Plot; startName: string; endName: string;
  routeKm: number; approachKm: number; litres: number; basePay: number; maxPay: number; route: Route;
  gates: Vec[]; goldSeconds: number;
  twist?: Twist;
  regular?: { id: string; name: string; step: number; total: number; thanks: string };
  rematch?: Ghost;
  carJob?: JobCar;
  market?: boolean; // ends at the kind of place today's market day pays extra for
  business?: string; // a delivery a shop or depot sends out itself: its name
  rogue?: boolean; // a getaway job: more pay, and the police may give chase (schemas/rogue.ts)
};
export type QuestPhase = 'HeadingToStart' | 'Active';
export type QuestState = { phase: QuestPhase; care: number; elapsed: number; gate: number; bumps: number; track: number[] };

/** A best trial run: its course as plot indexes, the time, and x, z, heading every GHOST_S seconds. */
export type Ghost = { s: number; e: number; time: number; track: number[] };
export const GHOST_S = 0.25;
export const GHOST_KEEP = 8; // courses remembered, which keeps the save small

/** Where a saved run was at this moment of the current one, or null once it has finished. */
export function ghostPose(g: Ghost, elapsed: number): { x: number; z: number; heading: number } | null {
  const at = elapsed / GHOST_S, i = Math.floor(at) * 3, t = at - Math.floor(at), { track } = g;
  if (i + 5 >= track.length) return null;
  let turn = track[i + 5] - track[i + 2];
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return { x: track[i] + (track[i + 3] - track[i]) * t, z: track[i + 1] + (track[i + 4] - track[i + 1]) * t, heading: track[i + 2] + turn * t };
}

/** A player's standing with the town: saved between sessions and shared with the offer list. */
export type Progress = { arcs: Record<string, number>; ghosts: Ghost[]; found: string[]; rep: number; daily: Daily; road?: RoadRecord; careers?: Partial<Record<CareerId, number>>; cases?: CaseProgress; season?: Season }; // road and careers: missing from older saves; careers counts the jobs done in each
export const freshProgress = (): Progress => ({ arcs: {}, ghosts: [], found: [], rep: 0, daily: freshDaily(''), road: freshRoad() });

const offerMult = (o: Offer) => (o.carJob ? CAR_JOBS[o.carJob].mult : 1) * (o.market ? 1 + MARKET_BOOST : 1) * (o.rogue ? ROGUE_PAY : 1);

export const placeAt = (town: Town, places: Place[], p: Plot): Place | undefined => places[town.plots.indexOf(p) % places.length];

/** The named place closest to a spot, and which way the spot lies from it. Finds and their clues share this. */
export function landmarkFor(town: Town, places: Place[], spot: Vec): { name: string; way: 'north' | 'south' | 'east' | 'west' } {
  const near = town.plots.reduce((b, p) => (dist(p, spot) < dist(b, spot) ? p : b));
  const dx = spot.x - near.x, dz = spot.z - near.z; // on the map +x is east and +z is south
  return { name: placeAt(town, places, near)?.name ?? 'Town Square', way: Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north' };
}

/** The lots held empty for the regulars, spread across town. Each story's building goes up on its own lot. */
export const storyPlot = (town: Town, index: number): Plot => town.plots[(index * 17 + 11) % town.plots.length];

const SAFETY = 1.3; // litres quoted on an offer include hard throttle
const BUSINESS_ODDS = 0.6, BUSINESS_REACH_M = 1000; // how often a business sends the delivery, and how far you'd go to collect it: judged
export const CARE_PER_BUMP = 0.2;
export const CARE_PER_HARD_STOP = 0.1;

export type QuestContent = { places: Place[]; quests: QuestText[]; regulars?: Regular[]; finds?: Find[]; goals?: Goal[]; calls?: CallCard[]; cases?: TownCase[]; rivals?: RivalCrew[]; rogue?: RogueJob[] };

function bandKm(rng: Rng, rank: number): { min: number; max: number } {
  const bands = rank >= RANK_LONG_HAUL ? [...ROUTE_BANDS, LONG_HAUL] : ROUTE_BANDS;
  let r = rng() * bands.reduce((s, b) => s + b.weight, 0);
  for (const b of bands) if ((r -= b.weight) <= 0) return b;
  return ROUTE_BANDS[0];
}

const TYPES = ['delivery', 'passenger', 'trial'] as const;
const pickType = (rng: Rng): QuestType => TYPES[Math.floor(rng() * 3)];

const twistBonus = (twist?: Twist) => (twist ? TWIST_RULES[twist].bonus : 0);

function maxGrade(type: QuestType, twist?: Twist) {
  return type === 'trial' ? TRIAL_GRADES[0].mult : (type === 'delivery' ? 1 + CARGO_BONUS : 1 + TIP_BONUS) + twistBonus(twist);
}

export class QuestGenerator {
  private nextId = 1;
  private lastEnd: Plot | null = null;
  private recent: string[] = []; // job cards shown lately, so a list never repeats one
  private town: Town;
  private content: QuestContent;
  private rng: Rng;
  private progress: Progress;
  boost: Place['kind'] | null = null; // the place kind on market day
  constructor(town: Town, content: QuestContent, rng: Rng, progress: Progress = freshProgress()) {
    this.town = town;
    this.content = content;
    this.rng = rng;
    this.progress = progress;
  }

  private place(p: Plot): string {
    return placeAt(this.town, this.content.places, p)?.name ?? 'Town Square';
  }

  private make(type: QuestType, from: Vec, car: Car, start: Plot, end: Plot, r: Route): Offer {
    const { rng } = this;
    const routeKm = r.length / 1000;
    const approachKm = route(this.town, from, start.road).length / 1000;
    const rank = rankOf(this.progress.rep);
    const pool = this.content.quests.filter((q) => q.type === type && !q.car && (!q.twist || rank >= RANK_TWISTS));
    const fresh = pool.filter((q) => !this.recent.includes(q.id));
    const card = (fresh.length ? fresh : pool)[Math.floor(rng() * (fresh.length || pool.length))];
    if (card) this.recent = [card.id, ...this.recent].slice(0, 6);
    const endName = this.place(end);
    const gateCount = type === 'trial' ? Math.max(2, Math.round(r.length / 350)) : 0;
    const gates = Array.from({ length: gateCount }, (_, i) => pointAt(r, (r.length * (i + 1)) / (gateCount + 1)));
    return {
      id: this.nextId++, type, title: card?.title ?? 'New job', text: (card?.text ?? 'Head to {dropoff}.').replace('{dropoff}', endName),
      start, end, startName: this.place(start), endName, routeKm, approachKm,
      litres: (routeKm + approachKm) * car.burn * SAFETY,
      basePay: payout(type, routeKm, 1, car.perkMult[type] ?? 1), maxPay: payout(type, routeKm, maxGrade(type, card?.twist), car.perkMult[type] ?? 1),
      route: r, gates, goldSeconds: (routeKm / trialKmh(car)) * 3600, twist: card?.twist,
    };
  }

  /** The next chapter of an unfinished story, replacing the offer of the same kind on the list. */
  private addRegular(list: Offer[]) {
    const open = (this.content.regulars ?? []).filter((r) => (this.progress.arcs[r.id] ?? 0) < r.jobs.length);
    if (!open.length || this.rng() > 0.6) return;
    const r = open[Math.floor(this.rng() * open.length)], step = this.progress.arcs[r.id] ?? 0, job = r.jobs[step];
    const at = list.findIndex((o) => o.type === job.type);
    if (at < 0) return;
    const o = list[at];
    o.title = job.title;
    o.text = job.text.replace('{dropoff}', o.endName);
    o.twist = undefined;
    o.carJob = undefined;
    o.regular = { id: r.id, name: r.name, step, total: r.jobs.length, thanks: job.thanks };
  }

  /** A delivery a business sends out itself: a shop's own goods, or a depot's load, from its door to a customer. It
   *  takes the delivery slot when a business with something to send is near enough to collect from. */
  private addBusiness(list: Offer[], from: Vec, car: Car) {
    const at = list.findIndex((o) => o.type === 'delivery' && !o.rematch && !o.carJob && !o.regular);
    if (at < 0 || this.rng() > BUSINESS_ODDS) return;
    const senders = this.town.plots.filter((p) => {
      const pl = placeAt(this.town, this.content.places, p);
      return pl && dist(p, from) < BUSINESS_REACH_M && (pl.kind === 'depot' || SHOPS.some((s) => s.id === pl.id && s.stock.length));
    });
    if (!senders.length) return;
    const start = senders[Math.floor(this.rng() * senders.length)], place = placeAt(this.town, this.content.places, start)!;
    const ends = this.town.plots.filter((p) => p !== start && dist(p, start) > 500 && dist(p, start) < 2200);
    if (!ends.length) return;
    const end = ends[Math.floor(this.rng() * ends.length)], o = this.make('delivery', from, car, start, end, route(this.town, start.road, end.road));
    if (o.approachKm > 1.2) return; // the same reach as any other offer
    const shop = SHOPS.find((s) => s.id === place.id), good = shop?.stock[Math.floor(this.rng() * shop.stock.length)];
    o.title = `${place.name} delivery`;
    o.text = good ? `An order of ${good.name} for ${o.endName}, from the shop's own shelves.` : `A load from the yard at ${place.name} for ${o.endName}.`;
    o.twist = undefined;
    o.business = place.name;
    list[at] = o;
  }

  /** A getaway job, dressed over an ordinary delivery or passenger offer, for a driver with the rank and the road sense. */
  private addRogue(list: Offer[]) {
    const pool = this.content.rogue ?? [];
    if (!pool.length || rankOf(this.progress.rep) < ROGUE_RANK || (this.progress.road?.score ?? 0) < ROGUE_SCORE || this.rng() > ROGUE_ODDS) return;
    const card = pool[Math.floor(this.rng() * pool.length)], o = list.find((x) => x.type === card.type && !x.regular && !x.carJob && !x.business && !x.rematch);
    if (!o) return;
    o.title = card.title;
    o.text = card.text.replace('{dropoff}', o.endName);
    o.twist = undefined;
    o.rogue = true;
  }

  /** A job only this car is offered, dressed over the offer of its type. */
  private addCarJob(list: Offer[], car: Car) {
    const pool = this.content.quests.filter((q) => q.car === car.id);
    if (!pool.length || rankOf(this.progress.rep) < RANK_CAR_JOBS || this.rng() > 0.6) return;
    const card = pool[Math.floor(this.rng() * pool.length)], o = list.find((x) => x.type === card.type && !x.rematch);
    if (!o) return;
    const job = CAR_JOBS[car.id as JobCar];
    o.title = card.title;
    o.text = card.text.replace('{dropoff}', o.endName);
    o.twist = undefined;
    o.carJob = car.id as JobCar;
    o.goldSeconds *= job.gold;
  }

  // Pay is set last, once each offer's final job and bonuses are known.
  private quote(o: Offer, car: Car) {
    const perk = (car.perkMult[o.type] ?? 1) * offerMult(o);
    o.basePay = payout(o.type, o.routeKm, 1, perk);
    o.maxPay = payout(o.type, o.routeKm, maxGrade(o.type, o.twist), perk);
  }

  /** A saved time trial course starting nearby comes back as a rematch against the run that set it. */
  private addRematch(list: Offer[], from: Vec, car: Car) {
    const near = this.progress.ghosts.filter((g) => dist(this.town.plots[g.s], from) / 1000 < 1);
    const at = list.findIndex((o) => o.type === 'trial');
    if (!near.length || at < 0 || this.rng() > 0.6) return;
    const g = near[Math.floor(this.rng() * near.length)], start = this.town.plots[g.s], end = this.town.plots[g.e];
    const o = this.make('trial', from, car, start, end, route(this.town, start.road, end.road));
    list[at] = { ...o, rematch: g, title: 'Beat your best', text: `Your best run to ${o.endName} is back. Catch it!` };
  }

  private build(type: QuestType, from: Vec, car: Car, band: { min: number; max: number }, maxApproachKm: number): Offer | null {
    const { town, rng } = this;
    const nearby = town.plots.filter((p) => { const d = dist(p, from) / 1000; return d > 0.04 && d < maxApproachKm * 0.8; });
    for (let t = 0; t < 12 && nearby.length; t++) {
      const start = nearby[Math.floor(rng() * nearby.length)];
      const ends = town.plots.filter((p) => { const d = dist(p, start) / 1000; return p !== start && p !== this.lastEnd && d > band.min * 0.5 && d < band.max; });
      if (!ends.length) continue;
      const end = ends[Math.floor(rng() * ends.length)];
      const r = route(town, start.road, end.road);
      if (r.length / 1000 < band.min || r.length / 1000 > band.max) continue;
      const o = this.make(type, from, car, start, end, r);
      if (o.approachKm <= maxApproachKm) return o;
    }
    return null;
  }

  /** Three offers near the player, one of each kind where possible. If none fits the tank, the shortest job replaces one. */
  offers(from: Vec, car: Car, fuel: number): Offer[] {
    const out: Offer[] = [];
    const first = Math.floor(this.rng() * 3);
    for (let t = 0; t < 40 && out.length < 3; t++) {
      // One of each kind on the list, so there is always a choice of how to drive.
      const o = this.build(TYPES[(first + out.length) % 3], from, car, bandKm(this.rng, rankOf(this.progress.rep)), 1.2);
      if (o && !out.some((p) => p.end === o.end)) out.push(o);
    }
    while (out.length < 3) out.push(this.cheapest(from, car, out));
    this.addRematch(out, from, car);
    if (!out.some((o) => o.litres <= fuel)) out[0] = this.cheapest(from, car, out.slice(1)); // after the rematch, which can be a long way off
    this.addCarJob(out, car);
    this.addBusiness(out, from, car);
    this.addRogue(out);
    this.addRegular(out);
    for (const o of out) {
      o.market = !!this.boost && placeAt(this.town, this.content.places, o.end)?.kind === this.boost;
      this.quote(o, car);
    }
    this.lastEnd = null;
    return out;
  }

  /** The shortest job from here, found by search rather than luck: this is what keeps a broke player moving. */
  private cheapest(from: Vec, car: Car, taken: Offer[]): Offer {
    const byDist = (p: Vec) => (a: Plot, b: Plot) => dist(a, p) - dist(b, p);
    let best: { start: Plot; end: Plot; r: Route; km: number } | null = null;
    for (const start of [...this.town.plots].sort(byDist(from)).slice(0, 5)) {
      const ends = this.town.plots.filter((p) => p !== start && !taken.some((o) => o.end === p) && dist(p, start) > 200).sort(byDist(start)).slice(0, 4);
      for (const end of ends) {
        const r = route(this.town, start.road, end.road);
        const km = (route(this.town, from, start.road).length + r.length) / 1000;
        if (r.length >= 250 && (!best || km < best.km)) best = { start, end, r, km };
      }
    }
    const b = best!; // the town test proves plots are close enough for this to exist
    return this.make(pickType(this.rng), from, car, b.start, b.end, b.r);
  }

  noteFinished(end: Plot) { this.lastEnd = end; }
}

export class ActiveQuest {
  phase: QuestPhase = 'HeadingToStart';
  care = 1;
  elapsed = 0;
  gate = 0;
  bumps = 0;
  track: number[] = [];
  offer: Offer;
  private sampled = 0;
  constructor(offer: Offer) { this.offer = offer; }

  /** A job picked up again from a save, where it was left. */
  static resume(offer: Offer, at: QuestState): ActiveQuest {
    const q = new ActiveQuest(offer);
    Object.assign(q, at);
    q.sampled = (at.track.length / 3) * GHOST_S;
    return q;
  }

  get state(): QuestState { return { phase: this.phase, care: this.care, elapsed: this.elapsed, gate: this.gate, bumps: this.bumps, track: [...this.track] }; }

  /** One step of the job proper: runs the clock, drains a clock twist and records a trial for its ghost. */
  tick(dt: number, p: { x: number; z: number; heading: number }) {
    this.elapsed += dt;
    const { twist, goldSeconds, type } = this.offer;
    if (twist && TWIST_RULES[twist].clock && this.elapsed > goldSeconds * CLOCK_GRACE) this.care = Math.max(0, this.care - dt / (goldSeconds * CLOCK_DRAIN));
    if (type === 'trial' && this.elapsed >= this.sampled) {
      this.track.push(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.heading * 100) / 100);
      this.sampled += GHOST_S;
    }
  }

  get target(): Vec {
    if (this.phase === 'HeadingToStart') return this.offer.start.road;
    if (this.offer.type === 'trial' && this.gate < this.offer.gates.length) return this.offer.gates[this.gate];
    return this.offer.end.road;
  }

  private rule() { return this.offer.twist ? TWIST_RULES[this.offer.twist] : null; }
  onBump() { this.bumps++; this.care = Math.max(0, this.care - CARE_PER_BUMP * (this.rule()?.bump ?? 1)); }
  onHardStop() { if (this.offer.type === 'passenger') this.care = Math.max(0, this.care - CARE_PER_HARD_STOP * (this.rule()?.stop ?? 1)); }

  /** Pay and grade name at the finish; pay 0 means the trial was missed. */
  finish(car: Car): { pay: number; grade: string } {
    const { type, routeKm, goldSeconds } = this.offer;
    const perk = (car.perkMult[type] ?? 1) * offerMult(this.offer);
    if (type === 'trial') {
      const g = TRIAL_GRADES.find((x) => this.elapsed <= goldSeconds * x.within);
      return g ? { pay: payout(type, routeKm, g.mult, perk), grade: g.name } : { pay: 0, grade: 'Missed' };
    }
    const bonus = ((type === 'delivery' ? CARGO_BONUS : TIP_BONUS) + twistBonus(this.offer.twist)) * this.care;
    return { pay: payout(type, routeKm, 1 + bonus, perk), grade: this.care > 0.85 ? 'Spotless' : this.care > 0.35 ? 'Decent' : 'Rough' };
  }

  get overTime(): boolean {
    return this.offer.type === 'trial' && this.phase === 'Active' && this.elapsed > this.offer.goldSeconds * TRIAL_GRADES[2].within;
  }
}

export { QUEST_PAY };
