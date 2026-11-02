// This game's own save, beside the shared profile: what only ARA Driving cares about.
import type { SchemeId } from './input/schemes.ts';
import { CARS } from './sim/economy.ts';
import type { Trip } from './sim/game.ts';
import { freshProgress, type Progress } from './sim/quests.ts';

export const GAME_ID = 'ara_driving';
export const SAVE_KEY = 'ara_driving';

export type Design = { paint?: string; pattern?: string; decal?: string; body?: string };
export type Driver = { outfit?: string; cap?: string; gloves?: string; sunglasses?: string };
export type Hand = 'right' | 'left';
/** A blow that knocked a hole in a building: box is its index in the town's boxes, and the rest is where and how hard. */
export type WallHit = { box: number; nx: number; nz: number; x: number; z: number; speed: number };

export type DriveSave = {
  v: 1;
  car: string;
  fuel: Record<string, number>; // litres left per car
  dmg: Record<string, number>; // dentiness 0..1 per car
  designs: Record<string, Design>;
  driver: Driver;
  input: SchemeId;
  hand: Hand;
  camera: number;
  muted: boolean;
  radio: number; // station index, -1 is off
  progress: Progress;
  guide: string[]; // tips already shown
  graphics: 'auto' | 'low' | 'high';
  body: 'voxel' | 'blocks'; // how the player car is drawn
  picked: boolean; // the starting car has been chosen on the title screen
  debug: boolean; // free fuel, cars and repairs: build and drive without caring about cost
  start: number; // the town plot this game opens at, -1 until one is dealt
  lastStart: number; // the last game's, so the next one lands somewhere else
  trip: Trip | null; // where the drive was left: the car, the clock, the job and the sat nav
  walls: WallHit[]; // the holes still showing in buildings
};

export const emptySave = (touch: boolean): DriveSave => ({
  v: 1, car: 'hatchback', fuel: {}, dmg: {}, designs: {}, driver: {}, input: touch ? 'joystick' : 'keyboard', hand: 'right', camera: 0, muted: false, radio: 0, progress: freshProgress(), guide: [], graphics: 'auto', body: 'voxel', picked: false, debug: false, start: -1, lastStart: -1, trip: null, walls: [],
});

export function saveErrors(s: DriveSave): string[] {
  if (!s || typeof s !== 'object') return ['save is not an object'];
  const out: string[] = [];
  if (s.v !== 1) out.push('v must be 1');
  if (!CARS.some((c) => c.id === s.car)) out.push(`car "${s.car}" does not exist`);
  if (!s.fuel || Object.values(s.fuel).some((f) => typeof f !== 'number' || !(f >= 0))) out.push('fuel must be litres >= 0');
  if (!s.dmg || Object.values(s.dmg).some((d) => typeof d !== 'number' || !(d >= 0 && d <= 1))) out.push('dmg must be 0-1 per car');
  if (!s.designs || typeof s.designs !== 'object') out.push('designs must be an object');
  if (!s.driver || typeof s.driver !== 'object') out.push('driver must be an object');
  if (!['dpad', 'joystick', 'tilt', 'keyboard', 'gamepad'].includes(s.input)) out.push('input is not a scheme');
  if (s.hand !== 'left' && s.hand !== 'right') out.push('hand must be left or right');
  if (!Number.isInteger(s.camera) || s.camera < 0 || s.camera > 3) out.push('camera must be 0-3');
  if (!Number.isInteger(s.radio) || s.radio < -1) out.push('radio must be a station or -1');
  const p = s.progress;
  if (!p || typeof p.arcs !== 'object' || !Array.isArray(p.ghosts) || !Array.isArray(p.found) || !(p.rep >= 0) || !p.daily) out.push('progress is malformed');
  if (!Array.isArray(s.guide)) out.push('guide must be a list');
  if (!['auto', 'low', 'high'].includes(s.graphics)) out.push('graphics must be auto, low or high');
  if (s.body !== 'voxel' && s.body !== 'blocks') out.push('body must be voxel or blocks');
  if (typeof s.picked !== 'boolean') out.push('picked must be true or false');
  if (typeof s.debug !== 'boolean') out.push('debug must be true or false');
  if (!Number.isInteger(s.start) || !Number.isInteger(s.lastStart)) out.push('start must be a plot or -1');
  return out;
}

const finite = (...n: unknown[]) => n.every((v) => typeof v === 'number' && Number.isFinite(v));

/** The drive and the holes are checked apart from the rest: one that's gone wrong is dropped, and the save is kept. */
export function keepDrive(s: DriveSave) {
  if (tripErrors(s.trip).length) s.trip = null;
  if (!Array.isArray(s.walls) || !s.walls.every((w) => w && Number.isInteger(w.box) && finite(w.nx, w.nz, w.x, w.z, w.speed))) s.walls = [];
}

export function tripErrors(t: Trip | null): string[] {
  if (t === null) return [];
  if (!t || typeof t !== 'object') return ['trip must be an object or null'];
  const out: string[] = [];
  if (!CARS.some((c) => c.id === t.car)) out.push(`trip car "${t.car}" does not exist`);
  if (!finite(t.x, t.z, t.heading, t.time, t.streak)) out.push('trip needs a place, heading, time and streak');
  if (t.waypoint !== null && !finite(t.waypoint?.x, t.waypoint?.z)) out.push('trip waypoint must be a point or null');
  if (!t.dents || !finite(...Object.values(t.dents)) || !Array.isArray(t.marks)) out.push('trip dents and marks are malformed');
  if (t.quest !== null && (!t.quest?.offer || !Number.isInteger(t.quest.offer.start) || !Number.isInteger(t.quest.offer.end) || !t.quest.at)) out.push('trip quest is malformed');
  return out;
}
