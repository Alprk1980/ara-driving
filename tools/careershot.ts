// Stage C and D in the real game: wheels and lamps on the car, signing on at a base, and driving its vehicle on a shift.
// Screenshots in out/.
//   npx vite --port 4179 &   then   node tools/careershot.ts
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const ara = <T,>(f: string) => page.evaluate(`(() => { const a = window.ara, g = a.game, p = g.player; return ${f}; })()`) as Promise<T>;
await page.goto('http://localhost:4179/index.html');
await page.waitForFunction(() => (document.getElementById('loader') as HTMLElement).classList.contains('done'), undefined, { timeout: 90000 });
await page.click('#start', { timeout: 30000 });
await page.waitForTimeout(700);
if (await page.locator('#picker [data-car="hatchback"]').isVisible()) await page.click('#picker [data-car="hatchback"]');
await page.waitForTimeout(1000);
await ara('(a.wallet.earn(5000, "test"), a.view.setCamera(2))');

// Wheels and lamps: equip a sport wheel and DRLs straight onto the design, then look from the side and the front.
await ara(`(() => { const s = a.app.save; s.designs[s.car] = { ...(s.designs[s.car] ?? {}), wheels: 'gold_sport', lights: 'day_beam' }; a.view.setCar(s.designs[s.car], s.driver); })()`);
await page.waitForTimeout(800);
await page.screenshot({ path: 'out/parts-side.png' });
console.log('design:', await ara('JSON.stringify(a.app.save.designs[a.app.save.car])'));

/** Walk to a career's base and sign on with its first vehicle. */
const signOn = async (career: string, shot: string, vehicle?: string) => {
  await ara(`(() => { if (g.shift) g.signOff(); for (let i = 0; i < 600 && !g.foot; i++) if (!g.getOut()) g.step({ steer: 0, throttle: 0, brake: 0 }); const b = g.bases.find((x) => x.career === '${career}'); Object.assign(g.foot, { x: b.at.x, z: b.at.z }); })()`);
  await page.waitForTimeout(500);
  await page.keyboard.press('f');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `out/${shot}-signon.png` });
  console.log(career, 'sheet:', (await page.locator('#dialog').innerText()).replace(/\s+/g, ' ').slice(0, 220));
  await page.locator(vehicle ? `#dialog [data-car="${vehicle}"]` : '#dialog [data-car]').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `out/${shot}-chase.png` });
  console.log(career, 'driving:', await ara('p.car.id'), 'task:', await ara('g.shift?.task?.title + " / " + g.shift?.task?.text'));
};

await ara('a.view.setCamera(0)');
await signOn('bus', 'career-bus');
await ara('a.view.setCamera(3)');
await page.waitForTimeout(800);
await page.screenshot({ path: 'out/career-bus-cab.png' });
await ara('a.view.setCamera(0)');
await signOn('fire', 'career-fire');
await ara('(p.blue = true)');
for (let i = 0; i < 40; i++) { await ara('(g.step({ steer: 0, throttle: 1, brake: 0 }), 0)'); }
await page.waitForTimeout(300);
await page.screenshot({ path: 'out/career-fire-blue.png' });
console.log('blue:', await ara('p.blue'), 'tracker:', (await page.locator('#tracker').innerText()).replace(/\s+/g, ' '));
await signOn('recovery', 'career-recovery');
await signOn('mechanic', 'career-mechanic');
await signOn('ambulance', 'career-ambulance');
await ara('(g.signOff())');
await page.waitForTimeout(600);
console.log('back in:', await ara('p.car.id'));
await page.click('#btn-jobs');
await page.waitForTimeout(400);
await page.click('#careers');
await page.waitForTimeout(400);
await page.screenshot({ path: 'out/careers-list.png' });
console.log('careers:', (await page.locator('#jobs').innerText()).replace(/\s+/g, ' ').slice(0, 400));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
