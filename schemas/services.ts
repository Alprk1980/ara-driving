// The stations crews drive out of, and what the game says about your driving, both written by Qwen and checked here.
// A station is built from plain parts plus its doors, front to +z. A fire station's bay is 6.5 m wide in London's
// standard brief, and a whole-time station has at least 3 (Warwickshire's guidance); a station's hall and tower follow
// that. The ambulance and police rows are judged, as no UK design figures turned up.
import { SHAPES, type Part } from './content.ts';

export const SERVICE_IDS = ['fire', 'ambulance', 'police'] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];
export type Door = { x: number; w: number; h: number };
export type ServiceBuilding = { id: ServiceId; name: string; parts: Part[]; doors: Door[] };

export const SERVICE_RULES: Record<ServiceId, { hx: number; hz: number; top: number; doors: [number, number]; bay: [number, number]; door: string }> = {
  fire: { hx: 12, hz: 8, top: 15, doors: [3, 3], bay: [5, 6.5], door: '#c8201e' },
  ambulance: { hx: 10, hz: 7, top: 9, doors: [2, 3], bay: [3.6, 5], door: '#e8e6dc' },
  police: { hx: 10, hz: 7, top: 13, doors: [0, 1], bay: [3, 5], door: '#2f4f8f' },
};

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-f]{6}$/i;

export function serviceErrors(c: unknown): string[] {
  if (!c || typeof c !== 'object') return ['entry is not an object'];
  const q = c as ServiceBuilding, r = SERVICE_RULES[q.id], out: string[] = [];
  if (!r) return [`id "${q.id}": must be one of ${SERVICE_IDS.join(', ')}`];
  if (typeof q.name !== 'string' || q.name.length < 3 || q.name.length > 26 || !/^[A-Za-z ]+$/.test(q.name)) out.push('name: 3-26 letters and spaces');
  if (!Array.isArray(q.parts) || q.parts.length < 6 || q.parts.length > 24) return [...out, 'parts: 6-24'];
  q.parts.forEach((p, i) => {
    if (!SHAPES.includes(p.shape) || ![p.x, p.y, p.z, p.w, p.h, p.l].every(num) || !HEX.test(p.color ?? '')) { out.push(`parts[${i}]: needs shape, x, y, z, w, h, l and a #rrggbb color`); return; }
    if (p.w <= 0 || p.h <= 0 || p.l <= 0 || p.y < 0) out.push(`parts[${i}]: sizes must be positive, and y at least 0`);
    if (Math.abs(p.x) + p.w / 2 > r.hx + 0.01 || Math.abs(p.z) + p.l / 2 > r.hz + 0.01) out.push(`parts[${i}]: must stay inside ${r.hx * 2} by ${r.hz * 2} m`);
    if (p.y + p.h > r.top + 0.01) out.push(`parts[${i}]: must stay under ${r.top} m`);
  });
  const wide = q.parts.filter((p) => p.y === 0 && p.w * p.l >= r.hx * r.hz).length;
  if (!wide) out.push(`needs a main building on the ground, at least ${r.hx * r.hz} m² in plan`);
  if (!Array.isArray(q.doors) || q.doors.length < r.doors[0] || q.doors.length > r.doors[1]) return [...out, `doors: ${r.doors.join('-')}`];
  const sorted = [...q.doors].sort((a, b) => a.x - b.x);
  sorted.forEach((d, i) => {
    if (!num(d.x) || !num(d.w) || !num(d.h)) { out.push(`doors[${i}]: needs x, w and h`); return; }
    if (d.w < r.bay[0] || d.w > r.bay[1]) out.push(`doors[${i}]: a bay is ${r.bay.join('-')} m wide`);
    if (d.h < 3 || d.h > 5) out.push(`doors[${i}]: 3-5 m tall`);
    if (Math.abs(d.x) + d.w / 2 > r.hx) out.push(`doors[${i}]: must sit on the front`);
    if (i && d.x - d.w / 2 < sorted[i - 1].x + sorted[i - 1].w / 2 + 0.2) out.push(`doors[${i}]: leave a pier between doors`);
  });
  if (q.id === 'fire' && !q.parts.some((p) => p.h >= 10)) out.push('a fire station has a tall drill tower: one part at least 10 m high');
  return out;
}

export const ROAD_MOMENTS = ['red_stop', 'zebra_wait', 'blue_pull', 'stopped_after', 'red_run', 'zebra_run', 'blue_block', 'drove_off', 'pulled_over', 'got_away', 'course', 'phone_use', 'hoax_call', 'recovery_called'] as const;
export type RoadMoment = (typeof ROAD_MOMENTS)[number];
export type RoadLine = { id: string; moment: RoadMoment; text: string };
const WORDS: Partial<Record<RoadMoment, RegExp>> = { red_run: /\b(red|light|lights)\b/i, red_stop: /\b(red|light|lights|waited|wait|stop|stopped)\b/i, zebra_run: /\b(zebra|crossing|pedestrian|pedestrians|walkers|people)\b/i, zebra_wait: /\b(zebra|crossing|pedestrian|pedestrians|waited|people)\b/i, blue_pull: /\b(blue|ambulance|crew|police|fire|siren|way)\b/i, blue_block: /\b(blue|ambulance|crew|police|fire|siren|way)\b/i, stopped_after: /\b(stop|stopped|stopping|stayed)\b/i, drove_off: /\b(stop|stopped|scene|drove|left|leaving)\b/i, course: /\b(course|licence)\b/i, phone_use: /\b(phone|mobile|call|calling)\b/i, hoax_call: /\b(emergency|call|calling|calls)\b/i, recovery_called: /\b(truck|recovery|tow|way)\b/i };

export function roadLineErrors(c: unknown): string[] {
  if (!c || typeof c !== 'object') return ['entry is not an object'];
  const q = c as RoadLine, out: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(q.id ?? '')) out.push(`id "${q.id}": snake_case`);
  if (!ROAD_MOMENTS.includes(q.moment)) return [...out, `moment must be one of ${ROAD_MOMENTS.join(', ')}`];
  if (typeof q.text !== 'string' || !q.text.trim() || q.text.split(/\s+/).length > 9) return [...out, `${q.id}: text must be 1-9 words`];
  if (/[\d{}]/.test(q.text) || /[\u{1F300}-\u{1FAFF}]/u.test(q.text)) out.push(`${q.id}: no digits, slots or emoji`);
  const word = WORDS[q.moment];
  if (word && !word.test(q.text)) out.push(`${q.id}: must mention ${word.source}`);
  return out;
}
