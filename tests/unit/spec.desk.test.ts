/** Calculation Desk (JOSEPH_SPEC tab 6): sheets 1, 2, 4, 5, 6, 10 and the Final Results board. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { SLS_LIKE } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { buildSheets, checkAnswer, evalExpr, resultsBoard, warmer } from '../../src/simulation/calcDesk';
import { kgToLb } from '../../src/simulation/units';

const near = (a: number, b: number, tol = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * tol + 1e-9);
const sheetsFor = (d = REFERENCE_DESIGN) => { const s = analyzeDesign(d); return { s, sheets: buildSheets(d, s) }; };
const last = (id: string, d = REFERENCE_DESIGN) => { const sh = sheetsFor(d).sheets.find((x) => x.id === id)!; return sh.steps[sh.steps.length - 1].expect; };

describe('desk sheets', () => {
  it('builds sheets 1, 2, 4, 5, 6 and 10, each with the formula, the player\'s numbers and a target', () => {
    const { sheets } = sheetsFor();
    expect(sheets.map((x) => x.n)).toEqual([1, 2, 4, 5, 6, 10]);
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
    expect(board.map((b) => b.section)).toEqual(['ROCKET', 'SPEED', 'MOON BURNS', 'CREW SUPPLIES', 'POWER, DATA, SIGNAL', 'HEAT SHIELD + MONEY']);
    expect(board.flatMap((b) => b.rows).length).toBeGreaterThan(12);
  });
});
