// Spinning Shed, from drawings/sheets/style_old_mill.png. 24 px to the metre, which makes its doors 2.9 m cart doors, so 25.4 x 9.1 m: a long,
// narrow mill, as real ones were, to get daylight to the floor. The stair tower stands forward of the front. The back view draws it 1.6 m
// to one side of where the front does, so the front wins. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#7a5a48', PIER = '#6e4f3e', SLATE = '#434a56', CILL = '#d9cdb2', FRAME = '#2e3640', GLASS = '#7f8d9b', DOOR = '#5a3d2c';
const W = 25.4, D = 9.1, EAVES = 8.9, RIDGE = 11.75, T0 = 5.96, T1 = 9.46, TOUT = 2.7, TBACK = -0.8, TTOP = 13.6, TAPEX = 15.3;
const px = (p: number) => (p - 45) / 24, py = (p: number) => (372 - p) / 24, sz = (p: number) => -(p - 978) / 24, bx = (p: number) => W - (p - 45) / 24, by = (p: number) => (738 - p) / 24;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-0.2, W + 0.2, EAVES - 0.14, EAVES + 0.02, -D - 0.2, 0.2, CILL);
k.roof(-0.2, W + 0.2, EAVES, RIDGE - EAVES, -D - 0.2, 0.2, SLATE, 'x', { hip: 4.4 });
for (const f of [front, back]) { f.panel('trim', 0, 0.45, 0, EAVES - 0.14, 1, PIER); f.panel('trim', W - 0.45, W, 0, EAVES - 0.14, 1, PIER); }
for (const f of [left, right]) { f.panel('trim', 0, -0.9, 0, EAVES - 0.14, 1, PIER); f.panel('trim', -D, -D + 0.9, 0, EAVES - 0.14, 1, PIER); }

// The tower, through the roof and forward of the front, with a pyramid on it.
const tower = k.face('front', TOUT);
k.wall(T0, T1, 0, TTOP, TBACK, TOUT, BRICK);
k.trim(T0 - 0.14, T1 + 0.14, TTOP - 0.16, TTOP, TBACK - 0.14, TOUT + 0.14, CILL);
k.roof(T0 - 0.14, T1 + 0.14, TTOP, TAPEX - TTOP, TBACK - 0.14, TOUT + 0.14, SLATE, 'x', { hip: 1.89 });
tower.panel('trim', px(205), px(255), py(293), py(50), 1, PIER);

/** The mill's window: small panes, a stone cill and head. */
function sash(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, layer = 1, rows = 2) {
  f.sash(a0, a1, y0, y1, { cols: 2, rows, frame: FRAME, glass: GLASS, bar: 0.05 }, layer + 1);
  f.panel('trim', Math.min(a0, a1) - 0.08, Math.max(a0, a1) + 0.08, y0 - 0.1, y0, layer, CILL);
  f.panel('trim', Math.min(a0, a1) - 0.12, Math.max(a0, a1) + 0.12, y1, y1 + 0.13, layer, CILL);
}
const ROWS = [[py(208), py(172)], [py(275), py(232)], [py(348), py(302)]];
for (const a of [78, 138, 285, 345, 405, 465, 525, 585]) ROWS.forEach(([y0, y1], r) => { if (!(a === 285 && r === 2)) sash(front, px(a), px(a + 35), y0, y1); });
for (const [y0, y1] of [[py(90), py(62)], [py(200), py(173)], [py(270), py(243)]]) sash(tower, px(222), px(238), y0, y1, 2, 1);
front.panel('garage_door', px(279), px(326), 0, 2.9, 1, DOOR);
front.panel('trim', px(301), px(303), 0, 2.9, 2, FRAME);
front.panel('trim', px(274), px(330), 2.9, 3.05, 1, CILL);

const BACK = [[by(714), by(667)], [by(640), by(595)], [by(572), by(538)]];
for (const a of [82, 150, 218, 285, 353, 583]) BACK.forEach(([y0, y1]) => sash(back, bx(a), bx(a + 34), y0, y1));
BACK.slice(1).forEach(([y0, y1]) => sash(back, bx(422), bx(456), y0, y1));
back.panel('door', bx(427), bx(452), 0.05, 2.7, 1, DOOR);
back.panel('door', bx(507), bx(532), 0.05, 2.7, 1, DOOR);

for (const f of [right, left]) {
  sash(f, sz(1078), sz(1100), py(207), py(172));
  sash(f, sz(1078), sz(1100), py(277), py(233));
  f.panel('door', sz(1077), sz(1103), 0.02, 2.4, 1, DOOR);
}

export const building: Drawn = {
  id: 'spinning_shed', type: 'style_old_mill', name: 'Spinning Shed', storeys: 3, span: W, pieces: k.pieces,
  sheet: { file: 'style_old_mill', front: { px0: 45, ground: 372, m: 24 }, side: { px0: 978, ground: 372, m: 24 }, back: { px0: 45, ground: 738, m: 24 }, top: { px0: 730, ground: 692, m: 24 } },
};
