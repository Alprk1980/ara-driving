// The inside of the car that both rig builders share: the driver sat in the body, and the interior only the cockpit
// camera sees. Both work from drivingposition.ts, so the figure and the camera sit in the same place.
import * as THREE from 'three';
import type { CatalogueItem } from '../../schemas/content.ts';
import type { Driver } from '../save.ts';
import { RECLINE, WHEEL_RADIUS, WHEEL_RAKE, type drivingPosition } from './drivingposition.ts';

export type Lookup = (id?: string) => CatalogueItem | undefined;

export const box = (w: number, h: number, l: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
  mesh.position.set(x, y, z);
  return mesh;
};

/** Reverse lamps and four indicator repeaters, on the corners of a car this long and wide at this height. */
export function addLamps(body: THREE.Group, len: number, wide: number, y: number) {
  const reverse = new THREE.MeshBasicMaterial({ color: LAMP_OFF }), blinkLeft = new THREE.MeshBasicMaterial({ color: BLINK_OFF }), blinkRight = new THREE.MeshBasicMaterial({ color: BLINK_OFF });
  for (const s of [-1, 1]) {
    body.add(box(0.16, 0.09, 0.03, reverse, s * wide * 0.17, y, -len / 2 - 0.03));
    for (const e of [-1, 1]) body.add(box(0.13, 0.09, 0.03, s > 0 ? blinkLeft : blinkRight, s * wide * 0.41, y - e * 0.13 + 0.06, e * (len / 2 + 0.03)));
  }
  return { reverse, blinkLeft, blinkRight };
}
export const LAMP_OFF = '#55504a', LAMP_REVERSE = '#fff8e8', BLINK_OFF = '#6b4a1e', BLINK_ON = '#ffa21f';

const INTERIOR = { pad: '#565b67', lower: '#6d727e', frame: '#454a55', lining: '#b9b6ad', seat: '#2b2f39', legs: '#2c3442', glass: '#b9cedd', screen: '#2c5580', rim: '#2a2d34' };
export const STEER_TURN = 1.7; // radians the wheel turns at full lock: well short of the 2-3 real turns, so the hands stay on it

