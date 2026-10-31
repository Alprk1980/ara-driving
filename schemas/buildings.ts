// The town's generic buildings as a set of styles: what a block looks like, in metres and colours, so one style draws
// any footprint at true scale. Made by Qwen, checked here; src/view/buildingplan.ts picks a style per building.
import { DISTRICT_IDS, DISTRICTS, type DistrictId } from '../src/sim/districts.ts';

export const WALL_FINISHES = ['brick', 'render', 'panel', 'stone', 'cladding'] as const;
export const WINDOW_FORMS = ['punched', 'tall', 'arched', 'shuttered', 'ribbon', 'curtain'] as const;
export const GROUNDS = ['same', 'shopfront', 'arcade', 'loading', 'lobby'] as const;
export const ROOFS = ['flat', 'parapet', 'pitched', 'setback', 'plant'] as const;

export type BuildingStyle = {
  id: string;
  name: string;
  district: DistrictId;
  finish: (typeof WALL_FINISHES)[number];
  walls: string[]; // the colours a block of this style can be painted, one picked per building
  trim: string; // sills, string courses, frames
  glass: string;
  bay: number; // metres, window to window
  storey: number; // metres, floor to floor
  window: { form: (typeof WINDOW_FORMS)[number]; w: number; h: number }; // fractions of the bay and the storey
  ground: { kind: (typeof GROUNDS)[number]; height: number; main: string; accent: string }; // the street floor, metres tall
  roof: { kind: (typeof ROOFS)[number]; color: string };
  storeys: [number, number]; // the fewest and most floors, street floor included
};

const HEX = /^#[0-9a-f]{6}$/;
const ID = /^[a-z][a-z0-9_]*$/;
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map((c) => (c / 255) ** 2.2); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG-style contrast: 1 is the same lightness, 21 black on white. */
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** How far apart two colours are, 0-441. */
export const colorGap = (a: string, b: string) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const saturation = (hex: string) => { const c = rgb(hex); return (Math.max(...c) - Math.min(...c)) / 255; };

