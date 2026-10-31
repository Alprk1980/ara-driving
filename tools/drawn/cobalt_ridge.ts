// Cobalt Ridge, from drawings/sheets/style_ribbon_office.png. 13.2 px to the metre, from its 2.1 m doors, which also keeps it inside the
// business district's 44 m, so 43.8 x 24 m rather than the idea's 32 x 22. Seven drawn floors under a plant room (the idea said eight),
// 2.95 m apiece, tight for offices but what the drawing shows. The sheet's corner notches in plan are left out, as neither elevation
// shows them. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const CORE = '#59636f', SPANDREL = '#8f9aa5', PALE = '#e4e3dc', FIN = '#3f4852', GLASS = '#a8cbe4', FRAME = '#46505c', ROOF = '#bcc1c8', DOOR = '#b6d6ea';
const W = 43.8, D = 24, FLOOR = 2.95, GROUND = 2.8, UPPER = 6, TOPFLOOR = GROUND + FLOOR * UPPER, SET = 35.8, PARAPET = 20.4, HIGH = 23.6, LOW = 21.9, PLANT = 25, TOWER = -15;
const px = (p: number) => (p - 87) / 13.2, bx = (p: number) => W - (p - 82) / 13.2, sz = (p: number) => -(p - 915) / 13.2;
const floorY = (n: number) => GROUND + n * FLOOR; // the base of upper floor n, from 0

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, floorY(UPPER - 1), -D, 0, CORE);
k.wall(0, SET, floorY(UPPER - 1), PARAPET, -D, 0, CORE); // the top floor stops short of the right-hand end
k.wall(0, SET, PARAPET, LOW, -D, 0, PALE);
k.wall(0, 8.6, LOW, HIGH, -D, 0, PALE); // the raised end of the parapet
k.wall(SET, W, floorY(UPPER - 1), LOW, -D, TOWER, PALE); // the stair tower carries on up at the right-hand end
k.wall(14.2, 31.4, LOW, PLANT, -16, -8, PALE); // the plant room
k.slope(SET, W, floorY(UPPER - 1), 0.12, -D, 0, ROOF, 0.05);
for (const a of [[16, 18.2], [26.5, 28.7]]) k.face('front', -8).panel('trim', a[0], a[1], LOW + 0.6, 24.2, 1, '#b5bbc1');

/** A floor's ribbon: a spandrel below, the glass bays in their frames above, and a thin steel fin. */
function ribbon(f: ReturnType<typeof k.face>, bays: number[][], n: number, cols: number) {
  const y = floorY(n);
  for (const [a, b] of bays) f.sash(a, b, y + 0.75, y + FLOOR - 0.15, { cols, frame: FRAME, glass: GLASS, bar: 0.1 }, 1);
}
const SPAN = 0.45;
for (let n = 0; n < UPPER; n++) {
  const y = floorY(n), reach = n === UPPER - 1 ? SET : W;
  k.trim(0, reach, y, y + 0.72, 0, SPAN, SPANDREL); // front
  if (n < UPPER - 1) k.trim(-0.6, W + 0.6, y + 2.1, y + 2.18, 0, 0.75, FIN); // the fin
  for (const [a, b] of [[0, bx(482)], [bx(296), W]]) k.trim(a, b, y, y + 0.72, -D - SPAN, -D, SPANDREL); // back, either side of the core
  for (const [x0, x1] of [[W, W + SPAN], [-SPAN, 0]]) if (x0 !== W || n < UPPER - 1) k.trim(x0, x1, y, y + 0.72, TOWER, 0, SPANDREL); // the sides, up to the tower
}
const frontBays = [[px(103), px(193)], [px(200), px(308)], [px(315), px(440)], [px(446), px(553)], [px(560), px(650)]];
for (let n = 0; n < UPPER; n++) ribbon(front, n === UPPER - 1 ? frontBays.slice(0, 4) : frontBays, n, 4);

