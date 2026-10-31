// The Claude-tuned house: every size read off the clean views at 90 px to the metre, and written as code so it can be tuned against
// the plates from tools/housecheck.ts. tools/housebuild.ts makes the Qwen version from the same drawing, behind the same validator.
//   node tools/house-claude.ts    writes src/data/house-claude.json
import { writeFileSync } from 'node:fs';
import { DRAWN_HOUSE, houseErrors, trianglesOf, type Piece } from '../schemas/house.ts';

const WOOD = '#6d5647', RENDER = '#c5ccd4', ROOF = '#6f7985', TRIM = '#d3d8de', FRAME = '#4a5563', GLASS = '#a9bccb', PLINTH = '#b3b9c1', BAND = '#979ea8', DOOR = '#5d4433', GARAGE = '#8d98a3', LINE = '#616b77', PIPE = '#8c95a1', ROOF_CAP = '#5d6672';
const MAIN_W = 8.6, MAIN_D = 10, EAVES = 6, RIDGE = 8.2, OVER = 0.2; // the main house
const WING_R = 13.4, WING_F = -1.7, WING_B = -8.9, WING_EAVES = 3.5, WING_HIGH = 5.6, WING_LOW = 4.9, WING_STEP = -3.2, WING_OVER = 0.22; // the wing, and where its roof steps down
const PLINTH_H = 0.45, FLOOR = 0.47; // the ground floor stands two steps up
const RAKE = (RIDGE - EAVES) / (MAIN_W / 2 + OVER), SOFFIT = 0.3; // the gable's slope, and the pale board left showing under it
const under = (x: number) => RIDGE - RAKE * Math.abs(x - MAIN_W / 2) - SOFFIT; // the top of anything under the gable at x

