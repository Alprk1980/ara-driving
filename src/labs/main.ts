// The lab bench: one part of the game at a time, on a real rig with the real code paths.
// Car fit — the voxel sculpt, the block rig it must match, and the profile lines both come from.
// Damage — the sim's own crash maths (sideOf, addDent) against the rig's own DamageRig.
// Spec sheet — the body as a drawing sheet: elevations, dimension lines, iso views, title block.
import * as THREE from 'three';
import catalogue from '../data/catalogue.json';
import profilesJson from '../data/carprofiles.json';
import type { CatalogueItem } from '../../schemas/content.ts';
import { carProfileErrors, profileVsCar, type CarBodyProfile } from '../../schemas/carprofiles.ts';
import { CARS, REPAIR_RATE } from '../sim/economy.ts';
import { DISTRICTS } from '../sim/districts.ts';
import { addCrush, crushLevel, sideOf, SIDES, type Side } from '../sim/car.ts';
import type { Driver } from '../save.ts';
import { buildCar, type CarRig } from '../view/carmesh.ts';
import { buildVoxelCar, voxelProfileFor } from '../view/voxelcar.ts';
import { DamageRig } from '../view/damage.ts';
import { fleetGeometry, FLEET_SHAPES } from '../view/fleet.ts';
import { CAR_SHAPES, carGeometry, parkedMaterial } from '../view/streetlife.ts';
import { TownBuildings } from '../view/townblocks.ts';
import { WallDamage } from '../view/walls.ts';
import buildingStyles from '../data/buildingstyles.json';
import type { BuildingStyle } from '../../schemas/buildings.ts';
import type { Box } from '../sim/town.ts';
import type { Lookup } from '../view/cockpit.ts';
import { carVoxels, lineAt, voxelPieces, voxelsFor } from '../view/voxels.ts';

const items = catalogue as CatalogueItem[];
const find: Lookup = (id) => (id ? items.find((c) => c.id === id) : undefined);
const driver: Driver = {};
const shippedProfiles = profilesJson as unknown as CarBodyProfile[];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#12141a');
scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3f4a', 1.1), new THREE.DirectionalLight('#fff', 1.6).translateX(6).translateY(12));
scene.add(new THREE.GridHelper(20, 20, '#2c3140', '#222633'));
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

// Two ways to look around: orbit around the car, or free-look (pointer lock, WASD + QE to fly).
let mode: 'orbit' | 'free' = 'orbit';
let azim = 0.7, elev = 0.32, dist = 9;
const look = new THREE.Vector3(0, 0.7, 0);
let yaw = 0, pitch = 0;
camera.rotation.order = 'YXZ';

// Orbit eases toward these. While `fitted`, dist and look come from the car, the angle and the canvas; zooming by hand switches that off until a view is picked.
const want = { azim, elev, dist, look: look.clone() };
let subject: readonly [number, number, number] = [3.8, 1.5, 1.8], fitted = true;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The distance that puts the whole car on screen from the wanted angle: each corner of its box, checked against both edges of the view. */
function fit() {
  if (!fitted) return;
  const [len, tall, wide] = subject, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  const back = new THREE.Vector3(Math.sin(want.azim) * Math.cos(want.elev), Math.sin(want.elev), Math.cos(want.azim) * Math.cos(want.elev));
  const right = new THREE.Vector3(Math.cos(want.azim), 0, -Math.sin(want.azim)), up = new THREE.Vector3().crossVectors(back, right);
  let d = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Vector3((x * wide) / 2 + x * 0.12, (y * tall) / 2 + y * 0.12, (z * len) / 2 + z * 0.22);
    d = Math.max(d, Math.abs(corner.dot(right)) / tanH + corner.dot(back), Math.abs(corner.dot(up)) / tanV + corner.dot(back));
  }
  want.dist = THREE.MathUtils.clamp(d * 1.08, 1.5, 120);
  want.look.set(0, tall / 2, 0);
}
/** Point the bench at a new car, keeping the angle. */
function frameCar(size: readonly [number, number, number]) {
  subject = size;
  fitted = true;
  fit();
}

/** Yaw/pitch from wherever the orbit camera happens to be, so the switch doesn't jump. */
function toFree() {
  const d = camera.position.clone().sub(look);
  dist = d.length();
  yaw = Math.atan2(d.x, d.z);
  pitch = -Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1)); // camera sits above the car, so it looks down from here
  mode = 'free';
}
/** Orbit around a point straight ahead of wherever free-look ended up, so the switch doesn't jump, then ease back onto the car. */
function toOrbit() {
  const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  look.copy(camera.position).addScaledVector(ahead, dist);
  want.azim = azim = Math.atan2(-ahead.x, -ahead.z);
  elev = Math.asin(THREE.MathUtils.clamp(-ahead.y, -1, 1));
  want.elev = THREE.MathUtils.clamp(elev, MIN_ELEV, MAX_ELEV);
  mode = 'orbit';
  fitted = true;
  fit();
}
const camBtn = document.getElementById('cammode') as HTMLButtonElement;
const camHint = document.getElementById('camhint')!;
function setMode(next: 'orbit' | 'free') {
  if (next === mode) return;
  next === 'free' ? toFree() : toOrbit();
  camBtn.classList.toggle('on', mode === 'free');
  camBtn.textContent = mode === 'free' ? 'Orbit' : 'Free look';
  camHint.textContent = mode === 'free' ? 'click to capture the mouse · WASD move, QE up/down, Shift fast · Esc releases, F orbits' : 'drag to orbit · wheel to zoom · F switches to free look';
}
camBtn.onclick = () => setMode(mode === 'free' ? 'orbit' : 'free');

function aimCamera(dt: number) {
  if (mode === 'free') {
    const spd = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7 : 2.6) * dt;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const push = (v: THREE.Vector3, d: number) => camera.position.addScaledVector(v, d);
    if (keys.has('KeyW') || keys.has('ArrowUp')) push(f, spd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) push(f, -spd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) push(r, spd);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) push(r, -spd);
    if (keys.has('KeyE') || keys.has('Space')) push(new THREE.Vector3(0, 1, 0), spd);
    if (keys.has('KeyQ')) push(new THREE.Vector3(0, 1, 0), -spd);
    camera.rotation.set(pitch, yaw, 0);
    return;
  }
  const ease = 1 - Math.exp(-dt * 9), turn = dragFrom ? 1 : ease; // the hand moves the car directly; everything else glides
  azim += wrapAngle(want.azim - azim) * turn;
  elev += (want.elev - elev) * turn;
  dist += (want.dist - dist) * ease;
  look.lerp(want.look, ease);
  camera.position.set(look.x + dist * Math.sin(azim) * Math.cos(elev), look.y + dist * Math.sin(elev), look.z + dist * Math.cos(azim) * Math.cos(elev));
  camera.lookAt(look);
}
const MIN_ELEV = -0.02, MAX_ELEV = 1.52; // not through the floor, not over the pole where the view flips
let dragFrom: { x: number; y: number } | null = null, pressedAt = { x: 0, y: 0 };
let stageClick: ((e: PointerEvent) => void) | null = null;
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return; // typing a profile, not flying
  keys.add(e.code);
  if (e.code === 'KeyF') setMode(mode === 'free' ? 'orbit' : 'free');
  if (e.code === 'Space' && mode === 'free') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.onclick = () => { if (mode === 'free' && document.pointerLockElement !== canvas) canvas.requestPointerLock(); };
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= e.movementX * 0.0025;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0025, -1.5, 1.5);
});
canvas.onpointerdown = (e) => { if (mode !== 'orbit') return; dragFrom = pressedAt = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); };
canvas.onpointermove = (e) => {
  if (!dragFrom || mode !== 'orbit') return;
  want.azim -= (e.clientX - dragFrom.x) * 0.008; // the near side of the car follows the hand
  want.elev = THREE.MathUtils.clamp(want.elev + (e.clientY - dragFrom.y) * 0.008, MIN_ELEV, MAX_ELEV);
  dragFrom = { x: e.clientX, y: e.clientY };
};
canvas.onpointerup = (e) => {
  if (dragFrom && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) < 5) stageClick?.(e); // a press that didn't move is a click on the stage
  dragFrom = null;
  fit();
};
canvas.onpointercancel = () => { dragFrom = null; fit(); };
canvas.onwheel = (e) => {
  e.preventDefault();
  fitted = false;
  want.dist = THREE.MathUtils.clamp(want.dist * (1 + Math.sign(e.deltaY) * 0.1), 1.5, 120);
};
// Square-on views for checking a shape, and the guide lines off for seeing the car alone.
const VIEWS: Record<string, [number, number]> = { 'Three-quarter': [0.7, 0.32], Side: [Math.PI / 2, 0.05], Front: [0, 0.05], Rear: [Math.PI, 0.05], Top: [Math.PI / 2, 1.5] };
for (const [name, [a, e]] of Object.entries(VIEWS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = name;
  b.onclick = () => { setMode('orbit'); want.azim = a; want.elev = e; fitted = true; fit(); };
  document.getElementById('views')!.append(b);
}
let guidesOn = true;
const guideBtn = document.getElementById('guides') as HTMLButtonElement;
guideBtn.onclick = () => { guidesOn = !guidesOn; guides.visible = guidesOn; guideBtn.classList.toggle('on', guidesOn); };
new ResizeObserver(size).observe(canvas); // the canvas, not the window: the page reflows without the window changing
function size() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fit();
  current?.onResize?.(); // a sheet's panels and labels are laid out in pixels, so a reflow means laying them out again
}

