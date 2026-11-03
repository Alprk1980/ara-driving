# ARA Driving: young-teen edition — scope

The buildable detail behind TEEN_EDITION.md. Every item names the file it changes or adds, the values it
uses, and where a value comes from. Decisions come from TEEN_EDITION.md "Decided" (2026-11-03): a mode on the
shared profile, mild rogue jobs as cartoon mishap, night and weather may have a real edge. Nothing here is
built yet. Where a number has no source it is marked *example* and must be set by playtest.

## 0. Ground facts read from the code

These are the handles the edition plugs into; they exist today, so they are constraints, not proposals.

- `src/sim/game.ts`: `STEP = 1/60`, `DAY_S = 480`, `DAY_START = 0.3`, `get dayFrac() = (DAY_START +
  time/DAY_S) % 1`, `isNight(frac) = frac > 0.8 || frac < 0.2`, rain (`RAIN_ODDS = 0.3`), events (`EVENT_S =
  180`, `EVENT_ODDS = 0.65`), `FIRE_CALL_MPS = 18`, director ticks road sense 10×/s (`ROAD_STEPS = 6`).
- Clock maths used below: displayed hour = `dayFrac × 24`, so frac 0 = midnight. Verified against
  `DAY_START = 0.3` (a 07:12 start) and the night bands 0:00–4:48 / 19:12–24:00.
- `src/sim/town.ts`: `SIZE = 3000`, `ROAD_W = 12`, `ZEBRA_OFF = 26`, `ZIGZAG_M = 16`. `src/sim/districts.ts`:
  `DISTRICT_IDS = ['oldtown','business','garden','works']`.
- `src/sim/roadsense.ts`: offences `red_run zebra_run blue_block drove_off phone_use hoax_call`; merits
  `red_stop zebra_wait blue_pull stopped_after`; `START_SCORE = 50`, `LICENCE_LIMIT = 12`, `POLICE_FINE = 20`,
  `COURSE_COST = 60`, marks fade in `MARK_DAYS = 3`.
- `schemas/services.ts`: `ROAD_MOMENTS` already includes `pulled_over`, `got_away`, `course`,
  `recovery_called` — the chase and test moments the teen edition needs are named and voiced already.
- `src/sim/traffic.ts`: `call(role, at, near, wreck, extra)` dispatches police/ambulance/fire/recovery;
  `standDown`, wrecks (`WRECK_AT`, `WRECK_S`), bus legs. Police `findNearest` logic exists for fines.
- `src/sim/economy.ts`: `QUEST_PAY`, `TRIAL_GRADES`, `TWIST_RULES` (`late` has `clock: true`), streak bonus
  (+0–20%), `RANK_REP = [0,2,6,12,20,32,50]`, `RANK_UNLOCKS`, `REP_*` reputation gains, `GOAL_REWARD = 60`,
  `FIND_REWARD = 25`, `FIND_ALL_REWARD = 500`, `REGULAR_FINALE = 150`, `RECOVERY_FEE = 15`, `FUEL_PRICE = 1`,
  cars `hatchback compact pickup taxi coupe supercar`.
- `src/sim/quests.ts`: `Offer` (type, twist?, regular?, rematch?, carJob?, market?), `Progress`
  (arcs, ghosts, found, rep, daily, road), `GHOST_KEEP = 8`.
- `src/sim/goals.ts`: `DAILY_GOALS = 3`; `GOAL_KINDS`: spotless gold twist passenger delivery trial km find
  streak clean night story.
- `schemas/content.ts`: `PLACE_KINDS` includes `school` and `park`; `places.json` already has two schools
  (`pine_hill_school`, `bright_owl_school`); `EVENT_KINDS = roadworks parade market`; `PROP_KINDS` for finds
  (40), `RANK_COUNT = 7`, `VOICE_KEYS`, `CHATTER_MOMENTS`, `RADIO_TOPICS` (incl. `night`, `rain`), quests 80,
  regulars 6, places 54.
- Profile (`kit/profile.ts` / `schemas/profile.ts`): `Player.v: 1`, `games[gameId] = {plays, last, unlocked}`;
  `playerErrors` ignores unknown keys, so an optional field added inside the per-game entry is
  back-compatible. `kit/` is copied from the ARA Games hub — hub first.

