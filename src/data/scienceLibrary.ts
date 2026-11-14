/**
 * Science library (Phase 5 item 4): every formula the game uses, in plain words, with a source link,
 * and every part value with its R (real, sourced) or G (game choice) tag. Pure data; read from
 * specParts.ts so the library can never drift from the numbers the game actually uses.
 */
import {
  BOOSTERS, CAPSULES, ENGINES, INSTRUMENTS, LANDERS, LIFE_SUPPORT_LB, MATERIALS, MISSION_DV, MIN_LIFTOFF_TWR, MOON_G_RATIO,
  LIGHT_MILES_PER_S, ORBITS, PROPELLANTS, SHIELD_REQUIRED_MPH, THRUSTER_FUEL_LB_PER_GAL, Val,
} from './specParts';

export interface SourceLink { label: string; url: string }
export const SRC = {
  sls: { label: 'NASA: Space Launch System', url: 'https://www.nasa.gov/reference/space-launch-system/' },
  orion: { label: 'NASA: Orion quick facts', url: 'https://www.nasa.gov/wp-content/uploads/2015/06/fs-2014-08-004-jsc-orion_quickfacts-web.pdf' },
  moon: { label: 'NASA: Moon fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' },
  nrho: { label: 'NASA: Why NRHO, the Artemis orbit', url: 'https://nasa.gov/wp-content/uploads/2023/10/acr22-wp-why-nrho-the-artemis-orbit.pdf' },
  dvBudget: { label: 'Wikipedia: Delta-v budget', url: 'https://en.wikipedia.org/wiki/Delta-v_budget' },
  rocketEq: { label: 'Wikipedia: Tsiolkovsky rocket equation', url: 'https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation' },
  isp: { label: 'NASA Glenn: Specific impulse', url: 'https://www.grc.nasa.gov/www/k-12/airplane/specimp.html' },
  lbf: { label: 'Wikipedia: Pound (force)', url: 'https://en.wikipedia.org/wiki/Pound_(force)' },
  lm: { label: 'Wikipedia: Apollo Lunar Module', url: 'https://en.wikipedia.org/wiki/Apollo_Lunar_Module' },
  artemis1: { label: 'Spaceflight Now: Artemis I back on Earth', url: 'https://spaceflightnow.com/2022/12/11/artemis-1-back-on-earth-after-near-flawless-25-day-moon-mission/' },
  ochmo: { label: 'NASA OCHMO life support brief', url: 'https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf' },
  bvad: { label: 'NASA NTRS paper citing the BVAD', url: 'https://ntrs.nasa.gov/api/citations/20190027563/downloads/20190027563.pdf' },
  f9stage: { label: 'Wevolver: Falcon 9 stage data', url: 'https://wevolver.com/specs/falcon-9-v12-or-full-thrust-block-5' },
  merlin: { label: 'Wikipedia: SpaceX Merlin', url: 'https://en.wikipedia.org/wiki/SpaceX_Merlin' },
  newGlenn: { label: 'Blue Origin: New Glenn', url: 'https://www.blueorigin.com/new-glenn' },
  vulcan: { label: 'ULA: Vulcan Centaur', url: 'https://www.ulalaunch.com/docs/default-source/rockets/vulcancentaur.pdf' },
  rl10: { label: 'L3Harris RL10 spec sheet', url: 'https://l3harris.com/sites/default/files/2024-07/l3harris-ar-rl10-spec-sheet.pdf' },
  rs25: { label: 'NASA RS-25 fact sheet', url: 'https://www.nasa.gov/wp-content/uploads/2020/09/final_sls_rs25_fact_sheet_508_07312015.pdf' },
  monoprop: { label: 'L3Harris monopropellant thrusters', url: 'https://www.l3harris.com/sites/default/files/2025-10/l3harris-ar-monopropellant-rocket-engines.pdf' },
  cygnus: { label: 'Northrop Grumman: Cygnus fact sheet', url: 'https://cdn.northropgrumman.com/-/media/wp-content/uploads/Cygnus-Fact-Sheet-1.pdf?v=1.0.0' },
  game: { label: 'Game rule (G): a simplification, see docs/SCIENTIFIC_ASSUMPTIONS.md', url: '' },
} satisfies Record<string, SourceLink>;

