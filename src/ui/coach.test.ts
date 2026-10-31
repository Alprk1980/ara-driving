import { describe, expect, it } from 'vitest';
import type { ChatterLine } from '../../schemas/content.ts';
import { Guide, Passengers } from './coach.ts';

describe('guide', () => {
  const lines = [{ key: 'take_job', text: 'Tap Jobs.' }, { key: 'fuel', text: 'Find a pump.' }] as const;
  it('shows a tip once, one at a time, then clears', () => {
    const shown: (string | null)[] = [], seen: string[] = [], g = new Guide([...lines], seen, (t) => shown.push(t));
    expect(g.fire('take_job')).toBe(true);
    expect(g.fire('take_job')).toBe(false);
    g.fire('fuel');
    g.tick(0.1);
    g.tick(1);
    expect(shown).toEqual(['Tap Jobs.']);
    g.tick(7);
    expect(shown).toEqual(['Tap Jobs.', 'Find a pump.']);
    g.tick(8);
    expect(shown.at(-1)).toBeNull();
    expect(seen).toEqual(['take_job', 'fuel']);
  });
  it('does not repeat a tip from an earlier session', () => {
    const shown: unknown[] = [], g = new Guide([...lines], ['fuel'], (t) => shown.push(t));
    expect(g.fire('fuel')).toBe(false);
  });
  it('stays quiet about a tip it has no line for', () => {
    expect(new Guide([], [], () => {}).fire('rank')).toBe(false);
  });
});

describe('passengers', () => {
  const line = (moment: ChatterLine['moment'], n: number): ChatterLine => ({ id: `${moment}${n}`, moment, text: `${moment} ${n}.` });
  const lines = [line('smooth', 1), line('smooth', 2), line('nervous', 1), line('bump', 1), line('bump', 2)];
  it('talks on a slow clock, by how the ride is going', () => {
    const p = new Passengers(lines, () => 0);
    expect(p.tick(5, 1)).toBeNull();
    expect(p.tick(20, 1)).toBe('smooth 1.');
    expect(p.tick(1, 1)).toBeNull();
    expect(p.tick(30, 0.2)).toBe('nervous 1.');
  });
  it('does not repeat itself', () => {
    const p = new Passengers(lines, () => 0);
    expect(p.say('bump')).not.toBe(p.say('bump'));
  });
  it('stays silent with no lines', () => expect(new Passengers([]).say('board')).toBeNull());
});
