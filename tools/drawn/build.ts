// Writes a drawn building out to src/data/drawn behind the validator, then lays its plates over its sheet to check by eye.
//   npx vite --port 4179 --strictPort &   then   node tools/drawn/build.ts sterling_house
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildingTypes } from '../../schemas/buildingideas.ts';
import { drawnErrors } from '../../schemas/drawn.ts';
import { trianglesOf } from '../../schemas/house.ts';
import { rounded, type Drawn } from './kit.ts';

const name = process.argv[2], { building: b } = await import(`./${name}.ts`) as { building: Drawn };
const type = buildingTypes(JSON.parse(readFileSync('src/data/buildingstyles.json', 'utf8'))).find((t) => t.type === b.type)!, pieces = rounded(b.pieces), errs = drawnErrors(pieces, type, b.storeys);
const spans = { w: Math.max(...pieces.map((p) => p.x + p.w / 2)) - Math.min(...pieces.map((p) => p.x - p.w / 2)), d: Math.max(...pieces.map((p) => p.z + p.l / 2)) - Math.min(...pieces.map((p) => p.z - p.l / 2)), h: Math.max(...pieces.map((p) => p.y + p.h)) };
console.log(`${b.name}: ${pieces.length} pieces, ${trianglesOf(pieces)} triangles, ${spans.w.toFixed(1)} x ${spans.d.toFixed(1)} x ${spans.h.toFixed(1)} m`);
if (errs.length) console.log(`validator:\n  ${errs.slice(0, 14).join('\n  ')}${errs.length > 14 ? `\n  and ${errs.length - 14} more` : ''}`);
else { mkdirSync('src/data/drawn', { recursive: true }); writeFileSync(`src/data/drawn/${b.id}.json`, `${JSON.stringify({ id: b.id, type: b.type, name: b.name, storeys: b.storeys, pieces })}\n`); console.log('written'); }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4179/photovox.html');
await page.waitForFunction(() => (window as any).photovox?.plate, undefined, { timeout: 60000 });
const png = readFileSync(`drawings/sheets/${b.sheet.file}.png`), w = png.readUInt32BE(16), h = png.readUInt32BE(20), sheet = `data:image/png;base64,${png.toString('base64')}`;
const plates: string[] = [];
for (const view of ['front', 'side', 'back', 'top'] as const) plates.push(await page.evaluate(([p, v, f]) => (window as any).photovox.plate(p, v, f), [pieces, view, { w, h, span: b.span, ...b.sheet[view] }] as const) as string);
// Each panel's plate is cut to its quarter of the sheet, then shown alone and laid over the drawing.
const [model, over] = await page.evaluate(async ([list, drawing, W, H]) => {
  const load = (u: string) => new Promise<HTMLImageElement>((go) => { const i = new Image(); i.onload = () => go(i); i.src = u; });
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const a = make(), ga = a.getContext('2d')!;
  ga.fillStyle = '#fff'; ga.fillRect(0, 0, W, H);
  const areas = [[0, 0], [W / 2, 0], [0, H / 2], [W / 2, H / 2]];
  for (let i = 0; i < 4; i++) ga.drawImage(await load(list[i]), areas[i][0], areas[i][1], W / 2, H / 2, areas[i][0], areas[i][1], W / 2, H / 2);
  const c = make(), g = c.getContext('2d')!;
  g.drawImage(await load(drawing), 0, 0);
  g.globalAlpha = 0.55;
  g.drawImage(a, 0, 0);
  return [a.toDataURL('image/png'), c.toDataURL('image/png')];
}, [plates, sheet, w, h] as const);
const save = (n: string, u: string) => writeFileSync(`out/d-${b.id}-${n}.png`, Buffer.from(u.split(',')[1], 'base64'));
save('model', model); save('over', over);
await page.evaluate((p) => (window as any).photovox.pieces(p), pieces);
for (const [label, yaw, pitch] of [['iso', 0.7, 0.4], ['iso2', -2.3, 0.4]] as const) {
  await page.evaluate(([y, p]) => (window as any).photovox.aim(y, p), [yaw, pitch]);
  await page.waitForTimeout(500);
  await page.locator('#view').screenshot({ path: `out/d-${b.id}-${label}.png` });
}
console.log('page errors:', errors.length ? errors.slice(0, 4) : 'none');
await browser.close();
