// The town's traffic and parked cars, as outlines Qwen draws and this checks: real sizes, a closed body, a cabin that
// stands on it. Sizes follow typical road cars of 3.6-5.4 m; src/view/streetlife.ts extrudes them into low-poly models.
export type TownCar = {
  id: string;
  name: string;
  body: [number, number][]; // the side outline tail to nose, [z, y] in metres, forward is +z, as a closed loop along the sill
  cabin: { rear: number; front: number; rearTop: number; frontTop: number; base: number; top: number };
  half: number; // half the width, metres
  axles?: [number, number]; // z of the rear and front axles; without them the wheels sit a fixed way in from each end
  wheel?: number; // wheel radius, metres
  van?: boolean; // no glass behind the front doors
};

const BONNET_DROP_M = 0.24;
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function townCarErrors(c: unknown): string[] {
  if (!c || typeof c !== 'object') return ['entry is not an object'];
  const q = c as TownCar, out: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(q.id ?? '')) out.push(`id "${q.id}": must be snake_case`);
  if (typeof q.name !== 'string' || q.name.length < 3 || q.name.length > 24) out.push('name: 3-24 characters');
  if (!num(q.half) || q.half < 0.8 || q.half > 1.05) out.push(`half ${q.half}: half the width, 0.8-1.05 m`);
  const b = q.body;
  if (!Array.isArray(b) || b.length < 6 || b.length > 10 || !b.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))) return [...out, 'body: 6-10 [z,y] points'];
  const zs = b.map((p) => p[0]), ys = b.map((p) => p[1]), tail = Math.min(...zs), nose = Math.max(...zs), length = nose - tail;
  if (length < 3.6 || length > 5.4) out.push(`body is ${length.toFixed(2)} m long: real cars here are 3.6-5.4 m`);
  if (Math.abs(tail + nose) > 0.3) out.push('body must be centred: tail and nose about equally far from z 0');
  if (b[0][1] < 0.16 || b[0][1] > 0.36 || b[b.length - 1][1] < 0.16 || b[b.length - 1][1] > 0.36) out.push('the first and last points are the sill: y 0.16-0.36');
  if (q.axles !== undefined && (!Array.isArray(q.axles) || q.axles.length !== 2 || !q.axles.every(num) || q.axles[0] >= q.axles[1])) out.push('axles: [rear, front] z positions');
  if (q.wheel !== undefined && (!num(q.wheel) || q.wheel < 0.27 || q.wheel > 0.4)) out.push('wheel: a radius of 0.27-0.4 m');
  if (b[0][0] !== tail || b[b.length - 1][0] !== nose) out.push('the outline runs from the tail to the nose');
  for (let i = 1; i < b.length; i++) if (b[i][0] < b[i - 1][0] - 1e-6) out.push(`body[${i}]: z must never run backwards`);
  const peak = Math.max(...ys);
  if (peak < 0.75 || peak > 1.25) out.push(`body top ${peak}: the waist is 0.75-1.25 m up`);
  const noseTop = Math.max(...b.filter((p) => p[0] > nose - 0.5).map((p) => p[1]));
  if (noseTop >= peak) out.push('the bonnet must fall toward the nose');
  // A real bonnet stays high and ends in a front face. Without this every car came back the same long wedge.
  const heightAt = (z: number) => { for (let i = 1; i < b.length; i++) if (z <= b[i][0] && b[i][0] > b[i - 1][0]) return b[i - 1][1] + ((z - b[i - 1][0]) / (b[i][0] - b[i - 1][0])) * (b[i][1] - b[i - 1][1]); return b[b.length - 1][1]; };
  if (heightAt(nose - 0.3) < peak - BONNET_DROP_M) out.push(`the bonnet is a wedge: 0.3 m back from the nose the body must still be at least ${(peak - BONNET_DROP_M).toFixed(2)} m high, then drop down a near-upright front face`);
  if (nose - b[b.length - 2][0] > 0.25) out.push('the nose needs a near-upright front face: the second-last point within 0.25 m of the nose');
  const c2 = q.cabin;
  if (!c2 || typeof c2 !== 'object' || !['rear', 'front', 'rearTop', 'frontTop', 'base', 'top'].every((k) => num(c2[k as keyof typeof c2]))) return [...out, 'cabin needs rear, front, rearTop, frontTop, base and top'];
  if (c2.rear < tail - 1e-6 || c2.front > nose - 0.7) out.push('the cabin must sit on the body, with a bonnet ahead of it of at least 0.7 m');
  if (c2.front - c2.rear < 1.8) out.push('the cabin is too short to seat anyone');
  if (c2.rearTop < c2.rear - 1e-6 || c2.frontTop > c2.front) out.push('the roof must sit inside the cabin base: the glass leans in');
  if (c2.frontTop - c2.rearTop < 0.8) out.push('the roof is too short');
  if (c2.front - c2.frontTop < 0.3) out.push('the windscreen must lean back at least 0.3 m');
  if (Math.abs(c2.base - peak) > 0.03) out.push(`cabin.base ${c2.base} must meet the top of the body, ${peak}`);
  if (c2.top - c2.base < 0.38) out.push('the cabin needs at least 0.38 m of glass height');
  if (c2.top < 1.35 || c2.top > 2.2) out.push(`top ${c2.top}: road cars stand 1.35-2.2 m tall`);
  if (length / c2.top > 3.6) out.push('too long and low for an everyday town car');
  return out;
}

