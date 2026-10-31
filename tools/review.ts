// Headless playtest review: run sessions, write a plain digest of each, and have the local model flag what looks
// wrong. Findings are leads: replay each one with `node tools/review.ts --replay <session>` before acting on it.
//   node --env-file=.env.llm tools/review.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Goal, Place, QuestText, Regular, TownEventCard } from '../schemas/content.ts';
import { CASUAL, drive, SKILLED } from '../src/sim/autopilot.ts';
import { CARS } from '../src/sim/economy.ts';
import { Game, type GameEvent } from '../src/sim/game.ts';
import { Town } from '../src/sim/town.ts';
import { chat, parseJson } from './llm.ts';

const read = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const content = { places: read<Place[]>('src/data/places.json'), quests: read<QuestText[]>('src/data/quests.json'), regulars: read<Regular[]>('src/data/regulars.json'), goals: read<Goal[]>('src/data/goals.json') };
const events = read<TownEventCard[]>('src/data/events.json');
const town = new Town();
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function digest(session: number): string {
  const car = CARS[session % CARS.length];
  const style = session % 2 ? SKILLED : CASUAL;
  let points = 300;
  const wallet = { points: () => points, spend(n: number) { if (n > points) return false; points -= n; return true; }, earn(n: number) { points += n; } };
  const g = new Game(content, wallet, { carId: car.id, seed: session + 100, town, day: `day${session}`, events });
  const lines: string[] = [`session ${session}: ${car.name}, ${style === CASUAL ? 'casual' : 'skilled'} driver, 300 Points, full tank`];
  const say = (s: string) => lines.push(`${clock(g.time)} ${s}`);
  let bumps = 0, crashes = 0, stuck = 0;
  g.on((e: GameEvent) => {
    if (e.type === 'questStarted') say(`took ${e.offer.type}${e.offer.carJob ? ` (${e.offer.carJob} job)` : ''}${e.offer.market ? ' (market day)' : ''}${e.offer.twist ? ` (${e.offer.twist})` : ''}${e.offer.regular ? ` (story ${e.offer.regular.name} ${e.offer.regular.step + 1}/${e.offer.regular.total})` : ''} "${e.offer.title}": ${e.offer.text} ${e.offer.routeKm.toFixed(2)} km, drive to start ${e.offer.approachKm.toFixed(2)} km, pay ${e.offer.basePay}-${e.offer.maxPay}, quote ${Math.ceil(e.offer.litres)} L, fuel ${Math.round(g.player.fuel)} L`);
    if (e.type === 'questPhase') say(e.label);
    if (e.type === 'questDone') say(`DONE ${e.grade}, paid ${e.pay}, balance ${points}, fuel ${Math.round(g.player.fuel)} L`);
    if (e.type === 'questFailed') say(`FAILED: ${e.reason}`);
    if (e.type === 'fuelLow') say(`fuel warning ${e.level}, ${Math.round(g.player.fuel)} L`);
    if (e.type === 'tankEmpty') say('tank empty');
    if (e.type === 'recalculating') say(`route recalculated at ${Math.round(g.player.x)},${Math.round(g.player.z)}`);
    if (e.type === 'bump') { bumps++; if (e.by === 'car') { crashes++; say(`hit a car at ${Math.round(e.speed * 3.6)} km/h`); } }
    if (e.type === 'rank') say(`rank up to ${e.level}`);
    if (e.type === 'event') say(e.card ? `town event: ${e.card.title} (${e.card.kind})` : 'town event over');
    if (e.type === 'goal') say(`daily goal done: ${e.goal.text}, paid ${e.pay}`);
    if (e.type === 'streak') say(`streak of ${e.jobs} jobs, bonus ${e.pay}`);
    if (e.type === 'found') say(`found ${e.find.name}, paid ${e.pay}`);
    if (e.type === 'regular') say(`${e.name}: ${e.thanks}${e.finale ? ` Story finished, bonus ${e.finale}.` : ''}`);
    if (e.type === 'driveState' && e.state === 'Stranded') say('stranded');
  });
  for (let s = 0; s < 10 * 3600; s++) {
    // Plays as the job list advises: take a job the tank can cover, otherwise go and refuel first.
    if (!g.quest && !g.waypoint) {
      const fits = g.offers.find((o) => o.litres <= g.player.fuel);
      if (fits) g.accept(fits.id);
      else if (points > 0 && !g.atStation) { g.routeToStation(); say(`no job fits ${Math.round(g.player.fuel)} L, heading to a station`); }
      else if (points <= 0 && g.offers.length) g.accept(g.offers[0].id);
    }
    if (g.player.state === 'Stranded') { g.acceptTow(); say('towed home'); }
    if (g.canRefuel && !g.quest && g.player.fuel < g.player.car.tank * 0.5 && points > 0) {
      g.beginRefuel();
      const got = g.buyFuel(1000);
      g.endRefuel();
      g.setWaypoint(null);
      say(`refuelled ${Math.round(got)} L, balance ${points}`);
    }
    g.step(drive(g, style));
    stuck = g.player.speed === 0 && g.player.state !== 'Parked' ? stuck + 1 : Math.abs(g.player.speed) < 0.5 ? stuck + 1 : 0;
    if (stuck === 600) say(`not moving for 10 s at ${Math.round(g.player.x)},${Math.round(g.player.z)}, state ${g.player.state}`);
  }
  lines.push(`end: ${points} Points, ${Math.round(g.fuel.burnt)} L burnt, ${bumps - crashes} wall hits, ${crashes} car crashes`);
  return lines.join('\n');
}

