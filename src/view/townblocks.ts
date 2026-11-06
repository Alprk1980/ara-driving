// Every building in town as a few merged meshes: one per style for its upper walls, one for its street floors, and one
// for all the plain parts, roofs, parapets, awnings and rooftop plant. Merging keeps the draw calls near what plain boxes
// cost. A wall the player broke is taken out of its mesh and a stand-in with holes built for that one building.
import * as THREE from 'three';
import type { BuildingStyle } from '../../schemas/buildings.ts';
import { DISTRICTS } from '../sim/districts.ts';
import type { Box } from '../sim/town.ts';
import { baysOn, CORNICE, groundPart, planBuilding, upperPart, wallRects, type FacePart, type Plan, type WallRect } from './buildingplan.ts';
import { sellsToStreet, SHOP_GLASS, styleMaterials, type StyleMaterials } from './facades.ts';
import { cutRect, wallKey, wallPoint, wallSpan, WALLS, type Wall } from './wallbreak.ts';

type V3 = [number, number, number];
const SHADE = 0.86;
const SHED_PITCH = 0.105; // portal-frame sheds are built at a shallow pitch, about 6 degrees
const YARD_GREY = new THREE.Color('#9b9b95'), FORECOURT = new THREE.Color('#c9c7c0');

class Buf {
  pos: number[] = []; norm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  /** A four-cornered face, wound to look along `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uv: number[], color: THREE.Color) {
    const s = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) { this.norm.push(...n); this.col.push(color.r, color.g, color.b); }
    this.uv.push(...uv);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0;
    this.idx.push(...(out ? [s, s + 1, s + 2, s, s + 2, s + 3] : [s, s + 2, s + 1, s, s + 3, s + 2]));
  }
  tri(a: V3, b: V3, c: V3, n: V3, color: THREE.Color) {
    const s = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.norm.push(...n); this.col.push(color.r, color.g, color.b); }
    this.uv.push(0, 0, 0, 0, 0, 0);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] > 0;
    this.idx.push(...(out ? [s, s + 1, s + 2] : [s, s + 2, s + 1]));
  }
  /** A plain box, base at y, with the bottom left off. */
  box(x: number, y: number, z: number, w: number, h: number, l: number, color: THREE.Color) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - l / 2, z1 = z + l / 2, y1 = y + h, side = color.clone().multiplyScalar(SHADE), none = [0, 0, 0, 0, 0, 0, 0, 0];
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], none, color);
    this.quad([x1, y, z0], [x1, y, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], none, side);
    this.quad([x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], none, side);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], none, side);
    this.quad([x0, y, z0], [x1, y, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], none, side);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** Whole quads of one wall rect into the buffers, cut round any tiles that have been opened on it. */
function emitWall(buf: Buf, b: Box, p: Plan, r: WallRect, wall: Wall, tint: THREE.Color, open: ReadonlySet<string> | undefined) {
  const body = { x: b.x, z: b.z, hx: r.hx, hz: r.hz }, span = wallSpan(body, wall), out: V3 = wall.axis === 'x' ? [wall.sign, 0, 0] : [0, 0, wall.sign];
  const bays = baysOn(span, r.role === 'ground' ? Math.max(p.style.bay, 3.2) : p.style.bay);
  const ub = (a: number) => ((a / span) * bays) / 4;
  const vb = (y: number) => (r.role === 'ground' ? y / p.ground : ((y - p.ground) / p.style.storey) / 4);
  for (const q of cutRect(b, wall, r, open)) {
    const at = (a: number, y: number): V3 => { const w = wallPoint(body, wall, a, 0); return [w.x, y, w.z]; };
    buf.quad(at(q.a0, q.y0), at(q.a1, q.y0), at(q.a1, q.y1), at(q.a0, q.y1), out, [ub(q.a0), vb(q.y0), ub(q.a1), vb(q.y0), ub(q.a1), vb(q.y1), ub(q.a0), vb(q.y1)], tint);
  }
}

