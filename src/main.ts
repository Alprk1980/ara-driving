// Boot: load the shared profile and this game's save, build the game, run it in fixed steps.
import type { CatalogueItem, ChatterLine, Find, Goal, GuideLine, Landmark, Place, QuestText, RadioLine, Rank, Regular, Sky, Station, StoryPlace, TownEventCard, VoiceLine } from '../schemas/content.ts';
import { touch } from '../schemas/profile.ts';
import { getGameSave, getPlayer, putPlayer } from '../kit/profile.ts';
import catalogue from './data/catalogue.json';
import { garmentItem } from './sim/shops.ts';
import chatter from './data/chatter.json';
import events from './data/events.json';
import finds from './data/finds.json';
import goals from './data/goals.json';
import guideLines from './data/guide.json';
import landmarks from './data/landmarks.json';
import places from './data/places.json';
import calls from './data/calls.json';
import radioLinks from './data/radiolinks.json';
import type { RadioLink } from '../schemas/radiolinks.ts';
import type { CallCard } from '../schemas/careers.ts';
import quests from './data/quests.json';
import radioLines from './data/radio.json';
import ranks from './data/ranks.json';
import regulars from './data/regulars.json';
import skies from './data/skies.json';
import stations from './data/stations.json';
import stories from './data/stories.json';
import voiceLines from './data/voice.json';
import { InputRouter, FloatingJoystick, freshHeld, PadWatch } from './input/schemes.ts';
import { emptySave, GAME_ID, keepDrive, SAVE_KEY, saveErrors, type DriveSave } from './save.ts';
import { DISTRICTS, DISTRICT_IDS } from './sim/districts.ts';
import { carById } from './sim/economy.ts';
import { Game, STEP } from './sim/game.ts';
import { dealStart, Town } from './sim/town.ts';
import { App, ProfileWallet } from './ui/app.ts';
import { PerfMeter } from './ui/perf.ts';
import { RadioHost } from './ui/radio.ts';
import { Sound } from './ui/sound.ts';
import { ClipBackend, SpeechBackend, VoiceGuide } from './ui/voice.ts';
import { View } from './view/scene.ts';

/** Move the loader on, and let the browser paint it before the next heavy stage. */
const loading = async (share: number, text: string) => {
  (document.querySelector('#ld-bar i') as HTMLElement).style.width = `${share}%`;
  document.getElementById('ld-text')!.textContent = text;
  await new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
};

const touchDevice = matchMedia('(pointer: coarse)').matches;
await loading(12, 'Finding your save');
const stored = await getGameSave<DriveSave>(SAVE_KEY);
const merged = stored ? { ...emptySave(touchDevice), ...stored } : null; // a save from before a field existed takes its default
const save = merged && !saveErrors(merged).length ? merged : emptySave(touchDevice);
keepDrive(save);

let player = await getPlayer();
const wallet = new ProfileWallet(player);
wallet.ledger = save.ledger; // the history lives in this game's save
await loading(30, 'Laying out the town');
const town = new Town();
if (save.start < 0) save.start = dealStart(town, Math.random, save.lastStart);
const game = new Game({ places: places as Place[], quests: quests as QuestText[], regulars: regulars as Regular[], finds: finds as Find[], goals: goals as Goal[], calls: calls as CallCard[] }, wallet, { town, start: save.start, carId: save.car, fuel: save.fuel[save.car], damage: save.dmg[save.car], progress: save.progress, day: new Date().toLocaleDateString('en-CA'), events: events as TownEventCard[], trip: save.trip?.car === save.car ? save.trip : null });

const sound = new Sound();
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const items = catalogue as CatalogueItem[];
await loading(52, 'Raising the buildings');
// Clothes from the shops are looked up beside the catalogue, and worn as the garage's outfits were.
const view = new View(canvas, game, (id) => items.find((c) => c.id === id) ?? garmentItem(id), { landmarks: landmarks as Landmark[], skies: skies as Sky[], stories: stories as StoryPlace[] });
view.index = save.camera;
view.setQuality(save.graphics);
view.bodyStyle = save.body;
view.you.setLook(save.look, save.driver);
await loading(82, 'Fetching your car');
view.setCar(save.designs[save.car] ?? {}, save.driver);
if (save.wallsTown !== town.layoutKey) save.walls = []; // knocked into a town laid out differently, or before the key existed (the 2026-11-06 places moved buildings): they would land on the wrong ones
save.wallsTown = town.layoutKey;
view.replayWalls(save.walls);

