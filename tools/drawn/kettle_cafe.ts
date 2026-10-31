// Kettle Cafe, from drawings/sheets/place_cafe.png. 42 px to the metre, from its 2.1 m back doors, so 14.4 x 11.6 m. The loggia reaches
// 2.9 m out from the glazed front, and the back half of the roof stands lower. The plan's L-shape isn't in either elevation, so the
// block stays a plain rectangle. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const RENDER = '#f2ecd9', GREEN = '#8fa68c', DARK = '#5f7560', ROOF = '#c8ccd6', DECK = '#ded3bb', GLASS = '#b4cbd6';
const W = 14.4, D = 11.6, HIGH = 6.6, LOW = 6.15, STEP = -6.4, OUT = 2.9, EDGE = 0.13;
const px = (p: number) => (p - 40) / 42, py = (p: number) => (372 - p) / 42, sz = (p: number) => -(p - 843) / 42, bx = (p: number) => W - (p - 40) / 42, by = (p: number) => (755 - p) / 42;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, HIGH, STEP, 0, RENDER);
k.wall(0, W, 0, LOW, -D, STEP, RENDER);
k.trim(-EDGE, W + EDGE, HIGH, HIGH + 0.3, STEP - 0.05, EDGE, GREEN);
k.trim(-EDGE, W + EDGE, LOW, LOW + 0.26, -D - EDGE, STEP, GREEN);
k.slope(0, W, HIGH + 0.3, 0.03, STEP, 0, ROOF, 0.05);
k.slope(0, W, LOW + 0.26, 0.03, -D, STEP, ROOF, 0.05);
k.trim(0.1, W - 0.1, 0, 0.12, -D, 0, ROOF); // the plinth

// The loggia: a deep canopy on three posts over a deck, and the folding glass wall behind it.
k.trim(px(58), px(628), py(155), py(127), 0, OUT, GREEN);
k.trim(px(58), px(628), py(170), py(155), 0, OUT - 0.2, DARK);
k.trim(px(35), px(640), 0, 0.14, 0, OUT, DECK);
for (const a of [66, 335, 605]) k.trim(px(a), px(a + 14), 0.14, py(170), OUT - 0.7, OUT - 0.4, GREEN);
front.panel('trim', px(108), px(578), 0.25, py(205), 1, DARK);
for (let i = 0; i < 8; i++) { const a = 113 + i * 57.8 + (i > 3 ? 6 : 0); front.panel('window', px(a), px(a + 47), 0.4, py(212), 2, GLASS); }

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, rows = 2) => f.sash(a0, a1, y0, y1, { cols: 2, rows, frame: DARK, glass: GLASS });
for (const f of [right, left]) for (const a of [910, 1050, 1190]) sash(f, sz(a), sz(a + 75), py(312), py(220));
for (const a of [153, 293, 543]) sash(back, bx(a), bx(a + 62), by(707), by(645), 1);
for (const a of [73, 418]) { back.panel('trim', bx(a), bx(a + 42), 0.1, by(645), 1, DARK); back.panel('door', bx(a + 6), bx(a + 36), 0.14, 2.3, 2, GLASS); }

export const building: Drawn = {
  id: 'kettle_cafe', type: 'place_cafe', name: 'Kettle Cafe', storeys: 1, span: W, pieces: k.pieces,
  sheet: { file: 'place_cafe', front: { px0: 40, ground: 372, m: 42 }, side: { px0: 843, ground: 372, m: 42 }, back: { px0: 40, ground: 755, m: 42 }, top: { px0: 730, ground: 610, m: 42 } },
};
