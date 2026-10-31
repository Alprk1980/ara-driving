// Opens every model in the gallery in a real browser, and fails any that errors or draws nothing.
//   npx vite --port 4179 --strictPort &   then   node tools/gallerycheck.ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 720 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4179/gallery.html');
await page.waitForFunction(() => (window as any).gallery, undefined, { timeout: 60000 });
const ids = await page.evaluate(() => (window as any).gallery.ids) as string[];
const bad: string[] = [], groups = new Set<string>();
let biggest = { id: '', tris: 0 };
for (const id of ids) {
  const r = await page.evaluate((i) => { try { return (window as any).gallery.open(i); } catch (e) { return { error: (e as Error).message }; } }, id) as { error?: string; size: number[]; tris: number; calls: number };
  if (r.error) { bad.push(`${id}: ${r.error}`); continue; }
  if (!r.tris || Math.min(...r.size) <= 0 || !r.size.every(Number.isFinite)) bad.push(`${id}: nothing drawn (${r.tris} triangles, ${r.size.join(' x ')})`);
  if (r.tris > biggest.tris) biggest = { id, tris: r.tris };
  const group = await page.textContent('#kind');
  if (group && !groups.has(group)) { groups.add(group); await page.waitForTimeout(300); await page.screenshot({ path: `out/gallery-${groups.size}.png` }); }
}
console.log(`${ids.length} models in ${groups.size} groups: ${[...groups].join(', ')}`);
console.log(`heaviest: ${biggest.id}, ${biggest.tris} triangles`);
await page.fill('#search', 'bus');
console.log('search "bus":', await page.textContent('#total'));
console.log(bad.length ? `FAILED:\n${bad.join('\n')}` : 'every model drew');
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
if (bad.length || errors.length) process.exit(1);
