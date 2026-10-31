// The town's four districts, laid out the way a planner would. Land use follows the multiple nuclei model (Harris and
// Ullman, 1945): separate centres, and uses that don't get on kept apart. Each district is one zone of a form-based
// code: where a building stands relative to the street, how wide its plot, how tall. Old Town is built to the pavement
// so the street feels enclosed, height to width between 1:1 and 1:3. Works sits at the edge, on a planted buffer from housing.
export const DISTRICT_IDS = ['oldtown', 'business', 'garden', 'works'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export type DistrictRules = {
  name: string;
  character: string; // for the people and models who dress it
  plot: [number, number]; // half the frontage, metres
  depth: [number, number]; // half the depth, metres
  setback: number; // road edge to building face, metres: the pavement, and any front garden or yard
  gap: [number, number]; // between neighbours along the street, metres
  alleyEvery: number; // a wider gap after this many buildings, so a closed row always has a way through
  skip: number; // share of plots left open
  storeys: [number, number];
  trees: number; // share of the town's tree spots kept here
  parked: number; // share of kerbside bays with a car in
  map: string; // its tint on the map
};

export const DISTRICTS: Record<DistrictId, DistrictRules> = {
  oldtown: { name: 'Old Town', character: 'the historic market core: narrow plots built wall to wall right up to the pavement, shops at street level, brick and stone', plot: [5, 9], depth: [7, 11], setback: 3, gap: [0.4, 1], alleyEvery: 3, skip: 0.03, storeys: [2, 5], trees: 0.12, parked: 0.6, map: '#d9b48f' },
  business: { name: 'Business Quarter', character: 'the commercial centre: big plots, glass and pale panels, towers stepping back above a street wall', plot: [11, 19], depth: [11, 18], setback: 5, gap: [3, 6], alleyEvery: 4, skip: 0.12, storeys: [6, 12], trees: 0.2, parked: 0.3, map: '#a9b9cf' },
  garden: { name: 'Garden Suburb', character: 'low houses in soft colours behind front gardens, plots half open, plenty of street trees', plot: [5, 8], depth: [5, 7], setback: 9, gap: [3, 6], alleyEvery: 3, skip: 0.14, storeys: [2, 2], trees: 1, parked: 0.45, map: '#8fd07a' },
  works: { name: 'The Works', character: 'the edge of town: big low sheds on large yards, loading bays, painted metal and old brick, hardly a tree', plot: [14, 26], depth: [12, 19], setback: 12, gap: [9, 16], alleyEvery: 2, skip: 0.18, storeys: [2, 3], trees: 0.1, parked: 0.2, map: '#b9b4ad' },
};

// A town has one business centre and one old core, close together, one industrial edge, and suburbs round the rest.
const NUCLEI: { id: DistrictId; x: number; z: number; pull: number }[] = [
  { id: 'business', x: 1600, z: 1320, pull: 0.82 },
  { id: 'oldtown', x: 1120, z: 1680, pull: 0.92 },
  { id: 'works', x: 2560, z: 2480, pull: 0.92 },
  { id: 'works', x: 2750, z: 1500, pull: 0.5 },
  { id: 'garden', x: 620, z: 720, pull: 1 },
  { id: 'garden', x: 2300, z: 560, pull: 1 },
  { id: 'garden', x: 620, z: 2420, pull: 1 },
  { id: 'garden', x: 1620, z: 2500, pull: 0.8 },
];

/** How each district scores here, the lowest winning; a slow wobble keeps the borders from reading as straight lines. */
function scores(x: number, z: number) {
  const wobX = x + Math.sin(z / 310) * 70 + Math.sin(z / 127) * 26, wobZ = z + Math.sin(x / 270) * 70 + Math.sin(x / 113) * 26;
  const best: Partial<Record<DistrictId, number>> = {};
  for (const n of NUCLEI) {
    const s = Math.hypot(wobX - n.x, wobZ - n.z) / n.pull;
    if (s < (best[n.id] ?? Infinity)) best[n.id] = s;
  }
  return best as Record<DistrictId, number>;
}

export function districtAt(x: number, z: number): DistrictId {
  const s = scores(x, z);
  return DISTRICT_IDS.reduce((a, b) => (s[b] < s[a] ? b : a));
}

/** The planted strip between the works and everywhere else: nothing is built on it. */
export function onBuffer(x: number, z: number): boolean {
  const s = scores(x, z), others = Math.min(s.oldtown, s.business, s.garden);
  return Math.abs(s.works - others) < 45;
}
