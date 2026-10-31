// Marsh Road Station, from drawings/sheets/station_ambulance.png. 34 px to the metre, so 17.5 x 13.7 m with three 4 m bays, inside
// schemas/services.ts's 3.6-5 m. The idea asked for two bays and the sheet draws three, inside the rule's 2-3, so three it is. At this
// scale, the drawn doors come out at the tall end of what the validator allows. The barrel roof is a run of short slopes over a filled
// wall. The left side isn't drawn: it mirrors the right.
import { SERVICE_RULES } from '../../schemas/services.ts';
import { Kit, type Drawn } from './kit.ts';

const RENDER = '#f1ead7', ROOF = '#8ea5b8', EAVE = '#6e8598', FRAME = '#4f6172', GLASS = '#a8c0d4', DOOR = '#8ea6ba', PLINTH = '#c6cbd0', PIPE = '#7b92a5';
const W = 17.5, D = 13.7, EAVES = 7.9, APEX = 10.7, OVER = 0.45, SPANS = 12;
const px = (p: number) => (p - 45) / 34, py = (p: number) => (373 - p) / 34, sz = (p: number) => -(p - 800) / 34, bx = (p: number) => W - (p - 48) / 34, by = (p: number) => (757 - p) / 34;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, RENDER);
k.trim(-0.02, W + 0.02, 0, 0.2, -D - 0.02, 0.02, PLINTH);
k.trim(-OVER, W + OVER, EAVES - 0.18, EAVES, -D - 0.3, 0.1, EAVE);

// The barrel: each strip a lean-to on its own slice of wall, so the end walls fill the curve.
const hw = W / 2 + OVER, rise = APEX - EAVES, arc = (x: number) => EAVES + rise * Math.sqrt(Math.max(0, 1 - ((x - W / 2) / hw) ** 2));
for (let i = 0; i < SPANS; i++) {
  const x0 = -OVER + (i / SPANS) * hw * 2, x1 = -OVER + ((i + 1) / SPANS) * hw * 2, y0 = arc(x0), y1 = arc(x1), low = Math.min(y0, y1);
  if (low > EAVES + 0.01) k.wall(x0, x1, EAVES, low, -D, 0, RENDER);
  k.roof(x0, x1, low, Math.abs(y1 - y0) + 0.02, -D - 0.3, 0.1, ROOF, 'z', { peak: y1 > y0 ? 1 : 0 });
}

// The clerestory, and three bay doors under the canopy.
const bars = { frame: FRAME, glass: GLASS, bar: 0.07 };
for (const [a, b] of [[62, 232], [265, 412], [442, 622]]) front.sash(px(a), px(b), py(177), py(115), { ...bars, cols: 5, rows: 2 });
for (const a of [100, 275, 449]) {
  front.panel('trim', px(a), px(a + 136), 0, py(235), 1, FRAME);
  front.panel('garage_door', px(a + 3), px(a + 133), 0.02, py(238), 2, FRAME);
  const w = (px(a + 133) - px(a + 3)) / 4;
  for (let i = 0; i < 4; i++) for (const [y0, y1] of [[0.1, py(292)], [py(288), py(241)]]) front.panel('window', px(a + 3) + i * w + 0.05, px(a + 3) + (i + 1) * w - 0.05, y0, y1, 3, SERVICE_RULES.ambulance.door);
}
k.trim(px(75), px(608), py(218), py(203), 0, 1.8, EAVE);
for (const a of [85, 600]) k.trim(px(a) - 0.1, px(a) + 0.1, 0, py(218), 1.5, 1.7, EAVE);

// The sides and back.
for (const f of [right, left]) {
  f.sash(sz(818), sz(928), py(177), py(115), { ...bars, cols: 3, rows: 2 });
  f.sash(sz(1028), sz(1085), py(177), py(115), { ...bars, cols: 2, rows: 2 });
  f.sash(sz(1192), sz(1250), py(177), py(115), { ...bars, cols: 2, rows: 2 });
  f.sash(sz(832), sz(895), 0.05, py(288), { ...bars, cols: 2, rows: 3 });
  f.panel('door', sz(910), sz(950), 0.02, 2.5, 1, DOOR);
  f.panel('door', sz(1027), sz(1086), 0.02, 2.5, 1, DOOR);
  f.panel('trim', sz(1056), sz(1057), 0.02, 2.5, 2, FRAME);
}
for (const [a, b, c] of [[72, 184, 3], [208, 486, 7], [510, 622, 3]]) back.sash(bx(b), bx(a), by(575), by(515), { ...bars, cols: c, rows: 2 });
for (const a of [72, 243, 418]) { back.panel('trim', bx(a + 43), bx(a - 2), 0.58, 3.28, 1, FRAME); back.panel('door', bx(a + 41), bx(a), 0.6, 3.26, 2, DOOR); }
back.panel('trim', bx(612), bx(527), 0.58, 3.28, 1, FRAME);
back.panel('door', bx(610), bx(529), 0.6, 3.26, 2, DOOR);
back.panel('trim', 0, W, 0.2, 0.6, 1, PLINTH);
back.sash(bx(213), bx(157), by(707), by(645), { ...bars, cols: 2 });
back.sash(bx(381), bx(322), by(674), by(645), { ...bars, cols: 2 });
for (const [x, z] of [[-0.1, -0.1], [W, -0.1], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, EAVES - 0.18, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'marsh_road_station', type: 'station_ambulance', name: 'Marsh Road Station', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'station_ambulance', front: { px0: 45, ground: 373, m: 34 }, side: { px0: 800, ground: 373, m: 34 }, back: { px0: 48, ground: 757, m: 34 }, top: { px0: 720, ground: 695, m: 34 } },
};
