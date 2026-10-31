// Real multi-touch on an emulated phone: one thumb on Go, the other steering. Checks every scheme and both hands.
//   npx vite preview --port 4179 &   then   node tools/touch-test.ts
import { chromium, type CDPSession, type Page } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const errors: string[] = [];

type Touch = { x: number; y: number; id: number };
const send = (c: CDPSession, type: string, touchPoints: Touch[]) => c.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints });
const centre = async (p: Page, sel: string) => { const b = (await p.locator(sel).boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const read = (p: Page) => p.evaluate(() => { const a = (window as any).ara, c = a.game.player; return { heading: c.heading, speed: c.speed, scheme: a.app.save.input, hand: a.app.save.hand }; });

async function fresh() {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4179/');
  await page.waitForSelector('#start');
  await page.waitForTimeout(500);
  await page.tap('#start');
  await page.waitForTimeout(400);
  return { page, cdp: await ctx.newCDPSession(page) };
}

async function drive(scheme: string, hand: string) {
  const { page, cdp } = await fresh();
  await page.evaluate(([s, h]) => { const a = (window as any).ara; a.app.save.hand = h; document.body.dataset.hand = h; return a.app.applyScheme(s); }, [scheme, hand]);
  await page.waitForTimeout(200);
  const go = await centre(page, '#pad-go');
  await send(cdp, 'touchStart', [{ ...go, id: 1 }]);
  await page.waitForTimeout(1500);
  const before = await read(page);
  // Steer right with the second thumb while the first stays down.
  if (scheme === 'joystick') {
    const s = hand === 'left' ? { x: 620, y: 300 } : { x: 200, y: 300 };
    await send(cdp, 'touchStart', [{ ...go, id: 1 }, { ...s, id: 2 }]);
    for (let d = 10; d <= 60; d += 10) await send(cdp, 'touchMove', [{ ...go, id: 1 }, { x: s.x + d, y: s.y, id: 2 }]);
  } else {
    const r = await centre(page, '#pad-right');
    await send(cdp, 'touchStart', [{ ...go, id: 1 }, { ...r, id: 2 }]);
  }
  await page.waitForTimeout(900);
  const after = await read(page);
  await send(cdp, 'touchEnd', []);
  await page.waitForTimeout(300);
  const released = await page.evaluate(() => { const a = (window as any).ara; return { go: a.app.held.go, right: a.app.held.right, steer: a.app.router.intent.steer }; });
  const turnedRight = after.heading < before.heading - 0.1;
  console.log(`${scheme} ${hand}: ${before.speed.toFixed(1)} m/s, heading ${before.heading.toFixed(2)} -> ${after.heading.toFixed(2)}, ${turnedRight ? 'turned right' : 'DID NOT TURN RIGHT'}, released ${JSON.stringify(released)}`);
  if (!turnedRight || released.go || released.right) errors.push(`${scheme} ${hand} failed`);
  await page.close();
}

for (const hand of ['right', 'left']) for (const scheme of ['joystick', 'dpad']) await drive(scheme, hand);
console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'all touch checks passed');
await browser.close();
