// New building ideas, one per building type, written by Qwen and checked here, then drawn as sheets by Gemini to be built as pieces.
// Town styles keep the storeys their own style allows. Stations keep the sizes and door counts in schemas/services.ts. Sizes for the
// rest are judged from ordinary UK examples, with no design standard behind them: a high street shop plot 5-12 m wide, a primary
// school two storeys at most, a 12-40 m library. A pitched roof tops at most 5 floors and a setback needs 6, as for the town styles.
import { SERVICE_RULES, type ServiceId } from './services.ts';
import type { DistrictId } from '../src/sim/districts.ts';

export const IDEA_ROOFS = ['flat', 'parapet', 'pitched', 'mansard', 'sawtooth', 'barrel', 'setback'] as const;
export type Band = [number, number];
export type BuildingType = { type: string; title: string; brief: string; storeys: Band; wide: Band; deep: Band; bays?: Band };
export type BuildingIdea = { id: string; type: string; name: string; concept: string; storeys: number; wide: number; deep: number; roof: (typeof IDEA_ROOFS)[number]; walls: string; features: string[]; bays?: number };

const DISTRICT_SIZE: Record<DistrictId, { wide: Band; deep: Band }> = {
  oldtown: { wide: [6, 26], deep: [8, 24] },
  business: { wide: [18, 44], deep: [18, 44] },
  garden: { wide: [6, 18], deep: [7, 16] },
  works: { wide: [14, 50], deep: [8, 44] }, // a mill is long and narrow, to get daylight to the floor
};
const PLACES: BuildingType[] = [
  { type: 'place_shop', title: 'Corner shop', brief: 'a small shop on a street corner', storeys: [1, 3], wide: [5, 14], deep: [6, 16] },
  { type: 'place_cafe', title: 'Cafe', brief: 'a neighbourhood cafe with room for outdoor tables', storeys: [1, 2], wide: [6, 16], deep: [6, 16] },
  { type: 'place_school', title: 'Primary school', brief: 'a primary school', storeys: [1, 2], wide: [18, 50], deep: [12, 30] },
  { type: 'place_market', title: 'Market hall', brief: 'a covered town market hall', storeys: [1, 2], wide: [16, 40], deep: [14, 36] },
  { type: 'place_office', title: 'Small office', brief: 'a small office for a local firm', storeys: [2, 5], wide: [10, 28], deep: [10, 24] },
  { type: 'place_clinic', title: 'Clinic', brief: 'a community health clinic', storeys: [1, 3], wide: [14, 36], deep: [10, 26] },
  { type: 'place_library', title: 'Library', brief: 'a town library', storeys: [1, 3], wide: [12, 40], deep: [12, 30] },
  { type: 'place_house', title: 'Detached house', brief: 'a family home', storeys: [1, 3], wide: [8, 16], deep: [7, 14] },
  { type: 'place_depot', title: 'Bus depot', brief: 'a working depot with vehicle doors', storeys: [1, 2], wide: [20, 50], deep: [12, 44] },
];
const STATION_BRIEF: Record<ServiceId, string> = { fire: 'a fire station with appliance bays and a drill tower', ambulance: 'an ambulance station with vehicle bays', police: 'a town police station' };

/** Every building type the game has: its town styles, its stations and the buildings among its place kinds. */
export function buildingTypes(styles: { id: string; name: string; district: DistrictId; storeys: Band }[]): BuildingType[] {
  return [
    ...styles.map((s): BuildingType => ({ type: `style_${s.id}`, title: s.name, brief: `a building in the town's ${s.name} style, in its ${s.district} district`, storeys: s.storeys, ...DISTRICT_SIZE[s.district] })),
    ...(Object.keys(SERVICE_RULES) as ServiceId[]).map((id): BuildingType => { const r = SERVICE_RULES[id]; return { type: `station_${id}`, title: `${id[0].toUpperCase()}${id.slice(1)} station`, brief: STATION_BRIEF[id], storeys: [1, 3], wide: [r.hx * 1.5, r.hx * 2.5], deep: [r.hz * 1.5, r.hz * 2.5], bays: r.doors }; }),
    ...PLACES,
  ];
}

const ID = /^[a-z][a-z0-9_]*$/, num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const NOT_DRAWABLE = /\b(logo|brand|trademark|sign reading|lettering|words?|people|person|cars?|trees?|shadows?)\b/i;

export function ideaErrors(raw: unknown, type: BuildingType, taken: string[] = []): string[] {
  if (!raw || typeof raw !== 'object') return ['idea is not an object'];
  const q = raw as BuildingIdea, out: string[] = [], tag = q.id ?? type.type;
  const within = (what: string, v: unknown, r: Band) => { if (!num(v) || v < r[0] || v > r[1]) out.push(`${tag}: ${what} ${v} must be ${r[0]}-${r[1]}`); };
  if (!ID.test(q.id ?? '')) out.push(`${tag}: id must be snake_case`);
  if (q.type !== type.type) out.push(`${tag}: type must be ${type.type}`);
  if (typeof q.name !== 'string' || q.name.length < 3 || q.name.length > 34) out.push(`${tag}: name 3-34 characters`);
  else if (taken.some((t) => t.toLowerCase() === q.name.toLowerCase())) out.push(`${tag}: "${q.name}" is taken, this must be a new idea`);
  if (typeof q.concept !== 'string' || q.concept.length < 40 || q.concept.length > 260) out.push(`${tag}: concept 40-260 characters`);
  within('storeys', q.storeys, type.storeys);
  if (!Number.isInteger(q.storeys)) out.push(`${tag}: storeys must be a whole number`);
  within('wide', q.wide, type.wide);
  within('deep', q.deep, type.deep);
  if (!IDEA_ROOFS.includes(q.roof)) out.push(`${tag}: roof must be one of ${IDEA_ROOFS.join(', ')}`);
  if (q.roof === 'pitched' && q.storeys > 5) out.push(`${tag}: a pitched roof tops at most 5 floors`);
  if (q.roof === 'setback' && q.storeys < 6) out.push(`${tag}: a setback needs at least 6 floors`);
  if (typeof q.walls !== 'string' || q.walls.length < 5 || q.walls.length > 70) out.push(`${tag}: walls 5-70 characters`);
  if (!Array.isArray(q.features) || q.features.length < 3 || q.features.length > 6 || q.features.some((f) => typeof f !== 'string' || f.length < 4 || f.length > 70)) out.push(`${tag}: features: 3-6 short phrases`);
  if (type.bays) within('bays', q.bays, type.bays);
  else if (q.bays !== undefined) out.push(`${tag}: only a station has bays`);
  const words = [q.concept, q.walls, ...(Array.isArray(q.features) ? q.features : [])].filter((t) => typeof t === 'string').join(' ');
  const hit = NOT_DRAWABLE.exec(words);
  if (hit) out.push(`${tag}: "${hit[0]}" can't be part of the drawing: describe only the building`);
  return out;
}
