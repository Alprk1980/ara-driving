// Which bus is which: the route number lit on each bus's destination display, front and back, and a flag on a pole at
// every stop listing the routes that call there. A UK flag is mounted square to the kerb so a driver coming along sees
// it, and a bus pulls up with its front doors at the flag; its lettering says Request stop where buses stop only when
// asked (TSRGD 2016 lets "Bus stop" read "Request stop"). How a flag is laid out varies by operator and area: this one
// is generic, not any company's.
import * as THREE from 'three';
import { dist, type BusRoute, type Town, type Vec } from '../sim/town.ts';
import type { Traffic, TrafficCar } from '../sim/traffic.ts';
import { blindAt, FLEET_SHAPES } from './fleet.ts';

const FLAG_LOW_M = 2.3; // the flag's bottom edge: 2.1 m is the least headroom for a sign over a footway, 2.3 m preferred (DfT Inclusive Mobility)
const FLAG_W = 0.5, FLAG_H = 0.75; // judged: about a London flag's size
const STOP_IN_M = 1; // the stop's point is 1 m in from the kerb edge (town.ts findStops)
const POLE_IN_M = 0.5; // back from the kerb edge, clear of a bus's mirror; judged
const FLAG_AHEAD_M = 5.5; // ahead of the stop's middle, where a bus's front doors come to rest; judged from the buses' lengths
const LED = '#ffb020', BLIND = '#14161a';

const textures = new Map<string, THREE.CanvasTexture>();
function texture(key: string, w: number, h: number, paint: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = textures.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(key, t);
  return t;
}

/** A destination display: the number large on the left, where it goes beside it, in amber dots' colour. */
function blindTexture(r: BusRoute, front: boolean) {
  return texture(`blind:${r.name}:${front}`, front ? 512 : 192, 80, (x) => {
    x.fillStyle = BLIND;
    x.fillRect(0, 0, x.canvas.width, x.canvas.height);
    x.fillStyle = LED;
    x.textBaseline = 'middle';
    x.font = 'bold 76px sans-serif'; // the number takes the display's full height: it's what you read first
    x.fillText(r.name, 12, 44);
    if (!front) return;
    const at = 30 + x.measureText(r.name).width;
    x.font = 'bold 34px sans-serif';
    x.fillText(r.via, at, 46, x.canvas.width - at - 10);
  });
}

/** A stop's flag: a bus symbol, Request stop, and a tile for each route that calls. */
function flagTexture(routes: BusRoute[]) {
  return texture(`flag:${routes.map((r) => r.name).join()}`, 200, 300, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 200, 300);
    x.fillStyle = '#c8202a'; // the top band carries the bus symbol, as on most UK flags
    x.fillRect(0, 0, 200, 130);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(45, 22, 110, 62, 10); // the bus: body, windows, wheels
    x.fill();
    x.fillStyle = '#c8202a';
    for (let i = 0; i < 3; i++) x.fillRect(55 + i * 32, 32, 26, 22);
    x.beginPath();
    x.arc(72, 86, 10, 0, Math.PI * 2);
    x.arc(128, 86, 10, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ffffff';
    x.font = 'bold 24px sans-serif';
    x.textAlign = 'center';
    x.fillText('Request stop', 100, 120, 186);
    routes.forEach((r, i) => {
      const y = 145 + i * 74;
      x.fillStyle = '#1b1d22';
      x.beginPath();
      x.roundRect(14, y, 172, 62, 8);
      x.fill();
      x.fillStyle = '#ffffff';
      x.font = 'bold 34px sans-serif';
      x.fillText(r.name, 100, y + 32);
      x.font = '16px sans-serif';
      x.fillText(r.via, 100, y + 53);
    });
  });
}

export class BusSigns {
  readonly group = new THREE.Group();
  private blinds: { bus: TrafficCar; g: THREE.Group }[] = [];

  constructor(town: Town, traffic: Traffic) {
    this.flags(town);
    for (const bus of traffic.cars.filter((c) => c.role === 'bus')) {
      const v = FLEET_SHAPES.find((s) => s.id === bus.fleet)!, b = blindAt(v), r = town.routes[bus.route], g = new THREE.Group();
      const front = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.96, b.h * 0.85), new THREE.MeshBasicMaterial({ map: blindTexture(r, true) }));
      front.position.set(0, b.y, b.z + 0.025);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), new THREE.MeshBasicMaterial({ map: blindTexture(r, false) }));
      back.position.set(0, b.y, b.tail - 0.02);
      back.rotation.y = Math.PI;
      g.add(front, back);
      this.group.add(g);
      this.blinds.push({ bus, g });
    }
  }

  /** A pole and flag for each stop, shared by every route that calls there. */
  private flags(town: Town) {
    const done: Vec[] = [], pole = new THREE.CylinderGeometry(0.04, 0.04, FLAG_LOW_M + 0.05, 8), grey = new THREE.MeshLambertMaterial({ color: '#8d939c' });
    const plate = new THREE.BoxGeometry(FLAG_W, FLAG_H, 0.03);
    for (const r of town.routes) for (const s of r.stops) {
      if (done.some((d) => dist(d, s) < 6)) continue;
      done.push(s);
      const e = town.edges[s.edge], b = town.nodes[s.to], a = town.nodes[e.a === s.to ? e.b : e.a], dx = (b.x - a.x) / e.len, dz = (b.z - a.z) / e.len;
      const out = STOP_IN_M - POLE_IN_M; // towards the road from the stop's point; (dz, -dx) is the driver's left, the kerb side
      const p = { x: s.x - dz * out + dx * FLAG_AHEAD_M, z: s.z + dx * out + dz * FLAG_AHEAD_M };
      const mat = new THREE.MeshBasicMaterial({ map: flagTexture(town.routesAt(s)) }), side = new THREE.MeshLambertMaterial({ color: '#dfe3e8' });
      const stand = new THREE.Group();
      const post = new THREE.Mesh(pole, grey);
      post.position.y = (FLAG_LOW_M + 0.05) / 2; // the flag sits on top of its post, as UK flags do, so the post never crosses its face
      const flag = new THREE.Mesh(plate, [side, side, side, side, mat, mat]); // both faces, square to the road
      flag.position.y = FLAG_LOW_M + FLAG_H / 2;
      stand.add(post, flag);
      stand.position.set(p.x, 0, p.z);
      stand.rotation.y = Math.atan2(dx, dz);
      this.group.add(stand);
    }
  }

  draw() {
    for (const { bus, g } of this.blinds) {
      g.visible = !bus.dormant;
      g.position.set(bus.x, 0, bus.z);
      g.rotation.y = bus.heading;
    }
  }
}
