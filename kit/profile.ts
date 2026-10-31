// The shared profile store. Every ARA game on this host reads and writes ONE player record, so
// coins and unlocks carry across the collection. IndexedDB is per-origin: hub and games must share
// a host (they do: alprk1980.github.io). Local dev on different ports does NOT share it.
//
// A game uses this by copying this file plus schemas/profile.ts into it (same relative layout) and
// calling getPlayer / putPlayer around its own save. The hub reads the same record to show progress.
import type { Player } from '../schemas/profile.ts';
import { emptyPlayer, playerErrors, touch } from '../schemas/profile.ts';

const DB = 'ara-games';
const STORE = 'kv';
const KEY = 'player';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
const dbp = open();
const memory = new Map<string, unknown>();

export async function getPlayer(): Promise<Player> {
  const db = await dbp;
  if (!db) return (memory.get(KEY) as Player) ?? emptyPlayer();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      const p = req.result as Player | undefined;
      resolve(p && !playerErrors(p).length ? p : emptyPlayer());
    };
    req.onerror = () => resolve(emptyPlayer());
  });
}

export async function putPlayer(p: Player): Promise<void> {
  const errs = playerErrors(p);
  if (errs.length) { console.warn(`ara-games profile: not saving: ${errs[0]}`); return; }
  memory.set(KEY, p);
  const db = await dbp;
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(structuredClone(p), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** One shared write path: bump this game's play count (and optionally coins/unlocks). */
export async function recordPlay(gameId: string, patch?: Partial<{ coins: number; unlocked: string[] }>): Promise<Player> {
  const p = touch(await getPlayer(), gameId, new Date().toISOString(), patch);
  await putPlayer(p);
  return p;
}

/** A game's own save, beside the shared player, in the same store. Validate it after reading. */
export async function getGameSave<T>(key: string): Promise<T | null> {
  const db = await dbp;
  if (!db) return (memory.get(key) as T) ?? null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function putGameSave(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await dbp;
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(structuredClone(value), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
