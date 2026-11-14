/**
 * JOSEPH_SPEC model layer: crew capsule (Orion / Apollo-class CSM / Budget), lunar orbit choice
 * (LLO / NRHO), Apollo-style single launch vs Artemis-style two launches, a staged rocket that
 * must reach 12,600 m/s, docking, thrusters, navigation and spec-sized life support and power.
 *
 * It refines the stats from analyzeDesign() (spacecraft.ts) rather than replacing that system:
 * parts, thermal, comms and storage logic all still come from there. Pure, no Phaser.
 */
import type { Design } from '../data/mission';
import { SITE_BY_ID, TEMPO_BY_ID } from '../data/mission';
import {
  BUDGETS_USD, CAPSULE_BY_ID, COAST_DAYS, DOCKING, DOCKING_FUEL_LB, FIXES, THRUSTER_FUEL_LB_PER_GAL, LAUNCH_OPS_USD, LANDER_SPEC_BY_ID, MIN_THRUSTERS, MISSION_BASE_MB_PER_DAY, NAV,
  INSTRUMENTS, ORBITS, POWER_PARTS, SCIENCE_TARGET_POINTS, ROCKET_PRESETS, RocketBuild, SpecDesign, SUPPLIES_USD_PER_CREW_DAY, THRUSTERS, THRUSTER_TANKS, OrbitSpec,
} from '../data/specParts';
import * as K from './constants';
import { deltaV as dvVe, mbPerDay, moonTwr, shieldHealth } from './formulas';
import { propellantForDv } from './rocket';
import { ActiveRisk, analyzeRocket, assessRisks, maxPayloadKg, StackStats, tankRisk } from './stack';
import type { BurnPlan, DesignStats, MassLine } from './spacecraft';
import { lbToKg } from './units';
import { budgetMult, PriceCat, priceMult, scienceMult, slotPriceCat } from '../data/roles';

/** Slots whose job the capsule now does (engine, SM tanks, heat shield). Hidden, not deleted. */
export const CAPSULE_OWNED_SLOTS = ['propulsion', 'tank', 'heatShield'];

export const DEFAULT_SPEC: SpecDesign = {
  architecture: 'apollo', orbit: 'LLO', capsule: 'cap_apollo', rocket: null,
  docking: ['dock_nds', 'dock_lidar'],
  thruster: 'rcs_mr107s', thrusterCount: 12, thrusterTank: 'tank_antrix516',
  nav: ['nav_st16', 'nav_imu', 'nav_obc'],
  landerPacks: 2, landerSolar: true,
  fixes: [], difficulty: 'easy', role: null,
};

/** The design's spec choices, with defaults filled in (old saves have none). */
export function specOf(d: Design): SpecDesign {
  return { ...DEFAULT_SPEC, ...(d.spec ?? {}) };
}
export function rocketOf(d: Design): RocketBuild {
  return specOf(d).rocket ?? ROCKET_PRESETS[d.plan.lv];
}
export function orbitOf(d: Design): OrbitSpec {
  return ORBITS[specOf(d).orbit];
}

/** Budget in $M for the design's difficulty (spec tab 6 #15). */
export function budgetForM(d: Design): number {
  if (!K.SPEC_MODEL) return K.BUDGET_M;
  const sp = specOf(d);
  return (BUDGETS_USD[sp.difficulty].v / 1e6) * budgetMult(sp.role); // Mission Commander: +5%
}

/** Speeds (m/s) for every burn after trans-lunar injection. */
export interface MissionDv { tcmOut: number; loi: number; ops: number; tei: number; tcmBack: number; descent: number; ascent: number; landerArrival: number }
export function missionDv(d: Design): MissionDv {
  if (!K.SPEC_MODEL) {
    const site = SITE_BY_ID[d.plan.site];
    return { tcmOut: K.DV_TCM_OUT, loi: site.dvLoi, ops: K.DV_ORBIT_OPS, tei: site.dvTei, tcmBack: K.DV_TCM_BACK, descent: site.dvDescent, ascent: K.DV_ASCENT, landerArrival: 0 };
  }
  const o = orbitOf(d);
  const artemis = specOf(d).architecture === 'artemis';
  // Spec tab 2: no separate correction / upkeep burns; Artemis lander pays its own way into NRHO.
  return { tcmOut: 0, loi: o.loi.v, ops: 0, tei: o.tei.v, tcmBack: 0, descent: o.down.v, ascent: o.up.v, landerArrival: artemis ? o.loi.v : 0 };
}