const speech = new ClipBackend(new SpeechBackend()); // recorded clips first, the device's own voice for the rest
void speech.load();
speech.choice = save.voices; // the same object, so a choice in the Menu takes at once
let app: App;
const voice = new VoiceGuide(voiceLines as VoiceLine[], speech, (text, key) => app?.banner(text, key === 'fuel_critical'), () => sound.chime());
voice.muted = sound.muted = save.muted;
const router = new InputRouter(new FloatingJoystick(freshHeld()), (id) => app?.toast(`${id === 'tilt' ? 'Tilt' : id} is not available here`));
app = new App(game, view, wallet, save, router, voice, sound, items, new RadioHost(radioLines as RadioLine[], Math.random, radioLinks as RadioLink[]), stations as Station[], { guide: guideLines as GuideLine[], chatter: chatter as ChatterLine[], ranks: ranks as Rank[], stories: stories as StoryPlace[] });

app.padLabels(); // a save left on foot opens on foot
app.clips = speech;
let running = false;
const enter = async () => {
  await app.applyScheme(save.input);
  app.tuneRadio();
  app.guide.fire('take_job');
  if (!running) {
    player = touch(wallet.player, GAME_ID, new Date().toISOString());
    wallet.player = player;
    void putPlayer(player);
  }
  view.stopAttract();
  document.getElementById('title')!.style.display = 'none';
  document.getElementById('hud')!.hidden = false;
  running = true;
  app.refreshPoints();
};
const start = document.getElementById('start') as HTMLButtonElement;
start.onclick = async () => {
  // Sound and speech may only start inside a tap, as may the tilt permission.
  sound.unlock();
  speech.unlock();
  if (!save.picked) {
    view.stopAttract();
    document.getElementById('title')!.style.display = 'none';
    app.openPick(() => void enter()); // first run: spin the cars and pick one to start in
    return;
  }
  await enter();
};

// The title: what you've got, and the live tour of the town behind it, a beat of black between districts.
if (save.picked) start.textContent = 'Carry on driving';
document.getElementById('t-stats')!.innerHTML = save.picked
  ? `<span>${carById(save.car).name}</span><span>${wallet.points().toLocaleString()} Points</span>`
  : '<span>Six cars to choose from</span><span>Four districts</span>';
// Pick the controls before you set off, the same choice as the Menu's.
const controls = document.getElementById('t-controls')!;
const paintControls = () => { for (const b of controls.querySelectorAll<HTMLElement>('[data-scheme]')) b.classList.toggle('on', b.dataset.scheme === save.input); };
for (const [id, label] of [['keyboard', 'Keyboard'], ['joystick', 'Joystick'], ['dpad', 'D-pad'], ['tilt', 'Tilt'], ['gamepad', 'Controller']] as const) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.scheme = id;
  b.onclick = async () => {
    await app.applyScheme(id); // falls back and says so if this device can't do it, as tilt on a desktop can't
    app.store();
    paintControls();
  };
  controls.append(b);
}
paintControls();
// Press a button on a controller and it takes over; one merely plugged in, or a virtual device, stays out of the way.
const padWatch = new PadWatch();
const watchPad = async () => {
  if (save.input === 'gamepad' || !padWatch.pressed()) return;
  await app.applyScheme('gamepad');
  app.store();
  paintControls();
  app.toast('Controller connected');
};

const place = document.getElementById('t-place')!, veil = document.getElementById('veil')!, dots = [...document.querySelectorAll('#t-dots i')];
view.attract = (id) => {
  const d = DISTRICTS[id];
  veil.classList.add('on');
  place.classList.add('off');
  setTimeout(() => {
    veil.classList.remove('on');
    place.classList.remove('off');
    place.querySelector('b')!.textContent = d.name;
    place.querySelector('span')!.textContent = d.character.charAt(0).toUpperCase() + d.character.slice(1);
    dots.forEach((dot, i) => dot.classList.toggle('on', DISTRICT_IDS[i] === id));
  }, 380);
};

let last = performance.now(), acc = 0;
const perf = new PerfMeter(document.getElementById('perf')!);
function frame(now: number) {
  const began = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && !app.paused) {
    acc += dt;
    while (acc >= STEP) {
      game.step(router.step(STEP, Math.abs(game.player.speed) / game.player.vMax, document.hidden));
      acc -= STEP;
    }
  }
  view.frame(dt, router.intent.steer, router.intent.brake);
  if (running) app.frame(dt);
  perf.tick(now, performance.now() - began, view.renderer.info.render);
  void watchPad();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
await loading(100, 'Ready');
document.getElementById('loader')!.classList.add('done');

addEventListener('pagehide', () => app.store());
document.addEventListener('visibilitychange', () => { if (document.hidden) app.store(); });

// Test hook for the browser smoke run.
(window as unknown as { ara: unknown }).ara = { game, app, view, wallet };
