/**
 * JOSEPH_SPEC.md PART C acceptance tests. Tolerance ±0.5% unless noted (spec examples are rounded).
 * The game computes in kg internally; inputs/outputs here are converted to the spec's lb.
 */
import { describe, expect, it } from 'vitest';
import * as F from '../../src/simulation/formulas';
import { analyzeRocket, canBurn, fuelChoices } from '../../src/simulation/stack';
import { kgToLb, lbToKg } from '../../src/simulation/units';
import { LB_TO_N, ORBITS, SLS_LIKE } from '../../src/data/specParts';

const near = (actual: number, expected: number, tol = 0.005) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(Math.abs(expected) * tol, 1e-9));
};
const PAYLOAD_LB = 63_400;
const sls = analyzeRocket(SLS_LIKE, lbToKg(PAYLOAD_LB));
const lb = (kg: number) => kgToLb(kg);

describe('PART C: the SLS-like rocket', () => {
  it('#1 stage 2 empty = 0.054 × 1.5 × 65,000 + 664 = 5,929 lb', () => near(lb(sls.stage2.emptyKg), 5_929));
  it('#2 stage 1 empty = 0.054 × 1.5 × 2,150,000 + 4 × 7,775 = 205,250 lb', () => near(lb(sls.stage1.emptyKg), 205_250));
  it('#3 weight at liftoff = 5,689,579 lb', () => near(lb(sls.liftoffKg), 5_689_579));
  it('#4 total push at liftoff = 39,440,000 N', () => near(sls.pushN, 39_440_000));
  it('#5 weight at liftoff ≈ 25,307,000 N (lb × 4.448)', () => {
    near(lb(sls.liftoffKg) * LB_TO_N, 25_307_000);
    near(sls.liftoffN, 25_307_000);
  });
  it('#6 TWR = 1.56 (±0.01)', () => expect(Math.abs(sls.twr - 1.56)).toBeLessThanOrEqual(0.01));
  it('#7 V boosters ≈ 1,680 m/s (full 5,689,579 / empty 2,909,579)', () => {
    const p = sls.pieces[0];
    near(lb(p.fullKg), 5_689_579); near(lb(p.emptyKg), 2_909_579);
    near(sls.vBoosters, 1_680);
  });
  it('#8 V stage 1 ≈ 7,990 m/s (full 2,489,579 / empty 339,579)', () => {
    const p = sls.pieces[1];
    near(lb(p.fullKg), 2_489_579); near(lb(p.emptyKg), 339_579);
    near(sls.vStage1, 7_990);
  });
  it('#9 V stage 2 ≈ 2,995 m/s (full 134,329 / empty 69,329)', () => {
    const p = sls.pieces[2];
    near(lb(p.fullKg), 134_329); near(lb(p.emptyKg), 69_329);
    near(sls.vStage2, 2_995);
  });
  it('#10 total Δv ≈ 12,665 m/s ≥ 12,600 → pass', () => {
    near(sls.dvTotal, 12_665);
    expect(sls.reachesMoon).toBe(true);
    expect(F.reachesMoon(sls.dvTotal).pass).toBe(true);
  });
  it('#11 dead-weight share at stage 1 ignition / burnout = 8% / 60% (±1 point)', () => {
    expect(Math.abs(sls.deadWeightIgnition - 0.08)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(sls.deadWeightBurnout - 0.60)).toBeLessThanOrEqual(0.01);
  });
  it('#12 stage 2 Δv with stage 1 empty still attached ≈ 960 m/s', () => near(sls.vStage2IfKept, 960));
});

