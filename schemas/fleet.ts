// The town's working vehicles, as side elevations Qwen draws and this checks: buses and the emergency services.
// Sizes are real ones. Enviro200: 10.8 m long, 2.47 wide, 2.86 tall. Enviro400: 10.5-11.5 m long, 2.55 wide, 4.2-4.3 tall,
// 18 t gross. Fire pumps from Royal Berkshire and South Yorkshire's published lists: 7.7-8.5 m long, 2.46-2.55 wide,
// 3.3-3.4 tall, 12.5-13 t. A box ambulance on a Sprinter or Ducato chassis has no one published size, so its row is a
// judged range around a 6.4 m van. Liveries are fixed here: Battenburg colours are a rule, not a design choice.
export const FLEET_IDS = ['bus_single', 'bus_double', 'police_car', 'police_van', 'ambulance', 'fire_engine', 'recovery_truck'] as const;
export type FleetId = (typeof FLEET_IDS)[number];
export type Role = 'bus' | 'police' | 'ambulance' | 'fire' | 'recovery';

export type Pane = { z0: number; z1: number; y0: number; y1: number };
export type FleetVehicle = {
  id: FleetId;
  name: string;
  body: [number, number][]; // the side outline from the tail's skirt, over the roof, to the nose's skirt: [z, y] metres, forward is +z
  half: number; // half the width, metres
  axles: number[]; // z of each axle
  windows: Pane[]; // side glass, the same on both flanks
  screen: { y0: number; y1: number }; // the windscreen's height on the nose
  paint?: string; // buses only: the operator's colour
  skirt?: string; // buses only: a second colour along the bottom
};

type Rule = { length: [number, number]; half: [number, number]; top: [number, number]; wheel: number; kg: number; role: Role; rows?: number };
export const FLEET_RULES: Record<FleetId, Rule> = {
  bus_single: { length: [10, 12], half: [1.2, 1.28], top: [2.8, 3.1], wheel: 0.48, kg: 13000, role: 'bus' },
  bus_double: { length: [10.5, 11.5], half: [1.25, 1.28], top: [4.2, 4.35], wheel: 0.48, kg: 15000, role: 'bus', rows: 2 }, // between the 11 t empty and 18 t gross, with a part load
  police_car: { length: [4.5, 5], half: [0.88, 0.96], top: [1.42, 1.62], wheel: 0.33, kg: 1800, role: 'police' },
  police_van: { length: [5.2, 6], half: [0.98, 1.05], top: [2.2, 2.6], wheel: 0.35, kg: 3200, role: 'police' },
  ambulance: { length: [6, 7], half: [1.08, 1.2], top: [2.7, 3], wheel: 0.36, kg: 4600, role: 'ambulance' },
  fire_engine: { length: [7.7, 8.6], half: [1.2, 1.28], top: [3.1, 3.4], wheel: 0.5, kg: 12500, role: 'fire' },
  recovery_truck: { length: [7.4, 8.4], half: [1.12, 1.25], top: [2.4, 3], wheel: 0.42, kg: 7500, role: 'recovery' }, // a 7.5 t slide-bed truck, as UK fleets run on the Isuzu N-Series, with a 5.6 m bed. Its overall length and height are judged round that
};

// Battenburg colours by service (Police Scientific Development Branch's pattern): the white of each block is reflective
// yellow in life. Fire engines stay red with the checks along the side.
export const LIVERY: Record<Exclude<Role, 'bus'>, { paint: string; a: string; b: string; beacon: string; plain?: boolean }> = {
  police: { paint: '#f2f3f5', a: '#d9e021', b: '#1f4fa8', beacon: '#3a7bff' },
  ambulance: { paint: '#f5e94a', a: '#d9e021', b: '#1f9a54', beacon: '#3a7bff' },
  fire: { paint: '#c8201e', a: '#e6e021', b: '#c8201e', beacon: '#3a7bff' },
  recovery: { paint: '#f0a81e', a: '#f0a81e', b: '#d8241e', beacon: '#ffa21f', plain: true }, // no Battenburg: recovery trucks aren't an emergency service, and show amber, not blue
};

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-f]{6}$/i;

