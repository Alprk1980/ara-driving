// Stages each newer feature in the real build and saves a screenshot, for checking by eye.
//   npx vite preview --port 4179 &   then   node tools/features.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('out', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string) => page.screenshot({ path: `out/f-${n}.png` });
const run = <T,>(fn: () => T) => page.evaluate(fn);

await page.goto('http://localhost:4179/');
await page.waitForSelector('#start');
await wait(600);
await page.click('#start');
await wait(400);
await run(() => (window as any).ara.app.applyScheme('joystick'));
await run(() => (window as any).ara.view.setQuality('high')); // a software renderer would trip the automatic step down

// One close look at each kind of place, parked on the road and turned to face the building.
const kinds = await run(() => {
  const { game } = (window as any).ara, seen = new Map<string, number>();
  game.town.plots.forEach((_: unknown, i: number) => { const k = game.content.places[i % game.content.places.length].kind; if (!seen.has(k)) seen.set(k, i); });
  return [...seen.entries()];
});
await run(() => { (window as any).ara.view.setCamera(0); });
for (const [kind, i] of kinds) {
  await page.evaluate((n) => {
    const { game } = (window as any).ara, p = game.town.plots[n];
    const away = Math.atan2(p.x - p.road.x, p.z - p.road.z);
    game.player.place(p.road.x, p.road.z, away);
  }, i);
  await wait(900);
  await shot(`place-${kind}`);
}

await run(() => { const { game, view } = (window as any).ara; view.setCamera(0); const t = game.traffic.cars[0]; game.player.place(t.x - Math.sin(t.heading) * 16, t.z - Math.cos(t.heading) * 16, t.heading); });
await wait(500);
await shot('traffic');

await run(() => { const { game } = (window as any).ara, s = game.town.spots[game.content.finds[0].spot]; game.player.place(s.x - 9, s.z - 9, 0.8); });
await wait(500);
await shot('find');
await run(() => { const { game } = (window as any).ara, s = game.town.spots[game.content.finds[0].spot]; game.player.place(s.x, s.z, 0.8); });
await wait(800);
await shot('found');
console.log('found', await run(() => (window as any).ara.game.progress.found));

// Stepping the clock forward: 480 s is a day, and the session starts at 0.3 of it.
for (const [name, frac] of [['dawn', 0.22], ['golden', 0.7], ['dusk', 0.78], ['night', 0.95]] as const) {
  await page.evaluate((f) => { const { game } = (window as any).ara; game.time = ((f - 0.3 + 1) % 1) * 480; const n = game.town.nodes[60]; game.player.place(n.x, n.z + 40, Math.PI); }, frac);
  await wait(900);
  await shot(`sky-${name}`);
}
await run(() => { const { game } = (window as any).ara; for (let b = 1; b < 200; b++) { game.time = b * 150 + 75; if (game.rain > 0.5) break; } });
await wait(900);
await shot('rain');
await run(() => { const { game, view } = (window as any).ara; game.time = 60; const n = game.town.nodes[60]; game.player.place(n.x, n.z + 40, Math.PI); view.setCamera(3); view.camera.fov = 72; });
await wait(900);
await shot('sky-clouds');
await run(() => { (window as any).ara.view.setCamera(0); });
console.log('rain now', await run(() => (window as any).ara.game.rain));

// Hard braking down a straight road, seen from the side so the marks show.
await run(() => {
  const a = (window as any).ara, { game } = a, e = game.town.edges.find((x: any) => x.len > 240), n = game.town.nodes[e.a], m = game.town.nodes[e.b];
  game.time = 40;
  a.app.applyScheme('dpad');
  a.view.setCamera(2);
  const h = Math.atan2(m.x - n.x, m.z - n.z);
  game.player.place(n.x + Math.sin(h) * 40, n.z + Math.cos(h) * 40, h);
  game.player.state = 'Driving';
  game.player.speed = 28;
  a.app.held.brake = true;
});
await wait(1100);
await shot('skid');
await run(() => { const a = (window as any).ara; a.app.held.brake = false; a.game.player.speed = 0; });

