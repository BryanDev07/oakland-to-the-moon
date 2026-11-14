# Sources & References

Every **R** (real) value in the game comes from one of the sources below; **G** values are game
choices, documented with their simplifications in `docs/SCIENTIFIC_ASSUMPTIONS.md`. The tags live
next to each number in `src/data/specParts.ts`, and the in-game **Science library** (pause menu →
LIBRARY) shows every formula and part value with its tag and a link to its source.

The links were collected in the project spec (`JOSEPH_SPEC.md`, tab 8) and were not re-fetched while
the code was written; please report any link that has moved.

## Challenge
- 2026 NASA Space Apps Challenge — Space Mission Design Game: https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/
- NASA, *Design and Develop a Science Mission*: https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf
- NASA Goddard Mission Design Lab: https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/
- NASA General Mission Analysis Tool (GMAT): https://software.nasa.gov/software/GSC-19468-1
- NASA Mission Viz: https://nasa.github.io/mission-viz/
- NASA CubeSat Launch Initiative, *CubeSat 101*: https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf
- NASA Webb "Build It Yourself: Satellite!": https://science.nasa.gov/mission/webb/game-build-it-yourself/
- JPL Concept Maturity Levels: https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299

## Moon mission
| Source | Used for |
|---|---|
| NASA: Space Launch System — https://www.nasa.gov/reference/space-launch-system/ | SLS-like rocket, 5-segment boosters (16,000,000 N), weight at liftoff, thrust-to-weight |
| NASA: Orion quick facts — https://www.nasa.gov/wp-content/uploads/2015/06/fs-2014-08-004-jsc-orion_quickfacts-web.pdf | Orion: 4 crew, 21 days, module weights, 26,700 N engine, 11 kW solar |
| NASA: Moon fact sheet — https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html | Moon gravity (0.165 of Earth's), distance (238,855 mi), signal delay |
| NASA: Why NRHO, the Artemis orbit — https://nasa.gov/wp-content/uploads/2023/10/acr22-wp-why-nrho-the-artemis-orbit.pdf | Halo orbit: constant contact, ~6.5-day period, 430 / 410 m/s burns |
| Wikipedia: Delta-v budget — https://en.wikipedia.org/wiki/Delta-v_budget | 9,400 m/s to Earth orbit, 3,200 m/s to the Moon, low-orbit and landing Δv |
| Wikipedia: Apollo Lunar Module — https://en.wikipedia.org/wiki/Apollo_Lunar_Module | Apollo LM and Extended LM weights, fuel, engines, stay times |
| Spaceflight Now: Artemis I back on Earth — https://spaceflightnow.com/2022/12/11/artemis-1-back-on-earth-after-near-flawless-25-day-moon-mission/ | Re-entry at 24,400+ mph, 5,000 °F (heat shield rule) |

## Life support and safety
| Source | Used for |
|---|---|
| NASA OCHMO life support brief — https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf | Oxygen 1.70–2.39 lb/day range, drinking water at least 2.5 L/day |
| NASA NTRS paper citing the BVAD — https://ntrs.nasa.gov/api/citations/20190027563/downloads/20190027563.pdf | Food 5.27 lb (2.39 kg) per person-day |
| Space.com on NASA's crew safety requirement — https://www.space.com/38994-nasa-commercial-crew-providers-safety-requirements.html | 1-in-270 loss-of-crew target (risk table) |

## Rockets, engines and parts
| Source | Used for |
|---|---|
| SpaceX Falcon 9 — https://new.spacex.com/vehicles/falcon-9 | Falcon-class rocket |
| Wevolver: Falcon 9 stage data — https://wevolver.com/specs/falcon-9-v12-or-full-thrust-block-5 | Tank factor k = 0.054 (aluminum-lithium) |
| Wikipedia: SpaceX Merlin — https://en.wikipedia.org/wiki/SpaceX_Merlin | Merlin 1D / Vacuum weight, thrust, exhaust speeds |
| Blue Origin: New Glenn — https://www.blueorigin.com/new-glenn | BE-4 thrust |
| ULA: Vulcan Centaur — https://www.ulalaunch.com/docs/default-source/rockets/vulcancentaur.pdf | GEM 63XL boosters, Centaur V steel tanks |
| L3Harris RL10 spec sheet — https://l3harris.com/sites/default/files/2024-07/l3harris-ar-rl10-spec-sheet.pdf | RL10: 664 lb, 110,100 N, 4,530 m/s |
| NASA RS-25 fact sheet — https://www.nasa.gov/wp-content/uploads/2020/09/final_sls_rs25_fact_sheet_508_07312015.pdf | RS-25: 7,775 lb |
| L3Harris monopropellant thrusters — https://www.l3harris.com/sites/default/files/2025-10/l3harris-ar-monopropellant-rocket-engines.pdf | Maneuvering thrusters; hydrazine 8.52 lb/gal |
| Wikipedia: SpaceX Draco — https://en.wikipedia.org/wiki/SpaceX_Draco | Draco thruster |
| Wikipedia: NASA Docking System — https://en.wikipedia.org/wiki/NASA_Docking_System | Docking ports |
| ArianeGroup propellant tanks — https://space-propulsion.com/spacecraft-propulsion/bipropellant-tanks/index.html | Thruster tanks |
| Antrix 516 L tank — https://satsearch.co/products/antrix-516l-propellant-tank | Thruster tanks |
| ST-16RT2 star tracker — https://satsearch.co/products/sinclair-interplanetary-second-generation-star-tracker-st-16rt2 | Guidance parts |
| ST200 star tracker — https://satsearch.co/products/berlin-space-tech-st200 | Guidance parts |
| IMU-P4 — https://satsearch.co/products/space-inventor-imu-p4 | Guidance parts |
| Northrop Grumman: Cygnus fact sheet — https://cdn.northropgrumman.com/-/media/wp-content/uploads/Cygnus-Fact-Sheet-1.pdf?v=1.0.0 | UltraFlex 3.5 kW solar array |

## Formulas (science library)
| Source | Used for |
|---|---|
| Wikipedia: Tsiolkovsky rocket equation — https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation | Speed gained, fuel needed, fuel used by a burn |
| NASA Glenn: Specific impulse — https://www.grc.nasa.gov/www/k-12/airplane/specimp.html | Exhaust speed = Isp × 9.81 |
| Wikipedia: Pound (force) — https://en.wikipedia.org/wiki/Pound_(force) | 1 lb of weight = 4.448 N |

## Emergency deck and risk table (real events)
| Card | Source |
|---|---|
| 1. Engine out during launch | SpaceX CRS-1 engine-out, 2012 (NASASpaceflight) — https://www.nasaspaceflight.com/2012/10/dragon-iss-spacex-review-falcon-9-ascent-issues/ |
| 2. Lightning strike after liftoff | Apollo 12, 1969 (Space.com) — https://www.space.com/apollo-12-lightning-strike-twice-launch-video.html |
| 4. Oxygen tank failure | Apollo 13 (History.com) — https://www.history.com/this-day-in-history/apollo-13-oxygen-tank-explodes |
| 5. CO₂ filters clogging | Apollo 13 (Planetary Society) — https://www.planetary.org/space-missions/apollo-13 |
| 7, 8. Computer alarms during landing; low fuel on final approach | Apollo 11 (Space.com) — https://www.space.com/26593-apollo-11-moon-landing-scariest-moments.html |
| 11. Small cabin leak | Soyuz MS-09, 2018 (NBC News) — https://www.nbcnews.com/mach/science/astronauts-use-gauze-high-tech-tape-plug-hole-iss-ncna905326 |
| 12. Thrusters failing during docking | Starliner, 2024 (Space.com) — https://www.space.com/nasa-boeing-starliner-astronauts-will-return-on-spacex-dragon-2025 |
| 16. Hydrogen leak while fueling | Artemis I scrub, 2022 (Space.com) — https://www.space.com/artemis-1-launch-scrub-hydrogen-leak |
| Risk table: composite hydrogen tank | X-33, 1999 (Wikipedia) — https://en.wikipedia.org/wiki/Lockheed_Martin_X-33 |
| Risk table: carbon bottle in liquid oxygen | 2016 Falcon 9 pad explosion (CompositesWorld) — https://compositesworld.com/articles/spacex-announces-copvs-role-in-sept-rocket-explosion |

Cards **3, 6, 9, 10, 14 and 15** are made up but realistic: the game labels them
"Scenario (made up, realistic)", never "this really happened". Card **13** (loss of signal behind
the Moon) is labelled "Real effect": it is physics, not a single event.

## How the game uses these concepts
- **Segments** (launch, space, ground, science) frame the briefing and the design review.
- **Trade studies**: every component changes weight, cost, power, heat and capability at once.
- **Margins**: speed, launch weight, power, battery, thermal and budget margins are checked before launch.
- **Concept maturity**: the hangar → desk → review → flight loop mirrors iterating a concept until it passes review.

## Assets
All art, music and sound effects are original and generated by code in this repository
(`scripts/generate-assets/`, `src/game/audio/`). No third-party assets, fonts or logos are used.
This project is not affiliated with or endorsed by NASA.
