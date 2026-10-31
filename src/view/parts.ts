// Merges lists of simple coloured shapes into one mesh, so a town of buildings costs one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part, PROP_KINDS } from '../../schemas/content.ts';

function partGeometry(p: Part): THREE.BufferGeometry {
  const g = p.shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : p.shape === 'cone' ? new THREE.ConeGeometry(0.5, 1, 8) : new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  g.scale(p.w, p.h, p.l);
  g.translate(p.x, p.y + p.h / 2, p.z);
  g.deleteAttribute('uv');
  const c = new THREE.Color(p.color), count = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(), 3));
  return g;
}

export const partsGeometry = (parts: Part[]) => mergeGeometries(parts.map(partGeometry));

export const paintedMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });

const part = (shape: Part['shape'], x: number, y: number, z: number, w: number, h: number, l: number, color: string): Part => ({ shape, x, y, z, w, h, l, color });

/** A town car, facing +z. Its white body takes each car's own colour. */
export const TRAFFIC_PARTS: Part[] = [
  part('box', 0, 0.35, 0, 1.75, 0.65, 4, '#ffffff'),
  part('box', 0, 1, -0.2, 1.5, 0.55, 2.1, '#5b6b7e'),
  ...[[-0.8, 1.25], [0.8, 1.25], [-0.8, -1.25], [0.8, -1.25]].map(([x, z]) => part('cylinder', x, 0, z, 0.3, 0.6, 0.6, '#23262e')),
];

export const PROP_PARTS: Record<(typeof PROP_KINDS)[number], Part[]> = {
  gnome: [part('cylinder', 0, 0, 0, 0.9, 0.9, 0.9, '#3d6fd1'), part('cylinder', 0, 0.9, 0, 0.6, 0.4, 0.6, '#e9b48c'), part('cone', 0, 1.3, 0, 0.8, 1, 0.8, '#e8483f')],
  duck: [part('box', 0, 0, 0, 1, 0.8, 1.6, '#ffd23e'), part('box', 0, 0.8, 0.5, 0.7, 0.7, 0.7, '#ffd23e'), part('box', 0, 0.95, 1, 0.5, 0.2, 0.4, '#f08a24')],
  statue: [part('box', 0, 0, 0, 1.8, 0.6, 1.8, '#b9bcc4'), part('cylinder', 0, 0.6, 0, 0.8, 1.6, 0.8, '#9aa0ab'), part('cylinder', 0, 2.2, 0, 0.7, 0.7, 0.7, '#9aa0ab')],
  crate: [part('box', 0, 0, 0, 1.8, 1.4, 1.8, '#a9794a'), part('box', 0, 1.4, 0, 1.2, 0.9, 1.2, '#c49a66')],
  signpost: [part('box', 0, 0, 0, 0.25, 2.8, 0.25, '#7a5637'), part('box', 0.5, 2, 0, 1.6, 0.5, 0.12, '#f4efd8'), part('box', -0.4, 1.4, 0, 1.3, 0.45, 0.12, '#ffd23e')],
  mushroom: [part('cylinder', 0, 0, 0, 0.7, 1, 0.7, '#f4efd8'), part('cone', 0, 1, 0, 2.2, 1, 2.2, '#e8483f')],
};
