// Two cars as what they are, long thin rectangles at any angle, tested by the separating axis theorem: if there's any
// axis along which their shadows don't overlap, they aren't touching. Pure, and cheap enough for every car, every step.
export type CarBox = { x: number; z: number; heading: number; halfL: number; halfW: number };

const reach = (c: CarBox, ax: number, az: number) => {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  return Math.abs(ax * fx + az * fz) * c.halfL + Math.abs(ax * fz - az * fx) * c.halfW;
};

/** If two cars overlap, the unit push from `a` toward `b` and how deep they are in; otherwise null. */
export function carsOverlap(a: CarBox, b: CarBox): { nx: number; nz: number; depth: number } | null {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > (a.halfL + a.halfW + b.halfL + b.halfW) ** 2) return null; // too far apart to bother
  let best = Infinity, nx = 0, nz = 0;
  for (const h of [a.heading, b.heading]) for (const [ax, az] of [[Math.sin(h), Math.cos(h)], [Math.cos(h), -Math.sin(h)]]) {
    const gap = reach(a, ax, az) + reach(b, ax, az) - Math.abs(dx * ax + dz * az);
    if (gap <= 0) return null;
    if (gap < best) { const s = dx * ax + dz * az >= 0 ? 1 : -1; best = gap; nx = ax * s; nz = az * s; }
  }
  return { nx, nz, depth: best };
}
