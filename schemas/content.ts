// Validators for everything the local model writes. errors(x) is empty when an entry is usable, and
// src/data/content.test.ts holds the shipped files to these same rules.
export type Tier = 'common' | 'rare' | 'epic' | 'legendary';
export const TIER_PRICE: Record<Tier, number> = { common: 50, rare: 150, epic: 400, legendary: 1000 };

export const PLACE_KINDS = ['shop', 'cafe', 'school', 'park', 'market', 'office', 'clinic', 'library', 'house', 'depot'] as const;
export type Place = { id: string; name: string; kind: (typeof PLACE_KINDS)[number] };

export const QUEST_TYPES = ['delivery', 'passenger', 'trial'] as const;
export type QuestType = (typeof QUEST_TYPES)[number];
export const TWIST_TYPES = { fragile: 'delivery', melting: 'delivery', sleeping: 'passenger', late: 'passenger' } as const;
export type Twist = keyof typeof TWIST_TYPES;
export const TWISTS = Object.keys(TWIST_TYPES) as Twist[];
export const CAR_JOB_TYPES = { pickup: 'delivery', taxi: 'passenger', coupe: 'trial', supercar: 'trial' } as const;
export type JobCar = keyof typeof CAR_JOB_TYPES;
export type QuestText = { id: string; type: QuestType; title: string; text: string; twist?: Twist; car?: JobCar };

export type CatalogueKind = 'paint' | 'pattern' | 'decal' | 'body' | 'outfit' | 'accessory';
export type CatalogueItem = { id: string; kind: CatalogueKind; style: string; tier: Tier; name: string; price: number; colors: string[]; shape?: string };

// style -> the tier the design document gives it and how many colours it reads.
export const STYLES: Record<CatalogueKind, Record<string, { tier: Tier; colors: number }>> = {
  paint: { solid: { tier: 'common', colors: 1 }, metallic: { tier: 'legendary', colors: 1 } },
  pattern: {
    two_tone: { tier: 'rare', colors: 2 }, stripes: { tier: 'epic', colors: 2 }, flames: { tier: 'epic', colors: 2 },
    checker: { tier: 'epic', colors: 2 }, waves: { tier: 'epic', colors: 2 },
  },
  decal: { small: { tier: 'common', colors: 1 }, large: { tier: 'rare', colors: 1 } },
  body: { spoiler: { tier: 'epic', colors: 1 }, sport_kit: { tier: 'epic', colors: 1 }, signature: { tier: 'legendary', colors: 2 } },
  outfit: { jacket: { tier: 'rare', colors: 2 }, themed: { tier: 'epic', colors: 2 }, costume: { tier: 'legendary', colors: 2 } },
  accessory: { cap: { tier: 'common', colors: 1 }, gloves: { tier: 'common', colors: 1 }, sunglasses: { tier: 'rare', colors: 1 } },
};
export const DECAL_SHAPES = ['star', 'bolt', 'heart', 'paw', 'crown', 'number'] as const;

export const VOICE_KEYS = ['left_ahead', 'left_now', 'right_ahead', 'right_now', 'uturn_ahead', 'uturn_now', 'reached', 'recalculating', 'fuel_low', 'fuel_critical', 'bus_stopping'] as const; // bus_stopping: the bell's been rung on the bus you're riding
export type VoiceKey = (typeof VOICE_KEYS)[number];
export type VoiceLine = { key: VoiceKey; text: string };
const VOICE_WORD: Record<VoiceKey, RegExp> = {
  left_ahead: /\bleft\b/i, left_now: /\bleft\b/i, right_ahead: /\bright\b/i, right_now: /\bright\b/i,
  uturn_ahead: /\bu-turn\b/i, uturn_now: /\bu-turn\b/i, reached: /\b(reached|arrived)\b/i,
  recalculating: /\b(recalculating|new route|rerouting)\b/i, fuel_low: /\b(fuel|petrol)\b/i, fuel_critical: /\b(fuel|petrol)\b/i,
  bus_stopping: /\bstopping\b/i, // a UK bus lights up and says Bus stopping once the bell's rung
};

