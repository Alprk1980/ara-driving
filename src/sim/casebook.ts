// Playing the town's cases (schemas/cases.ts): one case open at a time, its witnesses at real places round town. Call in
// at a witness's door and they tell you what they saw; with enough heard, name who did it. A wrong name costs nothing
// but a gentle "not them": it's a puzzle, not a test.
import { stillSuspected, type CaseClue, type TownCase } from '../../schemas/cases.ts';

export type CaseProgress = Record<string, { heard: number[]; solved?: boolean }>;

/** Cases as shipped, with the model's "clears": null read as no suspect cleared. */
export const loadCases = (raw: readonly TownCase[]): TownCase[] => raw.map((c) => ({ ...c, clues: c.clues.map((k): CaseClue => ({ ...k, clears: k.clears ?? undefined })) }));

/** The case you're on: the first not yet solved. */
export const openCase = (cases: readonly TownCase[], p: CaseProgress): TownCase | null => cases.find((c) => !p[c.id]?.solved) ?? null;

/** The clue a place holds for the open case, if you haven't heard it. */
export function clueAt(cases: readonly TownCase[], p: CaseProgress, placeId: string | undefined): { c: TownCase; index: number } | null {
  const c = openCase(cases, p);
  if (!c || !placeId) return null;
  const index = c.clues.findIndex((k) => k.place === placeId);
  return index >= 0 && !(p[c.id]?.heard ?? []).includes(index) ? { c, index } : null;
}

/** Hear a witness out: the clue goes on the board. */
export function hear(p: CaseProgress, c: TownCase, index: number) {
  const e = (p[c.id] ??= { heard: [] });
  if (!e.heard.includes(index)) e.heard.push(index);
}

/** Who's still in the frame on the open case. */
export const suspects = (c: TownCase, p: CaseProgress) => stillSuspected(c, p[c.id]?.heard ?? []);

/** Name the culprit: right solves the case, wrong is a gentle no. */
export function accuse(p: CaseProgress, c: TownCase, who: string): boolean {
  if (who !== c.culprit) return false;
  (p[c.id] ??= { heard: [] }).solved = true;
  return true;
}
