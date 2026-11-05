# ARA Driving roadmap

## Next
- [x] Check performance on a real phone (the readout is on screen). A PC holds 60 fps at about 430,000 triangles.
      Done 2026-11-03: the phone stayed above 60 fps (green band) driving the production build over the LAN. The
      map-edge gate in TEEN_SCOPE.md (P4 marina/beach/lake) is open.
- [ ] Hand more to Qwen: street furniture models and cockpit colours, through the generate, check and review loop.
- [ ] Drive into the holes you make in buildings, and save that damage.
- [ ] Finish the research pass: prices, pay, weather and day length.
- [ ] More street variety: dormers, bay windows, deeper loading bays, shop signs.

## Life in town (asked for 2026-11-02)
Get out of the car, live in the town on foot, ride the buses, work real jobs for the services, and spend what you earn.
Each stage needs its own research pass first: how each job really runs, and the real numbers behind it.

### Stage A: on foot
- [x] Get out of the car wherever it's parked, and back in. The car stays where you left it, and the save keeps it.
- [x] Walk the pavements as one of the town's figures, with a camera that follows; cross at zebras and green men.
- [x] A button on the controller to get out and back in: Y, as F and the action button.
- [x] Choose which figure you are, in the Menu.
- [x] Doors on the shops and places you can walk up to. Each says what the place is and offers the jobs that start
      there; going inside is Stage C, or ARA World's.