const ID = /^[a-z][a-z0-9_]*$/;
const HEX = /^#[0-9a-f]{6}$/;
const EMOJI = /\p{Extended_Pictographic}/u;
const PRICEY = /\d|£|\$|€|\bpoints?\b|\bcoins?\b|\bpay\b/i;
const PLAIN_NAME = /^[A-Za-z][A-Za-z' &-]*$/;
export const PLACE_NAME_MAX = 18; // longest name that fits a map label and a {dropoff} in quest text

const TWIST_WORD: Record<Twist, RegExp> = {
  fragile: /\b(careful|carefully|gentle|gently|fragile|delicate|glass|wobbly|wobbling|eggs?|china|crystal|porcelain)\b/i,
  melting: /\b(melt|melts|melting|ice|iced|frozen|cold|chilled|thaw|thawing|lolly|lollies|sorbet)\b/i,
  sleeping: /\b(sleep|sleeps|sleeping|asleep|nap|napping|dozing|snoozing|snooze|drowsy)\b/i,
  late: /\b(late|hurry|hurrying|running behind|quick|quickly|soon|train|bus|rushing|minute)\b/i,
};

const text = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && v.length > 0;

export function placeErrors(p: Place): string[] {
  if (!p || typeof p !== 'object') return ['place is not an object'];
  const out: string[] = [];
  if (!ID.test(p.id ?? '')) out.push(`id "${p.id}": snake_case`);
  if (!text(p.name) || p.name.length > PLACE_NAME_MAX || !PLAIN_NAME.test(p.name)) out.push(`${p.id}: name must be 1-${PLACE_NAME_MAX} characters, letters and spaces only`);
  if (!PLACE_KINDS.includes(p.kind)) out.push(`${p.id}: kind must be one of ${PLACE_KINDS.join(', ')}`);
  return out;
}

export function questTextErrors(q: QuestText): string[] {
  if (!q || typeof q !== 'object') return ['quest text is not an object'];
  const out: string[] = [];
  if (!ID.test(q.id ?? '')) out.push(`id "${q.id}": snake_case`);
  if (!QUEST_TYPES.includes(q.type)) out.push(`${q.id}: type must be one of ${QUEST_TYPES.join(', ')}`);
  if (!text(q.title) || q.title.length > 24) out.push(`${q.id}: title must be 1-24 characters`);
  if (!text(q.text)) return [...out, `${q.id}: text is missing`];
  const slots = q.text.match(/\{[^}]*\}/g) ?? [];
  if (slots.length !== 1 || slots[0] !== '{dropoff}') out.push(`${q.id}: text must use {dropoff} exactly once and no other {slot}`);
  const shown = q.text.replace('{dropoff}', 'x'.repeat(PLACE_NAME_MAX));
  if (shown.length > 60) out.push(`${q.id}: text is ${shown.length} characters once {dropoff} counts as ${PLACE_NAME_MAX}; the limit is 60`);
  if (PRICEY.test(q.text) || PRICEY.test(q.title)) out.push(`${q.id}: no numbers, prices or the words points, coins or pay`);
  if (EMOJI.test(q.text + q.title)) out.push(`${q.id}: no emoji`);
  if (!/[.!]$/.test(q.text)) out.push(`${q.id}: text must end in . or !`);
  if (q.twist !== undefined) {
    if (TWIST_TYPES[q.twist] !== q.type) out.push(`${q.id}: twist must be one of ${TWISTS.filter((t) => TWIST_TYPES[t] === q.type).join(', ') || 'none'} for type ${q.type}`);
    else if (!TWIST_WORD[q.twist].test(`${q.title} ${q.text}`)) out.push(`${q.id}: a ${q.twist} job must say so, using a word like ${TWIST_WORD[q.twist].source}`);
  }
  return out;
}

export function carJobErrors(q: QuestText): string[] {
  const out = questTextErrors(q);
  if (!q || typeof q !== 'object') return out;
  if (!q.car || !CAR_JOB_TYPES[q.car]) return [...out, `${q.id}: car must be one of ${Object.keys(CAR_JOB_TYPES).join(', ')}`];
  if (CAR_JOB_TYPES[q.car] !== q.type) out.push(`${q.id}: a ${q.car} job must have type ${CAR_JOB_TYPES[q.car]}`);
  if (q.twist !== undefined) out.push(`${q.id}: a car job has no twist`);
  return out;
}

export const CHATTER_MOMENTS = ['board', 'bump', 'hard_stop', 'smooth', 'nervous', 'arrive_happy', 'arrive_cross'] as const;
export type ChatterMoment = (typeof CHATTER_MOMENTS)[number];
export type ChatterLine = { id: string; moment: ChatterMoment; text: string };

