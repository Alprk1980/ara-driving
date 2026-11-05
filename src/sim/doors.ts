// The front doors of the town's named places: where you can walk up to a shop, a café or an office from the pavement.
// Each is found by walking in from the place's spot on the road until the first wall, so it lands on the real frontage
// whether the plot holds a plain block or a drawn building that grew back from the street.
//
// A standard UK external door is 838 by 1981 mm (2 ft 9 in by 6 ft 6 in), the common size sold for front doors; that's
// from general knowledge of the trade sizes, not a standard looked up this time.
import { dist, type Plot, type Town, type Vec } from './town.ts';

export const DOOR_W_M = 0.84, DOOR_H_M = 1.98;
export const AT_DOOR_M = 2; // close enough to read the sign and try the handle; judged
const STEP_M = 0.25, MARGIN_M = 0.06;

export type Door = Vec & { plot: Plot; heading: number }; // heading: the way the door faces, out to the street

/** `skip`: plots with no building to knock at, such as the lots held empty for the regulars' stories. The shopping
 *  centre's doors are found the same way, from its own plot. */
export function findDoors(town: Town, skip: readonly Plot[] = []): Door[] {
  const out: Door[] = [];
  for (const plot of [...town.plots, ...(town.centre ? [town.centre.plot] : [])]) {
    if (skip.includes(plot)) continue;
    const len = dist(plot, plot.road);
    if (len < 1) continue;
    const ux = (plot.x - plot.road.x) / len, uz = (plot.z - plot.road.z) / len;
    for (let d = 0; d < len; d += STEP_M) {
      if (!town.boxAt(plot.road.x + ux * d, plot.road.z + uz * d, 0)) continue;
      const back = Math.max(0, d - STEP_M); // the last clear step, then edge forward to the wall
      let at = back;
      while (at < d && !town.boxAt(plot.road.x + ux * (at + 0.02), plot.road.z + uz * (at + 0.02), 0)) at += 0.02;
      out.push({ x: plot.road.x + ux * (at - MARGIN_M), z: plot.road.z + uz * (at - MARGIN_M), plot, heading: Math.atan2(-ux, -uz) });
      break;
    }
  }
  return out;
}

/** The door you're standing at, if any. */
export const doorNear = (doors: readonly Door[], at: Vec): Door | null => doors.find((d) => dist(d, at) < AT_DOOR_M) ?? null;
