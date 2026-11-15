# Scientific Assumptions & Simplified Models

OAKLAND TO THE MOON is an **educational game**, not an engineering tool. It uses real physics
relationships (the rocket equation, energy and data balances, life-support rates) with
simplifications chosen so a player can see cause and effect. Nothing here is NASA-validated, and the
agency, rockets and mission are fictional.

This document describes the model the game **runs today**: the "spec model" (`SPEC_MODEL = true`
in `src/simulation/constants.ts`). An older model is still in the code behind that flag; its
values are listed at the end only for reference.

**Where things live:** every part and number, with an R/G tag, is in `src/data/specParts.ts` and
`src/data/missionConfig.ts`. Every Calculation Desk formula is a pure function in
`src/simulation/formulas.ts`. The rocket is analysed in `stack.ts`, the spacecraft in `specModel.ts`,
and the live flight in `mission.ts`. Spec data is stored in **lb** (as in the design notes) and
converted to kg exactly once (`units.ts`); the simulation runs in SI units.

## How to read the tags

| Tag | Meaning | Examples |
|---|---|---|
| **R** (real) | Published value from NASA, the manufacturer or a cited source (see `SOURCES.md`), rounded | RS-25 thrust, Apollo LM masses, Orion's 11 kW arrays, Earth-Moon distance |
| **Approx.** | Real-world order of magnitude, simplified or averaged for the game | 9,400 m/s to Earth orbit (losses included), 900 m/s lunar orbit insertion |
| **G** (game) | Invented or tuned for gameplay balance | All prices, science points, tank-weight factors, docking fuel |

---

## 1. Mission architecture and Δv budget

The player picks a **lunar orbit** and an **architecture**:

| | Low lunar orbit (LLO, Apollo) | Near-rectilinear halo orbit (NRHO, Artemis) |
|---|---|---|
| Orbit insertion / trans-Earth injection (capsule) | 900 m/s (R) / 900 m/s (G) | 430 m/s (R) / 410 m/s (R) |
| Descent / ascent (lander) | 1,870 / 1,870 m/s (R, Apollo-class) | 2,600 / 2,600 m/s (R, approx.) |
| Wait in orbit before landing | 1 day (G) | 6.5 days, one orbit (R) |
| Sunlight / Earth contact fraction | 0.60 (G) / 0.63 (G) | 0.99 (G) / 1.0 (R, uninterrupted) |
| Orbit period | ~118 min (R) | ~6.5 days (R) |

* **Apollo-style (one launch):** the capsule carries the lander and pays to brake both into lunar orbit.
* **Artemis-style (two launches):** the lander flies on its own rocket and spends its own
  descent propellant to enter lunar orbit; the capsule only brakes itself.
* Coast: 3 days each way (approx.). Separate trajectory-correction burns are folded into the main burns.
* **Landing site does not change Δv.** The site changes landing hazard (boulder density), Earth
  contact on the surface, lander heater power and science value. Real missions to polar sites also
  pay extra Δv to reach a polar orbit; the game leaves this out so the orbit choice alone sets Δv.

This is why Orion with an Apollo-style lander in low lunar orbit runs out of propellant in the game:
its service module cannot brake a lander into LLO and still come home. That is the real reason
Artemis uses the halo orbit.

## 2. Rocket equation

`Δv = vₑ · ln(m_full / m_empty)`, with vₑ = Isp · g₀ and g₀ = 9.80665 m/s².
Propellant for a burn: `m_prop = m₀ · (1 − e^(−Δv / vₑ))`.

The design review walks the burn sequence with the mass at each burn: lunar orbit insertion with the
whole stack, then the lander leaves, then the crew and the planned sample mass come back aboard for
trans-Earth injection. The live flight repeats the same burns from the current mass (lighter by the
food, water and oxygen used on the way), **using the same engine values as the review**. Before
the 2026-11-15 fix, flight burns used a 300 s default instead of the capsule's engine; a regression
test (`tests/unit/ispConsistency.test.ts`) now keeps the two equal.

Capsule service-module engines: Orion AJ10-class 26.7 kN, vₑ 3,100 m/s; Apollo-class SPS 91.2 kN,
vₑ 3,080 m/s; budget capsule 17.8 kN, vₑ 2,940 m/s. Lander engines: vₑ 3,050 m/s (Apollo LM, R)
or 3,240 m/s (large lander, G).

