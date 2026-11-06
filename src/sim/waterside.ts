// The canal along the town's east edge and the basin where it ends, with narrowboats moored along both. The town is in
// the Midlands, where canals, not beaches, are the waterside: Birmingham famously has more miles of canal than Venice
// (about 35), and basins like Gas Street are lined with boats.
//
// Narrow canals were built to the narrow locks: a narrowboat is at most 72 ft by 6 ft 10 in (21.95 m by 2.08 m), the
// Canal & River Trust's lock limit (from memory of its guidance). The canal's width and towpath are judged from
// Birmingham's canals, about 7-10 m of water with a towpath of 2-3 m; the basin's size is judged.
import type { Vec } from './town.ts';

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export const CANAL: Rect = { x0: 2940, x1: 2949, z0: 160, z1: 2760 };
export const TOWPATH: Rect = { x0: 2933, x1: 2940, z0: 160, z1: 2760 };
export const BASIN: Rect = { x0: 2900, x1: 2985, z0: 2750, z1: 2885 };
export const WATER = [CANAL, BASIN];
export const BOAT_W = 2.08, BOAT_MAX_L = 21.95, BOAT_MIN_L = 13.7; // 45 ft to 72 ft
export const LIVERIES = ['#1f4d33', '#8b1e1e', '#1f3f7a', '#5a2a5e', '#2f2f33'] as const; // Brunswick green, maroon, navy, plum, black: the traditional cabin colours, judged

const within = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
export const inWater = (x: number, z: number, pad = 0) => WATER.some((r) => within(r, x, z, pad));
/** A building's footprint touching the water or the towpath: it doesn't go up there. */
export const blocksWaterside = (x: number, z: number, hx: number, hz: number) => [CANAL, BASIN, TOWPATH].some((r) => x + hx > r.x0 - 4 && x - hx < r.x1 + 4 && z + hz > r.z0 - 4 && z - hz < r.z1 + 4);

export type Boat = Vec & { heading: number; len: number; livery: string };

/** Boats moored nose to tail along the canal's town side and round the basin, seeded so they're always the same. */
export function moorings(): Boat[] {
  const out: Boat[] = [];
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let z = CANAL.z0 + 140; z < CANAL.z1 - 30;) { // along the canal, in clusters with gaps, as visitor moorings run
    if (r() < 0.55) { z += 60 + r() * 120; continue; }
    const len = BOAT_MIN_L + r() * (BOAT_MAX_L - BOAT_MIN_L);
    out.push({ x: CANAL.x0 + BOAT_W / 2 + 0.3, z: z + len / 2, heading: r() < 0.5 ? 0 : Math.PI, len, livery: LIVERIES[Math.floor(r() * LIVERIES.length)] });
    z += len + 1.5;
  }
  for (const [x, dir] of [[BASIN.x0 + BOAT_W / 2 + 0.3, 1], [BASIN.x1 - BOAT_W / 2 - 0.3, -1]] as const) { // along both sides of the basin
    for (let z = BASIN.z0 + 6; z < BASIN.z1 - 6;) {
      const len = BOAT_MIN_L + r() * (BOAT_MAX_L - BOAT_MIN_L);
      if (z + len > BASIN.z1 - 4) break;
      out.push({ x, z: z + len / 2, heading: dir > 0 ? 0 : Math.PI, len, livery: LIVERIES[Math.floor(r() * LIVERIES.length)] });
      z += len + 1.2;
    }
  }
  for (let x = BASIN.x0 + 14; x < BASIN.x1 - 24; x += BOAT_MAX_L + 3) { // and stern-on at the basin's far end
    out.push({ x: x + BOAT_W, z: BASIN.z1 - BOAT_MAX_L / 2 - 0.5, heading: Math.PI / 2, len: BOAT_MAX_L, livery: LIVERIES[Math.floor(r() * LIVERIES.length)] });
  }
  return out;
}
