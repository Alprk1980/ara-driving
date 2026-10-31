// Voice guide: one line at a time. A newer, more urgent line replaces a waiting one, and a stale line is
// dropped, so the game never says "turn left" after the junction.
import type { VoiceKey, VoiceLine } from '../../schemas/content.ts';
import type { Cue } from '../sim/route.ts';

const PRIORITY: Record<VoiceKey, number> = {
  fuel_critical: 5, reached: 4, left_now: 3, right_now: 3, uturn_now: 3, recalculating: 2,
  left_ahead: 1, right_ahead: 1, uturn_ahead: 1, fuel_low: 0,
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
