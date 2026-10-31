// The game director: owns the simulation, runs it in fixed steps and emits events. It knows nothing about
// screens or sound, so tests and headless reviews run the same rules the player gets.
import { contactAt, crushLevel, NEUTRAL, PlayerCar, sideOf, type DriveIntent, type DriveState } from './car.ts';
import type { Find, Goal, GoalKind, TownEventCard } from '../../schemas/content.ts';
import { carById, RECOVERY_FEE, FIND_ALL_REWARD, FIND_REWARD, FUEL_PRICE, GOAL_REWARD, HOME_TOPUP_PCT, rankOf, rankPay, REGULAR_FINALE, REP_FINALE, REP_GOAL, REP_JOB, REP_SPOTLESS, streakBonus } from './economy.ts';
import { FuelManager } from './fuel.ts';
import { advance, freshDaily, goalsFor } from './goals.ts';
import { ActiveQuest, freshProgress, GHOST_KEEP, QuestGenerator, type Ghost, type Offer, type Progress, type QuestContent } from './quests.ts';
import { Navigator, route, routeVia, type Cue } from './route.ts';
import { dist, makeRng, Town, type Plot, type Vec } from './town.ts';
import { Traffic } from './traffic.ts';
import type { DistrictId } from './districts.ts';
import { ParkedCars } from './parked.ts';
import { freshRoad, RoadSense } from './roadsense.ts';
import type { RoadMoment } from '../../schemas/services.ts';
import { Walkers } from './walkers.ts';

export const STEP = 1 / 60;
export const DAY_S = 480; // one day and night
const DAY_START = 0.3, RAIN_BLOCK_S = 150, RAIN_ODDS = 0.3, RAIN_FADE_S = 15, FIND_ZONE = 8;
const EVENT_S = 180, EVENT_ODDS = 0.65, EVENT_MIN_EDGE = 150, ROAD_CLEAR_HOME_M = 20;
export const isNight = (frac: number) => frac > 0.8 || frac < 0.2;
const STOP_ZONE = 16, GATE_ZONE = 20, STATION_ZONE = 16, HOME_ZONE = 18, STOP_MPS = 3;
const OFF_ROUTE_M = 25, OFF_ROUTE_S = 2, REROUTE_COOLDOWN_S = 10;
const HARD_STOP_MPS2 = 11, BUMP_MPS = 4, REPAIR_S = 6; // a stop at the pump mends a dented car in about this long
const PHONE_STILL_MPS = 2, EMERGENCY_M = 200, HURT = 0.3; // parked up enough to use a phone, and how close or bad things must be for 999 to be genuine
const ROAD_STEPS = 6; // the driving record looks ten times a second, enough to catch a car crossing a line
const FIRE_CALL_MPS = 18; // a hit on a building this hard brings the fire service: about 40 mph, where a car stops being repairable, judged

export type GameEvent =
  | { type: 'fuelLow'; level: 'amber' | 'red' }
  | { type: 'tankEmpty' }
  | { type: 'cue'; cue: Cue }
  | { type: 'recalculating' }
  | { type: 'driveState'; state: DriveState }
  | { type: 'questStarted'; offer: Offer }
  | { type: 'questPhase'; label: string }
  | { type: 'questDone'; offer: Offer; pay: number; grade: string }
  | { type: 'questFailed'; offer: Offer; reason: string }
  | { type: 'points'; points: number }
  | { type: 'bump'; speed: number; by: 'wall' | 'car' }
  | { type: 'offers' }
  | { type: 'streak'; jobs: number; bonus: number; pay: number }
  | { type: 'regular'; id: string; name: string; thanks: string; finale: number }
  | { type: 'found'; find: Find; pay: number; total: number; of: number }
  | { type: 'ghost'; ghost: Ghost; beat: number | null } // beat = the old best time, if there was one
  | { type: 'hardStop' }
  | { type: 'rank'; level: number }
  | { type: 'goal'; goal: Goal; pay: number }
  | { type: 'event'; card: TownEventCard | null; edge: number }
  | { type: 'road'; moment: RoadMoment; pay: number; points: number; score: number };