## 1. The mode flag (P0, needs the hub)

- Hub change to `kit/profile.ts` then copy here: extend the per-game entry with
  `mode?: 'classic' | 'teen'`; `playerErrors` gains: if present it must be one of those two strings. No `v`
  bump: v1 readers ignore it, teen readers default to `'classic'`.
- This game keeps its own mirror in its save (`Progress` gains `teen?: boolean`) so mid-session mode switching
  is impossible per session (saves store which content set they were made with; mismatch → ask on load, keep
  classic data for a classic save).
- UI: one toggle on the start screen (`src/ui/app.ts`), labelled for the owner's age, written once:
  "Older mode: faster jobs, chases, night. Ask a grown-up." Voice reads it (`voice.ts`).
- Everything below reads one getter, `teenMode()`, from `src/sim/teen.ts`; no scattered flags.

## 2. `src/sim/teen.ts` — the constants, with sources

```ts
export const SCHOOL_ZONE_KMH = 32;   // 20 mph: the Royal Holloway (2011) child-pedestrian limit
export const PEAK_AM = [0.3125, 0.375];  // 07:30-09:00 (dayFrac x 24). RoSPA 8-9 peak, widened for a 480 s day
export const PEAK_PM = [0.6042, 0.6667]; // 14:30-16:00. RoSPA 15-16 peak, widened as above
export const SCHOOL_WALKER_MULT = 3;     // walkers near a school plot during peaks. Example, tune to feel.
export const SCHOOL_ZONE_R = 90;         // metres around a school plot where the zone applies. Example.
export const LEARNER_CAP_KMH = 60;       // before the test. Example; the test is the unlock, not physics.
export const TEST_COST = 40;             // Points to sit the police-station test. Example, vs POLICE_FINE = 20.
export const ROGUE_PAY = 1.5;            // pay multiplier on a rogue job. Example; must fail balance (below).
export const ROGUE_FINE = 40;            // 2 x POLICE_FINE. Example.
export const ROGUE_REP = -2;             // reputation cost when caught. Example.
export const ROGUE_CATCH_ODDS = 0.5;     // police engage on a rogue job. Example.
export const CASE_CLUES = 6;             // finds that form the town case. Example, vs 40 finds.
export const CASE_REWARD = 300;          // Points for closing the case. Example, vs FIND_ALL_REWARD = 500.
export const CAREER_RANK = 3;            // blue-light careers unlock, reuses RANK_REP = 12 rep
export const ROGUE_RANK = 4;             // rogue jobs unlock, 20 rep, after careers exist to be caught by
export const CREW_SEASON_S = DAY_S * 3;  // a rival-crew season = 3 game days, matching MARK_DAYS = 3
```

Balance law for rogue jobs (a test, not a comment): a rogue job's expected value must stay below a helper
job's — `ROGUE_PAY` × (1 − `ROGUE_CATCH_ODDS`) minus `ROGUE_FINE` × `ROGUE_CATCH_ODDS` < 1, at every rank.
`tools/balance.ts` asserts it (§9). This is what "crime never pays overall" means in code.

## 3. School-run director (P1) — `game.ts`, `walkers.ts`, `roadsense.ts`, `town.ts`

- `game.ts` step(): during `PEAK_AM`/`PEAK_PM` and when `teenMode()`, boost walker density to
  `SCHOOL_WALKER_MULT` around every `kind: 'school'` plot within `SCHOOL_ZONE_R` (both schools already exist;
  a third plot may be rezoned later — see §7).
- Speed check: the road-sense sampler already runs 10×/s (`ROAD_STEPS`). Add a zone test: inside a school
  zone during a peak, above `SCHOOL_ZONE_KMH` accumulates a timer; over ~2 s = offence `school_fast`
  (+2 points, drop 4 — between `blue_block` and `zebra_run`); a whole peak passed under the cap = merit
  `school_calm` (+10 pay, +2 rise, in the `MERITS` shape, "thanks, not fines", same rule as `blue_pull`).
- `schemas/services.ts` `ROAD_MOMENTS` gains `school_fast`, `school_calm`; `prompts/roadlines.txt` +
  `src/data/roadlines.json` regenerate with the two new moments (teen voice).
