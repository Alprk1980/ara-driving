// Photos to a voxel model, with Qwen doing the looking, and retrying on its own. It works out which view each photo is, and the
// page carves at several background settings, starting from the one where the views agree best. Then each round Qwen looks at
// the cut-outs and the model: a bad cut-out changes the background setting, thin detail raises the voxel count, and the best
// round is kept. It stops at the target, or when it says only another photo would help, and names the photo. Hollows and
// open frames never show in an outline, so those end there, not in more retries.
//   npx vite --port 4179 --strictPort &   then   node --env-file=.env.llm tools/photovox.ts side.jpg front.jpg [--name car] [--long 64]
//   ... tools/photovox.ts --demo fire_engine     photographs one of the game's vehicles and rebuilds it, as a test with a known answer
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { chat, MODEL, parseJson } from './llm.ts';

const VIEWS = ['side', 'front', 'back', 'top'] as const, TOLERANCES = [15, 25, 40, 60, 85], TRIES = 3, ROUNDS = 4, TARGET = 8, MORE_DETAIL = 1.4, MAX_LONG = 128;
type View = (typeof VIEWS)[number];
const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const demo = flag('--demo'), name = flag('--name') ?? demo ?? 'model', long = Number(flag('--long') ?? 72), budget = Number(flag('--game') ?? 0); // --game 3000: also make the light version for the game, at most this many triangles
const files = args.filter((a, i) => !a.startsWith('--') && !['--name', '--long', '--demo', '--game', '--views'].includes(args[i - 1]));
const dataUrl = (file: string) => `data:image/${file.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(file).toString('base64')}`;

/** Which way each photo looks, checked and asked again if it can't be right. */
async function classify(urls: string[]): Promise<View[]> {
  let msgs: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: [{ type: 'text', text: `These ${urls.length} photos show one object. For each, in order, say which way the camera looks at it: "side", "front", "back" or "top". Answer with ONLY a JSON array of ${urls.length} strings.` }, ...urls.map((url) => ({ type: 'image_url', image_url: { url } }))] }];
  for (let t = 0; t < TRIES; t++) {
    const raw = await chat(msgs as never, { model: MODEL, maxTokens: 4000, temperature: 0.1 }), list = parseJson(raw) as string[] | null, errs: string[] = [];
    if (!Array.isArray(list) || list.length !== urls.length) errs.push(`give exactly ${urls.length} strings`);
    else {
      if (!list.every((v) => (VIEWS as readonly string[]).includes(v))) errs.push(`each must be one of ${VIEWS.join(', ')}`);
      if (new Set(list).size !== list.length) errs.push('each photo must be a different view');
    }
    if (!errs.length) return list as View[];
    msgs = [...msgs, { role: 'assistant', content: raw }, { role: 'user', content: `Fix this and answer again: ${errs.join('; ')}` }];
  }
  throw new Error('Qwen could not tell which views these are: name them with --views');
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4179/photovox.html');
await page.waitForFunction(() => (window as any).photovox, undefined, { timeout: 60000 });

let list: { view: View; url: string }[];
if (demo) list = await Promise.all((['side', 'front', 'top'] as const).map(async (view) => ({ view, url: await page.evaluate(([id, v]) => (window as any).photovox.snap(id, v), [demo, view]) as string })));
else {
  if (files.length < 2) throw new Error('give at least two photos');
  const urls = files.map(dataUrl), given = flag('--views')?.split(',') as View[] | undefined, views = given ?? await classify(urls);
  list = urls.map((url, i) => ({ view: views[i], url }));
  console.log(`views: ${views.join(', ')}`);
}

type Built = { match: Record<string, number>; agreement: number | null; cells: number; size: number[]; colours: number };
type Verdict = { score: number; cutouts: 'good' | 'bites' | 'background'; action: 'done' | 'more_detail' | 'another_photo'; photo?: string; problems: string[] };

const build = (tolerance: number, voxels: number) => page.evaluate(([l, n, t]) => (window as any).photovox.run(l, n, t).catch((e: Error) => ({ error: e.message })), [list, voxels, tolerance] as const) as Promise<Built & { error?: string }>;

/** The setting where the views agree best, and among equals the lowest, which takes least from the object. */
async function firstSetting() {
  let best: { tolerance: number; fit: number } | null = null;
  for (const tolerance of TOLERANCES) {
    const r = await build(tolerance, Math.min(long, 48));
    if (r.error) { console.log(`background ${tolerance}: ${r.error}`); continue; }
    const fit = r.agreement ?? Math.min(...Object.values(r.match));
    console.log(`background ${tolerance}: views agree ${r.agreement ?? 'n/a'}, outline ${JSON.stringify(r.match)}`);
    if (!best || fit > best.fit + 0.001) best = { tolerance, fit };
  }
  if (!best) throw new Error('no setting found the object: the photos need plainer backgrounds');
  return best.tolerance;
}

async function photograph(tag: string) {
  const out: string[] = [];
  for (const [label, yaw, pitch] of [['three', -0.7, 0.35], ['side', Math.PI / 2, 0.02], ['front', 0, 0.02], ['top', Math.PI, 1.5]] as const) {
    await page.evaluate(([y, p]) => (window as any).photovox.aim(y, p), [yaw, pitch]);
    await page.waitForTimeout(400);
    const file = `out/${tag}-${label}.png`;
    await page.locator('#view').screenshot({ path: file });
    out.push(file);
  }
  return out;
}

