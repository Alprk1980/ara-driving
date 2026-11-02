// The gallery: every 3D model in the game, one at a time, to spin round and measure.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ITEMS, type Item } from './items.ts';
import { paintedMaterial } from '../view/parts.ts';
import { figureGeometry, LOOKS } from '../view/people.ts';

const BG = { dark: '#141821', light: '#dfe6ee' };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG.dark);
scene.add(new THREE.HemisphereLight('#ffffff', '#59606e', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.4);
sun.position.set(30, 60, 40);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 2000), orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.autoRotateSpeed = 1.4;
const stand = new THREE.Group(), person = new THREE.Group();
scene.add(stand, person);
person.add(new THREE.Mesh(figureGeometry(LOOKS[0]), paintedMaterial()));
let grid = new THREE.GridHelper(20, 20, '#39424f', '#262c36');
scene.add(grid);

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

function counts(o: THREE.Object3D) {
  let tris = 0, calls = 0;
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry, n = (g.index ? g.index.count : g.getAttribute('position').count) / 3, copies = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    tris += n * copies;
    calls += Array.isArray(mesh.material) ? mesh.material.length : 1;
  });
  return { tris: Math.round(tris), calls };
}

function clear() {
  stand.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
  stand.clear();
}

let current: Item = ITEMS[0], paint = '#3d6fa8';

async function show(item: Item, keepView = false) {
  current = item;
  clear();
  const made = await item.make(paint);
  stand.add(made);
  stand.position.set(0, 0, 0);
  stand.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(stand), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  stand.position.set(-mid.x, -box.min.y, -mid.z); // centred, and standing on the ground
  const span = Math.max(size.x, size.y, size.z, 1), reach = span * 2.5;
  person.position.set(size.x / 2 + 0.7, 0, 0);
  scene.remove(grid);
  grid.geometry.dispose();
  const cells = Math.max(10, Math.ceil(span * 1.6));
  grid = new THREE.GridHelper(cells, cells, '#39424f', '#262c36'); // each square is a metre
  scene.add(grid);
  orbit.target.set(0, size.y / 2, 0);
  if (!keepView) camera.position.set(reach * 0.62, size.y / 2 + reach * 0.42, reach * 0.66);
  orbit.update();
  const c = counts(stand);
  $('name').textContent = item.name;
  $('kind').textContent = item.group;
  $('facts').textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m · ${c.tris.toLocaleString('en-GB')} triangles · ${c.calls} draw call${c.calls === 1 ? '' : 's'}`;
  $('paintrow').hidden = !item.paint;
  document.querySelectorAll('#list button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.id === item.id));
  document.querySelector('#list button.on')?.scrollIntoView({ block: 'nearest' });
  history.replaceState(null, '', `#${item.id}`);
  return { size: [size.x, size.y, size.z], ...c };
}

function list(filter = '') {
  const q = filter.trim().toLowerCase(), shown = ITEMS.filter((i) => `${i.name} ${i.group}`.toLowerCase().includes(q)), groups = [...new Set(shown.map((i) => i.group))], box = $('list');
  box.innerHTML = '';
  for (const g of groups) {
    const head = document.createElement('h2'), of = shown.filter((i) => i.group === g);
    head.textContent = `${g} (${of.length})`;
    box.append(head);
    for (const item of of) {
      const b = document.createElement('button');
      b.textContent = item.name;
      b.dataset.id = item.id;
      b.classList.toggle('on', item === current);
      b.onclick = () => show(item);
      box.append(b);
    }
  }
  if (!shown.length) box.textContent = 'Nothing matches.';
  $('total').textContent = `${shown.length} of ${ITEMS.length} models`;
}

const step = (by: number) => {
  const visible = [...document.querySelectorAll<HTMLElement>('#list button')].map((b) => b.dataset.id), at = visible.indexOf(current.id), next = ITEMS.find((i) => i.id === visible[(at + by + visible.length) % visible.length]);
  if (next) show(next);
};
$<HTMLInputElement>('search').oninput = (e) => list((e.target as HTMLInputElement).value);
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$<HTMLInputElement>('spin').onchange = (e) => { orbit.autoRotate = (e.target as HTMLInputElement).checked; };
$<HTMLInputElement>('scale').onchange = (e) => { person.visible = (e.target as HTMLInputElement).checked; };
$<HTMLInputElement>('light').onchange = (e) => { (scene.background as THREE.Color).set((e.target as HTMLInputElement).checked ? BG.light : BG.dark); };
$<HTMLInputElement>('paint').oninput = (e) => { paint = (e.target as HTMLInputElement).value; show(current, true); };
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
});

list();
show(ITEMS.find((i) => i.id === location.hash.slice(1)) ?? ITEMS[0]);
(window as unknown as { gallery: unknown }).gallery = {
  ids: ITEMS.map((i) => i.id),
  open: async (id: string) => {
    const item = ITEMS.find((i) => i.id === id);
    if (!item) return { error: `no model ${id}` };
    try { return await show(item); } catch (e) { return { error: (e as Error).message }; }
  },
};
