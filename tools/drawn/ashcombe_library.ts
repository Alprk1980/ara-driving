// Ashcombe Library, from drawings/sheets/place_library.png. 24 px to the metre, from its 2.6 m double doors, so 25 x 18.8 m, close to the
// idea's 28 x 22. The sheet's side view shows a gable where the hipped roof should be and a bay on the far side too: the front and roof
// plan win. Its Dutch gable is drawn plain here, as a stepped outline is too fine for a roof piece. The left side isn't drawn: it mirrors
// the right.
import { Kit, type Drawn } from './kit.ts';

const STONE = '#ece0b8', DRESSED = '#d9c995', SLATE = '#8596a6', FRAME = '#4d5863', GLASS = '#a9bccb', DOOR = '#5a6672', STEP = '#d4c9a4', PIPE = '#8c95a1', POT = '#7a8590';
const W = 25, D = 18.75, EAVES = 9.6, RIDGE = 13.5, STRING = 6.25;
const px = (p: number) => (p - 45) / 24, sz = (p: number) => -(p - 808) / 24, bx = (p: number) => W - (p - 45) / 24;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, STONE);
k.trim(-0.04, W + 0.04, 0, 0.3, -D - 0.04, 0.04, DRESSED);
k.trim(-0.04, W + 0.04, STRING - 0.08, STRING + 0.08, -D - 0.04, 0.04, DRESSED);
k.trim(-0.45, W + 0.45, EAVES - 0.25, EAVES, -D - 0.45, 0.45, DRESSED); // the eaves
k.roof(-0.5, W + 0.5, EAVES, RIDGE - EAVES, -D - 0.5, 0.5, SLATE, 'x', { hip: 5.4 });
for (const x of [8.3, 16.7]) { k.trim(x - 0.2, x + 0.2, RIDGE - 0.4, 14.4, -9.6, -9.2, POT); }

// The centre stands forward and up into the gable.
const C0 = 8.5, C1 = 16.5, OUT = 0.6, centre = k.face('front', OUT);
k.wall(C0, C1, 0, 10.7, 0, OUT, STONE);
k.wall(C0 + 0.3, C1 - 0.3, EAVES, 10.7, -3.5, 0, STONE);
k.roof(C0 - 0.05, C1 + 0.05, 10.7, 3.4, -3.5, OUT, STONE, 'z');
k.roof(C0 - 0.05, C1 + 0.05, 10.75, 3.45, -3.5, OUT - 0.08, SLATE, 'z'); // the slates behind its stone coping
k.trim(C0 - 0.12, C1 + 0.12, 10.62, 10.86, 0, OUT + 0.1, DRESSED);
k.trim(C0, C1, STRING - 0.08, STRING + 0.08, OUT, OUT + 0.04, DRESSED);
centre.panel('trim', 12.26, 12.74, 10.95, 11.9, 1, DRESSED);
centre.panel('window', 12.33, 12.67, 11, 11.85, 2, GLASS);

/** The drawing's window: tall, round-headed, in a stone surround. */
function arched(f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, layer = 1) {
  f.panel('trim', a0 - 0.1, a1 + 0.1, y0 - 0.1, y1 + 0.1, layer, DRESSED, { arch: true });
  f.sash(a0, a1, y0, y1, { cols: 2, arch: true, frame: FRAME, glass: GLASS, bar: 0.05 }, layer + 1);
}
for (const a of [85, 142, 200, 463, 521, 578]) arched(front, px(a), px(a + 28), 6.45, 8.96);
for (const a of [292, 332, 372]) arched(centre, px(a), px(a + 26), 6.45, 8.96);

