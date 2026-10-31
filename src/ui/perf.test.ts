import { describe, expect, it } from 'vitest';
import { perfBand, summarise } from './perf.ts';

describe('the performance readout', () => {
  it('turns frame gaps into a rate, an average and the worst frame', () => {
    const s = summarise([16, 17, 17, 50], [4, 5, 6, 5]);
    expect(s.fps).toBe(40);
    expect(s.averageMs).toBe(25);
    expect(s.worstMs).toBe(50);
    expect(s.workMs).toBe(5);
  });
  it('shows nothing rather than nonsense before any frames', () => {
    expect(summarise([], []).fps).toBe(0);
  });
  it('bands the rate', () => {
    expect(perfBand(60)).toBe('good');
    expect(perfBand(40)).toBe('warn');
    expect(perfBand(20)).toBe('bad');
  });
});
