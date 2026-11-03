// Recorded voices: every line the game speaks, read once by Kokoro-82M (Apache 2.0, run here on the CPU) and shipped as
// small MP3s, so a phone plays a natural voice instead of whatever its built-in speech sounds like. The browser's own
// speech stays as the fallback for any line without a clip.
//
// The sat nav's and the DJ's lines are read in every one of Kokoro's British voices, so the Menu can switch between them;
// a passenger's line is read once, by one of the pair in RIDER_VOICES (clips.ts has the voices and their grades).
//
// Generate, check, repair: each clip has to pass `clipErrors` (a sensible length for its words, not silent, not
// clipped, no long gap), or it's read again a little slower, up to three tries. Only clips that pass are kept.
//   node tools/voicegen.ts            every line without a clip
//   node tools/voicegen.ts --all      read everything again
//   node tools/voicegen.ts --first bm_fable   one voice's missing clips first
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Mp3Encoder } from '@breezystack/lamejs';
import { KokoroTTS } from 'kokoro-js';
import { clipErrors, clipKey, clipPath, spokenLines, voicesFor, type ClipIndex } from '../src/ui/clips.ts';

const KBPS = 40, PEAK = 0.89, EDGE_S = 0.08; // mono speech at 40 kb/s is clear; a little air either side of the words
const DIR = 'public/voice', INDEX = `${DIR}/clips.json`;

const read = <T,>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const lines = spokenLines({ voice: read('src/data/voice.json'), radio: read('src/data/radio.json'), chatter: read('src/data/chatter.json'), events: read('src/data/events.json') });
mkdirSync(DIR, { recursive: true });
const index: ClipIndex = existsSync(INDEX) && !process.argv.includes('--all') ? read(INDEX) : {};

/** Quiet ends off, then the whole clip brought up to one peak, so every line plays at the same loudness. */
function tidy(samples: Float32Array, rate: number): Float32Array {
  const quiet = 0.01, pad = Math.round(EDGE_S * rate);
  let a = 0, b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < quiet) a++;
  while (b > a && Math.abs(samples[b]) < quiet) b--;
  const out = samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + pad));
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return out.map((v) => (v / peak) * PEAK);
}

function mp3(samples: Float32Array, rate: number): Uint8Array {
  const enc = new Mp3Encoder(1, rate, KBPS), pcm = Int16Array.from(samples, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) parts.push(new Uint8Array(enc.encodeBuffer(pcm.subarray(i, i + 1152))));
  parts.push(new Uint8Array(enc.flush()));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
}

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
let riders = 0;
const todo = lines.flatMap((line) => {
  const key = clipKey(line.text), had = index[key]?.voices ?? {};
  const want = line.role === 'rider' ? (Object.keys(had).length ? [] : voicesFor(line, riders++)) : voicesFor(line, 0).filter((v) => !(v in had));
  return want.map((voice) => ({ line, key, voice }));
});
// --first <voice>: that voice's clips before the rest, for someone already playing with it picked.
const first = process.argv[process.argv.indexOf('--first') + 1];
if (process.argv.includes('--first')) todo.sort((a, b) => Number(b.voice === first) - Number(a.voice === first));
console.log(`${lines.length} spoken lines, ${todo.length} clips to read`);
let made = 0, failed = 0;
for (const { line, key, voice } of todo) {
  let errors: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const speed = 1 - attempt * 0.07; // a fresh read, a touch slower, if the last one failed its check
    const audio = await tts.generate(line.text, { voice, speed });
    const samples = tidy(audio.audio, audio.sampling_rate);
    errors = clipErrors(line.text, samples, audio.sampling_rate);
    if (errors.length) continue;
    mkdirSync(`${DIR}/${voice}`, { recursive: true });
    writeFileSync(`${DIR}/${clipPath(voice, key)}`, mp3(samples, audio.sampling_rate));
    index[key] ??= { text: line.text, role: line.role, voices: {} };
    index[key].voices[voice] = Math.round((samples.length / audio.sampling_rate) * 100) / 100;
    made++;
    break;
  }
  if (errors.length) { failed++; console.log(`FAILED ${voice} "${line.text}": ${errors.join('; ')}`); }
  if ((made + failed) % 10 === 0) writeFileSync(INDEX, JSON.stringify(index, null, 1)); // a stopped run keeps what it made
}
// Only lines the game still speaks, so a changed line's old clip drops out of the index.
const live = new Set(lines.map((l) => clipKey(l.text)));
for (const k of Object.keys(index)) if (!live.has(k)) delete index[k];
writeFileSync(INDEX, JSON.stringify(index, null, 1));
console.log(`made ${made}, failed ${failed}, ${Object.keys(index).length} of ${lines.length} lines have clips`);
