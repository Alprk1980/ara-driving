// A scripted driver: follows the navigator's route. Headless tests and the model's session reviews use it
// in place of a thumb.
import type { DriveIntent } from './car.ts';
import type { Game } from './game.ts';
import { pointAt } from './route.ts';

export type Style = { corner: number; care: number }; // corner = m/s through a junction, care = braking margin

export const CASUAL: Style = { corner: 9, care: 1.4 };
export const SKILLED: Style = { corner: 13, care: 1 };

const WAIT_M = 6, STOP_MPS2 = 5; // close enough to the line to be waiting, and a firm, calm stop
const wedged = new WeakMap<Game, { still: number; back: number }>();

export function drive(g: Game, style: Style = CASUAL): DriveIntent {
  const p = g.player, nav = g.nav;
  if (!nav) return { steer: 0, throttle: 0, brake: 0 };
  if (g.road.incident || g.road.chaser) return { steer: 0, throttle: 0, brake: p.speed > 0.3 ? 1 : 0 }; // stops after a knock, and for the police
  const stopAt = g.road.stopAhead(), waiting = stopAt !== null && stopAt < WAIT_M; // keeps to red lights and zebras
  // Nose against a wall: back off and try again, as a player would. Waiting at a light isn't being stuck.
  const w = wedged.get(g) ?? { still: 0, back: 0 };
  wedged.set(g, w);
  w.still = Math.abs(p.speed) < 1 && p.state === 'Driving' && !waiting ? w.still + 1 / 60 : 0;
  if (w.still > 1) { w.back = 1.5; w.still = 0; }
  if (w.back > 0) {
    w.back -= 1 / 60;
    return { steer: 0, throttle: 0, brake: 1 };
  }
  const look = Math.max(10, Math.abs(p.speed) * 0.7);
  const t = pointAt(nav.route, nav.travelled + look);
  const want = Math.atan2(t.x - p.x, t.z - p.z);
  let err = want - p.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;

  // Slow for the next turn, or to a stop at the end of the route.
  const next = nav.next();
  const toTurn = next ? next.at - nav.travelled : 1e9;
  const stopAtEnd = next?.kind === 'arrive' && !(g.quest?.offer.type === 'trial' && g.quest.phase === 'Active');
  const target = next && next.kind !== 'arrive' ? style.corner : stopAtEnd ? 1.5 : 1e9;
  const safe = Math.sqrt(target * target + (2 * 9 * Math.max(0, toTurn - 6)) / style.care);
  const ahead = g.traffic.blocker(p, p.dir, 6 + Math.abs(p.speed) * style.care);
  const rules = stopAt === null ? Infinity : Math.sqrt(2 * STOP_MPS2 * Math.max(0, stopAt));
  const limit = Math.min(p.vMax, safe, rules, ahead ? ahead.speed + Math.max(0, ahead.gap - 5) * 0.8 : Infinity); // eases off behind a car, as a player would
  const facing = Math.abs(err) < 1.2;
  const over = p.speed - limit;
  return {
    steer: Math.max(-1, Math.min(1, -err * 2.2)),
    throttle: over < -0.5 ? (facing ? 1 : 0.5) : 0,
    brake: over > 0.5 ? Math.min(1, over / 6) : 0,
  };
}