/** The plain parts on top of a building. Low ones (awnings, the cornice over a shop) sit on `low`, so a crash can take them with the wall. */
function emitParts(high: Buf, low: Buf, b: Box, p: Plan) {
  const { style } = p, roof = new THREE.Color(style.roof.color), trim = new THREE.Color(style.trim), hx = b.hx - p.tierIn, hz = b.hz - p.tierIn, wall = new THREE.Color(p.wall);
  const slab = (x: number, y: number, z: number, w: number, h: number, l: number, c: THREE.Color) => high.box(x, y, z, w, h, l, c);
  const yard = b.district === 'works' ? YARD_GREY : b.district === 'business' ? FORECOURT : null;
  if (yard && b.front) { // hard ground out to the pavement: a works' concrete yard, an office's paved forecourt
    const reach = DISTRICTS[b.district!].setback - 2.8, pad = b.district === 'works' ? 7 : 1.5;
    const x0 = b.x - b.hx - pad - Math.max(0, -b.front.x) * reach, x1 = b.x + b.hx + pad + Math.max(0, b.front.x) * reach;
    const z0 = b.z - b.hz - pad - Math.max(0, -b.front.z) * reach, z1 = b.z + b.hz + pad + Math.max(0, b.front.z) * reach;
    high.quad([x0, 0.012, z0], [x1, 0.012, z0], [x1, 0.012, z1], [x0, 0.012, z1], [0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], yard);
  }
  if (p.tierIn) slab(b.x, p.tierFrom, b.z, b.hx * 2 + 0.3, CORNICE, b.hz * 2 + 0.3, trim); // the terrace where a tower steps back
  switch (style.roof.kind) {
    case 'pitched': {
      const along = b.hx >= b.hz, half = along ? hz : hx, overhang = 0.35;
      const rise = half * (b.district === 'works' ? SHED_PITCH : 0.72); // a house's steep slate roof about 35 degrees, a steel shed's barely there
      const y = p.top, ridge = y + rise, roofSide = roof.clone(), roofFar = roof.clone().multiplyScalar(0.88);
      for (const s of [-1, 1]) {
        const n: V3 = along ? [0, half, s * rise] : [s * rise, half, 0], len = Math.hypot(...n), unit: V3 = [n[0] / len, n[1] / len, n[2] / len];
        const none = [0, 0, 0, 0, 0, 0, 0, 0], eave = half + overhang;
        if (along) high.quad([b.x - hx - overhang, y - 0.15, b.z + s * eave], [b.x + hx + overhang, y - 0.15, b.z + s * eave], [b.x + hx + overhang, ridge, b.z], [b.x - hx - overhang, ridge, b.z], unit, none, s > 0 ? roofSide : roofFar);
        else high.quad([b.x + s * eave, y - 0.15, b.z - hz - overhang], [b.x + s * eave, y - 0.15, b.z + hz + overhang], [b.x, ridge, b.z + hz + overhang], [b.x, ridge, b.z - hz - overhang], unit, none, s > 0 ? roofSide : roofFar);
        // The gable ends, in the wall's own paint.
        const n2: V3 = along ? [s, 0, 0] : [0, 0, s], gx = along ? b.x + s * hx : b.x, gz = along ? b.z : b.z + s * hz;
        if (along) high.tri([gx, y, gz - half], [gx, y, gz + half], [gx, ridge, gz], n2, wall);
        else high.tri([gx - half, y, gz], [gx + half, y, gz], [gx, ridge, gz], n2, wall);
      }
      if (b.district !== 'works') { // chimneys at the ridge, every house its own
        const brick = new THREE.Color('#7a4a3a'), span = along ? hx : hz, stacks = span > 7 ? 2 : 1;
        for (let i = 0; i < stacks; i++) {
          const at = (stacks === 1 ? 0.45 : i ? 0.62 : -0.62) * span;
          slab(b.x + (along ? at : 0), ridge - 1.1, b.z + (along ? 0 : at), 0.8, 1.9, 0.8, brick);
        }
      }
      break;
    }
    case 'parapet':
      slab(b.x, p.top, b.z, hx * 2 - 0.4, 0.15, hz * 2 - 0.4, roof);
      for (const s of [-1, 1]) {
        slab(b.x + s * (hx - 0.15), p.top, b.z, 0.3, 0.9, hz * 2 + 0.2, trim);
        slab(b.x, p.top, b.z + s * (hz - 0.15), hx * 2 + 0.2, 0.9, 0.3, trim);
      }
      break;
    case 'plant': {
      slab(b.x, p.top, b.z, hx * 2 + 0.5, 0.4, hz * 2 + 0.5, roof);
      const dark = roof.clone().multiplyScalar(0.7), n = b.hx > 14 ? 3 : 2;
      for (let i = 0; i < n; i++) slab(b.x + (i - (n - 1) / 2) * hx * 0.55, p.top + 0.4, b.z - hz * 0.3, 3.2, 1.5, 2.4, dark);
      slab(b.x - hx * 0.4, p.top + 0.4, b.z + hz * 0.4, 2.6, 2.6, 2.6, dark);
      break;
    }
    default:
      slab(b.x, p.top, b.z, hx * 2 + 0.8, 0.5, hz * 2 + 0.8, roof);
  }
  if (b.front) streetFront(high, low, b, p);
  if (p.ground) {
    low.box(b.x, p.ground - 0.05, b.z, b.hx * 2 + 0.3, CORNICE, b.hz * 2 + 0.3, new THREE.Color(style.ground.kind === 'shopfront' ? style.ground.main : style.trim));
    if (style.ground.kind === 'shopfront') {
      const stripe = new THREE.Color(style.ground.accent);
      for (const s of [-1, 1]) {
        if (b.hx >= b.hz) low.box(b.x, p.ground * 0.72, b.z + s * (b.hz + 0.55), b.hx * 2 - 1, 0.18, 1.1, stripe);
        else low.box(b.x + s * (b.hx + 0.55), p.ground * 0.72, b.z, 1.1, 0.18, b.hz * 2 - 1, stripe);
      }
    }
  }
}

