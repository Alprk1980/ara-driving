// Buses and emergency vehicles, built from the side elevations Qwen draws: the outline extruded across the width, glass
// set on it, and the livery the rules fix. Battenburg blocks come in two rows along the flank, under the windows; the
// back carries the red and yellow chevrons the services use.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLEET_RULES, LIVERY, type FleetVehicle } from '../../schemas/fleet.ts';
import fleet from '../data/fleet.json';

export const FLEET_SHAPES = fleet as unknown as FleetVehicle[];
type P = [number, number, number];

const GLASS = new THREE.Color('#2b3b4a'), RUBBER = new THREE.Color('#1f2228'), SILVER = new THREE.Color('#c4c7cd'), BAR = new THREE.Color('#2a2d33');
const BLOCK_M = 0.46;
const CHEVRON_RED = new THREE.Color('#d8241e'), CHEVRON_YELLOW = new THREE.Color('#e6e021');

/** Where a vehicle's blue light bar sits: at the front of its roof. */
export function beaconAt(v: FleetVehicle) {
  const top = Math.max(...v.body.map((p) => p[1])), roof = v.body.filter((p) => p[1] > top - 0.02), z = Math.max(...roof.map((p) => p[0]));
  return { z: z - 0.25, y: top + 0.06, wide: v.half * 0.8 };
}

