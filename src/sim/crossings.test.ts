import { describe, expect, it } from 'vitest';
import { CrossingLight, FLASH_S, MAN_S, MIN_GREEN_S, PUFFIN_CLEAR_S, PUFFIN_EXTEND_S } from './crossings.ts';
import { ROAD_W } from './town.ts';

/** Run a light for so long, a twentieth of a second at a time, noting each change of what drivers see. */
const run = (l: CrossingLight, s: number, occupied = false) => {
  const seen: string[] = [];
  for (let t = 0; t < s; t += 0.05) { l.step(0.05, occupied); if (seen.at(-1) !== l.traffic) seen.push(l.traffic); }
  return seen;
};

describe('a pelican crossing', () => {
  it('stays green until someone presses, then runs the legal sequence and ends on flashing amber', () => {
    const l = new CrossingLight('pelican');
    expect(run(l, 60)).toEqual(['green']);
    l.press();
    expect(run(l, 3 + 1 + MAN_S + FLASH_S + 1)).toEqual(['amber', 'red', 'flashingAmber', 'green']);
  });

  it('shows the green man, then flashes it while drivers see flashing amber', () => {
    const l = new CrossingLight('pelican');
    l.press();
    run(l, 4.1);
    expect([l.man, l.traffic]).toEqual(['green', 'red']);
    run(l, MAN_S);
    expect([l.man, l.traffic]).toEqual(['flashing', 'flashingAmber']);
  });

  it('flashes long enough to cross the road at 1.2 m/s', () => expect(FLASH_S).toBeGreaterThanOrEqual(ROAD_W / 1.2));

  it('gives traffic its green between crossings', () => {
    const l = new CrossingLight('pelican');
    l.press();
    run(l, 3 + 1 + MAN_S + FLASH_S + 0.1); // just back to green
    l.press();
    expect(run(l, MIN_GREEN_S - 1)).toEqual(['green']);
  });
});

describe('a puffin crossing', () => {
  it('has no flashing amber: red, then red-and-amber, then green', () => {
    const l = new CrossingLight('puffin');
    l.press();
    expect(run(l, 3 + 1 + MAN_S + PUFFIN_CLEAR_S + 2 + 1)).toEqual(['amber', 'red', 'redAmber', 'green']);
  });

  it('holds the red while someone is still crossing, up to its limit', () => {
    const l = new CrossingLight('puffin');
    l.press();
    run(l, 4.1 + MAN_S + PUFFIN_CLEAR_S + 3, true);
    expect(l.traffic).toBe('red');
    run(l, PUFFIN_EXTEND_S, true);
    expect(l.traffic).not.toBe('red');
  });

  it('promises a walker setting off on the green man enough time to cross', () => {
    for (const kind of ['pelican', 'puffin'] as const) {
      const l = new CrossingLight(kind);
      l.press();
      run(l, 4.1);
      expect(l.crossTime * 1.05, kind).toBeGreaterThanOrEqual(ROAD_W + 1); // the slowest walker, kerb to kerb
    }
  });
});
