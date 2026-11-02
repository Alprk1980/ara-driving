// The player's car and driver, drawn from a design. The paint job is one canvas texture, so a saved design
// looks the same in the garage and on the road. The block body; src/view/voxelcar.ts sculpts the same rig in voxels.
import * as THREE from 'three';
import type { Design, Driver } from '../save.ts';
import type { Car } from '../sim/economy.ts';
import { addLamps, box, buildCockpit, buildDriver, type Lookup, type Mirror } from './cockpit.ts';
import { drivingPosition } from './drivingposition.ts';

export const DEFAULT_PAINT = '#e8483f';
export const TAIL_DIM = '#8f1b1b', TAIL_BRAKE = '#ff3b30';
export type { Lookup };

function decalPath(g: CanvasRenderingContext2D, shape: string, cx: number, cy: number, r: number) {
  g.beginPath();
  if (shape === 'heart') {
    g.moveTo(cx, cy + r * 0.8);
    g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.6, cy - r, cx, cy - r * 0.35);
    g.bezierCurveTo(cx + r * 0.6, cy - r, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.8);
  } else if (shape === 'bolt') {
    for (const [i, [x, y]] of ([[0.2, -1], [-0.5, 0.15], [0, 0.15], [-0.25, 1], [0.55, -0.2], [0.05, -0.2]] as const).entries()) g[i ? 'lineTo' : 'moveTo'](cx + x * r, cy + y * r);
  } else if (shape === 'crown') {
    for (const [i, [x, y]] of ([[-1, 0.7], [-1, -0.5], [-0.5, 0], [0, -0.8], [0.5, 0], [1, -0.5], [1, 0.7]] as const).entries()) g[i ? 'lineTo' : 'moveTo'](cx + x * r, cy + y * r);
  } else if (shape === 'paw') {
    g.ellipse(cx, cy + r * 0.3, r * 0.55, r * 0.45, 0, 0, 7);
    for (const [x, y] of [[-0.7, -0.15], [-0.25, -0.65], [0.25, -0.65], [0.7, -0.15]]) { g.moveTo(cx + x * r + r * 0.2, cy + y * r); g.arc(cx + x * r, cy + y * r, r * 0.2, 0, 7); }
  } else if (shape === 'number') {
    g.font = `900 ${r * 2}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('8', cx, cy);
    return;
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.45 : r;
      g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    }
  }
  g.closePath();
  g.fill();
}

export function paintTexture(design: Design, find: Lookup): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const paint = find(design.paint), pat = find(design.pattern), decal = find(design.decal);
  g.fillStyle = paint?.colors[0] ?? DEFAULT_PAINT;
  g.fillRect(0, 0, 512, 256);
  if (pat) {
    const [a, b] = pat.colors;
    if (pat.style === 'two_tone') { g.fillStyle = a; g.fillRect(0, 0, 512, 128); g.fillStyle = b; g.fillRect(0, 128, 512, 128); }
    else if (pat.style === 'stripes') { g.fillStyle = a; g.fillRect(0, 0, 512, 256); g.fillStyle = b; g.fillRect(0, 96, 512, 26); g.fillRect(0, 134, 512, 26); }
    else if (pat.style === 'checker') { for (let x = 0; x < 16; x++) for (let y = 0; y < 8; y++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 32, y * 32, 32, 32); } }
    else if (pat.style === 'waves') {
      g.fillStyle = a; g.fillRect(0, 0, 512, 256); g.fillStyle = b;
      for (let row = 0; row < 3; row++) { g.beginPath(); g.moveTo(0, 256); for (let x = 0; x <= 512; x += 8) g.lineTo(x, 70 + row * 70 + Math.sin(x / 40 + row) * 20); g.lineTo(512, 256); g.fill(); g.globalAlpha = 0.6; }
      g.globalAlpha = 1;
    } else if (pat.style === 'flames') {
      g.fillStyle = a; g.fillRect(0, 0, 512, 256); g.fillStyle = b;
      g.beginPath(); g.moveTo(0, 256);
      for (let x = 0; x <= 512; x += 48) { g.quadraticCurveTo(x + 10, 60, x + 24, 150); g.quadraticCurveTo(x + 34, 90, x + 48, 180); }
      g.lineTo(512, 256); g.fill();
    }
  }
  if (decal) {
    g.fillStyle = decal.colors[0];
    decalPath(g, decal.shape ?? 'star', 256, 120, decal.style === 'large' ? 86 : 44);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

import type { Mark, Side } from '../sim/car.ts';

export type CarRig = { root: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[]; front: THREE.Object3D[]; dash: THREE.Group; dashCanvas: HTMLCanvasElement; dashTex: THREE.CanvasTexture; hands: THREE.Group; eye: { x: number; y: number; z: number }; mirror: Mirror; tails: THREE.MeshBasicMaterial; heads: THREE.MeshBasicMaterial; crush: Record<Side, THREE.Mesh> | null; reverse: THREE.MeshBasicMaterial; blinkLeft: THREE.MeshBasicMaterial; blinkRight: THREE.MeshBasicMaterial; fragile: { mesh: THREE.Object3D; side: Side }[]; crumple?: (levels: Record<Side, number>, marks: readonly Mark[]) => void };

/** Forward is +z. Proportions come from the car's size, with a few parts per model. */
export function buildCar(car: Car, design: Design, driver: Driver, find: Lookup): CarRig {
  const [len, tall, wide] = car.size;
  const root = new THREE.Group(), body = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ map: paintTexture(design, find) });
  const dark = new THREE.MeshLambertMaterial({ color: '#23262e' });
  const glass = new THREE.MeshLambertMaterial({ color: '#8fd0ea', transparent: true, opacity: 0.32 });
  const kit = find(design.body);
  const trim = kit ? new THREE.MeshLambertMaterial({ color: kit.colors[0] }) : dark;
  const metal = find(design.paint)?.style === 'metallic';
  if (metal) { skin.emissive = new THREE.Color(find(design.paint)!.colors[0]); skin.emissiveIntensity = 0.28; }

  const floor = 0.32, deck = tall * 0.46;
  body.add(box(wide, deck, len, skin, 0, floor + deck / 2, 0));
  const pickup = car.id === 'pickup';
  const cabLen = pickup ? len * 0.42 : car.id === 'supercar' ? len * 0.42 : len * 0.52;
  const cabZ = pickup ? len * 0.1 : -len * 0.04;
  const cabH = tall - floor - deck;
  body.add(box(wide * 0.86, 0.1, cabLen * 0.9, skin, 0, floor + deck + cabH, cabZ));
  for (const s of [-1, 1]) {
    body.add(box(0.05, cabH, cabLen * 0.9, glass, (s * wide * 0.86) / 2, floor + deck + cabH / 2, cabZ));
    for (const e of [-1, 1]) body.add(box(0.08, cabH, 0.08, skin, (s * wide * 0.86) / 2, floor + deck + cabH / 2, cabZ + (e * cabLen * 0.9) / 2));
  }
  body.add(box(wide * 0.84, cabH, 0.05, glass, 0, floor + deck + cabH / 2, cabZ + cabLen * 0.45));
  body.add(box(wide * 0.84, cabH, 0.05, glass, 0, floor + deck + cabH / 2, cabZ - cabLen * 0.45));
  if (pickup) { body.add(box(wide * 0.9, 0.04, len * 0.36, dark, 0, floor + deck + 0.01, -len * 0.3)); for (const s of [-1, 1]) body.add(box(0.1, 0.28, len * 0.38, skin, (s * wide) / 2.2, floor + deck + 0.12, -len * 0.3)); }
  if (car.id === 'taxi') body.add(box(0.7, 0.2, 0.26, new THREE.MeshLambertMaterial({ color: '#ffd23e', emissive: '#a07a00' }), 0, tall + 0.14, cabZ));
  const heads = new THREE.MeshBasicMaterial({ color: '#fff3c0' }), tails = new THREE.MeshBasicMaterial({ color: TAIL_DIM });
  for (const s of [-1, 1]) {
    body.add(box(0.3, 0.14, 0.04, heads, (s * wide) / 3, floor + deck * 0.65, len / 2 + 0.01));
    body.add(box(0.34, 0.12, 0.04, tails, (s * wide) / 3, floor + deck * 0.65, -len / 2 - 0.01));
  }
  if (kit?.style === 'spoiler' || kit?.style === 'signature') {
    body.add(box(wide * 0.92, 0.07, 0.34, trim, 0, floor + deck + 0.34, -len * 0.45));
    for (const s of [-1, 1]) body.add(box(0.07, 0.34, 0.2, trim, (s * wide) / 3, floor + deck + 0.16, -len * 0.45));
  }
  if (kit?.style === 'sport_kit' || kit?.style === 'signature') {
    body.add(box(wide * 1.02, 0.12, len * 1.02, trim, 0, floor - 0.02, 0));
    body.add(box(wide * 0.9, 0.08, 0.2, trim, 0, floor + 0.02, len / 2 + 0.08));
  }
  if (kit?.style === 'signature') for (const s of [-1, 1]) body.add(box(0.05, 0.1, len * 0.86, new THREE.MeshBasicMaterial({ color: kit.colors[1] }), (s * wide) / 2 + s * 0.03, floor + deck * 0.5, 0));

  // Damage sits under the paint: a dark bruise on each face, and bumpers and mirrors the DamageRig can pop off.
  const bruise = new THREE.MeshLambertMaterial({ color: '#3a2e2b' });
  const crush = {
    front: box(wide * 0.78, deck * 0.55, 0.1, bruise, 0, floor + deck * 0.5, len / 2 + 0.02),
    back: box(wide * 0.78, deck * 0.55, 0.1, bruise, 0, floor + deck * 0.5, -len / 2 - 0.02),
    left: box(0.1, deck * 0.55, len * 0.64, bruise, wide / 2 + 0.02, floor + deck * 0.5, 0), // forward is +z, so the driver's left is +x
    right: box(0.1, deck * 0.55, len * 0.64, bruise, -wide / 2 - 0.02, floor + deck * 0.5, 0),
  };
  for (const p of Object.values(crush)) { p.visible = false; body.add(p); }
  const fragile: { mesh: THREE.Object3D; side: Side }[] = [];
  for (const s of [-1, 1]) {
    const b = box(wide * 0.94, deck * 0.32, 0.16, trim, 0, floor + deck * 0.3, s * (len / 2 + 0.05));
    body.add(b);
    fragile.push({ mesh: b, side: s > 0 ? 'front' : 'back' });
  }
  for (const s of [-1, 1]) {
    const mirror = new THREE.Group();
    mirror.add(box(0.12, 0.05, 0.05, dark, s * 0.06, 0, 0));
    mirror.add(box(0.05, 0.15, 0.13, trim, s * 0.16, 0.03, 0));
    mirror.position.set(s * wide / 2, floor + deck + cabH * 0.5, cabZ + cabLen * 0.42);
    body.add(mirror);
    fragile.push({ mesh: mirror, side: s > 0 ? 'left' : 'right' });
  }
  root.add(body);
  const lamps = addLamps(body, len, wide, floor + deck * 0.65);

  const pose = drivingPosition({ floor, belt: floor + deck, roof: tall, front: cabZ + cabLen / 2, back: cabZ - cabLen / 2, wide });
  const seat = buildDriver(driver, find, pose);
  seat.position.set(pose.seat.x, pose.seat.y, pose.seat.z);
  seat.scale.setScalar(pose.seat.scale);
  body.add(seat);

  const wheels: THREE.Object3D[] = [], front: THREE.Object3D[] = [];
  const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
  geo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const hub = new THREE.Group(), w = new THREE.Mesh(geo, dark);
    w.add(box(0.28, 0.14, 0.14, new THREE.MeshLambertMaterial({ color: '#c9ced8' })));
    hub.add(w);
    hub.position.set((sx * wide) / 2, 0.34, (sz * len) / 3.1);
    root.add(hub);
    wheels.push(w);
    if (sz > 0) front.push(hub);
  }

  // Seen only from the cockpit camera, which hides the body. Everything sits below the sightline.
  const { dash, dashCanvas, dashTex, hands, eye, mirror } = buildCockpit(car.size, { floor, deck, roof: tall, cabZ, cabLen, pose }, skin, dark, driver, find);
  root.add(dash);
  return { root, body, wheels, front, dash, dashCanvas, dashTex, hands, eye, mirror, tails, heads, crush, ...lamps, fragile };
}

export function disposeCar(rig: CarRig) {
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of [m.material].flat() as THREE.MeshLambertMaterial[]) { mat.map?.dispose(); mat.dispose(); }
  });
  rig.mirror.target.dispose();
}