// How people really talk, for lines read aloud. People run words together (I'm, let's, don't), and a line spelt out in
// full reads stiffly through a speech engine. The town is British, so American words are out.
const STIFF = /\b(I am|let us|do not|does not|did not|it is|that is|there is|you are|we are|they are|is not|are not|was not|cannot|can not|will not|I will|you will|we will|I have|you have|we have|I would|what is)\b/i;
const AMERICAN = /\b(gasoline|freeway|highway|trash|garbage|sidewalk|parking lot|vacation|candy|cookies?|mom|awesome|y'?all|buddy|apartment|traffic circle|stoplight|cell ?phone|zip code|downtown|faucet|movie theater)\b/i;
export const spokenStyle = (id: string, t: string): string[] => [
  ...(STIFF.test(t) ? [`${id}: say "${t.match(STIFF)![0]}" as people speak it: I'm, let's, don't, it's, you're, isn't, can't, won't, I'll and so on`] : []),
  ...(AMERICAN.test(t) ? [`${id}: "${t.match(AMERICAN)![0]}" is American; this town is British (petrol, pavement, car park, bin, holiday, sweets, biscuits, mum, town centre, autumn, trousers, tap, cinema)`] : []),
];

const spoken = (id: string, t: string, words: number): string[] => {
  if (!text(t) || t.split(/\s+/).length > words) return [`${id}: text must be 1-${words} words`];
  const out: string[] = [];
  if (PRICEY.test(t) || EMOJI.test(t) || /[{}]/.test(t)) out.push(`${id}: no slots, digits, prices or emoji, it is read aloud`);
  if (!/[.!?]$/.test(t)) out.push(`${id}: text must end in . ! or ?`);
  return [...out, ...spokenStyle(id, t)];
};

export function chatterErrors(c: ChatterLine): string[] {
  if (!c || typeof c !== 'object') return ['chatter line is not an object'];
  const out: string[] = [];
  if (!ID.test(c.id ?? '')) out.push(`id "${c.id}": snake_case`);
  if (!CHATTER_MOMENTS.includes(c.moment)) out.push(`${c.id}: moment must be one of ${CHATTER_MOMENTS.join(', ')}`);
  if (/\b(morning|afternoon|evening|tonight|night)\b/i.test(c.text ?? '')) out.push(`${c.id}: a lift can be at any time of day, so don't name one`);
  return [...out, ...spoken(c.id, c.text, 12)];
}

export const GUIDE_WORD = {
  take_job: /\bjobs?\b/i, follow_route: /\b(arrows?|route|follow|beacon)\b/i, delivery: /\b(bump|bumps|careful|gentle|gently)\b/i,
  passenger: /\b(stop|stops|smooth|smoothly|brake|braking)\b/i, trial: /\b(checkpoints?|gates?|clock)\b/i, fuel: /\b(fuel|pump|station)\b/i,
  twist: /\b(job|card|extra|twist)\b/i, garage: /\bgarage\b/i, finds: /\b(map|clues?)\b/i, streak: /\b(row|streak)\b/i,
  regular: /\b(story|regulars?)\b/i, ghost: /\b(ghost|best)\b/i, rank: /\b(rank|reputation|standing)\b/i, goals: /\b(goals?|today)\b/i, car_job: /\b(car|cars|pickup|taxi|coupe|supercar)\b/i,
} as const;
export type GuideKey = keyof typeof GUIDE_WORD;
export const GUIDE_KEYS = Object.keys(GUIDE_WORD) as GuideKey[];
export type GuideLine = { key: GuideKey; text: string };

export function guideErrors(g: GuideLine): string[] {
  if (!g || typeof g !== 'object') return ['guide line is not an object'];
  if (!GUIDE_KEYS.includes(g.key)) return [`key "${g.key}" must be one of ${GUIDE_KEYS.join(', ')}`];
  const out: string[] = [];
  if (!text(g.text) || g.text.length > 80) return [`${g.key}: text must be 1-80 characters`];
  if (/\d/.test(g.text) || EMOJI.test(g.text)) out.push(`${g.key}: no digits or emoji`);
  if (!/[.!]$/.test(g.text)) out.push(`${g.key}: text must end in . or !`);
  if (!GUIDE_WORD[g.key].test(g.text)) out.push(`${g.key}: must say something like ${GUIDE_WORD[g.key].source}`);
  return out;
}

// kind -> the targets that make a fair day's goal.
export const GOAL_KINDS = {
  spotless: [1, 3], gold: [1, 2], twist: [1, 2], passenger: [2, 4], delivery: [2, 4], trial: [2, 3],
  km: [3, 8], find: [1, 2], streak: [3, 4], clean: [2, 3], night: [1, 3], story: [1, 2],
} as const;
export type GoalKind = keyof typeof GOAL_KINDS;
export type Goal = { id: string; kind: GoalKind; target: number; text: string };

export function goalErrors(g: Goal): string[] {
  if (!g || typeof g !== 'object') return ['goal is not an object'];
  const out: string[] = [];
  if (!ID.test(g.id ?? '')) out.push(`id "${g.id}": snake_case`);
  const band = GOAL_KINDS[g.kind];
  if (!band) return [...out, `${g.id}: kind must be one of ${Object.keys(GOAL_KINDS).join(', ')}`];
  if (!Number.isInteger(g.target) || g.target < band[0] || g.target > band[1]) out.push(`${g.id}: target for ${g.kind} must be ${band[0]} to ${band[1]}`);
  if (!text(g.text) || g.text.length > 50) return [...out, `${g.id}: text must be 1-50 characters`];
  if (PRICEY.test(g.text) || EMOJI.test(g.text)) out.push(`${g.id}: no digits or prices, the game shows the count itself`);
  return out;
}

export type Rank = { level: number; name: string; blurb: string };
export const RANK_COUNT = 7;

export function rankErrors(r: Rank): string[] {
  if (!r || typeof r !== 'object') return ['rank is not an object'];
  const out: string[] = [];
  if (!Number.isInteger(r.level) || r.level < 0 || r.level >= RANK_COUNT) out.push(`level "${r.level}" must be 0 to ${RANK_COUNT - 1}`);
  if (!text(r.name) || r.name.length > 20 || !PLAIN_NAME.test(r.name)) out.push(`${r.level}: name must be 1-20 characters, letters and spaces only`);
  if (!text(r.blurb) || r.blurb.length > 50 || PRICEY.test(r.blurb) || EMOJI.test(r.blurb)) out.push(`${r.level}: blurb must be 1-50 characters with no numbers or prices`);
  return out;
}

export const EVENT_KINDS = ['roadworks', 'parade', 'market'] as const;
export type TownEventCard = { id: string; kind: (typeof EVENT_KINDS)[number]; title: string; text: string; boost?: Place['kind'] };
const EVENT_WORD = { roadworks: /\b(road|roads|roadworks|works|digging|cones?|detour|diggers?)\b/i, parade: /\b(parade|march|marching|band|floats?)\b/i, market: /\b(market|fair|festival|stalls?|sale|day)\b/i };

export function eventErrors(e: TownEventCard): string[] {
  if (!e || typeof e !== 'object') return ['event is not an object'];
  const out: string[] = [];
  if (!ID.test(e.id ?? '')) out.push(`id "${e.id}": snake_case`);
  if (!EVENT_KINDS.includes(e.kind)) return [...out, `${e.id}: kind must be one of ${EVENT_KINDS.join(', ')}`];
  if (!text(e.title) || e.title.length > 24 || PRICEY.test(e.title)) out.push(`${e.id}: title must be 1-24 characters with no numbers or prices`);
  out.push(...spoken(e.id, e.text, 16));
  if (text(e.text) && !EVENT_WORD[e.kind].test(e.text)) out.push(`${e.id}: a ${e.kind} event must say something like ${EVENT_WORD[e.kind].source}`);
  if (e.kind === 'market' ? !PLACE_KINDS.includes(e.boost as Place['kind']) : e.boost !== undefined) out.push(`${e.id}: boost is a place kind on market events, and banned elsewhere`);
  return out;
}

export type RegularJob = { type: QuestType; title: string; text: string; thanks: string };
export type Regular = { id: string; name: string; role: string; jobs: RegularJob[] };
export const REGULAR_JOBS = { min: 3, max: 5 };

export function regularErrors(r: Regular): string[] {
  if (!r || typeof r !== 'object') return ['regular is not an object'];
  const out: string[] = [];
  if (!ID.test(r.id ?? '')) out.push(`id "${r.id}": snake_case`);
  if (!text(r.name) || r.name.length > 14 || !PLAIN_NAME.test(r.name)) out.push(`${r.id}: name must be 1-14 characters, letters and spaces only`);
  if (!text(r.role) || r.role.length > 30 || EMOJI.test(r.role)) out.push(`${r.id}: role must be 1-30 characters`);
  if (!Array.isArray(r.jobs) || r.jobs.length < REGULAR_JOBS.min || r.jobs.length > REGULAR_JOBS.max) return [...out, `${r.id}: must have ${REGULAR_JOBS.min}-${REGULAR_JOBS.max} jobs`];
  r.jobs.forEach((j, i) => {
    out.push(...questTextErrors({ id: `${r.id}_${i + 1}`, type: j.type, title: j.title, text: j.text }));
    if (!text(j.thanks) || j.thanks.length > 70) out.push(`${r.id} job ${i + 1}: thanks must be 1-70 characters`);
    else if (PRICEY.test(j.thanks) || EMOJI.test(j.thanks) || /[{}]/.test(j.thanks) || !/[.!]$/.test(j.thanks)) out.push(`${r.id} job ${i + 1}: thanks needs no slots, numbers, prices or emoji, and ends in . or !`);
  });
  if (new Set(r.jobs.map((j) => j.title)).size !== r.jobs.length) out.push(`${r.id}: each job needs its own title`);
  if (new Set(r.jobs.map((j) => j.type)).size < 2) out.push(`${r.id}: use at least two job types`);
  return out;
}

export const PROP_KINDS = ['gnome', 'duck', 'statue', 'crate', 'signpost', 'mushroom'] as const;
export type Find = { id: string; name: string; clue: string; prop: (typeof PROP_KINDS)[number]; spot: number };

export function findErrors(f: Find): string[] {
  if (!f || typeof f !== 'object') return ['find is not an object'];
  const out: string[] = [];
  if (!ID.test(f.id ?? '')) out.push(`id "${f.id}": snake_case`);
  if (!text(f.name) || f.name.length > 24 || !PLAIN_NAME.test(f.name)) out.push(`${f.id}: name must be 1-24 characters, letters and spaces only`);
  if (!PROP_KINDS.includes(f.prop)) out.push(`${f.id}: prop must be one of ${PROP_KINDS.join(', ')}`);
  if (!Number.isInteger(f.spot) || f.spot < 0) out.push(`${f.id}: spot must be a whole number`);
  if (!text(f.clue) || f.clue.length > 90) out.push(`${f.id}: clue must be 1-90 characters`);
  else if (PRICEY.test(f.clue) || EMOJI.test(f.clue) || !/[.!?]$/.test(f.clue)) out.push(`${f.id}: clue needs no numbers, prices or emoji, and ends in . ! or ?`);
  return out;
}

export const SHAPES = ['box', 'cone', 'cylinder'] as const;
export type Part = { shape: (typeof SHAPES)[number]; x: number; y: number; z: number; w: number; h: number; l: number; color: string }; // x,z centre, y base
export type Landmark = { id: string; kind: Place['kind']; parts: Part[] };
export const LANDMARK = { half: 7, top: 20, minParts: 6, maxParts: 16 }; // half matches the solid footprint in town.ts

const touching = (a: Part, b: Part) => {
  const gap = 0.06;
  return Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) <= (a.l + b.l) / 2 + gap && a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap;
};

