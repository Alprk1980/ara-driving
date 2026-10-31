// Crescent Tower, from drawings/sheets/style_glass_tower.png. 14.3 px to the metre, from its 2.1 m doors, so 38.7 x 30.6 m and 25.5 m tall.
// Eight drawn floors of green glass behind stone fins, stepping in to a crown. The crown's stepped outline in plan is simplified to
// nested rectangles, which is what all three elevations show. The left side isn't drawn: it mirrors the right.
import { Kit, type Drawn } from './kit.ts';

const GREEN = '#5f8f77', STONE = '#d6d1bf', PALE = '#e4e1d4', OLIVE = '#a8a57f', RAIL = '#bdd6d2', SLAB = '#c9c4b2', GREY = '#b4b7bb', DARK = '#3f4a4c', GLASS = '#7fae97', ROOF = '#9fa8a6';
const W = 38.7, D = 30.6;
const px = (p: number) => (p - 65) / 14.3, py = (p: number) => (372 - p) / 14.3, sz = (p: number) => -(p - 808) / 14.3, bx = (p: number) => W - (p - 65) / 14.3, by = (p: number) => (757 - p) / 14.3;

const k = new Kit(), front = k.face('front', 0), back = k.face('back', -D), right = k.face('right', W), left = k.face('left', 0);

// The tiers, each stepping in: [x0, x1, y0, y1, z inset].
const TIERS: [number, number, number, number, number, string][] = [
  [0, W, 0, py(175), 0, GREEN],
  [px(85), px(598), py(175), py(130), 1.4, GREEN],
  [px(123), px(558), py(130), py(88), 3.1, GREEN],
  [px(185), px(495), py(88), py(43), 5.2, OLIVE],
  [px(290), px(392), py(43), py(10), 10, PALE],
];
for (const [x0, x1, y0, y1, inset, color] of TIERS) { k.wall(x0, x1, y0, y1, -D + inset, -inset, color); k.trim(x0 - 0.3, x1 + 0.3, y1, y1 + 0.2, -D + inset - 0.3, -inset + 0.3, RAIL); }
k.slope(px(290), px(392), py(10) + 0.2, 0.03, -D + 10, -10, ROOF, 0.1);
k.wall(px(185), px(290), py(55), py(43), -D + 8, -8, PALE);

// A band of pale panel across each floor, and the fins standing out through them.
const FLOORS = [py(327), py(283), py(240), py(196)];
for (const y of FLOORS) { for (const [z0, z1] of [[0, 0.3], [-D - 0.3, -D]]) k.trim(0, W, y, y + 0.34, z0, z1, SLAB); for (const [x0, x1] of [[-0.3, 0], [W, W + 0.3]]) k.trim(x0, x1, y, y + 0.34, -D, 0, SLAB); }
const FIN = 0.6, step = 29.3;
for (let p = 110; p < 590; p += step) {
  const centre = p > 280 && p < 405, top = centre ? py(55) : p < 125 || p > 560 ? py(175) : py(150), rearDoors = p > 240 && p < 405; // the fins stop short over the doors
  for (const [z0, z1, y0, y1] of [[0, FIN, centre ? py(322) : 0.2, top], [-D - FIN, -D, rearDoors ? by(690) : 0.2, top === py(55) ? py(150) : top]] as const) k.trim(px(p) - 0.32, px(p) + 0.32, y0, y1, z0, z1, STONE);
}
for (let p = 850; p < 1220; p += 29.3) for (const [x0, x1] of [[W, W + FIN], [-FIN, 0]]) k.trim(x0, x1, Math.abs(p - 1011) < 15 ? 2.6 : 0.2, py(175), sz(p + 4.5), sz(p - 4.5), STONE);
k.trim(-FIN, W + FIN, 0, 0.2, -D - FIN, FIN, GREY);

// The upper floors' lights on the tiers.
const ribbon = (f: ReturnType<typeof k.face>, a0: number, a1: number, y0: number, y1: number, cols: number) => f.sash(Math.min(a0, a1), Math.max(a0, a1), y0, y1, { cols, frame: DARK, glass: GLASS, bar: 0.14 });
for (const [a, b] of [[125, 165], [520, 558]]) ribbon(k.face('front', -1.4), px(a), px(b), py(142), py(112), 2);
for (const [a, b] of [[186, 278], [405, 495]]) ribbon(k.face('front', -3.1), px(a), px(b), py(98), py(68), 4);
for (const [a, b] of [[125, 165], [520, 558]]) ribbon(k.face('back', -D + 1.4), bx(b), bx(a), by(525), by(500), 2);
for (const f of [k.face('right', px(598)), k.face('left', px(85))]) ribbon(f, sz(860), sz(925), py(142), py(112), 3);
for (const a of [125, 165, 200, 235, 405, 445, 485, 520]) ribbon(front, px(a), px(a + 22), py(320), py(290), 1);
for (const a of [135, 170, 225, 260, 440, 475, 520, 555]) ribbon(back, bx(a + 22), bx(a), by(700), by(670), 1);

// The balconies at the four corners.
for (const y of [py(232), py(275), py(318)]) for (const [x0, x1] of [[-0.6, 3], [W - 3, W + 0.6]]) { for (const [z0, z1] of [[0, 1.2], [-D - 1.2, -D]]) { k.trim(x0, x1, y, y + 0.16, z0, z1, SLAB); k.trim(x0, x1, y + 0.16, y + 1.05, z0 + (z0 === 0 ? 1.14 : 0), z1 - (z0 === 0 ? 0 : 1.14), RAIL); } }

// The entrance, and the back's doors.
k.trim(px(283), px(400), py(322), py(316), 0, 2, PALE);
for (const a of [283, 396]) k.trim(px(a), px(a + 4), 0, py(322), 1.7, 1.95, PALE);
front.panel('trim', px(290), px(395), 0, py(324), 1, DARK);
front.panel('door', px(328), px(352), 0.02, 2.12, 2, GLASS);
front.panel('trim', px(339.7), px(340.3), 0.02, 2.12, 3, DARK);
const rear = k.face('back', -D);
rear.panel('trim', bx(390), bx(292), 0.2, by(690), 1, GREY);
rear.panel('door', bx(355), bx(323), 0.2, 2.3, 2, '#8d9498');
rear.panel('garage_door', bx(435), bx(390), 0.2, by(698), 1, DARK);
right.panel('door', sz(1020), sz(1003), 0.2, 2.3, 1, '#8d9498');

export const building: Drawn = {
  id: 'crescent_tower', type: 'style_glass_tower', name: 'Crescent Tower', storeys: 8, span: W, pieces: k.pieces,
  sheet: { file: 'style_glass_tower', front: { px0: 65, ground: 372, m: 14.3 }, side: { px0: 808, ground: 372, m: 14.3 }, back: { px0: 65, ground: 757, m: 14.3 }, top: { px0: 750, ground: 710, m: 14.3 } },
};
