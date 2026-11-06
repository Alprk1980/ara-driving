// The mini-map and world map draw from one pre-rendered town image, so a phone redraws only a blit and a few marks.
import { DISTRICTS, DISTRICT_IDS, districtAt } from '../sim/districts.ts';
import type { Game } from '../sim/game.ts';
import { placeAt, storyPlot } from '../sim/quests.ts';
import { pois, yourCar, type Poi, type PoiKind } from '../sim/pois.ts';
import { WATER } from '../sim/waterside.ts';
import { PLOT_SOLID, ROAD_W, SIZE, type Vec } from '../sim/town.ts';

const SCALE = 0.6, PLOT = '#c4bcaa'; // image pixels per metre, and the colour of a place's plot
/** How each kind of point of interest is marked: its colour, the letter on it, and how big against the map's base size.
 *  The legend in the map sheet is drawn from this same table, so the two can't disagree. */
export const POI_STYLE: Record<PoiKind, { fill: string; label: string; size: number; legend: string }> = {
  home: { fill: '#3d6fd1', label: 'H', size: 1.1, legend: 'Home garage' },
  fuel: { fill: '#e8483f', label: 'F', size: 1, legend: 'Petrol station' },
  base_fire: { fill: '#c8201e', label: 'FS', size: 1, legend: 'Fire station: sign on' },
  base_ambulance: { fill: '#1f9a54', label: 'A', size: 1, legend: 'Ambulance station: sign on' },
  base_police: { fill: '#2f4f8f', label: 'P', size: 1, legend: 'Police station: sign on' },
  base_bus: { fill: '#e0a000', label: 'B', size: 1, legend: 'Bus garage: sign on' },
  base_recovery: { fill: '#f08a24', label: 'R', size: 1, legend: 'Recovery yard: sign on' },
  base_mechanic: { fill: '#5b6b7a', label: 'G', size: 1, legend: 'Patrol garage: sign on' },
  centre: { fill: '#9b4fd0', label: 'SC', size: 1, legend: 'Shopping centre' },
  basin: { fill: '#2f6f8f', label: 'B~', size: 1, legend: 'Canal basin and narrowboats' },
  shop: { fill: '#e0712e', label: 'S', size: 0.6, legend: 'Shop' },
  cafe: { fill: '#8a5a3c', label: 'C', size: 0.6, legend: 'Café' },
  market: { fill: '#3f9a3a', label: 'M', size: 0.6, legend: 'Market' },
  school: { fill: '#d4a017', label: 'Sc', size: 0.6, legend: 'School' },
  park: { fill: '#2e8b57', label: 'Pk', size: 0.6, legend: 'Park' },
  office: { fill: '#607d9a', label: 'O', size: 0.6, legend: 'Office' },
  clinic: { fill: '#d64545', label: '+', size: 0.6, legend: 'Clinic' },
  library: { fill: '#7a5cc4', label: 'L', size: 0.6, legend: 'Library' },
  depot: { fill: '#6d6a60', label: 'D', size: 0.6, legend: 'Depot' },
  house: { fill: '#b07a52', label: 'h', size: 0.5, legend: 'Homes' },
  bus_stop: { fill: '#1f6fd1', label: '', size: 0.35, legend: 'Bus stop' },
  your_car: { fill: '#10131a', label: '', size: 0.6, legend: 'Your car, where you left it' },
  lead: { fill: '#7a3fd0', label: '?', size: 0.85, legend: 'A witness for the case board' },
};
const SMALL = 0.6; // on the mini-map, places shrink to coloured dots without letters, so the road stays readable
const WASH_M = 30, WASH = 0.4; // the district wash: its grid, and how strong

export function townImage(g: Game): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE * SCALE;
  const x = c.getContext('2d')!;
  x.scale(SCALE, SCALE);
  x.fillStyle = '#b9dfae';
  x.fillRect(0, 0, SIZE, SIZE);
  x.globalAlpha = WASH; // a soft wash under the streets, so each district's extent shows
  for (let cx = 0; cx < SIZE; cx += WASH_M) for (let cz = 0; cz < SIZE; cz += WASH_M) {
    x.fillStyle = DISTRICTS[districtAt(cx + WASH_M / 2, cz + WASH_M / 2)].map;
    x.fillRect(cx, cz, WASH_M + 1, WASH_M + 1);
  }
  x.globalAlpha = 1;
  for (const b of g.town.boxes) { x.fillStyle = b.district ? DISTRICTS[b.district].map : PLOT; x.fillRect(b.x - b.hx, b.z - b.hz, b.hx * 2, b.hz * 2); }
  x.fillStyle = PLOT;
  for (const p of g.town.plots) x.fillRect(p.x - PLOT_SOLID, p.z - PLOT_SOLID, PLOT_SOLID * 2, PLOT_SOLID * 2);
  x.fillStyle = '#5f8fa8'; // the canal and its basin
  for (const w of WATER) x.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
  x.strokeStyle = '#ffffff';
  x.lineWidth = ROAD_W * 2;
  x.lineCap = 'round';
  x.beginPath();
  for (const e of g.town.edges) {
    x.moveTo(g.town.nodes[e.a].x, g.town.nodes[e.a].z);
    x.lineTo(g.town.nodes[e.b].x, g.town.nodes[e.b].z);
  }
  x.stroke();
  return c;
}

