// Every number the design document fixes: quest pay, fuel, cars. Tests and the sim read these, so the
// document's tables have one home in code.
import type { JobCar, QuestType, Twist } from '../../schemas/content.ts';

export const RECOVERY_FEE = 15; // a truck home when you could have driven; free if you're out of fuel, as the tow always was
export const KERB_KG = 1400; // a typical UK family car, 1200-1500 kg, from general knowledge: no published average turned up
export const FUEL_PRICE = 1; // Points per litre
export const REPAIR_RATE = 1; // Points per 1% of bodywork damage at the garage
// Fuel runs well above a real car's 6 L/100 km on purpose: the town is 3 km across, so the bill has to mean something, but
// this was cut to a third after play (2026-10-30) so a tank lasts about 20 km, or 25 minutes of driving for fun.
export const IDLE_L_PER_MIN = 0.15;
export const HOME_TOPUP_PCT = 0.25;
export const WARN_LOW_PCT = 0.25;
export const WARN_CRITICAL_PCT = 0.1;
export const TRIAL_KMH = 58; // the speed that sets a time trial's Gold time in the starter car, eased from 70 now there are red lights to wait at
export const trialKmh = (car: Car) => TRIAL_KMH * Math.max(1, car.topKmh / 110); // Gold scales up, so a fast car still has to earn it

export const QUEST_PAY: Record<QuestType, { base: number; perKm: number }> = {
  delivery: { base: 20, perKm: 20 },
  passenger: { base: 25, perKm: 20 },
  trial: { base: 30, perKm: 25 },
};
export const CARGO_BONUS = 0.25;
export const TIP_BONUS = 0.3;
export const TRIAL_GRADES = [
  { name: 'Gold', within: 1, mult: 1.5 },
  { name: 'Silver', within: 1.25, mult: 1.2 },
  { name: 'Bronze', within: 1.5, mult: 1 },
] as const;

// How a twist changes care: how much a bump or a hard stop costs, whether care drains on a slow run, and the
// extra top bonus for taking the risk.
export const TWIST_RULES: Record<Twist, { bump: number; stop: number; clock: boolean; bonus: number; label: string }> = {
  fragile: { bump: 2, stop: 1, clock: false, bonus: 0.15, label: 'Fragile: bumps cost double' },
  melting: { bump: 1, stop: 0, clock: true, bonus: 0.15, label: 'Melting: do not hang about' },
  sleeping: { bump: 1, stop: 3, clock: false, bonus: 0.15, label: 'Asleep: no sharp stops' },
  late: { bump: 1, stop: 1, clock: true, bonus: 0.15, label: 'Running late: do not hang about' },
};
export const CLOCK_GRACE = 1.2; // a clock twist starts draining at this share of the Gold time
export const CLOCK_DRAIN = 1; // Gold times per full care lost

export const STREAK_STEP = 0.05; // extra pay per job finished in a row
export const STREAK_MAX = 4; // jobs that count, so the bonus tops out at +20%
export const streakBonus = (jobs: number) => Math.min(jobs, STREAK_MAX) * STREAK_STEP;

export const REGULAR_FINALE = 150; // for seeing a regular's story through
export const FIND_REWARD = 25;
export const FIND_ALL_REWARD = 500;

// Work only one car is offered: better money, and for the fast cars a tighter Gold time to earn it.
export const CAR_JOBS: Record<JobCar, { mult: number; gold: number; label: string }> = {
  pickup: { mult: 1.5, gold: 1, label: 'Heavy haul' },
  taxi: { mult: 1.3, gold: 1, label: 'Premium fare' },
  coupe: { mult: 1.2, gold: 0.95, label: 'Club race' },
  supercar: { mult: 1.5, gold: 0.92, label: 'Grand prize' },
};

