// Traffic lights on a three-stage plan: one stage for each road through the junction, then all traffic held while people
// cross every arm (a "full pedestrian stage", TAL 5/05). Timings are the UK's: amber 3 s and red-and-amber 2 s are set in
// law (TSRGD 2016 Schedule 14), which together make the standard 5 s intergreen (DfT TAL 1/06). A full stage runs at least
// 7 s, and a cycle at most 90-120 s (traffic-signal-design.com and a TfL timing specification; the green below is an
// example inside those limits). The green man shows 7 s, then a clearance of the crossing's width at 1.2 m/s plus 2 s,
// the TAL 5/05 and TfL formula: 12 m of road takes 12 s.
import { ROAD_W, type Town } from './town.ts';

export const STOP_LINE_M = 11; // back from the middle of a junction
export const AMBER_S = 3, RED_AMBER_S = 2, GREEN_S = 14, MIN_GREEN_S = 7, MAX_CYCLE_S = 90;
export const WALK_S = 7, DESIGN_WALK_MPS = 1.2, CLEAR_S = ROAD_W / DESIGN_WALK_MPS + 2;
const SECOND_RED_AMBER = GREEN_S + AMBER_S, SECOND_GREEN = SECOND_RED_AMBER + RED_AMBER_S, PEOPLE = SECOND_GREEN + GREEN_S + AMBER_S;
export const CYCLE_S = PEOPLE + WALK_S + CLEAR_S + RED_AMBER_S;

export type Aspect = 'green' | 'amber' | 'red' | 'redAmber';
const within = (t: number) => ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;

/** What one stage shows at this moment, from the plan's start. */
export function aspectAt(t: number, stage: 0 | 1): Aspect {
  const s = within(t);
  if (stage === 0) return s < GREEN_S ? 'green' : s < SECOND_RED_AMBER ? 'amber' : s >= CYCLE_S - RED_AMBER_S ? 'redAmber' : 'red';
  return s < SECOND_RED_AMBER ? 'red' : s < SECOND_GREEN ? 'redAmber' : s < PEOPLE - AMBER_S ? 'green' : s < PEOPLE ? 'amber' : 'red';
}

/** The green man is on: start crossing now, as the clearance after it is for finishing, not starting. */
export const walkAt = (t: number) => { const s = within(t); return s >= PEOPLE && s < PEOPLE + WALK_S; };

/** Which stage a road belongs to at a junction: running more east-west, or more north-south. */
export function stageOf(town: Town, edge: number): 0 | 1 {
  const e = town.edges[edge], a = town.nodes[e.a], b = town.nodes[e.b];
  return Math.abs(b.x - a.x) > Math.abs(b.z - a.z) ? 0 : 1;
}

/** What a driver on this road sees at this junction, or null where there are no signals. */
export function signalFor(town: Town, node: number, edge: number, time: number): Aspect | null {
  const offset = town.signals.get(node);
  return offset === undefined ? null : aspectAt(time + offset * CYCLE_S, stageOf(town, edge));
}

/** Whether people may start across this junction now. */
export function walkFor(town: Town, node: number, time: number): boolean {
  const offset = town.signals.get(node);
  return offset !== undefined && walkAt(time + offset * CYCLE_S);
}

/** Seconds people have left to be over before traffic moves: the rest of the green man and the clearance after it, or 0
 * when the green man isn't showing. */
export function crossTimeFor(town: Town, node: number, time: number): number {
  const offset = town.signals.get(node);
  if (offset === undefined || !walkAt(time + offset * CYCLE_S)) return 0;
  return PEOPLE + WALK_S + CLEAR_S - within(time + offset * CYCLE_S);
}