/** Where Points live. The app backs this with the shared profile; tests use a number. */
export type Wallet = { points(): number; spend(n: number): boolean; earn(n: number): void };

export class Game {
  town: Town;
  player: PlayerCar;
  fuel = new FuelManager();
  quest: ActiveQuest | null = null;
  offers: Offer[] = [];
  nav: Navigator | null = null;
  waypoint: Vec | null = null;
  time = 0;
  traffic: Traffic;
  walkers: Walkers;
  parked: ParkedCars;
  road: RoadSense;
  streak = 0; // jobs finished in a row
  progress: Progress;
  content: QuestContent;
  goals: Goal[]; // today's
  event: TownEventCard | null = null;
  private eventBlock = 0;
  private events: TownEventCard[];
  private kmDriven = 0;
  private roadTick = 0;
  private gen: QuestGenerator;
  private handlers: ((e: GameEvent) => void)[] = [];
  private lastState: DriveState = 'Parked';
  private offRoute = 0;
  private lastReroute = -99;
  private lastSpeed = 0;
  private wallet: Wallet;

  constructor(content: QuestContent, wallet: Wallet, opts: { carId?: string; fuel?: number; damage?: number; seed?: number; town?: Town; start?: number; progress?: Progress; day?: string; events?: TownEventCard[] } = {}) {
    this.wallet = wallet;
    this.content = content;
    this.town = opts.town ?? new Town();
    this.player = new PlayerCar(opts.carId ?? 'hatchback', opts.fuel);
    this.player.setDamage(opts.damage ?? 0);
    this.progress = opts.progress ?? freshProgress();
    this.town.rough = -1;
    this.events = opts.events ?? [];
    const day = opts.day ?? '';
    if (this.progress.daily.day !== day) this.progress.daily = freshDaily(day);
    this.goals = goalsFor(content.goals ?? [], day);
    const seed = opts.seed ?? Date.now() % 100000;
    this.gen = new QuestGenerator(this.town, content, makeRng(seed), this.progress);
    this.goHome();
    if (opts.start !== undefined && this.town.plots[opts.start]) this.parkAt(this.town.plots[opts.start]); // a game opens wherever it was dealt; home is still where a tow goes
    this.traffic = new Traffic(this.town, makeRng(seed + 7), this.player);
    this.walkers = new Walkers(this.town, makeRng(seed + 11), this.player);
    this.parked = new ParkedCars(this.town);
    this.traffic.walkers = this.walkers;
    this.traffic.kerb = this.parked;
    this.progress.road ??= freshRoad(); // saves from before the driving record have none
    this.road = new RoadSense(this, this.progress.road);
    this.traffic.onRecovered = () => this.towHome();
    this.refreshOffers();
  }

  get rank() { return rankOf(this.progress.rep); }

  /** Something the driving record has to say, with its reward or its fine. */
  roadEvent(e: { moment: RoadMoment; pay: number; points: number }) {
    if (e.pay > 0) this.wallet.earn(e.pay);
    else if (e.pay < 0) this.wallet.spend(Math.min(-e.pay, this.wallet.points()));
    this.emit({ type: 'road', ...e, score: Math.round(this.road.rec.score) });
    if (e.pay) this.emit({ type: 'points', points: this.wallet.points() });
  }

  private gainRep(n: number) {
    const before = this.rank;
    this.progress.rep += n;
    if (this.rank > before) this.emit({ type: 'rank', level: this.rank });
  }

  private goalStep(kind: GoalKind, by = 1, best = false) {
    for (const goal of advance(this.goals, this.progress.daily, kind, by, best)) {
      this.wallet.earn(GOAL_REWARD);
      this.emit({ type: 'goal', goal, pay: GOAL_REWARD });
      this.emit({ type: 'points', points: this.wallet.points() });
      this.gainRep(REP_GOAL);
    }
  }

  /** How far through the day it is: 0 midnight, 0.5 noon. */
  get dayFrac() { return (DAY_START + this.time / DAY_S) % 1; }