// The two stone bays either side of the door.
for (const [a, b] of [[75, 238], [453, 620]]) {
  const x0 = px(a), x1 = px(b), bay = k.face('front', 1.25), L = (x1 - x0);
  k.wall(x0, x1, 0, 5.9, 0, 1.25, STONE);
  k.slope(x0 - 0.15, x1 + 0.15, 5.9, 0.28, -0.1, 1.4, DRESSED, 0.12);
  k.trim(x0, x1, 0, 0.3, 1.25, 1.29, DRESSED);
  for (const c of [0.27, 0.42, 0.57]) arched(bay, x0 + L * c, x0 + L * c + L * 0.13, 1.7, 4.5);
  for (const c of [0.06, 0.86]) { bay.panel('trim', x0 + L * c, x0 + L * (c + 0.09), 1.6, 4.6, 1, DRESSED); bay.sash(x0 + L * c + 0.06, x0 + L * (c + 0.09) - 0.06, 1.7, 4.5, { cols: 1, frame: FRAME, glass: GLASS }, 2); }
}

// The entrance: doors, top lights, steps between two piers.
centre.panel('trim', px(297), px(393), 0.3, 4.55, 1, DRESSED);
centre.panel('trim', px(308), px(382), 0.3, 4.2, 2, FRAME);
centre.sash(px(312), px(378), 2.95, 4.15, { cols: 4, frame: FRAME, glass: GLASS }, 3);
for (const [a, b] of [[318, 342], [345, 368]]) { centre.panel('door', px(a), px(b), 0.32, 2.9, 3, DOOR); centre.panel('window', px(a) + 0.15, px(b) - 0.15, 1.2, 2.7, 4, GLASS); }
for (const [z0, z1, y] of [[OUT, 1.1, 0.33], [1.1, 1.55, 0.22], [1.55, 2, 0.11]]) k.trim(px(277), px(412), 0, y, z0, z1, STEP);
for (const a of [265, 410]) k.trim(px(a), px(a + 15), 0, 0.9, OUT, 1.6, DRESSED);

// The back: seven bays, a door in the fourth.
for (const a of [88, 168, 247, 327, 407, 484, 560]) { arched(back, bx(a + 40), bx(a), 6.25, 8.75); if (a !== 327) arched(back, bx(a + 40), bx(a), 1.55, 4.3); }
back.panel('trim', bx(367), bx(327), 0.3, 4.3, 1, DRESSED, { arch: true });
back.sash(bx(362), bx(332), 2.75, 4.2, { cols: 1, arch: true, frame: FRAME, glass: GLASS }, 2);
back.panel('door', bx(362), bx(332), 0.3, 2.7, 2, DOOR);
for (const [z0, z1, y] of [[-D, -D - 0.25, 0.2], [-D - 0.25, -D - 0.5, 0.1]]) k.trim(bx(370), bx(324), 0, y, z1, z0, STEP);

// The sides: five bays, a door in the third.
for (const f of [right, left]) {
  for (const a of [855, 935, 1015, 1098, 1175]) { arched(f, sz(a), sz(a + 30), 6.45, 9.1); if (a !== 1015) arched(f, sz(a), sz(a + 30), 1.8, 4.5); }
  f.panel('trim', sz(1012), sz(1048), 0.3, 4.6, 1, DRESSED, { arch: true });
  f.sash(sz(1015), sz(1045), 2.8, 4.5, { cols: 1, arch: true, frame: FRAME, glass: GLASS }, 2);
  f.panel('door', sz(1015), sz(1045), 0.3, 2.65, 2, DOOR);
}
for (const [x0, x1] of [[W, W + 0.25], [-0.25, 0]]) k.trim(x0, x1, 0, 0.22, sz(1050), sz(1010), STEP);
for (const [x, z] of [[-0.1, -0.1], [W, -0.1], [-0.1, -D + 0.2], [W, -D + 0.2]]) k.trim(x, x + 0.1, 0, EAVES - 0.25, z - 0.1, z, PIPE);

export const building: Drawn = {
  id: 'ashcombe_library', type: 'place_library', name: 'Ashcombe Library', storeys: 2, span: W, pieces: k.pieces,
  sheet: { file: 'place_library', front: { px0: 45, ground: 353, m: 24 }, side: { px0: 808, ground: 353, m: 24 }, back: { px0: 45, ground: 740, m: 24 }, top: { px0: 730, ground: 697, m: 24 } },
};
