// A building written out as parts: boxes, and roofs as prisms, flat-shaded in one mesh, so it's a single draw call.
import * as THREE from 'three';
import type { Piece } from '../../schemas/house.ts';

export function piecesGeometry(pieces: Piece[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], c = new THREE.Color();
  const tri = (a: number[], b: number[], d: number[]) => { pos.push(...a, ...b, ...d); for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b); };
  const quad = (a: number[], b: number[], d: number[], e: number[]) => { tri(a, b, d); tri(a, d, e); };
  for (const p of pieces) {
    c.set(p.color);
    // A gable's triangular end is wall, not roof: painted roof colour, it reads as a hip.
    const under = pieces.filter((w) => w.role === 'wall' && Math.abs(w.y + w.h - p.y) < 0.5 && Math.abs(w.x - p.x) < (w.w + p.w) / 2 && Math.abs(w.z - p.z) < (w.l + p.l) / 2).sort((a, b) => b.w * b.l - a.w * a.l)[0];
    const gableEnd = (draw: () => void) => { if (under) c.set(under.color); draw(); c.set(p.color); };
    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.l / 2, z1 = p.z + p.l / 2, y0 = p.y, y1 = p.y + p.h;
    const end = p.hip ? (draw: () => void) => draw() : gableEnd, hip = p.hip ?? 0; // a hipped end is roof, not wall
    if (p.role === 'roof' && p.inset) {
      const i = p.inset, a = [x0 + i, y1, z0 + i], b = [x1 - i, y1, z0 + i], d = [x1 - i, y1, z1 - i], e = [x0 + i, y1, z1 - i];
      quad([x0, y0, z1], [x1, y0, z1], d, e); quad([x1, y0, z1], [x1, y0, z0], b, d); quad([x1, y0, z0], [x0, y0, z0], a, b); quad([x0, y0, z0], [x0, y0, z1], e, a);
      quad(e, d, b, a); quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    } else if (p.role === 'roof') {
      if (p.ridge === 'z') {
        const rx = x0 + p.w * (p.peak ?? 0.5), ra = z0 + hip, rb = z1 - hip;
        end(() => { tri([x0, y0, z1], [x1, y0, z1], [rx, y1, rb]); tri([x1, y0, z0], [x0, y0, z0], [rx, y1, ra]); });
        quad([x1, y0, z1], [x1, y0, z0], [rx, y1, ra], [rx, y1, rb]); quad([x0, y0, z0], [x0, y0, z1], [rx, y1, rb], [rx, y1, ra]);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      } else {
        const rz = z0 + p.l * (p.peak ?? 0.5), ra = x0 + hip, rb = x1 - hip;
        end(() => { tri([x1, y0, z1], [x1, y0, z0], [rb, y1, rz]); tri([x0, y0, z0], [x0, y0, z1], [ra, y1, rz]); });
        quad([x0, y0, z1], [x1, y0, z1], [rb, y1, rz], [ra, y1, rz]); quad([x1, y0, z0], [x0, y0, z0], [ra, y1, rz], [rb, y1, rz]);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      }
    } else if (p.arch) {
      const along = p.l < p.w, r = (along ? p.w : p.l) / 2, top = y1 - r, s = 8, at = (t: number, out: number) => { const u = -Math.cos(t) * r, v = top + Math.sin(t) * r; return along ? [p.x + u, v, out] : [out, v, p.z - u]; };
      const near = along ? z1 : x1, far = along ? z0 : x0, hub = (out: number) => (along ? [p.x, top, out] : [out, top, p.z]);
      for (let i = 0; i < s; i++) { const a = (i / s) * Math.PI, b = ((i + 1) / s) * Math.PI; tri(hub(near), at(b, near), at(a, near)); tri(hub(far), at(a, far), at(b, far)); if (!along) { /* winding is mirrored on a side panel, and the material is double-sided */ } }
      quad([x0, y0, z1], [x1, y0, z1], [x1, top, z1], [x0, top, z1]); quad([x1, y0, z0], [x0, y0, z0], [x0, top, z0], [x1, top, z0]);
      quad([x1, y0, z1], [x1, y0, z0], [x1, top, z0], [x1, top, z1]); quad([x0, y0, z0], [x0, y0, z1], [x0, top, z1], [x0, top, z0]);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    } else {
      const yl = y1 - Math.max(0, -(p.fall ?? 0)), yr = y1 - Math.max(0, p.fall ?? 0); // a raked panel's top runs from one to the other
      const t = p.h - Math.abs(p.fall ?? 0), bl = p.shear ? yl - t : y0, br = p.shear ? yr - t : y0; // a sheared one keeps its depth, so it runs as a brace
      quad([x0, bl, z1], [x1, br, z1], [x1, yr, z1], [x0, yl, z1]); quad([x1, br, z0], [x0, bl, z0], [x0, yl, z0], [x1, yr, z0]);
      quad([x1, br, z1], [x1, br, z0], [x1, yr, z0], [x1, yr, z1]); quad([x0, bl, z0], [x0, bl, z1], [x0, yl, z1], [x0, yl, z0]);
      quad([x0, yl, z1], [x1, yr, z1], [x1, yr, z0], [x0, yl, z0]); quad([x0, bl, z0], [x1, br, z0], [x1, br, z1], [x0, bl, z1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
