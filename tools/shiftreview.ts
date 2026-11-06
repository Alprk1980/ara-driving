// Headless shifts at work: sign on at each career's base, drive its vehicle on the autopilot to every task the shift
// deals, stop there for the work, and drive back to sign off. Each session writes a plain digest, and the local model
// flags what looks wrong. Findings are leads: replay one with `node tools/shiftreview.ts --replay <session>` first.
//   node --env-file=.env.llm tools/shiftreview.ts [sessions]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CAREER_IDS, CAREERS, RANK_JOBS, type CallCard } from '../schemas/careers.ts';
import type { Place, QuestText } from '../schemas/content.ts';
import { CASUAL, drive } from '../src/sim/autopilot.ts';
import { NEUTRAL } from '../src/sim/car.ts';
import { AT_M } from '../src/sim/careers.ts';
import { Game, STEP, type GameEvent } from '../src/sim/game.ts';
import { dist, Town, type Vec } from '../src/sim/town.ts';
import { chat, parseJson } from './llm.ts';

const read = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const content = { places: read<Place[]>('src/data/places.json'), quests: read<QuestText[]>('src/data/quests.json'), calls: read<CallCard[]>('src/data/calls.json') };
const town = new Town();
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const at = (v: Vec) => `${Math.round(v.x)},${Math.round(v.z)}`;
const LIMIT_S = 720, STUCK_S = 90;

export function digest(session: number): string {
  const career = CAREER_IDS[session % CAREER_IDS.length], rank = Math.floor(session / CAREER_IDS.length) % 3;
  let points = 0;
  const wallet = { points: () => points, spend(n: number) { if (n > points) return false; points -= n; return true; }, earn(n: number) { points += n; } };
  const g = new Game(content, wallet, { seed: session + 500, town, day: `day${session}` });
  g.progress.careers = { [career]: RANK_JOBS[rank] };
  const lines: string[] = [`session ${session}: ${CAREERS[career].name}, rank ${CAREERS[career].ranks[rank].title} (£${CAREERS[career].ranks[rank].gbpHour}/h)`];
  const say = (s: string) => lines.push(`${clock(g.time)} ${s}`);
  g.on((e: GameEvent) => {
    if (e.type === 'shift') say(e.what === 'on' ? `signed on, driving the ${g.player.car.id}` : `signed off: shift earned ${e.earned} Points, back in the ${g.player.car.id} at ${at(g.player)}`);
    if (e.type === 'shiftPaid') say(`PAID ${e.pay} Points for "${e.title}"${e.onTime ? ', on time' : ', late'}${e.note ? `: ${e.note}` : ''}`);
    if (e.type === 'shiftPhase') say(`phase: ${e.label}`);
    if (e.type === 'careerRank') say(`promoted to ${CAREERS[e.career].ranks[e.rank].title}`);
  });
  const base = g.bases.find((b) => b.career === career)!;
  g.getOut();
  Object.assign(g.foot!, { x: base.at.x, z: base.at.z });
  if (!g.signOn(career, CAREERS[career].ranks[rank].vehicles.at(-1))) return [...lines, `end: could not sign on at ${base.name}`].join('\n');
  let task = g.shift!.task, since = g.time, best = Infinity;
  const tell = () => { const t = g.shift?.task; if (t) say(`task: ${t.kind} "${t.title}" (${t.text}), ${Math.round(dist(t.at, g.player))} m away, booked ${Math.round(t.booked)} s, due in ${Math.round(t.due - g.shift!.clock)} s${t.blue ? ', blue lights' : ''}`); };
  tell();
  for (let i = 0; i < LIMIT_S / STEP && g.shift; i++) {
    const t = g.shift.task;
    if (t !== task) { task = t; since = g.time; best = Infinity; tell(); }
    if (!t) { say('CHECK: on shift with no task'); break; }
    const d = dist(t.at, g.player);
    best = Math.min(best, d);
    const close = d < AT_M - 2 && t.kind !== 'pull';
    g.step(close ? { steer: 0, throttle: 0, brake: g.player.speed > 0.3 ? 1 : 0 } : drive(g, CASUAL)); // let go once stopped: held, the brake reverses
    if (Math.round(g.time / STEP) % 60 === 0 && g.player.blue !== (t.blue && g.shift?.held === 0 && !(t.kind === 'pull' && g.shift?.pulled))) say(`CHECK: blue lights ${g.player.blue ? 'on' : 'off'} on a ${t.kind} task`);
    if (g.time - since > STUCK_S && best > AT_M * 2) { say(`STUCK: ${STUCK_S} s on "${t.title}" and never nearer than ${Math.round(best)} m; now ${Math.round(d)} m off at ${at(g.player)}, speed ${g.player.speed.toFixed(1)}`); since = g.time; best = Infinity; }
  }
  if (g.shift) say(`end: still on shift after ${LIMIT_S} s, ${g.shift.jobs} jobs done, task ${g.shift.task?.kind}`);
  lines.push(`end: ${points} Points`);
  void NEUTRAL;
  return lines.join('\n');
}

