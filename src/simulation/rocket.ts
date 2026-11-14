import { G0 } from './constants';

/** Tsiolkovsky rocket equation: Δv = Isp·g0·ln(m0/mf). Masses in kg, Isp in s, returns m/s. */
export function deltaV(ispS: number, m0: number, mf: number): number {
  if (m0 <= 0 || mf <= 0 || mf > m0) return 0;
  return ispS * G0 * Math.log(m0 / mf);
}

/** Propellant mass (kg) needed to give a stack of initial mass m0 a velocity change dv. */
export function propellantForDv(m0: number, dv: number, ispS: number): number {
  if (dv <= 0) return 0;
  return m0 * (1 - Math.exp(-dv / (ispS * G0)));
}

/** Δv achievable by burning `prop` kg from a stack of initial mass m0. */
export function dvFromPropellant(m0: number, prop: number, ispS: number): number {
  return deltaV(ispS, m0, m0 - Math.min(prop, m0 - 1e-6));
}

/** Mass flow rate (kg/s) of an engine with thrust F (N) and specific impulse Isp (s). */
export function massFlow(thrustN: number, ispS: number): number {
  return thrustN / (ispS * G0);
}
