import { describe, expect, it } from 'vitest';
import type { VoiceLine } from '../../schemas/content.ts';
import { cueKey, VoiceGuide, type VoiceBackend } from './voice.ts';

const lines: VoiceLine[] = [
  { key: 'left_ahead', text: 'Turn left ahead' }, { key: 'left_now', text: 'Turn left now' },
  { key: 'reached', text: 'Destination reached' }, { key: 'fuel_low', text: 'Fuel low' }, { key: 'fuel_critical', text: 'Fuel nearly gone' },
];

function rig() {
  let now = 0;
  const said: string[] = [], shown: string[] = [];
  let chimes = 0, finish: (() => void) | null = null;
  const backend: VoiceBackend = {
    ready: true, speaking: false, unlock() {},
    speak(text, done) { said.push(text); this.speaking = true; finish = () => { this.speaking = false; done(); }; },
    cancel() { this.speaking = false; finish = null; },
  };
  const voice = new VoiceGuide(lines, backend, (t) => shown.push(t), () => chimes++, () => now);
  return { voice, backend, said, shown, end: () => finish?.(), tick: (ms: number) => { now += ms; }, chimes: () => chimes };
}

describe('radio chatter', () => {
  it('speaks only into silence and gives way to a direction', () => {
    const said: string[] = [];
    const backend = { ready: true, speaking: false, unlock() {}, speak(t: string) { said.push(t); this.speaking = true; }, cancel() { said.push('cut'); this.speaking = false; } };
    const v = new VoiceGuide([{ key: 'left_now', text: 'Turn left now' }], backend, () => {}, () => {}, () => 0);
    expect(v.chatter('Lovely day.')).toBe(true);
    expect(v.chatter('Another thing.')).toBe(false);
    v.say('left_now');
    expect(said).toEqual(['Lovely day.', 'cut', 'Turn left now']);
  });
});

describe('voice guide', () => {
  it('plays one line at a time, most urgent first', () => {
    const r = rig();
    r.voice.say('left_ahead');
    r.voice.say('fuel_low');
    r.voice.say('reached');
    expect(r.said).toEqual(['Turn left ahead', 'Destination reached']); // the urgent line cut in
    r.end();
    expect(r.said).toEqual(['Turn left ahead', 'Destination reached', 'Fuel low']);
  });
  it('drops a line that has gone stale', () => {
    const r = rig();
    r.voice.say('fuel_critical');
    r.voice.say('left_ahead');
    r.tick(2500);
    r.end();
    expect(r.said).toEqual(['Fuel nearly gone']);
  });
  it('shows text and chimes when muted', () => {
    const r = rig();
    r.voice.muted = true;
    r.voice.say('left_now');
    expect(r.said).toEqual([]);
    expect(r.shown).toEqual(['Turn left now']);
    expect(r.chimes()).toBe(1);
  });
  it('still shows the line when speech is missing', () => {
    const r = rig();
    r.backend.ready = false;
    r.voice.say('reached');
    expect(r.shown).toEqual(['Destination reached']);
  });
  it('maps route cues to phrase keys', () => {
    const m = { id: 'm1', kind: 'left' as const, at: 10 };
    expect(cueKey({ key: 'x', manoeuvre: m, stage: 'ahead' })).toBe('left_ahead');
    expect(cueKey({ key: 'x', manoeuvre: { ...m, id: 'end', kind: 'arrive' }, stage: 'reached' })).toBe('reached');
  });
});
