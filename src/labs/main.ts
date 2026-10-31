// The lab bench: one part of the game at a time, on a real rig with the real code paths.
// Car fit — the voxel sculpt, the block rig it must match, and the profile lines both come from.
// Damage — the sim's own crash maths (sideOf, addDent) against the rig's own DamageRig.
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
}

// Each lab draws into its own group and reports into the bench column; switching disposes the old one.
const bench = document.getElementById('bench')!;
let stage = new THREE.Group(), guides = new THREE.Group(), walls: WallDamage | null = null;
scene.add(stage);
function clearStage() {
  stage.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
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

/* ------------------------------- the labs ------------------------------- */

type Lab = { name: string; build: () => void };

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

/* ------------------------------- the bench ------------------------------- */

const labs: Lab[] = [carFitLab(), damageLab(), buildingLab(), townCarLab()];
const nav = document.getElementById('labs')!;
function show(lab: Lab) {
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
  aimCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
})(last);
