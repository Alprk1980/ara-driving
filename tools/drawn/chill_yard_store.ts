// Chill Yard Store, from drawings/sheets/style_cold_store.png. 35 px to the metre, which keeps it inside the works district's 14 m depth
// and gives a 2.6 m double door. The sheet's scale figure isn't part of the building. The left side isn't drawn: it is as plain as the right.
import { Kit, type Drawn } from './kit.ts';

const PANEL = '#bcd2e2', JOINT = '#7f93a3', FASCIA = '#8a939c', PLINTH = '#b9bfc6', PORTAL = '#8f979f', FRAME = '#5a636d', GLASS = '#b3c9da', ROOF = '#c9ced6', VENT = '#5f666e';
const W = 16.9, D = 14, TOP = 10, CAP = 9.3, BASE = 0.6;
const px = (p: number) => (p - 55) / 35, py = (p: number) => (373 - p) / 35, bx = (p: number) => W - (p - 55) / 35, by = (p: number) => (758 - p) / 35;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, CAP, -D, 0, PANEL);
k.trim(-0.08, W + 0.08, 0, BASE, -D - 0.08, 0.08, PLINTH);
k.trim(-0.08, W + 0.08, CAP, TOP, -D - 0.08, 0.08, FASCIA);
k.slope(0, W, TOP, 0.04, -D, 0, ROOF, 0.05);
for (const x of [4, 8.45, 12.9]) for (const z of [-3.6, -10.2]) k.trim(x - 0.3, x + 0.3, TOP, TOP + 0.07, z - 0.3, z + 0.3, VENT);

// The insulated panels' joints.
for (let a = 1.4; a < W - 0.6; a += 1.41) for (const f of [front, back]) f.panel('trim', a, a + 0.04, BASE, CAP, 1, JOINT);
for (let a = -1.15; a > -D + 0.6; a -= 1.43) for (const f of [right, left]) f.panel('trim', a, a - 0.04, BASE, CAP, 1, JOINT);

const square = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number) => { f.panel('trim', a0, a1, y0, y1, 2, FRAME); f.panel('trim', a0 + 0.05, a1 - 0.05, y0 + 0.05, y1 - 0.05, 3, '#c2cad2'); f.panel('window', a0 + 0.12, a1 - 0.12, y0 + 0.12, y1 - 0.12, 4, GLASS); };
for (const a of [285, 362]) for (const [y0, y1] of [[212, 159], [147, 93]]) square(front, px(a), px(a + 54), py(y0), py(y1));
for (const a of [252, 329, 406]) for (const [y0, y1] of [[632, 585], [558, 511]]) square(back, bx(a), bx(a + 46), by(y0), by(y1));

// The portal, standing out from the front round the double doors.
const P0 = px(264), P1 = px(438), porch = k.face('front', 0.6);
k.wall(P0, P1, 0, py(244), 0, 0.6, PORTAL);
porch.panel('trim', px(285), px(418), 0, py(258), 1, '#a8c4d8');
porch.panel('trim', px(300), px(402), 0, py(282), 2, FRAME);
porch.panel('door', px(304), px(398), 0.02, py(286), 3, '#98a2ac');
porch.panel('trim', px(350), px(352), 0.02, py(286), 4, FRAME);

back.panel('trim', bx(551), bx(603), 0, 2.85, 2, FRAME);
back.panel('door', bx(555), bx(599), 0, 2.7, 3, '#a2acb6');

export const building: Drawn = {
  id: 'chill_yard_store', type: 'style_cold_store', name: 'Chill Yard Store', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_cold_store', front: { px0: 55, ground: 373, m: 35 }, side: { px0: 800, ground: 373, m: 35 }, back: { px0: 55, ground: 758, m: 35 }, top: { px0: 800, ground: 720, m: 22 } },
};
