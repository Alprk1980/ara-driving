// Copper Shed, from drawings/sheets/style_tin_shed.png. 35 px to the metre, from its 2.1 m door, so 17.3 x 16.5 m rather than the idea's
// 32 x 26. Each sawtooth is a long sheeted slope and a short glazed north light. The sheet's side view steps the roof about, which the
// front and back don't agree with, so they win and the teeth run the whole depth. Corrugations aren't modelled: too fine for a piece.
// The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const TIN = '#c3cad2', BRICK = '#d8d2bd', STEEL = '#67737f', ROOF = '#79848f', LIGHT = '#8fa8bd', FRAME = '#3f4a56', GLASS = '#a9bccb', SLIDE = '#8ea2b0', BEAM = '#7f8a96';
const W = 17.3, D = 16.5, EAVES = 7, RIDGE = 10.2, BASE = 0.65;
const px = (p: number) => (p - 40) / 35, py = (p: number) => (373 - p) / 35, sz = (p: number) => -(p - 752) / 35, bx = (p: number) => W - (p - 40) / 35, by = (p: number) => (755 - p) / 35;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, TIN);
k.trim(-0.03, W + 0.03, 0, BASE, -D - 0.03, 0.03, BRICK);

// The teeth: a long slope rising left to right, then the short glazed drop. Each end wall takes the wall's colour.
const teeth = [[0, 3.6, 4.5], [4.5, 7.85, 8.7], [8.7, 12, 12.85], [12.85, 16.1, W]];
for (const [a, ridge, b] of teeth) { k.roof(a, ridge, EAVES, RIDGE - EAVES, -D, 0, ROOF, 'z', { peak: 1 }); k.roof(ridge, b, EAVES, RIDGE - EAVES, -D, 0, LIGHT, 'z', { peak: 0 }); }

// The steel frame: columns, the eaves beam, and the braced end bays, front and back.
function frameOn(f: ReturnType<typeof k.face>, columns: number[], beam: number, mid: number, bays: [number, number, boolean?][]) {
  for (const c of columns) f.panel('trim', c - 0.14, c + 0.14, 0, EAVES, 2, STEEL);
  f.panel('trim', 0, W, beam, beam + 0.2, 2, STEEL);
  for (const [a, b, upperOnly] of bays) {
    f.panel('trim', a, b, mid, mid + 0.12, 2, STEEL);
    for (const [y0, y1] of upperOnly ? [[mid + 0.12, beam]] : [[BASE, mid], [mid + 0.12, beam]]) { const rise = y1 - y0 - 0.12; f.panel('trim', a, b, y0, y1, 3, STEEL, { fall: rise, shear: true }); f.panel('trim', a, b, y0, y1, 4, STEEL, { fall: -rise, shear: true }); }
  }
}
frameOn(front, [px(45), px(345), px(645)], py(133), py(235), [[px(50), px(92)], [px(600), px(640), true]]); // the sliding door takes the lower bay on the right
frameOn(back, [bx(45), bx(195), bx(345), bx(495), bx(645)], by(525), by(625), [[bx(105), bx(50)], [bx(640), bx(585)]]);

const grid = { frame: FRAME, glass: GLASS, bar: 0.05, m: 0.04 };
for (const a of [105, 240, 388, 520]) front.sash(px(a), px(a + 70), py(203), py(138), { ...grid, cols: 3, rows: 3 });
for (const a of [90, 225]) front.sash(px(a), px(a + 100), 0.02, py(243), { ...grid, cols: 4, rows: 5 });
front.panel('trim', px(405), px(440), 0, 2.15, 2, FRAME);
front.panel('door', px(407), px(438), 0.02, 2.1, 3, '#aab3bd');
front.panel('garage_door', px(484), px(630), 0, 3.8, 2, SLIDE); // the sliding loading door
front.panel('trim', px(555), px(556.5), 0, 3.8, 3, FRAME);
k.trim(px(398), px(633), 3.8, 4.08, 0, 0.45, STEEL); // its hood

for (const [a, b] of [[113, 168], [225, 315], [375, 465], [522, 578]]) back.sash(bx(a), bx(b), by(552), by(527), { ...grid, cols: b - a > 60 ? 4 : 3 });
for (const [a, b] of [[225, 315], [522, 578]]) back.sash(bx(a), bx(b), by(672), by(646), { ...grid, cols: b - a > 60 ? 4 : 3 });
back.panel('trim', bx(113), bx(168), by(672), by(646), 2, FRAME); // the louvre
for (let i = 0; i < 4; i++) back.panel('trim', bx(115), bx(166), by(668) + i * 0.15, by(668) + i * 0.15 + 0.06, 3, BEAM);
for (const a of [355, 423]) { back.panel('trim', bx(a) + 0.03, bx(a + 37) - 0.03, 0, 2.15, 1, FRAME); back.panel('door', bx(a), bx(a + 37), 0.02, 2.1, 2, '#aab3bd'); }

for (const f of [right, left]) {
  f.sash(sz(1185), sz(1285), py(203), py(138), { ...grid, cols: 4, rows: 3 });
  f.sash(sz(1185), sz(1285), py(350), py(243), { ...grid, cols: 4, rows: 4 });
  f.panel('trim', -D + 0.3, -D + 0.02, 0, EAVES, 2, STEEL);
  f.panel('trim', -0.02, -0.3, 0, EAVES, 2, STEEL);
}
for (const [x, z] of [[-0.1, 0], [W, 0], [-0.1, -D], [W, -D]]) k.trim(x, x + 0.1, 0, EAVES, z - 0.12, z + 0.02, STEEL);

export const building: Drawn = {
  id: 'copper_shed', type: 'style_tin_shed', name: 'Copper Shed', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_tin_shed', front: { px0: 40, ground: 373, m: 35 }, side: { px0: 752, ground: 373, m: 35 }, back: { px0: 40, ground: 755, m: 35 }, top: { px0: 750, ground: 752, m: 35 } },
};
