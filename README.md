# ARA Driving

A low-poly 3D free-roam driving game for the ARA Games collection. Take jobs, earn Points, buy fuel, unlock cars and style your car and driver. Built phone-first with Three.js.

```
npm install
npm run dev        # play it
npm run check      # types and tests
npm run build
```

## Layout

- `src/sim/` the rules: town, routing, car, fuel, quests, traffic, streaks, finds, ghosts, ranks, daily goals and town events. No DOM, so tests and headless runs use the real game.
- `src/input/` the touch schemes and the router that turns them into one `DriveIntent`.
- `src/view/` Three.js: the town and its buildings, the car and driver, the four cameras, effects, the sky.
- `src/ui/` HUD, maps, garage, voice, sound and the radio.
- `src/data/` content made by the local model: places, jobs, twists and car jobs, regulars and their story buildings, buildings, finds, skies, radio lines and stations, passenger chatter, first-time tips, daily goals, ranks and town events. Do not hand-edit it: change the prompt or validator in `prompts/` and `schemas/content.ts`, then regenerate with `npm run gen -- quests --replace id,id`. Run `npm run gen -- twists` or `npm run gen -- carjobs` for those cards.
- `kit/` and `schemas/profile.ts` are copied from the ARA Games hub; change them there first.

## Tools

- `node tools/balance.ts` drives full sessions in every car and prints what each one earns.
- `node --env-file=.env.llm tools/review.ts` has the local model review 40 headless sessions. Replay a flagged one with `node tools/review.ts --replay <session>` before acting on it.
- `node tools/smoke.ts` and `node tools/touch-test.ts` play the real build in a browser (run `npx vite preview --port 4179` first). `node tools/features.ts` stages each building, sky and effect and saves screenshots to `out/`.

Points are the hub's shared `coins`. The game deploys to `/ara-driving/` on the same Pages host as the hub, so they share one profile.