export const RANK_REP = [0, 2, 6, 12, 20, 32, 50] as const; // reputation needed for each rank
export const rankOf = (rep: number) => RANK_REP.filter((n) => rep >= n).length - 1;
export const RANK_TWISTS = 1, RANK_CAR_JOBS = 2, RANK_LONG_HAUL = 3, RANK_PAY_4 = 4, RANK_PAY_6 = 6;
export const RANK_UNLOCKS: Record<number, string> = {
  [RANK_TWISTS]: 'Jobs with a twist', [RANK_CAR_JOBS]: 'Jobs made for your car', [RANK_LONG_HAUL]: 'Long-distance work',
  [RANK_PAY_4]: 'All pay +5%', [RANK_PAY_6]: 'All pay +10%',
};
export const rankPay = (rank: number) => (rank >= RANK_PAY_6 ? 0.1 : rank >= RANK_PAY_4 ? 0.05 : 0);
export const LONG_HAUL = { min: 3.5, max: 5.5, weight: 1 } as const;
export const REP_JOB = 1, REP_SPOTLESS = 1, REP_FINALE = 3, REP_GOAL = 2;
export const GOAL_REWARD = 60;

export const MARKET_BOOST = 0.25; // on jobs ending at the market day's kind of place
export const ROUGH_MPS = 8; // top speed on a street with roadworks or a parade

export const ROUTE_BANDS = [
  { min: 0.6, max: 1.2, weight: 5 },
  { min: 1.2, max: 2.5, weight: 4 },
  { min: 2.5, max: 4, weight: 1 },
] as const;

export type CarId = 'hatchback' | 'compact' | 'pickup' | 'taxi' | 'coupe' | 'supercar';
export type Car = {
  id: CarId; name: string; price: number;
  tank: number; burn: number; // litres, litres per km
  kg: number; // kerb weight, for who gives way in a crash: typical of each class, as no published UK average turned up
  topKmh: number; accel: number; steer: number; // km/h, m/s^2 at rest, rad/s at full lock
  perk: string; perkMult: Partial<Record<QuestType, number>>;
  size: [number, number, number]; // length, height, width in metres
  tough: number; // how much more it takes to bend than a hatchback: heavier, stiffer structures crush less per km/h
};

export const CARS: readonly Car[] = [
  { id: 'hatchback', name: 'Hatchback', price: 0, tank: 40, burn: 2, topKmh: 110, accel: 6.5, steer: 1.5, perk: 'Starter car', perkMult: {}, size: [3.8, 1.5, 1.8], tough: 1, kg: 1200 },
  { id: 'compact', name: 'Compact', price: 500, tank: 36, burn: 1.5, topKmh: 110, accel: 6.5, steer: 1.6, perk: 'Lowest fuel bill', perkMult: {}, size: [3.5, 1.5, 1.7], tough: 0.95, kg: 1050 },
  { id: 'pickup', name: 'Pickup', price: 1200, tank: 60, burn: 2, topKmh: 120, accel: 7, steer: 1.4, perk: 'Delivery pay +25%, heavy hauls', perkMult: { delivery: 1.25 }, size: [4.8, 1.8, 1.95], tough: 1.15, kg: 2000 },
  { id: 'taxi', name: 'Taxi', price: 1200, tank: 50, burn: 2, topKmh: 125, accel: 7, steer: 1.45, perk: 'Passenger pay +20%, premium fares', perkMult: { passenger: 1.2 }, size: [4.4, 1.5, 1.85], tough: 1.1, kg: 1500 },
  { id: 'coupe', name: 'Coupe', price: 3000, tank: 45, burn: 3.3, topKmh: 130, accel: 7.5, steer: 1.6, perk: 'Time trial pay +10%, club races', perkMult: { trial: 1.1 }, size: [4.3, 1.3, 1.9], tough: 1, kg: 1450 },
  { id: 'supercar', name: 'Supercar', price: 8000, tank: 55, burn: 3.7, topKmh: 165, accel: 9.5, steer: 1.7, perk: 'Fastest car, grand prize races', perkMult: {}, size: [4.5, 1.15, 2], tough: 0.9, kg: 1550 },
];
export const carById = (id: string): Car => CARS.find((c) => c.id === id) ?? CARS[0];

export const payout = (type: QuestType, routeKm: number, grade: number, perk = 1): number =>
  Math.round((QUEST_PAY[type].base + QUEST_PAY[type].perKm * routeKm) * grade * perk);

// Point packs are priced in the design document and stay off until the game has a server to confirm payment.
export const POINT_PACKS_ENABLED = false;
