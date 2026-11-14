/**
 * Physical constants and mission-architecture parameters.
 * All values SI unless suffixed (Wh = watt-hours, MB = megabytes, Mbps = megabits/s).
 * See docs/SCIENTIFIC_ASSUMPTIONS.md for sources and simplifications.
 */
export const G0 = 9.80665; // m/s^2, standard gravity (defines Isp in seconds)
export const MOON_G = 1.62; // m/s^2, lunar surface gravity
export const SIM_DT = 300; // s, fixed simulation timestep for coast phases
export const HOUR = 3600;
export const DAY = 86400;

/** Transfer durations (Apollo-class translunar coast ~3 days each way). */
export const TRANSIT_OUT_S = 3 * DAY;
export const TRANSIT_BACK_S = 3 * DAY;
export const FREE_RETURN_S = 3.5 * DAY;

/** Low lunar orbit (~100 km circular): period and geometry fractions. */
export const LLO_PERIOD_S = 7080; // ~118 min
export const LLO_SHADOW_FRACTION = 0.4; // ~47 min of 118 in umbra at low beta angle
export const LLO_LOS_FRACTION = 0.38; // far-side loss of signal with Earth
export const LLO_LOS_CENTER = 0.42; // offset vs. shadow centre (orbit phase)

/** Delta-v allocations not dependent on landing site (m/s). */
export const DV_TCM_OUT = 30; // outbound trajectory correction maneuvers
export const DV_ORBIT_OPS = 40; // lunar-orbit maintenance + rendezvous support by CSM
export const DV_TCM_BACK = 20; // return trajectory corrections
export const DV_ASCENT = 1870; // lunar surface -> rendezvous orbit (Apollo LM ascent ~1,850 m/s)
export const DV_FINAL_APPROACH = 150; // portion of descent budget allocated to the pilot-controlled final approach

/** Crew & life support (NASA BVAD-style planning rates, rounded). */
export const CREW_MASS_KG = 120; // astronaut + suit + personal kit
export const O2_KG_PER_CREW_DAY = 0.84;
export const WATER_KG_PER_CREW_DAY = 3.5;
export const FOOD_KG_PER_CREW_DAY = 1.8;
export const METABOLIC_HEAT_W = 100; // per crew member
export const EVA_O2_KG_PER_HOUR = 0.075; // suit O2 use per crew per EVA hour (incl. leakage)

/** Spacecraft baseline (fixed architecture). */
export const CAPSULE_DRY_KG = 5000; // crew module structure, seats, avionics core (heat shield separate)
export const SM_STRUCTURE_KG = 2400; // service module structure, plumbing, RCS (engine/tanks separate)
export const CAPSULE_COST_M = 1300;
export const SM_BASE_COST_M = 450;
export const OPS_COST_M_PER_DAY = 10;
export const BUDGET_M = 5800; // fictional program budget, $ millions

/** Baseline electrical loads (W). */
export const BASE_LOAD_W = 1400; // avionics, cabin fans, lighting, displays
export const CREW_LOAD_W = 150; // per crew (galley, hygiene, suit loops)
export const HEATER_LOAD_W = 300; // thermal-control heaters
export const CONSERVE_FACTOR = 0.75; // base+crew loads multiplier in conserve mode
export const SAFE_MODE_LOAD_W = 1800; // loads that cannot be shed (used for battery-reserve check)
export const BATTERY_MIN_SOC = 0.0;

/** Science data. */
export const MAPCAM_MAP_TARGET_MB = 144000; // 8 h of sunlit imaging at 40 Mbps
export const NEUTRON_TARGET_H = 10;

export const PROGRAM = 'Pacific Space Exploration Agency (fictional)';
export const MISSION_NAME = 'TOWN-1';
