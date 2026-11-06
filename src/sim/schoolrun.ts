// The school run: on a school day, the hour before school and the hour after it fill the streets round each school
// with children walking, and the road outside slows to 20 mph while the warning lights flash.
//
// From the research in TEEN_EDITION.md: child pedestrian casualties peak 08:00-09:00 and 15:00-16:00 (RoSPA's
// home-to-school guidance), and primary-age children can't judge traffic above about 20 mph (Royal Holloway,
// Psychological Science, 2011). Many councils run a part-time 20 mph limit outside schools, shown by the "School"
// warning sign whose amber lamps flash at the start and end of the day; going faster then is an ordinary speeding
// offence, a £100 fixed penalty and 3 points (GOV.UK's penalty table). The windows open a little early, as children
// are on their way well before the bell; that widening is judged.
import type { Place } from '../../schemas/content.ts';
import { dist, type Plot, type Town, type Vec } from './town.ts';

export const SCHOOL_KMH = 32; // 20 mph
export const ZONE_M = 110; // how far either way along the road the part-time limit runs from the school gate: judged, as each council sets its own
export const PEAK_AM: [number, number] = [7.5 / 24, 9 / 24]; // 07:30-09:00 on the clock (dayFrac)
export const PEAK_PM: [number, number] = [14.5 / 24, 16 / 24]; // 14:30-16:00
export const FAST_S = 2; // this long over the limit inside a zone is the offence: judged, so a brief creep over isn't
export const KIDS_NEAR_M = 160; // how close to a school the extra children walk
export const KIDS_SHARE = 0.6; // of the walkers placed near you, the share who are children on the school run, when one is near: judged

// English schools' terms, roughly: the dates move a few days each year and by council, so these are judged averages
// of published term calendars, not one council's. Holidays: summer from about 22 July to 3 September, two weeks at
// Christmas and Easter, and a week at each half term.
const HOLIDAYS: [string, string][] = [
  ['01-01', '01-04'], ['02-14', '02-22'], ['03-28', '04-12'], ['05-23', '05-31'], ['07-22', '09-03'], ['10-24', '11-01'], ['12-20', '12-31'],
];

/** A school day: a weekday in term. `day` is YYYY-MM-DD; a game with no date is always a school day. */
export function schoolDay(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return true;
  const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const md = `${m[2]}-${m[3]}`;
  return !HOLIDAYS.some(([a, b]) => md >= a && md <= b);
}

/** In the morning or afternoon run, on the clock's share of the day. */
export const inPeak = (frac: number) => (frac >= PEAK_AM[0] && frac < PEAK_AM[1]) || (frac >= PEAK_PM[0] && frac < PEAK_PM[1]);

export type School = { name: string; plot: Plot; gate: Vec };

/** The town's schools: every plot whose place is a school, with its gate on the road. */
export function schoolsIn(town: Town, places: Place[], placeOf: (p: Plot) => Place | undefined): School[] {
  void places;
  return town.plots.filter((p) => placeOf(p)?.kind === 'school').map((p) => ({ name: placeOf(p)!.name, plot: p, gate: p.road }));
}

/** The school whose 20 mph zone this point is in, if any: near enough the gate along the road. */
export const zoneAt = (schools: readonly School[], at: Vec): School | null => schools.find((s) => dist(s.gate, at) < ZONE_M) ?? null;
