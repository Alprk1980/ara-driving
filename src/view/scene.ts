// The Three.js view: draws the town once, then follows the simulation each frame. It reads the game and
// never changes it, so the rules stay testable without a browser.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_KINDS, type Landmark, type Part, type Sky, type StoryPlace } from '../../schemas/content.ts';
import type { Design, Driver } from '../save.ts';
import { breadcrumbs, type Game } from '../sim/game.ts';
import { ghostPose, placeAt, storyPlot } from '../sim/quests.ts';
import { PlayerCar } from '../sim/car.ts';
import { DISTRICT_IDS, districtAt, type DistrictId } from '../sim/districts.ts';
import { dist, ROAD_W, SIZE, ZIGZAG_M, type Plot, type Vec } from '../sim/town.ts';
import { TRAFFIC_LENGTH } from '../sim/traffic.ts';
import { buildCar, DEFAULT_PAINT, disposeCar, TAIL_BRAKE, TAIL_DIM, type CarRig, type Lookup } from './carmesh.ts';
import { buildVoxelCar, voxelProfileFor } from './voxelcar.ts';
import { BLINK_OFF, BLINK_ON, LAMP_OFF, LAMP_REVERSE, STEER_TURN } from './cockpit.ts';
import { DamageRig } from './damage.ts';
import { Debris } from './debris.ts';
import { Dome } from './dome.ts';
import { Fx } from './fx.ts';
import { paintedMaterial, partsGeometry, PROP_PARTS, TRAFFIC_PARTS } from './parts.ts';
import { skyAt, type Rgb } from './sky.ts';
import { STOP_LINE_M } from '../sim/signals.ts';
import { RoadControl } from './roadcontrol.ts';
import { buildServices } from './services.ts';
import { StreetLife } from './streetlife.ts';
import { TownBuildings } from './townblocks.ts';
import { DrawnBuildings } from './drawn.ts';
import { WallDamage } from './walls.ts';
import type { WallHit } from '../save.ts';
import buildingStyles from '../data/buildingstyles.json';
import type { BuildingStyle } from '../../schemas/buildings.ts';

export const CAMERA_NAMES = ['Chase near', 'Chase far', 'Side', 'Cockpit'] as const;
const BLEND_S = 0.25;
const CAM_LAG = 6, ROLL = 0.08, PITCH = 0.009, BODY_EASE = 7; // how the chase camera and body follow the car
const SLIDE_START = 0.45, HARD_BRAKE = 9;
const GLOW = '#ffcf7a', LIGHTS_ON = 0.3; // headlights come on past this much night
const INDICATOR_PER_MIN = 90; // the law allows 60-120 flashes a minute
const SIGNAL_LIT = { red: '#ff2b1c', amber: '#ffb01f', green: '#28e06a' }; // as the signal heads in roadcontrol.ts
// The cockpit's vertical field of view. A view true to a 24 inch monitor 60 cm away would be about 28 degrees (2 atan of
// half the screen's height over the distance, the sim racing calculators' rule), too narrow to see the road's edges here;
// 72 made the signals small and far off, and 55 felt too close in play (2026-11-02). 62 is a judged middle: things ahead
// show 1.25 times bigger than at 72, and the secondary signals across each junction and the dash readout do the rest.
const COCKPIT_FOV = 62;
const ATTRACT_SHOT_S = 7; // seconds on each district in the title screen's tour
const LOOK_PER_PX = 0.005, LOOK_HOLD_S = 1.5, LOOK_SETTLE = 3; // mouse look: radians per pixel, how long it stays put after letting go, how fast it settles back
export type Quality = 'auto' | 'low' | 'high';
const SHADOW_M = 30, SHADOW_MAP = 1024, SHADOW_SNAP = 0.25, EXPOSURE = 1.05;
const ASPHALT = '#6f7480', NIGHT_FILL = 0.9; // lifts the dark so the road stays readable
const AUTO_LOW_FPS = 38, FPS_WINDOW_S = 2;
export type Scenery = { landmarks: Landmark[]; skies: Sky[]; stories: StoryPlace[] };
const CONES = 18;

// A held lot before its story ends: a low fence, a pile of crates and a sign.
const EMPTY_LOT: Part[] = [
  { shape: 'box', x: 0, y: 0, z: 6.5, w: 13, h: 0.9, l: 0.2, color: '#e8d5a8' },
  { shape: 'box', x: 0, y: 0, z: -6.5, w: 13, h: 0.9, l: 0.2, color: '#e8d5a8' },
  { shape: 'box', x: 6.5, y: 0, z: 0, w: 0.2, h: 0.9, l: 13, color: '#e8d5a8' },
  { shape: 'box', x: -6.5, y: 0, z: 0, w: 0.2, h: 0.9, l: 13, color: '#e8d5a8' },
  { shape: 'box', x: 3, y: 0, z: -2, w: 2, h: 1.4, l: 2, color: '#a9794a' },
  { shape: 'box', x: 3, y: 1.4, z: -2, w: 1.3, h: 1, l: 1.3, color: '#c49a66' },
  { shape: 'box', x: -3, y: 0, z: 5, w: 0.25, h: 3, l: 0.25, color: '#7a5637' },
  { shape: 'box', x: -3, y: 2.2, z: 5, w: 3, h: 1.2, l: 0.15, color: '#ffd23e' },
];
const CONE_COLOURS: Record<string, string[]> = { roadworks: ['#f08a24', '#f4efd8'], parade: ['#e8483f', '#ffd23e', '#3d6fd1', '#3ddc97'] };
type TownLook = { road: THREE.MeshPhongMaterial; shade: THREE.MeshBasicMaterial[]; buildings: TownBuildings; lamps: THREE.MeshBasicMaterial; pools: THREE.MeshBasicMaterial };

function quad(pos: number[], a: Vec, b: Vec, half: number, y: number) {
  const len = dist(a, b), nx = (-(b.z - a.z) / len) * half, nz = ((b.x - a.x) / len) * half;
  pos.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz, a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
}
// Flat ground: every triangle is turned to face up, so the sun lights it and shadows land on it.
const flat = (pos: number[], material: THREE.Material) => {
  for (let i = 0; i < pos.length; i += 9) {
    const cross = (pos[i + 5] - pos[i + 2]) * (pos[i + 6] - pos[i]) - (pos[i + 3] - pos[i]) * (pos[i + 8] - pos[i + 2]);
    if (cross < 0) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.flatMap((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
};

// A soft white blob that fades to nothing, for pools of light on the road.
function softLight() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, '#ffffff');
  r.addColorStop(1, '#000000');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A soft dark square, used as an alpha map.
function softSquare() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 64, 64);
  g.shadowColor = '#ffffff';
  g.shadowBlur = 9;
  g.fillStyle = '#ffffff';
  g.fillRect(13, 13, 38, 38);
  return new THREE.CanvasTexture(c);
}

