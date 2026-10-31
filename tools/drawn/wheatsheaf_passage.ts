// Wheatsheaf Passage, from drawings/sheets/style_corner_arcade.png. 31 px to the metre, from its 2.1 m door leaves, so 19.9 x 12.1 m. A glazed
// veranda on iron posts turns the corner round the shopfronts. The brackets and tracery are too fine for pieces and are left out, and
// the plan's L-shaped courts aren't in the elevations. The left side isn't drawn: it takes the right's windows, without the veranda.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#c99a6c', PILASTER = '#c2925f', STONE = '#e0d3b0', GREEN = '#a9c4a6', IRON = '#6f9171', FRAME = '#59636c', GLASS = '#a9bccb', ROOF_GLASS = '#a8bfc7', DOOR = '#6a3e2a', FLAT = '#a2a7ad';
const W = 19.85, D = 12.1, TOP = 10.75, HIGH = 11.6, STRING = 4.4, WRAP = -5.4, OUT = 2.25;
const px = (p: number) => (p - 40) / 31, py = (p: number) => (373 - p) / 31, sz = (p: number) => -(p - 882) / 31, bx = (p: number) => W - (p - 40) / 31, by = (p: number) => (757 - p) / 31;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, py(58), -D, 0, BRICK);
k.wall(0, W, py(58), TOP + 0.3, -D, 0, BRICK); // the parapet
k.wall(px(203), px(492), TOP, HIGH, -D, -0.02, BRICK);
for (const [a, b] of [[35, 55], [640, 660]]) { k.wall(px(a), px(b), TOP, py(22), -D, 0, BRICK); k.trim(px(a) - 0.05, px(b) + 0.05, py(22), py(22) + 0.12, -D - 0.05, 0.05, STONE); }
k.trim(-0.14, W + 0.14, py(64), py(58), -D - 0.14, 0.14, STONE);
k.trim(px(203) - 0.1, px(492) + 0.1, HIGH, HIGH + 0.14, -D - 0.1, 0, STONE);
k.trim(-0.08, W + 0.08, TOP + 0.3, TOP + 0.4, -D - 0.08, 0.08, STONE);
k.slope(0, W, TOP + 0.4, 0.03, -D, 0, FLAT, 0.2);
k.trim(-0.1, W + 0.1, STRING, STRING + 0.2, WRAP, 0.1, STONE);

for (const [a, b] of [[118, 138], [203, 230], [295, 315], [378, 400], [465, 490], [555, 575]]) { front.panel('trim', px(a), px(b), STRING, py(64), 1, PILASTER); front.panel('trim', px(a) - 0.05, px(b) + 0.05, py(72), py(64), 2, STONE); }
for (const [a, b] of [[225, 245], [362, 380], [503, 522], [40, 60], [634, 655]]) { back.panel('trim', bx(b), bx(a), STRING, by(440), 1, PILASTER); }

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, head = true) => { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); f.sash(lo, hi, y0, y1, { cols: 2, rows: 3, frame: FRAME, glass: GLASS, bar: 0.05 }); f.panel('trim', lo - 0.1, hi + 0.1, y0 - 0.15, y0, 2, STONE); if (head) f.panel('trim', lo - 0.15, hi + 0.15, y1, y1 + 0.26, 2, STONE); };
for (const a of [70, 153, 246, 330, 414, 506, 590]) for (const [y0, y1] of [[230, 175], [138, 85]]) sash(front, px(a), px(a + 34), py(y0), py(y1));

// The shopfronts, on the front and round the corner.
function shops(f: ReturnType<typeof k.face>, spans: number[][], doors: number[]) {
  for (const [a, b] of spans) { f.panel('trim', a, b, 0.3, py(282), 1, GREEN); f.panel('trim', a + 0.08, b - 0.08, 0.75, py(290), 2, FRAME); const m = (a + b) / 2; for (const [p, q] of [[a + 0.13, m - 0.03], [m + 0.03, b - 0.13]]) f.panel('window', p, q, 0.8, py(294), 3, GLASS); }
  for (const c of doors) { f.panel('trim', c - 0.5, c + 0.5, 0, py(292), 3, IRON); f.panel('door', c - 0.42, c + 0.42, 0.02, 2.1, 4, GREEN); f.panel('window', c - 0.28, c + 0.28, 1.1, 1.9, 5, GLASS); }
}
shops(front, [[px(50), px(225)], [px(232), px(305)], [px(392), px(462)], [px(470), px(645)]], [px(163), px(530)]);
shops(right, [[-0.3, sz(960)], [sz(965), WRAP + 0.2]], [sz(925)]);
front.panel('trim', px(312), px(383), 0, py(278), 1, DOOR);
front.panel('door', px(318), px(377), 0.05, 2.65, 2, DOOR);
front.panel('trim', px(347), px(349), 0.05, 2.65, 3, '#3b2317');
front.panel('window', px(322), px(373), 2.72, py(282), 2, GLASS);

// The veranda: a glass slope on iron posts, a pediment over the door.
k.trim(-0.1, W + OUT, py(273), py(268), -0.02, OUT, IRON);
k.roof(-0.1, W + OUT, py(268), py(245) - py(268), 0, OUT, ROOF_GLASS, 'x', { peak: 0 });
k.trim(W, W + OUT, py(273), py(268), WRAP, 0, IRON);
k.roof(W, W + OUT, py(268), py(245) - py(268), WRAP, 0, ROOF_GLASS, 'z', { peak: 0 });
k.roof(px(300), px(392), py(270), py(246) - py(270), OUT - 1, OUT + 0.02, GREEN, 'z');
for (const a of [40, 128, 215, 302, 390, 477, 565, 652]) k.trim(px(a) - 0.08, px(a) + 0.08, 0, py(273), OUT - 0.2, OUT - 0.04, IRON);
for (const z of [-1.8, -3.6, WRAP]) k.trim(W + OUT - 0.2, W + OUT - 0.04, 0, py(273), z, z + 0.16, IRON);
k.trim(px(305), px(388), 0, 0.14, 0, 0.8, STONE);

// The right wall behind the veranda, the left, and the back.
for (const f of [right, left]) for (const [y0, y1] of [[230, 175], [138, 85]]) sash(f, sz(1096), sz(1062), py(y0), py(y1));
sash(right, sz(1096), sz(1062), py(342), py(283));
sash(left, sz(1096), sz(1062), py(342), py(283));
for (const a of [87, 165, 287, 425, 567]) for (const [y0, y1] of [[607, 555], [515, 465]]) sash(back, bx(a + 34), bx(a), by(y0), by(y1));
for (const a of [165, 287, 567]) sash(back, bx(a + 34), bx(a), by(705), by(650));
back.panel('trim', bx(122), bx(85), by(708), by(650), 1, PILASTER);
back.panel('trim', bx(460), bx(423), 0.4, by(646), 1, FRAME);
back.panel('door', bx(458), bx(425), 0.4, 2.55, 2, '#a7a290');
back.panel('window', bx(458), bx(425), 2.62, by(650), 2, GLASS);
k.trim(bx(464), bx(419), 0, 0.3, -D - 0.5, -D, STONE);

export const building: Drawn = {
  id: 'wheatsheaf_passage', type: 'style_corner_arcade', name: 'Wheatsheaf Passage', storeys: 3, span: W, pieces: k.pieces,
  sheet: { file: 'style_corner_arcade', front: { px0: 40, ground: 373, m: 31 }, side: { px0: 882, ground: 373, m: 31 }, back: { px0: 40, ground: 757, m: 31 }, top: { px0: 725, ground: 708, m: 31 } },
};
