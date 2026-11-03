#!/usr/bin/env node
/**
 * Shadow Thinker: a background daemon that reviews the codebase with the local
 * model. On a code change or failing tests it audits the diff through four
 * lenses; once edits have been quiet for a while it rotates through edge-case,
 * idea and refactoring cycles. Findings are leads to replay, not facts.
 *
 * It never edits the project: every write goes through stage(), which refuses
 * any path outside .shadow/. It reads with git and runs the tests, nothing else.
 *
 * To spare the model's hardware it works in shifts: it sleeps until the code
 * changes, works for SHADOW_SHIFT_MIN, then rests at least SHADOW_REST_MIN even if
 * the code keeps changing. Asleep it only runs git diff, with no model or tests.
 *
 *   npm run shadow                                               run until stopped (background it)
 *   node --env-file=.env.llm tools/shadow_daemon.mjs --once      one audit or idle cycle, then exit
 *
 * Brought over from habit-camp. Here it reads .env.llm's LLM_URL, LLM_MODEL and LLM_API_KEY when the SHADOW_ and
 * QWEN_ names are unset, and its tests are the quick ones: the full suite takes over eight minutes, past its limit.
 *
 * SHADOW_URL (default http://100.66.95.17:8080/v1), SHADOW_MODEL, QWEN_API_KEY,
 * SHADOW_TEST_CMD (default "npm test"), SHADOW_POLL_MS, SHADOW_IDLE_MS,
 * SHADOW_SHIFT_MIN (default 30), SHADOW_REST_MIN (default 120).
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const STAGE_DIR = '.shadow';
export const POLL_MS = Number(process.env.SHADOW_POLL_MS ?? 4500);
export const IDLE_AFTER_MS = Number(process.env.SHADOW_IDLE_MS ?? 45000);
export const SHIFT_MS = Number(process.env.SHADOW_SHIFT_MIN ?? 30) * 60000;
export const REST_MS = Number(process.env.SHADOW_REST_MIN ?? 120) * 60000;
/** diffs and source past this are cut, so one huge change cannot crowd out the model's answer */
export const MAX_INPUT_CHARS = 60000;
const LLM_TIMEOUT_MS = 15 * 60 * 1000;
const TEST_TIMEOUT_MS = 3 * 60 * 1000;
/** failures before backing off, and the longest wait between tries */
const BACKOFF_AFTER = 3;
const BACKOFF_MAX_MS = 10 * 60 * 1000;
const IDEA_FILE_MAX = 200000;

export const ROUTINES = ['edge-cases', 'ideas', 'refactor'];

export const SYSTEM_PROMPT = `You are the autonomous Shadow Thinker and Architectural Coprocessor for this codebase.
Your duty is to examine code from competing angles, refusing superficial approval.

INSTRUCTIONS:
First, deliberate step-by-step inside <deliberation>...</deliberation> through these mandatory lenses:
1. THE SKEPTIC: Find race conditions, off-by-one errors, boundary math failures, unhandled null/undefined values, and state update ordering bugs.
2. THE ARCHITECT: Identify leaky abstractions, unnecessary coupling, violation of single-source-of-truth, and opportunities to cut line count in half.
3. THE PERFORMANCE PROFILER: Scan for per-frame allocations in hot loops, memory leaks, uncollected listeners, or redundant calculations.
4. THE PROVOCATEUR: Envision unconventional alternative designs, emergent capabilities, or creative mechanics unlocked by these changes.

Following </deliberation>, output concrete, structured Markdown with actionable code blocks. If a bug is identified, provide the exact reproduction test case or unified diff.`;

/** The one way this daemon writes: a path that leaves .shadow/ throws. */
export function stagePath(root, name) {
  const dir = resolve(root, STAGE_DIR);
  const target = resolve(dir, name);
  if (target !== dir && !target.startsWith(dir + sep)) throw new Error(`refusing to write outside ${STAGE_DIR}/: ${name}`);
  return target;
}

