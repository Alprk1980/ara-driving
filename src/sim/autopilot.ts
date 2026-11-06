// A scripted driver: follows the navigator's route. Headless tests and the model's session reviews use it
// in place of a thumb.
import type { DriveIntent } from './car.ts';
import type { Game } from './game.ts';
import { pointAt } from './route.ts';
import { ROAD_W } from './town.ts';

export type Style = { corner: number; care: number }; // corner = m/s through a junction, care = braking margin

export const CASUAL: Style = { corner: 9, care: 1.4 };
export const SKILLED: Style = { corner: 13, care: 1 };

const WAIT_M = 6, STOP_MPS2 = 5; // close enough to the line to be waiting, and a firm, calm stop
// Keeping left, in the middle of the left-hand lane as the town's traffic does (traffic.ts LANE: 3 m from the crown of a
// 12 m road). On blue lights a crew runs down the crown instead, with both sides pulled in, as the traffic's crews do.
const KEEP_LEFT_M = 3, ARRIVE_M = 30, LINE_SHORT_M = 1; // over the last 30 m it eases back to the crown to stop: the town's traffic goes round a car stopped there on either side, but can't yet pass one at the kerb by a bus stop, where buses pull in // and it stops a metre short of a stop line, so the whole vehicle is behind it
// Long vehicles take corners slower: a bus's rear wheels cut in and its nose swings out, so it needs a wide, slow turn
// (a 12.5 m outer turning circle, EU 97/27/EC). Over 6 m, the corner speed scales with the square root of length, so a
// 10.8 m bus takes a junction at about three quarters of a car's speed and the cars themselves are unchanged: judged.
const LONG_M = 6;
const wedged = new WeakMap<Game, { still: number; back: number; behind: number; passing: number; turn: -1 | 0 | 1; turnT: number; legT: number }>();
// Turning round in the road: a three-point turn (the Highway Code's "turning in the road"), forward on full lock until the
// nose nears the kerb, back on opposite lock until the tail does, and again until it faces the way it's going. Only when
// the way lies well behind (115 degrees or more off), so the usual turns at junctions never start one: judged.
const NEUTRAL_INTENT: DriveIntent = { steer: 0, throttle: 0, brake: 0 };
const U_TURN_RAD = 2, KERB_MARGIN_M = 0.8, LEG_S = 4, TURN_GIVE_UP_S = 40;
const TURN_ROUND_RAD = 1.2; // more than about 70 degrees off: it has to turn round, not just straighten up
const ONCOMING_M = 40; // how far up the other side has to be clear to pull out, plus 4 s of your own speed: judged
const PASS_AFTER_S = 3, OVERTAKE_AFTER_S = 1.5, SLOWER_MPS = 3, PASS_FOR_S = 5, PASS_M = -1.5; // held behind something stopped, or well below the pace it wants, it pulls out round it, as traffic.ts's drivers do

