// The emergency stations: Qwen's building, its bay doors in the service's colour, and a concrete forecourt to the road.
import * as THREE from 'three';
import { SERVICE_RULES, type ServiceBuilding } from '../../schemas/services.ts';
import services from '../data/services.json';
import { DRAWN_FOOT, type Town } from '../sim/town.ts';
import { paintedMaterial, partsGeometry } from './parts.ts';

export const SERVICE_DESIGNS = services as unknown as ServiceBuilding[];

export function buildServices(scene: THREE.Scene, town: Town) {
  for (const s of town.services) {
    const design = SERVICE_DESIGNS.find((d) => d.id === s.id);
    if (!design) continue;
    const r = SERVICE_RULES[s.id], group = new THREE.Group();
    group.position.set(s.x, 0, s.z);
    group.rotation.y = s.heading;
    if (!DRAWN_FOOT.some((f) => f.service === s.id)) { // the drawn station, if there is one, stands in view/drawn.ts
      group.add(new THREE.Mesh(partsGeometry(design.parts), paintedMaterial()));
      for (const d of design.doors) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.14), new THREE.MeshLambertMaterial({ color: r.door }));
        door.position.set(d.x, d.h / 2, r.hz + 0.08);
        group.add(door);
      }
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(r.hx * 2, s.apron + 3), new THREE.MeshLambertMaterial({ color: '#b3b0a8', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.012, r.hz + (s.apron + 3) / 2);
    group.add(apron);
    scene.add(group);
  }
}
