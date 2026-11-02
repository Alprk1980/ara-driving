import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { Game, type Wallet } from './game.ts';
import { CLEAN_PAY } from './roadsense.ts';
import { Town } from './town.ts';

const places: Place[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' as const }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();

/** A wallet that keeps the reasons, as the app's does for the Points history. */
const keeper = () => {
  const log: { n: number; why?: string }[] = [];
  let value = 1000;
  const w: Wallet = { points: () => value, spend: (n, why) => { if (n > value) return false; value -= n; log.push({ n: -n, why }); return true; }, earn: (n, why) => { value += n; log.push({ n, why }); } };
  return { w, log };
};

describe('points for driving well', () => {
  it('pays for each clean kilometre', () => {
    const { w, log } = keeper(), g = new Game({ places, quests }, w, { town, seed: 1 });
    for (let i = 0; i < 10; i++) g.road.smooth(0.1);
    expect(log).toEqual([{ n: CLEAN_PAY, why: 'Clean driving' }]);
  });

  it('starts counting again after a sharp stop, a knock or a scrape', () => {
    for (const slip of ['hardStop', 'knocked', 'scraped'] as const) {
      const { w, log } = keeper(), g = new Game({ places, quests }, w, { town, seed: 1 });
      for (let i = 0; i < 6; i++) g.road.smooth(0.1);
      g.road[slip](10);
      for (let i = 0; i < 6; i++) g.road.smooth(0.1);
      expect(log, slip).toEqual([]);
    }
  });

  it('says what each change was for', () => {
    const { w, log } = keeper(), g = new Game({ places, quests }, w, { town, seed: 1 });
    g.player.fuel = 5;
    g.buyFuel(10);
    g.roadEvent({ moment: 'pulled_over', pay: -20, points: 0 });
    expect(log.map((l) => l.why)).toEqual(['Fuel, 10 L', 'Police fine']);
  });
});