export function fleetErrors(c: unknown): string[] {
  if (!c || typeof c !== 'object') return ['entry is not an object'];
  const q = c as FleetVehicle, out: string[] = [], r = FLEET_RULES[q.id];
  if (!r) return [`id "${q.id}": must be one of ${FLEET_IDS.join(', ')}`];
  if (typeof q.name !== 'string' || q.name.length < 3 || q.name.length > 24) out.push('name: 3-24 characters');
  if (!num(q.half) || q.half < r.half[0] || q.half > r.half[1]) out.push(`half ${q.half}: half the width, ${r.half[0]}-${r.half[1]} m`);
  const b = q.body;
  if (!Array.isArray(b) || b.length < 6 || b.length > 14 || !b.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))) return [...out, 'body: 6-14 [z,y] points'];
  const zs = b.map((p) => p[0]), ys = b.map((p) => p[1]), tail = Math.min(...zs), nose = Math.max(...zs), length = nose - tail, top = Math.max(...ys);
  if (length < r.length[0] || length > r.length[1]) out.push(`body is ${length.toFixed(2)} m long: this vehicle is ${r.length[0]}-${r.length[1]} m`);
  if (Math.abs(tail + nose) > 0.3) out.push('body must be centred: tail and nose about equally far from z 0');
  if (top < r.top[0] || top > r.top[1]) out.push(`top ${top}: this vehicle stands ${r.top[0]}-${r.top[1]} m tall`);
  if (b[0][0] !== tail || b[b.length - 1][0] !== nose) out.push('the outline runs from the tail to the nose');
  if (b[0][1] > 0.6 || b[b.length - 1][1] > 0.6) out.push('the first and last points are the skirt: y at most 0.6');
  for (let i = 1; i < b.length; i++) if (b[i][0] < b[i - 1][0] - 1e-6) out.push(`body[${i}]: z must never run backwards`);
  if (!Array.isArray(q.axles) || q.axles.length < 2 || q.axles.length > 3 || !q.axles.every(num)) return [...out, 'axles: 2 or 3 z positions'];
  const front = Math.max(...q.axles), rear = Math.min(...q.axles);
  if (front > nose - r.wheel - 0.1 || rear < tail + r.wheel + 0.1) out.push('the wheels must sit inside the body');
  if (front - rear < length * 0.45) out.push('the axles are too close together: the wheelbase is about half the length or more');
  if (!Array.isArray(q.windows) || q.windows.length < 1 || q.windows.length > 24) return [...out, 'windows: 1-24 panes'];
  for (const [i, w] of q.windows.entries()) {
    if (!num(w.z0) || !num(w.z1) || !num(w.y0) || !num(w.y1) || w.z1 - w.z0 < 0.25 || w.y1 - w.y0 < 0.25) { out.push(`windows[${i}]: needs z0 < z1 and y0 < y1, at least 0.25 m each way`); continue; }
    if (w.z0 < tail || w.z1 > nose || w.y0 < 0.7 || w.y1 > top - 0.08) out.push(`windows[${i}]: must sit on the body, above 0.7 m and under the roof`);
  }
  if (!q.screen || !num(q.screen.y0) || !num(q.screen.y1) || q.screen.y1 - q.screen.y0 < 0.4 || q.screen.y1 > top) out.push('screen: y0 and y1 at least 0.4 m apart, under the roof');
  if (r.role === 'bus') {
    if (!HEX.test(q.paint ?? '') || !HEX.test(q.skirt ?? '')) out.push('a bus needs paint and skirt colours as #rrggbb');
    if (q.windows.length < 4) out.push('a bus has a long row of windows: at least 4 panes');
    if (q.axles.length !== 2) out.push('a bus here has 2 axles');
  } else if (q.paint || q.skirt) out.push('an emergency vehicle takes its livery from the rules: no paint or skirt');
  if (r.rows === 2) {
    const upper = q.windows.filter((w) => w.y0 > 2.2).length, lower = q.windows.filter((w) => w.y1 < 2.2).length;
    if (upper < 3 || lower < 3) out.push('a double decker has two rows of windows: at least 3 above y 2.2 and 3 below it');
  }
  if (q.id === 'ambulance' && Math.max(...b.filter((p) => p[0] > nose - 1).map((p) => p[1])) > top - 0.5) out.push('an ambulance is a van cab on a taller box: the last metre of nose is at least 0.5 m below the box roof');
  if (q.id === 'ambulance' && Math.max(...b.filter((p) => p[0] < nose - 2.2).map((p) => p[1])) < top - 0.01) out.push('the tall box runs the back two thirds of an ambulance');
  if (q.id === 'recovery_truck') {
    const bed = b.filter((p) => p[0] < nose - 2.4);
    if (Math.max(...bed.map((p) => p[1])) > 1.45) out.push('behind the cab a recovery truck is a low flat bed: the outline stays at 1.45 m or under for everything more than 2.4 m back from the nose');
    if (nose - 2.4 - tail < 4.8) out.push('the flat bed behind the cab is at least 4.8 m long');
    if (Math.max(...b.filter((p) => p[0] > nose - 2.4).map((p) => p[1])) < top - 0.01) out.push('the cab is the tallest part');
  }
  if (q.id === 'fire_engine' && front < nose - 1.6) out.push('a fire engine has its crew cab over the front axle: the front axle within 1.6 m of the nose');
  return out;
}
