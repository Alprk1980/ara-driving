// The town's street furniture, as low-poly parts Qwen designs and this checks. x runs along the kerb, +z faces the road,
// y is up from the pavement, all in metres. Sizes are real ones:
// - bench: seats 470-480 mm high and a back at least 300 mm above the seat, from Inclusive Mobility (DfT 2021) and
//   BS 8300-1:2018 as quoted by Wheels for Wellbeing; the primary text wasn't checked. Length is judged round 1.8 m.
// - bin: UK cast iron litter bins, 90-125 L: Broxap Round Medium 965 mm tall by 495 across, Bollards Square Standard
//   1027 by 490, Hartecast HC2057 about 1240 by 480.
// - bollard: at least 1000 mm high with a contrasting collar, from a London council's public realm guide, not the DfT.
// - cycle_rack: one Sheffield stand. Broxap 715 wide by 800 high, Dublin 750 by 820, Bracknell 650-750 high.
// - bus_shelter: no UK standard. Makers' three-bay shelters run 3.0-4.6 m long, 1.2-2.0 deep, 2.4-2.6 m to the roof.
// - container: a 20 ft ISO 668 box, 6.058 m long, 2.438 wide, 2.591 tall.
// - pallets: a UK standard pallet is 1200 by 1000 mm (ISO 6780), about 144 mm tall, loaded to judged heights.
// - planter: no standard; the sizes are judged from town centre planters.
// Hedges aren't here: one tinted box stretched to length, with nothing to design.
import { SHAPES, type Part } from './content.ts';

export const FURNITURE_IDS = ['bench', 'bin', 'planter', 'bollard', 'cycle_rack', 'bus_shelter', 'container', 'pallets'] as const;
export type FurnitureId = (typeof FURNITURE_IDS)[number];
export type FurnitureModel = { id: FurnitureId; parts: Part[] };

// w: overall width along the kerb (x), l: depth (z), top: overall height, parts: how many pieces.
type Rule = { w: [number, number]; l: [number, number]; top: [number, number]; parts: [number, number] };
export const FURNITURE_RULES: Record<FurnitureId, Rule> = {
  bench: { w: [1.5, 2.0], l: [0.45, 0.75], top: [0.8, 1.0], parts: [4, 10] },
  bin: { w: [0.4, 0.6], l: [0.4, 0.6], top: [0.95, 1.25], parts: [2, 6] },
  planter: { w: [0.7, 1.6], l: [0.7, 1.6], top: [0.9, 2.2], parts: [2, 8] },
  bollard: { w: [0.12, 0.3], l: [0.12, 0.3], top: [1.0, 1.15], parts: [2, 5] },
  cycle_rack: { w: [0.65, 0.85], l: [0.04, 0.12], top: [0.7, 0.85], parts: [3, 6] },
  bus_shelter: { w: [3.0, 4.6], l: [1.2, 2.0], top: [2.4, 2.6], parts: [5, 14] },
  container: { w: [2.4, 2.48], l: [6.0, 6.1], top: [2.55, 2.65], parts: [1, 8] },
  pallets: { w: [1.0, 3.6], l: [1.0, 3.6], top: [0.8, 2.0], parts: [2, 10] },
};
export const SEAT_M: [number, number] = [0.45, 0.5]; // 470-480 mm, widened a little for low-poly
export const BACK_ABOVE_SEAT_M = 0.3;
export const PALLET = { a: 1.2, b: 1.0, h: [0.12, 0.17] as [number, number], slack: 0.05 };
const COLLAR_CONTRAST = 0.35; // a difference in lightness, 0-1, a judged stand-in for the "contrasting colour" rule
const THIN_M = 0.02; // tubes and glass can be thin, but not vanish

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-f]{6}$/;
const near = (n: number, [lo, hi]: [number, number]) => n >= lo - 1e-6 && n <= hi + 1e-6;
const span = ([lo, hi]: [number, number]) => `${lo}-${hi} m`;