export interface Formula { name: string; math: string; words: string; source: SourceLink }
/** Every formula on the Calculation Desk and in the mission model, in the order the desk uses them. */
export const FORMULAS: Formula[] = [
  { name: 'Weight at liftoff', math: 'payload + stage 2 (full) + stage 1 (full) + boosters', words: 'Everything sitting on the pad counts, like a full backpack on a scale.', source: SRC.sls },
  { name: 'Weight in newtons', math: 'newtons = pounds x 4.448', words: 'A pound of weight pulls down with 4.448 newtons, so push and weight can be compared.', source: SRC.lbf },
  { name: 'Thrust-to-weight', math: `total push (N) / weight (N), at least ${MIN_LIFTOFF_TWR.v}`, words: 'Push less than the rocket weighs and it sits on the pad.', source: SRC.sls },
  { name: 'Exhaust speed', math: 'exhaust speed (m/s) = Isp x 9.81', words: 'Maker sheets give Isp in seconds; times 9.81 turns it into the speed the gas leaves the nozzle.', source: SRC.isp },
  { name: 'Speed gained (Δv)', math: 'speed gained = exhaust speed x ln(full weight / empty weight)', words: 'Throwing balls off a skateboard: more balls and faster throws mean more speed. ln turns "how many times heavier" into speed.', source: SRC.rocketEq },
  { name: 'Enough to reach the Moon', math: `boosters + stage 1 + stage 2 >= ${MISSION_DV.toMoon.toLocaleString('en-US')} m/s`, words: `${MISSION_DV.earthOrbit.v.toLocaleString('en-US')} m/s gets you to Earth orbit; ${MISSION_DV.tli.v.toLocaleString('en-US')} more aims you at the Moon.`, source: SRC.dvBudget },
  { name: 'Empty stage', math: 'empty stage = k x fuel + engines (hydrogen tanks x 1.5)', words: 'A bigger bottle weighs more even when empty; k says how many pounds of tank each pound of fuel needs.', source: SRC.f9stage },
  { name: 'Fuel needed', math: 'R = e^(speed needed / exhaust speed); fuel = weight pushed x (R - 1) / (1 - k x (R - 1))', words: 'The rocket equation run backwards: from the speed you need to the pounds of fuel, counting the tank\'s own weight.', source: SRC.rocketEq },
  { name: 'Fuel used by a burn', math: 'fuel used = weight x (1 - e^(-speed / exhaust speed))', words: 'Whatever the capsule burns getting into lunar orbit, it cannot use coming home.', source: SRC.rocketEq },
  { name: 'Moon thrust-to-weight', math: `thrust (N) / (weight (lb) x 4.448 x ${MOON_G_RATIO.v})`, words: 'Moon gravity is about a sixth of Earth\'s; above 1 the lander\'s engine can hold it up.', source: SRC.moon },
  { name: 'Crew supplies', math: 'supplies (lb) = crew x days x pounds per day', words: 'About 15 lb of oxygen, water and food per astronaut per day.', source: SRC.ochmo },
  { name: 'Power made', math: 'power made = panel watts x sunlight fraction', words: 'Solar panels only work in sunlight; in low lunar orbit the Moon blocks the Sun for part of every orbit.', source: SRC.nrho },
  { name: 'Battery for the dark', math: 'battery (Wh) = watts used x dark hours x 1.2', words: 'A 5,000 Wh battery runs a 1,000 W load for 5 hours; the 1.2 is 20% spare.', source: SRC.game },
  { name: 'Data sent home', math: 'MB per day = kbps x 86,400 x contact / 8,000', words: '86,400 seconds in a day; 8,000 turns kilobits into megabytes; contact is the share of time Earth is in view.', source: SRC.nrho },
  { name: 'Signal delay', math: `seconds = miles / ${LIGHT_MILES_PER_S.v.toLocaleString('en-US')}`, words: 'Radio travels at the speed of light, so mission control is always a little behind.', source: SRC.moon },
  { name: 'Heat shield health', math: `health = shield rating / ${SHIELD_REQUIRED_MPH.v.toLocaleString('en-US')} mph (max 100%)`, words: 'Orion hit the air at 24,400+ mph on Artemis I; under 90% the shield burns through.', source: SRC.artemis1 },
  { name: 'Thruster fuel', math: `pounds = gallons x ${THRUSTER_FUEL_LB_PER_GAL.v}`, words: 'Hydrazine weighs about 8.5 lb per gallon; every docking uses some.', source: SRC.monoprop },
  { name: 'Money left', math: 'money left = budget - everything spent', words: 'Every part drops the budget meter; at $0 launch is locked.', source: SRC.game },
];

