// The map shows every point of interest the town has: a place that exists and isn't on the map is a bug.
import { describe, expect, it } from 'vitest';
import type { Place, QuestText, Regular } from '../../schemas/content.ts';
import { CAREER_IDS } from '../../schemas/careers.ts';
import places from '../data/places.json';
import regulars from '../data/regulars.json';
import { Game, type Wallet } from './game.ts';
import { poiNear, pois } from './pois.ts';
import { placeAt, storyPlot } from './quests.ts';
import { dist, Town } from './town.ts';

const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const wallet: Wallet = { points: () => 0, spend: () => false, earn: () => {} };
const town = new Town();
const g = new Game({ places: places as Place[], quests, regulars: regulars as Regular[] }, wallet, { town, seed: 3 });
const list = pois(g);

describe('the map\'s points of interest', () => {
  it('include every named place, except the lots held for a story', () => {
    const held = (regulars as Regular[]).map((_, i) => storyPlot(town, i));
    const named = town.plots.filter((p) => !held.includes(p)).map((p) => placeAt(town, places as Place[], p)!.name);
    for (const n of named) expect(list.some((x) => x.name === n), n).toBe(true);
  });
  it('mark where every career signs on', () => {
    for (const id of CAREER_IDS) expect(list.some((x) => x.kind === `base_${id}`), id).toBe(true);
  });
  it('have home, every petrol station, the shopping centre and the bus stops', () => {
    expect(list.filter((x) => x.kind === 'home').length).toBe(1);
    expect(list.filter((x) => x.kind === 'fuel').length).toBe(town.stations.length);
    expect(list.some((x) => x.kind === 'centre')).toBe(town.centre !== null);
    const stops = list.filter((x) => x.kind === 'bus_stop');
    expect(stops.length).toBeGreaterThan(10);
    for (const s of town.routes.flatMap((r) => r.stops)) expect(stops.some((x) => dist(x.at, s) < 12)).toBe(true);
  });
  it('show your car once you have left it', () => {
    expect(list.some((x) => x.kind === 'your_car')).toBe(false);
    g.getOut();
    expect(pois(g).find((x) => x.kind === 'your_car')?.at).toMatchObject({ x: g.player.x, z: g.player.z });
  });
  it('turn a tap near a mark into that place', () => {
    const shop = list.find((x) => x.kind === 'shop')!;
    expect(poiNear(list, { x: shop.at.x + 5, z: shop.at.z }, 45)?.name).toBeDefined();
    expect(poiNear(list, { x: -500, z: -500 }, 45)).toBeNull();
  });
});
