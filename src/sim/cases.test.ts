// The town's cases: each one fair and solvable from its clues, and played by calling in at witnesses' doors.
import { describe, expect, it } from 'vitest';
import { caseErrors, caseSetErrors, CASE_REWARD, type TownCase } from '../../schemas/cases.ts';
import type { Place, QuestText, Regular } from '../../schemas/content.ts';
import cases from '../data/cases.json';
import places from '../data/places.json';
import regulars from '../data/regulars.json';
import { loadCases, suspects } from './casebook.ts';
import { Game, type GameEvent } from './game.ts';
import { placeAt } from './quests.ts';
import { Town } from './town.ts';

const list = loadCases(cases as TownCase[]), regs = regulars as Regular[];
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();

describe('the shipped cases', () => {
  it('each pass the rules, and no clue is told twice', () => {
    expect(list.flatMap((c) => caseErrors(c, regs, places as Place[]))).toEqual([]);
    expect(caseSetErrors(list)).toEqual([]);
    expect(list.length).toBeGreaterThanOrEqual(3);
  });
  it('leave exactly the culprit once every clue is heard', () => {
    for (const c of list) expect(suspects(c, { [c.id]: { heard: c.clues.map((_, i) => i) } })).toEqual([c.culprit]);
  });
  it('turn away a case that can\'t be solved, or names the culprit in a clue', () => {
    const c = structuredClone(list[0]);
    c.clues[0].clears = undefined;
    expect(caseErrors(c, regs, places as Place[]).join()).toMatch(/exactly 3 clues/);
    const d = structuredClone(list[0]);
    d.clues[3].text = `It was ${regs.find((r) => r.id === d.culprit)!.name} all along, I saw them with it.`;
    expect(caseErrors(d, regs, places as Place[]).join()).toMatch(/names the culprit/);
  });
});

describe('playing a case', () => {
  it('hears witnesses at their doors, says no to the wrong name, and pays for the right one', () => {
    let pts = 0;
    const g = new Game({ places: places as Place[], quests, regulars: regs, cases: list }, { points: () => pts, spend: () => false, earn: (n) => { pts += n; } }, { town, seed: 1 });
    const seen: GameEvent[] = [];
    g.on((e) => seen.push(e));
    const c = g.openCase!;
    let heard = 0;
    for (const d of g.doors) if (g.clueAtDoor(d)) { expect(g.hearClue(d)).toBe(true); heard++; expect(g.clueAtDoor(d)).toBeNull(); }
    expect(heard).toBe(c.clues.filter((k) => g.doors.some((d) => placeAt(town, places as Place[], d.plot)?.id === k.place)).length);
    expect(heard).toBeGreaterThanOrEqual(3); // enough to solve it
    const wrong = c.suspects.find((s) => s !== c.culprit)!;
    expect(g.accuse(wrong)).toBe(false);
    expect(pts).toBe(0);
    expect(g.accuse(c.culprit)).toBe(true);
    expect(pts).toBe(CASE_REWARD);
    expect(seen.some((e) => e.type === 'caseSolved')).toBe(true);
    expect(g.openCase?.id).not.toBe(c.id); // on to the next
  });
});
