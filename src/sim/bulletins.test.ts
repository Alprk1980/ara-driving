// The radio's facts: a forecast that comes true, temperatures from Birmingham's averages, travel news from what's on
// the roads, and the time as a presenter says it.
import { describe, expect, it } from 'vitest';
import type { Place, QuestText } from '../../schemas/content.ts';
import { radioLinkErrors, type RadioLink } from '../../schemas/radiolinks.ts';
import places from '../data/places.json';
import { RadioHost } from '../ui/radio.ts';
import { dayWeather, forecastText, HIGHS, spokenTime, travelText } from './bulletins.ts';
import { Game, type Wallet } from './game.ts';
import { Town } from './town.ts';

const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const wallet: Wallet = { points: () => 0, spend: () => false, earn: () => {} };
const town = new Town();

describe('the forecast', () => {
  it('comes true: rain it says is coming does come, and a dry day stays dry', () => {
    const g = new Game({ places: places as Place[], quests }, wallet, { town, day: '2026-11-06' });
    let rainy = 0;
    for (let day = 1; day < 40; day++) {
      const spell = g.rainSpell(day);
      g.time = (day - 0.3 + 12 / 24) * 480; // noon that day: the clock starts at 07:12
      const f = forecastText({ ...g.forecast }, 12);
      if (spell && spell.to > 12) { rainy++; expect(f).toMatch(/rain/); g.time = (day - 0.3 + Math.max(12, spell.from + 0.5) / 24) * 480; expect(g.rain, `day ${day}`).toBeGreaterThan(0); }
      if (!spell) { expect(f).toMatch(/dry/i); expect(f.split('.')[0]).not.toMatch(/rain/); }
    }
    expect(rainy).toBeGreaterThan(3);
  });
  it('gives temperatures round Birmingham\'s averages for the month', () => {
    for (let i = 0; i < 50; i++) {
      const w = dayWeather(7, null, Math.random);
      expect(Math.abs(w.high - HIGHS[6])).toBeLessThanOrEqual(3);
      expect(w.low).toBeLessThan(w.high);
    }
  });
  it('reads as a forecast, in plain words', () => {
    const f = forecastText({ today: { rain: { from: 15, to: 21 }, high: 10, low: 4, frost: false }, tomorrow: { rain: null, high: 9, low: 2, frost: false }, month: 11, sun: { rise: 7.2, set: 16.5 } }, 9);
    expect(f).toBe("Dry to start, with plenty of cloud and just the odd brighter spell, then outbreaks of rain arriving later this afternoon, highs of 10 degrees. Lows tonight of 4 degrees. Tomorrow looks dry, with some bright spells, highs of 9 degrees.");
  });
});

describe('the time and the travel', () => {
  it('says the time as a presenter does', () => {
    expect(spokenTime(8 + 20 / 60)).toBe('twenty past eight');
    expect(spokenTime(10)).toBe("ten o'clock");
    expect(spokenTime(13.75)).toBe('quarter to two');
    expect(spokenTime(23.98)).toBe("twelve o'clock");
  });
  it('reads what is happening, or that nothing is', () => {
    expect(travelText([])).toMatch(/No problems/);
    expect(travelText([{ kind: 'roadworks', near: 'Corner Bakery', district: 'Old Town' }])).toBe('There are roadworks on the road by Corner Bakery in Old Town, with temporary lights, so expect delays there.');
  });
});

describe('the presenter', () => {
  it('reads the facts into a link, and never adds weather of its own', () => {
    const links: RadioLink[] = [{ id: 'w', kind: 'weather', text: 'Here is the forecast. {forecast}' }];
    expect(radioLinkErrors({ id: 'bad', kind: 'weather', text: 'A lovely sunny one! {forecast}' }).join()).toMatch(/lovely|weather/);
    expect(radioLinkErrors({ id: 'ok', kind: 'travel', text: "Time for the travel on {station}. {travel}" })).toEqual([]);
    const r = new RadioHost([], () => 0.1, links, { forecast: () => 'Dry.', travel: () => 'Clear.', time: () => 'noon', station: () => 'Town FM' });
    expect(r.tick(99, { night: false, rain: false })).toBe('Here is the forecast. Dry.');
  });
});