/** Orbit geometry for the live simulation's sunlight and radio-contact model. */
export function orbitGeom(d: Design) {
  if (!K.SPEC_MODEL) return { periodS: K.LLO_PERIOD_S, shadowFraction: K.LLO_SHADOW_FRACTION, losFraction: K.LLO_LOS_FRACTION, losCenter: K.LLO_LOS_CENTER };
  const o = orbitOf(d);
  return { periodS: o.periodH.v * K.HOUR, shadowFraction: 1 - o.sunFraction.v, losFraction: 1 - o.contactFraction.v, losCenter: K.LLO_LOS_CENTER };
}

export interface SpecStats {
  spec: SpecDesign;
  capsule: { id: string; name: string; crew: number; maxDays: number; ve: number; dryKg: number; propKg: number; shieldMph: number; solarW: number };
  orbit: OrbitSpec;
  launches: { name: string; payloadKg: number }[];
  rocket: StackStats; rocketCapacityKg: number; rocketBuild: RocketBuild;
  capsuleReturn: { usedInKg: number; leftKg: number; dvLeft: number; need: number; pass: boolean };
  lander: { arrivalPropKg: number; moonTwrDescent: number; moonTwrAscent: number; batteryWh: number; solarW: number; grossLoadW: number } | null;
  dockingOk: boolean; thrusterCount: number; thrustersOk: boolean;
  rcs: { tankGal: number; fuelKg: number; perDockingKg: number; dockings: number; plannedKg: number; ok: boolean };
  shieldHealth: number;
  data: { mbPerDay: number; needMbPerDay: number };
  risks: ActiveRisk[]; tankRisk: ActiveRisk['now'];
  padDelayDays: number;
  budgetM: number;
  science: { plannedPoints: number; target: number; lines: { id: string; points: number }[] };
}

