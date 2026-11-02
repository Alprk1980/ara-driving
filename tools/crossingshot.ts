// Screenshots a pelican and a puffin from a car stopped before them, with someone waiting so the lights change.
//   npx vite --port 4179 &   then   node tools/crossingshot.ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const ara = <T,>(f: string) => page.evaluate(`(() => { const a = window.ara, g = a.game, p = g.player; return ${f}; })()`) as Promise<T>;
await page.goto('http://localhost:4179/index.html');
await page.waitForFunction(() => (document.getElementById('loader') as HTMLElement).classList.contains('done'), undefined, { timeout: 90000 });
await page.click('#start', { timeout: 30000 });
await page.waitForTimeout(700);
if (await page.locator('#picker [data-car="hatchback"]').isVisible()) await page.click('#picker [data-car="hatchback"]');
await page.waitForTimeout(1000);
for (const kind of ['pelican', 'puffin']) {
  const found = await ara<number>(`(() => {
    const z = g.town.zebras.find((q) => q.kind === '${kind}');
    if (!z) return 0;
    p.place(z.x - z.ux * 25 + z.uz * 3, z.z - z.uz * 25 - z.ux * 3, Math.atan2(z.ux, z.uz));
    p.state = 'Parked';
    a.view.setCamera(0);
    g.walkers.lights.get(z).press();
    return 1;
  })()`);
  if (!found) { console.log(`no ${kind} in the town`); continue; }
  await page.waitForFunction((k) => { const a = (window as any).ara, l = a.game.walkers.lights.get(a.game.town.zebras.find((q: any) => q.kind === k)); return l.man === "green"; }, kind, { timeout: 120000 }); // amber, then red with the green man; a test browser runs slowly
  console.log(kind, await ara<string>(`(() => { const l = g.walkers.lights.get(g.town.zebras.find((q) => q.kind === '${kind}')); return l.traffic + ' / ' + l.man; })()`), 'dash:', JSON.stringify(await ara('g.road.signalAhead()')));
  await page.screenshot({ path: `out/crossing-${kind}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
