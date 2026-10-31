// Minimal client for the local LM Studio server (OpenAI-compatible).
import { Agent, setGlobalDispatcher } from 'undici';

// The reasoning model can think for many minutes before the first byte; fetch's default 300 s header timeout
// would abort those requests and throw the work away.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 }));
export const BASE = (process.env.LLM_URL ?? 'http://localhost:1234/v1').replace(/\/$/, '');
export const MODEL = process.env.LLM_MODEL ?? 'qwen/qwen3.8-27b';
export const VISION_MODEL = process.env.LLM_VISION_MODEL ?? 'qwen/qwen3.8-27b';

export type Message = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] };

// The server has four slots (its /props says total_slots: 4). They share one model's speed: four real jobs at once took
// 67 s against 78 s in a row, about 15% quicker, so it's worth filling them, and pointless to queue more than that.
export const SLOTS = Number(process.env.LLM_SLOTS ?? 4);
let busy = 0;
const waiting: (() => void)[] = [];
const takeSlot = () => (busy < SLOTS ? (busy++, Promise.resolve()) : new Promise<void>((go) => waiting.push(go)));
const freeSlot = () => { const next = waiting.shift(); if (next) next(); else busy--; }; // a waiting job takes the slot straight over

/** Ask the model; waits for a free slot, and retries while the server is unreachable or the model is being (re)loaded. */
export async function chat(messages: Message[], opts: { model?: string; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  await takeSlot();
  try {
    return await chatRetrying(messages, opts);
  } finally {
    freeSlot();
  }
}

async function chatRetrying(messages: Message[], opts: { model?: string; maxTokens?: number; temperature?: number }): Promise<string> {
  for (let tries = 1; ; tries++) {
    try {
      return await chatOnce(messages, opts);
    } catch (e) {
      const msg = (e as Error).message;
      const transient = /unloaded|loading|fetch failed|ECONNRESET|terminated|HTTP 5\d\d|empty reply/i.test(msg);
      if (!transient || tries >= 6) throw e;
      console.log(`  (server: ${msg.slice(0, 80)}; retrying in 30s)`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

async function chatOnce(messages: Message[], opts: { model?: string; maxTokens?: number; temperature?: number }): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    // The strata server (LLM_URL .../v1 on :8080) wants a bearer key; LM Studio on :1234 does not.
    headers: { 'Content-Type': 'application/json', ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: opts.model ?? MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? Number(process.env.LLM_MAX_TOKENS ?? 24000),
    }),
  });
  if (!res.ok) throw new Error(`model: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: string } }[];
    usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    error?: unknown;
  };
  const choice = body.choices?.[0];
  const content = String(choice?.message?.content ?? '');
  if (content.trim() === '') {
    const u = body.usage;
    throw new Error(`empty reply (finish ${choice?.finish_reason}, ${u?.completion_tokens} tokens, ${u?.completion_tokens_details?.reasoning_tokens} reasoning${body.error ? `, error ${JSON.stringify(body.error)}` : ''})`);
  }
  return content;
}

/** Reply text without thinking or code fences. */
export const clean = (reply: string): string => reply.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json|svg)?/g, '');

/** The JSON value (array or object) in a reply, or null. */
export function parseJson(reply: string, shape: 'array' | 'object' = 'array'): unknown {
  const text = clean(reply);
  const [open, close] = shape === 'array' ? ['[', ']'] : ['{', '}'];
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
