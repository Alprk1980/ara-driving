// The hanging signs of the town's shops, cafés and markets: a board on a bracket beside each front door, standing out
// from the wall so you read it walking or driving along, with the place's own name on both faces.
//
// Projecting signs over a pavement have to clear people's heads: council shopfront guides commonly ask about 2.6 m from
// the footway to the bottom of the sign (from memory of several such guides; no one national figure was checked). The
// board's size is judged from the traditional hanging signs of British high streets.
import * as THREE from 'three';
import type { Place } from '../../schemas/content.ts';
import type { Game } from '../sim/game.ts';
import { placeAt } from '../sim/quests.ts';

export const SIGN_CLEAR_M = 2.6, SIGN_W = 0.9, SIGN_H = 0.6, SIGN_OUT_M = 0.25, SIGN_BESIDE_M = 1.1;
const SIGNED: readonly Place['kind'][] = ['shop', 'cafe', 'market'];
const BOARD: Partial<Record<Place['kind'], string>> = { shop: '#1f4d3a', cafe: '#6b3b23', market: '#2f5f8a' }; // the board's paint by kind: judged

/** A sign's face, its name in a cream serif on the board's colour, as a painted sign would be. */
function face(name: string, paint: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 170;
  const g = c.getContext('2d')!;
  g.fillStyle = paint;
  g.fillRect(0, 0, 256, 170);
  g.strokeStyle = '#e8d9a8';
  g.lineWidth = 8;
  g.strokeRect(10, 10, 236, 150);
  g.fillStyle = '#f3e7c4';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = name.split(' '), lines: string[] = [];
  for (const w of words) { const last = lines.at(-1); if (last && (last + ' ' + w).length <= 11) lines[lines.length - 1] = last + ' ' + w; else lines.push(w); }
  const size = lines.length > 2 ? 32 : 40;
  g.font = `700 ${size}px Georgia, serif`;
  lines.forEach((l, i) => g.fillText(l, 128, 85 + (i - (lines.length - 1) / 2) * size * 1.1, 220));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One sign beside every door of a place that sells, facing along the street. */
export function buildShopSigns(game: Game): THREE.Group {
  const group = new THREE.Group(), bracket = new THREE.MeshLambertMaterial({ color: '#202226' });
  const arm = new THREE.BoxGeometry(0.05, 0.05, SIGN_W + SIGN_OUT_M), board = new THREE.PlaneGeometry(SIGN_W, SIGN_H);
  for (const d of game.doors) {
    const place = placeAt(game.town, game.content.places, d.plot);
    if (!place || !SIGNED.includes(place.kind)) continue;
    const out = { x: Math.sin(d.heading), z: Math.cos(d.heading) }, side = { x: out.z, z: -out.x };
    const at = { x: d.x + side.x * SIGN_BESIDE_M, z: d.z + side.z * SIGN_BESIDE_M }, sign = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: face(place.name, BOARD[place.kind] ?? '#333'), side: THREE.DoubleSide });
    const plane = new THREE.Mesh(board, mat);
    plane.rotation.y = Math.PI / 2; // edge on to the wall, so it reads from along the street both ways
    plane.position.set(0, SIGN_CLEAR_M + SIGN_H / 2, SIGN_OUT_M + SIGN_W / 2);
    const bar = new THREE.Mesh(arm, bracket);
    bar.position.set(0, SIGN_CLEAR_M + SIGN_H + 0.05, (SIGN_W + SIGN_OUT_M) / 2);
    sign.add(plane, bar);
    sign.position.set(at.x, 0, at.z);
    sign.rotation.y = d.heading;
    group.add(sign);
  }
  return group;
}
