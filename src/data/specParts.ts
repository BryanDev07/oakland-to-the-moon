/**
 * Joseph's Build Notes (JOSEPH_SPEC.md, tabs 2-4 and 6-7) as game data.
 * Every number carries its tag: R = real / published (NASA, maker, or published source),
 * G = game value (tunable). Units here are the spec's: weight lb, thrust N, speed m/s, money USD.
 * The simulation converts lb -> kg once at its boundary (see src/simulation/units.ts).
 */
export type Tag = 'R' | 'G';
export interface Val { v: number; tag: Tag; note?: string }
export const R = (v: number, note?: string): Val => ({ v, tag: 'R', note });
export const G = (v: number, note?: string): Val => ({ v, tag: 'G', note });

// ---------------------------------------------------------------------------- propellants (tab 3 §4)
export type FuelId = 'kerolox' | 'methalox' | 'hydrolox' | 'solid';
export interface PropellantSpec { id: FuelId; name: string; short: string; veRange: [Val, Val]; densityLbFt3: Val; priceUsdPerLb: Val | null; tankMult: Val }
export const PROPELLANTS: Record<FuelId, PropellantSpec> = {
  kerolox: { id: 'kerolox', name: 'Kerosene + liquid oxygen', short: 'kerosene + LOX', veRange: [R(2770), R(3410)], densityLbFt3: G(64.3, 'untagged in spec'), priceUsdPerLb: G(0.27), tankMult: G(1) },
  methalox: { id: 'methalox', name: 'Methane + liquid oxygen', short: 'methane + LOX', veRange: [G(3240, 'approx.'), G(3530, 'approx.')], densityLbFt3: G(51.8, 'untagged in spec'), priceUsdPerLb: G(0.18), tankMult: G(1.1) },
  hydrolox: { id: 'hydrolox', name: 'Hydrogen + liquid oxygen', short: 'hydrogen + LOX', veRange: [R(4410), R(4560)], densityLbFt3: G(22, 'approx.'), priceUsdPerLb: G(1.36), tankMult: G(1.5, 'hydrogen tanks are bulky') },
  solid: { id: 'solid', name: 'Solid', short: 'solid', veRange: [G(2450, 'approx.'), G(2650, 'approx.')], densityLbFt3: G(112, 'approx.'), priceUsdPerLb: null, tankMult: G(1) },
};

