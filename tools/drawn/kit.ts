// The kit the drawn buildings are written in: pieces in metres, with x across the front from 0, z = 0 on the front wall and negative
// behind it, and panels that stack out from a wall in thin layers. Each building also carries where each view stands on its sheet, as
// { px0, ground, m }: the pixel of the building's left edge (the front corner in a side view), of the ground, and pixels to the metre.
import type { Piece } from '../../schemas/house.ts';

export const LAYER = 0.03;
export type Cal = { px0: number; ground: number; m: number };
export type Sheet = { file: string; front: Cal; side: Cal; back: Cal; top: Cal };
export type Drawn = { id: string; type: string; name: string; storeys: number; span: number; sheet: Sheet; pieces: Piece[] };
type Extra = Partial<Piece>;
type Sash = { cols?: number; rows?: number; frame?: string; glass?: string; bar?: number; m?: number; arch?: boolean };

export class Kit {
  pieces: Piece[] = [];
  box(role: Piece['role'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, more: Extra = {}) {
    this.pieces.push({ role, x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: Math.abs(x1 - x0), h: y1 - y0, l: Math.abs(z1 - z0), color, ...more });
  }
  wall(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string) { this.box('wall', x0, x1, y0, y1, z0, z1, color); }
  trim(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, more?: Extra) { this.box('trim', x0, x1, y0, y1, z0, z1, color, more); }
  /** A roof with a ridge along z or x; peak 0.5 is centred, hip stops the ridge short of each end. */
  roof(x0: number, x1: number, y: number, h: number, z0: number, z1: number, color: string, ridge: 'x' | 'z', more: Extra = {}) { this.box('roof', x0, x1, y, y + h, z0, z1, color, { ridge, peak: 0.5, ...more }); }
  /** A flat-topped roof, sloping in on all four sides. */
  slope(x0: number, x1: number, y: number, h: number, z0: number, z1: number, color: string, inset: number) { this.box('roof', x0, x1, y, y + h, z0, z1, color, { inset }); }
  face(side: 'front' | 'back' | 'left' | 'right', wall: number) { return new Face(this, side, wall); }
}

export class Face {
  kit: Kit; side: 'front' | 'back' | 'left' | 'right'; wall: number;
  constructor(kit: Kit, side: 'front' | 'back' | 'left' | 'right', wall: number) { this.kit = kit; this.side = side; this.wall = wall; }
  /** A panel from a0 to a1 along the wall (x, or z on a side) and y0 to y1 up it, in a layer out from the wall. */
  panel(role: Piece['role'], a0: number, a1: number, y0: number, y1: number, layer: number, color: string, more: Extra = {}) {
    const out = this.side === 'front' || this.side === 'right' ? 1 : -1, near = this.wall + out * (layer - 1) * LAYER, far = this.wall + out * layer * LAYER;
    if (this.side === 'front' || this.side === 'back') this.kit.box(role, a0, a1, y0, y1, near, far, color, more);
    else this.kit.box(role, near, far, y0, y1, a0, a1, color, more);
  }
  /** A sloping board on the front or back, rising from y0 at a0 to y1 at a1, t deep: a bargeboard, or a timber brace. */
  rake(a0: number, a1: number, y0: number, y1: number, t: number, color: string, layer = 2) {
    this.panel('trim', a0, a1, Math.min(y0, y1), Math.max(y0, y1) + t, layer, color, { fall: y0 - y1, shear: true });
  }
  /** A window: frame behind, panes in front, the frame showing between them as the bars. */
  sash(a0: number, a1: number, y0: number, y1: number, { cols = 2, rows = 1, frame = '#4a5563', glass = '#a9bccb', bar = 0.06, m = 0.05, arch = false }: Sash = {}, layer = 2) {
    this.panel('trim', a0, a1, y0, y1, layer, frame, arch ? { arch: true } : {});
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1), w = (hi - lo - 2 * m - (cols - 1) * bar) / cols, h = (y1 - y0 - 2 * m - (rows - 1) * bar) / rows;
    if (arch) { this.panel('window', lo + m, hi - m, y0 + m, y1 - m, layer + 1, glass, { arch: true }); for (let c = 1; c < cols; c++) { const at = lo + ((hi - lo) * c) / cols; this.panel('trim', at - bar / 2, at + bar / 2, y0 + m, y1 - (hi - lo) * 0.12, layer + 2, frame); } return; }
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const a = lo + m + c * (w + bar), y = y0 + m + r * (h + bar); this.panel('window', a, a + w, y, y + h, layer + 1, glass); }
  }
  /** A gabled dormer standing out of a roof: a box with a small roof, and a window on its face. */
  dormer(a0: number, a1: number, y0: number, y1: number, cheek: string, roof: string, sash: Sash = {}, deep = 1.1, gable = 0.5) {
    const out = this.side === 'front' || this.side === 'right' ? 1 : -1, face = this.wall, back = face - out * deep, over = 0.1;
    if (this.side === 'front' || this.side === 'back') { this.kit.box('wall', a0, a1, y0, y1, Math.min(face, back), Math.max(face, back), cheek); this.kit.roof(a0 - over, a1 + over, y1, gable, Math.min(face + out * 0.02, back), Math.max(face + out * 0.02, back), roof, 'z'); }
    else { this.kit.box('wall', Math.min(face, back), Math.max(face, back), y0, y1, a0, a1, cheek); this.kit.roof(Math.min(face + out * 0.02, back), Math.max(face + out * 0.02, back), y1, gable, Math.min(a0, a1) - over, Math.max(a0, a1) + over, roof, 'x'); }
    const inset = (Math.abs(a1 - a0)) * 0.12;
    new Face(this.kit, this.side, face).sash(Math.min(a0, a1) + inset, Math.max(a0, a1) - inset, y0 + 0.15, y1 - 0.1, sash, 1);
  }
}

export const rounded = (pieces: Piece[]) => pieces.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]))) as Piece[];
