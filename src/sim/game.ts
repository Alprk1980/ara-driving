// The game director: owns the simulation, runs it in fixed steps and emits events. It knows nothing about
// screens or sound, so tests and headless reviews run the same rules the player gets.
import { afterEating, afterRun, TIRED_AT } from './energy.ts';
import { contactAt, crushLevel, NEUTRAL, PlayerCar, sideOf, type DriveIntent, type DriveState, type Mark, type Side } from './car.ts';
import type { Find, Goal, GoalKind, TownEventCard } from '../../schemas/content.ts';
import { BUS_FARE, carById, RECOVERY_FEE, FIND_ALL_REWARD, FIND_REWARD, FUEL_PRICE, GOAL_REWARD, HOME_TOPUP_PCT, rankOf, rankPay, REGULAR_FINALE, REP_FINALE, REP_GOAL, REP_JOB, REP_SPOTLESS, streakBonus } from './economy.ts';
import { FuelManager } from './fuel.ts';
import { advance, freshDaily, goalsFor } from './goals.ts';
import { ActiveQuest, freshProgress, GHOST_KEEP, placeAt, QuestGenerator, storyPlot, type Ghost, type Offer, type Progress, type QuestContent, type QuestState } from './quests.ts';
import { Navigator, route, routeVia, type Cue } from './route.ts';
import { dist, makeRng, Town, type BusStop, type Plot, type Vec } from './town.ts';
import { HAIL_M, Traffic, type TrafficCar } from './traffic.ts';
import { doorNear, findDoors, type Door } from './doors.ts';
import type { DistrictId } from './districts.ts';
import { ParkedCars } from './parked.ts';
import { freshRoad, RoadSense } from './roadsense.ts';
import type { RoadMoment } from '../../schemas/services.ts';
import { Walkers } from './walkers.ts';
import { doorBlocked, doorOf, OnFoot, STILL_MPS } from './onfoot.ts';
import type { CarBox } from './collide.ts';
import { CALL_RING_M, careerBases, Shift, type Base, type ShiftWorld } from './careers.ts';
import { CAREERS, careerRank, type CareerId } from '../../schemas/careers.ts';
import type { FleetId } from '../../schemas/fleet.ts';

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
const SOLID_NEAR_M = 9, BOARD_M = 15; // a bus's doors are at its front, up to about 6 m from the pole, or further when it stopped short of a blocked stop
const BASE_M = 22, SHIFT_REROUTE_S = 3; // close enough to a base's front to sign on; how often the sat nav follows a moving driver
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
  | { type: 'road'; moment: RoadMoment; pay: number; points: number; score: number }
  | { type: 'goodDriving'; pay: number }
  | { type: 'foot'; out: boolean }
  | { type: 'bus'; what: 'on' | 'bell' | 'off'; fare: number }
  | { type: 'shift'; what: 'on' | 'off'; career: CareerId; earned: number }
  | { type: 'shiftPaid'; title: string; pay: number; onTime: boolean; note: string }
  | { type: 'shiftPhase'; label: string }
  | { type: 'careerRank'; career: CareerId; rank: number };

/** Where the drive was left: the car on the road, the clock, the job and the sat nav. Saved beside the progress, so a
 * reload carries on where it stopped. A job's places are kept as indexes into the town's plots, which a fixed seed rebuilds the same. */
export type Trip = {
  car: string; x: number; z: number; heading: number; time: number; streak: number;
  waypoint: Vec | null; dest: string | null;
  dents: Record<Side, number>; marks: Mark[];
  quest: { offer: Omit<Offer, 'start' | 'end'> & { start: number; end: number }; at: QuestState } | null;
  foot?: { x: number; z: number; heading: number } | null; // out of the car, and where; saves from before walking have none
  energy?: number; // running energy, 0-1; saves from before it existed start full
};

/** Where Points live. The app backs this with the shared profile; tests use a number. `why` is what the history shows. */
export type Wallet = { points(): number; spend(n: number, why?: string): boolean; earn(n: number, why?: string): void };

/** What each moment on the road reads as in the Points history. */
const ROAD_WHY: Partial<Record<RoadMoment, string>> = { red_stop: 'Waited at a red light', zebra_wait: 'Waited at a zebra', blue_pull: 'Made way for blue lights', pulled_over: 'Police fine', course: 'Driver course', recovery_called: 'Recovery truck' };

