// Player controller: arcade car physics and the drive state machine from the design document.
// Reversing is negative speed, not a state.
import { carById, IDLE_L_PER_MIN, ROUGH_MPS, type Car } from './economy.ts';
import type { Box, Town } from './town.ts';

export type DriveIntent = { steer: number; throttle: number; brake: number; handbrake?: boolean; indicate?: -1 | 1 }; // steer -1..1, pedals 0..1; indicate is one press of the stalk, -1 left, 1 right
export const NEUTRAL: DriveIntent = { steer: 0, throttle: 0, brake: 0 };

export type DriveState = 'Parked' | 'Driving' | 'Coasting' | 'Stranded' | 'Refuelling' | 'Fading';

/** Where a crash landed: the point struck and the wall normal pointing at the car. Set only on the step it happens. */
export type Hit = { x: number; z: number; nx: number; nz: number; speed: number; box?: Box }; // box: the building, when it was one

export type Side = 'front' | 'back' | 'left' | 'right';
export const SIDES: Side[] = ['front', 'back', 'left', 'right'];

/** Which face took the blow, from the wall normal pointing at the car and the car's heading. */
export function sideOf(nx: number, nz: number, heading: number): Side {
  const f = { x: Math.sin(heading), z: Math.cos(heading) }, r = { x: -f.z, z: f.x }; // the driver's right: steering right turns the heading down
  const along = nx * f.x + nz * f.z, across = nx * r.x + nz * r.z;
  if (Math.abs(along) >= Math.abs(across)) return along < 0 ? 'front' : 'back';
  return across < 0 ? 'right' : 'left';
}

// Crash damage follows the Campbell crush line used in accident reconstruction (SAE 740565): nothing below a no-damage
// speed, about 4-5 mph on modern cars, then crush rising in a straight line with barrier-equivalent speed. A 56 km/h
// barrier test leaves roughly half a metre of crush (NHTSA NCAP), which is about half way along this line.
export const NO_DAMAGE_MPS = 2.2;
export const DAMAGE_FULL_MPS = 28; // a head-on wall hit this hard, 100 km/h, ends an ordinary car

/** Where across a side a blow lands, -1 to 1: square on is the middle, an angled hit lands on the corner nearest the wall. */
export function contactAt(nx: number, nz: number, heading: number): number {
  const f = { x: Math.sin(heading), z: Math.cos(heading) }, r = { x: -f.z, z: f.x };
  const along = nx * f.x + nz * f.z, across = nx * r.x + nz * r.z;
  const squared = Math.abs(along) >= Math.abs(across) ? -across / (Math.abs(along) || 1) : along / (Math.abs(across) || 1);
  return Math.max(-1, Math.min(1, squared * 1.6));
}

/** How bent a side ends up from one hit, 0..1: the speed into the surface hit, against how stiff this car is. */
export const crushLevel = (speed: number, tough = 1) => Math.min(1, Math.max(0, (speed - NO_DAMAGE_MPS) / (DAMAGE_FULL_MPS - NO_DAMAGE_MPS)) / tough);

/** A second hit on bent metal. It's energy that adds, and energy goes as crush squared, so repeat knocks build up slowly. */
export const addCrush = (was: number, more: number) => Math.min(1, Math.hypot(was, more));

/** One dent left on the body, for the view to fold in: where across the side, -1 to 1, and how deep, 0..1. */
export type Mark = { side: Side; at: number; depth: number };
const MAX_MARKS = 10;

const HANDBRAKE_MPS2 = 3; // it holds the rear wheels only, which do about 30% of a car's braking
const HANDBRAKE_SWING = 1.7; // with the rear tyres locked the tail steps out, so the car turns more for the same lock
const CANCEL_AFTER_RAD = 0.5; // a stalk cancels itself once the wheel comes back from a turn this big
const REVERSE_MPS = 8;
const OFFROAD_MPS = 14;
const AUTO_PARK_S = 20;

export class PlayerCar {
  x = 0; z = 0;
  heading = 0; // radians, 0 faces +z
  speed = 0; // m/s, negative when reversing
  state: DriveState = 'Parked';
  fuel: number;
  car: Car;
  throttle = 0;
  damage = 0; // 0..1, what the crash bits and the mechanic at the pump deal with
  dents: Record<Side, number> = { front: 0, back: 0, left: 0, right: 0 }; // how bent each face is, what the dents and the HUD outline show
  marks: Mark[] = []; // where those dents actually are
  indicator: -1 | 0 | 1 = 0; // the stalk: -1 left, 1 right
  handbrake = false;
  blue = false; // blue lights on: a work vehicle on its way to an emergency (careers.ts)
  private turned = 0;
  hit: Hit | null = null;
  private stopped = 0;

  constructor(carId: string, fuel?: number) {
    this.car = carById(carId);
    this.fuel = fuel ?? this.car.tank;
  }

  get kmh() { return Math.abs(this.speed) * 3.6; }
  get vMax() { return this.car.topKmh / 3.6; }
  get dir() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  place(x: number, z: number, heading: number) {
    Object.assign(this, { x, z, heading, speed: 0 });
  }

  /** Hand the car over already dented: an old dent goes on the nose, which is where it usually came from. */
  setDamage(total: number) {
    this.damage = Math.min(1, Math.max(0, total));
    this.dents = { front: this.damage, back: 0, left: 0, right: 0 };
    this.marks = this.damage > 0 ? [{ side: 'front', at: 0, depth: this.damage }] : [];
  }

