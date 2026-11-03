import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDLE_AFTER_MS, MAX_INPUT_CHARS, ROUTINES, SYSTEM_PROMPT, appendStaged, auditPrompt, clip, codeBlocks, decide,
  ignoreStage, nextIdleCycle, parseReply, replyErrors, routinePrompt, shiftPhase, stage, stagePath,
} from './shadow_daemon.mjs';

const root = () => {
  const dir = mkdtempSync(join(tmpdir(), 'shadow-'));
  mkdirSync(join(dir, '.shadow'));
  return dir;
};

describe('the stage', () => {
  it('writes inside .shadow/', () => {
    const r = root();
    stage(r, 'critique.md', 'hello');
    expect(readFileSync(join(r, '.shadow', 'critique.md'), 'utf8')).toBe('hello');
  });

  it('refuses any path that leaves it', () => {
    const r = root();
    for (const bad of ['../src/main.ts', '../../x', join(r, 'src', 'main.ts'), '..', '.shadow-evil/../../x']) {
      expect(() => stage(r, bad, 'x'), bad).toThrow(/outside/);
    }
    expect(() => stagePath(r, '../.shadow-sibling/x')).toThrow(/outside/);
  });

  it('caps a growing file by dropping its oldest text', () => {
    const r = root();
    appendStaged(r, 'ideas.md', 'a'.repeat(50), 60);
    appendStaged(r, 'ideas.md', 'b'.repeat(50), 60);
    const text = readFileSync(join(r, '.shadow', 'ideas.md'), 'utf8');
    expect(text).toHaveLength(60);
    expect(text.endsWith('b')).toBe(true);
  });
});

describe('.gitignore', () => {
  it('adds the stage once, keeping what was there', () => {
    const r = root();
    writeFileSync(join(r, '.gitignore'), 'node_modules/');
    expect(ignoreStage(r)).toBe(true);
    expect(ignoreStage(r)).toBe(false);
    expect(readFileSync(join(r, '.gitignore'), 'utf8')).toBe('node_modules/\n.shadow/\n');
  });

  it('sees an entry in a CRLF file', () => {
    const r = root();
    writeFileSync(join(r, '.gitignore'), 'dist/\r\n.shadow/\r\n');
    expect(ignoreStage(r)).toBe(false);
  });
});

describe('reading a reply', () => {
  const lenses = 'THE SKEPTIC found x. THE ARCHITECT y. THE PERFORMANCE PROFILER z. THE PROVOCATEUR w.';

  it('separates deliberation from the answer, and drops the model\'s own thinking', () => {
    const p = parseReply(`<think>hidden</think><deliberation>${lenses}</deliberation>\n\nThe real answer is long enough to count as one.`);
    expect(p.deliberation).toContain('SKEPTIC');
    expect(p.body).toBe('The real answer is long enough to count as one.');
    expect(replyErrors(p)).toEqual([]);
  });

  it('refuses a reply that did not deliberate, skipped a lens, or stopped short', () => {
    expect(replyErrors(parseReply('Looks fine to me, nothing to add at all here today.')).join()).toMatch(/missing/);
    expect(replyErrors(parseReply(`<deliberation>THE SKEPTIC only</deliberation>A long enough answer to pass the length check here.`)).join()).toMatch(/ARCHITECT/);
    expect(replyErrors(parseReply(`<deliberation>${lenses}</deliberation>ok`)).join()).toMatch(/no answer/);
  });

  it('survives an empty or missing reply', () => {
    expect(replyErrors(parseReply(undefined)).length).toBeGreaterThan(0);
    expect(replyErrors(parseReply('</deliberation> before <deliberation>')).length).toBeGreaterThan(0);
  });

  it('pulls fenced blocks by language', () => {
    const body = 'text\n```diff\n--- a\n+++ b\n```\nmore\n```js\nconst x = 1;\n```\n';
    expect(codeBlocks(body, ['diff'])).toEqual(['--- a\n+++ b\n']);
    expect(codeBlocks(body, ['js', 'ts'])).toEqual(['const x = 1;\n']);
    expect(codeBlocks(body, ['python'])).toEqual([]);
  });
});

