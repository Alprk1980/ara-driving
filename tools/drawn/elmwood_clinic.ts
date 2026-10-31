// Elmwood Clinic, from drawings/sheets/place_clinic.png. 38 px to the metre, from its 2.1 m door, so 16 x 13.7 m. Three glazed saw-teeth run
// front to back, as the front, back and plan agree; the side view draws teeth too, which it couldn't if so, and isn't followed. The left
// side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#dfc2ad', ROOF = '#79848f', STEEL = '#8d99a5', GLASS = '#a9c0d2', FRAME = '#4f5b68', STONE = '#d5cdbb', DOOR = '#8a5a35', PIPE = '#8d97a2';
const W = 16, D = 13.7, WALL = 6.4, BASE = 7.2, RIDGE = 9.5;
const px = (p: number) => (p - 42) / 38, py = (p: number) => (372 - p) / 38, sz = (p: number) => -(p - 788) / 38, bx = (p: number) => W - (p - 42) / 38, by = (p: number) => (745 - p) / 38;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, WALL, -D, 0, BRICK);
k.trim(-0.04, W + 0.04, WALL, WALL + 0.1, -D - 0.04, 0.04, STONE);
k.wall(0.05, W - 0.05, WALL, BASE, -D + 0.05, -0.05, STEEL);
for (const f of [k.face('front', -0.05), k.face('back', -D + 0.05)]) for (let i = 0; i < 3; i++) { const a = 0.15 + i * 5.33; f.sash(a, a + 5.1, WALL + 0.12, BASE - 0.05, { cols: 5, frame: FRAME, glass: GLASS, bar: 0.08 }, 1); }
for (const f of [k.face('right', W - 0.05), k.face('left', 0.05)]) f.sash(-0.15, -D + 0.15, WALL + 0.12, BASE - 0.05, { cols: 8, frame: FRAME, glass: GLASS, bar: 0.08 }, 1);

// The teeth: sheet on the long slope, a glazed end at front and back, and a steel edge along each rake.
for (const [x0, ridge, x1] of [[0, 1.4, 5.5], [5.5, 6.47, 10.6], [10.6, 11.6, 16]]) {
  const peak = (ridge - x0) / (x1 - x0);
  k.roof(x0, x1, BASE, RIDGE - BASE, -D, 0, ROOF, 'z', { peak });
  for (const [z0, z1] of [[0, 0.03], [-D - 0.03, -D]]) k.roof(x0 + 0.05, x1 - 0.05, BASE + 0.02, RIDGE - BASE - 0.2, z0, z1, GLASS, 'z', { peak, hip: 0.001 });
  for (const z of [0.05, -D - 0.05]) { const f = k.face(z > 0 ? 'front' : 'back', z); f.rake(x0, ridge, BASE, RIDGE - 0.1, 0.16, STEEL, 1); f.rake(ridge, x1, RIDGE - 0.1, BASE, 0.16, STEEL, 1); for (const c of [0.3, 0.55, 0.78]) { const x = ridge + (x1 - ridge) * c, top = RIDGE - (RIDGE - BASE) * c; f.panel('trim', x - 0.03, x + 0.03, BASE, top, 1, FRAME); } }
}

/** The drawing's window: a wide centre, side lights, and small panes under them. */
function light(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, layer = 1) {
  f.panel('trim', a0, a1, y0, y1, layer, FRAME);
  const c0 = a0 + (a1 - a0) * 0.28, c1 = a1 - (a1 - a0) * 0.28, split = y0 + (y1 - y0) * 0.25;
  f.panel('window', c0, c1, y0 + 0.05, y1 - 0.05, layer + 1, GLASS);
  for (const [p, q] of [[a0 + 0.05, c0 - 0.05], [c1 + 0.05, a1 - 0.05]]) { f.panel('window', p, q, split, y1 - 0.05, layer + 1, GLASS); f.panel('window', p, q, y0 + 0.05, split - 0.05, layer + 1, GLASS); }
}

// The front's bays, and the porch.
for (const a of [92, 285, 480]) {
  const x0 = px(a), x1 = px(a + 120), lower = a !== 285, base = lower ? 0 : py(250), f = k.face('front', 0.55);
  k.wall(x0, x1, base, py(148), 0, 0.55, BRICK);
  k.slope(x0 - 0.08, x1 + 0.08, py(160), py(147) - py(160), -0.05, 0.63, STEEL, 0.05);
  light(f, x0 + 0.1, x1 - 0.1, py(240), py(160));
  if (lower) { f.panel('trim', x0, x1, py(270), py(242), 1, STONE); light(f, x0 + 0.1, x1 - 0.1, py(355), py(272)); k.trim(x0 - 0.05, x1 + 0.05, 0, py(358), 0, 0.6, STONE); } else f.panel('trim', x0, x1, py(252), py(242), 1, STONE);
}
k.trim(px(245), px(447), py(265), py(252), 0, 1.7, STEEL);
for (const [a, b] of [[250, 270], [422, 440]]) k.trim(px(a), px(b), 0, py(265), 1.2, 1.6, BRICK);
front.panel('trim', px(307), px(385), 0, py(270), 1, FRAME);
front.panel('door', px(328), px(365), 0.02, 2.12, 2, DOOR);
for (const a of [311, 368]) front.panel('window', px(a), px(a + 14), 0.1, py(295), 2, GLASS);
front.panel('window', px(311), px(382), py(292), py(273), 2, GLASS);

// The sides, and the back.
const ribbon = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 3) => f.sash(Math.min(a0, a1), Math.max(a0, a1), y0, y1, { cols, frame: FRAME, glass: GLASS, bar: 0.07 });
for (const f of [right, left]) {
  ribbon(f, sz(828), sz(917), py(213), py(160));
  light(f, sz(1087), sz(1001), py(240), py(160));
  ribbon(f, sz(1180), sz(1267), py(213), py(160));
  ribbon(f, sz(1001), sz(1087), py(332), py(272));
  for (const a of [828, 1227]) { f.panel('trim', sz(a), sz(a + 42), 0, 2.65, 1, FRAME); f.panel('door', sz(a + 3), sz(a + 39), 0.02, 2.6, 2, '#9db4c6'); }
}
for (const [a, b] of [[97, 155], [272, 315], [362, 420], [545, 602]]) ribbon(back, bx(b), bx(a), by(590), by(537), 2);
for (const [a, b] of [[97, 155], [272, 315]]) ribbon(back, bx(b), bx(a), by(703), by(650), 2);
for (const [a, b] of [[362, 438], [525, 602]]) { back.panel('trim', bx(b), bx(a), 0, 2.6, 1, FRAME); const m = (bx(a) + bx(b)) / 2; back.panel('door', bx(b) + 0.06, m - 0.03, 0.02, 2.55, 2, GLASS); back.panel('door', m + 0.03, bx(a) - 0.06, 0.02, 2.55, 2, GLASS); }
for (const a of [245, 450]) back.panel('trim', bx(a + 5), bx(a), 0, WALL, 1, PIPE);

export const building: Drawn = {
  id: 'elmwood_clinic', type: 'place_clinic', name: 'Elmwood Clinic', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'place_clinic', front: { px0: 42, ground: 372, m: 38 }, side: { px0: 788, ground: 372, m: 38 }, back: { px0: 42, ground: 745, m: 38 }, top: { px0: 735, ground: 695, m: 37 } },
};
