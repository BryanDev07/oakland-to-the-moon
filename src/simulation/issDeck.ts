/**
 * E5: the ISS emergency deck (3 cards on Easy, 5 on Hard; every option has a Good and a Bad line).
 * Shared with the Moon deck: engine out (1), lightning (2), small cabin leak (11). ISS versions of
 * thrusters failing during docking (12) and a sick crew member (15), and four new ISS cards.
 * The three real-event ISS cards (helmet leak 2013, tool bag 2008, array tear 2007) say "This really
 * happened" with their source (cardSources.ts, SOURCES.md); debris avoidance is a scenario.
 */
import type { Card } from './deck';
import { em, spendDays } from './deck';
import { abortMission } from './mission';
import type { MissionState } from './types';
import { fmt, kgToLb, lbToKg } from './units';
import { specOf } from './specModel';
import { ISS } from '../data/missionConfig';

export interface IssProgress {
  docked: boolean; contacts: number; dockFuelLb: number;
  tool: 'power' | 'wrench' | null; tether: 'single' | 'double' | null;
  suitO2Min: number; evaMin: number; batteryPct: number; mistakes: number;
  quality: number; // 0..1: how well the panel was fixed
  panelFixed: boolean; panelHalf: boolean; evaDone: boolean; evaAborted: boolean;
}
export const newIssProgress = (): IssProgress => ({
  docked: false, contacts: 0, dockFuelLb: 0, tool: null, tether: null,
  suitO2Min: ISS.suitO2Hours.v * 60, evaMin: 0, batteryPct: 100, mistakes: 0,
  quality: 1, panelFixed: false, panelHalf: false, evaDone: false, evaAborted: false,
});
export const issOf = (s: MissionState): IssProgress => (s.iss ??= newIssProgress());

const lb = (kg: number) => fmt(kgToLb(kg));
const thrusters = (s: MissionState) => specOf(s.design).thrusterCount ?? 0;
const o2h = (s: MissionState) => `${(issOf(s).suitO2Min / 60).toFixed(1)} h`;

