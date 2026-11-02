// How the town's people look, as flat colours Qwen picks and this checks. The windows come from Habit Camp's pupil looks
// (skin across Fitzpatrick I-VI, natural hair, muted clothes), widened for adults' grey and white hair. The mix is held
// to Census 2021 for England and Wales: 18.6% of people are 65 or over, about 23% of adults, and 18% aren't White. Skin
// tone is only a rough stand-in for that second figure, and it is the country's mix, not any one town's.
export const HAIR_STYLES = ['short', 'long', 'ponytail', 'curly', 'cap'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export type PersonLook = { id: string; hairStyle: HairStyle; skin: string; hair: string; shirt: string; trousers: string; shoes: string };

type Hsl = { h: number; s: number; l: number };
type Window = { h: [number, number]; s: [number, number]; l: [number, number] };

export const COLOUR_FIELDS = ['skin', 'hair', 'shirt', 'trousers', 'shoes'] as const;
export const LOOK_WINDOW: Record<(typeof COLOUR_FIELDS)[number], Window> = {
  skin: { h: [10, 42], s: [0.2, 0.7], l: [0.14, 0.86] },
  hair: { h: [0, 48], s: [0, 0.78], l: [0.04, 0.72] },
  shirt: { h: [0, 360], s: [0, 0.7], l: [0.14, 0.86] },
  trousers: { h: [0, 360], s: [0, 0.6], l: [0.1, 0.7] },
  shoes: { h: [0, 360], s: [0, 0.5], l: [0.06, 0.62] },
};
export const SKIN_TONES = { fair: [0.72, 0.86], light: [0.58, 0.72], medium: [0.42, 0.58], brown: [0.28, 0.42], deep: [0.14, 0.28] } as const;
export type SkinTone = keyof typeof SKIN_TONES;
const GREY_S = 0.12, GREY_L: [number, number] = [0.45, 0.85]; // grey to white hair: nearly no colour, and any hue that's left doesn't matter
export const LOOKS_MIN = 24, OLDER_MIN = 0.2, DARKER_MIN = 0.16; // shares a little under the census's, as a set of 24 can't hit them exactly

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

export const greyHaired = (hex: string) => { const c = hexToHsl(hex); return c.s <= GREY_S && c.l >= GREY_L[0] && c.l <= GREY_L[1]; };
export const skinTone = (hex: string): SkinTone | undefined => { const { l } = hexToHsl(hex); return (Object.keys(SKIN_TONES) as SkinTone[]).find((t) => l >= SKIN_TONES[t][0] && l <= SKIN_TONES[t][1]); };

const inWindow = (c: Hsl, w: Window) => (c.s < 0.06 || (c.h >= w.h[0] && c.h <= w.h[1])) && c.s >= w.s[0] && c.s <= w.s[1] && c.l >= w.l[0] && c.l <= w.l[1];
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
/** Two colours that read as different side by side. */
const distinct = (a: Hsl, b: Hsl, gap: number) => Math.abs(a.l - b.l) >= gap || (Math.min(a.s, b.s) > 0.15 && hueGap(a.h, b.h) >= 35);
const fmt = (c: Hsl) => `h${Math.round(c.h)} s${c.s.toFixed(2)} l${c.l.toFixed(2)}`;

export function personErrors(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['entry is not an object'];
  const q = p as PersonLook, out: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(q.id ?? '')) out.push(`id "${q.id}": must be snake_case`);
  if (!HAIR_STYLES.includes(q.hairStyle)) out.push(`hairStyle "${q.hairStyle}": one of ${HAIR_STYLES.join(', ')}`);
  for (const f of COLOUR_FIELDS) if (typeof q[f] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(q[f])) out.push(`${f}: must be "#rrggbb"`);
  if (out.length) return out;
  const hsl = Object.fromEntries(COLOUR_FIELDS.map((f) => [f, hexToHsl(q[f])])) as Record<(typeof COLOUR_FIELDS)[number], Hsl>;
  for (const f of COLOUR_FIELDS) {
    const w = LOOK_WINDOW[f];
    if (f === 'hair' && greyHaired(q.hair)) continue;
    if (!inWindow(hsl[f], w)) out.push(`${q.id}.${f}: ${q[f]} (${fmt(hsl[f])}) is outside the real window h${w.h.join('-')} s${w.s.join('-')} l${w.l.join('-')}`);
  }
  if (!distinct(hsl.hair, hsl.skin, 0.1)) out.push(`${q.id}: hair ${q.hair} must read against skin ${q.skin}: lightness 0.10 apart`);
  if (!distinct(hsl.shirt, hsl.skin, 0.12)) out.push(`${q.id}: shirt ${q.shirt} is too close to skin ${q.skin}, and reads as bare`);
  if (!distinct(hsl.shirt, hsl.trousers, 0.08)) out.push(`${q.id}: shirt ${q.shirt} and trousers ${q.trousers} must differ`);
  return out;
}

/** Enough looks, every style, a real spread of ages and skin tones, and nobody's twin. */
export function peopleSetErrors(looks: readonly PersonLook[]): string[] {
  const out: string[] = [];
  if (looks.length < LOOKS_MIN) out.push(`need at least ${LOOKS_MIN} looks, have ${looks.length}`);
  for (const s of HAIR_STYLES) if (!looks.some((l) => l.hairStyle === s)) out.push(`no look uses hairStyle "${s}"`);
  const share = (is: (l: PersonLook) => boolean) => looks.filter(is).length / Math.max(1, looks.length);
  if (share((l) => greyHaired(l.hair)) < OLDER_MIN) out.push(`too few grey-haired looks: at least ${OLDER_MIN * 100}% of adults`);
  if (share((l) => ['medium', 'brown', 'deep'].includes(skinTone(l.skin) ?? '')) < DARKER_MIN) out.push(`too few medium to deep skin tones: at least ${DARKER_MIN * 100}%`);
  const seen = new Set<string>();
  for (const l of looks) {
    const sig = `${l.skin}|${l.hair}|${l.shirt}`.toLowerCase();
    if (seen.has(sig)) out.push(`${l.id}: duplicates another look's skin, hair and shirt`);
    seen.add(sig);
  }
  return out;
}