export function stage(root, name, text) {
  writeFileSync(stagePath(root, name), text);
}

export function appendStaged(root, name, text, max = IDEA_FILE_MAX) {
  const path = stagePath(root, name);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  // the oldest entries go first, so a long idle night cannot fill the disk
  writeFileSync(path, `${before}${text}`.slice(-max));
}

/** Adds .shadow/ to .gitignore once. The only write outside the stage, and the task asks for it. */
export function ignoreStage(root) {
  const path = join(root, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text.split(/\r?\n/).some((l) => l.trim() === `${STAGE_DIR}/`)) return false;
  writeFileSync(path, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${STAGE_DIR}/\n`);
  return true;
}

/** Splits a reply into deliberation and answer; <think> is the model's own reasoning. */
export function parseReply(reply) {
  const text = String(reply ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = text.indexOf('<deliberation>');
  const close = text.indexOf('</deliberation>');
  if (open < 0 || close < open) return { deliberation: '', body: text.trim(), deliberated: false };
  return {
    deliberation: text.slice(open + '<deliberation>'.length, close).trim(),
    body: text.slice(close + '</deliberation>'.length).trim(),
    deliberated: true,
  };
}

/** Empty when an answer is usable: it must have deliberated, on all four lenses, and said something. */
export function replyErrors(parsed) {
  const out = [];
  if (!parsed.deliberated) out.push('missing <deliberation>...</deliberation>');
  for (const lens of ['SKEPTIC', 'ARCHITECT', 'PERFORMANCE', 'PROVOCATEUR']) {
    if (parsed.deliberated && !parsed.deliberation.toUpperCase().includes(lens)) out.push(`deliberation skipped ${lens}`);
  }
  if (parsed.body.length < 40) out.push('no answer after </deliberation>');
  return out;
}

/** The fenced code blocks of one language in a Markdown answer. */
export function codeBlocks(body, langs) {
  const out = [];
  for (const m of body.matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)) if (langs.includes(m[1].toLowerCase())) out.push(m[2]);
  return out;
}

/** Keeps the head and tail of an oversized input, which is where diffs and files say most. */
export function clip(text, max = MAX_INPUT_CHARS) {
  if (text.length <= max) return text;
  const part = Math.floor(max / 2);
  return `${text.slice(0, part)}\n[... ${text.length - max} characters cut ...]\n${text.slice(-part)}`;
}

export function auditPrompt(diff, tests) {
  return `Audit this change. Tests: ${tests.ok ? 'passing' : `FAILING (exit ${tests.code})`}.

${tests.ok ? '' : `Test output:\n${clip(tests.output, 12000)}\n\n`}Diff against HEAD:
\`\`\`diff
${clip(diff)}
\`\`\`

After </deliberation> give findings as a Markdown list, most serious first, each naming the file, the line and how to reproduce it. If there is a minimal fix, put it in one \`\`\`diff block as a unified diff against the current files. If there is nothing wrong, say so plainly and do not invent a problem.`;
}

export function routinePrompt(routine, file, source) {
  const head = `File ${file}:\n\`\`\`\n${clip(source)}\n\`\`\`\n\n`;
  if (routine === 'edge-cases') {
    return `${head}Write new test assertions exploring bizarre inputs to this file. After </deliberation> give one \`\`\`js block: a complete ES module using vitest's describe, it and expect, importing from the real path, ready to read. Assert what the code should do, not what it happens to do.`;
  }
  if (routine === 'ideas') {
    return `${head}Deliberate on unexpected synergies or design opportunities this file opens up. After </deliberation> give up to three ideas as Markdown, each with what it would take and what could go wrong.`;
  }
  return `${head}Analyse coupling and duplication. After </deliberation> give alternative design proposals as Markdown, each with what would be deleted, what would move, and what it would risk.`;
}

/** Sequential through the files, then the next routine, so every file gets every lens. */
export function nextIdleCycle(cursor, files) {
  if (files.length === 0) return null;
  const n = cursor % (files.length * ROUTINES.length);
  return { file: files[Math.floor(n / ROUTINES.length) % files.length], routine: ROUTINES[n % ROUTINES.length], cursor: cursor + 1 };
}

/** What to do this poll: pure, so the state machine can be tested without a clock or a model. */
export function decide({ diffHash, auditedHash, testsFailing, testsFailingAudited, now, lastChangeAt }) {
  if (diffHash !== auditedHash) return 'audit';
  if (testsFailing && !testsFailingAudited) return 'audit';
  if (now - lastChangeAt > IDLE_AFTER_MS) return 'idle';
  return 'wait';
}

/** Where the shift stands. Pure: 'work' and 'rest' continue, 'start' and 'end' are the changes. */
export function shiftPhase({ now, shiftEndsAt, restUntil, diffHash, restingHash }) {
  if (shiftEndsAt > 0) return now < shiftEndsAt ? 'work' : 'end';
  if (now < restUntil) return 'rest';
  return diffHash !== restingHash ? 'start' : 'rest';
}

function config() {
  return {
    url: String(process.env.SHADOW_URL ?? process.env.LLM_URL ?? 'http://100.66.95.17:8080/v1').replace(/\/$/, ''),
    model: process.env.SHADOW_MODEL ?? process.env.LLM_MODEL ?? 'qwen3.8-flash-next-iq3_s',
    key: String(process.env.QWEN_API_KEY ?? process.env.LLM_API_KEY ?? '').trim(),
    testCmd: process.env.SHADOW_TEST_CMD ?? 'npx vitest run src/ui src/data src/view src/sim/onfoot.test.ts src/sim/bus.test.ts',
  };
}

async function ask(cfg, prompt, signal) {
  const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 32000,
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`model: HTTP ${res.status}`);
  const body = await res.json();
  return String(body.choices?.[0]?.message?.content ?? '');
}

