// Drives the labs bench in a headless browser and measures it: does each view frame the car, does dragging turn it
// the way the hand moves, do switching and resizing keep the frame, and does a crash really take voxels off.
//   npx vite --port 4179 &   then   node tools/labsim.ts [tag]   (screenshots land in out/)
import { chromium, type Page } from 'playwright';

const tag = process.argv[2] ?? 'labsim';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1300, height: 760 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const wait = (ms: number) => page.waitForTimeout(ms);
/** Until the camera's easing has landed. */
const settle = async () => { await page.waitForFunction(() => (window as any).bench.orbit.settled, undefined, { timeout: 15000 }); await wait(80); };
let fails = 0;
const check = (ok: boolean, what: string) => { if (!ok) fails++; console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`); };

type Frame = { minX: number; maxX: number; minY: number; maxY: number; aspect: number; canvasAspect: number; dist: number };

/** Where the car's solid parts land on screen, -1..1 each way; every voxel instance is measured, guides are not. */
const frame = (p: Page) => p.evaluate(() => {
  const b = (window as any).bench, cam = b.camera;
  cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const V = cam.position.constructor, M = cam.matrixWorld.constructor;
  const v = new V(), m = new M();
  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  const add = () => { v.project(cam); minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); };
  b.stage.updateMatrixWorld(true);
  b.stage.traverseVisible((o: any) => {
    if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); v.setFromMatrixPosition(m); add(); }
    else if (o.isMesh && !o.isLine) {
      const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 300));
      for (let i = 0; i < a.count; i += step) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); add(); }
    }
  });
  return { minX, maxX, minY, maxY, aspect: cam.aspect, canvasAspect: b.canvas.clientWidth / b.canvas.clientHeight, dist: b.orbit.dist } as Frame;
});
const inFrame = (f: Frame) => f.minX >= -1 && f.maxX <= 1 && f.minY >= -1 && f.maxY <= 1;
const fill = (f: Frame) => Math.max(f.maxX - f.minX, f.maxY - f.minY) / 2;
const stageBox = async () => (await page.locator('#view').boundingBox())!;
const dragBy = async (dx: number, dy: number) => {
  const b = await stageBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 6 }); await page.mouse.up();
  await settle();
};
/** The screen position of a point on the car, to see which way it moves. */
const screenOf = (x: number, y: number, z: number) => page.evaluate(([px, py, pz]) => {
  const b = (window as any).bench, cam = b.camera;
  cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const v = new cam.position.constructor(px, py, pz).project(cam);
  return { x: v.x, y: v.y, behind: new cam.position.constructor(px, py, pz).sub(cam.position).dot(cam.getWorldDirection(new cam.position.constructor())) };
}, [x, y, z]);

/** How far the car's skin has been bent from the shape it started in: vertices moved, and the deepest move in metres. */
const bent = () => page.evaluate(() => {
  const b = (window as any).bench;
  let moved = 0, deepest = 0;
  const base: Map<string, Float32Array> = ((window as any).__base ??= new Map());
  const seen = new Set<unknown>();
  b.stage.traverse((o: any) => {
    const a = o.geometry?.attributes?.position;
    if (!o.isMesh || !a || a.count < 400 || seen.has(a)) return;
    seen.add(a);
    if (!base.has(a.uuid ?? o.uuid)) base.set(a.uuid ?? o.uuid, a.array.slice());
    const was = base.get(a.uuid ?? o.uuid)!;
    for (let i = 0; i < a.count; i++) {
      const d = Math.hypot(a.array[i * 3] - was[i * 3], a.array[i * 3 + 1] - was[i * 3 + 1], a.array[i * 3 + 2] - was[i * 3 + 2]);
      if (d > 1e-4) moved++;
      deepest = Math.max(deepest, d);
    }
  });
  return { moved, deepest };
});

await page.goto('http://localhost:4179/labs.html');
await page.waitForFunction(() => (window as any).bench);
await wait(900);
const cars = await page.$$eval('#car option', (o) => o.map((x) => (x as HTMLOptionElement).value));
const views = ['Three-quarter', 'Side', 'Front', 'Rear', 'Top'];

console.log('\n-- framing: every car, every view, wholly on screen and filling it --');
for (const id of cars) {
  await page.selectOption('#car', id);
  await wait(250);
  for (const view of views) {
    await page.click(`#views button:has-text("${view}")`);
    await settle();
    const f = await frame(page);
    check(inFrame(f) && fill(f) > 0.5, `${id} ${view}: x ${f.minX.toFixed(2)}..${f.maxX.toFixed(2)} y ${f.minY.toFixed(2)}..${f.maxY.toFixed(2)} fill ${fill(f).toFixed(2)}`);
  }
}
await page.selectOption('#car', cars[0]);
await page.click('#views button:has-text("Side")');
await settle();
await page.screenshot({ path: `out/${tag}-side.png` });

