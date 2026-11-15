/**
 * C1 (JOSEPH_SPEC_V2): the hangar's Rocket tab, as pure helpers. Engines lock their fuel (spec tab 3
 * section 1): a stage's fuel IS its engine's fuel, so the fuel menu shows the others greyed out with a
 * one-line reason, and picking an engine that burns something else switches the stage's fuel and says so.
 */
import type { Design } from '../data/mission';
import {
  BOOSTER_BY_ID, BOOSTERS, ENGINE_BY_ID, ENGINES, FixId, FuelId, MATERIALS, MaterialId, MIN_LIFTOFF_TWR, MIN_UPPER_TWR, MISSION_DV,
  PROPELLANTS, RocketBuild, ROCKET_PRESETS, StageBuild,
} from '../data/specParts';
import { assessRisks, ActiveRisk } from './stack';
import { analyzeDesign } from './spacecraft';
import { rocketOf, specOf } from './specModel';
import { kgToLb } from './units';

export type StageNo = 1 | 2;
export type PresetId = keyof typeof ROCKET_PRESETS;
const key = (n: StageNo) => (n === 1 ? 'stage1' : 'stage2') as 'stage1' | 'stage2';
const shortName = (engineId: string) => ENGINE_BY_ID[engineId].name.split(' (')[0];

/** Spec rundowns (tab 3 sections 1-4), two sentences each. */
export const RUNDOWN = {
  engine: 'Engines make the push that lifts the rocket off the pad and speeds it up to orbit. More push lifts more weight, and a faster exhaust speed gets more speed out of every pound of fuel.',
  booster: 'Boosters are strap-on rockets that add a huge push for the first two minutes, when the rocket is heaviest. They burn out and fall away, so their empty casings don\'t ride to orbit.',
  material: 'The tank material decides how heavy the empty rocket is, and every pound of empty tank is a pound you can\'t spend on fuel or crew. Lighter materials cost more, and some don\'t get along with certain fuels.',
  fuel: 'The propellant is what the engines burn, and it\'s locked to the engine you picked. Each one trades off exhaust speed, tank size and price.',
};
/** Fuel-amount slider range per stage (lb). */
export const FUEL_RANGE: Record<StageNo, { min: number; max: number; step: number }> = {
  1: { min: 200_000, max: 6_000_000, step: 100_000 },
  2: { min: 20_000, max: 1_500_000, step: 20_000 },
};
export const MAX_ENGINES: Record<StageNo, number> = { 1: 12, 2: 6 };

export const enginesFor = (n: StageNo) => ENGINES.filter((e) => e.stage === n);
export const canPair = (engineId: string, fuel: FuelId) => ENGINE_BY_ID[engineId]?.fuel === fuel;

/** The fuel menu for an engine: only its own fuel is allowed; the rest are greyed with a reason. */
export function fuelChoices(engineId: string): { fuel: FuelId; name: string; allowed: boolean; reason: string }[] {
  const e = ENGINE_BY_ID[engineId];
  return (Object.keys(PROPELLANTS) as FuelId[]).map((f) => ({
    fuel: f, name: PROPELLANTS[f].short, allowed: f === e.fuel,
    reason: f === e.fuel ? `${shortName(engineId)} burns ${PROPELLANTS[f].short}.`
      : f === 'solid' ? 'Solid fuel comes built into boosters.'
      : `${shortName(engineId)} only burns ${PROPELLANTS[e.fuel].short}.`,
  }));
}

const clone = (b: RocketBuild): RocketBuild => JSON.parse(JSON.stringify(b));
const custom = (b: RocketBuild) => (b.name.startsWith('Custom') ? b.name : `Custom (from ${b.name})`);

/** Pick an engine for a stage; if it burns a different fuel, the stage switches fuel and a one-line note says so. */
export function setEngine(b: RocketBuild, n: StageNo, engineId: string): { build: RocketBuild; note: string | null } {
  const out = clone(b), st = out[key(n)];
  const before = ENGINE_BY_ID[st.engine].fuel, after = ENGINE_BY_ID[engineId].fuel;
  st.engine = engineId;
  st.count = Math.max(1, Math.min(MAX_ENGINES[n], st.count));
  out.name = custom(b);
  const note = before !== after ? `Stage ${n} now burns ${PROPELLANTS[after].short}: the ${shortName(engineId)} only burns that.` : null;
  return { build: out, note };
}
export function setCount(b: RocketBuild, n: StageNo, count: number): RocketBuild {
  const out = clone(b); out[key(n)].count = Math.max(1, Math.min(MAX_ENGINES[n], Math.round(count))); out.name = custom(b); return out;
}
export function setMaterial(b: RocketBuild, n: StageNo, m: MaterialId): RocketBuild {
  const out = clone(b); out[key(n)].material = m; out.name = custom(b); return out;
}
export function setFuel(b: RocketBuild, n: StageNo, lb: number): RocketBuild {
  const r = FUEL_RANGE[n], out = clone(b);
  out[key(n)].fuelLb = Math.max(r.min, Math.min(r.max, Math.round(lb / r.step) * r.step));
  out.name = custom(b);
  return out;
}
export function setBoosters(b: RocketBuild, id: string | null, count: number): RocketBuild {
  const out = clone(b);
  out.booster = id;
  out.boosterCount = id ? Math.max(1, Math.min(BOOSTER_BY_ID[id].max, Math.round(count))) : 0;
  out.name = custom(b);
  return out;
}
export const presetBuild = (id: PresetId): RocketBuild => clone(ROCKET_PRESETS[id]);
export const boosterIds = [null, ...BOOSTERS.map((x) => x.id)] as (string | null)[];
export const materialIds = Object.keys(MATERIALS) as MaterialId[];

/** The design's own rocket build (starting from its Mission Plan preset if it has none yet). */
export const buildOf = (d: Design): RocketBuild => clone(rocketOf(d));

/** Risky material + fuel combos touching one stage (plus the rocket-wide hydrogen leak), with their fix. */
export function stageRisks(b: RocketBuild, n: StageNo, fixes: FixId[]): ActiveRisk[] {
  return assessRisks(b, fixes).filter((r) => r.stage === `Stage ${n}` || (r.stage === 'Rocket' && ENGINE_BY_ID[b[key(n)].engine].fuel === 'hydrolox'));
}

/** Live readout at the bottom of the Rocket tab: every number green or red. */
export function rocketReadout(d: Design) {
  const R = analyzeDesign(d).spec!.rocket;
  return {
    liftoffLb: kgToLb(R.liftoffKg), twr: R.twr, twrOk: R.twr >= MIN_LIFTOFF_TWR.v,
    upper: R.upperTwr, upperOk: R.upperTwr >= MIN_UPPER_TWR.v,
    dv: R.dvTotal, dvOk: R.dvTotal >= MISSION_DV.toMoon,
  };
}
export const stageOf = (b: RocketBuild, n: StageNo): StageBuild => b[key(n)];
export const fixesOf = (d: Design): FixId[] => specOf(d).fixes;