export function landmarkErrors(m: Landmark): string[] {
  if (!m || typeof m !== 'object') return ['landmark is not an object'];
  const out: string[] = [];
  if (!ID.test(m.id ?? '')) out.push(`id "${m.id}": snake_case`);
  if (!PLACE_KINDS.includes(m.kind)) out.push(`${m.id}: kind must be one of ${PLACE_KINDS.join(', ')}`);
  if (!Array.isArray(m.parts) || m.parts.length < LANDMARK.minParts || m.parts.length > LANDMARK.maxParts) return [...out, `${m.id}: must have ${LANDMARK.minParts}-${LANDMARK.maxParts} parts`];
  m.parts.forEach((p, i) => {
    const at = `${m.id} part ${i + 1}`;
    if (!SHAPES.includes(p.shape)) out.push(`${at}: shape must be one of ${SHAPES.join(', ')}`);
    if (![p.x, p.y, p.z, p.w, p.h, p.l].every(Number.isFinite)) return out.push(`${at}: x, y, z, w, h, l must all be numbers`);
    if (Math.min(p.w, p.h, p.l) < 0.2) out.push(`${at}: w, h and l must be at least 0.2`);
    if (Math.abs(p.x) + p.w / 2 > LANDMARK.half || Math.abs(p.z) + p.l / 2 > LANDMARK.half) out.push(`${at}: sticks out past the ${LANDMARK.half} m footprint`);
    if (p.y < 0 || p.y + p.h > LANDMARK.top) out.push(`${at}: must sit between y 0 and ${LANDMARK.top}`);
    if (!HEX.test(p.color ?? '')) out.push(`${at}: color must be lowercase #rrggbb`);
  });
  if (out.length) return out;
  if (!m.parts.some((p) => p.y === 0 && p.w >= 3 && p.l >= 3)) out.push(`${m.id}: needs a main body at y 0, at least 3 by 3`);
  const held = new Set(m.parts.filter((p) => p.y === 0));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of m.parts) if (!held.has(p) && [...held].some((h) => touching(h, p))) { held.add(p); grew = true; }
  }
  m.parts.forEach((p, i) => { if (!held.has(p)) out.push(`${m.id} part ${i + 1}: floats, it must touch a part that reaches the ground`); });
  if (new Set(m.parts.map((p) => p.color)).size < 3) out.push(`${m.id}: use at least 3 colours`);
  return out;
}

