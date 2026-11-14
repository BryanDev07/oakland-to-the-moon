# Game Design — OAKLAND TO THE MOON

*From the Town to the Stars.* A single-player, story-driven space mission engineering game in a
16-bit style. The player is Commander Kai Alvarado (fictional), an Oakland native chosen to lead
TOWN-1, the first crewed lunar mission of the fictional Pacific Space Exploration Agency.

## Core idea
The spacecraft **you design** determines what the mission can do. There is no "correct" build:
a lean Bayhawk-M mission, a balanced Estuary Heavy mission and a lavish Golden Bear mission can all
succeed (and fail) for explainable engineering reasons.

## Loop (≈12–20 minutes)
| Chapter | Scene | Player does |
|---|---|---|
| 1 Made in Oakland | Intro | Walks the block at sunset; neighbors, robotics kids, a call from Mission Control |
| — | Briefing | Learns the four mission segments and the constraints |
| 2 The Build | Hangar | Picks components in 13 categories + mission plan; ship changes visually; live meters |
| 3 Countdown | Review → Launch | Fixes blocking issues; GO/NO-GO poll; launch with staging |
| 4 The Journey | Ops | Manages power, data, life support, time warp; responds to emergencies |
| 5 Lunar Operations | Ops → Landing → Surface | LOI burn, orbital mapping, flies the landing, EVA science, ascent |
| 6 The Return | Ops → Return | TEI burn, coast, entry, splashdown, Oakland homecoming |
| 7 Mission Report | Report | Score breakdown, failures, recommendations, history, retry |

## Meaningful choices
* **Components (33 options / 13 slots)** — each changes mass, cost, power, heat and a capability.
* **Mission plan** — rocket (capacity vs cost vs reliability), site (Δv vs science vs comms),
  crew size, surface stay, operations tempo (EVA hours vs reserve vs fatigue).
* **Operations** — instrument duty cycling, conserve mode, comms mode, when to descend, when to leave.
* **Emergencies** — 8 event types, each with 1–3 responses that trade time, power, science or safety.
* **Landing** — fly manually or trust the autopilot; abort if fuel runs low.
* **Surface** — which EVA activities to spend hours on; how many samples the ascent stage can lift.

## Failure is explainable
Every failure links back to a number: not enough propellant for TEI, battery flat in eclipse,
recorder full, sink rate too high, samples too heavy for the ascent stage. The report names the
cause and recommends a design change; "Modify design" returns to the hangar with the design intact.

## Educational layer
* "Why it matters" notes on every component, plus comparison deltas (↑/↓ kg, $M, prop, W).
* Mission control coaching messages triggered by what is happening (first eclipse, far-side LOS, low battery...).
* Events include a teal "learn" explanation.
* Glossary and help in the pause overlay; the review explains each check and its fix.

## Accessibility
Mouse-first; keyboard shortcuts (Enter, Esc, 1–4 for choices, arrows/WASD to fly). Status is never
color-only: meters show numbers and words (SHORT, POOR, RATION...), review rows have ✓ / ! / ✗ icons
and PASS/WARNING/BLOCKING labels. Text speed, screen shake and CRT scanlines are configurable.
Autopilot is available for the landing.