/** Refine analyzeDesign()'s stats with the spec model. */
export function analyzeSpec(d: Design, base: DesignStats): DesignStats {
  const sp = specOf(d);
  const cap = CAPSULE_BY_ID[sp.capsule] ?? CAPSULE_BY_ID[DEFAULT_SPEC.capsule];
  const orbit = ORBITS[sp.orbit];
  const dv = missionDv(d);
  const artemis = sp.architecture === 'artemis';
  const plan = d.plan, tempo = TEMPO_BY_ID[plan.tempo];
  const parts = base.parts.filter((p) => !CAPSULE_OWNED_SLOTS.includes(p.slot));
  const lander = parts.find((p) => p.slot === 'lander');
  const pwr = parts.find((p) => p.slot === 'power');
  const isSpecLander = !!lander && !!LANDER_SPEC_BY_ID[lander.id];
  const missing = base.missing.filter((s) => !CAPSULE_OWNED_SLOTS.includes(s) && !(s === 'power' && cap.solarW.v > 0));

  // ------------------------------------------------------------ crew & days (spec tab 6 #10)
  const crew = plan.crew;
  const landingCrew = lander ? Math.min(crew - 1, lander.crewCapacity ?? 2) : 0;
  const orbitCrew = crew - landingCrew;
  const missionDays = COAST_DAYS.v + orbit.waitDays.v + plan.stayDays + COAST_DAYS.v;
  const consumableDays = missionDays + tempo.reserveDays;
  const ls = parts.find((p) => p.slot === 'lifeSupport');
  const wr = ls?.waterRecovery ?? 0, orr = ls?.o2Recovery ?? 0;
  const o2Kg = crew * consumableDays * K.O2_KG_PER_CREW_DAY * (1 - orr);
  const waterKg = crew * consumableDays * K.WATER_KG_PER_CREW_DAY * (1 - wr);
  const foodKg = crew * consumableDays * K.FOOD_KG_PER_CREW_DAY;
  const consumables = { o2Kg, waterKg, foodKg, totalKg: o2Kg + waterKg + foodKg };

  // ------------------------------------------------------------ small spec parts (docking, RCS, nav)
  const small: { label: string; kg: number; w: number; usd: number; cat?: PriceCat }[] = [];
  for (const id of sp.docking) { const p = DOCKING.find((x) => x.id === id); if (p) small.push({ label: p.name, kg: lbToKg(p.weightLb?.v ?? 0), w: p.powerW?.v ?? 0, usd: p.priceUsd.v, cat: 'spacecraft' }); }
  const thr = THRUSTERS.find((t) => t.id === sp.thruster);
  if (thr && sp.thrusterCount > 0) small.push({ label: `${sp.thrusterCount} x ${thr.name}`, kg: lbToKg(thr.weightLb?.v ?? 0) * sp.thrusterCount, w: 0, usd: thr.priceUsd.v * sp.thrusterCount, cat: 'spacecraft' });
  const ttank = THRUSTER_TANKS.find((t) => t.id === sp.thrusterTank);
  if (ttank) small.push({ label: ttank.name, kg: lbToKg(ttank.weightLb.v), w: 0, usd: ttank.priceUsd.v, cat: 'spacecraft' });
  for (const id of sp.nav) { const p = NAV.find((x) => x.id === id); if (p) small.push({ label: p.name, kg: lbToKg(p.weightLb?.v ?? 0), w: p.powerW?.v ?? 0, usd: p.priceUsd.v }); }
  // thruster fuel = tank gallons × density; every docking / rendezvous uses a fixed amount (G)
  const rcsFuelKg = ttank ? lbToKg(ttank.gallons.v * THRUSTER_FUEL_LB_PER_GAL.v) : 0;
  if (rcsFuelKg > 0) small.push({ label: 'Thruster fuel', kg: rcsFuelKg, w: 0, usd: 0 });
  if (sp.fixes.includes('spareSeal')) small.push({ label: FIXES.spareSeal.name, kg: lbToKg(FIXES.spareSeal.weightLb!.v), w: 0, usd: FIXES.spareSeal.costUsd.v, cat: 'spacecraft' });

  // ------------------------------------------------------------ crew vehicle mass
  const capDryKg = lbToKg(cap.cmLb.v + cap.smLb.v - cap.smFuelLb.v);
  const smPropKg = lbToKg(cap.smFuelLb.v);
  const csmParts = parts.filter((p) => p.slot !== 'lander' && !p.onLander);
  const lines: MassLine[] = [
    { label: `${cap.name} (crew + service module, dry)`, kg: capDryKg, ids: [cap.id] },
    { label: `Crew x${crew} + suits`, kg: crew * K.CREW_MASS_KG, ids: [] },
    { label: 'Consumables (O2, water, food)', kg: consumables.totalKg, ids: ls ? [ls.id] : [] },
    ...csmParts.map((p) => ({ label: p.name, kg: p.massKg, ids: [p.id] })),
    ...small.map((x) => ({ label: x.label, kg: x.kg, ids: [] })),
    { label: 'Service module propellant', kg: smPropKg, ids: [cap.id] },
  ];
  const csmWetKg = lines.reduce((s, l) => s + l.kg, 0);
  const csmDryKg = csmWetKg - smPropKg;

  // ------------------------------------------------------------ lander mass & surface power
  const landerPayload = parts.filter((p) => p.onLander);
  const packs = lander ? sp.landerPacks : 0;
  const solarOn = !!lander && sp.landerSolar;
  const surfacePayloadKg = landerPayload.reduce((s, p) => s + p.massKg, 0) + packs * lbToKg(POWER_PARTS.liionPack.weightLb.v) + (solarOn ? lbToKg(POWER_PARTS.landerSolar.weightLb.v) : 0);
  const landerWetKg = lander ? lander.descentDryKg! + lander.descentPropKg! + lander.ascentDryKg! + lander.ascentPropKg! + surfacePayloadKg : 0;
  if (lander) lines.push({ label: `${lander.name} (fuelled + payload)`, kg: landerWetKg, ids: [lander.id, ...landerPayload.map((p) => p.id)] });
  const launches = artemis && lander
    ? [{ name: 'Launch 1: capsule stack', payloadKg: csmWetKg }, { name: 'Launch 2: lander', payloadKg: landerWetKg }]
    : [{ name: 'Launch: capsule + lander', payloadKg: csmWetKg + landerWetKg }];
  const tliKg = Math.max(...launches.map((l) => l.payloadKg));

  // ------------------------------------------------------------ rocket (spec tab 6 #1-#6)
  const build = rocketOf(d);
  const rocket = analyzeRocket(build, tliKg, sp.fixes);
  const rocketCapacityKg = maxPayloadKg(build, sp.fixes);
  const risks = assessRisks(build, sp.fixes, sp.thruster, sp.thrusterTank);

  // ------------------------------------------------------------ cost ($M; spec tab 6 #15)
  const nLaunch = launches.length;
  // Role discounts / surcharges (spec tab 5) apply per price group.
  const rm = (cat: PriceCat) => priceMult(sp.role, cat);
  const costLines = [
    { label: cap.name, m: (cap.priceUsd.v / 1e6) * rm('spacecraft'), ids: [cap.id] as string[] },
    { label: `${build.name} rocket${nLaunch > 1 ? ` x${nLaunch}` : ''}`, m: ((rocket.costUsd * nLaunch) / 1e6) * rm('rocket'), ids: [] as string[] },
    { label: `Launch operations x${nLaunch}`, m: (LAUNCH_OPS_USD.v * nLaunch) / 1e6, ids: [] as string[] },
    { label: 'Crew supplies', m: (SUPPLIES_USD_PER_CREW_DAY.v * crew * missionDays) / 1e6, ids: [] as string[] },
    ...parts.map((p) => ({ label: p.name, m: p.costM * rm(slotPriceCat(p.slot)), ids: [p.id] })),
    ...small.filter((x) => x.usd > 0).map((x) => ({ label: x.label, m: (x.usd / 1e6) * rm(x.cat ?? 'other'), ids: [] as string[] })),
    ...(packs ? [{ label: `${packs} x ${POWER_PARTS.liionPack.name} (lander)`, m: ((packs * POWER_PARTS.liionPack.priceUsd.v) / 1e6) * rm('spacecraft'), ids: [] as string[] }] : []),
    ...(solarOn ? [{ label: POWER_PARTS.landerSolar.name, m: (POWER_PARTS.landerSolar.priceUsd.v / 1e6) * rm('spacecraft'), ids: [] as string[] }] : []),
    ...sp.fixes.filter((f) => f !== 'spareSeal').map((f) => ({ label: FIXES[f].name, m: FIXES[f].costUsd.v / 1e6, ids: [] as string[] })),
  ];
  const costM = costLines.reduce((s, l) => s + l.m, 0);

  // ------------------------------------------------------------ capsule burns (spec tab 6 #8)
  const isp = cap.veMs.v / K.G0;
  const burns: BurnPlan[] = [];
  let m = artemis ? csmWetKg : csmWetKg + landerWetKg; // Apollo-style: the capsule pushes the lander too
  const burn = (name: string, v: number) => { const p = propellantForDv(m, v, isp); burns.push({ name, dv: v, m0: m, propKg: p }); m -= p; };
  burn('Lunar orbit insertion', dv.loi);
  const loiProp = burns[0].propKg;
  if (lander && !artemis) m -= landerWetKg;
  const samplesPlanned = parts.some((p) => p.id === 'sci_samples') ? (lander?.sampleCapacityKg ?? 0) : 0;
  if (lander) m += samplesPlanned; // landing crew goes down and comes back: net zero; rocks come home
  const teiMass = m;
  burn('Trans-Earth injection', dv.tei);
  const requiredKg = burns.reduce((s, b) => s + b.propKg, 0);
  const marginKg = smPropKg - requiredKg;
  const leftAfterLoi = smPropKg - loiProp;
  const returnDvLeft = leftAfterLoi > 0 ? dvVe(cap.veMs.v, teiMass, teiMass - Math.min(leftAfterLoi, teiMass - 1)) : 0;
  const capsuleReturn = { usedInKg: loiProp, leftKg: leftAfterLoi, dvLeft: returnDvLeft, need: dv.tei, pass: leftAfterLoi >= 0 && returnDvLeft >= dv.tei };

  // ------------------------------------------------------------ lander (spec tab 6 #9)
  let landerStats = base.lander;
  let landerSpec: SpecStats['lander'] = null;
  if (lander) {
    const li = lander.ispS!;
    const arrivalPropKg = artemis ? propellantForDv(landerWetKg, dv.landerArrival, li) : 0; // uncrewed trip into NRHO
    const descentProp = lander.descentPropKg! - arrivalPropKg;
    const m0 = landerWetKg - arrivalPropKg + landingCrew * K.CREW_MASS_KG;
    const descentDvAvail = descentProp > 0 ? dvVe(li * K.G0, m0, m0 - descentProp) : 0;
    const brakeProp = propellantForDv(m0, dv.descent - K.DV_FINAL_APPROACH, li);
    const approachPropKg = descentProp - brakeProp;
    const sampleCap = samplesPlanned;
    const m0a = lander.ascentDryKg! + lander.ascentPropKg! + landingCrew * K.CREW_MASS_KG + sampleCap;
    const ascentDvAvail = dvVe(li * K.G0, m0a, m0a - lander.ascentPropKg!);
    const site = SITE_BY_ID[plan.site];
    const instW = parts.filter((p) => p.onLander && p.powerW && p.slot === 'science').reduce((s, p) => s + p.powerW!, 0);
    const grossLoadW = (lander.landerLoadW ?? 0) + site.landerHeaterW + instW;
    const solarW = solarOn ? POWER_PARTS.landerSolar.powerW.v : 0; // lunar daylight landing
    const netLoadW = Math.max(0, grossLoadW - solarW);
    const batteryWh = (isSpecLander ? 0 : lander.landerBatteryWh ?? 0) + packs * POWER_PARTS.liionPack.storesWh.v;
    const consumableH = lander.stayRatedH! * ((lander.crewCapacity ?? 2) / Math.max(1, landingCrew));
    const batteryH = netLoadW > 0 ? batteryWh / netLoadW : Infinity;
    landerStats = {
      present: true, crewCapacity: lander.crewCapacity!, descentDvAvail, descentDvReq: dv.descent, ascentDvAvail, ascentDvReq: dv.ascent,
      approachPropKg, stayCapacityH: Math.min(consumableH, batteryH), plannedStayH: plan.stayDays * 24, sampleCapacityKg: sampleCap,
      landerLoadW: netLoadW, surfacePayloadKg, batteryWh,
    };
    landerSpec = {
      arrivalPropKg,
      moonTwrDescent: moonTwr(lander.thrustN!, m0),
      moonTwrAscent: moonTwr(lander.ascentThrustN ?? lander.thrustN!, m0a),
      batteryWh, solarW, grossLoadW,
    };
  }

  // ------------------------------------------------------------ power (spec tab 6 #11)
  const loadLines = [...base.power.loadLines.filter((l) => !l.ids.some((id) => CAPSULE_OWNED_SLOTS.includes(base.parts.find((p) => p.id === id)?.slot ?? ''))),
    ...small.filter((x) => x.w > 0).map((x) => ({ label: x.label, w: x.w, ids: [] as string[] }))];
  const nominalLoadW = loadLines.reduce((s, l) => s + l.w, 0);
  const peakLoadW = nominalLoadW + base.power.instrumentW;
  const slotKind = pwr?.genKind ?? 'none';
  const slotW = pwr?.genW ?? 0;
  const builtinW = cap.solarW.v;
  const solarW = (slotKind === 'solar' ? slotW : 0) + builtinW;
  const genKind: DesignStats['power']['genKind'] = slotKind === 'fuelcell' ? 'fuelcell' : solarW > 0 ? 'solar' : 'none';
  const genW = genKind === 'fuelcell' ? slotW : solarW;
  const builtinSolarW = genKind === 'fuelcell' ? builtinW : 0; // extra solar on top of fuel cells
  const sun = orbit.sunFraction.v;
  const orbitAvgGenW = genKind === 'fuelcell' ? slotW + builtinSolarW * sun : solarW * sun;
  const darkH = orbit.periodH.v * (1 - sun);
  const eclipseWh = solarW > 0 ? peakLoadW * darkH : 0;
  const missionEnergyWh = nominalLoadW * missionDays * 24;

  // ------------------------------------------------------------ comms / data (spec tab 6 #12)
  const mbps = base.comms.mbps;
  const orbitH = orbit.waitDays.v * 24 + 12;
  const estOrbitDownlinkMB = mbps * base.comms.availability * orbit.contactFraction.v * orbitH * K.HOUR / 8;
  const downMbPerDay = mbPerDay(mbps * 1000, orbit.contactFraction.v) * base.comms.availability;
  const needMbPerDay = MISSION_BASE_MB_PER_DAY.v + parts.reduce((s, p) => s + (p.dataMBPerDay ?? 0), 0);

  // ------------------------------------------------------------ heat shield (spec tab 6 #14)
  const health = shieldHealth(cap.shieldMph.v);
  const entryMassKg = lbToKg(cap.cmLb.v) + crew * K.CREW_MASS_KG + samplesPlanned;

  const thrusterCount = thr ? sp.thrusterCount : 0;
  const specStats: SpecStats = {
    spec: sp,
    capsule: { id: cap.id, name: cap.name, crew: cap.crew.v, maxDays: cap.maxDays.v, ve: cap.veMs.v, dryKg: capDryKg, propKg: smPropKg, shieldMph: cap.shieldMph.v, solarW: builtinW },
    orbit, launches, rocket, rocketCapacityKg, rocketBuild: build, capsuleReturn,
    lander: landerSpec,
    dockingOk: !lander || (sp.docking.includes('dock_nds') && sp.docking.includes('dock_lidar')),
    thrusterCount, thrustersOk: thrusterCount >= MIN_THRUSTERS.v,
    rcs: (() => {
      const dockings = lander ? 2 : 0; // Apollo: transposition + rendezvous; Artemis: dock in NRHO + rendezvous
      const perDockingKg = lbToKg(DOCKING_FUEL_LB.v);
      return { tankGal: ttank?.gallons.v ?? 0, fuelKg: rcsFuelKg, perDockingKg, dockings, plannedKg: dockings * perDockingKg, ok: rcsFuelKg >= dockings * perDockingKg };
    })(),
    shieldHealth: health,
    data: { mbPerDay: downMbPerDay, needMbPerDay },
    risks, tankRisk: tankRisk(risks),
    science: (() => {
      // planned points if every instrument is used (spec tab 4); surface points scale with the site
      const mult = SITE_BY_ID[plan.site].scienceMult;
      const lines = parts.filter((p) => p.slot === 'science').map((p) => {
        const spec = INSTRUMENTS.find((i) => i.id === p.id);
        const orbital = p.id === 'sci_mapcam' ? 25 : p.id === 'sci_neutron' ? 10 * mult : 0;
        return { id: p.id, points: spec ? (lander ? spec.points.v * mult : 0) : orbital };
      });
      const roleMult = scienceMult(sp.role); // Science & Comms Lead: +20%
      return { plannedPoints: lines.reduce((a, l) => a + l.points, 0) * roleMult, target: SCIENCE_TARGET_POINTS.v, lines };
    })(),
    padDelayDays: sp.fixes.includes('leakCheck') ? FIXES.leakCheck.padDays!.v : 0,
    budgetM: budgetForM(d),
  };

  return {
    ...base,
    parts, missing, crew, landingCrew, orbitCrew, missionDays, consumableDays, consumables,
    mass: { csmDryKg, csmWetKg, smPropKg, landerWetKg, tliKg, lines },
    costM, costLines,
    power: {
      ...base.power, genW, genKind, builtinSolarW, nominalLoadW, peakLoadW, orbitAvgGenW, eclipseWh,
      safeModeH: base.power.batteryWh / K.SAFE_MODE_LOAD_W, missionEnergyWh, loadLines,
    },
    thermal: { ...base.thermal, heatPeakW: peakLoadW + crew * K.METABOLIC_HEAT_W, heatNominalW: nominalLoadW + crew * K.METABOLIC_HEAT_W },
    comms: { ...base.comms, estOrbitDownlinkMB },
    propulsion: { ispS: isp, capacityKg: smPropKg, burns, requiredKg, marginKg, marginPct: smPropKg > 0 ? marginKg / smPropKg : -1, dvRequired: dv.loi + dv.tei, dvAvailable: dv.loi + returnDvLeft },
    lander: landerStats,
    heatShield: { rating: health, entryMassKg, effectiveMargin: health },
    lv: { capacityKg: rocketCapacityKg, marginKg: rocketCapacityKg - tliKg, marginPct: rocketCapacityKg > 0 ? (rocketCapacityKg - tliKg) / rocketCapacityKg : -1 },
    spec: specStats,
  };
}