### Stage B: buses as a passenger
- [x] Wait at a stop, flag the bus, pay the fare (2 Points, from England's £3 cap), ride, ring the bell, get off at the
      next stop. Stops are request stops: a bus only pulls in for someone waiting, someone getting off, or the bell.
- [ ] The fare cap drops to £2 on 1 January 2027. At a Point to about £1.40 that's 1.4 Points, so `BUS_FARE` should
      go down to 1 then (confirm the new cap has started first).
- [x] Which bus is which: route numbers on the buses and stops, and when the next one is due. The two loops are the 1
      (Outer Circle) and 2 (Inner Circle), C clockwise and A anticlockwise as Birmingham numbers its circles. Each bus
      lights its number front and back, each stop has a flag listing its routes, and the HUD counts down to the bus in
      real seconds. A bus far round its loop is brought back round, up the road from where you wait.
- [x] Junction gridlock: now and then a bus and the cars round it stopped at a junction and never cleared. Fixed: a car
      held up behind another lets the junction go, and a ring of cars each waiting on the next has one go first. Found by
      `tools/footreview.ts`; `src/sim/gridlock.test.ts` replays the sessions that jammed.

### Stage C: shops and a shopping centre
Decided 2026-11-05:
- Going inside is a counter sheet at the shop's door: browse, buy, leave. No 3D interiors; ARA World can take over
  later for the places it has.
- Prices follow a split rule. Everyday things (food, drink, clothes) cost real money at about £1.40 a Point, as fuel and
  the fare do. Cars and paint stay scaled down on purpose (a real respray is £2,400-2,800, about 1,700 Points).
- Food is energy for running, and gently: a full bar is a few minutes of running, and an empty one still walks at full
  speed. A snack refills part of it, a meal all of it.
- Car paint and parts are bought by driving somewhere: the motor shop's counter, or the garage at home, which always
  sold them. Parts are cosmetic (the body kits now; wheels and lights later), so the approved handling stays as it is.
  Anything already bought is kept.
- Clothes are garments: tops, trousers, shoes and hats. Hair and skin stay free choices, and a basic set is free. The
  driver and the figure on foot are one person, in the same clothes.
- Qwen makes the shops' names and stock behind a validator holding the researched price bands.
- The shopping centre replaces one Business Quarter block: one building of about 5,000 m² (ICSC Europe's small
  centre starts at 5,000), one entrance, car parking, and a sheet with a tab for each shop.

- [x] Go into a shop and buy things with the Points jobs earn: clothes for your figure, food, parts and paint. 23
      street shops and 8 centre units, stocked by Qwen behind `schemas/shops.ts`; four of the street shops sell nothing
      yet (a toy shop, a bookshop), and a motor shop sells the garage's paint and parts.
- [x] Energy for running, refilled by food and drink (`src/sim/energy.ts`).
- [x] A shopping centre in the Business Quarter, with several shops under one roof.
- [ ] Wheels and lights as cosmetic car parts, beside the body kits.
- [ ] Whistle & Wrench's only plot is held for a regular's story, so it has no door; Sparrow Supplies is the motor
      shop you can reach.

### Stage D: careers
- [ ] Sign on at the station or depot and drive its vehicle on real shifts: bus driver (a timetabled route, stopping at
      each stop), recovery driver (tow broken-down and crashed cars), mechanic (mend cars at the garage and the roadside),
      police (answer calls, stop the drivers who break the law), firefighter and paramedic (answer 999 calls).
- [ ] Ranks within each career that unlock vehicles and better-paid work.
- [ ] More places to drive to, including businesses with deliveries of their own.

## Decided
These differ from real cars and roads on purpose. Played and approved on 2026-10-30, so leave them unless asked.
- Braking at 16 m/s², about twice a real car's. It feels right here.
- Roads 12 m wide against a real 7.3 m.
- Top speeds of 110 to 165 km/h, for now.
- Pedestrians always get out of the way, and are never hit. Drivers always stop at a zebra, where 97% do in life.
- Reaching 12 licence points means a course that costs Points, not a ban, and points fade after 3 game days rather than 3 years.
- The police stop you with a word and a fine. They never ram or block, and a pursuit gives up after two minutes.
- There are no speed limits to break, as the top speeds were approved.
- Blue-light crews arrive in under two minutes, against 8-9 minutes in life, so you get to see them come.
- Fuel at 2 L/km in a hatchback against a real 6 L/100 km, cut to a third after play. A tank lasts about 20 km, and fuel is 7-15% of what a run earns.

## Joining up with ARA World

ARA World is a separate game: a side-view world of about 50 places on floors, 12 characters
and 11 houses, built in 2D with Pixi from its own design notes. ARA Driving is a 3D town in Three.js. Both are on the ARA Games
host and already share one player profile and one wallet, so the bridge exists.

**The aim:** one town you can drive around and step out into. Drive to a place in ARA Driving, go inside, and you're in
that place in ARA World; come out and your car is where you left it.

**The approach:** keep two games joined by links, not one merged game. The engines are different and each suits what it
does, and ARA World has its own design notes as its spec. Nothing here should change how that game works without its owner's say.

### Stage 1: a shared map of places
- [ ] A shared list matching ARA World's places to plots in the town, kept in one file both games can check.
- [ ] Name the town's plots after ARA World's places, so the map and the job text use the same names.
- [ ] Match up the districts. ARA World's are homes, downtown, shopping, fun, nature, travel, care and sky; this town has four.
      Most fit (shopping and downtown to Old Town and the Business Quarter, homes to the Garden Suburb). Nature and sky
      don't, and may want new areas at the town's edge.

### Stage 2: drive there, go inside
- [ ] ARA World opens straight at a named place from a link, and offers a way back.
- [ ] A "Go inside" button when you park at a matched place in ARA Driving.
- [ ] Return to the car where you left it, with the game state saved first.
- [ ] Test on the tablet and phone, including going offline.

### Stage 3: shared people and things
- [ ] ARA World's characters as passengers and as the people on the pavements.
- [ ] Deliveries that arrive in ARA World: drive a parcel, and it's in the post box there.
- [ ] Things bought in one game show up in the other, through the shared profile.
- [ ] Your ARA World house as your home plot: where you park, and where a tow brings you.

### Stage 4: one world
- [ ] A shared map screen, with the same places and districts in both games.
- [ ] Places that exist in both: the train station, the bus stop and the shops, matching inside and out.
- [ ] One start screen in the hub that opens the world, and either way of playing it.

### Open decisions
These belong to ARA World's owner, and need asking before work starts:
- [ ] Which places go where in the town, and whether any stay hidden.
- [ ] Whether ARA World's characters appear in the driving game, and which ones.
- [ ] How crashes should work when the worlds are joined up. The driving game has wrecks and smoke, and ARA World is
      gentle, so a softer mode may be right when you've come from ARA World.
- [ ] Whether ARA World's hidden places can be reached by car at all.

### Things to watch
- Both games write to the same profile, so a change to its shape has to go through the hub first (`kit/` is copied from there).
- ARA World is built for a tablet and ARA Driving for a phone, and links between them have to work on both.
- Both generate content with Qwen, so a shared place list needs one validator, not two that can disagree.