// Soft dark patches round buildings and trees. Real shadows for a whole town would cost a phone too much, and
// these sit where the eye expects the ground to darken, at one draw call each.
function buildContactShade(scene: THREE.Scene, game: Game) {
  const town = game.town, m = new THREE.Matrix4(), shade: THREE.MeshBasicMaterial[] = [];
  const patch = new THREE.PlaneGeometry(1, 1);
  patch.rotateX(-Math.PI / 2);
  const layer = (alphaMap: THREE.Texture, spots: { x: number; z: number; w: number; l: number }[]) => {
    const mat = new THREE.MeshBasicMaterial({ color: '#10141c', alphaMap, transparent: true, opacity: 0.3, depthWrite: false });
    const mesh = new THREE.InstancedMesh(patch, mat, spots.length);
    spots.forEach((s, i) => mesh.setMatrixAt(i, m.makeScale(s.w, 1, s.l).setPosition(s.x, 0.04, s.z)));
    mesh.frustumCulled = false;
    scene.add(mesh);
    shade.push(mat);
  };
  const FOOT = 1.7; // the soft edge of the texture sits outside the building
  layer(softSquare(), [
    ...town.boxes.map((b) => ({ x: b.x, z: b.z, w: b.hx * 2 * FOOT, l: b.hz * 2 * FOOT })),
    ...town.plots.map((p) => ({ x: p.x, z: p.z, w: 14 * FOOT, l: 14 * FOOT })),
    { x: town.home.x, z: town.home.z, w: 16 * FOOT, l: 16 * FOOT },
  ]);
  layer(softLight(), town.trees.map((t) => ({ x: t.x, z: t.z, w: 8, l: 8 })));
  return shade;
}

// One merged mesh holding the building of every place. Designs of a kind take turns along the plot list.
function buildPlaces(scene: THREE.Scene, game: Game, landmarks: Landmark[], held: Plot[]) {
  const town = game.town, seen = new Map<string, number>(), geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (const p of town.plots) {
    if (held.includes(p) || town.drawnPlots.has(p)) continue;
    const kind = placeAt(town, game.content.places, p)?.kind, designs = landmarks.filter((l) => l.kind === kind);
    if (!kind || !designs.length) continue;
    const n = seen.get(kind) ?? 0;
    seen.set(kind, n + 1);
    const g = partsGeometry(designs[n % designs.length].parts);
    g.applyMatrix4(m.makeRotationY(Math.atan2(p.road.x - p.x, p.road.z - p.z)).setPosition(p.x, 0, p.z));
    geos.push(g);
  }
  if (geos.length) scene.add(new THREE.Mesh(mergeGeometries(geos), paintedMaterial()));
}

// The lot and the finished building for each regular. Only one of the pair shows at a time.
function buildStories(scene: THREE.Scene, game: Game, places: StoryPlace[]) {
  const out = new Map<string, { lot: THREE.Mesh; built: THREE.Mesh | null }>(), m = new THREE.Matrix4(), mat = paintedMaterial();
  (game.content.regulars ?? []).forEach((r, i) => {
    const p = storyPlot(game.town, i), design = places.find((s) => s.id === r.id);
    const at = m.makeRotationY(Math.atan2(p.road.x - p.x, p.road.z - p.z)).setPosition(p.x, 0, p.z);
    const mesh = (parts: Part[]) => { const g = partsGeometry(parts); g.applyMatrix4(at); const x = new THREE.Mesh(g, mat); scene.add(x); return x; };
    out.set(r.id, { lot: mesh(EMPTY_LOT), built: design ? mesh(design.parts) : null });
  });
  return out;
}

function buildFinds(scene: THREE.Scene, game: Game) {
  const m = new THREE.Matrix4(), out = new Map<string, { mesh: THREE.InstancedMesh; index: number }>();
  const finds = game.content.finds ?? [];
  const mark = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: '#ffd23e' }), Math.max(1, finds.length));
  mark.count = finds.length;
  finds.forEach((f, i) => { const s = game.town.spots[f.spot]; mark.setMatrixAt(i, m.makeTranslation(s.x, 4.2, s.z)); out.set(`mark:${f.id}`, { mesh: mark, index: i }); });
  scene.add(mark);
  for (const kind of PROP_KINDS) {
    const list = finds.filter((f) => f.prop === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(partsGeometry(PROP_PARTS[kind]), paintedMaterial(), list.length);
    list.forEach((f, i) => { const s = game.town.spots[f.spot]; mesh.setMatrixAt(i, m.makeRotationY(f.spot).setPosition(s.x, 0, s.z)); out.set(f.id, { mesh, index: i }); });
    scene.add(mesh);
  }
  return out;
}

