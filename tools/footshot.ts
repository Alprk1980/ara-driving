// Gets out of the car, walks off down the pavement, and screenshots each camera on foot, then gets back in.
//   npx vite --port 4179 &   then   node tools/footshot.ts
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
await page.waitForTimeout(1500);
await ara('a.view.setCamera(0)');
await page.keyboard.press('f');
await page.waitForTimeout(800);
console.log('out:', await ara('JSON.stringify({ foot: !!g.foot, buttons: [...document.querySelectorAll("#actions button")].map((b) => b.textContent), speed: document.getElementById("speed").textContent })'));
await page.screenshot({ path: 'out/foot-out.png' });
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'out/foot-walk.png' });
await page.keyboard.down(' ');
await page.waitForTimeout(1500);
console.log('running:', await ara('JSON.stringify({ x: g.foot.x - p.x, z: g.foot.z - p.z, speed: g.foot.speed, running: g.foot.running })'));
await page.keyboard.up(' ');
await page.keyboard.up('ArrowUp');
for (const [i, name] of [[1, 'far'], [3, 'eyes']] as const) {
  await ara(`a.view.setCamera(${i})`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `out/foot-${name}.png` });
}
await ara('a.view.setCamera(0)');
await page.keyboard.press('f');
await page.waitForTimeout(300);
console.log('too far to get in:', await ara('!!g.foot'), await page.locator('#toast').textContent());
await ara('(g.foot.x = p.x + 2, g.foot.z = p.z)');
await page.keyboard.press('f');
await page.waitForTimeout(800);
console.log('back in:', await ara('!g.foot'));
await page.screenshot({ path: 'out/foot-in.png' });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
