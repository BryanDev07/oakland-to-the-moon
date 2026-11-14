# Scientific Assumptions & Simplified Models

OAKLAND TO THE MOON is an **educational game**, not a certified engineering tool. Every model
below is a deliberate simplification. Values marked **(INVENTED)** are gameplay-balance choices;
other values are rounded, order-of-magnitude figures drawn from widely published Apollo / Orion /
ISS-era numbers (see `SOURCES.md`). Nothing here is NASA-validated.

All simulation code lives in `src/simulation/` and uses SI units internally:
mass kg, velocity m/s, time s, power W, energy Wh, data MB (megabytes), data rate Mbps (megabits/s).

## 1. Mission architecture (abstracted Apollo-style)

| Phase | Performed by | Δv (m/s) | Notes |
|---|---|---|---|
| Launch + trans-lunar injection (TLI) | Launch vehicle | — | Modelled as "mass deliverable to TLI" capacity per rocket |
| Outbound trajectory corrections | Service module (SM) | 30 | Folded into the arrival burn |
| Lunar orbit insertion (LOI) | SM, full stack | 900 / 930 / 1050 | Equator / Marius Hills / South Pole (polar plane change costs more) |
| Orbit ops & rendezvous support | SM, CSM only | 40 | |
| Powered descent | Lander descent stage | 2250 / 2280 / 2320 | Braking from ~100 km orbit + 150 m/s reserved for the piloted final approach (Apollo LM descent stage: ~2,100 m/s planned of ~2,500 capability) |
| Ascent to rendezvous | Lander ascent stage | 1870 | Apollo LM ascent ≈ 1,850 m/s |
| Trans-Earth injection (TEI) | SM, CSM only | 950 / 980 / 1100 | |
| Return corrections | SM | 20 | |
| Entry | Heat shield | — | Margin model, below |

The two-stage lander leaves its descent stage on the Moon. With 3 crew, 2 land and 1 stays in the
capsule; with 4 crew, up to 3 land if the larger lander is chosen.

## 2. Rocket equation (`rocket.ts`)

`Δv = Isp · g0 · ln(m0 / mf)`, g0 = 9.80665 m/s².
Propellant for a burn: `m_prop = m0 · (1 − exp(−Δv / (Isp·g0)))`.
The design analysis (`spacecraft.ts`) runs the **staged burn sequence** with the actual mass at
each burn: the lander is carried through LOI, then departs; the crew and up to the lander's
sample capacity return to the capsule before TEI. Consumable depletion is ignored in the plan
(slightly conservative). The live simulation recomputes each burn from the current mass.

Engine values: hypergolic Isp 316 s (Apollo SPS-class); methalox 360 s (vacuum methane-oxygen
class) with +150 W cryocooler load (INVENTED magnitude). Lander Isp 311–316 s.

## 3. Masses

Capsule structure 5,000 kg + heat shield 600–850 kg (Apollo CM ≈ 5.6 t incl. shield).
SM structure 2,400 kg; tanks ≈ 7–7.5% of propellant mass. Crew 120 kg each incl. suit (INVENTED round number).
Scout lander ≈ 13.4 t fuelled (Apollo LM ≈ 15 t). Launch vehicle TLI capacities 38.5 / 45 / 56 t
are FICTIONAL rockets in the range between medium-lift and Saturn V-class (Saturn V ≈ 48 t to TLI).

## 4. Electrical power (`mission.ts → powerSnapshot`, `step`)

* Battery: `E_next = clamp(E + (P_gen − P_load)·Δt, 0, E_capacity)` with Δt = 300 s.
* Solar arrays produce their rated power in sunlight, **zero in shadow**. Translunar coast is
  treated as continuous sunlight. In low lunar orbit (period 7,080 s ≈ 118 min) the craft is in
  shadow 40% of each orbit (≈47 min, low beta angle; INVENTED fixed geometry).
