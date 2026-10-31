// The HUD and every panel. Reads the game, sends player choices back through Game's methods.
import type { CatalogueItem, CatalogueKind, ChatterLine, GuideLine, RadioTopic, Rank, Station, StoryPlace } from '../../schemas/content.ts';
import { credit, spend, unlock, type Player } from '../../schemas/profile.ts';
import { putGameSave, putPlayer } from '../../kit/profile.ts';
import { Dpad, FloatingJoystick, Gamepad, Keyboard, STICK_RADIUS, Tilt, type Held, type InputRouter, type InputScheme, type SchemeId } from '../input/schemes.ts';
import { emptySave, GAME_ID, SAVE_KEY, type Design, type DriveSave, type Driver } from '../save.ts';
import { SIDES, type Side } from '../sim/car.ts';
import { CAR_JOBS, carById, CARS, MARKET_BOOST, RANK_REP, RANK_UNLOCKS, REPAIR_RATE, streakBonus, TWIST_RULES, WARN_CRITICAL_PCT, WARN_LOW_PCT } from '../sim/economy.ts';
import { isNight, type Game, type GameEvent, type Wallet } from '../sim/game.ts';
import { Guide, Passengers } from './coach.ts';
import { dist } from '../sim/town.ts';
import type { RadioHost } from './radio.ts';
import type { Sound } from './sound.ts';
import type { RoadLine } from '../../schemas/services.ts';
import type { RoadMoment } from '../../schemas/services.ts';
import roadLines from '../data/roadlines.json';

const TREND_SHOWN = 0.5, ROAD_ROWS = 10;
const ROAD_NAMES: Record<RoadMoment, string> = { red_stop: 'Waited at a red', zebra_wait: 'Stopped at a zebra', blue_pull: 'Pulled over for a blue light', stopped_after: 'Stopped after a knock', red_run: 'Ran a red light', zebra_run: 'Drove over a busy zebra', blue_block: 'Held up a blue light', drove_off: 'Drove off after a knock', pulled_over: 'Stopped by the police', got_away: 'Lost the police', course: 'Went on a course' };
import { CAMERA_NAMES, type View } from '../view/scene.ts';
import { DISTRICTS, DISTRICT_IDS, type DistrictId } from '../sim/districts.ts';
import { drawMini, drawWorld, townImage } from './map.ts';
import { cueKey, type VoiceGuide } from './voice.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $svg = (id: string) => document.getElementById(id) as unknown as SVGElement; // the bodywork outline's rects
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const HUB_URL = '../ara-games/';
const TIER_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

type Tab = 'cars' | 'paint' | 'pattern' | 'decal' | 'body' | 'outfit' | 'accessory';
const TABS: [Tab, string][] = [['cars', 'Cars'], ['paint', 'Paint'], ['pattern', 'Patterns'], ['decal', 'Decals'], ['body', 'Body'], ['outfit', 'Outfits'], ['accessory', 'Accessories']];