// Each lab draws into its own group and reports into the bench column; switching disposes the old one.
const bench = document.getElementById('bench')!;
let stage = new THREE.Group(), guides = new THREE.Group(), walls: WallDamage | null = null;
scene.add(stage);
function clearStage() {
  // Lines as well as meshes: the guides' wire boxes and side lines each made a geometry and a material of their own.
  // Mesh materials are left alone, as some are shared with the game (parkedMaterial).
  stage.traverse((o) => {
    const m = o as THREE.Mesh | THREE.Line;
    if ((m as THREE.Mesh).isMesh || (m as THREE.Line).isLine) m.geometry?.dispose();
    if ((m as THREE.Line).isLine) for (const mat of [m.material].flat()) mat.dispose();
  });
  scene.remove(stage);
  stage = new THREE.Group();
  guides = new THREE.Group();
  guides.visible = guidesOn;
  stage.add(guides);
  scene.add(stage);
  stageClick = null;
  walls = null;
}
function wireBox(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) {
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color }));
  line.position.set(x, y, z);
  return line;
}
function sideLine(pts: [number, number][], color: string, x: number) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(([zm, ym]) => new THREE.Vector3(x, ym, zm)));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
const fmt = (n: number) => n.toFixed(2);

/* ----------------------------- drawing-sheet kit ----------------------------- */
// Labs that draw a paper sheet instead of a model to orbit: square-on panels, each with its own
// orthographic camera in its own corner of the canvas; dimension lines kept in metres so the
// drawing rescales honestly; labels and the title block as DOM text over the top.
const PAPER = '#f3f4f7', INK = '#2b3546', FAINT = '#9aa3b5', DIMC = '#5b6577';
const sheetBox = document.getElementById('labels')!;
type Panel = { scene: THREE.Scene; cam: THREE.OrthographicCamera; x: number; y: number; w: number; h: number; spanH: number; right: THREE.Vector3; up: THREE.Vector3 };

function newSheet() {
  const panels: Panel[] = [], geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const mat = (color: string, dashed = false) => {
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.09, gapSize: 0.05 }) : new THREE.LineBasicMaterial({ color });
    mats.push(m);
    return m;
  };
  const line = (pts: THREE.Vector3[], color = INK, dashed = false) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    geos.push(g);
    const l = new THREE.Line(g, mat(color, dashed));
    if (dashed) l.computeLineDistances();
    return l;
  };
  const loop = (pts: THREE.Vector3[], color = INK) => { const g = new THREE.BufferGeometry().setFromPoints(pts); geos.push(g); return new THREE.LineLoop(g, mat(color)); };
  const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) => {
    const b = new THREE.BoxGeometry(w, h, d), e = new THREE.EdgesGeometry(b);
    b.dispose(); geos.push(e);
    const o = new THREE.LineSegments(e, mat(color));
    o.position.set(x, y, z);
    return o;
  };
  /** A panel: metres across (spanH) chosen so both wanted extents fit; the vertical span follows the pixels so a metre is square. */
  const makePanel = (eye: THREE.Vector3, target: THREE.Vector3, needW: number, needH: number, x: number, y: number, w: number, h: number): Panel => {
    const spanH = Math.max(needW, (needH * w) / h);
    const cam = new THREE.OrthographicCamera(-spanH / 2, spanH / 2, (spanH * h) / w / 2, -(spanH * h) / w / 2, 0.5, 500);
    cam.position.copy(eye);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    const panel: Panel = { scene, cam, x, y, w, h, spanH, right: new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up: new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1) };
    panels.push(panel);
    return panel;
  };
  const put = (cls: string, left: number, top: number, text: string, tx = 'translate(-50%,0)') => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    d.style.left = `${left}px`;
    d.style.top = `${top}px`;
    d.style.transform = tx;
    sheetBox.append(d);
  };
  /** Metres in the panel's plane → pixels over the canvas, for a DOM label. */
  const project = (p: Panel, w3: THREE.Vector3) => {
    const d = w3.clone().sub(p.cam.position);
    const nx = (d.dot(p.right) - p.cam.left) / (p.cam.right - p.cam.left);
    const ny = (d.dot(p.up) - p.cam.bottom) / (p.cam.top - p.cam.bottom);
    return { left: p.x + nx * p.w, top: canvas.clientHeight - (p.y + ny * p.h) };
  };
  const labelAt = (p: Panel, w3: THREE.Vector3, text: string, cls = 'lbl dim', tx = 'translate(-50%,0)') => { const q = project(p, w3); put(cls, q.left, q.top, text, tx); };
  const dimH = (p: Panel, axis: 'x' | 'z', a1: number, a2: number, y: number, text: string) => {
    const A = (a: number, dy: number) => (axis === 'z' ? new THREE.Vector3(0, y + dy, a) : new THREE.Vector3(a, y + dy, 0));
    p.scene.add(line([A(a1, 0), A(a2, 0)], DIMC));
    for (const a of [a1, a2]) p.scene.add(line([A(a, -0.09), A(a, 0.09)], DIMC));
    labelAt(p, A((a1 + a2) / 2, -0.3), text);
  };
  const dimV = (p: Panel, axis: 'x' | 'z', at: number, y1: number, y2: number, text: string) => {
    const P = (y: number, off: number) => (axis === 'z' ? new THREE.Vector3(0, y, at + off) : new THREE.Vector3(at + off, y, 0));
    p.scene.add(line([P(y1, 0), P(y2, 0)], DIMC));
    for (const y of [y1, y2]) p.scene.add(line([P(y, -0.09), P(y, 0.09)], DIMC));
    if (text) labelAt(p, P((y1 + y2) / 2, 0.16), text, 'lbl dim', 'translate(3px,-50%)');
  };
  const caption = (p: Panel, text: string) => put('lbl big', p.x + 2, canvas.clientHeight - p.y + 4, text, 'none');
  /** Ink line drawing: paper-coloured fill hides the lines behind, then a thin line per hard edge. */
  const inkify = (root: THREE.Object3D) => {
    const fill = new THREE.MeshBasicMaterial({ color: PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    mats.push(fill);
    const edge = mat(INK);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = fill;
      if (!geos.includes(m.geometry)) geos.push(m.geometry);
      const e = new THREE.EdgesGeometry(m.geometry, 22);
      geos.push(e);
      m.add(new THREE.LineSegments(e, edge));
    });
    return root;
  };
  const render = () => {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(PAPER, 1);
    renderer.clear();
    for (const p of panels) {
      renderer.setViewport(p.x, p.y, p.w, p.h);
      renderer.setScissor(p.x, p.y, p.w, p.h);
      renderer.setScissorTest(true);
      renderer.render(p.scene, p.cam);
    }
    renderer.setScissorTest(false);
  };
  const reset = () => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    panels.length = 0; geos.length = 0; mats.length = 0;
    sheetBox.innerHTML = '';
  };
  return { panels, reset, render, makePanel, line, loop, box, labelAt, dimH, dimV, caption, inkify };
}

