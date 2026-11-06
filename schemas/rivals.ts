// The rival taxi crews: three firms you race for the season's top spot on the board, with names, colours and the
// friendly digs they make when they pull ahead. Written by Qwen and checked here. Kept to banter: a crew teases, it
// never insults, threatens or swears (TEEN_EDITION.md's PEGI 7 line).

export type RivalCrew = { id: string; name: string; colour: string; pace: number; taunts: string[] }; // pace: how hard they work, against an ordinary driver's 1
export const CREWS = 3, PACES = [0.75, 1, 1.25] as const; // one easy to beat, one level, one ahead: judged
const ID = /^[a-z][a-z0-9_]*$/, HEX = /^#[0-9a-f]{6}$/, EMOJI = /\p{Extended_Pictographic}/u;
const NASTY = /\b(stupid|idiot|loser|useless|rubbish|pathetic|hate|ugly|dumb|kill|crash into|run you|damn|hell|crap)\b/i;

export function rivalErrors(r: RivalCrew): string[] {
  if (!r || typeof r !== 'object') return ['crew is not an object'];
  const out: string[] = [];
  if (!ID.test(r.id ?? '')) out.push(`id "${r.id}": snake_case`);
  if (typeof r.name !== 'string' || r.name.length < 4 || r.name.length > 22 || !/^[A-Z][A-Za-z '&-]+$/.test(r.name)) out.push(`${r.id}: name is 4-22 letters, like a local cab firm`);
  if (!HEX.test(r.colour ?? '')) out.push(`${r.id}: colour is lowercase #rrggbb`);
  if (!PACES.includes(r.pace as (typeof PACES)[number])) out.push(`${r.id}: pace is one of ${PACES.join(', ')}`);
  if (!Array.isArray(r.taunts) || r.taunts.length < 4 || r.taunts.length > 6) return [...out, `${r.id}: 4-6 taunts`];
  for (const t of r.taunts) {
    if (typeof t !== 'string' || t.split(/\s+/).length > 14) out.push(`${r.id}: a taunt is at most 14 words`);
    else if (NASTY.test(t)) out.push(`${r.id}: banter, not insults: no "${NASTY.exec(t)![0]}"`);
    else if (EMOJI.test(t) || /\d/.test(t)) out.push(`${r.id}: no digits or emoji, it's read aloud`);
  }
  return out;
}

export function rivalSetErrors(crews: RivalCrew[]): string[] {
  const out: string[] = [];
  if (crews.length !== CREWS) out.push(`${CREWS} crews`);
  if (new Set(crews.map((c) => c.pace)).size !== crews.length) out.push('each crew a different pace');
  const gap = (a: string, b: string) => { const p = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), q = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16)); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  for (let i = 0; i < crews.length; i++) for (let j = i + 1; j < crews.length; j++) if (gap(crews[i].colour, crews[j].colour) < 90) out.push(`${crews[i].id} and ${crews[j].id}: colours too alike to tell apart`);
  return out;
}
