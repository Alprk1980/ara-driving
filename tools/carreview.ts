// The town cars and the cockpit, photographed in the real game and judged by the local model, a slot each. Its notes are
// leads: look at the picture before acting on one.
//   npx vite --port 4179 &   then   node --env-file=.env.llm tools/carreview.ts [tag]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { chat, MODEL, parseJson } from './llm.ts';

const tag = process.argv[2] ?? 'cars';
const fleet = process.argv.includes('--fleet'); // the buses and emergency vehicles instead of the town cars
const flag = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = flag('--only'), runs = Number(flag('--runs') ?? 1); // one car, reviewed several times, as a single score swings too much to steer by
const cars = (JSON.parse(readFileSync(fleet ? 'src/data/fleet.json' : 'src/data/towncars.json', 'utf8')) as { id: string; name: string }[]).filter((c) => !only || c.id === only);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 760 } })).newPage();
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4179/index.html');
await page.waitForFunction(() => document.getElementById('loader')!.classList.contains('done'), undefined, { timeout: 60000 });
await page.waitForTimeout(800);
await page.click('#start');
await page.waitForTimeout(700);
await page.click('#picker [data-car="hatchback"]', { timeout: 60000 });
await page.waitForTimeout(1200);

const shots: { files: string[]; ask: string }[] = [];
await page.evaluate(() => { const a = (window as any).ara; a.game.player.place(1500, 1500, 0); a.view.index = 3; a.view.applyRig(); });
await page.waitForTimeout(1600);
if (!fleet && !only) shots.push({ files: [`out/${tag}-cockpit.png`], ask: "The driver's view from inside a right-hand-drive car in a toy-town driving game, on a road where traffic keeps left. It should read as sitting in a real car: bonnet, windscreen pillars, dashboard, gauges behind the steering wheel, hands on the wheel, mirror. Ignore the HUD." });
if (!fleet && !only) await page.screenshot({ path: shots[0].files[0] });

// One car alone on the bench, from the side and three-quarters: nothing to mistake it for.
await page.goto('http://localhost:4179/labs.html');
await page.waitForFunction(() => (window as any).bench, undefined, { timeout: 60000 });
await page.waitForTimeout(800);
await page.click('#labs button:has-text("Town cars")');
await page.click('#guides');
const canvas = page.locator('#view');
for (const car of cars) {
  await page.selectOption('#car', car.id);
  const files: string[] = [];
  for (const [view, name] of [['Side', 'side'], ['Three-quarter', 'three']]) {
    await page.click(`#views button:has-text("${view}")`);
    await page.waitForFunction(() => (window as any).bench.orbit.settled, undefined, { timeout: 15000 });
    await page.waitForTimeout(200);
    const file = `out/${tag}-${car.id}-${name}.png`;
    await canvas.screenshot({ path: file });
    files.push(file);
  }
  shots.push({ files, ask: `A simple low-poly ${fleet ? 'vehicle' : 'town car'} from a toy-town British driving game, shown alone from the side and at three-quarters, nose to the left. It is meant to be a ${car.name}. Judge the ${fleet ? 'shape and the livery: UK emergency vehicles wear Battenburg checks, blue and yellow for police, green and yellow for ambulance, red and yellow for fire' : 'shape only'}; plain flat colours and simple wheels are intended.` });
}
await browser.close();

const notes = await Promise.all(shots.flatMap((shot) => Array.from({ length: runs }, () => shot)).map(async ({ files, ask }) => {
  const reply = await chat([{ role: 'user', content: [
    { type: 'text', text: `${ask}\nDoes it look right? Answer with ONLY a JSON object: {"reads_as":"what it looks like, a few words","score":1-10,"problems":["short specific problem"],"change":["short specific change to its shape or proportions"]}` },
    ...files.map((file) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${readFileSync(file).toString('base64')}` } })),
  ] }], { model: MODEL, maxTokens: 12000, temperature: 0.2 });
  const out = parseJson(reply, 'object') as { reads_as?: string; score?: number; problems?: string[]; change?: string[] } | null;
  console.log(`${files[0]}: ${out?.score ?? '?'}/10, "${out?.reads_as ?? '?'}"\n  ${[out?.problems ?? []].flat().join(' | ')}\n  > ${[out?.change ?? []].flat().join(' | ')}`); // the model sometimes answers with one string, not a list
  return { files, ...out };
}));
writeFileSync(`.qwen-runs/carreview-${tag}.json`, JSON.stringify(notes, null, 2));
// Each car's notes, for the generator's next round.
const forCars = Object.fromEntries(cars.map((car) => { const n = notes.find((x) => x.files[0].includes(`-${car.id}-`)); return [car.id, [n?.problems ?? [], n?.change ?? []].flat(2).join('; ')]; }));
const notesFile = '.qwen-runs/car-notes.json', older = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, 'utf8')) : {};
writeFileSync(notesFile, JSON.stringify({ ...older, ...forCars }, null, 2));
console.log('scores:', notes.map((n) => n.score ?? '?').join(' '));
if (only) { const s = notes.flatMap((n) => (typeof n.score === 'number' ? [n.score] : [])); console.log(`mean ${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)} of ${s.length}`); }
console.log('page errors:', errs.length ? errs : 'none');