/** The building a regular's story leaves behind, standing on the lot held for them. id is the regular's id. */
export type StoryPlace = Landmark & { name: string };

export function storyPlaceErrors(s: StoryPlace): string[] {
  const out = landmarkErrors(s);
  if (s && (!text(s.name) || s.name.length > 22 || !PLAIN_NAME.test(s.name))) out.push(`${s.id}: name must be 1-22 characters, letters and spaces only`);
  return out;
}

export const SKY_SLOTS = [
  { id: 'dawn', at: 0.22, night: [0.2, 0.6], sunPower: [0.5, 1.2], ambient: [0.9, 1.6], tint: [0.55, 0.85] },
  { id: 'morning', at: 0.33, night: [0, 0], sunPower: [1.4, 2.2], ambient: [1.7, 2.4], tint: [0.9, 1] },
  { id: 'noon', at: 0.5, night: [0, 0], sunPower: [1.6, 2.4], ambient: [1.9, 2.5], tint: [0.95, 1] },
  { id: 'golden', at: 0.7, night: [0, 0.1], sunPower: [1.2, 2], ambient: [1.3, 2], tint: [0.75, 0.95] },
  { id: 'dusk', at: 0.78, night: [0.4, 0.8], sunPower: [0.4, 1], ambient: [0.8, 1.4], tint: [0.45, 0.7] },
  { id: 'night', at: 0.92, night: [1, 1], sunPower: [0.1, 0.4], ambient: [0.45, 0.9], tint: [0.28, 0.42] },
] as const;
export type Sky = { id: string; at: number; sky: string; fog: string; sun: string; sunPower: number; ambient: number; tint: string; night: number };

