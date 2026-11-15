/**
 * Launch-vehicle analysis from the spec (tab 6, formulas #1-#6): stage empty weights, liftoff
 * weight, thrust-to-weight, the three-piece rocket equation, dead weight, and cost.
 * Masses in kg internally; builds and data are in lb and converted once via units.ts.
 */
import {
  BOOSTER_BY_ID, ENGINE_BY_ID, ENGINES, FIXES, FixId, FuelId, MATERIALS, MIN_LIFTOFF_TWR, MISSION_DV, PROPELLANTS, RISKS, RiskLevel, RiskSpec,
  RocketBuild, StageBuild, THRUSTERS, THRUSTER_TANKS,
} from '../data/specParts';
import { deadWeightShare, deltaV, emptyStage, liftoffWeight, twr, weightN } from './formulas';
import { lbToKg } from './units';

// ---------------------------------------------------------------------------- fuel lock
export const engineFuel = (engineId: string): FuelId => ENGINE_BY_ID[engineId].fuel;
export const canBurn = (engineId: string, fuel: FuelId) => ENGINE_BY_ID[engineId]?.fuel === fuel;
/** Propellant menu for an engine: only its own fuel is selectable; the rest are greyed with a reason. */
export function fuelChoices(engineId: string): { fuel: FuelId; name: string; selectable: boolean; reason: string }[] {
  const e = ENGINE_BY_ID[engineId];
  return (['kerolox', 'methalox', 'hydrolox'] as FuelId[]).map((f) => ({
    fuel: f, name: PROPELLANTS[f].name, selectable: e.fuel === f,
    reason: e.fuel === f ? '' : `${e.name.split(' (')[0]} only burns ${PROPELLANTS[e.fuel].short}`,
  }));
}
export const enginesForStage = (stage: 1 | 2) => ENGINES.filter((e) => e.stage === stage);

// ---------------------------------------------------------------------------- stage + stack
export interface StageStats {
  engine: string; count: number; fuel: FuelId; fuelKg: number; k: number; tankKg: number; enginesKg: number; emptyKg: number; fullKg: number;
  ve: number; thrustN: number; costUsd: number;
}
export function stageStats(s: StageBuild, fixes: FixId[] = []): StageStats {
  const e = ENGINE_BY_ID[s.engine];
  const m = MATERIALS[s.material];
  const fuel = e.fuel;
  const k = m.k.v * PROPELLANTS[fuel].tankMult.v;
  const fuelKg = lbToKg(s.fuelLb);
  const liner = s.material === 'carbon' && fixes.includes('liner') ? FIXES.liner.tankWeightMult!.v : 1;
  const tankKg = k * fuelKg * liner;
  const enginesKg = lbToKg(e.weightLb.v) * s.count;
  const emptyKg = emptyStage(k * liner, fuelKg, enginesKg);
  const price = PROPELLANTS[fuel].priceUsdPerLb?.v ?? 0;
  const costUsd = e.priceUsd.v * s.count + (tankKg / lbToKg(1)) * m.costUsdPerLb.v + s.fuelLb * price;
  return { engine: s.engine, count: s.count, fuel, fuelKg, k, tankKg, enginesKg, emptyKg, fullKg: emptyKg + fuelKg, ve: e.veMs.v, thrustN: e.thrustN.v * s.count, costUsd };
}

export interface StackStats {
  payloadKg: number;
  stage1: StageStats; stage2: StageStats;
  boosters: { id: string; count: number; fullKg: number; fuelKg: number; ve: number; thrustN: number; costUsd: number } | null;
  liftoffKg: number; liftoffN: number; pushN: number; twr: number; liftsOff: boolean;
  pieces: { name: string; fullKg: number; emptyKg: number; ve: number; dv: number }[];
  vBoosters: number; vStage1: number; vStage2: number; dvTotal: number; target: number; spare: number; reachesMoon: boolean;
  deadWeightIgnition: number; deadWeightBurnout: number; vStage2IfKept: number;
  /** A8: stage 2 push / stage 2 starting weight (payload + full stage 2), in N / N. */
  upperTwr: number;
  costUsd: number; costLines: { label: string; usd: number }[];
  pass: boolean;
}

