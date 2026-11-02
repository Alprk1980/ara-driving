// Screenshots the cockpit on the approach to a signalled junction and stopped at its line, to judge how the signals read.
//   npx vite --port 4179 &   then   node tools/cockpitshot.ts [tag]
import { chromium } from 'playwright';

const tag = process.argv[2] ?? 'cockpit';
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
// Stand on the left lane of a signalled approach, some way back from the stop line, facing the junction.
const at = (back: number) => ara(`(() => {
  const t = g.town, node = [...t.signals.keys()][2], n = t.nodes[node], w = t.adj[node][0], o = t.nodes[w.to], len = t.edges[w.edge].len;
  const dx = (n.x - o.x) / len, dz = (n.z - o.z) / len, back = ${back} + 11;
  p.place(n.x - dx * back + dz * 3, n.z - dz * back - dx * 3, Math.atan2(dx, dz));
  p.state = 'Parked';
  a.view.setCamera(3);
  return 0;
})()`);
await at(40);
await page.waitForTimeout(2500);
await page.screenshot({ path: `out/${tag}-approach.png` });
console.log('ahead:', JSON.stringify(await ara('g.road.signalAhead()')));
await at(1);
await page.waitForTimeout(400);
await page.screenshot({ path: `out/${tag}-line.png` });
console.log('at the line:', JSON.stringify(await ara('g.road.signalAhead()')));
console.log('poles on screen:', JSON.stringify(await ara(`(() => {
  const t = g.town, node = [...t.signals.keys()][2], n = t.nodes[node], cam = a.view.camera, out = [];
  for (const w of t.adj[node]) {
    const o = t.nodes[w.to], len = t.edges[w.edge].len, dx = (n.x - o.x) / len, dz = (n.z - o.z) / len;
    const v = new cam.position.constructor(n.x - dx * 11 + dz * 6.5, 2.8, n.z - dz * 11 - dx * 6.5).project(cam);
    out.push({ edge: w.edge, sx: Math.round((v.x + 1) * 550), sy: Math.round((1 - v.y) * 320), inFront: v.z < 1 });
  }
  return out;
})()`)));
// Back up, so the reversing camera comes on.
await at(30);
await page.waitForTimeout(800);
await page.keyboard.down('KeyS');
await page.waitForTimeout(2500);
await ara('(p.speed = -2, 0)'); // a test browser's phantom controller can hold the throttle, so set reverse outright
await page.waitForTimeout(60);
await page.screenshot({ path: `out/${tag}-reverse.png` });
await page.keyboard.up('KeyS');
console.log('reversing at', await ara<number>('Math.round(p.speed * 10) / 10'), 'm/s');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
