// Tallow Row, from drawings/sheets/style_market_row.png. 31.5 px to the metre, from its 2.1 m back doors, so 19.4 x 12.1 m. A row of shops
// under one long roof, its timber canopy running the whole front and a tile-hung gable at the centre. The left side isn't drawn: it
// mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const RENDER = '#f4ecd2', TILE = '#a65a48', HUNG = '#a0523f', WHITE = '#f6f3ea', TIMBER = '#a98b62', BRICK = '#b8604f', FRAME = '#5a6470', GLASS = '#b5c6d3', PIPE = '#9aa3ab', DOOR = '#b1b8bf';
const W = 19.4, D = 12.1, EAVES = 7.8, RIDGE = 11.3, OVER = 0.38;
const px = (p: number) => (p - 40) / 31.5, py = (p: number) => (373 - p) / 31.5, sz = (p: number) => -(p - 868) / 31.5, bx = (p: number) => W - (p - 40) / 31.5, by = (p: number) => (757 - p) / 31.5;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, RENDER);
k.trim(-0.03, W + 0.03, 0, py(355), -D - 0.03, 0.03, BRICK);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, TILE, 'x');
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, WHITE);

// The central gable: tile-hung, jettied out over the rendered bay beneath.
const G0 = px(255), G1 = px(435), MID = (G0 + G1) / 2, GTOP = py(8), jetty = k.face('front', 0.4), bargeboard = k.face('front', 0.43);
k.wall(px(260), px(430), py(210), EAVES + 0.1, -0.2, 0.4, HUNG);
k.wall(px(263), px(428), py(265), py(210), 0, 0.2, RENDER);
k.roof(G0, G1, EAVES, GTOP - EAVES, -4, 0.4, TILE, 'z');
k.roof(G0, G1, EAVES, GTOP - EAVES, 0.4, 0.43, HUNG, 'z', { hip: 0.001 });
bargeboard.rake(G0, MID, EAVES, GTOP - 0.1, 0.24, WHITE);
bargeboard.rake(MID, G1, GTOP - 0.1, EAVES, 0.24, WHITE);

const arched = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, layer = 1) => { f.sash(a0, a1, y0, y1, { cols: 2, arch: true, frame: FRAME, glass: GLASS, bar: 0.05, m: 0.05 }, layer); };
const ROWS = [[py(256), py(214)], [py(182), py(140)]];
for (const a of [73, 108, 176, 212, 453, 489, 556, 592]) for (const [y0, y1] of ROWS) arched(front, px(a), px(a + 25), y0, y1);
for (const a of [298, 365]) { arched(jetty, px(a), px(a + 26), py(182), py(140)); arched(k.face('front', 0.2), px(a), px(a + 26), py(256), py(214)); }

// The timber canopy, and the arched shop windows behind its posts.
k.roof(0, W, py(292), py(262) - py(292), 0, 2.15, TIMBER, 'x', { peak: 0 });
k.trim(0, W, py(296), py(292), 0, 2.15, TIMBER);
for (const a of [44, 155, 265, 423, 532, 643]) k.trim(px(a) - 0.1, px(a) + 0.1, 0, py(296), 1.8, 2.05, TIMBER);
for (const [a, b] of [[58, 150], [167, 258], [433, 523], [542, 632]]) {
  front.panel('trim', px(a), px(b), py(355), py(305), 2, FRAME);
  const w = (px(b) - px(a)) / 4;
  for (let i = 0; i < 4; i++) front.panel('window', px(a) + i * w + 0.05, px(a) + (i + 1) * w - 0.05, py(353), py(307), 3, GLASS, { arch: true });
}
front.panel('trim', px(298), px(390), 0.03, py(305), 1, FRAME);
for (const [a, b] of [[302, 320], [371, 388]]) front.panel('window', px(a), px(b), 0.1, 2.05, 2, GLASS);
front.panel('door', px(323), px(366), 0.03, 2.13, 2, GLASS);
front.panel('trim', px(344), px(345.5), 0.03, 2.13, 3, FRAME);

// The back: a band of first-floor lights, then what the shops need.
const strip = (a: number, b: number, y0: number, y1: number, cols: number) => back.sash(bx(b), bx(a), by(y0), by(y1), { cols, frame: FRAME, glass: GLASS, bar: 0.06 });
for (const [a, b, c] of [[71, 173, 4], [190, 293, 4], [303, 407, 4], [417, 500, 3], [516, 618, 4]]) strip(a, b, 552, 512, c);
strip(71, 154, 636, 598, 3); strip(578, 618, 636, 598, 2); strip(578, 618, 724, 686, 2); strip(423, 490, 723, 686, 3); strip(271, 294, 714, 686, 1); strip(70, 98, 702, 686, 1); strip(126, 154, 702, 686, 1);
for (const [a, y] of [[204, 664], [519, 664], [204, 752], [317, 752], [519, 752]]) { back.panel('trim', bx(a + 31), bx(a - 1), by(y) - 0.02, by(y) + 2.15, 1, FRAME); back.panel('door', bx(a + 30), bx(a), by(y), by(y) + 2.1, 2, DOOR); }

for (const f of [right, left]) { f.sash(sz(1112), sz(1090), py(162), py(140), { cols: 1, frame: FRAME, glass: GLASS }); f.sash(sz(1068), sz(1045), py(240), py(217), { cols: 1, frame: FRAME, glass: GLASS }); f.sash(sz(1023), sz(1002), py(270), py(238), { cols: 1, frame: FRAME, glass: GLASS }); }
for (const [x, z] of [[-0.1, -0.1], [W, -0.1], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, EAVES - 0.1, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'tallow_row', type: 'style_market_row', name: 'Tallow Row', storeys: 3, span: W, pieces: k.pieces,
  sheet: { file: 'style_market_row', front: { px0: 40, ground: 373, m: 31.5 }, side: { px0: 868, ground: 373, m: 31.5 }, back: { px0: 40, ground: 757, m: 31.5 }, top: { px0: 735, ground: 697, m: 31.5 } },
};