/** Qwen's reading of the cut-outs and the model, checked and asked again if it isn't a usable answer. */
async function review(tolerance: number, shots: string[]): Promise<Verdict> {
  const cuts = await page.evaluate(([l, t]) => (window as any).photovox.cuts(l, t), [list, tolerance] as const) as string[];
  const image = (url: string) => ({ type: 'image_url', image_url: { url } });
  const ask = `First come ${list.length} photos of one object, then the same photos with everything taken for background painted magenta, then a voxel model built from them, from several angles. Judge whether the model captures the object. Answer with ONLY a JSON object: {"score":1-10,"cutouts":"good", "bites" if magenta has eaten into the object, or "background" if background was left unpainted,"action":"done" if it is as good as these photos allow, "more_detail" if thin parts are lost to coarse voxels, or "another_photo" if hollows, open frames or hidden sides need a further view,"photo":"which view to add, one of ${VIEWS.join(', ')}, only with another_photo","problems":["short specific problem"]}`;
  let msgs: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: [{ type: 'text', text: ask }, ...list.map((s) => image(s.url)), ...cuts.map(image), ...shots.map((f) => image(dataUrl(f)))] }];
  for (let t = 0; t < TRIES; t++) {
    const raw = await chat(msgs as never, { model: MODEL, maxTokens: 12000, temperature: 0.2 }), v = parseJson(raw, 'object') as Verdict | null, errs: string[] = [];
    if (!v || typeof v.score !== 'number' || v.score < 1 || v.score > 10) errs.push('score must be a number from 1 to 10');
    if (!v || !['good', 'bites', 'background'].includes(v.cutouts)) errs.push('cutouts must be good, bites or background');
    if (!v || !['done', 'more_detail', 'another_photo'].includes(v.action)) errs.push('action must be done, more_detail or another_photo');
    if (v?.action === 'another_photo' && !(VIEWS as readonly string[]).includes(v.photo ?? '')) errs.push(`photo must be one of ${VIEWS.join(', ')}`);
    if (!errs.length) return { ...v!, problems: [v!.problems ?? []].flat() };
    msgs = [...msgs, { role: 'assistant', content: raw }, { role: 'user', content: `Fix this and answer the whole JSON again: ${errs.join('; ')}` }];
  }
  return { score: 0, cutouts: 'good', action: 'done', problems: ['no usable review'] };
}

mkdirSync('out', { recursive: true });
let tolerance = await firstSetting(), voxels = long, best: { score: number; tolerance: number; voxels: number; built: Built; model: string; verdict: Verdict } | null = null;
const tried = new Set<string>();
for (let round = 1; round <= ROUNDS; round++) {
  tried.add(`${tolerance}/${voxels}`);
  const built = await build(tolerance, voxels);
  if (built.error) { console.log(`round ${round}: ${built.error}`); break; }
  const shots = await photograph(`${name}-r${round}`), verdict = await review(tolerance, shots);
  console.log(`round ${round}: background ${tolerance}, ${voxels} long, views agree ${built.agreement ?? 'n/a'}: ${verdict.score}/10, cut-outs ${verdict.cutouts}, ${verdict.action}${verdict.photo ? ` (${verdict.photo})` : ''}. ${verdict.problems.slice(0, 2).join(' | ')}`);
  if (!best || verdict.score > best.score) best = { score: verdict.score, tolerance, voxels, built, model: await page.evaluate(() => (window as any).photovox.model()) as string, verdict };
  if (verdict.score >= TARGET) break;
  const step = TOLERANCES.indexOf(tolerance), next = verdict.cutouts === 'bites' ? TOLERANCES[step - 1] : verdict.cutouts === 'background' ? TOLERANCES[step + 1] : undefined; // a bite means too much was called background
  if (next !== undefined) tolerance = next;
  else if (verdict.cutouts !== 'good' || verdict.action === 'done' || verdict.action === 'another_photo') break; // nothing left that a setting can change
  else if (voxels < MAX_LONG) voxels = Math.min(MAX_LONG, Math.round(voxels * MORE_DETAIL));
  else break;
  if (tried.has(`${tolerance}/${voxels}`)) break;
}
if (best && budget) {
  await build(best.tolerance, best.voxels);
  const light = await page.evaluate((b) => (window as any).photovox.game(b), budget) as { before: number; after: number; colours: number; ms: number }, shots = await photograph(`${name}-game`), verdict = await review(best.tolerance, shots);
  writeFileSync(`out/${name}.game.json`, await page.evaluate(() => (window as any).photovox.gameModel()) as string);
  console.log(`game version: ${light.after} triangles from ${light.before} in ${light.ms} ms, one draw call, ${light.colours} colours: ${verdict.score}/10 against ${best.score}/10 for the full one. ${verdict.problems.slice(0, 2).join(' | ')}`);
}
await browser.close();
if (!best) throw new Error('no round produced a model');
writeFileSync(`out/${name}.voxels.json`, best.model);
console.log(`${name}: ${best.score}/10 with background ${best.tolerance}, ${best.voxels} long, ${best.built.cells} surface voxels, ${best.built.colours} colours, views agree ${best.built.agreement ?? 'n/a'}`);
if (best.verdict.action === 'another_photo') console.log(`needs another photo: ${best.verdict.photo}`);
if (errors.length) console.log('page errors:', errors);
