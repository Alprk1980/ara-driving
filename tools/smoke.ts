// Plays the real build in a phone-sized browser through its real buttons, and saves a screenshot of each stage.
//   npx vite preview --port 4179 &   then   node tools/smoke.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = 'http://localhost:4179/';
mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: false, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = (n: string) => page.screenshot({ path: `out/${n}.png` });
const wait = (ms: number) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => { const a = (window as any).ara; const p = a.game.player; return { x: Math.round(p.x), z: Math.round(p.z), kmh: Math.round(p.kmh), fuel: +p.fuel.toFixed(1), state: p.state, quest: a.game.quest?.offer.title ?? null, points: a.wallet.points(), cam: a.view.index }; });
const step = (s: string, v?: unknown) => console.log(s, v ? JSON.stringify(v) : '');

await page.goto(URL);
await page.waitForSelector('#start');
await wait(800);
await shot('01-title');
await page.click('#start');
await wait(500);
await shot('02-picker'); // fresh saves always start with the car picker
await page.click('#picker [data-car]');
await wait(600);
await page.evaluate(() => (window as any).ara.app.applyScheme('joystick'));
step('started', await state());
await shot('02-home');

await page.click('#btn-jobs');
await wait(200);
await shot('03-jobs');
await page.click('#jobs [data-id]');
await wait(300);
step('quest taken', await state());

const go = page.locator('#pad-go');
const box = (await go.boundingBox())!;
await page.mouse.move(box.x + 30, box.y + 30);
await page.mouse.down();
await wait(3500);
step('held Go', await state());
await shot('04-chase-near');
await page.mouse.up();
await page.evaluate(() => { (window as any).ara.app.held.go = true; });
for (const [i, n] of (['05-chase-far', '06-side', '07-cockpit'] as const).entries()) {
  await page.click('#btn-cam');
  await wait(600);
  await shot(n);
  step(`camera ${i + 1}`, await state());
}
await page.click('#btn-cam');
await page.evaluate(() => { (window as any).ara.app.held.go = false; });

await page.click('#btn-map');
await wait(300);
await page.mouse.click(250, 200);
await wait(200);
await shot('08-map');
await page.click('#ft-home');
await wait(200);
await shot('09-forfeit');
await page.click('#dialog #yes');
await wait(400);
step('fast travelled', await state());

await page.evaluate(() => (window as any).ara.wallet.earn(6000));
await page.evaluate(() => (window as any).ara.app.refreshPoints());
await wait(200);
await page.click('#actions button');
await wait(300);
await page.click('[data-tab="paint"]');
await page.click('#garage [data-item]');
await page.click('[data-tab="pattern"]');
await page.locator('#garage [data-item]').nth(5).click();
await page.click('[data-tab="decal"]');
await page.locator('#garage [data-item]').nth(5).click();
await page.click('[data-tab="body"]');
await page.locator('#garage [data-item]').nth(4).click();
await page.click('[data-tab="outfit"]');
await page.locator('#garage [data-item]').nth(5).click();
await page.click('[data-tab="accessory"]');
await page.locator('#garage [data-item]').first().click();
await wait(500);
await shot('10-garage');
await page.click('[data-tab="cars"]');
await page.click('[data-car="taxi"]');
await wait(500);
await shot('11-taxi');
await page.click('#garage #x');
await wait(300);
step('bought', await state());

await page.click('#btn-pause');
await wait(200);
await page.click('[data-v="hand:left"]');
await wait(100);
await page.click('[data-v="input:dpad"]');
await wait(200);
await shot('12-menu');
await page.click('#pause #x');
await wait(300);
await shot('13-left-dpad');

await page.evaluate(() => { const a = (window as any).ara; a.game.player.fuel = 0.3; a.app.held.go = true; });
await wait(4000);
await page.evaluate(() => { (window as any).ara.app.held.go = false; });
await wait(9000);
await shot('14-stranded');
step('out of fuel', await state());
await page.click('#tow');
await wait(400);
step('towed', await state());
await shot('15-towed');
await page.click('#btn-cam'); await wait(400); await page.click('#btn-cam'); await wait(400); await page.click('#btn-cam'); await wait(600);
await shot('16-cockpit-parked');
await page.click('#btn-map');
await wait(200);
await page.click('#ft-station');
await wait(500);
step('at station', await state());
await page.click('#actions button');
await wait(300);
await shot('17-fuel');
await page.click('#fuelshop .primary');
await wait(200);
step('filled', await state());
await page.click('#fuelshop #x');
await wait(300);
await shot('18-station');

await page.evaluate(() => (window as any).ara.app.store());
await wait(300);
await page.reload();
await page.waitForSelector('#start');
await wait(500);
step('reloaded', await page.evaluate(() => { const a = (window as any).ara; const s = a.app.save; return { car: s.car, hand: s.hand, input: s.input, points: a.wallet.points(), design: s.designs.hatchback, owns: a.wallet.player.games.ara_driving }; }));

console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'no console errors');
await browser.close();
