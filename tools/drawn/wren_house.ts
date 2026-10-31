// Wren House, from drawings/sheets/place_office.png. 41 px to the metre, from its 2.1 m back door, so 14.9 x 11.8 m. Two floors and a
// mansard, not the idea's four storeys, with cream stone bays on the front and a door case. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const BRICK = '#a96a5a', PILASTER = '#a25d4c', STONE = '#ece0bd', SLATE = '#646d78', SLATE_TOP = '#747d88', FRAME = '#2f3338', GLASS = '#a9bccb', DOOR = '#2c2a28', PLINTH = '#b6babf', LINTEL = '#8f4a3c', PIPE = '#6b7480';
const W = 14.9, D = 11.75, EAVES = 6.35, BREAK = 8.4, TOP = 8.9;
const px = (p: number) => (p - 40) / 41, py = (p: number) => (372 - p) / 41, sz = (p: number) => -(p - 818) / 41, bx = (p: number) => W - (p - 40) / 41, by = (p: number) => (757 - p) / 41;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, EAVES, -D, 0, BRICK);
k.trim(-0.02, W + 0.02, 0, 0.45, -D - 0.02, 0.02, PLINTH);
k.trim(-0.2, W + 0.2, EAVES - 0.16, EAVES, -D - 0.2, 0.2, '#aeb4ba');
k.slope(-0.1, W + 0.1, EAVES, BREAK - EAVES, -D - 0.1, 0.1, SLATE, 1.2);
k.slope(1.1, W - 1.1, BREAK, TOP - BREAK, -D + 1.1, -1.1, SLATE_TOP, 3.2);
for (const f of [front, back]) for (const [a, b] of [[40, 65], [253, 277], [412, 435], [620, 650]]) { f.panel('trim', f === front ? px(a) : bx(b), f === front ? px(b) : bx(a), 0.45, py(128), 1, PILASTER); f.panel('trim', (f === front ? px(a) : bx(b)) - 0.05, (f === front ? px(b) : bx(a)) + 0.05, py(128), EAVES - 0.16, 2, '#c08a78'); }
for (const f of [right, left]) for (const [a, b] of [[820, 843], [975, 998], [1115, 1140], [1275, 1300]]) { f.panel('trim', sz(a), sz(b), 0.45, py(128), 1, PILASTER); f.panel('trim', sz(a) + 0.05, sz(b) - 0.05, py(128), EAVES - 0.16, 2, '#c08a78'); }

const sash = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, layer = 2) => { const lo = Math.min(a0, a1), hi = Math.max(a0, a1); f.sash(lo, hi, y0, y1, { cols: 2, rows: 3, frame: FRAME, glass: GLASS, bar: 0.05 }, layer); f.panel('trim', lo - 0.08, hi + 0.08, y0 - 0.1, y0, layer, STONE); f.panel('trim', lo - 0.1, hi + 0.1, y1 + 0.03, y1 + 0.22, layer, LINTEL); };
const dormer = (f: ReturnType<typeof k.face>, a: number, b: number) => f.dormer(a, b, 6.6, 7.65, SLATE, STONE, { cols: 2, rows: 2, frame: FRAME, glass: GLASS, bar: 0.05 }, 1.2, 0.42);
for (const a of [135, 317, 500]) dormer(k.face('front', -0.15), px(a), px(a + 55));
for (const a of [145, 495]) dormer(k.face('back', -D + 0.15), bx(a + 55), bx(a));
for (const f of [k.face('right', W - 0.15), k.face('left', 0.15)]) for (const z of [-3.2, -8.1]) dormer(f, z, z - 1.35);

// The stone bays, two floors tall.
for (const a of [100, 463]) {
  const x0 = px(a), x1 = px(a + 125), f = k.face('front', 0.5);
  k.wall(x0, x1, 0, py(130), 0, 0.5, STONE);
  k.trim(x0 - 0.05, x1 + 0.05, py(133), py(128), 0, 0.55, '#f5edd3');
  for (const [y0, y1] of [[py(337), py(272)], [py(222), py(158)]]) {
    f.sash(px(a + 40), px(a + 85), y0, y1, { cols: 2, rows: 3, frame: FRAME, glass: GLASS, bar: 0.05 }, 1);
    for (const s of [8, 99]) f.sash(px(a + s), px(a + s + 18), y0, y1, { cols: 1, rows: 3, frame: FRAME, glass: GLASS, bar: 0.05 }, 1);
  }
}
sash(front, px(322), px(362), py(222), py(160));

// The door case: pediment, columns, door and lights.
k.trim(px(285), px(402), py(257), py(242), 0, 0.62, STONE);
for (const a of [290, 385]) k.trim(px(a), px(a + 13), 0.1, py(257), 0.3, 0.55, STONE);
k.trim(px(285), px(402), 0, 0.14, 0, 0.7, PLINTH);
front.panel('trim', px(304), px(385), 0.14, py(270), 3, FRAME);
front.panel('door', px(326), px(363), 0.2, 2.2, 4, DOOR);
for (const a of [309, 367]) front.panel('window', px(a), px(a + 13), 0.3, 2.2, 4, GLASS);
front.panel('window', px(309), px(380), 2.25, py(274), 4, GLASS);

// The back and sides.
for (const a of [98, 175, 327, 470, 555]) { sash(back, bx(a + 42), bx(a), by(593), by(532)); if (a !== 327) sash(back, bx(a + 42), bx(a), by(712), by(650)); }
back.panel('door', bx(367), bx(327), 0.45, 2.55, 2, DOOR);
for (const f of [right, left]) for (const a of [890, 1037, 1182]) for (const [y0, y1] of [[222, 160], [338, 277]]) sash(f, sz(a + 43), sz(a), py(y0), py(y1));

export const building: Drawn = {
  id: 'wren_house', type: 'place_office', name: 'Wren House', storeys: 3, span: W, pieces: k.pieces,
  sheet: { file: 'place_office', front: { px0: 40, ground: 372, m: 41 }, side: { px0: 818, ground: 372, m: 41 }, back: { px0: 40, ground: 757, m: 41 }, top: { px0: 725, ground: 712, m: 41 } },
};
