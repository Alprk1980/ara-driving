// Getaway jobs: offered to a driver who's earned the mischief, chased by the police half the time, and never worth
// more than honest work overall.
import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { ROGUE_CATCH_ODDS, ROGUE_FINE, ROGUE_PAY, ROGUE_RANK, ROGUE_SCORE, rogueErrors, rogueWorth, type RogueJob } from '../../schemas/rogue.ts';
import places from '../data/places.json';
import roguejobs from '../data/roguejobs.json';
import { RANK_REP } from './economy.ts';
import { Game } from './game.ts';
import { freshProgress } from './quests.ts';
import { freshRoad } from './roadsense.ts';
import { Town } from './town.ts';

const jobs = roguejobs as RogueJob[], town = new Town();
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));

describe('the getaway jobs Qwen wrote', () => {
  it('pass the rules', () => {
    expect(jobs.flatMap(rogueErrors)).toEqual([]);
    expect(jobs.length).toBeGreaterThanOrEqual(15);
  });
  it('turn away real crime, and jobs that promise you\'ll get away with it', () => {
    expect(rogueErrors({ id: 'x', type: 'delivery', title: 'Heist', text: 'Rob the bank and drive to {dropoff}, the police will chase.' }).join()).toMatch(/cartoon/);
    expect(rogueErrors({ id: 'x', type: 'delivery', title: 'Easy', text: 'Hurry to {dropoff}, the police never catch anyone, easy money.' }).join()).toMatch(/doesn't pay/);
    expect(rogueErrors({ id: 'x', type: 'delivery', title: 'Quick', text: 'Get this parcel to {dropoff} as fast as you possibly can, please.' }).join()).toMatch(/risk/);
  });
});

describe('crime never pays overall', () => {
  it('is worth less than an honest job, before the fines', () => {
    expect(rogueWorth()).toBeLessThan(1);
    expect(ROGUE_PAY * (1 - ROGUE_CATCH_ODDS) - (ROGUE_FINE * ROGUE_CATCH_ODDS) / 50).toBeLessThan(1); // with the fines, against a 50 Point job
  });
});

describe('who is offered one', () => {
  const offered = (rep: number, score: number) => {
    const progress = { ...freshProgress(), rep, road: { ...freshRoad(), score } };
    const g = new Game({ places: places as Place[], quests, rogue: jobs }, { points: () => 0, spend: () => false, earn: () => {} }, { town, seed: 3, progress });
    let n = 0;
    for (let i = 0; i < 60; i++) { g.refreshOffers(); n += g.offers.filter((o) => o.rogue).length; }
    return { n, g };
  };
  it('only a driver with the rank and the road sense', () => {
    expect(offered(0, 90).n).toBe(0);
    expect(offered(RANK_REP[ROGUE_RANK], ROGUE_SCORE - 1).n).toBe(0);
    const { n, g } = offered(RANK_REP[ROGUE_RANK], 80);
    expect(n).toBeGreaterThan(0);
    const o = g.offers.find((x) => x.rogue) ?? (() => { for (let i = 0; i < 60; i++) { g.refreshOffers(); const r = g.offers.find((x) => x.rogue); if (r) return r; } return null; })()!;
    expect(o.maxPay).toBeGreaterThan(0);
  });
});

describe('stopped by the police on a getaway', () => {
  it('calls the job off and doubles the fine', () => {
    let pts = 200;
    const progress = { ...freshProgress(), rep: RANK_REP[ROGUE_RANK], road: { ...freshRoad(), score: 80 } };
    const g = new Game({ places: places as Place[], quests, rogue: jobs }, { points: () => pts, spend: (n) => { if (n > pts) return false; pts -= n; return true; }, earn: (n) => { pts += n; } }, { town, seed: 3, progress });
    let o = g.offers.find((x) => x.rogue);
    for (let i = 0; i < 80 && !o; i++) { g.refreshOffers(); o = g.offers.find((x) => x.rogue); }
    g.accept(o!.id);
    g.roadEvent({ moment: 'pulled_over', pay: -20, points: 0 }); // the police's usual fine
    expect(g.quest).toBeNull();
    expect(pts).toBe(200 - 20 - ROGUE_FINE);
  });
});
