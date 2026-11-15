/**
 * The 16-card A/B/C emergency deck (JOSEPH_SPEC tab 7), plugged into the existing emergency
 * system: cards are EventDefs (build -> PendingEvent, resolve -> message) scheduled by the seeded
 * Rng and resolved through mission.ts resolveEvent(), which logs every decision.
 *
 * Easy: 3 cards from any phase, Bad numbers halved, any "mission fail" becomes "abort, crew safe",
 * and mission control gives a hint first. Hard: 5 cards weighted toward the design's weak spots,
 * full strength, and a Flight Director bonus (+50, G) when the pick matches the safest sound call.
 * Every option has a Good and a Bad line; Bad lines use the player's real numbers.
 * Consequence numbers are game values (G).
 */
import * as K from './constants';
import type { Rng } from './rng';
import type { MissionState, PendingEvent, Phase } from './types';
import { deltaV, propellantForDv } from './rocket';
import { missionDv, specOf } from './specModel';
import { fmt, kgToLb, lbToKg } from './units';
import { INSTRUMENTS, LIFE_SUPPORT_LB } from '../data/specParts';
import {
  abortMission, applyLanding, isp, landerMass, lifeboatReturn, log, loseCrew, propMarginKg, totalMass, turnBack,
} from './mission';

export type Stage = 'pad' | 'launch' | 'earthOrbit' | 'coast' | 'lunarOrbit' | 'landing' | 'surface' | 'return';
export const STAGE_ORDER: Stage[] = ['pad', 'launch', 'earthOrbit', 'coast', 'lunarOrbit', 'landing', 'surface', 'return'];
export const STAGE_LABEL: Record<Stage, string> = {
  pad: 'ON THE PAD', launch: 'DURING LAUNCH', earthOrbit: 'IN EARTH ORBIT', coast: 'COAST TO THE MOON',
  lunarOrbit: 'LUNAR ORBIT', landing: 'LANDING', surface: 'ON THE SURFACE', return: 'COMING HOME',
};
/** Stages handled by a scene hook (launch, landing, surface) rather than the coast timeline. */
export const SCENE_STAGES: Stage[] = ['pad', 'launch', 'earthOrbit', 'landing', 'surface'];
export const FD_BONUS = 50; // G
export const RETRY_PENALTY = 100; // G: mission points per landing retry on Hard (Easy retries are free)
export const EASY_CARDS = 3, HARD_CARDS = 5;

/** Emergency bookkeeping carried in MissionState.em. */
export interface EmergencyState {
  rocketSpare: number; // m/s of launch margin left
  fdBonus: number; scienceAdj: number; scienceMult: number; safetyAdj: number; extraCostM: number;
  burnRisk: number; shieldDamage: number; scoreCap: number; landerLostH: number;
  freeFixUsed: boolean; abortReason: string | null;
  deskPenalty?: number; // Calculation Desk reveals (Hard, G: 10 points each)
  retries?: number; // landing retries after a crash
}
export function newEmergencyState(rocketSpare: number): EmergencyState {
  return { rocketSpare, fdBonus: 0, scienceAdj: 0, scienceMult: 1, safetyAdj: 0, extraCostM: 0, burnRisk: 0, shieldDamage: 0, scoreCap: 100, landerLostH: 0, freeFixUsed: false, abortReason: null };
}
export const em = (s: MissionState): EmergencyState => (s.em ??= newEmergencyState(s.stats.spec?.rocket.spare ?? 0));

/** Strength of Bad effects: 1 on Hard, 0.5 on Easy, 0 when the Spacecraft Engineer's free fix is used. */
interface Ctx { k: number; easy: boolean; fixed: boolean; rng: Rng }
const easyOf = (s: MissionState) => specOf(s.design).difficulty !== 'hard';

// ------------------------------------------------------------------ the player's real numbers
const G0 = K.G0;
const lb = (kg: number) => fmt(kgToLb(kg));
/** Capsule Δv still spare after every planned burn (m/s). */
export function capsuleSpareDv(s: MissionState): number {
  const m = totalMass(s), mk = propMarginKg(s), ve = isp(s) * G0;
  if (mk <= 0) return (mk / m) * ve; // short: negative
  return deltaV(isp(s), m, m - mk);
}
function spendCapsuleDv(s: MissionState, dv: number) {
  if (dv <= 0) return 0;
  const p = Math.min(s.propKg, propellantForDv(totalMass(s), dv, isp(s)));
  s.propKg -= p;
  return p;
}
const landerComp = (s: MissionState) => s.stats.parts.find((p) => p.slot === 'lander');
/** Descent Δv beyond what the landing needs (m/s), from the current lander state. */
export function descentMarginMs(s: MissionState): number {
  const L = landerComp(s);
  if (!L) return 0;
  const m0 = landerMass(s) + s.stats.landingCrew * K.CREW_MASS_KG;
  return deltaV(L.ispS!, m0, m0 - s.landerDescentPropKg) - missionDv(s.design).descent;
}
function spendDescentDv(s: MissionState, dv: number) {
  const L = landerComp(s);
  if (!L || dv <= 0) return;
  const m0 = landerMass(s) + s.stats.landingCrew * K.CREW_MASS_KG;
  s.landerDescentPropKg = Math.max(0, s.landerDescentPropKg - propellantForDv(m0, dv, L.ispS!));
}
/** Battery margin over what the worst eclipse needs (design figure, as a fraction). */
export function batteryMargin(s: MissionState): number {
  const need = s.stats.power.eclipseWh * 1.2;
  return need > 0 ? (s.stats.power.batteryWh - need) / need : 1;
}
const landerBatteryFrac = (s: MissionState) => (s.stats.lander.batteryWh ? s.landerBatteryWh / s.stats.lander.batteryWh : 1);
const daysLeft = (s: MissionState) => Math.max(1, s.stats.missionDays - s.t / K.DAY);
/** Card 11 (A8): the leak loses this much oxygen a day (G; matches option C's cost on Hard). */
export const LEAK_O2_LB_PER_DAY = 8;
/** Days the oxygen on board lasts for the crew at 2.0 lb each per day, plus the leak when counted. */
export const oxygenDays = (s: MissionState, leak = true) => kgToLb(s.o2Kg) / (s.stats.crew * LIFE_SUPPORT_LB.oxygen.v + (leak ? LEAK_O2_LB_PER_DAY : 0));
const o2Need = (s: MissionState) => s.crewOnCsm * daysLeft(s) * K.O2_KG_PER_CREW_DAY * (1 - s.o2Recovery);
const o2Margin = (s: MissionState) => s.o2Kg / Math.max(1e-6, o2Need(s)) - 1;
/** Crew time costs supplies: 15 lb per crew-day. */
export function spendDays(s: MissionState, days: number) {
  if (days <= 0) return;
  const n = Math.max(1, s.crewOnCsm);
  s.o2Kg -= n * days * K.O2_KG_PER_CREW_DAY;
  s.waterKg -= n * days * K.WATER_KG_PER_CREW_DAY;
  s.foodKg -= n * days * K.FOOD_KG_PER_CREW_DAY;
}
const supplyLb = (s: MissionState, days: number) => lb(Math.max(1, s.crewOnCsm) * days * (K.O2_KG_PER_CREW_DAY + K.WATER_KG_PER_CREW_DAY + K.FOOD_KG_PER_CREW_DAY));
const thrusters = (s: MissionState) => s.stats.spec?.thrusterCount ?? 0;
const shieldMph = (s: MissionState) => s.stats.spec?.capsule.shieldMph ?? 25_000;
const hasSpareSeal = (s: MissionState) => specOf(s.design).fixes.includes('spareSeal');
const apolloLanderAttached = (s: MissionState) => s.landerAttached && specOf(s.design).architecture === 'apollo';
const usesHydrogen = (s: MissionState) => {
  const r = s.stats.spec?.rocketBuild;
  return !!r && [r.stage1.engine, r.stage2.engine].some((e) => e === 'rs25' || e === 'rl10');
};
const pct = (f: number) => `${Math.round(f * 100)}%`;
const rank = (s: MissionState) => ({ Low: 1, Medium: 2, High: 3 }[s.stats.spec?.tankRisk ?? 'Low']);

