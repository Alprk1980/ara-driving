// What the town's shops sell, and the rules the local model's stock lists are held to. One shop per place that sells
// anything (its id is the place's id), plus the shopping centre's units, which have no place of their own.
//
// Prices follow the split rule decided 2026-11-05: everyday things cost real money at about £1.40 a Point, the rate
// fuel and the bus fare already use (src/sim/economy.ts), while cars and paint stay scaled down on purpose. So a coffee
// at the 2025 UK average of £3.35 (Finder's survey of 42 towns) is 2-3 Points. The bands below are real price ranges
// turned into Points and rounded; where a source is weak the comment says so.
//
// Calories are what's printed on the packet, in kcal, and they refill running energy (src/sim/energy.ts).

export const SHOP_KINDS = ['cafe', 'bakery', 'grocer', 'clothes', 'motor', 'none'] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export const FOOD_KINDS = ['hot_drink', 'cold_drink', 'snack', 'sandwich', 'meal'] as const;
export const GARMENT_KINDS = ['tee', 'jumper', 'jacket', 'trousers', 'shoes', 'hat', 'gloves', 'sunglasses'] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];
export type GarmentKind = (typeof GARMENT_KINDS)[number];
export type GoodKind = FoodKind | GarmentKind;

/** Points, and kcal for food. */
export const FOOD_RULES: Record<FoodKind, { price: [number, number]; kcal: [number, number] }> = {
  hot_drink: { price: [2, 3], kcal: [0, 260] }, // £3.35 average coffee (Finder 2025); a black coffee is near 0 kcal, a large hot chocolate about 250
  cold_drink: { price: [1, 2], kcal: [0, 200] }, // £1-2 a can or bottle, judged; a 330 ml can of cola is about 139 kcal (its label)
  snack: { price: [1, 3], kcal: [60, 400] }, // a medium banana is 105 kcal (USDA via nutrition tables), a sausage roll about 350; prices judged
  sandwich: { price: [2, 4], kcal: [250, 600] }, // £3-5 in a café, judged from council café menus (2025), a weak source
  meal: { price: [3, 9], kcal: [450, 1200] }, // a meal deal £4.25-5.95 (single café menus, 2025, examples); a café breakfast or fish and chips about £8-12, judged
};

/** Points. Clothes are the weakest research: budget-shop examples (George at ASDA 2024: jumper £10.40, coat £34.40;
 *  ASOS hoodie £24-30), widened by judgement to cover the high street. */
export const GARMENT_RULES: Record<GarmentKind, { price: [number, number]; slot: WornSlot; colors: [number, number] }> = {
  tee: { price: [4, 15], slot: 'outfit', colors: [1, 2] }, // £5-20
  jumper: { price: [7, 30], slot: 'outfit', colors: [1, 2] }, // £10-40, hoodies and jumpers
  jacket: { price: [18, 60], slot: 'outfit', colors: [1, 2] }, // £25-80, jackets and coats
  trousers: { price: [7, 32], slot: 'trousers', colors: [1, 1] }, // £10-45
  shoes: { price: [11, 57], slot: 'shoes', colors: [1, 1] }, // £15-80, trainers and shoes
  hat: { price: [4, 14], slot: 'cap', colors: [1, 1] }, // £5-20
  gloves: { price: [4, 14], slot: 'gloves', colors: [1, 1] }, // £5-20
  sunglasses: { price: [4, 21], slot: 'sunglasses', colors: [1, 1] }, // £5-30
};

/** Where a garment is worn. The car's driver and the figure on foot are one person, in the same clothes. */
export const WORN_SLOTS = ['outfit', 'trousers', 'shoes', 'cap', 'gloves', 'sunglasses'] as const;
export type WornSlot = (typeof WORN_SLOTS)[number];

/** What each kind of shop has on its shelves. A motor shop's stock is the car catalogue's paint, patterns, decals and
 *  body parts, so it lists none of its own; a shop that sells nothing yet (a toy shop, a bookshop) lists none either. */
export const SHOP_SELLS: Record<ShopKind, readonly GoodKind[]> = {
  cafe: ['hot_drink', 'cold_drink', 'snack', 'sandwich', 'meal'],
  bakery: ['hot_drink', 'snack', 'sandwich'],
  grocer: ['snack', 'cold_drink'],
  clothes: GARMENT_KINDS,
  motor: [],
  none: [],
};
/** What a street shop's name has to say for it to be that kind of shop: the model, left to itself, made a bookshop a
 *  motor factor to fill the town's quota. A name that says none of these sells nothing yet. */
