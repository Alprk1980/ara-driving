// Writes src/data/drawnfoot.json from the drawn buildings: what the town needs to site one, without loading its pieces. The solid is
// what stands at ground level (walls, posts, steps), so a car stops at a porch post but can pass under a balcony.
//   node tools/drawn/index.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Piece } from '../../schemas/house.ts';

const GROUND_M = 2.2, FLAT_M = 0.2; // above this a piece is overhead; under that it's paving
const DIR = 'src/data/drawn', styles = JSON.parse(readFileSync('src/data/buildingstyles.json', 'utf8')) as { id: string; district: string }[];
const out = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => {
  const b = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as { id: string; type: string; pieces: Piece[] };
  const solid = b.pieces.filter((p) => p.role !== 'roof' && p.y < GROUND_M && p.h >= FLAT_M);
  const x0 = Math.min(...solid.map((p) => p.x - p.w / 2)), x1 = Math.max(...solid.map((p) => p.x + p.w / 2)), z0 = Math.min(...solid.map((p) => p.z - p.l / 2)), z1 = Math.max(...solid.map((p) => p.z + p.l / 2));
  const round = (n: number) => Math.round(n * 100) / 100;
  return { id: b.id, type: b.type, district: styles.find((s) => `style_${s.id}` === b.type)?.district, kind: b.type.startsWith('place_') ? b.type.slice(6) : undefined, service: b.type.startsWith('station_') ? b.type.slice(8) : undefined, cx: round((x0 + x1) / 2), cz: round((z0 + z1) / 2), w: round(x1 - x0), d: round(z1 - z0), h: round(Math.max(...b.pieces.map((p) => p.y + p.h))) };
});
writeFileSync('src/data/drawnfoot.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.length} footprints`);
