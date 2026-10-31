// Thistle House, from drawings/sheets/place_house.png. 44 px to the metre, from its 2.1 m side door, so 13.6 x 8.1 m. The side view's gable
// wins over the back view's hip, and the roof plan copies the reference house, so neither is followed. The idea's jetty is the tile-hung
// first floor, standing 0.3 m out over the bay. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const WHITE = '#f5f5f2', TILE = '#aa5f4f', HUNG = '#a0523f', BOARD = '#fbfbf8', OAK = '#a58e6b', CREAM = '#e9dfc2', FRAME = '#8a7f6c', GLASS = '#b5c6d3', PLINTH = '#c98f7c', PIPE = '#a8b0b8';
const W = 13.6, D = 8.1, EAVES = 4.4, RIDGE = 8.3, OVER = 0.3, CROSS = 4.6;
const px = (p: number) => (p - 42) / 44, py = (p: number) => (372 - p) / 44, sz = (p: number) => -(p - 885) / 44, bx = (p: number) => W - (p - 52) / 44, by = (p: number) => (755 - p) / 44;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, WHITE);
k.trim(-0.03, W + 0.03, 0, 0.14, -D - 0.03, 0.03, PLINTH);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, TILE, 'x');
k.trim(-OVER, W + OVER, EAVES - 0.12, EAVES, -D - OVER, OVER, BOARD);

/** A gable: tile-hung, with white bargeboards, on the front of the main roof. */
function gable(x0: number, x1: number, base: number, top: number, reach: number) {
  const mid = (x0 + x1) / 2, f = k.face('front', 0.33);
  k.roof(x0, x1, base, top - base, reach, 0.3, TILE, 'z');
  k.roof(x0, x1, base, top - base, 0.3, 0.33, HUNG, 'z', { hip: 0.001 });
  f.rake(x0, mid, base, top - 0.08, 0.2, BOARD);
  f.rake(mid, x1, top - 0.08, base, 0.2, BOARD);
}
k.wall(px(45), px(280), py(262), CROSS, -0.3, 0.3, HUNG); // the jetty
gable(px(30), px(295), CROSS, RIDGE, -4);
k.wall(px(483), px(580), 3.6, 5.15, -1.6, 0.14, WHITE);
gable(px(465), px(598), 5.15, 6.9, -2);
k.wall(px(285), px(413), EAVES - 0.1, py(143), -1.5, 0.05, WHITE); // the bit of wall that rises into the roof
k.trim(px(280), px(415), py(143), py(143) + 0.1, -1.5, 0.12, BOARD);

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols: number, layer = 2) => f.sash(a0, a1, y0, y1, { cols, rows: 1, frame: FRAME, glass: GLASS, bar: 0.06 }, layer);
k.face('front', 0.3).sash(px(124), px(204), py(208), py(153), { cols: 4, frame: FRAME, glass: GLASS, bar: 0.06 }, 1);
k.face('front', 0.05).sash(px(305), px(382), py(200), py(152), { cols: 4, frame: FRAME, glass: GLASS, bar: 0.06 }, 1);
k.face('front', 0.14).sash(px(492), px(572), py(208), py(153), { cols: 3, frame: FRAME, glass: GLASS, bar: 0.06 }, 1);

// The veranda roof and its oak posts, the bay under the tile, and the front door.
k.roof(px(268), px(640), py(265), py(222) - py(265), 0, 2.25, TILE, 'x', { peak: 0 });
k.trim(px(268), px(640), py(272), py(265), 0, 2.27, BOARD);
for (const a of [275, 418, 618]) k.trim(px(a) - 0.1, px(a) + 0.1, 0.14, py(272), 1.85, 2.05, OAK);
k.trim(px(290), px(640), 0, 0.14, 0, 2.25, PLINTH);
front.panel('trim', px(45), px(268), py(272), py(262), 1, OAK);
front.sash(px(100), px(232), py(333), py(272), { cols: 5, frame: FRAME, glass: GLASS, bar: 0.06 });
front.panel('trim', px(95), px(236), py(337), py(333), 2, CREAM);
front.sash(px(468), px(598), py(333), py(272), { cols: 5, frame: FRAME, glass: GLASS, bar: 0.06 });
front.panel('trim', px(463), px(602), py(337), py(333), 2, CREAM);
front.panel('trim', px(303), px(383), 0.14, py(272), 1, OAK);
front.panel('door', px(322), px(364), 0.15, 2.2, 2, CREAM);
for (const a of [306, 367]) front.panel('window', px(a), px(a + 13), 0.3, 2.1, 2, GLASS);

// The back and sides.
for (const [a, b, c] of [[104, 184, 4], [292, 344, 3], [430, 458, 1], [520, 600, 4]] as const) sash(back, bx(b), bx(a), by(585), by(530), c);
sash(back, bx(184), bx(104), by(700), by(654), 4);
for (const [a, b] of [[291, 392], [508, 603]]) back.sash(bx(b), bx(a), 0.14, by(652), { cols: 4, frame: OAK, glass: GLASS, bar: 0.07 });
back.panel('door', bx(370), bx(335), 0.15, 2.25, 4, GLASS);
for (const a of [410, 476]) back.panel('trim', bx(a + 5), bx(a), 0.14, EAVES + 0.4, 1, PIPE);
for (const f of [right, left]) { sash(f, sz(1083), sz(1053), py(200), py(152), 1); f.panel('trim', sz(1052), sz(1010), 0.14, 2.2, 1, FRAME); f.panel('door', sz(1049), sz(1013), 0.14, 2.15, 2, CREAM); f.panel('window', sz(1042), sz(1020), 1.2, 1.95, 3, GLASS); }

export const building: Drawn = {
  id: 'thistle_house', type: 'place_house', name: 'Thistle House', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'place_house', front: { px0: 42, ground: 372, m: 44 }, side: { px0: 885, ground: 372, m: 44 }, back: { px0: 52, ground: 755, m: 44 }, top: { px0: 725, ground: 712, m: 34 } },
};