function buildTown(scene: THREE.Scene, game: Game, landmarks: Landmark[], held: Plot[]): TownLook {
  const town = game.town;
  // Pushed back in the depth buffer: roads sit a few centimetres above this, too little to win by height alone at a distance.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + 1200, SIZE + 1200), new THREE.MeshLambertMaterial({ color: '#8cc97a', polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 12 }));
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2, -0.05, SIZE / 2);
  scene.add(ground);

  const road: number[] = [], line: number[] = [];
  for (const e of town.edges) {
    const a = town.nodes[e.a], b = town.nodes[e.b];
    quad(road, a, b, ROAD_W / 2, 0.02);
    const dashes = Math.floor(e.len / 14);
    for (let i = 2; i < dashes - 2; i += 2) {
      const t0 = i / dashes, t1 = (i + 1) / dashes;
      quad(line, { x: a.x + (b.x - a.x) * t0, z: a.z + (b.z - a.z) * t0 }, { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 }, 0.16, 0.05);
    }
  }
  // Zebras: the stripes, and the zig-zags either side that mean no parking and no overtaking (Highway Code rule 190).
  const ZIG_M = 2, ZIG_OUT = 0.22;
  for (const z of town.zebras) {
    const { ux, uz } = z;
    if (z.kind === 'zebra') for (let s = -5; s <= 5; s += 1.2) {
      const c = { x: z.x - uz * s, z: z.z + ux * s };
      quad(line, { x: c.x - ux * 1.4, z: c.z - uz * 1.4 }, { x: c.x + ux * 1.4, z: c.z + uz * 1.4 }, 0.3, 0.05);
    } else for (const edge of [-1.4, 1.4]) for (let s = -5.6; s <= 5.6; s += 0.8) { // a pelican or puffin: two rows of studs, no stripes
      const c = { x: z.x - uz * s + ux * edge, z: z.z + ux * s + uz * edge };
      quad(line, { x: c.x - uz * 0.2, z: c.z + ux * 0.2 }, { x: c.x + uz * 0.2, z: c.z - ux * 0.2 }, 0.2, 0.05);
    }
    for (const way of [1, -1]) for (const kerb of [-5.4, 0, 5.4]) for (let k = 0; k * ZIG_M < ZIGZAG_M; k++) {
      const at = (n: number, wob: number) => ({ x: z.x + ux * way * (2.4 + n * ZIG_M) - uz * (kerb + wob), z: z.z + uz * way * (2.4 + n * ZIG_M) + ux * (kerb + wob) });
      quad(line, at(k, k % 2 ? ZIG_OUT : -ZIG_OUT), at(k + 1, k % 2 ? -ZIG_OUT : ZIG_OUT), 0.07, 0.05);
    }
  }
  // A stop line across the near side of each road into a signalled junction.
  for (const [node] of town.signals) for (const w of town.adj[node]) {
    const n = town.nodes[node], o = town.nodes[w.to], e = town.edges[w.edge], dx = (n.x - o.x) / e.len, dz = (n.z - o.z) / e.len, base = { x: n.x - dx * STOP_LINE_M, z: n.z - dz * STOP_LINE_M };
    quad(line, base, { x: base.x + dz * (ROAD_W / 2 - 0.3), z: base.z - dx * (ROAD_W / 2 - 0.3) }, 0.2, 0.05);
  }
  // Drives: block paving from the dropped kerb to the house, with the pavement lowered where they cross it.
  const paving: number[] = [], dropped: number[] = [];
  for (const d of town.drives) {
    const house = { x: d.x - d.fx * (d.deep / 2), z: d.z - d.fz * (d.deep / 2) }, back = { x: d.kerb.x - d.fx * 3, z: d.kerb.z - d.fz * 3 };
    quad(paving, back, house, d.wide / 2, 0.012);
    quad(dropped, d.kerb, back, d.wide / 2 + 0.4, 0.012);
  }
  const walk: number[] = [];
  for (const e of town.edges) quad(walk, town.nodes[e.a], town.nodes[e.b], ROAD_W / 2 + 3, 0.005);
  const asphalt = new THREE.MeshPhongMaterial({ color: ASPHALT, specular: '#000000', shininess: 40 }); // goes glossy in the rain
  scene.add(flat(walk, new THREE.MeshLambertMaterial({ color: '#cfccc2' })), flat(road, asphalt), flat(line, new THREE.MeshLambertMaterial({ color: '#f4efd8' })), flat(paving, new THREE.MeshLambertMaterial({ color: '#a8988a' })), flat(dropped, new THREE.MeshLambertMaterial({ color: '#b5b1a6' })));
  const disc = new THREE.CircleGeometry(ROAD_W * 0.72, 16);
  disc.rotateX(-Math.PI / 2);
  const joints = new THREE.InstancedMesh(disc, asphalt, town.nodes.length);
  joints.receiveShadow = true;
  const m = new THREE.Matrix4();
  town.nodes.forEach((n, i) => joints.setMatrixAt(i, m.makeTranslation(n.x, 0.03, n.z)));
  scene.add(joints);

  const buildings = new TownBuildings(town.boxes, buildingStyles as unknown as BuildingStyle[]);
  scene.add(buildings.group);

  const cone = new THREE.ConeGeometry(2.6, 7, 7);
  cone.translate(0, 5.5, 0);
  const crown = new THREE.IcosahedronGeometry(3.1, 0).scale(1, 1.15, 1).translate(0, 6, 0); // broadleaf street trees for the town, conifers on the green edges
  const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const broad = town.trees.filter((t) => districtAt(t.x, t.z) !== 'works'), pines = town.trees.filter((t) => districtAt(t.x, t.z) === 'works');
  const leafGreen = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), pineGreen = new THREE.MeshLambertMaterial({ color: '#3f9a57' });
  const crowns = new THREE.InstancedMesh(crown, leafGreen, Math.max(1, broad.length)), leaves = new THREE.InstancedMesh(cone, pineGreen, Math.max(1, pines.length));
  const stems = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: '#7a5637' }), town.trees.length);
  const shades = ['#4c9a58', '#5ba85f', '#3f8f52', '#6fae5a'], tree = new THREE.Color();
  broad.forEach((t, i) => { const size = 0.8 + ((t.x * 13.7 + t.z * 7.1) % 1 + 1) % 1 * 0.5; crowns.setMatrixAt(i, m.makeScale(size, size, size).setPosition(t.x, 0, t.z)); crowns.setColorAt(i, tree.set(shades[Math.floor(size * 41) % 4])); });
  pines.forEach((t, i) => leaves.setMatrixAt(i, m.makeTranslation(t.x, 0, t.z)));
  town.trees.forEach((t, i) => stems.setMatrixAt(i, m.makeTranslation(t.x, 0, t.z)));
  scene.add(crowns, leaves, stems);

  const pad = (p: Plot, r: number, color: string) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshLambertMaterial({ color }));
    d.receiveShadow = true;
    d.rotation.x = -Math.PI / 2;
    d.position.set(p.x, 0.02, p.z);
    scene.add(d);
  };
  const part = (w: number, h: number, l: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), new THREE.MeshLambertMaterial({ color }));
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  for (const s of town.stations) {
    pad(s, 22, '#6d7380');
    part(16, 0.6, 9, '#e8483f', s.x, 6, s.z);
    for (const dx of [-6, 6]) { part(0.5, 6, 0.5, '#f4f4f4', s.x + dx, 3, s.z); part(1, 2, 0.7, '#ffd23e', s.x + dx / 2, 1, s.z); }
    part(0.6, 12, 0.6, '#f4f4f4', s.x + 12, 6, s.z + 8);
    part(4, 3, 0.5, '#e8483f', s.x + 12, 12, s.z + 8);
  }
  const h = town.home;
  pad(h, 24, '#c9b48f');
  part(16, 7, 12, '#f2e3c6', h.x, 3.5, h.z);
  part(18, 1.2, 14, '#b4533c', h.x, 7.6, h.z);
  part(8, 5, 0.4, '#6b4a33', h.x + (h.road.x - h.x) * 0.2, 2.5, h.z + (h.road.z - h.z) * 0.2);
  buildPlaces(scene, game, landmarks, held);
  buildServices(scene, town);

  // A street lamp and its pool of light on one corner of every junction.
  const corner = ROAD_W / 2 + 2;
  const pole = new THREE.BoxGeometry(0.25, 7, 0.25), head = new THREE.BoxGeometry(1.1, 0.25, 0.5), pool = new THREE.PlaneGeometry(26, 26);
  pole.translate(0, 3.5, 0);
  head.translate(-0.4, 7, 0);
  pool.rotateX(-Math.PI / 2);
  const lamps = new THREE.MeshBasicMaterial({ color: '#4b4f58' });
  const pools = new THREE.MeshBasicMaterial({ color: GLOW, map: softLight(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: '#59606b' }), town.nodes.length);
  const heads = new THREE.InstancedMesh(head, lamps, town.nodes.length), glows = new THREE.InstancedMesh(pool, pools, town.nodes.length);
  town.nodes.forEach((n, i) => {
    m.makeTranslation(n.x + corner, 0, n.z + corner);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    glows.setMatrixAt(i, m.makeTranslation(n.x + corner - 2, 0.07, n.z + corner - 2));
  });
  scene.add(poles, heads, glows);
  return { road: asphalt, shade: buildContactShade(scene, game), buildings, lamps, pools };
}

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.12, 1400);
  rig!: CarRig;
  index = 0;
  bodyStyle: 'voxel' | 'blocks' = 'voxel'; // set before setCar; a missing profile still falls back to blocks
  private inGarage = false;
  private game: Game;
  private find: Lookup;
  private beacon: THREE.Mesh;
  private crumbs: THREE.InstancedMesh;
  private blend = 1;
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private look = new THREE.Vector3();
  private crumbClock = 0;
  private dashClock = 0;
  private spin = 0;
  private orbit = 0;
  private fx: Fx;
  private yaw = 0;
  private roll = 0;
  private pitch = 0;
  private shake = 0;
  private lastSpeed = 0;
  private skidFrom: Vec[] | null = null;
  slide = 0; // 0 to 1, read by the tyre sound
  private skies: Sky[];
  private look3: TownLook;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fog: THREE.Fog;
  private dome: Dome;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private quality: Quality = 'auto';
  private fpsClock = 0;
  private fpsFrames = 0;
  fps = 0;
  private beam: THREE.Mesh;
  private life: StreetLife;
  private control: RoadControl;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookHold = 0;
  private dragAt: { x: number; y: number } | null = null;
  /** Set for the title screen's tour; called with each district as the shot changes. */
  attract: ((district: DistrictId) => void) | null = null;
  private tourStops: { id: DistrictId; x: number; z: number; ux: number; uz: number; len: number }[] | null = null;
  private tourAt = -1;
  private tourClock = 0;
  private stand = new PlayerCar('hatchback'); // where traffic and people think the player is, while the camera tours
  private ghost: THREE.Mesh;
  private props: Map<string, { mesh: THREE.InstancedMesh; index: number }>;
  private stories: Map<string, { lot: THREE.Mesh; built: THREE.Mesh | null }>;
  private cones: THREE.InstancedMesh;
  private debris: Debris;
  private walls: WallDamage;
  drawnWalls: WallDamage;
  private wallHits: WallHit[] = [];
  drawn: DrawnBuildings;
  private dmg: DamageRig | null = null;
  private paint = DEFAULT_PAINT;

  constructor(canvas: HTMLCanvasElement, game: Game, find: Lookup, scenery: Scenery) {
    this.game = game;
    this.find = find;
    this.skies = scenery.skies;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || this.attract || this.inGarage) return; // fingers steer; only a mouse looks round
      this.dragAt = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragAt) return;
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - (e.clientX - this.dragAt.x) * LOOK_PER_PX, -Math.PI, Math.PI);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + (e.clientY - this.dragAt.y) * LOOK_PER_PX, -1.2, 1.2);
      this.dragAt = { x: e.clientX, y: e.clientY };
    });
    const letGo = () => { this.dragAt = null; this.lookHold = LOOK_HOLD_S; };
    canvas.addEventListener('pointerup', letGo);
    canvas.addEventListener('pointercancel', letGo);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping; // tames bright light without washing out the toy colours
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.fog = this.scene.fog = new THREE.Fog('#a8dcf5', 220, 900);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#88a080', 2.1);
    this.sun = new THREE.DirectionalLight('#fff2d8', 1.8);
    this.sun.position.set(0.5, 1, 0.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    Object.assign(this.sun.shadow.camera, { left: -SHADOW_M, right: SHADOW_M, top: SHADOW_M, bottom: -SHADOW_M, near: 1, far: 300 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.intensity = 0.62;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.dome = new Dome(this.scene);
    this.look3 = buildTown(this.scene, game, scenery.landmarks, (game.content.regulars ?? []).map((_, i) => storyPlot(game.town, i)));
    this.stories = buildStories(this.scene, game, scenery.stories);
    this.showStories();
    this.cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 1, 8).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), CONES);
    this.cones.count = 0;
    this.cones.frustumCulled = false;
    this.scene.add(this.cones);
    this.fx = new Fx(this.scene);
    this.debris = new Debris(this.scene);
    this.walls = new WallDamage(this.scene, this.look3.buildings);
    this.drawn = new DrawnBuildings(this.scene, game.town);
    this.drawnWalls = new WallDamage(this.scene, this.drawn);
    this.props = buildFinds(this.scene, game);
    for (const id of game.progress.found) this.hideFind(id);

    this.life = new StreetLife(this.scene, game.town, game.traffic, game.walkers, game.parked);
    this.control = new RoadControl(this.scene, game.town);
    const body = partsGeometry(TRAFFIC_PARTS);
    this.ghost =new THREE.Mesh(body, new THREE.MeshBasicMaterial({ color: '#35e0c2', transparent: true, opacity: 0.4, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    const beamShape = new THREE.PlaneGeometry(13, 30);
    beamShape.rotateX(-Math.PI / 2);
    beamShape.translate(0, 0, 17);
    this.beam = new THREE.Mesh(beamShape, new THREE.MeshBasicMaterial({ color: '#fff0c8', map: softLight(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.frustumCulled = false;
    this.scene.add(this.beam);

    game.on((e) => {
      if (e.type === 'bump') {
        this.shake = Math.min(0.55, this.shake + e.speed / 22);
        const p = game.player, h = p.hit, nx = h ? h.nx : -p.dir.x, nz = h ? h.nz : -p.dir.z;
        const cx = p.x - nx * (p.car.size[0] / 2), cz = p.z - nz * (p.car.size[0] / 2); // the corner that took it
        this.fx.sparks(cx, cz, e.speed);
        this.debris.burst(cx, cz, nx, nz, e.speed, this.paint);
        if (h?.box) {
          this.hitWall({ box: game.town.boxes.indexOf(h.box), nx: h.nx, nz: h.nz, x: h.x, z: h.z, speed: e.speed });
          const i = this.look3.buildings.indexOf(h.box);
          if (i >= 0) this.debris.burst(cx, cz, nx, nz, e.speed, this.look3.buildings.plans[i].wall);
        }
      }
      if (e.type === 'found') this.hideFind(e.find.id);
      if (e.type === 'regular' && e.finale) this.showStories();
      if (e.type === 'event') this.setCones(e.card?.kind ?? '', e.edge);
    });

    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23e', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    const chevron = new THREE.BufferGeometry();
    chevron.setAttribute('position', new THREE.Float32BufferAttribute([-2.4, 0, -1.2, 0, 0, 1.8, 0, 0, 0.2, -2.4, 0, -1.2, 0, 0, 0.2, -2.4, 0, -2.8, 2.4, 0, -1.2, 0, 0, 0.2, 0, 0, 1.8, 2.4, 0, -1.2, 2.4, 0, -2.8, 0, 0, 0.2], 3));
    this.crumbs = new THREE.InstancedMesh(chevron, new THREE.MeshBasicMaterial({ color: '#35e0c2', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 16);
    this.crumbs.frustumCulled = false;
    this.crumbs.count = 0;
    this.scene.add(this.crumbs);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Raises the building of every finished story in place of its lot. */
  showStories() {
    for (const r of this.game.content.regulars ?? []) {
      const s = this.stories.get(r.id), done = (this.game.progress.arcs[r.id] ?? 0) >= r.jobs.length;
      if (!s) continue;
      s.lot.visible = !done || !s.built;
      if (s.built) s.built.visible = done;
    }
  }

  // Two rows of cones or flags along the street an event has taken over.
  private setCones(kind: string, edge: number) {
    const colours = CONE_COLOURS[kind];
    this.cones.count = edge >= 0 && colours ? CONES : 0;
    if (!this.cones.count) return;
    const t = this.game.town, e = t.edges[edge], a = t.nodes[e.a], b = t.nodes[e.b], dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < CONES; i++) {
      const along = 20 + ((e.len - 40) * Math.floor(i / 2)) / (CONES / 2 - 1), side = i % 2 ? 1 : -1;
      this.cones.setMatrixAt(i, m.makeTranslation(a.x + dx * along + dz * side * ROAD_W * 0.42, 0, a.z + dz * along - dx * side * ROAD_W * 0.42));
      this.cones.setColorAt(i, c.set(colours[i % colours.length]));
    }
    this.cones.instanceMatrix.needsUpdate = true;
    this.cones.instanceColor!.needsUpdate = true;
  }

  private hideFind(id: string) {
    for (const key of [id, `mark:${id}`]) {
      const got = this.props.get(key);
      if (!got) continue;
      got.mesh.setMatrixAt(got.index, new THREE.Matrix4().makeScale(0, 0, 0));
      got.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  resize() {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCar(design: Design, driver: Driver) {
    if (this.rig) { this.scene.remove(this.rig.root); disposeCar(this.rig); }
    const car = this.game.player.car;
    this.rig = this.bodyStyle === 'voxel' && voxelProfileFor(car) ? buildVoxelCar(car, design, driver, this.find) : buildCar(car, design, driver, this.find);
    this.paint = this.find(design.paint)?.colors[0] ?? DEFAULT_PAINT;
    this.dmg = new DamageRig(this.rig);
    this.dmg.set(this.game.player.dents, this.game.player.marks);
    this.rig.body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true; });
    for (const w of this.rig.wheels) w.castShadow = true;
    this.scene.add(this.rig.root);
    this.applyRig();
  }

  private applyRig() {
    const cockpit = this.index === 3 && !this.inGarage;
    this.rig.body.visible = !cockpit;
    for (const w of this.rig.wheels) w.visible = !cockpit;
    this.rig.dash.visible = cockpit;
  }

  /** The garage orbits the car, with the scene shifted so the shop panel does not cover it. */
  setGarage(on: boolean, panelPx = 0) {
    this.inGarage = on;
    if (on) this.camera.setViewOffset(innerWidth, innerHeight, panelPx / 2, 0, innerWidth, innerHeight);
    else this.camera.clearViewOffset();
    this.applyRig();
  }

  nextCamera() {
    this.setCamera((this.index + 1) % CAMERA_NAMES.length);
    return this.index;
  }
  setCamera(i: number) {
    this.from.pos.copy(this.camera.position);
    this.from.look.copy(this.look);
    this.blend = 0;
    this.index = i;
    this.applyRig();
  }

  private blocked(p: Vec, side: Vec, d: number) {
    return this.game.town.boxAt(p.x + side.x * d, p.z + side.z * d, 1.5) !== null;
  }

  /** Each rig's camera position and look target for this frame. */
  private rigPose(pos: THREE.Vector3, look: THREE.Vector3) {
    const p = this.game.player, town = this.game.town;
    const f = p.dir, r = { x: -f.z, z: f.x };
    const speedK = Math.min(1, Math.abs(p.speed) / p.vMax);
    if (this.inGarage) {
      this.orbit += 0.004;
      pos.set(p.x + Math.sin(this.orbit) * 7.5, 2.6, p.z + Math.cos(this.orbit) * 7.5);
      look.set(p.x, 0.9, p.z);
    } else if (this.index === 0 || this.index === 1) {
      const far = this.index === 1;
      const c = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; // trails the car, so a turn swings it into view
      let back = far ? 13 + speedK * 5 : 6.2;
      for (let d = 2; d <= back; d += 1.5) if (town.boxAt(p.x - c.x * d, p.z - c.z * d, 1) !== null) { back = Math.max(2.5, d - 1.5); break; } // pull in when a wall is behind
      pos.set(p.x - c.x * back, far ? 5.5 : 2.6, p.z - c.z * back);
      look.set(p.x + f.x * 5, 1.1, p.z + f.z * 5);
    } else if (this.index === 2) {
      const side = this.blocked(p, r, 8) ? -1 : 1; // swap sides to stay on the road
      pos.set(p.x + r.x * 8 * side - f.x * 1.5, 1.7, p.z + r.z * 8 * side - f.z * 1.5);
      look.set(p.x + f.x * 1.5, 1, p.z + f.z * 1.5);
    } else {
      const e = this.rig.eye;
      pos.set(p.x - r.x * e.x + f.x * e.z, e.y, p.z - r.z * e.x + f.z * e.z);
      look.set(pos.x + f.x * 20, e.y - 0.7, pos.z + f.z * 20);
    }
  }

  private drawDash() {
    const c = this.rig.dashCanvas, g = c.getContext('2d')!, p = this.game.player;
    g.fillStyle = '#10131a';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#eaf2ff';
    g.font = '700 44px system-ui';
    g.fillText(`${Math.round(p.kmh)}`, 46, 54); // inside the rim as seen from the seat
    g.font = '16px system-ui';
    g.fillText('km/h', 46, 80);
    const pct = p.fuel / p.car.tank;
    g.fillStyle = '#333a48';
    g.fillRect(132, 56, 74, 18);
    g.fillStyle = pct < 0.1 ? '#ff4d4d' : pct < 0.25 ? '#ffb02e' : '#3ddc97';
    g.fillRect(132, 56, 74 * pct, 18);
    g.fillStyle = '#eaf2ff';
    g.fillText('FUEL', 132, 44);
    // The signal ahead, as a car's traffic light display shows it: three lamps across the top, and the distance to the line.
    const sig = this.game.road.signalAhead();
    if (sig) {
      const lit = { red: sig.aspect === 'red' || sig.aspect === 'redAmber', amber: sig.aspect === 'amber' || sig.aspect === 'redAmber', green: sig.aspect === 'green' };
      (['red', 'amber', 'green'] as const).forEach((k, i) => { g.beginPath(); g.arc(140 + i * 19, 15, 8, 0, 7); g.fillStyle = lit[k] ? SIGNAL_LIT[k] : '#2a2f3a'; g.fill(); });
      g.fillStyle = '#eaf2ff';
      g.font = '15px system-ui';
      g.fillText(`${Math.round(sig.metres / 5) * 5} m`, 194, 21);
    }
    const tick = p.indicator && this.game.time % (60 / INDICATOR_PER_MIN) < 30 / INDICATOR_PER_MIN;
    if (tick) { g.fillStyle = '#3ddc97'; g.font = '700 26px system-ui'; g.fillText(p.indicator < 0 ? '◀' : '▶', p.indicator < 0 ? 8 : 222, 34); }
    this.rig.dashTex.needsUpdate = true;
  }

  private carFeel(dt: number, steer: number, brake: number) {
    const p = this.game.player, rig = this.rig, abs = Math.abs(p.speed), k = Math.min(1, abs / p.vMax);
    const accel = dt > 0 ? (p.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = p.speed;
    const ease = Math.min(1, dt * BODY_EASE);
    this.roll += (-steer * k * ROLL - this.roll) * ease;
    this.pitch += (Math.max(-0.05, Math.min(0.07, -accel * PITCH)) - this.pitch) * ease;
    rig.body.rotation.z = this.roll;
    rig.body.rotation.x = this.pitch;
    const reversing = this.game.player.speed < -0.2, stalk = this.game.player.indicator;
    rig.tails.color.set(brake > 0.05 && !reversing ? TAIL_BRAKE : TAIL_DIM);
    rig.reverse.color.set(reversing ? LAMP_REVERSE : LAMP_OFF);
    const flash = this.game.time % (60 / INDICATOR_PER_MIN) < 30 / INDICATOR_PER_MIN;
    rig.blinkLeft.color.set(stalk < 0 && flash ? BLINK_ON : BLINK_OFF);
    rig.blinkRight.color.set(stalk > 0 && flash ? BLINK_ON : BLINK_OFF);

    let turn = p.heading - this.yaw;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    this.yaw += turn * Math.min(1, dt * CAM_LAG);

    const cornering = Math.abs(steer) * k * 1.6, stopping = brake > 0.5 && abs > 6 && accel < -HARD_BRAKE ? 1 : 0;
    this.slide = Math.min(1, Math.max(stopping, cornering > SLIDE_START ? cornering : 0, p.handbrake && abs > 3 ? 0.8 : 0));
    const f = p.dir, side = { x: f.z * p.car.size[2] * 0.42, z: -f.x * p.car.size[2] * 0.42 };
    const rear = [{ x: p.x - f.x * 1.3 + side.x, z: p.z - f.z * 1.3 + side.z }, { x: p.x - f.x * 1.3 - side.x, z: p.z - f.z * 1.3 - side.z }];
    const offRoad = this.game.town.offRoad(p);
    if (this.slide > 0 && !offRoad) {
      if (this.skidFrom) rear.forEach((w, i) => this.fx.skid(this.skidFrom![i].x, this.skidFrom![i].z, w.x, w.z));
      this.skidFrom = rear;
      if (Math.random() < this.slide) this.fx.puff(rear[0].x, 0.3, rear[0].z, 0, 0.8, 0, 0.5, 0.25, 1.6, '#d9dbe0');
    } else this.skidFrom = null;
    if (offRoad && abs > 4 && Math.random() < 0.3 + k) { const w = rear[Math.random() < 0.5 ? 0 : 1]; this.fx.puff(w.x, 0.3, w.z, -f.x * 1.5, 0.9, -f.z * 1.5, 0.6, 0.16, 1.1, '#c9b48f'); }
    const heat = this.dmg?.heat ?? 0; // a bent engine smokes while it runs
    if (heat > 0.3 && abs > 3 && Math.random() < dt * (1.5 + heat * 5)) {
      const nose = p.car.size[0] * 0.3;
      this.fx.puff(p.x + f.x * nose, 1.05, p.z + f.z * nose, (Math.random() - 0.5) * 0.5, 1.5, (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.6, 0.22, 0.55, '#565b64');
    }
    this.fx.step(dt);
  }

  private drawTraffic(dt: number) {
    this.life.draw(dt, this.game.traffic, this.game.walkers, this.game.parked, this.attract ? this.stand : this.game.player);
    this.control.draw(dt, this.game.traffic.clock, this.game.walkers.lights);
    for (const c of this.game.traffic.cars) { // a car that's taken a real hit smokes where it stands
      if (c.damage < 0.3 || Math.random() > dt * (1 + c.damage * 5)) continue;
      const nose = TRAFFIC_LENGTH * 0.3;
      this.fx.puff(c.x + Math.sin(c.heading) * nose, 1, c.z + Math.cos(c.heading) * nose, (Math.random() - 0.5) * 0.5, 1.4, (Math.random() - 0.5) * 0.5, 0.8 + Math.random() * 0.6, 0.22, 0.6, '#565b64');
    }
  }

  private drawGhost() {
    const q = this.game.quest, pose = q?.offer.rematch && q.phase === 'Active' ? ghostPose(q.offer.rematch, q.elapsed) : null;
    this.ghost.visible = !!pose;
    if (pose) { this.ghost.position.set(pose.x, 0, pose.z); this.ghost.rotation.y = pose.heading; }
  }

  private setLight(c: THREE.Color, v: Rgb) { c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace); }

  /** Low drops the sun's shadows, the clouds and the sharp pixels. Auto starts high and steps down if frames run slow. */
  setQuality(q: Quality) {
    this.quality = q;
    const low = q === 'low';
    this.sun.castShadow = !low;
    this.dome.setClouds(!low);
    this.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 2));
    this.resize();
  }

  private countFrames(dt: number) {
    this.fpsFrames++;
    if ((this.fpsClock += dt) < FPS_WINDOW_S) return;
    this.fps = Math.round(this.fpsFrames / this.fpsClock);
    this.fpsClock = this.fpsFrames = 0;
    if (this.quality === 'auto' && this.fps < AUTO_LOW_FPS && this.sun.castShadow) this.setQuality('low'), (this.quality = 'auto');
  }

  private drawSky(dt: number) {
    const g = this.game, now = skyAt(this.skies, g.dayFrac, g.rain), p = g.player, town = this.look3;
    this.setLight(this.fog.color, now.fog);
    this.fog.near = now.fogNear;
    this.fog.far = now.fogFar;
    this.setLight(this.sun.color, now.sun);
    this.sun.intensity = now.sunPower;
    this.hemi.intensity = now.ambient + now.night * NIGHT_FILL;
    const a = (g.dayFrac - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.3).normalize();
    const tint = new THREE.Color(...now.tint); // a plain multiplier, so 0.4 on the sky's scale reads as 0.4 on screen
    this.hemi.groundColor.set('#88a080').multiply(tint); // light bounced up off the ground
    const sx = Math.round(p.x / SHADOW_SNAP) * SHADOW_SNAP, sz = Math.round(p.z / SHADOW_SNAP) * SHADOW_SNAP; // keeps shadow edges from crawling
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + this.sunDir.x * 140, Math.max(35, this.sunDir.y * 140), sz + this.sunDir.z * 140); // never so low that it stretches across the town
    const wet = g.rain * 0.5;
    town.road.color.set(ASPHALT).multiplyScalar(1 - wet * 0.5);
    town.road.specular.setScalar(wet);
    for (const s of town.shade) s.opacity = 0.32 * Math.min(1, now.sunPower / 1.4 + 0.25);
    this.dome.update(this.camera, now, this.sunDir, g.rain, dt);
    town.buildings.setNight(Math.max(0, (now.night - LIGHTS_ON) / (1 - LIGHTS_ON)) * 1.1); // nobody has the lights on at breakfast in full daylight
    town.lamps.color.set('#4b4f58').lerp(tint.set('#ffe9a8'), now.night);
    town.pools.opacity = now.night * 0.3;
    const lit = Math.max(0, (now.night - LIGHTS_ON) / (1 - LIGHTS_ON));
    (this.beam.material as THREE.MeshBasicMaterial).opacity = lit * 0.5;
    this.beam.position.set(p.x, 0.08, p.z);
    this.beam.rotation.y = p.heading;
    this.fx.rain(g.rain, this.camera.position, dt);
  }

  frame(dt: number, steer: number, brake = 0) {
    this.drawn.update(this.camera.position);
    const g = this.game, p = g.player, rig = this.rig;
    this.countFrames(dt);
    this.dmg?.set(g.player.dents, g.player.marks);
    this.debris.step(dt, g.town);
    this.carFeel(dt, steer, brake);
    this.drawTraffic(dt);
    this.drawGhost();
    this.drawSky(dt);
    rig.root.position.set(p.x, 0, p.z);
    rig.root.rotation.y = p.heading;
    this.spin += (p.speed / 0.34) * dt;
    for (const w of rig.wheels) w.rotation.x = this.spin;
    for (const w of rig.front) w.rotation.y = -steer * 0.45;
    rig.hands.rotation.z = steer * STEER_TURN; // seen from the seat, positive turns the wheel clockwise: right is right

    const quest = g.quest;
    const target = quest?.target ?? g.waypoint;
    this.beacon.visible = !!target;
    if (target) this.beacon.position.set(target.x, 30, target.z);

    if ((this.crumbClock -= dt) <= 0) {
      this.crumbClock = 0.25;
      const m = new THREE.Matrix4(), points = breadcrumbs(g);
      this.crumbs.count = points.length;
      points.forEach((q, i) => {
        const n = points[i + 1] ?? points[i - 1] ?? q;
        const a = i + 1 < points.length ? Math.atan2(n.x - q.x, n.z - q.z) : Math.atan2(q.x - n.x, q.z - n.z);
        m.makeRotationY(a).setPosition(q.x, 0.25, q.z);
        this.crumbs.setMatrixAt(i, m);
      });
      this.crumbs.instanceMatrix.needsUpdate = true;
    }
    if (this.index === 3 && (this.dashClock -= dt) <= 0) { this.dashClock = 0.15; this.drawDash(); }

    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    this.rigPose(pos, look);
    this.blend = Math.min(1, this.blend + dt / BLEND_S);
    this.camera.position.lerpVectors(this.from.pos, pos, this.blend);
    this.look.lerpVectors(this.from.look, look, this.blend);
    if (this.shake > 0.002) {
      this.shake *= Math.exp(-dt * 7);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.freeLook(dt);
    this.camera.lookAt(this.look);
    this.camera.fov = this.index === 3 ? COCKPIT_FOV : this.index < 2 && !this.inGarage ? 60 + Math.min(1, p.kmh / 150) * 12 : 62;
    if (this.attract) this.tour(dt);
    this.camera.updateProjectionMatrix();
    if (this.index === 3 && !this.inGarage && !this.attract) this.drawMirror();
    this.renderer.render(this.scene, this.camera);
  }

  /** The interior mirror's picture, and the reversing camera's while reversing, drawn before the frame with the cockpit hidden, so they show the road and not the car's insides. They reuse the frame's shadows rather than drawing them twice. */
  private drawMirror() {
    const { cam, target } = this.rig.mirror, r = this.renderer;
    this.rig.dash.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(target);
    r.render(this.scene, cam);
    const back = this.rig.back, reversing = this.game.player.speed < -0.2; // the camera comes on with reverse, as the lamps do
    back.view.visible = reversing;
    back.blank.visible = !reversing;
    if (reversing) { r.setRenderTarget(back.target); r.render(this.scene, back.cam); }
    r.setRenderTarget(null);
    r.shadowMap.autoUpdate = true;
    this.rig.dash.visible = true;
  }

  /** Where the interior mirror's glass is on screen, in CSS pixels, in the cockpit view; null in any other. */
  mirrorRect(): { left: number; right: number; bottom: number } | null {
    const glass = this.rig.mirror.glass;
    if (this.index !== 3 || this.inGarage || !glass) return null;
    const box = new THREE.Box3().setFromObject(glass), w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    let left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      left = Math.min(left, (v.x + 1) / 2 * w);
      right = Math.max(right, (v.x + 1) / 2 * w);
      bottom = Math.max(bottom, (1 - v.y) / 2 * h);
    }
    return { left, right, bottom };
  }

  /** Knock a hole in a building, and keep the hit so a save can put the hole back. */
  private hitWall(w: WallHit, now?: number) {
    const box = this.game.town.boxes[w.box];
    if (!box) return;
    const drawn = this.drawn.boxAt(w.x, w.z); // the stations and big places stand on solids of their own, so go by where it landed
    const landed = drawn ? this.drawnWalls.hit(drawn, w.nx, w.nz, w.x, w.z, w.speed, undefined, now) : this.walls.hit(box, w.nx, w.nz, w.x, w.z, w.speed, undefined, now);
    if (landed) this.wallHits.push(w);
  }

  /** The hits behind every hole still showing, oldest first: the damage is worked out the same way each time, so replaying them rebuilds it. */
  get wallLog(): WallHit[] {
    this.wallHits = this.wallHits.filter((w) => {
      const drawn = this.drawn.boxAt(w.x, w.z), box = this.game.town.boxes[w.box];
      return drawn ? this.drawnWalls.holds(drawn) : !!box && this.walls.holds(box);
    });
    return this.wallHits;
  }

  /** Put a saved game's holes back. Each hit is spaced a second apart, past the gap that merges a scrape into one blow. */
  replayWalls(log: readonly WallHit[]) {
    log.forEach((w, i) => this.hitWall(w, i - log.length - 10));
  }

  /** Drag with the mouse to look round, in any camera: chase views swing round the car, the cockpit turns your head. Let go and it settles back. */
  private freeLook(dt: number) {
    if (this.dragAt === null && (this.lookHold -= dt) <= 0) {
      const settle = Math.exp(-dt * LOOK_SETTLE);
      this.lookYaw *= settle;
      this.lookPitch *= settle;
    }
    if (Math.abs(this.lookYaw) < 1e-3 && Math.abs(this.lookPitch) < 1e-3) return;
    const cockpit = this.index === 3 && !this.inGarage, pivot = cockpit ? this.camera.position : this.look, moved = cockpit ? this.look : this.camera.position;
    const off = moved.clone().sub(pivot), reach = off.length();
    const yaw = Math.atan2(off.x, off.z) + this.lookYaw, pitch = THREE.MathUtils.clamp(Math.asin(off.y / reach) + this.lookPitch, cockpit ? -0.7 : 0.03, cockpit ? 0.7 : 1.35);
    moved.set(pivot.x + Math.sin(yaw) * Math.cos(pitch) * reach, pivot.y + Math.sin(pitch) * reach, pivot.z + Math.cos(yaw) * Math.cos(pitch) * reach);
  }

  /** The title screen: glide down a real street in each district in turn, with the town going about its day. */
  private tour(dt: number) {
    const g = this.game;
    this.tourStops ??= DISTRICT_IDS.map((id) => {
      const best = g.town.edges.map((e) => {
        const a = g.town.nodes[e.a], b = g.town.nodes[e.b], m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        return { a, b, m, len: e.len, kin: g.town.boxes.filter((o) => o.district === id && dist(o, m) < 90).length };
      }).filter((e) => districtAt(e.m.x, e.m.z) === id && e.len > 120).sort((p, q) => q.kin - p.kin)[0];
      return { id, x: best.a.x, z: best.a.z, ux: (best.b.x - best.a.x) / best.len, uz: (best.b.z - best.a.z) / best.len, len: best.len };
    });
    if ((this.tourClock += dt) > ATTRACT_SHOT_S || this.tourAt < 0) {
      this.tourClock = 0;
      this.tourAt = (this.tourAt + 1) % this.tourStops.length;
      this.attract!(this.tourStops[this.tourAt].id);
    }
    const s = this.tourStops[this.tourAt], along = Math.min(s.len * 0.25 + this.tourClock * 8, s.len - 8), out = 2;
    const at = (d: number, side: number) => ({ x: s.x + s.ux * d + s.uz * side, z: s.z + s.uz * d - s.ux * side });
    const eye = at(along, out), ahead = at(along + 50, 0);
    this.stand.x = eye.x;
    this.stand.z = eye.z;
    g.traffic.step(dt, this.stand);
    g.walkers.step(dt, this.stand, g.traffic.cars);
    this.camera.position.set(eye.x, 7 + Math.sin(this.tourClock * 0.4) * 1.2, eye.z);
    this.camera.lookAt(ahead.x, 5, ahead.z);
    this.camera.fov = 58;
  }

  /** End the tour and put the camera back behind the car. */
  stopAttract() { this.attract = null; }
}