export function buildingStyleErrors(s: unknown): string[] {
  if (!s || typeof s !== 'object') return ['style is not an object'];
  const q = s as BuildingStyle, out: string[] = [];
  if (!ID.test(q.id ?? '')) out.push(`id "${q.id}": must be snake_case`);
  if (typeof q.name !== 'string' || q.name.length < 3 || q.name.length > 30) out.push('name: 3-30 characters');
  if (!oneOf(DISTRICT_IDS, q.district)) out.push(`district must be one of ${DISTRICT_IDS.join(', ')}`);
  if (!oneOf(WALL_FINISHES, q.finish)) out.push(`finish must be one of ${WALL_FINISHES.join(', ')}`);
  const hex = (what: string, v: unknown) => { if (typeof v !== 'string' || !HEX.test(v)) { out.push(`${what} must be #rrggbb lowercase`); return false; } return true; };
  if (!Array.isArray(q.walls) || q.walls.length < 3 || q.walls.length > 5) out.push('walls: 3-5 colours');
  else {
    const good = q.walls.filter((c, i) => hex(`walls[${i}]`, c));
    for (const c of good) {
      if (saturation(c) > 0.55) out.push(`walls colour ${c} is too loud for a whole building: keep max-min of its channels under 140`);
      if (lum(c) < 0.03) out.push(`walls colour ${c} is too dark for a bright toy town`);
    }
    for (let i = 0; i < good.length; i++) for (let j = i + 1; j < good.length; j++) if (colorGap(good[i], good[j]) < 28) out.push(`walls ${good[i]} and ${good[j]} are too alike to tell apart`);
    if (hex('glass', q.glass)) for (const c of good) if (contrast(c, q.glass) < 1.6) out.push(`glass ${q.glass} doesn't stand out from wall ${c}: make it darker`);
  }
  if (hex('trim', q.trim) && Array.isArray(q.walls) && q.walls.every((c) => typeof c === 'string' && HEX.test(c)) && q.walls.every((c) => colorGap(c, q.trim) < 24)) out.push('trim is the same as every wall colour');
  if (!num(q.bay) || q.bay < 2.4 || q.bay > 6) out.push(`bay ${q.bay}: 2.4-6 metres`);
  if (!num(q.storey) || q.storey < 2.7 || q.storey > 4.5) out.push(`storey ${q.storey}: 2.7-4.5 metres`);
  const w = q.window;
  if (!w || typeof w !== 'object') out.push('window must be an object');
  else {
    if (!oneOf(WINDOW_FORMS, w.form)) out.push(`window.form must be one of ${WINDOW_FORMS.join(', ')}`);
    if (!num(w.w) || w.w < 0.25 || w.w > 0.95) out.push(`window.w ${w.w}: 0.25-0.95 of the bay`);
    if (!num(w.h) || w.h < 0.25 || w.h > 0.9) out.push(`window.h ${w.h}: 0.25-0.9 of the storey`);
    if (w.form === 'ribbon' && num(w.h) && w.h > 0.55) out.push('a ribbon window is a band: window.h at most 0.55');
    if (w.form === 'ribbon' && num(w.w) && w.w < 0.8) out.push('a ribbon window runs on from bay to bay: window.w at least 0.8');
    if (w.form === 'curtain' && (!num(w.w) || w.w < 0.8 || !num(w.h) || w.h < 0.7)) out.push('a curtain wall is nearly all glass: window.w at least 0.8 and window.h at least 0.7');
    if (w.form === 'tall' && num(w.w) && num(w.h) && num(q.bay) && num(q.storey) && w.h * q.storey < w.w * q.bay * 1.3) out.push('a tall window must stand taller than it is wide, in metres');
    if (w.form === 'shuttered' && num(w.w) && w.w > 0.5) out.push('shutters need room beside the window: window.w at most 0.5');
  }
  const g = q.ground;
  if (!g || typeof g !== 'object') out.push('ground must be an object');
  else {
    if (!oneOf(GROUNDS, g.kind)) out.push(`ground.kind must be one of ${GROUNDS.join(', ')}`);
    if (!num(g.height) || g.height < 2.8 || g.height > 6) out.push(`ground.height ${g.height}: 2.8-6 metres`);
    hex('ground.main', g.main);
    hex('ground.accent', g.accent);
    if (typeof g.main === 'string' && typeof g.accent === 'string' && HEX.test(g.main) && HEX.test(g.accent) && g.kind !== 'same' && colorGap(g.main, g.accent) < 50) out.push('ground.accent must stand apart from ground.main');
  }
  const r = q.roof;
  if (!r || typeof r !== 'object') out.push('roof must be an object');
  else {
    if (!oneOf(ROOFS, r.kind)) out.push(`roof.kind must be one of ${ROOFS.join(', ')}`);
    hex('roof.color', r.color);
    if (r.kind === 'pitched' && Array.isArray(q.storeys) && q.storeys[1] > 5) out.push('a pitched roof tops a low building: storeys at most 5');
    if (r.kind === 'setback' && Array.isArray(q.storeys) && q.storeys[1] < 6) out.push('a setback needs height: storeys up to at least 6');
  }
  const st = q.storeys;
  if (!Array.isArray(st) || st.length !== 2 || !Number.isInteger(st[0]) || !Number.isInteger(st[1])) out.push('storeys must be two whole numbers');
  else if (st[0] < 2 || st[1] > 12 || st[0] > st[1]) out.push(`storeys ${st}: from at least 2 to at most 12, the first no bigger than the second`);
  if (oneOf(DISTRICT_IDS, q.district) && Array.isArray(st)) {
    const [lo, hi] = DISTRICTS[q.district].storeys;
    if (st[0] < lo || st[1] > hi) out.push(`storeys ${st}: ${DISTRICTS[q.district].name} is zoned for ${lo}-${hi} floors`);
  }
  if (Array.isArray(q.walls) && q.walls.every((c) => typeof c === 'string' && HEX.test(c))) {
    if (q.district === 'business') for (const c of q.walls) if (lum(c) < 0.42) out.push(`wall ${c}: the Business Quarter is pale and bright, use a lighter colour`);
    if (q.district === 'business' && typeof q.glass === 'string' && HEX.test(q.glass) && rgb(q.glass)[2] < rgb(q.glass)[0] + 25) out.push(`glass ${q.glass}: business glass is clearly blue`);
    if (q.district === 'garden') for (const c of q.walls) { if (lum(c) < 0.18) out.push(`wall ${c}: too dark for a garden suburb`); if (saturation(c) > 0.42) out.push(`wall ${c}: too harsh for a garden suburb, keep it soft`); }
  }
  if (q.district === 'works' && g && g.kind !== 'loading') out.push('a works building has a loading ground floor');
  if (q.district === 'garden' && g && g.kind !== 'same' && g.kind !== 'lobby') out.push('a garden suburb house has no shop or loading bay');
  return out;
}

/** Checks on the whole set: a town needs its styles to look different from each other. */
export function buildingSetErrors(list: BuildingStyle[]): string[] {
  const out: string[] = [];
  if (list.length < 10) out.push(`only ${list.length} styles: a town needs at least 10`);
  for (const d of DISTRICT_IDS) if (list.filter((s) => s.district === d).length < 3) out.push(`at least 3 ${DISTRICTS[d].name} styles`);
  for (const [what, all, get] of [['finish', WALL_FINISHES, (s: BuildingStyle) => s.finish], ['window form', WINDOW_FORMS, (s: BuildingStyle) => s.window.form], ['ground', GROUNDS, (s: BuildingStyle) => s.ground.kind], ['roof', ROOFS, (s: BuildingStyle) => s.roof.kind]] as const)
    for (const v of all) if (!list.some((s) => get(s) === v)) out.push(`no style uses ${what} ${v}`);
  list.forEach((a, i) => list.slice(i + 1).forEach((b) => {
    if (a.finish === b.finish && a.window.form === b.window.form && a.ground.kind === b.ground.kind && a.roof.kind === b.roof.kind) out.push(`${a.id} and ${b.id} are the same recipe: change a finish, window, ground or roof`);
    const near = a.walls.filter((c) => b.walls.some((d) => colorGap(c, d) < 22)).length;
    if (near >= 3) out.push(`${a.id} and ${b.id} share a palette: give ${b.id} different colours`);
  }));
  return out;
}