export class Game {
  town: Town;
  player: PlayerCar;
  fuel = new FuelManager();
  quest: ActiveQuest | null = null;
  offers: Offer[] = [];
  nav: Navigator | null = null;
  waypoint: Vec | null = null;
  dest: string | null = null; // what the sat nav calls the waypoint
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
  foot: OnFoot | null = null; // out of the car and walking; the car stays where it was left
  energy = 1; // for running, 0-1: see energy.ts
  ride: { bus: TrafficCar; rang: boolean } | null = null; // on a bus, and whether you've rung for the next stop
  shift: Shift | null = null; // signed on at work, in the service's vehicle
  private own: { id: string; fuel: number; damage: number; dents: Record<Side, number>; marks: Mark[] } | null = null; // your car, in the staff car park while you work
  private baseList: Base[] | null = null;
  private shiftTask: unknown = null;
  private shiftNavAt = 0;
  private doorList: Door[] | null = null;
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

  constructor(content: QuestContent, wallet: Wallet, opts: { carId?: string; fuel?: number; damage?: number; seed?: number; town?: Town; start?: number; progress?: Progress; day?: string; events?: TownEventCard[]; trip?: Trip | null } = {}) {
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
    this.town.fitPlaces((p) => placeAt(this.town, content.places, p)?.kind, (content.regulars ?? []).map((_, i) => storyPlot(this.town, i)));
    const seed = opts.seed ?? Date.now() % 100000;
    this.gen = new QuestGenerator(this.town, content, makeRng(seed), this.progress);
    this.goHome();
    if (opts.start !== undefined && this.town.plots[opts.start]) this.parkAt(this.town.plots[opts.start]); // a game opens wherever it was dealt; home is still where a tow goes
    if (opts.trip) this.resume(opts.trip); // before the traffic, which fills the streets round the car
    this.traffic = new Traffic(this.town, makeRng(seed + 7), this.player);
    this.walkers = new Walkers(this.town, makeRng(seed + 11), this.player);
    this.parked = new ParkedCars(this.town);
    this.traffic.walkers = this.walkers;
    this.traffic.kerb = this.parked;
    this.progress.road ??= freshRoad(); // saves from before the driving record have none
    this.road = new RoadSense(this, this.progress.road);
    this.traffic.onRecovered = () => this.towHome();
    this.traffic.onIncident = (w, role) => { const s = this.shift; return !!s && CAREERS[s.career].base === role && s.incident(w, this.player); };
    this.refreshOffers();
  }

  get rank() { return rankOf(this.progress.rep); }

  /** Where you are: on foot, or in the car. The town keeps its traffic and people round this. */
  get here(): Vec { return this.foot ?? this.player; }

  /** Why the door won't open just now, or null if you can get out. */
  get cantGetOut(): string | null {
    const p = this.player;
    if (this.foot) return 'You are already out';
    if (Math.abs(p.speed) > STILL_MPS) return 'Stop the car first';
    if (p.state === 'Refuelling') return 'Finish at the pump first';
    if (doorBlocked(doorOf(p, this.town), p, this.traffic.cars)) return 'Car coming: wait for it to pass';
    return null;
  }

  /** Out of the car by its door, which stays parked where it is with the engine off. */
  getOut(): boolean {
    if (this.cantGetOut) return false;
    const p = this.player;
    p.speed = 0;
    p.indicator = 0;
    if (p.state !== 'Stranded') p.state = 'Parked';
    this.foot = new OnFoot(doorOf(p, this.town));
    this.emit({ type: 'foot', out: true });
    return true;
  }

  /** Where each career signs on. */
  get bases(): Base[] { return (this.baseList ??= careerBases(this.town, this.content.places, (p) => placeAt(this.town, this.content.places, p))); }

  /** The station or depot you're at: on foot by its front, or stopped outside in the car. */
  get atBase(): Base | null {
    if (this.ride) return null;
    const here = this.here, still = this.foot || Math.abs(this.player.speed) < STOP_MPS;
    return still ? this.bases.find((b) => dist(b.at, here) < BASE_M) ?? null : null;
  }

  /** Your own car's fuel and dents, whether you're in it or at work. */
  get yours(): { fuel: number; damage: number } { return this.own ?? { fuel: this.player.fuel, damage: this.player.damage }; }

  /** The vehicles a career's rank lets you take out. */
  vehiclesFor(career: CareerId): FleetId[] { return CAREERS[career].ranks[careerRank(this.progress.careers?.[career] ?? 0)].vehicles; }

