// Fen Road Depot, from drawings/sheets/place_depot.png. 33 px to the metre, from its 2.1 m door, which also makes its shutters 4.3 m tall,
// right for a double-decker at 4.4 m. So 23.3 x 12.1 m. The back is drawn smaller, at 30 px. The front and back hip the roof, the side
// shows a gable: two views against one, so it's hipped. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const WALL = '#9aa1a8', ROOF = '#6d7680', BRICK = '#a84f3f', FRAME = '#4f5964', GLASS = '#a9c7da', SHUT = '#8b949d', SLAT = '#6b747e', RECESS = '#7f8790', APRON = '#d3d6d9', DOOR = '#a9b1b9', FASCIA = '#7c858f', PIPE = '#6f7780';
const W = 23.3, D = 12.1, EAVES = 6.6, RIDGE = 7.6, BASE = 0.4, CLERE = [5.45, 6.35];
const px = (p: number) => (p - 42) / 33, py = (p: number) => (340 - p) / 33, sz = (p: number) => -(p - 918) / 33, bx = (p: number) => W - (p - 42) / 30, by = (p: number) => (716 - p) / 30;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, WALL);
k.trim(-0.03, W + 0.03, 0, BASE, -D - 0.03, 0.03, BRICK);
k.trim(-0.3, W + 0.3, EAVES - 0.16, EAVES, -D - 0.3, 0.3, FASCIA);
k.roof(-0.3, W + 0.3, EAVES, RIDGE - EAVES, -D - 0.3, 0.3, ROOF, 'x', { hip: 4 });

// The high band of glass, round all four walls.
const light = { cols: 3, frame: FRAME, glass: GLASS, bar: 0.1 };
for (const [a, b] of [[55, 182], [190, 302], [308, 422], [428, 542], [548, 664], [672, 800]]) front.sash(px(a), px(b), CLERE[0], CLERE[1], light);
for (const [a, b] of [[58, 178], [183, 302], [307, 423], [478, 598], [603, 723]]) back.sash(bx(b), bx(a), CLERE[0], CLERE[1], light);
for (const f of [right, left]) for (const [a, b] of [[930, 1040], [1045, 1190], [1195, 1305]]) f.sash(sz(a), sz(b), CLERE[0], CLERE[1], { ...light, cols: 3 });

// The four bus doors, in their recess, with an apron in front.
front.panel('trim', px(180), px(675), BASE - 0.4, py(165), 1, RECESS);
k.trim(px(180), px(675), 0, 0.06, 0, 1.2, APRON);
for (const a of [197, 317, 437, 556]) {
  front.panel('trim', px(a) - 0.06, px(a + 100) + 0.06, 0, py(186), 2, FRAME);
  front.panel('garage_door', px(a), px(a + 100), 0.02, py(190), 3, SHUT);
  for (let y = 0.45; y < py(190) - 0.1; y += 0.62) front.panel('trim', px(a), px(a + 100), y, y + 0.04, 4, SLAT);
}
front.panel('trim', px(67), px(102), 0, 2.2, 1, FRAME);
front.panel('door', px(69), px(100), 0, 2.15, 2, DOOR);
front.sash(px(128), px(172), py(305), py(268), { cols: 2, frame: FRAME, glass: GLASS });

// The back's row of doors and two windows.
for (const a of [185, 250, 555, 685]) { back.panel('trim', bx(a + 34), bx(a - 1), 0, 2.6, 1, FRAME); back.panel('door', bx(a + 33), bx(a), 0, 2.55, 2, DOOR); }
for (const a of [486, 613]) back.sash(bx(a + 44), bx(a), by(675), by(635), { cols: a === 486 ? 2 : 1, frame: FRAME, glass: GLASS });
for (const f of [right, left]) { f.panel('trim', sz(952), sz(987), 0, 2.2, 1, FRAME); f.panel('door', sz(954), sz(985), 0, 2.15, 2, DOOR); }
for (const [x, z] of [[-0.1, -0.1], [W, -0.1], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, EAVES - 0.1, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'fen_road_depot', type: 'place_depot', name: 'Fen Road Depot', storeys: 1, span: W, pieces: k.pieces,
  sheet: { file: 'place_depot', front: { px0: 42, ground: 340, m: 33 }, side: { px0: 918, ground: 340, m: 33 }, back: { px0: 42, ground: 716, m: 30 }, top: { px0: 805, ground: 702, m: 23 } },
};