const pieces: Piece[] = [];
type Extra = Partial<Piece>;
const box = (role: Piece['role'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, more: Extra = {}) => pieces.push({ role, x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, l: Math.abs(z1 - z0), color, ...more });

// Panels stack out from the wall in layers, so the frame shows between the panes as the glazing bars.
const LAYER = 0.03;
const onFront = (role: Piece['role'], x0: number, x1: number, y0: number, y1: number, layer: number, color: string, more?: Extra, wall = 0) => box(role, x0, x1, y0, y1, wall + (layer - 1) * LAYER, wall + layer * LAYER, color, more);
const onBack = (role: Piece['role'], x0: number, x1: number, y0: number, y1: number, layer: number, color: string, more?: Extra, wall = -MAIN_D) => box(role, x0, x1, y0, y1, wall - layer * LAYER, wall - (layer - 1) * LAYER, color, more);
const onRight = (role: Piece['role'], x: number, z0: number, z1: number, y0: number, y1: number, layer: number, color: string) => pieces.push({ role, x: x + (layer - 0.5) * LAYER, y: y0, z: (z0 + z1) / 2, w: LAYER, h: y1 - y0, l: Math.abs(z1 - z0), color });
const glass = (side: typeof onFront, x0: number, x1: number, y0: number, y1: number, more?: Extra) => side('window', x0, x1, y0, y1, 3, GLASS, more);
const frame = (side: typeof onFront, x0: number, x1: number, y0: number, y1: number) => side('trim', x0, x1, y0, y1, 2, FRAME);

/** The drawing's window: a wide centre pane, a tall pane each side, and a small one under each of those. */
function threeLight(side: typeof onFront, x0: number, x1: number, y0: number, y1: number, m = 0.05, bar = 0.06) {
  frame(side, x0, x1, y0, y1);
  const c0 = x0 + (x1 - x0) * 0.29, c1 = x1 - (x1 - x0) * 0.285, split = y0 + (y1 - y0) * 0.26;
  glass(side, c0, c1, y0 + m, y1 - m);
  for (const [a, b] of [[x0 + m, c0 - bar], [c1 + bar, x1 - m]]) { glass(side, a, b, split, y1 - m); glass(side, a, b, y0 + m, split - bar); }
}

// The main house and the wing.
box('wall', 0, MAIN_W, 0, EAVES, -MAIN_D, 0, RENDER);
box('wall', MAIN_W, WING_R, 0, WING_EAVES, WING_B, WING_F, RENDER);
box('roof', -OVER, MAIN_W + OVER, EAVES, RIDGE, -MAIN_D, 0, ROOF, { ridge: 'z', peak: 0.5 });
box('roof', MAIN_W, WING_R + WING_OVER, WING_EAVES, WING_HIGH, WING_STEP, WING_F + 0.1, ROOF, { ridge: 'z', peak: 0 });
box('roof', MAIN_W, WING_R + WING_OVER, WING_EAVES, WING_LOW, WING_B - 0.1, WING_STEP, ROOF, { ridge: 'z', peak: 0 });

// Fascia along each eaves, and the plinth round the house.
box('trim', -OVER, 0, EAVES - 0.22, EAVES + 0.02, -MAIN_D, 0, TRIM); // the left eaves
box('trim', MAIN_W, MAIN_W + OVER, EAVES - 0.22, EAVES + 0.02, -MAIN_D, 0, TRIM); // the right eaves
box('trim', WING_R, WING_R + WING_OVER, WING_EAVES - 0.2, WING_EAVES + 0.02, WING_B - 0.1, WING_F + 0.1, TRIM); // the wing's eaves
box('trim', MAIN_W / 2 - 0.05, MAIN_W / 2 + 0.05, RIDGE - 0.1, RIDGE + 0.01, -MAIN_D, 0, ROOF_CAP); // the ridge cap
onFront('trim', 0, 4.3, 0, PLINTH_H, 1, PLINTH);
onBack('trim', 0, MAIN_W, 0, PLINTH_H, 1, PLINTH);
box('trim', -0.03, 0, 0, PLINTH_H, -MAIN_D, 0, PLINTH); // the left wall
onRight('trim', MAIN_W, 0, WING_F, 0, PLINTH_H, 1, PLINTH);
onRight('trim', WING_R, WING_F, WING_B, 0, PLINTH_H, 1, PLINTH);
onBack('trim', MAIN_W, WING_R, 0, PLINTH_H, 1, PLINTH, undefined, WING_B);

// Wood on the front: up under the gable from the left corner, past the ridge, stopping at the render round the tall window.
onFront('trim', 0.33, 4.3, PLINTH_H, under(4.3), 1, WOOD, { fall: under(0.33) - under(4.3) });
onFront('trim', 4.3, 5.25, 3.5, under(4.3), 1, WOOD, { fall: under(4.3) - under(5.25) });
onFront('trim', 4.62, 8.28, PLINTH_H, 3.2, 1, WOOD); // behind the porch

// The left stack, with the grey panel between its two windows.
threeLight(onFront, 1.3, 3.53, 0.89, 3.02);
threeLight(onFront, 1.3, 3.53, 3.73, 5.7);
onFront('trim', 1.28, 3.55, 3.05, 3.7, 2, BAND);

// The tall window, its top following the gable.
const tall = { x0: 5.28, x1: 7.88, y0: 3.73, bar: 5.7, cols: [[5.33, 6], [6.07, 7.15], [7.22, 7.84]] };
onFront('trim', tall.x0, tall.x1, tall.y0, under(tall.x0), 2, FRAME, { fall: under(tall.x0) - under(tall.x1) });
for (const [a, b] of tall.cols) {
  glass(onFront, a, b, tall.y0 + 0.05, tall.bar - 0.04);
  glass(onFront, a, b, tall.bar + 0.04, under(a) - 0.06, { fall: under(a) - under(b) });
}

// The porch: canopy on two posts, a deck at floor height, two steps.
box('trim', 4.3, MAIN_W, 3.2, 3.52, 0, 1, TRIM);
for (const x of [4.3, 8.28]) box('trim', x, x + 0.32, PLINTH_H, 3.2, 0.68, 1, TRIM);
box('trim', 4.3, MAIN_W, 0, FLOOR, 0, 1, PLINTH);
box('trim', 4.3, MAIN_W, 0, 0.3, 1, 1.25, TRIM);
box('trim', 4.3, MAIN_W, 0, 0.15, 1.25, 1.45, PLINTH);

// The front door, its sidelights and top lights.
frame(onFront, 5.28, 7.12, FLOOR, 3);
onFront('door', 5.75, 6.69, FLOOR, 2.53, 3, DOOR);
onFront('trim', 5.87, 6.57, 0.65, 2.36, 4, '#6b5140'); // the door's panel
onFront('trim', 5.78, 5.86, 1.26, 1.31, 4, TRIM); // its handle
for (const [a, b] of [[5.33, 5.68], [6.76, 7.08]]) { glass(onFront, a, b, 0.52, 2.53); glass(onFront, a, b, 2.61, 2.95); }
glass(onFront, 5.75, 6.69, 2.61, 2.95);

// The garage door, on the wing's front, with the lines between its sections.
onFront('trim', 8.98, 12.82, 0, 2.57, 1, FRAME, undefined, WING_F);
onFront('garage_door', 9.05, 12.75, 0.02, 2.5, 2, GARAGE, undefined, WING_F);
for (const y of [0.5, 0.97, 1.44, 1.92]) onFront('trim', 9.05, 12.75, y, y + 0.03, 3, LINE, undefined, WING_F);
onFront('trim', 8.6, 8.98, 0, PLINTH_H, 1, PLINTH, undefined, WING_F);
onFront('trim', 12.82, WING_R, 0, PLINTH_H, 1, PLINTH, undefined, WING_F);

// The back: all wood, up into the gable, with three-column windows either side of the narrow centre.
onBack('trim', 0.22, MAIN_W, PLINTH_H, EAVES, 1, WOOD);
onBack('trim', 0.22, MAIN_W / 2, EAVES - 0.3, under(MAIN_W / 2), 1, WOOD, { fall: under(0.22) - under(MAIN_W / 2) });
onBack('trim', MAIN_W / 2, MAIN_W - 0.05, EAVES - 0.3, under(MAIN_W / 2), 1, WOOD, { fall: under(MAIN_W / 2) - under(MAIN_W - 0.05) });
onBack('trim', -OVER, MAIN_W + OVER, 5.68, 6.05, 2, TRIM); // the eaves line carries across the back
for (const [a, b] of [[6, 8], [0.95, 2.95]]) for (const [y0, y1] of [[0.89, 2.84], [3.55, 5.44]]) threeLight(onBack, a, b, y0, y1);
frame(onBack, 4.3, 5.05, 3.55, 5.44);
glass(onBack, 4.35, 5, 4.15, 5.39);
glass(onBack, 4.35, 5, 3.6, 4.07);
onBack('door', 4.3, 5.2, FLOOR, 2.53, 2, '#9aa3ad');
box('trim', 4.1, 5.4, 0, 0.3, -MAIN_D - 0.3, -MAIN_D, TRIM);
box('trim', 4.1, 5.4, 0, 0.15, -MAIN_D - 0.55, -MAIN_D - 0.3, PLINTH);

// The back of the wing: door and steps, and a two-pane window.
onBack('door', 11.97, 12.87, FLOOR, 2.53, 1, '#aab3bd', undefined, WING_B);
box('trim', 11.75, 13.05, 0, 0.3, WING_B - 0.3, WING_B, TRIM);
box('trim', 11.75, 13.05, 0, 0.15, WING_B - 0.55, WING_B - 0.3, PLINTH);
frame((role, a, b, c, d, layer, color) => onBack(role, a, b, c, d, layer - 1, color, undefined, WING_B), 9.77, 11.04, 1.12, 2.53);
for (const [a, b] of [[9.83, 10.37], [10.44, 10.98]]) onBack('window', a, b, 1.18, 2.47, 2, GLASS, undefined, WING_B);

// The right side: the door by the wing's front corner, the high window over the low part of the roof, and wood behind the wing.
onRight('door', WING_R, -1.85, -2.7, FLOOR - 0.45, 2.1, 1, '#9aa3ad');
onRight('trim', MAIN_W, -3.85, -5.15, 5.08, 5.72, 1, FRAME);
onRight('window', MAIN_W, -3.91, -5.09, 5.14, 5.66, 2, GLASS);
onRight('trim', MAIN_W, WING_B, -MAIN_D, PLINTH_H, EAVES, 1, WOOD);

// Downpipes, off the ends of the eaves to the ground.
box('trim', -0.1, 0, 0, EAVES - 0.2, -0.2, -0.1, PIPE);
box('trim', -0.1, 0, 0, EAVES - 0.2, -MAIN_D + 0.1, -MAIN_D + 0.2, PIPE);
box('trim', MAIN_W + 0.03, MAIN_W + 0.13, 0, EAVES - 0.2, -MAIN_D + 0.1, -MAIN_D + 0.2, PIPE);
box('trim', WING_R, WING_R + 0.1, 0, WING_EAVES - 0.18, WING_F - 0.2, WING_F - 0.1, PIPE);
box('trim', WING_R, WING_R + 0.1, 0, WING_EAVES - 0.18, WING_B + 0.1, WING_B + 0.2, PIPE);

const rounded = pieces.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]))) as Piece[];
const errors = houseErrors(rounded, DRAWN_HOUSE);
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
writeFileSync('src/data/house-claude.json', `${JSON.stringify({ pieces: rounded }, null, 2)}\n`);
console.log(`${rounded.length} pieces, ${trianglesOf(rounded)} triangles`);
