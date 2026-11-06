// The town's shops as the game uses them: which shop a place is, what's on its shelves, and what a bought good does.
// The rules and price bands live in schemas/shops.ts; the stock is generated into src/data/shops.json.
import type { CatalogueItem } from '../../schemas/content.ts';
import type { PersonLook } from '../../schemas/people.ts';
import { GARMENT_RULES, goodKey, isFood, isGarment, type Good, type Shop, type WornSlot } from '../../schemas/shops.ts';
import shopsData from '../data/shops.json' with { type: 'json' };
import type { Driver } from '../save.ts';
import type { Game, Wallet } from './game.ts';

export const SHOPS = shopsData as Shop[];
const GOODS = new Map(SHOPS.flatMap((s) => s.stock.map((g) => [goodKey(s, g), g] as const))); // by shop/good: the key a bought garment is owned and worn by

export const shopFor = (placeId: string | undefined, shops: readonly Shop[] = SHOPS): Shop | null => shops.find((s) => s.id === placeId && !s.centre) ?? null;
export const centreUnits = (shops: readonly Shop[] = SHOPS): Shop[] => shops.filter((s) => s.centre);
export const goodById = (key: string | undefined): Good | undefined => (key ? GOODS.get(key) : undefined);
/** Everything on sale, with the key each is known by. */
export const allGoods = (): { key: string; good: Good }[] => SHOPS.flatMap((s) => s.stock.map((good) => ({ key: goodKey(s, good), good })));
export const slotOf = (g: Good): WornSlot | null => (isGarment(g.kind) ? GARMENT_RULES[g.kind].slot : null);

/** A garment in the car catalogue's shape, so the cockpit's driver and the figure on foot read it as they read the
 *  outfits and accessories the garage used to sell. `id` is the good's key, shop/good. */
export function garmentItem(id: string | undefined): CatalogueItem | undefined {
  const g = goodById(id);
  if (!g || !isGarment(g.kind)) return undefined;
  const slot = GARMENT_RULES[g.kind].slot;
  return { id: id!, kind: slot === 'outfit' ? 'outfit' : 'accessory', style: slot === 'outfit' ? 'jacket' : slot, tier: 'common', name: g.name, price: g.price, colors: g.colors ?? [] };
}

/** Buy something to eat or drink, and eat it there and then: Points out, energy in. False without the Points. */
export function eatGood(game: Game, wallet: Wallet, good: Good, free = false): boolean {
  if (!isFood(good.kind)) return false;
  if (!free && !wallet.spend(good.price, `Bought ${good.name}`)) return false;
  game.eat(good.kcal ?? 0);
  return true;
}

/** One of the town's looks in the clothes you're wearing. Hair and skin are the look's own, always free; what you
 *  haven't bought is the look's own basic set. */
export function dressed(look: PersonLook, driver: Driver, find: (id?: string) => CatalogueItem | undefined): PersonLook & { cap?: string } {
  const top = find(driver.outfit)?.colors[0], legs = find(driver.trousers)?.colors[0], feet = find(driver.shoes)?.colors[0], cap = find(driver.cap)?.colors[0];
  return { ...look, shirt: top ?? look.shirt, trousers: legs ?? look.trousers, shoes: feet ?? look.shoes, ...(cap ? { hairStyle: 'cap' as const, cap } : {}) };
}
