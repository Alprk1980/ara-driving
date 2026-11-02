// Plays the sat nav and the save: route to a place, check the guidance, knock a hole in a wall, reload, and check it all came back.
//   npx vite --port 4179 &   then   node tools/savecheck.ts
import { chromium, type Page } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const check = (ok: boolean, what: string) => { if (!ok) fails++; console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`); };
const ara = <T,>(f: string) => page.evaluate(`(() => { const a = window.ara, g = a.game, p = g.player; return ${f}; })()`) as Promise<T>;
const boot = async (p: Page) => {
  await p.waitForFunction(() => (document.getElementById('loader') as HTMLElement).classList.contains('done'), undefined, { timeout: 90000 });
  await p.click('#start', { timeout: 30000 });
  await p.waitForTimeout(700);
  if (await p.locator('#picker [data-car="hatchback"]').isVisible()) await p.click('#picker [data-car="hatchback"]');
  await p.waitForTimeout(1000);
};

await page.goto('http://localhost:4179/index.html');
await boot(page);
await page.click('#btn-map');
await page.click('#satnav-open');
await page.waitForTimeout(400);
await page.screenshot({ path: 'out/satnav.png' });
const rows = await page.locator('#satnav .navlist [data-key]').count();
check(rows >= 8, `the sat nav lists nearby places: ${rows}`);
await page.click('#satnav [data-group="Cafés"]');
await page.waitForTimeout(200);
check((await page.locator('#satnav .navlist [data-key]').count()) > 0, 'a group shows its places');
await page.click('#satnav .navquick .primary');
await page.waitForTimeout(400);
check((await ara<string>('g.dest')) === 'Petrol station', `nearest petrol station is routed: ${await ara<string>('g.dest')}`);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyW');
const panel = await page.locator('#tracker').innerText();
check(/Petrol station/.test(panel) && /(turn|Arrive|Follow|U-turn|arrived)/i.test(panel) && /min/.test(panel), `the panel gives the next turn, the place and the time: ${panel.replace(/\n/g, ' | ')}`);
await page.screenshot({ path: 'out/satnav-drive.png' });

// Leave a mark on the world, then reload.
await ara(`(g.time = 200, p.dents.left = 0.5, p.marks.push({ side: 'left', at: 0, depth: 0.5 }), 0)`);
const box = await ara<number>('g.town.boxes.findIndex((b) => b.district)');
await ara(`(a.view.replayWalls([{ box: ${box}, nx: 1, nz: 0, x: g.town.boxes[${box}].x + g.town.boxes[${box}].hx, z: g.town.boxes[${box}].z, speed: 20 }]), 0)`);
check((await ara<number>('a.view.wallLog.length')) === 1, 'the wall hit is logged');
const before = await ara<{ x: number; z: number; time: number }>('(a.app.store(), { x: a.app.save.trip.x, z: a.app.save.trip.z, time: a.app.save.trip.time })');
await page.waitForTimeout(800);
await page.reload();
await boot(page);
const after = await ara<{ x: number; z: number; time: number; walls: number; dest: string; left: number }>('({ x: p.x, z: p.z, time: g.time, walls: a.view.wallLog.length, dest: g.dest, left: p.dents.left })');
check(Math.hypot(after.x - before.x, after.z - before.z) < 0.5, `the car is where it was left: ${after.x.toFixed(1)}, ${after.z.toFixed(1)} against ${before.x.toFixed(1)}, ${before.z.toFixed(1)}`);
check(after.time >= before.time, `the clock carries on: ${after.time.toFixed(0)} s`);
check(after.left === 0.5, 'the dent on the left is back');
check(after.dest === 'Petrol station', `the route is back: ${after.dest}`);
check(after.walls === 1, 'the hole in the wall is back');
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