export function drive(g: Game, style: Style = CASUAL): DriveIntent {
  const p = g.player, nav = g.nav;
  if (!nav) return { steer: 0, throttle: 0, brake: 0 };
  if (g.road.incident || g.road.chaser) return { steer: 0, throttle: 0, brake: p.speed > 0.3 ? 1 : 0 }; // stops after a knock, and for the police
  const w = wedged.get(g) ?? { still: 0, back: 0, behind: 0, passing: 0, turn: 0, turnT: 0, legT: 0 };
  wedged.set(g, w);
  const stopAt = g.road.stopAhead(), waiting = stopAt !== null && stopAt < WAIT_M; // keeps to red lights and zebras
  const look = Math.max(p.car.size[0] > LONG_M ? 8 + p.car.size[0] * 0.6 : 10, Math.abs(p.speed) * 0.7), left = nav.route.length - nav.travelled; // 10 m for a car, further ahead for a long vehicle, or its steering hunts
  const c = pointAt(nav.route, nav.travelled + look), c2 = pointAt(nav.route, nav.travelled + look + 1);
  const tl = Math.hypot(c2.x - c.x, c2.z - c.z) || 1, keep = w.passing > 0 ? PASS_M : p.blue ? 0 : KEEP_LEFT_M * Math.min(1, Math.max(0, (left - 10) / ARRIVE_M));
  const t = { x: c.x + ((c2.z - c.z) / tl) * keep, z: c.z - ((c2.x - c.x) / tl) * keep }; // +dz,-dx is the driver's left
  const want = Math.atan2(t.x - p.x, t.z - p.z);
  let err = want - p.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;

  const long = p.car.size[0] > LONG_M; // a car U-turns in a 12 m road; a bus or a truck needs three goes
  const turning = long ? threePoint(g, w, err, waiting) : null;
  if (turning) return turning;
  // Nose against a wall: back off and try again, as a player would. Waiting at a light isn't being stuck.
  w.still = Math.abs(p.speed) < 1 && p.state === 'Driving' && !waiting ? w.still + 1 / 60 : 0;
  if (w.still > 1 && Math.abs(err) > TURN_ROUND_RAD && long) { w.turn = -1; w.turnT = 0; w.legT = 0; w.still = 0; return threePoint(g, w, err, waiting) ?? NEUTRAL_INTENT; } // wedged at an angle: work round it
  if (w.still > 1) { w.back = 1.5; w.still = 0; }
  if (w.back > 0) {
    w.back -= 1 / 60;
    return { steer: 0, throttle: 0, brake: 1 }; // straight back, then try again
  }
  // Slow for the next turn, or to a stop at the end of the route.
  const next = nav.next();
  const toTurn = next ? next.at - nav.travelled : 1e9;
  const stopAtEnd = next?.kind === 'arrive' && !(g.quest?.offer.type === 'trial' && g.quest.phase === 'Active');
  const corner = style.corner * Math.min(1, Math.sqrt(LONG_M / p.car.size[0]));
  const target = next && next.kind !== 'arrive' ? corner : stopAtEnd ? 1.5 : 1e9;
  const safe = Math.sqrt(target * target + (2 * 9 * Math.max(0, toTurn - 6)) / style.care);
  const rules = stopAt === null ? Infinity : Math.sqrt(2 * STOP_MPS2 * Math.max(0, stopAt - LINE_SHORT_M));
  const nose = p.car.size[0] / 2; // the gaps were set for a hatchback's 1.9 m; a bus's nose is 5.4 m ahead of its middle
  const lane = p.car.size[2] / 2 + 1; // anything this far either side of the middle of the car is in its way
  const ahead = g.traffic.blocker(p, p.dir, 6 + nose + Math.abs(p.speed) * style.care + 6, lane), room = ahead ? ahead.gap - nose - ahead.halfL : Infinity; // bumper to bumper
  const pace = Math.min(p.vMax, safe, rules); // what it would do with the road clear
  const stuck = ahead && ahead.speed < 0.5 && room < 8, slow = ahead && ahead.speed > 0.5 && pace - ahead.speed > SLOWER_MPS && room < 20;
  w.behind = (stuck || slow) && !waiting ? w.behind + 1 / 60 : 0; // sat behind a bus at its stop, a car left in the road, or a slow one
  const clear = !oncoming(g, p, ONCOMING_M + Math.abs(p.speed) * 4); // look before pulling out, as the Highway Code's rules 162-169 ask
  if (w.behind > (stuck ? PASS_AFTER_S : OVERTAKE_AFTER_S) && clear) { w.passing = PASS_FOR_S; w.behind = 0; }
  if (!clear && w.passing > 0 && !oncoming(g, p, 12)) w.passing = 0; // something's coming: back in, unless it's already alongside
  w.passing -= 1 / 60;
  const inWay = w.passing > 0 ? null : ahead; // going round it, it no longer holds you back
  const limit = Math.min(p.vMax, safe, rules, inWay ? inWay.speed + Math.max(0, room - 2.5) * 0.8 : Infinity); // eases off behind a car, as a player would
  const facing = Math.abs(err) < 1.2;
  const over = p.speed - limit;
  return {
    steer: Math.max(-1, Math.min(1, -err * 2.2)),
    throttle: over < -0.5 ? (facing ? 1 : 0.5) : 0,
    brake: over > 0.5 ? Math.min(1, over / 6) : 0,
  };
}

/** Anything coming the other way up the right-hand side of the road within `range`. */
function oncoming(g: Game, p: Game['player'], range: number): boolean {
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  return g.traffic.cars.some((c) => {
    if (c.dormant) return false;
    const dx = c.x - p.x, dz = c.z - p.z, along = dx * fx + dz * fz, right = -(dx * fz - dz * fx); // positive to the driver's right
    return along > -2 && along < range && right > -1 && right < 7 && Math.sin(c.heading) * fx + Math.cos(c.heading) * fz < 0.3;
  });
}


/** One step of a three-point turn, or null when none is needed or it's done. */
function threePoint(g: Game, w: NonNullable<ReturnType<typeof wedged.get>>, err: number, waiting: boolean): DriveIntent | null {
  const p = g.player, half = p.car.size[0] / 2, fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  if (w.turn === 0) {
    if (Math.abs(err) < U_TURN_RAD || Math.abs(p.speed) > 3 || waiting) return null;
    w.turn = 1; w.turnT = 0; w.legT = 0;
  }
  w.turnT += 1 / 60;
  w.legT += 1 / 60;
  if (Math.abs(err) < 0.5 || w.turnT > TURN_GIVE_UP_S) { w.turn = 0; return null; } // round, or let the usual driving have it
  const atKerb = (s: number) => {
    const q = { x: p.x + fx * (half + 0.5) * s, z: p.z + fz * (half + 0.5) * s };
    return Math.hypot(q.x - g.town.snap(q).point.x, q.z - g.town.snap(q).point.z) > ROAD_W / 2 - KERB_MARGIN_M || g.town.boxAt(q.x, q.z, 0.3) !== null;
  };
  const stalled = w.legT > 1 && Math.abs(p.speed) < 0.3;
  if (w.turn === 1 && (atKerb(1) || stalled || w.legT > LEG_S)) { w.turn = -1; w.legT = 0; }
  else if (w.turn === -1 && (atKerb(-1) || stalled || w.legT > LEG_S)) { w.turn = 1; w.legT = 0; }
  const lock = Math.sign(err) || 1;
  return w.turn === 1
    ? { steer: -lock, throttle: p.speed < 2.5 ? 0.5 : 0, brake: p.speed > 3 ? 1 : 0 }
    : { steer: lock, throttle: p.speed < -2.5 ? 0.5 : 0, brake: p.speed > -2.5 ? 1 : 0 }; // the brake held at a stop is reverse
}
