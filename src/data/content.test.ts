// Shipped content stays valid: the same rules the generator enforced.
import { describe, expect, it } from 'vitest';
import { carJobErrors, catalogueErrors, CHATTER_MOMENTS, chatterErrors, eventErrors, EVENT_KINDS, GOAL_KINDS, goalErrors, GUIDE_KEYS, guideErrors, RANK_COUNT, rankErrors, storyPlaceErrors, CAR_JOB_TYPES, findErrors, landmarkErrors, PLACE_KINDS, placeErrors, questTextErrors, RADIO_TOPICS, radioErrors, regularErrors, skyErrors, SKY_SLOTS, stationErrors, TWISTS, uniqueIds, VOICE_KEYS, voiceErrors, type CatalogueItem, type ChatterLine, type Goal, type GuideLine, type Rank, type StoryPlace, type TownEventCard, type Find, type Landmark, type Place, type QuestText, type RadioLine, type Regular, type Sky, type Station, type VoiceLine } from '../../schemas/content.ts';
import { landmarkFor } from '../sim/quests.ts';
import { Town } from '../sim/town.ts';
import catalogue from './catalogue.json';
import chatter from './chatter.json';
import events from './events.json';
import finds from './finds.json';
import goals from './goals.json';
import guide from './guide.json';
import landmarks from './landmarks.json';
import places from './places.json';
import quests from './quests.json';
import radio from './radio.json';
import ranks from './ranks.json';
import stories from './stories.json';
import regulars from './regulars.json';
import skies from './skies.json';
import stations from './stations.json';
import voice from './voice.json';

describe('shipped content', () => {
  it('places', () => {
    expect((places as Place[]).flatMap(placeErrors)).toEqual([]);
    expect(uniqueIds(places)).toEqual([]);
  });
  it('quest text covers each type', () => {
    expect((quests as QuestText[]).flatMap(questTextErrors)).toEqual([]);
    expect(uniqueIds(quests)).toEqual([]);
    for (const t of ['delivery', 'passenger', 'trial']) expect(quests.filter((q) => q.type === t).length).toBeGreaterThan(8);
  });
  it('catalogue', () => {
    expect((catalogue as CatalogueItem[]).flatMap(catalogueErrors)).toEqual([]);
    expect(uniqueIds(catalogue)).toEqual([]);
  });
  it('every twist has cards', () => {
    for (const t of TWISTS) expect((quests as QuestText[]).filter((q) => q.twist === t).length, t).toBeGreaterThanOrEqual(4);
  });
  it('regulars', () => {
    expect((regulars as Regular[]).flatMap(regularErrors)).toEqual([]);
    expect(uniqueIds(regulars)).toEqual([]);
    expect(regulars.length).toBeGreaterThanOrEqual(5);
  });
  it('landmarks cover every place kind', () => {
    expect((landmarks as Landmark[]).flatMap(landmarkErrors)).toEqual([]);
    expect(uniqueIds(landmarks)).toEqual([]);
    for (const k of PLACE_KINDS) expect(landmarks.filter((l) => l.kind === k).length, k).toBeGreaterThanOrEqual(1);
  });
  it('finds sit on real spots and their clues lead to them', () => {
    const town = new Town();
    expect((finds as Find[]).flatMap(findErrors)).toEqual([]);
    expect(uniqueIds(finds)).toEqual([]);
    expect(finds.length).toBeGreaterThanOrEqual(30);
    expect(new Set(finds.map((f) => f.spot)).size).toBe(finds.length);
    for (const f of finds) {
      const { name, way } = landmarkFor(town, places as Place[], town.spots[f.spot]);
      expect(f.clue, f.id).toContain(name);
      expect(f.clue.toLowerCase(), f.id).toContain(way);
    }
  });
  it('skies cover the day', () => {
    expect((skies as Sky[]).flatMap(skyErrors)).toEqual([]);
    expect(skies.map((s) => s.id).sort()).toEqual(SKY_SLOTS.map((s) => s.id).sort());
  });
  it('radio covers every topic', () => {
    expect((radio as RadioLine[]).flatMap(radioErrors)).toEqual([]);
    expect(uniqueIds(radio)).toEqual([]);
    for (const t of RADIO_TOPICS) expect(radio.filter((r) => r.topic === t).length, t).toBeGreaterThanOrEqual(3);
  });
  it('stations', () => {
    expect((stations as Station[]).flatMap(stationErrors)).toEqual([]);
    expect(uniqueIds(stations)).toEqual([]);
    expect(stations.length).toBeGreaterThanOrEqual(3);
  });
  it('every car with work has cards', () => {
    const cards = (quests as QuestText[]).filter((q) => q.car);
    expect(cards.flatMap(carJobErrors)).toEqual([]);
    for (const car of Object.keys(CAR_JOB_TYPES)) expect(cards.filter((q) => q.car === car).length, car).toBeGreaterThanOrEqual(3);
  });
  it('passengers have something to say at every moment', () => {
    expect((chatter as ChatterLine[]).flatMap(chatterErrors)).toEqual([]);
    expect(uniqueIds(chatter)).toEqual([]);
    for (const m of CHATTER_MOMENTS) expect(chatter.filter((c) => c.moment === m).length, m).toBeGreaterThanOrEqual(3);
  });
  it('the guide has every tip', () => {
    expect((guide as GuideLine[]).flatMap(guideErrors)).toEqual([]);
    expect(guide.map((g) => g.key).sort()).toEqual([...GUIDE_KEYS].sort());
  });
  it('goals cover every kind', () => {
    expect((goals as Goal[]).flatMap(goalErrors)).toEqual([]);
    expect(uniqueIds(goals)).toEqual([]);
    for (const k of Object.keys(GOAL_KINDS)) expect(goals.filter((g) => g.kind === k).length, k).toBeGreaterThanOrEqual(2);
  });
  it('every rank has a name', () => {
    expect((ranks as Rank[]).flatMap(rankErrors)).toEqual([]);
    expect(ranks.map((r) => r.level)).toEqual(Array.from({ length: RANK_COUNT }, (_, i) => i));
  });
  it('every regular leaves a building behind', () => {
    expect((stories as StoryPlace[]).flatMap(storyPlaceErrors)).toEqual([]);
    expect(stories.map((s) => s.id).sort()).toEqual(regulars.map((r) => r.id).sort());
  });
  it('events cover every kind', () => {
    expect((events as TownEventCard[]).flatMap(eventErrors)).toEqual([]);
    expect(uniqueIds(events)).toEqual([]);
    for (const k of EVENT_KINDS) expect(events.filter((e) => e.kind === k).length, k).toBeGreaterThanOrEqual(3);
  });
  it('voice has every key', () => {
    expect((voice as VoiceLine[]).flatMap(voiceErrors)).toEqual([]);
    expect(voice.map((v) => v.key).sort()).toEqual([...VOICE_KEYS].sort());
  });
});
