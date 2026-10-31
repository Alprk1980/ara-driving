// Fern Court Flats, from drawings/sheets/style_garden_flats.png. 37 px to the metre, from its 2.1 m front doors, so 16.4 m wide rather
// than the idea's 14. The back is drawn a shade smaller on the sheet, at 36 px. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#d9d6ad', BAND = '#eef0dc', SLATE = '#8c98a6', SLATE_TOP = '#a3aeba', WHITE = '#f4f5f2', FRAME = '#46505c', DOOR = '#8b5f3c', STEEL = '#2f3640', POST = '#c9ced4', LEAD = '#8e99a5', PLINTH = '#b9bfc5';
const W = 16.35, D = 11.7, EAVES = 5.35, BREAK = 8.4, TOP = 9.2, BAND0 = 2.46, BAND1 = 2.97;
const px = (p: number) => (p - 50) / 37, sz = (p: number) => -(p - 868) / 37, bx = (p: number) => W - (p - 60) / 36;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-0.03, W + 0.03, 0, 0.18, -D - 0.03, 0.03, PLINTH);
for (const f of [front, back]) f.panel('trim', 0, W, BAND0, BAND1, 1, BAND);
for (const f of [right, left]) f.panel('trim', 0, -D, BAND0, BAND1, 1, BAND);
k.trim(-0.16, W + 0.16, EAVES - 0.2, EAVES, -D - 0.16, 0.16, WHITE); // the fascia

// The mansard. The sheet's pale blocks at its corners aren't in its roof plan and would poke through the slope, so they're left out.
k.slope(-0.16, W + 0.16, EAVES, BREAK - EAVES, -D - 0.16, 0.16, SLATE, 1.5);
k.slope(1.34, W - 1.34, BREAK, TOP - BREAK, -D + 1.34, -1.34, SLATE_TOP, 2.5);
const dormer = (f: ReturnType<typeof k.face>, a: number, b: number, y0: number, y1: number, cols: number) => f.dormer(a, b, y0, y1, WHITE, WHITE, { cols, frame: FRAME }, 1.4, 0.45);
for (const a of [140, 325, 510]) dormer(k.face('front', -0.25), px(a), px(a + 57), 6.2, 7.7, 2);
for (const a of [172, 442]) dormer(k.face('back', -D + 0.25), bx(a), bx(a + 94), 6.5, 8, 3);
for (const f of [k.face('right', W - 0.25), k.face('left', 0.25)]) for (const a of [965, 1143]) dormer(f, sz(a), sz(a + 57), 6.2, 7.7, 2);

/** The window the drawing uses: one wide pane with a split light beside it, on a pale cill. */
function light(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 3) {
  f.sash(a0, a1, y0, y1, { cols, rows: 1, frame: FRAME });
  f.panel('trim', a0 - 0.08, a1 + 0.08, y0 - 0.1, y0, 2, WHITE);
}

// The front: flats' French doors with Juliet balconies over, doors and lights under the colonnade.
for (const a of [90, 282, 553]) { light(front, px(a), px(a + 66), 3.6, 4.87); light(front, px(a), px(a + 66), 0.97, 2.24); }
for (const a of [185, 377, 468]) {
  front.sash(px(a), px(a + 54), 2.98, 4.87, { cols: 2, frame: FRAME });
  k.trim(px(a - 7), px(a + 61), 3.86, 3.92, 0.02, 0.3, STEEL); // the balcony's rail
  k.trim(px(a - 7), px(a + 61), 2.98, 3.04, 0.02, 0.3, STEEL);
  for (let i = 0; i <= 5; i++) { const x = px(a - 7) + (i / 5) * (px(a + 61) - px(a - 7) - 0.04); k.trim(x, x + 0.04, 2.98, 3.92, 0.26, 0.3, STEEL); }
}
for (const a of [198, 388, 478]) {
  front.panel('door', px(a), px(a + 34), 0.08, 2.18, 2, DOOR);
  front.panel('trim', px(a) - 0.05, px(a + 34) + 0.05, 0.08, 2.24, 1, FRAME);
  front.sash(px(a - 13), px(a - 3), 0.1, 2.2, { cols: 1, frame: FRAME });
}
k.trim(-0.1, W + 0.1, 2.46, 2.7, 0, 1.5, LEAD); // the colonnade's roof
for (const a of [58, 160, 255, 355, 450, 548, 648]) k.trim(px(a) - 0.1, px(a) + 0.1, 0.05, 2.46, 1.28, 1.48, POST);
k.trim(-0.1, W + 0.1, 0, 0.08, 0, 1.5, PLINTH);

// The back.
for (const a of [100, 242, 385, 526]) light(back, bx(a), bx(a + 82), 3.7, 5.2);
light(back, bx(100), bx(182), 1.25, 2.4);
for (const a of [286, 385]) { back.panel('trim', bx(a) + 0.05, bx(a + 39) - 0.05, 0.08, 2.2, 1, FRAME); back.panel('door', bx(a), bx(a + 39), 0.1, 2.15, 2, DOOR); }
back.sash(bx(525), bx(608), 0.1, 2.2, { cols: 2, frame: FRAME });

// The sides.
for (const f of [right, left]) for (const a of [1043, 1132]) { light(f, sz(a), sz(a + 43), 3.73, 4.9, 2); light(f, sz(a), sz(a + 43), 1.13, 2.27, 2); }

export const building: Drawn = {
  id: 'fern_court_flats', type: 'style_garden_flats', name: 'Fern Court Flats', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'style_garden_flats', front: { px0: 50, ground: 348, m: 37 }, side: { px0: 868, ground: 348, m: 37 }, back: { px0: 60, ground: 737, m: 36 }, top: { px0: 730, ground: 698, m: 36 } },
};