/* ------------------------------- the labs ------------------------------- */

// render()/onResize are for labs that draw something fixed — a drawing sheet — instead of a model to orbit.
type Lab = { name: string; build: () => void; render?: () => void; onResize?: () => void };

function carFitLab(): Lab {
  let car = CARS[0], profile: CarBodyProfile | null = shippedProfiles.find((p) => p.id === car.id) ?? null, kit = '';
  const rows: { id: string; label: string; block: number; voxel: number }[] = [];
  const kits = items.filter((c) => c.kind === 'body');

  const build = () => {
    clearStage();
    frameCar(car.size);
    const [len, tall, wide] = car.size;
    const design = { body: kit || undefined };
    const rig: CarRig | null = profile ? buildVoxelCar(car, design, driver, find, profile) : buildCar(car, design, driver, find);
    if (rig) stage.add(rig.root);

    guides.add(wireBox(wide, tall, len, '#4a5570', 0, tall / 2, 0)); // the economy sheet's metres
    if (profile) {
      const p = profile;
      const pts = Array.from({ length: 21 }, (_, i) => { const zf = i / 20; return [(zf - 0.5) * len, lineAt(p.panel, zf) * tall] as [number, number]; });
      for (const s of [-1, 1]) guides.add(sideLine(pts, '#57c07a', (s * wide) / 2 + 0.02)); // the panel line, both sides
      const cabLen = (p.cabin.front - p.cabin.back) * len, cabZ = ((p.cabin.front + p.cabin.back) / 2 - 0.5) * len;
      guides.add(wireBox(p.cabin.width * wide, (p.cabin.height - p.cabin.belt) * tall, cabLen, '#8fd0ea', 0, ((p.cabin.height + p.cabin.belt) / 2) * tall, cabZ));
      for (const az of [p.wheels.rear, p.wheels.front]) {
        const c = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return new THREE.Vector3(0, Math.sin(a) * p.wheels.radius, (az - 0.5) * len + Math.cos(a) * p.wheels.radius); })), new THREE.LineBasicMaterial({ color: '#e0913f' }));
        c.position.x = (p.wheels.track * wide) / 2;
        guides.add(c);
      }
    }
    // The block body's own numbers, from carmesh.ts: floor, deck, cabin, and its fixed 0.34 m wheels.
    const floor = 0.32, deck = tall * 0.46;
    guides.add(wireBox(wide, deck, len, '#e4645b', 0, floor + deck / 2, 0));
    const pickup = car.id === 'pickup';
    const cabLen = (pickup ? 0.42 : 0.52) * len, cabZ = (pickup ? 0.1 : -0.04) * len, cabH = tall - floor - deck;
    guides.add(wireBox(wide * 0.86, cabH, cabLen * 0.9, '#e4645b', 0, floor + deck + cabH / 2, cabZ));

    rows.length = 0;
    if (profile) {
      const p = profile;
      const vCabLen = (p.cabin.front - p.cabin.back) * len, vCabZ = ((p.cabin.front + p.cabin.back) / 2 - 0.5) * len;
      const vs = Math.min(tall, wide) / 26, sculpt = carVoxels(p, car.size, '#888888');
      rows.push({ id: 'floor', label: 'floor / sill (m)', block: floor, voxel: p.sill });
      rows.push({ id: 'belt', label: 'dash top / belt line (m)', block: floor + deck, voxel: p.cabin.belt * tall });
      rows.push({ id: 'wheel', label: 'wheel radius (m)', block: 0.34, voxel: p.wheels.radius });
      rows.push({ id: 'axlef', label: 'front axle z (m)', block: len / 3.1, voxel: (p.wheels.front - 0.5) * len });
      rows.push({ id: 'axler', label: 'rear axle z (m)', block: -len / 3.1, voxel: (p.wheels.rear - 0.5) * len });
      rows.push({ id: 'cablen', label: 'cabin length (m)', block: cabLen, voxel: vCabLen });
      rows.push({ id: 'cabz', label: 'cabin centre z (m)', block: cabZ, voxel: vCabZ });
      rows.push({ id: 'roof', label: 'roof vs body height (m)', block: tall, voxel: p.cabin.height * tall });
      const grid = voxelsFor(wide, vs), pieces = voxelPieces(sculpt.body), fitErrors = profileVsCar(p, car.size);
      bench.innerHTML = `
        <h2>Car fit — ${car.name}</h2>
        <p>The green line is the profile's panel line, blue the cabin box, orange the wheels; the red boxes are how carmesh.ts (the block body) lays out the same car; the grey box is the economy sheet's ${fmt(len)}×${fmt(tall)}×${fmt(wide)} m. A voxel is ${(Math.min(tall, wide) / 26).toFixed(3)} m here.</p>
        <label>Car</label><select id="car">${CARS.map((c) => `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        <label>Body kit</label><select id="kit"><option value="">None</option>${kits.map((c) => `<option value="${c.id}" ${c.id === kit ? 'selected' : ''}>${c.name} (${c.style})</option>`).join('')}</select>
        <label>Body profile (edit, then Apply — the validator judges it)</label>
        <textarea id="json" spellcheck="false">${JSON.stringify(profile ?? {}, null, 2)}</textarea>
        <div class="row"><button id="apply" class="on">Apply</button><button id="ship" class="ghost">Revert to shipped</button></div>
        <table><tr><th>piece</th><th class="n">block body</th><th class="n">voxel sculpt</th><th class="n">off</th></tr>
        ${rows.map((r) => { const d = r.voxel - r.block; return `<tr><td>${r.label}</td><td class="n">${fmt(r.block)}</td><td class="n">${fmt(r.voxel)}</td><td class="n ${Math.abs(d) > 0.1 ? 'bad' : 'good'}">${d >= 0 ? '+' : ''}${fmt(d)}</td></tr>`; }).join('')}</table>
        <p>${sculpt.body.count} body voxels on a ${grid}-voxel grid; wheels ${sculpt.wheels.length} × r${fmt(sculpt.wheelRadius)}. Body pieces: <span class="${pieces === 1 ? 'good' : 'bad'}">${pieces === 1 ? '1, all connected' : `${pieces}, something floats`}</span>.</p>
        ${fitErrors.length ? `<ul class="err">${fitErrors.map((e) => `<li>${e}</li>`).join('')}</ul>` : '<p class="good">The profile passes the schema and the fit checks.</p>'}
        <p class="note">Tune here, then copy what passes into src/data/carprofiles.json (or regenerate it with tools/qwen-gen.ts).</p>`;
      bench.querySelector<HTMLSelectElement>('#car')!.onchange = (e) => {
        car = CARS.find((c) => c.id === (e.target as HTMLSelectElement).value)!;
        profile = shippedProfiles.find((p) => p.id === car.id) ?? null;
        build();
      };
      bench.querySelector<HTMLSelectElement>('#kit')!.onchange = (e) => { kit = (e.target as HTMLSelectElement).value; build(); };
      bench.querySelector<HTMLElement>('#apply')!.onclick = () => {
        let parsed: unknown;
        try { parsed = JSON.parse(bench.querySelector<HTMLTextAreaElement>('#json')!.value); } catch (err) { bench.insertAdjacentHTML('beforeend', `<ul class="err"><li>not JSON: ${(err as Error).message}</li></ul>`); return; }
        const errs = carProfileErrors(parsed);
        if (errs.length) { bench.insertAdjacentHTML('beforeend', `<ul class="err">${errs.map((e) => `<li>${e}</li>`).join('')}</ul>`); return; }
        profile = parsed as CarBodyProfile;
        build();
      };
      bench.querySelector<HTMLElement>('#ship')!.onclick = () => { profile = shippedProfiles.find((p) => p.id === car.id) ?? null; build(); };
    } else {
      bench.innerHTML = `<h2>Car fit — ${car.name}</h2><p>No profile for this car (it fails the schema), so the game falls back to the block body. Red boxes are the block layout.</p>
        <label>Car</label><select id="car">${CARS.map((c) => `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>`;
      bench.querySelector<HTMLSelectElement>('#car')!.onchange = () => { car = CARS.find((c) => c.id === (bench.querySelector('#car') as HTMLSelectElement).value)!; profile = null; build(); };
    }
  };
  return { name: 'Car fit', build };
}

