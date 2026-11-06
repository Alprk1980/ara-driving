// The presenter's links round the facts: the words that lead into the forecast, the travel news and the time, and the
// station's name. The facts themselves come from the game (src/sim/bulletins.ts), so a link never makes a claim of its
// own about the weather or the roads that could turn out false.
//
// From presenter guides (Box Office Radio's presenter toolkit, Leighton Buzz's notes on linking and trailing): say the
// station's name often, at least every quarter of an hour; give the time; keep links short and vary them; talk to one
// listener. Local radio sounds like a person reading the facts plainly, not like a greetings card, so the vague mood
// words the old lines leaned on are refused.

export const LINK_KINDS = ['weather', 'travel', 'time', 'ident'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export type RadioLink = { id: string; kind: LinkKind; text: string };

/** The slot each kind must carry once. {station} may appear in any of them. */
export const LINK_SLOT: Record<LinkKind, string> = { weather: '{forecast}', travel: '{travel}', time: '{time}', ident: '{station}' };
export const LINK_WORDS = 18; // outside the slots: a quick link, as the guides ask

// Greetings-card words: the abstract, cheesy register real presenters don't use on a bulletin.
const MOOD = /\b(cosy|cozy|lovely|magical|magic|sparkl\w*|cheerful|delightful|wonderful|enchant\w*|dreamy|twinkl\w*|glorious|beautiful|charming|joy\w*|bliss\w*|happy vibes|vibes|smiles?)\b/i;
// What only the facts may say: a link that mentions the weather or the roads can contradict them.
const WEATHER = /\b(rain\w*|showers?|drizzle|sun\w*|cloud\w*|dry|wet|cold|chilly|warm|mild|frost\w*|fog\w*|mist\w*|wind\w*|breez\w*|storm\w*|snow\w*|degrees?|umbrella\w*)\b/i;
const ROADS = /\b(traffic|queues?|jams?|delays?|roadworks|busy|quiet|moving|crawl\w*|lights|junction|roundabout|crash\w*|collision)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u, ID = /^[a-z][a-z0-9_]*$/;

export function radioLinkErrors(l: RadioLink): string[] {
  if (!l || typeof l !== 'object') return ['link is not an object'];
  const out: string[] = [];
  if (!ID.test(l.id ?? '')) out.push(`id "${l.id}": snake_case`);
  if (!LINK_KINDS.includes(l.kind)) return [...out, `${l.id}: kind is one of ${LINK_KINDS.join(', ')}`];
  if (typeof l.text !== 'string') return [...out, `${l.id}: text is missing`];
  const slot = LINK_SLOT[l.kind], slots = l.text.match(/\{[a-z]+\}/g) ?? [];
  if (slots.filter((s) => s === slot).length !== 1) out.push(`${l.id}: a ${l.kind} link carries ${slot} exactly once`);
  if (slots.some((s) => s !== slot && s !== '{station}')) out.push(`${l.id}: only ${slot} and {station} are slots here`);
  const words = l.text.replace(/\{[a-z]+\}/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length > LINK_WORDS) out.push(`${l.id}: at most ${LINK_WORDS} words outside the slots`);
  const bare = l.text.replace(/\{[a-z]+\}/g, '');
  if (MOOD.test(bare)) out.push(`${l.id}: plain words, as a presenter reads a bulletin: no "${MOOD.exec(bare)![0]}"`);
  if (WEATHER.test(bare)) out.push(`${l.id}: leave the weather to {forecast}: no "${WEATHER.exec(bare)![0]}" in the link itself`);
  if (ROADS.test(bare)) out.push(`${l.id}: leave the roads to {travel}: no "${ROADS.exec(bare)![0]}" in the link itself`);
  if (/\d/.test(bare) || EMOJI.test(bare)) out.push(`${l.id}: no digits or emoji, it is read aloud`);
  if (/\b(morning|afternoon|evening|tonight|night)\b/i.test(bare)) out.push(`${l.id}: links play at any hour: no time of day`);
  if (!/([.!?]|\{[a-z]+\})$/.test(l.text.trim())) out.push(`${l.id}: end with . ! or ?, or with the slot, which the facts finish`);
  if (/\b(I am|it is|you are|do not|is not|we have)\b/i.test(bare)) out.push(`${l.id}: speak as people speak: I'm, it's, you're, don't`);
  return out;
}

/** Every kind has enough links to vary, as the guides ask. */
export function radioLinkSetErrors(links: RadioLink[]): string[] {
  return LINK_KINDS.filter((k) => links.filter((l) => l.kind === k).length < 4).map((k) => `fewer than 4 ${k} links`);
}
