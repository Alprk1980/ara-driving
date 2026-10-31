// The car creator: Qwen takes one town car to a target on its own. Each round it redraws the car from the real facts and
// what reviewers said, the validator holds it to them, and the car is photographed on the lab bench and reviewed several
// times, as one score swings too much to steer by. The best car so far is kept, a worse round is rolled back, and the
// complaints reviewers repeat most go into the next round.
//   npx vite --port 4179 --strictPort &   then   node --env-file=.env.llm tools/carstudio.ts <id> [--target 8] [--rounds 6] [--reviews 3]
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

type Car = { id: string; [k: string]: unknown };
type Review = { score?: number; reads_as?: string; problems?: string[] | string; change?: string[] | string };
type Round = { round: number; mean: number; scores: number[]; car: Car; reads: string[]; kept: boolean; notes: string };

const id = process.argv[2], flag = (name: string, or: number) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) : or; };
const target = flag('--target', 8), rounds = flag('--rounds', 6), reviews = flag('--reviews', 3);
const CARS = 'src/data/towncars.json', NOTES = '.qwen-runs/car-notes.json', LOG = `.qwen-runs/studio-${id}.json`, MAX_NOTES = 8;

const cars = () => JSON.parse(readFileSync(CARS, 'utf8')) as Car[];
const car = () => { const c = cars().find((x) => x.id === id); if (!c) throw new Error(`no car ${id}`); return c; };
const putCar = (c: Car) => writeFileSync(CARS, `${JSON.stringify(cars().map((x) => (x.id === id ? c : x)), null, 2)}\n`);
const note = (text: string) => {
  const all = existsSync(NOTES) ? JSON.parse(readFileSync(NOTES, 'utf8')) as Record<string, string> : {};
  writeFileSync(NOTES, JSON.stringify({ ...all, [id]: text }, null, 2));
};
const quiet = (cmd: string) => { try { execSync(cmd, { stdio: 'pipe' }); return true; } catch (e) { console.log(`  failed: ${String((e as Error).message).slice(0, 200)}`); return false; } };

/** Render and review the car as it stands. */
function judge(tag: string) {
  if (!quiet(`node --env-file=.env.llm tools/carreview.ts ${tag} --only ${id} --runs ${reviews}`)) return null;
  const list = JSON.parse(readFileSync(`.qwen-runs/carreview-${tag}.json`, 'utf8')) as Review[], scores = list.flatMap((r) => (typeof r.score === 'number' ? [r.score] : []));
  if (!scores.length) return null;
  return { mean: scores.reduce((a, b) => a + b, 0) / scores.length, scores, list };
}

/** What the reviewers said, with what they agreed on first: one reviewer's whim shouldn't steer the next round. */
function complaints(list: Review[]) {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 4).slice(0, 4).sort().join(' ');
  const seen = new Map<string, { text: string; n: number }>();
  for (const r of list) for (const text of [r.problems ?? [], r.change ?? []].flat()) {
    const k = key(text), was = seen.get(k);
    if (was) was.n++; else seen.set(k, { text, n: 1 });
  }
  return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, MAX_NOTES).map((s) => s.text).join('; ');
}

const history: Round[] = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) as Round[] : [];
const start = history.length;
let best = history.filter((h) => h.kept).at(-1) ?? null;
if (!best) {
  const first = judge(`${id}-r0`);
  if (!first) throw new Error('the first review failed: is the dev server up?');
  best = { round: 0, mean: first.mean, scores: first.scores, car: car(), reads: first.list.map((r) => r.reads_as ?? '?'), kept: true, notes: complaints(first.list) };
  history.push(best);
  console.log(`start: ${best.mean.toFixed(1)} (${best.scores.join(' ')}), "${best.reads[0]}"`);
}
note(best.notes);

for (let n = start + 1; n <= start + rounds && best.mean < target; n++) {
  if (!quiet(`node --env-file=.env.llm tools/qwen-gen.ts towncars --replace ${id}`) || JSON.stringify(car()) === JSON.stringify(best.car)) {
    console.log(`round ${n}: no new car passed the validator`);
    continue;
  }
  const seen = judge(`${id}-r${n}`);
  if (!seen) { putCar(best.car); continue; }
  const better = seen.mean > best.mean, round: Round = { round: n, mean: seen.mean, scores: seen.scores, car: car(), reads: seen.list.map((r) => r.reads_as ?? '?'), kept: better, notes: complaints(seen.list) };
  history.push(round);
  console.log(`round ${n}: ${seen.mean.toFixed(1)} (${seen.scores.join(' ')}), "${round.reads[0]}", ${better ? 'kept' : `rolled back to ${best.mean.toFixed(1)}`}`);
  if (better) best = round; else putCar(best.car);
  note(round.notes); // a rolled-back round's complaints still say what it got wrong
  writeFileSync(LOG, JSON.stringify(history, null, 2));
}
writeFileSync(LOG, JSON.stringify(history, null, 2));
putCar(best.car);
console.log(`${id}: best ${best.mean.toFixed(1)} from round ${best.round} of ${history.length - 1}${best.mean >= target ? ', target reached' : ''}`);