/** One request, checked; one repair try, as the project's other model loops do. */
async function deliberate(cfg, prompt, signal) {
  let parsed = parseReply(await ask(cfg, prompt, signal));
  const errs = replyErrors(parsed);
  if (errs.length === 0) return parsed;
  parsed = parseReply(await ask(cfg, `${prompt}\n\nYour last answer was refused: ${errs.join('; ')}. Answer again in full.`, signal));
  return parsed;
}

async function gitDiff(root) {
  const { stdout } = await exec('git', ['diff', 'HEAD'], { cwd: root, maxBuffer: 1 << 28 });
  return stdout;
}

async function sourceFiles(root) {
  const { stdout } = await exec('git', ['ls-files', 'src', 'tools', 'scripts'], { cwd: root, maxBuffer: 1 << 24 });
  return stdout.split(/\r?\n/).filter((f) => /\.(ts|mjs|js)$/.test(f) && !/\.test\./.test(f)).sort();
}

/** Does a proposed diff apply? Checks only: --check never touches a file. */
async function patchApplies(root, path) {
  try {
    await exec('git', ['apply', '--check', path], { cwd: root });
    return null;
  } catch (e) {
    return String(e.stderr ?? e.message).trim().split('\n')[0];
  }
}

/** Runs the suite without blocking the poll; on timeout the whole tree goes. */
function runTests(root, cfg) {
  return new Promise((done) => {
    const child = spawn(cfg.testCmd, { cwd: root, shell: true, windowsHide: true });
    let output = '';
    const keep = (d) => {
      output = `${output}${d}`.slice(-20000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGKILL');
    }, TEST_TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ ok: false, code: -1, output: String(e) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, code: code ?? -1, output });
    });
  });
}

class Shadow {
  constructor(root) {
    this.root = root;
    this.cfg = config();
    this.auditedHash = null;
    this.diffHash = null;
    this.lastChangeAt = Date.now();
    this.tests = { ok: true, code: 0, output: '' };
    this.testsFailingAudited = false;
    this.failures = 0;
    this.retryAt = 0;
    this.idleAbort = null;
    this.state = this.loadState();
    this.shiftEndsAt = 0;
    this.restUntil = 0;
    /** the code as it stood when the last shift ended; a change from this wakes the next */
    this.restingHash = null;
  }