/** "Mission fail" on Hard; "abort, crew safe" on Easy (spec tab 7). */
function failOrAbort(s: MissionState, c: Ctx, reason: string): string {
  if (c.easy) { abortMission(s, `${reason} On Easy the crew aborts safely instead.`); return `${reason} (Easy: abort, crew safe.)`; }
  loseCrew(s, reason);
  return reason;
}
function launchHit(s: MissionState, dv: number, why: string): string {
  const e = em(s);
  e.rocketSpare -= dv;
  if (e.rocketSpare < 0) { abortMission(s, `${why} The rocket fell ${fmt(-e.rocketSpare)} m/s short of the Moon; the crew came home from Earth orbit.`); return `${why} The rocket is ${fmt(-e.rocketSpare)} m/s short: abort to Earth orbit, crew safe.`; }
  return `${why} Rocket margin now ${fmt(e.rocketSpare)} m/s.`;
}

// ------------------------------------------------------------------ cards
interface Opt { label: string; good: (s: MissionState, c: Ctx) => string; bad: (s: MissionState, c: Ctx) => string; apply: (s: MissionState, c: Ctx) => string }
export interface Card {
  id: string; n: number; title: string; stages: Stage[]; real?: string; scenario?: boolean;
  eligible: (s: MissionState) => boolean;
  weakSpot: (s: MissionState) => number; // Hard: weight toward the design's weak spots
  text: (s: MissionState) => string; hint: string;
  fd: (s: MissionState) => number; why: (s: MissionState) => string;
  options: [Opt, Opt, Opt];
}

