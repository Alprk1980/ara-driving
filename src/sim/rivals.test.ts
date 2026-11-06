// The season against the rival crews: their pace, the board, the taunt when one passes you, and the prize at the end.
import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { rivalErrors, rivalSetErrors, type RivalCrew } from '../../schemas/rivals.ts';
import places from '../data/places.json';
import rivals from '../data/rivals.json';
import { NEUTRAL } from './car.ts';
import { Game, STEP, type GameEvent } from './game.ts';
import { crewScore, freshSeason, PRIZES, SEASON_S, STEADY_PER_S, standings } from './rivals.ts';
import { Town } from './town.ts';

const crews = rivals as RivalCrew[];
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));

describe('the crews', () => {
  it('pass the rules, one at each pace, in colours you can tell apart', () => {
    expect(crews.flatMap(rivalErrors)).toEqual([]);
    expect(rivalSetErrors(crews)).toEqual([]);
  });
  it('turn away a nasty taunt', () => {
    expect(rivalErrors({ ...crews[0], taunts: ['You useless driver.', 'a', 'b', 'c'] }).join()).toMatch(/banter/);
  });
  it('earn round their pace, the same on a replay', () => {
    const s = { n: 2, clock: SEASON_S, earned: 0 };
    for (const [i, c] of crews.entries()) {
      const got = crewScore(c, i, s);
      expect(got).toBe(crewScore(c, i, { ...s }));
      expect(got / (c.pace * STEADY_PER_S * SEASON_S)).toBeGreaterThan(0.75);
      expect(got / (c.pace * STEADY_PER_S * SEASON_S)).toBeLessThan(1.25);
    }
  });
});

describe('the season', () => {
  it('puts you on the board, lets a crew tease you when it passes, and pays out at the end', () => {
    let pts = 0;
    const g = new Game({ places: places as Place[], quests, rivals: crews }, { points: () => pts, spend: () => false, earn: (n) => { pts += n; } }, { town: new Town(), seed: 1 });
    const seen: GameEvent[] = [];
    g.on((e) => seen.push(e));
    g.progress.season = { ...freshSeason(), earned: 40 }; // ahead early on, then the crews pull past
    for (let i = 0; i < 200 / STEP; i++) g.step(NEUTRAL);
    expect(g.seasonBoard.length).toBe(4);
    expect(seen.some((e) => e.type === 'rival')).toBe(true);
    g.progress.season!.clock = SEASON_S - STEP;
    g.progress.season!.earned = 99999; // far ahead at the end
    const before = pts;
    g.step(NEUTRAL);
    const end = seen.find((e) => e.type === 'season') as Extract<GameEvent, { type: 'season' }>;
    expect(end.place).toBe(0);
    expect(pts - before).toBe(PRIZES[0]);
    expect(g.progress.season).toMatchObject({ n: 1, earned: 0 });
    expect(standings(crews, g.progress.season!)[0].score).toBeGreaterThanOrEqual(0);
  }, 60000);
});
