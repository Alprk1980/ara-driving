// The shared player: one profile every ARA game reads and writes on the same origin, so coins and
// unlocks carry across the collection. Stored under key "player" in the "ara-games" IndexedDB.
export type Player = {
  v: 1;
  name: string; // what the games call the player
  coins: number; // shared purse
  games: Record<string, { plays: number; last: string; unlocked: string[] }>; // per game, keyed by GameCard.id
};

export const emptyPlayer = (): Player => ({ v: 1, name: '', coins: 0, games: {} });

const ID = /^[a-z][a-z0-9_]*$/;

export function playerErrors(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['player is not an object'];
  const pl = p as Player;
  const out: string[] = [];
  if (pl.v !== 1) out.push(`v ${pl.v}: only version 1 exists`);
  if (typeof pl.name !== 'string' || pl.name.length > 20) out.push('name should be a string up to 20 characters');
  if (typeof pl.coins !== 'number' || !Number.isInteger(pl.coins) || pl.coins < 0) out.push('coins must be a whole number >= 0');
  if (!pl.games || typeof pl.games !== 'object') out.push('games must be an object');
  else {
    for (const [id, g] of Object.entries(pl.games)) {
      if (!ID.test(id)) out.push(`games."${id}": key must be snake_case`);
      if (!g || typeof g !== 'object') { out.push(`games.${id}: must be an object`); continue; }
      if (typeof g.plays !== 'number' || !Number.isInteger(g.plays) || g.plays < 0) out.push(`games.${id}.plays must be a whole number >= 0`);
      if (typeof g.last !== 'string' || Number.isNaN(Date.parse(g.last))) out.push(`games.${id}.last must be an ISO date`);
      if (!Array.isArray(g.unlocked) || g.unlocked.some((u) => typeof u !== 'string') || new Set(g.unlocked).size !== g.unlocked.length)
        out.push(`games.${id}.unlocked must be a list of unique strings`);
    }
  }
  return out;
}

// The one write path games use: read-modify-write under a key. Kept pure so the tests can run it.
export function touch(p: Player, gameId: string, now: string, patch?: Partial<{ coins: number; unlocked: string[] }>): Player {
  const g = p.games[gameId] ?? { plays: 0, last: now, unlocked: [] };
  const unlocked = patch?.unlocked ? [...new Set([...g.unlocked, ...patch.unlocked])] : g.unlocked;
  const coins = patch?.coins !== undefined ? Math.max(0, p.coins + patch.coins) : p.coins;
  return { ...p, coins, games: { ...p.games, [gameId]: { ...g, plays: g.plays + 1, last: now, unlocked } } };
}

// Per-action writes for games that earn and spend during play. touch() adds a play and clamps at zero, so a
// purchase through it would look like a discount; these count no play, and spend refuses a short balance.
export function spend(p: Player, amount: number): Player | null {
  return Number.isInteger(amount) && amount >= 0 && amount <= p.coins ? { ...p, coins: p.coins - amount } : null;
}

export function credit(p: Player, amount: number): Player {
  return { ...p, coins: p.coins + Math.max(0, Math.round(amount)) };
}

export function unlock(p: Player, gameId: string, ids: string[], now: string): Player {
  const g = p.games[gameId] ?? { plays: 0, last: now, unlocked: [] };
  return { ...p, games: { ...p.games, [gameId]: { ...g, unlocked: [...new Set([...g.unlocked, ...ids])] } } };
}
