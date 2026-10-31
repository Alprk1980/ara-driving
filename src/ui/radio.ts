// The radio DJ: small talk on a slow clock, and a quick word when something happens. It never picks the same
// line twice in a row of its topic, and reports what to say; the voice guide decides if there is room to say it.
import type { RadioLine, RadioTopic } from '../../schemas/content.ts';

const GAP_S = [50, 90] as const, REACT_COOL_S = 25, FIRST_S = 25, MEMORY = 4;

export class RadioHost {
  private lines: RadioLine[];
  private rng: () => number;
  private clock = FIRST_S;
  private cool = 0;
  private recent: string[] = [];

  constructor(lines: RadioLine[], rng: () => number = Math.random) {
    this.lines = lines;
    this.rng = rng;
  }

  private pick(topic: RadioTopic): string | null {
    const pool = this.lines.filter((l) => l.topic === topic);
    const fresh = pool.filter((l) => !this.recent.includes(l.id));
    const from = fresh.length ? fresh : pool;
    if (!from.length) return null;
    const line = from[Math.floor(this.rng() * from.length)];
    this.recent = [line.id, ...this.recent].slice(0, MEMORY);
    return line.text;
  }

  /** A word about something that just happened, unless the DJ spoke a moment ago. */
  react(topic: RadioTopic): string | null {
    if (this.cool > 0) return null;
    this.cool = REACT_COOL_S;
    return this.pick(topic);
  }

  tick(dt: number, at: { night: boolean; rain: boolean }): string | null {
    this.cool -= dt;
    if ((this.clock -= dt) > 0) return null;
    this.clock = GAP_S[0] + this.rng() * (GAP_S[1] - GAP_S[0]);
    const roll = this.rng();
    if (at.rain && roll < 0.4) return this.pick('rain');
    if (at.night && roll < 0.4) return this.pick('night');
    return this.pick(roll < 0.55 ? 'chat' : roll < 0.8 ? 'ad' : 'weather');
  }
}
