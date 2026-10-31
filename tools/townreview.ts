// The back and forth on the town's looks: drive to each district in the real game, photograph it, and have the local
// model mark what it sees. Its notes are leads, read them before acting; the agreed ones go in .qwen-runs/building-notes.txt
// and qwen-gen.ts feeds them to the next generation.
//   npx vite --port 4179 &   then   node --env-file=.env.llm tools/townreview.ts [tag] [--no-review]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { DISTRICTS, DISTRICT_IDS, districtAt } from '../src/sim/districts.ts';
import { Town } from '../src/sim/town.ts';
import { chat, MODEL, parseJson } from './llm.ts';

const tag = process.argv[2] ?? 'town', review = !process.argv.includes('--no-review');
mkdirSync('out', { recursive: true });
const town = new Town();

/** Long straight roads well inside each district: where the camera goes. */
const stops = DISTRICT_IDS.map((id) => {
  const inside = town.edges.map((e) => {
    const a = town.nodes[e.a], b = town.nodes[e.b], m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const kin = town.boxes.filter((o) => o.district === id && Math.hypot(o.x - m.x, o.z - m.z) < 90).length;
    return { a, b, m, kin, len: e.len };
  }).filter((e) => districtAt(e.m.x, e.m.z) === id).sort((p, q) => q.kin - p.kin);
  const best = inside[0];
  return { id, x: best.a.x + (best.b.x - best.a.x) * 0.3, z: best.a.z + (best.b.z - best.a.z) * 0.3, heading: Math.atan2(best.b.x - best.a.x, best.b.z - best.a.z) };
});

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage();
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:4179/index.html');
await page.waitForTimeout(1800);
await page.click('#start');
await page.waitForTimeout(800);
await page.click('#picker [data-car="hatchback"]');
await page.waitForTimeout(1200);

const shots: { id: string; file: string }[] = [];
for (const s of stops) {
  await page.evaluate((p) => { const a = (window as any).ara, c = a.game.player; c.place(p.x, p.z, p.heading); c.speed = 0; }, s);
  await page.waitForTimeout(1200);
  const file = `out/${tag}-${s.id}.png`;
  await page.screenshot({ path: file });
  shots.push({ id: s.id, file });
}
const stats = await page.evaluate(() => { const r = (window as any).ara.view.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
console.log('render:', JSON.stringify(stats), 'page errors:', errs.length ? errs : 'none');
await browser.close();

if (review) {
  const notes = await Promise.all(shots.map(async ({ id, file }) => { // a slot each
    const png = readFileSync(file).toString('base64'), d = DISTRICTS[id];
    const reply = await chat([{ role: 'user', content: [
      { type: 'text', text: `A screenshot from a bright toy-town driving game, at street level in the district "${d.name}", meant to be: ${d.character}.\nJudge the buildings only (ignore the car and the HUD). Would a driver know which district this is? Is anything broken, ugly or repetitive? Answer with ONLY a JSON object: {"reads_as":"what kind of place this looks like, a few words","score":1-10,"problems":["short specific problem", ...],"change":["short specific change to colours, windows, ground floors or roofs", ...]}` },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } },
    ] }], { model: MODEL, maxTokens: 12000, temperature: 0.2 });
    const out = parseJson(reply, 'object') as { reads_as?: string; score?: number; problems?: string[]; change?: string[] } | null;
    console.log(`${id}: ${out?.score ?? '?'}/10, reads as "${out?.reads_as ?? '?'}"\n  problems: ${(out?.problems ?? []).join(' | ')}\n  change: ${(out?.change ?? []).join(' | ')}`);
    return { id, ...out };
  }));
  writeFileSync(`.qwen-runs/townreview-${tag}.json`, JSON.stringify(notes, null, 2));
}
