// Energy for running on foot, refilled by eating. Gentle on purpose (decided 2026-11-05): a full bar is a few minutes of
// running, an empty one still walks at full speed, a snack refills part of it and a meal all of it.
//
// The real cost of running is about 1 kcal per kilogram per kilometre, whatever the speed (Margaria's law, confirmed in
// Minetti et al. 2002, J Appl Physiol), and walking about 0.4 at its easiest pace. So a 60 kg runner at this game's 3 m/s
// burns about 0.06 kcal a metre. Real numbers would make a banana (105 kcal) last nearly two kilometres of running and
// the bar mean nothing, so the bar holds less than a body does: 200 kcal, spent in 4 minutes of running, about 4.6 times
// the real rate. Walking costs nothing here, a departure kept so you can never be stranded on foot.
import { FOOT_RUN_MPS } from './onfoot.ts';

export const RUNNER_KG = 60; // an example body mass for the player, so the real rate reads in kcal a metre; judged
export const REAL_RUN_KCAL_PER_KG_KM = 1; // Margaria's law
export const ENERGY_KCAL = 200; // a full bar: a 100 kcal snack refills half, a 450 kcal meal or more all of it
export const FULL_RUN_S = 240; // how long a full bar runs for: "a few minutes", judged
export const RUN_KCAL_PER_M = ENERGY_KCAL / (FULL_RUN_S * FOOT_RUN_MPS); // about 0.28, against a real 0.06
export const TIRED_AT = 0.02; // the bar this low and you can only walk; a sip of anything starts you running again

/** The bar after running `metres`, as a share of full. */
export const afterRun = (energy: number, metres: number) => Math.max(0, energy - (metres * RUN_KCAL_PER_M) / ENERGY_KCAL);
/** The bar after eating `kcal`, as a share of full. */
export const afterEating = (energy: number, kcal: number) => Math.min(1, energy + kcal / ENERGY_KCAL);