const dot = (x: CanvasRenderingContext2D, p: Vec, r: number, fill: string, label?: string) => {
  x.beginPath();
  x.arc(p.x, p.z, r, 0, 7);
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = r / 3;
  x.strokeStyle = '#fff';
  x.stroke();
  if (label) {
    x.save();
    x.fillStyle = '#fff';
    x.font = `800 ${r * 1.3}px system-ui`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.translate(p.x, p.z);
    x.fillText(label, 0, 0);
    x.restore();
  }
};

// Small things first, so the bases and home sit on top where they crowd together.
const DRAW_ORDER = Object.keys(POI_STYLE).sort((a, b) => POI_STYLE[a as PoiKind].size - POI_STYLE[b as PoiKind].size) as PoiKind[];
const fixed = new WeakMap<Game, Poi[]>();
/** The points of interest: the town's own once per game, and your car wherever it is now. */
export function poiList(g: Game): Poi[] {
  let list = fixed.get(g);
  if (!list) { list = pois(g).filter((p) => p.kind !== 'your_car'); fixed.set(g, list); }
  const car = yourCar(g);
  return car ? [...list, car] : list;
}

function marks(x: CanvasRenderingContext2D, g: Game, r: number) {
  if (g.nav) {
    x.strokeStyle = '#17b897';
    x.lineWidth = r * 0.8;
    x.lineJoin = 'round';
    x.beginPath();
    g.nav.route.points.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z)));
    x.stroke();
  }
  if (g.town.rough >= 0) {
    const e = g.town.edges[g.town.rough];
    x.strokeStyle = '#f08a24';
    x.lineWidth = r * 1.1;
    x.beginPath();
    x.moveTo(g.town.nodes[e.a].x, g.town.nodes[e.a].z);
    x.lineTo(g.town.nodes[e.b].x, g.town.nodes[e.b].z);
    x.stroke();
  }
  (g.content.regulars ?? []).forEach((reg, i) => { if ((g.progress.arcs[reg.id] ?? 0) >= reg.jobs.length) dot(x, storyPlot(g.town, i), r * 0.9, '#c04fd0', '*'); });
  const mini = r < 20, list = poiList(g);
  for (const kind of DRAW_ORDER) for (const p of list) {
    if (p.kind !== kind) continue;
    const st = POI_STYLE[kind];
    if (mini && st.size < SMALL) { if (kind !== 'house') dot(x, p.at, r * 0.45, st.fill); continue; } // a dot on the mini-map; homes left off it
    dot(x, p.at, r * st.size, st.fill, mini && st.size < 1 ? undefined : st.label || undefined);
  }
  if (!g.quest) for (const o of g.offers) dot(x, o.start, r * 0.8, '#ffb02e');
  const c = g.openCase, heard = c ? g.progress.cases?.[c.id]?.heard ?? [] : []; // the case's witnesses still to ask
  if (c) for (const [i, k] of c.clues.entries()) {
    if (heard.includes(i)) continue;
    const plot = g.town.plots.find((p) => placeAt(g.town, g.content.places, p)?.id === k.place);
    if (plot) dot(x, plot, r * 0.85, '#7a3fd0', '?');
  }
  const target = g.quest?.target ?? g.waypoint;
  if (target) dot(x, target, r, '#ffd23e');
}

function car(x: CanvasRenderingContext2D, g: Game, r: number) {
  const p = g.foot ?? g.player;
  x.save();
  x.translate(p.x, p.z);
  x.rotate(Math.PI - p.heading);
  x.beginPath();
  x.moveTo(0, -r * 1.3);
  x.lineTo(r, r);
  x.lineTo(0, r * 0.4);
  x.lineTo(-r, r);
  x.closePath();
  x.fillStyle = '#10131a';
  x.strokeStyle = '#fff';
  x.lineWidth = r / 3;
  x.fill();
  x.stroke();
  x.restore();
}

/** Heading-up mini-map: the car stays centred and the town turns around it. */
export function drawMini(c: HTMLCanvasElement, g: Game, img: HTMLCanvasElement) {
  const x = c.getContext('2d')!, w = c.width, p = g.foot ?? g.player; // on foot it follows you, and the car shows where you left it
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#b9dfae';
  x.fillRect(0, 0, w, w);
  const zoom = w / 260 / SCALE; // 260 m across
  x.translate(w / 2, w / 2);
  x.rotate(Math.PI + p.heading);
  x.scale(zoom * SCALE, zoom * SCALE);
  x.translate(-p.x, -p.z);
  x.drawImage(img, 0, 0, SIZE, SIZE);
  marks(x, g, 7);
  car(x, g, g.foot ? 4 : 6);
}

export function drawWorld(c: HTMLCanvasElement, g: Game, img: HTMLCanvasElement) {
  const x = c.getContext('2d')!, w = c.width;
  x.setTransform(w / SIZE, 0, 0, w / SIZE, 0, 0);
  x.drawImage(img, 0, 0, SIZE, SIZE);
  marks(x, g, 52);
  for (const id of DISTRICT_IDS) districtLabel(x, g.town.heart(id), DISTRICTS[id].name);
  car(x, g, 48);
}

/** A district's name on the world map, on a dark pill so it reads over anything. The mini-map turns with the car, so it has none. */
function districtLabel(x: CanvasRenderingContext2D, at: Vec, name: string) {
  const size = 74, text = name.toUpperCase();
  x.save();
  x.font = `800 ${size}px system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const w = x.measureText(text).width + size * 1.1, h = size * 1.7, y = at.z - 120;
  x.fillStyle = '#10182ad9';
  x.beginPath();
  x.roundRect(at.x - w / 2, y - h / 2, w, h, h / 2);
  x.fill();
  x.fillStyle = '#ffffff';
  x.fillText(text, at.x, y + size * 0.05);
  x.restore();
}