export interface PartValue { group: string; part: string; field: string; value: number; tag: 'R' | 'G'; note?: string; source: SourceLink }
const FIELD: Record<string, string> = {
  weightLb: 'weight (lb)', thrustN: 'push (N)', veMs: 'exhaust speed (m/s)', veSeaLevel: 'exhaust, sea level (m/s)', veVacuum: 'exhaust, vacuum (m/s)', priceUsd: 'price ($)',
  fuelLb: 'fuel (lb)', k: 'tank factor k', costUsdPerLb: 'cost ($/lb)', reliability: 'reliability', crew: 'crew', cmLb: 'crew module (lb)', smLb: 'service module (lb)',
  smFuelLb: 'service module fuel (lb)', maxDays: 'max days', shieldMph: 'shield rating (mph)', solarW: 'solar power (W)', engineThrustN: 'engine push (N)', totalLb: 'total (lb)',
  descentFuelLb: 'descent fuel (lb)', ascentFuelLb: 'ascent fuel (lb)', descentDryLb: 'descent empty (lb)', ascentDryLb: 'ascent empty (lb)', descentThrustN: 'descent push (N)',
  ascentThrustN: 'ascent push (N)', maxStayH: 'max stay (h)', powerW: 'power (W)', mbPerDay: 'data (MB/day)', points: 'science points', rockLb: 'rock (lb)',
  loi: 'into orbit (m/s)', tei: 'home (m/s)', down: 'landing (m/s)', up: 'lift-off (m/s)', waitDays: 'wait (days)', sunFraction: 'sunlight', contactFraction: 'contact', periodH: 'orbit period (h)',
  densityLbFt3: 'density (lb/ft³)', priceUsdPerLb: 'price ($/lb)', tankMult: 'tank multiplier',
  oxygen: 'oxygen (lb/day)', drinkingWater: 'drinking water (lb/day)', hygieneWater: 'hygiene water (lb/day)', food: 'food (lb/day)',
};
const isVal = (x: unknown): x is Val => !!x && typeof x === 'object' && 'v' in (x as object) && 'tag' in (x as object);
const ENGINE_SRC: Record<string, SourceLink> = { merlin1d: SRC.merlin, mvac: SRC.merlin, merlin1d_s2: SRC.merlin, be4: SRC.newGlenn, rs25: SRC.rs25, rl10: SRC.rl10 };
function rows(group: string, part: string, obj: object, source: SourceLink): PartValue[] {
  return Object.entries(obj).flatMap(([k, v]) => (isVal(v) ? [{ group, part, field: FIELD[k] ?? k, value: v.v, tag: v.tag as 'R' | 'G', note: v.note, source: v.tag === 'R' ? source : SRC.game }] : []));
}

/** Every tagged part value in the game, grouped the way the hangar shows them. */
export function partValues(): PartValue[] {
  return [
    ...ENGINES.flatMap((e) => rows('Rocket engines', e.name, e, ENGINE_SRC[e.id] ?? SRC.f9stage)),
    ...BOOSTERS.flatMap((b) => rows('Boosters', b.name, b, b.id === 'sls_srb' ? SRC.sls : SRC.vulcan)),
    ...Object.values(PROPELLANTS).flatMap((p) => [...rows('Propellants', p.name, p, SRC.isp), ...p.veRange.map((v, i) => ({ group: 'Propellants', part: p.name, field: i ? 'exhaust, high (m/s)' : 'exhaust, low (m/s)', value: v.v, tag: v.tag as 'R' | 'G', note: v.note, source: v.tag === 'R' ? SRC.isp : SRC.game }))]),
    ...Object.values(MATERIALS).flatMap((m) => rows('Tank materials', m.name, m, SRC.f9stage)),
    ...CAPSULES.flatMap((c) => rows('Capsules', c.name, c, SRC.orion)),
    ...LANDERS.flatMap((l) => rows('Landers', l.name, l, SRC.lm)),
    ...rows('Life support', 'Per astronaut', LIFE_SUPPORT_LB, SRC.ochmo).map((r) => (r.field.startsWith('food') && r.tag === 'R' ? { ...r, source: SRC.bvad } : r)),
    ...INSTRUMENTS.flatMap((i) => rows('Science instruments', i.name, i, SRC.game)),
    ...Object.values(ORBITS).flatMap((o) => rows('Lunar orbits', o.name, o, o.id === 'NRHO' ? SRC.nrho : SRC.dvBudget)),
    ...rows('Mission', 'Speed budget', MISSION_DV, SRC.dvBudget),
    { group: 'Mission', part: 'Moon', field: 'gravity vs Earth', value: MOON_G_RATIO.v, tag: 'R', source: SRC.moon },
    { group: 'Mission', part: 'Radio', field: 'speed of light (mi/s)', value: LIGHT_MILES_PER_S.v, tag: 'R', source: SRC.moon },
    { group: 'Mission', part: 'Heat shield', field: 'return speed (mph)', value: SHIELD_REQUIRED_MPH.v, tag: 'R', source: SRC.artemis1 },
    { group: 'Mission', part: 'Thrusters', field: 'hydrazine (lb/gal)', value: THRUSTER_FUEL_LB_PER_GAL.v, tag: 'R', source: SRC.monoprop },
  ];
}
