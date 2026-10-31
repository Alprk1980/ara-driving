// Qwen rebuilds a building from an architect's sheet as parts, and improves it on its own. Each round it writes the pieces, the
// validator holds them to the drawing's sizes, the page renders them, and Qwen compares that with the sheet. The best round
// is kept, and what's wrong goes into the next.
//   npx vite --port 4179 --strictPort &   then   node --env-file=.env.llm tools/housebuild.ts sheet.png [--name house] [--target 8] [--rounds 5]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { houseErrors, trianglesOf, type HouseSize, type Piece } from '../schemas/house.ts';
import { chat, MODEL, parseJson } from './llm.ts';

const args = process.argv.slice(2), flag = (name: string, or: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : or; };
const sheet = args[0], views = flag('--views', '').split(',').filter(Boolean), name = // --views: clean views after the sheet, as front,back,top
 flag('--name', 'house'), target = Number(flag('--target', '8')), rounds = Number(flag('--rounds', '5'));
// From the sheet: 12 m across the front and 8.2 m to the roof, with the main roof over two-thirds of the front, eaves at 73% of the
// ridge, and six panes of glass. Its depth labels disagree with its drawing, so depth is wide.
const SIZE: HouseSize = { wide: [11, 13.5], tall: [7.5, 9], deep: [9, 15], triangles: 1200, mainRoofShare: [0.58, 0.76], eaves: [0.62, 0.8], frontWindows: 5 };
const REPAIRS = 4, BEST = `out/${name}-parts.json`;
const url = (file: string) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const image = (u: string) => ({ type: 'image_url', image_url: { url: u } });
type Msg = { role: 'system' | 'user' | 'assistant'; content: unknown };

mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4179/photovox.html');
await page.waitForFunction(() => (window as any).photovox?.pieces, undefined, { timeout: 60000 });

/** Pieces that pass the validator, repaired from its errors, or null. */
async function write(notes: string, last: Piece[] | null): Promise<Piece[] | null> {
  const ask = `Rebuild this house as pieces.${last ? `\n\nYour last version:\n${JSON.stringify(last)}\n\nA reviewer compared it with the sheet and said:\n${notes}\nFix those, keeping what was right.` : ''}`;
  let msgs: Msg[] = [{ role: 'system', content: readFileSync('prompts/house.txt', 'utf8') }, { role: 'user', content: [{ type: 'text', text: ask }, image(url(sheet)), ...views.map((f) => image(url(f)))] }];
  for (let t = 1; t <= REPAIRS; t++) {
    const raw = await chat(msgs as never, { model: MODEL, maxTokens: 20000, temperature: 0.4 }), list = parseJson(raw), errs = houseErrors(list, SIZE);
    console.log(`  draft ${t}: ${errs.length ? errs.slice(0, 3).join(' | ').slice(0, 200) : `${(list as Piece[]).length} pieces, ${trianglesOf(list as Piece[])} triangles`}`);
    if (!errs.length) return list as Piece[];
    msgs = [...msgs, { role: 'assistant', content: raw }, { role: 'user', content: `Fix these and answer the whole JSON array again:\n${errs.slice(0, 12).join('\n')}` }];
  }
  return null;
}

async function photograph(tag: string, pieces: Piece[]) {
  await page.evaluate((p) => (window as any).photovox.pieces(p), pieces);
  const out: string[] = [];
  for (const [label, yaw, pitch] of [['iso', 0.7, 0.55], ['iso2', -0.8, 0.55], ['front', 0, 0.02], ['side', Math.PI / 2, 0.02]] as const) {
    await page.evaluate(([y, p]) => (window as any).photovox.aim(y, p), [yaw, pitch]);
    await page.waitForTimeout(400);
    const file = `out/${tag}-${label}.png`;
    await page.locator('#view').screenshot({ path: file });
    out.push(file);
  }
  return out;
}

/** Qwen's comparison of the model with the sheet. */
async function review(shots: string[]) {
  const ask = `The first ${1 + views.length} images are an architect's sheet for a house${views.length ? ', then its clean front, back and top views' : ''}. The last four show a low-poly model built from them: two isometric views, then the front and the side.`.concat(' ') + ' Judge how well the model captures the house: its shape, roofs, wings, and where the windows and doors are. Plain flat colours and simple shapes are intended. Answer with ONLY a JSON object: {"score":1-10,"problems":["short specific problem"]}';
  for (let t = 0; t < 3; t++) {
    const v = parseJson(await chat([{ role: 'user', content: [{ type: 'text', text: ask }, image(url(sheet)), ...views.map((f) => image(url(f))), ...shots.map((f) => image(url(f)))] }] as never, { model: MODEL, maxTokens: 12000, temperature: 0.2 }), 'object') as { score?: number; problems?: string[] | string } | null;
    if (v && typeof v.score === 'number') return { score: v.score, problems: [v.problems ?? []].flat() };
  }
  return { score: 0, problems: ['no usable review'] };
}

let best: { score: number; pieces: Piece[]; problems: string[]; round: number } | null = existsSync(BEST) ? JSON.parse(readFileSync(BEST, 'utf8')) : null;
if (best) { // the renderer may have changed since it was judged
  const again = await review(await photograph(`${name}-again`, best.pieces));
  console.log(`the best so far, judged again: ${again.score}/10: ${again.problems.slice(0, 3).join(' | ').slice(0, 260)}`);
  best = { ...best, score: again.score, problems: again.problems };
  writeFileSync(BEST, JSON.stringify(best, null, 2));
}
let notes = best?.problems.join('; ') ?? '', last = best?.pieces ?? null;
for (let round = (best?.round ?? 0) + 1, end = round + rounds; round < end && (best?.score ?? 0) < target; round++) {
  console.log(`round ${round}`);
  const pieces = await write(notes, last);
  if (!pieces) { console.log('  no draft passed the validator'); continue; }
  const v = await review(await photograph(`${name}-p${round}`, pieces));
  console.log(`  ${v.score}/10: ${v.problems.slice(0, 3).join(' | ').slice(0, 260)}`);
  notes = v.problems.join('; ');
  last = pieces;
  if (!best || v.score > best.score) { best = { score: v.score, pieces, problems: v.problems, round }; writeFileSync(BEST, JSON.stringify(best, null, 2)); } else { best.round = round; notes = `${notes}. Your earlier version scored higher: keep to it.`; last = best.pieces; }
}
await browser.close();
console.log(best ? `${name}: best ${best.score}/10, ${best.pieces.length} pieces, ${trianglesOf(best.pieces)} triangles` : 'nothing passed');
if (errors.length) console.log('page errors:', errors);