export const DECK: Card[] = [
  {
    id: 'card1', n: 1, title: 'ENGINE OUT DURING LAUNCH', stages: ['launch'],
    real: 'One Falcon 9 engine shut down on CRS-1 (2012) and the rocket still reached orbit.',
    eligible: () => true, weakSpot: (s) => (em(s).rocketSpare < 300 ? 3 : 1),
    text: (s) => `One first-stage engine just shut down. The rest can keep burning, but every m/s counts: you have ${fmt(em(s).rocketSpare)} m/s of rocket margin.`,
    hint: 'Check your rocket margin first: is it more than 240 m/s?',
    fd: (s) => (em(s).rocketSpare >= 240 ? 0 : 2),
    why: (s) => (em(s).rocketSpare >= 240 ? 'With more than 240 m/s of margin, a flight director keeps burning.' : 'With under 240 m/s of margin the stack cannot reach the Moon: escaping now is the safe call.'),
    options: [
      { label: 'Keep burning on the remaining engines', good: () => 'Mission continues, no delay.', bad: (s, c) => `-${fmt(240 * c.k)} m/s of margin (you have ${fmt(em(s).rocketSpare)}). Under that: low orbit, come home.`, apply: (s, c) => launchHit(s, 240 * c.k, 'Burned on the remaining engines.') },
      { label: 'Abort to Earth orbit, wait for a repair flight', good: () => 'Crew safe; the Moon fuel is untouched.', bad: (_s, c) => `+30 days, -$${fmt(300 * c.k)},000,000, +${fmt(90 * c.k)} lb of supplies per crew member.`, apply: (s, c) => { em(s).extraCostM += 300 * c.k; return `Repair flight arrived after 30 days. Cost $${fmt(300 * c.k)},000,000.`; } },
      { label: 'Launch abort: the capsule escapes', good: () => 'Crew is guaranteed safe.', bad: () => 'Mission lost; score capped at 20%.', apply: (s) => { em(s).scoreCap = Math.min(em(s).scoreCap, 20); abortMission(s, 'Launch abort: the capsule escaped on its abort motor and splashed down safely.'); return 'Launch abort. The crew is safe.'; } },
    ],
  },
  {
    id: 'card2', n: 2, title: 'LIGHTNING STRIKE AFTER LIFTOFF', stages: ['launch'],
    real: 'Apollo 12 was hit twice; "SCE to AUX" brought the systems back.',
    eligible: () => true, weakSpot: (s) => (batteryMargin(s) < 0.2 ? 3 : 1),
    text: (s) => `Lightning hit the rocket twice. Guidance and power are flickering. Battery margin over eclipse needs: ${pct(batteryMargin(s))}.`,
    hint: 'Your battery margin decides whether the backup supply can carry you.',
    fd: (s) => (batteryMargin(s) >= 0.2 ? 0 : 1),
    why: (s) => (batteryMargin(s) >= 0.2 ? 'With 20%+ battery margin the backup supply holds: switch over.' : 'Without 20% battery margin, rebooting is the reliable fix.'),
    options: [
      { label: 'Switch to the backup power supply', good: () => 'Systems back in seconds, no cost.', bad: (s, c) => `Only works with battery margin >= 20% (you have ${pct(batteryMargin(s))}). Otherwise 25% chance of -${fmt(150 * c.k)} m/s.`, apply: (s, c) => { if (batteryMargin(s) >= 0.2 || c.fixed) return 'Backup supply took over. All systems nominal.'; return c.rng.chance(0.25) ? launchHit(s, 150 * c.k, 'Guidance stayed down for a while: steering losses.') : 'The backup held, just barely.'; } },
      { label: 'Reboot every computer', good: () => 'Works on any design.', bad: (_s, c) => `-10 minutes; ${fmt(5 * c.k, 1)}% chance of missing the upper-stage burn window.`, apply: (s, c) => (c.rng.chance(0.05 * c.k) ? (abortMission(s, 'The reboot took too long and the upper-stage burn window closed. Crew home from Earth orbit.'), 'Burn window missed: abort to orbit, crew safe.') : 'Computers rebooted. Back on the timeline.') },
      { label: 'Abort', good: () => 'Crew safe.', bad: () => 'Mission lost.', apply: (s) => { abortMission(s, 'Abort after the lightning strike. Crew safe.'); return 'Mission aborted. The crew is safe.'; } },
    ],
  },
  {
    id: 'card3', n: 3, title: 'UPPER STAGE WON\'T RELIGHT', stages: ['earthOrbit'], scenario: true,
    eligible: () => true, weakSpot: (s) => (capsuleSpareDv(s) < 750 ? 2 : 1),
    text: (s) => `The upper stage will not restart for the burn toward the Moon. Your capsule has ${fmt(capsuleSpareDv(s))} m/s of spare Δv.`,
    hint: 'Could your capsule spare 600 m/s and still get home?',
    fd: (s) => (capsuleSpareDv(s) >= 750 ? 1 : 0),
    why: (s) => (capsuleSpareDv(s) >= 750 ? 'With 750+ m/s spare, the capsule can push and still get home.' : 'Without 750 m/s spare, using the capsule engine risks the trip home: retry the igniter.'),
    options: [
      { label: 'Retry with the backup igniter', good: () => 'No cost if it lights.', bad: (s, c) => `30% chance it fails again (then an Earth-orbit mission); -${fmt(c.k)} day of supplies (${supplyLb(s, c.k)} lb).`, apply: (s, c) => { spendDays(s, c.k); if (!c.fixed && c.rng.chance(0.3)) { em(s).scienceAdj += 0.3 * (s.stats.spec?.science.plannedPoints ?? 0); abortMission(s, 'The upper stage never relit. The crew flew an Earth-orbit test mission instead.'); return 'Second relight failed: Earth-orbit test mission, crew safe.'; } return 'The backup igniter lit. On to the Moon!'; } },
      { label: 'Use the capsule engine for part of the push', good: () => 'Still going to the Moon.', bad: (s, c) => `-${fmt(600 * c.k)} m/s of capsule Δv (you have ${fmt(capsuleSpareDv(s))} spare) and it forces the halo orbit.`, apply: (s, c) => { spendCapsuleDv(s, 600 * c.k); s.design.spec = { ...specOf(s.design), orbit: 'NRHO' }; if (propMarginKg(s) < 0) return failOrAbort(s, c, `The capsule used too much fuel pushing toward the Moon and cannot get home.`); return `The capsule finished the push. Now heading for the halo orbit; ${fmt(capsuleSpareDv(s))} m/s spare.`; } },
      { label: 'Stay in Earth orbit and run a test mission', good: () => 'Crew safe, and Earth-orbit tests earn 30% of the science.', bad: () => 'No Moon landing.', apply: (s) => { em(s).scienceAdj += 0.3 * (s.stats.spec?.science.plannedPoints ?? 0); abortMission(s, 'TOWN-1 stayed in Earth orbit and ran a test mission.'); return 'Earth-orbit test mission. Crew safe.'; } },
    ],
  },
  {
    id: 'card4', n: 4, title: 'OXYGEN TANK FAILURE', stages: ['coast'],
    real: 'Apollo 13\'s oxygen tank exploded; the lunar module became the lifeboat.',
    eligible: () => true, weakSpot: (s) => (rank(s) >= 3 ? 3 : rank(s) >= 2 ? 2 : 1),
    text: (s) => `An oxygen tank just failed. Oxygen left: ${lb(s.o2Kg)} lb (${pct(Math.max(0, o2Margin(s)))} margin). Lander attached: ${apolloLanderAttached(s) ? 'yes' : 'no'}. Spare capsule Δv: ${fmt(capsuleSpareDv(s))} m/s.`,
    hint: 'Is your lander docked to you? It can be a lifeboat.',
    // Spec: "A if the lander is attached, otherwise C". A also needs 4+ days of lander supplies, so the
    // sound pick checks that too (an Apollo LM has 48 h), then C if 900 m/s are spare, else B.
    fd: (s) => (apolloLanderAttached(s) && s.stats.lander.stayCapacityH >= 96 ? 0 : capsuleSpareDv(s) >= 900 ? 2 : 1),
    why: (s) => (apolloLanderAttached(s) && s.stats.lander.stayCapacityH >= 96 ? 'With the lander attached and 4+ days of its supplies, Apollo 13\'s lifeboat plan gives the best survival odds.' : capsuleSpareDv(s) >= 900 ? 'No usable lifeboat: with 900+ m/s spare, burn straight home.' : 'No usable lifeboat and not enough spare fuel for a direct abort: pressing on is the only call left.'),
    options: [
      { label: 'Lifeboat: live in the lander, loop the Moon home', good: () => 'Highest survival chance.', bad: (s) => `Science = 0 and the lander is thrown away. Needs the lander attached (${apolloLanderAttached(s) ? 'yes' : 'NO'}) and 4+ days of lander supplies (${fmt(s.stats.lander.stayCapacityH / 24, 1)}).`, apply: (s, c) => { if (!c.fixed && (!apolloLanderAttached(s) || s.stats.lander.stayCapacityH < 96)) return failOrAbort(s, c, 'There was no lander lifeboat to shelter in.'); em(s).scienceMult = 0; lifeboatReturn(s); return 'The crew moved into the lander and looped the Moon toward home.'; } },
      { label: 'Continue and land on the remaining oxygen', good: () => 'Full science if it works.', bad: (s, c) => `Loses ${fmt(50 * c.k)}% of the oxygen; needs a 50% oxygen margin (you have ${pct(Math.max(0, o2Margin(s)))}).`, apply: (s, c) => { const before = o2Margin(s); s.o2Kg *= 1 - 0.5 * c.k; if (!c.fixed && before < 0.5) return failOrAbort(s, c, 'The remaining oxygen could not last the trip home.'); return `Pressing on. Oxygen left: ${lb(s.o2Kg)} lb.`; } },
      { label: 'Direct abort burn home now', good: () => 'Fastest way home (-1.5 days).', bad: (s) => `Needs 900 m/s of spare capsule Δv (you have ${fmt(capsuleSpareDv(s))}) and burns the whole reserve.`, apply: (s, c) => { if (!c.fixed && capsuleSpareDv(s) < 900) return failOrAbort(s, c, 'There was not enough spare capsule fuel for a direct abort.'); s.propKg = Math.max(0, s.propKg - Math.max(0, propMarginKg(s))); turnBack(s, 1.5); return 'Abort burn complete: heading straight home.'; } },
    ],
  },
  {
    id: 'card5', n: 5, title: 'CO2 FILTERS CLOGGING', stages: ['coast'],
    real: 'On Apollo 13 the crew taped together an adapter so square filters fit round sockets.',
    eligible: () => true, weakSpot: () => 1,
    text: () => 'Carbon dioxide is building up in the cabin: the filters are clogging faster than planned.',
    hint: 'A flight director likes the free fix if the crew has time.',
    fd: () => 0, why: () => 'Building the adapter costs nothing but crew time: it is what Apollo 13 did.',
    options: [
      { label: 'Build an adapter from spare parts', good: () => 'Free, and earns the Flight Director bonus.', bad: (_s, c) => `-${fmt(3 * c.k, 1)} hours of crew time; ${fmt(10 * c.k)}% chance it leaks and CO2 creeps back.`, apply: (s, c) => { spendDays(s, (3 * c.k) / 24); if (c.rng.chance(0.1 * c.k)) { s.condition -= 10; return 'The adapter leaked a little: the crew feels it.'; } return 'Tape, hoses and a flight-plan cover: the adapter works.'; } },
      { label: 'Borrow the lander\'s filters', good: () => 'Instant fix.', bad: (s, c) => `-${fmt(c.k, 1)} day of lander supplies (lander rated ${fmt(s.stats.lander.stayCapacityH)} h).`, apply: (s, c) => { em(s).landerLostH += 24 * c.k; return `Lander filters installed. The surface stay can now be ${fmt(24 * c.k)} h shorter.`; } },
      { label: 'Cut crew activity so they breathe less', good: () => 'No parts used.', bad: (_s, c) => `-${fmt(20 * c.k)}% coast science; tired crew (+${fmt(5 * c.k, 1)}% chance of a mistake on the next burn).`, apply: (s, c) => { em(s).scienceMult *= 1 - 0.2 * c.k; em(s).burnRisk += 0.05 * c.k; return 'The crew rests. Less science, but the air holds.'; } },
    ],
  },
  {
    id: 'card6', n: 6, title: 'SOLAR STORM WARNING', stages: ['coast', 'surface'], scenario: true,
    eligible: () => true, weakSpot: (s) => (s.stats.parts.some((p) => p.id === 'saf_shelter') ? 1 : 2),
    text: (s) => `A solar particle storm arrives in 30 minutes. Crew dose so far: ${fmt(s.radiationDoseMSv)} mSv. ${s.phase === 'SURFACE' ? 'The crew is on the Moon.' : 'The crew is in the capsule.'}`,
    hint: 'Radiation doses add up for life: protect the crew.',
    fd: () => 0, why: () => 'Twelve hours of shelter keeps the dose safe and costs little: the standard call.',
    options: [
      { label: 'Shelter in the most shielded spot for 12 hours', good: () => 'Radiation dose stays safe.', bad: (s, c) => `-12 hours (${supplyLb(s, 0.5)} lb of supplies)${s.phase === 'SURFACE' ? `; one moonwalk lost (-${fmt(15 * c.k)} science)` : ''}.`, apply: (s, c) => { spendDays(s, 0.5 * c.k); s.radiationDoseMSv += 4; if (s.phase === 'SURFACE') em(s).scienceAdj -= 15 * c.k; return 'The crew sheltered. Dose kept low.'; } },
      { label: 'Keep working and take the dose', good: () => 'Schedule and science kept.', bad: (_s, c) => `Dose +${fmt(30 * c.k)}% of the career limit; -${fmt(20 * c.k)} safety score.`, apply: (s, c) => { s.radiationDoseMSv += 180 * c.k; em(s).safetyAdj -= 20 * c.k; s.condition -= 10 * c.k; return `The crew took ${fmt(180 * c.k)} mSv.`; } },
      { label: 'Head home early', good: () => 'Crew safe, and you\'re already heading home.', bad: (_s, c) => `-${fmt(40 * c.k)}% science.`, apply: (s, c) => { em(s).scienceMult *= 1 - 0.4 * c.k; if (s.phase === 'SURFACE') { s.surface.day = s.design.plan.stayDays; s.surface.evaUsedToday = 99; } else s.design.plan.stayDays = 1; return 'Plan cut short: the crew heads home early.'; } },
    ],
  },
  {
    id: 'card7', n: 7, title: 'COMPUTER ALARMS DURING LANDING', stages: ['landing'],
    real: 'Apollo 11 got 1202/1201 alarms; mission control said keep going.',
    eligible: (s) => s.stats.lander.present, weakSpot: (s) => (s.design.slots.guidance === 'gnc_std' ? 2 : 1),
    text: (s) => `Program alarms are flashing on the lander computer. Guidance: ${s.design.slots.guidance === 'gnc_std' ? 'the cheaper standard computer' : 'terrain-relative navigation'}.`,
    hint: 'Mission control says the computer is overloaded, not broken.',
    fd: () => 0, why: () => 'The alarms meant "too busy", not "broken": trust the ground and keep going, like Apollo 11.',
    options: [
      { label: 'Trust the ground and continue', good: () => 'No cost, Flight Director bonus.', bad: (s, c) => (s.design.slots.guidance === 'gnc_std' ? `You picked the cheapest computer: ${fmt(10 * c.k)}% chance it freezes (forced abort).` : 'Your computer is not the cheapest: no extra risk.'), apply: (s, c) => { if (s.design.slots.guidance === 'gnc_std' && c.rng.chance(0.1 * c.k)) { applyLanding(s, 'abort', 0, s.landerDescentPropKg); return 'The computer froze: forced abort to orbit. Crew safe.'; } return 'Alarms cleared. Continuing the descent.'; } },
      { label: 'Abort to orbit on the ascent stage', good: () => 'Crew safe.', bad: () => 'Landing lost; ascent fuel used.', apply: (s) => { applyLanding(s, 'abort', 0, s.landerDescentPropKg); return 'Abort stage! The crew is back in orbit.'; } },
      { label: 'Fly it manually', good: () => 'Landing kept, computer out of the loop.', bad: (s, c) => `-${fmt(90 * c.k)} m/s of descent fuel (you have ${fmt(descentMarginMs(s))} m/s spare).`, apply: (s, c) => { spendDescentDv(s, 90 * c.k); return `Manual control. Descent margin now ${fmt(descentMarginMs(s))} m/s.`; } },
    ],
  },
  {
    id: 'card8', n: 8, title: 'LOW FUEL ON FINAL APPROACH', stages: ['landing'],
    real: 'Armstrong flew past a boulder field and landed with very little fuel left.',
    eligible: (s) => s.stats.lander.present, weakSpot: (s) => (s.stats.lander.descentDvAvail - s.stats.lander.descentDvReq < 300 ? 2 : 1),
    text: (s) => `The planned site is covered in boulders. Descent margin: ${fmt(descentMarginMs(s))} m/s.`,
    hint: 'Can you afford 120 m/s more of flying?',
    fd: (s) => (descentMarginMs(s) >= 120 ? 1 : 0),
    why: (s) => (descentMarginMs(s) >= 120 ? 'With 120+ m/s of margin you can reach the planned site.' : 'Without 120 m/s of margin, set down at the nearest flat spot.'),
    options: [
      { label: 'Set down at the nearest flat spot', good: () => 'Safe landing.', bad: (_s, c) => `Far from the target: -${fmt(15 * c.k)} science (rover range).`, apply: (s, c) => { em(s).scienceAdj -= 15 * c.k; return 'Setting down short of the target.'; } },
      { label: 'Keep flying to the planned site', good: () => 'Full science, +10 for hitting the target.', bad: (s) => `Needs 120 m/s of descent margin (you have ${fmt(descentMarginMs(s))}), or the lander crashes.`, apply: (s, c) => { if (!c.fixed && descentMarginMs(s) < 120) { if (c.easy) { applyLanding(s, 'abort', 0, s.landerDescentPropKg); return 'Not enough fuel to reach the site. (Easy: abort to orbit, crew safe.)'; } applyLanding(s, 'crash', 6, 0); return 'The lander ran out of fuel short of the site.'; } spendDescentDv(s, 120); em(s).scienceAdj += 10; return 'Flying on to the planned site.'; } },
      { label: 'Abort to orbit', good: () => 'Crew safe.', bad: () => 'Landing lost.', apply: (s) => { applyLanding(s, 'abort', 0, s.landerDescentPropKg); return 'Abort stage. The crew is back in orbit.'; } },
    ],
  },
  {
    id: 'card9', n: 9, title: 'LUNAR DUST JAMS THE HATCH SEAL', stages: ['surface'], scenario: true,
    eligible: (s) => s.stats.lander.present, weakSpot: (s) => (hasSpareSeal(s) ? 1 : 1.5),
    text: (s) => `Dust is wearing down the hatch seal. Spare seal aboard: ${hasSpareSeal(s) ? 'yes' : 'no'}.`,
    hint: 'Did you buy the spare hatch seal in the hangar?',
    fd: (s) => (hasSpareSeal(s) ? 1 : 0),
    why: (s) => (hasSpareSeal(s) ? 'The spare seal fixes it perfectly.' : 'No spare: clean the seal and live with a slow leak.'),
    options: [
      { label: 'Clean the seal with brushes and wipes', good: () => 'Works, no parts used.', bad: (_s, c) => `-${fmt(2 * c.k)} hours of EVA; slow leak (-${fmt(5 * c.k)} lb of oxygen per day).`, apply: (s, c) => { s.surface.evaUsedToday += 2 * c.k; s.o2Kg -= lbToKg(5 * c.k) * s.design.plan.stayDays; return 'Seal cleaned. A slow leak remains.'; } },
      { label: 'Install the spare seal', good: () => 'Perfect seal.', bad: (s) => (hasSpareSeal(s) ? 'Uses the spare (+$2,000,000, +15 lb in the build).' : 'You did not buy a spare seal: the crew can only clean it.'), apply: (s, c) => (hasSpareSeal(s) || c.fixed ? 'Spare seal installed. Perfect.' : (s.surface.evaUsedToday += 2 * c.k, s.o2Kg -= lbToKg(5 * c.k) * s.design.plan.stayDays, 'No spare aboard: the crew cleaned the seal instead.')) },
      { label: 'Cancel the remaining moonwalks', good: () => 'No more dust; the seal holds.', bad: (_s, c) => `-${fmt(30 * c.k)} science.`, apply: (s, c) => { em(s).scienceAdj -= 30 * c.k; s.surface.day = s.design.plan.stayDays; s.surface.evaUsedToday = 99; return 'Moonwalks cancelled. Time to lift off.'; } },
    ],
  },
  {
    id: 'card10', n: 10, title: 'SCIENCE INSTRUMENT BREAKS', stages: ['surface'], scenario: true,
    eligible: (s) => s.stats.parts.some((p) => p.onLander && p.slot === 'science'), weakSpot: (s) => (batteryMargin(s) < 0.2 ? 3 : 1),
    text: (s) => `The ${brokenInstrument(s)?.name ?? 'instrument'} stopped working. Lander battery: ${pct(landerBatteryFrac(s))}.`,
    hint: 'Check the lander battery before you send the crew out.',
    fd: (s) => (landerBatteryFrac(s) >= 0.2 ? 0 : 1),
    why: (s) => (landerBatteryFrac(s) >= 0.2 ? 'With 20%+ battery, repairing saves the points.' : 'With a low battery, give its time to another instrument.'),
    options: [
      { label: 'Repair it on a moonwalk', good: () => 'Instrument saved, full points.', bad: (s, c) => `-${fmt(4 * c.k)} hours of surface time, -${fmt(200 * c.k)} Wh of battery (${fmt(s.landerBatteryWh)} Wh left).`, apply: (s, c) => { s.surface.evaUsedToday += 4 * c.k; s.landerBatteryWh = Math.max(0, s.landerBatteryWh - 200 * c.k); return 'Repaired on a moonwalk.'; } },
      { label: 'Give its time to another instrument', good: () => 'No risk; another instrument earns +50% points.', bad: (s) => `The ${brokenInstrument(s)?.name ?? 'instrument'}'s points are lost.`, apply: (s) => giveTime(s) },
      { label: 'Stay one extra day', good: () => 'Repair plus extra science (+10).', bad: (s, c) => `+${fmt(c.k)} day of supplies and battery; only if the lander allows it (rated ${fmt(s.stats.lander.stayCapacityH)} h, planned ${fmt(s.design.plan.stayDays * 24)} h).`, apply: (s, c) => { if (!c.fixed && s.stats.lander.stayCapacityH < (s.design.plan.stayDays + 1) * 24) return `The lander cannot support another day. ${giveTime(s)}`; s.design.plan.stayDays += 1; spendDays(s, c.k); s.landerBatteryWh = Math.max(0, s.landerBatteryWh - s.stats.lander.landerLoadW * 24 * c.k); em(s).scienceAdj += 10; return 'Staying an extra day to repair it.'; } },
    ],
  },
  {
    id: 'card11', n: 11, title: 'SMALL CABIN LEAK', stages: ['coast', 'lunarOrbit'],
    real: 'In 2018 the ISS crew sealed a 2 mm hole in a Soyuz with tape, epoxy and gauze.',
    eligible: () => true, weakSpot: (s) => (rank(s) >= 2 ? 2 : 1),
    text: (s) => `Cabin pressure is dropping slowly. Oxygen: ${lb(s.o2Kg)} lb, about ${fmt(oxygenDays(s), 1)} days for ${s.stats.crew} crew including the leak (${fmt(daysLeft(s), 1)} days still to fly).`,
    hint: 'Finding and patching the leak is cheap if you start now.',
    fd: () => 0, why: () => 'Patching it for good costs a few hours and 10 lb of oxygen: the sound call.',
    options: [
      { label: 'Find it and patch it', good: () => 'Leak stopped for good.', bad: (_s, c) => `-${fmt(6 * c.k)} hours, -${fmt(10 * c.k)} lb of oxygen while searching.`, apply: (s, c) => { spendDays(s, (6 * c.k) / 24); s.o2Kg -= lbToKg(10 * c.k); return 'Found it: a pinhole by a fitting. Patched.'; } },
      { label: 'Seal off the leaking module', good: () => 'Instant fix.', bad: (_s, c) => `-${fmt(25 * c.k)}% of stored supplies, locked behind the hatch.`, apply: (s, c) => { const f = 1 - 0.25 * c.k; s.o2Kg *= f; s.waterKg *= f; s.foodKg *= f; return 'Module sealed off with its supplies inside.'; } },
      { label: 'Ignore it and run on reserves', good: () => 'No time lost.', bad: (s, c) => `-${fmt(LEAK_O2_LB_PER_DAY * c.k)} lb of oxygen per day (${lb(lbToKg(LEAK_O2_LB_PER_DAY * c.k) * daysLeft(s))} lb by splashdown); you have ${lb(s.o2Kg)} lb.`, apply: (s, c) => { s.o2Kg -= lbToKg(LEAK_O2_LB_PER_DAY * c.k) * daysLeft(s); if (c.easy && s.o2Kg < o2Need(s)) s.o2Kg = o2Need(s) * 1.05; return 'Running on reserves.'; } },
    ],
  },
  {
    id: 'card12', n: 12, title: 'THRUSTERS FAILING DURING DOCKING', stages: ['lunarOrbit'],
    real: 'Starliner lost thrusters approaching the ISS in 2024; its crew came home on Dragon.',
    eligible: (s) => s.stats.lander.present, weakSpot: (s) => (thrusters(s) < 12 ? 3 : 1),
    text: (s) => `Four thrusters dropped out during the docking approach. You have ${thrusters(s)} thrusters and ${lb(s.rcsFuelKg)} lb of thruster fuel.`,
    hint: 'Count your thrusters: you need 8 working ones.',
    fd: (s) => (thrusters(s) - 4 >= 8 ? 0 : 1),
    why: (s) => (thrusters(s) - 4 >= 8 ? `With ${thrusters(s) - 4} working thrusters you can still dock slowly.` : 'Too few thrusters left: let the other vehicle do the flying.'),
    options: [
      { label: 'Dock slowly on the remaining thrusters', good: () => 'Docking happens.', bad: (s, c) => `Needs 8 working thrusters (you have ${thrusters(s) - 4} after 4 fail); +${fmt(2 * c.k)} hours, -${fmt(60 * c.k)} lb of thruster fuel.`, apply: (s, c) => { if (!c.fixed && thrusters(s) - 4 < 8) return `Not enough thrusters to steer. ${spacewalk(s, c)}`; spendDays(s, (2 * c.k) / 24); s.rcsFuelKg = Math.max(0, s.rcsFuelKg - lbToKg(60 * c.k)); return `Docked, slowly. Thruster fuel left: ${lb(s.rcsFuelKg)} lb.`; } },
      { label: 'Let the other vehicle do the docking', good: () => 'Saves your thruster fuel.', bad: (s, c) => `Both need docking systems (yours: ${specOf(s.design).docking.includes('dock_nds') ? 'yes' : 'NO'}); the other vehicle burns ${fmt(150 * c.k)} lb of its fuel.`, apply: (s, c) => (specOf(s.design).docking.includes('dock_nds') || c.fixed ? 'The lander flew the docking. Hard dock!' : `No docking system. ${spacewalk(s, c)}`) },
      { label: 'Spacewalk between vehicles', good: () => 'No docking needed.', bad: (_s, c) => `${fmt(5 * c.k, 1)}% chance it goes wrong; +${fmt(4 * c.k)} hours.`, apply: (s, c) => spacewalk(s, c) },
    ],
  },
  {
    id: 'card13', n: 13, title: 'LOSS OF SIGNAL BEFORE A BURN', stages: ['lunarOrbit'],
    eligible: () => true, weakSpot: (s) => (specOf(s.design).orbit === 'LLO' ? 3 : 0.3),
    text: (s) => `The ship slipped behind the Moon before mission control checked the next burn. Orbit: ${specOf(s.design).orbit === 'LLO' ? 'low lunar orbit (contact lost every pass)' : 'halo orbit'}. Spare capsule Δv: ${fmt(capsuleSpareDv(s))} m/s.`,
    hint: 'Waiting costs only a couple of hours.',
    fd: () => 0, why: () => 'Waiting one pass lets the ground double-check the burn: no risk for two hours of supplies.',
    options: [
      { label: 'Wait for the next pass', good: () => 'The ground double-checks the burn; no risk.', bad: (s, c) => `+${fmt(2 * c.k)} hours of supplies (${supplyLb(s, (2 * c.k) / 24)} lb).`, apply: (s, c) => { spendDays(s, (2 * c.k) / 24); return 'Signal back. The ground confirmed the burn.'; } },
      { label: 'Burn on onboard data alone', good: () => 'Stays on schedule.', bad: (_s, c) => `${fmt(3 * c.k, 1)}% chance of a bad burn (-${fmt(90 * c.k)} m/s).`, apply: (s, c) => (c.rng.chance(0.03 * c.k) ? (spendCapsuleDv(s, 90 * c.k), `The burn was off: ${fmt(90 * c.k)} m/s lost.`) : 'Burn on onboard data: right on target.') },
      { label: 'Switch to the halo orbit', good: () => 'Constant contact for the rest of the mission.', bad: (s, c) => `-${fmt(300 * c.k)} m/s of capsule Δv (you have ${fmt(capsuleSpareDv(s))} spare); landing from the halo needs 2,600 m/s.`, apply: (s, c) => { if (!c.fixed && capsuleSpareDv(s) < 300 * c.k) { spendDays(s, (2 * c.k) / 24); return 'Not enough spare fuel to change orbits: waiting for the next pass instead.'; } spendCapsuleDv(s, 300 * c.k); s.design.spec = { ...specOf(s.design), orbit: 'NRHO' }; return 'Now in the halo orbit: Earth stays in view.'; } },
    ],
  },
  {
    id: 'card14', n: 14, title: 'HEAT SHIELD DAMAGE SPOTTED', stages: ['return'], scenario: true,
    eligible: () => true, weakSpot: (s) => (shieldMph(s) < 26_000 ? 3 : 1),
    text: (s) => `A camera shows scuffs on the heat shield. It is rated for ${fmt(shieldMph(s))} mph; coming home from the Moon hits 24,400+ mph.`,
    hint: 'One more orbit to look closely might be worth it.',
    fd: () => 2, why: () => 'Inspecting first turns an unknown into a known: a flight director spends the extra orbit.',
    options: [
      { label: 'Steep direct re-entry', good: () => 'Less time in the heat.', bad: (_s, c) => `Higher g-forces (-${fmt(10 * c.k)} safety score); lands 300 miles off target.`, apply: (s, c) => { em(s).shieldDamage += 0.04 * c.k; em(s).safetyAdj -= 10 * c.k; return 'Steep entry planned. The recovery ship is repositioning.'; } },
      { label: 'Normal skip re-entry', good: () => 'Gentle on the crew, lands on target.', bad: (s, c) => (shieldMph(s) < 24_400 ? `Your shield is rated under 24,400 mph: ${fmt(15 * c.k, 1)}% chance of burn-through.` : `Shield rated ${fmt(shieldMph(s))} mph: the scuff costs about ${fmt(8 * c.k)}% of shield health.`), apply: (s, c) => { em(s).shieldDamage += 0.08 * c.k; if (shieldMph(s) < 24_400 && !c.fixed && c.rng.chance(0.15 * c.k)) { if (c.easy) { em(s).shieldDamage = Math.min(em(s).shieldDamage, 0.05); return 'It will be a rough ride. (Easy: no burn-through.)'; } em(s).shieldDamage = 1; } return 'Normal skip entry planned.'; } },
      { label: 'Inspect with a camera first (one extra orbit)', good: () => 'Small damage means a safe re-entry.', bad: (s, c) => `+${fmt(c.k)} day of supplies (${supplyLb(s, c.k)} lb), +${fmt(5 * c.k)}% radiation dose.`, apply: (s, c) => { spendDays(s, c.k); s.radiationDoseMSv *= 1 + 0.05 * c.k; return 'Inspection done: only surface scuffs. Safe to come home.'; } },
    ],
  },
  {
    id: 'card15', n: 15, title: 'CREW MEMBER FEELING SICK', stages: ['coast'], scenario: true,
    eligible: () => true, weakSpot: () => 1,
    text: () => 'One crew member has space motion sickness and cannot work today.',
    hint: 'Most astronauts recover in a day or two.',
    fd: () => 0, why: () => 'Medicine and a day of rest fix most space sickness. Turning back would be overkill: no bonus for that.',
    options: [
      { label: 'Medicine and rest', good: () => 'Recovers in a day.', bad: (_s, c) => `That crew member's tasks slip a day (-${fmt(5 * c.k)} science).`, apply: (s, c) => { em(s).scienceAdj -= 5 * c.k; return 'Feeling better after a day of rest.'; } },
      { label: 'Swap jobs between crew members', good: () => 'No time lost.', bad: (_s, c) => `A less-trained person does the task (+${fmt(5 * c.k, 1)}% chance of a mistake).`, apply: (s, c) => { em(s).burnRisk += 0.05 * c.k; return 'Jobs swapped. Everyone is double-checking.'; } },
      { label: 'Turn back', good: () => 'Safest.', bad: () => 'Mission lost. Mission control says this is overkill.', apply: (s) => { turnBack(s, 0); return 'Turning back for home.'; } },
    ],
  },
  {
    id: 'card16', n: 16, title: 'HYDROGEN LEAK WHILE FUELING', stages: ['pad'],
    real: 'Hydrogen leaks scrubbed Artemis I\'s launch attempts in 2022.',
    eligible: (s) => usesHydrogen(s),
    weakSpot: (s) => { const r = s.stats.spec?.risks ?? []; if (r.some((x) => x.id === 'carbon_h2')) return 3; if (specOf(s.design).fixes.includes('leakCheck')) return 0.3; return 1.5; },
    text: (s) => `Hydrogen is leaking at a fueling seal. Tank risk for this design: ${s.stats.spec?.tankRisk ?? 'Low'}.`,
    hint: 'A leak you fix now cannot surprise you during launch.',
    fd: () => 0, why: () => 'Replacing the seal costs a week but removes the risk for good: what NASA did for Artemis I.',
    options: [
      { label: 'Stop, replace the seal, try again next week', good: () => 'Leak fixed for good.', bad: (_s, c) => `+${fmt(7 * c.k, 1)} days, -$${fmt(10 * c.k)},000,000.`, apply: (s, c) => { em(s).extraCostM += 10 * c.k; return 'Seal replaced. Launch a week later.'; } },
      { label: 'Warm the seal and refill slower', good: () => 'You might still launch today.', bad: (_s, c) => `${fmt(50 * c.k)}% chance it leaks again, then the replacement anyway plus a day.`, apply: (s, c) => { if (c.rng.chance(0.5 * c.k)) { em(s).extraCostM += 10 * c.k; return 'It leaked again: seal replaced after all, eight days late.'; } return 'The seal held. Launching today!'; } },
      { label: 'Launch with the small leak', good: () => 'On schedule.', bad: (s, c) => `+${fmt(10 * c.k)}% chance of an engine problem during launch (-240 m/s; you have ${fmt(em(s).rocketSpare)} m/s of margin).`, apply: (s, c) => (c.rng.chance(0.1 * c.k) ? launchHit(s, 240, 'The leak caused an engine problem during the climb.') : 'Launched with the leak. It held.') },
    ],
  },
];
export const DECK_BY_ID: Record<string, Card> = Object.fromEntries(DECK.map((c) => [c.id, c]));

