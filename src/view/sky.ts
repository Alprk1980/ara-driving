// The colour of the day: blends the generated sky keyframes around the clock, then greys them for rain.
import type { Sky } from '../../schemas/content.ts';

export type Rgb = [number, number, number]; // sRGB, 0 to 1
export type SkyNow = { sky: Rgb; fog: Rgb; sun: Rgb; tint: Rgb; sunPower: number; ambient: number; night: number; fogNear: number; fogFar: number };

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number) => a.map((v, i) => mix(v, b[i], t)) as Rgb;
const RAIN_GREY: Rgb = [0.62, 0.66, 0.72];

export function skyAt(skies: Sky[], frac: number, rain: number): SkyNow {
  const keys = [...skies].sort((a, b) => a.at - b.at);
  const after = keys.findIndex((k) => k.at > frac);
  const b = keys[after < 0 ? 0 : after], a = keys[after <= 0 ? keys.length - 1 : after - 1];
  const span = (b.at - a.at + 1) % 1 || 1, t = ((frac - a.at + 1) % 1) / span;
  const wet = rain * 0.6;
  return {
    sky: mixRgb(mixRgb(rgb(a.sky), rgb(b.sky), t), RAIN_GREY, wet * (1 - mix(a.night, b.night, t) * 0.7)),
    fog: mixRgb(mixRgb(rgb(a.fog), rgb(b.fog), t), RAIN_GREY, wet * (1 - mix(a.night, b.night, t) * 0.7)),
    sun: mixRgb(rgb(a.sun), rgb(b.sun), t),
    tint: mixRgb(rgb(a.tint), rgb(b.tint), t).map((v) => v * (1 - rain * 0.15)) as Rgb,
    sunPower: mix(a.sunPower, b.sunPower, t) * (1 - rain * 0.6),
    ambient: mix(a.ambient, b.ambient, t) * (1 - rain * 0.12),
    night: mix(a.night, b.night, t),
    fogNear: 220 - rain * 110,
    fogFar: 900 - rain * 380,
  };
}
