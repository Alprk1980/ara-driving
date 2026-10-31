// Bramley Police Station, from drawings/sheets/station_police.png. 39 px to the metre, the smallest that fits the station rule's 15 m,
// so 15.3 x 11.5 m with a 3.7 m vehicle door and 2.7 m entrance doors. Gemini leaned on the reference house here, so it reads more
// like a large house than a station. The back's low lean-to contradicts the side's full gable, so the gable stands. The left side
// isn't drawn: it mirrors the right, without the gate pier.
import { SERVICE_RULES } from '../../schemas/services.ts';
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#e0c28f', ROOF = '#8797a7', STONE = '#d3cdbd', PALE = '#e3dfd2', FRAME = '#454f5a', GLASS = '#a9c0d6', PANEL = '#6f7a85', DOOR = '#a9adb0', EAVE = '#70808f', PIPE = '#8c95a0';
const W = 15.3, MAIN = 10, D = 11.5, EAVES = 6.5, WING = 4.6, APEX = 9.35;
const px = (p: number) => (p - 40) / 39, py = (p: number) => (373 - p) / 39, sz = (p: number) => -(p - 850) / 39, bx = (p: number) => W - (p - 40) / 39, by = (p: number) => (757 - p) / 39;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, MAIN, 0, EAVES, -D, 0, BRICK);
k.wall(MAIN, W, 0, WING, -D, 0, BRICK);
k.roof(7, W + 0.15, WING, APEX - WING, -D - 0.25, 0.25, ROOF, 'x'); // the wing's long roof, with a gable at the right
k.roof(-0.25, MAIN + 0.25, EAVES, APEX - EAVES, -D - 0.25, 0.25, ROOF, 'x', { hip: 3.7 });
k.trim(-0.25, MAIN + 0.25, EAVES - 0.16, EAVES, -D - 0.25, 0.25, EAVE);
k.trim(MAIN, W + 0.15, WING - 0.16, WING, -D - 0.25, 0.25, EAVE);
k.trim(-0.02, W + 0.02, 0, 0.1, -D - 0.02, 0.02, STONE);

const tall = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, mid = true) => {
  f.panel('trim', a0, a1, y0, y1, 2, FRAME);
  const c0 = a0 + (a1 - a0) * 0.27, c1 = a1 - (a1 - a0) * 0.27, third = (y1 - y0) / 3;
  for (const [p, q] of [[a0 + 0.05, c0 - 0.03], [c0 + 0.03, c1 - 0.03], [c1 + 0.03, a1 - 0.05]]) for (let r = 0; r < 3; r++) f.panel(mid && r === 1 ? 'trim' : 'window', p, q, y0 + r * third + 0.04, y0 + (r + 1) * third - 0.04, 3, mid && r === 1 ? PANEL : GLASS);
};
tall(front, px(100), px(198), py(333), py(127));
front.panel('trim', px(96), px(202), py(341), py(333), 2, STONE);
front.sash(px(272), px(368), py(207), py(127), { cols: 3, frame: FRAME, glass: GLASS, bar: 0.1 });
front.panel('trim', px(266), px(374), py(215), py(207), 2, STONE);

// The entrance: a stone frame, standing forward.
k.trim(px(238), px(402), py(232), py(221), 0, 1.3, STONE);
for (const [a, b] of [[242, 266], [374, 398]]) k.trim(px(a), px(b), 0, py(232), 0, 1.25, STONE);
k.trim(px(242), px(398), py(247), py(232), 1.05, 1.25, PALE);
k.trim(px(238), px(402), 0, 0.08, 0, 1.3, STONE);
front.panel('trim', px(266), px(374), 0, py(247), 1, PALE);
front.panel('trim', px(276), px(364), 0.05, py(262), 2, FRAME);
for (const a of [280, 345]) front.panel('window', px(a), px(a + 15), 0.1, py(267), 3, GLASS);
front.panel('door', px(300), px(340), 0.08, 2.65, 3, DOOR);

// The vehicle door, and the gate pier by it.
front.panel('trim', px(450), px(600), 0, py(229), 1, FRAME);
const G0 = px(455), G1 = px(595), gw = (G1 - G0) / 4, gh = (py(234) - 0.1) / 4;
front.panel('garage_door', G0, G1, 0.02, py(232), 2, SERVICE_RULES.police.door);
for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) front.panel('window', G0 + c * gw + 0.05, G0 + (c + 1) * gw - 0.05, 0.1 + r * gh + 0.04, 0.1 + (r + 1) * gh - 0.04, 3, r === 3 ? GLASS : SERVICE_RULES.police.door);
k.trim(px(617), px(648), 0, py(274), -0.05, 0.35, BRICK);
k.trim(px(612), px(652), py(274), py(265), -0.1, 0.4, STONE);

// The right, and the back.
for (const f of [right, left]) {
  for (const [y0, y1] of [[180, 125], [320, 265]]) { f.sash(sz(1055), sz(1093), py(y0), py(y1), { cols: 1, frame: FRAME, glass: GLASS }); f.panel('trim', sz(1050), sz(1097), py(y0) - 0.1, py(y0), 2, STONE); }
  f.panel('trim', sz(1198), sz(1247), 0.1, 2.75, 1, FRAME);
  f.panel('door', sz(1200), sz(1245), 0.1, 2.7, 2, DOOR);
}
tall(back, bx(383), bx(293), by(722), by(513));
tall(back, bx(610), bx(518), by(722), by(513));
back.sash(bx(462), bx(428), by(598), by(513), { cols: 1, rows: 2, frame: FRAME, glass: GLASS });
for (const a of [190, 418]) { back.panel('trim', bx(a + 44), bx(a - 2), 0.1, 2.75, 1, FRAME); back.panel('door', bx(a + 42), bx(a), 0.1, 2.7, 2, DOOR); }
for (const [x, z] of [[-0.1, -0.1], [W, -0.1], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, (x < 1 ? EAVES : WING) - 0.1, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'bramley_police_station', type: 'station_police', name: 'Bramley Police Station', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'station_police', front: { px0: 40, ground: 373, m: 39 }, side: { px0: 850, ground: 373, m: 39 }, back: { px0: 40, ground: 757, m: 39 }, top: { px0: 720, ground: 700, m: 39 } },
};
