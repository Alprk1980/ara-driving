// The HUD and every panel. Reads the game, sends player choices back through Game's methods.
import type { CatalogueItem, CatalogueKind, ChatterLine, GuideLine, RadioTopic, Rank, Station, StoryPlace } from '../../schemas/content.ts';
import { credit, spend, unlock, type Player } from '../../schemas/profile.ts';
import { putGameSave, putPlayer } from '../../kit/profile.ts';
import { Dpad, FloatingJoystick, Gamepad, Keyboard, STICK_RADIUS, Tilt, type Held, type InputRouter, type InputScheme, type SchemeId } from '../input/schemes.ts';
import { emptySave, GAME_ID, LEDGER_KEEP, SAVE_KEY, type Design, type DriveSave, type Driver, type LedgerLine } from '../save.ts';
import { SIDES, type Side } from '../sim/car.ts';
import { CAR_JOBS, carById, CARS, MARKET_BOOST, RANK_REP, RANK_UNLOCKS, REPAIR_RATE, streakBonus, TWIST_RULES, WARN_CRITICAL_PCT, WARN_LOW_PCT } from '../sim/economy.ts';
import { isNight, type Game, type GameEvent, type Wallet } from '../sim/game.ts';
import { Guide, Passengers } from './coach.ts';
import { dist } from '../sim/town.ts';
import { STILL_MPS } from '../sim/onfoot.ts';
import { allGoods, centreUnits, eatGood, goodById, shopFor, slotOf } from '../sim/shops.ts';
import { goodKey, isFood, type Good, type Shop } from '../../schemas/shops.ts';
import { PAD_ACTION, PadButton } from '../input/schemes.ts';
import { LOOKS } from '../view/people.ts';
import type { Door } from '../sim/doors.ts';
import type { Base } from '../sim/careers.ts';
import { CAREER_IDS, CAREERS, careerRank, RANK_JOBS, type CareerRank } from '../../schemas/careers.ts';
import type { FleetId } from '../../schemas/fleet.ts';
import { POINT_GBP } from '../sim/economy.ts';
import { GAME_HOUR_S } from '../sim/careers.ts';
import { placeAt } from '../sim/quests.ts';
import { CHOOSABLE, VOICE_NAMES } from './clips.ts';
import type { ClipBackend } from './voice.ts';
import type { BusStop } from '../sim/town.ts';
import type { RadioHost } from './radio.ts';
import type { Sound } from './sound.ts';
import type { RoadLine } from '../../schemas/services.ts';
import type { RoadMoment } from '../../schemas/services.ts';
import roadLines from '../data/roadlines.json';

const TREND_SHOWN = 0.5, ROAD_ROWS = 10;
/** A stop's countdown, as a board shows it: "due" once it's all but there, then the wait. In real seconds, not the game
 *  clock's hours, as that runs 180 times faster and a half-minute wait would read as an hour and a half. */
const dueText = (s: number | null) => (s === null ? 'not running' : s < 10 ? 'due' : s < 60 ? `in ${Math.round(s / 10) * 10} s` : `in ${Math.round(s / 60)} min`);
const ROAD_NAMES: Record<RoadMoment, string> = { red_stop: 'Waited at a red', zebra_wait: 'Stopped at a zebra', blue_pull: 'Pulled over for a blue light', stopped_after: 'Stopped after a knock', red_run: 'Ran a red light', zebra_run: 'Drove over a busy zebra', blue_block: 'Held up a blue light', drove_off: 'Drove off after a knock', pulled_over: 'Stopped by the police', got_away: 'Lost the police', course: 'Went on a course', phone_use: 'Used a phone at the wheel', hoax_call: 'Called 999 with no emergency', recovery_called: 'Called for recovery', school_fast: 'Too fast past a school', school_calm: 'Took it slow past a school' };
import { CAMERA_NAMES, type View } from '../view/scene.ts';
import { DISTRICTS, DISTRICT_IDS, type DistrictId } from '../sim/districts.ts';
import { drawMini, drawWorld, POI_STYLE, poiList, townImage } from './map.ts';
import { poiNear } from '../sim/pois.ts';
import { zoneAt } from '../sim/schoolrun.ts';
import { forecastText, spokenTime, travelText } from '../sim/bulletins.ts';
import { destinations, distanceText, etaText, GROUP_ORDER, nearestIn, turnText, type Dest, type DestGroup } from '../sim/satnav.ts';
import { cueKey, type VoiceGuide } from './voice.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $svg = (id: string) => document.getElementById(id) as unknown as SVGElement; // the bodywork outline's rects
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const HUB_URL = '../ara-games/';
const AUTOSAVE_S = 15; // seconds between saves while driving
const RUSH = [[7 / 24, 9.5 / 24], [16 / 24, 18.5 / 24]] as const; // the morning and evening peaks, as parts of the day: judged round the school run and the commute
const TIER_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

type Tab = 'cars' | 'paint' | 'pattern' | 'decal' | 'body' | 'wheels' | 'lights' | 'outfit' | 'accessory';
const TABS: [Tab, string][] = [['cars', 'Cars'], ['paint', 'Paint'], ['pattern', 'Patterns'], ['decal', 'Decals'], ['body', 'Body'], ['wheels', 'Wheels'], ['lights', 'Lights']]; // clothes are bought in the town's shops and worn from the Menu
const CAR_KINDS = ['paint', 'pattern', 'decal', 'body', 'wheels', 'lights'] as const;
const GOOD_LABEL: Record<Good['kind'], string> = { hot_drink: 'Hot drink', cold_drink: 'Cold drink', snack: 'Snack', sandwich: 'Sandwich', meal: 'Meal', tee: 'T-shirt', jumper: 'Jumper', jacket: 'Jacket', trousers: 'Trousers', shoes: 'Shoes', hat: 'Hat', gloves: 'Gloves', sunglasses: 'Sunglasses' };
const SLOT_LABEL: Record<keyof Driver, string> = { outfit: 'Top', trousers: 'Trousers', shoes: 'Shoes', cap: 'Hat', gloves: 'Gloves', sunglasses: 'Sunglasses' };

/** The shared player, kept in memory and written after every change. */
export class ProfileWallet implements Wallet {
  player: Player;
  ledger: LedgerLine[] = []; // the app hands over the save's own list, newest first
  constructor(player: Player) { this.player = player; }
  points() { return this.player.coins; }
  spend(n: number, why = 'Spent') {
    const next = spend(this.player, n);
    if (!next) return false;
    this.player = next;
    void putPlayer(next);
    this.note(-n, why);
    return true;
  }
  earn(n: number, why = 'Earned') {
    this.player = credit(this.player, n);
    void putPlayer(this.player);
    this.note(n, why);
  }
  private note(n: number, why: string) {
    if (!n) return;
    this.ledger.unshift({ at: new Date().toISOString(), n, why, total: this.points() });
    this.ledger.length = Math.min(this.ledger.length, LEDGER_KEEP);
  }
  owns(id: string) { return this.player.games[GAME_ID]?.unlocked.includes(id) ?? false; }
  grant(id: string) {
    this.player = unlock(this.player, GAME_ID, [id], new Date().toISOString());
    void putPlayer(this.player);
  }
}

export class App {
  game: Game;
  view: View;
  wallet: ProfileWallet;
  save: DriveSave;
  router: InputRouter;
  voice: VoiceGuide;
  sound: Sound;
  catalogue: CatalogueItem[];
  radio: RadioHost;
  stations: Station[];
  guide: Guide;
  private riders: Passengers;
  private ranks: Rank[];
  private stories: StoryPlace[];
  private jobsDone = 0;
  private lastZone: unknown = null;
  private boarded = 0; // the offer whose Active phase has already been greeted
  held: Held = { left: false, right: false, go: false, brake: false };
  schemes: Record<SchemeId, InputScheme>;
  paused = false;
  private img: HTMLCanvasElement;
  private mini = $<HTMLCanvasElement>('mini');
  private tab: Tab = 'cars';
  private bannerClock = 0;
  private toastClock = 0;
  private miniClock = 0;
  private saveClock = AUTOSAVE_S;
  private actionsKey = '';
  private padAction = new PadButton(PAD_ACTION);
  clips: ClipBackend | null = null; // the recorded voices, for the Menu's choice and its samples
  private lastStop: BusStop | null = null;
  private trackerKey = '';
  private bodyKey = '';
  private hintClock = 1;
  private tickerClock = 0;

  constructor(game: Game, view: View, wallet: ProfileWallet, save: DriveSave, router: InputRouter, voice: VoiceGuide, sound: Sound, catalogue: CatalogueItem[], radio: RadioHost, stations: Station[], extra: { guide: GuideLine[]; chatter: ChatterLine[]; ranks: Rank[]; stories: StoryPlace[] }) {
    this.game = game; this.view = view; this.wallet = wallet; this.save = save;
    this.router = router; this.voice = voice; this.sound = sound; this.catalogue = catalogue;
    this.radio = radio; this.stations = stations;
    const days = () => game.dayFrac * 24;
    radio.setFacts({ // what the presenter reads is what the game is really doing
      forecast: () => forecastText(game.forecast, days()),
      travel: () => travelText(game.travelFacts),
      time: () => spokenTime(days()),
      station: () => this.stations[this.save.radio]?.name ?? 'the radio',
    });
    this.ranks = extra.ranks; this.stories = extra.stories;
    this.riders = new Passengers(extra.chatter);
    this.guide = new Guide(extra.guide, save.guide, (text) => { const c = $('coach'); c.textContent = text ?? ''; c.style.display = text ? 'block' : 'none'; });
    this.schemes = { dpad: new Dpad(this.held), joystick: new FloatingJoystick(this.held), tilt: new Tilt(this.held), keyboard: new Keyboard(), gamepad: new Gamepad() };
    router.fallback = this.schemes.joystick;
    this.img = townImage(game);
    game.on((e) => this.onEvent(e));
    this.wire();
    document.body.dataset.hand = save.hand;
    this.refreshPoints();
  }

