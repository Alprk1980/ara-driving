// Kiln Row, from drawings/sheets/style_high_street_brick.png. 34 px to the metre, from its 2.1 m side door, so 8.6 x 12.8 m: a tall, thin
// high street plot. The stepped Dutch gable is stacked from boxes. The ridge runs front to back, as the back's gable and the side's
// slope both show; the plan's cross line isn't followed. The double shop door is drawn 1.8 m on the sheet and is set at 2.1 m here.
// The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#6b2f2a', STONE = '#e3d8b8', ZINC = '#8c9cac', FRAME = '#4a525c', GLASS = '#a9bccb', OAK = '#6a4a33', DOOR = '#efe7cc', POT = '#7b3a30', LEAD = '#7f8a97', PIPE = '#5c5560';
const W = 8.6, D = 12.8, EAVES = 7.3, RIDGE = 9.7, STACK = 9.2;
const px = (p: number) => (p - 197) / 34, py = (p: number) => (372 - p) / 34, sz = (p: number) => -(p - 810) / 34, bx = (p: number) => W - (p - 197) / 34, by = (p: number) => (757 - p) / 34;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.roof(-0.1, W + 0.1, EAVES, RIDGE - EAVES, -D - 0.1, -0.3, ZINC, 'z');
k.trim(-0.1, W + 0.1, EAVES - 0.14, EAVES, -D - 0.1, 0.1, STONE);

// The stepped gable: a course of brick and stone for each step, then the round head.
const STEPS: [number, number, number, number][] = [[230, 460, 125, 95], [260, 430, 95, 70], [280, 412, 70, 45], [297, 395, 45, 22]];
for (const [a, b, y0, y1] of STEPS) { k.wall(px(a), px(b), py(y0), py(y1), -0.5, 0, BRICK); k.trim(px(a) - 0.06, px(b) + 0.06, py(y1), py(y1) + 0.08, -0.53, 0.03, STONE); }
k.wall(px(325), px(362), py(22), py(10), -0.5, 0, BRICK);
k.trim(px(321), px(366), py(10), py(8), -0.53, 0.03, STONE);

// The four stacks, two on each flank.
function stack(x0: number, x1: number, z0: number, z1: number) {
  k.wall(x0, x1, EAVES - 2, STACK, z0, z1, BRICK);
  k.trim(x0 - 0.06, x1 + 0.06, STACK, STACK + 0.14, z0 - 0.06, z1 + 0.06, STONE);
  for (const d of [-0.42, 0, 0.42]) k.trim((x0 + x1) / 2 - 0.1, (x0 + x1) / 2 + 0.1, STACK + 0.14, STACK + 0.6, (z0 + z1) / 2 + d - 0.1, (z0 + z1) / 2 + d + 0.1, POT);
}
for (const [x0, x1] of [[0.1, 1.1], [W - 1.1, W - 0.1]]) for (const [a, b] of [[950, 900], [1150, 1100]]) stack(x0, x1, sz(a), sz(b));

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 1, rows = 2, layer = 2) => { f.sash(a0, a1, y0, y1, { cols, rows, frame: FRAME, glass: GLASS, bar: 0.05 }, layer); const lo = Math.min(a0, a1), hi = Math.max(a0, a1); f.panel('trim', lo - 0.1, hi + 0.1, y0 - 0.1, y0, layer, STONE); f.panel('trim', lo - 0.14, hi + 0.14, y1, y1 + 0.14, layer, STONE); };
for (const [a, b] of [[243, 272], [415, 443]]) sash(front, px(a), px(b), py(182), py(140), 2);
for (const a of [311, 356]) { for (const [y0, y1] of [[112, 80], [182, 140], [255, 212]]) sash(front, px(a), px(a + 18), py(y0), py(y1)); }

// The bays, in oak under little lead roofs.
for (const [a, b] of [[223, 292], [396, 465]]) {
  const x0 = px(a), x1 = px(b), f = k.face('front', 0.5);
  k.wall(x0, x1, py(275), py(207), 0, 0.5, OAK);
  k.slope(x0 - 0.08, x1 + 0.08, py(207), 0.32, -0.08, 0.58, LEAD, 0.22);
  f.sash(x0 + 0.1, x1 - 0.1, py(258), py(213), { cols: 3, rows: 1, frame: FRAME, glass: GLASS, bar: 0.05 }, 1);
}

// The stone shopfront.
front.panel('trim', 0, W, 0, py(280), 1, STONE);
k.trim(-0.1, W + 0.1, py(280), py(268), -0.1, 0.22, STONE);
for (const [a, b] of [[219, 297], [390, 468]]) { front.sash(px(a), px(b), py(355), py(295), { cols: 3, rows: 1, frame: FRAME, glass: GLASS, bar: 0.07 }); front.panel('trim', px(a), px(b), py(372), py(358), 2, '#d6c9a4'); }
for (const a of [199, 299, 368, 470]) { front.panel('trim', px(a), px(a + 18), 0.05, py(292), 2, '#d6c9a4'); front.panel('trim', px(a + 6), px(a + 9), 0.3, py(300), 3, '#b5a884'); }
front.panel('trim', px(320), px(367), 0.02, py(295), 2, FRAME);
front.panel('door', px(323), px(364), 0.05, 2.12, 3, DOOR);
front.panel('trim', px(343), px(344), 0.05, 2.12, 4, FRAME);
front.panel('window', px(323), px(364), 2.16, py(297), 3, GLASS);

// The back and sides.
for (const [a, b] of [[240, 265], [300, 320], [368, 386], [420, 448]]) for (const [y0, y1] of [[565, 525], [638, 597]]) sash(back, bx(b), bx(a), by(y0), by(y1), b - a > 22 ? 2 : 1);
sash(back, bx(265), bx(240), by(725), by(685), 2);
sash(back, bx(450), bx(420), by(722), by(695), 2, 1);
back.panel('trim', bx(359), bx(328), 0, 2.2, 1, FRAME);
back.panel('door', bx(357), bx(330), 0, 2.15, 2, '#928b80');
for (const f of [right, left]) {
  sash(f, sz(1048), sz(1023), py(182), py(155), 2, 1);
  sash(f, sz(993), sz(975), py(255), py(215));
  sash(f, sz(1050), sz(1023), py(255), py(215), 2);
  f.panel('trim', sz(1095), sz(1065), 0, 2.2, 1, FRAME);
  f.panel('door', sz(1093), sz(1067), 0, 2.15, 2, '#6f6a60');
}
for (const [x, z] of [[-0.08, -0.4], [W, -0.4], [-0.08, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.08, 0.1, EAVES - 0.1, z - 0.08, z, PIPE);

export const building: Drawn = {
  id: 'kiln_row', type: 'style_high_street_brick', name: 'Kiln Row', storeys: 4, span: W, pieces: k.pieces,
  sheet: { file: 'style_high_street_brick', front: { px0: 197, ground: 372, m: 34 }, side: { px0: 810, ground: 372, m: 34 }, back: { px0: 197, ground: 757, m: 34 }, top: { px0: 800, ground: 705, m: 34 } },
};
