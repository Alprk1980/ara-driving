// The Photo to Voxels page: photos in, a model you can spin round and save. tools/photovox.ts drives the same page.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carve, cellAt, cutPreview, outlineMatch, viewAgreement, type Picture, type Shot, type View, type VoxelBlock } from './carve.ts';
import { skinNormals, surfaceNet, type Skin } from '../view/carsurface.ts';
import { simplify, type Wrapped } from './wrap.ts';
import type { Part } from '../../schemas/content.ts';
import landmarks from '../data/landmarks.json';
import services from '../data/services.json';
import stories from '../data/stories.json';
import { fleetGeometry, FLEET_SHAPES } from '../view/fleet.ts';
import { partsGeometry } from '../view/parts.ts';

const MAX_PIXELS = 640; // plenty for a model under 100 voxels long, and it keeps carving quick
const VIEWS: View[] = ['side', 'front', 'top', 'back'];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color('#12151b');
scene.add(new THREE.HemisphereLight('#ffffff', '#59606e', 1.5));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(4, 8, 6);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000); // the camera stands back further as the voxel count rises
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
let mesh: THREE.Object3D | null = null, block: VoxelBlock | null = null;
const CREASE_RAD = 0.6; // about 35°: sharper than this stays a hard edge, gentler is shaded smooth
let lastGame: (Wrapped & { palette: string[] }) | null = null;
let smoothing = 8; // rounds of softening: 0 shows the blocks, and more rounds the corners further

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });

function aim(yaw: number, pitch: number) {
  if (!block) return;
  const reach = Math.max(block.nx, block.ny, block.nz) * 2.4;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * reach, Math.sin(pitch) * reach, Math.cos(yaw) * Math.cos(pitch) * reach);
  orbit.target.set(0, 0, 0);
  orbit.update();
}

/** The voxels as they are, one cube each. */
function blocks(b: VoxelBlock) {
  const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), b.cells.length);
  const m = new THREE.Matrix4(), colours = b.palette.map((p) => new THREE.Color(p));
  b.cells.forEach(([x, y, z, c], i) => {
    cubes.setMatrixAt(i, m.makeTranslation(x + 0.5 - b.nx / 2, y + 0.5 - b.ny / 2, z + 0.5 - b.nz / 2));
    cubes.setColorAt(i, colours[c]);
  });
  return cubes;
}

const skinOf = (b: VoxelBlock): Skin => {
  const hue = new Map(b.cells.map(([x, y, z, c]) => [cellAt(b.nx, b.nz, x, y, z), b.palette[c]]));
  return surfaceNet({ lo: [0, 0, 0], hi: [b.nx - 1, b.ny - 1, b.nz - 1] }, (x, y, z) => b.solid![cellAt(b.nx, b.nz, x, y, z)] === 1, (x, y, z) => hue.get(cellAt(b.nx, b.nz, x, y, z)) ?? b.palette[0], (x, y, z) => [x + 0.5 - b.nx / 2, y + 0.5 - b.ny / 2, z + 0.5 - b.nz / 2], smoothing);
};

