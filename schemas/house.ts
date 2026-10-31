// A building written out as parts, by Qwen reading a drawing, and held here to the drawing's sizes: nothing floats, windows sit
// on walls, and it stays cheap. x runs left to right across the front, y up, z out of the front, all in metres. Pieces are
// plain boxes, or roofs: a prism with its ridge along x or z, `peak` saying where across it the ridge stands, 0.5 for a
// centred gable and 0 or 1 for a lean-to. A thin panel on the front or back can take `fall`: its top edge slopes down by that many
// metres to the right (negative: to the left), so glass and cladding can follow a gable. A roof can take `hip`, how far its ridge stops
// short of each end, or `inset`, how far its flat top stands in from every edge, which makes a mansard's lower slope. A thin panel can
// take `arch` for a round top, and `shear` makes a fall tilt its bottom edge too, which draws a diagonal brace.
export const ROLES = ['wall', 'roof', 'window', 'door', 'garage_door', 'trim'] as const;
export type Piece = { role: (typeof ROLES)[number]; x: number; y: number; z: number; w: number; h: number; l: number; color: string; ridge?: 'x' | 'z'; peak?: number; fall?: number; hip?: number; inset?: number; arch?: boolean; shear?: boolean }; // x and z are the centre, y the base; y + h is the highest corner
type Range = [number, number];
export type HouseSize = { wide: Range; tall: Range; deep: Range; triangles: number; pieces?: number; mainRoofShare?: Range; eaves?: Range; frontWindows?: number; backWindows?: number; gableMain?: boolean; wingShed?: boolean; rakedWindow?: boolean; door?: { h: Range; w: Range }; garage?: { h: Range; w: Range } }; // measured off the drawing: how much of the front the main roof spans, how high its eaves are as a share of the ridge, the glass front and back, the roof forms and real opening sizes

// The drawing the house is built from. Its stated sizes are 12 m across and 8.2 m tall, and they disagree with its own proportions
// (0.60 tall to wide). Held to 8.2 m tall, its front door comes out 2.03 m high and its figures 1.66 m, so the height is the true one,
// which makes the front 13.6 m. At 12 m wide the door would be 1.8 m, shorter than any door sold.
// Doors: UK external leaves run 1981-2100 mm by 813-900 mm (supplier tables). Garage: 1981-2134 mm is the usual height; this drawing's is
// a tall 2.5 m by 3.7 m, so the range stops just above it. The views disagree about depth. The side elevation is drawn in false perspective,
// showing the front gable it could not see square-on, so its true front corner is where the eaves begin: 10 m to the back wall, and a
// porch of about 1.45 m. The top view is squashed and is not used. The top view's wing ridge and the back view's roof band contradict the front and side, and are not followed.
export const DRAWN_HOUSE: HouseSize = { wide: [13, 14.5], tall: [7.8, 8.6], deep: [11, 13], triangles: 1450, pieces: 120, mainRoofShare: [0.58, 0.72], eaves: [0.68, 0.78], frontWindows: 5, backWindows: 5, gableMain: true, wingShed: true, rakedWindow: true, door: { h: [1.95, 2.15], w: [0.75, 1] }, garage: { h: [1.95, 2.6], w: [2.1, 4.3] } };

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const THIN_M = 0.3;
const TOUCH_M = 0.16, BOX_TRIS = 12, ROOF_TRIS = 8, ARCH_TRIS = 28;

export const trianglesOf = (pieces: Piece[]) => pieces.reduce((n, p) => n + (p.role === 'roof' ? ROOF_TRIS : p.arch ? ARCH_TRIS : BOX_TRIS), 0);

export const touching = (a: Piece, b: Piece) => Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + TOUCH_M && Math.abs(a.z - b.z) <= (a.l + b.l) / 2 + TOUCH_M && a.y <= b.y + b.h + TOUCH_M && b.y <= a.y + a.h + TOUCH_M;

