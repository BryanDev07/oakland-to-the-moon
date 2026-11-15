/**
 * E3: the ISS docking minigame (NASA Docking System + docking lidar). The player sets the closing speed
 * with thruster nudges; every nudge uses thruster fuel. Contact must be at most 0.1 m/s (G). Fewer than
 * 8 working thrusters make each nudge weaker and less predictable. Autopilot is allowed but uses more
 * fuel. Fixed time steps, so every speed-up gives the same result.
 */
import { ISS } from '../data/missionConfig';

export interface DockState { dist: number; v: number; fuelLb: number; usedLb: number; contacts: number; docked: boolean; failed: boolean; t: number; message: string }
export const DOCK_START_M = 120;
export const DOCK_STEP_S = 0.5; // sim seconds per physics step
export const NUDGE_MS = 0.03; // m/s per nudge (8+ thrusters)
export const NUDGE_FUEL_LB = 0.6; // lb of thruster fuel per nudge
export const AUTO_FUEL_MULT = 1.5; // autopilot fires more often
export const MAX_BAD_CONTACTS = 3;
export const newDock = (fuelLb: number): DockState => ({ dist: DOCK_START_M, v: 0.35, fuelLb, usedLb: 0, contacts: 0, docked: false, failed: false, t: 0, message: '' });

/** One thruster nudge: +1 speeds the approach up, -1 slows it. */
export function nudge(st: DockState, dir: 1 | -1, thrusters: number, auto = false, jitter = 0): boolean {
  const cost = NUDGE_FUEL_LB * (auto ? AUTO_FUEL_MULT : 1) * (thrusters < 8 ? 1.5 : 1);
  if (st.docked || st.failed || st.fuelLb < cost) { if (st.fuelLb < cost) st.message = 'Out of thruster fuel!'; return false; }
  const weak = thrusters < 8 ? 0.6 + jitter * 0.4 : 1; // fewer thrusters: weaker, less predictable nudges
  st.v = Math.max(-0.2, st.v + dir * NUDGE_MS * weak);
  st.fuelLb -= cost; st.usedLb += cost;
  return true;
}
/** The autopilot's wanted closing speed: slow down as the port gets close. */
export const autoTarget = (dist: number) => Math.min(0.4, Math.max(0.06, dist * 0.004));

/** One fixed physics step; contact at the port checks the speed limit. */
export function stepDock(st: DockState, auto: boolean, thrusters: number) {
  if (st.docked || st.failed) return;
  if (auto) {
    const want = autoTarget(st.dist);
    if (st.v > want + 0.015) nudge(st, -1, thrusters, true, 0.5);
    else if (st.v < want - 0.015) nudge(st, 1, thrusters, true, 0.5);
  }
  st.t += DOCK_STEP_S;
  st.dist -= st.v * DOCK_STEP_S;
  if (st.dist <= 0) {
    if (st.v <= ISS.contactMaxMs.v) { st.dist = 0; st.docked = true; st.message = `Hard dock at ${st.v.toFixed(2)} m/s.`; return; }
    st.contacts++;
    st.message = `Too fast: ${st.v.toFixed(2)} m/s (limit ${ISS.contactMaxMs.v}). Bounced off.`;
    st.dist = 6; st.v = -0.05;
    if (st.contacts >= MAX_BAD_CONTACTS) { st.failed = true; st.message = 'Three hard contacts: docking aborted.'; }
  }
  if (st.dist > DOCK_START_M + 40) { st.failed = true; st.message = 'Drifted away from the station.'; }
}
/** Advance by one real frame at a speed-up, always in fixed steps (same result at 1x / 2x / 4x). */
export function advanceDock(st: DockState, acc: number, frameS: number, timeScale: number, auto: boolean, thrusters: number): number {
  acc += frameS * timeScale;
  let n = 0;
  while (acc >= DOCK_STEP_S && !st.docked && !st.failed && n < 400) { stepDock(st, auto, thrusters); acc -= DOCK_STEP_S; n++; }
  return st.docked || st.failed ? 0 : acc;
}
