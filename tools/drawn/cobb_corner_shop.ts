// Cobb Corner Shop, from drawings/sheets/place_shop.png. 46 px to the metre, from its 2.1 m side door, so 10 x 11.5 m. The drawn chamfered
// corner needs a wall on the diagonal, which pieces can't do, so here the shopfront wraps a square corner. The back view's lean-to and
// the plan's wings copy the reference house, and the side view has neither, so they're left out. The left side isn't drawn: it
// takes the right's upper windows, without the shopfront.
import { Kit, type Drawn } from './kit.ts';

const RENDER = '#e8e3ca', SLATE = '#6a7480', GREEN = '#5d8b5f', DARK = '#3f6543', FRAME = '#5a6470', GLASS = '#a9bccb', STONE = '#b8b8ae', PLINTH = '#c3c7cb', WHITE = '#f3f1e6', GREY = '#a9b2bb', PIPE = '#8f98a2';
const W = 10, D = 11.5, EAVES = 5.43, TOP = 7.9, OVER = 0.22;
const px = (p: number) => (p - 40) / 46, py = (p: number) => (372 - p) / 46, sz = (p: number) => -(p - 795) / 46, bx = (p: number) => W - (p - 180) / 46, by = (p: number) => (755 - p) / 46;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, RENDER);
k.trim(-0.03, W + 0.03, 0, 0.35, -D - 0.03, 0.03, PLINTH);
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, GREY);
k.slope(-OVER, W + OVER, EAVES, TOP - EAVES, -D - OVER, OVER, SLATE, 3.65);

// Dormers, one to a side.
const dormer = (f: ReturnType<typeof k.face>, a: number, b: number) => f.dormer(a, b, 6.1, 7.4, RENDER, WHITE, { cols: 1, rows: 2, frame: FRAME, glass: GLASS }, 1.2, 0.4);
dormer(k.face('front', -0.6), px(223), px(285));
dormer(k.face('back', -D + 0.6), bx(482), bx(405));
dormer(k.face('right', W - 0.6), sz(1118), sz(1057));

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 1, rows = 2) => { f.sash(a0, a1, y0, y1, { cols, rows, frame: FRAME, glass: GLASS, bar: 0.07 }); f.panel('trim', Math.min(a0, a1) - 0.1, Math.max(a0, a1) + 0.1, y0 - 0.14, y0, 2, STONE); };
sash(front, px(110), px(195), py(208), py(140), 2, 1);
sash(front, px(292), px(335), py(208), py(140));
sash(front, px(408), px(425), py(208), py(140));
sash(front, px(447), px(487), py(208), py(140));

// The shopfront, wrapping the corner: fascia, stall riser, glass between pilasters.
const FASCIA0 = py(262), FASCIA1 = py(230), S0 = px(70), SIDE = sz(918);
front.panel('trim', S0, W, 0, FASCIA1, 1, GREEN);
right.panel('trim', 0, SIDE, 0, FASCIA1, 1, GREEN);
k.trim(S0, W + 0.28, FASCIA0, FASCIA1, 0, 0.28, DARK);
k.trim(W, W + 0.28, FASCIA0, FASCIA1, SIDE, 0, DARK);
for (const [a, b] of [[87, 233], [258, 405]]) { const m = (px(a) + px(b)) / 2; front.panel('trim', px(a), px(b), py(347), py(265), 2, DARK); for (const [p, q] of [[px(a) + 0.05, m - 0.03], [m + 0.03, px(b) - 0.05]]) front.panel('window', p, q, py(345), py(267), 3, GLASS); front.panel('trim', px(a), px(b), py(365), py(353), 2, DARK); }
front.panel('trim', px(442), px(482), 0.05, py(262), 2, DARK);
front.panel('door', px(447), px(477), 0.05, 2.15, 3, GREEN);
front.panel('window', px(452), px(472), 1.2, 1.95, 4, GLASS);
front.panel('window', px(447), px(477), py(278), py(266), 3, GLASS);
right.panel('trim', sz(860), sz(910), py(347), py(265), 2, DARK);
right.panel('window', sz(865), sz(905), py(345), py(267), 3, GLASS);
right.sash(sz(815), sz(840), 0.8, py(267), { cols: 1, frame: DARK, glass: GLASS }, 2);

// The rest of the right side, and a door to the flat.
sash(right, sz(805), sz(835), py(208), py(140));
sash(right, sz(855), sz(875), py(208), py(140));
sash(right, sz(1063), sz(1095), py(188), py(140), 1, 2);
right.panel('trim', sz(1155), sz(1203), 0.35, 2.5, 1, FRAME);
right.panel('door', sz(1158), sz(1200), 0.35, 2.45, 2, GREY);
sash(right, sz(1245), sz(1275), py(318), py(268));
k.trim(W, W + 0.1, 0, EAVES - 0.1, sz(929), sz(925), PIPE);

// The left and back.
for (const a of [805, 1063]) sash(left, sz(a), sz(a + 32), py(208), py(140));
sash(back, bx(380), bx(296), by(590), by(533), 2, 1);
sash(back, bx(458), bx(430), by(590), by(533));
sash(back, bx(605), bx(522), by(590), by(533), 2, 1);
sash(back, bx(354), bx(322), by(690), by(645));
sash(back, bx(605), bx(522), by(697), by(645), 2, 1);
back.panel('trim', bx(462), bx(418), 0.3, 2.45, 1, FRAME);
back.panel('door', bx(460), bx(420), 0.3, 2.4, 2, GREY);

export const building: Drawn = {
  id: 'cobb_corner_shop', type: 'place_shop', name: 'Cobb Corner Shop', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'place_shop', front: { px0: 40, ground: 372, m: 46 }, side: { px0: 795, ground: 372, m: 46 }, back: { px0: 180, ground: 755, m: 46 }, top: { px0: 725, ground: 752, m: 34 } },
};
