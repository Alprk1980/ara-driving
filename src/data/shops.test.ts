// The shipped shops stay valid: the same rules the generator enforced, and a town with the shops a player needs.
import { describe, expect, it } from 'vitest';
import type { CatalogueItem, Place } from '../../schemas/content.ts';
import { PLACE_SHOPS, shopErrors, shopSetErrors, type Shop } from '../../schemas/shops.ts';
import catalogue from './catalogue.json';
import places from './places.json';
import shops from './shops.json';

const list = shops as Shop[], byId = new Map((places as Place[]).map((p) => [p.id, p]));

describe('shipped shops', () => {
  it('each pass the shop rules', () => { expect(list.flatMap((s) => shopErrors(s, byId.get(s.id)))).toEqual([]); });
  it('make a town with a motor shop, a bakery, clothes and a shopping centre', () => { expect(shopSetErrors(list, (catalogue as CatalogueItem[]).map((c) => c.id))).toEqual([]); });
  it('cover every place that could be a shop', () => {
    const could = (places as Place[]).filter((p) => PLACE_SHOPS[p.kind]).map((p) => p.id);
    expect(could.filter((id) => !list.some((s) => s.id === id))).toEqual([]);
  });
  it('name only places that exist, or are in the centre', () => { expect(list.filter((s) => !s.centre && !byId.has(s.id)).map((s) => s.id)).toEqual([]); });
});
