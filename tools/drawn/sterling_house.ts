// Sterling House, from drawings/sheets/style_old_bank.png. 23 px to the metre, from its 2.3 m double door. The sheet's roof plan shows
// a hip on top, but the front and side both show a flat top, so the two elevations win. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const STONE = '#dcc28f', RUSTIC = '#d3b880', LINE = '#a98e5e', PALE = '#c9cdd1', CORNICE = '#e6e3d8', SLATE = '#59616c', ZINC = '#7f8b98', SURROUND = '#b99a64', DOOR = '#7a5634', DARK = '#35322f', CAP = '#4b525c', FRAME = '#3f4852';
const W = 25.7, D = 21.7, PLINTH = 0.35, GROUND = 4.6, TOP = 11, PARAPET = 12.5, BREAK = 14.5, ROOF_TOP = 15.8;
const px = (p: number) => (p - 48) / 23, py = (p: number) => (375 - p) / 23, bx = (p: number) => W - (p - 48) / 23, by = (p: number) => (758 - p) / 23, sz = (p: number) => -(p - 783) / 23, sy = py;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, TOP, -D, 0, STONE);
k.wall(0, W, TOP, PARAPET, -D, 0, PALE); // the attic band behind the cornice

// Plinth and the string course at first floor, all round.
k.trim(-0.05, W + 0.05, 0, PLINTH, -D - 0.05, 0.05, RUSTIC);
k.trim(-0.05, W + 0.05, GROUND - 0.12, GROUND + 0.12, -D - 0.05, 0.05, CORNICE);
k.trim(-0.25, W + 0.25, TOP, TOP + 0.4, -D - 0.25, 0.25, CORNICE); // the cornice

// The rusticated ground floor: courses of stone, arches over them.
front.panel('trim', 0, W, PLINTH, GROUND - 0.12, 1, RUSTIC);
for (let y = PLINTH + 0.42; y < GROUND - 0.3; y += 0.46) front.panel('trim', 0, W, y, y + 0.05, 2, LINE);
for (const c of [2.43, 5.74, 9.65, 16.1, 20, 23.3]) {
  front.panel('trim', c - 1.17, c + 1.17, PLINTH, 3.9, 3, SURROUND, { arch: true });
  front.panel('trim', c - 0.98, c + 0.98, PLINTH, 3.7, 4, RUSTIC, { arch: true });
  front.sash(c - 0.62, c + 0.62, 1, 3.3, { arch: true, cols: 1, frame: FRAME }, 5);
}

// The centre bay stands forward, up to the pediment.
const BAY0 = 7.7, BAY1 = 18.35, OUT = 0.8, bay = k.face('front', OUT);
k.wall(BAY0, BAY1, 0, TOP, 0, OUT, STONE);
k.trim(BAY0 - 0.3, BAY1 + 0.3, TOP, TOP + 0.4, 0, OUT + 0.25, CORNICE);
k.trim(BAY0, BAY1, 0, PLINTH, OUT, OUT + 0.05, RUSTIC);
bay.panel('trim', BAY0, BAY1, PLINTH, GROUND - 0.12, 1, RUSTIC);
for (let y = PLINTH + 0.42; y < GROUND - 0.3; y += 0.46) bay.panel('trim', BAY0, BAY1, y, y + 0.05, 2, LINE);
k.trim(BAY0, BAY1, GROUND - 0.12, GROUND + 0.12, OUT, OUT + 0.05, CORNICE);
for (const c of [9.65, 16.1]) { bay.panel('trim', c - 1.17, c + 1.17, PLINTH, 3.9, 3, SURROUND, { arch: true }); bay.panel('trim', c - 0.98, c + 0.98, PLINTH, 3.7, 4, RUSTIC, { arch: true }); bay.sash(c - 0.62, c + 0.62, 1, 3.3, { arch: true, cols: 1, frame: FRAME }, 5); }
bay.panel('trim', 11.7, 14.1, PLINTH, 3.9, 3, SURROUND, { arch: true });
bay.panel('trim', 11.95, 13.85, PLINTH, 3.7, 4, DARK, { arch: true }); // the fanlight
bay.panel('door', 12.02, 13.78, 0.3, 2.6, 5, DOOR);
bay.panel('trim', 12.87, 12.93, 0.3, 2.6, 6, DARK);