  /** Sign on at the base you're at and take out one of its vehicles: your car goes to the staff car park. A job you
   *  were on is handed back first. */
  signOn(career: CareerId, vehicle?: FleetId): boolean {
    const base = this.atBase;
    if (!base || base.career !== career || this.shift) return false;
    const allowed = this.vehiclesFor(career), take = vehicle && allowed.includes(vehicle) ? vehicle : allowed[0];
    this.failQuest('You signed on for a shift');
    const p = this.player;
    this.own = { id: p.car.id, fuel: p.fuel, damage: p.damage, dents: { ...p.dents }, marks: p.marks.map((m) => ({ ...m })) };
    this.backIn();
    p.car = carById(take);
    p.fuel = p.car.tank;
    p.setDamage(0);
    p.hit = null;
    p.place(base.at.x, base.at.z, base.heading);
    p.state = 'Parked';
    this.waypoint = null;
    this.dest = null;
    this.shift = new Shift(career, take, base, this.progress.careers?.[career] ?? 0, this.shiftWorld(), base.at);
    this.shiftTask = null;
    this.offers = [];
    this.emit({ type: 'offers' });
    this.emit({ type: 'shift', what: 'on', career, earned: 0 });
    return true;
  }

  /** Hand the vehicle back and walk out to your own car, which is waiting outside the base. */
  signOff() {
    const s = this.shift, own = this.own;
    if (!s || !own) return;
    if (s.rider) { s.rider.riding = false; s.rider.lift = 0; if ('homeX' in s.rider) this.parked.collected(s.rider); else this.traffic.dropWreck(s.rider); }
    const t = s.task;
    if (t?.offender) this.traffic.pullOver(t.offender, false);
    this.shift = null;
    this.own = null;
    const p = this.player;
    p.blue = false;
    p.car = carById(own.id);
    p.fuel = own.fuel;
    p.damage = own.damage;
    p.dents = own.dents;
    p.marks = own.marks;
    p.hit = null;
    p.place(s.base.at.x, s.base.at.z, s.base.heading);
    p.state = 'Parked';
    this.backIn();
    this.nav = null;
    this.emit({ type: 'shift', what: 'off', career: s.career, earned: s.earned });
    this.refreshOffers();
  }

  /** What a shift reaches into: the town, its people and its traffic. */
  private shiftWorld(): ShiftWorld {
    const rng = makeRng(Math.floor(this.time * 1000) + 17);
    return {
      town: this.town, places: this.content.places, calls: this.content.calls ?? [], rng, plots: this.town.plots,
      placeOf: (p) => placeAt(this.town, this.content.places, p),
      breakdown: (near) => {
        const list = this.parked.cars.filter((c) => !c.drive && !c.riding && !c.touched && dist(c, near) > CALL_RING_M[0] && dist(c, near) < CALL_RING_M[1]);
        return list.length ? list[Math.floor(rng() * list.length)] : null;
      },
      offender: (near) => this.traffic.offender(near),
      pullOver: (c, on) => this.traffic.pullOver(c, on),
      board: (s) => this.walkers.board(s, this.player),
      sendRecovery: (k) => { this.traffic.call('recovery', k, k, null, { kerb: k }); },
      collected: (k) => this.parked.collected(k),
      dropWreck: (w) => this.traffic.dropWreck(w),
    };
  }

  private stepShift() {
    const s = this.shift, p = this.player;
    if (!s) { p.blue = false; return; }
    for (const e of s.step(STEP, p)) {
      if (e.type === 'phase') this.emit({ type: 'shiftPhase', label: e.label });
      else if (e.type === 'paid') {
        this.wallet.earn(e.pay, `${CAREERS[s.career].name}: ${e.task.title}`);
        const jobs = ((this.progress.careers ??= {})[s.career] ?? 0) + 1;
        this.progress.careers[s.career] = jobs;
        this.emit({ type: 'shiftPaid', title: e.task.title, pay: e.pay, onTime: e.onTime, note: e.note });
        this.emit({ type: 'points', points: this.wallet.points() });
        this.gainRep(REP_JOB);
        const up = s.promote(jobs);
        if (up?.type === 'rank') this.emit({ type: 'careerRank', career: up.career, rank: up.rank });
      } else if (e.type === 'done') { this.signOff(); return; }
    }
    p.blue = s.blue;
    const t = s.task;
    if (t !== this.shiftTask || (t?.kind === 'pull' && this.time - this.shiftNavAt > SHIFT_REROUTE_S)) { // a new task, or a driver on the move
      this.shiftTask = t;
      this.shiftNavAt = this.time;
      this.setNav(t ? t.at : null);
    }
  }

