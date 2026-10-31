// Kingsley Market Hall, from drawings/sheets/place_market.png. 28 px to the metre, from its 2.1 m doors, so 21.5 x 19 m: a brick hall of
// arches with a stepped clock gable. North lights run front to back. The side view draws them sloping along the hall, and the sheet's
// eaves differ from front to side, so the front and back win. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#a86650', ARCH = '#96563f', STONE = '#d5c6a4', GLASS = '#8ea2b2', DARK = '#3d4a56', LIGHT = '#a4b8c6', ROOF = '#7f96a8', WHITE = '#f4f4ef', DOOR = '#6f7f8c', FLAT = '#8a9aa8';
const W = 21.5, D = 19, EAVES = 7.1, TEETH = 6, TOOTH_H = 1.25, DEEP_G = 0.7;
const px = (p: number) => (p - 42) / 28, py = (p: number) => (372 - p) / 28, sz = (p: number) => -(p - 780) / 28, bx = (p: number) => W - (p - 42) / 28, by = (p: number) => (757 - p) / 28;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-0.03, W + 0.03, 0, py(348), -D - 0.03, 0.03, STONE);
k.trim(-0.1, W + 0.1, EAVES, EAVES + 0.12, -D - 0.1, 0.1, STONE);
k.slope(0, W, EAVES, 0.05, -D, 0, FLAT, 0.1);

// The north lights.
for (let i = 0; i < TEETH; i++) { const x0 = (i * W) / TEETH, x1 = ((i + 1) * W) / TEETH; k.roof(x0, x1, EAVES + 0.12, TOOTH_H, -D + 0.2, -DEEP_G, ROOF, 'z', { peak: 0.2 }); k.roof(x0, x1, EAVES + 0.12, TOOTH_H - 0.08, -DEEP_G, -DEEP_G + 0.04, LIGHT, 'z', { peak: 0.2, hip: 0.001 }); k.roof(x0, x1, EAVES + 0.12, TOOTH_H - 0.08, -D + 0.16, -D + 0.2, LIGHT, 'z', { peak: 0.2, hip: 0.001 }); }

// The gables: front and back, stepped, with sloping shoulders.
function gable(z0: number, z1: number) {
  k.roof(px(172), px(510), EAVES + 0.1, py(112) - EAVES - 0.1, z0, z1, BRICK, 'z', { hip: 0.001 });
  k.wall(px(275), px(410), EAVES, py(70), z0, z1, BRICK);
  k.wall(px(293), px(392), py(70), py(47), z0, z1, BRICK);
  k.wall(px(310), px(375), py(47), py(14), z0, z1, BRICK);
  for (const [a, b, y] of [[272, 413, 70], [290, 395, 47], [307, 378, 14]]) k.trim(px(a), px(b), py(y), py(y) + 0.12, z0 - 0.04, z1 + 0.04, STONE);
}
gable(-DEEP_G, 0);
gable(-D, -D + DEEP_G);

// The clock, built up in rounds of panel.
const CX = px(343.5), CY = py(137), R = 0.96;
front.panel('trim', px(293), px(392), py(190), py(70), 1, ARCH);
for (const [w, h] of [[0.5, 1], [0.78, 0.88], [0.92, 0.7], [1, 0.42]]) { front.panel('trim', CX - w * (R + 0.08), CX + w * (R + 0.08), CY - h * (R + 0.08), CY + h * (R + 0.08), 2, DARK); front.panel('trim', CX - w * R, CX + w * R, CY - h * R, CY + h * R, 3, WHITE); }
front.panel('trim', CX - 0.03, CX + 0.03, CY - 0.05, CY + 0.72, 4, DARK);
front.panel('trim', CX - 0.03, CX + 0.55, CY - 0.03, CY + 0.03, 4, DARK);

/** An arch: a brick ring, then glass with a dark transom, or a door in it. */
function arch(f: ReturnType<typeof k.face>, a0: number, a1: number, top: number, door: boolean, glass = true) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), m = (lo + hi) / 2;
  f.panel('trim', lo - 0.33, hi + 0.33, py(348), top + 0.33, 1, ARCH, { arch: true });
  if (!glass) { f.panel('trim', lo, hi, py(348), top, 2, BRICK, { arch: true }); return; }
  f.panel('trim', lo, hi, door ? 0 : py(348), top, 2, DARK, { arch: true });
  f.panel('window', lo + 0.06, hi - 0.06, door ? 2.25 : py(348) + 0.06, top - 0.06, 3, GLASS, { arch: true });
  f.panel('trim', lo + 0.06, hi - 0.06, py(292), py(278), 4, DARK);
  f.panel('trim', m - 0.04, m + 0.04, door ? 2.25 : py(348), top - 0.1, 4, DARK);
  if (door) { f.panel('door', m - 0.75, m - 0.03, 0.02, 2.15, 3, DOOR); f.panel('door', m + 0.03, m + 0.75, 0.02, 2.15, 3, DOOR); }
}
for (const [a, b, door] of [[72, 148, false], [185, 266, true], [304, 382, false], [420, 500, true], [540, 612, false]] as const) arch(front, px(a), px(b), py(232), door);
for (const [a, b, door] of [[70, 135, false], [165, 230, true], [262, 326, false], [358, 422, false], [455, 520, true], [550, 614, false]] as const) arch(back, bx(b), bx(a), by(612), door);
for (const f of [right, left]) {
  arch(f, sz(795), sz(865), py(248), true);
  arch(f, sz(898), sz(970), py(248), false);
  for (const [a, b] of [[1003, 1080], [1112, 1185], [1218, 1290]]) arch(f, sz(a), sz(b), py(248), false, false);
}

export const building: Drawn = {
  id: 'kingsley_market_hall', type: 'place_market', name: 'Kingsley Market Hall', storeys: 1, span: W, pieces: k.pieces,
  sheet: { file: 'place_market', front: { px0: 42, ground: 372, m: 28 }, side: { px0: 780, ground: 372, m: 28 }, back: { px0: 42, ground: 757, m: 28 }, top: { px0: 785, ground: 738, m: 25 } },
};
