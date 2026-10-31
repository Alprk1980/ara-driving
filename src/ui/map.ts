// The mini-map and world map draw from one pre-rendered town image, so a phone redraws only a blit and a few marks.
import { DISTRICTS, DISTRICT_IDS, districtAt } from '../sim/districts.ts';
import type { Game } from '../sim/game.ts';
import { storyPlot } from '../sim/quests.ts';
import { PLOT_SOLID, ROAD_W, SIZE, type Vec } from '../sim/town.ts';

const SCALE = 0.6, PLOT = '#c4bcaa'; // image pixels per metre, and the colour of a place's plot
const SERVICE_MARK = { fire: { fill: '#c8201e', label: 'FS' }, ambulance: { fill: '#1f9a54', label: 'A' }, police: { fill: '#2f4f8f', label: 'P' } } as const;
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
  for (const s of g.town.stations) dot(x, s, r, '#e8483f', 'F');
  for (const s of g.town.services) dot(x, s, r, SERVICE_MARK[s.id].fill, SERVICE_MARK[s.id].label);
  dot(x, g.town.home, r * 1.1, '#3d6fd1', 'H');
  if (!g.quest) for (const o of g.offers) dot(x, o.start, r * 0.8, '#ffb02e');
  const target = g.quest?.target ?? g.waypoint;
  if (target) dot(x, target, r, '#ffd23e');
}

function car(x: CanvasRenderingContext2D, g: Game, r: number) {
  const p = g.player;
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
  const x = c.getContext('2d')!, w = c.width, p = g.player;
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
  car(x, g, 6);
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