console.log('\n-- switching cars keeps the framing --');
await page.selectOption('#car', 'supercar');
await settle();
{ const f = await frame(page); check(inFrame(f), `Side, hatchback to supercar: x ${f.minX.toFixed(2)}..${f.maxX.toFixed(2)}`); }

console.log('\n-- rotation follows the hand --');
await page.click('#views button:has-text("Three-quarter")');
await settle();
{
  const a0 = await page.evaluate(() => { const o = (window as any).bench.orbit; return { azim: o.azim, elev: o.elev }; });
  const before = await screenOf(0, 1.4, 0.4), nearSide = (await screenOf(0.9, 0.6, 0)).behind < (await screenOf(-0.9, 0.6, 0)).behind ? 0.9 : -0.9;
  const near0 = await screenOf(nearSide, 0.6, 0);
  await dragBy(80, 0);
  const near1 = await screenOf(nearSide, 0.6, 0);
  check(near1.x > near0.x, `drag right moves the near side right: ${near0.x.toFixed(3)} to ${near1.x.toFixed(3)}`);
  await dragBy(0, 60);
  const a1 = await page.evaluate(() => { const o = (window as any).bench.orbit; return { azim: o.azim, elev: o.elev }; });
  check(a1.elev > a0.elev, `drag down tips the camera over the car: elev ${a0.elev.toFixed(2)} to ${a1.elev.toFixed(2)}`);
  await dragBy(0, -3000);
  const a2 = await page.evaluate(() => (window as any).bench.orbit.elev);
  check(a2 > -0.05, `can't drag under the floor: elev ${a2.toFixed(2)}`);
  await dragBy(0, 3000);
  const a3 = await page.evaluate(() => (window as any).bench.orbit.elev);
  check(a3 < Math.PI / 2, `can't flip over the top: elev ${a3.toFixed(2)}`);
  void before;
}

console.log('\n-- free look comes back to a framed car --');
await page.click('#views button:has-text("Three-quarter")');
await settle();
await page.click('#cammode');
await page.keyboard.down('KeyW'); await wait(500); await page.keyboard.up('KeyW');
await page.click('#cammode');
await settle();
{ const f = await frame(page); check(inFrame(f), `after flying off, Orbit: x ${f.minX.toFixed(2)}..${f.maxX.toFixed(2)} y ${f.minY.toFixed(2)}..${f.maxY.toFixed(2)}`); }

console.log('\n-- the picture stays true to the canvas --');
for (const [width, height] of [[1300, 760], [1000, 500], [1700, 900], [420, 800]]) {
  await page.setViewportSize({ width, height });
  await wait(600);
  await page.click('#views button:has-text("Side")');
  await settle();
  const f = await frame(page);
  check(Math.abs(f.aspect - f.canvasAspect) < 0.02 && inFrame(f), `${width}x${height}: camera ${f.aspect.toFixed(2)}, canvas ${f.canvasAspect.toFixed(2)}, x ${f.minX.toFixed(2)}..${f.maxX.toFixed(2)}`);
}
await page.setViewportSize({ width: 1300, height: 760 });
await wait(400);

