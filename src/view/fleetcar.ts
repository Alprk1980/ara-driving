// The service vehicle you drive on a shift: the same Qwen-drawn body the town's buses and crews use (fleet.ts), rigged
// as the player's car so the cameras, lamps and dash all work. Its beacons flash while the blue lights are on.
import * as THREE from 'three';
import { FLEET_RULES, LIVERY, type FleetVehicle } from '../../schemas/fleet.ts';
import type { Driver } from '../save.ts';
import type { Car } from '../sim/economy.ts';
import { TAIL_DIM, type CarRig } from './carmesh.ts';
import { addLamps, box, buildCockpit, buildDriver, type Lookup } from './cockpit.ts';
import { drivingPosition } from './drivingposition.ts';
import { beaconAt, fleetGeometry } from './fleet.ts';

export type FleetRig = CarRig & { beacons: THREE.MeshBasicMaterial[]; beaconColour: string };

export function buildFleetCar(car: Car, v: FleetVehicle, driver: Driver, find: Lookup): FleetRig {
  const root = new THREE.Group(), body = new THREE.Group();
  const zs = v.body.map((p) => p[0]), tail = Math.min(...zs), nose = Math.max(...zs), len = nose - tail, wide = v.half * 2, top = Math.max(...v.body.map((p) => p[1]));
  const shell = new THREE.Mesh(fleetGeometry(v), new THREE.MeshLambertMaterial({ vertexColors: true }));
  shell.position.z = -(tail + nose) / 2; // centred, as the player's car is
  body.add(shell);
  const shift = shell.position.z, dark = new THREE.MeshLambertMaterial({ color: '#23262e' });
  const role = FLEET_RULES[v.id].role, skin = new THREE.MeshLambertMaterial({ color: role === 'bus' ? v.paint ?? '#d33' : LIVERY[role].paint });

  const floor = Math.min(0.55, v.screen.y0 - 0.5), heads = new THREE.MeshBasicMaterial({ color: '#f5ecc8' }), tails = new THREE.MeshBasicMaterial({ color: TAIL_DIM });
  for (const s of [-1, 1]) {
    body.add(box(0.34, 0.2, 0.05, heads, s * (v.half - 0.28), floor + 0.5, len / 2 + 0.03));
    body.add(box(0.2, 0.36, 0.05, tails, s * (v.half - 0.2), floor + 0.5, -len / 2 - 0.03));
  }
  const lamps = addLamps(body, len + 0.04, wide, floor + 0.75);

  // The light bar: two lamps that take turns, blue for the emergency services and amber for recovery and patrol vans.
  const beaconColour = role === 'bus' ? '#ffa21f' : LIVERY[role].beacon, beacons: THREE.MeshBasicMaterial[] = [];
  if (role !== 'bus') {
    const b = beaconAt(v);
    for (const s of [-1, 1]) {
      const m = new THREE.MeshBasicMaterial({ color: '#30343c' });
      beacons.push(m);
      body.add(box(b.wide * 0.9, 0.14, 0.26, m, (s * b.wide) / 2, b.y + 0.04, b.z + shift));
    }
  }

  // The driver sits behind the windscreen, high up in a bus or a truck: the cab's floor, belt and roof come from the drawing.
  const front = nose + shift - 0.35, cab = { floor, belt: v.screen.y0, roof: Math.min(top, v.screen.y1 + 0.35), front, back: front - 2.2, wide };
  const pose = drivingPosition(cab);
  const seat = buildDriver(driver, find, pose);
  seat.position.set(pose.seat.x, pose.seat.y, pose.seat.z);
  seat.scale.setScalar(pose.seat.scale);
  body.add(seat);
  root.add(body);

  const { dash, dashCanvas, dashTex, hands, eye, mirror, back } = buildCockpit(car.size, { floor, deck: v.screen.y0 - floor, roof: cab.roof, cabZ: front - 1.1, cabLen: 2.2, pose }, skin, dark, driver, find);
  root.add(dash);
  return { root, body, wheels: [], front: [], dash, dashCanvas, dashTex, hands, eye, mirror, back, tails, heads, crush: null, ...lamps, fragile: [], seat, beacons, beaconColour };
}

/** Flash the light bar: each lamp in turn, about twice a second (UN R65 asks for 2 to 4 flashes a second). */
export function flashBeacons(rig: FleetRig, on: boolean, t: number) {
  const phase = Math.floor(t * 4) % 2;
  rig.beacons.forEach((m, i) => m.color.set(on && phase === i ? rig.beaconColour : '#30343c'));
}
