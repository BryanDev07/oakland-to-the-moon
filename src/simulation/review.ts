/**
 * Pre-launch design review. Distinguishes BLOCKING failures (mission cannot work as planned)
 * from WARNINGS (acceptable operational risks) and gives concrete fixes.
 */
import { Design, LV_BY_ID, SITE_BY_ID } from '../data/mission';
import { COMPONENT_BY_ID } from '../data/components';
import { analyzeDesign, DesignStats } from './spacecraft';
import { BUDGET_M, SPEC_MODEL } from './constants';
import { applySpecReview } from './specReview';
import { fmtLb } from './units';

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface ReviewCheck {
  id: string;
  title: string;
  icon: string;
  status: CheckStatus;
  value: string;
  detail: string;
  fix?: string;
  culprits: string[]; // component ids most responsible
}
export interface ReviewResult { stats: DesignStats; checks: ReviewCheck[]; blocking: number; warnings: number; go: boolean }

const kg = (v: number) => (SPEC_MODEL ? fmtLb(v) : `${Math.round(v).toLocaleString('en-US')} kg`); // player sees lb (spec A3)
const kw = (w: number) => `${(w / 1000).toFixed(2)} kW`;
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

/** Ids of the heaviest selectable components (for mass/cost blame). */
function topBy(stats: DesignStats, key: 'massKg' | 'costM', n = 3): string[] {
  return stats.parts.filter((p) => p.slot !== 'science' || true).slice().sort((a, b) => {
    const av = key === 'massKg' && a.slot === 'lander' ? 15000 : key === 'massKg' && a.slot === 'tank' ? (a.propCapacityKg ?? 0) : a[key];
    const bv = key === 'massKg' && b.slot === 'lander' ? 15000 : key === 'massKg' && b.slot === 'tank' ? (b.propCapacityKg ?? 0) : b[key];
    return bv - av;
  }).slice(0, n).map((p) => p.id);
}

