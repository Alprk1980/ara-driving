// Route numbers: the stop's flag and countdown while you wait, then the bus coming in with its number lit.
//   npx vite --port 4179 &   then   node tools/busnumshot.ts
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
await ara('(a.wallet.earn(20, "test"), a.view.setCamera(0))');
await page.keyboard.press('f');
await page.waitForTimeout(400);
// Stand a few metres up the road from a stop, looking back along it at the flag, the way the bus will come.
await ara(`(() => {
  const bus = g.traffic.cars.find((c) => c.role === 'bus'), r = g.town.routes[bus.route], stops = r.stops;
  const s = stops.find((q) => q.leg === bus.leg && q.along > bus.along + 60) ?? stops.find((q) => q.leg === (bus.leg + 1) % r.legs.length) ?? stops[0];
  const e = g.town.edges[s.edge], b = g.town.nodes[s.to], o = g.town.nodes[e.a === s.to ? e.b : e.a], dx = (b.x - o.x) / e.len, dz = (b.z - o.z) / e.len;
  Object.assign(g.foot, { x: s.x + dx * 10 + dz * 1.8, z: s.z + dz * 10 - dx * 1.8, heading: Math.atan2(-dx, -dz) }); // up the pavement past the flag, looking back
  window.hail = { x: s.x + dx * 3 - dz * 0.8, z: s.z + dz * 3 + dx * 0.8, heading: Math.atan2(-dx, -dz) }; // at the kerb by the flag, in reach of the stop
  window.mine = bus; window.stop = s;
})()`);
await page.waitForTimeout(1500);
console.log('board:', await page.locator('#speed').textContent(), '|', await page.locator('#banner').textContent());
await page.screenshot({ path: 'out/busnum-flag.png' });
await ara('Object.assign(g.foot, window.hail)');
await page.waitForTimeout(800);
console.log('hailing:', await page.locator('#speed').textContent());
await page.screenshot({ path: 'out/busnum-stop.png' });
await page.waitForFunction(() => { const w = window as any, b = w.mine, s = w.stop; return Math.hypot(b.x - s.x, b.z - s.z) < 35; }, undefined, { timeout: 240000 });
console.log('coming:', await page.locator('#speed').textContent());
await page.screenshot({ path: 'out/busnum-coming.png' });
await page.waitForFunction(() => (window as any).mine.dwell > 0, undefined, { timeout: 60000 });
await page.waitForTimeout(300);
await page.screenshot({ path: 'out/busnum-here.png' });
await page.waitForFunction(() => (window as any).ara.game.busHere, undefined, { timeout: 20000 });
await page.keyboard.press('f');
await page.waitForTimeout(1500);
console.log('riding:', await page.locator('#speed').textContent(), '|', await page.locator('#toast').textContent());
await page.waitForFunction(() => (window as any).ara.game.ride?.bus.dwell <= 0, undefined, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'out/busnum-ride.png' });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
