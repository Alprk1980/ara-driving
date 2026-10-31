// Cars left at the kerb and on drives, which are heavy things to shove rather than walls. A knock is shared by weight as an
// inelastic collision: the same momentum, and each car takes a change of speed in proportion to the other's mass, which
// is what bends it. A parked car then slides on its brakes: the handbrake locks the rear wheels only, so lengthways it
// drags at about 4 m/s² (judged, between the 3 of the handbrake alone and 7 of all four tyres), and sideways all four
// tyres scrub at the full 7. A hard enough knock sets off its alarm: UK law cuts the noise at 5 minutes at most
// (Construction and Use Regulations 1986, reg 37), and UN R116's visible signal runs 25 s to 5 min at 2 ± 1 Hz. The 30 s
// here is what cars commonly do; it comes from memory of R116's audible limit, which the search couldn't confirm.
import { addCrush, crushLevel, sideOf, type PlayerCar, type Side } from './car.ts';
import { carsOverlap, type CarBox } from './collide.ts';
import { KERB_KG } from './economy.ts';
import { modelFor, type TrafficCar } from './traffic.ts';
import { dist, type ParkedCar, type Town } from './town.ts';

export const ALARM_S = 30, ALARM_HZ = 2;
const ALARM_MPS = 0.8, DRAG_MPS2 = 4, SCRUB_MPS2 = 7, ALARM_FITTED = 0.8; // the shake that trips a shock sensor, and the share that have one, are judged
const NEAR_M = 40, RECHECK = 12, SETTLE_MPS = 0.05, MOVED_M = 0.25, TIDY_AFTER_S = 90, TIDY_FAR_M = 300, CLOSING_MPS = 0.3, COOL_S = 0.25, SPIN_MAX = 1.6, MOMENT_K = 12; // tidy: its owner comes back and moves it once you've gone

export type KerbCar = ParkedCar & {
  homeX: number; homeZ: number; homeHeading: number; vx: number; vz: number; spin: number;
  dents: Record<Side, number>; damage: number; alarm: number; cool: number; idle: number; moved: boolean; halfL: number; halfW: number; touched: boolean;
};

export class ParkedCars {
  cars: KerbCar[];
  shoved: KerbCar[] = []; // anything not where it was left, which traffic has to go round
  crash: { nx: number; nz: number; dv: number; speed: number } | null = null; // this step's hit on the player, if any
  private town: Town;
  private near: KerbCar[] = [];
  private ticks = 0;

  constructor(town: Town) {
    this.town = town;
    this.cars = town.parked.map((p) => ({ ...p, homeX: p.x, homeZ: p.z, homeHeading: p.heading, vx: 0, vz: 0, spin: 0, dents: { front: 0, back: 0, left: 0, right: 0 }, damage: 0, alarm: 0, cool: 0, idle: 0, moved: false, touched: false, ...modelFor(Math.floor(p.colour * 977)) }));
  }

  /** The player's car as a box, its weight, and where it's heading. */
  private bang(c: KerbCar, nx: number, nz: number, closing: number, dv: number) {
    const bent = crushLevel(dv), side = sideOf(-nx, -nz, c.heading);
    c.dents[side] = addCrush(c.dents[side], bent);
    c.damage = addCrush(c.damage, bent);
    c.touched = true;
    c.idle = 0;
    if (dv > ALARM_MPS && (c.colour * 13) % 1 < ALARM_FITTED) c.alarm = ALARM_S;
    if (closing > 0) c.cool = COOL_S;
  }