describe('the state machine', () => {
  const base = { diffHash: 'a', auditedHash: 'a', testsFailing: false, testsFailingAudited: false, now: 1000, lastChangeAt: 1000 };

  it('audits at once when the diff changes', () => {
    expect(decide({ ...base, diffHash: 'b' })).toBe('audit');
  });

  it('audits a failing test run once, and does not loop on it', () => {
    expect(decide({ ...base, testsFailing: true })).toBe('audit');
    expect(decide({ ...base, testsFailing: true, testsFailingAudited: true })).toBe('wait');
  });

  it('goes idle only after the quiet period', () => {
    expect(decide({ ...base, now: 1000 + IDLE_AFTER_MS })).toBe('wait');
    expect(decide({ ...base, now: 1001 + IDLE_AFTER_MS })).toBe('idle');
  });

  it('prefers an audit to an idle cycle', () => {
    expect(decide({ ...base, diffHash: 'b', now: 1e9 })).toBe('audit');
  });
});

describe('working in shifts', () => {
  const asleep = { now: 1000, shiftEndsAt: 0, restUntil: 0, diffHash: 'a', restingHash: 'a' };

  it('sleeps while the code is unchanged, however long that is', () => {
    expect(shiftPhase({ ...asleep, now: 1e12 })).toBe('rest');
  });

  it('wakes when the code changes', () => {
    expect(shiftPhase({ ...asleep, diffHash: 'b' })).toBe('start');
  });

  it('works until the shift ends, whatever the code does', () => {
    expect(shiftPhase({ ...asleep, shiftEndsAt: 2000, diffHash: 'b' })).toBe('work');
    expect(shiftPhase({ ...asleep, now: 2000, shiftEndsAt: 2000 })).toBe('end');
  });

  it('rests its full time even if the code keeps changing', () => {
    expect(shiftPhase({ ...asleep, restUntil: 5000, diffHash: 'b' })).toBe('rest');
    expect(shiftPhase({ ...asleep, now: 5000, restUntil: 5000, diffHash: 'b' })).toBe('start');
  });
});

describe('the idle rotation', () => {
  it('gives every file every routine, then wraps', () => {
    const files = ['a.ts', 'b.ts'];
    const seen = [];
    let cursor = 0;
    for (let i = 0; i < files.length * ROUTINES.length; i++) {
      const c = nextIdleCycle(cursor, files);
      seen.push(`${c.file}:${c.routine}`);
      cursor = c.cursor;
    }
    expect(new Set(seen).size).toBe(6);
    expect(`${nextIdleCycle(cursor, files).file}:${nextIdleCycle(cursor, files).routine}`).toBe(seen[0]);
  });

  it('copes with a shrinking file list and with none', () => {
    expect(nextIdleCycle(0, [])).toBeNull();
    expect(nextIdleCycle(9999, ['only.ts']).file).toBe('only.ts');
  });
});

describe('prompts', () => {
  it('keeps the four lenses and the deliberation rule', () => {
    for (const s of ['<deliberation>', 'THE SKEPTIC', 'THE ARCHITECT', 'THE PERFORMANCE PROFILER', 'THE PROVOCATEUR']) expect(SYSTEM_PROMPT).toContain(s);
  });

  it('shows test output only when tests fail', () => {
    expect(auditPrompt('d', { ok: true, code: 0, output: 'SECRET' })).not.toContain('SECRET');
    expect(auditPrompt('d', { ok: false, code: 1, output: 'BOOM' })).toContain('BOOM');
  });

  it('has a prompt for each routine', () => {
    for (const r of ROUTINES) expect(routinePrompt(r, 'a.ts', 'code')).toContain('a.ts');
  });

  it('clips oversized input, keeping both ends', () => {
    const big = `HEAD${'x'.repeat(MAX_INPUT_CHARS * 2)}TAIL`;
    const out = clip(big);
    expect(out.startsWith('HEAD')).toBe(true);
    expect(out.endsWith('TAIL')).toBe(true);
    expect(out.length).toBeLessThan(big.length);
    expect(clip('short')).toBe('short');
  });
});
