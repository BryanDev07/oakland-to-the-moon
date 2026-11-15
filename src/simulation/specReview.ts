/**
 * Design-review checks for the JOSEPH_SPEC model. reviewDesign() (review.ts) calls
 * applySpecReview() once; it rewrites the checks whose meaning changed (rocket, capsule burns,
 * lander, budget, safety) and adds the new ones (capsule limits, docking, heat shield, data, risks).
 */
import type { Design } from '../data/mission';
import { MIN_LIFTOFF_TWR, MIN_THRUSTERS, MIN_UPPER_TWR, SHIELD_REQUIRED_MPH } from '../data/specParts';
import { RELIABILITY_ROLLS, UPPER_PUSH_BLOCKS_HARD } from './constants';
import { launchLocked, shieldResult, weightN } from './formulas';
import type { ReviewCheck } from './review';
import type { DesignStats } from './spacecraft';
import { fmt, fmtLb, fmtUsdM, kgToLb } from './units';
import { ISS, isIss } from '../data/missionConfig';
import { ROCKET_PRESETS } from '../data/specParts';
import { analyzeRocket } from './stack';

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
    lm.value = `${fmt(R.dvTotal)} / ${fmt(R.target)} m/s, TWR ${R.twr.toFixed(2)}`;
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

  // ---- upper-stage push (A8): stage 2 push / its starting weight in N must be at least 0.3 (G)
  {
    const R = S.rocket, up = R.upperTwr, ok = up >= MIN_UPPER_TWR.v;
    const hard = d.spec?.difficulty === 'hard';
    checks.push({
      id: 'upper_push', title: 'Upper-stage push', icon: 'rocket', status: ok ? 'pass' : hard && UPPER_PUSH_BLOCKS_HARD ? 'fail' : 'warn',
      value: `${up.toFixed(2)} (needs ${MIN_UPPER_TWR.v})`,
      detail: `Stage 2 pushes ${fmt(R.stage2.thrustN)} N against ${fmt(weightN(R.payloadKg + R.stage2.fullKg))} N of weight = ${up.toFixed(2)}.` + (ok ? '' : ' Too weak: the stage wastes fuel fighting gravity.'),
      fix: ok ? undefined : 'Add stage 2 engines or pick a stronger stage 2 engine.',
      culprits: [],
    });
  }

  // ---- heat shield (#14)
  const hs = shieldResult(S.shieldHealth);
  checks.push({
    id: 'shield', title: 'Heat shield', icon: 'safety', status: hs === 'burnthrough' ? 'fail' : hs === 'rough' ? 'warn' : 'pass',
    value: `${fmt(S.capsule.shieldMph)} mph = ${pct(S.shieldHealth)}`,
    detail: `Coming home from the Moon hits the air at ${fmt(SHIELD_REQUIRED_MPH.v)}+ mph and up to 5,000°F. Health = rating / ${fmt(SHIELD_REQUIRED_MPH.v)}.` +
      (hs === 'burnthrough' ? ' Under 90%: burn-through.' : hs === 'rough' ? ' 90-99%: rough ride (-10 crew safety).' : ''),
    fix: hs === 'safe' ? undefined : 'Pick a capsule whose heat shield is rated for lunar return.',
    culprits: hs === 'burnthrough' ? [capId] : [],
  });

  // ---- data budget (#12)
  const dataOk = S.data.mbPerDay >= S.data.needMbPerDay;
  checks.push({
    id: 'data', title: 'Data sent home', icon: 'comms', status: dataOk ? 'pass' : 'warn',
    value: `${fmt(S.data.mbPerDay)} / ${fmt(S.data.needMbPerDay)} MB/day`,
    detail: `MB per day = kbps × 86,400 × ${S.orbit.contactFraction.v} contact / 8,000. The mission needs 300 MB/day plus each instrument's data.`,
    fix: dataOk ? undefined : 'Cameras and radar make huge amounts of data: use Ka-band or laser comms.',
    culprits: dataOk ? [] : [d.slots.comms as string].filter(Boolean),
  });

  // ---- material + fuel risks: never block, warn with the fix
  const risky = S.risks.filter((r) => r.now !== 'Low');
  checks.push({
    id: 'risk', title: 'Material + fuel risks', icon: 'warn', status: risky.length ? 'warn' : 'pass',
    // short enough for the review row (A3); the detail lists every combo
    value: risky.length ? `${(['High', 'Medium', 'Low'] as const).find((l) => risky.some((r) => r.now === l)) ?? risky[0].now} risk, ${risky.length} combo${risky.length > 1 ? 's' : ''}` : `Tank risk ${S.tankRisk}`,
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

  // ---- E2: the ISS mission has no lander, surface stay or surface science; the capsule only burns to come home
  if (isIss(d)) {
    const sp0 = d.spec!;
    for (const id of ['lander_dv', 'stay', 'science']) { const i = checks.findIndex((c) => c.id === id); if (i >= 0) checks.splice(i, 1); }
    const p = byId('propulsion');
    if (p) {
      const r = S.capsuleReturn;
      p.title = 'De-orbit burn';
      p.value = `${fmt(r.dvLeft)} / ${fmt(r.need)} m/s`;
      p.detail = `${S.capsule.name} needs ${fmt(r.need)} m/s to drop out of orbit and come home; its fuel gives ${fmt(r.dvLeft)} m/s.`;
      p.status = r.pass ? 'pass' : 'fail';
      p.fix = r.pass ? undefined : 'Pick a capsule with more service-module fuel.';
      p.culprits = r.pass ? [] : [capId];
    }
    // a rocket far bigger than the station needs is a waste of money (Golden Bear on the ISS mission)
    const lm2 = byId('launch_mass');
    if (lm2 && S.rocket.pass && !S.rocketBuild.name.startsWith('Custom')) {
      const payload = S.rocket.payloadKg;
      const cheaper = (Object.keys(ROCKET_PRESETS) as (keyof typeof ROCKET_PRESETS)[])
        .map((id) => ({ id, r: analyzeRocket(ROCKET_PRESETS[id], payload, sp0.fixes, S.rocket.target) }))
        .filter((x) => x.r.pass && x.r.costUsd < S.rocket.costUsd - 50e6)
        .sort((a, b) => a.r.costUsd - b.r.costUsd)[0];
      if (cheaper) {
        lm2.status = lm2.status === 'fail' ? 'fail' : 'warn';
        lm2.detail += ` Overkill: ${ROCKET_PRESETS[cheaper.id].name} also reaches ${fmt(S.rocket.target)} m/s and saves ${fmtUsdM((S.rocket.costUsd - cheaper.r.costUsd) / 1e6)}.`;
        lm2.fix = lm2.fix ?? `A smaller rocket is enough for the station: try ${ROCKET_PRESETS[cheaper.id].name}.`;
      }
    }
    const sh = byId('shield');
    if (sh) sh.detail = `Coming home from low Earth orbit hits the air at ${fmt(ISS.speedMph.v)} mph. Health = rating / ${fmt(ISS.speedMph.v)}.` + (sh.status === 'fail' ? ' Under 90%: burn-through.' : '');
  }
  return checks;
}