// What faces the street. Judged sizes, from typical British buildings rather than a standard: a Victorian or Edwardian
// bay projects 0.6-0.9 m and fills most of a ground-floor room's width; a roof dormer is about 1.6 m wide and 1.4 tall;
// a loading door's dock shelter, the black seal a lorry backs into, stands about 0.6 m proud of the wall, under a canopy.
const BAY_DEEP = 0.75, BAY_W = 2.2, DORMER_W = 1.6, DORMER_H = 1.35, SHELTER_DEEP = 0.6, CANOPY_DEEP = 1.8;
const BAY_SHARE = 0.6, DORMER_SHARE = 0.4; // how many houses have them: judged

/** Bay windows, dormers and loading bays on the side of a building that faces the street. */
function streetFront(high: Buf, low: Buf, b: Box, p: Plan) {
  const f = b.front!, onX = Math.abs(f.x) > Math.abs(f.z), wide = onX ? b.hz : b.hx, deep = onX ? b.hx : b.hz;
  const sx = onX ? Math.sign(f.x) : 0, sz = onX ? 0 : Math.sign(f.z), roll = hashOf(b.x, b.z);
  const at = (across: number, out: number) => ({ x: b.x + sx * (deep + out) + (onX ? 0 : across), z: b.z + sz * (deep + out) + (onX ? across : 0) });
  const piece = (buf: Buf, across: number, out: number, y: number, w: number, h: number, d: number, c: THREE.Color) => {
    const q = at(across, out);
    buf.box(q.x, y, q.z, onX ? d : w, h, onX ? w : d, c);
  };
  const wall = new THREE.Color(p.wall), glass = new THREE.Color(p.style.glass), trim = new THREE.Color(p.style.trim);
  if (b.district === 'garden' && p.style.roof.kind === 'pitched' && roll < BAY_SHARE) { // a bay on each side of the front door
    const room = Math.min(p.style.storey, 2.9) - 0.4;
    for (const side of wide > 4.2 ? [-1, 1] : [1]) {
      const across = side * Math.min(wide - BAY_W / 2 - 0.4, wide * 0.5);
      piece(low, across, BAY_DEEP / 2, 0, BAY_W, room + 0.35, BAY_DEEP, wall); // the bay's body, to its sills and roof
      piece(low, across, BAY_DEEP + 0.02, 0.75, BAY_W - 0.3, room - 0.75, 0.04, glass); // its glass
      piece(low, across, BAY_DEEP / 2, room + 0.35, BAY_W + 0.1, 0.12, BAY_DEEP + 0.1, trim); // and its little roof
    }
  }
  const along = b.hx >= b.hz, frontSlope = along ? !onX : onX; // the roof's slopes face across its ridge: is one of them the street's?
  if ((b.district === 'garden' || b.district === 'oldtown') && p.style.roof.kind === 'pitched' && frontSlope && hashOf(b.z, b.x) < DORMER_SHARE) {
    const half = onX ? b.hx : b.hz, rise = half * 0.72, back = half * 0.45, y = p.top + rise * (back / half) - DORMER_H * 0.45; // the roof's height this far in from the eaves, with the dormer's foot set into the slope
    piece(high, wide * 0.2, -back - 0.7, y, DORMER_W, DORMER_H, 1.4, wall);
    piece(high, wide * 0.2, -back + 0.02, y + 0.25, DORMER_W - 0.5, DORMER_H - 0.45, 0.04, glass);
    piece(high, wide * 0.2, -back - 0.7, y + DORMER_H, DORMER_W + 0.2, 0.14, 1.6, new THREE.Color(p.style.roof.color));
  }
  if (p.style.ground.kind === 'loading') { // a dock shelter round each loading door, and a canopy over the lot
    const bays = baysOn(wide * 2, Math.max(p.style.bay, 3.2)), cell = (wide * 2) / bays, door = p.ground * 0.82, seal = new THREE.Color('#1c1e22');
    for (let c = 0; c < bays; c += 2) {
      const across = -wide + (c + 0.5) * cell, open = cell * 0.84;
      for (const e of [-1, 1]) piece(low, across + e * (open / 2 + 0.12), SHELTER_DEEP / 2, 0, 0.24, door + 0.2, SHELTER_DEEP, seal);
      piece(low, across, SHELTER_DEEP / 2, door, open + 0.48, 0.3, SHELTER_DEEP, seal);
    }
    piece(high, 0, CANOPY_DEEP / 2, p.ground * 0.95, wide * 2, 0.16, CANOPY_DEEP, trim);
  }
}

