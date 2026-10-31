// Two small line-keepers for the HUD. Guide shows each first-time tip once, one at a time. Passengers picks what
// the rider says, on a slow clock and at the moments that matter.
import type { ChatterLine, ChatterMoment, GuideKey, GuideLine } from '../../schemas/content.ts';

const TIP_S = 7, CHAT_GAP_S = [20, 34] as const, MEMORY = 5;

export class Guide {
  private lines: Map<GuideKey, string>;
  private seen: string[];
  private show: (text: string | null) => void;
  private waiting: string[] = [];
  private clock = 0;

  constructor(lines: GuideLine[], seen: string[], show: (text: string | null) => void) {
    this.lines = new Map(lines.map((l) => [l.key, l.text]));
    this.seen = seen; // the save's own list, so it is kept with the game
    this.show = show;
  }

  /** Queues a tip, unless it has already been seen. Says if it was new. */
  fire(key: GuideKey): boolean {
    const text = this.lines.get(key);
    if (!text || this.seen.includes(key)) return false;
    this.seen.push(key);
    this.waiting.push(text);
    return true;
  }

  tick(dt: number) {
    if (this.clock > 0 && (this.clock -= dt) > 0) return;
    const next = this.waiting.shift();
    this.show(next ?? null);
    this.clock = next ? TIP_S : 0;
  }
}

export class Passengers {
  private lines: ChatterLine[];
  private rng: () => number;
  private clock: number = CHAT_GAP_S[0];
  private recent: string[] = [];

  constructor(lines: ChatterLine[], rng: () => number = Math.random) {
    this.lines = lines;
    this.rng = rng;
  }

  say(moment: ChatterMoment): string | null {
    const pool = this.lines.filter((l) => l.moment === moment), fresh = pool.filter((l) => !this.recent.includes(l.id));
    const from = fresh.length ? fresh : pool;
    if (!from.length) return null;
    const line = from[Math.floor(this.rng() * from.length)];
    this.recent = [line.id, ...this.recent].slice(0, MEMORY);
    this.clock = CHAT_GAP_S[0] + this.rng() * (CHAT_GAP_S[1] - CHAT_GAP_S[0]);
    return line.text;
  }

  /** The rider's running opinion of the trip, every so often. */
  tick(dt: number, care: number): string | null {
    return (this.clock -= dt) > 0 ? null : this.say(care > 0.7 ? 'smooth' : 'nervous');
  }
}