/** One smooth skin over the voxels, the same surface the player's car is drawn with, which rounds corners and steps. */
function skin(b: VoxelBlock) {
  const s = skinOf(b), g = new THREE.BufferGeometry(), normals = new Float32Array(s.points.length), index: number[] = [], materials: THREE.Material[] = [];
  skinNormals(s.points, s.quads.values(), normals);
  g.setAttribute('position', new THREE.BufferAttribute(s.points, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  for (const [colour, list] of s.quads) {
    g.addGroup(index.length, list.length, materials.length);
    materials.push(new THREE.MeshLambertMaterial({ color: colour }));
    for (const v of list) index.push(v);
  }
  g.setIndex(index);
  return new THREE.Mesh(g, materials);
}

/** The light version for the game: the skin with the triangles it doesn't need gone, its colours on its vertices, so it's one draw call. */
function gameVersion(budget: number) {
  if (!block) throw new Error('build a model first');
  const s = skinOf(block), names = [...s.quads.keys()], tris: number[] = [], hues: number[] = [];
  names.forEach((name, h) => { const list = s.quads.get(name)!; for (let i = 0; i < list.length; i += 3) { tris.push(list[i], list[i + 1], list[i + 2]); hues.push(h); } });
  const start = performance.now(), light = simplify({ points: s.points, tris, hues }, budget), ms = Math.round(performance.now() - start);
  if (mesh) scene.remove(mesh);
  const position: number[] = [], color: number[] = [], paint = names.map((n) => new THREE.Color(n));
  for (let t = 0; t < light.tris.length / 3; t++) for (let k = 0; k < 3; k++) {
    const v = light.tris[t * 3 + k] * 3, c = paint[light.hues[t]];
    position.push(light.points[v], light.points[v + 1], light.points[v + 2]);
    color.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  mesh = new THREE.Mesh(toCreasedNormals(g, CREASE_RAD), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  lastGame = { ...light, palette: names };
  return { before: tris.length / 3, after: light.tris.length / 3, colours: names.length, ms };
}

function show(b: VoxelBlock) {
  if (mesh) scene.remove(mesh);
  block = b;
  mesh = smoothing > 0 && b.solid ? skin(b) : blocks(b);
  scene.add(mesh);
  aim(-0.7, 0.35);
}

const pictureOf = (img: CanvasImageSource & { width: number; height: number }): Picture => {
  const k = Math.min(1, MAX_PIXELS / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, c.width, c.height);
  return { width: c.width, height: c.height, rgba: x.getImageData(0, 0, c.width, c.height).data };
};
const fromUrl = async (url: string) => { const i = new Image(); i.src = url; await i.decode(); return pictureOf(i); };

function build(shots: Shot[], long: number, tolerance: number) {
  const b = carve(shots, { long, tolerance }), match = Object.fromEntries(shots.map((s) => [s.view, +outlineMatch(b, s, tolerance).toFixed(3)]));
  show(b);
  return { match, agreement: viewAgreement(shots, tolerance), cells: b.cells.length, size: [b.nx, b.ny, b.nz], colours: b.palette.length };
}

// The page itself.
const held = new Map<View, Picture>();
const longInput = $<HTMLInputElement>('long'), tolInput = $<HTMLInputElement>('tol'), buildBtn = $<HTMLButtonElement>('build'), saveBtn = $<HTMLButtonElement>('save'), gameBtn = $<HTMLButtonElement>('game'), stats = $('stats');
longInput.oninput = () => { $('longText').textContent = longInput.value; };
tolInput.oninput = () => { $('tolText').textContent = tolInput.value; };
const smoothInput = $<HTMLInputElement>('smooth');
smoothInput.oninput = () => {
  smoothing = Number(smoothInput.value);
  $('smoothText').textContent = smoothing ? String(smoothing) : 'blocks';
  if (block) show(block);
};
for (const view of VIEWS) {
  const d = document.createElement('div'), input = document.createElement('input'), name = document.createElement('span');
  d.className = 'drop';
  name.textContent = view[0].toUpperCase() + view.slice(1);
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('aria-label', `${view} photo`);
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    held.set(view, await fromUrl(url));
    d.style.backgroundImage = `url(${url})`;
    d.classList.add('on');
    buildBtn.disabled = held.size < 2;
  };
  d.append(name, input);
  $('drops').append(d);
}
buildBtn.onclick = () => {
  try {
    const r = build([...held].map(([view, pic]) => ({ view, pic })), Number(longInput.value), Number(tolInput.value));
    stats.textContent = `${r.size.join(' × ')} voxels, ${r.cells} on the surface, ${r.colours} colours${r.agreement === null ? '' : `\nViews agree: ${Math.round(r.agreement * 100)}%`}\nOutline match: ${Object.entries(r.match).map(([v, m]) => `${v} ${Math.round(m * 100)}%`).join(', ')}`;
    saveBtn.disabled = gameBtn.disabled = false;
  } catch (e) { stats.textContent = (e as Error).message; }
};
const modelJson = () => JSON.stringify({ ...block, solid: undefined });
const download = (text: string, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
};
saveBtn.onclick = () => download(modelJson(), 'voxel-model.json');
gameBtn.onclick = () => {
  const r = gameVersion(Number($<HTMLInputElement>('budget').value));
  stats.textContent = `Game version: ${r.after.toLocaleString()} triangles, down from ${r.before.toLocaleString()}, in one draw call`;
  download(JSON.stringify(lastGame), 'game-model.json');
};

/** The shape of anything the game has a model for: a vehicle, a landmark, a story place or a station. */
function subject(id: string): THREE.BufferGeometry {
  const vehicle = FLEET_SHAPES.find((v) => v.id === id);
  if (vehicle) return fleetGeometry(vehicle);
  const built = [...landmarks, ...stories, ...services].find((p) => p.id === id);
  if (!built) throw new Error(`no model called ${id}`);
  return partsGeometry(built.parts as Part[]);
}

/** A flat photograph of a model from the game on a plain background, as a known subject to test the carving against. */
function snap(id: string, view: View): string {
  const m = new THREE.Mesh(subject(id), new THREE.MeshLambertMaterial({ vertexColors: true })), s = new THREE.Scene();
  s.background = new THREE.Color('#f2f2f4');
  s.add(new THREE.AmbientLight('#ffffff', 3), m);
  const box = new THREE.Box3().setFromObject(m), mid = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.6, size = 640;
  const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.1, 100), rig = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  cam.position.copy(mid).add(view === 'side' ? new THREE.Vector3(30, 0, 0) : view === 'front' ? new THREE.Vector3(0, 0, 30) : view === 'back' ? new THREE.Vector3(0, 0, -30) : new THREE.Vector3(0, 30, 0));
  if (view === 'top') cam.up.set(0, 0, 1);
  cam.lookAt(mid);
  rig.setSize(size, size);
  rig.render(s, cam);
  const url = rig.domElement.toDataURL('image/png');
  rig.dispose();
  return url;
}

/** A picture as a data URL, for showing Qwen a cut-out. */
function urlOf(p: Picture): string {
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height), 0, 0);
  return c.toDataURL('image/png');
}

const auto = window as unknown as { photovox: unknown };
auto.photovox = {
  snap,
  aim,
  model: modelJson,
  game: gameVersion,
  gameModel: () => JSON.stringify(lastGame),
  cuts: async (list: { view: View; url: string }[], tolerance: number) => Promise.all(list.map(async ({ url }) => urlOf(cutPreview(await fromUrl(url), tolerance)))),
  run: async (list: { view: View; url: string }[], long: number, tolerance: number) => build(await Promise.all(list.map(async ({ view, url }) => ({ view, pic: await fromUrl(url) }))), long, tolerance),
};
