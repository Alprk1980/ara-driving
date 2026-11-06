// Every point of interest the map shows: each named place, the career bases, the shopping centre, the petrol stations,
// home, the emergency stations, the bus stops, and your car when you've left it. Pure, so a test can hold the map to
// the town: a place that exists and isn't on the map is a bug.
import type { Place } from '../../schemas/content.ts';
import type { CareerId } from '../../schemas/careers.ts';
import type { Game } from './game.ts';
import { placeAt, storyPlot } from './quests.ts';
import { dist, type Vec } from './town.ts';

export type PoiKind = Place['kind'] | 'home' | 'fuel' | 'centre' | 'bus_stop' | 'your_car' | 'lead' | `base_${CareerId}`; // lead: drawn from the case board, not listed here
export type Poi = { kind: PoiKind; name: string; at: Vec; road: Vec }; // at: where it is drawn; road: where the sat nav takes you

export function pois(g: Game): Poi[] {
  const t = g.town, out: Poi[] = [], held = (g.content.regulars ?? []).map((_, i) => storyPlot(t, i));
  const bases = new Map(g.bases.map((b) => [`${Math.round(b.at.x)},${Math.round(b.at.z)}`, b]));
  out.push({ kind: 'home', name: 'Home garage', at: t.home, road: t.home.road });
  t.stations.forEach((s) => out.push({ kind: 'fuel', name: 'Petrol station', at: s, road: s.road }));
  for (const s of t.services) {
    const b = g.bases.find((x) => x.career === s.id);
    out.push({ kind: `base_${s.id}`, name: b?.name ?? s.id, at: s, road: s.road });
  }
  if (t.centre) out.push({ kind: 'centre', name: 'Shopping centre', at: t.centre.plot, road: t.centre.plot.road });
  for (const p of t.plots) {
    if (held.includes(p)) continue; // a regular's lot: the map marks it when their story is done
    const place = placeAt(t, g.content.places, p);
    if (!place) continue;
    const base = bases.get(`${Math.round(p.road.x)},${Math.round(p.road.z)}`);
    out.push({ kind: base ? `base_${base.career}` : place.kind, name: place.name, at: p, road: p.road });
  }
  const seen: Vec[] = []; // a stop served by both directions of a loop stands once on the map
  for (const r of t.routes) for (const s of r.stops) {
    if (seen.some((q) => dist(q, s) < 12)) continue;
    seen.push(s);
    out.push({ kind: 'bus_stop', name: `Bus stop: ${t.routesAt(s).map((x) => x.name).join(', ')}`, at: s, road: s });
  }
  const car = yourCar(g);
  if (car) out.push(car);
  return out;
}

/** Your car, when you're not in it: parked while you walk or work. */
export function yourCar(g: Game): Poi | null {
  const left = g.ownCar ?? (g.foot ? g.player : null);
  return left ? { kind: 'your_car', name: 'Your car', at: { x: left.x, z: left.z }, road: { x: left.x, z: left.z } } : null;
}

/** The point of interest nearest a spot on the map, within `reach` metres: what a tap on the map means. */
export function poiNear(list: readonly Poi[], at: Vec, reach: number): Poi | null {
  let best: Poi | null = null;
  for (const p of list) if (dist(p.at, at) < reach && (!best || dist(p.at, at) < dist(best.at, at))) best = p;
  return best;
}
