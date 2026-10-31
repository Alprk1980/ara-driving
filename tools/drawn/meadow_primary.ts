// Meadow Primary, from drawings/sheets/place_school.png. 34 px to the metre, from its 2.1 m doors, so 18.2 x 14 m: a small village school,
// well under the idea's 36 m. The plan draws a courtyard the elevations don't show, so the block is solid. Tile-hung gables on the
// front and right, a veranda across the front, and a clock cupola on the ridge. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#d4b676', TILE = '#a95a48', HUNG = '#a0523f', WHITE = '#f4f2ea', RED = '#b5533f', FRAME = '#5a6470', GLASS = '#b0c4d2', DOOR = '#6f7a85', LEAD = '#6d7680', PIPE = '#a8b0b8';
const W = 18.2, D = 14, EAVES = 5.2, RIDGE = 8.2, OVER = 0.3, BAND = 3.2;
const px = (p: number) => (p - 38) / 34, py = (p: number) => (373 - p) / 34, sz = (p: number) => -(p - 832) / 34, bx = (p: number) => W - (p - 40) / 34, by = (p: number) => (738 - p) / 34;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, WHITE);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, TILE, 'x', { hip: 3.4 });

// The hung tile: both front wings, and the back and side upper floors.
for (const [a, b] of [[38, 222], [465, 650]]) front.panel('trim', px(a), px(b), BAND, EAVES - 0.14, 1, HUNG);
back.panel('trim', 0, W, BAND - 0.4, EAVES - 0.14, 1, HUNG);
for (const f of [right, left]) f.panel('trim', 0, -D * 0.8, BAND, EAVES - 0.14, 1, HUNG);

// The gables.
for (const [a, b] of [[28, 225], [460, 660]]) {
  const x0 = px(a), x1 = px(b), mid = (x0 + x1) / 2, f = k.face('front', 0.35);
  k.roof(x0, x1, EAVES, RIDGE - EAVES, -5, 0.3, TILE, 'z');
  k.roof(x0, x1, EAVES, RIDGE - EAVES, 0.3, 0.33, HUNG, 'z', { hip: 0.001 });
  k.trim(x0, x1, EAVES - 0.14, EAVES, 0, 0.34, WHITE);
  f.rake(x0, mid, EAVES, RIDGE - 0.1, 0.2, WHITE);
  f.rake(mid, x1, RIDGE - 0.1, EAVES, 0.2, WHITE);
}
for (const [x0, x1, out] of [[12, W + OVER, 1], [-OVER, 6, -1]] as const) {
  k.roof(x0, x1, EAVES, RIDGE - EAVES, sz(1130), sz(925), TILE, 'x');
  const end = out > 0 ? x1 : x0 - 0.03;
  k.roof(end, end + 0.03, EAVES, RIDGE - EAVES, sz(1130), sz(925), HUNG, 'x', { hip: 0.001 });
}

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 2, rows = 2) => f.sash(Math.min(a0, a1), Math.max(a0, a1), y0, y1, { cols, rows, frame: FRAME, glass: GLASS, bar: 0.05 });

// The upper floor, then the veranda and what's under it.
for (const a of [75, 136, 503, 565]) sash(front, px(a), px(a + 46), py(260), py(191), 2, 3);
for (const a of [236, 318, 398]) sash(front, px(a), px(a + 52), py(260), py(200), 3, 2);
k.roof(0, W, py(302), py(268) - py(302), 0, 2, TILE, 'x', { peak: 0 });
k.trim(0, W, py(308), py(302), 0, 2, WHITE);
for (const a of [40, 124, 208, 295, 378, 462, 550, 635]) k.trim(px(a), px(a + 12), 0, py(308), 1.6, 1.9, RED);
for (const a of [75, 565]) sash(front, px(a), px(a + 46), py(347), py(305), 2, 2);
for (const a of [165, 503]) { front.panel('trim', px(a) - 0.03, px(a + 20) + 0.03, 0, 2.2, 1, FRAME); front.panel('door', px(a), px(a + 20), 0, 2.15, 2, DOOR); }
for (const a of [243, 322, 403]) { front.panel('trim', px(a), px(a + 42), 0, 2.2, 1, FRAME); front.panel('door', px(a + 2), px(a + 20), 0.02, 2.15, 2, GLASS); front.panel('door', px(a + 22), px(a + 40), 0.02, 2.15, 2, GLASS); }

// The tall windows on the right, and the left as their mirror.
for (const f of [right, left]) for (const [a, b, c] of [[963, 1010, 3], [1046, 1093, 3], [1135, 1167, 2]] as const) sash(f, sz(a), sz(b), py(348), py(198), c, 5);

// The back.
for (const [a, b] of [[80, 122], [160, 195], [262, 320], [367, 425], [492, 526], [565, 608]]) sash(back, bx(b), bx(a), by(627), by(585), b - a > 50 ? 3 : 2, 1);
for (const [a, b] of [[160, 195], [262, 320], [367, 425], [492, 526]]) sash(back, bx(b), bx(a), by(707), by(665), b - a > 50 ? 3 : 2, 1);
for (const a of [78, 562]) { back.panel('trim', bx(a + 46), bx(a - 2), 0, 2.2, 1, FRAME); back.panel('door', bx(a + 44), bx(a), 0, 2.15, 2, GLASS); }

// The cupola and its clock.
const C = (px(322) + px(365)) / 2, Z = -5.76, HALF = 0.62, face = k.face('front', Z + HALF), rear = k.face('back', Z - HALF);
k.trim(C - 0.75, C + 0.75, RIDGE - 0.6, RIDGE + 0.1, Z - 0.75, Z + 0.75, LEAD);
k.wall(C - HALF, C + HALF, RIDGE + 0.1, py(50), Z - HALF, Z + HALF, WHITE);
k.roof(C - 0.75, C + 0.75, py(50), 0.82, Z - 0.75, Z + 0.75, TILE, 'x', { hip: 0.74 });
k.trim(C - 0.03, C + 0.03, py(50) + 0.75, py(50) + 1.2, Z - 0.03, Z + 0.03, LEAD);
for (const f of [face, rear]) { f.panel('trim', C - 0.36, C + 0.36, py(84), py(58), 1, LEAD, { arch: false }); f.panel('trim', C - 0.31, C + 0.31, py(83), py(59), 2, WHITE); f.panel('trim', C - 0.02, C + 0.02, py(71), py(62), 3, LEAD); f.panel('trim', C - 0.02, C + 0.2, py(71), py(70), 3, LEAD); }

export const building: Drawn = {
  id: 'meadow_primary', type: 'place_school', name: 'Meadow Primary', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'place_school', front: { px0: 38, ground: 373, m: 34 }, side: { px0: 832, ground: 373, m: 34 }, back: { px0: 40, ground: 738, m: 34 }, top: { px0: 748, ground: 735, m: 31 } },
};
