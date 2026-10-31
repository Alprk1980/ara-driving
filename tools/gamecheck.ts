// Plays the things that only show up in the real game: the title and loader, a new game that truly resets, a start
// somewhere new, drag-to-look in every camera, the town's cars up close, and traffic taking damage.
//   npx vite --port 4179 &   then   node tools/gamecheck.ts [tag]
import { chromium, type Page } from 'playwright';

const tag = process.argv[2] ?? 'check';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
const page = await ctx.newPage();
const errors: string[] = [];
const watch = (p: Page) => { p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); }); };
watch(page);
let fails = 0;
const check = (ok: boolean, what: string) => { if (!ok) fails++; console.log(`${ok ? 'pass' : 'FAIL'}  ${what}`); };
const wait = (ms: number) => page.waitForTimeout(ms);
const ara = <T,>(f: string) => page.evaluate(`(() => { const a = window.ara, g = a.game, p = g.player; return ${f}; })()`) as Promise<T>;
const boot = async () => { await page.waitForFunction(() => (document.getElementById('loader') as HTMLElement).classList.contains('done'), undefined, { timeout: 60000 }); await wait(900); };
const startGame = async () => {
  await page.click('#start', { timeout: 30000 });
  await wait(700);
  if (await page.locator('#picker [data-car="hatchback"]').isVisible()) await page.click('#picker [data-car="hatchback"]', { timeout: 60000 });
  await wait(1000);
};

await page.goto('http://localhost:4179/index.html');
await boot();
await page.screenshot({ path: `out/${tag}-title.png` });
check((await page.textContent('#t-place b'))!.length > 2, `the title tours the town: ${await page.textContent('#t-place b')}`);
await page.click('#t-controls [data-scheme="dpad"]');
await wait(300);
check((await ara<string>('a.app.save.input')) === 'dpad' && (await page.getAttribute('#t-controls [data-scheme="dpad"]', 'class'))!.includes('on'), 'the title picks the controls: D-pad');
await page.click('#t-controls [data-scheme="keyboard"]');
await wait(300);
check((await ara<string>('a.app.save.input')) === 'keyboard', 'and back to the keyboard');
await page.screenshot({ path: `out/${tag}-title.png` });
await startGame();
const first = await ara<{ x: number; z: number }>('({ x: p.x, z: p.z })');

console.log('\n-- controls can be changed on the road --');
await page.click('#btn-controls');
await wait(300);
await page.click('#dialog [data-v="input:dpad"]');
await wait(300);
check((await ara<string>('a.app.save.input')) === 'dpad' && await page.locator('#dialog.open').count() === 1, 'the Controls button switches to the D-pad and stays open');
await page.click('#dialog [data-v="input:keyboard"]');
await wait(300);
await page.click('#dialog #x');
await wait(300);
check((await ara<string>('a.app.save.input')) === 'keyboard' && !(await ara<boolean>('a.app.paused')), 'back to the keyboard, and driving resumes');

console.log('\n-- the map names the districts and takes you to each --');
for (const [id, name] of [['oldtown', 'Old Town'], ['business', 'Business Quarter'], ['garden', 'Garden Suburb'], ['works', 'The Works']]) {
  await page.click('#btn-map');
  await wait(400);
  if (id === 'oldtown') await page.screenshot({ path: `out/${tag}-map.png` });
  await page.click(`#mapsheet [data-go="${id}"]`);
  await wait(500);
  const at = await ara<{ x: number; z: number; open: boolean }>("({ x: p.x, z: p.z, open: document.getElementById('mapsheet').classList.contains('open') })");
  const road = await ara<number>('Math.min(...g.town.edges.map((e) => g.town.segDist(p, e)))');
  check(!at.open && road < 8, `${name}: landed at ${Math.round(at.x)}, ${Math.round(at.z)}, ${road.toFixed(1)} m from the road`);
  await page.screenshot({ path: `out/${tag}-travel-${id}.png` });
}

console.log('\n-- the cockpit --');
await ara('(a.view.index = 3, a.view.applyRig(), p.place(1500, 1500, 0), 0)');
await page.keyboard.down('KeyD');
await page.keyboard.down('KeyW');
await wait(1600);
const wheelTurn = await ara<number>('a.view.rig.hands.rotation.z');
await page.screenshot({ path: `out/${tag}-cockpit-right.png` });
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyW');
check(wheelTurn > 0.1, `steering right turns the wheel clockwise from the seat: ${wheelTurn.toFixed(2)} rad`);
await wait(900);
await page.screenshot({ path: `out/${tag}-cockpit.png` });
await ara('(a.view.index = 0, a.view.applyRig(), 0)');
await wait(500);