function damageLab(): Lab {
  let car = CARS[0], rig: CarRig | null = null, damage: DamageRig | null = null;
  const dents: Record<Side, number> = { front: 0, back: 0, left: 0, right: 0 };
  let speed = 40, angle = 0; // km/h, and the wall's direction in front of the nose (degrees, 90 = struck from the left)

  const crash = () => {
    const h = 0, f = { x: Math.sin(h), z: Math.cos(h) }, r = { x: -f.z, z: f.x };
    const t = (angle * Math.PI) / 180;
    const nx = -(Math.cos(t) * f.x - Math.sin(t) * r.x), nz = -(Math.cos(t) * f.z - Math.sin(t) * r.z); // the wall's normal pointing at the car, the wall t degrees round to the left
    const side = sideOf(nx, nz, h);
    dents[side] = addCrush(dents[side], crushLevel(speed / 3.6, car.tough));
    repaint();
  };
  const repaint = () => {
    damage?.set(dents);
    const total = Math.min(1, SIDES.reduce((n, s) => n + dents[s], 0) / 1.6); // the scalar damage the game carries, roughly: the worst side plus a little of the rest
    for (const s of SIDES) {
      const bar = bench.querySelector(`#bar-${s} i`) as HTMLElement;
      if (bar) { bar.style.width = `${Math.round(dents[s] * 100)}%`; bar.style.background = dents[s] >= 0.35 ? '#e4645b' : '#e0913f'; }
      const pct = bench.querySelector(`#pct-${s}`)!;
      pct.textContent = `${Math.round(dents[s] * 100)}%`;
    }
    const cost = Math.ceil(total * 100 * REPAIR_RATE);
    (bench.querySelector('#total')! as HTMLElement).textContent = `damage ${Math.round(total * 100)}% · repair ${cost} Points · ${total >= 0.55 ? 'smoking' : total >= 0.35 ? 'bits missing' : 'driving'}`;
  };

  const build = () => {
    clearStage();
    frameCar(car.size);
    const useVoxel = !!voxelProfileFor(car);
    rig = useVoxel ? buildVoxelCar(car, {}, driver, find) : buildCar(car, {}, driver, find);
    damage = new DamageRig(rig);
    stage.add(rig.root);
    for (const s of SIDES) dents[s] = 0;
    bench.innerHTML = `
      <h2>Damage — ${car.name} (${useVoxel ? 'voxel' : 'block'})</h2>
      <p>Crash runs the game's own maths: <code>sideOf</code> picks the face, <code>addDent</code> leaves the level, and the real <code>DamageRig</code> folds the voxels in (the block body swells a bruise) and pops bumpers and mirrors at 35%.</p>
      <label>Car</label><select id="car">${CARS.map((c) => `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <label>Impact — <span id="sp">${speed}</span> km/h</label><input type="range" id="spd" min="5" max="110" value="${speed}" />
      <label>Direction — <span id="an">${angle}°</span> (0 = head-on, 90 = struck from the left, 180 = rear-ended)</label><input type="range" id="ang" min="0" max="359" value="${angle}" />
      <div class="row"><button id="crash" class="on">Crash</button><button id="mend">Mend to 0</button></div>
      <div class="row">
        ${SIDES.map((s) => `<button data-side="${s}">dent ${s}</button>`).join('')}
      </div>
      ${SIDES.map((s) => `<div class="kv"><span>${s}</span><small id="pct-${s}"></small></div><div class="bar" id="bar-${s}"><i style="width:0%"></i></div>`).join('')}
      <div class="kv"><span></span><span id="total">damage 0% · repair 0 Points · driving</span></div>
      <p class="note">Presets: full-frontal at 90+ ends a car (28 m/s); a bumper or mirror pops off its side at 35%.</p>`;
    bench.querySelector<HTMLSelectElement>('#car')!.onchange = (e) => { car = CARS.find((c) => c.id === (e.target as HTMLSelectElement).value)!; build(); };
    bench.querySelector<HTMLInputElement>('#spd')!.oninput = (e) => { speed = Number((e.target as HTMLInputElement).value); bench.querySelector('#sp')!.textContent = String(speed); };
    bench.querySelector<HTMLInputElement>('#ang')!.oninput = (e) => { angle = Number((e.target as HTMLInputElement).value); bench.querySelector('#an')!.textContent = `${angle}°`; };
    bench.querySelector<HTMLElement>('#crash')!.onclick = crash;
    bench.querySelector<HTMLElement>('#mend')!.onclick = () => { for (const s of SIDES) dents[s] = 0; repaint(); };
    for (const b of bench.querySelectorAll<HTMLElement>('[data-side]')) b.onclick = () => { const s = b.dataset.side as Side; dents[s] = addCrush(dents[s], crushLevel(speed / 3.6, car.tough)); repaint(); };
    repaint();
  };
  return { name: 'Damage', build };
}

function buildingLab(): Lab {
  const styles = buildingStyles as unknown as BuildingStyle[];
  let style = styles[0]?.id ?? '', speed = 18, lastMs = 0;

  const build = () => {
    clearStage();
    const picked = styles.find((s) => s.id === style);
    const b: Box = { x: 0, z: 0, hx: 12, hz: 10, h: (picked?.storeys[1] ?? 3) * 3.4, hue: 0.3, district: picked?.district, style };
    const town = new TownBuildings([b], styles), top = town.plans[0].top;
    frameCar([b.hz * 2 + 8, top + 3, b.hx * 2]);
    stage.add(town.group);
    const damage = (walls = new WallDamage(stage, town));
    const rig = buildVoxelCar(CARS[0], {}, driver, find);
    rig.root.position.set(4, 0, b.hz + 3.4);
    rig.root.rotation.y = Math.PI;
    stage.add(rig.root);

    bench.innerHTML = `
      <h2>Buildings</h2>
      <p>The real <code>WallDamage</code> on one building. A wall stays a plain quad until it's hit; the tiles round the hit turn into voxels two layers deep, and the crater comes out of those. Click a wall to hit it there, up to 4 m high.</p>
      <label>Style</label><select id="style">${styles.map((s) => `<option value="${s.id}" ${s.id === style ? 'selected' : ''}>${DISTRICTS[s.district].name}: ${s.name}</option>`).join('')}</select>
      <label>Impact — <span id="sp">${Math.round(speed * 3.6)}</span> km/h</label><input type="range" id="spd" min="4" max="28" value="${speed}" />
      <div class="row"><button id="crash" class="on">Crash the car in</button><button id="mend">Mend</button></div>
      <table>
        <tr><td>buildings damaged</td><td class="n" id="s-buildings"></td></tr>
        <tr><td>tiles opened</td><td class="n" id="s-tiles"></td></tr>
        <tr><td>voxels standing</td><td class="n" id="s-voxels"></td></tr>
        <tr><td>pool (never exceeded)</td><td class="n" id="s-pool"></td></tr>
        <tr><td>last hit took</td><td class="n" id="s-ms"></td></tr>
        <tr><td>draw calls, this frame</td><td class="n" id="s-calls"></td></tr>
        <tr><td>triangles, this frame</td><td class="n" id="s-tris"></td></tr>
      </table>
      <p class="note">Repeat a hit to deepen it. When the pool runs out, the building hit longest ago is put right. In the town the same hits land 0.8 m up, at the car's nose.</p>`;
    const report = () => {
      const s = damage.stats;
      for (const [k, v] of Object.entries({ buildings: s.buildings, tiles: s.tiles, voxels: s.voxels, pool: s.pool, ms: `${lastMs.toFixed(1)} ms` })) bench.querySelector(`#s-${k}`)!.textContent = String(v);
      setTimeout(() => {
        if (!bench.querySelector('#s-calls')) return;
        bench.querySelector('#s-calls')!.textContent = String(renderer.info.render.calls);
        bench.querySelector('#s-tris')!.textContent = renderer.info.render.triangles.toLocaleString();
      }, 120);
    };
    const strikeAt = (nx: number, nz: number, x: number, z: number, y?: number) => {
      const from = performance.now();
      damage.hit(b, nx, nz, x, z, speed, y);
      lastMs = performance.now() - from;
      report();
    };
    bench.querySelector<HTMLInputElement>('#spd')!.oninput = (e) => { speed = Number((e.target as HTMLInputElement).value); bench.querySelector('#sp')!.textContent = String(Math.round(speed * 3.6)); };
    bench.querySelector<HTMLSelectElement>('#style')!.onchange = (e) => { style = (e.target as HTMLSelectElement).value; build(); };
    bench.querySelector<HTMLElement>('#crash')!.onclick = () => strikeAt(0, 1, 4, b.z + b.hz);
    bench.querySelector<HTMLElement>('#mend')!.onclick = () => { damage.mendAll(); report(); };
    const ray = new THREE.Raycaster(), solid = new THREE.Box3(new THREE.Vector3(b.x - b.hx, 0, b.z - b.hz), new THREE.Vector3(b.x + b.hx, b.h, b.z + b.hz));
    stageClick = (e) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2), camera);
      const p = ray.ray.intersectBox(solid, new THREE.Vector3());
      if (!p) return;
      const outX = Math.abs(p.x - b.x) / b.hx, outZ = Math.abs(p.z - b.z) / b.hz;
      if (Math.max(outX, outZ) > 0.999) strikeAt(outX > outZ ? Math.sign(p.x) : 0, outX > outZ ? 0 : Math.sign(p.z), p.x, p.z, p.y); // the roof isn't a wall
    };
    report();
  };
  return { name: 'Buildings', build };
}

