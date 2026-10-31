// Bluebell Terrace, from drawings/sheets/style_painted_terrace.png. 42 px to the metre, from its 2.1 m doors, so 14.2 x 9.1 m. A pair of
// homes under one ridge, with a cross gable and bay over each end. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const RENDER = '#bcd4b6', TILE = '#b5564a', WHITE = '#f4f4f0', FRAME = '#67727d', GLASS = '#b4c5d3', PLINTH = '#c3c8cc', PIPE = '#9aa3ab', BLUE = '#4f88c6', YELLOW = '#e8d55a', GREY = '#a9b1b9', HOOD = '#747d86';
const W = 14.25, D = 9.1, EAVES = 5.3, RIDGE = 8.65, OVER = 0.28, GABLE = 7.74;
const px = (p: number) => (p - 52) / 42, py = (p: number) => (373 - p) / 42, sz = (p: number) => -(p - 870) / 42, bx = (p: number) => W - (p - 52) / 42, by = (p: number) => (742 - p) / 42;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, RENDER);
k.trim(-0.03, W + 0.03, 0, 0.26, -D - 0.03, 0.03, PLINTH);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, TILE, 'x');
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, WHITE);
for (const f of [front, back]) f.panel('trim', px(349), px(353), 0.26, EAVES, 1, PIPE);

// The cross gables, each with white bargeboards.
for (const [a, b] of [[65, 228], [475, 638]]) {
  const x0 = px(a), x1 = px(b), mid = (x0 + x1) / 2, face = k.face('front', 0.3);
  k.wall(x0 + 0.1, x1 - 0.1, EAVES - 0.2, EAVES, -0.2, 0.3, RENDER);
  k.roof(x0, x1, EAVES, GABLE - EAVES, -3.4, 0.3, TILE, 'z');
  k.trim(x0 + 0.1, x1 - 0.1, EAVES - 0.14, EAVES, 0, 0.32, WHITE);
  face.rake(x0, mid, EAVES, GABLE - 0.1, 0.2, WHITE);
  face.rake(mid, x1, GABLE - 0.1, EAVES, 0.2, WHITE);
}

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 2, rows = 2, layer = 2) => { f.sash(a0, a1, y0, y1, { cols, rows, frame: FRAME, glass: GLASS, bar: 0.05 }, layer); f.panel('trim', Math.min(a0, a1) - 0.08, Math.max(a0, a1) + 0.08, y0 - 0.1, y0, layer, WHITE); };

// The upper floor, with stone heads over the two big windows.
for (const a of [120, 528]) { sash(front, px(a), px(a + 55), py(217), py(158)); front.panel('trim', px(a - 5), px(a + 60), py(158), py(147), 1, WHITE); }
for (const a of [254, 410]) sash(front, px(a), px(a + 38), py(217), py(158));
for (const a of [309, 368]) sash(front, px(a), px(a + 24), py(316), py(270));

// The bays, doors and hoods.
for (const a of [85, 488]) {
  const x0 = px(a), x1 = px(a + 125), out = k.face('front', 0.7);
  k.wall(x0, x1, 0, py(262), 0, 0.7, RENDER);
  k.slope(x0 - 0.1, x1 + 0.1, py(262), 0.24, -0.05, 0.82, HOOD, 0.08);
  out.sash(x0 + 0.2, x1 - 0.2, py(330), py(268), { cols: 3, rows: 1, frame: FRAME, glass: GLASS, bar: 0.1 });
  k.trim(x0, x1, py(340), py(330), 0.7, 0.75, WHITE);
}
for (const [a, color] of [[247, BLUE], [416, YELLOW]] as const) {
  front.panel('door', px(a), px(a + 38), 0.27, 2.37, 2, color);
  front.panel('trim', px(a) - 0.05, px(a + 38) + 0.05, 0.27, 2.42, 1, WHITE);
  k.trim(px(a - 18), px(a + 58), 2.6, 2.74, 0, 0.5, HOOD);
  k.trim(px(a - 18), px(a + 58), 0, 0.14, 0, 0.5, PLINTH);
}

// The back and sides.
for (const a of [97, 240, 392, 534]) sash(back, bx(a), bx(a + 72), by(602), by(542));
for (const a of [84, 284, 378, 578]) sash(back, bx(a), bx(a + 40), by(692), by(654));
for (const a of [147, 225, 441, 519]) { back.panel('trim', bx(a + 37) - 0.05, bx(a) + 0.05, 0.26, 2.42, 1, FRAME); back.panel('door', bx(a + 35), bx(a + 2), 0.26, 2.36, 2, GREY); }
for (const f of [right, left]) for (const [y0, y1] of [[205, 157], [316, 270]]) sash(f, sz(1078), sz(1110), py(y0), py(y1));
for (const [x, z] of [[-0.1, -0.4], [W, -0.4], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, EAVES - 0.1, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'bluebell_terrace', type: 'style_painted_terrace', name: 'Bluebell Terrace', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_painted_terrace', front: { px0: 52, ground: 373, m: 42 }, side: { px0: 870, ground: 373, m: 42 }, back: { px0: 52, ground: 742, m: 42 }, top: { px0: 770, ground: 700, m: 42 } },
};
