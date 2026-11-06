// Wheels and lamps from the catalogue, shared by the block body (carmesh.ts) and the voxel body (voxelcar.ts) so a set
// bought in the garage looks the same on either. The styles' rules and colours live in schemas/content.ts.
import * as THREE from 'three';
import type { Design } from '../save.ts';
import type { Lookup } from './cockpit.ts';

export const HEAD_GLOW = '#fff3c0'; // the factory halogen's warm white, as every car had before lamps were sold
const FACTORY_RIM = '#c8c8cc';

/** How a set of wheels is drawn: the rim's colour, how much of the wheel it fills, and its spokes. A steel wheel is a
 *  plain disc behind a trim; alloys open into spokes, and sport wheels are bigger rims on lower tyres. */
export type WheelLook = { rim: string; fill: number; spokes: number; thin: boolean };
export function wheelLook(design: Design, find: Lookup): WheelLook {
  const w = find(design.wheels);
  if (w?.style === 'steel') return { rim: w.colors[0], fill: 0.6, spokes: 0, thin: false };
  if (w?.style === 'alloy') return { rim: w.colors[0], fill: 0.66, spokes: 5, thin: false };
  if (w?.style === 'sport') return { rim: w.colors[0], fill: 0.74, spokes: 10, thin: true };
  return { rim: FACTORY_RIM, fill: 0.62, spokes: 3, thin: false }; // the car as it came
}

/** The rim and spokes for one wheel, to sit inside a tyre of radius r and width wd, all turning about x. */
export function rimParts(look: WheelLook, r: number, wd: number, hub: THREE.Material): THREE.Object3D[] {
  const rimMat = new THREE.MeshLambertMaterial({ color: look.rim });
  const out: THREE.Object3D[] = [new THREE.Mesh(new THREE.CylinderGeometry(r * look.fill, r * look.fill, wd + 0.02, 24).rotateZ(Math.PI / 2), look.spokes ? hub : rimMat)];
  if (!look.spokes) { // a steel wheel's trim: a lighter disc with a dark hub
    out.push(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, wd + 0.05, 12).rotateZ(Math.PI / 2), hub));
    return out;
  }
  const spoke = new THREE.BoxGeometry(wd + 0.04, r * (look.thin ? 0.08 : 0.15), r * look.fill * 2);
  for (let i = 0; i < look.spokes / 2; i++) {
    const s = new THREE.Mesh(spoke, rimMat);
    s.rotation.x = (i * 2 * Math.PI) / look.spokes;
    out.push(s);
  }
  out.push(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, wd + 0.06, 12).rotateZ(Math.PI / 2), rimMat));
  return out;
}

/** The headlamps' white: the bought lamps' own, or the factory halogen. */
export const headGlow = (design: Design, find: Lookup) => find(design.lights)?.colors[0] ?? HEAD_GLOW;

/** A daytime running strip, if the lamps are DRLs: a thin bar of light across each headlamp's top edge. */
export function addDrl(body: THREE.Group, design: Design, find: Lookup, at: { wide: number; y: number; z: number; across: number }) {
  const l = find(design.lights);
  if (l?.style !== 'drl') return;
  const mat = new THREE.MeshBasicMaterial({ color: l.colors[0] });
  for (const s of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(at.across, 0.035, 0.03), mat);
    strip.position.set(s * at.wide, at.y, at.z);
    body.add(strip);
  }
}
