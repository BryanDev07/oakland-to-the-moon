/**
 * Transparent mission evaluation. Weights are GAME-DESIGN choices (not official NASA criteria):
 * Science 30%, Crew safety & return 30%, Engineering 20%, Resource efficiency 10%, Budget 10%.
 */
import { SITE_BY_ID } from '../data/mission';
import { MAPCAM_MAP_TARGET_MB, NEUTRON_TARGET_H, SPEC_MODEL } from './constants';
import { securedMB } from './mission';
import { budgetForM } from './specModel';
import { SCIENCE_TARGET_POINTS, SHIELD_ROUGH_RIDE_SAFETY } from '../data/specParts';
import { scienceMult } from '../data/roles';
import { RETRY_PENALTY } from './deck';
import { fmtLb } from './units';
import type { MissionState } from './types';

export const WEIGHTS = { science: 0.3, crew: 0.3, engineering: 0.2, resources: 0.1, budget: 0.1 };
/** Spec tab 2: the mission needs 50 science points (G). The original model used 80. */
export const SCIENCE_FULL_POINTS = SPEC_MODEL ? SCIENCE_TARGET_POINTS.v : 80;

export type Outcome = 'FULL_SUCCESS' | 'PARTIAL_SUCCESS' | 'ABORT_SAFE' | 'MISSION_LOST';