  /** The named places' front doors. */
  get doors(): Door[] { return (this.doorList ??= findDoors(this.town, (this.content.regulars ?? []).map((_, i) => storyPlot(this.town, i)))); }

  /** The door you're standing at, on foot. */
  get atDoor(): Door | null { return this.foot && !this.ride ? doorNear(this.doors, this.foot) : null; }

  /** The stop you're waiting at, on foot: the driver sees you and pulls in. */
  get atStop(): BusStop | null {
    const f = this.foot;
    if (!f || this.ride) return null;
    for (const r of this.town.routes) for (const s of r.stops) if (dist(s, f) < HAIL_M) return s;
    return null;
  }

  /** The routes calling at the stop you're at, and how many seconds until each one's bus, soonest first: the stop's
   *  countdown board. Null when you're not at a stop. */
  get stopBoard(): { name: string; via: string; due: number | null }[] | null {
    const at = this.atStop;
    if (!at) return null;
    return this.town.routesAt(at).map((r) => {
      const s = r.stops.find((q) => dist(q, at) < 6)!;
      return { name: r.name, via: r.via, due: this.traffic.due(s) };
    }).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  }

  /** The route of the bus you're riding. */
  get rideRoute() { return this.ride ? this.town.routes[this.ride.bus.route] : null; }

  /** A bus stopped at your stop with its doors open. */
  get busHere(): TrafficCar | null {
    const s = this.atStop;
    return s ? this.traffic.cars.find((c) => c.role === 'bus' && c.dwell > 0 && dist(c, s) < BOARD_M) ?? null : null;
  }

  /** On, and pay the driver. False if there's no bus or not enough Points. */
  board(fare = BUS_FARE): boolean {
    const bus = this.busHere;
    if (!bus || (fare > 0 && !this.wallet.spend(fare, 'Bus fare'))) return false;
    this.ride = { bus, rang: false };
    bus.dwell = Math.max(bus.dwell, 3.5); // time to tap a card and find a seat, as each passenger gets
    this.emit({ type: 'bus', what: 'on', fare });
    if (fare) this.emit({ type: 'points', points: this.wallet.points() });
    return true;
  }

  /** Eat or drink something: its kcal go back into the running bar. */
  eat(kcal: number) {
    this.energy = afterEating(this.energy, kcal);
  }

  /** Ring once for the next stop. */
  ringBell(): boolean {
    if (!this.ride || this.ride.rang) return false;
    this.ride.rang = true;
    this.emit({ type: 'bus', what: 'bell', fare: 0 });
    return true;
  }

  /** Off the bus by its doors, onto the pavement, once it's stopped. */
  getOff(): boolean {
    const r = this.ride;
    if (!r || (r.bus.dwell <= 0 && r.bus.wreck <= 0 && !r.bus.dormant)) return false;
    this.alight();
    return true;
  }

  /** Where you step off: the front doors on the nearside, the left, as on UK buses. */
  private alightAt(bus: TrafficCar): Vec & { heading: number } {
    const fx = Math.sin(bus.heading), fz = Math.cos(bus.heading), out = bus.halfW + 1.2, fwd = bus.halfL - 2;
    const spot = { x: bus.x + fx * fwd + fz * out, z: bus.z + fz * fwd - fx * out, heading: bus.heading };
    return this.town.boxAt(spot.x, spot.z, 0.3) ? { x: bus.x + fx * (bus.halfL + 1), z: bus.z + fz * (bus.halfL + 1), heading: bus.heading } : spot;
  }

  private alight() {
    const r = this.ride!, f = this.foot!, at = this.alightAt(r.bus);
    Object.assign(f, { x: at.x, z: at.z, heading: at.heading, speed: 0 });
    this.ride = null;
    this.emit({ type: 'bus', what: 'off', fare: 0 });
  }

  /** Back in, if you're near enough to the car. */
  getIn(): boolean {
    if (!this.foot || this.ride || !this.foot.canReach(this.player)) return false;
    this.backIn();
    return true;
  }

  /** Into the car wherever it is: a tow or fast travel takes it, and you with it. */
  private backIn() {
    if (!this.foot) return;
    this.foot = null;
    this.ride = null;
    this.emit({ type: 'foot', out: false });
  }

  /** Something the driving record has to say, with its reward or its fine. */
  roadEvent(e: { moment: RoadMoment; pay: number; points: number }) {
    const why = ROAD_WHY[e.moment] ?? 'On the road';
    if (e.pay > 0) this.wallet.earn(e.pay, why);
    else if (e.pay < 0) this.wallet.spend(Math.min(-e.pay, this.wallet.points()), why);
    this.emit({ type: 'road', ...e, score: Math.round(this.road.rec.score) });
    if (e.pay) this.emit({ type: 'points', points: this.wallet.points() });
  }

