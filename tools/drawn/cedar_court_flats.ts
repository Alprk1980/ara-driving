// Cedar Court Flats, from drawings/sheets/style_tower_flats.png. 17.6 px to the metre, from its 2.1 m door, so 19.2 x 18.1 m, seven floors
// of 2.57 m under a brick parapet and stair head. The side view stands the head mid-depth, but the back and roof plan put it at the back, so they win. Balconies wrap the front left and the right flank. The left side isn't drawn: it
// takes the same windows as the right, without the balconies.
import { Kit, type Drawn } from './kit.ts';

const CREAM = '#efe3bf', BRICK = '#d29a7c', CAP = '#f2ead4', GREEN = '#2f5a48', FRAME = '#33474a', GLASS = '#a9c1c5', SLAB = '#f2f2ee', GREY = '#c9ccce', ROOF = '#e0dbcb';
const W = 19.15, D = 18.1, TOP = 19.3, BAND = 18, FLOORS = 7, HEAD = 20.7;
const px = (p: number) => (p - 183) / 17.6, py = (p: number) => (372 - p) / 17.6, sz = (p: number) => -(p - 873) / 17.6, bx = (p: number) => W - (p - 183) / 17.6, by = (p: number) => (758 - p) / 17.6;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, TOP, -D, 0, CREAM);
k.trim(-0.05, W + 0.05, TOP, TOP + 0.12, -D - 0.05, 0.05, CAP);
k.slope(0.1, W - 0.1, TOP + 0.12, 0.03, -D + 0.1, -0.1, ROOF, 0.05);
for (const f of [front, right, left]) f === front ? f.panel('trim', 0, W, BAND, TOP, 1, BRICK) : f.panel('trim', 0, -D, BAND, TOP, 1, BRICK);

// The stair: brick up the back, and its head over the roof.
const S0 = bx(395), S1 = bx(315), stair = k.face('back', -D - 0.3);
k.wall(S0, S1, 0, TOP + 0.1, -D - 0.3, -D + 1.5, BRICK);
k.wall(S0, S1, TOP, HEAD, -D - 0.3, -D + 3.5, BRICK);
k.trim(S0 - 0.08, S1 + 0.08, HEAD, HEAD + 0.1, -D - 0.38, -D + 3.58, CAP);
for (let n = 0; n < 7; n++) stair.sash(bx(385), bx(367), by(479 + n * 44.4), by(457 + n * 44.4), { cols: 1, frame: FRAME, glass: GLASS });
stair.panel('door', bx(385), bx(367), 0.02, 2.1, 1, GREY);

/** One storey of the block's windows, on either the front or a side. */
const storeyY = (n: number) => (n === 0 ? [py(370), py(333)] : [py(333 - (n - 1) * 45.3 - 11 + 0), py(333 - (n - 1) * 45.3 - 44)]);
for (let n = 0; n < FLOORS; n++) {
  const [y0, y1] = storeyY(n);
  front.sash(px(190), px(243), y0, y1, { cols: 3, frame: GREEN, glass: GLASS });
  if (n > 0) front.sash(px(339), px(379), y0, y1, { cols: 3, frame: FRAME, glass: GLASS });
  front.sash(px(279), px(305), y0, y1, { cols: 2, frame: FRAME, glass: GLASS });
  front.sash(px(411), px(427), y0, y1, { cols: 1, frame: FRAME, glass: GLASS });
  front.sash(px(460), px(512), y0, y1, { cols: 2, frame: FRAME, glass: GLASS }, 3);
  for (const f of [right, left]) {
    f.sash(sz(880), sz(933), y0, y1, { cols: 3, frame: GREEN, glass: GLASS });
    f.sash(sz(1000), sz(1016), y0, y1, { cols: 1, frame: FRAME, glass: GLASS });
    f.sash(sz(1045), sz(1070), y0, y1, { cols: 2, frame: FRAME, glass: GLASS });
    f.sash(sz(1132), sz(1185), y0, y1, { cols: 2, frame: FRAME, glass: GLASS }, 3);
  }
}
front.panel('trim', px(458), px(515), 0.1, py(62), 2, GREEN); // the green stack
for (const f of [right, left]) f.panel('trim', sz(1130), sz(1187), 0.1, py(62), 2, GREEN);
front.panel('trim', px(339), px(379), 0, py(330), 1, GREY);
front.panel('door', px(345), px(373), 0.02, 2.1, 2, '#b9b7ae');
for (let n = 0; n < 6; n++) { const a = 457 + n * 44.4, b = a + 22; for (const c of [272, 415]) back.sash(bx(c), bx(c + 23), by(b), by(a), { cols: 2, frame: FRAME, glass: GLASS }); }

// The balconies.
for (let n = 0; n < 6; n++) {
  const y0 = py(104 + 0 + (5 - n) * 45.3 + 0), y1 = y0 + 1.15;
  k.trim(px(162), px(257), y0, y1, 0, 1.2, SLAB); // across the front
  k.trim(W, W + 1.2, y0, y1, -3.5, 1.2, SLAB); // along the right flank
  k.trim(W + 1.2, W + 1.24, y0, y1, -D + 0.1, -D + 1.3, GREY);
  k.trim(W, W + 1.2, y0, y0 + 0.1, -D + 0.1, -D + 1.3, GREY);
}

export const building: Drawn = {
  id: 'cedar_court_flats', type: 'style_tower_flats', name: 'Cedar Court Flats', storeys: 7, span: W, pieces: k.pieces,
  sheet: { file: 'style_tower_flats', front: { px0: 183, ground: 372, m: 17.6 }, side: { px0: 873, ground: 372, m: 17.6 }, back: { px0: 183, ground: 758, m: 17.6 }, top: { px0: 873, ground: 720, m: 16 } },
};