/** The shared player, kept in memory and written after every change. */
export class ProfileWallet implements Wallet {
  player: Player;
  constructor(player: Player) { this.player = player; }
  points() { return this.player.coins; }
  spend(n: number) {
    const next = spend(this.player, n);
    if (!next) return false;
    this.player = next;
    void putPlayer(next);
    return true;
  }
  earn(n: number) {
    this.player = credit(this.player, n);
    void putPlayer(this.player);
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
  private actionsKey = '';
  private trackerKey = '';
  private bodyKey = '';
  private hintClock = 1;
  private tickerClock = 0;

  constructor(game: Game, view: View, wallet: ProfileWallet, save: DriveSave, router: InputRouter, voice: VoiceGuide, sound: Sound, catalogue: CatalogueItem[], radio: RadioHost, stations: Station[], extra: { guide: GuideLine[]; chatter: ChatterLine[]; ranks: Rank[]; stories: StoryPlace[] }) {
    this.game = game; this.view = view; this.wallet = wallet; this.save = save;
    this.router = router; this.voice = voice; this.sound = sound; this.catalogue = catalogue;
    this.radio = radio; this.stations = stations;
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
    this.save.fuel[this.save.car] = this.game.player.fuel;
    this.save.dmg[this.save.car] = this.game.player.damage;
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
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'c') $('btn-cam').click();
      if (e.key.toLowerCase() === 'm') this.openMap();
      if (e.key.toLowerCase() === 'j') this.openJobs();
    });
  }

  // ---- events ----
  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'cue': this.voice.say(cueKey(e.cue)); break;
      case 'recalculating': this.voice.say('recalculating'); break;
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
    $('speed').textContent = `${Math.round(p.kmh)} km/h`;
    const pct = p.fuel / p.car.tank;
    $('fuelfill').style.width = `${pct * 100}%`;
    $('fueltext').textContent = `Fuel ${Math.round(p.fuel)} L`;
    $('fuelchip').className = pct < WARN_CRITICAL_PCT ? 'chip crit' : pct < WARN_LOW_PCT ? 'chip low' : 'chip';
    this.bodywork();

    if ((this.miniClock -= dt) <= 0) { this.miniClock = 1 / 15; drawMini(this.mini, g, this.img); }
    this.compass();
    this.tracker();
    this.actions();
    this.sound.engine(Math.abs(p.speed) / p.vMax, p.state === 'Driving', p.throttle);
    this.sound.road(this.view.slide, Math.abs(p.speed) / p.vMax, g.rain);
    this.sound.street(g.traffic.sirenFrom(p), g.parked.loudest(p));
    this.sound.tick();
    const sense = g.road, licence = sense.points;
    const arrow = sense.trend >= TREND_SHOWN ? ' ▲' : sense.trend <= -TREND_SHOWN ? ' ▼' : '';
    $('roadchip').textContent = `Road sense ${Math.round(sense.rec.score)}${arrow}${sense.bonus ? `, +${Math.round(sense.bonus * 100)}% pay` : ''}${licence ? `, ${licence} pts` : ''}`;
    $('roadchip').className = `chip${arrow === ' ▲' ? ' rising' : arrow ? ' falling' : ''}`;
    const streak = $('streak');
    streak.hidden = g.streak < 1;
    if (g.streak > 0) streak.textContent = `Streak ${g.streak}: next +${Math.round(streakBonus(g.streak) * 100)}%`;
    this.djSays(this.radio.tick(dt, { night: isNight(g.dayFrac), rain: g.rain > 0.3 }));
    this.guide.tick(dt);
    const q = g.quest;
    if (q?.phase === 'Active' && q.offer.type === 'passenger' && q.offer.twist !== 'sleeping') {
      const line = this.riders.tick(dt, q.care);
      if (line) { this.voice.chatter(line); this.ticker(line); }
    }
    if (p.state === 'Parked' && !g.quest && !g.nav && this.hintClock < 0) { this.hintClock = 9; this.banner(this.hint()); }
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
    if (q) {
      const left = Math.max(0, Math.round(dist(q.target, g.player)));
      const sub = q.phase === 'HeadingToStart' ? `Go to ${q.offer.startName}` : q.offer.type === 'trial' ? `${q.gate}/${q.offer.gates.length} checkpoints, ${Math.round(q.elapsed)}s of ${q.offer.rematch ? `your ${q.offer.rematch.time}s` : `${Math.round(q.offer.goldSeconds)}s gold`}` : `Take it to ${q.offer.endName}`;
      const twist = q.offer.twist ? `${TWIST_RULES[q.offer.twist].label}, care ${Math.round(q.care * 100)}%` : '';
      key = `${q.offer.title}|${sub}|${Math.round(left / 10)}|${twist}`;
      html = `${esc(q.offer.title)}<small>${esc(sub)}, ${left} m</small>${twist ? `<small>${esc(twist)}</small>` : ''}`;
    } else if (g.nav) {
      const left = Math.round(g.nav.route.length - g.nav.travelled);
      key = `way|${Math.round(left / 10)}`;
      html = `Waypoint<small>${left} m to go</small>`;
    }
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    el.innerHTML = html;
    el.style.display = key ? 'block' : 'none';
  }

  /** Buttons that only make sense where the car is right now. */
  private actions() {
    const g = this.game, p = g.player;
    const atHome = dist(g.town.home.road, p) < 20 && Math.abs(p.speed) < 3 && !g.quest;
    const pump = g.canRefuel;
    const low = p.fuel / p.car.tank < WARN_LOW_PCT && !pump;
    const bent = p.damage > 0.02;
    const key = [atHome, pump, low, p.state === 'Stranded', bent].join();
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
    if (atHome) add('Garage', () => this.openGarage(), 'primary');
    if (atHome && bent) add('Repair', () => this.repair());
    if (pump) add('Refuel', () => this.openFuel(), atHome ? '' : 'primary');
    if (low) add('Route to station', () => { g.routeToStation(); this.banner('Routing to the nearest station'); });
  }

  /** Straighten the bodywork at home: a flat rate per percent of damage, free in debug. */
  private repair() {
    const p = this.game.player;
    const cost = Math.ceil(p.damage * 100 * REPAIR_RATE);
    if (!this.save.debug && !this.wallet.spend(cost)) return this.toast(`You need ${cost - this.wallet.points()} more Points`);
    p.mend(0);
    this.refreshPoints();
    this.store();
    this.toast(this.save.debug ? 'Bent out straight, free in debug' : `Bodywork straight again, ${cost} Points`);
  }

  // ---- panels ----
  private openRoad() {
    const s = this.game.road, r = s.rec, ago = (at: number) => { const m = Math.floor((r.clock - at) / 60); return m < 1 ? 'just now' : `${m} min ago`; };
    const rows = (r.log ?? []).slice(0, ROAD_ROWS).map((e) => `<div class="goal roadrow ${e.by > 0 ? 'good' : e.by < 0 ? 'bad' : ''}"><span>${e.by > 0 ? '▲' : e.by < 0 ? '▼' : '•'} ${esc(ROAD_NAMES[e.moment])}</span><span>${e.by > 0 ? `+${e.by}` : e.by < 0 ? e.by : ''} · ${ago(e.at)}</span></div>`).join('');
    const pay = s.bonus ? `Your jobs pay ${Math.round(s.bonus * 100)}% more.` : 'Reach 60 to earn more on every job.';
    const c = this.sheet('dialog', `<h2>Road sense: ${Math.round(r.score)}</h2><p>${pay} ${r.good} good moments, ${r.bad} bad. Licence points: ${s.points} of 12.</p>${rows || '<p>Nothing yet. Wait at a red or stop at a zebra to start your record.</p>'}<div class="row end"><button class="primary" id="x">Keep driving</button></div>`);
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
      const job = o.regular ? `${o.regular.name}: part ${o.regular.step + 1} of ${o.regular.total}` : o.rematch ? `Your best: ${o.rematch.time}s` : o.carJob ? CAR_JOBS[o.carJob].label : o.twist ? TWIST_RULES[o.twist].label : '';
      const t = [job, o.market ? `${g.event?.title ?? 'Market day'}: +${MARKET_BOOST * 100}%` : ''].filter(Boolean).join(' · ');
      return t ? `<span class="tag">${esc(t)}</span>` : '';
    };
    const streak = g.streak ? `<p>${g.streak} in a row: the next job pays ${Math.round(streakBonus(g.streak) * 100)}% more. A tow, fast travel or a lost job ends it.</p>` : '';
    const rows = g.offers.map((o) => `<div class="offer"><div><b>${esc(o.title)} · ${kinds[o.type]}</b>${tag(o)}<span>${esc(o.text)}</span><span>${o.routeKm.toFixed(1)} km, ${o.basePay} to ${o.maxPay} Points, about ${Math.ceil(o.litres)} L${o.litres > reach ? ' · <em>refuel first</em>' : ''}</span></div><button class="primary" data-id="${o.id}">Take</button></div>`).join('');
    const c = this.sheet('jobs', `<h2>Jobs nearby</h2>${streak}${rows}<div class="row end"><button class="ghost" id="today">Today</button><button class="ghost" id="x">Close</button></div>`);
    c.querySelector<HTMLElement>('#today')!.onclick = () => this.openToday();
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('jobs');
    for (const b of c.querySelectorAll<HTMLElement>('[data-id]')) b.onclick = () => { g.accept(Number(b.dataset.id)); this.close('jobs'); };
  }

  openMap() {
    const g = this.game;
    const of = g.content.finds?.length ?? 0, clues = g.unfound.slice(0, 3).map((f) => `<li>${esc(f.clue)}</li>`).join('');
    const c = this.sheet('mapsheet', `<div id="worldwrap"><canvas id="world" width="1000" height="1000"></canvas><div id="mapside">
      <h2>Map</h2>
      <p>Tap a road to set a waypoint. H is home, F is a petrol station.</p>
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
      g.setWaypoint({ x: ((e.clientX - r.left) / r.width) * 3000, z: ((e.clientY - r.top) / r.height) * 3000 });
      draw();
    };
    c.querySelector<HTMLElement>('#x')!.onclick = () => this.close('mapsheet');
    c.querySelector<HTMLElement>('#clear')!.onclick = () => { g.setWaypoint(null); draw(); };
    const travel = (to: 'home' | 'station' | DistrictId) => this.confirmForfeit(() => { g.fastTravel(to); this.close('mapsheet'); this.store(); });
    c.querySelector<HTMLElement>('#ft-home')!.onclick = () => travel('home');
    c.querySelector<HTMLElement>('#ft-station')!.onclick = () => travel('station');
    for (const b of c.querySelectorAll<HTMLElement>('[data-go]')) b.onclick = () => travel(b.dataset.go as DistrictId);
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
      <p>Graphics${this.view.fps ? ` (running at ${this.view.fps} fps)` : ''}</p><div class="row">${opt('gfx:auto', 'Auto', s.graphics === 'auto')}${opt('gfx:high', 'High', s.graphics === 'high')}${opt('gfx:low', 'Low', s.graphics === 'low')}</div>
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
      this.store();
      this.openPause();
    };
  }

  // ---- garage and shop ----
  openGarage() {
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

  private pickItem(id: string) {
    const c = this.find(id)!;
    if (!this.wallet.owns(id) && !this.save.debug) {
      if (!this.wallet.spend(c.price)) return this.toast(`You need ${c.price - this.wallet.points()} more Points`);
      this.wallet.grant(id);
      this.refreshPoints();
    }
    const { on, key } = this.slot(c), slots = on as Record<string, string | undefined>;
    slots[key] = slots[key] === id ? undefined : id;
    this.view.setCar(this.design(), this.save.driver);
    this.store();
    this.renderGarage();
  }

  private pickCar(id: string) {
    const car = carById(id);
    if (car.price > 0 && !this.wallet.owns(id) && !this.save.debug) {
      if (!this.wallet.spend(car.price)) return this.toast(`You need ${car.price - this.wallet.points()} more Points`);
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
