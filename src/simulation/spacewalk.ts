/**
 * E3: the ISS spacewalk. Move along the handrails to the broken solar array, swap the failed power unit,
 * unfold the panel and get back inside. Every move and task costs suit oxygen (minutes); mistakes cost
 * extra. Suit oxygen lasts about 8 hours (G) and 30 minutes must be left at the end (G).
 */
import { ISS } from '../data/missionConfig';
import type { IssProgress } from './issDeck';

export const HANDRAILS = 6; // moves each way between the airlock and the array
export const MOVE_MIN = { easy: 15, hard: 20 };
export const MISTAKE_MIN = { single: 15, double: 8 }; // a double tether makes a slip cheaper
export const TETHER_MOVE_EXTRA = { single: 0, double: 3 }; // clipping two tethers is slower
export const SWAP_MIN = { power: 30, wrench: 75 };
export const SWAP_BATTERY = { power: 40, wrench: 0 }; // % of the power tool battery
export const UNFOLD_MIN = 20;

/** Suit oxygen left, in minutes. */
export const o2LeftMin = (p: IssProgress) => p.suitO2Min - p.evaMin;
/** The whole planned spacewalk in minutes (no mistakes): out, swap, unfold, back. */
export function plannedMin(tool: 'power' | 'wrench', tether: 'single' | 'double', hard: boolean) {
  const move = (hard ? MOVE_MIN.hard : MOVE_MIN.easy) + TETHER_MOVE_EXTRA[tether];
  return 2 * HANDRAILS * move + SWAP_MIN[tool] + UNFOLD_MIN;
}
/** Does the plan leave the 30-minute reserve with 8 hours of suit oxygen? */
export const planFits = (tool: 'power' | 'wrench', tether: 'single' | 'double', hard: boolean, o2Min = ISS.suitO2Hours.v * 60) => o2Min - plannedMin(tool, tether, hard) >= ISS.evaReserveMin.v;
/** Spend minutes of the spacewalk. */
export function spend(p: IssProgress, min: number) { p.evaMin += min; }
/** At the end: reserve kept? ran out? */
export function evaResult(p: IssProgress): 'ok' | 'reserve' | 'out' {
  const left = o2LeftMin(p);
  return left <= 0 ? 'out' : left < ISS.evaReserveMin.v ? 'reserve' : 'ok';
}
