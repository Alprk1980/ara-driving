// Ashfield Chambers, from drawings/sheets/style_stone_chambers.png. 19 px to the metre, from its 2.1 m back door, so 30.8 x 21 m and six
// floors under an attic. Stone piers run up the front, three portals take the street floor, and a heavy cornice caps it. The left side
// isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const STONE = '#d9bc84', PIER = '#e1c896', SHADE = '#c9aa72', CORNICE = '#e6d2a6', PLINTH = '#a4a6a8', FRAME = '#4a5560', GLASS = '#a9bccb', PORTAL = '#8f9398', DARK = '#39424c', ROOF = '#a4adb8';
const W = 30.8, D = 21, TOP = 17.3, ATTIC = 19, SET = 4.2;
const px = (p: number) => (p - 55) / 19, py = (p: number) => (372 - p) / 19, sz = (p: number) => -(p - 832) / 19, bx = (p: number) => W - (p - 55) / 19, by = (p: number) => (745 - p) / 19;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);
k.wall(0, W, 0, TOP, -D, 0, STONE);
k.trim(-0.04, W + 0.04, 0, py(352), -D - 0.04, 0.04, PLINTH);
k.trim(-0.05, W + 0.05, py(265), py(258), -D - 0.05, 0.05, CORNICE); // the string over the street floor
k.trim(-0.1, W + 0.1, py(80), py(73), -D - 0.1, 0.1, CORNICE);
k.trim(-0.65, W + 0.65, py(55), py(45), -D - 0.65, 0.65, CORNICE); // the cornice
k.trim(-0.3, W + 0.3, py(45), py(38), -D - 0.3, 0.3, SHADE);
k.slope(0.2, W - 0.2, py(38), 0.03, -D + 0.2, -0.2, ROOF, 0.05);
k.wall(px(135), px(558), py(38) - 0.2, ATTIC, -D + SET, -SET, STONE);
k.trim(px(133), px(560), ATTIC, ATTIC + 0.1, -D + SET - 0.05, -SET + 0.05, CORNICE);

// The piers on the front, back and sides.
const piers = (f: ReturnType<typeof k.face>, list: number[][], y0: number) => { for (const [a, b] of list) f.panel('trim', a, b, y0, py(80), 1, PIER); };
piers(front, [[57, 83], [133, 152], [197, 217], [287, 307], [375, 395], [463, 488], [535, 557], [607, 638]].map(([a, b]) => [px(a), px(b)]), py(258));
piers(back, [[57, 83], [130, 151], [181, 204], [238, 260], [296, 320], [360, 385], [418, 442], [477, 500], [528, 553], [610, 638]].map(([a, b]) => [bx(b), bx(a)]), py(352));
for (const f of [right, left]) piers(f, [[835, 862], [927, 948], [992, 1012], [1058, 1078], [1125, 1147], [1200, 1228]].map(([a, b]) => [sz(a), sz(b)]), py(258));

const ROWS = [[255, 222], [208, 175], [160, 127], [113, 80]], LOW = [[352, 320], [304, 272]];
const win = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols = 2) => f.sash(a0, a1, y0, y1, { cols, frame: FRAME, glass: GLASS, bar: 0.07 });
for (const [a, b] of [[90, 130], [155, 195], [229, 277], [317, 365], [405, 453], [493, 533], [562, 602]]) { for (const [y0, y1] of ROWS) win(front, px(a), px(b), py(y0), py(y1)); }
for (const [a, b] of [[90, 130], [155, 195], [493, 533], [562, 602]]) for (const [y0, y1] of LOW) win(front, px(a), px(b), py(y0), py(y1));
for (const [a, b] of [[882, 920], [955, 985], [1018, 1050], [1082, 1120], [1153, 1193]]) for (const f of [right, left]) for (const [y0, y1] of [...ROWS, ...LOW]) win(f, sz(a), sz(b), py(y0), py(y1), 1);
for (const [a, b] of [[105, 127], [156, 178], [207, 235], [265, 292], [324, 355], [388, 415], [447, 473], [503, 525], [556, 586]]) for (const [y0, y1] of [[717, 681], [659, 628], [606, 575], [553, 522], [501, 470]]) { if (a === 388 && y0 === 717) continue; win(back, bx(b), bx(a), by(y0), by(y1), 1); }

// The three portals, and the back door.
for (const [a, b] of [[220, 288], [307, 377], [396, 466]]) {
  front.panel('trim', px(a), px(b), 0, py(278), 1, PORTAL);
  front.panel('trim', px(a + 7), px(b - 7), 0, py(285), 2, DARK);
  front.panel('window', px(a + 10), px(b - 10), py(315), py(290), 3, GLASS);
  front.panel('trim', px(a + 7), px(b - 7), py(330), py(315), 3, STONE);
  const m = (px(a) + px(b)) / 2;
  front.panel('door', m - 0.85, m - 0.04, 0.02, 2.1, 3, GLASS);
  front.panel('door', m + 0.04, m + 0.85, 0.02, 2.1, 3, GLASS);
}
back.panel('trim', bx(417), bx(386), 0, by(681), 1, PLINTH);
back.panel('door', bx(415), bx(388), 0, 2.15, 2, GLASS);

export const building: Drawn = {
  id: 'ashfield_chambers', type: 'style_stone_chambers', name: 'Ashfield Chambers', storeys: 6, span: W, pieces: k.pieces,
  sheet: { file: 'style_stone_chambers', front: { px0: 55, ground: 372, m: 19 }, side: { px0: 832, ground: 372, m: 19 }, back: { px0: 55, ground: 745, m: 19 }, top: { px0: 830, ground: 725, m: 16 } },
};