export function fleetGeometry(v: FleetVehicle): THREE.BufferGeometry {
  const rules = FLEET_RULES[v.id], crew = rules.role === 'bus' ? null : LIVERY[rules.role];
  const paint = new THREE.Color(crew?.paint ?? v.paint ?? '#ffffff'), skirt = new THREE.Color(v.skirt ?? crew?.paint ?? '#ffffff');
  const pos: number[] = [], col: number[] = [], { body, half } = v;
  const tri = (a: P, b: P, c: P, colour: THREE.Color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(colour.r, colour.g, colour.b); };
  const face = (a: P, b: P, c: P, d: P, colour: THREE.Color) => { tri(a, b, c, colour); tri(a, c, d, colour); };
  const tail = body[0][0], nose = body[body.length - 1][0], floor = Math.min(body[0][1], body[body.length - 1][1]), top = Math.max(...body.map((p) => p[1]));
  /** The outline's height at a point along the vehicle. */
  const heightAt = (z: number) => {
    for (let i = 1; i < body.length; i++) if (z <= body[i][0] && body[i][0] > body[i - 1][0]) return body[i - 1][1] + ((z - body[i - 1][0]) / (body[i][0] - body[i - 1][0])) * (body[i][1] - body[i - 1][1]);
    return body[body.length - 1][1];
  };
  /** How far forward the nose reaches at this height. */
  const noseAt = (y: number) => {
    for (let i = body.length - 1; i > 0; i--) {
      const [z0, y0] = body[i - 1], [z1, y1] = body[i];
      if ((y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) && y0 !== y1) return z0 + ((y - y0) / (y1 - y0)) * (z1 - z0);
    }
    return nose;
  };
  const band = (y0: number, y1: number, colour: THREE.Color) => { // one colour round the flanks between two heights, wherever the body is that tall
    for (const s of [1, -1]) for (let z = tail; z < nose - 0.05; z += 0.3) {
      const z1 = Math.min(z + 0.3, nose);
      if (heightAt(z) >= y1 && heightAt(z1) >= y1) face([s * (half + 0.006), y0, z], [s * (half + 0.006), y0, z1], [s * (half + 0.006), y1, z1], [s * (half + 0.006), y1, z], colour);
    }
  };

  for (let i = 0; i < body.length - 1; i++) {
    const [z0, y0] = body[i], [z1, y1] = body[i + 1];
    face([-half, y0, z0], [-half, y1, z1], [half, y1, z1], [half, y0, z0], paint); // over the top and down the ends
    if (z1 <= z0) continue;
    for (const s of [1, -1]) face([s * half, floor, z0], [s * half, floor, z1], [s * half, y1, z1], [s * half, y0, z0], paint);
  }
  face([-half, floor, tail], [-half, body[0][1], tail], [half, body[0][1], tail], [half, floor, tail], paint);
  face([-half, floor, nose], [-half, body[body.length - 1][1], nose], [half, body[body.length - 1][1], nose], [half, floor, nose], paint);

  if (v.skirt) band(floor, Math.min(1, ...v.windows.map((w) => w.y0)) - 0.02, skirt);
  for (const s of [1, -1]) for (const w of v.windows) face([s * (half + 0.012), w.y0, w.z0], [s * (half + 0.012), w.y0, w.z1], [s * (half + 0.012), w.y1, w.z1], [s * (half + 0.012), w.y1, w.z0], GLASS);
  const { y0, y1 } = v.screen, inset = half - 0.1, fwd = 0.015;
  face([-inset, y0, noseAt(y0) + fwd], [inset, y0, noseAt(y0) + fwd], [inset, y1, noseAt(y1) + fwd], [-inset, y1, noseAt(y1) + fwd], GLASS);

  if (crew) {
    const a = new THREE.Color(crew.a), b = new THREE.Color(crew.b), under = Math.min(...v.windows.map((w) => w.y0));
    const hi = Math.max(under - 0.04, floor + 0.85), row = Math.min(BLOCK_M, (hi - floor) / 2), lo = hi - row * 2; // from the sills down, with big blocks that read from across a junction
    if (!crew.plain) for (const s of [1, -1]) for (let k = 0, z = tail + 0.06; z + row <= nose - 0.1; k++, z += row * 1.5) {
      if (heightAt(z) < hi || heightAt(z + row * 1.5) < hi) continue;
      for (const r of [0, 1]) face([s * (half + 0.008), lo + r * row, z], [s * (half + 0.008), lo + r * row, z + row * 1.5], [s * (half + 0.008), lo + (r + 1) * row, z + row * 1.5], [s * (half + 0.008), lo + (r + 1) * row, z], (k + r) % 2 ? b : a);
    }
    const back = Math.min(body[1][1], top) - 0.3, step = 0.34; // the chevrons, pointing up the centre of the back
    if (rules.role !== 'police' || v.id === 'police_van') for (const s of [1, -1]) for (let i = 0; i * step < half; i++) {
      const x0 = i * step, x1 = Math.min(half - 0.02, x0 + step), lift = 0.5, bottom = 0.75, c = i % 2 ? CHEVRON_RED : CHEVRON_YELLOW;
      face([s * x0, bottom, tail - 0.012], [s * x1, bottom - lift * (x1 - x0), tail - 0.012], [s * x1, back - lift * (x1 - x0), tail - 0.012], [s * x0, back, tail - 0.012], c);
    }
  }

  // Every face turned to look outward from the vehicle's middle, as with the town cars.
  const midZ = (tail + nose) / 2, midY = top / 2;
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], wx = pos[i + 6] - pos[i], wy = pos[i + 7] - pos[i + 1], wz = pos[i + 8] - pos[i + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3, cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - midY, cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3 - midZ;
    if (nx * cx + ny * cy + nz * cz >= 0) continue;
    for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();

  const tinted = (geo: THREE.BufferGeometry, colour: THREE.Color) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    flat.deleteAttribute('uv');
    flat.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: flat.getAttribute('position').count }, () => [colour.r, colour.g, colour.b]).flat(), 3));
    return flat;
  };
  const r = rules.wheel, parts: THREE.BufferGeometry[] = [];
  for (const z of v.axles) for (const s of [1, -1]) {
    parts.push(tinted(new THREE.CylinderGeometry(r, r, 0.26, 16).rotateZ(Math.PI / 2).translate(s * (half - 0.1), r, z), RUBBER));
    parts.push(tinted(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.28, 10).rotateZ(Math.PI / 2).translate(s * (half - 0.1), r, z), SILVER));
  }
  parts.push(tinted(new THREE.BoxGeometry(half * 2 - 0.06, 0.22, 0.12).translate(0, floor + 0.1, tail - 0.02), RUBBER), tinted(new THREE.BoxGeometry(half * 2 - 0.06, 0.22, 0.12).translate(0, floor + 0.1, nose + 0.02), RUBBER));
  for (const s of [1, -1]) {
    const lampY = floor + 0.5, lampZ = lampY <= body[body.length - 1][1] ? nose : noseAt(lampY); // flush with the nose, however it slopes
    parts.push(tinted(new THREE.BoxGeometry(0.34, 0.2, 0.05).translate(s * (half - 0.28), lampY, lampZ - 0.01), new THREE.Color('#f5ecc8')));
    parts.push(tinted(new THREE.BoxGeometry(0.2, 0.36, 0.05).translate(s * (half - 0.2), floor + 0.5, tail - 0.02), new THREE.Color('#a12a26')));
    parts.push(tinted(new THREE.BoxGeometry(0.22, 0.1, 0.12).translate(s * (half + 0.1), Math.min(y1, top - 0.3), noseAt(Math.min(y1, top - 0.3)) - 0.3), RUBBER)); // mirrors
  }
  if (crew) { const b = beaconAt(v); parts.push(tinted(new THREE.BoxGeometry(b.wide * 2 + 0.1, 0.08, 0.3).translate(0, b.y - 0.05, b.z), BAR)); }
  if (rules.role === 'bus') parts.push(tinted(new THREE.BoxGeometry(half * 1.3, 0.26, 0.04).translate(0, Math.min(y1 + 0.16, top - 0.16), noseAt(Math.min(y1 + 0.16, top - 0.16)) + 0.03), new THREE.Color('#14161a'))); // the destination blind
  return mergeGeometries([g, ...parts])!;
}