## 3. The launch vehicle (staged rocket)

The rocket must push the heaviest launch payload to **12,600 m/s** (9,400 m/s to Earth orbit, a
range of 9,300-10,000 including gravity and drag losses, plus 3,200 m/s for trans-lunar injection),
and its liftoff thrust-to-weight must be **at least 1.2** (G rule of thumb). The ISS mission needs 9,400 m/s.

* Stage empty mass = k × fuel + engines, where k comes from the tank material (G; aluminum-lithium
  0.054 is close to Falcon 9's) times a fuel factor (hydrogen tanks ×1.5 because they are bulky, G).
* Δv is added up in three pieces: boosters, then stage 1, then stage 2.
* **Simplification:** during the booster phase only the boosters' exhaust counts, and stage 1
  starts its own burn full after the boosters drop. A real core stage burns alongside the boosters,
  so the game slightly over-credits rockets that use boosters.
* **Upper-stage push** (stage 2 thrust ÷ its starting weight) is compared with a 0.3 rule of thumb (G).
  A weaker stage would really lose some fuel to gravity, but the game does not charge that loss
  (the 12,600 m/s target already counts typical losses). For the preset rockets, which the player
  cannot change, the review therefore shows it as information. A custom rocket built in the
  Rocket tab still gets a warning, because the player can add stage 2 engines.
* Stage 1 engines use an average of sea-level and vacuum exhaust speed, since stage 1 flies through both.

Engine data (R unless noted): Merlin 1D 845 kN; BE-4 2,846 kN (Blue Origin's upgraded rating;
2,400 kN originally); RS-25 1,860 kN at liftoff; RL10 110 kN, vₑ 4,530 m/s; Merlin Vacuum 981 kN;
SLS 5-segment booster 16 MN. Engine prices, and some engine weights that are not published, are G.

## 4. Masses

* Astronaut + suit: 400 lb (G). Capsules: Orion crew module 22,900 lb and service module 34,300 lb
  (R); Apollo-class CSM about 12,800 + 53,600 lb (G, Apollo-like).
* Apollo LM: 33,500 lb total, 18,000 lb descent fuel, 5,187 lb ascent fuel (R).
* Surface payload (instruments, battery packs, surface solar array) rides on the lander's descent stage.
* Samples ride up in the ascent stage and home in the capsule: the ascent check uses the rocket
  equation and can force the crew to leave samples behind.

## 5. Electrical power

* Battery: `E_next = clamp(E + (P_gen − P_load) · Δt, 0, E_capacity)` with Δt = 300 s.
* Solar arrays give their rated power in sunlight and **zero in shadow**. The translunar coast is
  treated as continuous sunlight. In lunar orbit the shadow fraction is 1 − the orbit's sunlight
  fraction: 40% in LLO, which matches the geometry of a 100 km orbit (asin(1737/1837) ≈ 0.395),
  and about 1% in the halo orbit.
* The Apollo-class capsule has no built-in solar arrays, like the real Apollo CSM, which used fuel
  cells; it relies on the Power slot. Orion has 11 kW of built-in arrays (R).
* Fuel cells follow the load up to their rating, use stored reactants and make about 0.35 kg of
  water per kWh (approx.).
* Battery size check (Desk): watts × dark hours × 1.2 margin (G).
* Loads: avionics and cabin 1,400 W, plus 150 W per crew member, 300 W of heaters and the parts' own
  loads (G, plausible magnitudes). Conserve mode multiplies cabin and crew loads by 0.75.
* If the battery would go negative: instruments are shed, comms drop to low rate and conserve mode
  engages; any remaining shortfall is a "brownout" that hurts crew condition.
* Lander on the surface: its base load plus heaters and instruments, minus a 4 kW surface solar
  array if fitted (G; landings are in lunar daylight, and lunar night is not modelled).

## 6. Thermal

All electrical power becomes heat, plus 100 W of metabolic heat per crew member. If heat exceeds
the radiators' rejection capacity, instruments are switched off; a lasting overload hurts crew
condition. Real radiators depend on area, temperature and sun angle, which the game does not model.

## 7. Life support

Per astronaut per day (spec values, converted to kg once): oxygen 2.0 lb (G, inside NASA's
1.70-2.39 lb range), drinking water 5.5 lb (R, at least 2.5 L), hygiene water 2.2 lb (G),
food 5.27 lb (R, 2.39 kg packaged, NASA BVAD). Total 14.97 lb per astronaut per day.

Loaded consumables = crew × (mission days + tempo reserve days) × rate × (1 − recovery).
Regenerative life support recovers part of the water and oxygen. Running out of oxygen is fatal;
running out of water or food hurts crew condition.

## 8. Communications and data

* `Stored_next = clamp(Stored + Generated − Downlinked, 0, Capacity)`; anything over capacity is **lost**.
* Downlink rates: S-band 256 kbps-class, Ka-band 6 Mbps, laser 100 Mbps (G, in the right relative
  order). The laser link can be blocked by ground weather in 6-hour blocks, with an S-band backup.
* In LLO the Moon blocks Earth for 37% of each orbit (far-side loss of signal); the halo orbit
  keeps Earth in view. At the south pole, Earth is low on the horizon and the surface link
  is available only part of the time.
* Desk formula: MB per day = kbps × 86,400 × contact fraction ÷ 8,000.
* Signal delay = miles ÷ 186,282 miles per second (R): about 1.3 s at the Moon's average distance.

## 9. Landing

2-D point mass from about 520 m above the ground, after an automatic braking phase. Thrust = rated
thrust × throttle; mass flow `ṁ = F / vₑ`; lunar gravity 1.62 m/s². Touchdown at up to 3 m/s
vertical and 2 m/s sideways on clear ground is soft; up to 6 m/s vertical and 4 m/s sideways (or
landing on a hazard) is hard, with crew and equipment damage; faster, or over 3.5 m/s onto a hazard,
is a crash. Running out of propellant above 30 m fires an automatic abort to orbit. Terrain is generated
from the mission seed; terrain-relative navigation shows safe zones from altitude, and without it
hazards are visible only below about 110 m. Moon TWR check: thrust ÷ (mass × g₀ × 0.165) ≥ 1.

## 10. Surface operations

EVA hours per day come from the operations tempo (4 / 6 / 8 h). The lander battery drains for
every surface hour. Each instrument gives science points (G; 50 needed for full success), scaled by
the site's science value.

## 11. Re-entry

Heat-shield health = rating (mph) ÷ re-entry speed (mph), capped at 100%, minus damage from
emergencies. Coming home from the Moon means about 24,400 mph (R, Orion on Artemis I); from the ISS,
about 17,500 mph (R). 100% is a safe ride, 90-99% a rough ride (crew safety penalty), and under
90% a burn-through.

## 12. Emergencies and randomness

A seeded random generator draws emergency cards from a 16-card A/B/C deck (Easy: 3 cards, softened;
Hard: 5 cards) for the phases the mission flies through, weighted by the design's risks (for example
hydrogen tank leaks or hydrazine thrusters). Many cards are based on real events and name their
source in game (`src/data/cardSources.ts`). Random part failures ("reliability rolls") are **off**:
risk comes only from these emergencies. Same seed + same decisions = same mission.

