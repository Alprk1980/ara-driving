// Aggregate Hall, from drawings/sheets/style_concrete_depot.png. 33 px to the metre, from its 2.1 m door, so 19.1 x 15.6 m: the sheet's
// own "32 m wide" caption would make that door 3.5 m tall. The side view fixes the roof: five teeth, each high at its front with a
// glazed end, falling to the back. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const PANEL = '#d3d8df', PIER = '#b4bbc4', BRICK = '#3c3b41', ROOF = '#7f8892', FRAME = '#4f5964', GLASS = '#a9c2d6', CAP = '#a3abb4', CANOPY = '#c3c9d0', STEEL = '#8d96a0';
const W = 19.1, D = 15.6, EAVES = 6.3, RIDGE = 8.5, BASE = 0.64, PIER_OUT = 0.3;
const px = (p: number) => (p - 30) / 33, py = (p: number) => (338 - p) / 33, sz = (p: number) => -(p - 795) / 33, bx = (p: number) => W - (p - 30) / 33, by = (p: number) => (722 - p) / 33;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, PANEL);
k.trim(-0.03, W + 0.03, 0, BASE, -D - 0.03, 0.03, BRICK);
k.trim(-0.2, W + 0.2, EAVES - 0.12, EAVES + 0.03, -D - 0.2, 0.2, CAP);

// The teeth, with their glazed ends. A hip that small only stops the ends taking the wall's colour.
for (let i = 0; i < 5; i++) {
  const z1 = -i * (100 / 33), z0 = z1 - 100 / 33 + 0.02;
  k.roof(-0.15, W + 0.15, EAVES, RIDGE - EAVES, Math.max(z0, -D), z1, ROOF, 'x', { peak: 1 });
  for (const x of [-0.17, W + 0.13]) k.roof(x, x + 0.04, EAVES, RIDGE - EAVES - 0.1, Math.max(z0, -D) + 0.15, z1 - 0.1, GLASS, 'x', { peak: 1, hip: 0.001 });
}

const pier = (f: ReturnType<typeof k.face>, a0: number, a1: number) => f.panel('trim', a0, a1, 0, EAVES - 0.1, 1, PIER);
const stack = (out: number, f: 'front' | 'back', a0: number, a1: number) => k.trim(a0, a1, 0, EAVES - 0.1, f === 'front' ? 0 : -D - out, f === 'front' ? out : -D, PIER);
for (const [a, b] of [[157, 170], [277, 292], [397, 412], [518, 532]]) stack(PIER_OUT, 'front', px(a), px(b));
for (const [a, b] of [[33, 45], [645, 656]]) stack(0.1, 'front', px(a), px(b));
for (const a of [162, 280, 398, 518]) stack(PIER_OUT, 'back', bx(a + 14), bx(a));

// The front: two bands of glass over a pale spandrel, the entrance through the middle bay.
const band = (a0: number, a1: number, y0: number, y1: number, cols: number) => front.sash(px(a0), px(a1), py(y0), py(y1), { cols, frame: FRAME, glass: GLASS, bar: 0.08 });
for (const [a, b] of [[52, 155], [172, 275], [295, 395], [415, 515], [535, 637]]) band(a, b, 196, 145, 3);
for (const [a, b] of [[52, 155], [172, 275], [415, 515], [535, 637]]) band(a, b, 317, 253, 4);
front.panel('trim', px(292), px(397), 0.05, py(245), 2, FRAME);
for (const [a, b] of [[297, 327], [365, 393]]) front.panel('window', px(a), px(b), 0.1, py(265), 3, GLASS);
for (const [a, b] of [[297, 327], [331, 361], [365, 393]]) front.panel('window', px(a), px(b), py(261), py(248), 3, GLASS);
front.panel('door', px(331), px(361), 0.05, 2.15, 3, GLASS);
k.trim(px(268), px(420), py(240), py(227), 0, 1.9, CANOPY);
for (const a of [292, 397]) k.trim(px(a) - 0.08, px(a) + 0.08, 0, py(240), 1.65, 1.85, STEEL);

// The back: pairs of lights, each with its hood, and a door in the fourth bay.
const light = (a: number, y0: number, y1: number) => { back.sash(bx(a), bx(a + 55), by(y0), by(y1), { cols: 2, frame: FRAME, glass: GLASS }); back.panel('trim', bx(a - 7), bx(a + 62), by(y1) + 0.2, by(y1) + 0.45, 1, CAP); };
for (const a of [83, 200, 319, 437]) light(a, 577, 527);
for (const a of [83, 200, 319, 553]) light(a, 686, 636);
back.panel('trim', bx(547), bx(615), by(527), by(517), 1, CAP);
back.panel('trim', bx(442), bx(480), 0.05, 2.3, 1, FRAME);
back.panel('door', bx(445), bx(477), 0.05, 2.2, 2, '#aab3bd');

// The sides: a column between each tooth, and the side door under its hood.
for (const f of [right, left]) for (const a of [895, 998, 1098, 1200]) pier(f, sz(a), sz(a + 14));
right.panel('trim', sz(838), sz(868), 0, 2.2, 2, FRAME);
right.panel('door', sz(842), sz(865), 0, 2.15, 3, '#aab3bd');
k.trim(W, W + 0.8, 2.45, 2.65, sz(877), sz(828), CANOPY);
left.panel('trim', sz(838), sz(868), 0, 2.2, 2, FRAME);
left.panel('door', sz(842), sz(865), 0, 2.15, 3, '#aab3bd');
k.trim(-0.8, 0, 2.45, 2.65, sz(877), sz(828), CANOPY);

export const building: Drawn = {
  id: 'aggregate_hall', type: 'style_concrete_depot', name: 'Aggregate Hall', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_concrete_depot', front: { px0: 30, ground: 338, m: 33 }, side: { px0: 795, ground: 338, m: 33 }, back: { px0: 30, ground: 722, m: 33 }, top: { px0: 770, ground: 690, m: 28 } },
};
