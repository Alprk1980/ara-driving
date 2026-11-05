import { describe, expect, it } from 'vitest';
import type { CatalogueItem, Place, QuestText } from '../../schemas/content.ts';
import type { PersonLook } from '../../schemas/people.ts';
import { goodErrors, shopErrors, shopSetErrors, type Good, type Shop } from '../../schemas/shops.ts';
import { Game, type Wallet } from './game.ts';
import { dressed, eatGood } from './shops.ts';
import { Town } from './town.ts';

const places: Place[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' }));
const quests: QuestText[] = (['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' }));
const town = new Town();
const purse = (n: number): Wallet & { n: number } => ({ n, points() { return this.n; }, spend(k) { if (k > this.n) return false; this.n -= k; return true; }, earn(k) { this.n += k; } });

const banana: Good = { id: 'banana', kind: 'snack', name: 'Banana', price: 1, kcal: 105 };
const tea: Good = { id: 'pot_of_tea', kind: 'hot_drink', name: 'Pot of Tea', price: 2, kcal: 20 };
const scone: Good = { id: 'cheese_scone', kind: 'snack', name: 'Cheese Scone', price: 2, kcal: 290 };
const roll: Good = { id: 'ham_roll', kind: 'sandwich', name: 'Ham Roll', price: 3, kcal: 380 };
const tee: Good = { id: 'blue_tee', kind: 'tee', name: 'Blue Tee', price: 8, colors: ['#3366cc'] };
const bakery: Shop = { id: 'corner_bakery', name: 'Corner Bakery', sells: 'bakery', line: 'Warm bread and buns from first light.', stock: [banana, tea, scone, roll] };

describe('the shop rules', () => {
  it('pass a sensible bakery', () => { expect(shopErrors(bakery, { name: 'Corner Bakery', kind: 'shop' })).toEqual([]); });
  it('hold prices to real money at about £1.40 a Point', () => {
    expect(goodErrors({ ...tea, price: 9 }, 'bakery').join()).toMatch(/2-3 Points/); // a £12 coffee
    expect(goodErrors({ ...tee, price: 150 }, 'clothes').join()).toMatch(/4-15 Points/); // the old garage's jacket price
  });
  it('keep calories real', () => { expect(goodErrors({ ...banana, kcal: 900 }, 'bakery').join()).toMatch(/60-400 kcal/); });
  it('keep each shop to its trade', () => {
    expect(goodErrors(tee, 'bakery').join()).toMatch(/not tee/);
    expect(shopErrors({ ...bakery, sells: 'clothes' }, { name: 'Corner Bakery', kind: 'cafe' }).join()).toMatch(/a cafe can be a cafe/);
    expect(shopErrors({ ...bakery, stock: [tea, { ...tea, id: 'tea_two' }, { ...tea, id: 'tea_three' }, { ...tea, id: 'tea_four' }] }, { name: 'Corner Bakery', kind: 'shop' }).join()).toMatch(/something to eat/);
  });
  it('keep the name the street gave it', () => { expect(shopErrors({ ...bakery, name: 'Other' }, { name: 'Corner Bakery', kind: 'shop' }).join()).toMatch(/name must be/); });
  it('need the shops a player needs, and no shop twice', () => {
    expect(shopSetErrors([bakery], []).join()).toMatch(/motor shop/);
    expect(shopSetErrors([bakery, bakery], []).join()).toMatch(/corner_bakery is used twice/);
  });
});

describe('buying food', () => {
  it('takes the Points and fills the running bar', () => {
    const w = purse(5), g = new Game({ places, quests }, w, { town, seed: 3 });
    g.energy = 0;
    expect(eatGood(g, w, banana)).toBe(true);
    expect(w.n).toBe(4);
    expect(g.energy).toBeCloseTo(105 / 200, 5);
  });
  it('refuses without the Points, and leaves you hungry', () => {
    const w = purse(1), g = new Game({ places, quests }, w, { town, seed: 3 });
    g.energy = 0;
    expect(eatGood(g, w, roll)).toBe(false);
    expect(w.n).toBe(1);
    expect(g.energy).toBe(0);
  });
  it('won\'t eat a T-shirt', () => {
    const w = purse(50), g = new Game({ places, quests }, w, { town, seed: 3 });
    expect(eatGood(g, w, tee)).toBe(false);
    expect(w.n).toBe(50);
  });
});

describe('clothes', () => {
  const look: PersonLook = { id: 'person_1', hairStyle: 'long', skin: '#eed0b4', hair: '#3c2a22', shirt: '#2f4858', trousers: '#8c9096', shoes: '#45403b' };
  const items: Record<string, CatalogueItem> = {
    blue_tee: { id: 'blue_tee', kind: 'outfit', style: 'jacket', tier: 'common', name: 'Blue Tee', price: 8, colors: ['#3366cc'] },
    red_cap: { id: 'red_cap', kind: 'accessory', style: 'cap', tier: 'common', name: 'Red Cap', price: 6, colors: ['#cc2222'] },
  };
  const find = (id?: string) => (id ? items[id] : undefined);
  it('keeps the look\'s own clothes as the free basic set', () => { expect(dressed(look, {}, find)).toEqual(look); });
  it('puts on what you bought, and leaves hair and skin alone', () => {
    const d = dressed(look, { outfit: 'blue_tee', cap: 'red_cap' }, find);
    expect(d.shirt).toBe('#3366cc');
    expect(d.hairStyle).toBe('cap');
    expect(d.cap).toBe('#cc2222');
    expect(d.skin).toBe(look.skin);
    expect(d.hair).toBe(look.hair);
    expect(d.trousers).toBe(look.trousers);
  });
});
