// Content generator: ask the local model, validate, repair with the validator's errors, merge only what passes.
//   node --env-file=.env.llm tools/qwen-gen.ts places quests catalogue voice
//   ... quests --replace a,b   redoes shipped ids on purpose; nothing is silently overwritten.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chat, parseJson } from './llm.ts';
import { adPlaces, CAR_JOB_TYPES, carJobErrors, catalogueErrors, chatterErrors, eventErrors, findErrors, GOAL_KINDS, goalErrors, GUIDE_KEYS, GUIDE_WORD, guideErrors, landmarkErrors, PLACE_KINDS, placeErrors, PROP_KINDS, questTextErrors, radioErrors, RANK_COUNT, rankErrors, regularErrors, skyErrors, SKY_SLOTS, stationErrors, storyPlaceErrors, STYLES, TIER_PRICE, TWISTS, VOICE_KEYS, voiceErrors, type CatalogueKind, type JobCar, type Place, type RadioLine, type Regular } from '../schemas/content.ts';
import { PLACE_SHOPS, shopErrors, type Shop } from '../schemas/shops.ts';
import { BASE_SAYS, CALL_CAREERS, CALL_KINDS, callErrors } from '../schemas/careers.ts';
import { buildingSetErrors, buildingStyleErrors, type BuildingStyle } from '../schemas/buildings.ts';
import { carProfileErrors, profileVsCar, type CarBodyProfile } from '../schemas/carprofiles.ts';
import { FLEET_RULES, fleetErrors } from '../schemas/fleet.ts';
import { BACK_ABOVE_SEAT_M, FURNITURE_IDS, FURNITURE_RULES, furnitureErrors, PALLET, SEAT_M, type FurnitureId } from '../schemas/furniture.ts';
import { greyHaired, HAIR_STYLES, personErrors, SKIN_TONES, skinTone, type PersonLook, type SkinTone } from '../schemas/people.ts';
import { ROAD_MOMENTS, roadLineErrors, SERVICE_RULES, serviceErrors, type RoadLine } from '../schemas/services.ts';
import { townCarErrors, townCarKindErrors, type TownCar } from '../schemas/towncars.ts';
import { CARS, type CarId } from '../src/sim/economy.ts';
import { DISTRICTS, DISTRICT_IDS } from '../src/sim/districts.ts';
import { landmarkFor } from '../src/sim/quests.ts';
import { Town } from '../src/sim/town.ts';

const PLACES = JSON.parse(readFileSync('src/data/places.json', 'utf8')) as Place[];
const carNotes = (existsSync('.qwen-runs/car-notes.json') ? JSON.parse(readFileSync('.qwen-runs/car-notes.json', 'utf8')) : {}) as Record<string, string>; // left by tools/carreview.ts
const replaceFlag = process.argv.indexOf('--replace'), replaceIds = new Set(replaceFlag >= 0 ? process.argv[replaceFlag + 1].split(',') : []);

// One recipe per slot, so the set is varied by construction and the model's job is to make each one good.
const BUILDING_SLOTS = [
  ['high_street_brick', 'oldtown', 'brick', 'tall', 'shopfront', 'parapet'],
  ['market_row', 'oldtown', 'render', 'shuttered', 'shopfront', 'pitched'],
  ['corner_arcade', 'oldtown', 'stone', 'arched', 'arcade', 'parapet'],
  ['old_bank', 'oldtown', 'stone', 'tall', 'lobby', 'flat'],
  ['glass_tower', 'business', 'cladding', 'curtain', 'lobby', 'setback'],
  ['ribbon_office', 'business', 'panel', 'ribbon', 'arcade', 'plant'],
  ['stone_chambers', 'business', 'stone', 'tall', 'lobby', 'setback'],
  ['tower_flats', 'business', 'panel', 'punched', 'lobby', 'plant'],
  ['painted_terrace', 'garden', 'render', 'punched', 'same', 'pitched'],
  ['brick_semis', 'garden', 'brick', 'tall', 'same', 'pitched'],
  ['pebble_cottages', 'garden', 'render', 'shuttered', 'same', 'pitched'],
  ['garden_flats', 'garden', 'brick', 'ribbon', 'lobby', 'flat'],
  ['tin_shed', 'works', 'cladding', 'ribbon', 'loading', 'pitched'],
  ['old_mill', 'works', 'brick', 'arched', 'loading', 'parapet'],
  ['concrete_depot', 'works', 'panel', 'punched', 'loading', 'flat'],
  ['cold_store', 'works', 'cladding', 'ribbon', 'loading', 'plant'],
  ['shopping_centre', 'business', 'cladding', 'ribbon', 'arcade', 'flat'], // the one shopping centre: use centre, two tall floors
] as const;