* Design review uses **orbit-average** generation `P_solar × 0.6` vs. peak load.
* Fuel cells follow the load up to their rating, consume reactants (800 kWh stored) and produce
  0.35 kg of water per kWh (Apollo-era fuel cells produced roughly this order of magnitude).
* Loads: avionics/cabin 1,400 W + 150 W per crew + heaters 300 W + component loads (INVENTED but
  plausible magnitudes). Conserve mode multiplies cabin/crew loads by 0.75.
* If the battery would go negative: instruments are shed, comms drop to low-rate, conserve mode
  engages; any remaining deficit is a "brownout" that degrades crew condition.

## 5. Thermal

All electrical power ends as heat, plus 100 W metabolic heat per crew member. If heat exceeds
radiator rejection capacity (4 or 7 kW), instruments are switched off; persistent overload degrades
crew condition. (Real radiators depend on area, temperature and sun angle — not modelled.)

## 6. Life support

NASA BVAD-style planning rates (rounded): O₂ 0.84 kg, water 3.5 kg, food 1.8 kg per crew-day.
Consumables loaded = crew × (planned days + tempo reserve days) × rate × (1 − recovery).
Regenerative ECLSS recovers 85% water / 40% O₂ (ISS water recovery is ~90%+; O₂ recovery here is
a simplification). Running out of O₂ is fatal; running out of water or food degrades condition.

## 7. Communications & data

* `Stored_next = clamp(Stored + Generated − Downlinked, 0, Capacity)`; overflow is **lost**.
* Downlink: S-band 0.5 Mbps, high-gain 6 Mbps, optical 100 Mbps (INVENTED round numbers in the
  right relative order). Optical link is blocked by ground weather in 6-hour blocks (65% clear,
  seeded) with an S-band backup.
* In lunar orbit the Moon blocks Earth 38% of each orbit (far-side loss of signal). The phase of
  LOS is offset from the shadow phase. South-pole surface link availability 55% (Earth low on the horizon).
* Mapping camera: 40 Mbps, only images in sunlight; full mapping credit = 144 GB secured
  (8 h of sunlit imaging). Data still on the recorder at splashdown counts as secured.

## 8. Landing (`landing.ts`)

2-D point mass from ~520 m altitude after an automatic braking phase. Thrust = rated thrust ×
throttle; mass flow `ṁ = F / (Isp·g0)`; lunar gravity 1.62 m/s². Touchdown: < 3 m/s vertical and
< 2 m/s horizontal on flat, boulder-free ground = soft; up to 6 m/s = hard (crew/equipment
damage); faster = crash. Out of propellant above 30 m triggers an automatic abort-to-orbit.
Terrain, craters and boulders are procedurally generated from the mission seed. Terrain-relative
navigation (TRN) reveals safe zones from altitude; without it, hazards are visible only below ~110 m.

## 9. Surface operations

EVA hours per day come from the operations tempo (4/6/8 h). The lander battery drains at its base
load (+250 W heaters at the pole) for every surface hour. Samples add mass to the ascent stage:
the ascent check uses the rocket equation and can force the crew to leave samples behind.

## 10. Entry

Effective heat-shield margin = rating × (8,000 kg / entry mass) (INVENTED scaling). Propulsion
anomalies can increase entry dispersion (heat-load factor up to 1.1). Entry fails only if the
dispersion exceeds the margin — rare by design, but explainable.

## 11. Events & randomness

A seeded PRNG (mulberry32) schedules up to three events (outbound, lunar orbit, return) from the
eligible pool, weighted by the design (e.g. methalox → more propellant anomalies; no redundancy →
more avionics trouble; laser comms → more weather outages). The launch vehicle has a
`(1 − reliability) × 12` chance of a 45 m/s TLI shortfall that the SM must make up. Same seed +
same decisions = same mission.

## 12. Scoring (game design, not NASA criteria)

Science 30%, crew safety & return 30%, engineering 20%, resource efficiency 10%, budget 10%.
A mission that does not return the crew is never a success (score capped at 30); any outcome
other than full success is capped at 79.