const PRIMER = `You review playtest logs from ARA Driving, a game of a small British town. These sessions test careers: a script signs on at a station or depot, drives the service's vehicle on an autopilot to each task the shift deals, stops for the work, and drives back to the base, where the shift ends by itself.
Rules: a bus shift is 8 stops on a timetable, then back to the garage; at a timing point an early bus waits for its time. Other careers get 3 calls, then go back to base. An ambulance call in category 1 or 2 adds a run to the clinic. A recovery tow adds a run back to the yard. A crash in town can jump to the front of the list for the crew on duty. Each task is paid when it's finished: the rank's hourly wage for the task's booked time, plus 15% if on time. Being late is still paid. Blue lights are on only on the way to an emergency, never at the scene. The autopilot drives cautiously and is slower than a player, so "late" is common and not a fault. Lines marked CHECK or STUCK are things that should not happen, though STUCK can be the autopilot's limit.
Flag only things that look like real problems: a CHECK or STUCK line, a task paid nothing or an absurd amount, a shift that never ends, a vehicle wrong for the rank, the player not back in their own car after signing off.
Answer with ONLY a JSON array, empty if nothing is wrong: [{"session":3,"time":"4:12","problem":"one sentence","evidence":"the exact log line"}]`;

if (!import.meta.main) { /* for tests */ } else if (process.argv[2] === '--replay') {
  console.log(digest(Number(process.argv[3])));
} else {
  mkdirSync('.qwen-runs', { recursive: true });
  const SESSIONS = Number(process.argv[2] ?? 12), PER_CALL = 3, findings: unknown[] = [], logs: string[] = [];
  for (let s = 0; s < SESSIONS; s++) { logs.push(digest(s)); console.error(`session ${s} played`); }
  writeFileSync('.qwen-runs/shiftreview-logs.txt', logs.join('\n\n'));
  console.log(logs.join('\n\n'));
  await Promise.all(Array.from({ length: Math.ceil(SESSIONS / PER_CALL) }, async (_, n) => {
    const batch = logs.slice(n * PER_CALL, n * PER_CALL + PER_CALL);
    const reply = await chat([{ role: 'system', content: PRIMER }, { role: 'user', content: batch.join('\n\n') }], { temperature: 0.2 });
    const list = (parseJson(reply) ?? []) as { session?: number; problem?: string; evidence?: string }[];
    const good = list.filter((f) => typeof f.session === 'number' && typeof f.problem === 'string' && batch.some((l) => l.includes(String(f.evidence ?? '').slice(0, 30))));
    findings.push(...good);
    console.log(`sessions ${n * PER_CALL}-${n * PER_CALL + batch.length - 1}: ${good.length} of ${list.length} findings cite the log`);
    writeFileSync('.qwen-runs/shiftreview.json', JSON.stringify(findings, null, 2));
  }));
  console.log(JSON.stringify(findings, null, 1));
}
