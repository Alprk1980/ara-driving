import { describe, expect, it } from 'vitest';
import { SCALES, type RadioLine, type RadioTopic, type Station } from '../../schemas/content.ts';
import { RadioHost } from './radio.ts';
import { noteHz } from './sound.ts';

const line = (topic: RadioTopic, n: number): RadioLine => ({ id: `${topic}_${n}`, topic, text: `${topic} ${n}.` });
const lines = [line('chat', 1), line('chat', 2), line('ad', 1), line('weather', 1), line('rain', 1), line('night', 1), line('job_done', 1), line('job_done', 2)];

describe('radio host', () => {
  it('stays quiet at first, then speaks on a slow clock', () => {
    const r = new RadioHost(lines, () => 0.5);
    expect(r.tick(1, { night: false, rain: false })).toBeNull();
    expect(r.tick(30, { night: false, rain: false })).not.toBeNull();
    expect(r.tick(10, { night: false, rain: false })).toBeNull();
  });
  it('talks about the rain when it is raining', () => {
    expect(new RadioHost(lines, () => 0.1).tick(99, { night: false, rain: true })).toBe('rain 1.');
  });
  it('does not pile reactions on top of each other, then speaks again', () => {
    const r = new RadioHost(lines, () => 0);
    expect(r.react('job_done')).not.toBeNull();
    expect(r.react('job_done')).toBeNull();
    r.tick(30, { night: false, rain: false });
    expect(r.react('job_done')).not.toBeNull();
  });
  it('does not repeat itself', () => {
    const r = new RadioHost(lines, () => 0);
    const a = r.react('job_done');
    r.tick(30, { night: false, rain: false });
    expect(r.react('job_done')).not.toBe(a);
  });
  it('stays silent about a topic with no lines', () => expect(new RadioHost([]).react('streak')).toBeNull());
});

describe('station notes', () => {
  const s = { root: 57, scale: 'minor' } as Station;
  it('reads scale degrees as notes, wrapping up an octave', () => {
    expect(noteHz(s, 0)).toBeCloseTo(220);
    expect(noteHz(s, SCALES.minor.length)).toBeCloseTo(440);
    expect(noteHz(s, 2)).toBeCloseTo(220 * 2 ** (3 / 12));
  });
});