export function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}
export function hue(hex: string): { h: number; s: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return { h: 0, s: 0 };
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s: d / (1 - Math.abs(2 * l - 1)) };
}

const touching = (a: Part, b: Part) => {
  const gap = 0.03;
  return Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) <= (a.l + b.l) / 2 + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap;
};

export function furnitureErrors(m: FurnitureModel): string[] {
  if (!m || typeof m !== 'object') return ['entry is not an object'];
  const r = FURNITURE_RULES[m.id];
  if (!r) return [`id "${m.id}": must be one of ${FURNITURE_IDS.join(', ')}`];
  const out: string[] = [], ps = m.parts;
  if (!Array.isArray(ps) || ps.length < r.parts[0] || ps.length > r.parts[1]) return [`${m.id}: ${r.parts[0]}-${r.parts[1]} parts`];
  ps.forEach((p, i) => {
    const at = `${m.id} part ${i + 1}`;
    if (!SHAPES.includes(p.shape)) out.push(`${at}: shape must be one of ${SHAPES.join(', ')}`);
    if (![p.x, p.y, p.z, p.w, p.h, p.l].every(num)) return out.push(`${at}: x, y, z, w, h, l must all be numbers`);
    if (Math.min(p.w, p.h, p.l) < THIN_M) out.push(`${at}: w, h and l must be at least ${THIN_M}`);
    if (p.y < 0) out.push(`${at}: y is the base, and must be 0 or more`);
    if (!HEX.test(p.color ?? '')) out.push(`${at}: color must be lowercase #rrggbb`);
    else if ((p.color === '#ffffff') !== (m.id === 'container' && i === 0)) out.push(m.id === 'container' ? `${at}: only part 1, the container's box, is #ffffff, as it takes each one's paint` : `${at}: pure white #ffffff is kept for parts the town paints; pick another colour`);
  });
  if (out.length) return out;

  const x0 = Math.min(...ps.map((p) => p.x - p.w / 2)), x1 = Math.max(...ps.map((p) => p.x + p.w / 2));
  const z0 = Math.min(...ps.map((p) => p.z - p.l / 2)), z1 = Math.max(...ps.map((p) => p.z + p.l / 2)), top = Math.max(...ps.map((p) => p.y + p.h));
  if (!near(x1 - x0, r.w)) out.push(`${m.id} is ${(x1 - x0).toFixed(2)} m wide along the kerb (x): a real one is ${span(r.w)}`);
  if (!near(z1 - z0, r.l)) out.push(`${m.id} is ${(z1 - z0).toFixed(2)} m deep (z): a real one is ${span(r.l)}`);
  if (!near(top, r.top)) out.push(`${m.id} stands ${top.toFixed(2)} m tall: a real one is ${span(r.top)}`);
  if (Math.abs(x0 + x1) > 0.1 || Math.abs(z0 + z1) > 0.1) out.push(`${m.id}: centre it on x 0, z 0`);

  // Everything joins up with something on the ground, so nothing floats.
  const held = new Set(ps.filter((p) => p.y < 0.01));
  if (!held.size) out.push(`${m.id}: at least one part stands on the ground, at y 0`);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of ps) if (!held.has(p) && [...held].some((h) => touching(h, p))) { held.add(p); grew = true; }
  }
  ps.forEach((p, i) => { if (!held.has(p)) out.push(`${m.id} part ${i + 1}: floats, it must touch a part that reaches the ground`); });
  return [...out, ...kindErrors(m.id, ps, top)];
}

