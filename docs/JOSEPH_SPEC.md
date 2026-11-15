<!-- CLAUDE CODE: this file is your task. Read it top to bottom and follow it. Start at PART A, Phase 0. -->

# PROMPT FOR CLAUDE CODE — Oakland to the Moon: finish the game from Joseph's spec

You are working in my clone of the team repo **Oakland to the Moon** (Phaser 3 + TypeScript + Vite, single-player, SNES-style pixel art, Commander Kai's crewed Moon mission, built for the NASA Space Apps 2026 "Space Mission Design Game" challenge).

Everything below PART B is my approved spec. Implement **all** of it. Do not skip, shorten or "simplify" any detail. If something in the spec conflicts with how the code works, tell me and propose the smallest change that keeps the spec's behavior.

---

## PART A — RULES (read first, follow the whole time)

### A1. Safety rules: do not break or replace working work

1. **Never work on `main`.** First run `git status` and `git branch`. If `joseph-finish-game` exists, check it out. If not, create it from the latest `main`: `git checkout main && git pull && git checkout -b joseph-finish-game`.
2. **Do not push, force-push, rebase shared history, or open PRs.** I'll push and open the PR myself after checking the game.
3. **Finish, don't rebuild.** The first developer already built the hangar, the simulation, the emergencies (8 context-dependent types with seeded random results), the scoring, and a 33-component parts list in 13 categories. Extend those systems. Do not rewrite them from scratch, and do not replace a working system with a new one.
4. **Prefer new files over editing old ones.** Put new data, emergency cards, formulas and desk screens in new modules, and hook them in with the fewest possible lines in existing files. Don't rename, move or reformat existing files: a reformat makes the whole file look changed and causes merge conflicts.
5. **No multiplayer.** The game stays single-player. "Roles" are a specialty the player picks.
6. **Turn things off; don't delete them.** Where the spec removes a feature (reliability / chance-of-success rolls), switch it off behind a config flag and update its tests, rather than deleting code.
7. **Tests stay green.** Before every commit, run `npm run build`, `npm run test` and `npm run test:e2e`. If anything fails, fix it before committing. If a pre-existing test was already failing before you touched anything, tell me. Don't "fix" it by deleting it.
8. **Small commits, one feature each,** with clear messages. If one breaks something, I want to undo just that one.
9. **Ask before anything you can't undo.** Deleting files, changing build or deploy config, adding dependencies, or changing save formats: ask me first.

### A2. How to work: phases (stop at each checkpoint)

**Phase 0: look around and plan. Don't change any code yet.**

1. Read `README.md`, `docs/SCIENTIFIC_ASSUMPTIONS.md`, `SOURCES.md`, and any handoff or docs files.
2. Map the code. Find where these live: the parts data, the hangar UI, the physics/simulation, the emergency system (search for "emergency"), the scoring and report screen, difficulty settings, the scene list and flow, and the unit handling.
3. Run `npm install` (if needed), `npm run build`, `npm run test` and `npm run test:e2e`, and record the starting results (the handoff reports 52/52 unit tests and 3/3 e2e).
4. Report back to me:
   - a map of where each spec item will plug in (file plus function or scene);
   - which existing numbers differ from the spec's R values;
   - the plan, phase by phase.

   **Then stop and wait for my OK.**

**Phase 1: data and physics (Priority 0, make it correct)**

- Update the parts data to the Spacecraft design spec (PART B, tab 3): every value, R/G tag, and price.
- Add exhaust speed (m/s) and thrust (N) to every engine, booster, thruster and lander engine.
- Lock each engine to its fuel.
- Add the material + fuel risk table.
- Use the Formulas spec (tab 6) for every calculation.
- Use the Mission spec's speed numbers (tab 2).
- Make sure Orion can't do a low-lunar-orbit round trip, and an Apollo lander can't land from the halo orbit.
- Add unit tests for every worked example in **PART C** (they are acceptance tests).
- Commit.

**Phase 2: hangar and roles (Priority 1)**

- Add the 2-sentence rundown on every hangar tab.
- Grey out fuels the engine can't burn, each with a one-line reason.
- Show risky material + fuel warnings with the fix and its cost.
- Display thrust in N and exhaust speed in m/s (Isp stays in the science library only).
- Add the budget meter, with launch locked at $0 or below.
- Add the role pick at the start (tab 5).
- Commit.

**Phase 3: the Calculation Desk (Priority 1)**

- Build the desk scene with all 15 sheets and the Final Results board, exactly as in tab 6.
- Easy and Hard differ as specified.
- Commit.

**Phase 4: difficulty and emergencies (Priority 1)**

- Easy gets 3 softer emergencies; Hard gets 5 full-strength ones aimed at weak spots.
- Add the full 16-card A/B/C deck, every option with its Good and Bad effect.
- Seed it so the same design and seed always give the same emergencies.
- Add the Flight Director bonus and the decision log in the final report.
- Turn reliability rolls off.
- Plug all of this into the **existing** emergency system.
- Commit.

**Phase 5: polish and win (Priority 1–2)**

- Add the guided first build.
- Add the science library (every formula with its source), the end screen ("most like Apollo / Artemis" plus why it succeeded or failed), and source links for R values in `SOURCES.md`.
- Finish keyboard navigation and whole-number pixel scaling.
- Improve the art for the lander, landing, re-entry and splashdown.
- Commit.

**After each phase:**

- Run all three test commands.
- Commit.
- Tell me what changed, which files you touched, and how to see it in the game (`npm run dev`, then where to click).
- Wait for my OK before starting the next phase.

### A3. Units and number rules

- **What the player sees:** weight in **lb**, thrust in **N**, speed in **m/s**, money in **USD**, distance for signal delay in **miles**, heat shield rating in **mph**.
- Keep the internal math consistent in one unit system and convert only for display. Don't mix units inside formulas. Where the spec divides newtons by pounds, it first converts: weight in N = lb × 4.448.
- Every number in data files keeps its tag: **R** = real/published, **G** = game value (tunable). Put R/G next to values in the science library.
- Show numbers with thousands separators (12,600 m/s, not 12600).
- Tolerances in tests: the spec's worked examples are rounded, so allow ±0.5% (or ±5 units for small values).

---

## PART B — THE SPEC (Joseph's Build Notes, all 8 tabs, complete)

### TAB 1 — Overview

**Oakland to the Moon — Joseph's Build Notes**

This is my personal reference for finishing *Oakland to the Moon*: what the game should contain and the real numbers behind it. The team handoff doc stays the team's; this one is mine.

It pulls together the parts research, the formulas, the prototype game (Station Rescue) and the NASA research. All of it is aimed at the team's game: Commander Kai, a single-player crewed Moon mission.

Every number is tagged **R** (real: NASA, the maker, or a published source) or **G** (game value; adjust freely).

**Rules from the handoff that shape everything:**

- **Single player only.** The challenge suggests team play for up to 4, but the handoff says no multiplayer. So "roles" become a specialty Kai picks before the mission (see the Roles tab).
- **Finish, don't rebuild.** Everything is meant to be dropped into systems the first developer already built: the hangar, the simulation, the emergencies and the scoring.
- **The player picks a role; the game is still single player.** The player chooses a specialty at the start, and it changes their discounts and perks.

**What this prompt covers, in priority order:**

*Priority 0: make it correct*
- Play the full mission start to finish (`npm run dev`) and note anything broken.
- Run `npm run build`, `npm run test`, `npm run test:e2e`. Confirm the reported 52/52 and 3/3 actually pass.
- Read `docs/SCIENTIFIC_ASSUMPTIONS.md` and `SOURCES.md`. Compare every number against the R values in this spec (the handoff says the original values are Apollo-era figures from memory).
- Replace the rocket and spacecraft numbers with the real ones in the Spacecraft design tab.
- Check the simulation uses the Formulas tab correctly: rocket equation, Moon Δv budget, supplies per crew-day, power, data, re-entry speed.
- Make sure Orion cannot do a low-lunar-orbit round trip, and an Apollo lander cannot land from the halo orbit. If the game allows either, the physics is wrong.

*Priority 1: make it clear and good-looking*
- Add the **Difficulty modes**: Easy = sandbox with 3 softer emergencies, Hard = realistic with 5 full-strength emergencies from the 16-card A/B/C deck. No reliability rolls. Every choice has a good and a bad effect on the mission. Plug these into the existing emergency system; don't build a new one.
- Build the **Calculation Desk** (Formulas tab): formulas on paper with the player's numbers filled in, tips, a target to hit, a choice to move on or go back, and a Final Results board at the end.
- Hangar fixes (Spacecraft design tab): lock the fuel to the engine, show thrust in N and exhaust speed in m/s, show a 2-sentence rundown on each tab, and warn about risky material + fuel combos with the fix.
- Add a role pick at the start so the player chooses their specialty, single player (Roles tab).
- Add a guided first build in the hangar: each step explains one formula in plain words (use the Formulas tab's wording).
- Improve the lander, landing, re-entry and splashdown art (handoff limitation list).
- Finish keyboard navigation and whole-number pixel scaling.

*Priority 2: make it win*
- Add an in-game science library: every formula with its source, plus the R/G tag on every value.
- End screen: "Your mission is most like Apollo / Artemis" plus why it succeeded or failed.
- Every R value in the game links to a source in `SOURCES.md` (use the Sources tab).
- Full playthrough on Easy and Hard. (I'll deploy and record the 3-minute demo myself.)

---

### TAB 2 — Mission

**Objective: Commander Kai must design a spacecraft, fly a crew from Earth to the Moon, land, do science, and bring everyone home safely, without running out of money, propellant, power, air or time.** That matches the challenge: "design, manage, and simulate a complete space mission while making engineering decisions, managing limited resources, and evaluating how each choice shapes the success of their mission."

**How the mission wins**

| Goal | How the game checks it |
|---|---|
| Reach the Moon | Rocket's total speed ≥ 12,600 m/s (Earth orbit 9,400 + push to the Moon 3,200) |
| Land and lift off | Lander has enough speed for the chosen lunar orbit, both down and up |
| Do science | At least 50 science points (G) from instruments |
| Come home | Capsule has propellant to leave lunar orbit, and a heat shield rated for 24,400 mph (R) |
| Stay within limits | Money, mass, power, air/water/food, data and mission days all stay in range |

**Mission phases.** Each phase is a scene in the game. The speed numbers are the "price" of each phase in propellant.

| # | Phase | What happens | Speed needed | Who pays it |
|---|---|---|---|---|
| 1 | Oakland | Kai's story, mission briefing, pick difficulty and specialty | — | — |
| 2 | Hangar | Build the rocket, capsule and lander; pick instruments | — | — |
| 3 | Launch to Earth orbit | Rocket climbs out of the atmosphere | 9,400 m/s (R: 9,300–10,000 m/s) | Rocket stages + boosters |
| 4 | Trans-lunar injection (TLI) | One big burn aims the ship at the Moon | 3,200 m/s (R) | Rocket upper stage |
| 5 | Coast to the Moon | About 3 days (G) | — | Life support |
| 6 | Lunar orbit insertion | Brake into orbit around the Moon | LLO 900 m/s (R) · NRHO 430 m/s (R) | Capsule service module |
| 7 | Landing | Lander descends to the surface | LLO 1,870 m/s (R) · NRHO 2,600 m/s (R) | Lander descent stage |
| 8 | Surface | Science, rover, samples | — | Lander batteries or solar |
| 9 | Liftoff from the Moon | Ascent stage returns crew and samples to orbit | same as landing | Lander ascent stage |
| 10 | Trans-Earth injection | Burn to leave the Moon for home | LLO 900 m/s (G) · NRHO 410 m/s (R) | Capsule service module |
| 11 | Re-entry and splashdown | Heat shield takes 24,400+ mph, up to 5,000°F (R) | — | Heat shield |
| 12 | Oakland homecoming | Score and mission report | — | — |

LLO = low lunar orbit, about 60 miles up (Apollo). NRHO = near-rectilinear halo orbit (Artemis).

**The big choice: Apollo-style or Artemis-style**

| | Apollo-style | Artemis-style |
|---|---|---|
| Lunar orbit | Low (LLO) | Halo (NRHO) |
| Launches | 1: capsule + lander together | 2: lander flies separately |
| Capsule job | Hard: big burns into and out of orbit | Easy: small burns |
| Lander job | Easy: short trip down and up | Hard: long trip down and up |
| Contact with Earth | Lost behind the Moon each orbit | Constant (R, NASA) |
| Rough cost in the prototype | ~$1.9B (G) | ~$4.3B (G) |

There is no single right answer. That's the point the challenge asks the game to teach.

---

### TAB 3 — Spacecraft design

**Kai builds the mission from four big pieces: a rocket, a crew capsule, a lander, and the small systems that keep them alive and talking.** Weights in lb, push (thrust) in newtons (N), fuel efficiency as exhaust speed in m/s, prices in USD. Each section starts with a 2-sentence rundown the game shows on that hangar tab (show it in italics or a small card at the top of the tab). **R** = published by NASA, the maker or a seller listing. **G** = game value, adjust in game.

#### 1. Rocket engines

*Rundown: "Engines make the push that lifts the rocket off the pad and speeds it up to orbit. More push lifts more weight, and a faster exhaust speed gets more speed out of every pound of fuel."*

| Engine | Stage | Weight | Thrust | Exhaust speed | Burns (locked) | Price |
|---|---|---|---|---|---|---|
| Merlin 1D (SpaceX) | 1 | 1,036 lb (R) | 845,000 N at sea level (R) | 2,770 sea level / 3,050 vacuum m/s (R) | Kerosene + LOX | $1M (G) |
| BE-4 (Blue Origin) | 1 | not published (game uses 4,630 lb, G) | 2,846,000 N (R) | 3,190 m/s (G) | Methane + LOX | $8M (G) |
| RS-25 (SLS core) | 1 | 7,775 lb (R) | 2,277,000 N max in vacuum (R); 1,860,000 N at liftoff in game (G) | about 3,590 / 4,430 m/s (approx.); 4,010 average in game (G) | Hydrogen + LOX | $100M (G) |
| Rutherford (Rocket Lab) | 1 | 77 lb (G) | 21,000 N (R) | 3,050 m/s (R) | Kerosene + LOX | $0.5M (G) |
| Merlin Vacuum | 2 | not published (game uses 1,000 lb, G) | 981,000 N (R) | 3,410 m/s (R) | Kerosene + LOX | $1.5M (G) |
| RL10 | 2 | 370–664 lb (R; game uses 664) | 110,100 N on SLS (R) | 4,410–4,560 m/s (R; game uses 4,530) | Hydrogen + LOX | $15M (G) |
| Rutherford Vacuum | 2 | 77 lb (G) | 26,000 N (G) | 3,360 m/s (R) | Kerosene + LOX | $0.6M (G) |

(Also allowed as a "trap" choice for stage 2: Merlin 1D with a sea-level nozzle, 1,036 lb, 981,000 N (game value), 3,050 m/s, kerosene + LOX, $1M. It's cheaper, but its short nozzle wastes energy in space, so the player sees how much speed they lose.)

**Fuel locks to the engine.** Every engine is built for one fuel. Once the player picks an engine, the propellant menu shows only that engine's fuel. The others are greyed out with a one-line reason ("RS-25 only burns hydrogen + LOX"). The two stages can use different fuels: Saturn V burned kerosene in stage 1 and hydrogen above it, and SLS pairs a hydrogen core with solid boosters (R).

**Merlin 1D in the game uses 2,910 m/s**, the average of sea level and vacuum, because stage 1 flies through both.

#### 2. Solid boosters (strap-on)

*Rundown: "Boosters are strap-on rockets that add a huge push for the first two minutes, when the rocket is heaviest. They burn out and fall away, so their empty casings don't ride to orbit."*

| Booster | Weight | Fuel inside | Thrust | Exhaust speed | Burns | Price | Max |
|---|---|---|---|---|---|---|---|
| SLS 5-segment booster | 1.6 million lb each (R) | 1,390,000 lb (G) | up to 16,000,000 N (R: 3.6 million lbf) | 2,500 m/s (G) | Solid (built in) | $120M each (G) | 4 |
| GEM 63XL (Vulcan) | about 108,000 lb (G) | 97,000 lb (G) | about 2,000,000 N (G) | 2,650 m/s (G) | Solid (built in) | $15M each (G) | 6 |

SLS uses 2 boosters, which give over 75% of its thrust for the first 2 minutes (R). Empty casing per SLS booster = 1,600,000 − 1,390,000 = 210,000 lb.

#### 3. Tank materials

*Rundown: "The tank material decides how heavy the empty rocket is, and every pound of empty tank is a pound you can't spend on fuel or crew. Lighter materials cost more, and some don't get along with certain fuels (see the risk table below)."*

| Material | k (empty weight ÷ fuel) | Build cost | Reliability | Used on |
|---|---|---|---|---|
| Aluminum-lithium 2195 | 0.054 (matches Falcon 9) | $907/lb (G) | 99.5% (G) | Falcon 9 (R) |
| Aluminum 2219 | 0.071 (G) | $680/lb (G) | 99.5% (G) | Saturn V |
| Stainless steel | 0.083 (G) | $227/lb (G) | 99.8% (G) | Centaur V (R), Starship |
| Carbon fiber | 0.042 (G) | $1,361/lb (G) | 98.5% (G) | Electron (R) |

Hydrogen tanks are bulky: multiply k by 1.5 (G). (Methane: × 1.1, G. Kerosene: × 1.) Note: the reliability column is kept only as data for the library. Reliability **rolls** are OFF (see Difficulty).

##### Material + fuel risks, and how to lower them

Some materials and fuels don't mix well. A risky combo doesn't block the launch, but it makes a tank or leak emergency more likely. Hard adds it to the emergency picker; Easy shows a yellow warning with the fix. Risk levels are game values (G); the reasons are real.

| Combo | Risk | Why | How to lower it |
|---|---|---|---|
| Carbon fiber + hydrogen | **High** | Super-cold hydrogen made a composite tank crack and peel apart during testing for NASA's X-33 in 1999 (R). | Use aluminum-lithium for the hydrogen tank. Or keep carbon fiber and add a metal liner (+10% tank weight, +$5M, G), which drops the risk to Medium. |
| Carbon fiber + liquid oxygen (any kerosene or methane rocket) | **Medium** | Liquid oxygen can crack some composites and even make them ignite on impact. A carbon-wrapped bottle inside a liquid-oxygen tank caused the 2016 Falcon 9 pad explosion (R). | Make the oxygen tank metal and use carbon fiber elsewhere, or add a metal liner (+10% tank weight, +$5M, G). |
| Any material + hydrogen | **Medium** | Hydrogen is the smallest molecule, so it slips through tiny gaps in seals. Leaks scrubbed Artemis I twice in 2022 (R). | Buy a pad leak check (+$2M, +3 days, G). It drops the risk to Low. |
| Aluminum-lithium + hydrogen | **Low** | Flown on the Space Shuttle tank and SLS (R). The main risk is insulating foam breaking off. | Pay for a foam inspection (+$1M, G). |
| Stainless steel + methane | **Low** | Steel gets stronger when super-cold and handles heat well (Starship). | Nothing needed. The cost is weight: you'll need more fuel. |
| Aluminum 2219 + kerosene | **Low** | The Saturn V first-stage combo (R). | Nothing needed. |
| Hydrazine/MMH thrusters | **Medium** | Toxic, and thrusters can overheat when fired a lot in a row, like Starliner's in 2024 (R). | Use titanium thruster tanks and space out firings (docking takes +1 hour, G). |

The risk shows on the material card the moment a risky combo is picked, with the fix right under it. Fixes are buyable options (checkboxes) that change weight, cost, days and risk exactly as listed. When "Any material + hydrogen" and "Aluminum-lithium + hydrogen" both apply, the higher risk wins (Medium) until the leak check is bought.

#### 4. Rocket propellant

*Rundown: "The propellant is what the engines burn, and it's locked to the engine you picked. Each one trades off exhaust speed, tank size and price."*

| Propellant | Exhaust speed | Density | Price | Engines that burn it |
|---|---|---|---|---|
| Kerosene + liquid oxygen | 2,770–3,410 m/s (R) | 64.3 lb/ft³ | $0.27/lb (G) | Merlin 1D, Merlin Vacuum, Rutherford, Rutherford Vacuum |
| Methane + liquid oxygen | about 3,240–3,530 m/s (approx.) | 51.8 lb/ft³ | $0.18/lb (G) | BE-4 |
| Hydrogen + liquid oxygen | 4,410–4,560 m/s (R) | about 22 lb/ft³ | $1.36/lb (G) | RS-25, RL10 |
| Solid | about 2,450–2,650 m/s (approx.) | about 112 lb/ft³ | in booster price | Boosters only (comes with them) |

#### 5. Crew capsules

*Rundown: "The capsule is where the crew lives on the way there and back, and its heat shield is the only thing between them and 5,000°F on re-entry. Its service module carries the fuel for getting into and out of lunar orbit."*

| Capsule | Crew | Weight | Service module fuel | Max mission | Heat shield | Solar | Price |
|---|---|---|---|---|---|---|---|
| Orion (NASA) | 4 (R) | 22,900 lb crew module + 34,300 lb service module (R) | ~19,000 lb (G, approx.) | 21 days (R) | 24,400+ mph (R; game rating 25,000) | 11 kW (R) | $900M (G) |
| Apollo-class CSM | 3 (G) | 12,800 + 53,600 lb (G) | 40,600 lb (G) | 14 days (G) | lunar (G; game rating 25,000) | none | $600M (G) |
| Budget LEO capsule (trap) | 4 (G) | 9,000 + 10,000 lb (G) | 6,000 lb (G) | 7 days (G) | 17,500 mph only (G) | none | $250M (G) |

Orion's main engine: 26,700 N (R: 6,000 lbf), exhaust speed about 3,100 m/s (G). Apollo-class CSM engine: 91,200 N (G: 20,500 lbf), exhaust speed 3,080 m/s (G). Budget capsule engine: 17,800 N (G: 4,000 lbf), exhaust speed 2,940 m/s (G). The Budget capsule fails re-entry from the Moon on purpose: it teaches why heat shields are rated.

#### 6. Landers

*Rundown: "The lander carries astronauts from lunar orbit down to the surface and back up again. It needs enough fuel for both trips and engines strong enough to beat Moon gravity."*

| Lander | Crew | Total weight | Descent / ascent fuel | Engines (descent / ascent) | Exhaust speed | Max stay | Price |
|---|---|---|---|---|---|---|---|
| Apollo LM | 2 (R) | 33,500 lb (R) | 18,000 / 5,187 lb (R) | 45,040 / 15,570 N (R) | 3,050 m/s (R) | 48 h (R) | $400M (G) |
| Extended LM (Apollo 15–17) | 2 (R) | 36,200 lb (R) | 20,500 / 5,187 lb (G split) | same (R) | 3,050 m/s (R) | 75 h (R) | $480M (G) |
| Large lander (HLS-class) | 4 (G) | 144,000 lb (G) | 90,000 / 24,000 lb (G) | 266,900 / 111,200 N (G) | 3,240 m/s (G) | 7 days (G) | $1.2B (G) |

Dry weights used by the prototype: Apollo LM descent stage dry 4,783 lb, ascent stage dry 5,113 lb (R). Extended LM descent dry 5,200, ascent dry 5,313 (G). Large lander descent dry 18,000, ascent dry 12,000 (G).

#### 7. Docking

*Rundown: "Docking hardware lets the capsule and lander lock together so the crew can move between them. Without it, there's no way to get from the capsule to the lander and back."*

| Part | Weight | Power | Price | Notes |
|---|---|---|---|---|
| NASA Docking System | ~661 lb (G) | 200 W (G) | $20M (G) | 31.5 in hatch (R); used by Orion, Dragon, Starliner (R). Needed for crew to move between capsule and lander |
| Docking lidar | ~22 lb (G) | 50 W (G) | $3M (G) | Measures distance to the target. Required for docking |

#### 8. Maneuvering thrusters and tanks

*Rundown: "Small thrusters turn and nudge the spacecraft for steering and docking, where the main engine is far too strong. The tanks hold their fuel, and running out means you can't steer."*

| Part | Weight | Thrust | Exhaust speed | Price |
|---|---|---|---|---|
| Draco thruster (SpaceX) | not published | 400 N (R) | 2,940 m/s (R) | $1M each (G) |
| MR-107S hydrazine (L3Harris) | 2.23 lb (R) | 100–360 N (R) | 2,280–2,320 m/s (R) | $400k (G) |
| MR-104G hydrazine (L3Harris) | 12 lb (R) | 470–780 N (R) | 2,180–2,240 m/s (R) | $800k (G) |
| Antrix 516 L tank | 57 lb (R) | holds 136 gal (R) | — | $500k (G) |
| OST 24/0 titanium tank | 116 lb (R) | holds 319 gal (R) | — | $900k (G) |

You need at least 8 thrusters to turn and move in every direction (G rule).

#### 9. Power

*Rundown: "Solar panels and batteries run everything electric: computers, radios, life support and instruments. If the power runs out, the spacecraft goes dark."*

| Part | Weight | Power | Price |
|---|---|---|---|
| Orion solar arrays (built in) | — | 11,000 W (R) | included |
| UltraFlex arrays, pair (Cygnus) | ~400 lb (G) | 3,500 W (R) | $10M (G) |
| 5 kWh Li-ion pack | 110 lb (G) | stores 5,000 Wh (G) | $1.5M (G) |
| Lander surface solar array | 400 lb (G) | 4,000 W (G), lunar daylight only | $15M (G) |

#### 10. Communications

*Rundown: "The radio sends science data home and lets mission control talk to the crew across 238,855 miles. A faster radio sends more data each day, but it uses more power and costs more."*

| Radio | Weight | Power | Speed | Price |
|---|---|---|---|---|
| Deep-space S-band (NASA Deep Space Network) | 40 lb (G) | 60 W (G) | 256 kbps (G) | $10M (G) |
| Deep-space Ka-band | 80 lb (G) | 150 W (G) | 6,000 kbps (G) | $25M (G) |
| Laser comms terminal | 60 lb (G) | 100 W (G) | 100,000 kbps (G) | $40M (G) |

Earth-orbit radios (UHF, small S-band) can't reach the Moon, 238,855 miles away (R).

#### 11. Navigation and guidance

*Rundown: "Star trackers, motion sensors and the onboard computer tell the spacecraft where it is and which way it's pointing. Without them, every burn is a guess."*

| Part | Weight | Power | Price |
|---|---|---|---|
| ST-16RT2 star tracker | 0.35–0.52 lb (R) | under 0.5 W avg (R) | $100k (G) |
| ST200 star tracker | 0.09–0.23 lb (R) | 0.55–0.67 W (R) | $60k (G) |
| IMU-P4 motion sensor | 0.33 lb (R) | 0.2 W (R) | $6,600 (R) |
| Onboard computer (EnduroSat) | 0.27 lb (R) | ~1 W (G) | $12,400 (R) |

#### 12. Life support (per astronaut, per day)

*Rundown: "Oxygen, water and food keep the crew alive, at about 15 lb per astronaut per day. Bring too little and the mission ends early; bring too much and it eats into your weight budget."*

| Supply | Amount | Source |
|---|---|---|
| Oxygen | 2.0 lb (G, inside NASA's 1.70–2.39 lb range) | NASA ECLSS brief (R range) |
| Drinking water | 5.5 lb (R: at least 2.5 L) | NASA ECLSS brief |
| Hygiene water | 2.2 lb (G) | game value |
| Food | 5.27 lb (R: 2.39 kg packaged) | NASA BVAD |
| **Total** | **~15 lb per astronaut per day** (exactly 14.97) | |

Astronaut + suit = 400 lb each (G).

The parts list in the team repo has 33 components in 13 categories. Compare it against this tab and swap in the R values. Keep any existing parts that aren't listed here, but update their units and display to match.

---

### TAB 4 — Science instruments

**Instruments are why the crew goes. Each one adds science points, but also weight on the lander, watts on the surface, data to send home, and cost.** That's exactly the trade-off the challenge describes. The mission needs 50 points (G).

The instrument types follow real Apollo surface science. All weights, watts, data and points are game values (G).

| Instrument | What it does (simple) | Weight | Power | Data per day | Points | Price |
|---|---|---|---|---|---|---|
| Passive seismometer | Listens for moonquakes and meteor hits, like a microphone in the ground | 25 lb | 10 W | 50 MB | 20 | $20M |
| Laser retroreflector | A mirror that bounces lasers from Earth to measure the Moon's distance. Apollo 11's is still used | 50 lb | 0 W | 0 MB | 15 | $10M |
| Sample return kit | Tools and boxes to bring home 100 lb of Moon rock | 30 lb (+100 lb of rock on the way home) | 0 W | 0 MB | 30 | $15M |
| Core drill | Drills a few feet down to sample buried layers | 60 lb | 300 W | 20 MB | 20 | $25M |
| Ground-penetrating radar | Maps what's under the surface | 40 lb | 80 W | 2,000 MB | 15 | $30M |
| HD science cameras | Video and photos of the site | 15 lb | 30 W | 5,000 MB | 10 | $5M |
| Lunar rover | Lets the crew drive miles from the lander, like Apollo 15–17 | ~460 lb (approx.) | 500 W | 100 MB | 25 | $60M |

**Consequences to build into the game**

- **Rock samples are the sneaky one.** They ride the ascent stage up from the Moon and the capsule home, so they eat propellant twice. Too many and the ascent stage can't reach orbit.
- **Cameras and radar make huge amounts of data.** A slow deep-space S-band radio (256 kbps, G) sends about 2,765 MB per day with constant contact, and only ~1,742 MB in low lunar orbit because of far-side blackouts. Five thousand MB of camera footage won't fit: the player needs Ka-band or laser comms.
- **Drills and rovers drain batteries.** Every surface watt has to be covered by batteries or a solar array for every hour on the surface. (Lander surface base load: 1,200 W (G) + instrument watts.)
- **More than one path to 50 points:** seismometer + retroreflector + samples (65 points, light), or rover + drill + radar (60 points, heavy and power-hungry).

**Also add to the game**

- A science meter that fills as instruments are added.
- At the end, a list of what each instrument discovered (flavor text) and how much data made it home.
- An instrument can fail on the surface (emergency 10 in the deck).

---

### TAB 5 — Roles

**The game is single-player (handoff rule), so a "role" is Kai's specialty, picked in Oakland before the mission.** Each specialty gives a perk, a weakness, and extra explanations in its area. This keeps the challenge's idea of team roles (mission planning, spacecraft design, science, communications) without adding multiplayer.

The four roles follow NASA's four mission segments from the official challenge resource *Design and Develop Science Missions*: launch, space, ground and user. Good line for the pitch.

| Role | NASA segment | Owns these hangar areas | Perk (G) | Weakness (G) | Extra tips shown |
|---|---|---|---|---|---|
| Mission Commander | Launch segment | Budget, launch architecture, lunar orbit | +5% budget; sees all warnings early | No discounts on parts | Budget and schedule advice |
| Propulsion Engineer | Launch segment | Engines, boosters, stages, tank material, propellant | 10% off rocket parts; sees exact Δv margins | Science instruments cost 10% more | Rocket equation walkthrough |
| Spacecraft Engineer | Space segment | Capsule, lander, docking, thrusters, tanks, power, life support | 10% off spacecraft parts; one free emergency "fix" on Hard | Rocket parts cost 10% more | Lander and power walkthroughs |
| Science & Comms Lead | User + ground segments | Instruments, radios, navigation | 10% off instruments and radios; +20% science points | Spacecraft parts cost 10% more | Data budget walkthrough |

**How roles show up in the game**

- A star icon on the hangar tabs that belong to Kai's role.
- Role-specific dialogue from mission control during emergencies. Example: a Propulsion Engineer gets the technical explanation of an engine-out; a Science Lead is told what science is at risk.
- The final report grades the role's own area first: "As Propulsion Engineer, your rocket had 140 m/s of margin."
- The "one free emergency fix" (Spacecraft Engineer, Hard): once per mission, the player may cancel the Bad effect of one chosen option. Show it as a button on the emergency screen.

**Optional if there's time:** let the player swap roles between missions and compare scores, so they see the same mission from four angles.

---

### TAB 6 — Formulas and the Calculation Desk

**Every formula the game uses, laid out the way it appears on the Calculation Desk.** Some the player works out on paper, and the game hands them every number they need. The rest the game works out and shows its work so the player can follow along.

Units: weight in **pounds (lb)**, push (thrust) in **newtons (N)**, speed in **meters per second (m/s)**, money in **dollars**.

#### The Calculation Desk (new scene, after the hangar, before launch)

After the player builds the rocket, the game switches to a desk with a sheet of paper on it (pixel-art desk, paper texture). Each formula gets its own sheet:

1. **The formula at the top**, explained in plain words (use the wording in this tab).
2. **The player's numbers, already pulled from what they picked:** weights, push, exhaust speeds, crew, days. The player never has to dig for a number.
3. **Tips** on how to plug the numbers in and what each step means.
4. **Blanks to fill in**, step by step, with a calculator on the side that has ln and eˣ buttons.
5. **The target**, for example "to reach the Moon you need about 12,600 m/s."
6. **The player's call:** if the answer looks good, move on. If not, go back to the hangar, change parts and try again for a better result. (Returning to the hangar keeps the current build and the desk progress for sheets that are still valid.)

At the end, a **Final Results board** shows every answer in one place.

**Checking the player's blanks:** accept an answer within ±1% of the game's own number (±0.01 for TWR and ln values). If it's wrong, Easy shows the correct step and why. Hard just marks it wrong and lets the player retry, or reveals the answer at the cost of the desk bonus (G: −10 points per reveal).

**Easy vs Hard on the desk:** both show the formula and all the player's numbers. Easy adds a worked example, "warmer/colder" hints, and a pointer to which part to change. Hard shows the formula, the player's numbers and the target, and nothing else. **Hard must show the formulas on the desk too, not only in the library.**

##### Who does the math

| # | Formula | Who solves it |
|---|---|---|
| 1 | Weight at liftoff | Player |
| 2 | Can it lift off? (thrust-to-weight) | Player |
| 3 | Empty stage, and when it becomes dead weight | Player |
| 4 | Exhaust speed (the easy version of Isp) | Player |
| 5 | Speed from each piece (rocket equation) | Player |
| 6 | Is it enough to reach the Moon? | Player |
| 7 | How much fuel you need | Game (shows its work) |
| 8 | Capsule burns at the Moon | Game |
| 9 | Landing and lifting off from the Moon | Game |
| 10 | Oxygen, water and food | Player, with the game guiding |
| 11 | Power and batteries | Game |
| 12 | Data sent home | Game |
| 13 | Signal delay | Player, with the game guiding |
| 14 | Heat shield: coming home safely | Game |
| 15 | Money | Game (budget meter) |

**Conversions shown on the desk:** 1 kN = 1,000 N · 1 lb of weight = 4.448 N · speed in ft/s ÷ 3.281 = m/s.

---

##### 1. Weight at liftoff (player)

**Question:** How heavy is the whole rocket on the pad?
**Think of it like:** stepping on a scale with a full backpack. Everything counts: the rocket, every drop of fuel, and the spacecraft on top.

`W = payload + stage 2 (full) + stage 1 (full) + boosters`

**The desk gives:** the payload weight, each stage's fuel and empty weight, and each booster's weight.

**Example (SLS-like rocket with Orion):**
- Payload: Orion and its adapter = 63,400 lb
- Stage 2 full: 65,000 lb fuel + 5,929 lb empty = 70,929 lb
- Stage 1 full: 2,150,000 lb fuel + 205,250 lb empty = 2,355,250 lb
- Boosters: 2 × 1,600,000 lb = 3,200,000 lb
- **Total: 5,689,579 lb.** NASA says the real SLS weighs 5.75 million lb (R). Close.

**Tip:** keep this number. It's the bottom of the thrust-to-weight formula (#2), and the "full weight" for the first rocket-equation step (#5).

##### 2. Can it lift off? Thrust-to-weight ratio, TWR (player)

**Question:** Do the engines push harder than gravity pulls?
**Think of it like:** lifting a box. Push up with less force than the box weighs, and it doesn't move.

`TWR = total push of all engines and boosters (N) ÷ weight at liftoff (N) ≥ 1.2`

**Step 1: total push.** The desk lists every engine and booster with its push in newtons. Multiply each by how many you have, then add:
`total push = (engines × N each) + (boosters × N each)`

**Step 2: weight in newtons.** Weight in pounds is also a force, so turn it into newtons: multiply by 4.448.

**Step 3: divide** push by weight.

**Example:**
1. Push: 4 RS-25 × 1,860,000 N + 2 boosters × 16,000,000 N = **39,440,000 N**
2. Weight: 5,689,579 lb × 4.448 = **25,307,000 N**
3. TWR = 39,440,000 ÷ 25,307,000 = **1.56**. It lifts off. (Real SLS: 1.53.)

**Rule:** TWR must be 1.2 or more. Below 1.0 the rocket sits on the pad.
**Easy tip on the desk:** "Your push has to beat 1.2 × your weight in N = 30,368,000 N." (Computed from the player's own weight.)

##### 3. Empty stage, and when it becomes dead weight (player)

**Question A:** When the fuel is gone, what's left over?
**Think of it like:** an empty water bottle. A bigger bottle weighs more even when it's empty.

`Empty stage = k × fuel + engines`

- **k** is the tank-material number from the Spacecraft tab (aluminum-lithium = 0.054). Smaller k = lighter tanks.
- Hydrogen tanks are bulky: multiply k by 1.5.

**Example (SLS-like stage 1):** 0.054 × 1.5 × 2,150,000 = 174,150 lb of tank + 4 engines × 7,775 lb = 31,100 lb. **Empty stage = 205,250 lb.**

**Question B:** At what point does that stage become dead weight that has to go?

**Answer:** the moment its fuel hits zero. From then on it's 205,250 lb that pushes nothing, and every pound of it slows the stages above. It goes from small to huge fast:

`dead-weight share = empty stage ÷ weight still flying`

- At ignition: 205,250 ÷ 2,489,579 = **8%** of what's flying.
- At burnout: 205,250 ÷ 339,579 = **60%** of what's flying. Time to let it go.

**What if you kept it?** Stage 2 with stage 1's empty shell still attached gives only **960 m/s** instead of 2,995 m/s. Keeping it would cost about 2,035 m/s and the whole mission. That's why rockets drop stages.

**In the game:** during the launch scene, each stage has a fuel gauge and a dead-weight bar (dead-weight share rising as fuel burns). When the gauge hits empty, the game calls "STAGE SEP" and drops it. Boosters work the same way: their 420,000 lb of empty casings drop at burnout.

##### 4. Exhaust speed: the easy version of Isp (player)

**Question:** How good is this engine at turning fuel into speed?
**Think of it like:** throwing balls off a skateboard. The faster you throw them, the faster you roll. Exhaust speed is how fast the gas shoots out of the nozzle.

`exhaust speed (m/s) = Isp × 9.81`

Maker sheets list "Isp" in seconds, which is confusing. The game shows exhaust speed in m/s instead. Isp stays in the science library for anyone who wants it. Higher is better.

| Engine | Exhaust speed |
|---|---|
| RL10 (hydrogen, upper stage) | 4,530 m/s (R) |
| RS-25 (hydrogen, core stage) | 4,010 m/s average (G); 3,590 at sea level to 4,430 in vacuum (approx.) |
| Merlin Vacuum (kerosene) | 3,410 m/s (R) |
| Rutherford Vacuum (kerosene) | 3,360 m/s (R) |
| Large lander engine | 3,240 m/s (G) |
| BE-4 (methane) | 3,190 m/s (G) |
| Orion main engine | 3,100 m/s (G) |
| Apollo lander engines | 3,050 m/s (R) |
| Rutherford (kerosene) | 3,050 m/s (R) |
| Merlin 1D (kerosene) | 2,910 m/s average (G); 2,770 at sea level to 3,050 in vacuum (R) |
| GEM 63XL booster (solid) | 2,650 m/s (G) |
| SLS booster (solid) | 2,500 m/s (G) |

##### 5. Speed from each piece: the rocket equation (player)

**Question:** If I burn all the fuel in this piece, how much faster do I go?
**Think of it like:** the same skateboard. More balls to throw (fuel) and a faster throw (exhaust speed) mean more speed. But a heavy skateboard (empty stage + everything above) is harder to speed up.

`Δv = exhaust speed × ln(full weight ÷ empty weight)`

**What "full" and "empty" mean for each piece.** For the boosters, "full" is just the weight at liftoff. After that, each piece's "full" is whatever's left once the piece below has been dropped.

| Piece | Full weight | Empty weight | Exhaust speed |
|---|---|---|---|
| Boosters (burn first) | Weight at liftoff (#1) | Liftoff weight − booster fuel | Booster's |
| Stage 1 | Liftoff weight − the full boosters | That − stage 1 fuel | Stage 1 engine's |
| Stage 2 | Payload + stage 2 full | Payload + stage 2 empty | Stage 2 engine's |

The desk fills in every full and empty weight. The player divides, presses ln, and multiplies.

Simplification (G): during the booster phase the game counts only the boosters' exhaust speed. Real rockets blend boosters and core engines. (If there are no boosters, skip that row.)

**Example: the three speeds for the SLS-like rocket.**

V boosters:
1. Divide: 5,689,579 ÷ 2,909,579 = **1.955**
2. ln(1.955) = **0.671**
3. 2,500 × 0.671 = **1,680 m/s**

V stage 1:
1. Divide: 2,489,579 ÷ 339,579 = **7.33**
2. ln(7.33) = **1.992**
3. 4,010 × 1.992 = **7,990 m/s**

V stage 2:
1. Divide: 134,329 ÷ 69,329 = **1.938**
2. ln(1.938) = **0.661**
3. 4,530 × 0.661 = **2,995 m/s**

##### 6. Is it enough to reach the Moon? (player)

`Δv total = V boosters + V stage 1 + V stage 2 ≥ 12,600 m/s`

**Where 12,600 comes from:** about 9,400 m/s to reach Earth orbit (R: 9,300–10,000 m/s) + 3,200 m/s for the burn toward the Moon (R).

**Example:** 1,680 + 7,990 + 2,995 = **12,665 m/s**. Pass, with only 65 m/s to spare. That's a thin margin: an engine-out emergency would end this mission.

**The desk then asks:** move on, or go back and improve it?
- **Easy:** "You're 900 m/s short. The biggest lever is more stage 2 fuel or an engine with a faster exhaust." (Use the player's real shortfall and the part that would help most.)
- **Hard:** shows the player's number and the target only.

(Two-launch Artemis-style missions: the rocket must reach 12,600 m/s carrying the heavier of the two payloads, capsule stack or lander. Each launch pays for its own rocket.)

##### 7. How much fuel you need (the game does this)

The game works backwards from the speed needed to the fuel that gets there, and shows both steps filled in with the player's numbers. Next to each stage's fuel slider, the desk shows **"Suggested fuel: ___ lb"** with a "Use this" button.

Step 1: how many times heavier the full stage must be than the empty one:
`R = e^(Δv ÷ exhaust speed)`

Step 2: turn that into pounds of fuel:
`fuel = weight pushed × (R − 1) ÷ (1 − k × (R − 1))`

**Example:** need 5,400 m/s, exhaust speed 3,050 m/s, k = 0.065, pushing 26,455 lb. R = e^(5,400 ÷ 3,050) = **5.86**. Fuel = 26,455 × 4.86 ÷ (1 − 0.065 × 4.86) = **187,700 lb**.

**Warning sign:** if the bottom of Step 2 is zero or negative, **no amount of fuel works**. The tanks would weigh more than they can push. The game shows "Add a stage or pick a lighter material."

##### 8. The capsule's burns at the Moon (the game does this)

**Question:** Does the capsule have enough fuel to get into lunar orbit **and** back out to go home?
**Think of it like:** a road trip where the only gas station is at home. Whatever you burn getting there, you can't use coming back.

The game runs both burns and shows the work. The desk explains each line.

`fuel used = weight × (1 − e^(−Δv ÷ exhaust speed))`

Then the rocket equation (#5) with the fuel that's left gives the speed for the trip home.

| Orbit | Burn to get in | Burn to go home |
|---|---|---|
| Low lunar orbit (Apollo) | 900 m/s (R) | 900 m/s (G) |
| Halo orbit, NRHO (Artemis) | 430 m/s (R) | 410 m/s (R) |

(Apollo-style single launch: the capsule pushes the lander too during the burn to get in. Artemis-style: the lander arrives separately and pays for its own trip to NRHO, so the capsule only pushes itself.)

**What the desk shows (Orion in the halo orbit):** getting in uses 7,410 lb → 11,590 lb left → 820 m/s available to go home. Need 410. **Pass.**
**Orion in low lunar orbit:** getting in uses 14,410 lb → 4,590 lb left → 350 m/s available. Need 900. **Fail: the crew is stuck.** This is a real lesson: NASA lists easier Earth-return as a reason Artemis uses the halo orbit (R).

##### 9. Landing and lifting off from the Moon (the game does this)

The game runs the rocket equation (#5) twice for the lander, once for the descent stage and once for the ascent stage, and checks it can beat Moon gravity.

| Orbit | Down to the surface | Back up |
|---|---|---|
| Low lunar orbit | 1,870 m/s (R) | 1,870 m/s (R) |
| Halo orbit | 2,600 m/s (R) | 2,600 m/s (R) |

(Artemis-style: the lander's descent stage also pays the 430 m/s to get into NRHO on its own trip.)

**What the desk shows (Apollo lander lifting off):** 3,050 × ln(11,200 ÷ 6,013) = **1,898 m/s**. Need 1,870. **Pass by just 28 m/s.** Bring 250 lb of rocks instead of 100 and it fails (the cutoff is about 216 lb). (Full = ascent stage 5,113 + fuel 5,187 + 2 astronauts 800 + rocks 100 = 11,200 lb; empty = 6,013 lb.)

**Can the engine beat Moon gravity?** Moon gravity is 0.165 × Earth's (R).

`TWR Moon = thrust (N) ÷ (weight (lb) × 4.448 × 0.165) ≥ 1`

Example: 15,570 N ÷ (11,200 × 4.448 × 0.165) = **1.89**. It can lift off.

##### 10. Oxygen, water and food (player, with help)

**Question:** How many pounds of supplies does the crew need?

`supplies (lb) = crew × days × 15`

**The desk gives:**
- **Crew:** from the capsule.
- **Days, already split out:** 3 days out + waiting in lunar orbit (low orbit: 1 day, halo orbit: 6.5 days) + days on the surface + 3 days back.
- **The 15 lb per astronaut per day, broken down:** oxygen 2.0, drinking water 5.5, hygiene water 2.2, food 5.27.

**Fill in one line per supply**, then add them up:

| Supply | Formula | Example: 4 crew, 17.5 days (Artemis-style) |
|---|---|---|
| Oxygen | crew × days × 2.0 | 4 × 17.5 × 2.0 = 140 lb |
| Drinking water | crew × days × 5.5 | 385 lb |
| Hygiene water | crew × days × 2.2 | 154 lb |
| Food | crew × days × 5.27 | 369 lb |
| **Total** | | **1,048 lb** |

**Check:** days must be at or under the capsule's limit (Orion: 21 days, R). Lander supplies = crew who land × surface days × 15.

##### 11. Power and batteries (the game does this)

The game adds up the watts of every part picked, compares that with what the solar panels make, and sizes the battery. The desk shows the work with a green or red result.

`power made = panel watts × fraction of time in sunlight ≥ power used`
`battery (Wh) = watts used × hours in the dark × 1.2`

- Sunlight fraction: 0.61 near Earth, 0.60 in low lunar orbit, 0.99 in the halo orbit (G).
- "Wh" = watt-hours. A 5,000 Wh battery runs a 1,000 W load for 5 hours. The × 1.2 is a safety margin.

**What the desk shows:** Orion's 11,000 W × 0.99 = 10,890 W made vs 3,482 W used. **Pass.** Lander on the surface for 2 days: 1,200 W × 48 h × 1.2 = 69,120 Wh → 14 battery packs.

##### 12. Data sent home (the game does this)

`MB per day = kbps × 86,400 × contact fraction ÷ 8,000`

- **kbps** = radio speed. **86,400** = seconds in a day. **8,000** turns kilobits into megabytes.
- Contact fraction: 1.0 in the halo orbit (R: uninterrupted), 0.63 in low lunar orbit (G).

**What the desk shows:** 256 kbps × 86,400 × 1.0 ÷ 8,000 = 2,765 MB per day vs what the mission needs (mission base 300 MB/day (G) + instruments' MB/day).

##### 13. Signal delay (player, with help)

**Question:** How long does a radio message take to reach the ship?

`seconds = miles ÷ 186,282` (186,282 miles per second = the speed of light)

**Which number of miles to plug in.** The desk says where the ship is and offers the right distance:

| Where the ship is | Miles to use | One-way delay |
|---|---|---|
| Low Earth orbit / ISS, via relay satellites 22,236 mi up | about 47,000 (up to the relay and back down, G) | 0.25 s |
| At the Moon, average | 238,855 (R) | 1.28 s |
| At the Moon, when it's closest to Earth | about 225,700 (R) | 1.21 s |
| At the Moon, when it's farthest | about 252,000 (R) | 1.35 s |
| Halo orbit, far end | about 282,000 (Moon + about 43,500 mi, approx.) | 1.51 s |

**Example:** 238,855 ÷ 186,282 = **1.28 seconds** one way. A question and its answer take about 2.6 seconds, plus however long mission control spends thinking.

##### 14. Coming home safely: heat shield health (the game does this)

**Rule:** the heat shield must be rated for **24,400 mph or more**. Orion hit the atmosphere at more than 24,400 mph on Artemis I, and its heat shield reached up to 5,000°F (R).

The game gives the shield a **health bar** and decides whether the crew makes it:

`shield health = (shield rating mph ÷ 24,400) × 100% (max 100%) − damage from emergencies`

| Health at re-entry | Result (G) |
|---|---|
| 100% | Safe, smooth landing |
| 90–99% | Rough ride: −10 crew safety score |
| Under 90% | Burn-through: mission fails |

**Examples:** Orion (rated 25,000 mph) = 100%, safe. Budget Earth-orbit capsule (17,500 mph) = 72%, fails. Emergency 14 (heat shield damage) can knock health down (G: −8% if not inspected; option C reveals it first).

##### 15. Money (the game does this)

`money left = budget − (rocket + capsule + lander + parts + supplies + launch ops)`

- A **budget meter** sits at the top of the screen the whole time and drops with every part.
- **At $0 or below, launch is locked.** The game says how far over the player is and lists their three most expensive parts, so they know what to change.
- Two launches = pay for two rockets. Role discounts apply automatically. Launch ops = $5M per launch (G). Crew supplies cost $20,000 per crew-day (G).
- Budgets (G): Easy $5B, Medium $3.5B, Hard $2.5B for the Moon mission (Easy can show a very high cap with spending visible).

##### Final Results board

When the last sheet is done, one board shows everything:

| Section | What it shows |
|---|---|
| Rocket | Weight at liftoff, total push, TWR |
| Speed | V boosters, V stage 1, V stage 2, total vs 12,600 m/s, spare speed |
| Fuel | Fuel per stage (the player's vs suggested) |
| Moon burns | Capsule in and out, lander down and up, pass/fail each |
| Crew supplies | Oxygen, drinking water, hygiene water, food (lb each) and total |
| Power and data | Watts made vs used, battery Wh, MB per day |
| Signal | Miles used and delay in seconds |
| Heat shield | Health % at re-entry |
| Money | Budget, spent, left, plus the receipt by part |

From the board, the player can **launch** or **go back to the hangar** to improve the design.

**Removed:** chance-of-success (reliability) rolls. Risk now comes only from emergencies and risky material + fuel combos (Spacecraft design tab).

---

### TAB 7 — Difficulty modes

**Easy is a sandbox for learning how the pieces fit. Hard is realistic: tight limits, and when something breaks mid-mission the game stops and asks Kai what to do: A, B or C.** The challenge asks for difficulty levels, random events, and feedback that explains why a mission succeeds or fails. These modes cover all three.

**Side by side**

| | Easy: Sandbox | Hard: Realistic |
|---|---|---|
| Budget | Unlimited, or a very high cap with spending shown | Tight (prototype: $2.5B for the Moon, G) |
| Mass, power, data limits | Shown, but going over only warns | Going over scrubs the launch |
| Part data | Formulas on the Calculation Desk with the player's numbers, a worked example, warmer/colder hints, and which part to change | Formulas shown on the Calculation Desk too, with the player's numbers and the target. No worked examples or hints |
| Hints | Every failed check explains the fix | Checks say what failed, not how to fix it |
| Undo | Unlimited; rebuild and relaunch freely | No undo after launch |
| Emergencies | On: 3 per mission, softer versions (see below) | On: 5 per mission, full strength, aimed at the design's weak spots |
| Score | Not scored, or "practice score" | Full score and mission report |
| Goal | Experiment: "what happens if I use steel tanks?" | Bring the crew home with the best score |

A Medium mode can sit between them: real limits, hints on, emergencies off. Optional (keep it if the game already has Medium).

**How an emergency works**

1. The flight scene pauses. Mission control explains what happened in one or two sentences.
2. Kai sees three options. Each shows its cost: propellant, time, power, money, science or risk, as a **Good:** line (green) and a **Bad:** line (red). The Bad line uses the player's real numbers ("you have 58 m/s"), so the player is never surprised.
3. The player picks. The game applies the consequences to the live resource bar.
4. Mission control explains what a real flight director would weigh. If the pick matches the safest sound choice for the player's numbers, the player earns a **Flight Director bonus** (G: +50 points).
5. The final report lists every decision and what it cost.
6. No chance-of-success rolls: risk comes only from these emergencies and from risky material + fuel combos.

Each emergency is either inspired by a real spaceflight event (linked, so the game can say "this really happened") or made up but realistic (the game labels it "scenario"). Consequence numbers are game values (G): tune them in playtesting. The rule: **no free option.** Every A, B and C has a Good effect and a Bad effect, so the player is always trading something.

**Easy vs Hard emergencies**

| | Easy | Hard |
|---|---|---|
| How many | 3 per mission | 5 per mission |
| Which ones | Random, from any phase | Aimed at the weak spots: thin fuel margin, few thrusters, low battery, a risky material + fuel combo |
| Before you pick | Mission control gives a hint ("Check your fuel margin first") | No hint |
| Bad effects | Half strength (G) | Full strength |
| Worst case | Abort with the crew safe. Never a crew loss | A call the numbers can't support fails the mission |
| After you pick | Explains what a flight director would choose and why | Same, plus the Flight Director bonus (+50) |

#### Emergency deck (16 cards)

Easy draws 3 per mission, Hard draws 5, and they play in mission order (pad → launch → Earth orbit → coast → lunar orbit → landing → surface → return). Only draw cards that apply to the player's design (for example, #16 only if the rocket burns hydrogen; #4's lifeboat needs an attached lander). Speeds are in m/s.

**1. Engine out during launch** · Phase: launch · Real event: one Falcon 9 engine shut down on CRS-1 (2012) and the rocket still reached orbit — https://www.nasaspaceflight.com/2012/10/dragon-iss-spacex-review-falcon-9-ascent-issues/
- **A. Keep burning on the remaining engines.** Good: mission continues, no delay. Bad: −240 m/s of margin. If the margin was under 240, the crew ends up in a low orbit and has to come home.
- **B. Abort to Earth orbit and wait for a repair flight.** Good: crew safe, and the Moon fuel is untouched. Bad: +30 days, −$300M, +90 lb of supplies per crew member.
- **C. Launch abort: the capsule escapes.** Good: crew is guaranteed safe. Flight Director bonus if the margin was under 240. Bad: mission lost; score capped at 20%.
- Flight Director pick: A if margin ≥ 240 m/s, otherwise C.

**2. Lightning strike after liftoff** · Phase: launch · Real event: Apollo 12 was hit twice; "SCE to AUX" brought the systems back — https://www.space.com/apollo-12-lightning-strike-twice-launch-video.html
- **A. Switch to the backup power supply.** Good: systems back in seconds, no cost. Bad: only works with battery margin ≥ 20%. Without it, 25% chance guidance stays down (−150 m/s in steering losses).
- **B. Reboot every computer.** Good: works on any design. Bad: −10 minutes; 5% chance of missing the upper-stage burn window (abort to orbit).
- **C. Abort.** Good: crew safe. Bad: mission lost.
- Flight Director pick: A if battery margin ≥ 20%, otherwise B.

**3. Upper stage won't relight for the Moon burn** · Phase: Earth orbit · Scenario (made up, realistic: upper stages have failed to restart in orbit)
- **A. Retry with the backup igniter.** Good: no cost if it lights. Bad: 30% chance it fails again; −1 day of supplies either way.
- **B. Use the capsule's own engine for part of the push.** Good: still going to the Moon. Bad: −600 m/s of capsule Δv, which forces the halo orbit (NRHO) instead of low lunar orbit. If the capsule margin goes below 0, the crew can't get home (mission fail).
- **C. Stay in Earth orbit and run a test mission.** Good: crew safe, and Earth-orbit tests earn 30% of the science. Bad: no Moon landing.
- Flight Director pick: B if spare capsule Δv ≥ 750 m/s, otherwise A.

**4. Oxygen tank failure on the way to the Moon** · Phase: coast · Real event: Apollo 13's oxygen tank exploded; the lunar module became the lifeboat — https://www.planetary.org/space-missions/apollo-13
- **A. Lifeboat: cancel the landing, live in the lander, loop the Moon home.** Good: highest survival chance (needs lander supplies ≥ 4 days and the lander attached, i.e. Apollo-style single launch). Bad: science = 0, and the lander is thrown away.
- **B. Continue and land on the remaining oxygen.** Good: full science if it works. Bad: needs capsule oxygen margin ≥ 50%, or the crew runs out on the way home (mission fail).
- **C. Direct abort burn home now.** Good: fastest way home (−1.5 days). Bad: needs ≥ 900 m/s of spare capsule Δv and burns the whole reserve.
- Flight Director pick: A if the lander is attached, otherwise C.

**5. CO₂ filters clogging** · Phase: coast · Real event: on Apollo 13 the crew taped together an adapter so square filters fit round sockets — https://www.planetary.org/space-missions/apollo-13
- **A. Build an adapter from spare parts (tape, hoses, covers).** Good: free, and earns the Flight Director bonus. Bad: −3 hours of crew time; 10% chance it leaks and CO₂ creeps back.
- **B. Borrow the lander's filters.** Good: instant fix. Bad: −1 day of lander supplies.
- **C. Cut crew activity so they breathe less.** Good: no parts used. Bad: −20% coast science; tired crew (+5% chance of a mistake on the next burn).
- Flight Director pick: A.

**6. Solar storm warning** · Phase: coast or surface · Scenario (made up, realistic: solar particle storms are a real radiation risk outside Earth's magnetic field)
- **A. Shelter in the capsule's most shielded spot for 12 hours.** Good: radiation dose stays safe. Bad: −12 hours; on the surface, one moonwalk is lost (−15 science).
- **B. Keep working and take the dose.** Good: schedule and science kept. Bad: crew dose +30% of the career limit; −20 safety score.
- **C. Head home early.** Good: crew safe, and you're already heading home. Bad: −40% science.
- Flight Director pick: A.

**7. Computer alarms during landing** · Phase: landing · Real event: Apollo 11 got 1202/1201 alarms; mission control said keep going — https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html
- **A. Trust the ground and continue.** Good: no cost, Flight Director bonus. Bad: if the cheapest computer was picked, 10% chance it really freezes (forced abort).
- **B. Abort to orbit on the ascent stage.** Good: crew safe. Bad: landing lost; ascent fuel used.
- **C. Fly it manually.** Good: landing kept, and the computer is out of the loop. Bad: −90 m/s of descent fuel.
- Flight Director pick: A.

**8. Low fuel on final approach** · Phase: landing · Real event: Armstrong flew past a boulder field and landed with very little fuel left — https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html
- **A. Set down at the nearest flat spot.** Good: safe landing. Bad: far from the target, so −15 science (rover range).
- **B. Keep flying to the planned site.** Good: full science, +10 for hitting the target. Bad: needs ≥ 120 m/s of descent margin, or the lander crashes (mission fail).
- **C. Abort to orbit.** Good: crew safe. Bad: landing lost.
- Flight Director pick: B if descent margin ≥ 120 m/s, otherwise A.

**9. Lunar dust jams the hatch seal** · Phase: surface · Scenario (made up, realistic: Apollo crews reported dust clinging to everything and wearing down suit seals)
- **A. Clean the seal with brushes and wipes.** Good: works, no parts used. Bad: −2 hours; a slow leak remains (−5 lb of oxygen per day).
- **B. Install the spare seal.** Good: perfect seal. Bad: only if the spare was bought in the build (+$2M, +15 lb).
- **C. Cancel the remaining moonwalks.** Good: no more dust; the seal holds. Bad: −30 science.
- Flight Director pick: B if the spare was bought, otherwise A. (Add "spare hatch seal" as an optional hangar purchase.)

**10. Science instrument breaks on the surface** · Phase: surface · Scenario (made up)
- **A. Repair it on a moonwalk.** Good: instrument saved, full points. Bad: −4 hours of surface time, −200 Wh of battery.
- **B. Give its time to another instrument.** Good: no risk, and the other instrument earns +50% points. Bad: the broken instrument's points are lost.
- **C. Stay one extra day.** Good: repair plus extra science (+10). Bad: +1 day of supplies and battery, and only if the lander allows it.
- Flight Director pick: A if battery margin ≥ 20%, otherwise B.

**11. Small cabin leak** · Phase: lunar orbit or coast · Real event: in 2018 the ISS crew sealed a 2 mm hole in a Soyuz with tape, epoxy and gauze — https://www.nbcnews.com/mach/science/astronauts-use-gauze-high-tech-tape-plug-hole-iss-ncna905326
- **A. Find it and patch it.** Good: leak stopped for good. Bad: −6 hours, −10 lb of oxygen while searching.
- **B. Seal off the leaking module.** Good: instant fix. Bad: −25% of stored supplies, locked behind the hatch.
- **C. Ignore it and run on reserves.** Good: no time lost. Bad: −8 lb of oxygen per day; the crew may run out on the way home.
- Flight Director pick: A.

**12. Thrusters failing during docking** · Phase: lunar orbit · Real event: Starliner lost thrusters approaching the ISS in 2024; its crew came home on Dragon — https://www.space.com/nasa-boeing-starliner-astronauts-will-return-on-spacex-dragon-2025
- **A. Dock slowly on the remaining thrusters.** Good: docking happens. Bad: needs ≥ 8 working thrusters (4 fail); +2 hours, −60 lb of thruster fuel.
- **B. Let the other vehicle do the docking.** Good: saves your thruster fuel. Bad: both need docking systems; the other vehicle burns −150 lb of its fuel.
- **C. Spacewalk between vehicles.** Good: no docking needed. Bad: −5% success, +4 hours.
- Flight Director pick: A if (thrusters − 4) ≥ 8, otherwise B.

**13. Loss of signal before a burn** · Phase: lunar orbit · Real effect: in low lunar orbit, contact is lost every pass behind the Moon (much more likely in LLO than NRHO)
- **A. Wait for the next pass.** Good: the ground double-checks the burn; no risk. Bad: +2 hours of supplies.
- **B. Burn on onboard data alone.** Good: stays on schedule. Bad: 3% chance of a bad burn (−90 m/s).
- **C. Switch to the halo orbit.** Good: constant contact for the rest of the mission. Bad: costs capsule Δv (G: −300 m/s), so only possible with spare fuel.
- Flight Director pick: A.

**14. Heat shield damage spotted before re-entry** · Phase: return · Scenario (made up, realistic: heat shields wear in ways engineers don't always predict)
- **A. Steep direct re-entry.** Good: less time in the heat. Bad: higher g-forces (−10 safety score); lands 300 miles off target.
- **B. Normal skip re-entry.** Good: gentle on the crew, lands on target. Bad: if the shield is rated under 24,400 mph, 15% chance of burn-through (mission fail).
- **C. Inspect with a camera first (one extra orbit).** Good: small damage means a safe re-entry plus a bonus. Bad: +1 day of supplies, +5% radiation dose.
- Flight Director pick: C. (More likely if the shield rating is under 26,000 mph.)

**15. Crew member feeling sick** · Phase: coast · Scenario (made up, realistic: space motion sickness hits many astronauts in the first days)
- **A. Medicine and rest.** Good: recovers in a day. Bad: that crew member's tasks slip a day (−5 science).
- **B. Swap jobs between crew members.** Good: no time lost. Bad: a less-trained person does the task (+5% chance of a mistake).
- **C. Turn back.** Good: safest. Bad: mission lost. Mission control should say this is overkill, so no bonus.
- Flight Director pick: A.

**16. Hydrogen leak while fueling** · Phase: on the pad, before launch (plays first) · Real event: hydrogen leaks scrubbed Artemis I's launch attempts in 2022 — https://www.space.com/artemis-1-launch-scrub-hydrogen-leak
- **A. Stop, replace the seal, try again next week.** Good: leak fixed for good. Bad: +7 days, −$10M.
- **B. Warm the seal and refill slower.** Good: you might still launch today. Bad: 50% chance it leaks again, and then you're stuck with A anyway, plus a day lost.
- **C. Launch with the small leak.** Good: on schedule. Bad: +10% chance of an engine problem during launch.
- Only appears if the rocket burns hydrogen. Much more likely with carbon-fiber hydrogen tanks, less likely if the pad leak check was bought.
- Flight Director pick: A.

**How the Good and Bad effects plug into the game**

| Effect type | What it changes | Example |
|---|---|---|
| Δv (m/s) | Fuel margin left for later burns | −240 m/s |
| Time (hours/days) | Supplies used = 15 lb per crew-day | +1 day = +60 lb for 4 crew |
| Money ($) | Budget bar | −$300M |
| Science (points) | Final science score | −15 science |
| Risk (%) | A hidden roll later in the mission (this is the only randomness besides which cards are drawn) | +5% chance of a mistake |
| Safety score | The crew-safety part of the final score | −20 |
| Unlock or lock | Changes the options later in the mission | Forces the halo orbit |

If spare supplies go below zero by splashdown, the mission fails ("the emergencies used up the spare supplies").

**Endings:** mission success · crew home, no landing (the Apollo 13-style "successful failure") · aborted, crew safe · mission failed. The report lists every decision (★ for Flight Director picks) and the seed number.

**How to pick which emergencies happen**

- Weight them by the design. Weak spots should be more likely to break: thin Δv margin → engine-out more likely; few thrusters → docking failure; low battery margin → lightning/instrument; LLO → loss of signal; shield under 26,000 mph → heat shield damage; risky material + fuel combo → tank/leak cards (#16, #4, #11). The team game already has 8 context-dependent emergency types and seeded random results, so plug these A/B/C choices into that system (map existing types to matching cards; add the rest as new cards).
- Use the seed so the same design and seed always give the same emergencies. Players can retry a scenario and learn. Show the seed in the report.
- Never kill the crew without warning. Every bad outcome must be explained by numbers the player could see on the choice screen.
- Risky material + fuel combos make tank and leak emergencies more likely. Buying the fix listed in the Spacecraft tab lowers the odds.
- Easy: halve every Bad number, turn any "mission fail" into "abort, crew safe", and show a hint before the choice.

---

### TAB 8 — Sources (put the ones the game uses into `SOURCES.md`)

**Official challenge**
- Space Mission Design Game challenge page — https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/
- Design and Develop Science Missions (NASA) — https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf
- Mission Design Lab (NASA Goddard) — https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/
- GMAT (NASA) — https://software.nasa.gov/software/GSC-19468-1 · NASA Mission Viz — https://nasa.github.io/mission-viz/ · CubeSat 101 (NASA) — https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf · Build It Yourself: Satellite! (NASA Webb) — https://science.nasa.gov/mission/webb/game-build-it-yourself/

**Moon mission**
- NASA SLS reference — https://www.nasa.gov/reference/space-launch-system/ (8.8 million lbf, 5.75 million lb, 59,500 lb to the Moon, boosters, RS-25, RL10)
- NASA Orion quick facts — https://www.nasa.gov/wp-content/uploads/2015/06/fs-2014-08-004-jsc-orion_quickfacts-web.pdf (crew 4, 21 days, module masses, 6,000 lbf engine, 11 kW)
- NASA Moon fact sheet — https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html (gravity 1.62 m/s², distance 384,400 km, lunar day 29.53 days, 1,361 W/m²)
- NASA: Why NRHO, the Artemis orbit — https://nasa.gov/wp-content/uploads/2023/10/acr22-wp-why-nrho-the-artemis-orbit.pdf (constant contact, ~6.5-day period, ~10 m/s per year upkeep)
- Wikipedia: Delta-v budget — https://en.wikipedia.org/wiki/Delta-v_budget (LEO, TLI, LOI, landing and NRHO values)
- Wikipedia: Apollo Lunar Module — https://en.wikipedia.org/wiki/Apollo_Lunar_Module (lander masses, engines, stays)
- Spaceflight Now: Artemis I — https://spaceflightnow.com/2022/12/11/artemis-1-back-on-earth-after-near-flawless-25-day-moon-mission/ (re-entry 24,400+ mph, 5,000°F, 25.5 days)

**Life support and safety**
- NASA OCHMO life support brief — https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf (oxygen 0.771–1.083 kg/day, water ≥ 2.5 L/day)
- NASA NTRS paper citing the BVAD — https://ntrs.nasa.gov/api/citations/20190027563/downloads/20190027563.pdf (food 2.39 kg per person-day)
- Space.com on NASA's crew safety requirement — https://www.space.com/38994-nasa-commercial-crew-providers-safety-requirements.html (1 in 270)

**Rockets, engines and parts**
- SpaceX Falcon 9 — https://new.spacex.com/vehicles/falcon-9 · Wevolver Falcon 9 stage data — https://wevolver.com/specs/falcon-9-v12-or-full-thrust-block-5 · Wikipedia: SpaceX Merlin — https://en.wikipedia.org/wiki/SpaceX_Merlin
- Blue Origin New Glenn (BE-4) — https://www.blueorigin.com/new-glenn · ULA Vulcan Centaur — https://www.ulalaunch.com/docs/default-source/rockets/vulcancentaur.pdf
- L3Harris RL10 spec sheet — https://l3harris.com/sites/default/files/2024-07/l3harris-ar-rl10-spec-sheet.pdf · NASA RS-25 fact sheet — https://www.nasa.gov/wp-content/uploads/2020/09/final_sls_rs25_fact_sheet_508_07312015.pdf
- L3Harris monopropellant thrusters — https://www.l3harris.com/sites/default/files/2025-10/l3harris-ar-monopropellant-rocket-engines.pdf · Wikipedia: SpaceX Draco — https://en.wikipedia.org/wiki/SpaceX_Draco · Wikipedia: NASA Docking System — https://en.wikipedia.org/wiki/NASA_Docking_System
- ArianeGroup propellant tanks — https://space-propulsion.com/spacecraft-propulsion/bipropellant-tanks/index.html · Antrix 516 L tank — https://satsearch.co/products/antrix-516l-propellant-tank
- ST-16RT2 star tracker — https://satsearch.co/products/sinclair-interplanetary-second-generation-star-tracker-st-16rt2 · ST200 star tracker — https://satsearch.co/products/berlin-space-tech-st200 · IMU-P4 — https://satsearch.co/products/space-inventor-imu-p4
- Cygnus fact sheet (Northrop Grumman) — https://cdn.northropgrumman.com/-/media/wp-content/uploads/Cygnus-Fact-Sheet-1.pdf?v=1.0.0 (UltraFlex 3.5 kW)

**Emergency deck and risk table (real events)**
- SpaceX CRS-1 engine-out, 2012 (NASASpaceflight) — https://www.nasaspaceflight.com/2012/10/dragon-iss-spacex-review-falcon-9-ascent-issues/
- Apollo 12 lightning strikes, 1969 (Space.com) — https://www.space.com/apollo-12-lightning-strike-twice-launch-video.html
- Apollo 13 oxygen tank and CO₂ filter fix, 1970 (Planetary Society) — https://www.planetary.org/space-missions/apollo-13
- Apollo 13 tank explosion (History.com) — https://www.history.com/this-day-in-history/apollo-13-oxygen-tank-explodes
- Apollo 11 program alarms and low fuel, 1969 (Space.com) — https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html
- Soyuz MS-09 leak patched on the ISS, 2018 (NBC News) — https://www.nbcnews.com/mach/science/astronauts-use-gauze-high-tech-tape-plug-hole-iss-ncna905326
- Starliner thruster problems; crew returns on Dragon, 2024 (Space.com) — https://www.space.com/nasa-boeing-starliner-astronauts-will-return-on-spacex-dragon-2025
- Artemis I hydrogen leak scrub, 2022 (Space.com) — https://www.space.com/artemis-1-launch-scrub-hydrogen-leak
- X-33 composite hydrogen tank failure, 1999 (Wikipedia) — https://en.wikipedia.org/wiki/Lockheed_Martin_X-33
- Carbon-wrapped bottle in a liquid-oxygen tank behind the 2016 Falcon 9 pad explosion (CompositesWorld) — https://compositesworld.com/articles/spacex-announces-copvs-role-in-sept-rocket-explosion

Emergencies 3, 6, 9, 10, 14 and 15 are made up but realistic. The game must label them "scenario", not "this really happened".

---

## PART C — ACCEPTANCE TESTS (add these as unit tests; tolerance ±0.5% unless noted)

Use the SLS-like build: payload 63,400 lb; stage 2 = 1 × RL10 (664 lb, 4,530 m/s), 65,000 lb hydrogen fuel, aluminum-lithium; stage 1 = 4 × RS-25 (7,775 lb each, 1,860,000 N each, 4,010 m/s), 2,150,000 lb hydrogen fuel, aluminum-lithium; 2 × SLS boosters (1,600,000 lb each, 1,390,000 lb fuel each, 16,000,000 N each, 2,500 m/s).

| # | Test | Expected |
|---|---|---|
| 1 | Stage 2 empty = 0.054 × 1.5 × 65,000 + 664 | 5,929 lb |
| 2 | Stage 1 empty = 0.054 × 1.5 × 2,150,000 + 4 × 7,775 | 205,250 lb |
| 3 | Weight at liftoff | 5,689,579 lb |
| 4 | Total push at liftoff | 39,440,000 N |
| 5 | Weight at liftoff in N (× 4.448) | ≈ 25,307,000 N |
| 6 | TWR | 1.56 (±0.01) |
| 7 | V boosters (full 5,689,579 / empty 2,909,579, 2,500 m/s) | ≈ 1,680 m/s |
| 8 | V stage 1 (full 2,489,579 / empty 339,579, 4,010 m/s) | ≈ 7,990 m/s |
| 9 | V stage 2 (full 134,329 / empty 69,329, 4,530 m/s) | ≈ 2,995 m/s |
| 10 | Total Δv ≥ 12,600 m/s → pass | ≈ 12,665 m/s, pass |
| 11 | Dead-weight share at stage 1 ignition / burnout | 8% / 60% (±1 point) |
| 12 | Stage 2 Δv with stage 1 empty still attached | ≈ 960 m/s |
| 13 | Fuel needed: Δv 5,400, ve 3,050, k 0.065, pushing 26,455 lb | R ≈ 5.87; fuel ≈ 188,700 lb exact (the desk example rounds R to 5.86 and shows 187,700; accept ±1%) |
| 14 | Fuel formula with 1 − k(R−1) ≤ 0 | returns "impossible" (no fuel works) |
| 15 | Orion → NRHO: 57,200 lb, ve 3,100, LOI 430 | fuel used ≈ 7,410 lb; left ≈ 11,590 lb; Δv left ≈ 820 m/s ≥ 410 → pass |
| 16 | Orion → LLO: LOI 900 | fuel used ≈ 14,410 lb; left ≈ 4,590 lb; Δv left ≈ 350 m/s < 900 → fail |
| 17 | Apollo LM ascent: full 11,200 / empty 6,013, ve 3,050 | ≈ 1,898 m/s ≥ 1,870 → pass; with 250 lb rocks (full 11,350 / empty 6,163) ≈ 1,862 → fail |
| 18 | Apollo LM ascent Moon TWR: 15,570 ÷ (11,200 × 4.448 × 0.165) | ≈ 1.89 |
| 19 | Apollo LM cannot land from NRHO (needs 2,600 m/s down) | fail |
| 20 | Supplies: 4 crew × 17.5 days | O₂ 140, drinking water 385, hygiene 154, food 369, total ≈ 1,048 lb |
| 21 | Power: 11,000 W × 0.99 vs 3,482 W | 10,890 W made → pass |
| 22 | Surface battery: 1,200 W × 48 h × 1.2 | 69,120 Wh → 14 packs of 5,000 Wh |
| 23 | Data: 256 kbps × 86,400 × 1.0 ÷ 8,000 | 2,765 MB/day (LLO 0.63 → ≈ 1,742) |
| 24 | Signal delay: 238,855 ÷ 186,282 | 1.28 s |
| 25 | Shield health: Orion 25,000 mph / Budget 17,500 mph | 100% safe / ≈ 72% fail |
| 26 | Budget at $0 or below | launch locked |
| 27 | Engine/fuel lock: RS-25 + kerosene | not selectable |
| 28 | Emergency count: Easy / Hard | 3 / 5 |
| 29 | Same design + same seed | same emergency cards in the same order |
| 30 | Reliability rolls | disabled (no random mission failure without an emergency) |

---

## PART D — WHEN YOU'RE DONE WITH EACH PHASE, REPORT

1. What you changed (bullet list) and which files (new vs edited).
2. Test results for all three commands.
3. How to see it: `npm run dev`, then exactly where to click.
4. Anything in the spec you couldn't do, why, and your proposed fix.
5. The commit hash(es).

Do not push. Wait for my OK before the next phase.
