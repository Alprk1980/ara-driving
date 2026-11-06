// The town's sky by the calendar: when the sun rises and sets on today's date, and how likely today is to be wet. The
// town is set in the English Midlands (its bus loops are numbered as Birmingham numbers its circles), so it takes
// Birmingham's sun and rain. Pure, so the tests hold it to the real figures.
//
// Sunrise and sunset use the US Naval Observatory's "Almanac for Computers" sunrise algorithm (as published by Ed
// Williams), with the sun's centre 0.833 degrees below the horizon to allow for refraction and its radius. Clocks run
// on GMT, and on British Summer Time (GMT+1) from 01:00 GMT on the last Sunday of March to the last Sunday of October.
//
// Rain: the Met Office's 1991-2020 averages for Winterbourne, University of Birmingham, give the days a month with at
// least 1 mm of rain (132.5 a year). No source turned up for hours of rain, so a wet day's spell is derived: 809 mm a
// year at a typical 1 mm an hour is about 800 hours, or 6 hours on each of the 132 wet days. That makes it rain about
// 9% of the time, against the 30% the game ran before: a weak, derived figure, so it's named as such.

export const LAT = 52.45, LON = -1.93; // Birmingham, about
const ZENITH = 90.833;
export const WET_DAYS: readonly number[] = [12.82, 10.57, 9.95, 10.58, 10.2, 10, 9.65, 10.46, 10.01, 12.27, 13.33, 12.67]; // days a month with 1 mm or more, Jan-Dec
export const MONTH_DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const RAIN_SPELL_H = 6; // hours of rain on a wet day, derived above

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const wrap = (x: number, m: number) => ((x % m) + m) % m;

/** Day of the year, 1 to 366. */
export function dayOfYear(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

/** Sunrise or sunset in hours of GMT, or null when the sun doesn't cross the horizon that day. */
function sunEvent(y: number, m: number, d: number, rising: boolean, lat = LAT, lon = LON): number | null {
  const n = dayOfYear(y, m, d), lngHour = lon / 15, t = n + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = wrap(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = wrap(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
  return wrap(H + RA - 0.06571 * t - 6.622 - lngHour, 24);
}

/** The last Sunday of a month, as a day of the month. */
const lastSunday = (y: number, m: number) => { const last = new Date(Date.UTC(y, m, 0)); return last.getUTCDate() - last.getUTCDay(); };

/** On British Summer Time that day (judged at noon). */
export function isBST(y: number, m: number, d: number): boolean {
  if (m < 3 || m > 10) return false;
  if (m > 3 && m < 10) return true;
  return m === 3 ? d >= lastSunday(y, 3) : d < lastSunday(y, 10);
}

export type Sun = { rise: number; set: number }; // hours on the town's clocks
// Civil twilight, the sun up to 6 degrees below the horizon, when street lights come on and it is getting dark: at 52
// degrees north it lasts about 38 minutes at the equinoxes and 50-odd at midsummer (from memory of almanac tables). Night
// starts this long after sunset and ends this long before sunrise.
export const TWILIGHT_H = 0.75;
const EQUINOX: Sun = { rise: 6, set: 18 }; // the old fixed day, for a game with no date

/** Today's sunrise and sunset on the town's clocks, from a date as YYYY-MM-DD. */
export function sunFor(day: string): Sun {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return EQUINOX;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])], shift = isBST(y, mo, d) ? 1 : 0;
  const rise = sunEvent(y, mo, d, true), set = sunEvent(y, mo, d, false);
  return rise === null || set === null ? EQUINOX : { rise: rise + shift, set: set + shift };
}

/** The clock's share of the day turned into the sky's: sunrise falls at 0.25, solar noon at 0.5 and sunset at 0.75,
 *  where the skies were drawn, and night (before 0.2 and after 0.8) a twilight beyond them, so dawn and dusk follow the date. */
export function lightFrac(clock: number, sun: Sun): number {
  const h = wrap(clock, 1) * 24, noon = (sun.rise + sun.set) / 2, dawn = sun.rise - TWILIGHT_H, dusk = sun.set + TWILIGHT_H;
  const seg = (h0: number, h1: number, f0: number, f1: number) => f0 + ((h - h0) / (h1 - h0)) * (f1 - f0);
  if (h < dawn) return seg(0, dawn, 0, 0.2);
  if (h < sun.rise) return seg(dawn, sun.rise, 0.2, 0.25);
  if (h < noon) return seg(sun.rise, noon, 0.25, 0.5);
  if (h < sun.set) return seg(noon, sun.set, 0.5, 0.75);
  if (h < dusk) return seg(sun.set, dusk, 0.75, 0.8);
  return seg(dusk, 24, 0.8, 1);
}

/** The odds that a day in this month (1-12) is wet. */
export const wetOdds = (month: number) => WET_DAYS[month - 1] / MONTH_DAYS[month - 1];
export const monthOf = (day: string) => { const m = /^\d{4}-(\d{2})/.exec(day); return m ? Number(m[1]) : 3; }; // no date: March, the year's middle for rain