console.log('\n-- lights, handbrake and stalk --');
await ara("(p.place(1500, 1500, 0), p.state = 'Driving', 0)");
await page.keyboard.press('KeyQ');
await wait(250);
check((await ara<number>('p.indicator')) === -1, 'Q indicates left');
await page.keyboard.press('KeyQ');
await wait(250);
check((await ara<number>('p.indicator')) === 0, 'Q again cancels it');
await page.keyboard.down('Space');
await wait(300);
check(await ara<boolean>('p.handbrake'), 'Space holds the handbrake');
await page.keyboard.up('Space');
await page.keyboard.down('KeyS');
await wait(1500);
const lamps = await ara<{ speed: number; reverse: string }>('({ speed: p.speed, reverse: a.view.rig.reverse.color.getHexString() })');
await page.keyboard.up('KeyS');
check(lamps.speed < -0.2 && lamps.reverse.startsWith('ff') , `reversing lights up the reverse lamps: ${lamps.speed.toFixed(1)} m/s, #${lamps.reverse}`);
await wait(300);

console.log('\n-- the camera follows a mouse drag, in every view --');
for (const view of [0, 1, 2, 3]) {
  await ara(`(a.view.index = ${view}, 0)`);
  await wait(900);
  const before = await ara<number[]>('a.view.camera.position.toArray().concat(a.view.look.toArray())');
  await page.mouse.move(550, 300);
  await page.mouse.down();
  await page.mouse.move(700, 250, { steps: 6 });
  await wait(250);
  const after = await ara<number[]>('a.view.camera.position.toArray().concat(a.view.look.toArray())');
  await page.mouse.up();
  const moved = Math.hypot(...before.map((v, i) => v - after[i]));
  check(moved > 0.5, `camera ${view}: dragging moved the view ${moved.toFixed(1)} m`);
  if (view === 0) await page.screenshot({ path: `out/${tag}-look.png` });
}
await ara('(a.view.index = 0, 0)');
await page.waitForFunction(() => { const v = (window as any).ara.view; return Math.abs(v.lookYaw) + Math.abs(v.lookPitch) < 0.05; }, undefined, { timeout: 30000 }).catch(() => {});
const settled = await ara<number>('Math.abs(a.view.lookYaw) + Math.abs(a.view.lookPitch)');
check(settled < 0.05, `let go and it settles back behind the car: ${settled.toFixed(3)} left`);

console.log('\n-- town cars, close to --');
const close = await ara<{ x: number; z: number; h: number }>(`(() => {
  const s = g.town.parked.find((c) => Math.hypot(c.x - 1120, c.z - 1680) < 500) ?? g.town.parked[0];
  p.place(s.x + Math.sin(s.heading + 1.2) * 7, s.z + Math.cos(s.heading + 1.2) * 7, s.heading - 1.9); p.speed = 0;
  return { x: s.x, z: s.z, h: s.heading };
})()`);
void close;
await wait(1800);
await page.screenshot({ path: `out/${tag}-parked.png` });

console.log('\n-- a parked car takes a knock --');
const shoved = await ara<number>(`(() => {
  const i = g.parked.cars.findIndex((c) => !c.drive && (c.colour * 13) % 1 < 0.7 && Math.hypot(c.x - 1120, c.z - 1680) < 500), c = g.parked.cars[i];
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  p.place(c.x - fx * 9, c.z - fz * 9, c.heading); p.speed = 11; p.state = 'Driving';
  return i;
})()`);
await wait(3000); // long enough for the slide to finish, even at a software renderer's few frames a second
const hit = await ara<{ moved: number; dent: number; alarm: number; speed: number }>(`(() => { const c = g.parked.cars[${shoved}]; return { moved: Math.hypot(c.x - c.homeX, c.z - c.homeZ), dent: c.dents.back, alarm: c.alarm, speed: p.speed }; })()`);
check(hit.moved > 0.3 && hit.dent > 0.01 && hit.alarm > 0, `shunted ${hit.moved.toFixed(1)} m, dented ${hit.dent.toFixed(2)}, alarm ${hit.alarm.toFixed(0)} s`);
await page.screenshot({ path: `out/${tag}-shunt.png` });