export function houseErrors(list: unknown, size: HouseSize): string[] {
  if (!Array.isArray(list)) return ['answer with a JSON array of pieces'];
  const most = size.pieces ?? 80;
  if (list.length < 12 || list.length > most) return [`${list.length} pieces: use 12-${most}`];
  const pieces = list as Piece[], out: string[] = [];
  pieces.forEach((p, i) => {
    if (!p || !ROLES.includes(p.role)) { out.push(`piece ${i}: role must be one of ${ROLES.join(', ')}`); return; }
    if (![p.x, p.y, p.z, p.w, p.h, p.l].every(num) || p.w <= 0 || p.h <= 0 || p.l <= 0 || p.y < -0.01) out.push(`piece ${i}: needs x, y, z, and positive w, h, l, with y at least 0`);
    if (!/^#[0-9a-f]{6}$/i.test(p.color ?? '')) out.push(`piece ${i}: color as #rrggbb`);
    if (p.role === 'roof' && (!['x', 'z'].includes(p.ridge ?? '') || !num(p.peak) || p.peak < 0 || p.peak > 1)) out.push(`piece ${i}: a roof needs ridge "x" or "z" and peak 0-1`);
    if (p.role !== 'roof' && (p.ridge !== undefined || p.peak !== undefined)) out.push(`piece ${i}: only a roof has ridge and peak`);
    if (p.fall !== undefined && (!num(p.fall) || p.l > THIN_M || p.role === 'wall' || p.role === 'roof' || Math.abs(p.fall) >= p.h)) out.push(`piece ${i}: fall is for a thin panel on the front or back, and must be less than its height`);
  });
  if (out.length) return out;
  const span = (lo: (p: Piece) => number, hi: (p: Piece) => number) => Math.max(...pieces.map(hi)) - Math.min(...pieces.map(lo));
  const wide = span((p) => p.x - p.w / 2, (p) => p.x + p.w / 2), deep = span((p) => p.z - p.l / 2, (p) => p.z + p.l / 2), tall = Math.max(...pieces.map((p) => p.y + p.h));
  const within = (name: string, v: number, r: [number, number]) => { if (v < r[0] || v > r[1]) out.push(`the house is ${v.toFixed(1)} m ${name}: it must be ${r[0]}-${r[1]} m`); };
  within('wide', wide, size.wide);
  within('tall', tall, size.tall);
  within('deep', deep, size.deep);
  const count = (r: Piece['role']) => pieces.filter((p) => p.role === r).length;
  if (count('wall') < 2) out.push('at least 2 walls: the main house and the garage wing');
  if (count('roof') < 2) out.push('at least 2 roofs: the main house and the garage wing');
  if (count('window') < 5) out.push('at least 5 windows');
  if (count('door') < 2) out.push('at least 2 doors: the front door and the side door');
  if (count('garage_door') !== 1) out.push('exactly 1 garage_door');
  const walls = pieces.filter((p) => p.role === 'wall');
  pieces.forEach((p, i) => {
    if (['window', 'door', 'garage_door'].includes(p.role)) {
      if (Math.min(p.w, p.l) > THIN_M) out.push(`piece ${i}: a ${p.role} is a thin panel, under ${THIN_M} m thick`);
      if (!walls.some((w) => touching(p, w))) out.push(`piece ${i}: a ${p.role} must sit on a wall`);
    }
    if (p.role === 'roof' && !pieces.some((w) => w !== p && w.role !== 'roof' && Math.abs(w.y + w.h - p.y) <= TOUCH_M + 0.3 && touching(p, w))) out.push(`piece ${i}: a roof must sit on top of a wall`);
  });
  const roofTops = pieces.filter((p) => p.role === 'roof').map((p) => p.y + p.h).sort((a, b) => b - a);
  if (roofTops.length >= 2 && roofTops[0] - roofTops.at(-1)! < 1) out.push('the garage wing roof must be at least 1 m lower than the main roof');
  const main = pieces.filter((p) => p.role === 'roof').sort((a, b) => b.y + b.h - (a.y + a.h))[0], left = Math.min(...pieces.map((p) => p.x - p.w / 2));
  if (main && size.mainRoofShare && (main.w / wide < size.mainRoofShare[0] || main.w / wide > size.mainRoofShare[1])) out.push(`the main roof spans ${Math.round((main.w / wide) * 100)}% of the front: it must span ${size.mainRoofShare.map((v) => Math.round(v * 100)).join('-')}%, on the left, with the garage wing to its right`);
  if (main && size.eaves && (main.y / tall < size.eaves[0] || main.y / tall > size.eaves[1])) out.push(`the main eaves are ${Math.round((main.y / tall) * 100)}% of the height: they must be ${size.eaves.map((v) => Math.round(v * 100)).join('-')}%`);
  if (main && main.x - main.w / 2 > left + 1) out.push('the main house stands at the left of the front');
  const front = Math.max(...pieces.map((p) => p.z + p.l / 2)), rear = Math.min(...pieces.map((p) => p.z - p.l / 2)), onFront = (p: Piece) => p.role === 'window' && p.l <= THIN_M && p.z + p.l / 2 > front - 2.5;
  if (size.frontWindows && pieces.filter(onFront).length < size.frontWindows) out.push(`at least ${size.frontWindows} window panes on the front`);
  if (size.backWindows && pieces.filter((p) => p.role === 'window' && p.l <= THIN_M && p.z - p.l / 2 < rear + 2.5).length < size.backWindows) out.push(`at least ${size.backWindows} window panes on the back`);
  if (size.rakedWindow && !pieces.some((p) => onFront(p) && p.fall)) out.push('the tall window on the front follows the gable: give its top panes a fall');
  if (main && size.gableMain && (main.ridge !== 'z' || main.peak! < 0.4 || main.peak! > 0.6)) out.push('the main roof is a centred gable facing the front: ridge "z", peak about 0.5');
  if (size.wingShed) for (const r of pieces.filter((p) => p.role === 'roof' && p !== main)) if (r.ridge !== 'z' || r.peak! > 0.1) out.push('the wing roof is one slope, high against the house and falling to the right: ridge "z", peak 0');
  const opening = (p: Piece, name: string, want: { h: Range; w: Range }) => { const across = Math.max(p.w, p.l); if (p.h < want.h[0] || p.h > want.h[1] || across < want.w[0] || across > want.w[1]) out.push(`a ${name} of ${across.toFixed(2)} × ${p.h.toFixed(2)} m: it must be ${want.w[0]}-${want.w[1]} m wide and ${want.h[0]}-${want.h[1]} m high`); };
  for (const p of pieces) { if (size.door && p.role === 'door') opening(p, 'door', size.door); if (size.garage && p.role === 'garage_door') opening(p, 'garage door', size.garage); }
  const seen = new Set([0]), todo = [0]; // everything joined up, so nothing floats
  while (todo.length) { const a = todo.pop()!; pieces.forEach((b, i) => { if (!seen.has(i) && touching(pieces[a], b)) { seen.add(i); todo.push(i); } }); }
  if (seen.size !== pieces.length) out.push(`pieces float apart: ${pieces.map((_, i) => i).filter((i) => !seen.has(i)).slice(0, 8).join(', ')} touch nothing`);
  if (trianglesOf(pieces) > size.triangles) out.push(`${trianglesOf(pieces)} triangles: at most ${size.triangles}`);
  return out;
}
