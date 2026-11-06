# ARA Driving: young-teen edition — design notes

A young-teen version of this game for roughly ages 10 to 13, built on the same town and the same code. This
page holds the research and the decisions drawn from it. The buildable detail — files, values, content lists
and phases — is in TEEN_SCOPE.md. Proposed numbers are written as constants with their source, ready to go
into `src/sim/` when the work starts.

Ages matter here: this is not a little-kids edition. Ten to thirteen is the age that wants the GTA-shaped thing
— an open city, chases, money, fast cars, a reputation — and it is also, per the safety research below, the age
at which children become real road users on their own. The design brief is: give the *shape* of that adult game
and none of its content.

## Why this game is close already

ROADMAP.md's "Decided" list fits a teen audience without going soft: chases that end kindly, a course instead of
a ban, crews that actually come. What this edition adds is energy and stakes pitched at 10-13, not a new engine.

## What other open-world games look like

| Game | What it is | Rating and why | What to take | What to leave |
| --- | --- | --- | --- | --- |
| Grand Theft-style crime sandboxes | open city, crime story, wanted levels | adult (ESRB M — well-known example) | the shape: open city, chases, earn-and-upgrade loop, customisation, reputation | all of the content |
| LEGO City Undercover (Wikipedia, ESRB) | the accepted stand-in for that shape at this age: open city with 20 districts; you play **Chase McCain, an undercover police officer** — investigating, following, arresting; disguises open roles; collectibles everywhere | **ESRB E10+ for "Cartoon Violence and Crude Humor"** (esrb.org rating page) | play-the-good-guy power fantasy; cartoon mishaps; disguises/roles; one big districted city | babyish look; the game is actually tuned a bit young — teens can handle faster cars and tougher jobs |
| Forza Horizon 5 (Wikipedia) | open-world racing festival; ~799 cars, 1,800+ "accolades" for small tasks, mini-games strewn on the map, seasons, local weather, AI helper voice, sign-language accessibility | racing only (rated E/PEGI 3 as widely known — example) | accolades: constant small rewards; a friendly helper voice; custom liveries and tuning | auction house, battle-royale mode, lobby noise |
| This game today | 3 km town, jobs, ranks, road-sense record, finds, ghosts, town events | already forgiving on purpose | — | the babyish rank voices, once checked against this age |

The genre lesson from LEGO City Undercover specifically: the police/citizen side of the crime game, played
straight, gives teens the same open-city pull without any of the crime glorification.

## Rating targets: PEGI 7 / ESRB E10+

- Target **PEGI 7** and **ESRB E10+**, the exact band of the age. From pegi.info (via Wikipedia, PEGI): PEGI 7
  may contain content "frightening to younger children" and "violence depicted in implied, non-detailed or
  non-realistic way" — that covers cartoon crashes, chases and sirens. Bad language pushes to PEGI 12, so the
  teen edition keeps **zero swearing** (ESRB E10+ would allow "mild", but PEGI 7 would not; hold the stricter line).
- **Daily goals are safe at this band.** The July 2026 PEGI shake-up moved "play by appointment" mechanics
  (daily/weekly quests) to PEGI 7 — that is our target, so they stay. But PEGI also flags "pressure to play"
  and "time-limited offers": keep the daily goal as a bonus, never a countdown with a lost reward. (Wikipedia, PEGI)
- Loot boxes pull PEGI 16 (from July 2026) and simulated gambling is 18+. No spins, no random paid items, ever;
  unlocks always visible. (Wikipedia, PEGI)
- PEGI labels are legally enforceable in UK retail since 30 July 2012. (Wikipedia, PEGI)

## What the research says about 10-13 and roads

- **Child pedestrian casualties double between ages 9 and 11** — exactly as children start travelling to
  secondary school alone. DfT's THINK! "Safe Adventures" campaign (April 2024) is built on this.
  (think.gov.uk/campaign/safe-adventures)