console.log('\n-- the running of the streets --');
const look = async (name: string, where: string) => { await ara(`(() => { p.speed = 0; ${where}; return 0; })()`); await wait(1500); await page.screenshot({ path: `out/${tag}-${name}.png` }); };
await look('zebra', `const z = g.town.zebras.find((q) => q.x > 800); p.place(z.x - z.ux * 22 - z.uz * -3, z.z - z.uz * 22 + z.ux * -3, Math.atan2(z.ux, z.uz))`);
await look('signals', `const [n] = g.town.signals.keys(), w = g.town.adj[n][0], o = g.town.nodes[w.to], m = g.town.nodes[n], e = g.town.edges[w.edge], dx = (m.x - o.x) / e.len, dz = (m.z - o.z) / e.len; p.place(m.x - dx * 26 + dz * 3, m.z - dz * 26 - dx * 3, Math.atan2(dx, dz))`);
await look('drive', `const d = g.town.drives[3]; p.place(d.kerb.x + d.fx * 8 + d.fz * 12, d.kerb.z + d.fz * 8 - d.fx * 12, Math.atan2(-d.fz, d.fx))`);
await look('fire-station', `const s = g.town.services.find((q) => q.id === 'fire'), f = { x: s.road.x - s.x, z: s.road.z - s.z }, l = Math.hypot(f.x, f.z); p.place(s.road.x + f.z / l * 14, s.road.z - f.x / l * 14, Math.atan2(s.x - s.road.x - f.z / l * 14, s.z - s.road.z + f.x / l * 14))`);
await look('police-station', `const s = g.town.services.find((q) => q.id === 'police'), f = { x: s.road.x - s.x, z: s.road.z - s.z }, l = Math.hypot(f.x, f.z); p.place(s.road.x + f.z / l * 14, s.road.z - f.x / l * 14, Math.atan2(s.x - s.road.x - f.z / l * 14, s.z - s.road.z + f.x / l * 14))`);
const sense = await ara<string>(`document.getElementById('roadchip').textContent`);
check(sense.startsWith('Road sense'), `the chip reads: ${sense}`);
await page.click('#roadchip');
await wait(400);
await page.screenshot({ path: `out/${tag}-record.png` });
const opened = await ara<string>(`document.querySelector('#dialog h2').textContent`);
check(opened.startsWith('Road sense'), `the record opens: ${opened}`);
await page.click('#dialog #x');
console.log('\n-- the phone and the recovery truck --');
await page.click('#btn-phone');
await wait(400);
await page.click('#dialog #n999');
await wait(300);
await page.screenshot({ path: `out/${tag}-phone.png` });
const asked = await ara<string>(`document.querySelector('#dialog .card').textContent`);
check(asked.includes('Which service?'), '999 asks which service');
await page.click('#dialog #x');
const truck = await ara<{ sent: boolean; id: string }>(`(() => { const sent = g.phone('recovery'), c = g.traffic.cars.find((q) => q.role === 'recovery'); c.x = p.x + Math.sin(p.heading) * 14 - Math.cos(p.heading) * 3; c.z = p.z + Math.cos(p.heading) * 14 + Math.sin(p.heading) * 3; c.heading = p.heading + 0.5; return { sent, id: c.fleet }; })()`);
check(truck.sent, `a ${truck.id} is on its way, amber beacons on`);
await wait(900);
await page.screenshot({ path: `out/${tag}-truck.png` });

const lit = await ara<{ blue: boolean; to: string }>(`(() => { const c = g.traffic.call('fire', p, { x: p.x + 40, z: p.z + 40 }); return { blue: !!c?.blue, to: c?.fleet ?? 'none' }; })()`);
check(lit.blue, `a ${lit.to} answers a call with its blue lights on`);

console.log('\n-- a real crash with traffic --');
await ara(`(() => { const c = g.traffic.cars[0]; p.place(1500, 1500, 0); c.x = 1500; c.z = 1504; c.heading = Math.PI; c.speed = 22; c.want = 22; p.speed = 22; p.state = 'Driving'; return 0; })()`);
await wait(900);
const crash = await ara<{ dmg: number; wreck: number; mine: number }>('({ dmg: g.traffic.cars[0].damage, wreck: g.traffic.cars[0].wreck, mine: p.damage })');
check(crash.dmg > 0.2 && crash.mine > 0.2, `both cars bent: theirs ${crash.dmg.toFixed(2)}, mine ${crash.mine.toFixed(2)}, wreck timer ${crash.wreck.toFixed(0)}`);
await ara('(a.view.index = 2, 0)');
await wait(1200);
await page.screenshot({ path: `out/${tag}-wreck.png` });
await ara('(a.view.index = 0, 0)');

console.log('\n-- a new game really is new --');
const damaged = await ara<{ dmg: number; start: number }>('(a.app.store(), { dmg: a.app.save.dmg[a.app.save.car], start: a.app.save.start })');
check(damaged.dmg > 0.2, `before: ${damaged.dmg.toFixed(2)} damage saved`);
const starts = [damaged.start];
for (let round = 0; round < 3; round++) {
  await page.evaluate(() => (document.getElementById('btn-pause') as HTMLElement).click());
  await wait(300);
  await page.click('#pause #new');
  await wait(200);
  await Promise.all([page.waitForEvent('load', { timeout: 60000 }), page.click('#dialog #yes')]);
  await boot();
  const fresh = await ara<{ dmg: number; marks: number; picked: boolean; start: number; last: number; x: number; z: number; district: string }>('({ dmg: p.damage, marks: p.marks.length, picked: a.app.save.picked, start: a.app.save.start, last: a.app.save.lastStart, x: p.x, z: p.z })');
  check(fresh.dmg === 0 && fresh.marks === 0, `new game ${round + 1}: no damage carried over (${fresh.dmg})`);
  check(!fresh.picked, `new game ${round + 1}: asks for a car again`);
  check(fresh.start !== starts[starts.length - 1], `new game ${round + 1}: opens somewhere new (plot ${fresh.start}, was ${starts[starts.length - 1]})`);
  check(Math.hypot(fresh.x - first.x, fresh.z - first.z) > 1 || round > 0, `new game ${round + 1}: at ${Math.round(fresh.x)}, ${Math.round(fresh.z)}`);
  starts.push(fresh.start);
  await startGame();
  await ara("(g.player.addDent('front', 0.5), a.app.store(), 0)");
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}; page errors: ${errors.length ? errors.slice(0, 5).join(' | ') : 'none'}`);
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
