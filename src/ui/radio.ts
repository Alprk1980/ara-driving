// The radio DJ: small talk on a slow clock, and a quick word when something happens. It never picks the same
// line twice in a row of its topic, and reports what to say; the voice guide decides if there is room to say it.
import type { RadioLine, RadioTopic } from '../../schemas/content.ts';
import { LINK_SLOT, type LinkKind, type RadioLink } from '../../schemas/radiolinks.ts';

/** The true facts the presenter reads: built by the game each time, so the forecast and the travel are what will happen. */
export type RadioFacts = { forecast(): string; travel(): string; time(): string; station(): string };

const GAP_S = [50, 90] as const, REACT_COOL_S = 25, FIRST_S = 25, MEMORY = 4;

export class RadioHost {
  private lines: RadioLine[];
  private rng: () => number;
  private clock = FIRST_S;
  private cool = 0;
  private recent: string[] = [];

  private links: RadioLink[];
  private facts: RadioFacts | null;

  constructor(lines: RadioLine[], rng: () => number = Math.random, links: RadioLink[] = [], facts: RadioFacts | null = null) {
    this.lines = lines;
    this.rng = rng;
    this.links = links;
    this.facts = facts;
  }

  /** Give the host the game's facts once the game exists. */
  setFacts(facts: RadioFacts) { this.facts = facts; }

  /** A bulletin: one of the presenter's links for this kind, with the facts read into it. */
  private bulletin(kind: LinkKind): string | null {
    const f = this.facts, pool = this.links.filter((l) => l.kind === kind), fresh = pool.filter((l) => !this.recent.includes(l.id)), from = fresh.length ? fresh : pool;
    if (!f || !from.length) return null;
    const link = from[Math.floor(this.rng() * from.length)];
    this.recent = [link.id, ...this.recent].slice(0, MEMORY);
    const fill: Record<LinkKind, () => string> = { weather: f.forecast, travel: f.travel, time: f.time, ident: f.station };
    return link.text.replace(LINK_SLOT[kind], fill[kind]()).replace(/\{station\}/g, f.station()).replace(/([.!?])\./g, '$1'); // a link that ends on the slot's full stop doesn't double it
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

  /** `rush` is the busy part of the morning or evening, when local radio runs its travel news (Smooth's public files: at the
   * peaks, and weekends as needed). Weather lines are for dry spells; the rain has its own. */
  tick(dt: number, at: { night: boolean; rain: boolean; rush?: boolean }): string | null {
    this.cool -= dt;
    if ((this.clock -= dt) > 0) return null;
    this.clock = GAP_S[0] + this.rng() * (GAP_S[1] - GAP_S[0]);
    const roll = this.rng();
    if (this.facts && this.links.length) { // the bulletins, from the facts: travel news at the busy times, as local radio runs it
      if (at.rush && roll < 0.45) return this.bulletin('travel');
      if (roll < 0.2) return this.bulletin('weather');
      if (roll < 0.3) return this.bulletin('travel');
      if (roll < 0.4) return this.bulletin(this.rng() < 0.5 ? 'time' : 'ident');
      return this.pick(roll < 0.72 ? 'chat' : 'ad');
    }
    if (at.rain && roll < 0.4) return this.pick('rain');
    if (at.night && roll < 0.4) return this.pick('night');
    if (at.rush && roll < 0.65) return this.pick('travel');
    return this.pick(roll < 0.45 ? 'chat' : roll < 0.7 ? 'ad' : roll < 0.85 || at.rain ? 'travel' : 'weather');
  }
}
