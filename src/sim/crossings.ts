// Signal-controlled crossings between junctions: pelicans and puffins. Pure, so tests can run one without a town.
//
// A pelican runs green, amber, red, then flashing amber while the green man flashes: drivers may go on the flashing amber
// once the crossing is clear (the sequence is set in law: SI 1997/2400 schedule 2). Pelicans were dropped from the 2016
// regulations, so none can be built after October 2016, but the old ones stay; this town keeps them in Old Town. A puffin,
// its replacement, has no flashing amber: after the green man comes a short fixed clearance, then more while detectors
// see someone still crossing, then red-and-amber (TAL 1/01; Devon County Council's puffin timings).
//
// Timings: amber 3 s and red-and-amber 2 s are set in law (signals.ts). The green man shows 4-7 s for a puffin in the
// guidance found; 6 s is used for both. A pelican's flashing period is the width over 1.2 m/s, at least 6 s, and traffic
// gets at least 20 s of green between crossings, both from South Dublin's pelican specification (Irish, not UK, so take
// them as examples). A puffin's clearance is 2 s fixed and up to 7 s more by detector, from Devon's papers.
import { AMBER_S, DESIGN_WALK_MPS, RED_AMBER_S } from './signals.ts';
import { ROAD_W } from './town.ts';

export type CrossingKind = 'zebra' | 'pelican' | 'puffin';
export const MIN_GREEN_S = 20, ALL_RED_S = 1, MAN_S = 6, FLASH_S = Math.max(6, ROAD_W / DESIGN_WALK_MPS);
export const PUFFIN_CLEAR_S = 2, PUFFIN_EXTEND_S = 7;

/** What drivers see: a pelican adds flashing amber, when they may go if nobody's on the crossing. */
export type TrafficAspect = 'green' | 'amber' | 'red' | 'redAmber' | 'flashingAmber';
/** What people see: the green man, flashing (pelican only: don't start now), or the red man. */
export type ManAspect = 'green' | 'flashing' | 'red';

type Phase = 'green' | 'amber' | 'allRed' | 'man' | 'flash' | 'clear' | 'redAmber';

export class CrossingLight {
  kind: 'pelican' | 'puffin';
  private phase: Phase = 'green';
  private t = MIN_GREEN_S; // start ready to answer a press
  private wanted = false;

  constructor(kind: 'pelican' | 'puffin') { this.kind = kind; }

  /** Someone at the kerb has pressed the button. */
  press() { this.wanted = true; }

  /** `occupied`: someone is on the crossing, which a puffin's detectors see and which holds its red. */
  step(dt: number, occupied: boolean) {
    this.t += dt;
    const p = this.phase, t = this.t;
    if (p === 'green' && this.wanted && t >= MIN_GREEN_S) this.go('amber');
    else if (p === 'amber' && t >= AMBER_S) this.go('allRed');
    else if (p === 'allRed' && t >= ALL_RED_S) { this.wanted = false; this.go('man'); }
    else if (p === 'man' && t >= MAN_S) this.go(this.kind === 'pelican' ? 'flash' : 'clear');
    else if (p === 'flash' && t >= FLASH_S) this.go('green');
    else if (p === 'clear' && t >= PUFFIN_CLEAR_S && (!occupied || t >= PUFFIN_CLEAR_S + PUFFIN_EXTEND_S)) this.go('redAmber');
    else if (p === 'redAmber' && t >= RED_AMBER_S) this.go('green');
  }

  private go(p: Phase) { this.phase = p; this.t = 0; }

  get traffic(): TrafficAspect {
    return { green: 'green', amber: 'amber', allRed: 'red', man: 'red', flash: 'flashingAmber', clear: 'red', redAmber: 'redAmber' }[this.phase] as TrafficAspect;
  }

  get man(): ManAspect { return this.phase === 'man' ? 'green' : this.phase === 'flash' ? 'flashing' : 'red'; }

  /** Seconds a person setting off now can count on before traffic may move: the rest of the green man and the time after
   * it. A puffin's detectors hold the red while someone's on the crossing, up to their limit, so that counts. */
  get crossTime(): number {
    if (this.phase !== 'man') return 0;
    return MAN_S - this.t + (this.kind === 'pelican' ? FLASH_S : PUFFIN_CLEAR_S + PUFFIN_EXTEND_S);
  }
}
