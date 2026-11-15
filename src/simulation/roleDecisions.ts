/**
 * D3 (JOSEPH_SPEC_V2): strategic decisions for the player's chosen role. Each role gets four cards per
 * Moon mission: two during design (when leaving the hangar for the desk, and the desk for the review)
 * and two during flight. Same A/B/C card shape as the emergencies (Good and Bad use the player's real
 * numbers), shown in blue under "ROLE DECISION". The other roles' areas keep sensible defaults.
 *
 * Design picks change the design itself and are logged in spec.roleLog; flight picks change the
 * mission's real resources and score adjustments and go into the decision log.
 */
import { cloneDesign, type Design, SITE_BY_ID } from '../data/mission';
import { COMPONENT_BY_ID, componentsInSlot } from '../data/components';
import { BOOSTER_BY_ID, ENGINE_BY_ID, RocketBuild, RoleId, SUPPLIES_USD_PER_CREW_DAY, SpecDesign } from '../data/specParts';
import { em, spendDays } from './deck';
import { isp, totalMass } from './mission';
import { propellantForDv } from './rocket';
import { Rng } from './rng';
import { analyzeDesign } from './spacecraft';
import { rocketOf, specOf } from './specModel';
import type { MissionState, Phase } from './types';
import { fmt, fmtUsd, kgToLb } from './units';
import { isIss } from '../data/missionConfig';

export type RoleMoment = 'design1' | 'design2' | 'flight3' | 'flight4';
export interface RoleLogEntry { id: string; pick: number; label: string; good: string; bad: string; costUsd?: number; flags?: string[] }
/** Three explain levels for the role tip (D2): Beginner, Curious, Engineer. */
export type Tip = [string, string, string];
interface DesignOption { label: string; good: (d: Design) => string; bad: (d: Design) => string; apply: (d: Design) => { costUsd?: number; flags?: string[] } | void }
interface FlightOption { label: string; good: (s: MissionState) => string; bad: (s: MissionState) => string; apply: (s: MissionState, rng: Rng) => string }
export interface DesignCard { id: string; role: RoleId; when: 'design1' | 'design2'; title: string; text: (d: Design) => string; tip: Tip; options: DesignOption[] }
export interface FlightCard { id: string; role: RoleId; when: 'flight3' | 'flight4'; phases: Phase[]; title: string; text: (s: MissionState) => string; tip: Tip; options: FlightOption[] }

const usd = (v: number) => fmtUsd(Math.round(v));
const crewDayUsd = (d: Design) => SUPPLIES_USD_PER_CREW_DAY.v * d.plan.crew;
const budgetUsd = (d: Design) => analyzeDesign(d).spec!.budgetM * 1e6;
const withRocket = (d: Design, f: (b: RocketBuild) => RocketBuild) => { d.spec = { ...specOf(d), rocket: f(JSON.parse(JSON.stringify(rocketOf(d)))) }; };
const lbOf = (kg: number) => fmt(kgToLb(kg));
/** Propellant for a burn of dv m/s with the service module, right now. */
const burnKg = (s: MissionState, dv: number) => Math.min(s.propKg, propellantForDv(totalMass(s), dv, isp(s)));
const crewDayLb = (s: MissionState, days: number) => fmt(kgToLb(Math.max(1, s.crewOnCsm) * days * (0.907 + 2.495 + 2.39)));
const nextBy = <T>(list: T[], cur: T | undefined, key: (x: T) => number, dir: 1 | -1) => {
  const sorted = list.slice().sort((a, b) => key(a) - key(b));
  const i = cur ? sorted.indexOf(cur) : -1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, i + dir))];
};