// What each piece of furniture is, and the features schemas/furniture.ts checks for, in words.
const FURNITURE_LOOK: Record<FurnitureId, string> = {
  bench: `a public bench: a seat slab at least 1.3 m long and 0.25 deep, at most 0.15 thick, its top ${SEAT_M.join('-')} m up, on legs or end frames; a back behind it (lower z) at least 1.2 m long rising ${BACK_ABOVE_SEAT_M} m or more above the seat. Armrests at the ends are welcome.`,
  bin: 'a cast iron litter bin on the pavement: a body with a lid or domed top, maybe a band of trim or a posting slot.',
  planter: 'a town centre planter: a box or tub on the ground 0.35-1 m tall and at least 0.6 m each way, with green shrubs on top (green parts 0.3 m up or more).',
  bollard: 'a street bollard: one post from the ground, with a collar band at least 0.06 m tall in its top 0.45 m, in a colour much lighter or darker than the post, like a white band on a black post.',
  cycle_rack: 'one Sheffield cycle stand: an upside-down U of round steel tube about 0.05 m thick, so exactly 2 legs from the ground, each at least 0.5 m tall, joined by a bar across the top. Every part at most 0.08 m across.',
  bus_shelter: 'a glass bus shelter: a roof over it all, at least 2.8 m long and 1.1 deep; a glass back wall on the far side from the road (z below 0), at least 2.5 m long, 1.8 tall and at most 0.1 thick; glass ends; a seat or perch inside, its top 0.45-0.8 m up. The front (+z) is open to the road, with no wall more than 1.2 m long.',
  container: `a 20 ft ISO shipping container standing in a works yard, its length along z. Part 1 is the box itself, exactly #ffffff, about 2.44 by 2.59 by 6.06 m, as each container is painted its own colour. Add doors, corner posts or ribs in other colours.`,
  pallets: `goods on pallets in a works yard: at least one standard UK pallet on the ground, a box ${PALLET.a} by ${PALLET.b} m and ${PALLET.h.join('-')} m tall at y 0, with a load stacked on it (sacks, boxes, a shrink-wrapped stack). A second pallet beside it is welcome.`,
};

// The mix of ages and skin tones is set here, near the census shares in schemas/people.ts, so Qwen's job is to dress each one.
const PERSON_SLOTS: [SkinTone, boolean][] = [...Array(8).fill(['fair', false]), ...Array(2).fill(['fair', true]), ...Array(8).fill(['light', false]), ...Array(1).fill(['light', true]), ['medium', false], ['brown', false], ['medium', true], ['brown', true], ['deep', false]].map(([tone, older]) => [tone, older] as [SkinTone, boolean]);

type Entry = Record<string, unknown>;
type Batch = { ask: string; fits?: (e: Entry, i: number) => string[] };
type Kind = { file: string; prompt: string; errors: (e: never) => string[]; key: string; batches: () => Batch[]; checker?: string }; // checker: what a second reader judges, on top of the validator

const slot = (kind: CatalogueKind, style: string, count: number, shapes: string[] = []) =>
  Array.from({ length: count }, (_, i) => ({
    kind, style, tier: STYLES[kind][style].tier, price: TIER_PRICE[STYLES[kind][style].tier], colors: STYLES[kind][style].colors, shape: shapes[i] as string | undefined,
  }));

const slotBatch = (slots: ReturnType<typeof slot>): Batch => ({
  ask: `Slots:\n${slots.map((s, i) => `${i + 1}. kind ${s.kind}, style ${s.style}, tier ${s.tier}, price ${s.price}, ${s.colors} colour(s)${s.shape ? `, shape ${s.shape}` : ''}`).join('\n')}`,
  fits: (e, i) => {
    const s = slots[i];
    if (!s) return ['more entries than slots'];
    return e.kind === s.kind && e.style === s.style && s.shape === e.shape ? [] : [`entry ${i + 1} must match slot ${i + 1}: kind ${s.kind}, style ${s.style}${s.shape ? `, shape ${s.shape}` : ''}`];
  },
});

const townPlaces = () => JSON.parse(readFileSync('src/data/places.json', 'utf8')) as Place[];

// Each hiding place, with the place and direction its clue has to give.
function findBatches(perBatch: number): Batch[] {
  const town = new Town(), places = JSON.parse(readFileSync('src/data/places.json', 'utf8')) as Place[];
  const slots = town.spots.slice(0, 40).map((s, spot) => ({ spot, prop: PROP_KINDS[spot % PROP_KINDS.length], ...landmarkFor(town, places, s) }));
  const out: Batch[] = [];
  for (let i = 0; i < slots.length; i += perBatch) {
    const part = slots.slice(i, i + perBatch);
    out.push({
      ask: `Slots:\n${part.map((s, n) => `${n + 1}. spot ${s.spot}, prop ${s.prop}, ${s.way} of ${s.name}`).join('\n')}`,
      fits: (e, n) => {
        const s = part[n];
        if (!s) return ['more entries than slots'];
        const clue = String(e.clue);
        return [
          ...(e.spot === s.spot && e.prop === s.prop ? [] : [`entry ${n + 1} must use spot ${s.spot} and prop ${s.prop}`]),
          ...(clue.includes(s.name) ? [] : [`entry ${n + 1}: clue must contain "${s.name}" exactly`]),
          ...(new RegExp(`\\b${s.way}\\b`, 'i').test(clue) ? [] : [`entry ${n + 1}: clue must say "${s.way}"`]),
        ];
      },
    });
  }
  return out;
}

const CAR_FACTS: Record<string, string> = {
  supermini: 'The real car: 4.06 m long, 1.43 m tall, 1.765 m wide, wheelbase 2.54, front overhang 0.83, rear overhang 0.69. Give axles as [rear z, front z] and wheel 0.31. Sill 0.2, waist about 0.93, with a raked hatch back.\n',
};

/** The ids already in a file, so a run only spends the model's time on what's new or being replaced. */
const existing = (file: string) => new Set(existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]).map((e) => e.id) : []);

