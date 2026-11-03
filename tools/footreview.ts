// Headless playthrough of life on foot: drive to a bus stop, get out, walk to it, catch the bus, ring the bell, get
// off, walk to a front door, then fast travel home. Each session writes a plain digest, and the local model flags what
// looks wrong. Findings are leads: replay one with `node tools/footreview.ts --replay <session>` before acting on it.
//   node --env-file=.env.llm tools/footreview.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Place, QuestText, Regular } from '../schemas/content.ts';
import { CASUAL, drive } from '../src/sim/autopilot.ts';
import { NEUTRAL, type DriveIntent } from '../src/sim/car.ts';
import { BUS_FARE } from '../src/sim/economy.ts';
import { Game, STEP, type GameEvent } from '../src/sim/game.ts';
import { placeAt } from '../src/sim/quests.ts';
import { dist, makeRng, ROAD_W, Town, type BusStop, type Vec } from '../src/sim/town.ts';
import { chat, parseJson } from './llm.ts';

const read = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const content = { places: read<Place[]>('src/data/places.json'), quests: read<QuestText[]>('src/data/quests.json'), regulars: read<Regular[]>('src/data/regulars.json') };
const town = new Town();
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const at = (v: Vec) => `${Math.round(v.x)},${Math.round(v.z)}`;
const roadGap = (v: Vec) => Math.min(...town.edges.map((e) => town.segDist(v, e))) - ROAD_W / 2; // metres from the kerb, negative in the road

/** Head for a point: turn toward it, walk. */
function toward(g: Game, p: Vec, run = false): DriveIntent {
  const f = g.foot!, want = Math.atan2(p.x - f.x, p.z - f.z);
  let turn = want - f.heading;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return { steer: Math.max(-1, Math.min(1, -turn * 2)), throttle: Math.abs(turn) < 1.2 ? 1 : 0, brake: 0, handbrake: run };
}