export const ISS_CARDS: Card[] = [
  {
    id: 'iss12', n: 12, title: 'THRUSTERS FAILING DURING DOCKING', stages: ['docking'],
    real: 'Starliner lost thrusters approaching the ISS in 2024; its crew came home on Dragon.',
    eligible: () => true, weakSpot: (s) => (thrusters(s) < 12 ? 3 : 1),
    text: (s) => `Four thrusters dropped out on the approach. You have ${thrusters(s)} thrusters and ${lb(s.rcsFuelKg)} lb of thruster fuel.`,
    hint: 'Count your thrusters: you need 8 working ones.',
    fd: (s) => (thrusters(s) - 4 >= 8 ? 0 : 1),
    why: (s) => (thrusters(s) - 4 >= 8 ? `With ${thrusters(s) - 4} working thrusters you can still dock slowly.` : 'Too few thrusters: back off and let the station crew guide you in.'),
    options: [
      { label: 'Dock slowly on the remaining thrusters', good: () => 'Docking goes ahead.', bad: (s, c) => `Harder to steer with ${Math.max(0, thrusters(s) - 4)} thrusters; -${fmt(40 * c.k)} lb of thruster fuel.`, apply: (s, c) => { s.rcsFuelKg = Math.max(0, s.rcsFuelKg - lbToKg(40 * c.k)); return `Thruster fuel left: ${lb(s.rcsFuelKg)} lb. Fly gently.`; } },
      { label: 'Back off and troubleshoot for an orbit', good: () => 'Two thrusters come back.', bad: (_s, c) => `-${fmt(90 * c.k)} minutes of supplies; -${fmt(20 * c.k)} lb of thruster fuel.`, apply: (s, c) => { spendDays(s, (1.5 * c.k) / 24); s.rcsFuelKg = Math.max(0, s.rcsFuelKg - lbToKg(20 * c.k)); return 'One orbit later two thrusters are back.'; } },
      { label: 'Abort the docking and come home', good: () => 'Crew safe.', bad: () => 'No docking, no repair: mission lost.', apply: (s) => { abortMission(s, 'Docking aborted after the thruster failure. Crew home safe.'); return 'Docking aborted. Coming home.'; } },
    ],
  },
  {
    id: 'iss15', n: 15, title: 'CREW MEMBER FEELING SICK', stages: ['coast'], scenario: true,
    eligible: () => true, weakSpot: () => 1,
    text: () => 'One crew member has space motion sickness while you catch up to the station.',
    hint: 'Most astronauts recover in a day or two.',
    fd: () => 0, why: () => 'Medicine and rest fix most space sickness.',
    options: [
      { label: 'Medicine and rest', good: () => 'Recovers in a day.', bad: (_s, c) => `Spacewalk prep slips: -${fmt(30 * c.k)} minutes of suit time.`, apply: (s, c) => { issOf(s).suitO2Min -= 30 * c.k; return 'Feeling better after rest.'; } },
      { label: 'Swap the spacewalker', good: () => 'No time lost.', bad: (_s, c) => `A less-trained spacewalker: ${fmt(10 * c.k)}% lower repair quality.`, apply: (s, c) => { issOf(s).quality = Math.max(0, issOf(s).quality - 0.1 * c.k); return 'The backup spacewalker suits up.'; } },
      { label: 'Abort and come home', good: () => 'Safest.', bad: () => 'Mission lost: overkill for space sickness.', apply: (s) => { abortMission(s, 'Mission aborted for a sick crew member. Crew safe.'); return 'Coming home.'; } },
    ],
  },
  {
    id: 'issDebris', n: 17, title: 'DEBRIS AVOIDANCE', stages: ['coast'], scenario: true,
    eligible: () => true, weakSpot: () => 1,
    text: () => 'Tracked space junk will pass close to your orbit in two hours.',
    hint: 'A small dodge burn is cheap; doing nothing is a gamble.',
    fd: () => 0, why: () => 'The ISS itself fires thrusters to dodge debris: a small burn is the standard call.',
    options: [
      { label: 'Fire thrusters to dodge', good: () => 'Debris passes safely.', bad: (_s, c) => `-${fmt(15 * c.k)} lb of thruster fuel.`, apply: (s, c) => { s.rcsFuelKg = Math.max(0, s.rcsFuelKg - lbToKg(15 * c.k)); return 'Dodge burn done. The debris passed 3 miles away.'; } },
      { label: 'Shelter in the capsule and wait', good: () => 'No fuel spent.', bad: (_s, c) => `-${fmt(2 * c.k)} hours of supplies; 5% chance of a hit (-10 crew safety).`, apply: (s, c) => { spendDays(s, (2 * c.k) / 24); if (c.rng.chance(0.05) && !c.fixed) { em(s).safetyAdj -= 10; return 'A tiny fragment pitted a window. Crew shaken.'; } return 'It passed. Back to work.'; } },
      { label: 'Do nothing', good: () => 'No time or fuel lost.', bad: () => '15% chance of a hit (-15 crew safety).', apply: (s, c) => { if (c.rng.chance(0.15 * c.k) && !c.fixed) { em(s).safetyAdj -= 15; return 'A fragment struck the service module. Systems held.'; } return 'Lucky: it missed.'; } },
    ],
  },
  {
    id: 'issHelmet', n: 18, title: 'WATER IN THE SPACEWALKER\'S HELMET', stages: ['spacewalk'],
    real: 'Water leaked into ESA astronaut Luca Parmitano\'s helmet on a 2013 spacewalk; it was ended early.',
    eligible: () => true, weakSpot: () => 1,
    text: (s) => `Water is collecting in the helmet. Suit oxygen left: ${o2h(s)}.`,
    hint: 'Water in a helmet can be deadly: safety first.',
    fd: () => 0, why: () => 'ESA astronaut Luca Parmitano had water leak into his helmet on a 2013 spacewalk; it was ended early.',
    options: [
      { label: 'End the spacewalk now', good: () => 'Spacewalker safe inside.', bad: () => 'Repair unfinished: -40% repair quality.', apply: (s) => { const p = issOf(s); p.evaAborted = true; p.quality = Math.max(0, p.quality - 0.4); return 'Back inside safely. The panel waits for another day.'; } },
      { label: 'Keep working a short time', good: () => 'The repair may finish.', bad: (_s, c) => `${fmt(20 * c.k)}% chance of -15 crew safety.`, apply: (s, c) => { if (c.rng.chance(0.2 * c.k) && !c.fixed) em(s).safetyAdj -= 15; return 'Working fast with water in the helmet.'; } },
      { label: 'Switch to the backup cooling loop', good: () => 'The water stops.', bad: (_s, c) => `-${fmt(45 * c.k)} minutes of suit oxygen.`, apply: (s, c) => { issOf(s).suitO2Min -= 45 * c.k; return 'Backup cooling on. The water stopped.'; } },
    ],
  },
  {
    id: 'issToolbag', n: 19, title: 'TOOL BAG FLOATS AWAY', stages: ['spacewalk'],
    real: 'A tool bag floated away on a 2008 spacewalk (STS-126).',
    eligible: () => true, weakSpot: () => 1,
    text: (s) => `A tool bag drifted off its tether. Suit oxygen left: ${o2h(s)}.`,
    hint: 'Chasing things in space is risky.',
    fd: () => 1, why: () => 'A tool bag was lost on a 2008 spacewalk; crews switch to backup tools rather than chase it.',
    options: [
      { label: 'Go after it', good: () => 'Tools back.', bad: (_s, c) => `-${fmt(30 * c.k)} minutes of oxygen; ${fmt(10 * c.k)}% chance of -10 crew safety.`, apply: (s, c) => { issOf(s).suitO2Min -= 30 * c.k; if (c.rng.chance(0.1 * c.k) && !c.fixed) em(s).safetyAdj -= 10; return 'Caught it at the end of the tether.'; } },
      { label: 'Use the backup tool', good: () => 'No chase.', bad: (_s, c) => `Slower: -${fmt(20 * c.k)} minutes of oxygen.`, apply: (s, c) => { issOf(s).suitO2Min -= 20 * c.k; return 'Backup tool out. Slower, but safe.'; } },
      { label: 'Report it and finish with what you have', good: () => 'No time lost.', bad: (_s, c) => `-${fmt(15 * c.k)}% repair quality.`, apply: (s, c) => { issOf(s).quality = Math.max(0, issOf(s).quality - 0.15 * c.k); return 'Mission control logs the lost bag.'; } },
    ],
  },
  {
    id: 'issArray', n: 20, title: 'SOLAR ARRAY TEARS WHILE UNFOLDING', stages: ['spacewalk'],
    real: 'An ISS solar array tore in 2007 and was repaired on a spacewalk (STS-120).',
    eligible: () => true, weakSpot: () => 1,
    text: (s) => `The panel snagged and tore as it unfolded. Suit oxygen left: ${o2h(s)}.`,
    hint: 'A small tear can grow.',
    fd: () => 0, why: () => 'An ISS array tore in 2007 and was stitched on a spacewalk: repair it now.',
    options: [
      { label: 'Stop and stitch a repair', good: () => 'Full power from the panel.', bad: (_s, c) => `-${fmt(40 * c.k)} minutes of oxygen.`, apply: (s, c) => { issOf(s).suitO2Min -= 40 * c.k; return 'Stitched with wire "cufflinks". Holding.'; } },
      { label: 'Unfold it slowly anyway', good: () => 'No time lost.', bad: (_s, c) => `${fmt(30 * c.k)}% chance the tear grows (-30% repair quality).`, apply: (s, c) => { if (c.rng.chance(0.3 * c.k) && !c.fixed) issOf(s).quality = Math.max(0, issOf(s).quality - 0.3); return 'Unfolding slowly.'; } },
      { label: 'Leave it half-open', good: () => 'Safe and quick.', bad: () => 'Half power for the rest of the mission (-50% repair quality).', apply: (s) => { const p = issOf(s); p.panelHalf = true; p.quality = Math.max(0, p.quality - 0.5); return 'Left half-open.'; } },
    ],
  },
];
/** Shared Moon cards that also fly on the ISS mission, with their ISS stage. */
export const ISS_SHARED: Record<string, 'launch' | 'coast'> = { card1: 'launch', card2: 'launch', card11: 'coast' };
/** Tag line for the debris card (a scenario based on routine ISS practice). */
export const ISS_TAGS: Record<string, string> = {
  issDebris: 'Scenario based on real events: the ISS regularly fires thrusters to dodge debris',
};
