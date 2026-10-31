// Hollis Semis, from drawings/sheets/style_brick_semis.png. 34 px to the metre, from the 2.1 m side door, so 16.6 x 10.7 m. A matched pair
// tied by the tall central stack. The roof plan and the lean-to in the side view copy the reference sheet's house, not this one, so
// they're left out, and the elevations stand. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#a9543f', SLATE = '#5f6c79', STONE = '#d8ccb0', WHITE = '#f3f2ec', CREAM = '#ece2c6', TIMBER = '#5c3f2c', FRAME = '#5a6470', GLASS = '#b3c5d4', POT = '#9a4a37', PIPE = '#8f98a2';
const W = 16.55, D = 10.7, EAVES = 5.5, RIDGE = 9.6, STACK = 10, OVER = 0.15;
const px = (p: number) => (p - 65) / 34, py = (p: number) => (373 - p) / 34, sz = (p: number) => -(p - 850) / 34, bx = (p: number) => W - (p - 65) / 34, by = (p: number) => (748 - p) / 34;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-0.02, W + 0.02, 0, 0.12, -D - 0.02, 0.02, STONE);
k.trim(-OVER, W + OVER, EAVES - 0.14, EAVES, -D - OVER, OVER, WHITE);
k.roof(-OVER, W + OVER, EAVES, RIDGE - EAVES, -D - OVER, OVER, SLATE, 'x', { hip: 3.9 });

// The front gables, half-timbered over the bays, and the plain brick ones at the back.
for (const [a, b] of [[62, 245], [450, 635]]) {
  const x0 = px(a), x1 = px(b), mid = (x0 + x1) / 2, top = 8.3, f = k.face('front', 0.34), rise = top - EAVES;
  k.roof(x0, x1, EAVES, rise, -4, 0.3, SLATE, 'z');
  k.wall(x0 + 0.15, x1 - 0.15, EAVES - 0.3, EAVES, -0.1, 0.3, BRICK);
  k.roof(x0, x1, EAVES, rise, 0.3, 0.34, CREAM, 'z', { hip: 0.001 }); // the plastered gable
  f.panel('trim', x0 + 0.15, x1 - 0.15, EAVES - 0.3, EAVES, 1, TIMBER);
  f.panel('trim', mid - 0.08, mid + 0.08, EAVES, top - 0.5, 1, TIMBER);
  f.rake(x0 + 0.55, mid - 0.08, EAVES, EAVES + 1.3, 0.12, TIMBER, 1);
  f.rake(mid + 0.08, x1 - 0.55, EAVES + 1.3, EAVES, 0.12, TIMBER, 1);
  f.rake(x0, mid, EAVES, top - 0.1, 0.2, WHITE);
  f.rake(mid, x1, top - 0.1, EAVES, 0.2, WHITE);
}
for (const [x0, x1] of [[bx(288), bx(55)], [bx(640), bx(407)]]) {
  const mid = (x0 + x1) / 2, top = 9.35, f = k.face('back', -D - 0.3);
  k.roof(x0, x1, EAVES, top - EAVES, -D - 0.3, -5, SLATE, 'z');
  k.wall(x0 + 0.1, x1 - 0.1, EAVES - 0.3, EAVES, -D - 0.3, -D + 0.1, BRICK);
  f.rake(x0, mid, EAVES, top - 0.1, 0.2, WHITE, 1);
  f.rake(mid, x1, top - 0.1, EAVES, 0.2, WHITE, 1);
}

