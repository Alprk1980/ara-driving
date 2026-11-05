import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import chatter from '../data/chatter.json';
import events from '../data/events.json';
import radio from '../data/radio.json';
import voice from '../data/voice.json';
import { CHOOSABLE, syllables, clipErrors, clipKey, clipPath, DEFAULT_VOICES, RIDER_VOICES, spokenLines, type ClipIndex } from './clips.ts';
import { ClipBackend, type VoiceBackend } from './voice.ts';

const RATE = 24000;
const speechLike = (seconds: number, gapAt = -1, gap = 0) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => {
  const t = i / RATE;
  return gapAt >= 0 && t > gapAt && t < gapAt + gap ? 0 : 0.5 * Math.sin(t * 2 * Math.PI * 180) * (0.6 + 0.4 * Math.sin(t * 9));
});
const lines = spokenLines({ voice, radio, chatter, events });

describe('the clip checks', () => {
  it('pass a clip at a speaking pace', () => expect(clipErrors('Turn left at the next junction', speechLike(2.2), RATE)).toEqual([]));
  it('catch a clip too short for its words', () => expect(clipErrors('Turn left at the next junction please now', speechLike(0.8), RATE).join()).toMatch(/syllables a second/));
  it('count syllables near enough', () => { expect(syllables('Recalculating route')).toBe(6); expect(syllables('Turn left ahead')).toBe(4); expect(syllables('Lovely ride, this. Nice and smooth.')).toBe(8); expect(syllables('Mind the wobble, please.')).toBe(5); expect(syllables('Have a nice mile')).toBe(4); });
  it('pass a short line of long words at its real pace', () => expect(clipErrors('Recalculating route', speechLike(1.8), RATE)).toEqual([]));
  it('catch a silent clip', () => expect(clipErrors('Turn left ahead', new Float32Array(RATE * 1.2), RATE).join()).toMatch(/quiet/));
  it('catch a stall in the middle', () => expect(clipErrors('A longer line that takes a while to say out loud', speechLike(5, 2, 1.5), RATE).join()).toMatch(/silence/));
});

describe('the shipped clips', () => {
  const index: ClipIndex = existsSync('public/voice/clips.json') ? JSON.parse(readFileSync('public/voice/clips.json', 'utf8')) : {};
  it('cover every line the game speaks, in every voice the Menu offers', () => {
    const missing = lines.flatMap((l) => {
      const have = index[clipKey(l.text)]?.voices ?? {};
      return l.role === 'rider' ? (RIDER_VOICES.some((v) => v in have) ? [] : [l.text]) : CHOOSABLE.filter((v) => !(v in have)).map((v) => `${v}: ${l.text}`);
    });
    expect(missing, 'run node tools/voicegen.ts').toEqual([]);
  });
  it('each name their own line, with a file behind each voice that is an MP3', () => {
    expect(new Set(lines.map((l) => clipKey(l.text))).size).toBe(lines.length);
    for (const [key, c] of Object.entries(index)) {
      expect(key).toBe(clipKey(c.text));
      for (const [voice, seconds] of Object.entries(c.voices)) {
        const head = readFileSync(`public/voice/${clipPath(voice, key)}`).subarray(0, 2);
        expect(head[0] === 0xff && (head[1] & 0xe0) === 0xe0, `${voice}/${key}`).toBe(true); // an MPEG frame sync
        const pace = syllables(c.text) / seconds;
        expect(pace, `${voice}: ${c.text}`).toBeGreaterThanOrEqual(1.6);
        expect(pace, `${voice}: ${c.text}`).toBeLessThan(9);
      }
    }
  }, 20000); // reads every clip on disk: slow when the whole suite runs at once
  it('keep what one player downloads small: their two voices and the passengers', () => {
    const seconds = Object.values(index).reduce((s, c) => s + (c.role === 'rider' ? Object.values(c.voices)[0] ?? 0 : c.voices[DEFAULT_VOICES[c.role]] ?? 0), 0);
    expect(seconds * 40 / 8 / 1024).toBeLessThan(4); // MB at 40 kb/s
  });
});

/** A stand-in for the browser's audio element: each play() can be settled by hand, as a real one is by loading or a cut. */
function fakeAudio() {
  const plays: { src: string; reject: (e: Error) => void }[] = [];
  const el = { src: '', onended: null as null | (() => void), onerror: null as null | (() => void), pause() {}, play() { return new Promise<void>((_, reject) => plays.push({ src: el.src, reject })); } };
  return { el, plays };
}
const index = { [clipKey('Destination reached')]: { text: 'Destination reached', role: 'guide' as const, voices: { bf_emma: 1.1 } }, [clipKey('Warm rolls by the till.')]: { text: 'Warm rolls by the till.', role: 'dj' as const, voices: { bm_george: 1.4 } } };
const loaded = async (b: ClipBackend) => { const was = globalThis.fetch; globalThis.fetch = (async () => ({ ok: true, json: async () => index })) as never; await b.load(); globalThis.fetch = was; };

describe('the clip player', () => {
  it('plays the clip in the chosen voice, and the device voice for "device"', async () => {
    const said: string[] = [], { el, plays } = fakeAudio();
    const b = new ClipBackend({ ready: true, speaking: false, unlock() {}, speak(t, done) { said.push(t); done(); }, cancel() {} }, el as never);
    await loaded(b);
    b.speak('Destination reached', () => {});
    expect(plays.at(-1)!.src).toBe(`voice/${clipPath('bf_emma', clipKey('Destination reached'))}`);
    b.choice.guide = 'device';
    b.speak('Destination reached', () => {});
    expect(said).toEqual(['Destination reached']);
  });

  it("doesn't hand a line to the device voice when the clip before it was cut off", async () => {
    const said: string[] = [], { el, plays } = fakeAudio();
    const b = new ClipBackend({ ready: true, speaking: false, unlock() {}, speak(t, done) { said.push(t); done(); }, cancel() {} }, el as never);
    await loaded(b);
    b.speak('Warm rolls by the till.', () => {}); // the DJ, cut off by a direction
    b.cancel();
    b.speak('Destination reached', () => {});
    const abort = new Error('interrupted'); abort.name = 'AbortError';
    plays[0].reject(abort);
    plays[1].reject(abort); // even the new line's own play reports the cut of the one before on some browsers
    await new Promise((r) => setTimeout(r));
    expect(said).toEqual([]);
    expect(el.onended).not.toBeNull(); // still waiting for the clip to end
  });

  it('falls back to the device voice where there is no clip, or no audio at all', () => {
    const said: string[] = [];
    const device: VoiceBackend = { ready: true, speaking: false, unlock() {}, speak(t, done) { said.push(t); done(); }, cancel() {} };
    const b = new ClipBackend(device);
    let finished = false;
    b.speak('A line with no clip', () => { finished = true; });
    expect(said).toEqual(['A line with no clip']);
    expect(finished).toBe(true);
    expect(b.speaking).toBe(false);
  });
});