const PRIMER = `You review playtest logs from ARA Driving, a driving game with free roam, quests and fuel. A scripted driver played each 10-minute session.
Rules: a delivery or passenger job pays by distance and care, a time trial pays by time and can pay nothing. Fuel costs 1 Point a litre. A session should finish about 4 to 6 quests. Running out of fuel means a free tow home, which ends the job and fills the tank to a free quarter that the log does not print, so a refuel after a tow leaves more in the tank than the litres bought, and litres burnt can exceed litres bought. A job can use a tank that was topped up this way. A job's fuel quote is what hard full-throttle driving burns, so using nearly all of it is normal. Refuel costs round part litres up and the log rounds litres, so 1 Point of difference is normal. A job can finish on an empty tank if the car coasts in; only a tow ends a job. Jobs still running when the session ends at 10:00 are normal. A scripted driver repeating the same action is normal; it does not get bored. Roadworks or a parade slow one street, so a slower stretch during those events is normal. A driver starts at rank 0, so jobs with twists only appear after the first rank up; a regular's story job is not a twist and can appear at rank 0. Fuel beyond a job's quote after a stretch of wall hits is the script ramming something, not wrong fuel maths. Stopped with no job running is waiting, not stuck. The scripted driver can wedge itself against a building off the road and repeat route recalculations; a human would steer out, so that is a known limit of the script and not a fault.
Flag only things that look like real problems: a quest that cannot be finished, long stretches of nothing, a car stuck, odd pay, wrong fuel maths, a job text that does not fit its type.
Answer with ONLY a JSON array, empty if nothing is wrong: [{"session":3,"time":"4:12","problem":"one sentence","evidence":"the exact log line"}]`;

if (process.argv[2] === '--replay') {
  console.log(digest(Number(process.argv[3])));
} else {
  mkdirSync('.qwen-runs', { recursive: true });
  const findings: unknown[] = [];
  await Promise.all(Array.from({ length: 10 }, async (_, n) => { // every batch at once: llm.ts holds them to the server's slots
    const s = n * 4, logs = [s, s + 1, s + 2, s + 3].map(digest);
    const reply = await chat([{ role: 'system', content: PRIMER }, { role: 'user', content: logs.join('\n\n') }], { temperature: 0.2 });
    const list = (parseJson(reply) ?? []) as { session?: number; problem?: string; evidence?: string }[];
    const good = list.filter((f) => typeof f.session === 'number' && typeof f.problem === 'string' && logs.some((l) => l.includes(String(f.evidence ?? '').slice(0, 30))));
    findings.push(...good);
    console.log(`sessions ${s}-${s + 3}: ${good.length} of ${list.length} findings cite the log`);
    writeFileSync('.qwen-runs/review.json', JSON.stringify(findings, null, 2));
  }));
  console.log(JSON.stringify(findings, null, 1));
}
