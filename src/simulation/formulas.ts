/**
 * Every formula of the Calculation Desk (JOSEPH_SPEC.md tab 6), as pure functions.
 * Mass arguments may be in any one consistent unit (the game passes kg; mass ratios are unit-free).
 * Forces are in N, speeds in m/s. Weight in N is computed by the caller (kg × G0, or lb × 4.448).
 */
import { G0 } from './constants';
import { BATTERY_MARGIN, LIFE_SUPPORT_LB, LIGHT_MILES_PER_S, MIN_LIFTOFF_TWR, MISSION_DV, MOON_G_RATIO, SHIELD_REQUIRED_MPH } from '../data/specParts';

/** #1 Weight at liftoff = payload + stage 2 (full) + stage 1 (full) + boosters. */
export function liftoffWeight(payload: number, stage2Full: number, stage1Full: number, boostersFull: number): number {
  return payload + stage2Full + stage1Full + boostersFull;
}

/** Weight force (N) of a mass in kg. */
export const weightN = (kg: number) => kg * G0;

/** #2 Thrust-to-weight ratio. Must be ≥ 1.2 to leave the pad; below 1.0 the rocket sits there. */
export function twr(totalPushN: number, weightNewtons: number): number {
  return weightNewtons > 0 ? totalPushN / weightNewtons : 0;
}
export const liftsOff = (ratio: number) => ratio >= MIN_LIFTOFF_TWR.v;

/** #3A Empty stage = k × fuel + engines (k already includes the fuel's tank multiplier). */
export function emptyStage(k: number, fuel: number, engines: number): number {
  return k * fuel + engines;
}
/** #3B Dead-weight share = empty stage ÷ weight still flying. */
export function deadWeightShare(emptyStageMass: number, flying: number): number {
  return flying > 0 ? emptyStageMass / flying : 0;
}

/** #4 Exhaust speed (m/s) = Isp × 9.81. */
export const exhaustSpeed = (ispS: number) => ispS * 9.81;

/** #5 Rocket equation: Δv = exhaust speed × ln(full ÷ empty). */
export function deltaV(ve: number, full: number, empty: number): number {
  if (full <= 0 || empty <= 0 || empty > full) return 0;
  return ve * Math.log(full / empty);
}

/** #6 Enough to reach the Moon? Δv total ≥ 12,600 m/s. */
export function reachesMoon(dvTotal: number) {
  return { pass: dvTotal >= MISSION_DV.toMoon, target: MISSION_DV.toMoon, spare: dvTotal - MISSION_DV.toMoon };
}

/** #7 Fuel needed for a Δv: R = e^(Δv ÷ ve); fuel = pushed × (R − 1) ÷ (1 − k × (R − 1)). */
export function fuelNeeded(dv: number, ve: number, k: number, pushed: number): { R: number; bottom: number; fuel: number; impossible: boolean } {
  const Rr = Math.exp(dv / ve);
  const bottom = 1 - k * (Rr - 1);
  if (bottom <= 0) return { R: Rr, bottom, fuel: Infinity, impossible: true };
  return { R: Rr, bottom, fuel: (pushed * (Rr - 1)) / bottom, impossible: false };
}

/** #8 Fuel used by a burn = weight × (1 − e^(−Δv ÷ ve)). */
export function fuelUsed(weight: number, dv: number, ve: number): number {
  return dv > 0 ? weight * (1 - Math.exp(-dv / ve)) : 0;
}

/** #8 Capsule round trip at the Moon: burn in, then the rocket equation with what is left. */
export function capsuleBurns(weight: number, fuel: number, ve: number, dvIn: number, dvOut: number) {
  const usedIn = fuelUsed(weight, dvIn, ve);
  const left = fuel - usedIn;
  const after = weight - usedIn;
  const dvLeft = left > 0 ? deltaV(ve, after, after - left) : 0;
  return { usedIn, left, dvLeft, need: dvOut, inOk: left >= 0, pass: left >= 0 && dvLeft >= dvOut };
}

/** #9 Can the engine beat Moon gravity? TWR Moon = thrust ÷ (mass × g0 × 0.165) ≥ 1. */
export function moonTwr(thrustN: number, massKg: number): number {
  return twr(thrustN, weightN(massKg) * MOON_G_RATIO.v);
}

/** #10 Supplies (lb) = crew × days × rate, one line per supply. */
export function supplies(crew: number, days: number) {
  const L = LIFE_SUPPORT_LB;
  const line = (rate: number) => crew * days * rate;
  const oxygen = line(L.oxygen.v), drinkingWater = line(L.drinkingWater.v), hygieneWater = line(L.hygieneWater.v), food = line(L.food.v);
  return { oxygen, drinkingWater, hygieneWater, food, total: oxygen + drinkingWater + hygieneWater + food };
}

/** #11 Power made = panel watts × sunlight fraction; battery Wh = watts × dark hours × 1.2. */
export const powerMade = (panelW: number, sunFraction: number) => panelW * sunFraction;
export const batteryNeededWh = (wattsUsed: number, darkHours: number) => wattsUsed * darkHours * BATTERY_MARGIN.v;
export const packsNeeded = (wh: number, packWh: number) => Math.ceil(wh / packWh);

/** #12 MB per day = kbps × 86,400 × contact fraction ÷ 8,000. */
export const mbPerDay = (kbps: number, contactFraction: number) => (kbps * 86_400 * contactFraction) / 8_000;

/** #13 Signal delay (s) = miles ÷ 186,282. */
export const signalDelayS = (miles: number) => miles / LIGHT_MILES_PER_S.v;

/** #14 Shield health = (rating mph ÷ 24,400), max 100%, minus emergency damage. */
export function shieldHealth(ratingMph: number, damage = 0): number {
  return Math.min(1, ratingMph / SHIELD_REQUIRED_MPH.v) - damage;
}
export function shieldResult(health: number): 'safe' | 'rough' | 'burnthrough' {
  return health >= 0.9999 ? 'safe' : health >= 0.9 ? 'rough' : 'burnthrough';
}

/** #15 Money left = budget − everything; at $0 or below, launch is locked. */
export const moneyLeft = (budget: number, costs: number[]) => budget - costs.reduce((a, b) => a + b, 0);
export const launchLocked = (left: number) => left <= 0;
