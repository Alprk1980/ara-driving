// One round of the car loop: redraw every town car from the last review's notes, then photograph and review them.
//   npx vite --port 4179 &   then   node --env-file=.env.llm tools/carround.ts <tag>
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const tag = process.argv[2] ?? 'round';
const cars = JSON.parse(readFileSync('src/data/towncars.json', 'utf8')) as { id: string }[];
const last = process.argv[3];
if (last && existsSync(`.qwen-runs/carreview-${last}.json`)) { // start from an earlier review's notes, if asked
  const notes = JSON.parse(readFileSync(`.qwen-runs/carreview-${last}.json`, 'utf8')) as { files: string[]; problems?: string[]; change?: string[] }[];
  writeFileSync('.qwen-runs/car-notes.json', JSON.stringify(Object.fromEntries(cars.map((c) => { const n = notes.find((x) => x.files[0].includes(`-${c.id}-`)); return [c.id, [...(n?.problems ?? []), ...(n?.change ?? [])].join('; ')]; })), null, 2));
}
const run = (cmd: string) => execSync(cmd, { stdio: 'inherit' });
run(`node --env-file=.env.llm tools/qwen-gen.ts towncars --replace ${cars.map((c) => c.id).join(',')}`);
run(`node --env-file=.env.llm tools/carreview.ts ${tag}`);