  log(line) {
    const stamped = `${new Date().toISOString()} ${line}\n`;
    appendStaged(this.root, 'daemon.log', stamped, 100000);
    process.stdout.write(stamped);
  }

  loadState() {
    try {
      return JSON.parse(readFileSync(stagePath(this.root, 'state.json'), 'utf8'));
    } catch {
      return { cursor: 0 };
    }
  }

  async poll() {
    const diff = await gitDiff(this.root);
    const hash = createHash('sha1').update(diff).digest('hex');
    if (hash !== this.diffHash) {
      this.diffHash = hash;
      this.lastChangeAt = Date.now();
      this.idleAbort?.abort(); // an edit outranks a daydream
    }
    if (this.shiftEndsAt > 0 && Date.now() >= this.shiftEndsAt) this.idleAbort?.abort(); // the shift is over
    return diff;
  }

  async audit(diff) {
    const hash = this.diffHash;
    this.log('audit: running tests');
    this.tests = await runTests(this.root, this.cfg);
    this.log(`audit: tests ${this.tests.ok ? 'pass' : `fail (exit ${this.tests.code})`}`);
    if (diff.trim() === '' && this.tests.ok) {
      this.auditedHash = hash;
      this.testsFailingAudited = false;
      return; // nothing changed and nothing broke, so there is nothing to ask
    }
    const parsed = await deliberate(this.cfg, auditPrompt(diff, this.tests));
    const errs = replyErrors(parsed);
    const patch = codeBlocks(parsed.body, ['diff', 'patch'])[0];
    const patchPath = stagePath(this.root, 'patch_proposal.diff');
    rmSync(patchPath, { force: true }); // a stale patch for older code is worse than none
    let patchNote = 'No patch proposed.';
    if (patch) {
      stage(this.root, 'patch_proposal.diff', patch.endsWith('\n') ? patch : `${patch}\n`);
      const refused = await patchApplies(this.root, patchPath);
      patchNote = refused ? `The patch in patch_proposal.diff does NOT apply: ${refused}` : 'The patch in patch_proposal.diff applies cleanly. It has not been applied.';
    }
    stage(this.root, 'critique.md', [
      `# Shadow critique, ${new Date().toISOString()}`,
      '',
      `Tests: ${this.tests.ok ? 'passing' : `failing (exit ${this.tests.code})`}. ${patchNote}`,
      ...(errs.length > 0 ? ['', `Warning, the model's answer was incomplete: ${errs.join('; ')}.`] : []),
      '',
      'Leads from a local model: reproduce each one before acting on it.',
      '',
      parsed.body,
      '',
    ].join('\n'));
    // the diff may have moved during the wait; if so the next poll audits again
    this.auditedHash = hash;
    this.testsFailingAudited = !this.tests.ok;
    this.log('audit: wrote critique.md');
  }