// A straight-on wall crash: the bumper should pop off, sparks fly and shards bounce away.
await run(() => {
  const a = (window as any).ara, { game } = a, b = game.town.boxes.reduce((w: any, x: any) => (x.h > w.h ? x : w));
  game.time = 40;
  a.view.setCamera(2);
  game.player.place(b.x, b.z - b.hz - 4, 0); // facing +z, nose first
  game.player.state = 'Driving';
  game.player.speed = 24;
});
await wait(650);
await shot('crash');
await run(() => { const a = (window as any).ara; a.game.player.state = 'Parked'; a.game.player.speed = 0; a.view.setCamera(0); });

// A rematch: a saved run down the same road, with the player a little behind it.
await run(() => {
  const a = (window as any).ara, { game } = a, s = 3, e = 9, from = game.town.plots[s].road, to = game.town.plots[e].road;
  game.fastTravel('home');
  const h = Math.atan2(to.x - from.x, to.z - from.z), track: number[] = [];
  for (let i = 0; i < 400; i++) track.push(from.x + Math.sin(h) * i * 3, from.z + Math.cos(h) * i * 3, h);
  game.progress.ghosts.push({ s, e, time: 60, track });
  game.player.place(from.x + Math.sin(h) * 10, from.z + Math.cos(h) * 10, h);
  for (let t = 0; t < 200 && !game.offers.some((o: any) => o.rematch); t++) game.refreshOffers();
  const o = game.offers.find((x: any) => x.rematch);
  game.accept(o.id);
  game.quest.phase = 'Active';
  a.view.setCamera(1);
});
await wait(1400);
await shot('ghost');
console.log('rematch', await run(() => { const g = (window as any).ara.game; return { title: g.quest?.offer.title, on: (window as any).ara.view.ghost.visible, t: Math.round(g.quest?.elapsed) }; }));
await run(() => { const a = (window as any).ara; a.game.failQuest('done'); a.game.progress.ghosts.length = 0; a.view.setCamera(0); });

// A street taken over by roadworks, a finished story, a rank and a filled-in Today page.
await run(() => {
  const a = (window as any).ara, { game } = a;
  game.events = game.events.filter((e: any) => e.kind === 'roadworks');
  for (let b = 1; b < 60 && !game.town.roughAt({ x: 0, z: 0 }) && game.town.rough < 0; b++) { game.time = b * 180 + 1; game.step(); }
  const e = game.town.edges[game.town.rough], m = game.town.nodes[e.a], n = game.town.nodes[e.b], h = Math.atan2(n.x - m.x, n.z - m.z);
  game.player.place(m.x + Math.sin(h) * 6, m.z + Math.cos(h) * 6, h);
  a.view.setCamera(1);
});
await wait(600);
await shot('roadworks');
await run(() => {
  const a = (window as any).ara, { game } = a, r = game.content.regulars[0], i = 0, n = game.town.plots.length, p = game.town.plots[(i * 17 + 11) % n];
  a.view.setCamera(0);
  game.player.place(p.road.x, p.road.z, Math.atan2(p.x - p.road.x, p.z - p.road.z));
});
await wait(700);
await shot('story-lot');
await run(() => {
  const a = (window as any).ara, { game } = a, r = game.content.regulars[0];
  game.progress.arcs[r.id] = r.jobs.length;
  a.view.showStories();
  game.progress.rep = 14;
  game.progress.arcs[game.content.regulars[1].id] = 2;
  game.progress.daily.counts[game.goals[0].kind] = 1;
});
await wait(700);
await shot('story-built');

await page.click('#btn-jobs');
await wait(200);
await shot('jobs');
await page.click('#jobs #today');
await wait(200);
await shot('today');
await run(() => { document.querySelector<HTMLElement>('#jobs #x')!.click(); });
await page.click('#btn-map');
await wait(200);
await shot('map');
await run(() => { document.querySelector<HTMLElement>('#mapsheet #x')!.click(); });
await page.click('#btn-pause');
await wait(200);
await shot('menu');
await page.click('#pause [data-v="radio:1"]');
await wait(200);
await run(() => { document.querySelector<HTMLElement>('#pause #x')!.click(); });

await wait(300);
console.log('radio', await run(() => (window as any).ara.app.save.radio), 'draw calls', await run(() => (window as any).ara.view.renderer.info.render.calls), 'triangles', await run(() => (window as any).ara.view.renderer.info.render.triangles));
console.log(errors.length ? `ERRORS\n${errors.join('\n')}` : 'no console errors');
await browser.close();
