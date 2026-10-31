// Runs a job and watches the model server's slots while it does: did the work actually fill them?
//   node --env-file=.env.llm tools/slotwatch.ts node --env-file=.env.llm tools/review.ts
import { spawn } from 'node:child_process';
import { BASE } from './llm.ts';

const SAMPLE_MS = 500;
const root = BASE.replace(/\/v1$/, ''), headers = { Authorization: `Bearer ${process.env.LLM_API_KEY}` };
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) throw new Error('give a command to run');

const tally = new Map<number, number>();
let samples = 0, misses = 0, slots = 0, running = true;
const sample = async () => {
  try {
    const list = (await (await fetch(`${root}/slots`, { headers, signal: AbortSignal.timeout(2000) })).json()) as { is_processing: boolean }[];
    slots = list.length;
    const busy = list.filter((s) => s.is_processing).length;
    tally.set(busy, (tally.get(busy) ?? 0) + 1);
    samples++;
  } catch { misses++; }
};
const t0 = Date.now();
const job = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
job.on('exit', () => { running = false; });
while (running) {
  await sample();
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
}
const seconds = (Date.now() - t0) / 1000, sum = [...tally].reduce((n, [busy, count]) => n + busy * count, 0);
console.log(`\n${seconds.toFixed(0)} s, ${samples} samples of ${slots} slots${misses ? `, ${misses} missed` : ''}`);
for (let b = slots; b >= 0; b--) {
  const share = (tally.get(b) ?? 0) / (samples || 1);
  console.log(`${b} busy  ${'#'.repeat(Math.round(share * 40)).padEnd(40)} ${Math.round(share * 100)}%`);
}
console.log(`on average ${(sum / (samples || 1)).toFixed(2)} of ${slots} slots in use, ${Math.round((sum / (samples || 1) / (slots || 1)) * 100)}% of capacity`);
