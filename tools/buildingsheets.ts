// Has Gemini draw each idea in drawings/ideas.json as a four-view sheet, in the style of the house sheet, for building as pieces. Billed
// per image to the key in .env.llm, so nothing runs without --yes, a sheet already drawn is left alone, and a failure is reported, not
// retried. The prompt rules out what went wrong on the house sheet: a side view in false perspective, and views that disagree.
//   node --env-file=.env.llm tools/buildingsheets.ts --yes [--only style_old_bank,place_cafe]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { BuildingIdea } from '../schemas/buildingideas.ts';

const STYLE = 'out/house-ai-sheet.png', DIR = 'drawings/sheets', GAP_MS = 60000; // the gap between calls, to stay under any per-minute quota
const args = process.argv.slice(2), only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const ideas = (JSON.parse(readFileSync('drawings/ideas.json', 'utf8')) as BuildingIdea[]).filter((i) => !only || only.includes(i.type));
mkdirSync(DIR, { recursive: true });

const prompt = (i: BuildingIdea) => `The attached sheet shows only the drawing style and the layout to copy. Do not copy its building.

Draw a new building, as a clean architect's colour elevation sheet in exactly that style: crisp thin dark outlines, flat soft colours, a pure white background, and the same four panels.
Top left: FRONT elevation. Top right: RIGHT SIDE elevation. Bottom left: BACK elevation. Bottom right: ROOF PLAN from directly above, with the front of the building at the bottom.

The building: ${i.name}. ${i.concept}
${i.storeys} ${i.storeys === 1 ? 'storey' : 'storeys'}, ${i.wide} m wide and ${i.deep} m deep, in a British town. Roof form: ${i.roof}. Walls: ${i.walls}.${i.bays ? ` ${i.bays} vehicle bay ${i.bays === 1 ? 'door' : 'doors'} on the front.` : ''}
Features: ${i.features.join('; ')}.

Rules for every panel:
- Strictly orthographic and square-on, with no perspective at all. In the side elevation the front wall is seen exactly edge-on, so no part of the front face shows.
- All four views are one building and must agree: the same roof form, heights, widths and depth, and each feature in the same place in every view that can see it. The side view's width is the true depth, and the roof plan has true proportions.
- All panels are at the same scale, with a standing-height front door about 2 m tall as the guide.
- Show every window and door on all sides, at realistic British sizes.
- Shapes simple enough to build from boxes and sloped roofs.
- No text, labels, dimensions, title block, people, vehicles, trees, plants, ground shadows or cast shadows.`;

const waiting = ideas.filter((i) => !existsSync(`${DIR}/${i.type}.png`));
console.log(`${ideas.length} ideas, ${waiting.length} to draw`);
if (!args.includes('--yes')) { console.log('nothing drawn: this is billed, so pass --yes'); process.exit(0); }
const failed: string[] = [];
for (const i of waiting) {
  try { execFileSync(process.execPath, ['--env-file=.env.llm', 'tools/geminiimage.ts', prompt(i), `${DIR}/${i.type}.png`, '--from', STYLE], { stdio: ['ignore', 'pipe', 'pipe'] }); console.log(`drew ${i.type}: ${i.name}`); }
  catch (e) { failed.push(i.type); const why = String((e as { stderr?: Buffer }).stderr ?? e); console.log(`FAILED ${i.type}: ${/Error: (\d+)/.exec(why)?.[1] ?? ''} ${/"message": "(.*?)"/.exec(why)?.[1]?.slice(0, 300) ?? why.slice(-300)}`); }
  await new Promise((go) => setTimeout(go, GAP_MS));
}
console.log(`${waiting.length - failed.length} drawn, ${failed.length} failed${failed.length ? `: ${failed.join(', ')}` : ''}`);