  /** How hard it is raining, 0 to 1. The first stretch of a session always stays dry. */
  get rain() {
    const block = Math.floor(this.time / RAIN_BLOCK_S), into = this.time - block * RAIN_BLOCK_S;
    if (block === 0 || makeRng(block * 31)() > RAIN_ODDS) return 0;
    return Math.min(1, into / RAIN_FADE_S, (RAIN_BLOCK_S - into) / RAIN_FADE_S);
  }

  on(h: (e: GameEvent) => void) { this.handlers.push(h); }
  private emit(e: GameEvent) { for (const h of this.handlers) h(e); }

  /** Facing the road from a plot, so the first press of the pedal drives out. */
  private parkAt(p: Plot) {
    this.player.place(p.road.x, p.road.z, Math.atan2(p.road.x - p.x, p.road.z - p.z) + Math.PI / 2);
    this.player.state = 'Parked';
    this.setNav(this.waypoint); // a waypoint survives the trip, routed from the new spot
  }

  private goHome() {
    this.parkAt(this.town.home);
    this.homeTopUp();
  }

  private homeTopUp() {
    const floor = this.player.car.tank * HOME_TOPUP_PCT;
    if (this.player.fuel < floor) this.fuel.add(this.player, floor - this.player.fuel);
  }

  refreshOffers() {
    this.offers = this.gen.offers(this.player, this.player.car, this.player.fuel);
    this.emit({ type: 'offers' });
  }

  setCar(id: string, fuel?: number, damage = 0) {
    this.player.car = carById(id);
    this.player.fuel = Math.min(fuel ?? this.player.car.tank, this.player.car.tank);
    this.player.setDamage(damage);
    this.player.hit = null;
    this.refreshOffers();
  }

  private setNav(target: Vec | null) {
    this.nav = target ? new Navigator(route(this.town, this.player, target, this.player.dir)) : null;
  }

  setWaypoint(p: Vec | null) {
    this.waypoint = p ? this.town.snap(p).point : null;
    if (!this.quest) this.setNav(this.waypoint);
  }

  routeToStation() {
    this.waypoint = { ...this.town.nearestStation(this.player).road };
    if (!this.quest) this.setNav(this.waypoint);
  }

  accept(id: number) {
    const offer = this.offers.find((o) => o.id === id);
    if (!offer || this.quest) return;
    this.quest = new ActiveQuest(offer);
    this.waypoint = null;
    this.setNav(offer.start.road);
    this.emit({ type: 'questStarted', offer });
  }

  private endQuest() {
    this.quest = null;
    this.setNav(this.waypoint);
    this.refreshOffers();
  }

  failQuest(reason: string) {
    if (!this.quest) return;
    const offer = this.quest.offer;
    this.emit({ type: 'questFailed', offer, reason });
    this.streak = 0;
    this.endQuest();
  }

  /** Free and burns nothing. Any active quest is forfeited; the app confirms that first. It also ends a streak. */
  fastTravel(to: 'home' | 'station' | DistrictId) {
    this.failQuest('You fast travelled');
    this.streak = 0;
    this.road.reset();
    if (to === 'home') this.goHome();
    else if (to === 'station') this.parkAt(this.town.nearestStation(this.player));
    else this.parkAt(this.town.heart(to));
    this.refreshOffers();
  }

  acceptTow() {
    if (this.player.state === 'Stranded') this.towHome();
  }

  /** Whether there's a real emergency to report: a wreck nearby, a bad knock, or the player's own car badly hurt. */
  get emergency() {
    const p = this.player;
    return p.damage >= HURT || this.road.incident !== null || this.traffic.cars.some((c) => c.wreck > 0 && dist(c, p) < EMERGENCY_M);
  }

  /** The phone. A hand-held call while moving is an offence, except a genuine 999. Calling 999 with nothing wrong is a hoax. */
  phone(who: 'police' | 'fire' | 'ambulance' | 'recovery') {
    const p = this.player, moving = Math.abs(p.speed) > PHONE_STILL_MPS, genuine = this.emergency;
    if (moving && !(who !== 'recovery' && genuine)) this.road.phoneAtWheel();
    if (who === 'recovery') {
      if (this.traffic.recover(p) === null) return false;
      this.roadEvent({ moment: 'recovery_called', pay: p.state === 'Stranded' ? 0 : -RECOVERY_FEE, points: 0 });
      return true;
    }
    if (!genuine) this.road.hoaxCall();
    return this.traffic.call(who, p, p) !== null;
  }

