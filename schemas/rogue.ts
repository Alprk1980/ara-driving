// Getaway jobs: cheeky work that bends the rules, played as cartoon mishap (decided 2026-11-03, TEEN_EDITION.md). A
// wedding cake that has to be there ten minutes ago, a band's van with a missing tax disc, a boss who says forget the
// limit. The police may give chase, and if they stop you, the job's off and the fine is double.
//
// The balance rule, from TEEN_SCOPE.md: crime never pays overall. A getaway job pays ROGUE_PAY times the honest rate,
// but the police come for one in ROGUE_CATCH_ODDS, and stopping costs the pay and ROGUE_FINE on top of the usual
// fine. So its worth, against an honest job's 1, is ROGUE_PAY x (1 - odds) of the pay, less the fines: under 1.
export const ROGUE_PAY = 1.5, ROGUE_CATCH_ODDS = 0.5, ROGUE_FINE = 20; // ROGUE_FINE is on top of the police's usual 20
export const ROGUE_RANK = 4, ROGUE_SCORE = 60; // offered only to a driver with the rank and the road sense to have earned the mischief
export const ROGUE_ODDS = 0.3; // how often the list carries one, once open: judged
export const rogueWorth = () => ROGUE_PAY * (1 - ROGUE_CATCH_ODDS); // of an honest job's pay, before the fines

export type RogueJob = { id: string; type: 'delivery' | 'passenger'; title: string; text: string };

const ID = /^[a-z][a-z0-9_]*$/, EMOJI = /\p{Extended_Pictographic}/u;
// Kept to the cartoon side: nothing taken that isn't yours, no weapons, nobody hurt or chased down, no drink.
const BANNED = /\b(steal\w*|stole\w*|rob\w*|loot\w*|heist|weapon\w*|gun\w*|knife|knives|hurt|injur\w*|blood|kill\w*|drunk|drink|beer|drugs?|smuggl\w*|ram\w*|run (them|him|her) over|escape from prison|hostage)\b/i;
// Crime pays only when nobody's caught: the job can't promise you'll get away with it.
const PAYS = /\b(get away with|keep the money|never catch|can't catch|won't catch|easy money|no one will know|nobody will know)\b/i;
const RISK = /\b(police|coppers?|fine|ticket|trouble|caught|blue lights|in bother)\b/i;

export function rogueErrors(r: RogueJob): string[] {
  if (!r || typeof r !== 'object') return ['job is not an object'];
  const out: string[] = [];
  if (!ID.test(r.id ?? '')) out.push(`id "${r.id}": snake_case`);
  if (r.type !== 'delivery' && r.type !== 'passenger') out.push(`${r.id}: type is delivery or passenger`);
  if (typeof r.title !== 'string' || r.title.length < 4 || r.title.length > 24) out.push(`${r.id}: title is 4-24 characters`);
  if (typeof r.text !== 'string' || r.text.split(/\s+/).length < 8 || r.text.split(/\s+/).length > 30) return [...out, `${r.id}: text is 8-30 words`];
  if ((r.text.match(/\{dropoff\}/g) ?? []).length !== 1) out.push(`${r.id}: text says where with {dropoff} once`);
  if (!RISK.test(r.text)) out.push(`${r.id}: the job owns up to the risk: say the police, a fine, a ticket or trouble`);
  for (const t of [r.title, r.text]) {
    if (BANNED.test(t)) { out.push(`${r.id}: cartoon mischief only: no "${BANNED.exec(t)![0]}"`); break; }
    if (PAYS.test(t)) { out.push(`${r.id}: crime doesn't pay here: no "${PAYS.exec(t)![0]}"`); break; }
    if (EMOJI.test(t) || /\d/.test(t.replace('{dropoff}', ''))) { out.push(`${r.id}: no digits or emoji`); break; }
  }
  return out;
}