  step(dt: number, player: PlayerCar, traffic: TrafficCar[]): number {
    if (this.ticks++ % RECHECK === 0) this.near = this.cars.filter((c) => dist(c, player) < NEAR_M || c.touched);
    this.crash = null;
    const box: CarBox = { x: player.x, z: player.z, heading: player.heading, halfL: player.car.size[0] / 2, halfW: player.car.size[2] / 2 }, pm = player.car.kg;
    let impact = 0;
    for (const c of this.near) {
      c.cool -= dt;
      const touch = carsOverlap(c, box);
      if (touch) {
        const { nx, nz, depth } = touch, give = pm / (pm + KERB_KG), f = player.dir, pvx = f.x * player.speed, pvz = f.z * player.speed;
        const pushed = !this.town.boxAt(c.x - nx * depth * give, c.z - nz * depth * give, 0.9);
        if (pushed) { c.x -= nx * depth * give; c.z -= nz * depth * give; c.touched = true; }
        const stay = pushed ? 1 - give : 1;
        if (!this.town.boxAt(player.x + nx * depth * stay, player.z + nz * depth * stay, 1.1)) { player.x += nx * depth * stay; player.z += nz * depth * stay; }
        const closing = -((pvx - c.vx) * nx + (pvz - c.vz) * nz); // the speed the two meet at, along the line of the hit
        if (closing > CLOSING_MPS && c.cool <= 0) {
          const dvCar = closing * give, dvMe = closing * (1 - give); // the same momentum, so each changes speed by the other's share of the weight
          c.vx -= nx * dvCar;
          c.vz -= nz * dvCar;
          const lever = Math.max(-c.halfL, Math.min(c.halfL, (player.x - c.x) * nz - (player.z - c.z) * nx)); // off-centre, it turns as well as moves
          c.spin = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, c.spin + (-lever * dvCar * MOMENT_K) / (c.halfL * c.halfL * 4 + c.halfW * c.halfW * 4)));
          player.speed = (pvx + nx * dvMe) * f.x + (pvz + nz * dvMe) * f.z;
          this.bang(c, nx, nz, closing, dvCar);
          if (closing > impact) { impact = closing; this.crash = { nx, nz, dv: dvMe, speed: closing }; }
        }
      }
      for (const t of traffic) { // a car knocked sideways by the player carries on into the kerb
        if (Math.abs(t.vx) + Math.abs(t.vz) < 0.25 || Math.abs(t.x - c.x) + Math.abs(t.z - c.z) > 12) continue;
        const hit = carsOverlap(c, t);
        if (!hit) continue;
        const closing = -((t.vx - c.vx) * hit.nx + (t.vz - c.vz) * hit.nz);
        if (closing <= CLOSING_MPS || c.cool > 0) continue;
        c.vx -= hit.nx * closing / 2;
        c.vz -= hit.nz * closing / 2;
        t.vx += hit.nx * closing / 2;
        t.vz += hit.nz * closing / 2;
        this.bang(c, hit.nx, hit.nz, closing, closing / 2);
      }
    }
    this.shoved.length = 0;
    for (const c of this.near) {
      if (!c.touched) continue;
      if (Math.abs(c.vx) + Math.abs(c.vz) > SETTLE_MPS || Math.abs(c.spin) > SETTLE_MPS) this.roll(c, dt);
      if (c.alarm > 0) c.alarm = Math.max(0, c.alarm - dt);
      c.moved = dist(c, { x: c.homeX, z: c.homeZ }) > MOVED_M;
      if (c.moved) this.shoved.push(c);
      c.idle += dt;
      if (c.idle > TIDY_AFTER_S && c.alarm <= 0 && dist(c, player) > TIDY_FAR_M) this.tidy(c);
    }
    return impact;
  }

  /** Friction is a steady force, and a different one along the car and across it. */
  private roll(c: KerbCar, dt: number) {
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let along = c.vx * fx + c.vz * fz, across = c.vx * fz - c.vz * fx;
    along = Math.sign(along) * Math.max(0, Math.abs(along) - DRAG_MPS2 * dt);
    across = Math.sign(across) * Math.max(0, Math.abs(across) - SCRUB_MPS2 * dt);
    c.vx = along * fx + across * fz;
    c.vz = along * fz - across * fx;
    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    if (this.town.boxAt(nx, nz, 0.9)) { c.vx *= -0.2; c.vz *= -0.2; c.spin *= 0.5; } else { c.x = nx; c.z = nz; }
    c.heading += c.spin * dt;
    c.spin *= Math.max(0, 1 - 4 * dt);
    if (Math.abs(c.spin) < SETTLE_MPS) c.spin = 0;
    for (const o of this.near) { // the next car along takes its share, equal weights swapping half the difference
      if (o === c || Math.abs(o.x - c.x) + Math.abs(o.z - c.z) > 10) continue;
      const hit = carsOverlap(c, o);
      if (!hit) continue;
      const { nx: hx, nz: hz, depth } = hit;
      o.x += hx * depth / 2;
      o.z += hz * depth / 2;
      c.x -= hx * depth / 2;
      c.z -= hz * depth / 2;
      o.touched = true;
      const closing = (c.vx - o.vx) * hx + (c.vz - o.vz) * hz;
      if (closing <= CLOSING_MPS) continue;
      o.vx += hx * closing / 2;
      o.vz += hz * closing / 2;
      c.vx -= hx * closing / 2;
      c.vz -= hz * closing / 2;
      if (o.cool <= 0) this.bang(o, -hx, -hz, closing, closing / 2);
      if (c.cool <= 0) this.bang(c, hx, hz, closing, closing / 2);
    }
  }

  private tidy(c: KerbCar) {
    c.x = c.homeX; c.z = c.homeZ; c.heading = c.homeHeading;
    c.vx = c.vz = c.spin = c.damage = 0;
    c.dents = { front: 0, back: 0, left: 0, right: 0 };
    c.moved = c.touched = false;
  }

  /** The closest alarm going off near a point, for the sound, or null. */
  loudest(p: { x: number; z: number }): number | null {
    let best: number | null = null;
    for (const c of this.near) if (c.alarm > 0) { const d = dist(c, p); if (best === null || d < best) best = d; }
    return best;
  }
}