// ---------------------------------------------------------------------------- rocket engines (tab 3 §1)
export interface EngineSpec {
  id: string; name: string; stage: 1 | 2; weightLb: Val; thrustN: Val; veMs: Val;
  veSeaLevel?: Val; veVacuum?: Val; fuel: FuelId; priceUsd: Val; trap?: boolean; note?: string;
}
export const ENGINES: EngineSpec[] = [
  { id: 'merlin1d', name: 'Merlin 1D (SpaceX)', stage: 1, weightLb: R(1036), thrustN: R(845000, 'sea level'), veMs: G(2910, 'average of sea level and vacuum: stage 1 flies through both'), veSeaLevel: R(2770), veVacuum: R(3050), fuel: 'kerolox', priceUsd: G(1_000_000) },
  { id: 'be4', name: 'BE-4 (Blue Origin)', stage: 1, weightLb: G(4630, 'not published'), thrustN: R(2_846_000), veMs: G(3190), fuel: 'methalox', priceUsd: G(8_000_000) },
  { id: 'rs25', name: 'RS-25 (SLS core)', stage: 1, weightLb: R(7775), thrustN: G(1_860_000, 'liftoff value in game; 2,277,000 N max in vacuum (R)'), veMs: G(4010, 'average; about 3,590 sea level to 4,430 vacuum (approx.)'), fuel: 'hydrolox', priceUsd: G(100_000_000) },
  { id: 'rutherford', name: 'Rutherford (Rocket Lab)', stage: 1, weightLb: G(77), thrustN: R(21_000), veMs: R(3050), fuel: 'kerolox', priceUsd: G(500_000) },
  { id: 'mvac', name: 'Merlin Vacuum', stage: 2, weightLb: G(1000, 'not published'), thrustN: R(981_000), veMs: R(3410), fuel: 'kerolox', priceUsd: G(1_500_000) },
  { id: 'rl10', name: 'RL10', stage: 2, weightLb: R(664, 'range 370-664 lb; game uses 664'), thrustN: R(110_100, 'on SLS'), veMs: R(4530, 'range 4,410-4,560; game uses 4,530'), fuel: 'hydrolox', priceUsd: G(15_000_000) },
  { id: 'rvac', name: 'Rutherford Vacuum', stage: 2, weightLb: G(77), thrustN: G(26_000), veMs: R(3360), fuel: 'kerolox', priceUsd: G(600_000) },
  { id: 'merlin1d_s2', name: 'Merlin 1D, sea-level nozzle (stage 2)', stage: 2, weightLb: R(1036), thrustN: G(981_000), veMs: R(3050), fuel: 'kerolox', priceUsd: G(1_000_000), trap: true, note: 'Cheaper, but its short nozzle wastes energy in space.' },
];
export const ENGINE_BY_ID: Record<string, EngineSpec> = Object.fromEntries(ENGINES.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------- solid boosters (tab 3 §2)
export interface BoosterSpec { id: string; name: string; weightLb: Val; fuelLb: Val; thrustN: Val; veMs: Val; priceUsd: Val; max: number }
export const BOOSTERS: BoosterSpec[] = [
  { id: 'sls_srb', name: 'SLS 5-segment booster', weightLb: R(1_600_000), fuelLb: G(1_390_000), thrustN: R(16_000_000, '3.6 million lbf'), veMs: G(2500), priceUsd: G(120_000_000), max: 4 },
  { id: 'gem63xl', name: 'GEM 63XL (Vulcan)', weightLb: G(108_000), fuelLb: G(97_000), thrustN: G(2_000_000), veMs: G(2650), priceUsd: G(15_000_000), max: 6 },
];
export const BOOSTER_BY_ID: Record<string, BoosterSpec> = Object.fromEntries(BOOSTERS.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------- tank materials (tab 3 §3)
export type MaterialId = 'alli' | 'al2219' | 'steel' | 'carbon';
export interface MaterialSpec { id: MaterialId; name: string; k: Val; costUsdPerLb: Val; reliability: Val; usedOn: string }
/** Reliability is library data only: reliability rolls are OFF (see RELIABILITY_ROLLS). */
export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  alli: { id: 'alli', name: 'Aluminum-lithium 2195', k: R(0.054, 'matches Falcon 9'), costUsdPerLb: G(907), reliability: G(0.995), usedOn: 'Falcon 9 (R)' },
  al2219: { id: 'al2219', name: 'Aluminum 2219', k: G(0.071), costUsdPerLb: G(680), reliability: G(0.995), usedOn: 'Saturn V' },
  steel: { id: 'steel', name: 'Stainless steel', k: G(0.083), costUsdPerLb: G(227), reliability: G(0.998), usedOn: 'Centaur V (R), Starship' },
  carbon: { id: 'carbon', name: 'Carbon fiber', k: G(0.042), costUsdPerLb: G(1361), reliability: G(0.985), usedOn: 'Electron (R)' },
};

// ---------------------------------------------------------------------------- material + fuel risks (tab 3 §3)
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type FixId = 'liner' | 'leakCheck' | 'foamInspection' | 'titaniumTanks' | 'spareSeal';
export interface FixSpec { id: FixId; name: string; costUsd: Val; tankWeightMult?: Val; padDays?: Val; dockingHours?: Val; weightLb?: Val }
export const FIXES: Record<FixId, FixSpec> = {
  liner: { id: 'liner', name: 'Metal liner in carbon-fiber tanks', costUsd: G(5_000_000), tankWeightMult: G(1.1) },
  leakCheck: { id: 'leakCheck', name: 'Pad leak check', costUsd: G(2_000_000), padDays: G(3) },
  foamInspection: { id: 'foamInspection', name: 'Foam inspection', costUsd: G(1_000_000) },
  titaniumTanks: { id: 'titaniumTanks', name: 'Titanium thruster tanks + spaced firings', costUsd: G(0, 'pick the OST 24/0 titanium tank'), dockingHours: G(1) },
  spareSeal: { id: 'spareSeal', name: 'Spare hatch seal', costUsd: G(2_000_000), weightLb: G(15) },
};
export interface RiskSpec { id: string; combo: string; level: RiskLevel; why: string; fix: string; fixId: FixId | null; fixedLevel: RiskLevel | null }
export const RISKS: Record<string, RiskSpec> = {
  carbon_h2: { id: 'carbon_h2', combo: 'Carbon fiber + hydrogen', level: 'High', why: 'Super-cold hydrogen made a composite tank crack and peel apart during testing for NASA\'s X-33 in 1999 (R).', fix: 'Use aluminum-lithium for the hydrogen tank. Or keep carbon fiber and add a metal liner (+10% tank weight, +$5,000,000), which drops the risk to Medium.', fixId: 'liner', fixedLevel: 'Medium' },
  carbon_lox: { id: 'carbon_lox', combo: 'Carbon fiber + liquid oxygen', level: 'Medium', why: 'Liquid oxygen can crack some composites and even make them ignite on impact. A carbon-wrapped bottle inside a liquid-oxygen tank caused the 2016 Falcon 9 pad explosion (R).', fix: 'Make the oxygen tank metal and use carbon fiber elsewhere, or add a metal liner (+10% tank weight, +$5,000,000).', fixId: 'liner', fixedLevel: 'Low' },
  any_h2: { id: 'any_h2', combo: 'Any material + hydrogen', level: 'Medium', why: 'Hydrogen is the smallest molecule, so it slips through tiny gaps in seals. Leaks scrubbed Artemis I twice in 2022 (R).', fix: 'Buy a pad leak check (+$2,000,000, +3 days). It drops the risk to Low.', fixId: 'leakCheck', fixedLevel: 'Low' },
  alli_h2: { id: 'alli_h2', combo: 'Aluminum-lithium + hydrogen', level: 'Low', why: 'Flown on the Space Shuttle tank and SLS (R). The main risk is insulating foam breaking off.', fix: 'Pay for a foam inspection (+$1,000,000).', fixId: 'foamInspection', fixedLevel: null },
  steel_ch4: { id: 'steel_ch4', combo: 'Stainless steel + methane', level: 'Low', why: 'Steel gets stronger when super-cold and handles heat well (Starship).', fix: 'Nothing needed. The cost is weight: you\'ll need more fuel.', fixId: null, fixedLevel: null },
  al2219_rp1: { id: 'al2219_rp1', combo: 'Aluminum 2219 + kerosene', level: 'Low', why: 'The Saturn V first-stage combo (R).', fix: 'Nothing needed.', fixId: null, fixedLevel: null },
  hydrazine: { id: 'hydrazine', combo: 'Hydrazine/MMH thrusters', level: 'Medium', why: 'Toxic, and thrusters can overheat when fired a lot in a row, like Starliner\'s in 2024 (R).', fix: 'Use titanium thruster tanks and space out firings (docking takes +1 hour).', fixId: 'titaniumTanks', fixedLevel: 'Low' },
};

// ---------------------------------------------------------------------------- crew capsules (tab 3 §5)
export interface CapsuleSpec {
  id: string; name: string; crew: Val; cmLb: Val; smLb: Val; smFuelLb: Val; maxDays: Val; shieldMph: Val; solarW: Val;
  engineThrustN: Val; veMs: Val; priceUsd: Val; trap?: boolean;
}
export const CAPSULES: CapsuleSpec[] = [
  { id: 'cap_orion', name: 'Orion (NASA)', crew: R(4), cmLb: R(22_900), smLb: R(34_300), smFuelLb: G(19_000, 'approx.'), maxDays: R(21), shieldMph: G(25_000, 'R: 24,400+ mph on Artemis I'), solarW: R(11_000), engineThrustN: R(26_700, '6,000 lbf'), veMs: G(3100), priceUsd: G(900_000_000) },
  { id: 'cap_apollo', name: 'Apollo-class CSM', crew: G(3), cmLb: G(12_800), smLb: G(53_600), smFuelLb: G(40_600), maxDays: G(14), shieldMph: G(25_000, 'lunar'), solarW: G(0), engineThrustN: G(91_200, '20,500 lbf'), veMs: G(3080), priceUsd: G(600_000_000) },
  { id: 'cap_budget', name: 'Budget LEO capsule', crew: G(4), cmLb: G(9_000), smLb: G(10_000), smFuelLb: G(6_000), maxDays: G(7), shieldMph: G(17_500, 'Earth-orbit only'), solarW: G(0), engineThrustN: G(17_800, '4,000 lbf'), veMs: G(2940), priceUsd: G(250_000_000), trap: true },
];
export const CAPSULE_BY_ID: Record<string, CapsuleSpec> = Object.fromEntries(CAPSULES.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------- landers (tab 3 §6)
export interface LanderSpec {
  id: string; name: string; crew: Val; totalLb: Val; descentFuelLb: Val; ascentFuelLb: Val; descentDryLb: Val; ascentDryLb: Val;
  descentThrustN: Val; ascentThrustN: Val; veMs: Val; maxStayH: Val; priceUsd: Val;
}
export const LANDERS: LanderSpec[] = [
  { id: 'lander_apollo', name: 'Apollo LM', crew: R(2), totalLb: R(33_500), descentFuelLb: R(18_000), ascentFuelLb: R(5_187), descentDryLb: R(4_783), ascentDryLb: R(5_113), descentThrustN: R(45_040), ascentThrustN: R(15_570), veMs: R(3050), maxStayH: R(48), priceUsd: G(400_000_000) },
  { id: 'lander_xlm', name: 'Extended LM (Apollo 15-17)', crew: R(2), totalLb: R(36_200), descentFuelLb: G(20_500, 'game split'), ascentFuelLb: G(5_187, 'game split'), descentDryLb: G(5_200), ascentDryLb: G(5_313), descentThrustN: R(45_040), ascentThrustN: R(15_570), veMs: R(3050), maxStayH: R(75), priceUsd: G(480_000_000) },
  { id: 'lander_hls', name: 'Large lander (HLS-class)', crew: G(4), totalLb: G(144_000), descentFuelLb: G(90_000), ascentFuelLb: G(24_000), descentDryLb: G(18_000), ascentDryLb: G(12_000), descentThrustN: G(266_900), ascentThrustN: G(111_200), veMs: G(3240), maxStayH: G(168, '7 days'), priceUsd: G(1_200_000_000) },
];
export const LANDER_SPEC_BY_ID: Record<string, LanderSpec> = Object.fromEntries(LANDERS.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------- docking (tab 3 §7)
export interface SmallPart { id: string; name: string; weightLb: Val | null; powerW?: Val; priceUsd: Val; note?: string }
export const DOCKING: SmallPart[] = [
  { id: 'dock_nds', name: 'NASA Docking System', weightLb: G(661, '~661 lb'), powerW: G(200), priceUsd: G(20_000_000), note: '31.5 in hatch (R); used by Orion, Dragon, Starliner (R). Needed for crew to move between capsule and lander.' },
  { id: 'dock_lidar', name: 'Docking lidar', weightLb: G(22, '~22 lb'), powerW: G(50), priceUsd: G(3_000_000), note: 'Measures distance to the target. Required for docking.' },
];

// ---------------------------------------------------------------------------- thrusters and tanks (tab 3 §8)
export interface ThrusterSpec { id: string; name: string; weightLb: Val | null; thrustN: [Val, Val]; veMs: [Val, Val]; priceUsd: Val }
export const THRUSTERS: ThrusterSpec[] = [
  { id: 'rcs_draco', name: 'Draco thruster (SpaceX)', weightLb: null, thrustN: [R(400), R(400)], veMs: [R(2940), R(2940)], priceUsd: G(1_000_000) },
  { id: 'rcs_mr107s', name: 'MR-107S hydrazine (L3Harris)', weightLb: R(2.23), thrustN: [R(100), R(360)], veMs: [R(2280), R(2320)], priceUsd: G(400_000) },
  { id: 'rcs_mr104g', name: 'MR-104G hydrazine (L3Harris)', weightLb: R(12), thrustN: [R(470), R(780)], veMs: [R(2180), R(2240)], priceUsd: G(800_000) },
];
export interface ThrusterTankSpec { id: string; name: string; weightLb: Val; gallons: Val; priceUsd: Val; titanium: boolean }
export const THRUSTER_TANKS: ThrusterTankSpec[] = [
  { id: 'tank_antrix516', name: 'Antrix 516 L tank', weightLb: R(57), gallons: R(136), priceUsd: G(500_000), titanium: false },
  { id: 'tank_ost24', name: 'OST 24/0 titanium tank', weightLb: R(116), gallons: R(319), priceUsd: G(900_000), titanium: true },
];
export const MIN_THRUSTERS = G(8, 'needed to turn and move in every direction');

// ---------------------------------------------------------------------------- power (tab 3 §9)
export const POWER_PARTS = {
  orionArrays: { name: 'Orion solar arrays (built in)', powerW: R(11_000) },
  ultraflex: { name: 'UltraFlex arrays, pair (Cygnus)', weightLb: G(400, '~400 lb'), powerW: R(3_500), priceUsd: G(10_000_000) },
  liionPack: { name: '5 kWh Li-ion pack', weightLb: G(110), storesWh: G(5_000), priceUsd: G(1_500_000) },
  landerSolar: { name: 'Lander surface solar array', weightLb: G(400), powerW: G(4_000, 'lunar daylight only'), priceUsd: G(15_000_000) },
};

// ---------------------------------------------------------------------------- communications (tab 3 §10)
export const RADIOS: SmallPart[] = [
  { id: 'com_sband', name: 'Deep-space S-band (NASA Deep Space Network)', weightLb: G(40), powerW: G(60), priceUsd: G(10_000_000) },
  { id: 'com_hga', name: 'Deep-space Ka-band', weightLb: G(80), powerW: G(150), priceUsd: G(25_000_000) },
  { id: 'com_laser', name: 'Laser comms terminal', weightLb: G(60), powerW: G(100), priceUsd: G(40_000_000) },
];
export const RADIO_KBPS: Record<string, Val> = { com_sband: G(256), com_hga: G(6_000), com_laser: G(100_000) };

// ---------------------------------------------------------------------------- navigation (tab 3 §11)
export const NAV: (SmallPart & { kind: 'tracker' | 'imu' | 'computer' })[] = [
  { id: 'nav_st16', name: 'ST-16RT2 star tracker', kind: 'tracker', weightLb: R(0.52, 'range 0.35-0.52 lb'), powerW: R(0.5, 'under 0.5 W avg'), priceUsd: G(100_000) },
  { id: 'nav_st200', name: 'ST200 star tracker', kind: 'tracker', weightLb: R(0.23, 'range 0.09-0.23 lb'), powerW: R(0.67, 'range 0.55-0.67 W'), priceUsd: G(60_000) },
  { id: 'nav_imu', name: 'IMU-P4 motion sensor', kind: 'imu', weightLb: R(0.33), powerW: R(0.2), priceUsd: R(6_600) },
  { id: 'nav_obc', name: 'Onboard computer (EnduroSat)', kind: 'computer', weightLb: R(0.27), powerW: G(1, '~1 W'), priceUsd: R(12_400) },
];

// ---------------------------------------------------------------------------- life support (tab 3 §12)
export const LIFE_SUPPORT_LB = {
  oxygen: G(2.0, "inside NASA's 1.70-2.39 lb range (R)"),
  drinkingWater: R(5.5, 'at least 2.5 L'),
  hygieneWater: G(2.2),
  food: R(5.27, '2.39 kg packaged (BVAD)'),
};
export const SUPPLIES_LB_PER_CREW_DAY = LIFE_SUPPORT_LB.oxygen.v + LIFE_SUPPORT_LB.drinkingWater.v + LIFE_SUPPORT_LB.hygieneWater.v + LIFE_SUPPORT_LB.food.v; // 14.97
export const ASTRONAUT_SUIT_LB = G(400);

// ---------------------------------------------------------------------------- science instruments (tab 4, all G)
export interface InstrumentSpec { id: string; name: string; what: string; weightLb: Val; powerW: Val; mbPerDay: Val; points: Val; priceUsd: Val; rockLb?: Val }
export const INSTRUMENTS: InstrumentSpec[] = [
  { id: 'sci_seismo', name: 'Passive seismometer', what: 'Listens for moonquakes and meteor hits, like a microphone in the ground.', weightLb: G(25), powerW: G(10), mbPerDay: G(50), points: G(20), priceUsd: G(20_000_000) },
  { id: 'sci_retro', name: 'Laser retroreflector', what: "A mirror that bounces lasers from Earth to measure the Moon's distance. Apollo 11's is still used.", weightLb: G(50), powerW: G(0), mbPerDay: G(0), points: G(15), priceUsd: G(10_000_000) },
  { id: 'sci_samples', name: 'Sample return kit', what: 'Tools and boxes to bring home 100 lb of Moon rock.', weightLb: G(30), powerW: G(0), mbPerDay: G(0), points: G(30), priceUsd: G(15_000_000), rockLb: G(100) },
  { id: 'sci_drill', name: 'Core drill', what: 'Drills a few feet down to sample buried layers.', weightLb: G(60), powerW: G(300), mbPerDay: G(20), points: G(20), priceUsd: G(25_000_000) },
  { id: 'sci_gpr', name: 'Ground-penetrating radar', what: "Maps what's under the surface.", weightLb: G(40), powerW: G(80), mbPerDay: G(2_000), points: G(15), priceUsd: G(30_000_000) },
  { id: 'sci_pancam', name: 'HD science cameras', what: 'Video and photos of the site.', weightLb: G(15), powerW: G(30), mbPerDay: G(5_000), points: G(10), priceUsd: G(5_000_000) },
  { id: 'sci_rover', name: 'Lunar rover', what: 'Lets the crew drive miles from the lander, like Apollo 15-17.', weightLb: G(460, 'approx.'), powerW: G(500), mbPerDay: G(100), points: G(25), priceUsd: G(60_000_000) },
];
export const SCIENCE_TARGET_POINTS = G(50);

// ---------------------------------------------------------------------------- mission (tab 2) and orbits
export const MISSION_DV = {
  earthOrbit: R(9_400, 'range 9,300-10,000 m/s'),
  tli: R(3_200),
  toMoon: 12_600, // earthOrbit + tli
};
export type OrbitId = 'LLO' | 'NRHO';
export interface OrbitSpec {
  id: OrbitId; name: string; loi: Val; tei: Val; down: Val; up: Val; waitDays: Val; sunFraction: Val; contactFraction: Val; periodH: Val;
}
export const ORBITS: Record<OrbitId, OrbitSpec> = {
  LLO: { id: 'LLO', name: 'Low lunar orbit (Apollo)', loi: R(900), tei: G(900), down: R(1_870), up: R(1_870), waitDays: G(1), sunFraction: G(0.6), contactFraction: G(0.63), periodH: G(1.967, '~118 min at ~60 miles up') },
  NRHO: { id: 'NRHO', name: 'Near-rectilinear halo orbit (Artemis)', loi: R(430), tei: R(410), down: R(2_600), up: R(2_600), waitDays: R(6.5, '~6.5-day orbit period'), sunFraction: G(0.99), contactFraction: R(1, 'uninterrupted'), periodH: R(156, '~6.5 days') },
};
export const SUN_NEAR_EARTH = G(0.61);
export const COAST_DAYS = G(3, 'each way');
export const MIN_LIFTOFF_TWR = G(1.2);
export const SHIELD_REQUIRED_MPH = R(24_400, 'Orion on Artemis I; up to 5,000 F');
export const MOON_G_RATIO = R(0.165);
export const LB_TO_N = 4.448; // 1 lb of weight = 4.448 N (desk conversion)
export const LIGHT_MILES_PER_S = R(186_282);
export const SIGNAL_DISTANCES = [
  { where: 'Low Earth orbit / ISS, via relay satellites 22,236 mi up', miles: G(47_000, 'up to the relay and back down') },
  { where: 'At the Moon, average', miles: R(238_855) },
  { where: "At the Moon, when it's closest to Earth", miles: R(225_700) },
  { where: "At the Moon, when it's farthest", miles: R(252_000) },
  { where: 'Halo orbit, far end', miles: G(282_000, 'Moon + about 43,500 mi, approx.') },
];
export const MISSION_BASE_MB_PER_DAY = G(300);
export const LANDER_BASE_LOAD_W = G(1_200);
export const BATTERY_MARGIN = G(1.2);
export const LAUNCH_OPS_USD = G(5_000_000, 'per launch');
export const SUPPLIES_USD_PER_CREW_DAY = G(20_000);
export const SHIELD_ROUGH_RIDE_SAFETY = G(-10, 'health 90-99%');
export const BUDGETS_USD = { easy: G(5_000_000_000), medium: G(3_500_000_000), hard: G(2_500_000_000) };

// ---------------------------------------------------------------------------- the player's spec build
export interface StageBuild { engine: string; count: number; fuelLb: number; material: MaterialId }
export interface RocketBuild { name: string; stage1: StageBuild; stage2: StageBuild; booster: string | null; boosterCount: number }
export type Difficulty = 'easy' | 'hard';
export type RoleId = 'commander' | 'propulsion' | 'spacecraft' | 'science';
export interface SpecDesign {
  architecture: 'apollo' | 'artemis'; // 1 launch (capsule + lander) or 2 (lander flies separately)
  orbit: OrbitId;
  capsule: string;
  rocket: RocketBuild | null; // null = use the Mission Plan launch-vehicle preset
  docking: string[];
  thruster: string; thrusterCount: number; thrusterTank: string;
  nav: string[];
  landerPacks: number; landerSolar: boolean;
  fixes: FixId[];
  difficulty: Difficulty;
  role: RoleId | null;
}

/** The PART C acceptance-test rocket (SLS-like, carrying Orion). */
export const SLS_LIKE: RocketBuild = {
  name: 'SLS-like',
  stage1: { engine: 'rs25', count: 4, fuelLb: 2_150_000, material: 'alli' },
  stage2: { engine: 'rl10', count: 1, fuelLb: 65_000, material: 'alli' },
  booster: 'sls_srb', boosterCount: 2,
};

/**
 * Mission Plan launch-vehicle presets, built from spec parts (G). Their Moon payload follows from
 * the rocket equation (src/simulation/stack.ts maxPayloadKg); a unit test keeps the
 * LAUNCH_VEHICLES capacity/cost figures in sync with these builds.
 */
export const ROCKET_PRESETS: Record<'bayhawk' | 'estuary' | 'goldenbear', RocketBuild> = {
  bayhawk: { name: 'Bayhawk-M', stage1: { engine: 'be4', count: 10, fuelLb: 4_500_000, material: 'steel' }, stage2: { engine: 'rl10', count: 4, fuelLb: 800_000, material: 'alli' }, booster: 'gem63xl', boosterCount: 4 },
  estuary: { name: 'Estuary Heavy', stage1: { engine: 'be4', count: 6, fuelLb: 3_000_000, material: 'steel' }, stage2: { engine: 'rl10', count: 4, fuelLb: 700_000, material: 'alli' }, booster: 'sls_srb', boosterCount: 2 },
  goldenbear: { name: 'Golden Bear SHLV', stage1: { engine: 'be4', count: 6, fuelLb: 4_000_000, material: 'steel' }, stage2: { engine: 'rl10', count: 4, fuelLb: 700_000, material: 'alli' }, booster: 'sls_srb', boosterCount: 4 },
};
