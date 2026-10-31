// Daily goals: three a day, picked from the date alone, so every player in the collection gets the same three
// with no server. Counts are saved, and start again when the date changes.
import type { Goal, GoalKind } from '../../schemas/content.ts';
import { makeRng } from './town.ts';

export const DAILY_GOALS = 3;
export type Daily = { day: string; counts: Partial<Record<GoalKind, number>>; done: string[] };
export const freshDaily = (day: string): Daily => ({ day, counts: {}, done: [] });

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Today's goals, each of a different kind. */
export function goalsFor(goals: Goal[], day: string): Goal[] {
  const rng = makeRng(hash(day)), pool = [...goals], out: Goal[] = [];
  while (pool.length && out.length < DAILY_GOALS) {
    const g = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (!out.some((o) => o.kind === g.kind)) out.push(g);
  }
  return out;
}

/** Adds to a count (or lifts it to `best`, for a run in a row) and returns the goals this finished. */
export function advance(today: Goal[], d: Daily, kind: GoalKind, by: number, best = false): Goal[] {
  if (!today.some((g) => g.kind === kind)) return [];
  d.counts[kind] = best ? Math.max(d.counts[kind] ?? 0, by) : (d.counts[kind] ?? 0) + by;
  const finished = today.filter((g) => g.kind === kind && !d.done.includes(g.id) && d.counts[kind]! >= g.target);
  d.done.push(...finished.map((g) => g.id));
  return finished;
}
