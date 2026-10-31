import { describe, expect, it } from 'vitest';
import { emptyPlayer, playerErrors, touch } from './profile.ts';
import { credit, spend, unlock } from './profile.ts';

describe('shared player profile', () => {
  it('starts empty and valid', () => {
    expect(playerErrors(emptyPlayer())).toEqual([]);
  });

  it('records a play, coins and unlocks', () => {
    const p = touch(emptyPlayer(), 'ara_world', '2026-10-30T09:00:00.000Z', { coins: 5, unlocked: ['beret_hair'] });
    expect(p.coins).toBe(5);
    expect(p.games.ara_world.plays).toBe(1);
    expect(playerErrors(p)).toEqual([]);
  });

  it('adds plays and keeps unlocks unique and coins >= 0', () => {
    let p = touch(emptyPlayer(), 'ara_world', '2026-10-30T09:00:00.000Z', { coins: 3, unlocked: ['a'] });
    p = touch(p, 'ara_world', '2026-10-30T10:00:00.000Z', { coins: -10, unlocked: ['a', 'b'] });
    expect(p.games.ara_world.plays).toBe(2);
    expect(p.games.ara_world.unlocked).toEqual(['a', 'b']);
    expect(p.coins).toBe(0);
    expect(playerErrors(p)).toEqual([]);
  });

  it('rejects broken saves', () => {
    expect(playerErrors({ v: 2, name: 'x', coins: 0, games: {} }).join()).toMatch(/version 1/);
    expect(playerErrors({ v: 1, name: 'x', coins: -2, games: {} }).join()).toMatch(/coins/);
    expect(playerErrors({ v: 1, name: 'x', coins: 0, games: { 'Bad Key': { plays: 1, last: 'nope', unlocked: [] } } }).join()).toMatch(/snake_case|last/);
    expect(playerErrors({ v: 1, name: 'x', coins: 0, games: { g: { plays: 1, last: '2026-10-30', unlocked: ['a', 'a'] } } }).join()).toMatch(/unique/);
  });
});

describe('per-action writes', () => {
  it('spend refuses a short balance and counts no play', () => {
    const p = { ...emptyPlayer(), coins: 10 };
    expect(spend(p, 11)).toBeNull();
    expect(spend(p, 10)?.coins).toBe(0);
    expect(spend(p, -1)).toBeNull();
  });
  it('credit adds whole coins, and unlock keeps plays', () => {
    expect(credit(emptyPlayer(), 12).coins).toBe(12);
    const p = touch(emptyPlayer(), 'g', '2026-01-01T00:00:00Z');
    const u = unlock(p, 'g', ['a', 'a'], '2026-01-02T00:00:00Z');
    expect(u.games.g.unlocked).toEqual(['a']);
    expect(u.games.g.plays).toBe(1);
    expect(playerErrors(u)).toEqual([]);
  });
});
