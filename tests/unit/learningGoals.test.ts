/** D1: eight learning goals with examples built from the player's real numbers. */
import { describe, expect, it } from 'vitest';
import { cloneDesign, REFERENCE_DESIGN } from '../../src/data/mission';
import { createMission } from '../../src/simulation/mission';
import { evaluate } from '../../src/simulation/scoring';
import { goalExamples, LEARNING_GOALS, WHAT_YOULL_LEARN } from '../../src/data/learningGoals';

describe('learning goals', () => {
  it('there are eight, each with where it is taught', () => {
    expect(LEARNING_GOALS.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const g of LEARNING_GOALS) expect(g.taughtAt.length).toBeGreaterThan(5);
    expect(WHAT_YOULL_LEARN).toMatch(/^What you'll learn: start from the goal; weight is everything;/);
  });
  it('every goal has a one-sentence example with the player\'s own numbers', () => {
    const s = createMission(cloneDesign(REFERENCE_DESIGN), 221);
    const ex = goalExamples(s, evaluate(s));
    expect(Object.keys(ex)).toHaveLength(8);
    for (const [k, v] of Object.entries(ex)) { if (k !== 'pressure') expect(v).toMatch(/\d/); expect(v.split('. ').length).toBeLessThanOrEqual(2); }
    expect(ex.pressure).toBe('No emergency needed a call this time.'); // a fresh mission has no calls yet
    expect(ex.weight).toMatch(/^Dropping stage 1 saved about [\d,]+ m\/s\.$/);
    expect(ex.far).toBe('Messages took 1.28 s each way.');
    expect(ex.margins).toMatch(/^Your thinnest margin was rocket speed: 1%\.$/);
  });
});
