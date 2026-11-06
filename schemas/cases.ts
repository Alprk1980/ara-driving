// The town's cases: light whodunnits played across town. Something's gone missing, four of the regulars could be
// behind it, and witnesses at real places each tell you something. Each clue that clears a suspect names them, so
// with the clues in hand exactly one suspect is left: the validator checks the puzzle can be solved, and fairly.
//
// Gentle on purpose, as the game is for families (TEEN_EDITION.md's PEGI 7 line): things are borrowed, moved or
// muddled, never stolen with menace; nobody is hurt; the culprit always had a kind or silly reason and puts it right.

export type CaseClue = { place: string; witness: string; text: string; clears?: string }; // clears: the regular this rules out
export type TownCase = { id: string; title: string; intro: string; culprit: string; suspects: string[]; clues: CaseClue[]; ending: string };

export const SUSPECTS = 4, CLUES = 5; // three clues clear three suspects; two more are colour that points the right way
export const CASE_REWARD = 300; // Points for solving one: TEEN_SCOPE.md's figure, against 500 for all the finds
const ID = /^[a-z][a-z0-9_]*$/, EMOJI = /\p{Extended_Pictographic}/u;
const HARSH = /\b(stole|stolen|steal\w*|thief|thieves|crime|criminal|arrest\w*|police|jail|prison|weapon|knife|gun|hurt|injur\w*|blood|dead|kill\w*|threat\w*|scar(y|ed)|attack\w*|fight\w*)\b/i;
const words = (s: string) => s.trim().split(/\s+/).length;

export function caseErrors(c: TownCase, regulars: readonly { id: string; name: string }[], places: readonly { id: string; kind: string }[]): string[] {
  if (!c || typeof c !== 'object') return ['case is not an object'];
  const out: string[] = [], nameOf = (id: string) => regulars.find((r) => r.id === id)?.name;
  if (!ID.test(c.id ?? '')) out.push(`id "${c.id}": snake_case`);
  if (typeof c.title !== 'string' || c.title.length < 6 || c.title.length > 40) out.push(`${c.id}: title is 6-40 characters`);
  for (const [k, v, max] of [['intro', c.intro, 40], ['ending', c.ending, 40]] as const) if (typeof v !== 'string' || words(v) < 8 || words(v) > max) out.push(`${c.id}: ${k} is 8-${max} words`);
  if (!Array.isArray(c.suspects) || c.suspects.length !== SUSPECTS || new Set(c.suspects).size !== SUSPECTS || c.suspects.some((s) => !nameOf(s))) return [...out, `${c.id}: suspects are ${SUSPECTS} different regulars, by id: ${regulars.map((r) => r.id).join(', ')}`];
  if (!c.suspects.includes(c.culprit)) out.push(`${c.id}: the culprit is one of the suspects`);
  if (!Array.isArray(c.clues) || c.clues.length !== CLUES) return [...out, `${c.id}: ${CLUES} clues`];
  const cleared = new Set<string>(), seen = new Set<string>();
  c.clues.forEach((k, i) => {
    const at = `${c.id} clue ${i + 1}`, place = places.find((p) => p.id === k.place);
    if (!place) out.push(`${at}: place is one of the town's place ids`);
    else if (place.kind === 'house') out.push(`${at}: a witness is somewhere you can call in, not a house`);
    if (seen.has(k.place)) out.push(`${at}: each clue is at a different place`);
    seen.add(k.place);
    if (typeof k.witness !== 'string' || words(k.witness) > 4 || !/^(the|a|an)\b/i.test(k.witness)) out.push(`${at}: witness is who tells you, in 1-4 words starting "the" or "a", like "the baker"`);
    if (typeof k.text !== 'string' || words(k.text) < 6 || words(k.text) > 32) { out.push(`${at}: text is 6-32 words`); return; }
    if (k.clears !== undefined) {
      if (!c.suspects.includes(k.clears) || k.clears === c.culprit) out.push(`${at}: clears one of the other suspects, never the culprit`);
      else if (!k.text.includes(nameOf(k.clears)!)) out.push(`${at}: a clue that clears ${nameOf(k.clears)} names them`);
      else if (cleared.has(k.clears)) out.push(`${at}: ${nameOf(k.clears)} is cleared once`);
      cleared.add(k.clears);
    } else if (k.text.includes(nameOf(c.culprit)!)) out.push(`${at}: no clue names the culprit outright: let the player work it out`);
  });
  if (cleared.size !== SUSPECTS - 1) out.push(`${c.id}: exactly ${SUSPECTS - 1} clues clear the other suspects, one each, so one is left`);
  if (!c.ending.includes(nameOf(c.culprit) ?? '\0')) out.push(`${c.id}: the ending names the culprit and why`);
  for (const t of [c.title, c.intro, c.ending, ...c.clues.map((k) => k.text)]) {
    if (HARSH.test(t ?? '')) { out.push(`${c.id}: a gentle mystery: no "${HARSH.exec(t)![0]}"`); break; }
    if (EMOJI.test(t ?? '')) { out.push(`${c.id}: no emoji`); break; }
  }
  return out;
}

/** Who's left once these suspects are cleared: one, when every clearing clue is in. */
export const stillSuspected = (c: TownCase, heard: readonly number[]) => c.suspects.filter((s) => !heard.some((i) => c.clues[i]?.clears === s));

/** The set: no clue told twice, word for word, across the cases. */
export function caseSetErrors(cases: readonly TownCase[]): string[] {
  const seen = new Map<string, string>(), out: string[] = [];
  for (const c of cases) for (const k of c.clues) {
    const was = seen.get(k.text);
    if (was && was !== c.id) out.push(`${c.id}: a clue repeats one from ${was}, word for word`);
    seen.set(k.text, c.id);
  }
  return out;
}
