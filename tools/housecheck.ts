// Holds a house to the validator, then draws its plates and lays each over the clean view it came from, to measure by eye.
//   npx vite --port 4179 --strictPort &   then   node tools/housecheck.ts src/data/house-claude.json [tag]
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { DRAWN_HOUSE, houseErrors, trianglesOf, type Piece } from '../schemas/house.ts';

const file = process.argv[2], tag = process.argv[3] ?? 'housecheck', pieces = (JSON.parse(readFileSync(file, 'utf8')) as { pieces: Piece[] }).pieces;
const errs = houseErrors(pieces, DRAWN_HOUSE);
console.log(errs.length ? `validator:\n  ${errs.join('\n  ')}` : `validator passes: ${pieces.length} pieces, ${trianglesOf(pieces)} triangles`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4179/photovox.html');
await page.waitForFunction(() => (window as any).photovox?.plate, undefined, { timeout: 60000 });
const save = (name: string, url: string) => writeFileSync(`out/${tag}-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));

for (const view of ['front', 'side', 'back', 'top'] as const) {
  const plate = await page.evaluate(([p, v]) => (window as any).photovox.plate(p, v), [pieces, view] as const) as string;
  save(view, plate);
  if (view === 'top') continue; // the top view is squashed, so it wouldn't line up
  const drawing = `data:image/png;base64,${readFileSync(`out/house-ai-${view}.png`).toString('base64')}`;
  save(`${view}-over`, await page.evaluate(async ([a, b]) => {
    const load = (u: string) => new Promise<HTMLImageElement>((go) => { const i = new Image(); i.onload = () => go(i); i.src = u; });
    const c = document.createElement('canvas');
    c.width = 1375; c.height = 768;
    const g = c.getContext('2d')!;
    g.drawImage(await load(a), 0, 0, 1375, 768);
    g.globalAlpha = 0.5;
    g.drawImage(await load(b), 0, 0);
    return c.toDataURL('image/png');
  }, [drawing, plate]));
}
await page.evaluate((p) => (window as any).photovox.pieces(p), pieces);
for (const [label, yaw, pitch] of [['iso', 0.7, 0.45], ['iso2', -2.3, 0.45]] as const) {
  await page.evaluate(([y, p]) => (window as any).photovox.aim(y, p), [yaw, pitch]);
  await page.waitForTimeout(500);
  await page.locator('#view').screenshot({ path: `out/${tag}-${label}.png` });
}
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