  find = (id?: string) => this.catalogue.find((c) => c.id === id);
  design(): Design { return this.save.designs[this.save.car] ?? {}; }
  private dead = false; // a new game wipes the save and reloads; nothing may write after that
  store() {
    if (this.dead) return;
    this.save.fuel[this.save.car] = this.game.yours.fuel; // your own car, even while you're out in a work vehicle
    this.save.dmg[this.save.car] = this.game.yours.damage;
    this.save.trip = this.game.snapshot();
    this.save.walls = this.view.wallLog;
    this.save.wallsTown = this.game.town.layoutKey;
    void putGameSave(SAVE_KEY, this.save);
  }

  async applyScheme(id: SchemeId) {
    const got = await this.router.setScheme(this.schemes[id]);
    this.save.input = got;
    document.body.dataset.scheme = got;
    document.body.classList.toggle('no-touch', got === 'keyboard' || got === 'gamepad');
    $('dpad').style.display = got === 'dpad' ? '' : 'none';
    $('steerzone').style.display = got === 'joystick' ? '' : 'none';
    $('tiltcentre').style.display = got === 'tilt' ? '' : 'none';
    this.store();
  }

  tuneRadio() { this.sound.setStation(this.stations[this.save.radio] ?? null); }

  private ticker(line: string) {
    const t = $('ticker');
    t.textContent = line;
    t.style.display = 'block';
    this.tickerClock = 6;
  }

  // The DJ only talks with a station on, and shows what was said on the ticker.
  private djSays(line: string | null) {
    if (line && this.stations[this.save.radio] && this.voice.chatter(line)) this.ticker(line);
  }

  // Riders are part of the job, so their words show even with the sound off. A sleeper says nothing.
  private riderSays(moment: Parameters<Passengers['say']>[0]) {
    const q = this.game.quest;
    if (q?.offer.type !== 'passenger' || q.offer.twist === 'sleeping' || q.phase !== 'Active') return;
    const line = this.riders.say(moment);
    if (line) { this.voice.chatter(line); this.ticker(line); }
  }

  private newJobTips(o: Game['offers'][number]) {
    this.guide.fire('follow_route');
    if (o.twist) this.guide.fire('twist');
    if (o.regular) this.guide.fire('regular');
    if (o.carJob) this.guide.fire('car_job');
    if (o.rematch) this.guide.fire('ghost');
  }
  private djReacts(topic: RadioTopic) { this.djSays(this.radio.react(topic)); }

