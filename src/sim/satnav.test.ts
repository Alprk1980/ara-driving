import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { Game, type Trip, type Wallet } from './game.ts';
import { destinations, distanceText, etaSeconds, GROUP_ORDER, nearestIn, turnText, URBAN_MPS } from './satnav.ts';
import { NEUTRAL } from './car.ts';
import { Town } from './town.ts';

const places: Place[] = [...Array.from({ length: 6 }, (_, i) => ({ id: `shop${i}`, name: `Shop ${i}`, kind: 'shop' as const })), { id: 'cafe0', name: 'Cafe Nought', kind: 'cafe' }];
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const wallet = (): Wallet => ({ points: () => 1000, spend: () => true, earn: () => {} });
const game = (trip?: Trip) => new Game({ places, quests }, wallet(), { town, seed: 3, start: 0, trip });

describe('the sat nav', () => {
  const g = game(), all = destinations(g);

  it('lists every station, home, the services, the districts and each named place once', () => {
    expect(all.filter((d) => d.group === 'Fuel and repairs')).toHaveLength(town.stations.length);
    expect(all.filter((d) => d.group === 'Home')).toHaveLength(1);
    expect(all.filter((d) => d.group === 'Emergency services')).toHaveLength(town.services.length);
    expect(all.filter((d) => d.group === 'Districts')).toHaveLength(4);
    expect(all.filter((d) => d.key.startsWith('place:')).map((d) => d.name).sort()).toEqual(places.map((p) => p.name).sort());
    expect(new Set(all.map((d) => d.key)).size).toBe(all.length);
  });

  it('measures by road, in group order, nearest first', () => {
    for (const d of all) expect(d.metres).toBeGreaterThanOrEqual(Math.hypot(d.at.x - g.player.x, d.at.z - g.player.z) - 15);
    const groups = all.map((d) => GROUP_ORDER.indexOf(d.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    const fuel = all.filter((d) => d.group === 'Fuel and repairs').map((d) => d.metres);
    expect(fuel).toEqual([...fuel].sort((a, b) => a - b));
    expect(nearestIn(all, 'Fuel and repairs')!.metres).toBe(fuel[0]);
  });

  it('times a trip at the DfT average urban speed, and speaks plainly', () => {
    expect(URBAN_MPS).toBeCloseTo(10.28, 2);
    expect(etaSeconds(1028)).toBeCloseTo(100, 0);
    expect(distanceText(123)).toBe('120 m');
    expect(distanceText(1500)).toBe('1.5 km');
    expect(turnText({ id: 'a', kind: 'left', at: 0 }, 200)).toBe('In 200 m, turn left');
    expect(turnText({ id: 'a', kind: 'right', at: 0 }, 10)).toBe('Turn right');
    expect(turnText({ id: 'a', kind: 'arrive', at: 0 }, 5)).toBe('You have arrived');
  });
});

describe('a saved drive', () => {
  it('comes back where it was left: the car, the clock, the dents, the waypoint and the job', () => {
    const g = game();
    const target = g.town.plots[5].road;
    g.accept(g.offers[0].id);
    g.setWaypoint(target, 'Shop 3'); // kept for after the job
    g.player.place(g.town.home.road.x + 3, g.town.home.road.z, 1.2);
    g.time = 321;
    g.streak = 2;
    g.player.dents.left = 0.4;
    g.player.marks.push({ side: 'left', at: 0.2, depth: 0.4 });
    g.quest!.elapsed = 12;
    const saved = JSON.parse(JSON.stringify(g.snapshot())) as Trip; // through JSON, as the profile stores it

    const back = game(saved);
    expect([back.player.x, back.player.z, back.player.heading]).toEqual([g.player.x, g.player.z, g.player.heading]);
    expect(back.player.state).toBe('Parked');
    expect(back.time).toBe(321);
    expect(back.streak).toBe(2);
    expect(back.player.dents.left).toBe(0.4);
    expect(back.player.marks).toEqual(g.player.marks);
    expect(back.quest!.offer.title).toBe(g.quest!.offer.title);
    expect(back.quest!.offer.start.road).toEqual(g.quest!.offer.start.road);
    expect(back.quest!.offer.end.road).toEqual(g.quest!.offer.end.road);
    expect(back.quest!.elapsed).toBe(12);
    expect(back.nav).not.toBeNull();
    expect(back.waypoint).toEqual(g.waypoint);
    expect(back.dest).toBe('Shop 3');
    for (let i = 0; i < 60; i++) back.step(NEUTRAL); // and it runs on from there
    expect(back.quest).not.toBeNull();
  });

  it('drops a job whose places are gone rather than half-restoring it', () => {
    const g = game();
    g.accept(g.offers[0].id);
    const saved = g.snapshot();
    saved.quest!.offer.end = 99999;
    expect(game(saved).quest).toBeNull();
  });

  it('keeps another car\'s dents off this one', () => {
    const g = game();
    g.player.dents.front = 0.7;
    const saved = { ...g.snapshot(), car: 'van' };
    expect(game(saved).player.dents.front).toBe(0);
  });
});