export const NAME_SAYS: Partial<Record<ShopKind, RegExp>> = {
  motor: /wrench|motor|garage|auto|spanner|tyre|parts|supplies|spares/i,
  clothes: /sew|lace|stitch|thread|wear|cloth|boutique|brim|hat|shoe|wool|knit|tailor/i,
  bakery: /bak|bread|bun|loaf|oven|muffin|cake|crust/i,
  grocer: /grocer|fruit|veg|green|basket|cart|pantry|larder|stall|market/i,
};
/** The shop kinds a place of each kind may be. */
export const PLACE_SHOPS: Record<string, readonly ShopKind[]> = { cafe: ['cafe'], market: ['grocer'], shop: ['bakery', 'grocer', 'clothes', 'motor', 'none'] };

export type Good = { id: string; kind: GoodKind; name: string; price: number; kcal?: number; colors?: string[] };
export type Shop = { id: string; name: string; sells: ShopKind; line: string; centre?: boolean; stock: Good[] };

const ID = /^[a-z][a-z0-9_]*$/, HEX = /^#[0-9a-f]{6}$/, NAME = /^[A-Za-z][A-Za-z '&-]*$/;
const PRICEY = /\d|£|\$|€|\bpoints?\b|\bcoins?\b|\bpay\b/i, EMOJI = /\p{Extended_Pictographic}/u;
const within = (n: unknown, [lo, hi]: readonly [number, number]) => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
export const isFood = (k: GoodKind): k is FoodKind => (FOOD_KINDS as readonly string[]).includes(k);
export const isGarment = (k: GoodKind): k is GarmentKind => (GARMENT_KINDS as readonly string[]).includes(k);

/** How the game knows a good: its shop and its own id, so a bought garment is owned by this key. */
export const goodKey = (shop: Shop, g: Good) => `${shop.id}/${g.id}`;

export function goodErrors(g: Good, sells: ShopKind): string[] {
  if (!g || typeof g !== 'object') return ['good is not an object'];
  const out: string[] = [];
  if (!ID.test(g.id ?? '')) out.push(`id "${g.id}": snake_case`);
  if (typeof g.name !== 'string' || g.name.length < 2 || g.name.length > 24 || !NAME.test(g.name)) out.push(`${g.id}: name must be 2-24 characters, letters, spaces, & ' and -`);
  if (!SHOP_SELLS[sells].includes(g.kind)) return [...out, `${g.id}: a ${sells} shop sells ${SHOP_SELLS[sells].join(', ') || 'nothing of its own'}, not ${g.kind}`];
  if (isFood(g.kind)) {
    const r = FOOD_RULES[g.kind];
    if (!within(g.price, r.price)) out.push(`${g.id}: a ${g.kind} costs ${r.price.join('-')} Points`);
    if (!within(g.kcal, r.kcal)) out.push(`${g.id}: a ${g.kind} has ${r.kcal.join('-')} kcal, a whole number`);
    if (g.colors !== undefined) out.push(`${g.id}: colors are for clothes, not food`);
  } else {
    const r = GARMENT_RULES[g.kind];
    if (!within(g.price, r.price)) out.push(`${g.id}: a ${g.kind} costs ${r.price.join('-')} Points`);
    if (!Array.isArray(g.colors) || g.colors.length < r.colors[0] || g.colors.length > r.colors[1] || g.colors.some((h) => !HEX.test(h))) out.push(`${g.id}: colors must be ${r.colors.join('-')} lowercase #rrggbb values`);
    if (g.kcal !== undefined) out.push(`${g.id}: kcal is for food, not clothes`);
  }
  return out;
}

