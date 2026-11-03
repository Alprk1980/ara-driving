// Voice guide: one line at a time. A newer, more urgent line replaces a waiting one, and a stale line is
// dropped, so the game never says "turn left" after the junction.
import type { VoiceKey, VoiceLine } from '../../schemas/content.ts';
import type { Cue } from '../sim/route.ts';
import { clipKey, clipPath, DEFAULT_VOICES, type ClipIndex, type Role, type VoiceChoice } from './clips.ts';

const PRIORITY: Record<VoiceKey, number> = {
  fuel_critical: 5, reached: 4, left_now: 3, right_now: 3, uturn_now: 3, recalculating: 2,
  left_ahead: 1, right_ahead: 1, uturn_ahead: 1, fuel_low: 0, bus_stopping: 2,
};
const STALE_MS = 2000;

export interface VoiceBackend { // swappable for recorded clips
  ready: boolean;
  speaking: boolean;
  unlock(): void;
  speak(text: string, done: () => void): void;
  cancel(): void;
}

export class SpeechBackend implements VoiceBackend {
  ready = 'speechSynthesis' in window;
  speaking = false;
  unlock() { if (this.ready) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } // inside the Start tap
  speak(text: string, done: () => void) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    this.speaking = true;
    u.onend = u.onerror = () => { this.speaking = false; done(); };
    speechSynthesis.speak(u);
  }
  cancel() { speechSynthesis.cancel(); this.speaking = false; }
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** The recorded clips in public/voice where a line has one (tools/voicegen.ts makes them), the device's own speech for
 * anything else, and for any clip that won't play. */
export class ClipBackend implements VoiceBackend {
  ready: boolean;
  speaking = false;
  private clips: ClipIndex = {};
  /** Who reads the sat nav and the radio: the Menu's choice, which the save keeps. */
  choice: VoiceChoice = { ...DEFAULT_VOICES };
  private audio: HTMLAudioElement | null;
  private fallback: VoiceBackend;
  private playing = 0; // which play is current: a cut-off one's late failure must not touch the line after it

  constructor(fallback: VoiceBackend, audio: HTMLAudioElement | null = typeof Audio === 'undefined' ? null : new Audio()) {
    this.fallback = fallback;
    this.audio = audio;
    this.ready = !!this.audio || fallback.ready;
  }

  /** Which lines have a clip. Without the list every line is spoken by the device, as before. */
  async load(url = 'voice/clips.json') {
    try {
      const r = await fetch(url);
      if (r.ok) this.clips = await r.json();
    } catch { /* offline before the list was cached: the device's speech it is */ }
  }

  get count() { return Object.keys(this.clips).length; }

  /** A line that this role says, to try a voice out with. */
  sample(role: Role): string | null { return Object.values(this.clips).find((c) => c.role === role)?.text ?? null; }

  /** The clip to play for a line, in the chosen voice; null for the device's own speech. */
  private clipFor(text: string): string | null {
    const key = clipKey(text), c = this.clips[key];
    if (!c) return null;
    const voice = c.role === 'rider' ? Object.keys(c.voices)[0] : this.choice[c.role];
    return voice && voice in c.voices ? clipPath(voice, key) : null;
  }

  /** Inside the Start tap: a phone only lets audio play from a tap, and this one element is then free to play. */
  unlock() {
    this.fallback.unlock();
    if (this.audio) { this.playing++; this.audio.src = SILENT_WAV; this.audio.play().catch(() => {}); }
  }

  speak(text: string, done: () => void) {
    const file = this.clipFor(text), a = this.audio;
    this.speaking = true;
    const spoken = () => { this.speaking = false; done(); };
    if (!a || !file) return this.fallback.speak(text, spoken);
    const id = ++this.playing;
    const finish = (fell: boolean) => {
      if (id !== this.playing) return; // a newer line has the speaker now
      this.playing++;
      a.onended = a.onerror = null;
      if (fell) this.fallback.speak(text, spoken); else spoken();
    };
    a.onended = () => finish(false);
    a.onerror = () => finish(true);
    a.src = `voice/${file}`;
    // Starting a new clip cuts off the one before, whose play() then fails with AbortError: that's not this clip failing.
    a.play().catch((e: Error) => { if (e?.name !== 'AbortError') finish(true); });
  }

  cancel() {
    this.playing++;
    if (this.audio) { this.audio.onended = this.audio.onerror = null; this.audio.pause(); }
    this.fallback.cancel();
    this.speaking = false;
  }
}

export const cueKey = (c: Cue): VoiceKey => (c.stage === 'reached' ? 'reached' : (`${c.manoeuvre.kind}_${c.stage}` as VoiceKey));

export class VoiceGuide {
  muted = false;
  private lines: Map<VoiceKey, string>;
  private queue: { key: VoiceKey; text: string; born: number }[] = [];
  private backend: VoiceBackend;
  private show: (text: string, key: VoiceKey) => void;
  private chime: () => void;
  private now: () => number;
  private chatting = false;

  constructor(lines: VoiceLine[], backend: VoiceBackend, show: (text: string, key: VoiceKey) => void, chime: () => void, now: () => number = () => performance.now()) {
    this.lines = new Map(lines.map((l) => [l.key, l.text]));
    this.backend = backend;
    this.show = show;
    this.chime = chime;
    this.now = now;
  }

  say(key: VoiceKey) {
    const text = this.lines.get(key) ?? key;
    this.show(text, key); // always shown, sound or not
    if (this.muted || !this.backend.ready) return this.chime();
    if (this.chatting) { this.chatting = false; this.backend.cancel(); } // directions always talk over the radio
    this.queue.push({ key, text, born: this.now() });
    this.queue.sort((a, b) => PRIORITY[b.key] - PRIORITY[a.key]);
    if (PRIORITY[key] >= 3 && this.backend.speaking) this.backend.cancel();
    this.pump();
  }

  /** Radio chatter: only into silence, and gone the moment a direction needs the voice. Says if it was spoken. */
  chatter(text: string): boolean {
    if (this.muted || !this.backend.ready || this.backend.speaking || this.queue.length) return false;
    this.chatting = true;
    this.backend.speak(text, () => { this.chatting = false; this.pump(); });
    return true;
  }

  private pump() {
    if (this.backend.speaking) return;
    const fresh = this.queue.filter((l) => this.now() - l.born < STALE_MS);
    const line = fresh.shift();
    this.queue = fresh;
    if (line) this.backend.speak(line.text, () => this.pump());
  }
}
