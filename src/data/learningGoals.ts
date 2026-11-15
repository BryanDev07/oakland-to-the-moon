/**
 * D1 (JOSEPH_SPEC_V2): the eight learning goals ("experience the process of designing and managing a
 * complete space mission"). Shown at the end of the briefing, toasted the first time each is met, and
 * checked off on the report's LEARNED tab with an example built from the player's own numbers.
 *
 * "Experienced" uses the existing seen-flags (store.seen['learned_<id>']), so no save format changes.
 */
import type { MissionState } from '../simulation/types';
import type { MissionReport } from '../simulation/scoring';
import { margins } from '../simulation/endSummary';
import { signalDelayS } from '../simulation/formulas';
import { signalRow } from '../simulation/calcDesk';
import { fmt, fmtUsd } from '../simulation/units';

export type GoalId = 'goal' | 'weight' | 'tradeoff' | 'orbits' | 'resources' | 'pressure' | 'far' | 'margins';
export interface LearningGoal { id: GoalId; n: number; title: string; short: string; taughtAt: string }

export const LEARNING_GOALS: LearningGoal[] = [
  { id: 'goal', n: 1, title: 'Start from the goal', short: 'start from the goal', taughtAt: 'Mission select and the briefing requirements' },
  { id: 'weight', n: 2, title: 'Weight is everything', short: 'weight is everything', taughtAt: 'Desk sheets 1-2 and stage separation' },
  { id: 'tradeoff', n: 3, title: 'Every choice is a trade-off', short: 'every choice is a trade-off', taughtAt: 'Hangar meters and role decisions' },
  { id: 'orbits', n: 4, title: 'Orbits and mission style shape everything', short: 'orbits shape everything', taughtAt: 'Mission Style tab (Apollo vs Artemis), ISS rendezvous' },
  { id: 'resources', n: 5, title: 'Manage resources in flight', short: 'manage resources in flight', taughtAt: 'Coast and surface screens' },
  { id: 'pressure', n: 6, title: 'Decide under pressure', short: 'decide under pressure', taughtAt: 'Emergency A/B/C cards' },
  { id: 'far', n: 7, title: 'Space is far', short: 'space is far', taughtAt: 'Desk sheet 5 and loss-of-signal moments' },
  { id: 'margins', n: 8, title: 'Safety margins keep crews alive', short: 'safety margins keep crews alive', taughtAt: 'Review margins, heat shield, crash and retry' },
];
export const GOAL_BY_ID = Object.fromEntries(LEARNING_GOALS.map((g) => [g.id, g])) as Record<GoalId, LearningGoal>;
export const learnedKey = (id: GoalId) => `learned_${id}`;
/** One line for the end of the briefing. */
export const WHAT_YOULL_LEARN = `What you'll learn: ${LEARNING_GOALS.map((g) => g.short).join('; ')}.`;

/** The player's own example for each goal, from the finished mission's real numbers. */
export function goalExamples(s: MissionState, rep: MissionReport): Record<GoalId, string> {
  const st = s.stats, S = st.spec;
  const R = S?.rocket;
  const top = st.costLines.slice().sort((a, b) => b.m - a.m)[0];
  const o2Start = st.consumables.o2Kg;
  const o2Pct = o2Start > 0 ? Math.round((Math.max(0, s.o2Kg) / o2Start) * 100) : 0;
  const fdHits = rep.decisions.filter((d) => d.fd).length;
  const thin = margins(s)[0];
  const orbit = S?.orbit.id ?? 'LLO';
  const delay = signalDelayS(signalRow(orbit as 'LLO' | 'NRHO').miles.v);
  return {
    goal: `Your goal needed 50 science points; you brought home ${fmt(rep.sciencePoints)}.`,
    weight: R ? `Dropping stage 1 saved about ${fmt(R.vStage2 - R.vStage2IfKept)} m/s.` : 'Every pound you carry needs more fuel to push it.',
    tradeoff: top ? `Your biggest bill was ${top.label}: ${fmtUsd(top.m * 1e6)}.` : 'Cost, weight, risk and science all moved together.',
    orbits: S ? (orbit === 'LLO'
      ? `Low orbit gave the capsule ${fmt(S.capsuleReturn.dvLeft - S.capsuleReturn.need)} m/s spare for the trip home.`
      : `The halo orbit kept constant contact but made the lander's trip ${fmt(st.lander.descentDvReq)} m/s down.`) : 'Where you park decides every burn.',
    resources: `You came home with ${o2Pct}% of your oxygen spare.`,
    pressure: rep.decisions.length ? `${fdHits} of ${rep.decisions.length} calls matched a real flight director.` : 'No emergency needed a call this time.',
    far: `Messages took ${delay.toFixed(2)} s each way.`,
    margins: thin ? `Your thinnest margin was ${thin.what}: ${Math.round(thin.spare * 100)}%.` : 'Margins are what you have left when things go wrong.',
  };
}