// ============================================================================ design cards
export const DESIGN_CARDS: DesignCard[] = [
  // ---- Mission Commander
  {
    id: 'cmd1', role: 'commander', when: 'design1', title: 'HOLD A BUDGET RESERVE?',
    text: (d) => `Real programs keep money back for surprises. 10% of your budget is ${usd(budgetUsd(d) * 0.1)}.`,
    tip: ['As Commander you guard the money: a reserve is a safety net.', 'As Commander: a reserve costs parts now and pays for fixes later.', 'Commander: reserve = 10% x budget, held as a cost line; +5 crew safety.'],
    options: [
      { label: 'Hold 10%', good: () => '+5 crew safety: money is ready for an emergency fix.', bad: (d) => `${usd(budgetUsd(d) * 0.1)} less to spend on parts.`, apply: (d) => ({ costUsd: budgetUsd(d) * 0.1, flags: ['safety+5'] }) },
      { label: 'Spend it all on parts', good: () => 'Every dollar goes into the spacecraft.', bad: () => 'No money held back if something breaks.', apply: () => undefined },
      { label: 'Hold 5%', good: () => '+2 crew safety, most of the money still works.', bad: (d) => `${usd(budgetUsd(d) * 0.05)} less for parts.`, apply: (d) => ({ costUsd: budgetUsd(d) * 0.05, flags: ['safety+2'] }) },
    ],
  },
  {
    id: 'cmd2', role: 'commander', when: 'design2', title: 'LAUNCH WINDOW',
    text: () => 'Thunderstorms are forecast near the pad on launch day.',
    tip: ['As Commander you pick the day: weather can bite.', 'As Commander: waiting costs supplies, a backup pad costs money.', 'Commander: delay = crew x days x $20,000; lightning card removed if you wait.'],
    options: [
      { label: 'Launch on schedule', good: () => 'No extra cost or delay.', bad: () => 'The lightning-strike emergency stays possible.', apply: () => undefined },
      { label: 'Wait 2 days for better weather', good: () => 'No lightning strike this launch.', bad: (d) => `+2 days of supplies: ${usd(crewDayUsd(d) * 2)}.`, apply: (d) => ({ costUsd: crewDayUsd(d) * 2, flags: ['noLightning'] }) },
      { label: 'Move to a backup pad', good: () => 'Away from the storm, a day sooner than waiting.', bad: () => '+$5,000,000 to move the stack.', apply: () => ({ costUsd: 5_000_000, flags: ['noLightning'] }) },
    ],
  },
  // ---- Propulsion Engineer
  {
    id: 'prop1', role: 'propulsion', when: 'design1', title: '2 OR 4 BOOSTERS?',
    text: (d) => { const b = rocketOf(d); return `Your rocket has ${b.boosterCount} x ${b.booster ? BOOSTER_BY_ID[b.booster].name : 'no booster'}.`; },
    tip: ['As Propulsion Engineer: boosters are the big push at liftoff.', 'As Propulsion Engineer: more boosters lift more but cost and weigh more.', 'Propulsion: TWR = (F1 + n x F_booster) / W; cost scales with n.'],
    options: [
      { label: '2 boosters', good: (d) => { const id = rocketOf(d).booster ?? 'sls_srb'; return `Saves ${usd(BOOSTER_BY_ID[id].priceUsd.v * Math.max(0, rocketOf(d).boosterCount - 2))} if you had more.`; }, bad: () => 'Less push at liftoff.', apply: (d) => withRocket(d, (b) => ({ ...b, booster: b.booster ?? 'sls_srb', boosterCount: 2, name: `Custom (from ${b.name})` })) },
      { label: '4 boosters', good: (d) => `Liftoff push up by ${fmt(BOOSTER_BY_ID[rocketOf(d).booster ?? 'sls_srb'].thrustN.v * Math.max(0, 4 - rocketOf(d).boosterCount))} N.`, bad: (d) => `+${usd(BOOSTER_BY_ID[rocketOf(d).booster ?? 'sls_srb'].priceUsd.v * Math.max(0, 4 - rocketOf(d).boosterCount))} and more weight.`, apply: (d) => withRocket(d, (b) => ({ ...b, booster: b.booster ?? 'sls_srb', boosterCount: Math.min(4, BOOSTER_BY_ID[b.booster ?? 'sls_srb'].max), name: `Custom (from ${b.name})` })) },
      { label: 'Keep what I have', good: () => 'No change to a design that already works.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
  {
    id: 'prop2', role: 'propulsion', when: 'design2', title: 'UPPER STAGE FUEL',
    text: (d) => `Stage 2 runs ${ENGINE_BY_ID[rocketOf(d).stage2.engine].name}.`,
    tip: ['As Propulsion Engineer: hydrogen is fast but fussy.', 'As Propulsion Engineer: hydrogen exhaust is faster; kerosene is dense and cheap.', 'Propulsion: RL10 ve 4,530 m/s, k x 1.5; Merlin Vacuum ve 3,410 m/s.'],
    options: [
      { label: 'Hydrogen (RL10)', good: () => '4,530 m/s exhaust: more speed from the same fuel.', bad: () => 'Bulky tanks and a leak risk.', apply: (d) => withRocket(d, (b) => ({ ...b, stage2: { ...b.stage2, engine: 'rl10' }, name: `Custom (from ${b.name})` })) },
      { label: 'Kerosene (Merlin Vacuum)', good: () => 'Dense, cheaper, no hydrogen leaks.', bad: () => 'Slower exhaust: 3,410 m/s.', apply: (d) => withRocket(d, (b) => ({ ...b, stage2: { ...b.stage2, engine: 'mvac', count: Math.min(2, b.stage2.count) }, name: `Custom (from ${b.name})` })) },
      { label: 'Keep what I have', good: () => 'No change.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
  // ---- Spacecraft Engineer
  {
    id: 'sc1', role: 'spacecraft', when: 'design1', title: 'BIGGER BATTERY OR MORE SOLAR?',
    text: (d) => `Battery: ${COMPONENT_BY_ID[d.slots.battery as string]?.name}. Power: ${COMPONENT_BY_ID[d.slots.power as string]?.name}.`,
    tip: ['As Spacecraft Engineer: the battery carries you through the dark.', 'As Spacecraft Engineer: battery = safety in shadow; panels = more power in sun.', 'Spacecraft: Wh needed = W x dark hours x 1.2; panels x sunlight fraction.'],
    options: [
      { label: 'Bigger battery', good: (d) => { const n = nextBy(componentsInSlot('battery'), COMPONENT_BY_ID[d.slots.battery as string], (c) => c.storageWh ?? 0, 1); return `${fmt(n.storageWh ?? 0)} Wh for the dark.`; }, bad: (d) => { const cur = COMPONENT_BY_ID[d.slots.battery as string]; const n = nextBy(componentsInSlot('battery'), cur, (c) => c.storageWh ?? 0, 1); return `+${usd((n.costM - cur.costM) * 1e6)} and +${lbOf((n.massKg ?? 0) - (cur.massKg ?? 0))} lb.`; }, apply: (d) => { d.slots.battery = nextBy(componentsInSlot('battery'), COMPONENT_BY_ID[d.slots.battery as string], (c) => c.storageWh ?? 0, 1).id; } },
      { label: 'Extra solar panel', good: (d) => { const n = nextBy(componentsInSlot('power'), COMPONENT_BY_ID[d.slots.power as string], (c) => c.genW ?? 0, 1); return `${fmt(n.genW ?? 0)} W in sunlight.`; }, bad: () => 'Nothing extra for the dark side of the orbit.', apply: (d) => { d.slots.power = nextBy(componentsInSlot('power'), COMPONENT_BY_ID[d.slots.power as string], (c) => c.genW ?? 0, 1).id; } },
      { label: 'Keep what I have', good: () => 'No change.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
  {
    id: 'sc2', role: 'spacecraft', when: 'design2', title: 'LANDER: MARGIN OR PAYLOAD?',
    text: (d) => `Lander: ${COMPONENT_BY_ID[d.slots.lander as string]?.name}.`,
    tip: ['As Spacecraft Engineer: a heavier lander is safer, a lighter one carries more science.', 'As Spacecraft Engineer: margin vs payload is the classic trade.', 'Spacecraft: lander Δv margin vs payload mass; check down and up.'],
    options: [
      { label: 'Heavier lander, more margin', good: () => 'More fuel for landing and lifting off.', bad: () => 'Heavier stack: the rocket and capsule work harder.', apply: (d) => { const l = componentsInSlot('lander'); d.slots.lander = nextBy(l, COMPONENT_BY_ID[d.slots.lander as string], (c) => c.descentPropKg ?? 0, 1).id; } },
      { label: 'Lighter lander + a seismometer', good: () => 'An extra instrument: +20 science points possible.', bad: () => 'Less lander margin.', apply: (d) => { const l = componentsInSlot('lander'); d.slots.lander = nextBy(l, COMPONENT_BY_ID[d.slots.lander as string], (c) => c.descentPropKg ?? 0, -1).id; if (!d.science.includes('sci_seismo')) d.science.push('sci_seismo'); } },
      { label: 'Keep what I have', good: () => 'No change.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
  // ---- Science & Comms Lead
  {
    id: 'sci1', role: 'science', when: 'design1', title: 'INSTRUMENTS VS DATA BUDGET',
    text: (d) => `Radio: ${COMPONENT_BY_ID[d.slots.comms as string]?.name}. Cameras make the most data.`,
    tip: ['As Science Lead: cameras need a fast radio.', 'As Science Lead: data you cannot send home is lost.', 'Science: MB/day = kbps x 86,400 x contact / 8,000 must cover instruments.'],
    options: [
      { label: 'Add HD cameras + Ka-band radio', good: () => '+10 science points from the cameras.', bad: () => 'More data, power and money for the radio.', apply: (d) => { if (!d.science.includes('sci_pancam')) d.science.push('sci_pancam'); d.slots.comms = 'com_hga'; } },
      { label: 'Drop the cameras, save data', good: () => 'The radio easily keeps up.', bad: () => '-10 science points possible.', apply: (d) => { d.science = d.science.filter((x) => x !== 'sci_pancam'); } },
      { label: 'Keep what I have', good: () => 'No change.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
  {
    id: 'sci2', role: 'science', when: 'design2', title: 'LANDING SITE',
    text: (d) => `Planned site: ${SITE_BY_ID[d.plan.site].name}.`,
    tip: ['As Science Lead: the best science is often in the hardest places.', 'As Science Lead: flat sites are safe; rough ones hold more science.', 'Science: landing hazard and radio contact vs science value.'],
    options: [
      { label: 'Safer flat site (Tranquility)', good: () => 'Flat ground: an easier landing.', bad: () => 'Less science than the poles or skylights.', apply: (d) => { d.plan.site = 'equator'; } },
      { label: 'Science-rich site (South Pole)', good: () => 'Ice and old rock: more science.', bad: () => 'Rough ground and more speed to get down.', apply: (d) => { d.plan.site = 'pole'; } },
      { label: 'Keep my site', good: () => 'No change.', bad: () => 'No change.', apply: () => undefined },
    ],
  },
];

// ============================================================================ flight cards
export const FLIGHT_CARDS: FlightCard[] = [
  // ---- Mission Commander
  {
    id: 'cmd3', role: 'commander', when: 'flight3', phases: ['LUNAR_ORBIT'], title: 'GO FOR LANDING? (WARNING LIGHT)',
    text: () => 'A sensor light is on in the lander. It may be a false alarm.',
    tip: ['As Commander you make the go / no-go call.', 'As Commander: pressing on saves time, checking costs supplies.', 'Commander: risk vs supply time vs science.'],
    options: [
      { label: 'Go: land on time', good: () => 'Full science plan.', bad: () => '-5 crew safety if the light was real.', apply: (s) => { em(s).safetyAdj -= 5; return 'GO. The light stayed on all the way down.'; } },
      { label: 'Wait one orbit to check', good: () => 'The ground checks the data: no extra risk.', bad: (s) => `-2 hours: ${crewDayLb(s, 2 / 24)} lb of supplies.`, apply: (s) => { spendDays(s, 2 / 24); return 'One orbit later: a faulty sensor. GO.'; } },
      { label: 'Land at the nearest flat spot', good: () => 'Shorter, safer descent.', bad: () => '-10% science.', apply: (s) => { em(s).scienceMult *= 0.9; return 'Landing at the closest flat spot.'; } },
    ],
  },
  {
    id: 'cmd4', role: 'commander', when: 'flight4', phases: ['LUNAR_ORBIT_POST', 'TRANSIT_BACK'], title: 'EXTEND THE MISSION A DAY?',
    text: (s) => `Oxygen ${lbOf(s.o2Kg)} lb, water ${lbOf(s.waterKg)} lb on board.`,
    tip: ['As Commander: more time means more science, and less spare.', 'As Commander: a day of science costs a day of supplies.', 'Commander: +science vs supplies = crew x days x 15 lb.'],
    options: [
      { label: 'Extend a day', good: () => '+8 science points.', bad: (s) => `-${crewDayLb(s, 1)} lb of supplies.`, apply: (s) => { spendDays(s, 1); em(s).scienceAdj += 8; return 'One more day of observations.'; } },
      { label: 'Stick to the plan', good: () => 'Margins stay where they are.', bad: () => 'No extra science.', apply: () => 'Sticking to the plan.' },
      { label: 'Half a day', good: () => '+4 science points.', bad: (s) => `-${crewDayLb(s, 0.5)} lb of supplies.`, apply: (s) => { spendDays(s, 0.5); em(s).scienceAdj += 4; return 'Half a day more.'; } },
    ],
  },
  // ---- Propulsion Engineer
  {
    id: 'prop3', role: 'propulsion', when: 'flight3', phases: ['TRANSIT_OUT'], title: 'COURSE-CORRECTION BURN',
    text: (s) => `The ship is drifting off course. Capsule fuel: ${lbOf(s.propKg)} lb.`,
    tip: ['As Propulsion Engineer: small fixes early are cheap.', 'As Propulsion Engineer: a correction grows the longer you wait.', 'Propulsion: Δv cost grows with time to arrival; mp = m0 x (1 - e^(-Δv/ve)).'],
    options: [
      { label: 'Small burn now (10 m/s)', good: () => 'Back on course, cheaply.', bad: (s) => `-${lbOf(burnKg(s, 10))} lb of fuel.`, apply: (s) => { s.propKg -= burnKg(s, 10); return 'A 10 m/s burn: right on course.'; } },
      { label: 'Bigger burn later (30 m/s)', good: () => 'The crew keeps sleeping now.', bad: (s) => `-${lbOf(burnKg(s, 30))} lb of fuel.`, apply: (s) => { s.propKg -= burnKg(s, 30); return 'A 30 m/s burn later fixed it.'; } },
      { label: 'Skip it', good: () => 'No fuel spent now.', bad: (s) => `30% chance of a missed arrival: -${lbOf(burnKg(s, 60))} lb later.`, apply: (s, rng) => { if (rng.chance(0.3)) { s.propKg -= burnKg(s, 60); return 'Missed the arrival point: a 60 m/s fix.'; } return 'Lucky: the drift was small.'; } },
    ],
  },
  {
    id: 'prop4', role: 'propulsion', when: 'flight4', phases: ['LUNAR_ORBIT'], title: 'WHERE TO PUT IT DOWN',
    text: (s) => `Lander descent fuel: ${lbOf(s.landerDescentPropKg)} lb.`,
    tip: ['As Propulsion Engineer: hovering burns fuel fast.', 'As Propulsion Engineer: precision costs fuel, safety saves it.', 'Propulsion: hover time x mass flow = fuel spent.'],
    options: [
      { label: 'Spend fuel to hit the exact site', good: () => '+5 science points.', bad: (s) => `-${lbOf(s.landerDescentPropKg * 0.04)} lb of descent fuel.`, apply: (s) => { s.landerDescentPropKg *= 0.96; em(s).scienceAdj += 5; return 'Aiming for the exact site.'; } },
      { label: 'First safe spot', good: () => 'Saves descent fuel for the landing.', bad: () => '-3 science points.', apply: (s) => { em(s).scienceAdj -= 3; return 'Taking the first safe spot.'; } },
      { label: 'Let the autopilot choose', good: () => 'A balanced pick.', bad: (s) => `-${lbOf(s.landerDescentPropKg * 0.02)} lb of descent fuel.`, apply: (s) => { s.landerDescentPropKg *= 0.98; return 'The autopilot picks a spot.'; } },
    ],
  },
  // ---- Spacecraft Engineer
  {
    id: 'sc3', role: 'spacecraft', when: 'flight3', phases: ['TRANSIT_OUT'], title: 'HOT PASS: THERMAL',
    text: () => 'The radiators face the Sun for the next few hours.',
    tip: ['As Spacecraft Engineer you keep the ship cool.', 'As Spacecraft Engineer: less power on means less heat.', 'Spacecraft: heat out must match power in plus crew heat.'],
    options: [
      { label: 'Power down instruments', good: () => 'Stays cool.', bad: () => '-3 science points.', apply: (s) => { em(s).scienceAdj -= 3; return 'Instruments off until the pass ends.'; } },
      { label: 'Ride it out', good: () => 'No science lost.', bad: () => '20% chance: -10 crew condition from the heat.', apply: (s, rng) => { if (rng.chance(0.2)) { s.condition = Math.max(1, s.condition - 10); return 'It got hot in the cabin: crew tired.'; } return 'The radiators held.'; } },
      { label: 'Turn the ship', good: () => 'Radiators in shade.', bad: (s) => `-${fmt(kgToLb(Math.min(s.rcsFuelKg, 2)))} lb of thruster fuel.`, apply: (s) => { s.rcsFuelKg = Math.max(0, s.rcsFuelKg - 2); return 'Rolled the ship to shade the radiators.'; } },
    ],
  },
  {
    id: 'sc4', role: 'spacecraft', when: 'flight4', phases: ['TRANSIT_BACK'], title: 'INSPECT THE HEAT SHIELD?',
    text: () => 'Re-entry is two days away. The shield has not been checked since launch.',
    tip: ['As Spacecraft Engineer: the shield is the crew\'s last line of defence.', 'As Spacecraft Engineer: an inspection costs a day of supplies.', 'Spacecraft: inspection = +1 day; finds damage before 24,400 mph.'],
    options: [
      { label: 'Inspect it (+1 day)', good: () => '+5 crew safety; any damage gets fixed.', bad: (s) => `-${crewDayLb(s, 1)} lb of supplies.`, apply: (s) => { spendDays(s, 1); em(s).safetyAdj += 5; em(s).shieldDamage = 0; return 'Inspected: all clear.'; } },
      { label: 'Trust it', good: () => 'No time lost.', bad: (s) => (em(s).shieldDamage > 0 ? `Known damage: ${fmt(em(s).shieldDamage)}% stays.` : 'Any hidden damage stays hidden.'), apply: () => 'Trusting the shield.' },
      { label: 'Quick camera look (half day)', good: () => '+2 crew safety.', bad: (s) => `-${crewDayLb(s, 0.5)} lb of supplies.`, apply: (s) => { spendDays(s, 0.5); em(s).safetyAdj += 2; return 'Quick look: it looks fine.'; } },
    ],
  },
  // ---- Science & Comms Lead
  {
    id: 'sci3', role: 'science', when: 'flight3', phases: ['TRANSIT_OUT'], title: 'SEND DATA NOW OR WAIT?',
    text: () => 'The slow link is up now; the fast pass comes in six hours.',
    tip: ['As Science Lead: data on board is not data at home.', 'As Science Lead: sending slowly is safe; waiting risks losing it.', 'Science: risk of loss x stored MB vs link time.'],
    options: [
      { label: 'Send now on the slow link', good: () => 'Safe at home.', bad: () => '-2 science points (lower quality).', apply: (s) => { em(s).scienceAdj -= 2; return 'Sent on the slow link.'; } },
      { label: 'Wait for the fast pass', good: () => 'Full-quality data.', bad: () => '15% chance: -5 science points if something goes wrong.', apply: (s, rng) => { if (rng.chance(0.15)) { em(s).scienceAdj -= 5; return 'A glitch before the pass: some data lost.'; } return 'Full-quality data sent on the fast pass.'; } },
      { label: 'Send half now', good: () => 'The best results are safe.', bad: () => '-1 science point.', apply: (s) => { em(s).scienceAdj -= 1; return 'Half sent now, half on the fast pass.'; } },
    ],
  },
  {
    id: 'sci4', role: 'science', when: 'flight4', phases: ['LUNAR_ORBIT'], title: 'SURFACE TRAVERSE PLAN',
    text: (s) => `Suit oxygen comes from the lander: ${lbOf(s.o2Kg)} lb on board.`,
    tip: ['As Science Lead: a long drive finds more, and uses more.', 'As Science Lead: distance = science, but costs oxygen and battery.', 'Science: +points vs O2 and Wh per traverse.'],
    options: [
      { label: 'One long traverse', good: () => '+10 science points.', bad: (s) => `-${fmt(4 * Math.max(1, s.crewOnCsm))} lb of oxygen.`, apply: (s) => { s.o2Kg -= (4 * Math.max(1, s.crewOnCsm)) * 0.4536; em(s).scienceAdj += 10; return 'One long traverse planned.'; } },
      { label: 'Two short ones', good: () => '+5 science points.', bad: (s) => `-${fmt(2 * Math.max(1, s.crewOnCsm))} lb of oxygen.`, apply: (s) => { s.o2Kg -= (2 * Math.max(1, s.crewOnCsm)) * 0.4536; em(s).scienceAdj += 5; return 'Two short traverses planned.'; } },
      { label: 'Stay near the lander', good: () => 'Safest plan.', bad: () => 'No extra science.', apply: () => 'Staying close to the lander.' },
    ],
  },
];

// ============================================================================ logic
export const roleOfDesign = (d: Design): RoleId | null => specOf(d).role;
/** The four decisions for a role: two design, two flight. */
export function cardsFor(role: RoleId) {
  return { design: DESIGN_CARDS.filter((c) => c.role === role), flight: FLIGHT_CARDS.filter((c) => c.role === role) };
}
const log = (d: Design): RoleLogEntry[] => (specOf(d) as SpecDesign & { roleLog?: RoleLogEntry[] }).roleLog ?? [];
/** The design card due at this moment, if the player's role has one not yet decided. */
export function dueDesignCard(d: Design, when: 'design1' | 'design2'): DesignCard | null {
  const role = roleOfDesign(d);
  if (!role) return null;
  const c = DESIGN_CARDS.find((x) => x.role === role && x.when === when);
  if (c && isIss(d) && (c.id === 'sc2' || c.id === 'sci2')) return null; // lander and landing site: Moon only
  return c && !log(d).some((e) => e.id === c.id) ? c : null;
}
/** Apply a design pick: the design changes and the pick is logged (with any cost line and flags). */
export function applyDesignPick(d: Design, card: DesignCard, i: number): Design {
  const out = cloneDesign(d);
  const o = card.options[i];
  const good = o.good(out), bad = o.bad(out);
  const r = o.apply(out) || {};
  const sp = specOf(out) as SpecDesign & { roleLog?: RoleLogEntry[] };
  out.spec = { ...sp, roleLog: [...(sp.roleLog ?? []), { id: card.id, pick: i, label: o.label, good, bad, costUsd: r.costUsd, flags: r.flags }] } as SpecDesign;
  return out;
}
/** Cost lines from design picks (budget reserve, delays, moving pads). */
export function roleCostLines(sp: SpecDesign): { label: string; m: number; ids: string[] }[] {
  const entries = (sp as SpecDesign & { roleLog?: RoleLogEntry[] }).roleLog ?? [];
  return entries.filter((e) => e.costUsd).map((e) => ({ label: `Role decision: ${e.label}`, m: e.costUsd! / 1e6, ids: [] }));
}
/** At launch: design picks that change the flight (lightning removed, safety from a reserve) and their log lines. */
export function applyRoleAtLaunch(s: MissionState) {
  const entries = log(s.design);
  for (const e of entries) {
    const card = DESIGN_CARDS.find((c) => c.id === e.id);
    s.decisions.push({ event: `ROLE DECISION: ${card?.title ?? e.id}`, choice: e.label, t: 0, fd: false, good: e.good, bad: e.bad, result: e.label });
    for (const f of e.flags ?? []) {
      if (f === 'noLightning') s.schedule = s.schedule.filter((x) => x.id !== 'card2');
      const m = /^safety\+(\d+)$/.exec(f);
      if (m) em(s).safetyAdj += Number(m[1]);
    }
  }
}
/** The flight card due now for the player's role (each fires once; done ones are in eventsSeen). */
export function dueFlightCard(s: MissionState): FlightCard | null {
  const role = specOf(s.design).role;
  if (!role || s.pending || s.crewLost) return null;
  const inPhaseH = (s.t - s.phaseStart) / 3600;
  const wait = () => (s.phase === 'TRANSIT_OUT' || s.phase === 'TRANSIT_BACK' ? 6 : 0.5); // hours into the phase
  return FLIGHT_CARDS.find((c) => c.role === role && c.phases.includes(s.phase) && !s.eventsSeen.includes(c.id) && inPhaseH >= wait()) ?? null;
}
export function applyFlightPick(s: MissionState, card: FlightCard, i: number): string {
  const rng = new Rng((s.rngState ^ Math.floor(s.t) ^ 0x5eed) >>> 0);
  const o = card.options[i];
  const good = o.good(s), bad = o.bad(s);
  const msg = o.apply(s, rng);
  s.eventsSeen.push(card.id);
  s.decisions.push({ event: `ROLE DECISION: ${card.title}`, choice: o.label, t: s.t, fd: false, good, bad, result: msg });
  return msg;
}
/** "Your propulsion team picked a safe default" lines for the roles the player did not pick. */
export const DEFAULT_NOTES: Record<RoleId, string> = {
  commander: 'Your commander picked a safe default: no reserve, launch on schedule.',
  propulsion: 'Your propulsion team picked a safe default for boosters and fuel.',
  spacecraft: 'Your spacecraft team picked a safe default for power and the lander.',
  science: 'Your science team picked a safe default for instruments and the site.',
};
