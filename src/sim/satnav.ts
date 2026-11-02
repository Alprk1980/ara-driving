// The sat nav's side of the map: everywhere it can take you, how far by road, and when you'd get there. Pure, so tests
// can check it without a screen.
import type { Game } from './game.ts';
import { DISTRICTS, DISTRICT_IDS, districtAt } from './districts.ts';
import { placeAt } from './quests.ts';
import { route, type Manoeuvre } from './route.ts';
import type { Vec } from './town.ts';
import type { Place } from '../../schemas/content.ts';

/** Arrival times use the average speed on England's local A roads, 23.0 mph across 2024 (DfT, travel time measures,
 * CGN0503). Real sat navs use speeds per road; this town has no speed limits, so one town-wide average stands in. */
export const URBAN_MPS = 23.0 * 0.44704;

export type DestGroup = 'Fuel and repairs' | 'Home' | 'Emergency services' | 'Districts' | (typeof KIND_GROUP)[Place['kind']];
export type Dest = { key: string; name: string; group: DestGroup; at: Vec; metres: number };

const KIND_GROUP = { shop: 'Shops', cafe: 'Cafés', market: 'Markets', school: 'Schools', park: 'Parks', library: 'Libraries', clinic: 'Clinics', office: 'Offices', depot: 'Depots', house: 'Houses' } as const;
const SERVICE_NAME = { fire: 'Fire station', ambulance: 'Ambulance station', police: 'Police station' } as const;
export const GROUP_ORDER: DestGroup[] = ['Fuel and repairs', 'Home', 'Emergency services', 'Districts', ...Object.values(KIND_GROUP)];

/** Everywhere worth driving to, each with its distance by road from the car, nearest first within each group.
 * Named places stand on more than one plot, so each name is listed once, at its nearest. */
export function destinations(g: Game): Dest[] {
  const t = g.town, p = g.player, by = (at: Vec) => route(t, p, at, p.dir).length;
  const out: Dest[] = [];
  t.stations.forEach((s, i) => out.push({ key: `station:${i}`, name: `Petrol station, ${DISTRICTS[districtAt(s.x, s.z)].name}`, group: 'Fuel and repairs', at: s.road, metres: by(s.road) }));
  out.push({ key: 'home', name: 'Home garage', group: 'Home', at: t.home.road, metres: by(t.home.road) });
  for (const s of t.services) out.push({ key: `service:${s.id}`, name: SERVICE_NAME[s.id], group: 'Emergency services', at: s.road, metres: by(s.road) });
  for (const id of DISTRICT_IDS) { const h = t.heart(id); out.push({ key: `district:${id}`, name: `${DISTRICTS[id].name} centre`, group: 'Districts', at: h.road, metres: by(h.road) }); }
  const nearest = new Map<string, Dest>();
  for (const plot of t.plots) {
    const place = placeAt(t, g.content.places, plot);
    if (!place) continue;
    const straight = Math.hypot(plot.x - p.x, plot.z - p.z), had = nearest.get(place.id);
    if (had && Math.hypot(had.at.x - p.x, had.at.z - p.z) <= straight) continue; // straight-line first, so only the nearest of each is routed
    nearest.set(place.id, { key: `place:${place.id}`, name: place.name, group: KIND_GROUP[place.kind], at: plot.road, metres: 0 });
  }
  for (const d of nearest.values()) out.push({ ...d, metres: by(d.at) });
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.metres - b.metres);
}

/** The nearest destination in a group, as the sat nav's quick buttons pick. */
export const nearestIn = (all: Dest[], group: DestGroup) => all.filter((d) => d.group === group).sort((a, b) => a.metres - b.metres)[0] ?? null;

/** Seconds to drive so far at the town's average speed. */
export const etaSeconds = (metres: number) => metres / URBAN_MPS;

/** A distance in metres to the nearest ten, then kilometres past one. A British sat nav would say yards and miles, but
 * the game measures in km/h and metres everywhere, so the sat nav does too. */
export function distanceText(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
}

export function etaText(metres: number): string {
  const min = Math.max(1, Math.round(etaSeconds(metres) / 60));
  return `${min} min`;
}

/** The next instruction, as the sat nav panel shows it. */
export function turnText(m: Manoeuvre | null, metres: number): string {
  if (!m) return 'Follow the road';
  if (m.kind === 'arrive') return metres < 30 ? 'You have arrived' : `Arrive in ${distanceText(metres)}`;
  const what = m.kind === 'uturn' ? 'make a U-turn' : `turn ${m.kind}`;
  return metres < 30 ? what.charAt(0).toUpperCase() + what.slice(1) : `In ${distanceText(metres)}, ${what}`;
}