/** A straight limb or strut between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, w: number, m: THREE.Material) {
  const dir = b.clone().sub(a), mesh = new THREE.Mesh(new THREE.BoxGeometry(w, w, dir.length()), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  return mesh;
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

type Pose = ReturnType<typeof drivingPosition>;

/** The driver in their seat, hips at the origin: leaning back, knees up, hands at 9 and 3 on a wheel at `pose`. */
export function buildDriver(driver: Driver, find: Lookup, pose: Pose): THREE.Group {
  const g = new THREE.Group(), upper = new THREE.Group();
  upper.rotation.x = -RECLINE;
  g.add(upper);
  const outfit = find(driver.outfit), cap = find(driver.cap), glasses = find(driver.sunglasses), gloves = find(driver.gloves);
  const skin = new THREE.MeshLambertMaterial({ color: '#e9b48c' });
  const top = new THREE.MeshLambertMaterial({ color: outfit?.colors[0] ?? '#3d6fd1' });
  const seat = new THREE.MeshLambertMaterial({ color: INTERIOR.seat }), legs = new THREE.MeshLambertMaterial({ color: INTERIOR.legs });
  g.add(box(0.5, 0.12, 0.52, seat, 0, -0.08, 0.08));
  upper.add(box(0.5, 0.78, 0.1, seat, 0, 0.36, -0.2));
  upper.add(box(0.44, 0.5, 0.26, top, 0, 0.27, 0));
  if (outfit) upper.add(box(0.46, 0.14, 0.28, new THREE.MeshLambertMaterial({ color: outfit.colors[1] }), 0, 0.32, 0));
  if (outfit?.style === 'costume') upper.add(box(0.7, 0.42, 0.06, new THREE.MeshLambertMaterial({ color: outfit.colors[1] }), 0, 0.3, -0.26));
  // The town's figures' box head, eyes and short hair, at the same size (src/view/people.ts); a cap takes the place of the crown.
  const hair = new THREE.MeshLambertMaterial({ color: '#4a3222' }), eye = new THREE.MeshLambertMaterial({ color: '#241a14' });
  upper.add(box(0.31, 0.31, 0.3, skin, 0, 0.68, 0), box(0.33, 0.17, 0.06, hair, 0, 0.74, -0.15));
  if (!cap) upper.add(box(0.33, 0.08, 0.32, hair, 0, 0.86, 0));
  for (const s of [-1, 1]) upper.add(box(0.045, 0.045, 0.015, eye, s * 0.068, 0.7, 0.155));
  if (cap) { upper.add(box(0.34, 0.09, 0.34, new THREE.MeshLambertMaterial({ color: cap.colors[0] }), 0, 0.8, 0)); upper.add(box(0.28, 0.04, 0.15, new THREE.MeshLambertMaterial({ color: cap.colors[0] }), 0, 0.76, 0.2)); }
  if (glasses) upper.add(box(0.27, 0.06, 0.04, new THREE.MeshLambertMaterial({ color: glasses.colors[0] }), 0, 0.7, 0.14));
  // Arms from the leaning shoulders to the rim, legs out to the pedals; the wheel is measured from the seat, before the figure's scale.
  const k = 1 / pose.seat.scale, shoulder = 0.46, sy = Math.cos(RECLINE) * shoulder, sz = -Math.sin(RECLINE) * shoulder;
  const handY = (pose.wheel.y - pose.seat.y) * k, handZ = (pose.wheel.z - pose.seat.z) * k - 0.02;
  const hand = new THREE.MeshLambertMaterial({ color: gloves?.colors[0] ?? '#e9b48c' });
  for (const s of [-1, 1]) {
    const from = v(s * 0.24, sy, sz), to = v(s * WHEEL_RADIUS * k, handY, handZ);
    g.add(limb(from, to, 0.09, top));
    const fist = box(0.08, 0.08, 0.08, hand);
    fist.position.copy(to);
    g.add(fist);
    const hip = v(s * 0.1, 0.02, 0.1), knee = v(s * 0.13, 0.16, 0.52), ankle = v(s * 0.11, -0.22, 0.8);
    g.add(limb(hip, knee, 0.14, legs), limb(knee, ankle, 0.11, legs));
  }
  return g;
}

/** Where the cabin sits, in metres: floor height, panel-deck height, roof height, cabin centre along z, cabin length, and where the driver sits in it. */
export type Cabin = { floor: number; deck: number; roof: number; cabZ: number; cabLen: number; pose: Pose };

