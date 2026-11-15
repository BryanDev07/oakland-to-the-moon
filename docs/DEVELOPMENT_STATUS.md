# Development Status

_Last updated: 2026-11-15 (pre-submission fixes, branch `final-presubmission-fixes`)._

## Verified
| Check | Command | Result |
|---|---|---|
| Type check + production build | `npm run build` | ✓ no warnings (Phaser chunk 1.2 MB / 319 kB gzip) |
| Unit tests | `npm run test` | ✓ 195 / 195 (24 files) |
| Browser tests (Chrome, 1366×768) | `npm run test:e2e` | ✓ 7 / 7: boot + fit + FPS; **full Moon mission through the UI** (title → report, FULL MISSION SUCCESS); scene robustness and corrupted save; quick start; save + reload + CONTINUE; text fit; **full ISS mission** (dock, spacewalk, home). Every test checks for page errors: none. |
| Load time / FPS (local preview) | e2e test 1 | ~1.6 s to the title; ~60 FPS |
| Viewports | Playwright, manual script | 1920×1080, 1366×768, 1024×576, 800×600: no console errors, no text past the screen |
| Repository subpath | dist/ served at `/oakland-to-the-moon/` | Title and hangar load, no failed requests (GitHub Pages layout) |
| Screenshots | `npm run screenshots` | `docs/screenshots/01-18`, regenerated from the current build |

## Fixed on 2026-11-15 (pre-submission audit)
- Flight burns used a 300 s Isp fallback instead of the capsule's engine (314-316 s), so flight
  propellant margins were smaller than the design review showed (reference design: 923 kg in
  review, 350 kg in flight). They now match; regression test `tests/unit/ispConsistency.test.ts`.
- Landing-site text claimed polar sites cost extra Δv; the model sets Δv by lunar orbit only. The text now says so.
- The upper-stage push check warned on every preset rocket, and players could not clear it. It is now a learning
  note on presets and still a warning on custom rockets.
- CAPCOM messages covered the hangar's Mission Plan, the flight panels and the EVA list. They now appear over
  each scene's artwork. Panel headers no longer run under the fullscreen and gear icons; cut-off hangar
  labels were replaced with whole words.
- Quick start on the title screen (or Q) for judges; Enter no longer starts a mission while a
  window is open on the title.
- Browser tests no longer rewrite tracked screenshots; GitHub Pages workflow added.

## Known limitations
- Easy mode is forgiving: the scripted e2e run (suggested build, autopilot, option A on every
  emergency) scores 100 / S. Hard mode is the intended challenge.
- Simplifications are listed in `docs/SCIENTIFIC_ASSUMPTIONS.md` (no site Δv, booster-phase
  shortcut, no lunar night, fixed docking fuel).
- Pixel scaling is FIT, not integer-only: at 1366×768 pixels are slightly uneven in size.
- `window.__ottm` test hooks (scene jump, fast-forward) are present in the production build.
- Audio is synthesized at runtime and was not checked by ear in automated tests.
- The full-mission browser test takes about 4 minutes because it plays in real time.

## Continue from here
```bash
npm install && npm run dev
npm run test && npm run test:e2e
npm run screenshots   # refresh docs/screenshots
npm run assets        # after editing scripts/generate-assets/*
```