/** `place`: the place this shop is, or undefined for a shopping centre unit. */
export function shopErrors(s: Shop, place?: { name: string; kind: string }): string[] {
  if (!s || typeof s !== 'object') return ['shop is not an object'];
  const out: string[] = [];
  if (!ID.test(s.id ?? '')) out.push(`id "${s.id}": snake_case`);
  if (!SHOP_KINDS.includes(s.sells)) return [...out, `${s.id}: sells must be one of ${SHOP_KINDS.join(', ')}`];
  if (place) {
    if (s.name !== place.name) out.push(`${s.id}: name must be the place's, "${place.name}"`);
    if (!(PLACE_SHOPS[place.kind] ?? []).includes(s.sells)) out.push(`${s.id}: a ${place.kind} can be a ${(PLACE_SHOPS[place.kind] ?? ['nothing']).join(' or ')} shop, not ${s.sells}`);
    if (s.centre) out.push(`${s.id}: a place on the street is not in the shopping centre`);
    const says = NAME_SAYS[s.sells];
    if (place.kind === 'shop' && says && !says.test(place.name)) out.push(`${s.id}: nothing in the name "${place.name}" says ${s.sells}, so it sells none (stock [])`);
  } else {
    if (!s.centre) out.push(`${s.id}: a shop with no place must be a shopping centre unit (centre: true)`);
    if (typeof s.name !== 'string' || s.name.length < 3 || s.name.length > 24 || !NAME.test(s.name)) out.push(`${s.id}: name must be 3-24 characters, letters, spaces, & ' and -`);
    if (s.sells === 'none' || s.sells === 'motor') out.push(`${s.id}: a centre unit sells food or clothes`);
  }
  if (typeof s.line !== 'string' || s.line.length < 8 || s.line.length > 60 || PRICEY.test(s.line) || EMOJI.test(s.line) || !/[.!]$/.test(s.line)) out.push(`${s.id}: line is 8-60 characters with no numbers, prices or emoji, ending in . or !`);
  if (!Array.isArray(s.stock)) return [...out, `${s.id}: stock must be a list`];
  const wants = SHOP_SELLS[s.sells];
  if (wants.length === 0 && s.stock.length) out.push(`${s.id}: a ${s.sells} shop lists no stock of its own`);
  if (wants.length && (s.stock.length < 4 || s.stock.length > 12)) out.push(`${s.id}: stock is 4-12 goods`);
  const kinds = new Set(s.stock.map((g) => g?.kind));
  if (s.sells !== 'clothes' && wants.length && kinds.size < Math.min(2, wants.length)) out.push(`${s.id}: sell at least two kinds of thing`);
  if (s.sells === 'clothes' && kinds.size < 3) out.push(`${s.id}: a clothes shop sells at least three kinds of garment`);
  if ((s.sells === 'cafe' || s.sells === 'bakery') && !s.stock.some((g) => g && (g.kind === 'snack' || g.kind === 'sandwich' || g.kind === 'meal'))) out.push(`${s.id}: something to eat, not only drinks`);
  const ids = new Set<string>();
  for (const g of s.stock) {
    out.push(...goodErrors(g, s.sells));
    if (g && ids.has(g.id)) out.push(`${s.id}: good id ${g.id} is used twice`);
    if (g) ids.add(g.id);
  }
  return out;
}

/** The whole set: every shop id unique, none the same as a car catalogue item's, and the town has the shops a player
 *  needs. A good is known by its shop and its own id (goodKey), so two cafés can both sell a pot_of_tea. */
export function shopSetErrors(shops: Shop[], catalogueIds: readonly string[]): string[] {
  const out: string[] = [], shopIds = new Set<string>();
  for (const s of shops) {
    if (shopIds.has(s.id)) out.push(`shop id ${s.id} is used twice`);
    if (catalogueIds.includes(s.id)) out.push(`shop id ${s.id} is a catalogue item's`);
    shopIds.add(s.id);
  }
  const count = (k: ShopKind, centre = false) => shops.filter((s) => s.sells === k && !!s.centre === centre).length;
  if (count('motor') < 1) out.push('the town needs a motor shop for paint and parts');
  if (count('clothes') < 1) out.push('the high street needs a clothes shop');
  if (count('bakery') < 1) out.push('the high street needs a bakery');
  const centre = shops.filter((s) => s.centre);
  if (centre.length && (centre.length < 6 || centre.length > 10)) out.push('the shopping centre has 6-10 units');
  if (centre.length && (!centre.some((s) => s.sells === 'clothes') || !centre.some((s) => s.sells === 'cafe'))) out.push('the shopping centre needs a clothes shop and a café');
  return out;
}
