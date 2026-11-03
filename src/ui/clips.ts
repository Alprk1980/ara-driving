// The recorded voice clips: which lines the game speaks, what each clip file is called, and the checks a clip must pass.
// Pure, so the generator (tools/voicegen.ts), the tests and the game all agree.
//
// Pace is counted in syllables, as words vary too much in length ("Recalculating route" is two words but six syllables).
// Read English runs at about 6.2 syllables a second (Pellegrino, Coupé and Marsico 2011, Language 87), and calm speech
// slower. A clip well outside 1.6 to 9 a second (the floor allows a slow voice such as Fable on a short, padded line) has gone wrong: words dropped, or a stall. The syllable count is a
// rough one, vowel groups per word, which is near enough for a check this wide.
export type Role = 'guide' | 'dj' | 'rider';
/** By line: its words, who says it, and the seconds of each voice's reading of it, at voice/<voice>/<key>.mp3. */
export type ClipIndex = Record<string, { text: string; role: Role; voices: Record<string, number> }>;
export type SpokenLine = { text: string; role: Role };

// Kokoro's British English voices, best graded first on its voice list (hexgrad/Kokoro-82M VOICES.md, a community-kept
// table): Emma B-, then C for Isabella, George and Fable, and the rest lower. The sat nav and the DJ can be any of them,
// picked in the Menu; passengers take turns between two, so they never sound like the DJ.
export const VOICE_NAMES: Record<string, string> = {
  bf_emma: 'Emma', bf_isabella: 'Isabella', bf_alice: 'Alice', bf_lily: 'Lily',
  bm_george: 'George', bm_fable: 'Fable', bm_lewis: 'Lewis', bm_daniel: 'Daniel',
};
export const CHOOSABLE = Object.keys(VOICE_NAMES);
export const RIDER_VOICES = ['bf_isabella', 'bm_fable'];
export type VoiceChoice = { guide: string; dj: string }; // a voice id, or 'device' for the phone's own speech
export const DEFAULT_VOICES: VoiceChoice = { guide: 'bf_emma', dj: 'bm_george' };

const SYLLABLES_PER_S: [number, number] = [1.6, 9];

/** About how many syllables a line has: groups of vowels in each word, less a silent e (but not the e of "-ble"), and
 * at least one a word. */
export const syllables = (text: string) => text.toLowerCase().split(/[^a-z']+/).filter(Boolean).reduce((n, w) => n + Math.max(1, (w.replace(/([^l]|[aeiou]l)e$/, '$1').match(/[aeiouy]+/g) ?? []).length), 0);
const MIN_S = 0.4, QUIET = 0.01, MIN_RMS = 0.03, GAP_S = 1;

/** Every line the voice guide, the radio and the passengers can say. */
export function spokenLines(data: { voice: { text: string }[]; radio: { text: string }[]; chatter: { text: string }[]; events: { text: string }[] }): SpokenLine[] {
  const out = new Map<string, SpokenLine>();
  const add = (list: { text: string }[], role: Role) => { for (const l of list) if (!out.has(l.text)) out.set(l.text, { text: l.text, role }); };
  add(data.voice, 'guide');
  add(data.radio, 'dj');
  add(data.events, 'dj'); // the DJ reads out what's on in town
  add(data.chatter, 'rider');
  return [...out.values()];
}

/** A line's key, from its words: FNV-1a, so a changed line gets new clips and never plays the old ones. */
export function clipKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export const clipPath = (voice: string, key: string) => `${voice}/${key}.mp3`;

/** The voices a line is read in: every choosable one for the sat nav and the DJ, one of the pair for a passenger. */
export const voicesFor = (line: SpokenLine, index: number): string[] => (line.role === 'rider' ? [RIDER_VOICES[index % RIDER_VOICES.length]] : CHOOSABLE);

/** What's wrong with a clip of `text`, as mono samples at `rate`; empty if it's fit to ship. */
export function clipErrors(text: string, samples: Float32Array, rate: number): string[] {
  const out: string[] = [], seconds = samples.length / rate;
  if (samples.some((v) => !Number.isFinite(v))) return ['samples are not numbers'];
  if (seconds < MIN_S) out.push(`only ${seconds.toFixed(2)} s long`);
  const pace = syllables(text) / seconds;
  if (pace < SYLLABLES_PER_S[0] || pace > SYLLABLES_PER_S[1]) out.push(`${pace.toFixed(1)} syllables a second, outside ${SYLLABLES_PER_S[0]}-${SYLLABLES_PER_S[1]}`);
  const rms = Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / (samples.length || 1));
  if (rms < MIN_RMS) out.push(`too quiet (rms ${rms.toFixed(3)})`);
  let run = 0, longest = 0;
  for (const v of samples) { run = Math.abs(v) < QUIET ? run + 1 : 0; longest = Math.max(longest, run); }
  if (longest / rate > GAP_S) out.push(`a ${(longest / rate).toFixed(1)} s silence in the middle`);
  return out;
}
