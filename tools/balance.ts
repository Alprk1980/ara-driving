// Drives full sessions with the scripted driver and prints what each car really earns. Shared with the economy test.
//   node tools/balance.ts
import { CASUAL, drive, SKILLED, type Style } from '../src/sim/autopilot.ts';
import { CAR_JOB_TYPES, type JobCar } from '../schemas/content.ts';
import { CARS, RANK_CAR_JOBS, RANK_REP } from '../src/sim/economy.ts';
import { Game, type GameEvent, type Wallet } from '../src/sim/game.ts';
import { Town } from '../src/sim/town.ts';
import { freshProgress, type QuestContent } from '../src/sim/quests.ts';

export const stubContent: QuestContent = {
  places: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: 'shop' as const })),
  quests: [
    ...(['delivery', 'passenger', 'trial'] as const).map((type, i) => ({ id: `q${i}`, type, title: 'Job', text: 'Go to {dropoff}.' })),
    ...(Object.keys(CAR_JOB_TYPES) as JobCar[]).map((car) => ({ id: `c${car}`, type: CAR_JOB_TYPES[car], car, title: 'Car job', text: 'Go to {dropoff}.' })),
  ],
};

// Rep puts the driver at the rank where car jobs are open, since that is the work each car is bought for.
export function runSession(town: Town, carId: string, style: Style, seed: number, minutes = 10, content = stubContent, rep = RANK_REP[RANK_CAR_JOBS]) {
  const wallet: Wallet & { value: number } = {
    value: 1000,
    points() { return this.value; },
    spend(n) { if (n > this.value) return false; this.value -= n; return true; },
    earn(n) { this.value += n; },
  };
  const g = new Game(content, wallet, { carId, seed, town, progress: { ...freshProgress(), rep } });
  const log: { t: number; e: GameEvent }[] = [];
  g.on((e) => log.push({ t: g.time, e }));
  for (let s = 0; s < minutes * 3600; s++) {
    if (!g.quest && g.offers.length) g.accept((g.offers.find((o) => o.carJob) ?? g.offers[0]).id);
    if (g.player.fuel < g.player.car.tank * 0.15) g.fuel.add(g.player, g.player.car.tank);
    g.step(drive(g, style));
  }
  let earned = 0, quests = 0;
  for (const { e } of log) if (e.type === 'questDone') { earned += e.pay; quests++; }
  return { earned, quests, burnt: g.fuel.burnt, net: earned - g.fuel.burnt, log };
}

export function table(town: Town, style: Style, seeds: number) {
  return CARS.map((c) => {
    const runs = Array.from({ length: seeds }, (_, i) => runSession(town, c.id, style, i + 1));
    const earned = runs.reduce((n, r) => n + r.earned, 0), burnt = runs.reduce((n, r) => n + r.burnt, 0);
    return { id: c.id, net: Math.round((earned - burnt) / seeds), share: Math.round((100 * burnt) / earned), quests: +(runs.reduce((n, r) => n + r.quests, 0) / seeds).toFixed(1) };
  });
}

if (process.argv[1]?.endsWith('balance.ts')) {
  const town = new Town();
  for (const [name, style] of [['casual', CASUAL], ['skilled', SKILLED]] as const) {
    const rows = table(town, style, 24);
    console.log(name);
    for (const r of rows) console.log(`  ${r.id.padEnd(10)} net ${r.net}  (+${Math.round((100 * r.net) / rows[0].net - 100)}%)  fuel ${r.share}%  quests ${r.quests}`);
  }
}