export const luminance = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export function skyErrors(s: Sky): string[] {
  if (!s || typeof s !== 'object') return ['sky is not an object'];
  const slot = SKY_SLOTS.find((k) => k.id === s.id);
  if (!slot) return [`id "${s.id}" must be one of ${SKY_SLOTS.map((k) => k.id).join(', ')}`];
  const out: string[] = [];
  if (s.at !== slot.at) out.push(`${s.id}: at must be ${slot.at}`);
  for (const k of ['sky', 'fog', 'sun', 'tint'] as const) if (!HEX.test(s[k] ?? '')) out.push(`${s.id}: ${k} must be lowercase #rrggbb`);
  for (const k of ['night', 'sunPower', 'ambient'] as const) if (!(s[k] >= slot[k][0] && s[k] <= slot[k][1])) out.push(`${s.id}: ${k} must be ${slot[k][0]} to ${slot[k][1]}`);
  if (!out.length) {
    const lum = luminance(s.tint);
    if (lum < slot.tint[0] || lum > slot.tint[1]) out.push(`${s.id}: tint is ${lum.toFixed(2)} bright, it must be ${slot.tint[0]} to ${slot.tint[1]} so the road stays readable`);
    if (Math.abs(luminance(s.sky) - luminance(s.fog)) > 0.25) out.push(`${s.id}: sky and fog must be close, or the horizon shows a hard line`);
  }
  return out;
}

