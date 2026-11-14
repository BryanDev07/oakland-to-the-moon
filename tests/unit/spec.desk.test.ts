/** Calculation Desk (JOSEPH_SPEC tab 6): sheets 1, 2, 4, 5, 6, 10 and the Final Results board. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { SLS_LIKE } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { buildSheets, capsuleBurnMath, checkAnswer, dataMath, deadWeightShares, evalExpr, keptShellDv, landerBurnMath, powerMath, resultsBoard, shieldMath, signalRow, suggestFuel, warmer, withStageFuel } from '../../src/simulation/calcDesk';
import { kgToLb } from '../../src/simulation/units';

const near = (a: number, b: number, tol = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * tol + 1e-9);
const sheetsFor = (d = REFERENCE_DESIGN) => { const s = analyzeDesign(d); return { s, sheets: buildSheets(d, s) }; };
const last = (id: string, d = REFERENCE_DESIGN) => { const sh = sheetsFor(d).sheets.find((x) => x.id === id)!; return sh.steps[sh.steps.length - 1].expect; };

describe('desk sheets', () => {
  it('builds all 15 sheets, each with the formula, the player\'s numbers and a target', () => {
    const { sheets } = sheetsFor();
    expect(sheets.map((x) => x.n)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    // spec: 3, 10 and 13 are player-solved; 7, 8, 9, 11, 12, 14, 15 are game-solved
    for (const n of [3, 10, 13]) expect(sheets.find((x) => x.n === n)!.game).toBeFalsy();
    for (const n of [7, 8, 9, 11, 12, 14, 15]) expect(sheets.find((x) => x.n === n)!.game).toBe(true);
    for (const x of sheets) { expect(x.formula.length).toBeGreaterThan(5); expect(x.given.length).toBeGreaterThan(0); expect(x.steps.length).toBeGreaterThan(0); expect(x.target.length).toBeGreaterThan(5); }
  });
  it('the answers match the game\'s own physics (within the desk\'s rounding)', () => {
    const { s } = sheetsFor();
    const R = s.spec!.rocket;
    near(last('liftoff'), kgToLb(R.liftoffKg));
    expect(Math.abs(last('twr') - R.twr)).toBeLessThan(0.01);
    near(last('moon'), R.dvTotal);
  });
  it('PART C numbers on the SLS-like build carrying 63,400 lb come out on the sheets', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, rocket: SLS_LIKE };
    const sh = buildSheets(d, analyzeDesign(d)); // the payload is the design's stack; check the rocket-only numbers
    const liftoff = sh.find((x) => x.id === 'liftoff')!;
    expect(liftoff.steps[0].expect).toBe(70_929); // stage 2 full = 65,000 fuel + 5,929 empty
    expect(liftoff.steps[1].expect).toBe(2_355_250); // stage 1 full
    expect(liftoff.steps[2].expect).toBe(3_200_000); // 2 boosters
    const twr = sh.find((x) => x.id === 'twr')!;
    expect(twr.steps[0].expect).toBe(39_440_000); // total push
  });
  it('supplies sheet uses 2.0 / 5.5 / 2.2 / 5.27 lb per astronaut per day', () => {
    const { s, sheets } = sheetsFor();
    const sh = sheets.find((x) => x.id === 'supplies')!;
    const cd = s.crew * s.missionDays;
    near(sh.steps[0].expect, cd * 2.0); near(sh.steps[3].expect, cd * 5.27); near(sh.steps[4].expect, cd * 14.97);
  });
  it('sheet 6 says how far short you are and points at the part to change (Easy)', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = 'bayhawk';
    const v = sheetsFor(d).sheets.find((x) => x.id === 'moon')!.verdict();
    expect(v.pass).toBe(false);
    expect(v.text).toMatch(/m\/s short/);
    expect(v.pointer).toMatch(/stage 2 fuel/);
  });
});

describe('desk checking and calculator', () => {
  it('accepts answers within ±1% (±0.01 for TWR and ln)', () => {
    const pct = { label: '', expect: 1000, unit: 'lb', why: '' };
    expect(checkAnswer(pct, 1009)).toBe(true); expect(checkAnswer(pct, 1011)).toBe(false);
    const abs = { label: '', expect: 1.56, unit: '', abs: 0.01, why: '' };
    expect(checkAnswer(abs, 1.565)).toBe(true); expect(checkAnswer(abs, 1.58)).toBe(false);
    expect(checkAnswer(pct, NaN)).toBe(false);
    expect(warmer(pct, 900)).toMatch(/low/);
  });
  it('the calculator handles + - x / with x and / first, and commas', () => {
    expect(evalExpr('2+3x4')).toBe(14);
    expect(evalExpr('5,689,579x4.448')).toBeCloseTo(25_307_247.4, 1);
    expect(evalExpr('39440000/25307247')).toBeCloseTo(1.5585, 3);
    expect(evalExpr('-3+5')).toBe(2);
    expect(evalExpr('2++')).toBeNaN();
    expect(evalExpr('')).toBeNaN();
  });
  it('the Final Results board covers rocket, speed, Moon burns, supplies, power/data/signal, shield and money', () => {
    const { s } = sheetsFor();
    const board = resultsBoard(REFERENCE_DESIGN, s);
    expect(board.map((b) => b.section)).toEqual(['ROCKET', 'SPEED', 'FUEL (YOURS VS SUGGESTED)', 'MOON BURNS', 'CREW SUPPLIES', 'POWER AND DATA', 'SIGNAL', 'HEAT SHIELD', 'MONEY']);
    expect(board.flatMap((b) => b.rows).length).toBeGreaterThan(12);
  });
});

describe('PART C on the desk sheets', () => {
  it('sheet 3 (#1, #2, #11, #12): empty stages, dead-weight share, the kept-shell speed', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, rocket: SLS_LIKE };
    const sh = buildSheets(d, analyzeDesign(d)).find((x) => x.n === 3)!;
    near(sh.steps[0].expect, 174_150); // 0.054 x 1.5 x 2,150,000
    near(sh.steps[1].expect, 205_250); // + 4 x 7,775
    const w = deadWeightShares(205_250, 2_150_000, 63_400 + 70_929);
    expect(Math.abs(w.ignition - 0.08)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(w.burnout - 0.60)).toBeLessThanOrEqual(0.01);
    near(keptShellDv(4_530, 134_329, 69_329, 205_250), 960);
    near(0.054 * 1.5 * 65_000 + 664, 5_929); // #1, stage 2 the same way
  });
  it('sheet 7 (#13, #14): suggested fuel, "no amount works", and Use this', () => {
    const r = suggestFuel(5_400, 3_050, 0.065, 26_455);
    near(r.R, 5.87); near(r.suggested, 188_700, 0.01);
    expect(suggestFuel(9_000, 3_050, 0.065, 26_455).impossible).toBe(true);
    // Use this on a rocket that falls short brings it to the Moon
    let d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = 'bayhawk';
    const before = analyzeDesign(d).spec!.rocket.dvTotal;
    for (let i = 0; i < 4; i++) {
      const sh = buildSheets(d, analyzeDesign(d)).find((x) => x.n === 7)!;
      const a = sh.actions!.find((x) => x.label.includes('S2'));
      if (!a) break;
      d = a.apply(d);
    }
    const after = analyzeDesign(d).spec!.rocket;
    expect(after.dvTotal).toBeGreaterThan(before);
    expect(after.reachesMoon).toBe(true);
    expect(withStageFuel(d, 1, 123_000).spec!.rocket!.stage1.fuelLb).toBe(123_000);
  });
  it('sheet 8 (#15, #16): Orion in the halo orbit gets home; in low orbit it is stuck', () => {
    const halo = capsuleBurnMath(57_200, 19_000, 3_100, 430, 410);
    near(halo.used, 7_410); near(halo.left, 11_590); near(halo.dvLeft, 820); expect(halo.pass).toBe(true);
    const low = capsuleBurnMath(57_200, 19_000, 3_100, 900, 900);
    near(low.used, 14_410); near(low.left, 4_590); near(low.dvLeft, 350); expect(low.pass).toBe(false);
    const { s, sheets } = sheetsFor();
    near(sheets.find((x) => x.n === 8)!.steps[3].expect, s.spec!.capsuleReturn.dvLeft); // same as the game's analysis
  });
  it('sheet 9 (#17, #18, #19): Apollo LM lifting off, its Moon TWR, and no landing from the halo orbit', () => {
    const up = landerBurnMath(11_200, 6_013, 3_050, 1_870, 15_570);
    near(up.dv, 1_898); expect(up.pass).toBe(true); near(up.twrMoon, 1.89);
    expect(landerBurnMath(11_350, 6_163, 3_050, 1_870, 15_570).pass).toBe(false);
    expect(landerBurnMath(33_083 + 800, 33_083 + 800 - 18_000, 3_050, 2_600, 45_040).pass).toBe(false);
    const { s, sheets } = sheetsFor();
    near(sheets.find((x) => x.n === 9)!.steps[0].expect, s.lander.descentDvAvail);
  });
  it('sheet 11 (#21, #22): power made and the surface battery in packs', () => {
    const p = powerMath(11_000, 0.99, 3_482, 0, 0, 1_200, 48);
    near(p.made, 10_890); expect(p.pass).toBe(true);
    near(p.surfaceWh, 69_120); expect(p.packs).toBe(14);
  });
  it('sheet 12 (#23): data per day', () => {
    near(dataMath(256, 1, 0).mb, 2_765); near(dataMath(256, 0.63, 0).mb, 1_742);
  });
  it('sheet 13 (#24): the desk picks the right distance and the delay is 1.28 s', () => {
    expect(signalRow('LLO').miles.v).toBe(238_855);
    expect(signalRow('NRHO').miles.v).toBe(282_000);
    const sh = sheetsFor().sheets.find((x) => x.n === 13)!;
    expect(Math.abs(sh.steps[0].expect - 1.28)).toBeLessThanOrEqual(0.01);
  });
  it('sheet 14 (#25): shield health 100% safe for Orion, about 72% burn-through for the Budget capsule', () => {
    expect(shieldMath(25_000)).toEqual({ health: 100, result: 'safe' });
    const b = shieldMath(17_500); near(b.health, 72, 0.01); expect(b.result).toBe('burn-through');
  });
});
