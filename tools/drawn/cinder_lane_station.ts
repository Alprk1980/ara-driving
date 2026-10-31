// Cinder Lane Station, from drawings/sheets/station_fire.png. 24 px to the metre, which gives three appliance bays 5.4 m wide in their
// white surrounds, inside schemas/services.ts's 5-6.5 m, and a 5.3 m door, so 21 x 16.8 m plus a drill tower of 14.3 m. Its small doors
// come out 2.4 m. The side and both elevations stand the tower mid-depth, so the plan's corner tower isn't followed. The left side
// isn't drawn: it takes the right's plain wall and windows.
// The bay doors are fire red, as the game's stations have them, where the sheet draws them cream.
import { SERVICE_RULES } from '../../schemas/services.ts';
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#ad4d43', STONE = '#dcd0b4', WHITE = '#f5f4ef', BAY = SERVICE_RULES.fire.door, OLIVE = '#8d1714', FRAME = '#4f5964', GLASS = '#b6c6d2', LINTEL = '#8f3a33', DOOR = '#a9a39a', ROOF = '#c2a3a7', PIPE = '#8f98a2';
const W = 21, TW = 24.8, D = 16.8, TOP = 10.9, STRING = 9.7, BASE = 0.85, T_F = -6.2, T_B = -10.6, T_TOP = 14.3;
const px = (p: number) => (p - 50) / 24, py = (p: number) => (353 - p) / 24, sz = (p: number) => -(p - 842) / 24, bx = (p: number) => TW - (p - 45) / 24, by = (p: number) => (737 - p) / 24;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0), tower = k.face('right', TW), tFront = k.face('front', T_F), tBack = k.face('back', T_B);
k.wall(0, W, 0, TOP, -D, 0, BRICK);
k.wall(20.6, TW, 0, T_TOP, T_B, T_F, BRICK);
k.trim(-0.03, W + 0.03, 0, BASE, -D - 0.03, 0.03, STONE);
k.trim(20.6, TW + 0.03, 0, BASE, T_B - 0.03, T_F + 0.03, STONE);
for (const [x0, x1, z0, z1, y] of [[-0.1, W + 0.1, -D - 0.1, 0.1, STRING], [-0.1, W + 0.1, -D - 0.1, 0.1, TOP], [20.5, TW + 0.1, T_B - 0.1, T_F + 0.1, py(35)], [20.5, TW + 0.1, T_B - 0.1, T_F + 0.1, T_TOP], [20.5, TW + 0.1, T_B - 0.1, T_F + 0.1, py(270)]]) k.trim(x0, x1, y, y + 0.16, z0, z1, STONE);
k.slope(0, W, TOP + 0.16, 0.03, -D, 0, ROOF, 0.15);
k.slope(20.6, TW, T_TOP + 0.16, 0.03, T_B, T_F, ROOF, 0.15);

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, rows = 2) => { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); f.sash(lo, hi, y0, y1, { cols: 2, rows, frame: FRAME, glass: GLASS, bar: 0.05 }); f.panel('trim', lo - 0.06, hi + 0.06, y0 - 0.1, y0, 2, STONE); f.panel('trim', lo - 0.03, hi + 0.03, y1, y1 + 0.16, 2, LINTEL); };

// The three appliance bays.
for (const a of [85, 237, 388]) {
  front.panel('trim', px(a), px(a + 130), 0, py(215), 1, WHITE);
  front.panel('trim', px(a + 11), px(a + 119), 0, py(224), 2, OLIVE);
  front.panel('garage_door', px(a + 13), px(a + 117), 0.02, py(226), 3, OLIVE);
  const w = (px(a + 117) - px(a + 13)) / 4;
  for (let i = 0; i < 4; i++) for (const [y0, y1] of [[0.1, py(290)], [py(286), py(230)]]) front.panel('window', px(a + 13) + i * w + 0.05, px(a + 13) + (i + 1) * w - 0.05, y0, y1, 4, BAY);
}
for (const a of [103, 168, 255, 320, 408, 472]) sash(front, px(a), px(a + 28), py(178), py(137));
for (const [y0, y1] of [[82, 48], [162, 127], [240, 203]]) sash(tFront, px(580), px(600), py(y0), py(y1));

// The tower's side.
sash(tower, sz(1052), sz(1033), py(82), py(48));
tower.panel('trim', sz(1062), sz(1023), py(190), py(132), 1, LINTEL);
tower.sash(sz(1058), sz(1027), py(188), py(135), { cols: 2, frame: FRAME, glass: '#cfc7b8' });
tower.sash(sz(1058), sz(1027), py(263), py(210), { cols: 1, frame: FRAME, glass: '#cfc7b8' });
tower.panel('trim', sz(1057), sz(1029), 0, 2.45, 1, FRAME);
tower.panel('door', sz(1055), sz(1031), 0, 2.4, 2, DOOR);
for (const [y0, y1] of [[170, 135], [244, 208], [325, 290]]) { sash(k.face('right', W), sz(1128), sz(1112), py(y0), py(y1), 2); sash(left, sz(1128), sz(1112), py(y0), py(y1), 2); }
right.panel('door', sz(978), sz(950), 0, 2.4, 1, DOOR);
left.panel('door', sz(978), sz(950), 0, 2.4, 1, DOOR);

// The back.
for (const a of [177, 265, 352, 437, 524, 582]) for (const [y0, y1] of [[550, 513], [625, 590]]) sash(back, bx(a + 27), bx(a), by(y0), by(y1));
for (const a of [177, 265, 352, 524]) sash(back, bx(a + 27), bx(a), by(703), by(665));
for (const [y0, y1] of [[472, 438], [550, 513], [625, 590]]) sash(tBack, bx(103), bx(86), by(y0), by(y1));
tBack.panel('door', bx(125), bx(97), 0, 2.4, 1, DOOR);
back.panel('trim', bx(478), bx(425), 0, 2.45, 1, FRAME);
back.panel('door', bx(476), bx(427), 0, 2.4, 2, DOOR);
back.panel('door', bx(607), bx(580), 0, 2.4, 1, DOOR);
for (const a of [406, 494]) { back.panel('trim', bx(a + 6), bx(a), 0, py(120), 1, PIPE); }

export const building: Drawn = {
  id: 'cinder_lane_station', type: 'station_fire', name: 'Cinder Lane Station', storeys: 3, span: TW, pieces: k.pieces,
  sheet: { file: 'station_fire', front: { px0: 50, ground: 353, m: 24 }, side: { px0: 842, ground: 353, m: 24 }, back: { px0: 45, ground: 737, m: 24 }, top: { px0: 810, ground: 720, m: 19 } },
};