const KINDS: Record<string, Kind> = {
  places: {
    file: 'src/data/places.json', prompt: 'prompts/places.txt', errors: placeErrors as Kind['errors'], key: 'id',
    batches: () => [
      { ask: 'Write 30 places: 6 shop, 4 cafe, 3 school, 3 park, 3 market, 3 office, 2 clinic, 2 library, 4 depot.' },
      { ask: 'Write 24 places: 12 house (named homes or streets of homes), 4 shop, 4 cafe, 2 park, 2 market. Avoid the most obvious names.' },
    ],
  },
  // Stage D: the town has 93 plots and had 54 names, so names came round twice. These fill the rest, each kind set by
  // its slot, with the recovery yard and the patrol base a career signs on at, named so BASE_SAYS can find them.
  moreplaces: {
    file: 'src/data/places.json', prompt: 'prompts/places.txt', errors: placeErrors as Kind['errors'], key: 'id',
    batches: () => {
      const want = new Town().plots.length - PLACES.length;
      const kinds: [string, string][] = [['depot', 'a vehicle recovery yard: the name says Recovery or Towing'], ['depot', 'a breakdown patrol base and car repair garage: the name says Garage, Motors or Repairs'], ['depot', 'a builders merchant or timber yard'],
        ...['shop', 'shop', 'shop', 'shop', 'shop', 'shop', 'cafe', 'cafe', 'cafe', 'cafe', 'office', 'office', 'office', 'office', 'market', 'market', 'clinic', 'clinic', 'park', 'park', 'library', 'school', 'house', 'house', 'house', 'house', 'house', 'house', 'house', 'house', 'house', 'house', 'shop', 'cafe', 'office', 'house'].map((k): [string, string] => [k, k === 'house' ? 'a named home or a street of homes' : `a ${k}`])].slice(0, Math.max(0, want));
      const names = new Set(PLACES.map((p) => p.name.toLowerCase()));
      return Array.from({ length: Math.ceil(kinds.length / 13) }, (_, b) => kinds.slice(b * 13, b * 13 + 13)).map((part): Batch => ({
        ask: `Slots:\n${part.map(([k, what], n) => `${n + 1}. kind ${k}: ${what}`).join('\n')}\nWrite one place per slot, in order. These names are taken already, so avoid them and anything close: ${PLACES.map((p) => p.name).join(', ')}.`,
        fits: (e, i) => {
          const slot = part[i];
          if (!slot) return ['more entries than slots'];
          const out = e.kind === slot[0] ? [] : [`entry ${i + 1} must be kind ${slot[0]}`];
          if (names.has(String(e.name).toLowerCase())) out.push(`${String(e.name)}: that name is taken`);
          if (/Recovery or Towing/.test(slot[1]) && !BASE_SAYS.recovery.test(String(e.name))) out.push(`entry ${i + 1}: the name must say Recovery or Towing`);
          if (/Garage, Motors/.test(slot[1]) && !BASE_SAYS.mechanic.test(String(e.name))) out.push(`entry ${i + 1}: the name must say Garage, Motors or Repairs`);
          return out;
        },
      }));
    },
  },
  // Stage D's calls, eight a career: the kinds, blue lights and times are the rules', the words are the model's.
  calls: {
    file: 'src/data/calls.json', prompt: 'prompts/calls.txt', errors: callErrors as Kind['errors'], key: 'id',
    checker: 'These are 999 and breakdown calls for a family driving game, as JSON. Flag a call whose text does not fit its kind (a bin fire that sounds like a house fire, a category 3 ambulance call that sounds life-threatening), anything frightening for a young child, or two calls that say the same thing.',
    batches: () => CALL_CAREERS.map((career) => {
      const kinds = Object.keys(CALL_KINDS[career]), n = 8;
      const slots = Array.from({ length: n }, (_, i) => kinds[i % kinds.length]);
      return {
        ask: `Write ${n} ${career} calls, one per slot, in order:\n${slots.map((k, i) => `${i + 1}. career ${career}, kind ${k}`).join('\n')}`,
        fits: (e: Entry, i: number) => (e.career === career && e.kind === slots[i] ? [] : [`entry ${i + 1} must be career ${career}, kind ${slots[i]}`]),
      };
    }),
  },
  quests: {
    file: 'src/data/quests.json', prompt: 'prompts/quests.txt', errors: questTextErrors as Kind['errors'], key: 'id',
    batches: () => [{ ask: 'Write 14 job cards with type delivery.' }, { ask: 'Write 14 job cards with type passenger.' }, { ask: 'Write 12 job cards with type trial.' }],
  },
  twists: {
    file: 'src/data/quests.json', prompt: 'prompts/twists.txt', errors: questTextErrors as Kind['errors'], key: 'id',
    batches: () => TWISTS.map((twist) => ({ ask: `Write 5 job cards with twist ${twist}.`, fits: (e: Entry, i: number) => (e.twist === twist ? [] : [`entry ${i + 1} must have twist ${twist}`]) })),
  },
  carjobs: {
    file: 'src/data/quests.json', prompt: 'prompts/carjobs.txt', errors: carJobErrors as Kind['errors'], key: 'id',
    batches: () => (Object.keys(CAR_JOB_TYPES) as JobCar[]).map((car) => ({ ask: `Write 5 job cards with car ${car} and type ${CAR_JOB_TYPES[car]}.`, fits: (e: Entry, i: number) => (e.car === car ? [] : [`entry ${i + 1} must have car ${car}`]) })),
  },
  chatter: {
    file: 'src/data/chatter.json', prompt: 'prompts/chatter.txt', errors: chatterErrors as Kind['errors'], key: 'id',
    checker: 'These are things passengers say to the driver in a family driving game set in a British town, read aloud by a speech engine. Flag any line no real person would say, that is nonsense rather than funny, that sounds stiff or American, that is rude, or that repeats the idea of another line.',
    batches: () => [
      { ask: 'Write 8 lines with moment board, 8 with moment bump and 6 with moment hard_stop.' },
      { ask: 'Write 8 lines with moment smooth, 8 with moment nervous, 6 with moment arrive_happy and 6 with moment arrive_cross.' },
    ],
  },
  guide: {
    file: 'src/data/guide.json', prompt: 'prompts/guide.txt', errors: guideErrors as Kind['errors'], key: 'key',
    batches: () => [{ ask: `Write one line for each key. Required words:\n${GUIDE_KEYS.map((k) => `${k}: ${GUIDE_WORD[k].source}`).join('\n')}` }],
  },
  goals: {
    file: 'src/data/goals.json', prompt: 'prompts/goals.txt', errors: goalErrors as Kind['errors'], key: 'id',
    batches: () => [{ ask: `Write 3 goals for each kind: ${Object.keys(GOAL_KINDS).join(', ')}. Vary the target within its range.` }],
  },
  ranks: {
    file: 'src/data/ranks.json', prompt: 'prompts/ranks.txt', errors: rankErrors as Kind['errors'], key: 'level',
    batches: () => [{ ask: `Write ${RANK_COUNT} ranks.` }],
  },
  stories: {
    file: 'src/data/stories.json', prompt: 'prompts/stories.txt', errors: storyPlaceErrors as Kind['errors'], key: 'id',
    batches: () => {
      const regs = JSON.parse(readFileSync('src/data/regulars.json', 'utf8')) as Regular[];
      return [regs.slice(0, 3), regs.slice(3)].map((part) => ({
        ask: `Regulars:\n${part.map((r) => `id ${r.id}: ${r.name}, ${r.role}. The story ends: ${r.jobs.at(-1)!.thanks}`).join('\n')}`,
        fits: (e: Entry, i: number) => (e.id === part[i]?.id ? [] : [`entry ${i + 1} must have id ${part[i]?.id}`]),
      }));
    },
  },
  events: {
    file: 'src/data/events.json', prompt: 'prompts/events.txt', errors: eventErrors as Kind['errors'], key: 'id',
    batches: () => [{ ask: 'Write 5 roadworks events, 4 parade events and 8 market events, with a different boost on each market.' }],
  },
  regulars: {
    file: 'src/data/regulars.json', prompt: 'prompts/regulars.txt', errors: regularErrors as Kind['errors'], key: 'id',
    batches: () => [
      { ask: 'Write 3 regulars: a baker opening a shop, a retired bus driver teaching a grandchild to drive, and a shy band looking for its first gig.' },
      { ask: 'Write 3 regulars: a vet tracking a runaway tortoise, a teacher staging the school play, and a gardener growing a prize marrow.' },
    ],
  },
  landmarks: {
    file: 'src/data/landmarks.json', prompt: 'prompts/landmarks.txt', errors: landmarkErrors as Kind['errors'], key: 'id',
    batches: () => Array.from({ length: Math.ceil(PLACE_KINDS.length / 2) }, (_, i) => {
      const pair = PLACE_KINDS.slice(i * 2, i * 2 + 2);
      return { ask: `Write 4 buildings: 2 with kind ${pair[0]} and 2 with kind ${pair[1]}. The two of each kind must look clearly different from each other.`, fits: (e: Entry, n: number) => (e.kind === pair[n < 2 ? 0 : 1] ? [] : [`entry ${n + 1} must have kind ${pair[n < 2 ? 0 : 1]}`]) };
    }),
  },
  finds: { file: 'src/data/finds.json', prompt: 'prompts/finds.txt', errors: findErrors as Kind['errors'], key: 'id', batches: () => findBatches(8) },
  // A find whose clue names the wrong landmark now, after the town's places changed: rewritten under the same id.
  refinds: {
    file: 'src/data/finds.json', prompt: 'prompts/finds.txt', errors: findErrors as Kind['errors'], key: 'id',
    batches: () => {
      const town = new Town(), places = townPlaces(), shipped = JSON.parse(readFileSync('src/data/finds.json', 'utf8')) as { id: string; spot: number; prop: string; clue: string }[];
      const stale = shipped.map((f) => ({ f, ...landmarkFor(town, places, town.spots[f.spot]) })).filter(({ f, name, way }) => !f.clue.includes(name) || !f.clue.toLowerCase().includes(way));
      for (const { f } of stale) replace.add(f.id);
      return stale.length ? [{
        ask: `Rewrite each of these finds' clues for its new landmark. Keep every id, spot and prop exactly.\n${stale.map(({ f, name, way }, n) => `${n + 1}. id ${f.id}, spot ${f.spot}, prop ${f.prop}: the clue must contain "${name}" exactly and say "${way}". Old clue: ${f.clue}`).join('\n')}`,
        fits: (e: Entry, n: number) => {
          const s = stale[n];
          if (!s) return ['more entries than finds'];
          const clue = String(e.clue);
          return [
            ...(e.id === s.f.id && e.spot === s.f.spot && e.prop === s.f.prop ? [] : [`entry ${n + 1} must keep id ${s.f.id}, spot ${s.f.spot} and prop ${s.f.prop}`]),
            ...(clue.includes(s.name) ? [] : [`entry ${n + 1}: clue must contain "${s.name}" exactly`]),
            ...(new RegExp(`\\b${s.way}\\b`, 'i').test(clue) ? [] : [`entry ${n + 1}: clue must say "${s.way}"`]),
          ];
        },
      }] : [];
    },
  },
  skies: {
    file: 'src/data/skies.json', prompt: 'prompts/skies.txt', errors: skyErrors as Kind['errors'], key: 'id',
    batches: () => [{ ask: `Slots:\n${SKY_SLOTS.map((s) => `id ${s.id}, at ${s.at}, night ${s.night.join('-')}, sunPower ${s.sunPower.join('-')}, ambient ${s.ambient.join('-')}, tint brightness ${s.tint.join('-')} (0 black, 1 white), sky and fog brightness within 0.25 of each other`).join('\n')}` }],
  },
  radio: {
    file: 'src/data/radio.json', prompt: 'prompts/radio.txt', errors: ((r: RadioLine) => radioErrors(r, adPlaces(townPlaces()))) as Kind['errors'], key: 'id',
    checker: 'These are lines for a British local radio presenter in a family driving game, read aloud by a speech engine. Flag any line that a real presenter would never say, that is nonsense rather than funny, that sounds stiff or American, or that repeats the idea of another line.',
    batches: () => {
      const town = `The town's districts: ${DISTRICT_IDS.map((id) => DISTRICTS[id].name).join(', ')}. Its businesses: ${adPlaces(townPlaces()).join(', ')}.`;
      return [
        { ask: `${town}
Write 10 lines with topic chat.` },
        { ask: `${town}
Write 10 lines with topic ad, each for a different business from the list, named exactly.` },
        { ask: `${town}
Write 8 lines with topic travel.` },
        { ask: 'Write 6 lines with topic weather, 5 with topic night and 6 with topic rain.' },
        { ask: 'Write 5 lines each with topics job_done, job_lost, fuel_low and streak.' },
      ];
    },
  },
  stations: {
    file: 'src/data/stations.json', prompt: 'prompts/stations.txt', errors: stationErrors as Kind['errors'], key: 'id',
    batches: () => [{ ask: 'Write 3 stations: a sunny easy-going one, a cool minor late-night one, and a bouncy upbeat one.' }],
  },
  catalogue: {
    file: 'src/data/catalogue.json', prompt: 'prompts/catalogue.txt', errors: catalogueErrors as Kind['errors'], key: 'id',
    batches: () => [
      slotBatch([...slot('paint', 'solid', 8), ...slot('paint', 'metallic', 3), ...slot('pattern', 'two_tone', 4)]),
      slotBatch([...slot('pattern', 'stripes', 2), ...slot('pattern', 'flames', 2), ...slot('pattern', 'checker', 2), ...slot('pattern', 'waves', 2), ...slot('decal', 'small', 4, ['star', 'heart', 'paw', 'number']), ...slot('decal', 'large', 4, ['bolt', 'crown', 'star', 'paw'])]),
      slotBatch([...slot('body', 'spoiler', 2), ...slot('body', 'sport_kit', 2), ...slot('body', 'signature', 2), ...slot('accessory', 'cap', 3), ...slot('accessory', 'gloves', 2), ...slot('accessory', 'sunglasses', 3), ...slot('outfit', 'jacket', 4), ...slot('outfit', 'themed', 3), ...slot('outfit', 'costume', 3)]),
    ],
  },
  // Wheels and lights, into the same catalogue: run on their own so the shipped items aren't asked for again.
  carparts: {
    file: 'src/data/catalogue.json', prompt: 'prompts/catalogue.txt', errors: catalogueErrors as Kind['errors'], key: 'id',
    batches: () => [slotBatch([...slot('wheels', 'steel', 3), ...slot('wheels', 'alloy', 4), ...slot('wheels', 'sport', 3), ...slot('lights', 'halogen', 2), ...slot('lights', 'led', 3), ...slot('lights', 'drl', 3)])],
  },
  carprofiles: {
    file: 'src/data/carprofiles.json', prompt: 'prompts/carprofiles.txt', errors: carProfileErrors as Kind['errors'], key: 'id',
    batches: () => [{
      ask: `Slots:\n${CARS.map((c) => `id ${c.id}: ${c.size[0]} m long, ${c.size[1]} m tall, ${c.size[2]} m wide`).join('\n')}\nWrite one profile per slot, in slot order.`,
      fits: (e, i) => {
        const slot = CARS[i];
        if (!slot) return ['more entries than slots'];
        if (e.id !== slot.id) return [`entry ${i + 1} must have id ${slot.id}`];
        return carProfileErrors(e).length ? [] : profileVsCar(e as CarBodyProfile, slot.size);
      },
    }],
  },
  buildingstyles: {
    file: 'src/data/buildingstyles.json', prompt: 'prompts/buildingstyles.txt', errors: buildingStyleErrors as Kind['errors'], key: 'id',
    checker: "These are building styles for a town, as JSON. Old Town is warm brick and stone, the Business Quarter pale with blue glass, the Garden Suburb soft and low, The Works strong industrial colours. Flag a style whose colours don't fit its district, whose colours would look muddy or clash, or that reads too like another style in the list.",
    batches: () => {
      const notes = existsSync('.qwen-runs/building-notes.txt') ? `\n\nReview notes from the last render, to act on:\n${readFileSync('.qwen-runs/building-notes.txt', 'utf8')}` : '';
      const have = new Set(existsSync('src/data/buildingstyles.json') ? (JSON.parse(readFileSync('src/data/buildingstyles.json', 'utf8')) as Entry[]).map((e) => e.id) : []);
      const open = BUILDING_SLOTS.filter((s) => replaceIds.has(s[0]) || !have.has(s[0])); // only the gaps, and any named for a redo
      return [open.slice(0, 8), open.slice(8)].filter((part) => part.length).map((part) => ({
        ask: `Slots:\n${part.map(([id, district, finish, form, ground, roof]) => `id ${id}: district ${district}, finish ${finish}, window form ${form}, ground ${ground}, roof ${roof}${id === 'shopping_centre' ? ', use centre, storeys [2, 2], storey at least 4 m: a covered shopping centre, pale panels and a long glazed shopfront under a canopy' : ''}`).join('\n')}\nWrite one style per slot, in slot order.${notes}`,
        fits: (e, i) => {
          const s = part[i];
          if (!s) return ['more entries than slots'];
          const [id, district, finish, form, ground, roof] = s, q = e as unknown as BuildingStyle;
          const others = (existsSync('src/data/buildingstyles.json') ? JSON.parse(readFileSync('src/data/buildingstyles.json', 'utf8')) as BuildingStyle[] : []).filter((o) => o.id !== q.id && !replaceIds.has(o.id));
          const clash = Array.isArray(q.walls) ? buildingSetErrors([...others, q]).filter((m) => m.includes(`${q.id} `)) : [];
          if (clash.length) return clash;
          return q.id === id && q.district === district && q.finish === finish && q.window?.form === form && q.ground?.kind === ground && q.roof?.kind === roof ? [] : [`entry ${i + 1} must keep slot ${id}: district ${district}, finish ${finish}, window form ${form}, ground ${ground}, roof ${roof}`];
        },
      }));
    },
  },
  people: {
    file: 'src/data/people.json', prompt: 'prompts/people.txt', errors: personErrors as Kind['errors'], key: 'id',
    checker: 'These are the colours of ordinary adults in a British town, one flat colour per body part. Flag a look with an implausible outfit, hair that is not a natural colour, or one that looks too like another in the list.',
    batches: () => {
      const slots = PERSON_SLOTS.map(([tone, older], i) => ({ id: `person_${i + 1}`, tone, older, style: HAIR_STYLES[i % HAIR_STYLES.length] })).filter((s) => replace.has(s.id) || !existing('src/data/people.json').has(s.id));
      return Array.from({ length: Math.ceil(slots.length / 6) }, (_, b) => slots.slice(b * 6, b * 6 + 6)).map((part) => ({
        ask: `Slots:\n${part.map((s, n) => `${n + 1}. id ${s.id}: ${s.tone} skin (lightness ${SKIN_TONES[s.tone].join('-')}), hairStyle ${s.style}, ${s.older ? 'an older person with grey or white hair' : 'natural hair colour, not grey'}`).join('\n')}`,
        fits: (e: Entry, i: number) => {
          const s = part[i], q = e as unknown as PersonLook;
          if (!s) return ['more entries than slots'];
          if (q.id !== s.id || q.hairStyle !== s.style) return [`entry ${i + 1} must keep id ${s.id} and hairStyle ${s.style}`];
          return [...(skinTone(q.skin) === s.tone ? [] : [`${s.id}: skin must be ${s.tone}, lightness ${SKIN_TONES[s.tone].join('-')}`]), ...(greyHaired(q.hair) === s.older ? [] : [`${s.id}: hair must ${s.older ? 'be grey or white: s at most 0.12, l 0.45-0.85' : 'not be grey'}`])];
        },
      }));
    },
  },
  furniture: {
    file: 'src/data/furniture.json', prompt: 'prompts/furniture.txt', errors: furnitureErrors as Kind['errors'], key: 'id',
    checker: 'These are low-poly British street furniture, as JSON parts in metres: x along the kerb, z towards the road, y the base of each part. Picture each one from a passing car. Flag one that would not read as what it is, whose parts overlap oddly or leave gaps, or whose colours look wrong for the real thing.',
    batches: () => FURNITURE_IDS.filter((id) => replace.has(id) || !existing('src/data/furniture.json').has(id)).map((id) => {
      const r = FURNITURE_RULES[id];
      return {
        ask: `Slots:\nid ${id}: ${FURNITURE_LOOK[id]}\nOverall ${r.w.join('-')} m wide along x, ${r.l.join('-')} m deep along z, ${r.top.join('-')} m tall, in ${r.parts.join('-')} parts.\nWrite one entry.`,
        fits: (e: Entry) => (e.id !== id ? [`the entry must have id ${id}`] : []),
      };
    }),
  },
  towncars: {
    file: 'src/data/towncars.json', prompt: 'prompts/towncars.txt', errors: townCarErrors as Kind['errors'], key: 'id',
    checker: 'These are side outlines of everyday town cars, as JSON, in metres. Picture each one. Flag a car that would not read as its kind (saloon, hatchback, estate, MPV, city car, SUV, panel van, supermini, crossover, coupe, pickup, black cab), whose proportions look wrong for a real car, or that looks too like another in the list.',
    batches: () => [['saloon', 'family saloon'], ['hatchback', 'family hatchback'], ['estate', 'estate car'], ['mpv', 'people carrier'], ['city_car', 'small city car'], ['suv', 'compact SUV'], ['panel_van', 'small panel van'], ['supermini', 'supermini like a Vauxhall Corsa'], ['crossover', 'crossover like a Nissan Qashqai'], ['coupe', 'two-door coupe'], ['pickup_truck', 'double-cab pickup with an open load bed'], ['black_cab', 'British black cab taxi']].filter(([id]) => replace.has(id) || !existing('src/data/towncars.json').has(id)).map(([id, kind]) => ({
      ask: `Slots:\nid ${id}: a ${kind}\n${CAR_FACTS[id] ?? ''}Write one entry.${carNotes[id] ? `\n\nA reviewer looked at the last one rendered and said:\n${carNotes[id]}\nFix what's fair, within the limits.` : ''}`,
      fits: (e: Entry) => (e.id !== id ? [`the entry must have id ${id}`] : townCarErrors(e).length ? [] : townCarKindErrors(id, e as unknown as TownCar)),
    })),
  },
  fleet: {
    file: 'src/data/fleet.json', prompt: 'prompts/fleet.txt', errors: fleetErrors as Kind['errors'], key: 'id',
    checker: 'These are side elevations of British buses and emergency vehicles, as JSON, in metres. Picture each one. Flag a vehicle that would not read as what it is, whose windows fall outside its outline or overlap each other, whose wheels look wrong, or whose proportions look wrong for the real thing.',
    batches: () => ([['bus_single', 'a single-deck town bus'], ['bus_double', 'a double-deck town bus'], ['police_car', 'a police estate car'], ['police_van', 'a police van'], ['ambulance', 'a box-bodied emergency ambulance'], ['fire_engine', 'a fire engine (rescue pump)'], ['recovery_truck', 'a 7.5 tonne slide-bed recovery truck: a day cab, then a long low flat bed'], ['patrol_van', 'a roadside breakdown patrol van, a medium panel van like a Transit Custom: short sloping bonnet, cab glass, then a windowless load area'], ['rrv', 'an ambulance rapid response car: a family estate car with a bonnet, like the police estate']] as const).filter(([id]) => replace.has(id) || !existing('src/data/fleet.json').has(id)).map(([id, kind]) => ({
      ask: `Slots:\nid ${id}: ${kind}. It must be ${FLEET_RULES[id].length.join('-')} m long, half-width ${FLEET_RULES[id].half.join('-')} m, top ${FLEET_RULES[id].top.join('-')} m.\nWrite one entry.${carNotes[id] ? `\n\nA reviewer looked at the last one rendered and said:\n${carNotes[id]}\nFix what's fair, within the limits.` : ''}`,
      fits: (e: Entry) => (e.id !== id ? [`the entry must have id ${id}`] : []),
    })),
  },
  services: {
    file: 'src/data/services.json', prompt: 'prompts/services.txt', errors: serviceErrors as Kind['errors'], key: 'id',
    checker: 'These are low-poly British emergency service stations, as JSON parts in metres. Picture each one from the street. Flag a building that would not read as its service, whose parts float or leave gaps, whose doors would be hidden behind a part, or whose colours clash.',
    batches: () => (['fire', 'ambulance', 'police'] as const).map((id) => ({
      ask: `Slots:\nid ${id}: the town's ${id} station. Footprint ${SERVICE_RULES[id].hx * 2} m along the street by ${SERVICE_RULES[id].hz * 2} m deep, so x within ${SERVICE_RULES[id].hx} and z within ${SERVICE_RULES[id].hz} of the centre, and at most ${SERVICE_RULES[id].top} m tall. It has ${SERVICE_RULES[id].doors.join(' to ')} doors, each ${SERVICE_RULES[id].bay.join('-')} m wide.\nWrite one entry.`,
      fits: (e: Entry) => (e.id !== id ? [`the entry must have id ${id}`] : []),
    })),
  },
  roadlines: {
    file: 'src/data/roadlines.json', prompt: 'prompts/roadlines.txt', errors: roadLineErrors as Kind['errors'], key: 'id',
    checker: 'These are short on-screen lines for a friendly family driving game. Flag any that sound harsh, scary, mention injury, sound American, or do not fit their moment.',
    batches: () => ROAD_MOMENTS.filter((moment) => !(existsSync('src/data/roadlines.json') && (JSON.parse(readFileSync('src/data/roadlines.json', 'utf8')) as RoadLine[]).some((l) => l.moment === moment))).map((moment) => ({
      ask: `Write 3 different lines for the moment ${moment}. Start each id with ${moment}_.`,
      fits: (e: Entry) => ((e as unknown as RoadLine).moment !== moment ? [`every entry must have moment ${moment}`] : []),
    })),
  },
  // The shops: one per place that can be a shop, café or market stall, then the shopping centre's units.
  shops: {
    file: 'src/data/shops.json', prompt: 'prompts/shops.txt', key: 'id',
    errors: ((e: Shop) => shopErrors(e, PLACES.find((p) => p.id === e?.id))) as Kind['errors'],
    checker: 'These are the stock lists of shops in a British town, as JSON. Flag a good that a shop of that name would not sell, a price or calorie count that is wrong for the real item, a clothes colour that looks odd for the garment, or two goods that are the same thing under different names.',
    batches: () => {
      const have = existing('src/data/shops.json'), catalogueIds = new Set(existing('src/data/catalogue.json'));
      const noClash = (e: Entry) => ((e as unknown as Shop).stock ?? []).filter((g) => catalogueIds.has(g?.id)).map((g) => `${g.id}: that id belongs to the car catalogue, choose another`);
      const slots = PLACES.filter((p) => PLACE_SHOPS[p.kind] && (replace.has(p.id) || !have.has(p.id)));
      const street = Array.from({ length: Math.ceil(slots.length / 3) }, (_, b) => slots.slice(b * 3, b * 3 + 3)).map((part): Batch => ({
        ask: `Slots:\n${part.map((p, n) => `${n + 1}. id ${p.id}, name ${p.name}, a ${p.kind}: sells one of ${PLACE_SHOPS[p.kind].join(', ')}`).join('\n')}\nThe town needs at least one motor shop, one bakery and one clothes shop among its shops, so pick those where a name fits.`,
        fits: (e, i) => (e.id === part[i]?.id ? noClash(e) : [`entry ${i + 1} must be id ${part[i]?.id ?? '(none: too many entries)'}`]),
      }));
      const centre = [...have].some((id) => id.startsWith('centre_')) && !replace.size ? [] : [0, 1].map((b): Batch => ({
        ask: `Write 4 shopping centre units, each with "centre": true and an id starting centre_. ${b === 0 ? 'Two clothes shops (one for everyday basics, one for shoes and outdoor wear), a café and a bakery.' : 'A clothes shop for hats, gloves and sunglasses, a sandwich bar (sells cafe), a sweet and snack shop (sells grocer), and a juice and fruit bar (sells grocer).'}`,
        fits: (e) => (String(e.id).startsWith('centre_') && e.centre === true ? noClash(e) : [`${String(e.id)}: a centre unit's id starts centre_ and it has "centre": true`]),
      }));
      return [...street, ...centre];
    },
  },
  voice: {
    file: 'src/data/voice.json', prompt: 'prompts/voice.txt', errors: voiceErrors as Kind['errors'], key: 'key',
    batches: () => { // only the keys with no line yet, or named to redo
      const have = new Set(existsSync('src/data/voice.json') ? (JSON.parse(readFileSync('src/data/voice.json', 'utf8')) as { key: string }[]).map((v) => v.key) : []);
      const open = VOICE_KEYS.filter((k) => replace.has(k) || !have.has(k));
      return open.length ? [{ ask: `Write one line for each key: ${open.join(', ')}.` }] : [];
    },
  },
};