function brokenInstrument(s: MissionState) {
  return s.stats.parts.find((p) => p.onLander && p.slot === 'science' && s.landing.damaged !== p.id);
}
function giveTime(s: MissionState): string {
  const broken = brokenInstrument(s);
  if (!broken) return 'No instrument to swap.';
  s.landing.damaged = broken.id;
  const other = s.stats.parts.filter((p) => p.onLander && p.slot === 'science' && p.id !== broken.id)
    .map((p) => INSTRUMENTS.find((i) => i.id === p.id)?.points.v ?? 0).sort((a, b) => b - a)[0] ?? 0;
  em(s).scienceAdj += 0.5 * other;
  return `The ${broken.name}'s time went to another instrument (+${fmt(0.5 * other)} science).`;
}
function spacewalk(s: MissionState, c: Ctx): string {
  spendDays(s, (4 * c.k) / 24);
  if (!c.fixed && c.rng.chance(0.05 * c.k)) { s.samplesAboardKg = 0; em(s).safetyAdj -= 20 * c.k; return 'The spacewalk went badly: the sample boxes drifted away, but the crew made it.'; }
  return 'The crew spacewalked across safely.';
}

// ------------------------------------------------------------------ building and resolving
/** The PendingEvent for a card, with Good/Bad lines from the player's current numbers. */
export function buildCard(card: Card, s: MissionState, stage: Stage): PendingEvent {
  const easy = easyOf(s);
  const c: Ctx = { k: easy ? 0.5 : 1, easy, fixed: false, rng: null as unknown as Rng }; // Good/Bad lines never roll
  return {
    id: card.id, title: `${card.n}. ${card.title}`, text: card.text(s), learn: '',
    stage: STAGE_LABEL[stage], real: card.real, scenario: !!card.scenario, hint: easy ? card.hint : undefined,
    fdPick: card.fd(s),
    options: card.options.map((o, i) => ({ label: `${'ABC'[i]}. ${o.label}`, detail: '', good: o.good(s, c), bad: o.bad(s, c) })),
  };
}