  private towHome() {
    this.failQuest('The tow ended the job');
    this.streak = 0;
    this.road.reset();
    this.goHome();
    this.refreshOffers();
  }

  get atStation(): Plot | null {
    const s = this.town.nearestStation(this.player);
    return dist(s, this.player) < STATION_ZONE + 10 || dist(s.road, this.player) < STATION_ZONE ? s : null;
  }

  /** Home has a pump too: a towed player with Points must never need a station out of range. */
  get canRefuel(): boolean {
    const atPump = this.atStation !== null || dist(this.town.home.road, this.player) < HOME_ZONE;
    return atPump && Math.abs(this.player.speed) < STOP_MPS && (this.player.state === 'Driving' || this.player.state === 'Parked' || this.player.state === 'Coasting' || this.player.state === 'Stranded');
  }

  beginRefuel() {
    if (this.canRefuel) { this.player.speed = 0; this.player.state = 'Refuelling'; }
  }

  /** Buys up to `litres`, limited by the tank and the balance. Returns litres bought. */
  buyFuel(litres: number): number {
    const room = this.player.car.tank - this.player.fuel;
    const bought = Math.min(litres, room, this.wallet.points() / FUEL_PRICE);
    const cost = Math.ceil(bought * FUEL_PRICE); // part litres round up, so a fill-up reaches the brim
    if (bought <= 0 || !this.wallet.spend(cost)) return 0;
    this.fuel.add(this.player, bought);
    this.emit({ type: 'points', points: this.wallet.points() });
    return bought;
  }

  endRefuel() {
    if (this.player.state !== 'Refuelling') return;
    this.player.state = this.player.fuel > 0 ? 'Parked' : 'Stranded';
    this.refreshOffers();
  }

  step(intent: DriveIntent = NEUTRAL) {
    this.time += STEP;
    const p = this.player;
    this.lastSpeed = p.speed;
    const wall = p.step(STEP, intent, this.town), moving = this.traffic.step(STEP, p), kerb = this.parked.step(STEP, p, this.traffic.cars), crash = Math.max(moving, kerb), impact = Math.max(wall, crash);
    this.walkers.step(STEP, p, this.traffic.cars);
    const n = kerb > moving ? this.parked.crash : this.traffic.lastCrash;
    if (crash > 0 && crash >= wall && n) {
      p.hit = { x: p.x, z: p.z, nx: n.nx, nz: n.nz, speed: crash };
      p.addDent(sideOf(n.nx, n.nz, p.heading), crushLevel(n.dv, p.car.tough), contactAt(n.nx, n.nz, p.heading)); // its own change of speed: see traffic.ts
    }
    if (wall > FIRE_CALL_MPS) this.traffic.call('fire', p, p);
    if (impact > BUMP_MPS) { this.quest?.onBump(); this.emit({ type: 'bump', speed: impact, by: crash > wall ? 'car' : 'wall' }); if (crash > wall) this.road.knocked(crash); }
    else if ((this.lastSpeed - p.speed) / STEP > HARD_STOP_MPS2 + 3) { this.road.hardStop(); if (this.quest) { this.quest.onHardStop(); this.emit({ type: 'hardStop' }); } }
    if (++this.roadTick % ROAD_STEPS === 0) this.road.step(ROAD_STEPS * STEP);
    if (p.state === 'Refuelling') p.mend(p.damage - STEP / REPAIR_S);

    for (const e of this.fuel.tick(STEP, p, intent, dist(this.town.nearestStation(p), p) / 1000)) this.emit(e);

    if (p.state !== this.lastState) { this.lastState = p.state; this.emit({ type: 'driveState', state: p.state }); }
    if (p.state === 'Parked' && dist(this.town.home.road, p) < HOME_ZONE) this.homeTopUp();
    this.stepQuest();
    this.stepNav();
    this.stepFinds();
    this.stepEvent();
    if ((this.kmDriven += (Math.abs(p.speed) * STEP) / 1000) >= 0.1) { this.road.smooth(0.1); if (this.goals.length) this.goalStep('km', 0.1); this.kmDriven = 0; }
  }

