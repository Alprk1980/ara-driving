// The playthroughs the local model reviewed (tools/footreview.ts) that once ended with a bus stuck for good: behind a
// parked car, in a junction held by a car stuck behind it, and in a ring of cars each waiting on the next.
import { describe, expect, it } from 'vitest';
import { digest } from '../../tools/footreview.ts';

describe('the bus gets you there', () => {
  for (const session of [0, 6, 8]) {
    it(`in playthrough ${session}`, () => {
      const log = digest(session);
      expect(log, log).not.toMatch(/still on the bus|no bus pulled in|CHECK/);
      expect(log).toMatch(/off the bus/);
    }, 240000);
  }
});
