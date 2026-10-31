// Qwen invents one new building per type, behind schemas/buildingideas.ts. Runs of a few types at a time, repaired from the validator's
// errors; what passes is merged into drawings/ideas.json by type, so a stopped run picks up where it left off.
//   node --env-file=.env.llm tools/buildingideas.ts [--only style_old_bank,place_cafe]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildingTypes, ideaErrors, type BuildingIdea, type BuildingType } from '../schemas/buildingideas.ts';
import { chat, MODEL, parseJson } from './llm.ts';

const FILE = 'drawings/ideas.json', BATCH = 4, REPAIRS = 3;
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const styles = read('src/data/buildingstyles.json'), taken: string[] = [...styles, ...read('src/data/services.json'), ...read('src/data/stories.json')].map((s: { name: string }) => s.name);
const types = buildingTypes(styles);
mkdirSync('drawings', { recursive: true });
const ideas: BuildingIdea[] = existsSync(FILE) ? read(FILE) : [];
const todo = types.filter((t) => (only ? only.includes(t.type) : !ideas.some((i) => i.type === t.type)));
console.log(`${todo.length} of ${types.length} types to do`);

const ask = (list: BuildingType[]) => `Taken names: ${[...taken, ...ideas.map((i) => i.name)].join(', ')}.\n\nTypes:\n${list.map((t) => `- ${t.type}: ${t.brief}. storeys ${t.storeys.join('-')}, wide ${t.wide.join('-')} m, deep ${t.deep.join('-')} m${t.bays ? `, bays ${t.bays.join('-')}` : ''}`).join('\n')}`;
const errorsOf = (list: BuildingType[], got: unknown) => (Array.isArray(got) ? list.flatMap((t) => { const e = got.find((g) => g?.type === t.type); return e ? ideaErrors(e, t, [...taken, ...ideas.map((i) => i.name)]) : [`missing an entry for ${t.type}`]; }) : ['answer with a JSON array']);

for (let i = 0; i < todo.length; i += BATCH) {
  const list = todo.slice(i, i + BATCH);
  let msgs = [{ role: 'system' as const, content: readFileSync('prompts/buildingideas.txt', 'utf8') }, { role: 'user' as const, content: ask(list) }] as { role: 'system' | 'user' | 'assistant'; content: string }[];
  for (let t = 1; t <= REPAIRS + 1; t++) {
    const raw = await chat(msgs, { model: MODEL, maxTokens: 16000, temperature: 0.8 }), got = parseJson(raw), errs = errorsOf(list, got);
    console.log(`${list.map((l) => l.type).join(', ')}: try ${t}: ${errs.length ? errs.slice(0, 3).join(' | ').slice(0, 200) : 'passes'}`);
    if (!errs.length) {
      for (const l of list) { const e = (got as BuildingIdea[]).find((g) => g.type === l.type)!, at = ideas.findIndex((x) => x.type === l.type); if (at >= 0) ideas[at] = e; else ideas.push(e); } // only the types asked for
      writeFileSync(FILE, `${JSON.stringify(ideas, null, 2)}\n`);
      break;
    }
    msgs = [...msgs, { role: 'assistant', content: raw }, { role: 'user', content: `Fix these and answer the whole JSON array again:\n${errs.join('\n')}` }];
  }
}
console.log(`${ideas.length} of ${types.length} types have an idea`);