  // ---- input wiring ----
  private wire() {
    const hold = (id: string, key: keyof Held) => {
      const el = $(id);
      const set = (on: boolean) => { this.held[key] = on; el.classList.toggle('on', on); };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); set(true); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, () => set(false));
    };
    hold('pad-left', 'left'); hold('pad-right', 'right'); hold('pad-go', 'go'); hold('pad-brake', 'brake');

    const zone = $('steerzone'), stick = $('stick'), knob = $('knob'), js = this.schemes.joystick as FloatingJoystick;
    let id: number | null = null, ox = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; ox = e.clientX;
      zone.setPointerCapture(id);
      const r = zone.getBoundingClientRect();
      stick.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;opacity:1`;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = Math.max(-STICK_RADIUS, Math.min(STICK_RADIUS, e.clientX - ox));
      js.offsetX = dx;
      knob.style.transform = `translateX(${dx}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null; js.offsetX = 0;
      stick.style.cssText = '';
      knob.style.transform = '';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    $('btn-cam').onclick = () => {
      this.save.camera = this.view.nextCamera();
      this.toast(CAMERA_NAMES[this.save.camera]);
      this.store();
    };
    $('tiltcentre').onclick = () => (this.schemes.tilt as Tilt).recentre();
    $('btn-jobs').onclick = () => this.openJobs();
    $('btn-map').onclick = () => this.openMap();
    $('btn-pause').onclick = () => this.openPause();
    $('btn-controls').onclick = () => this.openControls();
    $('roadchip').onclick = () => this.openRoad();
    $('points').onclick = () => this.openPoints();
    $('btn-phone').onclick = () => this.openPhone();
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'c') $('btn-cam').click();
      if (e.key.toLowerCase() === 'm') this.openMap();
      if (e.key.toLowerCase() === 'j') this.openJobs();
      if (e.key.toLowerCase() === 'f') this.door();
    });
  }

  // ---- events ----
  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'cue': this.voice.say(cueKey(e.cue)); break;
      case 'recalculating': this.voice.say('recalculating'); break;
      case 'foot':
        this.view.footChanged();
        this.padLabels();
        this.store();
        break;
      case 'bus':
        if (e.what === 'bell') { this.sound.chime(1180); this.voice.say('bus_stopping'); break; } // says it and shows it
        this.view.footChanged();
        if (e.what === 'on') { const r = this.game.rideRoute, on = r ? `On the ${r.name} ${r.via}` : 'On the bus'; this.toast(e.fare ? `${on}. Fare paid, ${e.fare} Points. Ring the bell before your stop` : `${on}. Ring the bell before your stop`); }
        else this.toast('Off the bus');
        this.store();
        break;
      case 'fuelLow':
        this.voice.say(e.level === 'red' ? 'fuel_critical' : 'fuel_low');
        this.djReacts('fuel_low');
        this.guide.fire('fuel');
        break;
      case 'driveState':
        if (e.state === 'Stranded') this.openStranded();
        this.store();
        break;
      case 'questStarted': this.toast(`${e.offer.title}: head to ${e.offer.startName}`); this.newJobTips(e.offer); break;
      case 'questPhase': {
        this.toast(e.label);
        this.sound.chime(660);
        const o = this.game.quest?.offer;
        if (o && o.id !== this.boarded) {
          this.boarded = o.id;
          this.guide.fire(o.type);
          this.riderSays('board');
        }
        break;
      }
      case 'questDone':
        this.sound.chime(990);
        if (e.offer.type === 'passenger') this.riderSays((this.game.quest?.care ?? 1) > 0.6 ? 'arrive_happy' : 'arrive_cross');
        this.jobsDone++;
        if (e.pay) this.guide.fire('garage');
        if (this.jobsDone === 2) this.guide.fire('goals');
        if (this.jobsDone === 3) this.guide.fire('finds');
        this.toast(e.pay ? `${e.grade}! +${e.pay} Points` : `${e.grade}: no pay this time`);
        this.djReacts('job_done');
        this.store();
        break;
      case 'questFailed': this.toast(`Job lost: ${e.reason}`); this.djReacts('job_lost'); break;
      case 'streak':
        this.toast(`${$('toast').textContent}, ${e.jobs} in a row`);
        this.djReacts('streak');
        this.guide.fire('streak');
        break;
      case 'hardStop': this.riderSays('hard_stop'); break;
      case 'rank': {
        const r = this.ranks.find((x) => x.level === e.level), opens = RANK_UNLOCKS[e.level];
        this.sound.chime(1100);
        this.banner(`You are now ${r?.name ?? `rank ${e.level}`}${opens ? `. New: ${opens}` : ''}`, false, 5);
        this.guide.fire('rank');
        this.store();
        break;
      }
      case 'goal':
        this.sound.chime(1200);
        this.toast(`Goal done: ${e.goal.text}. +${e.pay} Points`);
        this.store();
        break;
      case 'event':
        if (e.card) {
          this.banner(e.card.title, false, 4);
          this.voice.chatter(e.card.text);
          this.ticker(e.card.text);
        }
        break;
      case 'regular':
        this.banner(`${e.name}: ${e.thanks}`, false, 5);
        if (e.finale) this.toast(`${this.stories.find((s) => s.id === e.id)?.name ?? 'A new place'} has opened! +${e.finale} Points`);
        this.store();
        break;
      case 'found':
        this.sound.chime(1320);
        this.toast(`Found ${e.find.name}! +${e.pay} Points (${e.total} of ${e.of})`);
        this.store();
        break;
      case 'ghost':
        if (e.beat !== null) this.toast(`New best: ${e.ghost.time}s, down from ${e.beat}s`);
        this.store();
        break;
      case 'points': this.refreshPoints(); break;
      case 'goodDriving': this.ticker(`+${e.pay} Points for clean driving`); break;
      case 'bump': this.sound.crash(e.speed); this.riderSays('bump'); break;
      case 'road': {
        const lines = (roadLines as RoadLine[]).filter((l) => l.moment === e.moment), line = lines[Math.floor(Math.random() * lines.length)]?.text ?? e.moment;
        const money = e.pay > 0 ? ` +${e.pay} Points` : e.pay < 0 ? ` ${e.pay} Points` : '', licence = e.points ? ` ${e.points} licence points` : '';
        if (e.pay > 0) this.sound.chime(880);
        if (e.moment === 'course' || e.moment === 'pulled_over' || e.moment === 'drove_off') this.banner(`${line}${money}${licence}`, true, 4);
        else this.toast(`${line}${money}${licence}`);
        this.store();
        break;
      }
      case 'offers': break;
      case 'shift':
        this.view.setCar(this.design(), this.save.driver);
        this.view.footChanged();
        this.padLabels();
        if (e.what === 'on') { const s = this.game.shift!; this.toast(`Signed on: ${s.rank.title}, in the ${carById(s.vehicle).name}. ${s.task ? s.task.title : ''}`); }
        else this.toast(`Signed off. This shift earned ${e.earned} Points${this.game.foot ? '. Your car is where you left it: the sat nav shows the way' : ''}`);
        this.store();
        break;
      case 'shiftPaid': this.toast(`${e.title}: +${e.pay} Points${e.onTime ? ', on time' : ''}${e.note ? `. ${e.note}` : ''}`); this.sound.chime(880); this.store(); break;
      case 'shiftPhase': this.ticker(e.label); break;
      case 'careerRank': { const r = CAREERS[e.career].ranks[e.rank]; this.toast(`Promoted: ${r.title}. ${r.opens}`); this.sound.chime(1320); break; }
    }
  }

  banner(text: string, urgent = false, seconds = 3) {
    const b = $('banner');
    b.textContent = text;
    b.className = urgent ? 'urgent' : '';
    b.style.display = 'block';
    this.bannerClock = seconds;
  }

  toast(text: string) {
    const t = $('toast');
    t.textContent = text;
    t.style.display = 'block';
    this.toastClock = 2.6;
  }

  refreshPoints() { $('points').textContent = `${this.wallet.points().toLocaleString('en-GB')} Points`; }

  // ---- per-frame HUD ----
  frame(dt: number) {
    const g = this.game, p = g.player;
    if ((this.bannerClock -= dt) <= 0) $('banner').style.display = 'none';
    if ((this.toastClock -= dt) <= 0) $('toast').style.display = 'none';
    if ((this.tickerClock -= dt) <= 0) $('ticker').style.display = 'none';
    const board = g.stopBoard;
    $('speed').textContent = g.ride ? `On the ${g.rideRoute!.name}` : board ? board.map((b) => `${b.name} ${dueText(b.due)}`).join(', ') : g.foot ? `On foot${g.foot.running ? ', running' : ''}` : `${Math.round(p.kmh)} km/h`;
    if (this.save.input === 'gamepad' && this.padAction.pressed()) this.door();
    const stop = g.atStop;
    const zone = g.schoolRun && !g.foot ? zoneAt(g.schools, p) : null; // into a school's 20 mph stretch while children are about
    if (zone !== this.lastZone) { this.lastZone = zone; if (zone) this.banner(`${zone.name}: children about, 20 mph`, false, 4); }
    if (stop !== this.lastStop) { this.lastStop = stop; if (stop) this.banner(`Bus stop for the ${g.town.routesAt(stop).map((r) => r.name).join(' and ')}. Wait here and the bus pulls in for you: a single is ${g.busFare} ${g.busFare === 1 ? 'Point' : 'Points'}`, false, 4); }
    const pct = g.foot ? g.energy : p.fuel / p.car.tank; // out of the car, the chip shows your energy for running
    $('fuelfill').style.width = `${pct * 100}%`;
    $('fueltext').textContent = g.foot ? `Energy ${Math.round(g.energy * 100)}%` : g.shift ? 'Fuel: on the depot' : `Fuel ${Math.round(p.fuel)} L`;
    $('fuelchip').className = pct < WARN_CRITICAL_PCT ? 'chip crit' : pct < WARN_LOW_PCT ? 'chip low' : 'chip';
    this.bodywork();

    if ((this.saveClock -= dt) <= 0) { this.saveClock = AUTOSAVE_S; this.store(); } // a closed tab or a crash loses a few seconds at most
    this.clearMirror();
    if ((this.miniClock -= dt) <= 0) { this.miniClock = 1 / 15; drawMini(this.mini, g, this.img); }
    this.compass();
    this.tracker();
    this.actions();
    this.sound.engine(Math.abs(p.speed) / p.vMax, p.state === 'Driving', p.throttle);
    this.sound.road(this.view.slide, Math.abs(p.speed) / p.vMax, g.rain);
    this.sound.street(p.blue ? 8 : g.traffic.sirenFrom(p), g.parked.loudest(p)); // your own siren, heard from the cab, when you are the one on blue lights
    this.sound.tick();
    const sense = g.road, licence = sense.points;
    const arrow = sense.trend >= TREND_SHOWN ? ' ▲' : sense.trend <= -TREND_SHOWN ? ' ▼' : '';
    $('roadchip').textContent = `Road sense ${Math.round(sense.rec.score)}${arrow}${sense.bonus ? `, +${Math.round(sense.bonus * 100)}% pay` : ''}${licence ? `, ${licence} pts` : ''}`;
    $('roadchip').className = `chip${arrow === ' ▲' ? ' rising' : arrow ? ' falling' : ''}`;
    const streak = $('streak');
    streak.hidden = g.streak < 1;
    if (g.streak > 0) streak.textContent = `Streak ${g.streak}: next +${Math.round(streakBonus(g.streak) * 100)}%`;
    this.djSays(this.radio.tick(dt, { night: isNight(g.skyFrac), rain: g.rain > 0.3, rush: RUSH.some(([a, b]) => g.dayFrac >= a && g.dayFrac < b) }));
    this.guide.tick(dt);
    const q = g.quest;
    if (q?.phase === 'Active' && q.offer.type === 'passenger' && q.offer.twist !== 'sleeping') {
      const line = this.riders.tick(dt, q.care);
      if (line) { this.voice.chatter(line); this.ticker(line); }
    }
    if (p.state === 'Parked' && !g.foot && !g.quest && !g.nav && this.hintClock < 0) { this.hintClock = 9; this.banner(this.hint()); }
    this.hintClock -= dt;
  }

  /** The bodywork outline: each face of the little car fills red in step with how bent that side is. */
  private bodywork() {
    const d = this.game.player.dents;
    const key = SIDES.map((s) => Math.round(d[s] * 40)).join(); // repaint on a 2.5% move, not every frame
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    let worst: Side = 'front';
    for (const s of SIDES) if (d[s] > d[worst]) worst = s;
    for (const s of SIDES) $svg(`dent-${s}`).style.opacity = String(Math.min(1, d[s]));
    $('dmgtext').textContent = d[worst] < 0.02 ? 'Undamaged' : `${worst} ${Math.round(d[worst] * 100)}% dented`;
  }

  private hint() {
    const g = this.game;
    return g.player.fuel < g.player.car.tank * WARN_LOW_PCT ? 'Low on fuel: pick a short job' : 'Tap Jobs to find work';
  }

  private compass() {
    const g = this.game, c = $('compass');
    const nav = g.nav;
    c.style.display = nav ? 'block' : 'none';
    if (!nav) return;
    const next = nav.next();
    const t = nav.route.points.find((_, i) => nav.route.cum[i] >= Math.min(nav.travelled + 40, nav.route.length)) ?? nav.route.points.at(-1)!;
    const rel = Math.atan2(t.x - g.player.x, t.z - g.player.z) - g.player.heading;
    c.style.transform = `rotate(${-rel}rad)`;
    if (next?.kind === 'arrive' && !g.quest) c.dataset.left = String(Math.round(next.at - nav.travelled));
  }

  private tracker() {
    const g = this.game, q = g.quest, el = $('tracker');
    let key = '', html = '';
    const s = g.shift, t = s?.task;
    if (s && t) {
      const left = Math.max(0, Math.round(dist(t.at, g.player))), due = Math.round(s.dueIn ?? 0);
      const clock = t.kind === 'stop' ? (due >= 0 ? `due in ${due}s${t.timing ? ', timing point' : ''}` : `${-due}s late`) : t.kind === 'return' ? '' : due >= 0 ? `${due}s to target` : 'past target: still paid';
      const held = s.held > 0 ? `<small>${esc(t.kind === 'stop' ? 'Doors open' : 'Working')}: ${Math.max(0, Math.ceil(t.hold - s.held))}s</small>` : '';
      key = `shift|${t.title}|${t.text}|${Math.round(left / 10)}|${clock}|${Math.ceil(t.hold - s.held)}|${s.held > 0}`;
      html = `${esc(t.title)}<small>${esc(t.text)}</small><small>${left} m${clock ? `, ${esc(clock)}` : ''}${g.player.blue ? ', blue lights' : ''}</small>${held}`;
    } else if (q) {
      const left = Math.max(0, Math.round(dist(q.target, g.player)));
      const sub = q.phase === 'HeadingToStart' ? `Go to ${q.offer.startName}` : q.offer.type === 'trial' ? `${q.gate}/${q.offer.gates.length} checkpoints, ${Math.round(q.elapsed)}s of ${q.offer.rematch ? `your ${q.offer.rematch.time}s` : `${Math.round(q.offer.goldSeconds)}s gold`}` : `Take it to ${q.offer.endName}`;
      const twist = q.offer.twist ? `${TWIST_RULES[q.offer.twist].label}, care ${Math.round(q.care * 100)}%` : '';
      key = `${q.offer.title}|${sub}|${Math.round(left / 10)}|${twist}`;
      html = `${esc(q.offer.title)}<small>${esc(sub)}, ${left} m</small>${twist ? `<small>${esc(twist)}</small>` : ''}`;
    } else if (g.nav) {
      const left = g.nav.route.length - g.nav.travelled;
      key = `way|${g.dest}|${distanceText(left)}|${etaText(left)}`;
      html = `${esc(g.dest ?? 'Waypoint')}<small>${distanceText(left)}, about ${etaText(left)}</small>`;
    }
    if (g.nav) { // the next instruction, on top, as a sat nav shows it
      const next = g.nav.next(), turn = turnText(next, next ? next.at - g.nav.travelled : 0);
      key = `${turn}|${key}`;
      html = `<span class="turn">${esc(turn)}</span>${html}`;
    }
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    el.innerHTML = html;
    el.style.display = key ? 'block' : 'none';
  }

  /** The touch pedals walk you when you're out of the car. */
  padLabels() {
    $('pad-go').textContent = this.game.foot ? 'Walk' : 'Go';
    $('pad-brake').textContent = this.game.foot ? 'Back' : 'Brake';
  }

  /** The one action button, F and Y: whatever fits where you are. Off or on a bus, in or out of the car, or a door. */
  private door() {
    const g = this.game;
    if (g.ride) { if (!g.getOff() && !g.ringBell()) this.toast('Bell rung: the bus stops at the next stop'); return; }
    if (g.busHere) return this.boardBus();
    const base = g.atBase;
    if (base && (g.foot || g.shift)) return this.openBase(base);
    if (g.foot) {
      if (g.getIn()) return;
      const d = g.atDoor;
      if (d) this.openDoor(d); else this.toast('Walk back to your car to get in');
      return;
    }
    const why = g.cantGetOut;
    if (why) this.toast(why); else g.getOut();
  }

  private boardBus() {
    const fare = this.save.debug ? 0 : this.game.busFare;
    if (!this.game.board(fare)) this.toast(`The fare is ${this.game.busFare} Points, and you have ${this.wallet.points()}`);
  }

  /** At a place's front door: its counter, if it's a shop, and the jobs that start here. Going inside is a counter
   *  sheet, not a walk-in interior (decided 2026-11-05). */
  private openDoor(d: Door) {
    if (d.plot === this.game.town.centre?.plot) return this.openCentre(d);
    const g = this.game, place = placeAt(g.town, g.content.places, d.plot), here = g.offers.filter((o) => o.start === d.plot), shop = shopFor(place?.id);
    const jobs = g.quest ? '<p>Finish the job you are on to take another.</p>' : here.length ? here.map((o) => `<div class="offer"><div><b>${esc(o.title)}</b><span>${esc(o.text)}</span><span>${o.basePay} to ${o.maxPay} Points</span></div><button class="primary" data-id="${o.id}">Take</button></div>`).join('') : '<p>No jobs from here just now.</p>';
    const kind = esc(place ? place.kind[0].toUpperCase() + place.kind.slice(1) : '');
    const c = this.sheet('dialog', `<h2>${esc(place?.name ?? 'A front door')}</h2>${shop ? `<p>${esc(shop.line)}</p>${this.counter(shop)}<p>Jobs from here</p>` : `<p>${kind}. The door is shut for now.</p>`}${jobs}<div class="row end"><button class="primary" id="x">Back to the street</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
    for (const b of c.querySelectorAll<HTMLElement>('[data-id]')) b.onclick = () => { g.accept(Number(b.dataset.id)); this.close('dialog'); };
    this.wireCounter(c, () => this.openDoor(d));
  }

  /** The shopping centre: one door, and a tab for each of its shops. */
  private openCentre(d: Door, unit = 0) {
    const units = centreUnits(), u = units[Math.min(unit, units.length - 1)];
    const tabs = units.map((x, i) => `<button class="ghost ${x === u ? 'on' : ''}" data-unit="${i}">${esc(x.name)}</button>`).join('');
    const c = this.sheet('dialog', `<h2>Shopping centre</h2>${u ? `<div class="tabs">${tabs}</div><p>${esc(u.line)}</p>${this.counter(u)}` : '<p>The shops are still being fitted out.</p>'}<div class="row end"><button class="primary" id="x">Back to the street</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
    for (const b of c.querySelectorAll<HTMLElement>('[data-unit]')) b.onclick = () => this.openCentre(d, Number(b.dataset.unit));
    this.wireCounter(c, () => this.openCentre(d, unit));
  }

  /** A shop's counter: what's for sale and what it costs. A motor shop sells the garage's paint and parts. */
  private counter(shop: Shop): string {
    const points = `<div class="chip" style="background:#eef1f7">${this.wallet.points().toLocaleString('en-GB')} Points</div>`;
    if (shop.sells === 'motor') return `${points}<p>Paint and parts for your ${esc(carById(this.save.car).name)}</p><div class="items">${CAR_KINDS.map((k) => this.itemCards(k)).join('')}</div>`;
    if (!shop.stock.length) return '<p>Nothing to buy here yet.</p>';
    const food = shop.stock.some((x) => isFood(x.kind)), price = (x: Good) => (this.save.debug ? 'Free (debug)' : `${x.price} ${x.price === 1 ? 'Point' : 'Points'}`);
    const row = (x: Good) => {
      const swatch = (x.colors ?? []).map((h) => `<i class="swatch" style="background:${h}"></i>`).join('');
      const key = goodKey(shop, x);
      if (isFood(x.kind)) return `<div class="offer"><div><b>${esc(x.name)}</b><span>${GOOD_LABEL[x.kind]}, ${x.kcal} kcal</span></div><button class="primary" data-buy="${key}">Buy, ${price(x)}</button></div>`;
      const slot = slotOf(x)!, worn = this.save.driver[slot] === key, owned = this.wallet.owns(key);
      return `<div class="offer"><div><b>${swatch} ${esc(x.name)}</b><span>${GOOD_LABEL[x.kind]}</span></div><button class="${worn ? 'ghost' : 'primary'}" data-buy="${key}">${worn ? 'Take off' : owned ? 'Wear' : `Buy, ${price(x)}`}</button></div>`;
    };
    return `${points}${food ? `<p>Energy for running: ${Math.round(this.game.energy * 100)}%. Eat or drink something to fill it.</p>` : ''}${shop.stock.map(row).join('')}`;
  }

  /** The counter's buttons, and the sheet drawn again after each buy. */
  private wireCounter(c: HTMLElement, again: () => void) {
    for (const b of c.querySelectorAll<HTMLElement>('[data-buy]')) b.onclick = () => { this.buyGood(b.dataset.buy!); again(); };
    for (const b of c.querySelectorAll<HTMLElement>('[data-item]')) b.onclick = () => this.pickItem(b.dataset.item!, again);
  }

  /** Food is eaten at the counter; clothes are bought once, then worn or taken off. */
  private buyGood(key: string) {
    const x = goodById(key);
    if (!x) return;
    if (isFood(x.kind)) {
      if (!eatGood(this.game, this.wallet, x, this.save.debug)) return this.toast(`You need ${x.price - this.wallet.points()} more Points`);
      this.toast(`${x.name}: energy ${Math.round(this.game.energy * 100)}%`);
    } else {
      if (!this.wallet.owns(key) && !this.save.debug) {
        if (!this.wallet.spend(x.price, `Bought ${x.name}`)) return this.toast(`You need ${x.price - this.wallet.points()} more Points`);
        this.wallet.grant(key);
      }
      this.wear(slotOf(x)!, key);
    }
    this.refreshPoints();
    this.store();
  }

  /** Put something on, or take it off if it's already on: in the car and out of it, you're one person. */
  private wear(slot: keyof Driver, id: string) {
    const d = this.save.driver;
    d[slot] = d[slot] === id ? undefined : id;
    this.view.setCar(this.design(), d);
    this.view.you.setLook(this.save.look, d);
  }

  /** Buttons that only make sense where the car is right now. */
  private actions() {
    const g = this.game, p = g.player, foot = g.foot;
    const atHome = !foot && dist(g.town.home.road, p) < 20 && Math.abs(p.speed) < 3 && !g.quest;
    const pump = !foot && g.canRefuel;
    const low = !foot && p.fuel / p.car.tank < WARN_LOW_PCT && !pump;
    const bent = p.damage > 0.02;
    const out = !foot && Math.abs(p.speed) <= STILL_MPS && p.state !== 'Refuelling', ride = g.ride, back = !!foot && !ride && foot.canReach(p);
    const bus = !!g.busHere, door = g.atDoor, stopped = !!ride && ride.bus.dwell > 0;
    const base = g.atBase, work = !!g.shift;
    const key = [atHome, pump, low, p.state === 'Stranded', bent, out, back, bus, door?.plot.x, !!ride, ride?.rang, stopped, base?.career, work].join();
    if (key === this.actionsKey) return;
    this.actionsKey = key;
    const box = $('actions');
    box.innerHTML = '';
    const add = (label: string, fn: () => void, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = cls;
      b.onclick = fn;
      box.append(b);
    };
    if (base && (foot || work)) add(work ? 'Sign off' : `Sign on: ${CAREERS[base.career].name}`, () => this.openBase(base), 'primary');
    if (atHome && !work) add('Garage', () => this.openGarage(), 'primary');
    if (atHome && bent) add('Repair', () => this.repair());
    if (pump) add('Refuel', () => this.openFuel(), atHome ? '' : 'primary');
    if (low) add('Route to station', () => { g.routeToStation(); this.banner('Routing to the nearest station'); });
    if (out) add('Get out', () => this.door());
    if (back) add('Get in', () => this.door(), 'primary');
    if (bus) add(`Get on, ${g.busFare} ${g.busFare === 1 ? 'Point' : 'Points'}`, () => this.boardBus(), 'primary');
    if (door && !back) add(door.plot === g.town.centre?.plot ? 'Shopping centre' : placeAt(g.town, g.content.places, door.plot)?.name ?? 'Door', () => this.openDoor(door));
    if (ride && stopped) add('Get off', () => g.getOff(), 'primary');
    else if (ride && !ride.rang) add('Ring the bell', () => g.ringBell(), 'primary');
  }

  /** Straighten the bodywork at home: a flat rate per percent of damage, free in debug. */
  private repair() {
    const p = this.game.player;
    const cost = Math.ceil(p.damage * 100 * REPAIR_RATE);
    if (!this.save.debug && !this.wallet.spend(cost, 'Bodywork repair')) return this.toast(`You need ${cost - this.wallet.points()} more Points`);
    p.mend(0);
    this.refreshPoints();
    this.store();
    this.toast(this.save.debug ? 'Bent out straight, free in debug' : `Bodywork straight again, ${cost} Points`);
  }

  // ---- panels ----
  /** A basic phone: 999, which asks which service as the real one does, and recovery. */
  private openPhone() {
    const g = this.game, moving = Math.abs(g.player.speed) > 2, warn = moving ? '<p class="warn">You\'re moving. Pull over first: a phone at the wheel is 6 licence points. Only a genuine 999 call is allowed.</p>' : '';
    const call = (who: 'police' | 'fire' | 'ambulance' | 'recovery', said: string) => {
      const ok = g.phone(who);
      this.close('dialog');
      this.toast(ok ? said : 'Everyone\'s out on a job. Try again soon');
      this.store();
    };
    const c = this.sheet('dialog', `<h2>Phone</h2>${warn}<p>Who do you want to call?</p><div class="row end"><button class="ghost" id="x">Hang up</button><button class="ghost" id="tow">Recovery</button><button class="primary" id="n999">999</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
    c.querySelector<HTMLElement>('#tow')!.onclick = () => call('recovery', 'A recovery truck is on its way');
    c.querySelector<HTMLElement>('#n999')!.onclick = () => {
      const d = this.sheet('dialog', `<h2>999</h2>${warn}<p>Emergency. Which service?</p><div class="row end"><button class="ghost" id="x">Hang up</button><button class="ghost" id="police">Police</button><button class="ghost" id="fire">Fire</button><button class="primary" id="ambulance">Ambulance</button></div>`);
      d.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
      d.querySelector<HTMLElement>('#police')!.onclick = () => call('police', 'The police are on their way');
      d.querySelector<HTMLElement>('#fire')!.onclick = () => call('fire', 'The fire service is on its way');
      d.querySelector<HTMLElement>('#ambulance')!.onclick = () => call('ambulance', 'An ambulance is on its way');
    };
  }

  private openRoad() {
    const s = this.game.road, r = s.rec, ago = (at: number) => { const m = Math.floor((r.clock - at) / 60); return m < 1 ? 'just now' : `${m} min ago`; };
    const rows = (r.log ?? []).slice(0, ROAD_ROWS).map((e) => `<div class="goal roadrow ${e.by > 0 ? 'good' : e.by < 0 ? 'bad' : ''}"><span>${e.by > 0 ? '▲' : e.by < 0 ? '▼' : '•'} ${esc(ROAD_NAMES[e.moment])}</span><span>${e.by > 0 ? `+${e.by}` : e.by < 0 ? e.by : ''} · ${ago(e.at)}</span></div>`).join('');
    const pay = s.bonus ? `Your jobs pay ${Math.round(s.bonus * 100)}% more.` : 'Reach 60 to earn more on every job.';
    const c = this.sheet('dialog', `<h2>Road sense: ${Math.round(r.score)}</h2><p>${pay} ${r.good} good moments, ${r.bad} bad. Licence points: ${s.points} of 12.</p>${rows || '<p>Nothing yet. Wait at a red or stop at a zebra to start your record.</p>'}<div class="row end"><button class="primary" id="x">Keep driving</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
  }

  /** In the cockpit, the left-hand panels drop below the interior mirror, so it can be seen. */
  private clearMirror() {
    const side = document.querySelector<HTMLElement>('#hud .bar .side')!, m = this.view.mirrorRect();
    const top = side.offsetTop, drop = m && m.left < side.offsetLeft + side.offsetWidth ? Math.max(0, Math.round(m.bottom + 6 - top)) : 0;
    if (side.dataset.drop !== String(drop)) { side.dataset.drop = String(drop); side.style.transform = drop ? `translateY(${drop}px)` : ''; side.classList.toggle('dropped', drop > 0); }
  }

  /** The Points history: each change, newest first, with what it was for and the balance after. */
  private openPoints() {
    const today = new Date().toDateString(), when = (iso: string) => {
      const d = new Date(iso), t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return d.toDateString() === today ? t : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${t}`;
    };
    const lines = this.wallet.ledger, earned = lines.filter((l) => l.n > 0).reduce((a, l) => a + l.n, 0), spent = lines.filter((l) => l.n < 0).reduce((a, l) => a - l.n, 0);
    const rows = lines.map((l) => `<div class="goal roadrow ${l.n > 0 ? 'good' : 'bad'}"><span>${l.n > 0 ? `+${l.n}` : l.n} · ${esc(l.why)}</span><span>${l.total.toLocaleString('en-GB')} · ${when(l.at)}</span></div>`).join('');
    const c = this.sheet('dialog', `<h2>Points: ${this.wallet.points().toLocaleString('en-GB')}</h2><p>${lines.length ? `The last ${lines.length} changes: ${earned.toLocaleString('en-GB')} in, ${spent.toLocaleString('en-GB')} out. Driving cleanly earns a little every kilometre.` : 'Nothing yet. Jobs, goals, finds and clean driving earn Points; fuel and repairs spend them.'}</p><div class="ledger">${rows}</div><div class="row end"><button class="primary" id="x">Keep driving</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
  }

  private sheet(id: string, html: string): HTMLElement {
    const s = $(id), card = s.querySelector('.card') as HTMLElement;
    card.innerHTML = html;
    s.classList.add('open');
    this.paused = true;
    return card;
  }
  close(id: string) {
    $(id).classList.remove('open');
    this.paused = [...document.querySelectorAll('.sheet.open')].length > 0;
  }

  private openToday() {
    const g = this.game, rep = g.progress.rep, rank = g.rank, r = this.ranks.find((x) => x.level === rank), next = RANK_REP[rank + 1];
    const from = RANK_REP[rank], pct = next ? ((rep - from) / (next - from)) * 100 : 100;
    const opens = next ? RANK_UNLOCKS[rank + 1] : '';
    const goals = g.goals.map((goal) => {
      const done = g.progress.daily.done.includes(goal.id), n = Math.floor(g.progress.daily.counts[goal.kind] ?? 0);
      return `<div class="goal ${done ? 'done' : ''}"><span>${esc(goal.text)}</span><span>${done ? 'Done' : `${Math.min(n, goal.target)} of ${goal.target}`}</span></div>`;
    }).join('');
    const stories = (g.content.regulars ?? []).filter((x) => g.progress.arcs[x.id]).map((x) => `<div class="goal"><span>${esc(x.name)}, ${esc(x.role)}</span><span>${g.progress.arcs[x.id]} of ${x.jobs.length}</span></div>`).join('');
    const c = this.sheet('jobs', `<h2>${esc(r?.name ?? 'Driver')}</h2><p>${esc(r?.blurb ?? '')}</p>
      <div class="rankbar"><i style="width:${pct}%"></i></div>
      <p>${next ? `${next - rep} more to the next rank${opens ? `. Unlocks: ${esc(opens)}` : ''}` : 'Top rank. The town is yours.'}</p>
      <h2>Today</h2>${goals}${stories ? `<h2 style="margin-top:10px">Stories</h2>${stories}` : ''}
      <div class="row end"><button class="ghost" id="back">Back to jobs</button><button class="primary" id="x">Keep driving</button></div>`);
    c.querySelector<HTMLElement>('#back')!.onclick = () => this.openJobs();
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
  }

  openJobs() {
    const g = this.game;
    if (g.shift) return this.openShift();
    if (g.quest) {
      const q = g.quest;
      const c = this.sheet('jobs', `<h2>${esc(q.offer.title)}</h2><p>${esc(q.offer.text)}</p><div class="row end"><button class="ghost" id="today">Today</button><button class="ghost" id="abandon">Give up this job</button><button class="primary" id="x">Keep driving</button></div>`);
      c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
      c.querySelector<HTMLElement>('#today')!.onclick = () => this.openToday();
      c.querySelector<HTMLElement>('#abandon')!.onclick = () => { g.failQuest('You gave it up'); this.close('jobs'); };
      return;
    }
    const kinds = { delivery: 'Delivery', passenger: 'Passenger', trial: 'Time trial' };
    const reach = g.player.fuel;
    const tag = (o: Game['offers'][number]) => {
      const job = o.business ? `From ${o.business}` : o.regular ? `${o.regular.name}: part ${o.regular.step + 1} of ${o.regular.total}` : o.rematch ? `Your best: ${o.rematch.time}s` : o.carJob ? CAR_JOBS[o.carJob].label : o.twist ? TWIST_RULES[o.twist].label : '';
      const t = [job, o.market ? `${g.event?.title ?? 'Market day'}: +${MARKET_BOOST * 100}%` : ''].filter(Boolean).join(' · ');
      return t ? `<span class="tag">${esc(t)}</span>` : '';
    };
    const streak = g.streak ? `<p>${g.streak} in a row: the next job pays ${Math.round(streakBonus(g.streak) * 100)}% more. A tow, fast travel or a lost job ends it.</p>` : '';
    const rows = g.offers.map((o) => `<div class="offer"><div><b>${esc(o.title)} · ${kinds[o.type]}</b>${tag(o)}<span>${esc(o.text)}</span><span>${o.routeKm.toFixed(1)} km, ${o.basePay} to ${o.maxPay} Points, about ${Math.ceil(o.litres)} L${o.litres > reach ? ' · <em>refuel first</em>' : ''}</span></div><button class="primary" data-id="${o.id}">Take</button></div>`).join('');
    const c = this.sheet('jobs', `<h2>Jobs nearby</h2>${streak}${rows}<div class="row end"><button class="ghost" id="careers">Careers</button><button class="ghost" id="today">Today</button><button class="ghost" id="x">Close</button></div>`);
    c.querySelector<HTMLElement>('#today')!.onclick = () => this.openToday();
    c.querySelector<HTMLElement>('#careers')!.onclick = () => this.openCareers();
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
    for (const b of c.querySelectorAll<HTMLElement>('[data-id]')) b.onclick = () => { g.accept(Number(b.dataset.id)); this.close('jobs'); };
  }

  /** Every career: your rank in it, what it pays, and the way to where you sign on. */
  openCareers() {
    const g = this.game, jobs = g.progress.careers ?? {};
    const rows = CAREER_IDS.map((id) => {
      const k = CAREERS[id], n = jobs[id] ?? 0, r = careerRank(n), rank = k.ranks[r], next = RANK_JOBS[r + 1], base = g.bases.find((b) => b.career === id);
      return `<div class="offer"><div><b>${esc(k.name)} · ${esc(rank.title)}</b><span>${payLine(rank)}. ${esc(rank.opens)}.</span><span>${next !== undefined ? `${n} of ${next} jobs to ${esc(k.ranks[r + 1].title)}` : 'Top rank'}${base ? ` · signs on at ${esc(base.name)}` : ''}</span></div>${base ? `<button class="primary" data-go="${id}">Go there</button>` : ''}</div>`;
    }).join('');
    const c = this.sheet('jobs', `<h2>Careers</h2><p>Sign on at a station or depot, take its vehicle out, and be paid the job's real hourly rate for the time each task is booked to take. Walk up to the front to sign on.</p>${rows}<div class="row end"><button class="ghost" id="back">Jobs</button><button class="primary" id="x">Close</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
    c.querySelector<HTMLElement>('#back')!.onclick = () => this.openJobs();
    for (const b of c.querySelectorAll<HTMLElement>('[data-go]')) b.onclick = () => {
      const base = g.bases.find((x) => x.career === b.dataset.go)!;
      g.setWaypoint(base.at, base.name);
      this.close('jobs');
      this.banner(`Routing to ${base.name}`);
    };
  }

  /** At a station or depot's front: sign on and pick a vehicle, or hand it back. */
  private openBase(base: Base) {
    const g = this.game, k = CAREERS[base.career], n = g.progress.careers?.[base.career] ?? 0, r = careerRank(n), rank = k.ranks[r], next = RANK_JOBS[r + 1];
    if (g.shift) {
      const s = g.shift, here = s.base === base || s.base.career === base.career;
      const c = this.sheet('dialog', `<h2>${esc(base.name)}</h2><p>${esc(s.rank.title)}, this shift so far: ${s.jobs} done, ${s.earned} Points.</p>${here ? '' : '<p>This is another service\'s base: your own car is waiting where you signed on.</p>'}<div class="row end"><button class="ghost" id="stay">Keep working</button><button class="primary" id="off">Sign off</button></div>`);
      c.querySelector<HTMLElement>('#stay')!.onclick = () => this.close('dialog');
      c.querySelector<HTMLElement>('#off')!.onclick = () => { g.signOff(); this.close('dialog'); };
      return;
    }
    const cars = g.vehiclesFor(base.career).map((id) => `<button class="primary" data-car="${id}">Take the ${esc(carById(id).name)}</button>`).join('');
    const c = this.sheet('dialog', `<h2>${esc(base.name)}</h2><p><b>${esc(k.name)} · ${esc(rank.title)}</b></p><p>${payLine(rank)}. ${esc(rank.opens)}.</p><p>${next !== undefined ? `${n} of ${next} jobs to ${esc(k.ranks[r + 1].title)}: ${esc(k.ranks[r + 1].opens)}.` : 'You are at the top of this career.'}</p><p>Your car stays where you left it while you work.${g.quest ? ' Signing on hands back the job you are on.' : ''}</p><div class="row end"><button class="ghost" id="x">Not now</button>${cars}</div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
    for (const b of c.querySelectorAll<HTMLElement>('[data-car]')) b.onclick = () => { this.close('dialog'); if (!g.signOn(base.career, b.dataset.car as FleetId)) this.toast('Walk up to the front to sign on'); };
  }

  /** The shift you're on: what's next, what it's paid so far, and the way out. */
  private openShift() {
    const g = this.game, s = g.shift!, t = s.task;
    const c = this.sheet('jobs', `<h2>${esc(CAREERS[s.career].name)} · ${esc(s.rank.title)}</h2>${t ? `<p><b>${esc(t.title)}</b></p><p>${esc(t.text)}</p>` : ''}<p>${payLine(s.rank)}. This shift: ${s.jobs} done, ${s.earned} Points.</p><p>Head back to ${esc(s.base.name)} to sign off, or end the shift here: the vehicle is taken back for you, and you walk back to your car.</p><div class="row end"><button class="ghost" id="end">End shift now</button><button class="primary" id="x">Keep working</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
    c.querySelector<HTMLElement>('#end')!.onclick = () => { g.signOff(); this.close('jobs'); };
  }

  openMap() {
    const g = this.game;
    const of = g.content.finds?.length ?? 0, clues = g.unfound.slice(0, 3).map((f) => `<li>${esc(f.clue)}</li>`).join('');
    const c = this.sheet('mapsheet', `<div id="worldwrap"><canvas id="world" width="1000" height="1000"></canvas><div id="mapside">
      <h2>Map</h2>
      <button class="primary" id="satnav-open">Sat nav: go to a place</button>
      <p>Or tap a place, or any road, to set a waypoint.</p>
      <details class="legend"><summary>What the marks mean</summary>${legend()}</details>
      <p>Fast travel</p>
      <button class="ghost" id="ft-home">Home</button>
      <button class="ghost" id="ft-station">Nearest station</button>
      ${DISTRICT_IDS.map((id) => `<button class="ghost" data-go="${id}">${DISTRICTS[id].name}</button>`).join('')}
      <button class="ghost" id="clear">Clear waypoint</button>
      <button class="primary" id="x">Back to the road</button>
      <p>Hidden finds: ${of - g.unfound.length} of ${of}</p>
      ${clues ? `<ol class="clues">${clues}</ol>` : ''}
    </div></div>`);
    const w = c.querySelector<HTMLCanvasElement>('#world')!;
    const draw = () => drawWorld(w, g, this.img);
    draw();
    w.onpointerdown = (e) => {
      const r = w.getBoundingClientRect();
      const at = { x: ((e.clientX - r.left) / r.width) * 3000, z: ((e.clientY - r.top) / r.height) * 3000 }, poi = poiNear(poiList(g), at, TAP_POI_M);
      if (poi) { g.setWaypoint(poi.road, poi.name); this.banner(`Routing to ${poi.name}`); } else g.setWaypoint(at);
      draw();
    };
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('mapsheet');
    c.querySelector<HTMLElement>('#satnav-open')!.onclick = () => { this.close('mapsheet'); this.openSatnav(); };
    c.querySelector<HTMLElement>('#clear')!.onclick = () => { g.setWaypoint(null); draw(); };
    const travel = (to: 'home' | 'station' | DistrictId) => this.confirmForfeit(() => { g.fastTravel(to); this.close('mapsheet'); this.store(); });
    c.querySelector<HTMLElement>('#ft-home')!.onclick = () => travel('home');
    c.querySelector<HTMLElement>('#ft-station')!.onclick = () => travel('station');
    for (const b of c.querySelectorAll<HTMLElement>('[data-go]')) b.onclick = () => travel(b.dataset.go as DistrictId);
  }

  /** The sat nav: quick routes to the nearest fuel, home and the services, then everywhere else by group, all measured by road. */
  openSatnav(group: DestGroup | 'Nearby' = 'Nearby') {
    const g = this.game, all = destinations(g), quick = (['Fuel and repairs', 'Home', 'Emergency services'] as const).flatMap((k) => (k === 'Emergency services' ? all.filter((d) => d.group === k) : [nearestIn(all, k)!]));
    const groups = GROUP_ORDER.filter((k) => all.some((d) => d.group === k));
    const shown = group === 'Nearby' ? [...all].sort((a, b) => a.metres - b.metres).slice(0, 12) : all.filter((d) => d.group === group);
    const row = (d: Dest, cls: string, label = d.name) => `<button class="${cls}" data-key="${d.key}">${esc(label)}<small>${distanceText(d.metres)}, about ${etaText(d.metres)}</small></button>`;
    const c = this.sheet('satnav', `<h2>Sat nav</h2>
      ${g.quest ? `<p class="warn">You're on a job, so its route comes first. A place picked here is where the sat nav takes you after.</p>` : ''}
      <div class="navquick">${quick.map((d) => (d.group === 'Fuel and repairs' ? row(d, 'primary', 'Nearest petrol station') : row(d, 'ghost'))).join('')}</div>
      <div class="navgroups">${['Nearby', ...groups].map((k) => `<button class="ghost ${k === group ? 'on' : ''}" data-group="${k}">${k}</button>`).join('')}</div>
      <div class="navlist">${shown.map((d) => row(d, 'navrow')).join('')}</div>
      <div class="row end">${g.waypoint ? '<button class="ghost" id="cancel">Cancel route</button>' : ''}<button class="ghost" id="map">Map</button><button class="primary" id="x">Back to the road</button></div>`);
    for (const b of c.querySelectorAll<HTMLElement>('[data-group]')) b.onclick = () => this.openSatnav(b.dataset.group as DestGroup | 'Nearby');
    for (const b of c.querySelectorAll<HTMLElement>('[data-key]')) b.onclick = () => {
      const d = all.find((x) => x.key === b.dataset.key)!, name = d.group === 'Fuel and repairs' ? 'Petrol station' : d.name;
      g.setWaypoint(d.at, name);
      this.close('satnav');
      this.toast(`Route set: ${name}, ${distanceText(d.metres)}, about ${etaText(d.metres)}`);
      this.store();
    };
    c.querySelector<HTMLElement>('#cancel')?.addEventListener('click', () => { g.setWaypoint(null); this.close('satnav'); this.toast('Route cancelled'); this.store(); });
    c.querySelector<HTMLElement>('#map')!.onclick = () => { this.close('satnav'); this.openMap(); };
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('satnav');
  }

  private confirmForfeit(go: () => void) {
    if (!this.game.quest) return go();
    const c = this.sheet('dialog', `<h2>Lose this job?</h2><p>Fast travel ends ${esc(this.game.quest.offer.title)} with no pay.</p><div class="row end"><button class="ghost" id="no">Keep the job</button><button class="primary" id="yes">Fast travel</button></div>`);
    c.querySelector<HTMLElement>('#no')!.onclick = () => this.close('dialog');
    c.querySelector<HTMLElement>('#yes')!.onclick = () => { this.close('dialog'); go(); };
  }

  openFuel() {
    const g = this.game;
    g.beginRefuel();
    const render = () => {
      const p = g.player, room = Math.ceil(p.car.tank - p.fuel), points = this.wallet.points(), free = this.save.debug;
      const c = this.sheet('fuelshop', `<h2>Fuel</h2><p>${Math.round(p.fuel)} of ${p.car.tank} L in the tank. ${free ? 'Fuel is free in debug mode.' : 'Fuel is 1 Point a litre.'} You have ${points} Points.</p>
        <div class="row"><button data-l="10" class="ghost">+10 L</button><button data-l="${Math.ceil(p.car.tank / 2)}" class="ghost">Half tank</button><button data-l="${room}" class="primary">Fill up (${free ? room : Math.min(room, points)} ${free ? 'L, free' : 'Points'})</button></div>
        <div class="row end"><button class="ghost" id="x">Drive on</button></div>`);
      for (const b of c.querySelectorAll<HTMLButtonElement>('[data-l]')) {
        b.disabled = room <= 0 || (!free && points <= 0);
        b.onclick = () => {
          if (free) g.fuel.add(p, Number(b.dataset.l));
          else g.buyFuel(Number(b.dataset.l));
          this.store();
          render();
        };
      }
      c.querySelector<HTMLElement>('#x')!.onclick = () => { g.endRefuel(); this.close('fuelshop'); };
    };
    render();
  }

  private openStranded() {
    const g = this.game;
    const pump = g.canRefuel;
    const c = this.sheet('dialog', `<h2>Out of fuel</h2><p>${g.quest ? 'A tow home is free, but it ends this job.' : 'A tow home is free.'} You get a free quarter tank when you arrive.</p><div class="row end">${pump ? '<button class="ghost" id="pump">Refuel here</button>' : ''}<button class="primary" id="tow">Tow me home</button></div>`);
    c.querySelector<HTMLElement>('#tow')!.onclick = () => { g.acceptTow(); this.close('dialog'); this.store(); };
    const b = c.querySelector<HTMLElement>('#pump');
    if (b) b.onclick = () => { this.close('dialog'); this.openFuel(); };
  }

  openPause() {
    const s = this.save;
    const opt = (id: string, label: string, on: boolean) => `<button class="ghost ${on ? 'on' : ''}" data-v="${id}">${label}</button>`;
    const c = this.sheet('pause', `<h2>Menu</h2>
      <p>Controls</p><div class="row">${opt('input:joystick', 'Joystick', s.input === 'joystick')}${opt('input:dpad', 'D-pad', s.input === 'dpad')}${opt('input:tilt', 'Tilt', s.input === 'tilt')}${opt('input:keyboard', 'Keyboard', s.input === 'keyboard')}${opt('input:gamepad', 'Controller', s.input === 'gamepad')}</div>
      ${s.input === 'tilt' ? '<div class="row" style="margin-top:6px"><button class="ghost" id="centre-tilt">Re-centre tilt</button></div>' : ''}
      <p>Layout</p><div class="row">${opt('hand:right', 'Right-handed', s.hand === 'right')}${opt('hand:left', 'Left-handed', s.hand === 'left')}</div>
      <p>Voice and sound</p><div class="row">${opt('mute:0', 'On', !s.muted)}${opt('mute:1', 'Off', s.muted)}</div>
      <p>Sat nav voice</p><div class="row">${[...CHOOSABLE, 'device'].map((v) => opt(`guide:${v}`, VOICE_NAMES[v] ?? 'Device', s.voices.guide === v)).join('')}</div>
      <p>Radio DJ voice</p><div class="row">${[...CHOOSABLE, 'device'].map((v) => opt(`dj:${v}`, VOICE_NAMES[v] ?? 'Device', s.voices.dj === v)).join('')}</div>
      <p>Graphics${this.view.fps ? ` (running at ${this.view.fps} fps)` : ''}</p><div class="row">${opt('gfx:auto', 'Auto', s.graphics === 'auto')}${opt('gfx:high', 'High', s.graphics === 'high')}${opt('gfx:low', 'Low', s.graphics === 'low')}</div>
      <p>You on foot</p><div class="row looks">${LOOKS.map((l, i) => `<button class="ghost look ${s.look === i ? 'on' : ''}" data-v="look:${i}" aria-label="Look ${i + 1}" style="background:linear-gradient(${l.hair} 0 22%, ${l.skin} 22% 38%, ${l.shirt} 38% 70%, ${l.trousers} 70%)"></button>`).join('')}</div>
      ${this.wardrobe()}
      <p>Car body</p><div class="row">${opt('body:voxel', 'Voxel', s.body === 'voxel')}${opt('body:blocks', 'Blocks', s.body === 'blocks')}</div>
      <p>Costs</p><div class="row">${opt('debug:0', 'Pay as you go', !s.debug)}${opt('debug:1', 'Free everything (debug)', s.debug)}</div>
      <p>Radio</p><div class="row">${this.stations.map((st, i) => opt(`radio:${i}`, esc(st.name), s.radio === i)).join('')}${opt('radio:-1', 'Off', s.radio < 0)}</div>
      <div class="row end"><button class="ghost" id="tips">Show tips again</button><button class="ghost" id="new">Start a new game</button><a href="labs.html" target="_blank" rel="noopener"><button class="ghost">Labs</button></a><a href="${HUB_URL}"><button class="ghost">Back to ARA Games</button></a><button class="primary" id="x">Keep driving</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('pause');
    c.querySelector<HTMLElement>('#tips')!.onclick = () => { s.guide.length = 0; this.store(); this.toast('Tips will show again'); };
    c.querySelector<HTMLElement>('#new')!.onclick = () => {
      const d = this.sheet('dialog', `<h2>Start a new game?</h2><p>Jobs, rank, finds, fuel, damage and car choice for this game reset. Points in your ARA wallet stay.</p><div class="row end"><button class="ghost" id="no">Keep playing</button><button class="primary" id="yes">New game</button></div>`);
      d.querySelector<HTMLElement>('#no')!.onclick = () => this.close('dialog');
      d.querySelector<HTMLElement>('#yes')!.onclick = async () => {
        this.dead = true; // first, so nothing can write the old game back over the new one
        const last = this.save.start;
        Object.assign(this.save, emptySave(matchMedia('(pointer: coarse)').matches), { lastStart: last });
        await putGameSave(SAVE_KEY, this.save); // reloading before this lands would cancel the write and keep the old game
        location.reload(); // back to the title, where a new game picks its car again
      };
    };
    const centre = c.querySelector<HTMLElement>('#centre-tilt');
    if (centre) centre.onclick = () => (this.schemes.tilt as Tilt).recentre();
    for (const b of c.querySelectorAll<HTMLElement>('[data-v]')) b.onclick = async () => {
      const [k, v] = b.dataset.v!.split(':');
      if (k === 'input') await this.applyScheme(v as SchemeId);
      if (k === 'hand') { s.hand = v as DriveSave['hand']; document.body.dataset.hand = v; }
      if (k === 'mute') { s.muted = v === '1'; this.voice.muted = s.muted; this.sound.muted = s.muted; }
      if (k === 'radio') { s.radio = Number(v); this.tuneRadio(); }
      if (k === 'gfx') { s.graphics = v as DriveSave['graphics']; this.view.setQuality(s.graphics); }
      if (k === 'body') { s.body = v as DriveSave['body']; this.view.bodyStyle = s.body; this.view.setCar(s.designs[s.car] ?? {}, s.driver); }
      if (k === 'debug') s.debug = v === '1';
      if (k === 'look') { s.look = Number(v); this.view.you.setLook(s.look, s.driver); }
      if (k === 'wear') { const [slot, id] = v.split('='); this.wear(slot as keyof Driver, id); }
      if (k === 'guide' || k === 'dj') { // a sample in the new voice, so you hear what you picked
        s.voices[k] = v;
        this.voice.muted = s.muted;
        if (k === 'guide') this.voice.say('left_ahead');
        else { const line = this.clips?.sample('dj'); if (line) this.voice.chatter(line); }
      }
      this.store();
      this.openPause();
    };
  }

  /** What you own to wear, by where it goes: put it on or take it off anywhere. Buying is in the shops. */
  private wardrobe(): string {
    const owned = (Object.keys(SLOT_LABEL) as (keyof Driver)[]).map((slot) => {
      const old = this.catalogue.filter((c) => (slot === 'outfit' ? c.kind === 'outfit' : c.kind === 'accessory' && c.style === slot) && this.wallet.owns(c.id)).map((c) => ({ id: c.id, name: c.name, colors: c.colors }));
      const bought = allGoods().filter(({ key, good }) => slotOf(good) === slot && this.wallet.owns(key)).map(({ key, good }) => ({ id: key, name: good.name, colors: good.colors ?? [] }));
      const all = [...old, ...bought];
      return all.length ? `<p>${SLOT_LABEL[slot]}</p><div class="row">${all.map((w) => `<button class="ghost ${this.save.driver[slot] === w.id ? 'on' : ''}" data-v="wear:${slot}=${w.id}">${w.colors.map((h) => `<i class="swatch" style="background:${h}"></i>`).join('')} ${esc(w.name)}</button>`).join('')}</div>` : '';
    }).join('');
    return owned ? `<p><b>Your clothes</b>: tap to put on or take off</p>${owned}` : `<p>Your clothes: buy some in the town's clothes shops, then wear them here.</p>`;
  }

  // ---- garage and shop ----
  openGarage() {
    if (this.game.shift) return this.toast('Sign off first: the garage is for your own car');
    this.renderGarage();
    document.body.classList.add('in-garage');
    const side = this.save.hand === 'left' ? -1 : 1;
    this.view.setGarage(true, side * ($('garage').querySelector('.card') as HTMLElement).offsetWidth);
  }

  private renderGarage() {
    const tabs = TABS.map(([id, label]) => `<button class="ghost ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    const body = this.tab === 'cars' ? this.carCards() : this.itemCards(this.tab);
    const c = this.sheet('garage', `<div class="row" style="justify-content:space-between"><h2>Garage</h2><div class="chip" style="background:#eef1f7">${this.wallet.points().toLocaleString('en-GB')} Points</div></div><div class="tabs">${tabs}</div><div class="items">${body}</div><div class="row end"><button class="primary" id="x">Back to the road</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => { this.view.setGarage(false); document.body.classList.remove('in-garage'); this.close('garage'); this.game.refreshOffers(); };
    for (const b of c.querySelectorAll<HTMLElement>('[data-tab]')) b.onclick = () => { this.tab = b.dataset.tab as Tab; this.renderGarage(); };
    for (const b of c.querySelectorAll<HTMLElement>('[data-car]')) b.onclick = () => this.pickCar(b.dataset.car!);
    for (const b of c.querySelectorAll<HTMLElement>('[data-item]')) b.onclick = () => this.pickItem(b.dataset.item!);
  }

  private carCards() {
    return CARS.map((car) => {
      const owned = car.price === 0 || this.wallet.owns(car.id);
      const price = this.save.debug ? 'Free (debug)' : `${car.price.toLocaleString('en-GB')} Points`;
      return `<button class="item ${this.save.car === car.id ? 'on' : ''}" data-car="${car.id}">${car.name}<small>${car.perk}</small><small>${car.tank} L, ${car.burn} L/km, ${car.topKmh} km/h</small><small>${this.save.car === car.id ? 'Driving' : owned ? 'Tap to drive' : price}</small></button>`;
    }).join('');
  }

  private itemCards(kind: CatalogueKind) {
    return this.catalogue.filter((c) => c.kind === kind).map((c) => {
      const on = this.equipped(c);
      const owned = this.wallet.owns(c.id);
      const price = this.save.debug ? 'Free (debug)' : `${c.price} Points`;
      return `<button class="item ${on ? 'on' : ''}" data-item="${c.id}">${c.colors.map((h) => `<i style="background:${h}"></i>`).join('')} ${esc(c.name)}<small>${TIER_LABEL[c.tier]} ${c.style.replace('_', ' ')}${c.shape ? ` ${c.shape}` : ''}</small><small>${on ? 'Equipped, tap to remove' : owned ? 'Tap to equip' : price}</small></button>`;
    }).join('') || '<p>Nothing here yet.</p>';
  }

  private slot(c: CatalogueItem): { on: Design | Driver; key: string } {
    if (c.kind === 'outfit') return { on: this.save.driver, key: 'outfit' };
    if (c.kind === 'accessory') return { on: this.save.driver, key: c.style };
    this.save.designs[this.save.car] ??= {};
    return { on: this.save.designs[this.save.car], key: c.kind };
  }

  private equipped(c: CatalogueItem) {
    const { on, key } = this.slot(c);
    return (on as Record<string, string | undefined>)[key] === c.id;
  }

  private pickItem(id: string, after = () => this.renderGarage()) {
    const c = this.find(id)!;
    if (!this.wallet.owns(id) && !this.save.debug) {
      if (!this.wallet.spend(c.price, `Bought ${c.name}`)) return this.toast(`You need ${c.price - this.wallet.points()} more Points`);
      this.wallet.grant(id);
      this.refreshPoints();
    }
    const { on, key } = this.slot(c), slots = on as Record<string, string | undefined>;
    slots[key] = slots[key] === id ? undefined : id;
    this.view.setCar(this.design(), this.save.driver);
    this.store();
    after();
  }

  private pickCar(id: string) {
    const car = carById(id);
    if (car.price > 0 && !this.wallet.owns(id) && !this.save.debug) {
      if (!this.wallet.spend(car.price, `Bought the ${car.name}`)) return this.toast(`You need ${car.price - this.wallet.points()} more Points`);
      this.wallet.grant(id);
      this.refreshPoints();
    }
    this.save.fuel[this.save.car] = this.game.player.fuel;
    this.save.dmg[this.save.car] = this.game.player.damage;
    this.save.car = id;
    this.save.picked = true;
    this.game.setCar(id, this.save.fuel[id], this.save.dmg[id]);
    this.view.setCar(this.design(), this.save.driver);
    this.store();
    this.renderGarage();
  }

  /** Change how you steer without leaving the road for the whole Menu. */
  openControls() {
    const s = this.save, opt = (id: string, label: string, on: boolean) => `<button class="ghost ${on ? 'on' : ''}" data-v="${id}">${label}</button>`;
    const c = this.sheet('dialog', `<h2>Controls</h2>
      <p>How you steer</p><div class="row">${opt('input:keyboard', 'Keyboard', s.input === 'keyboard')}${opt('input:joystick', 'Joystick', s.input === 'joystick')}${opt('input:dpad', 'D-pad', s.input === 'dpad')}${opt('input:tilt', 'Tilt', s.input === 'tilt')}${opt('input:gamepad', 'Controller', s.input === 'gamepad')}</div>
      <p>Layout</p><div class="row">${opt('hand:right', 'Right-handed', s.hand === 'right')}${opt('hand:left', 'Left-handed', s.hand === 'left')}</div>
      <p>Keyboard: WASD or arrows to drive, Space handbrake, Q and E indicators. Controller: left stick steers, right trigger go, left trigger brake, A handbrake, bumpers indicators.</p>
      <p>On foot: F, Y on a controller, or the action button gets you out of the car and back in, onto a bus and off it, and to a place's door. Wait at a stop and the bus pulls in; ring the bell before your stop. Forward walks and steering turns you; hold Space or A to run, or keep holding forward and you break into a run.</p>
      <div class="row end"><button class="primary" id="x">Keep driving</button></div>`);
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('dialog');
    for (const b of c.querySelectorAll<HTMLElement>('[data-v]')) b.onclick = async () => {
      const [k, v] = b.dataset.v!.split(':');
      if (k === 'input') await this.applyScheme(v as SchemeId);
      if (k === 'hand') { s.hand = v as DriveSave['hand']; document.body.dataset.hand = v; }
      this.store();
      this.openControls();
    };
  }

  /** The title screen's choice: spin the cars and start in any of them, no cost. */
  openPick(done: () => void) {
    const cards = CARS.map((car) => `<button class="item ${this.save.car === car.id ? 'on' : ''}" data-car="${car.id}">${car.name}<small>${car.perk}</small><small>${car.tank} L, ${car.burn} L/km, ${car.topKmh} km/h</small><small>${this.save.car === car.id ? 'Start here' : 'Tap to start in this one'}</small></button>`).join('');
    const c = this.sheet('picker', `<h2>Choose your car</h2><p>Start the game in any car you like — it costs nothing to choose. The garage can change it later.</p><div class="items">${cards}</div>`);
    const side = this.save.hand === 'left' ? -1 : 1;
    this.view.setGarage(true, side * ($('picker').querySelector('.card') as HTMLElement).offsetWidth);
    for (const b of c.querySelectorAll<HTMLElement>('[data-car]')) {
      b.onclick = () => {
        const id = b.dataset.car!;
        this.save.car = id;
        this.save.picked = true;
        this.game.setCar(id, this.save.fuel[id], this.save.dmg[id]);
        this.view.setCar(this.design(), this.save.driver);
        this.store();
        this.view.setGarage(false);
        this.close('picker');
        done();
      };
    }
  }
}

/** A rank's pay, as the real hourly rate and what it comes to in Points for each game hour (20 s) of booked work. */
function payLine(r: CareerRank) {
  return `£${r.gbpHour.toFixed(2)} an hour, about ${(r.gbpHour / POINT_GBP).toFixed(1)} Points every ${GAME_HOUR_S} s of booked work`;
}

const TAP_POI_M = 45; // a tap this close to a mark means that place: about a fingertip on a phone's map

/** The map's key: one swatch and letter for each kind of mark, from the same table the map draws with. */
function legend() {
  return `<ul class="legend">${Object.values(POI_STYLE).map((st) => `<li><i style="background:${st.fill}">${esc(st.label)}</i>${esc(st.legend)}</li>`).join('')}</ul>`;
}
