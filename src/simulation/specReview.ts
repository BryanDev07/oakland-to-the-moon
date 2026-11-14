/**
 * Design-review checks for the JOSEPH_SPEC model. reviewDesign() (review.ts) calls
 * applySpecReview() once; it rewrites the checks whose meaning changed (rocket, capsule burns,
 * lander, budget, safety) and adds the new ones (capsule limits, docking, heat shield, data, risks).
 */
import type { Design } from '../data/mission';
import { MIN_LIFTOFF_TWR, MIN_THRUSTERS, MISSION_DV, SHIELD_REQUIRED_MPH } from '../data/specParts';
import { RELIABILITY_ROLLS } from './constants';
import { launchLocked, shieldResult } from './formulas';
import type { ReviewCheck } from './review';
import type { DesignStats } from './spacecraft';
import { fmt, fmtLb, fmtUsdM, kgToLb } from './units';

const pct = (f: number) => `${Math.round(f * 100)}%`;

export function applySpecReview(d: Design, s: DesignStats, checks: ReviewCheck[]): ReviewCheck[] {
  const S = s.spec!;
  const byId = (id: string) => checks.find((c) => c.id === id);
  const capId = S.capsule.id;

  // ---- budget (#15): money left must stay above $0, or launch is locked
  const budget = byId('budget');
  if (budget) {
    const left = S.budgetM - s.costM;
    const top = s.costLines.slice().sort((a, b) => b.m - a.m).slice(0, 3);
    budget.status = launchLocked(left) ? 'fail' : left < 150 ? 'warn' : 'pass';
    budget.value = `${fmtUsdM(s.costM)} / ${fmtUsdM(S.budgetM)}`;
    budget.detail = launchLocked(left)
      ? `Launch locked: ${fmtUsdM(-left)} over budget. Most expensive: ${top.map((l) => `${l.label} (${fmtUsdM(l.m)})`).join(', ')}.`
      : `${fmtUsdM(left)} left.`;
    budget.fix = launchLocked(left) ? 'Change one of the three most expensive items above.' : left < 150 ? 'Little budget reserve; real programs keep 20-30% for surprises.' : undefined;
  }

  // ---- rocket (#1-#6): payload vs what the staged rocket can push to 12,600 m/s
  const lm = byId('launch_mass');
  if (lm) {
    const R = S.rocket;
    const heavy = S.launches.length > 1 ? ` (the heavier of ${S.launches.length} launches)` : '';
    lm.title = 'Rocket Δv & TWR';
    lm.value = `${fmt(R.dvTotal)} / ${fmt(MISSION_DV.toMoon)} m/s, TWR ${R.twr.toFixed(2)}`;
    lm.detail = `${S.rocketBuild.name} carrying ${fmtLb(R.payloadKg)}${heavy}: boosters ${fmt(R.vBoosters)} + stage 1 ${fmt(R.vStage1)} + stage 2 ${fmt(R.vStage2)} = ${fmt(R.dvTotal)} m/s (${R.spare >= 0 ? `${fmt(R.spare)} spare` : `${fmt(-R.spare)} short`}). ` +
      `Liftoff push ${fmt(R.pushN)} N vs weight ${fmt(R.liftoffN)} N. Most it can carry: ${fmtLb(S.rocketCapacityKg)}.`;
    lm.status = !R.pass ? 'fail' : s.lv.marginPct < 0.03 ? 'warn' : 'pass';
    lm.fix = !R.liftsOff ? `TWR must be ${MIN_LIFTOFF_TWR.v} or more: add engines or boosters, or carry less.`
      : !R.reachesMoon ? 'Add stage 2 fuel, pick an engine with a faster exhaust, a bigger rocket, or a lighter payload.'
      : s.lv.marginPct < 0.03 ? 'Thin margin: an engine-out would end this mission.' : undefined;
  }

  // ---- capsule burns at the Moon (#8)
  const prop = byId('propulsion');
  if (prop) {
    const r = S.capsuleReturn;
    prop.title = 'Capsule burns';
    prop.value = `${fmt(r.dvLeft)} / ${fmt(r.need)} m/s home`;
    prop.detail = `${S.capsule.name} to ${S.orbit.id}: getting in (${fmt(s.propulsion.burns[0].dv)} m/s${d.spec?.architecture === 'artemis' ? '' : ', pushing the lander too'}) uses ${fmtLb(r.usedInKg)}, leaving ${fmtLb(Math.max(0, r.leftKg))} = ${fmt(r.dvLeft)} m/s to go home. Need ${fmt(r.need)}.` +
      (r.pass ? '' : ' The crew would be stuck.');
    prop.status = !r.pass ? 'fail' : s.propulsion.marginPct < 0.06 ? 'warn' : 'pass';
    prop.fix = !r.pass ? (S.orbit.id === 'LLO' ? 'Use the halo orbit (NRHO), a capsule with more service-module fuel, or a lighter stack.' : 'Pick a capsule with more service-module fuel or lighten the stack.')
      : s.propulsion.marginPct < 0.06 ? 'Less than 6% reserve: an emergency could strand the crew.' : undefined;
    prop.culprits = r.pass ? [] : [capId];
  }

  // ---- lander (#9): descent, ascent and Moon TWR
  const ld = byId('lander_dv');
  if (ld && S.lander) {
    const L = s.lander, X = S.lander;
    const twrOk = X.moonTwrDescent >= 1 && X.moonTwrAscent >= 1;
    if (!twrOk) { ld.status = 'fail'; ld.detail = `Engine too weak for Moon gravity: TWR down ${X.moonTwrDescent.toFixed(2)}, up ${X.moonTwrAscent.toFixed(2)} (need 1 or more).`; }
    else if (L.descentDvAvail < L.descentDvReq) ld.detail = `Down from ${S.orbit.id} needs ${fmt(L.descentDvReq)} m/s; the lander has ${fmt(L.descentDvAvail)}.` + (X.arrivalPropKg > 0 ? ` (${fmtLb(X.arrivalPropKg)} already spent flying itself into the halo orbit.)` : '');
    else if (L.ascentDvAvail < L.ascentDvReq) ld.detail = `Back up needs ${fmt(L.ascentDvReq)} m/s; with crew and ${fmtLb(L.sampleCapacityKg)} of rock the ascent stage has ${fmt(L.ascentDvAvail)}.`;
    ld.fix = ld.status === 'fail' ? (S.orbit.id === 'NRHO' ? 'Pick a bigger lander (the long trip from the halo orbit needs one) or use low lunar orbit.' : 'Remove surface payload, choose a larger lander, or land fewer crew.') : ld.fix;
  }

  // ---- capsule limits: seats and days
  const seatsOk = s.crew <= S.capsule.crew, daysOk = s.missionDays <= S.capsule.maxDays;
  checks.push({
    id: 'capsule', title: 'Capsule seats & days', icon: 'clock', status: seatsOk && daysOk ? 'pass' : 'fail',
    value: `${s.crew}/${S.capsule.crew} crew, ${s.missionDays.toFixed(1)}/${S.capsule.maxDays} days`,
    detail: `Days = 3 out + ${S.orbit.waitDays.v} waiting in ${S.orbit.id} + ${d.plan.stayDays} on the surface + 3 back.` + (!seatsOk ? ` ${S.capsule.name} seats only ${S.capsule.crew}.` : '') + (!daysOk ? ` ${S.capsule.name} is rated for ${S.capsule.maxDays} days.` : ''),
    fix: seatsOk && daysOk ? undefined : 'Pick a bigger capsule, fewer crew, or a shorter stay.',
    culprits: seatsOk && daysOk ? [] : [capId],
  });

  // ---- docking + thrusters
  const dockOk = S.dockingOk && S.thrustersOk && S.rcs.ok;
  checks.push({
    id: 'docking', title: 'Docking & thrusters', icon: 'guidance', status: dockOk ? 'pass' : 'fail',
    value: `${S.thrusterCount} thrusters, ${fmt(kgToLb(S.rcs.fuelKg))} lb fuel${s.lander.present && !S.dockingOk ? ', NO docking' : ''}`,
    detail: !S.dockingOk ? 'Crew can only move between capsule and lander through a NASA Docking System, guided by a docking lidar.'
      : !S.thrustersOk ? `You need at least ${MIN_THRUSTERS.v} thrusters to turn and move in every direction.`
      : !S.rcs.ok ? `${S.rcs.dockings} dockings need ${fmt(kgToLb(S.rcs.plannedKg))} lb of thruster fuel; the tank holds ${fmt(kgToLb(S.rcs.fuelKg))} lb.`
      : `Docking hardware and steering thrusters in place. Thruster fuel ${fmt(kgToLb(S.rcs.fuelKg))} lb (${fmt(S.rcs.tankGal)} gal); ${S.rcs.dockings} dockings use ${fmt(kgToLb(S.rcs.plannedKg))} lb.`,
    fix: dockOk ? undefined : !S.dockingOk ? 'Add the NASA Docking System and the docking lidar.' : !S.thrustersOk ? `Add thrusters (at least ${MIN_THRUSTERS.v}).` : 'Pick a thruster tank.',
    culprits: [],
  });

  // ---- heat shield (#14)
  const hs = shieldResult(S.shieldHealth);
  checks.push({
    id: 'shield', title: 'Heat shield', icon: 'safety', status: hs === 'burnthrough' ? 'fail' : hs === 'rough' ? 'warn' : 'pass',
    value: `${fmt(S.capsule.shieldMph)} mph = ${pct(S.shieldHealth)}`,
    detail: `Coming home from the Moon hits the air at ${fmt(SHIELD_REQUIRED_MPH.v)}+ mph and up to 5,000°F. Health = rating ÷ ${fmt(SHIELD_REQUIRED_MPH.v)}.` +
      (hs === 'burnthrough' ? ' Under 90%: burn-through.' : hs === 'rough' ? ' 90-99%: rough ride (-10 crew safety).' : ''),
    fix: hs === 'safe' ? undefined : 'Pick a capsule whose heat shield is rated for lunar return.',
    culprits: hs === 'burnthrough' ? [capId] : [],
  });

  // ---- data budget (#12)
  const dataOk = S.data.mbPerDay >= S.data.needMbPerDay;
  checks.push({
    id: 'data', title: 'Data sent home', icon: 'comms', status: dataOk ? 'pass' : 'warn',
    value: `${fmt(S.data.mbPerDay)} / ${fmt(S.data.needMbPerDay)} MB/day`,
    detail: `MB per day = kbps × 86,400 × ${S.orbit.contactFraction.v} contact ÷ 8,000. The mission needs 300 MB/day plus each instrument's data.`,
    fix: dataOk ? undefined : 'Cameras and radar make huge amounts of data: use Ka-band or laser comms.',
    culprits: dataOk ? [] : [d.slots.comms as string].filter(Boolean),
  });

  // ---- material + fuel risks: never block, warn with the fix
  const risky = S.risks.filter((r) => r.now !== 'Low');
  checks.push({
    id: 'risk', title: 'Material + fuel risks', icon: 'warn', status: risky.length ? 'warn' : 'pass',
    value: risky.length ? risky.map((r) => `${r.combo}: ${r.now}`).join('; ') : `Tank risk ${S.tankRisk}`,
    detail: risky.length ? risky.map((r) => `${r.stage}, ${r.combo} (${r.now}): ${r.why}`).join(' ') : 'No risky material + fuel combos.',
    fix: risky.length ? risky.map((r) => r.fix).join(' ') : undefined,
    culprits: [],
  });

  // ---- safety: no chance-of-success roll any more
  const saf = byId('safety');
  if (saf && !RELIABILITY_ROLLS) {
    const shelter = s.parts.some((p) => p.id === 'saf_shelter');
    saf.title = 'Crew safety';
    saf.status = 'pass';
    saf.value = shelter ? 'Storm shelter installed' : 'No storm shelter';
    saf.detail = 'No chance-of-success rolls: risk comes only from emergencies and risky material + fuel combos.' + (shelter ? ' Storm shelter installed.' : ' No storm shelter.');
    saf.fix = undefined;
  }

  // ---- science sample line in lb
  const sci = byId('science');
  if (sci && s.lander.sampleCapacityKg) sci.detail = sci.detail.replace(/Up to [\d.]+ kg of samples\./, `Up to ${fmt(kgToLb(s.lander.sampleCapacityKg))} lb of samples.`);
  return checks;
}
