// Each car's cabin colours, which Qwen picks and this checks: what you see from the driver's seat in the cockpit view.
//
// The one hard rule is the dashboard's top. Sunlight through the windscreen bounces off the dash and back off the inside
// of the glass into the driver's eyes, "veiling glare"; carmakers' patents (Ford's US6299231, US10088616) name a light,
// glossy dash as a cause and a dark one as the cure. No published reflectance limit turned up, so the lightness cap
// here is judged. The rest follows what cars are trimmed in: dark plastics low down, a light headlining overhead (the
// usual grey or beige), and seats in black, grey or beige cloth, with a bold colour allowed in the sporty cars only.
import { hue, lightness } from './furniture.ts';

export type InteriorPalette = { id: string; pad: string; lower: string; frame: string; lining: string; seat: string; rim: string; screen: string };
export const INTERIOR_KEYS = ['pad', 'lower', 'frame', 'lining', 'seat', 'rim', 'screen'] as const;
export const DASH_TOP_MAX = 0.3; // lightness, 0-1, of the dash top: judged, as no published limit turned up
export const LINING = [0.55, 0.88] as const; // a headlining's lightness: light greys and beiges
export const PLAIN_SAT = 0.35; // trim that isn't the sporty seats: greys, blacks and beiges, little colour
export const SPORTY = ['coupe', 'supercar'] as const; // the cars that may have coloured seats

const HEX = /^#[0-9a-f]{6}$/;

export function interiorErrors(p: InteriorPalette, cars: readonly string[]): string[] {
  if (!p || typeof p !== 'object') return ['entry is not an object'];
  if (!cars.includes(p.id)) return [`id "${p.id}": one of the cars, ${cars.join(', ')}`];
  const out: string[] = [];
  for (const k of INTERIOR_KEYS) if (!HEX.test(p[k] ?? '')) out.push(`${p.id}: ${k} must be lowercase #rrggbb`);
  if (out.length) return out;
  if (lightness(p.pad) > DASH_TOP_MAX) out.push(`${p.id}: the dash top (pad) must be dark, lightness at most ${DASH_TOP_MAX}, or it reflects in the windscreen`);
  if (lightness(p.lower) > 0.5) out.push(`${p.id}: the lower dash is a darker plastic, lightness at most 0.5`);
  if (lightness(p.rim) > 0.25) out.push(`${p.id}: the steering wheel rim is dark, lightness at most 0.25`);
  if (lightness(p.lining) < LINING[0] || lightness(p.lining) > LINING[1]) out.push(`${p.id}: the headlining is light, lightness ${LINING[0]}-${LINING[1]}`);
  if (lightness(p.screen) > 0.35) out.push(`${p.id}: the screen is dark when there's nothing on it, lightness at most 0.35`);
  for (const k of ['pad', 'lower', 'frame', 'rim', 'lining'] as const) if (hue(p[k]).s > PLAIN_SAT && lightness(p[k]) > 0.12) out.push(`${p.id}: ${k} is plain trim: grey, black or beige, saturation at most ${PLAIN_SAT}`);
  if (!(SPORTY as readonly string[]).includes(p.id) && hue(p.seat).s > PLAIN_SAT && lightness(p.seat) > 0.12) out.push(`${p.id}: seats are black, grey or beige cloth; only the coupe and supercar may have coloured seats`);
  if (Math.abs(lightness(p.pad) - lightness(p.lining)) < 0.25) out.push(`${p.id}: the dash and headlining should differ, as dark below and light above`);
  return out;
}