  /** Mark one face. The scalar damage is what the mechanic deals with; the dents are what you can see. `across` is where on that side, -1 to 1. */
  addDent(side: Side, at: number, across = 0) {
    if (at <= 0) return;
    this.damage = addCrush(this.damage, at);
    this.dents[side] = addCrush(this.dents[side], at);
    const near = this.marks.find((m) => m.side === side && Math.abs(m.at - across) < 0.3);
    if (near) near.depth = addCrush(near.depth, at);
    else this.marks.push({ side, at: across, depth: at });
    if (this.marks.length > MAX_MARKS) this.marks.shift();
  }

  /** The pump mends the car: thin every side in the same proportion. */
  mend(total: number) {
    const to = Math.min(1, Math.max(0, total));
    const k = this.damage > 0 ? to / this.damage : 0;
    for (const s of SIDES) this.dents[s] *= k;
    for (const m of this.marks) m.depth *= k;
    this.marks = this.marks.filter((m) => m.depth > 0.005);
    this.damage = to;
  }

  /** One fixed step. Returns the impact speed when the car hit a building this step, else 0. */
  step(dt: number, intent: DriveIntent, town: Town): number {
    this.hit = null;
    this.handbrake = !!intent.handbrake;
    if (intent.indicate) { this.indicator = this.indicator === intent.indicate ? 0 : intent.indicate; this.turned = 0; }
    if (this.state === 'Refuelling' || this.state === 'Fading' || this.state === 'Stranded') { this.speed = 0; this.throttle = 0; return 0; }
    const hasFuel = this.fuel > 0;
    if (this.state === 'Parked' && hasFuel && (intent.throttle > 0 || intent.brake > 0)) this.state = 'Driving';
    if (this.state === 'Parked') { this.throttle = 0; return 0; }
    if (this.state === 'Driving' && !hasFuel) this.state = 'Coasting';
    const power = this.state === 'Driving';
    this.throttle = power ? intent.throttle : 0;

    let a = -Math.sign(this.speed) * (0.4 + 0.0008 * this.speed * this.speed); // rolling drag
    if (this.throttle === 0 && this.speed > 0) a -= 1.3; // engine braking, so lifting off slows the car
    if (power) a += intent.throttle * this.car.accel * Math.max(0, 1 - Math.max(this.speed, 0) / this.vMax);
    if (this.handbrake) a -= Math.sign(this.speed) * HANDBRAKE_MPS2;
    if (intent.brake > 0) {
      if (this.speed > 0.5) a -= 16 * intent.brake;
      else if (power) a -= 5 * intent.brake; // brake held at a stop becomes reverse
      else if (this.speed > 0) a -= 16 * intent.brake;
    }
    this.speed += a * dt;
    if (Math.abs(this.speed) < (this.handbrake ? 0.4 : 0.08) && (this.handbrake || (intent.throttle === 0 && intent.brake === 0))) this.speed = 0;
    if (!power && this.speed < 0) this.speed = 0;
    if (!(power || intent.brake > 0) && this.speed > 0 && this.speed < 0.3) this.speed = 0;
    this.speed = Math.max(-REVERSE_MPS, Math.min(this.vMax, this.speed));

    const off = town.offRoad(this);
    if (off && this.speed > OFFROAD_MPS) this.speed -= 14 * dt;
    if (this.speed > ROUGH_MPS && town.roughAt(this)) this.speed -= 12 * dt;

    const grip = Math.min(1, Math.abs(this.speed) / 5); // no turning on the spot
    const calm = 1 / (1 + (Math.abs(this.speed) / this.vMax) * 1.2); // less lock at speed
    const turn = intent.steer * this.car.steer * calm * grip * Math.sign(this.speed || 1) * (this.handbrake ? HANDBRAKE_SWING : 1) * dt;
    this.heading -= turn;
    if (this.indicator) {
      this.turned += Math.abs(turn);
      if (this.turned > CANCEL_AFTER_RAD && Math.abs(intent.steer) < 0.1) { this.indicator = 0; this.turned = 0; }
    }

    const nx = this.x + this.dir.x * this.speed * dt, nz = this.z + this.dir.z * this.speed * dt;
    const r = this.car.size[2] * 0.6;
    let impact = 0;
    const boxX = town.boxAt(nx, this.z, r), boxZ = town.boxAt(this.x, nz, r);
    if (boxX || boxZ) {
      // The wall normal points out at the car, so the view knows which end took it and where bits should fly.
      const hx = boxX ? Math.sign(this.x - boxX.x) || 1 : 0, hz = boxZ ? Math.sign(this.z - boxZ.z) || 1 : 0, nl = Math.hypot(hx, hz);
      const f = this.dir, nose = Math.sign(this.speed) * (this.car.size[0] / 2);
      impact = Math.abs(this.speed * (f.x * hx + f.z * hz)) / nl; // only the speed into the wall bends metal; a glancing scrape keeps the rest
      this.hit = { x: this.x + f.x * nose, z: this.z + f.z * nose, nx: hx, nz: hz, speed: impact, box: boxX ?? boxZ ?? undefined };
      this.addDent(sideOf(hx, hz, this.heading), crushLevel(impact, this.car.tough), contactAt(hx / nl, hz / nl, this.heading));
      this.speed *= boxX && boxZ ? -0.25 : 0.55; // glancing blows scrape along the wall
    }
    if (!boxX) this.x = Math.max(4, Math.min(2996, nx));
    if (!boxZ) this.z = Math.max(4, Math.min(2996, nz));

    this.stopped = this.speed === 0 && intent.throttle === 0 && intent.brake === 0 ? this.stopped + dt : 0;
    if (this.state === 'Driving' && this.stopped > AUTO_PARK_S) this.state = 'Parked';
    if (this.state === 'Coasting' && this.speed === 0) this.state = 'Stranded';
    return impact;
  }
}

export const litresPerSecond = (burn: number, kmh: number, throttle: number) =>
  IDLE_L_PER_MIN / 60 + burn * (kmh / 3600) * (0.7 + 0.6 * throttle);