- `walkers.ts`: school children are regular walkers with school-run uniform colours only in the view layer —
  no new sim type, so save size and tests hold.
- `crossings.ts`: during peaks the zebra `MAN_S = 6` phase gets 4 more seconds near schools (`SCHOOL_MAN_S`,
  *example*): kids cross slower, mirroring `DESIGN_WALK_MPS` caution.
- Goal kinds `GOAL_KINDS` gains `school: [2, 4]` ("keep it calm around the school twice"); `goals.ts` step
  wired from the merit.
- Nothing in this section exists in classic mode.

## 4. Blue-light careers (P2) — `quests.ts`, `traffic.ts`, `game.ts`, new data

- Three call-sign careers, each a chain of 4 jobs, one per service already modelled:
  police escort (`police_car`), ambulance sprint (`ambulance`), recovery tow (`recovery_truck`).
- `Offer` gains `career?: 'police' | 'ambulance' | 'recovery'` and `careerStep?: 1..4`. Quest type stays one
  of the three originals (a career job is a normal delivery/passenger/trial with a career tag), so saves,
  validators and `QUEST_PAY` all hold. Career pay = normal payout × `CAR_JOBS`-style mult table:
  `CAREER_MULT = { police: 1.3, ambulance: 1.4, recovery: 1.25 }` (*example*, tune against `CAR_JOBS`).
- `traffic.ts` `call()` already dispatches; career jobs reuse it in reverse: the player is the caller's
  partner. New in `traffic.ts`: `escort(player, role, at)` — one service vehicle drives to the player's
  destination with `cruise` matching the player (the recovery `job` logic at lines ~232–299 is the pattern to
  copy), then waits at the site. No new AI states beyond `job`, matching the recovery job shape.
- Fail-soft rules (Decided): a career job never fails; the blue merit `blue_pull` (+15 pay, +3 rise) already
  rewards pulling over for the crew en route.
- New content: `prompts/careers.txt` → `src/data/careers.json`, `CareerCard = { id, kind, step, title, text,
  thanks }` in `schemas/content.ts`; 3 × 4 = 12 cards, generated. Radio tie-in: `RADIO_TOPICS` gains
  `career_board` (one-line callouts), regenerate `radio.json`.
- Unlocks at `CAREER_RANK` (rank 3); `RANK_UNLOCKS` gains `[3]: 'Blue-light careers'` replacing nothing —
  current rank-3 entry "Long-distance work" moves to rank 5 (`RANK_LONG_HAUL = 5` in teen mode only, a
  mode-keyed copy of the unlock table in `economy.ts`).

## 5. Rogue jobs (P3) — `quests.ts`, `game.ts`, `traffic.ts`

- `Offer` gains `rogue?: { why: string; heat: 1 | 2 }`. Text comes from generated cards (`prompts/rogue.txt`
  → `roguejobs.json`, 20 cards: unlicensed getaway, out-of-hours courier, "the boss says hurry"), all ending
  in the validator's required pattern: the job is comic and the fine is expected, never "don't get caught to
  keep it".
- On a rogue job the job's `late`-style clock applies; when police engage (roll `ROGUE_CATCH_ODDS` via
  `traffic.call('police', …)` which exists already), the chase uses the ROADMAP pursuit: give up after 2 min.
- The existing `pulled_over` and `got_away` moments in `ROAD_MOMENTS` are the chase's two endings — the radio
  already has lines for them (`roadlines.json` regeneration will revoice them for teens).
- Caught: `ROGUE_FINE`, one `drove_off`-class mark (6 points), `ROGUE_REP`; escaped: `ROGUE_PAY` × payout and
  a `got_away` line; either way the day's road-sense score moves as normal.
- Gate: only offered at `ROGUE_RANK` (rank 4) and only to a player whose road score is ≥ 60 (they have earned
  the mischief).
- Validation: the balance law in §2 as an assertion in `tools/balance.ts` — see §9.

## 6. The town case (P4) — finds, regulars, new data

- One light whodunnit: who keeps stealing the market trolley (working title). Six clue finds (existing 40
  `finds.json` gain a `case?: number` field 1..6, regenerated with new IDs kept), one suspect regular each,
  solved by finishing the six clue jobs in any order: `Progress` gains `caseStep: number`.
