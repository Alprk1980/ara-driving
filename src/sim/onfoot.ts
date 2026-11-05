// You, out of the car and on foot. The same controls drive it: forward walks, back steps backward, steer turns you.
//
// Speeds: people walk at about 1.4 m/s by choice (the walkers here use 1.05-1.55 m/s from pedestrian studies), and
// switch to a run at about 2 m/s, the preferred walk-to-run speed found again and again on treadmills (Hreljac 1993 and
// later work). A casual jog is about 2.2-3.3 m/s from running guides, a weak source, so 3 m/s is an example. A runner
// takes about 165 steps a minute, so a step at 3 m/s is about 1.1 m (cadence, judged from common running figures).
// Your body is about 0.46 by 0.61 m across, Fruin's body ellipse in pedestrian design, so you take up a 0.3 m circle.
//
// Getting out: in a right-hand-drive car you get out on the right, the road side. Highway Code rule 239 says you must
// not open a door so as to hit or endanger anyone, and should open it with the far hand (the "Dutch reach") so you
// turn and look behind. So the door waits while a car is coming up close behind on that side. If a wall is in the
// way, you slide across and get out the other side.
import type { DriveIntent, PlayerCar } from './car.ts';
import { carsOverlap, type CarBox } from './collide.ts';
import type { Town, Vec } from './town.ts';
import { STRIDE_M } from './walkers.ts';

export const FOOT_WALK_MPS = 1.5, FOOT_RUN_MPS = 3, RUN_STEP_M = 1.1;
const BACK_SHARE = 0.5, TURN_RAD_S = 3, FOOT_MPS2 = 4; // stepping backward is slower; how quickly you turn and get going are judged
const RUN_AFTER_S = 2.5; // hold forward this long and you break into a run, for the controls with no run button; judged
export const BODY_R = 0.3;
const DOOR_GAP_M = 0.55, REACH_M = 1.8; // where you stand by the door, and how close you must be to get back in; judged
export const STILL_MPS = 0.3; // the car has to be at a stop before a door opens
const DOOR_LOOK_M = 30, DOOR_SIDE_M = 3.5, DOOR_CLOSING_MPS = 2; // a car this close behind, this near the door's side and closing, keeps it shut

const solidAt = (town: Town, x: number, z: number) => town.boxAt(x, z, BODY_R) !== null;

/** Where you stand to get out of or into this car, beside the driver's door (the car's right) or, if that's in a wall, the left. */
export function doorOf(car: PlayerCar, town: Town): Vec & { heading: number } {
  const f = car.dir, r = { x: -f.z, z: f.x }, out = car.car.size[2] / 2 + DOOR_GAP_M; // r is the driver's right, as in car.ts
  for (const s of [1, -1]) {
    const x = car.x + r.x * out * s, z = car.z + r.z * out * s;
    if (!solidAt(town, x, z)) return { x, z, heading: car.heading }; // facing the way the car does, so the camera starts alongside it
  }
  return { x: car.x, z: car.z, heading: car.heading };
}

/** A car coming up behind, close to the side the door opens on: rule 239 keeps the door shut until it's by. */
export function doorBlocked(door: Vec, car: PlayerCar, traffic: readonly (Vec & { heading: number; speed: number })[]): boolean {
  return traffic.some((c) => {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading), dx = door.x - c.x, dz = door.z - c.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    return c.speed > DOOR_CLOSING_MPS && ahead > 0 && ahead < DOOR_LOOK_M && side < DOOR_SIDE_M && Math.hypot(c.x - car.x, c.z - car.z) > 1;
  });
}

export class OnFoot {
  x: number; z: number;
  heading: number; // 0 faces +z, as the car's does
  speed = 0; // m/s along the heading, negative stepping back
  phase = 0; // through the stride, for the figure's legs
  running = false;
  private held = 0;

  constructor(at: Vec & { heading: number }) {
    this.x = at.x;
    this.z = at.z;
    this.heading = at.heading;
  }

  get dir() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  /** Close enough to the car to open its door. */
  canReach(car: PlayerCar): boolean {
    const box: CarBox = { x: car.x, z: car.z, heading: car.heading, halfL: car.car.size[0] / 2 + REACH_M, halfW: car.car.size[2] / 2 + REACH_M };
    return carsOverlap(box, { x: this.x, z: this.z, heading: 0, halfL: 0.01, halfW: 0.01 }) !== null;
  }

  /** `solid`: the cars near you, parked or moving, which you step round and which nudge you aside. `tired`: out of
   *  energy, so you walk however hard you push. */
  step(dt: number, intent: DriveIntent, town: Town, solid: readonly CarBox[] = [], tired = false) {
    this.heading -= intent.steer * TURN_RAD_S * dt; // steering right turns the heading down, as in car.ts
    const forward = intent.throttle > 0.05;
    this.held = forward && intent.throttle > 0.5 ? this.held + dt : 0;
    this.running = !tired && forward && intent.throttle > 0.5 && (!!intent.handbrake || this.held > RUN_AFTER_S);
    const want = forward ? intent.throttle * (this.running ? FOOT_RUN_MPS : FOOT_WALK_MPS) : -intent.brake * FOOT_WALK_MPS * BACK_SHARE;
    this.speed += Math.max(-FOOT_MPS2 * dt, Math.min(FOOT_MPS2 * dt, want - this.speed));
    const f = this.dir, mx = f.x * this.speed * dt, mz = f.z * this.speed * dt;
    if (!solidAt(town, this.x + mx, this.z + mz)) { this.x += mx; this.z += mz; } // slide along a wall, not stick to it
    else if (!solidAt(town, this.x + mx, this.z)) this.x += mx;
    else if (!solidAt(town, this.x, this.z + mz)) this.z += mz;
    const me: CarBox = { x: this.x, z: this.z, heading: this.heading, halfL: BODY_R, halfW: BODY_R };
    for (const c of solid) {
      const o = carsOverlap(c, me);
      if (!o || solidAt(town, this.x + o.nx * o.depth, this.z + o.nz * o.depth)) continue;
      this.x = me.x += o.nx * o.depth;
      this.z = me.z += o.nz * o.depth;
    }
    this.phase += (Math.abs(this.speed) / (this.running ? RUN_STEP_M : STRIDE_M)) * Math.PI * dt;
  }
}
