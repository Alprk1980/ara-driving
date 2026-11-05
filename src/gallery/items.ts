// Everything in the game with a 3D model, in one list, each made by the code that makes it in the game,
// plus the Blender exports (blender/ara_assets.py) that may one day replace the procedural car meshes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FURNITURE_KINDS, type Box } from '../sim/town.ts';
import { CARS } from '../sim/economy.ts';
import { PROP_KINDS, type Landmark, type Part, type StoryPlace } from '../../schemas/content.ts';
import type { BuildingStyle } from '../../schemas/buildings.ts';
import type { Piece } from '../../schemas/house.ts';
import type { CatalogueItem } from '../../schemas/content.ts';
import { SERVICE_RULES, type ServiceBuilding } from '../../schemas/services.ts';
import buildingStyles from '../data/buildingstyles.json';
import catalogue from '../data/catalogue.json';
import houseClaude from '../data/house-claude.json';
import houseQwen from '../data/house-qwen.json';
import landmarks from '../data/landmarks.json';
import services from '../data/services.json';
import stories from '../data/stories.json';
import { piecesGeometry } from '../photovox/pieces.ts';
import { fleetGeometry, FLEET_SHAPES } from '../view/fleet.ts';
import { paintedMaterial, partsGeometry, PROP_PARTS, TRAFFIC_PARTS } from '../view/parts.ts';
import { CAR_SHAPES, carGeometry, FURNITURE_PARTS, parkedMaterial } from '../view/streetlife.ts';
import { TownBuildings } from '../view/townblocks.ts';
import { buildVoxelCar } from '../view/voxelcar.ts';

export type Item = { id: string; name: string; group: string; paint?: boolean; make: (paint: string) => THREE.Object3D | Promise<THREE.Object3D> };

const title = (id: string) => id.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
const parts = (list: Part[]) => () => new THREE.Mesh(partsGeometry(list), paintedMaterial());
const DRAWN = (import.meta as unknown as { glob: (path: string, opts: { eager: true }) => Record<string, { default: { id: string; name: string; pieces: Piece[] } }> }).glob('../data/drawn/*.json', { eager: true });
const drawn = (pieces: Piece[]) => () => new THREE.Mesh(piecesGeometry(pieces), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));

/** A town car takes its paint per instance, as it does at the kerb. */
function townCar(shape: (typeof CAR_SHAPES)[number], paint: string) {
  const m = new THREE.InstancedMesh(carGeometry(shape), parkedMaterial(), 1);
  m.setMatrixAt(0, new THREE.Matrix4());
  m.setColorAt(0, new THREE.Color(paint));
  return m;
}

function fleetVehicle(shape: (typeof FLEET_SHAPES)[number]) {
  const m = new THREE.InstancedMesh(fleetGeometry(shape), parkedMaterial(), 1);
  m.setMatrixAt(0, new THREE.Matrix4());
  m.setColorAt(0, new THREE.Color('#ffffff'));
  return m;
}

function building(style: BuildingStyle) {
  const b: Box = { x: 0, z: 0, hx: 12, hz: 10, h: style.storeys[1] * 3.4, hue: 0.3, district: style.district, style: style.id };
  return new TownBuildings([b], buildingStyles as unknown as BuildingStyle[]).group;
}

function station(s: ServiceBuilding) {
  const g = new THREE.Group(), r = SERVICE_RULES[s.id];
  g.add(new THREE.Mesh(partsGeometry(s.parts), paintedMaterial()));
  for (const d of s.doors) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.14), new THREE.MeshLambertMaterial({ color: r.door }));
    door.position.set(d.x, d.h / 2, r.hz + 0.08);
    g.add(door);
  }
  return g;
}

// The town's trees are built inline in scene.ts, as instances. These match their shapes and colours.
function broadleaf() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 0).scale(1, 1.15, 1).translate(0, 6, 0), new THREE.MeshLambertMaterial({ color: '#4c9a58', flatShading: true })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: '#7a5637' })));
  return g;
}

function conifer() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 7).translate(0, 5.5, 0), new THREE.MeshLambertMaterial({ color: '#3f9a57' })));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshLambertMaterial({ color: '#7a5637' })));
  return g;
}

const find = (id?: string) => (id ? (catalogue as CatalogueItem[]).find((c) => c.id === id) : undefined);