// The tall arched windows between the pilasters.
for (const x of [7.7, 10.9, 14.1, 17.4]) { bay.panel('trim', x, x + 0.75, GROUND + 0.12, TOP, 1, CORNICE); bay.panel('trim', x + 0.2, x + 0.55, GROUND + 0.12, TOP, 2, RUSTIC); }
for (const c of [9.65, 12.9, 16.05]) {
  bay.panel('trim', c - 0.9, c + 0.9, GROUND + 0.12, 10.4, 1, SURROUND, { arch: true });
  bay.sash(c - 0.68, c + 0.68, 4.95, 10.1, { arch: true, cols: 2, frame: FRAME }, 2);
  bay.panel('trim', c - 0.68, c + 0.68, 7.2, 7.75, 5, CORNICE); // the panel across it
}
k.roof(BAY0 - 0.3, BAY1 + 0.3, TOP + 0.4, 2.4, -1.2, OUT + 0.25, CORNICE, 'z'); // the pediment

// The plain windows at each side, front and back: taller on the first floor, with a cap.
function window(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cap = false, rows = 1) {
  f.panel('trim', a0 - 0.14, a1 + 0.14, y0 - 0.14, y1 + 0.14, 1, SURROUND);
  f.sash(a0, a1, y0, y1, { cols: 2, rows, frame: FRAME }, 2);
  if (cap) f.panel('trim', a0 - 0.2, a1 + 0.2, y1 + 0.14, y1 + 0.3, 2, CORNICE);
}
for (const a of [90, 165, 495, 572]) { window(front, px(a), px(a + 30), 4.9, 7.2, true, 2); window(front, px(a), px(a + 28), 8.65, 10.4, false, 2); }
for (const a of [92, 167, 291, 365, 492, 568]) { window(back, bx(a), bx(a + 30), by(648), by(598), true); window(back, bx(a), bx(a + 30), by(564), by(522)); }
for (const [a, b] of [[93, 120], [408, 434]]) window(back, bx(a), bx(b), by(720), by(686));
for (const a of [491, 566]) window(back, bx(a), bx(a + 31), by(730), by(684));
back.panel('trim', bx(245), bx(445), PLINTH, by(685), 1, '#c5a973'); // the recessed entrance
back.panel('door', bx(325), bx(365), 0.1, by(697), 2, '#9fb0bf');
back.panel('trim', bx(344), bx(346), 0.1, by(697), 3, FRAME);

// The right side, and the left as its mirror.
for (const z of [[942, 968], [1020, 1046], [1097, 1123]]) for (const [y0, y1, cap] of [[1.3, 3.4, false], [5.2, 7.3, true], [8.7, 10.4, false]] as const) { window(right, sz(z[0]), sz(z[1]), y0, y1, cap); window(left, sz(z[0]), sz(z[1]), y0, y1, cap); }
for (const f of [right, left]) for (const [a, b] of [[0, -1.2], [-D + 1.2, -D]]) for (let y = PLINTH + 0.1; y < GROUND - 0.3; y += 0.92) f.panel('trim', a, b, y, y + 0.46, 1, RUSTIC); // the quoins

// The mansard: a steep slate slope, a shallow zinc one above it, dormers through the slate.
k.slope(0.5, W - 0.5, PARAPET, BREAK - PARAPET, -D + 0.5, -0.5, SLATE, 2);
k.slope(2.5, W - 2.5, BREAK, ROOF_TOP - BREAK, -D + 2.5, -2.5, ZINC, 3.3);
const rail = (f: ReturnType<typeof k.face>, a: number, b: number) => f.dormer(a, b, 12.7, 13.9, SLATE, CAP, { cols: 2, frame: FRAME }, 1.2, 0.4);
for (const a of [118, 175, 482, 540]) rail(k.face('front', -0.75), px(a), px(a + 31));
for (const a of [126, 198, 290, 362, 455, 528]) rail(k.face('back', -D + 0.75), bx(a), bx(a + 34));
for (const f of [k.face('right', W - 0.75), k.face('left', 0.75)]) for (const a of [938, 1016, 1093]) rail(f, sz(a), sz(a + 34));

export const building: Drawn = {
  id: 'sterling_house', type: 'style_old_bank', name: 'Sterling House', storeys: 4, span: W, pieces: k.pieces,
  sheet: { file: 'style_old_bank', front: { px0: 48, ground: 375, m: 23 }, side: { px0: 783, ground: 375, m: 23 }, back: { px0: 48, ground: 758, m: 23 }, top: { px0: 750, ground: 742, m: 23 } },
};
