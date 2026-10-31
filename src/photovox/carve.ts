// Photos to a voxel model, by silhouette carving: a block of voxels, with everything outside each photo's outline cut away,
// then coloured from whichever photo looks straight at each face. It recovers the outer shape only: a dent or hollow that
// never shows in an outline can't be found (Laurentini's visual hull; see Stanford CS231A and TUM's notes), and accuracy
// grows with the number of views. Photos are treated as flat, straight-on views. Two views leave the plan unknown, so
// without a top view each slice is rounded with a superellipse: a judged guess, not a measurement.
export type Picture = { width: number; height: number; rgba: Uint8ClampedArray | Uint8Array };
export type View = 'side' | 'front' | 'back' | 'top';
export type Shot = { view: View; pic: Picture };
export type Mask = { width: number; height: number; on: Uint8Array };
export type VoxelBlock = { voxel: number; nx: number; ny: number; nz: number; palette: string[]; cells: [number, number, number, number][]; solid?: Uint8Array }; // surface cells: x, y, z, palette index; solid: every cell, for wrapping a skin round, left out of a saved model

const BACKGROUND_TOLERANCE = 40, ROUND_POWER = 3.5, COLOUR_STEP = 24, COLOUR_PASSES = 2, OUTVOTED = 1.6;

const at = (p: Picture, x: number, y: number, k: number) => p.rgba[(y * p.width + x) * 4 + k];

/** The average colour of the picture's edge, which is the background in a plain-background photo. */
function edgeColour(p: Picture): [number, number, number] {
  const s = [0, 0, 0];
  let n = 0;
  const add = (x: number, y: number) => { for (const k of [0, 1, 2]) s[k] += at(p, x, y, k); n++; };
  for (let x = 0; x < p.width; x++) { add(x, 0); add(x, p.height - 1); }
  for (let y = 0; y < p.height; y++) { add(0, y); add(p.width - 1, y); }
  return [s[0] / n, s[1] / n, s[2] / n];
}