/** The cockpit view: the inside of the car around the driver's eye, seen only from the cockpit camera (the body hides itself there). */
export function buildCockpit(size: readonly [number, number, number], cab: Cabin, skin: THREE.Material, dark: THREE.Material, driver: Driver, find: Lookup): { dash: THREE.Group; dashCanvas: HTMLCanvasElement; dashTex: THREE.CanvasTexture; hands: THREE.Group; eye: { x: number; y: number; z: number } } {
  const [len, , wide] = size, { eye, wheel } = cab.pose;
  const dash = new THREE.Group(), mat = (color: string) => new THREE.MeshLambertMaterial({ color });
  const pad = mat(INTERIOR.pad), lower = mat(INTERIOR.lower), frame = mat(INTERIOR.frame), lining = new THREE.MeshBasicMaterial({ color: INTERIOR.lining }), rim = mat(INTERIOR.rim);
  const shield = cab.cabZ + cab.cabLen / 2, inner = wide * 0.44, cowl = eye.y - 0.24, screenTop = shield - 0.5;

  // The bonnet ahead, then the dash: a soft top pad, a lower fascia, and a hood over the gauges in front of the driver.
  dash.add(box(wide * 0.84, 0.05, Math.max(0.3, len / 2 - shield - 0.1), skin, 0, cowl - 0.1, (shield + len / 2) / 2 + 0.05));
  // The fascia stands 0.3 m ahead of the wheel's plane at most, so the wheel sits clear in front of it.
  dash.add(box(inner * 2, 0.12, 0.5, pad, 0, cowl - 0.06, shield - 0.1));
  dash.add(box(inner * 2, 0.34, 0.36, lower, 0, cowl - 0.29, shield - 0.12));
  dash.add(box(0.54, 0.07, 0.2, pad, eye.x, cowl + 0.065, shield - 0.26)); // the hood shading the gauges

  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 256;
  dashCanvas.height = 96;
  const dashTex = new THREE.CanvasTexture(dashCanvas);
  dashTex.colorSpace = THREE.SRGBColorSpace;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.17), new THREE.MeshBasicMaterial({ map: dashTex }));
  gauges.rotation.y = Math.PI;
  gauges.position.set(eye.x, cowl - 0.05, shield - 0.356);
  dash.add(gauges);

  // The centre stack: a screen and two vents, toward the middle of the car from the driver.
  const stack = eye.x < 0 ? 0.02 : -0.02;
  dash.add(box(0.34, 0.32, 0.05, frame, stack, cowl - 0.19, shield - 0.32));
  dash.add(box(0.26, 0.15, 0.01, new THREE.MeshBasicMaterial({ color: INTERIOR.screen }), stack, cowl - 0.15, shield - 0.35));
  for (const s of [-1, 1]) dash.add(box(0.11, 0.04, 0.01, rim, stack + s * 0.07, cowl - 0.28, shield - 0.35));

  // The car around you: pillars raked back from the scuttle, the header, roof lining, door tops and the mirrors.
  for (const s of [-1, 1]) {
    dash.add(limb(v(s * inner, cowl - 0.04, shield), v(s * (inner - 0.13), cab.roof - 0.02, screenTop), 0.07, frame));
    dash.add(box(0.08, 0.1, 1.5, pad, s * inner, cowl - 0.05, eye.z + 0.25));
    dash.add(box(0.05, 0.1, 0.16, frame, s * (inner + 0.2), cowl + 0.02, shield - 0.42));
    dash.add(box(0.22, 0.03, 0.3, lining, s * 0.42, cab.roof - 0.08, screenTop - 0.16));
  }
  dash.add(box(inner * 2 - 0.2, 0.07, 0.12, frame, 0, cab.roof - 0.02, screenTop));
  dash.add(box(inner * 2, 0.02, 1.4, lining, 0, cab.roof + 0.02, screenTop - 0.7));
  dash.add(box(0.21, 0.06, 0.02, frame, 0, cab.roof - 0.11, screenTop - 0.06));
  dash.add(box(0.19, 0.045, 0.01, new THREE.MeshBasicMaterial({ color: INTERIOR.glass }), 0, cab.roof - 0.11, screenTop - 0.075));

  // The wheel, raked toward the dash: a rim, three spokes, a boss, and hands at 9 and 3, all turning together.
  const column = new THREE.Group(), hands = new THREE.Group();
  column.position.set(wheel.x, wheel.y, wheel.z);
  column.rotation.x = WHEEL_RAKE;
  column.add(box(0.07, 0.07, 0.42, frame, 0, 0, 0.22), hands);
  hands.add(new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS, 0.018, 10, 32), rim));
  hands.add(box(0.13, 0.1, 0.05, frame), box(WHEEL_RADIUS * 2 - 0.02, 0.035, 0.02, rim), box(0.04, WHEEL_RADIUS, 0.02, rim, 0, -WHEEL_RADIUS / 2, 0));
  const gloves = find(driver.gloves), glove = mat(gloves?.colors[0] ?? '#e9b48c'), sleeve = mat(find(driver.outfit)?.colors[0] ?? '#3d6fd1');
  for (const s of [-1, 1]) {
    hands.add(box(0.06, 0.09, 0.07, glove, s * WHEEL_RADIUS, 0, 0));
    hands.add(limb(v(s * WHEEL_RADIUS, -0.03, -0.03), v(s * (WHEEL_RADIUS + 0.07), -0.22, -0.3), 0.06, sleeve));
  }
  dash.add(column);
  dash.visible = false;
  return { dash, dashCanvas, dashTex, hands, eye };
}
