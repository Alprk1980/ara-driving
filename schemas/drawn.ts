// A building built by hand from a Gemini sheet, in the pieces of schemas/house.ts. Sizes follow the drawing, scaled from its door, and
// stay in the bands for the building's type. A door is 1.95-2.7 m high, from UK leaves of 1981-2100 mm to tall public double doors
// (judged). Nothing thin may stand above the roof line, which Qwen's house did in thin spikes.
import type { Band, BuildingType } from './buildingideas.ts';
import { ROLES, THIN_M, touching, trianglesOf, type Piece } from './house.ts';

const STOREY_M: Band = [2.4, 5.5], ROOF_ALLOWANCE_M = 9, MOST_PIECES = 500, MOST_TRIS = 6000, ROOF_SLACK_M = 0.08, EDGE_M = 0.35, DOOR_H: Band = [1.95, 2.7];
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** How high the roofs stand at a point, or null if none covers it. */
function roofAt(roofs: Piece[], x: number, z: number): number | null {
  let top: number | null = null;
  for (const r of roofs) {
    // A panel stands just proud of a gable, so a point within reach of the roof's edge counts as under it.
    if (Math.abs(x - r.x) > r.w / 2 + EDGE_M || Math.abs(z - r.z) > r.l / 2 + EDGE_M) continue;
    const dx = Math.max(-1, Math.min(1, (x - r.x) / (r.w / 2))), dz = Math.max(-1, Math.min(1, (z - r.z) / (r.l / 2)));
    const across = r.ridge === 'x' ? dz : dx, peak = (r.peak ?? 0.5) * 2 - 1, rise = r.inset ? 1 : across < peak ? (across + 1) / (peak + 1 || 1) : peak === 1 ? 1 : (1 - across) / (1 - peak);
    const y = r.y + r.h * Math.min(1, rise);
    top = Math.max(top ?? -1, r.inset ? r.y + r.h : y);
  }
  return top;
}

