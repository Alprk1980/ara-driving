// What the radio says about the weather, the roads and the time, built from what the game is really going to do, so a
// forecast never promises sun an hour before the rain. Pure: the game hands it the facts, it hands back the words.
//
// The wording follows how British forecasts and travel news are read. Forecast terms are the Met Office's own as heard
// in its public forecasts ("sunny spells", "outbreaks of rain", "highs of", "a touch of frost"; no official Met Office
// glossary was found, so the phrasing follows forecasts quoted in the press). Travel news follows BBC local radio,
// where each station reads its own bulletin from live incident data (RadioToday, 2020), naming the place, the problem
// and the advice ("expect delays", "allow extra time", "use another route"). The time is said as presenters say it.
//
// The climate is Birmingham's, from the Met Office's 1991-2020 averages for Winterbourne: each month's mean highs,
// lows, nights of air frost and hours of sunshine. A day's temperature wanders round the month's mean by up to
// TEMP_SPREAD degrees, judged.
import { MONTH_DAYS, type Sun } from './almanac.ts';

export const HIGHS = [7.06, 7.74, 10.26, 13.38, 16.51, 19.33, 21.5, 20.97, 18.1, 13.88, 9.87, 7.34];
export const LOWS = [1.62, 1.61, 2.94, 4.62, 7.32, 10.22, 12.13, 11.99, 9.69, 7.06, 4.02, 1.86];
export const FROST_NIGHTS = [9.5, 9.19, 5.55, 2.24, 0.33, 0, 0, 0, 0, 1.1, 4.33, 9.42];
export const SUN_HOURS = [52.9, 76.5, 117.62, 156.95, 187, 180.63, 193.48, 175, 140.02, 102.5, 63.13, 55.6];
export const TEMP_SPREAD = 2.5;

export type DayWeather = { rain: { from: number; to: number } | null; high: number; low: number; frost: boolean }; // hours on the clock
export type Forecast = { today: DayWeather; tomorrow: DayWeather; month: number; sun: Sun };

/** The share of daylight that's sunny this month: its sunshine hours over its hours of daylight. */
export const sunnyShare = (month: number, sun: Sun) => SUN_HOURS[month - 1] / (MONTH_DAYS[month - 1] * (sun.set - sun.rise));

/** A day's weather from a seeded draw: `r` gives numbers 0-1, the same for the same day. */
export function dayWeather(month: number, rain: { from: number; to: number } | null, r: () => number): DayWeather {
  const high = Math.round(HIGHS[month - 1] + (r() * 2 - 1) * TEMP_SPREAD), low = Math.min(high - 3, Math.round(LOWS[month - 1] + (r() * 2 - 1) * TEMP_SPREAD));
  const frost = r() < FROST_NIGHTS[month - 1] / MONTH_DAYS[month - 1] && !rain;
  return { rain, high, low: frost ? Math.min(low, 0) : low, frost };
}

const NUMBERS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const MINUTES = ['', 'five past', 'ten past', 'quarter past', 'twenty past', 'twenty-five past', 'half past', 'twenty-five to', 'twenty to', 'quarter to', 'ten to', 'five to'];

/** The time as a presenter says it, to the nearest five minutes: "twenty past eight", "ten o'clock". */
export function spokenTime(hours: number): string {
  let h = Math.floor(hours), m = Math.round(((hours - h) * 60) / 5) * 5;
  if (m === 60) { h += 1; m = 0; }
  const step = m / 5, hour = step > 6 ? h + 1 : h, name = NUMBERS[((hour % 12) + 12) % 12];
  return step === 0 ? `${name} o'clock` : `${MINUTES[step]} ${name}`;
}

/** A rough hour of the day in words, as forecasts give it: "mid-morning", "early afternoon", "this evening". */
function partOfDay(h: number): string {
  if (h < 6) return 'overnight';
  if (h < 9) return 'early morning';
  if (h < 11) return 'mid-morning';
  if (h < 12.5) return 'around lunchtime';
  if (h < 15) return 'early afternoon';
  if (h < 17.5) return 'later this afternoon';
  if (h < 21) return 'this evening';
  return 'later tonight';
}

const degrees = (n: number) => (n === 1 || n === -1 ? `${n} degree` : `${n} degrees`).replace('-', 'minus ');

/** The forecast for the rest of today and tonight, then tomorrow, as a Met Office forecast reads. `now` is hours. */
export function forecastText(f: Forecast, now: number): string {
  const share = sunnyShare(f.month, f.sun), t = f.today, parts: string[] = [];
  const sky = share < 0.25 ? 'plenty of cloud and just the odd brighter spell' : share < 0.42 ? 'a mix of cloud and sunny spells' : 'plenty of sunshine';
  if (t.rain && now < t.rain.to) {
    if (now >= t.rain.from) parts.push(`Outbreaks of rain for now, easing ${partOfDay(t.rain.to)}`);
    else parts.push(`Dry to start, with ${sky}, then outbreaks of rain arriving ${partOfDay(t.rain.from)}`);
  } else parts.push(now < f.sun.set ? `Staying dry for the rest of the day, with ${sky}` : 'A dry night ahead');
  if (now < 15) parts.push(`highs of ${degrees(t.high)}`);
  parts.push(t.frost ? `Tonight turning cold and clear, a touch of frost, lows of ${degrees(t.low)}` : `Lows tonight of ${degrees(t.low)}`);
  const n = f.tomorrow;
  parts.push(`Tomorrow ${n.rain ? `brings outbreaks of rain ${partOfDay(n.rain.from).replace('this ', 'in the ').replace('later tonight', 'late on')}` : `looks dry, with ${share < 0.25 ? 'some bright spells' : 'sunny spells'}`}, highs of ${degrees(n.high)}`);
  return `${parts[0]}, ${parts.slice(1, -2).join(', ')}. ${parts.at(-2)}. ${parts.at(-1)}.`.replace(', .', '.').replace(/\s+/g, ' ');
}

/** One item for the travel news, from something really happening on the town's roads. */
export type TravelFact =
  | { kind: 'roadworks' | 'parade'; near: string; district: string }
  | { kind: 'market'; near: string }
  | { kind: 'crash'; near: string; district: string }
  | { kind: 'school'; near: string[] }
  | { kind: 'bus'; route: string; via: string; due: number | null };

/** The travel news, as BBC local radio reads it: each problem, where, and what to do; or nothing to report. */
export function travelText(facts: readonly TravelFact[]): string {
  if (!facts.length) return 'No problems to report on the roads round town just now, and the buses are running normally.';
  const say = facts.slice(0, 3).map((f) => {
    switch (f.kind) {
      case 'roadworks': return `There are roadworks on the road by ${f.near} in ${f.district}, with temporary lights, so expect delays there.`;
      case 'parade': return `A parade has the road by ${f.near} in ${f.district} down to a crawl, so use another route if you can.`;
      case 'market': return `It's market day, and it's busy round ${f.near}, so allow extra time.`;
      case 'crash': return `Reports of a collision near ${f.near} in ${f.district}; the emergency services are there, so please give them room.`;
      case 'school': return `The school run is slowing things outside ${f.near.join(' and ')}, with 20 mph limits in force.`;
      case 'bus': return `On the buses, the ${f.route} ${f.via} is running${f.due !== null && f.due < 120 ? ', with one due shortly' : ' normally'}.`;
    }
  });
  return say.join(' ');
}