/** Apply the chosen option. Returns what happened plus the flight director's view. */
export function resolveCard(card: Card, s: MissionState, option: number, rng: Rng, freeFix = false): string {
  const easy = easyOf(s);
  const c: Ctx = { k: freeFix ? 0 : easy ? 0.5 : 1, easy, fixed: freeFix, rng };
  if (freeFix) em(s).freeFixUsed = true;
  const result = card.options[option].apply(s, c);
  return `${result}${freeFix ? ' (Free fix: no Bad effect.)' : ''} Flight director: ${card.why(s)}`;
}

/** Seeded draw: Easy 3 from any phase, Hard 5 aimed at weak spots; played in mission order. */
export function scheduleDeck(s: MissionState, rng: Rng): MissionState['schedule'] {
  const hard = specOf(s.design).difficulty === 'hard';
  const n = hard ? HARD_CARDS : EASY_CARDS;
  const pool = DECK.filter((c) => c.eligible(s));
  const picks: { card: Card; stage: Stage }[] = [];
  while (picks.length < n && pool.length) {
    const card = rng.weighted(pool, (c) => (hard ? c.weakSpot(s) : 1));
    if (!card) break;
    pool.splice(pool.indexOf(card), 1);
    picks.push({ card, stage: card.stages[card.stages.length > 1 ? rng.int(0, card.stages.length - 1) : 0] });
  }
  picks.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.card.n - b.card.n);
  const H = K.HOUR;
  const windows: Partial<Record<Stage, { phases: Phase[]; at: [number, number] }>> = {
    coast: { phases: ['TRANSIT_OUT'], at: [10 * H, 62 * H] },
    lunarOrbit: { phases: ['LUNAR_ORBIT', 'LUNAR_ORBIT_POST'], at: [1 * H, 5 * H] },
    return: { phases: ['TRANSIT_BACK'], at: [8 * H, 50 * H] },
  };
  const out: MissionState['schedule'] = [];
  for (const p of picks) {
    const w = windows[p.stage];
    if (p.card.id === 'card12') out.push({ id: p.card.id, at: 0.2 * H, phases: ['LUNAR_ORBIT_POST'], stage: p.stage }); // during the rendezvous docking
    else if (w) out.push({ id: p.card.id, at: rng.range(w.at[0], w.at[1]), phases: w.phases, stage: p.stage });
    else out.push({ id: p.card.id, at: 0, phases: [], stage: p.stage }); // fired by a scene hook
  }
  // cards in the same window play in order, spaced apart
  for (const st of ['coast', 'lunarOrbit', 'return'] as Stage[]) {
    const same = out.filter((e) => e.stage === st && e.id !== 'card12').sort((a, b) => a.at - b.at);
    same.forEach((e, i) => { if (i > 0 && e.at < same[i - 1].at + 4 * H) e.at = same[i - 1].at + 4 * H; });
  }
  void log;
  return out;
}
