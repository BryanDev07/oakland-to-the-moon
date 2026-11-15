# Architecture

```
src/
  main.ts                 Phaser bootstrap (480x270 logical, pixelArt, FIT scaling) + window.__ottm test hooks
  data/
    components.ts         33 component options across 13 slots (mass, cost, power, capability, education text)
    mission.ts            launch vehicles, landing sites, ops tempo, Design type, baseline & reference designs
  simulation/             PURE TypeScript: no Phaser imports, fully unit-tested
    constants.ts          physical constants and architecture parameters (SI)
    rng.ts                seedable mulberry32 PRNG
    rocket.ts             rocket equation helpers
    spacecraft.ts         analyzeDesign(): mass, cost, power, thermal, comms, staged Δv, lander, reliability
    review.ts             reviewDesign(): pass / warn / fail checks with fixes and culprit components
    types.ts              MissionState (plain JSON, saveable)
    mission.ts            createMission(), fixed-step step(), burns, landing/ascent hooks, entry
    events.ts             context-aware engineering emergencies + seeded scheduling
    landing.ts            2-D final-approach physics, terrain generation, autopilot
    surface.ts            EVA activities, rest days
    scoring.ts            transparent mission evaluation and lessons
  state/
    store.ts              LocalStorage persistence (design, mission, history, settings), defensive parsing
    debug.ts              QA helpers that fast-forward real simulations to a phase
  game/
    audio/audio.ts        Web Audio synth: SFX, engine loops, step-sequenced chiptune music
    ui/ui.ts              BitmapText, NineSlice panels, Button, Meter, Tooltip, Dialogue, modal, toast, transitions
    components/SpacecraftView.ts  modular spacecraft renderer (stack / flight modes, attachment coordinates)
    scenes/               Boot, Title, Intro, Briefing, RoleSelect, MissionSelect, Hangar (+ hangarRocket.ts), Desk,
                          Review, Launch, Ops, Docking, Spacewalk, Landing, Surface, Return, Report, Overlay (18 scenes)
scripts/
  generate-assets/        procedural pixel-art pipeline (Node + pngjs) → public/assets/**
  validation/screens.mjs  screenshot capture for visual QA
tests/
  unit/                   Vitest: 195 tests (simulation, spec model, desk, deck, roles, ISS, scoring, Isp consistency)
  e2e/                    Playwright: 7 tests (boot/fit, full Moon mission, full ISS mission, quick start,
                          save/continue, scene robustness, text fit); screenshots go to test-results/
```

## The spec model (what the game runs today)

`SPEC_MODEL = true` in `constants.ts` switches the simulation to the model from `docs/JOSEPH_SPEC.md`.
It refines the original analysis instead of replacing it:

```
src/data/specParts.ts        every part and number with an R (real) / G (game) tag, in lb as in the spec
src/data/missionConfig.ts    Moon Landing vs ISS Rescue: Δv target, re-entry speed, budgets
src/data/roles.ts            the four roles and their price / budget / science multipliers
src/simulation/formulas.ts   the 15 Calculation Desk formulas as pure functions
src/simulation/stack.ts      staged rocket: liftoff weight, TWR, three-piece rocket equation, risks
src/simulation/specModel.ts  analyzeSpec(): capsule, orbit, architecture, lander, power, data, cost
src/simulation/specReview.ts GO / NO-GO checks for the spec model
src/simulation/deskFive.ts   the five Desk sheets (built on calcDesk.ts)
src/simulation/deck.ts       the 16-card A/B/C emergency deck (issDeck.ts for the ISS mission)
src/simulation/units.ts      the single lb -> kg conversion boundary
```

The original component slots for engine, tank and heat shield are hidden (the capsule supplies them),
and reliability rolls are off (`RELIABILITY_ROLLS = false`); both stay in the code behind flags.
Flight burns use `stats.propulsion.ispS`, the same Isp the design review used.

## Data flow

1. **Hangar** edits `store.design` (a `Design`) and calls `reviewDesign()` on every change.
   **Desk** shows the same numbers as five worked sheets.
2. **Review** gates launch on zero blocking checks; launching calls `createMission(design, seed)`.
3. **Ops** advances `step()` at a fixed 300 s timestep (1×/4×/16× = 12/48/192 steps per second),
   pauses for `pending` events, and invokes discrete actions (`executeLOI`, `beginDescent`, `executeTEI`, ...).
4. **Landing** runs `stepLanding()` at a fixed 1/30 s and reports the outcome to `applyLanding()`.
5. **Surface** calls `doActivity()` / `restUntilNextDay()`; time advances the orbiting CSM too.
6. **Return** calls `performEntry()`; **Report** calls `evaluate()` and stores history.

The mission state is saved to LocalStorage at every phase change and every 6 simulated hours, so
"Continue Mission" resumes in the right scene.

## Determinism
All randomness in the simulation goes through `Rng` with the state stored in `MissionState`.
Visual-only randomness (twinkling stars, smoke drift) uses Phaser's RNG and never affects outcomes.

## Robustness
* Missing textures are replaced by placeholders at boot; audio failures are silent.
* Corrupted saves are ignored. Scenes that need a mission redirect if none exists.
* Static build (`npm run build`) with relative base path: deploy `dist/` to any static host.