export function reviewDesign(d: Design): ReviewResult {
  const s = analyzeDesign(d);
  const checks: ReviewCheck[] = [];
  const lv = LV_BY_ID[d.plan.lv];
  const site = SITE_BY_ID[d.plan.site];
  const has = (id: string) => s.parts.some((p) => p.id === id);
  const slotId = (slot: string) => (d.slots[slot] as string) || '';

  if (s.missing.length) {
    checks.push({ id: 'complete', title: 'Configuration complete', icon: 'warn', status: 'fail', value: `${s.missing.length} empty`, detail: `Missing systems: ${s.missing.join(', ')}.`, fix: 'Pick a component for every required category in the hangar.', culprits: [] });
  }

  // Budget
  const over = s.costM - BUDGET_M;
  checks.push({
    id: 'budget', title: 'Mission budget', icon: 'cost', status: over > 0 ? 'fail' : over > -150 ? 'warn' : 'pass',
    value: `$${s.costM.toLocaleString('en-US')}M / $${BUDGET_M.toLocaleString('en-US')}M`,
    detail: over > 0 ? `Over budget by $${over}M.` : `$${-over}M in reserve.`,
    fix: over > 0 ? 'Choose a cheaper launch vehicle or lander, or drop costly optional systems.' : over > -150 ? 'Little budget reserve; real programs keep 20-30% for surprises.' : undefined,
    culprits: over > 0 ? topBy(s, 'costM') : [],
  });

  // Launch mass
  checks.push({
    id: 'launch_mass', title: 'Launch mass vs rocket', icon: 'rocket',
    status: s.lv.marginKg < 0 ? 'fail' : s.lv.marginPct < 0.03 ? 'warn' : 'pass',
    value: `${kg(s.mass.tliKg)} / ${kg(lv.tliCapacityKg)}`,
    detail: s.lv.marginKg < 0 ? `${lv.name} cannot send ${kg(s.mass.tliKg)} toward the Moon: ${kg(-s.lv.marginKg)} too heavy.` : `Margin ${kg(s.lv.marginKg)} (${pct(s.lv.marginPct)}).`,
    fix: s.lv.marginKg < 0 ? 'Use a bigger rocket, smaller propellant tanks, a lighter lander, or remove heavy optional systems.' : s.lv.marginPct < 0.03 ? 'Thin margin: mass usually grows during development.' : undefined,
    culprits: s.lv.marginKg < 0 ? topBy(s, 'massKg') : [],
  });

  // Propulsion feasibility
  const pm = s.propulsion;
  checks.push({
    id: 'propulsion', title: 'Service module Δv', icon: 'fuel',
    status: pm.marginKg < 0 ? 'fail' : pm.marginPct < 0.06 ? 'warn' : 'pass',
    value: `need ${kg(pm.requiredKg)} of ${kg(pm.capacityKg)}`,
    detail: pm.marginKg < 0
      ? `Not enough propellant for orbit insertion + return (${Math.round(pm.dvRequired)} m/s). Short by ${kg(-pm.marginKg)}.`
      : `Propellant margin ${kg(pm.marginKg)} (${pct(pm.marginPct)}) for ${Math.round(pm.dvRequired)} m/s of burns.`,
    fix: pm.marginKg < 0 ? 'Add tank capacity, switch to the higher-Isp methalox engine, or reduce stack mass (lander, crew, heavy systems).' : pm.marginPct < 0.06 ? 'Less than 6% reserve: a propulsion anomaly could strand the crew.' : undefined,
    culprits: pm.marginKg < 0 ? [slotId('tank'), slotId('propulsion'), slotId('lander')].filter(Boolean) : [],
  });

  // Lander
  if (s.lander.present) {
    const L = s.lander;
    const descentOk = L.descentDvAvail >= L.descentDvReq, ascentOk = L.ascentDvAvail >= L.ascentDvReq;
    checks.push({
      id: 'lander_dv', title: 'Lander Δv (m/s)', icon: 'moon',
      status: !descentOk || !ascentOk ? 'fail' : L.approachPropKg < 400 ? 'warn' : 'pass',
      value: `↓${Math.round(L.descentDvAvail)}/${L.descentDvReq} ↑${Math.round(L.ascentDvAvail)}/${L.ascentDvReq}`,
      detail: !descentOk ? 'The lander cannot carry its payload down to the surface.' : !ascentOk ? 'The ascent stage cannot lift crew + max samples back to orbit.' : `${kg(L.approachPropKg)} of propellant left for the final approach & hover.`,
      fix: !descentOk || !ascentOk ? 'Remove surface payload, choose the larger lander, or land fewer crew.' : L.approachPropKg < 400 ? 'Little hover time: pick a smoother site or lighten the lander.' : undefined,
      culprits: !descentOk || !ascentOk ? [slotId('lander'), ...s.parts.filter((p) => p.onLander).map((p) => p.id)] : [],
    });
    const stayOk = L.stayCapacityH >= L.plannedStayH;
    checks.push({
      id: 'stay', title: 'Surface stay capability', icon: 'clock', status: stayOk ? (L.stayCapacityH < L.plannedStayH * 1.15 ? 'warn' : 'pass') : 'fail',
      value: `${Math.round(L.plannedStayH)} h planned / ${Math.round(L.stayCapacityH)} h max`,
      detail: stayOk ? `Lander batteries & consumables support ${Math.round(L.stayCapacityH)} h for ${s.landingCrew} crew.` : 'The lander cannot support the planned surface stay.',
      fix: stayOk ? undefined : 'Shorten the surface stay or choose the Pathfinder lander.',
      culprits: stayOk ? [] : [slotId('lander')],
    });
  }

  // Power balance
  const P = s.power;
  const fuelcellShort = P.genKind === 'fuelcell' && P.missionEnergyWh > P.reactantWh;
  checks.push({
    id: 'power', title: 'Orbit-average power', icon: 'power',
    status: P.orbitAvgGenW < P.nominalLoadW || fuelcellShort ? 'fail' : P.orbitAvgGenW < P.peakLoadW ? 'warn' : 'pass',
    value: `${kw(P.orbitAvgGenW)} gen / ${kw(P.peakLoadW)} load`,
    detail: fuelcellShort ? 'Fuel cell reactants run out before the mission ends.'
      : P.orbitAvgGenW < P.nominalLoadW ? 'Generation in lunar orbit (incl. ~40% darkness) cannot even support basic loads.'
      : P.orbitAvgGenW < P.peakLoadW ? 'Enough for the crew, but science instruments must be duty-cycled in lunar orbit.' : 'Positive power balance with all instruments on.',
    fix: P.orbitAvgGenW < P.nominalLoadW ? 'Choose bigger solar wings or remove power-hungry systems (regenerative ECLSS, methalox cryocoolers).' : P.orbitAvgGenW < P.peakLoadW ? 'Bigger arrays would allow continuous science.' : undefined,
    culprits: P.orbitAvgGenW < P.peakLoadW ? P.loadLines.filter((l) => l.ids.length).sort((a, b) => b.w - a.w).slice(0, 2).flatMap((l) => l.ids).concat(slotId('power')) : [],
  });

  // Battery reserves
  const eclipseOk = P.eclipseWh <= P.batteryWh * 0.8;
  checks.push({
    id: 'battery', title: 'Battery reserves', icon: 'battery',
    status: !eclipseOk ? 'fail' : P.safeModeH < 5 ? 'warn' : 'pass',
    value: `${(P.batteryWh / 1000).toFixed(0)} kWh  (${P.safeModeH.toFixed(1)} h safe mode)`,
    detail: !eclipseOk ? `Each lunar-orbit eclipse needs ${(P.eclipseWh / 1000).toFixed(1)} kWh, more than 80% of the battery.` : P.genKind === 'solar' ? `Eclipse draw ${(P.eclipseWh / 1000).toFixed(1)} kWh per orbit.` : 'Fuel cells run through eclipses; battery covers faults.',
    fix: !eclipseOk ? 'Install a larger battery.' : P.safeModeH < 5 ? 'Under 5 h of safe-mode power if generation fails; a larger battery buys time.' : undefined,
    culprits: !eclipseOk || P.safeModeH < 5 ? [slotId('battery')] : [],
  });

  // Thermal
  const T = s.thermal;
  checks.push({
    id: 'thermal', title: 'Heat rejection', icon: 'thermal',
    status: T.heatNominalW > T.rejectW ? 'fail' : T.heatPeakW > T.rejectW ? 'warn' : 'pass',
    value: `${kw(T.heatPeakW)} heat / ${kw(T.rejectW)} radiators`,
    detail: T.heatNominalW > T.rejectW ? 'Radiators cannot reject the heat of basic operations: the cabin would overheat.' : T.heatPeakW > T.rejectW ? 'Running every instrument at once would exceed radiator capacity.' : 'Radiators can reject all waste heat.',
    fix: T.heatPeakW > T.rejectW ? 'Use deployable radiators or reduce electrical loads.' : undefined,
    culprits: T.heatPeakW > T.rejectW ? [slotId('thermal')] : [],
  });

  // Life support
  checks.push({
    id: 'life', title: 'Life support', icon: 'o2', status: 'pass',
    value: `${s.consumableDays.toFixed(1)} days loaded`,
    detail: `${s.crew} crew x ${s.missionDays.toFixed(1)} planned days + reserve: ${kg(s.consumables.totalKg)} of O2, water & food.`,
    culprits: [],
  });

  // Communications / data
  const C = s.comms;
  const dataShort = C.estOrbitDataMB > C.storageMB + C.estOrbitDownlinkMB;
  checks.push({
    id: 'comms', title: 'Communications & data', icon: 'comms',
    status: dataShort ? 'warn' : 'pass',
    value: `${C.mbps} Mbps, ${(C.storageMB / 1000).toFixed(0)} GB`,
    detail: dataShort ? `Mapping makes ~${(C.estOrbitDataMB / 1000).toFixed(0)} GB but storage + downlink handle ~${((C.storageMB + C.estOrbitDownlinkMB) / 1000).toFixed(0)} GB: some data will be lost.` : site.surfaceCommAvailability < 1 ? `At ${site.short} Earth is low on the horizon: surface link only ~${Math.round(site.surfaceCommAvailability * 100)}% of the time.` : 'Link and storage can handle planned data.',
    fix: dataShort ? 'Add a faster antenna (HGA or laser) or a bigger recorder, or accept partial mapping.' : undefined,
    culprits: dataShort ? [slotId('comms'), slotId('storage')] : [],
  });

  // Science
  const sci = d.science.length;
  checks.push({
    id: 'science', title: 'Science objectives', icon: 'science', status: sci === 0 ? 'warn' : 'pass',
    value: `${sci} instrument${sci === 1 ? '' : 's'} at ${site.short}`,
    detail: sci === 0 ? 'No instruments: the crew can land, but will return little science (30% of score).' : `Site science value x${site.scienceMult}.` + (has('sci_samples') ? ` Up to ${s.lander.sampleCapacityKg} kg of samples.` : ''),
    fix: sci === 0 ? 'Add at least one science instrument.' : undefined,
    culprits: [],
  });

  // Safety margins
  checks.push({
    id: 'safety', title: 'Safety & reliability', icon: 'safety', status: s.reliability < 0.9 || s.heatShield.effectiveMargin < 1.25 ? 'warn' : 'pass',
    value: `${pct(s.reliability)} reliability, shield x${s.heatShield.effectiveMargin.toFixed(2)}`,
    detail: `Estimated probability of no critical failure (simplified product of component reliabilities). Heat shield margin x${s.heatShield.effectiveMargin.toFixed(2)} for a ${kg(s.heatShield.entryMassKg)} entry.` + (has('saf_shelter') ? ' Storm shelter installed.' : ' No storm shelter.'),
    fix: s.reliability < 0.9 ? 'Redundant avionics or higher-heritage parts would improve reliability.' : undefined,
    culprits: [],
  });

  void COMPONENT_BY_ID;
  if (SPEC_MODEL && s.spec) applySpecReview(d, s, checks);
  const blocking = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { stats: s, checks, blocking, warnings, go: blocking === 0 };
}