function kindErrors(id: FurnitureId, ps: Part[], top: number): string[] {
  const out: string[] = [];
  if (id === 'bench' || id === 'bus_shelter') {
    const seat = ps.find((p) => near(p.y + p.h, id === 'bench' ? SEAT_M : [0.45, 0.8]) && p.h <= 0.15 && p.w >= (id === 'bench' ? 1.3 : 1) && p.l >= 0.25);
    if (!seat) out.push(id === 'bench' ? `a bench needs a seat: a slab at least 1.3 m long and 0.25 m deep, at most 0.15 thick, its top ${span(SEAT_M)} up` : 'a bus shelter has a seat or perch inside: a slab at least 1 m long and 0.25 deep, its top 0.45-0.8 m up');
    else if (id === 'bench' && !ps.some((p) => p !== seat && p.z + p.l / 2 < seat.z && p.y + p.h >= seat.y + seat.h + BACK_ABOVE_SEAT_M && p.w >= 1.2)) out.push(`a bench needs a back behind the seat (lower z), at least 1.2 m long, rising ${BACK_ABOVE_SEAT_M} m or more above the seat`);
  }
  if (id === 'bollard') {
    const post = ps.reduce((a, b) => (b.h > a.h ? b : a)), bands = ps.filter((p) => p !== post && p.y > top - 0.45 && p.h >= 0.06 && Math.abs(lightness(p.color) - lightness(post.color)) >= COLLAR_CONTRAST);
    if (!bands.length) out.push(`a bollard needs a contrasting collar near the top: a band at least 0.06 m tall, in the top 0.45 m, much lighter or darker than the post (lightness ${COLLAR_CONTRAST} apart)`);
  }
  if (id === 'cycle_rack') {
    const legs = ps.filter((p) => p.y < 0.01 && p.h >= 0.5);
    if (legs.length !== 2) out.push('a Sheffield stand is one bent tube: exactly 2 legs from the ground, each at least 0.5 m tall');
    if (ps.some((p) => Math.min(p.w, p.l) > 0.08)) out.push('a Sheffield stand is a tube about 50 mm thick: every part at most 0.08 m across');
  }
  if (id === 'bus_shelter') {
    const roof = ps.find((p) => p.y + p.h >= top - 0.01 && p.w >= 2.8 && p.l >= 1.1);
    if (!roof) out.push('a bus shelter needs a roof over it all: the top part at least 2.8 m long and 1.1 m deep');
    if (!ps.some((p) => p.l <= 0.1 && p.w >= 2.5 && p.h >= 1.8 && p.z < 0)) out.push('a bus shelter has a back wall of glass on the far side from the road (z below 0): a panel at least 2.5 m long, 1.8 tall and at most 0.1 thick');
    const front = ps.filter((p) => p.z > 0 && p.y < 1.8 && p.h >= 0.8 && p.w > 1.2 && p.l <= 0.4);
    if (front.length) out.push('a bus shelter is open to the road (+z), so people can see the bus and get on: no wall more than 1.2 m long on the front');
  }
  if (id === 'planter') {
    if (!ps.some((p) => p.y >= 0.3 && hue(p.color).h > 0.17 && hue(p.color).h < 0.45 && hue(p.color).s > 0.25)) out.push('a planter needs plants: a green part sitting on the box, 0.3 m up or more');
    if (!ps.some((p) => p.y < 0.01 && p.h >= 0.35 && p.h <= 1 && p.w >= 0.6 && p.l >= 0.6)) out.push('a planter needs its box on the ground: 0.35-1 m tall, at least 0.6 m each way');
  }
  if (id === 'pallets') {
    const fits = (p: Part, a: number, b: number) => Math.abs(p.w - a) <= PALLET.slack && Math.abs(p.l - b) <= PALLET.slack;
    const bases = ps.filter((p) => p.shape === 'box' && p.y < 0.01 && near(p.h, PALLET.h) && (fits(p, PALLET.a, PALLET.b) || fits(p, PALLET.b, PALLET.a)));
    if (!bases.length) out.push(`pallets need at least one real pallet on the ground: a box ${PALLET.a} by ${PALLET.b} m, ${span(PALLET.h)} tall, at y 0`);
    else if (!ps.some((p) => bases.some((b) => p.y >= b.h - 0.01 && touching(p, b)))) out.push('a pallet carries a load: put goods on top of a pallet');
  }
  if (id === 'container' && ps[0].w * ps[0].h * ps[0].l < 2.4 * 2.5 * 5.9) out.push('part 1 is the container\'s box: the full 6.06 by 2.44 by 2.59 m');
  return out;
}