// The DJ is a British local radio presenter. Local commercial radio carries local news, weather, travel at the busy times
// and adverts for local firms (station formats are set by Ofcom; Smooth's public files list the local inserts), so the
// ads are for the town's own businesses and travel is about its roads. Forecasts use the Met Office's words: sunny spells,
// sunny intervals, showers, outbreaks of rain.
export const RADIO_TOPICS = ['chat', 'ad', 'travel', 'weather', 'night', 'rain', 'job_done', 'job_lost', 'fuel_low', 'streak'] as const;
export type RadioTopic = (typeof RADIO_TOPICS)[number];
export type RadioLine = { id: string; topic: RadioTopic; text: string };
const RAIN_WORD = /\b(rain|rainy|wet|umbrellas?|drizzle|showers?|puddles?|downpour|spitting)\b/i;
export const RADIO_WORD: Partial<Record<RadioTopic, RegExp>> = {
  fuel_low: /\b(fuel|tank|petrol|pump|forecourt)\b/i, rain: RAIN_WORD,
  night: /\b(night|moon|stars?|dark|evening|tonight|late)\b/i, streak: /\b(streak|roll|row|shift|another|keep)\b/i,
  travel: /\b(roadworks|queues?|queuing|traffic|junctions?|roundabouts?|lights|busy|diversion|delays?|lanes?|clear|moving|slow|jams?|school run)\b/i,
  weather: /\b(sunny spells|sunny intervals|sunshine|sun|cloud|cloudy|bright|dry|breeze|breezy|mild|chilly|fresh|mist|misty|fog|foggy|frost|frosty|overcast|clear|warm|cool|grey)\b/i,
};
const RADIO_WORDS = 20;

/** The town's places that would advertise on local radio: its shops, cafés, markets and depots. */
export const adPlaces = (places: readonly Place[]) => places.filter((p) => ['shop', 'cafe', 'market', 'depot'].includes(p.kind)).map((p) => p.name);

/** A radio line. `places` are the town's business names: an advert has to be for one of them. */
export function radioErrors(r: RadioLine, places: readonly string[] = []): string[] {
  if (!r || typeof r !== 'object') return ['radio line is not an object'];
  const out: string[] = [];
  if (!ID.test(r.id ?? '')) out.push(`id "${r.id}": snake_case`);
  if (!RADIO_TOPICS.includes(r.topic)) out.push(`${r.id}: topic must be one of ${RADIO_TOPICS.join(', ')}`);
  if (!text(r.text) || r.text.split(/\s+/).length > RADIO_WORDS) return [...out, `${r.id}: text must be 1-${RADIO_WORDS} words`];
  if (PRICEY.test(r.text) || EMOJI.test(r.text) || /[{}]/.test(r.text)) out.push(`${r.id}: no slots, digits, prices or emoji, it is read aloud`);
  if (!/[.!?]$/.test(r.text)) out.push(`${r.id}: text must end in . ! or ?`);
  out.push(...spokenStyle(r.id, r.text));
  const word = RADIO_WORD[r.topic];
  if (word && !word.test(r.text)) out.push(`${r.id}: a ${r.topic} line must say something like ${word.source}`);
  if (r.topic === 'weather' && RAIN_WORD.test(r.text)) out.push(`${r.id}: weather lines play when it's dry; rain has its own topic`);
  if (r.topic !== 'night' && /\b(morning|afternoon|lunchtime|evening|tonight|night)\b/i.test(r.text)) out.push(`${r.id}: lines play at any time of day, so don't name one (only night lines may): say "today", "now" or nothing`);
  if (r.topic === 'ad' && places.length && !places.some((p) => r.text.includes(p))) out.push(`${r.id}: an advert is for one of the town's own businesses, named exactly: ${places.join(', ')}`);
  return out;
}

export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], pentatonic: [0, 2, 4, 7, 9] } as const;
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export type Station = { id: string; name: string; tagline: string; bpm: number; root: number; scale: keyof typeof SCALES; wave: (typeof WAVES)[number]; bass: number[]; lead: number[] }; // notes are scale degrees, -1 rests

