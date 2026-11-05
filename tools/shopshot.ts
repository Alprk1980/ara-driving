// The shops: a café counter, buying and eating, a clothes shop and wearing what you bought, the energy chip on foot,
// and the shopping centre outside and at its counter. Screenshots in out/.
//   npx vite --port 4179 &   then   node tools/shopshot.ts
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
await ara('(a.wallet.earn(200, "test"), a.view.setCamera(0))');
await page.keyboard.press('f');
await page.waitForTimeout(400);
/** Stand at the door of the place with this id, facing it, and open it. */
const visit = async (id: string, shot: string) => {
  const ok = await ara<boolean>(`(() => {
    const d = g.doors.find((d) => { const i = g.town.plots.indexOf(d.plot); return g.content.places[i % g.content.places.length]?.id === '${id}' || (d.plot === g.town.centre?.plot && '${id}' === 'centre'); });
    if (!d) return false;
    Object.assign(g.foot, { x: d.x + Math.sin(d.heading) * 1.2, z: d.z + Math.cos(d.heading) * 1.2, heading: d.heading + Math.PI });
    return true;
  })()`);
  if (!ok) { console.log('no door for', id); return false; }
  await page.waitForTimeout(600);
  await page.keyboard.press('f');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `out/${shot}.png` });
  return true;
};
await ara('(g.energy = 0.3)');
if (await visit('tea_and_toast', 'shop-cafe')) {
  console.log('cafe:', (await page.locator('#dialog h2').textContent()), await page.locator('#dialog [data-buy]').count(), 'goods');
  await page.locator('#dialog [data-buy]').nth(3).click();
  await page.waitForTimeout(400);
  console.log('ate:', await page.locator('#toast').textContent(), 'energy', await ara('g.energy.toFixed(2)'));
  await page.screenshot({ path: 'out/shop-cafe-ate.png' });
  await page.click('#dialog #x');
}
if (await visit('sewing_basket', 'shop-clothes')) {
  await page.locator('#dialog [data-buy]').nth(0).click(); // a tee
  await page.waitForTimeout(400);
  await page.locator('#dialog [data-buy]').nth(4).click(); // trousers
  await page.waitForTimeout(400);
  await page.locator('#dialog [data-buy]').nth(6).click(); // a hat
  await page.waitForTimeout(400);
  console.log('wearing:', await ara('JSON.stringify(a.app.save?.driver ?? null)'));
  await page.screenshot({ path: 'out/shop-clothes-bought.png' });
  await page.click('#dialog #x');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'out/shop-dressed.png' });
}
for (const m of ["whistle_wrench", "sparrow_supplies"]) if (await visit(m, "shop-motor")) { console.log("motor shop:", m, await page.locator("#dialog .item").count(), "car items"); await page.click("#dialog #x"); break; }
// The centre from across its car park, then its counter.
await ara(`(() => { const c = g.town.centre, f = c.box.front, d = Math.abs(f.x) > Math.abs(f.z) ? c.box.hx : c.box.hz; Object.assign(g.foot, { x: c.box.x + f.x * (d + 30), z: c.box.z + f.z * (d + 30), heading: Math.atan2(-f.x, -f.z) }); })()`);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'out/centre-outside.png' });
if (await visit('centre', 'centre-counter')) {
  console.log('centre tabs:', await page.locator('#dialog [data-unit]').count());
  await page.locator('#dialog [data-unit]').nth(2).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'out/centre-cafe.png' });
  await page.click('#dialog #x');
}
console.log('chip:', await page.locator('#fueltext').textContent());
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
