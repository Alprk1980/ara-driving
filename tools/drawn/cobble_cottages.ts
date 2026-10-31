// Cobble Cottages, from drawings/sheets/style_pebble_cottages.png. 35.7 px to the metre, from their 2.1 m doors, so 15.2 x 9.3 m: wider than
// the idea's 12, as the drawing's windows need it. A pair under one hipped roof, with a low lean-to across the back. The left side isn't
// drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const DASH = '#f1ead2', STONE = '#b8b09a', COBBLE = '#a9a596', SLATE = '#7f8b97', CREAM = '#f4efdc', FRAME = '#7d6242', GLASS = '#afc0cc', DOOR = '#b3a98b', BRICK = '#a8543f', PIPE = '#6f7780', PAVING = '#c2bba6';
const W = 15.2, D = 9.3, EAVES = 5.24, RIDGE = 9.9, OVER = 0.28;
const px = (p: number) => (p - 75) / 35.7, py = (p: number) => (365 - p) / 35.7, sz = (p: number) => -(p - 875) / 35.7, bx = (p: number) => W - (p - 75) / 35.7, by = (p: number) => (755 - p) / 35.7;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, DASH);
k.trim(-0.05, W + 0.05, 0, 0.3, -D - 0.05, 0.05, COBBLE);
k.trim(-1.5, W + 1.5, 0, 0.1, -D - 2.2, 1.2, PAVING); // the flagged path round them
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, STONE);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, SLATE, 'x', { hip: 4.1 });
k.wall(px(330), px(365), 9, 10.3, -5.6, -4.6, BRICK); // the stack through the ridge
k.trim(px(328), px(367), 10.3, 10.42, -5.65, -4.55, STONE);
for (const d of [-0.2, 0.2]) k.trim(px(347.5) + d - 0.1, px(347.5) + d + 0.1, 10.42, 10.75, -5.2, -5, BRICK);
for (const f of [front, back]) f.panel('trim', px(345), px(349), 0.3, EAVES, 1, PIPE);
for (const f of [right, left]) for (const [a, b] of [[0, -0.36], [-D + 0.36, -D]]) for (let y = 0.3; y < EAVES - 0.5; y += 0.84) f.panel('trim', a, b, y, y + 0.42, 1, STONE); // the quoins

// The dormers, gabled and cream, front and back.
const dormer = (f: ReturnType<typeof k.face>, a: number, b: number, y0: number, y1: number) => f.dormer(a, b, y0, y1, CREAM, SLATE, { cols: 2, rows: 2, frame: FRAME, glass: GLASS, bar: 0.05 }, 1.4, 0.7);
for (const a of [205, 428]) { dormer(k.face('front', -0.95), px(a), px(a + 60), py(135), py(75)); dormer(k.face('back', -D + 0.95), bx(a + 60), bx(a), by(530), by(470)); }

/** A window with a stone head and cill. */
function light(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 2) {
  f.sash(a0, a1, y0, y1, { cols, rows: 2, frame: FRAME, glass: GLASS, bar: 0.05 });
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  f.panel('trim', lo - 0.14, hi + 0.14, y1, y1 + 0.26, 1, STONE);
  f.panel('trim', lo - 0.08, hi + 0.08, y0 - 0.14, y0, 1, STONE);
}
for (const a of [128, 236, 412, 522]) light(front, px(a), px(a + 44), py(237), py(197));
for (const a of [128, 522]) light(front, px(a), px(a + 44), py(333), py(290));
for (const a of [303, 370]) light(front, px(a), px(a + 20), py(318), py(290), 1);

/** The doors, in their rough stone surrounds. */
function door(f: ReturnType<typeof k.face>, a0: number, a1: number, layer = 1) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  f.panel('trim', lo - 0.45, hi + 0.45, 0.1, 2.35, layer, STONE);
  f.panel('trim', lo - 0.55, hi + 0.55, 2.35, 2.6, layer, STONE);
  f.panel('door', lo, hi, 0.1, 2.2, layer + 1, DOOR);
  f.panel('window', lo + 0.4, hi - 0.4, 1.6, 1.9, layer + 2, GLASS);
}
for (const a of [234, 412]) door(front, px(a), px(a + 39));

// The lean-to across the back.
const B0 = bx(495), B1 = bx(200), OUT = 1.5, lean = k.face('back', -D - OUT);
k.wall(B0, B1, 0, by(660), -D - OUT, -D, DASH);
k.roof(B0 - 0.1, B1 + 0.1, by(660), by(630) - by(660), -D - OUT - 0.2, -D, SLATE, 'x', { peak: 1 });
k.trim(B0 - 0.1, B1 + 0.1, by(660) - 0.1, by(660), -D - OUT - 0.2, -D - OUT, STONE);
k.trim(B0, B1, 0, 0.3, -D - OUT - 0.04, -D - OUT, COBBLE);
for (const a of [125, 256, 392, 524]) light(back, bx(a + 45), bx(a), by(624), by(586));
for (const a of [122, 520]) light(back, bx(a + 53), bx(a), by(715), by(675));
for (const a of [227, 428]) door(lean, bx(a + 38), bx(a));
for (const a of [298, 372]) light(lean, bx(a + 22), bx(a), by(705), by(672), 1);

for (const f of [right, left]) for (const [y0, y1] of [[227, 197], [320, 290]]) light(f, sz(1053), sz(1030), py(y0), py(y1));

export const building: Drawn = {
  id: 'cobble_cottages', type: 'style_pebble_cottages', name: 'Cobble Cottages', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_pebble_cottages', front: { px0: 75, ground: 365, m: 35.7 }, side: { px0: 875, ground: 365, m: 35.7 }, back: { px0: 75, ground: 755, m: 35.7 }, top: { px0: 790, ground: 708, m: 33 } },
};