// The stacks: one up the middle front and back, one on each end wall, with stone caps and pots.
function stack(x0: number, x1: number, z0: number, z1: number, base = 0) {
  k.wall(x0, x1, base, STACK, z0, z1, BRICK);
  k.trim(x0 - 0.1, x1 + 0.1, STACK, STACK + 0.22, z0 - 0.1, z1 + 0.1, STONE);
  const mid = (x0 + x1) / 2, midz = (z0 + z1) / 2;
  for (const d of Math.abs(x1 - x0) > Math.abs(z1 - z0) ? [[-0.3, 0], [0.3, 0]] : [[0, -0.3], [0, 0.3]]) k.trim(mid + d[0] - 0.12, mid + d[0] + 0.12, STACK + 0.22, STACK + 0.72, midz + d[1] - 0.12, midz + d[1] + 0.12, POT);
}
k.wall(px(318), px(378), 0, py(155), 0, 0.7, BRICK);
stack(px(322), px(372), 0, 0.5);
k.wall(bx(385), bx(310), 0, 3.4, -D - 0.6, -D, BRICK);
stack(bx(372), bx(325), -D - 0.5, -D);
for (const [x0, x1] of [[W, W + 0.5], [-0.5, 0]]) { k.wall(x0, x1, 0, EAVES + 0.4, sz(1065), sz(995), BRICK); stack(Math.min(x0, x1) + 0.05, Math.max(x0, x1) - 0.05, sz(1052), sz(1005)); }

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 2, layer = 2) => { f.sash(a0, a1, y0, y1, { cols, rows: 1, frame: FRAME, glass: GLASS, bar: 0.06 }, layer); f.panel('trim', Math.min(a0, a1) - 0.1, Math.max(a0, a1) + 0.1, y0 - 0.12, y0, layer, STONE); f.panel('trim', Math.min(a0, a1) - 0.05, Math.max(a0, a1) + 0.05, y1, y1 + 0.12, layer, '#8f3f2e'); };

// The two-storey bays.
for (const a of [100, 488]) {
  const x0 = px(a), x1 = px(a + 108), f = k.face('front', 0.55);
  k.wall(x0, x1, 0, EAVES - 0.3, 0, 0.55, BRICK);
  for (const [y0, y1] of [[py(345), py(290)], [py(240), py(190)]]) sash(f, x0 + 0.2, x1 - 0.2, y0, y1, 3, 1);
  k.trim(x0 - 0.03, x1 + 0.03, py(288), py(283), 0, 0.58, STONE);
}

// The porches, with the doors under them.
for (const [a, b, door, light] of [[233, 318, 252, 287], [378, 462, 410, 388]]) {
  k.roof(px(a), px(b), py(285), py(252) - py(285), 0, 1.3, SLATE, 'x', { peak: 0 });
  for (const c of [a + 3, b - 3]) k.trim(px(c) - 0.06, px(c) + 0.06, 0.1, py(285), 1.08, 1.2, WHITE);
  front.panel('door', px(door), px(door + 31), 0.1, 2.2, 2, WHITE);
  front.panel('trim', px(door) - 0.05, px(door + 31) + 0.05, 0.1, 2.25, 1, FRAME);
  front.sash(px(light), px(light + 19), 1.05, 2.1, { cols: 1, rows: 2, frame: FRAME, glass: GLASS });
  k.trim(px(a), px(b), 0, 0.1, 0, 1.3, STONE);
}
for (const a of [260, 402]) sash(front, px(a), px(a + 33), py(243), py(195));

// The back and sides.
for (const [a, b] of [[107, 160], [538, 592]]) sash(back, bx(b), bx(a), by(703), by(663));
for (const [a, b] of [[212, 250], [448, 486]]) sash(back, bx(b), bx(a), by(607), by(560));
for (const [a, b] of [[288, 312], [385, 405]]) sash(back, bx(b), bx(a), by(607), by(565), 1);
sash(back, bx(412), bx(388), by(710), by(665), 1, 2);
for (const a of [235, 433]) { back.panel('trim', bx(a + 31), bx(a - 1), 0.1, 2.25, 1, FRAME); back.panel('door', bx(a + 30), bx(a), 0.1, 2.2, 2, WHITE); }
for (const f of [right, left]) { sash(f, sz(1085), sz(1065), py(237), py(195), 1); sash(f, sz(1100), sz(1080), py(337), py(295), 1); f.panel('trim', sz(1192), sz(1158), 0.1, 2.2, 1, FRAME); f.panel('door', sz(1190), sz(1160), 0.1, 2.15, 2, WHITE); }
for (const [x, z] of [[-0.1, -0.2], [W, -0.2], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0.1, EAVES - 0.1, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'hollis_semis', type: 'style_brick_semis', name: 'Hollis Semis', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_brick_semis', front: { px0: 65, ground: 373, m: 34 }, side: { px0: 850, ground: 373, m: 34 }, back: { px0: 65, ground: 748, m: 34 }, top: { px0: 730, ground: 695, m: 34 } },
};
