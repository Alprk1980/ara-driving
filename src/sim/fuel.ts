// Fuel manager: the only code that changes fuel. Warnings fire once per drop below a threshold.
import { litresPerSecond, type DriveIntent, type PlayerCar } from './car.ts';
import { WARN_CRITICAL_PCT, WARN_LOW_PCT } from './economy.ts';

export type FuelEvent = { type: 'fuelLow'; level: 'amber' | 'red' } | { type: 'tankEmpty' };

export class FuelManager {
  burnt = 0;
  private warned = { low: false, critical: false, empty: false };

  tick(dt: number, car: PlayerCar, intent: DriveIntent, stationKm: number): FuelEvent[] {
    if (car.state !== 'Driving') return [];
    const before = car.fuel;
    car.fuel = Math.max(0, car.fuel - dt * litresPerSecond(car.car.burn, car.kmh, intent.throttle));
    this.burnt += before - car.fuel;
    const pct = car.fuel / car.car.tank, out: FuelEvent[] = [];
    const lowRange = car.fuel / car.car.burn < 1.5 * stationKm;
    if (this.once('low', pct < WARN_LOW_PCT || lowRange)) out.push({ type: 'fuelLow', level: 'amber' });
    if (this.once('critical', pct < WARN_CRITICAL_PCT)) out.push({ type: 'fuelLow', level: 'red' });
    if (this.once('empty', car.fuel === 0)) out.push({ type: 'tankEmpty' });
    return out;
  }

  private once(k: keyof FuelManager['warned'], on: boolean): boolean {
    const fire = on && !this.warned[k];
    this.warned[k] = on; // re-arms when fuel rises above the threshold
    return fire;
  }

  add(car: PlayerCar, litres: number) {
    car.fuel = Math.min(car.car.tank, car.fuel + litres);
    if (car.fuel / car.car.tank >= WARN_LOW_PCT) this.warned = { low: false, critical: false, empty: false };
  }
}