export interface ScienceLine { id: string; label: string; points: number; detail: string }
export interface MissionReport {
  outcome: Outcome;
  outcomeLabel: string;
  overall: number; // 0..100
  grade: string;
  engineeringGrade: string;
  parts: { key: keyof typeof WEIGHTS; label: string; score: number; weight: number; note: string }[];
  science: ScienceLine[];
  sciencePoints: number;
  resources: { label: string; value: string }[];
  decisions: { event: string; choice: string; fd: boolean; good?: string; bad?: string; result?: string }[];
  fdBonus: number; // Flight Director bonus (+50 per matching pick on Hard, G)
  retries: number; // landing retries after a crash (-100 points each on Hard, G)
  missionPoints: number; // overall x 10 + Flight Director bonus (G)
  failures: string[];
  recommendations: string[];
  lessons: string[];
  date: string;
  seed: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const letter = (v: number) => (v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : v >= 45 ? 'D' : 'F');

export function scienceBreakdown(s: MissionState): ScienceLine[] {
  const site = SITE_BY_ID[s.design.plan.site];
  const lines: ScienceLine[] = [];
  const has = (id: string) => s.stats.parts.some((p) => p.id === id);
  if (has('sci_mapcam')) {
    const f = clamp01(securedMB(s, 'map') / MAPCAM_MAP_TARGET_MB);
    lines.push({ id: 'map', label: 'Orbital mapping', points: 25 * f, detail: `${Math.round(f * 100)}% of target coverage secured (${(securedMB(s, 'map') / 1000).toFixed(0)} GB)` });
  }
  if (has('sci_neutron')) {
    const f = clamp01((s.instruments['sci_neutron']?.hours ?? 0) / NEUTRON_TARGET_H) * (securedMB(s, 'neutron') > 0 ? 1 : 0);
    lines.push({ id: 'neutron', label: 'Hydrogen / ice survey', points: 10 * f * site.scienceMult, detail: `${Math.round(f * 100)}% of survey (x${site.scienceMult} site value)` });
  }
  for (const [id, pts] of Object.entries(s.surface.points)) {
    if (!pts && id !== 'plaque') continue;
    const labels: Record<string, string> = { plaque: 'Oakland plaque placed', broadcast: 'Live broadcast to Oakland', seismo: 'Seismic station deployed', samples: 'Geology samples', pancam: 'Panoramic survey', retro: 'Laser retroreflector', drill: 'Deep core drilled', gpr: 'Radar map of the subsurface', rover: 'Rover traverse', regolith: 'Regolith core', skylight: 'Lava-tube skylight survey', ice: 'Polar ice sample' };
    if (id === 'samples' && s.samplesAboardKg < s.surface.samplesKg) {
      const kept = s.samplesAboardKg / Math.max(1, s.surface.samplesKg);
      lines.push({ id, label: labels[id], points: pts * kept, detail: `${fmtLb(s.samplesAboardKg)} returned (${fmtLb(s.surface.samplesKg - s.samplesAboardKg)} left behind)` });
      continue;
    }
    lines.push({ id, label: labels[id] ?? id, points: s.crewLost && id === 'samples' ? 0 : pts, detail: id === 'samples' ? `${fmtLb(s.samplesAboardKg)} returned` : '' });
  }
  return lines;
}

/** Hard: -100 mission points per landing retry; Easy retries are free. */
export function retryPenalty(s: MissionState): number {
  return s.design.spec?.difficulty === 'hard' ? (s.em?.retries ?? 0) * RETRY_PENALTY : 0;
}

export function evaluate(s: MissionState): MissionReport {
  const landed = s.landing.outcome === 'soft' || s.landing.outcome === 'hard';
  const returned = !s.crewLost && s.phase === 'COMPLETE';
  const sci = scienceBreakdown(s);
  // emergency-deck effects on science (spec tab 7: science points and % science lost)
  const E = s.em;
  if (E && E.scienceMult !== 1) { const base = sci.reduce((a, l) => a + l.points, 0); sci.push({ id: 'em_mult', label: `Emergency decisions (${Math.round((E.scienceMult - 1) * 100)}% science)`, points: base * (E.scienceMult - 1), detail: '' }); }
  if (E && E.scienceAdj) sci.push({ id: 'em_adj', label: 'Emergency decisions (science points)', points: E.scienceAdj, detail: '' });
  const roleSci = SPEC_MODEL ? scienceMult(s.design.spec?.role) : 1; // Science & Comms Lead: +20%
  if (roleSci !== 1) {
    const base = sci.reduce((a, l) => a + l.points, 0);
    sci.push({ id: 'role', label: 'Science & Comms Lead bonus (+20%)', points: base * (roleSci - 1), detail: '' });
  }
  const iss = s.iss; // E3: the ISS mission scores the solar-panel repair instead of Moon science
  if (iss) sci.splice(0, sci.length, { id: 'iss_repair', label: iss.panelFixed ? 'Solar panel repaired on the spacewalk' : iss.docked ? 'Docked, but the panel was not repaired' : 'Did not reach the station', points: (iss.panelFixed ? 50 : iss.docked ? 15 : 0) * iss.quality, detail: `Repair quality ${Math.round(iss.quality * 100)}%${iss.panelHalf ? ', panel half-open' : ''}` });
  const sciencePoints = Math.max(0, sci.reduce((a, l) => a + l.points, 0));
  const scienceScore = clamp01(sciencePoints / SCIENCE_FULL_POINTS) * (s.crewLost ? 0.3 : 1);

  const roughRide = s.flags.entryHealth != null && s.flags.entryHealth < 0.9999 && s.flags.entryHealth >= 0.9; // spec tab 6 #14
  const crewScore = returned ? clamp01(clamp01(s.condition / 100) * 0.7 + 0.3 + (roughRide ? SHIELD_ROUGH_RIDE_SAFETY.v / 100 : 0) + (E?.safetyAdj ?? 0) / 100) : 0; // + emergency safety score

  const cap = s.stats.mass.smPropKg || 1;
  const propSub = clamp01(s.propKg / (0.04 * cap));
  const powerSub = clamp01(1 - s.flags.brownoutH / 8);
  const thermalSub = clamp01(1 - s.flags.thermalH / 8);
  const acquired = Object.values(s.acquiredMB).reduce((a, b) => a + b, 0);
  const dataSub = acquired > 0 ? clamp01(1 - s.lostMB / acquired) : 0.8;
  const landSub = iss ? (iss.docked ? clamp01(1 - iss.contacts * 0.25) : 0) : s.landing.outcome === 'soft' ? 1 : s.landing.outcome === 'hard' ? 0.5 : s.landing.outcome === 'abort' ? 0.4 : s.landing.outcome === 'crash' ? 0 : 0.5;
  const engineering = (propSub + powerSub + thermalSub + dataSub + landSub) / 5 * (s.crewLost ? 0.5 : 1);

  const o2f = s.o2Kg / Math.max(1, s.stats.consumables.o2Kg), wf = s.waterKg / Math.max(1, s.stats.consumables.waterKg);
  const leftover = (o2f + wf) / 2;
  const resources = returned ? (leftover < 0.05 ? 0.3 : leftover <= 0.4 ? 1 : clamp01(1 - (leftover - 0.4) * 1.2)) : 0;

  const budgetM = budgetForM(s.design);
  const reserve = Math.round(budgetM - s.stats.costM - (E?.extraCostM ?? 0)); // emergencies can cost money
  const budget = clamp01(0.4 + 0.6 * clamp01(reserve / (0.12 * budgetM)));

  const parts = [
    { key: 'science' as const, label: iss ? 'Repair objective' : 'Scientific objectives', score: scienceScore, weight: WEIGHTS.science, note: `${sciencePoints.toFixed(0)} / ${SCIENCE_FULL_POINTS} ${iss ? 'repair' : 'science'} points` },
    { key: 'crew' as const, label: 'Crew safety & return', score: crewScore, weight: WEIGHTS.crew, note: returned ? `Crew home, condition ${Math.round(s.condition)}%` : s.lossCause ?? 'Crew not returned' },
    { key: 'engineering' as const, label: 'Engineering performance', score: engineering, weight: WEIGHTS.engineering, note: `Prop ${fmtLb(s.propKg)} left, ${s.flags.brownoutH.toFixed(1)} h brownout, ${(s.lostMB / 1000).toFixed(0)} GB lost` },
    { key: 'resources' as const, label: 'Resource efficiency', score: resources, weight: WEIGHTS.resources, note: `${Math.round(leftover * 100)}% of consumables left (ideal 5-40%)` },
    { key: 'budget' as const, label: 'Budget efficiency', score: budget, weight: WEIGHTS.budget, note: `$${reserve.toLocaleString('en-US')}M of $${budgetM.toLocaleString('en-US')}M unspent` },
  ];
  let overall = parts.reduce((a, p) => a + p.score * p.weight, 0) * 100;

  let outcome: Outcome;
  if (s.crewLost) outcome = 'MISSION_LOST';
  else if (E?.abortReason) outcome = 'ABORT_SAFE';
  else if (iss) outcome = returned && iss.docked && iss.panelFixed ? 'FULL_SUCCESS' : returned && iss.docked ? 'PARTIAL_SUCCESS' : 'ABORT_SAFE'; // ISS: docked + panel fixed + home
  else if (returned && landed && scienceScore >= (SPEC_MODEL ? 1 : 0.6)) outcome = 'FULL_SUCCESS'; // spec: 50+ points
  else if (returned && (landed || scienceScore >= 0.3)) outcome = 'PARTIAL_SUCCESS';
  else outcome = 'ABORT_SAFE';
  if (outcome !== 'FULL_SUCCESS') overall = Math.min(overall, 79);
  if (E) overall = Math.min(overall, E.scoreCap); // e.g. launch abort: capped at 20%
  if (outcome === 'MISSION_LOST') overall = Math.min(overall, 30);
  const outcomeLabel = (iss ? 'ISS: ' : '') + { FULL_SUCCESS: 'FULL MISSION SUCCESS', PARTIAL_SUCCESS: 'PARTIAL SUCCESS', ABORT_SAFE: 'MISSION ABORTED - CREW SAFE', MISSION_LOST: 'MISSION LOST' }[outcome];

  // failure causes & recommendations
  const failures: string[] = [];
  const recs: string[] = [];
  const lessons: string[] = [];
  if (s.lossCause) failures.push(s.lossCause);
  if (E?.abortReason) failures.push(E.abortReason);
  if (s.flags.stranded) recs.push('Carry more propellant margin (bigger tanks or the higher-Isp methalox engine) so an anomaly cannot strand the crew.');
  if (s.flags.tliTrimDv > 0) failures.push(`Launch vehicle underperformed by ${s.flags.tliTrimDv} m/s; the service module made up the difference.`);
  if (s.flags.brownoutH > 0) { failures.push(`Battery ran flat for ${s.flags.brownoutH.toFixed(1)} h.`); recs.push('Bigger solar wings or battery, or shed loads earlier (conserve mode, instruments off).'); lessons.push('Energy balance: when load exceeds generation, the battery drains at (P_load − P_gen) watts.'); }
  if (s.flags.thermalH > 0) { failures.push(`Radiators were overloaded for ${s.flags.thermalH.toFixed(1)} h.`); recs.push('Deployable radiators allow higher power operations.'); }
  if (s.lostMB > 1000) { failures.push(`${(s.lostMB / 1000).toFixed(0)} GB of science data was lost to a full recorder.`); recs.push('A faster antenna or larger recorder keeps up with high-rate instruments.'); lessons.push('Data storage obeys Stored = Generated − Downlinked, capped by capacity: the ground segment matters.'); }
  if (s.landing.outcome === 'hard') { failures.push('Hard landing damaged equipment and shook the crew.'); recs.push('Terrain-relative navigation helps find a safe, flat spot; the autopilot can also land for you.'); }
  if (s.landing.outcome === 'abort') { failures.push('Landing aborted: no surface operations.'); recs.push('More descent propellant margin (lighter lander payload) gives more hover time.'); }
  if (s.landing.outcome === 'none' && !s.crewLost) failures.push('The crew never attempted a landing.');
  if (s.samplesAboardKg < s.surface.samplesKg) failures.push('Some samples had to be left behind: the ascent stage could not lift them.');
  if (s.condition < 60 && !s.crewLost) { recs.push('A storm shelter and a gentler operations tempo protect crew health.'); }
  if (s.radiationDoseMSv > 50) lessons.push('Radiation shielding is mass: water and stowage between the crew and space reduce dose.');
  if (s.flags.minPropMarginKg < 300 && !s.flags.stranded) lessons.push('Your propellant margin dipped very low: small anomalies compound through the rocket equation.');
  if (!s.stats.parts.some((p) => p.slot === 'science')) recs.push('Fly at least one science instrument: science is 30% of the score.');
  if (sciencePoints < 40 && returned) recs.push('Spend more EVA time on high-value activities, or pick a higher-value landing site.');
  lessons.push('Systems engineering: every choice (mass, power, data, budget) affects every other subsystem.');
  if (s.design.plan.site === 'pole') lessons.push('Polar sites offer ice, but cost more Δv and limit communications.');
  if (!recs.length) recs.push('Try a more ambitious site or a leaner design to raise your score.');

  const engineeringGrade = letter(engineering * 100);
  return {
    outcome, outcomeLabel, overall: Math.round(overall), grade: letter(overall), engineeringGrade, parts,
    science: sci, sciencePoints,
    resources: [
      { label: 'Propellant', value: fmtLb(s.propKg) },
      { label: 'Battery', value: `${Math.round((s.batteryWh / Math.max(1, s.batteryCapWh)) * 100)}%` },
      { label: 'Oxygen', value: fmtLb(s.o2Kg) },
      { label: 'Water', value: fmtLb(s.waterKg) },
      { label: 'Data secured', value: `${((securedMB(s, 'map') + securedMB(s, 'neutron') + securedMB(s, 'pancam') + securedMB(s, 'seismo')) / 1000).toFixed(0)} GB` },
      { label: 'Samples', value: fmtLb(s.samplesAboardKg) },
      { label: 'Thruster fuel', value: fmtLb(s.rcsFuelKg ?? 0) },
    ],
    decisions: s.decisions.map((d) => ({ event: d.event, choice: d.choice, fd: !!d.fd, good: d.good, bad: d.bad, result: d.result })),
    fdBonus: E?.fdBonus ?? 0,
    missionPoints: Math.round(overall) * 10 + (E?.fdBonus ?? 0) - (E?.deskPenalty ?? 0) - retryPenalty(s),
    retries: E?.retries ?? 0,
    failures, recommendations: recs, lessons,
    date: new Date().toISOString(),
    seed: s.seed,
  };
}
