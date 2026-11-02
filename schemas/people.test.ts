import { describe, expect, it } from 'vitest';
import { greyHaired, HAIR_STYLES, peopleSetErrors, personErrors, skinTone, type PersonLook } from './people.ts';

const good: PersonLook = { id: 'someone', hairStyle: 'short', skin: '#e6b892', hair: '#3e2a1e', shirt: '#2b3a55', trousers: '#8a8f98', shoes: '#3a3433' };

describe('a person look', () => {
  it('passes when it could be someone in the street', () => expect(personErrors(good)).toEqual([]));
  it('turns down skin that no one has', () => expect(personErrors({ ...good, skin: '#55dd77' }).join()).toContain('skin'));
  it('turns down neon clothes', () => expect(personErrors({ ...good, shirt: '#ff00ff' }).join()).toContain('shirt'));
  it('turns down dyed-looking hair', () => expect(personErrors({ ...good, hair: '#3050e0' }).join()).toContain('hair'));
  it('lets older people have grey hair', () => expect(personErrors({ ...good, hair: '#8c8c88' })).toEqual([]));
  it('needs hair that shows against skin', () => expect(personErrors({ ...good, hair: good.skin }).join()).toContain('must read against'));
  it('needs a top that shows against trousers', () => expect(personErrors({ ...good, shirt: '#8a8f98', trousers: '#8a8f98' }).join()).toContain('must differ'));
  it('knows skin tones apart', () => { expect(skinTone('#eed6c4')).toBe('fair'); expect(skinTone('#4a2c1c')).toBe('deep'); });
  it('knows grey from brown', () => { expect(greyHaired('#b4b4b0')).toBe(true); expect(greyHaired('#6b4a2e')).toBe(false); });
});

describe('a set of looks', () => {
  const crowd = (n: number, each: (i: number) => Partial<PersonLook>) => Array.from({ length: n }, (_, i): PersonLook => ({ ...good, id: `p${i}`, hairStyle: HAIR_STYLES[i % 5], shirt: `#2b3a${(i + 16).toString(16).padStart(2, '0')}`, ...each(i) }));
  const mixed = crowd(24, (i) => ({ hair: i < 6 ? '#b4b4b0' : good.hair, skin: i >= 18 ? '#6e4630' : good.skin }));

  it('passes a town of real variety', () => expect(peopleSetErrors(mixed)).toEqual([]));
  it('needs enough people', () => expect(peopleSetErrors(mixed.slice(0, 20)).join()).toContain('at least 24'));
  it('needs older people', () => expect(peopleSetErrors(crowd(24, (i) => ({ skin: i >= 18 ? '#6e4630' : good.skin }))).join()).toContain('grey-haired'));
  it('needs a range of skin tones', () => expect(peopleSetErrors(crowd(24, (i) => ({ hair: i < 6 ? '#b4b4b0' : good.hair }))).join()).toContain('skin tones'));
  it('needs every hair style', () => expect(peopleSetErrors(mixed.map((l) => ({ ...l, hairStyle: 'short' as const }))).join()).toContain('no look uses'));
  it('has no twins', () => expect(peopleSetErrors([...mixed, { ...mixed[0], id: 'twin' }]).join()).toContain('duplicates'));
});
