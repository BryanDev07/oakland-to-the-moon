/**
 * Spacecraft design analysis: turns a Design (component choices + mission plan) into
 * engineering figures. Pure functions, no Phaser. All units SI unless noted.
 */
import { COMPONENT_BY_ID, Component } from '../data/components';
import { Design, LV_BY_ID, SITE_BY_ID, TEMPO_BY_ID } from '../data/mission';
import * as K from './constants';
import { deltaV, propellantForDv } from './rocket';
import { analyzeSpec, type SpecStats } from './specModel';

export interface MassLine { label: string; kg: number; ids: string[] }
export interface BurnPlan { name: string; dv: number; m0: number; propKg: number }

export interface DesignStats {
  parts: Component[];
  missing: string[];
  crew: number; landingCrew: number; orbitCrew: number;
  missionDays: number; consumableDays: number;
  consumables: { o2Kg: number; waterKg: number; foodKg: number; totalKg: number };
  mass: { csmDryKg: number; csmWetKg: number; smPropKg: number; landerWetKg: number; tliKg: number; lines: MassLine[] };
  costM: number; costLines: { label: string; m: number; ids: string[] }[];
  power: {
    genW: number; genKind: 'solar' | 'fuelcell' | 'none';
    nominalLoadW: number; peakLoadW: number; instrumentW: number;
    orbitAvgGenW: number; eclipseWh: number; batteryWh: number; safeModeH: number;
    missionEnergyWh: number; reactantWh: number;
    builtinSolarW?: number; // spec: capsule solar added on top of fuel cells
    loadLines: { label: string; w: number; ids: string[] }[];
  };
  thermal: { heatPeakW: number; heatNominalW: number; rejectW: number };
  comms: { mbps: number; availability: number; backupMbps: number; storageMB: number; estOrbitDownlinkMB: number; estOrbitDataMB: number };
  propulsion: { ispS: number; capacityKg: number; burns: BurnPlan[]; requiredKg: number; marginKg: number; marginPct: number; dvRequired: number; dvAvailable: number };
  lander: {
    present: boolean; crewCapacity: number; descentDvAvail: number; descentDvReq: number; ascentDvAvail: number; ascentDvReq: number;
    approachPropKg: number; stayCapacityH: number; plannedStayH: number; sampleCapacityKg: number; landerLoadW: number; surfacePayloadKg: number;
    batteryWh?: number; // spec: lander surface battery (5 kWh packs)
  };
  heatShield: { rating: number; entryMassKg: number; effectiveMargin: number };
  reliability: number;
  lv: { capacityKg: number; marginKg: number; marginPct: number };
  scienceIds: string[];
  spec?: SpecStats; // JOSEPH_SPEC model figures (rocket, capsule, orbit, risks)
}

export function selectedParts(d: Design): Component[] {
  const ids = [...Object.values(d.slots).filter(Boolean) as string[], ...d.safety, ...d.science];
  return ids.map((id) => COMPONENT_BY_ID[id]).filter(Boolean);
}

const REQUIRED_SLOTS = ['propulsion', 'tank', 'lander', 'power', 'battery', 'comms', 'storage', 'lifeSupport', 'thermal', 'heatShield', 'guidance'];