// The Blender factory's exports, loaded once each and cloned per showing (the gallery disposes geometry).
const gltfLoader = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Object3D>>();
function glb(url: string): () => Promise<THREE.Object3D> {
  let p = glbCache.get(url);
  if (!p) {
    const load = new Promise<THREE.Object3D>((done, fail) => gltfLoader.load(url, (g) => done(g.scene), undefined, fail));
    load.catch(() => { if (glbCache.get(url) === load) glbCache.delete(url); }); // a failed load is tried again next time, as after a re-export
    glbCache.set(url, (p = load));
  }
  return async () => {
    const copy = (await p).clone(true);
    copy.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.isMesh) mesh.geometry = mesh.geometry.clone(); });
    return copy;
  };
}

// These ids match carprofiles.json, fleet.json and towncars.json - the same names the game uses.
const GLB_PLAYERS = ['hatchback', 'compact', 'pickup', 'taxi', 'coupe', 'supercar'];
const GLB_FLEET = ['bus_single', 'bus_double', 'police_car', 'police_van', 'ambulance', 'fire_engine', 'recovery_truck'];
const GLB_CARS = ['saloon', 'hatchback', 'mpv', 'suv', 'city_car', 'estate', 'panel_van', 'coupe', 'supermini', 'crossover', 'black_cab', 'pickup_truck'];
const glbItems = (ids: string[], folder: string, group: string) =>
  ids.map((id): Item => ({ id: `glb_${folder}_${id}`, name: title(id), group, make: glb(`models/${folder}/${id}.glb`) }));

export const ITEMS: Item[] = [
  ...CARS.map((c): Item => ({ id: `player_${c.id}`, name: c.name, group: 'Player cars', make: () => buildVoxelCar(c, {}, {}, find).root })),
  ...CAR_SHAPES.map((s): Item => ({ id: `car_${s.id}`, name: s.name, group: 'Town cars', paint: true, make: (paint) => townCar(s, paint) })),
  ...FLEET_SHAPES.map((s): Item => ({ id: s.id, name: s.name, group: 'Buses and services', make: () => fleetVehicle(s) })),
  ...(buildingStyles as unknown as BuildingStyle[]).map((s): Item => ({ id: `style_${s.id}`, name: s.name, group: 'Town buildings', make: () => building(s) })),
  ...(services as unknown as ServiceBuilding[]).map((s): Item => ({ id: `station_${s.id}`, name: s.name, group: 'Stations', make: () => station(s) })),
  ...(landmarks as unknown as Landmark[]).map((l): Item => ({ id: l.id, name: title(l.id), group: 'Town places', make: parts(l.parts) })),
  ...(stories as unknown as StoryPlace[]).map((s): Item => ({ id: s.id, name: s.name, group: 'Story places', make: parts(s.parts) })),
  { id: 'house_claude', name: 'House from your drawing: Claude tuned', group: 'Built from drawings', make: drawn(houseClaude.pieces as Piece[]) },
  { id: 'house_qwen', name: 'House from your drawing: Qwen', group: 'Built from drawings', make: drawn(houseQwen.pieces as Piece[]) },
  ...Object.values(DRAWN).map(({ default: b }): Item => ({ id: `drawn_${b.id}`, name: b.name, group: 'Built from drawings', make: drawn(b.pieces) })),
  ...FURNITURE_KINDS.map((k): Item => ({ id: `furniture_${k}`, name: title(k), group: 'Street furniture', make: parts(FURNITURE_PARTS[k]) })),
  ...PROP_KINDS.map((k): Item => ({ id: `find_${k}`, name: title(k), group: 'Hidden finds', make: parts(PROP_PARTS[k]) })),
  { id: 'car_simple', name: 'Simple block car', group: 'Town cars', make: parts(TRAFFIC_PARTS) },
  { id: 'tree_broadleaf', name: 'Broadleaf tree', group: 'Trees', make: broadleaf },
  { id: 'tree_conifer', name: 'Conifer', group: 'Trees', make: conifer },
  ...glbItems(GLB_PLAYERS, 'players', 'Blender GLB: player cars'),
  ...glbItems(GLB_FLEET, 'fleet', 'Blender GLB: service fleet'),
  ...glbItems(GLB_CARS, 'cars', 'Blender GLB: town cars'),
];
