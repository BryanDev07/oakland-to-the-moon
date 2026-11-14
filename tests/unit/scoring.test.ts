import { describe, expect, it } from 'vitest';
import { createMission, chooseFreeReturn, performEntry } from '../../src/simulation/mission';
import { evaluate, WEIGHTS } from '../../src/simulation/scoring';
import { REFERENCE_DESIGN, cloneDesign } from '../../src/data/mission';
import { coast, flyMission } from './helpers';

describe('scoring', () => {
  it('weights sum to 100%', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('crew loss is never a success and scores low', () => {
    const s = createMission(REFERENCE_DESIGN, 1);
    s.o2Kg = 0.001;
    coast(s);
    const r = evaluate(s);
    expect(r.outcome).toBe('MISSION_LOST');
    expect(r.overall).toBeLessThanOrEqual(30);
    expect(r.failures.length).toBeGreaterThan(0);
  });
  it('a free-return abort is "crew safe" but capped below full success', () => {
    const s = createMission(REFERENCE_DESIGN, 5);
    coast(s); chooseFreeReturn(s); coast(s); performEntry(s);
    const r = evaluate(s);
    expect(r.outcome).toBe('ABORT_SAFE');
    expect(r.overall).toBeLessThanOrEqual(79);
  });
  it('more science instruments can yield more science points', () => {
    const lean = cloneDesign(REFERENCE_DESIGN);
    lean.science = ['sci_samples'];
    const a = evaluate(flyMission(createMission(lean, 31)));
    const b = evaluate(flyMission(createMission(REFERENCE_DESIGN, 31)));
    expect(b.sciencePoints).toBeGreaterThan(a.sciencePoints);
  });
  it('produces recommendations and lessons', () => {
    const r = evaluate(flyMission(createMission(REFERENCE_DESIGN, 12)));
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.lessons.length).toBeGreaterThan(0);
  });
});