export function drawnErrors(list: unknown, type: Pick<BuildingType, 'wide' | 'deep' | 'storeys'>, storeys: number): string[] {
  if (!Array.isArray(list)) return ['pieces must be an array'];
  const pieces = list as Piece[], out: string[] = [];
  if (pieces.length < 12 || pieces.length > MOST_PIECES) return [`${pieces.length} pieces: use 12-${MOST_PIECES}`];
  pieces.forEach((p, i) => {
    if (!p || !ROLES.includes(p.role)) { out.push(`piece ${i}: bad role`); return; }
    if (![p.x, p.y, p.z, p.w, p.h, p.l].every(num) || p.w <= 0 || p.h <= 0 || p.l <= 0 || p.y < -0.01) out.push(`piece ${i} (${p.role}): needs positive sizes, at or above the ground`);
    if (!/^#[0-9a-f]{6}$/i.test(p.color ?? '')) out.push(`piece ${i}: color as #rrggbb`);
    if (p.role === 'roof' && !p.inset && (!['x', 'z'].includes(p.ridge ?? '') || !num(p.peak) || p.peak < 0 || p.peak > 1)) out.push(`piece ${i}: a roof needs a ridge and peak, or an inset`);
    if (p.role === 'roof' && p.hip && p.hip > (p.ridge === 'x' ? p.w : p.l) / 2 + 0.01) out.push(`piece ${i}: hip longer than half the ridge`);
    if (p.role === 'roof' && p.inset && p.inset >= Math.min(p.w, p.l) / 2) out.push(`piece ${i}: inset leaves no top`);
    if (p.role !== 'roof' && (p.hip !== undefined || p.inset !== undefined || p.ridge !== undefined || p.peak !== undefined)) out.push(`piece ${i}: only a roof has those`);
    if (p.arch && Math.min(p.w, p.l) > THIN_M) out.push(`piece ${i}: an arch is for a thin panel`);
    if (p.arch && p.h <= Math.max(p.w, p.l) / 2) out.push(`piece ${i}: an arch needs more height than its half-width`);
    if (p.fall !== undefined && (p.l > THIN_M || Math.abs(p.fall) >= p.h)) out.push(`piece ${i}: bad fall`);
  });
  if (out.length) return out;
  const low = (f: (p: Piece) => number) => Math.min(...pieces.map(f)), high = (f: (p: Piece) => number) => Math.max(...pieces.map(f));
  const walled = pieces.filter((p) => p.role === 'wall'), span = (lo: (p: Piece) => number, hi: (p: Piece) => number) => Math.max(...walled.map(hi)) - Math.min(...walled.map(lo)); // the footprint is the walls, not the eaves and cornices
  const wide = span((p) => p.x - p.w / 2, (p) => p.x + p.w / 2), deep = span((p) => p.z - p.l / 2, (p) => p.z + p.l / 2), tall = high((p) => p.y + p.h);
  const within = (name: string, v: number, r: Band) => { if (v < r[0] || v > r[1]) out.push(`${v.toFixed(1)} m ${name}: must be ${r[0]}-${r[1]}`); };
  within('wide', wide, type.wide);
  within('deep', deep, type.deep);
  within('tall', tall, [storeys * STOREY_M[0], storeys * STOREY_M[1] + ROOF_ALLOWANCE_M]);
  const walls = pieces.filter((p) => p.role === 'wall'), roofs = pieces.filter((p) => p.role === 'roof');
  if (!walls.length || !roofs.length && !pieces.some((p) => p.role === 'trim' && p.y > 0)) out.push('needs walls and a top');
  const side = { front: high((p) => p.z), back: low((p) => p.z) };
  const panels = pieces.filter((p) => ['window', 'door', 'garage_door'].includes(p.role));
  for (const p of panels) {
    if (Math.min(p.w, p.l) > THIN_M) out.push(`a ${p.role} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} is a thin panel`);
    if (!pieces.some((w) => w !== p && (w.role === 'wall' || w.role === 'roof') && touching(p, w))) out.push(`a ${p.role} at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} must sit on a wall`);
    if (p.role === 'door' && (p.h < DOOR_H[0] || p.h > DOOR_H[1])) out.push(`a door ${p.h.toFixed(2)} m high: must be ${DOOR_H.join('-')} m`);
  }
  if (!pieces.some((p) => p.role === 'door' || p.role === 'garage_door')) out.push('needs a door');
  if (!pieces.some((p) => p.role === 'window' && p.l <= THIN_M && p.z > (side.front + side.back) / 2) || !pieces.some((p) => p.role === 'window' && p.l <= THIN_M && p.z < (side.front + side.back) / 2)) out.push('needs windows front and back');
  for (const p of pieces) { // the spike check: anything thin must stay under the roof over it
    if (p.role === 'roof' || p.role === 'wall' || Math.min(p.w, p.l) > THIN_M) continue;
    const drop = p.fall ?? 0, ends = p.w > p.l ? [[p.x - p.w / 2 + 0.01, p.z, Math.max(0, -drop)], [p.x + p.w / 2 - 0.01, p.z, Math.max(0, drop)]] : [p.z - p.l / 2 + 0.01, p.z + p.l / 2 - 0.01].map((z) => [p.x, z, 0]); // a raked panel is only tallest at one end
    for (const [x, z, low] of ends) { const top = p.y + p.h - low, roof = roofAt(roofs, x, z), wall = Math.max(...walls.filter((w) => Math.abs(x - w.x) <= w.w / 2 + 0.3 && Math.abs(z - w.z) <= w.l / 2 + 0.3).map((w) => w.y + w.h), 0); if (p.h > 0.5 && roof !== null && top > Math.max(roof, wall) + ROOF_SLACK_M + 0.5) out.push(`a thin ${p.role} at ${x.toFixed(1)}, ${z.toFixed(1)} stands ${(top - roof).toFixed(1)} m over the roof`); }
  }
  const seen = new Set([0]), todo = [0];
  while (todo.length) { const a = todo.pop()!; pieces.forEach((b, i) => { if (!seen.has(i) && touching(pieces[a], b)) { seen.add(i); todo.push(i); } }); }
  if (seen.size !== pieces.length) out.push(`pieces float apart: ${pieces.map((_, i) => i).filter((i) => !seen.has(i)).slice(0, 6).map((i) => `${i} ${pieces[i].role} at ${pieces[i].x.toFixed(1)},${pieces[i].y.toFixed(1)},${pieces[i].z.toFixed(1)}`).join('; ')}`);
  if (trianglesOf(pieces) > MOST_TRIS) out.push(`${trianglesOf(pieces)} triangles: at most ${MOST_TRIS}`);
  return out;
}