const args = process.argv.slice(2);
const rep = args.indexOf('--replace');
const replace = new Set(rep >= 0 ? args[rep + 1].split(',') : []);
const kinds = args.filter((a, i) => !a.startsWith('--') && (rep < 0 || i !== rep + 1));
mkdirSync('.qwen-runs', { recursive: true });

for (const name of kinds) {
  const k = KINDS[name];
  const shipped = (existsSync(k.file) ? JSON.parse(readFileSync(k.file, 'utf8')) : []) as Entry[];
  const out = new Map(shipped.map((e) => [String(e[k.key]), e]));
  const log: unknown[] = [];
  // --repair: only the shipped entries the rules now fail go back, each with its problems, to be rewritten under the same id.
  const broken = args.includes('--repair') ? shipped.filter((e) => k.errors(e as never).length) : [];
  for (const e of broken) replace.add(String(e[k.key]));
  const batches: Batch[] = args.includes('--repair')
    ? (broken.length ? [{ ask: `Rewrite each of these entries to fix its problems. Keep every id and everything else about it the same.\n${broken.map((e) => `${JSON.stringify(e)}\nProblems: ${k.errors(e as never).join('; ')}`).join('\n\n')}`, fits: (e: Entry) => (replace.has(String(e[k.key])) ? [] : [`${String(e[k.key])}: rewrite only the entries given, keeping their ids`]) }] : [])
    : k.batches();
  if (args.includes('--repair')) console.log(`${name}: ${broken.length} to repair`);
  await Promise.all(batches.map(async (batch) => { // every batch at once: llm.ts holds them to the server's slots
    let msgs: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: readFileSync(k.prompt, 'utf8') },
      { role: 'user', content: batch.ask },
    ];
    for (let tryNo = 1; tryNo <= 4; tryNo++) { // three to satisfy the validator, and one more for the checker's notes
      const raw = await chat(msgs, { temperature: 0.8 });
      const list = (parseJson(raw) ?? []) as Entry[];
      const taken = new Set<string>(), errs: string[] = [], good: Entry[] = [];
      list.forEach((e, i) => {
        const id = String(e?.[k.key]);
        const es = [...k.errors(e as never), ...(batch.fits?.(e, i) ?? [])];
        if (taken.has(id) || (out.has(id) && !replace.has(id))) es.push(`${id}: id already used, choose another`);
        if (es.length) errs.push(...es); else { good.push(e); taken.add(id); }
      });
      if (!list.length) errs.push('no JSON array in the reply');
      // The worker's draft passed the validator: now the checker reads it cold, for what rules can't catch, in a slot of
      // its own. Its notes get repaired like any error, but it can't block the merge on the last try: the validator
      // decides what's valid, the checker only pushes for better.
      if (!errs.length && k.checker && tryNo < 4) {
        const notes = parseJson(await chat([{ role: 'system', content: `You check another writer's work and did not write it. ${k.checker} Answer with ONLY a JSON array of short, specific problems, naming the id of each entry; an empty array if the work is good. Do not invent problems: most drafts have few or none.` }, { role: 'user', content: JSON.stringify(good) }], { temperature: 0.1 }));
        const found = (Array.isArray(notes) ? notes : []).filter((n): n is string => typeof n === 'string').slice(0, 6);
        if (found.length) { errs.push(...found); console.log(`${name} checker: ${found.join(' | ')}`); }
      }
      log.push({ batch: batch.ask, tryNo, raw, errs });
      console.log(`${name} try ${tryNo}: ${good.length}/${list.length} pass${errs.length ? `; ${errs.slice(0, 3).join(' | ')}` : ''}`);
      if (!errs.length || tryNo === 4) {
        for (const e of good) out.set(String(e[k.key]), e);
        if (errs.length) console.error(`${name}: merged only the ${good.length} that passed`);
        break;
      }
      msgs = [...msgs, { role: 'assistant', content: raw }, { role: 'user', content: `Fix these and answer the whole JSON array again:\n${errs.join('\n')}` }];
    }
    writeFileSync(k.file, `${JSON.stringify([...out.values()], null, 2)}\n`);
  }));
  writeFileSync(`.qwen-runs/${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(log, null, 2));
  console.log(`${name}: ${out.size} entries in ${k.file}`);
}