- `schemas/content.ts`: `CaseCard = { clueFind: string, suspect: string, question: string, answer: string,
  text: string }`; `prompts/case.txt` → `case.json` (6 cards + 1 closing card). `Regular` already has jobs +
  arcs (`REP_FINALE = 3`, `REGULAR_FINALE = 150`) — the case's closing job pays `CASE_REWARD` and +3 rep, and
  unlocks one rank name badge via `unlocked` in the profile.
- Nothing dark: theft and mischief only (validator rejects injury, menace, or "hiding from police" wording).

## 7. Map edges (P4, gated on phone performance)

- ROADMAP "Next" says phone fps is unverified; so no change to `SIZE = 3000`. Rezoning only, inside the
  current bounds:
  - Give each existing school a playground: two `park`-kind plots adjacent to `pine_hill_school` and
    `bright_owl_school`, furniture only (`FURNITURE_IDS` already has bench, planter) — `town.ts` zoning pass,
    `districts.test.ts` must still pass.
  - **Cleared 2026-11-03**: the phone held above 60 fps (green band) on the production build, so the
    marina/beach/lake edge can go ahead in P4 on the `works` district's south edge buffer (`onBuffer`) —
    the same rezoning the ARA World "nature and sky" match wants (ROADMAP Stage 1). Watch the triangle
    count on the readout as it lands; the `fleet` chunk is already the heavy asset in the build output.

## 8. Ranks, rival crews, weather edge, test (P5)

- Ranks: regenerate `ranks.json` through the teen `ranks.txt` prompt — 7 voices at 10–13 (validator §9), e.g.
  level 0 stays "New in Town"; nothing else about ranks changes (`RANK_REP` stays).
- Rival crews: three crews (names, colours and taunts from `prompts/rivals.txt` → `rivals.json`,
  `RivalCrew = { id, name, colour, taunts: string[] }`). At each `CREW_SEASON_S` boundary the game compares
  the player's earned Points that season against each crew's seeded score (deterministic from the day's rng,
  so replays match, same trick as `game.ts` event choice). Results are local; hub leaderboards are **out of
  scope** for v1 (no hub ranking service exists — flag if wanted).
- Night and weather edge: `SKY_SLOTS`/`skies.json` regenerate with two darker fog/rain skies and one storm;
  `RAIN_ODDS` and `EVENT_ODDS` untouched, but in teen mode `isNight` gets one `RADIO_TOPICS`-backed "spooky"
  story line each night (voice + radio; no sound stingers — `sound.ts` keeps its no-scare rule).
- Driving test: at the police service building (`SERVICE_IDS` has `police`), pay `TEST_COST`, answer the six
  Green Cross Code steps in order (a fixed text list in `teen.ts` quoted from the 2018 code, never generated —
  the school-taught wording must not drift), then a closed-yard course on the existing test-track gates. Pass
  removes `LEARNER_CAP_KMH`. `ROAD_MOMENTS` already has `course` and `COURSE_COST = 60` for the licence course
  — the test is a separate payment path, reuse the same fine-free framing.

## 9. Content pipeline: the `TeenTone` validator and generation plan

Rules live in `schemas/content.ts` (one validator, per the hub warning about two that disagree):

- `teenToneErrors(text)`: words ≤ 20; **no** entry in a hard swear list (empty at PEGI 7); no fear/gore word
  list (`terrifying, blood, dead, kill, chase him down…`); crude humour allowed; no crime-pays phrases
  (`get away with, keep the money, they never catch`); Green Cross Code lines only allowed to quote the fixed
  step list.
- `rogueCardErrors(card)`: must contain a pay-off line naming the fine/comedy ending; must not target a
  person; heat 2 only at rank ≥ 5.
- `caseCardErrors`: no injury, no menace wording, suspect must be a real `Regular.id`.
- `schoolLineErrors`: for roadlines/goals with school content — the step wording must match the fixed list.

Regeneration plan (`npm run gen -- <kind>`; never hand-edit `src/data/`):

