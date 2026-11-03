// Input: every scheme produces one DriveIntent, and the router owns smoothing so all schemes share a feel.
import { NEUTRAL, type DriveIntent } from '../sim/car.ts';

export type SchemeId = 'dpad' | 'joystick' | 'tilt' | 'keyboard' | 'gamepad';
export type Held = { left: boolean; right: boolean; go: boolean; brake: boolean };
export const freshHeld = (): Held => ({ left: false, right: false, go: false, brake: false });

export interface InputScheme {
  id: SchemeId;
  start(): Promise<boolean>; // false = cannot run here, for example no sensor
  stop(): void;
  read(): DriveIntent; // raw and unsmoothed
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const moveToward = (v: number, to: number, by: number) => (Math.abs(to - v) <= by ? to : v + Math.sign(to - v) * by);
const deadzone = (v: number, d: number) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

const pedals = (h: Held) => ({ throttle: h.go ? 1 : 0, brake: h.brake ? 1 : 0 });

export class Dpad implements InputScheme {
  id = 'dpad' as const;
  held: Held;
  constructor(held: Held) { this.held = held; }
  async start() { return true; }
  stop() {}
  read() { return { steer: (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), ...pedals(this.held) }; }
}

export class Keyboard implements InputScheme {
  id = 'keyboard' as const;
  private held = freshHeld();
  private handbrake = false;
  private stalk: -1 | 0 | 1 = 0;
  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.held.left = down;
    else if (k === 'arrowright' || k === 'd') this.held.right = down;
    else if (k === 'arrowup' || k === 'w') this.held.go = down;
    else if (k === 'arrowdown' || k === 's') this.held.brake = down;
    else if (k === ' ') this.handbrake = down;
    else if (k === 'q' || k === 'e') { if (down && !e.repeat) this.stalk = k === 'q' ? -1 : 1; }
    else return;
    e.preventDefault();
  };
  async start() {
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    return true;
  }
  stop() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    this.held = freshHeld();
    this.handbrake = false;
  }
  read() {
    const indicate = this.stalk || undefined;
    this.stalk = 0;
    return { steer: (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), ...pedals(this.held), handbrake: this.handbrake, indicate };
  }
}

// The standard gamepad layout: left stick to steer, triggers for the pedals, A for the handbrake, bumpers for the stalk.
const PAD = { steerAxis: 0, brake: 6, throttle: 7, handbrake: 0, indicateLeft: 4, indicateRight: 5 };
const PAD_DEAD = 0.12;

/** The first real controller: only the standard layout, as anything else (a wheel, a virtual device) reports its axes differently. */
const standardPad = () => [...navigator.getGamepads()].find((p) => p?.connected && p.mapping === 'standard') ?? null;

/** Whether someone just pressed a button: the only thing that may take over from the keyboard. A plugged-in, idle device must not. */
export class PadWatch {
  private was = new Set<number>();
  pressed() {
    const pad = standardPad(), now = new Set<number>();
    pad?.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
    const fresh = [...now].some((i) => !this.was.has(i));
    const first = !this.seen;
    this.seen = true;
    this.was = now;
    return fresh && !first; // a button already held when the page opened doesn't count
  }
  private seen = false;
}

/** One controller button's presses, each counted once: Y gets you out of the car and back in, as the action button does. */
export const PAD_ACTION = 3;
export class PadButton {
  private was = true; // held as the page opened doesn't count
  private index: number;
  constructor(index: number) { this.index = index; }
  pressed(): boolean {
    const now = !!standardPad()?.buttons[this.index]?.pressed, fresh = now && !this.was;
    this.was = now;
    return fresh;
  }
}

export class Gamepad implements InputScheme {
  id = 'gamepad' as const;
  private bumpers = [false, false];
  async start() { return 'getGamepads' in navigator; }
  stop() {}
  read() {
    const pad = standardPad();
    if (!pad) return { ...NEUTRAL };
    const press = (i: number) => pad.buttons[i]?.value ?? 0, held = (i: number) => !!pad.buttons[i]?.pressed;
    const now = [held(PAD.indicateLeft), held(PAD.indicateRight)], indicate = now[0] && !this.bumpers[0] ? -1 as const : now[1] && !this.bumpers[1] ? 1 as const : undefined;
    this.bumpers = now;
    return { steer: deadzone(pad.axes[PAD.steerAxis] ?? 0, PAD_DEAD), throttle: press(PAD.throttle), brake: press(PAD.brake), handbrake: held(PAD.handbrake), indicate };
  }
}

export const STICK_RADIUS = 60;

export class FloatingJoystick implements InputScheme {
  id = 'joystick' as const;
  held: Held;
  offsetX = 0;
  constructor(held: Held) { this.held = held; }
  async start() { return true; }
  stop() { this.offsetX = 0; }
  read() { return { steer: deadzone(clamp(this.offsetX / STICK_RADIUS, -1, 1), 0.08), ...pedals(this.held) }; }
}

const TILT_DEAD = 3, TILT_MAX = 25;

export class Tilt implements InputScheme {
  id = 'tilt' as const;
  held: Held;
  tiltDeg = 0;
  neutral = 0;
  constructor(held: Held) { this.held = held; }

  private onOrient = (e: DeviceOrientationEvent) => {
    const angle = screen.orientation?.angle ?? 0;
    // In landscape the wheel axis is beta, and its sign follows which way the phone was turned.
    this.tiltDeg = angle === 90 ? (e.beta ?? 0) : angle === 270 ? -(e.beta ?? 0) : (e.gamma ?? 0);
  };

  async start() {
    if (!('DeviceOrientationEvent' in window)) return false;
    const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (ask) { // iOS: has to run inside a tap
      try { if ((await ask.call(DeviceOrientationEvent)) !== 'granted') return false; } catch { return false; }
    }
    addEventListener('deviceorientation', this.onOrient);
    this.neutral = this.tiltDeg;
    return true;
  }
  stop() { removeEventListener('deviceorientation', this.onOrient); }
  recentre() { this.neutral = this.tiltDeg; }

  read() {
    const d = this.tiltDeg - this.neutral;
    const deg = Math.abs(d) < TILT_DEAD ? 0 : d - Math.sign(d) * TILT_DEAD;
    return { steer: clamp(deg / TILT_MAX, -1, 1), ...pedals(this.held) };
  }
}

const STEER_RATE = 6; // per second

export class InputRouter {
  active: InputScheme | null = null;
  intent: DriveIntent = NEUTRAL;
  fallback: InputScheme;
  private onFail: (id: SchemeId) => void;

  constructor(fallback: InputScheme, onFail: (id: SchemeId) => void = () => {}) {
    this.fallback = fallback;
    this.onFail = onFail;
  }

  async setScheme(next: InputScheme): Promise<SchemeId> {
    this.active?.stop();
    this.intent = NEUTRAL;
    const ok = await next.start();
    this.active = ok ? next : this.fallback;
    if (!ok) { await this.active.start(); this.onFail(next.id); }
    return this.active.id;
  }

  step(dt: number, speedRatio: number, hidden = false): DriveIntent {
    if (hidden || !this.active) return (this.intent = NEUTRAL);
    const raw = this.active.read();
    const rate = STEER_RATE / (1 + speedRatio); // calmer at speed
    this.intent = { steer: moveToward(this.intent.steer, raw.steer, rate * dt), throttle: raw.throttle, brake: raw.brake, handbrake: raw.handbrake, indicate: raw.indicate };
    return this.intent;
  }
}