export function digest(session: number): string {
  const rng = makeRng(session * 7 + 3);
  let points = session % 5 === 4 ? 1 : 40; // now and then someone without the fare
  const wallet = { points: () => points, spend(n: number) { if (n > points) return false; points -= n; return true; }, earn(n: number) { points += n; } };
  const g = new Game(content, wallet, { seed: session + 300, town, day: `day${session}` });
  const lines: string[] = [`session ${session}: ${points} Points, fare ${BUS_FARE} Points`];
  const say = (s: string) => lines.push(`${clock(g.time)} ${s}`);
  g.on((e: GameEvent) => {
    if (e.type === 'foot') say(e.out ? `got out at ${at(g.foot!)}, car at ${at(g.player)}` : 'back in the car');
    if (e.type === 'bus') say(e.what === 'on' ? `on the bus, paid ${e.fare}, balance ${points}` : e.what === 'bell' ? 'rang the bell' : `off the bus at ${at(g.foot!)}, ${roadGap(g.foot!).toFixed(1)} m from the kerb${town.boxAt(g.foot!.x, g.foot!.z, 0.2) ? ', INSIDE A BUILDING' : ''}`);
  });
  const tick = (intent: DriveIntent = NEUTRAL) => {
    g.step(intent);
    if (g.foot && !g.ride && Math.round(g.time / STEP) % 60 === 0) { // once a second, the things that must never happen
      if (town.boxAt(g.foot.x, g.foot.z, 0.1)) say(`CHECK: standing inside a building at ${at(g.foot)}`);
      const touching = g.traffic.cars.find((c) => !c.dormant && dist(c, g.foot!) < c.halfW && Math.abs(c.speed) > 1);
      if (touching) say(`CHECK: a moving ${touching.role} is on top of you at ${at(g.foot)}`);
    }
  };
  const until = (s: number, done: () => boolean, intent: () => DriveIntent = () => NEUTRAL) => { for (let i = 0; i < s / STEP; i++) { if (done()) return true; tick(intent()); } return done(); };

  // Drive to a stop somewhere in town.
  const stops = town.routes.flatMap((r) => r.stops), stop: BusStop = stops[Math.floor(rng() * stops.length)];
  g.setWaypoint(stop, 'Bus stop');
  say(`driving to the stop at ${at(stop)}, ${Math.round(dist(stop, g.player))} m away`);
  if (!until(240, () => dist(g.player, stop) < 30, () => drive(g, CASUAL))) say(`never got within 30 m of the stop by car, ${Math.round(dist(g.player, stop))} m off`);
  g.setWaypoint(null);
  until(10, () => Math.abs(g.player.speed) < 0.2, () => ({ steer: 0, throttle: 0, brake: 1 }));
  for (let t = 0; t < 20 && !g.foot; t++) { const why = g.cantGetOut; if (why) say(`can't get out: ${why}`); else g.getOut(); until(1, () => false); }
  if (!g.foot) return [...lines, 'end: never got out'].join('\n');

  // Walk to the stop and wait.
  const set = g.time;
  if (!until(120, () => g.atStop !== null, () => toward(g, stop))) say(`walking: not at the stop after 120 s, ${dist(g.foot, stop).toFixed(1)} m off at ${at(g.foot)}`);
  else say(`at the stop after ${Math.round(g.time - set)} s walking, ${dist(g.foot, stop).toFixed(1)} m from the pole`);
  const wait = g.time;
  if (!until(300, () => g.busHere !== null)) { const b = g.traffic.cars.filter((c) => c.role === "bus").reduce((a, c) => (dist(a, stop) < dist(c, stop) ? a : c)); say(`waited 300 s and no bus pulled in; nearest bus ${Math.round(dist(b, stop))} m away, speed ${b.speed.toFixed(1)}, dwell ${b.dwell.toFixed(1)}, ${Math.round(dist(b, g.player))} m from your car, waiting ${b.waiting.toFixed(0)} s`); }
  else {
    if (session % 5 === 4) points = 1; // short of the fare, whatever the drive earned
    say(`bus pulled in after ${Math.round(g.time - wait)} s waiting; balance before boarding ${points}`);
    if (!g.board()) say(`couldn't board with ${points} Points`);
  }

  if (g.ride) {
    const bus = g.ride.bus;
    until(30, () => bus.dwell <= 0);
    until(5, () => false);
    g.ringBell();
    const rang = g.time;
    if (process.env.TRACE) for (let i = 0; i < 30; i++) { until(8, () => !g.ride); if (!g.ride) break; const st = town.routes[bus.route].stops, k = st.findIndex((q) => q.leg === bus.leg && q.along > bus.along - 1.5); say(`TRACE ${[{ x: g.player.x, z: g.player.z, n: 'car' }, ...g.traffic.cars.filter((o) => o !== bus && !o.dormant).map((o) => ({ x: o.x, z: o.z, n: o.role + ' ' + o.speed.toFixed(1) }))].map((o) => ({ ...o, a: (o.x - bus.x) * Math.sin(bus.heading) + (o.z - bus.z) * Math.cos(bus.heading), l: (o.x - bus.x) * Math.cos(bus.heading) - (o.z - bus.z) * Math.sin(bus.heading) })).filter((o) => o.a > -3 && o.a < 30 && Math.abs(o.l) < 8).map((o) => `${o.n}@${o.a.toFixed(1)}/${o.l.toFixed(1)}`).join(' ')} | bus ${at(bus)} cool ${bus.cool.toFixed(1)} passing ${bus.passing.toFixed(1)} heading ${bus.heading.toFixed(2)} halfL ${bus.halfL} speed ${bus.speed.toFixed(1)} want ${bus.want.toFixed(1)} dwell ${bus.dwell.toFixed(1)} waiting ${bus.waiting.toFixed(1)} lane ${bus.lane.toFixed(1)}->${bus.laneGoal} served ${bus.served} next ${k} gap ${k >= 0 ? (st[k].along - bus.along).toFixed(1) : '-'} car ${Math.round(dist(bus, g.player))} m`); }
    if (!until(240, () => !g.ride)) say(`rang the bell 240 s ago and still on the bus at ${at(bus)}`);
    else {
      const near = stops.reduce((a, b) => (dist(a, g.foot!) < dist(b, g.foot!) ? a : b));
      say(`rode ${Math.round(g.time - rang)} s after the bell; nearest stop ${dist(near, g.foot!).toFixed(1)} m away`);
    }
  }

  // Walk to the nearest front door.
  const door = g.doors.reduce((a, b) => (dist(a, g.foot!) < dist(b, g.foot!) ? a : b)), name = placeAt(town, content.places, door.plot)?.name;
  say(`walking to the door of ${name}, ${Math.round(dist(door, g.foot))} m away`);
  const out = { x: door.x + Math.sin(door.heading) * 1.2, z: door.z + Math.cos(door.heading) * 1.2 }; // just in front of it
  if (!until(150, () => g.atDoor === door, () => toward(g, dist(g.foot!, out) > 3 ? out : door, dist(g.foot!, out) > 40))) say(`not at the door after 150 s, ${dist(g.foot, door).toFixed(1)} m off at ${at(g.foot)}`);
  else say(`at the door of ${name}`);

  g.fastTravel('home');
  say(`fast travelled home: ${g.foot ? 'STILL ON FOOT' : 'in the car'}, car at home ${dist(g.player, town.home.road) < 20}`);
  lines.push(`end: ${points} Points`);
  return lines.join('\n');
}