const hashOf = (a: number, b: number) => {
  let h = Math.imul(Math.round(a * 10) * 73856093 ^ Math.round(b * 10) * 19349663, 0x5bd1e995);
  h ^= h >>> 13;
  return (Math.imul(h, 0x5bd1e995) >>> 0) / 4294967296;
};

type Range = { start: number; count: number };
type Slot = { upper: Range; ground: Range; low: Range };

export class TownBuildings {
  readonly group = new THREE.Group();
  readonly materials: THREE.MeshLambertMaterial[] = [];
  readonly plans: Plan[];
  private boxes: readonly Box[];
  private byStyle = new Map<string, StyleMaterials>();
  private slots: Slot[] = [];
  private meshes = new Map<string, { upper: THREE.Mesh; ground: THREE.Mesh }>();
  private low: THREE.Mesh;
  private home = new Map<THREE.BufferAttribute, Float32Array>();

  constructor(boxes: readonly Box[], styles: readonly BuildingStyle[]) {
    this.boxes = boxes;
    this.plans = boxes.map((b) => planBuilding(b, styles));
    const bufs = new Map<string, { upper: Buf; ground: Buf }>(), high = new Buf(), low = new Buf(), tint = new THREE.Color();
    for (const s of styles) {
      const m = styleMaterials(s);
      this.byStyle.set(s.id, m);
      this.materials.push(m.upper, m.ground);
      bufs.set(s.id, { upper: new Buf(), ground: new Buf() });
    }
    boxes.forEach((b, i) => {
      const p = this.plans[i], set = bufs.get(p.style.id)!;
      const was = { u: set.upper.pos.length / 3, g: set.ground.pos.length / 3, l: low.pos.length / 3 };
      tint.set(p.wall);
      if (!b.drawn) { // a building from a drawing stands in view/drawn.ts instead
        for (const r of wallRects(b, p)) for (const w of WALLS) emitWall(r.role === 'ground' ? set.ground : set.upper, b, p, r, w, tint, undefined);
        emitParts(high, low, b, p);
      }
      this.slots.push({ upper: { start: was.u, count: set.upper.pos.length / 3 - was.u }, ground: { start: was.g, count: set.ground.pos.length / 3 - was.g }, low: { start: was.l, count: low.pos.length / 3 - was.l } });
    });
    for (const [id, set] of bufs) {
      const m = this.byStyle.get(id)!, upper = new THREE.Mesh(set.upper.geometry(), m.upper), ground = new THREE.Mesh(set.ground.geometry(), m.ground);
      this.meshes.set(id, { upper, ground });
      for (const mesh of [upper, ground]) { mesh.frustumCulled = false; this.group.add(mesh); }
    }
    const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
    const highMesh = new THREE.Mesh(high.geometry(), plain);
    this.low = new THREE.Mesh(low.geometry(), plain);
    for (const mesh of [highMesh, this.low]) { mesh.frustumCulled = false; this.group.add(mesh); }
  }