// The ground floor: glass behind pale columns, and the glazed entrance under its canopy.
const columns = [px(90), px(195), px(308), px(440), px(553), px(652)];
for (const c of columns) k.trim(c - 0.25, c + 0.25, 0, GROUND, 0, SPAN, PALE);
for (const [a, b] of [[103, 188], [200, 303], [446, 548], [558, 648]]) front.sash(px(a), px(b), 0.9, 2.6, { cols: 4, frame: FRAME, glass: GLASS, bar: 0.1 }, 1);
front.panel('trim', px(315), px(436), 0.05, 2.75, 1, DOOR);
for (const a of [343, 382]) { front.panel('trim', px(a) - 0.05, px(a + 27) + 0.05, 0.05, 2.25, 2, FRAME); front.panel('door', px(a), px(a + 27), 0.05, 2.2, 3, DOOR); }
k.trim(px(313), px(440), GROUND, GROUND + 0.28, 0, 1.2, PALE);

// The back: the pale core, with a stack of short ribbons up it.
back.panel('trim', bx(482), bx(296), 0, PARAPET, 1, PALE);
const backBays = [[bx(186), bx(96)], [bx(296), bx(202)], [bx(572), bx(482)], [bx(662), bx(578)]];
for (let n = 0; n < UPPER - 1; n++) { for (const [a, b] of backBays) ribbon(back, [[a, b]], n, 3); ribbon(back, [[bx(412), bx(340)]], n, 3); k.trim(bx(412), bx(340), floorY(n), floorY(n) + 0.72, -D - SPAN, -D, SPANDREL); }
back.panel('trim', 0, W, floorY(UPPER - 1) + 0.72, LOW, 1, PALE); // the back has one ribbon fewer: the top floor is plain
for (const [a, b] of [[96, 192], [548, 646]]) back.sash(bx(b), bx(a), 0.7, 2.5, { cols: 4, frame: FRAME, glass: GLASS, bar: 0.1 }, 1);
back.sash(bx(412), bx(340), 0.1, 2.5, { cols: 3, frame: FRAME, glass: GLASS, bar: 0.1 }, 2);
for (const [a, b] of [[208, 234], [252, 278], [452, 478], [486, 512]]) back.panel('door', bx(b), bx(a), 0.05, 2.15, 2, '#a7adb4');

ribbon(k.face('right', SET), [[sz(928), sz(1020)], [sz(1020), sz(1112)]], UPPER - 1, 3); // the top floor, set back at the right-hand end

// The sides: ribbons toward the front, the pale stair tower behind, with a slit of windows.
for (const f of [right, left]) {
  f.panel('trim', TOWER, -D, 0, LOW, 1, PALE);
  const bay = [[sz(928), sz(1020)], [sz(1020), sz(1112)]];
  for (let n = 0; n < UPPER; n++) { if (f === left || n < UPPER - 1) ribbon(f, bay, n, 3); f.sash(sz(1147), sz(1175), floorY(n) + 0.75, floorY(n) + FLOOR - 0.15, { cols: 1, frame: FRAME, glass: GLASS }, 2); }
  f.sash(sz(928), sz(1112), 0.7, 2.6, { cols: 6, frame: FRAME, glass: GLASS, bar: 0.1 }, 1);
  f.sash(sz(1147), sz(1175), 0.1, 2.5, { cols: 2, frame: FRAME, glass: GLASS }, 2);
}

export const building: Drawn = {
  id: 'cobalt_ridge', type: 'style_ribbon_office', name: 'Cobalt Ridge', storeys: 8, span: W, pieces: k.pieces,
  sheet: { file: 'style_ribbon_office', front: { px0: 87, ground: 357, m: 13.2 }, side: { px0: 915, ground: 357, m: 13.2 }, back: { px0: 82, ground: 729, m: 13.2 }, top: { px0: 845, ground: 690, m: 13.2 } },
};
