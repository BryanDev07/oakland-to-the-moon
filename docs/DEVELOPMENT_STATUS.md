# Development Status

_Last updated: 2026-11-13 (initial autonomous development session)._

## Verified
| Check | Command | Result |
|---|---|---|
| Type check + production build | `npm run build` | ✓ (Phaser chunk 1.2 MB / 319 kB gzip; game code 184 kB / 66 kB gzip) |
| Simulation unit tests | `npm run test` | ✓ 52 / 52 |
| Browser E2E (Chrome, 1366×768) | `npm run test:e2e` | ✓ 3 / 3: boot + fit + FPS; **full mission through the UI** (title → report); scene/save robustness |
| Load time / FPS (local preview) | E2E test 1 | ~1.6–1.8 s to title; ~60 FPS |
| Screenshots | `docs/screenshots/*.png` | 17 captured by the E2E run and visually inspected |

## Feature checklist
**Complete (P0)**: build/run; title; Oakland intro (playable walk, dialogue, parallax, animated
town); mission-control briefing; hangar with 33 components in 13 slots + mission plan, live
visual spacecraft, meters, comparison deltas, undo, hint/reference design; design review
(blocking vs warnings, fixes, culprits); launch cinematic with staging & telemetry; operations
(time warp, power/thermal/life-support/data/comms simulation, eclipses, LOS, instruments, modes);
LOI / free-return abort / descent / abort-home / TEI decisions; interactive landing (manual +
autopilot, TRN hazard map, abort); surface EVA (9 activities, samples vs ascent Δv, rest days);
entry/parachutes/splashdown/Oakland homecoming; transparent report; procedural art; tests.

**Complete (P1)**: 8 context-aware emergencies with seeded scheduling; launch-vehicle
underperformance; procedural chiptune music & SFX with volume/mute; save/continue; run history
and previous-run comparison; educational notes, coaching toasts, glossary; chapter cards and fades;
settings (text speed, shake, scanlines).

**Partial**
- Keyboard support covers primary actions (Enter/Esc/1–4/Space/flight keys) but not full
  arrow-key focus navigation of every button.
- Integer-only pixel scaling is not enforced (FIT scaling with nearest-neighbor filtering).
- NASA references are listed but were not fetched/reviewed in-session (see SOURCES.md).

**Not implemented (P2)**: extra mission scenarios, achievements, unlockables, expanded dialogue.

## Known limitations
- Coast phases default to 1× (1 sim-hour per second); players should use 4×/16×.
- The E2E full-mission test takes ~4 minutes because it plays in real time.
- Audio cannot be verified by automated tests (Web Audio runs; output not inspected).

## Continue from here
```bash
npm install && npm run dev
npm run test && npm run test:e2e
npm run assets   # after editing scripts/generate-assets/*
```
Highest-impact next task: a guided first-time tutorial overlay in the hangar (pointing at each
meter and the first red category), plus arrow-key focus navigation for all buttons.