  indexOf(b: Box) { return this.boxes.indexOf(b); }

  /** Set the night's light across every window in town. */
  setNight(k: number) { for (const m of this.materials) m.emissiveIntensity = k; }

  private collapse(mesh: THREE.Mesh, r: Range, on: boolean) {
    const a = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!this.home.has(a)) this.home.set(a, (a.array as Float32Array).slice());
    const arr = a.array as Float32Array, was = this.home.get(a)!;
    if (on) arr.set(was.subarray(r.start * 3, (r.start + r.count) * 3), r.start * 3);
    else arr.fill(0, r.start * 3, (r.start + r.count) * 3);
    a.needsUpdate = true;
  }

  /** Take a building's walls, and the low parts on them, out of the town's meshes, or put them back. */
  setWalls(i: number, on: boolean) {
    const m = this.meshes.get(this.plans[i].style.id)!, s = this.slots[i];
    this.collapse(m.upper, s.upper, on);
    this.collapse(m.ground, s.ground, on);
    this.collapse(this.low, s.low, on);
  }

  /** The same building's walls with tiles opened: its stand-in while it's damaged. */
  standIn(i: number, open: ReadonlyMap<string, ReadonlySet<string>>): THREE.Group {
    const b = this.boxes[i], p = this.plans[i], m = this.byStyle.get(p.style.id)!, upper = new Buf(), ground = new Buf(), tint = new THREE.Color(p.wall);
    for (const r of wallRects(b, p)) for (const w of WALLS) emitWall(r.role === 'ground' ? ground : upper, b, p, r, w, tint, r.inset ? undefined : open.get(wallKey(w)));
    const g = new THREE.Group();
    for (const [buf, mat] of [[upper, m.upper], [ground, m.ground]] as const) {
      const mesh = new THREE.Mesh(buf.geometry(), mat);
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    return g;
  }

  /** The colour a wall is at a spot, for the voxels that replace it. */
  colorAt(i: number, wall: Wall, along: number, y: number, out: THREE.Color): THREE.Color {
    const b = this.boxes[i], p = this.plans[i], s = p.style, span = wallSpan(b, wall);
    let part: FacePart;
    if (y < p.ground) {
      const at = (along / span) * baysOn(span, Math.max(s.bay, 3.2));
      part = groundPart(s, Math.floor(at), at % 1, y / p.ground);
    } else {
      const at = (along / span) * baysOn(span, s.bay), up = (y - p.ground) / s.storey;
      part = upperPart(s, at % 1, up % 1);
    }
    const slots: Record<FacePart, string> = { wall: p.wall, glass: y < p.ground && sellsToStreet(s) ? SHOP_GLASS : s.glass, frame: s.trim, accent: s.ground.accent, main: s.ground.main, dark: '#1c1e26' };
    return out.set(slots[part]);
  }
}
