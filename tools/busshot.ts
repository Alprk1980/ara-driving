// Waits at a bus stop on foot, rides the bus, rings the bell and gets off, then walks up to a door; screenshots each.
//   npx vite --port 4179 &   then   node tools/busshot.ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const ara = <T,>(f: string) => page.evaluate(`(() => { const a = window.ara, g = a.game, p = g.player; return ${f}; })()`) as Promise<T>;
const buttons = () => ara<string>('[...document.querySelectorAll("#actions button")].map((b) => b.textContent).join(" | ")');
await page.goto('http://localhost:4179/index.html');
await page.waitForFunction(() => (document.getElementById('loader') as HTMLElement).classList.contains('done'), undefined, { timeout: 90000 });
await page.click('#start', { timeout: 30000 });
await page.waitForTimeout(700);
if (await page.locator('#picker [data-car="hatchback"]').isVisible()) await page.click('#picker [data-car="hatchback"]');
await page.waitForTimeout(1000);
await ara('(a.wallet.earn(20, "test"), a.view.setCamera(0))');
await page.keyboard.press('f');
await page.waitForTimeout(400);
// Stand at the stop just ahead of the nearest bus on its route.
await ara(`(() => {
  const bus = g.traffic.cars.find((c) => c.role === 'bus'), stops = g.town.routes[bus.route].stops;
  const s = stops.find((q) => q.leg === bus.leg && q.along > bus.along + 40) ?? stops.find((q) => q.leg === (bus.leg + 1) % g.town.routes[bus.route].legs.length) ?? stops[0];
  Object.assign(g.foot, { x: s.x, z: s.z, heading: Math.atan2(-(s.x - bus.x), -(s.z - bus.z)) + Math.PI });
  window.mine = bus;
})()`);
await page.waitForTimeout(600);
console.log('at stop:', await ara('!!g.atStop'), await page.locator('#banner').textContent());
await page.screenshot({ path: 'out/bus-wait.png' });
await page.waitForFunction(() => !!(window as any).ara.game.busHere, undefined, { timeout: 240000 });
console.log('bus here:', await buttons());
await page.screenshot({ path: 'out/bus-here.png' });
await page.keyboard.press('f');
await page.waitForTimeout(1500);
console.log('riding:', await ara('!!g.ride'), await page.locator('#toast').textContent(), await buttons());
await page.waitForFunction(() => (window as any).ara.game.ride?.bus.dwell <= 0, undefined, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'out/bus-ride.png' });
await ara('a.view.setCamera(3)');
await page.waitForTimeout(800);
await page.screenshot({ path: 'out/bus-seat.png' });
await ara('a.view.setCamera(0)');
await page.keyboard.press('f');
await page.waitForTimeout(300);
console.log('rang:', await ara('g.ride.rang'), await page.locator('#banner').textContent());
await page.waitForFunction(() => !(window as any).ara.game.ride, undefined, { timeout: 240000 });
await page.waitForTimeout(800);
console.log('off:', await ara('JSON.stringify({ x: g.foot.x, z: g.foot.z, offRoad: g.town.offRoad(g.foot) })'));
await page.screenshot({ path: 'out/bus-off.png' });
// A door.
await ara(`(() => { const d = g.doors[3]; Object.assign(g.foot, { x: d.x + Math.sin(d.heading) * 3.5, z: d.z + Math.cos(d.heading) * 3.5, heading: d.heading + Math.PI }); })()`);
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => !!(window as any).ara.game.atDoor, undefined, { timeout: 30000 });
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);
console.log('door:', await buttons());
await page.screenshot({ path: 'out/door.png' });
await page.keyboard.press('f');
await page.waitForTimeout(500);
await page.screenshot({ path: 'out/door-card.png' });
await page.click('#dialog #x');
await page.click('#btn-pause');
await page.waitForTimeout(300);
await page.click('[data-v="look:7"]');
await page.waitForTimeout(400);
await page.screenshot({ path: 'out/look-menu.png' });
console.log('look:', await ara('a.app.save?.look ?? "?"'));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