export function analyzeDesign(d: Design): DesignStats {
  const parts = selectedParts(d);
  const get = (slot: string) => (d.slots[slot] ? COMPONENT_BY_ID[d.slots[slot] as string] : undefined);
  const missing = REQUIRED_SLOTS.filter((s) => !get(s));
  const eng = get('propulsion'), tank = get('tank'), lander = get('lander'), pwr = get('power'), bat = get('battery');
  const com = get('comms'), dat = get('storage'), ls = get('lifeSupport'), thr = get('thermal'), hs = get('heatShield');
  const plan = d.plan;
  const site = SITE_BY_ID[plan.site], lv = LV_BY_ID[plan.lv], tempo = TEMPO_BY_ID[plan.tempo];

  // ---------------------------------------------------------------- crew & duration
  const crew = plan.crew;
  const landingCrew = lander ? Math.min(crew - 1, lander.crewCapacity ?? 2) : 0;
  const orbitCrew = crew - landingCrew;
  const missionDays = K.TRANSIT_OUT_S / K.DAY + plan.lunarOrbitDays + plan.stayDays + 0.5 + K.TRANSIT_BACK_S / K.DAY;
  const consumableDays = missionDays + tempo.reserveDays;
  const wr = ls?.waterRecovery ?? 0, orr = ls?.o2Recovery ?? 0;
  const o2Kg = crew * consumableDays * K.O2_KG_PER_CREW_DAY * (1 - orr);
  const waterKg = crew * consumableDays * K.WATER_KG_PER_CREW_DAY * (1 - wr);
  const foodKg = crew * consumableDays * K.FOOD_KG_PER_CREW_DAY;
  const consumables = { o2Kg, waterKg, foodKg, totalKg: o2Kg + waterKg + foodKg };

  // ---------------------------------------------------------------- mass
  const csmParts = parts.filter((p) => p.slot !== 'lander' && p.slot !== 'tank' && !p.onLander);
  const landerPayload = parts.filter((p) => p.onLander);
  const surfacePayloadKg = landerPayload.reduce((s, p) => s + p.massKg, 0);
  const smPropKg = tank?.propCapacityKg ?? 0;
  const lines: MassLine[] = [
    { label: 'Crew capsule (structure)', kg: K.CAPSULE_DRY_KG, ids: [] },
    { label: `Crew x${crew} + suits`, kg: crew * K.CREW_MASS_KG, ids: [] },
    { label: 'Consumables (O2, water, food)', kg: consumables.totalKg, ids: ls ? [ls.id] : [] },
    { label: 'Service module structure', kg: K.SM_STRUCTURE_KG, ids: [] },
    ...csmParts.map((p) => ({ label: p.name, kg: p.massKg, ids: [p.id] })),
    ...(tank ? [{ label: `${tank.name} (dry)`, kg: tank.massKg, ids: [tank.id] }, { label: 'SM propellant', kg: smPropKg, ids: [tank.id] }] : []),
  ];
  const csmWetKg = lines.reduce((s, l) => s + l.kg, 0);
  const csmDryKg = csmWetKg - smPropKg;
  const landerWetKg = lander ? (lander.descentDryKg! + lander.descentPropKg! + lander.ascentDryKg! + lander.ascentPropKg! + surfacePayloadKg) : 0;
  if (lander) lines.push({ label: `${lander.name} (fuelled + payload)`, kg: landerWetKg, ids: [lander.id, ...landerPayload.map((p) => p.id)] });
  const tliKg = csmWetKg + landerWetKg;

  // ---------------------------------------------------------------- cost
  const costLines = [
    { label: 'Capsule program', m: K.CAPSULE_COST_M, ids: [] as string[] },
    { label: 'Service module', m: K.SM_BASE_COST_M, ids: [] as string[] },
    { label: lv.name, m: lv.costM, ids: [] as string[] },
    { label: 'Mission operations', m: Math.round(missionDays * K.OPS_COST_M_PER_DAY), ids: [] as string[] },
    ...parts.map((p) => ({ label: p.name, m: p.costM, ids: [p.id] })),
  ];
  const costM = costLines.reduce((s, l) => s + l.m, 0);

  // ---------------------------------------------------------------- power
  const loadLines = [
    { label: 'Avionics & cabin', w: K.BASE_LOAD_W, ids: [] as string[] },
    { label: `Crew systems x${crew}`, w: K.CREW_LOAD_W * crew, ids: [] as string[] },
    { label: 'Thermal heaters', w: K.HEATER_LOAD_W, ids: [] as string[] },
    ...parts.filter((p) => p.powerW && !p.onLander && p.slot !== 'science').map((p) => ({ label: p.name, w: p.powerW!, ids: [p.id] })),
  ];
  const nominalLoadW = loadLines.reduce((s, l) => s + l.w, 0);
  const instruments = parts.filter((p) => p.slot === 'science' && !p.onLander && p.powerW);
  const instrumentW = instruments.reduce((s, p) => s + p.powerW!, 0);
  const peakLoadW = nominalLoadW + instrumentW;
  const genW = pwr?.genW ?? 0;
  const genKind = pwr?.genKind ?? 'none';
  const orbitAvgGenW = genKind === 'solar' ? genW * (1 - K.LLO_SHADOW_FRACTION) : genW;
  const eclipseWh = genKind === 'solar' ? peakLoadW * (K.LLO_PERIOD_S * K.LLO_SHADOW_FRACTION) / K.HOUR : 0;
  const batteryWh = bat?.storageWh ?? 0;
  const safeModeH = batteryWh / K.SAFE_MODE_LOAD_W;
  const missionEnergyWh = nominalLoadW * missionDays * 24;
  const reactantWh = pwr?.fuelCellReactantWh ?? 0;

  // ---------------------------------------------------------------- thermal
  const metabolic = crew * K.METABOLIC_HEAT_W;
  const thermal = { heatPeakW: peakLoadW + metabolic, heatNominalW: nominalLoadW + metabolic, rejectW: thr?.heatRejectW ?? 0 };

  // ---------------------------------------------------------------- comms / data
  const mbps = com?.downlinkMbps ?? 0;
  const availability = com?.linkAvailability ?? 0;
  const storageMB = dat?.storageMB ?? 0;
  const orbitH = plan.lunarOrbitDays * 24 + 12; // planned pre-descent + post-ascent orbit time
  const estOrbitDownlinkMB = mbps * availability * (1 - K.LLO_LOS_FRACTION) * orbitH * K.HOUR / 8;
  const hasMapcam = parts.some((p) => p.id === 'sci_mapcam');
  const estOrbitDataMB = hasMapcam ? K.MAPCAM_MAP_TARGET_MB : 0;

  // ---------------------------------------------------------------- propulsion (SM burn sequence)
  const isp = eng?.ispS ?? 300;
  const burns: BurnPlan[] = [];
  let m = tliKg;
  const burn = (name: string, dv: number) => { const p = propellantForDv(m, dv, isp); burns.push({ name, dv, m0: m, propKg: p }); m -= p; };
  burn('Outbound corrections', K.DV_TCM_OUT);
  burn('Lunar orbit insertion', site.dvLoi);
  m -= landerWetKg + landingCrew * K.CREW_MASS_KG; // lander departs with landing crew
  burn('Orbit ops & rendezvous', K.DV_ORBIT_OPS);
  const samplesPlanned = parts.some((p) => p.id === 'sci_samples') ? (lander?.sampleCapacityKg ?? 0) : 0;
  m += landingCrew * K.CREW_MASS_KG + samplesPlanned; // crew + samples return; ascent stage jettisoned
  burn('Trans-Earth injection', site.dvTei);
  burn('Return corrections', K.DV_TCM_BACK);
  const requiredKg = burns.reduce((s, b) => s + b.propKg, 0);
  const marginKg = smPropKg - requiredKg;
  const dvRequired = burns.reduce((s, b) => s + b.dv, 0);
  // Δv available if propellant were spent in the same staging sequence (approximation for display)
  const dvAvailable = dvRequired * (smPropKg / Math.max(1, requiredKg)) ** 0.85;

  // ---------------------------------------------------------------- lander
  let landerStats: DesignStats['lander'] = { present: false, crewCapacity: 0, descentDvAvail: 0, descentDvReq: site.dvDescent, ascentDvAvail: 0, ascentDvReq: K.DV_ASCENT, approachPropKg: 0, stayCapacityH: 0, plannedStayH: plan.stayDays * 24, sampleCapacityKg: 0, landerLoadW: 0, surfacePayloadKg };
  if (lander) {
    const li = lander.ispS!;
    const m0 = landerWetKg + landingCrew * K.CREW_MASS_KG;
    const descentDvAvail = deltaV(li, m0, m0 - lander.descentPropKg!);
    const brake = site.dvDescent - K.DV_FINAL_APPROACH;
    const brakeProp = propellantForDv(m0, brake, li);
    const approachPropKg = lander.descentPropKg! - brakeProp;
    const sampleCap = parts.some((p) => p.id === 'sci_samples') ? lander.sampleCapacityKg! : 0;
    const m0a = lander.ascentDryKg! + lander.ascentPropKg! + landingCrew * K.CREW_MASS_KG + sampleCap;
    const ascentDvAvail = deltaV(li, m0a, m0a - lander.ascentPropKg!);
    const landerLoadW = lander.landerLoadW! + site.landerHeaterW + parts.filter((p) => p.onLander && p.powerW && p.slot === 'science').reduce((s, p) => s + p.powerW!, 0);
    const consumableH = lander.stayRatedH! * ((lander.crewCapacity ?? 2) / Math.max(1, landingCrew));
    const batteryH = lander.landerBatteryWh! / landerLoadW;
    landerStats = { present: true, crewCapacity: lander.crewCapacity!, descentDvAvail, descentDvReq: site.dvDescent, ascentDvAvail, ascentDvReq: K.DV_ASCENT, approachPropKg, stayCapacityH: Math.min(consumableH, batteryH), plannedStayH: plan.stayDays * 24, sampleCapacityKg: sampleCap, landerLoadW, surfacePayloadKg };
  }

  // ---------------------------------------------------------------- heat shield
  const entryMassKg = K.CAPSULE_DRY_KG + (hs?.massKg ?? 0) + crew * K.CREW_MASS_KG + samplesPlanned;
  const rating = hs?.heatShieldMargin ?? 0;
  const effectiveMargin = rating * (8000 / entryMassKg);

  // ---------------------------------------------------------------- reliability
  let reliability = parts.reduce((r, p) => r * (p.reliability ?? 1), 1) * lv.reliability;
  if (parts.some((p) => p.id === 'saf_redund')) reliability = 1 - (1 - reliability) * 0.6;

  const stats: DesignStats = {
    parts, missing, crew, landingCrew, orbitCrew, missionDays, consumableDays, consumables,
    mass: { csmDryKg, csmWetKg, smPropKg, landerWetKg, tliKg, lines },
    costM, costLines,
    power: { genW, genKind, nominalLoadW, peakLoadW, instrumentW, orbitAvgGenW, eclipseWh, batteryWh, safeModeH, missionEnergyWh, reactantWh, loadLines },
    thermal,
    comms: { mbps, availability, backupMbps: com?.backupMbps ?? 0, storageMB, estOrbitDownlinkMB, estOrbitDataMB },
    propulsion: { ispS: isp, capacityKg: smPropKg, burns, requiredKg, marginKg, marginPct: smPropKg > 0 ? marginKg / smPropKg : -1, dvRequired, dvAvailable },
    lander: landerStats,
    heatShield: { rating, entryMassKg, effectiveMargin },
    reliability,
    lv: { capacityKg: lv.tliCapacityKg, marginKg: lv.tliCapacityKg - tliKg, marginPct: (lv.tliCapacityKg - tliKg) / lv.tliCapacityKg },
    scienceIds: d.science.slice(),
  };
  return K.SPEC_MODEL ? analyzeSpec(d, stats) : stats;
}