| kind | file | count | new/changed |
| --- | --- | --- | --- |
| ranks | ranks.json | 7 | revoice teen |
| quests | quests.json | 80 | revoice teen; 12 tagged for careers, 20 replaced by rogue set |
| twists | (twists cards) | 4 | unchanged types |
| regulars | regulars.json | 6 | revoice + 6 become case suspects |
| finds | finds.json | 40 | 6 gain `case` 1..6 |
| events | events.json | keep + fair, matchday | `EVENT_KINDS` gains `fair`, `matchday` (effects: parade-like `ROUGH_MPS`, market-like `MARKET_BOOST`) |
| goals | goals.json | keep + `school` kind | 3/day unchanged |
| roadlines | roadlines.json | 14 moments +2 | `school_fast`, `school_calm`, revoice `pulled_over`, `got_away` |
| radio | radio.json | keep | + `career_board` topic, spooky night line |
| chatter | chatter.json | keep | revoice teen |
| careers | careers.json | 12 | new |
| rogue | roguejobs.json | 20 | new |
| case | case.json | 7 | new |
| rivals | rivals.json | 3 | new |
| skies | skies.json | +2–3 darker | edge weather |

All new kinds extend the `content.test.ts` checks and `tools/qwen-gen.ts` kinds list, with the generate →
validate → repair loop as in the existing pipeline.

## 10. Tests and checks

- New unit tests beside each sim change (`teen.test.ts` for constants and zone logic; `roadsense.test.ts`
  gains `school_fast`/`school_calm`; `quests.test.ts` gains career/rogue offers; `game.test.ts` gains peak-hour
  walker density at fixed seeds).
- `tools/balance.ts`: add a teen session that runs careers, rogue jobs and school zones; assert (a) the §2
  balance law at every rank, (b) a career chain's total pay ≤ its helper equivalent × 1.15.
- `tools/review.ts`: 40 headless teen sessions through the local model — reviews are leads; replay flags
  before fixing (house rule).
- `npm run check` (types + tests), then `tools/smoke.ts` and `tools/touch-test.ts` on the phone preview, in
  **both** modes: the mode flag must not break classic saves (`tools/savecheck.ts` gets a teen-save fixture).

## 11. Phases

- **P0 mode plumbing + tone proof**: kit/profile `mode` field, `teenMode()` getter, start-screen toggle,
  `TeenTone` validator, regenerate `ranks.json`. If the rank voices feel wrong at this point, stop and fix the
  prompts before anything else.
- **P1 school-run**: §3 (director, zone, merits, goals, roadlines).
- **P2 careers**: §4 (escort traffic job, career chain, careers.json, radio board).
- **P3 rogue**: §5 (cards, chase wiring, balance law test).
- **P4 case + edges**: §6 and §7 (playgrounds rezoning).
- **P5 rivals, night edge, test**: §8, plus teen revoice of regulars/chatter/quests.

Each phase ships dark behind `teenMode()`; classic play stays bit-identical (a `game.test.ts` seeded replay of
a classic session is the guard).

## 12. Risks and watch-outs

- `kit/profile.ts` is the hub's file: the `mode` field needs the hub owner's change first; this game carries a
  copied version, so sequence: hub → copy → here.
- `DISTRICT_IDS` changes would ripple through `view/` and tests; §7 deliberately avoids touching it.
- Saves carry which mode made them; switching modes on an existing save asks once and never rewrites classic
  data.
- Perf: no new always-on systems; walker boosts are capped near two plots; new vehicles reuse existing fleet
  models (`FLEET_IDS`) so triangle budget is unchanged.
- PEGI self-assessment: the IARC questionnaire (one form gives PEGI + ESRB) must be filled honestly before any
  public claim of PEGI 7 / E10+; until then, TEEN_EDITION.md's rating language stays "target".
- The rogue set must never appear in classic mode; `quests.test.ts` asserts offer pools by mode.

## 13. Sources

As in TEEN_EDITION.md: PEGI criteria and the July 2026 shake-up (Wikipedia "PEGI", pegi.info); ESRB E10+ and
LEGO City Undercover descriptors (esrb.org); child pedestrian casualties double 9→11 (DfT THINK! "Safe
Adventures", think.gov.uk); 08:00–09:00 / 15:00–16:00 casualty peaks and rising risk from 10 (RoSPA
home-to-school guide); 20 mph child speed-perception limit (Royal Holloway, *Psychological Science* 2011);
Green Cross Code steps (Wikipedia); chase/escort/accolade patterns (Wikipedia "Forza Horizon 5").