/** The object: whatever can't be reached from the picture's edge across background, keeping only the biggest piece. */
export function cutOut(p: Picture, tolerance = BACKGROUND_TOLERANCE): Mask {
  const { width: w, height: h } = p, bg = edgeColour(p), back = new Uint8Array(w * h), todo: number[] = [];
  const isBack = (x: number, y: number) => at(p, x, y, 3) < 128 || Math.hypot(at(p, x, y, 0) - bg[0], at(p, x, y, 1) - bg[1], at(p, x, y, 2) - bg[2]) < tolerance;
  const push = (x: number, y: number) => { const i = y * w + x; if (!back[i] && isBack(x, y)) { back[i] = 1; todo.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (todo.length) {
    const i = todo.pop()!, x = i % w, y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const label = new Int32Array(w * h), sizes = [0];
  for (let start = 0; start < w * h; start++) { // the biggest connected piece, so specks of shadow don't count
    if (back[start] || label[start]) continue;
    const id = sizes.length, stack = [start];
    let size = 0;
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!, x = i % w;
      size++;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (n >= 0 && n < w * h && !back[n] && !label[n]) { label[n] = id; stack.push(n); }
    }
    sizes.push(size);
  }
  const biggest = sizes.indexOf(Math.max(...sizes)), on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = label[i] === biggest && biggest > 0 ? 1 : 0;
  return { width: w, height: h, on };
}

type Fitted = { view: View; mask: Mask; pic: Picture; x0: number; y0: number; w: number; h: number };

function fit(s: Shot, tolerance: number): Fitted {
  const mask = cutOut(s.pic, tolerance);
  let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.on[y * mask.width + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error(`nothing found in the ${s.view} photo: it needs a plain background`);
  return { view: s.view, mask, pic: s.pic, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Whether a point across a view, each from 0 to 1 of the object's box, falls inside its outline. */
const inside = (f: Fitted, u: number, v: number) => {
  const x = Math.min(f.w - 1, Math.floor(u * f.w)) + f.x0, y = Math.min(f.h - 1, Math.floor(v * f.h)) + f.y0;
  return f.mask.on[y * f.mask.width + x] === 1;
};

const hexOf = (f: Fitted, u: number, v: number) => {
  const x = Math.min(f.w - 1, Math.floor(u * f.w)) + f.x0, y = Math.min(f.h - 1, Math.floor(v * f.h)) + f.y0;
  const q = (k: number) => Math.min(255, Math.round(at(f.pic, x, y, k) / COLOUR_STEP) * COLOUR_STEP).toString(16).padStart(2, '0');
  return `#${q(0)}${q(1)}${q(2)}`;
};

/** Where a cell sits in a block's solid array. */
export const cellAt = (nx: number, nz: number, x: number, y: number, z: number) => (y * nz + z) * nx + x;

/** Carves the block. `long` is the voxels along the longest side. Side photos have the front to the left. */
export function carve(shots: Shot[], { long = 48, tolerance = BACKGROUND_TOLERANCE, height = 1 }: { long?: number; tolerance?: number; height?: number } = {}): VoxelBlock {
  const views = shots.map((s) => fit(s, tolerance)), find = (v: View) => views.find((f) => f.view === v);
  const side = find('side'), front = find('front') ?? find('back'), top = find('top');
  if (views.length < 2 || (!side && !front) || (!side && !top) || (!front && !top)) throw new Error('needs two different views: a side and a front, or either with a top');
  const across = side ?? front!, tall = across.h;
  const zLen = side ? side.w / tall : top!.h / top!.w * (front!.w / tall), xLen = front ? front.w / tall : top!.w / top!.h * zLen;
  const voxel = Math.max(zLen, xLen, 1) / long, nx = Math.max(1, Math.round(xLen / voxel)), ny = Math.max(1, Math.round(1 / voxel)), nz = Math.max(1, Math.round(zLen / voxel));
  const solid = new Uint8Array(nx * ny * nz), idx = (x: number, y: number, z: number) => cellAt(nx, nz, x, y, z);
  const has = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && solid[idx(x, y, z)] === 1;

  // Each slice's reach, for rounding when there's no top view to say what shape it is from above.
  const reach = (f: Fitted | undefined, n: number, v: number) => { if (!f) return 1; let a = n, b = -1; for (let i = 0; i < n; i++) if (inside(f, (i + 0.5) / n, v)) { a = Math.min(a, i); b = Math.max(b, i); } return b < a ? null : { mid: (a + b + 1) / 2, half: (b - a + 1) / 2 }; };
  for (let y = 0; y < ny; y++) {
    const v = 1 - (y + 0.5) / ny, wide = reach(front, nx, v), deep = reach(side, nz, v);
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const zf = (z + 0.5) / nz, xf = (x + 0.5) / nx;
      if ((side && !inside(side, 1 - zf, v)) || (front && !inside(front, xf, v)) || (top && !inside(top, 1 - xf, 1 - zf))) continue; // front is +z: to the left of a side photo, the top of a top one, and a top photo sees the car's left on its left, where a front photo sees it on its right
      if (!top && typeof wide === 'object' && wide && typeof deep === 'object' && deep && Math.abs((x + 0.5 - wide.mid) / wide.half) ** ROUND_POWER + Math.abs((z + 0.5 - deep.mid) / deep.half) ** ROUND_POWER > 1) continue;
      solid[idx(x, y, z)] = 1;
    }
  }

  const palette: string[] = [], colour = (hex: string) => { let i = palette.indexOf(hex); if (i < 0) { i = palette.length; palette.push(hex); } return i; };
  const back = find('back'), facing = find('front');
  const cells: VoxelBlock['cells'] = [];
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!has(x, y, z)) continue;
    const open = { side: !has(x - 1, y, z) || !has(x + 1, y, z), nose: !has(x, y, z + 1), tail: !has(x, y, z - 1), up: !has(x, y + 1, z), down: !has(x, y - 1, z) };
    if (!open.side && !open.nose && !open.tail && !open.up && !open.down) continue;
    const zf = (z + 0.5) / nz, xf = (x + 0.5) / nx, v = 1 - (y + 0.5) / ny;
    // A photo only knows the colour of what it can see, so a face takes its colour from a photo with a clear line to it. Otherwise a
    // wall set back behind a porch takes the porch's colour.
    const clear = (dx: number, dy: number, dz: number) => { for (let a = x + dx, b = y + dy, c = z + dz; a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz; a += dx, b += dy, c += dz) if (solid[idx(a, b, c)]) return false; return true; };
    const sees = { nose: !!facing && clear(0, 0, 1), tail: !!back && clear(0, 0, -1), up: !!top && clear(0, 1, 0), side: !!side && (clear(1, 0, 0) || clear(-1, 0, 0)) };
    const hex = open.nose && sees.nose ? hexOf(facing!, xf, v) : open.tail && sees.tail ? hexOf(back!, 1 - xf, v) : open.up && sees.up ? hexOf(top!, 1 - xf, 1 - zf) : sees.side ? hexOf(side!, 1 - zf, v) : sees.nose ? hexOf(facing!, xf, v) : sees.up ? hexOf(top!, 1 - xf, 1 - zf) : sees.tail ? hexOf(back!, 1 - xf, v) : hexOf(side ?? views[0], side ? 1 - zf : xf, v);
    cells.push([x, y, z, colour(hex)]);
  }
  // A voxel outvoted by its neighbours takes their colour: photos sample onto a grid with stray specks and sawtooth edges.
  const hueAt = new Map(cells.map((c) => [idx(c[0], c[1], c[2]), c[3]]));
  for (let pass = 0; pass < COLOUR_PASSES; pass++) for (const c of cells) {
    const votes = new Map<number, number>();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      if (!has(c[0] + a, c[1] + b, c[2] + d)) continue;
      const h = hueAt.get(idx(c[0] + a, c[1] + b, c[2] + d));
      if (h !== undefined) votes.set(h, (votes.get(h) ?? 0) + 1);
    }
    let top = c[3], most = votes.get(c[3]) ?? 0;
    for (const [h, n] of votes) if (n > most * OUTVOTED) { top = h; most = n; }
    c[3] = top;
  }
  return { voxel: (voxel * height), nx, ny, nz, palette, cells, solid };
}

/** Whether the photos agree on the object's proportions, 1 being exactly. This doesn't depend on the carving, so unlike the outline match
 * it can catch a bad cut-out: a side, front and top each give two of the three sizes, and those must fit together. Null without all three. */
export function viewAgreement(shots: Shot[], tolerance = BACKGROUND_TOLERANCE): number | null {
  const of = (v: View) => { const s = shots.find((q) => q.view === v); return s ? fit(s, tolerance) : null; };
  const side = of('side'), front = of('front') ?? of('back'), top = of('top');
  if (!side || !front || !top) return null;
  const fromTop = top.w / top.h, fromRest = (front.w / front.h) / (side.w / side.h);
  return Math.exp(-Math.abs(Math.log(fromTop / fromRest)) * 2);
}

/** A photo with everything the cut-out called background painted over, to check by eye. */
export function cutPreview(p: Picture, tolerance = BACKGROUND_TOLERANCE): Picture {
  const m = cutOut(p, tolerance), rgba = new Uint8ClampedArray(p.rgba);
  for (let i = 0; i < m.on.length; i++) if (!m.on[i]) { rgba[i * 4] = 255; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 255; }
  return { width: p.width, height: p.height, rgba };
}

/** How well the model fills a photo's outline when seen from there: intersection over union, 1 is perfect. A carve fits its own
 * outlines almost by definition, so this checks the carving, not the cut-out: see viewAgreement. */
export function outlineMatch(b: VoxelBlock, s: Shot, tolerance = BACKGROUND_TOLERANCE): number {
  const f = fit(s, tolerance), across = s.view === 'side' ? b.nz : b.nx, down = s.view === 'top' ? b.nz : b.ny, seen = new Uint8Array(across * down);
  for (const [x, y, z] of b.cells) seen[(s.view === 'top' ? b.nz - 1 - z : b.ny - 1 - y) * across + (s.view === 'side' ? b.nz - 1 - z : s.view === 'top' ? b.nx - 1 - x : x)] = 1;
  let both = 0, either = 0;
  for (let j = 0; j < down; j++) for (let i = 0; i < across; i++) {
    const m = inside(f, (i + 0.5) / across, (j + 0.5) / down), v = seen[j * across + i] === 1;
    if (m && v) both++;
    if (m || v) either++;
  }
  return either ? both / either : 0;
}
