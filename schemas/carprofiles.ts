// The body shape of each car, as the voxel body shop reads it: silhouette lines as fractions, so one
// profile scales to the car's length, height and width from the economy sheet.
export type ProfileKey = { z: number; v: number }; // z along the car (0 tail, 1 nose), v a fraction

export type CarBodyProfile = {
  id: string; // must match a car id
  sill: number; // metres, where the body panels stop underneath (the rocker)
  wheels: { radius: number; width: number; front: number; rear: number; track: number }; // radius/width in metres, axles as z fractions, track as a fraction of width
  panel: ProfileKey[]; // the body's top line from tail to nose, fraction of height; first z 0, last z 1
  width: ProfileKey[]; // the body's widest point at that z, fraction of width; first z 0, last z 1
  cabin: { front: number; back: number; width: number; height: number; belt: number; rakeF: number; rakeR: number }; // cabin edges as z fractions, width/height/belt as fractions, glass rake as z fractions
  bed?: { front: number; floor: number }; // pickups only: open load bay from this z to the tail, floor as a fraction of height
};

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const ID = /^[a-z][a-z0-9_]*$/;

// Fractions the sculptor relies on staying inside; out of range and the car gets weird.
function line(what: string, keys: unknown, minV: number, maxV: number, minN: number, maxN: number): string[] {
  if (!Array.isArray(keys) || keys.length < minN || keys.length > maxN) return [`${what} needs ${minN}-${maxN} points`];
  const out: string[] = [];
  let prev = -1;
  keys.forEach((k, i) => {
    if (!k || typeof k !== 'object') { out.push(`${what}[${i}] must be {z,v}`); return; }
    const { z, v } = k as ProfileKey;
    if (!num(z) || !num(v)) { out.push(`${what}[${i}] must hold numbers`); return; }
    if (!(z > prev)) out.push(`${what}[${i}].z must grow from the last point`);
    if (v < minV || v > maxV) out.push(`${what}[${i}].v ${v}: outside ${minV}-${maxV}`);
    prev = z;
  });
  const first = keys[0] as ProfileKey | undefined, last = keys[keys.length - 1] as ProfileKey | undefined;
  if (first && num(first.z) && Math.abs(first.z) > 1e-6) out.push(`${what} must start at z 0`);
  if (last && num(last.z) && Math.abs(last.z - 1) > 1e-6) out.push(`${what} must end at z 1`);
  return out;
}

export function carProfileErrors(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['profile is not an object'];
  const q = p as CarBodyProfile;
  const out: string[] = [];
  if (!ID.test(q.id ?? '')) out.push(`id "${q.id}": must be snake_case`);
  if (!num(q.sill) || q.sill < 0.15 || q.sill > 0.5) out.push(`sill ${q.sill}: must be 0.15-0.5 metres`);
  const w = q.wheels;
  if (!w || typeof w !== 'object') out.push('wheels must be an object');
  else {
    if (!num(w.radius) || w.radius < 0.24 || w.radius > 0.45) out.push(`wheels.radius ${w.radius}: 0.24-0.45 metres`);
    if (!num(w.width) || w.width < 0.14 || w.width > 0.3) out.push(`wheels.width ${w.width}: 0.14-0.3 metres`);
    if (!num(w.front) || w.front < 0.58 || w.front > 0.88) out.push(`wheels.front ${w.front}: axle at z 0.58-0.88`);
    if (!num(w.rear) || w.rear < 0.12 || w.rear > 0.42) out.push(`wheels.rear ${w.rear}: axle at z 0.12-0.42`);
    if (!num(w.track) || w.track < 0.7 || w.track > 0.95) out.push(`wheels.track ${w.track}: 0.7-0.95 of width`);
    if (num(w.front) && num(w.rear) && w.front - w.rear < 0.25) out.push('wheels: the axles need a real wheelbase between them');
    if (num(q.sill) && num(w.radius)) {
      if (q.sill > w.radius + 0.02) out.push('sill must sit no higher than the axle, or the wheels hide under the car');
      if (q.sill < w.radius - 0.14) out.push('sill must not dip far below the axle, or the wheels stick out the bottom');
    }
  }
  out.push(...line('panel', q.panel, 0.25, 0.95, 4, 7));
  out.push(...line('width', q.width, 0.6, 1, 3, 6));
  const c = q.cabin;
  if (!c || typeof c !== 'object') out.push('cabin must be an object');
  else {
    for (const k of ['front', 'back', 'width', 'height', 'belt', 'rakeF', 'rakeR'] as const)
      if (!num(c[k])) out.push(`cabin.${k} must be a number`);
    if (num(c.front) && num(c.back)) {
      if (!(c.back > 0 && c.back < c.front && c.front < 1)) out.push('cabin: 0 < back < front < 1');
      if (c.front - c.back < 0.2) out.push('cabin: too short to sit people in');
    }
    if (num(c.width) && (c.width < 0.6 || c.width > 0.92)) out.push(`cabin.width ${c.width}: 0.6-0.92 of width`);
    if (num(c.height) && (c.height < 0.5 || c.height > 1)) out.push(`cabin.height ${c.height}: 0.5-1 of height`);
    if (num(c.belt) && (c.belt < 0.35 || c.belt > 0.9)) out.push(`cabin.belt ${c.belt}: 0.35-0.9 of height`);
    if (num(c.height) && num(c.belt) && c.height - c.belt < 0.05) out.push('cabin: the roof must sit above the belt');
    if (num(c.rakeF) && (c.rakeF < 0.02 || c.rakeF > 0.16)) out.push(`cabin.rakeF ${c.rakeF}: 0.02-0.16 of length`);
    if (num(c.rakeR) && (c.rakeR < 0.01 || c.rakeR > 0.14)) out.push(`cabin.rakeR ${c.rakeR}: 0.01-0.14 of length`);
  }
  if (q.bed !== undefined) {
    const b = q.bed;
    if (!b || typeof b !== 'object' || !num(b.front) || !num(b.floor)) out.push('bed must be {front,floor}');
    else {
      if (b.front < 0.25 || b.front > 0.7) out.push(`bed.front ${b.front}: z 0.25-0.7`);
      if (b.floor < 0.2 || b.floor > 0.65) out.push(`bed.floor ${b.floor}: 0.2-0.65 of height`);
    }
  }
  return out;
}