export function analyzeRocket(b: RocketBuild, payloadKg: number, fixes: FixId[] = []): StackStats {
  const s1 = stageStats(b.stage1, fixes), s2 = stageStats(b.stage2, fixes);
  const bs = b.booster && b.boosterCount > 0 ? BOOSTER_BY_ID[b.booster] : null;
  const boosters = bs ? {
    id: bs.id, count: b.boosterCount, fullKg: lbToKg(bs.weightLb.v) * b.boosterCount, fuelKg: lbToKg(bs.fuelLb.v) * b.boosterCount,
    ve: bs.veMs.v, thrustN: bs.thrustN.v * b.boosterCount, costUsd: bs.priceUsd.v * b.boosterCount,
  } : null;
  const liftoffKg = liftoffWeight(payloadKg, s2.fullKg, s1.fullKg, boosters?.fullKg ?? 0);
  const pushN = s1.thrustN + (boosters?.thrustN ?? 0); // stage 2 is not lit at liftoff
  const liftoffN = weightN(liftoffKg);
  const ratio = twr(pushN, liftoffN);
  const pieces: StackStats['pieces'] = [];
  // Boosters first (game simplification: only the boosters' exhaust speed counts in this phase).
  let vBoosters = 0;
  if (boosters) {
    const full = liftoffKg, empty = liftoffKg - boosters.fuelKg;
    vBoosters = deltaV(boosters.ve, full, empty);
    pieces.push({ name: 'Boosters', fullKg: full, emptyKg: empty, ve: boosters.ve, dv: vBoosters });
  }
  const s1Full = liftoffKg - (boosters?.fullKg ?? 0);
  const s1Empty = s1Full - s1.fuelKg;
  const vStage1 = deltaV(s1.ve, s1Full, s1Empty);
  pieces.push({ name: 'Stage 1', fullKg: s1Full, emptyKg: s1Empty, ve: s1.ve, dv: vStage1 });
  const s2Full = payloadKg + s2.fullKg, s2Empty = payloadKg + s2.emptyKg;
  const vStage2 = deltaV(s2.ve, s2Full, s2Empty);
  pieces.push({ name: 'Stage 2', fullKg: s2Full, emptyKg: s2Empty, ve: s2.ve, dv: vStage2 });
  const dvTotal = vBoosters + vStage1 + vStage2;
  const costLines = [
    { label: `Stage 1: ${b.stage1.count} x ${ENGINE_BY_ID[b.stage1.engine].name}, tanks, fuel`, usd: s1.costUsd },
    { label: `Stage 2: ${b.stage2.count} x ${ENGINE_BY_ID[b.stage2.engine].name}, tanks, fuel`, usd: s2.costUsd },
    ...(boosters ? [{ label: `${boosters.count} x ${bs!.name}`, usd: boosters.costUsd }] : []),
  ];
  const costUsd = costLines.reduce((a, l) => a + l.usd, 0);
  const reaches = dvTotal >= MISSION_DV.toMoon;
  const lifts = ratio >= MIN_LIFTOFF_TWR.v;
  return {
    payloadKg, stage1: s1, stage2: s2, boosters, liftoffKg, liftoffN, pushN, twr: ratio, liftsOff: lifts, pieces,
    vBoosters, vStage1, vStage2, dvTotal, target: MISSION_DV.toMoon, spare: dvTotal - MISSION_DV.toMoon, reachesMoon: reaches,
    deadWeightIgnition: deadWeightShare(s1.emptyKg, s1Full),
    deadWeightBurnout: deadWeightShare(s1.emptyKg, s1Empty),
    // What if stage 1's empty shell stayed attached during the stage-2 burn?
    vStage2IfKept: deltaV(s2.ve, s2Full + s1.emptyKg, s2Empty + s1.emptyKg),
    upperTwr: twr(s2.thrustN, weightN(s2Full)),
    costUsd, costLines, pass: reaches && lifts,
  };
}

/** Heaviest payload (kg) this rocket can push to 12,600 m/s while keeping TWR ≥ 1.2. */
export function maxPayloadKg(b: RocketBuild, fixes: FixId[] = []): number {
  if (!analyzeRocket(b, 0, fixes).pass) return 0;
  let lo = 0, hi = 2_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (analyzeRocket(b, mid, fixes).pass) lo = mid; else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------- material + fuel risks
export interface ActiveRisk extends RiskSpec { now: RiskLevel; fixed: boolean; stage: string }
const RANK: Record<RiskLevel, number> = { Low: 0, Medium: 1, High: 2 };
export const maxRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (RANK[a] >= RANK[b] ? a : b);

/** Every risky combo present in the build, with its level after any fixes the player bought. */
export function assessRisks(b: RocketBuild, fixes: FixId[], thruster?: string, thrusterTank?: string): ActiveRisk[] {
  const out: ActiveRisk[] = [];
  const add = (id: string, stage: string) => {
    const r = RISKS[id];
    const fixed = !!r.fixId && fixes.includes(r.fixId) && r.fixId !== 'titaniumTanks';
    out.push({ ...r, now: fixed && r.fixedLevel ? r.fixedLevel : r.level, fixed, stage });
  };
  const stages: [string, StageBuild][] = [['Stage 1', b.stage1], ['Stage 2', b.stage2]];
  let anyH2 = false;
  for (const [name, s] of stages) {
    const fuel = engineFuel(s.engine);
    if (fuel === 'hydrolox') anyH2 = true;
    if (s.material === 'carbon' && fuel === 'hydrolox') add('carbon_h2', name);
    if (s.material === 'carbon' && (fuel === 'kerolox' || fuel === 'methalox')) add('carbon_lox', name);
    if (s.material === 'alli' && fuel === 'hydrolox') add('alli_h2', name);
    if (s.material === 'steel' && fuel === 'methalox') add('steel_ch4', name);
    if (s.material === 'al2219' && fuel === 'kerolox') add('al2219_rp1', name);
  }
  if (anyH2) add('any_h2', 'Rocket');
  if (thruster && THRUSTERS.some((t) => t.id === thruster)) {
    const titanium = !!THRUSTER_TANKS.find((t) => t.id === thrusterTank)?.titanium;
    const r = RISKS.hydrazine;
    out.push({ ...r, now: titanium ? r.fixedLevel! : r.level, fixed: titanium, stage: 'Thrusters' });
  }
  return out;
}

/**
 * Tank / leak risk that feeds the emergency picker: the highest level among the rocket's
 * combos. "Any material + hydrogen" (Medium) outranks "Aluminum-lithium + hydrogen" (Low)
 * until the leak check is bought.
 */
export function tankRisk(risks: ActiveRisk[]): RiskLevel {
  return risks.filter((r) => r.id !== 'hydrazine').reduce<RiskLevel>((a, r) => maxRisk(a, r.now), 'Low');
}
