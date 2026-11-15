/** B1: five desk sheets; the player adds on 1, 2, 4, 5 only; the PART C numbers come through. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { SLS_LIKE } from '../../src/data/specParts';
import { analyzeDesign } from '../../src/simulation/spacecraft';
import { buildFiveSheets } from '../../src/simulation/deskFive';
import { kgToLb } from '../../src/simulation/units';

const five = (d = REFERENCE_DESIGN) => { const s = analyzeDesign(d); return { s, sheets: buildFiveSheets(d, s) }; };

describe('five desk sheets', () => {
  it('has the five questions, with one player addition on 1, 2, 4 and 5 and none on 3', () => {
    const { sheets } = five();
    expect(sheets.map((x) => x.title)).toEqual(['CAN IT LIFT OFF?', 'CAN IT REACH THE MOON?', 'CAN IT GET THERE AND BACK?', 'CAN THE CREW SURVIVE?', 'CAN WE TALK AND AFFORD IT?']);
    const adds = sheets.map((x) => x.steps.filter((st) => st.kind === 'add'));
    expect(adds.map((a) => a.length)).toEqual([1, 1, 0, 1, 1]);
    expect(adds[0][0].addends!.length).toBe(4); // the 4 weights
    expect(adds[1][0].addends!.length).toBe(3); // the 3 speeds (boosters, stage 1, stage 2)
    expect(adds[3][0].addends!.length).toBe(4); // the 4 supply lines
    expect(adds[4][0].label).toBe('Total spent'); // the receipt
    for (const x of sheets) for (const st of x.steps) if (st.kind !== 'add') expect(st.explain!.length).toBeGreaterThan(5);
  });
  it('every sheet ends with a plain-words PASS or FAIL verdict', () => {
    for (const x of five().sheets) expect(x.verdict().text).toMatch(/^(PASS|FAIL)/);
    const d = cloneDesign(REFERENCE_DESIGN); d.plan.lv = 'bayhawk';
    const v = five(d).sheets[1].verdict();
    expect(v.pass).toBe(false);
    expect(v.text).toMatch(/^FAIL: 12,600 needed, [\d,]+ available\.$/);
  });
  it('the PART C rocket numbers come out on sheets 1 and 2', () => {
    const d = cloneDesign(REFERENCE_DESIGN); d.spec = { ...d.spec, rocket: SLS_LIKE };
    const { s, sheets } = five(d);
    const s1 = sheets[0];
    expect(s1.steps.find((st) => st.label === 'Stage 2 full')!.expect).toBe(70_929);
    expect(s1.steps.find((st) => st.label === 'Stage 1 full')!.expect).toBe(2_355_250);
    expect(s1.steps.find((st) => st.label === 'Total push')!.expect).toBe(39_440_000);
    expect(s1.steps.find((st) => st.label === 'Total push')!.kind).toBe('game'); // only the weights are added by the player
    const total = sheets[1].steps.find((st) => st.kind === 'add')!;
    expect(Math.abs(total.expect - s.spec!.rocket.dvTotal)).toBeLessThan(s.spec!.rocket.dvTotal * 0.005);
    expect(Math.abs(s1.steps.find((st) => st.kind === 'add')!.expect - kgToLb(s.spec!.rocket.liftoffKg))).toBeLessThan(kgToLb(s.spec!.rocket.liftoffKg) * 0.005);
  });
});