// Cross-checks that need the car's metres: the cabin has to clear the panel, the wheels fit the body.
export function profileVsCar(q: CarBodyProfile, size: [number, number, number]): string[] {
  const [, tall] = size;
  const out: string[] = [];
  const at = (keys: ProfileKey[], z: number) => {
    let lo = keys[0], hi = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (z >= keys[i].z && z <= keys[i + 1].z) { lo = keys[i]; hi = keys[i + 1]; break; }
    const t = hi.z === lo.z ? 0 : (z - lo.z) / (hi.z - lo.z);
    return lo.v + (hi.v - lo.v) * t;
  };
  let top = 0;
  for (let z = q.cabin.back; z <= q.cabin.front; z += 0.05) top = Math.max(top, at(q.panel, z));
  if (q.cabin.height < top + 0.03) out.push(`${q.id}: the cabin must rise above the panel it sits on`);
  for (const k of q.panel) if (k.v * tall < q.sill + 0.05) out.push(`${q.id}: the panel line dips under the sill`);
  if (q.wheels.radius * 2 > tall * 0.62) out.push(`${q.id}: wheels too tall for this body`);
  if (q.cabin.width > Math.min(...q.width.map((k) => k.v)) - 0.06) out.push(`${q.id}: the cabin is wider than the body narrows to`);
  if (q.bed && q.bed.front > q.cabin.back) out.push(`${q.id}: the bed has to stop behind the cabin`);
  // The body is the lower half and the cabin stands on it: the windows only show if the panel stays down at the belt.
  for (const k of q.panel) if (k.v > q.cabin.belt + 0.04) out.push(`${q.id}: the panel at z ${k.z} rises over the belt line and buries the windows; keep it at most ${(q.cabin.belt + 0.04).toFixed(2)}`);
  if (q.cabin.front - q.cabin.rakeF - (q.cabin.back + q.cabin.rakeR) < 0.12) out.push(`${q.id}: the rakes leave too short a roof`);
  if (q.cabin.front > q.wheels.front) out.push(`${q.id}: the windscreen must stand behind the front axle`);
  if ((q.cabin.height - q.cabin.belt) * tall < 0.26) out.push(`${q.id}: the glass needs 0.26 m between belt and roof; keep cabin.height - belt at least ${(0.26 / tall).toFixed(2)}`);
  if (q.cabin.height * tall < q.sill + 0.74) out.push(`${q.id}: too low to seat the driver; cabin.height at least ${((q.sill + 0.74) / tall).toFixed(2)} or a lower sill`);
  for (const [name, z] of [['front', q.wheels.front], ['rear', q.wheels.rear]] as const) if (q.wheels.radius * 2 + 0.08 > at(q.panel, z) * tall) out.push(`${q.id}: the ${name} arch breaks through the panel; raise the panel over z ${z} to at least ${((q.wheels.radius * 2 + 0.08) / tall).toFixed(2)} or shrink the wheels`);
  if (q.bed) {
    if (q.bed.floor * tall < q.sill + 0.1) out.push(`${q.id}: the bed floor has to sit above the sill`);
    if (at(q.panel, q.bed.front / 2) - q.bed.floor < 0.05) out.push(`${q.id}: the bed needs walls above its floor`);
  }
  return out;
}