const PRIMER = `You review playtest logs from ARA Driving, a game of a small British town. These sessions test getting out of the car and travelling on foot and by bus. A script plays each session: it drives to a bus stop, stops, gets out, walks straight at the stop, waits for a bus, boards, rings the bell once the bus has pulled away, gets off where the bus stops, walks straight at the nearest front door, then fast travels home.
Rules: the fare is 2 Points, taken once when you board. With fewer Points you can't board, and the session goes on to the door on foot. Bus stops are request stops: a bus only pulls in when someone waits, someone aboard wants that stop or the bell is rung, so a wait of a few minutes for a bus is normal; buses run on a few loops through town. After the bell the bus stops at the next stop, which can be several hundred metres away. You get off onto the pavement beside the bus, so a few metres from the stop pole is normal. Positive "m from the kerb" is on the pavement; negative is in the road. The pavement is 3 m wide. Getting out can wait while a car passes the door (Highway Code rule 239). The script walks in a straight line, so it can be held up by a wall or a parked car between it and its target; that is a known limit of the script, not a fault, unless it happens on open ground. Fast travel home always puts you back in the car. Lines marked CHECK are things that must never happen.
Flag only things that look like real problems: a CHECK line, getting off into the road or a building, a bus that never stopped after the bell, a fare taken twice or wrongly, the car not where it was left, fast travel leaving you on foot.
Answer with ONLY a JSON array, empty if nothing is wrong: [{"session":3,"time":"4:12","problem":"one sentence","evidence":"the exact log line"}]`;

if (process.argv[2] === '--replay') {
  console.log(digest(Number(process.argv[3])));
} else {
  mkdirSync('.qwen-runs', { recursive: true });
  const SESSIONS = Number(process.argv[2] ?? 12), PER_CALL = 4, findings: unknown[] = [], logs: string[] = [];
  for (let s = 0; s < SESSIONS; s++) logs.push(digest(s));
  writeFileSync('.qwen-runs/footreview-logs.txt', logs.join('\n\n'));
  console.log(logs.join('\n\n'));
  await Promise.all(Array.from({ length: Math.ceil(SESSIONS / PER_CALL) }, async (_, n) => { // llm.ts holds these to the server's slots
    const batch = logs.slice(n * PER_CALL, n * PER_CALL + PER_CALL);
    const reply = await chat([{ role: 'system', content: PRIMER }, { role: 'user', content: batch.join('\n\n') }], { temperature: 0.2 });
    const list = (parseJson(reply) ?? []) as { session?: number; problem?: string; evidence?: string }[];
    const good = list.filter((f) => typeof f.session === 'number' && typeof f.problem === 'string' && batch.some((l) => l.includes(String(f.evidence ?? '').slice(0, 30))));
    findings.push(...good);
    console.log(`sessions ${n * PER_CALL}-${n * PER_CALL + batch.length - 1}: ${good.length} of ${list.length} findings cite the log`);
    writeFileSync('.qwen-runs/footreview.json', JSON.stringify(findings, null, 2));
  }));
  console.log(JSON.stringify(findings, null, 1));
}
