import { describe, expect, it } from 'vitest';
import { DRAWN_COPIES, DRAWN_FOOT, ROAD_W, Town, type Box } from './town.ts';

const town = new Town(), drawn = town.boxes.filter((b) => b.drawn), foot = (b: Box) => DRAWN_FOOT.find((f) => f.id === b.drawn)!;
const overlap = (a: { x: number; z: number; hx: number; hz: number }, b: { x: number; z: number; hx: number; hz: number }) => Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.z - b.z) < a.hz + b.hz;

describe('the drawn buildings in the town', () => {
  it('stands every design that has a district, in that district', () => {
    for (const m of DRAWN_FOOT.filter((f) => f.district)) {
      const mine = drawn.filter((b) => b.drawn === m.id);
      expect(mine.length, m.id).toBeGreaterThanOrEqual(DRAWN_COPIES[m.district!] / 2);
      for (const b of mine) expect(b.district).toBe(m.district);
    }
  });
  it('sizes each lot to its building, so the solid is what you see', () => {
    for (const b of drawn) { const m = foot(b), onX = Math.abs(b.front!.x) >= Math.abs(b.front!.z); expect((onX ? b.hz : b.hx) * 2).toBeCloseTo(m.w, 1); expect((onX ? b.hx : b.hz) * 2).toBeCloseTo(m.d, 1); expect(b.h).toBe(m.h); }
  });
  it('overlaps no other building, plot or station', () => {
    for (const b of drawn) {
      for (const o of town.boxes) if (o !== b) expect(overlap(b, o), `${b.drawn} on another lot`).toBe(false);
      for (const p of town.plots) expect(overlap(b, { x: p.x, z: p.z, hx: 7, hz: 7 }), `${b.drawn} on a plot`).toBe(false);
    }
  });
  it('keeps off the road', () => {
    for (const b of drawn) for (const [a, c] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const p = { x: b.x + a * b.hx, z: b.z + c * b.hz }; for (const e of town.edges) { const n = town.nodes[e.a], m = town.nodes[e.b], ux = (m.x - n.x) / e.len, uz = (m.z - n.z) / e.len, t = Math.max(0, Math.min(e.len, (p.x - n.x) * ux + (p.z - n.z) * uz)); expect(Math.hypot(p.x - n.x - ux * t, p.z - n.z - uz * t)).toBeGreaterThan(ROAD_W / 2); } }
  });
  it('turns each to face its street', () => { for (const b of drawn) { const f = { x: Math.sin(b.turn!), z: Math.cos(b.turn!) }; expect(f.x * b.front!.x + f.z * b.front!.z).toBeGreaterThan(0.7); } });
  it('is solid', () => { for (const b of drawn) { expect(town.boxAt(b.x, b.z, 0.5)).toBe(b); expect(town.boxAt(b.x + b.hx + 3, b.z, 0.5)).not.toBe(b); } });
  it('comes out the same every time', () => { const again = new Town().boxes.filter((b) => b.drawn); expect(again.map((b) => [b.drawn, b.x, b.z])).toEqual(drawn.map((b) => [b.drawn, b.x, b.z])); });
  it('leaves a bare town alone', () => { expect(new Town(7, { bare: true }).boxes.some((b) => b.drawn)).toBe(false); });
  it('keeps every plot a kind can take, once, and only for that kind', () => {
    const t = new Town(), kinds = ['shop', 'library'], kindOf = (p: (typeof t.plots)[number]) => kinds[t.plots.indexOf(p) % 2];
    t.fitPlaces(kindOf, [t.plots[0]]);
    const size = t.drawnPlots.size;
    expect(size).toBeGreaterThan(0);
    expect(t.drawnPlots.has(t.plots[0])).toBe(false);
    for (const [p, d] of t.drawnPlots) expect(DRAWN_FOOT.find((f) => f.id === d.id)?.kind).toBe(kindOf(p));
    t.fitPlaces(() => 'cafe', []);
    expect(t.drawnPlots.size).toBe(size);
  });
  it('leaves no find or errand spot inside a grown plot', () => {
    const t = new Town();
    t.fitPlaces(() => 'library', []);
    for (const d of t.drawnPlots.values()) for (const s of t.spots) expect(Math.hypot(s.x - d.x, s.z - d.z) < 6, 'a spot buried in a library').toBe(false);
  });
});