## 13. Scoring (a game design, not NASA criteria)

Science 30%, crew safety and return 30%, engineering 20%, resource efficiency 10%, budget 10%.
A mission that loses the crew is never a success (score capped at 30). Any outcome other than full
success is capped at 79.

## 14. Known simplifications at a glance

| Simplification | Effect |
|---|---|
| Landing site does not change Δv | Polar sites are cheaper than in reality |
| Booster phase credits only the boosters' exhaust | Rockets with boosters look slightly better |
| No extra gravity loss for a weak upper stage | Upper-stage push is a learning note on preset rockets |
| Translunar coast always in sunlight; no lunar night on the surface | Power is easier than in reality |
| Radiators as a single capacity number | No sun-angle or temperature effects |
| Fixed docking fuel per docking (40 lb, G) | Piloting skill does not change thruster fuel use |
| All prices and science points are game values | Budget and score teach trade-offs, not real costs |

## Legacy model (reference only, `SPEC_MODEL = false`)

The original model had player-chosen engine, tank and heat-shield slots, site-dependent Δv
(LOI 900 / 930 / 1,050 m/s and TEI 950 / 980 / 1,100 m/s for Tranquility / Marius Hills / South Pole),
fictional launch-vehicle capacities, a heat-shield margin of rating × (8,000 kg / entry mass), and
optional reliability rolls. None of these run in the current game.