  // One event at most in each stretch, chosen from the clock so a replay of the same session sees the same town.
  private stepEvent() {
    const block = Math.floor(this.time / EVENT_S);
    if (block === this.eventBlock || !this.events.length) return;
    this.eventBlock = block;
    const rng = makeRng(block * 53), card = rng() < EVENT_ODDS ? this.events[Math.floor(rng() * this.events.length)] : null;
    const wasOn = this.event !== null;
    this.event = card;
    this.town.rough = -1;
    this.gen.boost = card?.boost ?? null;
    if (card && card.kind !== 'market') {
      const long = this.town.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.len > EVENT_MIN_EDGE && this.town.segDist(this.town.home.road, e) > ROAD_CLEAR_HOME_M);
      this.town.rough = long[Math.floor(rng() * long.length)].i;
    }
    if (card || wasOn) this.emit({ type: 'event', card, edge: this.town.rough });
    const q = this.quest;
    if (this.nav && q?.phase !== 'Active') this.setNav(q ? q.target : this.waypoint);
    else if (this.nav && q && q.offer.type !== 'trial') this.setNav(q.target);
    if (!q) this.refreshOffers();
  }

  /** The hidden objects still out there. */
  get unfound(): Find[] {
    return (this.content.finds ?? []).filter((f) => !this.progress.found.includes(f.id));
  }

  private stepFinds() {
    if (Math.round(this.time / STEP) % 20 !== 0) return; // a car takes a good second to cross a zone
    for (const f of this.unfound) {
      if (dist(this.town.spots[f.spot], this.player) > FIND_ZONE) continue;
      this.progress.found.push(f.id);
      const of = this.content.finds!.length, total = this.progress.found.length;
      const pay = FIND_REWARD + (total === of ? FIND_ALL_REWARD : 0);
      this.wallet.earn(pay);
      this.emit({ type: 'found', find: f, pay, total, of });
      this.emit({ type: 'points', points: this.wallet.points() });
      this.goalStep('find');
    }
  }

  // Keeps the best run per course, and only the most recent courses.
  private keepGhost(q: ActiveQuest) {
    const { offer, track, elapsed } = q, ghosts = this.progress.ghosts;
    const s = this.town.plots.indexOf(offer.start), e = this.town.plots.indexOf(offer.end);
    const old = ghosts.find((g) => g.s === s && g.e === e);
    if (old && old.time <= elapsed) return;
    const ghost: Ghost = { s, e, time: Math.round(elapsed * 10) / 10, track };
    if (old) ghosts.splice(ghosts.indexOf(old), 1);
    ghosts.unshift(ghost);
    ghosts.length = Math.min(ghosts.length, GHOST_KEEP);
    this.emit({ type: 'ghost', ghost, beat: old?.time ?? null });
  }

  private scoreJob(q: ActiveQuest, grade: string) {
    const { type, twist } = q.offer;
    this.goalStep(type);
    this.goalStep('streak', this.streak, true);
    if (grade === 'Spotless') this.goalStep('spotless');
    if (grade === 'Gold') this.goalStep('gold');
    if (twist) this.goalStep('twist');
    if (q.bumps === 0) this.goalStep('clean');
    if (isNight(this.dayFrac)) this.goalStep('night');
    this.gainRep(REP_JOB + (grade === 'Spotless' || grade === 'Gold' ? REP_SPOTLESS : 0));
  }

  private finishRegular(r: NonNullable<Offer['regular']>) {
    this.progress.arcs[r.id] = r.step + 1;
    const finale = r.step + 1 === r.total ? REGULAR_FINALE : 0;
    if (finale) this.wallet.earn(finale);
    this.emit({ type: 'regular', id: r.id, name: r.name, thanks: r.thanks, finale });
    this.goalStep('story');
    if (finale) this.gainRep(REP_FINALE);
  }

  private stepNav() {
    const { nav, player } = this;
    if (!nav) return;
    const cue = nav.step(player, Math.abs(player.speed));
    if (cue) this.emit({ type: 'cue', cue });
    this.offRoute = nav.off > OFF_ROUTE_M ? this.offRoute + STEP : 0;
    if (this.offRoute > OFF_ROUTE_S && this.time - this.lastReroute > REROUTE_COOLDOWN_S) {
      this.lastReroute = this.time;
      this.offRoute = 0;
      const q = this.quest;
      if (q?.phase === 'Active' && q.offer.type === 'trial') this.nav = new Navigator(routeVia(this.town, player, [...q.offer.gates.slice(q.gate), q.offer.end.road], player.dir));
      else this.setNav(nav.route.points.at(-1)!);
      this.emit({ type: 'recalculating' });
    }
    if (!this.quest && this.waypoint && nav.next() === null) { this.waypoint = null; this.nav = null; }
    else if (!this.quest && this.waypoint && dist(this.waypoint, player) < 15) { this.waypoint = null; this.nav = null; }
  }

  private stepQuest() {
    const q = this.quest, p = this.player;
    if (!q) return;
    const stopped = Math.abs(p.speed) < STOP_MPS;
    if (q.phase === 'HeadingToStart') {
      if (dist(q.offer.start.road, p) < STOP_ZONE && (stopped || q.offer.type === 'trial')) {
        q.phase = 'Active';
        q.elapsed = 0;
        this.nav = new Navigator(q.offer.route);
        this.emit({ type: 'questPhase', label: q.offer.type === 'trial' ? 'Go! Hit every checkpoint' : q.offer.type === 'passenger' ? 'Passenger on board' : 'Cargo loaded' });
      }
      return;
    }
    q.tick(STEP, p);
    if (q.offer.type === 'trial') {
      if (q.gate < q.offer.gates.length && dist(q.offer.gates[q.gate], p) < GATE_ZONE) {
        q.gate++;
        this.emit({ type: 'questPhase', label: `Checkpoint ${q.gate} of ${q.offer.gates.length}` });
      }
      if (q.overTime) return this.failQuest('Out of time');
    }
    const gatesDone = q.gate >= q.offer.gates.length;
    if (gatesDone && dist(q.offer.end.road, p) < STOP_ZONE && (stopped || q.offer.type === 'trial')) {
      const done = q.finish(p.car);
      const bonus = streakBonus(this.streak), extra = Math.round(done.pay * bonus), pay = Math.round((done.pay + extra) * (1 + rankPay(this.rank) + this.road.bonus));
      this.streak = pay > 0 ? this.streak + 1 : 0;
      if (pay > 0) this.wallet.earn(pay);
      this.emit({ type: 'questDone', offer: q.offer, pay, grade: done.grade });
      if (pay > 0 && this.streak > 1) this.emit({ type: 'streak', jobs: this.streak, bonus, pay: extra });
      if (q.offer.regular && pay > 0) this.finishRegular(q.offer.regular);
      if (q.offer.type === 'trial' && pay > 0) this.keepGhost(q);
      if (pay > 0) { this.emit({ type: 'points', points: this.wallet.points() }); this.scoreJob(q, done.grade); }
      this.gen.noteFinished(q.offer.end);
      this.endQuest();
    }
  }
}

export const breadcrumbs = (g: Game, spacing = 18, count = 16): Vec[] => {
  const nav = g.nav;
  if (!nav) return [];
  const out: Vec[] = [];
  let along = nav.travelled + 10;
  const pts = nav.route;
  for (let i = 0; i < count && along < pts.length; i++, along += spacing) {
    let k = 0;
    while (k < pts.points.length - 2 && pts.cum[k + 1] < along) k++;
    const t = (along - pts.cum[k]) / (pts.cum[k + 1] - pts.cum[k]);
    const a = pts.points[k], b = pts.points[k + 1];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
};