- RoSPA's home-to-school guidance: child pedestrian risk rises from age 10 as children move unaccompanied, and
  most child casualties happen in the 08:00–09:00 and 15:00–16:00 peaks. (rospa.com practitioners' guide)
- The pedestrians this age are still the ones who misjudge speed: primary-age children cannot reliably judge
  vehicles above ~20 mph (≈ 32 km/h). Royal Holloway, *Psychological Science* 2011. So in this game the small
  people on the pavements are genuinely, realistically vulnerable — and the teen *driving* is the one with the
  power. That asymmetry is the whole educational trick, and `src/sim/roadsense.ts` already measures it.

```ts
// Young-teen edition constants (proposed, to live in src/sim/kids.ts or similar)
// 20 mph ≈ 32 km/h: above this, child pedestrians judge approaching vehicles
// unreliably (Royal Holloway, Psychological Science, 2011). School-zone cap.
export const SCHOOL_ZONE_KMH = 32;
// Real child-pedestrian casualty peaks around school (RoSPA home-to-school guide:
// 08:00-09:00 and 15:00-16:00). Game day is DAY_S = 480 s, so map the peaks to
// game-time windows with lots of school-kid pedestrians.
export const PEAK_AM = [0.30, 0.38];  // fraction of game day (verify vs clock map)
export const PEAK_PM = [0.60, 0.68];
```

Top speeds stay as ROADMAP decided (110–165 km/h): teens want pace, and the forgives are already in the physics.

## Pillars for the young-teen edition

1. **The open-city shape, the good-guy role.** Jobs that feel like the adult game — pursuits (as police ride-along),
   blue-light sprints, recovery after a crash, taxi, courier — never crime glorification. LEGO City Undercover's
   whole formula, with cars.
2. **Real stakes, kind endings.** Keep fines, licence points, fuel bills, tow fees, the garage economy — this age
   can read a bill and dodge a fine, and that's the fun. Keep the ROADMAP's kind endings: nobody is ever hurt,
   points fade, a course not a ban.
3. **Reputation is the game.** This age plays for status. Lean on `roadsense.ts` hard: a visible road-sense score,
   badges, ranks teens respect (regenerated voices — not "Busy Bee"), rival-crew leaderboards on the hub profile.
4. **School run, in season.** During `PEAK_AM`/`PEAK_PM` the town fills with kid pedestrians near the school;
   slower traffic, more zebras, big merits for zebra stops, and a lollipop-person crossing job. Pairs with the
   Green Cross Code they actually learned at primary school — now they *protect* it.
5. **Read-write is fine; voice stays optional.** No dumbing down of text, but keep `voice.ts` reading mission
   text aloud as an accessibility option, not a default.
6. **Customise everything, pay nothing real.** The existing catalogue tiers (paint, patterns, decals, outfits)
   are the right loop; earn-only, visible unlocks, no paid anything.

## What stays, changes, goes

| System (today) | Young-teen edition |
| --- | --- |
| town, districts, routing, traffic AI | same; add a school plot + playground edge; school-run peak hours |
| jobs + twists | same three; regenerate at teen voice (courier for the skate shop, tow a wreck, witness run); keep `late`, it's fine at this age |
| regulars and story arcs | keep; make arcs a bit mystery-shaped — finds become clues on a town case board |
| finds with clues | keep as written clues; tie clusters into an unsolved-town-case arc (LEGO's investigations) |
| ghost time trials | keep with grades; add rival ghosts from the hub profile |
| ranks 0-6 | regenerate voices for 10-13 (validator checks tone) |
| road-sense record | **keep whole**, offences and merits — this is the core of the edition |
| fuel, fines, tow, garage | keep — bills are gameplay at this age |
| police / fire / ambulance | keep and *feature*: ride-along jobs, pursuit escort, 999 sprints |
| town events | keep; add fair day, fete, market, match day |
| radio | keep; regenerate lines at the teen voice |
| daily goals | keep; bonus framing, no countdown pressure |

## Scope to add (the "lots of scope" part)

- **Blue-light careers:** three upgradeable call-signs (police escort, ambulance sprint, recovery tow) with
  uniforms from the catalogue — the "cop game" energy, played as a job.
- **The town case:** a light whodunnit across finds, regulars and clues; solving it unlocks a rank. Nothing dark.
- **Driving test at the police station:** learner plates → test (the six Green Cross Code steps as the theory
  part, since that's what the town's pedestrians obey) → insurance-style upgrade. Mirrors real graduated
  licensing loosely — example framing, not a real test.
- **Rival crews:** three rival taxi crews with hub-profile leaderboards; the current day/points structure feeds them.
- **Map edges:** park-with-lake and a beach (the ROADMAP's ARA World "nature and sky" fit), plus a small marina.
- **Stunts and jumps:** ramps off the marina, splashdowns, time-gap scoring — Forza-style accolades on the map.
- **Weather play stays but teen-shaped:** fog, heavy rain, first snow — hazards with teeth but no harm (ROADMAP physics).

## How the content gets made (house rules)

All text, ranks, events, regulars and goals run through the existing Qwen loop. `schemas/content.ts` grows a
`TeenTone` validator: sentence ≤ 20 words, **no swearing at all** (PEGI 7 ceiling), no gore or fear words,
crude humour allowed (it's the E10+ descriptor LEGO carries), Green Cross Code wording only from the approved
step list. Prompts under `prompts/`; regenerate with `npm run gen -- quests --replace …`. `src/data/` is never
hand-edited; the validator holds the rating rules so generated content cannot drift past PEGI 7.

## Shape in the code (decided as a mode; not built yet)

- One game, a **teen mode flag** on the shared profile (`kit/` change first — the hub owns it): switches content
  validators, rank voices, school-zone rules and peak-hour director, and unlocks the new job types. Points and
  the ARA World bridge keep working unchanged.
- The current game and the teen edition share `src/sim/roadsense.ts` as-is — the offences half, dropped for
  little kids, is *kept* here, which is why this edition is a thin overlay, not a fork.

## Decided
**Changed 2026-11-06:** there is no separate edition or mode flag. The owner wants these ideas folded into the main
game as more to do and more fun, so they're built for everyone, still held to the PEGI 7 lines below. The notes and
TEEN_SCOPE.md stay as the research and the plan; where they say `teenMode()`, read "the game".

Approved by the owner on 2026-11-03, so leave them unless asked.
- The edition is a **mode of this game**, switched by a teen flag on the shared hub profile (`kit/` change
  first). The systems barely change, and Points and the ARA World bridge keep working.
- **Mild rogue jobs are in**: unlicensed getaway runs, speeding courier jobs and the like, always played as
  cartoon mishap that ends in comedy and a fine — the crime is something you do and pay for, never a story you
  rise through. Still implied, non-detailed, and never at a person; that keeps it inside PEGI 7. The `TeenTone`
  validator must reject any job text where crime pays overall.
- **Night and weather may have a real edge**: dark alleys, tense storms, a spooky radio voice, fog that hides
  the road. PEGI 7 allows content "frightening to younger children", and this age likes the edge. The lines that
  do not move: no gore, no horror sound stingers, no swearing, and a crash still never hurts anyone.

## Sources

- PEGI 7 criteria; July 2026 shake-up (play-by-appointment → 7, loot boxes → 16, gambling sim → 18); UK legal
  enforceability: Wikipedia "PEGI"; pegi.info "What do the labels mean?"
- ESRB E10+ and LEGO City Undercover's "Cartoon Violence and Crude Humor": esrb.org rating pages
  (lego-city-undercover; the-chase-begins); Wikipedia "LEGO City Undercover"
- Child pedestrian casualties double 9→11 / Safe Adventures: think.gov.uk/campaign/safe-adventures (DfT)
- Risk rises from 10; 08:00–09:00 and 15:00–16:00 peaks: RoSPA home-to-school travel guide (rospa.com)
- Children misjudge vehicles above 20 mph: Royal Holloway, *Psychological Science* 2011
  (journals.sagepub.com/doi/10.1177/0956797611400917)
- Green Cross Code six steps (school taunt for this age): Wikipedia "Green Cross Code"
- Forza Horizon 5 activity design (accolades, accessibility): Wikipedia "Forza Horizon 5"