export function stationErrors(s: Station): string[] {
  if (!s || typeof s !== 'object') return ['station is not an object'];
  const out: string[] = [];
  if (!ID.test(s.id ?? '')) out.push(`id "${s.id}": snake_case`);
  if (!text(s.name) || s.name.length > 16 || !PLAIN_NAME.test(s.name)) out.push(`${s.id}: name must be 1-16 characters, letters and spaces only`);
  if (!text(s.tagline) || s.tagline.length > 40 || PRICEY.test(s.tagline)) out.push(`${s.id}: tagline must be 1-40 characters with no numbers or prices`);
  if (!(s.bpm >= 70 && s.bpm <= 132)) out.push(`${s.id}: bpm must be 70 to 132`);
  if (!Number.isInteger(s.root) || s.root < 48 || s.root > 60) out.push(`${s.id}: root must be a MIDI note from 48 to 60`);
  if (!Object.keys(SCALES).includes(s.scale)) out.push(`${s.id}: scale must be one of ${Object.keys(SCALES).join(', ')}`);
  if (!WAVES.includes(s.wave)) out.push(`${s.id}: wave must be one of ${WAVES.join(', ')}`);
  const line = (name: string, notes: number[], len: number, min: number, top: number) => {
    if (!Array.isArray(notes) || notes.length !== len) return out.push(`${s.id}: ${name} must be exactly ${len} steps`);
    if (notes.some((n) => !Number.isInteger(n) || n < -1 || n > top)) out.push(`${s.id}: ${name} steps must be whole numbers from -1 (rest) to ${top}`);
    const sounded = notes.filter((n) => n >= 0);
    if (sounded.length < min) out.push(`${s.id}: ${name} needs at least ${min} sounded steps`);
    if (new Set(sounded).size < 3) out.push(`${s.id}: ${name} needs at least 3 different notes`);
  };
  line('bass', s.bass, 16, 5, 7);
  line('lead', s.lead, 32, 10, 12);
  return out;
}

export function catalogueErrors(c: CatalogueItem): string[] {
  if (!c || typeof c !== 'object') return ['item is not an object'];
  const out: string[] = [];
  if (!ID.test(c.id ?? '')) out.push(`id "${c.id}": snake_case`);
  if (!text(c.name) || c.name.length > 20 || !PLAIN_NAME.test(c.name)) out.push(`${c.id}: name must be 1-20 characters, letters and spaces only`);
  const rule = STYLES[c.kind]?.[c.style];
  if (!rule) return [...out, `${c.id}: style "${c.style}" is not allowed for kind "${c.kind}"`];
  if (c.tier !== rule.tier) out.push(`${c.id}: ${c.kind} ${c.style} must be tier ${rule.tier}`);
  if (c.price !== TIER_PRICE[rule.tier]) out.push(`${c.id}: price must be ${TIER_PRICE[rule.tier]} for tier ${rule.tier}`);
  if (!Array.isArray(c.colors) || c.colors.length !== rule.colors || c.colors.some((h) => !HEX.test(h))) out.push(`${c.id}: colors must be exactly ${rule.colors} lowercase #rrggbb value(s)`);
  if (c.kind === 'decal' ? !DECAL_SHAPES.includes(c.shape as (typeof DECAL_SHAPES)[number]) : c.shape !== undefined) out.push(`${c.id}: shape is required on decals (one of ${DECAL_SHAPES.join(', ')}) and banned elsewhere`);
  return out;
}

export function voiceErrors(v: VoiceLine): string[] {
  if (!v || typeof v !== 'object') return ['voice line is not an object'];
  const out: string[] = [];
  if (!VOICE_KEYS.includes(v.key)) return [`key "${v.key}" is not a phrase key`];
  if (!text(v.text) || v.text.split(/\s+/).length > 6) out.push(`${v.key}: text must be 1-6 words`);
  else if (!VOICE_WORD[v.key].test(v.text)) out.push(`${v.key}: must say ${VOICE_WORD[v.key].source}`);
  if (/\d/.test(v.text ?? '') || EMOJI.test(v.text ?? '')) out.push(`${v.key}: no digits or emoji, it is read aloud`);
  return out;
}

export function uniqueIds(items: { id?: string; key?: string }[]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const i of items) { const k = i.id ?? i.key ?? ''; if (seen.has(k)) out.push(`${k}: used twice`); seen.add(k); }
  return out;
}