/** What makes each body what it is: the proportions that tell one from another at a glance. */
export function townCarKindErrors(kind: string, q: TownCar): string[] {
  const zs = q.body.map((p) => p[0]), tail = Math.min(...zs), nose = Math.max(...zs), length = nose - tail, bonnet = nose - q.cabin.front, c = q.cabin, out: string[] = [];
  const waist = Math.max(...q.body.map((p) => p[1]));
  if (kind === 'saloon') {
    if (c.rear - tail < 0.65) out.push('a saloon needs a separate boot: cabin.rear at least 0.65 m ahead of the tail');
    if (c.top > 1.55) out.push('a saloon is low: top at most 1.55');
    if (bonnet < 1) out.push('a saloon has a proper bonnet, at least 1 m');
  }
  if (kind === 'hatchback') {
    if (c.rear - tail > 0.25) out.push('a hatchback has no boot: cabin.rear within 0.25 m of the tail');
    if (c.rearTop - c.rear > 0.55) out.push('a hatchback has a steep back: rearTop within 0.55 m of rear');
    if (length > 4.4) out.push('a hatchback is at most 4.4 m long');
    if (bonnet > 1.25) out.push('a hatchback has a short bonnet: at most 1.25 m');
  }
  if (kind === 'estate') {
    if (c.rearTop - tail > 0.45) out.push('an estate keeps its roof right back: rearTop within 0.45 m of the tail');
    if (bonnet > 1.4) out.push('an estate has a family bonnet: at most 1.4 m');
    if (length < 4.4) out.push('an estate is long: at least 4.4 m');
  }
  if (kind === 'mpv') {
    if (bonnet > 1) out.push('an MPV has a very short bonnet: at most 1 m ahead of the cabin');
    if (c.top < 1.72) out.push('an MPV is tall: top at least 1.72');
    if (c.rearTop - tail > 0.4) out.push('an MPV has an upright back: rearTop within 0.4 m of the tail');
  }
  if (kind === 'city_car') {
    if (length > 3.75) out.push('a city car is at most 3.75 m long');
    if (bonnet > 0.95) out.push('a city car has a short bonnet: at most 0.95 m');
    if (c.top < 1.5) out.push('a city car stands upright: top at least 1.5');
  }
  if (kind === 'suv') {
    if (waist < 1.02) out.push('an SUV sits high: a waist of at least 1.02');
    if (c.top < 1.66) out.push('an SUV is tall: top at least 1.66');
    if (c.rearTop - tail > 0.5) out.push('an SUV has a boxy back: rearTop within 0.5 m of the tail');
    if (bonnet > 1.3) out.push('an SUV has a short, high bonnet: at most 1.3 m');
  }
  // Each range sits round a published car, length by height: Corsa 4.06 by 1.43, Qashqai 4.43 by 1.63, BMW 2 Series coupe
  // 4.54 by 1.39 (BMW UK), Ford Ranger double cab 5.37 by 1.89 (Van Reviewer), LEVC TX 4.86 by 1.88 (LEVC via InsideEVs).
  // The supermini is held to the Corsa F itself: 4.06 m long, 1.43 tall, 1.765 wide, a 2.538 wheelbase, overhangs of 0.83 and
  // 0.69 (Opel's listing), and 195/55 R16 tyres, a 0.31 m radius. Its sill and beltline heights are judged from photographs.
  if (kind === 'supermini') {
    if (length < 4 || length > 4.12) out.push('a supermini is 4-4.12 m long, the Corsa is 4.06');
    if (c.top < 1.39 || c.top > 1.47) out.push('a supermini stands 1.39-1.47 m tall, the Corsa is 1.43');
    if (q.half < 0.86 || q.half > 0.9) out.push('half is 0.86-0.9: the Corsa is 1.765 m wide');
    if (!q.axles) out.push('a supermini gives its axles');
    else {
      if (Math.abs(q.axles[1] - q.axles[0] - 2.54) > 0.06) out.push('the wheelbase, axles front minus rear, is about 2.54 m');
      if (Math.abs(nose - q.axles[1] - 0.83) > 0.06) out.push('the front overhang, nose to front axle, is about 0.83 m');
      if (Math.abs(q.axles[0] - tail - 0.69) > 0.06) out.push('the rear overhang, rear axle to tail, is about 0.69 m');
    }
    if (q.wheel === undefined || Math.abs(q.wheel - 0.31) > 0.02) out.push('wheel is about 0.31, a 195/55 R16 tyre');
    if (waist < 0.86 || waist > 0.98) out.push('the waist of a modern hatch is 0.86-0.98 m up');
    if (q.body[0][1] > 0.24) out.push('a supermini sits low: its sill at most 0.24');
    if (c.rearTop - c.rear < 0.4) out.push('a hatch back is raked: rearTop at least 0.4 m ahead of rear');
    if (c.rear - tail > 0.25) out.push('a supermini is a hatch: cabin.rear within 0.25 m of the tail');
    if (bonnet < 0.9 || bonnet > 1.25) out.push('the bonnet and screen base, nose to cabin.front, is 0.9-1.25 m');
  }
  if (kind === 'crossover') {
    if (length < 4.2 || length > 4.6) out.push('a crossover is 4.2-4.6 m long');
    if (c.top < 1.55 || c.top > 1.68) out.push('a crossover stands 1.55-1.68 m tall, between a hatchback and an SUV');
    if (waist < 0.96) out.push('a crossover sits up: a waist of at least 0.96');
    if (c.rearTop - tail > 0.75) out.push('a crossover has a sloping back: rearTop within 0.75 m of the tail');
  }
  if (kind === 'coupe') {
    if (length < 4.3 || length > 4.7) out.push('a coupe is 4.3-4.7 m long');
    if (c.top > 1.42) out.push('a coupe is low: top at most 1.42');
    if (c.front - c.rear > 2.8) out.push('a coupe has a short cabin: at most 2.8 m at the base');
    if (bonnet < 1.2) out.push('a coupe has a long bonnet: at least 1.2 m');
    if (c.front - c.frontTop < 0.55) out.push('a coupe has a raked windscreen: frontTop at least 0.55 m behind front');
  }
  if (kind === 'pickup_truck') {
    if (length < 5 || length > 5.4) out.push('a double-cab pickup is 5-5.4 m long');
    if (c.top < 1.75) out.push('a pickup is tall: top at least 1.75');
    if (c.rear - tail < 1.3) out.push('a pickup has an open load bed: cabin.rear at least 1.3 m ahead of the tail');
    if (waist < 1.05) out.push('a pickup sits high: a waist of at least 1.05');
  }
  if (kind === 'black_cab') {
    if (length < 4.5 || length > 4.95) out.push('a black cab is 4.5-4.95 m long');
    if (c.top < 1.75) out.push('a black cab is tall enough to sit up in: top at least 1.75');
    if (c.rearTop - tail > 0.5) out.push('a black cab has an upright back: rearTop within 0.5 m of the tail');
    if (bonnet < 0.8 || bonnet > 1.15) out.push('a black cab has a short, rounded bonnet: 0.8-1.15 m');
  }
  if (kind === 'panel_van') {
    if (!q.van) out.push('a panel van needs van: true');
    if (c.rear - tail > 0.02 || c.rearTop - tail > 0.08) out.push('a van is a box: rear and rearTop at the tail, so the back is a flat wall');
    if (c.top < 1.95) out.push('a van is tall: top at least 1.95');
    if (bonnet > 1.1) out.push('a van has a short nose: at most 1.1 m');
  }
  return out;
}