describe('PART C: fuel, capsule and lander formulas', () => {
  it('#13 fuel needed: Δv 5,400, ve 3,050, k 0.065, pushing 26,455 lb → R ≈ 5.87, fuel ≈ 188,700 lb (±1%)', () => {
    const r = F.fuelNeeded(5_400, 3_050, 0.065, 26_455);
    near(r.R, 5.87);
    near(r.fuel, 188_700, 0.01);
    expect(r.impossible).toBe(false);
  });
  it('#14 fuel formula with 1 − k(R − 1) ≤ 0 → impossible', () => {
    const r = F.fuelNeeded(9_000, 3_050, 0.065, 26_455);
    expect(r.bottom).toBeLessThanOrEqual(0);
    expect(r.impossible).toBe(true);
  });
  it('#15 Orion → NRHO: uses ≈ 7,410 lb, leaves ≈ 11,590 lb, ≈ 820 m/s ≥ 410 → pass', () => {
    const r = F.capsuleBurns(57_200, 19_000, 3_100, ORBITS.NRHO.loi.v, ORBITS.NRHO.tei.v);
    near(r.usedIn, 7_410); near(r.left, 11_590); near(r.dvLeft, 820);
    expect(r.pass).toBe(true);
  });
  it('#16 Orion → LLO: uses ≈ 14,410 lb, leaves ≈ 4,590 lb, ≈ 350 m/s < 900 → fail', () => {
    const r = F.capsuleBurns(57_200, 19_000, 3_100, ORBITS.LLO.loi.v, ORBITS.LLO.tei.v);
    near(r.usedIn, 14_410); near(r.left, 4_590); near(r.dvLeft, 350);
    expect(r.pass).toBe(false);
  });
  it('#17 Apollo LM ascent: 11,200 / 6,013 → ≈ 1,898 m/s ≥ 1,870 pass; with 250 lb rocks ≈ 1,862 → fail', () => {
    const up = ORBITS.LLO.up.v;
    const a = F.deltaV(3_050, 11_200, 6_013);
    near(a, 1_898); expect(a >= up).toBe(true);
    const b = F.deltaV(3_050, 11_350, 6_163);
    near(b, 1_862); expect(b >= up).toBe(false);
  });
  it('#18 Apollo LM ascent Moon TWR = 15,570 ÷ (11,200 × 4.448 × 0.165) ≈ 1.89', () => {
    near(15_570 / (11_200 * LB_TO_N * 0.165), 1.89);
    near(F.moonTwr(15_570, lbToKg(11_200)), 1.89);
  });
  it('#19 Apollo LM cannot land from NRHO (needs 2,600 m/s down)', () => {
    // full LM + 2 astronauts; descent burns all 18,000 lb of descent fuel
    const full = 33_083 + 800, empty = full - 18_000;
    const dv = F.deltaV(3_050, full, empty);
    expect(dv).toBeGreaterThan(ORBITS.LLO.down.v); // fine from low orbit
    expect(dv).toBeLessThan(ORBITS.NRHO.down.v); // fails from the halo orbit
  });
  it('#20 supplies for 4 crew × 17.5 days: O₂ 140, drinking 385, hygiene 154, food 369, total ≈ 1,048 lb', () => {
    const s = F.supplies(4, 17.5);
    near(s.oxygen, 140); near(s.drinkingWater, 385); near(s.hygieneWater, 154); near(s.food, 369); near(s.total, 1_048);
  });
  it('#21 power: 11,000 W × 0.99 = 10,890 W made vs 3,482 W used → pass', () => {
    const made = F.powerMade(11_000, ORBITS.NRHO.sunFraction.v);
    near(made, 10_890); expect(made >= 3_482).toBe(true);
  });
  it('#22 surface battery: 1,200 W × 48 h × 1.2 = 69,120 Wh → 14 packs of 5,000 Wh', () => {
    const wh = F.batteryNeededWh(1_200, 48);
    near(wh, 69_120); expect(F.packsNeeded(wh, 5_000)).toBe(14);
  });
  it('#23 data: 256 kbps × 86,400 × 1.0 ÷ 8,000 = 2,765 MB/day (LLO 0.63 → ≈ 1,742)', () => {
    near(F.mbPerDay(256, ORBITS.NRHO.contactFraction.v), 2_765);
    near(F.mbPerDay(256, ORBITS.LLO.contactFraction.v), 1_742);
  });
  it('#24 signal delay: 238,855 ÷ 186,282 = 1.28 s', () => near(F.signalDelayS(238_855), 1.28));
  it('#25 shield health: Orion 25,000 mph = 100% safe; Budget 17,500 mph ≈ 72% fail', () => {
    expect(F.shieldHealth(25_000)).toBe(1); expect(F.shieldResult(F.shieldHealth(25_000))).toBe('safe');
    near(F.shieldHealth(17_500), 0.72, 0.01); expect(F.shieldResult(F.shieldHealth(17_500))).toBe('burnthrough');
  });
  it('#26 budget at $0 or below → launch locked', () => {
    expect(F.launchLocked(F.moneyLeft(100, [60, 40]))).toBe(true);
    expect(F.launchLocked(F.moneyLeft(100, [60, 50]))).toBe(true);
    expect(F.launchLocked(F.moneyLeft(100, [60, 39]))).toBe(false);
  });
  it('#27 engine/fuel lock: RS-25 + kerosene is not selectable', () => {
    expect(canBurn('rs25', 'kerolox')).toBe(false);
    expect(canBurn('rs25', 'hydrolox')).toBe(true);
    const k = fuelChoices('rs25').find((c) => c.fuel === 'kerolox')!;
    expect(k.selectable).toBe(false);
    expect(k.reason).toBe('RS-25 only burns hydrogen + LOX');
  });
});
