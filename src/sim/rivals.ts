// The season's earnings board: you against the three rival crews (schemas/rivals.ts), over three game days, the same
// span as a licence mark lasts. What you earn from jobs and shifts counts; each crew earns at its own pace round what
// an ordinary driver makes, with a little luck each season, so the board is live as it goes and the same on a replay.
//
// An ordinary driver's pace is taken from tools/balance.ts: a casual driver in the starter car nets about 150 Points
// in ten minutes, so 0.25 Points a second. The prizes are judged: worth having, short of a story finale.
import type { RivalCrew } from '../../schemas/rivals.ts';
import { makeRng } from './town.ts';

export const SEASON_S = 3 * 480; // three game days
export const STEADY_PER_S = 0.25;
export const PRIZES = [150, 75, 30, 0]; // for finishing first, second, third or last
export const LUCK = 0.15; // a crew's season can run this much either side of its pace

export type Season = { n: number; clock: number; earned: number };
export const freshSeason = (): Season => ({ n: 0, clock: 0, earned: 0 });

/** A crew's earnings so far this season: steady, with its luck for the season and a gentle wobble as it goes. */
export function crewScore(crew: RivalCrew, index: number, s: Season): number {
  const r = makeRng(s.n * 101 + index * 7 + 3), luck = 1 + (r() * 2 - 1) * LUCK, phase = r() * 6.28;
  const t = s.clock, wobble = 1 + 0.06 * Math.sin(t / 90 + phase);
  return Math.max(0, Math.round(crew.pace * STEADY_PER_S * t * luck * wobble));
}

export type Standing = { name: string; colour: string; score: number; you: boolean };

/** The board, top first. */
export function standings(crews: readonly RivalCrew[], s: Season): Standing[] {
  return [...crews.map((c, i) => ({ name: c.name, colour: c.colour, score: crewScore(c, i, s), you: false })), { name: 'You', colour: '#e8483f', score: Math.round(s.earned), you: true }].sort((a, b) => b.score - a.score || Number(b.you) - Number(a.you));
}

/** Where you are on the board, 0 for first. */
export const yourPlace = (crews: readonly RivalCrew[], s: Season) => standings(crews, s).findIndex((x) => x.you);
