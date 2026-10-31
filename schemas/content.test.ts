import { describe, expect, it } from 'vitest';
import { carJobErrors, catalogueErrors, chatterErrors, eventErrors, findErrors, goalErrors, guideErrors, landmarkErrors, placeErrors, questTextErrors, radioErrors, rankErrors, regularErrors, skyErrors, stationErrors, uniqueIds, voiceErrors, type CatalogueItem, type ChatterLine, type Find, type Goal, type Landmark, type Part, type QuestText, type RadioLine, type Regular, type Sky, type Station, type TownEventCard } from './content.ts';

describe('content validators', () => {
  it('accepts a good entry of each kind', () => {
    expect(placeErrors({ id: 'corner_bakery', name: 'Corner Bakery', kind: 'shop' })).toEqual([]);
    expect(questTextErrors({ id: 'q', type: 'delivery', title: 'Fresh bread', text: 'Rush this loaf to {dropoff}.' })).toEqual([]);
    expect(catalogueErrors({ id: 'red', kind: 'paint', style: 'solid', tier: 'common', name: 'Tomato', price: 50, colors: ['#dd2211'] })).toEqual([]);
    expect(voiceErrors({ key: 'left_ahead', text: 'Turn left ahead' })).toEqual([]);
  });
  it('rejects prices and bad slots in quest text', () => {
    const q: QuestText = { id: 'q', type: 'delivery', title: 'T', text: 'Earn 50 points at {dropoff}.' };
    expect(questTextErrors(q).join()).toContain('no numbers');
    expect(questTextErrors({ ...q, text: 'Go to {town}.' }).join()).toContain('{dropoff}');
    expect(questTextErrors({ ...q, text: `${'long '.repeat(10)}{dropoff}.` }).join()).toContain('limit is 60');
  });
  it('holds catalogue prices to the tier', () => {
    const c: CatalogueItem = { id: 'x', kind: 'pattern', style: 'flames', tier: 'epic', name: 'Hot', price: 399, colors: ['#111111', '#ff0000'] };
    expect(catalogueErrors(c).join()).toContain('price must be 400');
    expect(catalogueErrors({ ...c, price: 400, tier: 'rare' }).join()).toContain('tier epic');
    expect(catalogueErrors({ ...c, price: 400, colors: ['#111111'] }).join()).toContain('colors');
    expect(catalogueErrors({ ...c, style: 'spots' }).join()).toContain('not allowed');
    expect(catalogueErrors({ ...c, kind: 'decal', style: 'small', tier: 'common', price: 50, colors: ['#111111'] }).join()).toContain('shape');
  });
  it('holds voice lines to their meaning and length', () => {
    expect(voiceErrors({ key: 'left_now', text: 'Turn right now' }).join()).toContain('must say');
    expect(voiceErrors({ key: 'reached', text: 'You have now reached your destination safely' }).join()).toContain('1-6 words');
  });
  it('finds duplicate ids', () => expect(uniqueIds([{ id: 'a' }, { id: 'a' }])).toEqual(['a: used twice']));
  it('holds a twist to its job type and makes the card say so', () => {
    const q: QuestText = { id: 'q', type: 'delivery', title: 'Ice cream run', text: 'Rush this ice cream to {dropoff}.', twist: 'melting' };
    expect(questTextErrors(q)).toEqual([]);
    expect(questTextErrors({ ...q, twist: 'sleeping' }).join()).toContain('twist must be one of');
    expect(questTextErrors({ ...q, title: 'Box run', text: 'Take this box to {dropoff}.' }).join()).toContain('must say so');
  });
  it('holds a regular to an arc of real jobs', () => {
    const job = (type: QuestText['type'], title: string) => ({ type, title, text: 'Take this to {dropoff}.', thanks: 'Lovely, thank you!' });
    const r: Regular = { id: 'mira', name: 'Mira', role: 'Baker', jobs: [job('delivery', 'One'), job('passenger', 'Two'), job('delivery', 'Three')] };
    expect(regularErrors(r)).toEqual([]);
    expect(regularErrors({ ...r, jobs: r.jobs.slice(0, 2) }).join()).toContain('3-5 jobs');
    expect(regularErrors({ ...r, jobs: r.jobs.map((j) => ({ ...j, type: 'delivery' as const })) }).join()).toContain('two job types');
    expect(regularErrors({ ...r, jobs: r.jobs.map((j, i) => ({ ...j, title: i ? 'Same' : 'Same' })) }).join()).toContain('own title');
    expect(regularErrors({ ...r, jobs: [{ ...job('delivery', 'One'), thanks: 'Here are 50 points.' }, ...r.jobs.slice(1)] }).join()).toContain('thanks needs');
  });
  it('holds a find to a prop and a short clue', () => {
    const f: Find = { id: 'gnome_one', name: 'Lost Gnome', clue: 'Look behind the bakery.', prop: 'gnome', spot: 3 };
    expect(findErrors(f)).toEqual([]);
    expect(findErrors({ ...f, prop: 'piano' as Find['prop'] }).join()).toContain('prop must be');
    expect(findErrors({ ...f, clue: 'Worth 50 points.' }).join()).toContain('no numbers');
  });
  it('holds a landmark to its footprint and keeps it grounded', () => {
    const body: Part = { shape: 'box', x: 0, y: 0, z: 0, w: 8, h: 4, l: 8, color: '#aa3322' };
    const roof: Part = { ...body, shape: 'cone', y: 4, h: 3, color: '#223344' };
    const door: Part = { ...body, w: 2, h: 2, l: 0.4, z: 4, color: '#112233' };
    const m: Landmark = { id: 'bakery', kind: 'shop', parts: [body, roof, door, { ...door, x: 2 }, { ...door, x: -2 }, { ...roof, y: 7, w: 2, l: 2 }] };
    expect(landmarkErrors(m)).toEqual([]);
    expect(landmarkErrors({ ...m, parts: [...m.parts, { ...body, x: 6, w: 4 }] }).join()).toContain('footprint');
    expect(landmarkErrors({ ...m, parts: [...m.parts, { ...roof, y: 15, h: 1 }] }).join()).toContain('floats');
    expect(landmarkErrors({ ...m, parts: m.parts.slice(0, 3) }).join()).toContain('6-16 parts');
    expect(landmarkErrors({ ...m, parts: m.parts.map((p) => ({ ...p, color: '#aa3322' })) }).join()).toContain('3 colours');
  });
  it('keeps every sky readable', () => {
    const s: Sky = { id: 'night', at: 0.92, sky: '#10203a', fog: '#10203a', sun: '#8899cc', sunPower: 0.2, ambient: 0.6, tint: '#585868', night: 1 };
    expect(skyErrors(s)).toEqual([]);
    expect(skyErrors({ ...s, tint: '#101010' }).join()).toContain('road stays readable');
    expect(skyErrors({ ...s, fog: '#eeeeee' }).join()).toContain('hard line');
    expect(skyErrors({ ...s, night: 0 }).join()).toContain('night must be');
  });
  it('holds radio lines to speech and topic', () => {
    const r: RadioLine = { id: 'r', topic: 'fuel_low', text: 'Keep an eye on that tank, friends.' };
    expect(radioErrors(r)).toEqual([]);
    expect(radioErrors({ ...r, text: 'Lovely day out there.' }).join()).toContain('must say');
    expect(radioErrors({ ...r, topic: 'ad', text: 'Only 50 points today!' }).join()).toContain('no slots');
  });
  it('ties a car job to its car and job type', () => {
    const q: QuestText = { id: 'q', type: 'delivery', car: 'pickup', title: 'Piano move', text: 'Haul this piano to {dropoff}.' };
    expect(carJobErrors(q)).toEqual([]);
    expect(carJobErrors({ ...q, car: 'taxi' }).join()).toContain('must have type passenger');
    expect(carJobErrors({ ...q, car: undefined }).join()).toContain('car must be');
    expect(carJobErrors({ ...q, twist: 'fragile', text: 'Gently take this to {dropoff}.' }).join()).toContain('no twist');
  });
  it('holds passenger chatter to short speech', () => {
    const c: ChatterLine = { id: 'c', moment: 'bump', text: 'Ooh, my hat!' };
    expect(chatterErrors(c)).toEqual([]);
    expect(chatterErrors({ ...c, moment: 'nap' as ChatterLine['moment'] }).join()).toContain('moment must be');
    expect(chatterErrors({ ...c, text: 'one two three four five six seven eight nine ten eleven twelve thirteen.' }).join()).toContain('1-12 words');
  });
  it('makes each guide line teach its own thing', () => {
    expect(guideErrors({ key: 'garage', text: 'Spend your Points in the garage at home.' })).toEqual([]);
    expect(guideErrors({ key: 'garage', text: 'Spend your Points at home.' }).join()).toContain('must say');
    expect(guideErrors({ key: 'fuel', text: 'Visit a station in 3 minutes.' }).join()).toContain('no digits');
  });
  it('holds a goal to a fair target', () => {
    const g: Goal = { id: 'g', kind: 'km', target: 5, text: 'Cover some ground today' };
    expect(goalErrors(g)).toEqual([]);
    expect(goalErrors({ ...g, target: 99 }).join()).toContain('target for km');
    expect(goalErrors({ ...g, text: 'Drive 5 km' }).join()).toContain('no digits');
  });
  it('holds rank names to the badge', () => {
    expect(rankErrors({ level: 2, name: 'Trusted Driver', blurb: 'People wave now.' })).toEqual([]);
    expect(rankErrors({ level: 9, name: 'Trusted Driver', blurb: 'People wave now.' }).join()).toContain('level');
  });
  it('holds a town event to its kind', () => {
    const e: TownEventCard = { id: 'e', kind: 'market', title: 'Cake fair', text: 'The cake fair is on, and every cafe wants a delivery!', boost: 'cafe' };
    expect(eventErrors(e)).toEqual([]);
    expect(eventErrors({ ...e, boost: undefined }).join()).toContain('boost');
    expect(eventErrors({ ...e, kind: 'roadworks', text: 'Mind the diggers on the high road.' }).join()).toContain('banned elsewhere');
    expect(eventErrors({ ...e, kind: 'parade', boost: undefined, text: 'Lovely day.' }).join()).toContain('must say');
  });
  it('holds a station to a playable loop', () => {
    const s: Station = { id: 's', name: 'Town FM', tagline: 'Songs for the school run', bpm: 100, root: 52, scale: 'minor', wave: 'triangle', bass: [0, -1, 0, -1, 4, -1, 4, -1, 3, -1, 3, -1, 4, -1, 2, -1], lead: Array.from({ length: 32 }, (_, i) => (i % 3 ? -1 : i % 7)) };
    expect(stationErrors(s)).toEqual([]);
    expect(stationErrors({ ...s, bass: [0, 1] }).join()).toContain('16 steps');
    expect(stationErrors({ ...s, lead: s.lead.map(() => 99) }).join()).toContain('whole numbers');
    expect(stationErrors({ ...s, bpm: 300 }).join()).toContain('bpm');
  });
});