  /** A clean stretch of driving, paid as you go. */
  goodDriving(pay: number) {
    this.wallet.earn(pay, 'Clean driving');
    this.emit({ type: 'goodDriving', pay });
    this.emit({ type: 'points', points: this.wallet.points() });
  }

  private gainRep(n: number) {
    const before = this.rank;
    this.progress.rep += n;
    if (this.rank > before) this.emit({ type: 'rank', level: this.rank });
  }

  private goalStep(kind: GoalKind, by = 1, best = false) {
    for (const goal of advance(this.goals, this.progress.daily, kind, by, best)) {
      this.wallet.earn(GOAL_REWARD, `Goal: ${goal.text}`);
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
    this.offers = this.shift ? [] : this.gen.offers(this.player, this.player.car, this.player.fuel);
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

  setWaypoint(p: Vec | null, name = 'Waypoint') {
    this.waypoint = p ? this.town.snap(p).point : null;
    this.dest = p ? name : null;
    if (!this.quest) this.setNav(this.waypoint);
  }

  routeToStation() {
    this.setWaypoint(this.town.nearestStation(this.player).road, 'Petrol station');
  }

  /** Every place a job, a tow or the sat nav can name: home, the petrol stations, then the town's plots. */
  private get allPlots(): Plot[] { return [this.town.home, ...this.town.stations, ...this.town.plots]; }

  snapshot(): Trip {
    const p = this.player, q = this.quest, all = this.allPlots, s = this.shift, own = this.own;
    if (s && own) return { // a shift isn't saved: a reload finds you back in your own car outside the base
      car: own.id, x: s.base.at.x, z: s.base.at.z, heading: s.base.heading, time: this.time, streak: this.streak, waypoint: null, dest: null,
      dents: { ...own.dents }, marks: own.marks.map((m) => ({ ...m })), quest: null, energy: this.energy, foot: null,
    };
    return {
      car: p.car.id, x: p.x, z: p.z, heading: p.heading, time: this.time, streak: this.streak,
      waypoint: this.waypoint, dest: this.dest, dents: { ...p.dents }, marks: p.marks.map((m) => ({ ...m })),
      quest: q ? { offer: { ...q.offer, start: all.indexOf(q.offer.start), end: all.indexOf(q.offer.end) }, at: q.state } : null,
      energy: this.energy,
      foot: this.ride ? this.alightAt(this.ride.bus) : this.foot ? { x: this.foot.x, z: this.foot.z, heading: this.foot.heading } : null, // a reload puts you off the bus at the kerb
    };
  }

  /** Pick a saved drive up again. A job whose places can't be found any more is dropped, not half-restored. */
  private resume(t: Trip) {
    const p = this.player, all = this.allPlots;
    p.place(t.x, t.z, t.heading);
    p.state = 'Parked';
    this.time = t.time;
    this.streak = t.streak;
    if (t.car === p.car.id) { p.dents = { ...t.dents }; p.marks = t.marks.map((m) => ({ ...m })); }
    const start = t.quest ? all[t.quest.offer.start] : undefined, end = t.quest ? all[t.quest.offer.end] : undefined;
    if (t.quest && start && end) {
      this.quest = ActiveQuest.resume({ ...t.quest.offer, start, end }, t.quest.at);
      this.setNav(this.quest.target);
    }
    if (t.foot) this.foot = new OnFoot(t.foot);
    if (t.energy !== undefined) this.energy = t.energy;
    this.waypoint = t.waypoint;
    this.dest = t.waypoint ? t.dest : null;
    if (!this.quest) this.setNav(this.waypoint);
  }

  accept(id: number) {
    const offer = this.offers.find((o) => o.id === id);
    if (!offer || this.quest) return;
    this.quest = new ActiveQuest(offer);
    this.waypoint = null;
    this.dest = null;
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
    this.signOff();
    this.failQuest('You fast travelled');
    this.backIn();
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
    this.signOff();
    this.failQuest('The tow ended the job');
    this.backIn();
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
    if (bought <= 0 || !this.wallet.spend(cost, `Fuel, ${Math.round(bought)} L`)) return 0;
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
    const p = this.player, foot = this.foot, here = this.here;
    this.lastSpeed = p.speed;
    const walking = this.ride ? null : foot; // on a bus you're not in anyone's way
    this.traffic.you = this.walkers.you = walking;
    this.traffic.hailing = this.atStop;
    this.traffic.rider = this.ride;
    const wall = p.step(STEP, foot ? NEUTRAL : intent, this.town), moving = this.traffic.step(STEP, p, here), kerb = this.parked.step(STEP, p, this.traffic.cars), crash = Math.max(moving, kerb), impact = Math.max(wall, crash);
    this.walkers.step(STEP, p, this.traffic.cars, here);
    if (walking) {
      const was = { x: walking.x, z: walking.z };
      walking.step(STEP, intent, this.town, this.solidNear(walking), this.energy <= TIRED_AT);
      if (walking.running) this.energy = afterRun(this.energy, dist(was, walking));
    }
    else if (foot) this.stepRide(foot);
    const n = kerb > moving ? this.parked.crash : this.traffic.lastCrash;
    if (crash > 0 && crash >= wall && n) {
      p.hit = { x: p.x, z: p.z, nx: n.nx, nz: n.nz, speed: crash };
      p.addDent(sideOf(n.nx, n.nz, p.heading), crushLevel(n.dv, p.car.tough), contactAt(n.nx, n.nz, p.heading)); // its own change of speed: see traffic.ts
    }
    if (wall > FIRE_CALL_MPS) this.traffic.call('fire', p, p);
    if (impact > BUMP_MPS) { this.quest?.onBump(); this.emit({ type: 'bump', speed: impact, by: crash > wall ? 'car' : 'wall' }); if (crash > wall) this.road.knocked(crash); else this.road.scraped(); }
    else if ((this.lastSpeed - p.speed) / STEP > HARD_STOP_MPS2 + 3) { this.road.hardStop(); if (this.quest) { this.quest.onHardStop(); this.emit({ type: 'hardStop' }); } }
    if (++this.roadTick % ROAD_STEPS === 0 && !foot) this.road.step(ROAD_STEPS * STEP); // the driving record rests while you walk
    if (p.state === 'Refuelling') p.mend(p.damage - STEP / REPAIR_S);

    for (const e of this.fuel.tick(STEP, p, intent, dist(this.town.nearestStation(p), p) / 1000)) this.emit(e);

    if (p.state !== this.lastState) { this.lastState = p.state; this.emit({ type: 'driveState', state: p.state }); }
    if (p.state === 'Parked' && dist(this.town.home.road, p) < HOME_ZONE) this.homeTopUp();
    this.stepQuest();
    this.stepShift();
    this.stepNav();
    this.stepFinds();
    this.stepEvent();
    if ((this.kmDriven += (Math.abs(p.speed) * STEP) / 1000) >= 0.1) { this.road.smooth(0.1); if (this.goals.length) this.goalStep('km', 0.1); this.kmDriven = 0; }
  }

  /** Carried along in your seat. The bus pulls in where you rang, and you get off; one taken off the road puts you off where it is. */
  private stepRide(foot: OnFoot) {
    const r = this.ride!, b = r.bus;
    Object.assign(foot, { x: b.x, z: b.z, heading: b.heading, speed: 0 });
    if (b.dormant || b.wreck > 0 || (r.rang && b.dwell > 0)) this.alight();
  }

  /** The cars you could walk into: your own, the traffic and those parked at the kerb. */
  private solidNear(at: Vec): CarBox[] {
    const p = this.player, out: CarBox[] = [{ x: p.x, z: p.z, heading: p.heading, halfL: p.car.size[0] / 2, halfW: p.car.size[2] / 2 }];
    for (const c of [...this.traffic.cars, ...this.parked.cars]) if (!('dormant' in c && c.dormant) && dist(c, at) < SOLID_NEAR_M) out.push(c);
    return out;
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
      if (dist(this.town.spots[f.spot], this.here) > FIND_ZONE) continue; // on foot counts: you can walk to one
      this.progress.found.push(f.id);
      const of = this.content.finds!.length, total = this.progress.found.length;
      const pay = FIND_REWARD + (total === of ? FIND_ALL_REWARD : 0);
      this.wallet.earn(pay, 'Hidden find');
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
    if (finale) this.wallet.earn(finale, `${r.name}'s story`);
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
    if (!this.quest && !this.shift && this.waypoint && (nav.next() === null || dist(this.waypoint, player) < 15)) { this.waypoint = null; this.dest = null; this.nav = null; }
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
      if (pay > 0) this.wallet.earn(pay, `Job: ${q.offer.title}`);
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