function townCarLab(): Lab {
  let id = CAR_SHAPES[0]?.id ?? '', hue = 0.6;
  const build = () => {
    clearStage();
    const vehicle = FLEET_SHAPES.find((c) => c.id === id), shape = CAR_SHAPES.find((c) => c.id === id) ?? CAR_SHAPES[0], ends = (vehicle ?? shape).body.map((p) => p[0]), length = Math.max(...ends) - Math.min(...ends);
    const height = vehicle ? Math.max(...vehicle.body.map((p) => p[1])) : shape.cabin.top, half = (vehicle ?? shape).half;
    frameCar([length, height, half * 2]);
    const car = new THREE.InstancedMesh(vehicle ? fleetGeometry(vehicle) : carGeometry(shape), parkedMaterial(), 1);
    car.setMatrixAt(0, new THREE.Matrix4());
    car.setColorAt(0, vehicle ? new THREE.Color('#ffffff') : new THREE.Color().setHSL(hue, 0.45, 0.6));
    car.frustumCulled = false;
    stage.add(car);
    bench.innerHTML = `
      <h2>Town cars</h2>
      <p>The traffic, parked cars, buses and emergency services, one at a time. Each is designed by Qwen and held to real sizes by <code>schemas/towncars.ts</code> and <code>schemas/fleet.ts</code>.</p>
      <label>Car</label><select id="car">${[...CAR_SHAPES, ...FLEET_SHAPES].map((c) => `<option value="${c.id}" ${c.id === id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <label>Paint</label><input type="range" id="hue" min="0" max="100" value="${Math.round(hue * 100)}" />
      <table>
        <tr><td>length</td><td class="n">${fmt(length)} m</td></tr>
        <tr><td>height</td><td class="n">${fmt(height)} m</td></tr>
        <tr><td>width</td><td class="n">${fmt(shape.half * 2)} m</td></tr>
      </table>`;
    bench.querySelector<HTMLSelectElement>('#car')!.onchange = (e) => { id = (e.target as HTMLSelectElement).value; build(); };
    bench.querySelector<HTMLInputElement>('#hue')!.onchange = (e) => { hue = Number((e.target as HTMLInputElement).value) / 100; build(); };
  };
  return { name: 'Town cars', build };
}

// The body as a drafting sheet: elevations with dimensions, iso views in ink, title block.
// Every number is drawn off the profile itself, and the validator's verdict goes in the block,
// so tuning a profile here reads like checking a drawing over at the body shop bench.
function specSheetLab(): Lab {
  const sheet = newSheet();
  const profiled = CARS.filter((c) => shippedProfiles.some((p) => p.id === c.id));
  let car = profiled[0];
  let profile: CarBodyProfile = shippedProfiles.find((p) => p.id === car.id)!;

  const build = () => {
    sheet.reset();
    const [len, tall, wide] = car.size, p = profile;
    const rz = (p.wheels.rear - 0.5) * len, fz = (p.wheels.front - 0.5) * len, wr = p.wheels.radius;
    const belt = p.cabin.belt * tall, roof = p.cabin.height * tall;
    const back = (p.cabin.back - 0.5) * len, frontZ = (p.cabin.front - 0.5) * len;
    const W = canvas.clientWidth, H = canvas.clientHeight, m = 16, gap = 12;
    const topH = Math.max(150, Math.round((H - 3 * m - gap) * 0.56)), botH = H - 3 * m - gap - topH;
    const col1 = Math.round((W - 2 * m - gap) * 0.57), col2 = W - 2 * m - gap - col1;
    const midY = (tall - 0.8) / 2, needH = tall + 1.55; // the dimensions hang 1 m under the ground line
    const side = sheet.makePanel(new THREE.Vector3(-90, midY, 0), new THREE.Vector3(0, midY, 0), len + 2.6, needH, m, m + botH + gap, col1, topH);
    const front = sheet.makePanel(new THREE.Vector3(0, midY, 90), new THREE.Vector3(0, midY, 0), wide + 2.4, needH, m + col1 + gap, m + botH + gap, col2, topH);
    const iso = (sz: number) => sheet.makePanel(new THREE.Vector3(0, tall / 2, 0).addScaledVector(new THREE.Vector3(0.85, 0.5, sz).normalize(), 130), new THREE.Vector3(0, tall / 2, 0), len + wide + 1, tall + len * 0.55 + 0.4, sz > 0 ? m : m + col1 + gap, m, sz > 0 ? col1 : col2, botH);
    const isoA = iso(1), isoB = iso(-1);

    side.scene.add(sheet.line([new THREE.Vector3(0, 0, -len / 2 - 0.9), new THREE.Vector3(0, 0, len / 2 + 0.9)]));
    side.scene.add(sheet.line(Array.from({ length: 61 }, (_, i) => { const zf = i / 60; return new THREE.Vector3(0, lineAt(p.panel, zf) * tall, (zf - 0.5) * len); })));
    side.scene.add(sheet.box(wide, tall, len, FAINT, 0, tall / 2, 0));
    side.scene.add(sheet.line([new THREE.Vector3(0, p.sill, -len / 2), new THREE.Vector3(0, p.sill, len / 2)], DIMC, true));
    side.scene.add(sheet.line([new THREE.Vector3(0, belt, back), new THREE.Vector3(0, belt, frontZ)], DIMC, true));
    side.scene.add(sheet.line([new THREE.Vector3(0, roof, back - 0.05), new THREE.Vector3(0, roof, frontZ + 0.05)], DIMC, true));
    side.scene.add(sheet.line([new THREE.Vector3(0, belt, back), new THREE.Vector3(0, roof, back), new THREE.Vector3(0, roof, frontZ), new THREE.Vector3(0, belt, frontZ)], FAINT));
    for (const cz of [rz, fz]) {
      side.scene.add(sheet.loop(Array.from({ length: 33 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return new THREE.Vector3(0, wr + Math.sin(a) * wr, cz + Math.cos(a) * wr); })));
      side.scene.add(sheet.line([new THREE.Vector3(0, wr, cz - wr * 1.35), new THREE.Vector3(0, wr, cz + wr * 1.35)], DIMC));
      side.scene.add(sheet.line([new THREE.Vector3(0, wr - wr * 1.35, cz), new THREE.Vector3(0, wr + wr * 1.35, cz)], DIMC));
    }
    sheet.dimH(side, 'z', rz, fz, -0.42, `WHEELBASE ${fmt(fz - rz)}`);
    sheet.dimH(side, 'z', -len / 2, len / 2, -1.08, `${fmt(len)} m`);
    sheet.dimV(side, 'z', len / 2 + 0.5, 0, tall, fmt(tall));
    sheet.dimV(side, 'z', -len / 2 - 0.5, 0, p.sill, `SILL ${fmt(p.sill)}`);
    sheet.labelAt(side, new THREE.Vector3(0, roof + 0.12, frontZ), 'ROOF', 'lbl tag', 'none');

    const hw = wide / 2, trk = (p.wheels.track * wide) / 2, ww = p.wheels.width / 2, cw = p.cabin.width * hw;
    front.scene.add(sheet.line([new THREE.Vector3(-hw - 0.9, 0, 0), new THREE.Vector3(hw + 0.9, 0, 0)]));
    front.scene.add(sheet.line([new THREE.Vector3(-hw, p.sill, 0), new THREE.Vector3(-hw, tall, 0), new THREE.Vector3(hw, tall, 0), new THREE.Vector3(hw, p.sill, 0)], FAINT));
    front.scene.add(sheet.line([new THREE.Vector3(-hw, p.sill, 0), new THREE.Vector3(hw, p.sill, 0)], DIMC, true));
    front.scene.add(sheet.line([new THREE.Vector3(-cw, belt, 0), new THREE.Vector3(-cw, roof, 0), new THREE.Vector3(cw, roof, 0), new THREE.Vector3(cw, belt, 0)]));
    for (const cx of [-trk, trk]) {
      front.scene.add(sheet.loop([new THREE.Vector3(cx - ww, 0, 0), new THREE.Vector3(cx + ww, 0, 0), new THREE.Vector3(cx + ww, 2 * wr, 0), new THREE.Vector3(cx - ww, 2 * wr, 0)]));
      front.scene.add(sheet.line([new THREE.Vector3(cx - ww - 0.12, wr, 0), new THREE.Vector3(cx + ww + 0.12, wr, 0)], DIMC));
    }
    sheet.dimH(front, 'x', -trk, trk, -0.42, `TRACK ${fmt(trk * 2)}`);
    sheet.dimH(front, 'x', -hw, hw, -1.08, `${fmt(wide)} m`);
    sheet.dimH(front, 'x', -cw, cw, roof + 0.34, `CABIN ${fmt(cw * 2)}`);
    sheet.dimV(front, 'x', hw + 0.42, 0, tall, '');

    isoA.scene.add(sheet.inkify(buildVoxelCar(car, {}, driver, find, p).root));
    isoB.scene.add(sheet.inkify(buildCar(car, {}, driver, find).root));
    const scale = Math.max(1, Math.round(1 / ((side.w / side.spanH) * 0.0002645))); // paper scale at 96 dpi
    sheet.caption(side, `SIDE ELEVATION · SCALE ≈ 1:${scale}`);
    sheet.caption(front, 'FRONT ELEVATION');
    sheet.caption(isoA, 'ISO — VOXEL SCULPT');
    sheet.caption(isoB, 'ISO — BLOCK BODY');

    const vox = carVoxels(p, car.size, '#888888'), fitErrors = profileVsCar(p, car.size);
    const tb = document.createElement('div');
    tb.className = 'lbl block';
    tb.style.cssText = 'right:14px;bottom:12px;text-align:right';
    tb.innerHTML = `<b>ARA DRIVING · BODY SHEET</b><br>${car.name}<br>${fmt(len)} × ${fmt(wide)} × ${fmt(tall)} m<br>wheelbase ${fmt(fz - rz)} · sill ${fmt(p.sill)} · roof ${fmt(roof)} m<br>${vox.body.count} voxels · ${fitErrors.length ? `${fitErrors.length} FAULT${fitErrors.length > 1 ? 'S' : ''}` : 'VALID'}`;
    sheetBox.append(tb);

    bench.innerHTML = `
      <h2>Spec sheet — ${car.name}</h2>
      <p>The body as a drawing sheet. Every line and number is drawn from the profile itself; edit it and the sheet redraws, faults and all.</p>
      <label>Car</label><select id="car">${profiled.map((c) => `<option value="${c.id}" ${c.id === car.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      <label>Body profile (edit, then Apply — the sheet redraws)</label>
      <textarea id="json" spellcheck="false">${JSON.stringify(p, null, 2)}</textarea>
      <div class="row"><button id="apply" class="on">Apply</button><button id="ship">Revert to shipped</button></div>
      ${fitErrors.length ? `<ul class="err">${fitErrors.map((e) => `<li>${e}</li>`).join('')}</ul>` : '<p class="good">The profile passes the schema and the fit checks.</p>'}`;
    bench.querySelector<HTMLSelectElement>('#car')!.onchange = (e) => { car = CARS.find((c) => c.id === (e.target as HTMLSelectElement).value)!; profile = shippedProfiles.find((pp) => pp.id === car.id)!; build(); };
    bench.querySelector<HTMLElement>('#apply')!.onclick = () => {
      let parsed: unknown;
      try { parsed = JSON.parse(bench.querySelector<HTMLTextAreaElement>('#json')!.value); } catch (err) { bench.insertAdjacentHTML('beforeend', `<ul class="err"><li>not JSON: ${(err as Error).message}</li></ul>`); return; }
      const bad = carProfileErrors(parsed);
      if (bad.length) { bench.insertAdjacentHTML('beforeend', `<ul class="err">${bad.map((e) => `<li>${e}</li>`).join('')}</ul>`); return; }
      profile = parsed as CarBodyProfile;
      build();
    };
    bench.querySelector<HTMLElement>('#ship')!.onclick = () => { profile = shippedProfiles.find((pp) => pp.id === car.id)!; build(); };
  };
  return { name: 'Spec sheet', build, render: sheet.render, onResize: build };
}

// A made-up cottage on the same sheet, to try the drawing kit on a building. The numbers follow
// real small houses (the game's research rule: named values with their source):
//  • storey heights: 2.4 m is the BRE figure for a habitable room (SP25, "The Height of Internal
//    Space", also what Scottish Building Standards permits); with ~0.2 m of floor build-up that
//    gives the typical 2.6 m floor to floor.
//  • roof pitch: old naming called rafter = 3/4 span "Common" pitch ≈ 48° (Wikipedia, Roof pitch);
//    thatch/stone-slate cottages are steep; 45° here, an example.
//  • openings: UK external door leaves run 0.77–0.93 × 2.04 m; 1.2 m windows with ~1.0 m sills are
//    the common cottage proportion (example).
//  • walls: solid sandstone/rubble cottages run 0.45–0.6 m; 0.5 m here.
const COTTAGE = {
  name: 'Thistle Cottage', // made up
  length: 9.0, width: 6.6, wall: 0.5, // a small two-up-two-down plan, 8–10 × 6–7 m
  floor0: 0.3, floor1: 2.9, eaves: 5.3, // floor tops; eaves over a two-storey box
  pitch: 45, overhang: 0.15,
  door: { w: 0.92, h: 2.04, x: 0.9 },
  winG: { w: 1.2, h: 1.2, sill: 1.2, xs: [-2.9, 2.9] }, // parlour and house
  winF: { w: 0.9, h: 1.2, sill: 3.8, xs: [-3.4, -1.1, 1.1, 3.4] },
  winGable: { w: 0.6, h: 0.9, sill: 5.5 },
  chim: { w: 1.1, d: 0.9, x: -3.4, over: 0.9 }, // the stack breaks the ridge by ~0.9 m (example)
};

function cottageSheetLab(): Lab {
  const sheet = newSheet();
  const c = COTTAGE;
  const rise = Math.tan((c.pitch * Math.PI) / 180) * (c.width / 2 + c.overhang);
  const ridge = c.eaves + rise;

  const window_ = (p: Panel, x: number, y: number, w: number, h: number) => {
    p.scene.add(sheet.line([new THREE.Vector3(x - w / 2, y, 0), new THREE.Vector3(x + w / 2, y, 0), new THREE.Vector3(x + w / 2, y + h, 0), new THREE.Vector3(x - w / 2, y + h, 0), new THREE.Vector3(x - w / 2, y, 0)]));
    p.scene.add(sheet.line([new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y + h, 0)], FAINT)); // the opening light
    p.scene.add(sheet.line([new THREE.Vector3(x - w / 2 - 0.08, y, 0), new THREE.Vector3(x + w / 2 + 0.08, y, 0)])); // cill
    p.scene.add(sheet.line([new THREE.Vector3(x - w / 2 - 0.08, y + h + 0.08, 0), new THREE.Vector3(x + w / 2 + 0.08, y + h + 0.08, 0)], FAINT)); // lintel
  };

  const build = () => {
    sheet.reset();
    const W = canvas.clientWidth, H = canvas.clientHeight, m = 16, gap = 12, L = c.length, wd = c.width;
    const topH = Math.max(150, Math.round((H - 3 * m - gap) * 0.56)), botH = H - 3 * m - gap - topH;
    const col1 = Math.round((W - 2 * m - gap) * 0.52), col2 = W - 2 * m - gap - col1;
    const midY = (ridge + 1.6 - 1.3) / 2, needH = ridge + 2.9; // dimensions under the ground, the title block clears the corner
    const elFront = sheet.makePanel(new THREE.Vector3(0, midY, 120), new THREE.Vector3(0, midY, 0), L + 3, needH, m, m + botH + gap, col1, topH);
    const elEnd = sheet.makePanel(new THREE.Vector3(120, midY, 0), new THREE.Vector3(0, midY, 0), wd + 3.8, needH, m + col1 + gap, m + botH + gap, col2, topH);
    const sect = sheet.makePanel(new THREE.Vector3(0, midY, 120), new THREE.Vector3(0, midY, 0), L + 3, needH, m, m, col1, botH);
    const eye = new THREE.Vector3(0, ridge * 0.45, 0).addScaledVector(new THREE.Vector3(0.9, 0.55, 1.05).normalize(), 150);
    const isoP = sheet.makePanel(eye, new THREE.Vector3(0, ridge * 0.45, 0), L + wd + 2, ridge + 3, m + col1 + gap, m, col2, botH);

    // Front elevation: the long face with the door and both floors of lights, the roof band to the ridge, the stack.
    elFront.scene.add(sheet.line([new THREE.Vector3(-L / 2 - 1.2, 0, 0), new THREE.Vector3(L / 2 + 1.2, 0, 0)]));
    elFront.scene.add(sheet.line([new THREE.Vector3(-L / 2, 0, 0), new THREE.Vector3(-L / 2, c.eaves, 0), new THREE.Vector3(L / 2, c.eaves, 0), new THREE.Vector3(L / 2, 0, 0)]));
    for (const y of [c.floor0, c.floor1]) elFront.scene.add(sheet.line([new THREE.Vector3(-L / 2, y, 0), new THREE.Vector3(L / 2, y, 0)], DIMC, true)); // the floor lines, seen through
    elFront.scene.add(sheet.line([new THREE.Vector3(-L / 2 - c.overhang, ridge, 0), new THREE.Vector3(L / 2 + c.overhang, ridge, 0)]));
    for (const x of c.winG.xs) window_(elFront, x, c.winG.sill, c.winG.w, c.winG.h);
    for (const x of c.winF.xs) window_(elFront, x, c.winF.sill, c.winF.w, c.winF.h);
    const d = c.door;
    elFront.scene.add(sheet.line([new THREE.Vector3(d.x - d.w / 2, c.floor0, 0), new THREE.Vector3(d.x - d.w / 2, c.floor0 + d.h, 0), new THREE.Vector3(d.x + d.w / 2, c.floor0 + d.h, 0), new THREE.Vector3(d.x + d.w / 2, c.floor0, 0)]));
    elFront.scene.add(sheet.line([new THREE.Vector3(d.x, c.floor0, 0), new THREE.Vector3(d.x, c.floor0 + d.h, 0)], FAINT));
    elFront.scene.add(sheet.line([new THREE.Vector3(d.x - d.w / 2 - 0.1, 0, 0), new THREE.Vector3(d.x - d.w / 2 - 0.1, c.floor0, 0), new THREE.Vector3(d.x + d.w / 2 + 0.1, c.floor0, 0), new THREE.Vector3(d.x + d.w / 2 + 0.1, 0, 0)])); // the step up
    elFront.scene.add(sheet.box(c.chim.w, ridge + c.chim.over - c.eaves, 0.9, INK, c.chim.x, (c.eaves + ridge + c.chim.over) / 2, 0));
    sheet.dimH(elFront, 'x', -L / 2, L / 2, -1.0, `${fmt(L)} m`);
    sheet.dimV(elFront, 'x', L / 2 + 0.7, 0, c.eaves, `EAVES ${fmt(c.eaves)}`);
    sheet.dimV(elFront, 'x', L / 2 + 1.6, 0, ridge, fmt(ridge));
    sheet.caption(elFront, `FRONT ELEVATION · PITCH ${c.pitch}°`);

    // End (gable) elevation: the wall climbs to the ridge, one light in the gable, the stack at the apex.
    elEnd.scene.add(sheet.line([new THREE.Vector3(0, 0, -wd / 2 - 1.2), new THREE.Vector3(0, 0, wd / 2 + 1.2)]));
    elEnd.scene.add(sheet.line([new THREE.Vector3(0, 0, -wd / 2), new THREE.Vector3(0, c.eaves, -wd / 2), new THREE.Vector3(0, ridge, 0), new THREE.Vector3(0, c.eaves, wd / 2), new THREE.Vector3(0, 0, wd / 2)]));
    elEnd.scene.add(sheet.line([new THREE.Vector3(0, c.eaves, -wd / 2), new THREE.Vector3(0, c.eaves, wd / 2)], DIMC, true)); // eaves line
    const gw = c.winGable;
    elEnd.scene.add(sheet.line([new THREE.Vector3(0, gw.sill, -gw.w / 2), new THREE.Vector3(0, gw.sill, gw.w / 2), new THREE.Vector3(0, gw.sill + gw.h, gw.w / 2), new THREE.Vector3(0, gw.sill + gw.h, -gw.w / 2), new THREE.Vector3(0, gw.sill, -gw.w / 2)]));
    // The stack sits on the ridge, so end-on it shows at the centre — its place along the ridge doesn't project.
    elEnd.scene.add(sheet.box(c.chim.w, ridge + c.chim.over - c.eaves, c.chim.d, INK, 0, (c.eaves + ridge + c.chim.over) / 2, 0));
    sheet.dimH(elEnd, 'z', -wd / 2, wd / 2, -1.0, `${fmt(wd)} m`);
    sheet.dimV(elEnd, 'z', wd / 2 + 0.9, 0, ridge, `RIDGE ${fmt(ridge)}`);
    sheet.labelAt(elEnd, new THREE.Vector3(0, c.eaves + 0.12, wd / 2), `EAVES ${fmt(c.eaves)}`, 'lbl tag', 'none');
    sheet.caption(elEnd, 'END ELEVATION (GABLE)');

    // Section A–A: cut across the house — the 0.5 m wall, the two floor tops, the rafters to the ridge.
    const inn = wd / 2 - c.wall;
    sect.scene.add(sheet.line([new THREE.Vector3(-wd / 2 - 1.2, 0, 0), new THREE.Vector3(wd / 2 + 1.2, 0, 0)]));
    for (const sgn of [-1, 1]) {
      sect.scene.add(sheet.line([new THREE.Vector3(sgn * wd / 2, 0, 0), new THREE.Vector3(sgn * wd / 2, c.eaves, 0)]));
      sect.scene.add(sheet.line([new THREE.Vector3(sgn * inn, 0, 0), new THREE.Vector3(sgn * inn, c.eaves, 0)], FAINT));
      sect.scene.add(sheet.line([new THREE.Vector3(sgn * inn, c.eaves + 0.15, 0), new THREE.Vector3(0.03 * sgn, ridge - 0.12, 0)], FAINT)); // the rafters
    }
    for (const y of [c.floor0, c.floor1]) sect.scene.add(sheet.line([new THREE.Vector3(-wd / 2, y, 0), new THREE.Vector3(wd / 2, y, 0)]));
    sect.scene.add(sheet.line([new THREE.Vector3(-wd / 2, c.eaves, 0), new THREE.Vector3(wd / 2, c.eaves, 0)]));
    sect.scene.add(sheet.line([new THREE.Vector3(-wd / 2 - c.overhang, ridge, 0), new THREE.Vector3(wd / 2 + c.overhang, ridge, 0)]));
    sheet.dimV(sect, 'z', -wd / 2 - 0.7, c.floor0, c.floor1, `${fmt(c.floor1 - c.floor0)} FLOOR TO FLOOR`);
    sheet.dimV(sect, 'z', wd / 2 + 0.7, c.floor1, c.eaves, `${fmt(c.eaves - c.floor1)} UNDER EAVES`);
    sheet.caption(sect, 'SECTION A–A');

    // Iso in ink: the same boxes the town's builder would make.
    const wallG = new THREE.BoxGeometry(L, c.eaves, wd); wallG.translate(0, c.eaves / 2, 0);
    const slopeLen = Math.hypot(wd / 2 + c.overhang, rise), a = (c.pitch * Math.PI) / 180;
    const roofL = new THREE.BoxGeometry(L + 0.2, 0.06, slopeLen); roofL.rotateX(-a); roofL.translate(0, (c.eaves + ridge) / 2, -(wd / 2 + c.overhang) / 2);
    const roofR = new THREE.BoxGeometry(L + 0.2, 0.06, slopeLen); roofR.rotateX(a); roofR.translate(0, (c.eaves + ridge) / 2, (wd / 2 + c.overhang) / 2);
    const chimG = new THREE.BoxGeometry(c.chim.w, ridge + c.chim.over - c.eaves, c.chim.d); chimG.translate(c.chim.x, (c.eaves + ridge + c.chim.over) / 2, 0);
    for (const g of [wallG, roofL, roofR, chimG]) {
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      isoP.scene.add(sheet.inkify(mesh));
    }
    const scale = Math.max(1, Math.round(1 / ((elFront.w / elFront.spanH) * 0.0002645)));
    sheet.caption(isoP, 'ISOMETRIC');
    const tb = document.createElement('div');
    tb.className = 'lbl block';
    tb.style.cssText = 'right:14px;bottom:12px;text-align:right';
    tb.innerHTML = `<b>ARA DRIVING · HOUSE SHEET</b><br>${c.name} — FICTIONAL<br>${fmt(L)} × ${fmt(wd)} m · WALL ${fmt(c.wall)} m<br>EAVES ${fmt(c.eaves)} · RIDGE ${fmt(ridge)} · PITCH ${c.pitch}°<br>FLOOR TO FLOOR ${fmt(c.floor1 - c.floor0)} · SCALE ≈ 1:${scale}`;
    sheetBox.append(tb);

    bench.innerHTML = `
      <h2>Cottage sheet</h2>
      <p>A made-up cottage drawn on the same sheet kit, with the real research in the numbers: BRE's 2.4 m room giving 2.6 m floor to floor, a steep "Common" pitch roof (≈48° historically; 45° here), a 0.5 m solid stone wall, and a door leaf at the UK standard 2.04 m high. It is not in the town yet — this bench is where a house drawing is checked before anything is built.</p>
      <table>
        <tr><td>plan</td><td class="n">${fmt(L)} × ${fmt(wd)} m</td></tr>
        <tr><td>wall (solid stone)</td><td class="n">${fmt(c.wall)} m</td></tr>
        <tr><td>eaves</td><td class="n">${fmt(c.eaves)} m</td></tr>
        <tr><td>ridge</td><td class="n">${fmt(ridge)} m</td></tr>
        <tr><td>roof pitch</td><td class="n">${c.pitch}°</td></tr>
        <tr><td>floor to floor</td><td class="n">${fmt(c.floor1 - c.floor0)} m</td></tr>
        <tr><td>door</td><td class="n">${fmt(c.door.w)} × ${fmt(c.door.h)} m</td></tr>
      </table>
      <p class="note">Sources in the comment above; 45° pitch and the window proportions are examples, not measured from one particular cottage.</p>`;
  };
  return { name: 'Cottage sheet', build, render: sheet.render, onResize: build };
}

/* ------------------------------- the bench ------------------------------- */

const labs: Lab[] = [carFitLab(), damageLab(), buildingLab(), townCarLab(), specSheetLab(), cottageSheetLab()];
const nav = document.getElementById('labs')!;
let current: Lab | null = null;
function show(lab: Lab) {
  current = lab;
  sheetBox.innerHTML = '';
  const plate = !!lab.render; // a sheet is fixed paper: the orbit controls have nothing to do
  const bar = document.getElementById('viewbar')!;
  bar.style.display = plate ? 'none' : ''; // the CSS display on #viewbar beats the hidden attribute
  camBtn.hidden = camHint.hidden = plate;
  camHint.textContent = plate ? 'a drawing sheet: square-on panels, no camera to move' : 'drag to orbit · wheel to zoom · F switches to free look';
  for (const b of nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.lab === lab.name);
  lab.build();
}
for (const lab of labs) {
  const b = document.createElement('button');
  b.textContent = lab.name;
  b.dataset.lab = lab.name;
  b.onclick = () => show(lab);
  nav.append(b);
}

size();
show(labs[0]);
Object.assign(window, { bench: { camera, canvas, scene, renderer, get stage() { return stage; }, get walls() { return walls; }, get orbit() { return { mode, azim, elev, dist, look, settled: Math.abs(wrapAngle(want.azim - azim)) < 0.002 && Math.abs(want.elev - elev) < 0.002 && Math.abs(want.dist - dist) < 0.01 && look.distanceTo(want.look) < 0.005 }; } } }); // for tools/labsim.ts, as window.ara is for smoke.ts
let last = performance.now();
(function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const sheetDraw = (current as Lab | null)?.render;
  if (sheetDraw) sheetDraw(); // a sheet draws its own panels
  else { aimCamera(dt); renderer.render(scene, camera); }
  requestAnimationFrame(frame);
})(last);