  async idleCycle() {
    const files = await sourceFiles(this.root);
    const next = nextIdleCycle(this.state.cursor, files);
    if (!next) return;
    const { file, routine } = next;
    this.log(`idle: ${routine} on ${file}`);
    this.idleAbort = new AbortController();
    const source = readFileSync(join(this.root, file), 'utf8');
    // the main loop is waiting on the model here, so edits need their own watch
    const watch = setInterval(() => this.poll().catch(() => {}), POLL_MS);
    let parsed;
    try {
      parsed = await deliberate(this.cfg, routinePrompt(routine, file, source), this.idleAbort.signal);
    } finally {
      clearInterval(watch);
      this.idleAbort = null;
    }
    this.state = { cursor: next.cursor };
    stage(this.root, 'state.json', `${JSON.stringify(this.state)}\n`);
    const heading = `\n## ${basename(file)}, ${new Date().toISOString()}\n\nFrom \`${file}\`.\n\n`;
    if (routine === 'ideas') appendStaged(this.root, 'divergent_ideas.md', `${heading}${parsed.body}\n`);
    else if (routine === 'refactor') appendStaged(this.root, 'refactor_proposals.md', `${heading}${parsed.body}\n`);
    else {
      const code = codeBlocks(parsed.body, ['js', 'javascript', 'mjs', 'ts', 'typescript'])[0];
      if (!code) {
        this.log('idle: no test block in the answer, nothing staged');
        return;
      }
      stage(this.root, 'staged_edge_cases.test.mjs', `// Staged by the Shadow Thinker from ${file}. Never run by the project's tests: read it, and move what is worth keeping.\n${code}`);
    }
    this.log(`idle: staged ${routine}`);
  }

  /** Model trouble backs off, so a server that is down is not hammered. */
  failed(e) {
    this.failures++;
    const wait = this.failures < BACKOFF_AFTER ? 0 : Math.min(BACKOFF_MAX_MS, POLL_MS * 2 ** this.failures);
    this.retryAt = Date.now() + wait;
    this.log(`error: ${e.message}${wait ? `, waiting ${Math.round(wait / 1000)} s` : ''}`);
  }

  /** Wakes for a change and goes back to sleep on time; true while there is work to do. */
  onShift() {
    const now = Date.now();
    if (this.restingHash === null) this.restingHash = this.diffHash; // what was here at start-up is old news
    const phase = shiftPhase({ now, shiftEndsAt: this.shiftEndsAt, restUntil: this.restUntil, diffHash: this.diffHash, restingHash: this.restingHash });
    if (phase === 'start') {
      this.shiftEndsAt = now + SHIFT_MS;
      this.lastChangeAt = now;
      this.log(`shift: the code changed, working for ${Math.round(SHIFT_MS / 60000)} min`);
      return true;
    }
    if (phase === 'end') {
      this.shiftEndsAt = 0;
      this.restUntil = now + REST_MS;
      this.restingHash = this.diffHash;
      this.log(`shift: done, resting at least ${Math.round(REST_MS / 60000)} min`);
      return false;
    }
    return phase === 'work';
  }

  async tick(force = false) {
    const diff = await this.poll();
    if (!force && !this.onShift()) return 'rest';
    if (Date.now() < this.retryAt) return 'wait';
    const action = decide({
      diffHash: this.diffHash,
      auditedHash: this.auditedHash,
      testsFailing: !this.tests.ok,
      testsFailingAudited: this.testsFailingAudited,
      now: Date.now(),
      lastChangeAt: this.lastChangeAt,
    });
    try {
      if (action === 'audit') await this.audit(diff);
      else if (action === 'idle') await this.idleCycle();
      if (action !== 'wait') this.failures = 0;
    } catch (e) {
      this.idleAbort = null;
      if (e.name === 'AbortError') this.log('idle: stopped early');
      else this.failed(e);
    }
    return action;
  }
}

/** Refuses a second copy: two would audit everything twice and split the log. */
function takeLock(root) {
  const path = stagePath(root, 'daemon.pid');
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8'));
    try {
      process.kill(pid, 0);
      throw new Error(`already running as pid ${pid}`);
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  }
  writeFileSync(path, String(process.pid));
  const release = () => rmSync(path, { force: true });
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
}

async function main() {
  const root = resolve(process.cwd());
  mkdirSync(resolve(root, STAGE_DIR), { recursive: true });
  ignoreStage(root);
  takeLock(root);
  const shadow = new Shadow(root);
  shadow.log(`started against ${shadow.cfg.url}, model ${shadow.cfg.model}`);
  if (process.argv.includes('--once')) {
    await shadow.tick(true);
    return;
  }
  for (;;) {
    try {
      await shadow.tick();
    } catch (e) {
      shadow.failed(e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