console.log('\n-- the car under the Damage lab tab --');
await page.click('#labs button:has-text("Damage")');
await wait(500);
await page.click('#views button:has-text("Three-quarter")');
await settle();
await page.fill('#spd', '110');
await page.dispatchEvent('#spd', 'input');
for (const [side, angle] of [['front', 0], ['back', 180], ['left', 90], ['right', 270]] as const) {
  await page.evaluate(() => { (window as any).__base = undefined; });
  await bent();
  await page.fill('#ang', String(angle));
  await page.dispatchEvent('#ang', 'input');
  await page.click('#crash');
  await wait(200);
  const after = await bent();
  const pct = await page.textContent(`#pct-${side}`);
  check(after.moved > 200 && after.deepest > 0.1, `${side} at 110 km/h (${pct}): ${after.moved} vertices bent, ${after.deepest.toFixed(2)} m at the deepest`);
  await page.screenshot({ path: `out/${tag}-dent-${side}.png` });
  await page.click('#mend');
  await wait(150);
  const mended = await bent();
  check(mended.moved === 0, `${side} mended: ${mended.moved} vertices still bent`);
}

console.log('\n-- a wall takes hits on the Buildings bench --');
await page.click('#labs button:has-text("Buildings")');
await settle();
{
  const stats = () => page.evaluate(() => (window as any).bench.walls.stats as { buildings: number; tiles: number; voxels: number; pool: number });
  const calm = async () => { await wait(300); return page.evaluate(() => { const r = (window as any).bench.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; }); };
  const plain = await calm();
  check((await stats()).voxels === 0, 'nothing is voxels until a wall is hit');
  await page.click('#views button:has-text("Three-quarter")');
  await settle();
  await page.fill('#spd', '12');
  await page.dispatchEvent('#spd', 'input');
  await page.click('#crash');
  const small = await stats();
  await wait(350);
  await page.fill('#spd', '28');
  await page.dispatchEvent('#spd', 'input');
  await page.click('#crash');
  const big = await stats();
  check(small.voxels > 0 && small.tiles * 32 > small.voxels, `a 43 km/h hit: ${small.tiles} tiles, ${small.voxels} voxels left of ${small.tiles * 32}`);
  check(big.tiles >= small.tiles, `a 100 km/h hit on top: ${big.tiles} tiles, ${big.voxels} voxels`);
  await page.screenshot({ path: `out/${tag}-wall-34.png` });
  await page.click('#views button:has-text("Front")');
  await settle();
  await page.screenshot({ path: `out/${tag}-wall-front.png` });
  const box = await stageBox();
  await wait(350);
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await wait(300);
  const clicked = await stats();
  check(clicked.tiles > big.tiles, `clicking the wall hits it there: ${big.tiles} tiles to ${clicked.tiles}`);
  for (let i = 0; i < 60; i++) {
    await page.evaluate((k) => {
      const w = (window as any).bench.walls, b = w.town.boxes[0]; // a sweep along all four walls, hard, faster than a car could
      const along = -9 + (k % 10) * 2, side = k % 4;
      if (side < 2) w.hit(b, 0, side ? -1 : 1, along, side ? -10 : 10, 26, 0.8, 1e6 + k);
      else w.hit(b, side === 2 ? 1 : -1, 0, side === 2 ? 12 : -12, along, 26, 0.8, 1e6 + k);
    }, i);
  }
  const cost = await calm();
  const after = await stats();
  check(after.tiles * 32 <= after.pool, `the pool holds: ${after.tiles * 32} of ${after.pool}`);
  const ratio = cost.triangles / plain.triangles;
  console.log(`      plain ${plain.calls} calls, ${plain.triangles} triangles; damaged ${cost.calls} calls, ${cost.triangles} triangles (${ratio.toFixed(2)}x)`);
  check(cost.calls - plain.calls <= 4, `one wall's damage adds ${cost.calls - plain.calls} draw calls`); // two stand-in walls, the voxels, the pockets
  await page.click('#mend');
  await wait(300);
  const mended = await stats();
  const back = await calm();
  check(mended.voxels === 0 && mended.buildings === 0 && back.calls <= plain.calls, `mend: ${mended.voxels} voxels, ${back.calls} calls`);
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
